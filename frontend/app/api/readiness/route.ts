// User-triggered readiness only. No credentials, database queries, or AI warmup.
export async function GET() {
  let ready = false;
  try {
    const response = await fetch(`${process.env.BACKEND_URL || "http://127.0.0.1:8080"}/api/health`, {
      cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    ready = response.ok && (await response.json()).status === "UP";
  } catch { /* A cold start and an outage are indistinguishable here. */ }
  return Response.json({ ready }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
