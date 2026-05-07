import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { customFields } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";
import { toSnake } from "@/lib/api/serialize";

const schema = z.object({
  name: z.string().min(1).max(80),
  data_type: z.enum([
    "text",
    "number",
    "date",
    "boolean",
    "single_select",
    "multi_select",
  ]),
  options: z.array(z.string()).optional(),
});

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const rows = await adminDb
    .select()
    .from(customFields)
    .where(and(eq(customFields.userId, userId), eq(customFields.isArchived, false)));
  return apiOk({ data: toSnake(rows) });
}

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return apiError("VALIDATION_FAILED", "Invalid");
  const data = parsed.data;
  if (
    (data.data_type === "single_select" || data.data_type === "multi_select") &&
    (!data.options || data.options.length === 0)
  ) {
    return apiError("VALIDATION_FAILED", "options required for select types");
  }
  const [field] = await adminDb
    .insert(customFields)
    .values({
      userId,
      name: data.name,
      dataType: data.data_type,
      options: data.options ?? null,
    })
    .returning();
  return apiOk(toSnake(field), { status: 201 });
}
