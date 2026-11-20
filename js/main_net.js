// ホスト・世界に入る・参加者・表示用データ・命令の送り先
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- ホスト ----------
const timerWorker = new Worker(URL.createObjectURL(new Blob(['let iv;onmessage=e=>{clearInterval(iv);if(e.data>0)iv=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' })));
let lastTick = 0, netAcc = 0, saveAcc = 0, saveCount = 0;

// ---------- 2.3.0 世界に入る（イセログ方式）：ホストがいれば参加、いなければ自分がホスト ----------
// code：世界コード（null なら新しく作る）／local：この端末の世界（新規・控え・読み込み）／slot：この端末の控えのスロット
let entering = false;
async function playWorld(code, local, msg, slot) {
  if (entering) return; entering = true;
  const CLD = SGK.CLOUD;
  try {
    if (!CLD.on()) { if (!local) throw new Error('クラウドが使えません'); SGK.SAVE.slot = slot || 0; startHost(local, msg, null); return; }
    titleMsg('世界に入っています…');
    if (!code) { code = await CLD.newCode(); local.code = code; }
    myProf();
    const ent = await SGK.NET.enter(code, () => ({ name: myName(), cnt: 1 }));
    CLD.remember(code);
    if (ent.role === 'guest') { titleMsg('ホストにつないでいます…'); startClient(ent, code); return; }
    await hostFromCloud(code, ent, local, msg, slot, null);
  } catch (e) { G.mode = 'title'; titleMsg(e.message); }
  finally { entering = false; }
}
// ホストになる：クラウドの世界（手元の方が新しければ手元）を読んで始める。mine：引き継いだ人の「自分の分」
async function hostFromCloud(code, ent, local, msg, slot, mine) {
  const CLD = SGK.CLOUD;
  let w = local, cloud = null;
  try { cloud = await CLD.load(code); } catch (e) { if (/新しいバージョン/.test(e.message)) { CLD.rest(code, 'host', 'DELETE').catch(() => {}); throw e; } console.warn(e); }
  if (cloud && (!w || (cloud.savedAt || 0) > (w.savedAt || 0))) { w = cloud; if (local) msg = 'クラウドの方が新しかったので、そちらから再開しました'; }
  if (!w) { CLD.rest(code, 'host', 'DELETE').catch(() => {}); try { ent.peer && ent.peer.destroy(); } catch (e) {} throw new Error('その世界は見つかりません（世界コードを確かめてください）'); }
  w.code = code;
  SGK.SAVE.slot = slot || SGK.SAVE.slotOf(code) || 0;
  // 2.4.0 引き継ぎの準備：保存より後の「自分の分」を受け付ける／途中だった「自分で戦う」合戦は、その人が戻るか30秒たったら自動で決着
  G.loadedAt = w.savedAt || 0; G.merged = {}; G.pendingMine = mine;
  const ids = Object.keys(w.battles || {}).filter((id) => w.battles[id].act);
  G.autoWait = ids.length ? { t: performance.now(), ids } : null;
  startHost(w, msg || '{i:crown} あなたがホストになりました（いまからこの世界の時間が進みます）', ent);
}
// 2.4.0 引き継ぎ：参加者が持っていた「自分の分」（クラウドの保存より新しいもの）で、その人の武将を置きかえる
function mergeMine(w, pid, mine) {
  if (!mine || !mine.p || typeof mine.p !== 'object' || mine.p.id !== pid || !(mine.ma > G.loadedAt) || (G.merged || {})[pid] || !w.players[pid]) return false;
  const old = w.players[pid], p = mine.p;
  if (old.battle && w.battles[old.battle] && p.battle !== old.battle) { // 保存のあとに終わっていた合戦からは外す（古い結果で上書きしないように）
    const b = w.battles[old.battle]; b.pids = b.pids.filter((x) => x !== pid); if (b.act && b.act.inp) delete b.act.inp[pid];
    if (!b.pids.length) SIM.autoResolve(w, b);
  }
  if (p.battle && !w.battles[p.battle]) p.battle = null;
  delete p.off; SIM.ensurePlayer(p);
  w.players[pid] = p; G.merged[pid] = 1;
  return true;
}
// 2.4.0 参加者：ホストが抜けたら、次のホストを探す。誰もいなければ自分が引き継ぐ
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rejoin(why) {
  if (G.rejoining || G.mode !== 'client') return; G.rejoining = true;
  const code = G.roomCode, CLD = SGK.CLOUD, old = G.hostBoard || {}, my = G.myPid;
  if (G.net) { G.net.close(); G.net = null; }
  toast(`${why}。引き継ぎ先を探しています…`, 6000); $('roomInfo').innerHTML = `世界コード <b>${code}</b><br><span class="muted">ホストを探しています…</span>`;
  let firstAt = null;
  try {
    for (let tr = 0; tr < 40; tr++) {
      if (G.mode !== 'client' || G.myPid !== my) return; // タイトルへ戻った
      const h = await CLD.rest(code, 'host').catch(() => null);
      if (CLD.fresh(h) && h.id) {
        if (firstAt == null) firstAt = h.at;
        if (h.id !== old.id || h.at > firstAt + 1000) { // 新しいホスト（同じ人でも、掲示板がまだ更新されていれば生きている）
          if (h.ver !== SGK.VERSION) throw new Error(`新しいホストのバージョンが違います（${h.ver}）。更新ボタンを押してください`);
          const peer = await SGK.NET.openPeer(); startClient({ role: 'guest', peer, board: h }, code, true); return;
        }
      } else if (!CLD.fresh(h)) {
        await sleep(Math.random() * 2000);
        const h2 = await CLD.rest(code, 'host').catch(() => null);
        if (!CLD.fresh(h2)) {
          const peer = await SGK.NET.openPeer().catch(() => null);
          const n = await SGK.NET.claim(code, peer, () => ({ name: myName(), cnt: 1 })).catch(() => null);
          if (n) { const mine = G.mine; Object.assign(G, { dyn: null, priv: null, actView: null }); await hostFromCloud(code, { role: 'host', peer, nonce: n }, null, '{i:crown} ホストを引き継ぎました（いまからこの世界の時間が進みます）', 0, mine); return; }
          if (peer) try { peer.destroy(); } catch (e) {}
        }
      }
      await sleep(3000);
    }
    throw new Error('引き継ぎ先が見つかりませんでした。少し待ってから、もう一度入ってください');
  } catch (e) { G.mode = 'client'; backToTitle(); titleMsg(e.message); }
  finally { G.rejoining = false; }
}
// クラウドへ保存（ホストだけ）
let cloudAt = 0;
function cloudSave(force) {
  if (G.mode !== 'host' || !G.world || !G.world.code || G.noCloud) return Promise.resolve(false);
  cloudAt = 0;
  return SGK.CLOUD.save(G.world.code, G.world).then((ok) => { if (!ok && SGK.CLOUD.err && G.lastCloudErr !== SGK.CLOUD.err) { G.lastCloudErr = SGK.CLOUD.err; toast('{i:cloud} クラウド保存に失敗：' + SGK.CLOUD.err, 5000); } return ok; });
}
const cloudSoon = () => { if (!cloudAt) cloudAt = performance.now() + CFG.CLOUD_SOON_MS; };

