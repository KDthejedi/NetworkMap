"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await getSupabaseBrowserClient().auth.signOut();
        router.push("/signin");
        router.refresh();
      }}
      className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      Sign out
    </button>
  );
}
