"use client";
import { useEffect, useState } from "react";
import { X, MessageSquareText, LoaderCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Preview = { parsed: { kind: string; status: string; eligible: boolean; title: string; fields: Record<string,string>; warnings: string[] }; observations: string; existingIncidentId: string; suggestedAssetId: string; matchReason: string };
const examples: Record<string,string> = {
  "배치 비정상 종료": "[Web발신]\n[운영]ABEND: DEMO_BATCH_001 가상해외정산배치.. 20261007 2026-10-07 14:57:40",
  "배치 종료 지연": "[Web발신]\n[운영]DELAY_END: DEMO_BATCH_002 가상환율정보배치.. 20261009 MUST BE END BY 11:00!",
  "TMS 오류율 초과": "[Web발신]\n[가상카드] TMS 온라인 비즈니스오류 임계치 초과 알림\n▶ IF아이디 : [DEMO_IF_001]\n▶ IF명 : [[개인]가상 해외예약목록조회]\n▶ 업무코드 : [DEMO]\n▶ 서비스코드 : [DEMO_SVC_001]\n▶ 대외기관 : [-]\n▶ 거래일자 : [20261008]\n▶ 거래시간 : [1550~1650](1시간)\n▶ 거래집계일시 : [2026-10-08 16:52:41]\n▶ 비교일수 : [5](영업일)동시간대\n▶ 비교기간평균거래건수 : [82]\n▶ 비교기간평균오류건수 : [47]\n▶ 비교기간평균오류율 : [57.35]%\n▶ 오류율임계치 : [95]%\n▶ 현재거래건수 : [46]\n▶ 현재오류건수 : [44]\n▶ 현재오류율 : [95.65]%\n▶ 메시지 수신자 : [가상담당자]\n▶ 메시지 발생일시 : [2026-10-08 17:04:12]",
  "정상 종료 · 등록 제외": "[Web발신]\n[운영]END_OK: DEMO_BATCH_003[배치ID] 가상정산배치[배치명] 20261011 2026-10-11 10:51:31",
};

export default function MessageIntake({ assets, initialMode, provider, api, onClose, onRegistered }: {
  assets: { id: string; name: string; kind: string }[]; initialMode: string; provider: string;
  api: (path: string, method?: string, body?: any) => Promise<any>;
  onClose: () => void; onRegistered: (id: string, duplicate: boolean) => void;
}) {
  const [raw,setRaw]=useState(""), [preview,setPreview]=useState<Preview|null>(null), [asset,setAsset]=useState(""), [mode,setMode]=useState(initialMode);
  const [operation,setOperation]=useState(""), [error,setError]=useState(""), [seconds,setSeconds]=useState(0);
  const busy=!!operation, normal=preview?.parsed.status==="END_OK";
  useEffect(()=>{if(!busy){setSeconds(0);return;}const since=Date.now();const timer=setInterval(()=>setSeconds(Math.floor((Date.now()-since)/1000)),1000);return ()=>clearInterval(timer);},[busy]);
  useEffect(()=>{const stop=(event: KeyboardEvent)=>{if(busy&&event.key==="Escape"){event.preventDefault();event.stopImmediatePropagation();}};document.addEventListener("keydown",stop,true);return ()=>document.removeEventListener("keydown",stop,true);},[busy]);
  function change(value: string){setRaw(value);setPreview(null);setAsset("");setError("");}
  async function inspect(){
    if(busy)return;setOperation("문자 형식·관측값·중복 등록 여부 확인 중");setError("");
    try{const result:Preview=await api("/message-intake/preview","POST",{message:raw});setPreview(result);setAsset(result.suggestedAssetId);}
    catch(e){setError((e as Error).message);setPreview(null);}finally{setOperation("");}
  }
  async function register(){
    if(busy||!preview?.parsed.eligible||!asset)return;setOperation("관측값과 장애 이력 저장 · AI 분석 시작 요청 중");setError("");
    try{const result=await api("/message-intake/register","POST",{message:raw,assetId:asset,mode,provider:mode==="DEMO"?"MOCK":provider});onRegistered(result.id,result.duplicate);}
    catch(e){setError((e as Error).message+" 입력 내용은 유지됩니다. 같은 문자로 다시 요청해도 중복 등록은 방지됩니다.");}finally{setOperation("");}
  }
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="message-intake-title">
    <section className="message-intake drawer" aria-busy={busy}>
      <div className="drawer-head flex-row justify-between"><div><p className="eyebrow">MESSAGE INTAKE</p><h2 id="message-intake-title"><MessageSquareText size={20}/> 문자로 장애 등록</h2></div><Button variant="ghost" aria-label="문자 등록 닫기" disabled={busy} onClick={onClose}><X size={20}/></Button></div>
      <div className="drawer-body">
        <ol className="message-steps" aria-label="문자 등록 순서"><li className={!preview?"active":"done"}>1. 문자 붙여넣기</li><li className={preview?"active":""}>2. 내용·대상 확인</li><li>3. 장애 분석 시작</li></ol>
        <p className="banner">가상·비식별 문자만 사용하세요. 원문 전체와 수신자 목록은 저장하지 않습니다. 이 화면은 문자 붙여넣기 기능이며 휴대폰 자동 수신은 지원하지 않습니다.</p>
        <div className="message-examples"><span className="muted small">가상 예시</span>{Object.keys(examples).map(label=><Button key={label} variant="outline" size="sm" disabled={busy} onClick={()=>change(examples[label])}>{label}</Button>)}</div>
        <label>수신 문자<textarea value={raw} onChange={e=>change(e.target.value)} disabled={busy} maxLength={10000} placeholder="[Web발신]으로 시작하는 문자 한 건을 붙여넣으세요." rows={7}/></label>
        <div className="message-actions"><span className="small muted">서버 규칙으로 항목을 추출합니다. 이 단계에서는 AI를 호출하지 않습니다.</span><Button disabled={busy||!raw.trim()} onClick={inspect}>{preview?"다시 분석":"내용 분석"}<ArrowRight size={16}/></Button></div>
        {busy&&<div className="message-pending" role="status"><LoaderCircle className="working-spinner" size={20}/><div><strong>{operation}</strong><p>{seconds}초 경과 · 서버 응답을 기다리고 있습니다.</p></div></div>}
        {error&&<p className="banner error" role="alert">{error}</p>}
        {preview&&<section className="message-preview" aria-label="문자 분석 결과" aria-live="polite">
          <div className="flex-row justify-between"><h3>{normal?"정상 종료 알림":preview.parsed.kind==="TMS"?"TMS 관측값 확인":"배치 알림 확인"}</h3><span className={"chip "+(normal?"green":"amber")}>{preview.parsed.status}</span></div>
          {normal?<p className="message-normal"><CheckCircle2 size={20}/> END_OK는 정상 종료입니다. 장애를 등록하거나 AI 분석을 시작하지 않습니다.</p>:<p className="guide-point">{preview.parsed.eligible?"다음 할 일 · 추출한 내용과 대상 구성요소를 확인한 뒤 등록하세요.":"현재 관측값을 확인해야 합니다. 문자 장애 등록은 보류됩니다."}</p>}
          <dl className="message-fields">{Object.entries(preview.parsed.fields).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          {preview.parsed.warnings.map(warning=><p key={warning} className="small message-warning">{warning}</p>)}
          {preview.existingIncidentId?<div className="message-duplicate"><h3>이미 등록된 문자입니다</h3><p>{preview.existingIncidentId} · 기존 분석 결과를 확인하세요.</p><Button disabled={busy} onClick={()=>onRegistered(preview.existingIncidentId,true)}>기존 장애 열기<ArrowRight size={16}/></Button></div>:preview.parsed.eligible&&<>
            <label>대상 구성요소<select value={asset} disabled={busy} onChange={e=>setAsset(e.target.value)}><option value="">구성요소를 선택하세요</option>{assets.filter(a=>a.kind!=="SYSTEM").map(a=><option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}</select></label>
            <p className="small muted">{preview.matchReason}</p>
            <label>문자 등록 실행 모드<select value={mode} disabled={busy} onChange={e=>setMode(e.target.value)}><option value="REAL">실제 AI 모드 · {provider}</option><option value="DEMO">시연 모드 · 모의 판단</option></select></label>
            <p className="small muted">{mode==="DEMO"?"외부 모델을 호출하지 않는 시뮬레이션입니다.":"모델의 실제 판단을 요청합니다. Local Jev 연결 실패 시 Mock 전환 여부를 분석 화면에 표시합니다."}</p>
            <details><summary>저장할 제목·관측 내용</summary><h4>{preview.parsed.title}</h4><pre>{preview.observations}</pre></details>
            <div className="message-submit"><p>{asset?"등록 후 장애 처리 화면으로 이동합니다. 근거가 부족하면 담당자 확인 단계에서 멈춥니다.":"등록하려면 대상 구성요소를 선택해 주세요."}</p><Button disabled={busy||!asset} onClick={register}>등록 & 분석 시작<ArrowRight size={16}/></Button></div>
          </>}
        </section>}
      </div>
    </section>
  </div>;
}
