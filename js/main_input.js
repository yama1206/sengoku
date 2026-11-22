// マウス・タッチ・キーボード・コントローラー
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- マウス・タッチ ----------
const cv = $('map'), ctx = cv.getContext('2d');
const ptrs = new Map(); let dragMoved = false, pinchD = 0;
cv.addEventListener('contextmenu', (e) => e.preventDefault());
// 0.56.0 アクション戦闘のマウス・タッチ（地図・戦場の操作より先に受け取る）
window.addEventListener('pointerdown', (e) => {
  if (e.target !== cv || !actB()) return; e.stopPropagation(); e.preventDefault();
  if (ML() && e.pointerType !== 'touch') { // 0.63.0 3D：クリックでマウスを捕まえて視点操作。左＝攻撃、右＝防御
    if (document.pointerLockElement !== cv) { try { cv.requestPointerLock(); } catch (er) { /* 使えない環境 */ } return; }
    G.padUsed = false; if (e.button === 0) G.actAtk = true; else if (e.button === 2) G.actBlk = true; return;
  }
  if (e.pointerType === 'touch') { // 2.7.1 スマホ：左半分＝移動のスティック、右半分＝視点（離すと攻撃）
    const T0 = { id: e.pointerId, sx: e.offsetX, sy: e.offsetY, x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, t: performance.now() };
    if (e.offsetX < cv.clientWidth / 2) { /* 2.7.3 左半分に2本目の指＝ピンチでカメラの距離 */
      if (G.tL && G.tL.id !== e.pointerId) { G.tL2 = T0; G.pinchD = Math.hypot(G.tL.x - T0.x, G.tL.y - T0.y); G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; }
      else G.tL = T0;
    } else G.tR = T0; return; }
  G.mouseXY = [e.offsetX, e.offsetY]; G.padUsed = false;
  if (e.button === 0) G.actAtk = true;
  else if (e.button === 2) G.actRD = [e.offsetX, e.offsetY]; // 右ボタン：押した所へ移動。押したまま引っぱると、離した方向を向く
}, true);
window.addEventListener('pointermove', (e) => {
  if (!actB()) return;
  if (ML() && document.pointerLockElement === cv) { const c = R.acam; c.yaw = (c.yaw || 0) + e.movementX * 0.0025; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + e.movementY * 0.0022)); e.stopPropagation(); return; }
  if (e.pointerType === 'touch') {
    const L = G.tL && G.tL.id === e.pointerId ? G.tL : null, Rt = G.tR && G.tR.id === e.pointerId ? G.tR : null;
    if (G.tL2 && G.tL2.id === e.pointerId) { G.tL2.x = e.offsetX; G.tL2.y = e.offsetY; }
    if (L) { L.x = e.offsetX; L.y = e.offsetY; }
    if ((L || (G.tL2 && G.tL2.id === e.pointerId)) && G.tL && G.tL2) { const d = Math.hypot(G.tL.x - G.tL2.x, G.tL.y - G.tL2.y); if (G.pinchD > 8 && d > 8) R.acam.z = Math.max(4, Math.min(22, R.acam.z * (d / G.pinchD))); G.pinchD = d; e.stopPropagation(); return; }
    if (Rt) { const dx = e.offsetX - Rt.lx, dy = e.offsetY - Rt.ly; Rt.lx = e.offsetX; Rt.ly = e.offsetY;
      if (ML()) { const c = R.acam; c.yaw = (c.yaw || 0) + dx * 0.006; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + dy * 0.005)); }
      else if (Math.hypot(e.offsetX - Rt.sx, e.offsetY - Rt.sy) > 12) G.tAim = Math.atan2(e.offsetY - Rt.sy, e.offsetX - Rt.sx); }
    e.stopPropagation(); return; }
  if (e.target === cv) { G.mouseXY = [e.offsetX, e.offsetY]; G.vcur = G.mouseXY; G.vcurOn = false; G.padUsed = false; e.stopPropagation(); }
}, true);
const actUp = (e) => {
  if (!actB()) { if (e.pointerType === 'touch') { if (G.tL && G.tL.id === e.pointerId) { G.tL = G.tL2; G.tL2 = null; } else if (G.tL2 && G.tL2.id === e.pointerId) G.tL2 = null; if (G.tR && G.tR.id === e.pointerId) G.tR = null; } return; } // 2.99.3 戦の外で離しても指の記録を消す（戦が終わってから離すと残り、次の戦で前へ進み続けていた）
  if (e.pointerType === 'touch') { if (G.tL2 && G.tL2.id === e.pointerId) { G.tL2 = null; if (G.tL) { G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; } } else if (G.tL && G.tL.id === e.pointerId) { G.tL = G.tL2; G.tL2 = null; if (G.tL) { G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; } } if (G.tR && G.tR.id === e.pointerId) { G.tR = null; G.tAtk = true; } e.stopPropagation(); return; }
  G.actAtk = false; G.actTouch = null; if (e.target === cv) e.stopPropagation();
  if (ML() && e.pointerType !== 'touch') { if (e.button === 2) G.actBlk = false; G.actRD = null; return; }
  const D = G.actRD; G.actRD = null;
  if (D && e.button === 2) { const [x, y] = R.actToWorld(D[0], D[1]), [x2, y2] = R.actToWorld(e.offsetX, e.offsetY), dr = Math.hypot(e.offsetX - D[0], e.offsetY - D[1]) > 14;
    if (G.selUnit == null) { toast('先に部隊を選んでください', 1000); return; } const unit = G.selUnit; moveFace(unit, x, y, dr ? Math.atan2(y2 - y, x2 - x) : null); toast(dr ? 'そこへ向かわせ、その方向を向かせます' : 'そこへ向かわせます', 800); }
};
window.addEventListener('pointerup', actUp, true); window.addEventListener('pointercancel', actUp, true);
{ const tall = (e) => { if (e && e.touches && e.touches.length) return; G.tL = G.tL2 = null; G.tR = null; }; window.addEventListener('touchend', tall, true); window.addEventListener('touchcancel', tall, true); window.addEventListener('blur', () => tall(null)); } // 2.99.3 指が全部離れたら合戦の移動スティックを必ず止める
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, btn: e.button }); dragMoved = false; pinchD = 0; });
{ const drop = (e) => { if (ptrs.delete(e.pointerId)) pinchD = 0; }; cv.addEventListener('pointercancel', drop); cv.addEventListener('lostpointercapture', drop); window.addEventListener('touchend', (e) => { if (!e.touches || !e.touches.length) { ptrs.clear(); pinchD = 0; } }, true); } // 2.101.2 スマホで指の記録が消えずに残り、ピンチで拡大・縮小できなくなっていた
cv.addEventListener('mousemove', (e) => { G.hov = [e.offsetX, e.offsetY]; G.hovT = performance.now(); });
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  if (ptrs.size >= 2) { // 2.101.2 指の記録が残っていても、最後に置いた2本でピンチする
    p.x = e.offsetX; p.y = e.offsetY;
    const [a, b] = [...ptrs.values()].slice(-2); if (p !== a && p !== b) return; const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchD) anyZoom(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2); pinchD = d; dragMoved = true; return;
  }
  const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { dragMoved = true; R.cam.follow = false; }
  if (dragMoved && p.btn === 2 && G.priv && G.priv.battle && G.selUnit != null) return; // 右ドラッグ：向きを決める（地図は動かさない）
  if (dragMoved) { if (G.priv && G.priv.battle) { const L = R.battleLayout(SIM.FIELD); R.bcam.x -= dx / L.sc; R.bcam.y -= dy / L.sc; } else { R.cam.x -= dx / R.cam.scale; R.cam.y -= dy / R.cam.scale; } }
});
cv.addEventListener('pointerup', (e) => {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  const BT = G.priv && G.priv.battle;
  if (p && BT && dragMoved && p.btn === 2 && G.selUnit != null && !actB()) { const [x, y] = R.battleToField(p.sx, p.sy), [x2, y2] = R.battleToField(e.offsetX, e.offsetY); G.fpick = null; moveFace(G.selUnit, x, y, Math.atan2(y2 - y, x2 - x)); toast('そこへ移動し、その方向を向かせます', 900); return; }
  if (!p || dragMoved || !G.view) return;
  if (BT) { // 戦闘中：自分の部隊をクリックで選択、地面をクリックで選んだ部隊を移動
    const [fx, fy] = R.battleToField(e.offsetX, e.offsetY), L = R.battleLayout(SIM.FIELD);
    const mine = BT.units.filter((u) => u[2] === G.myPid && u[7] !== 'rout' && u[14] == null).map((u) => [u, Math.hypot(u[5] - fx, u[6] - fy)]).sort((a, b) => a[1] - b[1])[0];
    if (mine && mine[1] * L.sc < Math.max(22, (0.6 + Math.sqrt(mine[0][4]) * 0.7) * L.sc + 10) && p.btn !== 2) { G.selUnit = mine[0][0]; G.fpick = null; battleHtml = ''; return; }
    if (G.fpick && p.btn !== 2 && pickFace(fx, fy)) return;
    if (G.selUnit != null) { moveFace(G.selUnit, fx, fy); if (p.btn !== 2) { G.fpick = { unit: G.selUnit, x: fx, y: fy }; toast('向かせたい方向をタップ（同じ所なら向きはそのまま）', 1500); } }
    return;
  }
  const hit = R.hitSettlement(G.view, e.offsetX, e.offsetY);
  const [wx, wy] = R.toWorld(e.offsetX, e.offsetY);
  const uh = p.btn !== 2 && unitHit(e.offsetX, e.offsetY);
  if (uh && hit && G.selKind === 'u' && G.selected === uh.id) { selectSettlement(hit); return; } // 2.102.2 部隊が拠点に重なっているとき：部隊を選んだ状態でもう一度押すと、下の拠点を選べる
  if (uh) { selectUnit(uh); return; } // 部隊をクリック・タップ：情報
  if (p.btn === 2) { // 0.54.10 右クリック：自分の上なら人物を開く（開いていれば閉じる）／それ以外はすぐ移動
    const mm = me(), md = mm && (G.disp[G.myPid] || mm), ms = md && R.toScreen(md.x, md.y);
    if (!$('char').classList.contains('hidden')) { openChar(false); return; }
    if (ms && Math.hypot(ms[0] - e.offsetX, ms[1] - e.offsetY) < 18) { openChar(true); return; }
  }
  if (p.btn === 2) { const m2 = me(), d2 = m2 && (G.disp[m2.id] || m2); if (d2) { R.cam.x = d2.x; R.cam.y = d2.y; R.cam.follow = true; } return; } // 2.99.10 右クリック：自分のいる場所へ飛んで、追いかける（前は押した所へ移動）
  if (hit) selectSettlement(hit);   // 左クリック・タップ：拠点なら情報
  else moveTo(wx, wy);                   // 地面なら移動
});
cv.addEventListener('wheel', (e) => { e.preventDefault(); anyZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

// ---------- キーボード ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (SGK.PARTY && SGK.PARTY.current && SGK.PARTY.current()) { keys.clear(); return; } // 2.99.2 みんなで遊ぶの最中は地図・メニューのキーを効かせない（Wで地図が動いていた）
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && G.mode === 'title' && e.target.id === 'codeInput') $('btnJoinGo').click(); return; }
  const k = e.key;
  if (actB() && !activeMenuNotBattle() && k.toLowerCase() === 't') { const on = R.act3d && R.act3d.toggle(); if (!on && document.pointerLockElement) document.exitPointerLock(); toast(on ? '3D表示にしました' : '2D表示にしました', 1000); return; }
  if (ML() && !activeMenuNotBattle()) { // 0.63.0 マウント＆ブレイド2風：0〜9で隊を選び、F1・F2…で指図
    const kl = k.toLowerCase(), fm = /^F([1-9])$/.exec(k);
    if (fm) { e.preventDefault(); const n = +fm[1]; if (!R.ordMenu || R.ordMenu === 'root') { const m = [null, 'move', 'face', 'form', 'fire'][n]; if (m) ordMenu(m); } else { const o = ORDK[R.ordMenu][n - 1]; if (o) ord3(o); } return; }
    if ('wasd'.includes(kl) && kl.length === 1) { keys.add(kl); G.padUsed = false; return; }
    if (k === ' ') { e.preventDefault(); G.actDash = true; return; }
    if (kl === 'r') { G.actRide = true; return; } /* 1.6.17 馬の乗り降り */
    if (kl === 'q') { G.actSw = true; return; } // 0.64.0 武器の持ち替え
    if (kl === 'e') { G.actJmp = true; return; } // 0.64.0 ジャンプ
    if (/^[0-9]$/.test(k)) { sel3(+k); if (!R.ordMenu) ordMenu('root'); return; }
    if (k === 'Escape' || k === 'Backspace') { if (R.ordMenu) { ordMenu(null); return; } if (k === 'Escape') { toggleMenu(true); return; } }
    if (k === 'Tab') { e.preventDefault(); actSel(1); return; }
    return;
  }
  if (actB() && !activeMenuNotBattle()) {
    const kl = k.toLowerCase(), o = { z: 'charge', x: 'guard', c: 'hold', f: 'follow' }[kl];
    if ('wasd'.includes(kl) && kl.length === 1) { keys.add(kl); G.padUsed = false; return; }
    if (k === ' ') { e.preventDefault(); G.actDash = true; return; }
    if (o) { actOrder(o); return; }
    if (/^[1-9]$/.test(k)) { const AB = actB(), u = AB.units.find((x) => x.idx === +k && (x.owner === G.myPid || x.cmd === G.myPid)); G.selUnit = k === '1' ? (G.selUnit === 'all' ? null : 'all') : u ? (G.selUnit === u.id ? null : u.id) : G.selUnit; battleHtml = ''; return; }
    if (k === 'Escape') { toggleMenu(true); return; }
    if (k === 'Tab') { e.preventDefault(); actSel(1); return; }
  }
  const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
  if (activeMenu()) {
    if (dir) { e.preventDefault(); navMenu(dir[0], dir[1]); return; }
    if (k === 'Enter' || k === ' ') { e.preventDefault(); pressMenu(); return; }
    if (activeMenu() === $('battle')) {
      if (k === 'Escape') { toggleMenu(true); return; }
      const o = { z: 'charge', x: 'guard', c: 'hold' }[k.toLowerCase()]; if (o) { shout(null, 'all', o); command({ type: 'order', unit: 'all', order: o }); return; }
    }
    if (k === 'Escape') { if (activeMenu() === $('mapPanel')) smClose(); else if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); return; }
    if (activeMenu() === $('mapPanel') && (k === '+' || k === '=' || k === '-')) { smZoom(k === '-' ? 1 / 1.5 : 1.5); return; }
    if (activeMenu() === $('char') && (k === 'q' || k === 'e')) { cycleCTab(k === 'q' ? -1 : 1); return; }
    if (activeMenu() === $('char') && (k === 'p' || k === 'P')) { openChar(false); return; }
    if (activeMenu() === $('town') && (k === 'q' || k === 'e')) { cycleTab(k === 'q' ? -1 : 1); return; }
  }
  if (G.mode !== 'host' && G.mode !== 'client') return;
  keys.add(k.toLowerCase());
  if (k === 'Escape') toggleMenu();
  else if (k === 'f' || k === 'F') $('mFollow').click();
  else if (k === 'i' || k === 'I') openSub('inv'); // 1.3.0 I：持っている物資
  else if (k === 'Tab') { e.preventDefault(); cycleNear(); }
  else if (k === 'e' || k === 'E') { if (!$('joinBtn').classList.contains('hidden')) $('joinBtn').click(); else openTown(true); }
  else if (k === 'p' || k === 'P') openChar(true);
  else if (k === 'Enter' && G.selected) $('infoGo').click();
  else if (k === '+' || k === '=' || k === ';') anyZoom(1.2); else if (k === '-') anyZoom(1 / 1.2);
  else if (G.mode === 'host' && '12345'.includes(k)) { G.speed = [0, 1, 2, 4, 8][+k - 1]; G.autoPause = 0; }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// 近い拠点を順番に選ぶ（キーボードのTab／コントローラーのX）
