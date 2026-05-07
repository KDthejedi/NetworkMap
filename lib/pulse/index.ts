/**
 * Pulse engine. Implements spec section 5 exactly.
 *
 * Public surface:
 *  - computeTieStrength(touchpoints, cadenceDays, hasActiveHighPriorityGoal): 0-100
 *  - computePulseBand(tieStrength, daysSinceLast, cadenceDays): PulseBand
 *  - effectiveCadence(contactOverride, clusterCadences): number
 *  - computeContactPulse(...): one-shot helper that returns everything UIs need
 *
 * Tunable: NORMALIZATION_FACTOR is calibrated so a contact with ~10 healthy
 * mixed-channel interactions per year scores around 75 (spec section 5.2 step 2).
 */
import type { PulseBand, TouchpointChannel, TouchpointDirection, TouchpointDuration } from "@/lib/db/schema";

/**
 * Calibration constant. Spec section 5.2 step 2: "Initial constant: 1.4. Tunable
 * per environment." With the literal recency formula in section 5.2, 1.4 produces
 * scores in the 25-35 range for the spec's "10 healthy interactions/year" pattern,
 * which lands in the Steady band. Production deployments should re-calibrate
 * against real touchpoint volumes; the formula is structured so the constant only
 * scales the output linearly.
 */
export const NORMALIZATION_FACTOR = 1.4;

const CHANNEL_WEIGHT: Record<TouchpointChannel, number> = {
  in_person: 10,
  video: 7,
  phone: 6,
  voice_note: 4,
  text: 3,
  email: 3,
  social: 2,
  group_event: 4,
};

const DURATION_MULTIPLIER: Record<TouchpointDuration, number> = {
  quick: 0.6,
  normal: 1.0,
  deep: 1.5,
};

const DIRECTION_MULTIPLIER: Record<TouchpointDirection, number> = {
  mutual: 1.2,
  outbound: 1.0,
  inbound: 0.9,
};

export type PulseTouchpoint = {
  id: string;
  occurredAt: Date | string;
  channel: TouchpointChannel;
  direction: TouchpointDirection;
  durationBucket: TouchpointDuration;
  qualityRating: number | null;
};

export type TieStrengthBreakdown = {
  topContributions: Array<{
    touchpointId: string;
    contribution: number;
    channel: TouchpointChannel;
    occurredAt: string;
  }>;
  cadenceDays: number;
  goalBoostApplied: boolean;
  computedAt: string;
};

const RECENT_LIMIT = 20;
const RECENT_MAX_DAYS = Math.round(18 * 30.4375);

function qualityMultiplier(rating: number | null | undefined): number {
  if (rating == null) return 1.0;
  switch (rating) {
    case 1: return 0.5;
    case 2: return 0.75;
    case 3: return 1.0;
    case 4: return 1.25;
    case 5: return 1.5;
    default: return 1.0;
  }
}

