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
  if(records[0]) Object.assign(records[0], initial);
  if(records[1]) records[1].owner_id="OP-02";
  if (recoveryNotes !== undefined) Object.assign(records[0], {notes:recoveryNotes,events:[{id:1,stage:'VERIFY',state:'COMPLETED',message:'가상 복구 검증',data_json:recoveryNotes,created_at:'2026-10-10T12:01:00Z'}]});
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data: unknown = {};
    if (request.method() !== 'GET') mutations.push(path);
    if (path === '/api/config') data = { user: { id:'bootstrap-admin', role, kind:role === 'ADMIN' ? 'BOOTSTRAP' : 'ACCOUNT', displayName:'가상 검증 사용자', operatorId:'OP-01' }, database: 'POSTGRESQL', graph: 'NEO4J', defaultProvider: 'LOCAL', a2a: '0.3.0', hermes: { apiReachable: false }, fictional: true };
    else if (path === '/api/catalog') data = { assets, operators: [{ id:'OP-01', name:'가상 담당자', department:'PLATFORM' }], scenarios:[{id:'SCN-01',title:'가상 시나리오'}], manuals:lists.manuals||[] };
    else if (path === '/api/demo-control') data={allowed:false,enabled:false,configured:false};
    else if (path === '/api/admin/models/warmup') data={fictional:true,actualModelCall:false,targets:[]};
    else if(path.startsWith('/api/assets/')&&path.endsWith('/context'))data={asset:assets[12],components:[],dependencies:[],skills:[],incidents:[],types:[],manuals:[]};
    else if (path === '/api/operations') data={stages:[],notifications:[],jobs:[],mttaSamples:0,mttrSamples:0};
    else if (path.endsWith('/similar')) data={items:[],note:'텍스트 유사도'};
    else if (path === '/api/graph') data = { nodes:assets, edges, engine:'NEO4J' };
    else if (path === '/api/skills' || path === '/api/audit') data=lists[path.slice(5)]||[];
    else if (path === '/api/evaluations') data=lists.evaluations||[{id:'EVAL-FAILED',status:'FAILED',mode:'REAL',provider:'LOCAL',created_at:'2026-10-10T12:00:00Z',result_json:JSON.stringify({error:'테스트용 연결 오류'})}];
    else if (path === '/api/incidents') data=records.filter(r => (!url.searchParams.get('type') || r.type === url.searchParams.get('type')) && !!r.deleted_at === (url.searchParams.get('deleted') === 'true'));
    else if (path === '/api/dashboard') data={total:url.searchParams.get('type') ? 1 : 2,active:0,critical:0,mttrMinutes:12,recurrenceRate:0,byDay:{},byType:{RESOURCE:1,NETWORK:1},bySystem:{},systemStatus:[]};
    else if (path.endsWith('/events')) { await route.fulfill({ contentType:'text/event-stream', body:': heartbeat\n\n' }); return; }
    else if (path.startsWith('/api/incidents/')) {
      const row=records.find(r=>path.includes(r.id));
      if (!row) throw new Error('Unexpected incident in UI test');
      if (request.method()==='PATCH') Object.assign(row,request.postDataJSON());
      if (path.endsWith('/close')) row.status='CLOSED';
      if(path.includes('/manage/')){const action=path.split('/').at(-1);if(action==='stop'||(action==='delete'&&!['CLOSED','REJECTED','CANCELLED'].includes(row.status))){row.status='CANCELLED';row.stop_reason=request.postDataJSON().reason;}if(action==='delete')row.deleted_at='2026-10-12T12:00:00Z';if(action==='restore')row.deleted_at=null;}
      data=row;
    } else throw new Error('Unexpected API path: '+path);
    if(['/api/evaluations','/api/audit'].includes(path)&&url.searchParams.has('page')&&Array.isArray(data)){
      const current=Math.min(Number(url.searchParams.get('page')),Math.max(1,Math.ceil(data.length/10)));
      data={items:data.slice((current-1)*10,current*10),total:data.length,page:current,pageSize:10,running:data.some(r=>r.status==='RUNNING')};
    }
    await route.fulfill({json:data});
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'S-CARE · AI 장애 대응 관제센터'})).toBeVisible();
  return mutations;
}

const smsPreview = (normal=false, existing="") => ({ parsed: {kind:'BATCH',status:normal?'END_OK':'ABEND',eligible:!normal,title:'가상 배치 알림',fields:{배치ID:'DEMO_BATCH_001',배치명:'가상정산배치..',발생일시:'2026-10-07 14:57:40'},warnings:['배치명이 생략되어 있습니다. 대상 구성요소를 확인하세요.']},observations:'가상 배치 관측값',existingIncidentId:existing,suggestedAssetId:'',matchReason:'대상 구성요소를 선택해 주세요.'});

test('demo dashboard guides the current step and keeps operations behind the admin menu',async({page})=>{
  const reads:string[]=[];page.on('request',r=>{if(r.method()==='GET')reads.push(new URL(r.url()).pathname);});
  const mutations=await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL'});
  const journey=page.getByRole('region',{name:'가상 자원 부족 장애',exact:true});
  await expect(journey.getByRole('listitem').filter({hasText:'대응 승인'})).toHaveAttribute('aria-current','step');
  await expect(page.getByRole('heading',{name:'처리 시간과 알림',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'AI 품질 관리',exact:true})).toBeHidden();
  expect(reads).not.toContain('/api/operations');expect(reads).not.toContain('/api/evaluations');
  await journey.getByRole('button',{name:'대응 승인 위치로 이동',exact:true}).click();
  await expect(page.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true');
  await page.keyboard.press('Escape');
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'운영 현황',exact:true}).click();
  await expect(page.getByRole('heading',{name:'처리 시간과 알림',exact:true})).toBeVisible();
  expect(mutations).toEqual([]);
});

