/**
 * GET /api/v1/recommendations (spec section 9.7).
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { recommendations } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");

  const conds = [eq(recommendations.userId, userId)];
  if (status === "pending" || status === "accepted" || status === "snoozed" || status === "dismissed" || status === "completed") {
    conds.push(eq(recommendations.status, status));
  }
  if (kind === "re_engage" || kind === "expand") {
    conds.push(eq(recommendations.kind, kind));
  }
  const rows = await adminDb
    .select()
    .from(recommendations)
    .where(and(...conds))
    .orderBy(desc(recommendations.priorityScore));
  return apiOk({ data: toSnake(rows) });
}
