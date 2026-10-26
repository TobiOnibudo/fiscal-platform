"use client";
import { useState } from "react";
import { FileText, ArrowUpRight, ShieldCheck } from "lucide-react";
import { safeSource, type Filing } from "@/lib/contracts";
import { useReview, type StatementResponse } from "./review-client";

const FILINGS_PER_PAGE = 5;

export function FilingsView({
  company,
  retry,
}: {
  company: string;
  retry: number;
}) {
  const [query, setQuery] = useState("");
  const [titleSuggestionsOpen, setTitleSuggestionsOpen] = useState(false);
  const [classification, setClassification] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState([""]);
  const cursor = pageCursors[page] ?? "";
  const selectedYear = /^(19|20)\d{2}$/.test(year) ? year : "";
  const resetPagination = () => {
    setPage(0);
    setPageCursors([""]);
  };
  const params = new URLSearchParams({
    q: query,
    limit: String(FILINGS_PER_PAGE),
    ...(classification ? { classification } : {}),
    ...(selectedYear ? { year: selectedYear } : {}),
    ...(cursor ? { cursor } : {}),
  });
  const state = useReview<{ items: Filing[]; nextCursor: string | null }>(
    `companies/${company}/filings?${params}`,
    retry,
  );
  const titleSuggestions = Array.from(
    new Set(state.data?.items.map((filing) => filing.title) ?? []),
  );
  const matchingTitles = titleSuggestions
    .filter((title) =>
      title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    )
    .slice(0, 5);
  const availableYears = Array.from(
    { length: new Date().getFullYear() - 1999 },
    (_, index) => new Date().getFullYear() - index,
  );
  return (
    <section className="secondary-view">
      <h2>Source filings</h2>
      <div className="filter-row">
        <label>
          <span>Search reports</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetPagination();
            }}
            onFocus={() => setTitleSuggestionsOpen(true)}
            onBlur={() => setTitleSuggestionsOpen(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setTitleSuggestionsOpen(false);
            }}
            placeholder="Report title"
          />
          {titleSuggestionsOpen && query.trim() && matchingTitles.length ? (
            <div className="filing-title-suggestions" role="listbox">
              {matchingTitles.map((title) => (
                <button
                  key={title}
                  type="button"
                  role="option"
                  aria-selected={title === query}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery(title);
                    setTitleSuggestionsOpen(false);
                    resetPagination();
                  }}
                >
                  {title}
                </button>
              ))}
            </div>
          ) : null}
        </label>
        <label>
          <span>Classification</span>
          <select
            value={classification}
            onChange={(e) => {
              setClassification(e.target.value);
              resetPagination();
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
            type="search"
            inputMode="numeric"
            pattern="(19|20)[0-9]{2}"
            maxLength={4}
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              resetPagination();
            }}
            placeholder="All years"
            aria-label="Publication year; enter a four-digit year"
            list="publication-year-suggestions"
          />
          <datalist id="publication-year-suggestions">
            {availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear}>
                {availableYear}
              </option>
            ))}
          </datalist>
        </label>
      </div>
      {state.loading ? (
        <p role="status">Loading filings…</p>
      ) : state.error ? (
        <p role="alert">
          The filing inventory could not load. Please refresh the page to try
          again.
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
                      (filing.report_year
                        ? `FY${filing.report_year}`
                        : "Date unavailable")}
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
              disabled={page === 0}
              onClick={() => setPage(0)}
            >
              First page
            </button>
            <button
              className="button"
              disabled={page === 0}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous page
            </button>
            <span aria-live="polite">Page {page + 1}</span>
            <button
              className="button"
              disabled={!state.data.nextCursor}
              onClick={() => {
                const nextCursor = state.data?.nextCursor;
                if (!nextCursor) return;
                setPageCursors((current) => [
                  ...current.slice(0, page + 1),
                  nextCursor,
                ]);
                setPage((current) => current + 1);
              }}
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
        and selected comparative passed review. Passing arithmetic checks alone
        does not establish accuracy.
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
              : "Please refresh the page to try again."}
          </p>
        </div>
      ) : (
        <>
          <h3>
            {state.data?.kind === "sample"
              ? `${state.data.coverage.expectedPeriods} periods available`
              : `${state.data?.coverage.verifiedPeriods} of ${state.data?.coverage.expectedPeriods} target periods verified`}
          </h3>
          <ul className="gap-list">
            {state.data?.coverage.gaps.map((gap) => <li key={gap}>{gap}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
