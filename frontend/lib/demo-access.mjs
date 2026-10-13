import { isIP } from 'node:net';
// Only Vercel's overwritten client header is trusted. Generic self-hosted proxies fail closed.
export function demoRequestAllowed(req, env=process.env) {
  if(env.DEMO_ACCESS_ENABLED!=='true'||env.DEMO_DEPLOYMENT_ENV!=='isolated-demo'||!env.DEMO_BACKEND_URL||env.DEMO_BACKEND_URL===env.BACKEND_URL)return false;
  if(!env.DEMO_GATEWAY_KEY||env.DEMO_GATEWAY_KEY.length<32)return false;
  let origin;try{origin=new URL(env.DEMO_ALLOWED_ORIGIN).origin;}catch{return false;}
  // Next standalone can normalize nextUrl to its internal listening hostname.
  // Validate the public Host and caller Origin against the configured origin.
  if(req.headers.get('host')!==new URL(origin).host||req.nextUrl.protocol!==new URL(origin).protocol)return false;
  if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==origin)return false;
  const expires=Date.parse(env.DEMO_ACCESS_EXPIRES_AT||'');if(!Number.isFinite(expires)||Date.now()>=expires)return false;
  if(env.VERCEL==='1'){
    const ip=req.headers.get('x-forwarded-for')?.trim()||'';
    return !!isIP(ip)&&(env.DEMO_ALLOWED_IPS||'').split(',').map(v=>v.trim()).filter(v=>isIP(v)).includes(ip);
  }
  return env.DEMO_LOCAL_ONLY==='true'&&['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname)&&origin.startsWith('http://');
}
export function demoHeaders(env=process.env){return {'X-Demo-Gateway':env.DEMO_GATEWAY_KEY||'','X-Demo-Origin':env.DEMO_ALLOWED_ORIGIN||''};}
