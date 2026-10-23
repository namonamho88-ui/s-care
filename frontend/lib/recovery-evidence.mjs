const parse = value => { try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; } };
export function recoveryEvidence(incident) {
 const events=incident?.events || [];
 const latest=stage=>parse([...events].reverse().find(e=>e.stage===stage&&e.state!=='RUNNING')?.data_json);
 const verification=latest('RECOVERY_CHECKS') || latest('VERIFY');
 const execution=verification?.provider==='SYNTHETIC_ACTION_MODEL'?verification:latest('MCP_ACTION');
 const plan=latest('RECOVERY_PLAN') || execution?.plan;
 return {plan:plan?.version===2?plan:null,execution:execution?.provider==='SYNTHETIC_ACTION_MODEL'?execution:null};
}
export const stateLabels={jobStatus:'배치 종료 상태',skippedCheckpointKeys:'이미 처리되어 건너뛴 키 수',expectedCount:'예상 건수',processedCount:'처리 건수',expectedAmount:'예상 금액(합성)',processedAmount:'처리 금액(합성)',duplicateCount:'중복 처리 건수',unresolvedRecords:'미해결 레코드',profileState:'원인별 상태',fileAvailable:'입력 파일 준비',accessGranted:'필수 권한 확보',blockingTransactions:'차단 트랜잭션 수',dbConnected:'DB 연결',memoryUsedPercent:'메모리 사용률(%)',freeDiskMb:'디스크 여유(MB)',upstreamComplete:'선행 작업 완료',chunkDurationSeconds:'청크 처리 시간(초)',routeAvailable:'대체 경로 연결',releaseHealthy:'애플리케이션 버전 정상',unauthorizedSessions:'비인가 세션 수',errorRate:'오류율(%)',latencyMs:'응답시간(ms)',healthyDependencies:'의존 시스템 정상'};
export const stateValue=value=>typeof value==='boolean'?(value?'예':'아니오'):value==null?'미기록':typeof value==='number'?new Intl.NumberFormat('ko-KR').format(value):String(value);
export function stateChanges(step) {return Object.keys(stateLabels).filter(key=>step.before?.[key]!==step.after?.[key]).map(key=>`${stateLabels[key]}: ${stateValue(step.before?.[key])} → ${stateValue(step.after?.[key])}`);}
