// 0.36.0 家の運営：捕虜の登用・悪名・家臣を城主に任命・CPU軍勢の兵糧・相場メモ・プレイヤーの家紋
(function () {
  const SIM = SGK.SIM, M = SIM._mil;
  const rnd = (w) => SIM.rand(w);
  const fNm = (w, fid) => (w.factions[fid] || {}).name || '';
  const day = (w) => Math.floor(w.time.min / 1440);
  const MAX_RET = 3;
  const HS = SIM.HOUSE = { recruitBase: 30, recruitFame: 0.5, infamyRecruit: 8, infamyPersuade: 0.06, armyRiceExtra: 10, starveLoss: 0.05, starveHome: 3, memoMax: 40 };

  // ---- 捕らえた武将を登用する（名声で成功率が上がり、悪名で下がる。断られたら登用はもうできない） ----
  SIM.recruitChance = (p, pr) => Math.max(5, Math.min(90, HS.recruitBase + (p.fame || 0) * HS.recruitFame - (p.infamy || 0) * HS.infamyRecruit - ((pr.tou || 50) + (pr.bu || 50) - 100) / 4)) / 100;
  SIM.commands.recruitCaptive = (w, p, c) => {
    if (!(p.captives || []).includes(c.id)) return;
    const pr = w.people[c.id]; if (!pr || pr.dead || pr.refused) return;
    p.retainers = p.retainers || [];
    if (p.retainers.length >= MAX_RET) return SIM.say(p.id, `家臣は${MAX_RET}人までです（大名なら家臣を城主に任命すると空きができます）`);
    if (rnd(w) > SIM.recruitChance(p, pr)) { pr.refused = true; return SIM.say(p.id, `${pr.name}「${fNm(w, pr.faction)}への恩は捨てられぬ」……登用を断られました`); }
    p.captives = p.captives.filter((x) => x !== c.id);
    pr.captive = null; pr.refused = null; pr.retainerOf = p.id; pr.faction = p.clan || null; pr.castle = null;
    p.retainers.push(c.id);
    SIM.say(p.id, `${pr.name}が家臣になりました！（率いる人数が増えました）`);
  };
  // ---- 斬ると悪名（登用・調略がしにくくなる） ----
  const baseKill = SIM.commands.killCaptive;
  SIM.commands.killCaptive = (w, p, c) => {
    const had = (p.captives || []).includes(c.id); baseKill(w, p, c);
    if (had && w.people[c.id] && w.people[c.id].dead) { p.infamy = (p.infamy || 0) + 1; SIM.say(p.id, `悪名が${p.infamy}になりました（登用や調略がしにくくなります）`); }
  };
  const basePC = SIM.persuadeChance;
  if (basePC) SIM.persuadeChance = (w, p, s) => basePC(w, p, s) * Math.max(0.3, 1 - (p.infamy || 0) * HS.infamyPersuade);

  // ---- 大名：家臣（もと浪人・登用した武将）を城主に任命する ----
  const fOf = (w, p) => { const f = w.factions[p.clan]; return f && f.player && f.leader === p.id ? f : null; };
  SIM.commands.appointLord = (w, p, c) => {
    const f = fOf(w, p); if (!f) return;
    const s = SIM.settlement(w, c.id); if (!s || s.type !== 'castle' || s.owner !== p.clan || s.holder !== p.id || s.lord || s.id === f.home) return SIM.say(p.id, 'その城には城主を置けません（居城は当主が治めます）');
    if (!(p.retainers || []).includes(c.who)) return;
    const pr = w.people[c.who]; if (!pr) return;
    p.retainers = p.retainers.filter((x) => x !== c.who);
    s.lord = c.who; s.holder = null; s.vass = s.vass || [];
    pr.faction = p.clan; pr.castle = s.id; pr.loyal = Math.max(pr.loyal || 0, 75); pr.retainerOf = null;
    SIM.say(p.id, `${pr.name}を${s.name}の城主に任命しました`);
  };
  SIM.commands.dismissLord = (w, p, c) => {
    const f = fOf(w, p); if (!f) return;
    const s = SIM.settlement(w, c.id); if (!s || s.owner !== p.clan || !s.lord || s.holder) return;
    const lid = s.lord, pr = w.people[lid]; p.retainers = p.retainers || [];
    s.holder = p.id; s.lord = null;
    let back = false;
    if (pr) {
      if (p.retainers.length < MAX_RET) { p.retainers.push(lid); pr.retainerOf = p.id; pr.castle = null; back = true; }
      else { s.vass = s.vass || []; s.vass.push(lid); }
    }
    SIM.say(p.id, `${s.name}を直轄にしました${pr ? `（${pr.name}は${back ? '家臣に戻りました' : 'その城の家臣になりました'}）` : ''}`);
  };

  // ---- CPU軍勢の兵糧：道のりと包囲の日数ぶん持って出る。尽きると兵が逃げ、3日で引き上げる ----
  const baseLaunch = SIM.launchArmy;
  SIM.launchArmy = (w, o) => {
    const n = baseLaunch(w, o);
    const far = o.to ? Math.hypot(o.to.x - o.from.x, o.to.y - o.from.y) : 30;
    n.rice = Math.ceil(far / Math.max(1, n.speed || 20)) * 2 + (SIM.ARMY ? SIM.ARMY.siegeDays : 5) + HS.armyRiceExtra;
    n.riceDay = day(w); n.starve = 0;
    return n;
  };
  SIM.systems.push(function armyRice(w) {
    const d = day(w);
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'army' || n.battle) continue;
      if (n.rice == null) { n.rice = 15; n.riceDay = d; n.starve = 0; } // 古いセーブ
      if (n.riceDay >= d) continue;
      n.riceDay = d;
      const h = SIM.settlement(w, n.home);
      if (n.mode === 'return' && h && Math.hypot(h.x - n.x, h.y - n.y) < 3) continue;
      if (n.rice > 0) { n.rice--; continue; }
      n.starve = (n.starve || 0) + 1;
      for (const k in n.army) { n.army[k] = Math.floor(n.army[k] * (1 - HS.starveLoss)); if (n.army[k] <= 0) delete n.army[k]; }
      n.size = SIM.troopCount(n.army);
      if (n.starve >= HS.starveHome && n.mode !== 'return') {
        SIM._armyGoHome(w, n);
        SIM.newsTo(w, `${fNm(w, n.faction)}の軍勢は兵糧が尽き、引き上げていくそうです`);
      }
    }
  });
  const baseAdd = M.addUnits; // 兵糧の尽きた軍勢は士気が低い
  M.addUnits = (w, b, side, owner, army) => {
    const k = b.units.length; baseAdd(w, b, side, owner, army);
    const n = side === 'B' && !owner && w.npcs[b.npc];
    if (n && n.kind === 'army' && n.rice != null && n.rice <= 0) for (const u of b.units.slice(k)) u.mor = u.mo = Math.max(20, u.mor - 20);
  };
  const baseText = SIM.armyText;
  SIM.armyText = (w, n) => { const t = baseText(w, n); if (t && n.rice != null) t.text += `<br>兵糧：${n.rice > 0 ? `あと${n.rice}日ほど` : '<b style="color:#e07a6a">尽きている</b>'}`; return t; };

  // ---- 相場メモ：立ち寄った町の値段を覚えておく ----
  // ---- 家紋：プレイヤーが選ぶ・作る（mon：{p:'既存の紋'} か {f,s,n,d,z,r,c}） ----
  const okMon = (m) => {
    if (!m || typeof m !== 'object') return null;
    if (m.p) return typeof m.p === 'string' && m.p.length < 20 ? { p: m.p } : null;
    const i = (v, a, b) => Math.max(a, Math.min(b, Math.round(+v || 0)));
    return { f: i(m.f, 0, 3), s: i(m.s, 0, 6), n: i(m.n, 1, 8), d: i(m.d, 0, 6), z: i(m.z, 1, 6), r: i(m.r, 0, 7), c: i(m.c, -1, 6) };
  };
  SIM.okMon = okMon;
  // ---- 0.38.0 はじめに作る人物：能力値の割り振り・成長の型・家紋 ----
  const CREATE = SIM.CREATE = { base: 1, points: 10, max: 7 };
  const GROW = SIM.GROW = {
    bal: { name: '万能型', desc: 'どの技能もほどほどに伸びる（すべて+5%）', mul: {}, all: 1.05 },
    war: { name: '武人型', desc: '武芸・指揮・弓術・馬術・調練が伸びやすい（+40%）。商い・内政は伸びにくい', mul: { bugei: 1.4, shiki: 1.4, kyujutsu: 1.4, bajutsu: 1.4, chouren: 1.4 }, all: 0.85 },
    shou: { name: '商人型', desc: '算術・交渉が伸びやすい（+50%）。はじめの所持金+2000文', mul: { sanjutsu: 1.5, kosho: 1.5 }, all: 0.9, money: 2000 },
    sei: { name: '政治型', desc: '内政・築城・医術が伸びやすい（+40%）', mul: { naisei: 1.4, chikujo: 1.4, ijutsu: 1.4 }, all: 0.9 },
  };
  SIM.growMul = (p, k) => { const g = GROW[p.grow]; return g ? (g.mul[k] || g.all || 1) : 1; };
  SIM.applyProfile = (p, pr) => {
    if (!pr || typeof pr !== 'object') return;
    const A = pr.attrs, ks = Object.keys(SIM.ATTRS);
    if (A && ks.every((k) => Number.isInteger(A[k]) && A[k] >= CREATE.base && A[k] <= CREATE.max) && ks.reduce((a, k) => a + A[k], 0) <= CREATE.base * ks.length + CREATE.points)
      p.attrs = Object.fromEntries(ks.map((k) => [k, A[k]]));
    if (GROW[pr.grow]) { p.grow = pr.grow; p.money += GROW[pr.grow].money || 0; }
    const m = okMon(pr.mon); if (m) p.mon = m;
  };
  SIM.commands.setMon = (w, p, c) => {
    const m = okMon(c.mon); if (!m) return;
    p.mon = m;
    const f = w.factions[p.clan]; if (f && f.player && f.leader === p.id) f.mon = m;
    SIM.say(p.id, '家紋を定めました');
  };
  const baseIndep = SIM.commands.independence;
  SIM.commands.independence = (w, p, c) => { baseIndep(w, p, c); const f = w.factions[p.clan]; if (f && f.player && f.leader === p.id && p.mon) f.mon = p.mon; };

  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) {
    const d = baseDyn(w, pid);
    d.mons = {}; for (const p of Object.values(w.players)) if (p.mon) d.mons[p.id] = p.mon;
    if (d.pf) for (const k in d.pf) if (w.factions[k] && w.factions[k].mon) d.pf[k].mon = w.factions[k].mon;
    return d;
  };

  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], now = day(w);
    // 相場メモ
    if (r.here && r.here.market) {
      p.memo = p.memo || {};
      p.memo[r.here.id] = [now, Object.fromEntries(r.here.market.map(([k, b, s]) => [k, [b, s]]))];
      const ks = Object.keys(p.memo); if (ks.length > HS.memoMax) { ks.sort((a, b) => p.memo[a][0] - p.memo[b][0]); for (const k of ks.slice(0, ks.length - HS.memoMax)) delete p.memo[k]; }
    }
    const best = {};
    for (const [sid, [t, items]] of Object.entries(p.memo || {})) {
      if (r.here && sid === r.here.id) continue;
      for (const k in items) {
        const [b, s] = items[k], e = best[k] = best[k] || {};
        if (!e.sell || s > e.sell[1]) e.sell = [sid, s, now - t];
        if (!e.buy || b < e.buy[1]) e.buy = [sid, b, now - t];
      }
    }
    r.me.memo = best;
    r.me.infamy = p.infamy || 0;
    r.me.mon = p.mon || null;
    r.me.grow = p.grow ? GROW[p.grow].name : null;
    if (r.me.captives) r.me.captives = r.me.captives.map((a) => { const q = w.people[a[0]]; return a.concat([q && !q.refused ? Math.round(SIM.recruitChance(p, q) * 100) : null]); });
    const f = fOf(w, p);
    if (f && r.me.rank && r.me.rank.daimyo) {
      r.me.rank.daimyo.ret = (p.retainers || []).map((id) => [id, (w.people[id] || {}).name || '?']);
      r.me.rank.daimyo.open = w.settlements.filter((s) => s.type === 'castle' && s.owner === p.clan && s.holder === pid && !s.lord && s.id !== f.home && !s.site).map((s) => [s.id, s.name]);
      r.me.rank.daimyo.lords = w.settlements.filter((s) => s.type === 'castle' && s.owner === p.clan && s.lord && !s.holder).map((s) => [s.id, s.name, (w.people[s.lord] || {}).name || '?']);
    }
    return r;
  };
})();
