// 武将の旅：巡回兵を率いる武将・用事で街道を旅する武将・主を持たない浪人（会うと話しかけられる）
(function () {
  const SIM = SGK.SIM, rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const MAX_TRAVEL = 30, MAX_RONIN = 14, TALK_KM = 1.5, MAX_RET = 3, RET_CAP = 6;
  const newPerson = (w, faction, extra) => { const id = 'g' + w.nextId++; w.people[id] = Object.assign({ name: SIM.genName(w), faction, loyal: 55 + Math.floor(rnd(w) * 25) }, extra || {}); return id; };
  SIM.npcName = (w, n) => (n && n.person && w.people[n.person] ? w.people[n.person].name : null);

  // ---- 1. 巡回兵の隊長 ----
  function ensureLeaders(w) {
    for (const n of Object.values(w.npcs)) if (n.kind === 'patrol' && !n.person && n.faction) n.person = newPerson(w, n.faction, { role: 'patrol' });
  }

  // ---- 2. 用事で旅する武将（城主が本城へ参上・よその家へ使者） ----
  function spawnTravel(w) {
    const busy = new Set(Object.values(w.npcs).filter((n) => n.kind === 'bushou').map((n) => n.person));
    const cs = w.settlements.filter((s) => s.type === 'castle' && s.lord && !busy.has(s.lord) && w.factions[s.owner] && !w.factions[s.owner].player && !w.factions[s.owner].dead);
    if (!cs.length) return;
    const s = cs[Math.floor(rnd(w) * cs.length)], f = w.factions[s.owner];
    const own = w.settlements.filter((x) => x.type === 'castle' && x.owner === s.owner && x.id !== s.id && dist(x, s) < 200);
    const other = w.settlements.filter((x) => x.type === 'castle' && x.owner !== s.owner && x.owner && dist(x, s) < 120);
    const main = own.find((x) => x.lord === f.leader);
    let to, purpose;
    if (main && rnd(w) < 0.4) { to = main; purpose = `${f.name}の本城へ参上する`; }
    else if (other.length && rnd(w) < 0.35) { to = other[Math.floor(rnd(w) * other.length)]; purpose = `${(w.factions[to.owner] || {}).name || ''}への使者`; }
    else if (own.length) { to = own[Math.floor(rnd(w) * own.length)]; purpose = `${to.name}へ使いに行く`; }
    if (!to) return;
    const path = SIM.findPath(s.x, s.y, to.x, to.y); if (!path) return;
    const id = 'n' + w.nextId++;
    w.npcs[id] = { id, kind: 'bushou', faction: s.owner, person: s.lord, x: s.x, y: s.y, tx: to.x, ty: to.y, path, dest: to.id, at: null, home: s.id, goal: to.id, purpose,
      army: { yari: 4 + Math.floor(rnd(w) * 5), yumi: 1 + Math.floor(rnd(w) * 3) }, speed: 30, wait: 0, back: false };
    w.npcs[id].size = SIM.troopCount(w.npcs[id].army);
  }
  // ---- 3. 浪人：町や村を渡り歩く ----
  function spawnRonin(w) {
    const ts = w.settlements.filter((s) => s.type !== 'castle'); const s = ts[Math.floor(rnd(w) * ts.length)]; if (!s) return;
    const id = 'n' + w.nextId++, need = 6 + Math.floor(rnd(w) * 25);
    const army = { yari: 3 + Math.floor(rnd(w) * 6) }; if (rnd(w) < 0.5) army.yumi = 2 + Math.floor(rnd(w) * 3); if (need > 22 && rnd(w) < 0.5) army.kiba = 2;
    w.npcs[id] = { id, kind: 'ronin', faction: null, person: newPerson(w, null, { role: 'ronin' }), x: s.x, y: s.y, tx: null, ty: null, path: null, dest: null, at: s.id, home: s.id,
      need, fee: Math.round((800 + need * 150 + rnd(w) * 1500) / 100) * 100, army, size: SIM.troopCount(army), speed: 28, wait: rnd(w) * 1440 };
  }
  function travelTick(w, dt) {
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'bushou' && n.kind !== 'ronin') continue;
      if (n.tx != null) { if (SIM.moveEntity(n, dt)) { n.at = n.dest; n.dest = null; n.wait = n.kind === 'ronin' ? 720 + rnd(w) * 2160 : 360 + rnd(w) * 720; if (n.kind === 'bushou' && n.back) delete w.npcs[n.id]; } continue; }
      n.wait -= dt; if (n.wait > 0) continue;
      if (n.kind === 'bushou') { // 用事を済ませて帰る
        const h = SIM.settlement(w, n.home); if (!h) { delete w.npcs[n.id]; continue; }
        n.back = true; n.purpose = `${h.name}へ帰る`; n.tx = h.x; n.ty = h.y; n.dest = h.id; n.at = null; n.path = SIM.findPath(n.x, n.y, h.x, h.y); if (!n.path) delete w.npcs[n.id];
      } else {
        const c = w.settlements.filter((s) => s.type !== 'castle' && s.id !== n.at && dist(s, n) < 120 && dist(s, n) > 15);
        const s = c[Math.floor(rnd(w) * c.length)]; if (!s) { n.wait = 1440; continue; }
        const p = SIM.findPath(n.x, n.y, s.x, s.y); if (!p) { n.wait = 720; continue; }
        n.tx = s.x; n.ty = s.y; n.dest = s.id; n.at = null; n.path = p;
      }
    }
  }
  let lastDay = -1;
  SIM.systems.push(function bushouDaily(w, dt) {
    travelTick(w, dt);
    const d = Math.floor(w.time.min / 1440); if (w.bday === d) return; w.bday = d;
    ensureLeaders(w);
    const tr = Object.values(w.npcs).filter((n) => n.kind === 'bushou').length;
    for (let i = 0; i < Math.min(8, MAX_TRAVEL - tr); i++) if (rnd(w) < 0.7) spawnTravel(w);
    const rn = Object.values(w.npcs).filter((n) => n.kind === 'ronin').length;
    for (let i = 0; i < Math.min(3, MAX_RONIN - rn); i++) if (rnd(w) < 0.6) spawnRonin(w);
  });
  void lastDay;

  // ---- 話しかける ----
  function rumor(w, p) { // 近くで高く売れる品のうわさ
    const I = SGK.DATA.items; let best = null;
    for (const s of w.settlements) { if (dist(s, p) > 100) continue; for (const k in I) { const r = SIM.price(s, k) / I[k].base; if (!best || r > best[2]) best = [s, k, r]; } }
    return best && best[2] > 1.3 ? `「${best[0].name}では${I[best[1]].name}が高く売れるそうだ」` : '「近ごろは物の値も落ち着いておるな」';
  }
  SIM.commands.talkNpc = (w, p, c) => {
    const n = w.npcs[c.id]; if (!n || !n.person || p.battle || n.battle || n.fight) return;
    if (dist(n, p) > TALK_KM) return SIM.say(p.id, `もっと近づかないと話せません（${TALK_KM}km以内）`);
    const pr = w.people[n.person], f = w.factions[n.faction];
    if (n.kind === 'ronin') {
      p.retainers = p.retainers || [];
      if (p.retainers.length >= MAX_RET) return SIM.say(p.id, `${pr.name}「お主にはもう十分な家臣がおるようだ」（家臣は${MAX_RET}人まで）`);
      if (p.fame < n.need) return SIM.say(p.id, `${pr.name}「名もなき者には仕えられぬ。名声${n.need}になったらまた声をかけてくれ」`);
      if (p.money < n.fee) return SIM.say(p.id, `${pr.name}「支度金${SIM.money(n.fee)}を用意してくれれば、お主に仕えよう」`);
      p.money -= n.fee; p.retainers.push(n.person); pr.retainerOf = p.id; pr.faction = p.clan || null;
      const cap = SIM.troopCap(p); let room = cap - SIM.troopCount(p.troops), came = 0;
      for (const k in n.army) { const q = Math.min(n.army[k], Math.max(0, room)); if (q > 0) { p.troops[k] = (p.troops[k] || 0) + q; room -= q; came += q; } }
      delete w.npcs[n.id];
      return SIM.say(p.id, `${pr.name}が家臣になりました！（支度金${SIM.money(n.fee)}・手勢${came}人が加わり、率いる人数+${RET_CAP}）`);
    }
    p.kao = p.kao || {};
    if (f && !p.kao[n.faction]) {
      p.kao[n.faction] = true; p.fame += 0.5;
      return SIM.say(p.id, `${pr.name}（${f.name}）と顔をつなぎました。${f.name}に仕官しやすくなりました（必要な名声5→2・名声+0.5）`);
    }
    SIM.say(p.id, `${pr.name}${rumor(w, p)}`);
  };
  // 家臣（もと浪人）の分だけ率いる人数が増える
  const baseCap = SIM.troopCap;
  SIM.troopCap = (p) => baseCap(p) + (p.retainers ? p.retainers.length * RET_CAP : 0);
  SIM.serveFame = (p, fid) => (p.kao && p.kao[fid] ? 2 : SIM.RANKS[1].fame);

  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid];
    r.me.retainers = (p.retainers || []).map((id) => (w.people[id] || {}).name).filter(Boolean);
    r.me.kao = Object.keys(p.kao || {});
    r.me.troopCap = SIM.troopCap(p);
    if (r.me.rank) { const s = p.at && SIM.settlement(w, p.at); r.me.rank.serveNeed = s ? SIM.serveFame(p, s.owner) : SIM.RANKS[1].fame; }
    return r;
  };
})();
