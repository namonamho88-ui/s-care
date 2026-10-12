import { test, expect, type Page } from '@playwright/test';

// Isolated UI fixtures. These tests do not call or change cloud incidents/models.
const assets = Array.from({ length: 52 }, (_, i) => ({ id: `ASSET-${i}`, name: `가상 자산 ${i}`, kind: i < 12 ? 'SYSTEM' : ['API', 'SERVER', 'DATABASE', 'BATCH'][i % 4], system_id: i < 12 ? null : `ASSET-${i % 12}` }));
const edges = Array.from({ length: 80 }, (_, i) => ({ source_id: `ASSET-${i % 52}`, target_id: `ASSET-${(i % 52 + (i < 52 ? 1 : 7)) % 52}` }));
const rows = [
  { id: 'INC-UI-RESOLVED', title: '가상 자원 부족 장애', type: 'RESOURCE', status: 'RESOLVED' },
  { id: 'INC-UI-CLOSED', title: '가상 네트워크 장애', type: 'NETWORK', status: 'CLOSED' },
].map(row => ({ ...row, asset_id: 'ASSET-12', asset_name: '가상 자산 12', system_name: '가상 업무', severity: 'P1', owner_id: 'OP-01', owner_name: '가상 담당자', department: 'PLATFORM', created_at: '2026-10-10T12:00:00Z', notes: '저장된 조치 후기', prevention: '저장된 예방 대책', observations: 'Fictional CPU usage 96%', decision: null, tasks: [], events: [], audit: [], impact: { root: 'ASSET-12', affected: ['ASSET-12','ASSET-13','ASSET-14'], engine: 'NEO4J' } }));

async function setup(page: Page, recoveryNotes?: string, role = "ADMIN", initial: Record<string, unknown> = {}, lists: Record<string,any[]> = {}) {
  const records = structuredClone(lists.incidents || rows);
  Object.assign(records[0], initial);
  records[1].owner_id="OP-02";
  if (recoveryNotes !== undefined) Object.assign(records[0], {notes:recoveryNotes,events:[{id:1,stage:'VERIFY',state:'COMPLETED',message:'가상 복구 검증',data_json:recoveryNotes,created_at:'2026-10-10T12:01:00Z'}]});
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data: unknown = {};
    if (request.method() !== 'GET') mutations.push(path);
    if (path === '/api/config') data = { user: { id:'bootstrap-admin', role, kind:role === 'ADMIN' ? 'BOOTSTRAP' : 'ACCOUNT', displayName:'가상 검증 사용자', operatorId:'OP-01' }, database: 'POSTGRESQL', graph: 'NEO4J', defaultProvider: 'LOCAL', a2a: '0.3.0', hermes: { apiReachable: false }, fictional: true };
    else if (path === '/api/catalog') data = { assets, operators: [{ id:'OP-01', name:'가상 담당자', department:'PLATFORM' }], scenarios:[{id:'SCN-01',title:'가상 시나리오'}], manuals:lists.manuals||[] };
    else if (path === '/api/graph') data = { nodes:assets, edges, engine:'NEO4J' };
    else if (path === '/api/skills' || path === '/api/audit') data=lists[path.slice(5)]||[];
    else if (path === '/api/evaluations') data=lists.evaluations||[{id:'EVAL-FAILED',status:'FAILED',mode:'REAL',provider:'LOCAL',created_at:'2026-10-10T12:00:00Z',result_json:JSON.stringify({error:'테스트용 연결 오류'})}];
    else if (path === '/api/incidents') data=records.filter(r => !url.searchParams.get('type') || r.type === url.searchParams.get('type'));
    else if (path === '/api/dashboard') data={total:url.searchParams.get('type') ? 1 : 2,active:0,critical:0,mttrMinutes:12,recurrenceRate:0,byDay:{},byType:{RESOURCE:1,NETWORK:1},bySystem:{},systemStatus:[]};
    else if (path.endsWith('/events')) { await route.fulfill({ contentType:'text/event-stream', body:': heartbeat\n\n' }); return; }
    else if (path.startsWith('/api/incidents/')) {
      const row=records.find(r=>path.includes(r.id));
      if (!row) throw new Error('Unexpected incident in UI test');
      if (request.method()==='PATCH') Object.assign(row,request.postDataJSON());
      if (path.endsWith('/close')) row.status='CLOSED';
      data=row;
    } else throw new Error('Unexpected API path: '+path);
    if(['/api/evaluations','/api/audit'].includes(path)&&url.searchParams.has('page')&&Array.isArray(data)){
      const current=Math.min(Number(url.searchParams.get('page')),Math.max(1,Math.ceil(data.length/10)));
      data={items:data.slice((current-1)*10,current*10),total:data.length,page:current,pageSize:10,running:data.some(r=>r.status==='RUNNING')};
    }
    await route.fulfill({json:data});
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'AI Incident Command Center'})).toBeVisible();
  return mutations;
}

