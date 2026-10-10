import { randomUUID } from "node:crypto";

const transportCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT"]);

/**
 * Retry a failed read once; a write may already have committed on the server.
 * Never log request bodies, headers, full URLs, or arbitrary exception messages.
 * @param {string} url
 * @param {RequestInit} init
 * @param {string} resource A fixed API resource name, without user input.
 * @returns {Promise<Response>}
 */
export async function fetchBackend(url, init, resource) {
  const method = (init.method || "GET").toUpperCase();
  const readOnly = method === "GET" || method === "HEAD";
  const requestId = randomUUID();
  for (let attempt = 1; attempt <= (readOnly ? 2 : 1); attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (init.signal?.aborted) {
        return Response.json({ error: "요청이 취소되었습니다.", code: "REQUEST_CANCELLED", requestId }, { status: 499 });
      }
      const rawCode = error?.cause?.code || error?.code;
      const code = transportCodes.has(rawCode) ? rawCode : "FETCH_FAILED";
      const retry = readOnly && attempt === 1;
      const diagnostic = { event: retry ? "backend_read_retry" : "backend_proxy_failed", requestId, method, resource, code, attempt };
      (retry ? console.warn : console.error)(JSON.stringify(diagnostic));
      if (retry) continue;
      return Response.json({
        error: readOnly
          ? "서버에서 최신 정보를 가져오지 못했습니다. 잠시 후 다시 확인해 주세요."
          : "서버 응답을 받지 못해 처리 결과를 확인할 수 없습니다. 중복 요청 전에 장애 이력과 현재 상태를 확인해 주세요.",
        code: "BACKEND_UNREACHABLE", requestId, resultUnknown: !readOnly,
      }, { status: 502, headers: { "X-Brain-Request-ID": requestId } });
    }
  }
  throw new Error("Unreachable retry state");
}
