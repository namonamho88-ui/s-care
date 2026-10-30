import {test,expect,chromium} from '@playwright/test';

// Opt-in: scripts/verify-war-room-live.ps1 starts an isolated H2 backend, no cloud access.
test('real BFF cookies, two browser guests, admin approval and shared knowledge draft',async({browser})=>{
 test.skip(process.env.WAR_ROOM_LIVE!=='true','Requires isolated local backend');test.setTimeout(180000);
 const browserA=await chromium.launch(),browserB=await chromium.launch();
 const a=await browserA.newContext({reducedMotion:'reduce',viewport:{width:800,height:700}}),b=await browserB.newContext({reducedMotion:'reduce',viewport:{width:800,height:700}}),admin=await browser.newContext({reducedMotion:'reduce',viewport:{width:800,height:700}});
 try{
  const pa=await a.newPage(),pb=await b.newPage();const identities:string[]=[];
  await pa.addInitScript(()=>{const Native=window.WebSocket;(window as any).__warSockets=[];window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);(window as any).__warSockets.push(this);}};});
  for(const page of [pa,pb]){await page.goto('/war-room?room=live-qa');const reply=page.waitForResponse(r=>r.url().endsWith('/api/war-session'));await page.getByRole('button',{name:'3D 워룸 입장'}).click();identities.push((await (await reply).json()).id);await expect(page.locator('.wr-header-state')).toContainText('연결됨');}
  await expect(pa.locator('.wr-top-actions')).toContainText('2/20');await expect(pb.locator('.wr-top-actions')).toContainText('2/20');
  const cookie=(await a.cookies('http://127.0.0.1:3100/api/war-session')).find(c=>c.name.startsWith('war_guest_'));expect(cookie?.httpOnly).toBe(true);expect(cookie?.sameSite).toBe('Strict');
  expect((await a.request.get('/api/incidents')).status()).toBe(401);
  expect((await a.request.post('/api/war-room/rooms/live-qa/decision',{data:{approved:true,revision:0,reason:'guest attempt'},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(401);
  await pa.getByRole('button',{name:'대화',exact:true}).click();await pb.getByRole('button',{name:'대화',exact:true}).click();await pa.getByLabel('팀 채팅 메시지').fill('서로 다른 브라우저의 합성 장애 협업');await pa.getByRole('button',{name:'전송',exact:true}).click();await expect(pb.getByRole('log')).toContainText('서로 다른 브라우저');
  const login=await admin.request.post('/api/session',{data:{mode:'admin',token:process.env.WAR_ROOM_TEST_ADMIN},headers:{Origin:'http://127.0.0.1:3100'}});expect(login.ok()).toBe(true);expect(await login.json()).not.toHaveProperty('token');
  expect((await admin.request.post('/api/war-room/rooms/live-qa/start',{data:{revision:0,scenario:'DATABASE'},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(403);
  const invitation=await admin.request.post('/api/auth/users',{data:{login:'war-browser-admin',displayName:'가상 브라우저 검증 관리자',role:'ADMIN',operatorId:'OP-01'},headers:{Origin:'http://127.0.0.1:3100'}});expect(invitation.ok()).toBe(true);
  const activated=await admin.request.post('/api/session',{data:{mode:'activate',login:'war-browser-admin',password:'Fictional-browser-pass-123!',inviteCode:(await invitation.json()).inviteCode},headers:{Origin:'http://127.0.0.1:3100'}});expect(activated.ok()).toBe(true);expect((await activated.json()).user.kind).toBe('ACCOUNT');
  const pc=await admin.newPage();const states:string[]=[];pc.on('websocket',ws=>{ws.on('framereceived',e=>{try{const v=JSON.parse(String(e.payload));if(v.type==='state')states.push(`${v.revision}:${v.run.status}:${v.busy}`);}catch{}});ws.on('close',()=>states.push('socket closed'));});await pc.goto('/war-room?room=live-qa');await pc.getByRole('button',{name:'3D 워룸 입장'}).click();await expect(pa.locator('.wr-top-actions')).toContainText('3/20');await expect(pb.locator('.wr-top-actions')).toContainText('3/20');await expect(pc.locator('.wr-top-actions')).toContainText('3/20');
  for(const page of [pa,pb])await page.getByRole('button',{name:'열린 패널 닫기'}).click();
  for(const page of [pa,pb,pc]){await expect(page.locator('[data-player-id]')).toHaveCount(3);for(const avatar of await page.locator('[data-player-id]').all())await expect(avatar).toBeVisible();}
  const remote=pb.locator(`[data-player-id="${identities[0]}"]`);const before=await remote.getAttribute('data-position');
  await pa.keyboard.down('w');await expect.poll(()=>remote.getAttribute('data-position')).not.toBe(before);await pa.keyboard.up('w');
  const own=pa.locator(`[data-player-id="${identities[0]}"]`);await expect.poll(async()=>{const a=(await own.getAttribute('data-position'))!.split(',').map(Number),b=(await remote.getAttribute('data-position'))!.split(',').map(Number);return Math.hypot(a[0]-b[0],a[1]-b[1]);}).toBeLessThan(.15);
  const frames=await pa.evaluate(()=>new Promise<Record<string,unknown>>(resolve=>{const intervals:number[]=[];let previous=performance.now(),start=previous;function sample(now:number){intervals.push(now-previous);previous=now;if(now-start<2000)requestAnimationFrame(sample);else{intervals.sort((a,b)=>a-b);resolve({frames:intervals.length,durationMs:now-start,p95FrameMs:intervals[Math.floor(intervals.length*.95)],dpr:devicePixelRatio,scope:'one visible Chromium page, three separate browsers, local software WebGL'});}}requestAnimationFrame(sample);}));console.log('WAR_ROOM_FRAME_SAMPLE',JSON.stringify(frames));
  await pa.screenshot({path:'test-results/war-room-three-browsers.png'});
  await pa.evaluate(()=>(window as any).__warSockets.at(-1).close());await expect(pa.locator('.wr-header-state')).toContainText('재접속');await expect(pa.locator('.wr-header-state')).toContainText('연결됨',{timeout:20000});await expect(pa.locator(`[data-player-id="${identities[0]}"]`)).toBeVisible();await expect(pb.locator('.wr-top-actions')).toContainText('3/20');
  for(const page of [pa,pb])await page.getByRole('button',{name:'대화',exact:true}).click();
  await pc.getByRole('button',{name:'시연 진행',exact:true}).click();await expect(pc.getByRole('button',{name:'시나리오 시작',exact:true})).toBeEnabled();
  const started=pc.waitForResponse(r=>r.url().endsWith('/rooms/live-qa/start'),{timeout:30000});await pc.getByRole('button',{name:'시나리오 시작',exact:true}).click();const startResponse=await started;expect(startResponse.status(),await startResponse.text()).toBe(200);await expect(pa.locator('.wr-incident-pill')).toContainText('장애 발생');
  for(const label of ['원인 · 영향 분석','복구 전략 생성','가상 결과 비교','선택안 승인 요청']){try{await expect(pc.getByRole('button',{name:label,exact:true})).toBeEnabled({timeout:10000});}catch(e){console.log('Observed authoritative states',states);console.log('Current status',await pc.locator('.wr-incident-pill').innerText(),await pc.locator('.wr-header-state').innerText());throw e;}await pc.getByRole('button',{name:label,exact:true}).click();}
  await expect(pb.locator('.wr-incident-pill')).toContainText('승인 대기');await pb.reload();await pb.getByRole('button',{name:'3D 워룸 입장'}).click();await expect(pb.locator('.wr-incident-pill')).toContainText('승인 대기');await pb.getByRole('button',{name:'대화',exact:true}).click();await pc.getByLabel('승인·반려 사유',{exact:true}).fill('합성 복구 결과와 잔여 위험을 검토했습니다.');await pc.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true}).click();await pa.getByRole('button',{name:'열린 패널 닫기'}).click();await pb.getByRole('button',{name:'열린 패널 닫기'}).click();await expect(pa.locator('.wr-complete')).toBeVisible();
  await pc.getByRole('button',{name:'검증 결과를 지식 초안으로 저장'}).click();await pb.getByRole('button',{name:'함께 해결',exact:true}).click();await expect(pb.locator('.wr-steps .done')).toHaveCount(6);
  await pa.reload();const restored=pa.waitForResponse(r=>r.url().endsWith('/api/war-session'));await pa.getByRole('button',{name:'3D 워룸 입장'}).click();expect((await (await restored).json()).id).toBe(identities[0]);await expect(pa.locator('.wr-header-state')).toContainText('연결됨');await pa.getByRole('button',{name:'함께 해결',exact:true}).click();await expect(pa.locator('.wr-steps .done')).toHaveCount(6);
  await pa.screenshot({path:'test-results/war-room-live.png',fullPage:true});
 }finally{await Promise.all([a.close(),b.close(),admin.close()]);await Promise.all([browserA.close(),browserB.close()]);}
});

test('ten real sockets exchange bounded movement independently of incident state',async({page})=>{
 test.skip(process.env.WAR_ROOM_LIVE!=='true','Requires isolated local backend');test.setTimeout(90000);
 await page.goto('/war-room');
 const metrics=await page.evaluate(async()=>{
  const clients:{ws:WebSocket;id:string;state:any;bytes:number;frames:number}[]=[];
  const wait=async(predicate:()=>boolean)=>{const start=performance.now();while(!predicate()){if(performance.now()-start>12000)throw Error('socket synchronization timed out');await new Promise(r=>setTimeout(r,50));}};
  try{
   for(let i=0;i<10;i++){
    const response=await fetch('/api/war-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:'ten-peers',clientId:crypto.randomUUID()})});if(!response.ok)throw Error('admission failed');const data=await response.json();
    const ws=new WebSocket(data.ws);const peer={ws,id:data.id,state:null as any,bytes:0,frames:0};clients.push(peer);
    ws.onopen=()=>ws.send(JSON.stringify({type:'join',ticket:data.ticket}));ws.onmessage=e=>{peer.bytes+=new Blob([e.data]).size;peer.frames++;const m=JSON.parse(e.data);if(m.type==='state')peer.state=m;else if(m.type==='presence'&&peer.state)peer.state.players=m.players;};
    await wait(()=>!!peer.state);
   }
   await wait(()=>clients.every(p=>p.state.players.length===10));
   const status=clients[0].state.run.status,revision=clients[0].state.revision;
   const before=clients[9].state.players.find((p:any)=>p.id===clients[0].id).z,start=performance.now();
   const baselineBytes=clients.reduce((n,p)=>n+p.bytes,0);clients[0].ws.send(JSON.stringify({type:'move',x:0,z:-1}));await wait(()=>clients[9].state.players.find((p:any)=>p.id===clients[0].id).z<before);const firstObservedMoveMs=Math.round(performance.now()-start);
   for(let tick=0;tick<20;tick++){for(const p of clients)p.ws.send(JSON.stringify({type:'move',x:0,z:-1}));await new Promise(r=>setTimeout(r,100));}
   await wait(()=>clients[9].state.players.find((p:any)=>p.id===clients[0].id).z<before);
   if(!clients.every(p=>p.state.run.status===status&&p.state.revision===revision))throw Error('movement modified incident state');
   clients[0].ws.close();await wait(()=>clients.slice(1).every(p=>p.state.players.length===9));
   return {peers:10,firstObservedMoveMs,movementBytes:clients.reduce((n,p)=>n+p.bytes,0)-baselineBytes,durationMs:Math.round(performance.now()-start),receivedBytes:clients.reduce((n,p)=>n+p.bytes,0),receivedFrames:clients.reduce((n,p)=>n+p.frames,0),status,rendering:'network only; no 10-device GPU claim'};
  }finally{clients.forEach(p=>p.ws.close());}
 });
 console.log('WAR_ROOM_NETWORK_MEASUREMENT',JSON.stringify(metrics));expect(metrics.peers).toBe(10);
});
