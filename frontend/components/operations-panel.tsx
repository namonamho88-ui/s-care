"use client";
import {useEffect,useState} from "react";
import PaginatedList from "./pagination";
import { usePageActivity } from "@/components/use-page-activity";
type Row=Record<string,any>;
export default function OperationsPanel({api,onOpen,revision}:{api:(p:string,m?:string,b?:any)=>Promise<any>;onOpen:(id:string)=>void;revision:number}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const keepLive=usePageActivity(data?.jobs?.some((job:Row)=>["QUEUED","RUNNING"].includes(job.status))??false);
 useEffect(()=>{if(!keepLive)return;let alive=true;const load=()=>{if(document.hidden)return;api('/operations').then(d=>{if(alive){setData(d);setError("");}}).catch(e=>{if(alive)setError(e.message);});};load();const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer);};},[api,revision,keepLive]);
 return <section className="panel mt-5" aria-label="처리 시간과 알림"><div className="panel-head"><h2>처리 시간과 알림</h2><span className="chip amber">가상 알림 · 외부 발송 없음</span></div><div className="panel-body">
 {error&&<p role="alert">{error}</p>}{!data?<p className="muted">처리 현황을 불러오는 중입니다.</p>:<>
 <div className="flex-row"><strong>첫 대응 평균 {data.mttaSamples?`${data.mttaMinutes}분`:'측정 전'}</strong><span className="small muted">사람이 검토·승인·수정한 {data.mttaSamples}건 기준</span><strong>복구 평균 {data.mttrSamples?`${data.mttrMinutes}분`:'측정 전'}</strong><span className="small muted">복구 시각이 있는 {data.mttrSamples}건 · 시드 이력 포함</span></div>
 <p className="small muted">대기시간 기준을 넘기면 관리자 확인 알림을 기록합니다. 자동 승인·복구는 하지 않습니다. 화면 사용 중에는 다른 사용자의 변경을 최대 1분 안에 갱신합니다. 5분간 사용하지 않거나 탭을 숨기면 자동 조회를 멈추고, 돌아오면 다시 갱신합니다.</p>
 <details><summary>단계별 대기시간 · {data.stages.filter((x:Row)=>x.overdue).length}건 기준 초과</summary><PaginatedList<Row> label="단계 대기" items={data.stages}>{rows=>rows.map(x=><div key={x.id} className="system"><button type="button" onClick={()=>onOpen(x.id)}>{x.title}</button><p>{x.elapsedMinutes}분 경과 / 기준 {x.targetMinutes}분 {x.overdue?'· 관리자 확인 필요':''}</p></div>)}</PaginatedList></details>
 <details><summary>승인 요청·시간 초과 알림 · {data.notifications.filter((x:Row)=>!x.acknowledged_at).length}건 미확인</summary><PaginatedList<Row> label="가상 알림" items={data.notifications}>{rows=>rows.map(x=><div className="system" key={x.id}><p>{x.message}</p><span className="small">가상 웹훅 {x.status==='SIMULATED'?'수신 확인':x.status==='FAILED'?'수신 실패':'전송 대기'} · 실제 Slack/Teams 전송 아님</span><div className="flex-row"><button onClick={()=>onOpen(x.incident_id)}>장애 열기</button><button disabled={busy||!!x.acknowledged_at} onClick={async()=>{setBusy(true);try{await api(`/notifications/${x.id}/ack`,'POST',{});setData(await api('/operations'));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{x.acknowledged_at?'확인 완료':'알림 확인'}</button></div></div>)}</PaginatedList></details>
 <details><summary>저장된 작업 큐 · 재시작 시 이어받기</summary><p className="small muted">최대 3회 작업 시도 · 완료 단계 재사용 · 중단/삭제는 재개하지 않음</p><PaginatedList<Row> label="작업 큐" items={data.jobs}>{rows=>rows.map(x=><div className="system" key={x.id}><button onClick={()=>onOpen(x.incident_id)}>{x.incident_id}</button><p>{({QUEUED:'실행 대기',RUNNING:'실행 중',COMPLETED:'처리 완료',FAILED:'실패 · 확인 필요',CANCELLED:'중단됨'} as Row)[x.status]||x.status} · {x.attempts}회 시도</p>{x.error&&<p>{x.error}</p>}</div>)}</PaginatedList></details>
 </> }</div></section>;
}
