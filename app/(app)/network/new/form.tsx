"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cluster } from "@/lib/db/schema";

export function AddContactForm({
  clusters,
  tier1,
}: {
  clusters: Cluster[];
  tier1: Array<{ id: string; firstName: string; lastName: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [tier, setTier] = useState<1 | 2>(1);
  const [knownThrough, setKnownThrough] = useState<string>("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [company, setCompany] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/v1/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName || null,
          tier,
          known_through_contact_id: tier === 2 ? knownThrough || null : null,
          city: city || null,
          country: country || null,
          role_title: roleTitle || null,
          company: company || null,
          relationship_type: relationshipType || null,
          cluster_ids: clusterIds,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error?.message ?? "Failed to create");
        return;
      }
      const created = await res.json();
      router.push(`/network/contacts/${created.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" value={firstName} onChange={setFirstName} required />
        <Field label="Last name" value={lastName} onChange={setLastName} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Level</span>
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value) as 1 | 2)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value={1}>Level 1 (direct)</option>
            <option value={2}>Level 2 (known through)</option>
          </select>
        </label>
        {tier === 2 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Introduced by</span>
            <select
              value={knownThrough}
              onChange={(e) => setKnownThrough(e.target.value)}
              required
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a Level 1 contact</option>
              {tier1.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName}
                  {c.lastName ? ` ${c.lastName}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City" value={city} onChange={setCity} />
        <Field label="Country (ISO)" value={country} onChange={setCountry} placeholder="US" maxLength={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role" value={roleTitle} onChange={setRoleTitle} />
        <Field label="Company" value={company} onChange={setCompany} />
      </div>
      <Field
        label="Relationship type"
        value={relationshipType}
        onChange={setRelationshipType}
        placeholder="mentor, colleague, friend..."
      />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Clusters</legend>
        <div className="flex flex-wrap gap-2">
          {clusters.map((c) => {
            const checked = clusterIds.includes(c.id);
            return (
              <button
                type="button"
                key={c.id}
                onClick={() =>
                  setClusterIds((prev) =>
                    checked
                      ? prev.filter((id) => id !== c.id)
                      : [...prev, c.id],
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs ${checked ? "border-primary bg-primary/10" : ""}`}
                style={checked ? { color: c.color } : {}}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Notes</span>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save contact"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}
