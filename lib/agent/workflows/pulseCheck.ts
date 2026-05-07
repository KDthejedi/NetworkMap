/**
 * Nightly Pulse Check (spec section 6.1).
 * Recomputes Pulse for any contact whose age has crossed a band boundary,
 * and queues notifications for Steady -> Fading transitions per the
 * notification preference (spec section 3.7).
 *
 * Runs without the model (deterministic). The agent is consulted only by
 * the Daily Digest at 6 AM local.
 */
import { adminDb } from "@/lib/db/client";
import { contacts, notifications, users } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { recomputePulseForContact } from "@/lib/pulse/persist";

export async function runPulseCheck() {
  // Find contacts whose stored band may be stale.
  const stale = await adminDb.execute<{
    contact_id: string;
    user_id: string;
    pulse_band: string;
    days_since: number | null;
    cadence_days: number;
  }>(sql`
    with cluster_min as (
      select cc.contact_id, min(c.default_cadence_days) as cluster_cadence
      from contact_clusters cc join clusters c on c.id = cc.cluster_id
      group by cc.contact_id
    )
    select
      ct.id as contact_id,
      ct.user_id,
      ct.pulse_band::text as pulse_band,
      extract(epoch from (now() - ct.last_touchpoint_at)) / 86400.0 as days_since,
      coalesce(ct.expected_cadence_days, cm.cluster_cadence, 30) as cadence_days
    from contacts ct
    left join cluster_min cm on cm.contact_id = ct.id
    where ct.deleted_at is null and ct.tier > 0
  `);

  let recomputed = 0;
  let queuedNotifications = 0;
  for (const row of stale.rows) {
    const result = await recomputePulseForContact(row.contact_id);
    if (!result) continue;
    recomputed++;
    // Steady -> Fading transition triggers an overdue alert.
    if (row.pulse_band === "Steady" && result.pulseBand === "Fading") {
      const [u] = await adminDb
        .select({
          notif: users.notificationPrefs,
        })
        .from(users)
        .where(eq(users.id, row.user_id));
      const prefs = u?.notif as
        | { in_app?: boolean; push?: boolean }
        | undefined;
      if (prefs?.in_app !== false) {
        await adminDb.insert(notifications).values({
          userId: row.user_id,
          kind: "overdue_pulse",
          title: "A relationship is fading.",
          body: "Tap to see who needs attention.",
          channel: "in_app",
          payload: {
            deepLink: `/network?pulse_band=Fading`,
          },
        });
        queuedNotifications++;
      }
    }
  }
  return { recomputed, queuedNotifications };
}

/**
 * Daily-digest fan-out helper: run the digest only for users whose local
 * 6 AM is the current UTC hour. Called by /api/cron/daily-digest hourly.
 */
export async function usersDueForDigest(now: Date = new Date()) {
  const utcHour = now.getUTCHours();
  // Find users with notification_prefs.digest_enabled !== false where their
  // local 6 AM corresponds to the current UTC hour.
  const rows = await adminDb.execute<{ id: string; timezone: string }>(sql`
    select id, timezone from users
    where deleted_at is null
      and (notification_prefs->>'digest_enabled')::boolean is not false
      and extract(hour from (now() at time zone timezone)) = 6
      and extract(hour from now()) = ${utcHour}
  `);
  return rows.rows;
}

void eq;
void and;
