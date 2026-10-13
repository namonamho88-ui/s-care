# S-CARE 통합 고도화 구현·배포 검토 보고서

검토일: 2026-10-13. 기준 커밋: a7cbaaea8ea103f5579170d54aec9055157a9332.

**로컬 구현·검증 결과입니다. GitHub push, Vercel/Railway 운영 배포, Supabase 운영 마이그레이션은 수행하지 않았습니다.** 운영 데이터와 진행 중인 장애는 변경하지 않았습니다.

## 1. 구현한 기능과 사용 방법

| 기능 | 구현 및 진입 위치 |
|---|---|
| 로그인 없는 시연 | 기본 false. 허용된 시연 환경·접속 IP·기간에만 자동 세션 발급, 상단 시연 배지. 계정 관리 → 로그인 없는 시연 접속에서 실제 관리자가 종료/재활성화 |
| 수동 지식 등록 | 해결 지식 → 지식 직접 등록 → 임시 저장 → 승인 요청 → 관리자 승인/거부. 서버 등록자·일시, 출처, 수정 전후 이력 유지 |
| 장애 영향도 | 장애 상세 2단계에 저장된 영향도·그래프, 3단계에 승인 전 요약. 확대/축소, 직접/전체, 영향 자산 필터, 전체화면, 노드 상세 |
| 지식·자산 연결 | 그래프 노드의 승인 지식·과거 장애·매뉴얼 조회. 장애 상세 관련 지식 검색. 유형/자산/시스템/유사 이력 규칙별 추천 이유 |

기존 메뉴, 6단계, 모바일 레이아웃, 문자 접수, 강제 종료·논리 삭제, 보고서 기능을 유지했습니다. 화면 내 사용자/관리자 매뉴얼과 다운로드도 갱신했습니다.

## 2. API

브라우저는 기존 Next.js BFF를 경유합니다. 다음 경로의 업무 API는 Spring Boot에 있습니다.

| 메서드·경로 | 역할 |
|---|---|
| POST /api/session, mode=demo | BFF가 서버 발급 토큰을 HttpOnly 시연 쿠키로 교환. 응답 JSON에는 토큰 없음 |
| POST /api/demo/session | 시연 백엔드 전용 발급. 게이트웨이 키·허용 Origin 필수, 일반 BFF 경로에서는 직접 프록시 금지 |
| GET/POST /api/demo-control | BFF에서 기존 ADMIN 신원 검증 후 별도 제어 키로 시연 설정 호출 |
| GET/POST /api/demo/control | 시연 백엔드 제어 키 전용. enabled boolean, 관리자 actor 기록 |
| POST /api/skills | MANUAL_ENTRY/DRAFT 생성. 등록자·시간·출처 서버 결정 |
| PATCH /api/skills/{id} | 기존 경로 확장: 본인 수동 초안 편집, 버전 충돌 검사 및 전후 이력 |
| POST /api/skills/{id}/submit | 본인 초안/관리자 승인 요청. revision 필수 |
| POST /api/skills/{id}/review | 기존 경로 확장: PENDING 수동 지식과 기존 AI/시드 초안 승인/거부 |
| GET /api/assets/{id}/context | 구성요소·관계·승인 지식·최근 장애 20건·유형 집계·매뉴얼 |
| GET /api/incidents/{id}/knowledge | 승인된 지식 최대 20건, 명시적 규칙 점수·이유 |

기존 /api/skills 목록과 revisions는 일반 사용자에게 승인 지식/본인 초안 및 허용된 수정 이력만 반환합니다.

## 3. 데이터베이스 변경

Flyway **V11__demo_access_and_manual_knowledge.sql**:

- skills: source_kind, symptoms, created_by, submitted_at 추가.
- skill_assets: 기존 VARCHAR(40) PK 타입에 맞는 skill_id/asset_id 외래키와 복합 PK, 자산 검색 인덱스.
- 기존 장애 기반 Skill의 자산 관계를 보충. 기존 자체 시드 지식은 IMPORTED 출처로 구분. 기존 승인 상태·승인 이력·장애 상태 보존.
- demo_access_settings: 활성 상태와 세션 epoch.
- demo_sessions: 원문 대신 SHA-256 토큰 해시, 행위자, epoch, 만료 시각.
- 기존 impact_json에 direct/indirect/systems/analyzedAt를 추가 저장. 이전 JSON은 수정하지 않으며 미기록 항목을 구별해서 표시.

시연은 전용 Railway 서비스 + Supabase brain_demo_* 스키마/전용 역할을 사용합니다. 기존 계정 서비스는 기존 DB 경로를 유지합니다. 기존 DB 초기화/테이블 삭제는 없습니다. 배포 시 기존 백엔드 V11 적용과 새 시연 스키마 초기 마이그레이션이 필요합니다. 새 시연 스키마에는 별도의 가상 시드가 들어갑니다.

