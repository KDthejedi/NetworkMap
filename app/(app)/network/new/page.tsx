import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, and, sql } from "drizzle-orm";
import { clusters, contacts } from "@/lib/db/schema";
import { AddContactForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AddContactPage() {
  const userId = await requireAuthUserId();
  const userClusters = await adminDb
    .select()
    .from(clusters)
    .where(and(eq(clusters.userId, userId), sql`${clusters.archivedAt} is null`));

  const tier1 = await adminDb
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.userId, userId),
        eq(contacts.tier, 1),
        sql`${contacts.deletedAt} is null`,
      ),
    );

  return (
    <div className="mx-auto max-w-xl px-6 py-6">
      <h1 className="text-2xl font-semibold">Add contact</h1>
      <AddContactForm clusters={userClusters} tier1={tier1} />
    </div>
  );
}
