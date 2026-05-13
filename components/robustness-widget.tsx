import Link from "next/link";
import type { RobustnessResult } from "@/lib/robustness";

export function RobustnessWidget({ result }: { result: RobustnessResult }) {
  const topGaps = result.gaps.slice(0, 3);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Robustness</h2>
        <Link href="/robustness" className="text-sm text-muted-foreground underline">
          Details
        </Link>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-4xl font-semibold tabular-nums">{result.score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${result.score}%` }}
          aria-label={`Robustness ${result.score} out of 100`}
        />
      </div>
      {topGaps.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {topGaps.map((g, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-foreground/60">·</span>
              <span>{g.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
