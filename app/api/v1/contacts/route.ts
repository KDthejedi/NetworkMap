/**
 * GET /api/v1/contacts: list with filters per spec section 9.3.
 * POST /api/v1/contacts: create.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and, gt, sql, lt, desc } from "drizzle-orm";
import { contacts, contactClusters, clusters } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";
import { geocode } from "@/lib/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  first_name: z.string().min(1).max(120),
  last_name: z.string().max(120).nullable().optional(),
  preferred_name: z.string().max(120).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  country: z.string().max(2).nullable().optional(),
  relationship_type: z.string().max(60).nullable().optional(),
  industry: z.string().max(80).nullable().optional(),
  role_title: z.string().max(120).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  how_we_met: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  social_handles: z.record(z.string(), z.string()).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  expected_cadence_days: z.number().int().positive().nullable().optional(),
  tier: z.number().int().min(0).max(10).default(1),
  known_through_contact_id: z.string().uuid().nullable().optional(),
  cluster_ids: z.array(z.string().uuid()).default([]),
});

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50));
  const tier = url.searchParams.get("tier");
  const band = url.searchParams.get("pulse_band");
  const search = url.searchParams.get("search")?.toLowerCase();

  const conditions = [eq(contacts.userId, userId), sql`${contacts.deletedAt} is null`];
  if (tier) conditions.push(eq(contacts.tier, Number(tier)));
  if (band) {
    conditions.push(
      sql`${contacts.pulseBand} = ${band}::pulse_band`,
    );
  }
  if (search) {
    conditions.push(
      sql`(lower(${contacts.firstName}) like ${`%${search}%`} or lower(coalesce(${contacts.lastName}, '')) like ${`%${search}%`} or lower(coalesce(${contacts.company}, '')) like ${`%${search}%`})`,
    );
  }
  if (cursor) {
    conditions.push(lt(contacts.createdAt, new Date(cursor)));
  }

  const rows = await adminDb
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(desc(contacts.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? slice[slice.length - 1].createdAt.toISOString() : null;

  return apiOk({
    data: toSnake(slice),
    next_cursor: nextCursor,
  });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_FAILED", "Invalid JSON");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid", {
      issues: parsed.error.issues,
    });
  }

  const data = parsed.data;
  if (data.tier >= 2 && !data.known_through_contact_id) {
    return apiError(
      "FORBIDDEN_TIER_TRANSITION",
      "Tier 2+ requires known_through_contact_id",
    );
  }

  let lat: number | null = null;
  let lng: number | null = null;
  if (data.city || data.country) {
    const g = await geocode({
      city: data.city,
      region: data.region,
      country: data.country,
    });
    if (g) {
      lat = g.latitude;
      lng = g.longitude;
    }
  }

  const [contact] = await adminDb
    .insert(contacts)
    .values({
      userId,
      tier: data.tier,
      knownThroughContactId: data.known_through_contact_id ?? null,
      firstName: data.first_name,
      lastName: data.last_name ?? null,
      preferredName: data.preferred_name ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      country: data.country ?? null,
      latitude: lat,
      longitude: lng,
      relationshipType: data.relationship_type ?? null,
      industry: data.industry ?? null,
      roleTitle: data.role_title ?? null,
      company: data.company ?? null,
      howWeMet: data.how_we_met ?? null,
      birthday: data.birthday ?? null,
      socialHandles: data.social_handles ?? {},
      tags: data.tags ?? [],
      notes: data.notes ?? null,
      expectedCadenceDays: data.expected_cadence_days ?? null,
    })
    .returning();

  if (data.cluster_ids.length > 0) {
    await adminDb.insert(contactClusters).values(
      data.cluster_ids.map((cid) => ({
        contactId: contact.id,
        clusterId: cid,
        userId,
      })),
    );
  }

  await writeAuditLog({
    userId,
    actor: "user",
    action: "create",
    entityType: "contact",
    entityId: contact.id,
    after: { firstName: contact.firstName, tier: contact.tier },
  });

  return apiOk(toSnake(contact), { status: 201 });
}
