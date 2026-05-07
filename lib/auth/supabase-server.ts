/**
 * Server-side Supabase client using @supabase/ssr.
 * Used inside server components, route handlers, and server actions.
 */
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured. See .env.example.",
    );
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>,
      ) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // Server components cannot set cookies; ignore. Middleware refreshes them.
        }
      },
    },
  });
}

/**
 * Returns the authenticated user id (from the verified Supabase JWT) or null.
 * Use this everywhere a route or action needs to know who is calling.
 */
export async function getAuthUserId(): Promise<string | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Returns the authenticated user id or throws. For use in code paths that
 * are unconditionally behind the auth-guarded layout.
 */
export async function requireAuthUserId(): Promise<string> {
  const id = await getAuthUserId();
  if (!id) {
    throw new Error("UNAUTHORIZED");
  }
  return id;
}
