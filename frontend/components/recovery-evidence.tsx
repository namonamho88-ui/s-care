"use client";
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {recoveryEvidence,stateLabels,stateValue,stateChanges} from '@/lib/recovery-evidence.mjs';
type Row=Record<string,any>;
export default function RecoveryEvidence({incident,isAdmin,api,onRefresh}:{incident:Row;isAdmin:boolean;api:(p:string,m?:string,b?:any)=>Promise<any>;onRefresh:()=>Promise<any>}){
 const {plan,execution}=recoveryEvidence(incident);
 const [evidence,setEvidence]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function supplement(){if(busy)return;setBusy(true);setError('');try{await api(`/incidents/${incident.id}/recovery-evidence`,'POST',{evidence,reason});await onRefresh();setEvidence('');setReason('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!plan)return <section className="workflow-card"><h3>가상 조치 내역</h3><p>이전 지표 검증 기록에는 구체적인 조치 과정이 없습니다. 새로 접수한 장애부터 조치 계획과 실행 증적을 기록합니다.</p></section>;
 const checks=Array.isArray(execution?.checks)?execution.checks:[];
 const keys=Object.keys(stateLabels).filter(k=>execution?.before?.[k]!==undefined&&(!plan.batch||!['errorRate','latencyMs','healthyDependencies'].includes(k)));
 return <section className="workflow-card" aria-label="가상 조치 계획과 실행 근거">
  <h3>{execution?'수행한 가상 조치와 검증':'승인 전 가상 조치 계획'}</h3>
  <p><strong>{plan.label}</strong> · 규칙 기반 시나리오 선택 · 실제 AI 원인 확정 아님</p>
  <p className="small muted">{plan.dataSource}</p>
  <details open={!plan.supported}><summary>조치 선택 근거</summary>{plan.basis.map((text:string)=><p key={text}>{text}</p>)}<p className="small">{plan.caution}</p></details>
  {!plan.supported?<div className="banner">원인 근거가 부족하거나 여러 오류가 함께 감지되었습니다. 조치를 자동 실행하거나 복구 성공으로 처리하지 않습니다. 오류 코드·실패 단계·선행 작업 상태를 보완하세요.</div>:<ol>{plan.actions.map((action:Row,index:number)=>{const step=execution?.steps?.find((s:Row)=>s.code===action.code);return <li key={action.code} className="mt-3"><strong>{index+1}. {action.label}</strong>{step&&<><p>{step.passed?'가상 실행 완료':'가상 실행 실패'}</p>{stateChanges(step).map((change:string)=><p className="small muted" key={change}>{change}</p>)}</>}</li>;})}</ol>}
  {execution&&<><h4 className="mt-4">합성 상태 변화</h4><div style={{overflowX:'auto'}}><table className="small"><thead><tr><th>검증 대상</th><th>조치 전</th><th>조치 후</th></tr></thead><tbody>{keys.map(key=><tr key={key}><td>{(stateLabels as Row)[key]}</td><td>{stateValue(execution.before[key])}</td><td>{stateValue(execution.after[key])}</td></tr>)}</tbody></table></div>
   {checks.length>0&&<><h4 className="mt-4">항목별 검증 결과 · {execution.passed?'통과':'실패'}</h4>{checks.map((check:Row)=><p key={check.label}>{check.passed?'✓':'✕'} {check.label} · 기대 {stateValue(check.expected)} / 결과 {stateValue(check.actual)}</p>)}</>}
  </>}
  {incident.status==='WAITING_APPROVAL'&&isAdmin&&<details className="mt-4" open={!plan.supported}><summary>추가 오류 근거 입력 · 조치 계획 재검토</summary><p className="small muted">가상·비민감 오류 코드와 내용만 입력하세요. 기존 AI 원인 후보를 확정하거나 운영 데이터를 변경하지 않습니다.</p><label>추가 오류 근거<textarea maxLength={1000} value={evidence} readOnly={busy} onChange={e=>setEvidence(e.target.value)} placeholder="예: ORA-00060 deadlock detected, 실패 단계: DB 갱신"/></label><label>근거 확인 사유<textarea maxLength={1000} value={reason} readOnly={busy} onChange={e=>setReason(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<Button disabled={busy||!evidence.trim()||!reason.trim()} onClick={supplement}>{busy?'재검토 중':'근거 저장 & 조치 계획 재검토'}</Button></details>}
  <p className="small muted mt-4">모든 실행·상태·데이터는 합성 시뮬레이션입니다. 실제 배치 재실행·DB 변경·운영 명령은 수행하지 않습니다.</p>
 </section>;
}
