"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const CHANNELS = [
  "in_person",
  "video",
  "phone",
  "voice_note",
  "text",
  "email",
  "social",
  "group_event",
] as const;

const DURATIONS = [
  { value: "quick", label: "Quick (under 5m)" },
  { value: "normal", label: "Normal (5-30m)" },
  { value: "deep", label: "Deep (30m+)" },
] as const;

export function LogTouchpointForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("phone");
  const [duration, setDuration] =
    useState<(typeof DURATIONS)[number]["value"]>("normal");
  const [direction, setDirection] = useState<"outbound" | "inbound" | "mutual">(
    "outbound",
  );
  const [quality, setQuality] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/touchpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          channel,
          direction,
          duration_bucket: duration,
          quality_rating: quality,
          note: note || null,
          topic_tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error?.message ?? "Failed to log");
        return;
      }
      setNote("");
      setTags("");
      setQuality(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Channel"
          value={channel}
          onChange={(v) => setChannel(v as (typeof CHANNELS)[number])}
          options={CHANNELS.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))}
        />
        <Select
          label="Duration"
          value={duration}
          onChange={(v) =>
            setDuration(v as (typeof DURATIONS)[number]["value"])
          }
          options={DURATIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Direction"
          value={direction}
          onChange={(v) =>
            setDirection(v as "outbound" | "inbound" | "mutual")
          }
          options={[
            { value: "outbound", label: "Outbound" },
            { value: "inbound", label: "Inbound" },
            { value: "mutual", label: "Mutual" },
          ]}
        />
        <Select
          label="Quality"
          value={quality === null ? "" : String(quality)}
          onChange={(v) => setQuality(v ? Number(v) : null)}
          options={[
            { value: "", label: "—" },
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
            { value: "5", label: "5" },
          ]}
        />
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Note</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="One line summary"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Tags (comma separated)</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="career advice, planning"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Logging..." : "Log touchpoint"}
      </button>
    </form>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm capitalize"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
