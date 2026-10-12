// Describes this application's implementation. Execution claims require incident evidence.
export const technologies = [
  { id:'jev', name:'Jev', kind:'AI 판단 엔진', short:'유형·긴급도 판단', where:'2단계 분석 · Diagnosis Agent · 자동 평가', role:'관측값으로 장애 유형, 심각도, 담당 부서, 재발 의심과 원인 후보를 판단합니다.', implementation:'Local jevos가 기본입니다. TypeSafe는 별도 설정 시 선택하며, 시연 모드 또는 로컬 연결 실패 시 Mock임을 표시합니다.' },
  { id:'ontology', name:'Ontology · 온톨로지', kind:'의존 관계 분석', short:'영향 범위 탐색', where:'2단계 영향 분석 · 3단계 승인 전 확인', role:'장애 자산에 의존하는 시스템·API·배치·DB를 찾아 영향 가능 범위를 보여줍니다.', implementation:'Neo4j가 관계를 탐색하고 React Flow가 그래프를 그립니다. SQL 대체 분석은 별도 표시합니다. AI 언어 모델의 판단이 아닙니다.' },
  { id:'a2a', name:'A2A', kind:'Agent 통신 규약', short:'Agent 협업', where:'2단계 분석 · 4단계 복구 가이드와 보고서', role:'6개 전문 Agent에 작업을 전달하고 요청·상태·응답을 기록합니다.', implementation:'A2A 0.3.0 JSON-RPC의 message/send·tasks/get을 사용합니다. 역할별 Agent는 같은 Spring Boot 서비스에서 통신하며, 각각 별도 LLM인 것은 아닙니다.' },
  { id:'hermes', name:'Hermes · 에르메스', kind:'지식 Agent + LLM 연결', short:'지식 검색·Skill 초안', where:'2단계 승인 지식 검색 · 4단계 Skill 초안 · 해결 지식', role:'승인된 Skill·매뉴얼과 유사 장애에서 해결 방법을 고르고, 복구 검증 후 재사용할 Skill 초안을 작성합니다.', implementation:'Nous Research Hermes Agent가 설정된 LLM을 호출합니다. 초안은 관리자 승인 후 지식으로 사용하며 Skill 파일 게시 상태도 따로 표시합니다.' },
  { id:'harness', name:'Harness Engineering', kind:'실행 통제 계층', short:'검증·승인·실행 통제', where:'전체 처리 흐름 · 2단계 검증 · 3단계 승인 · 관리자 메뉴 → AI 품질 관리', role:'판단 근거, 도구 권한, 실행 수, 재시도와 승인 조건을 검사하고 행위를 감사 로그에 남깁니다.', implementation:'Spring Boot 정책 코드입니다. 근거 부족 시 담당자 확인을 요청하며, 가상 시나리오 정답과 모델 판단을 비교 평가합니다. 별도 AI 모델이 아닙니다.' },
  { id:'mcp', name:'MCP', kind:'도구 호출 규약', short:'가상 조치·지표 검증', where:'4단계 승인 후 가상 복구 검증', role:'허용된 가상 복구 도구를 호출하고 조치 전후 오류율·응답 시간·의존 상태를 검증합니다.', implementation:'MCP 2025-03-26 HTTP 프로필을 사용합니다. 관리자 승인 후에도 가상 지표만 변경하며 실제 서버 명령은 실행하지 않습니다.' },
  { id:'store', name:'PostgreSQL', kind:'이력·지식 저장소', short:'이력·증적 저장', where:'접수부터 종료까지 · 장애 이력 · 해결 지식', role:'장애, 판단, Agent 작업, 승인, 감사 로그, 후기와 승인된 Skill을 저장합니다.', implementation:'클라우드에서는 Supabase PostgreSQL을 Spring Boot가 사용합니다. 보고서는 저장된 데이터를 PDF·Excel로 출력합니다.' },
  { id:'app', name:'Next.js · Spring Boot', kind:'화면·업무 API', short:'입력·업무 처리', where:'1단계 접수 · 전체 화면 · 5단계 후기 입력', role:'React 화면에서 입력과 진행 상황을 보여주고 Java API에서 인증·권한과 장애 상태 변경을 처리합니다.', implementation:'문자 항목 추출은 서버 규칙 파서입니다. SSE로 실행 이벤트를 전달합니다. 문자 미리보기와 후기 저장 자체는 AI 생성이 아닙니다.' },
];
export const stepTechnologies = [
  ['app','store'], ['jev','ontology','a2a','hermes','harness'], ['harness','ontology'],
  ['a2a','mcp','harness','hermes','store'], ['app','store'], ['store','harness'],
];
export const stepTechnologyLabels = ['접수 내용 저장','원인·영향·해결 방법 분석','안전 점검 · 관리자 승인','가상 복구 · 결과 확인','후기·예방 대책 저장','관리자 · 이력 확정'];
export const agentRoles = [
  ['Incident','업무 조정','가상 장애의 분석 계획을 구성합니다.','내부 로직'],
  ['Diagnosis','원인 후보 분석','Jev로 원인 후보를 판단하고 유사 종료 장애를 찾습니다.','Jev + PostgreSQL'],
  ['Impact','영향 분석 전달','Ontology가 계산한 영향 범위를 전달합니다.','Ontology 결과'],
  ['Knowledge','해결 지식 검색','승인된 Skill·매뉴얼의 관련성을 판단합니다.','Hermes + 설정된 LLM / Mock'],
  ['Recovery','대응 가이드','승인된 Skill·매뉴얼과 가상 복구 도구 목록을 구성합니다.','내부 로직 + 승인 지식'],
  ['Report','보고서 구성','판단·영향·승인·복구 검증 결과를 보고서 데이터로 묶습니다.','내부 로직 · 자동 문장 구성'],
];
const stageIds = {
  INCIDENT:['app','store'], MESSAGE_INTAKE:['app'], JEV:['jev'], ONTOLOGY:['ontology'],
  AGENT_INCIDENT:['a2a'], AGENT_DIAGNOSIS:['a2a','jev'], AGENT_IMPACT:['a2a','ontology'],
  AGENT_KNOWLEDGE:['a2a','hermes'], HERMES:['a2a','hermes'], HARNESS:['harness'],
  REVIEW:['harness'], APPROVAL:['harness'], RECOVERY:['a2a'], AGENT_RECOVERY:['a2a'],
  MCP_ACTION:['mcp'], VERIFY:['mcp','harness'], REPORT:['a2a','store'], AGENT_REPORT:['a2a'],
  SKILL_DRAFT:['hermes'], HISTORY:['store'], CLOSE:['harness','store'], FAILURE:['harness'],
};
export function stageTechnologyLabel(stage) {
  return (stageIds[String(stage).toUpperCase()] || []).map(id => technologies.find(t=>t.id===id)?.name).join(' · ');
}
export const viewTechnologyNotes = {
  dashboard:'Jev가 판단하고 → Ontology가 영향을 분석하고 → A2A로 협업하며 → Hermes가 지식을 찾습니다. Harness가 전 과정을 통제합니다.',
  ontology:'Ontology가 의존 관계를 분석하고 Neo4j가 탐색합니다. React Flow는 그 결과를 그립니다. 영향 가능성과 확정 장애는 구분하세요.',
  incidents:'PostgreSQL에 저장한 이력입니다. 장애를 열면 단계별 사용 기술과 해당 실행의 Provider·모델 기록을 확인할 수 있습니다.',
  knowledge:'Hermes는 승인 지식 검색과 Skill 초안을 담당합니다. 관리자가 승인하고 PostgreSQL에 저장한 지식만 검색에 사용합니다.',
  harness:'Harness는 AI 모델이 아닌 정책 코드입니다. 판단 근거·승인·재시도·도구 권한을 통제하고 Jev 판단을 정답과 비교합니다.',
};

