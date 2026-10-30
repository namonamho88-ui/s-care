import {test,expect,type Page} from '@playwright/test';
import fixture from './fixtures/twin-lab.json';

async function setup(page:Page,admin=false){
 const calls:string[]=[];
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
   if(m.type==='floor'){state.players[0].floor=m.floor;publish(state);}
   if(m.type==='role'){state.players[0].role=m.role;publish(state);}
   if(m.type==='chat'){state.chat.push({id:String(Date.now()),name:'게스트-가람',text:m.text,at:Date.now()});publish(state);}
  });
 });
 await page.goto('/war-room');await expect(page.getByRole('button',{name:'3D 워룸 입장'})).toBeEnabled();await page.getByRole('button',{name:'3D 워룸 입장'}).click();await expect(page.getByRole('heading',{name:'Digital Twin War Room'})).toBeVisible();return calls;
}
test('guest sees real 3D scene, shared state, chat and never admin controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1512,height:1100});await setup(page);
 await expect(page.locator('.wr-viewport canvas')).toBeVisible();await expect(page.locator('.wr-name.self')).toContainText('게스트-가람');
 await expect(page.getByText('3D 화면을 시작하지 못했습니다.')).toHaveCount(0);
 await page.getByLabel('팀 채팅 메시지').fill('<script>공동 확인</script>');await page.getByRole('button',{name:'전송',exact:true}).click();await expect(page.getByRole('log')).toContainText('<script>공동 확인</script>');
 await page.getByLabel('나의 시연 역할').selectOption('관리자 시연');await expect(page.getByRole('button',{name:'시나리오 시작',exact:true})).toHaveCount(0);
 await page.screenshot({path:'test-results/war-room-desktop.png',fullPage:true});expect(errors).toEqual([]);
});
test('administrator approves an actual selected comparison with a reason',async({page})=>{
 await page.setViewportSize({width:1512,height:1100});const calls=await setup(page,true);await page.getByRole('button',{name:'선택안 승인 요청',exact:true}).click();await expect(page.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true})).toBeDisabled();
 await page.getByLabel('승인·반려 사유',{exact:true}).fill('가상 결과와 잔여 위험 검토');await page.getByRole('button',{name:'검토 후 가상 결과 승인',exact:true}).click();await expect(page.locator('.wr-complete')).toContainText('승인한 가상 결과 확정');expect(calls).toEqual(['request','decision']);
});
test('mobile folds panels and supports floor selection without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page);await expect(page.getByRole('group',{name:'터치 이동 조이스틱'})).toBeVisible();await page.getByRole('button',{name:'공간 · 인프라',exact:true}).click();await page.getByRole('button',{name:/03.*장애대응 워룸/}).click();await expect(page.locator('.wr-viewport-tools')).toContainText('3F');
 await page.getByRole('button',{name:'장애 상세',exact:true}).click();await expect(page.getByRole('heading',{name:'선택한 인프라',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/war-room-mobile.png',fullPage:true});
});
test('unsupported WebGL offers the existing twin',async({page})=>{
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(()=>null) as any;});await page.goto('/war-room');await expect(page.getByRole('button',{name:'3D 워룸 입장'})).toBeDisabled();await expect(page.getByRole('link',{name:'기존 디지털 트윈 보기',exact:true})).toHaveAttribute('href','/?view=twin');
});
