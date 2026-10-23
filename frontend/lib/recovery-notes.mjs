/** Convert only recognized fictional verification records, never operator prose.
 * @param {unknown} raw
 * @returns {string | null} A reviewable draft, or null when no conversion is safe.
 */
export function recoveryNotesDraft(raw) {
  if (typeof raw !== "string") return null;
  try {
    const proof = JSON.parse(raw);
    if (proof?.provider === "SYNTHETIC_ACTION_MODEL") {
      if (proof.realChanges !== false || proof.plan?.version !== 2 || typeof proof.passed !== 'boolean'
        || !Array.isArray(proof.steps) || !proof.steps.length || !Array.isArray(proof.checks) || !proof.checks.length
        || proof.steps.some(step=>typeof step.label!=='string'||typeof step.passed!=='boolean')
        || proof.checks.some(check=>typeof check.label!=='string'||typeof check.passed!=='boolean')) return null;
      const allPassed=proof.steps.every(step=>step.passed)&&proof.checks.every(check=>check.passed);
      if (proof.passed && !allPassed) return null;
      return [
        proof.passed?'가상 조치와 항목별 검증을 통과했습니다.':'가상 조치 검증 실패 · 추가 확인이 필요합니다.',
        '선택한 시나리오: '+proof.plan.label,
        '아래 상태·건수·금액은 규칙으로 만든 합성 데이터이며 실제 처리 결과가 아닙니다.',
        ...proof.steps.map((step,index)=>`${index+1}. ${step.label} · ${step.passed?'완료':'실패'}`),
        ...proof.checks.map(check=>`${check.label}: 기대 ${check.expected} / 결과 ${check.actual} · ${check.passed?'통과':'실패'}`),
        '위 결과는 가상 시뮬레이션이며 실제 운영 시스템은 변경하지 않았습니다.',
      ].join('\n');
    }
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
