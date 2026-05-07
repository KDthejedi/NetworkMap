/**
 * POST /api/v1/contacts/{id}/restore
 * Restores a soft-deleted contact within the 30-day window (spec section 11.6).
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { eq, and, sql } from "drizzle-orm";
import { contacts } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [updated] = await adminDb
    .update(contacts)
    .set({ deletedAt: null })
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.userId, userId),
        sql`${contacts.deletedAt} > now() - interval '30 days'`,
      ),
    )
    .returning();

  if (!updated)
    return apiError("NOT_FOUND", "Contact not found or restore window expired");

  await writeAuditLog({
    userId,
    actor: "user",
    action: "restore",
    entityType: "contact",
    entityId: id,
  });

  return apiOk(toSnake(updated));
}
