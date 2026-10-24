"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
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
    datasetVersion: string;
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

function reportYear(source: Filing | null) {
  return source?.published_on?.slice(0, 4) ?? "—";
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

  return (
    <dialog
      ref={dialog}
      className="source-drawer"
      onClose={close}
      aria-labelledby="source-title"
    >
      <header className="drawer-head">
        <div>
          <h2 id="source-title">Source &amp; history</h2>
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
              <p className="source-amount">{selectedValue}</p>
              <p className="selected-value-context">
                {evidence.data
                  ? `${evidence.data.units.currency} ${evidence.data.units.unit} · ${evidence.data.period.label}`
                  : "Period unavailable"}
              </p>
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
                  <dt>Source page</dt>
                  <dd>PDF page {cell.pdfPage}</dd>
                </div>
                <div>
                  <dt>Filing</dt>
                  <dd>
                    {sourceUrl ? (
                      <a
                        href={`${sourceUrl.split("#")[0]}#page=${cell.pdfPage}`}
                        target="_blank"
                        rel="noreferrer"
                      >
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
              <h3 id="history-title">Value history</h3>
              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th scope="col">Report year</th>
                      <th scope="col">Value</th>
                      <th scope="col">Treatment</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="history-current-row">
                      <td>{reportYear(source ?? null)}</td>
                      <td>{selectedValue}</td>
                      <td>{reportingVersion(cell.comparative)}</td>
                    </tr>
                    {evidence.data?.previousObservations.map((previous) => (
                      <tr key={previous.cell.observationId}>
                        <td>{reportYear(previous.source)}</td>
                        <td>
                          {previous.cell.value === null
                            ? missingLabel(previous.cell.state)
                            : displayDecimal(previous.cell.value)}
                        </td>
                        <td>{reportingVersion(previous.cell.comparative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!evidence.data?.previousObservations.length ? (
                <p className="history-empty">
                  No earlier compatible report is available.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
