import type {Row} from './workroom-model';
// Explicitly selected local preview only. Never an automatic fallback for a failed live request.
export const demoUser={operatorId:'DEMO-OP-1',displayName:'데모 담당자',role:'USER'};
const templates=[
 ['DEMO-01','주문 API 오류 원인 확인','SYS-ORDER','주문 서비스','DEMO-OP-1','민서 · 데모','ANALYZING','P1','주문 API의 간헐적 오류를 분석합니다.','diagnosis','working'],
 ['DEMO-02','DB 연결 복구 계획 검토','SYS-ORDER','주문 서비스','DEMO-OP-2','지훈 · 데모','WAITING_APPROVAL','P1','연결 풀 복구 계획에 대한 관리자 결정을 기다립니다.','recovery','completed'],
 ['DEMO-03','정산 배치 분석 요청 실패','SYS-BILLING','정산 시스템','DEMO-OP-1','민서 · 데모','FAILED','P1','분석 Provider 통신 실패 기록을 확인해야 합니다.','diagnosis','failed'],
 ['DEMO-04','정산 결과 보고서 확인','SYS-BILLING','정산 시스템','DEMO-OP-3','서연 · 데모','CLOSED','P2','검증과 후기 확인을 마친 가상 업무입니다.','report','completed'],
 ['DEMO-05','인증 장애 판단 근거 검토','SYS-AUTH','인증 플랫폼','DEMO-OP-2','지훈 · 데모','NEEDS_REVIEW','P2','분류 결과의 근거를 관리자에게 확인받는 단계입니다.','impact','completed'],
 ['DEMO-06','인증 복구 후 결과 검증','SYS-AUTH','인증 플랫폼','DEMO-OP-3','서연 · 데모','RECOVERING','P2','승인된 가상 조치의 검증 기록을 작성합니다.','recovery','working'],
 ['DEMO-07','지식 검색 연결 확인','SYS-KNOWLEDGE','지식 서비스','DEMO-OP-1','민서 · 데모','REGISTERED','P3','지식 조회 지연에 대한 분석 시작을 기다립니다.','knowledge','submitted'],
 ['DEMO-08','지식 서비스 후기 검토','SYS-KNOWLEDGE','지식 서비스','DEMO-OP-1','민서 · 데모','RESOLVED','P3','복구 이후 담당자의 후기 저장이 필요합니다.','report','completed'],
];
export const demoRecords:Row[]=templates.map(([id,title,system_id,system_name,owner_id,owner_name,status,severity,observations,agent,agentStatus],index)=>({id,title,system_id,system_name,asset_id:`DEMO-ASSET-${index}`,asset_name:system_name,owner_id,owner_name,status,severity,observations,created_at:'2026-11-01T09:00:00+09:00',updated_at:'2026-11-01T09:12:00+09:00',notes:'',prevention:'',mode:'DEMO',fictional:true,events:[{id:1,stage:status==='FAILED'?'FAILURE':status==='WAITING_APPROVAL'?'APPROVAL':'AGENT_'+agent.toUpperCase(),state:status==='FAILED'?'FAILED':status==='WAITING_APPROVAL'?'WAITING':agentStatus==='working'?'RUNNING':'COMPLETED',message:status==='FAILED'?'데모 분석 Provider 연결 실패 · 자동 성공 처리하지 않음':observations,created_at:'2026-11-01T09:12:00+09:00'}],tasks:[{id:`DEMO-AGENT-${index}`,agent,status:agentStatus,updated_at:'2026-11-01T09:12:00+09:00',result_json:agentStatus==='completed'?JSON.stringify({artifacts:[{parts:[{kind:'data',data:{summary:observations,fictional:true,source:'LOCAL_DEMO'}}]}]}):null}],report:status==='CLOSED'?{summary:'가상 검증 기록과 담당자 후기를 저장했습니다.',fictional:true,source:'LOCAL_DEMO'}:null}));
