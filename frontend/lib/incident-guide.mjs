import { recoveryNotesDraft } from './recovery-notes.mjs';

export const incidentSteps = [
  { label: '장애 접수', who: '사용자 / 관리자' },
  { label: '분석·판단 확인', who: '자동 · 필요 시 관리자' },
  { label: '대응 승인', who: '관리자' },
  { label: '복구 검증', who: '자동' },
  { label: '후기 검토·저장', who: '담당자 / 관리자' },
  { label: '장애 종료', who: '관리자' },
];

const stageNames = {
  FORCE_STOP: '강제 종료', MANAGEMENT: '관리자 처리', INCIDENT: '장애 접수', MESSAGE_INTAKE: '문자 관측값 확인', JEV: 'AI 장애 판단 · Jev', ONTOLOGY: '영향 범위 분석 · Ontology',
  AGENT_INCIDENT: '업무 조정 · Incident Agent', AGENT_DIAGNOSIS: '원인 후보 분석 · Diagnosis Agent',
  AGENT_IMPACT: '영향 분석 · Impact Agent', AGENT_KNOWLEDGE: '해결 지식 검색 · Knowledge Agent',
  AGENT_RECOVERY: '복구 가이드 · Recovery Agent', AGENT_REPORT: '보고서 작성 · Report Agent',
  HERMES: '승인된 해결 절차 검색 · Hermes', HARNESS: '판단 근거·실행 정책 검증 · Harness',
  REVIEW: '관리자 판단 확인', APPROVAL: '관리자 대응 승인', RECOVERY: '가상 복구 가이드',
  MCP_ACTION: '가상 복구 조치 · MCP', VERIFY: '가상 지표 검증', REPORT: '보고서 생성',
  SKILL_DRAFT: '해결 해결 절차 초안 생성', HISTORY: '보고서·장애 이력 저장', CLOSE: '장애 종료', FAILURE: '실행 중단',
};
export const stageLabel = stage => stageNames[String(stage).toUpperCase()] || stage;
export const eventStateLabel = state => ({ RUNNING: '진행 중', COMPLETED: '완료', WAITING: '확인 대기', NEEDS_REVIEW: '확인 필요', FAILED: '실패', REJECTED: '거부' }[state] || state);

// Status is authoritative. Events explain the current automatic phase, never advance it on a timer.
// Reviewing classification can lead to a second review of newly generated diagnosis evidence.
/** @param {Record<string, any> | null} incident
 * @param {{isAdmin?: boolean, canEdit?: boolean, dirty?: boolean, notes?: string, prevention?: string}} options */
