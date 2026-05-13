/**
 * GET / PATCH / DELETE a single contact (spec section 9.3).
 * DELETE soft-deletes; restore endpoint at /api/v1/contacts/{id}/restore.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { contacts } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";
import { recomputePulseForContact } from "@/lib/pulse/persist";
import { encodeSensitive } from "@/lib/demographics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().nullable().optional(),
  preferred_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  relationship_type: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  role_title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  how_we_met: z.string().nullable().optional(),
  birthday: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  expected_cadence_days: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).optional(),
  alignment: z.enum(["personal", "professional", "both"]).nullable().optional(),
  race_or_ethnicity: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  age_cohort: z
    .enum(["under_20", "20s", "30s", "40s", "50s", "60s", "70_plus"])
    .nullable()
    .optional(),
  education: z.string().nullable().optional(),
  languages: z.array(z.string()).optional(),
  professional_affiliations: z.array(z.string()).optional(),
});

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [contact] = await adminDb
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1);

  if (!contact) return apiError("NOT_FOUND", "Contact not found");
  return apiOk(toSnake(contact));
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const body = (await request.json()) as unknown;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }

  const data = parsed.data;
  const updateValues: Record<string, unknown> = {};
  if (data.first_name !== undefined) updateValues.firstName = data.first_name;
  if (data.last_name !== undefined) updateValues.lastName = data.last_name;
  if (data.preferred_name !== undefined) updateValues.preferredName = data.preferred_name;
  if (data.email !== undefined) updateValues.email = data.email;
  if (data.phone !== undefined) updateValues.phone = data.phone;
  if (data.city !== undefined) updateValues.city = data.city;
  if (data.region !== undefined) updateValues.region = data.region;
  if (data.country !== undefined) updateValues.country = data.country;
  if (data.relationship_type !== undefined) updateValues.relationshipType = data.relationship_type;
  if (data.industry !== undefined) updateValues.industry = data.industry;
  if (data.role_title !== undefined) updateValues.roleTitle = data.role_title;
  if (data.company !== undefined) updateValues.company = data.company;
  if (data.how_we_met !== undefined) updateValues.howWeMet = data.how_we_met;
  if (data.birthday !== undefined) updateValues.birthday = data.birthday;
  if (data.notes !== undefined) updateValues.notes = data.notes;
  if (data.expected_cadence_days !== undefined) updateValues.expectedCadenceDays = data.expected_cadence_days;
  if (data.tags !== undefined) updateValues.tags = data.tags;
  if (data.alignment !== undefined) updateValues.alignment = data.alignment;
  if (data.race_or_ethnicity !== undefined) updateValues.raceOrEthnicity = encodeSensitive(data.race_or_ethnicity);
  if (data.gender !== undefined) updateValues.gender = encodeSensitive(data.gender);
  if (data.age_cohort !== undefined) updateValues.ageCohort = data.age_cohort;
  if (data.education !== undefined) updateValues.education = data.education;
  if (data.languages !== undefined) updateValues.languages = data.languages;
  if (data.professional_affiliations !== undefined) updateValues.professionalAffiliations = data.professional_affiliations;

  const [before] = await adminDb
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .limit(1);
  if (!before) return apiError("NOT_FOUND", "Contact not found");

  const [updated] = await adminDb
    .update(contacts)
    .set(updateValues)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning();

  await writeAuditLog({
    userId,
    actor: "user",
    action: "update",
    entityType: "contact",
    entityId: id,
    before: pickAuditFields(before),
    after: pickAuditFields(updated),
  });

  if (data.expected_cadence_days !== undefined) {
    await recomputePulseForContact(id);
  }

  return apiOk(toSnake(updated));
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [updated] = await adminDb
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning();

  if (!updated) return apiError("NOT_FOUND", "Contact not found");

  await writeAuditLog({
    userId,
    actor: "user",
    action: "delete",
    entityType: "contact",
    entityId: id,
  });

  return apiOk({ ok: true });
}

function pickAuditFields(c: typeof contacts.$inferSelect) {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    tier: c.tier,
    company: c.company,
    pulseBand: c.pulseBand,
  };
}
