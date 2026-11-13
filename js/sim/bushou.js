// 武将の旅：巡回兵を率いる武将・用事で街道を旅する武将・主を持たない浪人（会うと話しかけられる）
(function () {
  const SIM = SGK.SIM, rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const MAX_TRAVEL = 30, MAX_RONIN = 14, TALK_KM = 1.5, MAX_RET = 3, RET_CAP = 6;
  const newPerson = (w, faction, extra) => { const id = 'g' + w.nextId++; w.people[id] = Object.assign({ name: SIM.genName(w), faction, loyal: 55 + Math.floor(rnd(w) * 25) }, extra || {}); return id; };
  SIM.npcName = (w, n) => (n && n.person && w.people[n.person] ? w.people[n.person].name : null);

  // ---- 1. 巡回兵の隊長 ----
  let ensureLeaders = function (w) {
    for (const n of Object.values(w.npcs)) if (n.kind === 'patrol' && !n.person && n.faction) n.person = newPerson(w, n.faction, { role: 'patrol' });
  };

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
  // 0.47.1 始めた直後から見回りの隊にも大将を付ける（前は次の日まで「武将の隊」のままだった）
  const baseEnsureB = SIM.ensure;
  SIM.ensure = (w) => { baseEnsureB(w); ensureLeaders(w); return w; };

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
  // ===== 0.34.0 家臣の武将：城ごとに2〜4人（本城は多め）。能力（統率・武勇）を持ち、見回りの隊や軍勢を率いる =====
  const isMain = (w, s) => { const f = w.factions[s.owner]; return f && f.leader && s.lord === f.leader; };
  const want = (w, s) => (isMain(w, s) ? 4 : 2 + (s.id.length % 2));
  SIM.genStats = (w, pr, lord) => { if (pr.tou == null) { const b = lord ? 50 : 35; pr.tou = b + Math.floor(rnd(w) * 40); pr.bu = b + Math.floor(rnd(w) * 40); } return pr; };
  const cpuCastle = (w, s) => s.type === 'castle' && !s.site && s.owner && w.factions[s.owner] && !w.factions[s.owner].dead && !s.holder;
  const live = (w, id) => w.people[id] && !w.people[id].dead && !w.people[id].captive; // 捕らわれている武将は動けない
  function newVassal(w, s) { const id = newPerson(w, s.owner, { role: 'vassal', castle: s.id, loyal: 50 + Math.floor(rnd(w) * 30) }); SIM.genStats(w, w.people[id]); s.vass.push(id); return id; }
  function ensureVassals(w) {
    for (const pr of Object.values(w.people)) SIM.genStats(w, pr, true);
    const lords = new Set(w.settlements.filter((x) => x.lord).map((x) => x.lord));
    for (const s of w.settlements) {
      if (s.type !== 'castle') continue;
      if (!s.vass) { s.vass = []; if (cpuCastle(w, s)) for (let i = 0; i < want(w, s); i++) newVassal(w, s); }
      s.vass = s.vass.filter((id) => live(w, id) && !lords.has(id));
    }
    for (const n of Object.values(w.npcs)) if (n.kind === 'patrol' && n.person && live(w, n.person)) { // もとからいる隊の大将は、その城の家臣にする
      const h = SIM.settlement(w, n.home); if (h && h.vass && live(w, n.person) && !h.vass.includes(n.person) && !lords.has(n.person)) { h.vass.push(n.person); w.people[n.person].castle = h.id; }
    }
  }
  const leading = (w) => { const b = new Set(); for (const n of Object.values(w.npcs)) { if (n.person) b.add(n.person); for (const g of n.gens || []) b.add(g); } return b; };
  function pickVassal(w, s, busy) { return (s.vass || []).filter((id) => live(w, id) && !busy.has(id)).sort((a, b) => w.people[b].tou - w.people[a].tou)[0] || null; }
  function vassalDaily(w) {
    ensureVassals(w);
    const busy = leading(w);
    for (const s of w.settlements) {
      if (s.type !== 'castle' || !s.vass) continue;
      // 城を奪われた家臣：忠誠が低いと寝返り、そうでなければ元の家の近くの城へ落ち延びる
      for (const id of s.vass.slice()) {
        const pr = w.people[id]; if (pr.faction === s.owner || busy.has(id)) continue;
        s.vass.splice(s.vass.indexOf(id), 1);
        if (s.owner && rnd(w) < (60 - pr.loyal) / 60) { pr.faction = s.owner; pr.loyal = 45; s.vass.push(id); continue; }
        const to = w.settlements.filter((x) => x.type === 'castle' && x.owner === pr.faction && x.vass).sort((a, b) => dist(a, s) - dist(b, s))[0];
        if (to) { to.vass.push(id); pr.castle = to.id; } else { pr.faction = null; pr.role = 'ronin'; }
      }
      // 新しく召し抱える
      if (cpuCastle(w, s) && s.vass.length < want(w, s) && rnd(w) < 0.04) newVassal(w, s);
    }
    // 城にいる見回りの隊は、ときどき大将が交代する
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'patrol' || n.battle || n.fight || n.hunt || n.at !== n.home || rnd(w) > 0.2) continue;
      const h = SIM.settlement(w, n.home), v = h && pickVassal(w, h, busy); if (v && v !== n.person) { busy.delete(n.person); n.person = v; busy.add(v); }
    }
  }
  ensureLeaders = function (w) {
    const busy = leading(w);
    for (const n of Object.values(w.npcs)) if (n.kind === 'patrol' && (!n.person || !live(w, n.person)) && n.faction) {
      const h = SIM.settlement(w, n.home), v = h && h.vass && pickVassal(w, h, busy);
      if (v) { n.person = v; busy.add(v); } else { n.person = newPerson(w, n.faction, { role: 'vassal', castle: n.home }); SIM.genStats(w, w.people[n.person]); if (h && h.vass) h.vass.push(n.person); }
    }
  };
  SIM.systems.push(function vassalTick(w) { const d = Math.floor(w.time.min / 1440); if (w.vday === d) return; w.vday = d; vassalDaily(w); });
  // 軍勢には出陣元の城の家臣も加わる
  const baseLaunch = SIM.launchArmy;
  SIM.launchArmy = (w, o) => {
    if (o.from && o.from.vass) { const busy = leading(w); o.gens = (o.gens || []).slice(); for (const id of o.from.vass) if (o.gens.length < 4 && live(w, id) && !busy.has(id) && !o.gens.includes(id)) o.gens.push(id); }
    return baseLaunch(w, o);
  };
  // 率いる武将の能力：武勇で兵の攻撃、統率で士気が上下する
  SIM.leadersOf = (w, n) => (n ? [...(n.gens || []), ...(n.person ? [n.person] : [])] : []).filter((id) => live(w, id)).map((id) => SIM.genStats(w, w.people[id]));
  SIM.npcLead = (w, n) => { const L = (n.kind === 'patrol' || n.kind === 'army' || n.kind === 'bushou') ? SIM.leadersOf(w, n) : []; return L.length ? L.map((p) => [p.name, p.tou, p.bu]) : null; };
  const M = SIM._mil, baseAdd = M.addUnits;
  M.addUnits = (w, b, side, owner, army) => {
    const k = b.units.length; baseAdd(w, b, side, owner, army);
    if (owner || (side !== 'B' && !(side === 'A' && b.allyArmy))) return;
    let L = SIM.leadersOf(w, w.npcs[side === 'A' ? b.allyArmy : b.npc]); // 0.50.0 参陣した味方の軍勢も武将ごとに
    if (!L.length && b.siege && side === 'B') { const s = SIM.settlement(w, b.siege); if (s && live(w, s.lord)) L = [SIM.genStats(w, w.people[s.lord], true)]; }
    if (!L.length) return;
    // 0.43.0 武将ごとに隊を分ける：兵種ごとの隊を武将の数で分け（1隊が10人未満にならない範囲）、その武将の武勇・統率だけを効かせる
    const add = b.units.splice(k), out = []; let rr = 0;
    for (const u of add) {
      const parts = u.type === 'hero' ? 1 : Math.max(1, Math.min(L.length, Math.floor(u.n / 10)));
      for (let j = 0; j < parts; j++) {
        const g = L[(rr + j) % L.length], n = Math.floor(u.n / parts) + (j < u.n % parts ? 1 : 0);
        const v = Object.assign({}, u, { id: j ? b.next++ : u.id, n, n0: n, hp: (u.hp * n) / u.n, gen: g.name, gname: g.name });
        v.am = (u.am || 1) * (1 + (g.bu - 55) / 200); v.mor = v.mo = Math.max(30, Math.min(95, u.mor + (g.tou - 55) / 3));
        out.push(v);
      }
      rr += parts;
    }
    // 武将ごとに並べ直す（同じ武将の隊は近くに）
    out.sort((a2, b2) => L.findIndex((g) => g.name === a2.gen) - L.findIndex((g) => g.name === b2.gen));
    out.forEach((v, i) => { v.y = SIM.FIELD.h / 2 + (i - (out.length - 1) / 2) * 13; });
    b.units.push(...out);
  };
  // 0.35.0 打ち破った隊の武将は、ときどき捕縛される（家臣だけ。城主は落ち延びる）。逃がすか切るかはプレイヤーが選ぶ
  const CAP_RATE = 0.35;
  const fNm = (w, fid) => (w.factions[fid] || {}).name || '';
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = (w, b, p, res, after) => {
    baseEnd(w, b, p, res, after);
    if (res === 'win' && !b.genDone) { b.genDone = 1;
      const n = w.npcs[b.npc]; if (!n) return;
      const lords = new Set(w.settlements.filter((x) => x.lord).map((x) => x.lord));
      for (const id of [...(n.gens || []), ...(n.person ? [n.person] : [])]) {
        const pr = w.people[id]; if (!pr || pr.dead || pr.captive || lords.has(id) || rnd(w) > CAP_RATE) continue;
        pr.captive = p.id; for (const s of w.settlements) if (s.vass) s.vass = s.vass.filter((x) => x !== id);
        p.captives = p.captives || []; p.captives.push(id);
        for (const pid of b.pids) SIM.say(pid, `${fNm(w, pr.faction)}の${pr.name}を捕らえました！`);
      }
    } else if (res === 'lose' && p && p.retainers && p.retainers.length) { // 負けたとき：CPUは捕らえた家臣を逃がす
      for (const id of p.retainers) {
        const pr = w.people[id]; if (!pr || rnd(w) > CAP_RATE) continue;
        SIM.say(p.id, `家臣の${pr.name}が敵に捕らえられましたが、解き放たれて戻ってきました`);
      }
    }
  };
  function freeCaptive(w, pr) { // 逃がした武将は元の城（なければ自家の近くの城）へ戻る
    pr.captive = null;
    let h = SIM.settlement(w, pr.castle);
    if (!h || h.owner !== pr.faction || !h.vass) {
      let best = null, bd = Infinity;
      for (const s of w.settlements) if (s.type === 'castle' && s.owner === pr.faction && s.vass) { const d = h ? dist(s, h) : 0; if (d < bd) { bd = d; best = s; } }
      h = best;
    }
    if (h) { h.vass.push(pr.id); pr.castle = h.id; }
  }
  SIM.ransom = (pr) => { return 500 + ((pr.tou || 50) + (pr.bu || 50)) * 8; }; // 0.35.1 逃がすときの身代金
  const captiveCmd = (kill) => (w, p, c) => {
    const i = (p.captives || []).indexOf(c.id); if (i < 0) return;
    p.captives.splice(i, 1);
    const pr = w.people[c.id]; if (!pr || pr.dead) return;
    if (kill) { pr.dead = true; pr.captive = null; SIM.say(p.id, `${fNm(w, pr.faction)}の${pr.name}を斬りました`); }
    else { const m = SIM.ransom(pr); freeCaptive(w, pr); p.money += m; p.fame = (p.fame || 0) + 1; SIM.say(p.id, `${fNm(w, pr.faction)}の${pr.name}を逃がし、身代金${SIM.money(m)}を受け取りました（名声+1）`); }
  };
  SIM.commands.releaseCaptive = captiveCmd(false);
  SIM.commands.killCaptive = captiveCmd(true);
  // 近くの城の家臣の一覧（参加者の画面用）
  const basePriv2 = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv2(w, pid); if (!r) return r;
    const p = w.players[pid], v = {};
    for (const s of w.settlements) if (s.type === 'castle' && dist(s, p) < 40) {
      const lord = live(w, s.lord) ? SIM.genStats(w, w.people[s.lord], true) : null;
      v[s.id] = { lord: lord ? [lord.name, lord.tou, lord.bu] : null, vass: (s.vass || []).filter((id) => live(w, id)).map((id) => { const q = w.people[id]; return [q.name, q.tou, q.bu]; }) };
    }
    r.me.vass = v;
    r.me.captives = (p.captives || []).map((id) => { const q = w.people[id]; return q ? [id, q.name, fNm(w, q.faction), q.tou, q.bu, SIM.ransom(q)] : null; }).filter(Boolean);
    return r;
  };
})();
