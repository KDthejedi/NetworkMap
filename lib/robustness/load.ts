/**
 * Load all the data the robustness engine needs for a given user and run the
 * computation. Cheap enough to call on every Home / Robustness page render
 * for v1; consider caching in a robustness_runs table later.
 */
import { adminDb } from "@/lib/db/client";
import {
  contacts,
  contactClusters,
  clusters,
  contactGoals,
  goals,
} from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  computeRobustness,
  type ContactSnapshot,
  type ClusterSnapshot,
  type GoalSnapshot,
  type RobustnessResult,
} from "./index";
import { decodeSensitive } from "@/lib/demographics";

export async function loadAndComputeRobustness(
  userId: string,
): Promise<RobustnessResult> {
  const contactRows = await adminDb
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        sql`${contacts.deletedAt} is null`,
        sql`${contacts.tier} > 0`,
      ),
    );

  const memberships = await adminDb
    .select({ contactId: contactClusters.contactId, clusterId: contactClusters.clusterId })
    .from(contactClusters)
    .where(eq(contactClusters.userId, userId));

  const clustersRows = await adminDb
    .select({ id: clusters.id, name: clusters.name })
    .from(clusters)
    .where(
      and(eq(clusters.userId, userId), sql`${clusters.archivedAt} is null`),
    );

  const activeGoals = await adminDb
    .select({
      id: goals.id,
      title: goals.title,
      priority: goals.priority,
    })
    .from(goals)
    .where(
      and(
        eq(goals.userId, userId),
        eq(goals.status, "active"),
        sql`${goals.deletedAt} is null`,
      ),
    );

  const goalIdsWithLinks = await adminDb
    .select({ goalId: contactGoals.goalId })
    .from(contactGoals)
    .where(eq(contactGoals.userId, userId));
  const linkedGoalIds = new Set(goalIdsWithLinks.map((g) => g.goalId));

  const clustersByContact = new Map<string, string[]>();
  for (const m of memberships) {
    if (!clustersByContact.has(m.contactId)) clustersByContact.set(m.contactId, []);
    clustersByContact.get(m.contactId)!.push(m.clusterId);
  }

  const snapshot: ContactSnapshot[] = contactRows.map((c) => ({
    id: c.id,
    tier: c.tier,
    pulseBand: c.pulseBand,
    alignment: c.alignment ?? null,
    city: c.city ?? null,
    country: c.country ?? null,
    industry: c.industry ?? null,
    company: c.company ?? null,
    roleTitle: c.roleTitle ?? null,
    raceOrEthnicity: decodeSensitive(c.raceOrEthnicity),
    gender: decodeSensitive(c.gender),
    ageCohort: c.ageCohort ?? null,
    languages: c.languages,
    clusterIds: clustersByContact.get(c.id) ?? [],
  }));

  const clusterSnapshots: ClusterSnapshot[] = clustersRows;
  const goalSnapshots: GoalSnapshot[] = activeGoals.map((g) => ({
    id: g.id,
    title: g.title,
    priority: g.priority,
    hasAlignedContacts: linkedGoalIds.has(g.id),
  }));

  return computeRobustness({
    contacts: snapshot,
    clusters: clusterSnapshots,
    goals: goalSnapshots,
  });
}
