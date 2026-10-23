import { searchRows, type Published, type Statement } from "./contracts";
function csvCell(value: string, numeric = false): string {
  const safe = !numeric && /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function statementCsv(
  dataset: Published,
  statement: Statement,
  query = "",
  historical = false,
): string {
  const records: string[][] = [
    ["Dataset version", dataset.version],
    ["Company", dataset.data.companyId],
    ["Statement", statement.title],
    ["Scope", statement.scope],
    ["Basis", statement.basis],
    ["Currency", statement.currency],
    ["Units", statement.unit],
    ["Search filter", query || "None"],
    ["Historical items included", String(historical)],
    [
      "Line item",
      "Currency",
      "Units",
      ...statement.periods.map(
        (p) => `${p.label} (${p.start ?? "instant"} to ${p.end})`,
      ),
      "Sources",
    ],
  ];
  const output = records.map((row) => row.map((v) => csvCell(v)).join(","));
  for (const row of searchRows(statement.rows, query, historical)) {
    output.push(
      [
        csvCell(row.label),
        csvCell(row.currency),
        csvCell(row.unit),
        ...statement.periods.map((p) => {
          const cell = row.cells[p.id];
          return cell?.value !== null && cell?.value !== undefined
            ? csvCell(cell.value, true)
            : csvCell(cell?.state ?? "missing_history");
        }),
        csvCell(
          statement.periods
            .map((p) => {
              const cell = row.cells[p.id];
              return cell
                ? `${p.id}: filing ${cell.filingId}, PDF page ${cell.pdfPage}, observation ${cell.observationId}`
                : "";
            })
            .filter(Boolean)
            .join("; "),
        ),
      ].join(","),
    );
  }
  return output.join("\r\n");
}
