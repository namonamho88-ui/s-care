"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { incidentGuide, incidentSteps, stageLabel, eventStateLabel } from "@/lib/incident-guide.mjs";
import { recoveryNotesDraft } from "@/lib/recovery-notes.mjs";
import { StageTechnologies } from "@/components/technology-guide";
import { stepTechnologyLabels } from "@/lib/technology-guide.mjs";

import IncidentBriefing from "@/components/incident-briefing";

type Row = Record<string, any>;
const types = ["RESOURCE", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"];
const typeNames = ["자원 부족", "데이터베이스", "네트워크", "애플리케이션", "보안"];
const depts = ["PLATFORM", "DATABASE", "NETWORK", "APPLICATION", "SECURITY"];
const deptNames = ["플랫폼운영", "DB운영", "네트워크운영", "업무개발", "보안운영"];
const readJson = (value: any) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { return value; } };

export default function IncidentWorkflow({ open, incident, isAdmin, canEdit, operators, api, onRefresh, onClose, onGraph, renderDecision, renderTimeline, renderAgent }: {
  open: boolean; incident: Row | null; isAdmin: boolean; canEdit: boolean; operators: Row[];
  api: (path: string, method?: string, body?: any) => Promise<any>;
  onRefresh: () => Promise<any>; onClose: () => void; onGraph: () => void;
  renderDecision: (decision: Row | null) => ReactNode;
  renderTimeline: (events: Row[]) => ReactNode;
  renderAgent: (task: Row) => ReactNode;
}) {
  const [step, setStep] = useState(0), [follow, setFollow] = useState(true);
  const [notes, setNotes] = useState(""), [prevention, setPrevention] = useState("");
  const [title, setTitle] = useState(""), [owner, setOwner] = useState("");
  const [type, setType] = useState("RESOURCE"), [severity, setSeverity] = useState("P1"), [department, setDepartment] = useState("PLATFORM");
  const [reason, setReason] = useState("");
  const [operation, setOperation] = useState<{ label: string; since: number } | null>(null);
  const [seconds, setSeconds] = useState(0), [message, setMessage] = useState(""), [error, setError] = useState("");
  const [evidence, setEvidence] = useState("");
  const content = useRef<HTMLDivElement>(null);
  const initialized = useRef("");
  const keyboardStep = useRef(false);
  const id = incident?.id, status = incident?.status;
  const dirty = !!incident && (notes !== incident.notes || prevention !== incident.prevention || title !== incident.title || owner !== incident.owner_id);
  const guide = incidentGuide(incident, { isAdmin, canEdit, dirty, notes, prevention });
  const activeStep = Math.min(5, Math.max(0, guide.step));
  const completed = guide.steps.filter(s => s.state === "complete").length;
  const percent = Math.round(completed / 6 * 100);
  const busy = !!operation;
  const running = ["REGISTERED", "ANALYZING", "RECOVERING"].includes(status);
  const canWriteNotes = canEdit && ["RESOLVED", "CLOSED"].includes(status);
  const draft = recoveryNotesDraft(incident?.notes);
  const proof = draft ? incident?.notes : [...(incident?.events || [])].reverse().find((e: Row) => e.stage === "VERIFY" && e.state === "COMPLETED")?.data_json;

  useEffect(() => {
    if (!incident) return;
    setNotes(recoveryNotesDraft(incident.notes) ?? incident.notes ?? ""); setPrevention(incident.prevention ?? "");
    setTitle(incident.title); setOwner(incident.owner_id); setReason("");
    const suggestedType = incident.decision?.type || incident.type;
    setType(types.includes(suggestedType) ? suggestedType : "RESOURCE");
    setSeverity(incident.decision?.severity || incident.severity || "P1");
    setDepartment(incident.decision?.department || incident.department || "PLATFORM");
    if (initialized.current !== incident.id) { initialized.current = incident.id; setFollow(true); setMessage(""); setError(""); }
  }, [id, status]);
  useEffect(() => {
    if (!incident || !follow) return;
    setStep(activeStep); setEvidence("");
  }, [id, status, activeStep, follow]);
  useEffect(() => {
    if (!incident || !open) return;
    const frame = requestAnimationFrame(() => {
      const el = content.current, head = document.querySelector(".workflow-head");
      if (!el) return;
      el.style.scrollMarginTop = `${(head?.getBoundingClientRect().height || 0) + 12}px`;
      el.scrollIntoView({ block: "start", behavior: "instant" });
      if (keyboardStep.current) document.getElementById(`workflow-tab-${step}`)?.focus({ preventScroll: true });
      else el.focus({ preventScroll: true });
      keyboardStep.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, id, step, evidence]);
  useEffect(() => {
    if (!operation) { setSeconds(0); return; }
    const tick = () => setSeconds(Math.floor((Date.now() - operation.since) / 1000));
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [operation]);

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
  function returnToCurrent() { setFollow(true); setStep(activeStep); setEvidence(""); }
  const command = (suffix: string, body: any, label: string, success: string) => perform(`/incidents/${id}/${suffix}`, "POST", body, label, success);
  const latest = incident?.events?.at(-1);
  const decisionSource = incident?.decision ? incident.decision.simulated ? "시뮬레이션 결과 · 실제 AI 판단 아님" : incident.decision.provider === "OPERATOR" ? "담당자가 확인한 판단" : "실제 AI 모델 판단" : ["REGISTERED", "ANALYZING"].includes(status) ? incident?.mode === "DEMO" ? "시연 모드 · 모의 판단 판단 대기" : "모델 판단 결과 대기" : "저장된 모델 판단 기록 없음";
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
          {guide.steps.map((item, index) => <button key={item.label} id={`workflow-tab-${index}`} role="tab" aria-controls="workflow-stage" aria-selected={step === index} aria-current={item.state === "current" ? "step" : undefined} tabIndex={step === index ? 0 : -1} disabled={busy}
            className={`${item.state} ${step === index ? "selected" : ""}`} onClick={() => selectStep(index)}
            onKeyDown={e => { const next = e.key === "ArrowRight" ? (index + 1) % 6 : e.key === "ArrowLeft" ? (index + 5) % 6 : e.key === "Home" ? 0 : e.key === "End" ? 5 : null; if (next !== null) { e.preventDefault(); keyboardStep.current = true; selectStep(next); } }}>
            <span className="step-point" aria-hidden="true">{item.state === "complete" ? <Check size={14} /> : index + 1}</span><span><strong>{index + 1}. {item.label}</strong><small>{item.state === "complete" ? "완료" : item.state === "current" ? "현재 단계" : "예정"}</small><small>{stepTechnologyLabels[index]}</small></span>
          </button>)}
        </div>
        <div className="workflow-progress-info"><strong>전체 처리 {percent}%</strong><span>6단계 중 {completed}단계 완료 · 완료된 단계 수 기준</span>{(!follow || evidence) && <button onClick={returnToCurrent}>현재 단계로 돌아가기 <ArrowRight size={12} /></button>}</div>
        <div className="workflow-progress-bar" role="progressbar" aria-label="전체 처리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%, 6단계 중 ${completed}단계 완료`}><i style={{width:`${percent}%`}} /></div>
        {operation && <div className="workflow-request" role="status"><LoaderCircle size={16} className="working-spinner" /><strong>{operation.label}</strong><span>서버 응답 대기 중 · <span aria-hidden="true">{seconds}초 경과</span></span></div>}
      </>}
    </header>
    {incident && <div className="workflow-content" ref={content} id="workflow-stage" role="tabpanel" aria-labelledby={`workflow-tab-${step}`} tabIndex={-1}>
      {error && <div className="banner error" role="alert">{error}<Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => { void onRefresh().then(() => setError("")).catch(e => setError(e.message)); }}>상태 다시 확인</Button></div>}
      {message && <p className="workflow-success" role="status"><Check size={15} />{message}</p>}
      <div className={`workflow-instruction ${guide.tone}`} aria-live="polite">
        <span>{step === activeStep ? guide.badge : `${step + 1}단계 ${step < activeStep ? "기록 확인" : "미리 보기"}`}</span>
        <h2>{step === activeStep ? guide.title : `${step + 1}. ${incidentSteps[step].label}`}</h2>
        <p>{step === activeStep ? guide.text : step > activeStep ? "앞 단계를 완료하면 이 단계로 자동 이동합니다. 현재 단계에서 필요한 확인과 입력을 먼저 진행하세요." : "이미 처리한 단계의 기록을 확인하고 있습니다."}</p>
      </div>
      <IncidentBriefing incident={incident} nextAction={guide.title} />
      {evidence ? <section className="workflow-card"><Button size="sm" variant="outline" className="mb-4" onClick={() => setEvidence("")}>단계 입력 화면으로 돌아가기</Button>{evidence === "timeline" ? renderTimeline(incident.events || []) : (incident.tasks || []).map((t: Row) => <div key={t.id} className="mb-5"><h3>{t.agent} Agent</h3>{renderAgent(t)}</div>)}</section> : <>
        <StageTechnologies step={step} incident={incident} />
        {step === 0 && <section className="workflow-card"><h3>접수된 장애 정보</h3>{observed}<p>담당자: {incident.owner_name} · {incident.id}</p>{status === "REGISTERED" && automatic}</section>}
        {step === 1 && <>
          {status === "ANALYZING" && automatic}
          {status === "NEEDS_REVIEW" ? <div className="workflow-form-layout">
            <div>{observed}<div className="workflow-context"><h3>AI 판단 요약</h3><p>{typeNames[types.indexOf(incident.decision?.type)] || incident.type} · {incident.decision?.severity || incident.severity}</p><p>판단 신뢰도 {Math.round((incident.decision?.confidence || 0) * 100)}% · 근거 충분도 {Math.round((incident.decision?.evidenceScore || 0) * 100)}%</p>{reviewReasons.map((r: string) => <p key={r}>{r}</p>)}</div></div>
            {isAdmin ? <section className="workflow-card guide-target" id="guide-review" tabIndex={-1}><h3>지금 작성할 내용 · 판단 확인</h3><p className="small muted">관측과 AI 판단을 비교한 뒤 아래 분류와 확인 근거를 입력하세요.</p>
              <div className="form-grid"><label>장애 유형<select disabled={busy} value={type} onChange={e => setType(e.target.value)}>{types.map((v,i) => <option key={v} value={v}>{typeNames[i]}</option>)}</select></label><label>심각도<select disabled={busy} value={severity} onChange={e => setSeverity(e.target.value)}>{["P1","P2","P3"].map(v => <option key={v}>{v}</option>)}</select></label><label>담당 부서<select disabled={busy} value={department} onChange={e => setDepartment(e.target.value)}>{depts.map((v,i) => <option key={v} value={v}>{deptNames[i]}</option>)}</select></label><label className="full">확인 근거<textarea readOnly={busy} value={reason} onChange={e => setReason(e.target.value)} placeholder="어떤 관측을 확인했는지, 왜 이 분류가 적절한지 작성하세요." /></label></div>
              <p className="small muted">{reason.trim() ? "확정 후 분석이 재개되고 다음 단계가 준비되면 자동 이동합니다." : "확인 근거를 입력하면 아래 버튼이 활성화됩니다."}</p>
              <Button className="mt-4" disabled={busy || !reason.trim()} onClick={() => command("review",{type,severity,department,reason},"판단 확인 근거 저장 중","판단을 저장했습니다. 추가 분석 결과에 따라 다음 단계로 이동합니다.")}>판단 확정 & 분석 계속<ArrowRight size={14}/></Button>
            </section> : <div className="workflow-card">관리자가 판단을 확인해야 분석이 계속됩니다. 작성하거나 승인할 내용은 없습니다.</div>}
          </div> : <section className="workflow-card">{renderDecision(incident.decision)}</section>}
          {evidenceDetails}
        </>}
        {step === 2 && <div className="workflow-form-layout"><div className="workflow-context"><h3>승인 전 확인할 내용</h3><p>영향 가능 자산: {incident.impact?.affected?.length ?? "분석 전"}{incident.impact ? "개" : ""}</p><p>대응 대상: {incident.asset_name}</p><p>승인 후 가상 지표만 변경하며 실제 운영 시스템은 변경하지 않습니다.</p>{incident.impact && <Button size="sm" variant="outline" onClick={onGraph}>영향 그래프 크게 보기</Button>}{evidenceDetails}</div>
          <section className="workflow-card guide-target" id="guide-approval" tabIndex={-1}><h3>지금 작성할 내용 · 대응 사유</h3>{status === "WAITING_APPROVAL" && isAdmin ? <><label>승인 / 거부 사유<textarea readOnly={busy} rows={5} value={reason} onChange={e => setReason(e.target.value)} placeholder="영향 범위와 대응 방법을 검토한 내용을 작성하세요." /></label><p className="small muted">{reason.trim() ? "승인을 선택하면 가상 복구 검증 화면으로 이동합니다." : "사유를 입력하면 승인·거부 버튼이 활성화됩니다."}</p><div className="flex-row mt-4"><Button disabled={busy || !reason.trim()} onClick={() => command("approval",{approved:true,reason},"가상 대응 승인 요청 중","승인했습니다. 가상 복구 검증을 진행합니다.")}>대응 승인<ArrowRight size={14}/></Button><Button variant="danger" disabled={busy || !reason.trim()} onClick={() => command("approval",{approved:false,reason},"대응 거부 사유 저장 중","대응을 거부했습니다. 복구를 실행하지 않습니다.")}>대응 거부</Button></div></> : <p>{status === "WAITING_APPROVAL" ? "관리자의 승인을 기다리고 있습니다. 일반 사용자는 승인 사유를 작성하지 않습니다." : status === "REJECTED" ? "대응이 거부되었습니다. 아래 실행 기록에서 사유를 확인하세요." : step < activeStep ? "대응 승인이 완료되었습니다." : "분석·판단 확인이 끝난 후 관리자에게 승인 입력란이 표시됩니다."}</p>}</section>
        </div>}
        {step === 3 && <section className="workflow-card">{status === "RECOVERING" ? automatic : <h3>{guide.step > 3 ? "가상 복구 검증 완료" : "승인 후 가상 복구를 검증합니다"}</h3>}{renderTimeline((incident.events || []).filter((e: Row) => ["RECOVERY","MCP_ACTION","VERIFY","REPORT","SKILL_DRAFT","HISTORY"].includes(e.stage)))}<p className="small muted">검증·보고서·이력 저장이 끝나면 조치 후기를 작성하는 5단계로 자동 이동합니다.</p></section>}
        {step === 4 && <section className="workflow-card guide-target" id="guide-notes" tabIndex={-1}><h3>지금 작성할 내용 · 조치 후기와 재발 방지 대책</h3>
          {!canEdit && <div className="banner">다른 담당자의 장애는 조회만 가능합니다. 담당자 또는 관리자에게 작성을 요청하세요.</div>}
          {draft && <div className="banner">가상 복구 검증 결과를 한국어 후기 초안으로 정리했습니다. 내용을 검토하고 보완한 뒤 저장하세요. 아직 보고서에 반영되지 않은 초안입니다.</div>}
          <div className="form-grid"><label className="full">조치 후기<textarea rows={6} value={notes} readOnly={!canWriteNotes || busy} onChange={e => setNotes(e.target.value)} placeholder="무엇을 확인했고 어떤 조치·검증을 했는지 작성하세요." /></label><label className="full">재발 방지 대책<textarea rows={3} value={prevention} readOnly={!canWriteNotes || busy} onChange={e => setPrevention(e.target.value)} placeholder="같은 장애를 줄이기 위한 점검·알림·테스트 계획을 작성하세요." /></label></div>
          <details className="workflow-evidence"><summary>제목·담당자 수정</summary><label>장애 제목<input disabled={!isAdmin || busy || !canWriteNotes} value={title} onChange={e => setTitle(e.target.value)} /></label><label>담당자<select aria-label="담당자" disabled={!isAdmin || busy || !canWriteNotes} value={owner} onChange={e => setOwner(e.target.value)}>{operators.map(o => <option key={o.id} value={o.id}>{o.name} · {o.department}</option>)}</select></label></details>
          <p className="small muted">{dirty ? "저장되지 않은 내용이 있습니다. 저장이 완료되면 최종 확인 단계로 이동합니다." : "저장된 내용입니다. 수정할 내용이 없다면 최종 확인 단계로 이동하세요."}</p>
          <div className="flex-row mt-4"><Button disabled={busy || !canWriteNotes || !notes.trim() || !prevention.trim()} onClick={() => perform(`/incidents/${id}`,"PATCH",{...(isAdmin ? {title,ownerId:owner} : {}),notes,prevention},"조치 후기와 재발 방지 대책 저장 중","후기와 예방 대책을 저장했습니다. 최종 확인 후 종료하세요.")}>수정 내용 저장<ArrowRight size={14}/></Button>{!dirty && notes.trim() && prevention.trim() && ["RESOLVED","CLOSED"].includes(status) && <Button variant="outline" onClick={() => selectStep(5)}>최종 확인으로 이동</Button>}</div>
          {proof && <details className="workflow-evidence"><summary>복구 검증 원본 보기</summary><pre>{JSON.stringify(readJson(proof),null,2)}</pre></details>}
        </section>}
        {step === 5 && <section className="workflow-card" id="guide-report" tabIndex={-1}><h3>최종 확인 · 장애 종료</h3><div className="workflow-final-grid"><div><h4>저장된 조치 후기</h4><p>{recoveryNotesDraft(incident.notes) || incident.notes || "아직 작성되지 않았습니다."}</p></div><div><h4>저장된 재발 방지 대책</h4><p>{incident.prevention || "아직 작성되지 않았습니다."}</p></div></div>
          {(dirty || draft || !notes.trim() || !prevention.trim()) && status !== "CLOSED" && <div className="banner">5단계에서 후기와 재발 방지 대책을 검토하고 먼저 저장하세요.</div>}
          <div className="flex-row mt-4"><Button variant="outline" disabled={busy} onClick={() => selectStep(4)}>후기 수정으로 돌아가기</Button>{isAdmin && status === "RESOLVED" && <Button disabled={busy || dirty || !!draft || !notes.trim() || !prevention.trim()} onClick={() => command("close",{},"장애 종료와 이력 저장 확인 중","장애가 종료되었습니다. 전체 6단계를 완료했습니다.")}>장애 종료<Check size={14}/></Button>}{!isAdmin && status === "RESOLVED" && <p>최종 종료는 관리자가 수행합니다.</p>}</div>
          {["RESOLVED","CLOSED"].includes(status) && <div className="flex-row mt-5"><Button asChild size="sm" variant="outline"><a href={`/api/incidents/${id}/report/pdf`} download><Download size={14}/>PDF 보고서</a></Button><Button asChild size="sm" variant="outline"><a href={`/api/incidents/${id}/report/xlsx`} download><Download size={14}/>Excel 보고서</a></Button></div>}
          <p className="small muted mt-4">해결 절차 초안은 장애 종료와 별도로 해결 지식 메뉴에서 관리자가 검토·승인합니다.</p>
        </section>}
        {status === "FAILED" && <section className="workflow-card guide-target" id="guide-retry" tabIndex={-1}><h3>실행 중단 · 원인 확인</h3>{renderTimeline((incident.events || []).filter((e: Row) => e.stage === "FAILURE").slice(-1))}<p>오류 원인을 해결한 후 재시도하세요.</p>{isAdmin && <Button disabled={busy} className="mt-3" onClick={() => command("retry",{},"실패 작업 재시도 요청 중","재시도를 요청했습니다. 실행 상태에 따라 단계가 갱신됩니다.")}>실패 작업 재시도</Button>}</section>}
        {status === "REJECTED" && <section className="workflow-card">{renderTimeline((incident.events || []).filter((e: Row) => e.stage === "APPROVAL"))}</section>}
      </>}
      <details className="workflow-evidence"><summary>전체 실행 기록·감사 로그</summary>{renderTimeline(incident.events || [])}{(incident.audit || []).map((a: Row) => <details key={a.id}><summary>{a.action} · {a.actor}</summary><pre>{JSON.stringify(readJson(a.data_json),null,2)}</pre></details>)}</details>
    </div>}
  </div>;
}
