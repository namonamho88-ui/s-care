"""Versioned fictional Korean benchmark. Never rewrites the original V2 seed.
60 distinct technical observations, 20 boundary observations, 20 SMS variants.
SMS variants are reported as families, NOT 20 independent failure mechanisms.
Labels/rationales are held outside model input. No training or tuning on scores.
"""
from pathlib import Path
import json, hashlib
ROOT=Path(__file__).resolve().parents[1]
CASES={
'RESOURCE':[
'동시 처리 수가 증가하면서 실행 대기열이 240개로 늘었다. 처리기 사용률은 98%이고 디스크 대기는 1%이다.',
'힙 점유가 수거 직후에도 97%에 머물며 새 객체를 만들지 못하고 프로세스가 종료되었다.',
'프로세스의 열린 파일 수가 65535에 도달했다. 새 소켓 생성 시 Too many open files가 기록된다.',
'임시 파일 영역의 남은 공간은 0바이트이다. 로그 파일 쓰기가 실패하지만 거래 연결은 정상이다.',
'저장 공간은 40% 남았지만 inode 사용량이 100%라 신규 파일을 만들지 못한다.',
'컨테이너 메모리 제한 2GiB를 넘긴 직후 종료 코드 137과 OOMKilled가 함께 기록됐다.',
'전체 처리기는 여유가 있지만 해당 컨테이너의 CPU throttling 비율이 92%이고 quota에 도달했다.',
'수거 시간이 전체 실행 시간의 88%이며 old 영역은 수거 후에도 99%이다.',
'스레드 4096개가 모두 사용 중이고 새 스레드를 생성할 수 없다는 시스템 오류가 관측된다.',
'스왑 입출력이 초당 2GB이고 가용 메모리는 10MB이다. 애플리케이션 예외는 없다.',
'공유 메모리 세그먼트 할당 한도에 도달하여 배치 프로세스가 시작되지 않는다.',
'단일 호스트의 파일시스템 읽기 지연이 4초이며 장치 큐가 300개다. 다른 호스트는 정상이다.'
],
'DATABASE':[
'조회 세션 120개가 동일한 미완료 거래의 행 잠금 해제를 기다리고 있다.',
'대기 그래프에서 두 거래가 서로 가진 행을 요청한다. 희생 거래에 ORA-00060이 남았다.',
'응용 서버는 살아 있지만 모든 연결이 반납되지 않아 풀의 대기 요청이 900개로 증가했다.',
'복제본 적용 지연이 7200초이며 쓰기 원본에는 최신 거래가 존재한다.',
'조회 실행계획이 인덱스 탐색에서 전체 스캔으로 바뀐 뒤 처리시간이 200배 늘었다.',
'아카이브 로그 저장 영역이 가득 차서 새 거래 커밋이 대기 중이다.',
'테이블스페이스 확장이 한도에 도달했고 INSERT에서 ORA-01653이 발생한다.',
'기본 키 중복으로 ORA-00001이 발생했다. 동일 거래번호가 두 번 들어왔고 최초 데이터는 존재한다.',
'읽기 전용 복제본으로 쓰기가 전달되어 read-only transaction 오류가 반복된다.',
'주 인스턴스의 연결 상한 300개가 모두 점유되어 신규 세션이 거절된다.',
'실행 중인 스키마 변경이 배타 잠금을 유지하며 모든 조회가 relation lock을 기다린다.',
'체크포인트마다 WAL 동기화 대기가 급증한다. 네트워크 왕복시간은 기존과 같다.'
],
'NETWORK':[
'서로 다른 세 호스트에서 동일 도메인을 조회하면 NXDOMAIN이 돌아오지만 IP 직접 접속은 성공한다.',
'경계 라우터 변경 직후 특정 대역으로 가는 경로가 사라졌다. 로컬 거래는 정상이다.',
'동일 구간 패킷 손실률이 18%이며 재전송 횟수가 급증했다. 목적지 프로세스는 정상이다.',
'이름 서버 응답이 5초 넘게 지연되지만 캐시된 주소를 쓰는 요청은 성공한다.',
'TLS 협상에서 인증서 만료 오류가 발생한다. 서버 시각과 인증서 만료일이 일치한다.',
'방화벽 규칙 변경 후 8443 포트의 SYN이 모두 폐기된다. 443 포트는 연결된다.',
'외부 연결 NAT 포트가 소진되어 신규 연결만 실패한다. 기존 연결은 유지된다.',
'1500바이트 이하 요청은 성공하나 큰 응답은 멈춘다. 경로 MTU 1280이고 관련 ICMP가 차단된다.',
'부하분산기에 오래된 목적지 주소만 등록돼 제거된 서버로 요청이 전달된다.',
'동일 주소를 두 장비가 광고하면서 ARP 테이블이 초당 수십 회 바뀐다.',
'요청은 도착하지만 반환 경로가 다른 방화벽을 지나며 세션 불일치로 폐기된다.',
'한 회선에서 CRC 오류가 누적되고 링크가 10초 간격으로 내려갔다 올라온다.'
],
'APPLICATION':[
'새 버전 배포 직후 날짜 문자열 처리에서 NullPointerException이 발생한다. 이전 버전 요청은 성공한다.',
'동일한 금액을 입력하면 계산 결과가 음수가 된다. 조회와 연결 상태는 정상이다.',
'변경된 요청 필드명을 이전 이름으로 읽어 모든 예약 등록을 필수값 누락으로 거절한다.',
'계좌번호 앞자리 0이 직렬화 과정에서 사라져 특정 고객 요청만 유효성 검사에 실패한다.',
'배치 코드에서 종료 조건이 반대로 적용돼 동일한 10건을 계속 반복 처리한다.',
'캐시 키에서 통화코드가 빠져 다른 통화의 환율이 반환된다. 원본 값은 정상이다.',
'빈 목록을 받으면 첫 원소를 무조건 읽어 IndexOutOfBoundsException이 발생한다.',
'업무 설정의 최대 건수가 0으로 저장된 뒤 모든 업로드가 제한 초과로 거절된다.',
'배포 산출물에 필요한 라이브러리가 빠져 ClassNotFoundException으로 시작이 실패한다.',
'지역 시간을 UTC로 다시 해석하여 예약이 9시간 늦게 실행된다. 장비 시각은 정확하다.',
'메시지를 처리한 뒤 확인 응답을 보내지 않아 같은 거래가 반복 소비된다.',
'할인 분기에서 소수점 반올림을 두 번 적용해 청구 금액이 1원씩 어긋난다.'
],
'SECURITY':[
'등록되지 않은 해외 주소가 1분에 400개 계정으로 로그인하며 동일 암호를 반복 시도한다.',
'퇴사 처리된 가상 계정의 비활성화 이후에도 기존 세션으로 관리자 페이지 접근이 관측된다.',
'서명 검증에 실패한 토큰으로 권한 변경 API를 호출하는 요청이 여러 주소에서 들어온다.',
'일반 계정이 다른 가상 고객의 식별자를 바꾸자 조회 결과가 노출된다.',
'허용되지 않은 실행 파일이 서비스 계정으로 시작됐고 외부 주소에 지속 연결한다.',
'감사 설정 변경 권한이 없는 계정이 감사 수집을 중지했다는 변경 이력이 발견된다.',
'애플리케이션 입력에 UNION SELECT 구문이 집중되고 방어 규칙이 차단 이벤트를 기록한다.',
'밤새 대량 다운로드가 발생했으며 업무 승인 없는 가상 관리자 계정이 사용됐다.',
'다중 인증을 통과하지 않은 세션으로 관리자 권한이 발급되는 요청이 재현된다.',
'폐기된 API 키가 여전히 인증에 성공하며 최근 사용 기록도 남는다.',
'공개 저장 영역에 가상 비밀 설정 파일이 올라가 누구나 내려받을 수 있다.',
'허용된 문서 경로 밖의 파일을 요청했을 때 서버 설정 내용이 응답에 포함된다.'
]}
BOUNDARY=[
'사용자가 느리다고 연락했으나 시각과 거래 번호가 없다.',
'오류율 알림만 수신했다. 거래 건수와 실패 종류는 아직 수집하지 못했다.',
'CPU 사용률은 15%이며 메모리 여유도 충분하다. 화면 오류의 구체적인 응답은 미확인이다.',
'패킷 손실은 없고 DNS도 정상이다. 한 고객의 화면만 멈췄다고 한다.',
'데이터베이스 연결은 정상이다. 원인 로그가 없어 다른 계층 확인이 필요하다.',
'HTTP 500과 접속 지연이 동시에 증가했다. 서버와 회선 지표는 수집 중이다.',
'배치가 늦었지만 아직 종료 기한 전이다. 정상 지연인지 확인하지 못했다.',
'서버 경보와 업무 오류가 같은 시각에 발생했다. 시계가 서로 20분 어긋나 있다.',
'보안 차단 건수가 늘었으나 예정된 모의 훈련인지 확인이 안 된다.',
'디스크 대기와 행 잠금이 동시에 증가했다. 어느 쪽이 먼저인지 기록이 없다.',
'메모리 부족과 인증 실패가 같이 발생했지만 서로 다른 서버의 값이다.',
'이전 배포부터 느렸다는 설명과 오늘부터 느렸다는 설명이 충돌한다.',
'실패 1건, 성공 0건으로 오류율 100%가 표시된다. 평소 거래량과 고객 영향은 미확인이다.',
'로그에는 타임아웃이 있지만 재시도 성공 여부와 최종 처리 결과가 없다.',
'5분 전 복구됐다는 연락이 왔지만 검증 결과가 없고 경보는 계속 들어온다.',
'수신한 문자에는 이전 날짜만 있어 현재 장애인지 알 수 없다.',
'동일 코드가 세 번 나타났지만 첫 두 건은 정상 거절이고 마지막 건의 의미는 미확인이다.',
'연결 풀 대기와 라우터 패킷 폐기가 동시에 증가했다. 양쪽 원인을 분리할 추가 관측이 필요하다.',
'행 잠금 경합과 인증 토큰 유출 징후가 함께 확인됐다. 하나의 원인으로 단정할 수 없다.',
'메모리 제한 초과와 배포 후 필드 누락이 함께 재현된다. 단일 담당 부서로 확정할 수 없다.'
]
def generate():
 rows=[]
 for type_,texts in CASES.items():
  for text in texts:
   rows.append(dict(category='TECHNICAL_KO',raw_message=None,observations=text,expected_type=type_,expected_department='PLATFORM' if type_=='RESOURCE' else type_,expected_severity=None,expected_recurrence=None,expected_review=False,expected_eligible=True,rationale='관측된 고장 계층의 담당 부서를 평가한다. 고객 영향·과거 이력은 주어지지 않아 심각도·재발은 채점하지 않는다.'))
 for text in BOUNDARY:
  rows.append(dict(category='AMBIGUOUS_KO',raw_message=None,observations=text,expected_type=None,expected_department=None,expected_severity=None,expected_recurrence=None,expected_review=True,expected_eligible=True,rationale='부정 관측·증거 부족·상충 또는 다중 원인으로 사람 검토가 필요하다. 특정 유형을 강요하지 않는다.'))
 for n in range(20):
  if n<12:
   status=['ABEND','DELAY_END','END_OK'][n%3]
   tail='MUST BE END BY 11:00!' if status=='DELAY_END' else f'2026-10-08 10:{n:02}:00'
   raw=f'[Web발신]\n[운영]{status}: DEMO_BATCH_{n:03} 가상정산{n} 20261008 {tail}'
   eligible=status!='END_OK'
  else:
   total,errors,threshold=[(46,44,95),(1,1,95),(1000,970,90),(100,10,20),(500,25,5),(10,9,80),(200,199,95),(80,0,5)][n-12]
   rate=round(errors/total*100,2);eligible=rate>threshold
   raw=f'[Web발신]\n[가상카드] TMS 온라인 비즈니스오류 임계치 초과 알림\n▶ IF아이디 : [DEMO_IF_{n:03}]\n▶ IF명 : [[개인]가상예약조회]\n▶ 업무코드 : [DEMO]\n▶ 서비스코드 : [DEMO_SERVICE]\n▶ 거래일자 : [20261008]\n▶ 거래시간 : [1550~1650](1시간)\n▶ 오류율임계치 : [{threshold}]%\n▶ 현재거래건수 : [{total}]\n▶ 현재오류건수 : [{errors}]\n▶ 현재오류율 : [{rate}]%\n▶ 메시지 발생일시 : [2026-10-08 17:{n:02}:12]'
  rows.append(dict(category='SMS_BATCH' if n<12 else 'SMS_TMS',raw_message=raw,observations='',expected_type=None,expected_department=None,expected_severity=None,expected_recurrence=None,expected_review=eligible,expected_eligible=eligible,rationale='실제 문자 파서 경로의 등록 여부를 평가한다. 알림만으로 원인·심각도·재발을 확정하지 않는다.'))
 assert len(rows)==100
 # Independently authored impact/history contexts; no single marker maps to a label.
 contexts=json.loads((ROOT/'scripts/evaluation_contexts.json').read_text(encoding='utf-8'))
 assert len(set(contexts['P1']+contexts['P2']))==40
 assert len(set(contexts['RECURRING']+contexts['NEW']))==30
 for n,row in enumerate(rows[:60]):
  if n%3==0:row['observations']+=' '+contexts['P1'][n//3];row['expected_severity']='P1'
  if n%3==1:row['observations']+=' '+contexts['P2'][n//3];row['expected_severity']='P2'
  if n%4==0:row['observations']+=' '+contexts['RECURRING'][n//4];row['expected_recurrence']=True
  if n%4==1:row['observations']+=' '+contexts['NEW'][n//4];row['expected_recurrence']=False
 for n,row in enumerate(rows):row['id']=f'KO-{n+1:03}';row['dataset_version']='ko-incident-v2'
 assert len({row['raw_message'] or row['observations'] for row in rows})==100
 return rows
def q(x):
 if x is None:return 'NULL'
 if isinstance(x,bool):return str(x).upper()
 return "'"+str(x).replace("'","''")+"'"
if __name__=='__main__':
 rows=generate();fields=['id','dataset_version','category','raw_message','observations','expected_type','expected_severity','expected_department','expected_recurrence','expected_review','expected_eligible','rationale']
 (ROOT/'backend/src/main/resources/db/migration/V10__evaluation_context_diversity.sql').write_text('\n'.join('UPDATE evaluation_cases SET '+','.join(f+'='+q(r[f]) for f in fields if f!='id')+' WHERE id='+q(r['id'])+';' for r in rows)+'\n',encoding='utf-8')
 (ROOT/'docs/evaluation-dataset.json').write_text(json.dumps({'version':'ko-incident-v2','fictional':True,'technicalObservations':60,'boundaryObservations':20,'smsVariants':20,'independentSmsFailureFamilies':4,'limitation':'수작업 가상 기준이며 전문가 독립 라벨링·운영 데이터 외부 검증 전입니다. 분류·검토 점수와 원인 규명 능력은 다릅니다.','cases':rows},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print('Generated 100 cases: 60 technical + 20 boundary + 20 SMS variants')
