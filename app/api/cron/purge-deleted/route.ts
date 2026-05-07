/**
 * Cron entry that hard-purges users whose deleted_at is older than 30 days
 * (spec section 11.6). Runs daily; secured by CRON_SECRET.
 *
 * Cascades: every user-scoped table has user_id with onDelete: cascade, so a
 * single DELETE FROM users sweeps the whole network.
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { sql, and, lt, isNotNull } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ??
    request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const cutoff = new Date(Date.now() - 30 * 86400_000);
  const result = await adminDb
    .delete(users)
    .where(and(isNotNull(users.deletedAt), lt(users.deletedAt, cutoff)))
    .returning({ id: users.id });

  return Response.json({ purged: result.length, ids: result.map((r) => r.id) });
}

void sql;
