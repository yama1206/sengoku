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
    if (!$('char').classList.contains('hidden')) return $('char');
    if (!$('town').classList.contains('hidden')) return $('town');
    if (!$('battle').classList.contains('hidden')) return $('battle');
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
    if (netAcc >= CFG.NET_SEND_MS) {
      netAcc = 0;
      if (G.net) { const dyn = SIM.dynamicState(G.world); G.net.each((pid) => ({ t: 'state', s: dyn, sp: G.speed, priv: SIM.privateState(G.world, pid), msgs: SIM.drain(pid) })); }
      for (const pid in SIM.out) if (pid !== G.myPid) delete SIM.out[pid]; // 接続していない人宛ては捨てる
    }
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
      onState: (m) => { G.dyn = m.s; G.speed = m.sp; G.priv = m.priv; (m.msgs || []).forEach((t) => toast(t, 4000)); if (!G.centered) { G.centered = true; buildView(); centerOnMe(); } },
      onBye: (why) => { backToTitle(); titleMsg(why); },
      onError: (t) => titleMsg(t),
    });
  }

  function backToTitle() {
    if (G.mode === 'host') { SGK.SAVE.save(G.world); timerWorker.postMessage(0); }
    if (G.net) G.net.close();
    Object.assign(G, { mode: 'title', world: null, net: null, dyn: null, view: null, centered: false, roomCode: null });
    $('gameMenu').classList.add('hidden'); $('info').classList.add('hidden'); $('town').classList.add('hidden'); $('battle').classList.add('hidden'); $('char').classList.add('hidden'); G.priv = null;
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
        players: d.p.map(([id, name, x, y, at, tx, ty, status, path]) => ({ id, name, x, y, at, tx, ty, status, path })),
        npcs: d.n.map(([id, kind, faction, x, y, size, battle]) => ({ id, kind, faction, x, y, size, battle })),
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

  // ---------- 拠点の中（市場・依頼・仕事・話す） ----------
  const IT = SGK.DATA.items;
  let townTab = 'market', townHtml = '';
  const dayLeft = (dl) => { const d = (dl - G.view.t) / 1440; return d >= 1 ? `あと${Math.floor(d)}日` : 'まもなく期限'; };
  const sName = (id) => (G.view.settlements.find((x) => x.id === id) || {}).name || '?';
  function openTown(open) {
    const t = $('town');
    if (open === false || !G.priv || !G.priv.here) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden'); townHtml = ''; renderTown(); setFocus(t, currentFocus(t));
  }
  function setTab(tab) { townTab = tab; townHtml = ''; renderTown(); const t = $('town'); setFocus(t, $('tab-' + tab)); }
  function renderTown() {
    const P = G.priv; if (!P || !P.here) return openTown(false);
    const me = P.me, h = P.here;
    $('townName').textContent = sName(h.id);
    document.querySelectorAll('#town [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === townTab));
    let html = '';
    if (townTab === 'market') {
      html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　荷 ${SIM.cargo(me)}/${me.cap}</div><div class="grid">`;
      html += '<span class="h">品</span><span class="h">買値</span><span class="h">売値</span><span class="h">在庫</span><span class="h">所持</span><span></span><span></span><span></span><span></span>';
      for (const [k, buy, sell, stock] of h.market) {
        const it = IT[k], have = me.inv[k] || 0;
        html += `<span>${it.name}<span class="muted">/${it.unit}</span></span><span>${buy}文</span><span>${sell}文</span><span>${stock}</span><span>${have}</span>`
          + `<button id="b1-${k}" data-act="buy" data-item="${k}" data-qty="1">買1</button><button id="b10-${k}" data-act="buy" data-item="${k}" data-qty="10">買10</button>`
          + `<button id="s1-${k}" data-act="sell" data-item="${k}" data-qty="1" ${have ? '' : 'disabled'}>売1</button><button id="sa-${k}" data-act="sell" data-item="${k}" data-qty="999" ${have ? '' : 'disabled'}>全部</button>`;
      }
      html += '</div>';
    } else if (townTab === 'jobs') {
      html += `<div class="muted">受けている依頼（${me.quests.length}/3）</div>`;
      if (!me.quests.length) html += '<div class="muted" style="margin:4px 0 8px">なし</div>';
      for (const q of me.quests) {
        const where = q.type === 'deliver' ? `届け先：${sName(q.to)}` : `納品先：${sName(q.from)}（所持 ${me.inv[q.item] || 0}/${q.qty}）`;
        const canDeliver = q.type === 'procure' && q.from === h.id;
        html += `<div class="card"><div><b>${q.title}</b><br><span class="muted">${where}　報酬 ${SIM.money(q.reward)}　${dayLeft(q.deadline)}</span></div><div class="row">`
          + (canDeliver ? `<button id="dq-${q.id}" data-act="deliverJob" data-id="${q.id}">納品</button>` : '')
          + `<button id="aq-${q.id}" data-act="abandonJob" data-id="${q.id}">やめる</button></div></div>`;
      }
      html += '<div class="muted" style="margin-top:10px">この拠点の依頼</div>';
      if (!h.jobs.length) html += '<div class="muted" style="margin-top:4px">いまは依頼がありません</div>';
      for (const j of h.jobs) {
        const what = j.type === 'deliver' ? `届け先：${sName(j.to)}` : `${IT[j.item].name}を${j.qty}${IT[j.item].unit}、ここへ納品`;
        html += `<div class="card"><div><b>${j.title}</b>　<span class="muted">依頼主：${j.giver}</span><br><span class="muted">${what}　報酬 ${SIM.money(j.reward)}　期限${j.days}日</span></div><button id="ac-${j.id}" data-act="acceptJob" data-id="${j.id}">受ける</button></div>`;
      }
    } else if (townTab === 'work') {
      const s = G.view.settlements.find((x) => x.id === h.id);
      if (me.busy) {
        const left = Math.max(0, Math.ceil((me.busy.until - G.view.t) / 60));
        html += `<div class="card"><div><b>${me.busy.label}</b>の最中です<br><span class="muted">残り約${left}時間</span></div><button id="cw" data-act="cancelWork">取りやめる</button></div>`;
      } else if (s.type === 'village') {
        html += `<div class="card"><div><b>薪拾い</b><br><span class="muted">6時間　薪を3〜5束（荷に空きが必要）</span></div><button id="wg" data-act="work" data-kind="gather">始める</button></div>`;
      } else {
        html += `<div class="card"><div><b>調練</b><br><span class="muted">8時間　率いている兵が経験を積む（調練の技能も伸びる）</span></div><button id="wd" data-act="work" data-kind="drill">始める</button></div>`;
        html += `<div class="card"><div><b>人足仕事</b><br><span class="muted">8時間　荷運びなどの日雇い仕事で賃金をもらう</span></div><button id="wl" data-act="work" data-kind="labor">始める</button></div>`;
      }
      html += '<div class="muted">仕事中は移動できません。</div>';
    } else if (townTab === 'army') {
      const TR = SIM.TROOPS, n = SIM.troopCount(me.troops);
      html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　兵 ${n}/${me.troopCap}　給金 ${SIM.money(me.wage)}/日</div>`;
      html += '<div class="muted">この拠点で雇える兵</div>';
      for (const [k, avail] of h.recruit) {
        const t = TR[k];
        html += `<div class="card"><div><b>${t.name}</b>　<span class="muted">${avail}人</span><br><span class="muted">1人 ${SIM.money(Math.round(t.cost * (me.costMod || 1)))}　給金 ${t.wage}文/日${t.fame ? `　名声${t.fame}以上` : ''}</span></div><div class="row">`
          + `<button id="r1-${k}" data-act="recruit" data-kind="${k}" data-qty="1" ${avail ? '' : 'disabled'}>雇う1</button><button id="r5-${k}" data-act="recruit" data-kind="${k}" data-qty="5" ${avail ? '' : 'disabled'}>雇う5</button></div></div>`;
      }
      html += '<div class="muted" style="margin-top:10px">率いている兵</div>';
      if (!n) html += '<div class="muted" style="margin-top:4px">まだいません。野盗（地図の×印）と戦うには兵を雇いましょう</div>';
      for (const k in me.troops) html += `<div class="card"><div>${TR[k].name}　${me.troops[k]}人</div><button id="dm-${k}" data-act="dismiss" data-kind="${k}" data-qty="1">1人解き放つ</button></div>`;
    } else {
      html += `<div class="card"><div>ここの人に話を聞く<br><span class="muted">相場の噂などが聞けます</span></div><button id="tk" data-act="talk">話しかける</button></div>`;
    }
    html += `<div class="muted" style="margin-top:8px">名声 ${me.fame}</div>`;
    if (html !== townHtml) {
      townHtml = html; $('townBody').innerHTML = html;
      const t = $('town'), f = currentFocus(t); if (f) setFocus(t, f);
    }
  }
  $('townBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const c = { type: b.dataset.act };
    if (b.dataset.item) c.item = b.dataset.item;
    if (b.dataset.qty) c.qty = +b.dataset.qty;
    if (b.dataset.id) c.id = b.dataset.id;
    if (b.dataset.kind) c.kind = b.dataset.kind;
    command(c);
  });
  document.querySelectorAll('#town [data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  $('townClose').onclick = () => openTown(false);
  $('townBtn').onclick = () => openTown(true);
  function cycleTab(d) { const tabs = ['market', 'jobs', 'work', 'army', 'talk']; setTab(tabs[(tabs.indexOf(townTab) + d + tabs.length) % tabs.length]); }

  // ---------- 人物（能力・技能・特技・部隊の昇格） ----------
  let charTab = 'stat', charHtml = '';
  function openChar(open) {
    const c = $('char');
    if (open === false || !G.priv) { c.classList.add('hidden'); return; }
    if (G.priv.battle) return toast('戦闘中は開けません', 1500);
    openTown(false); toggleMenu(false); c.classList.remove('hidden'); charHtml = ''; renderChar(); setFocus(c, currentFocus(c));
  }
  function setCTab(t) { charTab = t; charHtml = ''; renderChar(); setFocus($('char'), $('ctab-' + t)); }
  function cycleCTab(d) { const t = ['stat', 'perk', 'army', 'rank']; setCTab(t[(t.indexOf(charTab) + d + t.length) % t.length]); }
  function renderChar() {
    const P = G.priv; if (!P || !P.me.char || P.battle) return openChar(false);
    const me = P.me, C = me.char, TR = SIM.TROOPS, m = G.view && G.view.players.find((x) => x.id === G.myPid);
    $('charName').textContent = `${m ? m.name : ''}　格${C.level}　名声${C.fame}`;
    document.querySelectorAll('#char [data-ctab]').forEach((b) => b.classList.toggle('on', b.dataset.ctab === charTab));
    let html = '';
    if (charTab === 'stat') {
      html += `<div class="muted" style="margin-bottom:6px">能力値（上げられる点：${C.points}）　技能は使うほど伸び、元の能力値が高いほど伸びやすくなります</div>`;
      for (const a in SIM.ATTRS) html += `<div class="card"><div><b>${SIM.ATTRS[a]}</b>　${C.attrs[a]}<span class="muted">/10</span></div><button id="at-${a}" data-cact="addAttr" data-attr="${a}" ${C.points > 0 && C.attrs[a] < 10 ? '' : 'disabled'}>＋1</button></div>`;
      html += '<div class="muted" style="margin:10px 0 4px">技能</div>';
      for (const k in SIM.SKILLS) {
        const sk = SIM.SKILLS[k], [lv, xp] = C.skills[k] || [0, 0], pct = lv >= 100 ? 100 : Math.floor((xp / SIM.skillNeed(lv)) * 100);
        html += `<div class="card" style="display:block"><b>${sk.name}</b> ${lv}　<span class="muted">（${SIM.ATTRS[sk.attr]}）${sk.desc}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
      }
    } else if (charTab === 'perk') {
      html += '<div class="muted" style="margin-bottom:6px">技能が25・50になると、2つのうち1つを選べます</div>';
      for (const k in SIM.SKILLS) for (const lv of [25, 50]) {
        const opts = SIM.PERKS.filter((x) => x.skill === k && x.lv === lv), have = opts.find((x) => C.perks.includes(x.id));
        const reach = (C.skills[k] || [0])[0] >= lv;
        html += `<div class="muted" style="margin-top:6px">${SIM.SKILLS[k].name} ${lv}${reach ? '' : '（未到達）'}</div>`;
        for (const x of opts) html += `<div class="card perk ${have === x ? 'have' : ''}"><div><b>${x.name}</b><br><span class="muted">${x.desc}</span></div>`
          + (have === x ? '<span>習得</span>' : `<button id="pk-${x.id}" data-cact="pickPerk" data-id="${x.id}" ${reach && !have ? '' : 'disabled'}>選ぶ</button>`) + '</div>';
      }
    } else if (charTab === 'rank') {
      const R = me.rank, RK = SIM.RANKS, cur = RK[R.rank], nx = R.clan ? RK[R.rank + 1] : null;
      html += `<div class="card" style="display:block"><b>${R.clan ? R.clanName + '　' + cur.name : '浪人'}</b><br><span class="muted">${cur.desc}</span>`
        + (R.clan ? `<div class="muted">功績 ${R.merit}　俸禄 ${SIM.money(cur.stipend)}/月　率いる人数+${cur.cap}</div>` : '') + '</div>';
      if (!R.clan) {
        html += `<div class="muted" style="margin:6px 0">城主のいる城で仕官できます（名声${RK[1].fame}以上）。仕えると俸禄がもらえ、主家の領地の依頼や戦で功績が積めます</div>`;
        if (R.canServe) html += `<div class="card"><div>${R.factionHere}の${R.lordHere}様に仕える</div><button id="rk-serve" data-cact="serve" ${C.fame >= RK[1].fame ? '' : 'disabled'}>仕官する</button></div>`;
      } else {
        if (nx) html += `<div class="card"><div>次：<b>${nx.name}</b>　<span class="muted">功績${R.merit}/${nx.merit}　名声${C.fame}/${nx.fame}<br>${nx.desc}</span></div><button id="rk-promote" data-cact="promote" ${R.atOwn && R.merit >= nx.merit && C.fame >= nx.fame ? '' : 'disabled'}>昇進を願う</button></div>`
          + (R.atOwn ? '' : '<div class="muted">昇進は主家の城で願い出ます</div>');
        html += '<div class="muted" style="margin-top:10px">身分の一覧</div>';
        RK.forEach((r, i) => { if (i) html += `<div class="muted">${i === R.rank ? '▶ ' : ''}${r.name}　功績${r.merit}・名声${r.fame}　俸禄${SIM.money(r.stipend)}/月　人数+${r.cap}</div>`; });
        html += `<div class="card" style="margin-top:10px"><div>出奔する<br><span class="muted">浪人に戻る（名声-3、功績は消え、この家には二度と仕えられない）</span></div><button id="rk-leave" data-cact="leaveClan">出奔</button></div>`;
      }
    } else {
      html += `<div class="muted" style="margin-bottom:6px">兵 ${SIM.troopCount(me.troops)}/${me.troopCap}　所持金 ${SIM.money(me.money)}　給金 ${SIM.money(me.wage)}/日<br>戦や調練で兵が経験を積むと、上の兵種へ昇格できます（どこでもできます）</div>`;
      if (!SIM.troopCount(me.troops)) html += '<div class="muted">まだ兵がいません。拠点の「募兵」で雇えます</div>';
      for (const k in me.troops) {
        const t = TR[k], n = me.troops[k], need = SIM.upNeed(t.tier), xp = Math.floor(C.txp[k] || 0), ready = t.up ? Math.min(n, Math.floor(xp / need)) : 0;
        html += `<div class="card" style="display:block"><b>${t.name}</b> ${n}人　<span class="muted">格${t.tier}　攻${t.atk} 守${t.def} 体${t.hp}${t.ranged ? '　射程' + t.range + 'm' : ''}</span>`;
        if (!t.up) html += '<div class="muted">最上位の兵種です</div>';
        else {
          html += `<div class="muted">経験 ${xp}（1人あたり${need}）　昇格できる人数 ${ready}</div>`;
          for (const to of t.up) {
            const u = TR[to], cost = SIM.upCost({ perks: C.perks }, to), lock = u.fame && C.fame < u.fame;
            html += `<div class="row" style="margin-top:4px;align-items:center"><span>→ ${u.name}　<span class="muted">攻${u.atk} 守${u.def} 体${u.hp}　1人 ${SIM.money(cost)}${lock ? `　名声${u.fame}以上` : ''}</span></span>`
              + `<button id="up1-${k}-${to}" data-cact="upgrade" data-from="${k}" data-to="${to}" data-qty="1" ${ready && !lock ? '' : 'disabled'}>1人</button>`
              + `<button id="upa-${k}-${to}" data-cact="upgrade" data-from="${k}" data-to="${to}" data-qty="999" ${ready && !lock ? '' : 'disabled'}>全員</button></div>`;
          }
        }
        html += '</div>';
      }
    }
    if (html !== charHtml) { charHtml = html; $('charBody').innerHTML = html; const c = $('char'), f = currentFocus(c); if (f) setFocus(c, f); }
  }
  $('charBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cact]'); if (!b) return;
    const c = { type: b.dataset.cact };
    for (const k of ['attr', 'id', 'from', 'to']) if (b.dataset[k]) c[k] = b.dataset[k];
    if (b.dataset.qty) c.qty = +b.dataset.qty;
    command(c);
  });
  document.querySelectorAll('#char [data-ctab]').forEach((b) => (b.onclick = () => setCTab(b.dataset.ctab)));
  $('charClose').onclick = () => openChar(false);
  $('charBtn').onclick = () => openChar(true);
  $('mChar').onclick = () => openChar(true);

  // ---------- 戦闘の操作パネル ----------
  let battleHtml = '';
  const ORDN = { charge: '突撃', hold: '待機', retreat: '後退', flank: '回り込み', move: '移動中', rout: '潰走中' };
  function renderBattle(bt) {
    const TR = SIM.TROOPS;
    const sum = (side) => bt.units.filter((u) => u[1] === side).reduce((a, u) => a + (u[3] === 'hero' ? 1 : u[4]), 0);
    $('battleTitle').textContent = `${bt.foe}との戦い`;
    $('battleInfo').textContent = `味方 ${sum('A')}　敵 ${sum('B')}${bt.routed ? '（敗走中）' : ''}　${bt.t}秒`;
    let html = '';
    for (const u of bt.units) {
      if (u[2] !== G.myPid) continue;
      const [id, , , type, n, , , order, , mor] = u, T = TR[type];
      html += `<div class="bu ${G.selUnit === id ? 'sel' : ''}"><span class="nm">${type === 'hero' ? '本人' : T.name + (T.cls ? '〔' + SIM.CLS_NAME[T.cls] + '〕' : '') + ' ' + n + '人'}　<span class="muted">${ORDN[order]}${type === 'hero' ? '' : '　士気' + mor}</span></span>`
        + `<button id="bs-${id}" data-sel="${id}">選ぶ</button>`
        + ['charge', 'flank', 'hold', 'retreat'].map((o) => `<button id="bo-${id}-${o}" data-unit="${id}" data-order="${o}" ${order === 'rout' ? 'disabled' : ''}>${ORDN[o]}</button>`).join('') + '</div>';
    }
    html += `<div class="bu"><span class="nm"><b>全軍</b></span>` + ['charge', 'flank', 'hold', 'retreat'].map((o) => `<button id="bo-all-${o}" data-unit="all" data-order="${o}">${ORDN[o]}</button>`).join('') + '</div>';
    html += `<div class="muted" style="margin-top:4px">部隊を「選ぶ」かクリックして、戦場をクリックするとそこへ移動。槍は正面からの騎馬に強く、弓は接近戦に弱い。側面・背後から攻めると有利（騎馬は特に）</div>`;
    html += `<div class="row" style="margin-top:6px"><button id="bAuto" data-bact="battleAuto">自動で決着（スキップ）</button><button id="bFlee" data-bact="battleFlee">退却する（兵の3割を失う）</button></div>`;
    if (html !== battleHtml) { battleHtml = html; $('battleBody').innerHTML = html; const b = $('battle'), f = currentFocus(b); if (f) setFocus(b, f); }
  }
  $('battleBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sel) { G.selUnit = +b.dataset.sel; battleHtml = ''; }
    else if (b.dataset.order) command({ type: 'order', unit: b.dataset.unit, order: b.dataset.order });
    else if (b.dataset.bact) command({ type: b.dataset.bact });
  });

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
    const BT = G.priv && G.priv.battle;
    if (BT) { // 戦闘中：自分の部隊をクリックで選択、地面をクリックで選んだ部隊を移動
      const [fx, fy] = R.battleToField(e.offsetX, e.offsetY), L = R.battleLayout(SIM.FIELD);
      const mine = BT.units.filter((u) => u[2] === G.myPid).map((u) => [u, Math.hypot(u[5] - fx, u[6] - fy)]).sort((a, b) => a[1] - b[1])[0];
      if (mine && mine[1] * L.sc < 18 && p.btn !== 2) { G.selUnit = mine[0][0]; battleHtml = ''; return; }
      if (G.selUnit != null) command({ type: 'order', unit: G.selUnit, order: 'move', x: fx, y: fy });
      return;
    }
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
      if (activeMenu() === $('battle')) {
        if (k === 'Escape') { toggleMenu(true); return; }
        const o = { z: 'charge', x: 'hold', c: 'retreat', v: 'flank' }[k.toLowerCase()]; if (o) { command({ type: 'order', unit: 'all', order: o }); return; }
      }
      if (k === 'Escape') { if (G.mode === 'title') $('btnJoinBack').click(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else toggleMenu(false); return; }
      if (activeMenu() === $('char') && (k === 'q' || k === 'e')) { cycleCTab(k === 'q' ? -1 : 1); return; }
      if (activeMenu() === $('char') && (k === 'p' || k === 'P')) { openChar(false); return; }
      if (activeMenu() === $('town') && (k === 'q' || k === 'e')) { cycleTab(k === 'q' ? -1 : 1); return; }
    }
    if (G.mode !== 'host' && G.mode !== 'client') return;
    keys.add(k.toLowerCase());
    if (k === 'Escape') toggleMenu();
    else if (k === 'f' || k === 'F') $('mFollow').click();
    else if (k === 'Tab') { e.preventDefault(); cycleNear(); }
    else if (k === 'e' || k === 'E') openTown(true);
    else if (k === 'p' || k === 'P') openChar(true);
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
      const inBattle = activeMenu() === $('battle');
      if (down(1) && !inBattle) { if (G.mode === 'title') $('btnJoinBack').click(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else toggleMenu(false); }
      if (activeMenu() === $('town')) { if (down(4)) cycleTab(-1); if (down(5)) cycleTab(1); }
      else if (activeMenu() === $('char')) { if (down(4)) cycleCTab(-1); if (down(5)) cycleCTab(1); }
      if (down(9) && G.mode !== 'title') toggleMenu(inBattle);
    } else if (G.mode === 'host' || G.mode === 'client') {
      move = [lx, ly];
      if (rx || ry) { R.cam.follow = false; R.cam.x += rx * dt * 600 / R.cam.scale; R.cam.y += ry * dt * 600 / R.cam.scale; }
      if (btn(4)) R.zoom(1 - dt * 1.5); if (btn(5)) R.zoom(1 + dt * 1.5);
      if (down(0)) { if (G.selected) $('infoGo').click(); else openTown(true); }
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
      if (G.mode === 'host') { G.priv = SIM.privateState(G.world, G.myPid); SIM.drain(G.myPid).forEach((t) => toast(t, 4000)); }
      // WASD・左スティックで直接移動
      const BT = G.priv && G.priv.battle;
      if (BT && $('battle').classList.contains('hidden')) { $('battle').classList.remove('hidden'); openTown(false); openChar(false); selectSettlement(null); battleHtml = ''; }
      if (!BT && !$('battle').classList.contains('hidden')) { $('battle').classList.add('hidden'); battleHtml = ''; }
      let mx = BT ? 0 : padMove[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let my = BT ? 0 : padMove[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      const m = me(); dirSendAcc += dt;
      if (BT) { mx = my = 0; }
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
      const P = G.priv, marks = new Set();
      if (P) P.me.quests.forEach((q) => marks.add(q.type === 'deliver' ? q.to : q.from));
      if (BT) {
        for (const u of BT.units) {
          const key = 'u' + BT.id + '_' + u[0], d = G.disp[key];
          if (!d) G.disp[key] = { x: u[5], y: u[6] }; else { d.x += (u[5] - d.x) * k; d.y += (u[6] - d.y) * k; }
        }
        R.drawBattle(ctx, BT, G.disp, G.myPid, G.selUnit); renderBattle(BT);
      } else R.draw(ctx, G.view, G.disp, G.myPid, G.selected, marks);
      $('townBtn').classList.toggle('hidden', !(P && P.here) || !!BT);
      // 拠点に着いたら自動で拠点画面を開く
      const hereId = P && P.here && !BT ? P.here.id : null;
      if (hereId && hereId !== G.lastHere && $('char').classList.contains('hidden') && $('gameMenu').classList.contains('hidden')) openTown(true);
      G.lastHere = hereId;
      if (!$('town').classList.contains('hidden')) renderTown();
      if (!$('char').classList.contains('hidden')) renderChar();
      if (P) {
        $('quests').innerHTML = `所持金 ${SIM.money(P.me.money)}　荷 ${SIM.cargo(P.me)}/${P.me.cap}　名声 ${P.me.fame}　兵 ${SIM.troopCount(P.me.troops)}/${P.me.troopCap}` + (P.me.busy ? `<br>${P.me.busy.label}中…` : '')
          + P.me.quests.map((q) => `<div class="q">◆ ${q.title}（${q.type === 'deliver' ? sName(q.to) + 'へ' : sName(q.from) + 'へ納品'}・${dayLeft(q.deadline)}）</div>`).join('');
      }
      // HUD
      $('date').textContent = SIM.formatDate(G.view.t) + (G.speed === 0 ? '（停止中）' : G.speed > 1 ? `（×${G.speed}）` : '');
      if (m) {
        const at = m.at && G.view.settlements.find((s) => s.id === m.at);
        $('status').textContent = `${m.name}（${m.status || '浪人'}）　${BT ? '戦闘中' : at ? at.name + 'に滞在中' : m.tx != null ? `移動中（${SIM.terrainAt(m.x, m.y)}）` : `野外（${SIM.terrainAt(m.x, m.y)}）`}`;
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
