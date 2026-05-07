import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Network Map</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">
        See who you have, where they are, how warm the relationship is, and
        what to do next based on your goals.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/signup"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create account
        </Link>
        <Link
          href="/signin"
          className="inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
