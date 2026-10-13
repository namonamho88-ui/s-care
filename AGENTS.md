# S-CARE 개발 규칙

- 모든 시스템, 담당자, 관측값과 장애 기록은 가상이다. UI·API·보고서에 표시한다.
- Next.js/React/TypeScript/Tailwind/shadcn, Java Spring Boot, PostgreSQL, Neo4j, React Flow를 사용한다.
- DEMO는 외부 모델을 호출하지 않는다. REAL은 LOCAL_JEV 기본, TYPESAFE_JEV 선택이다.
- Local jevos 통신 실패만 명시적 MOCK_FALLBACK을 허용한다. 저신뢰 응답은 모의 성공으로 숨기지 않고 NEEDS_REVIEW로 전환한다.
- Jev 결과에 요청 Provider, 실제 Provider, 모델, 신뢰도, 소요 시간, fallback 이유, 관측 근거를 기록한다.
- 승인 전 복구는 금지한다. 승인 후에도 가상 지표만 변경한다. shell/SSH/실제 변경 도구를 구현하지 않는다.
- A2A 0.3.0 JSON-RPC 프로필과 MCP 2025-03-26 stateless HTTP 프로필의 범위를 문서화한다.
- 지식 초안은 관리자 검토 후 승인해야 검색된다. 자체 Skill 저장소를 실제 Hermes 연결로 표시하지 않는다.
- Hermes는 Nous Research 공식 Agent의 /v1/chat/completions와 /v1/toolsets를 사용한다. DEMO는 외부 요청 금지, REAL 실패는 MOCK_HERMES_FALLBACK으로 원인을 기록한다.
- Hermes 전용 HERMES_HOME과 빈 api_server toolset을 사용한다. OPENAI_API_KEY는 Hermes에만 전달하며 모델이 반환한 Skill ID는 승인 DB 레코드와 대조한다.
- Skill 생성 HTTP 호출은 DB 트랜잭션 밖에서 수행한다. 관리자 승인 후에만 SKILL.md를 게시하며 게시 실패는 승인 상태와 구별해 재시도한다.
- 원인 후보는 확정 근본 원인으로 표시하지 않는다. 분류 검토가 이후 원인 후보의 검토를 자동으로 면제하지 않도록 검토 대상을 기록한다.
- 트랜잭션, FK, optimistic state transitions, 제한된 재시도, timeout, 감사 로그를 사용한다.
- 장애 강제 종료·논리 삭제는 관리자 사유·번호 확인과 감사 기록을 요구한다. 작업 결과 저장은 같은 장애 행 잠금으로 직렬화하여 중단·삭제 이후 늦은 AI 응답이 상태를 되돌리지 못하게 한다. 복원은 자동 재개가 아니다.
- 정답은 모델 입력과 분리한다. 자동 평가는 실제 점수와 오류를 그대로 저장한다.
- backend ./mvnw test, frontend npm run build와 주요 통합 시연을 검증한다.
- H2 단위/통합 검증, 실제 PostgreSQL/Neo4j 검증, Docker 검증을 구별해 기록한다.
- 비밀, 모델 가중치, 런타임 DB, node_modules와 빌드 산출물은 커밋하지 않는다.
- 개인 계정 권한은 Spring Boot에서 검사한다. USER는 조회·장애 등록·현재 본인 담당 장애의 후기/예방 대책 수정과 본인 수동 지식 초안 작성·편집·승인 요청을 허용한다. 검토·승인·종료·평가·Skill 승인·계정 관리는 ADMIN 전용이다. UI 숨김으로 서버 검사를 대체하지 않는다.
- ADMIN_TOKEN은 초기 설정/복구와 내부 A2A/MCP 통신용이다. 개인 세션·초대 원문을 DB/로그에 저장하지 않는다. 개인 세션은 백엔드 인증 응답을 BFF가 HttpOnly 쿠키로 교환하며 브라우저 응답 JSON에는 반환하지 않는다. 초대 코드는 관리자 발급 응답에서 한 번만 반환한다. 계정 비활성화·재발급·비밀번호 변경 시 세션 폐기와 개인 행위자 감사를 유지한다.
- 로컬 PC는 개발·검증 환경이며 최종 시연은 Vercel·Supabase·Railway에서 실행한다. 환경변수/배포 설정으로 전환하고 실제 클라우드 배포 여부를 로컬 계약 검증과 구분한다.
- 원격 Hermes 게시에는 프로젝트 소유 Skill bridge를 사용한다. 공식 Hermes API로 오인하지 않도록 문서화하고 승인 검증·전용 인증·내용 해시 확인·재시도 가능성을 유지한다.
- cloud 프로필은 전용 brain schema를 사용한다. Supabase Data API 노출이나 브라우저 직접 DB 접근을 추가하지 않는다. 평가 동시 실행 제한 때문에 백엔드 단일 인스턴스 배포를 유지한다. 장애 작업은 DB 큐·임대·결과 저장 차단·완료 단계 재사용으로 재시작 후 이어받되 사람 승인·중단을 우회하지 않는다.

- 신규 모델 평가는 evaluation_cases의 버전별 한국어 데이터로 수행한다. 기존 scenarios 50건은 시연 회귀 전용이며 성능 근거로 쓰지 않는다. Mock 기준선·모델 성공 호출·오류·보류 정책·문자 접수 점수를 분리한다.

- 로그인 없는 시연은 기본 비활성화하며 제한된 DEMO_ADMIN 세션·전용 DB 역할/스키마·Neo4j 영역을 사용한다. 계정 환경의 데이터/토큰을 재사용하지 않는다. 시연 종료·만료는 서버에서 세션을 차단하며 AI DEMO/REAL 설정과 구분한다.
- 수동 지식과 AI 지식은 승인된 항목만 검색한다. 자산/시스템 추천 점수는 규칙 일치 점수이며 모델 확률로 표시하지 않는다.
