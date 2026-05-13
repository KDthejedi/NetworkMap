/**
 * Robustness engine. Scores how strong + diverse a user's network is, and
 * produces a gap list explaining what to fix.
 *
 * Inputs are pre-loaded rows; this module does no I/O so it can be tested in
 * isolation and reused by both the UI and the agent.
 *
 * Output:
 *   score: 0-100 (overall robustness)
 *   components: breakdown showing how each dimension contributed
 *   gaps: ordered list of concrete things the user should fix
 */

import type { PulseBand } from "@/lib/db/schema";

export type ContactSnapshot = {
  id: string;
  tier: number;
  pulseBand: PulseBand;
  alignment: "personal" | "professional" | "both" | null;
  city: string | null;
  country: string | null;
  industry: string | null;
  company: string | null;
  roleTitle: string | null;
  raceOrEthnicity: string | null;
  gender: string | null;
  ageCohort: string | null;
  languages: string[];
  clusterIds: string[];
};

export type ClusterSnapshot = {
  id: string;
  name: string;
};

export type GoalSnapshot = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  hasAlignedContacts: boolean;
};

export type RobustnessComponent = {
  key: string;
  label: string;
  score: number; // 0-100
  weight: number; // 0-1
  detail: string;
};

export type Gap = {
  severity: "high" | "medium" | "low";
  category: string;
  message: string;
};

export type RobustnessResult = {
  score: number;
  components: RobustnessComponent[];
  gaps: Gap[];
  computedAt: string;
};

const TIER_1_TARGET = 25; // a "reasonable" Level 1 network
const HEALTHY_PCT_TARGET = 0.4; // 40% of Tier-1 should be Healthy or Steady
const CLUSTER_COVERAGE_TARGET = 3; // each cluster wants 3+ Healthy contacts

