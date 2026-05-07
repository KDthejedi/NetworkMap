/**
 * Drizzle client.
 *
 * Two access patterns:
 *  - userScopedDb(userId): RLS-aware. Sets the request-scoped GUC app.current_user_id so
 *    the RLS policies in lib/db/policies.sql evaluate the caller's identity.
 *    Use this from any code path serving an authenticated user.
 *  - adminDb: bypasses RLS (the role used by migrations and admin paths).
 *    Reserved for cron, account deletion, and migrations.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? process.env.DATABASE_URL_DIRECT;

if (!connectionString) {
  throw new Error("DATABASE_URL not set");
}

const globalPool = (globalThis as unknown as { __pgPool?: Pool }).__pgPool;

export const pool: Pool =
  globalPool ??
  new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (!globalPool) {
  (globalThis as unknown as { __pgPool: Pool }).__pgPool = pool;
}

export const adminDb = drizzle(pool, { schema });

export type DrizzleAdminClient = typeof adminDb;
export type DrizzleScopedClient = ReturnType<
  typeof drizzle<typeof schema, PoolClient>
>;

/**
 * Run a callback with a per-request connection that has app.current_user_id set.
 * RLS policies use current_setting('app.current_user_id', true) to scope queries.
 */
export async function withUserScope<T>(
  userId: string,
  fn: (db: DrizzleScopedClient, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [
      userId,
    ]);
    const scoped = drizzle(client, { schema });
    const result = await fn(scoped, client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export { sql, schema };
