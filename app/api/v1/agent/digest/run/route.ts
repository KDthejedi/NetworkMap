/**
 * POST /api/v1/agent/digest/run
 * Force a digest run for the current user. Rate limited to 3 per day per user.
 */
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { runDailyDigest } from "@/lib/agent/workflows/dailyDigest";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  if (!process.env.ANTHROPIC_API_KEY) {
    return apiError("AGENT_BUSY", "Anthropic key not configured");
  }

  const todayStart = new Date(Date.now() - 24 * 3600_000);
  const recentRuns = await adminDb
    .select({ count: sql<number>`count(*)::int` })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.userId, userId),
        eq(agentRuns.kind, "daily_digest"),
        gt(agentRuns.startedAt, todayStart),
      ),
    );
  if ((recentRuns[0]?.count ?? 0) >= 3) {
    return apiError("RATE_LIMITED", "Maximum 3 manual digests per day");
  }

  const result = await runDailyDigest({ userId });
  return apiOk({
    agent_run_id: result.agentRunId,
    status: result.status,
  });
}
