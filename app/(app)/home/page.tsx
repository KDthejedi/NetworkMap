import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  contacts,
  recommendations,
  touchpoints,
  users,
} from "@/lib/db/schema";
import { TodaysPulse } from "@/components/todays-pulse";
import { PulseHealthSummary } from "@/components/pulse-health-summary";
import { RecentTouchpoints } from "@/components/recent-touchpoints";
import { QuickActions } from "@/components/quick-actions";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await requireAuthUserId();
  const [user] = await adminDb
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const todaysRecs = await adminDb
    .select()
    .from(recommendations)
    .where(
      and(
        eq(recommendations.userId, userId),
        eq(recommendations.status, "pending"),
      ),
    )
    .orderBy(desc(recommendations.priorityScore))
    .limit(5);

  const bandSummary = await adminDb
    .select({
      band: contacts.pulseBand,
      count: sql<number>`count(*)::int`,
    })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), sql`${contacts.tier} > 0`))
    .groupBy(contacts.pulseBand);

  const recentTps = await adminDb
    .select({
      id: touchpoints.id,
      occurredAt: touchpoints.occurredAt,
      channel: touchpoints.channel,
      note: touchpoints.note,
      contactId: touchpoints.contactId,
      contactFirstName: contacts.firstName,
      contactLastName: contacts.lastName,
    })
    .from(touchpoints)
    .innerJoin(contacts, eq(contacts.id, touchpoints.contactId))
    .where(eq(touchpoints.userId, userId))
    .orderBy(desc(touchpoints.occurredAt))
    .limit(10);

  const greeting = greetingFor(new Date());

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <header>
        <p className="text-sm text-muted-foreground">{greeting}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user?.displayName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </header>

      <TodaysPulse recommendations={todaysRecs} />
      <PulseHealthSummary summary={bandSummary} />
      <RecentTouchpoints touchpoints={recentTps} />
      <QuickActions />
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}
