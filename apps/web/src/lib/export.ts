import { searchRows, type Published, type Statement } from "./contracts";
function csvCell(value: string, numeric = false): string {
  const safe =
    !numeric && /^(?:[ \t\r\n]*[=+\-@]|[\t\r\n])/.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function statementCsv(
  dataset: Published,
  statement: Statement,
  query = "",
  historical = false,
): string {
  const output = [
    ["Line item", "Currency", "Units", ...statement.periods.map((p) => p.label)]
      .map((value) => csvCell(value))
      .join(","),
  ];
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
            : csvCell("");
        }),
      ].join(","),
    );
  }
  return output.join("\r\n");
}
