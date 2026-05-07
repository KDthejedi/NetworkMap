import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { clusters } from "@/lib/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

const schema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  icon: z.string().min(1).max(40),
  default_cadence_days: z.number().int().min(1).max(3650),
});

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const rows = await adminDb
    .select()
    .from(clusters)
    .where(and(eq(clusters.userId, userId), sql`${clusters.archivedAt} is null`))
    .orderBy(asc(clusters.sortOrder));
  return apiOk({ data: toSnake(rows) });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return apiError("VALIDATION_FAILED", "Invalid");
  const data = parsed.data;
  const [c] = await adminDb
    .insert(clusters)
    .values({
      userId,
      name: data.name,
      color: data.color,
      icon: data.icon,
      defaultCadenceDays: data.default_cadence_days,
      isSystem: false,
    })
    .returning();
  return apiOk(toSnake(c), { status: 201 });
}
