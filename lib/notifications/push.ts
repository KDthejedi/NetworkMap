/**
 * Web push delivery via VAPID. Spec section 3.7 / 11.5.
 * Stores subscriptions per user in push_subscriptions; sends payloads via
 * the Web Push protocol. Falls back silently when VAPID keys are unset.
 */
import webpush from "web-push";
import { adminDb } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:contact@example.com";
  if (!pub || !priv) return;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; deepLink?: string },
) {
  configure();
  if (!configured) return { sent: 0, skipped: true };

  const subs = await adminDb
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authSecret },
        },
        JSON.stringify(payload),
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404/410 => subscription is gone; clean up.
      if (status === 404 || status === 410) {
        await adminDb
          .delete(pushSubscriptions)
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
  return { sent, skipped: false };
}
