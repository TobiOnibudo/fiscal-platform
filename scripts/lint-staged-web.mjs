import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

// pre-commit supplies repository-relative paths; ESLint resolves its config from web.
const root = process.cwd();
const files = process.argv.slice(2).map((file) => resolve(root, file));
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/eslint/bin/eslint.js"),
    "--fix",
    "--no-warn-ignored",
    ...files,
  ],
  { cwd: resolve(root, "apps/web"), stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
