import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TrendsKpi } from "./trends-kpi";
import { useReview } from "./review-client";

vi.mock("./review-client", () => ({
  useReview: vi.fn(),
}));

describe("TrendsKpi", () => {
  it("limits displayed percentages to two decimal places", () => {
    vi.mocked(useReview).mockReturnValue({
      loading: false,
      data: {
        periods: ["FY21", "FY22"],
        currency: "GBP",
        unit: "millions",
        revenue: [100, 125.6789],
        margin: [10.1234, 25.6789],
        cashFlow: [20, 35],
        conversion: [20.1234, 27.6789],
      },
    });

    const markup = renderToStaticMarkup(<TrendsKpi company="wise" />);

    expect(markup).toContain("25.68%");
    expect(markup).toContain("27.68%");
    expect(markup).toContain('style="width:25.68%"');
    expect(markup).toContain('style="width:27.68%"');
    expect(markup).not.toContain("25.6789%");
    expect(markup).not.toContain("27.6789%");
  });
});
