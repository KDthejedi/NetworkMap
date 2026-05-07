/**
 * Cron entry point. Runs the daily digest for any user whose local 6 AM
 * matches the current UTC hour. Authenticated via the CRON_SECRET header.
 *
 * Schedule: hit this endpoint hourly (Vercel Cron, GitHub Actions, or
 * Supabase scheduled functions). The pulse-check workflow is invoked once
 * per day; gate it on the UTC hour.
 */
import { NextRequest } from "next/server";
import { runDailyDigest } from "@/lib/agent/workflows/dailyDigest";
import { runPulseCheck, usersDueForDigest } from "@/lib/agent/workflows/pulseCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ??
    request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const now = new Date();
  const due = await usersDueForDigest(now);
  const digestResults: Array<{ user_id: string; ok: boolean; error?: string }> =
    [];

  if (process.env.ANTHROPIC_API_KEY) {
    for (const user of due) {
      try {
        await runDailyDigest({ userId: user.id });
        digestResults.push({ user_id: user.id, ok: true });
      } catch (err) {
        digestResults.push({
          user_id: user.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Run the deterministic Pulse recompute once a day at 02:00 UTC.
  let pulse: { recomputed: number; queuedNotifications: number } | null = null;
  if (now.getUTCHours() === 2) {
    pulse = await runPulseCheck();
  }

  return Response.json({
    ok: true,
    digest_runs: digestResults,
    pulse,
  });
}
