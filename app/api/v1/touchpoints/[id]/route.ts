/**
 * PATCH and DELETE for touchpoints. Both refuse on locked rows (DB trigger
 * also enforces this for defense in depth, spec section 4.7).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { touchpoints } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { recomputePulseForContact } from "@/lib/pulse/persist";
import { writeAuditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  occurred_at: z.string().datetime().optional(),
  channel: z
    .enum([
      "text",
      "phone",
      "video",
      "in_person",
      "email",
      "social",
      "voice_note",
      "group_event",
    ])
    .optional(),
  direction: z.enum(["outbound", "inbound", "mutual"]).optional(),
  duration_bucket: z.enum(["quick", "normal", "deep"]).optional(),
  quality_rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [existing] = await adminDb
    .select()
    .from(touchpoints)
    .where(and(eq(touchpoints.id, id), eq(touchpoints.userId, userId)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Touchpoint not found");
  if (existing.lockedAt && existing.lockedAt <= new Date()) {
    return apiError("TOUCHPOINT_LOCKED", "Touchpoint is locked");
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.occurred_at) update.occurredAt = new Date(data.occurred_at);
  if (data.channel) update.channel = data.channel;
  if (data.direction) update.direction = data.direction;
  if (data.duration_bucket) update.durationBucket = data.duration_bucket;
  if (data.quality_rating !== undefined) update.qualityRating = data.quality_rating;
  if (data.note !== undefined) update.note = data.note;

  const [updated] = await adminDb
    .update(touchpoints)
    .set(update)
    .where(eq(touchpoints.id, id))
    .returning();

  await recomputePulseForContact(existing.contactId);
  await writeAuditLog({
    userId,
    actor: "user",
    action: "update",
    entityType: "touchpoint",
    entityId: id,
  });
  return apiOk(toSnake(updated));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [existing] = await adminDb
    .select()
    .from(touchpoints)
    .where(and(eq(touchpoints.id, id), eq(touchpoints.userId, userId)));
  if (!existing) return apiError("NOT_FOUND", "Touchpoint not found");
  if (existing.lockedAt && existing.lockedAt <= new Date()) {
    return apiError("TOUCHPOINT_LOCKED", "Touchpoint is locked");
  }

  await adminDb
    .update(touchpoints)
    .set({ deletedAt: new Date() })
    .where(eq(touchpoints.id, id));

  await recomputePulseForContact(existing.contactId);
  await writeAuditLog({
    userId,
    actor: "user",
    action: "delete",
    entityType: "touchpoint",
    entityId: id,
  });
  return apiOk({ ok: true });
}
