"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, FileText, X } from "lucide-react";
import {
  displayDecimal,
  safeSource,
  type Cell,
  type Filing,
  type Statement,
} from "@/lib/contracts";
import { useReview } from "./review-client";
import { missingLabel } from "./statement-table";

type Evidence = {
  datasetVersion: string;
  kind: "sample" | "verified";
  selected: Cell;
  period: Statement["periods"][number];
  row: { label: string; aliases: string[] };
  units: { currency: string; unit: string; basis: string; scope: string };
  source: Filing | null;
  historyStatus: string;
  previousObservations: {
    cell: Cell;
    period: Statement["periods"][number];
    unit: string;
    currency: string;
    source: Filing | null;
  }[];
};

function reportingVersion(comparative: Cell["comparative"]) {
  if (comparative === "restated") return "Restated";
  if (comparative === "updated") return "Updated";
  return "Original";
}

function reportingVersionDetail(comparative: Cell["comparative"]) {
  if (comparative === "restated") return "Restated by the source";
  if (comparative === "updated") return "Updated comparative";
  return "As originally reported";
}

function treatmentDefinition(comparative: Cell["comparative"]) {
  if (comparative === "restated")
    return "A prior-period amount the company explicitly identifies as revised or restated.";
  if (comparative === "updated")
    return "Shown again in a later filing as comparative information; the amount may be unchanged.";
  return null;
}

function reportYear(source: Filing | null) {
  return (
    source?.published_on?.slice(0, 4) ??
    source?.title.match(/\b(?:19|20)\d{2}\b/)?.[0] ??
    "—"
  );
}

export function SourceDrawer({
  cell,
  company,
  version,
  close,
}: {
  cell: Cell;
  company: string;
  version: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const evidence = useReview<Evidence>(
    `observations/${encodeURIComponent(cell.observationId)}/history?company=${company}&version=${version}`,
    0,
  );

  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const source = evidence.data?.source;
  const sourceUrl = source ? safeSource(source.source_url) : undefined;
  const selectedValue =
    cell.value === null ? missingLabel(cell.state) : displayDecimal(cell.value);
  const treatmentDefinitions = [
    cell.comparative,
    ...(evidence.data?.previousObservations.map(
      (previous) => previous.cell.comparative,
    ) ?? []),
  ].filter(
    (comparative, index, values) =>
      treatmentDefinition(comparative) !== null &&
      values.indexOf(comparative) === index,
  );

  return (
    <dialog
      ref={dialog}
      className="source-drawer"
      onClose={close}
      aria-labelledby="source-title"
    >
      <header className="drawer-head">
        <div>
          <h2 id="source-title">Value details</h2>
          <p>{evidence.data?.row.label ?? cell.rawLabel}</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close source inspector"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="drawer-body">
        {evidence.loading ? (
          <p role="status">Loading value details...</p>
        ) : evidence.error ? (
          <p role="alert">
            Value details could not load. Close and reopen the inspector to
            retry.
          </p>
        ) : (
          <>
            <section className="selected-value" aria-label="Selected value">
              <span className="drawer-label">Selected reported value</span>
              <div className="selected-value-row">
                <p className="source-amount">{selectedValue}</p>
                <span
                  className={`reporting-status reporting-status-${cell.comparative}`}
                >
                  {reportingVersion(cell.comparative)}
                </span>
              </div>
              {evidence.data ? (
                <dl className="value-context">
                  <div>
                    <dt>Period</dt>
                    <dd>{evidence.data.period.label}</dd>
                  </div>
                  <div>
                    <dt>Units</dt>
                    <dd>
                      {evidence.data.units.currency} ·{" "}
                      {evidence.data.units.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Treatment</dt>
                    <dd>{reportingVersionDetail(cell.comparative)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="selected-value-context">Period unavailable</p>
              )}
            </section>

            <section
              className="source-record"
              aria-labelledby="source-record-title"
            >
              <h3 id="source-record-title">Source</h3>
              <dl className="source-fields">
                <div>
                  <dt>Reported label</dt>
                  <dd>{cell.rawLabel}</dd>
                </div>
                <div>
                  <dt>Reported text</dt>
                  <dd className="reported-text">{cell.rawText}</dd>
                </div>
                <div>
                  <dt>Source page</dt>
                  <dd>
                    PDF page {cell.pdfPage}
                    {cell.printedPage ? ` · printed ${cell.printedPage}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Filing</dt>
                  <dd>
                    {sourceUrl ? (
                      <a
                        className="source-link"
                        href={`${sourceUrl.split("#")[0]}#page=${cell.pdfPage}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText size={15} aria-hidden="true" />
                        {source?.title ?? "Open publisher document"}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      (source?.title ?? "No filing linked")
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              className="history-section"
              aria-labelledby="history-title"
            >
              <div className="history-heading">
                <div>
                  <h3 id="history-title">Value history</h3>
                  <p>How this value appeared across successive filings.</p>
                </div>
                <span>
                  {(evidence.data?.previousObservations.length ?? 0) + 1}{" "}
                  {(evidence.data?.previousObservations.length ?? 0) === 0
                    ? "record"
                    : "records"}
                </span>
              </div>
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th scope="col">Filing year</th>
                      <th scope="col">Reported value</th>
                      <th scope="col">Treatment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="history-current-row">
                      <td>{reportYear(source ?? null)}</td>
                      <td>{selectedValue}</td>
                      <td>
                        <span
                          className={`history-status history-status-${cell.comparative}`}
                        >
                          {reportingVersion(cell.comparative)}
                        </span>
                      </td>
                    </tr>
                    {evidence.data?.previousObservations.map((previous) => (
                      <tr key={previous.cell.observationId}>
                        <td>{reportYear(previous.source)}</td>
                        <td>
                          {previous.cell.value === null
                            ? missingLabel(previous.cell.state)
                            : displayDecimal(previous.cell.value)}
                        </td>
                        <td>
                          <span
                            className={`history-status history-status-${previous.cell.comparative}`}
                          >
                            {reportingVersion(previous.cell.comparative)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {treatmentDefinitions.length ? (
                <dl
                  className="history-definitions"
                  aria-label="Treatment definitions"
                >
                  {treatmentDefinitions.map((comparative) => (
                    <div key={comparative}>
                      <dt>{reportingVersion(comparative)}</dt>
                      <dd>{treatmentDefinition(comparative)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {!evidence.data?.previousObservations.length ? (
                <p className="history-empty">
                  This is the earliest compatible filing available for this
                  value.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
