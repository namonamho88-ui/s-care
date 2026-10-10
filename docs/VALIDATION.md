# 실행 검증 기록

검증일: 2026-10-10 (KST). 모든 장애·관측·담당자·자산은 가상 데이터다.

이 문서는 단계별 검증 이력이다. **각 절의 날짜와 범위를 구분해 읽는다.** 초기 부분 배포의 미완료 사항은 후속 ‘Vercel · Supabase · Railway 전체 통합 검증 완료’ 절에서 해소했다. 이후 UI·계정 변경 검증은 말미의 최신 절을 기준으로 한다.

## 실제 Railway/Supabase 부분 배포 (최신)

- 기존 Railway 프로젝트 `astonishing-balance`에서 backend, jevos, hermes, neo4j 서비스를 구성했다. 기존 실패한 저장소 루트 빌드를 `/backend` Dockerfile 빌드로 수정했다.
- 실제 backend HTTPS에서 인증 없는 요청의 401 거부, 관리자 인증 조회, PostgreSQL 연결, 기존 장애 203건과 카탈로그 52자산/15담당자/30매뉴얼/50시나리오를 확인했다.
- Supabase 전용 `brain` schema에 이전용 백업을 단일 트랜잭션으로 복원했다. 장애 203건, Skill 23개, 의존 관계 80개, Agent Task 22개, 이벤트 117개, 감사 98개를 보존했다. `anon`, `authenticated` 역할의 schema 접근은 허용하지 않는다.
- 공식 Hermes gateway에 내부 네트워크로 접속했으며 실행 도구가 모두 비활성화된 것을 확인했다. 승인 Skill 22개를 인증된 HTTP bridge로 게시하고 PostgreSQL의 EXPORTED 결과를 확인했다. 이 단계는 새 클라우드 LLM 추론 검증을 뜻하지 않는다.
- 6개 A2A Agent Card의 공개 HTTPS 주소, 기존 보고서 PDF/Excel 다운로드, SSE 이벤트와 Last-Event-ID 재접속을 확인했다. 다운로드 파일 형식/크기를 검사했으며 이번 배포에서 보고서의 시각 검수를 다시 수행하지는 않았다.
- Trial의 실제 한도는 서비스당 메모리 1GB이며, 2GB 설정 시도는 `The maximum allowed memory for this service is 1 GB`로 거부됐다. Jev가 기동 뒤 반복 종료됐으며 구체적인 종료 원인은 아직 확정하지 않았다. Neo4j는 `No space left on device`로 기동하지 못했다. 로그 사전 할당을 줄인 뒤에도 해결되지 않아 자원 조정과 재검증이 필요하다.
- **미완료:** Railway의 안정적인 Jev 추론/Neo4j 기동, 클라우드 전체 장애 처리 시연, 모델 호출/볼륨 재시작 보존, Vercel 화면 연결. Mock이나 SQL fallback으로 이 검증을 대신하지 않았다.
- 증적: `evidence/railway-cloud.json`. 이전의 로컬 REAL 및 GitHub 컨테이너 검증 결과는 아래 기록과 구별한다.

## 실행 환경

Windows 호스트에서 공식 portable Java 21, PostgreSQL 17.6, Neo4j 5.26.12,
jevos-v4 Windows x64 / OpenVINO CPU와 Node.js 24.13을 직접 실행했다.
이 PC에는 Docker가 없어 컨테이너를 실행했다고 주장하지 않는다.
아래 초기 기록은 호스트 프로세스 기반 검증이며, 이후 GitHub Linux runner에서 컨테이너 검증을 추가했다.

## 2차 개발 시점 자동 검증

