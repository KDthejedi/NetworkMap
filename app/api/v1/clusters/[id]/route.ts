import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { clusters } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().optional(),
  default_cadence_days: z.number().int().min(1).optional(),
  sort_order: z.number().int().optional(),
});

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return apiError("VALIDATION_FAILED", "Invalid");
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.color !== undefined) update.color = data.color;
  if (data.icon !== undefined) update.icon = data.icon;
  if (data.default_cadence_days !== undefined) update.defaultCadenceDays = data.default_cadence_days;
  if (data.sort_order !== undefined) update.sortOrder = data.sort_order;
  const [updated] = await adminDb
    .update(clusters)
    .set(update)
    .where(and(eq(clusters.id, id), eq(clusters.userId, userId)))
    .returning();
  if (!updated) return apiError("NOT_FOUND", "Cluster not found");
  return apiOk(toSnake(updated));
}

/**
 * System clusters can only be archived; custom clusters are hard-deleted.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const [existing] = await adminDb
    .select()
    .from(clusters)
    .where(and(eq(clusters.id, id), eq(clusters.userId, userId)));
  if (!existing) return apiError("NOT_FOUND", "Cluster not found");

  if (existing.isSystem) {
    await adminDb
      .update(clusters)
      .set({ archivedAt: new Date() })
      .where(eq(clusters.id, id));
  } else {
    await adminDb.delete(clusters).where(eq(clusters.id, id));
  }
  return apiOk({ ok: true });
}
