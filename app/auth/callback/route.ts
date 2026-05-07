/**
 * OAuth + email confirmation callback.
 * Supabase redirects here with ?code=... ; we exchange for a session, then
 * route to /onboarding (first run) or /home.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/auth/supabase-server";
import { ensureUserProvisioned, isOnboarded } from "@/lib/auth/provision";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/home";

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await ensureUserProvisioned({
        authUserId: data.user.id,
        email: data.user.email ?? `${data.user.id}@unknown.local`,
        displayName:
          (data.user.user_metadata?.display_name as string | undefined) ??
          data.user.email?.split("@")[0] ??
          "Member",
        timezone: data.user.user_metadata?.timezone as string | undefined,
        locale: data.user.user_metadata?.locale as string | undefined,
      });

      const onboarded = await isOnboarded(data.user.id);
      return NextResponse.redirect(
        new URL(onboarded ? next : "/onboarding", url.origin),
      );
    }
  }

  return NextResponse.redirect(new URL("/signin?error=callback_failed", url.origin));
}
