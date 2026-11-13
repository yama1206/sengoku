// 第7段階：戦争・攻城戦・守備兵・武将の忠誠（調略・褒美・寝返り）
(function () {
  const SIM = SGK.SIM, TR = SIM.TROOPS;
  const M = SIM._mil;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const castles = (w, fid) => w.settlements.filter((s) => s.type === 'castle' && s.owner === fid && !s.site);
  const alive = (w, fid) => w.factions[fid] && !w.factions[fid].dead;
  const news = (w, msg) => SIM.newsTo(w, msg); // 0.54.9 自分の家に関わる噂だけ
  // 数値はすべて仮
  const SIEGE = { minRank: 3, nearKm: 2, persuadeCost: 3000, persuadeRank: 4, rewardCost: 2000, peaceCost: 10000, truceDays: 360, marchKmDay: 25 };
  const START_WARS = [['oda', 'imagawa'], ['oda', 'saito'], ['azai', 'rokkaku'], ['miyoshi', 'hatakeyama'],
    ['takeda', 'nagao'], ['takeda', 'minowa'], ['hojo', 'satomi'], ['mori', 'amako'], ['mori', 'otomo'], ['ito', 'shimazu'], ['chosokabe', 'motoyama'], ['jinbo', 'shiina']];

  // ---- 戦争の状態 ----
  SIM.atWar = (w, a, b) => !!(a && b && a !== b && w.wars[key(a, b)]);
  function setWar(w, a, b, on) {
    const k = key(a, b);
    if (on) w.wars[k] = { since: w.time.min }; else { delete w.wars[k]; w.truce[k] = w.time.min + SIEGE.truceDays * 1440; }
  }
  SIM.setWar = setWar;

  // 0.42.0 CPUの戦の人数（数値はここで調整）
  const SIEGE_N = SIM.SIEGE_N = {
    gar: 70, garHome: 120, garWall: 8, garInv: 8, // 守備兵の上限（ふつうの城・大名の居城・城壁1段ごと・0.51.0 規模1つごと）
    take: 0.5,                          // 近くの城（3つまで）から出す守備兵の割合
    levyPer: 20, levyMax: 120,          // 陣触れ：持っている城1つにつき農兵20人（最大120）
    min: 30,                            // 0.44.0 これより少ない人数では攻めない
        rate: 0.08, weakRate: 0.6, weakFrac: 0.4, // 1週ごとに攻める見込み（ふつう／手薄な城）、手薄とみなす兵の割合
  };
  // 0.45.0 大名の気性（好戦度 1慎重〜5好戦）。表にない家は3前後をくじで決める
  const KOU = SIM.KOU = {
    names: ['', '慎重', 'やや慎重', 'ふつう', 'やや好戦的', '好戦的'],
    ratio: [0, 2.8, 2.4, 2.0, 1.7, 1.4],   // 相手の守りの何倍の兵で攻めるか
    rate: [0, 0.4, 0.7, 1, 1.4, 1.9],      // 攻める見込みの倍率
    reach: [0, 45, 50, 60, 70, 80],        // 攻める城までの距離（km）
    start: [0, 0.3, 0.6, 1, 1.6, 2.4],     // 新しく戦を始める見込みの重み
    peace: [0, 2, 1.5, 1, 0.7, 0.4],       // 和睦しやすさ
    fixed: { oda: 5, takeda: 5, nagao: 5, shimazu: 5, mori: 4, hojo: 4, imagawa: 4, miyoshi: 4, ryuzoji: 5, chosokabe: 4, date: 4, saito: 4, otomo: 3, amako: 4, asakura: 2, azai: 3, rokkaku: 3, honganji: 2, ashikaga: 1, kitabatake: 2, satomi: 3, satake: 4, mogami: 4, ashina: 3, tsutsui: 2, hatakeyama: 2, isshiki: 2, yamana: 2, akamatsu: 2, urakami: 3, kono: 2, ichijo: 2, ito: 3, sagara: 2, aso: 2, utsunomiya: 3, odah: 2, nanbu: 3, ando: 3 },
  };
  SIM.kou = (w, fid) => {
    const f = w.factions[fid]; if (!f) return 3;
    if (f.kou == null) { const h = [...fid].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 997, 7); f.kou = KOU.fixed[fid] || [2, 3, 3, 3, 4][h % 5]; }
    return f.kou;
  };
  const defPow = (s) => SIM.garrison(s) * (1 + 0.5 * (SIM.kaiF ? SIM.kaiF(s) : 0.5)) * (SIM.castleKind && ({ yama: 1.15, mizu: 1.08 }[SIM.castleKind(s)] || 1)); // 守備兵×城の堅さ（0.51.0 水城）
  // ---- 守備兵 ----
  function garMax(w, s) {
    const f = w.factions[s.owner], home = f && w.people[f.leader] && s.lord === f.leader;
    return Math.round((home ? SIEGE_N.garHome : SIEGE_N.gar) + Math.floor((s.dev && s.dev.wall) || 0) * SIEGE_N.garWall + (s.inv || 0) * SIEGE_N.garInv);
  }
  function garOf(n) { // 兵数から守備兵の内訳を作る
    const t = { yari: Math.round(n * 0.55), yumi: Math.round(n * 0.25), teppo: Math.round(n * 0.1) };
    t.kiba = Math.max(0, n - t.yari - t.yumi - t.teppo); return t;
  }
  SIM.garrison = (s) => SIM.troopCount(s.gar);

  // ---- 足りない項目を補う ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    if (!w.wars) { w.wars = {}; for (const [a, b] of START_WARS) if (w.factions[a] && w.factions[b]) w.wars[key(a, b)] = { since: 0 }; }
    // 地図が広がって新しく加わった勢力どうしの戦（すでに始めた組は二度と足さない）
    if (!w.warsSeeded) w.warsSeeded = START_WARS.slice(0, 4).map(([a, b]) => key(a, b));
    for (const [a, b] of START_WARS) { const k = key(a, b); if (!w.warsSeeded.includes(k) && w.factions[a] && w.factions[b]) { w.warsSeeded.push(k); w.wars[k] = { since: w.time.min }; } }
    w.truce = w.truce || {};
    w.camps = w.camps || [];
    if (w.wday == null) w.wday = Math.floor(w.time.min / 1440);
    for (const s of w.settlements) if (s.type === 'castle' && !s.gar) s.gar = garOf(Math.round(garMax(w, s) * 0.8));
    for (const [id, pr] of Object.entries(w.people)) {
      if (pr.loyal != null) continue;
      const f = w.factions[pr.faction], ld = f && w.people[f.leader];
      if (f && f.leader === id) pr.loyal = 100;
      else if (ld && ld.name.slice(0, 2) === pr.name.slice(0, 2)) pr.loyal = 90; // 一門
      else { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; pr.loyal = 50 + (h % 36); }
    }
    return w;
  };

  // ---- 城が落ちる・寝返る ----
  function capture(w, s, to, opt = {}) {
    const from = s.owner; if (from === to) return;
    const ho = s.holder && w.players[s.holder];
    if (ho && ho.clan !== to) SIM.say(ho.id, `${s.name}を失いました……`);
    s.owner = to; s.holder = null;
    if (SIM.landsFollow) SIM.landsFollow(w, s, from, to); // 0.52.0 領内の村・町も渡る
    if (!opt.lordJoins && (s.inv || 0) > 0) { s.inv--; s.invPts = 0; SIM.say && Object.keys(s.invBy || {}).forEach((pid) => SIM.say(pid, `${s.name}は戦で荒れ、規模が「${SIM.INVEST ? SIM.INVEST.names[s.inv] : s.inv}」に下がりました`)); } // 0.51.0 落城で規模が1つ下がる
    const lord = s.lord && w.people[s.lord];
    let joined = false;
    if (lord) {
      const f = w.factions[from];
      joined = opt.lordJoins || (f && f.leader !== s.lord && rnd(w) < (60 - lord.loyal) / 60);
      if (joined) { lord.faction = to; lord.loyal = opt.lordJoins ? 60 : 45; }
      else s.lord = null;
    }
    for (const n of Object.values(w.npcs)) if (n.home === s.id && n.faction === from) n.faction = to;
    const p = opt.by && w.players[opt.by];
    if (!joined && p && p.clan === to) {
      const f = w.factions[to];
      if ((f && f.leader === p.id) || (p.rank >= 5 && w.settlements.filter((x) => x.holder === p.id).length < SIM.castleLimit(p))) s.holder = p.id;
    }
    for (const [pid2, pr] of Object.entries(w.people)) if (pr.faction === from && w.factions[from] && w.factions[from].leader !== pid2) pr.loyal = Math.max(0, pr.loyal - 3);
    news(w, `${s.name}が${fName(w, from)}から${fName(w, to)}の手に渡りました${lord ? (joined ? `（${lord.name}は降りました）` : `（${lord.name}は落ち延びました）`) : ''}`);
    if (!castles(w, from).length) ruin(w, from);
    if (!s.lord && !s.holder && SIM.assignLord) SIM.assignLord(w, s);
    SIM.ensure(w);
    return joined;
  }
  SIM.capture = capture;
  function ruin(w, fid) { // 城をすべて失った家は滅ぶ
    const f = w.factions[fid]; if (!f || f.dead) return;
    f.dead = true;
    for (const k of Object.keys(w.wars)) if (k.split('|').includes(fid)) delete w.wars[k];
    for (const pr of Object.values(w.people)) if (pr.faction === fid) pr.faction = null;
    for (const p of Object.values(w.players)) if (p.clan === fid) { p.clan = null; p.rank = 0; p.merit = 0; p.status = '浪人'; SIM.say(p.id, `${f.name}は滅び、浪人になりました`); }
    news(w, `${f.name}が滅びました`);
  }

  // ---- 攻城戦（プレイヤーが攻める） ----
  SIM._assault = (w, p, c) => { // 総攻め（攻城戦準備を終えてから。army.js の assault から呼ぶ）
    const s = SIM.settlement(w, c.id);
    if (!s || s.type !== 'castle' || s.site || p.battle || p.busy) return;
    const f = w.factions[p.clan];
    if (!f) return SIM.say(p.id, '浪人は城を攻められません');
    if (!(p.rank >= SIEGE.minRank || f.leader === p.id)) return SIM.say(p.id, `城を攻められるのは${SIM.RANKS[SIEGE.minRank].name}以上です`);
    if (!SIM.atWar(w, p.clan, s.owner)) return SIM.say(p.id, `${fName(w, s.owner)}とは戦をしていません`);
    if (dist(p, s) > SIEGE.nearKm) return SIM.say(p.id, `${s.name}の近く（${SIEGE.nearKm}km以内）まで来てください`);
    if (!SIM.troopCount(p.troops)) return SIM.say(p.id, '兵がいないと城は攻められません');
    const id = 'b' + w.nextId++, gar = Object.assign({}, s.gar);
    const b = w.battles[id] = { id, npc: null, siege: s.id, war: 1, foe: `${s.name}の守備兵`, foeN: SIM.troopCount(gar), loot: 1500 + SIM.troopCount(gar) * 40,
      pids: [], units: [], next: 1, t: 0, start: {}, routed: false, hd: {}, rd: {}, ter: M.genTerrain(w), lk: { A: null, B: { x: SIM.FIELD.ax, y: SIM.FIELD.h / 2 } }, visA: [] };
    const joiners = Object.values(w.players).filter((q) => q === p || (q.clan === p.clan && M.inField(q) && !q.busy && dist(q, p) < 1.5));
    for (const q of joiners) {
      b.pids.push(q.id); q.battle = id; q.tx = q.ty = null; q.dest = null; q.at = null; b.start[q.id] = Object.assign({}, q.troops);
      SIM.addPlayerSide(w, b, q);
      SIM.say(q.id, `${s.name}に総攻めをかけます！ 守備兵およそ${b.foeN}人。${({ yama: '山城です。城兵は険しい斜面の上の曲輪で', mizu: '水城です。城兵は広い水堀に囲まれた曲輪で' }[SIM.castleKind(s)] || '平城です。城兵は堀に囲まれた曲輪で')}待ち構えています`);
    }
    M.addUnits(w, b, 'B', null, gar);
    const wall = Math.floor((s.dev && s.dev.wall) || 0), fb = SIM.factionBuff(w.factions, s.owner);
    for (const u of b.units) if (u.side === 'B') {
      u.order = 'hold'; u.da += 0.6 + wall * 0.15; u.mor = u.mo = 75 + wall * 2;
      if (fb && fb.types.includes(u.type)) { u.am *= fb.am || 1; u.da += fb.da || 0; u.ra += fb.ra || 0; if (fb.hm) { u.hp *= fb.hm; u.mh *= fb.hm; } }
    }
    SIM.castleLayout(w, b, s, 'B'); // 0.37.0 平城・山城の攻城戦マップ
    s.gar = {};
  };
  // 0.50.0 参陣した軍勢の総攻め：プレイヤーと軍勢の兵がいっしょに攻める
  SIM._armyAssault = (w, n, s, ps) => {
    const id = 'b' + w.nextId++, gar = Object.assign({}, s.gar);
    const lead = ps.slice().sort((a, c) => (c.rank || 0) - (a.rank || 0))[0], isLead = lead && (lead.rank >= SIM.ARMY_LEAD_RANK || (w.factions[lead.clan] || {}).leader === lead.id);
    const b = w.battles[id] = { id, npc: null, siege: s.id, war: 1, foe: `${s.name}の守備兵`, foeN: SIM.troopCount(gar), loot: 1500 + SIM.troopCount(gar) * 40,
      pids: [], units: [], next: 1, t: 0, start: {}, routed: false, hd: {}, rd: {}, ter: M.genTerrain(w), lk: { A: null, B: { x: SIM.FIELD.ax, y: SIM.FIELD.h / 2 } }, visA: [],
      ally: n.id, allyArmy: n.id, lead: isLead ? lead.id : null };
    for (const q of ps) {
      b.pids.push(q.id); q.battle = id; q.tx = q.ty = null; q.dest = null; q.at = null; q.busy = null; b.start[q.id] = Object.assign({}, q.troops);
      SIM.addPlayerSide(w, b, q);
      SIM.say(q.id, `${s.name}に総攻めをかけます！ 軍勢${n.size}人とともに、守備兵およそ${b.foeN}人を攻めます${b.lead === q.id ? '。あなたが大将です（武将の隊も指図するかは下のボタンで切り替え）' : '。武将の隊はそれぞれ攻めかかります'}`);
    }
    const k = b.units.length; M.addUnits(w, b, 'A', null, n.army);
    for (const u of b.units.slice(k)) { u.ally = n.id; u.order = 'charge'; u.x -= 12; if (b.lead && w.players[b.lead].leadAll) { u.cmd = b.lead; u.order = 'hold'; } }
    b.leadAll = !!(b.lead && w.players[b.lead].leadAll);
    n.battle = id;
    M.addUnits(w, b, 'B', null, gar);
    const wall = Math.floor((s.dev && s.dev.wall) || 0), fb = SIM.factionBuff(w.factions, s.owner);
    for (const u of b.units) if (u.side === 'B') {
      u.order = 'hold'; u.da += 0.6 + wall * 0.15; u.mor = u.mo = 75 + wall * 2;
      if (fb && fb.types.includes(u.type)) { u.am *= fb.am || 1; u.da += fb.da || 0; u.ra += fb.ra || 0; if (fb.hm) { u.hp *= fb.hm; u.mh *= fb.hm; } }
    }
    SIM.castleLayout(w, b, s, 'B');
    s.gar = {};
  };
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = (w, b, p, res, after) => {
    baseEnd(w, b, p, res, after);
    if (!b.siege) return;
    const s = SIM.settlement(w, b.siege); if (!s) return;
    if (!b.sDone) {
      b.sDone = 1;
      if (res === 'win') {
        s.gar = garOf(Math.round(garMax(w, s) * 0.3));
        if (s.owner !== p.clan && SIM.atWar(w, p.clan, s.owner)) capture(w, s, p.clan, { by: p.id });
      } else {
        const g = {}; for (const u of b.units) if (u.side === 'B' && u.hp > 0) g[u.type] = (g[u.type] || 0) + u.n;
        s.gar = g;
      }
    }
    if (res === 'win') {
      p.x = s.x; p.y = s.y; p.at = s.id;
      if (p.clan && w.factions[p.clan] && w.factions[p.clan].leader !== p.id) SIM.addMerit(w, p, 100 + b.foeN, `${s.name}を落とした`);
    }
  };

  // ---- 調略・褒美 ----
  SIM.persuadeChance = (w, p, s) => {
    const pr = s.lord && w.people[s.lord]; if (!pr) return 0;
    return Math.max(0.03, Math.min(0.7, (65 - pr.loyal) / 80 + (p.attrs.chi - 3) * 0.04 + p.fame / 1000));
  };
  SIM.commands.persuade = (w, p) => {
    const s = here(w, p); if (!s || s.type !== 'castle' || !s.lord || p.battle || p.busy) return;
    const f = w.factions[p.clan], pr = w.people[s.lord];
    if (!f) return SIM.say(p.id, '浪人は調略できません');
    if (s.owner === p.clan) return;
    if (!(p.rank >= SIEGE.persuadeRank || f.leader === p.id)) return SIM.say(p.id, `調略できるのは${SIM.RANKS[SIEGE.persuadeRank].name}以上です`);
    if (w.factions[s.owner] && w.factions[s.owner].leader === s.lord) return SIM.say(p.id, `当主の${pr.name}は寝返りません`);
    p.pcd = p.pcd || {};
    if ((p.pcd[s.id] || 0) > w.time.min) return SIM.say(p.id, `${pr.name}には先日断られたばかりです（10日ほど空けましょう）`);
    if (p.money < SIEGE.persuadeCost) return SIM.say(p.id, `お金が足りません（${SIM.money(SIEGE.persuadeCost)}）`);
    p.money -= SIEGE.persuadeCost; p.pcd[s.id] = w.time.min + 10 * 1440;
    SIM.gain && SIM.gain(p, 'naisei', 4);
    if (rnd(w) < SIM.persuadeChance(w, p, s)) {
      SIM.say(p.id, `${pr.name}が誘いに応じ、${s.name}ごと${f.name}に寝返りました！`);
      if (w.factions[s.owner] && !SIM.atWar(w, p.clan, s.owner) && !w.factions[s.owner].player) setWar(w, p.clan, s.owner, true);
      capture(w, s, p.clan, { lordJoins: true, by: p.id });
      if (f.leader !== p.id) SIM.addMerit(w, p, 150, `${s.name}を調略した`);
    } else { pr.loyal = Math.min(100, pr.loyal + 2); SIM.say(p.id, `${pr.name}「その話、聞かなかったことにいたそう」（調略失敗）`); }
  };
  SIM.commands.reward = (w, p) => { // 当主が自家の武将に褒美を与える
    const s = here(w, p), f = w.factions[p.clan];
    if (!s || !f || f.leader !== p.id || s.owner !== p.clan || !s.lord) return;
    if (p.money < SIEGE.rewardCost) return SIM.say(p.id, `お金が足りません（${SIM.money(SIEGE.rewardCost)}）`);
    const pr = w.people[s.lord]; p.money -= SIEGE.rewardCost;
    const up = Math.max(2, Math.round((100 - pr.loyal) * 0.15)); pr.loyal = Math.min(100, pr.loyal + up);
    SIM.say(p.id, `${pr.name}に褒美を与えました（忠誠+${up} → ${pr.loyal}）`);
  };

  // ---- 外交（プレイヤーの当主） ----
  SIM.commands.declareWar = (w, p, c) => {
    const f = w.factions[p.clan]; if (!f || f.leader !== p.id || !alive(w, c.id) || c.id === p.clan) return;
    if (SIM.atWar(w, p.clan, c.id)) return;
    const k = key(p.clan, c.id);
    if ((w.truce[k] || 0) > w.time.min) return SIM.say(p.id, `${fName(w, c.id)}とは和睦したばかりです（${Math.ceil((w.truce[k] - w.time.min) / 1440)}日後から）`);
    setWar(w, p.clan, c.id, true);
    news(w, `${f.name}が${fName(w, c.id)}に宣戦しました`);
  };
  SIM.commands.makePeace = (w, p, c) => {
    const f = w.factions[p.clan]; if (!f || f.leader !== p.id || !SIM.atWar(w, p.clan, c.id)) return;
    if (p.money < SIEGE.peaceCost) return SIM.say(p.id, `お金が足りません（${SIM.money(SIEGE.peaceCost)}）`);
    p.money -= SIEGE.peaceCost;
    const mine = castles(w, p.clan).length, theirs = castles(w, c.id).length;
    if (rnd(w) < Math.min(0.85, 0.35 + p.fame / 400 + (mine - theirs) * 0.05 - (p.infamy || 0) * 0.05)) { setWar(w, p.clan, c.id, false); news(w, `${f.name}と${fName(w, c.id)}が和睦しました`); }
    else SIM.say(p.id, `${fName(w, c.id)}は和睦に応じませんでした`);
  };

  // ---- 毎月：守備兵の補充・忠誠の変化・寝返り・CPUの出陣・戦と和睦 ----
  function monthly(w) {
    for (const s of w.settlements) if (s.type === 'castle' && !s.site) {
      if (SIM.besieged && SIM.besieged(w, s.id)) continue; // 攻城戦の準備をされている城は補充できない
      const mx = garMax(w, s), n = SIM.garrison(s);
      if (n < mx) s.gar = garOf(Math.min(mx, n + Math.max(2, Math.round(mx * 0.15))));
    }
    for (const s of w.settlements) {
      const pr = s.type === 'castle' && s.lord && w.people[s.lord], f = w.factions[s.owner];
      if (!pr || !f || f.leader === s.lord) continue;
      pr.loyal = Math.max(0, Math.min(100, pr.loyal + (70 - pr.loyal) * 0.04 + (rnd(w) - 0.5) * 4 - (Object.keys(w.wars).some((k) => k.split('|').includes(s.owner)) ? 1 : 0)));
      pr.loyal = Math.round(pr.loyal);
      if (pr.loyal < 25 && rnd(w) < 0.15) { // 謀反・寝返り
        const enemies = w.settlements.filter((x) => x.type === 'castle' && x.owner !== s.owner && alive(w, x.owner) && (SIM.atWar(w, s.owner, x.owner) || !Object.keys(w.wars).some((k) => k.split('|').includes(s.owner))));
        const near = enemies.sort((a, b) => dist(a, s) - dist(b, s))[0];
        if (near) {
          const to = near.owner;
          news(w, `${pr.name}が${fName(w, s.owner)}を見限り、${fName(w, to)}に寝返りました`);
          if (f.player) SIM.say(f.leader, `${pr.name}（忠誠${pr.loyal}）が謀反を起こしました！ 忠誠の低い武将には褒美を`);
          if (!SIM.atWar(w, s.owner, to)) setWar(w, s.owner, to, true);
          capture(w, s, to, { lordJoins: true });
        }
      }
    }
    // ときどき戦が終わり、ときどき隣の家と戦が始まる（CPUどうし）
    for (const k of Object.keys(w.wars)) { const [a, b] = k.split('|'); if (!w.factions[a].player && !w.factions[b].player && rnd(w) < 0.04 * (KOU.peace[SIM.kou(w, a)] + KOU.peace[SIM.kou(w, b)]) / 2) { setWar(w, a, b, false); news(w, `${fName(w, a)}と${fName(w, b)}が和睦しました`); } }
    if (rnd(w) < 0.12) {
      const fs = Object.keys(w.factions).filter((x) => alive(w, x) && !w.factions[x].player && x !== 'ashikaga');
      let a = null, tot = fs.reduce((s2, x) => s2 + KOU.start[SIM.kou(w, x)], 0) * rnd(w); for (const x of fs) { tot -= KOU.start[SIM.kou(w, x)]; if (tot <= 0) { a = x; break; } } // 好戦的な家ほど戦を始めやすい
      const ca = castles(w, a), cand = fs.filter((x) => x !== a && !SIM.atWar(w, a, x) && (w.truce[key(a, x)] || 0) < w.time.min && castles(w, x).some((y) => ca.some((z) => dist(y, z) < 35)));
      const b = cand[Math.floor(rnd(w) * cand.length)];
      if (a && b) { setWar(w, a, b, true); news(w, `${fName(w, a)}と${fName(w, b)}が戦を始めました`); }
    }
  }
  // 総攻めを自動で決着（城に守る人がいないとき）。戻り値：落ちたら true、退けたら残りの兵の割合
  function campArrive(w, c) {
    const s = SIM.settlement(w, c.to); if (!s) return 0;
    const wall = Math.floor((s.dev && s.dev.wall) || 0);
    const defs = Object.values(w.players).filter((p) => p.at === s.id && p.tx == null && !p.battle && p.clan === s.owner);
    const aPow = M.power(c.army) * (0.75 + rnd(w) * 0.5);
    const kf = SIM.kaiF ? SIM.kaiF(s) : 1, ck = 1 + ({ yama: 0.35, mizu: 0.25 }[SIM.castleKind(s)] || 0.1) * kf; // 0.37.0 山城ほど守りやすい／0.40.0 改築の段階で変わる
    let dPow = M.power(s.gar) * (1 + 0.25 * kf + wall * 0.12) * ck;
    for (const p of defs) dPow += (M.power(p.troops) + TR.hero.hp * TR.hero.atk) * (1 + 0.3 * kf + wall * 0.1) * ck;
    dPow *= 0.75 + rnd(w) * 0.5;
    const win = aPow > dPow, loss = Math.min(0.85, (win ? dPow / aPow : aPow / dPow) * 0.6);
    for (const p of defs) {
      const lost = {}; let ln = 0;
      for (const k in p.troops) { const l = Math.round(p.troops[k] * (win ? 0.6 : loss * 0.5)); if (l) { p.troops[k] -= l; ln += l; } if (p.troops[k] <= 0) delete p.troops[k]; }
      if (win) SIM.say(p.id, `${s.name}は${fName(w, c.att)}の猛攻に耐えきれず落城しました…（兵${ln}人を失う）`);
      else { p.fame += 3; SIM.say(p.id, `${s.name}で${fName(w, c.att)}の軍勢を退けました！（名声+3・兵${ln}人を失う）`); if (SIM.addMerit) SIM.addMerit(w, p, 60, `${s.name}を守り抜いた`); }
    }
    if (win) {
      const left = Math.max(5, Math.round(SIM.troopCount(c.army) * (1 - loss)));
      capture(w, s, c.att); s.gar = garOf(left);
      return true;
      for (const p of defs) { const r = castles(w, p.clan).sort((a, b) => dist(a, s) - dist(b, s))[0] || w.settlements.find((x) => x.type !== 'castle'); if (r) { p.x = r.x; p.y = r.y; p.at = r.id; } }
    } else {
      s.gar = garOf(Math.max(3, Math.round(SIM.garrison(s) * (1 - loss * 0.5))));
      news(w, `${s.name}は${fName(w, c.att)}の攻撃を退けました`);
      return 1 - loss;
    }
  }
  function warPlan(w) {
    w.musters = w.musters || [];
    // CPUの戦：戦をしている家の城のうち、近くて守りの手薄な城を狙う。兵は相手の守りに合わせて集める（0.44.0）
    const N = SIEGE_N;
    for (const k of Object.keys(w.wars)) {
      const [a, b] = k.split('|'); if (!alive(w, a) || !alive(w, b)) continue;
      const att = w.factions[a].player ? b : w.factions[b].player ? a : rnd(w) < SIM.kou(w, a) / (SIM.kou(w, a) + SIM.kou(w, b)) ? a : b, def = att === a ? b : a;
      if (w.factions[att].player) continue;
      const K = SIM.kou(w, att);
      const mine = castles(w, att);
      let best = null;
      for (const y of castles(w, def)) {
        if (SIM.armyTo(w, y.id) || w.musters.some((m) => m.tgt === y.id)) continue;
        const x = mine.slice().sort((p1, p2) => dist(p1, y) - dist(p2, y))[0]; if (!x) continue;
        const d = dist(x, y); if (d > KOU.reach[K]) continue;
        const guard = defPow(y), weak = SIM.garrison(y) / Math.max(1, garMax(w, y)); // 守りの強さ・兵の残り具合
        const score = guard * (1 + d / 40);
        if (!best || score < best.score) best = { src: x, tgt: y, guard, weak, score };
      }
      if (!best) continue;
      // 手薄な城（兵が上限の4割未満）はすぐ狙う。そうでなければときどき
      if (rnd(w) > Math.min(0.95, (best.weak < N.weakFrac ? N.weakRate : N.rate) * KOU.rate[K] * (SIM.infamyMul ? SIM.infamyMul(w, def) : 1))) continue;
      const { src, tgt } = best, need = Math.max(N.min, Math.ceil(best.guard * KOU.ratio[K]));
      // 近くの城（3つまで）から兵を集め、足りなければ陣触れで農兵を足す
      const near = mine.slice().sort((a2, b2) => dist(a2, tgt) - dist(b2, tgt)).slice(0, 3);
      const can = near.reduce((s2, x) => s2 + Math.floor(SIM.garrison(x) * N.take), 0), levyCap = Math.min(N.levyMax, mine.length * N.levyPer);
      if (can + levyCap < need) continue; // 集めても足りない：攻めない
      let n = 0; const gens = [];
      for (const x of near) {
        if (n >= need) break;
        const t = Math.min(Math.floor(SIM.garrison(x) * N.take), need - n); n += t; x.gar = garOf(SIM.garrison(x) - t);
        if (t > 0 && x.lord && w.people[x.lord] && !gens.includes(x.lord)) gens.push(x.lord); // 城主が武将として加わる
      }
      const levy = Math.max(0, need - n);
      const army = garOf(n); if (levy) army.nohei = levy;
      // 0.49.0 すぐには出陣せず、まず兵を集める（噂が流れる）→ 数日後に軍勢が出る
      const days = Math.max(1, Math.min(7, Math.round(1 + (n + levy) / 60))); // 0.59.0 大軍ほど集めるのに日数がかかる
      w.musters.push({ att, src: src.id, tgt: tgt.id, army, gens, n: n + levy, at: w.time.min + days * 1440 });
      news(w, `${fName(w, att)}が${src.name}に兵を集めているそうです（${n + levy}人ほど。${fName(w, def)}の${tgt.name}を狙っているとか）`);
      for (const q of Object.values(w.players)) if (q.clan === att) SIM.say(q.id, `【陣触れ】${src.name}に兵を集めています。${days}日のうちに${src.name}に入っておけば、${tgt.name}攻めに参陣できます`); // 0.50.0
    }
  }
  // 兵を集め終えたら出陣する。狙いの城がもう敵の城でなければ取りやめて兵を城に戻す
  function musterTick(w) {
    if (!w.musters.length) return;
    w.musters = w.musters.filter((m) => {
      if (w.time.min < m.at) return true;
      const src = SIM.settlement(w, m.src), tgt = SIM.settlement(w, m.tgt);
      if (!src || src.owner !== m.att || !alive(w, m.att)) return false;
      if (!tgt || tgt.owner === m.att || !SIM.atWar(w, m.att, tgt.owner) || SIM.armyTo(w, tgt.id)) { const back = Object.assign({}, m.army); delete back.nohei; src.gar = garOf(SIM.garrison(src) + SIM.troopCount(back)); news(w, `${src.name}に集まっていた${fName(w, m.att)}の兵は解き放たれたそうです`); return false; }
      const n = SIM.launchArmy(w, { faction: m.att, from: src, to: tgt, army: m.army, gens: m.gens, mode: 'siege' });
      const js = Object.values(w.players).filter((q) => q.clan === m.att && !q.battle && !q.camp && (q.at === src.id || (q.tx == null && dist(q, src) < 2)));
      if (js.length && SIM.joinArmy) SIM.joinArmy(w, n, js); // 0.50.0 城に来ていた家臣は参陣する
      return false;
    });
  }
  SIM._campArrive = campArrive; SIM._garOf = garOf; SIM._garMax = garMax; SIM.SIEGE = SIEGE;
  SIM.systems.push(function warTick(w) {
    const d = Math.floor(w.time.min / 1440);
    w.musters = w.musters || []; musterTick(w);
    while (w.wday < d) { w.wday++; if (w.wday % 30 === 15) monthly(w); if (w.wday % 7 === 3) warPlan(w); } // 0.44.0 攻めるかどうかは週ごとに考える
  });

  // ---- 地図・画面に送る情報 ----
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) {
    const d = baseDyn(w, pid);
    d.cs = Object.fromEntries(w.settlements.filter((s) => s.type === 'castle').map((s) => { const pr = s.lord && w.people[s.lord]; return [s.id, [SIM.garrison(s), s.lord || null, pr ? pr.loyal : null, pr ? pr.name : null]]; }));
    d.wars = Object.keys(w.wars);
    d.fd = Object.keys(w.factions).filter((k) => w.factions[k].dead);
    return d;
  };
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], f = w.factions[p.clan], s = here(w, p);
    r.me.war = {
      enemies: Object.keys(w.wars).map((k) => k.split('|')).filter((x) => x.includes(p.clan)).map((x) => (x[0] === p.clan ? x[1] : x[0])),
      canSiege: !!f && (p.rank >= SIEGE.minRank || f.leader === pid), canPersuade: !!f && (p.rank >= SIEGE.persuadeRank || f.leader === pid),
      persuadeCost: SIEGE.persuadeCost, rewardCost: SIEGE.rewardCost, nearKm: SIEGE.nearKm,
      chance: s && s.lord && s.owner !== p.clan ? Math.round(SIM.persuadeChance(w, p, s) * 100) : null,
      camps: SIM.threats ? SIM.threats(w, p) : [],
    };
    if (r.me.rank && r.me.rank.daimyo) {
      r.me.rank.daimyo.diplo = Object.keys(w.factions).filter((k) => k !== p.clan && alive(w, k)).map((k) => ({ id: k, name: w.factions[k].name, war: SIM.atWar(w, p.clan, k), castles: castles(w, k).length, kou: KOU.names[SIM.kou(w, k)], truce: Math.max(0, Math.ceil(((w.truce[key(p.clan, k)] || 0) - w.time.min) / 1440)) }));
      r.me.rank.daimyo.peaceCost = SIEGE.peaceCost;
      r.me.rank.daimyo.generals = w.settlements.filter((x) => x.owner === p.clan && x.lord && w.people[x.lord]).map((x) => ({ name: w.people[x.lord].name, castle: x.name, loyal: w.people[x.lord].loyal }));
    }
    return r;
  };
})();
