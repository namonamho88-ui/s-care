# Provider 및 프로토콜 계약

## Jev

참고: [TypeSafe Quickstart](https://docs.typesafe.ai/introduction/quickstart), [jevos 소스](https://github.com/feder-cr/jev), [jevos-v4 릴리스](https://github.com/feder-cr/jev/releases/tag/jevos-v4).

`JevDecisionProvider.decide(observations)`를 세 Provider가 구현한다. HTTP Provider는 JSON `state`, `model: jev-latest`, `questions`를 `/v1/systemone`에 전달한다. `type`, `severity`, `department`는 choice, `recurrence`, `evidence`는 noul이다. TypeSafe는 Bearer 키 필수, Local jevos는 서버에 키가 설정된 경우에만 필요하다.

응답의 choice/confidence/noul과 반환 model명을 파싱한다. UI 신뢰도는 세 choice confidence의 최솟값이다. 근거 충분도는 evidence noul이다. 두 지표 중 하나가 0.65 미만이면 NEEDS_REVIEW이다. Jev가 인과 설명을 제공한다고 주장하지 않으며 관측, 선택 확률과 확인 기록을 증적으로 제공한다.

`JevDecision`에는 분류, 심각도, 우선순위, 부서, 재발, confidence, evidenceScore, provider, model, latencyMs, simulated, fallback, fallbackReason, needsReview, evidence, answers가 저장된다. Local 통신/HTTP 실패는 2회 후 MOCK_FALLBACK, malformed 응답은 담당자 확인, TypeSafe 실패는 FAILED다. DEMO는 외부 요청을 하지 않는다.

## A2A 0.3.0 동기 JSON-RPC 프로필

[공식 규격](https://a2a-protocol.org/v0.3.0/specification/)에 맞춘 필드/메서드를 사용한다.

- Agent Card: `GET /agents/{incident|diagnosis|knowledge|impact|recovery|report}/.well-known/agent-card.json`
- RPC endpoint: `POST /a2a/{agent}`
- `message/send`: Harness는 `configuration.blocking=true`를 지정한다. user Message의 DataPart에 `incidentId` 전달, Task + Artifact 반환.
- `tasks/get`: 저장한 Task 조회.
- `tasks/cancel`: 동기 처리된 terminal task에 TaskNotCancelable 오류 반환.
- messageId 재전송은 동일 Task를 반환한다. 다른 incident에 동일 ID를 재사용하면 거부한다.
- streaming/pushNotifications는 Card에서 false다. 대시보드 SSE는 애플리케이션 이벤트이며 A2A streaming으로 표시하지 않는다.
- 작업의 working/completed/failed, 요청/응답, 감사 증적을 PostgreSQL에 저장한다.

```json
{"jsonrpc":"2.0","id":"request-1","method":"message/send","params":{"configuration":{"blocking":true},"message":{"kind":"message","messageId":"unique-message-id","role":"user","parts":[{"kind":"data","data":{"incidentId":"INC-..."}}]}}}
```

## MCP 2025-03-26 stateless HTTP 프로필

`POST /mcp`, Bearer 인증, JSON-RPC 2.0. initialize / ping / tools/list / tools/call / notifications를 처리한다. GET SSE는 지원하지 않아 405를 반환한다. Origin 기반 브라우저 호출은 BFF를 통하며, 내부 Harness는 인증된 HTTP 클라이언트다.

| 도구 | 권한 |
|---|---|
| incident_lookup | 가상 장애 읽기 |
| skill_search | 승인된 자체 Skill 읽기 |
| apply_simulated_recovery | 승인 기록 + RECOVERING 상태 필수; 가상 지표만 DB 수정 |
| verify_simulated_recovery | 승인 기록 + 실제 저장 지표의 오류율/지연/의존성 조건 확인 |

그 외 이름은 allowlist에서 거부하고 감사 기록을 남긴다. 실제 OS/서버 명령 도구가 없다. Harness의 복구 단계는 이 MCP HTTP 인터페이스를 호출한다.

## Nous Research Hermes Agent

공식 [API 서버 문서](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/)와 [소스](https://github.com/NousResearch/hermes-agent)를 사용한다.
고정 commit: `a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed`.

- Spring Boot `HttpHermesAdapter` → `http://127.0.0.1:8642/v1/chat/completions`, Bearer `HERMES_API_KEY` (= Hermes `API_SERVER_KEY`).
- 요청은 `model: hermes-agent`, `messages`, `stream: false`. Hermes는 전용 설정의 OpenAI 모델을 호출한다. 응답의 `model`은 API alias인 `hermes-agent`이며, 기본 upstream 모델은 `gpt-4.1-mini`다.
- 호출 전 `/v1/toolsets`를 조회해 실행 도구가 비활성화되었는지 검사한다. 전용 home은 `platform_toolsets.api_server: []`, `mcp_servers: {}`를 사용한다.
- 지식 검색에는 가상 관측, 승인 Skill, 매뉴얼, 유사 종료 이력을 전달한다. 반환 Skill/매뉴얼 ID가 전달한 승인 목록에 없거나 응답이 잘못되면 채택하지 않는다.
- REAL 실패는 `MOCK_HERMES_FALLBACK`과 원인을 저장한다. DEMO는 `MOCK_HERMES`로 외부 호출 없이 실행한다. Mock 결과를 실제 Hermes 결과로 표시하지 않는다.
- 복구 후 네 필드의 Skill 초안을 생성한다. HTTP 추론 이후 DB 트랜잭션에서 DRAFT와 Provider/model/simulated/usage/latency를 저장한다.
- 승인 후 전용 skills 폴더에 `incident-brain-<skill-id>/SKILL.md`를 게시한다. PostgreSQL이 승인 상태의 원본이다. 파일 게시 실패는 `export_status=FAILED`로 구별하며 `/api/hermes/sync`로 재시도한다.
- 공식 `/v1/skills`에서 게시 결과를 조회해 실제 파일 인식을 검증한다. API 서버 연결만으로 LLM 검증 완료를 표시하지 않는다.
- 고정 upstream commit의 `/v1/skills`에는 `_find_all_skills()`에 없는 `include_editorial` 인자를 넘기는 오류가 있었다. 재현된 HTTP 500을 해결하는 단일 호출 호환성 패치를 설치 스크립트에 포함했다. 도구 권한·인증은 변경하지 않는다.

## REST 주요 API

`/api/health`와 Agent Card를 제외한 API는 `Authorization: Bearer <ADMIN_TOKEN>`이 필요하다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | /api/config, /api/catalog, /api/graph | 실행 상태, 시드 목록, 그래프 |
| GET | /api/dashboard, /api/incidents | type/system/from/to 필터 및 집계 |
| POST | /api/simulate | scenarioId/mode/provider로 시연 시작 |
| POST | /api/incidents | title/assetId/observations/ownerId/mode/provider로 직접 등록 |
| GET/PATCH | /api/incidents/{id} | 상세/후기/담당자 수정 |
| GET | /api/incidents/{id}/events | SSE, cursor 또는 Last-Event-ID 재생 |
| POST | /api/incidents/{id}/review | 분류/심각도/부서/근거 확인 |
| POST | /api/incidents/{id}/approval | approved boolean 및 reason |
| POST | /api/incidents/{id}/retry, /close | 실패 재시도 / 검증 완료 장애 종료 |
| GET | /api/incidents/{id}/report/pdf, /xlsx | 실제 생성 파일 다운로드 |
| GET | /api/skills, /api/audit, /api/evaluations | 저장 기록 조회 |
| POST | /api/skills/{id}/review | APPROVED 또는 REJECTED |
| POST | /api/hermes/sync?limit=5&after= | 승인 Skill만 최대 5개씩 게시/재시도; hasMore/nextCursor 반환 |
| POST | /api/evaluations | 50건 비동기 평가 시작; 조회 API로 진행 확인 |

## 배포 환경 전환 시 추가 계약

`HERMES_PUBLISH_MODE=filesystem|http|disabled`로 승인 Skill 게시 방식을 선택한다. `http`는 이 프로젝트의 `scripts/hermes_skill_bridge.py`와 통신하며 **공식 Hermes API가 아니다**. PUT `/skills/{id}`에 별도 HERMES_PUBLISH_KEY Bearer 인증과 `approved=true`, `fictional=true`, `markdown`, `sha256`를 보낸다. 응답의 EXPORTED/skillId/sha256가 모두 일치해야 게시 완료로 기록한다. 오류 시 DB 승인 상태는 유지하고 export_status=FAILED로 재시도 가능하게 남긴다. 공식 Hermes 카탈로그 인식은 `/v1/skills`에서 별도로 확인한다.

Vercel용 SSE는 서버에서 최대 240초 후 정상 종료하며 DB event ID 기반 Last-Event-ID 재접속을 지원한다. 내부 A2A/MCP 주소는 PORT를 따르고 외부 Agent Card 주소는 AGENT_BASE_URL로 분리한다. 배포 설정/볼륨/DB 이전 절차는 [DEPLOYMENT.md](DEPLOYMENT.md)를 따른다.

Skill 동기화는 `limit` 1~5, 마지막 처리 ID `after`를 받는다. `results`에 각 Skill의 EXPORTED/FAILED가 기록되며 `hasMore=true`일 때 `nextCursor`를 다음 요청의 `after`로 전달한다. API 한 번을 호출한 것만으로 전체 동기화가 완료됐다고 간주하지 않는다. 실패 항목은 승인 상태를 유지하며, 전체 동기화를 다시 실행해 안전하게 재게시할 수 있다.
