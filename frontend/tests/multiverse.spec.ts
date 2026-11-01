import {test,expect} from '@playwright/test';
import path from 'node:path';
test('mobile field guides DB inspection, approved recovery, and results without operational writes',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))writes.push(r.url());});
 await page.goto('/war-room?view=simulation');await expect(page.locator('.mv-world h2')).toHaveText('중앙 광장');await expect(page.locator('[data-player-id="solo-explorer"]')).toBeVisible({timeout:30000});
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'infrastructure-field-mobile.png')});
 await page.getByRole('button',{name:'DB 장애 대응 시작',exact:true}).click();await page.getByRole('button',{name:'가상 장애 실행',exact:true}).click();await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','1');
 await expect(page.getByRole('button',{name:'장비 점검 확인',exact:true})).toBeDisabled();await page.locator('.field-guide').getByRole('button',{name:'데이터 · 작업으로 이동',exact:true}).click();
 await expect(page.getByRole('button',{name:'장비 점검 확인',exact:true})).toBeEnabled({timeout:15000});
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'infrastructure-fault-mobile.png')});
 await page.getByRole('button',{name:'장비 점검 확인',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('복제 DB는 확인되지 않았습니다');await page.getByRole('button',{name:'하단 시트 닫기'}).click();await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','2');
 await page.getByRole('button',{name:'복구 검토·승인',exact:true}).click();await page.getByLabel('재생 속도').selectOption('10');await expect(page.getByRole('button',{name:'승인한 가상 복구 실행'})).toBeDisabled();await page.getByLabel('실험 내 복구 승인:',{exact:false}).check();await page.getByRole('button',{name:'승인한 가상 복구 실행'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','3');
 await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','4',{timeout:20000});await page.getByRole('button',{name:'결과 보고서',exact:true}).click();await expect(page.locator('.campus-timeline')).toContainText('현장 가상 점검 확인');await expect(page.getByRole('dialog')).toContainText('모든 구성 요소의 모델 지표가 기준값으로 돌아왔습니다');await page.getByRole('button',{name:'하단 시트 닫기'}).click();
 await page.getByRole('button',{name:'전체 관제',exact:true}).click();await expect(page.locator('.campus-node-label')).toHaveCount(12);await page.getByRole('button',{name:'캐릭터 탐험',exact:true}).click();await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','4');await page.setViewportSize({width:360,height:740});await expect(page.getByRole('button',{name:'결과 보고서',exact:true})).toBeInViewport();expect(writes).toEqual([]);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('desktop field shows a continuous open campus and moves the character from its own viewpoint',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/war-room?view=simulation');const avatar=page.locator('[data-player-id="solo-explorer"]');await expect(avatar).toBeVisible({timeout:30000});await expect(page.locator('.field-zone-label')).toHaveCount(4);
 const before=await avatar.getAttribute('data-position');await page.getByRole('button',{name:'앞으로 이동',exact:true}).click();await expect(avatar).not.toHaveAttribute('data-position',before!);
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'infrastructure-field-desktop.png')});
 await page.locator('.field-zones summary').click();await page.locator('.field-zones').getByRole('button',{name:/데이터 · 작업/}).click();await expect(page.locator('.mv-world h2')).toHaveText('데이터 · 작업');await page.locator('.field-zones summary').click();
 await expect(avatar).toHaveAttribute('data-position',/-13\.00,-20\.00/,{timeout:15000});
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'infrastructure-data-desktop.png')});
 await expect(page.locator('.campus-map').getByRole('button',{name:'PostgreSQL · 정상',exact:true})).toBeVisible();await page.locator('.campus-map').getByRole('button',{name:'PostgreSQL · 정상',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('work_jobs / lease');
});

test('two connected explorers share portal location and chat, without sharing simulation commands',async({context})=>{
 const peers:any[]=[];const sockets:any[]=[];const events:string[]=[];let room='';
 await context.route('**/api/war-session',async route=>{room=route.request().postDataJSON().room;const id='peer-'+peers.length;peers.push({id,name:id,floor:1,x:peers.length*2,z:3,direction:0,role:'동료',contributions:0});await route.fulfill({json:{id,ticket:id,ws:'ws://127.0.0.1:3107/campus-test-socket'}});});
 await context.routeWebSocket('**/campus-test-socket',ws=>{sockets.push(ws);let id='';ws.onMessage(raw=>{const m=JSON.parse(raw.toString());events.push(m.type);if(m.type==='join'){id=m.ticket;ws.send(JSON.stringify({type:'welcome'}));ws.send(JSON.stringify({type:'state',room,revision:0,players:peers,chat:[],checks:[]}));}if(m.type==='campus-portal')peers.find(p=>p.id===id).floor=m.world+1;if(m.type==='chat')sockets.forEach(s=>s.send(JSON.stringify({type:'collaboration',checks:[],chat:[{id:'message',name:id,text:m.text}]})));sockets.forEach(s=>s.send(JSON.stringify({type:'presence',players:peers})));});});
 const a=await context.newPage(),b=await context.newPage();
 for(const page of [a,b]){await page.goto('/war-room?view=simulation');await page.locator('.mv-social summary').click();await page.getByRole('button',{name:'동료와 연결',exact:true}).click();await expect(page.locator('.mv-social summary')).toContainText('연결됨');}
 await expect(a.locator('.mv-social summary')).toContainText('2명');await a.locator('.field-zones summary').click();await a.locator('.field-zones').getByRole('button',{name:/AI 연동/}).click();await expect(a.locator('.mv-world h2')).toHaveText('AI 연동');await expect(b.locator('.mv-social li').filter({hasText:'peer-0'})).toContainText('AI 연동');await expect(b.locator('.mv-world h2')).toHaveText('중앙 광장');
 await b.getByLabel('동료에게 메시지').fill('광장에서 만나요');await b.getByRole('button',{name:'보내기',exact:true}).click();await expect(a.getByRole('log')).toContainText('광장에서 만나요');expect(events.every(e=>['join','campus-portal','chat','ping','sync'].includes(e))).toBe(true);
});

test('field response remains usable without WebGL',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(()=>null) as any;});await page.goto('/war-room?view=simulation');await expect(page.locator('.campus-map')).toHaveAttribute('data-view','2d');await page.getByRole('button',{name:'DB 장애 대응 시작',exact:true}).click();await page.getByRole('button',{name:'가상 장애 실행',exact:true}).click();await page.locator('.field-guide').getByRole('button',{name:'데이터 · 작업으로 이동',exact:true}).click();await page.getByRole('button',{name:'장비 점검 확인',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('PostgreSQL');await page.getByRole('button',{name:'하단 시트 닫기'}).click();await expect(page.locator('.field-guide')).toHaveAttribute('data-stage','2');
});
