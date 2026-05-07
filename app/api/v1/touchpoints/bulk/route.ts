/**
 * POST /api/v1/touchpoints/bulk: log one touchpoint per contact with a shared
 * group_event_id (spec section 3.3 / 7.4).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { touchpoints } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { recomputePulseForContact } from "@/lib/pulse/persist";
import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(100),
  occurred_at: z.string().datetime().optional(),
  channel: z.enum([
    "text",
    "phone",
    "video",
    "in_person",
    "email",
    "social",
    "voice_note",
    "group_event",
  ]),
  duration_bucket: z.enum(["quick", "normal", "deep"]).default("normal"),
  note: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }
  const data = parsed.data;
  const occurredAt = data.occurred_at ? new Date(data.occurred_at) : new Date();
  const groupEventId = randomUUID();

  const inserted = await adminDb
    .insert(touchpoints)
    .values(
      data.contact_ids.map((contactId) => ({
        userId,
        contactId,
        occurredAt,
        channel: data.channel,
        durationBucket: data.duration_bucket,
        note: data.note ?? null,
        groupEventId,
      })),
    )
    .returning();

  for (const tp of inserted) {
    await recomputePulseForContact(tp.contactId);
  }

  await writeAuditLog({
    userId,
    actor: "user",
    action: "bulk_log",
    entityType: "touchpoint",
    after: { groupEventId, count: inserted.length },
  });

  return apiOk({ data: toSnake(inserted), group_event_id: groupEventId }, { status: 201 });
}
