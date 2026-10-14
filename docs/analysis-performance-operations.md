# 분석 성능 측정 및 모델 워밍업 운영

모든 관측·시스템·담당자·장애 데이터는 가상이다. 이 문서는 개발/격리 검증 절차이며 운영 장애 데이터에 대한 실행 기록이 아니다. 실제 Jev/Hermes 호출 성능과 분석 정확도는 이번 로컬 검증에서 측정하지 않았다. Mock, 실패 후 fallback, 로컬 HTTP 계약 fixture를 실제 AI 결과로 취급하지 않는다.

## 관리자 워밍업

개인 ADMIN 또는 초기 설정 관리자만 `/api/admin/models/warmup`을 사용할 수 있다. USER 및 로그인 없는 DEMO_ADMIN 세션은 서버 필터와 서비스에서 차단한다. 워밍업은 장애를 생성하거나 복구하지 않는다.

`GET /api/admin/models/warmup`은 외부 요청 없이 다음 정보를 반환한다.

- `fictional: true`, `actualModelCall: false`, `modelCallAttempted: false`
- `targets`: `JEV_LOCAL`, `JEV_TYPESAFE`, `HERMES`별 설정 여부, 예상 비용, 제한, 남은 호출 횟수, 최근 결과
- `estimatedCostUsd: null`, `estimateKnown: false`이면 요금 정보를 설정하지 않은 상태다. 이를 무료 또는 0달러로 표시하면 안 된다.
- `remainingThisHour`, `inFlight`, `retryAfterMs`, `lastResult`는 DB에 저장된 예약/호출 이력으로 계산한다.

명시적인 모델 호출 요청 예시는 다음과 같다. 인증은 기존 개인 관리자 세션을 사용한다.

```json
{"target":"JEV_LOCAL","mode":"REAL","performInference":true}
```

`mode: "DEMO"`이거나 `performInference`가 없거나 false이면 외부 요청을 보내지 않고 `NOT_CALLED`와 예상 비용 0을 반환한다. REAL이라고 해도 모델 호출을 별도로 true로 지정해야 한다. GET 또는 화면 진입은 워밍업을 실행하지 않는다.

Jev는 선택한 provider를 직접 한 번 호출한다. router의 재시도나 Mock 대체를 이용하지 않는다. Hermes는 공식 `/v1/toolsets`의 도구 비활성화를 확인한 뒤 `/v1/chat/completions`에 최대 출력 24토큰의 readiness 요청을 한 번 보낸다. Hermes endpoint 설정은 기존처럼 `/v1`을 포함한다. 도구 검사 실패 시 추론 요청을 보내지 않는다. 전용 HERMES_HOME·빈 api_server toolset 및 기존 키 분리 정책을 유지한다.

결과의 의미는 다음과 같다.

| 필드 | 의미 |
|---|---|
| `modelCallAttempted` | 추론 요청 경로를 실행했다. 연결 실패만으로 서버 추론 실행을 증명하지 않는다. |
| `actualModelCall` | 실제 provider 응답을 받았다. 통신 실패나 Mock을 true로 표시하지 않는다. |
| `modelReady` | Jev의 유효한 스키마 또는 Hermes의 `{"ready":true}` 응답을 확인했다. |
| `status` | `READY`, `FAILED`, `NOT_CALLED`, `BLOCKED` |
| `accuracyMeasured` | 실행된 워밍업에서 false. 준비 확인은 장애 분석 정확도 평가가 아니다. |
| `estimatedCostUsd` | 운영자가 설정한 1회 호출 예상 비용. 실제 청구 금액이 아니다. |
| `usage` | Hermes가 제공한 경우 실제 응답의 토큰 usage. 예상 토큰과 구별한다. |

Spring 설정값은 다음과 같다. 배포 환경의 Spring 설정이나 JVM `-D` 시스템 속성으로 지정할 수 있다. 비밀 값은 이 설정에 포함하지 않는다.

| 속성 | 기본값 / 제약 |
|---|---|
| `brain.warmup.cooldown-seconds` | 60초, 최소 30초 |
| `brain.warmup.max-per-hour` | 대상별 4회, 1~6회로 제한 |
| `brain.warmup.local-estimated-usd` | -1 = 알 수 없음 |
| `brain.warmup.typesafe-estimated-usd` | -1 = 알 수 없음 |
| `brain.warmup.hermes-estimated-usd` | -1 = 알 수 없음 |