| 항목 | 결과 |
|---|---|
| Jev Provider 테스트 | 11개 통과 (기존 8개 + 독립 원인 후보 3개): Mock/Local/TypeSafe 계약, Bearer, timeout, 연결 실패, 2회 fallback, 낮은 근거, 잘못된 스키마 |
| Spring 통합 테스트 | 9개 통과: seed/FK, 인증, 도구 거부, 승인·복구·종료·보고서·Skill, 검토 전환, A2A 멱등성, 영향 그래프, 평가, SSE 재생 |
| Hermes Provider / 게시 / EvidencePolicy | 8 + 1 + 3 = 12개 통과: 공식 HTTP 계약, 실제/Mock 구분, 잘못된 참조/도구 권한 거부, 초안 미게시, 교차 검증 |
| H2 / SQL 보조 프로필 | 32개 모두 통과 |
| 실제 PostgreSQL + Neo4j | 32개 모두 통과, 신규 brain_phase2_verified DB 사용 |
| Next.js 프로덕션 build | 성공, TypeScript와 standalone 출력 포함 |
| npm audit | 알려진 취약점 0개 (검증 시점) |

Local/TypeSafe **Provider 계약 테스트는 HTTP stub**을 사용한다. 아래 실제 로컬 모델
검증과 구분한다. TypeSafe의 유료 API 실호출은 키 미제공으로 검증하지 않았다.

## 실제 Jev 시연

1. 브라우저에서 REAL / LOCAL / SCN-01 선택 후 가상 장애를 생성했다.
2. `INC-a21bdc49-8c43-48`에서 `LOCAL_JEV`, `jevos-v4`, `simulated=false`,
   `fallback=false`, confidence 69.93%, evidence 85.10%, 3,552ms를 확인했다.
3. 실제 Neo4j 역방향 의존 탐색 결과에 발생 지점을 포함한 14개 자산이 포함됐다.
4. 화면에서 확인 사유를 입력하고 대응을 승인했다. `RESOLVED`를 확인했다.
5. 별도 REAL API smoke `INC-4ea128ba-1176-41`은 6개 Agent, 승인,
   MCP 가상 지표 변경/검증, 보고서, Skill 초안, PostgreSQL 저장을 거쳐 `CLOSED`까지 완료했다.
6. 최종 standalone BFF에서 HttpOnly 세션, 교차 Origin 요청 거부, 실제 DB 설정,
   6개 Agent 결과를 확인했다. 첫 번째 장애의 후기·재발 방지 저장과 종료,
   생성 Skill 승인을 API로 마쳤다. `evidence/final-api-check.json`에 결과를 기록했다.
7. BFF를 통해 PDF와 Excel을 다운로드했다. A4 PDF 3페이지를 PNG로 렌더링하여
   한글·줄바꿈·여백·페이지 번호를 확인했다. Excel은 유효한 OOXML 파일과 4개 시트를 확인했다.

실제 모델 추론과 실제 DB 저장을 검증했다. 복구 대상은 가상 지표이며
운영 서버를 재시작하거나 설정을 변경하지 않는다.

브라우저에서 로그인, 생성, 모델 결과, 영향 분석, 승인, 복구 완료를 확인했다.
최종 빌드 이후의 추가 UI 확인은 브라우저 도구가 이전 연결 오류의 `data:` 페이지를
URL 정책으로 차단해 중단했다. 이후 API 확인을 브라우저 확인으로 대체 표기하지 않는다.

## 공식 Hermes + OpenAI 실제 통합 검증 (2차)

