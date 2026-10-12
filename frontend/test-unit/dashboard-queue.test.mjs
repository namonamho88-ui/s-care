import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardQueue } from '../lib/dashboard-queue.mjs';

const incident=(id,status,extra={})=>({id,status,owner_id:'OP-01',severity:'P2',notes:'저장된 후기',prevention:'저장된 대책',created_at:'2026-10-12T00:00:00Z',...extra});

test('dashboard finds pending incidents behind recent terminal records and prioritizes human work',()=>{
  const rows=[...Array.from({length:20},(_,i)=>incident(`CLOSED-${i}`,'CLOSED')),incident('rejected','REJECTED'),
    incident('running','ANALYZING',{severity:'P1'}),incident('review','NEEDS_REVIEW'),incident('approval','WAITING_APPROVAL',{severity:'P1'})];
  const original=structuredClone(rows);
  const result=dashboardQueue(rows,{role:'ADMIN'});
  assert.deepEqual(result.map(i=>i.incident.id),['approval','review','running']);
  assert.equal(result[0].guide.target,'approval');
  assert.equal(result[2].running,true);
  assert.deepEqual(rows,original);
});

test('normal user sees own unsaved follow-up as actionable, never admin approvals or others notes',()=>{
  const result=dashboardQueue([
    incident('approval','WAITING_APPROVAL'),incident('failure','FAILED'),
    incident('mine','RESOLVED',{prevention:''}),incident('others','RESOLVED',{owner_id:'OP-02',prevention:''}),
    incident('saved','RESOLVED')],{role:'USER',operatorId:'OP-01'});
  assert.deepEqual(result.filter(i=>i.actionable).map(i=>i.incident.id),['mine']);
  assert.equal(result.find(i=>i.incident.id==='others').guide.badge,'담당자 기록 대기');
  assert.equal(result.find(i=>i.incident.id==='saved').guide.badge,'관리자 종료 대기');
  assert.equal(result.filter(i=>i.finishing).length,3);
});

test('recovery metrics remain a draft requiring review and missing roles do not authorize work',()=>{
  const row=incident('metrics','RESOLVED',{notes:JSON.stringify({passed:true,realChanges:false,provider:'SIMULATED_METRICS',before:{healthyDependencies:false,latencyMs:3200,errorRate:12.5},after:{healthyDependencies:true,latencyMs:120,errorRate:0.02}})});
  assert.equal(dashboardQueue([row],{role:'USER',operatorId:'OP-01'})[0].actionable,true);
  assert.equal(dashboardQueue([row],{})[0].actionable,false);
  assert.equal(dashboardQueue([incident('unknown','FUTURE_STATUS')],{role:'ADMIN'})[0].guide.step,-1);
});

test('canceled and logically deleted records never appear in actionable work',()=>{
 const rows=[incident('stopped','CANCELLED'),incident('deleted','CLOSED',{deleted_at:'2026-10-12'}),incident('old-visible','RESOLVED',{deleted_at:'2026-10-12'}),incident('waiting','NEEDS_REVIEW')];
 assert.deepEqual(dashboardQueue(rows,{role:'ADMIN'}).map(x=>x.incident.id),['waiting']);
});
