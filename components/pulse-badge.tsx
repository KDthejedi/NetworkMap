import type { PulseBand } from "@/lib/db/schema";

const BAND_CLASS: Record<PulseBand, string> = {
  Healthy: "bg-pulse-healthy/15 text-pulse-healthy",
  Steady: "bg-pulse-steady/15 text-pulse-steady",
  Fading: "bg-pulse-fading/15 text-pulse-fading",
  Dormant: "bg-pulse-dormant/15 text-pulse-dormant",
};

export function PulseBadge({ band }: { band: PulseBand }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BAND_CLASS[band]}`}
      role="status"
      aria-label={`Relationship Pulse: ${band}`}
    >
      <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {band}
    </span>
  );
}
