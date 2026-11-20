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

  // 2.51.0 季節：1年（30日×12か月）の日にちから、陸・山・森の色と、雪・桜の量をなめらかに変える。数値はここで調整
  // 並びは 冬・春・夏・秋（中心は 1月中旬・4月中旬・7月中旬・10月中旬）。land＝陸　ml/ms＝山の明るい面/影の面　mo/fo＝遠くの山/森の下絵　ta/tb＝木の色　snow＝山頂の雪の量　tsn＝木に積もる雪　bl＝桜の花
  const SPAL = [
    { land: [226, 232, 224], ml: [196, 204, 198], ms: [150, 162, 162], mo: [196, 202, 196], fo: [150, 168, 150], ta: [92, 108, 92], tb: [110, 124, 108], snow: 1.7, tsn: 0.9, bl: 0 },
    { land: [190, 214, 152], ml: [140, 172, 108], ms: [96, 128, 70], mo: [128, 152, 98], fo: [112, 154, 86], ta: [96, 150, 70], tb: [120, 168, 84], snow: 0.7, tsn: 0, bl: 0.55 },
    { land: [172, 206, 138], ml: [120, 158, 92], ms: [84, 118, 62], mo: [116, 142, 88], fo: [80, 128, 62], ta: [52, 104, 44], tb: [66, 120, 52], snow: 0.2, tsn: 0, bl: 0 },
    { land: [210, 200, 138], ml: [172, 150, 92], ms: [128, 104, 64], mo: [160, 140, 92], fo: [156, 120, 58], ta: [196, 104, 40], tb: [168, 62, 36], snow: 0.6, tsn: 0, bl: 0 },
  ];
  R.season = (t) => {
    const st = SGK.DATA.start; let doy = 105;
    if (t != null) { const total = st.minute + t, di = Math.floor(total / 1440) + (st.month - 1) * 30 + (st.day - 1); doy = (((di % 360) + 360) % 360) + (((total % 1440) + 1440) % 1440) / 1440; }
    const x = (((doy - 15) % 360) + 360) % 360 / 90, i = Math.floor(x) % 4, f = x - Math.floor(x), u = f * f * (3 - 2 * f), A = SPAL[i], B = SPAL[(i + 1) % 4], o = { k: Math.floor(doy / 10) };
    for (const key in A) o[key] = Array.isArray(A[key]) ? A[key].map((v, n) => v + (B[key][n] - v) * u) : A[key] + (B[key] - A[key]) * u;
    return o;
  };
  const rgb = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;

  R.draw = function (ctx, view, disp, myPid, selectedId, marks) {
    const T = SGK.DATA.terrain, B = SGK.DATA.bounds;
    // 枠の色：敵対している勢力は赤、自分の家は金、ほかは墨色
    const myClan = view.myClan, wars = view.wars || [];
    const frameOf = (fid) => !fid || !myClan ? ['#2a2118', 1.5] : fid === myClan ? ['#d9a52a', 2.5] : wars.includes(myClan < fid ? `${myClan}|${fid}` : `${fid}|${myClan}`) ? ['#e0281e', 3] : ['#2a2118', 1.5];
    ctx.fillStyle = '#1a1712'; ctx.fillRect(0, 0, W, H);
    // 陸
    const [x0, y0] = R.toScreen(0, 0), [x1, y1] = R.toScreen(B.w, B.h);
    const SE = R.season(view.t), SEA = '#79aecb', LAND = rgb(SE.land); /* 1.6.47 鳥瞰の絵地図風の色 */
    if (T.lands) { ctx.fillStyle = SEA; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.fillStyle = LAND; for (const l of T.lands) { path(ctx, l.pts, true); ctx.fill(); } }
    else { ctx.fillStyle = LAND; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    // 海
    ctx.fillStyle = SEA;
    for (const s of T.seas) { path(ctx, s, true); ctx.fill(); }
    // 1.6.47 山（通れない）と森（遅い）：マス目から1回だけ下絵を作り、引き伸ばして描く
    const TG = SGK.SIM.terrainGrid && SGK.SIM.terrainGrid();
    if (TG) {
      if (!R.tlay || R.tlay.g !== TG.g || R.tlay.k !== SE.k) {
        const c = document.createElement('canvas'); c.width = TG.gw; c.height = TG.gh; const x = c.getContext('2d'), im = x.createImageData(TG.gw, TG.gh);
        for (let q = 0; q < TG.g.length; q++) { const t = TG.g[q] % 4, o = q * 4; if (t === 2) { im.data[o] = SE.mo[0]; im.data[o + 1] = SE.mo[1]; im.data[o + 2] = SE.mo[2]; im.data[o + 3] = 235; } else if (t === 3) { im.data[o] = SE.fo[0]; im.data[o + 1] = SE.fo[1]; im.data[o + 2] = SE.fo[2]; im.data[o + 3] = 200; } }
        x.putImageData(im, 0, 0); R.tlay = { g: TG.g, c, k: SE.k };
      }
      ctx.imageSmoothingEnabled = true; ctx.drawImage(R.tlay.c, x0, y0, TG.gw * TG.CELL * cam.scale, TG.gh * TG.CELL * cam.scale);
      // 近づいたら山と木を立体の絵で
      const C = TG.CELL, [wa, wb] = R.toWorld(0, 0), [wc, wd] = R.toWorld(W, H);
      const i0 = Math.max(0, Math.floor(wa / C) - 1), i1 = Math.min(TG.gw - 1, Math.ceil(wc / C) + 1), j0 = Math.max(0, Math.floor(wb / C) - 1), j1 = Math.min(TG.gh - 1, Math.ceil(wd / C) + 1);
      const hs = (i, j, k) => { let h = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      const mstep = cam.scale >= 6 ? 1 : cam.scale >= 3 ? 2 : cam.scale >= 1.5 ? 4 : 8, tOn = cam.scale >= 5;
      if ((i1 - i0) * (j1 - j0) / (mstep * mstep) < 40000) for (let j = j0 - (j0 % mstep); j <= j1; j += mstep) for (let i = i0 - (i0 % mstep); i <= i1; i += mstep) {
        const t = TG.g[j * TG.gw + i];
        if (t === 2) { // 山：明るい面と影の面、雪の頂
          const [px, py] = R.toScreen((i + 0.5 + (hs(i, j, 1) - 0.5) * 0.6) * C, (j + 0.5 + (hs(i, j, 2) - 0.5) * 0.6) * C), r = Math.max(5, Math.min(26, C * mstep * cam.scale * 0.6)) * (0.8 + hs(i, j, 3) * 0.4);
          ctx.fillStyle = rgb(SE.ml); ctx.beginPath(); ctx.moveTo(px - r, py + r * 0.5); ctx.lineTo(px, py - r * 1.1); ctx.lineTo(px + r, py + r * 0.5); ctx.closePath(); ctx.fill();
          ctx.fillStyle = rgb(SE.ms); ctx.beginPath(); ctx.moveTo(px, py - r * 1.1); ctx.lineTo(px + r, py + r * 0.5); ctx.lineTo(px + r * 0.25, py + r * 0.5); ctx.closePath(); ctx.fill();
          if (r > 9 && SE.snow > 0.15) { const sf = SE.snow, sy = py - r * 1.1 + r * 0.6 * sf, sw = Math.min(r * 0.9, r * 0.375 * sf); ctx.fillStyle = '#f4f4ee'; ctx.beginPath(); ctx.moveTo(px - sw, sy); ctx.lineTo(px, py - r * 1.1); ctx.lineTo(px + sw, sy); ctx.closePath(); ctx.fill(); } // 雪の頂：冬は大きく、夏はほとんど無い
        } else if (t === 3 && tOn) { // 森：小さな針葉樹を2〜3本
          for (let k = 0; k < 3; k++) { if (k === 2 && hs(i, j, 9) < 0.5) break;
            const [px, py] = R.toScreen((i + 0.2 + hs(i, j, k * 2 + 4) * 0.6) * C, (j + 0.2 + hs(i, j, k * 2 + 5) * 0.6) * C), r = Math.min(9, 2 + cam.scale * 0.35);
            ctx.fillStyle = '#6b4a2b'; ctx.fillRect(px - r * 0.12, py, r * 0.24, r * 0.45);
            ctx.fillStyle = rgb(k % 2 ? SE.ta : SE.tb); ctx.beginPath(); ctx.moveTo(px - r * 0.6, py + r * 0.1); ctx.lineTo(px, py - r * 1.4); ctx.lineTo(px + r * 0.6, py + r * 0.1); ctx.closePath(); ctx.fill();
            if (SE.tsn > 0.05) { ctx.fillStyle = `rgba(250,250,246,${Math.min(0.95, SE.tsn)})`; ctx.beginPath(); ctx.moveTo(px - r * 0.3, py - r * 0.55); ctx.lineTo(px, py - r * 1.4); ctx.lineTo(px + r * 0.3, py - r * 0.55); ctx.closePath(); ctx.fill(); } // 冬：木に雪
            else if (SE.bl > 0.05 && hs(i, j, k + 20) < SE.bl) { ctx.fillStyle = '#f2b6c6'; ctx.beginPath(); ctx.arc(px + r * 0.1, py - r * 0.5, r * 0.45, 0, 7); ctx.fill(); } /* 春：桜（まばらに） */ }
        }
      }
    }
    // 2.10.0 湖（街道や町をまたぐ湖は絵だけ。ほかは海と同じに塗られている）
    ctx.fillStyle = SEA; for (const k of T.lakes || []) if (!k.block) { path(ctx, k.pts, true); ctx.fill(); }
    // 街道
    ctx.lineCap = ctx.lineJoin = 'round';
    // 0.40.0 道の格で太さを変える（脇道→街道→大街道の順に重ねる）
    const RW = [0, 1.25, 0.85, 0.5], RD = ['', '#7a5426', '#8a6a3c', '#9a8058'];
    const roads = (T.roads || []).slice().sort((a, b) => (b.rank || 2) - (a.rank || 2));
    for (const r of roads) { const k = r.rank || 2; ctx.strokeStyle = k === 3 ? 'rgba(240,228,190,.6)' : 'rgba(245,232,190,.9)'; ctx.lineWidth = Math.max(k === 1 ? 6 : k === 2 ? 4 : 2.5, cam.scale * RW[k]); path(ctx, r.pts); ctx.stroke(); }
    for (const r of roads) { const k = r.rank || 2; ctx.strokeStyle = RD[k]; ctx.lineWidth = Math.max(k === 1 ? 2.5 : k === 2 ? 1.5 : 1, cam.scale * RW[k] * 0.33); if (k === 3) ctx.setLineDash([4, 3]); path(ctx, r.pts); ctx.stroke(); ctx.setLineDash([]); }
    // 川
    ctx.strokeStyle = '#3d8fd6'; ctx.lineCap = ctx.lineJoin = 'round'; /* 1.6.70 川を青くはっきり */
    ctx.lineWidth = Math.max(3, cam.scale * 0.45);
    for (const r of T.rivers) { path(ctx, r.pts); ctx.stroke(); }
    // 2.10.0 湖の名前（大きな湖は引いた地図でも、小さな湖は寄ったときに）
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'italic bold 12px "Hiragino Mincho ProN","Yu Mincho",serif'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    for (const k of [...(T.lakes || []), ...(T.lakeLabels || [])]) { if (cam.scale < (k.big ? 0.9 : 3)) continue; const [lx, ly] = R.toScreen(k.c[0], k.c[1]); if (lx < -60 || ly < -20 || lx > W + 60 || ly > H + 20) continue; ctx.strokeStyle = 'rgba(235,245,250,.85)'; ctx.strokeText(k.name, lx, ly); ctx.fillStyle = '#1f4d73'; ctx.fillText(k.name, lx, ly); }
    // 昼夜：夕方・明け方は橙、夜は藍色に沈める
    const day = SGK.SIM.daylight ? SGK.SIM.daylight(view.t || 0) : 1, night = 1 - day;
    if (night > 0) {
      const tw = Math.sin(Math.PI * day); // 薄明のとき 1
      ctx.fillStyle = `rgba(${Math.round(20 + 150 * tw)},${Math.round(28 + 50 * tw)},${Math.round(70 - 30 * tw)},${(0.55 * night + 0.12 * tw).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    // 自分の目的地の線
    const me = view.players.find((p) => p.id === myPid);
    if (me && me.tx != null) {
      const d = disp[me.id] || me;
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(60,40,20,.7)'; ctx.lineWidth = 2;
      // 残りの道筋（いま向かっている通過点から）
      const rest = me.path && me.path.length ? me.path : [[me.tx, me.ty]];
      path(ctx, [[d.x, d.y], ...rest]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 0.52.0 選んだ城と領内の村・町を点線で結ぶ
    if (selectedId && SGK.SIM.ryoOf) {
      const sel = view.settlements.find((x) => x.id === selectedId), cid = sel && (sel.type === 'castle' ? sel.id : SGK.SIM.ryoOf(sel.id)), c = cid && view.settlements.find((x) => x.id === cid);
      if (c) { const [cx, cy] = R.toScreen(c.x, c.y); ctx.strokeStyle = 'rgba(255,240,200,.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
        for (const v of view.settlements) if (SGK.SIM.ryoOf(v.id) === c.id) { const [vx, vy] = R.toScreen(v.x, v.y); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(vx, vy); ctx.stroke(); }
        ctx.setLineDash([]); }
    }
    // 0.52.0 金山・銀山
    if (cam.scale >= 1.5 && SGK.DATA.mines) for (const m of SGK.DATA.mines) {
      const [x, y] = R.toScreen(m.x, m.y);
      ctx.fillStyle = m.k === 'kin' ? '#e8c440' : '#cfd6dc'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 8); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2118'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.k === 'kin' ? '金' : '銀', x, y + 0.5);
      if (cam.scale >= 4) { ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(m.name, x, y + 10); }
    }
    // 拠点
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const s of view.settlements) {
      const [x, y] = R.toScreen(s.x, s.y);
      const fr = frameOf(s.owner), zk = Math.max(0.45, Math.min(1, cam.scale / 4)); // 引いたときは印を小さく
      if (cam.scale < 1.5 && s.type === 'village') continue;
      if (view.myHome && s.id === view.myHome) { // 2.40.0 自宅のある拠点：青緑の光の輪と「家」の札で目立たせる
        const hr = (s.type === 'castle' ? 24 : SGK.DATA.isBig(s) ? 26 : 21) * zk;
        ctx.fillStyle = 'rgba(60,220,190,.28)'; ctx.strokeStyle = '#2fd6b4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, hr, 0, 7); ctx.fill(); ctx.stroke();
      }
      if (s.type === 'castle') SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, 18 * zk, 'shiro', fr[0], fr[1]); // 0.54.7 城は天守の形・町や村は四角（部隊は丸）
      else if (s.type === 'town') SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, (SGK.DATA.isBig(s) ? 20 : 15) * zk, 'sq', fr[0], fr[1]); // 1.6.78 大きな町は印を大きく
      else SGK.KAMON.badge(ctx, s.owner, view.factions[s.owner], x, y, 10, 'sq', fr[0], Math.min(fr[1], 2));
      if (SGK.SIM.minato && SGK.SIM.minato(s) && cam.scale >= 1.5) { // 0.53.0 湊の錨
        const ax = x + 13 * zk, ay = y - 11 * zk, big = SGK.SIM.minato(s) === 2;
        ctx.fillStyle = big ? '#f2c14e' : '#bfe3f2'; ctx.strokeStyle = '#1d3a52'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(ax, ay, 7, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#1d3a52'; ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.moveTo(ax, ay - 4); ctx.lineTo(ax, ay + 4); ctx.moveTo(ax - 3, ay - 2); ctx.lineTo(ax + 3, ay - 2);
        ctx.moveTo(ax - 4, ay + 1); ctx.quadraticCurveTo(ax - 3, ay + 5, ax, ay + 4); ctx.quadraticCurveTo(ax + 3, ay + 5, ax + 4, ay + 1); ctx.stroke();
      }
      { const tk = SGK.DATA.toku(s); if (tk) { const mx = x, my = y - 18; ctx.fillStyle = 'rgba(245,238,215,.92)'; ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(mx, my, 9, 0, 7); ctx.fill(); ctx.stroke(); { const im = SGK.ICON && SGK.ICON.img(SGK.DATA.mk(tk)); if (im) ctx.drawImage(im, mx - 8, my - 8, 16, 16); } ctx.textBaseline = 'top'; /* 2.12.4 特産の印は絵 */ } } // 1.6.77 村の特産の印
      if (view.myHome && s.id === view.myHome) { // 「家」の札
        const hx = x - 14 * zk - 4, hy = y - 12 * zk - 4; ctx.fillStyle = '#2fd6b4'; ctx.strokeStyle = '#0d4a3e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx, hy, 8, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0d3a30'; ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText('家', hx, hy + 0.5); ctx.textBaseline = 'top';
      }
      if (s.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.stroke(); }
      if (s.site) { ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.strokeRect(x - 13, y - 13, 26, 26); ctx.setLineDash([]); }
      if (cam.scale < 6 && !s.lord && !s.built && s.type !== 'town' && s.id !== selectedId) continue;
      if (cam.scale < 1.5 && !SGK.DATA.isBig(s) && !(view.factions[s.owner] && view.factions[s.owner].leader === s.lord) && s.id !== selectedId) continue; // 全国を見るときは大名の本城だけ // 引いたときは主な拠点の名前だけ
      const label = s.site ? s.name + '（普請中）' : s.name;
      ctx.font = `${s.type === 'castle' || SGK.DATA.isBig(s) ? 'bold 13px' : '12px'} "Hiragino Mincho ProN","Yu Mincho",serif`;
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
    // 1.6.6 依頼先のダイヤ印（どの縮尺でも見える・ゆっくり上下する）
    if (marks) {
      const bob = Math.sin((performance.now() / 1000) * 3) * 2.5;
      const dia = (x, y, r) => { ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r * 0.45, y - r * 0.4); ctx.lineTo(x, y); ctx.lineTo(x - r * 0.45, y - r * 0.4); ctx.closePath(); ctx.fill(); };
      for (const s of view.settlements) if (marks.has(s.id)) { const [x, y] = R.toScreen(s.x, s.y); dia(x, y - 30 + bob, 8); }
      for (const [qx, qy] of marks.pts || []) { const [x, y] = R.toScreen(qx, qy); dia(x, y - 24 + bob, 7); }
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
        if (n.pname && cam.scale >= 3) { const t = n.pname + '隊'; ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)'; ctx.strokeText(t, x, y + 8); ctx.fillStyle = '#2a2118'; ctx.fillText(t, x, y + 8); } // 0.53.5 見回りの隊にも大将の名前
      }
    }
    // 1.6.51 合戦の印（味方が戦っている所。視界の外でも出す。近くの戦闘中の部隊にも赤い輪）
    for (const n of view.npcs) if (n.battle === 1 && n.kind !== 'bandit' && n.kind !== 'army') { const d = disp[n.id] || n, [x, y] = R.toScreen(d.x, d.y); ctx.strokeStyle = '#ff5533'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke(); }
    if (view.bm && view.bm.length) {
      const pul = 0.5 + 0.5 * Math.sin(performance.now() / 250);
      for (const [bx, by, foe, who] of view.bm) {
        const [x, y] = R.toScreen(bx, by);
        ctx.strokeStyle = `rgba(255,70,40,${(0.5 + 0.5 * pul).toFixed(2)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 16 + pul * 4, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#ffdd88'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 7, y - 7); ctx.lineTo(x + 7, y + 7); ctx.moveTo(x + 7, y - 7); ctx.lineTo(x - 7, y + 7); ctx.stroke();
        const t = `合戦：${who}（${foe}）`; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,.85)'; ctx.strokeText(t, x, y + 21); ctx.fillStyle = '#ffb090'; ctx.fillText(t, x, y + 21);
      }
    }
    // 0.73.4 部隊の移動の速さ（km/日）を印の上に。こちらより速いと赤、遅いと緑
    if (cam.scale >= 2) {
      const mS = meV && meV.spd; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3;
      for (const n of view.npcs) {
        if (!n.spd || n.at) continue; const d = disp[n.id] || n; const [x, y] = R.toScreen(d.x, d.y);
        const t = (mS ? (n.spd > mS * 1.05 ? '▲' : n.spd < mS * 0.95 ? '▼' : '＝') : '') + n.spd + 'km/日';
        ctx.strokeStyle = 'rgba(20,16,12,.8)'; ctx.strokeText(t, x, y - (n.kind === 'army' ? 16 : 11));
        ctx.fillStyle = !mS ? '#eee' : n.spd > mS * 1.05 ? '#ff9a80' : n.spd < mS * 0.95 ? '#9be08f' : '#eee'; ctx.fillText(t, x, y - (n.kind === 'army' ? 16 : 11));
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
  const ORD = { charge: '突', guard: '防', hold: '待', retreat: '退', flank: '回', move: '移', follow: '追', rout: '潰走' };
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
    // 0.37.0 城：斜面・堀・曲輪・塀・門・天守（2.12.0 城のパーツ（nawa.js）から）
    const NW = SGK.SIM.nawa ? SGK.SIM.nawa(bt.ter) : null;
    if (NW) {
      const COL = { k: '#b8a77e', m: 'rgba(50,90,130,.85)', d: 'rgba(95,78,50,.75)', s: 'rgba(110,85,50,.55)', b: '#9a8660', r: '#a8956a', l: '#7c8a4f' };
      if (NW.hg) { // 2.12.0 山の高さ：明るさのむら（左上から光）と等高線
        if (!NW.shade) { const c = document.createElement('canvas'); c.width = NW.W; c.height = NW.H; const g2 = c.getContext('2d'), im = g2.createImageData(NW.W, NW.H); for (let j = 0; j < NW.H; j++) for (let i = 0; i < NW.W; i++) { const k = j * NW.W + i, h = NW.hg[k], hx = NW.hg[j * NW.W + Math.min(NW.W - 1, i + 1)] - h, hy = NW.hg[Math.min(NW.H - 1, j + 1) * NW.W + i] - h, l = -(hx + hy) * 0.35, ct = Math.abs((h / 8) % 1 - 0.5) > 0.46 ? 1 : 0; im.data[k * 4] = l > 0 ? 255 : 30; im.data[k * 4 + 1] = l > 0 ? 250 : 25; im.data[k * 4 + 2] = l > 0 ? 220 : 10; im.data[k * 4 + 3] = Math.min(200, Math.abs(l) * 255 + ct * 60 + (h > 1 ? 15 : 0)); } g2.putImageData(im, 0, 0); NW.shade = c; }
        ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(NW.shade, sx(NW.x0), sy(NW.y0), NW.W * 2 * L.sc, NW.H * 2 * L.sc); ctx.restore();
      }
      const shp = (q) => { ctx.beginPath();
        if (q[0] === 'o') { ctx.arc(sx(q[1]), sy(q[2]), q[3] * L.sc, 0, 7); if (q[4]) { ctx.moveTo(sx(q[1]) + q[4] * L.sc, sy(q[2])); ctx.arc(sx(q[1]), sy(q[2]), q[4] * L.sc, 0, 7, true); } }
        else if (q[0] === 'q') { ctx.arc(sx(q[1]), sy(q[2]), q[4] * L.sc, q[5], q[5] + q[6]); ctx.arc(sx(q[1]), sy(q[2]), q[3] * L.sc, q[5] + q[6], q[5], true); ctx.closePath(); }
        else { const rings = q[0] === 'P' ? q.slice(1) : [q.slice(1)]; for (const rg of rings) { for (let i = 0; i < rg.length; i += 2) { if (i === 0) ctx.moveTo(sx(rg[i]), sy(rg[i + 1])); else ctx.lineTo(sx(rg[i]), sy(rg[i + 1])); } ctx.closePath(); } } };
      for (const [k, q] of NW.A) if (COL[k]) { ctx.fillStyle = COL[k]; shp(q); ctx.fill('evenodd'); }
      for (const [stl, col, lw] of [['i', '#ece4d0', 1.6], ['d', '#c9c2a0', 1.6], ['k', '#6b5236', 1.0]]) { ctx.strokeStyle = col; ctx.lineWidth = Math.max(stl === 'k' ? 1.5 : 2, lw * L.sc); ctx.setLineDash(stl === 'k' ? [3, 2] : []); ctx.beginPath(); for (const g of NW.segs) if ((g.st || 'i') === stl) { ctx.moveTo(sx(g.x1), sy(g.y1)); ctx.lineTo(sx(g.x2), sy(g.y2)); } ctx.stroke(); } ctx.setLineDash([]); // 1.6.25 塀（2.12.0 石垣・土塁・柵）
      { const gt = bt.act && bt.act.gt; ctx.save(); for (const gp of SGK.SIM.gatePts(NW)) { const k = Math.cos(gp.a + Math.PI / 2), n = Math.sin(gp.a + Math.PI / 2), op = gt && !(gt[gp.id] > 0); ctx.strokeStyle = op ? 'rgba(90,60,40,.5)' : '#6b4a2e'; ctx.lineWidth = Math.max(3, 1.4 * L.sc); ctx.setLineDash(op ? [3, 3] : []); ctx.beginPath(); ctx.moveTo(sx(gp.x - k * gp.w / 2), sy(gp.y - n * gp.w / 2)); ctx.lineTo(sx(gp.x + k * gp.w / 2), sy(gp.y + n * gp.w / 2)); ctx.stroke(); } ctx.restore(); } /* 1.6.38 門（破られたら点線） */
      for (const tw of NW.towers) if (tw[0] === 'T') { ctx.fillStyle = '#4a3a2a'; ctx.fillRect(sx(tw[1]) - 7 * L.sc, sy(tw[2]) - 7 * L.sc, 14 * L.sc, 14 * L.sc); } // 天守
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
    if (W > 0 && H > 0) ctx.drawImage(fogCv, 0, 0); // 2.22.0 画面の大きさが0の時（隠れている時）は描かない
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
