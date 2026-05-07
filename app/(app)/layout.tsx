import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { ensureUserProvisioned, isOnboarded } from "@/lib/auth/provision";
import { getSupabaseServerClient } from "@/lib/auth/supabase-server";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/home", label: "Home" },
  { href: "/network", label: "Network" },
  { href: "/goals", label: "Goals" },
  { href: "/briefing", label: "Briefing" },
  { href: "/settings", label: "Settings" },
];

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getAuthUserId();
  if (!userId) {
    redirect("/signin");
  }

  // Provision lazily on first visit. Idempotent.
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await ensureUserProvisioned({
      authUserId: user.id,
      email: user.email ?? `${user.id}@unknown.local`,
      displayName:
        (user.user_metadata?.display_name as string | undefined) ??
        user.email?.split("@")[0] ??
        "Member",
      timezone: user.user_metadata?.timezone as string | undefined,
      locale: user.user_metadata?.locale as string | undefined,
    });
  }

  if (!(await isOnboarded(userId))) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:flex">
        <div className="px-4 py-5">
          <Link href="/home" className="text-base font-semibold tracking-tight">
            Network Map
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
