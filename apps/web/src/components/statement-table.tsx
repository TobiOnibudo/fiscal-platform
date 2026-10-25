"use client";

import { Fragment } from "react";
import {
  displayDecimal,
  type Cell,
  type Row,
  type Statement,
} from "@/lib/contracts";
export { displayRowLabel } from "@/lib/display-label";
import { displayRowLabel } from "@/lib/display-label";

export function missingLabel(state: string) {
  return state === "not_reported"
    ? "Not reported"
    : state === "unreadable"
      ? "Unreadable"
      : "Missing history";
}

function unitKey(row: Row) {
  return `${row.currency}\u0000${row.unit}`;
}

function unitLabel(row: Row) {
  return `${row.currency} \u00b7 ${row.unit}`;
}

function primaryUnitKey(rows: Row[]) {
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(unitKey(row), (counts.get(unitKey(row)) ?? 0) + 1);
  return [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];
}

function groupRows(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows)
    groups.set(row.label, [...(groups.get(row.label) ?? []), row]);
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}

function StatementRow({
  row,
  statement,
  inspect,
  primaryUnit,
  showUnitAsLabel,
}: {
  row: Row;
  statement: Statement;
  inspect: (cell: Cell) => void;
  primaryUnit: string | undefined;
  showUnitAsLabel: boolean;
}) {
  return (
    <tr className={row.kind}>
      <th scope="row">
        <div
          className="line-item"
          style={{
            paddingLeft: `calc(var(--space-5) + ${row.depth + Number(showUnitAsLabel)} * var(--space-4))`,
          }}
        >
          <span className="line-item-label">
            {showUnitAsLabel ? unitLabel(row) : displayRowLabel(row.label)}
          </span>
          {!showUnitAsLabel && unitKey(row) !== primaryUnit ? (
            <small className="line-item-unit">{unitLabel(row)}</small>
          ) : null}
          {row.aliases.length ? (
            <details style={{ marginTop: 3, border: 0, padding: 0 }}>
              <summary style={{ fontSize: 10 }}>
                Earlier reporting names
              </summary>
              <span
                style={{ display: "block", marginTop: 4, whiteSpace: "normal" }}
              >
                {row.aliases.map(displayRowLabel).join(" \u00b7 ")}
              </span>
            </details>
          ) : null}
          {row.historical ? <small>Historical item</small> : null}
        </div>
      </th>
      {statement.periods.map((period) => {
        const cell = row.cells[period.id];
        return (
          <td key={period.id}>
            {row.kind === "section" ? null : cell?.value !== null &&
              cell?.value !== undefined ? (
              <button
                className="amount"
                onClick={() => inspect(cell)}
                aria-label={`${displayRowLabel(row.label)}, ${period.label}, ${cell.value} ${row.currency} ${row.unit}; inspect source`}
              >
                {displayDecimal(cell.value)}
              </button>
            ) : (
              <span
                className="missing"
                title={missingLabel(cell?.state ?? "missing_history")}
                aria-label={missingLabel(cell?.state ?? "missing_history")}
              >
                {cell?.state === "not_reported"
                  ? "n/r"
                  : cell?.state === "unreadable"
                    ? "?"
                    : "\u2014"}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

export function StatementTable({
  statement,
  rows,
  inspect,
}: {
  statement: Statement;
  rows: Row[];
  inspect: (cell: Cell) => void;
}) {
  const primaryUnit = primaryUnitKey(rows);
  const primaryRow = rows.find((row) => unitKey(row) === primaryUnit);
  const mixedUnits = new Set(rows.map(unitKey)).size > 1;
  const groupedRows = groupRows(rows);
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      aria-label="Financial statement; scroll horizontally for more periods"
    >
      <table>
        <caption className="sr-only">
          {statement.title}.{" "}
          {mixedUnits
            ? "The primary currency and unit apply unless a row identifies an exception."
            : `${statement.currency}, ${statement.unit}.`}{" "}
          Rows follow the company’s latest reporting order. Select an amount to
          inspect its source.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              Line item
              {primaryRow ? (
                <small className="primary-unit">{unitLabel(primaryRow)}</small>
              ) : null}
            </th>
            {statement.periods.map((period) => (
              <th scope="col" key={period.id}>
                <span>{period.label}</span>
                <small>{period.end}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((group) => {
            const hasVariants = group.rows.length > 1;
            return (
              <Fragment key={group.label}>
                {hasVariants ? (
                  <tr className="section row-group">
                    <th scope="rowgroup">
                      <div className="line-item">
                        <span className="line-item-label">
                          {displayRowLabel(group.label)}
                        </span>
                        <small>
                          Reported in more than one currency or unit
                        </small>
                      </div>
                    </th>
                    <td colSpan={statement.periods.length}>
                      Amounts remain in the reporting currency shown below.
                    </td>
                  </tr>
                ) : null}
                {group.rows.map((row) => (
                  <StatementRow
                    key={row.id}
                    row={row}
                    statement={statement}
                    inspect={inspect}
                    primaryUnit={primaryUnit}
                    showUnitAsLabel={hasVariants}
                  />
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="no-results">
          No line items match this search. Clear the search to see the
          statement.
        </p>
      ) : null}
    </div>
  );
}
