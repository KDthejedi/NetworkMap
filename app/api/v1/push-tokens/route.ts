import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { apiError, apiOk } from "@/lib/api/error";

const schema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  platform: z.string().default("web"),
});

export async function POST(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return apiError("VALIDATION_FAILED", "Invalid payload");
  const data = parsed.data;

  await adminDb
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: data.endpoint,
      p256dh: data.p256dh,
      authSecret: data.auth,
      platform: data.platform,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: data.p256dh,
        authSecret: data.auth,
      },
    });
  return apiOk({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return apiError("UNAUTHORIZED", "Sign in required");
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return apiError("VALIDATION_FAILED", "endpoint required");
  await adminDb
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  return apiOk({ ok: true });
}
