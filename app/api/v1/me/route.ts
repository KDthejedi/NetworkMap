/**
 * /api/v1/me  spec section 9.2.
 * GET returns the authenticated user.
 * PATCH updates display name, timezone, locale, notification prefs.
 * DELETE soft-deletes (30 day grace, then a cron will hard purge).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  display_name: z.string().min(1).max(120).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  notification_prefs: z
    .object({
      push: z.boolean().optional(),
      in_app: z.boolean().optional(),
      email: z.boolean().optional(),
      digest_enabled: z.boolean().optional(),
      quiet_hours: z
        .object({ start: z.string(), end: z.string() })
        .nullable()
        .optional(),
    })
    .optional(),
});

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const [u] = await adminDb.select().from(users).where(eq(users.id, userId));
  if (!u) return apiError("NOT_FOUND", "User not found");
  return apiOk(toSnake(u));
}

export async function PATCH(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }
  const data = parsed.data;
  const update: Record<string, unknown> = {};
  if (data.display_name !== undefined) update.displayName = data.display_name;
  if (data.timezone !== undefined) update.timezone = data.timezone;
  if (data.locale !== undefined) update.locale = data.locale;
  if (data.notification_prefs !== undefined) {
    const [u] = await adminDb.select({ prefs: users.notificationPrefs }).from(users).where(eq(users.id, userId));
    update.notificationPrefs = { ...u.prefs, ...data.notification_prefs };
  }
  const [updated] = await adminDb
    .update(users)
    .set(update)
    .where(eq(users.id, userId))
    .returning();
  await writeAuditLog({
    userId,
    actor: "user",
    action: "update",
    entityType: "user",
    entityId: userId,
  });
  return apiOk(toSnake(updated));
}

export async function DELETE() {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  await adminDb
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, userId));
  await writeAuditLog({
    userId,
    actor: "user",
    action: "delete",
    entityType: "user",
    entityId: userId,
  });
  return apiOk({
    ok: true,
    purge_after: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
}
