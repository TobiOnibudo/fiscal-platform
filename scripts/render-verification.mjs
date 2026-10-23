import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const escape = (value) =>
  String(value ?? "Not recorded").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

function logLink(log) {
  if (
    typeof log !== "string" ||
    !/^[a-zA-Z0-9_./-]+$/.test(log) ||
    log.startsWith("/") ||
    log.split("/").some((part) => part === ".." || !part)
  ) {
    return "No log recorded";
  }
  return `<a href="evidence/${escape(log)}">${escape(log)}</a>`;
}

function status(value) {
  if (!["pass", "fail", "skipped"].includes(value)) {
    throw new TypeError(`Unsupported check status: ${String(value)}`);
  }
  return `<strong class="status ${value}">${value.toUpperCase()}</strong>`;
}

const scrollTable = (label, content) =>
  `<div class="table-wrap" role="region" aria-label="${escape(label)}" tabindex="0">${content}</div>`;

/** Render recorded evidence; no checks are executed or inferred here. */
export function renderReport(results) {
  if (results?.schemaVersion !== 1 || !Array.isArray(results.checks)) {
    throw new TypeError(
      "Expected verification evidence schemaVersion 1 and checks array",
    );
  }
  const counts = { pass: 0, fail: 0, skipped: 0 };
  const checkRows = results.checks.map((check) => {
    const indicator = status(check.status);
    counts[check.status] += 1;
    const duration = Number.isFinite(check.durationMs)
      ? `${(check.durationMs / 1000).toFixed(2)} s`
      : "Not recorded";
    return `<tr><th scope="row">${escape(check.label)}</th><td>${indicator}</td><td><code>${escape(check.command)}</code></td><td>${escape(duration)}</td><td>${escape(check.exitCode)}</td><td>${logLink(check.log)}</td></tr>`;
  });
  const smokeRows = (results.smoke ?? []).map(
    (item) =>
      `<tr><th scope="row"><code>${escape(item.path)}</code></th><td>${status(item.passed === true ? "pass" : "fail")}</td><td>${escape(item.status)}</td><td>${escape(item.expected)}</td></tr>`,
  );
  const hashRows = (results.preservedDocuments ?? []).map(
    (item) =>
      `<tr><th scope="row"><code>${escape(item.path)}</code></th><td>${status(item.passed === true ? "pass" : "fail")}</td><td><code>${escape(item.sha256)}</code></td><td><code>${escape(item.expected)}</code></td></tr>`,
  );
  const runtime = results.runtime ?? {};
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Implementation verification | Fiscal platform</title>
  <style>
    /* Report-local tokens reference apps/web/src/app/globals.css. */
    :root { color-scheme: dark; --report-background:#101315; --report-surface:#171b1e; --report-raised:#1d2327; --report-border:#2c3439; --report-foreground:#edf0ee; --report-muted:#a4afad; --report-accent:#b9dbb1; --report-space:16px; --report-pad:20px; --report-section:40px; font:14px/1.7 "Segoe UI",Arial,sans-serif; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--report-background); color:var(--report-foreground); overflow-wrap:anywhere; }
    main { max-width:1120px; margin:0 auto; padding:var(--report-section) var(--report-pad) 80px; min-width:0; }
    a { color:var(--report-accent); text-underline-offset:4px; }
    a:focus-visible, summary:focus-visible, [tabindex]:focus-visible { outline:2px solid var(--report-accent); outline-offset:4px; }
    .skip-link { position:absolute; top:-100px; left:var(--report-space); padding:var(--report-space); background:var(--report-accent); color:var(--report-background); }
    .skip-link:focus { top:var(--report-space); }
    h1,h2,h3,p { margin:0; }
    h1 { font-size:34px; line-height:1.2; font-weight:600; letter-spacing:-.03em; }
    h2 { font-size:22px; line-height:1.4; font-weight:600; letter-spacing:-.015em; margin-bottom:var(--report-space); }
    h3 { font-size:16px; margin:var(--report-pad) 0 var(--report-space); }
    header { padding-bottom:var(--report-section); }
    .eyebrow,.muted { color:var(--report-muted); }
    .eyebrow { margin-bottom:var(--report-space); }
    .verdict { margin-top:var(--report-pad); padding:var(--report-pad); border-left:4px solid var(--report-accent); background:var(--report-surface); font-size:18px; font-weight:600; }
    .intro { margin-top:var(--report-space); max-width:80ch; color:var(--report-muted); }
    nav { display:flex; flex-wrap:wrap; gap:var(--report-space) var(--report-pad); margin-top:var(--report-pad); }
    nav a { padding-block:4px; }
    section { border-top:1px solid var(--report-border); padding-top:var(--report-section); margin-top:var(--report-section); min-width:0; }
    section:first-of-type { margin-top:0; }
    .table-wrap { overflow-x:auto; max-width:100%; margin-top:var(--report-pad); border:1px solid var(--report-border); }
    table { width:100%; border-collapse:collapse; text-align:left; font-size:14px; }
    caption { text-align:left; padding:var(--report-space); background:var(--report-surface); color:var(--report-muted); }
    th,td { padding:var(--report-space); vertical-align:top; border-bottom:1px solid var(--report-border); min-width:100px; }
    thead { background:var(--report-raised); }
    tbody th { font-weight:600; }
    tbody tr:last-child > * { border-bottom:0; }
    td code { white-space:pre-wrap; }
    code { font-family:"Cascadia Mono",Consolas,monospace; font-size:12px; overflow-wrap:anywhere; }
    .status { font-size:12px; letter-spacing:.04em; }
    .pass { color:var(--report-accent); }
    .fail { color:var(--report-foreground); text-decoration:underline double; }
    .skipped { color:var(--report-muted); }
    ol,ul { padding-left:var(--report-pad); margin:var(--report-space) 0 0; }
    li + li { margin-top:var(--report-space); }
    details { padding:var(--report-pad); background:var(--report-surface); margin-top:var(--report-pad); }
    summary { cursor:pointer; font-weight:600; }
    dl { display:grid; grid-template-columns:140px minmax(0,1fr); gap:var(--report-space); margin:var(--report-pad) 0 0; }
    dt { color:var(--report-muted); } dd { margin:0; min-width:0; }
    footer { margin-top:var(--report-section); color:var(--report-muted); }
    @media(max-width:600px) { main { padding-top:var(--report-pad); } h1 { font-size:30px; } dl { grid-template-columns:1fr; } dd { margin-bottom:var(--report-space); } th,td { padding:var(--report-space); } }
    @media print { :root { color-scheme:light; --report-background:#fff; --report-surface:#fff; --report-raised:#eee; --report-foreground:#111; --report-muted:#444; --report-border:#aaa; --report-accent:#234c20; } main { max-width:none; padding:0; } .skip-link { display:none; } .table-wrap { overflow:visible; } table { table-layout:fixed; font-size:10px; } th,td { min-width:0; padding:8px; } code { font-size:9px; } section { margin-top:20px; padding-top:20px; } h2,summary { break-after:avoid; } tr { break-inside:avoid; } details > * { display:block; } }
  </style>
</head>
<body>
<a class="skip-link" href="#report">Skip to verification report</a>
<main id="report" tabindex="-1">
  <header>
    <p class="eyebrow">Fiscal platform · Local evidence</p>
    <h1>Implementation verification</h1>
    <p class="verdict">Foundation implemented; assessment incomplete</p>
    <p class="intro">This report records engineering checks for the application and ingestion foundation. Wise and Adyen have no verified published financial dataset. Passing software checks does not establish financial accuracy or completion of the assessment.</p>
    <nav aria-label="Report navigation">
      <a href="http://127.0.0.1:3100">Open local app</a>
      <a href="../verification-report.md">Written verification report</a>
      <a href="evidence/results.json">Raw evidence JSON</a>
      <a href="#results">Check results</a>
      <a href="#scope">Implemented vs remaining</a>
      <a href="#walkthrough">Human walkthrough</a>
      <a href="#limitations">Limitations</a>
      <a href="#metadata">Technical metadata</a>
    </nav>
  </header>
  <section id="results" aria-labelledby="results-title">
    <h2 id="results-title">Verification results</h2>
    <p>${counts.pass} PASS · ${counts.fail} FAIL · ${counts.skipped} SKIPPED. These totals reflect only the recorded commands below.</p>
    ${scrollTable("Recorded command results", `<table><caption>Command evidence, generated ${escape(results.generatedAt)}</caption><thead><tr><th scope="col">Check</th><th scope="col">Result</th><th scope="col">Command</th><th scope="col">Duration</th><th scope="col">Exit code</th><th scope="col">Evidence log</th></tr></thead><tbody>${checkRows.join("\n") || '<tr><td colspan="6">No command checks recorded.</td></tr>'}</tbody></table>`)}
    <h3>HTTP smoke checks</h3>
    <p class="muted">Endpoint observations are shown separately from command totals.</p>
    ${scrollTable("HTTP smoke results", `<table><thead><tr><th scope="col">Path</th><th scope="col">Result</th><th scope="col">Observed status</th><th scope="col">Expected</th></tr></thead><tbody>${smokeRows.join("\n") || '<tr><td colspan="4">No HTTP smoke observations recorded.</td></tr>'}</tbody></table>`)}
  </section>
  <section id="scope" aria-labelledby="scope-title">
    <h2 id="scope-title">Implemented vs remaining</h2>
    <p>Read the <a href="../verification-report.md">written report</a> for the full assessment and evidence context.</p>
    ${scrollTable(
      "Implementation scope",
      `<table><thead><tr><th scope="col">Area</th><th scope="col">Implemented foundation</th><th scope="col">Remaining assessment work</th></tr></thead><tbody>
      <tr><th scope="row">Review workspace</th><td>Next.js statement workspace, company selection and explicit empty states.</td><td>Verified Wise and Adyen data; source-backed human review of populated screens.</td></tr>
      <tr><th scope="row">Source acquisition</th><td>Configured official-index discovery and guarded PDF download commands.</td><td>Actual official-report scraping, annual-report classification and complete historical coverage.</td></tr>
      <tr><th scope="row">Extraction and review</th><td>Optional extraction adapter, exact decimal transformations, independent inventory validation and provenance contracts.</td><td>Real extraction, independently reviewed mappings and financial accuracy evaluation. No AI call was made.</td></tr>
      <tr><th scope="row">Publication</th><td>Migrations, deterministic comparative selection and guarded snapshot publication.</td><td>Ten-year company backfill, approved real-company snapshots and a complete backfill orchestrator.</td></tr>
      <tr><th scope="row">Operations</th><td>Local checks and deployment workflow configuration.</td><td>Public deployment, container execution and remote CI verification.</td></tr>
    </tbody></table>`,
    )}
  </section>
  <section id="walkthrough" aria-labelledby="walkthrough-title">
    <h2 id="walkthrough-title">Human walkthrough</h2>
    <p>Use the locally running app at <a href="http://127.0.0.1:3100">127.0.0.1:3100</a>. These are review instructions, not a claim that a person completed them.</p>
    <ol>
      <li>Select Wise, then Adyen. Each issuer should show an honest unpublished or empty state with no verified financial amounts.</li>
      <li>Move through the available statement tabs and supporting views. Check that missing source coverage remains visible and that the interface does not imply completed ingestion.</li>
      <li>Use the keyboard to reach company selection, navigation and report links. Reduce the viewport width and check that the page remains usable.</li>
      <li>Inspect command logs and raw evidence above. Optional fixture or replay tests exercise synthetic test data; they do not establish real company results.</li>
    </ol>
  </section>
  <section id="limitations" aria-labelledby="limitations-title">
    <h2 id="limitations-title">Limitations</h2>
    <ul>
      <li>No AI provider was called and no paid extraction usage was incurred during this verification.</li>
      <li>No verified company financial dataset, actual scraping run, classified report inventory or completed backfill is delivered.</li>
      <li>Container execution, remote CI and a public deployment are not verified by these local checks.</li>
      <li>A passing test establishes only the behavior it checks. It does not establish financial accuracy, completeness of historical sources or readiness for financial decisions.</li>
      <li>Evidence describes the recorded revision and local runtime. The app link requires a running local server; it is not a hosted deployment.</li>
    </ul>
  </section>
  <section id="metadata" aria-labelledby="metadata-title">
    <h2 id="metadata-title">Technical metadata</h2>
    <details>
      <summary>Revision, runtime and preserved-document hashes</summary>
      <dl><dt>Generated at</dt><dd><code>${escape(results.generatedAt)}</code></dd><dt>Base Git commit</dt><dd><code>${escape(results.sourceRevision)}</code></dd><dt>Working tree</dt><dd><code>${escape(results.workingTree?.status || (results.workingTree?.dirty === false ? "Clean when recorded" : "Not recorded"))}</code></dd><dt>Node</dt><dd><code>${escape(runtime.node)}</code></dd><dt>Python</dt><dd><code>${escape(runtime.python)}</code></dd><dt>Postgres</dt><dd><code>${escape(runtime.postgres)}</code></dd><dt>Recorded app URL</dt><dd><code>${escape(results.appUrl)}</code></dd></dl>
      <p class="muted">The Git commit identifies the base checkout, not uncommitted or untracked files. Working-tree status is recorded separately; this is not a cryptographic manifest of every tested input.</p>
      ${scrollTable("Preserved document hashes", `<table><caption>SHA-256 comparison against the recorded expected values</caption><thead><tr><th scope="col">Document</th><th scope="col">Result</th><th scope="col">Observed SHA-256</th><th scope="col">Expected SHA-256</th></tr></thead><tbody>${hashRows.join("\n") || '<tr><td colspan="4">No preserved-document hashes recorded.</td></tr>'}</tbody></table>`)}
    </details>
  </section>
  <footer><p>Standalone static report. No network assets or browser JavaScript are required to read it.</p></footer>
</main>
</body>
</html>
`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const input = resolve(
    root,
    process.argv[2] ?? "docs/verification/evidence/results.json",
  );
  const output = resolve(root, "docs/verification/index.html");
  const results = JSON.parse(await readFile(input, "utf8"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, renderReport(results), "utf8");
  console.log(`Rendered ${output}`);
}
