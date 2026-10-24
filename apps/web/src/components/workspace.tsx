"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Database,
  FileText,
  Layers,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { searchRows, type Cell, type Company } from "@/lib/contracts";
import {
  useReview,
  type Failure,
  type StatementResponse,
} from "./review-client";
import { SourceDrawer } from "./source-drawer";
import { StatementTable } from "./statement-table";
import { FilingsView, QualityView } from "./collection-views";
const statementTypes = [
  { id: "income", label: "Income statement" },
  { id: "balance", label: "Balance sheet" },
  { id: "cashflow", label: "Cash flow" },
] as const;
const initialCompanies: Company[] = [
  { id: "wise", name: "Wise", fiscal_year_end_month: 3 },
  { id: "adyen", name: "Adyen", fiscal_year_end_month: 12 },
];

function EmptyState({ error, retry }: { error?: Failure; retry: () => void }) {
  const unpublished =
    error?.code === "NO_PUBLISHED_DATASET" ||
    error?.code === "STATEMENT_NOT_FOUND";
  return (
    <div className="empty-state" role="status">
      <div className="empty-symbol">
        <BookOpen size={28} aria-hidden="true" />
      </div>
      <h2>
        {unpublished ? "No statements available" : "Unable to load statements"}
      </h2>
      <p>
        {unpublished
          ? "There are no financial statements to display for this company yet."
          : "Please try again in a moment."}
      </p>
      <button className="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
export function Workspace() {
  const [company, setCompany] = useState("wise");
  const [statement, setStatement] = useState("income");
  const [view, setView] = useState("statements");
  const [query, setQuery] = useState("");
  const [historical, setHistorical] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Cell | null>(null);
  const companyData = useReview<{ items: Company[] }>("companies", retry);
  const collection = companyData.data?.items.length
    ? companyData.data.items
    : initialCompanies;
  const selectedCompany =
    collection.find((c) => c.id === company) ?? initialCompanies[0];
  const response = useReview<StatementResponse>(
    `companies/${company}/statements?statement=${statement}`,
    retry,
  );
  const data = response.data;
  const isSample = data?.kind === "sample";
  const years = Array.from(
    new Set(data?.statement.periods.map((p) => p.end.slice(0, 4)) ?? []),
  ).sort();
  const selectedFrom = from || years[Math.max(0, years.length - 10)] || "";
  const selectedTo = to || years.at(-1) || "";
  const visibleStatement = data
    ? {
        ...data.statement,
        periods: data.statement.periods.filter(
          (p) =>
            p.end.slice(0, 4) >= selectedFrom &&
            p.end.slice(0, 4) <= selectedTo,
        ),
      }
    : undefined;
  const rows = data ? searchRows(data.statement.rows, query, historical) : [];
  const historicalCount =
    data?.statement.rows.filter((r) => r.historical).length ?? 0;
  const exportParams = new URLSearchParams({
    statement,
    version: data?.datasetVersion ?? "",
    q: query,
    historical: String(historical),
    ...(selectedFrom ? { from: selectedFrom } : {}),
    ...(selectedTo ? { to: selectedTo } : {}),
  });
  function changeCompany(id: string) {
    setCompany(id);
    setSelected(null);
    setQuery("");
    setFrom("");
    setTo("");
  }
  return (
    <div className="app-shell">
      <a href="#review" className="skip-link">
        Skip to financial review
      </a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Fiscal home">
          <Layers size={25} aria-hidden="true" />
          <span>
            fiscal<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="company-picker">
          <label htmlFor="company">Company</label>
          <select
            id="company"
            aria-label="Company"
            value={company}
            onChange={(e) => changeCompany(e.target.value)}
          >
            {collection.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <nav aria-label="Review navigation">
          {[
            { id: "statements", name: "Statements", icon: BookOpen },
            { id: "filings", name: "Filings", icon: FileText },
            { id: "quality", name: "Data quality", icon: ShieldCheck },
          ].map((item) => (
            <button
              key={item.id}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <item.icon size={18} aria-hidden="true" />
              {item.name}
              {view === item.id ? (
                <ChevronRight size={16} className="nav-chevron" />
              ) : null}
            </button>
          ))}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Financial review <ChevronRight size={14} />
            <strong>{selectedCompany.name}</strong>
          </span>
          <button
            className="text-button"
            onClick={() => setRetry((r) => r + 1)}
          >
            <Database size={15} /> Retry data
          </button>
        </header>
        <main
          id="review"
          className={view === "statements" ? "statement-workspace" : undefined}
        >
          <div className="page-heading">
            <div>
              <h1>{selectedCompany.name}</h1>
              <p>Consolidated financial statements</p>
            </div>
            <span className={`publication-badge ${data ? "available" : ""}`}>
              <span className="status-dot" />
              {data
                ? isSample
                  ? "Demo data"
                  : "Published review dataset"
                : "Awaiting published data"}
            </span>
          </div>
          {view === "statements" ? (
            <>
              <div
                className="statement-tabs"
                role="tablist"
                aria-label="Financial statement"
              >
                {statementTypes.map((type) => (
                  <button
                    key={type.id}
                    role="tab"
                    aria-selected={statement === type.id}
                    aria-controls="statement-panel"
                    id={`tab-${type.id}`}
                    tabIndex={statement === type.id ? 0 : -1}
                    onKeyDown={(event) => {
                      const index = statementTypes.findIndex(
                        (t) => t.id === type.id,
                      );
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % statementTypes.length
                          : event.key === "ArrowLeft"
                            ? (index + statementTypes.length - 1) %
                              statementTypes.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? statementTypes.length - 1
                                : -1;
                      if (next < 0) return;
                      event.preventDefault();
                      setStatement(statementTypes[next].id);
                      setFrom("");
                      setTo("");
                      setSelected(null);
                      document
                        .getElementById(`tab-${statementTypes[next].id}`)
                        ?.focus();
                    }}
                    onClick={() => {
                      setStatement(type.id);
                      setFrom("");
                      setTo("");
                      setSelected(null);
                    }}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
              <section
                id="statement-panel"
                role="tabpanel"
                aria-labelledby={`tab-${statement}`}
              >
                <div className="statement-heading">
                  <div>
                    <h2>
                      {statementTypes.find((t) => t.id === statement)?.label}
                    </h2>
                    <p>
                      {data
                        ? `${data.statement.currency} · ${data.statement.unit} · ${data.statement.basis} · ${data.statement.scope}`
                        : `Fiscal year end: ${selectedCompany.fiscal_year_end_month === 3 ? "31 March" : "31 December"} · Currency and units pending source review`}
                    </p>
                  </div>
                  {data ? (
                    <a
                      className="button"
                      href={`/api/v1/companies/${company}/export?${exportParams}`}
                    >
                      <ArrowDownToLine size={16} />
                      Export CSV
                    </a>
                  ) : (
                    <button
                      className="button"
                      disabled
                      title="Export will be available when statements are ready."
                    >
                      <ArrowDownToLine size={16} />
                      Export CSV
                    </button>
                  )}
                </div>
                {isSample ? (
                  <div className="sample-note" role="note">
                    Demo figures for product evaluation. They are not intended
                    for financial analysis.
                  </div>
                ) : null}
                <details className="display-options">
                  <summary>
                    Fiscal range ·{" "}
                    {selectedFrom && selectedTo
                      ? `${selectedFrom}–${selectedTo}`
                      : "Awaiting published periods"}
                  </summary>
                  <div className="filter-row">
                    <label>
                      From fiscal year
                      <select
                        value={selectedFrom}
                        disabled={!data}
                        onChange={(e) => {
                          setFrom(e.target.value);
                          setSelected(null);
                        }}
                      >
                        {years.length ? (
                          years
                            .filter((year) => year <= selectedTo)
                            .map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))
                        ) : (
                          <option value="">Not published</option>
                        )}
                      </select>
                    </label>
                    <label>
                      To fiscal year
                      <select
                        value={selectedTo}
                        disabled={!data}
                        onChange={(e) => {
                          setTo(e.target.value);
                          setSelected(null);
                        }}
                      >
                        {years.length ? (
                          years
                            .filter((year) => year >= selectedFrom)
                            .map((year) => (
                              <option key={year} value={year}>
                                {year}
                              </option>
                            ))
                        ) : (
                          <option value="">Not published</option>
                        )}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      disabled={!data}
                      onClick={() => {
                        setFrom("");
                        setTo("");
                      }}
                    >
                      Latest ten published periods
                    </button>
                  </div>
                </details>
                <div className="table-toolbar">
                  <label className="search-field">
                    <Search size={16} />
                    <span className="sr-only">
                      Search line items and historical labels
                    </span>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Find a line item or historical label"
                      disabled={!data}
                    />
                    {query ? (
                      <button
                        aria-label="Clear row search"
                        onClick={() => setQuery("")}
                      >
                        <X size={15} />
                      </button>
                    ) : null}
                  </label>
                  <label className="historical-toggle">
                    <input
                      type="checkbox"
                      checked={historical}
                      onChange={(e) => setHistorical(e.target.checked)}
                      disabled={!historicalCount}
                    />
                    Historical items ({historicalCount})
                  </label>
                </div>
                {response.loading ? (
                  <div className="table-loading" role="status">
                    <span />
                    Loading published statements…
                  </div>
                ) : response.error ? (
                  <EmptyState
                    error={response.error}
                    retry={() => setRetry((r) => r + 1)}
                  />
                ) : data ? (
                  <>
                    <div className="coverage-note">
                      {isSample
                        ? `${data.coverage.expectedPeriods} periods available`
                        : `${data.coverage.verifiedPeriods} / ${data.coverage.expectedPeriods} target periods verified`}
                      {!isSample && data.coverage.gaps.length
                        ? ` · ${data.coverage.gaps.length} coverage gaps`
                        : ""}
                      <button
                        className="text-button"
                        onClick={() => setView("quality")}
                      >
                        Review coverage <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <StatementTable
                      statement={visibleStatement ?? data.statement}
                      rows={rows}
                      inspect={setSelected}
                    />
                  </>
                ) : null}
              </section>
            </>
          ) : view === "filings" ? (
            <FilingsView key={company} company={company} retry={retry} />
          ) : (
            <QualityView
              company={company}
              version={data?.datasetVersion}
              retry={retry}
            />
          )}
        </main>
      </div>
      {selected && data ? (
        <SourceDrawer
          cell={selected}
          company={company}
          version={data.datasetVersion}
          close={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
