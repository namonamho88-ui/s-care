'use client';
import {nameOf,type Experiment,type Result} from './campus-model';
import {responseGuide} from './campus-field';
import {worlds} from './campus-worlds';
export default function FieldGuide({experiment,time,results,inspected,world,arrived,running,observedCount,onVisit,onInspect,onReview,onStart,onPlay}:{experiment:Experiment|null;time:number;results:Result[];inspected:boolean;world:number;arrived:boolean;running:boolean;observedCount:number;onVisit:(world:number)=>void;onInspect:()=>void;onReview:()=>void;onStart:()=>void;onPlay:()=>void}){
 const g=responseGuide(experiment,time,results,inspected),local=world===g.world&&arrived;
 return <section className="field-guide" aria-label="현장 대응 안내" data-stage={g.stage}>
 <div className="field-guide-heading"><span>{experiment?`대응 ${g.stage}/4 · 가상 ${Math.floor(time)}초`:'GUIDED RESPONSE'}</span>{experiment&&g.stage<4&&<button onClick={onPlay}>{running?'일시정지':'계속 재생'}</button>}</div>
 <h2>{g.title}</h2><p>{g.detail}</p>
 {experiment&&<div className="field-step-strip" aria-label="대응 단계">{['장애 점검','복구 승인','정상화 관측','결과 확인'].map((s,i)=><span key={s} data-active={g.stage===i+1} data-complete={g.stage>i+1}>{g.stage>i+1?'✓':i+1} {s}</span>)}</div>}
 <div className="field-guide-actions">{!experiment?<button className="primary" onClick={onStart}>DB 장애 대응 시작</button>:<>
 <button onClick={()=>onVisit(g.world)}>{local?'현재 구역':world===g.world?'현장으로 이동 중':`${worlds[g.world].name}으로 이동`}</button>
 {g.stage===1?<button className="primary" disabled={!local} onClick={onInspect}>장비 점검 확인</button>:<button className="primary" onClick={onReview}>{g.stage===2?'복구 검토·승인':g.stage===3?'전파·복구 상세':'결과 보고서'}</button>}
 </>}</div>
 {experiment&&<small>안내 대상: {nameOf(g.focus)} · 누적 영향 기능 {observedCount}/4 · 대응 순서는 실험 가정</small>}
 </section>;
}
