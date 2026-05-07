import Link from "next/link";
import { SignInForm } from "./form";

export default function SignInPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Sign in</h2>
      <SignInForm />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-medium text-foreground underline">
          Create account
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted-foreground underline">
          Forgot password
        </Link>
      </p>
    </div>
  );
}