test('dashboard places both intake actions first on mobile and opens existing forms without mutation',async({page})=>{
  await page.setViewportSize({width:390,height:844});const mutations=await setup(page);
  const intake=page.getByRole('region',{name:'장애가 발생했나요?'});
  const sms=intake.getByRole('button',{name:'문자 붙여넣기',exact:true}), manual=intake.getByRole('button',{name:'장애 직접 등록',exact:true});
  for(const action of [sms,manual]) {const box=await action.boundingBox();expect(box).not.toBeNull();expect(box!.y+box!.height).toBeLessThan(844);}
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.getByRole('complementary',{name:'이 화면에 사용된 기술'}).evaluate(el=>el.compareDocumentPosition(document.querySelector('.work-queue')!)&Node.DOCUMENT_POSITION_PRECEDING)).toBeTruthy();
  await expect(page.getByRole('button',{name:'가상 장애 발생',exact:true})).toBeHidden();
  await sms.click();await expect(page.getByRole('dialog',{name:'문자로 장애 등록'})).toBeVisible();await page.keyboard.press('Escape');await expect(sms).toBeFocused();
  await manual.click();await expect(page.getByRole('dialog',{name:'장애 등록',exact:true})).toBeVisible();await expect(page.getByLabel('장애 제목',{exact:true})).toBeVisible();await page.keyboard.press('Escape');
  expect(mutations).toEqual([]);
});

test('dashboard queue prioritizes pending work behind closed history, paginates and opens the current step',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  const incidents=[...Array.from({length:15},(_,i)=>({...rows[1],id:`CLOSED-${i}`})),
    ...Array.from({length:12},(_,i)=>({...rows[0],id:`PENDING-${String(i+1).padStart(2,'0')}`,status:i===11?'NEEDS_REVIEW':'ANALYZING'}))];
  const mutations=await setup(page,undefined,'ADMIN',{}, {incidents});
  const list=page.getByRole('region',{name:'처리할 장애 목록',exact:true});
  await expect(list.locator('.queue-item')).toHaveCount(10);await expect(list.locator('.queue-item').first()).toContainText('PENDING-12');
  await page.screenshot({path:'test-results/dashboard-worklist-desktop.png',fullPage:true});
  await expect(list.getByRole('button',{name:/CLOSED-/})).toHaveCount(0);
  await list.getByRole('navigation').first().getByRole('button',{name:'다음 페이지',exact:true}).click();await expect(list.locator('.queue-item')).toHaveCount(2);
  await page.getByRole('button',{name:/내 확인 필요/}).click();await expect(list.locator('.queue-item')).toHaveCount(1);await expect(list.getByRole('navigation').first()).toContainText('1/1페이지');
  await list.getByRole('button',{name:/PENDING-12/}).click();await expect(page.getByRole('tab',{name:/2\. 분석/})).toHaveAttribute('aria-selected','true');expect(mutations).toEqual([]);
});

test('dashboard normal-user work filter respects ownership and admin-only actions',async({page})=>{
  const incidents=[{...rows[0],id:'OWN-NOTES',prevention:''},{...rows[0],id:'OTHER-NOTES',owner_id:'OP-02',prevention:''},{...rows[0],id:'ADMIN-APPROVAL',status:'WAITING_APPROVAL'}];
  const mutations=await setup(page,undefined,'USER',{}, {incidents});await page.getByRole('button',{name:/내 확인 필요/}).click();
  const list=page.getByRole('region',{name:'처리할 장애 목록',exact:true});await expect(list.locator('.queue-item')).toHaveCount(1);await expect(list).toContainText('OWN-NOTES');
  await expect(page.getByText('가상 장애로 체험하기',{exact:true})).toHaveCount(0);
  await list.getByRole('button',{name:/OWN-NOTES/}).click();await expect(page.getByRole('tab',{name:/5\. 후기/})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('button',{name:'승인 & 가상 복구 시작',exact:true})).toHaveCount(0);expect(mutations).toEqual([]);
});

test('empty dashboard retains intake, simulation is an explicit admin choice, and screenshots cover both sizes',async({page})=>{
  await page.setViewportSize({width:1440,height:1050});const mutations=await setup(page,undefined,'ADMIN',{}, {incidents:[]});
  await expect(page.getByRole('region',{name:'처리할 장애 목록',exact:true})).toContainText('현재 조회 범위에 처리 중인 장애가 없습니다.');
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.getByText('가상 장애로 체험하기',{exact:true}).click();await expect(page.getByRole('button',{name:'가상 장애 발생',exact:true})).toBeVisible();
  await page.getByText('가상 장애로 체험하기',{exact:true}).click();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});expect(mutations).toEqual([]);
});
test('technology map explains implementation to normal users without exposing admin actions',async({page})=>{
  const mutations=await setup(page,undefined,'USER');
  await page.getByRole('button',{name:'기술별 역할 보기',exact:true}).click();
  const guide=page.getByRole('region',{name:'기술과 모델 안내'});
  await expect(guide.getByRole('table')).toBeVisible();await expect(guide.getByRole('row')).toHaveCount(9);
  await expect(guide.getByRole('list',{name:'단계별 기술 지도'}).getByRole('listitem')).toHaveCount(6);
  await guide.getByText('6개 Agent의 역할과 모델 연결 보기',{exact:true}).click();
  await expect(guide.getByRole('heading',{name:'Diagnosis Agent · 원인 후보 분석'})).toBeVisible();
  await expect(guide.getByRole('heading',{name:'Report Agent · 보고서 구성'})).toBeVisible();
  await expect(page.getByRole('button',{name:'한국어 100건 · 모의 평가',exact:true})).toHaveCount(0);expect(mutations).toEqual([]);
});

test('stage technology evidence separates real Jev, Hermes Mock fallback and unexecuted work',async({page})=>{
  const mutations=await setup(page,undefined,'ADMIN',{status:'NEEDS_REVIEW',mode:'REAL',
    decision:{provider:'LOCAL_JEV',model:'fictional-model-v1',simulated:false,confidence:.5,evidenceScore:.4,latencyMs:82,type:'RESOURCE',severity:'P1',department:'PLATFORM'},
    tasks:[{agent:'knowledge',status:'completed',result_json:JSON.stringify({artifacts:[{parts:[{data:{provider:'MOCK_HERMES_FALLBACK',model:'fictional-template',simulated:true,fallback:true,fallbackReason:'test-timeout'}}]}]})}],
    events:[{id:1,stage:'HARNESS',state:'COMPLETED',data_json:'{"needsReview":true,"passed":false}',message:'가상 검증',created_at:'2026-10-10T12:00:00Z'}],
  });
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();const dialog=page.getByRole('dialog',{name:'장애 상세'});
  const stage=dialog.getByRole('region',{name:'이 단계의 기술과 역할'});
  await expect(stage).toContainText('2단계에서 사용하는 기술');await expect(stage).toContainText('Jev');
  await stage.getByText('역할과 이 장애의 실행 근거 보기',{exact:true}).click();
  await expect(stage.getByRole('article',{name:'Jev 실행 근거'})).toContainText('실제 AI 응답 기록 · Provider: LOCAL_JEV · 응답 모델: fictional-model-v1');
  await expect(stage.getByRole('article',{name:'Hermes · 에르메스 실행 근거'})).toContainText('시뮬레이션 · 실제 AI 아님');
  await expect(stage.getByRole('article',{name:'Hermes · 에르메스 실행 근거'})).toContainText('test-timeout');
  await expect(stage.getByRole('article',{name:'Harness Engineering 실행 근거'})).toContainText('정책 결과: 담당자 확인 필요');
  await dialog.getByRole('tab',{name:/4\. 복구 검증/}).click();await stage.getByText('역할과 이 장애의 실행 근거 보기',{exact:true}).click();
  await expect(stage.getByRole('article',{name:'MCP 실행 근거'})).toContainText('실행 기록 없음');expect(mutations).toEqual([]);
});

