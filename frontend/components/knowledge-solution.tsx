import { actionExplanation, stateLabels } from "@/lib/recovery-evidence.mjs";
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const rows = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(object) : [];
const labels: Record<string, string> = {
  errorRate: "오류율 (%)", latencyMs: "응답시간 (ms)", healthyDependencies: "연관 시스템 정상 조건",
  blockerResolved: "차단 원인 해소", jobStatus: "배치 상태", expectedCount: "예상 건수",
  sourceCount: "원천 건수", unitAmount: "건당 가상 금액", processedCount: "처리 건수",
  expectedAmount: "예상 가상 금액", processedAmount: "처리 가상 금액", duplicateCount: "중복 건수",
  unresolvedRecords: "미해결 건수", profileState: "조치 상태", blockingTransactions: "차단 트랜잭션 수",
};
const display = (value: unknown): string => value === true ? "충족" : value === false ? "미충족" : value == null ? "기록 없음" : typeof value === "object" ? JSON.stringify(value) : String(value);
const outcome = (value: unknown) => value === true ? "통과" : value === false ? "실패" : "결과 미기록";

/** Interpret only the known verification record; retain authored prose and original evidence. */
export function KnowledgeSolution({ value }: { value: string }) {
  let proof: RecordValue | undefined;
  const start = value.indexOf("{");
  if (value.startsWith("승인된 가상 복구 조치의 검증 기록:") || start === 0) {
    try {
      const parsed: unknown = JSON.parse(value.slice(start));
      if (object(parsed) && object(parsed.before) && object(parsed.after) && Array.isArray(parsed.checks)) proof = parsed;
    } catch { /* Older free text remains readable and is never discarded. */ }
  }
  if (!proof) return <div className="whitespace-pre-wrap break-words">{value}</div>;
  const before = proof.before as RecordValue, after = proof.after as RecordValue;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const plan = object(proof.plan) ? proof.plan : {};
  return <div className="space-y-3 break-words">
    <p>가상 복구 검증 결과: <strong>{outcome(proof.passed)}</strong></p>
    <p className="small muted">가상 데이터 기반 복구 시뮬레이션입니다. 실제 운영 복구 결과가 아닙니다.</p>
    <div><strong>수행한 조치</strong><ol className="list-decimal pl-5 space-y-2">
      {rows(proof.steps).map((step, i) => <li key={i}>{display(step.label ?? step.code)} · {outcome(step.passed)}<p className="small whitespace-pre-line mt-2">{actionExplanation(step, proof)}</p></li>)}
    </ol></div>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left font-semibold">복구 전후 지표 (가상 값)</caption>
      <thead><tr><th>항목</th><th>조치 전</th><th>조치 후</th></tr></thead>
      <tbody>{keys.map(key => <tr key={key}><th className="font-normal pr-2">{labels[key] ?? (stateLabels as Record<string, string>)[key] ?? key}</th><td className="pr-2">{display(before[key])}</td><td>{display(after[key])}</td></tr>)}</tbody>
    </table></div>
    <div><strong>검증 항목</strong><ul className="space-y-1">{rows(proof.checks).map((check, i) => <li key={i}>{display(check.label)}: {outcome(check.passed)} <span className="small muted">(기준 {display(check.expected)} / 결과 {display(check.actual)})</span></li>)}</ul></div>
    {typeof plan.caution === "string" && <p className="small">{plan.caution}</p>}
    <details><summary className="cursor-pointer">원본 검증 기록 보기</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{value}</pre></details>
  </div>;
}
