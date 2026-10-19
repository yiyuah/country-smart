'use strict';
(() => {
  const D = window.ZHIJIA_DATA;
  const $ = selector => document.querySelector(selector);
  const main = $('#main');
  const KEYS = {data:'zhijia-v1', prefs:'zhijia-prefs-v1'};
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const validType = type => typeof type === 'string' && own(D.devices, type);
  const validIssue = (type, index) => validType(type) && Number.isInteger(index) && index >= 0 && index < D.devices[type].lessons.length;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  const rooms = ['客廳','臥室','廚房','陽台','其他空間'];
  const times = ['上午 09:00–12:00','下午 13:00–17:00'];
  const services = [
    {name:'家電操作教學', text:'想學會開機、設定或日常操作', places:['store','home']},
    {name:'門市體驗與選購諮詢', text:'了解功能，選擇適合生活的家電', places:['store']},
    {name:'安裝與設定評估', text:'整理安裝、連線或設定需求', places:['store','home']},
    {name:'售後維護諮詢', text:'詢問清潔、保養或異常狀況', places:['store','home']}
  ];
  const stages = ['待確認需求','已確認需求','協助安排','完成教學','持續關懷'];
  const defaultStores = D.stores.map(store => ({...store}));
  let storageOK = true, storageWarned = false, toastTimer;

  function read(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  }
  function tourPreference(value) {
    try {
      if(typeof value==='boolean')sessionStorage.setItem('zhijia-guided-tour',String(value));
      return sessionStorage.getItem('zhijia-guided-tour')==='true';
    } catch { return false; }
  }
  function validateStores(list) {
    const keys = ['id','name','city','district','note'], ids = new Set();
    if (!Array.isArray(list) || !list.length || list.length > 100) throw Error('請提供 1–100 筆地區資料');
    return list.map(item => {
      if (!item || keys.some(key => typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 100) || !/^[a-z0-9-]{1,50}$/.test(item.id) || ids.has(item.id)) throw Error('欄位不完整或編號重複，請參考 JSON 範例');
      ids.add(item.id);
      return Object.fromEntries(keys.map(key => [key,item[key].trim()]));
    });
  }
  let db = read(KEYS.data, {});
  if (!db || typeof db !== 'object' || Array.isArray(db)) db = {};
  db = {...db, version:2};
  db.appliances = (Array.isArray(db.appliances) ? db.appliances : []).filter(a => a && typeof a.id === 'string' && validType(a.type) && rooms.includes(a.room));
  db.events = (Array.isArray(db.events) ? db.events : []).filter(e => e && typeof e.type === 'string' && typeof e.session === 'string' && Number.isFinite(Date.parse(e.at))).slice(-5000);
  db.learning = (Array.isArray(db.learning) ? db.learning : []).filter(l => l && typeof l.id === 'string' && validIssue(l.type,l.issue)).slice(-60).map(l => ({...l, step:Math.max(0,Math.min(2,Number(l.step)||0)), rating:[1,2,3,4,5].includes(l.rating)?l.rating:0}));
  db.requests = (Array.isArray(db.requests) ? db.requests : []).filter(r => r && typeof r.id === 'string' && services.some(s => s.name === r.type) && ['store','home'].includes(r.place)).slice(-100);
  // Retain existing local records when upgrading the previous version.
  if (!db.migratedV2 && db.lastBooking && typeof db.lastBooking === 'object' && services.some(s => s.name === db.lastBooking.type)) {
    const b = db.lastBooking, region = defaultStores.find(s => s.id === b.store);
    db.requests.push({...b,id:String(b.id || uid()).replace(/^DEMO-/,'PLAN-'),city:region?.city || '',district:region?.district || '',state:0,notes:Array.isArray(db.notes)?db.notes.filter(n=>typeof n==='string'):[],createdAt:new Date().toISOString()});
  }
  db.migratedV2 = true;
  try { if (db.stores) D.stores = validateStores(db.stores); } catch { db.stores = null; }
  if (!db.context || !validType(db.context.type)) db.context = null;
  else db.context = {type:db.context.type,issue:validIssue(db.context.type,db.context.issue)?db.context.issue:null};
  let prefs = read(KEYS.prefs, {});
  if (!prefs || typeof prefs !== 'object') prefs = {};
  prefs = {font:[0,1,2].includes(prefs.font)?prefs.font:0,contrast:!!prefs.contrast};
  let route = '', params = new URLSearchParams(), renderedKey = '', pageIndex = 0;
  let selectedType = db.context?.type || null, activeLesson = null, tour = tourPreference();
  let playing = false, playbackTimer = null, playbackToken = 0, utterance = null, readingPage = false;
  let cameraStream = null, cameraToken = 0, photoURL = '', uploadToken = 0;
  let filterCity = '', filterDistrict = '', pendingDelete = '', pendingRequestDelete = '', returnFocus = null;
  let statsSample = false, sessionId = uid();

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
  }
  function save() {
    try { localStorage.setItem(KEYS.data, JSON.stringify(db)); storageOK = true; return true; }
    catch {
      storageOK = false;
      if (!storageWarned) { storageWarned = true; toast('目前無法保存資料；關閉頁面後，這次的變更可能不會保留'); }
      return false;
    }
  }
  function log(type, detail = {}) {
    db.events.push({type,at:new Date().toISOString(),session:sessionId,...detail});
    db.events = db.events.slice(-5000);
    save();
  }
  function context(type, issue = null) {
    if (!validType(type)) return;
    selectedType = type;
    db.context = {type,issue:validIssue(type,issue)?issue:null};
    save();
  }
  function problemText(value = db.context) {
    return value && validIssue(value.type,value.issue) ? D.devices[value.type].lessons[value.issue].title : '家電使用諮詢';
  }
  function dates() {
    const now = new Date(Date.now() + 8 * 3600000);
    return Array.from({length:7},(_,i) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+i+1));
      const iso = date.toISOString().slice(0,10);
      return {value:iso,label:`${date.getUTCMonth()+1} 月 ${date.getUTCDate()} 日（星期${'日一二三四五六'[date.getUTCDay()]}）`};
    });
  }
  function dateLabel(value) {
    const date = dates().find(d => d.value === value);
    return date?.label || String(value || '尚未選擇');
  }
  function icon(name, size=25) {
    const box = ['washer','tv','aircon','cooker','fridge'].includes(name)?32:24;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${window.ZHIJIA_ICONS[name] || window.ZHIJIA_ICONS.info}</svg>`;
  }
  const art = type => `<div class="device-art" role="img" aria-label="${D.devices[type].name}圖示">${icon(D.devices[type].icon,110)}</div>`;
  const arrow = () => icon('arrow',22);
  const btn = (text,action,style='primary',extra='') => `<button class="btn ${style}" data-action="${action}" ${extra}>${text}</button>`;
  const link = (text,path,style='secondary') => `<a class="btn ${style}" href="#${esc(path)}">${text}</a>`;
  const notice = (text,style='') => `<div class="notice ${style}">${text}</div>`;
  const head = (title,sub='',kicker='全國智家・陪您慢慢學') => `<div class="page-head"><p class="page-kicker">${kicker}</p><h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>`;
  const option = (text,sub,action,ic='arrow',extra='') => `<button class="option" data-action="${action}" ${extra}><span class="option-icon">${icon(ic)}</span><span class="option-copy"><strong>${text}</strong>${sub?`<small>${sub}</small>`:''}</span><span class="arrow">${arrow()}</span></button>`;
  const storageNote = () => storageOK?'':notice('目前無法保存資料，關閉頁面後可能不會保留這次的變更');
  const empty = (title,text,path='home',action='返回首頁') => `<section class="panel empty">${icon('info',52)}<h2>${title}</h2><p class="muted">${text}</p>${link(action,path,'primary')}</section>`;

  function stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    utterance = null; readingPage = false;
    $('#speak-page').textContent = '朗讀本頁';
    $('#speak-page').setAttribute('aria-pressed','false');
  }
  function speak(text, onDone) {
    stopSpeech();
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      toast('此瀏覽器不支援文字朗讀，您可以繼續閱讀畫面上的步驟');
      onDone?.(); return false;
    }
    const speech = new SpeechSynthesisUtterance(text);
    utterance = speech; speech.lang = 'zh-TW'; speech.rate = .85;
    speech.onend = () => { if (utterance === speech) { utterance=null; readingPage=false; $('#speak-page').textContent='朗讀本頁'; $('#speak-page').setAttribute('aria-pressed','false'); onDone?.(); } };
    speech.onerror = event => {
      if (utterance !== speech) return;
      utterance=null; readingPage=false; $('#speak-page').textContent='朗讀本頁'; $('#speak-page').setAttribute('aria-pressed','false');
      if (!['interrupted','canceled'].includes(event.error)) toast('暫時無法朗讀，請使用文字步驟繼續操作');
      onDone?.();
    };
    try { speechSynthesis.speak(speech); return true; } catch { onDone?.(); return false; }
  }
  function stopPlayer() { playing=false; playbackToken++; clearTimeout(playbackTimer); playbackTimer=null; }
  function stopCamera() { cameraToken++; if(cameraStream) cameraStream.getTracks().forEach(track=>track.stop()); cameraStream=null; }
  function clearPhoto() { uploadToken++; if(photoURL) URL.revokeObjectURL(photoURL); photoURL=''; }
  function parsePath() {
    const hash = location.hash.slice(1) || 'home';
    const [name,query=''] = hash.split('?');
    return {name,query:new URLSearchParams(query),key:hash};
  }
  function go(path, replace=false) {
    if (!path || path==='main') return;
    if (location.hash.slice(1) === path) { render(); return; }
    pageIndex += replace?0:1;
    history[replace?'replaceState':'pushState']({zhijiaIndex:pageIndex},'', '#'+path);
    activate();
  }
  function lessonPath(lesson=activeLesson) { return `tutorial?type=${lesson.type}&issue=${lesson.issue}&lesson=${encodeURIComponent(lesson.id)}`; }
  function newLesson(type, index) {
    if (!validIssue(type,index)) return;
    activeLesson={id:uid(),type,issue:index,step:0,completed:false,rating:0};
    db.learning.push(activeLesson); db.learning=db.learning.slice(-60);
    context(type,index); log('lesson_start',{device:type,issue:index,lesson:activeLesson.id});
    go(lessonPath());
  }
  function getLesson() {
    const id=params.get('lesson');
    return id ? db.learning.find(l=>l.id===id) : activeLesson;
  }
  function enterLesson() {
    const type=params.get('type'), index=Number(params.get('issue'));
    if (!validType(type) || !params.has('issue') || !validIssue(type,index)) { activeLesson=null; return; }
    let lesson=db.learning.find(l=>l.id===params.get('lesson')&&l.type===type&&l.issue===index);
    if (!lesson) {
      lesson={id:uid(),type,issue:index,step:0,completed:false,rating:0};
      db.learning.push(lesson); db.learning=db.learning.slice(-60);
      log('lesson_start',{device:type,issue:index,lesson:lesson.id});
      history.replaceState(history.state,'',`#tutorial?type=${type}&issue=${index}&lesson=${lesson.id}`);
      params=new URLSearchParams(location.hash.split('?')[1]);
    }
    activeLesson=lesson; context(type,index);
  }
  function activate(force=false) {
    const next=parsePath();
    if (!force && renderedKey===next.key) return;
    const before=route;
    if($('#modal').open)$('#modal').close();
    stopPlayer(); stopSpeech(); stopCamera(); uploadToken++;
    route=next.name; params=next.query;
    pageIndex=history.state?.zhijiaIndex ?? pageIndex;
    if (route==='demo') route='guide';
    if (['questions','result'].includes(route)&&validType(params.get('type'))) context(params.get('type'));
    if (route==='tutorial') enterLesson();
    if (['feedback','complete'].includes(route)) activeLesson=params.has('lesson')?getLesson()||null:activeLesson||db.learning.at(-1)||null;
    if(route==='help'&&before!=='help') log('help',{...(db.context?{device:db.context.type,issue:db.context.issue}:{}),...(activeLesson?{lesson:activeLesson.id}:{})});
    if(route==='booking') ensureDraft();
    render(); window.scrollTo({top:0,behavior:'instant'}); main.focus({preventScroll:true});
  }
  const labels={home:'安心使用每一天',welcome:'第一次使用',scan:'掃描家電',choose:'選擇家電',result:'確認家電',questions:'常見問題',learn:'教學中心',tutorial:'一步一步學',feedback:'學習回饋',complete:'學習完成',help:'找人協助',phone:'電話諮詢',stores:'選擇服務地區',booking:'整理服務需求',booked:'服務需求摘要',requests:'我的服務需求',my:'我的家電',device:'家電資料',edit:'管理家電',about:'服務介紹',cycle:'服務流程',guide:'使用導覽',staff:'工作人員專區',advisor:'顧問工作台',dashboard:'使用紀錄'};
  function render(focusTarget='') {
    $('#page-label').textContent=labels[route]||'全國智家';
    document.title=(labels[route]||'全國智家')+'｜全國智家｜全國智慧居家';
    $('#back').disabled=route==='home'&&pageIndex===0;
    const active=key=>route===key||(key==='scan'&&['choose','result','questions'].includes(route))||(key==='learn'&&['tutorial','feedback','complete'].includes(route))||(key==='my'&&['device','edit'].includes(route))||(key==='help'&&['phone','stores','booking','booked','requests'].includes(route));
    const nav=[['home','首頁','home'],['scan','掃描家電','scan'],['my','我的家電','devices'],['learn','教學中心','book'],['help','找人協助','help'],['about','服務介紹','heart']];
    $('#side-nav').innerHTML=nav.map(([key,title,ic])=>`<a class="nav-item ${active(key)?'active':''}" href="#${key}" ${active(key)?'aria-current="page"':''}>${icon(ic)}${title}</a>`).join('');
    $('#mobile-nav').innerHTML=nav.filter(([key])=>['home','my','learn','help'].includes(key)).map(([key,title,ic])=>`<a href="#${key}" class="${active(key)?'active':''}" ${active(key)?'aria-current="page"':''}>${icon(ic)}${title}</a>`).join('');
    const pages={home:homePage,welcome:welcomePage,scan:scanPage,choose:choosePage,result:resultPage,questions:questionsPage,learn:learnPage,tutorial:tutorialPage,feedback:feedbackPage,complete:completePage,help:helpPage,phone:phonePage,stores:storesPage,booking:bookingPage,booked:bookedPage,requests:requestsPage,my:myPage,device:devicePage,edit:editPage,about:aboutPage,cycle:cyclePage,guide:guidePage,staff:staffPage,advisor:advisorPage,dashboard:dashboardPage};
    main.innerHTML=(tour?tourBanner():'')+(pages[route]||(()=>head('找不到這個頁面')+empty('連結可能已變更','您可以從首頁重新選擇需要的功能')))();
    renderedKey=location.hash.slice(1)||'home'; main.dataset.routeKey=renderedKey;
    document.body.dataset.page=route;
    applyPrefs(); bindMedia();
    if(focusTarget) $(focusTarget)?.focus({preventScroll:true});
  }
  function applyPrefs() {
    document.documentElement.style.setProperty('--base',[21,24,28][prefs.font]+'px');
    document.body.dataset.font=['standard','lg','xl'][prefs.font];
    document.body.classList.toggle('high-contrast',prefs.contrast);
    $('#font-toggle').textContent='字體：'+['標準','大字','超大字'][prefs.font];
    $('#font-toggle').setAttribute('aria-label','切換字體大小，目前'+['標準','大字','超大字'][prefs.font]);
    $('#contrast-toggle').setAttribute('aria-pressed',String(prefs.contrast));
    try { localStorage.setItem(KEYS.prefs,JSON.stringify(prefs)); } catch { /* Preference persistence does not block reading. */ }
  }
  function tourBanner() {
    const hints={home:'先點選「掃描家電」',scan:'選擇「從洗衣機開始」',result:'確認家電後，繼續選擇問題',questions:'點選「洗衣模式怎麼選」',tutorial:'依自己的速度切換教學步驟',feedback:'選擇問題是否解決',help:'選擇需要的協助方式',booking:'選好服務、地點與希望的時段',booked:'已整理好需求，之後可從「我的服務需求」查看'};
    return `<div class="scenario-banner"><span>${icon('book',22)}</span><strong>使用導覽：${hints[route]||'您可以自由探索其他功能'}</strong><button data-action="exit-scenario">結束導覽</button></div>`;
  }
  function homePage() {
    const recent=db.learning.at(-1);
    return `<div class="home-intro"><div class="hello"><span class="sun">${icon('sun',23)}</span>您好，今天想學會什麼呢？</div></div>
      <section class="home-hero"><div class="home-copy"><p class="eyebrow">全國智家｜全國智慧居家</p><h1>家電不會用？<br>我們<em>一步一步</em>教您</h1><p>不用記住複雜操作，<br>從按一下開始，把生活變簡單</p><div class="quick-grid">${[
        ['掃描家電','拍照或直接選擇家電','scan','scan',true],['我的家電','常用家電，隨時找得到','my','devices'],['教學中心','跟著步驟，慢慢學','learn','book'],['找人協助','整理問題，找到下一步','help','help']
      ].map(([title,sub,path,ic,primary])=>`<a href="#${path}" class="quick-card ${primary?'primary':''}"><span class="icon-box">${icon(ic,27)}</span><span class="card-line">${title}${arrow()}</span><small>${sub}</small></a>`).join('')}</div></div>
      <div class="home-visual"><img src="assets/服務情境4.jpg" alt="工作人員陪同長輩了解智慧電視"><span class="photo-tag">把科技變簡單，把關心帶回家</span><div class="visual-note"><small>安心，從學會操作開始</small><strong>一次一個步驟<br>照自己的速度就好</strong><p>家電教學 · 操作引導 · 服務諮詢</p></div></div></section>
      ${recent?`<div class="resume-card"><span class="option-icon">${icon('book')}</span><div><small>上次學到這裡</small><strong>${D.devices[recent.type].lessons[recent.issue].short}</strong><span>步驟 ${recent.step+1} / 3</span></div>${link(recent.completed?'再看一次':'繼續學習',lessonPath(recent),'secondary')}</div>`:''}
      <div class="support-strip"><span class="strip-icon">${icon('help',28)}</span><div><strong>不確定怎麼開始？沒關係</strong><p>跟著引導，一起練習操作</p></div><a href="#welcome">第一次使用 ${arrow()}</a></div>
      <section><div class="section-heading"><div><h2>從日常小問題開始</h2><p>看得懂・學得會・找得到人</p></div><a class="text-link" href="#about">認識服務 ${arrow()}</a></div><div class="service-grid">${[
        [1,'01 / 整理需求','先說說，您需要什麼','從家電種類與問題開始，整理想詢問的內容。','help','選擇協助方式'],
        [2,'02 / 一起練習','慢慢學，也能學得會','大字步驟與語音朗讀，依自己的速度練習。','learn','前往教學中心'],
        [4,'03 / 服務接續','把需要的協助，先準備好','選擇門市或到府，整理方便的地區與時段。','booking?place=home','整理服務需求']
      ].map(([image,kicker,title,text,path,action])=>`<article class="service-card"><img src="assets/服務情境${image}.jpg" alt="${title}" loading="lazy"><div class="service-content"><small>${kicker}</small><h3>${title}</h3><p>${text}</p><a class="text-link" href="#${path}">${action} ${arrow()}</a></div></article>`).join('')}</div></section>${storageNote()}`;
  }
  function welcomePage() {
    return head('我們陪您，從這裡開始','不用帳號，也能找到家電教學','第一次使用')+`<div class="two-col"><img class="wide-photo" src="assets/服務情境2.jpg" alt="陪同長輩練習手機操作"><section class="panel"><h2>三個步驟，慢慢來</h2><ol class="welcome-steps"><li><strong>選擇家電</strong><p>可以拍照，也可以直接點選種類。</p></li><li><strong>選擇問題</strong><p>一次看一個步驟，需要時按朗讀或重播。</p></li><li><strong>決定下一步</strong><p>學會了就記錄完成，還有疑問就整理服務需求。</p></li></ol><div class="actions">${link('開始選擇家電','scan','primary')}${link('跟著導覽練習','guide')}</div></section></div>`;
  }
  function scanPage() {
    return head('先找到您的家電','拍照、上傳，或直接選擇都可以','掃描家電')+`<div class="two-col"><div class="choice-list">${option('使用相機拍照','拍下家電，再選擇種類','camera','camera')}${option('上傳家電照片','從手機或電腦選一張照片','upload','upload')}${option('直接選擇家電','不用拍照，也能找到教學','manual','hand')}</div><section class="panel practice-panel"><div class="scan-stage">${art('washer')}</div><h2>先從熟悉的家電開始</h2><p class="muted">想了解洗衣機的模式與基本操作嗎？</p><div class="actions">${btn('從洗衣機開始','simulate')}</div></section></div><input type="file" id="photo-file" accept="image/*" class="hidden" aria-label="選擇家電照片"><div id="camera-zone"></div>`;
  }
  function choosePage() {
    return head('這是哪一種家電？',photoURL?'照片準備好了，請選擇家電種類':'點選家電，就能繼續')+(photoURL?`<div class="photo-confirm"><img src="${photoURL}" class="upload-preview" alt="您選擇的家電照片"><div><strong>請確認照片中的家電種類</strong><p class="muted small">照片不會上傳，選好種類後就能找教學。</p>${btn('換一張照片','upload','secondary')}</div></div><input type="file" id="photo-file" accept="image/*" class="hidden" aria-label="重新選擇家電照片">`:'')+`<div class="device-grid">${Object.entries(D.devices).map(([type,device])=>`<button class="device-card" data-action="select-device" data-type="${type}">${art(type)}<strong>${device.name}</strong><small>查看使用教學 ${arrow()}</small></button>`).join('')}</div>`;
  }
  function resultPage() {
    const type=params.get('type');
    if(!validType(type)) return head('先選擇您的家電')+chooseGrid();
    return head('確認這台家電','選對種類，教學會更容易找到')+`<section class="panel"><div class="device-summary">${art(type)}<div><span class="badge">您選擇的家電</span><h2>${D.devices[type].name}</h2><p class="muted">接著選擇想了解的操作問題。</p></div></div><div class="actions">${btn('這是我的家電','confirm-device')}${link('重新選擇','choose')}</div></section>`;
  }
  function chooseGrid() { return `<div class="device-grid">${Object.entries(D.devices).map(([type,device])=>`<a class="device-card" href="#learn?type=${type}">${art(type)}<strong>${device.name}</strong><small>4 組逐步教學</small></a>`).join('')}</div>`; }
  function questionsPage() {
    const type=params.get('type');
    if(!validType(type)) return head('先選擇家電種類')+chooseGrid();
    const d=D.devices[type];
    return head('您遇到什麼問題？','選擇最接近的情況，我們一步一步來')+`<div class="question-context">${icon(d.icon,45)}<div><strong>${d.name}</strong><small>選擇一個問題開始學習</small></div></div><div class="choice-list">${d.lessons.map((lesson,i)=>option(lesson.title,'3 個步驟，照自己的速度學','lesson','book',`data-type="${type}" data-issue="${i}"`)).join('')}${option('其他問題，找人協助','整理您需要的協助','help','help')}</div><div class="actions">${btn('加入我的家電','quick-save','secondary')}${link('重新選擇家電','choose')}</div>`;
  }
  function learnPage() {
    const type=params.get('type');
    if(validType(type)) return head(D.devices[type].name+'教學','選擇想了解的主題','教學中心')+`<div class="choice-list">${D.devices[type].lessons.map((lesson,i)=>option(lesson.short,'3 個步驟 · 可朗讀、重播','lesson','book',`data-type="${type}" data-issue="${i}"`)).join('')}</div><div class="actions">${link('學習其他家電','learn')}</div>`;
    return head('今天想學哪一種家電？','從基本操作到日常保養，一起慢慢學','教學中心')+chooseGrid();
  }
  function tutorialPage() {
    if(!activeLesson) return head('這個教學連結無法開啟')+empty('請重新選擇教學','您可以從家電種類找到想學的內容','learn','前往教學中心');
    const l=activeLesson, device=D.devices[l.type], lesson=device.lessons[l.issue], [title,text]=lesson.steps[l.step];
    return head(lesson.short,'按下一步繼續，也可以播放或朗讀','教學中心 / '+device.name)+`<section class="panel lesson-panel"><div class="step-top"><strong>步驟 ${l.step+1} / 3</strong><span>${playing?'正在播放':'慢慢看，不用急'}</span></div><div class="progress" role="progressbar" aria-label="教學進度" aria-valuenow="${l.step+1}" aria-valuemin="0" aria-valuemax="3"><span style="width:${(l.step+1)/3*100}%"></span></div><div class="lesson-layout"><div class="lesson-illustration"><span class="step-bubble">${l.step+1}</span>${art(l.type)}</div><div class="lesson-copy" aria-live="polite" aria-atomic="true"><span class="badge">${device.name}・基本操作</span><h2>${title}</h2><p>${text}</p></div></div><div class="player-controls">${btn('上一步','prev-step','secondary',l.step===0?'disabled':'')}${btn(playing?'暫停教學':'播放教學','play-lesson','navy',`aria-pressed="${playing}"`)}${btn(l.step===2?'完成教學':'下一步','next-step')}${btn('重新觀看','restart-lesson','secondary')}${btn('朗讀這一步','speak-step','secondary')}</div><p class="lesson-status" role="status">${playing?'會等朗讀結束再換下一步，您隨時可以暫停':'您可以自行切換步驟，不需要趕時間'}</p></section><p class="learning-footnote">按鍵與功能依機型而異，請以產品說明書為準。若有焦味、漏電或其他異常，請停止使用並尋求專業協助。</p><div class="actions">${btn('我學會了','learned')}${btn('還是不會，找人幫忙','need-help','secondary')}</div>`;
  }
  function feedbackPage() {
    if(!activeLesson) return head('先選擇想學的家電')+chooseGrid();
    return `<section class="panel center-panel"><div class="feedback-symbol">${icon('check',45)}</div><h1>請問您的問題解決了嗎？</h1><p class="muted">再看一次，或找下一步協助，都可以</p><div class="choice-list">${option('已經解決了','記錄這次學會的操作','solved','check')}${option('還需要幫忙','整理問題，選擇協助方式','feedback-help','help')}${option('我想再看一次','回到第一步，重新練習','rewatch','cycle')}</div></section>`;
  }
  function completePage() {
    if(!activeLesson || activeLesson.feedback!=='solved') return feedbackPage();
    const rating=activeLesson.rating || 0;
    return `<section class="panel center-panel"><div class="feedback-symbol">${icon('check',45)}</div><h1>太好了，又學會一件事</h1><p class="muted">下次有需要，隨時回來看看</p><div class="actions vertical">${link('返回首頁','home','primary')}${link('學習其他家電','learn')}</div><div class="survey-panel"><h2>這次教學有幫助嗎？</h2><p class="small muted">選填，1 分為需要改善，5 分為非常有幫助</p><div class="rating" role="group" aria-label="教學滿意度">${[1,2,3,4,5].map(n=>`<button data-action="rate" data-rating="${n}" aria-label="${n} 分" aria-pressed="${n===rating}">${n} 分</button>`).join('')}</div><p id="rating-status" role="status" class="small muted">${rating?'已記錄 '+rating+' 分，謝謝您的回饋':'不填寫也可以繼續使用'}</p></div></section>`;
  }
  function contextCard() {
    const c=db.context;
    return `<section class="panel help-summary"><img class="wide-photo" src="assets/服務情境1.jpg" alt="顧問傾聽家電使用需求"><div class="help-summary-copy"><h2>${c?'目前想詢問的問題':'先想想，您需要什麼協助？'}</h2>${c?`<div class="summary-device">${icon(D.devices[c.type].icon,38)}<strong>${D.devices[c.type].name}</strong></div><p>${esc(problemText())}</p>${link('重新選擇問題','questions?type='+c.type,'secondary')}`:`<p class="muted">可以先找家電教學，也可以直接整理服務需求。</p>${link('先選擇家電','choose','secondary')}`}</div></section>`;
  }
  function helpPage() {
    return head('有疑問，我們一起找下一步','選擇適合您的協助方式','找人協助')+`<div class="two-col help-layout"><div class="choice-list">${option('電話諮詢','先準備想詢問的內容','phone','phone')}${option('門市與服務地區','選擇方便前往的地區','stores','store')}${option('整理服務需求','選擇門市或到府，以及希望的時段','booking','calendar')}<a class="saved-request-link" href="#requests">${icon('calendar',22)} 查看已儲存的服務需求 ${arrow()}</a></div>${contextCard()}</div>`;
  }
  function phonePage() {
    const c=db.context;
    const saved=db.phoneNotes?.context;
    const previous=saved&&validType(saved.type)?`<section class="panel"><h2>上次儲存的諮詢重點</h2><dl class="summary-list"><dt>家電種類</dt><dd>${D.devices[saved.type].name}</dd><dt>想詢問的問題</dt><dd>${esc(problemText(saved))}</dd></dl></section>`:'';
    return head('電話諮詢前，先準備好','把想問的內容整理在一起','電話諮詢')+`<section class="panel"><h2>這些資訊，可以幫助您說明問題</h2><dl class="summary-list"><dt>家電種類</dt><dd>${c?D.devices[c.type].name:'尚未選擇'}</dd><dt>想詢問的問題</dt><dd>${c?esc(problemText()):'可先選擇家電與問題'}</dd><dt>建議準備</dt><dd>產品說明書、型號與面板上的訊息</dd></dl><p class="availability-note">電話服務尚未開放，請使用購買憑證或保固書上的聯絡方式詢問。</p><div class="actions">${c?btn('儲存諮詢重點','phone-interest'):link('先選擇家電','choose','primary')}${link('整理服務需求','booking')}</div><p id="phone-status" class="small muted" role="status"></p></section>${previous}`;
  }
  function storesPage() {
    const cities=[...new Set(D.stores.map(s=>s.city))],districts=[...new Set(D.stores.filter(s=>!filterCity||s.city===filterCity).map(s=>s.district))];
    const regions=D.stores.filter(s=>(!filterCity||s.city===filterCity)&&(!filterDistrict||s.district===filterDistrict));
    return head('選擇方便的服務地區','先選地區，再整理門市諮詢需求','門市與服務地區')+`<div class="filter-grid"><label class="field">縣市<select id="city-filter"><option value="">全部縣市</option>${cities.map(city=>`<option ${city===filterCity?'selected':''}>${esc(city)}</option>`).join('')}</select></label><label class="field">區域<select id="district-filter"><option value="">全部區域</option>${districts.map(district=>`<option ${district===filterDistrict?'selected':''}>${esc(district)}</option>`).join('')}</select></label></div><p class="small muted" role="status">${regions.length} 個可選地區</p><div class="two-col">${regions.map(s=>`<article class="panel store-card"><span class="option-icon">${icon('store',30)}</span><div class="store-info"><h2>${esc(s.city)}・${esc(s.district)}</h2><p>整理這個地區的門市諮詢需求</p></div>${btn('選擇這個地區','book-store','secondary',`data-store="${s.id}"`)}</article>`).join('')}</div><p class="availability-note">門市查詢尚未開放；以上為地區選擇，不代表實際門市或可預約名額。</p>`;
  }
  function ensureDraft() {
    if(!db.draft || typeof db.draft!=='object' || Array.isArray(db.draft)) db.draft={type:'',place:params.get('place')==='home'?'home':'',device:db.context?.type||'',problem:problemText(),city:'',district:'',date:'',time:''};
    const b=db.draft, service=services.find(s=>s.name===b.type);
    if(!service)b.type='';
    if(!D.stores.some(s=>s.city===b.city&&s.district===b.district)){b.district='';if(!D.stores.some(s=>s.city===b.city))b.city='';}
    if(typeof b.problem!=='string')b.problem='家電使用諮詢';
    if(service&&!service.places.includes(b.place)) b.place='store';
    if(!dates().some(d=>d.value===b.date)) b.date='';
    if(!times.includes(b.time)) b.time='';
    if(!validType(b.device)) b.device='';
    const maxStep=firstMissingStep(b);
    const requested=Number(params.get('step')||0);
    b.step=Math.min(Number.isInteger(requested)&&requested>=0?requested:0,maxStep,3);
    save(); return b;
  }
  function firstMissingStep(b) {
    if(!services.some(s=>s.name===b.type)||!validType(b.device)) return 0;
    if(!['home','store'].includes(b.place)||!b.city||!b.district) return 1;
    if(!dates().some(d=>d.value===b.date)||!times.includes(b.time)) return 2;
    return 3;
  }
  function bookingSummary(b) {
    return `<dl class="summary-list"><dt>家電種類</dt><dd>${validType(b.device)?D.devices[b.device].name:'尚未選擇'}</dd><dt>需要協助</dt><dd>${esc(b.problem||'家電使用諮詢')}</dd><dt>服務類型</dt><dd>${esc(b.type)}</dd><dt>希望的方式</dt><dd>${b.place==='home'?'到府服務':'門市諮詢'}</dd><dt>服務地區</dt><dd>${esc(b.city||'尚未選擇')} ${esc(b.district||'')}</dd><dt>希望的時段</dt><dd>${esc(dateLabel(b.date))}<br>${esc(b.time)}</dd></dl>`;
  }
  function bookingPage() {
    const b=ensureDraft(), service=services.find(s=>s.name===b.type);
    const cities=[...new Set(D.stores.map(s=>s.city))],districts=[...new Set(D.stores.filter(s=>s.city===b.city).map(s=>s.district))];
    let content='';
    if(b.step===0) content=`<h2>您需要哪一種服務？</h2><div class="choice-list">${services.map(s=>`<button class="option" data-action="book-type" data-value="${s.name}" aria-pressed="${b.type===s.name}"><span class="option-icon">${icon('check')}</span><span class="option-copy"><strong>${s.name}</strong><small>${s.text}</small></span><span class="selection-check">${b.type===s.name?'已選擇':''}</span></button>`).join('')}</div><label class="field booking-device">需要協助的家電<select id="booking-device"><option value="">請選擇家電種類</option>${Object.entries(D.devices).map(([type,d])=>`<option value="${type}" ${b.device===type?'selected':''}>${d.name}</option>`).join('')}</select></label>`;
    if(b.step===1) content=`<h2>您希望在哪裡接受服務？</h2><div class="booking-choices">${[['store','到門市','在方便的地區詢問與體驗','store'],['home','到府服務','希望有人到家中協助','home']].filter(([value])=>service?.places.includes(value)).map(([value,title,text,ic])=>`<button class="option" data-action="book-place" data-value="${value}" aria-pressed="${b.place===value}"><span class="option-icon">${icon(ic)}</span><span><strong>${title}</strong><small>${text}</small></span></button>`).join('')}</div>${service?.places.length===1?'<p class="small muted">此項服務安排在門市進行</p>':''}<div class="filter-grid booking-region"><label class="field">縣市<select id="booking-city"><option value="">請選擇縣市</option>${cities.map(city=>`<option ${city===b.city?'selected':''}>${esc(city)}</option>`).join('')}</select></label><label class="field">區域<select id="booking-district" ${!b.city?'disabled':''}><option value="">請選擇區域</option>${districts.map(district=>`<option ${district===b.district?'selected':''}>${esc(district)}</option>`).join('')}</select></label></div>`;
    if(b.step===2) content=`<h2>選擇您希望的日期與時段</h2><label class="field">希望的日期<select id="booking-date"><option value="">請選擇日期</option>${dates().map(d=>`<option value="${d.value}" ${d.value===b.date?'selected':''}>${d.label}</option>`).join('')}</select></label><div class="choice-list booking-time">${times.map(time=>`<button class="option" data-action="book-time" data-value="${time}" aria-pressed="${b.time===time}">${icon('calendar')}<strong>${time}</strong></button>`).join('')}</div><p class="small muted">這是您希望的時間，實際安排需另向門市確認。</p>`;
    if(b.step===3) content=`<h2>確認您的服務需求</h2>${bookingSummary(b)}<p class="availability-note">目前尚未開放線上送出。您可以先儲存需求，聯絡門市時再出示這份摘要。</p>`;
    return head('把需要的協助，先整理好','選擇服務、地區與希望的時段','服務需求')+`<ol class="stepper">${['服務內容','服務地點','希望時段','確認需求'].map((name,i)=>`<li class="${i<=b.step?'active':''}" ${i===b.step?'aria-current="step"':''}>${i+1}．${name}</li>`).join('')}</ol><section class="panel">${content}<div class="actions">${b.step?btn('上一步','book-back','secondary'):link('返回找人協助','help')}${btn(b.step===3?'儲存服務需求':'下一步',b.step===3?'book-confirm':'book-next','primary',firstMissingStep(b)<b.step+1&&b.step<3?'disabled':'')}</div></section>${storageNote()}`;
  }
  function requestsPage() {
    return `<div class="section-heading">${head('我的服務需求','需要聯絡門市時，先看看準備好的內容')}${btn('新增需求','new-booking','primary')}</div>${db.requests.length?`<div class="two-col">${[...db.requests].reverse().map(b=>`<article class="panel"><span class="badge">已儲存・未送出</span><h2>${esc(b.type)}</h2><p>${validType(b.device)?D.devices[b.device].name:'家電諮詢'} · ${b.place==='home'?'到府需求':'門市需求'}<br>${esc(dateLabel(b.date))}</p>${link('查看需求摘要','booked?id='+encodeURIComponent(b.id),'secondary')}</article>`).join('')}</div>`:empty('還沒有儲存服務需求','選好家電、服務與希望的時段，就能整理成一份摘要','booking','整理第一份需求')}`;
  }
  function bookedPage() {
    const b=params.has('id')?db.requests.find(r=>r.id===params.get('id')):db.requests.at(-1);
    if(!b) return head('服務需求摘要')+empty('找不到這份服務需求','可能已經刪除，您可以查看其他需求','requests','我的服務需求');
    return `<section class="panel center-panel"><div class="feedback-symbol">${icon('check',45)}</div><span class="badge">已儲存・未送出</span><h1>服務需求已儲存</h1><p class="muted">聯絡門市時，可以出示這份摘要</p><div class="request-summary">${bookingSummary(b)}</div><p class="availability-note">此需求尚未送交門市，日期與服務方式仍需由門市確認。</p><div class="actions vertical">${link('查看我的服務需求','requests','primary')}${link('返回首頁','home')}${btn('刪除這份需求','delete-request','danger',`data-id="${esc(b.id)}"`)}</div></section>`;
  }
  function myPage() {
    return `<div class="section-heading">${head('我的家電','常用的家電教學，隨時找得到')}${link('新增家電','edit?new=1','primary')}</div>${db.appliances.length?`<div class="two-col">${db.appliances.map(a=>`<article class="panel appliance-row">${art(a.type)}<div><h2>${esc(a.room)}的${D.devices[a.type].name}</h2><p>查看常見問題與使用教學</p></div><div class="actions">${link('查看教學','device?id='+encodeURIComponent(a.id),'primary')}${link('修改資料','edit?id='+encodeURIComponent(a.id))}${btn('刪除','delete-device','danger',`data-id="${esc(a.id)}"`)}</div></article>`).join('')}</div>`:empty('把家中的家電加進來','選擇種類與放置位置，下次就能更快找到教學','edit?new=1','新增第一台家電')}${storageNote()}`;
  }
  function devicePage() {
    const a=db.appliances.find(item=>item.id===params.get('id'));
    if(!a) return head('找不到這台家電')+empty('這台家電可能已刪除','您可以從清單選擇其他家電','my','返回我的家電');
    return head(esc(a.room)+'的'+D.devices[a.type].name,'選擇您想了解的內容')+`<section class="panel"><div class="device-summary">${art(a.type)}<div><h2>${D.devices[a.type].name}</h2><p>放置位置：${esc(a.room)}</p></div></div><div class="actions">${link('選擇常見問題','questions?type='+a.type,'primary')}${link('查看全部教學','learn?type='+a.type)}${btn('找人協助','device-help','secondary',`data-type="${a.type}"`)}${link('修改資料','edit?id='+encodeURIComponent(a.id))}</div></section>`;
  }
  function editPage() {
    const id=params.get('id'), a=db.appliances.find(item=>item.id===id);
    if(id&&!a) return devicePage();
    const type=a?.type || (validType(params.get('type'))?params.get('type'):selectedType);
    return head(a?'修改家電資料':'新增您的家電','選擇種類與放置位置就可以')+`<form id="appliance-form" class="panel"><input type="hidden" name="recordId" value="${esc(a?.id||'')}"><div class="filter-grid"><label class="field">家電種類<select name="type" required><option value="">請選擇家電</option>${Object.entries(D.devices).map(([key,d])=>`<option value="${key}" ${key===type?'selected':''}>${d.name}</option>`).join('')}</select></label><label class="field">放在哪裡<select name="room" required><option value="">請選擇放置位置</option>${rooms.map(room=>`<option ${room===(a?.room||(validType(type)?D.devices[type].room:''))?'selected':''}>${room}</option>`).join('')}</select></label></div><div class="actions"><button class="btn primary" type="submit">${a?'儲存修改':'確認新增'}</button>${link('取消','my')}</div></form>${storageNote()}`;
  }
  function promoVideo() {
    return `<div class="video-wrap"><video id="promo-video" class="promo-video" controls playsinline preload="metadata" poster="assets/服務情境1.jpg" aria-label="全國智家服務介紹影片"><source src="assets/家電操作.mp4" type="video/mp4">您的瀏覽器無法播放這支影片。</video></div><div id="video-error" class="notice error" role="alert" hidden>影片暫時無法播放，您仍可繼續使用教學與其他功能。</div><div class="player-controls">${btn('播放影片','video-play','navy')}${btn('暫停影片','video-pause','secondary')}${btn('重新播放','video-restart','secondary')}${btn('靜音','video-mute','secondary','aria-pressed="false"')}</div><p id="video-status" class="lesson-status" role="status">認識全國智家的服務方式</p>`;
  }
  function aboutPage() {
    return `<section class="about-hero"><div><p class="eyebrow">全國智家｜全國智慧居家</p><h1>家電不會用？<br>全國智家陪您學</h1><p class="muted">選擇家電、找到問題，<br>把每個操作拆成看得懂的小步驟</p><div class="actions">${link('開始找教學','scan','primary')}${link('認識服務流程','cycle')}</div></div><img src="assets/服務情境3.jpg" alt="顧問介紹洗衣機操作"></section><div class="feature-grid">${[['01','看得清楚','大字選項與清楚步驟，輕鬆找到想學的內容。'],['02','照自己的速度','可朗讀、暫停與重播，不用一次記住所有操作。'],['03','知道下一步','還有疑問時，整理問題與服務需求，再向門市諮詢。']].map(([n,t,p])=>`<section class="panel"><span class="feature-number">${n}</span><h2>${t}</h2><p>${p}</p></section>`).join('')}</div><section class="panel"><h2>讓家電融入生活</h2>${promoVideo()}</section><div class="two-col"><section class="panel"><img class="wide-photo about-guidance-photo" src="assets/服務情境2.jpg" alt="陪同練習手機操作"><h2>第一次使用，也能慢慢上手</h2><p class="muted">跟著洗衣機操作的導覽，練習選擇家電、觀看教學與尋找協助。</p>${link('開始使用導覽','guide','primary')}</section><section class="panel"><h2>學習之外，也準備好服務需求</h2><p>把想詢問的問題、方便的地區與希望的時段整理好，聯絡門市時就更容易說清楚。</p><div class="actions vertical">${link('整理服務需求','booking','primary')}${link('查看已儲存需求','requests')}</div><details class="site-info"><summary>關於本站與服務狀態</summary><p>本站為學生製作的家電服務提案，並非全國電子官方網站。教學、家電清單與需求整理可使用；影像辨識、線上客服、門市查詢及預約送出尚未開放。照片由使用者確認家電種類，服務需求僅儲存在目前瀏覽器。</p><p>本站不要求姓名、電話或住址；相片不會上傳。</p></details></section></div>`;
  }
  function cyclePage() {
    const requested=Number(params.get('stage')),n=Number.isInteger(requested)&&requested>=0&&requested<=6?requested:0,c=D.cycle[n];
    return head('每一次需要，都有下一步','點選階段，了解從學習到服務的安排','服務流程')+`<div class="cycle-layout"><div class="cycle-nodes" aria-label="七個服務階段">${D.cycle.map((item,i)=>`<a class="cycle-node ${i===n?'active':''}" href="#cycle?stage=${i}" ${i===n?'aria-current="step"':''}><b>${i+1}</b><span>${item.title}</span></a>`).join('')}<div class="cycle-return">↻ 新的問題，回到需求諮詢</div></div><article class="panel cycle-detail"><img src="assets/服務情境${c.image}.jpg" alt="${c.title}情境"><span class="badge">階段 ${n+1} / 7</span><h2>${c.tag}</h2><p>${c.text}</p><div class="actions">${link(c.action,c.route,'primary')}${link(n===6?'回到需求諮詢':'下一個階段','cycle?stage='+(n===6?1:n+1))}</div></article></div>`;
  }
  function guidePage() {
    return head('跟著練習，一次就會更熟悉','從洗衣機教學開始，試著走過每個步驟','使用導覽')+`<section class="demo-banner"><div><h2>不知道模式怎麼選？<br>我們一起找答案</h2><p>選擇家電、看看教學，再決定是否需要其他協助。</p>${btn('開始引導練習','start-scenario')}</div><img src="assets/服務情境2.jpg" alt="陪同使用手機查找家電教學"></section><div class="actions">${link('直接選擇家電','choose','secondary')}${link('了解服務流程','cycle','secondary')}</div>`;
  }
  function staffPage() {
    return head('工作人員專區','服務紀錄與資料管理集中在這裡','全國智家・服務工作區')+`<p class="workspace-note">此工作區用於本機流程檢視；狀態變更不會通知顧客或安排派工。</p><div class="demo-grid">${[['store','顧問工作台','查看已儲存的服務需求與處理進度','advisor'],['chart','使用紀錄','檢視教學、問題回饋與協助需求','dashboard']].map(([ic,title,text,path])=>`<section class="panel"><span class="option-icon">${icon(ic,30)}</span><h2>${title}</h2><p class="muted">${text}</p>${link('開啟'+title,path,'secondary')}</section>`).join('')}</div>${storeManagement()}`;
  }
  function storeManagement() {
    return `<details><summary>地區資料管理</summary><p class="small muted">匯入 JSON 更新可選地區。資料不包含正式門市地址、電話或即時可預約名額。</p><label class="field">匯入地區 JSON<input id="stores-file" type="file" accept="application/json,.json"></label><div class="actions"><a class="btn secondary" href="assets/stores.json" download>下載 JSON 範例</a>${btn('恢復預設地區','restore-stores','secondary')}</div></details>`;
  }
  function currentRequest() { return db.requests.find(r=>r.id===params.get('id'))||db.requests.at(-1); }
  function advisorPage() {
    const b=currentRequest();
    if(!b) return head('顧問工作台','從已儲存的服務需求開始','工作人員專區')+empty('目前沒有服務需求','先完成一份需求整理，就能檢視後續處理流程','booking','整理服務需求');
    b.state=Math.max(0,Math.min(4,Number(b.state)||0)); b.notes=Array.isArray(b.notes)?b.notes.filter(n=>typeof n==='string'):[];
    const notes=['已確認家電與操作問題','已陪同練習基本操作','已建議準備產品說明書','待確認服務地區與費用','已提醒依原廠建議保養'];
    return head('顧問工作台','查看需求，接續後續處理','工作人員專區')+`<p class="workspace-note">工作區狀態僅保存在此瀏覽器，不代表已聯絡門市或安排人員。</p><label class="field case-selector">選擇需求<select id="advisor-request">${[...db.requests].reverse().map(r=>`<option value="${esc(r.id)}" ${r.id===b.id?'selected':''}>${esc(r.type)}・${esc(r.city)} ${esc(r.district)}</option>`).join('')}</select></label><div class="two-col"><section class="panel"><h2>服務需求摘要</h2>${bookingSummary(b)}<p class="small muted">狀態：已儲存，未送出</p><h2>諮詢紀錄</h2>${b.notes.length?`<ul class="event-list">${b.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:'<p class="muted small">尚無諮詢紀錄</p>'}<label class="field">加入紀錄<select id="advisor-note">${notes.map(n=>`<option>${n}</option>`).join('')}</select></label><div class="actions">${btn('儲存紀錄','add-note','secondary',`data-id="${esc(b.id)}"`)}</div></section><div><section class="panel"><h2>目前：${stages[b.state]}</h2><ol class="status-list">${stages.map((s,i)=>`<li class="${i<b.state?'done':i===b.state?'current':''}" ${i===b.state?'aria-current="step"':''}><span class="status-dot"></span>${i+1}．${s}</li>`).join('')}</ol><div class="actions">${btn(b.state===4?'已進入持續關懷':'更新為「'+stages[b.state+1]+'」','advance-advisor','primary',`data-id="${esc(b.id)}" ${b.state===4?'disabled':''}`)}${btn('重設處理進度','reset-advisor','secondary',`data-id="${esc(b.id)}"`)}</div></section><section class="panel"><h2>後續關懷</h2><p>${b.state>=3?'下次關懷可確認操作是否熟悉，並依原廠說明建議保養。':'教學完成後，再確認使用狀況與保養需求。'}</p></section></div></div>`;
  }
  function dashboardPage() {
    const events=db.events,count=type=>events.filter(e=>e.type===type).length;
    const sessions=new Set(events.map(e=>e.session)).size,helpSessions=new Set(events.filter(e=>e.type==='help').map(e=>e.session)).size;
    const feedback=new Map(),ratings=new Map();
    events.forEach(e=>{if(e.lesson&&['solved','needs_help'].includes(e.type))feedback.set(e.lesson,e.type);if(e.type==='rating'&&e.lesson&&[1,2,3,4,5].includes(e.value))ratings.set(e.lesson,e.value)});
    const solved=[...feedback.values()].filter(t=>t==='solved').length;
    const values=[...ratings.values()],average=values.length?(values.reduce((sum,n)=>sum+n,0)/values.length).toFixed(1)+' / 5':'—';
    const figures=statsSample?[120,76,'68%','4.6 / 5']:[sessions,count('lesson_complete'),feedback.size?Math.round(solved/feedback.size*100)+'%':'—',average];
    const measures=statsSample?[['諮詢重點儲存',37],['門市需求整理',42],['到府需求整理',18]]:[['諮詢重點儲存',count('phone_interest')],['門市需求整理',count('store_interest')],['到府需求整理',count('home_interest')]];
    const ratio=statsSample?35:sessions?Math.round(helpSessions/sessions*100):0;
    const max=Math.max(1,...measures.map(([,n])=>n));
    return head('使用紀錄','從教學回饋，了解哪些地方還需要協助','工作人員專區')+`<p class="workspace-note">${statsSample?'範例數據・非實際服務成果':'以下為此瀏覽器的操作紀錄，並非正式來電、到店或營運成果'}</p><div class="metrics">${[['使用次數',figures[0],'依開啟的工作階段計算'],['教學完成次數',figures[1],'每次學習計算一次'],['問題自行解決率',figures[2],'以有填寫回饋的學習計算'],['教學滿意度',figures[3],statsSample?'範例平均分數':values.length+' 次選填評分']].map(([name,value,sub])=>`<div class="metric"><span>${name}</span><strong>${value}</strong><small>${sub}</small></div>`).join('')}</div><div class="two-col stats-layout"><section class="panel"><h2>尋求協助與服務需求</h2><div class="bar-row"><div><span>尋求協助的比例</span><strong>${ratio}%</strong></div><div class="bar" role="img" aria-label="尋求協助的比例 ${ratio}%"><span style="width:${ratio}%"></span></div></div>${measures.map(([name,value])=>`<div class="bar-row"><div><span>${name}</span><strong>${value} 次</strong></div><div class="bar" role="img" aria-label="${name} ${value} 次"><span style="width:${value/max*100}%"></span></div></div>`).join('')}</section><section class="panel"><h2>資料說明</h2><p class="stat-source">解決率以每次學習最後的問題回饋計算；沒有填寫的不納入。評分可修改，取最後一次選擇。沒有資料時顯示「—」。</p><p class="stat-source">需求整理不等於預約送出。重設紀錄不會刪除家電或服務需求。</p><div class="actions vertical">${btn(statsSample?'查看操作紀錄':'查看數據範例','toggle-stats','secondary')}${btn('匯出匿名紀錄','export-events','secondary')}${btn('重設操作紀錄','reset-events','danger')}</div></section></div><section class="panel"><h2>最近的操作</h2>${events.length?`<ol class="event-list">${events.slice(-8).reverse().map(e=>`<li>${new Date(e.at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}・${eventLabel(e.type)}${validType(e.device)?'・'+D.devices[e.device].name:''}</li>`).join('')}</ol>`:'<p class="muted">尚無操作紀錄</p>'}</section>`;
  }
  function eventLabel(type) { return ({visit:'開啟網站',lesson_start:'開啟教學',lesson_complete:'完成教學',solved:'問題已解決',needs_help:'仍需要協助',help:'尋找協助',phone_interest:'儲存諮詢重點',store_interest:'儲存門市需求',home_interest:'儲存到府需求',booking:'儲存服務需求',rating:'填寫教學評分',device_saved:'儲存家電',manual_confirm:'選擇家電'})[type]||'使用功能'; }

  function modal(title, content, confirmText='', action='') {
    returnFocus=document.activeElement;
    $('#modal-body').innerHTML=`<h2 id="modal-title">${title}</h2>${content}${confirmText?`<div class="actions">${btn(confirmText,action,'danger')}</div>`:''}`;
    $('#modal-close').textContent=confirmText?'先不要':'關閉視窗';
    $('#modal').showModal();
    // Destructive dialogs initially focus the safe cancel action.
    if(confirmText) $('#modal-close').focus();
  }
  $('#modal').addEventListener('close',()=>{ if(returnFocus?.isConnected)returnFocus.focus();else main.focus({preventScroll:true}); });
  function updateStep(next) {
    stopPlayer();stopSpeech();
    if(!activeLesson)return;
    activeLesson.step=Math.max(0,Math.min(2,next));save();render();
    $('.lesson-copy h2')?.setAttribute('tabindex','-1');$('.lesson-copy h2')?.focus({preventScroll:true});
    if(innerWidth<=700)$('.lesson-copy')?.scrollIntoView({block:'center',behavior:'instant'});
  }
  function finishLesson() {
    if(!activeLesson)return;
    stopPlayer();stopSpeech();
    if(!activeLesson.completed){activeLesson.completed=true;log('lesson_complete',{device:activeLesson.type,issue:activeLesson.issue,lesson:activeLesson.id});}
    save();go('feedback?lesson='+activeLesson.id);
  }
  function feedback(value) {
    if(!activeLesson)return;
    activeLesson.feedback=value;
    log(value,{device:activeLesson.type,issue:activeLesson.issue,lesson:activeLesson.id});
  }
  function beginPlayback() {
    if(!activeLesson)return;
    stopPlayer();stopSpeech();playing=true;
    const token=playbackToken;
    function playStep() {
      if(!playing||token!==playbackToken||route!=='tutorial')return;
      render();let minimumElapsed=false,speechEnded=false,advanced=false;
      const advance=()=>{
        if(!minimumElapsed||!speechEnded||advanced||!playing||token!==playbackToken||route!=='tutorial')return;
        advanced=true;clearTimeout(playbackTimer);
        if(activeLesson.step===2){finishLesson();return;}
        activeLesson.step++;save();playStep();
      };
      const text=D.devices[activeLesson.type].lessons[activeLesson.issue].steps[activeLesson.step].join('。');
      speak(text,()=>{speechEnded=true;advance()});
      playbackTimer=setTimeout(()=>{minimumElapsed=true;advance()},15000);
    }
    playStep();
  }
  async function camera() {
    stopCamera();const token=cameraToken;
    $('#camera-zone').innerHTML=`<section class="panel camera-panel"><h2>對準家電拍照</h2><p id="camera-status" role="status">請允許使用相機</p><video id="camera-video" class="camera-view" autoplay playsinline muted></video><div class="actions">${btn('拍下照片','capture','primary','disabled')}${btn('關閉相機','close-camera','secondary')}${btn('改用上傳照片','upload','secondary')}</div></section>`;
    $('#camera-zone').scrollIntoView({block:'start',behavior:'instant'});
    try {
      if(!navigator.mediaDevices?.getUserMedia)throw Error();
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
      if(token!==cameraToken||route!=='scan'||!$('#camera-video')){stream.getTracks().forEach(t=>t.stop());return;}
      cameraStream=stream;const video=$('#camera-video');video.srcObject=stream;await video.play();
      if(token!==cameraToken)return;
      $('#camera-status').textContent='拍好照片後，再選擇家電種類';
      $('[data-action="capture"]').disabled=false;
    } catch {
      if(token!==cameraToken)return;
      stopCamera();if($('#camera-status'))$('#camera-status').textContent='無法開啟相機，您可以改用上傳照片，或直接選擇家電';
    }
  }
  function setPhoto(blob) {
    if(photoURL)URL.revokeObjectURL(photoURL);
    photoURL=URL.createObjectURL(blob);go('choose');
  }
  async function handlePhoto(file) {
    if(!file)return;
    if(!file.type.startsWith('image/')){toast('請選擇 JPG、PNG 等圖片');return;}
    if(file.size>20*1024*1024){toast('照片較大，請改選 20 MB 以下的圖片');return;}
    const token=++uploadToken,url=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);if(token===uploadToken&&['scan','choose'].includes(route))setPhoto(file)};
    image.onerror=()=>{URL.revokeObjectURL(url);if(token===uploadToken)toast('無法讀取這張照片，請改選 JPG 或 PNG')};
    image.src=url;
  }
  function bindMedia() {
    const video=$('#promo-video');if(!video)return;
    const fail=()=>{if($('#video-error'))$('#video-error').hidden=false;};
    video.addEventListener('error',fail);video.querySelector('source')?.addEventListener('error',fail);
    video.addEventListener('play',()=>{if($('#video-status'))$('#video-status').textContent='影片播放中'});
    video.addEventListener('pause',()=>{if($('#video-status'))$('#video-status').textContent=video.ended?'影片播放結束':'影片已暫停'});
    video.addEventListener('volumechange',()=>{const b=$('[data-action="video-mute"]');if(b){b.textContent=video.muted?'開啟聲音':'靜音';b.setAttribute('aria-pressed',String(video.muted))}});
  }
  async function playVideo(restart=false) {
    const video=$('#promo-video');if(!video)return;
    try{if(restart)video.currentTime=0;await video.play()}catch{toast('影片暫時無法播放，請稍後再試')}
  }
  function newBooking(seed={}) {
    db.draft=null;
    const query=seed.place?'?place='+seed.place:'';
    if(route==='booking') {params=new URLSearchParams(query);ensureDraft();Object.assign(db.draft,seed);save();go('booking?step=0',true);render();}
    else {go('booking'+query);Object.assign(db.draft,seed);save();render();}
  }
  function restoreActionFocus(element) {
    if(element.isConnected||$('#modal').open)return;
    const selector=Object.entries(element.dataset).map(([key,value])=>`[data-${key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(value)}"]`).join('');
    const replacement=selector?main.querySelector(selector):null;
    if(replacement&&!replacement.disabled)replacement.focus({preventScroll:true});
  }
  document.addEventListener('click',async event=>{
    const anchor=event.target.closest('a[href^="#"]');
    if(anchor&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){
      event.preventDefault();
      if(anchor.getAttribute('href')==='#main'){main.focus();main.scrollIntoView({block:'start'});return;}
      if($('#modal').open)$('#modal').close();
      go(anchor.getAttribute('href').slice(1));return;
    }
    const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
    const a=el.dataset.action,before=route;
    switch(a){
      case 'manual':clearPhoto();go('choose');break;
      case 'upload':stopCamera();if($('#camera-zone'))$('#camera-zone').innerHTML='';if($('#photo-file')){$('#photo-file').value='';$('#photo-file').click();}break;
      case 'camera':await camera();break;
      case 'close-camera':stopCamera();$('#camera-zone').innerHTML='';$('[data-action="camera"]')?.focus();break;
      case 'capture':{const v=$('#camera-video');if(!v?.videoWidth){toast('相機還沒準備好，請稍候');break;}const token=cameraToken,c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(blob=>{if(blob&&route==='scan'&&token===cameraToken){stopCamera();setPhoto(blob)}},'image/jpeg',.85);break;}
      case 'simulate':context('washer');clearPhoto();go('result?type=washer');break;
      case 'select-device':context(el.dataset.type);log('manual_confirm',{device:selectedType});go('result?type='+selectedType);break;
      case 'confirm-device':if(validType(selectedType))go('questions?type='+selectedType);break;
      case 'quick-save':go('edit?new=1&type='+selectedType);break;
      case 'lesson':newLesson(el.dataset.type,Number(el.dataset.issue));break;
      case 'help':go('help');break;
      case 'phone':go('phone');break;
      case 'stores':go('stores');break;
      case 'booking':go('booking');break;
      case 'prev-step':if(activeLesson)updateStep(activeLesson.step-1);break;
      case 'next-step':if(activeLesson){if(activeLesson.step===2)finishLesson();else updateStep(activeLesson.step+1);}break;
      case 'play-lesson':if(playing){stopPlayer();stopSpeech();render()}else beginPlayback();break;
      case 'restart-lesson':updateStep(0);break;
      case 'speak-step':if(activeLesson){stopPlayer();render();speak(D.devices[activeLesson.type].lessons[activeLesson.issue].steps[activeLesson.step].join('。'));}break;
      case 'learned':finishLesson();break;
      case 'need-help':feedback('needs_help');go('help');break;
      case 'solved':feedback('solved');if(activeLesson)go('complete?lesson='+activeLesson.id);break;
      case 'feedback-help':feedback('needs_help');go('help');break;
      case 'rewatch':if(activeLesson){activeLesson.step=0;save();go(lessonPath())}break;
      case 'rate':if(activeLesson){activeLesson.rating=Number(el.dataset.rating);log('rating',{value:activeLesson.rating,device:activeLesson.type,lesson:activeLesson.id});render()}break;
      case 'phone-interest':if(db.context){db.phoneNotes={context:{...db.context},savedAt:new Date().toISOString()};log('phone_interest',{device:db.context.type});render();$('#phone-status').textContent='諮詢重點已儲存。請依購買憑證或保固書上的電話聯絡。';toast(storageOK?'諮詢重點已儲存':'諮詢重點已整理，關閉頁面後可能不會保留')}break;
      case 'book-store':{const region=D.stores.find(s=>s.id===el.dataset.store);if(region)newBooking({place:'store',city:region.city,district:region.district});break;}
      case 'new-booking':newBooking();break;
      case 'book-type':if(db.draft){db.draft.type=el.dataset.value;const service=services.find(s=>s.name===db.draft.type);if(service?.places.length===1)db.draft.place=service.places[0];save();render()}break;
      case 'book-place':if(db.draft&&services.find(s=>s.name===db.draft.type)?.places.includes(el.dataset.value)){db.draft.place=el.dataset.value;save();render()}break;
      case 'book-time':if(db.draft&&times.includes(el.dataset.value)){db.draft.time=el.dataset.value;save();render()}break;
      case 'book-next':if(db.draft&&firstMissingStep(db.draft)>db.draft.step)go('booking?step='+(db.draft.step+1));break;
      case 'book-back':if(db.draft)go('booking?step='+Math.max(0,db.draft.step-1));break;
      case 'book-confirm':{
        if(!db.draft||firstMissingStep(db.draft)!==3)return;
        el.disabled=true;const b={...db.draft,id:'REQ-'+uid().toUpperCase(),state:0,notes:[],createdAt:new Date().toISOString()};delete b.step;
        db.requests.push(b);db.requests=db.requests.slice(-100);db.draft=null;
        log('booking',{device:b.device,place:b.place});log(b.place==='home'?'home_interest':'store_interest',{device:b.device});
        go('booked?id='+encodeURIComponent(b.id));break;
      }
      case 'delete-device':pendingDelete=el.dataset.id;modal('確定刪除這台家電？','<p>刪除後，這張家電卡片將不再保留。教學仍可從教學中心找到。</p>','確定刪除','confirm-delete');break;
      case 'confirm-delete':db.appliances=db.appliances.filter(a=>a.id!==pendingDelete);save();$('#modal').close();render();toast('家電已刪除');main.focus();break;
      case 'delete-request':pendingRequestDelete=el.dataset.id;modal('刪除這份服務需求？','<p>刪除後，這份摘要與處理紀錄將不再保留。</p>','確定刪除','confirm-delete-request');break;
      case 'confirm-delete-request':db.requests=db.requests.filter(r=>r.id!==pendingRequestDelete);save();$('#modal').close();go('requests');toast('服務需求已刪除');break;
      case 'device-help':context(el.dataset.type);go('help');break;
      case 'video-play':await playVideo();break;
      case 'video-pause':$('#promo-video')?.pause();break;
      case 'video-restart':await playVideo(true);break;
      case 'video-mute':if($('#promo-video'))$('#promo-video').muted=!$('#promo-video').muted;break;
      case 'start-scenario':tour=true;tourPreference(true);clearPhoto();go('home');break;
      case 'exit-scenario':tour=false;tourPreference(false);render();break;
      case 'add-note':{const b=db.requests.find(r=>r.id===el.dataset.id);if(b){b.notes??=[];b.notes.push($('#advisor-note').value);save();render();toast('諮詢紀錄已儲存')}break;}
      case 'advance-advisor':{const b=db.requests.find(r=>r.id===el.dataset.id);if(b){b.state=Math.min(4,(Number(b.state)||0)+1);save();render();toast('處理進度已更新')}break;}
      case 'reset-advisor':{const b=db.requests.find(r=>r.id===el.dataset.id);if(b){b.state=0;save();render();toast('處理進度已重設')}break;}
      case 'toggle-stats':statsSample=!statsSample;render();break;
      case 'restore-stores':db.stores=null;D.stores=defaultStores.map(s=>({...s}));filterCity='';filterDistrict='';save();render();toast('已恢復預設地區');break;
      case 'reset-events':modal('重設操作紀錄？','<p>將清除教學、回饋與協助需求的統計。已儲存的家電與服務需求會保留。</p>','確認重設','confirm-reset-events');break;
      case 'confirm-reset-events':db.events=[];sessionId=uid();save();$('#modal').close();render();toast('操作紀錄已重設');break;
      case 'export-events':{const blob=new Blob([JSON.stringify({project:'全國智家｜全國智慧居家',source:'此瀏覽器的匿名操作紀錄',events:db.events},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='全國智家-使用紀錄.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('使用紀錄已匯出');break;}
    }
    if(before===route)restoreActionFocus(el);
  });
  document.addEventListener('change',async event=>{
    const el=event.target;
    if(el.id==='photo-file')handlePhoto(el.files?.[0]);
    if(el.id==='city-filter'){filterCity=el.value;filterDistrict='';render('#city-filter')}
    if(el.id==='district-filter'){filterDistrict=el.value;render('#district-filter')}
    if(el.id==='booking-device'&&db.draft){db.draft.device=el.value;db.draft.problem=db.context?.type===el.value?problemText():'家電使用諮詢';save();render('#booking-device')}
    if(el.id==='booking-city'&&db.draft){db.draft.city=el.value;db.draft.district='';save();render('#booking-city')}
    if(el.id==='booking-district'&&db.draft){db.draft.district=el.value;save();render('#booking-district')}
    if(el.id==='booking-date'&&db.draft){db.draft.date=el.value;save();render('#booking-date')}
    if(el.id==='advisor-request')go('advisor?id='+encodeURIComponent(el.value));
    if(el.matches('#appliance-form [name="type"]')){const room=$('#appliance-form [name="room"]');if(validType(el.value)&&!room.value)room.value=D.devices[el.value].room;}
    if(el.id==='stores-file'){
      const file=el.files?.[0];if(!file)return;
      if(file.size>100*1024){toast('請選擇 100 KB 以下的 JSON 檔案');return;}
      try{const list=validateStores(JSON.parse(await file.text()));D.stores=list;db.stores=list;filterCity='';filterDistrict='';save();toast('已匯入 '+list.length+' 筆地區資料')}
      catch(error){toast('匯入失敗：'+(error instanceof SyntaxError?'檔案不是有效的 JSON':error.message))}
    }
  });
  document.addEventListener('submit',event=>{
    if(!event.target.matches('#appliance-form'))return;
    event.preventDefault();
    const data=new FormData(event.target),id=data.get('recordId'),type=data.get('type'),room=data.get('room');
    if(!validType(type)||!rooms.includes(room)){toast('請選擇家電種類與放置位置');return;}
    const index=db.appliances.findIndex(a=>a.id===id);
    if(id&&index<0){toast('這台家電已被刪除，請回清單重新選擇');return;}
    const record={id:id||uid(),type,room};
    if(index>=0)db.appliances[index]=record;else db.appliances.push(record);
    log('device_saved',{device:type});go('my');toast(storageOK?(index>=0?'家電資料已修改':'家電已新增'):'家電已整理，關閉頁面後可能不會保留');
  });
  $('#font-toggle').addEventListener('click',()=>{prefs.font=(prefs.font+1)%3;applyPrefs();toast('已切換為'+['標準','大字','超大字'][prefs.font])});
  $('#contrast-toggle').addEventListener('click',()=>{prefs.contrast=!prefs.contrast;applyPrefs();toast(prefs.contrast?'已開啟高對比':'已恢復標準配色')});
  $('#speak-page').addEventListener('click',()=>{
    if(readingPage){stopSpeech();return;}
    if(playing){stopPlayer();render();}
    const clone=main.cloneNode(true);clone.querySelectorAll('button,nav,video,.player-controls,.scenario-banner').forEach(n=>n.remove());
    if(speak(clone.innerText||clone.textContent)){readingPage=true;$('#speak-page').textContent='停止朗讀';$('#speak-page').setAttribute('aria-pressed','true');}
  });
  $('#back').addEventListener('click',()=>{
    if(pageIndex>0){history.back();return;}
    const fallback={tutorial:validType(selectedType)?'learn?type='+selectedType:'learn',questions:'choose',result:'choose',feedback:activeLesson?lessonPath():'learn',complete:'learn',device:'my',edit:'my',booked:'requests',phone:'help',stores:'help',booking:'help',advisor:'staff',dashboard:'staff'};
    go(fallback[route]||'home',true);
  });
  window.addEventListener('popstate',()=>{pageIndex=history.state?.zhijiaIndex||0;activate()});
  window.addEventListener('hashchange',()=>activate());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){const wasPlaying=playing;stopPlayer();stopSpeech();stopCamera();if($('#camera-status')){$('#camera-status').textContent='相機已關閉，請按「使用相機拍照」重新開啟';$('[data-action="capture"]').disabled=true;}if(wasPlaying&&route==='tutorial')render();}});
  window.addEventListener('beforeunload',()=>{stopPlayer();stopCamera();stopSpeech();clearPhoto()});
  history.replaceState({zhijiaIndex:0},'',location.href);
  log('visit');activate(true);
})();
