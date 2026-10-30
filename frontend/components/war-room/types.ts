export type Node={id:string;name:string;kind:string;status:string;availability:number;latency:number;errorRate:number;cpu:number;memory:number};
export type Edge={source:string;target:string;relation:string;group:string};
export type Snapshot={nodes:Node[];edges:Edge[];faults:{target:string;type:string}[]};
export type Player={id:string;name:string;role:string;floor:number;x:number;z:number;direction:number;contributions:number};
export type Result={strategyId:string;outcome:string;recoverySeconds:number;availability:number;latency:number;errorRate:number;residualRisk:number;steps:{action:string;target:string;reason:string;applied:boolean;snapshot:Snapshot}[];after:Snapshot};
export type Run={id?:string;status:string;current:Snapshot;baseline?:Snapshot;faultSnapshot?:Snapshot;analysis?:{cause:string;target:string;source:string;reason:string;actualModelCall:boolean;modelCallAttempted?:boolean;evidence:Node[];affected:string[]};generation?:{source:string;reason:string};strategies?:{id:string;name:string;risk:string;preconditions:string;expectedEffect:string}[];results?:Result[];recommendation?:{strategyId:string;reason:string};selectedStrategy?:string};
export type RoomState={type:'state';room:string;revision:number;players:Player[];run:Run;chat:{id:string;name:string;text:string;at:number}[];busy:boolean;operation:string;error:string;started:number;completed:number;incidentLinked:boolean;checks:number;knowledgeId?:string};
export const FLOORS=['데이터센터','네트워크 · API','장애대응 워룸','AI 통합 관제실'];
export const STATUS:Record<string,string>={NORMAL:'정상',FAULTED:'장애 발생',ANALYZING:'분석 중',ANALYZED:'분석 완료',GENERATING:'전략 생성 중',PLANNED:'전략 준비',COMPARED:'비교 완료',WAITING_APPROVAL:'승인 대기',APPROVED:'가상 결과 확정',REJECTED:'반려'};
export const COLORS:Record<string,string>={HEALTHY:'#46e6b1',WARNING:'#ffd36d',FAILED:'#ff626e',RECOVERING:'#60a5fa'};
export const NODE_FLOOR=(id:string)=>['gateway','lb','external-api','web-1','web-2','partner'].includes(id)?2:1;
export function nodePosition(id:string):[number,number,number]{const f=NODE_FLOOR(id);const ids=f===1?['db-primary','db-replica','redis','mq','app-1','app-2','app-3']:['gateway','lb','external-api','web-1','web-2','partner'];const i=ids.indexOf(id);return [-6+(i%5)*3,(f-1)*5.5+1.3,i<5?-3:-1];}
