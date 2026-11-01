/** Pure sandbox. No I/O, operational mutations, or measured telemetry. */
export type Kind = 'entry'|'service'|'database'|'queue'|'external'|'feature';
export type Component = {id:string;name:string;short:string;kind:Kind;zone:number;position:[number,number];role:string;evidence:string;baseline:{latency:number;throughput:number}};
export type Dependency = {from:string;to:string;label:string;timeout:number;retries:number;fallback?:'mock'|'sql';evidence:string};
export const components:Component[] = [
 {id:'portal',name:'Next.js 관제 화면',short:'관제 화면',kind:'entry',zone:0,position:[-8,-6],role:'장애 접수·관제 UI. 정적 화면과 서버 요청은 구분됩니다.',evidence:'frontend/app/page.tsx',baseline:{latency:40,throughput:60}},
 {id:'bff',name:'Same-origin BFF',short:'BFF',kind:'service',zone:0,position:[-8,0],role:'브라우저 요청을 백엔드로 전달하고 인증 쿠키를 관리합니다.',evidence:'frontend/app/api/[...path]/route.ts',baseline:{latency:20,throughput:60}},
 {id:'api',name:'Spring Boot API',short:'Spring API',kind:'service',zone:0,position:[-8,6],role:'장애·자산·승인·보고 API. Agent들은 별도 서버가 아니라 같은 JVM의 논리 역할입니다.',evidence:'docs/ARCHITECTURE.md §1 · compose.yaml backend',baseline:{latency:60,throughput:60}},
 {id:'intake',name:'장애 접수·분석',short:'접수·분석',kind:'feature',zone:1,position:[-2,-6],role:'등록한 장애를 저장하고 DB 작업 큐를 통해 분석합니다.',evidence:'backend/src/main/java/demo/brain/DurableQueue.java',baseline:{latency:150,throughput:30}},
 {id:'impact',name:'연관 시스템 영향 분석',short:'영향 분석',kind:'feature',zone:1,position:[-2,-2],role:'자산의 역방향 의존 관계를 탐색합니다. 원인 확정과는 다릅니다.',evidence:'backend/src/main/java/demo/brain/Ontology.java',baseline:{latency:120,throughput:30}},
 {id:'knowledge',name:'AI 지식 초안 생성',short:'지식 초안',kind:'feature',zone:1,position:[-2,2],role:'Hermes로 초안을 생성합니다. 승인된 지식 검색과 다른 기능입니다.',evidence:'backend/src/main/java/demo/brain/HttpHermesAdapter.java',baseline:{latency:200,throughput:10}},
 {id:'report',name:'장애 이력·보고 조회',short:'이력·보고',kind:'feature',zone:1,position:[-2,6],role:'PostgreSQL에 저장한 장애 결과와 보고서를 조회합니다.',evidence:'docs/ARCHITECTURE.md §3 · §4',baseline:{latency:100,throughput:30}},
 {id:'pg',name:'PostgreSQL',short:'PostgreSQL',kind:'database',zone:2,position:[5,-5],role:'자산·장애·승인·지식·보고서의 원본 저장소. 복제 DB는 확인되지 않았습니다.',evidence:'compose.yaml postgres · application.yml datasource',baseline:{latency:15,throughput:120}},
 {id:'graph',name:'Neo4j',short:'Neo4j',kind:'database',zone:2,position:[5,1],role:'자산 의존 관계의 투영. 기본 GRAPH_REQUIRED=true. 런타임 장애 시 자동 SQL 우회는 없습니다.',evidence:'Ontology.java impact() · application.yml graph-required',baseline:{latency:25,throughput:60}},
 {id:'queue',name:'PostgreSQL 작업 큐',short:'DB 작업 큐',kind:'queue',zone:2,position:[5,7],role:'work_jobs 테이블·임대 기반 재개. 독립 Kafka/RabbitMQ 서버가 아닙니다.',evidence:'backend/src/main/java/demo/brain/DurableQueue.java',baseline:{latency:100,throughput:30}},
 {id:'jev',name:'Local Jev',short:'Jev',kind:'external',zone:3,position:[11,-4],role:'REAL/LOCAL 장애 판단 모델. 통신 실패 시 명시적 MOCK_FALLBACK, 저신뢰는 검토 대상입니다.',evidence:'JevRouter.java · LocalJevProvider.java · compose.yaml jevos',baseline:{latency:200,throughput:20}},
 {id:'hermes',name:'Hermes API',short:'Hermes',kind:'external',zone:3,position:[11,4],role:'지식 초안 생성 연동. 실패 시 MOCK_HERMES_FALLBACK을 기록합니다.',evidence:'HttpHermesAdapter.java · compose.yaml hermes',baseline:{latency:250,throughput:10}},
];
const dep=(from:string,to:string,label:string,timeout=2000,retries=0,fallback?:Dependency['fallback']):Dependency=>({from,to,label,timeout,retries,fallback,evidence:'호출 관계: 저장소 확인 · 지연/재시도 경계: 실험 가정'});
// Arrows represent requests from consumer to dependency; failure travels in reverse.
export const dependencies:Dependency[]=[dep('portal','bff','화면 데이터 요청'),dep('bff','api','REST / SSE'),dep('api','pg','조회·저장'),dep('intake','portal','접수 화면 사용'),dep('intake','queue','분석 작업 등록'),dep('queue','api','동일 JVM 실행 의존'),dep('queue','pg','work_jobs / lease'),dep('queue','jev','LOCAL 판단',30000,1,'mock'),dep('impact','portal','영향 분석 화면 사용'),dep('impact','graph','역방향 그래프 탐색',3000,0,'sql'),dep('knowledge','portal','지식 생성 화면 사용'),dep('knowledge','hermes','초안 생성',90000,0,'mock'),dep('report','portal','보고서 조회 화면 사용')];
export const zones=['접근 · API','사용자 기능','데이터 · 작업','AI 연동'];
export const faults={down:'서비스·서버 중단',latency:'응답 지연·타임아웃',database:'DB 연결 장애',network:'네트워크 단절',cpu:'CPU 부족',memory:'메모리 부족',traffic:'트래픽 급증',queue:'메시지 처리 적체',external:'외부 API 장애'} as const;
export type FaultType=keyof typeof faults;
export type Experiment={target:string;type:FaultType;intensity:number;duration:number;recoverAt:number|null};
export type Policy={sqlMode:boolean;mockFallback:boolean};
export const defaultPolicy:Policy={sqlMode:false,mockFallback:true};
export type Result={id:string;loss:number;delay:number;warning:boolean;status:'정상'|'주의'|'장애'|'영향받음';path:string[];reason:string;at:number;metrics:{error:number;latency:number;throughput:number}};
export function allowedFaults(c:Component):FaultType[]{return (Object.keys(faults) as FaultType[]).filter(t=>t!=='database'||c.kind==='database').filter(t=>t!=='queue'||c.kind==='queue').filter(t=>t!=='external'||c.kind==='external');}
export function validateExperiment(e:Experiment){const c=components.find(n=>n.id===e.target);if(!c||!allowedFaults(c).includes(e.type)||!Number.isFinite(e.intensity)||e.intensity<.1||e.intensity>1||!Number.isInteger(e.duration)||e.duration<10||e.duration>300||e.recoverAt!==null&&(!Number.isFinite(e.recoverAt)||e.recoverAt<0))throw Error('대상·유형·강도(10~100%)·기간(10~300초)을 확인하세요.');}
export function simulate(e:Experiment|null,time:number,policy:Policy=defaultPolicy):Result[]{
 if(e)validateExperiment(e);
 const stop=e?Math.min(e.duration,e.recoverAt??Infinity):0;
 const memo=new Map<string,Result>();
 const evaluate=(id:string,clock:number,stack:string[]=[]):Result=>{
  const key=id+':'+clock;if(memo.has(key))return memo.get(key)!;if(stack.includes(id))throw Error('순환 의존 관계');
  const c=components.find(n=>n.id===id)!;
  let loss=0,delay=0,warning=false,path:string[]=[],reason='현재 모델에서 영향 경로 없음',at=0;
  const active=!!e&&id===e.target&&clock>=0&&clock<stop+4;
  if(active&&e){const recovery=clock<stop?1:Math.max(0,1-(clock-stop)/4),v=e.intensity*recovery;
   loss=['down','database','network','external'].includes(e.type)?v:['cpu','memory','traffic','queue'].includes(e.type)?Math.max(0,v-.4)*.85:0;
   delay=(e.type==='latency'?6000:e.type==='queue'?8000:['cpu','memory','traffic'].includes(e.type)?2500:3000)*v;
   warning=v>0;path=[id];reason=`${faults[e.type]} · 강도 ${Math.round(e.intensity*100)}%${clock>=stop?' · 복구 램프 4초':''}`;
  }
  for(const edge of dependencies.filter(d=>d.from===id)){
   // SQL fallback is an explicit disabled-driver deployment mode, never automatic outage failover.
   if(edge.fallback==='sql'&&policy.sqlMode)continue;
   const wait=edge.timeout*(1+edge.retries)/1000;
   const d=evaluate(edge.to,clock-wait,[...stack,id]);
   if(!d.path.length)continue;
   const failed=Math.max(d.loss,d.delay>edge.timeout?Math.min(1,(d.delay-edge.timeout)/edge.timeout):0);
   const transportFailure=!!e&&(['down','network','external'].includes(e.type)||(e.type==='latency'&&d.delay>edge.timeout));
   const canMock=edge.fallback==='mock'&&policy.mockFallback&&transportFailure;
   const nextLoss=canMock?0:failed;
   const nextDelay=Math.min(d.delay,edge.timeout)*(1+edge.retries);
   const severity=nextLoss*100000+nextDelay;
   if(severity>=loss*100000+delay||!path.length){path=[id,...d.path];reason=`${edge.label}: ${edge.timeout}ms × ${1+edge.retries}회 대기${canMock?' 후 명시적 Mock 대체 (실제 모델 결과 아님)':''}`;at=d.at+wait;}
   // Conservative worst dependency, not additive percentages; avoid double-counting shared DB.
   loss=Math.max(loss,nextLoss);delay=Math.max(delay,nextDelay);warning=warning||d.warning||canMock;
  }
  const status=path.length?(id===e?.target?'장애':loss>.01||delay>800?'영향받음':'주의'):'정상';
  const r:Result={id,loss,delay,warning,status,path,reason,at,metrics:{error:Math.round(loss*100),latency:Math.round(c.baseline.latency+delay),throughput:Math.round(c.baseline.throughput*(1-loss)/(1+delay/2000))}};memo.set(key,r);return r;
 };
 return components.map(c=>evaluate(c.id,Math.max(0,time)));
}
export function settledAt(e:Experiment){return Math.min(e.duration,e.recoverAt??Infinity)+105;}
export function phase(e:Experiment|null,time:number){return !e?'정상':time<Math.min(e.duration,e.recoverAt??Infinity)?'장애 실험 중':time<settledAt(e)?'정상화 관측':'정상화 완료';}
export const nameOf=(id:string)=>components.find(n=>n.id===id)?.name||id;
export function exposure(e:Experiment|null,time:number,policy:Policy=defaultPolicy){
 const seen=new Map<string,{first:number;last:number;peak:Result}>();
 if(e)for(let t=0;t<=Math.min(Math.ceil(time),settledAt(e));t++)for(const r of simulate(e,t,policy))if(r.path.length){const old=seen.get(r.id);seen.set(r.id,{first:old?.first??t,last:t,peak:old&&old.peak.loss*100000+old.peak.delay>r.loss*100000+r.delay?old.peak:r});}
 return seen;
}
