"""Generate the standalone Dify Cloud import file from reviewable node sources."""
import argparse
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent


class Dumper(yaml.SafeDumper):
    pass


def represent_string(dumper, value):
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style='|' if '\n' in value else None)


Dumper.add_representer(str, represent_string)


def build():
    nodes, edges = [], []
    def node(id, kind, title, x, y, **data):
        nodes.append({'id': id, 'type': 'custom', 'position': {'x': x, 'y': y}, 'positionAbsolute': {'x': x, 'y': y},
                      'width': 244, 'height': 120, 'sourcePosition': 'right', 'targetPosition': 'left', 'selected': False,
                      'data': {'type': kind, 'title': title, 'desc': '', 'selected': False, **data}})
    def code(id, title, source, variables, outputs, x, y):
        node(id, 'code', title, x, y, code_language='python3', code=(ROOT/'nodes'/source).read_text(encoding='utf-8'),
             variables=[{'variable': name, 'value_selector': selector} for name, selector in variables.items()],
             outputs={name: {'type': kind, 'children': None} for name, kind in outputs.items()})
    def edge(source, target, handle='source'):
        types = {n['id']: n['data']['type'] for n in nodes}
        edges.append({'id': f'{source}-{handle}-{target}', 'type': 'custom', 'source': source, 'sourceHandle': handle,
                      'target': target, 'targetHandle': 'target', 'zIndex': 0,
                      'data': {'sourceType': types[source], 'targetType': types[target], 'isInIteration': False, 'isInLoop': False}})
    def http(id, title, method, path, x, y, body):
        node(id, 'http-request', title, x, y, method=method, url='{{#110.hermes_url#}}'+path,
             authorization={'type': 'api-key', 'config': {'type': 'bearer', 'api_key': '{{#env.HERMES_API_KEY#}}'}},
             headers='Content-Type: application/json', params='', body=body, ssl_verify=True,
             timeout={'connect': 5, 'read': 60 if method=='post' else 5, 'write': 5},
             retry_config={'retry_enabled': False, 'max_retries': 0, 'retry_interval': 1000})
    node('100', 'start', '입력 · 가상 장애 지식 요청', 0, 260, variables=[
        {'variable': 'mode', 'label': '실행 모드', 'type': 'select', 'options': ['DEMO','REAL'], 'default': 'DEMO', 'required': True},
        {'variable': 'operation', 'label': 'search = 승인 지식 선택 / draft = Skill 초안', 'type': 'select', 'options': ['search','draft'], 'default': 'search', 'required': True},
        {'variable': 'context_json', 'label': '가상 장애 context JSON', 'type': 'paragraph', 'max_length': 65536, 'required': True, 'options': []},
    ])
    code('110','입력 검증 · 승인 지식만 전달','prepare.py',
         {'context_json':['100','context_json'],'operation':['100','operation'],'mode':['100','mode'],
          'hermes_url':['env','HERMES_BASE_URL'],'hermes_model':['env','HERMES_MODEL']},
         {'context_json':'string','operation':'string','mode':'string','hermes_url':'string','hermes_model':'string','started_at':'number'},310,260)
    node('120','if-else','REAL / DEMO 분기',620,260,cases=[{'case_id':'true','id':'true','logical_operator':'and','conditions':[
        {'id':'real-mode','varType':'string','variable_selector':['110','mode'],'comparison_operator':'is','value':'REAL'}]}])
    code('130','DEMO · Hermes·LLM 호출 없는 고정 지식','mock.py',
         {'context_json':['110','context_json'],'operation':['110','operation'],'started_at':['110','started_at']},{'result_json':'string'},930,530)
    node('140','end','시뮬레이션 결과 반환',1240,530,outputs=[{'variable':'result_json','value_selector':['130','result_json'],'value_type':'string'}])
    http('200','Hermes 도구 비활성 확인','get','/toolsets',930,100,{'type':'none','data':[]})
    code('210','도구 차단 검증 · 프롬프트 구성','request.py',
         {'status_code':['200','status_code'],'body':['200','body'],'context_json':['110','context_json'],
          'operation':['110','operation'],'model':['110','hermes_model']},{'request_body':'string'},1240,100)
    http('220','Hermes · 설정된 LLM 호출','post','/chat/completions',1550,100,
         {'type':'json','data':[{'key':'','type':'text','value':'{{#210.request_body#}}'}]})
    code('230','응답 검증 · 허용 ID와 출처 확인','validate.py',
         {'status_code':['220','status_code'],'body':['220','body'],'context_json':['110','context_json'],
          'operation':['110','operation'],'started_at':['110','started_at']},{'result_json':'string'},1860,100)
    node('240','end','실제 응답 반환 · DB 승인과 별개',2170,100,outputs=[{'variable':'result_json','value_selector':['230','result_json'],'value_type':'string'}])
    for source,target,handle in [('100','110','source'),('110','120','source'),('120','130','false'),('130','140','source'),
                                 ('120','200','true'),('200','210','source'),('210','220','source'),('220','230','source'),('230','240','source')]:
        edge(source,target,handle)
    env=[{'id':'aab7ecaf-40da-4fa3-b117-00000000000'+str(i),'name':name,'value':value,'value_type':kind,'description':description,'selector':['env',name]}
         for i,(name,value,kind,description) in enumerate([
             ('HERMES_BASE_URL','https://your-hermes-api.example.invalid/v1','string','REAL 전용: Dify Cloud에서 접근 가능한 전용 Hermes HTTPS /v1 주소. 끝 슬래시 제외.'),
             ('HERMES_API_KEY','','secret','REAL 전용: Hermes API 서버 인증 키. OpenAI 키/관리자 토큰을 입력하지 마세요.'),
             ('HERMES_MODEL','hermes-agent','string','Hermes API 요청 모델 별칭. 실제 내부 LLM은 Hermes 서버 설정을 따릅니다.')],1)]
    return {'app':{'name':'S-CARE · Dify × Hermes 지식 워크플로','description':'가상 장애의 승인 지식 선택과 Skill 초안. DEMO/REAL 분리. 기존 Spring Boot 승인·저장·Harness와 분리된 선택형 연동 템플릿.',
                   'icon':'🧠','icon_background':'#D5F5F6','mode':'workflow','use_icon_as_answer_icon':False},
            'dependencies':[],'kind':'app','version':'0.7.0','workflow':{'conversation_variables':[],'environment_variables':env,
            'features':{'file_upload':{'enabled':False},'opening_statement':'','retriever_resource':{'enabled':False},'sensitive_word_avoidance':{'enabled':False},
                        'speech_to_text':{'enabled':False},'suggested_questions':[],'suggested_questions_after_answer':{'enabled':False},'text_to_speech':{'enabled':False}},
            'graph':{'nodes':nodes,'edges':edges,'viewport':{'x':20,'y':80,'zoom':0.6}}}}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    rendered=yaml.dump(build(),Dumper=Dumper,allow_unicode=True,sort_keys=False,width=110)
    target=ROOT/'s-care-hermes-knowledge.yml'
    if args.check:
        assert target.read_text(encoding='utf-8')==rendered,'Regenerate DSL after changing node source'
        print('DSL matches node sources.')
    else:
        target.write_text(rendered,encoding='utf-8');print(target.name)
