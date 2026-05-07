/**
 * Stream a briefing chat response via SSE (spec section 9.7).
 *
 * The user's message is appended to the session, then the runner is called
 * with the on-demand briefing system prompt. The response is streamed back as
 * Server-Sent Events with `data: { delta: "..." }` chunks.
 *
 * Implementation note: we use the runner's non-streaming path and emit the
 * final text as a single delta. A future optimization is to switch to
 * Anthropic's streaming API and forward content_block_delta events directly.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { eq, and, asc } from "drizzle-orm";
import { briefingSessions, briefingMessages } from "@/lib/db/schema";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError } from "@/lib/api/error";
import { runAgent } from "@/lib/agent/runner";
import { BRIEFING_SYSTEM } from "@/lib/agent/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ message: z.string().min(1).max(4000) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [session] = await adminDb
    .select()
    .from(briefingSessions)
    .where(
      and(eq(briefingSessions.id, id), eq(briefingSessions.userId, userId)),
    );
  if (!session) return apiError("NOT_FOUND", "Session not found");

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "Message required");
  }

  await adminDb.insert(briefingMessages).values({
    sessionId: session.id,
    userId,
    role: "user",
    content: { text: parsed.data.message },
  });

  const history = await adminDb
    .select()
    .from(briefingMessages)
    .where(eq(briefingMessages.sessionId, session.id))
    .orderBy(asc(briefingMessages.createdAt));

  const transcript = history
    .map((m) => {
      const c = m.content as { text?: string } | null;
      return `${m.role}: ${c?.text ?? ""}`;
    })
    .join("\n");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        if (!process.env.ANTHROPIC_API_KEY) {
          send({
            delta:
              "Briefing is not configured: ANTHROPIC_API_KEY missing. Add it to .env.local and restart.",
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const result = await runAgent({
          userId,
          kind: "on_demand_briefing",
          systemPrompt: BRIEFING_SYSTEM,
          userMessage: transcript,
          inputSummary: { session_id: session.id },
          maxTurns: 6,
        });

        // Single-shot delta: emit the final text. Streaming-aware version is a
        // straightforward refactor to messages.stream() in the runner.
        const text = result.finalText || "(no response)";
        send({ delta: text });

        await adminDb.insert(briefingMessages).values({
          sessionId: session.id,
          userId,
          role: "assistant",
          content: { text },
          agentRunId: result.agentRunId,
        });
        await adminDb
          .update(briefingSessions)
          .set({ updatedAt: new Date() })
          .where(eq(briefingSessions.id, session.id));

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        send({
          delta: `Sorry, the briefing failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
