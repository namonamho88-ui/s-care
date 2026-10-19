import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForLoginServer } from '../lib/login-readiness.mjs';
test('cold start retries readiness reads only', async () => {
  const calls=[];
  await waitForLoginServer(new AbortController().signal, {request: async (url, init) => {
    calls.push([url,init.method]);
    return Response.json({ready:calls.length===3},{status:calls.length===3?200:503});
  },pause:async()=>{}});
  assert.equal(calls.length,3);
  assert.ok(calls.every(([url,method])=>url==='/api/readiness' && method===undefined));
});
test('outage stops after ten probes',async()=>{
  let count=0;
  await assert.rejects(waitForLoginServer(new AbortController().signal,{request:async()=>{
    count++;return Response.json({ready:false},{status:503});
  },pause:async()=>{}}));
  assert.equal(count,10);
});
test('cancellation prevents further probes',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(waitForLoginServer(controller.signal,{request:async()=>assert.fail('must not fetch')}));
});
