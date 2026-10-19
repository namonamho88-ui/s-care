# S-CARE 2.0 — AI Digital Twin & Chaos Lab

## 범위와 사전 분석 (2026-10-19)

분석 기준: 기존 main `04a4537`. 기존 업무 화면, 인증, 승인, 실제 Provider 경로를 유지하고 독립 메뉴와 DB 테이블을 추가했다. 이 기능은 **Synthetic Data 기반 시뮬레이션 모델**이다. 실제 금융 시스템을 복제하거나 실제 서버에 장애 명령을 실행하지 않는다.

| 기술/영역 | 기존 상태 | 확인한 구현 근거와 한계 | Lab 적용 |
|---|---|---|---|
| 프런트엔드 | 구현 완료 | `frontend/package.json`: Next.js 16.4, React 19.3, TypeScript, Tailwind, shadcn 버튼 | 동일 앱의 독립 `TwinLab` 메뉴 |
| 백엔드 | 구현 완료 | `backend/pom.xml`: Java 17+, Spring Boot 3.5.7, JDBC | 순수 Java 계산 엔진 + REST 서비스 |
| DB/API | 구현 완료 | Flyway V1~V13, `Store`, `ApiController`, Next BFF | V14 `twin_runs`, `twin_evaluations`; 기존 데이터와 분리 |
| 장애 분석 | 구현 완료 | `JevRouter`, `DiagnosisEngine`, `KnowledgeEngine`; DEMO/REAL/fallback 구분 | 노드 지표·관계만 모델에 전달, 평가 정답 제외 |
| 복구 검증 | 부분 구현 | `SimulatedTools`는 승인 뒤 고정 정상 지표를 적용하고 검증한다. 일반 목적의 트윈 엔진은 없었다. | 의존성·용량·승격 조건을 실제 계산하는 `TwinEngine` 신설 |
| Multi-Agent/A2A | 구현 완료(제한 프로필) | `AgentController`: 6개 역할, 동기 JSON-RPC A2A 0.3.0; 스트리밍 A2A는 미지원 | Lab의 분석·전략 생성은 `TwinAgents`, 정책·시뮬레이션·평가는 결정적 역할. Lab을 새 A2A 네트워크 협상으로 표시하지 않는다. |
| MCP | 구현 완료(제한 프로필) | `McpController`, `RpcClient`: 인증된 stateless JSON-RPC; 기존 복구 allowlist | 상태·시나리오·독립 실행·결과 도구 4개 추가 |
| Ontology | 구현 완료 | `Ontology`: SQL 원본 관계, Neo4j 역방향 의존 탐색; fallback/미초기화 구분 | Lab은 `DEPENDS_ON`, `OPTIONAL`, `REPLICATES_TO` 타입을 가진 버전 고정 그래프를 엔진에서 평가. Lab 계산을 Neo4j 실행으로 표시하지 않는다. |
| Local Jev | 구현 완료 | `LocalJevProvider`, `JevHttpClient` → `/v1/systemone`; 기존 저장소의 클라우드 실행 증적 있음 | 원인·대상 typed choice. 현재 환경에서 새 Lab 실제 모델 호출 성공 여부는 실행 결과로 판단 |
| Hermes Agent | 구현 완료 | `HttpHermesAdapter`: `/v1/toolsets` 검사 후 `/v1/chat/completions`; 지식 검색·초안 생성 | `twin` 작업 추가, 3~5개 구조화 전략 생성, 허용 액션 검증. 외부 실행 도구는 계속 비활성화 |
| TypeSafe | 부분 구현 | `TypeSafeJevProvider`의 실제 유료 HTTP 경로·키 설정 있음. 설치만으로 호출 성공을 인정하지 않음 | Jev Provider 선택으로 재사용. 별도의 TypeSafe 정책 엔진이 존재한다고 가정하지 않음. 실행 안전성은 로컬 검증기가 책임짐 |
| Harness Engineering | 구현 완료 | `Harness`, `EvidencePolicy`, `DurableQueue`, 승인·감사·재시도·임대 구조 | Lab 버전 CAS, 상태 전이, 입력·모델 출력 검증, 승인 전 확정 금지, 독립 시뮬레이션, 실제 평가 기록 |
| 배포 | 구현 완료 | Vercel frontend, Railway backend/AI, Supabase PostgreSQL, Neo4j. `deploy/`, `compose.yaml`, `docs/DEPLOYMENT.md` | 추가 서비스·비밀키 없이 동일 환경 사용. V14 적용 필요 |
| 복구 토너먼트 | 확장 단계 | 기존 구현 없음 | 현재는 목표별 가중치 비교. 속도/안정성/데이터 보호 **독립 LLM 에이전트 토너먼트**는 별도 확장 |

