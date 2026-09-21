import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync } from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,...(!existsSync(chromium.executablePath())?{channel:'msedge'}:{})});
const hostContext=await browser.newContext({viewport:{width:1440,height:1050}});
const guestContext=await browser.newContext({viewport:{width:390,height:844}});
const host=await hostContext.newPage(),guest=await guestContext.newPage();
const errors=[];for(const page of [host,guest])page.on('pageerror',e=>errors.push(e.message));
try{
 await host.goto('http://127.0.0.1:4173');await host.waitForFunction(()=>document.getElementById('connection-text').textContent==='실시간 연결');
 await host.screenshot({path:'test-results/desktop-setup.png',fullPage:true});
 await guest.goto('http://127.0.0.1:4173');await guest.waitForFunction(()=>document.getElementById('connection-text').textContent==='실시간 연결');
 await guest.screenshot({path:'test-results/mobile-setup.png',fullPage:true});
 assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile setup overflow');
 const csv='\uFEFF이름,결과\n민수,커피 당첨\n지영,통과!\n서연,간식 당첨\n도윤,통과!';
 await host.locator('#csv-upload').setInputFiles({name:'members.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await host.waitForFunction(()=>document.getElementById('player-0').value==='민수');
 await host.locator('#create-btn').click();await host.waitForFunction(()=>document.getElementById('role-tag').textContent==='방장');
 await guest.waitForFunction(()=>document.getElementById('role-tag').textContent==='참가자');
 assert.equal(await guest.locator('#host-actions').isVisible(),false);
 const forbidden=await guest.evaluate(async()=>{const s=await(await fetch('/api/state')).json();const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset',roundId:s.room.roundId})});return r.status;});assert.equal(forbidden,403);
 await host.locator('#start-btn').click();await guest.waitForFunction(()=>document.querySelector('.start-node.ready'));
 const roundId=await host.evaluate(async()=>(await(await fetch('/api/state')).json()).room.roundId);
 const raced=await Promise.all([host,guest].map((page,i)=>page.evaluate(async({roundId,index})=>{const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'play',roundId,index})});return{status:r.status,data:await r.json()};},{roundId,index:i})));
 assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
 const winner=raced.find(r=>r.status===200).data.room.active.index;
 await host.waitForTimeout(500);await host.screenshot({path:'test-results/desktop-playing.png',fullPage:true});
 await guest.screenshot({path:'test-results/mobile-playing.png',fullPage:true});
 await guest.close();
 await host.waitForFunction(async(index)=>{const s=await(await fetch('/api/state')).json();return s.room.played[index]&&!s.room.active;},winner,{timeout:10000});
 // Start a turn from a separate guest, then close its tab: no callback can finish it.
 const dropped=await guestContext.newPage();await dropped.goto('http://127.0.0.1:4173');await dropped.waitForFunction(()=>document.querySelector('.start-node.ready'));
 await dropped.locator('.start-node.ready').first().click();await dropped.waitForFunction(()=>document.querySelector('.start-node.active'));await dropped.close();
 await host.waitForFunction(async()=>{const s=await(await fetch('/api/state')).json();return s.room.played.filter(Boolean).length===2&&!s.room.active;},null,{timeout:10000});
 await host.locator('#skip-btn').click();await host.waitForFunction(()=>document.getElementById('result-modal').open);
 assert.equal(await host.locator('.result-row').count(),4);
 await host.screenshot({path:'test-results/desktop-results.png',fullPage:true});
 await host.locator('#restart-game-btn').click();await host.locator('#confirm-reset').click();await host.waitForFunction(()=>!document.getElementById('setup-panel').hidden);
 // Ten-player setup, quoted CSV and hostile-looking text remain literal text.
 await host.locator('#csv-upload').setInputFiles({name:'quoted.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFF이름,결과\n"<b>이름</b>","커피, 간식"\n두번째,통과')});
 await host.waitForFunction(()=>document.getElementById('player-0').value==='<b>이름</b>');await host.locator('#create-btn').click();await host.waitForFunction(()=>document.getElementById('role-tag').textContent==='방장');await host.locator('#start-btn').click();await host.locator('#skip-btn').click();await host.waitForFunction(()=>document.getElementById('result-modal').open);assert.equal(await host.locator('.result-row b').count(),0);assert.ok((await host.locator('.result-list').textContent()).includes('커피, 간식'));
 await host.locator('#restart-game-btn').click();await host.locator('#confirm-reset').click();await host.waitForFunction(()=>!document.getElementById('setup-panel').hidden);
 assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile, CSV, host authorization, simultaneous requests, disconnect recovery, results, reset, literal input rendering; no browser errors.');
} finally {await browser.close();}
