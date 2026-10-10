import { test, expect, type Page } from '@playwright/test';

// Isolated UI fixtures. These tests do not call or change cloud incidents/models.
const assets = Array.from({ length: 52 }, (_, i) => ({ id: `ASSET-${i}`, name: `가상 자산 ${i}`, kind: i < 12 ? 'SYSTEM' : ['API', 'SERVER', 'DATABASE', 'BATCH'][i % 4], system_id: i < 12 ? null : `ASSET-${i % 12}` }));
const edges = Array.from({ length: 80 }, (_, i) => ({ source_id: `ASSET-${i % 52}`, target_id: `ASSET-${(i % 52 + (i < 52 ? 1 : 7)) % 52}` }));
const rows = [
  { id: 'INC-UI-RESOLVED', title: '가상 자원 부족 장애', type: 'RESOURCE', status: 'RESOLVED' },
  { id: 'INC-UI-CLOSED', title: '가상 네트워크 장애', type: 'NETWORK', status: 'CLOSED' },
].map(row => ({ ...row, asset_id: 'ASSET-12', asset_name: '가상 자산 12', system_name: '가상 업무', severity: 'P1', owner_id: 'OP-01', owner_name: '가상 담당자', department: 'PLATFORM', created_at: '2026-10-10T12:00:00Z', notes: '저장된 조치 후기', prevention: '저장된 예방 대책', observations: 'Fictional CPU usage 96%', decision: null, tasks: [], events: [], audit: [], impact: { root: 'ASSET-12', affected: ['ASSET-12','ASSET-13','ASSET-14'], engine: 'NEO4J' } }));

async function setup(page: Page) {
  const records = structuredClone(rows);
  const mutations: string[] = [];
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data: unknown = {};
    if (request.method() !== 'GET') mutations.push(path);
    if (path === '/api/config') data = { database: 'POSTGRESQL', graph: 'NEO4J', defaultProvider: 'LOCAL', a2a: '0.3.0', hermes: { apiReachable: false }, fictional: true };
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
