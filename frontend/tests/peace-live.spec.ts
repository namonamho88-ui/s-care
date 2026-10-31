import {test,expect,type Page} from '@playwright/test';
import {mkdirSync} from 'node:fs';
test.skip(process.env.WAR_ROOM_LIVE!=='true','Requires scripts/verify-peace-live.ps1 and isolated local backend');
test.setTimeout(480000);
// Avoid continuous GPU readbacks from trace filmstrips; explicit screenshots remain enabled.
test.use({trace:{mode:'retain-on-failure',screenshots:false,snapshots:true}});
const screenshots='../docs/screenshots/peace-room';
async function setup(page:Page,room:string,vibration=true,path?:string){
 await page.addInitScript(supported=>{const w=window as any,N=window.WebSocket;w.__peaceSockets=[];w.__peacePlayers=[];w.__peaceTypes=[];w.__vibrations=[];w.__peacePoses={};document.addEventListener('DOMContentLoaded',()=>new MutationObserver(list=>{for(const m of list){const el=m.target as HTMLElement,id=el.dataset.playerId;if(id)(w.__peacePoses[id]??=new Set()).add(el.dataset.ritualStep);}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-ritual-step']}));
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:supported?(p:number|number[])=>{w.__vibrations.push(p);return true;}:undefined});
  window.WebSocket=class extends N{constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);w.__peaceSockets.push(this);this.addEventListener('message',e=>{const m=JSON.parse(e.data);w.__peaceTypes.push(m.type);if(m.room)w.__peaceRoom=m.room;if(m.players)w.__peacePlayers=m.players;});}};
 },vibration);
 await page.goto(path||`/peace-room?room=${encodeURIComponent(room)}`);await page.locator('canvas').waitFor();await expect(page.locator('.peace-connection')).toContainText('연결됨',{timeout:30000});await expect(page.locator('.wr-name.self')).toBeVisible({timeout:20000});await open(page,'소리와 움직임 설정');await page.getByLabel('저사양',{exact:true}).check();await close(page);
}
async function kind(page:Page,value:string){await expect(page.locator('.peace-action-state')).toHaveAttribute('data-kind',value);}
async function act(page:Page,label:string,value:string){await page.bringToFront();await page.waitForTimeout(550);await page.getByRole('button',{name:label,exact:true}).click();await kind(page,value);await expect(page.locator('.peace-action-state')).not.toContainText('동작을 함께 나누고');}

async function open(page:Page,label:string){const button=page.getByRole('button',{name:label,exact:true});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
async function close(page:Page){if(await page.getByRole('button',{name:'패널 닫기',exact:true}).count())await page.getByRole('button',{name:'패널 닫기',exact:true}).click();}
async function practice(page:Page,style:string,menu='기도하기'){await open(page,menu);await page.getByRole('button',{name:new RegExp('^'+style)}).click();}
async function immersive(page:Page){const world=(await page.locator('.peace-world').boundingBox())!,v=page.viewportSize()!;expect(world.width).toBeGreaterThanOrEqual(v.width*.98);expect(world.height).toBeGreaterThanOrEqual(v.height*.95);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2&&document.documentElement.scrollHeight<=innerHeight+2)).toBe(true);for(const b of await page.locator('.peace-dock button').all()){await expect(b).toBeInViewport();expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);}await expect(page.locator('.peace-panel')).toHaveCount(0);}

test('auto entry gathers root and legacy links in one garden, preserves reload identity and keeps operations links',async({browser})=>{
 const ca=await browser.newContext({viewport:{width:1280,height:800}}),cb=await browser.newContext({viewport:{width:1280,height:800}});
 try{
  const a=await ca.newPage(),b=await cb.newPage();await setup(a,'',true,'/');await setup(b,'old-private-room');
  for(const p of [a,b]){await expect(p.locator('.wr-name')).toHaveCount(2);await expect(p.getByLabel('닉네임',{exact:true})).toHaveCount(0);await expect(p.getByLabel('함께 머무를 방 이름')).toHaveCount(0);expect(await p.evaluate(()=>(window as any).__peaceRoom)).toBe('peace-together');}
  const id=await a.locator('.wr-name.self').getAttribute('data-player-id'),name=await a.locator('.wr-name.self').innerText();
  await a.reload();await expect(a.locator('.peace-connection')).toContainText('연결됨',{timeout:30000});await expect(a.locator('.wr-name.self')).toHaveAttribute('data-player-id',id!);expect(await a.locator('.wr-name.self').innerText()).toBe(name);await expect(b.locator('.wr-name')).toHaveCount(2);
  await a.getByRole('button',{name:'나가기',exact:true}).click();await expect(a.getByRole('button',{name:'다시 들어가기',exact:true})).toBeVisible();await a.waitForTimeout(1000);await expect(b.locator('.wr-name')).toHaveCount(1);await a.getByRole('button',{name:'다시 들어가기',exact:true}).click();await expect(b.locator('.wr-name')).toHaveCount(2);
  const ops=await ca.newPage();await ops.goto('/?view=twin&incident=INC-COMPAT');await expect(ops).toHaveURL(/\/operations\?view=twin&incident=INC-COMPAT$/);await expect(ops.locator('main.peace')).toHaveCount(0);await expect(ops.getByRole('button',{name:'관제센터 시작',exact:true})).toBeVisible();await ops.close();
 }finally{await ca.close();await cb.close();}
});

