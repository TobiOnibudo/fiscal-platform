"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

function consolidationLabel(row: Row) {
  return row.label.toLocaleLowerCase("en") === "transaction revenue"
    ? "Revenue"
    : row.label;
}

function financialAmount(value: string, row: Row) {
  const unit = row.unit.toLowerCase();
  const numeric = Number(value);
  const formatAmount = (amount: string, suffix = "") => {
    const negative = amount.startsWith("-");
    const absoluteAmount = negative ? amount.slice(1) : amount;
    return `${negative ? "−" : ""}${displayDecimal(absoluteAmount)}${suffix}`;
  };
  if (Number.isFinite(numeric) && unit.includes("thousand"))
    return formatAmount((numeric / 1000).toFixed(1), "m");
  if (unit.includes("million") || unit.includes("'000") || unit.includes("000"))
    return formatAmount(value, "m");
  return formatAmount(value);
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
    groups.set(consolidationLabel(row), [
      ...(groups.get(consolidationLabel(row)) ?? []),
      row,
    ]);
  return [...groups.entries()].map(([label, rows]) => ({ label, rows }));
}

type DisplayRow = {
  row: Row;
  alternateUnits: Record<string, string>;
  restatedPeriods: Record<string, boolean>;
  hasMixedUnits: boolean;
};

type DisplayGroup = {
  id: string;
  label: string;
  rows: DisplayRow[];
};

function groupLabel(statement: Statement, row: Row) {
  const label = row.label.toLocaleLowerCase("en");
  if (statement.id === "income") {
    if (
      /per share|earnings per share|weighted average shares|basic|diluted/.test(
        label,
      )
    )
      return "Per-share data";
    if (
      /comprehensive|foreign currency translation|available-for-sale/.test(
        label,
      )
    )
      return "Other comprehensive income";
    if (/revenue|customer balances/.test(label)) return "Revenue";
    if (/cost of sales|cost of revenue|costs?/.test(label)) return "Costs";
    if (
      /operating expense|research|administrative|employee|marketing/.test(label)
    )
      return "Operating expenses";
    if (/profit|income before|income after|taxation|tax expense/.test(label))
      return "Profitability";
  }
  if (statement.id === "balance") {
    if (
      /cash|asset|receivable|inventory|property|equipment|goodwill/.test(label)
    )
      return "Assets";
    if (/liabilit|payable|borrowings|debt|deposit/.test(label))
      return "Liabilities";
    if (/equity|share capital|retained earnings/.test(label)) return "Equity";
  }
  if (statement.id === "cashflow") {
    if (/operating|profit|income tax/.test(label))
      return "Operating activities";
    if (/investing|property|equipment|intangible|acquisition/.test(label))
      return "Investing activities";
    if (/financing|borrowings|debt|dividend|share capital/.test(label))
      return "Financing activities";
  }
  return "Other reported items";
}

function groupDisplayRows(
  statement: Statement,
  rows: DisplayRow[],
): DisplayGroup[] {
  const groups = new Map<string, DisplayGroup>();
  for (const row of rows) {
    const label = groupLabel(statement, row.row);
    const current = groups.get(label);
    if (current) current.rows.push(row);
    else
      groups.set(label, {
        id: `${label}-${groups.size}`,
        label,
        rows: [row],
      });
  }
  return [...groups.values()].sort(
    (left, right) =>
      Number(left.label === "Other reported items") -
      Number(right.label === "Other reported items"),
  );
}

