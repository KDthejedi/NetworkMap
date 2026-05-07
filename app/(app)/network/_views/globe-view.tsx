"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Cluster, PulseBand } from "@/lib/db/schema";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

const PULSE_COLOR: Record<PulseBand, string> = {
  Healthy: "#10b981",
  Steady: "#3b82f6",
  Fading: "#f59e0b",
  Dormant: "#9ca3af",
};

type Props = {
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    preferredName: string | null;
    city: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
    tier: number;
    pulseBand: PulseBand;
    tieStrength: number;
    lastTouchpointAt: string | null;
    roleTitle: string | null;
    company: string | null;
  }>;
  clusters: Cluster[];
  memberships: Array<{
    contactId: string;
    clusterId: string;
    clusterName: string;
    clusterColor: string;
  }>;
};

export default function GlobeView({ contacts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });
  const [selected, setSelected] = useState<Props["contacts"][number] | null>(
    null,
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({
          width: entry.contentRect.width,
          height: Math.max(420, entry.contentRect.width * 0.6),
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(
    () =>
      contacts
        .filter(
          (c) => c.latitude !== null && c.longitude !== null,
        )
        .map((c) => ({
          ...c,
          lat: c.latitude!,
          lng: c.longitude!,
          color: PULSE_COLOR[c.pulseBand],
          radius: c.tier === 1 ? 0.4 : 0.25,
        })),
    [contacts],
  );

  const missingLocation = contacts.filter(
    (c) => c.latitude === null || c.longitude === null,
  ).length;

  return (
    <div ref={containerRef} className="relative w-full">
      {points.length === 0 ? (
        <div className="flex h-[420px] items-center justify-center p-8 text-center text-sm text-muted-foreground">
          {contacts.length === 0
            ? "No contacts yet. Add one to see them on the globe."
            : "None of your contacts have a location set yet."}
        </div>
      ) : (
        <Globe
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={0.02}
          pointRadius="radius"
          pointColor="color"
          pointLabel={(d: object) => {
            const p = d as (typeof points)[number];
            return `<div style="font-family:system-ui;color:#fff;background:#0008;padding:6px 8px;border-radius:6px"><strong>${escape(p.firstName)} ${escape(p.lastName ?? "")}</strong><br/>${escape(p.pulseBand)} · ${escape(p.city ?? "")}</div>`;
          }}
          onPointClick={(d: object) => {
            setSelected(d as (typeof points)[number]);
          }}
        />
      )}
      {missingLocation > 0 && (
        <p className="absolute bottom-2 left-2 rounded-md bg-card/80 px-2 py-1 text-xs text-muted-foreground">
          {missingLocation} contact{missingLocation === 1 ? "" : "s"} missing
          location.
        </p>
      )}
      {selected && (
        <PreviewCard
          contact={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PreviewCard({
  contact,
  onClose,
}: {
  contact: Props["contacts"][number];
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-3 right-3 w-72 rounded-md border bg-card p-4 shadow-lg">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">
          {contact.preferredName ?? contact.firstName}
          {contact.lastName ? ` ${contact.lastName}` : ""}
        </h3>
        <button onClick={onClose} className="text-xs text-muted-foreground">
          close
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {contact.roleTitle ?? ""}
        {contact.company ? ` at ${contact.company}` : ""}
      </p>
      <p className="mt-1 text-xs">
        Pulse: <strong>{contact.pulseBand}</strong>
      </p>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/network/contacts/${contact.id}`}
          className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
        >
          Open
        </Link>
        <Link
          href={`/network/contacts/${contact.id}/log`}
          className="rounded-md border px-3 py-1 text-xs"
        >
          Log touchpoint
        </Link>
      </div>
    </div>
  );
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
