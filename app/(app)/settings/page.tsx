import Link from "next/link";

const SECTIONS = [
  { href: "/settings/profile", label: "Profile", desc: "Your name, location, timezone." },
  { href: "/settings/clusters", label: "Clusters", desc: "Workplace, family, and custom groups." },
  { href: "/settings/custom-fields", label: "Custom fields", desc: "Add attributes that persist across contacts." },
  { href: "/settings/notifications", label: "Notifications", desc: "Push, in app, quiet hours." },
  { href: "/settings/data", label: "Data export", desc: "Download your network as JSON or CSV." },
  { href: "/settings/account", label: "Account", desc: "Delete your account." },
];

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <ul className="mt-6 divide-y rounded-md border bg-card">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block p-4 hover:bg-accent">
              <div className="text-sm font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{s.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