function startHost(world, msg, ent) {
  G.mode = 'host'; G.world = world; G.noCloud = false; G.speed = 1; G.disp = {}; G.selected = null;
  G.myPid = SIM.addPlayer(world, token, myName(), myProf()); SIM.localPid = G.myPid;
  if (G.pendingMine) { mergeMine(world, G.myPid, G.pendingMine); G.pendingMine = null; } G.sentMine = {}; G.mineAcc = 0;
  G.stat = SIM.staticState(world);
  show('game'); hostUI(true); toast(msg);
  centerOnMe();
  lastTick = performance.now(); netAcc = saveAcc = 0;
  timerWorker.onmessage = hostTick; timerWorker.postMessage(CFG.TICK_MS);
  SGK.SAVE.save(world); cloudSave(); G.roomCode = world.code || null; G.evKey = null;
  titleMsg('');
  if (ent) {
    G.net = SGK.NET.host(ent.peer, world.code, ent.nonce, {
      onLost: (t) => { G.noCloud = true; G.net.close(t); G.net = null; backToTitle(); titleMsg(t); },
      info: () => ({ name: myName(), cnt: (G.net ? G.net.pids().length : 0) + 1 }),
      onHello: (conn, m) => {
        const pid = SIM.addPlayer(G.world, String(m.token).slice(0, 40), String(m.name || '').slice(0, 12), m.prof);
        if (pid && m.mine && mergeMine(G.world, pid, m.mine)) cloudSoon(); // 2.4.0 引き継ぎで戻ってきた人
        if (pid) { delete G.sentMine[pid]; if (G.sentPriv) delete G.sentPriv[pid]; conn.send({ t: 'welcome', pid, static: G.stat, ver: SGK.VERSION, hostCode: G.roomCode, hostName: myName() }); toast(`${G.world.players[pid].name} が参加しました`); updateRoom(); setTimeout(() => G.net && G.net.beat(), 500); }
        return pid;
      },
      onCmd: (pid, cmd) => (cmd && cmd.type === 'ninRelay' ? ninRelay(pid, cmd) : SIM.applyCommand(G.world, pid, cmd)),
      onLeave: (pid) => { for (const b of Object.values(G.world.battles || {})) if (b.act) { delete b.act.inp[pid]; } const p = G.world.players[pid]; if (p) toast(`${p.name} が退出しました`); updateRoom(); cloudSoon(); },
    });
    if (!ent.peer) toast('通信の準備ができなかったので、ほかの人は入れません（1人で遊べます）', 5000);
  } else if (SGK.CLOUD.on()) toast('クラウドにつながらないので、この端末だけで遊びます', 5000);
  updateRoom();
}
// 2.41.0 忍びの協力任務のやりとりを、宛先の人へそのまま届ける（ホストが中継役）
function ninRelay(from, cmd) {
  const m = cmd.m, to = cmd.to; if (!m || !Array.isArray(to)) return;
  for (const t of to.slice(0, 4)) { if (t === G.myPid) { { const Rv = m.ch === 'party' ? SGK.PARTY : SGK.NINJA3D; if (Rv && Rv.recv) Rv.recv(from, m); } } else if (G.net && G.net.sendTo) G.net.sendTo(t, { t: 'nin', from, m }); }
}
SGK.ninSend = (to, m) => { if (G.mode === 'host') ninRelay(G.myPid, { m, to }); else if (G.mode === 'client' && G.net) G.net.send({ type: 'ninRelay', to, m }); };
SIM.online = () => [G.myPid, ...(G.mode === 'host' && G.net && G.net.pids ? G.net.pids() : [])]; // 2.57.1 いまつながっている人（人と人の忍びの対戦の相手を選ぶ）
// 2.42.0 みんなで遊ぶミニゲーム（party.js）に、自分の名前・同じ町の人・送る道具を渡す
if (SGK.PARTY) SGK.PARTY.init({ me: () => G.myPid, name: () => myName(), send: (to, m) => SGK.ninSend(to, m), cmd: (c) => command(c), toast: (s) => toast(s, 2500),
  others: () => { const m0 = me(); return m0 && m0.at ? G.view.players.filter((p) => p.id !== G.myPid && p.at === m0.at).map((p) => ({ id: p.id, name: p.name })) : []; } });
