import test from 'node:test';import assert from 'node:assert/strict';import {demoRequestAllowed} from '../lib/demo-access.mjs';
const env={DEMO_ACCESS_ENABLED:'true',DEMO_DEPLOYMENT_ENV:'isolated-demo',DEMO_BACKEND_URL:'https://demo.invalid',BACKEND_URL:'https://account.invalid',DEMO_GATEWAY_KEY:'fictional-gateway-secret-123456789',DEMO_ALLOWED_ORIGIN:'https://demo-ui.invalid',DEMO_ACCESS_EXPIRES_AT:'2099-01-01T00:00:00Z',VERCEL:'1',DEMO_ALLOWED_IPS:'192.0.2.10'};
const request=(ip='192.0.2.10',origin='https://demo-ui.invalid')=>({method:'POST',nextUrl:new URL('https://demo-ui.invalid/api/session'),headers:new Headers({host:'demo-ui.invalid',origin,'x-forwarded-for':ip})});
test('demo access requires every deployment boundary',()=>{assert.equal(demoRequestAllowed(request(),env),true);for(const change of [{DEMO_ACCESS_ENABLED:'false'},{DEMO_DEPLOYMENT_ENV:'production'},{DEMO_BACKEND_URL:env.BACKEND_URL},{DEMO_GATEWAY_KEY:''},{DEMO_ALLOWED_IPS:''},{DEMO_ACCESS_EXPIRES_AT:'2000-01-01T00:00:00Z'},{VERCEL:'0'}])assert.equal(demoRequestAllowed(request(),{...env,...change}),false);});
test('demo denies other origins, unlisted and chained IPs',()=>{for(const ip of ['192.0.2.11','192.0.2.10, 192.0.2.11','garbage'])assert.equal(demoRequestAllowed(request(ip),env),false);assert.equal(demoRequestAllowed(request('192.0.2.10','https://other.invalid'),env),false);});
test('standalone internal hostname does not override the allowed public Host',()=>{
 const local={...env,VERCEL:'0',DEMO_LOCAL_ONLY:'true',DEMO_ALLOWED_ORIGIN:'http://127.0.0.1:3101'};
 const req={method:'POST',nextUrl:new URL('http://localhost:3101/api/session'),headers:new Headers({host:'127.0.0.1:3101',origin:'http://127.0.0.1:3101'})};
 assert.equal(demoRequestAllowed(req,local),true);req.headers.set('host','other.invalid');assert.equal(demoRequestAllowed(req,local),false);
});
