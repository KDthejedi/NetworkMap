import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";

export async function POST(_req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  await adminDb
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return apiOk({ ok: true });
}
