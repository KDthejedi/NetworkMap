"use client";

/**
 * Overlap view. A grid of distribution charts, one per dimension. Bars are
 * tappable: tapping filters the rest of the page (we pass an onFilter callback
 * up so the parent can sync the filter pills).
 *
 * Dimensions: company, role title, industry, geography, alignment, cluster,
 * race, gender, age cohort, languages, professional affiliations.
 */
import { useMemo, useState } from "react";
import type { Cluster, PulseBand } from "@/lib/db/schema";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  tier: number;
  pulseBand: PulseBand;
  city: string | null;
  country: string | null;
  industry: string | null;
  company: string | null;
  roleTitle: string | null;
  alignment: "personal" | "professional" | "both" | null;
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

type Dimension =
  | "alignment"
  | "country"
  | "city"
  | "industry"
  | "company"
  | "roleTitle"
  | "cluster"
  | "race"
  | "gender"
  | "ageCohort"
  | "language"
  | "affiliation";

const DIMENSION_LABELS: Record<Dimension, string> = {
  alignment: "Alignment",
  country: "Country",
  city: "City",
  industry: "Industry",
  company: "Company",
  roleTitle: "Role",
  cluster: "Sphere",
  race: "Race or ethnicity",
  gender: "Gender",
  ageCohort: "Age cohort",
  language: "Languages",
  affiliation: "Affiliations",
};

const ALL_DIMENSIONS: Dimension[] = [
  "alignment",
  "country",
  "city",
  "industry",
  "company",
  "roleTitle",
  "cluster",
  "race",
  "gender",
  "ageCohort",
  "language",
  "affiliation",
];

