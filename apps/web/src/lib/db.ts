import { Kysely, PostgresDialect } from "kysely";
import { Pool, types } from "pg";
import type { DB } from "./db.generated";

// Read contract shared with Alembic. Regenerate after migrations; web never owns migrations.
export type Database = DB;
let connection: Kysely<Database> | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (connection ??= new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        connectionTimeoutMillis: 4000,
        idleTimeoutMillis: 10000,
        types: { getTypeParser: (oid, format) => oid === 1082 || oid === 1700 ? (value: string) => value : types.getTypeParser(oid, format) },
        options:
          "-c default_transaction_read_only=on -c statement_timeout=5000",
      }),
    }),
  }));
}