test('mobile technology map and step evidence fit without horizontal overflow or invoking AI',async({page})=>{
  await page.setViewportSize({width:390,height:844});const mutations=await setup(page,undefined,'ADMIN',{status:'REGISTERED',mode:'REAL',impact:null});
  await page.getByRole('button',{name:'사용 기술',exact:true}).click();
  const guide=page.getByRole('region',{name:'기술과 모델 안내'});expect(await guide.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await guide.getByText('실제 AI · Mock · 모델명은 어떻게 읽나요?',{exact:true}).click();await expect(guide).toContainText('hermes-agent 별칭');
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'});await dialog.getByRole('tab',{name:/2\. 분석/}).click();
  const stage=dialog.getByRole('region',{name:'이 단계의 기술과 역할'});await stage.getByText('역할과 이 장애의 실행 근거 보기',{exact:true}).click();
  await expect(stage.getByRole('article',{name:'Jev 실행 근거'})).toContainText('실행 기록 없음');
  await expect(stage.getByRole('article',{name:'Ontology · 온톨로지 실행 근거'})).toContainText('실행 기록 없음');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(mutations).toEqual([]);
});

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
  const mutations=await setup(page,undefined,'ADMIN',{}, {skills,manuals});await page.getByRole('button',{name:'해결 지식',exact:true}).click();
  const skillList=page.getByRole('region',{name:'해결 절차 목록',exact:true}), manualList=page.getByRole('region',{name:'대응 매뉴얼 목록',exact:true});
  await expect(skillList.locator('article')).toHaveCount(10);await expect(manualList.locator('details')).toHaveCount(10);
  await skillList.getByRole('navigation').last().getByRole('button',{name:'다음 페이지',exact:true}).click();await expect(skillList.getByRole('heading',{name:'가상 Skill 11',exact:true})).toBeVisible();
  await expect(skillList).toBeFocused();expect(await skillList.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await manualList.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(manualList.locator('details')).toHaveCount(1);await expect(skillList.getByRole('navigation').first()).toContainText('2/3페이지');
  expect(mutations).toEqual([]);
});
test('Harness pages reach older evaluations and audit logs while running state covers all pages',async({page})=>{
  const evaluations=Array.from({length:35},(_,i)=>({id:`EVAL-PAGE-${i+1}`,status:i===34?'RUNNING':'COMPLETED',mode:'DEMO',provider:`MOCK-PAGE-${i+1}`,created_at:'2026-10-10T12:00:00Z',result_json:'{}'}));
  const audit=Array.from({length:321},(_,i)=>({id:i+1,actor:'가상 감사 주체',action:`PAGE-ACTION-${i+1}`,data_json:'{}',created_at:'2026-10-10T12:00:00Z'}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {evaluations,audit});await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'AI 품질 관리',exact:true}).click();
  const ev=page.getByRole('region',{name:'Harness 평가 목록',exact:true}), logs=page.getByRole('region',{name:'감사 로그 목록',exact:true});
  await expect(ev.locator('.system')).toHaveCount(10);await expect(logs.locator('tbody tr')).toHaveCount(10);await expect(page.getByRole('button',{name:'한국어 100건 · 모의 평가',exact:true})).toBeDisabled();
  await ev.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(ev).toContainText('MOCK-PAGE-35');await expect(ev.locator('.system')).toHaveCount(5);
  await logs.getByRole('navigation').first().getByRole('button',{name:'마지막 페이지',exact:true}).click();await expect(logs).toContainText('PAGE-ACTION-321');await expect(logs.locator('tbody tr')).toHaveCount(1);
  await expect(ev.getByRole('navigation').first()).toContainText('4/4페이지');expect(mutations).toEqual([]);
});

test('a failed page read retains the successful page and retry loads the requested page',async({page})=>{
  const audit=Array.from({length:21},(_,i)=>({id:i+1,actor:'가상 감사 주체',action:`RETRY-PAGE-${i+1}`,data_json:'{}',created_at:'2026-10-10T12:00:00Z'}));
  const mutations=await setup(page,undefined,'ADMIN',{}, {audit});let failed=false;
  await page.route('**/api/audit?page=2',async route=>{if(failed)return route.fallback();failed=true;await route.fulfill({status:503,json:{error:'가상 페이지 조회 실패'}});});
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'AI 품질 관리',exact:true}).click();const logs=page.getByRole('region',{name:'감사 로그 목록',exact:true});
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
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'운영 현황',exact:true}).click();await page.getByText('운영 현황 펼치기 · 지표 / 시스템 연결 / AI 도우미',{exact:true}).click();
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
  await page.getByRole('button',{name:'시스템 영향도',exact:true}).click();
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
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'운영 현황',exact:true}).click();await page.getByText('운영 현황 펼치기 · 지표 / 시스템 연결 / AI 도우미',{exact:true}).click();
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
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'AI 품질 관리',exact:true}).click();
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
  await expect(page.getByRole('button',{name:'AI 품질 관리',exact:true})).toHaveCount(0);
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
    if(new URL(route.request().url()).pathname==='/api/readiness') return route.fulfill({json:{ready:true}});
    if(new URL(route.request().url()).pathname==='/api/session'&&route.request().postDataJSON().mode!=='demo') calls.push(route.request().postDataJSON());
    await route.fulfill({status:401,json:{error:'가상 인증 검증 오류'}});
  });
  await page.goto('/');
  await expect(page.getByRole('tab',{name:'개인 계정',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('alert').filter({hasText:'세션이 만료'})).toHaveCount(0);
  await expect(page.getByLabel('관리자 토큰')).toHaveCount(0);
  await page.getByLabel('아이디',{exact:true}).fill('fictional.user');
  await page.getByLabel('비밀번호',{exact:true}).fill('fictional-password-2026');
  await page.getByRole('button',{name:'관제센터 시작'}).click();
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
  await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'계정 관리',exact:true}).click();
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
  await page.clock.runFor(41000);
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
  await page.clock.runFor(41000);
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