function hostTick() { if (G.mode !== 'host' || !G.world) { timerWorker.postMessage(0); return; } /* 2.59.1 ホストでなくなったのに時計が残っていたら止める */ try { hostTick0(); } catch (e) { const t = 'エラー(ホストの進行): ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastHostErr !== t) { G.lastHostErr = t; errToast(t); } } }
// 2.40.4 参加者ごとの「自分用の情報」は、前に送ったものから変わっていなければ送らない（参加者は前のものを使い続ける。念のため5秒ごとには送り直す）
function privFor(pid, now) {
  const pv = SIM.privateState(G.world, pid), j = JSON.stringify(pv); G.sentPriv = G.sentPriv || {}; const o = G.sentPriv[pid];
  if (o && o.j === j && now - o.t < 5000) return undefined;
  G.sentPriv[pid] = { j, t: now }; return pv;
}
function hostTick0() {
  const now = performance.now(); const dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
  G.inBattle = Object.keys(G.world.battles || {}).length > 0; // 0.32.0 誰かが戦闘中は時間を等倍に
  G.effSpeed = G.inBattle && G.speed > 1 ? 1 : G.speed;
  { const on = new Set([G.myPid, ...(G.net ? G.net.pids() : [])]); for (const id in G.world.players) G.world.players[id].off = !on.has(id); } // 0.61.1 いま接続していない人（前のマルチプレイの参加者）は地図に出さない
  SIM.step(G.world, dt * CFG.MIN_PER_SEC * G.effSpeed);
  if (SIM.planCheck) SIM.planCheck(G.world, dt); // 2.23.1 軍議の終わり（時間を止めていても）
  // 0.62.0 ホストが入っていない「自分で戦う」の戦闘は、ここで進めて、その人へ様子を送る
  for (const b of Object.values(G.world.battles || {})) {
    if (!b.act || b.pids.includes(G.myPid)) continue;
    let left = Math.min(dt, 0.5); while (left > 0 && G.world.battles[b.id]) { const st = Math.min(0.05, left); SIM.actStep(G.world, b, st); left -= st; }
  }
  if (G.net) for (const pid of G.net.pids()) {
    const p = G.world.players[pid], b = p && p.battle && G.world.battles[p.battle]; if (!b || !b.act) continue;
    b.act.sn = b.act.sn || {}; const n = b.act.sn[pid] = (b.act.sn[pid] || 0) + 1;
    G.net.sendTo(pid, { t: 'act', a: SIM.actSnap(b, n % 10 === 1) });
  }
  { // 0.54.5 1人のとき：拠点に着いたら時間を止め、次に動き出すと元の速さに戻す
    const m = G.world.players[G.myPid], at = m && m.at, solo = !G.net || !G.net.pids().length;
    if (solo && at && at !== G.lastAt && G.speed > 0 && !m.battle) { G.autoPause = G.speed; G.speed = 0; toast(`${(SIM.settlement(G.world, at) || {}).name || '拠点'}に着いたので時間を止めました（動き出すと再開）`, 2500); }
    if (G.autoPause && m && (m.tx != null || m.follow)) { G.speed = G.autoPause; G.autoPause = 0; }
    G.lastAt = at;
  }
  G.mineAcc = (G.mineAcc || 0) + dt * 1000;
  if (G.net && G.mineAcc >= CFG.MINE_SEND_MS) { // 2.4.0 参加者へ「自分の分」を送る（ホストが抜けた時の引き継ぎ用。変わった時だけ）
    G.mineAcc = 0;
    for (const pid of G.net.pids()) { const p = G.world.players[pid]; if (!p) continue; const j = JSON.stringify(p); if (G.sentMine[pid] !== j) { G.sentMine[pid] = j; G.net.sendTo(pid, { t: 'mine', p }); } }
  }
  netAcc += dt * 1000;
  if (netAcc >= CFG.NET_SEND_MS) {
    netAcc = 0;
    if (G.net) { G.net.each((pid) => { try { const st = { t: 'state', s: SIM.dynamicState(G.world, pid), sp: G.speed, priv: privFor(pid, now), msgs: SIM.drain(pid), bt: G.inBattle }; G.sentOnce = G.sentOnce || {}; if (!G.sentOnce[pid]) { G.sentOnce[pid] = 1; toast(`参加者へ様子を送りはじめました（${Math.round(JSON.stringify(st).length / 1024)}KB）`, 8000); } return st; } catch (e) { // 1.6.3 参加者への様子が作れないときは、ホストと参加者の両方にエラーを出す
        const t = 'エラー(参加者へ送信): ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastNetErr !== t) { G.lastNetErr = t; errToast(t); } return { t: 'err', text: t }; } }); }
    for (const pid in SIM.out) if (pid !== G.myPid) delete SIM.out[pid]; // 接続していない人宛ては捨てる
  }
  saveAcc += dt;
  if (saveAcc >= CFG.AUTOSAVE_SEC) { saveAcc = 0; SGK.SAVE.save(G.world); cloudSave(); if (++saveCount % CFG.BACKUP_EVERY === 0) SGK.SAVE.backup(G.world); }
  { // 2.3.0 大事な出来事（合戦が終わった・城や村の持ち主が変わった・仕官や昇進）のあとはすぐクラウドへ
    const w = G.world, k = Object.keys(w.battles || {}).length + '|' + w.settlements.map((x) => x.owner || '').join(',') + '|' + Object.values(w.players).map((p) => (p.clan || '') + (p.rank && p.rank.id || p.rank || '')).join(',');
    if (G.evKey != null && k !== G.evKey) cloudSoon(); G.evKey = k;
    if (cloudAt && now >= cloudAt) cloudSave();
    if (G.autoWait) { // 2.4.0 引き継ぐ前に途中だった「自分で戦う」合戦：その人たちが戻るか、30秒たったら自動で決着
      const AW = G.autoWait, late = now - AW.t > CFG.AUTO_WAIT_MS;
      AW.ids = AW.ids.filter((id) => { const b = w.battles[id]; if (!b || !b.act) return false; if (late || b.pids.every((p) => p === G.myPid || G.merged[p])) { SIM.autoResolve(w, b); b.pids.forEach((p) => SIM.say(p, 'ホストが代わったため、途中だった合戦は自動で決着しました')); cloudSoon(); return false; } return true; });
      if (!AW.ids.length) G.autoWait = null;
    }
    if (G.net) G.net.tick();
  }
}
function updateRoom() {
  if (G.mode === 'host') {
    const online = G.net ? G.net.pids() : [];
    const names = [G.world.players[G.myPid].name, ...online.map((p) => (G.world.players[p] || {}).name)].join('・');
    $('roomInfo').innerHTML = (G.roomCode ? `世界コード <b>${G.roomCode}</b>` : 'この端末だけの世界') + `<br><span class="muted">${SGK.ICON.html('crown', 16)}ホスト　${online.length + 1}/${CFG.MAX_PLAYERS}人（${names.replace(/[<&]/g, '')}）</span>`;
  } else if (G.mode === 'client') $('roomInfo').innerHTML = `世界コード <b>${G.roomCode || ''}</b><br><span class="muted">${(G.hostName || '').replace(/[<&]/g, '')}がホスト</span>${G.ping ? `<br><span class="muted">通信の遅れ ${Math.round(G.ping)}ms</span>` : ''}`;
}
// 2.50.0 遊んでいる人物から引き継ぎの記録を取る（20秒ごと・タブを隠す時）。参加者は、ホストから届く「自分の分」から取る
const carryNow = () => { try { if (G.mode === 'title') return; const p = G.mode === 'client' ? G.mine && G.mine.p : G.world && G.myPid && G.world.players && G.world.players[G.myPid]; if (p) SGK.CARRY.absorb(p); } catch (e) { /* 記録できなくても遊びは続ける */ } };
setInterval(carryNow, 20000); document.addEventListener('visibilitychange', () => { if (document.hidden) carryNow(); });
setInterval(() => { try { if (G.mode === 'client' && G.net && G.net.ping) { G.net.ping(); updateRoom(); } else if (G.mode !== 'client') G.ping = 0; } catch (e) {} }, 2000); // 2.49.0
function hostUI(on) { document.querySelectorAll('.hostOnly').forEach((e) => e.classList.toggle('hidden', !on)); }
document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { G.speed = +b.dataset.speed; G.autoPause = 0; }));

// ---------- 参加者 ----------
function startClient(ent, code, again) {
  timerWorker.postMessage(0); // 2.59.1 参加者になるときはホストの時計を止める
  if (!again) { G.mode = 'connecting'; G.mine = null; } G.roomCode = code; G.hostBoard = ent.board;
  SGK.NET.mine = () => (again && G.mine ? G.mine : null); // 2.4.0 引き継ぎで入り直す時だけ「自分の分」を渡す
  const onState0 = (m) => { { const t = performance.now(); G.stIv = G.stT ? (G.stIv || 200) * 0.7 + (t - G.stT) * 0.3 : 200; G.stT = t; } G.dyn = m.s; G.speed = m.sp; G.inBattle = m.bt; if (m.priv) G.priv = m.priv; (m.msgs || []).forEach(toastMsg); if (!G.centered) { G.centered = true; buildView(); centerOnMe(); } };
  G.net = SGK.NET.join(ent.peer, ent.board, token, myName(), {
    onWelcome: (m) => { G.hostName = m.hostName; G.mode = 'client'; G.myPid = m.pid; SIM.localPid = m.pid; G.actView = null; G.dyn = null; G.stat = m.static; setTimeout(() => { if (G.mode === 'client' && !G.dyn) errToast('ホストから様子が届いていません（ホストの画面にエラーが出ていないか見てください）'); }, 6000); G.disp = {}; G.selected = null; show('game'); hostUI(false); titleMsg(''); updateRoom(); toast(again ? '新しいホストにつながりました' : '参加しました'); },
    onErr: (m) => { if (G.lastErr !== m.text) { G.lastErr = m.text; errToast(m.text); } },
    onAct: (m) => { const BT = G.priv && G.priv.battle; if (BT && BT.id === m.a.id) G.actView = SIM.actApply(G.actView, m.a); },
    onState: (m) => { try { onState0(m); } catch (e) { const t = 'エラー: ' + (e && e.message); if (G.lastErr !== t) { G.lastErr = t; errToast(t); } } },
    onBye: (why) => { if (again && G.mode === 'client') { G.mode = 'client'; } backToTitle(); titleMsg(why); },
    onLost: (why) => rejoin(why),
    onPing: (ms) => { G.ping = G.ping ? G.ping * 0.6 + ms * 0.4 : ms; }, // 2.49.0 通信の遅れ（往復）
    onMine: (m) => { if (m.p && m.p.id === G.myPid) G.mine = { p: m.p, ma: SGK.CLOUD.now() }; },
    onNin: (m) => { const Rv = m.m && m.m.ch === 'party' ? SGK.PARTY : SGK.NINJA3D; if (Rv && Rv.recv) Rv.recv(m.from, m.m); },
  });
}

function backToTitle() {
  timerWorker.postMessage(0); // 2.59.1 ホストの時計はいつも止める（ホストから参加者に切り替わった後でも）
  if (G.mode === 'host') {
    if (G.world) SGK.SAVE.save(G.world);
    const net = G.net; if (net) net.close();
    cloudSave().finally(() => { if (net) net.unboard(); }); // 保存が終わってから掲示板を消す（次の人が古い世界を読まないように）
  } else if (G.net) G.net.close();
  Object.assign(G, { mode: 'title', world: null, net: null, dyn: null, view: null, centered: false, roomCode: null, mine: null, autoWait: null, pendingMine: null });
  $('gameMenu').classList.add('hidden'); $('info').classList.add('hidden'); $('town').classList.add('hidden'); $('battle').classList.add('hidden'); $('char').classList.add('hidden'); G.priv = null;
  contBtn();
  show('title');
}
// タブを閉じるときもセーブ
window.addEventListener('pagehide', () => { if (G.mode === 'host') { SGK.SAVE.save(G.world); if (G.net) G.net.unboard(true); } });
// 2.3.0 画面を隠した時（タブの切り替え・閉じる前など）にクラウドへ保存。閉じる瞬間は大きなデータを送れないので、ここで先に送っておく
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && G.mode === 'host') cloudSave(); else if (document.visibilityState === 'visible' && G.mode === 'host' && G.net) G.net.beat(); });

// ---------- 表示用データ ----------
function buildView() {
  if (G.mode === 'host') {
    const w = G.world;
    const m = w.players[G.myPid], sr = m ? SIM.sightRadius(w, m) : 0;
    const vis = (e) => !m || e === m || SIM.canSee(m, sr, e.x, e.y);
    G.view = { t: w.time.min, sr, settlements: w.settlements, factions: w.factions, people: w.people, wars: Object.keys(w.wars || {}), players: Object.values(w.players).filter((p) => p === m || !p.off), /* 1.6.52 プレイヤーは視界の外でも出す */
      // 0.54.3 ホストでも参加者と同じ形に（大将の名前・率いる武将・用件を付ける。前はホストだけ「武将の隊」と出ていた）
      npcs: Object.values(w.npcs).filter(vis).map((n) => Object.assign({}, n, { battle: n.battle ? 1 : n.fight ? 2 : 0, at: n.tx == null ? n.at || null : null, pname: SIM.npcName ? SIM.npcName(w, n) : null,
        extra: n.kind === 'bushou' ? n.purpose : n.kind === 'ronin' ? [n.need, n.fee] : null, lead: SIM.npcLead ? SIM.npcLead(w, n) : null })), bm: SIM.battleMarks ? SIM.battleMarks(w, G.myPid) : [] };
  } else if (G.mode === 'client' && G.dyn) {
    const d = G.dyn, s = G.stat;
    if (d.pp) G.pp = d.pp; if (d.ps) G.ps = d.ps; // 0.52.0 人口（0.70.0 物資のそろい具合も）
    if ((d.rv || 0) !== (G.rv || 0)) { G.rv = d.rv || 0; SIM.applyRoads(d.ra || []); } // 0.40.0 普請でできた道
    G.view = {
      t: d.t, sr: d.sr, settlements: withOwners(d.ns && d.ns.length ? s.settlements.filter((x) => !d.ns.some((n) => n.id === x.id)).concat(d.ns) : s.settlements, d.ow),
      factions: d.pf && Object.keys(d.pf).length ? Object.assign({}, s.factions, d.pf) : s.factions, people: s.people, wars: d.wars || [],
      players: d.p.map(([id, name, x, y, at, tx, ty, status, path, spd]) => ({ id, name, x, y, at, tx, ty, status, path, spd, mon: d.mons && d.mons[id] })),
      npcs: d.n.map(([id, kind, faction, x, y, size, battle, dest, cargo, army, home, at, pname, extra, lead, spd]) => ({ id, kind, faction, x, y, size, battle, dest, at, cargo: cargo && { item: cargo[0], qty: cargo[1] }, army, home, pname, lead, extra, spd })),
      bm: d.bm || [], /* 1.6.51 味方の合戦の印 */
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
SGK.cmd = command; // 2.11.0 釣り・虫取りの画面（gather.js）から使う
function moveTo(x, y, dest) { command({ type: 'move', x, y, dest: dest || null }); if (!dest && SIM.isSea(x, y)) toast('海の上には移動できません', 1500); }

