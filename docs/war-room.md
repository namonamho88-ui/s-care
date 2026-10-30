# S-CARE 3D 워룸: 구현 및 운영 계약

## 소스 분석 (2026-10-30)

GitHub `namonamho88-ui/s-care`의 실제 소스를 복제하여 `feat/digital-twin-war-room`에서 개발했다.

| 확인 항목 | 기존 구현 및 재사용 근거 |
| --- | --- |
| 디지털 트윈 메뉴 | `frontend/components/twin-lab.tsx`, `app/twin-lab.css`: React Flow, 8개 단계, 저장 실험, 자동 데모, 평가. 화면 유지, 3D 진입 링크 추가 |
| 모델 · 저장 | `TwinEngine`, `TwinLab`, `TwinController`, V14/V15: 13개 합성 노드, 의존성, 결정론적 복구 계산, optimistic version 검사, `twin_runs` 문서 |
| 장애 접수 · 승인 | `ApiController`, `Harness`, `RecoveryPlans`, `IncidentLifecycle`: `/incidents`, `/simulate`, `/{id}/review`, `/approval`, `/retry`, `/recovery-evidence`, `/close`. 워룸은 이 승인 경로를 대체하지 않음 |
| AI 역할 | `TwinAgents`: Jev 원인·영향 후보, Hermes 전략 제안, 로컬 정책/시뮬레이션/평가. DEMO는 `RULE_BASELINE`, 외부 AI 호출 없음. 존재하지 않는 6개 독립 LLM을 만들지 않음 |
| 장애 작업 | `agent_tasks`, `events`, `DurableQueue`: 별도 장애 파이프라인의 실제 작업. 워룸 캐릭터는 Twin API의 작업을 나타냄 |
| 온톨로지 | `Ontology`: SQL `assets/dependencies`, Neo4j `DEPENDS_ON`, 최대 깊이 6, 명시적 SQL fallback. Twin 모델의 노드 ID와 업무 자산 ID는 다름. 자동 동일시 금지 |
| 인증 · 게스트 | `SecurityFilter`, `Access`, `AccountService`; HttpOnly BFF 쿠키. 기존 `DemoAccess`는 격리 환경의 DEMO_ADMIN이므로 공개 워룸에 재사용하지 않음 |
| DB · 배포 | `application-cloud.yml`: Supabase JDBC, private `brain` schema, Data API 미사용. Vercel Next BFF → Railway Spring. 기존 단일 backend instance 규칙 유지 |
| 테스트 | H2 통합/단위, Playwright UI, frontend 단위 테스트, CI PostgreSQL/Neo4j 및 Docker 별도 검증 |

## 전달 범위

`/war-room`에서 계정 없이 입장하며 기존 디지털 트윈 메뉴와 로그인 화면에서 접근한다. 모델은 외부 에셋 없이 코드로 제작한 컷어웨이 4층 건물, 서버랙·상태등·회의 테이블·AI 콘솔·사람과 구별되는 AI 캐릭터다. R3F는 별도 페이지와 동적 청크로 로딩한다. 서버 스냅샷으로 상태 색상과 의존성 연결선을 갱신한다.

방 이름으로 공동 접속, 서버 생성 UUID/자동 닉네임, 층 이동, WASD/방향키, 카메라 조작, 터치 조이스틱, 역할, 채팅, 노드 확인 횟수를 제공한다. 역할은 연습용이며 권한에 관여하지 않는다. 동일 닉네임이어도 UUID로 구분한다. 인증된 개인 ACCOUNT ADMIN만 시연을 제어한다. BOOTSTRAP은 계정 발급에만 사용하고, DEMO_ADMIN도 워룸 제어에서 제외한다.

복구 절차: 진행자 장애 주입 → 실제 Twin 분석 API → 전략 생성 → 독립 복구안 비교 → 승인 요청 → 관리자 사유 입력/승인 → 계산 결과 확정. 기본 DEMO는 규칙 모델이고, 진행자가 REAL을 선택하면 기존 Jev/Hermes 설정으로 실행한다. 실패한 모델 응답은 기존 엔진의 RULE_FALLBACK 및 이유를 표시한다. 비교는 승인 전 가상 미리 계산이며 현재 장애 스냅샷을 변경하지 않는다. 기존 엔진은 승인 시 검증된 `after`를 확정하므로 별도의 복구 명령을 추가하지 않았다. 부분 복구는 정상화 성공으로 표시하지 않는다. 검증 기록은 서버의 기존 `KnowledgeCases.create`를 통해 검색 비공개 DRAFT로 저장하고 기존 지식 관리에서 검토한다. 초안 ID를 방에 저장해 중복 요청을 방지하며 모든 참여자가 완료 상태를 공유한다.

시나리오: DB 연결 장애(`DB_CONNECTION`), API 지연(`API_LATENCY`), 배치 파일 처리 오류의 **큐 실패 대리 모델**(`QUEUE_FAILURE`). 배치 파일 parser/재처리 엔진은 기존 소스에 없으며 구현된 것으로 표시하지 않는다. 배치 파일 내용 수준 시뮬레이션은 후속 범위다.

기존 사건 연결은 관리자가 사건 ID와 3D 노드를 명시적으로 매핑한다. 원본 사건의 상세·로그·AI 판단·온톨로지는 기존 인증 화면으로 연결된다. 게스트에 사건 데이터 자체를 전송하지 않으며, 이 버전의 공유 3D 상태는 **독립 합성 실험**이다. 원본 사건 변경을 공개 방에 자동 반영하는 기능이나 자산 ID의 자동 온톨로지 매핑은 제공하지 않는다.

## 통신 선택과 경계

