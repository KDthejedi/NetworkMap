/**
 * Daily Digest workflow (spec section 6.4.2).
 *  1. Load active goals (sorted by priority) via tools.
 *  2. Get top overdue contacts.
 *  3. Identify goals with no aligned contacts that are high priority.
 *  4. Synthesize 3-5 recommendations using propose_re_engage / propose_expand.
 *  5. Persist a summary in AgentRun.output_summary (the runner does this).
 */
import { runAgent } from "../runner";
import { DAILY_DIGEST_SYSTEM } from "../prompts";

export async function runDailyDigest(args: { userId: string }) {
  return await runAgent({
    userId: args.userId,
    kind: "daily_digest",
    systemPrompt: DAILY_DIGEST_SYSTEM,
    userMessage: `
Run today's digest. Steps:
1. Call get_active_goals.
2. Call get_overdue_contacts (limit 20).
3. For each overdue contact, when relevant call get_contact_detail or list_contacts to verify goal alignment.
4. Identify any active high priority goal with zero contacts linked; mark as expand candidate.
5. Produce 3 to 5 recommendations: prefer re engage when an existing contact is overdue and goal aligned; prefer expand for clear gaps. Use propose_re_engage and propose_expand to persist them with rationale and priority_score 0-100.
6. Return a one paragraph summary at the end.
`.trim(),
    maxTurns: 8,
  });
}
