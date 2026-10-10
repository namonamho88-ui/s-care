"""Backend smoke test against an already running fictional demo environment."""
import argparse,json,os,time,urllib.request
p=argparse.ArgumentParser()
p.add_argument('--url',default='http://127.0.0.1:8080')
p.add_argument('--mode',choices=['DEMO','REAL'],default='DEMO')
p.add_argument('--provider',choices=['LOCAL','TYPESAFE'],default='LOCAL')
p.add_argument('--output',default='work/smoke-result.json')
args=p.parse_args()
token=os.getenv('ADMIN_TOKEN','local-demo-admin-change-me')
def api(path,body=None):
    req=urllib.request.Request(args.url+'/api'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=40) as r:return json.load(r)
created=api('/simulate',{'scenarioId':'SCN-01','mode':args.mode,'provider':args.provider})
id=created['id'];deadline=time.monotonic()+120
while time.monotonic()<deadline:
    d=api('/incidents/'+id)
    if d['status'] in ('WAITING_APPROVAL','NEEDS_REVIEW','FAILED'):break
    time.sleep(.4)
else:raise SystemExit('Analysis timeout')
if d['status']=='NEEDS_REVIEW':raise SystemExit('Human review required. Continue this incident in the UI: '+id)
assert d['status']=='WAITING_APPROVAL',d
if args.mode=='REAL':assert d['decision']['provider'] in ('LOCAL_JEV','TYPESAFE_JEV'), 'Real smoke unexpectedly used Mock fallback'
api('/incidents/'+id+'/approval',{'approved':True,'reason':'자동 통합 시연 테스트: 가상 자산과 조치 계획을 확인했습니다.'})
deadline=time.monotonic()+90
while time.monotonic()<deadline:
    d=api('/incidents/'+id)
    if d['status'] in ('RESOLVED','FAILED'):break
    time.sleep(.4)
assert d['status']=='RESOLVED',d
assert len(d['tasks'])==6
assert d['report']
api('/incidents/'+id+'/close',{})
from pathlib import Path
out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(api('/incidents/'+id),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'id':id,'provider':d['decision']['provider'],'model':d['decision']['model'],'graph':d['impact']['engine'],'status':'CLOSED','output':str(out)},ensure_ascii=False))
