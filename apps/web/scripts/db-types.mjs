import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = fileURLToPath(
  new URL("../src/lib/db.generated.ts", import.meta.url),
);
const cli = fileURLToPath(
  new URL(
    "../../../node_modules/kysely-codegen/dist/cli/bin.js",
    import.meta.url,
  ),
);
const args = [
  cli,
  "--dialect",
  "postgres",
  "--date-parser",
  "string",
  "--numeric-parser",
  "string",
  "--exclude-pattern",
  "alembic_version",
  "--out-file",
  output,
];
if (process.argv.includes("--check")) args.push("--verify");
const result = spawnSync(process.execPath, args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.error)
  console.error(
    "Database type generation could not start. Check Node and installed dependencies.",
  );
process.exitCode = result.status ?? 1;
