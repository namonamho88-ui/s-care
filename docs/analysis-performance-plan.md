# 장애 분석 지연: 구조 분석 및 변경 계획

작성일: 2026-10-15. 기준: `origin/main`을 복제한 직후 코드. 가상 장애 전용이며 운영 데이터에는 접근하지 않는다. 작업 브랜치: `perf/incident-analysis-latency`.

## 구현 전 확인한 병목

1. `application.yml`의 `STEP_MS=500`과 `Harness.step()`의 매 시도 sleep. 승인 전 ONTOLOGY, TASK_incident/diagnosis/impact, HERMES, HARNESS 6단계에 최소 3,000ms의 인위 지연이 추가된다. 재시도·복구 단계에도 추가된다.
2. Jev 분류 5개 질문과 Diagnosis 원인/근거 2개 질문은 같은 관측값과 모델로 별도 HTTP 요청한다. LOCAL은 각각 최대 2회 시도한다. 현 latencyMs는 성공한 마지막 요청 중심이며 실제 추론 시간과 통신 시간은 분해하지 못한다.
3. Ontology 이후 incident → diagnosis → impact → knowledge A2A 요청을 순차 수행한다. incident와 diagnosis, knowledge는 서로의 결과를 사용하지 않으며 impact만 저장된 Ontology가 필요하다. 결과 저장은 장애 행 잠금, DB 작업 임대와 체크포인트, messageId 중복 방지로 보호된다.
4. Hermes 검색은 관련 장애 조회를 중복 수행하고 최대 20개 승인 Skill의 전체 DB 행·긴 본문·출처 JSON을 입력으로 보낸다. `/toolsets` 검사는 보안 통제이므로 계속 유지한다.
5. 화면 SSE는 존재하지만 이벤트마다 350ms debounce가 있고 현재 작업을 단일 최신 이벤트로 표현한다. 병렬 단계와 단계별 경과 시간을 표시할 수 없다. 연결 실패 시 30초 polling은 시연 반영을 늦춘다.
6. DB 큐 polling(1초), SSE polling(750ms), HTTP timeout 및 재시도도 사용자 대기 시간에 영향을 준다. 이 값과 실제 모델 서버의 cold start/추론 비용은 격리 측정 결과와 구분한다.

위 내용은 코드에서 확인한 구조 분석이며 실제 모델 성능 측정값이 아니다.

## 변경 순서 및 통제

1. 원본 코드를 `work/baseline`에 보존하고 동일한 신규 가상 관측값으로 격리 H2 기준선을 10회 이상 측정한다. 원본 `scenarios`는 정확도 근거로 사용하지 않는다. 모델 서버 접근 없이 DEMO 및 명시적 연결 실패 경로를 별도로 측정한다.
2. 단계 시작/종료 UTC 시각, monotonic 실행 ms, HTTP roundtrip, 재시도, 실제 provider 및 REAL_AI/DEMO_MOCK/MOCK_FALLBACK 분류를 저장한다. 제공되지 않는 모델 내부 시간·순수 네트워크 시간은 `null`과 측정 불가 사유를 표시하며 HTTP 총시간을 모델 추론 시간으로 오인하지 않는다.
3. STEP_MS 기본값을 0으로 바꾸고 실제 시작·완료 이벤트와 화면 timer로 진행 상태를 표시한다.
4. Jev choice/noul 질문 7개를 하나로 묶고 기존 JevDecision 및 원인 결과 스키마, 각자의 확률 검증·검토 기준을 유지한다. 원인 응답은 저장된 분류 응답에서 재사용하되 malformed 원인은 NEEDS_REVIEW로 보낸다. 기능 flag로 이전 두 호출 경로를 비교할 수 있게 한다. 같은 호출의 시간을 두 번 합산하지 않는다.
5. Ontology 저장 뒤 독립된 A2A 작업을 제한된 executor로 병렬 실행한다. 자식 스레드에 WorkContext 임대를 명시적으로 전달·정리하고, HTTP 중 DB 트랜잭션을 유지하지 않는다. 모든 자식 작업이 종료된 뒤 Harness 검증으로 넘어간다. 승인·중단·삭제·늦은 결과 차단·체크포인트 및 감사 기록을 유지한다.
6. Hermes 검색 후보를 관련도 순 상위 항목과 필요한 필드로 축약하고 후보/문자 수를 제한한다. 승인 원본 목록에 대한 반환 ID 검증과 전체 결과 참조를 유지한다. 입력 크기의 추정치와 실제 API usage를 구분한다.
7. 관리자 워밍업은 기본 조회 시 모델을 호출하지 않는다. 명시적인 REAL 추론 요청만 실행하며, 예상 비용(요율 미설정 시 알 수 없음), 실제 호출·성공 여부, DB 기반 cooldown·시간당 제한·단일 실행을 표시하고 감사한다. 실패를 Mock 준비 완료로 바꾸지 않는다.
8. UI에 실행 중인 모든 단계·경과 시간·완료 단계와 provider 구분을 표시한다. SSE 이벤트는 즉시 병합하고 연결 실패 시 실행 중 장애만 빠르게 조회한다.
9. 백엔드 전체 테스트, 프런트엔드 build/단위 테스트, 병렬성·취소·중복·정책 회귀와 전후 각각 최소 10회 평균·중앙값·nearest-rank P95를 검증한다. H2와 실제 PostgreSQL/Neo4j/Docker 검증 여부를 분리한다.

## 정확도 및 검증 한계

질문·검증 임계값은 유지하지만 한 요청의 다중 질문이 분리 요청과 동일한 답을 낸다고 보장할 수 없다. 실제 모델의 paired accuracy 평가는 버전별 `evaluation_cases`를 사용해야 한다. 현재 환경에 실제 모델과 격리 PostgreSQL이 준비되어 있는지 확인하고, 실행하지 못한 REAL AI 성능/정확도는 미측정으로 명시한다. Mock 성능을 REAL AI 성능으로 보고하지 않는다. 승인 이후 사람 대기 시간은 AI 분석 처리 시간에 포함하지 않는다.