const smsPreview = (normal=false, existing="") => ({ parsed: {kind:'BATCH',status:normal?'END_OK':'ABEND',eligible:!normal,title:'가상 배치 알림',fields:{배치ID:'DEMO_BATCH_001',배치명:'가상정산배치..',발생일시:'2026-10-07 14:57:40'},warnings:['배치명이 생략되어 있습니다. 대상 구성요소를 확인하세요.']},observations:'가상 배치 관측값',existingIncidentId:existing,suggestedAssetId:'',matchReason:'대상 구성요소를 선택해 주세요.'});
test('normal SMS is displayed but cannot register or call incident analysis',async({page})=>{
  const mutations=await setup(page);let previews=0;
  await page.route('**/api/message-intake/preview',async route=>{previews++;await route.fulfill({json:smsPreview(true)});});
  await page.getByRole('button',{name:'문자 붙여넣기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'문자로 장애 등록'});
  await dialog.getByRole('button',{name:'정상 종료 · 등록 제외'}).click();await dialog.getByRole('button',{name:'내용 분석',exact:true}).click();
  await expect(dialog.getByText('END_OK는 정상 종료입니다.',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'등록 & 분석 시작'})).toHaveCount(0);
  expect(previews).toBe(1);expect(mutations).toEqual([]);
});

test('incident history uses ten rows, last page and search reset without mutations',async({page})=>{
  const incidents=Array.from({length:25},(_,i)=>({...rows[0],id:`INC-PAGE-${String(i+1).padStart(3,'0')}`,title:`가상 장애 ${i+1}`}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {incidents});await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  const list=page.getByRole('region',{name:'장애 이력 목록',exact:true}), nav=list.getByRole('navigation').first();
  await expect(list.getByRole('button',{name:/INC-PAGE/})).toHaveCount(10);await expect(nav).toContainText('총 25건 · 1–10건');
  await expect(nav.getByRole('button',{name:'이전 페이지',exact:true})).toBeDisabled();await nav.getByRole('button',{name:'다음 페이지',exact:true}).click();
  await expect(list.getByRole('button',{name:/INC-PAGE-011/})).toBeVisible();await expect(list).toBeFocused();
  await list.getByRole('navigation').last().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(list.getByRole('button',{name:/INC-PAGE/})).toHaveCount(5);await expect(nav).toContainText('21–25건');
  await page.getByLabel('장애 검색').fill('INC-PAGE-025');await expect(list.getByRole('button',{name:/INC-PAGE/})).toHaveCount(1);await expect(nav).toContainText('1/1페이지');
  await page.getByLabel('장애 검색').fill('없는 가상 기록');await expect(list).toContainText('조건에 맞는 장애가 없습니다.');await expect(nav).toContainText('총 0건 · 0–0건');
  await page.getByRole('button',{name:'검색 초기화',exact:true}).click();await expect(list.getByRole('button',{name:/INC-PAGE/})).toHaveCount(10);expect(mutations).toEqual([]);
});
test('skills and manuals have independent ten-item pages on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const skills=Array.from({length:25},(_,i)=>({id:`SKL-PAGE-${i+1}`,title:`가상 Skill ${i+1}`,status:'APPROVED',type:'RESOURCE',simulated:true,conditions:'가상 조건',checks:'점검',solution:'가상 해결',cautions:'주의'}));
  const manuals=Array.from({length:21},(_,i)=>({id:`MAN-PAGE-${i+1}`,title:`가상 매뉴얼 ${i+1}`,procedure_text:'가상 점검 절차'}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {skills,manuals});await page.getByRole('button',{name:'지식 & Skill',exact:true}).click();
  const skillList=page.getByRole('region',{name:'해결 Skill 목록',exact:true}), manualList=page.getByRole('region',{name:'대응 매뉴얼 목록',exact:true});
  await expect(skillList.locator('article')).toHaveCount(10);await expect(manualList.locator('details')).toHaveCount(10);
  await skillList.getByRole('navigation').last().getByRole('button',{name:'다음 페이지',exact:true}).click();await expect(skillList.getByRole('heading',{name:'가상 Skill 11',exact:true})).toBeVisible();
  await expect(skillList).toBeFocused();expect(await skillList.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await manualList.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(manualList.locator('details')).toHaveCount(1);await expect(skillList.getByRole('navigation').first()).toContainText('2/3페이지');
  expect(mutations).toEqual([]);
});
test('Harness pages reach older evaluations and audit logs while running state covers all pages',async({page})=>{
  const evaluations=Array.from({length:35},(_,i)=>({id:`EVAL-PAGE-${i+1}`,status:i===34?'RUNNING':'COMPLETED',mode:'DEMO',provider:`MOCK-PAGE-${i+1}`,created_at:'2026-10-10T12:00:00Z',result_json:'{}'}));
  const audit=Array.from({length:321},(_,i)=>({id:i+1,actor:'가상 감사 주체',action:`PAGE-ACTION-${i+1}`,data_json:'{}',created_at:'2026-10-10T12:00:00Z'}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {evaluations,audit});await page.getByRole('button',{name:'Harness & 평가',exact:true}).click();
  const ev=page.getByRole('region',{name:'Harness 평가 목록',exact:true}), logs=page.getByRole('region',{name:'감사 로그 목록',exact:true});
  await expect(ev.locator('.system')).toHaveCount(10);await expect(logs.locator('tbody tr')).toHaveCount(10);await expect(page.getByRole('button',{name:'Mock 50건 평가',exact:true})).toBeDisabled();
  await ev.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(ev).toContainText('MOCK-PAGE-35');await expect(ev.locator('.system')).toHaveCount(5);
  await logs.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(logs).toContainText('PAGE-ACTION-321');await expect(logs.locator('tbody tr')).toHaveCount(1);
  await expect(ev.getByRole('navigation').first()).toContainText('4/4페이지');expect(mutations).toEqual([]);
});

test('a failed page read retains the successful page and retry loads the requested page',async({page})=>{
  const audit=Array.from({length:21},(_,i)=>({id:i+1,actor:'가상 감사 주체',action:`RETRY-PAGE-${i+1}`,data_json:'{}',created_at:'2026-10-10T12:00:00Z'}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {audit});let failed=false;
  await page.route('**/api/audit?page=2',async route=>{if(failed)return route.fallback();failed=true;await route.fulfill({status:503,json:{error:'가상 페이지 조회 실패'}});});
  await page.getByRole('button',{name:'Harness & 평가',exact:true}).click();const logs=page.getByRole('region',{name:'감사 로그 목록',exact:true});
  await expect(logs.locator('tbody tr')).toHaveCount(10);await logs.getByRole('navigation').first().getByRole('button',{name:'다음 페이지',exact:true}).click();
  await expect(logs.getByRole('alert')).toContainText('가상 페이지 조회 실패');await expect(logs.getByRole('navigation').first()).toContainText('1/3페이지');await expect(logs).toContainText('RETRY-PAGE-1');
  await logs.getByRole('button',{name:'다시 조회',exact:true}).click();await expect(logs.getByRole('navigation').first()).toContainText('2/3페이지');await expect(logs).toContainText('RETRY-PAGE-11');await expect(logs.getByRole('alert')).toHaveCount(0);expect(mutations).toEqual([]);
});
test('SMS requires explicit asset choice and opens the incident stepper after server registration',async({page})=>{
  await setup(page,undefined,'USER',{status:'NEEDS_REVIEW'});let registrations=0;
  await page.route('**/api/message-intake/preview',route=>route.fulfill({json:smsPreview()}));
  await page.route('**/api/message-intake/register',async route=>{registrations++;expect(route.request().postDataJSON()).toMatchObject({assetId:'ASSET-12',mode:'DEMO',provider:'MOCK'});await route.fulfill({json:{id:'INC-UI-RESOLVED',duplicate:false}});});
  await page.getByRole('button',{name:'문자 붙여넣기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'문자로 장애 등록'});
  await dialog.getByRole('button',{name:'배치 비정상 종료',exact:true}).click();await dialog.getByRole('button',{name:'내용 분석',exact:true}).click();
  const submit=dialog.getByRole('button',{name:'등록 & 분석 시작',exact:true});await expect(submit).toBeDisabled();
  await dialog.getByRole('combobox',{name:'대상 구성요소',exact:true}).selectOption('ASSET-12');await dialog.getByRole('combobox',{name:'문자 등록 실행 모드',exact:true}).selectOption('DEMO');await submit.click();
  await expect(dialog).toHaveCount(0);await expect(page.getByRole('dialog',{name:'장애 상세'})).toBeVisible();await expect(page.getByRole('tab',{name:/2\. 분석/})).toHaveAttribute('aria-selected','true');expect(registrations).toBe(1);
});
test('duplicate SMS opens its existing incident without registering again',async({page})=>{
  const mutations=await setup(page);await page.route('**/api/message-intake/preview',route=>route.fulfill({json:smsPreview(false,'INC-UI-RESOLVED')}));
  await page.getByRole('button',{name:'문자 붙여넣기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'문자로 장애 등록'});
  await dialog.getByLabel('수신 문자').fill('가상 중복 문자');await dialog.getByRole('button',{name:'내용 분석',exact:true}).click();
  await expect(dialog.getByText('이미 등록된 문자입니다')).toBeVisible();await dialog.getByRole('button',{name:'기존 장애 열기'}).click();await expect(page.getByRole('dialog',{name:'장애 상세'})).toBeVisible();expect(mutations).toEqual([]);
});
test('mobile SMS preview is readable and editing invalidates a stale result',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await page.route('**/api/message-intake/preview',route=>route.fulfill({json:smsPreview()}));
  const trigger=page.getByRole('button',{name:'문자 붙여넣기',exact:true});await trigger.click();const dialog=page.getByRole('dialog',{name:'문자로 장애 등록'});
  await dialog.getByRole('button',{name:'배치 종료 지연',exact:true}).click();await dialog.getByRole('button',{name:'내용 분석',exact:true}).click();
  await expect(dialog.getByRole('region',{name:'문자 분석 결과'})).toBeVisible();expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.getByLabel('수신 문자').fill('다른 가상 문자');await expect(dialog.getByRole('region',{name:'문자 분석 결과'})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
});
test('SMS request failure retains the message and selected asset with a named pending state',async({page})=>{
  await setup(page);await page.route('**/api/message-intake/preview',route=>route.fulfill({json:smsPreview()}));
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/message-intake/register',async route=>{await gate;await route.fulfill({status:502,json:{error:'가상 서버 응답 실패'}});});
  await page.getByRole('button',{name:'문자 붙여넣기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'문자로 장애 등록'});
  await dialog.getByRole('button',{name:'배치 비정상 종료',exact:true}).click();const text=await dialog.getByLabel('수신 문자').inputValue();await dialog.getByRole('button',{name:'내용 분석',exact:true}).click();
  await dialog.getByRole('combobox',{name:'대상 구성요소',exact:true}).selectOption('ASSET-12');await dialog.getByRole('button',{name:'등록 & 분석 시작',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('관측값과 장애 이력 저장');await page.keyboard.press('Escape');await expect(dialog).toBeVisible();release();
  await expect(dialog.getByRole('alert')).toContainText('가상 서버 응답 실패');await expect(dialog.getByLabel('수신 문자')).toHaveValue(text);await expect(dialog.getByRole('combobox',{name:'대상 구성요소',exact:true})).toHaveValue('ASSET-12');
});

test('fullscreen fills the viewport, fit keeps every node visible, Escape returns focus', async ({page}) => {
  await page.setViewportSize({width:1440,height:960});
  const mutations=await setup(page);
  await page.getByText('운영 현황 펼치기 · 지표 / 온톨로지 / Agent',{exact:true}).click();
  const trigger=page.getByRole('button',{name:'전체화면',exact:true});
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'온톨로지 전체화면'});
  await expect(dialog).toBeVisible();
  await expect.poll(async()=>{const b=await dialog.boundingBox();return b && Math.round(b.width)===1440 && Math.round(b.height)===960;}).toBe(true);
  await expect(dialog.locator('.react-flow__node')).toHaveCount(52);
  // Opening must fit automatically, before the user touches zoom/fit controls.
  // A zero-sized initial viewport used to leave the graph clipped at zoom 0.1.
  await expect.poll(()=>dialog.locator('.react-flow').evaluate(el=>{const box=el.getBoundingClientRect();return [...el.querySelectorAll('.react-flow__node')].every(n=>{const r=n.getBoundingClientRect();return r.width>50&&r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1;});})).toBe(true);
  await dialog.getByRole('button',{name:'그래프 확대',exact:true}).click();
  await dialog.getByRole('button',{name:'전체 맞춤',exact:true}).click();
  await expect.poll(()=>dialog.locator('.react-flow').evaluate(el=>{const box=el.getBoundingClientRect();return [...el.querySelectorAll('.react-flow__node')].every(n=>{const r=n.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1&&r.top>=box.top-1&&r.bottom<=box.bottom+1;});})).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(mutations).toEqual([]);
});

test('ontology selection filters impact and clearing it removes stale highlights',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'온톨로지',exact:true}).click();
  await page.getByLabel('분석 기준 장애').selectOption('INC-UI-CLOSED');
  await expect(page.getByText('분석 기준: 가상 자산 12',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'전체화면',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'온톨로지 전체화면'});
  await dialog.getByRole('button',{name:'영향 자산만',exact:true}).click();
  await expect(dialog.locator('.react-flow__node')).toHaveCount(3);
  await expect.poll(()=>dialog.locator('.react-flow__node').first().evaluate(el=>el.getBoundingClientRect().width>100)).toBe(true);
  await dialog.locator('.react-flow__node[data-id="ASSET-12"]').click();
  await expect(dialog.locator('.graph-info')).toContainText('장애 발생 지점');
  await dialog.getByRole('button',{name:'전체화면 닫기 · Esc'}).click();
  await page.getByLabel('분석 기준 장애').selectOption('');
  await expect(page.getByRole('button',{name:'영향 자산만',exact:true})).toBeDisabled();
  await expect(page.getByText('분석 기준: 가상 자산 12',{exact:true})).toHaveCount(0);
});

test('mobile fullscreen closes without horizontal page overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await setup(page);
  await page.getByText('운영 현황 펼치기 · 지표 / 온톨로지 / Agent',{exact:true}).click();
  await page.getByRole('button',{name:'전체화면',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'온톨로지 전체화면'});
  await expect(dialog.getByRole('button',{name:'전체화면 닫기 · Esc'})).toBeVisible();
  await expect.poll(()=>dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect.poll(async()=>{const b=await dialog.locator('.graph-wrap').boundingBox();return !!b&&b.height>200;}).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('manuals match roles, printed downloads load, and failed evaluations show useful errors',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'사용 안내',exact:true}).click();
  await expect(page.getByRole('heading',{name:'사용자 매뉴얼',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'가상 장애 발생',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'관리자용',exact:true}).click();
  await expect(page.getByRole('heading',{name:'관리자 매뉴얼',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'HTML 다운로드'})).toHaveAttribute('href','/manuals/admin.html');
  for(const audience of ['user','admin']) {const response=await page.request.get(`/manuals/${audience}.html`);expect(response.ok()).toBe(true);expect(await response.text()).toContain('인쇄 / PDF로 저장');}
  await page.getByRole('button',{name:'Harness & 평가',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'평가 실패:'})).toContainText('평가 실패: 테스트용 연결 오류');
  await expect(page.locator('body')).not.toContainText('undefined/50');
});

test('ID search and visible filter reset restore the full list',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  await page.getByLabel('장애 검색').fill('INC-UI-CLOSED');
  await expect(page.getByText('필터 결과 1건',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'검색 초기화'}).click();
  await page.getByLabel('장애 유형 필터').selectOption('RESOURCE');
  await expect(page.getByText('필터 결과 1건',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'통합 관제',exact:true}).click();
  await expect(page.getByText('집계 필터 적용 중',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'집계 필터 초기화'}).click();
  await expect(page.getByText('집계 필터 적용 중',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  await expect(page.getByText('필터 결과 2건',{exact:false})).toBeVisible();
});

test('edited recovery notes must be saved before closing an incident',async({page})=>{
  const mutations=await setup(page);
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await page.getByRole('textbox',{name:'조치 후기',exact:true}).fill('수정된 가상 복구 후기');
  await page.getByRole('button',{name:'상세 닫기',exact:true}).click();
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await expect(page.getByRole('textbox',{name:'조치 후기',exact:true})).toHaveValue('수정된 가상 복구 후기');
  await page.getByRole('tab',{name:/6\. 장애 종료/}).click();
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await page.getByRole('button',{name:'수정 내용 저장'}).click();
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'장애 종료',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'})).toContainText('종료된 장애입니다');
  expect(mutations).toEqual(['/api/incidents/INC-UI-RESOLVED','/api/incidents/INC-UI-RESOLVED/close']);
});

test('a successful registration followed by a failed refresh is reported separately and is not resubmitted',async({page})=>{
  await setup(page);
  let registrations=0;
  await page.route('**/api/incidents',async route=>{
    if(route.request().method()!=='POST') return route.fallback();
    registrations++;
    await route.fulfill({json:{id:'INC-UI-CREATED'}});
  });
  await page.route('**/api/incidents/INC-UI-CREATED',route=>route.fulfill({json:{...rows[0],id:'INC-UI-CREATED',status:'REGISTERED'}}));
  await page.route('**/api/incidents/INC-UI-CREATED/events',route=>route.fulfill({contentType:'text/event-stream',body:': heartbeat\n\n'}));
  await page.route('**/api/dashboard?*',route=>route.fulfill({status:502,json:{error:'가상 테스트 통신 오류'}}));
  await page.getByRole('button',{name:'장애 직접 등록',exact:true}).click();
  const form=page.getByRole('dialog',{name:'장애 등록',exact:true});
  await form.getByRole('textbox',{name:'장애 제목',exact:true}).fill('가상 등록 검증');
  await form.getByRole('textbox',{name:'가상 관측 내용',exact:true}).fill('Fictional CPU usage 96%; customer outage');
  await form.getByRole('button',{name:'등록 & 분석 시작'}).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole('alert').filter({hasText:'요청은 처리됐지만 화면 갱신에 실패했습니다.'})).toContainText('가상 테스트 통신 오류');
  expect(registrations).toBe(1);
});

test('an uncertain registration response preserves the form and does not automatically register again',async({page})=>{
  await setup(page);
  let registrations=0;
  await page.route('**/api/incidents',async route=>{
    if(route.request().method()!=='POST') return route.fallback();
    registrations++;
    await route.fulfill({status:502,json:{error:'서버 응답을 받지 못해 처리 결과를 확인할 수 없습니다. 중복 요청 전에 장애 이력과 현재 상태를 확인해 주세요.',resultUnknown:true}});
  });
  await page.getByRole('button',{name:'장애 직접 등록',exact:true}).click();
  const form=page.getByRole('dialog',{name:'장애 등록',exact:true});
  await form.getByRole('textbox',{name:'장애 제목',exact:true}).fill('가상 입력 보존 검증');
  await form.getByRole('textbox',{name:'가상 관측 내용',exact:true}).fill('Fictional database connection timeout');
  await form.getByRole('button',{name:'등록 & 분석 시작'}).click();
  await expect(page.getByRole('alert').filter({hasText:'중복 요청 전에'})).toBeVisible();
  await expect(form.getByRole('textbox',{name:'장애 제목',exact:true})).toHaveValue('가상 입력 보존 검증');
  await expect(form.getByRole('textbox',{name:'가상 관측 내용',exact:true})).toHaveValue('Fictional database connection timeout');
  expect(registrations).toBe(1);
});

test('raw recovery JSON becomes a reviewable Korean draft and saves through the incident API',async({page})=>{
  const raw=JSON.stringify({before:{healthyDependencies:false,latencyMs:3200,errorRate:12.5},after:{healthyDependencies:true,latencyMs:120,errorRate:0.02},realChanges:false,passed:true,provider:'SIMULATED_METRICS'});
  await setup(page,raw);
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  const notes=page.getByRole('textbox',{name:'조치 후기',exact:true});
  await expect(notes).toHaveValue(/오류율: 12.5% → 0.02%/);
  await expect(notes).toHaveValue(/실제 운영 시스템은 변경하지 않았습니다/);
  await page.getByRole('tab',{name:/6\. 장애 종료/}).click();
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await page.getByText('복구 검증 원본 보기',{exact:true}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'}).locator('details[open] pre')).toContainText('SIMULATED_METRICS');
  await notes.fill((await notes.inputValue())+'\n담당자 확인: 가상 관측과 검증 결과를 대조했습니다.');
  const saved=page.waitForRequest(request=>request.method()==='PATCH');
  await page.getByRole('button',{name:'수정 내용 저장'}).click();
  expect((await saved).postDataJSON().notes).toContain('담당자 확인: 가상 관측과 검증 결과를 대조했습니다.');
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeEnabled();
  await expect(page.getByText('가상 복구 검증 결과를 한국어 후기 초안으로 정리했습니다.',{exact:false})).toHaveCount(0);
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await page.getByText('복구 검증 원본 보기',{exact:true}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'}).locator('details[open] pre')).toContainText('SIMULATED_METRICS');
});


test('user role hides administrator controls and allows only owned incident notes', async ({page}) => {
  const mutations=await setup(page, undefined, 'USER');
  await expect(page.getByRole('button',{name:'Harness & 평가',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'계정 관리',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'가상 장애 발생',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  await page.getByRole('button',{name:/P1 가상 자원 부족 장애/}).click();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await page.getByText('제목·담당자 수정',{exact:true}).click();
  await expect(page.getByLabel('장애 제목',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('담당자',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 사용자 후기');
  const patch=page.waitForRequest(r=>r.method()==='PATCH');
  await page.getByRole('button',{name:'수정 내용 저장',exact:true}).click();
  expect((await patch).postDataJSON()).toEqual({notes:'가상 사용자 후기',prevention:'저장된 예방 대책'});
  await page.getByRole('button',{name:'상세 닫기'}).click();
  await page.getByRole('button',{name:/P1 가상 네트워크 장애/}).click();
  await page.getByRole('tab',{name:/5\. 후기 검토/}).click();
  await expect(page.getByRole('button',{name:'수정 내용 저장',exact:true})).toBeDisabled();
  await expect(page.getByRole('textbox',{name:'조치 후기',exact:true})).toHaveAttribute('readonly','');
  expect(mutations).toEqual(['/api/incidents/INC-UI-RESOLVED']);
});

test('login defaults to a personal account and keeps bootstrap and activation separate', async ({page}) => {
  const calls: any[]=[];
  await page.route('**/api/**',async route=>{
    if(new URL(route.request().url()).pathname==='/api/session') calls.push(route.request().postDataJSON());
    await route.fulfill({status:401,json:{error:'가상 인증 검증 오류'}});
  });
  await page.goto('/');
  await expect(page.getByRole('tab',{name:'개인 계정',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('alert').filter({hasText:'세션이 만료'})).toHaveCount(0);
  await expect(page.getByLabel('관리자 토큰')).toHaveCount(0);
  await page.getByLabel('아이디',{exact:true}).fill('fictional.user');
  await page.getByLabel('비밀번호',{exact:true}).fill('fictional-password-2026');
  await page.getByRole('button',{name:'Command Center 시작'}).click();
  await expect(page.getByRole('alert').filter({hasText:'가상 인증 검증 오류'})).toContainText('가상 인증 검증 오류');
  expect(calls[0]).toMatchObject({mode:'login',login:'fictional.user',password:'fictional-password-2026'});
  await page.getByRole('tab',{name:'초대 활성화',exact:true}).click();
  await page.getByLabel('초대 코드',{exact:true}).fill('fictional-one-use-code');
  await page.getByLabel('새 비밀번호',{exact:true}).fill('fictional-new-password-2026');
  await page.getByRole('button',{name:'계정 활성화 & 시작'}).click();
  await expect.poll(()=>calls.length).toBe(2);
  expect(calls[1]).toMatchObject({mode:'activate',inviteCode:'fictional-one-use-code'});
  await page.getByRole('tab',{name:'관리자 초기 설정',exact:true}).click();
  await expect(page.getByLabel('관리자 토큰')).toBeVisible();
  await expect(page.getByLabel('아이디',{exact:true})).toHaveCount(0);
});

test('admin invites an account and confirms session-revoking changes', async ({page}) => {
  await setup(page);
  const users:any[]=[];
  await page.route('**/api/auth/users**',async route=>{
    const req=route.request();
    if(req.method()==='GET') return route.fulfill({json:users});
    if(req.method()==='POST') {
      const b=req.postDataJSON();users.push({id:'USR-UI',login:b.login,display_name:b.displayName,role:b.role,operator_id:b.operatorId,operator_name:'가상 담당자',enabled:true,account_status:'PENDING'});
      return route.fulfill({json:{id:'USR-UI',inviteCode:'fictional-ui-code',expiresAt:'2026-10-12T00:00:00Z'}});
    }
    users[0].enabled=req.postDataJSON().enabled;return route.fulfill({json:{ok:true}});
  });
  await page.getByRole('button',{name:'계정 관리',exact:true}).click();
  await page.getByLabel('초대할 아이디').fill('fictional.user');
  await page.getByLabel('가상 표시 이름').fill('가상 사용자');
  await page.getByLabel('연결할 가상 담당자').selectOption('OP-01');
  await page.getByRole('button',{name:'초대 코드 발급',exact:true}).click();
  await expect(page.getByLabel('1회용 초대 코드')).toHaveValue('fictional-ui-code');
  await page.getByRole('button',{name:'비활성화',exact:true}).click();
  await expect(page.getByRole('alert').filter({hasText:'기존 로그인 세션을 폐기'})).toContainText('기존 로그인 세션을 폐기');
  expect(users[0].enabled).toBe(true);
  await page.getByRole('button',{name:'확인 후 적용',exact:true}).click();
  await expect(page.getByRole('button',{name:'활성화',exact:true})).toBeVisible();
  expect(users[0].enabled).toBe(false);
});

test('stepper shows named requests, truthful progress and automatically opens the next form', async ({page}) => {
  await page.clock.install();
  await setup(page,undefined,'ADMIN',{status:'NEEDS_REVIEW'});
  const record:any={...rows[0],status:'NEEDS_REVIEW'};
  const commands:string[]=[];
  let releaseReview:()=>void=()=>{};
  const reviewGate=new Promise<void>(resolve=>{releaseReview=resolve;});
  await page.route('**/api/incidents/INC-UI-RESOLVED',async route=>{
    if(route.request().method()==='PATCH') {commands.push('save');Object.assign(record,route.request().postDataJSON());}
    await route.fulfill({json:record});
  });
  for(const [suffix,status] of [['review','WAITING_APPROVAL'],['approval','RECOVERING'],['close','CLOSED']]) {
    await page.route('**/api/incidents/INC-UI-RESOLVED/'+suffix,async route=>{commands.push(suffix);if(suffix==='review') await reviewGate;record.status=status;await route.fulfill({json:record});});
  }
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}), progress=dialog.getByRole('progressbar',{name:'전체 처리 진행률'});
  await expect(dialog.getByRole('tab',{name:/2\. 분석/})).toHaveAttribute('aria-selected','true');
  await expect(progress).toHaveAttribute('aria-valuenow','17');
  await expect(dialog.getByRole('textbox',{name:'확인 근거',exact:true})).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true})).toHaveCount(0);
  await dialog.getByRole('textbox',{name:'확인 근거',exact:true}).fill('가상 CPU 관측을 검토했습니다.');
  await page.clock.runFor(5100);
  await expect(dialog.getByRole('textbox',{name:'확인 근거',exact:true})).toHaveValue('가상 CPU 관측을 검토했습니다.');
  await expect(dialog.getByRole('textbox',{name:'확인 근거',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'판단 확정 & 분석 계속'}).click();
  await expect(dialog.getByRole('status').filter({hasText:'판단 확인 근거 저장 중'})).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow','17');
  await expect(dialog.getByRole('button',{name:'판단 확정 & 분석 계속'})).toBeDisabled();
  await page.clock.runFor(2100);
  await expect(dialog.getByRole('status').filter({hasText:'판단 확인 근거 저장 중'})).toContainText('2초 경과');
  releaseReview();
  await expect(dialog.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true');
  await expect(progress).toHaveAttribute('aria-valuenow','33');
  await expect(dialog.getByRole('textbox',{name:'확인 근거',exact:true})).toHaveCount(0);
  await dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true}).fill('영향 범위를 확인했으며 가상 복구만 승인합니다.');
  await dialog.getByRole('button',{name:'대응 승인',exact:true}).click();
  await expect(dialog.getByRole('tab',{name:/4\. 복구 검증/})).toHaveAttribute('aria-selected','true');
  await expect(progress).toHaveAttribute('aria-valuenow','50');
  record.status='RESOLVED';record.notes='';record.prevention='';
  await page.clock.runFor(5100);
  await expect(dialog.getByRole('tab',{name:/5\. 후기/})).toHaveAttribute('aria-selected','true');
  await expect(progress).toHaveAttribute('aria-valuenow','67');
  await dialog.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 복구 지표를 확인했습니다.');
  await dialog.getByRole('textbox',{name:'재발 방지 대책',exact:true}).fill('가상 부하 테스트를 추가합니다.');
  await dialog.getByRole('button',{name:'수정 내용 저장'}).click();
  await expect(dialog.getByRole('tab',{name:/6\. 장애 종료/})).toHaveAttribute('aria-selected','true');
  await expect(progress).toHaveAttribute('aria-valuenow','83');
  await expect(dialog.getByText('가상 복구 지표를 확인했습니다.',{exact:true})).toBeVisible();
  expect(commands).toEqual(['review','approval','save']);
  await dialog.getByRole('button',{name:'장애 종료',exact:true}).click();
  await expect(progress).toHaveAttribute('aria-valuenow','100');
  await expect(dialog.getByText('전체 단계 완료',{exact:true})).toBeVisible();
  expect(commands).toEqual(['review','approval','save','close']);
});

test('mobile stepper fits, separates user waiting from input, and browsing steps has no side effect',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const mutations=await setup(page,undefined,'USER',{status:'WAITING_APPROVAL'});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'});
  await expect(dialog.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true');
  await expect(dialog.getByText('관리자 승인 대기',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'대응 승인',exact:true})).toHaveCount(0);
  await expect.poll(()=>dialog.locator('.workflow-drawer').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect.poll(()=>dialog.locator('.workflow-stepper').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.getByRole('tab',{name:/5\. 후기/}).click();
  await expect(dialog.getByText('앞 단계를 완료하면 이 단계로 자동 이동합니다.',{exact:false})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'수정 내용 저장'})).toBeDisabled();
  await dialog.getByRole('tab',{name:/5\. 후기/}).press('ArrowLeft');
  await expect(dialog.getByRole('tab',{name:/4\. 복구/})).toBeFocused();
  await dialog.getByRole('button',{name:'현재 단계로 돌아가기',exact:false}).click();
  await expect(dialog.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>dialog.evaluate(el=>{const target=el.querySelector('.workflow-content')!.getBoundingClientRect(),head=el.querySelector('.workflow-head')!.getBoundingClientRect();return target.top>=head.bottom-1 && target.top<window.innerHeight;})).toBe(true);
  expect(mutations).toEqual([]);
});

test('failed request does not advance the stepper or clear the draft',async({page})=>{
  const mutations=await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL'});
  await page.route('**/api/incidents/INC-UI-RESOLVED/approval',route=>route.fulfill({status:502,json:{error:'처리 결과를 확인할 수 없습니다. 상태를 다시 확인하세요.'}}));
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'});
  await dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true}).fill('가상 승인 검토 사유');
  await dialog.getByRole('button',{name:'대응 승인',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('처리 결과를 확인할 수 없습니다');
  await expect(dialog.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true');
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow','33');
  await expect(dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true})).toHaveValue('가상 승인 검토 사유');
  expect(mutations).toEqual([]);
});

test('replaying a long SSE history does not flood or starve the initial detail read',async({page})=>{
  await setup(page);
  let reads=0,active=0,maxActive=0;
  await page.route('**/api/incidents/INC-UI-RESOLVED',async route=>{
    reads++;active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,700));
    await route.fulfill({json:{...rows[0],status:'NEEDS_REVIEW'}});active--;
  });
  await page.route('**/api/incidents/INC-UI-RESOLVED/events',route=>route.fulfill({contentType:'text/event-stream',body:'retry: 60000\n\n'+Array.from({length:20},(_,i)=>`id: ${i+1}\nevent: stage\ndata: {}\n\n`).join('')}));
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'}).getByRole('textbox',{name:'확인 근거',exact:true})).toBeVisible({timeout:4000});
  expect(maxActive).toBe(1);expect(reads).toBeLessThanOrEqual(2);
});

test('an old in-flight read cannot delay or reverse the next stage after approval',async({page})=>{
  await page.clock.install();
  await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL'});
  let status='WAITING_APPROVAL', delayNext=false, delayed=false;
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/incidents/INC-UI-RESOLVED',async route=>{
    const snapshot={...rows[0],status};
    if(delayNext) {delayNext=false;delayed=true;await gate;}
    await route.fulfill({json:snapshot});
  });
  await page.route('**/api/incidents/INC-UI-RESOLVED/approval',async route=>{status='RECOVERING';await route.fulfill({json:{ok:true}});});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'});
  await dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true}).fill('가상 영향 범위 확인');
  delayNext=true;
  await page.clock.runFor(5100);
  await expect.poll(()=>delayed).toBe(true);
  await dialog.getByRole('button',{name:'대응 승인',exact:true}).click();
  await expect(dialog.getByRole('tab',{name:/4\. 복구/})).toHaveAttribute('aria-selected','true');
  release();
  await page.clock.runFor(500);
  await expect(dialog.getByRole('tab',{name:/4\. 복구/})).toHaveAttribute('aria-selected','true');
  await expect(dialog.getByRole('progressbar')).toHaveAttribute('aria-valuenow','50');
});

test('checking the impact graph preserves an unsaved approval reason and hidden forms do not trap focus',async({page})=>{
  const mutations=await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL'});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'});
  await dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true}).fill('가상 영향 범위 검토 중인 미저장 사유');
  await dialog.getByRole('button',{name:'영향 그래프 크게 보기'}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:'선택 장애 상세 보기'}).click();
  await expect(dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true})).toHaveValue('가상 영향 범위 검토 중인 미저장 사유');
  await expect.poll(()=>dialog.locator('.workflow-content').evaluate(el=>el.contains(document.activeElement)||el===document.activeElement)).toBe(true);
  await dialog.getByRole('button',{name:'상세 닫기',exact:true}).click();
  await page.getByRole('button',{name:'장애 직접 등록',exact:true}).click();
  const registration=page.getByRole('dialog',{name:'장애 등록'});
  await expect(registration).toBeVisible();
  await expect.poll(()=>registration.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  expect(mutations).toEqual([]);
});
