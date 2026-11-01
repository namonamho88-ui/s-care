import {test,expect} from '@playwright/test';
import path from 'node:path';
test('mobile explorer travels through portals and keeps its local fault across modes',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/war-room');await expect(page.locator('.mv-world h2')).toHaveText('중앙 광장');
 await expect(page.locator('[data-player-id="solo-explorer"]')).toBeVisible({timeout:30000});
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'multiverse-plaza-mobile.png'),fullPage:true});
 await page.locator('.mv-portals').getByRole('button',{name:/데이터 코어/}).click();
 await expect(page.locator('.mv-world h2')).toHaveText('데이터 코어');
 await page.locator('.campus-map').getByRole('button',{name:/^PostgreSQL ·/}).click();
 await page.getByRole('button',{name:'이 구성 요소에 장애 실험'}).click();await page.getByLabel('장애 유형').selectOption('database');await page.getByLabel('지속 시간').selectOption('120');await page.getByRole('button',{name:'가상 장애 실행',exact:true}).click();
 await page.getByRole('button',{name:'하단 시트 닫기'}).click();await page.getByRole('button',{name:'전체 관제',exact:true}).click();await expect(page.locator('.campus-node-label')).toHaveCount(12);
 await expect(page.locator('.campus-summary')).toContainText('PostgreSQL');await page.getByRole('button',{name:'캐릭터 탐험',exact:true}).click();await expect(page.locator('.mv-world h2')).toHaveText('데이터 코어');
 await expect(page.locator('.campus-summary')).toContainText('PostgreSQL');
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'multiverse-data-mobile.png'),fullPage:true});
 await page.locator('.mv-portals').getByRole('button',{name:/중앙 광장/}).click();await expect(page.locator('.mv-world h2')).toHaveText('중앙 광장');expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('two connected explorers share portal location and chat, without sharing simulation commands',async({context})=>{
 const peers:any[]=[];const sockets:any[]=[];const events:string[]=[];let room='';
 await context.route('**/api/war-session',async route=>{room=route.request().postDataJSON().room;const id='peer-'+peers.length;peers.push({id,name:id,floor:1,x:peers.length*2,z:3,direction:0,role:'동료',contributions:0});await route.fulfill({json:{id,ticket:id,ws:'ws://127.0.0.1:3107/campus-test-socket'}});});
 await context.routeWebSocket('**/campus-test-socket',ws=>{sockets.push(ws);let id='';ws.onMessage(raw=>{const m=JSON.parse(raw.toString());events.push(m.type);if(m.type==='join'){id=m.ticket;ws.send(JSON.stringify({type:'welcome'}));ws.send(JSON.stringify({type:'state',room,revision:0,players:peers,chat:[],checks:[]}));}if(m.type==='campus-portal')peers.find(p=>p.id===id).floor=m.world+1;if(m.type==='chat')sockets.forEach(s=>s.send(JSON.stringify({type:'collaboration',checks:[],chat:[{id:'message',name:id,text:m.text}]})));sockets.forEach(s=>s.send(JSON.stringify({type:'presence',players:peers})));});});
 const a=await context.newPage(),b=await context.newPage();
 for(const page of [a,b]){await page.goto('/war-room');await page.locator('.mv-social summary').click();await page.getByRole('button',{name:'동료와 연결',exact:true}).click();await expect(page.locator('.mv-social summary')).toContainText('연결됨');}
 await expect(a.locator('.mv-social summary')).toContainText('2명');await a.locator('.mv-portals').getByRole('button',{name:/AI 오비탈/}).click();await expect(a.locator('.mv-world h2')).toHaveText('AI 오비탈');await expect(b.locator('.mv-social li').filter({hasText:'peer-0'})).toContainText('AI 오비탈');await expect(b.locator('.mv-world h2')).toHaveText('중앙 광장');
 await b.getByLabel('동료에게 메시지').fill('광장에서 만나요');await b.getByRole('button',{name:'보내기',exact:true}).click();await expect(a.getByRole('log')).toContainText('광장에서 만나요');expect(events.every(e=>['join','campus-portal','chat','ping','sync'].includes(e))).toBe(true);
});