Socket.IO와 Colyseus는 별도 Node 서버 또는 비공식 Java 호환 레이어가 필요하다. 현재 Spring 3.5.7·단일 인스턴스·20명 목표에서는 Spring의 원시 WebSocket으로 방 관리와 서버 검증을 구현했다. Socket.IO 프로토콜과 호환되지 않는다.

- 입장: Next `POST /api/war-session` → gateway secret으로 Spring `/api/war-room/guest`. 계정 쿠키/관리자 토큰을 전달하지 않는다.
- 게스트 resume secret: 256-bit SecureRandom, 서버에는 SHA-256 키로 저장, 브라우저에는 HttpOnly/SameSite=Strict 쿠키. 로그인 세션과 이름/경로 분리.
- WS: 브라우저 → Railway `/api/war-room/socket` 직접 접속. Vercel에 WS proxy를 맡기지 않는다. 20초·일회용 입장 ticket을 첫 메시지에 전달하며 URL에 넣지 않는다.
- 신뢰 Origin 정확 일치, 5초 입장 제한, 1KB inbound 메시지, 25 events/s, 이동 10Hz(최대 3 units/s), 240자/초 채팅, 좌표 대신 방향 입력만 허용.
- 충돌은 층 외곽, 장비 구역, 회의 테이블, 콘솔, 다른 아바타의 서버 원형 충돌로 판정한다. 렌더링 모델과 충돌 구역은 보수적으로 설정되어 있다.
- 방 정원 20명, 서버 최대 8개 활성 방/160 게스트, 최대 180개 소켓. 채팅 최근 60개. 전송 버퍼 상한 256KB, 느린 클라이언트 종료.
- 변한 위치만 최대 10Hz로 broadcast, 실험 결과는 revision 변경 시 전송. 클라이언트 보간과 모바일 DPR=1/그림자 off.
- ping 15초, 무응답 45초 해제, 세션 절대 만료 1시간, 끊긴 세션 재접속 유예 2분. 동시에 같은 세션으로 여러 탭을 열면 두 번째 연결 거부.
- `V16__war_rooms.sql`은 방과 실험/사건/지식 초안 연결을 저장. 위치·채팅·게스트·교육 시간·기여 기록은 메모리이며 재시작 시 초기화된다. 저장된 실험/사건 매핑과 초안 ID는 복구된다.

공개 guest endpoint가 account principal을 만들지 않는다. `SecurityFilter`에서 정확한 guest/socket 경로만 인증 전 통과시키고, 입장은 별도 gateway 검증, 소켓은 일회용 ticket 검증을 수행한다. guest token으로 `/incidents`, `/twin`, `/skills`, `/mcp` 등 접근 불가. 관리자 승인 요청은 기존 BFF 계정 쿠키와 Spring 인증을 통과한다.

## 배포 설정

기본 비활성화. 기존 Vercel/Railway의 운영 설정이나 데이터를 이 작업에서 수정하지 않는다.

Railway backend:

```dotenv
WAR_ROOM_ENABLED=true
WAR_ROOM_GATEWAY_KEY=<새로운 32자 이상 무작위 비밀>
WAR_ROOM_ALLOWED_ORIGINS=https://s-care-mu.vercel.app
```

Vercel frontend (서버 전용; NEXT_PUBLIC 사용 금지):

```dotenv
WAR_ROOM_ENABLED=true
WAR_ROOM_GATEWAY_KEY=<동일 비밀>
WAR_ROOM_WS_URL=wss://<Railway backend 도메인>/api/war-room/socket
BACKEND_URL=https://<Railway backend 도메인>
```

실제 domain은 설정에서 확인해야 하며 문서의 placeholder로 배포하지 않는다. preview Origin을 허용하려면 명시적 Origin 목록에 추가한다. 와일드카드 불가. 환경변수 적용 후 프론트/백엔드 재배포와 V16 migration, 관리자 계정 로그인, 서로 다른 브라우저/기기의 입장, 승인 없는 결과 변경 차단을 검증한다. 끄려면 양쪽 `WAR_ROOM_ENABLED=false` 후 backend 재시작하여 소켓을 종료한다. 기존 보기와 기존 데이터는 유지된다.

## 비용·성능 한계

항상 연결된 WebSocket은 Railway 절전/scale-to-zero 효과를 제한할 수 있다. Redis/별도 실시간 서비스를 추가하지 않았으나 기존 Spring JVM의 heap/CPU/egress를 공유한다. 여전히 단일 인스턴스만 지원하며 수평 확장 전 방 저장소·pubsub·sticky routing을 별도 설계해야 한다.

20명 모두 이동할 때는 10Hz × 20 recipients × presence payload만큼 outbound가 증가한다. 이는 산식이며 실측 비용이나 보장 성능이 아니다. 배포 후 Railway CPU/메모리/egress와 PC·실기기 모바일의 FPS·프레임 지연·브라우저 메모리를 측정해야 한다. 로컬 20개 socket 검증은 20개 실제 스마트폰의 성능 검증을 대신하지 않는다.

## 참고한 공식 문서

- [R3F 설치/React 버전 호환](https://r3f.docs.pmnd.rs/getting-started/installation): React 19에는 R3F 9.
- [Spring WebSocket 서버](https://docs.spring.io/spring-framework/reference/6.2/web/websocket/server.html): Origin 제한과 동시 전송 decorator.
- [Socket.IO 소개](https://socket.io/docs/v4/): raw WebSocket과 별개 프로토콜.
- Next.js 16.4 설치본의 `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, `03-api-reference/03-file-conventions/route.md`를 확인했다. 개발 중 기존 16.4.0의 npm 보안 감사가 critical을 보고하여 같은 마이너의 16.4.3으로 패치하고 재검증했다. 패치 설치 후 npm 감사는 취약점 0건이었다.

검증 결과와 미검증 환경은 `docs/war-room-validation.md`에 별도로 기록한다.