let nearIdx = 0;
function questMarks() { /* 1.6.43 依頼の作業する場所（ダイヤ印）：拠点の id と、動く相手の位置 pts */
  const P = G.priv, marks = new Set(); marks.pts = [];
  if (!P || !P.me) return marks;
  for (const q of P.me.quests || []) {
    const k = q.type === 'deliver' ? q.to : q.mk !== undefined ? q.mk : q.from;
    if (k) marks.add(k);
    if (q.pt) marks.pts.push(q.pt);
  }
  if (P.me.nin && P.me.nin.q && P.me.nin.q.to) marks.add(P.me.nin.q.to); /* 忍びの依頼 */
  if (P.me.nin && P.me.nin.def && P.me.nin.def.to) marks.add(P.me.nin.def.to); /* 2.57.0 城の守り */
  return marks;
}
function cycleNear() { /* 1.6.43 □：受けている依頼の場所を先に（近い順）、そのあと近くの拠点 */
  const m = me(); if (!m) return;
  const dd = (a) => Math.hypot(a.x - m.x, a.y - m.y), mk = questMarks();
  const qs = [...G.view.settlements.filter((s) => mk.has(s.id)), ...mk.pts.map((p) => ({ x: p[0], y: p[1], pt: 1 }))].sort((a, b) => dd(a) - dd(b));
  const near = [...G.view.settlements].filter((s) => !mk.has(s.id)).sort((a, b) => dd(a) - dd(b)).slice(0, 6);
  const list = [...qs, ...near]; if (!list.length) return;
  const s = list[nearIdx++ % list.length];
  if (s.pt) { if (G.selected) selectSettlement(null); toast('依頼の相手', 800); } else selectSettlement(s);
  R.cam.follow = false; R.cam.x = s.x; R.cam.y = s.y;
  if (G.pcurOn) G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2];
}

