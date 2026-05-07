/**
 * Today's Pulse carousel (spec section 7.5 / 8.2).
 * Renders 3 to 5 ranked recommendations from a daily digest run.
 */
import type { Recommendation } from "@/lib/db/schema";
import Link from "next/link";

export function TodaysPulse({
  recommendations,
}: {
  recommendations: Recommendation[];
}) {
  if (recommendations.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-base font-semibold">Today&apos;s Pulse</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your first digest will appear here once you have contacts and an
          active goal. Tomorrow morning, the agent will produce 3 to 5 actions.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Today&apos;s Pulse</h2>
        <Link
          href="/briefing"
          className="text-sm text-muted-foreground underline"
        >
          Ask
        </Link>
      </header>
      <ul className="space-y-3">
        {recommendations.map((rec) => (
          <li
            key={rec.id}
            className="rounded-md border bg-card p-4 shadow-sm"
            data-recommendation-kind={rec.kind}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {rec.kind === "re_engage" ? "Re engage" : "Expand"}
              </span>
              <span className="text-xs text-muted-foreground">
                priority {Number(rec.priorityScore).toFixed(1)}
              </span>
            </div>
            <p className="mt-2 text-sm">{rec.rationale}</p>
            <div className="mt-3 flex gap-2 text-sm">
              <Link
                href={
                  rec.kind === "re_engage" && rec.contactId
                    ? `/network/contacts/${rec.contactId}`
                    : `/recommendations/${rec.id}`
                }
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
              >
                Open
              </Link>
              <form
                action={`/api/v1/recommendations/${rec.id}/feedback`}
                method="POST"
              >
                <input type="hidden" name="action" value="snoozed" />
                <button className="rounded-md border px-3 py-1.5">
                  Snooze
                </button>
              </form>
              <form
                action={`/api/v1/recommendations/${rec.id}/feedback`}
                method="POST"
              >
                <input type="hidden" name="action" value="dismissed" />
                <button className="rounded-md border px-3 py-1.5">
                  Dismiss
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
