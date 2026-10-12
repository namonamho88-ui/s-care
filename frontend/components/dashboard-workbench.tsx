"use client";
import { useState, type ReactNode } from "react";
import { ArrowRight, ClipboardPaste, FilePlus2, CheckCircle2, CircleDot, Clock, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import PaginatedList from "@/components/pagination";
import { incidentSteps } from "@/lib/incident-guide.mjs";
import { dashboardQueue } from "@/lib/dashboard-queue.mjs";

type Row = Record<string, any>;

export default function DashboardWorkbench({incidents,user,ready,online,filterKey,onMessage,onCreate,onOpen,onHistory,onGuide,selectedId,demoControls}:{
  selectedId:string|null; demoControls?:ReactNode;
  incidents:Row[]; user:Row; ready:boolean; online:boolean; filterKey:string;
  onMessage:()=>void; onCreate:()=>void; onOpen:(id:string)=>void; onHistory:()=>void; onGuide:()=>void;
}) {
  const [filter,setFilter]=useState('all');
  const queue=dashboardQueue(incidents,user);
  const focus=queue.find(item=>item.incident.id===selectedId) || queue[0];
  const groups=[
    {id:'all',label:'전체 미종료',icon:ListChecks,items:queue},
    {id:'action',label:'내 확인 필요',icon:CircleDot,items:queue.filter(item=>item.actionable)},
    {id:'running',label:'자동 진행 중',icon:Clock,items:queue.filter(item=>item.running)},
    {id:'finishing',label:'복구 후 마무리',icon:CheckCircle2,items:queue.filter(item=>item.finishing)},
  ];
  const current=groups.find(group=>group.id===filter)!;
  return <div className="dashboard-workbench">
    <section className="intake-section" aria-labelledby="intake-title">
      <div className="intake-heading"><h2 id="intake-title">장애가 발생했나요?</h2><span>여기서 시작하세요</span></div>
      <div className="intake-actions">
        <button type="button" className="intake-action primary" aria-label="문자 붙여넣기" onClick={onMessage}>
          <span className="intake-icon"><ClipboardPaste size={25} aria-hidden="true" /></span>
          <span className="intake-copy"><strong>문자 붙여넣기</strong><span>배치·TMS 알림 문자를 받았다면</span><small>붙여넣기 → 내용 확인 → 장애 접수</small></span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
        <button type="button" className="intake-action" aria-label="장애 직접 등록" onClick={onCreate}>
          <span className="intake-icon"><FilePlus2 size={25} aria-hidden="true" /></span>
          <span className="intake-copy"><strong>장애 직접 등록</strong><span>문자 없이 이상 현상을 발견했다면</span><small>제목·구성요소·관측 내용 입력</small></span>
          <ArrowRight size={22} aria-hidden="true" />
        </button>
      </div>
      {demoControls}
      <div className="intake-help"><span>가상·비식별 데이터만 입력하세요. 정상 종료(END_OK)는 장애 등록에서 제외됩니다.</span><button type="button" onClick={onGuide}>처음 이용하시나요? <ArrowRight size={13} aria-hidden="true" /></button></div>
    </section>

    <section className="demo-journey" aria-labelledby="journey-title">
      <div className="journey-heading"><div><span className="journey-eyebrow">{focus ? '이 장애는 지금' : '한눈에 보는 처리 순서'}</span><h2 id="journey-title">{focus ? focus.incident.title : '접수하면 분석부터 보고서까지 이어집니다'}</h2></div>{focus && <span className="journey-badge">{focus.guide.badge}</span>}</div>
      <ol className="journey-steps" aria-label="장애 처리 순서">{incidentSteps.map((step,index)=><li key={step.label} aria-current={focus?.guide.step===index?'step':undefined} className={focus && index<focus.guide.step?'done':''}><span>{focus && index<focus.guide.step?<CheckCircle2 size={16}/>:index+1}</span><strong>{step.label}</strong><small>{step.who}</small></li>)}</ol>
      {focus ? <div className="journey-next"><div><strong>{focus.guide.title}</strong><p>{focus.guide.text}</p><small>{focus.incident.id} · 목록에서 다른 장애를 선택할 수 있습니다.</small></div><Button onClick={()=>onOpen(focus.incident.id)}>{focus.guide.action}<ArrowRight size={16}/></Button></div> : <p className="journey-empty">위에서 문자를 붙여넣거나 장애를 등록하세요. 현재 단계와 다음에 할 일이 이곳에 표시됩니다.</p>}
    </section>

    <section className="work-queue" aria-labelledby="queue-title">
      <div className="queue-heading"><div><h2 id="queue-title">지금 처리할 장애</h2><p>내 확인이 필요한 장애부터 표시합니다. 항목을 열면 현재 단계와 작성할 내용으로 이동합니다.</p></div><Button size="sm" variant="outline" onClick={onHistory}>전체 이력 <ArrowRight size={14} /></Button></div>
      {!online && <p className="queue-stale" role="status">서버 연결을 확인하고 있습니다. 아래 내용은 마지막 조회 결과입니다.</p>}
      <div className="queue-filters" role="group" aria-label="처리할 장애 필터">{groups.map(({id,label,icon:Icon,items})=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)} disabled={!ready}>
        <span><Icon size={16} aria-hidden="true" />{label}</span><strong>{ready?items.length:'—'}<small>건</small></strong>
      </button>)}</div>
      <p className="queue-hint">현재 조회 범위 기준 · ‘내 확인 필요’는 내 역할과 담당 배정 기준이며 ‘복구 후 마무리’와 중복될 수 있습니다.</p>
      {!ready ? <p className="empty" role="status">장애 목록을 불러오는 중입니다.</p> : <PaginatedList key={`${filter}:${filterKey}`} items={current.items} label="처리할 장애" empty={filter==='all'?'현재 조회 범위에 처리 중인 장애가 없습니다. 새 장애가 발생하면 위에서 접수하세요.':`${current.label}에 해당하는 장애가 없습니다. 다른 상태나 전체 이력을 확인하세요.`}>
        {items=><div className="queue-list">{items.map(({incident:i,guide,actionable})=><button type="button" className={`queue-item ${actionable?'needs-action':''}`} key={i.id} onClick={()=>onOpen(i.id)}>
          <span className={`queue-severity ${i.severity==='P1'?'urgent':''}`}>{i.severity || '미정'}</span>
          <span className="queue-subject"><strong>{i.title}</strong><small>{i.id} · {i.asset_name || '구성요소 확인 필요'} · {i.owner_name || '담당자 확인 필요'}</small></span>
          <span className="queue-next"><span>{guide.step>=0 && guide.step<6?`${guide.step+1}/6단계 · `:''}{guide.badge}</span><strong>{guide.title}</strong></span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>)}</div>}
      </PaginatedList>}
    </section>
  </div>;
}