export function computeRobustness(args: {
  contacts: ContactSnapshot[];
  clusters: ClusterSnapshot[];
  goals: GoalSnapshot[];
  now?: Date;
}): RobustnessResult {
  const now = args.now ?? new Date();
  const tier1 = args.contacts.filter((c) => c.tier === 1);
  const total = tier1.length;

  const components: RobustnessComponent[] = [];
  const gaps: Gap[] = [];

  // 1. Size of Level 1 network.
  const sizeScore = Math.min(100, Math.round((total / TIER_1_TARGET) * 100));
  components.push({
    key: "size",
    label: "Network size",
    score: sizeScore,
    weight: 0.15,
    detail: `${total} Level 1 contacts (target ${TIER_1_TARGET}+)`,
  });
  if (total < 10) {
    gaps.push({
      severity: "high",
      category: "size",
      message: `Only ${total} direct contacts. Aim for 25+ Level 1 relationships across spheres.`,
    });
  }

  // 2. Pulse health: share of Tier-1 contacts that are Healthy or Steady.
  const healthy = tier1.filter(
    (c) => c.pulseBand === "Healthy" || c.pulseBand === "Steady",
  ).length;
  const healthyShare = total === 0 ? 0 : healthy / total;
  const pulseScore = Math.min(
    100,
    Math.round((healthyShare / HEALTHY_PCT_TARGET) * 100),
  );
  components.push({
    key: "pulse",
    label: "Active relationships",
    score: pulseScore,
    weight: 0.2,
    detail: `${Math.round(healthyShare * 100)}% of Level 1 are Healthy or Steady`,
  });
  const fading = tier1.filter(
    (c) => c.pulseBand === "Fading" || c.pulseBand === "Dormant",
  ).length;
  if (total > 5 && fading / total > 0.5) {
    gaps.push({
      severity: "high",
      category: "pulse",
      message: `${fading} of ${total} direct contacts are Fading or Dormant. Re-engage before they go cold.`,
    });
  }

  // 3. Alignment spread (Personal / Professional / Both).
  const alignmentScore = diversityScore(
    tier1.map((c) => c.alignment ?? "unset"),
  );
  components.push({
    key: "alignment",
    label: "Personal / professional balance",
    score: alignmentScore,
    weight: 0.1,
    detail: distributionDetail(
      tier1.map((c) => c.alignment ?? "unset"),
      { personal: "Personal", professional: "Professional", both: "Both", unset: "Unset" },
    ),
  });
  const personalCount = tier1.filter((c) => c.alignment === "personal" || c.alignment === "both").length;
  const profCount = tier1.filter((c) => c.alignment === "professional" || c.alignment === "both").length;
  if (total >= 10 && profCount > 0 && personalCount / total < 0.2) {
    gaps.push({
      severity: "medium",
      category: "alignment",
      message: "Your network is heavily professional. Few personal connections.",
    });
  } else if (total >= 10 && personalCount > 0 && profCount / total < 0.2) {
    gaps.push({
      severity: "medium",
      category: "alignment",
      message: "Your network is heavily personal. Few professional connections.",
    });
  }

  // 4. Geography spread.
  const geoScore = diversityScore(tier1.map((c) => c.country ?? "unset"));
  components.push({
    key: "geography",
    label: "Geographic reach",
    score: geoScore,
    weight: 0.1,
    detail: topBucketsDetail(tier1.map((c) => c.country ?? "unset")),
  });
  const countryCounts = bucketCounts(tier1.map((c) => c.country ?? "unset"));
  if (total >= 10) {
    const top = topBuckets(countryCounts, 1)[0];
    if (top && top.count / total > 0.85 && top.key !== "unset") {
      gaps.push({
        severity: "medium",
        category: "geography",
        message: `${Math.round((top.count / total) * 100)}% of your network is in ${top.key}.`,
      });
    }
  }

  // 5. Industry / company concentration risk.
  const industryScore = diversityScore(tier1.map((c) => c.industry ?? "unset"));
  components.push({
    key: "industry",
    label: "Industry breadth",
    score: industryScore,
    weight: 0.1,
    detail: topBucketsDetail(tier1.map((c) => c.industry ?? "unset")),
  });
  const indCounts = bucketCounts(tier1.map((c) => c.industry ?? "unset"));
  const topInd = topBuckets(indCounts, 1)[0];
  if (total >= 10 && topInd && topInd.key !== "unset" && topInd.count / total > 0.6) {
    gaps.push({
      severity: "medium",
      category: "industry",
      message: `${Math.round((topInd.count / total) * 100)}% of your network works in ${topInd.key}.`,
    });
  }

  const companyCounts = bucketCounts(
    tier1.map((c) => c.company ?? "unset").filter((c) => c !== "unset"),
  );
  const topCo = topBuckets(companyCounts, 1)[0];
  if (total >= 10 && topCo && topCo.count / total > 0.4) {
    gaps.push({
      severity: "medium",
      category: "company",
      message: `${topCo.count} of your contacts work at ${topCo.key}. That is a single point of failure.`,
    });
  }

  // 6. Demographic diversity (race, gender). Only counted if at least half of
  //    Tier-1 have data, otherwise we skip rather than mislead.
  const raceCoverage = tier1.filter((c) => c.raceOrEthnicity).length;
  const genderCoverage = tier1.filter((c) => c.gender).length;
  let demoScore = 0;
  let demoDetail = "Not enough data";
  let demoWeight = 0.05;
  if (total >= 5 && raceCoverage / total >= 0.5 && genderCoverage / total >= 0.5) {
    const rScore = diversityScore(
      tier1.map((c) => c.raceOrEthnicity ?? "unset"),
    );
    const gScore = diversityScore(tier1.map((c) => c.gender ?? "unset"));
    demoScore = Math.round((rScore + gScore) / 2);
    demoDetail = `${raceCoverage}/${total} race set, ${genderCoverage}/${total} gender set`;
    demoWeight = 0.1;

    const genderCounts = bucketCounts(
      tier1
        .map((c) => c.gender ?? "")
        .filter((g) => g),
    );
    const topGender = topBuckets(genderCounts, 1)[0];
    if (topGender && topGender.count / genderCoverage > 0.75) {
      gaps.push({
        severity: "medium",
        category: "demographics",
        message: `Of contacts with gender set, ${Math.round((topGender.count / genderCoverage) * 100)}% are ${topGender.key}.`,
      });
    }
  }
  components.push({
    key: "demographics",
    label: "Demographic diversity",
    score: demoScore,
    weight: demoWeight,
    detail: demoDetail,
  });

  // 7. Cluster (sphere of life) coverage.
  const clusterCounts = new Map<string, number>();
  for (const c of tier1) {
    if (c.pulseBand === "Healthy" || c.pulseBand === "Steady") {
      for (const cid of c.clusterIds) {
        clusterCounts.set(cid, (clusterCounts.get(cid) ?? 0) + 1);
      }
    }
  }
  let clustersWithCoverage = 0;
  const thinClusters: string[] = [];
  for (const cluster of args.clusters) {
    const n = clusterCounts.get(cluster.id) ?? 0;
    if (n >= CLUSTER_COVERAGE_TARGET) clustersWithCoverage++;
    else if (n === 0) thinClusters.push(cluster.name);
  }
  const clusterScore =
    args.clusters.length === 0
      ? 0
      : Math.round((clustersWithCoverage / args.clusters.length) * 100);
  components.push({
    key: "clusters",
    label: "Sphere of life coverage",
    score: clusterScore,
    weight: 0.15,
    detail: `${clustersWithCoverage} of ${args.clusters.length} spheres have ${CLUSTER_COVERAGE_TARGET}+ Healthy contacts`,
  });
  for (const name of thinClusters) {
    gaps.push({
      severity: "low",
      category: "clusters",
      message: `No Healthy contacts in the ${name} sphere.`,
    });
  }

  // 8. Goal coverage: each active high-priority goal should have aligned contacts.
  const highGoals = args.goals.filter((g) => g.priority === "high");
  const goalsCovered = highGoals.filter((g) => g.hasAlignedContacts).length;
  const goalScore =
    highGoals.length === 0
      ? 100
      : Math.round((goalsCovered / highGoals.length) * 100);
  components.push({
    key: "goals",
    label: "Goal coverage",
    score: goalScore,
    weight: 0.15,
    detail:
      highGoals.length === 0
        ? "No high-priority goals set"
        : `${goalsCovered} of ${highGoals.length} high-priority goals have aligned contacts`,
  });
  for (const g of highGoals) {
    if (!g.hasAlignedContacts) {
      gaps.push({
        severity: "high",
        category: "goals",
        message: `Goal "${g.title}" has no aligned contacts.`,
      });
    }
  }

  // ---- aggregate ----
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weighted = components.reduce((s, c) => s + c.score * c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);

  // Sort gaps by severity then category.
  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  gaps.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return { score, components, gaps, computedAt: now.toISOString() };
}

// ---- helpers ----

function bucketCounts(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return m;
}

function topBuckets(m: Map<string, number>, n: number) {
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Shannon entropy normalized to 0-100. Higher means more even spread.
 */
function diversityScore(values: string[]): number {
  const m = bucketCounts(values.filter((v) => v && v !== "unset"));
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total === 0 || m.size <= 1) return m.size === 1 ? 25 : 0;
  let h = 0;
  for (const c of m.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  const max = Math.log2(m.size);
  return Math.round((h / max) * 100);
}

function distributionDetail(values: string[], labels: Record<string, string>) {
  const m = bucketCounts(values);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return "no data";
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, c]) => `${labels[k] ?? k} ${Math.round((c / total) * 100)}%`)
    .join(" · ");
}

function topBucketsDetail(values: string[]) {
  const m = bucketCounts(values.filter((v) => v && v !== "unset"));
  if (m.size === 0) return "no data";
  return topBuckets(m, 3)
    .map((b) => `${b.key} ${b.count}`)
    .join(" · ");
}
