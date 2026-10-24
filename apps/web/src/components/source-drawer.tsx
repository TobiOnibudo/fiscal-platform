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
  if (comparative === "restated") return "Restated comparative";
  if (comparative === "updated") return "Updated comparative";
  return "Original report";
}

function reportYear(source: Filing | null) {
  return source?.published_on?.slice(0, 4) ?? "Not recorded";
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

  return (
    <dialog
      ref={dialog}
      className="source-drawer"
      onClose={close}
      aria-labelledby="source-title"
    >
      <div className="drawer-head">
        <div>
          <span className="muted">Source inspector</span>
          <h2 id="source-title">Reported value</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close source inspector"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="drawer-body">
        <p className="source-amount">
          {cell.value === null
            ? missingLabel(cell.state)
            : displayDecimal(cell.value)}
        </p>
        <p>
          {evidence.data
            ? `${evidence.data.units.currency} \u00b7 ${evidence.data.units.unit} \u00b7 ${evidence.data.period?.label ?? "Period unavailable"}`
            : evidence.error
              ? "Period and units unavailable. Reopen the inspector to retry."
              : "Loading period and units..."}
        </p>
        <dl>
          <dt>Original label</dt>
          <dd>{cell.rawLabel}</dd>
          <dt>Original value text</dt>
          <dd className="mono">{cell.rawText || "Blank in source"}</dd>
          <dt>Reporting version</dt>
          <dd>{reportingVersion(cell.comparative)}</dd>
          <dt>Source page</dt>
          <dd>
            PDF page {cell.pdfPage} {"\u00b7"} printed {cell.printedPage}
          </dd>
        </dl>
        {evidence.loading ? (
          <p role="status">Loading evidence...</p>
        ) : evidence.error ? (
          <p role="alert">
            Evidence could not load. Close and reopen the inspector to retry.
          </p>
        ) : (
          <>
            <h3>
              {evidence.data?.kind === "sample"
                ? "Review pending"
                : (source?.title ?? "Source record unavailable")}
            </h3>
            {evidence.data?.kind === "sample" ? (
              <p className="muted">
                Supporting source material has not completed review.
              </p>
            ) : null}
            {sourceUrl ? (
              <div className="source-links">
                <a
                  className="button"
                  href={`${sourceUrl.split("#")[0]}#page=${cell.pdfPage}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source page <ArrowUpRight size={16} />
                </a>
                <a href={sourceUrl} target="_blank" rel="noreferrer">
                  Full publisher document
                </a>
              </div>
            ) : null}
            {evidence.data?.kind !== "sample" ? (
              <p className="muted">
                PDF viewers may handle page links differently. Use the page
                references above if the document opens at the beginning.
              </p>
            ) : null}
            <details
              className="value-history"
              open={Boolean(evidence.data?.previousObservations.length)}
            >
              <summary>Value history</summary>
              <section className="history-current" aria-label="Current value">
                <span className="history-kicker">Current selection</span>
                <strong className="history-value">
                  {cell.value === null
                    ? missingLabel(cell.state)
                    : displayDecimal(cell.value)}
                </strong>
                <span className="history-context">
                  {reportingVersion(cell.comparative)} {"\u00b7"} report year{" "}
                  {reportYear(source ?? null)}
                </span>
              </section>
              {evidence.data?.previousObservations.length ? (
                <div
                  className="history-list"
                  aria-label="Earlier reported values"
                >
                  {evidence.data.previousObservations.map((previous) => (
                    <article
                      className="history-entry"
                      key={previous.cell.observationId}
                    >
                      <div className="history-entry-head">
                        <span className="history-kicker">
                          {reportingVersion(previous.cell.comparative)}
                        </span>
                        <strong className="history-value">
                          {previous.cell.value === null
                            ? missingLabel(previous.cell.state)
                            : displayDecimal(previous.cell.value)}
                        </strong>
                      </div>
                      <dl className="history-metadata">
                        <div>
                          <dt>Fiscal period</dt>
                          <dd>{previous.period.label}</dd>
                        </div>
                        <div>
                          <dt>Report year</dt>
                          <dd>{reportYear(previous.source)}</dd>
                        </div>
                        <div className="history-source">
                          <dt>Reported in</dt>
                          <dd>
                            {previous.source?.title ??
                              "Source record unavailable"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">
                  No earlier compatible reported value is available.
                </p>
              )}
              {evidence.data?.row.aliases.length ? (
                <p className="history-aliases">
                  Historical labels: {evidence.data.row.aliases.join(", ")}
                </p>
              ) : null}
            </details>
          </>
        )}
      </div>
    </dialog>
  );
}
