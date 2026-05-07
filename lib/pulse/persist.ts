/**
 * Recompute and persist Pulse for a contact. Called synchronously after every
 * touchpoint write (spec section 5.4) and by the nightly cron for boundary
 * crossings.
 */
import { adminDb } from "@/lib/db/client";
import { eq, and, sql } from "drizzle-orm";
import {
  contacts,
  touchpoints,
  contactClusters,
  clusters,
  contactGoals,
  goals,
} from "@/lib/db/schema";
import {
  computeContactPulse,
  type PulseTouchpoint,
} from "./index";

export async function recomputePulseForContact(contactId: string) {
  const [contact] = await adminDb
    .select({
      id: contacts.id,
      userId: contacts.userId,
      expectedCadenceDays: contacts.expectedCadenceDays,
      tier: contacts.tier,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) return null;
  if (contact.tier === 0) return null; // self contact stays Healthy

  const tps = await adminDb
    .select({
      id: touchpoints.id,
      occurredAt: touchpoints.occurredAt,
      channel: touchpoints.channel,
      direction: touchpoints.direction,
      durationBucket: touchpoints.durationBucket,
      qualityRating: touchpoints.qualityRating,
    })
    .from(touchpoints)
    .where(
      and(
        eq(touchpoints.contactId, contactId),
        sql`${touchpoints.deletedAt} is null`,
      ),
    );

  const cadences = await adminDb
    .select({ days: clusters.defaultCadenceDays })
    .from(contactClusters)
    .innerJoin(clusters, eq(clusters.id, contactClusters.clusterId))
    .where(eq(contactClusters.contactId, contactId));

  const goalBoost = await adminDb
    .select({ id: goals.id })
    .from(contactGoals)
    .innerJoin(goals, eq(goals.id, contactGoals.goalId))
    .where(
      and(
        eq(contactGoals.contactId, contactId),
        eq(goals.priority, "high"),
        eq(goals.status, "active"),
      ),
    )
    .limit(1);

  const result = computeContactPulse({
    touchpoints: tps as PulseTouchpoint[],
    contactExpectedCadenceDays: contact.expectedCadenceDays,
    clusterCadences: cadences.map((c) => c.days),
    hasActiveHighPriorityGoal: goalBoost.length > 0,
  });

  await adminDb
    .update(contacts)
    .set({
      tieStrength: result.tieStrength,
      pulseBand: result.pulseBand,
      lastTouchpointAt: result.lastTouchpointAt,
      tieStrengthBreakdown: result.breakdown,
    })
    .where(eq(contacts.id, contactId));

  return result;
}