export function incidentGuide(incident, options = {}) {
  const { isAdmin = false, canEdit = false, dirty = false } = options;
  const events = incident?.events || [];
  const latest = events.at(-1);
  const notes = options.notes ?? incident?.notes ?? '';
  const prevention = options.prevention ?? incident?.prevention ?? '';
  const hasDraft = !!recoveryNotesDraft(incident?.notes);
  const needsSave = dirty || hasDraft || !notes.trim() || !prevention.trim();
  let step = 0, tone = 'auto', badge = '여기서 시작', title = '먼저 장애를 접수하세요';
  let text = '가상 장애를 등록하면 AI 분석이 시작됩니다. 표시된 순서대로 따라가며, 현재 단계의 안내 버튼을 누르세요.';
  let action = '장애 접수 시작', target = 'register';
  switch (incident?.status) {
    case undefined: break;
    case 'REGISTERED':
      badge = '자동 진행'; title = '접수 완료 · 분석 시작을 기다리고 있어요';
      text = '장애가 DB에 저장되었습니다. 다시 등록하지 않아도 분석이 시작됩니다.';
      action = '실행 기록 보기'; target = 'timeline'; break;
    case 'ANALYZING':
      step = 1; badge = '자동 진행'; title = 'AI가 원인과 영향 범위를 분석하고 있어요';
      text = '장애 판단 → 영향 분석 → AI 도우미 협업·해결 방법 검색 → 안전 점검이 진행됩니다. 확인이 필요하면 이곳에 안내됩니다.';
      action = '실행 기록 보기'; target = 'timeline'; break;
    case 'NEEDS_REVIEW':
      step = 1; tone = 'attention'; badge = isAdmin ? '지금 관리자 확인' : '관리자 확인 대기';
      title = isAdmin ? '관측과 AI 판단을 비교하고 확인 근거를 작성하세요' : '관리자가 AI 판단을 확인해야 합니다';
      text = '근거가 부족해 분석이 멈췄습니다. 분류·심각도·부서를 검토하고 확인 근거를 입력하면 분석을 계속합니다. 새 원인 후보에 대한 추가 확인이 필요할 수 있습니다.';
      action = isAdmin ? '판단 확인 위치로 이동' : '분석 결과 보기'; target = isAdmin ? 'review' : 'analysis'; break;
    case 'WAITING_APPROVAL':
      step = 2; tone = 'attention'; badge = isAdmin ? '지금 관리자 승인' : '관리자 승인 대기';
      title = isAdmin ? '영향 범위를 검토하고 대응 여부를 결정하세요' : '관리자의 대응 승인을 기다리고 있어요';
      text = '분석과 안전 점검이 끝났습니다. 관리자가 사유를 작성해 승인하면 가상 복구를 시작합니다. 거부하면 이 흐름은 중단됩니다.';
      action = isAdmin ? '대응 승인 위치로 이동' : '분석 결과 보기'; target = isAdmin ? 'approval' : 'analysis'; break;
    case 'RECOVERING':
      step = 3; badge = '자동 진행'; title = '가상 복구를 검증하고 보고서를 만들고 있어요';
      text = '승인된 가상 지표를 변경·검증한 뒤 보고서, 해결 절차 초안, 이력을 저장합니다. 실제 운영 시스템은 변경하지 않습니다.';
      action = '실행 기록 보기'; target = 'timeline'; break;
    case 'RESOLVED':
      step = needsSave ? 4 : 5; tone = 'attention';
      if (needsSave) {
        badge = canEdit ? '지금 후기 검토·저장' : '담당자 기록 대기';
        title = canEdit ? '후기와 재발 방지 대책을 확인하고 저장하세요' : '담당자 또는 관리자의 후기 저장이 필요해요';
        text = hasDraft ? '가상 복구 결과를 한국어 초안으로 정리했습니다. 아직 저장되지 않은 초안입니다. 내용을 검토·보완하고 저장해야 보고서에 반영됩니다.' : '복구 검증은 끝났습니다. 후기와 재발 방지 대책을 채우고 수정 내용을 저장하세요. 저장 전에는 종료할 수 없습니다.';
        action = canEdit ? '후기 작성 위치로 이동' : '후기 및 보고서 보기'; target = canEdit ? 'notes' : 'report';
      } else {
        badge = isAdmin ? '지금 최종 확인' : '관리자 종료 대기';
        title = isAdmin ? '저장된 후기를 검토하고 장애를 종료하세요' : '후기가 저장되었습니다 · 관리자 종료를 기다려 주세요';
        text = '후기와 재발 방지 대책이 DB에 저장되어 있습니다. 내용을 최종 검토한 뒤 관리자가 종료합니다. 해결 절차 초안 승인은 해결 지식 메뉴의 별도 절차입니다.';
        action = isAdmin ? '최종 확인 위치로 이동' : '저장된 후기 보기'; target = isAdmin ? 'close' : 'report';
      }
      break;
    case 'CANCELLED':
      step = -1; tone = 'stopped'; badge = '강제 종료'; title = '관리자가 장애 처리를 강제 종료했습니다';
      text = '복구 완료가 아닙니다. 실행은 중단되었으며 기존 처리 기록과 사유를 확인할 수 있습니다.'; action = '중단 기록 보기'; target = 'timeline'; break;
    case 'CLOSED':
      step = 6; tone = 'complete'; badge = '전체 단계 완료'; title = '종료된 장애입니다 · 보고서를 확인하세요';
      text = dirty ? '화면에 저장되지 않은 수정 내용이 있습니다. 보고서는 DB에 저장된 내용을 사용합니다.' : '장애 처리가 마감되었습니다. 저장된 후기와 PDF·Excel 보고서를 확인할 수 있습니다. 해결 절차 초안은 관리자가 별도로 승인합니다.';
      action = '보고서 위치로 이동'; target = 'downloads'; break;
    case 'REJECTED':
      step = 2; tone = 'stopped'; badge = '대응 거부 · 중단'; title = '대응이 거부되어 복구를 실행하지 않았어요';
      text = '실행 기록에서 거부 사유를 확인하세요. 이 장애는 복구 완료나 종료 상태가 아닙니다.';
      action = '거부 사유 보기'; target = 'timeline'; break;
    case 'FAILED': {
      const previous = [...events].reverse().find(e => e.stage !== 'FAILURE');
      const recoveryStages = ['RECOVERY', 'MCP_ACTION', 'VERIFY', 'REPORT', 'SKILL_DRAFT', 'HISTORY', 'AGENT_RECOVERY', 'AGENT_REPORT'];
      step = recoveryStages.includes(String(previous?.stage).toUpperCase()) || (previous?.stage === 'APPROVAL' && previous?.state === 'COMPLETED') ? 3 : 1;
      tone = 'stopped'; badge = '실행 실패 · 확인 필요'; title = '실행이 중단되었습니다 · 오류 원인을 먼저 확인하세요';
      text = isAdmin ? '실행 기록에서 원인을 확인하고 연결 문제 등을 해결한 뒤 재시도하세요. 재시도는 버튼을 눌러야 실행됩니다.' : '관리자에게 오류 확인과 재시도를 요청하세요. 실행 기록은 직접 확인할 수 있습니다.';
      action = '오류 기록 보기'; target = 'timeline'; break;
    }
    default:
      step = -1; tone = 'stopped'; badge = '상태 확인 필요'; title = '처리 상태를 확인할 수 없습니다';
      text = '실행 기록을 확인하고 관리자에게 문의하세요.'; action = '실행 기록 보기'; target = 'timeline';
  }
  if (incident?.deleted_at) { step=-1; tone='stopped'; badge='삭제된 장애'; title='목록에서 삭제된 장애입니다'; text='기록은 보존되어 있습니다. 관리자가 복원할 수 있으며 중단한 작업은 자동으로 재개되지 않습니다.'; action='삭제 기록 보기'; target='timeline'; }
  const activeLatest = ['ANALYZING', 'RECOVERING'].includes(incident?.status) && latest && latest.stage !== 'FAILURE' && latest.state !== 'WAITING';
  return { step, tone, badge, title, text, action, target,
    phase: activeLatest ? `${stageLabel(latest.stage)} · ${eventStateLabel(latest.state)}` : null,
    steps: incidentSteps.map((item, index) => ({ ...item, state: step === 6 || index < step ? 'complete' : index === step ? 'current' : 'pending' })),
  };
}
