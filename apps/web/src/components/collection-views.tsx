"use client";
import { useState } from "react";
import { FileText, ArrowUpRight, ShieldCheck } from "lucide-react";
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
