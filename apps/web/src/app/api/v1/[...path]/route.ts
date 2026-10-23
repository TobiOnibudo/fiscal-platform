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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
              return Response.json({
                datasetVersion: snapshot.version,
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
                previousObservations: await publishedHistory(
                  q.company,
                  statement,
                  row,
                  periodId,
                  cell,
                ),
                historyStatus:
                  "Alternative compatible observations are drawn from up to 100 published datasets. Candidate extractions are private. Dataset hashes do not indicate publication order.",
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
    if (!["filings", "statements", "quality", "export"].includes(path[2])) throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    if (path[2] === "export" && !q.version) throw new ReviewError("VERSION_REQUIRED", "Exports require the displayed dataset version.");
    if (path[2] === "filings")
      return Response.json({
        ...(await filings(company, {
          search: q.q,
          classification: q.classification,
          year: q.year,
          cursor: q.cursor,
          limit: q.limit,
        })),
        requestId,
      });
    const snapshot = await published(company, q.version);
    if (path[2] === "quality")
      return Response.json({
        datasetVersion: snapshot.version,
        coverage: snapshot.data.coverage,
        validation: snapshot.validation,
        requestId,
      });
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
