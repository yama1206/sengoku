// 0.56.0 アクション戦闘（試作）：自分の武将を直接動かし、兵は一人ひとりが動く。1人で遊んでいるホストだけ
(function () {
  const SIM = SGK.SIM, R = SGK.RENDER, TR = SIM.TROOPS;
  const ACT = SIM.ACT = {
    MAXMEN: 360,     // 戦場に出す兵の上限（多いときは1人が何人分かを受け持つ）
    SQUEEZE: 0.55,   // 両軍の初めの間合いを縮める
    SPD: 1.5,        // 移動の速さの倍率
    HERO_HP: 4,      // 本人の体力の倍率（直接戦うので）
    DASH: { t: 0.22, cd: 1.1, mul: 3.2 },
    WEP: { // 本人の武器：reach 届く距離、arc 振りの幅（片側）、cd 間隔、dmg 威力の倍率、shot 飛び道具
      tachi: { name: '刀', reach: 2.8, arc: 1.05, cd: 0.45, dmg: 5, max: 4 },
      yari: { name: '槍', reach: 3.8, arc: 0.55, cd: 0.6, dmg: 5.5, max: 3 },
      yumi: { name: '弓', shot: 45, cd: 0.8, dmg: 5, spd: 45 },
      teppo: { name: '鉄砲', shot: 60, cd: 2.4, dmg: 14, spd: 140 },
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
    const A = b.act = { pid, k: Math.max(1, Math.ceil(total / ACT.MAXMEN)), s: [], pr: [], fx: [], dead: [], next: 1 };
    for (const u of us) {
      u.x = cx + (u.x - cx) * ACT.SQUEEZE;
      if (u.type === 'hero') {
        if (u.att != null) { const g = b.units.find((x) => x.id === u.att); if (g) g.lead = 0; u.att = null; }
        A.s.push({ id: A.next++, g: u.id, side: u.side, x: u.x - (u.side === 'A' ? 6 : -6), y: u.y, f: u.f, hp: u.hp * ACT.HERO_HP, mh: u.mh * ACT.HERO_HP, hero: 1, pc: u.owner === pid ? 1 : 0, cd: 0, dash: 0, dcd: 0 });
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
    let i = 2; for (const u of b.units) if ((u.owner === pid || u.cmd === pid) && u.type !== 'hero' && u.m0) u.idx = i++;
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
    const u = A.byG[t.g];
    if (u && u.order === 'rout') d *= 1.3;
    if (from) { const dir = angDiff(t.f || 0, ang(t, from)); if (dir > Math.PI * 2 / 3) d *= 1.5; else if (dir > Math.PI / 3) d *= 1.2; if (u && !t.hero && dir > Math.PI / 3) u.mor -= 0.4; }
    t.hp -= d; t.fl = 0.15;
    if (from && t.hero) { const a = ang(from, t); t.x += Math.cos(a) * 0.3; t.y += Math.sin(a) * 0.3; }
    if (t.hp <= 0) {
      t.hp = 0; A.dead.push({ x: t.x, y: t.y, side: t.side }); if (A.dead.length > 500) A.dead.shift();
      if (t.hero) { for (const v of b.units) if (v.side === t.side && v.type !== 'hero') v.mor -= 25; if (t.pc) SIM.say(A.pid, '本人が深手を負って倒れました！ 兵が動揺しています'); }
      else if (u) u.mor -= (110 / (u.m0 || 1)) * 0.9;
    }
  }
  function melee(b, A, s, t, atk) {
    const T2 = t.hero ? TR.hero : TR[t.type];
    const per = Math.max(0.6, atk * 2.2 - (T2.def || 0) * 0.8);
    damage(b, A, t, per * (0.7 + rr() * 0.6), s);
  }

  // ---- 1フレームの計算 ----
  SIM.actStep = (w, b, dt, inp) => {
    const A = b.act; if (!A) return;
    const F = SIM.FIELD; b.t += dt;
    const all = A.s.filter(live), g = grid(all);
    const center = {};
    for (const s of all) if (!s.hero) { const c = center[s.g] || (center[s.g] = { x: 0, y: 0, n: 0 }); c.x += s.x; c.y += s.y; c.n++; }
    for (const id in center) { const c = center[id]; c.x /= c.n; c.y /= c.n; }
    const hero = A.s.find((s) => s.pc);
    // 隊ごとの目標
    for (const u of b.units) {
      const c = center[u.id]; if (!c || u.type === 'hero') continue;
      if (u.order === 'charge' || u.order === 'flank') { // 近い敵の隊へ
        let best = null, bd = 1e9;
        for (const id in center) { const v = A.byG[id]; if (v.side === u.side) continue; const d = Math.hypot(center[id].x - c.x, center[id].y - c.y); if (d < bd) { bd = d; best = center[id]; } }
        if (!best) for (const s of all) if (s.hero && s.side !== u.side) best = s;
        u.tgt = best;
      } else u.tgt = null;
      if (u.order === 'follow' && hero && live(hero)) { const hf = hero.f || 0; u.ax += (hero.x - Math.cos(hf) * 6 - u.ax) * Math.min(1, dt * 2); u.ay += (hero.y - Math.sin(hf) * 6 - u.ay) * Math.min(1, dt * 2); u.af = hf; }
      if (u.order === 'move') { const d = Math.hypot(u.mx - u.ax, u.my - u.ay), sp = TR[u.type].spd * ACT.SPD * dt; if (d > 0.5) { u.af = Math.atan2(u.my - u.ay, u.mx - u.ax); u.ax += ((u.mx - u.ax) / d) * Math.min(d, sp); u.ay += ((u.my - u.ay) / d) * Math.min(d, sp); } else u.order = 'hold'; }
      if (u.order === 'hold' && u.ho !== 'hold') { u.ax = c.x; u.ay = c.y; } // 待機を命じた所にとどまる
      u.ho = u.order;
      // 士気の回復
      if (u.order !== 'rout') { const hn = all.some((s) => s.hero && s.side === u.side && Math.hypot(s.x - c.x, s.y - c.y) < 40); u.mor = Math.min(u.mo || 60, (u.mor || 0) + dt * (hn ? 1.5 : 0.7)); }
    }
    // 本人（プレイヤー）
    if (hero && live(hero)) {
      const W = ACT.WEP[SIM.heroKind ? SIM.heroKind(w.players[A.pid]) || 'tachi' : 'tachi'] || ACT.WEP.tachi;
      A.wep = W;
      hero.cd -= dt; hero.dcd -= dt; hero.dash -= dt;
      let mx = inp.mx || 0, my = inp.my || 0; const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
      if (inp.dash && hero.dcd <= 0 && (mx || my)) { hero.dash = ACT.DASH.t; hero.dcd = ACT.DASH.cd; hero.dx = mx; hero.dy = my; }
      const sp = TR.hero.spd * ACT.SPD * 1.3;
      if (hero.dash > 0) { hero.x += hero.dx * sp * ACT.DASH.mul * dt; hero.y += hero.dy * sp * ACT.DASH.mul * dt; }
      else { hero.x += mx * sp * dt; hero.y += my * sp * dt; }
      if (inp.aim != null) hero.f = inp.aim; else if (mx || my) hero.f = Math.atan2(my, mx);
      if (inp.atk && hero.cd <= 0) {
        const pa = A.byG[hero.g], am = (pa && pa.am) || 1, base = TR.hero.atk * am;
        hero.cd = W.cd;
        if (W.shot) { A.pr.push({ x: hero.x, y: hero.y, vx: Math.cos(hero.f) * W.spd, vy: Math.sin(hero.f) * W.spd, side: hero.side, dmg: base * W.dmg * 0.5, life: W.shot / W.spd, gun: W.spd > 100, src: hero }); SGK.AUDIO.sfx(W.spd > 100 ? 'gun' : 'bow'); }
        else {
          A.sw = { t: 0.18, a: hero.f, arc: W.arc, r: W.reach }; SGK.AUDIO.sfx('slash');
          const hits = [];
          near(g, hero.x, hero.y, W.reach + 1, (o) => { if (o.side !== hero.side && live(o) && dist(hero, o) < W.reach + (o.type && TR[o.type].cav ? 0.9 : 0.5) && angDiff(hero.f, ang(hero, o)) < W.arc) hits.push(o); });
          hits.sort((a, c) => dist(hero, a) - dist(hero, c)).slice(0, W.max).forEach((o) => { damage(b, A, o, base * W.dmg * (0.8 + rr() * 0.4), hero); const a = ang(hero, o); o.x += Math.cos(a) * 0.6; o.y += Math.sin(a) * 0.6; });
          if (hits.length) SGK.AUDIO.sfx('hit');
        }
      }
    }
    if (A.sw) { A.sw.t -= dt; if (A.sw.t <= 0) A.sw = null; }
    // 兵
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
      const reach = T.ranged ? T.range + (u.ra || 0) : (T.range || 2.5) * 0.5 + 0.7;
      const look = u.order === 'charge' || u.order === 'flank' ? 22 : u.order === 'follow' ? 8 : Math.max(ACT.ENGAGE, T.ranged ? reach : 0);
      const e = nearestFoe(g, s, T.ranged ? Math.max(look, reach) : look);
      let gx, gy;
      if (e) {
        const d = dist(s, e);
        if (d <= reach) {
          s.f = ang(s, e);
          if (s.cd <= 0) {
            if (T.ranged && d > 3) {
              const sp = s.type === 'teppo' || s.type === 'teppogashira' ? 140 : 45, tt = d / sp, ex = e.x + (rr() - 0.5) * d * 0.12, ey = e.y + (rr() - 0.5) * d * 0.12, a = Math.atan2(ey - s.y, ex - s.x);
              A.pr.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, side: s.side, dmg: T.atk * (u.am || 1) * (sp > 100 ? 2.6 : 2.2) * (0.55 + 0.45 * u.mor / 100), life: tt * 1.3, gun: sp > 100, src: s });
              s.cd = (sp > 100 ? 4 : 2.4) + rr();
            } else { melee(b, A, s, e, T.atk * (u.am || 1) * (T.ranged ? 0.45 : 1) * (0.55 + 0.45 * u.mor / 100) * (T.cav && s.mv ? 1.3 : 1)); s.cd = 1.1 + rr() * 0.6; }
          }
          s.mv = 0;
          continue;
        }
        gx = e.x; gy = e.y;
      } else if (u.tgt && (u.order === 'charge' || u.order === 'flank')) {
        gx = u.tgt.x + s.oy * 0.6 * (u.order === 'flank' ? 3 : 1); gy = u.tgt.y + s.oy * (u.order === 'flank' ? 2.5 : 1);
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
        SIM.say(A.pid, u.side === 'B' ? `敵の${TR[u.type].name}が崩れました！` : u.owner ? `${TR[u.type].name}が崩れて逃げ出しました！` : `味方の${TR[u.type].name}が崩れました！`);
      }
    }
    sync(b, A); b.visA = b.units.filter((u) => u.side === 'B').map((u) => u.id);
    const fightB = A.s.some((s) => s.side === 'B' && live(s) && (s.hero || !['rout', 'retreat'].includes((A.byG[s.g] || {}).order)));
    const bn = b.units.filter((u) => u.side === 'B' && u.hp > 0 && !u.gone).reduce((a, u) => a + u.n, 0);
    if (!b.routed && bn < b.foeN * 0.2) { b.routed = true; b.units.forEach((u) => { if (u.side === 'B') u.order = 'rout'; }); SIM.say(A.pid, `${b.foe}が逃げ出しました！`); }
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

  // ---- 描画 ----
  const cam = R.acam = { x: 350, y: 230, z: 9 };
  let W = 0, H = 0;
  R.actToWorld = (sx, sy) => [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y];
  R.drawAction = function (ctx, b, myPid, sel, dt) {
    const A = b.act, cv = ctx.canvas, d = window.devicePixelRatio || 1; W = cv.width / d; H = cv.height / d;
    const hero = A.s.find((s) => s.pc);
    if (hero) { const k = Math.min(1, dt * 6); cam.x += (hero.x - cam.x) * k; cam.y += (hero.y - cam.y) * k; }
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
      if (s.pc) col = '#e8b923';
      if (s.fl) col = '#fff';
      ctx.fillStyle = col; ctx.strokeStyle = own && u.id === selG ? '#ffe680' : 'rgba(0,0,0,.6)'; ctx.lineWidth = own && u.id === selG ? 2 : 1;
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
    if (A.sw && hero) {
      const [a, c] = S(hero.x, hero.y), k = A.sw.t / 0.18;
      ctx.fillStyle = `rgba(255,250,220,${0.45 * k})`; ctx.beginPath(); ctx.moveTo(a, c); ctx.arc(a, c, A.sw.r * z, A.sw.a - A.sw.arc, A.sw.a + A.sw.arc); ctx.closePath(); ctx.fill();
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
      ctx.fillStyle = u.side === 'B' ? '#ffb4a8' : own && u.id === selG ? '#ffe680' : '#dfe9f5'; ctx.fillText(t, a, c + 2);
    }
    // 照準
    if (hero && live(hero)) { const [a, c] = S(hero.x + Math.cos(hero.f) * 6, hero.y + Math.sin(hero.f) * 6); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a, c, 5, 0, 7); ctx.stroke(); }
    // 操作の案内
    const hx = W - 478, hy = 8; ctx.textAlign = 'left'; ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(hx, hy, 470, 56); ctx.fillStyle = '#f4ead0';
    ctx.fillText(`${A.wep ? A.wep.name : ''}｜移動 WASD・左スティック　狙う マウス・右スティック　攻撃 左クリック・RT/A`, hx + 6, hy + 16);
    ctx.fillText('かわす Space・B　隊を選ぶ 1〜9（1=全軍）・LB/RB　右クリック：選んだ隊をそこへ', hx + 6, hy + 32);
    ctx.fillText('指図：Z突撃 X待機 C後退 V回り込み F随行（X突撃 Y随行 十字↑待機 ↓後退）', hx + 6, hy + 48);
  };
})();
