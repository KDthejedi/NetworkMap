"use client";

/**
 * Solar system view. Replaces the previous globe view.
 *
 * Layout:
 *  - You are the sun at the origin.
 *  - Four concentric orbits encode Pulse band (Healthy inner, Dormant outer).
 *  - Each contact is a planet on the ring matching their pulse_band.
 *  - Planet color = first cluster membership color (or neutral fallback).
 *  - Planet size = tier (Level 1 larger than Level 2).
 *  - Angular position derived deterministically from contact.id, so planets
 *    stay put across re renders and refreshes.
 *
 * Spec section 3.4 / 5.3 / 7.9 — Pulse band drives the spatial metaphor.
 */
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Stars, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { Cluster, PulseBand } from "@/lib/db/schema";

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  pulseBand: PulseBand;
  tier: number;
  tieStrength: number;
  lastTouchpointAt: string | null;
  roleTitle: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
};

type Membership = {
  contactId: string;
  clusterId: string;
  clusterName: string;
  clusterColor: string;
};

type Props = {
  contacts: ContactRow[];
  clusters: Cluster[];
  memberships: Membership[];
};

// Distance from the sun, per Pulse band. Inner = closer = healthier.
const ORBIT: Record<PulseBand, number> = {
  Healthy: 5,
  Steady: 9,
  Fading: 14,
  Dormant: 20,
};

const ORBIT_COLOR: Record<PulseBand, string> = {
  Healthy: "#10b981",
  Steady: "#3b82f6",
  Fading: "#f59e0b",
  Dormant: "#6b7280",
};

const DEFAULT_PLANET_COLOR = "#94a3b8";

export default function SolarView({ contacts, memberships }: Props) {
  const [selected, setSelected] = useState<ContactRow | null>(null);

  const clusterColorByContact = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of memberships) {
      if (!m.has(row.contactId)) m.set(row.contactId, row.clusterColor);
    }
    return m;
  }, [memberships]);

  // Group contacts by Pulse band so we can spread them along their ring with
  // even angular spacing within the band (looks balanced) plus a stable seed
  // offset per contact id (looks intentional, not random).
  const planets = useMemo(() => {
    const byBand: Record<PulseBand, ContactRow[]> = {
      Healthy: [],
      Steady: [],
      Fading: [],
      Dormant: [],
    };
    for (const c of contacts) byBand[c.pulseBand].push(c);

    const out: Array<{
      contact: ContactRow;
      x: number;
      y: number;
      z: number;
      color: string;
      radius: number;
    }> = [];
    for (const band of ["Healthy", "Steady", "Fading", "Dormant"] as PulseBand[]) {
      const items = byBand[band];
      const orbit = ORBIT[band];
      const baseStep = items.length > 0 ? (2 * Math.PI) / items.length : 0;
      items.forEach((c, i) => {
        const jitter = (hash(c.id) % 1000) / 1000 - 0.5; // [-0.5, 0.5]
        const angle = baseStep * i + jitter * baseStep * 0.6;
        const x = Math.cos(angle) * orbit;
        const z = Math.sin(angle) * orbit;
        out.push({
          contact: c,
          x,
          y: 0,
          z,
          color: clusterColorByContact.get(c.id) ?? DEFAULT_PLANET_COLOR,
          radius: c.tier === 1 ? 0.55 : 0.38,
        });
      });
    }
    return out;
  }, [contacts, clusterColorByContact]);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-md bg-[#020617]">
      <Canvas
        camera={{ position: [0, 18, 28], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#020617"]} />
        <ambientLight intensity={0.35} />
        <pointLight position={[0, 0, 0]} intensity={2} distance={60} decay={1.4} color="#fbbf24" />
        <pointLight position={[20, 20, 20]} intensity={0.3} />

        <Suspense fallback={null}>
          <Stars radius={120} depth={60} count={2000} factor={3} fade speed={0.4} />
          <Sun />
          {(["Healthy", "Steady", "Fading", "Dormant"] as PulseBand[]).map((band) => (
            <OrbitRing key={band} radius={ORBIT[band]} color={ORBIT_COLOR[band]} label={band} />
          ))}
          {planets.map((p) => (
            <Planet
              key={p.contact.id}
              x={p.x}
              y={p.y}
              z={p.z}
              radius={p.radius}
              color={p.color}
              pulse={p.contact.pulseBand}
              onSelect={() => setSelected(p.contact)}
              isSelected={selected?.id === p.contact.id}
              label={p.contact.preferredName ?? p.contact.firstName}
            />
          ))}
        </Suspense>

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={8}
          maxDistance={70}
          maxPolarAngle={Math.PI / 2.05}
          target={[0, 0, 0]}
        />
        <FrameTilt />
      </Canvas>

      <Legend />

      {selected && (
        <PreviewCard contact={selected} onClose={() => setSelected(null)} />
      )}

      {contacts.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
          No contacts yet. Add one to see them orbit.
        </div>
      )}
    </div>
  );
}

