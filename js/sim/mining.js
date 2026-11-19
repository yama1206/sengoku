// 2.25.0 採掘（岩の中の鉱物を取り出すパズル）。山地か、金山・銀山のそばで立ち止まっているとき遊べる。
// 流れ：mineStart（ホストが岩の種 seed を決める）→ 本人の画面で岩を掘る（js/mineui.js）→ mineEnd（操作の記録 log をホストが同じ規則でやり直して結果を決める）
// 岩の作り方と掘る規則は SGK.MINE に入れ、ホストと本人の画面で同じものを使う。数値はすべて仮
(function () {
  const SIM = SGK.SIM, D = SGK.DATA, C = SIM.commands, say = (pid, t) => SIM.say(pid, t);
  const M = (SGK.MINE = {});
  M.W = 14; M.H = 10;
  M.HP = [2, 4, 6, 12];                                  // 岩の硬さ（柔らかい・普通・硬い・非常に硬い）ごとの耐久
  M.LV = ['柔らかい岩', '普通の岩', '硬い岩', '非常に硬い岩'];
  // 道具：pow＝岩に与える力、gem＝宝石に伝わる衝撃、area＝一度に当たるマス（中心からの差）
  M.TOOLS = [
    { id: 's', name: '小型（たがね）', pow: 2, gem: 2, area: [[0, 0]], info: '1マス・力小・宝石に優しい' },
    { id: 'm', name: '中型（鶴嘴）', pow: 4, gem: 6, area: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]], info: '十字5マス・力中' },
    { id: 'l', name: '大型（大槌）', pow: 6, gem: 15, area: (() => { const a = []; for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) a.push([x, y]); return a; })(), info: '3×3マス・力大・宝石を傷つけやすい' },
  ];
  M.HAND = 3; // 4つ目＝手（宝石を取り出す）
  // 鉱物：frag＝衝撃の受けやすさ、price＝無傷の1つの値段（文）、w＝出やすさ、n＝大きさ（マス数）
  M.MIN = [
    { id: 'gold', name: '砂金・金鉱石', col: '#e8c13a', frag: 0.9, price: 1500, w: 3, n: [1, 2] },
    { id: 'silver', name: '銀鉱石', col: '#cfd3d8', frag: 0.8, price: 700, w: 6, n: [2, 3] },
    { id: 'copper', name: '銅鉱石', col: '#c0713f', frag: 0.5, price: 250, w: 12, n: [3, 4] },
    { id: 'iron', name: '鉄鉱石', col: '#6b6f78', frag: 0.4, price: 200, w: 14, n: [3, 5] },
    { id: 'lead', name: '鉛鉱石', col: '#8796a6', frag: 0.5, price: 150, w: 10, n: [2, 4] },
    { id: 'sulfur', name: '硫黄', col: '#e6dc3c', frag: 1.6, price: 120, w: 10, n: [2, 3] },
    { id: 'quartz', name: '水晶', col: '#bfe6f5', frag: 1.2, price: 900, w: 6, n: [2, 4] },
    { id: 'agate', name: '瑪瑙', col: '#d9826f', frag: 1.0, price: 600, w: 6, n: [2, 4] },
    { id: 'jade', name: '翡翠', col: '#3fae7a', frag: 0.55, price: 2500, w: 2, n: [2, 3] },
    { id: 'garnet', name: '柘榴石（ガーネット）', col: '#a8213a', frag: 1.0, price: 1200, w: 4, n: [1, 3] },
  ];
  M.byId = (id) => M.MIN.find((m) => m.id === id);
  // 品質：傷の少なさ（耐久0〜100）で決まる。破片＝完全に壊れた
  M.QN = ['破片', '低品質', '通常品質', '最高品質'];
  M.QM = [0.1, 0.5, 1, 1.8]; // 値段の倍率
  M.quality = (dur) => (dur <= 0 ? 0 : dur >= 95 ? 3 : dur >= 65 ? 2 : 1);
  M.QTXT = ['完全に砕けた', '大きな傷', '軽微な傷', '無傷'];
  M.PAR = 40; // 手際の目安の手数：これ以下なら+30%、1.5倍以下なら+10%

  const rngOf = (seed) => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // 岩を作る。near＝'kin'/'gin'（金山・銀山のそば）なら金・銀が出やすい
  M.gen = (seed, near) => {
    const r = rngOf(seed), W = M.W, H = M.H, N = W * H;
    const cs = []; const bias = [0, 0, 1, 1, 1, 2, 2, 3];
    for (let i = 0; i < 6; i++) cs.push({ x: r() * W, y: r() * H, b: bias[Math.floor(r() * bias.length)] });
    const lv = [], hp = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let sw = 0, sv = 0; for (const c of cs) { const d = (c.x - x) ** 2 + (c.y - y) ** 2 + 1, wt = 1 / (d * d); sw += wt; sv += wt * c.b; }
      let v = sv / sw + (r() - 0.5) * 1.5; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) v -= 0.5;
      const l = Math.max(0, Math.min(3, Math.round(v))); lv.push(l); hp.push(M.HP[l]);
    }
    // 鉱物をばらまく（重ならず、辺で接しない）
    const wts = M.MIN.map((m) => m.w * ((near === 'kin' && m.id === 'gold') ? 6 : (near === 'kin' && m.id === 'silver') ? 2 : (near === 'gin' && m.id === 'silver') ? 6 : (near === 'gin' && m.id === 'lead') ? 2 : 1));
    const pick = () => { let s = wts.reduce((a, b) => a + b, 0) * r(); for (let i = 0; i < wts.length; i++) { s -= wts[i]; if (s <= 0) return M.MIN[i]; } return M.MIN[0]; };
    const occ = new Array(N).fill(-1), gems = [], want = 4 + Math.floor(r() * 3);
    const nb = (i) => { const x = i % W, y = (i / W) | 0, a = []; if (x > 0) a.push(i - 1); if (x < W - 1) a.push(i + 1); if (y > 0) a.push(i - W); if (y < H - 1) a.push(i + W); return a; };
    for (let t = 0; t < 80 && gems.length < want; t++) {
      const m = pick(), n = m.n[0] + Math.floor(r() * (m.n[1] - m.n[0] + 1));
      const s = Math.floor(r() * N); if (occ[s] !== -1 || nb(s).some((j) => occ[j] !== -1)) continue;
      const cells = [s]; let guard = 0;
      while (cells.length < n && guard++ < 30) { const from = cells[Math.floor(r() * cells.length)], c = nb(from)[Math.floor(r() * 4)]; if (c != null && !cells.includes(c) && occ[c] === -1 && nb(c).every((j) => occ[j] === -1 || cells.includes(j))) cells.push(c); }
      if (cells.length < Math.min(n, m.n[0])) continue;
      const gi = gems.length; for (const c of cells) occ[c] = gi; gems.push({ id: m.id, cells, dur: 100, got: false });
    }
    return { W, H, lv, hp, occ, gems, hits: 0 };
  };
  // 1回の操作。t＝0小・1中・2大・3手、i＝マスの番号。成功したか（意味のある操作か）を返す
  M.step = (S, t, i) => {
    const W = S.W, H = S.H; if (!(i >= 0 && i < W * H)) return false;
    if (t === M.HAND) {
      const gi = S.occ[i]; if (gi < 0) return false; const g = S.gems[gi];
      if (g.got || g.dur <= 0 || g.cells.some((c) => S.hp[c] > 0)) return false;
      g.got = true; return true;
    }
    const tl = M.TOOLS[t]; if (!tl) return false;
    const cx = i % W, cy = (i / W) | 0; S.hits++;
    for (const [dx, dy] of tl.area) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const c = y * W + x, gi = S.occ[c];
      if (gi >= 0) { const g = S.gems[gi]; if (!g.got && g.dur > 0) { const f = M.byId(g.id).frag; g.dur = Math.max(0, Math.round((g.dur - tl.gem * f * (S.hp[c] > 0 ? 0.5 : 1)) * 10) / 10); } }
      if (S.hp[c] > 0) S.hp[c] = Math.max(0, S.hp[c] - tl.pow);
    }
    return true;
  };
  // 終わったときの結果：取れた鉱物（取り出した無傷〜傷物と、砕けた破片）
  M.result = (S) => {
    const out = [], lost = [];
    for (const g of S.gems) {
      if (g.dur <= 0) out.push({ id: g.id, q: 0 });
      else if (g.got) out.push({ id: g.id, q: M.quality(g.dur), dur: g.dur });
      else lost.push(g.id);
    }
    const value = out.reduce((a, o) => a + M.byId(o.id).price * M.QM[o.q], 0);
    const bonus = S.hits <= M.PAR ? 0.3 : S.hits <= M.PAR * 1.5 ? 0.1 : 0;
    return { out, lost, value: Math.round(value), bonus, hits: S.hits };
  };

  // ---- 場所：山地か、金山・銀山のそば ----
  M.nearKm = 12;
  SIM.mineSpot = (w, x, y) => {
    if (SIM.isSea && SIM.isSea(x, y)) return null;
    let best = null, bd = M.nearKm;
    for (const m of D.mines || []) { const d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } }
    if (best) return { near: best.k, name: best.name };
    return SIM.terrainAt(x, y) === '山地' ? { near: null, name: '山' } : null;
  };

  // ---- 命令 ----
  C.mineStart = (w, p, c) => {
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    if (p.tx != null) return say(p.id, '歩いている最中は始められません。立ち止まってください');
    const sp = SIM.mineSpot(w, p.x, p.y); if (!sp) return say(p.id, 'ここには掘れそうな岩場がありません（山地か金山・銀山のそばで）');
    const n = (p.mineN = (p.mineN || 0) + 1);
    p.mineLast = null; p.mine = { n, seed: Math.floor(SIM.rand(w) * 4294967296) | 0, near: sp.near, name: sp.name, at: Date.now() };
  };
  C.mineEnd = (w, p, c) => {
    const m = p.mine; if (!m || +c.n !== m.n) return; p.mine = null;
    if (Date.now() - m.at > 3 * 3600 * 1000) return;
    const log = Array.isArray(c.log) ? c.log.slice(0, 3000) : [];
    const S = M.gen(m.seed, m.near);
    for (const e of log) { const t = Math.floor(e / 1000), i = e % 1000; if (Number.isInteger(e) && t >= 0 && t <= 3) M.step(S, t, i); }
    const R = M.result(S), ore = (p.ore = p.ore || {});
    for (const o of R.out) { const a = (ore[o.id] = ore[o.id] || [0, 0, 0, 0]); a[o.q]++; }
    const bonus = Math.round(R.value * R.bonus); if (bonus > 0) p.money += bonus;
    p.mineLast = { n: m.n, name: m.name, out: R.out, lost: R.lost, hits: R.hits, bonus, value: R.value };
    p.mineCnt = (p.mineCnt || 0) + 1;
    say(p.id, R.out.length ? `採掘を終えました（${R.out.length}個を入手）${bonus ? ' 手際のよさで+' + SIM.money(bonus) : ''}` : '採掘を終えました（何も取れませんでした）');
  };
  // 鉱石を売る（拠点にいるとき）。id＝鉱物、c.q＝品質0〜3（省略で全部）。大きな町は1.2倍
  C.oreSell = (w, p, c) => {
    const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null; if (!s) return say(p.id, '鉱石を売れるのは、町や村・城にいるときだけです');
    const ore = p.ore || {}, a = ore[c.id], m = M.byId(c.id); if (!a || !m) return;
    const k = D.isBig(s) ? 1.2 : 1; let sum = 0;
    for (let q = 0; q < 4; q++) { if (c.q != null && +c.q !== q) continue; sum += a[q] * m.price * M.QM[q] * k; a[q] = 0; }
    if (!a.some((x) => x)) delete ore[c.id];
    sum = Math.round(sum); if (sum > 0) { p.money += sum; say(p.id, `${m.name}を売りました +${SIM.money(sum)}`); }
  };

  // ---- 本人へ ----
  const cache = {}, basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    let sp = null;
    if (p.tx == null && !p.busy) {
      const key = `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`, ch = cache[pid];
      if (ch && ch.key === key) sp = ch.v; else { sp = SIM.mineSpot(w, p.x, p.y); cache[pid] = { key, v: sp }; }
    }
    r.me.mineSpot = sp; r.me.mine = p.mine ? { n: p.mine.n, seed: p.mine.seed, near: p.mine.near, name: p.mine.name } : null;
    r.me.mineLast = p.mineLast || null; r.me.ore = p.ore || {};
    return r;
  };
})();
