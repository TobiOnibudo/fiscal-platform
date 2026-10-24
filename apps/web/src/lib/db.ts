import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import type { DB } from "./db.generated";

// Read contract shared with Alembic. Regenerate after migrations; web never owns migrations.
export type Database = DB;
let connection: Kysely<Database> | undefined;
let reviewConnection: Kysely<Database> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (connection ??= new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 4000,
        idleTimeoutMillis: 10000,
        query_timeout: 5000,
        types: {
          getTypeParser: (oid, format) =>
            oid === 1082 || oid === 1700
              ? (value: string) => value
              : types.getTypeParser(oid, format),
        },
      }),
    }),
  }));
}

/**
 * Review writes are intentionally unavailable in hosted deployments. Keep this
 * credential in the local operator environment only; Vercel receives the
 * read-only DATABASE_URL used above.
 */
export function reviewDatabase() {
  if (process.env.REVIEW_MODE !== "local" || process.env.VERCEL)
    throw new Error("REVIEW_MODE_DISABLED");
  const connectionString =
    process.env.REVIEW_DATABASE_URL ?? process.env.INGEST_DATABASE_URL;
  if (!connectionString)
    throw new Error("REVIEW_DATABASE_NOT_CONFIGURED");
  return (reviewConnection ??= new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 2,
        connectionTimeoutMillis: 4000,
        idleTimeoutMillis: 10000,
        types: {
          getTypeParser: (oid, format) =>
            oid === 1082 || oid === 1700
              ? (value: string) => value
              : types.getTypeParser(oid, format),
        },
        options: "-c statement_timeout=5000",
      }),
    }),
  }));
}

export function reviewEnabled() {
  return process.env.REVIEW_MODE === "local" && !process.env.VERCEL;
}
