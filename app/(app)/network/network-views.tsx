"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Cluster, PulseBand } from "@/lib/db/schema";

const SolarView = dynamic(() => import("./_views/solar-view"), { ssr: false });
const GraphView = dynamic(() => import("./_views/graph-view"), { ssr: false });
const OverlapView = dynamic(() => import("./_views/overlap-view"), { ssr: false });

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  tier: number;
  pulseBand: PulseBand;
  tieStrength: number;
  lastTouchpointAt: string | null;
  roleTitle: string | null;
  company: string | null;
  tags: string[];
  knownThroughContactId: string | null;
  alignment: "personal" | "professional" | "both" | null;
  industry: string | null;
  raceOrEthnicity: string | null;
  gender: string | null;
  ageCohort: string | null;
  languages: string[];
  professionalAffiliations: string[];
};

type Membership = {
  contactId: string;
  clusterId: string;
  clusterName: string;
  clusterColor: string;
};

type ViewMode = "solar" | "graph" | "overlap" | "list";

export function NetworkViews({
  contacts,
  memberships,
  clusters,
}: {
  contacts: ContactRow[];
  memberships: Membership[];
  clusters: Cluster[];
}) {
  const [view, setView] = useState<ViewMode>("solar");
  const [filterCluster, setFilterCluster] = useState<string | null>(null);
  const [filterBand, setFilterBand] = useState<PulseBand | null>(null);
  const [filterTier, setFilterTier] = useState<number | null>(null);

  const membershipsByContact = useMemo(() => {
    const m = new Map<string, Membership[]>();
    for (const r of memberships) {
      if (!m.has(r.contactId)) m.set(r.contactId, []);
      m.get(r.contactId)!.push(r);
    }
    return m;
  }, [memberships]);

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (filterBand && c.pulseBand !== filterBand) return false;
      if (filterTier !== null && c.tier !== filterTier) return false;
      if (filterCluster) {
        const ms = membershipsByContact.get(c.id) ?? [];
        if (!ms.some((m) => m.clusterId === filterCluster)) return false;
      }
      return true;
    });
  }, [contacts, filterCluster, filterBand, filterTier, membershipsByContact]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Your network</h1>
        <Link
          href="/network/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add contact
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <SegmentedControl
          options={[
            { value: "solar", label: "Solar" },
            { value: "graph", label: "Graph" },
            { value: "overlap", label: "Overlap" },
            { value: "list", label: "List" },
          ]}
          value={view}
          onChange={(v) => setView(v as ViewMode)}
        />
        <FilterPill
          options={[
            { value: "", label: "All clusters" },
            ...clusters.map((c) => ({ value: c.id, label: c.name })),
          ]}
          value={filterCluster ?? ""}
          onChange={(v) => setFilterCluster(v || null)}
        />
        <FilterPill
          options={[
            { value: "", label: "All Pulse" },
            { value: "Healthy", label: "Healthy" },
            { value: "Steady", label: "Steady" },
            { value: "Fading", label: "Fading" },
            { value: "Dormant", label: "Dormant" },
          ]}
          value={filterBand ?? ""}
          onChange={(v) => setFilterBand((v as PulseBand) || null)}
        />
        <FilterPill
          options={[
            { value: "", label: "All tiers" },
            { value: "1", label: "Level 1" },
            { value: "2", label: "Level 2" },
          ]}
          value={filterTier === null ? "" : String(filterTier)}
          onChange={(v) => setFilterTier(v === "" ? null : Number(v))}
        />
        <p className="ml-auto self-center text-xs text-muted-foreground">
          {filtered.length} of {contacts.length} contacts
        </p>
      </div>

      <section className="rounded-lg border bg-card">
        {view === "solar" && (
          <SolarView contacts={filtered} clusters={clusters} memberships={memberships} />
        )}
        {view === "graph" && (
          <GraphView contacts={filtered} clusters={clusters} memberships={memberships} />
        )}
        {view === "overlap" && (
          <OverlapView contacts={filtered} clusters={clusters} memberships={memberships} />
        )}
        {view === "list" && (
          <ListView contacts={filtered} membershipsByContact={membershipsByContact} />
        )}
      </section>
    </div>
  );
}

function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1.5 ${
            o.value === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterPill({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border bg-background px-3 py-1.5 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function ListView({
  contacts,
  membershipsByContact,
}: {
  contacts: ContactRow[];
  membershipsByContact: Map<string, Membership[]>;
}) {
  if (contacts.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        No contacts match the current filter.
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {contacts.map((c) => {
        const ms = membershipsByContact.get(c.id) ?? [];
        return (
          <li key={c.id} className="flex items-center justify-between p-4">
            <div>
              <Link
                href={`/network/contacts/${c.id}`}
                className="text-sm font-medium underline"
              >
                {c.preferredName ?? c.firstName}
                {c.lastName ? ` ${c.lastName}` : ""}
              </Link>
              <p className="text-xs text-muted-foreground">
                {c.roleTitle && c.company
                  ? `${c.roleTitle} at ${c.company}`
                  : c.roleTitle ?? c.company ?? c.city ?? ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {ms.map((m) => (
                  <span
                    key={m.clusterId}
                    className="rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: `${m.clusterColor}22`,
                      color: m.clusterColor,
                    }}
                  >
                    {m.clusterName}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right text-xs">
              <PulsePill band={c.pulseBand} />
              <p className="mt-1 text-muted-foreground">
                {c.lastTouchpointAt
                  ? `${daysSince(c.lastTouchpointAt)}d ago`
                  : "no touchpoints"}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PulsePill({ band }: { band: PulseBand }) {
  const colors: Record<PulseBand, string> = {
    Healthy: "text-pulse-healthy bg-pulse-healthy/15",
    Steady: "text-pulse-steady bg-pulse-steady/15",
    Fading: "text-pulse-fading bg-pulse-fading/15",
    Dormant: "text-pulse-dormant bg-pulse-dormant/15",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors[band]}`}
    >
      {band}
    </span>
  );
}

function daysSince(iso: string) {
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
}
