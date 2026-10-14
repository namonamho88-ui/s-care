"use client";
import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { analysisStages, categoryLabel } from "@/lib/analysis-performance.mjs";
import { stageLabel, eventStateLabel } from "@/lib/incident-guide.mjs";

type Row = Record<string, any>;
const ms = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${Math.round(value).toLocaleString("ko-KR")} ms` : "분리 측정 불가";
const at = (value: string) => value ? new Date(value).toLocaleTimeString("ko-KR", {hour12:false,timeZone:"Asia/Seoul"}) : "미기록";
const stateLabel = (state: string) => ({ABANDONED:"이전 실행 중단 · 재시작",CANCELLED:"중단",INTERRUPTED:"실행 종료 · 완료 미확인"}[state] || eventStateLabel(state));

export default function AnalysisPerformance({incident}: {incident: Row}) {
  const [now,setNow] = useState(Date.now);
  const active = ["REGISTERED","ANALYZING","RECOVERING"].includes(incident.status) && !incident.deleted_at;
  useEffect(() => { if (!active) return; const timer=setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); },[active,incident.id]);
  const stages=analysisStages(incident,now), main=stages.filter(row=>!row.nested), nested=stages.filter(row=>row.nested);
  if (!stages.length) return null;
  const running=main.filter(row=>row.state==="RUNNING");
  const render = (row: Row) => <li key={row.stage} className={`analysis-stage ${row.state.toLowerCase()}`}>
    <div className="analysis-stage-title">{row.state==="RUNNING"?<LoaderCircle size={15} className="working-spinner"/>:row.state==="COMPLETED"?<Check size={15}/>:null}<strong>{stageLabel(row.stage)}</strong><span>{stateLabel(row.state)}</span><b>{row.elapsedMs===null?"시간 미확인":row.state==="RUNNING"?`${Math.floor(row.elapsedMs/1000)}초 경과`:ms(row.elapsedMs)}</b></div>
    <small>{categoryLabel(row.category)}{row.provider?` · ${row.provider}`:""}</small>
    <details><summary>시각·추론·통신 측정</summary><p>시작 {at(row.startedAt)} · 종료 {row.endedAt?at(row.endedAt):"미완료"} (KST){!row.measured?" · 이벤트 시각 기준":""}</p><p>모델 추론 {ms(row.modelInferenceMs)} · HTTP 왕복 {ms(row.httpElapsedMs)} · 네트워크 대기 {ms(row.networkWaitMs)} · 재시도 {Number.isFinite(row.retryCount)?`${row.retryCount}회`:"미기록"}</p></details>
  </li>;
  return <section className="analysis-performance workflow-card" aria-label="단계별 분석 실행 현황">
    <h3>단계별 분석 실행 현황 · 가상 장애</h3>
    <p className="small" aria-live="polite">{running.length?`현재 실행: ${running.map(row=>stageLabel(row.stage)).join(" / ")}`:active?"다음 실행 상태 확인 중":"저장된 실행 결과"}</p>
    <ul className="analysis-stages">{main.map(render)}</ul>
    {nested.length>0&&<details className="mt-3"><summary>A2A 내부 실행 측정 {nested.length}개 · 상위 단계와 시간 중복</summary><ul className="analysis-stages">{nested.map(render)}</ul></details>}
    <p className="small muted mt-3">병렬·중첩 단계의 시간은 합산하지 않습니다. HTTP 왕복에는 서버 대기·추론이 포함되며, 제공자가 추론 시간을 보내지 않으면 네트워크 대기와 분리할 수 없습니다.</p>
  </section>;
}
