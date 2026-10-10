"use client";
import { useMemo } from "react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
type Asset = {
  id: string;
  name: string;
  kind: string;
  system_id: string | null;
};
export default function ImpactGraph({
  assets,
  edges,
  root,
  affected = [],
}: {
  assets: Asset[];
  edges: { source_id: string; target_id: string }[];
  root?: string;
  affected?: string[];
}) {
  const graph = useMemo(() => {
    const selected = new Set(affected);
    const groups = ["SYSTEM", "API", "SERVER", "DATABASE", "BATCH"];
    const nodes = assets.map((a) => {
      const group = groups.indexOf(a.kind);
      const peers = assets.filter((x) => x.kind === a.kind);
      const index = peers.findIndex((x) => x.id === a.id);
      const isRoot = a.id === root,
        impacted = selected.has(a.id);
      return {
        id: a.id,
        data: {
          label: (
            <>
              <div
                style={{
                  fontSize: 8,
                  color: isRoot ? "#ffb3c3" : impacted ? "#f5cc7a" : "#6e94b2",
                  marginBottom: 5,
                  letterSpacing: 1,
                }}
              >
                {a.kind} · {a.id}
              </div>
              <strong>{a.name}</strong>
            </>
          ),
        },
        position: { x: group * 210, y: index * 80 },
        style: {
          width: 177,
          background: isRoot ? "#472137" : impacted ? "#332e24" : "#122237",
          color: "#d4e5f4",
          border: `1px solid ${isRoot ? "#ff729b" : impacted ? "#aa8551" : "#2e4a64"}`,
          boxShadow: isRoot ? "0 0 30px #ff729b25" : "none",
        },
        sourcePosition: "right" as any,
        targetPosition: "left" as any,
      };
    });
    return {
      nodes,
      edges: edges.map((e, i) => ({
        id: `edge-${i}`,
        source: e.source_id,
        target: e.target_id,
        animated:
          !!root && selected.has(e.source_id) && selected.has(e.target_id),
        style: {
          stroke:
            selected.has(e.source_id) && selected.has(e.target_id)
              ? "#d7a45b"
              : "#294157",
          strokeWidth: selected.has(e.source_id) ? 1.6 : 1,
          opacity: root && !selected.has(e.source_id) ? 0.3 : 0.85,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 12,
          height: 12,
          color: "#577b91",
        },
      })),
    };
  }, [assets, edges, root, affected]);
  return (
    <div className="graph-wrap" aria-label="시스템 의존 관계 그래프">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable={false}
        nodesConnectable={false}
        colorMode="dark"
      >
        <Background color="#264057" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