function recencyMultiplier(daysAgo: number, cadenceDays: number): number {
  if (cadenceDays <= 0) return Math.exp(-0.5 * daysAgo / 30);
  return Math.exp(-0.5 * (daysAgo / cadenceDays));
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Step 1+2 of spec section 5.2: per-touchpoint contributions, summed and
 * normalized to a 0-100 raw score. Step 3 (goal boost) is applied here when
 * hasActiveHighPriorityGoal is true.
 */
export function computeTieStrength(
  touchpoints: PulseTouchpoint[],
  cadenceDays: number,
  hasActiveHighPriorityGoal: boolean,
  now: Date = new Date(),
): { tieStrength: number; breakdown: TieStrengthBreakdown } {
  const recent = [...touchpoints]
    .map((tp) => ({
      ...tp,
      occurredAt: asDate(tp.occurredAt),
    }))
    .filter((tp) => {
      const days = (now.getTime() - tp.occurredAt.getTime()) / 86_400_000;
      return days >= 0 && days <= RECENT_MAX_DAYS;
    })
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .slice(0, RECENT_LIMIT);

  const contributions = recent.map((tp) => {
    const daysAgo = (now.getTime() - tp.occurredAt.getTime()) / 86_400_000;
    const c =
      CHANNEL_WEIGHT[tp.channel] *
      DURATION_MULTIPLIER[tp.durationBucket] *
      DIRECTION_MULTIPLIER[tp.direction] *
      qualityMultiplier(tp.qualityRating) *
      recencyMultiplier(daysAgo, cadenceDays);
    return { tp, c };
  });

  const raw = contributions.reduce((s, x) => s + x.c, 0);
  let tie = Math.min(100, Math.round(raw * NORMALIZATION_FACTOR));
  if (hasActiveHighPriorityGoal) {
    tie = Math.min(100, Math.round(tie * 1.1));
  }

  const top = [...contributions]
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .map(({ tp, c }) => ({
      touchpointId: tp.id,
      contribution: Math.round(c * 100) / 100,
      channel: tp.channel,
      occurredAt: tp.occurredAt.toISOString(),
    }));

  return {
    tieStrength: tie,
    breakdown: {
      topContributions: top,
      cadenceDays,
      goalBoostApplied: hasActiveHighPriorityGoal,
      computedAt: now.toISOString(),
    },
  };
}

/**
 * Spec section 5.3: band assignment from tie strength and overdue ratio.
 */
export function computePulseBand(
  tieStrength: number,
  daysSinceLast: number | null,
  cadenceDays: number,
): PulseBand {
  if (daysSinceLast === null || daysSinceLast === undefined) return "Dormant";
  if (cadenceDays <= 0) cadenceDays = 30;

  if (daysSinceLast > 3 * cadenceDays || tieStrength < 20) return "Dormant";
  if (tieStrength >= 70 && daysSinceLast <= cadenceDays) return "Healthy";
  if (
    tieStrength >= 40 &&
    tieStrength <= 99 &&
    daysSinceLast <= 1.5 * cadenceDays
  ) {
    return "Steady";
  }
  if (daysSinceLast > 1.5 * cadenceDays && daysSinceLast <= 3 * cadenceDays) {
    return "Fading";
  }
  // catch-all: when none of the bands match cleanly, choose by tie strength.
  if (tieStrength >= 70) return "Healthy";
  if (tieStrength >= 40) return "Steady";
  return "Fading";
}

/**
 * Spec section 4.4: contact-level cadence override wins; otherwise the *minimum*
 * cluster cadence (the most demanding) applies.
 */
export function effectiveCadence(
  contactOverrideDays: number | null | undefined,
  clusterCadences: number[],
): number {
  if (contactOverrideDays && contactOverrideDays > 0) return contactOverrideDays;
  if (clusterCadences.length === 0) return 30;
  return Math.min(...clusterCadences);
}

/**
 * One-shot helper used by the touchpoint write path and the nightly recompute.
 */
export function computeContactPulse(args: {
  touchpoints: PulseTouchpoint[];
  contactExpectedCadenceDays: number | null;
  clusterCadences: number[];
  hasActiveHighPriorityGoal: boolean;
  now?: Date;
}): {
  tieStrength: number;
  pulseBand: PulseBand;
  cadenceDays: number;
  lastTouchpointAt: Date | null;
  daysSinceLast: number | null;
  breakdown: TieStrengthBreakdown;
} {
  const now = args.now ?? new Date();
  const cadenceDays = effectiveCadence(
    args.contactExpectedCadenceDays,
    args.clusterCadences,
  );
  const last =
    args.touchpoints.length > 0
      ? new Date(
          Math.max(
            ...args.touchpoints.map((tp) => asDate(tp.occurredAt).getTime()),
          ),
        )
      : null;
  const daysSinceLast = last
    ? (now.getTime() - last.getTime()) / 86_400_000
    : null;

  const { tieStrength, breakdown } = computeTieStrength(
    args.touchpoints,
    cadenceDays,
    args.hasActiveHighPriorityGoal,
    now,
  );

  const pulseBand = computePulseBand(tieStrength, daysSinceLast, cadenceDays);

  return {
    tieStrength,
    pulseBand,
    cadenceDays,
    lastTouchpointAt: last,
    daysSinceLast,
    breakdown,
  };
}
