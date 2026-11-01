import test from 'node:test';
import assert from 'node:assert/strict';
import {components,dependencies,simulate,exposure,settledAt,validateExperiment,allowedFaults} from '../components/war-room/campus-model.ts';
const fault=(target='pg',type='database',extra={})=>({target,type,intensity:1,duration:30,recoverAt:null,...extra});
const by=(results,id)=>results.find(r=>r.id===id);
test('baseline is healthy, provenance references exist and synthetic cache/replicas are absent',()=>{
 assert(simulate(null,0).every(r=>r.status==='정상'&&r.metrics.error===0));
 assert(!components.some(c=>/redis|replica|kafka/i.test(c.id)));
 for(const e of dependencies)assert(components.some(c=>c.id===e.from)&&components.some(c=>c.id===e.to));
});
test('DB failure travels upstream after timeout, never into independent external services',()=>{
 const e=fault();assert.equal(by(simulate(e,0),'report').status,'정상');
 assert.equal(by(simulate(e,2),'api').status,'영향받음');
 const r=simulate(e,10);assert.equal(by(r,'report').metrics.error,100);
 assert.deepEqual(by(r,'report').path,['report','portal','bff','api','pg']);
 for(const id of ['graph','jev','hermes'])assert.equal(by(r,id).status,'정상');
});
test('shared JVM and frontend outages affect the hosted worker and user entrypoints',()=>{
 assert.notEqual(by(simulate(fault('api','down'),5),'queue').status,'정상');
 assert.equal(simulate(fault('portal','down'),10).filter(r=>components.find(c=>c.id===r.id).kind==='feature'&&r.status!=='정상').length,4);
});
test('Neo4j runtime outage has no automatic SQL failover; explicit SQL mode removes only graph dependency',()=>{
 const e=fault('graph','database');assert.equal(by(simulate(e,8),'impact').metrics.error,100);
 assert.equal(by(simulate(e,8),'report').status,'정상');
 assert.equal(by(simulate(e,8,{sqlMode:true,mockFallback:true}),'impact').status,'정상');
 assert.equal(by(simulate(fault(),10,{sqlMode:true,mockFallback:true}),'impact').metrics.error,100);
});
test('Mock preserves request completion with explicit degraded quality and never hides all transport delay',()=>{
 const e=fault('hermes','external',{duration:120});
 const degraded=by(simulate(e,95),'knowledge');assert.equal(degraded.metrics.error,0);assert.notEqual(degraded.status,'정상');assert.match(degraded.reason,/Mock/);
 assert.equal(by(simulate(e,95,{sqlMode:false,mockFallback:false}),'knowledge').metrics.error,100);
});
test('retries delay propagation; latency and intensity change results monotonically',()=>{
 const e=fault('jev','down',{duration:120});assert.equal(by(simulate(e,59),'queue').status,'정상');assert.notEqual(by(simulate(e,61),'queue').status,'정상');
 assert.doesNotMatch(by(simulate(fault('jev','latency',{duration:120}),61),'queue').reason,/Mock/);
 assert(by(simulate(fault('pg','latency',{intensity:.1}),8),'report').metrics.error<by(simulate(fault('pg','latency'),8),'report').metrics.error);
});
test('manual recovery and expiry restore all metrics after pending propagation; exposure remains',()=>{
 for(const recoverAt of [null,12]){const e=fault('pg','database',{recoverAt});const final=simulate(e,settledAt(e));assert.deepEqual(final,simulate(null,0));const seen=exposure(e,settledAt(e));assert(seen.get('report').peak.path.includes('pg'));assert(seen.get('report').last<settledAt(e));}
});
test('all supported faults stay bounded and recover, invalid input is rejected',()=>{
 for(const c of components)for(const type of allowedFaults(c)){const e=fault(c.id,type);for(const r of simulate(e,15)){assert(r.metrics.error>=0&&r.metrics.error<=100);assert(r.metrics.throughput>=0);assert(Number.isFinite(r.metrics.latency));}assert(simulate(e,settledAt(e)).every(r=>r.status==='정상'));}
 for(const extra of [{intensity:NaN},{duration:0},{target:'unknown'},{target:'api',type:'database'}])assert.throws(()=>validateExperiment(fault('pg','database',extra)));
});
