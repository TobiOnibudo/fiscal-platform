"use client";
import { useState } from "react";
import { FileText, ArrowUpRight, ShieldCheck, Check, X } from "lucide-react";
import { safeSource, type Filing } from "@/lib/contracts";
import { useReview, type StatementResponse } from "./review-client";
export function FilingsView({
  company,
  retry,
}: {
  company: string;
  retry: number;
}) {
  const [query, setQuery] = useState("");
  const [classification, setClassification] = useState("");
  const [year, setYear] = useState("");
  const [cursor, setCursor] = useState("");
  const params = new URLSearchParams({
    q: query,
    limit: "30",
    ...(classification ? { classification } : {}),
    ...(year ? { year } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const state = useReview<{ items: Filing[]; nextCursor: string | null }>(
    `companies/${company}/filings?${params}`,
    retry,
  );
  return (
    <section className="secondary-view">
      <h2>Source filings</h2>
      <p className="muted">
        Document discovery does not establish verified statement coverage.
      </p>
      <div className="filter-row">
        <label>
          <span>Search reports</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor("");
            }}
            placeholder="Report title"
          />
        </label>
        <label>
          <span>Classification</span>
          <select
            value={classification}
            onChange={(e) => {
              setClassification(e.target.value);
              setCursor("");
            }}
          >
            <option value="">All documents</option>
            <option value="annual_report">Annual report</option>
            <option value="interim_report">Interim report</option>
            <option value="prospectus">Prospectus</option>
          </select>
        </label>
        <label>
          <span>Publication year</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setCursor("");
            }}
            placeholder="All years"
          />
        </label>
      </div>
      {state.loading ? (
        <p role="status">Loading filings…</p>
      ) : state.error ? (
        <p role="alert">
          The filing inventory could not load. Use Retry data above.
        </p>
      ) : state.data?.items.length ? (
        <>
          <div className="filing-list">
            {state.data.items.map((filing) => (
              <article key={filing.id}>
                <FileText size={20} aria-hidden="true" />
                <div>
                  <h3>{filing.title}</h3>
                  <p>
                    {filing.classification.replaceAll("_", " ")} ·{" "}
                    {filing.published_on?.slice(0, 10) ??
                      "Publication date not established"}
                  </p>
                </div>
                {safeSource(filing.source_url) ? (
                  <a
                    className="button"
                    href={safeSource(filing.source_url)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${filing.title}`}
                  >
                    Open document <ArrowUpRight size={16} />
                  </a>
                ) : null}
              </article>
            ))}
          </div>
          <div className="pagination">
            <button
              className="button"
              disabled={!cursor}
              onClick={() => setCursor("")}
            >
              First page
            </button>
            <button
              className="button"
              disabled={!state.data.nextCursor}
              onClick={() => setCursor(state.data?.nextCursor ?? "")}
            >
              Next page
            </button>
          </div>
        </>
      ) : (
        <div className="quiet-empty">
          <FileText size={28} />
          <h3>No matching filings</h3>
          <p>The source inventory has no records for this selection.</p>
        </div>
      )}
    </section>
  );
}

export function QualityView({
  company,
  version,
  retry,
}: {
  company: string;
  version?: string;
  retry: number;
}) {
  const state = useReview<{
    datasetVersion: string;
    kind: "sample" | "verified";
    coverage: StatementResponse["coverage"];
    validation: { reviewed?: boolean; issues?: unknown[] };
  }>(
    `companies/${company}/quality${version ? `?version=${version}` : ""}`,
    retry,
  );
  return (
    <section className="secondary-view">
      <h2>Data quality and coverage</h2>
      <p className="readable">
        Verified means the source transcription, reporting scope, label mapping,
        and selected comparative have completed recorded review. Passing
        arithmetic checks alone does not establish accuracy.
      </p>
      {state.loading ? (
        <p role="status">Loading coverage…</p>
      ) : state.error ? (
        <div
          className="quiet-empty"
          role={
            state.error.code === "NO_PUBLISHED_DATASET" ? "status" : "alert"
          }
        >
          <ShieldCheck size={28} />
          <h3>
            {state.error.code === "NO_PUBLISHED_DATASET"
              ? "Coverage is not established"
              : "Coverage could not load"}
          </h3>
          <p>
            {state.error.code === "NO_PUBLISHED_DATASET"
              ? "No coverage results are available for this company yet."
              : "Please use Retry data above to try again."}
          </p>
        </div>
      ) : (
        <>
          {state.data?.kind === "sample" ? (
            <p className="readable">
              Source review has not been completed for these figures. They are
              not intended for financial analysis.
            </p>
          ) : null}
          <h3>
            {state.data?.kind === "sample"
              ? `${state.data.coverage.expectedPeriods} periods available`
              : `${state.data?.coverage.verifiedPeriods} of ${state.data?.coverage.expectedPeriods} target periods verified`}
          </h3>
          <ul className="gap-list">
            {state.data?.coverage.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
          <p>
            {state.data?.kind === "sample"
              ? "Dataset status: Review pending"
              : `Recorded source review: ${state.data?.validation.reviewed ? "Complete" : "Not recorded as complete"}`}
          </p>
        </>
      )}
    </section>
  );
}

type ReviewAttempt = {
  id: string;
  status: string;
  filing_title: string;
  published_on: string | null;
  payload: { cellCount?: number; model?: string };
};
type ReviewDetail = ReviewAttempt & {
  filing_id: string;
  source_url: string;
  observations: Array<{
    id: string;
    statement: string;
    raw_label: string;
    raw_text: string;
    amount: string | null;
    currency: string;
    unit: string;
    period_end: string;
    evidence: { page?: number; printed_page?: string; row?: string; column?: string };
    decision: { decision: "approved" | "rejected"; reviewer: string; note: string } | null;
  }>;
};

export function ReviewQueue({ company, retry }: { company: string; retry: number }) {
  const attempts = useReview<{ items: ReviewAttempt[] }>(`companies/${company}/review`, retry);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localRetry, setLocalRetry] = useState(0);
  const detail = useReview<ReviewDetail>(
    selectedId ? `companies/${company}/review/attempts/${selectedId}` : null,
    localRetry,
  );
  async function decide(observationId: string, decision: "approved" | "rejected") {
    if (!selectedId) return;
    const reviewer = window.prompt("Reviewer name")?.trim();
    if (!reviewer) return;
    const note = decision === "rejected" ? window.prompt("What needs correcting?")?.trim() ?? "" : "";
    const response = await fetch(`/api/v1/companies/${company}/review/attempts/${selectedId}/decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observationId, decision, reviewer, note }),
    });
    if (!response.ok) return;
    setLocalRetry((value) => value + 1);
  }
  if (attempts.loading) return <section className="secondary-view"><p role="status">Loading extraction workspace…</p></section>;
  if (attempts.error) return <section className="secondary-view"><div className="quiet-empty"><ShieldCheck size={28} /><h3>Review workspace unavailable</h3><p>Start the app locally with review access enabled.</p></div></section>;
  return (
    <section className="secondary-view review-queue">
      <h2>Extraction review</h2>
      <p className="muted">Review each reported cell against its filing before it can contribute to a published statement.</p>
      {!selectedId ? (
        <div className="filing-list">
          {attempts.data?.items.map((attempt) => (
            <article key={attempt.id}>
              <FileText size={20} aria-hidden="true" />
              <div><h3>{attempt.filing_title}</h3><p>{attempt.payload.cellCount ?? 0} cells · {attempt.status.replaceAll("_", " ")}</p></div>
              <button className="button" onClick={() => setSelectedId(attempt.id)}>Review</button>
            </article>
          ))}
          {!attempts.data?.items.length ? <div className="quiet-empty"><FileText size={28}/><h3>Nothing waiting for review</h3><p>New extractions appear here after ingestion.</p></div> : null}
        </div>
      ) : detail.loading ? <p role="status">Loading extracted cells…</p> : detail.data ? (
        <>
          <div className="review-toolbar"><button className="text-button" onClick={() => setSelectedId(null)}>Back to queue</button>{safeSource(detail.data.source_url) ? <a className="button" href={safeSource(detail.data.source_url)} target="_blank" rel="noreferrer">Open filing <ArrowUpRight size={16}/></a> : null}</div>
          <div className="review-table-wrap"><table className="review-table"><thead><tr><th>Statement</th><th>Line item</th><th>Period</th><th>Reported value</th><th>Source</th><th>Decision</th></tr></thead><tbody>{detail.data.observations.map((cell) => <tr key={cell.id}><td>{cell.statement}</td><td><strong>{cell.raw_label}</strong><small>{cell.raw_text}</small></td><td>{cell.period_end}</td><td>{cell.amount ?? "—"} {cell.currency} <small>{cell.unit}</small></td><td>PDF {cell.evidence.page ?? "—"}{cell.evidence.printed_page ? ` · p. ${cell.evidence.printed_page}` : ""}</td><td>{cell.decision ? <span className={`review-decision ${cell.decision.decision}`}>{cell.decision.decision}</span> : <span className="review-actions"><button aria-label={`Approve ${cell.raw_label}`} onClick={() => decide(cell.id, "approved")}><Check size={15}/></button><button aria-label={`Reject ${cell.raw_label}`} onClick={() => decide(cell.id, "rejected")}><X size={15}/></button></span>}</td></tr>)}</tbody></table></div>
        </>
      ) : null}
    </section>
  );
}
