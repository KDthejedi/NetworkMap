import Link from "next/link";
import { SignUpForm } from "./form";

export default function SignUpPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Create account</h2>
      <SignUpForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have one?{" "}
        <Link href="/signin" className="font-medium text-foreground underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
