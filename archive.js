/* Wear Journal v3: dependency-free ZIP writer and reader (ZIP STORED / no extra compression).
   JPEG images are already compressed. All writes/reads use CRC32 verification. */
(() => {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let j=0;j<8;j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    return c >>> 0;
  });
  function crc32(data) {
    let value = 0xffffffff;
    for (const byte of data) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  const toBytes = async content => content instanceof Uint8Array ? content : content instanceof Blob ? new Uint8Array(await content.arrayBuffer()) : encoder.encode(String(content));
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const put16 = (dv, at, n) => dv.setUint16(at, n, true);
  const put32 = (dv, at, n) => dv.setUint32(at, n >>> 0, true);

  async function makeZip(files) {
    if (files.length > 1000) throw Error('写真の枚数が多すぎます');
    const chunks = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.name);
      const content = await toBytes(file.data);
      if (name.length > 65535 || content.length > 30*1024*1024) throw Error('大きすぎるファイルがあります');
      const checksum = crc32(content);
      const header = new Uint8Array(30 + name.length);
      const h = view(header);
      put32(h,0,0x04034b50); put16(h,4,20); put16(h,6,0x0800); put16(h,8,0);
      put16(h,10,0); put16(h,12,0); put32(h,14,checksum);
      put32(h,18,content.length); put32(h,22,content.length); put16(h,26,name.length); put16(h,28,0);
      header.set(name,30);
      chunks.push(header,content);
      const center = new Uint8Array(46 + name.length);
      const c = view(center);
      put32(c,0,0x02014b50); put16(c,4,20); put16(c,6,20); put16(c,8,0x0800);
      put16(c,10,0); put16(c,12,0); put16(c,14,0); put32(c,16,checksum);
      put32(c,20,content.length); put32(c,24,content.length); put16(c,28,name.length);
      put16(c,30,0); put16(c,32,0); put16(c,34,0); put16(c,36,0);
      put32(c,38,0); put32(c,42,offset);
      center.set(name,46);
      centrals.push(center);
      offset += header.length + content.length;
    }
    const centralSize = centrals.reduce((n,a)=>n+a.length,0);
    const end = new Uint8Array(22);
    const d = view(end);
    put32(d,0,0x06054b50); put16(d,4,0); put16(d,6,0);
    put16(d,8,files.length); put16(d,10,files.length);
    put32(d,12,centralSize); put32(d,16,offset); put16(d,20,0);
    return new Blob([...chunks,...centrals,end],{type:'application/zip'});
  }

  async function readZip(file) {
    if (file.size > 120 * 1024 * 1024) throw Error('ZIPは120MB以下にしてください');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const dv = view(bytes);
    const u16 = at => dv.getUint16(at,true);
    const u32 = at => dv.getUint32(at,true);
    let pos=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-22-65535);i--){
      if(u32(i)===0x06054b50 && i+22+u16(i+20)===bytes.length) {pos=i; break;}
    }
    if(pos<0)throw Error('ZIPの終端が見つかりません');
    if(u16(pos+4)!==0 || u16(pos+6)!==0 || u16(pos+8)!==u16(pos+10))throw Error('分割ZIPには対応していません');
    const count=u16(pos+10),size=u32(pos+12),start=u32(pos+16);
    if(count>1000 || start+size>pos)throw Error('ZIPの構造が正しくありません');
    let cursor=start;
    const entries=new Map();
    for(let i=0;i<count;i++){
      if(cursor+46>pos || u32(cursor)!==0x02014b50)throw Error('ZIPの一覧が壊れています');
      const flags=u16(cursor+8),method=u16(cursor+10),checksum=u32(cursor+16);
      const packed=u32(cursor+20),unpacked=u32(cursor+24);
      const nameSize=u16(cursor+28),extra=u16(cursor+30),comment=u16(cursor+32);
      const localOffset=u32(cursor+42);
      if(cursor+46+nameSize+extra+comment>pos)throw Error('ZIPのファイル名が不正です');
      const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameSize));
      cursor+=46+nameSize+extra+comment;
      if(flags & 1 || method!==0 || packed!==unpacked)throw Error('このZIPの圧縮形式には対応していません。Wear Journalから書き出したZIPを使ってください');
      if(!name || name.includes('..') || name.startsWith('/') || !/^(data\.json|images\/[A-Za-z0-9_-]+\.jpg)$/.test(name) || entries.has(name))throw Error('ZIPに不正なファイルがあります');
      if(unpacked>30*1024*1024 || localOffset+30>start || u32(localOffset)!==0x04034b50)throw Error('ZIPの画像が壊れています');
      const offset=localOffset+30+u16(localOffset+26)+u16(localOffset+28);
      if(offset+packed>start)throw Error('ZIPの内容が不正です');
      const content=bytes.slice(offset,offset+packed);
      if(crc32(content)!==checksum)throw Error('ZIPのチェックサムが一致しません');
      entries.set(name,content);
    }
    if(cursor!==start+size || !entries.has('data.json'))throw Error('ZIP内にdata.jsonが見つかりません');
    return entries;
  }
  window.WearJournalArchive = {makeZip,readZip,encode: text=>encoder.encode(text),decode: bytes=>decoder.decode(bytes)};
})();
