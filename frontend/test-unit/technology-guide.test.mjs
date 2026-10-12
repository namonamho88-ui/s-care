import test from 'node:test';
import assert from 'node:assert/strict';
import {technologyEvidence,stageTechnologyLabel} from '../lib/technology-guide.mjs';
const artifact=data=>({artifacts:[{parts:[{data}]}]});

test('technology evidence never treats selected REAL mode or missing metadata as an actual AI call',()=>{
  const incident={id:'INC-FAKE',mode:'REAL',status:'CLOSED',tasks:[],events:[]};
  assert.match(technologyEvidence('jev',incident)[0],/실행 기록 없음/);
  assert.match(technologyEvidence('hermes',incident)[0],/실행 기록 없음/);
  assert.match(technologyEvidence('a2a',incident)[0],/작업 기록 없음/);
  incident.decision={provider:'LOCAL_JEV',model:'fictional-model'};
  assert.match(technologyEvidence('jev',incident)[0],/실행 출처 확인 필요/);
  incident.decision={provider:'OPERATOR',model:'manual-review',simulated:false};
  assert.match(technologyEvidence('jev',incident)[0],/담당자 확인/);
  assert.doesNotMatch(technologyEvidence('jev',incident)[0],/실제 AI 응답/);
});
test('real Jev, independent diagnosis fallback and mixed Hermes operations retain their own provenance',()=>{
  const incident={decision:{provider:'LOCAL_JEV',model:'fictional-jev-model',simulated:false,confidence:.91,latencyMs:42},tasks:[
    {agent:'diagnosis',result_json:artifact({provider:'MOCK_FALLBACK',simulated:true,fallback:true,fallbackReason:'test-timeout'})},
    {agent:'knowledge',result_json:JSON.stringify(artifact({provider:'HERMES_AGENT',model:'hermes-agent',simulated:false}))},
  ],events:[{stage:'SKILL_DRAFT',state:'COMPLETED',data_json:JSON.stringify({provider:'MOCK_HERMES_FALLBACK',simulated:true,fallback:true,fallbackReason:'test-draft-timeout'})}]};
  const jev=technologyEvidence('jev',incident),hermes=technologyEvidence('hermes',incident);
  assert.match(jev[0],/실제 AI 응답 기록.*fictional-jev-model.*42ms.*91%/);
  assert.match(jev[1],/시뮬레이션.*test-timeout/);
  assert.match(hermes[0],/지식 검색: 실제 AI 응답 기록.*hermes-agent/);
  assert.match(hermes[1],/Skill 초안: 시뮬레이션.*test-draft-timeout/);
});
test('SQL fallback and a completed Harness review are not labeled as Neo4j execution or policy approval',()=>{
  const incident={impact:{engine:'SQL_FALLBACK',affected:['FAKE-1']},events:[{stage:'HARNESS',state:'COMPLETED',data_json:'{"passed":false,"needsReview":true}'}]};
  assert.match(technologyEvidence('ontology',incident)[0],/SQL 대체 분석 · Neo4j 사용 아님.*1개/);
  assert.match(technologyEvidence('harness',incident)[0],/담당자 확인 필요/);
  assert.match(technologyEvidence('harness',incident)[1],/실행 기록 없음/);
  assert.equal(stageTechnologyLabel('AGENT_DIAGNOSIS'),'A2A · Jev');
  assert.equal(stageTechnologyLabel('UNKNOWN'),'');
});