export default function OverlapView({
  contacts,
  clusters,
  memberships,
}: {
  contacts: ContactRow[];
  clusters: Cluster[];
  memberships: Membership[];
}) {
  const [selected, setSelected] = useState<
    Partial<Record<Dimension, string>>
  >({});
  const [enabled, setEnabled] = useState<Set<Dimension>>(
    new Set(ALL_DIMENSIONS),
  );

  const clusterNameById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c.name])),
    [clusters],
  );
  const clusterColorById = useMemo(
    () => new Map(clusters.map((c) => [c.id, c.color])),
    [clusters],
  );
  const clustersByContact = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of memberships) {
      if (!m.has(r.contactId)) m.set(r.contactId, []);
      m.get(r.contactId)!.push(r.clusterId);
    }
    return m;
  }, [memberships]);

  // Apply currently-selected filters BEFORE binning each dimension, so charts
  // react to drill-downs (e.g. filter to Industry=Tech and watch the Geography
  // chart re-bin).
  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      for (const [dim, val] of Object.entries(selected) as Array<[Dimension, string]>) {
        if (!val) continue;
        if (!matches(c, dim, val, clustersByContact, clusterNameById)) {
          return false;
        }
      }
      return true;
    });
  }, [contacts, selected, clustersByContact, clusterNameById]);

  const bins = useMemo(() => {
    const out: Record<Dimension, Array<{ key: string; count: number }>> = {} as Record<
      Dimension,
      Array<{ key: string; count: number }>
    >;
    for (const dim of ALL_DIMENSIONS) {
      out[dim] = binBy(filtered, dim, clustersByContact, clusterNameById);
    }
    return out;
  }, [filtered, clustersByContact, clusterNameById]);

  function setFilter(dim: Dimension, key: string | null) {
    setSelected((prev) => {
      const next = { ...prev };
      if (key === null || prev[dim] === key) delete next[dim];
      else next[dim] = key;
      return next;
    });
  }

  function clearAll() {
    setSelected({});
  }

  const activeFilters = Object.entries(selected).filter(([, v]) => Boolean(v));

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Overlap</h2>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {contacts.length} contacts · tap a bar to filter
          </p>
        </div>
        {activeFilters.length > 0 && (
          <button
            onClick={clearAll}
            className="rounded-md border px-3 py-1 text-xs"
          >
            Clear filters
          </button>
        )}
      </header>

      {activeFilters.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {activeFilters.map(([dim, val]) => (
            <li key={dim}>
              <button
                onClick={() => setFilter(dim as Dimension, null)}
                className="rounded-full border bg-secondary px-3 py-1 text-xs"
              >
                {DIMENSION_LABELS[dim as Dimension]}: {val} ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Dimensions to show</legend>
        {ALL_DIMENSIONS.map((dim) => (
          <button
            key={dim}
            type="button"
            onClick={() =>
              setEnabled((prev) => {
                const next = new Set(prev);
                if (next.has(dim)) next.delete(dim);
                else next.add(dim);
                return next;
              })
            }
            className={`rounded-full border px-3 py-1 text-xs ${
              enabled.has(dim) ? "border-primary bg-primary/10" : "text-muted-foreground"
            }`}
            aria-pressed={enabled.has(dim)}
          >
            {DIMENSION_LABELS[dim]}
          </button>
        ))}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ALL_DIMENSIONS.filter((d) => enabled.has(d)).map((dim) => (
          <DistributionChart
            key={dim}
            label={DIMENSION_LABELS[dim]}
            data={bins[dim]}
            selected={selected[dim] ?? null}
            onSelect={(k) => setFilter(dim, k)}
            color={dim === "cluster" ? (k) => firstClusterColor(k, clusters) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function DistributionChart({
  label,
  data,
  selected,
  onSelect,
  color,
}: {
  label: string;
  data: Array<{ key: string; count: number }>;
  selected: string | null;
  onSelect: (key: string) => void;
  color?: (key: string) => string | undefined;
}) {
  const top = data.slice(0, 8);
  const max = top.reduce((m, d) => Math.max(m, d.count), 0);
  return (
    <section className="rounded-md border bg-card p-3">
      <h3 className="text-sm font-medium">{label}</h3>
      {top.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {top.map((row) => {
            const pct = max === 0 ? 0 : (row.count / max) * 100;
            const isSelected = selected === row.key;
            const c = color?.(row.key) ?? "hsl(var(--primary))";
            return (
              <li key={row.key}>
                <button
                  onClick={() => onSelect(row.key)}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs ${
                    isSelected ? "bg-primary/10" : "hover:bg-accent"
                  }`}
                  aria-pressed={isSelected}
                >
                  <span className="w-28 shrink-0 truncate">{prettyKey(row.key)}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded"
                      style={{ width: `${pct}%`, backgroundColor: c }}
                    />
                  </span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">
                    {row.count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function binBy(
  contacts: ContactRow[],
  dim: Dimension,
  clustersByContact: Map<string, string[]>,
  clusterNameById: Map<string, string>,
): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const c of contacts) {
    const values = valuesFor(c, dim, clustersByContact, clusterNameById);
    for (const v of values) {
      m.set(v, (m.get(v) ?? 0) + 1);
    }
  }
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function valuesFor(
  c: ContactRow,
  dim: Dimension,
  clustersByContact: Map<string, string[]>,
  clusterNameById: Map<string, string>,
): string[] {
  switch (dim) {
    case "alignment":
      return [c.alignment ?? "—"];
    case "country":
      return [c.country ?? "—"];
    case "city":
      return [c.city ?? "—"];
    case "industry":
      return [c.industry ?? "—"];
    case "company":
      return [c.company ?? "—"];
    case "roleTitle":
      return [c.roleTitle ?? "—"];
    case "cluster": {
      const ids = clustersByContact.get(c.id) ?? [];
      return ids.length === 0
        ? ["—"]
        : ids.map((id) => clusterNameById.get(id) ?? id);
    }
    case "race":
      return [c.raceOrEthnicity ?? "—"];
    case "gender":
      return [c.gender ?? "—"];
    case "ageCohort":
      return [c.ageCohort ?? "—"];
    case "language":
      return c.languages.length === 0 ? ["—"] : c.languages;
    case "affiliation":
      return c.professionalAffiliations.length === 0
        ? ["—"]
        : c.professionalAffiliations;
  }
}

function matches(
  c: ContactRow,
  dim: Dimension,
  val: string,
  clustersByContact: Map<string, string[]>,
  clusterNameById: Map<string, string>,
): boolean {
  const vs = valuesFor(c, dim, clustersByContact, clusterNameById);
  return vs.includes(val);
}

function prettyKey(key: string) {
  if (key === "—" || key === "") return "(unset)";
  if (key === "under_20") return "Under 20";
  if (key === "70_plus") return "70+";
  if (/^[0-9]+s$/.test(key)) return key;
  if (key === "personal") return "Personal";
  if (key === "professional") return "Professional";
  if (key === "both") return "Both";
  return key;
}

function firstClusterColor(name: string, clusters: Cluster[]) {
  return clusters.find((c) => c.name === name)?.color;
}