test('three real guests see movement, faith gestures and chat; common room, duplicate requests, reconnect and admin isolation',async({browser})=>{
 const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1500,height:900}})));const errors:string[]=[];
 try{
  const [a,b,c]=await Promise.all(contexts.map(ctx=>ctx.newPage()));for(const p of [a,b,c])p.on('pageerror',e=>errors.push(e.message));await setup(a,'함께 평온');await setup(b,'함께 평온');await setup(c,'함께 평온');
  for(const p of [a,b,c]){await expect(p.locator('[data-peace-player]')).toHaveCount(3);await expect(p.locator('.wr-name')).toHaveCount(3);for(const avatar of await p.locator('.wr-name').all())await expect(avatar).toBeVisible();}
  const id=(await a.locator('.wr-name.self').getAttribute('data-player-id'))!,remote=b.locator(`[data-player-id="${id}"]`),name=await a.locator('.wr-name.self').innerText();const before=await remote.getAttribute('data-position');await a.getByLabel('평온의 정원',{exact:true}).focus();await a.keyboard.down('s');await expect.poll(()=>remote.getAttribute('data-position')).not.toBe(before);await a.keyboard.up('s');
  await practice(a,'천주교');await act(a,'성호 긋기','cross');await expect(remote).toHaveAttribute('data-ritual-kind','cross');await expect.poll(()=>b.evaluate(id=>Array.from((window as any).__peacePoses[id]||[]),id),{timeout:10000}).toEqual(expect.arrayContaining(['left-shoulder','right-shoulder']));await expect(a.locator('.peace-action-state')).toContainText('성호를 마쳤어요');
  await practice(b,'불교');await act(b,'합장 인사','bow');await practice(c,'이슬람');await act(c,'두아','dua');
  await open(a,'대화');await open(b,'대화');await a.getByLabel('함께 있는 사람에게',{exact:true}).fill('오늘도 모두 무사히.');await a.getByRole('button',{name:'보내기',exact:true}).click();await expect(b.getByRole('log',{name:'평온의 방 대화'})).toContainText('오늘도 모두 무사히.');
  await open(a,'소리와 움직임 설정');await a.getByLabel('저사양',{exact:true}).uncheck();await close(a);await a.waitForTimeout(1500);await immersive(a);mkdirSync(screenshots,{recursive:true});await a.evaluate(()=>window.scrollTo(0,0));await a.screenshot({path:`${screenshots}/three-guests.png`,fullPage:false});
  await open(a,'소리와 움직임 설정');await a.getByLabel('저사양',{exact:true}).check();await close(a);await open(a,'소원 남기기');await a.getByLabel('나의 소원',{exact:true}).fill('내일도 함께 무사히');await a.getByRole('button',{name:'소원 함께 남기기',exact:true}).click();await open(b,'소원 남기기');await expect(b.getByRole('log',{name:'함께 남긴 소원'})).toContainText('내일도 함께 무사히');await close(a);await c.getByLabel('평온의 정원',{exact:true}).focus();await c.keyboard.down('s');await c.waitForTimeout(150);await c.getByRole('button',{name:'나가기',exact:true}).click();await expect(a.locator('.wr-name')).toHaveCount(2);await expect(c.getByRole('button',{name:'다시 들어가기',exact:true})).toBeVisible();await c.waitForTimeout(800);await expect(a.locator('.wr-name')).toHaveCount(2);await c.getByRole('button',{name:'다시 들어가기',exact:true}).click();await expect(c.locator('[data-peace-player]')).toHaveCount(3);await c.waitForTimeout(500);const joinedPosition=await c.locator('.wr-name.self').getAttribute('data-position');await c.waitForTimeout(500);expect(await c.locator('.wr-name.self').getAttribute('data-position')).toBe(joinedPosition);await c.keyboard.up('s');await open(c,'대화');await expect(c.getByRole('log')).toContainText('오늘도 모두 무사히.');await c.getByRole('button',{name:'나가기',exact:true}).click();await expect(a.locator('.wr-name')).toHaveCount(2);
  await open(a,'돌탑 쌓기');await act(a,'돌 올려놓기','stone');await expect(b.locator(`[data-peace-player="${id}"]`)).toHaveAttribute('data-stones','1');
  // Re-send exactly one request twice; only one new stone is accepted.
  await a.waitForTimeout(550);await a.evaluate(()=>{const m=JSON.stringify({type:'peace-action',kind:'stone',safe:true,requestId:crypto.randomUUID()});const s=(window as any).__peaceSockets.at(-1);s.send(m);s.send(m);});await expect(b.locator(`[data-peace-player="${id}"]`)).toHaveAttribute('data-stones','2');
  await a.evaluate(()=>(window as any).__peaceSockets.at(-1).close());await expect(a.locator('.peace-connection')).toContainText('재접속');await expect(a.locator('.peace-connection')).toContainText('연결됨',{timeout:20000});expect(await a.locator('.wr-name.self').getAttribute('data-player-id')).toBe(id);await expect(a.locator(`[data-peace-player="${id}"]`)).toHaveAttribute('data-stones','2');await open(a,'대화');await expect(a.getByRole('log')).toContainText('오늘도 모두 무사히.');
  expect((await contexts[0].request.get('/api/incidents')).status()).toBe(401);expect((await contexts[0].request.post('/api/war-room/rooms/peace-test/start',{data:{revision:0},headers:{Origin:'http://127.0.0.1:3100'}})).status()).toBe(401);expect(await a.evaluate(()=>(window as any).__peaceTypes.includes('training'))).toBe(false);
  await b.getByRole('button',{name:'나가기',exact:true}).click();await expect(a.locator('.wr-name')).toHaveCount(1);expect(name).toMatch(/나 · /);expect(errors).toEqual([]);
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});

