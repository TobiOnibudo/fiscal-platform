"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, CalendarDays, Check, Info, TrendingUp } from "lucide-react";
import { useReview } from "./review-client";

const annualPeriods = ["FY20", "FY21", "FY22", "FY23", "FY24"];
const quarterlyPeriods = ["Q1 24", "Q2 24", "Q3 24", "Q4 24", "Q1 25"];

type TrendSeries = {
  revenue: Array<number | null>;
  margin: Array<number | null>;
  cashFlow: Array<number | null>;
  conversion: Array<number | null>;
};

const annualData: TrendSeries = {
  revenue: [302.1, 536.4, 806.2, 1030.4, 1201.8],
  margin: [10.6, 16.4, 21.9, 25.4, 30.2],
  cashFlow: [43.1, 90.7, 168.1, 297.8, 423.1],
  conversion: [14.3, 16.9, 20.8, 28.9, 35.2],
};
const quarterlyData = {
  revenue: [275.2, 292.4, 316.9, 332.8, 360.4],
  margin: [26.1, 27.3, 29.1, 30.2, 31.4],
  cashFlow: [78.4, 91.2, 105.8, 147.7, 161.9],
  conversion: [28.5, 31.2, 33.4, 44.4, 44.9],
};
type TrendResponse = TrendSeries & {
  periods: string[];
  currency: string;
  currencies?: Array<string | null>;
  unit: string;
};

function percentage(value: number) {
  return `${Number(value.toFixed(2))}%`;
}

function percentagePoints(value: number) {
  return `${Number(value.toFixed(2))}pp`;
}

function percentageWidth(value: number) {
  return Number(value.toFixed(2));
}

function currencySymbol(currency: string) {
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return `${currency} `;
}

function chartMaximum(values: Array<number | null>) {
  const highest = Math.max(
    ...values.filter((value): value is number => value !== null),
    1,
  );
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  return Math.ceil(highest / magnitude) * magnitude;
}

function lastAvailableIndex(
  values: Array<number | null>,
  start: number,
  end: number,
) {
  for (let index = end; index >= start; index -= 1)
    if (values[index] !== null) return index;
  return start;
}

function previousAvailableIndex(values: Array<number | null>, end: number) {
  return lastAvailableIndex(values, 0, Math.max(0, end - 1));
}

function points(
  values: number[],
  width: number,
  height: number,
  padding: number,
) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x =
        padding +
        (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y =
        height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function Sparkline({
  values,
  negative = false,
}: {
  values: number[];
  negative?: boolean;
}) {
  return (
    <svg className="sparkline" viewBox="0 0 86 28" aria-hidden="true">
      <polyline
        points={points(values, 86, 28, 4)}
        fill="none"
        stroke={negative ? "#f0b567" : "var(--accent-bright)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((value, index) => {
        const [x, y] = points(values, 86, 28, 4).split(" ")[index].split(",");
        return (
          <circle
            key={value}
            cx={x}
            cy={y}
            r="2"
            fill={negative ? "#f0b567" : "var(--accent-bright)"}
          />
        );
      })}
    </svg>
  );
}

