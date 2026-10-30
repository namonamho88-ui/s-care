import {test,expect,type Page} from '@playwright/test';
test.skip(process.env.WAR_ROOM_LIVE!=='true','Requires scripts/verify-city-live.ps1 and isolated local backend');
test.setTimeout(240000);
async function join(page:Page,name:string,room:string,expected='LOBBY'){
 await page.addInitScript(()=>{const Native=window.WebSocket;(window as any).__citySockets=[];(window as any).__cityTraining=null;window.WebSocket=class extends Native{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);(window as any).__citySockets.push(this);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='training')(window as any).__cityTraining=m.training;});}};});
 await page.goto(`/war-room/city?room=${encodeURIComponent(room)}`);await expect(page.getByLabel('닉네임',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'워룸 입장',exact:true}).click();await expect(page.locator('.city-connection')).toContainText('연결됨');await expect(page.locator('.wr-name.self')).toContainText(/나 · (파란수달|차분한곰|든든한펭귄|빠른여우)-/,{timeout:20000});await expect(page.locator('main.city')).toHaveAttribute('data-stage',expected);
}
async function role(page:Page,value:string){if(await page.getByLabel('나의 훈련 역할').inputValue()===value)return;await page.getByLabel('나의 훈련 역할').selectOption(value);await expect.poll(()=>page.evaluate(()=>(window as any).__cityTraining?.role)).toBe(value);}
async function investigate(page:Page,zone:string){await page.getByRole('button',{name:`${zone} 이동 · 확인 →`,exact:true}).click();await page.getByRole('button',{name:'이 구역 조사',exact:true}).click();await page.getByRole('button',{name:'단서 공유',exact:true}).click();await expect(page.getByRole('button',{name:'공유 완료',exact:true})).toBeDisabled();}
async function stage(page:Page,value:string){await expect(page.locator('main.city')).toHaveAttribute('data-stage',value);}
async function chooseCause(page:Page){await role(page,'분석 담당');await page.getByRole('button',{name:/새 버전의 DB 연결 반환 누락/}).click();await expect.poll(()=>page.evaluate(()=>Object.values((window as any).__cityTraining.votes))).toContain('leak');await page.getByRole('button',{name:'근거로 원인 판단',exact:true}).click();await stage(page,'TRIAL');}
async function rollback(page:Page){await role(page,'복구 담당');await page.getByRole('button',{name:'배포 롤백 시험',exact:true}).click();await page.getByRole('button',{name:'배포 롤백 승인 요청',exact:true}).click();await stage(page,'APPROVAL');await expect(page.getByRole('button',{name:'훈련 내 대응 승인',exact:true})).toBeDisabled();await role(page,'상황 책임자');await page.getByRole('button',{name:'훈련 내 대응 승인',exact:true}).click();await stage(page,'READY');await role(page,'복구 담당');await page.getByRole('button',{name:'승인된 조치 실행',exact:true}).click();await stage(page,'EXECUTING');await expect(page.locator('main.city')).toHaveAttribute('data-stage','VERIFY',{timeout:15000});await role(page,'관제 담당');await expect(page.getByRole('button',{name:'서비스 정상화 확인',exact:true})).toBeEnabled({timeout:8000});await page.getByRole('button',{name:'서비스 정상화 확인',exact:true}).click();await stage(page,'RESULT');}
test('two independent contexts share city, clues and timer; isolate rooms, duplicated tabs, reconnect, concurrent clicks and stale epochs',async({browser})=>{
 const a=await browser.newContext({viewport:{width:1440,height:1000}}),b=await browser.newContext({viewport:{width:1440,height:1000}}),c=await browser.newContext({viewport:{width:1024,height:900}});const errors:string[]=[];
 try{
  const pa=await a.newPage(),pb=await b.newPage(),pc=await c.newPage();for(const p of [pa,pb,pc])p.on('pageerror',e=>errors.push(e.message));
  await join(pa,'관제 하나','카드 운영팀');await join(pb,'분석 둘','카드 운영팀');await join(pc,'다른 방','separate');
  for(const p of [pa,pb]){await expect(p.locator('[data-player-id]')).toHaveCount(2);for(const avatar of await p.locator('[data-player-id]').all())await expect(avatar).toBeVisible();}await expect(pc.locator('[data-player-id]')).toHaveCount(1);
  const appearance=await pa.locator('.wr-name.self').getAttribute('data-appearance');expect(await pb.locator('.wr-name.self').getAttribute('data-appearance')).not.toBe(appearance);
  const autoName=await pa.locator('.wr-name.self').innerText();expect(await pb.locator('.wr-name.self').innerText()).not.toBe(autoName);
  const chatRevision=await pa.evaluate(()=>(window as any).__cityTraining.revision);await pa.getByLabel('팀에게 메시지',{exact:true}).fill('DB는 정상입니다. 배포 로그를 확인해 주세요.');await pa.getByRole('button',{name:'보내기',exact:true}).click();await expect(pb.getByRole('log',{name:'팀 대화 기록'})).toContainText('DB는 정상입니다.');await expect(pb.locator('.mc-speech')).toContainText('DB는 정상입니다.');await expect(pc.getByRole('log',{name:'팀 대화 기록'})).not.toContainText('DB는 정상입니다.');expect(await pa.evaluate(()=>(window as any).__cityTraining.revision)).toBe(chatRevision);await pb.evaluate(()=>window.scrollTo(0,0));await pb.screenshot({path:'test-results/mission-control-chat.png',fullPage:true});
  const id=await pa.locator('.wr-name.self').getAttribute('data-player-id'),remote=pb.locator(`[data-player-id="${id}"]`),before=await remote.getAttribute('data-position');await pa.locator('h1').click();await pa.keyboard.down('d');await expect.poll(()=>remote.getAttribute('data-position')).not.toBe(before);await pa.keyboard.up('d');
  // Copying a tab's sessionStorage used to reuse the same HttpOnly guest identity.
  const copiedId=await pa.evaluate(()=>sessionStorage.getItem('war-tab'));const duplicate=await a.newPage();await duplicate.addInitScript(id=>sessionStorage.setItem('war-tab',id!),copiedId);await join(duplicate,'복제 탭','카드 운영팀');await expect(pa.locator('[data-player-id]')).toHaveCount(3);expect(await duplicate.locator('.wr-name.self').getAttribute('data-player-id')).not.toBe(id);await duplicate.close();await expect(pa.locator('[data-player-id]')).toHaveCount(2);
  // Same revision sent concurrently must produce one start, never two epochs.
  const initial=await pa.evaluate(()=>(window as any).__cityTraining);
  await Promise.all([pa,pb].map(p=>p.evaluate(t=>(window as any).__citySockets.at(-1).send(JSON.stringify({type:'training',missionId:t.id,revision:t.revision,op:'start'})),initial)));
  for(const p of [pa,pb])await stage(p,'CLUES');await stage(pc,'LOBBY');await pc.close();
  expect(await pa.evaluate(()=>(window as any).__cityTraining.revision)).toBe(initial.revision+1);
  expect(await pa.evaluate(()=>(window as any).__cityTraining.deadline)).toBe(await pb.evaluate(()=>(window as any).__cityTraining.deadline));
  for(const p of [pa,pb]){const close=p.getByRole('button',{name:'닫기',exact:true});if(await close.count())await close.click();}
  await investigate(pa,'승인 관제석');await investigate(pa,'DB 서버');await role(pb,'분석 담당');await investigate(pb,'애플리케이션 서버');await investigate(pb,'로그 분석석');await stage(pa,'CAUSE');await stage(pb,'CAUSE');await expect(pa.locator('.city-clue.shared')).toHaveCount(4);
  await pa.getByRole('button',{name:'여기 확인해 주세요',exact:true}).click();await expect.poll(()=>pb.evaluate(()=>(window as any).__cityTraining.pings.length)).toBe(1);
  await pa.screenshot({path:'test-results/city-team-clues.png'});
  const late=await c.newPage();await join(late,'중간 합류','카드 운영팀','CAUSE');await expect(late.locator('.city-clue.shared')).toHaveCount(4);expect(await late.evaluate(()=>(window as any).__cityTraining.deadline)).toBe(await pa.evaluate(()=>(window as any).__cityTraining.deadline));await late.close();
  await pa.evaluate(()=>(window as any).__citySockets.at(-1).close());await expect(pa.locator('.city-connection')).toContainText('재접속');await expect(pa.locator('.city-connection')).toContainText('연결됨',{timeout:20000});await stage(pa,'CAUSE');await expect(pa.getByRole('log',{name:'팀 대화 기록'})).toContainText('DB는 정상입니다.');expect(await pa.locator('.wr-name.self').innerText()).toBe(autoName);expect(await pa.locator('.wr-name.self').getAttribute('data-appearance')).toBe(appearance);await expect(pa.locator('.city-clue.shared')).toHaveCount(4);expect(await pa.locator('.wr-name.self').getAttribute('data-player-id')).toBe(id);
  // Departure leaves evidence intact; remaining participant can take every role.
  await pb.getByRole('button',{name:'나가기',exact:true}).click();await expect(pb.getByRole('button',{name:'워룸 입장',exact:true})).toBeVisible();await expect(pa.locator('[data-player-id]')).toHaveCount(1);await chooseCause(pa);
  const exercise=await pa.evaluate(()=>(window as any).__cityTraining);await pa.evaluate(t=>(window as any).__citySockets.at(-1).send(JSON.stringify({type:'training',op:'execute',missionId:t.id,revision:t.revision})),exercise);await expect(pa.locator('.city-alert')).toContainText('현재 단계');await stage(pa,'TRIAL');await pa.getByRole('button',{name:'닫기',exact:true}).click();
  await rollback(pa);await expect(pa.locator('.city-result')).toContainText('미션 성공');await pa.locator('.city-result').scrollIntoViewIfNeeded();await pa.evaluate(()=>window.scrollTo(0,0));await pa.screenshot({path:'test-results/city-team-result.png',fullPage:true});
  expect((await a.request.post('/api/war-room/rooms/city-team/decision',{data:{approved:true},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(401);
  expect((await a.request.get('/api/incidents')).status()).toBe(401);
  await pa.getByRole('button',{name:'같은 팀으로 다시 도전',exact:true}).click();await stage(pa,'LOBBY');await expect(pa.locator('.city-clue.shared')).toHaveCount(0);
  await pa.evaluate(t=>(window as any).__citySockets.at(-1).send(JSON.stringify({type:'training',op:'start',missionId:t.id,revision:t.revision})),exercise);await expect(pa.locator('.city-alert')).toContainText('다른 팀원');await stage(pa,'LOBBY');
  expect(errors).toEqual([]);
 }finally{await Promise.all([a.close(),b.close(),c.close()]);}
});
test('solo tablet completes the mission; presentation is local and all operators remain in view',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:1000},hasTouch:true});
 try{
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await join(page,'혼자 연습','solo');
  await page.getByRole('button',{name:'5분 미션 시작',exact:true}).click();await stage(page,'CLUES');
  await investigate(page,'승인 관제석');await investigate(page,'DB 서버');await role(page,'분석 담당');await investigate(page,'애플리케이션 서버');await investigate(page,'로그 분석석');await chooseCause(page);await rollback(page);
  await page.getByRole('button',{name:'전체 관제실 보기',exact:true}).click();await page.locator('.city-board').evaluate(e=>e.scrollTop=0);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/city-tablet.png'});
  const result=await page.evaluate(()=>(window as any).__cityTraining);
  await page.getByText('발표 시연 도구 · 팀 미션과 분리',{exact:true}).click();await page.getByRole('button',{name:'발표 시연 시작',exact:true}).click();await stage(page,'LOBBY');await page.getByRole('button',{name:'시연 일시정지',exact:true}).click();await page.getByLabel('시연 장면').selectOption('6');await stage(page,'EXECUTING');await page.getByRole('button',{name:'문제 구역 집중 보기',exact:true}).click();await page.getByRole('button',{name:'전체 관제실 보기',exact:true}).click();await page.getByRole('button',{name:'시연 초기화',exact:true}).click();await stage(page,'LOBBY');await page.getByRole('button',{name:'공동 미션으로 돌아가기',exact:true}).click();await stage(page,'RESULT');
  expect(await page.evaluate(()=>(window as any).__cityTraining)).toEqual(result);
  await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'이동 →',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/city-mobile.png'});await page.getByRole('button',{name:'나가기',exact:true}).click();await expect(page.getByRole('button',{name:'워룸 입장',exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});
