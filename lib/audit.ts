/**
 * Centralized audit logger (spec section 4.15 / 11.7).
 * Every sensitive mutation and every agent action calls this.
 */
import { adminDb } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export type AuditEntry = {
  userId: string;
  actor: "user" | "agent";
  actorAgentRunId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditLog(entry: AuditEntry) {
  await adminDb.insert(auditLog).values({
    userId: entry.userId,
    actor: entry.actor,
    actorAgentRunId: entry.actorAgentRunId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as object | null,
    after: (entry.after ?? null) as object | null,
  });
}
