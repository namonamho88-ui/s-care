# 로컬 PC에서 시작하고 클라우드로 전환하기

개발·사전 검증은 현재 PC에서 진행하며 **최종 시연은 Vercel + Supabase + Railway**에서 진행한다. 같은 Spring Boot/Next.js 코드를 사용하며 연결 주소와 게시 방식을 환경변수로 바꾼다. 실제 배포 성공은 각 계정에서 아래 검증을 마친 후에만 표시한다. 사용자의 기존 프로젝트를 우선 연결하며 프로젝트 이름/주소를 확인한 뒤 설정한다.

## GitHub에서 Vercel로 연결

1. GitHub `namonamho88-ui/s-care`의 main 브랜치에 소스가 올라온 것을 확인한다. GitHub에는 `.env`, API 키, 데이터 파일을 올리지 않는다.
2. Vercel에서 기존 프로젝트에 저장소를 연결하거나 Import Git Repository에서 `s-care`를 선택한다. **Root Directory를 `frontend`로 지정**한다. Next.js / `npm ci` / `npm run build`를 사용하고 Output Directory는 기본값으로 둔다.
3. Environment Variables에 `BACKEND_URL=https://실제-backend-도메인`과 `COOKIE_SECURE=true`를 설정한다. Railway 주소가 아직 없다면 화면을 먼저 배포해도 되지만, 주소 설정 후 재배포하기 전까지 로그인과 장애 처리는 작동하지 않는다. `localhost`를 Vercel의 백엔드 주소로 사용하지 않는다.
4. 관리자 토큰은 Railway backend에만 `ADMIN_TOKEN`으로 설정하고 로그인 화면에 입력한다. 무작위 32바이트 이상 값을 생성해 사용한다. cloud 프로필은 로컬 기본 토큰·약한 반복값·`REPLACE_WITH` 예제를 거부한다. OpenAI 키는 Hermes 서비스에만 설정한다.
5. 배포 완료 URL에서 로그인, 가상 장애, 실시간 이벤트, 승인, PDF/Excel 다운로드를 검증한다. DB 기록과 재시작 보존까지 확인해야 최종 시연 준비 완료다.

## 구성 대응표

| 역할 | 현재 로컬 | 클라우드 전환 |
|---|---|---|
| 화면·BFF | Next.js 3100 | Vercel, Root Directory `frontend` |
| 백엔드·A2A·MCP·Harness | Spring Boot 8080 | Railway `backend` 서비스 |
| 이력·승인·지식 원본 | PostgreSQL 15432, public schema | Supabase PostgreSQL, brain schema |
| 영향 그래프 | Neo4j 17687 | Railway Neo4j 또는 Aura의 `neo4j+s://` 주소 |
| Jev | 공식 jevos 8017 | Railway jevos (x86_64 CPU), 실제 Provider 유지 |
| Hermes | 공식 gateway 8642 | Railway Hermes + 전용 영구 볼륨 |
| 승인 Skill 게시 | 같은 PC의 skills 폴더 | 전용 인증 HTTP bridge 8643 |

Hermes의 공식 `/v1/chat/completions`, `/v1/toolsets`, `/v1/skills`와 프로젝트 소유 게시 bridge를 구분한다. HTTP bridge는 공식 Hermes의 쓰기 API를 가정하지 않고, Hermes 서비스 내부의 승인 Skill 파일만 원자적으로 저장한다. DB 승인 확인 → 전용 Bearer 인증 → 고정 namespace → SHA-256 영수증 확인 후에만 EXPORTED로 기록한다. 실패는 FAILED로 남고 관리자 동기화로 재시도한다. HTTP 모드에서는 백엔드 디스크/공유 볼륨이 필요 없다.

## 현재 PC 실행

Java 21, Node.js 22+, PostgreSQL 17, Neo4j 5.26, Python 3.14와 공식 Hermes/jevos 런타임을 사용한다. `.env`는 모델 키를 보관하며 Git/ZIP에서 제외한다. `.env.local`은 호스트 접속 주소를 덮어쓰는 파일로 역시 제외한다. `scripts/start-backend.ps1`은 `.env` 다음 `.env.local`을 읽는다. 클라우드 설정으로 로컬 파일을 덮어쓰지 않는다.

