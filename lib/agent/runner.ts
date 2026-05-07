/**
 * Agent runner. Calls Anthropic with the tool surface, executes tool calls
 * server side, loops until the model returns a final answer, and persists the
 * full trace to the AgentRun row.
 *
 * Constraints (spec section 6.7):
 *  - 8K input / 2K output token cap.
 *  - Anthropic API zero-retention header set.
 *  - All writes are user-permitted via the tools (which themselves write audit log).
 */
import Anthropic from "@anthropic-ai/sdk";
import { adminDb } from "@/lib/db/client";
import { agentRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ALL_TOOLS, TOOL_BY_NAME } from "./tools";

export type AgentRunKind =
  | "daily_digest"
  | "on_demand_briefing"
  | "goal_refresh"
  | "scheduled_pulse_check";

export type RunInput = {
  userId: string;
  kind: AgentRunKind;
  systemPrompt: string;
  userMessage: string;
  inputSummary?: Record<string, unknown>;
  maxTurns?: number;
};

export type RunResult = {
  agentRunId: string;
  finalText: string;
  trace: Array<{
    kind: "user" | "assistant" | "tool_use" | "tool_result";
    content: unknown;
    at: string;
  }>;
  tokenUsage: { input: number; output: number };
  status: "succeeded" | "failed";
};

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-7";
const MAX_INPUT_TOKENS = 8000;
const MAX_OUTPUT_TOKENS = 2000;

let cachedClient: Anthropic | null = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  cachedClient = new Anthropic({
    apiKey,
    defaultHeaders: { "anthropic-no-train": "true" },
  });
  return cachedClient;
}

export async function runAgent(input: RunInput): Promise<RunResult> {
  const trace: RunResult["trace"] = [];
  const [run] = await adminDb
    .insert(agentRuns)
    .values({
      userId: input.userId,
      kind: input.kind,
      status: "running",
      inputSummary: input.inputSummary ?? {},
    })
    .returning({ id: agentRuns.id });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: input.userMessage },
  ];
  trace.push({ kind: "user", content: input.userMessage, at: now() });

  let totalInput = 0;
  let totalOutput = 0;
  const maxTurns = input.maxTurns ?? 6;
  const tools = ALL_TOOLS.map((t) => t.toAnthropic());

  let finalText = "";
  let status: "succeeded" | "failed" = "succeeded";

  try {
    const client = getClient();
    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: input.systemPrompt,
        tools,
        messages,
      });

      totalInput += response.usage?.input_tokens ?? 0;
      totalOutput += response.usage?.output_tokens ?? 0;
      if (totalInput > MAX_INPUT_TOKENS) {
        // Spec section 6.7: trim oldest. Simplest correct behavior: stop here.
        trace.push({
          kind: "assistant",
          content: { warning: "input_token_cap_reached", totalInput },
          at: now(),
        });
        break;
      }

      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });
      trace.push({
        kind: "assistant",
        content: assistantContent,
        at: now(),
      });

      const toolUses = assistantContent.filter(
        (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
      );

      if (toolUses.length === 0) {
        finalText = assistantContent
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const handler = TOOL_BY_NAME[tu.name];
        if (!handler) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ error: `unknown tool ${tu.name}` }),
            is_error: true,
          });
          continue;
        }
        const parsed = handler.schema.safeParse(tu.input);
        if (!parsed.success) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({
              error: "invalid input",
              issues: parsed.error.issues,
            }),
            is_error: true,
          });
          continue;
        }
        try {
          const out = await handler.execute(parsed.data, {
            userId: input.userId,
            agentRunId: run.id,
          });
          trace.push({
            kind: "tool_use",
            content: { name: tu.name, input: parsed.data },
            at: now(),
          });
          trace.push({
            kind: "tool_result",
            content: { name: tu.name, output: out },
            at: now(),
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(out ?? null),
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    status = "failed";
    finalText = err instanceof Error ? err.message : String(err);
    trace.push({ kind: "assistant", content: { error: finalText }, at: now() });
  }

  await adminDb
    .update(agentRuns)
    .set({
      status,
      finishedAt: new Date(),
      outputSummary: { final_text: finalText },
      tokenUsage: { input: totalInput, output: totalOutput },
      trace,
      error: status === "failed" ? finalText : null,
    })
    .where(eq(agentRuns.id, run.id));

  return {
    agentRunId: run.id,
    finalText,
    trace,
    tokenUsage: { input: totalInput, output: totalOutput },
    status,
  };
}

function now() {
  return new Date().toISOString();
}
