// 第8段階：軍勢（武将が集まって進軍・包囲・援軍・防衛戦）・空き城への城主配置・陣触れ・テスト用の操作
(function () {
  const SIM = SGK.SIM, M = SIM._mil;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const castles = (w, fid) => w.settlements.filter((s) => s.type === 'castle' && s.owner === fid && !s.site);
  const news = (w, msg) => { for (const p of Object.values(w.players)) SIM.say(p.id, `【噂】${msg}`); };
  const garOf = (n) => SIM._garOf(n);
  const scale = (tr, r) => { const o = {}; for (const k in tr) { const v = Math.round(tr[k] * r); if (v > 0) o[k] = v; } return o; };
  const addTr = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; };
  // 数値はすべて仮（ここで調整）
  const AR = { siegeDays: 5, speed: 25, reliefKm: 50, fightKm: 2, liftKm: 3, musterRank: 3, musterKm: 40, musterDays: 30, musterCD: 20, musterRate: 0.4 };
  SIM.ARMY = AR;
  const MEI = ['政', '長', '信', '義', '勝', '秀', '忠', '家', '重', '貞', '元', '光', '直', '康', '盛', '成', '房', '綱'];

  // ---- 空いた城に武将を置く（CPUの家） ----
  function genName(w) {
    const used = new Set(Object.values(w.people).map((p) => p.name));
    for (let i = 0; i < 50; i++) {
      const n = SIM.SEI[Math.floor(rnd(w) * SIM.SEI.length)] + MEI[Math.floor(rnd(w) * MEI.length)] + MEI[Math.floor(rnd(w) * MEI.length)];
      if (!used.has(n) && n.slice(-1) !== n.slice(-2, -1)) return n;
    }
    return '某';
  }
  SIM.genName = genName;
  SIM.assignLord = (w, s, quiet) => {
    const f = w.factions[s.owner]; if (!f || f.player || f.dead || s.lord || s.holder || s.site) return null;
    const busy = new Set(w.settlements.filter((x) => x.lord).map((x) => x.lord));
    let id = Object.keys(w.people).find((k) => w.people[k].faction === s.owner && !busy.has(k) && k !== f.leader);
    if (!id && f.leader && w.people[f.leader] && !busy.has(f.leader)) id = f.leader;
    if (!id) { id = 'g' + w.nextId++; w.people[id] = { name: genName(w), faction: s.owner, loyal: 55 + Math.floor(rnd(w) * 20) }; }
    s.lord = id;
    if (!quiet) news(w, `${f.name}は${s.name}に${w.people[id].name}を城主として置きました`);
    return id;
  };
  // 城主のいない城（データで決めていない城）には、はじめから城主・城代を置く。古いセーブにも
  const baseEnsureL = SIM.ensure;
  SIM.ensure = (w) => {
    baseEnsureL(w);
    if (!w.lordsFilled) { for (const s of w.settlements) if (s.type === 'castle' && s.owner && !s.lord && !s.holder) SIM.assignLord(w, s, true); w.lordsFilled = true; }
    return w;
  };

  // ---- 軍勢（地図の上を動くNPC。kind: 'army'） ----
  // mode: siege（城へ進軍→包囲→総攻め）／relief（援軍：包囲している相手へ向かう）／return（引き上げ）
  function setGoal(n, x, y, dest) { n.tx = x; n.ty = y; n.dest = dest || null; n.path = SIM.findPath(n.x, n.y, x, y); }
  // 行軍の速さ：プレイヤーと同じく人数（大軍ほど遅い）と兵種の割合で決まる
  SIM.armySpeed = (n) => SGK.CFG.WALK_KM_PER_DAY * SIM.sizeSpeed(n.size || 0) * SIM.mixSpeed(n.army);
  function armyName(w, n) { const g = (n.gens && w.people[n.gens[0]]) || (n.person && w.people[n.person]); return g ? `${g.name}の軍勢` : `${fName(w, n.faction)}の軍勢`; }
  SIM.launchArmy = (w, o) => {
    const id = 'a' + w.nextId++, size = SIM.troopCount(o.army);
    const n = w.npcs[id] = { id, kind: 'army', faction: o.faction, x: o.from.x, y: o.from.y, tx: null, ty: null, dest: null, at: null, home: o.from.id,
      speed: AR.speed, wait: 0, calm: 0, army: o.army, size, gens: (o.gens || []).slice(0, 4), mode: o.mode, to: o.to ? o.to.id : null, target: o.target || null, until: null, loot: 800 + size * 25 };
    n.speed = SIM.armySpeed(n);
    const gn = n.gens.map((g) => (w.people[g] || {}).name).filter(Boolean);
    if (o.mode === 'siege') {
      setGoal(n, o.to.x + 0.7, o.to.y + 0.4, o.to.id);
      news(w, `${fName(w, o.faction)}の軍勢${size}人${gn.length ? `（${gn.join('・')}）` : ''}が${o.from.name}を発ち、${o.to.name}へ向かっているそうです（${Math.max(1, Math.ceil(dist(o.from, o.to) / n.speed))}日ほど）`);
      for (const p of Object.values(w.players)) if (p.clan === o.to.owner) SIM.say(p.id, `【急報】${fName(w, o.faction)}の軍勢${size}人が${o.to.name}へ向かっています！ 着いても${AR.siegeDays}日は包囲するので、そのあいだに城へ入るか、軍勢に攻めかかって追い払えます`);
    } else if (o.mode === 'relief') {
      news(w, `${fName(w, o.faction)}の援軍${size}人${gn.length ? `（${gn.join('・')}）` : ''}が${o.to ? o.to.name : ''}の救援に向かっているそうです`);
    }
    return n;
  };
  SIM.armyTo = (w, sid) => Object.values(w.npcs).some((n) => n.kind === 'army' && n.mode === 'siege' && n.to === sid);
  SIM.besieged = (w, sid) => Object.values(w.npcs).some((n) => n.kind === 'army' && n.mode === 'siege' && n.to === sid && n.until != null)
    || Object.values(w.players).some((p) => p.siege && p.siege.sid === sid);
  SIM._armyGoHome = (w, n) => goHome(w, n);
  function goHome(w, n) {
    let h = SIM.settlement(w, n.home);
    if (!h || h.owner !== n.faction) h = castles(w, n.faction).sort((a, b) => dist(a, n) - dist(b, n))[0];
    if (!h) { delete w.npcs[n.id]; return; }
    n.mode = 'return'; n.home = h.id; n.until = null; n.target = null; setGoal(n, h.x, h.y, h.id);
  }
  function sendRelief(w, fid, s, target) { // 包囲された城の近くの城から援軍を出す
    const f = w.factions[fid]; if (!f || f.dead) return; // プレイヤー大名の家でも、CPUの家臣（プレイヤーに任されていない城）が援軍を出す
    if (Object.values(w.npcs).some((n) => n.kind === 'army' && n.mode === 'relief' && n.faction === fid && n.to === s.id)) return;
    const srcs = castles(w, fid).filter((x) => x.id !== s.id && !x.holder && !x.site && !SIM.besieged(w, x.id) && dist(x, s) <= AR.reliefKm && SIM.garrison(x) >= 20).sort((a, b) => dist(a, s) - dist(b, s)).slice(0, 2);
    let army = {}; const gens = [];
    for (const x of srcs) { const t = Math.floor(SIM.garrison(x) * 0.5); army = addTr(army, garOf(t)); x.gar = garOf(SIM.garrison(x) - t); if (x.lord && w.people[x.lord]) gens.push(x.lord); }
    if (SIM.troopCount(army) < 12) { if (srcs[0]) srcs[0].gar = addTr(srcs[0].gar, army); return; }
    SIM.launchArmy(w, { faction: fid, from: srcs[0], to: s, army, gens, mode: 'relief', target });
    if (f.player) for (const q of Object.values(w.players)) if (q.clan === fid) SIM.say(q.id, `${srcs.map((x) => x.name).join('・')}から${s.name}へ援軍（${SIM.troopCount(army)}人）が向かっています`);
  }
  function beginSiege(w, n, s) {
    n.until = w.time.min + AR.siegeDays * 1440; n.tx = n.ty = null; n.dest = null; n.x = s.x + 0.7; n.y = s.y + 0.4;
    news(w, `${armyName(w, n)}（${n.size}人）が${s.name}を包囲しました（${AR.siegeDays}日後に総攻め）`);
    for (const p of Object.values(w.players)) if (p.clan === s.owner) SIM.say(p.id, `【急報】${s.name}が包囲されました！ ${AR.siegeDays}日後に総攻めが来ます。城に入っていれば一緒に戦えます`);
    sendRelief(w, s.owner, s, { army: n.id });
    for (const p of Object.values(w.players)) if (p.camp === n.id) SIM.say(p.id, `${s.name}を包囲しました。${AR.siegeDays}日後に総攻めです。軍勢のそばにいれば総攻めに加われます`);
  }
  function targetOf(w, n) {
    const t = n.target || {};
    if (t.army) { const a = w.npcs[t.army]; return a && a.kind === 'army' && a.mode === 'siege' ? a : null; }
    if (t.pid) { const p = w.players[t.pid]; return p && p.siege ? p : null; }
    return null;
  }
  function clash(w, n, t) { // 援軍が着いた
    if (t.battle) return;
    if (!t.kind) { // プレイヤーの包囲に援軍が攻めかかる
      if (t.busy) t.busy = null;
      return fieldBattle(w, n, t, `${armyName(w, n)}（${n.size}人）が救援に駆けつけ、攻めかかってきました！`);
    }
    const s = SIM.settlement(w, t.to);
    const pa = M.power(n.army) * (0.75 + rnd(w) * 0.5), pb = M.power(t.army) * (0.75 + rnd(w) * 0.5);
    const win = pa > pb, loss = Math.min(0.85, (win ? pb / pa : pa / pb) * 0.6);
    const [wn, ls] = win ? [n, t] : [t, n];
    wn.army = scale(wn.army, 1 - loss); wn.size = SIM.troopCount(wn.army);
    ls.army = scale(ls.army, 0.3); ls.size = SIM.troopCount(ls.army);
    if (win) { news(w, `${armyName(w, n)}が${s ? s.name : ''}を包囲する${armyName(w, t)}を打ち破りました（包囲が解かれました）`); goHome(w, t); goHome(w, n); }
    else { news(w, `${armyName(w, t)}が${s ? s.name : ''}の援軍を退けました`); goHome(w, n); }
    for (const a of [n, t]) if (w.npcs[a.id] && !a.size) delete w.npcs[a.id];
  }
  function assault(w, n, s) { // 包囲が終わって総攻め
    const defs = n.noDef ? [] : Object.values(w.players).filter((p) => p.clan === s.owner && !p.battle && dist(p, s) <= AR.fightKm && (p.at === s.id || p.tx == null));
    if (defs.length) return defenseBattle(w, n, s, defs);
    const mine = Object.values(w.players).filter((p) => p.camp === n.id && !p.battle && dist(p, s) < AR.liftKm); // 0.50.0 参陣している人がいればいっしょに戦う
    if (mine.length && !n.solo) return SIM._armyAssault(w, n, s, mine);
    const r = SIM._campArrive(w, { to: s.id, att: n.faction, army: n.army });
    if (r === true || !r) { delete w.npcs[n.id]; return; }
    n.army = scale(n.army, r); n.size = SIM.troopCount(n.army); goHome(w, n);
  }

  // ---- 0.50.0 参陣：味方の軍勢についていく ----
  SIM.ARMY_LEAD_RANK = 5; // 部将以上なら大将を任される
  SIM.joinArmy = (w, n, ps) => {
    n.joined = ps.map((q) => q.id);
    for (const q of ps) {
      q.camp = n.id; q.at = null; q.tx = q.ty = null; q.dest = null; q.busy = null;
      const lead = q.rank >= SIM.ARMY_LEAD_RANK || (w.factions[q.clan] || {}).leader === q.id;
      SIM.say(q.id, `${armyName(w, n)}（${n.size}人）に参陣しました！ ${(SIM.settlement(w, n.to) || {}).name}へ向かいます${lead ? '。あなたが総攻めの大将です' : ''}（地図で行き先を選ぶと軍勢を離れます）`);
    }
  };
  function campTick(w) {
    for (const p of Object.values(w.players)) {
      if (!p.camp || p.battle) continue;
      const n = w.npcs[p.camp];
      if (!n || n.kind !== 'army' || n.mode !== 'siege') { p.camp = null; SIM.say(p.id, '軍勢が引き上げたので、陣を離れました'); continue; }
      if (p.tx != null) { p.camp = null; SIM.say(p.id, '軍勢を離れました'); continue; }
      p.x = n.x - 0.2; p.y = n.y + 0.15; p.at = null;
    }
  }
  SIM.commands.leadAll = (w, p, c) => { // 大将：武将の隊も指図するか
    p.leadAll = !!c.on;
    const b = p.battle && w.battles[p.battle]; if (!b || b.lead !== p.id) return SIM.say(p.id, p.leadAll ? '大将のときは武将の隊も指図します' : '大将のときも自分の隊だけ指図します');
    b.leadAll = p.leadAll;
    for (const u of b.units) if (u.ally === b.ally && u.owner == null && u.side === 'A') { u.cmd = p.leadAll ? p.id : null; if (!p.leadAll && u.order !== 'rout' && u.order !== 'retreat') u.order = 'charge'; }
    SIM.say(p.id, p.leadAll ? '武将の隊もあなたが指図します' : '武将の隊はそれぞれ攻めかかります');
  };

  // ---- 戦いを始める ----
  function newBattle(w, n, extra) {
    const id = 'b' + w.nextId++;
    const b = w.battles[id] = Object.assign({ id, npc: n.id, war: 1, foe: armyName(w, n), foeN: n.size, loot: n.loot, pids: [], units: [], next: 1, t: 0, start: {}, routed: false, hd: {}, rd: {},
      ter: M.genTerrain(w), lk: { A: null, B: { x: SIM.FIELD.ax, y: SIM.FIELD.h / 2 } }, visA: [] }, extra);
    n.battle = id; return b;
  }
  function join(w, b, q, msg) {
    b.pids.push(q.id); q.battle = b.id; q.busy = null; q.tx = q.ty = null; q.dest = null; b.start[q.id] = Object.assign({}, q.troops);
    SIM.addPlayerSide(w, b, q); SIM.say(q.id, msg);
  }
  SIM.addPlayerSide = (w, b, q) => { // 本人と兵、陣触れで加わった武将の兵
    M.addUnits(w, b, 'A', q.id, Object.assign({ hero: 1 }, q.troops));
    const al = q.allies && q.allies.troops;
    if (al && SIM.troopCount(al)) {
      const st = b.start[q.id]; if (st) for (const t in al) st[t] = (st[t] || 0) + al[t]; // 損失の計算に加勢の兵も含める
      const k = b.units.length; M.addUnits(w, b, 'A', q.id, al); for (const u of b.units.slice(k)) { u.ally = 1; u.y = Math.min(SIM.FIELD.h - 4, u.y + 18); } }
  };
  function fieldBattle(w, n, p, msg) { // 野戦：プレイヤー側 対 軍勢
    const b = newBattle(w, n, { field: 1 });
    const qs = Object.values(w.players).filter((q) => q === p || (q.clan && q.clan === p.clan && !q.battle && dist(q, p) <= AR.fightKm));
    for (const q of qs) join(w, b, q, q === p ? msg : `${p.name}とともに${b.foe}（${n.size}人）と戦います！`);
    M.addUnits(w, b, 'B', null, n.army);
  }
  function defenseBattle(w, n, s, defs) { // 防衛戦：城の丘で迎え撃つ
    const b = newBattle(w, n, { defend: s.id, loot: 800 + n.size * 20 });
    for (const q of defs) join(w, b, q, `${s.name}に${b.foe}${n.size}人が総攻めをかけてきました！ 城兵とともに${SIM.ckName(SIM.castleKind(s)) + 'の曲輪'}で迎え撃ちます`);
    const wall = Math.floor((s.dev && s.dev.wall) || 0), k = b.units.length;
    M.addUnits(w, b, 'A', null, s.gar || {});
    for (const u of b.units.slice(k)) { u.gar = 1; u.order = 'hold'; u.da += 0.6 + wall * 0.15; u.mor = u.mo = 75 + wall * 2; u.y = Math.max(4, u.y - 18); }
    s.gar = {};
    M.addUnits(w, b, 'B', null, n.army);
    SIM.castleLayout(w, b, s, 'A'); // 0.37.0 平城・山城の攻城戦マップ
  }

  // ---- 戦いの後 ----
  function allyTally(b, pid) { const t = {}; for (const u of b.units) if (u.owner === pid && u.ally && u.hp > 0) t[u.type] = (t[u.type] || 0) + u.n; return t; }
  function allyBack(p, tally) { // 加勢の兵をプレイヤーの兵から分けて戻す
    if (!p.allies) return;
    for (const k in tally) { const v = Math.min(tally[k], p.troops[k] || 0); tally[k] = v; p.troops[k] -= v; if (p.troops[k] <= 0) delete p.troops[k]; if (!v) delete tally[k]; }
    p.allies.troops = tally;
    if (!SIM.troopCount(tally)) { SIM.say(p.id, `加勢の兵は討たれるか散り散りになりました（${p.allies.gens.join('・')}は城へ戻りました）`); p.allies = null; }
  }
  function garLeft(b) { const g = {}; for (const u of b.units) if (u.gar && u.hp > 0 && !u.gone) g[u.type] = (g[u.type] || 0) + u.n; return g; }
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = (w, b, p, res, after) => {
    baseEnd(w, b, p, res, after);
    if (b.allyArmy) { // 0.50.0 参陣した総攻めのあと
      p.camp = null;
      const n = w.npcs[b.allyArmy];
      if (res !== 'win' && n && !b.gh) { b.gh = 1; n.battle = null; goHome(w, n); }
      if (res === 'win' && b.lead === p.id && SIM.addMerit) SIM.addMerit(w, p, 60, '総攻めの大将を務めた');
    }
    if (p.allies) allyBack(p, allyTally(b, p.id));
    if (b.siege && res === 'win') p.siege = null;
    if (!b.war || b.siege) return;
    const n = w.npcs[b.npc];
    if (res === 'win' && p.clan) { SIM.addMerit && SIM.addMerit(w, p, 40 + b.foeN * 0.8, b.defend ? '城を守り抜いた' : `${b.foe}を打ち破った`); p.fame += 2; }
    if (b.sDone) return; b.sDone = 1;
    if (b.defend) {
      const s = SIM.settlement(w, b.defend); if (!s) return;
      if (res === 'win') { s.gar = garLeft(b); if (SIM.garrison(s) < 3) s.gar = garOf(3); news(w, `${s.name}は${b.foe}の総攻めを退けました`); }
      else {
        const att = n ? n.faction : null;
        if (att && SIM.atWar(w, att, s.owner)) { SIM.capture(w, s, att); s.gar = garOf(3); } // 残った兵は軍勢から城へ入る（次の計算で合流）
        for (const pid of b.pids) {
          const q = w.players[pid]; if (!q) continue;
          const r = castles(w, q.clan).sort((a, c) => dist(a, s) - dist(c, s))[0];
          if (r && res === 'lose') { q.x = r.x; q.y = r.y; q.at = r.id; q.tx = q.ty = null; }
        }
      }
    } else if (res === 'win' && n && n.mode === 'siege' && n.until != null) news(w, `${b.foe}が討ち破られ、${(SIM.settlement(w, n.to) || {}).name}の包囲が解かれました`);
  };
  const baseFlee = SIM.commands.battleFlee;
  SIM.commands.battleFlee = (w, p, c) => {
    const b = w.battles[p.battle]; if (!b) return;
    const al = p.allies ? scale(allyTally(b, p.id), 0.7) : null;
    baseFlee(w, p, c);
    if (al) allyBack(p, al);
    p.camp = null;
    if (b.allyArmy && !w.battles[b.id]) { // 0.50.0 参陣した人がみな退いた：軍勢だけで攻め直す
      const s = SIM.settlement(w, b.siege), n = w.npcs[b.allyArmy];
      if (s) { const g = {}; for (const u of b.units) if (u.side === 'B' && u.hp > 0 && !u.gone) g[u.type] = (g[u.type] || 0) + u.n; s.gar = g; }
      if (n) { n.solo = 1; n.until = w.time.min; }
    }
    if (b.defend && !w.battles[b.id] && !b.sDone) { // 守る人が全員退いた：城兵だけで籠城を続ける
      b.sDone = 1;
      const s = SIM.settlement(w, b.defend), n = w.npcs[b.npc];
      if (s) s.gar = garLeft(b);
      if (n) { n.noDef = 1; n.until = w.time.min; }
    }
  };

  // ---- プレイヤーの包囲・総攻め・軍勢に攻めかかる ----
  SIM.commands.siege = (w, p, c) => {
    const s = SIM.settlement(w, c.id), S = SIM.SIEGE;
    if (!s || s.type !== 'castle' || s.site || p.battle || p.busy) return;
    const f = w.factions[p.clan];
    if (!f) return SIM.say(p.id, '浪人は城を攻められません');
    if (!(p.rank >= S.minRank || f.leader === p.id)) return SIM.say(p.id, `城を攻められるのは${SIM.RANKS[S.minRank].name}以上です`);
    if (!SIM.atWar(w, p.clan, s.owner)) return SIM.say(p.id, `${fName(w, s.owner)}とは戦をしていません`);
    if (dist(p, s) > S.nearKm) return SIM.say(p.id, `${s.name}の近く（${S.nearKm}km以内）まで来てください`);
    if (!SIM.troopCount(p.troops) && !(p.allies && SIM.troopCount(p.allies.troops))) return SIM.say(p.id, '兵がいないと城は攻められません');
    if (p.siege) return SIM.say(p.id, `すでに${(SIM.settlement(w, p.siege.sid) || {}).name}を包囲しています`);
    p.siege = { sid: s.id, until: w.time.min + AR.siegeDays * 1440 };
    SIM.say(p.id, `${s.name}を包囲しました。${AR.siegeDays}日後に総攻めをかけられます（${AR.liftKm}km以上離れると包囲が解けます）。敵の援軍に気をつけて`);
    for (const q of Object.values(w.players)) if (q.clan === s.owner) SIM.say(q.id, `【急報】${p.name}が${s.name}を包囲しました！ ${AR.siegeDays}日後に総攻めが来ます`);
    news(w, `${f.name}の${p.name}が${s.name}（${fName(w, s.owner)}）を包囲しました`);
    sendRelief(w, s.owner, s, { pid: p.id });
  };
  SIM.commands.assault = (w, p, c) => {
    if (!p.siege || p.siege.sid !== c.id) return;
    if (w.time.min < p.siege.until) return SIM.say(p.id, `総攻めの準備ができるまで、あと${Math.ceil((p.siege.until - w.time.min) / 1440)}日です`);
    SIM._assault(w, p, c);
  };
  SIM.commands.liftSiege = (w, p) => { if (p.siege && !p.battle) { SIM.say(p.id, '包囲を解きました'); p.siege = null; } };
  SIM.commands.attackArmy = (w, p, c) => {
    const n = w.npcs[c.id]; if (!n || !['army', 'patrol', 'bushou'].includes(n.kind) || n.battle || n.fight || p.battle) return;
    if (n.loot == null) n.loot = Math.round((200 + (n.size || 0) * 30) / 10) * 10;
    if (!SIM.atWar(w, p.clan, n.faction)) return SIM.say(p.id, `${fName(w, n.faction)}とは戦をしていません`);
    if (dist(p, n) > AR.fightKm) return SIM.say(p.id, `もっと近づいてください（${AR.fightKm}km以内）`);
    if (p.busy) p.busy = null;
    fieldBattle(w, n, p, `${armyName(w, n)}（${n.size}人）に攻めかかります！`);
  };

  // ---- 陣触れ：近くの城の武将が兵を連れて加わる ----
  function returnAllies(w, p, why) {
    const a = p.allies; p.allies = null; if (!a) return;
    const home = (a.from || []).map((id) => SIM.settlement(w, id)).find((s) => s && s.owner === p.clan);
    if (home) home.gar = addTr(home.gar, a.troops || {});
    SIM.say(p.id, `${a.gens.join('・')}の軍勢が${why}`);
  }
  SIM.commands.muster = (w, p) => {
    const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null, f = w.factions[p.clan];
    if (!f || !s || s.type !== 'castle' || s.owner !== p.clan) return SIM.say(p.id, '主家（自分の家）の城で陣触れを発してください');
    if (!(p.rank >= AR.musterRank || f.leader === p.id)) return SIM.say(p.id, `陣触れを発せるのは${SIM.RANKS[AR.musterRank].name}以上です`);
    if (p.allies) return SIM.say(p.id, 'すでに武将たちが加わっています');
    if ((p.musterCD || 0) > w.time.min) return SIM.say(p.id, `先日の陣触れから日が浅いため、あと${Math.ceil((p.musterCD - w.time.min) / 1440)}日待ちましょう`);
    const srcs = castles(w, p.clan).filter((x) => x.lord && w.people[x.lord] && !x.holder && (x.lord !== f.leader || f.leader === p.id) && dist(x, s) <= AR.musterKm && !SIM.besieged(w, x.id))
      .sort((a, b) => dist(a, s) - dist(b, s)).slice(0, 3);
    let troops = {}; const gens = [], from = [];
    for (const x of srcs) {
      const t = scale(x.gar || {}, AR.musterRate); if (SIM.troopCount(t) < 4) continue;
      for (const k in t) { x.gar[k] -= t[k]; if (x.gar[k] <= 0) delete x.gar[k]; }
      troops = addTr(troops, t); gens.push(w.people[x.lord].name); from.push(x.id);
      const v = (x.vass || []).map((id) => w.people[id]).find((q) => q && !q.dead); if (v) gens.push(v.name); // 0.34.0 家臣も加わる
    }
    if (!gens.length) return SIM.say(p.id, `近く（${AR.musterKm}km以内）に兵を出せる武将の城がありません`);
    p.allies = { troops, gens, from, until: w.time.min + AR.musterDays * 1440 };
    p.musterCD = w.time.min + AR.musterCD * 1440;
    SIM.say(p.id, `陣触れを発しました！ ${gens.join('・')}が兵${SIM.troopCount(troops)}人を率いて加わりました（${AR.musterDays}日間。戦ではあなたが指図できます）`);
  };
  SIM.commands.disband = (w, p) => { if (p.allies && !p.battle) returnAllies(w, p, 'それぞれの城へ戻りました'); };

  // ---- 毎tick ----
  SIM.systems.push(function armyTick(w, dt) {
    const now = w.time.min;
    campTick(w);
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'army' || n.battle) continue;
      if (!w.factions[n.faction] || w.factions[n.faction].dead || !n.size) { delete w.npcs[n.id]; continue; }
      n.speed = SIM.armySpeed(n); // 戦で減ると速くなる（古いセーブの軍勢もここで直る）
      if (n.mode === 'siege') {
        const s = SIM.settlement(w, n.to);
        if (s && s.owner === n.faction) { s.gar = addTr(s.gar, n.army); delete w.npcs[n.id]; continue; } // 落とした城に入る
        if (!s || !SIM.atWar(w, n.faction, s.owner)) { goHome(w, n); continue; }
        if (n.until == null) {
          if (dist(n, s) < 1) beginSiege(w, n, s);
          else if (n.tx == null) setGoal(n, s.x + 0.7, s.y + 0.4, s.id);
          else SIM.moveEntity(n, dt);
        } else if (now >= n.until) assault(w, n, s);
      } else if (n.mode === 'relief') {
        const t = targetOf(w, n);
        if (!t) { goHome(w, n); continue; }
        if (dist(n, t) < 0.7) { clash(w, n, t); continue; }
        if (n.tx == null || Math.hypot(n.tx - t.x, n.ty - t.y) > 1) setGoal(n, t.x, t.y, null);
        SIM.moveEntity(n, dt);
      } else {
        if (SIM.moveEntity(n, dt) || n.tx == null) { const h = SIM.settlement(w, n.home); if (h && h.owner === n.faction) h.gar = addTr(h.gar, n.army); delete w.npcs[n.id]; }
      }
    }
    for (const p of Object.values(w.players)) {
      if (p.siege && !p.battle) {
        const s = SIM.settlement(w, p.siege.sid);
        if (!s || s.owner === p.clan || !SIM.atWar(w, p.clan, s.owner)) p.siege = null;
        else if (dist(p, s) > AR.liftKm) { SIM.say(p.id, `${s.name}から離れたため、包囲が解けました`); p.siege = null; }
        else if (now >= p.siege.until && !p.siege.ready) { p.siege.ready = 1; SIM.say(p.id, `${s.name}への総攻めの支度が整いました！ 城を選んで「総攻めをかける」`); }
      }
      if (p.allies && !p.battle && (!p.clan || now >= p.allies.until)) returnAllies(w, p, '役目を終えて城へ戻りました');
    }
  });

  // ---- 古いセーブ：出陣中の軍勢を地図の軍勢に置き換える ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    if (w.camps && w.camps.length) {
      const cs = w.camps; w.camps = [];
      for (const c of cs) { const from = SIM.settlement(w, c.from), to = SIM.settlement(w, c.to); if (from && to) SIM.launchArmy(w, { faction: c.att, from, to, army: c.army, mode: 'siege' }); }
    }
    return w;
  };

  // ---- 画面に送る情報 ----
  SIM.armyText = (w, n) => {
    if (!n) return null;
    const gn = (n.gens || []).map((g) => (w.people[g] || {}).name).filter(Boolean), to = SIM.settlement(w, n.to);
    const st = n.mode === 'siege' ? (n.until == null ? `${to ? to.name : ''}へ進軍中` : `${to ? to.name : ''}を包囲中（総攻めまであと${Math.max(0, Math.ceil((n.until - w.time.min) / 1440))}日）`)
      : n.mode === 'relief' ? `${to ? to.name : ''}の救援に向かっている` : '引き上げ中';
    return { name: armyName(w, n), text: `${st}${gn.length ? `<br>武将：${gn.join('・')}` : ''}` };
  };
  SIM.threats = (w, p) => Object.values(w.npcs).filter((n) => n.kind === 'army' && n.mode === 'siege' && SIM.settlement(w, n.to) && SIM.settlement(w, n.to).owner === p.clan)
    .map((n) => { const s = SIM.settlement(w, n.to); return { to: s.name, att: fName(w, n.faction), n: n.size, siege: n.until != null, days: Math.max(0, Math.ceil(n.until != null ? (n.until - w.time.min) / 1440 : dist(n, s) / (n.speed || AR.speed))) }; });
  SIM.siegeInfo = (w, sid) => { // 城が包囲されていれば、誰に・総攻めまで何日
    const a = Object.values(w.npcs).find((n) => n.kind === 'army' && n.mode === 'siege' && n.to === sid && n.until != null);
    const p = !a && Object.values(w.players).find((q) => q.siege && q.siege.sid === sid);
    return a || p ? { by: a ? armyName(w, a) : p.name, days: Math.max(0, Math.ceil(((a ? a.until : p.siege.until) - w.time.min) / 1440)) } : null;
  };
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) {
    const d = baseDyn(w, pid);
    d.ar = {}; for (const n of Object.values(w.npcs)) if (n.kind === 'army') d.ar[n.id] = SIM.armyText(w, n);
    d.bs = {}; for (const s of w.settlements) if (s.type === 'castle') { const i = SIM.siegeInfo(w, s.id); if (i) d.bs[s.id] = i; }
    return d;
  };
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], f = w.factions[p.clan];
    if (r.me.war) {
      r.me.war.siege = p.siege ? { sid: p.siege.sid, name: (SIM.settlement(w, p.siege.sid) || {}).name, days: Math.max(0, Math.ceil((p.siege.until - w.time.min) / 1440)), ready: w.time.min >= p.siege.until } : null;
      r.me.war.allies = p.allies ? { n: SIM.troopCount(p.allies.troops), gens: p.allies.gens, days: Math.max(0, Math.ceil((p.allies.until - w.time.min) / 1440)) } : null;
      r.me.war.canMuster = !!f && (p.rank >= AR.musterRank || f.leader === pid);
      r.me.war.musterCD = Math.max(0, Math.ceil(((p.musterCD || 0) - w.time.min) / 1440));
      r.me.war.ar = AR;
    }
    return r;
  };

  // ---- テスト用（ホストだけ。メニューの「テスト用」から） ----
  SIM.debug = (w, p, kind) => {
    const R = SIM.RANKS, setSt = () => { p.status = p.clan ? `${fName(w, p.clan)} ${R[p.rank].name}` : '浪人'; };
    const rankUp = () => {
      if (!p.clan) {
        const s = w.settlements.filter((x) => x.type === 'castle' && x.lord && w.factions[x.owner] && !w.factions[x.owner].player && !w.factions[x.owner].dead).sort((a, b) => dist(a, p) - dist(b, p))[0];
        if (!s) return false; p.clan = s.owner; p.rank = 1; p.merit = 0; p.fame = Math.max(p.fame, R[1].fame); setSt(); return true;
      }
      const nx = R[p.rank + 1]; if (!nx || nx.indep) return false;
      p.merit = Math.max(p.merit, nx.merit); p.fame = Math.max(p.fame, nx.fame);
      if (p.rank + 1 >= 5 && !w.settlements.some((x) => x.holder === p.id) && !SIM.grantCastle(w, p)) { SIM.say(p.id, '（テスト）任せられる城がありません'); return false; }
      p.rank++; if (p.rank >= 6) SIM.grantCastle(w, p); setSt(); return true;
    };
    if (kind === 'money') { p.money += 10000; SIM.say(p.id, '（テスト）お金+10貫'); }
    else if (kind === 'fame') { p.fame += 30; SIM.say(p.id, '（テスト）名声+30'); }
    else if (kind === 'troops') { for (const k of ['yari', 'yumi', 'kiba']) p.troops[k] = (p.troops[k] || 0) + 10; SIM.say(p.id, '（テスト）槍・弓・騎馬を10人ずつ'); }
    else if (kind === 'rank') { if (rankUp()) SIM.say(p.id, `（テスト）${p.status}になりました`); }
    else if (kind === 'lord') { while (p.rank < 5 || !p.clan) if (!rankUp()) break; SIM.say(p.id, `（テスト）${p.status}になりました`); }
    else if (kind === 'daimyo') {
      while (p.rank < 5 || !p.clan) if (!rankUp()) break;
      const s = w.settlements.find((x) => x.holder === p.id); if (!s || R[p.rank].indep) return;
      p.fame = Math.max(p.fame, 60); p.x = s.x; p.y = s.y; p.at = s.id; p.tx = p.ty = null; p.dest = null; p.busy = null;
      SIM.commands.independence(w, p);
    } else if (kind === 'days') { w.time.min += 10 * 1440; SIM.say(p.id, '（テスト）10日進めました'); }
    else if (kind === 'war') { // 近くの軍勢をすぐ総攻めさせる
      for (const n of Object.values(w.npcs)) if (n.kind === 'army' && n.mode === 'siege') { const s = SIM.settlement(w, n.to); if (s && n.until == null) { n.x = s.x + 0.7; n.y = s.y + 0.4; beginSiege(w, n, s); } n.until = w.time.min; }
      if (p.siege) p.siege.until = w.time.min;
      SIM.say(p.id, '（テスト）包囲をすぐ終わらせました');
    }
    SIM.ensure(w);
  };
  // ---- 0.30.0 武将の隊：戦をしている家のプレイヤーが近くにいて、こちらが互角以上なら攻めかかる ----
  const HUNT = { km: 4, hitKm: 0.4, ratio: 0.8, rest: 12 * 60 };
  const heroPow = () => SIM.TROOPS.hero.hp * SIM.TROOPS.hero.atk;
  const isGen = (n) => (n.kind === 'patrol' || n.kind === 'bushou') && n.faction && n.army && !n.battle && !n.fight;
  function huntable(w, n, p) {
    return p.clan && SIM.atWar(w, n.faction, p.clan) && M.inField(p) && !p.battle && dist(n, p) < HUNT.km
      && M.power(n.army) >= (M.power(p.troops) + heroPow()) * HUNT.ratio;
  }
  function giveUp(w, n) {
    n.hunt = null; n.calm = w.time.min + HUNT.rest; n.tx = n.ty = null; n.path = null; n.dest = null;
    if (n.kind === 'bushou') n.wait = 0; // 用事に戻る（家へ帰る）
    else n.wait = 60;
  }
  SIM.systems.push(function generalHunt(w) {
    const ps = Object.values(w.players);
    for (const n of Object.values(w.npcs)) {
      if (!isGen(n)) continue;
      let p = n.hunt && w.players[n.hunt];
      if (n.hunt && (!p || !huntable(w, n, p))) { giveUp(w, n); continue; }
      if (!p) {
        if ((n.calm || 0) > w.time.min || (n.size || 0) < 6) continue;
        p = ps.filter((q) => huntable(w, n, q)).sort((a, b) => dist(a, n) - dist(b, n))[0];
        if (!p) continue;
        n.hunt = p.id; SIM.say(p.id, `${armyName(w, n)}（${fName(w, n.faction)}・${n.size}人）がこちらへ向かってきます！`);
      }
      n.tx = p.x; n.ty = p.y; n.path = null; n.dest = null; n.at = null;
      if (dist(n, p) < HUNT.hitKm) {
        n.hunt = null; if (n.loot == null) n.loot = Math.round((200 + n.size * 30) / 10) * 10;
        if (p.busy) p.busy = null;
        fieldBattle(w, n, p, `${armyName(w, n)}（${fName(w, n.faction)}・${n.size}人）に攻めかかられました！`);
      }
    }
    // 討たれた武将の隊は、しばらくすると城から新しく出てくる
    const d = Math.floor(w.time.min / 1440); if (w.genDay === d) return; w.genDay = d;
    const homes = new Set(Object.values(w.npcs).filter((n) => n.kind === 'patrol').map((n) => n.home));
    for (const s of w.settlements) {
      if (s.type !== 'castle' || s.site || !s.owner || homes.has(s.id) || rnd(w) > 0.25) continue;
      const f = w.factions[s.owner]; if (!f || f.player || f.dead) continue;
      const n = SIM.spawnNpc(w, 'patrol', s.owner, s);
      n.army = { yari: 8 + Math.floor(rnd(w) * 8), yumi: 2 + Math.floor(rnd(w) * 5) }; n.size = SIM.troopCount(n.army);
    }
  });
  // ---- 0.31.0 戦況：自分の家が攻めている・攻められている城（画面左下に出し続ける） ----
  SIM.warBoard = (w, p) => {
    if (!p.clan) return [];
    const out = [], left = (t) => Math.max(0, Math.ceil((t - w.time.min) / 1440));
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'army' || n.mode !== 'siege') continue;
      const s = SIM.settlement(w, n.to); if (!s) continue;
      const st = n.until == null ? `進軍中（あと約${Math.max(1, Math.ceil(dist(n, s) / (n.speed || AR.speed)))}日）` : `包囲中・総攻めまで${left(n.until)}日`;
      if (n.faction === p.clan) out.push({ atk: 1, text: `${s.name}（${fName(w, s.owner)}）を攻撃：${armyName(w, n)} ${n.size}人　${st}` });
      else if (s.owner === p.clan) out.push({ atk: 0, text: `${s.name}が攻撃されています：${fName(w, n.faction)}の${armyName(w, n)} ${n.size}人　${st}` });
    }
    for (const q of Object.values(w.players)) {
      if (!q.siege) continue;
      const s = SIM.settlement(w, q.siege.sid); if (!s) continue;
      const st = w.time.min >= q.siege.until ? '総攻めできます' : `包囲中・総攻めまで${left(q.siege.until)}日`;
      if (q.clan === p.clan) out.push({ atk: 1, text: `${s.name}（${fName(w, s.owner)}）を攻撃：${q.id === p.id ? 'あなた' : q.name}　${st}` });
      else if (s.owner === p.clan) out.push({ atk: 0, text: `${s.name}が攻撃されています：${fName(w, q.clan)}の${q.name}　${st}` });
    }
    return out.sort((a, b) => a.atk - b.atk);
  };
  const basePrivWB = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePrivWB(w, pid); if (!r) return r;
    r.me.warBoard = SIM.warBoard(w, w.players[pid]);
    return r;
  };
})();
