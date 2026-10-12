import { recoveryNotesDraft } from "@/lib/recovery-notes.mjs";
import { technologyEvidence } from "@/lib/technology-guide.mjs";

/** A read-only briefing based on persisted evidence; never advances the workflow. */
export default function IncidentBriefing({ incident, nextAction }: {
  incident: Record<string, any>; nextAction: string;
}) {
  const decision = incident.decision;
  const types: Record<string, string> = { RESOURCE: "자원 부족", DATABASE: "데이터베이스", NETWORK: "통신", APPLICATION: "프로그램", SECURITY: "보안" };
  const verification = [...(incident.events || [])].reverse().find(e => e.stage === "VERIFY" && e.state === "COMPLETED");
  const raw = verification?.data_json ?? incident.notes;
  const recovery = recoveryNotesDraft(typeof raw === "string" ? raw : JSON.stringify(raw));
  const affected = incident.impact?.affected;
  return <details className="incident-briefing">
    <summary><span>한눈에 보는 장애 대응</span><small>발표할 때 펼쳐 보세요 · 발생 → 분석 → 결과</small></summary>
    <div className="briefing-grid">
      <section><span className="briefing-number">01 · 무슨 일이 생겼나요?</span><h3>{incident.asset_name || "대상 확인 중"}</h3><p>{incident.observations || "발생 현상이 기록되지 않았습니다."}</p></section>
      <section><span className="briefing-number">02 · 어떤 판단을 했나요?</span><h3>{decision ? types[decision.type] || "분류 확인 필요" : "아직 판단 전입니다"}</h3><p>분류 결과이며, 확정된 장애 원인은 아닙니다.</p>{Number.isFinite(decision?.confidence) && <p>판단 신뢰도 {Math.round(decision.confidence * 100)}%</p>}<p>{Array.isArray(affected) ? `영향 가능 대상 ${affected.length}개 · 실제 장애 여부는 별도 확인` : "영향 범위 분석 기록 대기"}</p></section>
      <section><span className="briefing-number">03 · 지금 무엇을 하나요?</span><h3>{nextAction}</h3><p>담당자: {incident.owner_name || "미지정"}</p><p>화면 아래 현재 단계 안내에 따라 확인하거나 입력하세요.</p></section>
    </div>
    <section className="briefing-result"><h3>조치 전후 비교</h3><p style={{ whiteSpace: "pre-line" }}>{recovery || "확인 가능한 가상 복구 비교 기록이 아직 없습니다. 검증 결과가 저장되면 이곳에 표시됩니다."}</p></section>
    <details className="workflow-evidence"><summary>이 요약의 판단 출처 확인</summary>{technologyEvidence("jev", incident).map((line: string) => <p key={line}>{line}</p>)}</details>
    <p className="small muted">저장된 기록으로 구성한 요약입니다. 모든 장애·대상·복구 지표는 가상 데이터입니다.</p>
  </details>;
}
