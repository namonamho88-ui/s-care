"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Activity,
  BrainCircuit,
  LayoutDashboard,
  History,
  BookOpen,
  ShieldCheck,
  Network,
  Play,
  Plus,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  Server,
  CheckCircle2,
  Search,
  LogOut,
  X,
  Download,
  RefreshCw,
  GitBranch,
  Radio,
  Bot,
  Database,
  FileText,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ManualKnowledge from "@/components/manual-knowledge";
import DemoSettings from "@/components/demo-settings";
import ModelWarmup from "@/components/model-warmup";
import { usePageActivity } from "@/components/use-page-activity";
import { isIncidentProcessing } from "@/lib/page-activity.mjs";
import OperationsPanel from "@/components/operations-panel";
import SkillEditor from "@/components/skill-editor";
import AccountCenter from "@/components/account-center";
import ManualCenter from "@/components/manual-center";
import DashboardWorkbench from "@/components/dashboard-workbench";
import IncidentWorkflow from "@/components/incident-workflow";
import MessageIntake from "@/components/message-intake";
import PaginatedList, { RemoteList, useRemotePage } from "@/components/pagination";
import TechnologyGuide, { TechnologyContext } from "@/components/technology-guide";
import { stageTechnologyLabel } from "@/lib/technology-guide.mjs";
import { stageLabel, eventStateLabel } from "@/lib/incident-guide.mjs";
import { categoryLabel, resultCategory, mergeIncidentEvents, mergeIncidentSnapshot } from "@/lib/analysis-performance.mjs";
const ImpactGraph = dynamic(() => import("@/components/impact-graph"), {
  ssr: false,
});
type Row = Record<string, any>;
const types = ["RESOURCE", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"];
const departments = [
  "PLATFORM",
  "DATABASE",
  "NETWORK",
  "APPLICATION",
  "SECURITY",
];
const typeLabels: Row = {
  RESOURCE: "자원 부족",
  DATABASE: "데이터베이스",
  NETWORK: "네트워크",
  APPLICATION: "애플리케이션",
  SECURITY: "보안",
  PENDING: "분석 대기",
};
const deptLabels: Row = {
  PLATFORM: "플랫폼운영",
  DATABASE: "DB운영",
  NETWORK: "네트워크운영",
  APPLICATION: "업무개발",
  SECURITY: "보안운영",
};
const statusLabels: Row = {
  REGISTERED: "접수",
  ANALYZING: "분석 중",
  NEEDS_REVIEW: "판단 확인",
  WAITING_APPROVAL: "승인 대기",
  RECOVERING: "복구 검증",
  RESOLVED: "복구 완료",
  CLOSED: "종료",
  CANCELLED: "강제 종료",
  FAILED: "실행 실패",
  REJECTED: "승인 거부",
};
const NO_AFFECTED: string[] = [];
const agents = [
  "incident",
  "diagnosis",
  "knowledge",
  "impact",
  "recovery",
  "report",
];
const agentLabels = [
  "업무 조정",
  "원인 분석",
  "지식 검색",
  "영향 분석",
  "복구 검증",
  "보고서 작성",
];
const formatTime = (s: string) =>
  new Date(
    s.endsWith?.("Z") ? s : s.replace(" ", "T") + (s.includes("+") ? "" : "Z"),
  ).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });
const parse = (s: any) => {
  if (typeof s !== "string") return s;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};