test('briefing shows verified fictional before and after without mutating the incident',async({page})=>{
  const proof=JSON.stringify({before:{healthyDependencies:false,latencyMs:3200,errorRate:12.5},after:{healthyDependencies:true,latencyMs:120,errorRate:0.02},realChanges:false,passed:true,provider:'SIMULATED_METRICS'});
  const mutations=await setup(page,proof);await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();
  const brief=page.locator('.incident-briefing');await brief.locator('summary').first().click();
  await expect(brief).toContainText('오류율: 12.5% → 0.02%');await expect(brief).toContainText('3,200ms → 120ms');
  await expect(brief).toContainText('아직 판단 전입니다');await expect(brief).toContainText('가상 지표 검증');expect(mutations).toEqual([]);
});

test('briefing does not invent recovery results before verification and fits mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});const mutations=await setup(page,undefined,'USER',{status:'NEEDS_REVIEW'});
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();
  const brief=page.locator('.incident-briefing');await brief.locator('summary').first().click();
  await expect(brief).toContainText('확인 가능한 가상 복구 비교 기록이 아직 없습니다');await expect(brief).toContainText('관리자가 AI 판단을 확인해야 합니다');
  expect(await brief.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(mutations).toEqual([]);
});


test('admin stop requires reason and exact ID and never presents recovery completion',async({page})=>{
 const mutations=await setup(page,undefined,'ADMIN',{status:'ANALYZING',notes:'',prevention:''});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();const dialog=page.getByRole('dialog',{name:'장애 상세'});
 await dialog.getByText('관리자 작업 · 강제 종료 / 삭제 / 복원',{exact:true}).click();
 const execute=dialog.getByRole('button',{name:'강제 종료 실행',exact:true});await expect(execute).toBeDisabled();
 await dialog.getByLabel('처리 사유',{exact:true}).fill('가상 시연 중단');await dialog.getByLabel('확인용 장애 번호').fill('wrong');await expect(execute).toBeDisabled();
 await dialog.getByLabel('확인용 장애 번호').fill('INC-UI-RESOLVED');await execute.click();
 await expect(dialog.getByRole('heading',{name:'관리자가 장애 처리를 강제 종료했습니다',exact:true})).toBeVisible();
 await expect(dialog.getByRole('progressbar')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'장애 종료',exact:true})).toHaveCount(0);
 await expect(dialog).toContainText('가상 시연 중단');expect(mutations).toEqual(['/api/incidents/INC-UI-RESOLVED/manage/stop']);
});

test('delete removes from the list and admin can restore without resuming work',async({page})=>{
 const mutations=await setup(page,undefined,'ADMIN',{status:'NEEDS_REVIEW'});await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();
 const dialog=page.getByRole('dialog',{name:'장애 상세'});await dialog.getByText('관리자 작업 · 강제 종료 / 삭제 / 복원',{exact:true}).click();
 await dialog.getByLabel('관리 작업',{exact:true}).selectOption('delete');await dialog.getByLabel('처리 사유',{exact:true}).fill('가상 중복 접수');await dialog.getByLabel('확인용 장애 번호').fill('INC-UI-RESOLVED');await dialog.getByRole('button',{name:'장애 삭제 실행'}).click();
 await expect(dialog.getByRole('heading',{name:'목록에서 삭제된 장애입니다'})).toBeVisible();await dialog.getByRole('button',{name:'상세 닫기'}).click();
 await page.getByRole('button',{name:'장애 이력',exact:true}).click();const list=page.getByRole('region',{name:'장애 이력 목록',exact:true});await expect(list).not.toContainText('INC-UI-RESOLVED');
 await page.getByLabel('삭제된 장애 보기').check();await list.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
 await dialog.getByText('관리자 작업 · 강제 종료 / 삭제 / 복원',{exact:true}).click();await dialog.getByLabel('처리 사유',{exact:true}).fill('가상 복원');await dialog.getByLabel('확인용 장애 번호').fill('INC-UI-RESOLVED');await dialog.getByRole('button',{name:'삭제 복원 실행'}).click();
 await expect(dialog.getByRole('heading',{name:'관리자가 장애 처리를 강제 종료했습니다',exact:true})).toBeVisible();expect(mutations).toEqual(['/api/incidents/INC-UI-RESOLVED/manage/delete','/api/incidents/INC-UI-RESOLVED/manage/restore']);
});

test('users cannot see management controls and canceled records stay out of pending queue',async({page})=>{
 const mutations=await setup(page,undefined,'USER',{status:'CANCELLED',stop_reason:'가상 중단'});
 await expect(page.getByRole('region',{name:'처리할 장애 목록'})).not.toContainText('INC-UI-RESOLVED');
 await page.getByRole('button',{name:'장애 이력',exact:true}).click();await expect(page.getByLabel('삭제된 장애 보기')).toHaveCount(0);
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();await expect(page.getByText('관리자 작업 · 강제 종료 / 삭제 / 복원',{exact:true})).toHaveCount(0);expect(mutations).toEqual([]);
});

test('management failure keeps confirmation and reason without retrying automatically',async({page})=>{
 const mutations=await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL'});let calls=0;
 await page.route('**/api/incidents/*/manage/stop',async route=>{calls++;await route.fulfill({status:409,json:{error:'가상 충돌 · 상태를 다시 확인하세요'}});});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).first().click();const dialog=page.getByRole('dialog',{name:'장애 상세'});
 await dialog.getByText('관리자 작업 · 강제 종료 / 삭제 / 복원',{exact:true}).click();await dialog.getByLabel('처리 사유',{exact:true}).fill('가상 사유');await dialog.getByLabel('확인용 장애 번호').fill('INC-UI-RESOLVED');await dialog.getByRole('button',{name:'강제 종료 실행'}).click();
 await expect(dialog.getByRole('alert')).toContainText('가상 충돌');await expect(dialog.getByLabel('처리 사유',{exact:true})).toHaveValue('가상 사유');await expect(dialog.getByLabel('확인용 장애 번호')).toHaveValue('INC-UI-RESOLVED');expect(calls).toBe(1);expect(mutations).toEqual([]);
});

