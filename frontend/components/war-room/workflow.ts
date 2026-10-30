import type {RoomState,Snapshot} from './types';

export const STAGES=['NORMAL','FAULT','ANALYSIS','APPROVAL','RECOVERY','VERIFY','COMPLETE'] as const;
export type Stage=typeof STAGES[number]|'FAILED'|'STOPPED';
export type Fault='DATABASE'|'BATCH'|'SERVER'|'NETWORK';
export const LABELS:Record<Stage,string>={NORMAL:'정상 운영',FAULT:'장애 발생',ANALYSIS:'AI 장애 분석',APPROVAL:'관리자 대응 승인',RECOVERY:'장애 복구 실행',VERIFY:'복구 검증',COMPLETE:'정상화 완료',FAILED:'검증 / 처리 실패 · 재분석 필요',STOPPED:'처리 중단'};
export const DESCRIPTIONS:Record<Stage,string>={NORMAL:'상태등과 데이터 흐름을 관찰하고 운영 요원이 순찰합니다.',FAULT:'장애 위치와 의존 연결을 확인합니다. 운영 요원이 점검 위치로 이동합니다.',ANALYSIS:'분석 요원이 콘솔에서 원인 후보와 영향 범위를 검토합니다.',APPROVAL:'관리자 판단을 기다립니다. 실제 승인은 기존 인증된 장애 화면에서만 수행합니다.',RECOVERY:'승인된 복구 상태를 표현합니다. 캐릭터 동작은 서버 명령이 아닙니다.',VERIFY:'검증 요원이 서버·배치·연결 상태를 확인합니다.',COMPLETE:'서버 검증 성공 후 정상 흐름으로 복귀합니다. 지식 초안은 별도 검토합니다.',FAILED:'경고를 유지합니다. 담당자가 실패 근거를 확인하고 기존 재시도 절차로 재분석합니다.',STOPPED:'중단 또는 삭제된 장애입니다. 복구 완료로 표시하지 않습니다.'};
export const TASKS:Record<Fault,string[]>={DATABASE:['연결 상태 점검','연결 복구','쿼리 검증'],BATCH:['작업 원인 확인','재처리 준비','재실행','결과 확인'],SERVER:['상태 점검','재기동 / 우회','헬스체크'],NETWORK:['경로 점검','연결 복구','통신 검증']};
export type Workflow={stage:Stage;target:string;fault:Fault;source:string;key:string;progress:number|null;detail:string;synthetic:boolean};
export function workflow(state:RoomState):Workflow{
 const r=state.run,i=state.incident;
 const faultType=i?'':r.faultSnapshot?.faults?.[0]?.type||r.current.faults?.[0]?.type||'';
 const target=i?.node||r.faultSnapshot?.faults?.[0]?.target||r.current.faults?.[0]?.target||r.analysis?.target||'db-primary';
 const fault:Fault=target==='mq'||faultType.includes('QUEUE')?'BATCH':target.includes('db')?'DATABASE':target==='gateway'||faultType.includes('NETWORK')?'NETWORK':'SERVER';
 let stage:Stage='NORMAL',progress:number|null=null,detail='서버 최신 상태';
 if(i){stage=(Object.hasOwn(LABELS,i.stage)?i.stage:'FAULT') as Stage;progress=i.approved?i.completedSteps.length/i.totalSteps:null;detail=`${i.status} · 완료 작업 ${i.completedSteps.length}/${i.totalSteps} · ${i.aiSource}`;}
 else if(r.status==='APPROVED'){
  const result=r.results?.find(v=>v.strategyId===r.selectedStrategy);stage=result?.outcome==='SUCCESS'?'COMPLETE':'FAILED';detail=`승인된 합성 계산 결과 · ${result?.outcome||'결과 없음'}`;
 }else if(r.status==='WAITING_APPROVAL'||r.status==='REJECTED')stage='APPROVAL';
 else if(state.busy||['ANALYZED','PLANNED','COMPARED','ANALYZING','GENERATING'].includes(r.status))stage='ANALYSIS';
 else if(r.status==='FAULTED')stage='FAULT';
 return {stage,target,fault,source:i?'연결 장애 · 서버 동기화':r.analysis?.actualModelCall?'Twin · 모델 응답':'Twin · 합성 규칙 모델',key:i?`${i.node}:${stage}`:`${r.id||'idle'}:${stage}`,progress,detail,synthetic:!i};
}
export function demoWorkflow(step:number,fault:Fault,progress:number):Workflow{
 const stage=STAGES[Math.min(6,Math.max(0,step))];return {stage,target:({DATABASE:'db-primary',BATCH:'mq',SERVER:'app-1',NETWORK:'gateway'})[fault],fault,source:'로컬 시연 · AI 호출 / 운영 명령 없음',key:`demo:${fault}:${step}`,progress:stage==='RECOVERY'?progress:null,detail:stage==='RECOVERY'?TASKS[fault][Math.min(TASKS[fault].length-1,Math.floor(progress*TASKS[fault].length))]:'시연용 단계 · 실제 처리와 분리',synthetic:true};
}
export function visualSnapshot(snapshot:Snapshot,w:Workflow,demo:boolean):Snapshot{
 if(!demo&&!w.source.startsWith('연결 장애'))return snapshot;
 const healthy=w.stage==='NORMAL'||w.stage==='COMPLETE';
 return {...snapshot,nodes:snapshot.nodes.map(n=>({...n,status:healthy?'HEALTHY':n.id===w.target?(w.stage==='RECOVERY'||w.stage==='VERIFY'?'WARNING':w.fault==='SERVER'?'OFFLINE':'FAILED'):'HEALTHY'}))};
}
