// セーブ（ホストのブラウザに保存）。いくつかのスロットに分けて持てる
// 本体は IndexedDB（容量が大きい）。タブを閉じる瞬間などに備え、遊んでいるスロットの最新は localStorage にも1つだけ置く
(function () {
  const SAVE = SGK.SAVE = {};
  SAVE.SLOTS = 5;
  SAVE.slot = 1; // いま遊んでいるスロット
  const QUICK = 'sgk_world_main', QUICK_SLOT = 'sgk_world_main_slot', META = 'sgk-slots';

  // ---- IndexedDB ----
  const ST = 'saves'; let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('sgk', 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => db().then((d) => new Promise((res, rej) => {
    const t = d.transaction(ST, mode), st = t.objectStore(ST); let out;
    const r = fn(st); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
  const put = (k, v) => tx('readwrite', (s) => s.put(v, k));
  const get = (k) => tx('readonly', (s) => s.get(k));
  const del = (k) => tx('readwrite', (s) => s.delete(k));

  // ---- スロットの一覧（すぐ表示できるよう localStorage に要約を置く） ----
  const metas = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } };
  const setMeta = (n, w) => {
    const m = metas();
    m[n] = { at: w.savedAt || Date.now(), min: w.time ? w.time.min : 0, ver: w.version, names: Object.values(w.players || {}).map((p) => p.name).slice(0, 4), start: w.scenario || null };
    localStorage.setItem(META, JSON.stringify(m));
  };
  SAVE.slots = () => { const m = metas(); return Array.from({ length: SAVE.SLOTS }, (_, i) => ({ n: i + 1, meta: m[i + 1] || null })); };
  SAVE.has = () => Object.keys(metas()).length > 0;

  SAVE.migrate = function (w) {
    if (!w || typeof w !== 'object' || !w.schema) throw new Error('セーブデータの形式が違います');
    if (w.schema > SGK.SAVE_SCHEMA) throw new Error('新しいバージョンのセーブです。ゲームを更新してください');
    // 足りない項目（市場・所持金など）を補う。形式が変わるたびに ensure 側で対応する
    return SGK.SIM.ensure(w);
  };

  // 保存：localStorage の即時コピー → IndexedDB の本体。Promise<bool>
  SAVE.save = function (w) {
    w.version = SGK.VERSION; w.savedAt = Date.now();
    const json = JSON.stringify(w), n = SAVE.slot;
    try { localStorage.setItem(QUICK, json); localStorage.setItem(QUICK_SLOT, String(n)); } catch (e) { /* 容量不足でも本体は IndexedDB に残す */ }
    setMeta(n, w);
    return put('s' + n, json).then(() => true).catch((e) => { console.error(e); return false; });
  };
  SAVE.backup = function (w) {
    const n = SAVE.slot, B = SGK.CFG.BACKUPS;
    (async () => {
      for (let i = B; i > 1; i--) { const prev = await get(`s${n}_bak${i - 1}`); if (prev) await put(`s${n}_bak${i}`, prev); }
      await put(`s${n}_bak1`, JSON.stringify(w));
    })().catch((e) => console.error(e));
  };

  // 読み込み：本体と即時コピーの新しい方 → だめならバックアップ。{ world, from: 'main'|'bak' }
  SAVE.load = async function (n) {
    const cands = [];
    try { const s = await get('s' + n); if (s) cands.push(s); } catch (e) { console.warn(e); }
    if (localStorage.getItem(QUICK_SLOT) === String(n)) { const q = localStorage.getItem(QUICK); if (q) cands.push(q); }
    const parsed = cands.map((s) => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    for (const w of parsed) { try { SAVE.slot = n; return { world: SAVE.migrate(w), from: 'main' }; } catch (e) { if (/新しいバージョン/.test(e.message)) throw e; console.warn(e); } }
    for (let i = 1; i <= SGK.CFG.BACKUPS; i++) {
      try { const s = await get(`s${n}_bak${i}`); if (s) { SAVE.slot = n; return { world: SAVE.migrate(JSON.parse(s)), from: 'bak' }; } } catch (e) { console.warn(e); }
    }
    return null;
  };
  SAVE.remove = async function (n) {
    const m = metas(); delete m[n]; localStorage.setItem(META, JSON.stringify(m));
    if (localStorage.getItem(QUICK_SLOT) === String(n)) { localStorage.removeItem(QUICK); localStorage.removeItem(QUICK_SLOT); }
    await del('s' + n); for (let i = 1; i <= SGK.CFG.BACKUPS; i++) await del(`s${n}_bak${i}`);
  };

  // 以前の形式（localStorage に1つだけ）からスロット1へ移す
  SAVE.ready = (async () => {
    try {
      if (localStorage.getItem(QUICK) && !localStorage.getItem(QUICK_SLOT) && !metas()[1]) {
        const s = localStorage.getItem(QUICK); const w = JSON.parse(s);
        await put('s1', s); setMeta(1, w); localStorage.setItem(QUICK_SLOT, '1');
        for (let i = 1; i <= SGK.CFG.BACKUPS; i++) { const b = localStorage.getItem(QUICK + '_bak' + i); if (b) { await put('s1_bak' + i, b); localStorage.removeItem(QUICK + '_bak' + i); } }
        localStorage.removeItem(QUICK + '_tmp');
      }
    } catch (e) { console.warn('セーブの移行に失敗', e); }
  })();

  SAVE.exportFile = function (w) {
    const blob = new Blob([JSON.stringify(w)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sengoku_save_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  SAVE.importFile = (file) => file.text().then((t) => SAVE.migrate(JSON.parse(t)));
})();
