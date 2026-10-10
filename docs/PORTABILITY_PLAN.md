# 로컬 개발 · 최종 클라우드 시연 계획

현재 PC의 PostgreSQL/Neo4j/Local Jev/공식 Hermes 실행과 기존 데이터를 유지한다. 최종 시연 목표는 Vercel + Supabase + Railway다. GitHub 소스를 먼저 게시하고 사용자의 기존 프로젝트를 확인해 연결한다. 계정 정보가 확보되기 전에도 코드·설정·테스트 준비를 진행하며 실제 배포 검증과 구별해 기록한다.

1. 연결 주소, 동적 포트, DB 연결 풀과 Neo4j 데이터베이스를 환경변수로 분리한다.
2. Supabase에서는 전용 `brain` schema와 JDBC를 사용한다. 브라우저가 DB에 직접 접근하지 않으며 기존 Spring API/승인 정책을 유지한다.
3. Hermes Skill 게시는 로컬 파일 또는 인증된 HTTP 전송을 선택한다. 원본은 PostgreSQL이며 승인 전 게시 금지를 유지한다. 별도 서비스 사이에 공유 디스크가 없어도 동작해야 한다.
4. Vercel BFF의 실행 시간 안에 SSE를 종료하고, DB event ID로 재접속하여 진행 상황을 복원한다.
5. 서비스별 배포 설정 예제, 로컬 실행 정보, 데이터 이전·복구 절차를 문서화한다. 백엔드는 단일 인스턴스로 실행하며 실행 중 배포는 작업을 FAILED로 기록하고 명시적 재시도를 요구한다.
6. Java/Python 계약 테스트, PostgreSQL 전용 schema·다른 포트 시연, 프론트엔드 빌드로 검증한다. 실제 Vercel/Supabase/Railway 배포 검증은 별도로 남긴다.
