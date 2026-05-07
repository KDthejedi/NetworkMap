/**
 * POST /api/v1/recommendations/{id}/feedback (spec section 9.7 / 4.12).
 * Records user response and updates the recommendation status.
 *
 * Accepts both JSON bodies (for fetch) and form posts (Today's Pulse renders
 * snooze/dismiss as plain forms for accessibility).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { recommendations, recommendationFeedback } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["accepted", "snoozed", "dismissed", "completed"]),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  let body: Record<string, unknown>;
  if (request.headers.get("content-type")?.includes("application/json")) {
    body = await request.json().catch(() => ({}));
  } else {
    const form = await request.formData();
    body = Object.fromEntries(form.entries());
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "Invalid action");
  }

  const [rec] = await adminDb
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.id, id),
        eq(recommendations.userId, userId),
      ),
    );
  if (!rec) return apiError("NOT_FOUND", "Recommendation not found");

  const status = parsed.data.action;
  await adminDb
    .update(recommendations)
    .set({
      status,
      snoozedUntil:
        status === "snoozed"
          ? new Date(Date.now() + 3 * 86_400_000)
          : null,
    })
    .where(eq(recommendations.id, id));

  await adminDb.insert(recommendationFeedback).values({
    userId,
    recommendationId: id,
    action: status,
    reason: parsed.data.reason ?? null,
  });

  // Browser form posts expect a redirect, not JSON.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.redirect(new URL("/home", request.url), 303);
  }
  return apiOk({ ok: true });
}
