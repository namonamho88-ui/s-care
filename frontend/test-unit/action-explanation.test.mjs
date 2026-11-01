import test from 'node:test';
import assert from 'node:assert/strict';
import {actionExplanation} from '../lib/recovery-evidence.mjs';
const execution={provider:'SYNTHETIC_ACTION_MODEL',realChanges:false};
test('describes only recorded synthetic replay and keeps failure explicit',()=>{
 const step={code:'RERUN',passed:true,before:{processedCount:984},after:{processedCount:1000}};
 assert.match(actionExplanation(step,execution),/16건을 추가/);
 assert.match(actionExplanation({...step,passed:false},execution),/실패/);
 assert.doesNotMatch(actionExplanation({...step,passed:false},execution),/16건을 추가/);
 assert.match(actionExplanation(step,{provider:'SIMULATED_METRICS'}),/기록되지 않았습니다/);
});
test('remediation shows actual saved differences rather than inventing commands',()=>{
 const text=actionExplanation({code:'REMEDIATE',passed:true,before:{blockingTransactions:2},after:{blockingTransactions:0}},execution);
 assert.match(text,/차단 트랜잭션 수: 2 → 0/);
 assert.match(text,/실제 파일·프로세스·DB에 조치한 기록은 아닙니다/);
});
