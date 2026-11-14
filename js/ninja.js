// 0.77.0 忍びの潜入ミニゲーム（見下ろし）。見張りの視界を避けて目当ての所で工作し、入ってきた所へ戻れば成功、見つかれば失敗
// 城の規模（見張りの数・難しさ）、山城／平城／水城（並び）、改修（建物の多さ）、昼夜（見張りの目の届く距離）で変わる
(function () {
  const NJ = SGK.NINJA = { on: false };
  const W = 900, H = 640;
  let cv, ctx, st, cb, last, keys = new Set(), prevPad = {};
  const rnd = (a, b) => a + Math.random() * (b - a);
  const inR = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;

  function build(k, d) {
    const S = { walls: [], water: [], tg: [], guards: [], folk: [], t: 0, alert: 0, done: 0, need: k === 'rumor' ? 3 : 1, hold: 0, k, d, msg: '' };
    const wall = (x, y, w, h) => S.walls.push({ x, y, w, h, c: 'wall' });
    const house = (x, y, w, h) => S.walls.push({ x, y, w, h, c: 'house' });
    const box = (x, y, w, h, gx, gw, t = 10) => { wall(x, y, w, t); wall(x, y, t, h); wall(x + w - t, y, t, h); wall(x, y + h - t, gx - x, t); wall(gx + gw, y + h - t, x + w - gx - gw, t); };
    // 城下（下の帯）と城
    if (d.ck === 'yama') { // 山城：つづら折りの段
      const rows = 4 + Math.min(2, d.kai >> 1);
      for (let i = 0; i < rows; i++) { const y = 470 - i * 80, gap = i % 2 ? 90 : W - 190; wall(60, y, gap - 60, 12); wall(gap + 100, y, W - 60 - gap - 100, 12); }
      wall(50, 470 - rows * 80 + 40, 12, rows * 80 - 30); wall(W - 62, 470 - rows * 80 + 40, 12, rows * 80 - 30);
    } else { // 平城・水城：外郭と本丸
      box(80, 70, W - 160, 420, W / 2 - 40, 80);
      box(260, 120, W - 520, 200, W / 2 + 60, 70);
      if (d.ck === 'mizu') { S.water.push({ x: 0, y: 490, w: W / 2 - 50, h: 30 }, { x: W / 2 + 50, y: 490, w: W / 2 - 50, h: 30 }); }
    }
    // 建物（改修が進むほど多い）
    for (let i = 0, n = 4 + d.kai * 2; i < n; i++) { const w = rnd(30, 70), h = rnd(25, 50), x = rnd(100, W - 100 - w), y = rnd(100, 440 - h); if (!S.walls.some((r) => x < r.x + r.w + 20 && x + w > r.x - 20 && y < r.y + r.h + 20 && y + h > r.y - 20)) house(x, y, w, h); }
    for (let i = 0; i < 5; i++) house(rnd(40, W - 120), rnd(540, 580), rnd(40, 70), 30); // 城下の家
    // 目当て
    const free = (x, y, m = 18) => x > 20 && x < W - 20 && y > 20 && y < H - 20 && !S.walls.concat(S.water).some((r) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m);
    const spot = (y0, y1) => { for (let i = 0; i < 400; i++) { const x = rnd(60, W - 60), y = rnd(y0, y1); if (free(x, y, 26)) return { x, y }; } return { x: W / 2, y: (y0 + y1) / 2 }; };
    if (k === 'rumor') for (let i = 0; i < 3; i++) { const p = spot(505, 625); S.folk.push({ x: p.x, y: p.y, a: rnd(0, 6), told: 0 }); }
    else S.tg.push(Object.assign(spot(110, k === 'raid' ? 260 : 330), { name: k === 'raid' ? '武器蔵' : '兵糧蔵' }));
    // 見張り：壁にぶつからない直線を行き来する
    const range = (130 + d.lv * 14) * (d.night ? 0.62 : 1), spd = 38 + d.lv * 7;
    const ng = k === 'rumor' ? Math.max(2, Math.ceil(d.guards / 2)) : d.guards;
    for (let i = 0; i < ng; i++) {
      const y0 = k === 'rumor' ? 500 : 90, y1 = k === 'rumor' ? 630 : 470, p = spot(y0, y1), a = Math.random() < 0.5 ? 0 : Math.PI / 2;
      const ext = (dir) => { let l = 0; while (l < 220 && free(p.x + Math.cos(a) * dir * (l + 8), p.y + Math.sin(a) * dir * (l + 8), 12)) l += 8; return l; };
      const l1 = ext(-1), l2 = ext(1);
      S.guards.push({ ax: p.x - Math.cos(a) * l1, ay: p.y - Math.sin(a) * l1, bx: p.x + Math.cos(a) * l2, by: p.y + Math.sin(a) * l2, u: Math.random(), dir: 1, f: a, wait: 0, range, spd, see: 0 });
    }
    S.p = { x: W / 2, y: H - 14, crouch: false };
    S.exit = { x: W / 2 - 60, y: H - 26, w: 120, h: 26 };
    return S;
  }
  const blocked = (S, x, y) => S.walls.some((r) => inR(x, y, r));
  function los(S, a, b) { const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 6); for (let i = 1; i < n; i++) if (blocked(S, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false; return true; }
  function move(S, o, dx, dy, r) {
    const tryAt = (x, y) => !S.walls.concat(S.water).some((q) => x > q.x - r && x < q.x + q.w + r && y > q.y - r && y < q.y + q.h + r) && x > r && x < W - r && y > r && y < H - r;
    if (tryAt(o.x + dx, o.y)) o.x += dx; if (tryAt(o.x, o.y + dy)) o.y += dy;
  }

  function input() {
    let mx = 0, my = 0, act = false, crouch = false, quit = false;
    if (keys.has('a') || keys.has('arrowleft')) mx--; if (keys.has('d') || keys.has('arrowright')) mx++;
    if (keys.has('w') || keys.has('arrowup')) my--; if (keys.has('s') || keys.has('arrowdown')) my++;
    act = keys.has('e') || keys.has(' ') || keys.has('enter'); crouch = keys.has('shift') || keys.has('c'); quit = keys.has('escape');
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.buttons.some((b) => b && b.pressed)) || [...navigator.getGamepads()].find((p) => p) : null;
    if (gp) { const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0; if (Math.hypot(ax, ay) > 0.2) { mx += ax; my += ay; } const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (b(14)) mx--; if (b(15)) mx++; if (b(12)) my--; if (b(13)) my++; act = act || b(0); crouch = crouch || b(4) || b(6) || b(1); quit = quit || (b(9) && !prevPad[9]); prevPad[9] = b(9); }
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    return { mx, my, act, crouch, quit };
  }

  function step(dt) {
    const S = st, I = input(), P = S.p; S.t += dt;
    if (S.end) { S.endT -= dt; if (S.endT <= 0) finish(S.end === 'ok'); return; }
    if (I.quit) { if (S.done < S.need) { finish(null); return; } }
    P.crouch = I.crouch; const sp = P.crouch ? 55 : 120;
    move(S, P, I.mx * sp * dt, I.my * sp * dt, 7);
    // 工作
    let near = null;
    if (S.done < S.need) {
      if (S.k === 'rumor') near = S.folk.find((f) => !f.told && Math.hypot(f.x - P.x, f.y - P.y) < 26);
      else near = S.tg.find((t) => !t.done && Math.hypot(t.x - P.x, t.y - P.y) < 30);
    }
    if (near && I.act) { S.hold += dt; const need = S.k === 'raid' ? 2.5 : S.k === 'sabo' ? 1.8 : 1.1; if (S.hold >= need) { S.hold = 0; if (S.k === 'rumor') near.told = 1; else near.done = 1; S.done++; S.msg = S.done >= S.need ? '果たした！ 入ってきた所（下の緑）へ戻れ' : `噂を流した（${S.done}/${S.need}）`; } } else S.hold = 0;
    if (S.done >= S.need && inR(P.x, P.y, S.exit)) { S.end = 'ok'; S.endT = 1.2; S.msg = '工作に成功した！'; return; }
    // 町人はゆっくり歩く
    for (const f of S.folk) { f.a += rnd(-0.6, 0.6) * dt; move(S, f, Math.cos(f.a) * 15 * dt, Math.sin(f.a) * 15 * dt, 8); if (f.y < 505) f.a = Math.PI / 2; }
    // 見張り
    let seen = false;
    for (const g of S.guards) {
      if (g.wait > 0) { g.wait -= dt; g.f += (g.dir > 0 ? 1 : -1) * dt * 0.9; } // 端で見回す
      else { const L = Math.hypot(g.bx - g.ax, g.by - g.ay) || 1; g.u += g.dir * g.spd * dt / L; if (g.u >= 1 || g.u <= 0) { g.u = Math.max(0, Math.min(1, g.u)); g.dir *= -1; g.wait = rnd(0.8, 2); } g.f = Math.atan2((g.by - g.ay) * g.dir, (g.bx - g.ax) * g.dir); }
      g.x = g.ax + (g.bx - g.ax) * g.u; g.y = g.ay + (g.by - g.ay) * g.u;
      const dx = P.x - g.x, dy = P.y - g.y, d = Math.hypot(dx, dy), R = g.range * (P.crouch ? 0.6 : 1);
      let da = Math.atan2(dy, dx) - g.f; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      g.see = (d < R && Math.abs(da) < 0.55) || d < (P.crouch ? 14 : 28) ? (los(S, g, P) ? 1 - d / (R + 1) * 0.6 : 0) : 0;
      if (g.see) seen = true;
    }
    const mx = Math.max(0, ...S.guards.map((g) => g.see));
    S.alert = seen ? S.alert + dt * (0.9 + mx * 1.6) : Math.max(0, S.alert - dt * 0.35);
    if (S.alert >= 1) { S.end = 'ng'; S.endT = 1.4; S.msg = '見つかった！'; }
  }

  function draw() {
    const S = st, cw = cv.width = innerWidth, ch = cv.height = innerHeight, sc = Math.min(cw / W, (ch - 50) / H), ox = (cw - W * sc) / 2, oy = 40;
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, cw, ch);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
    ctx.fillStyle = S.d.night ? '#2b3326' : '#5d6b45'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = S.d.night ? '#2f3328' : '#7a7458'; ctx.fillRect(0, 500, W, H - 500); // 城下
    ctx.fillStyle = '#3d6e8e'; for (const r of S.water) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(60,160,80,.5)'; ctx.fillRect(S.exit.x, S.exit.y, S.exit.w, S.exit.h);
    for (const g of S.guards) { // 視界の扇
      const R = g.range * (S.p.crouch ? 0.6 : 1); ctx.fillStyle = g.see ? 'rgba(230,60,40,.35)' : 'rgba(250,230,120,.18)';
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.arc(g.x, g.y, R, g.f - 0.55, g.f + 0.55); ctx.closePath(); ctx.fill();
    }
    for (const r of S.walls) { ctx.fillStyle = r.c === 'wall' ? '#d8d2bf' : '#4a3a2a'; ctx.fillRect(r.x, r.y, r.w, r.h); if (r.c === 'wall') { ctx.strokeStyle = '#555'; ctx.strokeRect(r.x, r.y, r.w, r.h); } }
    ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    for (const t of S.tg) { ctx.fillStyle = t.done ? '#c43' : '#e8c040'; ctx.fillRect(t.x - 16, t.y - 12, 32, 24); ctx.fillStyle = '#fff'; ctx.fillText(t.done ? '炎上' : t.name, t.x, t.y - 16); }
    for (const f of S.folk) { ctx.fillStyle = f.told ? '#999' : '#e8c040'; ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, 7); ctx.fill(); if (!f.told) { ctx.fillStyle = '#fff'; ctx.fillText('町人', f.x, f.y - 11); } }
    for (const g of S.guards) { ctx.fillStyle = '#7a2a20'; ctx.beginPath(); ctx.arc(g.x, g.y, 8, 0, 7); ctx.fill(); if (g.see) { ctx.fillStyle = '#ff4'; ctx.fillText('！', g.x, g.y - 12); } }
    const P = S.p; ctx.fillStyle = '#0c0c10'; ctx.strokeStyle = '#9cf'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P.x, P.y, P.crouch ? 6 : 7, 0, 7); ctx.fill(); ctx.stroke();
    if (S.hold > 0) { ctx.strokeStyle = '#ffe070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(P.x, P.y, 14, -1.57, -1.57 + 6.28 * Math.min(1, S.hold / (S.k === 'raid' ? 2.5 : S.k === 'sabo' ? 1.8 : 1.1))); ctx.stroke(); }
    ctx.restore();
    // 上の帯
    ctx.fillStyle = '#f4ead0'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
    const goal = S.k === 'rumor' ? `城下の町人に噂を流す（${S.done}/3）` : S.done ? '下の緑の所へ戻る' : `${S.tg[0].name}に近づいて工作する`;
    ctx.fillText(`${goal}　｜移動 WASD・左スティック　工作 E/Space・A（長押し）　忍び足 Shift・LB/B　退く Esc・START`, 10, 18);
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(10, 24, 200, 10); ctx.fillStyle = S.alert > 0.6 ? '#e33' : '#ec3'; ctx.fillRect(10, 24, 200 * Math.min(1, S.alert), 10);
    if (S.msg) { ctx.textAlign = 'center'; ctx.font = '20px sans-serif'; ctx.fillStyle = S.end === 'ng' ? '#f66' : '#ffe070'; ctx.fillText(S.msg, cw / 2, ch / 2); }
  }

  function loop(t) { if (!NJ.on) return; const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t; step(dt); if (NJ.on) { draw(); requestAnimationFrame(loop); } }
  function finish(ok) { NJ.on = false; cv.style.display = 'none'; keys.clear(); const f = cb; cb = null; if (f) f(ok); }
  const kd = (e) => { if (!NJ.on) return; keys.add(e.key.toLowerCase()); e.preventDefault(); e.stopImmediatePropagation(); };
  const ku = (e) => { if (!NJ.on) return; keys.delete(e.key.toLowerCase()); };
  // k：sabo/raid/rumor、d：難しさ（guards, lv, ck, kai, night）。終わると done(true=成功 / false=失敗 / null=退いた)
  NJ.start = (k, d, done) => {
    if (!cv) { cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;display:none'; document.body.appendChild(cv); ctx = cv.getContext('2d'); addEventListener('keydown', kd, true); addEventListener('keyup', ku, true); }
    st = build(k, d); cb = done; NJ.on = true; keys.clear(); prevPad = { 9: true }; cv.style.display = 'block'; last = performance.now(); requestAnimationFrame(loop);
  };
})();
