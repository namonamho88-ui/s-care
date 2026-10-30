import {test,expect,type Page} from '@playwright/test';
import fixture from './fixtures/twin-lab.json';
// Several WebGL interactions share one software renderer on CI.
test.describe.configure({timeout:60000});

async function setup(page:Page,admin=false){
 const calls:string[]=[];const moves:{x:number;z:number}[]=[];
 let publish:(value:any)=>void=()=>{};
 const state:any={type:'state',room:'briefing',revision:1,fictional:true,players:[{id:'guest-one',name:'게스트-가람',role:'분석',floor:1,x:-5,z:4,direction:0,contributions:0},{id:'guest-two',name:'게스트-나래',role:'검증',floor:3,x:4,z:3,direction:1,contributions:0}],run:structuredClone(fixture.compared),chat:[],busy:false,operation:'',error:'',started:Date.now(),completed:0,incidentLinked:false,checks:0};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/me')return route.fulfill({status:admin?200:401,json:admin?{role:'ADMIN',kind:'ACCOUNT'}:{error:'로그인 필요'}});
  if(path==='/api/war-session')return route.fulfill({json:{id:'guest-one',ticket:'fictional-single-use-ticket',ws:'ws://127.0.0.1:3100/war-test',name:'게스트-가람'}});
  if(path.endsWith('/context'))return route.fulfill({json:{}});
  if(path.startsWith('/api/war-room/rooms/')){
   const op=path.split('/').at(-1)!;calls.push(op);const body=route.request().postDataJSON();
   if(op==='request'){state.run.status='WAITING_APPROVAL';state.run.selectedStrategy=body.strategyId;}
   if(op==='decision'){state.run.status=body.approved?'APPROVED':'REJECTED';if(body.approved){state.run.current=state.run.results.find((r:any)=>r.strategyId===state.run.selectedStrategy).after;state.completed=Date.now();}}
   state.revision++;publish(state);return route.fulfill({json:state});
  }
  return route.fulfill({json:{}});
 });
 await page.routeWebSocket('**/war-test',ws=>{
  publish=value=>ws.send(JSON.stringify(value));
  ws.onMessage(data=>{const m=JSON.parse(String(data));
   if(m.type==='join'){publish({type:'welcome',id:'guest-one'});publish(state);}
   if(m.type==='move'){moves.push(m);state.players[0].x+=m.x*.3;state.players[0].z+=m.z*.3;publish(state);}
   if(m.type==='floor'){state.players[0].floor=m.floor;publish(state);}
   if(m.type==='role'){state.players[0].role=m.role;publish(state);}
   if(m.type==='chat'){state.chat.push({id:String(Date.now()),name:'게스트-가람',text:m.text,at:Date.now()});publish(state);}
  });
 });
 await page.goto('/war-room');await expect(page.getByRole('button',{name:'3D 워룸 입장'})).toBeEnabled();await page.getByRole('button',{name:'3D 워룸 입장'}).click();await expect(page.getByRole('heading',{name:'Digital Twin War Room'})).toBeVisible();return {calls,moves,state,publish:(value:any)=>publish(value)};
}
test('guest sees real 3D scene, shared state, chat and never admin controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1512,height:1100});await setup(page);
 await expect(page.locator('.wr-viewport canvas')).toBeVisible();
 // Canvas mounts before R3F configures its renderer. An early getContext() would
 // create the default alpha=true context itself and alter the application under test.
 await expect(page.locator('.wr-name.self')).toContainText('나');
 expect(await page.locator('.wr-viewport canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.getContext('webgl2')?.getContextAttributes()?.alpha)).toBe(false);
 await expect(page.getByText('3D 화면을 시작하지 못했습니다.')).toHaveCount(0);
 await page.getByRole('button',{name:'대화',exact:true}).click();await page.getByLabel('팀 채팅 메시지').fill('<script>공동 확인</script>');await page.getByRole('button',{name:'전송',exact:true}).click();await expect(page.getByRole('log')).toContainText('<script>공동 확인</script>');
 await page.getByRole('button',{name:'열린 패널 닫기'}).click();await page.getByRole('button',{name:'참여자 2명'}).click();await page.getByLabel('나의 시연 역할').selectOption('관리자 시연');await expect(page.getByRole('button',{name:'시나리오 시작',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/war-room-desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('administrator approves an actual selected comparison with a reason',async({page})=>{
 await page.setViewportSize({width:1512,height:1100});const {calls}=await setup(page,true);await page.getByRole('button',{name:'시연 진행',exact:true}).click();await page.getByRole('button',{name:'선택안 승인 요청',exact:true}).click();await expect(page.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true})).toBeDisabled();
 await page.getByLabel('승인·반려 사유',{exact:true}).fill('가상 결과와 잔여 위험 검토');await page.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true}).click();await expect(page.locator('.wr-complete')).toContainText('승인한 가상 결과 확정');expect(calls).toEqual(['request','decision']);
});
test('mobile folds panels and supports floor selection without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await expect(page.getByRole('group',{name:'터치 이동 조이스틱'})).toBeVisible();await page.getByRole('button',{name:'둘러보기',exact:true}).click();await page.getByRole('button',{name:/03.*장애대응 워룸/}).click();await expect(page.locator('.wr-room-switch')).toContainText('장애대응 워룸');await expect(page.locator('.wr-left')).toBeHidden();
 await page.getByRole('button',{name:'함께 해결',exact:true}).click();await page.getByRole('button',{name:'분석과 복구 결과 보기'}).click();await expect(page.getByRole('heading',{name:'분석 · 복구',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/war-room-mobile.png',fullPage:true});
});
test('unsupported WebGL offers the existing twin',async({page})=>{
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(()=>null) as any;});await page.goto('/war-room');await expect(page.getByRole('button',{name:'3D 워룸 입장'})).toBeDisabled();await expect(page.getByRole('link',{name:'기존 디지털 트윈 보기',exact:true})).toHaveAttribute('href','/?view=twin');
});


test('space starts uncluttered and click movement sends bounded inputs; panels stop movement',async({page})=>{
 await page.setViewportSize({width:1280,height:800});const {moves}=await setup(page);
 await expect(page.locator('.wr-left')).toBeHidden();await expect(page.locator('.wr-right')).toBeHidden();await expect(page.locator('.wr-mission')).toBeHidden();await expect(page.locator('.wr-chat')).toBeHidden();
 const canvas=page.locator('.wr-viewport canvas');await expect(canvas).toBeVisible();await expect(page.locator('.wr-name.self')).toBeVisible();
 // Click the visible foreground floor, after the initial camera settles.
 await page.waitForTimeout(1800);await canvas.click({position:{x:690,y:540}});await expect.poll(()=>moves.length).toBeGreaterThan(0);
 expect(moves.every(m=>Math.hypot(m.x,m.z)<=1.001)).toBe(true);
 await page.getByRole('button',{name:'대화',exact:true}).click();const stopped=moves.length;
 await page.getByLabel('팀 채팅 메시지').fill('wasd');await page.waitForTimeout(350);expect(moves.length).toBe(stopped);
 await page.keyboard.press('Escape');await expect(page.locator('.wr-chat')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
 await page.screenshot({path:'test-results/war-room-immersive.png',fullPage:true});
});


test('seven-stage local presentation pauses, restarts, restores live state and never calls commands',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {calls}=await setup(page);
 const workflow=page.locator('.wr-workflow');await expect(workflow).toHaveAttribute('data-source','twin');
 await page.getByRole('button',{name:'장애 대응 시연 시작',exact:true}).click();
 await expect(workflow).toHaveAttribute('data-stage','NORMAL');
 await workflow.locator('summary').first().click();await page.getByLabel('시연 속도',{exact:true}).selectOption('4');
 await expect(workflow).toHaveAttribute('data-stage','FAULT',{timeout:10000});await expect(page.locator('[data-fault="DATABASE"]')).toBeVisible();
 await page.getByRole('button',{name:'일시정지',exact:true}).click();const pausedStage=await workflow.getAttribute('data-stage');await page.waitForTimeout(2300);await expect(workflow).toHaveAttribute('data-stage',pausedStage!);
 await page.getByLabel('시연 단계',{exact:true}).selectOption('2');await page.getByRole('button',{name:'자동 재생',exact:true}).click();
 await expect(workflow).toHaveAttribute('data-stage','ANALYSIS');await expect(page.locator('[data-npc="1"]')).toBeAttached();
 await expect(workflow).toHaveAttribute('data-stage','APPROVAL',{timeout:10000});
 await expect(workflow).toHaveAttribute('data-stage','RECOVERY',{timeout:10000});await expect(workflow.getByText('시연 연출 진행',{exact:true})).toBeVisible();
 await page.getByLabel('시연 단계',{exact:true}).selectOption('4');await page.getByLabel('시연 속도',{exact:true}).selectOption('1');await page.getByRole('button',{name:'자동 재생',exact:true}).click();await page.waitForTimeout(5300);await page.getByRole('button',{name:'일시정지',exact:true}).click();await page.waitForTimeout(300);await page.screenshot({path:'test-results/war-room-recovery.png'});await page.getByLabel('시연 속도',{exact:true}).selectOption('4');await page.getByRole('button',{name:'자동 재생',exact:true}).click();
 await expect(workflow).toHaveAttribute('data-stage','VERIFY',{timeout:10000});
 await expect(workflow).toHaveAttribute('data-stage','COMPLETE',{timeout:10000});
 await expect(workflow).toHaveAttribute('data-source','twin',{timeout:10000});expect(calls).toEqual([]);
 await page.getByRole('button',{name:'장애 대응 시연 시작',exact:true}).click();await page.getByRole('button',{name:'재시작',exact:true}).click();await expect(workflow).toHaveAttribute('data-stage','NORMAL');
 await page.getByRole('button',{name:'시연 종료',exact:true}).click();await expect(workflow).toHaveAttribute('data-source','twin');
});

test('incident snapshots reject stale events, preserve failure and animate assigned NPC',async({page})=>{
 await page.setViewportSize({width:1440,height:900});const {state,publish}=await setup(page);
 const linked=(stage:string,revision:number)=>({...state,revision,incident:{stage,status:stage,node:'db-primary',version:revision,eventId:revision,approved:stage==='RECOVERY',completedSteps:[],totalSteps:6,aiSource:'DEMO'}});
 publish(linked('FAULT',10));await expect(page.locator('[data-fault="DATABASE"]')).toBeVisible();
 publish(linked('ANALYSIS',11));await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','ANALYSIS');
 const npc=page.locator('[data-npc="1"]');await expect(npc).toBeAttached();const position=await npc.getAttribute('data-position');await expect.poll(()=>npc.getAttribute('data-position')).not.toBe(position);
 publish(linked('APPROVAL',12));await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','APPROVAL');
 publish(linked('FAULT',9));await page.waitForTimeout(250);await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','APPROVAL');
 publish(linked('RECOVERY',13));await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','RECOVERY');
 publish(linked('FAILED',14));await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','FAILED');await expect(page.locator('[data-fault="DATABASE"]')).toBeVisible();
 publish(linked('COMPLETE',15));await expect(page.locator('.wr-workflow')).toHaveAttribute('data-stage','COMPLETE');await expect(page.locator('[data-fault]')).toHaveCount(0);
 await page.screenshot({path:'test-results/war-room-after.png'});
});

test('touch joystick sends bounded movement and releases it',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {moves}=await setup(page);const joystick=page.getByRole('group',{name:'터치 이동 조이스틱'});const box=(await joystick.boundingBox())!;
 await page.mouse.move(box.x+box.width-5,box.y+box.height/2);await page.mouse.down();await expect.poll(()=>moves.length).toBeGreaterThan(0);await page.mouse.up();const count=moves.length;await page.waitForTimeout(250);expect(moves.length).toBe(count);expect(moves.every(m=>Math.hypot(m.x,m.z)<=1.001)).toBe(true);
 await page.screenshot({path:'test-results/war-room-after-mobile.png'});
});

for(const viewport of [{width:1440,height:900},{width:390,height:844}])test(`presentation shows all operators without the explanation covering the scene at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);const {calls}=await setup(page);
 await page.getByRole('button',{name:'장애 대응 시연 시작',exact:true}).click();await page.getByRole('button',{name:'일시정지',exact:true}).click();
 const workflow=page.locator('.wr-workflow');await workflow.locator('summary').first().click();await page.getByLabel('시연 단계',{exact:true}).selectOption('2');
 await page.getByRole('button',{name:'자동 재생',exact:true}).click();
 const operator=page.locator('[data-npc="1"]');const before=await operator.getAttribute('data-position');await expect.poll(()=>operator.getAttribute('data-position')).not.toBe(before);
 await page.getByRole('button',{name:'일시정지',exact:true}).click();await page.getByRole('button',{name:'시연 시야 맞춤',exact:true}).click();
 await expect.poll(async()=>{
  const view=(await page.locator('.wr-viewport').boundingBox())!;
  return (await page.locator('[data-npc]').all()).length===5&&(await Promise.all((await page.locator('[data-npc]').all()).map(async label=>{const box=await label.boundingBox();return !!box&&box.x>=view.x&&box.x+box.width<=view.x+view.width&&box.y>=view.y&&box.y+box.height<=view.y+view.height;}))).every(Boolean);
 },{timeout:10000}).toBe(true);
 const view=(await page.locator('.wr-viewport').boundingBox())!,panel=(await workflow.boundingBox())!;
 expect(view.x>=panel.x+panel.width||view.y+view.height<=panel.y).toBe(true);
 await page.screenshot({path:`test-results/war-room-wide-${viewport.width}.png`});
 await page.getByRole('button',{name:'시연 종료',exact:true}).click();await expect(page.locator('main.wr')).toHaveAttribute('data-presentation','false');expect(calls).toEqual([]);
});
