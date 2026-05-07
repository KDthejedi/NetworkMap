/**
 * Migration entry point. Runs Drizzle SQL migrations from lib/db/migrations
 * then applies the policies/triggers SQL.
 *
 * Usage: pnpm db:migrate
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Inline .env loader, see drizzle.config.ts for rationale.
for (const file of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
}
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function run() {
  const url =
    process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not set");
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);

  const migrationsFolder = resolve(process.cwd(), "lib/db/migrations");
  if (existsSync(migrationsFolder)) {
    console.log("running drizzle migrations from", migrationsFolder);
    await migrate(db, { migrationsFolder });
  } else {
    console.log("no migrations folder yet; skipping drizzle migrate");
  }

  const policiesPath = resolve(process.cwd(), "lib/db/policies.sql");
  if (existsSync(policiesPath)) {
    console.log("applying policies/triggers from", policiesPath);
    const sqlText = readFileSync(policiesPath, "utf-8");
    await pool.query(sqlText);
  }

  await pool.end();
  console.log("migrations complete");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
