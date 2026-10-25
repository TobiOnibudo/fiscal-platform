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

function metric(statement: Statement, ids: string[]) {
  const row = statement.rows.find(
    (item) =>
      ids.includes(item.id) ||
      ids.some((id) => item.label.toLowerCase().includes(id)),
  );
  return new Map(
    statement.periods.map((period) => [
      period.end.slice(0, 4),
      row?.cells[period.id]?.value ? Number(row.cells[period.id].value) : null,
    ]),
  );
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
  const profit = metric(income, [
    "adjusted-ebitda",
    "operating-profit",
    "operating profit",
  ]);
  const cash = metric(cashflow, [
    "net-operating",
    "cash-from-operations",
    "net cash from operating",
    "cash generated from operations",
  ]);
  const periods = income.periods
    .map((period) => period.end.slice(0, 4))
    .filter(
      (year) =>
        revenue.get(year) !== null &&
        profit.get(year) !== null &&
        cash.get(year) !== null,
    )
    .slice(-5);
  if (periods.length < 2)
    throw new ReviewError(
      "TREND_DATA_UNAVAILABLE",
      "Published trend metrics need at least two complete fiscal years.",
      422,
    );
  const revenueValues = periods.map((year) => revenue.get(year) as number);
  const profitValues = periods.map((year) => profit.get(year) as number);
  const cashValues = periods.map((year) => cash.get(year) as number);
  return {
    periods: periods.map((year) => `FY${year.slice(2)}`),
    currency: income.currency,
    unit: income.unit,
    revenue: revenueValues,
    margin: profitValues.map(
      (value, index) => (value / revenueValues[index]) * 100,
    ),
    cashFlow: cashValues,
    conversion: cashValues.map(
      (value, index) => (value / revenueValues[index]) * 100,
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
        statementCsv(snapshot, statement, q.q, q.historical === "true"),
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
