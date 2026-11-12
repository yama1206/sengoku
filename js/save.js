// セーブ（ホストのブラウザに保存。破損対策：一時領域→本体の順に書く＋バックアップ数世代）
(function () {
  const KEY = 'sgk_world_main';
  const SAVE = SGK.SAVE = {};

  SAVE.migrate = function (w) {
    if (!w || typeof w !== 'object' || !w.schema) throw new Error('セーブデータの形式が違います');
    if (w.schema > SGK.SAVE_SCHEMA) throw new Error('新しいバージョンのセーブです。ゲームを更新してください');
    // 足りない項目（市場・所持金など）を補う。形式が変わるたびに ensure 側で対応する
    return SGK.SIM.ensure(w);
  };

  SAVE.save = function (w) {
    w.version = SGK.VERSION; w.savedAt = Date.now();
    const json = JSON.stringify(w);
    try {
      localStorage.setItem(KEY + '_tmp', json);
      localStorage.setItem(KEY, json);
      localStorage.removeItem(KEY + '_tmp');
      return true;
    } catch (e) { console.error(e); return false; }
  };

  SAVE.backup = function (w) {
    try {
      for (let i = SGK.CFG.BACKUPS; i > 1; i--) {
        const prev = localStorage.getItem(KEY + '_bak' + (i - 1));
        if (prev) localStorage.setItem(KEY + '_bak' + i, prev);
      }
      localStorage.setItem(KEY + '_bak1', JSON.stringify(w));
    } catch (e) { console.error(e); }
  };

  SAVE.has = () => !!(localStorage.getItem(KEY) || localStorage.getItem(KEY + '_tmp') || localStorage.getItem(KEY + '_bak1'));

  // 本体→一時領域→バックアップの順に、読めるものを探す
  SAVE.load = function () {
    const keys = [KEY, KEY + '_tmp'];
    for (let i = 1; i <= SGK.CFG.BACKUPS; i++) keys.push(KEY + '_bak' + i);
    for (const k of keys) {
      try { const s = localStorage.getItem(k); if (s) return { world: SAVE.migrate(JSON.parse(s)), from: k }; } catch (e) { console.warn(k, e); }
    }
    return null;
  };

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
