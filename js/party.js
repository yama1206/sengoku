// 2.42.0 みんなで遊ぶミニゲーム：馬の障害レース／弓の的当て大会（どちらも個人戦・チーム戦）／荷運び競争（協力）
// 町の通りの「みんなで遊ぶ」から部屋を作り、同じ町にいる人を誘う。やりとりは忍びの協力任務と同じ中継（main.js の ninRelay、ch:'party'）を使う。
//  レース・弓：全員が同じ種（seed）で同じ障害物・的を出し、それぞれの端末で動かして、位置・点数だけ送り合う（順位は各端末で数える）
//  荷運び：部屋を作った人（リーダー）の端末が荷車を動かして全員に配る。報酬は sim/party.js の partyResult
// 絵は仮：馬・人・荷車・的は canvas で描いた簡単な形（あとで絵に置き換えやすいよう、描く関数を分けてある）
(function () {
  const SGK = window.SGK, PT = (SGK.PARTY = {});
  let ENV = null; // { me(), name(), others(), send(to, m), cmd(c) }
  PT.init = (e) => { ENV = e; };
  const GAMES = {
    race: { name: '馬の障害レース', max: 5, team: true, desc: '柵や堀を跳び越えて走り、ゴールの順位を競う。ジャンプ＝A／Space、ダッシュ＝↑／B（スタミナを使う）' },
    archery: { name: '弓の的当て大会', max: 5, team: true, desc: '動く的を10本で射抜いて点を競う。風で矢が流れる。狙う＝マウス／矢印／スティック、射つ＝クリック／A／Space。金の的は2倍' },
    fish: { name: '釣り大会', max: 5, team: true, mode: true, desc: '朝・昼・夕の3日間（1日40秒）で釣りくらべ。釣り方はいつもの釣りと同じ（浮きを投げる→アタリ→タイミング）。勝ち方は「いちばん大きい魚」か「釣った数」を選べます' },
    cart: { name: '荷運び競争（協力）', max: 5, team: false, desc: '全員で荷車を引いてゴールまで運ぶ。←→で進む道を選ぶ（みんなの平均で進む）、A／Spaceを押している間引く。岩にぶつかると荷が崩れる' },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const TEAM = [{ n: '赤', c: '#e0463c' }, { n: '白', c: '#f2f2f2' }], PAL = ['#e0463c', '#3c8ce0', '#e0b43c', '#4cc06a', '#b46ae0'];
  const send = (to, m) => { if (ENV && to.length) ENV.send(to, Object.assign({ ch: 'party' }, m)); };

  // ---- 見た目（CSS） ----
  let css = false;
  function addCss() {
    if (css) return; css = true; const s = document.createElement('style');
    s.textContent = `#ptBox,#ptRes{position:fixed;inset:0;z-index:9300;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:inherit}
#ptBox>div,#ptRes>div{background:#2a2118;color:#f3ead2;border:2px solid #a07c42;border-radius:10px;padding:16px 20px;max-width:min(92vw,460px);box-shadow:0 8px 30px #000a}
#ptBox h2,#ptRes h2{margin:0 0 6px;color:#f2c14e;font-size:20px}#ptBox .d{font-size:13px;color:#cdbf9a;margin-bottom:8px}
#ptBox button,#ptRes button,#ptInv button,#ptGame .tb button{font:inherit;color:#f3ead2;background:linear-gradient(#5a3e22,#2e2012);border:1px solid #a07c42;border-radius:6px;padding:7px 12px;margin:3px 3px 0 0;cursor:pointer}
#ptBox .m{padding:3px 0;border-bottom:1px solid #fff2}#ptRes .r{padding:3px 0;border-bottom:1px solid #fff2}
#ptInv{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9400;background:#2a2118;color:#f3ead2;border:2px solid #f2c14e;border-radius:10px;padding:10px 14px;box-shadow:0 4px 18px #000a;max-width:92vw}
#ptGame{position:fixed;inset:0;z-index:9200;background:#000}#ptGame canvas{width:100%;height:100%;display:block;touch-action:none}
#ptGame .tb{position:absolute;right:8px;top:8px}#ptGame .pad{position:absolute;bottom:14px;display:none;gap:10px}
#ptGame .pad button{width:64px;height:64px;border-radius:32px;font-size:15px;opacity:.85}`;
    document.head.appendChild(s);
  }
  const box = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; document.body.appendChild(e); } return e; };

  // =====================================================================
  // 部屋と招待
  // =====================================================================
  let LB = null, RUN = null, invT = null; // LB＝部屋 { g, rid, lead, leader, mem:[{id,name}], team }
  const memIds = () => (LB ? LB.mem.map((x) => x.id).filter((id) => id !== ENV.me()) : []);
  PT.openLobby = (g) => {
    if (!ENV || RUN) return; addCss();
    LB = { g, rid: ENV.me() + '-' + Date.now(), lead: true, leader: ENV.me(), mem: [{ id: ENV.me(), name: ENV.name() }], team: false, mode: 'big' };
    drawLobby();
  };
  function closeLobby(tell) { if (LB && tell && !LB.lead) send([LB.leader], { k: 'leave', rid: LB.rid }); if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: [], closed: 1 }); LB = null; const b = document.getElementById('ptBox'); if (b) b.remove(); }
  function pushMem() { if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: LB.mem, team: LB.team, mode: LB.mode }); }
  function drawLobby() {
    if (!LB) return; const d = GAMES[LB.g], e = box('ptBox'), n = LB.mem.length;
    const list = LB.mem.map((x, i) => `<div class="m">${LB.team ? `<b style="color:${TEAM[i % 2].c}">${TEAM[i % 2].n}</b> ` : ''}${esc(x.name)}${x.id === LB.leader ? '（リーダー）' : ''}</div>`).join('');
    e.innerHTML = `<div><h2>${d.name}</h2><div class="d">${esc(d.desc)}</div><div>参加者 ${n}/${d.max}人${LB.team ? '（チーム戦：交互に赤・白）' : ''}${d.mode ? `　勝ち方：${LB.mode === 'big' ? '大物（いちばん大きい魚）' : '数（釣った数）'}` : ''}</div>${list}
      <div style="margin-top:8px">${LB.lead ? `<button data-a="inv">同じ町の人を誘う</button>${d.team ? `<button data-a="team">${LB.team ? '個人戦にする' : 'チーム戦にする'}</button>` : ''}${d.mode ? '<button data-a="mode">勝ち方を変える</button>' : ''}${n >= 2 ? '<button data-a="go">出発する</button>' : ''}<button data-a="solo">ひとりで練習（報酬なし）</button>` : '<div class="d">リーダーが出発すると始まります</div>'}<button data-a="close">${LB.lead ? 'やめる' : '抜ける'}</button></div></div>`;
    e.onclick = (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || !LB) return; const a = b.dataset.a;
      if (a === 'inv') { const to = ENV.others().map((x) => x.id); send(to, { k: 'inv', g: LB.g, rid: LB.rid, nm: ENV.name(), team: LB.team, mode: LB.mode }); b.textContent = to.length ? `${to.length}人に声をかけた` : '同じ町にほかの人がいません'; }
      else if (a === 'team') { LB.team = !LB.team; pushMem(); drawLobby(); }
      else if (a === 'mode') { LB.mode = LB.mode === 'big' ? 'num' : 'big'; pushMem(); drawLobby(); }
      else if (a === 'go') startRoom(false);
      else if (a === 'solo') startRoom(true);
      else closeLobby(true);
    };
  }
  function startRoom(solo) {
    const seed = (Math.random() * 1e9) | 0, mem = (solo ? [LB.mem[0]] : LB.mem).map((x, i) => ({ id: x.id, name: x.name, tm: i % 2 }));
    const cfg = { g: LB.g, seed, mem, team: !solo && LB.team, lead: LB.leader, solo, mode: LB.mode };
    if (!solo) send(memIds(), { k: 'go', rid: LB.rid, cfg });
    closeLobby(false); startGame(cfg);
  }
  function showInvite(from, m) {
    if (RUN || !GAMES[m.g]) return; addCss(); const e = box('ptInv'); clearTimeout(invT);
    e.innerHTML = `<b>${esc(m.nm)}</b>が『${GAMES[m.g].name}』${m.team ? '（チーム戦）' : ''}の仲間を募っています <button data-a="y">参加する</button><button data-a="n">閉じる</button>`;
    e.onclick = (ev) => { const b = ev.target.closest('button[data-a]'); if (!b) return; e.remove(); if (b.dataset.a !== 'y') return; if (LB) closeLobby(true); LB = { g: m.g, rid: m.rid, lead: false, leader: from, mem: [], team: !!m.team, mode: m.mode || 'big' }; send([from], { k: 'join', rid: m.rid, nm: ENV.name() }); drawLobby(); };
    invT = setTimeout(() => { if (e.parentNode) e.remove(); }, 60000);
  }

  PT.recv = (from, m) => {
    if (!ENV || !m) return;
    if (m.k === 'inv') return showInvite(from, m);
    if (m.k === 'join') { if (LB && LB.lead && m.rid === LB.rid && LB.mem.length < GAMES[LB.g].max && !LB.mem.some((x) => x.id === from)) { LB.mem.push({ id: from, name: m.nm }); pushMem(); drawLobby(); } return; }
    if (m.k === 'leave') { if (LB && LB.lead && m.rid === LB.rid) { LB.mem = LB.mem.filter((x) => x.id !== from); pushMem(); drawLobby(); } return; }
    if (m.k === 'mem') { if (LB && !LB.lead && m.rid === LB.rid) { if (m.closed) { closeLobby(false); ENV.toast && ENV.toast('部屋がなくなりました'); } else { LB.mem = m.mem; LB.team = !!m.team; LB.mode = m.mode || 'big'; drawLobby(); } } return; }
    if (m.k === 'go') { if (LB && !LB.lead && m.rid === LB.rid && !RUN) { closeLobby(false); startGame(m.cfg); } return; }
    if (RUN && RUN.on) RUN.on(from, m);
  };

  // =====================================================================
  // 実行の枠（canvas・入力・終わりの表示）
  // =====================================================================
  const IN = { l: 0, r: 0, u: 0, d: 0, a: 0, b: 0, aT: 0, lT: 0, rT: 0, mx: null, my: null, click: 0 };
  let keysBound = false;
  function bindKeys() {
    if (keysBound) return; keysBound = true;
    const map = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd', ' ': 'a', z: 'a', Z: 'a', Enter: 'a', x: 'b', X: 'b', Shift: 'b' };
    addEventListener('keydown', (e) => { if (!RUN) return; const k = map[e.key]; if (!k) return; e.preventDefault(); if (!IN[k] && !e.repeat) { if (k === 'a') IN.aT = 1; if (k === 'l') IN.lT = 1; if (k === 'r') IN.rT = 1; } IN[k] = 1; });
    addEventListener('keyup', (e) => { if (!RUN) return; const k = map[e.key]; if (k) { e.preventDefault(); IN[k] = 0; } });
  }
  let padA = false, padL = false, padR = false;
  function readPad() {
    const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((g) => g && g.connected); if (!gp) return { x: 0, y: 0 };
    const x = Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, y = Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0, a = !!(gp.buttons[0] && gp.buttons[0].pressed), b = !!(gp.buttons[2] && gp.buttons[2].pressed || gp.buttons[1] && gp.buttons[1].pressed);
    const l = x < -0.5 || !!(gp.buttons[14] && gp.buttons[14].pressed), r = x > 0.5 || !!(gp.buttons[15] && gp.buttons[15].pressed);
    if (a && !padA) IN.aT = 1; if (l && !padL) IN.lT = 1; if (r && !padR) IN.rT = 1; padA = a; padL = l; padR = r; IN.pa = a; IN.pb = b; IN.pu = y < -0.5 || !!(gp.buttons[12] && gp.buttons[12].pressed);
    return { x, y };
  }
  function startGame(cfg) {
    if (RUN || !GAMES[cfg.g]) return; addCss(); bindKeys();
    const root = box('ptGame'); root.innerHTML = '<canvas></canvas><div class="tb"><button data-a="quit">やめる</button></div><div class="pad pl"></div><div class="pad pr"></div>';
    const cv = root.querySelector('canvas'), g2 = cv.getContext('2d'), me = ENV.me();
    const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); const onR = () => fit(); addEventListener('resize', onR);
    // 画面の操作ボタン（タッチのときだけ）
    const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), hold = (el, k) => { const on = (e) => { e.preventDefault(); if (!IN[k]) { if (k === 'a') IN.aT = 1; if (k === 'l') IN.lT = 1; if (k === 'r') IN.rT = 1; } IN[k] = 1; }, off = (e) => { e.preventDefault(); IN[k] = 0; }; el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off); };
    const mkBtn = (host, txt, k) => { const b = document.createElement('button'); b.textContent = txt; host.appendChild(b); hold(b, k); };
    const pl = root.querySelector('.pl'), pr = root.querySelector('.pr');
    if (touch) { pl.style.display = pr.style.display = 'flex'; pl.style.left = '14px'; pr.style.right = '14px'; if (cfg.g === 'cart') { mkBtn(pl, '←', 'l'); mkBtn(pl, '→', 'r'); mkBtn(pr, '引く', 'a'); } else if (cfg.g === 'race') { mkBtn(pl, 'ダッシュ', 'b'); mkBtn(pr, 'ジャンプ', 'a'); } else if (cfg.g === 'fish') mkBtn(pr, '釣る', 'a'); else mkBtn(pr, '射つ', 'a'); }
    const ptr = (e) => { const r = cv.getBoundingClientRect(); IN.mx = (e.clientX - r.left) * cv.width / r.width; IN.my = (e.clientY - r.top) * cv.height / r.height; };
    cv.addEventListener('pointermove', ptr); cv.addEventListener('pointerdown', (e) => { ptr(e); if (cfg.g === 'archery') IN.click = 1; else if (cfg.g === 'fish') IN.aT = 1; });
    const env = { cfg, me, ids: cfg.mem.map((x) => x.id), names: Object.fromEntries(cfg.mem.map((x) => [x.id, x.name])), tm: Object.fromEntries(cfg.mem.map((x) => [x.id, x.tm])), others: cfg.mem.map((x) => x.id).filter((id) => id !== me), cv, g2, finished: false, gone: {} };
    const game = { race: raceGame, archery: archeryGame, cart: cartGame, fish: fishGame }[cfg.g](env);
    let raf = 0, last = performance.now(); const stop = () => { cancelAnimationFrame(raf); removeEventListener('resize', onR); root.remove(); RUN = null; for (const k of ['l', 'r', 'u', 'd', 'a', 'b']) IN[k] = 0; };
    RUN = { on: (from, m) => { if (m.k === 'quit') { env.gone[from] = 1; } if (game.msg) game.msg(from, m); } };
    env.end = (res) => { if (env.finished) return; env.finished = true; showResult(env, res, () => stop()); };
    root.querySelector('button[data-a="quit"]').onclick = () => { send(env.others, { k: 'quit' }); stop(); };
    const loop = (t) => {
      raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
      const pd = readPad(); env.pad = pd; IN.dash = IN.b || IN.u || IN.r || IN.pb || IN.pu; IN.pull = IN.a || IN.pa;
      try { if (!env.finished) game.update(dt); game.draw(); } catch (e) { console.error(e); stop(); return; }
      IN.aT = IN.lT = IN.rT = IN.click = 0;
    };
    raf = requestAnimationFrame(loop);
  }
  function showResult(env, res, close) { // res＝{ title, rows:[html], cmd }
    const e = box('ptRes'); e.innerHTML = `<div><h2>${esc(res.title)}</h2>${res.rows.map((r) => `<div class="r">${r}</div>`).join('')}<div style="margin-top:8px"><button data-a="ok">閉じる</button></div></div>`;
    if (res.cmd && !env.cfg.solo) ENV.cmd(res.cmd);
    e.querySelector('button').onclick = () => { e.remove(); close(); };
  }
  const nameOf = (env, id) => env.names[id] || '？';
  const tcol = (env, id) => (env.cfg.team ? TEAM[env.tm[id]].c : PAL[env.ids.indexOf(id) % 5]);
  function drawText(g, s, x, y, o) { o = o || {}; g.font = (o.b ? 'bold ' : '') + (o.sz || 16) + 'px sans-serif'; g.textAlign = o.al || 'left'; g.fillStyle = o.c || '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(s, x, y); g.fillText(s, x, y); }

  // ---- 馬・人の絵（仮） ----
  function drawHorse(g, x, y, sc, col, ph, air) { // x,y＝足もと
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; const sw = air ? 0.9 : Math.sin(ph) * 0.8;
    for (const [lx, a] of [[-14, 0], [-10, Math.PI], [10, Math.PI * 0.5], [14, Math.PI * 1.5]]) { g.beginPath(); g.moveTo(lx, -20); g.lineTo(lx + Math.sin(ph + a) * 9 * (air ? 0.6 : 1) + (air ? (lx > 0 ? 8 : -8) : 0), -2 - (air ? 6 : Math.max(0, Math.cos(ph + a)) * 5)); g.stroke(); }
    g.fillStyle = '#8a5a30'; g.beginPath(); g.ellipse(0, -26, 20, 10, sw * 0.05, 0, 7); g.fill();
    g.beginPath(); g.moveTo(14, -30); g.lineTo(26, -44); g.lineTo(34, -40); g.lineTo(28, -30); g.closePath(); g.fill();
    g.fillStyle = '#3a2410'; g.fillRect(14, -42, 4, 12);
    g.fillStyle = col; g.fillRect(-6, -42, 12, 16); g.beginPath(); g.arc(0, -48, 6, 0, 7); g.fill(); g.restore();
  }
  function drawMan(g, x, y, sc, col, ph, pull) {
    g.save(); g.translate(x, y); g.scale(sc, sc); g.strokeStyle = '#222'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -22); g.lineTo(Math.sin(ph) * 6, 0); g.moveTo(0, -22); g.lineTo(-Math.sin(ph) * 6, 0); g.stroke();
    g.fillStyle = col; g.fillRect(-6, -42, 12, 20); g.fillStyle = '#e8c9a0'; g.beginPath(); g.arc(0, -48, 6, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.beginPath(); g.moveTo(0, -38); g.lineTo(pull ? -14 : -6, pull ? -34 : -26); g.stroke(); g.restore();
  }
  const bar = (g, x, y, w, h, v, c) => { g.fillStyle = '#0008'; g.fillRect(x, y, w, h); g.fillStyle = c; g.fillRect(x, y, w * clamp(v, 0, 1), h); g.strokeStyle = '#fff8'; g.lineWidth = 1; g.strokeRect(x, y, w, h); };

  // =====================================================================
  // 馬の障害レース
  // =====================================================================
  function raceGame(env) {
    const { cfg, me, g2: g, cv } = env, rng = mulberry(cfg.seed), LEN = 800, obs = [];
    for (let x = 45; x < LEN - 40; x += 22 + rng() * 22) { const r = rng(); obs.push({ x, type: r < 0.4 ? 'fence' : r < 0.75 ? 'hurdle' : 'ditch', hit: false }); }
    const W = { fence: 1, hurdle: 1, ditch: 4 }, H = { fence: 1.1, hurdle: 0.6, ditch: 0.5 };
    const P = {}; for (const id of env.ids) P[id] = { x: 0, y: 0, stun: 0, fin: null, dx: 0, dy: 0 };
    const s = P[me]; let t = -3, vy = 0, v = 0, stam = 1, poseT = 0, firstFin = null, ph = 0;
    const rank = () => { const a = env.ids.slice(); a.sort((p, q) => { const A = P[p], B = P[q]; if (A.fin != null && B.fin != null) return A.fin - B.fin; if (A.fin != null) return -1; if (B.fin != null) return 1; return B.x - A.x; }); return a; };
    function finishAll() {
      const rk = rank(), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows;
      if (cfg.team) { const pts = [0, 0]; rk.forEach((id, i) => { pts[env.tm[id]] += n - i; }); team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose';
        rows = [`<b>チーム戦　赤 ${pts[0]}点 ― 白 ${pts[1]}点　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`]; }
      else rows = [];
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${P[id].fin != null ? P[id].fin.toFixed(1) + '秒' : '走り切れず'}`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'race', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = P[from]; if (!o) return; if (m.k === 'p') { o.x = m.x; o.y = m.y; o.stun = m.s; } else if (m.k === 'fin') { o.fin = m.t; o.x = LEN; if (firstFin == null) firstFin = t; } },
      update(dt) {
        t += dt; if (t < 0) return; ph += dt * (6 + v * 0.5);
        const dash = IN.dash && stam > 0.05 && s.stun <= 0; let target = dash ? 17.5 : 13; if (s.stun > 0) { s.stun -= dt; target = 4.5; }
        if (s.fin != null) target = 0; v += (target - v) * Math.min(1, dt * 3); stam = clamp(stam + (dash ? -0.38 : 0.18) * dt, 0, 1); s.x += v * dt;
        if (IN.aT && s.y <= 0.001 && s.fin == null) vy = 9.2; vy -= 24 * dt; s.y += vy * dt; if (s.y <= 0) { s.y = 0; vy = 0; }
        for (const o of obs) if (!o.hit && s.x > o.x && s.x < o.x + W[o.type]) { if (s.y <= H[o.type]) { o.hit = true; s.stun = 0.9; v *= 0.4; } } else if (s.x >= o.x + W[o.type]) o.hit = true;
        if (s.x >= LEN && s.fin == null) { s.fin = t; send(env.others, { k: 'fin', t: r1(t) }); if (firstFin == null) firstFin = t; }
        poseT -= dt; if (poseT <= 0) { poseT = 0.1; send(env.others, { k: 'p', x: r1(s.x), y: r2(s.y), s: s.stun > 0 ? 1 : 0 }); }
        for (const id of env.ids) if (id !== me) { const o = P[id]; o.dx += (o.x - o.dx) * Math.min(1, dt * 12); o.dy += (o.y - o.dy) * Math.min(1, dt * 12); }
        const alive = env.ids.filter((id) => !env.gone[id]), allFin = alive.every((id) => P[id].fin != null);
        if (allFin || (firstFin != null && t > firstFin + 12) || t > 100) finishAll();
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, ppm = W0 / 34, n = env.ids.length, rowH = Math.min(120, (H0 * 0.78) / n), top = H0 * 0.14, camX = s.x - 7;
        g.fillStyle = '#9fd0f0'; g.fillRect(0, 0, W0, H0); g.fillStyle = '#6fae56'; g.fillRect(0, top + 20, W0, H0);
        env.ids.forEach((id, i) => {
          const y0 = top + i * rowH + rowH * 0.82, me0 = id === me, o = P[id], x = me0 ? s.x : o.dx, yy = me0 ? s.y : o.dy;
          g.fillStyle = i % 2 ? '#7bbd62' : '#6fae56'; g.fillRect(0, y0 - rowH * 0.8, W0, rowH); g.strokeStyle = '#fff6'; g.beginPath(); g.moveTo(0, y0 + 2); g.lineTo(W0, y0 + 2); g.stroke();
          for (const ob of obs) { const px = (ob.x - camX) * ppm; if (px < -80 || px > W0 + 80) continue;
            if (ob.type === 'ditch') { g.fillStyle = '#4a3320'; g.fillRect(px, y0 - 3, W.ditch * ppm, 7); } else { g.fillStyle = ob.type === 'fence' ? '#8b5a2b' : '#b08040'; const hh = H[ob.type] * ppm * 0.9 + 8; g.fillRect(px, y0 - hh, 6, hh); g.fillRect(px - 6, y0 - hh, 18, 5); } }
          const gx = (LEN - camX) * ppm; g.fillStyle = '#fff'; g.fillRect(gx, y0 - rowH * 0.8, 6, rowH); // ゴール
          drawHorse(g, (x - camX) * ppm, y0 - yy * ppm * 0.9, Math.min(1.1, rowH / 85), tcol(env, id), me0 ? ph : (x * 0.9), yy > 0.05);
          drawText(g, nameOf(env, id), (x - camX) * ppm, y0 - rowH * 0.62 - yy * ppm * 0.9, { sz: 13, al: 'center', c: tcol(env, id) });
        });
        const pr = clamp(s.x / LEN, 0, 1); g.fillStyle = '#0008'; g.fillRect(20, 14, W0 - 40, 10); env.ids.forEach((id) => { g.fillStyle = tcol(env, id); g.beginPath(); g.arc(20 + clamp((id === me ? s.x : P[id].x) / LEN, 0, 1) * (W0 - 40), 19, id === me ? 7 : 5, 0, 7); g.fill(); });
        bar(g, 20, 32, 140, 10, stam, '#f2c14e'); drawText(g, 'スタミナ', 168, 42, { sz: 12 });
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' }); else if (t < 0.8) drawText(g, 'スタート！', W0 / 2, H0 / 2, { sz: 60, b: 1, al: 'center' });
        void pr;
      },
    };
  }

  // =====================================================================
  // 弓の的当て大会（仮想の広さ 160×90）
  // =====================================================================
  function archeryGame(env) {
    const { cfg, me, g2: g, cv } = env, rng = mulberry(cfg.seed), VW = 160, VH = 90, ARROWS = 10, FLY = 0.4;
    const tg = []; // 的：行ごとに動く
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) tg.push({ y: 22 + row * 20, r: 5.5 - row * 0.6, v: (row % 2 ? -1 : 1) * (9 + rng() * 10 + row * 4), ph: rng() * 200, gold: row === 1 && i === 0 });
    tg.find((x) => x.gold).r = 3.6; tg.find((x) => x.gold).v *= 1.6;
    const pos = (o, t) => { const L = VW + o.r * 2 + 10; return ((((o.ph + o.v * t) % L) + L) % L) - o.r - 5; };
    const wind0 = rng() * 6, windAt = (t) => 5 * Math.sin(t * 0.4 + wind0) + 2 * Math.sin(t * 1.1 + wind0 * 2);
    const S = {}; for (const id of env.ids) S[id] = { sc: 0, n: 0, done: false }; let t = -2, cx = VW / 2, cy = 40, cd = 0, marks = [], doneAt = null, tOver = null;
    const me0 = S[me];
    function finishAll() {
      const rk = env.ids.slice().sort((a, b) => S[b].sc - S[a].sc), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows = [];
      if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) pts[env.tm[id]] += S[id].sc; team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose'; rows.push(`<b>チーム戦　赤 ${pts[0]}点 ― 白 ${pts[1]}点　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`); }
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${S[id].sc}点`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'archery', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = S[from]; if (!o) return; if (m.k === 'sc') { o.sc = m.s; o.n = m.n; } else if (m.k === 'done') { o.sc = m.s; o.n = ARROWS; o.done = true; } },
      update(dt) {
        t += dt; if (t < 0) return; cd -= dt;
        const pd = env.pad || { x: 0, y: 0 }, sp = 60;
        if (IN.l) cx -= sp * dt; if (IN.r) cx += sp * dt; if (IN.u) cy -= sp * dt; if (IN.d) cy += sp * dt; cx += pd.x * sp * dt; cy += pd.y * sp * dt;
        if (IN.mx != null) { const sc = Math.min(cv.width / VW, cv.height / VH); cx = (IN.mx - (cv.width - VW * sc) / 2) / sc; cy = (IN.my - (cv.height - VH * sc) / 2) / sc; IN.mx = null; }
        cx = clamp(cx, 0, VW); cy = clamp(cy, 8, VH - 4);
        if ((IN.aT || IN.click) && cd <= 0 && me0.n < ARROWS) {
          cd = 0.45; const lx = cx + windAt(t) * 0.9, lt = t + FLY; let pts = 0, gold = false;
          for (const o of tg) { const d = Math.hypot(pos(o, lt) - lx, o.y - cy); if (d < o.r) { const q = d / o.r, p = q < 0.3 ? 10 : q < 0.65 ? 7 : 4; if (p * (o.gold ? 2 : 1) > pts) { pts = p * (o.gold ? 2 : 1); gold = o.gold; } } }
          me0.n++; marks.push({ x: lx, y: cy, at: lt, pts, gold, shown: false });
        }
        for (const m of marks) if (!m.shown && t >= m.at) { m.shown = true; me0.sc += m.pts; send(env.others, { k: 'sc', s: me0.sc, n: marks.filter((q) => q.shown).length }); }
        if (me0.n >= ARROWS && marks.every((m) => m.shown) && !me0.done) { me0.done = true; doneAt = t; send(env.others, { k: 'done', s: me0.sc }); }
        const alive = env.ids.filter((id) => !env.gone[id]);
        if (alive.every((id) => S[id].done) || (doneAt != null && t > doneAt + 20) || t > 120) finishAll();
        void tOver;
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, sc = Math.min(W0 / VW, H0 / VH), ox = (W0 - VW * sc) / 2, oy = (H0 - VH * sc) / 2;
        g.fillStyle = '#1b2a1b'; g.fillRect(0, 0, W0, H0); g.save(); g.translate(ox, oy); g.scale(sc, sc);
        g.fillStyle = '#a7d3f2'; g.fillRect(0, 0, VW, VH); g.fillStyle = '#5e9a4a'; g.fillRect(0, 62, VW, 28);
        for (const o of tg) { const x = pos(o, Math.max(0, t)); g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, o.y); g.lineTo(x, o.y + o.r + 12); g.stroke();
          g.fillStyle = o.gold ? '#f2c14e' : '#fff'; g.beginPath(); g.arc(x, o.y, o.r, 0, 7); g.fill(); g.fillStyle = o.gold ? '#fff2a0' : '#d33'; g.beginPath(); g.arc(x, o.y, o.r * 0.65, 0, 7); g.fill(); g.fillStyle = o.gold ? '#e08a00' : '#fff'; g.beginPath(); g.arc(x, o.y, o.r * 0.3, 0, 7); g.fill(); }
        for (const m of marks) if (m.shown && t - m.at < 3) { g.fillStyle = m.pts ? '#2a7a2a' : '#555'; g.beginPath(); g.arc(m.x, m.y, 1, 0, 7); g.fill(); g.font = 'bold 6px sans-serif'; g.fillStyle = m.pts ? '#fff' : '#ccc'; g.textAlign = 'center'; g.fillText(m.pts ? '+' + m.pts + (m.gold ? ' 金!' : '') : 'はずれ', m.x, m.y - 3 - (t - m.at) * 2); }
        const wnd = windAt(Math.max(0, t)); g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(VW / 2, 6); g.lineTo(VW / 2 + wnd * 3, 6); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(VW / 2 + wnd * 3, 6, 1.3, 0, 7); g.fill();
        g.font = '5px sans-serif'; g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText('風', VW / 2, 12);
        const lx = cx + wnd * 0.9; g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.6; g.beginPath(); g.arc(lx, cy, 3, 0, 7); g.moveTo(lx - 5, cy); g.lineTo(lx + 5, cy); g.moveTo(lx, cy - 5); g.lineTo(lx, cy + 5); g.stroke(); g.restore();
        drawText(g, `残り ${ARROWS - me0.n} 本　${me0.sc} 点`, 16, 28, { sz: 22, b: 1 });
        env.ids.forEach((id, i) => drawText(g, `${nameOf(env, id)}　${S[id].sc}点${S[id].done ? '（終了）' : ''}`, W0 - 16, 30 + i * 20, { sz: 15, al: 'right', c: tcol(env, id) }));
        if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) pts[env.tm[id]] += S[id].sc; drawText(g, `赤 ${pts[0]} ― 白 ${pts[1]}`, W0 / 2, H0 - 16, { sz: 20, b: 1, al: 'center' }); }
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' });
      },
    };
  }

  // =====================================================================
  // 釣り大会：朝・昼・夕の3日間（1日40秒）。勝ち方は mode='big'（いちばん大きい魚）か 'num'（釣った数）
  // =====================================================================
  // いつもの釣り（gather.js の釣り場の場面）をそのまま使い、結果だけここで数える。魚は生き物図鑑（SGK.DATA.creatures）の魚から出る
  function fishGame(env) {
    const { cfg, me, g2: g, cv } = env, DAY = 40, DN = ['朝', '昼', '夕'], big = cfg.mode !== 'num';
    const RW = { ありふれた: 10, 見かける: 6, 珍しい: 3, 稀少: 1.2, '幻のような': 0.4 }, LIST = ((SGK.DATA && SGK.DATA.creatures) || []).filter((c) => c.k === 'f'), TW = LIST.reduce((a, c) => a + (RW[c.r] || 1), 0);
    const S = {}; for (const id of env.ids) S[id] = { n: 0, best: 0, bn: '', done: false }; const m0 = S[me];
    let t = -2, busy = false, msg = '', msgT = 0, doneAt = null, dayShown = -1, over = false;
    const pick = () => { let r = Math.random() * TW; for (const c of LIST) { r -= RW[c.r] || 1; if (r <= 0) return c; } return LIST[0]; };
    function cast() {
      if (busy || !LIST.length || !SGK.GATHERUI || !SGK.GATHERUI.party) return; const sp = pick(), frac = (Math.random() + Math.random()) / 2; busy = true;
      SGK.GATHERUI.party({ n: -1, k: 'f', id: sp.id, d: sp.d, r: sp.r, fr: frac }, (q) => {
        busy = false; if (q < 0) { msg = 'やめた'; msgT = 1.5; return; }
        const thr = ((SGK.DATA.gatherDiff || {})[sp.d] || { thr: 0.6 }).thr; if (q < thr) { msg = '逃げられた…'; msgT = 2; return; }
        const sz = Math.round((sp.sz[0] + (sp.sz[1] - sp.sz[0]) * frac) * 10) / 10; m0.n++; const rec = sz > m0.best; if (rec) { m0.best = sz; m0.bn = sp.n; }
        msg = `${sp.n}（${sz}cm）を釣った！${rec && m0.n > 1 ? ' 自己ベスト！' : ''}`; msgT = 3; send(env.others, { k: 'f', n: m0.n, b: m0.best, bn: m0.bn });
      });
    }
    function finishAll() {
      if (over) return; over = true; if (SGK.GATHERUI && SGK.GATHERUI.stop) SGK.GATHERUI.stop();
      const key = (x) => (big ? x.best : x.n), rk = env.ids.slice().sort((a, b) => key(S[b]) - key(S[a]) || S[b].n - S[a].n), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows = [];
      const lab = (x) => (big ? (x.best ? `${x.bn} ${x.best}cm` : '釣れず') : `${x.n}匹`) + (big ? `（${x.n}匹）` : x.best ? `（最大 ${x.best}cm）` : '');
      if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) { const o = S[id], tt = env.tm[id]; pts[tt] = big ? Math.max(pts[tt], o.best) : pts[tt] + o.n; } const u = big ? 'cm' : '匹';
        team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose'; rows.push(`<b>チーム戦（${big ? '各チームの最大' : '合計'}）　赤 ${pts[0]}${u} ― 白 ${pts[1]}${u}　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`); }
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${lab(S[id])}`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'fish', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = S[from]; if (!o) return; if (m.k === 'f') { o.n = m.n; o.best = m.b; o.bn = m.bn; } else if (m.k === 'done') { o.n = m.n; o.best = m.b; o.bn = m.bn; o.done = true; } },
      update(dt) {
        t += dt; if (t < 0) return; msgT -= dt;
        const day = Math.min(2, Math.floor(t / DAY)); if (day !== dayShown) { dayShown = day; if (!busy) { msg = `${day + 1}日目（${DN[day]}）`; msgT = 2; } }
        if (t >= DAY * 3) { if (!m0.done && !busy) { m0.done = true; doneAt = t; send(env.others, { k: 'done', n: m0.n, b: m0.best, bn: m0.bn }); } if (busy && t > DAY * 3 + 25 && SGK.GATHERUI.stop) SGK.GATHERUI.stop(); }
        else if (!busy && IN.aT) cast();
        const alive = env.ids.filter((id) => !env.gone[id]);
        if (alive.every((id) => S[id].done) || (doneAt != null && t > doneAt + 15) || t > DAY * 3 + 45) finishAll();
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, day = clamp(Math.floor(Math.max(0, t) / DAY), 0, 2), sky = ['#bfe3f5', '#8fcdf2', '#f4b27a'][day];
        g.fillStyle = sky; g.fillRect(0, 0, W0, H0 * 0.45); g.fillStyle = '#6fae56'; g.fillRect(0, H0 * 0.38, W0, H0 * 0.1); g.fillStyle = '#3d7fb0'; g.fillRect(0, H0 * 0.48, W0, H0);
        g.fillStyle = day === 2 ? '#ff9a3c' : '#fff6a0'; g.beginPath(); g.arc(W0 * (0.2 + day * 0.3), H0 * 0.14, 30, 0, 7); g.fill();
        const rem = Math.max(0, DAY - (Math.max(0, t) - day * DAY)); drawText(g, `${day + 1}日目（${DN[day]}）　残り ${Math.ceil(rem)}秒`, 16, 30, { sz: 20, b: 1 }); bar(g, 16, 40, 160, 8, rem / DAY, '#f2c14e');
        drawText(g, `${m0.n}匹　最大 ${m0.best ? m0.bn + ' ' + m0.best + 'cm' : '―'}`, 16, 74, { sz: 17 }); drawText(g, big ? '勝ち方：大物' : '勝ち方：数', 16, 98, { sz: 14, c: '#f2c14e' });
        env.ids.forEach((id, i) => drawText(g, `${nameOf(env, id)}　${big ? (S[id].best ? S[id].best + 'cm' : '―') : S[id].n + '匹'}${S[id].done ? '（終了）' : ''}`, W0 - 16, 30 + i * 20, { sz: 15, al: 'right', c: tcol(env, id) }));
        if (msgT > 0) drawText(g, msg, W0 / 2, H0 * 0.34, { sz: 30, b: 1, al: 'center' });
        else if (!busy && t >= 0 && t < DAY * 3) drawText(g, 'A／Space／タップで釣りを始める', W0 / 2, H0 * 0.6, { sz: 20, al: 'center' });
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' });
      },
    };
  }

  // =====================================================================
  // 荷運び競争（協力）：リーダーの端末が荷車を動かし、10回/秒で全員へ配る
  // =====================================================================
  function cartGame(env) {
    const { cfg, me, g2: g, cv } = env, lead = cfg.lead === me, rng = mulberry(cfg.seed), LEN = 700, TL = 120, obs = [];
    for (let d = 40; d < LEN - 15; d += 24 + rng() * 22) { const lane = (rng() * 3) | 0, two = rng() < 0.25, l2 = two ? (lane + 1 + ((rng() * 2) | 0)) % 3 : -1; obs.push({ d, lanes: two ? [lane, l2] : [lane], hit: false }); }
    const C = { d: 0, v: 0, load: 1, t: -3, stun: 0, lane: 1, end: 0, hits: 0 }, PS = {}; for (const id of env.ids) PS[id] = { lane: 1, pull: 0, stam: 1 };
    let snapT = 0, inT = 0, lastLane = 1, flash = 0, ph = 0, rx = performance.now();
    function result(ok) { env.end({ title: ok ? '荷を運びきった！' : '荷を運びきれなかった…', rows: ok ? [`荷の残り ${Math.round(C.load * 100)}%　かかった時間 ${C.t.toFixed(1)}秒`, `崩した回数 ${C.hits}回`] : ['もう一度、みんなで息を合わせよう'], cmd: { type: 'partyResult', game: 'cart', n: env.ids.length, ok, load: r2(C.load) } }); }
    return {
      msg(from, m) {
        if (lead) { const p = PS[from]; if (p && m.k === 'in') { p.lane = clamp(m.lane | 0, 0, 2); p.pull = m.pull ? 1 : 0; } }
        else if (from === cfg.lead) { rx = performance.now(); if (m.k === 'snap') { C.d = m.d; C.v = m.v; C.load = m.load; C.t = m.t; C.stun = m.st; C.lane = m.lane; C.hits = m.hits; if (m.hits > (C._h || 0)) { flash = 0.4; C._h = m.hits; } for (const id in m.ps) if (PS[id]) { PS[id].lane = m.ps[id][0]; PS[id].pull = m.ps[id][1]; PS[id].stam = m.ps[id][2]; } if (m.end && !C.end) { C.end = m.end; result(m.end === 1); } } else if (m.k === 'quit') { env.end({ title: 'リーダーが抜けたので終わりました', rows: [], cmd: null }); } }
      },
      update(dt) {
        ph += dt * (4 + C.v * 0.6);
        // 自分の入力
        const p = PS[me]; if (IN.lT) p.lane = clamp(p.lane - 1, 0, 2); if (IN.rT) p.lane = clamp(p.lane + 1, 0, 2); p.pull = IN.pull ? 1 : 0;
        if (!lead) { inT -= dt; if (inT <= 0 || p.lane !== lastLane) { inT = 0.1; lastLane = p.lane; send([cfg.lead], { k: 'in', lane: p.lane, pull: p.pull }); } if (performance.now() - rx > 8000) env.end({ title: 'リーダーとの通信が切れました', rows: [], cmd: null }); return; }
        // リーダー：荷車を動かす
        C.t += dt; flash -= dt; if (C.t < 0) { snapT -= dt; if (snapT <= 0) { snapT = 0.1; snap(); } return; }
        const alive = env.ids.filter((id) => !env.gone[id]); let pull = 0, lanes = 0;
        for (const id of alive) { const q = PS[id]; if (q.pull && q.stam > 0.02) { pull++; q.stam = clamp(q.stam - 0.4 * dt, 0, 1); } else q.stam = clamp(q.stam + 0.25 * dt, 0, 1); lanes += q.lane; }
        const ln = alive.length ? lanes / alive.length : 1; C.lane += (Math.round(ln) - C.lane) * Math.min(1, dt * 8);
        let target = pull ? 3 + 13 * (pull / Math.max(1, alive.length)) : 0.6; if (C.stun > 0) { C.stun -= dt; target *= 0.3; }
        C.v += (target - C.v) * Math.min(1, dt * 2.2); const d0 = C.d; C.d += C.v * dt;
        for (const o of obs) if (!o.hit && C.d >= o.d) { o.hit = true; if (o.lanes.includes(Math.round(C.lane))) { C.load = Math.max(0, C.load - 0.17); C.stun = 1; C.v *= 0.3; C.hits++; flash = 0.4; } }
        void d0;
        if (!C.end) { if (C.d >= LEN) C.end = 1; else if (C.load <= 0 || C.t > TL) C.end = 2; if (C.end) { snap(); snap(); result(C.end === 1); } }
        snapT -= dt; if (snapT <= 0) { snapT = 0.1; snap(); }
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, rw = Math.min(W0 * 0.7, 420), x0 = (W0 - rw) / 2, ln = rw / 3, cy = H0 * 0.72, ppm = H0 * 0.6 / 22;
        g.fillStyle = '#6fae56'; g.fillRect(0, 0, W0, H0); g.fillStyle = '#b89a6a'; g.fillRect(x0, 0, rw, H0); g.strokeStyle = '#8a7048'; g.lineWidth = 2; g.setLineDash([14, 14]); for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x0 + ln * i, 0); g.lineTo(x0 + ln * i, H0); g.stroke(); } g.setLineDash([]);
        for (const o of obs) { const y = cy - (o.d - C.d) * ppm; if (y < -40 || y > H0 + 40) continue; for (const l of o.lanes) { g.fillStyle = o.hit ? '#7a7a7a77' : '#6a6a6a'; g.beginPath(); g.ellipse(x0 + ln * (l + 0.5), y, ln * 0.32, 16, 0, 0, 7); g.fill(); } }
        const gy = cy - (LEN - C.d) * ppm; if (gy > -20) { g.fillStyle = '#fff'; g.fillRect(x0, gy, rw, 8); drawText(g, 'ゴール', W0 / 2, gy - 8, { sz: 18, b: 1, al: 'center' }); }
        const cxp = x0 + ln * (C.lane + 0.5); g.save(); g.translate(cxp, cy + (C.stun > 0 ? Math.sin(ph * 6) * 2 : 0));
        g.fillStyle = '#7a4a22'; g.fillRect(-26, -30, 52, 60); g.fillStyle = '#c9a15a'; const h = 50 * C.load; g.fillRect(-22, 24 - h, 44, h); g.strokeStyle = '#3a2410'; g.lineWidth = 3; g.strokeRect(-26, -30, 52, 60); g.restore();
        env.ids.forEach((id, i) => { const q = PS[id], px = cxp + (i - (env.ids.length - 1) / 2) * 30, py = cy - 50 - (q.pull ? 6 : 0); drawMan(g, px, py + 24, 0.9, PAL[i % 5], ph + i, q.pull); });
        const hx = 16; drawText(g, `荷 ${Math.round(C.load * 100)}%`, hx, 34, { sz: 22, b: 1 }); bar(g, hx, 42, 150, 10, C.load, '#c9a15a'); drawText(g, `道のり ${Math.round(clamp(C.d / LEN, 0, 1) * 100)}%　${Math.max(0, C.t).toFixed(0)}/${TL}秒`, hx, 74, { sz: 14 });
        env.ids.forEach((id, i) => { const q = PS[id], yy = H0 - 24 - (env.ids.length - 1 - i) * 22; drawText(g, `${nameOf(env, id)} ${'←↑→'[q.lane] === '↑' ? '↑' : q.lane === 0 ? '←' : '→'}${q.lane === 1 ? '(中)' : ''}`, W0 - 170, yy, { sz: 13, al: 'right', c: PAL[i % 5] }); bar(g, W0 - 160, yy - 11, 110, 8, q.stam, q.pull ? '#f2c14e' : '#9aa'); });
        if (flash > 0) { g.fillStyle = `rgba(255,60,40,${flash})`; g.fillRect(0, 0, W0, H0); drawText(g, '荷が崩れた！', W0 / 2, H0 / 2, { sz: 40, b: 1, al: 'center' }); }
        if (C.t < 0) drawText(g, String(Math.ceil(-C.t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' });
      },
    };
    function snap() { const ps = {}; for (const id of env.ids) ps[id] = [PS[id].lane, PS[id].pull, r2(PS[id].stam)]; send(env.others, { k: 'snap', d: r1(C.d), v: r1(C.v), load: r2(C.load), t: r1(C.t), st: C.stun > 0 ? r2(C.stun) : 0, lane: r2(C.lane), hits: C.hits, ps, end: C.end }); }
  }
})();
