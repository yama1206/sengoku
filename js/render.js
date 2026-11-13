// 描画（2D見下ろし地図）
(function () {
  const R = SGK.RENDER = {};
  const cam = R.cam = { x: 20, y: 38, scale: 14, follow: true };
  let W = 0, H = 0;
  R.resize = (cv) => { const d = window.devicePixelRatio || 1; W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0); };
  R.toScreen = (x, y) => [(x - cam.x) * cam.scale + W / 2, (y - cam.y) * cam.scale + H / 2];
  R.toWorld = (sx, sy) => [(sx - W / 2) / cam.scale + cam.x, (sy - H / 2) / cam.scale + cam.y];
  R.zoom = (f, sx = W / 2, sy = H / 2) => {
    const [wx, wy] = R.toWorld(sx, sy);
    cam.scale = Math.max(0.5, Math.min(60, cam.scale * f)); // 0.5まで引くと全国が見える
    const [nx, ny] = R.toWorld(sx, sy); cam.x += wx - nx; cam.y += wy - ny;
  };
  R.hitSettlement = (view, sx, sy) => {
    let best = null, bd = 16;
    for (const s of view.settlements) { const [x, y] = R.toScreen(s.x, s.y); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = s; } }
    return best;
  };

  function path(ctx, pts, close) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => { const [a, b] = R.toScreen(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
    if (close) ctx.closePath();
  }

  R.draw = function (ctx, view, disp, myPid, selectedId, marks) {
    const T = SGK.DATA.terrain, B = SGK.DATA.bounds;
    // 枠の色：敵対している勢力は赤、自分の家は金、ほかは墨色
    const myClan = view.myClan, wars = view.wars || [];
    const frameOf = (fid) => !fid || !myClan ? ['#2a2118', 1.5] : fid === myClan ? ['#d9a52a', 2.5] : wars.includes(myClan < fid ? `${myClan}|${fid}` : `${fid}|${myClan}`) ? ['#e0281e', 3] : ['#2a2118', 1.5];
    ctx.fillStyle = '#1a1712'; ctx.fillRect(0, 0, W, H);
    // 陸
    const [x0, y0] = R.toScreen(0, 0), [x1, y1] = R.toScreen(B.w, B.h);
    if (T.lands) { ctx.fillStyle = '#7d9fae'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = '#d8cda6'; for (const l of T.lands) { path(ctx, l.pts, true); ctx.fill(); } }
    else { ctx.fillStyle = '#d8cda6'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    // 海
    ctx.fillStyle = '#7d9fae';
    for (const s of T.seas) { path(ctx, s, true); ctx.fill(); }
    // 山地
    ctx.fillStyle = 'rgba(120,128,82,.45)'; ctx.strokeStyle = 'rgba(80,86,50,.5)'; ctx.lineWidth = 1;
    for (const m of T.mountains || []) { path(ctx, m.pts, true); ctx.fill(); ctx.stroke(); }
    // 山の印（∧）を散らす
    ctx.strokeStyle = 'rgba(70,62,40,.55)'; ctx.lineWidth = 1.2;
    const step = Math.max(4, 28 / cam.scale);
    for (const m of T.mountains || []) {
      let x0m = Infinity, y0m = Infinity, x1m = -Infinity, y1m = -Infinity;
      for (const [x, y] of m.pts) { x0m = Math.min(x0m, x); y0m = Math.min(y0m, y); x1m = Math.max(x1m, x); y1m = Math.max(y1m, y); }
      for (let y = Math.ceil(y0m / step) * step; y < y1m; y += step) for (let x = Math.ceil(x0m / step) * step + ((y / step) % 2 ? step / 2 : 0); x < x1m; x += step) {
        const [a, b] = R.toScreen(x, y);
        if (a < -10 || b < -10 || a > W + 10 || b > H + 10 || !SGK.SIM.pointInPoly(x, y, m.pts)) continue; ctx.beginPath(); ctx.moveTo(a - 5, b + 3); ctx.lineTo(a, b - 4); ctx.lineTo(a + 5, b + 3); ctx.stroke();
      }
    }
    // 街道
    ctx.lineCap = ctx.lineJoin = 'round';
    // 0.40.0 道の格で太さを変える（脇道→街道→大街道の順に重ねる）
    const RW = [0, 1.25, 0.85, 0.5], RD = ['', '#7a5426', '#8a6a3c', '#9a8058'];
    const roads = (T.roads || []).slice().sort((a, b) => (b.rank || 2) - (a.rank || 2));
    for (const r of roads) { const k = r.rank || 2; ctx.strokeStyle = k === 3 ? 'rgba(240,228,190,.6)' : 'rgba(245,232,190,.9)'; ctx.lineWidth = Math.max(k === 1 ? 6 : k === 2 ? 4 : 2.5, cam.scale * RW[k]); path(ctx, r.pts); ctx.stroke(); }
    for (const r of roads) { const k = r.rank || 2; ctx.strokeStyle = RD[k]; ctx.lineWidth = Math.max(k === 1 ? 2.5 : k === 2 ? 1.5 : 1, cam.scale * RW[k] * 0.33); if (k === 3) ctx.setLineDash([4, 3]); path(ctx, r.pts); ctx.stroke(); ctx.setLineDash([]); }
    // 川
    ctx.strokeStyle = '#7d9fae'; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, cam.scale * 0.35);
    for (const r of T.rivers) { path(ctx, r.pts); ctx.stroke(); }
    // 昼夜：夕方・明け方は橙、夜は藍色に沈める
    const day = SGK.SIM.daylight ? SGK.SIM.daylight(view.t || 0) : 1, night = 1 - day;
    if (night > 0) {
      const tw = Math.sin(Math.PI * day); // 薄明のとき 1
      ctx.fillStyle = `rgba(${Math.round(20 + 150 * tw)},${Math.round(28 + 50 * tw)},${Math.round(70 - 30 * tw)},${(0.55 * night + 0.12 * tw).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // 0.40.0 依頼の目標（野盗・行商人など）の印
    for (const [qx, qy] of (marks && marks.pts) || []) { const [x, y] = R.toScreen(qx, qy); ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x + 6, y - 15); ctx.lineTo(x, y - 8); ctx.lineTo(x - 6, y - 15); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    // 自分の目的地の線
    const me = view.players.find((p) => p.id === myPid);
    if (me && me.tx != null) {
      const d = disp[me.id] || me;
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(60,40,20,.7)'; ctx.lineWidth = 2;
      // 残りの道筋（いま向かっている通過点から）
      const rest = me.path && me.path.length ? me.path : [[me.tx, me.ty]];
      path(ctx, [[d.x, d.y], ...rest]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 拠点
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const s of view.settlements) {
      const [x, y] = R.toScreen(s.x, s.y);
      const fr = frameOf(s.owner), zk = Math.max(0.45, Math.min(1, cam.scale / 4)); // 引いたときは印を小さく
      if (cam.scale < 1.5 && s.type === 'village') continue;
      if (s.type === 'castle') SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, 20 * zk, 'sq', fr[0], fr[1]);
      else if (s.type === 'town') SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, 16 * zk, 'ci', fr[0], fr[1]);
      else SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, 11, 'ci', fr[0], Math.min(fr[1], 2));
      if (marks && marks.has(s.id)) { ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 6, y - 17); ctx.lineTo(x, y - 10); ctx.lineTo(x - 6, y - 17); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (s.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.stroke(); }
      if (s.site) { ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.strokeRect(x - 13, y - 13, 26, 26); ctx.setLineDash([]); }
      if (cam.scale < 6 && !s.lord && !s.built && s.type !== 'town' && s.id !== selectedId) continue;
      if (cam.scale < 1.5 && !(view.factions[s.owner] && view.factions[s.owner].leader === s.lord) && s.id !== selectedId) continue; // 全国を見るときは大名の本城だけ // 引いたときは主な拠点の名前だけ
      const label = s.site ? s.name + '（普請中）' : s.name;
      ctx.font = `${s.type === 'castle' ? 'bold 13px' : '12px'} "Hiragino Mincho ProN","Yu Mincho",serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)'; ctx.strokeText(label, x, y + 12);
      ctx.fillStyle = '#2a2118'; ctx.fillText(label, x, y + 12);
    }
    // 視界の外を少し暗く（他の部隊は見えない）
    const meV = view.players.find((p) => p.id === myPid);
    if (meV && view.sr) {
      const d = disp[meV.id] || meV, [cx, cy] = R.toScreen(d.x, d.y), rr = view.sr * cam.scale;
      const gr = ctx.createRadialGradient(cx, cy, rr * 0.85, cx, cy, rr * 1.05);
      gr.addColorStop(0, 'rgba(10,12,24,0)'); gr.addColorStop(1, `rgba(10,12,24,${(0.38 + 0.35 * night).toFixed(3)})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,240,200,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    // NPC
    for (const n of view.npcs) {
      const d = disp[n.id] || n; const [x, y] = R.toScreen(d.x, d.y);
      if (n.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.stroke(); }
      if (n.kind === 'merchant') { ctx.fillStyle = '#7a5a2e'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
      else if (n.kind === 'bandit') {
        ctx.fillStyle = 'rgba(245,238,215,.85)'; ctx.strokeStyle = '#e0281e'; ctx.lineWidth = 3; // 敵対：赤い枠
        ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = n.battle ? '#ff5533' : '#3a1410'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)';
        const t = `野盗 ${n.size || ''}`; ctx.strokeText(t, x, y + 11); ctx.fillStyle = '#5a1a12'; ctx.fillText(t, x, y + 11);
      }
      else if (n.kind === 'army') { // 軍勢：旗印
        const fr = frameOf(n.faction);
        ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 10, y + 9); ctx.lineTo(x - 10, y - 13); ctx.stroke(); // 旗竿
        if (n.battle) { ctx.fillStyle = 'rgba(255,85,51,.55)'; ctx.beginPath(); ctx.arc(x, y - 2, 13, 0, 7); ctx.fill(); }
        SGK.KAMON.badge(ctx, n.faction, view.factions[n.faction], x, y - 2, 18, 'ci', fr[0], fr[1]);
        ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)';
        const t = `軍勢 ${n.size || ''}`; ctx.strokeText(t, x, y + 9); ctx.fillStyle = '#2a2118'; ctx.fillText(t, x, y + 9);
      }
      else if (n.kind === 'ronin') { // 浪人：灰色の笠
        ctx.fillStyle = '#9a948a'; ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)';
        ctx.strokeText('浪人', x, y + 8); ctx.fillStyle = '#2a2118'; ctx.fillText('浪人', x, y + 8);
      }
      else if (n.kind === 'bushou') { // 旅の武将：家紋と名前
        const fr = frameOf(n.faction);
        SGK.KAMON.badge(ctx, n.faction, view.factions[n.faction], x, y, 15, 'ci', fr[0], Math.min(fr[1], 2.5));
        if (n.pname) { ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)'; ctx.strokeText(n.pname, x, y + 9); ctx.fillStyle = '#2a2118'; ctx.fillText(n.pname, x, y + 9); }
      }
      else {
        const fr = frameOf(n.faction); // 巡回の武将：所属の家紋
        SGK.KAMON.badge(ctx, n.faction, view.factions[n.faction], x, y, 13, 'ci', fr[0], Math.min(fr[1], 2.5));
      }
    }
    // プレイヤー
    ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'bottom';
    for (const p of view.players) {
      const d = disp[p.id] || p; const [x, y] = R.toScreen(d.x, d.y);
      const mine = p.id === myPid;
      if (p.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); }
      ctx.fillStyle = mine ? '#f2c14e' : '#e8e8e8'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      const mb = SGK.KAMON.monBadge(ctx, p.mon, x, y, 18, mine ? '#f2c14e' : '#e8e8e8', 2.5); // 0.36.0 家紋を決めていれば紋の印
      if (!mb) { ctx.beginPath(); ctx.arc(x, y, mine ? 7 : 6, 0, 7); ctx.fill(); ctx.stroke(); }
      const ty = y - (mb ? 11 : 9);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(p.name, x, ty);
      ctx.fillStyle = mine ? '#f2c14e' : '#fff'; ctx.fillText(p.name, x, ty);
    }
  };

  // ---- 戦場（リアルタイム戦闘） ----
  // 戦場のカメラ：bcam.x/y が画面の中心（m）、z が拡大率（1 = 横300m・縦200mが入る大きさ）
  R.bcam = { x: 350, y: 230, z: 1 };
  R.battleLayout = (F) => {
    const top = 70, bottom = 70, vh = Math.max(120, H - top - bottom), c = R.bcam;
    c.z = Math.max(0.35, Math.min(3, c.z));
    const sc = Math.max(0.6, Math.min((W - 20) / 300, vh / 200) * c.z);
    const hw = W / 2 / sc, hh = vh / 2 / sc; // 画面に入る半分の幅（m）
    c.x = F.w <= hw * 2 ? F.w / 2 : Math.max(hw - 20, Math.min(F.w - hw + 20, c.x));
    c.y = F.h <= hh * 2 ? F.h / 2 : Math.max(hh - 20, Math.min(F.h - hh + 20, c.y));
    return { sc, ox: W / 2 - c.x * sc, oy: top + vh / 2 - c.y * sc };
  };
  const ORD = { charge: '突', hold: '待', retreat: '退', flank: '回', move: '移', rout: '潰走' };
  let fogCv = null;
  R.drawBattle = function (ctx, bt, disp, myPid, selUnit) {
    const F = SGK.SIM.FIELD, TR = SGK.SIM.TROOPS, L = R.battleLayout(F);
    const sx = (x) => L.ox + x * L.sc, sy = (y) => L.oy + y * L.sc;
    ctx.fillStyle = '#1a1712'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7c8a4f'; ctx.fillRect(sx(0), sy(0), F.w * L.sc, F.h * L.sc);
    // 地形：丘・林
    for (const t of bt.ter || []) if (t.k === 'h') {
      for (let i = 3; i >= 1; i--) { ctx.fillStyle = `rgba(150,130,80,${0.18 + (3 - i) * 0.08})`; ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), (t.r * L.sc * i) / 3, 0, 7); ctx.fill(); }
    }
    // 0.37.0 城：斜面・堀・曲輪
    for (const t of bt.ter || []) if (t.k === 's' || t.k === 'm') {
      ctx.fillStyle = t.k === 'm' ? 'rgba(50,90,130,.85)' : 'rgba(110,85,50,.55)';
      ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), t.r * L.sc, 0, 7); ctx.arc(sx(t.x), sy(t.y), (t.ri || 0) * L.sc, 0, 7, true); ctx.fill();
      if (t.k === 's') { ctx.strokeStyle = 'rgba(70,52,30,.6)'; ctx.lineWidth = 1; for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18, r1 = (t.ri || 0) + 4, r2 = t.r - 4; ctx.beginPath(); ctx.moveTo(sx(t.x + Math.cos(a) * r1), sy(t.y + Math.sin(a) * r1)); ctx.lineTo(sx(t.x + Math.cos(a) * r2), sy(t.y + Math.sin(a) * r2)); ctx.stroke(); } }
    }
    for (const t of bt.ter || []) if (t.k === 'k') {
      ctx.fillStyle = '#b8a77e'; ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), t.r * L.sc, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ece4d0'; ctx.lineWidth = Math.max(2, 3 * L.sc); ctx.stroke(); // 塀
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(sx(t.x) - 9 * L.sc, sy(t.y) - 9 * L.sc, 18 * L.sc, 18 * L.sc); // 櫓
    }
    for (const t of bt.ter || []) if (t.k === 'f') {
      ctx.fillStyle = 'rgba(40,70,35,.85)'; ctx.beginPath(); ctx.arc(sx(t.x), sy(t.y), t.r * L.sc, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(25,50,22,.9)';
      for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = (t.r * 0.6 * ((i % 3) + 1)) / 3; ctx.beginPath(); ctx.arc(sx(t.x + Math.cos(a) * rr), sy(t.y + Math.sin(a) * rr), Math.max(2, L.sc * 2.2), 0, 7); ctx.fill(); }
    }
    // 視界の外は暗く（味方の部隊が見ている範囲だけ明るい）
    if (!fogCv) fogCv = document.createElement('canvas');
    if (fogCv.width !== W || fogCv.height !== H) { fogCv.width = W; fogCv.height = H; }
    const fc = fogCv.getContext('2d');
    fc.globalCompositeOperation = 'source-over'; fc.clearRect(0, 0, W, H);
    fc.fillStyle = 'rgba(10,12,20,.55)'; fc.fillRect(sx(0), sy(0), F.w * L.sc, F.h * L.sc);
    fc.globalCompositeOperation = 'destination-out';
    for (const u of bt.units) if (u[1] === 'A') {
      const d = disp['u' + bt.id + '_' + u[0]] || { x: u[5], y: u[6] };
      const g = fc.createRadialGradient(sx(d.x), sy(d.y), 0, sx(d.x), sy(d.y), u[8] * L.sc);
      g.addColorStop(0.8, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      const fa = u[10] || 0, HALF = Math.PI / 3; // 0.33.0 扇形の視界＋まわり12mの気配
      fc.fillStyle = g; fc.beginPath(); fc.moveTo(sx(d.x), sy(d.y)); fc.arc(sx(d.x), sy(d.y), u[8] * L.sc, fa - HALF, fa + HALF); fc.closePath(); fc.fill();
      fc.fillStyle = 'rgba(0,0,0,.7)'; fc.beginPath(); fc.arc(sx(d.x), sy(d.y), 14 * L.sc, 0, 7); fc.fill();
    }
    ctx.drawImage(fogCv, 0, 0);
    ctx.strokeStyle = '#4b5530'; ctx.lineWidth = 2; ctx.strokeRect(sx(0), sy(0), F.w * L.sc, F.h * L.sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const u of bt.units) {
      const [id, side, owner, type, n, , , order, , mor, face] = u;
      if (type === 'hero' && u[14] != null) continue; // 0.47.0 隊に入っている本人は隊といっしょに描く
      const d = disp['u' + bt.id + '_' + id] || { x: u[5], y: u[6] };
      const col = side === 'B' ? '#a83228' : owner === myPid ? '#f2c14e' : '#e8e8e8';
      const cx = sx(d.x), cy = sy(d.y), T = TR[type];
      const rr = Math.max(6, Math.sqrt(Math.min(n, 36)) * 0.8 * L.sc);
      if (id === selUnit && owner === myPid && u[12] && face != null) { // 0.33.1 選んだ部隊の攻撃範囲（扇形）
        const hf = T && T.ranged ? Math.PI / 4 : Math.PI / 2, R = u[12] * L.sc;
        ctx.fillStyle = 'rgba(255,90,60,.16)'; ctx.strokeStyle = 'rgba(255,120,90,.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, face - hf, face + hf); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      if (id === selUnit && owner === myPid) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(cx, cy, rr + 6, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      // 向き
      if (face != null) { ctx.strokeStyle = side === 'B' ? '#ffb4a2' : '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(face) * (rr + 7), cy + Math.sin(face) * (rr + 7)); ctx.stroke(); }
      if (type === 'hero') {
        ctx.fillStyle = col; ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, L.sc * 1.2), 0, 7); ctx.fill(); ctx.stroke();
      } else {
        const shown = Math.min(n, 36), cols = Math.ceil(Math.sqrt(shown)), gap = 1.4 * L.sc, r = Math.max(1.8, L.sc * 0.5);
        ctx.fillStyle = order === 'rout' ? '#888' : col; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
        for (let i = 0; i < shown; i++) {
          const px = cx + ((i % cols) - (cols - 1) / 2) * gap, py = cy + (Math.floor(i / cols) - (Math.ceil(shown / cols) - 1) / 2) * gap;
          ctx.beginPath();
          if (T.ranged) { ctx.moveTo(px, py - r); ctx.lineTo(px + r, py + r); ctx.lineTo(px - r, py + r); ctx.closePath(); }
          else if (T.cav) { ctx.moveTo(px, py - r * 1.3); ctx.lineTo(px + r * 1.3, py); ctx.lineTo(px, py + r * 1.3); ctx.lineTo(px - r * 1.3, py); ctx.closePath(); }
          else ctx.arc(px, py, r, 0, 7);
          ctx.fill(); ctx.stroke();
        }
      }
      const cls = T.cls ? `〔${SGK.SIM.CLS_NAME[T.cls]}〕` : '';
      const label = `${u[13] ? u[13] + '・' : ''}${u[15] ? (owner === myPid ? '本人＋' : (bt.names[owner] || '味方') + '＋') : ''}${type === 'hero' ? (side === 'A' && owner !== myPid ? (bt.names[owner] || '味方') : '本人') : (T.short || T.name) + cls} ${type === 'hero' ? '' : n}${side === 'A' ? '［' + ORD[order] + '］' : order === 'rout' ? '［潰走］' : ''}`;
      ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      const ly = cy - rr - 4;
      ctx.strokeText(label, cx, ly); ctx.fillStyle = side === 'B' ? '#ffb4a2' : '#fff'; ctx.fillText(label, cx, ly);
      if (type !== 'hero' && mor != null) { // 士気の棒
        const bw = 28; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - bw / 2, cy + rr + 3, bw, 4);
        ctx.fillStyle = mor > 50 ? '#7fc46a' : mor > 25 ? '#e2b94a' : '#d9534f'; ctx.fillRect(cx - bw / 2, cy + rr + 3, (bw * Math.max(0, Math.min(100, mor))) / 100, 4);
      }
    }
  };
  // 戦場の画面座標 → 戦場の座標（m）
  R.battleToField = (px, py) => { const L = R.battleLayout(SGK.SIM.FIELD); return [(px - L.ox) / L.sc, (py - L.oy) / L.sc]; };
})();