- Nous Hermes commit `a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed`, Python 3.14의 전용 venv/home에 설치하고 Windows에서 `hermes gateway run`을 실제 실행했다.
- `/health` 정상, `/v1/toolsets` enabled 목록 0개, `/v1/skills` 실제 카탈로그 조회를 검증했다. 설치 소스의 잘못된 include_editorial 인자로 발생한 HTTP 500은 명시적인 고정 commit 호환성 패치로 수정했다.
- 사용자가 입력한 로컬 OpenAI 키로 `gpt-4.1-mini` 응답을 확인했다. 직접 연결 검사 1,119 tokens, 실제 응답 JSON 확인. API alias는 `hermes-agent`이다. 키는 기록/소스/ZIP에 포함하지 않는다.
- 가상 장애 `INC-e069ac26-8d59-49`: 실제 Local Jev 분류와 별도 원인 후보 `RESOURCE_PRESSURE`, Neo4j 영향 탐색, 실제 Hermes 지식 검색을 실행했다.
- Diagnosis 근거 점수 48.05% 때문에 `NEEDS_REVIEW`로 정지했다. 점수나 임계값을 바꾸지 않고 가상 통합 테스트의 관리자 확인 사유를 남긴 후 재개했다. 재분석으로 분석 Agent 4개가 한 번씩 추가되어 총 10개 Task가 저장됐다.
- 실제 Hermes/OpenAI가 적용 조건·점검 절차·해결 방법·주의사항을 생성했다. 초안 `SKL-862d515d-2837-48`, `simulated=false`, `source_provider=HERMES_AGENT`, 초안 생성 2,781ms / 3,551 tokens.
- 승인 전 공식 `/v1/skills`에 초안이 없음을 확인했다. 승인 후 `SKILL.md`를 게시하고 같은 API에서 새 Skill 인식을 확인했다. 최종 장애 상태는 PostgreSQL `CLOSED`다.
- 증적: `evidence/hermes-real-smoke.json`, `evidence/hermes-openai-check.json`. 자동 재현: `scripts/smoke_hermes.py` (검토가 필요하면 UI 확인 후 `--resume`).
- 최종 Next.js 빌드 성공. Standalone BFF에서 HttpOnly 세션, PostgreSQL/Neo4j 설정, Hermes API/LLM 검증 상태, 승인 Skill 게시 상태를 확인했다 (`evidence/phase2-bff-check.json`). 새 장애의 PDF 4페이지를 렌더링해 한글/여백/페이지 넘김을 확인했고 Excel 4시트도 검증했다. 새로운 UI의 렌더링/클릭 검증은 이전 브라우저 정책 제한 때문에 별도로 완료했다고 주장하지 않는다.
- Docker Compose v5.6.0 공식 바이너리 SHA 검증 후 `--profile local-ai --profile hermes config --quiet` 통과. Docker Engine이 없어 이미지 빌드/컨테이너 기동은 실행하지 않았다.

## 실제 모델 50건 평가 (1차 Jev 분류 평가)

평가 ID: `EVAL-e63879d1-c08c-4a`, 상태 `COMPLETED`.

| 지표 | 결과 |
|---|---:|
| 4개 필드 전체 일치 | 47 / 50 (94%) |
| 장애 유형 | 50 / 50 |
| 심각도 | 50 / 50 |
| 담당 부서 | 50 / 50 |
| 재발 의심 | 47 / 50 |
| 근거·신뢰도에 따른 담당자 확인 | 2건 |
| Mock fallback | 0건 |

고정 가상 시나리오에서 얻은 결과이며 실운영 성능의 추정치가 아니다.
Mock 시연 점수와 실제 모델 점수를 섞지 않는다. 정답은 모델 입력에서 제외했다.
원본 판단/정답/확률은 `evidence/local-jevos-evaluation.json`에 보존했다.

## 재현 조건 및 확인하지 않은 범위

- 시드 300으로 12/40/15/200/30/20/80/50을 생성한다. 시연을 실행하면 장애/Skill 수는 증가한다.
- 시드 이력의 Provider는 `SEED`, `simulated=true`다. 신뢰도·실행시간 0은 모델 미실행을 뜻한다.
- Windows의 오래된 C++ runtime으로 모델이 시작되지 않아 설치된 Microsoft VCLibs를
  앱 폴더에 복사했다. 일관된 VCLibs x64 14.0.33728 패키지만 사용한 실행도 확인했다.
- 6GB 호스트에서 모델·빌드 동시 실행 시 메모리가 부족했다. 모델을 잠시 중지하고
  빌드 worker를 2개, 테스트 JVM heap을 384MB로 제한해 재검증했다.
- TypeSafe 실제 서비스는 사용자 선택에 따라 향후 키 설정으로 전환하도록 유지했다. HTTP 계약 테스트만 수행했다. Docker 이미지 빌드/실행은 미검증이다.
- Hermes 공식 API와 OpenAI 실제 생성·승인 후 게시를 검증했다. 위 50건 평가는 새 Diagnosis/Hermes의 품질 점수가 아니다.
- A2A/MCP는 문서화한 프로필과 로컬 왕복 호출을 검증했으며 공식 conformance 인증을 뜻하지 않는다.
- 실제 운영 배포에 필요한 SSO, HA, 외부 보안 심사와 부하 검증은 범위에 포함하지 않았다.
# 로컬 우선 / 클라우드 전환 준비 검증 (2026-10-10)

