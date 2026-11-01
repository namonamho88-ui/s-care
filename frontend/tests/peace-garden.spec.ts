import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {pathPoint} from '../components/peace-room/bead-path';
const output=process.env.CAMPUS_SCREENSHOT_DIR;
test.setTimeout(120000);
test.use({trace:{mode:'retain-on-failure',screenshots:false,snapshots:true}});
async function garden(page:Page){
 const requests:any[]=[];
 const me={id:'peace-local-test',name:'테스트 방문자',role:'guest',floor:1,x:-2,z:1,direction:0,contributions:0,ritual:{kind:'rest',at:0,sequence:0,step:0,stones:0,result:'idle'}};
 let peer={...me,id:'peace-peer',name:'동료',x:3};
 await page.route('**/api/war-session',r=>r.fulfill({json:{id:me.id,ticket:'fixture-only',ws:'ws://127.0.0.1:3100/peace-test'}}));
 let update=()=>{};
 await page.routeWebSocket('**/peace-test',ws=>{update=()=>ws.send(JSON.stringify({type:'presence',players:[me,peer]}));ws.onMessage(raw=>{const m=JSON.parse(String(raw));requests.push(m);if(m.type==='join'){ws.send(JSON.stringify({type:'welcome'}));ws.send(JSON.stringify({type:'state',room:'peace-together',revision:1,players:[me,peer],chat:[],run:{status:'NORMAL',current:{nodes:[],edges:[],faults:[]}}}));}if(m.type==='peace-action'){me.ritual={...me.ritual,kind:m.kind,at:Date.now(),sequence:me.ritual.sequence+1,stones:m.kind==='stone'?me.ritual.stones+1:me.ritual.stones,result:m.kind==='stone'?'placed':'active'};update();}});});
 await page.goto('/peace-room');await expect(page.locator('.peace')).toHaveAttribute('data-room-state','JOINED');await expect(page.locator('canvas')).toHaveAttribute('data-camera-settled','true',{timeout:20000});
 return{requests,peerMove:()=>{peer={...peer,x:peer.x+1};update();}};
}
test('before screenshots',async({page})=>{test.skip(process.env.PEACE_BEFORE!=='true');for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844]] as const){await page.setViewportSize({width,height});await garden(page);if(output)await page.screenshot({path:path.join(output,`peace-before-${name}.png`)});}});

