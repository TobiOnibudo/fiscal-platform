"use client";
import {
  displayDecimal,
  type Statement,
  type Row,
  type Cell,
} from "@/lib/contracts";
export function missingLabel(state: string) {
  return state === "not_reported"
    ? "Not reported"
    : state === "unreadable"
      ? "Unreadable"
      : "Missing history";
}

function comparativeLabel(comparative: Cell["comparative"]) {
  return comparative === "restated" ? "Restated" : "Updated";
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
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      aria-label="Financial statement; scroll horizontally for more periods"
    >
      <table>
        <caption className="sr-only">
          {statement.title}. {statement.currency}, {statement.unit}. Select an
          amount to inspect its source.
        </caption>
        <thead>
          <tr>
            <th scope="col">Line item</th>
            {statement.periods.map((period) => (
              <th scope="col" key={period.id}>
                <span>{period.label}</span>
                <small>{period.end}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.kind}>
              <th
                scope="row"
                style={{
                  paddingLeft: `calc(var(--space-5) + ${row.depth} * var(--space-4))`,
                }}
              >
                {row.label}
                {row.currency !== statement.currency ||
                row.unit !== statement.unit ? (
                  <small>
                    {row.currency} · {row.unit}
                  </small>
                ) : null}
                {row.historical ? <small>Historical item</small> : null}
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
                        aria-label={`${row.label}, ${period.label}, ${cell.value} ${row.currency} ${row.unit}; ${cell.comparative === "original" ? "as originally reported" : comparativeLabel(cell.comparative)}; inspect source`}
                      >
                        <span className="amount-value">
                          {displayDecimal(cell.value)}
                        </span>
                        {cell.comparative !== "original" ? (
                          <span
                            className={`comparative comparative-${cell.comparative}`}
                          >
                            {comparativeLabel(cell.comparative)}
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span
                        className="missing"
                        title={missingLabel(cell?.state ?? "missing_history")}
                        aria-label={missingLabel(
                          cell?.state ?? "missing_history",
                        )}
                      >
                        {cell?.state === "not_reported"
                          ? "n/r"
                          : cell?.state === "unreadable"
                            ? "?"
                            : "—"}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
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
