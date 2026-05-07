import Link from "next/link";
import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, and, desc, sql } from "drizzle-orm";
import { goals } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const userId = await requireAuthUserId();
  const rows = await adminDb
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), sql`${goals.deletedAt} is null`))
    .orderBy(desc(goals.createdAt));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Goals</h1>
        <Link
          href="/goals/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add goal
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No goals yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y rounded-md border bg-card">
          {rows.map((g) => (
            <li key={g.id} className="p-4">
              <div className="flex items-baseline justify-between">
                <Link
                  href={`/goals/${g.id}`}
                  className="text-sm font-medium underline"
                >
                  {g.title}
                </Link>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {g.status} · {g.priority}
                </span>
              </div>
              {g.whyThisMatters && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {g.whyThisMatters}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {g.category.replace(/_/g, " ")} · {g.horizon}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
