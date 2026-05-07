/**
 * Data export. Spec section 9.9 / 11.6.
 *
 * For local dev we run synchronously and return the JSON inline.
 * Production should enqueue an export_jobs row and stream the result to
 * Supabase Storage; the client polls /api/v1/export/jobs/{id}.
 */
import { adminDb } from "@/lib/db/client";
import {
  contacts,
  clusters,
  contactClusters,
  touchpoints,
  goals,
  contactGoals,
  customFields,
  customFieldValues,
  recommendations,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

export const runtime = "nodejs";

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const [
    contactsRows,
    clustersRows,
    contactClustersRows,
    touchpointsRows,
    goalsRows,
    contactGoalsRows,
    customFieldsRows,
    customFieldValuesRows,
    recommendationsRows,
  ] = await Promise.all([
    adminDb.select().from(contacts).where(eq(contacts.userId, userId)),
    adminDb.select().from(clusters).where(eq(clusters.userId, userId)),
    adminDb.select().from(contactClusters).where(eq(contactClusters.userId, userId)),
    adminDb.select().from(touchpoints).where(eq(touchpoints.userId, userId)),
    adminDb.select().from(goals).where(eq(goals.userId, userId)),
    adminDb.select().from(contactGoals).where(eq(contactGoals.userId, userId)),
    adminDb.select().from(customFields).where(eq(customFields.userId, userId)),
    adminDb.select().from(customFieldValues).where(eq(customFieldValues.userId, userId)),
    adminDb.select().from(recommendations).where(eq(recommendations.userId, userId)),
  ]);

  const payload = toSnake({
    exportedAt: new Date().toISOString(),
    user_id: userId,
    contacts: contactsRows,
    clusters: clustersRows,
    contact_clusters: contactClustersRows,
    touchpoints: touchpointsRows,
    goals: goalsRows,
    contact_goals: contactGoalsRows,
    custom_fields: customFieldsRows,
    custom_field_values: customFieldValuesRows,
    recommendations: recommendationsRows,
  });

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="networkmap-${userId}-${new Date().toISOString()}.json"`,
    },
  });
}
