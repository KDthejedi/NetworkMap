import { redirect } from "next/navigation";
import { getAuthUserId } from "@/lib/auth/supabase-server";
import { ensureUserProvisioned, isOnboarded } from "@/lib/auth/provision";
import { getSupabaseServerClient } from "@/lib/auth/supabase-server";
import { OnboardingWizard } from "./wizard";

export default async function OnboardingPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect("/signin");

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
    });
  }

  if (await isOnboarded(userId)) redirect("/home");

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <OnboardingWizard
        defaultName={
          (user?.user_metadata?.display_name as string | undefined) ??
          user?.email?.split("@")[0] ??
          ""
        }
      />
    </main>
  );
}
