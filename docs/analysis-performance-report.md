# S-CARE 장애 분석 최적화 결과

2026-10-15 · 브랜치 `perf/incident-analysis-latency` · 기준 커밋 `18576c8ba68956f17e9e92ec36d8a32ac2a3e9dd`.

운영 DB·운영 장애·운영 배포를 변경하지 않았다. 새로 복제한 저장소와 폐기 가능한 H2 메모리 DB에서 가상 장애만 생성했다. 구현 전에 [병목 분석·변경 계획](analysis-performance-plan.md)을 작성하고 원본 코드를 별도 폴더에 보존했다.

## 전후 측정 결과

동일한 신규 가상 장애 관측값·자산·승인 지식 seed로 **개선 전 24회, 개선 후 24회** 실행했다. 각 버전에서 DEMO 12회와 명시적 LOCAL 통신 실패 후 fallback 12회를 분리했다. 시간 경계는 등록 POST 직전부터 `WAITING_APPROVAL` 도달까지이며, DB 큐·A2A HTTP·검증을 포함한다. 사람 승인 대기와 승인 후 복구 시간은 포함하지 않는다.

| 결과 종류 | 전/후 표본 수 | 평균(ms) 전→후 | 중앙값(ms) 전→후 | P95(ms) 전→후 | 평균 감소 |
|---|---:|---:|---:|---:|---:|
| DEMO Mock | 12 / 12 | 4,007.27 → 142.15 | 4,021.91 → 115.48 | 4,063.39 → 554.94 | 96.45% |
| MOCK_FALLBACK | 12 / 12 | 4,033.98 → 78.02 | 4,042.41 → 77.11 | 4,077.82 → 98.49 | 98.07% |
| REAL AI | 0 / 0 | 미측정 | 미측정 | 미측정 | 산출하지 않음 |

위 감소율은 **Mock 및 로컬 연결 실패 경로의 애플리케이션 처리 시간**이다. 실제 모델 추론 속도 개선율이 아니다. 연결 실패는 loopback의 즉시 거절이며 원격 네트워크 timeout 30초/90초를 대표하지 않는다. 같은 Windows PC/JDK 18/Spring Boot/H2 PostgreSQL 모드에서 실행했고 Neo4j 대신 기존 SQL 영향 분석을 사용했다. 첫 요청의 JVM/HTTP 초기화 비용도 포함했으며 이상치를 제거하지 않았다. P95는 nearest-rank로, 표본 12개에서는 최대값이다. 작은 표본이며 클라우드 부하 시험이나 PostgreSQL 성능 인증이 아니다.

원자료: [전](evidence/analysis-performance-baseline.json), [후](evidence/analysis-performance-optimized.json), [비교·단계 평균](evidence/analysis-performance-comparison.json). [비교 스크립트](../scripts/compare_analysis_benchmarks.py)는 시나리오·측정 경계·표본 수를 검증하고 종류별로 집계한다.

## 확인된 병목과 개선

단계 시작/완료 이벤트를 동일한 기준으로 비교한 DEMO 평균이다. 이후 계측 추가와 병렬 DB 접근 때문에 일부 내부 단독 단계의 비용은 늘었지만 전체 대기는 크게 줄었다.

| 구간 | 전(ms) | 후(ms) |
|---|---:|---:|
| 등록 저장→Jev 시작(큐 대기) | 825.33 | 9.17 |
| Jev 분류 | 3.08 | 8.33 |
| Ontology | 509.92 | 3.00 |
| Incident A2A | 524.83 | 30.75 |
| Diagnosis A2A | 523.92 | 45.75 |
| Impact A2A | 521.42 | 33.00 |
| Hermes A2A | 529.92 | 52.00 |
| Harness 검증 | 511.75 | 7.08 |