const json = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
const lastEvent = (incident,stage) => (incident?.events || []).filter(e=>e.stage===stage).at(-1);
const eventEvidence = (incident,stage) => {
  const e=lastEvent(incident,stage);
  return e ? `${({COMPLETED:'완료 기록',RUNNING:'실행 중',WAITING:'확인 대기',NEEDS_REVIEW:'검토 필요',FAILED:'실패',REJECTED:'거부'})[e.state] || e.state} · ${e.message || stage}` : '실행 기록 없음 · 완료 여부를 추정하지 않습니다.';
};
function modelEvidence(result) {
  if(!result || typeof result !== 'object') return '모델 결과 기록 없음';
  const simulated=result.simulated===true || String(result.provider || '').startsWith('MOCK');
  const source=result.provider==='OPERATOR' ? '담당자 확인' : simulated ? '시뮬레이션 · 실제 AI 아님' : result.simulated===false && ['LOCAL_JEV','TYPESAFE_JEV','HERMES_AGENT'].includes(result.provider) ? '실제 AI 응답 기록' : '실행 출처 확인 필요';
  return [source,`Provider: ${result.provider || '미기록'}`,`응답 모델: ${result.model || '미기록'}`,Number.isFinite(result.latencyMs)?`${result.latencyMs}ms`:null,Number.isFinite(result.confidence)?`신뢰도 ${Math.round(result.confidence*100)}%`:null,result.fallback?`Mock 대체 · ${result.fallbackReason || '사유 미기록'}`:null].filter(Boolean).join(' · ');
}
/** @param {string} id @param {Record<string, any> | null} incident */
export function technologyEvidence(id,incident) {
  if(!incident) return ['장애를 선택하면 해당 실행 기록을 표시합니다.'];
  switch(id) {
    case 'jev': {
      const task=(incident.tasks || []).filter(t=>t.agent==='diagnosis').at(-1);
      const diagnosis=json(task?.result_json)?.artifacts?.[0]?.parts?.[0]?.data;
      return [`장애 분류: ${incident.decision ? modelEvidence(incident.decision) : eventEvidence(incident,'JEV')}`,`원인 후보: ${diagnosis ? modelEvidence(diagnosis) : '모델 결과 기록 없음'}`];
    }
    case 'ontology': return [incident.impact ? `${incident.impact.engine==='NEO4J'?'Neo4j 그래프 탐색':incident.impact.engine==='SQL_FALLBACK'?'SQL 대체 분석 · Neo4j 사용 아님':'분석 엔진 확인 필요'} · 영향 가능 자산 ${incident.impact.affected?.length ?? '미기록'}개` : eventEvidence(incident,'ONTOLOGY')];
    case 'hermes': {
      const task=(incident.tasks || []).filter(t=>t.agent==='knowledge').at(-1);
      const search=json(task?.result_json)?.artifacts?.[0]?.parts?.[0]?.data;
      const draft=lastEvent(incident,'SKILL_DRAFT');
      return [`지식 검색: ${search ? modelEvidence(search) : eventEvidence(incident,'HERMES')}`,`Skill 초안: ${draft?.state==='COMPLETED' ? modelEvidence(json(draft.data_json)) : eventEvidence(incident,'SKILL_DRAFT')}`];
    }
    case 'a2a': {
      const tasks=new Map((incident.tasks || []).map(t=>[t.agent,t]));
      return tasks.size ? [...tasks.values()].map(t=>`${t.agent} Agent · ${({completed:'완료',working:'실행 중',failed:'실패'})[t.status] || t.status}`) : ['Agent 작업 기록 없음 · 6개 역할의 실행을 추정하지 않습니다.'];
    }
    case 'harness': {
      const data=json(lastEvent(incident,'HARNESS')?.data_json);
      const policy=data ? ` · 정책 결과: ${data.blocked===true?'차단':data.needsReview===true?'담당자 확인 필요':data.passed===true?'통과':'결과 확인 필요'}` : '';
      return [`근거 검증: ${eventEvidence(incident,'HARNESS')}${policy}`,`대응 승인: ${eventEvidence(incident,'APPROVAL')}`];
    }
    case 'mcp': return [`가상 조치: ${eventEvidence(incident,'MCP_ACTION')}`,`지표 검증: ${eventEvidence(incident,'VERIFY')}`];
    case 'store': return [`장애 ID: ${incident.id}`,`복구 이력: ${eventEvidence(incident,'HISTORY')}`,`종료: ${eventEvidence(incident,'CLOSE')}`];
    default: return [`등록된 장애: ${incident.id} · 문자 추출과 화면 입력은 규칙·업무 API로 처리합니다.`];
  }
}
