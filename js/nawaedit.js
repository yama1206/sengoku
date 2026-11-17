// 2.12.0 縄張りを描く画面（築城・描き直し）。曲輪・塀・門・堀・櫓・天守・道を置いて、自分の城を作る
//  左から攻め手が来る。最初に描いた曲輪が本丸。費用は城の種類（場所で決まる）と置いたパーツで決まる
(function () {
  const SIM = SGK.SIM, PI = Math.PI, ED = (SGK.NAWAEDIT = {});
  const CKN = { hira: '平城', yama: '山城', mizu: '水城' }, STN = { k: '柵', d: '土塁', i: '石垣' }, GTN = { o: '大手門', k: '搦手門', s: '門' }, MON = { d: '空堀', m: '水堀' };
  const TOOLS = [['enc', '曲輪', 'ドラッグで四角く囲む。最初の曲輪が本丸'], ['wall', '塀', 'ドラッグでまっすぐ引く'], ['gate', '門', '塀の上をタップ'], ['moat', '堀', 'ドラッグで四角く掘る'], ['tow', '櫓', 'タップで置く'], ['ten', '天守', 'タップで置く（一つだけ）'], ['road', '道', 'ドラッグで引く（山の道・水の上の土橋）'], ['del', '消す', '消したい物をタップ']];
  let st = null;
  const snap = (v) => Math.round(v / 2) * 2;
  const blank = (ck) => ({ ck, enc: [], walls: [], gates: [], moats: [], tow: [], ten: null, roads: [] });
  ED.open = (o) => {
    if (st) ED.close();
    const P = SIM.NAWA_PLAN;
    st = { o, plan: o.plan ? JSON.parse(JSON.stringify(o.plan)) : blank(o.ck || 'hira'), tool: 'enc', wst: 'd', gk: 's', mt: 'd', emo: 0, hist: [], drag: null, P };
    st.plan.ck = o.ck || st.plan.ck;
    const el = (st.el = document.createElement('div'));
    el.id = 'nawaEd';
    el.innerHTML = `<style>
#nawaEd{position:fixed;inset:0;z-index:9000;background:rgba(14,11,8,.96);color:var(--ink,#efe6cc);display:flex;flex-wrap:wrap;font-size:14px}
#nawaEd .cv{flex:1 1 520px;min-width:300px;height:100%;position:relative}
#nawaEd canvas{width:100%;height:100%;touch-action:none;display:block}
#nawaEd .side{flex:0 1 330px;max-height:100%;overflow:auto;padding:10px 12px;box-sizing:border-box;border-left:1px solid var(--line,#8a7448)}
#nawaEd button{margin:2px;padding:6px 9px;background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);border-radius:5px;font:inherit;cursor:pointer}
#nawaEd button.on{background:#5a4626;border-color:var(--gold,#f2c14e)}
#nawaEd .h{color:var(--gold,#f2c14e);font-weight:bold;margin:8px 0 3px}
#nawaEd .m{color:#bdb294;font-size:12px;line-height:1.5}
#nawaEd .ng{color:#ff8a6a}#nawaEd .ok{color:#9fd88a}
@media (max-width:760px){#nawaEd .cv{flex-basis:100%;height:58%}#nawaEd .side{flex-basis:100%;height:42%;border-left:0;border-top:1px solid var(--line,#8a7448)}}
</style><div class="cv"><canvas></canvas></div><div class="side"></div>`;
    document.body.appendChild(el);
    st.cv = el.querySelector('canvas'); st.side = el.querySelector('.side');
    const cv = st.cv;
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { st && (st.drag = null); draw(); });
    st.side.addEventListener('click', side);
    st.onRs = () => draw(); addEventListener('resize', st.onRs);
    st.onKey = (e) => { if (e.key === 'Escape') ED.close(); if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo(); }; addEventListener('keydown', st.onKey);
    refresh();
  };
  ED.close = () => { if (!st) return; removeEventListener('resize', st.onRs); removeEventListener('keydown', st.onKey); st.el.remove(); st = null; };
  ED.isOpen = () => !!st;

  // ---- 座標（m） ----
  function view() {
    const r = st.cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), P = st.P;
    if (st.cv.width !== Math.round(r.width * dpr)) { st.cv.width = Math.round(r.width * dpr); st.cv.height = Math.round(r.height * dpr); }
    const W = P.X1 - P.X0 + 20, H = P.Y1 - P.Y0 + 20, sc = Math.min(st.cv.width / W, st.cv.height / H);
    return { sc, ox: st.cv.width / 2 - ((P.X0 + P.X1) / 2) * sc, oy: st.cv.height / 2 - ((P.Y0 + P.Y1) / 2) * sc, dpr };
  }
  function toM(e) { const V = view(), r = st.cv.getBoundingClientRect(); return [((e.clientX - r.left) * V.dpr - V.ox) / V.sc, ((e.clientY - r.top) * V.dpr - V.oy) / V.sc]; }
  const clampP = (x, y) => [Math.max(st.P.X0, Math.min(st.P.X1, x)), Math.max(st.P.Y0, Math.min(st.P.Y1, y))];

  // ---- 操作 ----
  function push() { st.hist.push(JSON.stringify(st.plan)); if (st.hist.length > 60) st.hist.shift(); }
  function undo() { if (!st.hist.length) return; st.plan = JSON.parse(st.hist.pop()); refresh(); }
  function down(e) {
    st.cv.setPointerCapture(e.pointerId); const [x, y] = clampP(...toM(e)), t = st.tool;
    if (t === 'enc' || t === 'wall' || t === 'moat' || t === 'road') { st.drag = { x0: snap(x), y0: snap(y), x1: snap(x), y1: snap(y) }; draw(); return; }
    push();
    if (t === 'tow') st.plan.tow.push([snap(x), snap(y)]);
    else if (t === 'ten') st.plan.ten = [snap(x), snap(y)];
    else if (t === 'gate') { const g = gateAt(x, y); if (g) st.plan.gates.push([Math.round(g[0] * 10) / 10, Math.round(g[1] * 10) / 10, Math.round(g[2] * 1000) / 1000, st.gk]); else { st.hist.pop(); st.msg = '門は塀の上に置いてください'; } }
    else if (t === 'del') { if (!erase(x, y)) st.hist.pop(); }
    refresh();
  }
  function move(e) { if (!st.drag) return; const [x, y] = clampP(...toM(e)); st.drag.x1 = snap(x); st.drag.y1 = snap(y); draw(); }
  function up() {
    const d = st.drag; if (!d) return; st.drag = null;
    const hx = Math.abs(d.x1 - d.x0) / 2, hy = Math.abs(d.y1 - d.y0) / 2, cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, L = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
    if (st.tool === 'enc') { if (hx < 6 || hy < 6) { st.msg = '曲輪は 12m 四方より大きく描いてください'; return refresh(); } push(); st.plan.enc.push([cx, cy, Math.min(90, hx), Math.min(90, hy), st.wst, st.emo]); }
    else if (st.tool === 'moat') { if (hx < 2 || hy < 2) return refresh(); push(); st.plan.moats.push([cx, cy, Math.min(120, hx), Math.min(120, hy), st.mt]); }
    else if (st.tool === 'wall') { if (L < 4) return refresh(); push(); st.plan.walls.push([d.x0, d.y0, d.x1, d.y1, st.wst]); }
    else if (st.tool === 'road') { if (L < 4) return refresh(); push(); st.plan.roads.push([d.x0, d.y0, d.x1, d.y1]); }
    refresh();
  }
  function gateAt(x, y) { // いちばん近い塀の上（5m 以内）
    let best = null, bd = 5;
    for (const s of (st.N && st.N.segs) || []) { const t = Math.max(0, Math.min(s.len, (x - s.x1) * s.ux + (y - s.y1) * s.uy)), px = s.x1 + s.ux * t, py = s.y1 + s.uy * t, dd = Math.hypot(x - px, y - py); if (dd < bd) { bd = dd; best = [px, py, Math.atan2(s.ux, -s.uy)]; } }
    return best;
  }
  function erase(x, y) {
    const p = st.plan, dS = (a, b, c, d) => { const L = Math.hypot(c - a, d - b) || 1, t = Math.max(0, Math.min(L, ((x - a) * (c - a) + (y - b) * (d - b)) / L)); return Math.hypot(x - a - (c - a) * t / L, y - b - (d - b) * t / L); };
    const near = (arr, f, lim) => { let k = -1, bd = lim; arr.forEach((v, i) => { const d = f(v); if (d < bd) { bd = d; k = i; } }); return k; };
    let i;
    if ((i = near(p.gates, (g) => Math.hypot(g[0] - x, g[1] - y), 5)) >= 0) return p.gates.splice(i, 1);
    if ((i = near(p.tow, (g) => Math.hypot(g[0] - x, g[1] - y), 5)) >= 0) return p.tow.splice(i, 1);
    if (p.ten && Math.hypot(p.ten[0] - x, p.ten[1] - y) < 8) { p.ten = null; return true; }
    if ((i = near(p.walls, (w) => dS(...w.slice(0, 4)), 4)) >= 0) return p.walls.splice(i, 1);
    if ((i = near(p.roads, (w) => dS(...w.slice(0, 4)), 4)) >= 0) return p.roads.splice(i, 1);
    const inb = (b) => Math.abs(x - b[0]) <= b[2] && Math.abs(y - b[1]) <= b[3];
    for (let k = p.moats.length - 1; k >= 0; k--) if (inb(p.moats[k])) return p.moats.splice(k, 1);
    for (let k = p.enc.length - 1; k >= 0; k--) if (inb(p.enc[k])) return p.enc.splice(k, 1);
    return false;
  }
  function side(e) {
    const b = e.target.closest('button'); if (!b) return; const a = b.dataset;
    if (a.tool) st.tool = a.tool; else if (a.wst) st.wst = a.wst; else if (a.gk) st.gk = a.gk; else if (a.mt) st.mt = a.mt; else if (a.emo != null) st.emo = a.emo === '0' ? 0 : a.emo;
    else if (a.do === 'undo') return undo();
    else if (a.do === 'clear') { push(); st.plan = blank(st.plan.ck); }
    else if (a.do === 'sample') { push(); st.plan = SIM.nawaSample(st.plan.ck); }
    else if (a.do === 'cancel') return ED.close();
    else if (a.do === 'ok') { const c = SIM.nawaPlanCheck(st.plan); if (!c.ok) { st.msg = c.msg; return refresh(); } const plan = JSON.parse(JSON.stringify(st.plan)); const o = st.o; ED.close(); if (o.mode === 'edit') SGK.cmd({ type: 'nawaEdit', id: o.id, plan }); else SGK.cmd({ type: 'buildCastle', plan }); return; }
    st.msg = ''; refresh();
  }

  // ---- 表示 ----
  function refresh() {
    const c = SIM.nawaPlanCheck(st.plan); st.chk = c;
    const k = SIM.nawaPlanKit(st.plan), ent = SIM.nawaPlace(k, 0, 0, 1); st.N = SIM.nawa([ent]); st.cost = SIM.nawaPlanCost(st.plan);
    const pay = st.o.mode === 'edit' && st.o.plan ? Math.max(0, st.cost - SIM.nawaPlanCost(st.o.plan)) : st.cost, money = st.o.money == null ? null : st.o.money;
    const btn = (attr, v, label, on) => `<button data-${attr}="${v}" class="${on ? 'on' : ''}">${label}</button>`;
    const tl = TOOLS.find((t) => t[0] === st.tool);
    let h = `<div class="h">${st.o.mode === 'edit' ? '縄張りを描き直す' : '縄張りを描く（築城）'}　<span class="m">${CKN[st.plan.ck]}</span></div>`
      + `<div class="m">${{ hira: '平地の城。広い水堀と高い石垣で守る', yama: '山の城。高い所の曲輪は攻めにくい。石垣は高くつき、水堀は掘れない。道を引くと登りやすい', mizu: '水辺の城。右（奥）は水。水の上の曲輪は埋め立てる。陸からの道（土橋）を細く引くと守りやすい' }[st.plan.ck]}</div>`
      + `<div class="h">道具</div>${TOOLS.map(([t, n]) => btn('tool', t, n, st.tool === t)).join('')}<div class="m">${tl ? tl[2] : ''}</div>`;
    if (['enc', 'wall'].includes(st.tool)) h += `<div class="h">塀の造り</div>${['k', 'd', 'i'].map((s) => btn('wst', s, STN[s], st.wst === s)).join('')}<div class="m">柵は安いが矢が抜ける。石垣は高いが堅い</div>`;
    if (st.tool === 'enc') h += `<div class="h">まわりの堀</div>${btn('emo', '0', 'なし', !st.emo)}${btn('emo', 'd', '空堀', st.emo === 'd')}${st.plan.ck !== 'yama' ? btn('emo', 'm', '水堀', st.emo === 'm') : ''}`;
    if (st.tool === 'gate') h += `<div class="h">門の種類</div>${['o', 'k', 's'].map((s) => btn('gk', s, GTN[s], st.gk === s)).join('')}<div class="m">大手門・搦手門は守り手も開けない（破られるまで閉じたまま）。堀の側には土橋が付く</div>`;
    if (st.tool === 'moat') h += `<div class="h">堀の種類</div>${btn('mt', 'd', '空堀', st.mt === 'd')}${st.plan.ck !== 'yama' ? btn('mt', 'm', '水堀', st.mt === 'm') : ''}<div class="m">水堀は通れない。空堀は通れるが遅く、狙われやすい</div>`;
    h += `<div class="h">費用</div><div>${SIM.money(pay)}${st.o.mode === 'edit' ? '（増えた分）' : ''}${money != null ? `　<span class="m">所持金 ${SIM.money(money)}</span>` : ''}</div>`
      + `<div class="m">普請の手間：約${Math.max(0.5, Math.round((st.cost / st.P.unit) * 10) / 10)}倍　守りの段階：${(SIM.FUSHIN ? SIM.FUSHIN.kai[SIM.nawaPlanKai(st.plan)].name : '')}</div>`
      + `<div class="${c.ok ? 'ok' : 'ng'}" style="margin-top:4px">${c.ok ? '✓ 築けます' : '✗ ' + c.msg}</div>${st.msg ? `<div class="ng">${st.msg}</div>` : ''}`
      + `<div class="h">　</div>${btn('do', 'undo', '元に戻す')}${btn('do', 'sample', '見本を置く')}${btn('do', 'clear', '全部消す')}`
      + `<div style="margin-top:8px">${btn('do', 'cancel', 'やめる')}<button data-do="ok" ${c.ok && (money == null || money >= pay) ? '' : 'disabled'}>${st.o.mode === 'edit' ? 'この縄張りにする' : 'この縄張りで築城を始める'}</button></div>`
      + `<div class="m" style="margin-top:8px">左から攻め手が来ます。どの曲輪にも、外から門を通って入れるようにしてください（閉じた城は築けません）</div>`;
    st.side.innerHTML = h; draw();
  }
  function draw() {
    const V = view(), g = st.cv.getContext('2d'), N = st.N, P = st.P, X = (x) => V.ox + x * V.sc, Y = (y) => V.oy + y * V.sc;
    g.fillStyle = '#1a1712'; g.fillRect(0, 0, st.cv.width, st.cv.height);
    g.fillStyle = '#7c8a4f'; g.fillRect(X(P.X0), Y(P.Y0), (P.X1 - P.X0) * V.sc, (P.Y1 - P.Y0) * V.sc);
    if (N) {
      if (N.hg) { if (!N.shade) { const c = document.createElement('canvas'); c.width = N.W; c.height = N.H; const g2 = c.getContext('2d'), im = g2.createImageData(N.W, N.H); for (let j = 0; j < N.H; j++) for (let i = 0; i < N.W; i++) { const k = j * N.W + i, h = N.hg[k], hx = N.hg[j * N.W + Math.min(N.W - 1, i + 1)] - h, hy = N.hg[Math.min(N.H - 1, j + 1) * N.W + i] - h, l = -(hx + hy) * 0.35, ct = Math.abs((h / 8) % 1 - 0.5) > 0.44 ? 1 : 0; im.data[k * 4] = l > 0 ? 255 : 30; im.data[k * 4 + 1] = l > 0 ? 250 : 25; im.data[k * 4 + 2] = l > 0 ? 220 : 10; im.data[k * 4 + 3] = Math.min(210, Math.abs(l) * 255 + ct * 70 + 10); } g2.putImageData(im, 0, 0); N.shade = c; } g.drawImage(N.shade, X(N.x0), Y(N.y0), N.W * 2 * V.sc, N.H * 2 * V.sc); }
      const COL = { k: '#b8a77e', m: '#3a6e9e', d: 'rgba(95,78,50,.8)', s: 'rgba(110,85,50,.35)', b: '#9a8660', r: '#a8956a', l: '#7c8a4f' };
      const shp = (q) => { g.beginPath(); if (q[0] === 'o') { g.arc(X(q[1]), Y(q[2]), q[3] * V.sc, 0, 7); if (q[4]) { g.moveTo(X(q[1]) + q[4] * V.sc, Y(q[2])); g.arc(X(q[1]), Y(q[2]), q[4] * V.sc, 0, 7, true); } } else { const rings = q[0] === 'P' ? q.slice(1) : [q.slice(1)]; for (const rg of rings) { for (let i = 0; i < rg.length; i += 2) (i ? g.lineTo(X(rg[i]), Y(rg[i + 1])) : g.moveTo(X(rg[i]), Y(rg[i + 1]))); g.closePath(); } } };
      for (const [k, q] of N.A) if (COL[k] && q[0] !== 'q') { g.fillStyle = COL[k]; shp(q); g.fill('evenodd'); }
      for (const [stl, col, lw] of [['i', '#ece4d0', 2.2], ['d', '#c9c2a0', 2.2], ['k', '#6b5236', 1.4]]) { g.strokeStyle = col; g.lineWidth = Math.max(2, lw * V.sc * 0.8); g.setLineDash(stl === 'k' ? [4, 3] : []); g.beginPath(); for (const s of N.segs) if (s.st === stl) { g.moveTo(X(s.x1), Y(s.y1)); g.lineTo(X(s.x2), Y(s.y2)); } g.stroke(); } g.setLineDash([]);
      for (const gt of N.gates) { g.strokeStyle = '#7a4a26'; g.lineWidth = Math.max(4, 1.6 * V.sc); g.beginPath(); g.moveTo(X(gt.x1), Y(gt.y1)); g.lineTo(X(gt.x2), Y(gt.y2)); g.stroke(); const s = gt.id.slice(-1); if (s === 'o' || s === 'k') { g.fillStyle = '#f2c14e'; g.font = `${Math.max(11, 4 * V.sc)}px sans-serif`; g.fillText(s === 'o' ? '大手' : '搦手', X(gt.x) + 4, Y(gt.y) - 4); } }
      for (const t of N.towers) { g.fillStyle = t[0] === 'T' ? '#4a3a2a' : '#ece6d6'; const r = (t[0] === 'T' ? 7 : 3) * V.sc; g.fillRect(X(t[1]) - r, Y(t[2]) - r, r * 2, r * 2); g.strokeStyle = '#3a3f46'; g.strokeRect(X(t[1]) - r, Y(t[2]) - r, r * 2, r * 2); }
    }
    const e0 = st.plan.enc[0]; if (e0) { g.fillStyle = 'rgba(242,193,78,.9)'; g.font = `${Math.max(12, 5 * V.sc)}px sans-serif`; g.fillText('本丸', X(e0[0]) - 12, Y(e0[1]) + 5); }
    if (st.chk && !st.chk.ok && st.chk.i != null) { const e = st.plan.enc[st.chk.i]; if (e) { g.strokeStyle = '#ff6a4a'; g.lineWidth = 3; g.setLineDash([6, 4]); g.strokeRect(X(e[0] - e[2]), Y(e[1] - e[3]), e[2] * 2 * V.sc, e[3] * 2 * V.sc); g.setLineDash([]); } }
    const d = st.drag; if (d) { g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); if (st.tool === 'enc' || st.tool === 'moat') g.rect(X(Math.min(d.x0, d.x1)), Y(Math.min(d.y0, d.y1)), Math.abs(d.x1 - d.x0) * V.sc, Math.abs(d.y1 - d.y0) * V.sc); else { g.moveTo(X(d.x0), Y(d.y0)); g.lineTo(X(d.x1), Y(d.y1)); } g.stroke(); g.setLineDash([]); g.fillStyle = '#f2c14e'; g.font = '12px sans-serif'; g.fillText(st.tool === 'enc' || st.tool === 'moat' ? `${Math.abs(d.x1 - d.x0)}m×${Math.abs(d.y1 - d.y0)}m` : `${Math.round(Math.hypot(d.x1 - d.x0, d.y1 - d.y0))}m`, X(d.x1) + 6, Y(d.y1) - 6); }
    g.fillStyle = 'rgba(239,230,204,.85)'; g.font = `${Math.max(12, 13 * V.dpr)}px sans-serif`; g.fillText('← 攻め手', X(P.X0) + 6, Y(0)); g.fillText('10m', X(P.X0) + 6, Y(P.Y1) - 8); g.fillRect(X(P.X0) + 40, Y(P.Y1) - 12, 10 * V.sc, 3);
  }
})();
