import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { goals } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";
import { writeAuditLog } from "@/lib/audit";
import { runGoalRefresh } from "@/lib/agent/workflows/goalRefresh";

export const runtime = "nodejs";

const personaSchema = z.object({
  role: z.string(),
  industry: z.string(),
  seniority: z.string().optional(),
  geography: z.string().nullable().optional(),
  attributes: z.array(z.string()).optional(),
  why: z.string().optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1),
  horizon: z.enum(["d30", "d60", "d90", "m6", "y1", "y_multi"]),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  why_this_matters: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  target_personas: z.array(personaSchema).optional(),
});

export async function GET(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const conds = [eq(goals.userId, userId), sql`${goals.deletedAt} is null`];
  if (status === "active" || status === "paused" || status === "achieved" || status === "abandoned") {
    conds.push(eq(goals.status, status));
  }

  const rows = await adminDb
    .select()
    .from(goals)
    .where(and(...conds))
    .orderBy(desc(goals.createdAt));
  return apiOk({ data: toSnake(rows) });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", parsed.error.issues[0]?.message ?? "Invalid");
  }
  const data = parsed.data;
  const [goal] = await adminDb
    .insert(goals)
    .values({
      userId,
      title: data.title,
      category: data.category,
      horizon: data.horizon,
      priority: data.priority,
      whyThisMatters: data.why_this_matters ?? null,
      targetDate: data.target_date ?? null,
      targetPersonas: data.target_personas ?? [],
    })
    .returning();
  await writeAuditLog({
    userId,
    actor: "user",
    action: "create",
    entityType: "goal",
    entityId: goal.id,
    after: { title: goal.title, priority: goal.priority },
  });
  void runGoalRefresh({ userId, goalId: goal.id }).catch((err) => {
    console.warn("[goals] goal refresh failed:", err);
  });
  return apiOk(toSnake(goal), { status: 201 });
}