- 기본 `STEP_MS`를 설정 파일·Compose·환경 예제 모두 500→0으로 변경했다. 원래 승인 전 6단계에 최소 3,000ms가 붙었다. 실제 RUNNING/COMPLETED 이벤트와 화면 timer로 진행 상태를 유지한다.
- 큐에 넣은 트랜잭션이 커밋된 뒤 즉시 작업자를 깨우고 짧은 1회 보조 확인과 작업 종료 시 재확인을 수행한다. 재시작 복구용 1초 주기 polling도 유지한다.
- Ontology 저장 후 incident/diagnosis/impact/knowledge A2A를 제한된 executor에서 병렬 실행한다. 작업 임대를 자식 스레드에 전달하며, 모든 자식 종료 후 Harness 검증으로 넘어간다. HTTP 동안 DB 트랜잭션을 열어 두지 않는다.
- 각 단계의 UTC 시작·종료, monotonic 실행 ms, HTTP 총시간, 재시도, 실제 provider/결과 종류를 새 표에 저장한다. 모델 내부 시간은 제공자가 `Server-Timing: inference;dur=...`를 보낼 때만 채운다. 순수 네트워크 대기는 관측할 수 없어 null로 남긴다. A2A 외부/내부와 병렬 단계는 겹치므로 시간 합산을 금지한다.
- 오래된 실행의 미완료 계측은 작업 재개 시 `ABANDONED`로 표시한다. 관리자 중단과 큐 재개가 같은 장애 행 잠금으로 직렬화되며, 임대가 만료된 자식 결과는 저장되지 않는다. 중복 messageId·체크포인트·감사 로그·승인 후 MCP 검증을 유지했다.

## 실제 모델 경로 변경과 정확도 영향

Jev의 기존 분류 질문 5개와 원인 질문 2개를 같은 `/v1/systemone` 요청에 넣는다. `JevDecision`의 기존 필드를 유지하고 `answers` 안에 통합 응답·실행 메타데이터를 저장한다. Diagnosis A2A는 저장된 cause/support를 기존 파서로 검증하여 재사용한다. 새 통합 응답에 원인 필드가 없거나 확률이 잘못되면 추가 호출이나 Mock 성공으로 숨기지 않고 원인 검토 대상으로 처리한다. 이전에 저장된 비통합 결정은 기존 별도 원인 호출 경로를 사용할 수 있다.

분류와 원인의 질문·criteria·0.65 임계값·UNKNOWN·EvidencePolicy 및 검토 fingerprint를 유지했다. 단일 요청으로 합쳤으므로 통계적으로 독립된 두 번의 추론이라고 표현하지 않는다. `JEV_COMBINED_ANALYSIS=false`로 격리된 paired 비교가 가능하다. 모델 서버 내부의 질문 처리 방식에 따라 실제 추론 시간 절감폭은 달라질 수 있다.

Hermes 입력은 전체 승인 후보 ID와 순서를 유지하면서 필요한 필드만 남기고 긴 본문을 축약했다. 검색 결과의 전체 원문과 승인 ID 검증은 그대로다. 유사 장애 조회의 중복 실행을 제거했고, 상태 조회는 외부 호출 없이 마지막 검사값을 표시한다. 실제 검색·워밍업에서는 `/toolsets`의 도구 비활성화를 매번 확인한다. 일반 응답 최대 900토큰은 유지한다.

긴 승인 지식 20개 합성 fixture에서 문맥은 **242,394 → 13,626자(94.38% 감소)**였다. [입력 크기 증적](evidence/hermes-context-size.json)에 후보 ID 보존과 실제 모델 호출 0회를 기록했다. 이는 해당 fixture의 문자 수이며 실제 토큰 수나 일반 운영 절감률이 아니다.

**실제 AI 정확도 변화는 미측정이다.** 이 작업 환경에는 검증용 모델 주소/인증 설정이 없었다. 단일 요청이 응답에 미칠 영향, 축약된 긴 지식 뒤쪽의 근거 손실은 실제 모델로 확인해야 한다. 기존 계약 테스트 통과만으로 정확도 불변을 주장하지 않는다. 같은 버전의 `evaluation_cases`와 모델/승인 지식 snapshot을 고정해 전후 분류·원인·검색 관련성을 비교하는 절차는 [운영·검증 문서](analysis-performance-operations.md)에 기록했다. 기존 50개 scenarios는 모델 성능 근거로 사용하지 않았다.

## 워밍업과 화면

`/api/admin/models/warmup`은 개인 ADMIN/초기 관리자 전용이다. GET은 무호출이며, POST의 `mode=REAL` 및 `performInference=true`일 때만 최대 1회 추론한다. 호출 시도와 실제 응답 확인을 분리하고, 요율 미설정 시 예상 비용을 ‘알 수 없음’으로 표시한다. 대상별 DB 예약·단일 동시 실행·기본 60초 간격·시간당 4회 제한은 재시작 후에도 유지된다. 실패도 한도를 소비한다. DEMO/미확인 요청·USER/로그인 없는 시연 관리자에게 실제 모델을 호출시키지 않는다.

