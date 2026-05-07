/**
 * Goal Refresh workflow (spec section 6.1 / 6.4.3 / 7.7).
 * Triggered when a goal is created or materially edited. Re scores existing
 * contacts against the goal, links high-fit ones (inferred_by_agent=true),
 * and emits 2-3 expand candidates for clear gaps.
 *
 * If the Anthropic API key is missing, runs in NOOP mode (logs a warning,
 * marks the run as succeeded with an explanatory output, and returns).
 * This keeps onboarding from breaking when the env is partially configured.
 */
import { runAgent } from "../runner";
import { GOAL_REFRESH_SYSTEM } from "../prompts";
import { adminDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function runGoalRefresh(args: { userId: string; goalId: string }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const [run] = await adminDb
      .insert(agentRuns)
      .values({
        userId: args.userId,
        kind: "goal_refresh",
        status: "succeeded",
        inputSummary: { goal_id: args.goalId, mode: "noop" },
        outputSummary: {
          note: "ANTHROPIC_API_KEY not set; agent run skipped.",
        },
        finishedAt: new Date(),
      })
      .returning({ id: agentRuns.id });
    return { agentRunId: run.id, status: "succeeded" as const };
  }

  return await runAgent({
    userId: args.userId,
    kind: "goal_refresh",
    systemPrompt: GOAL_REFRESH_SYSTEM,
    userMessage: `
A goal was just created or materially edited. The goal id is ${args.goalId}.

Steps:
1. Call get_active_goals; locate the goal in question and read its title, category, priority, why_this_matters, and target_personas.
2. Call list_contacts (no filter) and search_contacts using terms drawn from the goal text. Identify contacts whose role, industry, company, or notes plausibly serve the goal.
3. For each clearly relevant contact, call link_contact_to_goal with a one sentence relevance_note.
4. If after step 3 the goal has fewer than 2 aligned contacts and is high priority, propose 2 to 3 expand recommendations via propose_expand with persona_descriptors, citing the goal in each persona's "why".
5. Return a brief summary describing what you did.
`.trim(),
    inputSummary: { goal_id: args.goalId },
    maxTurns: 8,
  });
}

/**
 * Convenience for cron entry points to update a run row to failed if the
 * outer scheduler died mid-run.
 */
export async function failAgentRun(agentRunId: string, message: string) {
  await adminDb
    .update(agentRuns)
    .set({ status: "failed", error: message, finishedAt: new Date() })
    .where(eq(agentRuns.id, agentRunId));
}
