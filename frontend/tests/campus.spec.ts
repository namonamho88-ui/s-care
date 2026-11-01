import {test,expect} from '@playwright/test';
import path from 'node:path';
test('mobile DB fault → directional impact → approved recovery → retained evidence, no operational API writes',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const writes:string[]=[];page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&r.url().includes('/api/'))writes.push(r.url());});
 await page.goto('/war-room?view=simulation');await page.getByRole('button',{name:'전체 관제',exact:true}).click();await expect(page.getByRole('heading',{name:'● 정상'})).toBeVisible();
 if(process.env.CAMPUS_SCREENSHOT_DIR){await expect(page.locator('.campus-node-label')).toHaveCount(12);await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'campus-mobile.png')});}
 await page.getByRole('button',{name:'2D',exact:true}).click();
 await page.locator('.campus-selectors').getByRole('button',{name:/PostgreSQL/}).click();
 await expect(page.getByRole('dialog')).toContainText('복제 DB는 확인되지 않았습니다');
 await page.getByRole('button',{name:'이 구성 요소에 장애 실험'}).click();
 await page.getByLabel('장애 유형').selectOption('database');await page.getByLabel('지속 시간').selectOption('120');
 await page.getByRole('button',{name:'가상 장애 실행',exact:true}).click();
 await page.getByLabel('재생 속도').selectOption('10');
 await expect(page.locator('.campus-result').filter({hasText:'장애 이력·보고 조회'})).toContainText('PostgreSQL → Spring Boot API → Same-origin BFF → Next.js 관제 화면 → 장애 이력·보고 조회',{timeout:15000});
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'campus-impact-mobile.png')});
 await expect(page.getByRole('button',{name:'승인한 가상 복구 실행'})).toBeDisabled();
 await page.getByLabel('실험 내 복구 승인:',{exact:false}).check();
 await page.getByRole('button',{name:'승인한 가상 복구 실행'}).click();
 await expect(page.getByRole('dialog')).toContainText('모든 구성 요소의 모델 지표가 기준값으로 돌아왔습니다',{timeout:25000});
 await expect(page.locator('.campus-timeline')).toContainText('PostgreSQL → Spring Boot API');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'현재 결과·가정 JSON 내려받기'}).click();expect((await downloadPromise).suggestedFilename()).toBe('s-care-simulation.json');
 await page.getByRole('button',{name:'하단 시트 닫기'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(writes).toEqual([]);
});
test('WebGL unavailable falls back to same-data view; keyboard sheet and all targets remain reachable',async({page})=>{
 await page.setViewportSize({width:360,height:800});await page.addInitScript(()=>{HTMLCanvasElement.prototype.getContext=(()=>null) as any;});
 await page.goto('/war-room?view=simulation');await page.getByRole('button',{name:'전체 관제',exact:true}).click();await expect(page.locator('.campus-map')).toHaveAttribute('data-view','2d');
 await expect(page.locator('.campus-flat>section:not(.campus-flat-links)>button')).toHaveCount(12);
 await page.locator('.campus-flat').getByRole('button',{name:/Neo4j/}).click();await expect(page.getByRole('dialog')).toContainText('자동 SQL 우회는 없습니다');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'목록',exact:true}).click();await expect(page.locator('.campus-flat')).toContainText('work_jobs');
});
test('3D desktop loads and selected dependency is focusable without hover',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/war-room?view=simulation');await page.getByRole('button',{name:'전체 관제',exact:true}).click();
 await expect(page.locator('.campus-map canvas')).toBeVisible({timeout:30000});
 await expect(page.locator('.campus-node-label')).toHaveCount(12);
 if(process.env.CAMPUS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.CAMPUS_SCREENSHOT_DIR,'campus-desktop.png')});
 await page.locator('.campus-selectors').getByRole('button',{name:/영향 분석/}).click();await expect(page.getByRole('dialog')).toContainText('역방향 그래프 탐색');
 await page.getByRole('button',{name:'하단 시트 닫기'}).click();await page.getByRole('button',{name:'⌖ 전체 보기',exact:true}).click();
 expect(errors).toEqual([]);
});
test('existing room links retain their shared room identity',async({page})=>{
 await page.goto('/war-room?room=briefing');await expect(page).toHaveURL(/\/war-room\/classic\?room=briefing$/);await expect(page.getByLabel('함께 입장할 방')).toHaveValue('briefing');
});
