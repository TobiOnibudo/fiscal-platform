"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  BookOpen,
  ChevronRight,
  FileText,
  Layers,
  Search,
  TrendingUp,
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
import { FilingsView } from "./collection-views";
import { TrendsKpi } from "./trends-kpi";
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
  const [yearQuery, setYearQuery] = useState("");
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
  const years = Array.from(
    new Set(data?.statement.periods.map((p) => p.end.slice(0, 4)) ?? []),
  ).sort();
  const selectedFrom = from || years[0] || "";
  const selectedTo = to || years.at(-1) || "";
  const matchingYears = years.filter((year) => {
    const matchesQuery = `fiscal year ${year}`.includes(
      yearQuery.trim().toLowerCase(),
    );
    return matchesQuery || year === selectedFrom || year === selectedTo;
  });
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
  const statementUnits = new Set(
    data?.statement.rows.map((row) => `${row.currency} · ${row.unit}`) ?? [],
  );
  const unitSummary =
    statementUnits.size > 1
      ? "Multiple currencies / units · shown per line item"
      : data
        ? `${data.statement.currency} · ${data.statement.unit}`
        : "Currency and units available after publication";
  const historicalCount =
    data?.statement.rows.filter((r) => r.historical).length ?? 0;
  const viewLabel =
    view === "trends"
      ? "Trends & KPIs"
      : view === "filings"
        ? "Filings"
        : "Financial statements";
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
    setYearQuery("");
  }
  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to financial statements
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
        <nav aria-label="Workspace navigation">
          {[
            { id: "statements", name: "Statements", icon: BookOpen },
            { id: "trends", name: "Trends & KPIs", icon: TrendingUp },
            { id: "filings", name: "Filings", icon: FileText },
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
            {viewLabel} <ChevronRight size={14} />
            <strong>{selectedCompany.name}</strong>
          </span>
        </header>
        <main
          id="workspace"
          className={
            view === "statements"
              ? "statement-workspace"
              : view === "trends"
                ? "trends-workspace"
                : undefined
          }
        >
          {view !== "trends" ? (
            <div className="page-heading">
              <div>
                <h1>{selectedCompany.name}</h1>
                <p>Consolidated financial statements</p>
              </div>
            </div>
          ) : null}
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
                        ? `${unitSummary} · ${data.statement.basis} · ${data.statement.scope}`
                        : `Fiscal year end: ${selectedCompany.fiscal_year_end_month === 3 ? "31 March" : "31 December"} · ${unitSummary}`}
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
                <details className="display-options" open>
                  <summary>
                    Fiscal years ·{" "}
                    {selectedFrom && selectedTo
                      ? `${selectedFrom} to ${selectedTo}`
                      : "Awaiting published periods"}
                  </summary>
                  <div className="filter-row fiscal-range-picker">
                    <label className="fiscal-year-search">
                      Search fiscal years
                      <input
                        type="search"
                        value={yearQuery}
                        onChange={(event) => setYearQuery(event.target.value)}
                        placeholder="e.g. 2021"
                        disabled={!data}
                      />
                    </label>
                    <label>
                      From
                      <select
                        aria-label="From fiscal year"
                        value={selectedFrom}
                        disabled={!data}
                        onChange={(event) => {
                          setFrom(event.target.value);
                          setSelected(null);
                        }}
                      >
                        {matchingYears
                          .filter((year) => year <= selectedTo)
                          .map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      To
                      <select
                        aria-label="To fiscal year"
                        value={selectedTo}
                        disabled={!data}
                        onChange={(event) => {
                          setTo(event.target.value);
                          setSelected(null);
                        }}
                      >
                        {matchingYears
                          .filter((year) => year >= selectedFrom)
                          .map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))}
                      </select>
                    </label>
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
                    <StatementTable
                      key={statement}
                      statement={visibleStatement ?? data.statement}
                      rows={rows}
                      inspect={setSelected}
                      forceExpanded={Boolean(query.trim())}
                    />
                  </>
                ) : null}
              </section>
            </>
          ) : view === "trends" ? (
            <TrendsKpi key={company} company={company} />
          ) : view === "filings" ? (
            <FilingsView key={company} company={company} retry={retry} />
          ) : null}
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
