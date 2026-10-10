import test from 'node:test';
import assert from 'node:assert/strict';
import { incidentGuide, stageLabel } from '../lib/incident-guide.mjs';

const admin = { isAdmin: true, canEdit: true };
const base = { notes: '가상 조치 후기', prevention: '가상 예방 대책', events: [] };
const proof = JSON.stringify({before:{healthyDependencies:false,latencyMs:3200,errorRate:12.5},after:{healthyDependencies:true,latencyMs:120,errorRate:0.02},realChanges:false,passed:true,provider:'SIMULATED_METRICS'});
test('first use explains registration without claiming any completed work', () => {
  const g = incidentGuide(null, admin);
  assert.equal(g.target, 'register');
  assert.equal(g.steps.filter(s => s.state === 'complete').length, 0);
});
test('backend lifecycle advances the current point only to its confirmed stage', () => {
  for (const [status, step] of Object.entries({REGISTERED:0,ANALYZING:1,NEEDS_REVIEW:1,WAITING_APPROVAL:2,RECOVERING:3,RESOLVED:5,CLOSED:6})) {
    const g=incidentGuide({...base,status},admin);
    assert.equal(g.step,step,status);
    assert.equal(g.steps.filter(s=>s.state==='complete').length,step,status);
  }
});
test('analysis uses the latest backend event rather than an old running event', () => {
  const events=[{stage:'JEV',state:'RUNNING'},{stage:'JEV',state:'COMPLETED'},{stage:'ONTOLOGY',state:'RUNNING'},{stage:'ONTOLOGY',state:'COMPLETED'}];
  const g=incidentGuide({...base,status:'ANALYZING',events},admin);
  assert.match(g.phase,/영향 범위 분석 · Ontology · 완료/);
  assert.equal(g.step,1);
  assert.match(stageLabel('AGENT_diagnosis'),/원인 후보 분석/);
});
test('repeated evidence review stays in analysis and never implies approval', () => {
  const g=incidentGuide({...base,status:'NEEDS_REVIEW',events:[{stage:'REVIEW',state:'COMPLETED'},{stage:'HARNESS',state:'COMPLETED'},{stage:'REVIEW',state:'WAITING'}]},admin);
  assert.equal(g.step,1);assert.equal(g.target,'review');
  assert.equal(g.steps[2].state,'pending');assert.match(g.text,/추가 확인/);
});
test('normal users get waiting guidance and no administrator action target', () => {
  for(const [status,target] of [['NEEDS_REVIEW','analysis'],['WAITING_APPROVAL','analysis'],['FAILED','timeline'],['RESOLVED','report']]) {
    const g=incidentGuide({...base,status},{canEdit:true});
    assert.equal(g.target,target,status);
  }
});
test('generated JSON, unsaved edits and missing prevention each require saving before close', () => {
  for(const [incident,options] of [
    [{...base,notes:proof},admin],
    [base,{...admin,dirty:true}],
    [{...base,prevention:'  '},admin],
  ]) {
    const g=incidentGuide({...incident,status:'RESOLVED'},options);
    assert.equal(g.step,4);assert.equal(g.target,'notes');assert.equal(g.steps[5].state,'pending');
  }
  assert.match(incidentGuide({...base,notes:proof,status:'RESOLVED'},admin).text,/아직 저장되지 않은/);
});
test('another operator is sent to read saved notes, never to edit or close', () => {
  const g=incidentGuide({...base,notes:proof,status:'RESOLVED'},{canEdit:false});
  assert.equal(g.target,'report');assert.equal(g.badge,'담당자 기록 대기');
});
test('rejection stops at approval, with no completed recovery or closure', () => {
  const g=incidentGuide({...base,status:'REJECTED'},admin);
  assert.equal(g.step,2);assert.equal(g.tone,'stopped');assert.equal(g.target,'timeline');
  assert.equal(g.steps[3].state,'pending');assert.equal(g.steps[5].state,'pending');
});
test('failure points to the interrupted phase, including recovery before its first event', () => {
  for(const [stage,state,step] of [['JEV','RUNNING',1],['SKILL_DRAFT','RUNNING',3],['AGENT_recovery','RUNNING',3],['APPROVAL','COMPLETED',3]]) {
    const g=incidentGuide({...base,status:'FAILED',events:[{stage,state},{stage:'FAILURE',state:'FAILED'}]},admin);
    assert.equal(g.step,step);assert.equal(g.tone,'stopped');assert.equal(g.target,'timeline');
    assert.equal(g.steps[4].state,'pending');
  }
});
test('closed and unknown states never invent pending automatic work', () => {
  assert.equal(incidentGuide({...base,status:'CLOSED'},admin).target,'downloads');
  const unknown=incidentGuide({...base,status:'UNKNOWN'},admin);
  assert.equal(unknown.step,-1);assert.ok(unknown.steps.every(s=>s.state==='pending'));
});
