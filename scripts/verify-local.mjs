import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Explicitly configured test databases are disposable: integration tests truncate tables.
// This runner never copies the application connection into TEST_DATABASE_URL.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evidence = resolve(root, "docs/verification/evidence");
const python =
  process.env.FISCAL_PYTHON ??
  resolve(
    root,
    process.platform === "win32"
      ? "pipeline/.venv/Scripts/python.exe"
      : "pipeline/.venv/bin/python",
  );
const appUrl = process.env.FISCAL_APP_URL ?? "http://127.0.0.1:3100";
const gitStatus = spawnSync(
  "git",
  [
    "-c",
    `safe.directory=${root.replaceAll("\\", "/")}`,
    "status",
    "--porcelain",
  ],
  { cwd: root, encoding: "utf8", windowsHide: true },
);
const workingTree = {
  recordedAt: new Date().toISOString(),
  status: gitStatus.status === 0 ? gitStatus.stdout.trim() : "Unavailable",
  dirty: gitStatus.status === 0 ? Boolean(gitStatus.stdout.trim()) : null,
};
await mkdir(evidence, { recursive: true });
const checks = [];
async function command(
  id,
  label,
  executable,
  args,
  cwd = root,
  enabled = true,
) {
  const display = [
    executable === python
      ? "python"
      : executable === process.execPath
        ? "node"
        : executable,
    ...args,
  ].join(" ");
  const started = Date.now();
  let output = "";
  let exitCode = null;
  if (enabled) {
    exitCode = await new Promise((done) => {
      const child = spawn(executable, args, {
        cwd,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", NO_COLOR: "1" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      child.on("error", (error) => {
        output += error.message;
        done(1);
      });
      child.on("close", (code) => done(code ?? 1));
    });
  } else
    output =
      "Skipped: explicit disposable database connection not configured.\n";
  const log = `${id}.log`;
  await writeFile(resolve(evidence, log), output);
  const result = {
    id,
    label,
    status: !enabled ? "skipped" : exitCode === 0 ? "pass" : "fail",
    command: display,
    exitCode,
    durationMs: Date.now() - started,
    log,
  };
  checks.push(result);
  console.log(`${result.status.toUpperCase()} ${label}`);
  return output.trim();
}
const pythonVersion = await command(
  "python-runtime",
  "Python runtime",
  python,
  ["--version"],
);
const sourceRevision = await command("revision", "Base Git commit", "git", [
  "-c",
  `safe.directory=${root.replaceAll("\\", "/")}`,
  "rev-parse",
  "HEAD",
]);
await command("python-lint", "Python lint", python, [
  "-m",
  "ruff",
  "check",
  "pipeline",
]);
await command("python-format", "Python formatting", python, [
  "-m",
  "ruff",
  "format",
  "--check",
  "pipeline",
]);
await command("python-types", "Strict Python types", python, [
  "-m",
  "mypy",
  "--config-file",
  "pipeline/pyproject.toml",
  "pipeline/src/fiscal_pipeline",
]);
const testOutput = await command(
  "python-tests",
  "Python tests including PostgreSQL integration",
  python,
  [
    "-m",
    "pytest",
    "pipeline/tests",
    "-q",
    "-p",
    "no:cacheprovider",
    `--junitxml=${resolve(evidence, "pytest.xml")}`,
  ],
  root,
  Boolean(process.env.TEST_DATABASE_URL),
);
await command("contracts", "Generated extraction contracts", python, [
  "-m",
  "fiscal_pipeline.contracts",
  "--check",
]);
await command(
  "migration-drift",
  "Alembic schema drift",
  python,
  ["-m", "alembic", "-c", "pipeline/alembic.ini", "check"],
  root,
  Boolean(process.env.MIGRATION_DATABASE_URL),
);
const postgresVersion = await command(
  "postgres-runtime",
  "PostgreSQL server version",
  python,
  [
    "-c",
    "import os; from sqlalchemy import create_engine, text; e=create_engine(os.environ['TEST_DATABASE_URL']); c=e.connect(); print(c.scalar(text(\"select current_setting('server_version')\"))); c.close(); e.dispose()",
  ],
  root,
  Boolean(process.env.TEST_DATABASE_URL),
);
const web = resolve(root, "apps/web");
const bin = (path) => resolve(root, "node_modules", path);
await command(
  "web-lint",
  "Frontend ESLint",
  process.execPath,
  [bin("eslint/bin/eslint.js"), "."],
  web,
);
await command(
  "web-types",
  "Frontend TypeScript",
  process.execPath,
  [bin("typescript/bin/tsc"), "--noEmit"],
  web,
);
const webTestOutput = await command(
  "web-tests",
  "Frontend API and rendering tests",
  process.execPath,
  [bin("vitest/vitest.mjs"), "run", "--configLoader", "native"],
  web,
);
await command(
  "db-types",
  "Generated database types",
  process.execPath,
  ["apps/web/scripts/db-types.mjs", "--check"],
  root,
  Boolean(process.env.DATABASE_URL),
);
await command(
  "report-tests",
  "Verification report safety tests",
  process.execPath,
  ["--test", "scripts/verification-report.test.mjs"],
);
await command(
  "production-build",
  "Next.js production build",
  process.execPath,
  [bin("next/dist/bin/next"), "build", "apps/web", "--webpack"],
);

