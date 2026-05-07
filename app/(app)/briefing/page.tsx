import { requireAuthUserId } from "@/lib/auth/supabase-server";
import { adminDb } from "@/lib/db/client";
import { eq, desc } from "drizzle-orm";
import { briefingSessions } from "@/lib/db/schema";
import { BriefingChat } from "./chat";

export const dynamic = "force-dynamic";

export default async function BriefingPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const userId = await requireAuthUserId();
  const sp = await searchParams;

  const sessions = await adminDb
    .select()
    .from(briefingSessions)
    .where(eq(briefingSessions.userId, userId))
    .orderBy(desc(briefingSessions.updatedAt))
    .limit(20);

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Briefing</h1>
      </header>
      <BriefingChat sessions={sessions} initialSessionId={sp.session ?? null} />
    </div>
  );
}
