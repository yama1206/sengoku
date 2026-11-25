// 毎フレームの処理と、さいごの起動
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- 毎フレーム ----------
let lastFrame = performance.now(), dirSendAcc = 0, wasDirMoving = false;
let mapFrameReady = false, questsHtml = null;
function hitShow(wn, d) { /* 1.6.18 攻撃が当たったら画面の上に武器の名前とダメージ */
  let el = document.getElementById('hitLog');
  if (!el) { el = document.createElement('div'); el.id = 'hitLog'; el.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:50;pointer-events:none;text-align:center;font-weight:bold;text-shadow:0 0 4px #000,0 0 2px #000;color:#fff'; document.body.appendChild(el); }
  const r = document.createElement('div'); r.style.cssText = 'font-size:18px;transition:opacity .6s'; r.innerHTML = `${wn || '武器'}　<span style="color:#ffd24a">${d}</span>`;
  el.prepend(r); while (el.children.length > 4) el.lastChild.remove();
  setTimeout(() => { r.style.opacity = '0'; }, 1200); setTimeout(() => r.remove(), 1900);
}
function actInput(AB) {
  const h = AB.act.s.find((s) => s.pc === G.myPid), pm = G.padMv || [0, 0];
  if (h && h.hn !== G.lastHn) { if (G.lastHn != null && h.hn) hitShow(h.hw, h.hd); G.lastHn = h.hn; } /* 1.6.18 */
  const inp = { mx: pm[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my: pm[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0), atk: !!(G.actAtk || G.padAtk), dash: !!G.actDash, aim: null };
  G.actDash = false;
  if (G.tL) { const k = 55, dx = Math.max(-1, Math.min(1, (G.tL.x - G.tL.sx) / k)), dy = Math.max(-1, Math.min(1, (G.tL.y - G.tL.sy) / k)); inp.mx += dx; inp.my += dy; }
  if (G.tAtk) { inp.atk = true; G.tAtk = false; }
  if (!ML() && G.tAim != null && (G.tR || inp.atk)) inp.aim = G.tAim;
  if (ML()) { const y = R.acam.yaw || 0, f = -inp.my, r = inp.mx; inp.mx = Math.cos(y) * f - Math.sin(y) * r; inp.my = Math.sin(y) * f + Math.cos(y) * r; inp.aim = y; inp.blk = !!(G.actBlk || G.padBlk); inp.sw = !!G.actSw; inp.jmp = !!G.actJmp; inp.ride = !!G.actRide; G.actSw = G.actJmp = G.actRide = false; return inp; }
  if (h && G.actTouch) { const [x, y] = R.actToWorld(G.actTouch[0], G.actTouch[1]), d = Math.hypot(x - h.x, y - h.y); inp.aim = Math.atan2(y - h.y, x - h.x); if (d > 3.5) { inp.mx = (x - h.x) / d; inp.my = (y - h.y) / d; } inp.atk = d < 6; }
  else if (G.padAim != null) inp.aim = G.padAim;
  else if (h && G.mouseXY && !G.padUsed) { const [x, y] = R.actToWorld(G.mouseXY[0], G.mouseXY[1]); inp.aim = Math.atan2(y - h.y, x - h.x); }
  return inp;
}
// 1.6.2 描画中にエラーが出ても止まらないように（エラーの内容は画面に出す）
function frame(now) { try { frame0(now); } catch (e) { const t = 'エラー: ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastErr !== t) { G.lastErr = t; errToast(t); } requestAnimationFrame(frame); } }
function frame0(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  const padMove = pollPad(dt);
  if (G.mode === 'title') SGK.AUDIO.scene('title');
  if ((G.mode === 'host' || G.mode === 'client') && buildView()) {
    if (G.mode === 'host') { G.priv = SIM.privateState(G.world, G.myPid); SIM.drain(G.myPid).forEach(toastMsg); }
    // WASDで直接移動
    const BT = G.priv && G.priv.battle;
    if (BT && $('battle').classList.contains('hidden')) { SGK.AUDIO.sfx('battleStart'); $('battle').classList.remove('hidden'); openTown(false); openChar(false); selectSettlement(null); battleHtml = ''; }
    if (!BT && !$('battle').classList.contains('hidden')) { setTimeout(() => { if (performance.now() - resultSfxT > 1500) SGK.AUDIO.sfx('battleEnd'); }, 400); /* 1.6.58 勝ち負けの音が鳴るときは重ねない */ $('battle').classList.add('hidden'); battleHtml = ''; }
    let mx = BT ? 0 : padMove[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    let my = BT ? 0 : padMove[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
    const m = me(); dirSendAcc += dt;
    if (BT) { mx = my = 0; }
    if (m && (mx || my)) {
      if (dirSendAcc > 0.1) { dirSendAcc = 0; const l = Math.hypot(mx, my); command({ type: 'move', x: m.x + (mx / l) * 2, y: m.y + (my / l) * 2, steer: true }); R.cam.follow = true; }
      wasDirMoving = true;
    } else if (wasDirMoving) { wasDirMoving = false; command({ type: 'stop' }); }
    // なめらか表示
    const k = Math.min(1, dt * 12);
    for (const e of [...G.view.players, ...G.view.npcs]) {
      let d = G.disp[e.id];
      if (G.mode === 'client') { // 2.40.1 参加者：届いた位置へ、届く間隔ぶんの時間をかけて等速で動かす（0.2秒ごとの位置を追いかけるとカクつくため）
        if (!d || d.bx == null || Math.hypot(d.bx - e.x, d.by - e.y) > 40) G.disp[e.id] = d = { x: e.x, y: e.y, ax: e.x, ay: e.y, bx: e.x, by: e.y, t: now, dur: 200 };
        else {
          if (e.x !== d.bx || e.y !== d.by) { // 2.49.0 先読み：動いている向きへ、次の知らせが届くころの位置まで先に進めて表示の遅れを減らす（止まる時は少し行き過ぎて戻る）
            const iv = Math.min(400, Math.max(40, G.stIv || 100)), vx = e.x - d.bx, vy = e.y - d.by, L = Math.hypot(vx, vy), cap = L > 0 ? Math.min(1, 1.5 / L) : 0;
            d.ax = d.x; d.ay = d.y; d.bx = e.x; d.by = e.y; d.px = e.x + vx * 0.9 * cap; d.py = e.y + vy * 0.9 * cap; d.t = now; d.dur = iv; }
          const f = Math.min(1, (now - d.t) / d.dur), tx = d.px != null ? d.px : d.bx, ty = d.py != null ? d.py : d.by; d.x = d.ax + (tx - d.ax) * f; d.y = d.ay + (ty - d.ay) * f;
        }
      } else if (!d || Math.hypot(d.x - e.x, d.y - e.y) > 5) G.disp[e.id] = { x: e.x, y: e.y };
      else { d.x += (e.x - d.x) * k; d.y += (e.y - d.y) * k; }
    }
    const md = m && G.disp[m.id];
    if (R.cam.follow && md) { R.cam.x += (md.x - R.cam.x) * k; R.cam.y += (md.y - R.cam.y) * k; }
    const P = G.priv;
    if (BT) {
      mapFrameReady = false;
      for (const u of BT.units) {
        const key = 'u' + BT.id + '_' + u[0], d = G.disp[key];
        if (!d) G.disp[key] = { x: u[5], y: u[6] }; else { d.x += (u[5] - d.x) * k; d.y += (u[6] - d.y) * k; }
      }
      if (G.bcamFor !== BT.id) { // 新しい戦闘：自分の部隊が真ん中に来るように
        G.bcamFor = BT.id; const my = BT.units.filter((u) => u[2] === G.myPid);
        if (my.length) { R.bcam.x = my.reduce((a, u) => a + u[5], 0) / my.length + 90; R.bcam.y = my.reduce((a, u) => a + u[6], 0) / my.length; } R.bcam.z = 1;
        const h = my.find((u) => u[15]) || my.find((u) => u[3] === 'hero' && u[14] == null); G.selUnit = h ? h[0] : my[0] && my[0][0];
      }
      if (G.bcur) { R.bcam.x += (G.bcur[0] - R.bcam.x) * Math.min(1, k * 0.5); R.bcam.y += (G.bcur[1] - R.bcam.y) * Math.min(1, k * 0.5); }
      if (BT.plan) G.planOf = BT.id; else if (G.planOf === BT.id) { G.planOf = null; if (G.mode === 'host' && G.speed === 0) { G.speed = 1; G.autoPause = 0; toast('合戦が始まったので、時間を動かしました', 1500); } } // 2.23.1 止めたままだと合戦が進まないので
      if (G.actDef && BT.canAct && !BT.act && G.autoActFor !== BT.id) { G.autoActFor = BT.id; command({ type: 'actStart' }); } // 1.6.13 戦が始まったら自分で戦う
      const AB = actB();
      if (!AB) { R.act3dOn = false; if (R.ordMenu) ordMenu(null); }
      if (AB && G.yawFor !== AB.id) { G.yawFor = AB.id; const h0 = AB.act.s.find((s) => s.pc === G.myPid); R.acam.yaw = h0 && h0.side === 'B' ? Math.PI : 0; R.acam.pitch = 0.28; R.acam.z = 9; G.actBlk = false; if (document.body.classList.contains('touch')) { R.act3dOn = true; command({ type: 'order', unit: 'all', order: 'ai' }); } } // 2.7.1 スマホは3Dで、味方はAIに任せる
      if (document.pointerLockElement === cv && (!ML() || !$('gameMenu').classList.contains('hidden'))) document.exitPointerLock();
      if (AB) {
        const menuOpen = !$('gameMenu').classList.contains('hidden'), inp = menuOpen ? { mx: 0, my: 0, atk: false, dash: false, aim: null } : actInput(AB);
        if (G.mode === 'host') { AB.act.inp[G.myPid] = inp; if (inp.dash) AB.act.dq[G.myPid] = true; if (inp.sw) (AB.act.wq = AB.act.wq || {})[G.myPid] = true; if (inp.jmp) (AB.act.jq = AB.act.jq || {})[G.myPid] = true; if (inp.ride) (AB.act.rq = AB.act.rq || {})[G.myPid] = true; if (!(menuOpen && soloHost())) SIM.actStep(G.world, AB, dt); }
        else { // 0.62.0 参加者：入力をホストへ送り（かわすはすぐ）、自分の本人は手もとで先に動かす
          G.actSendAcc = (G.actSendAcc || 0) + dt; const key = `${inp.mx.toFixed(2)},${inp.my.toFixed(2)},${inp.aim == null ? '' : inp.aim.toFixed(2)},${inp.atk},${inp.blk}`;
          if (inp.dash || inp.sw || inp.jmp || inp.ride || (key !== G.actLastKey && G.actSendAcc > 0.05) || G.actSendAcc > 0.5) { G.actSendAcc = 0; G.actLastKey = key; command(Object.assign({ type: 'actIn' }, inp)); }
          SIM.actSmooth(AB, dt, G.myPid, inp);
        }
        R.actPad = !!G.padUsed; R.actCur = G.vcurOn && G.vcur ? { p: G.vcur, d: G.padRD } : null; R.aimXY = aimXY(); R.drawAction(ctx, AB, G.myPid, G.selUnit, dt, BT.ter); renderBattle(BT);
      } else { R.drawBattle(ctx, BT, G.disp, G.myPid, G.selUnit); renderBattle(BT); }
      if (G.bcur && !AB) { const L = R.battleLayout(SIM.FIELD); drawCross(L.ox + G.bcur[0] * L.sc, L.oy + G.bcur[1] * L.sc, '#f2c14e'); }
      { // 0.59.0 向きを決める矢印
        let a = null, b2 = null;
        if (!AB && G.fpick) { const L = R.battleLayout(SIM.FIELD); a = [L.ox + G.fpick.x * L.sc, L.oy + G.fpick.y * L.sc]; b2 = G.bcur && !(G.hovT > performance.now() - 1500) ? [L.ox + G.bcur[0] * L.sc, L.oy + G.bcur[1] * L.sc] : G.hov; }
        const rp = [...ptrs.values()].find((q) => q.btn === 2); if (!AB && rp && dragMoved && G.selUnit != null) { a = [rp.sx, rp.sy]; b2 = [rp.x, rp.y]; }
        if (AB && G.actRD && G.mouseXY) { a = G.actRD; b2 = G.mouseXY; }
        if (a) { ctx.save(); ctx.strokeStyle = '#ffe070'; ctx.fillStyle = '#ffe070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, 7); ctx.fill();
          if (b2 && Math.hypot(b2[0] - a[0], b2[1] - a[1]) > 8) { const an = Math.atan2(b2[1] - a[1], b2[0] - a[0]), e2 = [a[0] + Math.cos(an) * 46, a[1] + Math.sin(an) * 46];
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke(); ctx.beginPath(); ctx.moveTo(e2[0] + Math.cos(an) * 8, e2[1] + Math.sin(an) * 8); ctx.lineTo(e2[0] + Math.cos(an + 2.4) * 12, e2[1] + Math.sin(an + 2.4) * 12); ctx.lineTo(e2[0] + Math.cos(an - 2.4) * 12, e2[1] + Math.sin(an - 2.4) * 12); ctx.fill(); }
          ctx.restore(); }
      }
    } else {
      G.bcur = null;
      G.view.myClan = P && P.me && P.me.rank ? P.me.rank.clan || null : null;
      G.view.myHome = P && P.me && P.me.home ? P.me.home.id : null; // 2.40.0 自宅のある拠点を地図で目立たせる
      const mapCovered = $('yugiHall') || $('gbHall') || $('ptGame');
      const townOpen = !$('town').classList.contains('hidden');
      // 町の周りには最後に描いた地図を残す。全画面の遊びの裏では描かない。
      if (!mapCovered && (!townOpen || !mapFrameReady)) {
        R.draw(ctx, G.view, G.disp, G.myPid, G.selected, questMarks());
        if (G.pcurOn) drawMapCur(G.pcur[0], G.pcur[1]);
        mapFrameReady = true;
      }
    }
    { const mt = P && P.me && P.me.meet; if (mt && mt !== G.lastMeet && !BT) { const u = findUnit(mt); if (u) { selectUnit(u); toast('追いつきました。話しかけるか、攻めかかるかを選んでください（閉じると相手は動き出します）', 3500); } } G.lastMeet = mt || null; } // 0.73.4
    if (G.selKind === 'u' && !BT) refreshUnitInfo();
    $('townBtn').classList.toggle('hidden', !(P && P.here) || !!BT);
    $('testBtn').classList.toggle('hidden', !(P && P.me && P.me.test) || !!BT); // 2.12.1
    $('ledgerBtn').classList.toggle('hidden', !(P && P.me && P.me.test) || !!BT || G.mode !== 'host'); // 2.58.0 帳簿
    if (SGK.RENDER && SGK.RENDER.act3d) SGK.RENDER.act3d.cloth = P && P.battle ? P.battle.cloth || null : null; // 2.12.5 戦場の服の色
    if (SGK.YUGIUI && SGK.YUGIUI.isOpen()) SGK.YUGIUI.update(P); // 2.102.0 遊戯屋（所持金を届ける）
    if (SGK.GAMBLEUI && SGK.GAMBLEUI.isOpen()) { const nw = performance.now(); if (!G.gbUiT || nw - G.gbUiT > 250) { G.gbUiT = nw; SGK.GAMBLEUI.update(P); } } // 2.12.4 賭場の画面
    $('joinBtn').classList.toggle('hidden', !(P && P.nearBattle) || !!BT); if (P && P.nearBattle) $('joinBtn').textContent = `合戦に加わる（${P.nearBattle.foe}）${G.padUsed ? ' Ⓐ' : ' [E]'}`;
    // 拠点に着いたら自動で拠点画面を開く
    const hereId = P && P.here && !BT ? P.here.id : null;
    if (hereId && hereId !== G.lastHere && $('char').classList.contains('hidden') && $('gameMenu').classList.contains('hidden')) { SGK.AUDIO.sfx('arrive'); openTown(true); }
    // BGM：戦闘・拠点の中・昼・夜で曲を変える
    SGK.AUDIO.scene(SGK.YUGIUI && SGK.YUGIUI.isOpen() ? 'hayashi' /* 2.102.0 遊戯屋の中はカードゲームがBGMを鳴らすので町の曲は止める */ : SGK.NINJA3D && SGK.NINJA3D.on && SGK.NINJA3D.night() ? 'ninja_night' /* 2.24.1 忍びの任務（夜） */ : BT ? (BT.ck ? 'siege' : 'battle') /* 2.20.0 城の戦は攻城戦の曲 */ : SGK.PARTY && SGK.PARTY.current && SGK.PARTY.current() === 'hayashi' ? 'hayashi' /* 2.68.0 囃子合わせは曲そのものを叩くので BGM なし */ : document.getElementById('ptGame') || document.getElementById('kmCraft') || (SGK.GAMBLEUI && SGK.GAMBLEUI.isOpen() && SGK.ASOBIUI && SGK.ASOBIUI.has(SGK.GAMBLEUI.tab())) ? 'asobi' /* 2.62.2 遊び（みんなで遊ぶ・蹴鞠・独楽・貝絵合わせ・双六）はまとめて同じ曲 */ : SGK.GAMBLEUI && SGK.GAMBLEUI.isOpen() ? 'gamble' : !$('town').classList.contains('hidden') ? (TOWN_BGM[townTab] || 'town') : SIM.daylight(G.view.t) < 0.5 ? 'night' : 'day');
    G.lastHere = hereId;
    { // 0.73.0 評定が開かれたら人物画面の「評定」を開く
      const hy = P && P.me && P.me.hyo; $('ctab-hyo').classList.toggle('hidden', !hy);
      if (hy && G.hyoSeen !== hy.id) { G.hyoSeen = hy.id; SGK.AUDIO.sfx('arrive'); openChar(true); setCTab('hyo'); }
      else if (!hy && charTab === 'hyo') { charTab = 'eq'; charHtml = ''; }
    }
    if (!$('town').classList.contains('hidden')) renderTown();
    if (!$('char').classList.contains('hidden')) renderChar();
    if (P) {
      { // 本人の体力（傷は戦のあとも残り、拠点で休むと治る）
        const max = P.me.hpMax || 35, BT2 = P.battle, h = BT2 && BT2.units.find((u) => u[2] === G.myPid && u[3] === 'hero');
        const hp = BT2 ? (h ? Math.max(0, h[11] != null ? h[11] : max) : 0) : Math.round(max * (P.me.hpFrac == null ? 1 : P.me.hpFrac)), r = Math.max(0, Math.min(1, hp / max));
        const html = `体力 <span style="display:inline-block;width:110px;height:9px;background:rgba(0,0,0,.55);border:1px solid #0008;vertical-align:middle"><span style="display:block;height:100%;width:${(r * 100).toFixed(0)}%;background:${r > 0.5 ? '#6fbf73' : r > 0.25 ? '#e0c060' : '#e07a6a'}"></span></span> ${hp}/${max}${!BT2 && r < 1 ? `<span class="muted">（${P.here ? '休んで回復中' : '拠点で休むと治る'}）</span>` : ''}`;
        if ($('hpBar').innerHTML !== html) $('hpBar').innerHTML = html;
      }
      { const wb = P.me.warBoard || [], el = $('warBoard'), h = wb.length ? '<b>戦況</b>' + wb.map((x) => `<div style="color:${x.atk ? '#e0c060' : '#ff6a4a'}">${SGK.ICON.html(x.atk ? 'swords' : 'warn', 16)} ${x.text}</div>`).join('') : '';
        el.classList.toggle('hidden', !h || !!(G.priv && G.priv.battle)); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } }
      renderCaptive(P.me);
      const nextQuestsHtml = `所持金 ${SIM.money(P.me.money)}　${loadTxt(P.me)}　名声 ${P.me.fame}${P.me.infamy ? `　<span style="color:#e07a6a">悪名 ${P.me.infamy}</span>` : ''}${P.me.rank && P.me.rank.clan ? `　功績 ${P.me.rank.merit}${(() => { const n = SIM.RANKS[P.me.rank.rank + 1]; return n && !n.indep ? '/' + n.merit : ''; })()}` : ''}　兵 ${SIM.troopCount(P.me.troops)}/${P.me.troopCap}　行軍 ${P.me.speed}km/日` + (P.me.wage ? `<br>兵の給金 ${SIM.money(P.me.wage)}/日${P.me.money < P.me.wage ? '　<b style="color:#e07a6a">払えません</b>' : '（約' + Math.floor(P.me.money / P.me.wage) + '日分）'}` : '') + (P.me.riceNeed ? `<br>士気 <b style="color:${P.me.morale < 35 ? '#e07a6a' : P.me.morale < 60 ? '#e0c060' : '#6fbf73'}">${P.me.morale}</b>　兵糧 ${P.me.foodList || 'なし'}（米に直して1日${P.me.riceNeed}俵・${P.me.hungry ? '<b style="color:#e07a6a">食料が足りません</b>' : '約' + P.me.riceDays + '日分'}）` : '') + (P.me.follow ? `<br>追跡中：${P.me.follow}` : '') + (P.me.busy ? `<br>${P.me.busy.label}中…` : '')
        + P.me.quests.map((q) => `<div class="q">◆ ${q.title}（${q.where || (q.type === 'deliver' ? sName(q.to) + 'へ' : sName(q.from) + 'へ納品')}・${dayLeft(q.deadline)}）</div>`).join('') + (P.me.nin && P.me.nin.q ? `<div class="q">◆ ${SIM.NIN.jobs[P.me.nin.q.k].name}（${sName(P.me.nin.q.to)}・${dayLeft(P.me.nin.q.deadline)}）</div>` : '') + (P.me.nin && P.me.nin.def ? `<div class="q" style="color:#ff8a6a">◆ 城の守り：曲者を捕らえる（${sName(P.me.nin.def.to)}・${dayLeft(P.me.nin.def.deadline)}）</div>` : '');
      if (questsHtml !== nextQuestsHtml) {
        $('quests').innerHTML = nextQuestsHtml;
        questsHtml = nextQuestsHtml;
      }
    }
    // HUD
    const dEl = $('date'); dEl.textContent = SIM.formatDate(G.view.t) + (G.speed === 0 ? '（停止中）' : G.speed > 1 ? (G.inBattle ? '（戦闘中のため×1）' : `（×${G.speed}）`) : '');
    { SIM.wxSet && SIM.wxSet(G.view.t); const wx = SIM.weatherAt && SIM.weatherAt(G.view.t); if (wx) { const sp = document.createElement('span'); sp.className = 'wx'; sp.title = wx.name + (wx.fx ? '：' + wx.fx : ''); sp.innerHTML = ' ' + (SGK.ICON && wx.ico ? SGK.ICON.fb(wx.ico, 20, wx.mark) : wx.mark); dEl.appendChild(sp); } } // 2.52.0 時間の横に天気（2.54.0 絵。読めなければ絵文字）
    if (m) {
      const at = m.at && G.view.settlements.find((s) => s.id === m.at);
      $('status').textContent = `${m.name}（${m.status || '浪人'}）　${BT ? '戦闘中' : at ? at.name + 'に滞在中' : m.tx != null ? `移動中（${SIM.placeName(m.x, m.y)}）` : `野外（${SIM.terrainAt(m.x, m.y)}）`}`;
    }
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === G.speed));
  }
  requestAnimationFrame(frame);
}
const fit = () => { R.resize(cv); mapFrameReady = false; };
let fitW = 0, fitH = 0; setInterval(() => { const w = cv.clientWidth, h = cv.clientHeight; if (w && h && (w !== fitW || h !== fitH)) { fitW = w; fitH = h; fit(); } }, 300); // 2.99.3 縦横を切り替えた時、大きさの知らせが来なくても地図を合わせ直す
window.addEventListener('resize', fit); fit();
requestAnimationFrame(frame);
setFocus($('titleMenu'), $('btnNew'));
show('title');
