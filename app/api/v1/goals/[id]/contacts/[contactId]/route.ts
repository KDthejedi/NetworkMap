import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { contactGoals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { recomputePulseForContact } from "@/lib/pulse/persist";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

const schema = z.object({ relevance_note: z.string().nullable().optional() });

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id, contactId } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  await adminDb
    .insert(contactGoals)
    .values({
      userId,
      goalId: id,
      contactId,
      relevanceNote: parsed.success ? parsed.data.relevance_note ?? null : null,
      pinnedByUser: true,
    })
    .onConflictDoUpdate({
      target: [contactGoals.contactId, contactGoals.goalId],
      set: {
        pinnedByUser: true,
        relevanceNote: parsed.success ? parsed.data.relevance_note ?? null : null,
      },
    });
  // Pulse recompute because the high-priority-goal boost may now apply.
  await recomputePulseForContact(contactId);
  return apiOk({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, contactId } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  await adminDb
    .delete(contactGoals)
    .where(
      and(
        eq(contactGoals.userId, userId),
        eq(contactGoals.goalId, id),
        eq(contactGoals.contactId, contactId),
      ),
    );
  await recomputePulseForContact(contactId);
  return apiOk({ ok: true });
}
