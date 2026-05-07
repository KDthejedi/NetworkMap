import type { PulseBand } from "@/lib/db/schema";

const BAND_META: Record<
  PulseBand,
  { label: string; bg: string; text: string }
> = {
  Healthy: { label: "Healthy", bg: "bg-pulse-healthy/15", text: "text-pulse-healthy" },
  Steady: { label: "Steady", bg: "bg-pulse-steady/15", text: "text-pulse-steady" },
  Fading: { label: "Fading", bg: "bg-pulse-fading/15", text: "text-pulse-fading" },
  Dormant: { label: "Dormant", bg: "bg-pulse-dormant/15", text: "text-pulse-dormant" },
};

export function PulseHealthSummary({
  summary,
}: {
  summary: Array<{ band: PulseBand; count: number }>;
}) {
  const lookup = new Map(summary.map((s) => [s.band, s.count]));
  const order: PulseBand[] = ["Healthy", "Steady", "Fading", "Dormant"];

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Pulse health</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {order.map((band) => {
          const meta = BAND_META[band];
          const count = lookup.get(band) ?? 0;
          return (
            <div
              key={band}
              className={`rounded-md border p-3 ${meta.bg}`}
              role="group"
              aria-label={`${meta.label}: ${count}`}
            >
              <div className={`text-xs font-medium ${meta.text}`}>
                {meta.label}
              </div>
              <div className="mt-1 text-2xl font-semibold">{count}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
