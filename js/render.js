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

  R.draw = function (ctx, view, disp, myPid, selectedId, marks) {
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
      if (marks && marks.has(s.id)) { ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#2a2118'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 24); ctx.lineTo(x + 6, y - 17); ctx.lineTo(x, y - 10); ctx.lineTo(x - 6, y - 17); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      if (s.id === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke(); }
      ctx.font = `${s.type === 'castle' ? 'bold 13px' : '12px'} "Hiragino Mincho ProN","Yu Mincho",serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)'; ctx.strokeText(s.name, x, y + 9);
      ctx.fillStyle = '#2a2118'; ctx.fillText(s.name, x, y + 9);
    }
    // NPC
    for (const n of view.npcs) {
      const d = disp[n.id] || n; const [x, y] = R.toScreen(d.x, d.y);
      if (n.kind === 'merchant') { ctx.fillStyle = '#7a5a2e'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); }
      else if (n.kind === 'bandit') {
        ctx.strokeStyle = n.battle ? '#ff5533' : '#3a1410'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        ctx.font = 'bold 11px sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(245,238,215,.9)';
        const t = `野盗 ${n.size || ''}`; ctx.strokeText(t, x, y + 7); ctx.fillStyle = '#5a1a12'; ctx.fillText(t, x, y + 7);
      }
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

  // ---- 戦場（リアルタイム戦闘） ----
  R.battleLayout = (F) => { const top = 70, bottom = 210; const sc = Math.max(2, Math.min((W - 20) / F.w, (H - top - bottom) / F.h)); return { sc, ox: (W - F.w * sc) / 2, oy: top + Math.max(0, (H - top - bottom - F.h * sc) / 2) }; };
  const ORD = { charge: '突', hold: '待', retreat: '退' };
  R.drawBattle = function (ctx, bt, disp, myPid) {
    const F = SGK.SIM.FIELD, TR = SGK.SIM.TROOPS, L = R.battleLayout(F);
    const sx = (x) => L.ox + x * L.sc, sy = (y) => L.oy + y * L.sc;
    ctx.fillStyle = '#1a1712'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7c8a4f'; ctx.fillRect(sx(0), sy(0), F.w * L.sc, F.h * L.sc);
    ctx.strokeStyle = '#4b5530'; ctx.lineWidth = 2; ctx.strokeRect(sx(0), sy(0), F.w * L.sc, F.h * L.sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const u of bt.units) {
      const [id, side, owner, type, n, , , order] = u;
      const d = disp['u' + bt.id + '_' + id] || { x: u[5], y: u[6] };
      const col = side === 'B' ? '#a83228' : owner === myPid ? '#f2c14e' : '#e8e8e8';
      const cx = sx(d.x), cy = sy(d.y);
      if (type === 'hero') {
        ctx.fillStyle = col; ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, Math.max(5, L.sc * 1.2), 0, 7); ctx.fill(); ctx.stroke();
      } else {
        const shown = Math.min(n, 36), cols = Math.ceil(Math.sqrt(shown)), gap = 1.4 * L.sc, r = Math.max(1.8, L.sc * 0.5);
        ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
        for (let i = 0; i < shown; i++) {
          const px = cx + ((i % cols) - (cols - 1) / 2) * gap, py = cy + (Math.floor(i / cols) - (Math.ceil(shown / cols) - 1) / 2) * gap;
          ctx.beginPath();
          if (TR[type].ranged) { ctx.moveTo(px, py - r); ctx.lineTo(px + r, py + r); ctx.lineTo(px - r, py + r); ctx.closePath(); }
          else if (type === 'kiba') { ctx.moveTo(px, py - r * 1.3); ctx.lineTo(px + r * 1.3, py); ctx.lineTo(px, py + r * 1.3); ctx.lineTo(px - r * 1.3, py); ctx.closePath(); }
          else ctx.arc(px, py, r, 0, 7);
          ctx.fill(); ctx.stroke();
        }
      }
      const label = `${type === 'hero' ? (side === 'A' && owner !== myPid ? (bt.names[owner] || '味方') : '本人') : (TR[type].short || TR[type].name)} ${type === 'hero' ? '' : n}${side === 'A' ? '［' + ORD[order] + '］' : ''}`;
      ctx.font = 'bold 12px sans-serif'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      const ly = cy - Math.max(10, Math.sqrt(Math.min(n, 36)) * 0.8 * L.sc + 4);
      ctx.strokeText(label, cx, ly); ctx.fillStyle = side === 'B' ? '#ffb4a2' : '#fff'; ctx.fillText(label, cx, ly);
    }
  };
})();
