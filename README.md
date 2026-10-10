# AI Incident Brain 3.0

금융 IT 운영관제 시연을 위한 실제 풀스택 애플리케이션입니다. **모든 자산·담당자·장애·관측값은 100% 가상 데이터**입니다. 실제 운영 시스템을 변경하는 도구는 없습니다.

## 최종 시연 배포 — Vercel · Supabase · Railway

GitHub 저장소 `namonamho88-ui/s-care`를 연결합니다. Vercel은 **Root Directory `frontend`**, Framework **Next.js**, Build **`npm run build`**, Install **`npm ci`**로 설정합니다. Railway backend의 공개 HTTPS 주소를 Vercel의 `BACKEND_URL`에 넣고 `COOKIE_SECURE=true`를 지정합니다. 화면만 먼저 배포할 수도 있지만 백엔드 연결 전에는 로그인·장애 시연이 동작하지 않습니다.

Supabase와 Railway의 서비스별 구성은 **[배포 가이드](docs/DEPLOYMENT.md)**와 `deploy/` 예제를 따릅니다. `.env`와 API 키는 GitHub에 올리지 않습니다.

**클라우드 시연: [s-care-mu.vercel.app](https://s-care-mu.vercel.app/)**. 2026-10-10 Vercel → Railway → Supabase에서 DEMO와 실제 Local Jev/Hermes 시연을 모두 장애 종료까지 검증했습니다. 실제 Jev 분류, Neo4j 영향 탐색, 여섯 A2A Agent, 담당자 검토·승인, 가상 복구, 보고서와 이력 저장이 동작합니다. 실제 모델 50건 평가는 47/50(94%), Mock 대체 0건입니다. [클라우드 검증 결과와 한계](docs/VALIDATION.md)를 확인하세요. Railway는 현재 Trial이며 최종 시연 전 요금제·자원 확인과 부하 리허설이 필요합니다.

## 개인 계정 시작하기

1. 최초 관리자는 로그인 화면 → **관리자 초기 설정** → 환경의 `ADMIN_TOKEN` 입력.
2. **계정 관리**에서 아이디(영문·숫자 등 3~60자), 가상 표시 이름, 역할, 가상 담당자를 선택해 초대 코드 발급.
3. 로그아웃 → **초대 활성화**에서 아이디·코드·새 비밀번호(12~128자) 입력. 이후 **개인 계정** 로그인 사용.
4. 일반 사용자는 장애 등록·조회와 현재 본인 담당 장애의 후기·예방 대책만 수정. 검토·승인·종료·평가·Skill 승인·계정 관리는 ADMIN 전용.
5. 비밀번호 분실은 관리자에게 초대 재발급 요청. 코드는 24시간/1회용이고 발급 시에만 표시. 이메일 자동 발송 없음. 재발급·비활성화·비밀번호 변경은 기존 개인 세션을 폐기.

추가 외부 인증 서비스나 환경변수는 필요하지 않습니다. Flyway V5가 기존 PostgreSQL `brain` 스키마에 계정/세션 테이블만 추가합니다. 기존 장애 기록은 보존합니다. 비밀번호는 salt를 포함한 PBKDF2-HMAC-SHA256 600,000회, 개인 세션·초대는 256비트 난수/DB 해시 저장, 세션 유효기간 8시간입니다. 로그인 5회 실패 시 15분 잠금, 단일 backend의 인증 요청 120회/분 상한을 적용합니다. [설계·권한 범위](docs/ACCOUNT_ACCESS_PLAN.md), [개발 완료 범위](docs/PROJECT_STATUS.md)를 확인하세요.

## 개발 실행 — 현재 PC

현재 PC에서는 Docker 없이 설치된 PostgreSQL·Neo4j·Local Jev·공식 Hermes를 사용합니다. 모델 키는 `.env`, 호스트 주소는 `.env.local`로 분리하며 기존 데이터를 유지합니다. **[로컬 실행 명령과 클라우드 전환 가이드](docs/DEPLOYMENT.md)**를 먼저 참고하세요.

cloud 프로필, 서비스별 환경변수 예제, 원격 승인 Skill 게시, 데이터 이전 도구를 포함합니다. cloud 프로필에서는 32자 미만·로컬 기본값·예제 자리표시자 관리자 토큰을 거부합니다.

## 선택 실행 — Docker Compose

Docker Desktop/Linux Docker Compose v2가 필요합니다. 전체 구성은 여유 메모리 8GB 이상을 권장합니다. 최초 local-ai 빌드는 공식 jevos 모델 약 630MB와 런타임을 다운로드합니다.

```bash
cp .env.example .env
docker compose --profile local-ai up --build -d
docker compose ps
```

Windows PowerShell에서는 첫 줄을 `Copy-Item .env.example .env`로 실행하세요.

- Command Center: http://localhost:3100
- 기본 관리자 토큰: `local-demo-admin-change-me` (`ADMIN_TOKEN`으로 변경)
- 백엔드 health: http://localhost:8080/api/health
- jevos health: http://localhost:8017/health
- Neo4j Browser: http://localhost:7474 (`neo4j` / `.env`의 `NEO4J_PASSWORD`)

`jevos /health`가 `ready`인지 확인한 후 실제 AI 시연을 시작합니다. 모델 로딩 중이거나 연결이 실패하면 Local Provider는 2회 시도 후 **MOCK_FALLBACK**으로 전환하며 화면과 DB에 표시합니다.

외부 모델 없이 안정적인 시연을 실행하려면:

```bash
docker compose up --build -d
```

화면에서 **시연 모드 · Mock**을 선택하세요. 이 모드는 모델 서버와 API 키를 사용하지 않습니다.

중지: `docker compose down`. DB는 named volume에 보존됩니다. **`docker compose down -v`는 시연 데이터를 삭제하고 다음 시작 시 고정 시드를 다시 생성합니다.**

## 5분 시연

기능이 익숙하지 않다면 화면의 **사용 안내** 메뉴에서 사용자용/관리자용 매뉴얼을 먼저 확인하세요. 인쇄용 HTML을 내려받아 브라우저에서 PDF로 저장할 수도 있습니다. 저장소 문서는 [사용자 매뉴얼](docs/USER_MANUAL.md), [관리자 매뉴얼](docs/ADMIN_MANUAL.md)입니다. 개인 계정의 ADMIN/USER 권한을 서버에서 검사합니다. 첫 관리자 계정은 ‘관리자 초기 설정’ 탭에서 ADMIN_TOKEN으로 접속한 뒤 ‘계정 관리’에서 초대하세요. 일반 사용자는 관리자에게 받은 1회용 코드로 비밀번호를 설정합니다.

**온톨로지** 메뉴에서 분석 기준 장애를 선택하고 **전체화면**으로 확대할 수 있습니다. **전체 맞춤**은 표시된 그래프를 영역 안에 맞추는 별도 기능입니다.

1. 로그인 후 실제 AI 모드 / Local jevos / SCN-01을 선택합니다.
2. **가상 장애 발생**을 클릭합니다. DB에 신규 장애가 등록되고 SSE 타임라인이 표시됩니다.
3. Jev 판단에서 실제 Provider, 모델명, 신뢰도, 근거 충분도, 실행 시간을 확인합니다. Mock이면 시뮬레이션 안내가 표시됩니다.
4. Jev 분류 또는 Diagnosis 원인 후보의 근거·신뢰도가 65% 미만이거나 서로 불일치하면 **담당자 판단 확인**에서 관측을 검토하고 분류·부서·확인 사유를 입력합니다.
5. Neo4j 영향 그래프와 A2A Agent 요청/응답, 승인 Skill 검색 결과를 확인합니다.
6. **상세 & 승인**에서 사유를 작성하고 **대응 승인**을 클릭합니다.
7. MCP 가상 조치 → 지표 검증 → Report Agent → Skill 초안/이력 저장을 확인합니다.
8. **후기 & 보고서**에서 조치 후기와 재발 방지 대책을 저장하고 PDF/Excel을 다운로드합니다. **장애 종료**를 누릅니다.
9. **지식 & Skill**에서 생성된 초안을 승인합니다. 승인 전 초안은 Agent 검색에 포함되지 않습니다.
10. **Harness & 평가**에서 Mock 또는 Local Jev 50건 평가를 실행합니다. 실제 점수, 담당자 검토 수, fallback 수가 표시됩니다.

자세한 진행 대본은 [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md), 검증 증적은 [docs/VALIDATION.md](docs/VALIDATION.md)에 있습니다.

## DB 저장 확인

```bash
docker compose exec postgres psql -U brain -d brain -c "SELECT id,status,provider,created_at,resolved_at FROM incidents ORDER BY created_at DESC LIMIT 5;"
docker compose exec postgres psql -U brain -d brain -c "SELECT count(*) FROM incidents;"
docker compose exec postgres psql -U brain -d brain -c "SELECT agent,status,count(*) FROM agent_tasks GROUP BY agent,status;"
```

최초 장애 이력은 200건이며, 버튼을 한 번 실행하면 201건이 됩니다. `provider`는 요청 Provider이고, **실제 사용 Provider와 fallback 증적은 `decision_json`**에 보존됩니다.

## Jev 설정

| 모드 | 실제 동작 | 실패 정책 |
|---|---|---|
| DEMO | `MockJevProvider` 고정 규칙 | 외부 모델 호출 없음 |
| REAL / LOCAL (기본) | `LocalJevProvider` → jevos `/v1/systemone` | 연결/HTTP 오류 2회 후 명시적 Mock fallback |
| REAL / TYPESAFE | `TypeSafeJevProvider` → 공식 TypeSafe API | API 키 필수, 실패 기록, 자동 Mock 전환 없음 |

TypeSafe는 `.env`에 `TYPESAFE_API_KEY`를 지정한 후 backend를 재생성하면 선택할 수 있습니다. 키는 프론트엔드로 전달되지 않습니다. Low confidence나 잘못된 응답 스키마는 Mock으로 덮어쓰지 않고 담당자 확인으로 전환됩니다.

호스트에서 jevos를 실행하면서 백엔드만 Compose를 사용하는 경우 `.env`의 `LOCAL_JEV_COMPOSE_URL=http://host.docker.internal:8017/v1/systemone`을 사용하고 호스트 서버가 컨테이너에서 접근 가능하도록 실행합니다. 호스트 백엔드용 LOCAL_JEV_URL과 구분합니다.

## Nous Hermes + OpenAI 연동

공식 Nous Research Hermes Agent를 별도 프로세스로 실행합니다. **Spring Boot → 로컬 Hermes API → OpenAI** 구조이며 Jev/Ontology/A2A/Harness는 기존 계층을 유지합니다.

Windows 로컬 설치에는 Python 3.14와 Git이 필요합니다:

```powershell
.\scripts\install-hermes.ps1
# 프로젝트 .env 파일의 OPENAI_API_KEY= 에 키를 입력하고 저장
.\scripts\start-hermes.ps1
```

- API: `http://127.0.0.1:8642/v1`, health: `http://127.0.0.1:8642/health`
- OpenAI 기본 주소: `https://api.openai.com/v1`, 기본 모델: `gpt-4.1-mini`. `.env`의 `HERMES_LLM_MODEL`로 변경 후 Hermes를 다시 시작합니다.
- `HERMES_API_KEY`는 설치 때 강한 난수로 생성한 **내부 서버 인증 키**입니다. 사용자의 `OPENAI_API_KEY`와 다릅니다. OpenAI 키는 Hermes에만 필요합니다.
- 전용 `runtime/hermes-home`을 사용하며 `platform_toolsets.api_server: []`로 모델의 실행 도구를 모두 비활성화합니다. 승인 Skill·매뉴얼·가상 이력은 백엔드가 문맥으로 제공합니다.
- `scripts/start-hermes.ps1`이 `.env`를 전용 home에 반영합니다. 기본 Spring Boot 실행은 프로젝트 `.env`를 자동으로 읽지 않으므로 아래 로더를 사용하거나 동일 환경변수를 직접 설정하세요.

```powershell
.\backend\mvnw.cmd -f backend/pom.xml package
.\scripts\start-backend.ps1
```

Hermes까지 Docker로 실행하려면:

```bash
python scripts/configure_hermes.py
# .env에 OPENAI_API_KEY 입력
# HERMES_API_KEY는 configure 스크립트가 생성
docker compose --profile local-ai --profile hermes up --build -d
```

Compose에서 백엔드는 `http://hermes:8642/v1`을 사용합니다(`HERMES_COMPOSE_URL`로 변경). 기본은 승인 지식 volume을 공유하며, `HERMES_PUBLISH_MODE=http`와 전용 HERMES_PUBLISH_KEY를 지정하면 프로젝트 소유 HTTP bridge로 게시할 수 있습니다. Docker 이미지 실행은 Docker Engine이 있는 환경에서 검증해야 합니다.

**실제 AI 모드**에서는 공식 Hermes `/v1/chat/completions`로 지식을 검색하고 해결 Skill 초안을 만듭니다. 응답의 Skill/매뉴얼 ID는 승인 DB 목록과 대조합니다. 모델 서버 부재, API 오류, 잘못된 JSON/미승인 참조는 `MOCK_HERMES_FALLBACK`으로 전환하며 원인과 사용 Provider를 화면·감사 로그에 기록합니다. **시연 모드**는 OpenAI나 Hermes를 호출하지 않습니다.

생성된 Skill은 DRAFT로 저장됩니다. 관리자가 승인한 후에만 정식 검색에 포함되고 Hermes의 `SKILL.md`로 게시됩니다. **지식 & Skill → 승인 지식 동기화**로 기존 승인 지식이나 실패한 게시를 재시도할 수 있습니다. 실제 Hermes `/v1/skills`에서 파일 인식까지 확인합니다. API 서버 연결 상태와 LLM 응답 검증 상태는 따로 표시됩니다.

고정 공식 소스 commit과 재현된 `/v1/skills` 호출 오류의 호환성 패치를 포함했습니다. 계약과 패치 범위는 [docs/PROVIDERS_AND_PROTOCOLS.md](docs/PROVIDERS_AND_PROTOCOLS.md)에 기록했습니다.

실제 전체 연동 검증:

```bash
python scripts/smoke_hermes.py
# NEEDS_REVIEW가 나오면 UI에서 원인 후보와 관측을 확인하고 검토 사유를 입력한 후:
python scripts/smoke_hermes.py --resume INC-출력된번호
```

이 스크립트는 가상 장애와 테스트 승인 기록을 생성합니다. Local Jev·Diagnosis·Hermes 중 하나라도 Mock이면 실제 연동 성공으로 인정하지 않습니다. 승인 전 미게시, 승인 후 공식 Hermes 목록 반영, PostgreSQL 종료 이력까지 검증합니다.

### Windows 공식 jevos 릴리스

```powershell
.\scripts\install-jevos.ps1
Set-Location runtime\jevos\jev
.\jev.exe serve --threads 4
```

공식 jevos-v4 릴리스와 모델을 SHA-256 검증 후 설치합니다. 오래된 Microsoft C++ Runtime에서는 `0xC0000005`로 시작 직후 종료될 수 있습니다. 최신 Microsoft Visual C++ x64 Redistributable을 사용하거나, 이미 설치된 Microsoft VCLibs를 **앱 폴더에만** 복사하는 옵션을 사용할 수 있습니다:

```powershell
.\scripts\install-jevos.ps1 -UseInstalledRuntime
```

이 옵션은 `Microsoft.VCLibs.140.00.UWPDesktop` x64 패키지가 있을 때만 동작하며 시스템 DLL을 수정하지 않습니다. 런타임 DLL과 모델은 소스 저장소/배포 ZIP에 포함하지 않습니다.

## 개발 실행

Java 21, Node.js 22+, PostgreSQL 17, Neo4j 5.26을 사용합니다. Maven Wrapper가 포함되어 있습니다.

```bash
docker compose up -d --wait postgres neo4j
cd backend
./mvnw spring-boot:run
```

별도 터미널:

```bash
cd frontend
npm ci
npm run dev
```

Windows는 `mvnw.cmd` / `npm.cmd`를 사용할 수 있습니다. 포트는 UI 3100, backend 8080입니다. `DB_URL`, `DB_USER`, `DB_PASSWORD`, `NEO4J_URI`, `NEO4J_PASSWORD`, `LOCAL_JEV_URL`은 환경변수로 변경할 수 있습니다.

프론트엔드 프로덕션 실행은 `npm run build` 후 `npm start`입니다. 메모리가 적은 PC에서는 모델을 잠시 중지하고 빌드하세요. Next.js 빌드 worker는 2개로 제한되어 있습니다.

DB 서버 없이 코드만 확인하려면 `SPRING_PROFILES_ACTIVE=local`을 지정합니다. 이 보조 프로필은 H2 파일 DB와 SQL 그래프 탐색을 사용하며 화면에 **H2 DEVELOPMENT / SQL_FALLBACK**을 표시합니다. 최종 DB 검증은 PostgreSQL/Neo4j로 수행하세요.

## 테스트

```bash
cd backend
./mvnw test
cd ../frontend
npm ci
npm run build
cd ..
python scripts/smoke.py --mode DEMO
python scripts/smoke.py --mode REAL --provider LOCAL
```

`smoke.py`는 실행 중인 가상 환경에 장애를 만들고 **테스트 승인**을 기록합니다. REAL smoke는 Mock 대체를 성공으로 인정하지 않습니다. 담당자 확인이 필요하면 중단하고 UI에서 이어갈 장애 번호를 출력합니다.

실제 DB 통합 테스트는 **새로운 전용 DB**에 대해 `TEST_DB_URL`, `TEST_DB_USER`, `TEST_DB_PASSWORD`, `TEST_NEO4J_URI`를 지정하고 Maven test를 실행하세요. 최초 seed 수량을 검사하므로 테스트 DB를 재사용하지 않습니다. GitHub Actions에 H2, frontend build, PostgreSQL/Neo4j 검증 workflow를 포함했습니다.

## 구성 및 구현 범위

- `backend/`: Spring Boot API, Flyway, Jev Providers, A2A, MCP, Harness, 평가, 보고서
- `frontend/`: Next.js/React/Tailwind/shadcn Button, React Flow, BFF와 HttpOnly 관리자 세션
- `scripts/`: 고정 seed 생성, jevos 설치, API smoke
- `infra/jevos/`: 공식 Linux 릴리스와 모델을 사용하는 선택적 Docker 서비스
- `docs/`: 아키텍처, Provider/프로토콜 계약, 시연 및 검증 결과

Hermes는 공식 Nous Agent와 OpenAI로 실제 연동되며 PostgreSQL이 승인 지식의 원본입니다. 원인 후보는 확정 근본 원인과 구분하고, 근거 부족·분류 불일치는 담당자 확인을 요구합니다. A2A는 0.3.0 JSON-RPC 동기 task 프로필이며 전체 프로토콜 인증을 받았다는 의미가 아닙니다. 개인 계정 로그인과 ADMIN/USER 역할·담당자 검사는 구현되어 있습니다. 관리자 토큰은 초기 설정·복구와 내부 서버 통신용입니다. 실운영 SSO/MFA/HA/감사 보관 정책은 별도 확장 범위입니다.