test('healthy SSE eliminates five-second detail polling and background tabs stop refresh',async({page})=>{
 await page.clock.install();await page.addInitScript(()=>{class Source {onopen:any;onerror:any;constructor(){setTimeout(()=>this.onopen?.(),0);}addEventListener(){}close(){}};(window as any).EventSource=Source;});
 await setup(page,undefined,'ADMIN',{status:'NEEDS_REVIEW'});let details=0,dashboards=0;page.on('request',r=>{const path=new URL(r.url()).pathname;if(path==='/api/incidents/INC-UI-RESOLVED')details++;if(path==='/api/dashboard')dashboards++;});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();await expect(page.getByRole('dialog',{name:'장애 상세'})).toBeVisible();await page.clock.runFor(1000);const initial=details;
 await page.clock.runFor(20000);expect(details).toBe(initial);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});const before=dashboards;await page.clock.runFor(120000);expect(dashboards).toBe(before);
});

test('analysis performance shows parallel timers and immediate SSE completions despite a stale snapshot',async({page})=>{
 const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.clock.install({time:new Date('2026-10-15T00:00:05Z')});
 await page.addInitScript(()=>{class Source {onopen:any;onerror:any;listeners:any={};constructor(){(window as any).analysisSource=this;setTimeout(()=>this.onopen?.(),0);}addEventListener(name:string,listener:any){this.listeners[name]=listener;}close(){}};(window as any).EventSource=Source;});
 const startedAt='2026-10-15T00:00:00Z';
 const stages=[{id:'diagnosis',stage:'TASK_diagnosis',state:'RUNNING',startedAt,category:'PENDING'},{id:'knowledge',stage:'HERMES',state:'RUNNING',startedAt,category:'PENDING'}];
 const mutations=await setup(page,undefined,'ADMIN',{status:'ANALYZING',performance:{stages},events:[{id:1,stage:'TASK_diagnosis',state:'RUNNING',created_at:startedAt},{id:2,stage:'HERMES',state:'RUNNING',created_at:startedAt}]});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
 const panel=page.getByRole('region',{name:'단계별 분석 실행 현황'});
 await expect(panel.locator('details').first()).not.toHaveAttribute('open','');
 await expect(panel).toContainText('5초 경과');
 await panel.locator('summary').first().click();
 await expect(panel.locator('.analysis-stage.running')).toHaveCount(2);await expect(panel).toContainText('5초 경과');
 await page.clock.runFor(1000);await expect(panel).toContainText('6초 경과');
 await page.evaluate(()=>{(window as any).analysisSource.listeners.stage({data:JSON.stringify({id:3,incident_id:'INC-UI-RESOLVED',stage:'PERFORMANCE',state:'COMPLETED',created_at:'2026-10-15T00:00:06Z',message:'TASK_diagnosis 실행 시간',data_json:JSON.stringify({id:'diagnosis',stage:'TASK_diagnosis',state:'COMPLETED',startedAt:'2026-10-15T00:00:00Z',endedAt:'2026-10-15T00:00:06Z',durationMs:6000,category:'MOCK_FALLBACK',httpElapsedMs:5900,modelInferenceMs:null,networkWaitMs:null,retryCount:0})})});});
 await expect(panel.locator('.analysis-stage.completed')).toHaveCount(1);await expect(panel).toContainText('MOCK_FALLBACK · 실제 AI 아님');
 await page.clock.runFor(300);await expect(panel.locator('.analysis-stage.completed')).toHaveCount(1);await expect(panel.locator('.analysis-stage.running')).toHaveCount(1);
 await panel.screenshot({path:'test-results/analysis-performance.png'});expect(mutations).toEqual([]);expect(pageErrors).toEqual([]);
});

for(const viewport of [{width:390,height:844},{width:1440,height:1000}]) {
 test(`current input is highlighted and scrolled into view at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  await setup(page,undefined,'ADMIN',{status:'RESOLVED',notes:'',prevention:'',performance:{stages:[{id:'jev',stage:'JEV',state:'COMPLETED',durationMs:2,category:'DEMO_MOCK'}]}});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}),target=dialog.locator('#guide-notes');
  await expect(target).toBeFocused();
  await expect(dialog.locator('.workflow-content')).toHaveAttribute('data-active-input','notes');
  await expect.poll(()=>target.evaluate(el=>{const r=el.getBoundingClientRect();const h=document.querySelector('.workflow-head')!;const bottom=getComputedStyle(h).position==='sticky'?h.getBoundingClientRect().bottom:0;return r.top>=bottom && r.top<window.innerHeight/2;})).toBe(true);
  await expect(dialog.getByRole('region',{name:'단계별 분석 실행 현황'}).locator('details').first()).not.toHaveAttribute('open','');
  await dialog.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 복구 확인');
  await expect(dialog.getByRole('textbox',{name:'조치 후기',exact:true})).toBeFocused();
  await dialog.screenshot({path:`test-results/current-input-${viewport.width}.png`});
 });
 test(`final close action scrolls into view after saving long notes at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  const mutations=await setup(page,undefined,'ADMIN',{status:'RESOLVED',notes:'',prevention:''});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}),target=dialog.locator('#guide-close');
  await dialog.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 복구 후 서비스와 지표를 확인했습니다. '.repeat(100));
  await dialog.getByRole('textbox',{name:'재발 방지 대책',exact:true}).fill('가상 점검 항목을 추가했습니다. '.repeat(100));
  await dialog.getByRole('button',{name:'수정 내용 저장',exact:true}).click();
  await expect(target).toBeFocused();
  await expect(dialog.locator('.workflow-content')).toHaveAttribute('data-active-input','close');
  const close=dialog.getByRole('button',{name:'장애 종료',exact:true});
  await expect(close).toBeEnabled();
  await expect.poll(()=>close.evaluate(el=>{const r=el.getBoundingClientRect(),h=document.querySelector('.workflow-head')!;const bottom=getComputedStyle(h).position==='sticky'?h.getBoundingClientRect().bottom:0;return r.top>=bottom && r.bottom<=window.innerHeight;})).toBe(true);
  await page.screenshot({path:`test-results/final-close-${viewport.width}.png`});
  await dialog.getByRole('tab',{name:/5\. 후기/}).click();
  await dialog.getByRole('button',{name:'현재 단계로 돌아가기',exact:false}).click();
  await expect(target).toBeFocused();
  expect(mutations).toEqual(['/api/incidents/INC-UI-RESOLVED']);
 });
}