분석 화면은 병렬 실행 단계, 단계별 경과 시간, 완료·중단 상태와 REAL AI/DEMO Mock/MOCK_FALLBACK을 표시한다. SSE 이벤트는 즉시 병합하고 서버 상세 결과도 갱신하며, 연결 실패 시 실행 중 장애는 2초 간격으로 조회한다. A2A 내부 시간은 별도 펼침 영역에 표시해 상위 시간과 중복됨을 알린다.

## 검증

- 백엔드 전체 `mvnw.cmd -q test`: 총 107개, 성공 105개, 실패/오류 0개, 조건부 제외 2개. 제외는 명시 실행용 성능 벤치마크와 Python bridge 환경변수 미설정 테스트다. 벤치마크는 별도 실행해 전/후 모두 성공했다.
- 승인→MCP 가상 복구→검증→보고서/Skill 저장, 승인 거부, 분류/원인 검토 분리, A2A 중복 요청, 중단 후 늦은 결과, 큐 재개/임대 및 계정 권한 기존 회귀 테스트를 통과했다.
- 추가 검증: 4 Agent가 결과를 기다리기 전에 모두 시작함, 자식 임대 전달, HTTP 시 DB 트랜잭션 없음, 완료 체크포인트 재사용, 임대 만료 후 결과 차단, 큐 재개와 중단의 잠금 경합, 미제공 시간 null, 통합 Jev 단일 요청/불완전 원인 검토, 승인 ID 보존, 워밍업 권한·한도·동시성·실패 집계.
- 프런트엔드 프로덕션 build 및 TypeScript 검사 성공, 단위 테스트 37/37개 성공. Playwright 3/3개 성공: 병렬 단계 경과 시간 및 SSE 즉시 완료 반영/오래된 snapshot 병합, 워밍업 명시적 호출·비용 미확인·최신 결과 갱신, 정상 SSE 연결 시 불필요한 polling 방지.
- 실제 PostgreSQL·Neo4j·Docker 및 클라우드 시연 배포는 이번 환경에서 실행하지 않았다. H2 검증과 구분한다.

## 변경 파일

| 범위 | 파일 |
|---|---|
| 실행·임대·통신 | `Harness.java`, `DurableQueue.java`, `AgentController.java`, `RpcClient.java` |
| 측정·API·DB | `PerformanceTrace.java`, `ApiController.java`, `V12__analysis_stage_metrics.sql` |
| Jev/원인 | `JevHttpClient.java`, `JevRouter.java`, `JevDecision.java`, `DiagnosisEngine.java`, `EvidencePolicy.java`(주석) |
| 승인 지식·Hermes | `KnowledgeCases.java`, `KnowledgeEngine.java`, `HermesContext.java`, `HttpHermesAdapter.java` |
| 관리자 워밍업 | `ModelWarmup.java`, `ModelWarmupController.java`, `V13__model_warmup.sql` |
| 기본 설정 | `application.yml`, `compose.yaml`, `.env.example` |
| 백엔드 검증 | `JevProviderTest.java`, `HermesProviderTest.java`, `ModelWarmupTest.java`, `ModelWarmupSecurityTest.java`, `PerformanceIntegrationTest.java`, `AnalysisLatencyBenchmarkTest.java` |
| 화면 | `frontend/app/page.tsx`, `frontend/app/workflow.css`, `frontend/components/incident-workflow.tsx`, `frontend/components/technology-guide.tsx`, `frontend/components/analysis-performance.tsx`, `frontend/components/model-warmup.tsx`, `frontend/lib/analysis-performance.mjs`, `frontend/lib/incident-guide.mjs` |
| 화면 검증 | `frontend/test-unit/analysis-performance.test.mjs`, `frontend/tests/usability.spec.ts` |
| 재현·증적 | `scripts/compare_analysis_benchmarks.py`, 계획/운영/결과 문서, `docs/evidence/analysis-performance-*.json`, `docs/evidence/hermes-context-size.json` |

DB 변경은 새 계측 표와 워밍업 제한 표를 추가하는 migration이며 기존 장애 결과를 일괄 갱신하지 않는다. 배포 시에는 기존 `STEP_MS=500` 환경변수도 0으로 바꿔야 한다.
