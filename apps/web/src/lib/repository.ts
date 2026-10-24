import { database } from "./db";
import {
  cellSchema,
  datasetSchema,
  type Published,
  type Statement,
  type Row,
  type Cell,
} from "./contracts";
export class ReviewError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function companies(search = "") {
  let query = database()
    .selectFrom("companies")
    .select(["id", "name", "fiscal_year_end_month"]);
  if (search) query = query.where("name", "ilike", `%${search}%`);
  return query.orderBy("name").limit(100).execute();
}
export async function published(
  company: string,
  version?: string,
): Promise<Published> {
  const exists = await database()
    .selectFrom("companies")
    .select("id")
    .where("id", "=", company)
    .executeTakeFirst();
  if (!exists)
    throw new ReviewError(
      "COMPANY_NOT_FOUND",
      "This company is not in the review collection.",
      404,
    );
  let query = database()
    .selectFrom("datasets")
    .select(["datasets.id", "datasets.payload", "datasets.validation"])
    .where("datasets.company_id", "=", company)
    .where("datasets.status", "=", "published");
  if (version) query = query.where("datasets.id", "=", version);
  else
    query = query
      .innerJoin(
        "company_publications",
        "company_publications.dataset_id",
        "datasets.id",
      )
      .where("company_publications.company_id", "=", company);
  const record = await query.executeTakeFirst();
  if (!record)
    throw new ReviewError(
      version ? "DATASET_NOT_FOUND" : "NO_PUBLISHED_DATASET",
      version
        ? "That published dataset version is unavailable."
        : "No reviewed dataset has been published for this company.",
      404,
    );
  const parsed = datasetSchema.safeParse(record.payload);
  if (!parsed.success)
    throw new ReviewError(
      "DATASET_INVALID",
      "The published dataset does not meet the review contract.",
      503,
    );
  const data = parsed.data;
  const localSampleAllowed = process.env.FISCAL_ALLOW_SAMPLE_DATA === "true";
  if (data.kind === "sample" && !localSampleAllowed)
    throw new ReviewError(
      "NO_PUBLISHED_DATASET",
      "No reviewed dataset has been published for this company.",
      404,
    );
  if (
    data.companyId !== company ||
    (data.kind !== "verified" &&
      !(localSampleAllowed && data.kind === "sample"))
  )
    throw new ReviewError(
      "DATASET_INVALID",
      "The published dataset does not meet the review contract.",
      503,
    );
  return { version: record.id, data, validation: record.validation };
}
export async function filings(
  company: string,
  options: {
    search?: string;
    classification?: string;
    year?: string;
    cursor?: string;
    limit: number;
  },
) {
  let query = database()
    .selectFrom("filings")
    .select([
      "id",
      "title",
      "source_url",
      "classification",
      "published_on",
      "sha256",
    ])
    .where("company_id", "=", company);
  if (options.search)
    query = query.where("title", "ilike", `%${options.search}%`);
  if (options.classification)
    query = query.where("classification", "=", options.classification);
  if (options.year)
    query = query
      .where("published_on", ">=", `${options.year}-01-01`)
      .where("published_on", "<=", `${options.year}-12-31`);
  if (options.cursor) query = query.where("id", ">", options.cursor);
  const rows = await query
    .orderBy("id")
    .limit(options.limit + 1)
    .execute();
  return {
    items: rows.slice(0, options.limit),
    nextCursor: rows.length > options.limit ? rows[options.limit - 1].id : null,
  };
}

export async function publishedHistory(
  company: string,
  statement: Statement,
  row: Row,
  periodId: string,
  selected: Cell,
) {
  const period = statement.periods.find((p) => p.id === periodId);
  if (!period) return [];
  let query = database()
    .selectFrom("observations")
    .innerJoin(
      "extraction_attempts",
      "extraction_attempts.id",
      "observations.attempt_id",
    )
    .innerJoin("filings", "filings.id", "extraction_attempts.filing_id")
    .select([
      "observations.id",
      "filings.id as filing_id",
      "observations.raw_label",
      "observations.raw_text",
      "observations.amount",
      "observations.value_state",
      "observations.evidence",
    ])
    .where("observations.company_id", "=", company)
    .where("observations.concept_id", "=", row.id)
    .where("observations.statement", "=", statement.id)
    .where("observations.period_end", "=", period.end)
    .where("observations.currency", "=", row.currency)
    .where("observations.unit", "=", row.unit)
    .where("observations.scope", "=", statement.scope)
    .where("observations.basis", "=", statement.basis)
    .where("extraction_attempts.status", "=", "approved");
  query = period.start
    ? query.where("observations.period_start", "=", period.start)
    : query.where("observations.period_start", "is", null);
  const observations = await query
    .orderBy("filings.published_on", "desc")
    .orderBy("observations.id")
    .limit(100)
    .execute();
  const seenFilings = new Set([selected.filingId]);
  return observations.flatMap((observation) => {
    if (seenFilings.has(observation.filing_id)) return [];
    const evidence = observation.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
      return [];
    const parsed = cellSchema.safeParse({
      value: observation.amount,
      state: observation.value_state,
      observationId: observation.id,
      filingId: observation.filing_id,
      rawLabel: observation.raw_label,
      rawText: observation.raw_text,
      pdfPage: evidence.page,
      printedPage: evidence.printed_page ?? "",
      comparative: evidence.comparative ?? "original",
    });
    if (!parsed.success) return [];
    seenFilings.add(observation.filing_id);
    return [
      { cell: parsed.data, period, unit: row.unit, currency: row.currency },
    ];
  });
}