```powershell
# 최초 한 번만. 이미 있으면 기존 .env.local을 유지한다.
Copy-Item .env.local.example .env.local
```

이번 PC에 설치된 런타임은 저장소 옆 `../work/runtime`에 있다. 아래 명령은 저장소 `s-care`에서 실행한다. 서비스마다 별도 터미널을 사용한다.

```powershell
# 1. PostgreSQL (데이터 초기화 명령이 아니며 기존 brain DB를 연다)
..\work\runtime\postgres\pgsql\bin\pg_ctl.exe -D ..\work\runtime\postgres\brain-data -l ..\work\postgres-local.log -o '-h 127.0.0.1 -p 15432' start

# 2. Neo4j — 별도 터미널
$env:JAVA_HOME=(Resolve-Path '..\work\runtime\jdk21\jdk-21.0.12.1+1').Path
..\work\runtime\neo4j\neo4j-community-5.26.12\bin\neo4j.bat console

# 3. Local Jev — 별도 터미널
..\work\runtime\jevos-clean\jev\jev.exe serve --model-dir ..\work\runtime\jevos\model --threads 2 --state-cache 2 --state-cache-tokens 1024

# 4. Hermes — 별도 터미널
.\scripts\start-hermes.ps1 -RuntimeRoot (Resolve-Path '..\work\runtime').Path

# 5. Spring Boot — 별도 터미널
.\scripts\start-backend.ps1 -Java (Resolve-Path '..\work\runtime\jdk21\jdk-21.0.12.1+1\bin\java.exe').Path

# 6. 화면 — 별도 터미널
npm.cmd --prefix frontend start
```

접속: `http://127.0.0.1:3100`. 이 PC의 PostgreSQL 포트는 15432, Neo4j Bolt는 17687이다. 로컬 `.env.local.example`에 대응값이 있다. 다른 PC에서는 런타임을 설치하고 실제 경로/포트를 지정한다. 소스 ZIP에 모델·Python 환경·DB 파일을 넣지 않는다.

소스 변경 후에는 backend package/frontend build가 필요하다. 6GB PC에서는 모델을 중지한 뒤 빌드하고 다시 실행한다. 서비스 중지는 각 터미널 Ctrl+C, PostgreSQL은 `pg_ctl.exe -D ..\work\runtime\postgres\brain-data stop -m fast`다. DB 디렉터리를 지우거나 initdb를 다시 실행하지 않는다.

## Supabase 준비

1. 사용할 기존 PostgreSQL 프로젝트의 Connect에서 **Session pooler / 5432** JDBC 접속 정보를 얻는다. IPv6를 지원하면 직접 연결도 가능하다. 앱의 Hikari 풀은 기본 최대 5개다. URL에 `sslmode=require`를 지정하고 비밀번호는 DB_PASSWORD로 분리한다.
2. 클라우드 backend에 `SPRING_PROFILES_ACTIVE=cloud`, `DB_SCHEMA=brain`을 지정한다. Flyway와 Hikari가 같은 schema를 사용한다. 신규 빈 환경이면 고정 seed가 설치된다.
3. `brain`을 Supabase의 Exposed schemas에 추가하지 않는다. 브라우저에 Supabase DB 비밀번호나 service role 키를 전달하지 않는다. 기존 BFF → Spring 승인/API 경로를 유지한다. SQL Editor에서 `REVOKE ALL ON SCHEMA brain FROM anon, authenticated;`로 API 역할의 접근도 제한한다.
4. 기존 기록을 보존하려면 아래 이전 절차로 먼저 복원한 뒤 backend를 시작한다. 이미 생성된 seed 위에 기록을 덮어쓰지 않는다.

## Railway 서비스 설정

새 서비스의 Dashboard 설정으로 아래 값을 지정한다. 예제 환경변수는 `deploy/railway/*.env.example`에 있으며 실제 비밀 값은 Railway Variables에 입력한다. 공식 문서 기준 기존 railway.json/toml Config as Code는 폐기 예정이므로 새 설정을 해당 형식에 종속시키지 않았다.

