import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisStages, resultCategory, mergeIncidentEvents, mergeIncidentSnapshot } from '../lib/analysis-performance.mjs';
const start='2026-10-15T00:00:00.000Z';
const end='2026-10-15T00:00:01.200Z';

test('concurrent stages remain visible and one completion never completes another',()=>{
 const incident={status:'ANALYZING',events:[{id:1,stage:'TASK_diagnosis',state:'RUNNING',created_at:start},{id:2,stage:'HERMES',state:'RUNNING',created_at:start},{id:3,stage:'TASK_diagnosis',state:'COMPLETED',created_at:end}]};
 const rows=analysisStages(incident,Date.parse(end));
 assert.equal(rows.find(r=>r.stage==='TASK_DIAGNOSIS').state,'COMPLETED');
 assert.equal(rows.find(r=>r.stage==='HERMES').state,'RUNNING');
 assert.equal(rows.find(r=>r.stage==='HERMES').elapsedMs,1200);
});
test('SSE completion survives an older detail response and keeps exact unavailable timings',()=>{
 const metric={id:'span',stage:'JEV',startedAt:start,endedAt:end,state:'COMPLETED',durationMs:1150,modelInferenceMs:null,networkWaitMs:null,category:'MOCK_FALLBACK'};
 const old={id:'incident',status:'ANALYZING',events:[{id:1,stage:'JEV',state:'RUNNING',created_at:start}],performance:{stages:[{...metric,state:'RUNNING',endedAt:null,durationMs:null}]}};
 const live=mergeIncidentEvents(old,[{id:2,stage:'PERFORMANCE',data_json:JSON.stringify(metric)}]);
 const rows=analysisStages(mergeIncidentSnapshot(old,live),Date.parse(end));
 assert.equal(rows.length,1);assert.equal(rows[0].state,'COMPLETED');assert.equal(rows[0].elapsedMs,1150);assert.equal(rows[0].modelInferenceMs,null);assert.equal(rows[0].category,'MOCK_FALLBACK');
 assert.equal(mergeIncidentEvents(live,live.events).events.length,2);
});
test('latest restart replaces abandoned stage and stopped incidents never retain timers',()=>{
 const stages=[{id:'first',stage:'JEV',startedAt:start,state:'ABANDONED',durationMs:null},{id:'retry',stage:'JEV',startedAt:end,state:'RUNNING'}];
 assert.equal(analysisStages({status:'ANALYZING',performance:{stages}},Date.parse(end)+1000)[0].elapsedMs,1000);
 const stopped=analysisStages({status:'CANCELLED',performance:{stages}},Date.parse(end)+1000)[0];
 assert.equal(stopped.state,'INTERRUPTED');assert.equal(stopped.elapsedMs,null);
 assert.equal(analysisStages({status:'ANALYZING',performance:{stages:[stages[0]]}},Date.parse(end))[0].elapsedMs,null);
});
test('only verified provider results can claim REAL AI',()=>{
 assert.equal(resultCategory({provider:'LOCAL_JEV',simulated:false}),'REAL_AI');
 assert.equal(resultCategory({provider:'LOCAL_JEV'}),'UNAVAILABLE');
 assert.equal(resultCategory({provider:'MOCK',simulated:true}),'DEMO_MOCK');
 assert.equal(resultCategory({provider:'MOCK_HERMES_FALLBACK',simulated:true}),'MOCK_FALLBACK');
 assert.equal(resultCategory({provider:'LOCAL_JEV',simulated:false,fallback:true}),'MOCK_FALLBACK');
 assert.equal(resultCategory(null),'PENDING');
});
