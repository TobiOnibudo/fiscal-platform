import { randomUUID } from "node:crypto";
import { database, reviewDatabase, reviewEnabled } from "@/lib/db";
import { apiFailure, querySchema, reviewDecisionSchema } from "@/lib/api";
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

function requireLocalReview() {
  if (!reviewEnabled())
    throw new ReviewError("REVIEW_UNAVAILABLE", "Review workspace is unavailable.", 404);
  return reviewDatabase();
}

async function reviewAttempt(company: string, attemptId: string) {
  const db = requireLocalReview();
  const attempt = await db
    .selectFrom("extraction_attempts as attempts")
    .innerJoin("filings", "filings.id", "attempts.filing_id")
    .select([
      "attempts.id",
      "attempts.status",
      "attempts.response_hash",
      "attempts.payload",
      "filings.id as filing_id",
      "filings.title as filing_title",
      "filings.source_url",
      "filings.published_on",
    ])
    .where("attempts.id", "=", attemptId)
    .where("filings.company_id", "=", company)
    .executeTakeFirst();
  if (!attempt) throw new ReviewError("ATTEMPT_NOT_FOUND", "Extraction is unavailable.", 404);
  const [observations, events] = await Promise.all([
    db.selectFrom("observations")
      .selectAll()
      .where("attempt_id", "=", attemptId)
      .orderBy("statement")
      .orderBy("raw_label")
      .orderBy("period_end")
      .execute(),
    db.selectFrom("review_events")
      .selectAll()
      .where("attempt_id", "=", attemptId)
      .orderBy("created_at", "desc")
      .execute(),
  ]);
  const latest = new Map<string, (typeof events)[number]>();
  for (const event of events) if (event.observation_id && !latest.has(event.observation_id)) latest.set(event.observation_id, event);
  return {
    ...attempt,
    observations: observations.map((observation) => ({ ...observation, decision: latest.get(observation.id) ?? null })),
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
    if (path[0] === "companies" && path[2] === "review" && path.length === 3) {
      const company = path[1];
      if (!/^[a-z0-9-]{1,100}$/.test(company))
        throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
      const db = requireLocalReview();
      const attempts = await db
        .selectFrom("extraction_attempts as attempts")
        .innerJoin("filings", "filings.id", "attempts.filing_id")
        .select([
          "attempts.id", "attempts.status", "attempts.payload", "attempts.response_hash",
          "filings.title as filing_title", "filings.published_on",
        ])
        .where("filings.company_id", "=", company)
        .where("attempts.status", "in", ["needs_review", "validation_failed"])
        .orderBy("filings.published_on", "desc")
        .limit(100)
        .execute();
      return Response.json({ items: attempts, requestId }, { headers: { "Cache-Control": "no-store" } });
    }
    if (path[0] === "companies" && path[2] === "review" && path[3] === "attempts" && path.length === 5) {
      return Response.json({ ...(await reviewAttempt(path[1], path[4])), requestId }, { headers: { "Cache-Control": "no-store" } });
    }
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
    if (!["filings", "statements", "quality", "export"].includes(path[2]))
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

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const requestId = randomUUID();
  try {
    const { path } = await context.params;
    if (!(path[0] === "companies" && path[2] === "review" && path[3] === "attempts" && path[5] === "decisions" && path.length === 6))
      throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    const company = path[1];
    const attemptId = path[4];
    if (!/^[a-z0-9-]{1,100}$/.test(company) || !/^[a-f0-9]{64}$/.test(attemptId))
      throw new ReviewError("NOT_FOUND", "This API route does not exist.", 404);
    const body = reviewDecisionSchema.parse(await request.json());
    const result = await reviewAttempt(company, attemptId);
    const db = requireLocalReview();
    if (!result.observations.some((item) => item.id === body.observationId))
      throw new ReviewError("OBSERVATION_NOT_FOUND", "The observation is not part of this extraction.", 404);
    await db.transaction().execute(async (trx) => {
      await trx.insertInto("review_events").values({
        id: randomUUID(), attempt_id: attemptId, observation_id: body.observationId,
        decision: body.decision, reviewer: body.reviewer, note: body.note, created_at: new Date(),
      }).execute();
      const decisions = await trx.selectFrom("review_events")
        .select(["observation_id", "decision", "created_at"])
        .where("attempt_id", "=", attemptId).orderBy("created_at", "desc").execute();
      const current = new Map<string, string>();
      for (const decision of decisions)
        if (decision.observation_id && !current.has(decision.observation_id)) current.set(decision.observation_id, decision.decision);
      const status = result.observations.every((item) => current.get(item.id) === "approved")
        ? "approved" : body.decision === "rejected" ? "validation_failed" : "needs_review";
      await trx.updateTable("extraction_attempts").set({ status }).where("id", "=", attemptId).execute();
    });
    return Response.json({ ok: true, requestId });
  } catch (error) {
    return apiFailure(error, requestId);
  }
}
