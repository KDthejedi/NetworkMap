"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { adminDb } from "@/lib/db/client";
import { goals, users, contacts } from "@/lib/db/schema";
import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { markOnboardingComplete } from "@/lib/auth/provision";
import { writeAuditLog } from "@/lib/audit";

const completeSchema = z.object({
  displayName: z.string().min(1).max(120),
  city: z.string().nullable(),
  country: z.string().nullable(),
  timezone: z.string().min(1),
  goal: z.object({
    title: z.string().min(1).max(200),
    category: z.string().min(1),
    horizon: z.enum(["d30", "d60", "d90", "m6", "y1", "y_multi"]),
    priority: z.enum(["high", "medium", "low"]),
    whyThisMatters: z.string().nullable(),
  }),
});

export async function completeOnboarding(
  input: z.infer<typeof completeSchema>,
): Promise<{ ok: true; goalId: string } | { ok: false; error: string }> {
  let userId: string;
  try {
    userId = await requireAuthUserId();
  } catch {
    return { ok: false, error: "Not signed in" };
  }

  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  await adminDb
    .update(users)
    .set({ displayName: data.displayName, timezone: data.timezone })
    .where(eq(users.id, userId));

  // Update Level-0 contact with location, geocoded later by background job.
  const [self] = await adminDb
    .select({ id: users.selfContactId })
    .from(users)
    .where(eq(users.id, userId));

  if (self.id) {
    await adminDb
      .update(contacts)
      .set({
        firstName: data.displayName.split(" ")[0] ?? data.displayName,
        lastName: data.displayName.split(" ").slice(1).join(" ") || null,
        city: data.city,
        country: data.country,
      })
      .where(eq(contacts.id, self.id));
  }

  const [goal] = await adminDb
    .insert(goals)
    .values({
      userId,
      title: data.goal.title,
      category: data.goal.category,
      horizon: data.goal.horizon,
      priority: data.goal.priority,
      status: "active",
      whyThisMatters: data.goal.whyThisMatters,
    })
    .returning();

  await writeAuditLog({
    userId,
    actor: "user",
    action: "create",
    entityType: "goal",
    entityId: goal.id,
    after: { title: goal.title, priority: goal.priority },
  });

  await markOnboardingComplete(userId);

  // Fire-and-forget the goal refresh agent run. Will log itself but never block onboarding.
  // (Implemented in lib/agent/workflows/goalRefresh.ts.)
  void enqueueGoalRefresh(userId, goal.id);

  return { ok: true, goalId: goal.id };
}

async function enqueueGoalRefresh(userId: string, goalId: string) {
  try {
    const { runGoalRefresh } = await import("@/lib/agent/workflows/goalRefresh");
    await runGoalRefresh({ userId, goalId });
  } catch (err) {
    console.warn("[onboarding] goal refresh skipped:", err);
  }
}
