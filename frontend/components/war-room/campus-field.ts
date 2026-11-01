import {components,type Experiment,type Result,phase,nameOf} from './campus-model';
// Visual placements only; these are not measured datacenter locations or machine counts.
export const fieldAnchors:[number,number][]=[[0,19],[-13,-1],[13,-1],[-13,-23],[13,-23]];
export function fieldPosition(id:string):[number,number,number]{
 const c=components.find(n=>n.id===id);if(!c)return [0,0,19];
 const peers=components.filter(n=>n.zone===c.zone),index=peers.findIndex(n=>n.id===id),[x,z]=fieldAnchors[c.zone+1];
 return [x+(index-(peers.length-1)/2)*4.8,0,z-3.8];
}
export function fieldDestination(x:number,z:number){
 const world=fieldAnchors.reduce((best,a,i)=>Math.hypot(x-a[0],z-a[1])<Math.hypot(x-fieldAnchors[best][0],z-fieldAnchors[best][1])?i:best,0);
 return {world,x:Math.max(-8,Math.min(8,x-fieldAnchors[world][0])),z:Math.max(-1.4,Math.min(5.5,z-fieldAnchors[world][1]))};
}
export function responseGuide(e:Experiment|null,time:number,results:Result[],inspected:boolean){
 if(!e)return {stage:0,title:'현장에서 장애 대응 따라가기',detail:'PostgreSQL 연결 장애를 시작하면 첫 점검 구역부터 복구 결과까지 안내합니다.',focus:'pg',world:3};
 const stop=Math.min(e.duration,e.recoverAt??Infinity),source=components.find(c=>c.id===e.target)!;
 if(time<stop)return {stage:inspected?2:1,title:inspected?'복구 조치 검토·승인':'최초 장애 구역 점검',detail:inspected?`${nameOf(e.target)}의 가상 장애 주입 해제를 검토합니다. 실제 장비 명령은 실행하지 않습니다.`:`${nameOf(e.target)}에서 장애가 시작됐습니다. 해당 장비의 상태와 의존 대상을 먼저 확인하세요.`,focus:e.target,world:source.zone+1};
 if(phase(e,time)==='정상화 완료')return {stage:4,title:'복구 결과 확인',detail:'모델 지표가 기준 상태로 돌아왔습니다. 기능별 영향 경로와 복구 기록을 확인하세요.',focus:'report',world:2};
 const pending=results.filter(r=>r.id!==e.target&&r.path.length).sort((a,b)=>a.path.length-b.path.length||a.at-b.at)[0];
 return {stage:3,title:'연결된 서비스 정상화 관측',detail:pending?`${nameOf(pending.id)}의 남은 타임아웃·재시도 영향을 관측합니다. ${e.recoverAt===null?'설정한 기간이 끝나 주입이 자동 만료되었습니다.':'승인한 가상 복구가 반영됐습니다.'}`:'현재 모델 지표는 정상입니다. 남은 관측 시간 종료를 기다립니다.',focus:pending?.id||'report',world:components.find(c=>c.id===(pending?.id||'report'))!.zone+1};
}