test('collapsed processing indication animates, respects reduced motion and stops when approval is needed',async({page})=>{
 const startedAt=new Date().toISOString();
 const initial={status:'ANALYZING',performance:{stages:[{id:'diagnosis',stage:'TASK_diagnosis',state:'RUNNING',startedAt,category:'PENDING'}]}};
 const mutations=await setup(page,undefined,'ADMIN',initial);
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
 const dialog=page.getByRole('dialog',{name:'장애 상세'}),panel=dialog.getByRole('region',{name:'단계별 분석 실행 현황'});
 await expect(panel.locator('details').first()).not.toHaveAttribute('open','');
 await expect(panel.locator('.analysis-processing')).toBeVisible();
 await expect(panel.locator('.processing-dot')).toHaveCSS('animation-name','processing-pulse');
 await expect(dialog.locator('.workflow-stepper [aria-current="step"] .working-spinner')).toBeVisible();
 await page.screenshot({path:'test-results/processing-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await panel.scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/processing-mobile.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect(panel.locator('.processing-dot')).toHaveCSS('animation-name','none');
 await expect(panel.locator('.analysis-processing .working-spinner')).toHaveCSS('animation-name','none');
 await page.route('**/api/incidents/INC-UI-RESOLVED',route=>route.fulfill({json:{...rows[0],...initial,status:'WAITING_APPROVAL'}}));
 await expect(dialog.getByRole('tab',{name:/3\. 대응 승인/})).toHaveAttribute('aria-selected','true',{timeout:15000});
 await expect(panel.locator('.analysis-processing')).toHaveCount(0);
 await expect(dialog.locator('.workflow-stepper .working-spinner')).toHaveCount(0);
 await expect(panel.locator('.analysis-current')).toHaveText('저장된 실행 결과');
 expect(mutations).toEqual([]);
});

test('demo is the explicit default for intake and real AI remains selectable',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'장애 직접 등록',exact:true}).click();
 await expect(page.getByLabel('등록 실행 모드',{exact:true})).toHaveValue('DEMO');
 await page.getByLabel('등록 실행 모드',{exact:true}).selectOption('REAL');
 await expect(page.getByLabel('등록 실행 모드',{exact:true})).toHaveValue('REAL');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'문자 붙여넣기',exact:true}).click();
 await page.getByLabel('수신 문자',{exact:true}).fill('[Web발신] ABEND 가상 배치');
 await page.route('**/api/message-intake/preview',route=>route.fulfill({json:smsPreview()}));
 await page.getByRole('button',{name:'내용 분석',exact:true}).click();
 await expect(page.getByLabel('문자 등록 실행 모드')).toHaveValue('REAL');
 await page.getByLabel('문자 등록 실행 모드').selectOption('DEMO');
 await expect(page.getByText('외부 모델을 호출하지 않는 시뮬레이션입니다.',{exact:true})).toBeVisible();
});

test('saving the current form does not wait for a slow dashboard refresh',async({page})=>{
 await setup(page,undefined,'ADMIN',{status:'RESOLVED',notes:'',prevention:''});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
 const dialog=page.getByRole('dialog',{name:'장애 상세'});
 await dialog.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 복구 확인');
 await dialog.getByRole('textbox',{name:'재발 방지 대책',exact:true}).fill('가상 점검 추가');
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/dashboard*',async route=>{await gate;await route.fulfill({json:{total:2,active:0}});});
 await dialog.getByRole('button',{name:'수정 내용 저장',exact:true}).click();
 await expect(dialog.getByRole('tab',{name:/6\. 장애 종료/})).toHaveAttribute('aria-selected','true');
 await expect(dialog.getByRole('button',{name:'장애 종료',exact:true})).toBeEnabled();
 release();
});

test('admin warmup displays unknown cost and never calls a model until one explicit request',async({page})=>{
 await setup(page);let calls=0, lastResult:any=null;
 await page.route('**/api/admin/models/warmup',async route=>{
  if(route.request().method()==='POST'){calls++;expect(route.request().postDataJSON()).toEqual({target:'JEV_LOCAL',mode:'REAL',performInference:true});await route.fulfill({json:{target:'JEV_LOCAL',status:'FAILED',modelCallAttempted:true,actualModelCall:false,estimatedCostUsd:null,latencyMs:100,reason:'FICTIONAL_PROVIDER_UNAVAILABLE'}});return;}
  await route.fulfill({json:{fictional:true,actualModelCall:false,targets:[{target:'JEV_LOCAL',configured:true,estimatedCostUsd:null,maxPerHour:4,remainingThisHour:4-calls,cooldownSeconds:60,retryAfterMs:calls?60000:0,inFlight:false,lastResult}]}});
 });
 await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'AI 품질 관리',exact:true}).click();
 const panel=page.getByRole('region',{name:'관리자 모델 워밍업'});await expect(panel).toContainText('예상 비용: 알 수 없음');expect(calls).toBe(0);
 const run=panel.getByRole('button',{name:'Jev · 로컬 모델 실제 추론 1회 실행'});await run.click();await expect(panel).toContainText('호출 시도: 예 · 실제 모델 응답 확인: 아니요');await expect(run).toBeDisabled();expect(calls).toBe(1);
 lastResult={status:'READY',modelCallAttempted:true,actualModelCall:true,endedAt:'2026-10-15T00:05:00Z'};
 await panel.getByRole('button',{name:'호출 없이 설정·제한 새로고침'}).click();await expect(panel).toContainText('모델 응답 확인 완료');await expect(panel).toContainText('실제 모델 응답 확인: 예');expect(calls).toBe(1);
 await page.screenshot({path:'test-results/model-warmup.png',fullPage:true});
});

test('skill draft saves versioned changes and exposes old and new values',async({page})=>{
 const skill:any={id:'SKL-UI-EDIT',type:'RESOURCE',title:'가상 초안',status:'DRAFT',conditions:'가상 적용 조건',checks:'가상 점검',solution:'기존 가상 조치',cautions:'가상 환경 전용',revision:0,simulated:true,incident_id:'INC-UI-RESOLVED'};
 await setup(page,undefined,'ADMIN',{}, {skills:[skill]});let history:any[]=[];
 await page.route('**/api/skills/SKL-UI-EDIT**',async route=>{if(route.request().method()==='GET'){await route.fulfill({json:history});return;}const before={...skill};Object.assign(skill,route.request().postDataJSON(),{revision:1});history=[{id:1,revision:1,action:'EDIT',actor:'가상 관리자',reason:skill.reason,before_json:JSON.stringify(before),after_json:JSON.stringify(skill)}];await route.fulfill({json:skill});});
 await page.getByRole('button',{name:'해결 지식',exact:true}).click();await page.getByRole('button',{name:'초안 편집 · 재생성'}).click();await page.getByLabel('초안 해결 방법').fill('수정한 가상 조치');await page.getByLabel('초안 변경 사유').fill('가상 검증 절차 보완');await page.getByRole('button',{name:'수정 내용 저장',exact:true}).click();await expect(page.getByText('버전 1 · 관리자 수정 · 가상 관리자')).toBeVisible();await page.getByText('버전 1 · 관리자 수정 · 가상 관리자').click();await expect(page.getByText('이전: 기존 가상 조치')).toBeVisible();await expect(page.getByText('변경: 수정한 가상 조치')).toBeVisible();
});