test('local opt-in feedback, beads, deterministic fall and reset; remote and resume never buzz',async({browser})=>{
 const ca=await browser.newContext({viewport:{width:1440,height:900}}),cb=await browser.newContext({viewport:{width:1440,height:900}});
 try{
  const a=await ca.newPage(),b=await cb.newPage();await setup(a,'감각 확인');await setup(b,'감각 확인');await open(a,'소리와 움직임 설정');await a.getByLabel('진동',{exact:true}).check();await a.getByLabel('소리',{exact:true}).check();
  await practice(b,'천주교');await act(b,'성호 긋기','cross');await a.waitForTimeout(1100);expect(await a.evaluate(()=>(window as any).__vibrations.filter((p:any)=>p!==0))).toEqual([]);
  await practice(a,'불교','묵주·염주');await act(a,'염주 한 알 넘기기','beads');await expect.poll(()=>a.evaluate(()=>(window as any).__vibrations.filter((p:any)=>p!==0))).toEqual([12]);
  const slider=await a.getByTestId('bead-slider').boundingBox();await a.waitForTimeout(550);await a.mouse.move(slider!.x+20,slider!.y+40);await a.mouse.down();await a.mouse.move(slider!.x+80,slider!.y+40,{steps:4});await a.mouse.up();await expect(a.locator('[data-peace-player][data-kind="beads"]')).toHaveAttribute('data-step','2');
  await open(a,'돌탑 쌓기');await act(a,'돌 올려놓기','stone');await expect(a.locator('.peace-action-state')).toHaveAttribute('data-result','placed');await a.getByLabel('균형 잡으며 쌓기').check();await a.getByLabel('돌을 놓을 위치').focus();await a.keyboard.press('End');await act(a,'돌 올려놓기','stone');await expect(a.locator('.peace-action-state')).toHaveAttribute('data-result','fallen');await expect.poll(()=>a.evaluate(()=>(window as any).__vibrations.some((p:any)=>Array.isArray(p)&&p.join(',')==='30,45,22'))).toBe(true);await expect(a.locator('[data-peace-player][data-kind="stone"]')).toHaveAttribute('data-stones','1');
  await act(a,'돌탑 다시 쌓기','stone');await expect(a.locator('.peace-action-state')).toHaveAttribute('data-result','cleared');await expect(a.locator('[data-peace-player][data-kind="stone"]')).toHaveAttribute('data-stones','0');
  await practice(a,'개신교');await act(a,'묵상 기도','prayer');await open(a,'소리와 움직임 설정');await a.getByLabel('움직임 감소',{exact:true}).check();await practice(a,'천주교');await act(a,'성호 긋기','cross');await expect(a.locator('.wr-name.self')).toHaveAttribute('data-ritual-step','rest');await a.waitForTimeout(4200);const pulses=await a.evaluate(()=>(window as any).__vibrations.filter((p:any)=>p!==0).length);await a.evaluate(()=>(window as any).__peaceSockets.at(-1).close());await expect(a.locator('.peace-connection')).toContainText('연결됨',{timeout:20000});await a.waitForTimeout(700);expect(await a.evaluate(()=>(window as any).__vibrations.filter((p:any)=>p!==0).length)).toBe(pulses);
 }finally{await ca.close();await cb.close();}
});

