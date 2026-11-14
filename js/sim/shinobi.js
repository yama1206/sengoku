// 0.77.0 忍び：忍びとして仕官すると、馬・兵なしで身軽に動き、主家から敵の城への工作（破壊工作・襲撃・流言）を請け負う。工作は潜入のミニゲーム（js/ninja.js）で成否が決まる
(function () {
  const SIM = SGK.SIM, C = SIM.commands;
  const NR = SIM.NRANKS = [null,
    { name: '下忍', desc: '忍びとして召し抱えられたばかり。主家から敵の城への工作を請け負う' },
    { name: '中忍', desc: '腕を認められた忍び。工作の報酬が2割増える' },
    { name: '上忍', desc: '忍びをまとめる者。工作の報酬が4割増える' },
    { name: '忍頭', desc: '主家の忍びの頭。工作の報酬が6割増える。忍びはここが最高位' },
  ];
  const NIN = SIM.NIN = {
    mapSpd: 4,    // 地図での移動の速さ（加算）
    actSpd: 1.2,  // 合戦での本人の走る速さ（倍）
    seen: 0.6,    // 野盗などから見つかる距離（倍）
    jobs: {
      sabo: { name: '破壊工作', desc: '兵糧蔵に火を付ける。成功すると城の守備兵が2割減る', reward: 1600, merit: 30 },
      raid: { name: '襲撃', desc: '武器蔵を壊す。成功すると30日のあいだ城の守りが15%下がる', reward: 2000, merit: 36 },
      rumor: { name: '流言', desc: '城下の町人3人に噂を流す。成功すると守備兵が1割減り、30日のあいだ城の守りが8%下がる', reward: 1100, merit: 22 },
    },
    km: 100,
  };
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const day = (w) => Math.floor(w.time.min / 1440);
  const nst = (w, p) => { p.status = `${fName(w, p.clan)} ${NR[Math.min(4, p.rank)].name}`; };
  SIM.rankName = (p) => (p.nin && p.clan && NR[p.rank] ? NR[p.rank].name : (SIM.RANKS[p.rank] || {}).name);

  // ---- 状態 ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) { baseEnsure(w); for (const p of Object.values(w.players)) { if (p.nin && !p.clan) p.nin = false; if (p.nin) nst(w, p); } return w; };

  // ---- 忍びとして仕官（兵は解き放ち、馬は荷へ） ----
  const baseServe = C.serve;
  C.serve = (w, p, c) => {
    const was = p.clan; baseServe(w, p, c);
    if (was || !p.clan || !(c && c.nin)) return;
    p.nin = true; nst(w, p);
    const n = SIM.troopCount ? SIM.troopCount(p.troops || {}) : 0; p.troops = {};
    const e = p.equip; if (e && e.horse) { p.gear = p.gear || {}; p.gear[e.horse] = (p.gear[e.horse] || 0) + 1; e.horse = null; }
    SIM.say(p.id, `${fName(w, p.clan)}の下忍として召し抱えられました！${n ? `連れていた兵${n}人は解き放ちました。` : ''}忍びの間は馬に乗れず、兵も雇えません`);
  };
  const baseLeave = C.leaveClan;
  C.leaveClan = (w, p, c) => { const was = p.nin; baseLeave(w, p, c); if (was && !p.clan) { p.nin = false; p.ninQ = null; } };
  const basePromote = C.promote;
  C.promote = (w, p, c) => {
    if (!p.nin) return basePromote(w, p, c);
    if (p.rank >= 4) return SIM.say(p.id, '忍頭は忍びの最高位です');
    const nx = SIM.RANKS[p.rank + 1];
    if (p.merit < nx.merit) return SIM.say(p.id, `功績が足りません（${p.merit}/${nx.merit}）`);
    if (p.fame < nx.fame) return SIM.say(p.id, `名声が足りません（${p.fame}/${nx.fame}）`);
    p.rank++; p.promoteHint = 0; nst(w, p);
    SIM.say(p.id, `${NR[p.rank].name}に取り立てられました！ 俸禄は月${SIM.money(SIM.RANKS[p.rank].stipend)}になります`);
  };
  // 兵を雇えない・馬に乗れない
  for (const k of ['recruit']) { const b = C[k]; if (b) C[k] = (w, p, c) => (p.nin ? SIM.say(p.id, '忍びの間は兵を雇えません') : b(w, p, c)); }
  const bEq = C.equipGear; if (bEq) C.equipGear = (w, p, c) => (p.nin && SGK.SIM.EQUIP && SIM.EQUIP.slotOf && SIM.EQUIP.slotOf(c.id) === 'horse' ? SIM.say(p.id, '忍びの間は馬に乗れません') : bEq(w, p, c));
  const bBuyE = C.buyEquip; if (bBuyE) C.buyEquip = (w, p, c) => (p.nin && c.kind === 'horse' ? SIM.say(p.id, '忍びの間は馬に乗れません') : bBuyE(w, p, c));
  // 身軽さ
  const baseSpd = SIM.speedBonus; SIM.speedBonus = (p) => baseSpd(p) + (p.nin ? NIN.mapSpd : 0);
  // 戦の城に入れる：請け負った工作の城だけ
  const baseCan = SIM.canEnter; SIM.canEnter = (w, p, s) => baseCan(w, p, s) || !!(p.nin && p.ninQ && p.ninQ.to === s.id);

  // ---- 工作の依頼（主家の城で、戦をしている家の100km以内の城へ） ----
  function offers(w, p, s) {
    if (!p.nin || !p.clan || !s || s.type !== 'castle' || s.owner !== p.clan) return [];
    const tg = w.settlements.filter((t) => t.type === 'castle' && t.owner && SIM.atWar && SIM.atWar(w, p.clan, t.owner) && dist(s, t) <= NIN.km);
    if (!tg.length) return [];
    let h = day(w) * 7 + String(s.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const mul = 1 + (p.rank - 1) * 0.2;
    return Object.keys(NIN.jobs).map((k, i) => { h = (h * 9301 + 49297) % 233280; const t = tg[h % tg.length], J = NIN.jobs[k], km = dist(s, t);
      return { id: `${k}-${t.id}-${day(w)}`, k, to: t.id, toName: t.name, foe: fName(w, t.owner), km: Math.round(km), days: Math.ceil(km / 25) + 4, reward: Math.round(J.reward * mul * (1 + km / 150) / 10) * 10, merit: J.merit }; });
  }
  C.ninTake = (w, p, c) => {
    const s = here(w, p), o = offers(w, p, s).find((x) => x.id === c.id); if (!o) return;
    if (p.ninQ) return SIM.say(p.id, '工作は一度に一つまでです');
    p.ninQ = Object.assign({}, o, { from: s.id, deadline: w.time.min + o.days * 1440 });
    SIM.say(p.id, `${o.toName}への${NIN.jobs[o.k].name}を請け負いました（期限${o.days}日）。その城に入り「忍び込む」で工作します`);
  };
  C.ninDrop = (w, p) => { if (!p.ninQ) return; SIM.say(p.id, `${NIN.jobs[p.ninQ.k].name}の工作を取りやめました`); p.ninQ = null; };
  // 期限切れ
  SIM.systems.push(function ninTick(w) { for (const p of Object.values(w.players)) if (p.ninQ && w.time.min > p.ninQ.deadline) { SIM.say(p.id, `${p.ninQ.toName}への工作の期限が過ぎました`); p.ninQ = null; } });

  // ---- 潜入の難しさ（城の規模・改修・山城か平城か・昼夜） ----
  function diff(w, s) {
    const gar = SIM.garrison ? SIM.garrison(s) : 300, kai = s.kai || 0, ck = SIM.castleKind ? SIM.castleKind(s) : 'hira';
    const night = SIM.daylight ? SIM.daylight(w.time.min) < 0.5 : false;
    return { guards: Math.min(14, 3 + Math.floor(gar / 150) + kai), kai, ck, night, lv: Math.min(5, 1 + Math.floor(gar / 400) + Math.floor(kai / 2)) };
  }
  // 成否はミニゲームから届く
  C.ninResult = (w, p, c) => {
    const q = p.ninQ, s = here(w, p); if (!q || !s || s.id !== q.to || p.battle) return;
    p.ninQ = null; const J = NIN.jobs[q.k];
    if (c.ok) {
      const now = w.time.min;
      if (q.k === 'sabo' || q.k === 'rumor') for (const k in s.gar || {}) s.gar[k] = Math.floor(s.gar[k] * (q.k === 'sabo' ? 0.8 : 0.9));
      if (q.k === 'raid' || q.k === 'rumor') { s.ninDeb = q.k === 'raid' ? 0.15 : 0.08; s.ninT = now + 30 * 1440; }
      p.money += q.reward; p.fame += 2; if (SIM.addMerit) SIM.addMerit(w, p, q.merit, `${q.toName}での${J.name}`);
      SIM.say(p.id, `${J.name}に成功しました！ 報酬${SIM.money(q.reward)}・名声+2`);
    } else {
      const lost = Math.floor(p.money * 0.3); p.money -= lost; p.hpFrac = 0.15; // 合戦で負けたときと同じ
      p.at = null; // 城から追い出される
      SIM.say(p.id, `見つかってしまいました…… 手傷を負って逃げ延び、${SIM.money(lost)}を失いました`);
    }
  };
  SIM.ninDeb = (s, now) => (s && s.ninT > now ? s.ninDeb || 0 : 0);
  SIM.systems.push(function ninNow(w) { SIM._now = w.time.min; });

  // ---- 本人だけに送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const s = here(w, p);
    r.me.nin = p.nin ? { rank: NR[p.rank] ? NR[p.rank].name : '', q: p.ninQ || null, offers: offers(w, p, s), atTgt: !!(p.ninQ && s && s.id === p.ninQ.to), d: p.ninQ && s && s.id === p.ninQ.to ? diff(w, s) : null } : null;
    return r;
  };
})();