## 4. 보안 영향

- 인증 필터를 제거하지 않았습니다. DEMO_ADMIN은 업무 API 허용 목록만 사용합니다. 계정 생성/삭제/비밀번호·외부 Skill 게시·A2A/MCP 직접 호출·시연 설정 관리 차단.
- 시연 발급/매 요청은 서버 간 게이트웨이 키와 Origin을 검사. Vercel BFF는 지정 공인 IP와 기간을 추가 검사. 임의 프록시 구성은 지원하지 않으며 기본 차단.
- 관리자 토큰·모델 API 키·시연 원문 토큰을 브라우저 JSON에 전달하지 않습니다. HttpOnly/SameSite=Strict 쿠키, Vercel Secure 쿠키.
- 관리자 비활성화 시 epoch 증가와 세션 삭제. 서버는 즉시 거부하고 화면은 다음 요청 또는 최대 5초 내 확인에서 로그인으로 전환. 숨긴 탭은 복귀 시 확인.
- env false/만료 시 관리자 화면으로 재활성화 불가. 시연 세션은 최대 1시간이고 전체 시연 종료 시각을 넘지 않음.
- 시연 실행 전 전용 DB 사용자·스키마, 별도 Neo4j Demo_* 라벨, 외부 Hermes 파일 게시 비활성 설정을 검사. Supabase 풀러의 role.projectref 사용자 이름도 지원.
- REAL 모드에서는 실제 모델 API 사용 비용이 발생할 수 있음. 접속 허용과 AI 모드는 독립적. MCP는 기존 가상 도구만 사용.
- 종료는 접근 폐기이며 이미 접수된 가상 작업의 취소·시연 데이터 삭제가 아님.

## 5. 기존 AI 기술 연동

Jev 분류/근거 검토 → Ontology 영향도 저장 → 기존 6개 A2A Agent → Knowledge Agent 승인 지식 검색 → Hermes 후보 선택 → Harness 승인 통제 → MCP 가상 복구/검증 → 보고서/이력 흐름을 유지했습니다.

Knowledge Agent는 유형 외 자산/시스템/유사 이력으로 승인 후보를 정렬합니다. Hermes가 반환한 ID는 여전히 승인된 DB 후보와 대조합니다. 미승인 지식은 전달하지 않습니다. 규칙 점수는 유형 40 + 자산 35 + 시스템 20 + 유사 이력 5이며 AI 확률이 아닙니다.

시연 환경의 외부 SKILL.md 게시만 차단합니다. 시연 DB에 승인 저장한 지식은 REAL Hermes 검색의 문맥 후보로 전달할 수 있습니다. 실제 계정 환경의 기존 게시 경로는 유지합니다.

## 6. 검증

| 검증 | 결과 |
|---|---|
| H2 전체 백엔드 회귀 | 78개 중 77 통과, 선택적 원격 Skill bridge 1개 생략 |
| 최종 DemoAccessTest | 3/3 통과: 세션·권한·기간·폐기·가상 전체 처리·설정 거부·Supabase 역할 이름 |
| 실제 PostgreSQL + Neo4j 전체 백엔드 | 79개 중 78 통과, 선택적 원격 Skill bridge 1개 생략. 실패/오류 0 |
| Next.js 운영 빌드 | 성공 |
| Playwright UI | 49/49 통과, 모바일·전체화면·미완료 영향도·수동 지식·세션 폐기·기존 회귀 |
| 프론트엔드 단위 | 33/33 통과 |
| 실제 BFF ↔ 두 Spring Boot 서버 ↔ PostgreSQL | 쿠키 비노출/HttpOnly, 별도 라우팅, 계정 차단, 관리자가 종료한 세션 차단, 재활성화 후 구 세션 차단 통과 |
| 로컬 실제 화면 | 자동 시연 접속과 수동 지식 등록 폼 브라우저 렌더링 확인 |
| 매뉴얼 생성 일치·비밀값 검사 | 통과 |

테스트는 새 이름의 로컬 PostgreSQL DB와 별도 그래프 라벨을 사용했습니다. 기존 환경을 초기화하지 않았습니다. PostgreSQL 보호 마커 상태 유지, 전용 역할의 다른 스키마 조회 거부, demo 저장 impact의 NEO4J 엔진을 확인했습니다.

재현: backend ./mvnw test; 실제 DB는 TEST_DB_URL/USER/PASSWORD, TEST_DEMO_DB_URL/USER/PASSWORD와 TEST_NEO4J_URI, TEST_GRAPH_NAMESPACE를 별도 테스트 환경으로 지정. TEST_DEMO_DB_USER는 brain_demo_* 전용 역할, brain_demo_test 스키마 소유 권한만 필요합니다. PostgreSQL 테스트 마커는 production_marker.incidents(id,status)에 DO-NOT-CHANGE/ANALYZING 가상 행을 다른 역할로 사전 생성합니다. 기존 DB 대신 매번 새 테스트 DB를 사용하세요.

