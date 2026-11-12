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
    cam.scale = Math.max(4, Math.min(60, cam.scale * f));
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

  R.draw = function (ctx, view, disp, myPid, selectedId) {
    const T = SGK.DATA.terrain, B = SGK.DATA.bounds;
    ctx.fillStyle = '#1a1712'; ctx.fillRect(0, 0, W, H);
    // 陸
    const [x0, y0] = R.toScreen(0, 0), [x1, y1] = R.toScreen(B.w, B.h);
    ctx.fillStyle = '#d8cda6'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // 海
    ctx.fillStyle = '#7d9fae';
    for (const s of T.seas) { path(ctx, s, true); ctx.fill(); }
    // 川
    ctx.strokeStyle = '#7d9fae'; ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, cam.scale * 0.35);
    for (const r of T.rivers) { path(ctx, r.pts); ctx.stroke(); }
    // 自分の目的地の線
    const me = view.players.find((p) => p.id === myPid);
    if (me && me.tx != null) {
      const d = disp[me.id] || me;
      ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(60,40,20,.7)'; ctx.lineWidth = 2;
      path(ctx, [[d.x, d.y], [me.tx, me.ty]]); ctx.stroke(); ctx.setLineDash([]);
    }
    // 拠点
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const s of view.settlements) {
      const [x, y] = R.toScreen(s.x, s.y);
      const col = (view.factions[s.owner] || {}).color || '#666';
      ctx.lineWidth = 2; ctx.strokeStyle = '#2a2118'; ctx.fillStyle = col;
      if (s.type === 'castle') { ctx.fillRect(x - 7, y - 7, 14, 14); ctx.strokeRect(x - 7, y - 7, 14, 14); }
      else if (s.type === 'town') { ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); ctx.stroke(); }
      if (s.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke(); }
      ctx.font = `${s.type === 'castle' ? 'bold 13px' : '12px'} "Hiragino Mincho ProN","Yu Mincho",serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)'; ctx.strokeText(s.name, x, y + 9);
      ctx.fillStyle = '#2a2118'; ctx.fillText(s.name, x, y + 9);
    }
    // NPC
    for (const n of view.npcs) {
      const d = disp[n.id] || n; const [x, y] = R.toScreen(d.x, d.y);
      if (n.kind === 'merchant') { ctx.fillStyle = '#7a5a2e'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
      else {
        ctx.fillStyle = (view.factions[n.faction] || {}).color || '#555'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    // プレイヤー
    ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'bottom';
    for (const p of view.players) {
      const d = disp[p.id] || p; const [x, y] = R.toScreen(d.x, d.y);
      const mine = p.id === myPid;
      ctx.fillStyle = mine ? '#f2c14e' : '#e8e8e8'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, mine ? 7 : 6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(p.name, x, y - 9);
      ctx.fillStyle = mine ? '#f2c14e' : '#fff'; ctx.fillText(p.name, x, y - 9);
    }
  };
})();
