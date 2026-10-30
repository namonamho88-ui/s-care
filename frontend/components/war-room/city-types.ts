export type Metrics={success:number;latency:number;queue:number;pool:number;recurrence:boolean};
export type Clue={id:string;text:string;zone:string;name?:string;player?:string};
export type Training={id:string;revision:number;stage:string;role:string;roles:Record<string,string>;started:number;deadline:number;finished:number;overtime:boolean;cause:string;selected:string;approved:boolean;feedback:string;executionAt:number;verifyAt:number;clues:Clue[];privateClues:Clue[];votes:Record<string,string>;names:Record<string,string>;trials:Record<string,{metrics:Metrics;effect:string;safe:boolean}>;badges:Record<string,string[]>;pings:{player:string;name:string;zone:string;at:number}[];messages:{name:string;text:string;at:number}[];before:Metrics;metrics:Metrics};
export const ROLES=['관제 담당','분석 담당','복구 담당','상황 책임자'];
export const ZONES=[{id:'square',name:'작전 테이블',hint:'공유 근거와 각 담당자의 판단을 확인하세요',x:0,z:1.7},{id:'shop',name:'승인 관제석',hint:'관제 담당 · 카드 승인 지연과 연결 대기 확인',x:-3.8,z:-4.8},{id:'app',name:'애플리케이션 서버',hint:'분석 담당 · 최근 배포 이력 확인',x:-8,z:-4.4},{id:'db',name:'DB 서버',hint:'관제 담당 · DB 자체 부하 확인',x:-8,z:.6},{id:'network',name:'로그 분석석',hint:'분석 담당 · 통신과 연결 오류 로그 확인',x:6.8,z:-3.3},{id:'trial',name:'복구·승인석',hint:'복구 담당은 조치를 시험하고 상황 책임자는 근거를 검토합니다',x:6.8,z:1.1}];
export const STAGE_NAMES:Record<string,string>={LOBBY:'대기실',CLUES:'단서 수집',CAUSE:'원인 판단',TRIAL:'복구안 시험',APPROVAL:'훈련 내 대응 승인',READY:'복구 실행 준비',EXECUTING:'복구 실행',VERIFY:'정상화 검증',RESULT:'서비스 정상화',TIMEOUT:'5분 시간 초과'};
export const ACTIONS:Record<string,string>={restart:'애플리케이션 재시작',bypass:'트래픽 우회',rollback:'배포 롤백'};
export const CAUSES:Record<string,string>={leak:'새 버전의 DB 연결 반환 누락',database:'DB 자체의 쿼리 처리 과부하',network:'네트워크 패킷 손실'};
export const NORMAL:Metrics={success:99.95,latency:180,queue:0,pool:38,recurrence:false};
export const FAULT:Metrics={success:72,latency:4800,queue:120,pool:100,recurrence:true};
export function displayedMetrics(t:Training,now:number):Metrics{
 if(t.stage!=='EXECUTING')return t.metrics;
 const p=Math.min(1,Math.max(0,(now-t.executionAt)/8000));
 return {success:Math.round((t.before.success+(t.metrics.success-t.before.success)*p)*100)/100,latency:Math.round(t.before.latency+(t.metrics.latency-t.before.latency)*p),queue:Math.round(t.before.queue+(t.metrics.queue-t.before.queue)*p),pool:Math.round(t.before.pool+(t.metrics.pool-t.before.pool)*p),recurrence:t.metrics.recurrence};
}
