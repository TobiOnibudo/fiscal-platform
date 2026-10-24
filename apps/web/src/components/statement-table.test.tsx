import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { datasetSchema, searchRows } from "@/lib/contracts";
import fixture from "../../../../contracts/fixtures/synthetic-dataset.v1.json";
import { displayRowLabel, StatementTable } from "./statement-table";
import { SourceDrawer } from "./source-drawer";
import { FilingsView, QualityView } from "./collection-views";
import { Workspace } from "./workspace";
import { useReview } from "./review-client";
vi.mock("./review-client", () => ({
  useReview: vi.fn(() => ({ loading: true })),
}));

describe("statement and evidence rendering with synthetic data", () => {
  beforeEach(() => {
    vi.mocked(useReview).mockReset();
    vi.mocked(useReview).mockReturnValue({ loading: true });
  });
  it("removes PDF leaders and share-count disclosures from displayed labels", () => {
    expect(displayRowLabel("Treasury stock . . . . . .")).toBe(
      "Treasury stock",
    );
    expect(
      displayRowLabel(
        "Class A Common shares – $0.01 par value; 1,025,672,252 shares authorized; " +
          "1,025,672,252 shares issued and outstanding",
      ),
    ).toBe("Class A Common shares – $0.01 par value");
  });
  it.each([
    ["NO_PUBLISHED_DATASET", "No statements available"],
    ["DATA_UNAVAILABLE", "Unable to load statements"],
  ])("keeps %s workspace messages free of diagnostics", (code, heading) => {
    const message =
      "DEBUG: Start Postgres; apply migrations; internal pipeline failure";
    const requestId = "d2cc1dc5-54f6-47ef-a93e-b931d5399500";
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      error: { code, message, requestId },
    });
    const html = renderToStaticMarkup(<Workspace />);
    expect(html).toContain(heading);
    expect(html).toContain("Try again");
    expect(html).not.toContain(message);
    expect(html).not.toContain(requestId);
    expect(html).not.toMatch(
      /local setup|Postgres|migrations|pipeline|demonstration snapshot|ten-year coverage|Request /i,
    );
  });
  it("shows publication status and coverage without raw validation details", () => {
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        datasetVersion: "b".repeat(64),
        coverage: {
          verifiedPeriods: 8,
          expectedPeriods: 10,
          gaps: ["FY2017 income statement"],
        },
        validation: {
          reviewed: false,
          issues: [{ debug: "private-validation-detail" }],
        },
      },
    });
    const html = renderToStaticMarkup(
      <QualityView company="synthetic" retry={0} />,
    );
    expect(html).toContain("8 of 10 target periods verified");
    expect(html).toContain("FY2017 income statement");
    expect(html).toContain("Automatic publication checks:");
    expect(html).toContain("Complete");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("private-validation-detail");
    expect(html).not.toContain("Validation results");
  });
  it("keeps source documents and comparative history without technical identifiers", () => {
    const statement = datasetSchema.parse(fixture).statements[0];
    const cell = Object.values(
      statement.rows.find((row) => Object.keys(row.cells).length)!.cells,
    )[0];
    const restatedCell = { ...cell, comparative: "restated" as const };
    const version = "b".repeat(64);
    const source = {
      id: cell.filingId,
      title: "Synthetic annual report",
      source_url: "https://example.com/annual-report.pdf",
      classification: "annual_report",
      published_on: "2025-03-31",
      sha256: "c".repeat(64),
    };
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        datasetVersion: version,
        selected: restatedCell,
        period: statement.periods[0],
        row: { label: cell.rawLabel, aliases: ["Earlier revenue label"] },
        units: statement,
        source,
        historyStatus: "DEBUG scanned 100 datasets and hashes",
        previousObservations: [
          {
            datasetVersion: version,
            cell: {
              ...cell,
              value: "123.45",
              rawLabel: "Earlier reported label",
              comparative: "original",
            },
            period: statement.periods[0],
            currency: "GBP",
            unit: "millions",
            source,
          },
        ],
      },
    });
    const drawer = renderToStaticMarkup(
      <SourceDrawer
        cell={restatedCell}
        company="synthetic"
        version={version}
        close={() => undefined}
      />,
    );
    expect(drawer).toContain(source.title);
    expect(drawer).toContain(
      `href="${source.source_url}#page=${cell.pdfPage}"`,
    );
    expect(drawer).toContain(cell.rawLabel);
    expect(drawer).toContain(`PDF page ${cell.pdfPage}`);
    expect(drawer).toContain("Selected reported value");
    expect(drawer).toContain("Restated");
    expect(drawer).toContain("Changed from the prior compatible filing");
    expect(drawer).toContain("Original");
    expect(drawer).toContain("Reported text");
    expect(drawer).toContain("Value history");
    expect(drawer).toContain("Filing year");
    expect(drawer).toContain("2025");
    expect(drawer).toContain("Treatment");
    expect(drawer).toContain(
      "A later filing reports a different value for the same period.",
    );
    expect(drawer).toContain("Reported label");
    expect(drawer).not.toContain("DEBUG");
    expect(drawer).not.toContain("Publication identifiers");
    expect(drawer).not.toContain(version);
    expect(drawer).not.toContain(source.sha256);
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        datasetVersion: version,
        selected: cell,
        period: statement.periods[0],
        row: { label: cell.rawLabel, aliases: [] },
        units: statement,
        source,
        historyStatus: "",
        previousObservations: [],
      },
    });
    const originalDrawer = renderToStaticMarkup(
      <SourceDrawer
        cell={cell}
        company="synthetic"
        version={version}
        close={() => undefined}
      />,
    );
    expect(originalDrawer).not.toContain("Treatment definitions");
    expect(originalDrawer).not.toContain(
      "A later filing reports a different value for the same period.",
    );
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        datasetVersion: version,
        selected: restatedCell,
        period: statement.periods[0],
        row: { label: cell.rawLabel, aliases: [] },
        units: statement,
        source,
        historyStatus: "",
        previousObservations: [
          {
            cell: { ...cell, value: restatedCell.value },
            period: statement.periods[0],
            currency: "GBP",
            unit: "millions",
            source,
          },
        ],
      },
    });
    const unchangedRestatement = renderToStaticMarkup(
      <SourceDrawer
        cell={restatedCell}
        company="synthetic"
        version={version}
        close={() => undefined}
      />,
    );
    expect(unchangedRestatement).toContain("Updated comparative");
    expect(unchangedRestatement).not.toContain("Restated by the source");
    expect(unchangedRestatement).not.toContain(
      "the company explicitly identifies as revised or restated.",
    );
    const updatedCell = {
      ...cell,
      comparative: "updated" as const,
      value: "200",
    };
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        datasetVersion: version,
        selected: updatedCell,
        period: statement.periods[0],
        row: { label: cell.rawLabel, aliases: [] },
        units: statement,
        source,
        historyStatus: "",
        previousObservations: [
          {
            cell: { ...cell, value: "123.45" },
            period: statement.periods[0],
            currency: "GBP",
            unit: "millions",
            source,
          },
        ],
      },
    });
    const changedUpdate = renderToStaticMarkup(
      <SourceDrawer
        cell={updatedCell}
        company="synthetic"
        version={version}
        close={() => undefined}
      />,
    );
    expect(changedUpdate).toContain("Changed from the prior compatible filing");
    expect(changedUpdate).not.toContain("Updated comparative");
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: { items: [source], nextCursor: null },
    });
    const filings = renderToStaticMarkup(
      <FilingsView company="synthetic" retry={0} />,
    );
    expect(filings).toContain(source.title);
    expect(filings).toContain(`href="${source.source_url}"`);
    expect(filings).not.toContain("Source hash");
    expect(filings).not.toContain(source.sha256);
  });
  it("distinguishes evidence/coverage failures from loading or unpublished coverage", () => {
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      error: { code: "DATA_UNAVAILABLE", message: "Unavailable" },
    });
    const statement = datasetSchema.parse(fixture).statements[0];
    const cell = Object.values(
      statement.rows.find((r) => Object.keys(r.cells).length)!.cells,
    )[0];
    const drawer = renderToStaticMarkup(
      <SourceDrawer
        cell={cell}
        company="synthetic"
        version={"a".repeat(64)}
        close={() => undefined}
      />,
    );
    expect(drawer).toContain("Value details could not load");
    expect(drawer).not.toContain("Loading value details");
    const quality = renderToStaticMarkup(
      <QualityView company="synthetic" retry={0} />,
    );
    expect(quality).toContain("Coverage could not load");
    expect(quality).not.toContain("Coverage is not established");
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      error: { code: "NO_PUBLISHED_DATASET", message: "Unpublished" },
    });
    expect(
      renderToStaticMarkup(<QualityView company="synthetic" retry={0} />),
    ).toContain("Coverage is not established");
  });
  it("renders exact large decimals, row units, original order, and source action labels", () => {
    const statement = datasetSchema
      .parse(fixture)
      .statements.find((s) => s.id === "income")!;
    const row = statement.rows.find((r) => r.kind !== "section")!;
    const period = statement.periods.find((p) => row.cells[p.id])!;
    row.currency = "XXX";
    row.unit = "per share";
    row.cells[period.id].value = "9007199254740993.123456789";
    row.cells[period.id].comparative = "restated";
    const html = renderToStaticMarkup(
      <StatementTable
        statement={statement}
        rows={statement.rows}
        inspect={() => undefined}
      />,
    );
    expect(html).toContain("9,007,199,254,740,993.123456789");
    expect(html).toContain("XXX · per share");
    expect(html).toContain(
      "9007199254740993.123456789 XXX per share; inspect source",
    );
    expect(html).not.toContain(">Restated<");
    expect(html).not.toMatch(/>R<|>U</);
    expect(html).toContain('<th scope="col">Line item</th>');
    for (let index = 1; index < statement.rows.length; index++)
      expect(html.indexOf(`>${statement.rows[index - 1].label}<`)).toBeLessThan(
        html.indexOf(`>${statement.rows[index].label}<`),
      );
    row.label = "Net revenue . . . . . .";
    const cleanedLabel = renderToStaticMarkup(
      <StatementTable
        statement={statement}
        rows={[row]}
        inspect={() => undefined}
      />,
    );
    expect(cleanedLabel).toContain(">Net revenue<");
    expect(cleanedLabel).not.toContain("Net revenue . . .");
  });
  it("keeps alias matching row structure and historical visibility", () => {
    const statement = datasetSchema.parse(fixture).statements[0];
    const row = statement.rows.find((r) => r.kind !== "section")!;
    row.aliases = ["Synthetic old label"];
    const matched = searchRows(statement.rows, "Synthetic old label", false);
    const html = renderToStaticMarkup(
      <StatementTable
        statement={statement}
        rows={matched}
        inspect={() => undefined}
      />,
    );
    expect(html).toContain(row.label);
    row.historical = true;
    expect(
      searchRows(statement.rows, "Synthetic old label", false),
    ).toHaveLength(0);
    expect(
      searchRows(statement.rows, "Synthetic old label", true).some(
        (r) => r.id === row.id,
      ),
    ).toBe(true);
  });
  it("uses a named native dialog and visible close control for evidence", () => {
    const statement = datasetSchema.parse(fixture).statements[0];
    const cell = Object.values(
      statement.rows.find((r) => Object.keys(r.cells).length)!.cells,
    )[0];
    const html = renderToStaticMarkup(
      <SourceDrawer
        cell={cell}
        company="synthetic"
        version={"a".repeat(64)}
        close={() => undefined}
      />,
    );
    expect(html).toContain("<dialog");
    expect(html).toContain('aria-labelledby="source-title"');
    expect(html).toContain('aria-label="Close source inspector"');
    expect(html).toContain(cell.rawLabel);
    expect(html).toContain("Loading value details");
  });
});
