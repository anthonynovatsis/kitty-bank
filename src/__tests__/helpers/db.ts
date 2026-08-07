import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as schema from "~/server/db/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../drizzle");

// =============================================================================
// PostgreSQL swap point
//
// To migrate this helper to PostgreSQL:
//   1. Replace `createClient` / `@libsql/client` with a pg client (e.g. `pg` or `postgres`)
//   2. Replace `drizzle/libsql` with `drizzle-orm/pg-core` (and update schema to pgTable)
//   3. Update `runMigrations` to use the pg client's query method
//   4. All test files that import from this helper remain unchanged
// =============================================================================

/**
 * Every migration, in order. Read from disk rather than listed by hand: a
 * hardcoded list silently omits new migrations, and the tests then run against
 * a schema that no longer matches the app. Drizzle's numeric filename prefixes
 * sort correctly as strings.
 */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

function loadStatements(): string[] {
  return migrationFiles().flatMap((file) => {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");
    return sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      // Strip comment-only fragments; `--` comments would otherwise swallow
      // the statement they precede once newlines are normalised.
      .filter((s) => s && !s.split("\n").every((line) => line.trim().startsWith("--")));
  });
}

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Create an isolated SQLite database for one test suite.
 *
 * Backed by a temp *file*, not `:memory:`. LibSQL opens a separate connection
 * for each `db.transaction()`, and every connection to `:memory:` gets its own
 * empty database — so any code path using a transaction would silently leave
 * the suite querying a blank DB afterwards. A per-suite temp file gives real
 * transaction (and rollback) semantics for the same cost.
 */
export function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), "vale-bank-test-"));
  const dbPath = join(dir, "test.db");

  // Note the `file:` + path form (no `file:///`): the triple-slash absolute
  // form makes @libsql/client open a fresh empty database and ignore the file.
  const client = createClient({ url: `file:${dbPath}` });
  const db = drizzle(client, { schema, casing: "snake_case" });

  // Suites don't manage the file's lifetime; drop the whole temp dir on exit.
  process.on("exit", () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort — the OS reclaims tmpdir anyway
    }
  });

  async function migrate() {
    for (const statement of loadStatements()) {
      await client.execute(statement);
    }
  }

  return { db, client, migrate };
}
