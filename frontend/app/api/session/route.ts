import { NextRequest, NextResponse } from "next/server";
const upstream = process.env.BACKEND_URL || "http://127.0.0.1:8080";
function validOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  try { return !origin || new URL(origin).host === req.headers.get("host"); } catch { return false; }
}
export async function POST(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "입력 정보를 확인하세요." }, { status: 400 }); }
  const mode = body?.mode || (typeof body?.token === "string" ? "admin" : "login");
  if (!["admin", "login", "activate"].includes(mode)) return NextResponse.json({ error: "잘못된 로그인 방식입니다." }, { status: 400 });
  if (mode === "admin" && (typeof body.token !== "string" || body.token.length > 512)) return NextResponse.json({ error: "관리자 토큰을 확인하세요." }, { status: 400 });
  if (mode !== "admin" && (typeof body?.login !== "string" || body.login.length > 60 || typeof body.password !== "string" || body.password.length > 128 || (mode === "activate" && (typeof body.inviteCode !== "string" || body.inviteCode.length > 100)))) return NextResponse.json({ error: "아이디와 인증 정보를 확인하세요." }, { status: 400 });
  try {
    const res = await fetch(`${upstream}${mode === "admin" ? "/api/config" : `/api/auth/${mode}`}`, {
      method: mode === "admin" ? "GET" : "POST",
      headers: mode === "admin" ? { Authorization: `Bearer ${body.token}` } : { "Content-Type": "application/json" },
      body: mode === "admin" ? undefined : JSON.stringify({ login: body.login, password: body.password, ...(mode === "activate" ? { inviteCode: body.inviteCode } : {}) }),
      cache: "no-store", signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error || "로그인 정보를 확인하세요." }, { status: res.status });
    const token = mode === "admin" ? body.token : data.token;
    if (typeof token !== "string" || !data.user) throw new Error("Invalid session response");
    const response = NextResponse.json({ ok: true, user: data.user }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("brain_token", token, { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true" || process.env.VERCEL === "1", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ error: "인증 서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요. 초대 활성화 중이었다면 개인 계정 로그인도 확인해 주세요." }, { status: 502 });
  }
}
export async function DELETE(req: NextRequest) {
  if (!validOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const token = req.cookies.get("brain_token")?.value;
  if (token) {
    try {
      const res = await fetch(`${upstream}/api/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!res.ok && res.status !== 401) throw new Error("Logout failed");
    } catch { return NextResponse.json({ error: "서버의 세션 폐기를 확인하지 못했습니다. 로그아웃을 다시 시도하세요." }, { status: 502 }); }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("brain_token");
  return response;
}
