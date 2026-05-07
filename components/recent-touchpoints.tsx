import Link from "next/link";
import type { TouchpointChannel } from "@/lib/db/schema";

type Row = {
  id: string;
  occurredAt: Date;
  channel: TouchpointChannel;
  note: string | null;
  contactId: string;
  contactFirstName: string;
  contactLastName: string | null;
};

export function RecentTouchpoints({ touchpoints }: { touchpoints: Row[] }) {
  if (touchpoints.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-base font-semibold">Recent activity</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing logged yet. Add a contact and log your first touchpoint.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold">Recent activity</h2>
      <ul className="divide-y rounded-md border bg-card">
        {touchpoints.map((tp) => (
          <li key={tp.id} className="flex items-baseline justify-between p-3">
            <div>
              <Link
                href={`/network/contacts/${tp.contactId}`}
                className="text-sm font-medium underline"
              >
                {tp.contactFirstName}
                {tp.contactLastName ? ` ${tp.contactLastName}` : ""}
              </Link>
              <p className="text-xs text-muted-foreground">
                {tp.channel.replace(/_/g, " ")}
                {tp.note ? ` – ${tp.note}` : ""}
              </p>
            </div>
            <time className="text-xs text-muted-foreground">
              {new Date(tp.occurredAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}
