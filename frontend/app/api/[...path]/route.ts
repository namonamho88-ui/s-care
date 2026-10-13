import { NextRequest } from "next/server";
import {demoRequestAllowed,demoHeaders} from "@/lib/demo-access.mjs";
import { fetchBackend } from "@/lib/backend-proxy.mjs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Backend closes each SSE stream before this budget; EventSource resumes by DB event ID.
export const maxDuration = 300;
const upstream = process.env.BACKEND_URL || "http://127.0.0.1:8080";
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  // Session secrets may only be exchanged by /api/session into an HttpOnly cookie.
  if(path[0]==="demo")return Response.json({error:"Not found"},{status:404});
  if (path[0] === "auth" && ["login", "activate"].includes(path[1]))
    return Response.json({ error: "Use the session endpoint" }, { status: 404 });
  if (path.some((p) => p === ".." || p.includes("/")))
    return Response.json({ error: "Invalid path" }, { status: 400 });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.get("origin") &&
    new URL(req.headers.get("origin")!).host !== req.headers.get("host")
  )
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const accountToken=req.cookies.get("brain_token")?.value;
  const token=accountToken||req.cookies.get("brain_demo_token")?.value;
  const demo=!accountToken&&!!token;
  if(demo&&!demoRequestAllowed(req))return Response.json({error:"시연 접속이 종료되었거나 접근이 허용되지 않습니다."},{status:401});
  const headers = new Headers();
  if(demo)Object.entries(demoHeaders()).forEach(([k,v])=>headers.set(k,v));
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (req.headers.get("Content-Type"))
    headers.set("Content-Type", req.headers.get("Content-Type")!);
  if (req.headers.get("Last-Event-ID"))
    headers.set("Last-Event-ID", req.headers.get("Last-Event-ID")!);
    const res = await fetchBackend(
      `${demo?process.env.DEMO_BACKEND_URL:upstream}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`,
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method)
          ? undefined
          : await req.arrayBuffer(),
        cache: "no-store",
        signal: req.signal,
      },
      ["dashboard", "incidents", "simulate", "skills", "audit", "evaluations", "config", "catalog", "graph", "hermes"].includes(path[0]) ? path[0] : "other",
    );
    const out = new Headers();
    for (const key of ["content-type", "content-disposition", "x-brain-request-id"])
      if (res.headers.has(key)) out.set(key, res.headers.get(key)!);
    out.set("Cache-Control", "no-store");
    if (res.headers.get("content-type")?.includes("text/event-stream"))
      out.set("X-Accel-Buffering", "no");
    return new Response(res.body, { status: res.status, headers: out });
}
export { proxy as GET, proxy as POST, proxy as PATCH };