const preservedDocuments = [];
for (const [path, expected] of [
  [
    "docs/problem-statement.md",
    "dc4f4c30986f6b5eb29a07e8bd31a431c43f299244e1513950ba9ab20e73dee7",
  ],
  [
    "docs/engineering-design.md",
    "6e65e3ebb1e8ee3256f0c004e280247ea54cc021c6062a96ce3ef1daf82bfe25",
  ],
]) {
  const sha256 = createHash("sha256")
    .update(await readFile(resolve(root, path)))
    .digest("hex");
  preservedDocuments.push({
    path,
    sha256,
    expected,
    passed: sha256 === expected,
  });
}
// Also verifies the actual application, not just a listening TCP port.
const smoke = [];
for (const [path, expected, code] of [
  ["/api/v1/health", 200, "ready"],
  ["/api/v1/companies", 200],
  ["/api/v1/companies/wise/statements", 404, "NO_PUBLISHED_DATASET"],
  ["/api/v1/companies/adyen/statements", 404, "NO_PUBLISHED_DATASET"],
  ["/api/v1/companies/wise/filings", 200],
  ["/api/v1/companies/wise/quality", 404, "NO_PUBLISHED_DATASET"],
  ["/api/v1/companies/wise/export", 400, "VERSION_REQUIRED"],
  ["/api/v1/companies?unexpected=1", 400, "INVALID_REQUEST"],
]) {
  try {
    const response = await fetch(`${appUrl}${path}`, {
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    const received = body.error?.code ?? body.status;
    const passed = response.status === expected && (!code || code === received);
    smoke.push({
      path,
      status: response.status,
      expected,
      received: received ?? null,
      passed,
    });
  } catch (error) {
    smoke.push({
      path,
      status: null,
      expected,
      passed: false,
      error: error.message,
    });
  }
}
await writeFile(
  resolve(evidence, "smoke.json"),
  `${JSON.stringify(smoke, null, 2)}\n`,
);
const results = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  sourceRevisionMeaning: "Base Git commit, not a hash of the working tree",
  workingTree,
  runtime: {
    node: process.version,
    python: pythonVersion,
    postgres: postgresVersion,
  },
  appUrl,
  testCounts: {
    pythonPassed: Number(testOutput.match(/(\d+) passed/)?.[1] ?? 0),
    frontendPassed: Number(
      webTestOutput.match(/Tests\s+(\d+) passed/)?.[1] ?? 0,
    ),
  },
  checks,
  smoke,
  preservedDocuments,
};
await writeFile(
  resolve(evidence, "results.json"),
  `${JSON.stringify(results, null, 2)}\n`,
);
const failed =
  checks.some((check) => check.status === "fail") ||
  smoke.some((check) => !check.passed) ||
  preservedDocuments.some((check) => !check.passed);
console.log(
  `Evidence written to docs/verification/evidence/results.json; ${failed ? "failures found" : "no failures"}.`,
);
if (failed) process.exitCode = 1;
