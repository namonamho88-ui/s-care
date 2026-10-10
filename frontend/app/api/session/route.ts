import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  if (
    req.headers.get("origin") &&
    new URL(req.headers.get("origin")!).host !== req.headers.get("host")
  )
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const { token } = await req.json();
  if (typeof token !== "string" || token.length > 512)
    return NextResponse.json(
      { error: "유효한 관리자 토큰을 입력하세요." },
      { status: 400 },
    );
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL || "http://127.0.0.1:8080"}/api/config`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!res.ok)
      return NextResponse.json(
        { error: "관리자 토큰을 확인하세요." },
        { status: 401 },
      );
    const response = NextResponse.json({ ok: true });
    response.cookies.set("brain_token", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true" || process.env.VERCEL === "1",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "백엔드를 먼저 실행하세요." },
      { status: 502 },
    );
  }
}
export async function DELETE() {
  const r = NextResponse.json({ ok: true });
  r.cookies.delete("brain_token");
  return r;
}