`model_warmup_limits` 행을 `FOR UPDATE`로 잠그고 예약/START 감사 기록을 커밋한 뒤 HTTP를 실행한다. 성공과 실패 모두 한도를 소비한다. 대상별 진행 중인 호출은 하나만 허용한다. 호출 종료 시 같은 예약 토큰을 대조해 결과와 FINISH 감사 기록을 저장한다. 프로세스 재시작 시에도 쿨다운과 시간 창의 사용량은 유지된다. 비정상 종료로 남은 예약은 Jev/Hermes 최대 timeout + 30초가 지나야 만료되며, 만료가 시간당 횟수를 초기화하지 않는다. HTTP 중에는 DB 트랜잭션/행 잠금을 유지하지 않는다.

`GET /api/config`의 Hermes 상태도 외부 요청을 발생시키지 않는다. `cached: true`와 `observedAt`은 마지막 검사 시각이며 실시간 연결 보증이 아니다. 아직 검사하지 않았으면 `NOT_PROBED`다. 정상 지식 검색과 명시적 워밍업에서는 매번 새 `/toolsets` 검사를 수행한다.

## 승인 지식 프롬프트 축약

`KnowledgeCases.search`가 계산한 유사 장애를 재사용해 같은 1,000건 후보 조회/정렬을 중복 실행하지 않는다. 실제 Hermes 입력에는 허용한 필드만 보낸다. provenance JSON, 게시 상태, 감사용 메타데이터 등을 반복 전송하지 않는다.

기존 검색이 반환한 최대 20개 Skill 후보의 ID와 순서를 모두 유지한다. 검색 후보 수를 추가로 줄이지 않는다. 승인 DB 레코드와 반환 ID를 대조하는 기존 검증 및 UI/API에 돌려주는 전체 승인 레코드는 유지한다. 수동·AI 지식 모두 기존 APPROVED 필터를 통과해야 한다. 정적 매뉴얼의 `procedure_text`도 전송한다.

프롬프트에서 긴 내용만 Unicode 코드 포인트 기준으로 축약하고 `[truncated]`를 표시한다.

| 데이터 | 주요 필드별 상한 |
|---|---|
| Skill | title 200, conditions/symptoms 500, checks/cautions 400, solution 600 |
| 매뉴얼 | title 200, procedure_text 900 |
| 유사 장애 | title 200, observations 500, notes 600, prevention 400 |

일반 검색/초안 생성의 최대 출력 900토큰은 유지한다. `promptContext.originalCharacters`, `compactCharacters`는 직렬화한 문맥의 문자 수다. `estimatedInputTokens`는 문자 수를 2로 나눈 문맥 크기 추정값이며 tokenizer 또는 청구 토큰 수가 아니다. system prompt와 API envelope는 이 수치에 포함되지 않는다. 실제 토큰 사용량은 provider의 `usage`를 별도로 확인한다.

`HermesProviderTest`의 긴 승인 지식 fixture는 전체 후보 ID와 선택된 원문을 보존하면서 문맥을 원래 크기의 25% 미만으로 줄이는지 검사하고 `backend/target/hermes-context-size.json`을 생성한다. 이 값은 해당 합성 fixture의 문자 수 비교다. 일반 장애의 절감률·토큰 절감률·실제 AI 지연 개선률로 일반화하지 않는다.

2026-10-15 로컬 계약 검사에서 승인 Skill 20개(각 solution 2,000자, provenance 10,000자) 문맥은 242,394 → 13,626 UTF-16 코드단위로 감소했다(94.38%). 후보 ID 20개를 모두 유지했고 반환된 선택 Skill의 원문 solution은 2,000자 그대로였다. 실제 모델 호출은 0회다. 문맥 토큰 추정 6,813은 위 문자 기반 추정식의 결과이며 실제 입력 토큰 측정값이 아니다.

긴 문서 뒤쪽의 관련 정보가 축약될 수 있으므로 실제 Hermes 관련성/정확도가 동일하다고 단정할 수 없다. 승인/ID/스키마 통제 회귀 검사와 실제 모델 정확도 평가는 별개다.

## 격리된 성능 재현

Mock/fallback 벤치마크는 운영 URL이나 DB를 받지 않는 `AnalysisLatencyBenchmarkTest`를 사용한다. H2 메모리 DB, 비활성 Neo4j, loopback 실패 endpoint로 고정되어 있으며 모델을 호출하지 않는다. backend 디렉터리에서 실행한다.

