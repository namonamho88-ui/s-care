"use client";
import IncidentImpact from "./incident-impact";
import RecoveryEvidence from "./recovery-evidence";
import {recoveryEvidence} from "@/lib/recovery-evidence.mjs";
import SimilarPanel from "./similar-panel";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { incidentGuide, incidentSteps, stageLabel, eventStateLabel } from "@/lib/incident-guide.mjs";
import { recoveryNotesDraft } from "@/lib/recovery-notes.mjs";
import { StageTechnologies } from "@/components/technology-guide";
import { stepTechnologyLabels } from "@/lib/technology-guide.mjs";

import IncidentBriefing from "@/components/incident-briefing";
import AnalysisPerformance from "@/components/analysis-performance";
import { categoryLabel, resultCategory } from "@/lib/analysis-performance.mjs";

type Row = Record<string, any>;
const types = ["RESOURCE", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"];
const typeNames = ["자원 부족", "데이터베이스", "네트워크", "애플리케이션", "보안"];
const depts = ["PLATFORM", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"];
const deptNames = ["플랫폼운영", "DB운영", "네트워크운영", "업무개발", "보안운영"];
const readJson = (value: any) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return value; } };

export default function IncidentWorkflow({ open, incident, isAdmin, canEdit, operators, assets, edges, api, onRefresh, onClose, onGraph, renderDecision, renderTimeline, renderAgent }: {
  open: boolean; incident: Row | null; isAdmin: boolean; canEdit: boolean; operators: Row[]; assets:any[]; edges:any[];
  api: (path: string, method?: string, body?: any) => Promise<any>;
  onRefresh: () => Promise<any>; onClose: () => void; onGraph: () => void;
  renderDecision: (decision: Row | null) => ReactNode;
  renderTimeline: (events: Row[]) => ReactNode;
  renderAgent: (task: Row) => ReactNode;
}) {
  const [step, setStep] = useState(0), [follow, setFollow] = useState(true);
  const [scrollRequest,setScrollRequest] = useState(0);
  const [notes, setNotes] = useState(""), [prevention, setPrevention] = useState("");
  const [title, setTitle] = useState(""), [owner, setOwner] = useState("");
  const [type, setType] = useState("RESOURCE"), [severity, setSeverity] = useState("P1"), [department, setDepartment] = useState("PLATFORM");
  const [reason, setReason] = useState("");
  const [operation, setOperation] = useState<{ label: string; since: number } | null>(null);
  const [seconds, setSeconds] = useState(0), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [evidence, setEvidence] = useState("");
  const [manageAction,setManageAction]=useState("stop"), [manageReason,setManageReason]=useState(""), [confirmation,setConfirmation]=useState("");
  const content = useRef<HTMLDivElement>(null);
  const initialized = useRef("");
  const keyboardStep = useRef(false);
  const id = incident?.id, status = incident?.status;
  const stopped = status === "CANCELLED" || !!incident?.deleted_at;
  const dirty = !!incident && (notes !== incident.notes || prevention !== incident.prevention || title !== incident.title || owner !== incident.owner_id);
  const guide = incidentGuide(incident, { isAdmin, canEdit, dirty, notes, prevention });
  const activeStep = Math.min(5, Math.max(0, guide.step));
  const completed = guide.steps.filter(s => s.state === "complete").length;
  const percent = Math.round(completed / 6 * 100);
  const busy = !!operation;
  const running = !stopped && ["REGISTERED", "ANALYZING", "RECOVERING"].includes(status);
  const canWriteNotes = !stopped && canEdit && ["RESOLVED", "CLOSED"].includes(status);
  const inputTarget = !stopped && !evidence ? step===1 && status==="NEEDS_REVIEW" && isAdmin ? "review" : step===2 && status==="WAITING_APPROVAL" && isAdmin ? "approval" : step===4 && canWriteNotes ? "notes" : step===5 && status==="RESOLVED" && isAdmin ? "close" : "" : "";
  const draft = recoveryNotesDraft(incident?.notes);
  const proof = draft ? incident?.notes : [...(incident?.events || [])].reverse().find((e: Row) => e.stage === "VERIFY" && e.state === "COMPLETED")?.data_json;

  useEffect(() => {
    if (!incident) return;
    setNotes(recoveryNotesDraft(incident.notes) ?? incident.notes ?? ""); setPrevention(incident.prevention ?? "");
    setManageReason("");setConfirmation("");setManageAction(incident.deleted_at ? "restore" : ["CLOSED","CANCELLED","REJECTED"].includes(incident.status) ? "delete" : "stop");
    setTitle(incident.title); setOwner(incident.owner_id); setReason("");
    const suggestedType = incident.decision?.type || incident.type;
    setType(types.includes(suggestedType) ? suggestedType : "RESOURCE");
    setSeverity(incident.decision?.severity || incident.severity || "P1");
    setDepartment(incident.decision?.department || incident.department || "PLATFORM");
    if (initialized.current !== incident.id) { initialized.current = incident.id; setFollow(true); setMessage(""); setError(""); }
  }, [id, status, incident?.deleted_at]);
  useEffect(() => {
    if (!incident || !follow) return;
    setStep(activeStep); setEvidence("");
  }, [id, status, activeStep, follow]);
  useEffect(() => {
    if (!incident || !open) return;
    const frame = requestAnimationFrame(() => {
      const el = (inputTarget ? document.getElementById(`guide-${inputTarget}`) : null) || content.current, head = document.querySelector(".workflow-head");
      if (!el) return;
      el.style.scrollMarginTop = `${(head && getComputedStyle(head).position==="sticky" ? head.getBoundingClientRect().height : 0) + 12}px`;
      el.scrollIntoView({ block: "start", behavior: "instant" });
      if (keyboardStep.current) document.getElementById(`workflow-tab-${step}`)?.focus({ preventScroll: true });
      else el.focus({ preventScroll: true });
      keyboardStep.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, id, step, evidence, inputTarget, scrollRequest]);
  useEffect(() => {
    if (!operation) { setSeconds(0); return; }
    const tick = () => setSeconds(Math.floor((Date.now() - operation.since) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [operation]);

  useEffect(() => { setMessage(""); setError(""); }, [id, status, step]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function perform(path: string, method: string, body: any, label: string, success: string) {
    if (busy) return;
    setOperation({ label, since: Date.now() }); setError(""); setMessage("");
    let accepted = false;
    try {
      await api(path, method, body); accepted = true;
      setOperation({ label: "처리 결과와 다음 단계 확인 중", since: Date.now() });
      await onRefresh(); setMessage(success); setFollow(true); setEvidence("");
    } catch (e) {
      setError((accepted ? "요청은 처리됐지만 화면 갱신에 실패했습니다. 중복 실행하지 말고 상태를 다시 확인하세요. " : "") + (e as Error).message);
    } finally { setOperation(null); }
  }
  function selectStep(index: number) { setFollow(false); setEvidence(""); setStep(index); }
  function returnToCurrent() { setFollow(true); setStep(activeStep); setEvidence(""); setScrollRequest(n=>n+1); }
  const command = (suffix: string, body: any, label: string, success: string) => perform(`/incidents/${id}/${suffix}`, "POST", body, label, success);
  const recoveryPlan = recoveryEvidence(incident).plan;
  const latest = incident?.events?.filter((event: Row)=>event.stage!=="PERFORMANCE").at(-1);
  const decisionSource = incident?.decision ? categoryLabel(resultCategory(incident.decision)) : ["REGISTERED", "ANALYZING"].includes(status) ? incident?.mode === "DEMO" ? "DEMO Mock · 모의 판단 대기" : "모델 판단 결과 대기" : "저장된 모델 판단 기록 없음";
  const reviewReasons = readJson(incident?.events?.filter((e: Row) => e.stage === "HARNESS" && e.state === "COMPLETED").at(-1)?.data_json)?.reviewReasons || [];
  const diagnosis = incident?.tasks?.filter((t: Row) => t.agent === "diagnosis").at(-1);
  const automatic = <div className="workflow-auto">
    <LoaderCircle size={22} className={running ? "working-spinner" : ""} />
    <div><h3>{guide.title}</h3><p>{guide.phase || (latest ? `${stageLabel(latest.stage)} · ${eventStateLabel(latest.state)}` : "백엔드 실행 이벤트를 기다리고 있습니다.")}</p><small>입력 없이 자동으로 진행됩니다. 확인이 필요하거나 다음 단계가 준비되면 화면이 전환됩니다.</small></div>
  </div>;
  const observed = <div className="workflow-context"><h3>발생한 현상</h3><p>{incident?.observations}</p><small>{incident?.system_name} / {incident?.asset_name}</small></div>;
  const evidenceDetails = <details className="workflow-evidence"><summary>AI 판단·원인 후보·처리 근거 더보기</summary>
    {renderDecision(incident?.decision || null)}
    {diagnosis && <div className="mt-4">{renderAgent(diagnosis)}</div>}
    <div className="flex-row mt-4">
      <Button size="sm" variant="outline" onClick={() => setEvidence("timeline")}>실행 타임라인</Button>
      <Button size="sm" variant="outline" onClick={() => setEvidence("agents")}>AI 도우미 협업</Button>
      <Button size="sm" variant="outline" onClick={() => { selectStep(4); }}>후기 & 보고서</Button>
    </div>
  </details>;
  return <div className="drawer workflow-drawer" onKeyDownCapture={e => { if (busy && e.key === "Escape") e.stopPropagation(); }}>
    <header className="workflow-head">
      <div className="workflow-title"><div><span className="small muted">장애 처리 · {id || "조회 중"}</span><h2>{incident?.title || "장애 정보를 불러오고 있습니다…"}</h2>{incident && <p className="workflow-provider">{decisionSource}{incident.decision && ` · ${incident.decision.provider} · ${Number.isFinite(incident.decision.latencyMs) ? incident.decision.latencyMs + "ms" : "소요 시간 미기록"}`}{incident.decision?.fallback && " · 연결 실패 후 모의 판단으로 대체"}</p>}</div><Button variant="outline" size="sm" aria-label="상세 닫기" onClick={onClose} disabled={busy}><ArrowLeft size={14} />관제로 돌아가기</Button></div>
      {incident && <>
        <div className="workflow-stepper" role="tablist" aria-label="장애 처리 단계">
          {guide.steps.map((item, index) => <button key={item.label} id={`workflow-tab-${index}`} role="tab" aria-controls="workflow-stage" aria-selected={step === index} aria-current={item.state === "current" ? "step" : undefined} tabIndex={step === index ? 0 : -1} disabled={busy || stopped}
            className={`${item.state} ${step === index ? "selected" : ""}`} onClick={() => selectStep(index)}
            onKeyDown={e => { const next = e.key === "ArrowRight" ? (index + 1) % 6 : e.key === "ArrowLeft" ? (index + 5) % 6 : e.key === "Home" ? 0 : e.key === "End" ? 5 : null; if (next !== null) { e.preventDefault(); keyboardStep.current = true; selectStep(next); } }}>
            <span className="step-point" aria-hidden="true">{item.state === "complete" ? <Check size={14} /> : item.state === "current" && running ? <LoaderCircle size={14} className="working-spinner" /> : index + 1}</span><span><strong>{index + 1}. {item.label}</strong><small>{item.state === "complete" ? "완료" : item.state === "current" ? running ? "처리 중" : "현재 단계" : "예정"}</small><small>{stepTechnologyLabels[index]}</small>{index === 2 && <small>관리자 전용</small>}</span>
          </button>)}
        </div>
        {!stopped && <><div className="workflow-progress-info"><strong>전체 처리 {percent}%</strong><span>6단계 중 {completed}단계 완료 · 완료된 단계 수 기준</span>{(!follow || evidence) && <button onClick={returnToCurrent}>현재 단계로 돌아가기 <ArrowRight size={12} /></button>}</div>
        <div className="workflow-progress-bar" role="progressbar" aria-label="전체 처리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%, 6단계 중 ${completed}단계 완료`}><i style={{width:`${percent}%`}} /></div></>}
        {operation && <div className="workflow-request" role="status"><LoaderCircle size={16} className="working-spinner" /><strong>{operation.label}</strong><span>서버 응답 대기 중 · <span aria-hidden="true">{seconds}초 경과</span></span></div>}
      </>}
    </header>
    {incident && <div className="workflow-content" data-active-input={inputTarget} ref={content} id="workflow-stage" role="tabpanel" aria-labelledby={`workflow-tab-${step}`} tabIndex={-1}>
      {error && <div className="banner error" role="alert">{error}<Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => { void onRefresh().then(() => setError("")).catch(e => setError(e.message)); }}>상태 다시 확인</Button></div>}
      {message && <p className="workflow-success" role="status"><Check size={15} />{message}</p>}
      <div className={`workflow-instruction ${guide.tone}`} aria-live="polite">
        <span>{stopped || step === activeStep ? guide.badge : `${step + 1}단계 ${step < activeStep ? "기록 확인" : "미리 보기"}`}</span>
        <h2>{stopped || step === activeStep ? guide.title : `${step + 1}. ${incidentSteps[step].label}`}</h2>
        <p>{stopped || step === activeStep ? guide.text : step > activeStep ? "앞 단계를 완료하면 이 단계로 자동 이동합니다. 현재 단계에서 필요한 확인과 입력을 먼저 진행하세요." : "이미 처리한 단계의 기록을 확인하고 있습니다."}</p>
        {inputTarget && <Button variant="outline" size="sm" onClick={()=>setScrollRequest(n=>n+1)}>{inputTarget === "close" ? "최종 종료 버튼으로 이동" : "현재 작성 위치로 이동"} <ArrowRight size={14}/></Button>}
      </div>
      {isAdmin && <details className="workflow-evidence incident-management" key={`${id}-${status}-${incident.deleted_at || "visible"}`}><summary>관리자 작업 · 강제 종료 / 삭제 / 복원</summary>
        <p className="small muted">강제 종료는 복구 완료가 아닙니다. 삭제하면 목록·집계에서 제외하며 기록은 보존해 복원할 수 있습니다. 이미 전송한 AI 요청은 도착할 수 있지만 후속 처리에는 반영하지 않습니다.</p>
        <label>관리 작업<select aria-label="관리 작업" value={manageAction} disabled={busy} onChange={e=>{setManageAction(e.target.value);setConfirmation("");}}>
          {incident.deleted_at ? <option value="restore">삭제 복원</option> : <>{!["CLOSED","CANCELLED","REJECTED"].includes(status) && <option value="stop">강제 종료</option>}<option value="delete">삭제 · 복원 가능</option></>}
        </select></label>
        <label>처리 사유<textarea aria-label="처리 사유" maxLength={1000} value={manageReason} readOnly={busy} onChange={e=>setManageReason(e.target.value)} placeholder="중복 등록, 시연 종료 등 처리 사유를 작성하세요." /></label>
        <label>확인용 장애 번호<input aria-label="확인용 장애 번호" value={confirmation} readOnly={busy} onChange={e=>setConfirmation(e.target.value)} placeholder={id} autoComplete="off" /></label>
        <p className="small">위 장애 번호 {id}를 그대로 입력하세요. {manageAction === "restore" ? "복원해도 강제 종료한 작업은 다시 실행되지 않습니다." : "진행 중인 작업이 있으면 중단됩니다. 저장하지 않은 입력 내용은 처리에 포함되지 않습니다."}</p>
        <Button className="mt-3" variant={manageAction === "restore" ? "outline" : "danger"} disabled={busy || !manageReason.trim() || confirmation !== id} onClick={()=>perform(`/incidents/${id}/manage/${manageAction}`,"POST",{reason:manageReason,confirmation},"관리자 작업 처리 중",manageAction === "restore" ? "삭제한 장애를 복원했습니다. 작업은 자동 재개되지 않습니다." : manageAction === "delete" ? "목록에서 삭제했습니다. 장애 이력의 삭제된 장애 보기에서 복원할 수 있습니다." : "강제 종료했습니다. 복구 완료로 기록하지 않습니다.")}>{manageAction === "restore" ? "삭제 복원 실행" : manageAction === "delete" ? "장애 삭제 실행" : "강제 종료 실행"}</Button>
      </details>}
      <IncidentBriefing incident={incident} nextAction={guide.title} />
      <AnalysisPerformance incident={incident} />
      {stopped ? <section className="workflow-card"><h3>{incident.deleted_at ? "삭제된 장애 · 기록 보존" : "강제 종료 · 복구 완료 아님"}</h3><p>중단 사유: {incident.stop_reason || "강제 종료 기록 없음"}</p>{observed}{renderTimeline(incident.events || [])}</section> : evidence ? <section className="workflow-card"><Button size="sm" variant="outline" className="mb-4" onClick={() => setEvidence("")}>단계 입력 화면으로 돌아가기</Button>{evidence === "timeline" ? renderTimeline(incident.events || []) : (incident.tasks || []).map((t: Row) => <div key={t.id} className="mb-5"><h3>{t.agent} Agent</h3>{renderAgent(t)}</div>)}</section> : <>
        <StageTechnologies step={step} incident={incident} />
        {step === 0 && <section className="workflow-card"><h3>접수된 장애 정보</h3>{observed}<p>담당자: {incident.owner_name} · {incident.id}</p>{status === "REGISTERED" && automatic}</section>}
        {step === 1 && <><IncidentImpact key={incident.id} incident={incident} assets={assets} edges={edges} api={api}/>
          {status === "ANALYZING" && automatic}
          {status === "NEEDS_REVIEW" ? <div className="workflow-form-layout">
            <div>{observed}<div className="workflow-context"><h3>AI 판단 요약</h3><p>{typeNames[types.indexOf(incident.decision?.type)] || incident.type} · {incident.decision?.severity || incident.severity}</p>{diagnosis && <div className="mt-3">{renderAgent(diagnosis)}</div>}<p>판단 신뢰도 {Math.round((incident.decision?.confidence || 0) * 100)}% · 근거 충분도 {Math.round((incident.decision?.evidenceScore || 0) * 100)}%</p>{reviewReasons.map((r: string) => <p key={r}>{r}</p>)}</div></div>
            {isAdmin ? <section className="workflow-card guide-target" id="guide-review" tabIndex={-1}><h3>지금 작성할 내용 · 판단 확인</h3><p className="small muted">접수된 관측·AI 분류·원인 후보·영향 범위를 함께 확인하세요. 아래 내용을 한 번 저장하면 분석이 이어집니다.</p>
              <div className="form-grid"><label>장애 유형<select disabled={busy} value={type} onChange={e => setType(e.target.value)}>{types.map((v,i) => <option key={v} value={v}>{typeNames[i]}</option>)}</select></label><label>심각도<select disabled={busy} value={severity} onChange={e => setSeverity(e.target.value)}>{["P1","P2","P3"].map(v => <option key={v}>{v}</option>)}</select></label><label>담당 부서<select disabled={busy} value={department} onChange={e => setDepartment(e.target.value)}>{depts.map((v,i) => <option key={v} value={v}>{deptNames[i]}</option>)}</select></label><label className="full">확인 근거<textarea readOnly={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="어떤 관측을 확인했는지, 왜 이 분류가 적절한지 작성하세요." /></label></div>
              <p className="small muted">{reason.trim() ? "확정 후 분석이 재개되고 다음 단계가 준비되면 자동 이동합니다." : "확인 근거를 입력하면 아래 버튼이 활성화됩니다."}</p>
              <Button className="mt-4" disabled={busy || !reason.trim()} onClick={() => command("review",{type,severity,department,reason},"판단 확인 근거 저장 중","판단 확정 내용을 저장했습니다. 대응 승인 준비가 끝나면 자동으로 이동합니다.")}>판단 확정 & 분석 계속<ArrowRight size={14}/></Button>
            </section> : <div className="workflow-card">관리자가 판단을 확인해야 분석이 계속됩니다. 작성하거나 승인할 내용은 없습니다.</div>}
          </div> : <section className="workflow-card">{renderDecision(incident.decision)}</section>}
          {evidenceDetails}
        </>}
        {[2,3,4].includes(step) && <RecoveryEvidence key={id} incident={incident} isAdmin={isAdmin} api={api} onRefresh={onRefresh}/> }
        {step === 2 && <div className="workflow-form-layout"><div className="workflow-context"><IncidentImpact incident={incident} assets={assets} edges={edges} api={api} summary onExpand={()=>{setFollow(false);setStep(1);setEvidence("");}}/><p>승인된 조치 계획에 따라 실행하고 결과를 검증합니다.</p>{incident.impact?.affected&&<Button size="sm" variant="outline" onClick={onGraph}>영향 그래프 크게 보기</Button>}{evidenceDetails}</div>
          <section className="workflow-card guide-target" id="guide-approval" tabIndex={-1}><h3>관리자 대응 승인 · 관리자 전용</h3><p className="small muted">승인 입력란과 승인·거부 버튼은 관리자 권한 계정에만 표시됩니다. 일반 사용자는 진행 상태만 조회할 수 있습니다.</p>{status === "WAITING_APPROVAL" && isAdmin ? <><label>승인 / 거부 사유<textarea readOnly={busy} rows={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="영향 범위와 대응 방법을 검토한 내용을 작성하세요." /></label><p className="small muted">{recoveryPlan?.supported===false ? "추가 오류 근거를 보완해 실행 가능한 조치 계획을 먼저 확인하세요. 대응 거부는 사유 입력 후 가능합니다." : reason.trim() ? "승인을 선택하면 복구 결과 검증 화면으로 이동합니다." : "사유를 입력하면 승인·거부 버튼이 활성화됩니다."}</p><div className="flex-row mt-4"><Button disabled={busy || !reason.trim() || recoveryPlan?.supported===false} onClick={() => command("approval",{approved:true,reason},"관리자 대응 승인 요청 중","승인했습니다. 복구 결과를 검증합니다.")}>관리자 대응 승인<ArrowRight size={14}/></Button><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => command("approval",{approved:false,reason},"대응 거부 사유 저장 중","대응을 거부했습니다. 복구를 실행하지 않습니다.")}>관리자 대응 거부</Button></div></> : <p>{status === "WAITING_APPROVAL" ? "관리자 대응 승인 대기 중입니다. 관리자 권한 계정에만 승인 입력란과 승인·거부 버튼이 표시됩니다." : status === "REJECTED" ? "대응이 거부되었습니다. 아래 실행 기록에서 사유를 확인하세요." : step < activeStep ? "대응 승인이 완료되었습니다." : "분석·판단 확인이 끝난 후 관리자에게 승인 입력란이 표시됩니다."}</p>}</section>
        </div>}
        {step === 3 && <section className="workflow-card">{status === "RECOVERING" ? automatic : <h3>{guide.step > 3 ? "복구 검증 완료" : "승인 후 복구 결과를 검증합니다"}</h3>}{renderTimeline((incident.events || []).filter((e: Row) => ["RECOVERY","RECOVERY_ACTION","RECOVERY_CHECKS","MCP_ACTION","VERIFY","REPORT","SKILL_DRAFT","HISTORY"].includes(e.stage)))}<p className="small muted">검증·보고서·이력 저장이 끝나면 조치 후기를 작성하는 5단계로 자동 이동합니다.</p></section>}
        {step === 4 && <section className="workflow-card guide-target" id="guide-notes" tabIndex={-1}><h3>지금 작성할 내용 · 조치 후기와 재발 방지 대책</h3>
          {!canEdit && <div className="banner">다른 담당자의 장애는 조회만 가능합니다. 담당자 또는 관리자에게 작성을 요청하세요.</div>}
          {draft && <div className="banner">복구 검증 결과를 조치 후기 초안으로 정리했습니다. 내용을 검토하고 보완한 뒤 저장하세요. 아직 보고서에 반영되지 않은 초안입니다.</div>}
          <div className="form-grid"><label className="full">조치 후기<textarea rows={6} value={notes} readOnly={!canWriteNotes || busy} onChange={e => setNotes(e.target.value)} placeholder="무엇을 확인했고 어떤 조치·검증을 했는지 작성하세요." /></label><label className="full">재발 방지 대책<textarea rows={3} value={prevention} readOnly={!canWriteNotes || busy} onChange={e => setPrevention(e.target.value)} placeholder="같은 장애를 줄이기 위한 점검·알림·테스트 계획을 작성하세요." /></label></div>
          <details className="workflow-evidence"><summary>제목·담당자 수정</summary><label>장애 제목<input disabled={!isAdmin || busy || !canWriteNotes} value={title} onChange={e => setTitle(e.target.value)} /></label><label>담당자<select aria-label="담당자" disabled={!isAdmin || busy || !canWriteNotes} value={owner} onChange={e => setOwner(e.target.value)}>{operators.map(o => <option key={o.id} value={o.id}>{o.name} · {o.department}</option>)}</select></label></details>
          <p className="small muted">{dirty ? "저장되지 않은 내용이 있습니다. 저장이 완료되면 최종 확인 단계로 이동합니다." : "저장된 내용입니다. 수정할 내용이 없다면 최종 확인 단계로 이동하세요."}</p>
          <div className="flex-row mt-4"><Button disabled={busy || !canWriteNotes || !notes.trim() || !prevention.trim()} onClick={() => perform(`/incidents/${id}`,"PATCH",{...(isAdmin ? {title,ownerId:owner} : {}),notes,prevention},"조치 후기와 재발 방지 대책 저장 중","후기와 예방 대책을 저장했습니다. 최종 확인 후 종료하세요.")}>수정 내용 저장<ArrowRight size={14}/></Button>{!dirty && notes.trim() && prevention.trim() && ["RESOLVED","CLOSED"].includes(status) && <Button variant="outline" onClick={() => selectStep(5)}>최종 확인으로 이동</Button>}</div>
          {proof && <details className="workflow-evidence"><summary>복구 검증 원본 보기</summary><pre>{JSON.stringify(readJson(proof),null,2)}</pre></details>}
        </section>}
        {step === 5 && <section className="workflow-card" id="guide-report" tabIndex={-1}><h3>최종 확인 · 장애 종료</h3><div className="workflow-final-grid"><div><h4>저장된 조치 후기</h4><p>{recoveryNotesDraft(incident.notes) || incident.notes || "아직 작성되지 않았습니다."}</p></div><div><h4>저장된 재발 방지 대책</h4><p>{incident.prevention || "아직 작성되지 않았습니다."}</p></div></div>
          {(dirty || draft || !notes.trim() || !prevention.trim()) && status !== "CLOSED" && <div className="banner">5단계에서 후기와 재발 방지 대책을 검토하고 먼저 저장하세요.</div>}
          <div className="flex-row mt-4 workflow-close-actions" id="guide-close" tabIndex={-1}><Button variant="outline" disabled={busy} onClick={() => selectStep(4)}>후기 수정으로 돌아가기</Button>{isAdmin && status === "RESOLVED" && <Button disabled={busy || dirty || !!draft || !notes.trim() || !prevention.trim()} onClick={() => command("close",{},"장애 종료와 이력 저장 확인 중","장애가 종료되었습니다. 전체 6단계를 완료했습니다.")}>장애 종료<Check size={14}/></Button>}{!isAdmin && status === "RESOLVED" && <p>최종 종료는 관리자가 수행합니다.</p>}</div>
          {["RESOLVED","CLOSED"].includes(status) && <div className="flex-row mt-5"><Button asChild size="sm" variant="outline"><a href={`/api/incidents/${id}/report/pdf`} download><Download size={14}/>PDF 보고서</a></Button><Button asChild size="sm" variant="outline"><a href={`/api/incidents/${id}/report/xlsx`} download><Download size={14}/>Excel 보고서</a></Button></div>}
          <p className="small muted mt-4">해결 절차 초안은 장애 종료와 별도로 해결 지식 메뉴에서 관리자가 검토·승인합니다.</p>
        </section>}
        {status === "FAILED" && <section className="workflow-card guide-target" id="guide-retry" tabIndex={-1}><h3>실행 중단 · 원인 확인</h3>{renderTimeline((incident.events || []).filter((e: Row) => e.stage === "FAILURE").slice(-1))}<p>오류 원인을 해결한 후 재시도하세요.</p>{isAdmin && <Button disabled={busy} className="mt-3" onClick={() => command("retry",{},"실패 작업 재시도 요청 중","재시도를 요청했습니다. 실행 상태에 따라 단계가 갱신됩니다.")}>실패 작업 재시도</Button>}</section>}
        {status === "REJECTED" && <section className="workflow-card">{renderTimeline((incident.events || []).filter((e: Row) => e.stage === "APPROVAL"))}</section>}
      </>}
      <SimilarPanel key={incident.id} id={incident.id} api={api}/>
      <details className="workflow-evidence"><summary>전체 실행 기록·감사 로그</summary>{renderTimeline(incident.events || [])}{(incident.audit || []).map((a: Row) => <details key={a.id}><summary>{a.action} · {a.actor}</summary><pre>{JSON.stringify(readJson(a.data_json),null,2)}</pre></details>)}</details>
    </div>}
  </div>;
}
