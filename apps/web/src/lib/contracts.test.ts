import { describe, expect, it } from "vitest";
import {
  cellSchema,
  datasetSchema,
  statementSchema,
  decimal,
  displayDecimal,
  safeSource,
  searchRows,
  type Row,
  type Published,
} from "./contracts";
import { querySchema } from "./api";
import { statementCsv } from "./export";
import sharedSyntheticFixture from "../../../../contracts/fixtures/synthetic-dataset.v1.json";

// Synthetic contract examples only. These are not company financial data.
const cell = {
  value: "9007199254740993.123456789",
  state: "reported" as const,
  observationId: "synthetic-observation",
  filingId: "synthetic-filing",
  rawLabel: "Synthetic amount",
  rawText: "9007199254740993.123456789",
  pdfPage: 2,
  printedPage: "A1",
  comparative: "updated" as const,
};
const rows: Row[] = [
  {
    id: "section",
    label: "Operations",
    currency: "XXX",
    unit: "units",
    aliases: [],
    depth: 0,
    kind: "section",
    historical: false,
    cells: {},
  },
  {
    id: "cost",
    label: "Administrative costs",
    currency: "XXX",
    unit: "units",
    aliases: ["Administrative expenses"],
    depth: 1,
    kind: "item",
    historical: false,
    cells: { "2025": cell },
  },
  {
    id: "old",
    label: "Discontinued item",
    currency: "XXX",
    unit: "units",
    aliases: [],
    depth: 0,
    kind: "item",
    historical: true,
    cells: {},
  },
];
describe("financial read contracts", () => {
  it("accepts the shared pipeline synthetic publication contract", () => {
    const dataset = datasetSchema.parse(sharedSyntheticFixture);
    expect(dataset.statements.map(statement => statement.id).sort()).toEqual(["balance", "cashflow", "income"]);
    expect(dataset.statements.every(statement => statement.periods.length === 10)).toBe(true);
  });
  it("preserves decimal precision and rejects numeric coercion", () => {
    expect(decimal.parse(cell.value)).toBe(cell.value);
    expect(decimal.safeParse(123).success).toBe(false);
    for (const value of ["NaN", "1e3", "Infinity", "1,000"])
      expect(decimal.safeParse(value).success).toBe(false);
    expect(displayDecimal(cell.value)).toBe("9,007,199,254,740,993.123456789");
  });
  it("distinguishes zero and missing values", () => {
    expect(cellSchema.safeParse({ ...cell, value: "0" }).success).toBe(true);
    expect(cellSchema.safeParse({ ...cell, value: null }).success).toBe(false);
    expect(
      cellSchema.safeParse({ ...cell, state: "not_reported", value: null })
        .success,
    ).toBe(true);
    expect(cellSchema.safeParse({ ...cell, state: "unreadable" }).success).toBe(
      false,
    );
  });
  it("searches aliases and preserves section context and order", () => {
    expect(searchRows(rows, "expenses", false).map((r) => r.id)).toEqual([
      "section",
      "cost",
    ]);
    expect(searchRows(rows, "", false)).toHaveLength(2);
    expect(searchRows(rows, "", true)).toHaveLength(3);
  });
  it("rejects malformed and unbounded queries", () => {
    expect(querySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(querySchema.safeParse({ from: "2025", to: "2020" }).success).toBe(
      false,
    );
    expect(querySchema.safeParse({ version: "latest" }).success).toBe(false);
    expect(querySchema.safeParse({ unknown: "x" }).success).toBe(false);
  });
  it("only permits publisher http links", () => {
    expect(safeSource("javascript:alert(1)")).toBeUndefined();
    expect(safeSource("https://example.org/report.pdf")).toContain("https://");
  });
  it("rejects ambiguous statement identities, units and period relationships", () => {
    const valid = {
      id: "income",
      title: "Synthetic income",
      scope: "consolidated",
      basis: "Synthetic",
      currency: "XXX",
      unit: "units",
      periods: [
        { id: "2025", label: "FY2025", start: "2025-01-01", end: "2025-12-31" },
      ],
      rows: rows.slice(0, 2),
    };
    expect(statementSchema.safeParse(valid).success).toBe(true);
    for (const changed of [
      { ...valid, periods: [...valid.periods, ...valid.periods] },
      { ...valid, rows: [...valid.rows, valid.rows[0]] },
      { ...valid, currency: "not currency" },
      { ...valid, basis: " " },
      { ...valid, id: "balance" },
      { ...valid, rows: [{ ...rows[1], cells: { unknown: cell } }] },
      { ...valid, periods: [{ ...valid.periods[0], start: "2026-01-01" }] },
    ])
      expect(statementSchema.safeParse(changed).success).toBe(false);
    expect(
      datasetSchema.safeParse({
        schemaVersion: "1",
        companyId: "synthetic",
        kind: "sample",
        statements: [valid],
        coverage: { expectedPeriods: 1, verifiedPeriods: 2, gaps: [] },
      }).success,
    ).toBe(false);
  });
  it("pins CSV identity, precision, sources, filters and protects text cells", () => {
    const statement = {
      id: "income" as const,
      title: "Synthetic",
      scope: "consolidated" as const,
      basis: "Synthetic",
      currency: "XXX",
      unit: "units",
      periods: [
        { id: "2025", label: "FY2025", start: "2025-01-01", end: "2025-12-31" },
      ],
      rows: [{ ...rows[1], label: "=UNTRUSTED()" }],
    };
    const snapshot: Published = {
      version: "a".repeat(64),
      validation: {},
      data: {
        schemaVersion: "1",
        kind: "sample",
        companyId: "synthetic",
        statements: [statement],
        coverage: { expectedPeriods: 1, verifiedPeriods: 0, gaps: [] },
      },
    };
    const csv = statementCsv(snapshot, statement);
    expect(csv).toContain(cell.value);
    expect(csv).toContain("' =".replace(" ", ""));
    expect(csv).toContain(snapshot.version);
    expect(csv).toContain("PDF page 2");
  });
});
