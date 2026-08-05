import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  client: Client | undefined;
};

export const client =
  globalForDb.client ?? createClient({ url: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema, casing: "snake_case" });

/**
 * An open database transaction, as handed to a `db.transaction()` callback.
 *
 * Routers get `ctx.db` typed for them by tRPC, but helpers that run *inside* a
 * transaction have to name the handle they accept — this is that name.
 */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
