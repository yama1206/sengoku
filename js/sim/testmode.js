// 2.12.1 テストモード：タイトルを5回タップしてから新しい世界を作ると、1000貫を持った部将から始まる。
//  「戦闘」ボタンから野戦・攻城戦（城の種類・改築の段階・名のある城・自分の城）をすぐ始めて、戦場を確かめられる。
//  テストの戦闘が終わると、兵・お金・場所などは始める前に戻す（世界は変わらない）
(function () {
  const SIM = SGK.SIM, M = SIM._mil;
  const TEST = SIM.TEST = {
    money: 1000000, rank: 4, // 1000貫・部将
    army: { yari: 120, nagayari: 60, yumi: 60, teppo: 30, kiba: 30 }, // テストの戦闘で率いる兵
    foe: { small: { bandit: 40, banditBow: 15 }, big: { yari: 160, nagayari: 60, yumi: 70, teppo: 40, kiba: 40 } },
    gar: [{ yari: 60, yumi: 25 }, { yari: 80, yumi: 30, teppo: 10 }, { yari: 90, yumi: 40, teppo: 15 }, { yari: 110, yumi: 45, teppo: 25 }, { yari: 130, yumi: 50, teppo: 30 }, { yari: 150, yumi: 60, teppo: 40 }], // 段階ごとの守備兵
  };
  function setup(w, p) {
    if (!p || p.testInit) return; p.testInit = 1;
    const cs = w.settlements.filter((s) => s.type === 'castle' && w.factions[s.owner] && w.factions[s.owner].leader);
    const s = cs.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (s) { p.clan = s.owner; p.rank = TEST.rank; p.merit = SIM.RANKS[TEST.rank].merit; p.fame = Math.max(p.fame || 0, SIM.RANKS[TEST.rank].fame); p.status = `${w.factions[s.owner].name} ${SIM.RANKS[TEST.rank].name}`; }
    p.money = (p.money || 0) + TEST.money;
    SIM.say(p.id, `テストモードです。${s ? w.factions[s.owner].name + 'の部将として、' : ''}${SIM.money(TEST.money)}を持って始めます。右上の「戦闘」から野戦や攻城戦を試せます`);
  }
  const baseAdd = SIM.addPlayer;
  SIM.addPlayer = function (w, ...a) { const pid = baseAdd.call(this, w, ...a); if (w && w.test) setup(w, w.players[pid]); return pid; };

  // ---- テストの戦闘 ----
  const KEEP = ['troops', 'money', 'x', 'y', 'at', 'fame', 'merit', 'pow', 'powV', 'hpFrac', 'hideT'];
  SIM.commands.testBattle = (w, p, c) => {
    if (!w.test) return SIM.say(p.id, 'テストモードの世界でだけ使えます');
    if (!c || p.battle) return;
    const snap = {}; for (const k of KEEP) snap[k] = p[k] && typeof p[k] === 'object' ? JSON.parse(JSON.stringify(p[k])) : p[k];
    let lx = p.x, ly = p.y;
    if (c.kind === 'field') { // 野戦は毎回ちがう場所の地形で（森・山・川・海の近さが変わる）
      const ss = w.settlements; for (let i = 0; i < 30; i++) { const s = ss[Math.floor(Math.random() * ss.length)], x = s.x + (Math.random() - 0.5) * 20, y = s.y + (Math.random() - 0.5) * 20; if (!SIM.isSea || !SIM.isSea(x, y)) { lx = x; ly = y; break; } }
    }
    const id = 'b' + w.nextId++, F = SIM.FIELD;
    const b = w.battles[id] = { id, npc: null, test: 1, tsave: { [p.id]: snap }, foe: '試しの敵', foeN: 0, loot: 0, pids: [], units: [], next: 1, t: 0, start: {}, routed: false, hd: {}, rd: {},
      ter: M.genTerrain(w, lx, ly), lk: { A: null, B: { x: F.ax, y: F.h / 2 } }, visA: [] };
    b.pids.push(p.id); p.battle = id; p.tx = p.ty = null; p.dest = null; p.busy = null;
    p.troops = Object.assign({}, TEST.army); b.start[p.id] = Object.assign({}, p.troops);
    SIM.addPlayerSide(w, b, p);
    if (c.kind === 'siege') {
      const lv = Math.max(0, Math.min(5, +c.lv || 0)), own = c.own && w.settlements.find((s) => s.id === c.own && s.nawa);
      const s = own || (c.fam && SIM.NAWA_FAMOUS[c.fam] ? { id: c.fam, kai: lv, x: p.x, y: p.y } : { id: `test_${c.ck}_${lv}_${w.nextId}`, ck: ['hira', 'yama', 'mizu'].includes(c.ck) ? c.ck : 'hira', kai: lv, x: p.x, y: p.y });
      const gar = TEST.gar[own ? Math.min(5, own.kai || 0) : lv];
      M.addUnits(w, b, 'B', null, gar);
      for (const u of b.units) if (u.side === 'B') { u.order = 'hold'; u.da += 0.6; u.mor = u.mo = 75; }
      SIM.castleLayout(w, b, s, 'B');
      const nm = own ? own.name : c.fam ? SIM.NAWA_FAMOUS[c.fam].name : `${SIM.ckName(s.ck)}（${SIM.FUSHIN ? SIM.FUSHIN.kai[lv].name : lv}）`;
      b.foe = `${nm}の守備兵`; b.foeN = SIM.troopCount(gar);
      SIM.say(p.id, `テストの攻城戦：${nm}。守備兵${b.foeN}人`);
    } else {
      const army = TEST.foe[c.big ? 'big' : 'small'];
      M.addUnits(w, b, 'B', null, army);
      b.foe = c.big ? '試しの軍勢' : '試しの野盗'; b.foeN = SIM.troopCount(army);
      SIM.say(p.id, `テストの野戦：${b.foe}${b.foeN}人`);
    }
  };
  // テストの戦闘が終わったら、始める前に戻す
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = function (w, b, p, res, after) {
    if (b && b.test) { const s = b.tsave && b.tsave[p.id]; if (s) for (const k of KEEP) p[k] = s[k]; p.battle = null; SIM.say(p.id, 'テストの戦闘が終わりました（兵・お金・場所は始める前に戻しました）'); return; }
    return baseEnd.apply(this, arguments);
  };
  // 本人に送る情報：テストモードか・自分で築いた城（攻城戦で試せる）
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r || !w.test) return r;
    r.me.test = { own: w.settlements.filter((s) => s.nawa && !s.site).map((s) => [s.id, s.name]) };
    return r;
  };
})();
