/**
 * Provision an application User row + Level-0 self contact + default clusters
 * + topic tag seeds when a Supabase auth user lands for the first time.
 *
 * Spec section 7.1 (onboarding). Uses adminDb because we are creating the
 * very rows that RLS would otherwise scope away.
 */
import { adminDb } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import {
  users,
  contacts,
  clusters,
  topicTags,
} from "@/lib/db/schema";

export const SEED_CLUSTERS = [
  { name: "Workplace", color: "#2563EB", icon: "briefcase", defaultCadenceDays: 14, sortOrder: 0 },
  { name: "Social Network", color: "#7C3AED", icon: "users", defaultCadenceDays: 30, sortOrder: 1 },
  { name: "Family", color: "#DC2626", icon: "home", defaultCadenceDays: 14, sortOrder: 2 },
  { name: "Faith", color: "#059669", icon: "church", defaultCadenceDays: 30, sortOrder: 3 },
  { name: "Civic", color: "#D97706", icon: "landmark", defaultCadenceDays: 60, sortOrder: 4 },
  { name: "Education", color: "#0891B2", icon: "graduation-cap", defaultCadenceDays: 90, sortOrder: 5 },
] as const;

export const SEED_TOPIC_TAGS = [
  "career advice",
  "project work",
  "personal catch up",
  "introduction request",
  "business development",
  "learning",
  "family",
  "mentorship",
  "social",
  "conflict resolution",
  "celebration",
  "condolence",
  "planning",
  "brainstorm",
  "decision support",
] as const;

/**
 * Idempotent provisioner. Safe to call on every signin.
 * Returns the application user row.
 */
export async function ensureUserProvisioned(params: {
  authUserId: string;
  email: string;
  displayName: string;
  timezone?: string;
  locale?: string;
}) {
  const existing = await adminDb
    .select()
    .from(users)
    .where(eq(users.id, params.authUserId))
    .limit(1);

  if (existing[0]) return existing[0];

  return await adminDb.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        id: params.authUserId,
        email: params.email,
        displayName: params.displayName,
        timezone: params.timezone ?? "UTC",
        locale: params.locale ?? "en-US",
        verifiedAt: new Date(),
      })
      .returning();

    const [selfContact] = await tx
      .insert(contacts)
      .values({
        userId: user.id,
        tier: 0,
        firstName: params.displayName.split(" ")[0] ?? params.displayName,
        lastName: params.displayName.split(" ").slice(1).join(" ") || null,
        relationshipType: "self",
        tieStrength: 100,
        pulseBand: "Healthy",
      })
      .returning();

    await tx
      .update(users)
      .set({ selfContactId: selfContact.id })
      .where(eq(users.id, user.id));

    await tx.insert(clusters).values(
      SEED_CLUSTERS.map((c) => ({
        userId: user.id,
        name: c.name,
        color: c.color,
        icon: c.icon,
        defaultCadenceDays: c.defaultCadenceDays,
        sortOrder: c.sortOrder,
        isSystem: true,
      })),
    );

    await tx.insert(topicTags).values(
      SEED_TOPIC_TAGS.map((name) => ({
        userId: user.id,
        name,
      })),
    );

    return { ...user, selfContactId: selfContact.id };
  });
}

/**
 * Mark onboarding complete by storing it on the user row's notification_prefs.
 * Keeps schema simple; no separate flag column needed.
 */
export async function markOnboardingComplete(userId: string) {
  await adminDb.execute(sql`
    UPDATE users
    SET notification_prefs = notification_prefs || '{"onboarded": true}'::jsonb
    WHERE id = ${userId}
  `);
}

export async function isOnboarded(userId: string): Promise<boolean> {
  const result = await adminDb.execute<{ onboarded: boolean | null }>(sql`
    SELECT (notification_prefs->>'onboarded')::boolean as onboarded
    FROM users
    WHERE id = ${userId}
  `);
  return result.rows[0]?.onboarded === true;
}
