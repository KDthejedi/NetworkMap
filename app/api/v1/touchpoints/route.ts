/**
 * Touchpoints (spec section 9.4).
 * POST creates and synchronously recomputes Pulse for the affected contact.
 * GET lists with filters.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and, sql, desc, lt } from "drizzle-orm";
import { touchpoints, topicTags, touchpointTopicTags } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";
import { recomputePulseForContact } from "@/lib/pulse/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  contact_id: z.string().uuid(),
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
  direction: z.enum(["outbound", "inbound", "mutual"]).default("outbound"),
  duration_bucket: z.enum(["quick", "normal", "deep"]).default("normal"),
  quality_rating: z.number().int().min(1).max(5).nullable().optional(),
  note: z.string().nullable().optional(),
  topic_tags: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const url = new URL(request.url);
  const contactId = url.searchParams.get("contact_id");
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));

  const conditions = [eq(touchpoints.userId, userId), sql`${touchpoints.deletedAt} is null`];
  if (contactId) conditions.push(eq(touchpoints.contactId, contactId));
  if (cursor) conditions.push(lt(touchpoints.occurredAt, new Date(cursor)));

  const rows = await adminDb
    .select()
    .from(touchpoints)
    .where(and(...conditions))
    .orderBy(desc(touchpoints.occurredAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return apiOk({
    data: toSnake(slice),
    next_cursor: hasMore ? slice[slice.length - 1].occurredAt.toISOString() : null,
  });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid", {
      issues: parsed.error.issues,
    });
  }
  const data = parsed.data;
  const occurredAt = data.occurred_at ? new Date(data.occurred_at) : new Date();

  // Reject backdating beyond 90 days (spec section 3.3).
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000);
  if (occurredAt < ninetyDaysAgo) {
    return apiError("VALIDATION_FAILED", "Cannot backdate more than 90 days");
  }
  if (occurredAt > new Date(Date.now() + 86400_000)) {
    return apiError("VALIDATION_FAILED", "Cannot log a future touchpoint");
  }

  const [tp] = await adminDb
    .insert(touchpoints)
    .values({
      userId,
      contactId: data.contact_id,
      occurredAt,
      channel: data.channel,
      direction: data.direction,
      durationBucket: data.duration_bucket,
      qualityRating: data.quality_rating ?? null,
      note: data.note ?? null,
    })
    .returning();

  if (data.topic_tags.length > 0) {
    await ensureTagsAndAttach(userId, tp.id, data.topic_tags);
  }

  await recomputePulseForContact(data.contact_id);

  await writeAuditLog({
    userId,
    actor: "user",
    action: "create",
    entityType: "touchpoint",
    entityId: tp.id,
    after: { contactId: tp.contactId, channel: tp.channel },
  });

  return apiOk(toSnake(tp), { status: 201 });
}

async function ensureTagsAndAttach(
  userId: string,
  touchpointId: string,
  names: string[],
) {
  const tagIds: string[] = [];
  for (const raw of names) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    const existing = await adminDb
      .select({ id: topicTags.id })
      .from(topicTags)
      .where(and(eq(topicTags.userId, userId), eq(topicTags.name, name)))
      .limit(1);
    let tagId = existing[0]?.id;
    if (!tagId) {
      const [created] = await adminDb
        .insert(topicTags)
        .values({ userId, name })
        .returning({ id: topicTags.id });
      tagId = created.id;
    }
    tagIds.push(tagId);
    await adminDb
      .update(topicTags)
      .set({ usageCount: sql`${topicTags.usageCount} + 1` })
      .where(eq(topicTags.id, tagId));
  }
  if (tagIds.length > 0) {
    await adminDb
      .insert(touchpointTopicTags)
      .values(tagIds.map((topicTagId) => ({ touchpointId, topicTagId })))
      .onConflictDoNothing();
  }
}
