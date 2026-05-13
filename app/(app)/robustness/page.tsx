import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { loadAndComputeRobustness } from "@/lib/robustness/load";

export const dynamic = "force-dynamic";

const SEV_CLASS = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-pulse-fading/40 bg-pulse-fading/10 text-pulse-fading",
  low: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
} as const;

export default async function RobustnessPage() {
  const userId = await requireAuthUserId();
  const result = await loadAndComputeRobustness(userId);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Robustness</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How strong and diverse your direct network is right now.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-6">
        <div className="flex items-baseline gap-4">
          <span className="text-6xl font-semibold tabular-nums">
            {result.score}
          </span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Composite of size, active relationships, balance, geographic reach,
          industry breadth, demographic diversity, sphere coverage, and goal
          coverage.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Breakdown</h2>
        <ul className="space-y-2">
          {result.components.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-4 rounded-md border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-xs text-muted-foreground">
                    weight {Math.round(c.weight * 100)}%
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{c.detail}</p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${c.score}%` }}
                    aria-label={`${c.label} ${c.score} out of 100`}
                  />
                </div>
              </div>
              <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                {c.score}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold">Gaps to close</h2>
        {result.gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing flagged. Keep logging touchpoints to keep your score honest.
          </p>
        ) : (
          <ul className="space-y-2">
            {result.gaps.map((g, i) => (
              <li
                key={i}
                className={`rounded-md border p-3 text-sm ${SEV_CLASS[g.severity]}`}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide opacity-70">
                  {g.severity} · {g.category}
                </span>
                <p className="mt-1 text-foreground">{g.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
