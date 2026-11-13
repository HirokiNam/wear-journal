/* Wear Journal v3: private, per-browser IndexedDB image storage. */
(() => {
  'use strict';
  const DATABASE = 'wear-journal-photos-v1';
  const STORE = 'photos';
  let opening;
  const urlCache = new Map();

  function open() {
    if (!('indexedDB' in window)) return Promise.reject(Error('このブラウザはIndexedDBに対応していません'));
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); opening = undefined; };
        resolve(database);
      };
      request.onerror = () => reject(request.error || Error('画像ストレージを開けません'));
      request.onblocked = () => reject(Error('別のタブで画像ストレージが使用されています'));
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  }

  async function transaction(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || Error('写真の保存中にエラーが発生しました'));
      tx.onabort = () => reject(tx.error || Error('写真を保存できませんでした'));
    });
  }

  const get = id => transaction('readonly', store => store.get(id));
  const put = (id, blob) => transaction('readwrite', store => store.put({ id, blob, savedAt: new Date().toISOString() }));
  async function remove(id) {
    invalidate(id);
    await transaction('readwrite', store => store.delete(id));
  }
  function invalidate(id) {
    const url = urlCache.get(id);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  async function urlFor(id) {
    if (urlCache.has(id)) return urlCache.get(id);
    const row = await get(id);
    if (!row || !(row.blob instanceof Blob)) return null;
    const url = URL.createObjectURL(row.blob);
    urlCache.set(id, url);
    return url;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(Error('この画像を読み込めません。JPEGなど別の画像を試してください')); };
      image.src = url;
    });
  }

  async function compress(file) {
    if (!file || file.size > 25 * 1024 * 1024) throw Error('25MB以下の画像を選択してください');
    const image = await loadImage(file);
    if (!image.naturalWidth || !image.naturalHeight) throw Error('画像のサイズが不正です');
    const maxSide = 1024;
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw Error('画像の圧縮を開始できません');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height);
    ctx.drawImage(image, 0, 0, width, height);
    const output = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78));
    canvas.width = canvas.height = 0;
    if (!output || output.type !== 'image/jpeg') throw Error('写真をJPEGに変換できませんでした');
    if (output.size > 5 * 1024 * 1024) throw Error('圧縮後の写真が大きすぎます。別の画像を選択してください');
    return output;
  }

  window.WearJournalPhotos = { open, get, put, remove, urlFor, invalidate, compress };
})();
