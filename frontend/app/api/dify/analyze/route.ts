import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCENARIOS = {
  CARD_DB_POOL: {incident_id:"MOCK-CARD-001",service:"CARD-AUTH",severity:"CRITICAL",metrics:{cpu:91.2,memory:82.5,latency_ms:4200,error_rate:12.8},logs:["ERROR HikariPool - Connection is not available","WARN card-auth request latency 4200ms","ERROR approval transaction timeout"]},
  API_LATENCY: {incident_id:"MOCK-API-002",service:"API-GATEWAY",severity:"HIGH",metrics:{cpu:73,memory:65,latency_ms:2900,error_rate:8.1},logs:["WARN upstream response timeout","ERROR gateway retry exhausted"]},
  REDIS_FAILURE: {incident_id:"MOCK-REDIS-003",service:"AUTH-CACHE",severity:"HIGH",metrics:{cpu:55,memory:79,latency_ms:1800,error_rate:6.4},logs:["ERROR Redis connection refused","WARN authentication cache unavailable"]},
  POD_RESTART: {incident_id:"MOCK-POD-004",service:"CARD-WORKER",severity:"MEDIUM",metrics:{cpu:48,memory:94,latency_ms:950,error_rate:3.5},logs:["WARN OOMKilled","ERROR CrashLoopBackOff"]}
} as const;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host"))
    return Response.json({error:"Invalid origin"},{status:403});
  const token = request.cookies.get("brain_token")?.value;
  if (!token) return Response.json({error:"로그인이 필요합니다."},{status:401});
  try {
    const auth = await fetch((process.env.BACKEND_URL || "http://127.0.0.1:8080").replace(/\/$/, "") + "/api/auth/me", {
      headers: {Authorization: `Bearer ${token}`}, cache:"no-store",signal:AbortSignal.timeout(10000)
    });
    if (!auth.ok) return Response.json({error:"유효하지 않은 세션입니다."},{status:401});
  } catch { return Response.json({error:"인증 서버를 확인할 수 없습니다."},{status:503}); }
  const apiKey = process.env.DIFY_API_KEY;
  if (!apiKey) return Response.json({error:"Dify API가 설정되지 않았습니다."},{status:503});
  let body: {scenario_id?:string;question?:string};
  try { body = await request.json(); } catch { return Response.json({error:"Invalid JSON"},{status:400}); }
  if (!body.scenario_id || !(body.scenario_id in SCENARIOS))
    return Response.json({error:"Unknown mock scenario"},{status:400});
  const question = String(body.question || "장애 원인과 복구 권고안을 분석해줘").slice(0,500);
  const scenario = SCENARIOS[body.scenario_id as keyof typeof SCENARIOS];
  const base = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";
  try {
    const res = await fetch(base.replace(/\/$/,"") + "/workflows/run", {
      method:"POST",
      headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({inputs:{scenario_json:JSON.stringify({...scenario,mock:true}),question},response_mode:"blocking",user:"s-care-demo"}),
      signal:AbortSignal.timeout(55000),
      cache:"no-store"
    });
    const payload = await res.json();
    if (!res.ok) return Response.json({error:"Dify 분석 서비스가 응답하지 않았습니다.",status:res.status},{status:502});
    const raw = payload?.data?.outputs?.analysis_json ?? payload?.data?.outputs?.text ?? "";
    let analysis:unknown = raw;
    if(typeof raw==="string") { try { analysis=JSON.parse(raw.replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,"")); } catch { /* retain text */ } }
    return Response.json({mock:true,scenario,analysis,workflow_run_id:payload?.workflow_run_id ?? null},{headers:{"Cache-Control":"no-store"}});
  } catch {
    return Response.json({error:"Dify 연결에 실패했습니다."},{status:502});
  }
}
