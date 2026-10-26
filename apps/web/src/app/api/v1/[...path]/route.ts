import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { apiFailure, querySchema } from "@/lib/api";
import {
  companies,
  filings,
  published,
  publishedHistory,
  ReviewError,
} from "@/lib/repository";
import { statementCsv } from "@/lib/export";
import type { Statement } from "@/lib/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Metric = {
  values: Map<string, number | null>;
  currencies: Map<string, string | null>;
  currency: string;
  unit: string;
};

function scaleToMillions(unit: string) {
  const normalized = unit.toLowerCase();
  if (
    normalized.includes("thousand") ||
    normalized.includes("'000") ||
    normalized.includes("000s")
  )
    return 0.001;
  return 1;
}

function metric(
  statement: Statement,
  ids: string[],
  currencies?: Map<string, string | null>,
): Metric | undefined {
  const candidates = statement.rows.filter(
    (item) =>
      ids.includes(item.id) ||
      ids.some((id) => item.label.toLowerCase().includes(id)),
  );
  const rows = candidates.toSorted(
    (left, right) =>
      Object.values(right.cells).filter((cell) => cell.value !== null).length -
      Object.values(left.cells).filter((cell) => cell.value !== null).length,
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    currency: row.currency,
    unit: "m",
    currencies: new Map(
      statement.periods.map((period) => {
        const year = period.end.slice(0, 4);
        const source = rows.find(
          (candidate) =>
            (!currencies || candidate.currency === currencies.get(year)) &&
            candidate.cells[period.id]?.value !== null,
        );
        return [year, source?.currency ?? null];
      }),
    ),
    values: new Map(
      statement.periods.map((period) => {
        const year = period.end.slice(0, 4);
        const source = rows.find(
          (candidate) =>
            (!currencies || candidate.currency === currencies.get(year)) &&
            candidate.cells[period.id]?.value !== null,
        );
        const value = source?.cells[period.id]?.value;
        return [
          year,
          value && source ? Number(value) * scaleToMillions(source.unit) : null,
        ];
      }),
    ),
  };
}

