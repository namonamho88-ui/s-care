# 아키텍처 및 구현 계획

## 1. 서비스 구성
Next.js Command Center → same-origin BFF → Spring Boot REST/SSE → PostgreSQL.
PostgreSQL은 자산, 장애, 이벤트, Agent task, 감사, 승인, Skill, 보고서, 평가의 원본이다.
Neo4j는 자산/의존 관계의 투영이며 장애 노드에서 역방향 의존 탐색을 수행한다.
Harness는 명시적인 상태 전이와 업무별 Agent에 대한 HTTP A2A 호출을 통제한다.
6개 Agent는 한 JVM 내 별도 HTTP endpoint/Card로 배포한다. 분산 배포는 agent URL로 확장한다.
MCP에는 읽기와 가상 복구/검증 도구만 노출한다. 실 시스템 변경 권한은 없다.

## 2. Provider 경계
JevDecisionProvider ← MockJevProvider / LocalJevProvider / TypeSafeJevProvider.
새 접수 화면은 빠른 DEMO Mock이 기본이다. 실제 AI를 선택하면 기본 모델인 REAL/LOCAL은 localhost:8017/v1/systemone을 사용한다. TypeSafe는 공식 /v1/systemone과 Bearer API 키. 기존 REAL 장애의 모드·결과는 변경하지 않는다.
DEMO는 항상 Mock이다. LOCAL 연결/HTTP 오류는 최대 2회 시도 후 MOCK_FALLBACK으로 기록한다.
잘못된 모델 스키마나 낮은 confidence, 모호한 관측은 NEEDS_REVIEW로 멈춘다.
관리자는 분류/긴급도/담당 부서를 확인하거나 수정하고 이유를 남긴 후 분석을 재개한다.
TypeSafe 통신 실패는 FAILED이며 자동 모의 전환하지 않는다.
Jev의 choice/noul 응답은 설명문을 생성하지 않으므로 관측, 질문, 확률을 판단 증적으로 보존한다.
HermesAdapter는 HttpHermesAdapter(공식 Nous Hermes Agent)와 MockHermesAdapter를 분리한다.
KnowledgeEngine은 PostgreSQL의 승인 Skill·매뉴얼·유사 종료 이력을 문맥으로 제공하고 반환 ID를 승인 목록과 대조한다.
REAL에서는 로컬 Hermes API → OpenAI를 호출한다. DEMO는 외부 요청이 없고, REAL의 API/스키마/참조 검증 실패는 명시적인 MOCK_HERMES_FALLBACK이다.
Skill 초안의 네 필드와 Provider·사용량·소요 시간을 저장하며, 관리자 승인 후 HermesSkillPublisher가 전용 Hermes home에 SKILL.md를 원자적으로 게시한다.
서버 도달 여부, 실제 모델 응답 검증, Mock 실행, Skill 파일 게시를 별도 상태로 표시한다.
DiagnosisEngine은 같은 관측에 별도의 원인 후보/근거 질문을 실행한다. EvidencePolicy는 분류·원인·그래프 발생 지점·승인 지식을 대조한다.
담당자 확인은 검토한 원인 후보에 연결되며, 이전 분류 검토만으로 새 원인 후보의 불확실성을 면제하지 않는다.

## 3. 상태 전이와 내구성
REGISTERED → ANALYZING → NEEDS_REVIEW(선택) → ANALYZING → WAITING_APPROVAL
→ RECOVERING → RESOLVED → CLOSED. 승인 거부는 REJECTED, 오류는 FAILED.
Jev → Ontology → Incident/Diagnosis/Impact A2A → Knowledge A2A/Hermes → Harness → 승인
→ Recovery A2A → MCP 가상 조치/지표 검증 → Report A2A → Skill 초안/보고서/이력 원자 저장.
분석과 조치는 제한된 executor로 실행한다. 동시 활성 장애 최대 4개, 단계별 최대 2회 시도.
재시작 시 진행 중 실행은 FAILED로 표시하고 재시도 API로 재개한다. 승인 대기는 보존한다.
DB 이벤트를 SSE cursor와 Last-Event-ID로 재생한다. 클라이언트 타이머로 성공을 만들지 않는다.
승인 CAS, transaction, HTTP timeout, tool allowlist, 단계별 input/output와 audit를 적용한다.

## 4. 데이터와 집계
고정 seed 300, 기준일 2026-10-01. 12 systems / 40 components / 15 operators /
200 incidents / 30 manuals / 20 approved skills / 80 dependencies / 50 evaluation scenarios.
자산 관계는 FK로 검증한다. 과거 장애와 시나리오의 자산·유형·관측·담당자를 일치시킨다.
평가 정답은 별도 필드로 유지하며 provider에는 관측만 전달한다.
기간/유형/시스템 필터를 동일 집계 쿼리에 적용한다. MTTR은 복구 시각이 존재하는 장애만 계산한다.

## 5. 구현 단계와 수용 기준
1. 데이터베이스: Flyway schema와 고정 seed, FK/수량/재현성 테스트.
2. 백엔드: CRUD/승인/종료/SSE/집계/PDF/Excel과 실제 persistence 확인.
3. 프론트엔드: 관제, 그래프, 시연, Agent 작업, 지식 승인, 감사, 평가.
4. Agent: A2A Card/message/send/tasks/get/tasks/cancel, idempotency와 task 기록.
5. Jev: 인터페이스와 3 Provider, HTTP 계약/실패/저신뢰/대체 테스트, 실제 로컬 모델 호출.
6. Harness: 승인 우회·중복 방지, retry/timeout/재시작, 정답 비교, 전체 시연 테스트.
7. Docker Compose, README와 시연 가이드, 빌드/브라우저/실제 DB 검증 결과.

## 6. 배포 범위
로컬 사내 시연을 위한 관리자 토큰 인증. 외부 공개 서비스용 SSO/다중 테넌트/HA는 별도 범위.
Docker Compose는 PostgreSQL, Neo4j, backend, frontend를 시작한다.
`hermes` 프로필은 공식 Hermes 소스의 고정 commit과 전용 설정·지식 volume을 사용한다. OpenAI 키는 Hermes 컨테이너에만 주입한다.
jevos는 호스트 릴리스 또는 선택적 Linux 컨테이너에서 실행한다. 모델은 호스트 설치 폴더 또는 컨테이너 이미지의 /opt/jev에 설치한다.
Docker가 없는 개발 PC에서 PostgreSQL/Neo4j/jevos를 portable runtime으로 검증할 수 있다.