- 기본 실행은 현재 PC의 PostgreSQL/Neo4j/Local Jev/공식 Hermes다. `.env` 키를 바꾸지 않고 `.env.local`에 호스트 DB/그래프 주소를 분리했다.
- Java 자동 테스트 **36개**가 H2에서 통과했고, 새 PostgreSQL 17.6 DB + cloud 프로필의 `brain` schema + Neo4j 5.26.12에서도 **36개 모두 통과**했다. 클라우드 전용 schema의 신규 Flyway 초기화를 실제 PostgreSQL에서 확인했다.
- Python Skill bridge 자동 테스트 **6개 통과**: 인증 실패/미승인/가상 데이터 표시 누락/내용 해시 오류/namespace 오류/필수 항목 누락/크기 제한과 재시도 결과를 검사한다. Java 테스트에는 실제 Python HTTP 프로세스를 실행하는 왕복 게시 테스트도 포함한다.
- SSE는 제한 시간 후 종료되고 Last-Event-ID로 새 DB 이벤트를 이어받는 것을 검사했다. Next.js production build 성공, 생성된 functions-config-manifest에서 `/api/[...path]`의 maxDuration=300을 확인했다.
- Docker Compose local-ai + hermes 구성 파싱 통과. Docker Engine이 없으므로 새 Hermes 컨테이너 supervisor와 이미지 빌드는 실행 검증하지 않았다.
- 원본 `brain` DB의 **장애 203 / Skill 23 / Task 22 / 이벤트 117 / 감사 98건**을 pg_dump로 읽어, 임시 복사본의 schema를 brain으로 전환한 archive를 만들었다. 원본 DB에는 장애 203건과 기존 실제 Jev/Hermes 시연의 CLOSED 상태가 그대로 남는다.
- archive를 별도 PostgreSQL DB `brain_portability_restored`에 복원하고, cloud 프로필/18081 포트/HTTP Skill 게시 방식으로 실행했다. INTERNAL_URL을 설정하지 않아도 실제 포트로 A2A/MCP 왕복이 성공했고 6개 Agent를 거쳐 DEMO 장애가 CLOSED로 저장됐다. 이 검증의 판단은 **Mock 시연**이며 새 실제 모델 평가가 아니다.
- 새 Skill은 승인 전에 게시되지 않았고 승인 후 실제 HTTP 수신 서버의 파일로 저장됐다. 승인 지식 23건을 새 저장소에 재구성했고 재시작 후 기존·신규 장애와 DB 기록을 확인했다. 증적: `evidence/portability-smoke.json`.
- 테스트용 백엔드/bridge/DB 서버는 검증 후 종료한다. 테스트 DB와 백업은 소스 ZIP에서 제외한다. 실제 Vercel/Supabase/Railway 계정에 배포하거나 유료 리소스를 생성하지 않았다. 배포 가이드는 `DEPLOYMENT.md`, 작업 계획은 `PORTABILITY_PLAN.md`다.

## GitHub 게시 준비 검증 (2026-10-10)

- 최종 시연 대상을 Vercel + Supabase + Railway로 명시하고 Vercel의 `frontend` Root Directory 및 환경변수 설정 순서를 추가했다.
- cloud 프로필의 기본/자리표시자/약한 관리자 토큰 거부, 승인 Skill의 최대 5개 단위 커서 동기화와 미승인 게시 방지를 보완했다. 로그인 화면의 기본 토큰 자동 입력을 제거했다.
- Java **40개 모두 통과**(H2, 실제 Python HTTP bridge 왕복 포함), Python **6개 모두 통과**, Next.js production build 통과. 이번 변경의 PostgreSQL/Neo4j 재검증 및 컨테이너 결과는 GitHub Actions 실행 후 별도로 기록한다.
- `container verification` workflow는 backend/frontend Docker 빌드 → 실제 PostgreSQL/Neo4j DEMO → BFF 로그인 → backend 재시작 후 이력 보존을 검사한다. 별도 job은 공식 jevos/Hermes 이미지를 빌드·기동하고 health 및 Hermes tool 비활성화를 확인한다. 이 검사는 실제 OpenAI 호출이나 클라우드 배포 성공을 뜻하지 않는다.

