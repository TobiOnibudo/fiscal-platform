import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../app/api/v1/[...path]/route";
import { published, filings } from "./repository";
vi.mock("./repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./repository")>()),
  published: vi.fn(),
  companies: vi.fn(),
  filings: vi.fn(),
}));
const version = "a".repeat(64);
const synthetic = {
  version,
  validation: {},
  data: {
    schemaVersion: "1" as const,
    companyId: "synthetic",
    kind: "sample" as const,
    coverage: { expectedPeriods: 1, verifiedPeriods: 0, gaps: [] },
    statements: [
      {
        id: "income" as const,
        title: "Synthetic contract fixture",
        scope: "consolidated" as const,
        basis: "Synthetic",
        currency: "XXX",
        unit: "units",
        periods: [
          {
            id: "2025",
            label: "FY2025",
            start: "2025-01-01",
            end: "2025-12-31",
          },
        ],
        rows: [],
      },
    ],
  },
};
const call = (path: string, query = "") =>
  GET(new Request(`http://localhost/api/v1/${path}${query}`), {
    params: Promise.resolve({ path: path.split("/") }),
  });
describe("public API boundary", () => {
  beforeEach(() => {
    vi.mocked(published).mockReset();
    vi.mocked(published).mockResolvedValue(synthetic);
  });
  it("validates bounded requests before querying", async () => {
    const response = await call("companies/synthetic/statements", "?limit=101");
    expect(response.status).toBe(400);
    expect(published).not.toHaveBeenCalled();
    expect((await response.json()).error.requestId).toBeTruthy();
  });
  it("returns the displayed dataset identity", async () => {
    const response = await call(
      "companies/synthetic/statements",
      `?version=${version}`,
    );
    expect(response.status).toBe(200);
    expect(published).toHaveBeenCalledWith("synthetic", version);
    expect((await response.json()).datasetVersion).toBe(version);
  });
  it("requires a pinned export and retains the version in CSV", async () => {
    expect((await call("companies/synthetic/export")).status).toBe(400);
    const response = await call(
      "companies/synthetic/export",
      `?version=${version}`,
    );
    expect(response.headers.get("X-Dataset-Version")).toBe(version);
    expect(await response.text()).toContain(version);
  });
  it("requires company and version for source history", async () => {
    const response = await call("observations/synthetic/history");
    expect(response.status).toBe(400);
    expect(published).not.toHaveBeenCalled();
  });
  it("downloads a bounded filtered filing manifest with pagination metadata", async () => {
    vi.mocked(filings).mockResolvedValue({ items: [], nextCursor: null });
    const response = await call(
      "companies/synthetic/filings",
      "?download=manifest&q=report&limit=30",
    );
    expect(response.headers.get("Content-Disposition")).toContain(
      "source-manifest-page.json",
    );
    const body = await response.json();
    expect(body.companyId).toBe("synthetic");
    expect(body.filters.search).toBe("report");
    expect(body.filters.limit).toBe(30);
    expect(body.nextCursor).toBeNull();
  });
  it("redacts unexpected database failures", async () => {
    vi.mocked(published).mockRejectedValue(
      new Error("postgres://private:secret@example.invalid"),
    );
    const response = await call("companies/synthetic/statements");
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(text).toContain("DATA_UNAVAILABLE");
  });
});
