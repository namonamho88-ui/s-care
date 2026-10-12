import { technologies, stepTechnologies, stepTechnologyLabels, agentRoles, technologyEvidence, viewTechnologyNotes } from '@/lib/technology-guide.mjs';
import { incidentSteps } from '@/lib/incident-guide.mjs';
import { Button } from '@/components/ui/button';
type Row=Record<string,any>;

export function TechnologyContext({view,onOpen}:{view:string;onOpen:()=>void}) {
  const note=(viewTechnologyNotes as Record<string,string>)[view];
  return note ? <aside className="technology-context" aria-label="이 화면에 사용된 기술"><p><strong>어떤 기술이 쓰이나요?</strong> {note}</p><Button size="sm" variant="outline" onClick={onOpen}>기술별 역할 보기</Button></aside> : null;
}

export function StageTechnologies({step,incident}:{step:number;incident:Row}) {
  const ids=stepTechnologies[step] || [];
  return <section className="stage-technologies" aria-label="이 단계의 기술과 역할">
    <h3>{step+1}단계에서 사용하는 기술</h3>
    <div className="technology-chips">{ids.map(id=>{const t=technologies.find(t=>t.id===id)!;return <span key={id}><b>{t.name}</b> · {t.short}</span>;})}</div>
    <details key={`${incident.id}-${step}`}><summary>역할과 이 장애의 실행 근거 보기</summary>
      <p className="small muted">아래는 이 장애에 저장된 기록입니다. 예정된 기술도 표시되며 실행 기록이 있어야 완료로 확인할 수 있습니다.</p>
      <div className="technology-evidence">{ids.map(id=>{const t=technologies.find(t=>t.id===id)!;return <article key={id} aria-label={`${t.name} 실행 근거`}><h4>{t.name} <small>{t.kind}</small></h4><p>{t.role}</p>{technologyEvidence(id,incident).map((line,i)=><p className="technology-proof" key={i}>{line}</p>)}</article>;})}</div>
      {ids.includes('hermes') && <p className="small muted">Hermes 응답 모델이 hermes-agent이면 서버 별칭입니다. 이 이름만으로 내부 OpenAI 모델명을 확정할 수 없습니다. 해결 절차 초안 승인·게시 상태는 해결 지식에서 별도로 확인하세요.</p>}
    </details>
  </section>;
}

export default function TechnologyGuide({config}:{config:Row}) {
  return <section className="technology-guide" aria-label="기술과 모델 안내">
    <div className="technology-intro"><span className="eyebrow">사용 기술 한눈에 보기</span><h2>장애 한 건이 처리되는 동안, 누가 무엇을 하나요?</h2><p>Jev와 Hermes는 AI 판단·지식 작업을 맡고, Ontology·A2A·Harness·MCP는 분석과 협업·통제를 맡습니다. 모델명과 실제/Mock 여부는 각 장애의 실행 결과를 기준으로 확인하세요.</p></div>
    <ol className="technology-flow" aria-label="단계별 기술 지도">{incidentSteps.map((step,i)=><li key={step.label}><span>{i+1}. {step.label}</span><strong>{stepTechnologyLabels[i]}</strong></li>)}</ol>
    <div className="technology-table-wrap"><table className="technology-table"><caption>기술별 사용 지점과 역할</caption><thead><tr><th scope="col">기술 / 종류</th><th scope="col">어디서 쓰나요?</th><th scope="col">무엇을 하나요?</th></tr></thead><tbody>{technologies.map(t=><tr key={t.id}><th scope="row"><strong>{t.name}</strong><small>{t.kind}</small></th><td data-label="사용 지점">{t.where}</td><td data-label="역할"><p>{t.role}</p><small>{t.implementation}</small></td></tr>)}</tbody></table></div>
    <details className="technology-more"><summary>6개 Agent의 역할과 모델 연결 보기</summary><p>Agent는 업무를 나눈 실행 역할이고 A2A는 이들 사이의 통신 방식입니다. 각 역할이 모두 별도의 AI 모델을 호출하는 구조는 아닙니다.</p><div className="technology-agent-grid">{agentRoles.map(([name,role,description,engine])=><article key={name}><h3>{name} Agent · {role}</h3><p>{description}</p><small>{engine}</small></article>)}</div></details>
    <details className="technology-more"><summary>실제 AI · Mock · 모델명은 어떻게 읽나요?</summary><ul><li>시연 모드는 외부 모델을 호출하지 않습니다. Mock 결과도 DB·Agent 통신·승인·검증 흐름을 거칩니다.</li><li>실제 AI 모드를 선택했더라도 호출 실패로 Mock 대체될 수 있습니다. 선택 모드와 실제 응답 Provider를 구분하세요.</li><li>Jev는 실제 응답의 모델명을 표시합니다. Hermes는 서버에 설정된 OpenAI 등 LLM을 사용하며, 응답이 hermes-agent 별칭이면 내부 모델명까지 확인된 것은 아닙니다.</li><li>연결 상태는 현재 서버 확인 결과이고 특정 장애에서 모델 호출이 성공했다는 증거는 아닙니다. 해당 장애의 단계별 실행 근거를 확인하세요.</li></ul><p className="small muted">현재 구성 조회: DB {config.database || '미확인'} · Graph {config.graph || '미확인'} · A2A {config.a2a || '미확인'} · Hermes API {config.hermes?.apiReachable===true?'연결됨':config.hermes?.apiReachable===false?'미연결':'미확인'}</p></details>
  </section>;
}
