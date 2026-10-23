import { database } from "./db";
import {
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
  if (data.kind !== "verified" || data.companyId !== company)
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
  const versions = await database()
    .selectFrom("datasets")
    .select(["id", "payload"])
    .where("company_id", "=", company)
    .where("status", "=", "published")
    .orderBy("id")
    .limit(100)
    .execute();
  const seen = new Set([selected.observationId]);
  const history: {
    datasetVersion: string;
    cell: Cell;
    period: typeof period;
    unit: string;
    currency: string;
  }[] = [];
  for (const version of versions) {
    const parsed = datasetSchema.safeParse(version.payload);
    if (
      !parsed.success ||
      parsed.data.companyId !== company ||
      parsed.data.kind !== "verified"
    )
      continue;
    const previousStatement = parsed.data.statements.find(
      (s) =>
        s.id === statement.id &&
        s.scope === statement.scope &&
        s.basis === statement.basis,
    );
    const previousPeriod = previousStatement?.periods.find(
      (p) => p.start === period.start && p.end === period.end,
    );
    const previousRow = previousStatement?.rows.find(
      (r) =>
        r.id === row.id && r.currency === row.currency && r.unit === row.unit,
    );
    const cell = previousPeriod && previousRow?.cells[previousPeriod.id];
    if (!cell || seen.has(cell.observationId)) continue;
    seen.add(cell.observationId);
    history.push({
      datasetVersion: version.id,
      cell,
      period: previousPeriod,
      unit: row.unit,
      currency: row.currency,
    });
  }
  return history;
}
