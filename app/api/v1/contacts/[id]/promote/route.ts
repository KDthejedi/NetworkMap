/**
 * POST /api/v1/contacts/{id}/promote
 * Body: { to_tier: number }
 * Spec section 9.3 + 7.8.
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

export const runtime = "nodejs";

const schema = z.object({ to_tier: z.number().int().min(1).max(10) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }

  const [before] = await adminDb
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)));
  if (!before) return apiError("NOT_FOUND", "Contact not found");

  // Promotion to tier 1 nulls known_through (handled by trigger too).
  const newKnownThrough = parsed.data.to_tier === 1 ? null : before.knownThroughContactId;

  const [updated] = await adminDb
    .update(contacts)
    .set({ tier: parsed.data.to_tier, knownThroughContactId: newKnownThrough })
    .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
    .returning();

  await writeAuditLog({
    userId,
    actor: "user",
    action: "tier_change",
    entityType: "contact",
    entityId: id,
    before: { tier: before.tier },
    after: { tier: updated.tier },
  });

  return apiOk(toSnake(updated));
}