async function sweep(page:Page,steps:number){const b=(await page.getByTestId('bead-loop').boundingBox())!,scale=Math.min(b.width/360,b.height/700);const point=(s:number)=>{const p=pathPoint(s);return{x:b.x+(b.width-360*scale)/2+p.x*scale,y:b.y+(b.height-700*scale)/2+p.y*scale};};const start=point(7);await page.mouse.move(start.x,start.y);await page.mouse.down();for(let i=1;i<=Math.max(1,Math.ceil(Math.abs(steps)*6));i++){const p=point(7+steps*i/Math.max(1,Math.ceil(Math.abs(steps)*6)));await page.mouse.move(p.x,p.y);}await page.mouse.up();}
for(const width of [360,390,430,1440])test(`open garden and sheets at ${width}px; stable canvas and private bead counts`,async({page})=>{
 test.skip(process.env.PEACE_BEFORE==='true');await page.setViewportSize({width,height:width>700?900:844});const fixture=await garden(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>{(window as any).__originalCanvas=document.querySelector('canvas');});
 if(output)await page.screenshot({path:path.join(output,`peace-after-${width}.png`)});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const button of await page.locator('.peace-dock button').all())await expect(button).toBeInViewport();
 for(const name of ['돌탑 쌓기','기도하기','소원 남기기']){await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('button',{name:'패널 닫기',exact:true})).toBeInViewport();await expect(page.locator('.peace-walk')).toBeHidden();await expect(page.locator('.peace-label-host')).toBeHidden();await page.getByRole('button',{name:'패널 닫기',exact:true}).click();}
 await page.getByRole('button',{name:'묵주·염주',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();for(let i=0;i<3;i++)await sweep(page,.18);await expect(page.getByLabel('현재 횟수')).toHaveText('0');await sweep(page,8);await expect(page.getByLabel('현재 횟수')).toHaveText('8');await sweep(page,-3);await expect(page.getByLabel('현재 횟수')).toHaveText('5');
 fixture.peerMove();await expect(page.getByLabel('현재 횟수')).toHaveText('5');await page.getByRole('button',{name:'한 알 넘기기',exact:true}).click();await expect(page.getByLabel('현재 횟수')).toHaveText('6');if(output)await page.screenshot({path:path.join(output,`peace-beads-${width}.png`)});
 await page.getByRole('button',{name:'묵주',exact:true}).click();await expect(page.getByLabel('현재 횟수')).toHaveText('0');await expect(page.getByLabel('묵주의 십자가')).toBeVisible();await page.getByRole('button',{name:'한 알 넘기기',exact:true}).click();await page.getByRole('button',{name:'염주',exact:true}).click();await expect(page.getByLabel('현재 횟수')).toHaveText('6');
 for(let i=0;i<4;i++){await page.getByRole('button',{name:'← 돌아가기',exact:true}).click();await page.getByRole('button',{name:'묵주·염주',exact:true}).click();await expect(page.getByLabel('현재 횟수')).toHaveText('6');}
 await page.getByRole('button',{name:'← 돌아가기',exact:true}).click();await page.getByRole('button',{name:'그냥 쉬기',exact:true}).click();await expect(page.locator('.peace-dock')).toBeHidden();fixture.peerMove();await expect(page.locator('.peace')).toHaveClass(/is-resting/);await page.getByRole('button',{name:'풍경 모드 끝내기',exact:true}).click();await expect(page.locator('.peace-dock')).toBeVisible();
 expect(await page.evaluate(()=>document.querySelectorAll('canvas').length===1&&document.querySelector('canvas')===(window as any).__originalCanvas)).toBe(true);expect(fixture.requests.filter(m=>m.type==='peace-action'&&['beads','rosary'].includes(m.kind))).toEqual([]);expect(errors).toEqual([]);
});
test('touch drag, cancellation, short viewport and reduced motion',async({page,context})=>{
 test.skip(process.env.PEACE_BEFORE==='true');await page.setViewportSize({width:390,height:700});await page.emulateMedia({reducedMotion:'reduce'});await garden(page);await page.getByRole('button',{name:'묵주·염주',exact:true}).click();
 const cd=await context.newCDPSession(page),b=(await page.getByTestId('bead-loop').boundingBox())!,scale=Math.min(b.width/360,b.height/700);const pt=(step:number)=>{const p=pathPoint(step);return{x:b.x+(b.width-360*scale)/2+p.x*scale,y:b.y+(b.height-700*scale)/2+p.y*scale};};
 await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(7)]});for(let i=1;i<=12;i++)await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(7+i/12)]});await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.getByLabel('현재 횟수')).toHaveText('1');
 await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt(7)]});await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[pt(7.25)]});await cd.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.getByLabel('현재 횟수')).toHaveText('1');await expect(page.getByTestId('bead-loop')).toHaveAttribute('data-position','1.000');
 await page.setViewportSize({width:390,height:620});await expect(page.getByRole('button',{name:'한 알 넘기기',exact:true})).toBeInViewport();expect(await page.evaluate(()=>window.scrollY===0&&document.documentElement.scrollWidth===innerWidth)).toBe(true);await cd.detach();
});
test('bead feedback is optional and local; peers never trigger vibration',async({page})=>{
 test.skip(process.env.PEACE_BEFORE==='true');await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{(window as any).__beadVibrations=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:(value:number)=>{(window as any).__beadVibrations.push(value);return true;}});});const f=await garden(page);
 await page.getByRole('button',{name:'정원 메뉴',exact:true}).click();await page.getByRole('button',{name:'소리와 움직임 설정',exact:true}).click();await expect(page.getByLabel('소리',{exact:true})).not.toBeChecked();await expect(page.getByLabel('진동',{exact:true})).toBeChecked();await page.getByRole('button',{name:'패널 닫기',exact:true}).click();await page.getByRole('button',{name:'묵주·염주',exact:true}).click();await page.getByRole('button',{name:'한 알 넘기기',exact:true}).click();expect(await page.evaluate(()=>(window as any).__beadVibrations.filter((n:number)=>n>0))).toEqual([12]);f.peerMove();await expect(page.getByLabel('현재 횟수')).toHaveText('1');expect(await page.evaluate(()=>(window as any).__beadVibrations.filter((n:number)=>n>0))).toEqual([12]);
});

for(const width of [390,1440])test(`ritual execution reveals avatar at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await garden(page);
 for(const [panel,action,kind] of [['돌탑 쌓기','돌 올려놓기','stone'],['기도하기','성호 긋기','cross']]){
  await page.getByRole('button',{name:panel,exact:true}).click();
  await page.getByRole('button',{name:action,exact:true}).click();
  await expect(page.locator('.peace-panel')).toBeHidden();
  await expect(page.locator('.peace-world')).toHaveAttribute('data-camera-view','self');
  await expect(page.locator('.peace-action-state')).toHaveAttribute('data-kind',kind);
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-settled','true');
 }
});
