/**
 * Create a briefing chat session (spec section 9.7).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { briefingSessions } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";

const schema = z.object({ title: z.string().max(200).optional() });

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  const title = parsed.success ? parsed.data.title : undefined;

  const [session] = await adminDb
    .insert(briefingSessions)
    .values({ userId, title: title ?? null })
    .returning();
  return apiOk(session, { status: 201 });
}
