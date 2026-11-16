// 2.3.0 クラウド保存（イセログ方式）。Firebase Realtime Database を REST で読み書きする（SDKなし）
// 置き場所：worlds/sg世界コード/ … save（世界・gzip）／info（一覧用の要約）／host（ホストの掲示板・net.js）／clk（時計合わせ）
// ※ イセログと同じデータベースを使う。イセログの世界コードは英大文字なので、頭に sg を付ければ重ならない
(function () {
  const C = SGK.CLOUD = { SV: 1, off: 0, busy: false, last: 0, err: '' };
  C.on = () => /^https:\/\//.test(SGK.CFG.FB_URL || '');
  C.url = (code, k) => SGK.CFG.FB_URL.replace(/\/+$/, '') + '/worlds/sg' + code + '/' + k + '.json';
  C.rest = async function (code, k, method, body, keepalive) {
    const o = { method: method || 'GET', cache: 'no-store', keepalive: !!keepalive };
    if (body !== undefined) { o.body = JSON.stringify(body); o.headers = { 'Content-Type': 'application/json' }; }
    const r = await fetch(C.url(code, k), o);
    if (!r.ok) throw new Error('通信に失敗しました（' + r.status + '）');
    return r.json();
  };
  C.now = () => Date.now() + C.off; // サーバーの時刻
  C.clock = async (code) => { try { const t = await C.rest(code, 'clk', 'PUT', { '.sv': 'timestamp' }); if (typeof t === 'number') C.off = t - Date.now(); } catch (e) {} };
  C.fresh = (h) => !!(h && h.at && C.now() - h.at < SGK.CFG.HOST_TTL);
  C.norm = (s) => String(s || '').replace(/\D/g, '').slice(0, 6);

  // ---- gzip して base64 に（世界が大きいので） ----
  async function gz(s) {
    const b = new Uint8Array(await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let o = ''; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(o);
  }
  async function gunz(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }

  // 新しい世界コード（まだ使われていない数字6けた）
  C.newCode = async function () {
    for (let i = 0; i < 8; i++) {
      const c = String(Math.floor(Math.random() * 900000) + 100000);
      if (!(await C.rest(c, 'info'))) return c;
    }
    throw new Error('世界コードを決められませんでした');
  };

  // 読み込み：世界がなければ null
  C.load = async function (code) {
    const o = await C.rest(code, 'save'); if (!o) return null;
    if (o.sv > C.SV) throw new Error('この世界は新しいバージョンで保存されています。更新ボタンを押してください');
    const w = SGK.SAVE.migrate(JSON.parse(o.z ? await gunz(o.data) : o.data));
    w.code = code; return w;
  };
  C.info = (code) => C.rest(code, 'info').catch(() => null);

  // 保存（ホストだけが呼ぶ）。重ならないようにする。Promise<bool>
  C.save = async function (code, w) {
    if (!C.on() || !code || !w) return false;
    if (C.busy) { C.again = true; return false; }
    C.busy = true;
    try {
      w.version = SGK.VERSION; w.savedAt = Date.now(); w.code = code;
      const data = await gz(JSON.stringify(w));
      await C.rest(code, 'save', 'PUT', { sv: C.SV, ver: SGK.VERSION, at: { '.sv': 'timestamp' }, z: 1, data });
      await C.rest(code, 'info', 'PUT', { ver: SGK.VERSION, at: { '.sv': 'timestamp' }, min: w.time ? w.time.min : 0, names: Object.values(w.players || {}).map((p) => p.name).slice(0, 5), kb: Math.round(data.length / 1024) });
      C.last = Date.now(); C.err = ''; return true;
    } catch (e) { console.error(e); C.err = e.message; return false; }
    finally { C.busy = false; if (C.again) { C.again = false; } }
  };

  // ---- 入ったことのある世界の一覧（この端末に置く） ----
  C.worlds = () => { try { return JSON.parse(localStorage.getItem('sgk-worlds')) || []; } catch (e) { return []; } };
  C.remember = (code) => { const l = C.worlds().filter((x) => x.code !== code); l.unshift({ code, at: Date.now() }); localStorage.setItem('sgk-worlds', JSON.stringify(l.slice(0, 20))); };
  C.forget = (code) => localStorage.setItem('sgk-worlds', JSON.stringify(C.worlds().filter((x) => x.code !== code)));
})();
