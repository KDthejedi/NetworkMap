"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Cluster, PulseBand } from "@/lib/db/schema";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

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
    pulseBand: PulseBand;
    tier: number;
  }>;
  clusters: Cluster[];
  memberships: Array<{
    contactId: string;
    clusterId: string;
    clusterName: string;
    clusterColor: string;
  }>;
};

type Node = {
  id: string;
  label: string;
  group: "self" | "cluster" | "contact";
  color: string;
  val: number;
};

type Link = { source: string; target: string };

export default function GraphView({ contacts, clusters, memberships }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 520 });

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setSize({ width: e.contentRect.width, height: 520 });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];

    nodes.push({
      id: "__self__",
      label: "You",
      group: "self",
      color: "#111827",
      val: 8,
    });

    for (const c of clusters) {
      nodes.push({
        id: `cluster:${c.id}`,
        label: c.name,
        group: "cluster",
        color: c.color,
        val: 5,
      });
      links.push({ source: "__self__", target: `cluster:${c.id}` });
    }

    for (const ct of contacts) {
      const name = ct.preferredName ?? ct.firstName;
      nodes.push({
        id: ct.id,
        label: ct.lastName ? `${name} ${ct.lastName}` : name,
        group: "contact",
        color: PULSE_COLOR[ct.pulseBand],
        val: ct.tier === 1 ? 3 : 2,
      });
    }
    for (const m of memberships) {
      links.push({
        source: `cluster:${m.clusterId}`,
        target: m.contactId,
      });
    }

    return { nodes, links };
  }, [contacts, clusters, memberships]);

  return (
    <div ref={ref} className="w-full" style={{ height: 520 }}>
      <ForceGraph2D
        width={size.width}
        height={size.height}
        graphData={data}
        nodeLabel={(n: object) => (n as Node).label}
        nodeColor={(n: object) => (n as Node).color}
        nodeVal={(n: object) => (n as Node).val}
        cooldownTicks={80}
        backgroundColor="transparent"
      />
    </div>
  );
}
