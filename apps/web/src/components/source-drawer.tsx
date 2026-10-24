"use client";
import { useEffect, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import {
  displayDecimal,
  safeSource,
  type Cell,
  type Statement,
  type Filing,
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
    unit: string;
    currency: string;
  }[];
};
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
            ? `${evidence.data.units.currency} · ${evidence.data.units.unit} · ${evidence.data.period?.label ?? "Period unavailable"}`
            : evidence.error
              ? "Period and units unavailable. Reopen the inspector to retry."
              : "Loading period and units…"}
        </p>
        <dl>
          <dt>Original label</dt>
          <dd>{cell.rawLabel}</dd>
          <dt>Original value text</dt>
          <dd className="mono">{cell.rawText || "Blank in source"}</dd>
          <dt>Reporting version</dt>
          <dd>
            {cell.comparative === "original"
              ? "Original observation"
              : cell.comparative === "restated"
                ? "Restated by source"
                : "Updated comparative"}
          </dd>
          <dt>Source page</dt>
          <dd>
            PDF page {cell.pdfPage} · printed {cell.printedPage}
          </dd>
        </dl>
        {evidence.loading ? (
          <p role="status">Loading evidence…</p>
        ) : evidence.error ? (
          <p role="alert">
            Evidence could not load. Close and reopen the inspector to retry.
          </p>
        ) : (
          <>
            <h3>
              {evidence.data?.kind === "sample"
                ? "Demo value"
                : (source?.title ?? "Source record unavailable")}
            </h3>
            {evidence.data?.kind === "sample" ? (
              <p className="muted">
                Supporting source material is not included in this demo.
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
            <details>
              <summary>Selection and label history</summary>
              <p>
                The clean view follows the latest approved statement structure
                and latest compatible observation for each period.
              </p>
              <p>
                {evidence.data?.previousObservations.length
                  ? "Previously reported values are shown below."
                  : "No previously reported values are available."}
              </p>
              {evidence.data?.previousObservations.length ? (
                <ul className="gap-list">
                  {evidence.data.previousObservations.map((previous) => (
                    <li key={previous.cell.observationId}>
                      {previous.cell.value === null
                        ? missingLabel(previous.cell.state)
                        : displayDecimal(previous.cell.value)}{" "}
                      {previous.currency} {previous.unit} · original label:{" "}
                      {previous.cell.rawLabel} · PDF page{" "}
                      {previous.cell.pdfPage} · printed{" "}
                      {previous.cell.printedPage}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                Historical aliases:{" "}
                {evidence.data?.row.aliases.join(", ") || "None recorded"}
              </p>
            </details>
          </>
        )}
      </div>
    </dialog>
  );
}