// ---------- コントローラー（Xbox配置：A決定 B戻る X近くの拠点 Y追従 LB/RB拡大縮小 START メニュー／左スティック カーソル 右スティック視点） ----------
const padPrev = {}; let navHold = 0, lastNav = 0;
// 戦闘中のコントローラー：LB/RB で自分の部隊を選ぶ、左（右）スティックで移動先、X でそこへ移動
// 戦闘中のコントローラー：スティックでカーソル、×/A で自分の部隊を選ぶ→行き先で ×/A を押すとそこへ移動（LB/RB でも部隊を順に選べる）
function padBattle(down, mx, my, dt) {
  const BT = G.priv && G.priv.battle; if (!BT) return;
  const mine = BT.units.filter((u) => u[2] === G.myPid && u[7] !== 'rout' && u[14] == null);
  if (!mine.length) return;
  if (G.selUnit != null && !mine.some((u) => u[0] === G.selUnit)) G.selUnit = null;
  const F = SIM.FIELD;
  if (!G.bcur) { const u = mine.find((x) => x[0] === G.selUnit) || mine[0]; G.bcur = [u[5], u[6]]; }
  if (down(4) || down(5)) {
    const i = mine.findIndex((u) => u[0] === G.selUnit), d = down(4) ? -1 : 1;
    const u = mine[(Math.max(-1, i) + d + mine.length) % mine.length]; G.selUnit = u[0]; G.bcur = [u[5], u[6]];
  }
  if (mx || my) {
    G.bcur[0] = Math.max(0, Math.min(F.w, G.bcur[0] + mx * Math.abs(mx) * dt * 170 / R.bcam.z));
    G.bcur[1] = Math.max(0, Math.min(F.h, G.bcur[1] + my * Math.abs(my) * dt * 170 / R.bcam.z));
  }
  if (down(0) || down(2)) {
    const near = mine.map((u) => [u, Math.hypot(u[5] - G.bcur[0], u[6] - G.bcur[1])]).sort((a, b) => a[1] - b[1])[0];
    if (near && near[1] < Math.max(8, 0.6 + Math.sqrt(near[0][4]) * 0.7 + 5) && near[0][0] !== G.selUnit) { G.selUnit = near[0][0]; G.fpick = null; SGK.AUDIO.sfx('click'); }
    else if (G.fpick) pickFace(G.bcur[0], G.bcur[1]);
    else if (G.selUnit != null) { moveFace(G.selUnit, G.bcur[0], G.bcur[1]); G.fpick = { unit: G.selUnit, x: G.bcur[0], y: G.bcur[1] }; toast('カーソルを向かせたい方へ動かしてA（Bで向きはそのまま）', 1500); }
  }
  if (down(1) && G.fpick) { G.fpick = null; toast('向きはそのままにしました', 800);
  }
}
// 照準の十字
/* 1.6.55 地図のカーソルの見た目（設定で変える・この端末に記憶） */
const CUR = { sz: [['小', 0.7], ['普通', 1], ['大', 1.4], ['特大', 1.9]], sh: [['十字と丸'], ['十字'], ['丸'], ['矢印'], ['点']],
  co: [['白', '#ffffff'], ['黄', '#f2c14e'], ['赤', '#ff5040'], ['水色', '#60d0ff'], ['緑', '#70e070'], ['黒', '#202020']], op: [['濃い', 1], ['少し薄い', 0.75], ['半分', 0.5], ['かなり薄い', 0.3]] };
