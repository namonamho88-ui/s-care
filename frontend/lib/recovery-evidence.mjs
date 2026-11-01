const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
export function recoveryEvidence(incident) {
 const events=incident?.events || [];
 const latest=stage=>parse([...events].reverse().find(e=>e.stage===stage&&e.state!=='RUNNING')?.data_json);
 const verification=latest('RECOVERY_CHECKS') || latest('VERIFY');
 const execution=verification?.provider==='SYNTHETIC_ACTION_MODEL'?verification:latest('MCP_ACTION');
 const plan=latest('RECOVERY_PLAN') || execution?.plan;
 return {plan:plan?.version===2?plan:null,execution:execution?.provider==='SYNTHETIC_ACTION_MODEL'?execution:null};
}
export const stateLabels={prechecked:'사전 점검 완료',blockerResolved:'차단 원인 해소',jobStatus:'배치 종료 상태',skippedCheckpointKeys:'이미 처리되어 제외한 건수',expectedCount:'예상 건수',processedCount:'처리 건수',expectedAmount:'예상 금액',processedAmount:'처리 금액',duplicateCount:'중복 처리 건수',unresolvedRecords:'미해결 레코드',profileState:'원인별 상태',fileAvailable:'입력 파일 준비',accessGranted:'필수 권한 확보',blockingTransactions:'차단 트랜잭션 수',dbConnected:'DB 연결',memoryUsedPercent:'메모리 사용률(%)',freeDiskMb:'디스크 여유(MB)',upstreamComplete:'선행 작업 완료',chunkDurationSeconds:'청크 처리 시간(초)',routeAvailable:'대체 경로 연결',releaseHealthy:'애플리케이션 버전 정상',unauthorizedSessions:'비인가 세션 수',errorRate:'오류율(%)',latencyMs:'응답시간(ms)',healthyDependencies:'의존 시스템 정상'};
const statusNames={READY:'조치 후 정상',UNHEALTHY:'이상 상태',ABEND:'비정상 종료',END_OK:'정상 종료',FILE_MISSING:'입력 파일 없음',ACCESS_DENIED:'접근 권한 없음',LOCKED:'잠금 발생',DISCONNECTED:'연결 끊김',HEAP_EXHAUSTED:'메모리 부족',DISK_FULL:'저장 공간 부족',DUPLICATE_KEYS:'중복 데이터 존재',UNRECONCILED:'대사 불일치',UPSTREAM_FAILED:'선행 작업 실패',DEADLINE_EXCEEDED:'제한 시간 초과'};
export const stateValue=value=>typeof value==='boolean'?(value?'예':'아니오'):value==null?'미기록':typeof value==='number'?new Intl.NumberFormat('ko-KR').format(value):(statusNames[value] || String(value));
export function stateChanges(step) {return Object.keys(stateLabels).filter(key=>step.before?.[key]!==step.after?.[key]).map(key=>`${stateLabels[key]}: ${stateValue(step.before?.[key])} → ${stateValue(step.after?.[key])}`);}

/** Render saved recovery descriptions in everyday operational language; audit JSON stays unchanged. */
export function operationalText(value) {
 return String(value ?? '')
  .replaceAll('합성 멱등키 확인 후 미처리 구간만 재실행','기존 처리 이력을 확인하고 미처리 구간만 재실행')
  .replaceAll('가상 대상·복구 전 상태와 재실행 안전성 점검','대상 시스템·장애 상태 및 재실행 조건 확인')
  .replaceAll('합성 상태를 기반으로 오류율·응답시간·의존성 재측정','오류율·응답시간·연결 상태 재측정')
  .replaceAll('합성 오류 레코드를 격리하고 검증된 합성 데이터로 재처리','오류 레코드를 분리하고 검증된 데이터로 재처리')
  .replaceAll('멱등키','기존 처리 이력').replaceAll('(합성)','').replace(/(^|[\s·])합성\s+/g,'$1').replace(/(^|[\s·])가상\s+/g,'$1');
}

/** Describe persisted simulator operations, never infer real operational actions. */
export function actionExplanation(step, execution) {
 const before=step?.before || {}, after=step?.after || {};
 if(execution?.provider!=='SYNTHETIC_ACTION_MODEL' || execution?.realChanges!==false)
  return '구체적인 수행 방법이 기록되지 않았습니다. 조치명만으로 실제 실행 절차를 확인할 수 없습니다.';
 const methods={
  PRECHECK:'저장된 가상 복구 상태에 사전 점검 완료 여부를 기록하는 단계입니다. 실제 서버 점검 명령은 실행하지 않습니다.',
  REMEDIATE:'원인 유형에 해당하는 가상 상태 값을 변경하는 단계입니다. 아래 전후 값은 시뮬레이션에서 변경한 항목입니다. 실제 파일·프로세스·DB에 조치한 기록은 아닙니다.',
  RERUN:'가상 레코드의 기존 처리 키를 유지하고 이미 처리된 키는 제외한 뒤, 남은 키를 처리 집합에 추가해 건수와 금액을 다시 계산하는 단계입니다.',
  RECONCILE:'저장된 배치 종료 상태, 예상 대비 처리 건수·금액, 중복 건수와 미해결 건수를 비교하는 단계입니다. 데이터 수정 없이 조건 일치 여부를 검사합니다.',
  PROBE:'가상 차단 원인의 해소 여부를 확인하고, 통과 시 시나리오에 정의된 오류율·응답시간 값을 기록하는 단계입니다. 실제 서버를 측정한 값은 아닙니다.',
 };
 const lines=[methods[step.code] || '세부 실행 방식이 기록되지 않은 단계입니다.'];
 if(step.passed===false)lines.push('이 단계는 실패했습니다. 완료된 조치로 해석하지 마세요.');
 if(step.code==='RERUN' && step.passed===true && Number.isFinite(before.processedCount)&&Number.isFinite(after.processedCount))
  lines.push(`기존 처리 ${stateValue(before.processedCount)}건을 유지하고 ${stateValue(after.processedCount-before.processedCount)}건을 추가 처리했습니다. 총 ${stateValue(after.processedCount)}건입니다.`);
 const changes=stateChanges(step);
 lines.push(changes.length?'기록된 변경: '+changes.join(' / '):'기록된 지표 변경 없음.');
 return lines.join('\n');
}
