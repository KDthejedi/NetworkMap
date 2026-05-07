import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread_only") === "true";

  const conds = [eq(notifications.userId, userId)];
  if (unreadOnly) conds.push(isNull(notifications.readAt));

  const rows = await adminDb
    .select()
    .from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  return apiOk({ data: toSnake(rows) });
}
