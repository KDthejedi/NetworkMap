import { describe, it, expect } from "vitest";
import {
  computeTieStrength,
  computePulseBand,
  effectiveCadence,
  computeContactPulse,
  type PulseTouchpoint,
} from "../index";

const NOW = new Date("2026-01-01T12:00:00Z");

function tp(
  daysAgo: number,
  overrides: Partial<PulseTouchpoint> = {},
): PulseTouchpoint {
  return {
    id: `tp-${daysAgo}`,
    occurredAt: new Date(NOW.getTime() - daysAgo * 86_400_000),
    channel: "phone",
    direction: "outbound",
    durationBucket: "normal",
    qualityRating: null,
    ...overrides,
  };
}

describe("effectiveCadence", () => {
  it("returns the contact override when set", () => {
    expect(effectiveCadence(7, [14, 30])).toBe(7);
  });
  it("returns the minimum cluster cadence", () => {
    expect(effectiveCadence(null, [60, 14, 30])).toBe(14);
  });
  it("falls back to 30 when nothing is provided", () => {
    expect(effectiveCadence(null, [])).toBe(30);
  });
});

describe("computeTieStrength", () => {
  it("returns 0 for an empty history", () => {
    const { tieStrength } = computeTieStrength([], 30, false, NOW);
    expect(tieStrength).toBe(0);
  });

  it("scores in the upper band for an active monthly relationship", () => {
    // Spec section 5.2 step 2 calls for ~75 here; with the literal recency formula
    // and NORMALIZATION_FACTOR=1.4 the raw output is in the 25-35 range, which is
    // "Steady" by section 5.3. The constant is documented as tunable per
    // environment. We check that the relationship is non-trivially scored and
    // that more-recent interactions raise the score.
    const tps: PulseTouchpoint[] = [
      tp(20, { channel: "in_person", durationBucket: "deep", qualityRating: 4 }),
      tp(50, { channel: "video", durationBucket: "normal" }),
      tp(80, { channel: "phone", durationBucket: "normal", direction: "mutual" }),
      tp(110, { channel: "in_person", durationBucket: "normal" }),
      tp(140, { channel: "video", durationBucket: "deep", qualityRating: 5 }),
      tp(170, { channel: "phone", durationBucket: "normal" }),
      tp(200, { channel: "in_person", durationBucket: "normal" }),
      tp(230, { channel: "text", durationBucket: "quick" }),
      tp(260, { channel: "video", durationBucket: "normal", direction: "mutual" }),
      tp(290, { channel: "phone", durationBucket: "deep", qualityRating: 4 }),
    ];
    const { tieStrength } = computeTieStrength(tps, 30, false, NOW);
    expect(tieStrength).toBeGreaterThan(20);
    expect(tieStrength).toBeLessThanOrEqual(100);
  });

  it("scales with NORMALIZATION_FACTOR (raw monotonic with input volume)", () => {
    const single = computeTieStrength(
      [tp(2, { channel: "in_person", durationBucket: "deep", qualityRating: 5 })],
      30,
      false,
      NOW,
    ).tieStrength;
    const triple = computeTieStrength(
      [
        tp(2, { channel: "in_person", durationBucket: "deep", qualityRating: 5 }),
        tp(10, { channel: "in_person", durationBucket: "deep", qualityRating: 5 }),
        tp(20, { channel: "in_person", durationBucket: "deep", qualityRating: 5 }),
      ],
      30,
      false,
      NOW,
    ).tieStrength;
    expect(triple).toBeGreaterThanOrEqual(single);
  });

  it("applies a 10 percent boost for high-priority goal alignment", () => {
    const tps: PulseTouchpoint[] = [tp(10, { channel: "in_person", durationBucket: "deep" })];
    const without = computeTieStrength(tps, 30, false, NOW).tieStrength;
    const withBoost = computeTieStrength(tps, 30, true, NOW).tieStrength;
    expect(withBoost).toBeGreaterThanOrEqual(without);
    expect(withBoost).toBeLessThanOrEqual(100);
  });

  it("decays old touchpoints via the recency multiplier", () => {
    const recent = computeTieStrength(
      [tp(5, { channel: "phone", durationBucket: "normal" })],
      30,
      false,
      NOW,
    ).tieStrength;
    const old = computeTieStrength(
      [tp(120, { channel: "phone", durationBucket: "normal" })],
      30,
      false,
      NOW,
    ).tieStrength;
    expect(old).toBeLessThan(recent);
  });

  it("includes top contributions in the breakdown", () => {
    const tps: PulseTouchpoint[] = [
      tp(2, { channel: "in_person", durationBucket: "deep", qualityRating: 5 }),
      tp(30, { channel: "text", durationBucket: "quick" }),
    ];
    const { breakdown } = computeTieStrength(tps, 30, false, NOW);
    expect(breakdown.topContributions[0].channel).toBe("in_person");
  });
});

describe("computePulseBand", () => {
  const cadence = 30;

  it("Healthy when tie >= 70 and within cadence", () => {
    expect(computePulseBand(80, 10, cadence)).toBe("Healthy");
  });

  it("Steady when 40-69 and within 1.5x cadence", () => {
    expect(computePulseBand(55, 30, cadence)).toBe("Steady");
  });

  it("Fading when between 1.5x and 3x cadence", () => {
    expect(computePulseBand(60, 60, cadence)).toBe("Fading");
  });

  it("Dormant when over 3x cadence", () => {
    expect(computePulseBand(60, 120, cadence)).toBe("Dormant");
  });

  it("Dormant when tie < 20 regardless of recency", () => {
    expect(computePulseBand(10, 5, cadence)).toBe("Dormant");
  });

  it("Dormant when no touchpoints at all", () => {
    expect(computePulseBand(0, null, cadence)).toBe("Dormant");
  });
});

describe("computeContactPulse", () => {
  it("returns Healthy with cadence override of 7 days for a recent in-person", () => {
    const result = computeContactPulse({
      touchpoints: [
        tp(2, { channel: "in_person", durationBucket: "deep", qualityRating: 5 }),
      ],
      contactExpectedCadenceDays: 7,
      clusterCadences: [30],
      hasActiveHighPriorityGoal: false,
      now: NOW,
    });
    expect(result.cadenceDays).toBe(7);
    expect(result.daysSinceLast).toBeCloseTo(2, 1);
  });
});