test('similar history explains matching and never mutates an incident',async({page})=>{
 const mutations=await setup(page);await page.route('**/api/incidents/*/similar',route=>route.fulfill({json:{note:'원인 확률이 아닙니다.',items:[{id:'INC-FICTIONAL-PAST',title:'가상 과거 장애',similarity:71,matchedTerms:['연결'],sameAsset:true,notes:'가상 연결 수 검증',prevention:'가상 점검 추가'}]}}));await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();await page.getByText('비슷한 과거 장애와 당시 조치 보기').click();await expect(page.getByText('당시 조치: 가상 연결 수 검증')).toBeVisible();await expect(page.getByText('원인 확률이 아닙니다.')).toBeVisible();expect(mutations).toEqual([]);
});

test('new evaluation separates keyword baseline actual AI and legacy demonstration scores',async({page})=>{
 await setup(page,undefined,'ADMIN',{}, {evaluations:[{id:'EVAL-KO',status:'COMPLETED',mode:'REAL',provider:'LOCAL',created_at:'2026-10-12T00:00:00Z',result_json:JSON.stringify({datasetVersion:'ko-incident-v1',passed:52,total:100,accuracy:.52,baselinePassed:35,actualAiPassed:40,actualAiCount:80,errors:2,denominators:{type:60,severity:40,department:60,recurrence:30},note:'가상 평가 · 실운영 성능 아님'})}]});await page.getByText('관리자 메뉴',{exact:true}).first().click();await page.getByRole('button',{name:'AI 품질 관리',exact:true}).click();await expect(page.getByRole('button',{name:'한국어 100건 · 실제 Jev 평가'})).toBeVisible();await expect(page.getByText(/기존 영어 키워드 기준선 35\/100/)).toBeVisible();await expect(page.getByText(/실제 AI만 40\/80건/)).toBeVisible();
});


test('demo session bypasses login, hides account administration and revocation returns to login',async({page})=>{
  await setup(page);let issued=false;
  await page.route('**/api/config',r=>r.fulfill(issued?{json:{user:{id:'DEMO-test',role:'DEMO_ADMIN',kind:'DEMO',displayName:'시연 참가자',operatorId:'OP-01'},defaultProvider:'LOCAL',hermes:{},fictional:true}}:{status:401,json:{error:'login'}}));
  await page.route('**/api/session',r=>{expect(r.request().postDataJSON()).toEqual({mode:'demo'});issued=true;return r.fulfill({json:{ok:true,user:{role:'DEMO_ADMIN'}}});});
  await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'DEMO-test',role:'DEMO_ADMIN'}}}));
  await page.reload();await expect(page.getByText('시연모드 활성화',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'관제센터 시작'})).toHaveCount(0);
  await page.getByText('관리자 메뉴',{exact:true}).click();await expect(page.getByRole('button',{name:'계정 관리',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'AI 품질 관리',exact:true})).toBeVisible();
  await page.route('**/api/auth/me',r=>r.fulfill({status:401,json:{error:'시연 종료'}}));
  await expect(page.getByRole('tab',{name:'개인 계정',exact:true})).toBeVisible({timeout:8000});
});

