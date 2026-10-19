/** Only probe readiness; authentication writes must never be replayed. */
export async function waitForLoginServer(signal, { request = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
  const unavailable = () => new Error('서버 준비가 지연되고 있습니다. 아직 로그인 요청은 전송하지 않았습니다. 잠시 후 다시 시도해 주세요.');
  for (let attempt = 0; attempt < 10; attempt++) {
    signal.throwIfAborted();
    if (deadline.aborted) throw unavailable();
    try {
      const response = await request('/api/readiness', { cache: 'no-store', signal: AbortSignal.any([deadline, AbortSignal.timeout(5000)]) });
      if (response.ok && (await response.json()).ready === true) return;
    } catch { signal.throwIfAborted(); if (deadline.aborted) throw unavailable(); }
    if (attempt < 9) await pause(Math.min(5000, 1000 * 2 ** attempt));
  }
  throw unavailable();
}
