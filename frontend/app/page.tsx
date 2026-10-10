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
import AccountCenter from "@/components/account-center";
import ManualCenter from "@/components/manual-center";
import { recoveryNotesDraft } from "@/lib/recovery-notes.mjs";
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
  FAILED: "실행 실패",
  REJECTED: "승인 거부",
};
const NO_AFFECTED: string[] = [];
const nextSteps: Row = {
  REGISTERED: "장애를 접수했습니다. 분석이 시작될 때까지 기다려 주세요.",
  ANALYZING: "Jev와 전문 Agent가 분석 중입니다. 실행 타임라인에서 최신 단계를 확인하세요.",
  NEEDS_REVIEW: "담당자 확인이 필요합니다. 관측과 원인 후보를 대조하고 아래 확인 근거를 작성하세요.",
  WAITING_APPROVAL: "대응 승인을 기다립니다. 영향 범위와 복구 가이드를 확인한 뒤 승인 또는 거부하세요.",
  RECOVERING: "승인된 가상 복구를 검증하고 있습니다. 실제 운영 시스템을 변경하지 않습니다.",
  RESOLVED: "복구 검증을 통과했습니다. ‘후기 & 보고서’에서 후기와 재발 방지 대책을 저장한 후 종료하세요.",
  CLOSED: "종료된 장애입니다. ‘후기 & 보고서’에서 저장된 기록과 PDF/Excel을 확인할 수 있습니다.",
  FAILED: "실행 실패 원인을 타임라인에서 확인하세요. 연결 문제를 해결한 후 명시적으로 재시도할 수 있습니다.",
  REJECTED: "대응이 거부됐습니다. 실행 타임라인과 감사 로그에서 사유를 확인하세요.",
};
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
    throw new Error(
      data.error || data.message || "요청을 처리하지 못했습니다.",
    );
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
        ["FAILED", "REJECTED"].includes(value)
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
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  body?: boolean;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {extra}
      </div>
      <div className={body ? "panel-body" : ""}>{children}</div>
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
              <h3>{e.stage.replace("AGENT_", "A2A · ")}</h3>
              <small className="mono">
                {formatTime(e.created_at).slice(-8)}
              </small>
            </div>
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
            {d.simulated
              ? "시뮬레이션 결과 · 실제 AI 판단 아님"
              : d.provider === "OPERATOR"
                ? "담당자가 확인한 판단"
                : "실제 AI 모델 판단"}
          </strong>
        </div>
        {d.fallback && (
          <div className="small">
            Local jevos 연결 실패 후 Mock으로 전환했습니다. {d.fallbackReason}
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
    <Chip tone={data.simulated ? "amber" : "cyan"}>{data.simulated ? "원인 후보 · 시뮬레이션" : "원인 후보 · 실제 Jev"}</Chip>
    <p className="mt-2"><strong>{data.causeLabel}</strong></p>
    <p className="small muted">신뢰도 {Math.round(data.confidence * 100)}% · 근거 {Math.round(data.evidenceScore * 100)}%</p>
    <p className="mono small muted">{data.provider} · {data.model} · {data.latencyMs} ms</p>
    {data.needsReview && <p className="small text-amber-200">원본 모델 판단: 담당자 검토가 필요한 가설</p>}
    {data.fallback && <p className="small text-amber-200">{data.fallbackReason}</p>}
  </div>;
  if (task.agent === "knowledge") return <div className="mt-3">
    <Chip tone={data.simulated ? "amber" : "cyan"}>{data.simulated ? "지식 검색 · Mock" : "지식 검색 · 실제 Hermes"}</Chip>
    <p className="small mt-2">{data.explanation}</p>
    <p className="small muted">승인 Skill {data.skills?.length || 0}개 · 매뉴얼 {data.manuals?.length || 0}개</p>
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
  const isAdmin = user.role === "ADMIN";
  const [loginMode, setLoginMode] = useState("login"), [loginName, setLoginName] = useState(""), [password, setPassword] = useState(""), [inviteCode, setInviteCode] = useState("");
  const [syncProgress, setSyncProgress] = useState("");
  const [notice, setNotice] = useState("");
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
    [skills, setSkills] = useState<Row[]>([]),
    [audit, setAudit] = useState<Row[]>([]),
    [evaluations, setEvaluations] = useState<Row[]>([]);
  const [mode, setMode] = useState("REAL"),
    [provider, setProvider] = useState("LOCAL"),
    [scenario, setScenario] = useState("SCN-01"),
    [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<Row | null>(null),
    [drawer, setDrawer] = useState(false),
    [detailTab, setDetailTab] = useState("analysis"),
    [live, setLive] = useState(false),
    [online, setOnline] = useState(true),
    [createOpen, setCreateOpen] = useState(false),
    [search, setSearch] = useState(""),
    [filterType, setFilterType] = useState(""),
    [filterSystem, setFilterSystem] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [approvalReason, setApprovalReason] = useState(""),
    [reviewType, setReviewType] = useState("RESOURCE"),
    [reviewSeverity, setReviewSeverity] = useState("P1"),
    [reviewDept, setReviewDept] = useState("PLATFORM"),
    [reviewReason, setReviewReason] = useState("");
  const [editTitle, setEditTitle] = useState(""),
    [notes, setNotes] = useState(""),
    [prevention, setPrevention] = useState(""),
    [owner, setOwner] = useState("OP-01");
  const [newTitle, setNewTitle] = useState(""),
    [newObservations, setNewObservations] = useState(""),
    [newAsset, setNewAsset] = useState("CMP-01");
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const filtered = !!(filterType || filterSystem || from || to);
  const refreshVersion = useRef(0);
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
    const [d, i, k, a, e, c] = await Promise.all([
      api("/dashboard?" + q),
      api("/incidents?" + q),
      api("/skills"),
      isAdmin ? api("/audit") : Promise.resolve([]),
      isAdmin ? api("/evaluations") : Promise.resolve([]),
      api("/config"),
    ]);
    if (version !== refreshVersion.current) return;
    setDashboard(d);
    setIncidents(i);
    setSkills(k);
    setAudit(a);
    setEvaluations(e);
    setConfig(c);
    setOnline(true);
  }, [filterType, filterSystem, from, to, isAdmin]);
  const loadDetail = useCallback(async (id: string) => {
    const d = await api("/incidents/" + id);
    if (selectedRef.current === id) setDetail(d);
    return d;
  }, []);
  const action = async (fn: () => Promise<any>, successMessage = "요청이 처리되었습니다.") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
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
    }
  };
  const clearSession = useCallback(() => {
    ++refreshVersion.current; setAuth(false); setUser({}); setToken(""); setPassword(""); setInviteCode(""); setSelected(null); setDetail(null); setDrawer(false); setCreateOpen(false); setView("dashboard"); setIncidents([]); setSkills([]); setAudit([]); setEvaluations([]);
  }, []);
  useEffect(() => {
    const expired = () => { clearSession(); setError("세션이 만료되었거나 폐기되었습니다. 다시 로그인하세요."); };
    window.addEventListener("brain-session-expired", expired);
    return () => window.removeEventListener("brain-session-expired", expired);
  }, [clearSession]);
  useEffect(() => {
    api("/config")
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
    if (!auth) return;
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
      5000,
    );
    return () => clearInterval(interval);
  }, [auth, refresh]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setDetail(null);
    loadDetail(selected).catch((e) => setError("장애 상세 조회 실패: " + e.message));
    const source = new EventSource("/api/incidents/" + selected + "/events");
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.addEventListener("stage", () => {
      loadDetail(selected).catch((e) => setError("장애 상세 갱신 실패: " + e.message));
      refresh().catch((e) => {
        setOnline(false);
        setError("실시간 화면 갱신 실패: " + e.message);
      });
    });
    return () => {
      source.close();
      setLive(false);
    };
  }, [selected, loadDetail, refresh]);
  useEffect(() => {
    if (detail) {
      setEditTitle(detail.title);
      setNotes(recoveryNotesDraft(detail.notes) ?? detail.notes);
      setPrevention(detail.prevention);
      setOwner(detail.owner_id);
      if (detail.decision) {
        setReviewType(detail.decision.type);
        setReviewSeverity(detail.decision.severity);
        setReviewDept(detail.decision.department);
      }
    }
  }, [detail?.id, detail?.status]);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 12000);
    return () => clearTimeout(timer);
  }, [error]);
  useEffect(() => {
    if (!drawer && !createOpen) return;
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
  }, [drawer, createOpen]);
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
    setDetailTab("analysis");
    setApprovalReason("");
    setReviewReason("");
  }
  async function simulate() {
    await action(async () => {
      const r = await api("/simulate", "POST", {
        scenarioId: scenario,
        mode,
        provider: mode === "DEMO" ? "MOCK" : provider,
      });
      setSelected(r.id);
      setDrawer(false);
      setView("dashboard");
    });
  }
  const visible = incidents.filter((i) =>
    `${i.title} ${i.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const recent = incidents.slice(0, 6);
  const current = detail;
  const dayEntries = Object.entries(dashboard.byDay || {}).slice(-14) as [
    string,
    number,
  ][];
  const title: Row = {
    dashboard: "AI Incident Command Center",
    ontology: "온톨로지 · 시스템 영향 분석",
    incidents: "장애 이력 & 보고서",
    knowledge: "지식 & Skill · 해결 절차 관리",
    harness: "Harness · 실행 통제와 평가",
    guide: "사용 안내 · 역할별 매뉴얼",
    accounts: isAdmin ? "계정 & 권한 관리" : "내 계정",
  };
  const descriptions: Row = {
    dashboard: "현재 장애와 처리 진행 상황을 확인합니다. 장애를 선택하면 판단·영향 분석·Agent 결과가 표시됩니다.",
    ontology: "시스템이 무엇에 의존하는지 확인하고, 선택한 장애의 영향 가능성을 전체화면으로 살펴봅니다.",
    incidents: "장애를 검색하고 조치 후기·재발 방지 대책·보고서를 확인합니다.",
    knowledge: "해결 방법을 재사용하는 공간입니다. 검토한 Skill만 승인하고 Hermes 게시 상태를 확인하세요.",
    harness: "AI의 실행 제한과 승인 기록을 확인하고 가상 시나리오로 판단 정확도를 평가합니다.",
    guide: "처음 사용하는 분은 사용자용부터, 승인과 환경 운영 담당자는 관리자용을 확인하세요.",
    accounts: "개인 계정과 로그인 정보를 관리합니다. 권한은 서버에서도 검사합니다.",
  };
  const canEdit = !!detail && (isAdmin || (user.operatorId && user.operatorId === detail.owner_id));
  const reportDirty = !!detail && (editTitle !== detail.title || notes !== detail.notes || prevention !== detail.prevention || owner !== detail.owner_id);
  const generatedNotes = detail ? recoveryNotesDraft(detail.notes) : null;
  const recoveryProof = generatedNotes ? detail?.notes : [...(detail?.events || [])].reverse().find((event: Row) => event.stage === "VERIFY" && event.state === "COMPLETED")?.data_json;
  if (auth === null)
    return (
      <div className="login">
        <div className="loading flex-row">
          <BrainCircuit /> Command Center 연결 중
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
            S-CARE · OPERATIONS INTELLIGENCE
          </div>
          <h1>
            AI Incident Brain <span className="muted">3.0</span>
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
          <Button className="w-full mt-5" disabled={busy}>{busy ? "연결 중…" : loginMode === "activate" ? "계정 활성화 & 시작" : "Command Center 시작"}<ArrowUpRight size={16} /></Button>
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
            <strong>Incident Brain</strong>
            <small>INTELLIGENCE PLATFORM</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            ["dashboard", LayoutDashboard, "통합 관제"],
            ["ontology", Network, "온톨로지"],
            ["incidents", History, "장애 이력"],
            ["knowledge", BookOpen, "지식 & Skill"],
            ["harness", ShieldCheck, "Harness & 평가"],
            ["guide", FileText, "사용 안내"],
            ["accounts", ShieldCheck, isAdmin ? "계정 관리" : "내 계정"],
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
        <div className="nav-label" style={{ marginTop: 30 }}>
          CONNECTED LAYERS
        </div>
        <div className="px-3 space-y-4 small muted">
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
          <Chip tone="amber">FICTIONAL DATA ONLY</Chip>
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
            <span className="muted small">WORKSPACE</span>
            <ChevronRight size={12} />
            <span>가상 금융 IT 운영센터</span>
            <span className="divider" />
            <Chip tone={online ? "green" : "red"}>
              <span className="live-dot" />
              {online ? "API 연결" : "API 연결 끊김"}
            </Chip>
          </div>
          <div className="flex-row">
            <span className="mono small muted">ASIA / SEOUL</span>
            <span className="small">{user.displayName}</span><Chip>{isAdmin ? "ADMIN" : "USER"}</Chip>
            <button
              aria-label="로그아웃"
              className="p-2 muted"
              onClick={async () => {
                try { await api("/session", "DELETE"); clearSession(); } catch (e) { setError((e as Error).message); }
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <main className="page">
          <div className="heading">
            <div>
              <div className="eyebrow">OPERATIONS / {view.toUpperCase()}</div>
              <h1>{title[view]}</h1>
              <p>{descriptions[view]}</p>
            </div>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              장애 직접 등록
            </Button>
          </div>
          {isAdmin && !["guide", "accounts"].includes(view) && <><div className="simulation-bar">
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
                <option value="DEMO">시연 모드 · Mock</option>
              </select>
              {mode === "REAL" && (
                <select
                  aria-label="Jev Provider"
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
              Local jevos 연결 실패 시 Mock으로 전환되며, 결과에 시뮬레이션
              표시가 남습니다. 낮은 신뢰도의 실제 판단은 담당자 확인을
              기다립니다.
            </div>
          )}
          </>}
          {filtered && ["dashboard", "incidents", "ontology"].includes(view) && <div className="filter-notice" role="status"><span>집계 필터 적용 중 · {typeLabels[filterType] || "모든 유형"} · {catalog.assets.find((a: Row) => a.id === filterSystem)?.name || "모든 시스템"} · {from || "처음"} ~ {to || "현재 이후 포함"}</span><Button size="sm" variant="outline" onClick={resetFilters}>집계 필터 초기화</Button></div>}
          {view === "accounts" && <AccountCenter user={user} operators={catalog.operators} api={api} onPasswordChanged={() => { clearSession(); setError("비밀번호를 변경하고 모든 세션을 폐기했습니다. 새 비밀번호로 로그인하세요."); }} />}
          {view === "guide" && <ManualCenter />}
          {view === "ontology" && <>
            <div className="ontology-context"><label>분석 기준 장애<select value={selected || ""} onChange={e => setSelected(e.target.value || null)}><option value="">선택 안 함 · 전체 구조</option>{incidents.map(i => <option key={i.id} value={i.id}>{i.id} · {i.title} · {statusLabels[i.status]}</option>)}</select></label><p className="small muted">저장된 분석 결과를 조회합니다. 영향도 분석 전 장애는 전체 구조만 표시됩니다.</p>{current && <Button size="sm" variant="outline" onClick={() => openIncident(current.id)}>선택 장애 상세 보기</Button>}</div>
            <Panel title="자산 의존 관계" body={false} extra={<Chip tone="cyan">{current?.impact?.engine || graph.engine}</Chip>}><ImpactGraph assets={graph.nodes} edges={graph.edges} root={current?.impact?.root} affected={current?.impact?.affected || NO_AFFECTED} expanded /></Panel>
          </>}
          {view === "dashboard" && (
            <>
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
                    "P1 활성 장애",
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
                    extra={<Chip>12 BUSINESS SYSTEMS</Chip>}
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
                    title="Ontology · 의존 관계"
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
                  <Panel
                    title="최근 장애"
                    extra={
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setView("incidents")}
                      >
                        전체 이력
                        <ArrowUpRight size={13} />
                      </Button>
                    }
                    body={false}
                  >
                    {recent.map((i) => (
                      <IncidentRow
                        key={i.id}
                        i={i}
                        selected={selected === i.id}
                        onClick={() => openIncident(i.id)}
                      />
                    ))}
                  </Panel>
                </div>
                <div>
                  <Panel
                    title="실시간 실행 흐름"
                    extra={
                      <Chip tone={live ? "green" : ""}>
                        <Radio size={11} />
                        {live ? "SSE LIVE" : "STANDBY"}
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
                      title="Jev Decision"
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
                title="A2A Specialist Agents"
                extra={<Chip>HTTP JSON-RPC · 6 AGENTS</Chip>}
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
                            {task?.status || "STANDBY"}
                          </Chip>
                        </div>
                        <b>{a[0].toUpperCase() + a.slice(1)} Agent</b>
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
            </>
          )}
          {view === "incidents" && (
            <>
              <div className="filters">
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
                필터 결과 {visible.length}건 · 평균 복구 {dashboard.mttrMinutes}
                분 · 재발 의심 {dashboard.recurrenceRate}%
              </div>
              <Panel
                title="장애 이력"
                extra={<Chip>{config.database} · PERSISTED</Chip>}
                body={false}
              >
                {visible.length ? (
                  visible.map((i) => (
                    <IncidentRow
                      key={i.id}
                      i={i}
                      selected={selected === i.id}
                      onClick={() => openIncident(i.id)}
                    />
                  ))
                ) : (
                  <div className="empty">조건에 맞는 장애가 없습니다.</div>
                )}
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
            <>
              <div className={"banner " + (config.hermes?.llmVerified ? "good" : "")}>
                <strong>Nous Hermes Agent</strong> · {config.hermes?.apiReachable ? "API 서버 연결됨" : "API 서버 미연결"}
                <p className="small mt-2">{config.hermes?.llmVerified ? "최근 Hermes 모델 응답 검증 완료" : "실제 LLM 응답 미검증 · Mock 대체 시 결과에 명시"} · 승인된 PostgreSQL 지식만 검색에 사용합니다.</p>
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
                <Button size="sm" variant="outline" disabled={!isAdmin || busy || !config.hermesExportConfigured} onClick={() => action(async () => {
                  let cursor = "", processed = 0, failed = 0;
                  setSyncProgress("승인 Skill 동기화 시작…");
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
                    if (failed) throw new Error(`${failed}개 Skill 게시 실패 — 상태를 확인하고 동기화를 다시 실행하세요.`);
                    setSyncProgress(`승인 Skill ${processed}개 동기화 완료`);
                  } catch (error) {
                    setSyncProgress(`${processed}개 처리 후 오류 · 게시 상태와 감사 로그를 확인하세요.`);
                    throw error;
                  }
                })}>승인 지식 동기화</Button>
              </div>
              {syncProgress && <p role="status" className="small muted mb-5">{syncProgress}</p>}
              <div className="skill-grid">
                {skills.map((s) => (
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
                          ? "승인 대기"
                          : s.status === "APPROVED"
                            ? "승인됨"
                            : "거부됨"}
                      </Chip>
                    </div>
                    <h3>{s.title}</h3>
                    <div className="flex-row"><Chip tone={s.simulated ? "amber" : "cyan"}>{s.simulated ? "시뮬레이션 / 고정 지식" : "Hermes 모델 생성"}</Chip><span className="small muted">{s.source_provider}</span></div>
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
                    {isAdmin && s.status === "DRAFT" && (
                      <div className="flex-row mt-4">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            action(() =>
                              api("/skills/" + s.id + "/review", "POST", {
                                status: "APPROVED",
                              }),
                            )
                          }
                        >
                          Skill 승인
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
              </div>
              <Panel title="대응 매뉴얼">
                <div className="system-grid">
                  {catalog.manuals.map((m: Row) => (
                    <details key={m.id}>
                      <summary>{m.title}</summary>
                      <p className="small muted">{m.procedure_text}</p>
                    </details>
                  ))}
                </div>
              </Panel>
            </>
          )}
          {view === "harness" && (
            <>
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
                        busy || evaluations.some((e) => e.status === "RUNNING")
                      }
                      onClick={() =>
                        action(() =>
                          api("/evaluations", "POST", {
                            mode: "DEMO",
                            provider: "MOCK",
                          }),
                        )
                      }
                    >
                      Mock 50건 평가
                    </Button>
                    <Button
                      size="sm"
                      disabled={
                        busy || evaluations.some((e) => e.status === "RUNNING")
                      }
                      onClick={() =>
                        action(() =>
                          api("/evaluations", "POST", {
                            mode: "REAL",
                            provider: "LOCAL",
                          }),
                        )
                      }
                    >
                      Local Jev 50건 평가
                    </Button>
                  </div>
                }
              >
                <p className="muted small mb-4">
                  정답은 모델 입력에서 제외됩니다. 유형·심각도·담당 부서·재발
                  여부를 비교하며, 대체 실행을 실제 모델 성능으로 표시하지
                  않습니다.
                </p>
                {evaluations.length ? (
                  evaluations.map((e) => {
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
                              유형 {r.typeCorrect}/50 · 심각도{" "}
                              {r.severityCorrect}/50 · 부서{" "}
                              {r.departmentCorrect}/50 · 재발{" "}
                              {r.recurrenceCorrect}/50 · 검토 {r.reviews} · Mock
                              대체 {r.fallbacks}
                            </div>
                            <Json
                              value={r}
                              label="시나리오별 실제 결과와 정답"
                            />
                          </>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="empty">
                    평가를 실행하면 결과가 DB에 저장됩니다.
                  </div>
                )}
              </Panel>
              <Panel
                title="감사 로그"
                extra={<Chip>APPEND-ONLY · {audit.length} RECORDS</Chip>}
                body={false}
              >
                <div className="overflow-auto">
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
                      {audit.map((a) => (
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
                </div>
              </Panel>
            </>
          )}
          <div className="footer-note">
            <span>AI INCIDENT BRAIN 3.0 · 모든 데이터는 가상입니다.</span>
            <span>Jev / Ontology / A2A / Hermes Adapter / Harness</span>
          </div>
        </main>
      </div>
      {drawer && selected && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="장애 상세"
        >
          <div className="drawer">
            <div className="drawer-head">
              <div className="flex-row justify-between">
                <span className="mono muted small">{selected}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="상세 닫기"
                  onClick={() => setDrawer(false)}
                >
                  <X size={18} />
                </Button>
              </div>
              <h2 className="drawer-title">
                {detail?.title || "불러오는 중…"}
              </h2>
              <div className="flex-row">
                {detail && (
                  <>
                    <Status value={detail.status} />
                    <Chip>{detail.severity}</Chip>
                    <span className="small muted">
                      {detail.owner_name} · {deptLabels[detail.department]}
                    </span>
                  </>
                )}
              </div>
              <div className="tabs">
                {[
                  ["analysis", "판단 & 대응"],
                  ["timeline", "실행 타임라인"],
                  ["agents", "Agent 협업"],
                  ["report", "후기 & 보고서"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={"tab " + (detailTab === id ? "active" : "")}
                    onClick={() => setDetailTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="drawer-body">
              {detail && (
                <>
                  <div className="banner next-step"><strong>다음 할 일</strong><p>{!isAdmin && ["NEEDS_REVIEW", "WAITING_APPROVAL", "FAILED"].includes(detail.status) ? "관리자의 검토·승인 또는 재시도를 기다리고 있습니다. 분석 결과와 실행 타임라인을 확인하세요." : !isAdmin && detail.status === "RESOLVED" ? "본인 담당 장애이면 후기와 예방 대책을 저장하세요. 최종 종료는 관리자가 수행합니다." : nextSteps[detail.status]}</p></div>
                  {detailTab === "analysis" && (
                    <>
                      <Panel title="관측 정보">
                        <p className="muted small mb-3">
                          {detail.system_name} / {detail.asset_name}
                        </p>
                        <p className="text-sm leading-7">
                          {detail.observations}
                        </p>
                      </Panel>
                      <Panel title="Jev 모델 판단">
                        <Decision d={detail.decision} />
                      </Panel>
                      {detail.tasks?.some((t: Row) => t.agent === "diagnosis") && <Panel title="Diagnosis 원인 후보 · 확정 근본 원인 아님">
                        <AgentResult task={detail.tasks.filter((t: Row) => t.agent === "diagnosis").at(-1)} />
                      </Panel>}
                      {isAdmin && detail.status === "NEEDS_REVIEW" && (
                        <Panel title="담당자 판단 확인">
                          <div className="banner">
                            모델 근거가 부족합니다. 원본 관측과 모델 응답을
                            확인한 후 분류를 확정하세요.
                            {parse(detail.events?.filter((e: Row) => e.stage === "HARNESS" && e.state === "COMPLETED").at(-1)?.data_json)?.reviewReasons?.map((reason: string) => <p className="small mt-2" key={reason}>{reason}</p>)}
                          </div>
                          <div className="form-grid">
                            <label>
                              장애 유형
                              <select
                                value={reviewType}
                                onChange={(e) => setReviewType(e.target.value)}
                              >
                                {types.map((t) => (
                                  <option key={t} value={t}>
                                    {typeLabels[t]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              심각도
                              <select
                                value={reviewSeverity}
                                onChange={(e) =>
                                  setReviewSeverity(e.target.value)
                                }
                              >
                                {["P1", "P2", "P3"].map((t) => (
                                  <option key={t}>{t}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              담당 부서
                              <select
                                value={reviewDept}
                                onChange={(e) => setReviewDept(e.target.value)}
                              >
                                {departments.map((d) => (
                                  <option key={d} value={d}>
                                    {deptLabels[d]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="full">
                              확인 근거
                              <textarea
                                value={reviewReason}
                                onChange={(e) =>
                                  setReviewReason(e.target.value)
                                }
                                placeholder="관측 내용을 확인한 근거를 기록하세요."
                              />
                            </label>
                          </div>
                          <Button
                            className="mt-4"
                            disabled={busy || !reviewReason.trim()}
                            onClick={() =>
                              action(() =>
                                api(
                                  "/incidents/" + selected + "/review",
                                  "POST",
                                  {
                                    type: reviewType,
                                    severity: reviewSeverity,
                                    department: reviewDept,
                                    reason: reviewReason,
                                  },
                                ),
                              )
                            }
                          >
                            판단 확정 & 분석 계속
                          </Button>
                        </Panel>
                      )}
                      {detail.impact && (
                        <Panel title="Ontology 영향 분석">
                          <Button size="sm" variant="outline" className="mb-3" onClick={() => { setDrawer(false); setView("ontology"); }}>영향 그래프 크게 보기</Button>
                          <p className="mb-3">
                            <strong className="text-cyan-200">
                              {detail.impact.affected.length}
                            </strong>
                            개 자산에 영향 가능성 · {detail.impact.engine}
                          </p>
                          <div className="flex-row">
                            {detail.impact.affected.map((id: string) => (
                              <Chip
                                key={id}
                                tone={id === detail.asset_id ? "red" : ""}
                              >
                                {catalog.assets.find((a: Row) => a.id === id)
                                  ?.name || id}
                              </Chip>
                            ))}
                          </div>
                        </Panel>
                      )}
                      {isAdmin && detail.status === "WAITING_APPROVAL" && (
                        <Panel title="가상 대응 승인">
                          <div className="banner">
                            Harness 검증이 완료되었습니다. 승인 후 가상 복구
                            지표를 변경하고 정상 범위 도달 여부를 확인합니다.
                          </div>
                          <label>
                            승인 / 거부 사유
                            <textarea
                              value={approvalReason}
                              onChange={(e) =>
                                setApprovalReason(e.target.value)
                              }
                              placeholder="영향 범위와 대응 가이드를 확인한 내용을 입력하세요."
                            />
                          </label>
                          <div className="flex-row mt-4">
                            <Button
                              disabled={busy || !approvalReason.trim()}
                              onClick={() =>
                                action(() =>
                                  api(
                                    "/incidents/" + selected + "/approval",
                                    "POST",
                                    { approved: true, reason: approvalReason },
                                  ),
                                )
                              }
                            >
                              <ShieldCheck size={15} />
                              대응 승인
                            </Button>
                            <Button
                              variant="danger"
                              disabled={busy || !approvalReason.trim()}
                              onClick={() =>
                                action(() =>
                                  api(
                                    "/incidents/" + selected + "/approval",
                                    "POST",
                                    { approved: false, reason: approvalReason },
                                  ),
                                )
                              }
                            >
                              대응 거부
                            </Button>
                          </div>
                        </Panel>
                      )}
                      {isAdmin && detail.status === "FAILED" && (
                        <div className="banner error">
                          <p>
                            실행 오류가 기록되었습니다. 타임라인에서 원인을
                            확인하고 연결 상태를 복구한 뒤 다시 실행하세요.
                          </p>
                          <Button
                            size="sm"
                            className="mt-3"
                            disabled={busy}
                            onClick={() =>
                              action(() =>
                                api(
                                  "/incidents/" + selected + "/retry",
                                  "POST",
                                  {},
                                ),
                              )
                            }
                          >
                            실패 작업 재시도
                          </Button>
                        </div>
                      )}
                      {["RESOLVED", "CLOSED"].includes(detail.status) && (
                        <div className="banner good">
                          <CheckCircle2 size={15} className="inline mr-2" />
                          복구 검증과 장애 이력 저장이 완료되었습니다. 후기 &
                          보고서에서 확인하세요.
                        </div>
                      )}
                    </>
                  )}
                  {detailTab === "timeline" && (
                    <Timeline events={detail.events || []} />
                  )}
                  {detailTab === "agents" && (
                    <>
                      {(detail.tasks || []).map((t: Row) => (
                        <Panel
                          key={t.id}
                          title={t.agent + " Agent"}
                          extra={
                            <Chip
                              tone={t.status === "completed" ? "green" : "red"}
                            >
                              {t.status}
                            </Chip>
                          }
                        >
                          <span className="mono small muted">{t.id}</span>
                          <AgentResult task={t} />
                          <Json value={t.request_json} label="A2A 작업 요청" />
                          <Json value={t.result_json} label="A2A 응답 결과" />
                        </Panel>
                      ))}
                      {!detail.tasks?.length && (
                        <div className="empty">
                          Agent 실행 기록을 기다리고 있습니다.
                        </div>
                      )}
                    </>
                  )}
                  {detailTab === "report" && (
                    <>
                      <Panel title="장애 정보 & 조치 후기">
                        {!canEdit && <div className="banner mb-4">다른 담당자의 장애는 조회만 가능합니다. 담당자 변경이 필요하면 관리자에게 요청하세요.</div>}
                        {generatedNotes && <div className="banner mb-4">가상 복구 검증 결과를 한국어 후기 초안으로 정리했습니다. 내용을 검토하고 필요한 조치 설명을 추가한 뒤 ‘수정 내용 저장’을 누르세요. 저장 전에는 보고서에 반영되지 않습니다.</div>}
                        <div className="form-grid">
                          <label className="full">
                            장애 제목
                            <input
                              disabled={!isAdmin}
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                            />
                          </label>
                          <label className="full">
                            담당자
                            <select
                              aria-label="담당자"
                              disabled={!isAdmin}
                              value={owner}
                              onChange={(e) => setOwner(e.target.value)}
                            >
                              {catalog.operators.map((o: Row) => (
                                <option key={o.id} value={o.id}>
                                  {o.name} · {deptLabels[o.department]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="full">
                            조치 후기
                            <textarea
                              rows={6}
                              readOnly={!canEdit}
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                            />
                          </label>
                          <label className="full">
                            재발 방지 대책
                            <textarea
                              readOnly={!canEdit}
                              value={prevention}
                              onChange={(e) => setPrevention(e.target.value)}
                            />
                          </label>
                        </div>
                        <div className="flex-row mt-4">
                          <Button
                            variant="outline"
                            disabled={
                              !canEdit || busy ||
                              [
                                "REGISTERED",
                                "ANALYZING",
                                "RECOVERING",
                              ].includes(detail.status)
                            }
                            onClick={() =>
                              action(() =>
                                api("/incidents/" + selected, "PATCH", {
                                  ...(isAdmin ? { title: editTitle, ownerId: owner } : {}),
                                  notes,
                                  prevention,
                                }),
                              )
                            }
                          >
                            수정 내용 저장
                          </Button>
                          {isAdmin && detail.status === "RESOLVED" && (
                            <Button
                              disabled={busy || reportDirty || !notes.trim() || !prevention.trim()}
                              onClick={() =>
                                action(() =>
                                  api(
                                    "/incidents/" + selected + "/close",
                                    "POST",
                                    {},
                                  ),
                                )
                              }
                            >
                              장애 종료
                            </Button>
                          )}
                        </div>
                        {isAdmin && detail.status === "RESOLVED" && <p className="small muted mt-3">{reportDirty ? "수정한 내용을 먼저 저장하면 장애를 종료할 수 있습니다." : !notes.trim() || !prevention.trim() ? "조치 후기와 재발 방지 대책을 입력하고 저장하세요." : "저장된 후기와 예방 대책을 확인한 후 종료하세요."}</p>}
                        {recoveryProof && <details className="mt-4"><summary>복구 검증 원본 보기</summary><pre>{JSON.stringify(parse(recoveryProof), null, 2)}</pre></details>}
                      </Panel>
                      <Panel title="보고서 다운로드">
                        {["RESOLVED", "CLOSED"].includes(detail.status) ? (
                          <>
                            <div className="flex-row">
                              <Button asChild variant="outline">
                                <a
                                  href={
                                    "/api/incidents/" + selected + "/report/pdf"
                                  }
                                  download
                                >
                                  <Download size={15} />
                                  PDF 보고서
                                </a>
                              </Button>
                              <Button asChild variant="outline">
                                <a
                                  href={
                                    "/api/incidents/" +
                                    selected +
                                    "/report/xlsx"
                                  }
                                  download
                                >
                                  <Download size={15} />
                                  Excel 보고서
                                </a>
                              </Button>
                            </div>
                            <Json
                              value={detail.report}
                              label="저장된 보고서 증적"
                            />
                          </>
                        ) : (
                          <p className="muted">
                            복구 검증 완료 후 다운로드할 수 있습니다.
                          </p>
                        )}
                      </Panel>
                      <Panel title="감사 증적">
                        {detail.audit.map((a: Row) => (
                          <div key={a.id} className="mb-3">
                            <div className="flex-row small">
                              <Chip>{a.actor}</Chip>
                              <strong>{a.action}</strong>
                              <span className="muted">
                                {formatTime(a.created_at)}
                              </span>
                            </div>
                            <Json value={a.data_json} />
                          </div>
                        ))}
                      </Panel>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
                setView("dashboard");
                setNewTitle("");
                setNewObservations("");
              }, "장애가 등록되었습니다. 분석 상태는 실시간 실행 흐름에서 확인하세요.");
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
              <div className="banner">
                실제 개인정보나 운영 시스템 로그를 입력하지 마세요. 가상 관측
                데이터만 사용합니다.
              </div>
              <div className="space-y-5">
                <label>등록 실행 모드<select value={mode} onChange={e => setMode(e.target.value)}><option value="REAL">실제 AI 모드</option><option value="DEMO">시연 모드 · Mock</option></select></label>
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
      {notice && !error && (
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
