import { test, expect, type Page } from '@playwright/test';

// Isolated UI fixtures. These tests do not call or change cloud incidents/models.
const assets = Array.from({ length: 52 }, (_, i) => ({ id: `ASSET-${i}`, name: `가상 자산 ${i}`, kind: i < 12 ? 'SYSTEM' : ['API', 'SERVER', 'DATABASE', 'BATCH'][i % 4], system_id: i < 12 ? null : `ASSET-${i % 12}` }));
const edges = Array.from({ length: 80 }, (_, i) => ({ source_id: `ASSET-${i % 52}`, target_id: `ASSET-${(i % 52 + (i < 52 ? 1 : 7)) % 52}` }));
const rows = [
  { id: 'INC-UI-RESOLVED', title: '가상 자원 부족 장애', type: 'RESOURCE', status: 'RESOLVED' },
  { id: 'INC-UI-CLOSED', title: '가상 네트워크 장애', type: 'NETWORK', status: 'CLOSED' },
].map(row => ({ ...row, asset_id: 'ASSET-12', asset_name: '가상 자산 12', system_name: '가상 업무', severity: 'P1', owner_id: 'OP-01', owner_name: '가상 담당자', department: 'PLATFORM', created_at: '2026-10-10T12:00:00Z', notes: '저장된 조치 후기', prevention: '저장된 예방 대책', observations: 'Fictional CPU usage 96%', decision: null, tasks: [], events: [], audit: [], impact: { root: 'ASSET-12', affected: ['ASSET-12','ASSET-13','ASSET-14'], engine: 'NEO4J' } }));

async function setup(page: Page, recoveryNotes?: string, role = "ADMIN", initial: Record<string, unknown> = {}) {
  const records = structuredClone(rows);
  Object.assign(records[0], initial);
  records[1].owner_id="OP-02";
  if (recoveryNotes !== undefined) Object.assign(records[0], {notes:recoveryNotes,events:[{id:1,stage:'VERIFY',state:'COMPLETED',message:'가상 복구 검증',data_json:recoveryNotes,created_at:'2026-10-10T12:01:00Z'}]});
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data: unknown = {};
    if (request.method() !== 'GET') mutations.push(path);
    if (path === '/api/config') data = { user: { id:'bootstrap-admin', role, kind:role === 'ADMIN' ? 'BOOTSTRAP' : 'ACCOUNT', displayName:'가상 검증 사용자', operatorId:'OP-01' }, database: 'POSTGRESQL', graph: 'NEO4J', defaultProvider: 'LOCAL', a2a: '0.3.0', hermes: { apiReachable: false }, fictional: true };
    else if (path === '/api/catalog') data = { assets, operators: [{ id:'OP-01', name:'가상 담당자', department:'PLATFORM' }], scenarios:[{id:'SCN-01',title:'가상 시나리오'}], manuals:[] };
    else if (path === '/api/graph') data = { nodes:assets, edges, engine:'NEO4J' };
    else if (path === '/api/skills' || path === '/api/audit') data=[];
    else if (path === '/api/evaluations') data=[{id:'EVAL-FAILED',status:'FAILED',mode:'REAL',provider:'LOCAL',created_at:'2026-10-10T12:00:00Z',result_json:JSON.stringify({error:'테스트용 연결 오류'})}];
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
    await route.fulfill({json:data});
  });
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'AI Incident Command Center'})).toBeVisible();
  return mutations;
}

test('fullscreen fills the viewport, fit keeps every node visible, Escape returns focus', async ({page}) => {
  await page.setViewportSize({width:1440,height:960});
  const mutations=await setup(page);
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
  await page.getByRole('button',{name:'후기 & 보고서',exact:true}).click();
  await page.getByRole('textbox',{name:'조치 후기',exact:true}).fill('수정된 가상 복구 후기');
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeDisabled();
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
  await page.getByRole('button',{name:'후기 & 보고서',exact:true}).click();
  const notes=page.getByRole('textbox',{name:'조치 후기',exact:true});
  await expect(notes).toHaveValue(/오류율: 12.5% → 0.02%/);
  await expect(notes).toHaveValue(/실제 운영 시스템은 변경하지 않았습니다/);
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeDisabled();
  await page.getByText('복구 검증 원본 보기',{exact:true}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'}).locator('details[open] pre')).toContainText('SIMULATED_METRICS');
  await notes.fill((await notes.inputValue())+'\n담당자 확인: 가상 관측과 검증 결과를 대조했습니다.');
  const saved=page.waitForRequest(request=>request.method()==='PATCH');
  await page.getByRole('button',{name:'수정 내용 저장'}).click();
  expect((await saved).postDataJSON().notes).toContain('담당자 확인: 가상 관측과 검증 결과를 대조했습니다.');
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toBeEnabled();
  await expect(page.getByText('가상 복구 검증 결과를 한국어 후기 초안으로 정리했습니다.',{exact:false})).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'장애 상세'}).locator('details[open] pre')).toContainText('SIMULATED_METRICS');
});


