"use client";

import { useState } from "react";
import { BarChart3, CalendarDays, Check, Info, TrendingUp } from "lucide-react";

const annualPeriods = ["FY20", "FY21", "FY22", "FY23", "FY24"];
const quarterlyPeriods = ["Q1 24", "Q2 24", "Q3 24", "Q4 24", "Q1 25"];

const annualData = {
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

function points(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - ((value - min) / span) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
}

function Sparkline({ values, negative = false }: { values: number[]; negative?: boolean }) {
  return (
    <svg className="sparkline" viewBox="0 0 86 28" aria-hidden="true">
      <polyline points={points(values, 86, 28, 4)} fill="none" stroke={negative ? "#f0b567" : "#27c2a0"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {values.map((value, index) => {
        const [x, y] = points(values, 86, 28, 4).split(" ")[index].split(",");
        return <circle key={value} cx={x} cy={y} r="2" fill={negative ? "#f0b567" : "#27c2a0"} />;
      })}
    </svg>
  );
}

function RevenueChart({ quarterly, start, end }: { quarterly: boolean; start: number; end: number }) {
  const data = quarterly ? quarterlyData : annualData;
  const periods = (quarterly ? quarterlyPeriods : annualPeriods).slice(start, end + 1);
  const revenue = data.revenue.slice(start, end + 1);
  const margin = data.margin.slice(start, end + 1);
  const revenueMax = quarterly ? 400 : 1400;
  const marginPoints = points(margin, 700, 270, 35).split(" ");
  const x = (i: number) => 55 + (i * 575) / Math.max(periods.length - 1, 1);
  const yRevenue = (value: number) => 242 - (value / revenueMax) * 185;
  return (
    <svg className="trend-chart" viewBox="0 0 700 290" role="img" aria-label="Revenue and adjusted EBITDA margin by period">
      {[0, 1, 2, 3, 4].map((grid) => <line key={grid} x1="55" x2="630" y1={57 + grid * 46} y2={57 + grid * 46} className="chart-grid" />)}
      {[0, 1, 2, 3, 4].map((grid) => <text key={grid} x="8" y={246 - grid * 46} className="chart-axis">£{Math.round((revenueMax / 4) * grid)}m</text>)}
      {[0, 10, 20, 30, 40].map((grid) => <text key={grid} x="642" y={246 - grid * 46} className="chart-axis">{grid}%</text>)}
      <line x1="55" x2="55" y1="55" y2="242" className="chart-axis-line" />
      <line x1="630" x2="630" y1="55" y2="242" className="chart-axis-line" />
      {revenue.map((value, index) => {
        const barWidth = quarterly ? 60 : 74;
        return <g key={periods[index]}>
          <rect x={x(index) - barWidth / 2} y={yRevenue(value)} width={barWidth} height={242 - yRevenue(value)} rx="2" className="chart-bar" />
          <text x={x(index)} y={Math.max(yRevenue(value) - 8, 50)} textAnchor="middle" className="chart-value">£{value.toFixed(quarterly ? 0 : 1)}m</text>
          <text x={x(index)} y="268" textAnchor="middle" className="chart-label">{periods[index]}</text>
        </g>;
      })}
      <polyline points={marginPoints.join(" ")} className="chart-line" />
      {marginPoints.map((point, index) => {
        const [cx, cy] = point.split(",");
        return <g key={periods[index]}><circle cx={cx} cy={cy} r="4" className="chart-dot" /><text x={cx} y={Number(cy) - 13} textAnchor="middle" className="chart-margin">{margin[index]}%</text></g>;
      })}
    </svg>
  );
}

function CashFlowChart({ quarterly, start, end }: { quarterly: boolean; start: number; end: number }) {
  const data = quarterly ? quarterlyData : annualData;
  const periods = (quarterly ? quarterlyPeriods : annualPeriods).slice(start, end + 1);
  const cashFlow = data.cashFlow.slice(start, end + 1);
  const conversionData = data.conversion.slice(start, end + 1);
  const max = quarterly ? 180 : 500;
  const conversion = points(conversionData, 600, 230, 28).split(" ");
  const x = (i: number) => 48 + (i * 490) / Math.max(periods.length - 1, 1);
  const y = (value: number) => 204 - (value / max) * 145;
  return <svg className="trend-chart cash-chart" viewBox="0 0 600 255" role="img" aria-label="Free cash flow and cash flow conversion by period">
    {[0, 1, 2, 3].map((grid) => <line key={grid} x1="48" x2="538" y1={59 + grid * 48} y2={59 + grid * 48} className="chart-grid" />)}
    {[0, 200, 400, 600].map((grid, i) => <text key={grid} x="2" y={208 - i * 48} className="chart-axis">£{quarterly ? Math.round(grid / 3) : grid}m</text>)}
    {cashFlow.map((value, index) => <g key={periods[index]}><rect x={x(index) - 29} y={y(value)} width="58" height={204 - y(value)} rx="2" className="chart-bar" /><text x={x(index)} y="231" textAnchor="middle" className="chart-label">{periods[index]}</text></g>)}
    <polyline points={conversion.join(" ")} className="chart-line" />
    {conversion.map((point, index) => { const [cx, cy] = point.split(","); return <g key={periods[index]}><circle cx={cx} cy={cy} r="4" className="chart-dot" /><text x={cx} y={Number(cy) - 12} textAnchor="middle" className="chart-margin">{conversionData[index]}%</text></g>; })}
  </svg>;
}

export function TrendsKpi({ company }: { company: string }) {
  const [period, setPeriod] = useState<"annual" | "quarterly">("annual");
  const [chart, setChart] = useState<"performance" | "cashflow">("performance");
  const [panel, setPanel] = useState<"trends" | "kpis">("trends");
  const [range, setRange] = useState({ start: 0, end: 4 });
  const quarterly = period === "quarterly";
  const periods = quarterly ? quarterlyPeriods : annualPeriods;
  const periodRange = `${periods[range.start]} to ${periods[range.end]}`;
  const setCadence = (next: "annual" | "quarterly") => { setPeriod(next); setRange({ start: 0, end: 4 }); };
  const updateStart = (start: number) => setRange((current) => ({ start, end: Math.max(start, current.end) }));
  const updateEnd = (end: number) => setRange((current) => ({ start: Math.min(current.start, end), end }));
  const title = company === "adyen" ? "Adyen" : "Wise";
  const metrics = [
    ["Revenue", quarterly ? "£360.4m" : "£1,201.8m", quarterly ? "+14.2%" : "+16.7%", "vs. prior period"],
    ["Revenue growth", quarterly ? "14.2%" : "16.7%", quarterly ? "+2.8pp" : "+5.1pp", "vs. prior period"],
    ["Adjusted EBITDA margin", quarterly ? "31.4%" : "30.2%", quarterly ? "+1.2pp" : "+4.8pp", "vs. prior period"],
    ["Free cash flow", quarterly ? "£161.9m" : "£423.1m", quarterly ? "+40.4%" : "+42.1%", "vs. prior period"],
  ];
  const rows = [
    ["Revenue growth", [35.8, 77.5, 50.3, 21.2, 16.7], "-19.1pp", true],
    ["Gross margin", [54.1, 56.8, 58.9, 60.2, 61.5], "+7.4pp", false],
    ["EBITDA margin", annualData.margin, "+19.6pp", false],
    ["FCF margin", annualData.conversion, "+20.9pp", false],
    ["Net debt / EBITDA", [1.8, 1.5, 1.2, 0.8, 0.3], "-1.5x", true],
  ] as const;
  return <section className="trends-view" aria-label="Trends and KPI analysis">
    <div className="trend-heading">
      <div><h1>{title}: Trends &amp; KPIs</h1><p>Key financial trends, operating metrics and quality indicators for fundamental analysis.</p></div>
      <div className="trend-controls">
        <div className="segmented" role="group" aria-label="Reporting cadence"><button className={period === "annual" ? "active" : ""} aria-pressed={period === "annual"} onClick={() => setCadence("annual")}>Annual</button><button className={period === "quarterly" ? "active" : ""} aria-pressed={period === "quarterly"} onClick={() => setCadence("quarterly")}>Quarterly</button></div>
        <details className="range-filter">
          <summary className="range-button"><CalendarDays size={15} />{periodRange}</summary>
          <div className="range-popover">
            <label>From<select value={range.start} onChange={(event) => updateStart(Number(event.target.value))}>{periods.map((item, index) => <option value={index} key={item}>{item}</option>)}</select></label>
            <span className="range-separator" aria-hidden="true">to</span>
            <label>To<select value={range.end} onChange={(event) => updateEnd(Number(event.target.value))}>{periods.map((item, index) => <option value={index} key={item}>{item}</option>)}</select></label>
            <button type="button" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}>Done</button>
          </div>
        </details>
      </div>
    </div>
    <div className="kpi-strip">{metrics.map(([label, value, delta, context]) => <article className="kpi" key={label}><p>{label}</p><span className="kpi-period">{periods[range.end]}</span><strong>{value}</strong><div><b>{delta}</b><span>{context}</span></div></article>)}</div>
    <div className="analysis-tabs" role="tablist" aria-label="Trends and KPIs content">
      <button id="analysis-trends-tab" role="tab" aria-selected={panel === "trends"} aria-controls="analysis-panel" tabIndex={panel === "trends" ? 0 : -1} onClick={() => setPanel("trends")}>Trend analysis</button>
      <button id="analysis-kpis-tab" role="tab" aria-selected={panel === "kpis"} aria-controls="analysis-panel" tabIndex={panel === "kpis" ? 0 : -1} onClick={() => setPanel("kpis")}>Operating KPIs</button>
    </div>
    <div id="analysis-panel" role="tabpanel" aria-labelledby={`analysis-${panel}-tab`} className={`trends-dashboard ${panel}`}>
      <article className="chart-panel chart-workspace">
        <div className="panel-title chart-workspace-title"><div><h2>{chart === "performance" ? "Revenue & profitability" : "Free cash flow conversion"}</h2><p>{chart === "performance" ? "Group revenue and adjusted EBITDA margin." : "Free cash flow and conversion as a % of revenue."}</p></div><div className="legend"><span><i className="legend-revenue" />{chart === "performance" ? "Revenue (LHS)" : "Free cash flow"}</span><span><i className="legend-margin" />{chart === "performance" ? "EBITDA margin (RHS)" : "FCF conversion"}</span></div></div>
        <div className="chart-tabs" role="tablist" aria-label="Trend charts">
          <button id="performance-tab" role="tab" aria-selected={chart === "performance"} aria-controls="trend-chart-panel" tabIndex={chart === "performance" ? 0 : -1} onClick={() => setChart("performance")}>Performance</button>
          <button id="cashflow-tab" role="tab" aria-selected={chart === "cashflow"} aria-controls="trend-chart-panel" tabIndex={chart === "cashflow" ? 0 : -1} onClick={() => setChart("cashflow")}>Cash flow</button>
        </div>
        <div id="trend-chart-panel" role="tabpanel" aria-labelledby={`${chart}-tab`} className="chart-canvas">
          {chart === "performance" ? <RevenueChart quarterly={quarterly} start={range.start} end={range.end} /> : <CashFlowChart quarterly={quarterly} start={range.start} end={range.end} />}
        </div>
      </article>
      <div className="trends-side-stack">
        <article className="quality-panel"><div><h2>Earnings quality</h2><p>Key drivers of sustainable earnings power.</p></div><div className="quality-bars">{[["Recurring revenue", "88%", 88, "teal"], ["Transaction take rate", "0.62%", 52, "blue"], ["Cost-to-income ratio", "69.8%", 70, "blue"]].map(([label, val, width, tone]) => <div className="quality-row" key={label as string}><div><span>{label} {label === "Recurring revenue" && <Info size={13} />}</span><b>{val}</b></div><div className="quality-track"><i className={tone as string} style={{ width: `${width}%` }} /></div></div>)}</div><div className="analyst-take"><h3>Analyst take</h3><p>Earnings quality remains high, supported by recurring revenue and scalable operating leverage.</p></div></article>
        <article className="operating-table"><div><h2>Operating KPIs</h2><p>FY 2020–2024 trend view.</p></div><div className="operating-scroll"><table><thead><tr><th>Metric</th>{annualPeriods.map((year) => <th key={year}>{year.replace("FY", "20")}</th>)}<th>5Y trend</th><th>5Y change</th></tr></thead><tbody>{rows.map(([label, values, change, negative]) => <tr key={label}><th>{label}</th>{values.map((value, index) => <td key={`${label}-${index}`}>{typeof value === "number" ? `${value}${label === "Net debt / EBITDA" ? "x" : "%"}` : value}</td>)}<td><Sparkline values={values as number[]} negative={negative} /></td><td className={negative ? "negative-change" : "positive-change"}>{change}</td></tr>)}</tbody></table></div></article>
      </div>
    </div>
    <aside className="what-changed"><div className="insight-symbol"><BarChart3 size={28} /></div><div><h2>What changed?</h2><p>Key developments behind the trends.</p></div><ul><li><Check size={15} />Adjusted EBITDA margin expanded by 4.8pp to 30.2%, driven by operating leverage and a lower cost-to-income ratio.</li><li><Check size={15} />Free cash flow conversion climbed to 35.2%, up 6.3pp year over year, reflecting higher profitability and disciplined working capital management.</li><li><TrendingUp size={15} />Revenue growth moderated to 16.7% in 2024 but remains strong, with continued customer growth and higher cross-border volumes.</li></ul></aside>
  </section>;
}
