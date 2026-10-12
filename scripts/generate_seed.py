"""Legacy DEMO regression fixtures, NOT a model-quality benchmark.
For Korean model evaluation use generate_evaluation.py; keep deployed V2/V3 immutable.
Reproducible fictional dataset: seed 300; no clock/network inputs.
"""
from pathlib import Path
from datetime import datetime, timedelta
import random
r=random.Random(300)
sql=[]
def insert(table,*values):
    def q(v):
        if v is None:return 'NULL'
        if isinstance(v,bool):return str(v).upper()
        if isinstance(v,int):return str(v)
        return "'"+str(v).replace("'","''")+"'"
    sql.append('INSERT INTO '+table+' VALUES ('+','.join(map(q,values))+');')
types=['RESOURCE','DATABASE','NETWORK','APPLICATION','SECURITY']
depts=['PLATFORM','DATABASE','NETWORK','APPLICATION','SECURITY']
symptoms=['CPU utilization 96%, memory exhaustion and process queue saturation','Database connection pool exhausted; database lock timeout on queries','Packet loss 12%, DNS resolution timeout, gateway unreachable','HTTP 500 exceptions after application deployment; regression confirmed','Unusual authentication failure spike; suspicious access attempts blocked']
names=['코어뱅킹','모바일뱅킹','인터넷뱅킹','카드승인','지급결제','대외계','고객정보','여신관리','리스크관리','자금세탁방지','데이터허브','배치운영']
for i in range(15):insert('operators',f'OP-{i+1:02}',f'가상 담당자 {i+1:02}',depts[i%5])
for i,name in enumerate(names):insert('assets',f'SYS-{i+1:02}','가상 '+name,'SYSTEM',None,f'OP-{i%15+1:02}','CRITICAL' if i<6 else 'STANDARD')
for i in range(40):
    kind=['API','SERVER','DATABASE','BATCH'][i%4]
    insert('assets',f'CMP-{i+1:02}',names[i%12]+f' {kind}-{i+1:02}',kind,f'SYS-{i%12+1:02}',f'OP-{i%15+1:02}','CRITICAL' if i%12<6 else 'STANDARD')
edges={(f'SYS-{i%12+1:02}',f'CMP-{i+1:02}') for i in range(40)}
while len(edges)<80:
    a,b=r.sample(range(40),2)
    edges.add((f'CMP-{a+1:02}',f'CMP-{b+1:02}'))
for a,b in sorted(edges):insert('dependencies',a,b)
base=datetime(2026,10,1)
for i in range(30):insert('manuals',f'MAN-{i+1:02}',types[i%5],f'{types[i%5]} 가상 대응 매뉴얼 {i+1:02}','관측 로그 확인 → 영향 범위 확인 → 승인 요청 → 가상 조치 → 검증')
for i in range(20):insert('skills',f'SKL-{i+1:02}',types[i%5],f'{types[i%5]} 복구 절차 {i+1:02}','APPROVED',symptoms[i%5],'관측 지표·의존성·승인 증적을 확인한다.','승인된 시연에서 가상 지표를 정상화하고 오류율을 재측정한다.','가상 자산에만 적용. 실제 운영 명령은 실행하지 않는다.',None,'seed-admin',base)
scenarios=[]
for i in range(50):
    recurrence=i%3==0
    severity='P1' if i%2==0 else 'P2'
    obs=symptoms[i%5]+('; customer outage, service unavailable' if severity=='P1' else '; degraded performance, service still available')+('; repeated signature in last 7 days' if recurrence else '; first occurrence')
    scenario=(f'SCN-{i+1:02}',f'CMP-{i%40+1:02}',f'가상 {names[i%40%12]} · {types[i%5]}',obs,types[i%5],severity,depts[i%5],recurrence)
    scenarios.append(scenario);insert('scenarios',*scenario)
for i in range(200):
    sc=scenarios[i%50];at=base-timedelta(hours=(200-i)*9)
    import json
    decision=json.dumps({'type':sc[4],'severity':sc[5],'department':sc[6],'recurrence':sc[7],'provider':'SEED','confidence':0.94},ensure_ascii=False)
    report=json.dumps({'summary':'고정 시드 가상 장애 이력. 복구 검증 완료.','fictional':True},ensure_ascii=False)
    insert('incidents',f'INC-SEED-{i+1:03}',sc[2],sc[1],sc[0],f'OP-{i%5+1:02}',sc[4],sc[5],'CLOSED','DEMO','MOCK',sc[3],decision,None,report,'가상 복구 후 정상 지표 확인','반복 장애 알림과 주간 점검 강화',at,at+timedelta(minutes=12+i%43),0)
Path(__file__).resolve().parents[1].joinpath('backend/src/main/resources/db/migration/V2__seed.sql').write_text('\n'.join(sql)+'\n',encoding='utf-8')
print('Generated fixed seed 300: 12/40/15/200/30/20/80/50')

# Keep V2 immutable for existing databases; normalize provenance through V3.
provenance=[]
for i in range(200):
    sc=scenarios[i%50]
    decision=json.dumps({'type':sc[4],'severity':sc[5],'priority':int(sc[5][1:]),'department':sc[6],
        'recurrence':sc[7],'provider':'SEED','model':'fixed-seed-300','confidence':0,'evidenceScore':0,
        'latencyMs':0,'simulated':True,'fallback':False,'fallbackReason':'','needsReview':False,
        'evidence':['고정 시드로 생성한 가상 이력이며 실제 모델 호출 결과가 아닙니다.'], 'answers':{}},ensure_ascii=False)
    provenance.append("UPDATE incidents SET decision_json='"+decision.replace("'","''")+"' WHERE id='INC-SEED-"+f'{i+1:03}'+"';")
Path(__file__).resolve().parents[1].joinpath('backend/src/main/resources/db/migration/V3__seed_provenance.sql').write_text('\n'.join(provenance)+'\n',encoding='utf-8')