test('user role hides administrator controls and allows only owned incident notes', async ({page}) => {
  const mutations=await setup(page, undefined, 'USER');
  await expect(page.getByRole('button',{name:'Harness & 평가',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'계정 관리',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'가상 장애 발생',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'장애 이력',exact:true}).click();
  await page.getByRole('button',{name:/P1 가상 자원 부족 장애/}).click();
  await page.getByRole('button',{name:'후기 & 보고서',exact:true}).click();
  await expect(page.getByLabel('장애 제목',{exact:true})).toBeDisabled();
  await expect(page.getByLabel('담당자',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'장애 종료',exact:true})).toHaveCount(0);
  await page.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 사용자 후기');
  const patch=page.waitForRequest(r=>r.method()==='PATCH');
  await page.getByRole('button',{name:'수정 내용 저장',exact:true}).click();
  expect((await patch).postDataJSON()).toEqual({notes:'가상 사용자 후기',prevention:'저장된 예방 대책'});
  await page.getByRole('button',{name:'상세 닫기'}).click();
  await page.getByRole('button',{name:/P1 가상 네트워크 장애/}).click();
  await page.getByRole('button',{name:'후기 & 보고서',exact:true}).click();
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

test('guide follows backend transitions and navigation never approves or closes', async ({page}) => {
  await page.clock.install();
  const mutations=await setup(page,undefined,'ADMIN',{status:'ANALYZING'});
  const record:any={...rows[0],status:'ANALYZING',events:[{id:1,stage:'JEV',state:'RUNNING',message:'가상 분석 실행',data_json:'{}',created_at:'2026-10-10T12:00:00Z'}]};
  const commands:string[]=[];
  await page.route('**/api/incidents/INC-UI-RESOLVED',async route=>{
    if(route.request().method()==='PATCH') {commands.push('save');Object.assign(record,route.request().postDataJSON());}
    await route.fulfill({json:record});
  });
  for(const [suffix,status] of [['review','WAITING_APPROVAL'],['approval','RECOVERING'],['close','CLOSED']]) {
    await page.route('**/api/incidents/INC-UI-RESOLVED/'+suffix,async route=>{commands.push(suffix);record.status=status;await route.fulfill({json:record});});
  }
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}), guide=dialog.getByRole('region',{name:'장애 처리 길잡이'});
  await expect(guide.locator('[aria-current="step"]')).toContainText('분석·판단 확인');
  await expect(guide).toContainText('AI 장애 판단 · Jev · 진행 중');
  record.status='NEEDS_REVIEW';
  await page.clock.runFor(5100);
  await guide.getByRole('button',{name:'판단 확인 위치로 이동'}).click();
  await expect(dialog.locator('#guide-review')).toBeFocused();
  await expect(dialog.getByRole('button',{name:'판단 확정 & 분석 계속'})).toBeDisabled();
  expect(commands).toEqual([]);
  const reason=dialog.getByRole('textbox',{name:'확인 근거',exact:true});
  await reason.fill('가상 CPU 관측을 확인했습니다.');
  await page.clock.runFor(5100);
  await expect(reason).toHaveValue('가상 CPU 관측을 확인했습니다.');
  await expect(reason).toBeFocused();
  await dialog.getByRole('button',{name:'판단 확정 & 분석 계속'}).click();
  await expect(guide.locator('[aria-current="step"]')).toContainText('대응 승인');
  await guide.getByRole('button',{name:'대응 승인 위치로 이동'}).click();
  await expect(dialog.locator('#guide-approval')).toBeFocused();
  expect(commands).toEqual(['review']);
  await dialog.getByRole('textbox',{name:'승인 / 거부 사유',exact:true}).fill('영향 범위를 검토했고 가상 복구만 승인합니다.');
  await dialog.getByRole('button',{name:'대응 승인',exact:true}).click();
  await expect(guide.locator('[aria-current="step"]')).toContainText('복구 검증');
  record.status='RESOLVED';record.notes='';record.prevention='';
  await page.clock.runFor(5100);
  await expect(guide.locator('[aria-current="step"]')).toContainText('후기 검토·저장');
  await guide.getByRole('button',{name:'후기 작성 위치로 이동'}).click();
  await expect(dialog.locator('#guide-notes')).toBeFocused();
  await expect(dialog.getByRole('button',{name:'장애 종료',exact:true})).toBeDisabled();
  await dialog.getByRole('textbox',{name:'조치 후기',exact:true}).fill('가상 복구 지표를 확인했습니다.');
  await dialog.getByRole('textbox',{name:'재발 방지 대책',exact:true}).fill('가상 부하 테스트를 추가합니다.');
  await dialog.getByRole('button',{name:'수정 내용 저장'}).click();
  await expect(guide.locator('[aria-current="step"]')).toContainText('장애 종료');
  await guide.getByRole('button',{name:'최종 확인 위치로 이동'}).click();
  await expect(dialog.locator('#guide-notes')).toBeFocused();
  expect(commands).toEqual(['review','approval','save']);
  await dialog.getByRole('button',{name:'장애 종료',exact:true}).click();
  await expect(guide).toContainText('전체 단계 완료');
  await expect(guide.locator('[aria-current="step"]')).toHaveCount(0);
  await expect(guide.locator('li.complete')).toHaveCount(6);
  await guide.getByRole('button',{name:'보고서 위치로 이동'}).click();
  await expect(dialog.locator('#guide-report')).toBeFocused();
  expect(commands).toEqual(['review','approval','save','close']);
  expect(mutations).toEqual([]);
});

