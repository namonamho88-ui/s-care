/** Convert only recognized fictional verification records, never operator prose.
 * @param {unknown} raw
 * @returns {string | null} A reviewable draft, or null when no conversion is safe.
 */
export function recoveryNotesDraft(raw) {
  if (typeof raw !== "string") return null;
  try {
    const proof = JSON.parse(raw);
    if (proof?.provider !== "SIMULATED_METRICS" || proof.realChanges !== false || typeof proof.passed !== "boolean") return null;
    for (const metrics of [proof.before, proof.after]) {
      if (!metrics || typeof metrics.healthyDependencies !== "boolean"
        || !Number.isFinite(metrics.errorRate) || metrics.errorRate < 0 || metrics.errorRate > 100
        || !Number.isFinite(metrics.latencyMs) || metrics.latencyMs < 0) return null;
    }
    const number = value => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 6 }).format(value);
    const health = value => value ? "정상" : "비정상";
    return [
      proof.passed ? "가상 복구 조치 후 검증을 통과했습니다." : "가상 복구 검증을 통과하지 못했습니다. 추가 확인이 필요합니다.",
      `오류율: ${number(proof.before.errorRate)}% → ${number(proof.after.errorRate)}%`,
      `응답시간: ${number(proof.before.latencyMs)}ms → ${number(proof.after.latencyMs)}ms`,
      `의존 시스템 상태: ${health(proof.before.healthyDependencies)} → ${health(proof.after.healthyDependencies)}`,
      "위 결과는 가상 지표 검증이며 실제 운영 시스템은 변경하지 않았습니다.",
    ].join("\n");
  } catch { return null; }
}
