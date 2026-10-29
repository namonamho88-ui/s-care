import {test,expect} from '@playwright/test';

// Opt-in: scripts/verify-war-room-live.ps1 starts an isolated H2 backend, no cloud access.
test('real BFF cookies, two browser guests, admin approval and shared knowledge draft',async({browser})=>{
 test.skip(process.env.WAR_ROOM_LIVE!=='true','Requires isolated local backend');test.setTimeout(120000);
 const a=await browser.newContext({reducedMotion:'reduce'}),b=await browser.newContext({reducedMotion:'reduce'}),admin=await browser.newContext({reducedMotion:'reduce'});
 try{
  const pa=await a.newPage(),pb=await b.newPage();const identities:string[]=[];
  for(const page of [pa,pb]){await page.goto('/war-room?room=live-qa');const reply=page.waitForResponse(r=>r.url().endsWith('/api/war-session'));await page.getByRole('button',{name:'3D 워룸 입장'}).click();identities.push((await (await reply).json()).id);await expect(page.locator('.wr-header-state')).toContainText('연결됨');}
  await expect(pa.locator('.wr-header-state')).toContainText('2/20');await expect(pb.locator('.wr-header-state')).toContainText('2/20');
  const cookie=(await a.cookies('http://127.0.0.1:3100/api/war-session')).find(c=>c.name==='war_guest');expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  expect((await a.request.get('/api/incidents')).status()).toBe(401);
  expect((await a.request.post('/api/war-room/rooms/live-qa/decision',{data:{approved:true,revision:0,reason:'guest attempt'},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(401);
  await pa.getByLabel('팀 채팅 메시지').fill('서로 다른 브라우저의 합성 장애 협업');await pa.getByRole('button',{name:'전송',exact:true}).click();await expect(pb.getByRole('log')).toContainText('서로 다른 브라우저');
  const login=await admin.request.post('/api/session',{data:{mode:'admin',token:process.env.WAR_ROOM_TEST_ADMIN},headers:{Origin:'http://127.0.0.1:3100'}});expect(login.ok()).toBe(true);expect(await login.json()).not.toHaveProperty('token');
  expect((await admin.request.post('/api/war-room/rooms/live-qa/start',{data:{revision:0,scenario:'DATABASE'},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(403);
  const invitation=await admin.request.post('/api/auth/users',{data:{login:'war-browser-admin',displayName:'가상 브라우저 검증 관리자',role:'ADMIN',operatorId:'OP-01'},headers:{Origin:'http://127.0.0.1:3100'}});expect(invitation.ok()).toBe(true);
  const activated=await admin.request.post('/api/session',{data:{mode:'activate',login:'war-browser-admin',password:'Fictional-browser-pass-123!',inviteCode:(await invitation.json()).inviteCode},headers:{Origin:'http://127.0.0.1:3100'}});expect(activated.ok()).toBe(true);expect((await activated.json()).user.kind).toBe('ACCOUNT');
  const pc=await admin.newPage();const states:string[]=[];pc.on('websocket',ws=>{ws.on('framereceived',e=>{try{const v=JSON.parse(String(e.payload));if(v.type==='state')states.push(`${v.revision}:${v.run.status}:${v.busy}`);}catch{}});ws.on('close',()=>states.push('socket closed'));});await pc.goto('/war-room?room=live-qa');await pc.getByRole('button',{name:'3D 워룸 입장'}).click();await expect(pc.getByRole('button',{name:'시나리오 시작',exact:true})).toBeEnabled();
  const started=pc.waitForResponse(r=>r.url().endsWith('/rooms/live-qa/start'),{timeout:30000});await pc.getByRole('button',{name:'시나리오 시작',exact:true}).click();const startResponse=await started;expect(startResponse.status(),await startResponse.text()).toBe(200);await expect(pa.locator('.wr-incident-pill')).toContainText('장애 발생');
  for(const label of ['원인 · 영향 분석','복구 전략 생성','가상 결과 비교','선택안 승인 요청']){try{await expect(pc.getByRole('button',{name:label,exact:true})).toBeEnabled({timeout:10000});}catch(e){console.log('Observed authoritative states',states);console.log('Current status',await pc.locator('.wr-incident-pill').innerText(),await pc.locator('.wr-header-state').innerText());throw e;}await pc.getByRole('button',{name:label,exact:true}).click();}
  await expect(pb.locator('.wr-incident-pill')).toContainText('승인 대기');await pc.getByLabel('승인·반려 사유',{exact:true}).fill('합성 복구 결과와 잔여 위험을 검토했습니다.');await pc.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true}).click();await expect(pa.locator('.wr-complete')).toBeVisible();
  await pc.getByRole('button',{name:'검증 결과를 지식 초안으로 저장'}).click();await expect(pb.locator('.wr-steps .done')).toHaveCount(6);
  await pa.reload();const restored=pa.waitForResponse(r=>r.url().endsWith('/api/war-session'));await pa.getByRole('button',{name:'3D 워룸 입장'}).click();expect((await (await restored).json()).id).toBe(identities[0]);await expect(pa.locator('.wr-header-state')).toContainText('연결됨');await expect(pa.locator('.wr-steps .done')).toHaveCount(6);
  await pa.screenshot({path:'test-results/war-room-live.png',fullPage:true});
 }finally{await Promise.all([a.close(),b.close(),admin.close()]);}
});