test('mobile guide fits and takes a waiting user to read-only analysis above the sticky header',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const mutations=await setup(page,undefined,'USER',{status:'WAITING_APPROVAL'});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}), guide=dialog.getByRole('region',{name:'장애 처리 길잡이'});
  await expect(guide).toContainText('관리자 승인 대기');
  await expect(guide.locator('[aria-current="step"]')).toContainText('대응 승인');
  await expect(dialog.getByRole('button',{name:'대응 승인',exact:true})).toHaveCount(0);
  await expect.poll(()=>guide.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await expect.poll(()=>dialog.locator('.drawer').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await guide.getByRole('button',{name:'분석 결과 보기'}).click();
  await expect(dialog.locator('#guide-analysis')).toBeFocused();
  await expect.poll(()=>dialog.evaluate(el=>{
    const target=el.querySelector('#guide-analysis')!.getBoundingClientRect(),head=el.querySelector('.drawer-head')!.getBoundingClientRect();
    return target.top>=head.bottom-1 && target.top<window.innerHeight;
  })).toBe(true);
  expect(mutations).toEqual([]);
});

test('failure guide shows error records before retry without executing a request',async({page})=>{
  const mutations=await setup(page,undefined,'ADMIN',{status:'FAILED',events:[{id:1,stage:'FAILURE',state:'FAILED',message:'가상 연결 오류',data_json:'{}',created_at:'2026-10-10T12:00:00Z'}]});
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  const dialog=page.getByRole('dialog',{name:'장애 상세'}), guide=dialog.getByRole('region',{name:'장애 처리 길잡이'});
  await expect(guide).toContainText('실행 실패 · 확인 필요');
  await guide.getByRole('button',{name:'오류 기록 보기'}).click();
  await expect(dialog.locator('#guide-timeline')).toBeFocused();
  await expect(dialog.locator('#guide-timeline')).toContainText('가상 연결 오류');
  await dialog.getByRole('button',{name:'원인 해결 후 재시도 위치로 이동'}).click();
  await expect(dialog.locator('#guide-retry')).toBeFocused();
  await expect(dialog.getByRole('button',{name:'실패 작업 재시도',exact:true})).toBeVisible();
  expect(mutations).toEqual([]);
});

test('replaying a long SSE history does not flood or starve the initial detail read',async({page})=>{
  await setup(page);
  let reads=0,active=0,maxActive=0;
  await page.route('**/api/incidents/INC-UI-RESOLVED',async route=>{
    reads++;active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,700));
    await route.fulfill({json:{...rows[0],status:'NEEDS_REVIEW'}});
    active--;
  });
  await page.route('**/api/incidents/INC-UI-RESOLVED/events',route=>route.fulfill({contentType:'text/event-stream',body:'retry: 60000\n\n'+Array.from({length:20},(_,i)=>`id: ${i+1}\nevent: stage\ndata: {}\n\n`).join('')}));
  await page.getByRole('button',{name:/INC-UI-RESOLVED/}).click();
  await expect(page.getByRole('dialog',{name:'장애 상세'}).getByRole('button',{name:'판단 확인 위치로 이동',exact:true})).toBeVisible({timeout:4000});
  expect(maxActive).toBe(1);
  expect(reads).toBeLessThanOrEqual(2);
});
