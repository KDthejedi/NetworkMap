import Link from "next/link";

export function QuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Quick actions</h2>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/network/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add contact
        </Link>
        <Link
          href="/network"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Log touchpoint
        </Link>
        <Link
          href="/briefing"
          className="rounded-md border px-4 py-2 text-sm font-medium"
        >
          Ask
        </Link>
      </div>
    </section>
  );
}