let curSet = { sz: 1, sh: 0, co: 0, op: 0 }; try { Object.assign(curSet, JSON.parse(localStorage.getItem('sgk-cur') || '{}')); } catch (e) {}
const curLbl = () => { const N = { sz: '大きさ', sh: '形', co: '色', op: '薄さ' }; for (const k of ['sz', 'sh', 'co', 'op']) $('mCur' + k[0].toUpperCase() + k[1]).textContent = `${N[k]}：${CUR[k][curSet[k] % CUR[k].length][0]}`; };
for (const k of ['sz', 'sh', 'co', 'op']) $('mCur' + k[0].toUpperCase() + k[1]).onclick = () => { curSet[k] = (curSet[k] + 1) % CUR[k].length; try { localStorage.setItem('sgk-cur', JSON.stringify(curSet)); } catch (e) {} curLbl(); };
curLbl();
function drawMapCur(x, y) {
  const sc = CUR.sz[curSet.sz][1], col = CUR.co[curSet.co][1], sh = curSet.sh, dark = curSet.co === 5;
  ctx.save(); ctx.globalAlpha = CUR.op[curSet.op][1]; ctx.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    ctx.strokeStyle = k ? col : dark ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.7)'; ctx.lineWidth = (k ? 2 : 4) * Math.max(1, sc * 0.8); ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    if (sh === 0 || sh === 2) { ctx.moveTo(x + 9 * sc, y); ctx.arc(x, y, 9 * sc, 0, 7); }
    if (sh === 0 || sh === 1) { const a = sh ? 2 : 5; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * a * sc, y + dy * a * sc); ctx.lineTo(x + dx * 16 * sc, y + dy * 16 * sc); } }
    if (sh === 3) { ctx.moveTo(x, y); ctx.lineTo(x, y + 20 * sc); ctx.lineTo(x + 5 * sc, y + 15 * sc); ctx.lineTo(x + 13 * sc, y + 14 * sc); ctx.closePath(); }
    ctx.stroke();
    if (sh === 4) { ctx.beginPath(); ctx.arc(x, y, (k ? 4 : 5.5) * sc, 0, 7); ctx.fill(); }
    if (sh === 3 && k) ctx.fill();
  }
  ctx.restore();
}
function drawCross(x, y, col) {
  ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
  for (let k = 0; k < 2; k++) {
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
    ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
  }
}
function pollPad(dt) {
  if (SGK.MINEUI && SGK.MINEUI.isOpen()) return [0, 0]; if (SGK.GATHERUI && SGK.GATHERUI.isOpen()) return [0, 0]; // 2.27.0 釣り場の画面 // 2.25.0 採掘の画面ではコントローラーを採掘に使う
  if (SGK.YUGIUI && SGK.YUGIUI.isOpen()) { for (let i = 0; i < 20; i++) padPrev[i] = true; return [0, 0]; } // 2.106.12 遊戯屋（戦国思想録）は札の画面がコントローラーを読む。閉じた時に押していたボタンを数えない
  if (SGK.PARTY && SGK.PARTY.current && SGK.PARTY.current()) return [0, 0]; // 2.99.2 みんなで遊ぶの最中はコントローラーで地図を動かさない
  if ((SGK.NINJA && SGK.NINJA.on) || (SGK.NINJA3D && SGK.NINJA3D.on)) return [0, 0]; // 0.77.0 潜入中
  // 0.63.1 PCで別の機器（仮想コントローラーなど）が先に並ぶと使えなくなるので、最後に触ったコントローラーを使う（なければ標準配置のもの）
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [];
  for (const p of pads) if (p.buttons.some((b) => b && b.pressed)) { if (G.padIdx !== p.index) { G.padIdx = p.index; for (const k in padPrev) padPrev[k] = true; } break; }
  const gp = pads.find((p) => p.index === G.padIdx) || pads.find((p) => p.mapping === 'standard') || pads[0]; if (!gp) return [0, 0];
  const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const down = (i) => btn(i) && !padPrev[i];
  const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
  const stickNav = activeMenu() !== $('battle'); // 戦闘中は左スティックを移動先に使うので、メニュー移動は十字キーだけ
  let nx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0) + (stickNav && Math.abs(lx) > 0.5 ? Math.sign(lx) : 0);
  let ny = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0) + (stickNav && Math.abs(ly) > 0.5 ? Math.sign(ly) : 0);
  let move = [0, 0];
  if (activeMenu()) {
    const now = performance.now();
    const inBattle = activeMenu() === $('battle');
    if (inBattle) { // 戦闘：十字キーの左右で下のボタン（自動で決着・退却）を選び、もう一度押すと選択をやめる。ボタン選択中だけ ×/A で押す
      const bb = menuButtons($('battle'));
      if (down(8)) { G.bpick = G.bpick ? null : bb[0] || null; G.bshare = !!G.bpick; setFocus($('battle'), G.bpick || null); } /* 1.6.62 シェアボタンで下のボタンへ移る／戻る */
      if ((!ML() || G.bpick) && (down(14) || down(15))) { const i = bb.indexOf(G.bpick), d = down(15) ? 1 : -1, j = i + d; G.bpick = j >= 0 && j < bb.length && i !== -1 ? bb[j] : G.bshare && i !== -1 ? bb[i] : i === -1 ? bb[d > 0 ? 0 : bb.length - 1] : null; setFocus($('battle'), G.bpick || null); }
      if (G.bpick && !bb.includes(G.bpick)) G.bpick = null;
      if (G.bshare && !G.bpick) G.bshare = false;
      if (down(0) && G.bpick) { const b = G.bpick; G.bpick = null; G.bshare = false; setFocus($('battle'), null); b.click(); }
      else if (ML() && !G.bpick) { // 0.64.0 りょうさんの配置：R1攻撃 L1防御 L2ホイールで隊選び R2そこへ移動 十字↑突撃↓停止→照準の方を向く←AI任せ ✕ジャンプ ○回避 △武器持ち替え □随行
        G.padMv = [lx, ly]; G.padAim = null; G.padUsed = true; G.vcurOn = false;
        const wh = btn(6), AB0 = actB(), r2 = btn(7); // 0.75.0 R2：短く押すとそこへ移動、長押しで隊形のホイール
        if (r2) G.r2t = (G.r2t || 0) + dt;
        const fw = r2 && G.r2t > 0.35 && !wh;
        if (wh && AB0) { // L2を押している間：右スティックで隊を選ぶ。離すと決定
          const TRs = SIM.TROOPS, L = [['all', '全軍'], ...myUnits3(AB0).sort((a, b) => a.idx - b.idx).map((u) => [u.id, `${u.idx - 1} ${TRs[u.type].short || TRs[u.type].name}${u.n}`])];
          if (!R.wheel || R.wheel.k) R.wheel = { L, i: Math.max(0, L.findIndex((x) => x[0] === G.selUnit)) };
          R.wheel.L = L; if (R.wheel.i >= L.length) R.wheel.i = 0;
          if (Math.hypot(rx, ry) > 0.5) { const a = (Math.atan2(rx, -ry) + Math.PI * 2) % (Math.PI * 2); R.wheel.i = Math.round(a / (Math.PI * 2 / L.length)) % L.length; }
        } else if (fw && AB0) {
          if (!R.wheel || R.wheel.k !== 'form') R.wheel = { k: 'form', L: [...ORDK.form.map((o, i) => [o, ORDM.form[i][1]]), ['fire:1', '自由に射て'], ['fire:0', '射撃をやめよ']], i: -1 };
          if (Math.hypot(rx, ry) > 0.5) { const n = R.wheel.L.length, a = (Math.atan2(rx, -ry) + Math.PI * 2) % (Math.PI * 2); R.wheel.i = Math.round(a / (Math.PI * 2 / n)) % n; }
        } else {
          if (R.wheel && R.wheel.k === 'form') { const it = R.wheel.L[R.wheel.i]; R.wheel = null; if (it) ord3(it[0]); }
          else if (R.wheel) { const it = R.wheel.L[R.wheel.i]; R.wheel = null; if (it) { G.selUnit = it[0]; battleHtml = ''; toast(`${it[1]}を選びました`, 800); } }
          const c = R.acam; c.yaw = (c.yaw || 0) + rx * 2.6 * dt; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + ry * 1.6 * dt));
        }
        G.padAtk = btn(5); G.padBlk = btn(4);
        if (down(0)) G.actJmp = true; if (down(1)) G.actDash = true; if (btn(3)) { G.ytT = (G.ytT || 0) + dt; if (G.ytT >= 0.6 && !G.ytDone) { G.ytDone = true; G.actRide = true; } } else { if (G.ytT > 0 && !G.ytDone) G.actSw = true; G.ytT = 0; G.ytDone = false; } /* 1.6.17 △短押し＝持ち替え、長押し＝馬の乗り降り */ if (down(2)) ord3('follow');
        if (!r2 && G.r2t) { if (G.r2t <= 0.35) ord3('move'); G.r2t = 0; } if (down(12)) ord3('charge'); if (down(15)) ord3('guard'); if (down(13)) ord3('follow'); if (down(14)) ord3('hold'); // 2.6.1 ↑突撃 →防御 ↓追従 ←待機
        if (btn(10)) bZoom(1 - dt * 1.5); if (btn(11)) bZoom(1 + dt * 1.5);
      } else if (actB()) { // 0.56.0 アクション戦闘：左スティック移動・右スティック狙い・RT/A攻撃・Bかわす・LB/RB隊を選ぶ・X突撃・Y随行・十字↑待機↓後退
        // 0.61.0 右スティックはマウスのようにカーソルを動かす（狙いもカーソルの方）。Aでカーソルの隊を選ぶ、LTでそこへ動かす（押したまま動かすと向き）
        G.padMv = [lx, ly]; G.padAim = null; G.padUsed = false;
        const W0 = cv.clientWidth, H0 = cv.clientHeight; if (!G.vcur) G.vcur = [W0 / 2 + 80, H0 / 2];
        const am = Math.hypot(rx, ry);
        if (am > 0) { const sp = 1100 * Math.pow(am, 1.6) * dt; G.vcur = [Math.max(0, Math.min(W0, G.vcur[0] + rx / am * sp * Math.min(1, am))), Math.max(0, Math.min(H0, G.vcur[1] + ry / am * sp * Math.min(1, am)))]; G.vcurOn = true; }
        if (G.vcurOn) G.mouseXY = G.vcur;
        G.padAtk = btn(7); if (down(1)) G.actDash = true;
        if (down(0)) { G.vcurOn = true; G.mouseXY = G.vcur; actPick(G.vcur[0], G.vcur[1]); }
        if (down(6)) { G.vcurOn = true; G.padRD = G.vcur.slice(); }
        if (G.padRD && !btn(6)) { const D = G.padRD; G.padRD = null; actMoveTo(D, G.vcur); }
        if (down(4)) actSel(-1); if (down(5)) actSel(1);
        if (down(2)) actOrder('charge'); if (down(3)) actOrder('follow'); if (down(12)) actOrder('charge'); if (down(15)) actOrder('guard'); if (down(13)) actOrder('follow'); if (down(14)) actOrder('hold');
        if (btn(10)) bZoom(1 - dt * 1.5); if (btn(11)) bZoom(1 + dt * 1.5); // スティック押し込み：L3縮小・R3拡大
      } else { padBattle(down, lx + rx, ly + ry, dt); if (btn(6)) bZoom(1 - dt * 1.5); if (btn(7)) bZoom(1 + dt * 1.5); } // LT縮小・RT拡大
    } else {
      if (nx || ny) { if (!navHold || now - lastNav > (navHold === 1 ? 400 : 150)) { navMenu(Math.abs(nx) >= Math.abs(ny) ? Math.sign(nx) : 0, Math.abs(nx) >= Math.abs(ny) ? 0 : Math.sign(ny)); lastNav = now; navHold++; } }
      else navHold = 0;
      if (down(0)) pressMenu();
    }
    if (down(1) && !inBattle) { if (activeMenu() === $('namePanel')) nkDel(); else if (activeMenu() === $('mapPanel')) smClose(); else if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); }
    if (activeMenu() === $('mapPanel')) { if (down(4)) smZoom(1 / 1.5); if (down(5)) smZoom(1.5); }
    if (activeMenu() === $('town')) { if (down(4)) cycleTab(-1); if (down(5)) cycleTab(1); }
    else if (activeMenu() === $('char')) { if (down(4)) cycleCTab(-1); if (down(5)) cycleCTab(1); if (down(8)) openChar(false); }
    if (!inBattle && ry) { // 右スティック：開いている画面をスクロール
      const m = activeMenu(), sc = [m, ...m.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      if (sc) sc.scrollTop += ry * Math.abs(ry) * dt * 900;
    }
    if (down(3) && !inBattle && !$('mSub').classList.contains('hidden') && G.sub === 'inv') toggleMenu(false);
    if (down(9) && G.mode !== 'title') toggleMenu(inBattle);
  } else if (G.mode === 'host' || G.mode === 'client') {
    // 左スティック：画面のカーソルを動かす（端まで行くと地図が動く）。右スティック：視点
    const W = cv.clientWidth, H = cv.clientHeight;
    if (lx || ly) {
      if (!G.pcurOn) { G.pcurOn = true; G.pcur = [W / 2, H / 2]; }
      R.cam.follow = false; // 0.75.0 カーソルを自分で動かしたら追いかけをやめる
      const sp = 650 * dt;
      G.pcur[0] = Math.max(0, Math.min(W, G.pcur[0] + lx * Math.abs(lx) * sp * 1.3));
      G.pcur[1] = Math.max(0, Math.min(H, G.pcur[1] + ly * Math.abs(ly) * sp * 1.3));
      const E = 40, ex = G.pcur[0] < E && lx < 0 ? lx : G.pcur[0] > W - E && lx > 0 ? lx : 0, ey = G.pcur[1] < E && ly < 0 ? ly : G.pcur[1] > H - E && ly > 0 ? ly : 0;
      if (ex || ey) { R.cam.follow = false; R.cam.x += ex * dt * 600 / R.cam.scale; R.cam.y += ey * dt * 600 / R.cam.scale; }
    }
    if (rx || ry) { R.cam.follow = false; R.cam.x += rx * dt * 600 / R.cam.scale; R.cam.y += ry * dt * 600 / R.cam.scale; }
    if (btn(4)) R.zoom(1 - dt * 1.5, G.pcurOn ? G.pcur[0] : undefined, G.pcurOn ? G.pcur[1] : undefined);
    if (btn(5)) R.zoom(1 + dt * 1.5, G.pcurOn ? G.pcur[0] : undefined, G.pcurOn ? G.pcur[1] : undefined);
    // 拠点・部隊の情報ウインドウ：十字キーでボタンを選び、Aで押す（スティックを動かすとカーソル操作に戻る）
    const info = $('info'), infoOpen = !info.classList.contains('hidden');
    if (!infoOpen || lx || ly) { if (G.infoNav) { G.infoNav = false; setFocus(info, null); } }
    else if (down(12) || down(13) || down(14) || down(15)) {
      if (!G.infoNav) { G.infoNav = true; const g = $('infoGo'); setFocus(info, g.offsetParent ? g : menuButtons(info)[0]); }
      else navMenu(down(15) ? 1 : down(14) ? -1 : 0, down(13) ? 1 : down(12) ? -1 : 0, info);
    }
    if (down(0) && G.infoNav) { const b = currentFocus(info); if (b) b.click(); G.infoNav = false; setFocus(info, null); }
    else if (down(0)) {
      if (G.pcurOn) { // カーソルの位置をクリック：部隊なら情報、拠点なら選ぶ（選んだ拠点をもう一度で向かう）、地面ならそこへ移動
        const [sx, sy] = G.pcur, uh = unitHit(sx, sy), hit = R.hitSettlement(G.view, sx, sy);
        if (uh && hit && G.selKind === 'u' && G.selected === uh.id) selectSettlement(hit); // 2.102.2 重なっているときは、もう一度で拠点
        else if (uh) selectUnit(uh);
        else if (hit) { if (G.selKind !== 'u' && G.selected === hit.id) $('infoGo').click(); else selectSettlement(hit); }
        else { const [wx, wy] = R.toWorld(sx, sy); if (G.selected) selectSettlement(null); moveTo(wx, wy); }
      } else if (G.selected) $('infoGo').click();
      else if (!$('joinBtn').classList.contains('hidden')) $('joinBtn').click(); // 1.6.14 近くに合戦があればAで加わる
      else openTown(true);
    }
    if (down(1)) { if (G.selected) selectSettlement(null); else if (G.pcurOn || !R.cam.follow) { G.pcurOn = false; R.cam.follow = true; } else command({ type: 'stop' }); }
    if (down(8)) openChar(true);
    if (G.mode === 'host' && !infoOpen && (down(14) || down(15))) { const S = [0, 1, 2, 4, 8], i = S.indexOf(G.speed); G.autoPause = 0; G.speed = S[Math.max(0, Math.min(4, i + (down(15) ? 1 : -1)))]; toast(G.speed ? `時間の速さ ×${G.speed}` : '時間を止めました', 900); }
    if (down(2)) cycleNear();
    if (down(3)) openSub('inv'); // 1.3.0 △：持っている物資
    if (down(10)) { // L3：カーソルを自分の場所へ戻す（地図も自分に合わせて追従）
      const m = me(), d = m && (G.disp[m.id] || m);
      if (d) { R.cam.x = d.x; R.cam.y = d.y; R.cam.follow = true; G.pcurOn = true; G.pcur = [W / 2, H / 2]; }
    }
    if (down(9)) toggleMenu(true);
  }
  gp.buttons.forEach((b, i) => (padPrev[i] = b.pressed));
  return move;
}