function consolidateRows(
  rows: Row[],
  primaryUnit: string | undefined,
): DisplayRow[] {
  return groupRows(rows).map((group) => {
    const ordered = [...group.rows].sort(
      (left, right) =>
        Number(unitKey(right) === primaryUnit) -
        Number(unitKey(left) === primaryUnit),
    );
    const anchor = ordered[0];
    const selected = new Map<string, Row>();

    for (const row of ordered) {
      for (const [periodId, cell] of Object.entries(row.cells)) {
        const current = selected.get(periodId);
        if (
          !current ||
          (current.cells[periodId].value === null && cell.value !== null)
        )
          selected.set(periodId, row);
      }
    }

    const alternateUnits: Record<string, string> = {};
    const restatedPeriods: Record<string, boolean> = {};
    const cells = Object.fromEntries(
      [...selected.entries()].map(([periodId, sourceRow]) => {
        if (unitKey(sourceRow) !== unitKey(anchor))
          alternateUnits[periodId] =
            `${sourceRow.currency} · ${sourceRow.unit}`;
        if (
          consolidationLabel(sourceRow) === "Revenue" &&
          sourceRow.currency === "USD"
        )
          restatedPeriods[periodId] = true;
        return [periodId, sourceRow.cells[periodId]];
      }),
    );

    return {
      row: { ...anchor, label: consolidationLabel(anchor), cells },
      alternateUnits,
      restatedPeriods,
      hasMixedUnits: new Set(group.rows.map(unitKey)).size > 1,
    };
  });
}

