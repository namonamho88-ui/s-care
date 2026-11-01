import {incidentGuide} from '../../lib/incident-guide.mjs';
export type Row=Record<string,any>;
export type WorkStatus='running'|'review'|'blocked'|'done';
export const workStates:Record<WorkStatus,{label:string;icon:string;color:string}>={running:{label:'진행 중',icon:'▶',color:'#55c7ed'},review:{label:'검토 필요',icon:'◇',color:'#f0c36b'},blocked:{label:'막힘',icon:'!',color:'#f48b8b'},done:{label:'완료',icon:'✓',color:'#73d2af'}};
export const workZones=[{id:'operations',name:'개발 · 운영',color:'#55a8dd'},{id:'research',name:'리서치 · 분석',color:'#66bdcb'},{id:'review',name:'검토 · 승인',color:'#b4a4de'},{id:'delivery',name:'복구 · 배포',color:'#76baa9'}];
export type WorkTask={id:string;title:string;projectId:string;projectName:string;ownerId:string;owner:string;status:WorkStatus;rawStatus:string;severity:string;description:string;updated:string;progress:number|null;guide:ReturnType<typeof incidentGuide>;raw:Row};
export type WorkProject={id:string;name:string;tasks:WorkTask[];owners:string[]};
export function record(value:unknown):Row|null{if(typeof value==='string'){try{return record(JSON.parse(value));}catch{return null;}}return value&&typeof value==='object'&&!Array.isArray(value)?value as Row:null;}
export function statusOf(status:string):WorkStatus{return status==='CLOSED'?'done':['NEEDS_REVIEW','WAITING_APPROVAL','RESOLVED'].includes(status)?'review':['REGISTERED','ANALYZING','RECOVERING'].includes(status)?'running':'blocked';}
export function adaptWork(rows:unknown,user:Row):WorkTask[]{
 if(!Array.isArray(rows))throw Error('업무 목록 응답 형식을 확인할 수 없습니다.');
 const seen=new Set<string>();return rows.filter(r=>r&&!r.deleted_at).map(r=>{
 if(typeof r.id!=='string'||typeof r.title!=='string'||typeof r.status!=='string'||seen.has(r.id))throw Error('업무 식별자·제목·상태 응답을 확인하세요.');seen.add(r.id);
 const canEdit=['ADMIN','DEMO_ADMIN'].includes(user.role)||!!user.operatorId&&user.operatorId===r.owner_id;
 return {id:r.id,title:r.title,projectId:r.system_id||`asset:${r.asset_id||'unassigned'}`,projectName:r.system_name||r.asset_name||'분류 미지정',ownerId:r.owner_id||'',owner:r.owner_name||'담당자 미지정',status:statusOf(r.status),rawStatus:r.status,severity:r.severity||'미정',description:r.observations||'업무 설명이 기록되지 않았습니다.',updated:r.updated_at||r.phase_started_at||r.created_at||'',progress:typeof r.progress==='number'&&Number.isFinite(r.progress)&&r.progress>=0&&r.progress<=100?r.progress:null,guide:incidentGuide(r,{isAdmin:['ADMIN','DEMO_ADMIN'].includes(user.role),canEdit}),raw:r};
 });
}
export function groupProjects(tasks:WorkTask[]):WorkProject[]{const groups=new Map<string,WorkProject>();for(const task of tasks){if(!groups.has(task.projectId))groups.set(task.projectId,{id:task.projectId,name:task.projectName,tasks:[],owners:[]});const p=groups.get(task.projectId)!;p.tasks.push(task);if(!p.owners.includes(task.owner))p.owners.push(task.owner);}return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id));}
export function priority(tasks:WorkTask[]){return [...tasks].sort((a,b)=>({blocked:0,review:1,running:2,done:3}[a.status]-{blocked:0,review:1,running:2,done:3}[b.status])||({P1:0,P2:1,P3:2}[a.severity as 'P1']??3)-({P1:0,P2:1,P3:2}[b.severity as 'P1']??3)||a.id.localeCompare(b.id));}
// Slots append without reordering; status, filters and result arrival never change a seat.
export function allocateSlots(previous:Record<string,number>,ids:string[]){const next={...previous};let last=Math.max(-1,...Object.values(next))+1;for(const id of [...ids].sort())if(next[id]===undefined)next[id]=last++;return next;}
export function boothPosition(slot:number):[number,number,number]{return [((slot%3)-1)*21,0,-Math.floor((slot%6)/3)*23];}
export function seatPosition(projectSlot:number,taskSlot:number):[number,number,number]{const p=boothPosition(projectSlot);return [p[0]+((taskSlot%3)-1)*4.4,0,p[2]+(Math.floor(taskSlot%6/3)===0?2:-4)];}
export function blockedReason(detail:Row|null,task:WorkTask){if(task.status!=='blocked')return '';const failure=[...(detail?.events||[])].reverse().find((e:Row)=>['FAILED','REJECTED'].includes(e.state)||e.stage==='FORCE_STOP');return failure?.message||({REJECTED:'대응 승인이 거부되어 실행되지 않았습니다.',CANCELLED:'강제 종료되었습니다. 완료로 집계하지 않습니다.',FAILED:'실행 실패가 기록되었습니다. 상세 오류 기록을 확인하세요.'}[task.rawStatus]||`알 수 없는 상태(${task.rawStatus})입니다. 원본 기록을 확인하세요.`);}
export function agentLabel(task:Row){return (({working:'▶ 작업 중',completed:'✓ 완료',failed:'! 실행 실패','input-required':'◇ 응답 대기',submitted:'◷ 실행 대기'} as Record<string,string>)[task.status]||`? ${task.status||'상태 미기록'}`);}
export function artifactRows(detail:Row|null){if(!detail)return [];const out:{id:string;title:string;value:unknown}[]=[];const report=record(detail.report??detail.report_json);if(report)out.push({id:'report',title:'저장된 보고서',value:report});for(const task of Array.isArray(detail.tasks)?detail.tasks:[]){const result=record(task.result_json);for(const [index,artifact] of (Array.isArray(result?.artifacts)?result.artifacts:[]).entries())out.push({id:`${task.id}:${index}`,title:`${task.agent} · 저장 결과`,value:artifact});}return out;}