| 서비스 | 소스 / Root Directory | 포트 / health | 영구 볼륨 |
|---|---|---|---|
| backend | GitHub / `backend`, Dockerfile 자동 감지 | PORT=8080, `/api/health` | 없음 |
| jevos | GitHub / `infra/jevos`, Dockerfile 자동 감지 | PORT=8017, `/health`, 모델 준비 최대 300초 대기 | 모델은 이미지에 포함 |
| hermes | GitHub / 저장소 루트, `RAILWAY_DOCKERFILE_PATH=infra/hermes/Dockerfile` | PORT=8642, `/health`; bridge=8643 | `/data/hermes` |
| neo4j | 공식 `neo4j:5.26-community` 이미지 | HTTP 7474, Bolt 7687 | `/data` |

Neo4j Aura를 쓰면 neo4j 서비스 대신 실제 Aura의 URI/사용자/DB명을 지정한다. Supabase는 Neo4j를 대체하지 않는다.

### 사용자 부재 시 절전과 비용 절감

Railway의 Serverless는 사용자 수가 아니라 **송신 네트워크 활동**으로 유휴 상태를 판정한다. 서비스별 Settings → Deploy → Serverless를 활성화하고 재배포해야 새 컨테이너에 적용된다. DB 연결 유지, 큐 조회, 상태 확인 요청도 활동에 포함된다. 마지막 송신 후 약 5~10분 동안 조용해야 절전할 수 있으므로 기능 설정과 애플리케이션의 유휴 처리를 함께 적용한다. [Railway Serverless](https://docs.railway.com/deployments/serverless).

| 서비스 | 절전 정책 | 유지할 동작 |
|---|---|---|
| backend | Serverless 활성화, 단일 replica 유지 | 진행 중 작업·평가 및 승인 후 복구의 완료, DB 작업 임대·결과 저장·감사 기록 |
| jevos | Serverless 활성화 | REAL 선택 또는 명시적인 관리자 워밍업 요청 때만 모델 사용 |
| hermes | Serverless 활성화, `/data/hermes` 볼륨 유지 | REAL 지식 검색·초안 생성, 승인된 Skill 게시·동기화 |
| neo4j | DB는 상시 사용 가능 상태 유지 | 기존 그래프·볼륨과 트랜잭션 보존, 사용량 보고 비활성화 |

Railway는 연결을 유지하는 작업자와 DB를 일반적인 Serverless 적용에 적합하지 않은 대상으로 설명한다. 이 프로젝트는 백엔드의 유휴 DB 조회를 멈추도록 조정하되, Neo4j에 강제 종료나 사용자 수에 따른 DB 중단을 추가하지 않는다. Neo4j의 자원 사용은 남는다. [Railway 유휴 비용 안내](https://docs.railway.com/guides/cut-idle-costs-serverless).

cloud 프로필은 `APP_IDLE_ENABLED=true`, `APP_IDLE_AFTER_SECONDS=60`을 기본으로 사용한다. 인증된 요청이 사라지고 진행 중 작업이 없으면 주기적인 유휴 DB 조회를 멈춘다. Hikari는 `DB_POOL_MIN_IDLE=0`, `DB_POOL_IDLE_TIMEOUT_MS=30000`, `DB_POOL_KEEPALIVE_MS=0`, `DB_TCP_KEEPALIVE=false`로 유휴 연결을 반환하며, Neo4j 드라이버도 활성 쿼리가 끝난 뒤 연결을 닫고 다음 요청에서 다시 연다. 최대 DB 연결 수 5와 기존 트랜잭션·잠금은 유지한다.

작업 큐는 시작·인증된 재접속·커밋된 작업 등록·작업 완료 시 깨운다. 대기 작업의 실행 시각과 임대 만료는 예약하고 실행 중 작업의 임대 갱신과 제한된 재시도는 계속 수행한다. 유휴 시 SLA 알림 검사는 보류하며 다음 접속 후 30초 이내 다시 확인한다. 이미 등록한 가상 알림은 최대 3회 전달 시도를 마친다. 따라서 절전을 위해 승인·복구를 생략하거나 DB 작업을 버리지 않는다.

시연 기본값은 **DEMO Mock**이다. 이 모드의 분류·지식 검색·초안 생성은 외부 모델을 호출하지 않으며, REAL 선택과 실제 호출 비용을 분리한다. 주기적인 AI 워밍업이나 외부 uptime 요청으로 서비스를 계속 깨우지 않는다. 관리자가 필요할 때 실행하는 워밍업에는 기존 호출 제한과 비용 표시를 유지한다. Hermes의 `HF_HUB_DISABLE_TELEMETRY=1`, `DO_NOT_TRACK=1`은 해당 설정을 지원하는 Hugging Face 클라이언트의 사용량 전송을 끈다. 모든 외부 통신을 차단하는 설정이나 절전 성공 보장은 아니다. [Hugging Face 환경변수](https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables).

절전 후 첫 접근에는 기동 대기 또는 일시적인 502가 발생할 수 있다. 로그인 서버 연결 실패를 비밀번호 오류로 표시하지 않고 재시도 가능한 상태로 안내한다. 시연 직전에 사이트에 한 번 접속하면 백엔드 기동 여부를 확인할 수 있다. REAL 모델은 기동 후 첫 추론 준비 시간이 별도로 필요하다. 절전 도입 이후의 실제 기동 시간·사용량은 결제 복구 후 클라우드에서 측정하며, 로컬 테스트만으로 비용 절감률을 확정하지 않는다.

절전 중에는 실행 자원 사용을 줄일 수 있지만 영구 볼륨의 저장 비용과 요금제 최소 금액은 남는다. backend↔Jev/Hermes/Neo4j 통신은 기존 private network를 유지한다. 임의의 비용 상한으로 서비스를 다시 차단하거나, 메모리 한도를 과도하게 낮추거나, 기존 DB·볼륨·모델을 삭제하지 않는다. 결제와 지출 상한 결정은 프로젝트 소유자가 수행한다. [Railway 비용 제어](https://docs.railway.com/pricing/cost-control), [볼륨 과금](https://docs.railway.com/volumes/reference).

### 자원 한도와 빌드 범위

2026-10-10 검증 당시 Railway Trial의 서비스당 RAM은 1GB, 영구 볼륨은 0.5GB였다. Trial에서 성공했다고 지속 무료 운영이 가능하다고 표시하지 않는다. 당시 Vercel → Railway backend/Jev/Hermes/Neo4j → Supabase의 DEMO 및 실제 AI 시연을 CLOSED까지 확인했다. 결제·Trial 만료로 플랫폼이 서비스를 중단한 상태는 비밀번호 오류나 절전 상태와 다르다. 복구 시 현재 요금제와 서비스 상태를 확인하고, 결제는 프로젝트 소유자가 수행한 뒤 배포·로그인을 검증한다.

Jev Dockerfile은 `--threads 2 --warmup 0 --batch-tokens 0 --state-cache 0 --state-cache-tokens 0`을 사용한다. 공식 jevos의 모델과 `/v1/systemone` 계약을 유지하면서 유휴 시간의 모든 입력 길이 사전 컴파일, 요청 병합, 상태 캐시를 끈다. 첫 요청 지연과 반복 요청 성능은 달라질 수 있다. Railway에서 동일한 Start Command로 가상 장애를 RESOURCE/P1/PLATFORM으로 분류했고 입력 1,176 토큰, cgroup 최고 메모리 703,369,216 bytes(약 671MiB), OOM kill 0을 확인했다. 이 한 건의 검증은 부하 테스트나 0.5GB Free 실행 보장이 아니다. 증적: `evidence/railway-jev-trial.json`.

계속 무료로 개발하려면 Jev/Neo4j 등 자원 소모가 큰 서비스를 PC에서 실행하는 구성을 사용할 수 있다. 이는 모든 서비스를 클라우드에서 실행하는 최종 시연과 구분한다. 전체 클라우드 운영의 자원을 늘리기로 선택할 경우 요금제 전환과 결제는 프로젝트 소유자가 수행한다. Hobby의 월 $5는 포함 사용량과 최소 요금이며 전체 구성의 월 요금 상한이 아니다. [Railway 공식 요금제](https://docs.railway.com/pricing/plans).

작은 시연 볼륨에서는 Neo4j의 트랜잭션 로그 사전 할당을 끄고 16MB 단위, 2개 파일 보존으로 설정한다. `deploy/railway/neo4j.env.example`에 포함되어 있다. 이미 디스크가 가득 찬 볼륨을 이 설정만으로 복구했다고 가정하거나 기존 데이터를 삭제하지 않는다. [Neo4j 설정](https://neo4j.com/docs/operations-manual/current/configuration/configuration-settings/).

이번 기존 볼륨은 Railway 지표와 달리 실제 `df`에서 434MB 중 424MB 할당, 여유 공간 0으로 확인됐다. Neo4j를 완전히 중지한 상태에서 `/data`를 백업하고, 두 트랜잭션 로그의 0으로 채워진 블록만 sparse 처리했다. 삭제·truncate 없이 처리 전후 SHA-256 일치를 확인했고, 사용량이 약 2.3MB로 감소한 뒤 DB가 정상 기동했다. 이는 해당 볼륨의 복구 기록이며 실행 중 DB에 적용할 일반 초기화 절차가 아니다. 신규 환경에서는 위 사전 할당 설정을 처음부터 사용한다. 증적: `evidence/neo4j-allocation-repair.json`.

GitHub 자동 배포의 Watch Paths는 backend `/backend/**`, jevos `/infra/jevos/**`, hermes `/infra/hermes/**`, `/scripts/**`, `/.dockerignore`로 제한한다. 문서나 프론트엔드 수정만으로 모든 모델 서버가 재시작되지 않도록 한다. [Railway 모노레포 배포](https://docs.railway.com/deployments/monorepo).

- backend만 공개 HTTPS 주소를 만들고 Vercel BACKEND_URL에 넣는다. DB/jevos/Hermes/bridge는 같은 프로젝트의 private network로 연결한다. 예제의 `*.railway.internal`은 실제 서비스 주소로 바꾼다.
- Hermes는 OPENAI_API_KEY, HERMES_API_KEY, 별도의 HERMES_PUBLISH_KEY를 받는다. 백엔드는 내부 인증 키 두 개만 받는다. bridge에는 upstream OpenAI 키를 전달하지 않는다.
- **backend는 단일 replica**로 운영한다. 유휴 절전과 단일 인스턴스 제약은 별개다. 장애 작업은 PostgreSQL 큐·임대·완료 단계 재사용으로 재시작 후 이어받지만, 평가의 동시 실행 제한 때문에 수평 확장은 하지 않는다.
- 배포는 진행 중 분석·복구·평가가 없을 때 진행한다. 재시작 시 DB 큐의 재시도 정책과 임대를 적용하며 사람 승인·검토, 중단·삭제, 실패 상태를 우회하지 않는다. 승인을 기다리는 장애를 절전 때문에 승인하거나 종료하지 않는다.
- backend PORT를 바꿔도 내부 A2A/MCP는 실제 포트를 따른다. 공개 Agent Card용 AGENT_BASE_URL은 공개 backend 주소다. INTERNAL_URL은 단일 프로세스 내부 호출용 loopback이며 외부 주소로 바꿀 필요가 없다.
- 파일 게시가 실패해도 승인 원본은 PostgreSQL에 남는다. Hermes 볼륨 복구 후 **승인 지식 동기화**로 재구성한다. 한 API 요청은 최대 5개씩 게시하고 화면은 커서로 다음 묶음을 요청하며 진행 수량을 표시한다. 실패한 항목은 FAILED로 남으며 동기화를 다시 실행하면 재시도한다.

## Vercel 연결

저장소에 검증된 코드를 반영한 후 Import → Root Directory `frontend` → Next.js를 선택한다. `frontend/vercel.json`을 사용한다. 환경변수는 `deploy/vercel.env.example`의 BACKEND_URL, COOKIE_SECURE다. API 키는 Vercel에 필요 없다. Preview/Production은 서로 다른 테스트/시연 백엔드에 연결해 승인·DB 데이터가 섞이지 않게 한다.

현재 Production 주소는 [s-care-mu.vercel.app](https://s-care-mu.vercel.app/)이다. Root Directory `frontend`, Framework `Next.js`, `BACKEND_URL=https://backend-production-0eb45.up.railway.app`, `COOKIE_SECURE=true`로 배포했다. 관리자 로그인, 실제 AI 장애의 검토·승인·종료와 Skill 승인/거부를 브라우저에서 확인했다. 인증 거부, Secure/HttpOnly 쿠키, SSE 재연결과 PDF/Excel은 배포된 BFF를 통해 추가 검증했다. Preview 환경은 아직 별도 backend를 구성하지 않았으므로 Production 시연 주소를 사용한다.

장애 분석은 Spring Boot에서 비동기로 진행한다. BFF는 이벤트를 전달하며 `maxDuration=300`초다. 백엔드 SSE는 최대 240초 뒤 정상 종료하고 브라우저 EventSource가 Last-Event-ID로 DB 이벤트를 이어받는다. 요금제에서 해당 함수 시간을 허용하는지 배포 때 확인한다. 로컬에서도 같은 재연결 동작을 테스트한다.

## 기존 데이터 이전과 되돌리기

1. 시연을 마치고 백엔드를 중지해 쓰기를 멈춘다. 원본 로컬 DB는 그대로 보존한다.
2. 아래 도구는 원본을 pg_dump로 읽고 **새 임시 DB에만** 복원해 schema 이름을 brain으로 바꾼 후 보관용 archive를 만든다. 임시 DB만 삭제한다. 로컬 CREATEDB 권한과 호환되는 PostgreSQL 도구가 필요하다. 기존 출력 파일을 덮어쓰지 않는다.

```powershell
python scripts/export_portable_db.py --pg-bin ..\work\runtime\postgres\pgsql\bin --output ..\work\backups\brain-cloud-ready.dump
```

3. 대상 Supabase가 **애플리케이션 데이터가 없는 신규 프로젝트**인지 확인한다. PGPASSWORD/PGHOST/PGPORT/PGUSER/PGDATABASE를 대상 Session pooler 값으로 설정하고 다음처럼 복원한다. 비밀번호를 명령줄 인수나 Git에 기록하지 않는다.

```powershell
..\work\runtime\postgres\pgsql\bin\pg_restore.exe --no-owner --no-acl --exit-on-error -d $env:PGDATABASE ..\work\backups\brain-cloud-ready.dump
```

`--clean`은 대상 복원에 사용하지 않는다. 복원 오류가 있으면 앱을 시작하지 말고, 원본 백업을 유지한 상태에서 새 빈 대상으로 다시 복원한다.

4. **대상 DB에만** `UPDATE brain.skills SET export_status='NOT_EXPORTED';`를 실행한다. 원래 PC에서 게시한 표시를 새 Hermes 서버에 게시된 것으로 오인하지 않도록 한다. schema 권한 제한도 적용한다.
5. backend cloud 프로필을 시작한다. Flyway 이력까지 이전되므로 seed가 중복 생성되지 않는다. Neo4j 의존 관계는 PostgreSQL 자산·관계로 재구축된다. Hermes 승인 Skill은 동기화 버튼으로 새 볼륨에 게시한다. 미승인 초안은 DB에만 남는다.
6. 이력/Skill/이벤트/감사/Agent Task 수량과 기존 보고서, 승인 정보, 새 장애 생성, 재시작 후 보존을 확인하고 화면 접속 주소를 전환한다.
7. 전환 중 문제가 있으면 로컬 설정과 원본 DB로 돌아간다. **클라우드 전환 후 새로 쓴 데이터는 로컬에 자동 합쳐지지 않는다.** 되돌릴 때도 쓰기를 멈추고 cloud brain schema를 백업·검증해 별도 로컬 DB로 복원해야 한다.

## 검증 범위

로컬 계약 테스트와 실제 PostgreSQL/Neo4j를 사용하는 cloud 프로필 리허설을 실제 호스팅 검증과 구별한다. 상세 결과는 `VALIDATION.md`, `evidence/portability-smoke.json`에 기록한다. 클라우드에서는 Docker 이미지 빌드, TLS/인증, 사설 네트워크, 모델 CPU 호환성·메모리, SSE 재접속, 보고서 다운로드, 볼륨 재시작 보존을 추가 확인한다.

공식 기준 문서: [Supabase Spring Boot](https://supabase.com/docs/guides/getting-started/quickstarts/spring-boot), [custom schemas](https://supabase.com/docs/guides/api/using-custom-schemas), [Railway Compose 이전](https://docs.railway.com/guides/docker-compose), [Volumes](https://docs.railway.com/volumes), [Config as Code 변경](https://docs.railway.com/config-as-code/reference), [Vercel 함수 시간](https://vercel.com/docs/functions/configuring-functions/duration). 확인일 2026-10-10.
