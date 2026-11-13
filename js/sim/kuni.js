// 0.51.0 国の移り変わり：CPUの大名も投資する・水城・改築で攻城マップの曲輪や堀が増える・悪名でCPUの扱いが変わる
// （落城で規模が下がるのは siege.js の capture）
(function () {
  const SIM = SGK.SIM;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const news = (w, msg) => { for (const p of Object.values(w.players)) SIM.say(p.id, `【噂】${msg}`); };
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
        if (s.type === 'castle' && s.inv >= 2) news(w, `${fName(w, s.owner)}の${s.name}が栄え、「${I.names[s.inv]}城下」になったそうです`);
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
  SIM.systems.push(function kuniTick(w) {
    const d = Math.floor(w.time.min / 1440);
    if (w.kday == null) w.kday = d;
    while (w.kday < d) {
      w.kday++;
      if (w.kday % 30 === 15) monthly(w); // 配当の日とずらす
      if (w.kday % KN.infFadeDays === 0) for (const p of Object.values(w.players)) if (p.infamy > 0) { p.infamy--; SIM.say(p.id, `時がたち、悪名が${p.infamy}に薄れました`); }
    }
  });
})();
