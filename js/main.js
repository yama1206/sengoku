// 画面の流れ・入力（キーボード／マウス／コントローラー／タッチ）・ホストのループ
(function () {
  const $ = (id) => document.getElementById(id);
  const SIM = SGK.SIM, CFG = SGK.CFG, R = SGK.RENDER;
  const G = { mode: 'title', world: null, net: null, myPid: null, stat: null, dyn: null, view: null, disp: {}, selected: null, speed: 1, roomCode: null };
  window.SGK_G = G; // デバッグ用

  // ---------- 端末ごとの識別子（参加し直しても同じ武将に戻れる） ----------
  let token = localStorage.getItem('sgk_token');
  if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('sgk_token', token); }
  $('nameInput').value = localStorage.getItem('sgk_name') || '';
  const myName = () => { const n = $('nameInput').value.trim().slice(0, 12) || '浪人'; localStorage.setItem('sgk_name', n); return n; };

  // ---------- 共通UI ----------
  $('verLabel').textContent = 'ver ' + SGK.VERSION;
  $('updateBtn').onclick = () => { location.href = location.pathname + '?v=' + Date.now(); };
  function toast(text, ms = 3000) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
  function titleMsg(text) { $('titleMsg').textContent = text || ''; }
  function show(id) { ['title', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); if (id === 'game') requestAnimationFrame(() => R.resize($('map'))); }

  // ---------- メニュー操作（キー・コントローラー：押した方向へ移動／決定してもカーソル位置は保つ） ----------
  const focusMem = {};
  function activeMenu() {
    if (G.mode === 'title') return $('joinPanel').classList.contains('hidden') ? $('titleMenu') : $('joinPanel');
    if (!$('gameMenu').classList.contains('hidden')) return $('gameMenu');
    return null;
  }
  function menuButtons(m) { return [...m.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent); }
  function setFocus(m, b) { menuButtons(m).forEach((x) => x.classList.toggle('focus', x === b)); focusMem[m.id] = b ? b.id || b.textContent : null; }
  function currentFocus(m) {
    const bs = menuButtons(m);
    return bs.find((b) => b.classList.contains('focus')) || bs.find((b) => (b.id || b.textContent) === focusMem[m.id]) || bs[0];
  }
  function navMenu(dx, dy) {
    const m = activeMenu(); if (!m) return false;
    const bs = menuButtons(m); if (!bs.length) return true;
    const cur = currentFocus(m); const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = null, bs2 = Infinity;
    for (const b of bs) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect(); const vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy;
      const along = vx * dx + vy * dy; if (along <= 2) continue;
      const side = Math.abs(vx * dy - vy * dx); const score = along + side * 2;
      if (score < bs2) { bs2 = score; best = b; }
    }
    setFocus(m, best || cur);
    return true;
  }
  function pressMenu() { const m = activeMenu(); if (!m) return false; const b = currentFocus(m); if (b) { setFocus(m, b); b.click(); } return true; }
  document.addEventListener('mouseover', (e) => { const m = activeMenu(); if (m && e.target.tagName === 'BUTTON' && m.contains(e.target)) setFocus(m, e.target); });

  // ---------- タイトル ----------
  $('btnContinue').disabled = !SGK.SAVE.has();
  $('btnNew').onclick = () => startHost(SIM.createWorld(Math.floor(Math.random() * 2 ** 31)), '新しいワールドを作りました');
  $('btnContinue').onclick = () => {
    try { const r = SGK.SAVE.load(); if (!r) return titleMsg('セーブがありません'); startHost(r.world, r.from.endsWith('main') ? '続きから再開しました' : 'セーブが読めなかったので、バックアップから再開しました'); }
    catch (e) { titleMsg(e.message); }
  };
  $('btnImport').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) SGK.SAVE.importFile(f).then((w) => startHost(w, 'セーブファイルから再開しました')).catch((err) => titleMsg(err.message)); };
  $('btnJoin').onclick = () => { $('joinPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); $('codeInput').focus(); };
  $('btnJoinBack').onclick = () => { $('joinPanel').classList.add('hidden'); $('titleMenu').classList.remove('hidden'); };
  $('btnJoinGo').onclick = () => { const c = $('codeInput').value.trim(); if (c.length < 5) return titleMsg('部屋コード（5文字）を入れてください'); startClient(c); };

  // ---------- ホスト ----------
  const timerWorker = new Worker(URL.createObjectURL(new Blob(['let iv;onmessage=e=>{clearInterval(iv);if(e.data>0)iv=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' })));
  let lastTick = 0, netAcc = 0, saveAcc = 0, saveCount = 0;

  function startHost(world, msg) {
    G.mode = 'host'; G.world = world; G.speed = 1; G.disp = {}; G.selected = null;
    G.myPid = SIM.addPlayer(world, token, myName());
    G.stat = SIM.staticState(world);
    show('game'); hostUI(true); toast(msg);
    centerOnMe();
    lastTick = performance.now(); netAcc = saveAcc = 0;
    timerWorker.onmessage = hostTick; timerWorker.postMessage(CFG.TICK_MS);
    SGK.SAVE.save(world);
    if (window.Peer) {
      G.net = SGK.NET.host({
        onReady: (code) => { G.roomCode = code; updateRoom(); },
        onError: (t) => toast(t, 5000),
        onHello: (conn, m) => {
          const pid = SIM.addPlayer(G.world, String(m.token).slice(0, 40), String(m.name || '').slice(0, 12));
          if (pid) { conn.send({ t: 'welcome', pid, static: G.stat, ver: SGK.VERSION }); toast(`${G.world.players[pid].name} が参加しました`); updateRoom(); }
          return pid;
        },
        onCmd: (pid, cmd) => SIM.applyCommand(G.world, pid, cmd),
        onLeave: (pid) => { const p = G.world.players[pid]; if (p) toast(`${p.name} が退出しました`); updateRoom(); },
      });
    } else { toast('通信ライブラリを読み込めませんでした（一人で遊べます）', 5000); }
    updateRoom();
  }
  function hostTick() {
    const now = performance.now(); const dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    SIM.step(G.world, dt * CFG.MIN_PER_SEC * G.speed);
    netAcc += dt * 1000;
    if (netAcc >= CFG.NET_SEND_MS && G.net) { netAcc = 0; G.net.broadcast({ t: 'state', s: SIM.dynamicState(G.world), sp: G.speed }); }
    saveAcc += dt;
    if (saveAcc >= CFG.AUTOSAVE_SEC) { saveAcc = 0; SGK.SAVE.save(G.world); if (++saveCount % CFG.BACKUP_EVERY === 0) SGK.SAVE.backup(G.world); }
  }
  function updateRoom() {
    if (G.mode === 'host') {
      const online = G.net ? G.net.pids() : [];
      const names = [G.world.players[G.myPid].name, ...online.map((p) => (G.world.players[p] || {}).name)].join('・');
      $('roomInfo').textContent = (G.roomCode ? `部屋コード ${G.roomCode}` : '部屋を準備中…') + `　${online.length + 1}/${CFG.MAX_PLAYERS}人（${names}）`;
    } else if (G.mode === 'client') $('roomInfo').textContent = '参加中';
  }
  function hostUI(on) { document.querySelectorAll('.hostOnly').forEach((e) => e.classList.toggle('hidden', !on)); }
  document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { G.speed = +b.dataset.speed; }));

  // ---------- 参加者 ----------
  function startClient(code) {
    if (!window.Peer) return titleMsg('通信ライブラリを読み込めませんでした');
    titleMsg('接続しています…');
    G.mode = 'connecting';
    G.net = SGK.NET.join(code, token, myName(), {
      onWelcome: (m) => { G.mode = 'client'; G.myPid = m.pid; G.stat = m.static; G.disp = {}; G.selected = null; show('game'); hostUI(false); titleMsg(''); updateRoom(); toast('参加しました'); },
      onState: (m) => { G.dyn = m.s; G.speed = m.sp; if (!G.centered) { G.centered = true; buildView(); centerOnMe(); } },
      onBye: (why) => { backToTitle(); titleMsg(why); },
      onError: (t) => titleMsg(t),
    });
  }

  function backToTitle() {
    if (G.mode === 'host') { SGK.SAVE.save(G.world); timerWorker.postMessage(0); }
    if (G.net) G.net.close();
    Object.assign(G, { mode: 'title', world: null, net: null, dyn: null, view: null, centered: false, roomCode: null });
    $('gameMenu').classList.add('hidden'); $('info').classList.add('hidden');
    $('btnContinue').disabled = !SGK.SAVE.has();
    show('title');
  }
  // タブを閉じるときもセーブ
  window.addEventListener('pagehide', () => { if (G.mode === 'host') SGK.SAVE.save(G.world); });

  // ---------- 表示用データ ----------
  function buildView() {
    if (G.mode === 'host') {
      const w = G.world;
      G.view = { t: w.time.min, settlements: w.settlements, factions: w.factions, people: w.people, players: Object.values(w.players), npcs: Object.values(w.npcs) };
    } else if (G.mode === 'client' && G.dyn) {
      const d = G.dyn, s = G.stat;
      G.view = {
        t: d.t, settlements: s.settlements, factions: s.factions, people: s.people,
        players: d.p.map(([id, name, x, y, at, tx, ty, status]) => ({ id, name, x, y, at, tx, ty, status })),
        npcs: d.n.map(([id, kind, faction, x, y]) => ({ id, kind, faction, x, y })),
      };
    }
    return G.view;
  }
  const me = () => G.view && G.view.players.find((p) => p.id === G.myPid);
  function centerOnMe() { buildView(); const m = me(); if (m) { R.cam.x = m.x; R.cam.y = m.y; } }

  // ---------- 命令（ホストは直接、参加者は送信） ----------
  function command(cmd) {
    if (G.mode === 'host') SIM.applyCommand(G.world, G.myPid, cmd);
    else if (G.mode === 'client' && G.net) G.net.send(cmd);
  }
  function moveTo(x, y, dest) { command({ type: 'move', x, y, dest: dest || null }); if (!dest && SIM.isSea(x, y)) toast('海の上には移動できません', 1500); }

  // ---------- 拠点の情報 ----------
  function selectSettlement(s) {
    G.selected = s ? s.id : null;
    if (!s) { $('info').classList.add('hidden'); return; }
    const f = G.view.factions[s.owner], lord = s.lord ? (G.view.people[s.lord] || {}).name : null;
    const kind = { castle: '城', town: '町', village: '村' }[s.type];
    $('infoName').textContent = s.name;
    $('infoBody').innerHTML = `${kind}　勢力：<b style="color:${f ? f.color : '#ccc'}">${f ? f.name : 'なし'}</b><br>城主・代官：${lord || '（不明）'}`;
    $('info').classList.remove('hidden');
  }
  $('infoGo').onclick = () => { const s = G.view.settlements.find((x) => x.id === G.selected); if (s) moveTo(s.x, s.y, s.id); };
  $('infoClose').onclick = () => selectSettlement(null);

  // ---------- ゲーム内メニュー ----------
  function toggleMenu(open) { const m = $('gameMenu'); const o = open ?? m.classList.contains('hidden'); m.classList.toggle('hidden', !o); if (o) setFocus(m, currentFocus(m)); }
  $('menuBtn').onclick = () => toggleMenu(true);
  $('mClose').onclick = () => toggleMenu(false);
  $('mSave').onclick = () => { toast(SGK.SAVE.save(G.world) ? 'セーブしました' : 'セーブに失敗しました'); };
  $('mExport').onclick = () => { SGK.SAVE.save(G.world); SGK.SAVE.exportFile(G.world); };
  $('mFollow').onclick = () => { R.cam.follow = !R.cam.follow; toast(R.cam.follow ? '自分を追いかけます' : '追いかけを止めました', 1200); };
  $('mTitle').onclick = () => backToTitle();

  // ---------- マウス・タッチ ----------
  const cv = $('map'), ctx = cv.getContext('2d');
  const ptrs = new Map(); let dragMoved = false, pinchD = 0;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, btn: e.button }); dragMoved = false; pinchD = 0; });
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) {
      p.x = e.offsetX; p.y = e.offsetY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) R.zoom(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2); pinchD = d; dragMoved = true; return;
    }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { dragMoved = true; R.cam.follow = false; }
    if (dragMoved) { R.cam.x -= dx / R.cam.scale; R.cam.y -= dy / R.cam.scale; }
  });
  cv.addEventListener('pointerup', (e) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!p || dragMoved || !G.view) return;
    const hit = R.hitSettlement(G.view, e.offsetX, e.offsetY);
    const [wx, wy] = R.toWorld(e.offsetX, e.offsetY);
    if (p.btn === 2) { hit ? moveTo(hit.x, hit.y, hit.id) : moveTo(wx, wy); } // 右クリック：すぐ移動
    else if (hit) selectSettlement(hit);   // 左クリック・タップ：拠点なら情報
    else moveTo(wx, wy);                   // 地面なら移動
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); R.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

  // ---------- キーボード ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && G.mode === 'title' && e.target.id === 'codeInput') $('btnJoinGo').click(); return; }
    const k = e.key;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (activeMenu()) {
      if (dir) { e.preventDefault(); navMenu(dir[0], dir[1]); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); pressMenu(); return; }
      if (k === 'Escape') { if (G.mode === 'title') $('btnJoinBack').click(); else toggleMenu(false); return; }
    }
    if (G.mode !== 'host' && G.mode !== 'client') return;
    keys.add(k.toLowerCase());
    if (k === 'Escape') toggleMenu();
    else if (k === 'f' || k === 'F') $('mFollow').click();
    else if (k === 'Tab') { e.preventDefault(); cycleNear(); }
    else if (k === 'Enter' && G.selected) $('infoGo').click();
    else if (k === '+' || k === '=') R.zoom(1.2); else if (k === '-') R.zoom(1 / 1.2);
    else if (G.mode === 'host' && '1234'.includes(k)) G.speed = [0, 1, 2, 4][+k - 1];
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // 近い拠点を順番に選ぶ（キーボードのTab／コントローラーのX）
  let nearIdx = 0;
  function cycleNear() {
    const m = me(); if (!m) return;
    const list = [...G.view.settlements].sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)).slice(0, 6);
    const s = list[nearIdx++ % list.length]; selectSettlement(s); R.cam.follow = false; R.cam.x = s.x; R.cam.y = s.y;
  }

  // ---------- コントローラー（Xbox配置：A決定 B戻る X近くの拠点 Y追従 LB/RB拡大縮小 START メニュー／左スティック移動 右スティック視点） ----------
  const padPrev = {}; let navHold = 0, lastNav = 0;
  function pollPad(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads[0]; if (!gp) return [0, 0];
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const down = (i) => btn(i) && !padPrev[i];
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    let nx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0) + (Math.abs(lx) > 0.5 ? Math.sign(lx) : 0);
    let ny = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0) + (Math.abs(ly) > 0.5 ? Math.sign(ly) : 0);
    let move = [0, 0];
    if (activeMenu()) {
      const now = performance.now();
      if (nx || ny) { if (!navHold || now - lastNav > (navHold === 1 ? 400 : 150)) { navMenu(Math.abs(nx) >= Math.abs(ny) ? Math.sign(nx) : 0, Math.abs(nx) >= Math.abs(ny) ? 0 : Math.sign(ny)); lastNav = now; navHold++; } }
      else navHold = 0;
      if (down(0)) pressMenu();
      if (down(1)) { if (G.mode === 'title') $('btnJoinBack').click(); else toggleMenu(false); }
      if (down(9) && G.mode !== 'title') toggleMenu(false);
    } else if (G.mode === 'host' || G.mode === 'client') {
      move = [lx, ly];
      if (rx || ry) { R.cam.follow = false; R.cam.x += rx * dt * 600 / R.cam.scale; R.cam.y += ry * dt * 600 / R.cam.scale; }
      if (btn(4)) R.zoom(1 - dt * 1.5); if (btn(5)) R.zoom(1 + dt * 1.5);
      if (down(0) && G.selected) $('infoGo').click();
      if (down(1)) { if (G.selected) selectSettlement(null); else command({ type: 'stop' }); }
      if (down(2)) cycleNear();
      if (down(3)) $('mFollow').click();
      if (down(9)) toggleMenu(true);
    }
    gp.buttons.forEach((b, i) => (padPrev[i] = b.pressed));
    return move;
  }

  // ---------- 毎フレーム ----------
  let lastFrame = performance.now(), dirSendAcc = 0, wasDirMoving = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const padMove = pollPad(dt);
    if ((G.mode === 'host' || G.mode === 'client') && buildView()) {
      // WASD・左スティックで直接移動
      let mx = padMove[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let my = padMove[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      const m = me(); dirSendAcc += dt;
      if (m && (mx || my)) {
        if (dirSendAcc > 0.2) { dirSendAcc = 0; const l = Math.hypot(mx, my); command({ type: 'move', x: m.x + (mx / l) * 2, y: m.y + (my / l) * 2 }); R.cam.follow = true; }
        wasDirMoving = true;
      } else if (wasDirMoving) { wasDirMoving = false; command({ type: 'stop' }); }
      // なめらか表示
      const k = Math.min(1, dt * 12);
      for (const e of [...G.view.players, ...G.view.npcs]) {
        const d = G.disp[e.id];
        if (!d || Math.hypot(d.x - e.x, d.y - e.y) > 5) G.disp[e.id] = { x: e.x, y: e.y };
        else { d.x += (e.x - d.x) * k; d.y += (e.y - d.y) * k; }
      }
      const md = m && G.disp[m.id];
      if (R.cam.follow && md) { R.cam.x += (md.x - R.cam.x) * k; R.cam.y += (md.y - R.cam.y) * k; }
      R.draw(ctx, G.view, G.disp, G.myPid, G.selected);
      // HUD
      $('date').textContent = SIM.formatDate(G.view.t) + (G.speed === 0 ? '（停止中）' : G.speed > 1 ? `（×${G.speed}）` : '');
      if (m) {
        const at = m.at && G.view.settlements.find((s) => s.id === m.at);
        $('status').textContent = `${m.name}（${m.status || '浪人'}）　${at ? at.name + 'に滞在中' : m.tx != null ? '移動中' : '野外'}`;
      }
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === G.speed));
    }
    requestAnimationFrame(frame);
  }
  const fit = () => R.resize(cv);
  window.addEventListener('resize', fit); fit();
  requestAnimationFrame(frame);
  setFocus($('titleMenu'), $('btnNew'));
  show('title');
})();
