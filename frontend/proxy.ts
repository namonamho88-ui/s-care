import { NextResponse, type NextRequest } from 'next/server';

// Temporary pause: set SCARE_MAINTENANCE_MODE=false and redeploy to resume.
const message = '현재는 서비스 고도화를 위해 서비스 일시 중단 중입니다. 담당자에게 문의 부탁드립니다.';
const maintenanceHtml = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>S-CARE | 서비스 일시 중단 안내</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100svh;display:grid;place-items:center;padding:24px;background:#f3f6fc;color:#17243f;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:600px;padding:56px 36px;background:#fff;border:1px solid #e2e8f2;border-radius:24px;text-align:center;box-shadow:0 18px 60px #203c7310}
.brand{font-size:20px;font-weight:800;letter-spacing:3px;color:#2459c4;margin:0 0 36px}.icon{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 24px;border-radius:20px;background:#edf3ff;color:#2459c4;font-size:28px}
h1{font-size:clamp(23px,5vw,30px);line-height:1.4;letter-spacing:-1px;margin:0 0 20px;word-break:keep-all}p{font-size:16px;line-height:1.9;color:#52617a;margin:0;word-break:keep-all}.contact{margin-top:12px}
@media(max-width:420px){main{padding:40px 22px}body{padding:16px}}
</style></head><body><main><p class="brand">S-CARE</p><div class="icon" aria-hidden="true">Ⅱ</div>
<h1>서비스 일시 중단 안내</h1><p>현재는 서비스 고도화를 위해<br>서비스 일시 중단 중입니다.</p><p class="contact">담당자에게 문의 부탁드립니다.</p>
</main></body></html>`;

export function proxy(request: NextRequest) {
  if (process.env.SCARE_MAINTENANCE_MODE === 'false') return NextResponse.next();

  const headers = {
    'Cache-Control': 'no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  if (request.nextUrl.pathname === '/api' || request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ code: 'SERVICE_MAINTENANCE', message }, { status: 503, headers });
  }
  return new NextResponse(maintenanceHtml, {
    status: 503,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
