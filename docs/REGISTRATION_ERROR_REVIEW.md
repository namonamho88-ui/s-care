# 장애 등록 중 표시된 통신 오류 — 2026-10-10

## 확인된 사실

- Railway HTTP 로그에서 23:05:25 KST `POST /api/incidents`는 **200, 2,122ms**, 23:06:13 `POST /api/incidents/INC-60e304df-469f-49/review`는 **200, 1,558ms**였다.
- 해당 장애는 PostgreSQL에 저장됐으며 실제 Local Jev 판단, 담당자 분류 검토, Ontology, Agent 및 Hermes 검색이 실행됐다. 이후 Harness의 근거 부족·분류/원인 후보 불일치로 `NEEDS_REVIEW`가 됐다. 이는 서버 오류 상태가 아니다.
- Vercel 로그의 23:06:22 KST **GET 502 세 건**은 `/api/dashboard`, `/api/incidents`, `/api/incidents/INC-60e304df-469f-49`다. 대시보드 요청의 함수 실행 시간은 39ms, 응답 완료는 235ms였다.
- 같은 구간 Railway backend의 HTTP 5xx 및 error 레벨 로그는 조회되지 않았고, 점검 시 health=UP, PostgreSQL/Neo4j/Hermes 연결이 정상 응답했다. backend를 재시작하지 않았다.
- 프론트 BFF는 fetch 예외를 모두 ‘백엔드 연결 실패. Spring Boot 실행 상태를 확인하세요.’라는 문구로 변환하고 원래 예외를 기록하지 않았다. 따라서 **조회 구간의 일시적인 통신 실패**는 확인했으나 당시 TCP/DNS/요청 취소 중 어느 원인인지는 확정할 수 없다. Spring Boot 프로세스 중단이나 등록 실패로 단정하지 않는다.

## 보완

1. GET/HEAD 전송 예외에만 한 번 재시도한다. POST/PATCH는 서버에 반영됐을 가능성이 있으므로 자동 재전송하지 않는다. 이미 받은 HTTP 오류 응답, 취소된 요청, 응답 본문 스트림 오류를 무조건 재시도하지 않는다.
2. 통신 실패 안내를 조회와 처리 결과 미확인으로 구분한다. 변경 요청 응답을 받지 못하면 중복 요청 전 이력·현재 상태 확인을 안내한다.
3. 처리 성공 후 후속 조회 실패를 별도 메시지로 표시하고 등록 성공 알림을 추가했다. 자동 새로고침·상세 조회·실시간 갱신의 오류도 문맥을 구분한다.
4. 실패·재시도 로그에는 요청 추적 ID, 메서드, 고정 리소스명, 허용된 전송 오류 코드와 시도 횟수만 기록한다. 토큰·본문·전체 URL·임의 예외 메시지는 기록하지 않는다.

## 검증

- `npm run test:proxy`: **7개 통과**. 실제 테스트 HTTP 서버가 연결을 끊는 상황의 GET 재시도, 2회 제한, POST/PATCH 미재전송, HTTP 오류 유지, 취소 처리, SSE 스트림 유지, 비밀 로그 방지를 검사했다.
- `npm run build`: 성공.
- `npm run test:ui`: **8개 통과**. 기존 6개 사용성 검사에 등록 성공 후 조회 실패 구분, 응답 미확인 시 제목·관측 입력 보존 및 중복 등록 방지 검사를 추가했다.
- 테스트는 격리된 가상 데이터/서버를 사용했다. 사용자가 등록한 장애의 판단·승인·조치 이력은 변경하지 않았다.

## 후속: 조치 후기의 원본 JSON 표시

사용자가 `SIMULATED_METRICS` 복구 검증 JSON이 조치 후기 칸에 그대로 나타난다고 보고했다. 백엔드는 자동 복구 시 이 검증 결과를 기본 notes로 저장하고 있었다.

- 인식 가능한 가상 검증 결과만 오류율·응답시간·의존 시스템 상태를 포함한 한국어 초안으로 표시한다. `realChanges=false`를 명시하며 근본 원인이나 수행하지 않은 조치를 만들어내지 않는다.
- 기존 운영자가 작성한 후기, 알 수 없는 JSON/Provider, 불완전한 지표는 변환하지 않는다. 검증 실패는 실패로 표시한다.
- 초안은 관리자가 검토·편집하고 **수정 내용 저장**을 눌러 기존 PATCH API로 저장한다. 저장 전 종료는 차단하며, 보고서는 저장된 후기로 생성된다는 안내를 표시한다.
- **복구 검증 원본 보기**에서 구조화된 원문을 확인할 수 있다. 후기를 저장해도 VERIFY 이벤트의 원문 증적은 유지된다. 기존 DB 기록을 일괄 덮어쓰거나 사용자의 진행 중 작업을 승인하지 않았다.
- 후속 검증: 단위 테스트 **12개**(통신 7 + 후기 변환 5), UI 테스트 **9개**, production build 통과. UI에는 실제 PATCH 저장·초안 검토·원본 보존 검사를 추가했다.

## 배포 확인

최종 코드 `d2c803b73197565c109beafbdc622598c8bbcd23`의 [verify](https://github.com/namonamho88-ui/s-care/actions/runs/38059604901) 및 [container verification](https://github.com/namonamho88-ui/s-care/actions/runs/38059604771)가 모두 성공했다. Vercel `A5p3doKUN3Rrg3hi61JTjtVBooSJ` Ready를 확인했다.

인증된 BFF에서 health/config/dashboard와 기존 두 장애 상세가 HTTP 200으로 응답했다. 배포 화면에서 사용자의 복구 완료 장애 `INC-2cfd8fe7-c77c-48`를 조회해 한국어 초안, 원본 펼치기, 저장 전 종료 차단을 확인했다. 화면 검증 중 후기 저장·승인·종료 요청은 보내지 않았다. 증적은 `evidence/incident-feedback.json`이다.