async function api(path: string, method = "GET", body?: any) {
  const res = await fetch("/api" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401 && path !== "/session") window.dispatchEvent(new Event("brain-session-expired"));
  if (!res.ok)
    throw Object.assign(new Error(data.error || data.message || "요청을 처리하지 못했습니다."),{status:res.status});
  return data;
}
function Chip({
  children,
  tone = "",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={"chip " + tone}>{children}</span>;
}
function Status({ value }: { value: string }) {
  return (
    <Chip
      tone={
        ["FAILED", "REJECTED", "CANCELLED"].includes(value)
          ? "red"
          : ["NEEDS_REVIEW", "WAITING_APPROVAL"].includes(value)
            ? "amber"
            : ["CLOSED", "RESOLVED"].includes(value)
              ? "green"
              : "cyan"
      }
    >
      {statusLabels[value] || value}
    </Chip>
  );
}
function Json({
  value,
  label = "원본 증적 보기",
}: {
  value: any;
  label?: string;
}) {
  return (
    <details>
      <summary className="small">{label}</summary>
      <pre>{JSON.stringify(parse(value), null, 2)}</pre>
    </details>
  );
}
function Panel({
  title,
  extra,
  children,
  body = true,
  point,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  body?: boolean;
  point?: { id: string; label: string };
}) {
  return (
    <section className={"panel" + (point ? " guide-target" : "")} id={point?.id} tabIndex={point ? -1 : undefined}>
      <div className="panel-head">
        <h2>{title}</h2>
        {extra}
      </div>
      <div className={body ? "panel-body" : ""}>{point && <p className="guide-point">{point.label}</p>}{children}</div>
    </section>
  );
}
function Timeline({ events }: { events: Row[] }) {
  return (
    <div className="timeline">
      {events.length ? (
        events.map((e) => (
          <div
            key={e.id}
            className={
              "event " +
              (e.state === "COMPLETED"
                ? "done"
                : e.state === "RUNNING"
                  ? "running"
                  : ["WAITING", "NEEDS_REVIEW"].includes(e.state)
                    ? "wait"
                    : "fail")
            }
          >
            <div className="event-top">
              <h3>{stageLabel(e.stage)} <span className="muted small">· {eventStateLabel(e.state)}</span></h3>
              <small className="mono">
                {formatTime(e.created_at).slice(-8)}
              </small>
            </div>
            {stageTechnologyLabel(e.stage) && <small className="event-technology">사용 기술 · {stageTechnologyLabel(e.stage)}</small>}
            <p>{e.message}</p>
            <Json value={e.data_json} />
          </div>
        ))
      ) : (
        <div className="empty">
          가상 장애를 발생시키면
          <br />
          백엔드 실행 이벤트가 이곳에 도착합니다.
        </div>
      )}
    </div>
  );
}
function Decision({ d }: { d: Row | null }) {
  if (!d) return <div className="empty">Jev 판단을 기다리고 있습니다.</div>;
  return (
    <>
      <div className={"banner " + (d.simulated ? "" : "good")}>
        <div className="flex-row">
          <BrainCircuit size={15} />
          <strong>
            {categoryLabel(resultCategory(d))}
          </strong>
        </div>
        {d.fallback && (
          <div className="small">
            Local jevos 연결 실패 후 모의 판단으로 전환했습니다. {d.fallbackReason}
          </div>
        )}
      </div>
      <div className="flex-row">
        <Chip tone={d.simulated ? "amber" : "cyan"}>{d.provider}</Chip>
        <span className="mono small muted">
          {d.model} · {d.latencyMs} ms
        </span>
      </div>
      <div className="decision-grid">
        <div>
          <small>장애 유형</small>
          <strong>{typeLabels[d.type] || d.type}</strong>
        </div>
        <div>
          <small>대응 우선순위</small>
          <strong>
            {d.severity} · {d.priority}순위
          </strong>
        </div>
        <div>
          <small>추천 담당 부서</small>
          <strong>{deptLabels[d.department] || d.department}</strong>
        </div>
        <div>
          <small>판단 신뢰도</small>
          <strong>{Math.round(d.confidence * 100)}%</strong>
          <div className="confidence">
            <i style={{ width: `${d.confidence * 100}%` }} />
          </div>
        </div>
        <div>
          <small>관측 근거 충분도</small>
          <strong>{Math.round((d.evidenceScore || 0) * 100)}%</strong>
        </div>
        <div>
          <small>재발 의심</small>
          <strong>{d.recurrence ? "반복 패턴 감지" : "신규 패턴"}</strong>
        </div>
      </div>
      <Json value={d} label="관측 근거 · 모델 응답 확률 보기" />
    </>
  );
}
function AgentResult({ task }: { task: Row }) {
  const data = parse(task.result_json)?.artifacts?.[0]?.parts?.[0]?.data;
  if (!data) return null;
  if (task.agent === "diagnosis") return <div className="mt-3">
    <Chip tone={data.simulated ? "amber" : "cyan"}>원인 후보 · {categoryLabel(resultCategory(data))}</Chip>
    <p className="mt-2"><strong>{data.causeLabel}</strong></p>
    <p className="small muted">신뢰도 {Math.round(data.confidence * 100)}% · 근거 {Math.round(data.evidenceScore * 100)}%</p>
    <p className="mono small muted">{data.provider} · {data.model} · {data.latencyMs} ms</p>
    {data.needsReview && <p className="small text-amber-200">원본 모델 판단: 담당자 검토가 필요한 가설</p>}
    {data.fallback && <p className="small text-amber-200">{data.fallbackReason}</p>}
  </div>;
  if (task.agent === "knowledge") return <div className="mt-3">
    <Chip tone={data.simulated ? "amber" : "cyan"}>지식 검색 · {categoryLabel(resultCategory(data))}</Chip>
    <p className="small mt-2">{data.explanation}</p>
    <p className="small muted">승인된 해결 절차 {data.skills?.length || 0}개 · 매뉴얼 {data.manuals?.length || 0}개</p>
    <p className="mono small muted">{data.provider} · {data.latencyMs} ms</p>
    {data.fallback && <p className="small text-amber-200">대체 실행: {data.fallbackReason}</p>}
  </div>;
  return null;
}
export default function Home() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [user, setUser] = useState<Row>({});
  const isDemo=user.role==="DEMO_ADMIN";
  const isAdmin = user.role === "ADMIN" || isDemo;
  const [loginMode, setLoginMode] = useState("login"), [loginName, setLoginName] = useState(""), [password, setPassword] = useState(""), [inviteCode, setInviteCode] = useState("");
  const [syncProgress, setSyncProgress] = useState("");
  const [notice, setNotice] = useState("");
  const [requestLabel, setRequestLabel] = useState("");
  const [view, setView] = useState("dashboard"),
    [config, setConfig] = useState<Row>({}),
    [catalog, setCatalog] = useState<Row>({
      assets: [],
      operators: [],
      scenarios: [],
      manuals: [],
    }),
    [graph, setGraph] = useState<Row>({ nodes: [], edges: [] }),
    [dashboard, setDashboard] = useState<Row>({}),
    [incidents, setIncidents] = useState<Row[]>([]),
    [skills, setSkills] = useState<Row[]>([]);
  const [historyRevision,setHistoryRevision]=useState(0);
  const [showDeleted,setShowDeleted]=useState(false);
  const evaluationPage=useRemotePage("/evaluations",api,auth===true&&isAdmin&&view==="harness",historyRevision,user.id||"");
  const auditPage=useRemotePage("/audit",api,auth===true&&isAdmin&&view==="harness",historyRevision,user.id||"");
  const [mode, setMode] = useState("DEMO"),
    [provider, setProvider] = useState("LOCAL"),
    [scenario, setScenario] = useState("SCN-01"),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [drawer, setDrawer] = useState(false),
    [live, setLive] = useState(false),
    [online, setOnline] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [messageOpen, setMessageOpen] = useState(false),
    [search, setSearch] = useState(""),
    [filterType, setFilterType] = useState(""),
    [filterSystem, setFilterSystem] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [newTitle, setNewTitle] = useState(""),
    [newObservations, setNewObservations] = useState(""),
    [newAsset, setNewAsset] = useState("CMP-01");
  const keepLive = usePageActivity(incidents.some(isIncidentProcessing) || isIncidentProcessing(detail));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const detailRef = useRef(detail);
  detailRef.current = detail;
  const filtered = !!(filterType || filterSystem || from || to);
  const refreshVersion = useRef(0);
  const detailVersion = useRef(0);
  const detailRequest = useRef<{ id: string; promise: Promise<any> } | null>(null);
  const resetFilters = () => { setFilterType(""); setFilterSystem(""); setFrom(""); setTo(""); setSearch(""); };
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    if (from && to && from > to) throw new Error("시작일은 종료일보다 늦을 수 없습니다.");
    const q = new URLSearchParams({
      type: filterType,
      system: filterSystem,
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    const [d, i, k, c] = await Promise.all([
      api("/dashboard?" + q),
      api("/incidents?" + q + (isAdmin && view === "incidents" && showDeleted ? "&deleted=true" : "")),
      view === "knowledge" ? api("/skills") : Promise.resolve(null),
      view === "knowledge" ? api("/config") : Promise.resolve(null),
    ]);
    if (version !== refreshVersion.current) return;
    setDashboard(d);
    setIncidents(i);
    if(k)setSkills(k);
    if(c)setConfig(c);
    setOnline(true);
  }, [filterType, filterSystem, from, to, isAdmin, view, showDeleted]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const loadDetail = useCallback(async (id: string, fresh = false) => {
    // Replayed SSE events can arrive in a burst. Share a pending read instead of
    // queuing many requests that delay the first visible result.
    if (!fresh && detailRequest.current?.id === id) return detailRequest.current.promise;
    const version = ++detailVersion.current;
    const promise = api("/incidents/" + id).then(d => {
      if (selectedRef.current === id && version === detailVersion.current) setDetail(current=>mergeIncidentSnapshot(d,current));
      return d;
    }).finally(() => {
      if (detailRequest.current?.promise === promise) detailRequest.current = null;
    });
    detailRequest.current = { id, promise };
    return promise;
  }, []);
  const action = async (fn: () => Promise<any>, successMessage = "요청이 처리되었습니다.", label = "요청을 서버에서 처리 중") => {
    setBusy(true);
    setRequestLabel(label);
    setError("");
    setNotice("");
    try {
      await fn();
      setHistoryRevision(n=>n+1);
      setRequestLabel("처리 결과와 다음 단계 확인 중");
      setNotice(successMessage);
      try {
        await refresh();
        if (selectedRef.current) await loadDetail(selectedRef.current);
      } catch (e) {
        setError("요청은 처리됐지만 화면 갱신에 실패했습니다. " + (e as Error).message);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setRequestLabel("");
    }
  };
  const clearSession = useCallback(() => {
    ++refreshVersion.current; setAuth(false); setUser({}); setToken(""); setPassword(""); setInviteCode(""); setSelected(null); setDetail(null); setDrawer(false); setCreateOpen(false); setMessageOpen(false); setView("dashboard"); setIncidents([]); setSkills([]); setShowDeleted(false);
  }, []);
  useEffect(() => {
    const expired = () => { if (auth !== true) return; clearSession(); setError("세션이 만료되었거나 폐기되었습니다. 다시 로그인하세요."); };
    window.addEventListener("brain-session-expired", expired);
    return () => window.removeEventListener("brain-session-expired", expired);
  }, [clearSession, auth]);
  useEffect(()=>{if(!auth||!isDemo||!keepLive)return;const check=()=>{void api("/auth/me").catch(()=>{});};check();const timer=setInterval(check,5000);return()=>clearInterval(timer);},[auth,isDemo,keepLive]);
  useEffect(() => {
    api("/config").catch(async(error)=>{if(error.status!==401)throw error;const response=await fetch("/api/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"demo"})});if(!response.ok)throw new Error("로그인이 필요합니다.");return api("/config");})
      .then((c) => {
        setConfig(c);
        setUser(c.user || {});
        setProvider(c.defaultProvider);
        setAuth(true);
      })
      .catch(() => setAuth(false));
  }, []);
  useEffect(() => {
    if (!auth) return;
    Promise.all([api("/catalog"), api("/graph")])
      .then(([c, g]) => {
        setCatalog(c);
        setGraph(g);
      })
      .catch((e) => setError("기초 정보 조회 실패: " + e.message));
  }, [auth]);
  useEffect(() => {
    if (!auth || !keepLive) return;
    refresh().catch((e) => {
      setOnline(false);
      setError("화면 정보 조회 실패: " + e.message);
    });
    const interval = setInterval(
      () =>
        refresh().catch((e) => {
          setOnline(false);
          setError("자동 새로고침 실패: " + e.message);
        }),
      60000,
    );
    return () => clearInterval(interval);
  }, [auth, refresh, keepLive]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    if (!keepLive) return;
    setDetail(current=>current?.id===selected?current:null);
    loadDetail(selected).catch((e) => setError("장애 상세 조회 실패: " + e.message));
    const source = new EventSource("/api/incidents/" + selected + "/events");
    let connected=false, lastFallback=Date.now();
    source.onopen = () => {connected=true;setLive(true);};
    source.onerror = () => {connected=false;setLive(false);};
    let stageTimer: ReturnType<typeof setTimeout> | undefined;
    let updateLists=false;
    let loading=false, refreshPending=false, disposed=false;
    const refreshStages = () => {
      stageTimer=undefined;
      if(loading){refreshPending=true;return;}
      loading=true;
      // Reuse the initial/polling read, then catch up once after it finishes.
      // SSE rows still render immediately; replay must not start a second HTTP read.
      if(detailRequest.current?.id===selected)refreshPending=true;
      loadDetail(selected).catch((e) => setError("장애 상세 갱신 실패: " + e.message)).finally(()=>{
        loading=false;
        if(refreshPending&&!disposed){refreshPending=false;stageTimer=setTimeout(refreshStages,100);}
      });
      if(updateLists){updateLists=false;refreshRef.current().catch((e) => {setOnline(false);setError("실시간 화면 갱신 실패: " + e.message);});}
    };
    source.addEventListener("stage", (event) => {
      try{const row=JSON.parse((event as MessageEvent).data);updateLists ||= ["INCIDENT","REVIEW","APPROVAL","HISTORY","CLOSE","FORCE_STOP","MANAGEMENT","FAILURE","EDIT"].includes(row.stage);
        setDetail(current=>current?.id===selected?mergeIncidentEvents(current,[row]):current);
      }catch{}
      // Render each received stage immediately; coalesce snapshots without starving them.
      if(!stageTimer)stageTimer=setTimeout(refreshStages,100);
    });
    // Healthy SSE is the detail source. Poll only after a disconnected grace period.
    const interval = setInterval(() => {
      const active=detailRef.current?.id===selected&&["REGISTERED","ANALYZING","RECOVERING"].includes(detailRef.current.status);
      if(!connected && Date.now()-lastFallback>=(active?2000:30000)){lastFallback=Date.now();loadDetail(selected).catch(() => setLive(false));}
    }, 1000);
    return () => {
      disposed=true;
      clearInterval(interval);
      clearTimeout(stageTimer);
      source.close();
      setLive(false);
    };
  }, [selected, loadDetail, keepLive]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 12000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (!drawer && !createOpen && !messageOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector('[role="dialog"]');
    const controls = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select,textarea,a[href]",
        ) || [],
      ).filter((x) => x.getClientRects().length);
    controls()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      // Native graph dialogs own keyboard focus and Escape while in the top layer.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        setDrawer(false);
        setCreateOpen(false);
        setMessageOpen(false);
      }
      if (e.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [drawer, createOpen, messageOpen]);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api("/session", "POST", loginMode === "admin" ? { mode: "admin", token } : { mode: loginMode, login: loginName, password, inviteCode });
      setUser(result.user); setToken(""); setPassword(""); setInviteCode("");
      setAuth(true);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openIncident(id: string) {
    setSelected(id);
    setDrawer(true);
  }
  async function simulate() {
    await action(async () => {
      const r = await api("/simulate", "POST", {
        scenarioId: scenario,
        mode,
        provider: mode === "DEMO" ? "MOCK" : provider,
      });
      setSelected(r.id);
      setDrawer(true);
      setView("dashboard");
    }, "장애가 접수되었습니다. 분석 단계로 이동합니다.", "가상 장애 접수 및 분석 시작 요청 중");
  }
  const visible = incidents.filter((i) =>
    `${i.title} ${i.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const current = detail;
  const dayEntries = Object.entries(dashboard.byDay || {}).slice(-14) as [
    string,
    number,
  ][];
  const title: Row = {
    dashboard: "S-CARE · AI 장애 대응 관제센터",
    ontology: "시스템 연결과 영향 분석",
    incidents: "장애 이력 & 보고서",
    knowledge: "해결 지식 · 해결 절차 관리",
    harness: "AI 품질 관리",
    operations: "관리자 운영 현황",
    guide: "사용 안내 · 역할별 매뉴얼",
    technology: "사용 기술 · 역할 안내",
    accounts: isAdmin ? "계정 & 권한 관리" : "내 계정",
  };
  const descriptions: Row = {
    dashboard: "문자 한 통에서 분석·승인·복구까지, 안내에 따라 장애 대응을 경험하세요.",
    operations: "상세 운영 지표와 처리 시간, 알림, 저장된 작업을 확인합니다.",
    ontology: "시스템이 무엇에 의존하는지 확인하고, 선택한 장애의 영향 가능성을 전체화면으로 살펴봅니다.",
    incidents: "장애를 검색하고 조치 후기·재발 방지 대책·보고서를 확인합니다.",
    knowledge: "해결 방법을 재사용하는 공간입니다. 검토한 해결 절차만 승인하고 Hermes 게시 상태를 확인하세요.",
    harness: "AI의 실행 제한과 승인 기록을 확인하고 가상 시나리오로 판단 정확도를 평가합니다.",
    guide: "처음 사용하는 분은 사용자용부터, 승인과 환경 운영 담당자는 관리자용을 확인하세요.",
    technology: "각 기술이 쓰이는 단계와 역할, 실제 AI와 내부 기능의 차이를 확인합니다.",
    accounts: "개인 계정과 로그인 정보를 관리합니다. 권한은 서버에서도 검사합니다.",
  };
  const canEdit = !!detail && (isAdmin || (user.operatorId && user.operatorId === detail.owner_id));
  if (auth === null)
    return (
      <div className="login">
        <div className="loading flex-row">
          <BrainCircuit /> 관제센터 연결 중
        </div>
      </div>
    );
  if (!auth)
    return (
      <div className="login">
        <form className="login-card" onSubmit={login}>
          <div className="brand-icon">
            <BrainCircuit size={23} />
          </div>
          <div className="eyebrow" style={{ marginTop: 25 }}>
            S-CARE · AI 장애 대응
          </div>
          <h1>
            S-CARE
          </h1>
          <p>가상 금융 IT 환경에서 장애 판단부터 복구 검증까지.<br />개인 계정으로 업무를 시작하세요.</p>
          <div className="tabs mb-4" role="tablist" aria-label="로그인 방식">
            {[["login", "개인 계정"], ["activate", "초대 활성화"], ["admin", "관리자 초기 설정"]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={loginMode === id} className={"tab " + (loginMode === id ? "active" : "")} onClick={() => { setLoginMode(id); setError(""); setToken(""); setPassword(""); setInviteCode(""); }}>{label}</button>)}
          </div>
          {loginMode === "admin" ? <label>관리자 토큰<input aria-label="관리자 토큰" type="password" required value={token} onChange={e => setToken(e.target.value)} autoComplete="off" /></label> : <>
            <label>아이디<input required value={loginName} maxLength={60} onChange={e => setLoginName(e.target.value)} autoComplete="username" autoCapitalize="none" /></label>
            {loginMode === "activate" && <label className="mt-3">초대 코드<input required value={inviteCode} maxLength={100} onChange={e => setInviteCode(e.target.value)} autoComplete="off" /></label>}
            <label className="mt-3">{loginMode === "activate" ? "새 비밀번호" : "비밀번호"}<input type="password" required minLength={loginMode === "activate" ? 12 : undefined} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete={loginMode === "activate" ? "new-password" : "current-password"} /></label>
          </>}
          <Button className="w-full mt-5" disabled={busy}>{busy ? "연결 중…" : loginMode === "activate" ? "계정 활성화 & 시작" : "관제센터 시작"}<ArrowUpRight size={16} /></Button>
          <p className="small" style={{ margin: "20px 0 0" }}>{loginMode === "admin" ? "첫 관리자 계정 생성 또는 계정 복구 시에만 토큰을 사용하세요." : loginMode === "activate" ? "관리자에게 받은 24시간 유효한 1회용 코드와 새 비밀번호(12~128자)를 입력하세요." : "계정이 없거나 비밀번호를 잊으셨다면 관리자에게 초대 코드 발급을 요청하세요."}<br />모든 업무 자산·담당자·장애·지표는 가상 데이터입니다.</p>
          {error && (
            <div role="alert" className="banner error mt-4">
              {error}
            </div>
          )}
        </form>
      </div>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <BrainCircuit size={23} />
          </div>
          <div>
            <strong>S-CARE</strong>
            <small>AI 장애 대응 플랫폼</small>
          </div>
        </div>
        <div className="nav-label">업무 공간</div>
        <nav>
          {[
            ["dashboard", LayoutDashboard, "통합 관제"],
            ["ontology", Network, "시스템 영향도"],
            ["incidents", History, "장애 이력"],
            ["knowledge", BookOpen, "해결 지식"],
            ["technology", BrainCircuit, "사용 기술"],
            ["guide", FileText, "사용 안내"],
            ...(!isAdmin ? [["accounts", ShieldCheck, "내 계정"]] : []),
          ].filter(([id]) => isAdmin || id !== "harness").map(([id, Icon, label]) => (
            <button
              key={id as string}
              className={"nav-button " + (view === id ? "active" : "")}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id as string)}
            >
              {typeof Icon !== "string" && <Icon size={17} />}
              <span>{label as string}</span>
            </button>
          ))}
        </nav>
        {isAdmin && <details className="admin-navigation" open={['harness','operations','accounts'].includes(view) || undefined}>
          <summary>관리자 메뉴</summary>
          <nav aria-label="관리자 메뉴">{[['operations','운영 현황'],['harness','AI 품질 관리'],...(!isDemo?[['accounts','계정 관리']]:[])].map(([id,label])=><button key={id} className={'nav-button '+(view===id?'active':'')} aria-current={view===id?'page':undefined} onClick={()=>setView(id)}><ShieldCheck size={16}/><span>{label}</span></button>)}</nav>
        </details>}
        <div className="nav-label" style={{ marginTop: 30 }}>
          연결된 기술
        </div>
        <div className="sidebar-layers px-3 space-y-4 small muted">
          <div className="flex-row">
            <Database size={13} />
            {config.database}
          </div>
          <div className="flex-row">
            <Network size={13} />
            {config.graph}
          </div>
          <div className="flex-row">
            <GitBranch size={13} />
            A2A {config.a2a}
          </div>
        </div>
        <div className="side-bottom">
          <Chip tone="amber">모든 데이터는 가상입니다</Chip>
          <p className="small muted mt-3">
            금융 IT 혁신 서비스 시연
            <br />
            {isAdmin ? "관리자" : "일반 사용자"} 시연 환경 · v3.0
          </p>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="muted small">업무 공간</span>
            <ChevronRight size={12} />
            <span>가상 금융 IT 운영센터</span>
            <span className="divider" />
            <Chip tone={!keepLive ? "amber" : online ? "green" : "red"}>
              <span className="live-dot" />
              {!keepLive ? "자동 갱신 일시 중지" : online ? "서버 연결됨" : "서버 연결 끊김"}
            </Chip>
          </div>
          <div className="flex-row">
            <span className="mono small muted">한국 시간</span>
            <span className="small">{user.displayName}</span>{isDemo&&<Chip tone="amber">시연모드 활성화</Chip>}<Chip>{isAdmin ? "관리자" : "사용자"}</Chip>
            <button
              aria-label={isDemo?"시연 나가기 · 계정 로그인":"로그아웃"}
              className="p-2 muted"
              onClick={async () => {
                try { await api("/session", "DELETE"); clearSession(); } catch (e) { setError((e as Error).message); }
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>
        {!keepLive && <p className="small muted" role="status" style={{margin:"8px 18px"}}>자동 새로고침 일시 중지 · 화면을 조작하면 재개됩니다.</p>}
        <main className={"page" + (view === "dashboard" ? " dashboard-page" : "")}>
          <div className="heading">
            <div>
              <div className="eyebrow">장애 대응 · {title[view]}</div>
              <h1>{title[view]}</h1>
              <p>{descriptions[view]}</p>
            </div>
            {view !== "dashboard" && <div className="flex-row" style={{flexWrap:"wrap"}}><Button variant="outline" onClick={() => setMessageOpen(true)}>문자 붙여넣기</Button>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              장애 직접 등록
            </Button></div>}
          </div>
          {filtered && ["dashboard", "incidents", "ontology"].includes(view) && <div className="filter-notice" role="status"><span>집계 필터 적용 중 · {typeLabels[filterType] || "모든 유형"} · {catalog.assets.find((a: Row) => a.id === filterSystem)?.name || "모든 시스템"} · {from || "처음"} ~ {to || "현재 이후 포함"}</span><Button size="sm" variant="outline" onClick={resetFilters}>집계 필터 초기화</Button></div>}
          {view === "accounts" && !isDemo && <>{isAdmin&&<DemoSettings api={api}/>}<AccountCenter user={user} operators={catalog.operators} api={api} onPasswordChanged={() => { clearSession(); setError("비밀번호를 변경하고 모든 세션을 폐기했습니다. 새 비밀번호로 로그인하세요."); }} /></>}
          {view === "guide" && <ManualCenter />}
          {view === "technology" && <TechnologyGuide config={config} />}
          {view === "ontology" && <>
            <div className="ontology-context"><label>분석 기준 장애<select value={selected || ""} onChange={e => setSelected(e.target.value || null)}><option value="">선택 안 함 · 전체 구조</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.id} · {i.title} · {statusLabels[i.status]}</option>)}</select></label><p className="small muted">저장된 분석 결과를 조회합니다. 영향도 분석 전 장애는 전체 구조만 표시됩니다.</p>{current && <Button size="sm" variant="outline" onClick={() => openIncident(current.id)}>선택 장애 상세 보기</Button>}</div>
            <Panel title="자산 의존 관계" body={false} extra={<Chip tone="cyan">{current?.impact?.engine || graph.engine}</Chip>}><ImpactGraph assets={graph.nodes} edges={graph.edges} root={current?.impact?.root} affected={current?.impact?.affected || NO_AFFECTED} direct={current?.impact?.direct} api={api} expanded /></Panel>
          </>}
          {view === "dashboard" && (
            <>
              <DashboardWorkbench incidents={incidents} user={user} ready={typeof dashboard.total === "number"} online={online}
                filterKey={`${filterType}:${filterSystem}:${from}:${to}`} onMessage={() => setMessageOpen(true)} onCreate={() => setCreateOpen(true)}
                onOpen={openIncident} onHistory={() => setView("incidents")} onGuide={() => setView("guide")} selectedId={selected} demoControls={isAdmin ? (<details className="dashboard-simulation"><summary>가상 장애로 체험하기</summary><p>알림 문자나 관측 내용 없이 미리 준비된 시나리오로 처리 과정을 연습합니다. 버튼을 누르면 장애 이력이 저장됩니다.</p><div className="simulation-bar">
            <div className="flex-row">
              <div className="brand-icon">
                <Zap size={19} />
              </div>
              <div>
                <h3>가상 장애 시뮬레이션</h3>
                <p className="muted small mt-1">
                  시나리오 선택 → AI 판단 → 담당자 승인 → 복구 검증
                </p>
              </div>
            </div>
            <div className="flex-row">
              <select
                aria-label="실행 모드"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="REAL">실제 AI 모드</option>
                <option value="DEMO">시연 모드 · 모의 판단</option>
              </select>
              {mode === "REAL" && (
                <select
                  aria-label="판단 모델 선택"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="LOCAL">Local jevos (기본)</option>
                  <option value="TYPESAFE" disabled={!config.cloudConfigured}>
                    TypeSafe Cloud{" "}
                    {!config.cloudConfigured ? "· 키 미설정" : ""}
                  </option>
                </select>
              )}
              <select
                aria-label="가상 장애 시나리오"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                {catalog.scenarios.map((s: Row) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.title}
                  </option>
                ))}
              </select>
              <Button onClick={simulate} disabled={busy}>
                <Play size={14} fill="currentColor" />
                {busy ? "요청 중…" : "가상 장애 발생"}
              </Button>
            </div>
          </div>
          {mode === "REAL" && provider === "LOCAL" && (
            <div className="small muted mb-5">
              Local jevos 연결 실패 시 모의 판단으로 전환되며, 결과에 시뮬레이션
              표시가 남습니다. 낮은 신뢰도의 실제 판단은 담당자 확인을
              기다립니다.
            </div>
          )}
          </details>) : null} />
            </>
          )}
          {isAdmin && view === "operations" && <>
              <details className="operations-details"><summary>운영 현황 펼치기 · 지표 / 시스템 연결 / AI 도우미</summary>
              <div className="stats">
                {[
                  [
                    Activity,
                    "활성 장애",
                    dashboard.active || 0,
                    "건",
                    "진행 중 · 승인 대기 · 실패 포함",
                  ],
                  [
                    AlertTriangle,
                    "긴급 위험",
                    dashboard.critical || 0,
                    "건",
                    "긴급 장애 · P1",
                  ],
                  [
                    Clock,
                    "평균 복구 시간",
                    dashboard.mttrMinutes || 0,
                    "분",
                    "복구 검증이 완료된 장애 기준",
                  ],
                  [
                    RefreshCw,
                    "재발 의심률",
                    dashboard.recurrenceRate || 0,
                    "%",
                    "분석된 반복 패턴 기준",
                  ],
                  [
                    Database,
                    "저장된 장애",
                    dashboard.total || 0,
                    "건",
                    config.database || "DATABASE",
                  ],
                ].map(([Icon, label, val, unit, sub], i) => (
                  <div className="stat" key={i}>
                    <div className="stat-top">
                      <span>{label as string}</span>
                      {typeof Icon !== "string" && typeof Icon !== "number" && (
                        <Icon size={15} />
                      )}
                    </div>
                    <div
                      className="stat-value"
                      style={{
                        color:
                          i === 1 ? "#ffb2a0" : i === 0 ? "#8bedee" : undefined,
                      }}
                    >
                      {val as number}
                      <span className="stat-unit">{unit as string}</span>
                    </div>
                    <div className="stat-sub">{sub as string}</div>
                  </div>
                ))}
              </div>
              <div className="grid-main">
                <div>
                  <Panel
                    title="시스템 운영 상태"
                    extra={<Chip>12개 업무 시스템</Chip>}
                  >
                    <div className="system-grid">
                      {(dashboard.systemStatus || []).map((s: Row) => (
                        <div
                          key={s.id}
                          className={"system " + (s.active ? "alert" : "")}
                        >
                          <div className="flex-row">
                            <span
                              className="live-dot"
                              style={
                                s.active
                                  ? { background: "#efb471", boxShadow: "none" }
                                  : {}
                              }
                            />
                            <strong className="small">
                              {s.name.replace("가상 ", "")}
                            </strong>
                          </div>
                          <p>
                            {s.active
                              ? `${s.active}건 분석 / 조치 중`
                              : "관측된 활성 장애 없음"}
                          </p>
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <Panel
                    title="시스템 연결 관계"
                    extra={
                      <div className="flex-row">
                        <Chip tone="cyan">
                          {current?.impact?.engine || graph.engine}
                        </Chip>
                        <span className="small muted">{graph.nodes.length}개 자산 · {graph.edges.length}개 관계</span>
                      </div>
                    }
                    body={false}
                  >
                    <ImpactGraph
                      assets={graph.nodes}
                      edges={graph.edges}
                      root={current?.impact?.root}
                      affected={current?.impact?.affected || NO_AFFECTED}
                    />
                  </Panel>
                </div>
                <div>
                  <Panel
                    title="실시간 실행 흐름"
                    extra={
                      <Chip tone={live ? "green" : ""}>
                        <Radio size={11} />
                        {live ? "실시간 수신 중" : "대기 중"}
                      </Chip>
                    }
                  >
                    {current ? (
                      <>
                        <div className="flex-row mb-3">
                          <Status value={current.status} />
                          <button
                            className="small text-cyan-200"
                            onClick={() => setDrawer(true)}
                          >
                            상세 & 승인
                            <ArrowUpRight size={12} className="inline ml-1" />
                          </button>
                        </div>
                        <h3 className="mb-4">{current.title}</h3>
                        <Timeline events={current.events || []} />
                      </>
                    ) : (
                      <div className="empty">
                        <Activity size={28} className="mx-auto mb-4" />새 가상
                        장애를 발생시키거나
                        <br />
                        이력에서 장애를 선택하세요.
                      </div>
                    )}
                  </Panel>
                  {current?.decision && (
                    <Panel
                      title="AI 장애 판단"
                      extra={
                        <BrainCircuit size={16} className="text-cyan-200" />
                      }
                    >
                      <Decision d={current.decision} />
                    </Panel>
                  )}
                  <Panel
                    title="장애 발생 추이"
                    extra={
                      <span className="small muted">최근 발생일 14일</span>
                    }
                  >
                    <div className="bar-chart">
                      {dayEntries.map(([day, count]) => (
                        <div
                          key={day}
                          className="bar"
                          title={`${day}: ${count}건`}
                          style={{
                            height: `${(count / Math.max(1, ...dayEntries.map((x) => x[1]))) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                    <div className="chart-labels">
                      <span>{dayEntries[0]?.[0]}</span>
                      <span>{dayEntries.at(-1)?.[0]}</span>
                    </div>
                  </Panel>
                  <Panel title="장애 유형 분포">
                    {Object.entries(dashboard.byType || {}).map(([t, n]) => (
                      <div className="type-row" key={t}>
                        <span>{typeLabels[t] || t}</span>
                        <div className="type-track">
                          <i
                            style={{
                              width: `${(Number(n) / (dashboard.total || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <b>{Number(n)}</b>
                      </div>
                    ))}
                  </Panel>
                </div>
              </div>
              <Panel
                title="역할별 AI 도우미"
                extra={<Chip>6개 역할 · 작업 분담</Chip>}
              >
                <div className="agent-grid">
                  {agents.map((a, index) => {
                    const task = current?.tasks
                      ?.filter((t: Row) => t.agent === a)
                      .at(-1);
                    return (
                      <div className="agent" key={a}>
                        <div className="flex-row justify-between">
                          <Bot size={18} className="text-cyan-200" />
                          <Chip
                            tone={
                              task?.status === "completed"
                                ? "green"
                                : task?.status === "failed"
                                  ? "red"
                                  : ""
                            }
                          >
                            {({completed:"완료",failed:"실패",working:"진행 중",submitted:"접수됨",canceled:"취소됨"} as Row)[task?.status] || "대기 중"}
                          </Chip>
                        </div>
                        <b>{agentLabels[index]} 도우미</b>
                        <span className="small muted">
                          {agentLabels[index]}
                        </span>
                        {task && <AgentResult task={task} />}
                        {task && (
                          <Json
                            value={{
                              request: parse(task.request_json),
                              result: parse(task.result_json),
                            }}
                            label="요청 · 응답 확인"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </Panel>
              </details>
            </>}
          {isAdmin && view==="operations" && <OperationsPanel api={api} onOpen={openIncident} revision={historyRevision}/> }
          {view === "incidents" && (
            <>
              <div className="filters">
                {isAdmin && <label className="flex-row small"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>삭제된 장애 보기</label>}
                <div className="relative flex-1">
                  <Search
                    size={15}
                    className="absolute left-3 top-3 text-slate-500"
                  />
                  <input
                    type="search"
                    aria-label="장애 검색"
                    className="w-full pl-9"
                    placeholder="장애 제목 또는 ID 검색"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="장애 유형 필터"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                >
                  <option value="">모든 유형</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {typeLabels[t]}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="업무 시스템 필터"
                  value={filterSystem}
                  onChange={(e) => setFilterSystem(e.target.value)}
                >
                  <option value="">모든 시스템</option>
                  {catalog.assets
                    .filter((a: Row) => a.kind === "SYSTEM")
                    .map((a: Row) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
                <input
                  aria-label="시작일"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <input
                  aria-label="종료일"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
                <Button variant="outline" onClick={resetFilters}>검색 초기화</Button>
              </div>
              <div className="flex-row muted small mb-4">
                필터 결과 {visible.filter(i=>!!i.deleted_at === (isAdmin && showDeleted)).length}건 · {showDeleted ? "삭제 기록 조회 · 운영 지표는 삭제하지 않은 장애 기준" : "일반 이력 조회"} · 평균 복구 {dashboard.mttrMinutes}
                분 · 재발 의심 {dashboard.recurrenceRate}%
              </div>
              <Panel
                title="장애 이력"
                extra={<Chip>{config.database} · PERSISTED</Chip>}
                body={false}
              >
                <PaginatedList key={JSON.stringify([search,filterType,filterSystem,from,to,showDeleted])} label="장애 이력" items={visible.filter(i=>!!i.deleted_at === (isAdmin && showDeleted))} empty="조건에 맞는 장애가 없습니다.">{pageItems=>pageItems.map((i) => (
                    <IncidentRow
                      key={i.id}
                      i={i}
                      selected={selected === i.id}
                      onClick={() => openIncident(i.id)}
                    />
                  ))}</PaginatedList>
              </Panel>
              <Panel title="시스템별 장애 빈도">
                <div className="system-grid">
                  {Object.entries(dashboard.bySystem || {}).map(
                    ([name, count]) => (
                      <div className="system" key={name}>
                        <strong>{name}</strong>
                        <p>{Number(count)}건</p>
                      </div>
                    ),
                  )}
                </div>
              </Panel>
            </>
          )}
          {view === "knowledge" && (
            <><ManualKnowledge assets={catalog.assets} user={user} api={api} onSaved={refresh}/>
              <div className={"banner " + (config.hermes?.llmVerified ? "good" : "")}>
                <strong>Nous Hermes Agent</strong> · {config.hermes?.apiReachable ? "최근 확인: API 서버 연결됨" : "최근 확인: API 연결 미확인"}
                <p className="small mt-2">{config.hermes?.llmVerified ? "최근 Hermes 모델 응답 검증 완료" : "실제 LLM 응답 미검증 · 모의 판단으로 대체 시 결과에 명시"} · 승인된 PostgreSQL 지식만 검색에 사용합니다.</p>
                <p className="small muted">{config.hermes?.lastResult?.provider || "아직 지식 생성 실행 없음"}{config.hermes?.lastResult?.fallbackReason ? " · " + config.hermes.lastResult.fallbackReason : ""}</p>
                {config.hermes?.reason && <p className="mono small muted">{config.hermes.reason}</p>}
              </div>
              <div className="flex-row mb-5">
                <Chip tone="green">
                  승인 {skills.filter((s) => s.status === "APPROVED").length}
                </Chip>
                <Chip tone="amber">
                  검토 대기 {skills.filter((s) => s.status === "DRAFT").length}
                </Chip>
                <Chip>대응 매뉴얼 {catalog.manuals.length}</Chip>
                <Button size="sm" variant="outline" disabled={!isAdmin || isDemo || busy || !config.hermesExportConfigured} onClick={() => action(async () => {
                  let cursor = "", processed = 0, failed = 0;
                  setSyncProgress("승인된 해결 절차 동기화 시작…");
                  try {
                    do {
                      const result = await api(`/hermes/sync?limit=5&after=${encodeURIComponent(cursor)}`, "POST", {});
                      if (!result.configured) throw new Error("Hermes Skill 게시 설정이 필요합니다.");
                      processed += result.results.length;
                      failed += result.results.filter((r: Row) => r.status !== "EXPORTED").length;
                      setSyncProgress(`${processed}개 처리 · ${failed}개 게시 실패`);
                      if (result.hasMore && (!result.nextCursor || result.nextCursor === cursor)) throw new Error("동기화 진행 정보를 확인할 수 없습니다.");
                      cursor = result.hasMore ? result.nextCursor : "";
                    } while (cursor);
                    await refresh();
                    if (failed) throw new Error(`${failed}개 해결 절차 게시 실패 — 상태를 확인하고 동기화를 다시 실행하세요.`);
                    setSyncProgress(`승인된 해결 절차 ${processed}개 동기화 완료`);
                  } catch (error) {
                    setSyncProgress(`${processed}개 처리 후 오류 · 게시 상태와 감사 로그를 확인하세요.`);
                    throw error;
                  }
                })}>승인 지식 동기화</Button>
              </div>
              {syncProgress && <p role="status" className="small muted mb-5">{syncProgress}</p>}
              <PaginatedList label="해결 절차" items={skills}>{pageItems=><div className="skill-grid">
                {pageItems.map((s) => (
                  <article className="panel skill-card" key={s.id}>
                    <div className="flex-row justify-between">
                      <Chip>{typeLabels[s.type]}</Chip>
                      <Chip
                        tone={
                          s.status === "APPROVED"
                            ? "green"
                            : s.status === "DRAFT"
                              ? "amber"
                              : "red"
                        }
                      >
                        {s.status === "DRAFT"
                          ? (s.source_kind==="MANUAL_ENTRY"?"임시 저장":"AI 초안")
                          : s.status === "PENDING" ? "승인 대기" : s.status === "APPROVED"
                            ? "승인됨"
                            : "거부됨"}
                      </Chip>
                    </div>
                    <h3>{s.title}</h3><p className="small">출처: {s.source_kind==="MANUAL_ENTRY"?"직접 등록":s.source_kind==="IMPORTED"?"외부 자료":"AI 생성"} · 등록자: {s.created_by||"기존 이력"} · {s.created_at}</p>{s.revision>0&&<p className="small">수정·재생성 이력 {s.revision}회 · 최초 AI 원문과 다를 수 있습니다.</p>}
                    <div className="flex-row"><Chip tone={s.simulated ? "amber" : "cyan"}>{s.source_kind==="MANUAL_ENTRY"?"사용자 작성":s.simulated ? "시뮬레이션 / 고정 지식" : "Hermes 모델 생성"}</Chip><span className="small muted">{s.source_provider}</span></div>
                    <p className="mono small muted">{s.source_model} · {s.export_status === "EXPORTED" ? "Hermes Skill 파일 게시됨" : s.export_status === "FAILED" ? "게시 실패 · 동기화 재시도 필요" : "Hermes 미게시"}</p>
                    <dl>
                      {[
                        ["conditions", "적용 조건"],
                        ["checks", "점검 절차"],
                        ["solution", "해결 방법"],
                        ["cautions", "주의사항"],
                      ].map(([k, label]) => (
                        <div key={k}>
                          <dt>{label}</dt>
                          <dd>{s[k]}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mono">{s.id}</p>
                    {s.source_kind==="MANUAL_ENTRY"?<><ManualKnowledge skill={s} assets={catalog.assets} user={user} api={api} onSaved={refresh}/>{(isAdmin||s.created_by===user.id)&&<SkillEditor skill={{...s,status:"HISTORY"}} api={api} onSaved={refresh}/>}{s.status==="DRAFT"&&(isAdmin||s.created_by===user.id)&&<Button size="sm" disabled={busy} onClick={()=>action(()=>api(`/skills/${s.id}/submit`,"POST",{revision:s.revision||0}))}>승인 요청</Button>}</>:isAdmin&&<SkillEditor skill={s} api={api} onSaved={refresh}/> }
                    {isAdmin && (s.status === "PENDING" || (s.status === "DRAFT" && s.source_kind!=="MANUAL_ENTRY")) && (
                      <div className="flex-row mt-4">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api("/skills/" + s.id + "/review", "POST", {
                                status: "APPROVED",revision:String(s.revision||0),
                              }),
                            )
                          }
                        >
                          해결 절차 승인
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api("/skills/" + s.id + "/review", "POST", {
                                status: "REJECTED",
                              }),
                            )
                          }
                        >
                          거부
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </div>}</PaginatedList>
              <Panel title="대응 매뉴얼">
                <PaginatedList<Row> label="대응 매뉴얼" items={catalog.manuals}>{pageItems=><div className="system-grid">
                  {pageItems.map((m) => (
                    <details key={m.id}>
                      <summary>{m.title}</summary>
                      <p className="small muted">{m.procedure_text}</p>
                    </details>
                  ))}
                </div>}</PaginatedList>
              </Panel>
            </>
          )}
          {view === "harness" && (
            <>
              {isAdmin && !isDemo && <ModelWarmup api={api} />}
              <div className="stats">
                {[
                  ["동시 활성 장애", "최대 4"],
                  ["단계 재시도", "최대 2회"],
                  ["모델 판단 검토", "신뢰도 < 65%"],
                  ["위험 도구 접근", "차단"],
                  ["실행 대상", "가상 자산"],
                ].map(([label, value]) => (
                  <div className="stat" key={label}>
                    <div className="stat-top">
                      {label}
                      <ShieldCheck size={14} />
                    </div>
                    <div className="mt-5 text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
              <Panel
                title="가상 시나리오 자동 평가"
                extra={
                  <div className="flex-row">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        busy || !evaluationPage.ready || !!evaluationPage.error || evaluationPage.running
                      }
                      onClick={() =>
                        action(async () => {
                          await api("/evaluations", "POST", {
                            mode: "DEMO",
                            provider: "MOCK",
                          }); evaluationPage.setPage(1); },
                        )
                      }
                    >
                      한국어 100건 · 모의 평가
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        busy || !evaluationPage.ready || !!evaluationPage.error || evaluationPage.running
                      }
                      onClick={() =>
                        action(async () => {
                          await api("/evaluations", "POST", {
                            mode: "REAL",
                            provider: "LOCAL",
                          }); evaluationPage.setPage(1); },
                        )
                      }
                    >
                      한국어 100건 · 실제 Jev 평가
                    </Button>
                  </div>
                }
              >
                <p className="muted small mb-4">
                  정답은 모델 입력에서 제외됩니다. 유형·심각도·담당 부서·재발
                  여부를 비교하며, 대체 실행을 실제 모델 성능으로 표시하지
                  않습니다.
                </p>
                <RemoteList result={evaluationPage} label="Harness 평가" empty="평가를 실행하면 결과가 DB에 저장됩니다.">{pageItems=>pageItems.map((e) => {
                    const r = parse(e.result_json);
                    return (
                      <div className="system mb-3" key={e.id}>
                        <div className="flex-row justify-between">
                          <div className="flex-row">
                            <Chip
                              tone={
                                e.status === "COMPLETED" ? "green" : "amber"
                              }
                            >
                              {e.status}
                            </Chip>
                            <span>
                              {e.mode} / {e.provider}
                            </span>
                            <span className="small muted">
                              {formatTime(e.created_at)}
                            </span>
                          </div>
                          {r?.total && (
                            <strong>
                              {r.passed} / {r.total} 일치 ·{" "}
                              {Math.round(r.accuracy * 100)}%
                            </strong>
                          )}
                        </div>
                        {r?.error && <p role="alert" className="banner error mt-3">평가 실패: {r.error}</p>}
                        {r?.total && (
                          <>
                            <div className="flex-row small muted mt-3">
                              유형 {r.typeCorrect}/{r.denominators?.type??r.total} · 심각도{" "}
                              {r.severityCorrect}/{r.denominators?.severity??r.total} · 부서{" "}
                              {r.departmentCorrect}/{r.denominators?.department??r.total} · 재발{" "}
                              {r.recurrenceCorrect}/{r.denominators?.recurrence??r.total} · 검토 {r.reviews} · Mock
                              대체 {r.fallbacks}
                            </div>
                            <p className="small mt-3">{r.datasetVersion ? `평가셋 ${r.datasetVersion} · 기존 영어 키워드 기준선 ${r.baselinePassed}/${r.total} · 실제 AI만 ${r.actualAiPassed}/${r.actualAiCount}건 · 호출 오류 ${r.errors}건` : "이전 시연용 데이터 결과 · 모델 실력의 근거로 사용하지 마세요."}</p><p className="small muted">{r.note}</p>
                            {r.groups&&<table className="small mt-3"><thead><tr><th>평가 구분</th><th>이번 결과</th><th>기존 키워드</th></tr></thead><tbody>{Object.entries(r.groups).map(([name,counts])=>{const n=counts as number[];return <tr key={name}><td>{({TECHNICAL_KO:'기술 관측',AMBIGUOUS_KO:'모호·복합 사례',SMS_BATCH:'배치 문자',SMS_TMS:'오류율 문자'} as Row)[name]||name}</td><td>{n[1]}/{n[0]}</td><td>{n[2]}/{n[0]}</td></tr>;})}</tbody></table>}
                            <Json
                              value={r}
                              label="시나리오별 실제 결과와 정답"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}</RemoteList>
              </Panel>
              <Panel
                title="감사 로그"
                extra={<Chip>변경 불가 기록 · {auditPage.total}건</Chip>}
                body={false}
              >
                <RemoteList result={auditPage} label="감사 로그" empty="감사 로그가 없습니다.">{pageItems=><div className="overflow-auto">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>시각 (KST)</th>
                        <th>실행 주체</th>
                        <th>행동</th>
                        <th>장애 / 증적</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((a) => (
                        <tr key={a.id}>
                          <td className="mono">{formatTime(a.created_at)}</td>
                          <td>{a.actor}</td>
                          <td>{a.action}</td>
                          <td>
                            {a.incident_id && (
                              <button
                                className="text-cyan-200"
                                onClick={() => openIncident(a.incident_id)}
                              >
                                {a.incident_id}
                              </button>
                            )}
                            <Json value={a.data_json} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}</RemoteList>
              </Panel>
            </>
          )}
          <TechnologyContext view={view} onOpen={() => setView("technology")} />
          <div className="footer-note">
            <span>S-CARE · 모든 데이터는 가상입니다.</span>
            <span>Jev / Ontology / A2A / Hermes Adapter / Harness</span>
          </div>
        </main>
      </div>
      {selected && <div className="modal-backdrop" style={{ display: drawer ? "flex" : "none" }} role={drawer ? "dialog" : undefined} aria-modal={drawer ? true : undefined} aria-label="장애 상세">
        <IncidentWorkflow open={drawer} incident={detail} isAdmin={isAdmin} canEdit={canEdit} operators={catalog.operators} assets={catalog.assets} edges={graph.edges} api={api}
          onClose={() => setDrawer(false)} onGraph={() => { setDrawer(false); setView("ontology"); }}
          onRefresh={async () => { const result = await loadDetail(selected, true); void refresh().catch(e => setNotice(e.message)); return result; }}
          renderDecision={d => <Decision d={d} />} renderTimeline={events => <Timeline events={events} />} renderAgent={task => <AgentResult task={task} />} />
      </div>}
      {messageOpen && <MessageIntake assets={catalog.assets} initialMode={mode} provider={provider} api={api} onClose={() => setMessageOpen(false)} onRegistered={(id, duplicate) => {
        setMessageOpen(false); setSelected(id); setDrawer(true); setView("dashboard");
        setNotice(duplicate ? "이미 등록된 문자의 장애 처리 화면을 열었습니다." : "문자 관측값을 저장했습니다. 현재 장애 처리 단계로 이동합니다.");
        void refresh().catch(() => setError("장애는 등록됐지만 목록 갱신에 실패했습니다. 잠시 후 다시 확인해 주세요."));
      }} />}
      {createOpen && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="장애 등록"
        >
          <form
            className="drawer"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const r = await api("/incidents", "POST", {
                  title: newTitle,
                  assetId: newAsset,
                  observations: newObservations,
                  ownerId: "OP-01",
                  mode,
                  provider: mode === "DEMO" ? "MOCK" : provider,
                });
                setCreateOpen(false);
                setSelected(r.id);
                setDrawer(true);
                setView("dashboard");
                setNewTitle("");
                setNewObservations("");
              }, "장애가 등록되었습니다. 현재 단계의 처리 화면으로 이동합니다.", "장애 등록 정보 저장 및 분석 시작 요청 중");
            }}
          >
            <div className="drawer-head flex-row justify-between">
              <h2>가상 장애 직접 등록</h2>
              <Button
                type="button"
                variant="ghost"
                aria-label="등록 닫기"
                onClick={() => setCreateOpen(false)}
              >
                <X size={18} />
              </Button>
            </div>
            <div className="drawer-body">
              <p className="guide-point">포인트 1 · 제목·구성요소·가상 관측 입력 → 등록 & 분석 시작<br />등록 후 자동으로 열리는 처리 화면의 상단 스텝퍼에서 다음 단계를 확인하세요.</p>
              <div className="banner">
                실제 개인정보나 운영 시스템 로그를 입력하지 마세요. 가상 관측
                데이터만 사용합니다.
              </div>
              <div className="space-y-5">
                <label>등록 실행 모드<select aria-label="등록 실행 모드" value={mode} onChange={e => setMode(e.target.value)}><option value="DEMO">빠른 시연 · DEMO Mock (실제 AI 아님)</option><option value="REAL">실제 AI 모드</option></select></label>
                <p className="small muted">{mode==="DEMO"?"Jev·Hermes는 외부 모델 대기 없이 모의 결과를 사용합니다. 승인·복구 검증·감사 기록은 동일하게 진행됩니다.":"실제 모델에 요청합니다. 연결 상태와 추론 시간에 따라 대기 시간이 발생합니다."}</p>
                <label>
                  장애 제목
                  <input
                    required
                    maxLength={200}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="가상 시스템 지연 발생"
                  />
                </label>
                <label>
                  구성요소
                  <select
                    value={newAsset}
                    onChange={(e) => setNewAsset(e.target.value)}
                  >
                    {catalog.assets
                      .filter((a: Row) => a.kind !== "SYSTEM")
                      .map((a: Row) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  가상 관측 내용
                  <textarea
                    required
                    maxLength={4000}
                    value={newObservations}
                    onChange={(e) => setNewObservations(e.target.value)}
                    placeholder="CPU utilization 96%; customer outage; first occurrence"
                  />
                </label>
                <p className="small muted">
                  현재 실행 모드: {mode} / {mode === "DEMO" ? "MOCK" : provider}
                </p>
                <Button type="submit" disabled={busy}>
                  <Plus size={15} />
                  등록 & 분석 시작
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
      {busy && requestLabel && <div role="status" className="toast workflow-request"><RefreshCw size={16} className="working-spinner"/><div><strong>{requestLabel}</strong><p className="small">서버 응답을 기다리고 있습니다. 완료된 단계가 확인되면 화면에 반영됩니다.</p></div></div>}
      {notice && !error && !busy && (
        <div role="status" className="toast flex-row">
          <span>{notice}</span>
          <button aria-label="처리 결과 닫기" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      )}
      {error && (
        <div role="alert" className="toast flex-row">
          <AlertTriangle size={17} />
          <span>{error}</span>
          <button aria-label="알림 닫기" onClick={() => setError("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function IncidentRow({
  i,
  selected,
  onClick,
}: {
  i: Row;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onClick={onClick}
      className={"incident-row " + (selected ? "selected" : "")}
    >
      <div>
        <Chip tone={i.severity === "P1" ? "red" : "amber"}>{i.severity}</Chip>
      </div>
      <div className="incident-title">
        {i.title}
        <small>
          {i.id} · {i.asset_name}
        </small>
      </div>
      <Status value={i.status} />
      <span className="mono muted small">{formatTime(i.created_at)}</span>
    </div>
  );
}