function RevenueChart({
  quarterly,
  start,
  end,
  data,
  labels,
  currency = "GBP",
}: {
  quarterly: boolean;
  start: number;
  end: number;
  data?: TrendSeries;
  labels?: string[];
  currency?: string;
}) {
  const series = data ?? (quarterly ? quarterlyData : annualData);
  const periods = (
    labels ?? (quarterly ? quarterlyPeriods : annualPeriods)
  ).slice(start, end + 1);
  const revenue = series.revenue.slice(start, end + 1);
  const margin = series.margin.slice(start, end + 1);
  const revenueMax = chartMaximum(revenue);
  const symbol = currencySymbol(currency);
  const marginPoints = points(
    margin.map((value) => value ?? 0),
    700,
    270,
    35,
  ).split(" ");
  const x = (i: number) => 55 + (i * 575) / Math.max(periods.length - 1, 1);
  const yRevenue = (value: number) => 242 - (value / revenueMax) * 185;
  return (
    <svg
      className="trend-chart"
      viewBox="0 0 700 290"
      role="img"
      aria-label="Revenue and adjusted EBITDA margin by period"
    >
      {[0, 1, 2, 3, 4].map((grid) => (
        <line
          key={grid}
          x1="55"
          x2="630"
          y1={57 + grid * 46}
          y2={57 + grid * 46}
          className="chart-grid"
        />
      ))}
      {[0, 1, 2, 3, 4].map((grid) => (
        <text key={grid} x="8" y={246 - grid * 46} className="chart-axis">
          {symbol}
          {Math.round((revenueMax / 4) * grid)}m
        </text>
      ))}
      {[0, 10, 20, 30, 40].map((grid, index) => (
        <text key={grid} x="642" y={246 - index * 46} className="chart-axis">
          {grid}%
        </text>
      ))}
      <line x1="55" x2="55" y1="55" y2="242" className="chart-axis-line" />
      <line x1="630" x2="630" y1="55" y2="242" className="chart-axis-line" />
      {revenue.map((value, index) => {
        const barWidth = Math.min(74, 460 / periods.length);
        if (value === null) return null;
        return (
          <g key={periods[index]}>
            <rect
              x={x(index) - barWidth / 2}
              y={yRevenue(value)}
              width={barWidth}
              height={242 - yRevenue(value)}
              rx="2"
              className="chart-bar"
            />
            <text
              x={x(index)}
              y={Math.max(yRevenue(value) - 8, 50)}
              textAnchor="middle"
              className="chart-value"
            >
              {symbol}
              {value.toFixed(quarterly ? 0 : 1)}m
            </text>
            <text
              x={x(index)}
              y="268"
              textAnchor="middle"
              className="chart-label"
            >
              {periods[index]}
            </text>
          </g>
        );
      })}
      <polyline
        points={marginPoints
          .filter((_, index) => margin[index] !== null)
          .join(" ")}
        className="chart-line"
      />
      {marginPoints.map((point, index) => {
        if (margin[index] === null) return null;
        const [cx, cy] = point.split(",");
        return (
          <g key={periods[index]}>
            <circle cx={cx} cy={cy} r="4" className="chart-dot" />
            <text
              x={cx}
              y={Number(cy) - 13}
              textAnchor="middle"
              className="chart-margin"
            >
              {percentage(margin[index] as number)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CashFlowChart({
  quarterly,
  start,
  end,
  data,
  labels,
  currency = "GBP",
}: {
  quarterly: boolean;
  start: number;
  end: number;
  data?: TrendSeries;
  labels?: string[];
  currency?: string;
}) {
  const series = data ?? (quarterly ? quarterlyData : annualData);
  const periods = (
    labels ?? (quarterly ? quarterlyPeriods : annualPeriods)
  ).slice(start, end + 1);
  const cashFlow = series.cashFlow.slice(start, end + 1);
  const conversionData = series.conversion.slice(start, end + 1);
  const max = chartMaximum(cashFlow);
  const symbol = currencySymbol(currency);
  const conversion = points(
    conversionData.map((value) => value ?? 0),
    600,
    230,
    28,
  ).split(" ");
  const x = (i: number) => 48 + (i * 490) / Math.max(periods.length - 1, 1);
  const y = (value: number) => 204 - (value / max) * 145;
  return (
    <svg
      className="trend-chart cash-chart"
      viewBox="0 0 600 255"
      role="img"
      aria-label="Free cash flow and cash flow conversion by period"
    >
      {[0, 1, 2, 3].map((grid) => (
        <line
          key={grid}
          x1="48"
          x2="538"
          y1={59 + grid * 48}
          y2={59 + grid * 48}
          className="chart-grid"
        />
      ))}
      {[0, 1, 2, 3].map((grid) => (
        <text key={grid} x="2" y={208 - grid * 48} className="chart-axis">
          {symbol}
          {Math.round((max / 3) * grid)}m
        </text>
      ))}
      {cashFlow.map((value, index) => {
        if (value === null) return null;
        return (
          <g key={periods[index]}>
            <rect
              x={x(index) - 29}
              y={y(value)}
              width="58"
              height={204 - y(value)}
              rx="2"
              className="chart-bar"
            />
            <text
              x={x(index)}
              y="231"
              textAnchor="middle"
              className="chart-label"
            >
              {periods[index]}
            </text>
          </g>
        );
      })}
      <polyline
        points={conversion
          .filter((_, index) => conversionData[index] !== null)
          .join(" ")}
        className="chart-line"
      />
      {conversion.map((point, index) => {
        if (conversionData[index] === null) return null;
        const [cx, cy] = point.split(",");
        return (
          <g key={periods[index]}>
            <circle cx={cx} cy={cy} r="4" className="chart-dot" />
            <text
              x={cx}
              y={Number(cy) - 12}
              textAnchor="middle"
              className="chart-margin"
            >
              {percentage(conversionData[index] as number)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrendsKpi({ company }: { company: string }) {
  const trends = useReview<TrendResponse>(`companies/${company}/trends`, 0);
  const rangeFilter = useRef<HTMLDetailsElement>(null);
  const [chart, setChart] = useState<"performance" | "cashflow">("performance");
  const [panel, setPanel] = useState<"trends" | "kpis">("trends");
  const [range, setRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (
        rangeFilter.current?.open &&
        !rangeFilter.current.contains(event.target as Node)
      )
        rangeFilter.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);
  if (trends.loading)
    return (
      <section className="trends-view">
        <div className="table-loading" role="status">
          <span />
          Loading published trend data…
        </div>
      </section>
    );
  if (trends.error || !trends.data)
    return (
      <section className="trends-view">
        <div className="empty-state">
          <h2>Trend data unavailable</h2>
          <p>
            Published income and cash-flow data are required to calculate this
            view.
          </p>
        </div>
      </section>
    );
  const quarterly = false;
  const source = trends.data;
  const periods = source.periods;
  const selectedRange = range ?? {
    start: Math.max(0, periods.length - 5),
    end: periods.length - 1,
  };
  const rangeStart = Math.min(selectedRange.start, periods.length - 1);
  const rangeEnd = Math.min(selectedRange.end, periods.length - 1);
  const periodRange = `${periods[rangeStart]} to ${periods[rangeEnd]}`;
  const updateStart = (start: number) =>
    setRange((current) => ({
      start,
      end: Math.max(start, current?.end ?? periods.length - 1),
    }));
  const updateEnd = (end: number) =>
    setRange((current) => ({
      start: Math.min(current?.start ?? 0, end),
      end,
    }));
  const title = company === "adyen" ? "Adyen" : "Wise";
  const revenueIndex = lastAvailableIndex(source.revenue, rangeStart, rangeEnd);
  const revenuePriorIndex = previousAvailableIndex(
    source.revenue,
    revenueIndex,
  );
  const marginIndex = lastAvailableIndex(source.margin, rangeStart, rangeEnd);
  const marginPriorIndex = previousAvailableIndex(source.margin, marginIndex);
  const cashIndex = lastAvailableIndex(source.cashFlow, rangeStart, rangeEnd);
  const cashPriorIndex = previousAvailableIndex(source.conversion, cashIndex);
  const revenueLast = source.revenue[revenueIndex] ?? 0;
  const revenuePrior = source.revenue[revenuePriorIndex] ?? revenueLast;
  const marginLast = source.margin[marginIndex] ?? 0;
  const marginPrior = source.margin[marginPriorIndex] ?? marginLast;
  const cashLast = source.cashFlow[cashIndex] ?? 0;
  const conversionLast = source.conversion[cashIndex] ?? 0;
  const conversionPrior = source.conversion[cashPriorIndex] ?? conversionLast;
  const growth = (revenueLast / revenuePrior - 1) * 100;
  const selectedSymbol = currencySymbol(
    source.currencies?.[revenueIndex] ?? source.currency,
  );
  const displayMetrics = [
    [
      "Revenue",
      `${selectedSymbol}${revenueLast.toFixed(1)} ${source.unit}`,
      `${growth >= 0 ? "+" : ""}${percentage(growth)}`,
      "vs. prior period",
      periods[revenueIndex],
    ],
    [
      "Revenue growth",
      percentage(growth),
      "Calculated from published revenue",
      "vs. prior period",
      periods[revenueIndex],
    ],
    [
      "Operating margin",
      percentage(marginLast),
      percentagePoints(marginLast - marginPrior),
      "vs. prior period",
      periods[marginIndex],
    ],
    [
      "Operating cash flow",
      `${selectedSymbol}${cashLast.toFixed(1)} ${source.unit}`,
      percentagePoints(conversionLast - conversionPrior),
      "cash conversion vs. prior period",
      periods[cashIndex],
    ],
  ];
  const displayRows = [
    [
      "Revenue growth",
      source.revenue.map((value, index) =>
        index && value !== null && source.revenue[index - 1] !== null
          ? (value / (source.revenue[index - 1] as number) - 1) * 100
          : null,
      ),
      "pp",
      false,
    ],
    ["Operating margin", source.margin, "pp", false],
    ["Operating cash conversion", source.conversion, "pp", false],
  ] as const;
  const metrics = [
    [
      "Revenue",
      quarterly ? "£360.4m" : "£1,201.8m",
      quarterly ? "+14.2%" : "+16.7%",
      "vs. prior period",
    ],
    [
      "Revenue growth",
      quarterly ? "14.2%" : "16.7%",
      quarterly ? "+2.8pp" : "+5.1pp",
      "vs. prior period",
    ],
    [
      "Adjusted EBITDA margin",
      quarterly ? "31.4%" : "30.2%",
      quarterly ? "+1.2pp" : "+4.8pp",
      "vs. prior period",
    ],
    [
      "Free cash flow",
      quarterly ? "£161.9m" : "£423.1m",
      quarterly ? "+40.4%" : "+42.1%",
      "vs. prior period",
    ],
  ];
  const rows = [
    ["Revenue growth", [35.8, 77.5, 50.3, 21.2, 16.7], "-19.1pp", true],
    ["Gross margin", [54.1, 56.8, 58.9, 60.2, 61.5], "+7.4pp", false],
    ["EBITDA margin", annualData.margin, "+19.6pp", false],
    ["FCF margin", annualData.conversion, "+20.9pp", false],
    ["Net debt / EBITDA", [1.8, 1.5, 1.2, 0.8, 0.3], "-1.5x", true],
  ] as const;
  void metrics;
  void rows;
  return (
    <section className="trends-view" aria-label="Trends and KPI analysis">
      <div className="trend-heading">
        <div>
          <h1>{title}: Trends &amp; KPIs</h1>
          <p>
            Key financial trends, operating metrics and quality indicators for
            fundamental analysis.
          </p>
        </div>
        <div className="trend-controls">
          <details className="range-filter" ref={rangeFilter}>
            <summary className="range-button">
              <CalendarDays size={15} />
              {periodRange}
            </summary>
            <div className="range-popover">
              <label>
                From
                <select
                  value={rangeStart}
                  onChange={(event) => updateStart(Number(event.target.value))}
                >
                  {periods.map((item, index) => (
                    <option value={index} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <span className="range-separator" aria-hidden="true">
                to
              </span>
              <label>
                To
                <select
                  value={rangeEnd}
                  onChange={(event) => updateEnd(Number(event.target.value))}
                >
                  {periods.map((item, index) => (
                    <option value={index} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      </div>
      <div className="kpi-strip">
        {displayMetrics.map(([label, value, delta, context, period]) => (
          <article className="kpi" key={label}>
            <p>{label}</p>
            <span className="kpi-period">{period}</span>
            <strong>{value}</strong>
            <div>
              <b>{delta}</b>
              <span>{context}</span>
            </div>
          </article>
        ))}
      </div>
      <div
        className="analysis-tabs"
        role="tablist"
        aria-label="Trends and KPIs content"
      >
        <button
          id="analysis-trends-tab"
          role="tab"
          aria-selected={panel === "trends"}
          aria-controls="analysis-panel"
          tabIndex={panel === "trends" ? 0 : -1}
          onClick={() => setPanel("trends")}
        >
          Trend analysis
        </button>
        <button
          id="analysis-kpis-tab"
          role="tab"
          aria-selected={panel === "kpis"}
          aria-controls="analysis-panel"
          tabIndex={panel === "kpis" ? 0 : -1}
          onClick={() => setPanel("kpis")}
        >
          Operating KPIs
        </button>
      </div>
      <div
        id="analysis-panel"
        role="tabpanel"
        aria-labelledby={`analysis-${panel}-tab`}
        className={`trends-dashboard ${panel}`}
      >
        <article className="chart-panel chart-workspace">
          <div className="panel-title chart-workspace-title">
            <div>
              <h2>
                {chart === "performance"
                  ? "Revenue & profitability"
                  : "Free cash flow conversion"}
              </h2>
              <p>
                {chart === "performance"
                  ? "Group revenue and adjusted EBITDA margin."
                  : "Free cash flow and conversion as a % of revenue."}
              </p>
            </div>
            <div className="legend">
              <span>
                <i className="legend-revenue" />
                {chart === "performance" ? "Revenue (LHS)" : "Free cash flow"}
              </span>
              <span>
                <i className="legend-margin" />
                {chart === "performance"
                  ? "EBITDA margin (RHS)"
                  : "FCF conversion"}
              </span>
            </div>
          </div>
          <div className="chart-tabs" role="tablist" aria-label="Trend charts">
            <button
              id="performance-tab"
              role="tab"
              aria-selected={chart === "performance"}
              aria-controls="trend-chart-panel"
              tabIndex={chart === "performance" ? 0 : -1}
              onClick={() => setChart("performance")}
            >
              Performance
            </button>
            <button
              id="cashflow-tab"
              role="tab"
              aria-selected={chart === "cashflow"}
              aria-controls="trend-chart-panel"
              tabIndex={chart === "cashflow" ? 0 : -1}
              onClick={() => setChart("cashflow")}
            >
              Cash flow
            </button>
          </div>
          <div
            id="trend-chart-panel"
            role="tabpanel"
            aria-labelledby={`${chart}-tab`}
            className="chart-canvas"
          >
            {chart === "performance" ? (
              <RevenueChart
                quarterly={quarterly}
                start={rangeStart}
                end={rangeEnd}
                data={quarterly ? undefined : trends.data}
                labels={quarterly ? undefined : trends.data?.periods}
                currency={source.currencies?.[rangeEnd] ?? source.currency}
              />
            ) : (
              <CashFlowChart
                quarterly={quarterly}
                start={rangeStart}
                end={rangeEnd}
                data={quarterly ? undefined : trends.data}
                labels={quarterly ? undefined : trends.data?.periods}
                currency={source.currencies?.[rangeEnd] ?? source.currency}
              />
            )}
          </div>
        </article>
        <div className="trends-side-stack">
          <article className="quality-panel">
            <div>
              <h2>Earnings quality</h2>
              <p>Key drivers of sustainable earnings power.</p>
            </div>
            <div className="quality-bars">
              {[
                [
                  "Operating margin",
                  percentage(marginLast),
                  Math.min(100, Math.max(0, marginLast)),
                  "primary",
                ],
                [
                  "Operating cash conversion",
                  percentage(conversionLast),
                  Math.min(100, Math.max(0, conversionLast)),
                  "secondary",
                ],
              ].map(([label, val, width, tone]) => (
                <div className="quality-row" key={label as string}>
                  <div>
                    <span>
                      {label}{" "}
                      {label === "Operating margin" && <Info size={13} />}
                    </span>
                    <b>{val}</b>
                  </div>
                  <div className="quality-track">
                    <i
                      className={tone as string}
                      style={{ width: `${percentageWidth(width as number)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="analyst-take">
              <h3>Analyst take</h3>
              <p>
                Ratios are calculated from the selected company&apos;s published
                income and cash-flow statements.
              </p>
            </div>
          </article>
          <article className="operating-table">
            <div>
              <h2>Operating KPIs</h2>
              <p>FY 2020–2024 trend view.</p>
            </div>
            <div className="operating-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {periods.map((year) => (
                      <th key={year}>{year.replace("FY", "20")}</th>
                    ))}
                    <th>5Y trend</th>
                    <th>5Y change</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map(([label, values, change, negative]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      {values.map((value, index) => (
                        <td key={`${label}-${index}`}>
                          {typeof value === "number" ? percentage(value) : "—"}
                        </td>
                      ))}
                      <td>
                        <Sparkline
                          values={values as number[]}
                          negative={negative}
                        />
                      </td>
                      <td
                        className={
                          negative ? "negative-change" : "positive-change"
                        }
                      >
                        {change}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </div>
      <aside className="what-changed">
        <div className="insight-symbol">
          <BarChart3 size={28} />
        </div>
        <div>
          <h2>What changed?</h2>
          <p>Key developments behind the trends.</p>
        </div>
        <ul>
          <li>
            <Check size={15} />
            Operating margin was {percentage(marginLast)} in{" "}
            {periods[marginIndex]}.
          </li>
          <li>
            <Check size={15} />
            Operating cash conversion was {percentage(conversionLast)} in{" "}
            {periods[cashIndex]}.
          </li>
          <li>
            <TrendingUp size={15} />
            Revenue changed by {percentage(growth)} versus the prior published
            fiscal year.
          </li>
        </ul>
      </aside>
    </section>
  );
}
