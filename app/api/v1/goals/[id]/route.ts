import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { goals } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";
import { runGoalRefresh } from "@/lib/agent/workflows/goalRefresh";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().optional(),
  horizon: z.enum(["d30", "d60", "d90", "m6", "y1", "y_multi"]).optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  status: z.enum(["active", "paused", "achieved", "abandoned"]).optional(),
  why_this_matters: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const [goal] = await adminDb
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!goal) return apiError("NOT_FOUND", "Goal not found");
  return apiOk(toSnake(goal));
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.category !== undefined) update.category = data.category;
  if (data.horizon !== undefined) update.horizon = data.horizon;
  if (data.priority !== undefined) update.priority = data.priority;
  if (data.status !== undefined) update.status = data.status;
  if (data.why_this_matters !== undefined) update.whyThisMatters = data.why_this_matters;
  if (data.target_date !== undefined) update.targetDate = data.target_date;

  const [before] = await adminDb
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  if (!before) return apiError("NOT_FOUND", "Goal not found");

  const [updated] = await adminDb
    .update(goals)
    .set(update)
    .where(and(eq(goals.id, id), eq(goals.userId, userId)))
    .returning();

  await writeAuditLog({
    userId,
    actor: "user",
    action: "update",
    entityType: "goal",
    entityId: id,
    before: { priority: before.priority, status: before.status, whyThisMatters: before.whyThisMatters },
    after: { priority: updated.priority, status: updated.status, whyThisMatters: updated.whyThisMatters },
  });

  // Material edits trigger a refresh (spec section 7.7).
  if (data.priority !== undefined || data.why_this_matters !== undefined) {
    void runGoalRefresh({ userId, goalId: id }).catch(() => null);
  }

  return apiOk(toSnake(updated));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  await adminDb
    .update(goals)
    .set({ deletedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.userId, userId)));
  await writeAuditLog({
    userId,
    actor: "user",
    action: "delete",
    entityType: "goal",
    entityId: id,
  });
  return apiOk({ ok: true });
}
