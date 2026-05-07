import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  contacts,
  touchpoints,
  contactClusters,
  clusters,
  contactGoals,
  goals,
} from "@/lib/db/schema";
import { LogTouchpointForm } from "@/components/log-touchpoint-form";
import { PulseBadge } from "@/components/pulse-badge";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export default async function ContactDetailPage({ params }: Ctx) {
  const { id } = await params;
  const userId = await requireAuthUserId();

  const [contact] = await adminDb
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, id),
        eq(contacts.userId, userId),
        sql`${contacts.deletedAt} is null`,
      ),
    );
  if (!contact) notFound();

  const memberships = await adminDb
    .select({
      clusterId: clusters.id,
      name: clusters.name,
      color: clusters.color,
    })
    .from(contactClusters)
    .innerJoin(clusters, eq(clusters.id, contactClusters.clusterId))
    .where(eq(contactClusters.contactId, id));

  const tps = await adminDb
    .select()
    .from(touchpoints)
    .where(
      and(
        eq(touchpoints.contactId, id),
        sql`${touchpoints.deletedAt} is null`,
      ),
    )
    .orderBy(desc(touchpoints.occurredAt))
    .limit(50);

  const goalLinks = await adminDb
    .select({ id: goals.id, title: goals.title, priority: goals.priority })
    .from(contactGoals)
    .innerJoin(goals, eq(goals.id, contactGoals.goalId))
    .where(eq(contactGoals.contactId, id));

  let knownThrough: { id: string; firstName: string; lastName: string | null } | null =
    null;
  if (contact.knownThroughContactId) {
    const [bridge] = await adminDb
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(contacts)
      .where(eq(contacts.id, contact.knownThroughContactId));
    knownThrough = bridge ?? null;
  }

  const breakdown = contact.tieStrengthBreakdown;
  const cadenceDays = breakdown?.cadenceDays ?? null;
  const daysSince = contact.lastTouchpointAt
    ? Math.floor(
        (Date.now() - new Date(contact.lastTouchpointAt).getTime()) /
          86400_000,
      )
    : null;

  return (
    <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
      <header className="flex items-start gap-4">
        <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center text-lg font-semibold">
          {contact.firstName[0]}
          {contact.lastName?.[0] ?? ""}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            {contact.preferredName ?? contact.firstName}
            {contact.lastName ? ` ${contact.lastName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground">
            {contact.roleTitle && contact.company
              ? `${contact.roleTitle} at ${contact.company}`
              : contact.roleTitle ?? contact.company ?? ""}
            {contact.city ? ` · ${contact.city}` : ""}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Level {contact.tier}
            {knownThrough
              ? ` · introduced by ${knownThrough.firstName}${knownThrough.lastName ? ` ${knownThrough.lastName}` : ""}`
              : ""}
          </p>
        </div>
      </header>

      <section className="rounded-md border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <PulseBadge band={contact.pulseBand} />
            <p className="mt-1 text-xs text-muted-foreground">
              Tie strength {contact.tieStrength}
              {cadenceDays ? ` · ${cadenceDays}d cadence` : ""}
              {daysSince !== null ? ` · ${daysSince}d since last` : " · no touchpoints yet"}
            </p>
          </div>
        </div>
        {breakdown?.topContributions && breakdown.topContributions.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Why this score
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {breakdown.topContributions.map((c) => (
                <li key={c.touchpointId}>
                  {c.channel} · {new Date(c.occurredAt).toLocaleDateString()} ·
                  contribution {c.contribution}
                </li>
              ))}
              {breakdown.goalBoostApplied && (
                <li>+ 10% goal boost (high priority alignment)</li>
              )}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-md border bg-card p-4">
        <h2 className="text-sm font-medium">Log a touchpoint</h2>
        <LogTouchpointForm contactId={contact.id} />
      </section>

      {memberships.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Clusters</h2>
          <div className="flex flex-wrap gap-2">
            {memberships.map((m) => (
              <span
                key={m.clusterId}
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ backgroundColor: `${m.color}22`, color: m.color }}
              >
                {m.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {goalLinks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Linked goals</h2>
          <ul className="space-y-1 text-sm">
            {goalLinks.map((g) => (
              <li key={g.id}>
                <Link href={`/goals/${g.id}`} className="underline">
                  {g.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {g.priority} priority
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {contact.notes && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {contact.notes}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium">Touchpoint history</h2>
        {tps.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {tps.map((tp) => (
              <li key={tp.id} className="rounded-md border bg-card p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">
                    {tp.channel.replace(/_/g, " ")}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {new Date(tp.occurredAt).toLocaleString()}
                  </time>
                </div>
                {tp.note && (
                  <p className="mt-1 text-xs text-muted-foreground">{tp.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