function Sun() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1.6, 48, 48]} />
        <meshStandardMaterial
          emissive="#facc15"
          emissiveIntensity={1.4}
          color="#fbbf24"
          toneMapped={false}
        />
      </mesh>
      <Html center distanceFactor={28} className="pointer-events-none select-none">
        <div className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/90 backdrop-blur">
          You
        </div>
      </Html>
    </group>
  );
}

function OrbitRing({
  radius,
  color,
  label,
}: {
  radius: number;
  color: string;
  label: string;
}) {
  const points = useMemo(() => {
    const arr: [number, number, number][] = [];
    const segments = 128;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      arr.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
    }
    return arr;
  }, [radius]);

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={1}
        transparent
        opacity={0.35}
        dashed={false}
      />
      <Html position={[radius + 0.2, 0, 0]} distanceFactor={28} className="pointer-events-none select-none">
        <div
          className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-medium tracking-wide backdrop-blur"
          style={{ color }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function Planet({
  x,
  y,
  z,
  radius,
  color,
  pulse,
  isSelected,
  onSelect,
  label,
}: {
  x: number;
  y: number;
  z: number;
  radius: number;
  color: string;
  pulse: PulseBand;
  isSelected: boolean;
  onSelect: () => void;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect();
  };
  return (
    <group position={[x, y, z]}>
      <mesh
        onClick={handleClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={isSelected ? color : "#000"}
          emissiveIntensity={isSelected ? 0.6 : 0}
          metalness={0.15}
          roughness={0.55}
        />
      </mesh>
      {/* Pulse-tinted halo for at-risk contacts */}
      {(pulse === "Fading" || pulse === "Dormant") && (
        <mesh>
          <ringGeometry args={[radius * 1.4, radius * 1.7, 32]} />
          <meshBasicMaterial
            color={pulse === "Fading" ? "#f59e0b" : "#9ca3af"}
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
      {(hovered || isSelected) && (
        <Html
          position={[0, radius + 0.6, 0]}
          center
          distanceFactor={20}
          className="pointer-events-none select-none"
        >
          <div className="whitespace-nowrap rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur">
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function FrameTilt() {
  const { camera } = useThree();
  // Camera lookAt origin on first frame.
  camera.lookAt(0, 0, 0);
  return null;
}

function Legend() {
  const items: Array<{ label: PulseBand; color: string }> = [
    { label: "Healthy", color: ORBIT_COLOR.Healthy },
    { label: "Steady", color: ORBIT_COLOR.Steady },
    { label: "Fading", color: ORBIT_COLOR.Fading },
    { label: "Dormant", color: ORBIT_COLOR.Dormant },
  ];
  return (
    <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/40 px-3 py-2 text-[11px] text-white/85 backdrop-blur">
      <div className="mb-1 font-medium tracking-wide">Orbit = Pulse</div>
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: i.color }}
            />
            <span>{i.label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-white/60">Planet color = cluster · size = tier</div>
    </div>
  );
}

function PreviewCard({
  contact,
  onClose,
}: {
  contact: ContactRow;
  onClose: () => void;
}) {
  const days = contact.lastTouchpointAt
    ? Math.floor(
        (Date.now() - new Date(contact.lastTouchpointAt).getTime()) /
          86_400_000,
      )
    : null;
  return (
    <div className="absolute bottom-3 right-3 w-72 rounded-md border border-white/10 bg-card/95 p-4 shadow-lg backdrop-blur">
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
        {contact.city ? ` · ${contact.city}` : ""}
      </p>
      <p className="mt-2 text-xs">
        Pulse <strong>{contact.pulseBand}</strong> · tie {contact.tieStrength}
        {days !== null ? ` · ${days}d ago` : " · no touchpoints"}
      </p>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/network/contacts/${contact.id}`}
          className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
        >
          Open
        </Link>
        <Link
          href={`/network/contacts/${contact.id}#log`}
          className="rounded-md border px-3 py-1 text-xs"
        >
          Log touchpoint
        </Link>
      </div>
    </div>
  );
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
