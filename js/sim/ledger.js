// 2.58.0 帳簿（テストモードだけ）：お金と物資がどこから来てどこへ行くかを、遊びごとに数える。
//  命令（SIM.commands）と時間の経過（SIM.systems）を1つずつ包み、前後の差を「どのファイルの・どの命令か」で記録する。
//  数えるもの：プレイヤーのお金（手持ち＋蔵）・プレイヤーの物（荷＋蔵）・拠点の在庫（全部の拠点の合計）。
//  1つの処理の中で中身を分けて数えたいとき（生産と消費など）は SIM.LEDGER.note() で名前をつけ、残りを処理の名前で数える。
//  world.js のすぐ後に読み込む（あとのファイルが足す命令・システムの出どころのファイルを覚えるため）。記録はセーブしない
(function () {
  const SIM = SGK.SIM;
  const L = (SIM.LEDGER = { w: null });
  const fileNow = () => { try { const s = document.currentScript && document.currentScript.src; return s ? s.split('/').pop().replace(/\.js.*$/, '') : '?'; } catch (e) { return '?'; } };

  // ---- 出どころのファイルを覚える ----
  const CMD_SRC = (L.cmdSrc = {});
  for (const k in SIM.commands) CMD_SRC[k] = 'world';
  SIM.commands = new Proxy(SIM.commands, { set(t, k, v) { if (!(k in CMD_SRC)) CMD_SRC[k] = fileNow(); t[k] = v; return true; } });
  for (const f of SIM.systems) f.__src = 'world';
  const tag = (fns) => { const src = fileNow(); fns.forEach((f) => { if (typeof f === 'function' && !f.__src) f.__src = src; }); };
  SIM.systems.push = function (...fns) { tag(fns); return Array.prototype.push.apply(this, fns); };
  SIM.systems.unshift = function (...fns) { tag(fns); return Array.prototype.unshift.apply(this, fns); };

  // ---- 記録の入れ物 ----
  L.reset = (w) => {
    L.w = w; L.start = w ? w.time.min : 0; L.realStart = Date.now();
    L.money = {}; // 出どころ -> { in, out, n }
    L.pinv = {}; // 品 -> 出どころ -> { in, out }（プレイヤーの物）
    L.stock = {}; // 品 -> 出どころ -> { in, out }（拠点の在庫）
    L.ms = {}; // 出どころ -> 使った時間（ミリ秒）
    // 在庫を全部数えるのは重い（拠点が700以上）。はじめの2日は全部の処理で数えて、在庫を動かした処理を覚え、あとはその処理だけ数える。
    // 1時間ごとに実際の在庫と記録を突き合わせ、合わない分は「不明」に入れて、また少しのあいだ全部の処理で数える
    L.learn = 288; L.reconT = w ? w.time.min : 0; L.reconStock = w ? snapStock(w) : {}; L.pend = {};
  };
  L.reset(null);
  L.active = (w) => !!(w && w.test);
  const ensure = (w) => { if (L.w !== w) L.reset(w); };
  const addTo = (tab, label, d) => { if (!d) return; const r = (tab[label] = tab[label] || { in: 0, out: 0, n: 0 }); if (d > 0) r.in += d; else r.out -= d; };
  const addItem = (tab, k, label, d) => { if (Math.abs(d) < 1e-9) return; addTo((tab[k] = tab[k] || {}), label, d); if (tab === L.stock) L.pend[k] = (L.pend[k] || 0) + d; };

  // ---- 前後の様子 ----
  function snapMoney(w) { const o = {}; for (const id in w.players) { const p = w.players[id]; o[id] = (p.money || 0) + ((p.kura && p.kura.money) || 0); } return o; }
  function snapInv(w) {
    const o = {};
    for (const id in w.players) { const p = w.players[id]; for (const box of [p.inv, p.kura && p.kura.inv]) if (box) for (const k in box) if (typeof box[k] === 'number') o[k] = (o[k] || 0) + box[k]; }
    return o;
  }
  function snapStock(w) { const o = {}; for (const s of w.settlements) if (s.stock) for (const k in s.stock) o[k] = (o[k] || 0) + (s.stock[k] || 0); return o; }
  let noted = null; // 処理の中で SIM.LEDGER.note() で名前をつけた分（品 -> 量）
  L.note = (kind, k, label, d) => {
    const w = L.w; if (!w || !L.active(w) || !d) return;
    addItem(kind === 'stock' ? L.stock : L.pinv, k, label, d);
    if (noted) { const t = (noted[kind] = noted[kind] || {}); t[k] = (t[k] || 0) + d; }
  };
  function measure(w, label, fn, sys) {
    ensure(w);
    const stk = !sys || L.learn > 0 || sys.__stk;
    const m0 = snapMoney(w), i0 = snapInv(w), s0 = stk ? snapStock(w) : null, t0 = performance.now(), keep = noted;
    noted = {};
    try { return fn(); } finally {
      const nt = noted; noted = keep;
      L.ms[label] = (L.ms[label] || 0) + performance.now() - t0;
      const m1 = snapMoney(w);
      let moved = false;
      for (const id in m1) { const d = m1[id] - (m0[id] || 0); if (d) { addTo(L.money, label, d); moved = true; } }
      if (moved || label.indexOf('cmd:') === 0) { const r = (L.money[label] = L.money[label] || { in: 0, out: 0, n: 0 }); if (label.indexOf('cmd:') === 0) r.n++; }
      const i1 = snapInv(w);
      for (const k of new Set([...Object.keys(i0), ...Object.keys(i1)])) addItem(L.pinv, k, label, (i1[k] || 0) - (i0[k] || 0) - ((nt.pinv && nt.pinv[k]) || 0));
      if (stk) {
        const s1 = snapStock(w);
        for (const k of new Set([...Object.keys(s0), ...Object.keys(s1)])) { const d = (s1[k] || 0) - (s0[k] || 0); if (sys && Math.abs(d) > 1e-9) sys.__stk = true; addItem(L.stock, k, label, d - ((nt.stock && nt.stock[k]) || 0)); }
      }
    }
  }

  // ---- 命令を包む ----
  const baseApply = SIM.applyCommand;
  SIM.applyCommand = function (w, pid, cmd) {
    if (!L.active(w) || !cmd || !SIM.commands[cmd.type]) return baseApply.call(this, w, pid, cmd);
    return measure(w, `cmd:${CMD_SRC[cmd.type] || '?'}:${cmd.type}`, () => baseApply.call(this, w, pid, cmd));
  };
  // ---- 時間の経過を包む（すべてのファイルが読み込まれてから、最初に使うときに包む） ----
  function wrapSystems() {
    for (let i = 0; i < SIM.systems.length; i++) {
      const f = SIM.systems[i]; if (f.__led) continue;
      const label = `sys:${f.__src || '?'}`;
      const g = function (w, d) { return L.active(w) ? measure(w, label, () => f.call(this, w, d), g) : f.call(this, w, d); };
      g.__led = true; g.__src = f.__src; SIM.systems[i] = g;
    }
  }
  L.wrap = wrapSystems;
  const sysCheck = (w, d) => {
    if (!L.active(w)) return;
    ensure(w); wrapSystems(); if (L.learn > 0) L.learn--;
    if (w.time.min - L.reconT < 60) return;
    const cur = snapStock(w); let bad = false; // 突き合わせ
    for (const k of new Set([...Object.keys(cur), ...Object.keys(L.reconStock)])) {
      const d = (cur[k] || 0) - (L.reconStock[k] || 0) - (L.pend[k] || 0);
      if (Math.abs(d) > 1e-6) { addTo((L.stock[k] = L.stock[k] || {}), '不明（記録漏れ）', d); bad = true; }
    }
    L.reconT = w.time.min; L.reconStock = cur; L.pend = {}; if (bad) L.learn = Math.max(L.learn, 12);
  };
  sysCheck.__led = true; sysCheck.__src = 'ledger';
  Array.prototype.unshift.call(SIM.systems, sysCheck);

  // ---- 見せるための集計 ----
  // 出どころのファイル -> 遊びの名前
  L.CAT = {
    world: '移動・その他', economy: '市場・依頼', quest: '依頼（村・城）', military: '合戦', army: '合戦', siege: '合戦', castle: '城', daimyo: '大名', bushou: '武将',
    growth: '成長', rank: '身分・俸禄', supply: '兵糧', house: '屋敷', fushin: '普請', invest: '投資', equip: '武具', chiho: '地方の兵', kuni: '国', torihiki: '取引',
    gamble: '賭場', title: '称号', creatures: '釣り・虫取り', mining: '採掘', seisaku: '政策', skill: '技能', shinobi: '忍び', testmode: 'テスト', cloth: '服',
    home: '自宅', smith: '鍛冶', farm: '畑・家畜・狩り', gosho: '豪商', kaigai: '南蛮貿易', shoka: '商家', nomin: '村長・百姓', carry: '引き継ぎ', weather: '天気',
    party: 'みんなで遊ぶ', musume: '看板娘', nawa: '縄張り', nawagen: '縄張り', castlemap: '城', ledger: '帳簿', route: '移動・その他',
  };
  L.split = (label) => { const a = label.split(':'); return a[0] === 'cmd' ? { cat: L.CAT[a[1]] || a[1], file: a[1], what: a[2], cmd: true } : a[0] === 'sys' ? { cat: L.CAT[a[1]] || a[1], file: a[1], what: '時間の経過', cmd: false } : { cat: label, file: '', what: label, cmd: false }; };
  L.days = () => (L.w ? Math.max(1 / 24, (L.w.time.min - L.start) / 1440) : 0);
})();