function StatementRow({
  row,
  statement,
  inspect,
  alternateUnits,
  restatedPeriods,
  hasMixedUnits,
}: {
  row: Row;
  statement: Statement;
  inspect: (cell: Cell) => void;
  alternateUnits: Record<string, string>;
  restatedPeriods: Record<string, boolean>;
  hasMixedUnits: boolean;
}) {
  return (
    <tr className={row.kind}>
      <th scope="row">
        <div
          className="line-item"
          style={{
            paddingLeft: `calc(var(--space-5) + ${row.depth} * var(--space-4))`,
          }}
        >
          <span className="line-item-label">{displayRowLabel(row.label)}</span>
          <small
            className="line-item-unit"
            title={
              hasMixedUnits
                ? "Values retain the currency and unit reported for each year."
                : undefined
            }
          >
            {hasMixedUnits
              ? "Mixed reporting units"
              : `${row.currency} · ${row.unit}`}
          </small>
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
        const alternateUnit = alternateUnits[period.id];
        const restated = restatedPeriods[period.id];
        return (
          <td key={period.id}>
            {row.kind === "section" ? null : cell?.value !== null &&
              cell?.value !== undefined ? (
              <>
                <button
                  className="amount"
                  onClick={() => inspect(cell)}
                  aria-label={`${displayRowLabel(row.label)}, ${period.label}, ${cell.value} ${alternateUnit ?? `${row.currency} ${row.unit}`}; inspect source`}
                >
                  {financialAmount(cell.value, row)}
                </button>
                {alternateUnit ? (
                  <span className="sr-only">{alternateUnit}</span>
                ) : null}
                {restated ? (
                  <small className="amount-note">Restated USD</small>
                ) : null}
              </>
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
  forceExpanded = false,
}: {
  statement: Statement;
  rows: Row[];
  inspect: (cell: Cell) => void;
  forceExpanded?: boolean;
}) {
  const primaryUnit = primaryUnitKey(rows);
  const mixedUnits = new Set(rows.map(unitKey)).size > 1;
  const displayRows = consolidateRows(rows, primaryUnit);
  const displayGroups = groupDisplayRows(statement, displayRows);
  const periodCount = Math.max(statement.periods.length, 1);
  // Keep the labels comfortably readable by default while letting analysts
  // make space for unusually long reporting names.
  const defaultLabelColumnWidth = 220;
  const [labelColumnPreference, setLabelColumnPreference] = useState(
    defaultLabelColumnWidth,
  );
  const [availableTableWidth, setAvailableTableWidth] = useState<number>();
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const minimumLabelColumnWidth = 180;
  const minimumPeriodColumnWidth = 72;
  const fallbackTableWidth =
    defaultLabelColumnWidth + periodCount * (periodCount >= 8 ? 92 : 108);
  const measuredWidth = availableTableWidth ?? fallbackTableWidth;
  const labelColumnWidth = Math.min(
    labelColumnPreference,
    Math.max(
      minimumLabelColumnWidth,
      measuredWidth - periodCount * minimumPeriodColumnWidth,
    ),
  );
  const periodColumnWidth = Math.max(
    minimumPeriodColumnWidth,
    Math.floor((measuredWidth - labelColumnWidth) / periodCount),
  );
  const tableWidth = labelColumnWidth + periodCount * periodColumnWidth;
  const tableStyle = {
    width: `${tableWidth}px`,
    minWidth: `${tableWidth}px`,
  } satisfies CSSProperties;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const allExpanded =
    forceExpanded ||
    displayGroups.every((group) => !collapsedGroups.has(group.id));

  function toggleGroup(id: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllGroups() {
    setCollapsedGroups(
      allExpanded ? new Set(displayGroups.map((group) => group.id)) : new Set(),
    );
  }

  function resizeLabelColumn(nextWidth: number) {
    setLabelColumnPreference(Math.min(620, Math.max(220, nextWidth)));
  }

  useEffect(() => {
    const element = tableScrollRef.current;
    if (!element) return;
    const updateWidth = () => setAvailableTableWidth(element.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={tableScrollRef}
      className="table-scroll"
      tabIndex={0}
      aria-label="Financial statement by fiscal year"
    >
      <table
        className="statement-table"
        data-period-count={statement.periods.length}
        style={tableStyle}
      >
        <colgroup>
          <col style={{ width: `${labelColumnWidth}px` }} />
          {statement.periods.map((period) => (
            <col key={period.id} style={{ width: `${periodColumnWidth}px` }} />
          ))}
        </colgroup>
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
              <span
                className="column-resize-handle"
                role="separator"
                aria-label="Resize line item column. Use left and right arrow keys, or drag."
                aria-orientation="vertical"
                aria-valuemin={220}
                aria-valuemax={620}
                aria-valuenow={labelColumnWidth}
                tabIndex={0}
                title="Drag to resize labels. Double-click to reset."
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    resizeLabelColumn(labelColumnWidth - 20);
                  }
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    resizeLabelColumn(labelColumnWidth + 20);
                  }
                }}
                onPointerDown={(event) => {
                  resizeStart.current = {
                    x: event.clientX,
                    width: labelColumnWidth,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const start = resizeStart.current;
                  if (
                    !start ||
                    !event.currentTarget.hasPointerCapture(event.pointerId)
                  )
                    return;
                  resizeLabelColumn(start.width + event.clientX - start.x);
                }}
                onPointerUp={(event) => {
                  resizeStart.current = null;
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }}
                onDoubleClick={() => resizeLabelColumn(defaultLabelColumnWidth)}
              />
              {displayGroups.length > 1 ? (
                <button
                  type="button"
                  className="table-density-toggle"
                  onClick={toggleAllGroups}
                >
                  {allExpanded ? "Collapse sections" : "Expand sections"}
                </button>
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
          {displayGroups.flatMap((group) => {
            const expanded = forceExpanded || !collapsedGroups.has(group.id);
            return [
              <tr className="section" key={`${group.id}-heading`}>
                <th scope="rowgroup" colSpan={statement.periods.length + 1}>
                  <button
                    type="button"
                    className="section-toggle"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.id)}
                  >
                    {expanded ? (
                      <ChevronDown size={15} aria-hidden="true" />
                    ) : (
                      <ChevronRight size={15} aria-hidden="true" />
                    )}
                    <span>{group.label}</span>
                    <small>{group.rows.length} items</small>
                  </button>
                </th>
              </tr>,
              ...(expanded
                ? group.rows.map(
                    ({
                      row,
                      alternateUnits,
                      restatedPeriods,
                      hasMixedUnits,
                    }) => (
                      <StatementRow
                        key={row.id}
                        row={row}
                        statement={statement}
                        inspect={inspect}
                        alternateUnits={alternateUnits}
                        restatedPeriods={restatedPeriods}
                        hasMixedUnits={hasMixedUnits}
                      />
                    ),
                  )
                : []),
            ];
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
