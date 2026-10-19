const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(__dirname,'screenshots');
fs.mkdirSync(output,{recursive:true});
const url='file:///'+root.replace(/\\/g,'/')+'/index.html';
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const context=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const settle=()=>page.waitForFunction(()=>document.querySelector('main')?.dataset.routeKey===(location.hash.slice(1)||'home'));
 const route=async hash=>{await page.goto(url+'#'+hash);await settle();await page.locator('main h1').waitFor()};
 const click=async locator=>{await locator.click();await settle()};
 const action=async name=>click(page.locator(`[data-action="${name}"]`));
 const record=name=>{results.push(name);console.log('PASS '+name)};
 const db=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('zhijia-v1')));
 try {
  await route('home');
  assert.equal(await page.locator('.quick-card').count(),4);
  assert.match(await page.locator('main h1').textContent(),/我們一步一步教您$/);
  assert.equal(await page.locator('main img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth)),true);
  assert.doesNotMatch(await page.locator('body').innerText(),/展示|競賽|模擬|虛擬|API|JSON|後端/);
  await page.screenshot({path:path.join(output,'home-desktop.png'),fullPage:true});
  await route('help');assert.doesNotMatch(await page.locator('main').innerText(),/洗衣機|洗衣模式/);
  record('首頁標語無句點、四大入口、一般頁面無提案文案，求助不預設家電');
  await page.locator('.skip').focus();await page.keyboard.press('Enter');assert.match(page.url(),/#help$/);assert.equal(await page.locator('#main').evaluate(m=>m===document.activeElement),true);
  record('跳至主要內容不觸發錯誤路由');
  await route('guide');await action('start-scenario');await click(page.locator('main a[href="#scan"]').first());await action('simulate');await action('confirm-device');
  await click(page.locator('[data-action="lesson"][data-issue="1"]'));
  const washerURL=page.url();const lessonId=(await db()).learning.at(-1).id;
  await action('next-step');assert.match(await page.locator('.lesson-copy h2').textContent(),/洗程/);
  await page.reload();await settle();assert.match(await page.locator('.step-top').innerText(),/步驟 2/);assert.equal((await db()).learning.at(-1).id,lessonId);
  await action('play-lesson');assert.equal(await page.locator('[data-action="play-lesson"]').getAttribute('aria-pressed'),'true');await action('play-lesson');
  await action('next-step');await action('next-step');await action('feedback-help');assert.match(await page.locator('.help-summary').innerText(),/洗衣模式/);
  await action('booking');assert.equal(await page.locator('[data-action="book-next"]').isDisabled(),true);
  await click(page.locator('[data-action="book-type"]').first());await action('book-next');
  assert.equal(await page.locator('[data-action="book-next"]').isDisabled(),true);
  await click(page.locator('[data-action="book-place"][data-value="home"]'));
  await page.locator('#booking-city').selectOption('臺北市');await page.locator('#booking-district').selectOption('中山區');await action('book-next');
  assert.equal(await page.locator('[data-action="book-next"]').isDisabled(),true);
  await page.locator('#booking-date').selectOption({index:2});await click(page.locator('[data-action="book-time"]').nth(1));await action('book-next');
  assert.match(await page.locator('main').innerText(),/尚未開放線上送出/);await action('book-confirm');
  assert.match(await page.locator('main h1').innerText(),/服務需求已儲存/);assert.match(await page.locator('main').innerText(),/未送出/);assert.doesNotMatch(await page.locator('main').innerText(),/預約成功|預約完成|展示|示範|競賽/);
  await page.screenshot({path:path.join(output,'request-summary.png'),fullPage:true});await action('exit-scenario');
  record('完整引導旅程、教學進度保存、缺少選項時禁止繼續、到府需求儲存而不冒稱送出');
  for(const type of ['washer','aircon','tv','cooker','fridge']){
   await route('learn?type='+type);const titles=await page.locator('[data-action="lesson"] strong').allTextContents();assert.equal(titles.length,4);
   for(let i=0;i<4;i++){
    await click(page.locator(`[data-action="lesson"][data-issue="${i}"]`));assert.equal(await page.locator('main h1').innerText(),titles[i]);
    const text=new Set([await page.locator('.lesson-copy p').innerText()]);await action('next-step');text.add(await page.locator('.lesson-copy p').innerText());await action('next-step');text.add(await page.locator('.lesson-copy p').innerText());assert.equal(text.size,3);
    await route('learn?type='+type);
   }
  }
  record('五種家電、20 個獨立主題、60 個步驟及非特定機型內容');
  await route('learn?type=tv');await click(page.locator('[data-action="lesson"]').first());const tvId=(await db()).learning.at(-1).id;assert.notEqual(tvId,lessonId);
  await action('learned');await action('solved');await click(page.locator('[data-action="rate"][data-rating="5"]'));assert.match(await page.locator('#rating-status').innerText(),/5 分/);
  await page.reload();await settle();assert.equal(await page.locator('[data-rating="5"]').getAttribute('aria-pressed'),'true');
  await route('feedback?lesson='+tvId);await action('feedback-help');await route('feedback?lesson='+tvId);await action('solved');
  await page.goto(washerURL);await settle();assert.equal((await db()).learning.find(l=>l.id===lessonId).step,2);record('不同教學進度隔離、同次學習回饋更新與評分重新載入保存');
  await route('scan');await page.locator('#photo-file').setInputFiles(path.join(root,'assets','服務情境3.jpg'));await page.locator('.upload-preview').waitFor();await click(page.locator('[data-type="cooker"]'));
  assert.match(await page.locator('main').innerText(),/電子鍋/);assert.doesNotMatch(await page.locator('main').innerText(),/AI|辨識成功|型號|模擬/);
  await route('scan');await action('manual');assert.equal(await page.locator('.upload-preview').count(),0);
  await route('scan');await action('camera');await page.waitForFunction(()=>document.querySelector('#camera-status')?.textContent!=='請允許使用相機');assert.match(await page.locator('#camera-status').innerText(),/無法開啟|拍好照片/);await action('close-camera');
  record('照片只供手動確認、切換時清除照片、相機權限失敗有替代方式');
  await route('my');const initial=await page.locator('.appliance-row').count();await route('edit?new=1');await page.locator('[name="type"]').selectOption('fridge');await page.locator('[name="room"]').selectOption('廚房');await click(page.locator('#appliance-form button[type="submit"]'));assert.equal(await page.locator('.appliance-row').count(),initial+1);
  await click(page.locator('.appliance-row').last().getByRole('link',{name:'修改資料'}));await page.locator('[name="room"]').selectOption('其他空間');await click(page.locator('button[type="submit"]'));await page.reload();await settle();assert.match(await page.locator('.appliance-row').last().innerText(),/其他空間/);
  await click(page.locator('.appliance-row').last().getByRole('link',{name:'查看教學'}));assert.match(await page.locator('main h1').innerText(),/冰箱/);await action('device-help');assert.match(await page.locator('.help-summary').innerText(),/冰箱/);assert.doesNotMatch(await page.locator('.help-summary').innerText(),/開機|模式怎麼選/);
  await route('my');await click(page.locator('[data-action="delete-device"]').last());assert.equal(await page.locator('#modal-close').evaluate(e=>e===document.activeElement),true);await page.locator('#modal-close').click();assert.equal(await page.locator('.appliance-row').count(),initial+1);
  await click(page.locator('[data-action="delete-device"]').last());await action('confirm-delete');assert.equal(await page.locator('.appliance-row').count(),initial);record('家電新增修改保存、檢視與正確求助內容、刪除確認先聚焦取消');
  await route('stores');await page.locator('#city-filter').selectOption('臺北市');assert.equal(await page.locator('.store-card').count(),2);await page.locator('#district-filter').selectOption('文山區');assert.equal(await page.locator('.store-card').count(),1);
  await action('book-store');await click(page.locator('[data-action="book-type"]').nth(1));await page.locator('#booking-device').selectOption('tv');await action('book-next');
  assert.equal(await page.locator('[data-action="book-place"]').count(),1);assert.equal(await page.locator('#booking-district').inputValue(),'文山區');await action('book-next');
  await page.locator('#booking-date').selectOption({index:1});await click(page.locator('[data-action="book-time"]').first());await page.reload();await settle();assert.equal(await page.locator('#booking-date').inputValue(),(await db()).draft.date);
  await action('book-next');await action('book-confirm');assert.match(await page.locator('.summary-list').innerText(),/門市諮詢/);record('地區篩選帶入、門市體驗不能安排到府、日期與草稿刷新保存');
  await route('requests');assert.equal(await page.locator('main article').count(),2);await click(page.locator('main article a').first());await action('delete-request');await page.locator('#modal-close').click();assert.equal((await db()).requests.length,2);record('服務需求清單、摘要與取消刪除');
  await route('phone');await action('phone-interest');assert.match(await page.locator('#phone-status').innerText(),/已儲存/);assert.equal(await page.locator('a[href^="tel:"]').count(),0);record('未提供電話時不出現假電話或假通話成功');
  await route('cycle');for(let i=0;i<7;i++){await click(page.locator(`.cycle-node[href="#cycle?stage=${i}"]`));assert.match(await page.locator('.cycle-detail .badge').innerText(),new RegExp('階段 '+(i+1)));assert.equal(await page.locator('.cycle-detail img').evaluate(i=>i.complete&&i.naturalWidth>0),true)}
  await route('cycle?stage=1.5');assert.match(await page.locator('.cycle-detail .badge').innerText(),/階段 1/);record('服務流程七階段照片與非法階段參數容錯');
  await route('advisor');await action('reset-advisor');for(let i=0;i<4;i++)await action('advance-advisor');assert.match(await page.locator('main').innerText(),/目前：持續關懷/);await action('add-note');await page.reload();await settle();assert.match(await page.locator('.event-list').innerText(),/已確認/);
  await route('dashboard');assert.equal(await page.locator('.metric').count(),4);await action('toggle-stats');assert.match(await page.locator('.workspace-note').innerText(),/範例數據/);await action('toggle-stats');const downloadPromise=page.waitForEvent('download');await action('export-events');assert.match((await downloadPromise).suggestedFilename(),/json$/);record('工作人員專區、依需求保存紀錄、五狀態、範例數據隔離與匿名匯出');
  await route('staff');await page.locator('summary').click();await page.locator('#stores-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('[]')});await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('匯入失敗'));
  await page.locator('#stores-file').setInputFiles(path.join(root,'assets','stores.json'));await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已匯入 4'));record('地區 JSON 格式驗證與匯入');
  await route('about');await page.locator('#promo-video').evaluate(v=>new Promise((resolve,reject)=>{if(v.readyState>=1)resolve();else{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',reject,{once:true})}}));const video=await page.locator('#promo-video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));assert.ok(video.duration>0&&video.width>0);
  await action('video-mute');await action('video-play');await page.waitForTimeout(700);assert.ok(await page.locator('#promo-video').evaluate(v=>v.currentTime>0));await action('video-pause');assert.equal(await page.locator('#promo-video').evaluate(v=>v.paused),true);await action('video-restart');await action('video-pause');
  await page.locator('#promo-video source').evaluate(s=>{s.src='assets/invalid.mp4';s.parentElement.load()});await page.locator('#video-error').waitFor({state:'visible'});record('原始影片播放、暫停、重播、靜音與無技術細節的錯誤提示');
  await route('learn');await click(page.locator('.device-card').first());await page.locator('#back').click();await settle();assert.match(page.url(),/#learn$/);await page.goForward();await settle();assert.match(page.url(),/learn\?type=washer/);record('瀏覽器與頁面返回／前進一致');
  const normal=['home','welcome','scan','choose','result?type=tv','questions?type=tv','learn','learn?type=tv','tutorial?type=tv&issue=0','feedback','help','phone','stores','booking','requests','my','edit?new=1','cycle','guide'];
  for(const r of normal){await route(r);assert.doesNotMatch(await page.locator('main').innerText(),/競賽|展示版|模擬|虛擬機型|原型|JSON|API Key|後端|工作階段/,'internal copy '+r)}
  record('19 個一般頁面無競賽、展示版或開發提示語');
  const all=[...normal,'booked','about','staff','advisor','dashboard','cycle?stage=1.5','tutorial?type=nope&issue=9','edit?id=missing','device?id=missing','feedback?lesson=missing','booked?id=missing','unknown'];
  for(const width of [320,390,700,1024,1440,1920]){await page.setViewportSize({width,height:950});for(const r of all){await route(r);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width} ${r}`)}}
  await page.setViewportSize({width:390,height:844});await route('home');await page.waitForTimeout(4600);await page.screenshot({path:path.join(output,'home-mobile.png'),fullPage:true});
  await page.locator('#font-toggle').click();await page.locator('#font-toggle').click();for(const width of [320,390,700,1024,1440]){await page.setViewportSize({width,height:950});for(const r of all){await route(r);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`xl overflow ${width} ${r}`)}}
  await page.setViewportSize({width:390,height:844});await route('tutorial?type=washer&issue=1');await page.waitForTimeout(4600);await page.screenshot({path:path.join(output,'lesson-mobile-large.png'),fullPage:true});
  await page.locator('#contrast-toggle').click();await page.reload();await settle();assert.equal(await page.locator('body').getAttribute('data-font'),'xl');assert.equal(await page.locator('#contrast-toggle').getAttribute('aria-pressed'),'true');
  record('30 個頁面與異常路由、六種螢幕寬度、五種寬度超大字、高對比保存及無水平溢出');
  const fallback=await context.newPage();const fallbackErrors=[];fallback.on('pageerror',e=>fallbackErrors.push(e.message));await fallback.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('denied')};Storage.prototype.setItem=()=>{throw Error('denied')};Object.defineProperty(window,'speechSynthesis',{value:null})});await fallback.goto(url);await fallback.locator('main h1').waitFor();assert.match(await fallback.locator('main').innerText(),/無法保存/);await fallback.locator('#speak-page').click();assert.match(await fallback.locator('#toast').innerText(),/不支援文字朗讀/);assert.deepEqual(fallbackErrors,[]);await fallback.close();record('儲存及語音受限仍可使用且提供自然提示');
  // A separate browser page emulates long narration to verify it is not cut off at 15 seconds.
  const audio=await context.newPage();await audio.clock.install();await audio.addInitScript(()=>{window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};Object.defineProperty(window,'speechSynthesis',{value:{speak(u){window.__speech=u},cancel(){}}})});await audio.goto(url+'#learn?type=washer');await audio.locator('[data-action="lesson"]').first().click();await audio.locator('[data-action="play-lesson"]').click();await audio.clock.fastForward(16000);assert.match(await audio.locator('.step-top').innerText(),/步驟 1/);await audio.evaluate(()=>window.__speech.onend());assert.match(await audio.locator('.step-top').innerText(),/步驟 2/);await audio.locator('[data-action="play-lesson"]').click();await audio.clock.fastForward(60000);assert.match(await audio.locator('.step-top').innerText(),/步驟 2/);await audio.close();record('自動播放等待朗讀完成、暫停後不再切換');
  await route('dashboard');await action('reset-events');await action('confirm-reset-events');assert.equal((await db()).events.length,0);assert.equal((await db()).requests.length,2);assert.equal((await db()).learning.length>0,true);record('統計重設保留家電、需求與學習進度');
  assert.deepEqual(errors,[]);record('全程無 JavaScript 執行錯誤');
  fs.writeFileSync(path.join(__dirname,'results.json'),JSON.stringify({testedAt:new Date().toISOString(),browser:'Microsoft Edge / Playwright',mode:'file://',results,video,errors},null,2));
 }catch(error){console.error(error);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});fs.writeFileSync(path.join(__dirname,'failure.txt'),error.stack);process.exitCode=1}
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
