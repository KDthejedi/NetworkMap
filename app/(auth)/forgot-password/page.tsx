"use client";

import { useState, useTransition } from "react";
import { getSupabaseBrowserClient } from "@/lib/auth/supabase-browser";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) setError(error.message);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="rounded-md border bg-muted/40 p-4 text-sm">
        Check your email for a reset link.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="text-lg font-medium">Reset password</h2>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
