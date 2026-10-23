import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({resolve: {preserveSymlinks: true, alias: {"@": fileURLToPath(new URL("./src", import.meta.url))}}, test: {pool: "threads", maxWorkers: 1}});