function trends(statements: Statement[]) {
  const income = statements.find((statement) => statement.id === "income");
  const cashflow = statements.find((statement) => statement.id === "cashflow");
  if (!income || !cashflow)
    throw new ReviewError(
      "TREND_DATA_UNAVAILABLE",
      "Published income and cash-flow statements are required for trends.",
      422,
    );
  const revenue = metric(income, [
    "revenue",
    "net revenue",
    "non-interest revenue",
  ]);
  const profit = metric(
    income,
    [
      "adjusted-ebitda",
      "operating-profit",
      "operating profit",
      "operating income",
      "income before net finance",
      "income before interest income",
    ],
    revenue?.currencies,
  );
  const cash = metric(
    cashflow,
    [
      "net-operating",
      "cash-from-operations",
      "net cash from operating",
      "cash generated from operations",
      "net cash provided by operating activities",
    ],
    revenue?.currencies,
  );
  if (!revenue || !profit || !cash)
    throw new ReviewError(
      "TREND_DATA_UNAVAILABLE",
      "Published trend metrics are not available in a consistent currency.",
      422,
    );
  const periods = income.periods
    .map((period) => period.end.slice(0, 4))
    .filter((year) => revenue.values.get(year) !== null);
  if (periods.length < 2)
    throw new ReviewError(
      "TREND_DATA_UNAVAILABLE",
      "Published revenue needs at least two fiscal years for trends.",
      422,
    );
  const revenueValues = periods.map((year) => revenue.values.get(year) ?? null);
  const profitValues = periods.map((year) => profit.values.get(year) ?? null);
  const cashValues = periods.map((year) => cash.values.get(year) ?? null);
  return {
    periods: periods.map((year) => `FY${year.slice(2)}`),
    currency: revenue.currency,
    currencies: periods.map((year) => revenue.currencies.get(year)),
    unit: revenue.unit,
    revenue: revenueValues,
    margin: profitValues.map((value, index) =>
      value !== null && revenueValues[index] !== null
        ? (value / revenueValues[index]) * 100
        : null,
    ),
    cashFlow: cashValues,
    conversion: cashValues.map((value, index) =>
      value !== null && revenueValues[index] !== null
        ? (value / revenueValues[index]) * 100
        : null,
    ),
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = randomUUID();
  try {
    const { path } = await context.params;
    const url = new URL(request.url);
    if (
      Array.from(url.searchParams.keys()).some(
        (key) => url.searchParams.getAll(key).length > 1,
      )
    )
      throw new ReviewError(
        "INVALID_REQUEST",
        "Query parameters must not repeat.",
      );
    const q = querySchema.parse(Object.fromEntries(url.searchParams));
    if (path.join("/") === "health") {
      await database().selectFrom("companies").select("id").limit(1).execute();
      return Response.json({ status: "ready", requestId });
    }
    if (path.join("/") === "companies")
      return Response.json({ items: await companies(q.q), requestId });
    if (
      path[0] === "observations" &&
      path[2] === "history" &&
      path.length === 3
    ) {
      if (!q.company || !q.version)
        throw new ReviewError(
          "VERSION_REQUIRED",
          "Evidence requests require a company and the displayed dataset version.",
        );
      const snapshot = await published(q.company, q.version);
      for (const statement of snapshot.data.statements)
        for (const row of statement.rows)
          for (const [periodId, cell] of Object.entries(row.cells)) {
            if (cell.observationId === path[1]) {
              const source = await database()
                .selectFrom("filings")
                .select([
                  "id",
                  "title",
                  "source_url",
                  "published_on",
                  "classification",
                  "sha256",
                ])
                .where("id", "=", cell.filingId)
                .where("company_id", "=", q.company)
                .executeTakeFirst();
              const history = await publishedHistory(
                q.company,
                statement,
                row,
                periodId,
                cell,
              );
              const historyFilingIds = [
                ...new Set(history.map((item) => item.cell.filingId)),
              ];
              const historySources = historyFilingIds.length
                ? await database()
                    .selectFrom("filings")
                    .select([
                      "id",
                      "title",
                      "source_url",
                      "published_on",
                      "classification",
                      "sha256",
                    ])
                    .where("company_id", "=", q.company)
                    .where("id", "in", historyFilingIds)
                    .execute()
                : [];
              const historySourcesById = new Map(
                historySources.map((item) => [item.id, item]),
              );
              return Response.json({
                datasetVersion: snapshot.version,
                kind: snapshot.data.kind,
                selected: cell,
                period: statement.periods.find((p) => p.id === periodId),
                row: { label: row.label, aliases: row.aliases },
                units: {
                  currency: row.currency,
                  unit: row.unit,
                  basis: statement.basis,
                  scope: statement.scope,
                },
                source: source ?? null,
                previousObservations: history.map((item) => ({
                  ...item,
                  source: historySourcesById.get(item.cell.filingId) ?? null,
                })),
                historyStatus:
                  "Compatible approved observations are drawn from the source filings stored for this company.",
                requestId,
              });
            }
          }
      throw new ReviewError(
        "OBSERVATION_NOT_FOUND",
        "That observation is not in the selected publication.",
        404,
      );
    }
    if (
      path[0] !== "companies" ||
      path.length !== 3 ||
      !/^[a-z0-9-]{1,100}$/.test(path[1])
    )
      throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    const company = path[1];
    if (
      !["filings", "statements", "quality", "trends", "export"].includes(
        path[2],
      )
    )
      throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    if (path[2] === "export" && !q.version)
      throw new ReviewError(
        "VERSION_REQUIRED",
        "Exports require the displayed dataset version.",
      );
    if (path[2] === "filings") {
      const page = await filings(company, {
        search: q.q,
        classification: q.classification,
        year: q.year,
        cursor: q.cursor,
        limit: q.limit,
      });
      return Response.json(
        {
          ...page,
          companyId: company,
          filters: {
            search: q.q ?? "",
            classification: q.classification ?? null,
            year: q.year ?? null,
            cursor: q.cursor ?? null,
            limit: q.limit,
          },
          requestId,
        },
        {
          headers:
            q.download === "manifest"
              ? {
                  "Content-Disposition": `attachment; filename="${company}-source-manifest-page.json"`,
                  "Cache-Control": "no-store",
                }
              : { "Cache-Control": "no-store" },
        },
      );
    }
    const snapshot = await published(company, q.version);
    if (path[2] === "quality")
      return Response.json({
        datasetVersion: snapshot.version,
        kind: snapshot.data.kind,
        coverage: snapshot.data.coverage,
        validation: snapshot.validation,
        requestId,
      });
    if (path[2] === "trends")
      return Response.json(
        {
          datasetVersion: snapshot.version,
          kind: snapshot.data.kind,
          ...trends(snapshot.data.statements),
          requestId,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (!["statements", "export"].includes(path[2]))
      throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    const original = snapshot.data.statements.find((s) => s.id === q.statement);
    if (!original)
      throw new ReviewError(
        "STATEMENT_NOT_FOUND",
        "This statement has not been published.",
        404,
      );
    const statement = {
      ...original,
      periods: original.periods.filter(
        (p) =>
          (!q.from || p.end.slice(0, 4) >= q.from) &&
          (!q.to || p.end.slice(0, 4) <= q.to),
      ),
    };
    const visiblePeriods = new Set(
      statement.periods.map((period) => period.id),
    );
    statement.rows = statement.rows.map((row) => ({
      ...row,
      cells: Object.fromEntries(
        Object.entries(row.cells).filter(([period]) =>
          visiblePeriods.has(period),
        ),
      ),
    }));
    if (path[2] === "export") {
      return new Response(
        `\uFEFF${statementCsv(snapshot, statement, q.q, q.historical === "true")}`,
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${company}-${q.statement}-${snapshot.version.slice(0, 12)}.csv"`,
            "X-Dataset-Version": snapshot.version,
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return Response.json(
      {
        datasetVersion: snapshot.version,
        kind: snapshot.data.kind,
        statement,
        coverage: snapshot.data.coverage,
        requestId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