## GitHub Linux 컨테이너 검증 완료 (2026-10-10)

- 코드 커밋 `3331b32d90318ac1a724be87f40007c0c29c0a41`의 [verify](https://github.com/namonamho88-ui/s-care/actions/runs/38048796620)와 [container verification](https://github.com/namonamho88-ui/s-care/actions/runs/38048796614)가 모두 성공했다. 기계 판독 증적은 `evidence/github-ci.json`이다.
- H2 Java **40개**, Python **6개** 통과. PostgreSQL 17.6 + Neo4j + cloud/brain schema에서는 **39개 통과, 1개 건너뜀**이다. 건너뛴 Python bridge 프로세스 테스트는 H2 job에서 실제 Python 서버를 사용해 통과했다.
- Docker의 backend/frontend/PostgreSQL/Neo4j를 실제 기동하고 DEMO 장애를 생성 → 6개 A2A Agent → 관리자 승인 → 가상 복구 검증 → 보고서 생성 → CLOSED 이력 저장까지 확인했다. Next.js BFF 로그인·장애 201건 조회와 backend 재시작 후 새 이력 보존도 통과했다.
- 공식 jevos Linux CPU 이미지 빌드와 health 기동 확인 성공. 공식 Hermes pinned source 이미지 빌드·비-root gateway 기동·HTTP Skill bridge health·전체 API tool 비활성화 확인 성공. Hermes는 upstream이 지원하는 editable 설치를 사용하며, 앱 볼륨 소유권 초기화 후 전용 UID 10001로 실행한다.
- 이 CI에는 OpenAI 실제 비밀키를 제공하지 않았다. 컨테이너 health 검증을 실제 LLM 판단 성공으로 표시하지 않는다. 실제 Jev/Hermes 모델 호출 결과는 앞선 PC 시연 증적과 구별한다.
- 최신 UI의 클릭·시각 검증은 Codex 내장 브라우저 URL 보안 정책으로 막혀 수행하지 못했다. 로컬 서버의 HTTP 200과 빌드는 확인했으며 테스트용 서버는 종료했다. 실제 클라우드 도메인·네트워크·인증·볼륨 재시작 시연은 배포 후 검증한다.

## Railway 무료 체험 자원 검증 (2026-10-10)

- 실제 Railway backend와 Supabase `brain` schema 연결, 203건의 이전 장애 보존, 인증, A2A 카드, PDF/Excel 다운로드, SSE 재연결, Hermes 승인 Skill 22건 게시를 확인했다. 당시의 부분 검증 증적은 `evidence/railway-cloud.json`이다.
- Jev 공식 모델을 교체하지 않고 유휴 사전 컴파일/상태 캐시/요청 병합을 끈 설정으로 재배포했다. 컨테이너 내부에서 인증된 `/v1/systemone`에 가상 증상을 보내 RESOURCE/P1/PLATFORM 판단을 받았다. 입력 1,176 토큰, 최고 메모리 약 671MiB, OOM kill 0이다. `evidence/railway-jev-trial.json`에 실제 응답을 기록했다. Dockerfile에도 동일한 실행 옵션을 반영했다.
- 이는 Trial 1GB 환경의 단일 요청 검증이며, 0.5GB Free 플랜 성공 또는 backend에서 전체 REAL 시연 완료를 의미하지 않는다. 최초 반복 종료의 OS 수준 원인은 확정하지 않았다.
- Neo4j는 트랜잭션 로그 할당을 줄인 뒤에도 `No space left on device`가 남았다. 보고된 볼륨 사용량은 약 36MB/500MB여서 영구 볼륨 용량 소진이라고 확정하지 않는다. 진단용 배포는 취소하고 원래 healthcheck와 시작 설정을 복원했다. 임시 SSH 키는 계정에서 해제하고 로컬 파일도 제거했다.
- 유료 전환은 수행하지 않았다. Neo4j 정상 실행, 전체 hosted REAL 장애 처리·재시작 보존, Vercel 연결은 남아 있다.

## Vercel · Supabase · Railway 전체 통합 검증 완료 (2026-10-10 후속)

아래 결과는 앞 절의 부분 배포 상태를 대체한다. 실행 코드는 `1b85dadb84ef7f40c939a3aeb0692a51d9b44115`다. 해당 커밋의 [verify](https://github.com/namonamho88-ui/s-care/actions/runs/38053239162), [container verification](https://github.com/namonamho88-ui/s-care/actions/runs/38053239077)가 모두 성공했다. 이번 후속 변경은 배포 설정·검증 문서·증적이며 애플리케이션 코드를 변경하지 않았다.

- **화면 배포:** [s-care-mu.vercel.app](https://s-care-mu.vercel.app/), Vercel Root Directory `frontend`, Framework `Next.js`, Production BACKEND_URL/COOKIE_SECURE 설정. 배포 `dpl_FfEtMJSWGFFfLQqBS5wsqq79vKyK` Ready를 확인했다. 관리자 로그인, 상세 조회, 담당자 검토, 승인, 후기 저장, 종료, Skill 승인/거부, 실제 평가 실행을 브라우저에서 검증했다. 앞 절에 남아 있던 브라우저 검증 제한은 이 호스팅 주소에서 해소됐다.
- **Neo4j 복구:** 실제 `/data`는 사용 가능한 434MB 중 424MB가 할당돼 여유 공간이 없었다. 사전 할당된 두 트랜잭션 로그의 논리 크기는 약 256MB/165MB였다. DB 완전 중지 → 전체 백업 → 백업/원본 SHA 확인 → zero-block sparse 처리 → 원본 SHA 재확인 순서로 복구했다. 삭제나 truncate를 하지 않았다. 이후 실제 Neo4j 기동과 그래프 52개 자산·80개 관계를 확인했다. `evidence/neo4j-allocation-repair.json`.
- **DEMO:** `INC-66a82c6e-3353-46`, MOCK 분류, 실제 Neo4j/6개 Agent/승인/가상 복구/보고서/Skill 초안/DB 저장을 거쳐 CLOSED. 외부 LLM을 호출하지 않았다.
- **실제 AI:** `INC-b6b3504a-d150-4d`, Local jevos-v4가 RESOURCE/P1/PLATFORM을 419ms에 판단했다. 신뢰도 75.66%, 근거 85.29%, simulated=false, fallback=false다. Neo4j 영향 자산은 14개였다. 원인 후보의 근거 48.94% 때문에 NEEDS_REVIEW로 정지했고, 화면에서 관측 대조 사유를 기록한 후 분석을 재개했다. 여섯 Agent가 완료됐으며 재분석 포함 10개 Task가 남았다. 별도 대응 승인 후 가상 지표 검증, Report, Skill 초안, 후기·재발 방지 저장과 CLOSED까지 완료했다.
- **Hermes 실제 호출:** 공식 Hermes → 설정된 OpenAI `gpt-4.1-mini`, API 응답 모델명 `hermes-agent`. 실제 검색 2,816ms, 실제 초안 생성 2,705ms/3,666 tokens. 초안 `SKL-4a0739a8-8987-43`은 ‘최근 7일’을 ‘향후 7일’로 잘못 생성해 **관리자 검토에서 거부**했다. 이는 자동 의미 검증으로 탐지한 것이 아니다. REJECTED/NOT_EXPORTED를 확인했고 공식 `/v1/skills`와 파일 저장소에도 없었다. 검토한 DEMO Skill은 승인 후 파일/카탈로그에 게시됐다. 이전 실제 Hermes 생성·승인 Skill도 클라우드 카탈로그에 유지된다. 자동 생성 성공과 내용 승인 성공을 구분한다. 초안 수정·재생성 UI는 아직 지원하지 않는다.
- **배포된 BFF:** 인증 없는 요청 401, Secure/HttpOnly/SameSite=strict 쿠키, 로그아웃 후 401, SSE Last-Event-ID 118→119 이어받기, 유효한 PDF/Excel 다운로드를 확인했다. `evidence/vercel-cloud.json`.
- **실제 Jev 50건 클라우드 평가:** `EVAL-24846a5d-36b8-48`, COMPLETED, 47/50(94%). 유형/심각도/부서 각각 50/50, 재발 47/50, 검토 0, fallback 0. 고정 가상 분류 평가이며 Hermes 생성 품질이나 지속 부하의 점수가 아니다. 이전 PC 결과와 별도 보관: `evidence/railway-jevos-evaluation.json`.
- **재시작 보존:** 활성 장애·평가가 없는 상태에서 Railway backend/Neo4j/Hermes를 재시작했다. Supabase read-only SQL로 장애 205, Skill 25, Agent Task 38, 이벤트 203, 감사 165건의 동일 수량을 확인했다. 신규 DEMO/REAL의 CLOSED 상세·후기·승인 증적, 승인 Skill 23건, graph 52/80이 유지됐고 Hermes 게시 파일 SHA-256과 카탈로그도 동일했다. 초기 시드 200건은 보존됐다. 브라우저 새로고침 후 다시 연결됐다. `evidence/cloud-end-to-end.json`.
- **정리:** 진단용 Neo4j 시작 명령과 healthcheck를 정상값으로 복원하고 실패 재시도 3회로 되돌렸다. 임시 Railway SSH 키는 계정에서 해제하고 로컬 키 파일도 제거했다. 유료 요금제로 전환하지 않았다.

현재 환경은 실제 클라우드 **기능 시연 검증을 통과한 Trial 구성**이다. 0.5GB 영구 Free 운영, 지속/동시 부하, 고가용성, SSO, 운영 보안 인증 또는 공식 A2A/MCP 적합성 인증을 의미하지 않는다. TypeSafe 실제 호출은 키가 없어 검증하지 않았으며 향후 설정 가능한 Provider 계약 테스트만 포함한다. 최종 발표 전에 요금제·자원 확인과 부하 리허설을 수행한다.

## 사용자·관리자 매뉴얼 및 화면 사용성 검증 (2026-10-10)

- 사용자/관리자 각 8개 장을 `frontend/content/manuals.json`에서 웹 화면·인쇄용 HTML·저장소 Markdown으로 생성한다. `npm run manuals:check`로 산출물 일치를 검사한다. 별도 사용자 권한이 구현됐다고 설명하지 않는다.
- 전체화면 dialog, 독립 온톨로지 메뉴, 장애 선택과 영향 필터, 노드 설명, 메뉴별 목적과 상태별 다음 행동, 필터 초기화, 저장하지 않은 후기의 종료 차단, 실패 평가 오류 표시를 보완했다. 자세한 항목은 `USABILITY_REVIEW.md`에 기록했다.
- Next.js production build·TypeScript 검사·Chromium UI 테스트 **6개**가 통과했다. 1440×960 데스크톱과 390×844 모바일, 전체화면/최초 자동 맞춤/수동 맞춤/영향 필터/Esc/포커스 복귀, 역할별 매뉴얼, 실패 표시, 필터 초기화, 저장 후 종료 순서를 검사한다. API fixture를 사용한 격리 테스트이며 실제 AI 품질 평가와 구분한다.
- 최초 배포의 실제 브라우저 검증에서 닫힌 dialog의 0 크기가 초기 그래프 배율에 사용되는 문제를 발견했다. 수동 맞춤 버튼을 누르기 **전**의 노드 위치·크기 검사를 추가해 수정 전 실패를 재현했고, dialog를 `useLayoutEffect`에서 먼저 연 후 측정하도록 수정해 통과했다. 런타임 최종 수정 커밋은 `d5bde391bcdcfabfffecfff022289ef3b77d6cbe`다.
- 이번 UI 검증에서는 기존 종료 장애를 읽어서 그래프를 확인했다. 사용자가 진행 중인 장애의 승인·수정·종료나 DB 초기화·백엔드 재시작은 수행하지 않았다.
- 최종 커밋의 [verify](https://github.com/namonamho88-ui/s-care/actions/runs/38057458996)와 [container verification](https://github.com/namonamho88-ui/s-care/actions/runs/38057459000)가 모두 성공했다. Vercel `57wZPqpTdz5mxa4KDasAW8sR2dBq` Ready 및 실제 시연 주소의 52/80 전체화면 자동 맞춤·14/13 영향 필터·노드 정보·Esc·포커스 복귀·역할별 매뉴얼을 확인했다. 인쇄용 HTML 두 파일은 HTTP 200과 원본 SHA-256 일치를 확인했다. `evidence/usability-cloud.json`.


## 개인 계정·권한 분리 (2026-10-11)

- Flyway V5가 app_users/app_sessions를 추가한다. 기존 장애·시드 마이그레이션은 변경하지 않았다. ADMIN/USER, 담당자별 후기 수정, 일반 사용자용 Excel의 감사 시트 제외, 개인 행위자 감사 기록을 적용했다.
- 24시간/1회용 초대, PBKDF2 비밀번호 해시, 8시간 서버 세션, 5회 실패 잠금, 재발급·비활성화·비밀번호 변경·로그아웃 후 세션 폐기를 실제 HTTP/SQL로 검증했다.
- 로컬 Java 21/H2 백엔드 44개 테스트 전부 통과(건너뜀 없음). 실제 Python Hermes Skill bridge 검증은 기존 전용 가상환경의 aiohttp로 실행했다. 새로운 모델 추론 정확도 측정은 하지 않았다.
- 프론트엔드 단위 12개, UI 12개, Next.js production build 통과. 계정 UI 외에도 전체화면 그래프, 매뉴얼, 등록 실패 안내, 후기 초안 저장 회귀를 포함한다.
- 별도 로컬 Spring Boot + 실제 Next.js BFF로 HttpOnly/SameSite 쿠키, 초대 1회 사용, 직접 API 권한 거부, 로그아웃/비활성화 검증을 통과했다. 이 결과는 클라우드 배포 결과와 구분한다.
- 컨테이너 CI에 동일 BFF 계정 검증을 추가했다. 해당 검증 계정은 종료 후 비활성화하고 기존 장애는 변경하지 않는다. 최신 클라우드/CI 결과는 후속 증적을 참조한다.
- `948ae28`의 GitHub verify `38062182738`와 container verification `38062182610` 모두 성공했다. 실제 PostgreSQL/Neo4j, 컨테이너 장애 전체 DEMO·재시작 보존·계정 BFF 검증, 공식 AI 이미지 기동을 포함한다.
- Vercel `CzdLYmeNyA9uhq8pHZkWfU6roRG1`과 Railway backend `dd5efc19-c99a-4ac1-99c7-dc41b33fa2de` 배포 성공. 공개 주소에서 초대 활성화, 로그인, Secure/HttpOnly/SameSite 쿠키, 권한 거부, 로그아웃·계정 비활성화 후 접근 거부를 실제 검증했다. 검증 계정 `USR-c73eeffe-1029-4d`는 비활성 상태로 남겨 감사 이력을 보존한다.
- 배포 전후 전체 장애 목록의 SHA-256이 동일하며 207건과 판단 확인 대기 기록이 보존됐다. 운영 중인 장애의 승인·후기·종료를 테스트 목적으로 변경하지 않았다. `evidence/accounts-cloud.json`에 원문 비밀 없이 결과를 저장했다.
- 배포 화면의 개인 로그인/초대 활성화/관리자 초기 설정 탭, 계정 관리 안내와 비활성 검증 계정 표시를 확인했다. 첫 방문의 정상적인 미인증 응답이 세션 만료 경고로 표시되지 않도록 보완하고 UI 회귀 테스트를 추가했다.

- 첫 방문 경고 보완 `f42e5ff`도 Vercel `CSdhN13DsZiNNs4bysu3SpNCzRv8` Ready 및 GitHub verify `38062604841` / container verification `38062604846` 성공을 확인했다. 새 배포 URL의 첫 로그인에서 불필요한 세션 만료 경고 0건을 확인했다. 백엔드는 변경 없이 위 배포를 유지했다.