공식 인터페이스 확인: [TypeSafe Quickstart](https://docs.typesafe.ai/introduction/quickstart), [Hermes API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/). Jev는 Choice/Score/Noul 판단을 반환한다. 자유 서술 복구 절차 생성이나 별도 정책 실행 API를 가정하지 않았다. Hermes 호출은 기존 도구 비활성화 검사를 유지한다.

## 구조와 상태

`TwinEngine`은 IO·현재 시각·DB에 의존하지 않는 계산 코드다. seed와 입력 스냅샷이 같으면 노드 지표와 전략 결과가 같다. 13개 노드와 호출/복제 관계를 만든다. 각 노드는 CPU, 메모리, 지연, 오류율, 가용성, 처리량, 복제 지연, 승격 가능 여부를 가진다.

호출 관계는 caller → dependency다. 일반 의존성의 가용성은 곱한다. Web/App 이중화 풀은 각 구성원의 가용 용량 합을 요구량과 비교한다. 한 Web이 실패해도 나머지 용량이 충분하면 상위 서비스가 유지된다. Redis/MQ는 선택적 의존성으로 장애 시 부분 기능 손실과 지연을 반영한다. 복제 관계는 서비스 호출 의존성과 구분한다.

```
NORMAL → FAULTED → ANALYZING → ANALYZED → GENERATING → PLANNED
       → COMPARED → WAITING_APPROVAL → APPROVED / REJECTED
```

비교 재실행·가중치 변경은 COMPARED에서 허용한다. 초기화는 새 버전을 만들어 진행 중인 이전 추론의 늦은 저장을 거부한다. 승인 대상은 저장된 전략 결과만 선택할 수 있다. 실패 전략은 승인할 수 없다. 부분 복구는 결과를 표시하고 담당자가 사유를 입력해 승인할 수 있다. 승인 전 전략 시뮬레이션은 복사본만 변경한다. 승인 후에도 변경 대상은 저장된 가상 스냅샷이다.

실험 문서는 PostgreSQL TEXT JSON에 모델 버전, seed, baseline/current/faultSnapshot, 모델 결과, 전략, 독립 결과, 단계별 스냅샷, 실행 이벤트, 승인 기록을 보존한다. `version`을 조건으로 갱신하며 충돌은 HTTP 409로 반환한다. 기존 incidents 테이블을 수정하지 않는다. 서버 재시작 시 미완료 추론은 재실행 가능한 상태로 되돌리고 중단 이벤트를 남긴다. 평가 작업은 INTERRUPTED로 구분한다.

## 계산 규칙과 제한

- 11가지 단일 장애 + 최대 5개 복합 장애. 강도 0.1~1, 지속 시간 10~3600 가상 초, 실제 대상 종류 검증.
- CPU/메모리 포화는 로컬 가용성을 낮추고 지연을 증가시킨다. 네트워크·API 지연은 지연 및 가용성에 반영된다. 트래픽 급증은 풀 요구량을 높인다.
- Replica 승격: 이전 Primary fencing, Replica 가용성 ≥99%, promotable, 복제 지연 ≤5초. 연결 전환은 같은 전략 내 승격 성공 뒤에만 가능하다.
- 강도 ≥0.8 Primary 장애는 지속 저장소 장애 가정으로 재시작이 실패한다. 영구 복구 성공을 하드코딩하지 않는다.
- 읽기 전용은 쓰기 비중 30%를 차단하므로 최대 서비스 가용성이 70%다. 이를 완전 복구로 표시하지 않는다.
- 전략 비교에서는 장애 만료 시각을 고정한다. 느린 전략이 자연 회복의 공을 가져가지 못한다. 별도의 가상 시간 진행 API는 실제 장애 만료를 계산한다.
- 장애 종료·상태 복원은 현재 가상 시간을 유지하면서 장애와 우회·읽기 전용·승격 설정을 해제한다. 초기화는 시간도 0으로 되돌린다. 감사·승인 이력은 보존한다.
- 복구 시간은 액션별 비용 합(재시작 35초, fencing 10초, 승격 20초, 전환 10초, 확대 25초, 기타 8초). 운영 실측값 아님.
- SUCCESS: 서비스 가용성 ≥99% 및 지연 <800ms. 그 외 가용성이 개선되면 PARTIAL, 아니면 FAILED.
- 잔여 위험 = min(100, 100−가용성 + 비정상 노드 수×3 + 거부 단계 수×10). 데이터 위험 = 성공 승격 시 복제 지연초×5. 확률이 아닌 명시적 규칙 점수다.
- 점수 가중치는 API catalog와 비교 화면에 공개한다. 실패 전략은 추천에서 제외한다. 모든 전략이 실패하면 추천 없음이다.

모델은 정적 부하·용량·쓰기 비중과 DAG 의존성을 가정한다. 실제 네트워크/DB/컨테이너를 구동하는 트윈, 실제 복제 로그·일관성 검사, 운영 SLA 예측기가 아니다. 운영 도입 시 실측 데이터 보정, 실제 토폴로지 버전 관리, 용량 실험, 모델 검증이 별도로 필요하다.

## 권한·AI·도구

일반 사용자는 본인 실행 기록 조회만 허용한다. 실험 생성/주입/실제 AI/평가/승인은 ADMIN 권한으로 검사한다. bootstrap 외의 세션은 기존 정책에 따라 MCP 접근이 금지된다. DEMO_ADMIN은 기존 격리 환경에서만 허용된다.

DEMO는 외부 AI를 호출하지 않는다. REAL은 Jev 분석과 Hermes 전략 생성을 실제 요청한다. 모델 실패·스키마 실패 시 RULE_FALLBACK으로 이유를 기록한다. AI가 내놓은 확률을 복구 성공률로 사용하지 않는다. 프롬프트에는 서버에서 만든 합성 관측만 보내며 모델 응답이 명령 실행 권한을 갖지 않는다. 허용 enum·노드 종류·필드 스키마 검증을 통과한 가상 액션만 실행한다.

Jev 결과에는 요청/실제 Provider, 모델, 응답 신뢰도, 실행 시간, 근거, 대체 이유를 보존한다. 유효한 저신뢰 응답은 규칙 성공으로 덮지 않고 `needsReview`로 표시한다. 누락·범위 밖 신뢰도는 스키마 오류다. 규칙 결과에는 신뢰도를 만들어 넣지 않는다. 모든 결과의 확정에는 담당자 승인이 필요하다.

`POST /mcp`에 추가된 도구:

| 이름 | 입력 | 동작 |
|---|---|---|
| twin_state | runId | 저장된 실험·현재 상태 읽기 |
| twin_scenarios | runId | 엔진 버전·노드·장애/액션 목록·가정 조회 |
| twin_simulate | runId | 저장된 전략을 동일 장애 복사본에서 계산; 현재 상태나 승인 변경 없음 |
| twin_results | runId | 저장된 비교 결과·승인·실행 로그 읽기 |

REST: `GET /api/twin/catalog`, `GET/POST /api/twin/runs`, `GET /api/twin/runs/{id}`, `POST /api/twin/runs/{id}/{inject|advance|stop|reset|analyze|strategies|simulate|recommend|request|decision}`, `GET .../{id}/report`, `GET/POST /api/twin/evaluations`. 변경 요청은 현재 `version` 필수. 보고서는 실제 저장 JSON 다운로드와 브라우저 인쇄/PDF 저장을 제공한다.

## 시연과 평가

새 메뉴에서 자동 데모를 실행하면 별도 실험을 생성한다. 정상→Primary 장애→분석→3개 전략→독립 계산→비교→승인 대기로 진행한다. 기본 연출은 약 95초이며 서버 응답 대기·사람 승인 시간은 별도다. 일시정지/재개, 단계 건너뛰기, 처음부터, 0.5~4배속을 제공한다. 승인 단계는 건너뛰기로 승인할 수 없다. 애니메이션 중지 및 prefers-reduced-motion을 지원한다. 복구 단계 재생은 계산된 스냅샷을 사용하며 재생 속도가 결과를 바꾸지 않는다.

합성 평가 데이터셋 `synthetic-twin-six-v1`은 Primary/Redis/CPU/메모리/MQ/네트워크 지연 6건이다. `TwinLab.executeEvaluation`의 버전 관리된 시나리오와 기대 정답을 사용한다. 정답·주입 타입은 모델과 규칙 원인 분석 입력에서 제외한다. 이 소규모 데이터셋은 회귀/시연용이며 일반 성능 근거가 아니다.

실제 AI 유효 응답 정확도, 전체 정확도, 대체 실행, 전략 적합성(가용성 개선/성공 기준), 시뮬레이션 성공률, 위험한 구조화 액션 제안 비율, 응답 스키마/통신 거부 수, 역할별 유효 응답, 실제 분석 지연을 분리한다. 외부 모델 미실행 시 AI 정확도·위험 제안 비율을 0%로 꾸미지 않고 미측정으로 표시한다. 평가 실행은 단일 백그라운드 작업이며 진행 결과를 DB에 저장한다.

## 검증과 배포

엔진 단위 테스트: 시드 재현, 입력 불변성, 11개 장애, 이중화, 만료, Primary 재시작 실패, 정상/비정상/지연 Replica, fencing 누락, 전략 격리, 잘못된 액션/대상 거부.

API 통합 테스트: H2 마이그레이션, 상태 전이, 명시적 승인, 이전 버전 거부, 반려 시 원본 유지, 실패 전략 승인 차단, MCP 복사본 실행, 실제 평가 결과 저장. 모델 계약 테스트: DEMO 무호출, 평가 정답 제외, 악성/알 수 없는 액션 거부, 잘못된 Jev 응답 대체.

### 실행 결과 (2026-10-19, 코드 `6b9154a`)

| 검증 | 결과 | 범위 |
|---|---|---|
| GitHub CI backend | 140건 중 139 통과, 1 조건부 제외, 실패 0 | H2, 기존 기능, 신규 엔진/계약/권한/API 테스트 |
| GitHub CI PostgreSQL·Neo4j | 140건 중 138 통과, 2 조건부 제외, 실패 0 | 실제 CI 컨테이너 DB, V14 및 Lab API 포함 |
| 프런트엔드 단위 | 56/56 통과 | BFF 및 기존 공통 동작 |
| 프런트엔드 UI | 68/68 통과 | 신규 Lab 3건 포함, 모의 API를 사용하는 브라우저 회귀 |
| 프런트엔드 빌드·매뉴얼 일치 검사 | 통과 | TypeScript·프로덕션 빌드 |
| 컨테이너 애플리케이션 | DEMO smoke·인증 BFF·계정/쿠키/권한 통과 | 기존 통합 흐름 보존 |
| Jev/Hermes 컨테이너 | 빌드·시작·Hermes 도구 차단 검사 통과 | 새 Lab 외부 모델 추론 성공 검증과는 구별 |

증거: [전체 테스트 CI](https://github.com/namonamho88-ui/s-care/actions/runs/39222304753), [컨테이너 CI](https://github.com/namonamho88-ui/s-care/actions/runs/39222304733). 조건부 제외는 별도 실측 벤치마크/환경 의존 검사다. 로컬 Windows 전체 테스트는 자원 부족으로 일부 실행이 중단됐고, 동일 코드의 독립 CI에서 전체 성공을 확인했다. 기존 후기 화면 클릭 시간 초과 1건은 로컬 단독 재실행 및 CI에서 통과했다. 신규 Lab 3건은 최종 빌드에서도 재검증했다.

대표 Primary 장애(seed 42) 계산: 재시작 FAILED/가용성 0%/35초, Replica 전환 SUCCESS/100%/73초, 읽기 전용 PARTIAL/70%/32초. 모두 규칙 추정치이며 운영 측정값이 아니다. Replica 동시 장애·복제 지연·fencing 누락은 실패 테스트로 확인했다. 모바일 캡처를 직접 확인해 그래프 아래 읽을 수 있는 노드 목록을 추가했고, 승인 없는 결과 확정을 차단하는 UI/API 테스트를 통과했다.

새 Lab의 **실제 외부 Jev/Hermes 응답과 운영 클라우드 시연은 미검증·미배포**다. 로컬 서버를 연결한 별도 수동 브라우저 리허설은 프런트엔드 시작 명령이 자동 승인 검토에서 차단되어 완료하지 않았다. 이를 완료된 검증으로 계산하지 않는다. 배포 후 관리자 계정/격리 DEMO 세션으로 자동 데모와 REAL 모드를 별도 리허설해야 한다.

기존 Vercel frontend / Railway backend 배포 구조를 유지한다. 적용 후 rollback은 구 버전 코드로 되돌릴 수 있으며 V14 신규 테이블의 데이터를 파괴하는 down migration은 제공하지 않는다.
