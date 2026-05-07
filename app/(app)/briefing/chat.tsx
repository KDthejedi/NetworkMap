"use client";

import { useState, useRef, useEffect } from "react";
import type { briefingSessions } from "@/lib/db/schema";

type Session = typeof briefingSessions.$inferSelect;

const STARTERS = [
  "Who should I follow up with this week?",
  "What gaps do I have for my CTO transition goal?",
  "Who haven't I talked to in the DMV in a while?",
];

type Msg = { role: "user" | "assistant"; text: string };

export function BriefingChat({
  sessions,
  initialSessionId,
}: {
  sessions: Session[];
  initialSessionId: string | null;
}) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || streaming) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setStreaming(true);

    let activeSessionId = sessionId;
    if (!activeSessionId) {
      const res = await fetch("/api/v1/agent/briefing/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text.slice(0, 60) }),
      });
      if (!res.ok) {
        setStreaming(false);
        return;
      }
      const json = await res.json();
      activeSessionId = json.id as string;
      setSessionId(activeSessionId);
    }

    const res = await fetch(
      `/api/v1/agent/briefing/sessions/${activeSessionId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      },
    );
    if (!res.ok || !res.body) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong." },
      ]);
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assembled = "";
    setMessages((prev) => [...prev, { role: "assistant", text: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          if (json.delta) {
            assembled += json.delta;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", text: assembled };
              return next;
            });
          }
        } catch {
          // ignore parse errors
        }
      }
    }
    setStreaming(false);
  }

  return (
    <div className="mt-4 flex flex-1 flex-col rounded-md border bg-card">
      <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask anything about your network and goals.
            </p>
            {STARTERS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-md p-3 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-secondary"
              }`}
            >
              {m.text || (streaming ? "..." : "")}
            </div>
          ))
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question..."
          disabled={streaming}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
