# 3D 워룸 검증 기록

2026-10-30, Windows 개발 환경. GitHub `origin/main`의 `0d4bccb`를 기준으로 `feat/digital-twin-war-room`에서 구현했다. 모든 시험은 합성 데이터로 수행했다.

## 실행 결과

| 검증 | 결과 | 검증 경계 |
| --- | --- | --- |
| Backend `mvnw.cmd -q package` | 171 통과, 2 제외, 실패 0 | H2 PostgreSQL 호환 모드, 실제 HTTP/WebSocket 포함 |
| Frontend `npm run build` | 성공 | Next 16.4.3 production build, 신규 route 포함 |
| Frontend `npm run typecheck` | 성공 | TypeScript |
| Frontend `npm run test:unit` | 61 통과 | 기존 BFF·인증·도메인 회귀 |
| Frontend `npm run test:ui` | 78 통과, 1 제외 | Chromium; 실제 서버 시험은 별도 opt-in |
| `scripts/verify-war-room-live.ps1` | 1 통과 | 실제 Next BFF + Spring + H2, 독립 브라우저 context 3개 |
| `npm run manuals:check` | 성공 | 기존 매뉴얼 산출물 유지 |
| 의존성 감사 | 패치 설치 후 취약점 0건 | 기존 Next 16.4.0의 critical 발견 후 16.4.3으로 패치 |

백엔드 워룸 시험은 다음 계약을 확인한다.

- 실제 WebSocket 20개 접속, 21번째 거부, 다른 방 격리.
- 두 클라이언트의 채팅·이동·역할 상태 공유, 게스트 토큰으로 기존 사건 API 접근 차단.
- 세 시나리오의 기존 엔진 계산, 승인 전 상태 확정 차단, 승인 후 DRAFT 지식 저장과 중복 방지.
- 일회용 ticket 재사용 거부, 잘못된 이동/이벤트 거부, 장비 충돌, 세션 만료.
- gateway 없는 입장과 외부 Origin 거부, BOOTSTRAP의 시연 제어 거부.
- 접속 중인 게스트에게 큰 비교 결과·승인·지식 상태 전달.
- 만료되어 비어 있는 방의 용량 반환.

별도 실제 브라우저 시험은 게스트 2명과 개인 ACCOUNT ADMIN 1명의 동일 방 입장, HttpOnly/SameSite 쿠키, 게스트의 민감 API 및 승인 차단, 채팅, 시나리오 시작 → 분석 → 전략 → 비교 → 승인 요청 → 사유 입력 승인 → 지식 초안 공유를 확인했다. 새로고침 후 동일 게스트 ID 및 완료 미션 복원도 확인했다. 관리자 초기 설정 토큰은 초대 발급에만 사용하고 워룸 제어는 403인 것을 확인했다.

데스크톱/모바일 폭의 실제 WebGL 장면과 패널을 PNG로 렌더링하여 확인했다. 모바일 검증은 Chromium viewport이며 실제 스마트폰이 아니다. WebGL 미지원 시 기존 보기 링크도 검증했다. 로컬 이미지 `work/war-room-desktop.png`, `work/war-room-mobile.png`, `work/war-room-live.png`는 검토용이며 저장소에는 포함하지 않는다.

## 검증 중 발견한 문제

- Spring 공용 스케줄러와의 경합으로 WebSocket 상태 전달이 지연되어 전용 broadcast executor로 분리했다. 비활성화 시에는 주기 작업을 시작하지 않는다.
- 신규 접속 직후 오래된 연결 목록으로 소켓을 종료할 수 있었던 경합을 현재 연결별 검증으로 수정했다.
- 초기 로컬 브라우저 시험의 5초 UI 대기는 시작 요청의 HTTP 완료 전에 실패했다. 요청 응답을 명시적으로 기다리고 200 응답과 공유 상태를 모두 검사하도록 수정한 후 통과했다. 실기기 지연 성능을 보장하는 결과는 아니다.
- 기존 `BrainIntegrationTest.competingQueueClaimSkipsLockedJob`이 중간 전체 실행에서 한 번 실패했다. 이후 전체 실행에서는 통과했다. 해당 기존 큐 코드와 테스트는 변경하지 않았다.
- 기존 UI 시험의 오래된 문구 기대값 한 곳을 현재 화면의 합성 검증 안내 문구로 수정했다. 해당 제품 문구는 변경하지 않았다.

## 재현

```powershell
cd backend
.\mvnw.cmd -q package
cd ../frontend
npm ci
npm run build
npm run test:unit
npm run test:ui
cd ..
.\scripts\verify-war-room-live.ps1
```

실제 연동 스크립트는 8087/3100 포트가 비어 있는지 확인한다. 임시 난수 토큰과 메모리 H2를 사용하고, cloud 프로필·외부 그래프 필수 연결·Skill 게시를 끈다. 테스트 종료 시 해당 Java 프로세스와 환경변수를 정리한다. 기존 DB와 운영 설정을 사용하지 않는다.

## 미검증 및 후속 범위

Vercel/Railway 배포와 운영 환경변수 변경은 수행하지 않았다. 실제 PostgreSQL/Neo4j·Docker, REAL Jev/Hermes 호출, 서로 다른 물리 기기/네트워크, 모바일 FPS·발열·메모리, Railway 비용은 이 검증의 범위 밖이다. 백엔드 선택 시험 중 performance benchmark와 외부 Hermes bridge 시험은 별도 환경이 필요하다.

배치 시나리오는 기존 `QUEUE_FAILURE`의 대리 모델이며 파일 parser 구현이 아니다. 원본 사건은 관리자 지정 매핑과 인증 상세 링크까지만 제공한다. 원본 사건 변경 및 온톨로지 자산의 자동 3D 동기화는 미구현이다. 교육 기여도는 확인 횟수이며 분석 정확도나 인사 평가 점수를 산출하지 않는다. 방 상태 서버의 수평 확장도 지원하지 않는다. 자세한 계약은 [구현 문서](war-room.md)를 따른다.
