import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, and, desc, sql, gt } from "drizzle-orm";
import { contacts, contactClusters, clusters } from "@/lib/db/schema";
import { NetworkViews } from "./network-views";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const userId = await requireAuthUserId();

  const rows = await adminDb
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      preferredName: contacts.preferredName,
      city: contacts.city,
      country: contacts.country,
      latitude: contacts.latitude,
      longitude: contacts.longitude,
      tier: contacts.tier,
      pulseBand: contacts.pulseBand,
      tieStrength: contacts.tieStrength,
      lastTouchpointAt: contacts.lastTouchpointAt,
      roleTitle: contacts.roleTitle,
      company: contacts.company,
      tags: contacts.tags,
      knownThroughContactId: contacts.knownThroughContactId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        gt(contacts.tier, 0),
        sql`${contacts.archivedAt} is null`,
        sql`${contacts.deletedAt} is null`,
      ),
    )
    .orderBy(desc(contacts.tieStrength));

  const memberships = await adminDb
    .select({
      contactId: contactClusters.contactId,
      clusterId: clusters.id,
      clusterName: clusters.name,
      clusterColor: clusters.color,
    })
    .from(contactClusters)
    .innerJoin(clusters, eq(clusters.id, contactClusters.clusterId))
    .where(eq(contactClusters.userId, userId));

  const allClusters = await adminDb
    .select()
    .from(clusters)
    .where(and(eq(clusters.userId, userId), sql`${clusters.archivedAt} is null`));

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <NetworkViews
        contacts={rows.map((r) => ({
          ...r,
          lastTouchpointAt: r.lastTouchpointAt ? r.lastTouchpointAt.toISOString() : null,
        }))}
        memberships={memberships}
        clusters={allClusters}
      />
    </div>
  );
}
