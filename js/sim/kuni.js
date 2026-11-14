// 0.51.0 国の移り変わり：CPUの大名も投資する・水城・改築で攻城マップの曲輪や堀が増える・悪名でCPUの扱いが変わる
// 0.53.0 湊（湊町・大湊）：年貢が多めに入る
// （落城で規模が下がるのは siege.js の capture）
(function () {
  const SIM = SGK.SIM;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const news = (w, msg) => SIM.newsTo(w, msg); // 0.54.9 自分の家に関わる噂だけ
  const alive = (w, fid) => w.factions[fid] && !w.factions[fid].dead;

  // 数値はここで調整
  const KN = SIM.KUNI = {
    cpuInvMax: 3,                  // CPUが自分で上げる規模の上限
    cpuInvRate: [0.05, 0.1],      // 毎月、次の規模までの額のうち何割ぶん投資するか（この幅でくじ）
    cpuInvKou: [0, 1.3, 1.15, 1, 0.85, 0.7], // 気性ごとの倍率（慎重な家ほど内政に回す）
    cpuInvWar: 0.6,                // 戦をしている家は投資が減る
    infWar: 0.15,                  // 悪名1つごとにCPUがその家を攻める見込み +15%
    infDeclare: 0.02,              // 悪名1つごとに、毎月となりの家から宣戦される見込み（悪名3から）
    infServe: 3,                   // 悪名1つごとに仕官に要る名声 +3
    infTrade: 0.02,                // 悪名1つごとに町の売り買いが2%不利（最大20%）
    infFadeDays: 180,              // 悪名はこの日数ごとに1減る
    mizuKm: 3,                     // 城のまわりこの距離に海があれば水城
  };

  // ---- 水城：山城でなく、すぐそばが海の城 ----
  const baseKind = SIM.castleKind;
  SIM.castleKind = (s) => {
    if (!s) return 'hira';
    if (s.ck) return s.ck;
    if (s._ck2) return s._ck2;
    let k = baseKind(s);
    if (k === 'hira' && SIM.isSea) {
      const d = KN.mizuKm;
      for (let i = 0; i < 8 && k === 'hira'; i++) { const a = (i * Math.PI) / 4; if (SIM.isSea(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d)) k = 'mizu'; }
    }
    Object.defineProperty(s, '_ck2', { value: k, enumerable: false, writable: true });
    return k;
  };
  SIM.ckName = (ck) => ({ yama: '山城', mizu: '水城' }[ck] || '平城');

  // ---- 改築で攻城マップの曲輪・堀が増える ----
  const KAI_TEXT = ['', '', '本丸のまわりに水堀', '攻め口に堀つきの二の丸', '三の丸が2つ増える', '外まわりに総構えの堀'];
  SIM.kaiMapText = (lv) => (KAI_TEXT[lv] ? `攻城マップ：${KAI_TEXT[lv]}` : '');
  const baseLayout = SIM.castleLayout;
  SIM.castleLayout = (w, b, s, cside) => {
    baseLayout(w, b, s, cside);
    const F = SIM.FIELD, ck = b.ck, lv = Math.max(0, Math.min(5, (s && s.kai) || 0));
    const cx = cside === 'B' ? F.bx + 40 : F.ax - 40, cy = F.h / 2, front = cside === 'B' ? -1 : 1;
    const kr = ck === 'yama' ? 58 : 55;
    if (ck === 'mizu') { // 水城：本丸のまわりを広い水堀が囲む（平城の堀を広げる）
      for (const t of b.ter) if (t.k === 'm' && Math.hypot(t.x - cx, t.y - cy) < 1) t.r = kr + 46;
    }
    const add = [];
    if (lv >= 2 && ck === 'yama') add.push({ k: 'm', x: cx, y: cy, r: kr + 12, ri: kr + 2 });
    let nx = null;
    if (lv >= 3) { // 二の丸（攻め口の側）
      const off = ck === 'mizu' ? kr + 62 : kr + 40;
      nx = { x: cx + front * off, y: cy };
      add.push({ k: 'm', x: nx.x, y: nx.y, r: 44, ri: 31 }, { k: 'k', x: nx.x, y: nx.y, r: 30 });
    }
    if (lv >= 4) for (const sg of [-1, 1]) add.push({ k: 'k', x: cx + front * (kr * 0.4), y: cy + sg * (kr + 34), r: 24 });
    if (lv >= 5) { const r = ck === 'yama' ? 205 : 160; const keep = ck === 'yama' ? 180 : 110; b.ter = b.ter.filter((t) => { const d = Math.hypot(t.x - cx, t.y - cy); return d <= keep || d > r + 20 + t.r * 0.5; }); add.unshift({ k: 'm', x: cx, y: cy, r, ri: r - 14 }); }
    // 曲輪は堀より後に描く（重ねる順）
    b.ter.push(...add.filter((t) => t.k !== 'k'));
    b.ter.push(...add.filter((t) => t.k === 'k'));
    // 二の丸・三の丸に守り手を分ける（弓・鉄砲の半分を二の丸、槍の一部を三の丸）
    if (lv >= 3) {
      const defs = b.units.filter((u) => u.side === cside && (cside === 'B' || u.gar) && u.type !== 'hero');
      const ranged = defs.filter((u) => SIM.TROOPS[u.type].ranged), melee = defs.filter((u) => !SIM.TROOPS[u.type].ranged);
      const toNi = ranged.filter((u, i) => i % 2 === 1).concat(melee.filter((u, i) => i % 3 === 1));
      toNi.forEach((u, i) => { u.x = nx.x; u.y = nx.y + (i - (toNi.length - 1) / 2) * Math.min(14, 40 / Math.max(1, toNi.length)); });
      if (lv >= 4) melee.filter((u, i) => i % 3 === 2).forEach((u, i) => { u.x = cx + front * (kr * 0.4); u.y = cy + (i % 2 ? 1 : -1) * (kr + 34); });
    }
  };

  // ---- 悪名 ----
  const leaderInf = (w, fid) => { const f = w.factions[fid]; const p = f && f.player && w.players[f.leader]; return (p && p.infamy) || 0; };
  SIM.infamyMul = (w, fid) => 1 + leaderInf(w, fid) * KN.infWar;
  const baseServe = SIM.serveFame;
  SIM.serveFame = (p, fid) => (baseServe ? baseServe(p, fid) : SIM.RANKS[1].fame) + (p.infamy || 0) * KN.infServe;
  const baseTrade = SIM.tradeMod;
  if (baseTrade) SIM.tradeMod = (p, side) => { const m = Math.min(0.2, (p.infamy || 0) * KN.infTrade); return baseTrade(p, side) * (side === 'buy' ? 1 + m : 1 - m); };

  // ---- 毎月：CPUの投資・悪名による宣戦・悪名が薄れる ----
  function monthly(w) {
    const I = SIM.INVEST; if (!I) return;
    const warring = new Set(); for (const k of Object.keys(w.wars || {})) for (const x of k.split('|')) warring.add(x);
    for (const s of w.settlements) {
      const f = w.factions[s.owner]; if (!f || f.player || f.dead || s.site) continue;
      if (s.holder && w.players[s.holder]) continue; // プレイヤーが任された拠点は任せた人しだい
      if ((s.inv || 0) >= KN.cpuInvMax) continue;
      if (SIM.besieged && SIM.besieged(w, s.id)) continue;
      const next = (I.cost[s.type] || I.cost.town)[s.inv || 0];
      const r = (KN.cpuInvRate[0] + rnd(w) * (KN.cpuInvRate[1] - KN.cpuInvRate[0])) * KN.cpuInvKou[SIM.kou(w, s.owner)] * (warring.has(s.owner) ? KN.cpuInvWar : 1);
      s.invPts = (s.invPts || 0) + Math.round(next * r);
      if (s.invPts >= next) {
        s.invPts = 0; s.inv = (s.inv || 0) + 1;
        if (false && s.type === 'castle' && s.inv >= 2) news(w, `${fName(w, s.owner)}の${s.name}が栄え、「${I.names[s.inv]}城下」になったそうです`);
      }
    }
    // 悪名の高い家には、となりの家が攻めかかってくる
    for (const [fid, f] of Object.entries(w.factions)) {
      if (!f.player || f.dead) continue;
      const inf = leaderInf(w, fid); if (inf < 3 || rnd(w) > inf * KN.infDeclare) continue;
      const mine = w.settlements.filter((s) => s.type === 'castle' && s.owner === fid);
      const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      const cand = Object.keys(w.factions).filter((x) => x !== fid && alive(w, x) && !w.factions[x].player && x !== 'ashikaga' && !SIM.atWar(w, fid, x) && ((w.truce || {})[key(fid, x)] || 0) < w.time.min
        && w.settlements.some((y) => y.type === 'castle' && y.owner === x && mine.some((z) => dist(y, z) < 40)));
      const b = cand[Math.floor(rnd(w) * cand.length)]; if (!b) continue;
      SIM.setWar(w, fid, b, true);
      news(w, `${fName(w, b)}が「悪名高い${f.name}を討つ」と兵を挙げました`);
    }
  }
  // ---- 0.52.0 城のまわりの村・町からの上がり（その城がいちばん近い自家の城で、20km以内） ----
  // 村・町はそれぞれ、いちばん近い城（30km以内）の領内。地図のデータから決まるのでセーブには入れない
  KN.landKm = 30; KN.landInc = { village: 400, town: 700 }; // 1か月の額（拠点の規模で生産と同じく増える）
  let RYO = null;
  SIM.ryoOf = (id) => {
    if (!RYO) {
      RYO = {}; const D = SGK.DATA.settlements, cs = D.filter((x) => x.type === 'castle');
      for (const v of D) if (v.type !== 'castle') { const c = cs.slice().sort((a, b) => dist(a, v) - dist(b, v))[0]; if (c && dist(c, v) <= KN.landKm) RYO[v.id] = c.id; }
    }
    return RYO[id] || null;
  };
  SIM.landsOf = (w, c) => (c && c.type === 'castle' ? w.settlements.filter((v) => SIM.ryoOf(v.id) === c.id && v.owner === c.owner) : []);
  // 城が落ちたら、領内の村・町も一緒に渡る
  SIM.landsFollow = (w, c, from, to) => {
    for (const x of [c].concat(w.settlements.filter((v) => SIM.ryoOf(v.id) === c.id))) if (x.pop) x.pop = Math.round(x.pop * (1 - KN.popCapture)); // 落城で人が逃げる
    for (const v of w.settlements) if (SIM.ryoOf(v.id) === c.id && v.owner === from) {
      v.owner = to;
      for (const n of Object.values(w.npcs)) if (n.home === v.id && n.faction === from) n.faction = to;
    }
  };
  const landInc = (p, v) => Math.round((KN.landInc[v.type] * SIM.minatoMul(v) * (SIM.popF ? SIM.popF(v) : 1) * (SIM.prodMul ? SIM.prodMul(v) : 1) * (1 + (SIM.at(p, 'sei') - 3) * 0.03) * (SIM.incMul ? SIM.incMul(v) : 1)) / 10) * 10;
  SIM.landsIncome = (w, p, c) => SIM.landsOf(w, c).reduce((a, v) => a + landInc(p, v), 0);
  function landsMonth(w) {
    for (const c of w.settlements) {
      const p = c.holder && w.players[c.holder]; if (!p || c.site) continue;
      const ls = SIM.landsOf(w, c), ms = SIM.minesOf(c);
      if (ls.length) { const t = ls.reduce((a, v) => a + landInc(p, v), 0); p.money += t; SIM.say(p.id, `${c.name}の領内（${ls.map((v) => v.name).join('・')}）から年貢${SIM.money(t)}が納められました`); }
      if (ms.length) { const t = ms.reduce((a, m) => a + mineInc(m), 0); p.money += t; SIM.say(p.id, `${ms.map((m) => m.name).join('・')}から${SIM.money(t)}の上がりがありました`); }
    }
  }
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid];
    if (r && p && r.me && r.me.castles) for (const c of r.me.castles) { const s = SIM.settlement(w, c.id); const ls = SIM.landsOf(w, s), ms = SIM.minesOf(s); if (ls.length) { c.tax += SIM.landsIncome(w, p, s); c.lands = ls.map((v) => v.name); } if (ms.length) { c.tax += ms.reduce((a, m) => a + mineInc(m), 0); c.mines = ms.map((m) => m.name); } }
    return r;
  };

  // ---- 0.52.0 金山・銀山：いちばん近い城（60km以内）に付き、城主に毎月の上がり ----
  const ll = (lat, lon) => ({ x: +((lon - 129.4) * 91).toFixed(2), y: +((41.6 - lat) * 111).toFixed(2) });
  KN.mineInc = { kin: 1500, gin: 1000 }; KN.mineKm = 60;
  const MINES = SGK.DATA.mines = [
    ['kurokawa_m', '黒川金山', 'kin', 35.78, 138.85], ['yunooku', '湯之奥金山', 'kin', 35.43, 138.48], ['abe_m', '安倍金山', 'kin', 35.20, 138.33],
    ['toi_m', '土肥金山', 'kin', 34.91, 138.79], ['sado_m', '佐渡金山', 'kin', 38.04, 138.25], ['osarizawa', '尾去沢金山', 'kin', 40.19, 140.76],
    ['iwami_m', '石見銀山', 'gin', 35.11, 132.44], ['ikuno_m', '生野銀山', 'gin', 35.17, 134.80], ['tada_m', '多田銀山', 'gin', 34.88, 135.39],
    ['innai', '院内銀山', 'gin', 39.02, 140.43], ['handa', '半田銀山', 'gin', 37.88, 140.53],
  ].map(([id, name, k, la, lo]) => Object.assign({ id, name, k }, ll(la, lo)));
  let MC = null;
  SIM.mineCastle = (m) => {
    if (!MC) { MC = {}; const cs = SGK.DATA.settlements.filter((x) => x.type === 'castle'); for (const mm of MINES) { const c = cs.slice().sort((a, b) => dist(a, mm) - dist(b, mm))[0]; if (c && dist(c, mm) <= KN.mineKm) MC[mm.id] = c.id; } }
    return MC[m.id] || null;
  };
  SIM.minesOf = (c) => (c ? MINES.filter((m) => SIM.mineCastle(m) === c.id) : []);
  const mineInc = (m) => KN.mineInc[m.k];

  // ---- 0.52.0 人口：拠点ごとの人の数。増えると年貢・兵の集まりが増える ----
  KN.popGrow = 0.006; KN.popGrowInv = 0.003; KN.popCapInv = 0.3; KN.popSiege = 0.04; KN.popWar = 0.002; KN.popCapture = 0.15; KN.popSup = 0.02; KN.popSupCap = 0.5;
  SIM.popBase = (s) => {
    let h = 0; for (const c of String(s.id)) h = (h * 31 + c.charCodeAt(0)) % 9973;
    if (s.id === 'kyo') return 30000;
    return s.type === 'castle' ? 4000 + (h % 4000) : s.type === 'town' ? 3000 + (h % 4000) : 600 + (h % 900);
  };
  SIM.popF = (s) => (s && s.pop ? Math.max(0.4, Math.min(2.5, s.pop / SIM.popBase(s))) : 1);
  const baseTax = SIM.tax; SIM.tax = (p, s) => Math.round((baseTax(p, s) * SIM.popF(s)) / 10) * 10;
  const basePool = SIM.poolMul; if (basePool) SIM.poolMul = (s) => basePool(s) * Math.sqrt(SIM.popF(s));
  function popMonth(w) {
    const warring = new Set(); for (const k of Object.keys(w.wars || {})) for (const x of k.split('|')) warring.add(x);
    for (const s of w.settlements) {
      if (s.site) continue;
      // 0.70.0 物資が多いほど早く増え、上限も上がる（行商で物を運ぶと国が育つ）。足りないと減る
      const sf = SIM.supplyF ? SIM.supplyF(s) : 1;
      const pm = SIM.popMod ? SIM.popMod(w, s) : { g: 0, cap: 1 }; // 0.71.0 政策
      const base = SIM.popBase(s), cap = base * (1 + (s.inv || 0) * KN.popCapInv) * (0.75 + KN.popSupCap * sf) * pm.cap;
      let g = KN.popGrow + (s.inv || 0) * KN.popGrowInv + KN.popSup * (sf - 0.7) + pm.g - (warring.has(s.owner) ? KN.popWar : 0);
      if (s.pop > cap) g = Math.min(g, -0.02);
      if (SIM.besieged && SIM.besieged(w, s.id)) g = -KN.popSiege;
      s.pop = Math.max(Math.round(base * 0.3), Math.round(s.pop * (1 + g)));
    }
  }
  const baseEnsure = SIM.ensure;
  SIM.ensure = (w) => { baseEnsure(w); for (const s of w.settlements) if (s.pop == null && !s.site) s.pop = SIM.popBase(s); return w; };
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = (w, pid) => { const d = baseDyn(w, pid); if (Math.floor(w.time.min / 15) % 40 === 0 || !w._ppSent) { w._ppSent = 1; d.pp = Object.fromEntries(w.settlements.filter((s) => s.pop).map((s) => [s.id, s.pop])); d.ps = Object.fromEntries(w.settlements.filter((s) => s.pop && s.stock).map((s) => [s.id, Math.round(SIM.supplyF(s) * 100)])); } return d; };

  // ---- 0.53.0 湊：海や川の船着き場のある町。領内の年貢・町を治めたときの年貢が多めに入る ----
  KN.minatoMul = { 1: 1.5, 2: 2 }; // 1=湊町 2=大湊（南蛮・明との商いでにぎわう）
  SGK.DATA.minato = {
    sakai: 2, hakata: 2, hyogo: 2, bonotsu: 2,
    tsushima: 1, atsuta: 1, nagashima: 1, ano: 1, ujiyamada: 1, tsuruga: 1, obama: 1, mikuni: 1, naoetsu: 1, niigata: 1, kashiwazaki: 1,
    sakata: 1, ishinomaki: 1, shiogama: 1, hojozu: 1, miyazu: 1, kizuki: 1, akamagaseki: 1, onomichi: 1, tomo: 1, utazu: 1, yanai: 1,
    hofu: 1, shikama: 1, usuki: 1, shibushi: 1, shingu: 1, shimoda: 1, kanagawa_m: 1, shinagawa: 1, kawajiri: 1,
  };
  SIM.minato = (s) => (s && SGK.DATA.minato[s.id]) || 0;
  SIM.minatoMul = (s) => KN.minatoMul[SIM.minato(s)] || 1;
  SIM.minatoName = (s) => ['', '湊町', '大湊'][SIM.minato(s)] || '';
  { const t0 = SIM.tax; SIM.tax = (p, s) => (SIM.minato(s) ? Math.round((t0(p, s) * SIM.minatoMul(s)) / 10) * 10 : t0(p, s)); }

  SIM.systems.push(function kuniTick(w) {
    const d = Math.floor(w.time.min / 1440);
    if (w.kday == null) w.kday = d;
    while (w.kday < d) {
      w.kday++;
      if (w.kday % 30 === 15) monthly(w);
      if (w.kday % 30 === 0) landsMonth(w);
      if (w.kday % 30 === 10) popMonth(w); // 配当の日とずらす
      if (w.kday % KN.infFadeDays === 0) for (const p of Object.values(w.players)) if (p.infamy > 0) { p.infamy--; SIM.say(p.id, `時がたち、悪名が${p.infamy}に薄れました`); }
    }
  });
})();
