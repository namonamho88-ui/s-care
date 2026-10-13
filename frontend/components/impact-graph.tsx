"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, Position, useNodesInitialized, useReactFlow, useStore, type Node, type Edge } from "@xyflow/react";
import AssetContext from "./asset-context";
import { Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "@xyflow/react/dist/style.css";

type Asset = { id: string; name: string; kind: string; system_id: string | null };
type Props = { assets: Asset[]; edges: { source_id: string; target_id: string }[]; root?: string; affected?: string[]; expanded?: boolean; direct?:string[]; api?:(p:string)=>Promise<any> };
const EMPTY: string[] = [];
const kinds: Record<string, string> = { SYSTEM: "업무 시스템", API: "API", SERVER: "서버", DATABASE: "데이터베이스", BATCH: "배치" };

// Refit after node measurement and container resize, including a newly opened dialog.
function AutoFit({ layoutKey }: { layoutKey: string }) {
  const ready = useNodesInitialized();
  const { fitView } = useReactFlow();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  useEffect(() => {
    if (!ready || !width || !height) return;
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.12, maxZoom: 1.15 }));
    return () => cancelAnimationFrame(frame);
  }, [ready, layoutKey, width, height, fitView]);
  return null;
}

function Canvas({ assets, edges, root, affected = EMPTY, direct, api, expanded, fullscreen = false }: Props & { fullscreen?: boolean }) {
  const [directOnly,setDirectOnly]=useState(false);
  const [onlyAffected, setOnlyAffected] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { setOnlyAffected(false); setSelectedId(null); setDirectOnly(false); }, [root]);
  const directIds=useMemo(()=>new Set(direct||edges.filter(e=>e.target_id===root&&affected.includes(e.source_id)).map(e=>e.source_id)),[direct,edges,root,affected]);
  const impacted = useMemo(() => new Set([...(directOnly?[...directIds]:affected), ...(root ? [root] : [])]), [affected, root,directOnly,directIds]);
  const visible = useMemo(() => onlyAffected && root ? assets.filter(a => impacted.has(a.id)) : assets, [assets, onlyAffected, root, impacted]);
  const graph = useMemo(() => {
    const groups = ["SYSTEM", "API", "SERVER", "DATABASE", "BATCH"];
    const ids = new Set(visible.map(a => a.id));
    const nodes: Node[] = visible.map(a => {
      const peers = visible.filter(x => x.kind === a.kind);
      const isRoot = a.id === root, isAffected = impacted.has(a.id), isDirect=directIds.has(a.id);
      return {
        id: a.id,
        ariaLabel: a.name + " · " + (kinds[a.kind] || a.kind) + (isRoot ? " · 장애 발생 지점" : isAffected ? " · 영향 가능성" : ""),
        data: { label: <><div className="graph-node-kind">{kinds[a.kind] || a.kind} · {a.id}</div><strong>{a.name}</strong></> },
        position: { x: Math.max(0, groups.indexOf(a.kind)) * 230, y: peers.findIndex(x => x.id === a.id) * 84 },
        style: { width: 194, background: isRoot ? "#511e25" : isAffected ? (isDirect?"#56321a":"#423c19") : "#242b34", color: "#e3edf7", border: "1px solid " + (isRoot ? "#ff6067" : isAffected ? (isDirect?"#fb923c":"#fde047") : "#64748b") },
        sourcePosition: Position.Right, targetPosition: Position.Left,
      };
    });
    const links: Edge[] = edges.filter(e => ids.has(e.source_id) && ids.has(e.target_id)).map(e => {
      const highlighted = impacted.has(e.source_id) && impacted.has(e.target_id);
      const color = highlighted ? "#e9b76b" : "#536f8a";
      return { id: e.source_id + "-" + e.target_id, source: e.source_id, target: e.target_id,
        animated: !!root && highlighted, style: { stroke: color, strokeWidth: highlighted ? 2 : 1, opacity: root && !highlighted ? 0.3 : 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color } };
    });
    return { nodes, edges: links };
  }, [visible, edges, root, impacted,directIds]);
  const chosen = assets.find(a => a.id === selectedId);
  const layoutKey = graph.nodes.map(n => n.id).join(",");
  return <div className={"graph-canvas " + (fullscreen ? "graph-canvas-full" : "")}>
    <div className="graph-toolbar">
      <div className="flex-row">
        <Button size="sm" variant={onlyAffected ? "outline" : "default"} aria-pressed={!onlyAffected} onClick={() => setOnlyAffected(false)}>전체 자산</Button>
        <Button size="sm" variant={onlyAffected ? "default" : "outline"} aria-pressed={onlyAffected} disabled={!root} onClick={() => setOnlyAffected(true)}>영향 자산만</Button>
        <label className="small">영향 범위<select aria-label="영향 범위" disabled={!root} value={directOnly?"direct":"all"} onChange={e=>setDirectOnly(e.target.value==="direct")}><option value="all">전체 영향</option><option value="direct">직접 영향</option></select></label>
        <span className="small muted" role="status">자산 {graph.nodes.length}개 · 관계 {graph.edges.length}개</span>
      </div>
      <span className="small muted">{root ? "분석 기준: " + (assets.find(a => a.id === root)?.name || root) : "장애를 선택하면 영향 범위가 강조됩니다."}</span>
    </div>
    <div className={"graph-wrap " + (expanded ? "graph-expanded" : "")} aria-label="시스템 의존 관계 그래프">
      {assets.length === 0 ? <div className="empty">표시할 자산이 없습니다. 데이터 연결 상태를 확인하세요.</div> : <ReactFlowProvider key={layoutKey}>
        <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.1} maxZoom={2.5}
          nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} colorMode="dark"
          onNodeClick={(_, node) => setSelectedId(node.id)}
          ariaLabelConfig={{ "controls.zoomIn.ariaLabel": "그래프 확대", "controls.zoomOut.ariaLabel": "그래프 축소", "controls.fitView.ariaLabel": "전체 맞춤" }}>
          <AutoFit layoutKey={layoutKey} />
          <Background color="#264057" gap={22} size={1} />
          <Controls showInteractive={false} fitViewOptions={{ padding: 0.12, maxZoom: 1.15 }} />
        </ReactFlow>
      </ReactFlowProvider>}
    </div>
    <div className="graph-info" aria-live="polite">
      {chosen ? <><strong>{chosen.name}</strong><span>{kinds[chosen.kind] || chosen.kind} · {chosen.id} · {chosen.id === root ? "장애 발생 지점" : impacted.has(chosen.id) ? "영향 가능성 — 실제 장애 확정 아님" : "분석 영향 범위 밖"}</span><span>의존하는 자산 {edges.filter(e => e.source_id === chosen.id).length}개 · 이 자산을 사용하는 자산 {edges.filter(e => e.target_id === chosen.id).length}개</span></> : <span>자산을 클릭하면 종류와 연결 수를 확인할 수 있습니다. 드래그로 이동하고 휠 또는 + / − 버튼으로 확대·축소하세요.</span>}
    </div>
    {chosen&&api&&<AssetContext key={chosen.id} id={chosen.id} api={api}/>}
    <div className="graph-legend small"><span className="text-rose-300">● 장애 지점</span><span style={{color:"#fb923c"}}>● 직접 영향 가능</span><span style={{color:"#fde047"}}>● 간접 영향 가능</span><span>● 범위 밖</span><span>화살표: 사용하는 자산 → 의존 자산 · 장애 영향은 반대 방향으로 최대 6단계 탐색</span></div>
  </div>;
}
export default function ImpactGraph(props: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Open before React Flow's passive measurement effects. Measuring children of
  // a closed dialog can otherwise lock its initial fit to a zero-sized viewport.
  useLayoutEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = previousOverflow; trigger.current?.focus(); };
  }, [open]);
  return <div className="impact-graph">
    <div className="graph-open"><span className="small muted">시스템 간 의존 관계와 장애 영향 범위를 확인합니다.</span><Button ref={trigger} size="sm" variant="outline" onClick={() => setOpen(true)}><Maximize2 size={15} />전체화면</Button></div>
    <Canvas {...props} />
    {open && <dialog ref={dialog} className="graph-dialog" aria-label="온톨로지 전체화면" onCancel={event => { event.preventDefault(); setOpen(false); }}>
      <header className="graph-dialog-head"><div><h2>온톨로지 · 시스템 의존 관계</h2><p className="small muted">100% 가상 자산 · 영향 가능성과 실제 장애를 구분하세요.</p></div><Button variant="outline" onClick={() => setOpen(false)} autoFocus><X size={16} />전체화면 닫기 · Esc</Button></header>
      <Canvas {...props} fullscreen />
    </dialog>}
  </div>;
}