test('manual knowledge saves an owned draft and requests approval without exposing approval to users',async({page})=>{
 const skills:any[]=[];await setup(page,undefined,'USER',{}, {skills});
 await page.route('**/api/skills',async r=>{if(r.request().method()==='POST'){const body=r.request().postDataJSON();expect(body.assetIds).toContain('ASSET-0');skills.push({...body,id:'SKL-MANUAL-TEST',source_kind:'MANUAL_ENTRY',created_by:'bootstrap-admin',status:'DRAFT',revision:0});return r.fulfill({json:skills[0]});}return r.fallback();});
 await page.route('**/api/skills/SKL-MANUAL-TEST/submit',r=>{expect(r.request().postDataJSON()).toEqual({revision:0});skills[0].status='PENDING';skills[0].revision=1;return r.fulfill({json:skills[0]});});
 await page.getByRole('button',{name:'해결 지식',exact:true}).click();await page.getByRole('button',{name:'지식 직접 등록',exact:true}).click();
 const form=page.getByRole('form',{name:'지식 직접 등록',exact:true});for(const label of ['지식 제목','발생 조건','주요 증상','점검 절차','해결 방법','주의사항'])await form.getByRole('textbox',{name:label,exact:true}).fill('가상 DB 대응 '+label);
 await form.getByRole('checkbox',{name:'가상 자산 0',exact:true}).check();await form.getByRole('button',{name:'임시 저장',exact:true}).click();await expect(page.getByRole('heading',{name:'가상 DB 대응 지식 제목',exact:true})).toBeVisible();await page.getByRole('button',{name:'승인 요청',exact:true}).click();await expect(page.getByText('승인 대기',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'해결 절차 승인',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/integrated-manual-knowledge.png',fullPage:true});
});

test('saved ontology impact shows direct and indirect scope and approval summary without mutation',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const mutations=await setup(page,undefined,'ADMIN',{status:'WAITING_APPROVAL',impact:{engine:'NEO4J',root:'ASSET-12',affected:['ASSET-12','ASSET-13','ASSET-14'],direct:['ASSET-13'],indirect:['ASSET-14']}});
 await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();const dialog=page.getByRole('dialog',{name:'장애 상세'});await expect(dialog.getByRole('region',{name:'승인 전 영향 범위'})).toContainText('분석 엔진: NEO4J');await dialog.getByRole('button',{name:'전체 영향도 보기',exact:true}).click();
 const impact=dialog.getByRole('region',{name:'장애 영향도',exact:true});await expect(impact).toContainText('직접 영향 1개 · 간접 영향 1개');await impact.getByRole('button',{name:'영향 자산만',exact:true}).click();await expect(impact.locator('.react-flow__node')).toHaveCount(3);await impact.getByRole('combobox',{name:'영향 범위'}).selectOption('direct');await expect(impact.locator('.react-flow__node')).toHaveCount(2);await impact.locator('.react-flow__node[data-id="ASSET-12"]').click();await expect(impact.getByRole('region',{name:'자산별 대응 정보'})).toBeVisible();
 await page.screenshot({path:'test-results/integrated-ontology.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.locator('body').evaluate(el=>el.scrollWidth<=window.innerWidth)).toBe(true);expect(mutations).toEqual([]);
});

test('missing ontology evidence is never shown as completed impact',async({page})=>{
 await setup(page,undefined,'ADMIN',{status:'NEEDS_REVIEW',impact:null});await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();const impact=page.getByRole('region',{name:'장애 영향도',exact:true});await expect(impact).toContainText('저장된 영향도 분석 결과가 없습니다');await expect(impact.getByRole('button',{name:'전체화면',exact:true})).toHaveCount(0);
});

async function activityStreamFixture(page: Page) {
  await page.clock.install();
  await page.addInitScript(() => {
    (window as any).activityStreams = [];
    class Source {
      onopen: any; onerror: any; listeners: any = {}; closed = false;
      constructor() { (window as any).activityStreams.push(this); setTimeout(() => this.onopen?.(), 0); }
      addEventListener(name: string, listener: any) { this.listeners[name] = listener; }
      close() { this.closed = true; }
    }
    (window as any).EventSource = Source;
  });
}

test('idle screen stops polling and SSE then resumes once without losing an unsaved form', async ({page}) => {
  await activityStreamFixture(page);
  const mutations = await setup(page, undefined, 'ADMIN', {status:'RESOLVED',notes:'',prevention:''});
  let reads = 0;
  page.on('request', r => { if (r.method()==='GET' && new URL(r.url()).pathname.startsWith('/api/')) reads++; });
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const notes=page.getByRole('textbox',{name:'조치 후기',exact:true});
  await notes.fill('저장하지 않은 가상 후기');
  await page.clock.runFor(300100);
  await expect.poll(()=>page.evaluate(()=>(window as any).activityStreams.at(-1).closed)).toBe(true);
  const stopped=reads; await page.clock.runFor(120000); expect(reads).toBe(stopped);
  await notes.press('End'); await notes.press('a');
  await expect.poll(()=>page.evaluate(()=>(window as any).activityStreams.length)).toBe(2);
  await expect(notes).toHaveValue('저장하지 않은 가상 후기a');
  await page.clock.runFor(1000); const resumed=reads;
  await notes.press('b'); await notes.press('c'); await page.clock.runFor(1000);
  expect(reads).toBe(resumed);
  expect(mutations).toEqual([]);
});

test('visible running work is tracked past idle and closes its stream when work finishes', async ({page}) => {
  await activityStreamFixture(page);
  await setup(page, undefined, 'ADMIN', {status:'ANALYZING',notes:'',prevention:''});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await page.clock.runFor(300100);
  expect(await page.evaluate(()=>(window as any).activityStreams.at(-1).closed)).toBe(false);
  await page.route('**/api/incidents/INC-UI-RESOLVED',route=>route.fulfill({json:{...rows[0],status:'WAITING_APPROVAL'}}));
  await page.route('**/api/incidents?*',route=>route.fulfill({json:rows.map(r=>({...r,status:'WAITING_APPROVAL'}))}));
  await page.evaluate(()=>(window as any).activityStreams.at(-1).listeners.stage({data:JSON.stringify({id:99,incident_id:'INC-UI-RESOLVED',stage:'INCIDENT',state:'COMPLETED',created_at:new Date().toISOString(),message:'가상 분석 완료'})}));
  await page.clock.runFor(500);
  await expect.poll(()=>page.evaluate(()=>(window as any).activityStreams.at(-1).closed)).toBe(true);
});

test('hidden running work stops requests and returning refreshes and reconnects', async ({page}) => {
  await activityStreamFixture(page);
  await setup(page, undefined, 'ADMIN', {status:'ANALYZING'});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click(); await page.clock.runFor(1000);
  let reads=0; page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname.startsWith('/api/'))reads++;});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).activityStreams.at(-1).closed)).toBe(true);
  const stopped=reads; await page.clock.runFor(120000); expect(reads).toBe(stopped);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).activityStreams.length)).toBe(2);
  await expect.poll(()=>reads).toBeGreaterThan(stopped);
});

for (const view of ['AI 품질 관리','운영 현황']) test(`idle ${view} stops its background lists`, async ({page}) => {
  await page.clock.install(); await setup(page);
  await page.getByText('관리자 메뉴',{exact:true}).first().click();
  await page.getByRole('button',{name:view,exact:true}).click();
  let reads=0; page.on('request',r=>{if(r.method()==='GET'&&/\/api\/(operations|evaluations|audit)/.test(new URL(r.url()).pathname))reads++;});
  await page.clock.runFor(300100); const stopped=reads;
  await expect(page.getByText("자동 새로고침 일시 중지 · 화면을 조작하면 재개됩니다.",{exact:true})).toBeVisible();
  await page.clock.runFor(120000); expect(reads).toBe(stopped);
  await page.keyboard.press('Shift'); await expect.poll(()=>reads).toBeGreaterThan(stopped);
});

for (const width of [390, 1280]) test(`login cold start guides waiting and sends credentials once at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  let probes=0, writes=0;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/readiness') return route.fulfill({status:++probes<3?503:200,json:{ready:probes>=3}});
    if(path==='/api/session' && route.request().postDataJSON().mode==='login') writes++;
    return route.fulfill({status:401,json:{error:'검증용 인증 실패'}});
  });
  await page.goto('/');
  await page.getByLabel('아이디',{exact:true}).fill('fictional.user');
  await page.getByLabel('비밀번호',{exact:true}).fill('fictional-password');
  await page.getByRole('button',{name:'관제센터 시작'}).click();
  await expect(page.getByRole('status')).toContainText('서버 연결을 준비하고 있습니다');
  expect(writes).toBe(0);
  await expect(page.getByRole('button',{name:'연결 중'})).toBeDisabled();
  await expect(page.getByRole('alert').filter({hasText:'검증용 인증 실패'})).toContainText('검증용 인증 실패');
  expect(writes).toBe(1); expect(probes).toBe(3);
});
