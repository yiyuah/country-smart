'use strict';
// Speech events are the clock: no timer estimates the position of spoken text.
(() => {
  const byId = id => document.getElementById(id);
  let epoch = 0, current = null, state = 'idle', queue = [], position = 0, done = null;
  let fallbackElement = null, activeRange = null;
  const supported = () => !!window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
  const customHighlight = () => !!window.CSS?.highlights && typeof window.Highlight === 'function';
  const status = text => { if(byId('speech-status').textContent !== text) byId('speech-status').textContent = text; };
  function clearHighlight() {
    if (window.CSS?.highlights) CSS.highlights.delete('reading');
    fallbackElement?.classList.remove('reading-block');
    fallbackElement = null; activeRange = null;
  }
  function controls() {
    byId('speak-page').textContent = state === 'idle' ? '朗讀本頁' : '停止朗讀';
    byId('speak-page').setAttribute('aria-pressed', String(state !== 'idle'));
    byId('speech-controls').hidden = state === 'idle';
    byId('speech-pause').textContent = state === 'paused' ? '繼續朗讀' : '暫停朗讀';
    byId('speech-pause').setAttribute('aria-pressed',String(state === 'paused'));
  }
  function stop() {
    epoch++; current = null; queue = []; done = null; state = 'idle';
    window.speechSynthesis?.cancel(); clearHighlight(); controls(); status('');
  }
  // Text offsets remain UTF-16, matching SpeechSynthesisEvent.charIndex and Range.
  function collect(root) {
    const groups = new Map();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!node.textContent.trim() || !parent || parent.closest('button,a,nav,script,style,video,summary,[hidden],[aria-hidden="true"],.scenario-banner,.speech-panel')) continue;
      const details = parent.closest('details');
      if (details && !details.open) continue;
      if (!parent.getClientRects().length || getComputedStyle(parent).visibility === 'hidden') continue;
      const block = parent.closest('h1,h2,h3,p,li,dt,dd');
      if (!block || !root.contains(block)) continue;
      if (!groups.has(block)) groups.set(block,{element:block,text:'',nodes:[]});
      const group = groups.get(block);
      group.nodes.push({node,start:group.text.length,end:group.text.length + node.length});
      group.text += node.textContent;
    }
    const chunks = [];
    const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-TW',{granularity:'sentence'}) : null;
    for (const group of groups.values()) {
      const segments = segmenter ? [...segmenter.segment(group.text)].map(s=>({text:s.segment,start:s.index})) : [...group.text.matchAll(/[^。！？!?\n]+[。！？!?\n]*/gu)].map(m=>({text:m[0],start:m.index}));
      for (const segment of segments) if (segment.text.trim()) chunks.push({...group,text:segment.text,offset:segment.start});
    }
    return chunks;
  }
  function point(chunk,index,end) {
    const absolute = chunk.offset + index;
    const entry = chunk.nodes.find(n=>absolute >= n.start && (end ? absolute <= n.end : absolute < n.end)) || chunk.nodes.at(-1);
    return [entry.node,Math.max(0,Math.min(entry.node.length,absolute-entry.start))];
  }
  function paint(chunk,start=0,end=chunk.text.length) {
    clearHighlight();
    if (!chunk.element?.isConnected) return;
    if (!customHighlight()) { fallbackElement=chunk.element;fallbackElement.classList.add('reading-block');return; }
    const range=document.createRange();range.setStart(...point(chunk,start,false));range.setEnd(...point(chunk,end,true));
    activeRange=range; CSS.highlights.set('reading',new Highlight(range));
  }
  function boundaryRange(text,index,length,name) {
    if (name === 'sentence') return [0,text.length];
    const graphemes = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh-TW',{granularity:'grapheme'}).segment(text)].map(s=>s.index) : (()=>{let n=0;return [...text].map(c=>{const i=n;n+=c.length;return i;});})();
    const start = graphemes.filter(i=>i<=index).at(-1) ?? 0;
    // charLength=0 is not a claim of character precision: retain sentence highlighting.
    if (!Number.isInteger(length) || length <= 0) return [0,text.length];
    const target=Math.min(text.length,index+length),end=graphemes.find(i=>i>=target) ?? text.length;
    return [start,end];
  }
  function next(token) {
    if(token!==epoch)return;
    if(position>=queue.length){const callback=done;done=null;current=null;state='idle';clearHighlight();controls();status('朗讀結束');callback?.();return;}
    const chunk=queue[position],speech=new SpeechSynthesisUtterance(chunk.text);
    current=speech;speech.lang='zh-TW';speech.rate=byId('speech-rate').value==='slow'?.72:.9;
    const voices=speechSynthesis.getVoices?.()||[];
    speech.voice=voices.find(v=>/zh[-_]TW/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang))||null;
    speech.onstart=()=>{if(token!==epoch||current!==speech)return;paint(chunk);status(customHighlight()?'跟著語音閱讀；精度依語音引擎提供':'跟著語音閱讀；目前以段落提示');};
    speech.onboundary=event=>{
      if(token!==epoch||current!==speech||state==='paused'||!Number.isInteger(event.charIndex)||event.charIndex<0||event.charIndex>=chunk.text.length)return;
      const [start,end]=boundaryRange(chunk.text,event.charIndex,event.charLength,event.name);
      paint(chunk,start,end);
      status(!customHighlight()?'目前以段落提示':end-start<chunk.text.length?'正在朗讀標示的字詞':'目前以句子提示');
    };
    speech.onend=()=>{if(token!==epoch||current!==speech)return;position++;next(token);};
    speech.onerror=event=>{if(token!==epoch||current!==speech)return;const callback=done;stop();if(!['interrupted','canceled'].includes(event.error))status('語音暫時無法播放，請繼續閱讀文字');callback?.();};
    try { speechSynthesis.speak(speech); } catch { const callback=done;stop();status('暫時無法朗讀，請繼續閱讀文字');callback?.(); }
  }
  function start(root,onDone) {
    stop();
    if(!supported()){status('此瀏覽器不支援文字朗讀，您仍可閱讀文字');document.dispatchEvent(new CustomEvent('reader-unavailable'));onDone?.();return false;}
    queue=collect(root);done=onDone;
    if(!queue.length){status('這裡沒有需要朗讀的文字');onDone?.();return false;}
    state='reading';position=0;controls();next(epoch);return true;
  }
  byId('speech-pause').addEventListener('click',()=>{
    if(state==='idle')return;
    if(state==='paused'){state='reading';speechSynthesis.resume();status('已繼續朗讀');}
    else {state='paused';speechSynthesis.pause();status('已暫停，可繼續或停止朗讀');}
    controls();
  });
  byId('speech-stop').addEventListener('click',stop);
  window.ZhijiaReader={start,stop,get state(){return state;},collect,boundaryRange};
})();
