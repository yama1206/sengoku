// 0.56.0 アクション戦闘：自分の武将を直接動かし、兵は一人ひとりが動く。0.62.0 正式実装・マルチプレイ対応（ホストが計算し、参加者は入力を送って結果を受け取る）
(function () {
  const SIM = SGK.SIM, R = SGK.RENDER, TR = SIM.TROOPS;
  const ACT = SIM.ACT = {
    MAXMEN: 360,     // 戦場に出す兵の上限（多いときは1人が何人分かを受け持つ）
    SQUEEZE: 0.55,   // 両軍の初めの間合いを縮める
    SPD: 0.9,        // 移動の速さの倍率（0.61.2 1.5→0.9）
    HERO_HP: 2.5,    // 本人の体力の倍率（直接戦うので）0.61.0 4→2.5
    DASH: { t: 0.2, cd: 1.6, mul: 3 },
    WEP: { // 本人の武器：reach 届く距離、arc 振りの幅（片側）、cd 間隔、dmg 威力の倍率、shot 飛び道具
      tachi: { name: '刀', reach: 2.6, arc: 0.95, cd: 0.55, dmg: 2.4, max: 3 }, // 0.61.0 弱めた（以前は dmg5・max4）
      yari: { name: '槍', reach: 3.6, arc: 0.5, cd: 0.7, dmg: 2.7, max: 2 },
      yumi: { name: '弓', shot: 45, cd: 1, dmg: 3, spd: 45 },
      teppo: { name: '鉄砲', shot: 60, cd: 3, dmg: 9, spd: 140 },
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
      const m = Math.max(1, Math.ceil(u.n / A.k)), cols = Math.ceil(Math.sqrt(m * 2.2)), sp = TR[u.type].cav ? 2.2 : 1.5;
      u.m0 = m; u.nA = u.n; u.ax = u.x; u.ay = u.y; u.af = u.f;
      for (let i = 0; i < m; i++) {
        const r = Math.floor(i / cols), c = i % cols, ox = -r * sp, oy = (c - (cols - 1) / 2) * sp;
        const s = { id: A.next++, g: u.id, side: u.side, ox, oy, hp: u.hp / m, mh: u.hp / m, cd: rr() * 1.5, type: u.type };
        place(s, u); A.s.push(s);
      }
    }
    A.byG = {}; for (const u of b.units) A.byG[u.id] = u;
    const ix = {}; for (const u of b.units) { const o = u.owner || u.cmd; if (o && A.pids.includes(o) && u.type !== 'hero' && u.m0) { ix[o] = ix[o] || 2; u.idx = ix[o]++; } }
    for (const q of A.pids) if (q !== pid) SIM.say(q, `${(w.players[pid] || {}).name || '仲間'}が「自分で戦う」にしました。あなたも本人を直接動かせます`);
  };
  function place(s, u) { const c = Math.cos(u.af), n = Math.sin(u.af); s.x = u.ax + s.ox * c - s.oy * n; s.y = u.ay + s.ox * n + s.oy * c; s.f = u.af; }

  // ---- 空間の格子（近くの相手をすばやく探す） ----
  const CELL = 6;
  function grid(list) { const g = new Map(); for (const s of list) { const k = Math.floor(s.x / CELL) * 1000 + Math.floor(s.y / CELL); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(s); } return g; }
  function near(g, x, y, r, fn) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const a = g.get(i * 1000 + j); if (a) for (const s of a) fn(s); }
  }
  function nearestFoe(g, s, r) { let best = null, bd = r; near(g, s.x, s.y, r, (o) => { if (o.side !== s.side && live(o)) { const d = dist(s, o); if (d < bd) { bd = d; best = o; } } }); return best; }

  function damage(b, A, t, d, from) {
    if (!live(t) || (t.hero && t.dash > 0)) return;
    if (t.hero && t.blk && from && angDiff(t.f || 0, ang(t, from)) < 1.3) { d *= 0.15; t.bk = 0.15; } // 0.63.0 防御（正面からの攻撃を大きく減らす）
    const u = A.byG[t.g];
    if (u && u.isAI && !t.hero && from && u.order !== 'rout' && angDiff(t.f || 0, ang(t, from)) < 0.9 && rr() < 0.3) { d *= 0.3; t.bk = 0.15; } // 0.64.0 AIの兵は正面の攻撃をときどき受け止める
    if (u && u.order === 'rout') d *= 1.3;
    if (from) { const dir = angDiff(t.f || 0, ang(t, from)); if (dir > Math.PI * 2 / 3) d *= 1.5; else if (dir > Math.PI / 3) d *= 1.2; if (u && !t.hero && dir > Math.PI / 3) u.mor -= 0.4; }
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
      if (o === 'move') { const d = Math.hypot(u.mx - u.ax, u.my - u.ay), sp = TR[u.type].spd * ACT.SPD * dt; if (d > 0.5) { u.af = Math.atan2(u.my - u.ay, u.mx - u.ax); u.ax += ((u.mx - u.ax) / d) * Math.min(d, sp); u.ay += ((u.my - u.ay) / d) * Math.min(d, sp); } else if (u.eo) u.eo = 'hold'; else u.order = 'hold'; }
      if (o === 'hold' && u.ho !== 'hold') { u.ax = c.x; u.ay = c.y; }
      if (o === 'hold' && u.mf != null && !u.isAI) u.af = u.mf; // 0.59.0 決めた向き // 待機を命じた所にとどまる
      u.ho = o;
      // 士気の回復
      if (u.order !== 'rout') { const hn = all.some((s) => s.hero && s.side === u.side && Math.hypot(s.x - c.x, s.y - c.y) < 40); u.mor = Math.min(u.mo || 60, (u.mor || 0) + dt * (hn ? 1.5 : 0.7)); }
    }
    // 本人（プレイヤー）：それぞれの人の入力で動く
    for (const hero of heroes) {
      if (!live(hero)) continue;
      const inp = A.inp[hero.pc] || {}; inp.dash = inp.dash || A.dq[hero.pc]; A.dq[hero.pc] = false;
      A.wq = A.wq || {}; A.jq = A.jq || {};
      const pl = w.players[hero.pc], k1 = (SIM.heroKind && SIM.heroKind(pl)) || 'tachi', k2 = SIM.heroKind2 && SIM.heroKind2(pl);
      if (A.wq[hero.pc]) { A.wq[hero.pc] = false; if (k2) { hero.wi = hero.wi ? 0 : 1; hero.cd = Math.max(hero.cd, 0.5); } else SIM.say(hero.pc, '副武器を持っていません（町の武具屋で「副武器に買う」）'); }
      if (A.jq[hero.pc]) { A.jq[hero.pc] = false; if (!(hero.jp > 0)) hero.jp = 0.55; } // 0.64.0 ジャンプ（見た目だけ）
      hero.jp = Math.max(0, (hero.jp || 0) - dt);
      const W = ACT.WEP[hero.wi && k2 ? k2 : k1] || ACT.WEP.tachi;
      hero.wep = W; if (hero.pc === A.pid) A.wep = W;
      hero.cd -= dt; hero.dcd -= dt; hero.dash -= dt; hero.blk = !!inp.blk && hero.dash <= 0;
      let mx = inp.mx || 0, my = inp.my || 0; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
      if (inp.dash && hero.dcd <= 0 && (mx || my)) { hero.dash = ACT.DASH.t; hero.dcd = ACT.DASH.cd; hero.dx = mx; hero.dy = my; }
      const sp = TR.hero.spd * ACT.SPD * 1.1 * (hero.blk ? 0.5 : 1);
      if (hero.dash > 0) { hero.x += hero.dx * sp * ACT.DASH.mul * dt; hero.y += hero.dy * sp * ACT.DASH.mul * dt; }
      else { hero.x += mx * sp * dt; hero.y += my * sp * dt; }
      if (inp.aim != null) hero.f = inp.aim; else if (mx || my) hero.f = Math.atan2(my, mx);
      if (inp.atk && !hero.blk && hero.cd <= 0) {
        const pa = A.byG[hero.g], am = (pa && pa.am) || 1, base = TR.hero.atk * am;
        hero.cd = W.cd;
        if (W.shot) { A.pr.push({ x: hero.x, y: hero.y, vx: Math.cos(hero.f) * W.spd, vy: Math.sin(hero.f) * W.spd, side: hero.side, dmg: base * W.dmg * 0.5, life: W.shot / W.spd, gun: W.spd > 100, src: hero }); sfx(hero, W.spd > 100 ? 'gun' : 'bow'); }
        else {
          hero.sw = { t: 0.18, a: hero.f, arc: W.arc, r: W.reach }; sfx(hero, 'slash');
          const hits = [];
          near(g, hero.x, hero.y, W.reach + 1, (o) => { if (o.side !== hero.side && live(o) && dist(hero, o) < W.reach + (o.type && TR[o.type].cav ? 0.9 : 0.5) && angDiff(hero.f, ang(hero, o)) < W.arc) hits.push(o); });
          hits.sort((a, c) => dist(hero, a) - dist(hero, c)).slice(0, W.max).forEach((o) => { damage(b, A, o, base * W.dmg * (0.8 + rr() * 0.4), hero); const a = ang(hero, o); o.x += Math.cos(a) * 0.6; o.y += Math.sin(a) * 0.6; });
          if (hits.length) sfx(hero, 'hit');
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
      const u = A.byG[s.g], T = s.hero ? TR.hero : TR[s.type], spd = T.spd * ACT.SPD;
      s.cd -= dt;
      if (!u) continue;
      if (u.order === 'rout' || u.order === 'retreat') {
        const ex = s.side === 'A' ? -6 : F.w + 6; s.f = s.side === 'A' ? Math.PI : 0; s.x += Math.sign(ex - s.x) * spd * (u.order === 'rout' ? 1.1 : 0.9) * dt;
        if (s.x < 2 || s.x > F.w - 2) s.gone = true;
        continue;
      }
      const o = u.eo || u.order, reach = T.ranged ? T.range + (u.ra || 0) : (T.range || 2.5) * 0.5 + 0.7;
      let look = o === 'charge' || o === 'flank' ? 22 : o === 'follow' ? 8 : Math.max(ACT.ENGAGE, T.ranged ? reach : 0);
      if (u.kite) look = T.ranged ? reach : 3;
      const aiHero = s.hero && !s.pc && (u.side === 'B' || u.order === 'ai'); // 0.64.0 敵の大将は後ろから兵を励まし、近づかれたら戦う
      if (aiHero) look = 7;
      let e = nearestFoe(g, s, T.ranged ? Math.max(look, reach) : look);
      if (u.isAI && !T.ranged && !s.hero && !u.kite) { // 0.64.0 近くの本人（武将）を何人かで囲んで狙う
        let h = null, hd = 14;
        for (const x of foeHeroes) if (x.side !== s.side && live(x)) { const dd = dist(s, x); if (dd < hd && (hc[x.id] || 0) < 6) { hd = dd; h = x; } }
        if (h && (!e || dist(s, e) > reach || hd < 5)) { e = h; hc[h.id] = (hc[h.id] || 0) + 1; }
      }
      if (u.kite && T.ranged && e && dist(s, e) < 8) e = null; // 下がっている間は撃たずに離れる
      let gx, gy;
      if (e) {
        const d = dist(s, e);
        if (d <= reach) {
          s.f = ang(s, e);
          if (u.isAI && e.hero && !T.ranged && s.cd > 0.6) { s.x -= Math.cos(s.f) * spd * 0.45 * dt; s.y -= Math.sin(s.f) * spd * 0.45 * dt; } // 打ったら少し引いて、振り回しを避ける
          if (s.cd <= 0) {
            if (T.ranged && d > 3) {
              const sp = s.type === 'teppo' || s.type === 'teppogashira' ? 140 : 45, tt = d / sp, ex = e.x + (rr() - 0.5) * d * 0.12, ey = e.y + (rr() - 0.5) * d * 0.12, a = Math.atan2(ey - s.y, ex - s.x);
              A.pr.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, side: s.side, dmg: T.atk * (u.am || 1) * (sp > 100 ? 2.6 : 2.2) * (0.55 + 0.45 * u.mor / 100), life: tt * 1.3, gun: sp > 100, src: s });
              s.cd = (sp > 100 ? 4 : 2.4) + rr(); s.at = performance.now() / 1000; // 0.66.0 3Dの射る・撃つ動き
            } else { melee(b, A, s, e, T.atk * (u.am || 1) * (T.ranged ? 0.45 : 1) * (0.55 + 0.45 * u.mor / 100) * (T.cav && s.mv ? 1.3 : 1)); s.cd = 1.1 + rr() * 0.6; s.at = performance.now() / 1000; }
          }
          s.mv = 0;
          continue;
        }
        gx = e.x; gy = e.y;
        if (u.isAI && !T.ranged && d < 10) { const a = ang(e, s) + ((s.id % 5) - 2) * 0.45; gx = e.x + Math.cos(a) * reach * 0.75; gy = e.y + Math.sin(a) * reach * 0.75; } // 0.64.0 散らばって取り囲む
      } else if (aiHero) { // 自軍の後ろ
        const sc = sideC[s.side], fc = sideC[s.side === 'A' ? 'B' : 'A'];
        if (sc && fc) { const a = Math.atan2(sc.y - fc.y, sc.x - fc.x); gx = sc.x + Math.cos(a) * 8; gy = sc.y + Math.sin(a) * 8; } else { gx = s.x; gy = s.y; }
      } else if (u.tgt && (o === 'charge' || o === 'flank')) {
        gx = u.tgt.x + s.oy * 0.6 * (o === 'flank' ? 3 : 1); gy = u.tgt.y + s.oy * (o === 'flank' ? 2.5 : 1);
      } else { const c = Math.cos(u.af), n = Math.sin(u.af); gx = u.ax + s.ox * c - s.oy * n; gy = u.ay + s.ox * n + s.oy * c; }
      const d = Math.hypot(gx - s.x, gy - s.y);
      if (d > 0.3) { const st = Math.min(d, spd * dt * (d < 2 ? 0.6 : 1)); s.x += ((gx - s.x) / d) * st; s.y += ((gy - s.y) / d) * st; s.f = Math.atan2(gy - s.y, gx - s.x); s.mv = 1; }
      else { s.f = u.af; s.mv = 0; }
    }
    // 飛び道具
    for (const p of A.pr) {
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt; let hit = null;
      near(g, nx, ny, 1.5, (o) => { if (!hit && o.side !== p.side && live(o)) { const d = Math.hypot(o.x - nx, o.y - ny); if (d < (o.hero ? 0.9 : 0.7)) hit = o; } });
      p.x = nx; p.y = ny; p.life -= dt;
      if (hit) { damage(b, A, hit, p.dmg * (0.7 + rr() * 0.6), p.src); p.life = 0; }
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
      u.hp = a.hp; u.n = a.n ? Math.max(1, Math.round((u.nA || u.n0) * a.n / (u.m0 || 1))) : 0;
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
    for (const s of L) o.s.push(s.id, q10(s.x), q10(s.y), Math.round((s.f || 0) * 100), Math.round((s.hp / s.mh) * 100), (s.fl ? 1 : 0) | (s.at && performance.now() / 1000 - s.at < 0.3 ? 2 : 0));
    for (const p of A.pr) o.pr.push(q10(p.x), q10(p.y), Math.round(p.vx), Math.round(p.vy), p.gun ? 1 : 0);
    o.h = A.s.filter((s) => s.pc && live(s)).map((s) => [s.id, s.sw ? [Math.round(s.sw.t * 100), Math.round(s.sw.a * 100), Math.round(s.sw.arc * 100), q10(s.sw.r)] : null, s.wep ? s.wep.name : '', s.blk ? 1 : 0, Math.round((s.jp || 0) * 100)]);
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
      s.tx = tx; s.ty = ty; s.f = o.s[i + 3] / 100; s.hp = o.s[i + 4] / 100; s.mh = 1; s.fl = o.s[i + 5] & 1 ? 0.15 : 0; if (o.s[i + 5] & 2) { const nw = performance.now() / 1000; if (!s.at || nw - s.at > 0.5) s.at = nw; } s.gone = false;
      list.push(s);
    }
    for (const id in V.byId) if (!seen.has(+id)) delete V.byId[id];
    A.s = list; A.pr = [];
    for (let i = 0; i < o.pr.length; i += 5) A.pr.push({ x: o.pr[i] / 10, y: o.pr[i + 1] / 10, vx: o.pr[i + 2], vy: o.pr[i + 3], gun: !!o.pr[i + 4] });
    const nd = o.dc - A.dc; if (nd > 0) { for (const [x, y, sd] of o.dead.slice(-Math.min(nd, o.dead.length))) A.dead.push({ x: x / 10, y: y / 10, side: sd ? 'B' : 'A' }); if (A.dead.length > 500) A.dead.splice(0, A.dead.length - 500); } A.dc = o.dc;
    for (const [id, sw, wn, bl, jp] of o.h) { const s = V.byId[id]; if (!s) continue; s.wep = { name: wn }; s.blk = !!bl; if (jp && !(s.jp > 0)) s.jp = jp / 100; const was = s.sw; s.sw = sw ? { t: sw[0] / 100, a: sw[1] / 100, arc: sw[2] / 100, r: sw[3] / 10 } : null; if (sw && !was && s.pc === SIM.localPid) SGK.AUDIO.sfx('slash'); }
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

  // ---- 描画 ----
  const cam = R.acam = { x: 350, y: 230, z: 9 };
  let W = 0, H = 0;
  R.actToWorld = (sx, sy) => (R.act3dOn ? R.act3d.toWorld(sx, sy) : [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]);
  R.drawAction = function (ctx, b, myPid, sel, dt, ter) {
    const A = b.act, cv = ctx.canvas, d = window.devicePixelRatio || 1; W = cv.width / d; H = cv.height / d;
    const hero = A.s.find((s) => s.pc === myPid);
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
      const [a, c] = S(h.x, h.y), k = h.sw.t / 0.18;
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
      const as = WH.i * Math.PI * 2 / n; ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(as) * (r - 30), cy - Math.cos(as) * (r - 30)); ctx.stroke();
      ctx.textAlign = 'center'; ctx.font = '14px sans-serif';
      WH.L.forEach(([, t], i) => { const a = i * Math.PI * 2 / n, x = cx + Math.sin(a) * r, y = cy - Math.cos(a) * r, on = i === WH.i, tw = ctx.measureText(t).width + 16;
        ctx.fillStyle = on ? 'rgba(120,90,20,.95)' : 'rgba(20,16,10,.85)'; ctx.fillRect(x - tw / 2, y - 14, tw, 28); ctx.strokeStyle = on ? '#ffe070' : '#8a7448'; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(x - tw / 2, y - 14, tw, 28);
        ctx.fillStyle = on ? '#fff' : '#f4ead0'; ctx.fillText(t, x, y + 5); });
    }
    // 操作の案内
    ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; const lk = document.pointerLockElement;
    const lines = lk ? ['WASD 移動　マウス 視点　左クリック 攻撃　右クリック 防御　Space 回避　E ジャンプ　Q 武器持ち替え', '0〜9 隊を選ぶ　F1 移動の指図　F2 向きの指図　ホイール 寄る・引く　Esc マウスを離す　T 2D表示']
      : ['画面をクリックするとマウスで視点を動かせます（Esc で離す）', 'コントローラー：R1攻撃 L1防御 L2隊選び R2そこへ移動 十字↑突撃↓停止→向き←AI任せ ✕ジャンプ ○回避 △持ち替え □随行'];
    const tw2 = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 12; ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(W - tw2 - 8, 8, tw2, 40); ctx.fillStyle = '#f4ead0';
    lines.forEach((t, i) => ctx.fillText(t, W - tw2 - 2, 24 + i * 16));
  }
})();
