export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Network Map</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            See who you have. Know what to do next.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