```powershell
.\mvnw.cmd -q '-Dtest=AnalysisLatencyBenchmarkTest' '-DperformanceBenchmark=true' '-DbenchmarkLabel=optimized' '-DbenchmarkRepetitions=12' test
```

결과는 `target/analysis-benchmark.json`이다. 등록 요청 직전부터 `WAITING_APPROVAL` 도달까지 측정하므로 DB 큐 대기를 포함하며, 사람 승인 대기·복구 실행 시간은 포함하지 않는다. 각 반복 종료 후 격리 장애를 거부해 다음 실행을 준비한다. DEMO_MOCK과 MOCK_FALLBACK을 따로 집계하고 실제 호출이 없으면 REAL_AI count는 0으로 기록한다. P95는 nearest-rank를 사용한다. 이전 revision의 기준 측정 결과와 합쳐 해석할 때 시나리오, 반복 횟수, 장비 및 DB 조건을 동일하게 유지한다.

실제 AI 비교는 이 loopback 전용 테스트의 결과를 재분류해서 만들 수 없다. 다음 별도 검증 환경이 필요하다.

1. 기준 revision과 개선 revision에 각각 폐기 가능한 전용 PostgreSQL DB/schema 및 Neo4j 영역을 연결한다. 운영 DB dump/운영 장애 ID/운영 토큰을 재사용하지 않는다. 배포가 필요한 경우 검증 전용 endpoint를 사용한다.
2. 같은 Jev/Hermes 모델 버전·서버 자원·모델 옵션·승인 지식 snapshot을 고정하고 시작 전 모델 상태, warm/cold 조건, 비용 추정값을 기록한다. 워밍업 시간은 장애 분석 시간과 별도로 저장한다.
3. 양쪽에서 동일한 가상 관측과 자산으로 `/api/incidents`에 REAL 요청을 최소 10회씩 보낸다. 매회 단조 시계로 POST 시작부터 완료 상태까지 시간을 재고 `/api/incidents/{id}`의 성능 단계/이벤트/실제 provider를 보관한다. 승인 대기를 종료하려면 측정 후 격리 장애에 거부를 기록한다.
4. `NEEDS_REVIEW`, schema 오류, timeout, fallback을 버리지 않는다. 완주 시간과 검토 중단 시간을 별도 표로 보고한다. Jev 또는 Hermes 중 하나라도 fallback이면 순수 REAL_AI 완주 집계에 넣지 않고 혼합/fallback 결과와 단계별 출처를 기록한다. 처음부터 DEMO였던 결과도 분리한다.
5. 각 집계의 표본 수, 평균, 중앙값, nearest-rank P95, 실패/보류/재시도 수를 산출한다. 각 stage의 HTTP 왕복 시간은 모델 추론+서버/네트워크 대기가 섞인 값이다. `Server-Timing: inference;dur=...`를 provider가 제공할 때만 모델 추론 시간을 채운다. 순수 네트워크 대기는 분리 측정할 수 없어 null이다. 겹치는 A2A/내부 단계 시간을 합산해 전체 시간으로 만들지 않는다.

## 실제 AI 정확도 확인

격리 환경의 `/api/evaluations`에서 `{"mode":"REAL","provider":"LOCAL"}` 또는 설정된 TYPESAFE를 실행한다. 기존 50개 scenarios는 시연 회귀용이며 모델 성능 근거로 사용하지 않는다. `evaluation_cases`의 같은 `datasetVersion`을 두 revision에서 사용하고 정답 열은 모델 입력에 넣지 않는다.

실제 모델 성공 호출의 `actualAiCount`/`actualAiPassed`, 오류, fallback, 검토 보류, 문자 접수 제외/정상 판단, Mock 기준선을 구분한다. 전체 점수에 Mock 성공을 더해 실제 AI 정확도로 보고하지 않는다. 기존 자동 평가는 분류 중심이므로 통합 원인 후보 및 Hermes 지식 관련성에는 별도의 버전 고정 검증 사례와 정답/승인 지식 ID 대조가 필요하다. 원인 후보를 확정 근본 원인으로 평가하거나 표시하지 않는다.

현재 로컬 검증으로 입증하는 것은 계약/검증 정책 보존과 Mock/fallback 처리 속도다. 실제 AI 정확도 변화와 실제 모델 전체 지연의 개선폭은 위 실제 모델 검증 전까지 미측정이다.
