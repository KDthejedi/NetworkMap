"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Cluster } from "@/lib/db/schema";
import { DEMOGRAPHIC_SUGGESTIONS } from "@/lib/demographics";

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
  const [industry, setIndustry] = useState("");
  const [relationshipType, setRelationshipType] = useState("");
  const [alignment, setAlignment] = useState<"personal" | "professional" | "both" | "">("");
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Optional fields collapsed by default.
  const [showMore, setShowMore] = useState(false);
  const [race, setRace] = useState("");
  const [gender, setGender] = useState("");
  const [ageCohort, setAgeCohort] = useState<"" | "under_20" | "20s" | "30s" | "40s" | "50s" | "60s" | "70_plus">("");
  const [education, setEducation] = useState("");
  const [languages, setLanguages] = useState("");
  const [affiliations, setAffiliations] = useState("");

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
          industry: industry || null,
          relationship_type: relationshipType || null,
          alignment: alignment || null,
          cluster_ids: clusterIds,
          notes: notes || null,
          race_or_ethnicity: race || null,
          gender: gender || null,
          age_cohort: ageCohort || null,
          education: education || null,
          languages: splitList(languages),
          professional_affiliations: splitList(affiliations),
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
      <Field label="Industry" value={industry} onChange={setIndustry} placeholder="Tech, Healthcare, Finance..." />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Relationship type"
          value={relationshipType}
          onChange={setRelationshipType}
          placeholder="mentor, colleague, friend..."
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Alignment</span>
          <select
            value={alignment}
            onChange={(e) => setAlignment(e.target.value as typeof alignment)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">—</option>
            <option value="personal">Personal</option>
            <option value="professional">Professional</option>
            <option value="both">Both</option>
          </select>
        </label>
      </div>
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

      <details
        open={showMore}
        onToggle={(e) => setShowMore((e.target as HTMLDetailsElement).open)}
        className="rounded-md border bg-muted/30 p-4"
      >
        <summary className="cursor-pointer text-sm font-medium">
          More about this person (optional)
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Used only for your private network analytics (overlap and robustness).
          You can leave any of these blank.
        </p>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Race or ethnicity</span>
              <select
                value={race}
                onChange={(e) => setRace(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {DEMOGRAPHIC_SUGGESTIONS.race.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Gender</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="">—</option>
                {DEMOGRAPHIC_SUGGESTIONS.gender.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Age cohort</span>
            <select
              value={ageCohort}
              onChange={(e) => setAgeCohort(e.target.value as typeof ageCohort)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="under_20">Under 20</option>
              <option value="20s">20s</option>
              <option value="30s">30s</option>
              <option value="40s">40s</option>
              <option value="50s">50s</option>
              <option value="60s">60s</option>
              <option value="70_plus">70+</option>
            </select>
          </label>
          <Field label="Education" value={education} onChange={setEducation} placeholder="MIT, Howard, ..." />
          <Field
            label="Languages (comma separated)"
            value={languages}
            onChange={setLanguages}
            placeholder="English, Spanish"
          />
          <Field
            label="Professional affiliations (comma separated)"
            value={affiliations}
            onChange={setAffiliations}
            placeholder="NSBE, ACM, ..."
          />
        </div>
      </details>

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

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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
