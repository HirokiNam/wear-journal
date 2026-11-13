/* Wear Journal 2.0 — 静的な個人用着用記録。外部送信処理はありません。 */
(() => {
  'use strict';

  const STORAGE_KEY = 'wear-journal-data-v2';
  const LEGACY_KEY = 'shoe-journal-2026-v1';
  const BACKUP_META_KEY = 'wear-journal-last-export';
  const FORMAT = 'wear-journal-json';
  const CATEGORY = {
    shoes:   { label: '靴', icon: '👞' },
    jackets: { label: 'ジャケット・アウター', icon: '🧥' },
    pants:   { label: 'パンツ', icon: '👖' },
    tops:    { label: 'トップス', icon: '👕' },
    other:   { label: 'その他', icon: '🧣' }
  };
  const COLORS = ['#3b5b46','#82705e','#527184','#92885c','#646e7c','#8a6b79','#718474'];
  const $ = (id) => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const toDateString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localDate = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s === toDateString(localDate(s));
  const today = () => toDateString();
  const makeId = () => 'i-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));
  const emptyState = () => ({ schemaVersion: 2, trackingStart: today(), enabledCategories: ['shoes'], items: [], entries: {} });
  const escapeHtml = t => String(t).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  let state = emptyState();
  let selected = today();
  let displayedMonth = new Date().getFullYear() * 12 + new Date().getMonth();
  let selectedCategory = 'shoes';
  let itemFilter = 'shoes';
  let activeTab = 'calendar';
  let messageTimer;
  let noteTimer;
  let storageAvailable = true;
  let readOnly = false;

  function notify(message, isError = false, persistent = false) {
    const el = $('message');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.hidden = false;
    clearTimeout(messageTimer);
    if (!persistent) messageTimer = setTimeout(() => { el.hidden = true; }, 5200);
  }

  // 保持する形式は常に v2。キー名を変更せず、将来の移行関数でアップグレードする。
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 2) throw Error('未対応のバックアップ形式です');
    if (!validDate(raw.trackingStart) || !Array.isArray(raw.enabledCategories) || !Array.isArray(raw.items) || !raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) throw Error('保存データの形式が不正です');
    if (raw.items.length > 2000 || Object.keys(raw.entries).length > 30000) throw Error('データの件数が多すぎます');
    const enabledCategories = [...new Set(['shoes', ...raw.enabledCategories.filter(k => owns(CATEGORY,k))])];
    const seen = new Set();
    const items = raw.items.map((v, i) => {
      if (!v || typeof v.id !== 'string' || !v.id || v.id.length > 140 || seen.has(v.id) || typeof v.name !== 'string' || !v.name.trim() || !owns(CATEGORY,v.category)) throw Error('アイテムデータが不正です');
      seen.add(v.id);
      return {
        id: v.id, name: v.name.slice(0,100), category: v.category,
        active: v.active !== false,
        icon: typeof v.icon === 'string' && [...v.icon].length <= 4 ? v.icon : CATEGORY[v.category].icon,
        color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : COLORS[i % COLORS.length]
      };
    });
    const entries = {};
    for (const [date, v] of Object.entries(raw.entries)) {
      if (!validDate(date) || !v || !Array.isArray(v.items)) throw Error('日付の記録が不正です');
      const ids = [...new Set(v.items)];
      if (ids.length > 500 || ids.some(id => !seen.has(id))) throw Error('登録されていないアイテムを参照する記録があります');
      entries[date] = { items: ids, rest: Boolean(v.rest) && ids.length === 0, note: typeof v.note === 'string' ? v.note.slice(0,800) : '' };
    }
    return { schemaVersion: 2, trackingStart: raw.trackingStart, enabledCategories, items, entries };
  }

  // Shoe Journal v1 のローカルデータとJSONバックアップの両方に対応。
  function migrateV1(old) {
    if (!old || old.version !== 1 || !Array.isArray(old.shoes) || !old.entries || typeof old.entries !== 'object' || !validDate(old.startDate)) throw Error('旧形式の保存データが不正です');
    const transformed = {
      schemaVersion:2, trackingStart: old.startDate, enabledCategories:['shoes'],
      items: old.shoes.map(s => ({ id:s.id, name:s.name, category:'shoes', active:s.active, icon:s.icon, color:s.color })),
      entries: Object.fromEntries(Object.entries(old.entries).map(([day,v]) => [day, {items: v.shoes,rest:v.rest,note:v.note}]))
    };
    return normalize(transformed);
  }

  function readInitialState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== null) {
        try { state = normalize(JSON.parse(current)); }
        catch(e) { readOnly = true; notify('保存データを読み取れません。上書き事故を防ぐため操作を制限しました。既存のJSONバックアップから復元してください。', true, true); }
        return;
      }
      const old = localStorage.getItem(LEGACY_KEY);
      if (old !== null) {
        try {
          const migrated = migrateV1(JSON.parse(old));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          state = migrated;
          notify('以前のShoe Journalの記録を引き継ぎました。念のためJSONバックアップを保存してください。', false, true);
        } catch(e) {
          readOnly = true;
          notify('旧データを安全に移行できませんでした。元のデータは変更していません。バックアップを確認してください。',true,true);
        }
      } else {
        // 空の状態も保存し、ブラウザ保存が利用可能か検証する。
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      }
    } catch(e) {
      storageAvailable = false;
      notify('このブラウザでは永続保存が使えません。入力内容を残すにはJSONバックアップが必要です。',true,true);
    }
  }

  function persist(next) {
    if (readOnly) { notify('保存データを保護しています。まずJSONから復元してください。', true, true); return false; }
    try {
      const valid = normalize(next);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(valid));
      state = valid;
      storageAvailable = true;
      return true;
    } catch(e) {
      if (e instanceof DOMException || e?.name === 'SecurityError' || e?.name === 'QuotaExceededError') {
        storageAvailable = false;
        // 一時的に画面上では保持。閉じる前にJSONの書き出しが必要。
        state = normalize(next);
        notify('端末に保存できませんでした。画面を閉じる前にJSONを保存してください。',true,true);
      } else {
        notify('保存できませんでした：' + e.message,true,true);
      }
      return false;
    }
  }

  const findItem = id => state.items.find(it => it.id === id);
  const savedDays = () => Object.entries(state.entries);
  const countItem = id => savedDays().filter(([,entry]) => entry.items.includes(id)).length;
  const entryFor = date => state.entries[date] || {items:[],rest:false,note:''};
  const isRecorded = date => { const v=state.entries[date];return Boolean(v && (v.rest || v.items.length)); };
  const isMissing = date => date >= state.trackingStart && date <= today() && !isRecorded(date);
  const monthNumber = date => { const d = localDate(date);return d.getFullYear()*12 + d.getMonth(); };
  const addDays = (date,n) => { const d=localDate(date);d.setDate(d.getDate()+n);return toDateString(d); };

  function updateForDate(date, entry, render=true) {
    if (date > today() || readOnly) return;
    const updated = structuredClone(state);
    const items = [...new Set(entry.items || [])];
    const rest = !!entry.rest && items.length === 0;
    const note = String(entry.note || '').slice(0,800);
    if (!items.length && !rest && !note.trim()) delete updated.entries[date];
    else updated.entries[date] = {items,rest,note};
    persist(updated);
    if(render) redraw();
  }

  // 編集中のメモは日付移動の前に確定する。
  function flushNote() {
    if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
    if (activeTab !== 'calendar' || readOnly) return;
    const text = $('day-memo').value;
    const existing = entryFor(selected);
    if (text !== existing.note) updateForDate(selected, {...existing,note:text},false);
  }

  function setTab(tab) {
    if (tab !== activeTab) flushNote();
    activeTab=tab;
    document.querySelectorAll('.tab').forEach(el=>el.setAttribute('aria-selected', String(el.dataset.tab===tab)));
    document.querySelectorAll('.view').forEach(el=>{el.hidden=el.id!==`view-${tab}`;});
    redraw();
  }

  function renderNumbers() {
    $('total-wears').textContent=Object.values(state.entries).reduce((n,v)=>n+v.items.length,0);
    const monthStr = `${Math.floor(displayedMonth/12)}-${pad(displayedMonth%12+1)}`;
    $('logged-days').textContent=Object.entries(state.entries).filter(([date])=>date.startsWith(monthStr)&&isRecorded(date)).length;
    const max = new Date(Math.floor(displayedMonth/12),displayedMonth%12+1,0).getDate();
    let missing = 0;
    for(let i=1;i<=max;i++) if(isMissing(monthStr+'-'+pad(i))) missing++;
    $('missing-days').textContent=missing;
  }

  function renderCalendar() {
    renderNumbers();
    const y=Math.floor(displayedMonth/12),m=displayedMonth%12,first=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate();
    $('month-heading').textContent=`${y}年 ${m+1}月`;
    $('following-month').disabled=displayedMonth >= monthNumber(today());
    let markup = '<div class="day-blank" aria-hidden="true"></div>'.repeat(first);
    for(let i=1;i<=last;i++) {
      const date=`${y}-${pad(m+1)}-${pad(i)}`,entry=state.entries[date];
      const before=date<state.trackingStart, future=date>today(),missing=isMissing(date);
      const dots=entry?.items?.length ? entry.items.slice(0,3).map(id=>`<i class="indicator color-${Math.max(0,COLORS.indexOf(findItem(id)?.color))}"></i>`).join('')+(entry.items.length>3?'<span class="indicator-more">+</span>':'') : missing?'<i class="unlogged"></i>':'';
      const stateText=entry?.rest?'休':missing?'未記録':'&nbsp;';
      const label=`${m+1}月${i}日 ${entry?.rest?'お休み':entry?.items?.length ? entry.items.length+'点記録済み':missing?'未記録':''}`;
      markup+=`<button type="button" class="day ${selected===date?'selected':''} ${today()===date?'today':''} ${before?'older':''} ${future?'future':''}" data-date="${date}" aria-label="${escapeHtml(label)}" aria-pressed="${selected===date}" ${future?'disabled':''}>
        <span class="day-number">${i}</span><span class="indicators">${dots}</span><span class="day-status ${missing?'unrecorded':''}">${stateText}</span></button>`;
    }
    $('calendar-grid').innerHTML=markup;
    $('calendar-grid').querySelectorAll('[data-date]').forEach(el=>el.addEventListener('click',()=>{
      flushNote();selected=el.dataset.date;renderCalendar();renderEditor();
      if(matchMedia('(max-width:735px)').matches)requestAnimationFrame(()=>$('editor-panel').scrollIntoView({behavior:'smooth',block:'start'}));
    }));
  }

  function visibleCategoriesForDay() {
    const fromEntry = entryFor(selected).items.map(id=>findItem(id)?.category).filter(Boolean);
    return Object.keys(CATEGORY).filter(id=>state.enabledCategories.includes(id)||fromEntry.includes(id));
  }

  function renderCategoryPills(target, ids, selectedKey, callback) {
    target.innerHTML=ids.map(id=>`<button type="button" class="category-pill" data-cat="${id}" aria-pressed="${id===selectedKey}">${CATEGORY[id].label}</button>`).join('');
    target.querySelectorAll('[data-cat]').forEach(el=>el.addEventListener('click',()=>callback(el.dataset.cat)));
  }

  function renderEditor() {
    const d=localDate(selected),entry=entryFor(selected),future=selected>today();
    const cats=visibleCategoriesForDay();
    if(!cats.includes(selectedCategory)) selectedCategory=cats[0] || 'shoes';
    $('chosen-date').textContent=`${d.getMonth()+1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
    $('entry-state').textContent=future?'未来の日付は記録できません':entry.rest?'お休みの日として登録済み':entry.items.length?`${entry.items.length}点を記録済み`:selected<state.trackingStart?'記録開始日より前です（入力可能）':'未記録です。アイテムを選んでください。';
    $('category-tabs').hidden=cats.length<=1;
    if(cats.length>1) renderCategoryPills($('category-tabs'),cats,selectedCategory,category=>{flushNote();selectedCategory=category;renderEditor();});
    const items=state.items.filter(item=>item.category===selectedCategory&&(item.active||entry.items.includes(item.id)));
    $('item-buttons').innerHTML=items.length ? items.map(item=>{
      const chosen=entry.items.includes(item.id);
      return `<button type="button" class="item-choice ${chosen?'selected':''}" data-item-id="${escapeHtml(item.id)}" aria-pressed="${chosen}" ${future||readOnly?'disabled':''}>
        <span class="item-emoji" aria-hidden="true">${escapeHtml(item.icon)}</span><span class="item-label">${escapeHtml(item.name)}</span><span class="selected-marker" aria-hidden="true">${chosen?'●':'○'}</span></button>`;
    }).join('') : `<div class="empty-state">まだ${CATEGORY[selectedCategory].label}の登録がありません。<button type="button" class="inline-link" id="open-items">アイテムを追加する</button></div>`;
    $('item-buttons').querySelectorAll('[data-item-id]').forEach(el=>el.addEventListener('click',()=>{
      flushNote();
      const ids=new Set(entryFor(selected).items),id=el.dataset.itemId;
      ids.has(id)?ids.delete(id):ids.add(id);
      updateForDate(selected,{...entryFor(selected),items:[...ids],rest:false});
    }));
    $('open-items')?.addEventListener('click',()=>setTab('items'));
    $('no-wear-label').textContent = state.enabledCategories.length>1 ? '🏠　記録対象を使わなかった日' : '🏠　靴を履かなかった日';
    $('no-wear').disabled=future||readOnly;
    $('no-wear').classList.toggle('selected',entry.rest);
    $('no-wear-mark').textContent=entry.rest?'●':'○';
    $('day-memo').disabled=future||readOnly;
    $('day-memo').value=entry.note;
    $('clear-record').disabled=future||readOnly||!owns(state.entries,selected);
  }

  function renderItemList() {
    const cats=state.enabledCategories;
    if (!cats.includes(itemFilter)) itemFilter=cats[0] || 'shoes';
    $('item-filter').hidden=cats.length<=1;
    if(cats.length>1) renderCategoryPills($('item-filter'),cats,itemFilter,category=>{itemFilter=category;renderItemList();});
    const items=state.items.filter(it=>it.category===itemFilter).sort((a,b)=>Number(b.active)-Number(a.active));
    $('item-list').innerHTML=items.length?items.map(item=>{
      const wears=savedDays().filter(([,entry])=>entry.items.includes(item.id)).map(([d])=>d).sort();
      const last=wears[wears.length-1];
      return `<div class="item-row">
        <div class="item-badge">${escapeHtml(item.icon)}</div>
        <div class="item-text"><div class="item-title">${escapeHtml(item.name)}${item.active?'':'<span class="tag">引退</span>'}</div>
          <div class="item-description">${last?'最終着用 '+last:'記録なし'}</div>
          <div class="item-actions"><button type="button" data-rename="${escapeHtml(item.id)}">名前を変更</button><button type="button" data-archive="${escapeHtml(item.id)}">${item.active?'引退にする':'使用を再開'}</button></div>
        </div><div class="item-amount"><strong>${wears.length}</strong> 回</div>
      </div>`;
    }).join('') : '<div class="empty-state">まだ登録がありません。下のフォームで追加してください。</div>';
    $('item-list').querySelectorAll('[data-rename]').forEach(el=>el.addEventListener('click',()=>{
      const id=el.dataset.rename,item=findItem(id),name=prompt('新しいアイテム名',item.name);
      if(name===null)return;
      if(!name.trim())return notify('名前を入力してください',true);
      const next=structuredClone(state);
      next.items.find(it=>it.id===id).name=name.trim().slice(0,100);
      persist(next);redraw();
    }));
    $('item-list').querySelectorAll('[data-archive]').forEach(el=>el.addEventListener('click',()=>{
      const next=structuredClone(state);
      const item=next.items.find(it=>it.id===el.dataset.archive);
      item.active=!item.active;
      persist(next);redraw();
    }));
    $('item-category-wrapper').hidden=cats.length<=1;
    $('item-category').innerHTML=cats.map(id=>`<option value="${id}" ${id===itemFilter?'selected':''}>${CATEGORY[id].label}</option>`).join('');
  }

  function renderSettings() {
    $('start-date').value=state.trackingStart;
    $('categories-setting').innerHTML=Object.entries(CATEGORY).map(([id,v])=>`<label><input type="checkbox" data-enable="${id}" ${state.enabledCategories.includes(id)?'checked':''} ${id==='shoes'||readOnly?'disabled':''}>${v.label}</label>`).join('');
    $('categories-setting').querySelectorAll('[data-enable]').forEach(el=>el.addEventListener('change',()=>{
      const next=structuredClone(state);
      if(el.checked) next.enabledCategories.push(el.dataset.enable);
      else next.enabledCategories=next.enabledCategories.filter(id=>id!==el.dataset.enable);
      persist(next);renderSettings();notify('カテゴリー設定を保存しました');
    }));
    let backupDate;
    try{backupDate=localStorage.getItem(BACKUP_META_KEY)}catch(e){}
    $('backup-date').textContent=backupDate?`最後に書き出し操作をした日：${backupDate.slice(0,10)}（実際の保存先も確認してください）`:'まだバックアップを書き出していません。月に1回程度、iCloud Driveに保存しましょう。';
  }

  function redraw() {
    if(activeTab==='calendar'){renderCalendar();renderEditor();}
    else if(activeTab==='items')renderItemList();
    else renderSettings();
  }

  function buildBackup() {
    return JSON.stringify({format:FORMAT,backupVersion:1,exportedAt:new Date().toISOString(),data:state},null,2);
  }
  function downloadText(content, name, mime) {
    const url=URL.createObjectURL(new Blob([content],{type:mime}));
    const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),20000);
  }
  function afterExport() {
    try{localStorage.setItem(BACKUP_META_KEY,new Date().toISOString())}catch(e){}
    if(activeTab==='settings')renderSettings();
  }
  function backupName(){return `wear-journal-backup-${today()}.json`;}
  function exportJson() {
    downloadText(buildBackup(),backupName(),'application/json;charset=utf-8');afterExport();
    notify('JSONのダウンロードを開始しました。iCloud Driveに保存されたことを確認してください。');
  }
  async function shareJson() {
    const blob=new File([buildBackup()],backupName(),{type:'application/json'});
    if(navigator.canShare?.({files:[blob]}) && navigator.share) {
      try {await navigator.share({files:[blob],title:'Wear Journal バックアップ'});afterExport();notify('共有画面を閉じました。保存先にファイルがあるか確認してください。');}
      catch(e){if(e.name!=='AbortError')notify('共有できませんでした。「JSONを書き出す」をお試しください。',true);}
    } else exportJson();
  }
  const csv = value => '"'+String(value ?? '').replace(/"/g,'""')+'"';
  function exportCsv() {
    const rows=[['日付','カテゴリー','アイテム名','状態','メモ']];
    for(const [date,entry] of savedDays().sort(([a],[b])=>a.localeCompare(b))) {
      if(entry.items.length) for(const id of entry.items) {
        const item=findItem(id);rows.push([date,CATEGORY[item.category].label,item.name,'着用',entry.note]);
      } else rows.push([date,'','',entry.rest?'休み':'メモのみ',entry.note]);
    }
    downloadText('\ufeff'+rows.map(row=>row.map(csv).join(',')).join('\r\n'),`wear-journal-${today()}.csv`,'text/csv;charset=utf-8');
    notify('CSVのダウンロードを開始しました。');
  }
  function convertImport(raw) {
    if(raw?.format===FORMAT && raw?.data) return normalize(raw.data);
    if(raw?.schemaVersion===2) return normalize(raw);
    if(raw?.version===1) return migrateV1(raw);
    throw Error('このJSONはWear Journalのバックアップではありません');
  }
  async function importJson(file) {
    if (!file)return;
    try {
      if(file.size>12*1024*1024)throw Error('ファイルが大きすぎます');
      const imported=convertImport(JSON.parse(await file.text()));
      const count=Object.values(imported.entries).filter(v=>v.items.length||v.rest).length;
      const currentCount=Object.values(state.entries).filter(v=>v.items.length||v.rest).length;
      const ok=confirm(`このバックアップを復元しますか？\n\n読み込む：${imported.items.length}点・${count}日\n現在：${state.items.length}点・${currentCount}日\n\n現在のデータは上書きされます。先に現在のJSONを別途保存しましたか？`);
      if(!ok)return;
      // 元のデータが破損して readOnly だったケースのみ復元で復旧させる。
      const serialized=JSON.stringify(imported);
      localStorage.setItem(STORAGE_KEY,serialized);
      state=imported;readOnly=false;storageAvailable=true;
      selected=today();displayedMonth=monthNumber(selected);selectedCategory='shoes';itemFilter='shoes';
      setTab('calendar');notify('復元しました。登録内容が正しいかカレンダーで確認してください。');
    } catch(e) {notify('復元できませんでした：'+e.message,true,true);}
    finally {$('restore-file').value='';}
  }

  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.tab)));
  $('previous-month').addEventListener('click',()=>changeMonth(-1));
  $('following-month').addEventListener('click',()=>changeMonth(1));
  function changeMonth(offset) {
    flushNote();
    displayedMonth=Math.min(monthNumber(today()),displayedMonth+offset);
    const y=Math.floor(displayedMonth/12),m=displayedMonth%12,d=Math.min(localDate(selected).getDate(),new Date(y,m+1,0).getDate());
    selected=toDateString(new Date(y,m,d));if(selected>today())selected=today();redraw();
  }
  $('jump-today').addEventListener('click',()=>{flushNote();selected=today();displayedMonth=monthNumber(selected);redraw();});
  $('previous-unlogged').addEventListener('click',()=>{
    flushNote();let date=selected;
    for(let i=0;i<36525;i++) {
      date=addDays(date,-1);
      if(date<state.trackingStart) {notify('これより前に未記録日はありません');return;}
      if(isMissing(date)) {selected=date;displayedMonth=monthNumber(selected);redraw();return;}
    }
    notify('未記録日はありません');
  });
  $('no-wear').addEventListener('click',()=>{
    flushNote();const existing=entryFor(selected);
    if(existing.items.length && !confirm('この日の着用記録をすべて外して「休み」にしますか？'))return;
    updateForDate(selected,{items:[],rest:!existing.rest,note:existing.note});
  });
  $('clear-record').addEventListener('click',()=>{
    if(!owns(state.entries,selected)||!confirm(`${selected} の記録を削除しますか？`))return;
    const next=structuredClone(state);delete next.entries[selected];persist(next);redraw();
  });
  $('day-memo').addEventListener('input',()=>{
    if(noteTimer)clearTimeout(noteTimer);
    const day=selected,value=$('day-memo').value;
    noteTimer=setTimeout(()=>{noteTimer=null;if(value!==entryFor(day).note)updateForDate(day,{...entryFor(day),note:value},false);},500);
  });
  $('day-memo').addEventListener('change',flushNote);
  $('item-form').addEventListener('submit',e=>{
    e.preventDefault();
    const name=$('item-name').value.trim();
    if(!name)return;
    const category=state.enabledCategories.length>1 ? $('item-category').value:itemFilter;
    if(!owns(CATEGORY,category))return notify('カテゴリーを確認してください',true);
    const next=structuredClone(state);
    const count=next.items.length;
    next.items.push({id:makeId(),name:name.slice(0,100),category,active:true,icon:CATEGORY[category].icon,color:COLORS[count%COLORS.length]});
    if(persist(next)) { $('item-name').value=''; itemFilter=category;redraw();notify('アイテムを登録しました'); }
  });
  $('backup-json').addEventListener('click',exportJson);
  $('share-json').addEventListener('click',shareJson);
  $('backup-csv').addEventListener('click',exportCsv);
  $('restore-file').addEventListener('change',e=>importJson(e.target.files[0]));
  $('update-start').addEventListener('click',()=>{
    const value=$('start-date').value;
    if(!validDate(value)||value>today())return notify('今日以前の有効な日付を選んでください',true);
    const next=structuredClone(state);next.trackingStart=value;
    if(persist(next)){redraw();notify('記録開始日を変更しました');}
  });

  readInitialState();redraw();
})();