프론트: npm run build, npm run test:unit, npm run test:ui, npm run manuals:check. 실제 BFF 검증은 로컬 두 백엔드와 별도 스키마를 실행한 뒤 TEST_BFF_URL 및 TEST_ACCOUNT_ADMIN_TOKEN을 서버 환경에 지정하여 node test-integration/demo-session.mjs 실행. 테스트 토큰을 채팅/저장소에 넣지 않습니다.

## 7. 미검증·배포 전 필요 사항

- 이번 변경의 실제 Vercel·Railway·Supabase 배포는 미실행. 새 Railway 서비스 및 Supabase 역할/스키마 생성도 승인 전 미실행.
- 실제 Jev/Hermes 클라우드 모델 호출은 이번 회귀에서 재실행하지 않았습니다. 기존 Provider 계약/오류 처리 테스트와 Mock 기반 전체 흐름을 검증했습니다. 배포 후 승인된 가상 사례로 REAL 리허설이 필요합니다.
- 선택적 원격 Skill bridge 테스트 1개는 서버 미지정으로 생략. Docker Compose 실행은 이번 검증 범위에 포함하지 않았습니다.
- 시연 접속 허용 공인 IP, 종료 시각, 사용할 도메인, 새 서비스 자원/비용을 확정해야 합니다. DB 역할은 운영 스키마 접근 권한이 없어야 합니다.
- 운영 배포는 별도 승인 후 진행합니다. 백업·V11 적용 → 기존 백엔드 업데이트 → 격리된 시연 서비스 → Vercel BFF/화면 → 허용 IP에서 로그인/시연/종료 리허설 순서입니다. 기존 장애는 그대로 두고 명시적인 테스트 기록만 생성합니다.

## 8. 변경 파일

- `.env.example`
- `.env.local.example`
- `AGENTS.md`
- `README.md`
- `backend/src/main/java/demo/brain/Access.java`
- `backend/src/main/java/demo/brain/AccountController.java`
- `backend/src/main/java/demo/brain/ApiController.java`
- `backend/src/main/java/demo/brain/DemoAccess.java`
- `backend/src/main/java/demo/brain/DemoController.java`
- `backend/src/main/java/demo/brain/DemoIsolation.java`
- `backend/src/main/java/demo/brain/KnowledgeCases.java`
- `backend/src/main/java/demo/brain/KnowledgeCasesController.java`
- `backend/src/main/java/demo/brain/KnowledgeEngine.java`
- `backend/src/main/java/demo/brain/LocalSkillStore.java`
- `backend/src/main/java/demo/brain/Ontology.java`
- `backend/src/main/java/demo/brain/OperationsController.java`
- `backend/src/main/java/demo/brain/SecurityFilter.java`
- `backend/src/main/resources/application.yml`
- `backend/src/main/resources/db/migration/V11__demo_access_and_manual_knowledge.sql`
- `backend/src/test/java/demo/brain/BrainIntegrationTest.java`
- `backend/src/test/java/demo/brain/DemoAccessTest.java`
- `backend/src/test/java/demo/brain/HermesProviderTest.java`
- `deploy/demo-backend.env.example`
- `deploy/demo-vercel.env.example`
- `deploy/railway/backend.env.example`
- `deploy/vercel.env.example`
- `docs/ADMIN_MANUAL.md`
- `docs/DEMO_ACCESS_SETUP.md`
- `docs/INTEGRATED_UPGRADE.md`
- `docs/USER_MANUAL.md`
- `frontend/app/api/[...path]/route.ts`
- `frontend/app/api/demo-control/route.ts`
- `frontend/app/api/session/route.ts`
- `frontend/app/globals.css`
- `frontend/app/page.tsx`
- `frontend/components/asset-context.tsx`
- `frontend/components/demo-settings.tsx`
- `frontend/components/impact-graph.tsx`
- `frontend/components/incident-impact.tsx`
- `frontend/components/incident-workflow.tsx`
- `frontend/components/manual-knowledge.tsx`
- `frontend/components/skill-editor.tsx`
- `frontend/content/manuals.json`
- `frontend/lib/dashboard-queue.mjs`
- `frontend/lib/demo-access.mjs`
- `frontend/public/manuals/admin.html`
- `frontend/public/manuals/user.html`
- `frontend/test-integration/demo-session.mjs`
- `frontend/test-unit/demo-access.test.mjs`
- `frontend/tests/usability.spec.ts`
- `docs/INTEGRATED_UPGRADE_REPORT.md` (이 보고서)