test('tablet and mobile layout, unsupported vibration, touch movement and all practice styles',async({browser})=>{
 const context=await browser.newContext({viewport:{width:1024,height:900},hasTouch:true});const errors:string[]=[];
 try{const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await setup(p,'잠시 쉬어가요',false);await open(p,'소리와 움직임 설정');await expect(p.getByLabel('진동',{exact:true})).toBeDisabled();await expect(p.locator('.peace-haptic-note')).toContainText('진동을 지원하지');
  await practice(p,'천주교','묵주·염주');await act(p,'묵주 한 알 넘기기','rosary');await p.evaluate(()=>window.scrollTo(0,0));mkdirSync(screenshots,{recursive:true});await p.screenshot({path:`${screenshots}/tablet-rosary.png`,fullPage:false});
  await close(p);await p.setViewportSize({width:390,height:844});await immersive(p);expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const before=await p.locator('.wr-name.self').getAttribute('data-position');const arrow=p.getByRole('button',{name:'이동 ↓',exact:true});await arrow.scrollIntoViewIfNeeded();const box=(await arrow.boundingBox())!,cdp=await context.newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});await expect.poll(()=>p.locator('.wr-name.self').getAttribute('data-position')).not.toBe(before);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await p.getByRole('button',{name:'정원 전체 보기',exact:true}).click();await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${screenshots}/mobile.png`,fullPage:false});await p.getByRole('button',{name:'내 동작 크게 보기',exact:true}).click();await practice(p,'천주교');await expect(p.locator('canvas')).toHaveAttribute('data-camera-settled','true',{timeout:15000});await act(p,'성호 긋기','cross');await expect(p.locator('.peace-world')).toHaveAttribute('data-camera-view','self');await expect(p.locator('.wr-name.self')).toBeInViewport();await expect(p.getByRole('button',{name:'성호 긋기',exact:true})).toBeInViewport();await p.waitForTimeout(650);const hand=(await p.locator('.wr-name.self').getAttribute('data-hand-screen'))!.split(',').map(Number),panelBox=(await p.locator('.peace-panel').boundingBox())!;expect(hand[0]).toBeGreaterThan(0);expect(hand[0]).toBeLessThan(390);expect(hand[1]).toBeLessThan(panelBox.y-8);await p.screenshot({path:`${screenshots}/mobile-gesture.png`});await p.getByRole('button',{name:'나가기',exact:true}).click();await expect(p.getByRole('button',{name:'다시 들어가기',exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});


test('fresh mobile prayer close-up has no black compositing rectangle',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 try {
  const p=await context.newPage();await setup(p,'새 모바일 정원',false);
  await p.getByRole('button',{name:'내 동작 크게 보기',exact:true}).click();await practice(p,'천주교');
  await expect(p.locator('canvas')).toHaveAttribute('data-camera-settled','true',{timeout:15000});
  await act(p,'성호 긋기','cross');await p.waitForTimeout(1500);
  mkdirSync(screenshots,{recursive:true});const shot=await p.screenshot({path:`${screenshots}/mobile-fresh.png`});
  // Inspect the actual composited screenshot, not only projected joint coordinates.
  const pixelsCheck=await p.evaluate(async base64=>{
   const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
   const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);
   const pixels=ctx.getImageData(40,180,300,160).data,colors=new Set<number>();let black=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]<4&&pixels[i+1]<4&&pixels[i+2]<4)black++;colors.add(((pixels[i]>>4)<<8)|((pixels[i+1]>>4)<<4)|(pixels[i+2]>>4));}
   return {blackRatio:black/(pixels.length/4),colors:colors.size};
  },shot.toString('base64'));
  expect(pixelsCheck.blackRatio,'character area must not be covered by a black compositor rectangle').toBeLessThan(.02);
  expect(pixelsCheck.colors,'character area must retain scene detail, not a flat background rectangle').toBeGreaterThan(12);
  await expect(p.locator('.peace-action-state')).toContainText('성호를 마쳤어요');
  await p.screenshot({path:`${screenshots}/mobile-fresh-rest.png`});
 }finally{await context.close();}
});
