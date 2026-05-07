import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Network Map",
  description: "See who you have, how warm it is, and what to do next.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
