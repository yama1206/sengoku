// 0.56.0 アクション戦闘：自分の武将を直接動かし、兵は一人ひとりが動く。0.62.0 正式実装・マルチプレイ対応（ホストが計算し、参加者は入力を送って結果を受け取る）
(function () {
  const SIM = SGK.SIM, R = SGK.RENDER, TR = SIM.TROOPS;
  const ACT = SIM.ACT = {
    MAXMEN: 360,     // 戦場に出す兵の上限（多いときは1人が何人分かを受け持つ）
    SQUEEZE: 0.55,   // 両軍の初めの間合いを縮める
    SPD: 0.9,        // 移動の速さの倍率（0.61.2 1.5→0.9）
    HERO_HP: 2.5,
    MULTI: [1, 0.6, 0.4, 0.3, 0.25], // 0.73.9 一振りで何人かに当たるとき：近い順に 1人目100%・2人目60%・3人目40%…（5人目以降25%）
    MEN_HP: 2.5,     // 0.73.4 兵の体力の倍率（しっかり斬り合うように）    // 本人の体力の倍率（直接戦うので）0.61.0 4→2.5
    DASH: { t: 0.2, cd: 1.6, mul: 3 },
    WEP: { // 本人の武器：reach 届く距離、arc 振りの幅（片側）、cd 間隔、dmg 威力の倍率、shot 飛び道具
      tachi: { name: '刀', reach: 2.3, arc: 0.45, cd: 0.5, sw: 0.16, dmg: 2.4 }, // 0.73.9 振りの範囲にいる敵には全員当たる（2人目から減る ACT.MULTI）0.73.10 届く長さ 1.9→2.3、速く振れる
      yari: { name: '槍', reach: 3.2, arc: 0.3, cd: 0.8, sw: 0.24, dmg: 2.7 }, // 0.73.10 届く長さ 2.7→3.2、振りは遅い
      yumi: { name: '弓', shot: 45, cd: 1, dmg: 3, spd: 45 },
      teppo: { name: '鉄砲', shot: 60, cd: 3, dmg: 9, spd: 140 },
      waki: { name: '脇差', reach: 1.7, arc: 0.55, cd: 0.32, sw: 0.11, dmg: 1.7, sk: 'tachi' }, // 0.81.0 短くて速い（刀の技能で伸びる）
      shuri: { name: '手裏剣', shot: 22, cd: 0.4, dmg: 1.7, spd: 38, sk: 'shuri' }, // 0.81.0 近い間合いで速く投げる。まっすぐ飛ぶ（0.82.0 手裏剣の技能で伸びる）
    },
    ENGAGE: 12,      // 待機中の兵が自分から向かっていく距離
    SOLDIER_R: 0.5,
  };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
  const rr = () => Math.random();
  const live = (s) => s.hp > 0 && !s.gone;

  SIM.actCan = (w, b) => b && !b.cside && !b.act;
  SIM.actStart = (w, b, pid) => {
    const F = SIM.FIELD, cx = F.w / 2;
    const us = b.units.filter((u) => u.hp > 0 && !u.gone);
    const total = us.reduce((a, u) => a + (u.type === 'hero' ? 0 : u.n), 0);
    const A = b.act = { pid, pids: (b.pids || [pid]).slice(), inp: {}, dq: {}, dc: 0, k: Math.max(1, Math.ceil(total / ACT.MAXMEN)), s: [], pr: [], fx: [], dead: [], next: 1 };
    for (const u of us) {
      u.x = cx + (u.x - cx) * ACT.SQUEEZE;
      if (u.type === 'hero') {
        if (u.att != null) { const g = b.units.find((x) => x.id === u.att); if (g) g.lead = 0; u.att = null; }
        A.s.push({ id: A.next++, g: u.id, side: u.side, x: u.x - (u.side === 'A' ? 6 : -6), y: u.y, f: u.f, hp: u.hp * ACT.HERO_HP, mh: u.mh * ACT.HERO_HP, hero: 1, pc: u.owner && A.pids.includes(u.owner) ? u.owner : 0, cd: 0, dash: 0, dcd: 0 }); // pc = 操る人のid
        continue;
      }
      const m = Math.max(1, Math.ceil(u.n / A.k));
      u.m0 = m; u.nA = u.n; u.ax = u.x; u.ay = u.y; u.af = u.f;
      const L = [];
      for (let i = 0; i < m; i++) {
        const s = { id: A.next++, g: u.id, side: u.side, ox: 0, oy: 0, hp: u.hp / m * ACT.MEN_HP, mh: u.hp / m * ACT.MEN_HP, cd: rr() * 1.5, type: u.type };
        L.push(s); A.s.push(s);
      }
      layout(u, L); for (const s of L) place(s, u);
    }
    A.byG = {}; for (const u of b.units) A.byG[u.id] = u;
    A.trees = treePts(b.id, b.ter || []);
    const ix = {}; for (const u of b.units) { const o = u.owner || u.cmd; if (o && A.pids.includes(o) && u.type !== 'hero' && u.m0) { ix[o] = ix[o] || 2; u.idx = ix[o]++; } }
    for (const q of A.pids) if (q !== pid) SIM.say(q, `${(w.players[pid] || {}).name || '仲間'}が「自分で戦う」にしました。あなたも本人を直接動かせます`);
  };
  // 0.75.0 森の木の位置（3D表示の木と同じ並び。action3d.js の build と同じ作り方）
  function treePts(id, ter) {
    let sd = String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 3), q = (sd * 9301 + 49297) % 233280 || 1; const r = () => { q = (q * 9301 + 49297) % 233280; return q / 233280; };
    const out = [];
    for (const t of ter) if (t.k === 'f') { const n = Math.min(160, Math.round(t.r * t.r * 0.07)), F = { x: t.x, y: t.y, r: t.r, p: [] }; for (let i = 0; i < n; i++) { const a = r() * 7, d = Math.sqrt(r()) * t.r; F.p.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d]); r(); } out.push(F); }
    return out;
  }
  // 0.75.0 隊形：兵の持ち場（ox 前後・oy 左右）を並べ直す
  ACT.FORMS = { norm: '通常', line: '横隊', loose: '散開', square: '方陣', wedge: '鋒矢' };
  // 0.79.0 隊形の得手不得手：spd 移動・ma 近接の攻撃・ra 弓鉄砲の攻撃・md 近接で受ける被害・rd 矢弾で受ける被害（倍）
  ACT.FMOD = { line: { spd: 0.85, ra: 1.1 }, loose: { rd: 0.9, md: 1.15 }, square: { spd: 0.85, md: 0.9, rd: 0.9 }, wedge: { ma: 1.1, md: 1.15, rd: 1.15 } };
  const fmod = (u, k) => { const m = u && ACT.FMOD[u.fm]; return (m && m[k]) || 1; };
  // 0.80.0 地形：丘の高さ（中心1・ふち0）、移動の速さ（林・登り下り・堀・急な斜面）
  const hgt = (b, x, y) => { let h = 0; for (const t of b.ter || []) if (t.k === 'h') { const d = Math.hypot(x - t.x, y - t.y); if (d < t.r) h = Math.max(h, 1 - d / t.r); } return h; };
  function terMul(b, s, dx, dy, cav) {
    if (!b.ter || !b.ter.length) return 1;
    const t = SIM.terAt(b, s); let m = t.f ? (cav ? SIM.CAV_FOREST : 0.8) : 1;
    if (t.m) m *= 0.4; if (t.s) m *= cav ? 0.3 : 0.5;
    if (t.h && (dx || dy)) { const l = Math.hypot(dx, dy) || 1, h0 = hgt(b, s.x, s.y), h1 = hgt(b, s.x + dx / l, s.y + dy / l); if (h1 > h0 + 0.002) m *= 0.85; else if (h1 < h0 - 0.002) m *= 1.05; }
    return m;
  }
  // 0.80.0 勢い：攻撃したときの走る速さで威力が変わる（本人+30%・騎馬+50%／止まった騎馬-20%・歩兵+15%、後ずさりは-10%）
  function mom(s, t) {
    const T = s.hero ? TR.hero : TR[s.type]; if (!T) return 1;
    const cav = T.cav || s.genCav, vmax = (cav ? TR.kiba.spd : T.spd) * ACT.SPD * (s.hero && !s.genCav ? 1.1 : 1), v = s.vel || 0, r = Math.min(1, v / (vmax || 1));
    if (r > 0.2 && s.vx != null) { const a = ang(s, t), dot = (s.vx * Math.cos(a) + s.vy * Math.sin(a)) / (v || 1); if (dot < -0.3) return 0.9; }
    if (cav) return r < 0.15 ? 0.8 : 1 + 0.5 * r;
    return 1 + (s.hero ? 0.3 : 0.15) * r;
  }
  // 0.80.0 高さ：上から撃ち下ろすと+20%・撃ち上げると-15%、近接は高いほうが+10%
  function hMul(b, from, t, rng) { const dh = hgt(b, from.x, from.y) - hgt(b, t.x, t.y); if (rng) return dh > 0.25 ? 1.2 : dh < -0.25 ? 0.85 : 1; return dh > 0.25 ? 1.1 : 1; }
  function layout(u, L) {
    if (u.fm && !ACT.FORMS[u.fm]) u.fm = 'norm'; // 0.79.0 縦隊は廃止
    const m = L.length, fm = u.fm || 'norm'; if (!m) return;
    let sp = TR[u.type].cav ? 2.2 : 1.5; if (fm === 'loose') sp *= 2;
    if (fm === 'wedge') { let k = 0; for (let r = 0; k < m; r++) for (let c = 0; c <= r * 2 && k < m; c++, k++) { L[k].ox = -r * sp; L[k].oy = (c - r) * sp; } return; }
    const cols = Math.max(1, Math.ceil(Math.sqrt(m * ({ line: 7, col: 0.35, square: 1 }[fm] || 2.2))));
    const rows = Math.ceil(m / cols), ox0 = fm === 'square' ? (rows - 1) / 2 * sp : 0;
    L.forEach((s, i) => { const r = Math.floor(i / cols), c = i % cols; s.ox = ox0 - r * sp; s.oy = (c - (cols - 1) / 2) * sp; });
  }
  SIM.actForm = (b, u) => { const A = b.act; if (!A || u.type === 'hero') return; layout(u, A.s.filter((s) => s.g === u.id && s.hp > 0 && !s.gone && !s.hero).sort((p, q) => p.id - q.id)); };
  function place(s, u) { const c = Math.cos(u.af), n = Math.sin(u.af); s.x = u.ax + s.ox * c - s.oy * n; s.y = u.ay + s.ox * n + s.oy * c; s.f = u.af; }

  // ---- 空間の格子（近くの相手をすばやく探す） ----
  const CELL = 6;
  function grid(list) { const g = new Map(); for (const s of list) { const k = Math.floor(s.x / CELL) * 1000 + Math.floor(s.y / CELL); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(s); } return g; }
  function near(g, x, y, r, fn) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = g.get(i * 1000 + j); if (a) for (const s of a) fn(s); }
  }
  function nearestFoe(g, s, r) { let best = null, bd = r; near(g, s.x, s.y, r, (o) => { if (o.side !== s.side && live(o)) { const d = dist(s, o); if (d < bd) { bd = d; best = o; } } }); return best; }

  function damage(b, A, t, d, from, rng) {
    if (!live(t) || (t.hero && t.dash > 0)) return;
    if (t.hero && t.blk && from && angDiff(t.f || 0, ang(t, from)) < 1.3) { d *= 0.15; t.bk = 0.15; } // 0.63.0 防御（正面からの攻撃を大きく減らす）
    const u = A.byG[t.g];
    if (u && u.isAI && !t.hero && from && u.order !== 'rout' && angDiff(t.f || 0, ang(t, from)) < 0.9 && rr() < 0.3) { d *= 0.3; t.bk = 0.15; } // 0.64.0 AIの兵は正面の攻撃をときどき受け止める
    if (u && u.order === 'rout') d *= 1.3;
    if (u && !t.hero) d *= fmod(u, rng ? 'rd' : 'md'); // 0.79.0 隊形の守り
    if (from && from.x != null) { d *= hMul(b, rng && from.p0 ? from.p0 : from, t, rng); if (!rng) d *= mom(from, t); } // 0.80.0 高さ・勢い
    if (t.hero && u && u.da) d /= 1 + u.da * 0.15; // 0.73.8 本人の防具の守り（守り3で約3割減）
    if (from) { const dir = angDiff(t.f || 0, ang(t, from)); if (dir > Math.PI * 2 / 3) d *= 1.5; else if (dir > Math.PI / 3) d *= 1.2; if (u && !t.hero && dir > Math.PI / 3) u.mor -= 0.4; }
    if (from && from.pc && from.wk && from.side !== t.side) (A.xq = A.xq || []).push([from.pc, from.wk, Math.min(d, t.hp) / (t.mh || 1), t, d >= t.hp]); // 0.76.0 本人の技能の経験
    t.hp -= d; t.fl = 0.15;
    if (from && t.hero) { const a = ang(from, t); t.x += Math.cos(a) * 0.3; t.y += Math.sin(a) * 0.3; }
    if (t.hp <= 0) {
      t.hp = 0; A.dead.push({ x: t.x, y: t.y, side: t.side }); A.dc++; if (A.dead.length > 500) A.dead.shift();
      if (t.hero) { for (const v of b.units) if (v.side === t.side && v.type !== 'hero') v.mor -= 25; if (t.pc) SIM.say(t.pc, '本人が深手を負って倒れました！ 兵が動揺しています'); }
      else if (u) u.mor -= (110 / (u.m0 || 1)) * 0.9;
    }
  }
  function melee(b, A, s, t, atk) {
    const T2 = t.hero ? TR.hero : TR[t.type];
    const per = Math.max(0.6, atk * 2.2 - (T2.def || 0) * 0.8);
    damage(b, A, t, per * (0.7 + rr() * 0.6), s);
  }
  // 0.73.9 一振り：向いている方向の reach・arc の中の敵に全員当たる。近い順に ACT.MULTI で減らす。hit(o, k) が実際のダメージ
  const multK = (i) => ACT.MULTI[Math.min(i, ACT.MULTI.length - 1)];
  function swing(g, s, f, W, hit) {
    const hits = [];
    near(g, s.x, s.y, W.reach + 1, (o) => { if (o.side !== s.side && live(o) && dist(s, o) < W.reach + (o.type && TR[o.type].cav ? 0.9 : 0.5) && angDiff(f, ang(s, o)) < W.arc) hits.push(o); });
    hits.sort((a, c) => dist(s, a) - dist(s, c)).forEach((o, i) => { hit(o, multK(i)); const a = ang(s, o); o.x += Math.cos(a) * 0.6; o.y += Math.sin(a) * 0.6; });
    return hits.length;
  }
  const YARI_T = { yari: 1, nagayari: 1, yarigashira: 1, kiba: 1, horo: 1 };
  const cpuWep = (s, close) => (!close && !s.hero && YARI_T[s.type] ? ACT.WEP.yari : ACT.WEP.tachi); // 0.73.9 CPUも本人と同じ刀・槍の範囲

  // ---- 0.64.0 隊のAI（敵の隊と「AIに任せる」にした隊）：u.eo が実際に使う指図 ----
  function aiThink(A, b, u, c, center, all, dt) {
    if ((u.aiT = (u.aiT || 0) - dt) > 0) return; u.aiT = 0.35 + rr() * 0.25;
    if (!u.pref) u.pref = u.order === 'flank' ? 'flank' : 'charge';
    const T = TR[u.type], F = SIM.FIELD;
    let fo = null, fd = 1e9;
    for (const id in center) { const v = A.byG[id]; if (!v || v.side === u.side || v.order === 'rout' || v.order === 'retreat') continue; const d = Math.hypot(center[id].x - c.x, center[id].y - c.y); if (d < fd) { fd = d; fo = center[id]; } }
    for (const s of all) if (s.hero && s.side !== u.side) { const d = Math.hypot(s.x - c.x, s.y - c.y); if (d < fd) { fd = d; fo = s; } }
    u.kite = 0;
    if (!fo) { u.eo = 'hold'; return; }
    const toFoe = Math.atan2(fo.y - c.y, fo.x - c.x);
    const go = (a, k) => { u.eo = 'move'; u.mx = Math.max(2, Math.min(F.w - 2, c.x + Math.cos(a) * k)); u.my = Math.max(2, Math.min(F.h - 2, c.y + Math.sin(a) * k)); };
    const hold = () => { u.eo = 'hold'; u.af = toFoe; };
    // 士気が下がったら、いったん下がって立て直す
    if (u.mor < 32) u.rg = 1; else if (u.mor > 55) u.rg = 0;
    if (u.rg) { if (fd < 30) { go(toFoe + Math.PI, 16); u.kite = 1; } else hold(); return; }
    if (T.ranged) { // 弓・鉄砲：届く距離を保って撃つ。近づかれたら下がる
      const R = T.range + (u.ra || 0);
      if (fd < 9) { go(toFoe + Math.PI, 12); u.kite = 1; } else if (fd > R * 0.95) go(toFoe, fd - R * 0.8); else hold();
      return;
    }
    if (T.cav) { // 騎馬：突撃して、しばらく戦ったら離れて立て直し、また突撃
      if (!u.cst) u.cst = 'charge';
      if (u.cst === 'charge' && fd < 7) { u.cen = u.cen || b.t; if (b.t - u.cen > 4) { u.cst = 'back'; u.cen = 0; u.cbt = b.t; } }
      if (u.cst === 'back') { if (b.t - u.cbt > 3.5 || fd > 26) u.cst = 'charge'; else { go(toFoe + Math.PI, 20); u.kite = 1; return; } }
      u.eo = u.pref; return;
    }
    // 歩兵：遠いうちは仲間の遅れを待って足並みをそろえ、近づいたら突撃（半分は回り込み）
    if (fd > 30) for (const id in center) { const v = A.byG[id]; if (!v || v === u || v.side !== u.side || v.type === 'hero' || TR[v.type].ranged || TR[v.type].cav || v.order === 'rout') continue; if (Math.hypot(center[id].x - fo.x, center[id].y - fo.y) > fd + 15) { hold(); return; } }
    u.eo = u.pref;
  }

  // ---- 1フレームの計算 ----
  const sfx = (s, k) => { if (s && s.pc && s.pc === SIM.localPid) SGK.AUDIO.sfx(k); }; // 音は操っている本人の端末だけ
  const sayAll = (A, m) => A.pids.forEach((q) => SIM.say(q, m));
  SIM.actStep = (w, b, dt) => {
    const A = b.act; if (!A) return;
    const F = SIM.FIELD; b.t += dt;
    const all = A.s.filter(live), g = grid(all);
    const center = {};
    for (const s of all) if (!s.hero) { const c = center[s.g] || (center[s.g] = { x: 0, y: 0, n: 0 }); c.x += s.x; c.y += s.y; c.n++; }
    for (const id in center) { const c = center[id]; c.x /= c.n; c.y /= c.n; }
    const heroes = A.s.filter((s) => s.pc), heroOf = (o) => heroes.find((h) => h.pc === o);
    // 隊ごとの目標
    for (const u of b.units) {
      const c = center[u.id]; if (!c || u.type === 'hero') continue;
      u.isAI = u.order === 'ai' || (u.side === 'B' && u.order !== 'rout' && u.order !== 'retreat');
      if (u.isAI && u.order !== 'rout' && u.order !== 'retreat') aiThink(A, b, u, c, center, all, dt); else { u.eo = null; u.kite = 0; }
      const o = u.eo || u.order;
      if (o === 'charge' || o === 'flank') { // 近い敵の隊へ
        let best = null, bd = 1e9;
        for (const id in center) { const v = A.byG[id]; if (v.side === u.side) continue; const d = Math.hypot(center[id].x - c.x, center[id].y - c.y); if (d < bd) { bd = d; best = center[id]; } }
        if (!best) for (const s of all) if (s.hero && s.side !== u.side) best = s;
        u.tgt = best;
      } else u.tgt = null;
      const hero = heroOf(u.owner || u.cmd);
      if (o === 'follow' && hero && live(hero)) { const hf = hero.f || 0; u.ax += (hero.x - Math.cos(hf) * 6 - u.ax) * Math.min(1, dt * 2); u.ay += (hero.y - Math.sin(hf) * 6 - u.ay) * Math.min(1, dt * 2); u.af = hf; }
      if (o === 'move') { const d = Math.hypot(u.mx - u.ax, u.my - u.ay), sp = TR[u.type].spd * ACT.SPD * fmod(u, 'spd') * dt; if (d > 0.5) { u.af = Math.atan2(u.my - u.ay, u.mx - u.ax); u.ax += ((u.mx - u.ax) / d) * Math.min(d, sp); u.ay += ((u.my - u.ay) / d) * Math.min(d, sp); } else if (u.eo) u.eo = 'hold'; else u.order = 'hold'; }
      if (o === 'hold' && u.ho !== 'hold') { u.ax = c.x; u.ay = c.y; }
      if (o === 'hold' && u.mf != null && !u.isAI) u.af = u.mf; // 0.59.0 決めた向き // 待機を命じた所にとどまる
      u.ho = o;
      // 士気の回復
      if (u.order !== 'rout') { const hn = all.some((s) => s.hero && s.side === u.side && Math.hypot(s.x - c.x, s.y - c.y) < 40); u.mor = Math.min(u.mo || 60, (u.mor || 0) + dt * (hn ? 1.5 : 0.7)); }
    }
    // 本人（プレイヤー）：それぞれの人の入力で動く
    if (A.xq && A.xq.length) { for (const [pc, k, fr, t, kill] of A.xq) { const pl = w.players[pc]; if (pl && SIM.wsFight) SIM.wsFight(pl, k, fr, t, kill); } A.xq = []; }
    for (const hero of heroes) {
      if (!live(hero)) continue;
      const inp = A.inp[hero.pc] || {}; inp.dash = inp.dash || A.dq[hero.pc]; A.dq[hero.pc] = false;
      A.wq = A.wq || {}; A.jq = A.jq || {};
      const pl = w.players[hero.pc], k1 = (SIM.heroKind && SIM.heroKind(pl)) || 'tachi', k2 = SIM.heroKind2 && SIM.heroKind2(pl);
      if (A.wq[hero.pc]) { A.wq[hero.pc] = false; if (k2) { hero.wi = hero.wi ? 0 : 1; hero.cd = Math.max(hero.cd, 0.5); } else SIM.say(hero.pc, '副武器を持っていません（町の武具屋で「副武器に買う」）'); }
      if (A.jq[hero.pc]) { A.jq[hero.pc] = false; if (!(hero.jp > 0)) hero.jp = 0.55; } // 0.64.0 ジャンプ（見た目だけ）
      hero.jp = Math.max(0, (hero.jp || 0) - dt);
      const kk = ACT.WEP[hero.wi && k2 ? k2 : k1] ? (hero.wi && k2 ? k2 : k1) : 'tachi', W0 = ACT.WEP[kk], skk = W0.sk || kk, wf = (key) => (pl && SIM.wsFx ? SIM.wsFx(pl, skk + key) : 0); // 0.76.0 技能の特技
      const W = Object.assign({}, W0, { cd: W0.cd * (1 + wf('Cd')), dmg: W0.dmg * (1 + wf('Atk')) }, W0.reach ? { reach: W0.reach + wf('Reach') } : { shot: W0.shot * (1 + wf('Range')) }); hero.wk = skk;
      hero.wep = W; if (hero.pc === A.pid) A.wep = W;
      hero.cd -= dt; hero.dcd -= dt; hero.dash -= dt; hero.blk = !!inp.blk && hero.dash <= 0;
      let mx = inp.mx || 0, my = inp.my || 0; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
      if (inp.dash && hero.dcd <= 0 && (mx || my)) { hero.dash = ACT.DASH.t; hero.dcd = ACT.DASH.cd; hero.dx = mx; hero.dy = my; }
      const sp = TR.hero.spd * ACT.SPD * 1.1 * (hero.blk ? 0.5 : 1) * (pl && pl.nin ? SIM.NIN.actSpd : 1); // 0.77.0 忍びは速い
      if (hero.dash > 0) { hero.x += hero.dx * sp * ACT.DASH.mul * dt; hero.y += hero.dy * sp * ACT.DASH.mul * dt; }
      else { const tm = terMul(b, hero, mx, my, false); hero.x += mx * sp * tm * dt; hero.y += my * sp * tm * dt; }
      if (inp.aim != null) hero.f = inp.aim; else if (mx || my) hero.f = Math.atan2(my, mx);
      if (inp.atk && !hero.blk && hero.cd <= 0) {
        const pa = A.byG[hero.g], am = (pa && pa.am) || 1, base = TR.hero.atk * am;
        hero.cd = W.cd;
        if (W.shot) { A.pr.push({ x0: hero.x, y0: hero.y, x: hero.x, y: hero.y, vx: Math.cos(hero.f) * W.spd, vy: Math.sin(hero.f) * W.spd, side: hero.side, dmg: base * W.dmg * 0.5, life: W.shot / W.spd, gun: W.spd > 100, src: hero }); sfx(hero, W.spd > 100 ? 'gun' : 'bow'); }
        else {
          hero.sw = { t: W.sw || 0.18, d: W.sw || 0.18, a: hero.f, arc: W.arc, r: W.reach }; sfx(hero, 'slash');
          swing(g, hero, hero.f, W, (o, k) => damage(b, A, o, base * W.dmg * k * (0.8 + rr() * 0.4), hero));
        }
      }
    }
    for (const h of heroes) if (h.sw) { h.sw.t -= dt; if (h.sw.t <= 0) h.sw = null; }
    // 兵
    const foeHeroes = all.filter((s) => s.hero), hc = {}, sideC = {};
    for (const s of all) if (!s.hero) { const q = sideC[s.side] || (sideC[s.side] = { x: 0, y: 0, n: 0 }); q.x += s.x; q.y += s.y; q.n++; }
    for (const k in sideC) { sideC[k].x /= sideC[k].n; sideC[k].y /= sideC[k].n; }
    for (const s of all) {
      if (s.fl) s.fl = Math.max(0, s.fl - dt);
      if (s.pc) continue;
      const u = A.byG[s.g], T = s.hero ? TR.hero : TR[s.type], gen = s.hero && u && !u.owner && !u.cmd, cav = T.cav || gen; // 0.73.8 CPUの武将は騎馬
      const spd = (gen ? TR.kiba.spd : T.spd) * ACT.SPD * (s.hero ? 1 : fmod(u, 'spd')); s.genCav = gen; // 0.80.0 地形の遅さは動くときに terMul で
      s.cd -= dt;
      if (!u) continue;
      if (u.order === 'rout' || u.order === 'retreat') {
        const ex = s.side === 'A' ? -6 : F.w + 6; s.f = s.side === 'A' ? Math.PI : 0; s.x += Math.sign(ex - s.x) * spd * (u.order === 'rout' ? 1.1 : 0.9) * dt;
        if (s.x < 2 || s.x > F.w - 2) s.gone = true;
        continue;
      }
      const o = u.eo || u.order, reach = T.ranged ? T.range + (u.ra || 0) : cpuWep(s).reach; // 0.73.9 近接の間合いは本人の刀・槍と同じ（以前は range×0.4+0.4、騎馬+0.4）
      let look = o === 'charge' || o === 'flank' ? 22 : o === 'follow' ? 8 : Math.max(ACT.ENGAGE, T.ranged ? reach : 0);
      if (u.kite) look = T.ranged ? reach : 3;
      const aiHero = s.hero && !s.pc && (u.side === 'B' || u.order === 'ai'); // 0.64.0 敵の大将は後ろから兵を励まし、近づかれたら戦う
      if (aiHero) look = 7;
      let e = nearestFoe(g, s, T.ranged ? Math.max(look, reach) : look);
      if (T.ranged && u.nofire && e && dist(s, e) >= 5) e = null; // 0.75.0 射撃をやめよ（近づかれたら刀で戦う）
      if (u.isAI && !T.ranged && !s.hero && !u.kite) { // 0.64.0 近くの本人（武将）を何人かで囲んで狙う
        let h = null, hd = 14;
        for (const x of foeHeroes) if (x.side !== s.side && live(x)) { const dd = dist(s, x); if (dd < hd && (hc[x.id] || 0) < 6) { hd = dd; h = x; } }
        if (h && (!e || dist(s, e) > reach || hd < 5)) { e = h; hc[h.id] = (hc[h.id] || 0) + 1; }
      }
      if (u.kite && T.ranged && e && dist(s, e) < 8) e = null; // 下がっている間は撃たずに離れる
      if (!u.isAI && o === 'move') e = null; // 0.73.8 移動の指示は敵にかまわず最優先
      const close = T.ranged && e && dist(s, e) < 5, R = close ? ACT.WEP.tachi.reach : reach; s.kat = close ? 1 : 0; // 0.73.8 弓・鉄砲は近づかれたら刀に持ち替える
      let gx, gy;
      const runCav = T.cav && !s.hero && o !== 'move'; // 0.80.0 騎馬は止まらず駆け抜けて、また突っ込む
      if (runCav && s.pt > 0) {
        s.pt -= dt; gx = s.pass.x; gy = s.pass.y;
        if (Math.hypot(gx - s.x, gy - s.y) < 1.5) s.pt = 0;
        if (e && dist(s, e) <= R && s.cd <= 0) { s.f = ang(s, e); const atk = T.atk * (u.am || 1) * fmod(u, 'ma') * (0.55 + 0.45 * u.mor / 100), CW = cpuWep(s, false); if (!swing(g, s, s.f, CW, (o2, k) => melee(b, A, s, o2, atk * k))) melee(b, A, s, e, atk); s.cd = CW.cd * 2.2 + rr() * 0.6; s.at = performance.now() / 1000; }
        e = null;
      } else if (runCav && e && dist(s, e) <= R + 1.5) {
        const a = s.mv ? s.f : ang(s, e), L = 14 + rr() * 6;
        s.pass = { x: Math.max(3, Math.min(F.w - 3, e.x + Math.cos(a) * L)), y: Math.max(3, Math.min(F.h - 3, e.y + Math.sin(a) * L)) }; s.pt = 3;
        if (s.cd <= 0) { s.f = ang(s, e); const atk = T.atk * (u.am || 1) * fmod(u, 'ma') * (0.55 + 0.45 * u.mor / 100), CW = cpuWep(s, false); if (!swing(g, s, s.f, CW, (o2, k) => melee(b, A, s, o2, atk * k))) melee(b, A, s, e, atk); s.cd = CW.cd * 2.2 + rr() * 0.6; s.at = performance.now() / 1000; }
        gx = s.pass.x; gy = s.pass.y; e = null;
      }
      if (e) {
        const d = dist(s, e);
        if (d <= R) {
          s.f = ang(s, e);
          if (u.isAI && e.hero && !T.ranged && s.cd > 0.6) { s.x -= Math.cos(s.f) * spd * 0.45 * dt; s.y -= Math.sin(s.f) * spd * 0.45 * dt; } // 打ったら少し引いて、振り回しを避ける
          if (s.cd <= 0) {
            if (T.ranged && !close) {
              const sp = s.type === 'teppo' || s.type === 'teppogashira' ? 140 : 45, tt = d / sp, ex = e.x + (rr() - 0.5) * d * 0.12, ey = e.y + (rr() - 0.5) * d * 0.12, a = Math.atan2(ey - s.y, ex - s.x);
              A.pr.push({ L: d, x0: s.x, y0: s.y, x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, side: s.side, dmg: T.atk * (u.am || 1) * fmod(u, 'ra') * (sp > 100 ? 2.6 : 2.2) * (0.55 + 0.45 * u.mor / 100), life: tt * 1.3, gun: sp > 100, src: s });
              s.cd = (sp > 100 ? 4 : 2.4) + rr(); s.at = performance.now() / 1000; // 0.66.0 3Dの射る・撃つ動き
            } else { const atk = T.atk * (u.am || 1) * fmod(u, 'ma') * (close ? 0.8 : 1) * (0.55 + 0.45 * u.mor / 100); const CW = cpuWep(s, close); if (!swing(g, s, s.f, CW, (o, k) => melee(b, A, s, o, atk * k))) melee(b, A, s, e, atk); s.cd = CW.cd * 2.2 + rr() * 0.6; s.at = performance.now() / 1000; } // 0.73.10 武器ごとの振りの速さ（刀1.1秒・槍1.76秒＋ゆらぎ） // 0.73.9 CPUも一振りで範囲の敵全員に
          }
          s.mv = 0;
          continue;
        }
        gx = e.x; gy = e.y;
        if (u.isAI && !T.ranged && d < 10) { const a = ang(e, s) + ((s.id % 5) - 2) * 0.45; gx = e.x + Math.cos(a) * reach * 0.75; gy = e.y + Math.sin(a) * reach * 0.75; } // 0.64.0 散らばって取り囲む
      } else if (gx != null) { /* 0.80.0 駆け抜け中 */ } else if (aiHero) { // 自軍の後ろ
        const sc = sideC[s.side], fc = sideC[s.side === 'A' ? 'B' : 'A'];
        if (sc && fc) { const a = Math.atan2(sc.y - fc.y, sc.x - fc.x); gx = sc.x + Math.cos(a) * 8; gy = sc.y + Math.sin(a) * 8; } else { gx = s.x; gy = s.y; }
      } else if (u.tgt && (o === 'charge' || o === 'flank')) {
        gx = u.tgt.x + s.oy * 0.6 * (o === 'flank' ? 3 : 1); gy = u.tgt.y + s.oy * (o === 'flank' ? 2.5 : 1);
      } else { const c = Math.cos(u.af), n = Math.sin(u.af); gx = u.ax + s.ox * c - s.oy * n; gy = u.ay + s.ox * n + s.oy * c; }
      const d = Math.hypot(gx - s.x, gy - s.y);
      if (d > 0.3) { const st = Math.min(d, spd * terMul(b, s, gx - s.x, gy - s.y, cav) * dt * (d < 2 ? 0.6 : 1)); s.x += ((gx - s.x) / d) * st; s.y += ((gy - s.y) / d) * st; s.f = Math.atan2(gy - s.y, gx - s.x); s.mv = 1; }
      else { s.f = u.af; s.mv = 0; }
    }
    // 0.80.0 走る速さ（勢いの計算に使う）
    if (dt > 0) { const kv = Math.min(1, dt * 6); for (const s of all) { if (s.lx != null) { const vx = (s.x - s.lx) / dt, vy = (s.y - s.ly) / dt; s.vx = s.vx == null ? vx : s.vx + (vx - s.vx) * kv; s.vy = s.vy == null ? vy : s.vy + (vy - s.vy) * kv; s.vel = Math.hypot(s.vx, s.vy); } s.lx = s.x; s.ly = s.y; } }
    // 飛び道具
    for (const p of A.pr) {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt; let hit = null;
      // 0.75.3 弓は山なり（高さ h、頂点は距離の15%。高いうちは敵にも味方にも当たらない）。鉄砲はまっすぐ
      { const f = p.gun || !p.L || p.x0 == null ? 0 : Math.min(1, Math.hypot(nx - p.x0, ny - p.y0) / p.L); p.h = p.gun ? 0 : 4 * p.L * 0.15 * f * (1 - f); }
      if (p.h < 1.8) near(g, nx, ny, 1.5, (o) => { if (!hit && o.side !== p.side && live(o)) { const d = Math.hypot(o.x - nx, o.y - ny); if (d < (o.hero ? 0.9 : 0.7)) hit = o; } });
      p.x = nx; p.y = ny; p.life -= dt;
      if (hit) { damage(b, A, hit, p.dmg * (0.7 + rr() * 0.6), p.x0 != null ? { x: p.x0, y: p.y0, pc: p.src && p.src.pc, wk: p.src && p.src.wk, side: p.side, f: p.src && p.src.f } : p.src, true); p.life = 0; continue; }
      // 0.75.0 木や味方に当たったら消える（自分の隊の中と、撃ってすぐは通り抜ける）
      const sg = p.src && p.src.g, gone = Math.hypot(nx - p.x0, ny - p.y0), far = gone > 2.5;
      if (far && p.h < 1.5) near(g, nx, ny, 1.5, (o) => { if (p.life > 0 && o.side === p.side && o !== p.src && o.g !== sg && live(o) && Math.hypot(o.x - nx, o.y - ny) < (o.hero ? 0.8 : 0.6)) p.life = 0; });
      if (p.life > 0 && A.trees && p.h < 5) for (const F of A.trees) if (Math.hypot(nx - F.x, ny - F.y) < F.r + 1) { for (const t of F.p) if (Math.abs(nx - t[0]) < 0.6 && Math.abs(ny - t[1]) < 0.6) { p.life = 0; break; } if (p.life <= 0) break; }
    }
    A.pr = A.pr.filter((p) => p.life > 0);
    // 押し合い
    for (const s of all) {
      if (!live(s)) continue;
      const r = (o) => (o.hero ? 0.7 : o.type && TR[o.type].cav ? 0.9 : ACT.SOLDIER_R);
      near(g, s.x, s.y, 2, (o) => {
        if (o === s || !live(o) || o.id < s.id) return;
        const d = dist(s, o) || 0.01, m = r(s) + r(o); if (d >= m) return;
        const k = (m - d) / d * 0.5, wa = s.pc ? 0.2 : 1, wb = o.pc ? 0.2 : 1;
        s.x -= (o.x - s.x) * k * wa; s.y -= (o.y - s.y) * k * wa; o.x += (o.x - s.x) * k * wb; o.y += (o.y - s.y) * k * wb;
      });
      s.y = Math.max(1, Math.min(F.h - 1, s.y)); if (!s.gone) s.x = Math.max(1, Math.min(F.w - 1, s.x));
    }
    // 潰走
    for (const u of b.units) {
      if (u.type === 'hero' || u.order === 'rout' || !center[u.id]) continue;
      if (u.mor <= 15) {
        u.order = 'rout';
        for (const v of b.units) if (v !== u && v.side === u.side && v.type !== 'hero' && center[v.id] && Math.hypot(center[v.id].x - center[u.id].x, center[v.id].y - center[u.id].y) < 40) v.mor -= 10;
        sayAll(A, u.side === 'B' ? `敵の${TR[u.type].name}が崩れました！` : u.owner ? `${(w.players[u.owner] || {}).name || ''}の${TR[u.type].name}が崩れて逃げ出しました！` : `味方の${TR[u.type].name}が崩れました！`);
      }
    }
    sync(b, A); b.visA = b.units.filter((u) => u.side === 'B').map((u) => u.id);
    const fightB = A.s.some((s) => s.side === 'B' && live(s) && (s.hero || !['rout', 'retreat'].includes((A.byG[s.g] || {}).order)));
    const bn = b.units.filter((u) => u.side === 'B' && u.hp > 0 && !u.gone).reduce((a, u) => a + u.n, 0);
    if (!b.routed && bn < b.foeN * 0.2) { b.routed = true; b.units.forEach((u) => { if (u.side === 'B') u.order = 'rout'; }); sayAll(A, `${b.foe}が逃げ出しました！`); }
    const aLive = A.s.some((s) => s.side === 'A' && live(s));
    if (!fightB) return SIM._finishBattle(w, b, 'win');
    if (!aLive) return SIM._finishBattle(w, b, A.s.some((s) => s.side === 'A' && s.gone && s.hp > 0) ? 'escape' : 'lose');
  };
  function sync(b, A) { // 兵一人ひとりの体力を、元の部隊（数・体力）に戻す：結果の計算はこれまでどおり
    const acc = {};
    for (const s of A.s) { const a = acc[s.g] || (acc[s.g] = { hp: 0, n: 0, go: 0 }); if (s.hp > 0) { a.hp += s.hp; a.n++; if (s.gone) a.go++; } }
    for (const u of b.units) {
      const a = acc[u.id]; if (!a) continue;
      if (u.type === 'hero') { u.hp = a.hp / ACT.HERO_HP; u.gone = a.n > 0 && a.go === a.n; continue; }
      u.hp = a.hp / ACT.MEN_HP; u.n = a.n ? Math.max(1, Math.round((u.nA || u.n0) * a.n / (u.m0 || 1))) : 0;
      u.gone = a.n > 0 && a.go === a.n;
    }
  }

  // ---- 0.62.0 マルチプレイ：命令と、参加者へ送る戦場の様子 ----
  Object.assign(SIM.commands, {
    actStart(w, p) { const b = w.battles[p.battle]; if (SIM.actCan(w, b)) SIM.actStart(w, b, p.id); },
    actIn(w, p, c) {
      const b = w.battles[p.battle], A = b && b.act; if (!A) return;
      const n = (v) => (Number.isFinite(+v) ? Math.max(-1, Math.min(1, +v)) : 0);
      A.inp[p.id] = { mx: n(c.mx), my: n(c.my), aim: Number.isFinite(+c.aim) && c.aim != null ? +c.aim : null, atk: !!c.atk, blk: !!c.blk };
      if (c.dash) A.dq[p.id] = true;
      if (c.sw) (A.wq = A.wq || {})[p.id] = true;
      if (c.jmp) (A.jq = A.jq || {})[p.id] = true;
    },
  });
  const q10 = (v) => Math.round(v * 10);
  // full = 動かない情報（陣営・隊・兵種・操る人）も送る
  SIM.actSnap = (b, full) => {
    const A = b.act, L = A.s.filter(live), o = { id: b.id, s: [], pr: [], dc: A.dc, dead: A.dead.slice(-40).map((d) => [q10(d.x), q10(d.y), d.side === 'A' ? 0 : 1]) };
    for (const s of L) o.s.push(s.id, q10(s.x), q10(s.y), Math.round((s.f || 0) * 100), Math.round((s.hp / s.mh) * 100), (s.fl ? 1 : 0) | (s.at && performance.now() / 1000 - s.at < 0.3 ? 2 : 0) | (s.kat ? 4 : 0));
    for (const p of A.pr) o.pr.push(q10(p.x), q10(p.y), Math.round(p.vx), Math.round(p.vy), p.gun ? 1 : 0, q10(p.h || 0));
    o.h = A.s.filter((s) => s.pc && live(s)).map((s) => [s.id, s.sw ? [Math.round(s.sw.t * 100), Math.round(s.sw.a * 100), Math.round(s.sw.arc * 100), q10(s.sw.r), Math.round((s.sw.d || 0.18) * 100)] : null, s.wep ? s.wep.name : '', s.blk ? 1 : 0, Math.round((s.jp || 0) * 100)]);
    o.u = b.units.filter((u) => u.hp > 0 && !u.gone).map((u) => [u.id, u.side, u.owner || u.cmd || null, u.type, u.n, u.order, u.idx || 0, u.gname || '']);
    if (full) o.st = A.s.filter(live).map((s) => [s.id, s.side === 'A' ? 0 : 1, s.g, s.type || '', s.hero ? 1 : 0, s.pc || 0]);
    return o;
  };
  // 参加者側：受け取った様子から、描画用の戦場（b と同じ形）を組み立てる
  SIM.actApply = (V, o) => {
    if (!V || V.id !== o.id) V = { id: o.id, units: [], act: { s: [], pr: [], dead: [], byG: {}, dc: 0 }, st: {}, byId: {} };
    const A = V.act;
    if (o.st) for (const [id, side, g, type, hero, pc] of o.st) V.st[id] = { side: side ? 'B' : 'A', g, type: type || undefined, hero, pc: pc || 0 };
    const seen = new Set(), list = [];
    for (let i = 0; i < o.s.length; i += 6) {
      const id = o.s[i], st = V.st[id]; if (!st) continue; seen.add(id);
      let s = V.byId[id]; const tx = o.s[i + 1] / 10, ty = o.s[i + 2] / 10;
      if (!s) s = V.byId[id] = Object.assign({ id, x: tx, y: ty }, st);
      s.tx = tx; s.ty = ty; s.f = o.s[i + 3] / 100; s.hp = o.s[i + 4] / 100; s.mh = 1; s.fl = o.s[i + 5] & 1 ? 0.15 : 0; if (o.s[i + 5] & 2) { const nw = performance.now() / 1000; if (!s.at || nw - s.at > 0.5) s.at = nw; } s.gone = false; s.kat = o.s[i + 5] & 4 ? 1 : 0;
      list.push(s);
    }
    for (const id in V.byId) if (!seen.has(+id)) delete V.byId[id];
    A.s = list; A.pr = [];
    for (let i = 0; i < o.pr.length; i += 6) A.pr.push({ x: o.pr[i] / 10, y: o.pr[i + 1] / 10, vx: o.pr[i + 2], vy: o.pr[i + 3], gun: !!o.pr[i + 4], h: o.pr[i + 5] / 10 });
    const nd = o.dc - A.dc; if (nd > 0) { for (const [x, y, sd] of o.dead.slice(-Math.min(nd, o.dead.length))) A.dead.push({ x: x / 10, y: y / 10, side: sd ? 'B' : 'A' }); if (A.dead.length > 500) A.dead.splice(0, A.dead.length - 500); } A.dc = o.dc;
    for (const [id, sw, wn, bl, jp] of o.h) { const s = V.byId[id]; if (!s) continue; s.wep = { name: wn }; s.blk = !!bl; if (jp && !(s.jp > 0)) s.jp = jp / 100; const was = s.sw; s.sw = sw ? { t: sw[0] / 100, a: sw[1] / 100, arc: sw[2] / 100, r: sw[3] / 10, d: (sw[4] || 18) / 100 } : null; if (sw && !was && s.pc === SIM.localPid) SGK.AUDIO.sfx('slash'); }
    V.units = o.u.map(([id, side, owner, type, n, order, idx, gname]) => ({ id, side, owner, type, n, order, idx, gname: gname || undefined, hp: n > 0 ? 1 : 0, gone: false }));
    A.byG = {}; for (const u of V.units) A.byG[u.id] = u;
    return V;
  };
  // 参加者側：表示をなめらかに。自分の本人は入力ですぐ動かし、ホストの位置へ少しずつ寄せる
  SIM.actSmooth = (V, dt, myPid, inp) => {
    const k = Math.min(1, dt * 10);
    for (const s of V.act.s) {
      if (s.jp > 0) s.jp = Math.max(0, s.jp - dt);
      if (s.pc === myPid && inp) {
        const sp = TR.hero.spd * ACT.SPD * 1.1; let mx = inp.mx || 0, my = inp.my || 0; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
        s.x += mx * sp * dt; s.y += my * sp * dt; const c = Math.min(1, dt * 4); s.x += (s.tx - s.x) * c; s.y += (s.ty - s.y) * c;
        if (Math.hypot(s.tx - s.x, s.ty - s.y) > 6) { s.x = s.tx; s.y = s.ty; }
        if (inp.aim != null) s.f = inp.aim;
      } else { s.x += (s.tx - s.x) * k; s.y += (s.ty - s.y) * k; }
    }
    for (const p of V.act.pr) { p.x += p.vx * dt; p.y += p.vy * dt; }
  };

  // ---- 0.68.0 戦の音：前のフレームとの違い（攻撃・被弾・討死）を見て、聞き手（本人かカメラ）からの距離で鳴らす ----
  let sndA = null, sndDc = 0, heat = 0, sndT = 0;
  function battleSounds(A, hero, myPid) {
    const AU = SGK.AUDIO; if (!AU.at) return;
    const nowT = performance.now() / 1000, dt = Math.min(0.2, nowT - (sndT || nowT)); sndT = nowT;
    if (sndA !== A) { sndA = A; sndDc = A.dc || 0; heat = 0; for (const s of A.s) { s._sa = s.at; s._sf = s.fl; s._sw = !!s.sw; } return; }
    const lx = hero ? hero.x : cam.x, ly = hero ? hero.y : cam.y, X = R.act3dOn && R.act3d && R.act3d.S;
    const pos = (x, y) => {
      const dd = Math.hypot(x - lx, y - ly), v = 1 / (1 + (dd / 14) ** 2);
      let pan = 0;
      if (X) { const p = X(x, y); pan = p[0] < -9000 ? 0 : (p[0] - W / 2) / (W / 2); } else pan = (x - cam.x) * cam.z / (W / 2 || 1);
      return [v, Math.max(-1, Math.min(1, pan)) * 0.8, dd];
    };
    let act = 0;
    for (const s of A.s) {
      if (s.at !== s._sa && s.at) { // 攻撃した
        s._sa = s.at;
        if (s.pc !== myPid) {
          const [v, pan, dd] = pos(s.x, s.y), T = s.hero ? null : TR[s.type];
          if (T && T.ranged) AU.at(s.type === 'teppo' || s.type === 'teppogashira' ? 'gun' : 'bow', s.type === 'yumi' ? v : Math.max(v, 0.25 / (1 + dd / 60)), pan);
          else AU.at('swing', v, pan);
          if (dd < 40) act++;
        }
      }
      const sw = !!s.sw; if (sw && !s._sw && s.pc !== myPid) { const [v, pan] = pos(s.x, s.y); AU.at('swing', v * 1.3, pan); } s._sw = sw; // ほかの人の本人の太刀
      if (s.fl && !s._sf) { // 当たった
        if (s.pc === myPid) AU.at(s.blk ? 'block' : 'hurt', 1, 0);
        else { const [v, pan] = pos(s.x, s.y); AU.at(Math.random() < 0.55 ? 'clash' : 'thud', v, pan); }
      }
      s._sf = s.fl;
    }
    const nd = (A.dc || 0) - sndDc; sndDc = A.dc || 0;
    if (nd > 0) for (const p of A.dead.slice(-Math.min(nd, 4))) { const [v, pan] = pos(p.x, p.y); AU.at('fall', v, pan); }
    heat += (act * 0.06 - heat * 0.8) * Math.min(1, dt * 2 + 0.02);
    AU.din(Math.min(1, heat + (A.s.length > 0 ? 0.08 : 0)));
  }

  // ---- 描画 ----
  const cam = R.acam = { x: 350, y: 230, z: 9 };
  let W = 0, H = 0;
  R.actToWorld = (sx, sy) => (R.act3dOn ? R.act3d.toWorld(sx, sy) : [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]);
  R.drawAction = function (ctx, b, myPid, sel, dt, ter) {
    const A = b.act, cv = ctx.canvas, d = window.devicePixelRatio || 1; W = cv.width / d; H = cv.height / d;
    const hero = A.s.find((s) => s.pc === myPid);
    battleSounds(A, hero, myPid);
    if (hero) { const k = Math.min(1, dt * 6); cam.x += (hero.x - cam.x) * k; cam.y += (hero.y - cam.y) * k; cam.hx = hero.x; cam.hy = hero.y; }
    // 0.63.0 3D表示（three.js）。使えないときはこれまでの2D
    R.act3dOn = !!(R.act3d && R.act3d.draw(b, myPid, sel, dt, ter || b.ter, cam, W, H));
    if (R.act3dOn) return draw3dOverlay(ctx, A, b, hero, myPid, sel);
    const z = cam.z, S = (x, y) => [(x - cam.x) * z + W / 2, (y - cam.y) * z + H / 2];
    ctx.fillStyle = '#6f7d4a'; ctx.fillRect(0, 0, W, H);
    const [fx0, fy0] = S(0, 0), [fx1, fy1] = S(SIM.FIELD.w, SIM.FIELD.h);
    ctx.fillStyle = '#8a9a5b'; ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
    // 地面の目印（格子）
    ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.lineWidth = 1;
    for (let x = Math.floor((cam.x - W / 2 / z) / 10) * 10; x < cam.x + W / 2 / z; x += 10) { const [a] = S(x, 0); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, H); ctx.stroke(); }
    for (let y = Math.floor((cam.y - H / 2 / z) / 10) * 10; y < cam.y + H / 2 / z; y += 10) { const [, c] = S(0, y); ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(W, c); ctx.stroke(); }
    for (const t of b.ter || []) { const [a, c] = S(t.x, t.y); ctx.fillStyle = t.k === 'f' ? 'rgba(40,70,30,.45)' : t.k === 'h' ? 'rgba(150,130,80,.35)' : 'rgba(60,80,110,.4)'; ctx.beginPath(); ctx.arc(a, c, t.r * z, 0, 7); ctx.fill(); }
    // 倒れた者
    for (const p of A.dead) { const [a, c] = S(p.x, p.y); if (a < -5 || c < -5 || a > W + 5 || c > H + 5) continue; ctx.fillStyle = p.side === 'A' ? 'rgba(30,40,70,.45)' : 'rgba(80,25,20,.45)'; ctx.fillRect(a - 0.5 * z, c - 0.2 * z, z, 0.4 * z); }
    const selG = sel;
    for (const s of A.s) {
      if (!live(s)) continue;
      const [a, c] = S(s.x, s.y); if (a < -20 || c < -20 || a > W + 20 || c > H + 20) continue;
      const u = A.byG[s.g], own = u && u.owner === myPid, cav = s.type && TR[s.type].cav, r = (s.hero ? 0.75 : cav ? 0.85 : 0.5) * z;
      let col = s.side === 'B' ? '#b8392c' : own ? '#3a6ea5' : '#5d9ab8';
      if (u && u.order === 'rout') col = s.side === 'B' ? '#d88a7f' : '#9db3c7';
      if (s.pc) col = s.pc === myPid ? '#e8b923' : '#e88a23'; // 自分は黄色、仲間の本人は橙
      if (s.fl) col = '#fff';
      const isSel = own && !s.hero && (u.id === selG || selG === 'all'); ctx.fillStyle = col; ctx.strokeStyle = isSel ? '#ffe680' : 'rgba(0,0,0,.6)'; ctx.lineWidth = isSel ? 2 : 1;
      ctx.beginPath(); ctx.arc(a, c, r, 0, 7); ctx.fill(); ctx.stroke();
      // 向き（槍・弓の印）
      const f = s.f || 0, L = s.hero ? 1.6 : s.type && TR[s.type].ranged ? 0.8 : 1.3;
      ctx.strokeStyle = 'rgba(30,20,10,.85)'; ctx.lineWidth = s.hero ? 2.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(a, c); ctx.lineTo(a + Math.cos(f) * L * z, c + Math.sin(f) * L * z); ctx.stroke();
      if (s.hero) { // 体力
        const fr = s.hp / s.mh; ctx.fillStyle = '#000'; ctx.fillRect(a - 12, c - r - 8, 24, 4); ctx.fillStyle = fr > 0.5 ? '#6c3' : fr > 0.25 ? '#ec3' : '#e33'; ctx.fillRect(a - 12, c - r - 8, 24 * fr, 4);
      }
    }
    // 振り
    for (const h of A.s) if (h.pc && h.sw && live(h)) {
      const [a, c] = S(h.x, h.y), k = h.sw.t / (h.sw.d || 0.18); // 0.73.11 武器ごとの振りの長さ
      ctx.fillStyle = `rgba(255,250,220,${0.45 * k})`; ctx.beginPath(); ctx.moveTo(a, c); ctx.arc(a, c, h.sw.r * z, h.sw.a - h.sw.arc, h.sw.a + h.sw.arc); ctx.closePath(); ctx.fill();
    }
    // 飛び道具
    for (const p of A.pr) { const [a, c] = S(p.x, p.y), l = Math.hypot(p.vx, p.vy) || 1; ctx.strokeStyle = p.gun ? 'rgba(255,240,180,.9)' : 'rgba(40,25,10,.9)'; ctx.lineWidth = p.gun ? 1.5 : 1.2; ctx.beginPath(); ctx.moveTo(a, c); ctx.lineTo(a - (p.vx / l) * (p.gun ? 2.5 : 1.2) * z, c - (p.vy / l) * (p.gun ? 2.5 : 1.2) * z); ctx.stroke(); }
    // 隊の旗（名前と人数・指図）
    const cen = {};
    for (const s of A.s) if (live(s) && !s.hero) { const q = cen[s.g] || (cen[s.g] = { x: 0, y: 0, n: 0 }); q.x += s.x; q.y += s.y; q.n++; }
    const ON = { charge: '突撃', hold: '待機', retreat: '後退', flank: '回り込み', move: '移動', rout: '潰走', follow: '随行' };
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    for (const id in cen) {
      const u = A.byG[id], q = cen[id]; if (!u) continue;
      const [a, c] = S(q.x / q.n, q.y / q.n - 4);
      const own = u.owner === myPid, t = `${own && u.idx ? u.idx + ' ' : ''}${u.gname ? u.gname + '隊・' : ''}${TR[u.type].short || TR[u.type].name} ${u.n}${own || u.side === 'A' ? '［' + (ON[u.order] || '') + '］' : ''}`;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(t).width + 8; ctx.fillRect(a - tw / 2, c - 9, tw, 15);
      ctx.fillStyle = u.side === 'B' ? '#ffb4a8' : own && (u.id === selG || selG === 'all') ? '#ffe680' : '#dfe9f5'; ctx.fillText(t, a, c + 2);
    }
    // 照準
    if (hero && live(hero)) { const [a, c] = S(hero.x + Math.cos(hero.f) * 6, hero.y + Math.sin(hero.f) * 6); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, c, 5, 0, 7); ctx.stroke(); }
    // 0.61.0 コントローラーのカーソル（右スティック）
    const C = R.actCur;
    if (C) {
      const [a, c] = C.p;
      if (C.d) { ctx.strokeStyle = 'rgba(255,230,128,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(C.d[0], C.d[1]); ctx.lineTo(a, c); ctx.stroke(); ctx.beginPath(); ctx.arc(C.d[0], C.d[1], 6, 0, 7); ctx.stroke(); }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a, c); ctx.lineTo(a + 12, c + 4); ctx.lineTo(a + 4, c + 12); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fill();
    }
    // 操作の案内
    const sel0 = sel != null, hx = W - 498, hy = 8; ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(hx, hy, 490, sel0 ? 72 : 56); ctx.fillStyle = '#f4ead0';
    ctx.fillText(`${hero && hero.wep ? hero.wep.name : ''}｜移動 WASD・左スティック　カーソル マウス・右スティック　攻撃 左クリック・RT`, hx + 6, hy + 16);
    ctx.fillText('かわす Space・B　隊を選ぶ：カーソルを合わせてA・LB/RB・1〜9（1=全軍）', hx + 6, hy + 32);
    if (sel0) {
      ctx.fillText('選んだ隊をそこへ：右クリック・LT（押したまま動かすと向き）　Aで何もない所：選択をやめる', hx + 6, hy + 48);
      ctx.fillText('指図：Z突撃 X待機 C後退 V回り込み F随行（X突撃 Y随行 十字↑待機 ↓後退）', hx + 6, hy + 64);
    } else ctx.fillText('隊を選ぶと、移動や指図ができます', hx + 6, hy + 48);
  };

  // ---- 0.63.0 3D表示のときに画面へ重ねるもの（マウント＆ブレイド2風） ----
  const ON3 = { charge: '突撃', hold: '停止', retreat: '退却', flank: '回り込み', move: '移動', rout: '潰走', follow: '随行', ai: 'AI任せ' };
  function draw3dOverlay(ctx, A, b, hero, myPid, sel) {
    const X = R.act3d, S = X.S;
    ctx.clearRect(0, 0, W, H);
    // 隊の旗（名前・人数・指図）
    const cen = {};
    for (const s of A.s) if (live(s) && !s.hero) { const q = cen[s.g] || (cen[s.g] = { x: 0, y: 0, n: 0 }); q.x += s.x; q.y += s.y; q.n++; }
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    for (const id in cen) {
      const u = A.byG[id], q = cen[id]; if (!u) continue;
      const [a, c] = S(q.x / q.n, q.y / q.n, 4.5); if (a < -50 || a > W + 50 || c < -20 || c > H + 20) continue;
      const own = u.owner === myPid || u.cmd === myPid, t = `${own && u.idx ? u.idx - 1 + ' ' : ''}${u.gname ? u.gname + '隊・' : ''}${TR[u.type].short || TR[u.type].name} ${u.n}${own || u.side === 'A' ? '［' + (ON3[u.order] || '') + '］' : ''}`;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; const tw = ctx.measureText(t).width + 8; ctx.fillRect(a - tw / 2, c - 9, tw, 15);
      ctx.fillStyle = u.side === 'B' ? '#ffb4a8' : own && (u.id === sel || sel === 'all') ? '#ffe680' : '#dfe9f5'; ctx.fillText(t, a, c + 2);
    }
    // 仲間の本人の名前
    for (const s of A.s) if (s.pc && s.pc !== myPid && live(s)) { const [a, c] = S(s.x, s.y, 3); ctx.fillStyle = '#ffcf8a'; ctx.fillText('仲間', a, c); }
    // 照準（画面の真ん中）
    const cx = W / 2, cy = H / 2; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    if (R.actPad) { // 0.67.0 照準はコントローラーのときだけ出す
      ctx.beginPath(); ctx.moveTo(cx - 9, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 9, cy); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 9); ctx.stroke();
    }
    // 指図メニューを開いているとき：照準の先の地面に旗印
    const OM = R.ordMenu;
    if (OM) { const [gx, gy] = X.toWorld(cx, cy), [a, c] = S(gx, gy, 0), [, c2] = S(gx, gy, 3); ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a, c); ctx.lineTo(a, c2); ctx.stroke(); ctx.fillStyle = '#ffe070'; ctx.fillRect(a, c2, 14, 9); ctx.beginPath(); ctx.ellipse(a, c, 10, 4, 0, 0, 7); ctx.stroke(); }
    // 体力（左下）
    if (hero) { const fr = Math.max(0, hero.hp / hero.mh); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(16, H - 34, 204, 16); ctx.fillStyle = fr > 0.5 ? '#6c3' : fr > 0.25 ? '#ec3' : '#e33'; ctx.fillRect(18, H - 32, 200 * fr, 12); ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(`${hero.wep ? hero.wep.name : ''}${hero.blk ? '　防御中' : ''}`, 18, H - 40); }
    // 選んでいる隊（下の真ん中）
    const mine = b.units.filter((u) => u.idx && (u.owner === myPid || u.cmd === myPid) && u.hp > 0 && !u.gone).sort((p, q) => p.idx - q.idx);
    ctx.textAlign = 'center'; ctx.font = '13px sans-serif';
    const items = [['0 全軍', sel === 'all' || sel == null], ...mine.map((u) => [`${u.idx - 1} ${TR[u.type].short || TR[u.type].name}${u.n}`, sel === u.id || sel === 'all' || sel == null])];
    let x0 = W / 2 - items.length * 42;
    for (const [t, on] of items) { ctx.fillStyle = on ? 'rgba(90,70,20,.85)' : 'rgba(0,0,0,.55)'; ctx.fillRect(x0, H - 30, 80, 22); ctx.fillStyle = on ? '#ffe680' : '#ccc'; ctx.fillText(t, x0 + 40, H - 14); x0 += 84; }
    // 指図メニュー
    if (OM) {
      const L = R.ordItems || []; ctx.textAlign = 'left'; const bw = 132, x1 = W / 2 - (L.length * (bw + 4)) / 2, y1 = H - 70;
      L.forEach(([k, t], i) => { ctx.fillStyle = 'rgba(20,16,10,.85)'; ctx.fillRect(x1 + i * (bw + 4), y1, bw, 30); ctx.fillStyle = '#ffe070'; ctx.fillText(k, x1 + i * (bw + 4) + 6, y1 + 19); ctx.fillStyle = '#f4ead0'; ctx.fillText(t, x1 + i * (bw + 4) + 30, y1 + 19); });
    }
    // 0.64.0 L2の隊選びホイール
    const WH = R.wheel;
    if (WH && WH.L.length) {
      const n = WH.L.length, r = 120; ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(cx, cy, r + 46, 0, 7); ctx.fill();
      const as = WH.i * Math.PI * 2 / n; if (WH.i >= 0) { ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(as) * (r - 30), cy - Math.cos(as) * (r - 30)); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.font = '14px sans-serif';
      WH.L.forEach(([, t], i) => { const a = i * Math.PI * 2 / n, x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r, on = i === WH.i, tw = ctx.measureText(t).width + 16;
        ctx.fillStyle = on ? 'rgba(120,90,20,.95)' : 'rgba(20,16,10,.85)'; ctx.fillRect(x - tw / 2, y - 14, tw, 28); ctx.strokeStyle = on ? '#ffe070' : '#8a7448'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(x - tw / 2, y - 14, tw, 28);
        ctx.fillStyle = on ? '#fff' : '#f4ead0'; ctx.fillText(t, x, y + 5); });
    }
    // 操作の案内
    ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; const lk = document.pointerLockElement;
    const lines = lk ? ['WASD 移動　マウス 視点　左クリック 攻撃　右クリック 防御　Space 回避　E ジャンプ　Q 武器持ち替え', '0〜9 隊を選ぶ　F1 移動　F2 向き　F3 隊形　F4 射撃　ホイール 寄る・引く　Esc マウスを離す　T 2D表示']
      : ['画面をクリックするとマウスで視点を動かせます（Esc で離す）', 'コントローラー：R1攻撃 L1防御 L2隊選び R2そこへ移動（長押し 隊形） 十字↑突撃↓停止→向き←AI任せ ✕ジャンプ ○回避 △持ち替え □随行'];
    const tw2 = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 12; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(W - tw2 - 8, 8, tw2, 40); ctx.fillStyle = '#f4ead0';
    lines.forEach((t, i) => ctx.fillText(t, W - tw2 - 2, 24 + i * 16));
  }
})();
