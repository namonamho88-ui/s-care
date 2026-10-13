// Run only against the isolated local pair described in docs/DEMO_ACCESS_SETUP.md.
import assert from 'node:assert/strict';
const base=process.env.TEST_BFF_URL||'http://127.0.0.1:3100';
assert.equal(new URL(base).hostname,'127.0.0.1','Local integration test only');
const token=process.env.TEST_ACCOUNT_ADMIN_TOKEN;
assert.ok(token,'TEST_ACCOUNT_ADMIN_TOKEN is required for the local account backend');
async function call(path,method='GET',body,cookie=''){
 const res=await fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,data:await res.json(),cookies:res.headers.getSetCookie()};
}
const session=await call('/api/session','POST',{mode:'demo'});
assert.equal(session.status,200);assert.equal(session.data.user.role,'DEMO_ADMIN');assert.equal(session.data.token,undefined);
const setCookie=session.cookies.find(x=>x.startsWith('brain_demo_token='));
assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=strict/i);
const demoCookie=setCookie.split(';')[0];
assert.equal((await call('/api/config','GET',undefined,demoCookie)).data.user.role,'DEMO_ADMIN');
assert.equal((await call('/api/auth/users','GET',undefined,demoCookie)).status,403);
assert.equal((await call('/api/demo-control','GET',undefined,demoCookie)).status,401);
const login=await call('/api/session','POST',{mode:'admin',token});assert.equal(login.status,200);
const adminCookie=login.cookies.find(x=>x.startsWith('brain_token=')).split(';')[0];
assert.equal((await call('/api/config','GET',undefined,adminCookie+'; '+demoCookie)).data.user.role,'ADMIN');
assert.equal((await call('/api/demo-control','GET',undefined,adminCookie)).data.enabled,true);
assert.equal((await call('/api/demo-control','POST',{enabled:false},adminCookie)).data.enabled,false);
assert.equal((await call('/api/config','GET',undefined,demoCookie)).status,401);
assert.equal((await call('/api/session','POST',{mode:'demo'})).status,401);
assert.equal((await call('/api/config','GET',undefined,adminCookie)).status,200);
assert.equal((await call('/api/demo-control','POST',{enabled:true},adminCookie)).data.enabled,true);
assert.equal((await call('/api/config','GET',undefined,demoCookie)).status,401,'Old session cannot revive');
assert.equal((await call('/api/session','POST',{mode:'demo'})).status,200);
console.log('PASS: actual BFF cookie, backend routing, account restriction, disable/re-enable revocation.');
