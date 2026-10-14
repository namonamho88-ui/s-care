"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type Row = Record<string, any>;
const names: Record<string,string>={JEV_LOCAL:"Jev · 로컬 모델",JEV_TYPESAFE:"Jev · TypeSafe",HERMES:"Hermes · 설정된 LLM"};
const cost=(value: unknown)=>typeof value==="number"&&Number.isFinite(value)?`약 US$ ${value.toFixed(4)}`:"알 수 없음 · 제공자 요금 확인 필요";

export default function ModelWarmup({api}: {api:(path:string,method?:string,body?:any)=>Promise<any>}) {
  const [data,setData]=useState<Row|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState("");
  const [results,setResults]=useState<Record<string,Row>>({});
  const load=useCallback(async(clearLocalResults=false)=>{try{setData(await api("/admin/models/warmup"));if(clearLocalResults)setResults({});setError("");}catch(e){setError((e as Error).message);}},[api]);
  useEffect(()=>{void load();},[load]);
  async function run(target:string) {
    if(busy)return;
    setBusy(target);setError("");
    try{const result=await api("/admin/models/warmup","POST",{target,mode:"REAL",performInference:true});setResults(current=>({...current,[target]:result}));await load();}
    catch(e){setError((e as Error).message);}finally{setBusy("");}
  }
  return <section className="workflow-card model-warmup" aria-label="관리자 모델 워밍업">
    <h2>관리자 모델 워밍업</h2><p>설정 조회는 모델을 호출하지 않습니다. 실행 버튼을 누르면 가상 관측값으로 모델 추론을 최대 1회 요청합니다. 준비 상태 확인이며 분석 정확도 평가는 아닙니다.</p>
    <Button className="mt-3" size="sm" variant="outline" disabled={!!busy} onClick={()=>void load(true)}>호출 없이 설정·제한 새로고침</Button>
    {error&&<p className="banner error mt-3" role="alert">{error}</p>}
    {!data&&!error&&<p role="status">워밍업 설정을 불러오는 중입니다.</p>}
    <div className="warmup-targets">{data?.targets?.map((target:Row)=>{
      const result=results[target.target]||target.lastResult, blocked=target.inFlight||target.retryAfterMs>0||target.remainingThisHour<=0;
      return <article key={target.target} className="system"><h3>{names[target.target]||target.target}</h3><p>예상 비용: {cost(target.estimatedCostUsd)}</p><p className="small muted">관리자 설정 추정치이며 실제 청구 금액이 아닙니다. 시간당 최대 {target.maxPerHour}회 · 남은 {target.remainingThisHour}회 · 최소 간격 {target.cooldownSeconds}초</p>
        {!target.configured&&<p>모델 연결 설정이 필요합니다.</p>}{blocked&&<p role="status">{target.inFlight?"워밍업 진행 중":`호출 제한 중 · 약 ${Math.ceil((target.retryAfterMs||0)/1000)}초 후 설정 새로고침`}</p>}
        <Button className="mt-3" disabled={!!busy||!target.configured||blocked} onClick={()=>void run(target.target)}>{busy===target.target?"모델 응답 확인 중…":`${names[target.target]||target.target} 실제 추론 1회 실행`}</Button>
        {result?.status&&<div className="warmup-result mt-3" role="status"><strong>{({READY:"모델 응답 확인 완료",FAILED:"준비 상태 확인 실패",BLOCKED:"호출 제한",NOT_CALLED:"모델 호출 없음"} as Row)[result.status]||result.status}</strong><p>호출 시도: {result.modelCallAttempted?"예":"아니요"} · 실제 모델 응답 확인: {result.actualModelCall?"예":"아니요"}</p><p>예상 비용: {cost(result.estimatedCostUsd)}{Number.isFinite(result.latencyMs)?` · ${result.latencyMs} ms`:""}</p>{result.endedAt&&<p className="small">확인 시각: {new Date(result.endedAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"})} KST</p>}{result.provider&&<p>{result.provider} · {result.model||"모델명 미확인"}</p>}{result.reason&&<p className="small">{result.reason}</p>}</div>}
      </article>;
    })}</div>
  </section>;
}
