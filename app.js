/* Wear Journal v3.2 — local-first clothing journal. No data is uploaded. */
(() => {
  'use strict';

  const STORAGE_KEY = 'wear-journal-data-v3';
  const V2_KEY = 'wear-journal-data-v2';
  const PHOTO = window.WearJournalPhotos;
  const ARCHIVE = window.WearJournalArchive;
  const LEGACY_KEY = 'shoe-journal-2026-v1';
  const BACKUP_META_KEY = 'wear-journal-last-export';
  const FORMAT = 'wear-journal-json';
  const CATEGORY = {
    shoes:   { label: '靴', icon: '👞' },
    jackets: { label: 'ジャケット・アウター', icon: '🧥' },
    pants:   { label: 'ボトムス', icon: '👖' },
    dresses: { label: 'ワンピース', icon: '👗' },
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
  const emptyState = () => ({ schemaVersion: 3, trackingStart: today(), enabledCategories: ['shoes'], items: [], entries: {} });
  const escapeHtml = t => String(t).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const owns = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  let state = emptyState();
  let selected = today();
  let displayedMonth = new Date().getFullYear() * 12 + new Date().getMonth();
  let selectedCategory = 'shoes';
  let editorOptionsDate = null;
  let editorOptionsOpen = false;
  let itemFilter = 'shoes';
  let activeTab = 'calendar';
  let messageTimer;
  let noteTimer;
  let storageAvailable = true;
  let readOnly = false;
  let photoInputFor = null;
  let imageBusy = false;
  const randomPhotoId = () => 'p-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

  function notify(message, isError = false, persistent = false) {
    const el = $('message');
    el.textContent = message;
    el.classList.toggle('error', isError);
    el.hidden = false;
    clearTimeout(messageTimer);
    if (!persistent) messageTimer = setTimeout(() => { el.hidden = true; }, 5200);
  }

  // v3形式で保存。v2のキーは移行後もそのまま残して保護する。
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 3) throw Error('未対応のバックアップ形式です');
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
        color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : COLORS[i % COLORS.length],
        imageId: typeof v.imageId === 'string' && /^p-[A-Za-z0-9-]{8,100}$/.test(v.imageId) ? v.imageId : null
      };
    });
    const entries = {};
    for (const [date, v] of Object.entries(raw.entries)) {
      if (!validDate(date) || !v || !Array.isArray(v.items)) throw Error('日付の記録が不正です');
      const ids = [...new Set(v.items)];
      if (ids.length > 500 || ids.some(id => !seen.has(id))) throw Error('登録されていないアイテムを参照する記録があります');
      entries[date] = { items: ids, rest: Boolean(v.rest) && ids.length === 0, note: typeof v.note === 'string' ? v.note.slice(0,800) : '' };
    }
    return { schemaVersion: 3, trackingStart: raw.trackingStart, enabledCategories, items, entries };
  }

  function migrateV2(old) {
    if (!old || old.schemaVersion !== 2) throw Error('v2形式の保存データが不正です');
    return normalize({ ...old, schemaVersion: 3, items: old.items?.map(item => ({...item, imageId:null})) });
  }

  // Shoe Journal v1 のローカルデータとJSONバックアップの両方に対応。
  function migrateV1(old) {
    if (!old || old.version !== 1 || !Array.isArray(old.shoes) || !old.entries || typeof old.entries !== 'object' || !validDate(old.startDate)) throw Error('旧形式の保存データが不正です');
    const transformed = {
      schemaVersion:2, trackingStart: old.startDate, enabledCategories:['shoes'],
      items: old.shoes.map(s => ({ id:s.id, name:s.name, category:'shoes', active:s.active, icon:s.icon, color:s.color })),
      entries: Object.fromEntries(Object.entries(old.entries).map(([day,v]) => [day, {items: v.shoes,rest:v.rest,note:v.note}]))
    };
    return migrateV2(transformed);
  }

  function readInitialState() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current !== null) {
        try { state = normalize(JSON.parse(current)); }
        catch(e) { readOnly = true; notify('保存データを安全に読み取れません。上書きを防ぐため編集を停止しました。バックアップから復元してください。',true,true); }
        return;
      }
      // Migrate in ascending order; never delete/overwrite the old source key.
      const v2 = localStorage.getItem(V2_KEY);
      const v1 = v2 === null ? localStorage.getItem(LEGACY_KEY) : null;
      if (v2 !== null || v1 !== null) {
        try {
          const migrated = v2 !== null ? migrateV2(JSON.parse(v2)) : migrateV1(JSON.parse(v1));
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          state = migrated;
          notify('以前の記録をv3へ引き継ぎました。ZIPバックアップをiCloud Driveに保存してください。',false,true);
        } catch(e) {
          readOnly = true;
          notify('旧データを移行できませんでした。古い保存データは変更していません。復元用のJSONを確認してください。',true,true);
        }
      } else {
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      }
    } catch(e) {
      storageAvailable=false;readOnly=true;
      notify('この端末で保存領域を使えません。記録を保護するため編集を停止しました。',true,true);
    }
  }

  function persist(next) {
    if (readOnly) { notify('保存データを保護しています。先にバックアップを確認してください。',true,true); return false; }
    try {
      const valid=normalize(next);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(valid));
      state=valid;storageAvailable=true;
      return true;
    } catch(e) {
      storageAvailable=false;
      notify('保存できませんでした。端末の空き容量とブラウザの保存設定を確認してください：'+e.message,true,true);
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

  async function hydrateImages(root = document) {
    const slots=[...root.querySelectorAll('.photo-slot[data-image-id]')];
    for(const slot of slots) {
      const imageId=slot.dataset.imageId;
      if(!imageId || slot.dataset.loaded===imageId)continue;
      try {
        const url=await PHOTO.urlFor(imageId);
        if(!url || !slot.isConnected || slot.dataset.imageId!==imageId)continue;
        const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';
        img.className='item-photo';
        slot.replaceChildren(img);slot.dataset.loaded=imageId;
        slot.classList.add('has-photo');
      } catch(e) { /* A missing photo must never interfere with wear logs. */ }
    }
  }

  // View only: the day's cards reuse the existing item ID / image ID.
  // No new persisted fields or image copies are created.
  function renderDayLook(entry) {
    const target=$('day-look');
    const worn=entry.items.map(id=>findItem(id)).filter(Boolean);
    const order={jackets:0,tops:1,dresses:2,pants:3,shoes:4,other:5};
    worn.sort((a,b)=>(order[a.category]??99)-(order[b.category]??99));
    if(worn.length){
      target.innerHTML=`<div class="look-head"><div class="overline">TODAY'S LOOK</div><span class="look-count">${worn.length}点</span></div>
        <div class="look-grid">${worn.map(item=>`<div class="look-card" title="${escapeHtml(item.name)}">
          <div class="look-photo photo-slot" data-image-id="${escapeHtml(item.imageId||'')}" aria-hidden="true">${escapeHtml(item.icon)}</div>
          <div class="look-caption"><span class="look-category">${escapeHtml(CATEGORY[item.category].label)}</span><span class="look-name">${escapeHtml(item.name)}</span></div>
        </div>`).join('')}</div>`;
      hydrateImages(target);
    } else {
      target.innerHTML=entry.rest?'<div class="look-empty look-rest">🏠　記録対象を使わなかった日</div>':
        '<div class="look-empty">まだ着用アイテムは選ばれていません。下から登録できます。</div>';
    }
  }

  function renderEditor() {
    const d=localDate(selected),entry=entryFor(selected),future=selected>today();
    const cats=visibleCategoriesForDay();
    if(!cats.includes(selectedCategory)) selectedCategory=cats[0] || 'shoes';
    $('chosen-date').textContent=`${d.getMonth()+1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）`;
    $('entry-state').textContent=future?'未来の日付は記録できません':entry.rest?'お休みの日として登録済み':entry.items.length?`${entry.items.length}点を記録済み`:selected<state.trackingStart?'記録開始日より前です（入力可能）':'未記録です。アイテムを選んでください。';
    renderDayLook(entry);
    if(editorOptionsDate!==selected){
      editorOptionsDate=selected;
      editorOptionsOpen=!entry.items.length&&!entry.rest;
    }
    $('day-choices').open=editorOptionsOpen;
    $('day-choices-title').textContent=entry.items.length||entry.rest?'着用アイテムを追加・変更':'アイテムを選ぶ';
    $('category-tabs').hidden=cats.length<=1;
    if(cats.length>1) renderCategoryPills($('category-tabs'),cats,selectedCategory,category=>{flushNote();selectedCategory=category;renderEditor();});
    const items=state.items.filter(item=>item.category===selectedCategory&&(item.active||entry.items.includes(item.id)));
    $('item-buttons').innerHTML=items.length ? items.map(item=>{
      const chosen=entry.items.includes(item.id);
      return `<button type="button" class="item-choice ${chosen?'selected':''}" data-item-id="${escapeHtml(item.id)}" aria-pressed="${chosen}" ${future||readOnly?'disabled':''}>
        <span class="item-emoji photo-slot" data-image-id="${escapeHtml(item.imageId||'')}" aria-hidden="true">${escapeHtml(item.icon)}</span><span class="item-label">${escapeHtml(item.name)}</span><span class="selected-marker" aria-hidden="true">${chosen?'●':'○'}</span></button>`;
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
    hydrateImages($('item-buttons'));
    $('clear-record').disabled=future||readOnly||!owns(state.entries,selected);
  }

  // Items marked inactive are excluded from the everyday inventory and new-day choices,
  // but retain their stable item IDs, images, wear counts and historical outfit cards.
  function itemRowMarkup(item, retired = false) {
    const wears=savedDays().filter(([,entry])=>entry.items.includes(item.id)).map(([d])=>d).sort();
    const last=wears[wears.length-1];
    return `<div class="item-row ${retired?'retired-row':''}">
      <div class="item-badge photo-slot" data-image-id="${escapeHtml(item.imageId||'')}">${escapeHtml(item.icon)}</div>
      <div class="item-text">
        <div class="item-title">${escapeHtml(item.name)}${retired?'<span class="tag">引退済み</span>':''}</div>
        ${retired?`<div class="item-kind">${escapeHtml(CATEGORY[item.category].label)}</div>`:''}
        <div class="item-description">${last?'最終着用 '+last:'着用記録なし'}</div>
        <div class="item-actions">
          <button type="button" data-photo="${escapeHtml(item.id)}">${item.imageId?'写真を変更':'写真を登録'}</button>
          ${item.imageId?`<button type="button" data-remove-photo="${escapeHtml(item.id)}">写真を外す</button>`:''}
          <button type="button" data-rename="${escapeHtml(item.id)}">名前を変更</button>
          <button type="button" data-archive="${escapeHtml(item.id)}">${retired?'使用を再開':'引退する'}</button>
          <button type="button" class="delete-item" data-delete="${escapeHtml(item.id)}">削除</button>
        </div>
      </div><div class="item-amount"><strong>${wears.length}</strong> 回</div>
    </div>`;
  }

  // Deleting is intentionally explicit and irreversible without a ZIP backup.
  // Retire instead whenever the owner wishes to keep the item's wear history.
  function deleteItem(id) {
    if(readOnly || imageBusy)return;
    const item=findItem(id);
    if(!item)return;
    const wornDates=Object.entries(state.entries).filter(([,entry])=>entry.items.includes(id));
    if(wornDates.length) {
      const agreed=prompt(`「${item.name}」は ${wornDates.length}日分の着用履歴があります。\n\n削除するとアイテム本体・写真・これらの日付の着用記録からこのアイテムが完全に消えます。引退なら履歴が残ります。\n\n削除を実行する場合は、アイテム名を正確に入力してください。`, '');
      if(agreed===null)return;
      if(agreed!==item.name)return notify('名前が一致しなかったため、削除しませんでした。',true);
      if(!confirm(`${wornDates.length}日分の履歴から「${item.name}」を削除します。最新のZIPバックアップを保存しましたか？\nこの操作は取り消せません。`))return;
    } else if(!confirm(`「${item.name}」を完全に削除しますか？\n写真も削除されます。この操作は取り消せません。`))return;
    const next=structuredClone(state);
    next.items=next.items.filter(it=>it.id!==id);
    for(const [date,entry] of Object.entries(next.entries)) {
      if(!entry.items.includes(id))continue;
      entry.items=entry.items.filter(other=>other!==id);
      if(!entry.items.length && !entry.rest && !entry.note.trim()) delete next.entries[date];
    }
    if(!persist(next))return;
    const photoId=item.imageId;
    redraw();
    notify(wornDates.length?`「${item.name}」を削除し、${wornDates.length}日分の記録から除外しました。`:`「${item.name}」を削除しました。`);
    if(photoId && !state.items.some(other=>other.imageId===photoId)) {
      PHOTO.remove(photoId).catch(()=>notify('アイテムは削除されましたが、写真データの後片付けに失敗しました。',true));
    }
  }

  function bindItemActions(root) {
    root.querySelectorAll('[data-photo]').forEach(el=>el.addEventListener('click',()=>{
      if(readOnly || imageBusy) return;
      photoInputFor=el.dataset.photo;
      $('photo-file').value='';
      $('photo-file').click();
    }));
    root.querySelectorAll('[data-remove-photo]').forEach(el=>el.addEventListener('click',async()=>{
      if (readOnly || imageBusy || !confirm('このアイテムの写真を外しますか？着用履歴は残ります。')) return;
      const id=el.dataset.removePhoto,item=findItem(id);
      if(!item?.imageId)return;
      const next=structuredClone(state),oldId=item.imageId;
      next.items.find(it=>it.id===id).imageId=null;
      if(persist(next)){
        redraw();notify('写真を外しました。着用履歴はそのままです。');
        if(!state.items.some(other=>other.imageId===oldId))await PHOTO.remove(oldId).catch(()=>{});
      }
    }));
    root.querySelectorAll('[data-rename]').forEach(el=>el.addEventListener('click',()=>{
      if(readOnly)return;
      const id=el.dataset.rename,item=findItem(id),name=prompt('新しいアイテム名',item?.name||'');
      if(name===null)return;
      if(!name.trim())return notify('名前を入力してください',true);
      const next=structuredClone(state);
      const target=next.items.find(it=>it.id===id);
      if(!target)return;
      target.name=name.trim().slice(0,100);
      if(persist(next))redraw();
    }));
    root.querySelectorAll('[data-archive]').forEach(el=>el.addEventListener('click',()=>{
      if(readOnly)return;
      const id=el.dataset.archive,original=findItem(id);
      if(!original)return;
      if(original.active && !confirm(`「${original.name}」を引退（アーカイブ）しますか？\n通常のアイテム一覧・新しい着用候補から隠します。過去の着用履歴と写真は残り、「引退したアイテム」から再開できます。`))return;
      const next=structuredClone(state);
      const item=next.items.find(it=>it.id===id);
      item.active=!item.active;
      if(item.active){
        if(!next.enabledCategories.includes(item.category))next.enabledCategories.push(item.category);
        itemFilter=item.category;
      }
      if(persist(next)){
        redraw();
        notify(item.active?'使用を再開しました。':'アーカイブしました。過去の着用履歴は残っています。');
      }
    }));
    root.querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',()=>deleteItem(el.dataset.delete)));
  }

  function renderItemList() {
    const cats=state.enabledCategories;
    if (!cats.includes(itemFilter)) itemFilter=cats[0] || 'shoes';
    $('item-filter').hidden=cats.length<=1;
    if(cats.length>1) renderCategoryPills($('item-filter'),cats,itemFilter,category=>{itemFilter=category;renderItemList();});
    const items=state.items.filter(it=>it.active && it.category===itemFilter);
    $('item-list').innerHTML=items.length?items.map(it=>itemRowMarkup(it)).join(''):
      `<div class="empty-state">現在使用中の${CATEGORY[itemFilter].label}はありません。下のフォームから追加できます。</div>`;
    const retired=state.items.filter(it=>!it.active);
    $('retired-count').textContent=`${retired.length}点`;
    $('retired-items').hidden=retired.length===0;
    if(!retired.length)$('retired-items').open=false;
    $('retired-list').innerHTML=retired.map(it=>itemRowMarkup(it,true)).join('');
    hydrateImages($('item-list'));
    hydrateImages($('retired-list'));
    bindItemActions($('item-list'));
    bindItemActions($('retired-list'));
    $('item-category-wrapper').hidden=cats.length<=1;
    $('item-category').innerHTML=cats.map(id=>`<option value="${id}" ${id===itemFilter?'selected':''}>${CATEGORY[id].label}</option>`).join('');
  }

  async function attachPhoto(file) {
    if(!file || !photoInputFor || readOnly || imageBusy)return;
    const itemId=photoInputFor;
    if(!findItem(itemId))return;
    imageBusy=true;
    notify('写真を縮小・保存しています…',false,true);
    const newId=randomPhotoId();
    try {
      const blob=await PHOTO.compress(file);
      await PHOTO.put(newId,blob);
      const current=findItem(itemId);
      const oldId=current.imageId;
      const next=structuredClone(state);
      next.items.find(it=>it.id===itemId).imageId=newId;
      if(!persist(next))throw Error('写真の参照先を保存できませんでした');
      redraw();
      notify(`写真を保存しました（${Math.round(blob.size/1024)}KB）。ZIPバックアップも更新してください。`);
      if(oldId) await PHOTO.remove(oldId).catch(()=>{});
    } catch(e) {
      await PHOTO.remove(newId).catch(()=>{});
      notify('写真を保存できませんでした：'+e.message,true,true);
    } finally { imageBusy=false;photoInputFor=null;$('photo-file').value=''; }
  }

  function renderSummary() {
    const monthStr=`${Math.floor(displayedMonth/12)}-${pad(displayedMonth%12+1)}`;
    $('summary-month').textContent=`${Math.floor(displayedMonth/12)}年 ${displayedMonth%12+1}月`;
    $('summary-next').disabled=displayedMonth>=monthNumber(today());
    const byCat={};
    const relevant=Object.entries(state.entries).filter(([day])=>day.startsWith(monthStr));
    const logged=relevant.filter(([,entry])=>entry.items.length>0||entry.rest).length;
    $('summary-days').textContent=`${logged}日 記録済み`;
    for(const [,entry] of relevant){
      for(const id of entry.items){
        const item=findItem(id); if(!item)continue;
        if(!byCat[item.category])byCat[item.category]={};
        byCat[item.category][id]=(byCat[item.category][id]||0)+1;
      }
    }
    const cats=Object.keys(CATEGORY).filter(k=>state.enabledCategories.includes(k)||byCat[k]);
    $('summary-content').innerHTML=cats.map(cat=>{
      const counts=Object.entries(byCat[cat]||{}).sort((a,b)=>b[1]-a[1]);
      const total=counts.reduce((n, row)=>n+row[1],0);
      const lines=counts.length?counts.map(([id,count],i)=>{
        const item=findItem(id);
        return `<div class="summary-item"><span class="summary-place">${i+1}</span><div class="summary-photo photo-slot" data-image-id="${escapeHtml(item.imageId||'')}">${escapeHtml(item.icon)}</div><div class="summary-name">${escapeHtml(item.name)}</div><strong>${count}回</strong></div>`;
      }).join(''):'<p class="muted">この月はまだ着用記録がありません。</p>';
      return `<section class="summary-section"><div class="summary-section-head"><h3>${escapeHtml(CATEGORY[cat].label)}</h3><span>${total}回</span></div>${lines}</section>`;
    }).join('');
    hydrateImages($('summary-content'));
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
    else if(activeTab==='summary')renderSummary();
    else renderSettings();
  }

  function buildJsonBackup() {
    // Text-only fallback for compatibility and troubleshooting. It does NOT contain images.
    const textState=structuredClone(state);
    textState.items.forEach(item=>{item.imageId=null;});
    return JSON.stringify({format:FORMAT,backupVersion:2,exportedAt:new Date().toISOString(),includesImages:false,data:textState},null,2);
  }
  function downloadBlob(blob, name) {
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=name;
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function downloadText(content,name,mime) {downloadBlob(new Blob([content],{type:mime}),name);}
  function afterExport() {
    try { localStorage.setItem(BACKUP_META_KEY,new Date().toISOString()); } catch(e){}
    if(activeTab==='settings')renderSettings();
  }
  const backupZipName=()=>`wear-journal-full-${today()}.zip`;
  const backupJsonName=()=>`wear-journal-text-only-${today()}.json`;

  async function makeFullBackup() {
    const files=[];
    const photoEntries=[];
    const uniqueIds=[...new Set(state.items.map(it=>it.imageId).filter(Boolean))];
    if(uniqueIds.length>600)throw Error('写真が多すぎます（最大600枚）');
    let total=0;
    for(const imageId of uniqueIds){
      const photo=await PHOTO.get(imageId);
      if(!photo || !(photo.blob instanceof Blob))throw Error('写真が見つかりません：'+imageId+'。画像を再登録するか、JSONのみで記録をバックアップしてください');
      const path=`images/${imageId}.jpg`;
      total+=photo.blob.size;
      if(total>90*1024*1024)throw Error('写真が90MBを超えました。バックアップを分割できません');
      files.push({name:path,data:photo.blob});
      photoEntries.push({imageId,path,bytes:photo.blob.size,type:'image/jpeg'});
    }
    const metadata={format:'wear-journal-full',backupVersion:1,exportedAt:new Date().toISOString(),data:structuredClone(state),images:photoEntries};
    files.unshift({name:'data.json',data:JSON.stringify(metadata,null,2)});
    return await ARCHIVE.makeZip(files);
  }
  async function backupZip(share=false) {
    if(imageBusy)return notify('写真の保存が終わってからバックアップしてください',true);
    const btn=$('backup-zip');btn.disabled=true;
    notify('すべての写真と着用履歴をZIPにまとめています…',false,true);
    try {
      const blob=await makeFullBackup();
      const name=backupZipName();
      const file=new File([blob],name,{type:'application/zip'});
      if(share && navigator.share && navigator.canShare?.({files:[file]})) {
        try {await navigator.share({files:[file],title:'Wear Journal 完全バックアップ'});}
        catch(e){if(e.name==='AbortError')return;throw e;}
      } else downloadBlob(blob,name);
      afterExport();notify('ZIPを作成しました。iCloud Driveに保存されたかファイルアプリで確認してください。');
    } catch(e) {notify('ZIPバックアップ失敗：'+e.message,true,true);}
    finally {btn.disabled=false;}
  }
  function exportJson() {
    downloadText(buildJsonBackup(),backupJsonName(),'application/json;charset=utf-8');
    afterExport();notify('文字データだけのJSONを作成しました。写真は含まれません。');
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
    if(raw?.format===FORMAT && raw?.data)return convertImport(raw.data);
    if(raw?.schemaVersion===3){
      const result=normalize(raw);
      // JSON cannot restore photos; remove references to stale local image IDs.
      result.items.forEach(item=>{item.imageId=null;});
      return result;
    }
    if(raw?.schemaVersion===2)return migrateV2(raw);
    if(raw?.version===1)return migrateV1(raw);
    throw Error('このJSONは対応するWear Journalのバックアップではありません');
  }
  function restorePrompt(imported, withPhotos) {
    const count=Object.values(imported.entries).filter(v=>v.items.length||v.rest).length;
    const currentCount=Object.values(state.entries).filter(v=>v.items.length||v.rest).length;
    return confirm(`バックアップを復元しますか？\n\n復元：${imported.items.length}点・${count}日${withPhotos?'（写真あり）':'（写真なし）'}\n現在：${state.items.length}点・${currentCount}日\n\n現在のデータは置き換わります。今のZIPバックアップを先に保存しましたか？`);
  }
  function completeRestore(imported) {
    const valid=normalize(imported);
    // localStorage writes before switching in-memory state. Never erase v2 source key.
    localStorage.setItem(STORAGE_KEY,JSON.stringify(valid));
    state=valid;readOnly=false;storageAvailable=true;
    selected=today();displayedMonth=monthNumber(selected);selectedCategory='shoes';itemFilter='shoes';
    setTab('calendar');notify('復元しました。写真と過去の記録を確認してください。');
  }
  async function importFile(file) {
    if(!file)return;
    if(imageBusy)return notify('写真処理中のため復元できません',true);
    try {
      if(file.name.toLowerCase().endsWith('.zip')){
        const contents=await ARCHIVE.readZip(file);
        const metadata=JSON.parse(ARCHIVE.decode(contents.get('data.json')));
        if(metadata?.format!=='wear-journal-full'||metadata.backupVersion!==1||!Array.isArray(metadata.images))throw Error('Wear Journalの完全バックアップではありません');
        const imported=normalize(metadata.data);
        const previousPhotoIds=[...new Set(state.items.map(it=>it.imageId).filter(Boolean))];
        const required=new Set(imported.items.map(it=>it.imageId).filter(Boolean));
        if(required.size!==metadata.images.length)throw Error('バックアップの写真一覧が不正です');
        if(!restorePrompt(imported,true))return;
        const updated=structuredClone(imported),newKeys=[];
        try {
          const remap=new Map();
          for(const descriptor of metadata.images){
            const origId=descriptor.imageId;
            if(!required.has(origId)||descriptor.path!==`images/${origId}.jpg`||descriptor.type!=='image/jpeg'||remap.has(origId))throw Error('写真のメタデータが正しくありません');
            const bytes=contents.get(descriptor.path);
            if(!bytes||bytes.length!==descriptor.bytes||bytes[0]!==0xff||bytes[1]!==0xd8||bytes[2]!==0xff)throw Error('バックアップ内の画像が壊れています');
            const newId=randomPhotoId();
            await PHOTO.put(newId,new Blob([bytes],{type:'image/jpeg'}));
            newKeys.push(newId);remap.set(origId,newId);
          }
          updated.items.forEach(it=>{if(it.imageId)it.imageId=remap.get(it.imageId);});
          completeRestore(updated);
          // Delete photos no longer referenced by the restored data to reclaim space.
          for(const id of previousPhotoIds)await PHOTO.remove(id).catch(()=>{});
        }catch(e){
          for(const id of newKeys)await PHOTO.remove(id).catch(()=>{});
          throw e;
        }
      } else {
        if(file.size>12*1024*1024)throw Error('JSONが大きすぎます');
        const imported=convertImport(JSON.parse(await file.text()));
        if(!restorePrompt(imported,false))return;
        completeRestore(imported);
      }
    }catch(e){notify('復元できませんでした：'+e.message,true,true);}
    finally{$('restore-file').value='';}
  }

  $('day-choices').addEventListener('toggle',()=>{
    if(editorOptionsDate===selected) editorOptionsOpen=$('day-choices').open;
  });
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
    next.items.push({id:makeId(),name:name.slice(0,100),category,active:true,icon:CATEGORY[category].icon,color:COLORS[count%COLORS.length],imageId:null});
    if(persist(next)) { $('item-name').value=''; itemFilter=category;redraw();notify('アイテムを登録しました'); }
  });
  $('backup-zip').addEventListener('click',()=>backupZip(false));
  $('share-zip').addEventListener('click',()=>backupZip(true));
  $('backup-json').addEventListener('click',exportJson);
  $('backup-csv').addEventListener('click',exportCsv);
  $('restore-file').addEventListener('change',e=>importFile(e.target.files[0]));
  $('photo-file').addEventListener('change',e=>attachPhoto(e.target.files[0]));
  $('summary-prev').addEventListener('click',()=>changeMonth(-1));
  $('summary-next').addEventListener('click',()=>changeMonth(1));
  $('update-start').addEventListener('click',()=>{
    const value=$('start-date').value;
    if(!validDate(value)||value>today())return notify('今日以前の有効な日付を選んでください',true);
    const next=structuredClone(state);next.trackingStart=value;
    if(persist(next)){redraw();notify('記録開始日を変更しました');}
  });

  readInitialState();redraw();
})();
