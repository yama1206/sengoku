// 0.41.0 拠点への投資：お金を出して拠点の規模を上げる（生産が増える・兵の補充が早くなる・毎月わずかな配当）
(function () {
  const SIM = SGK.SIM;
  const r10 = (v) => Math.round(v / 10) * 10;

  // 数値はここで調整
  const INV = SIM.INVEST = {
    max: 5,
    names: ['小さな', 'ふつうの', 'にぎわう', '栄える', '大きな', '名だたる'],
    cost: { // 次の規模に上げるのに要る額（村・町・城）
      village: [4000, 8000, 14000, 22000, 32000],
      town: [8000, 16000, 28000, 44000, 64000],
      castle: [10000, 20000, 34000, 52000, 76000],
    },
    prod: 0.2,     // 規模1つにつき生産 +20%
    pool: 0.3,     // 規模1つにつき兵の補充の速さ・上限 +30%
    divid: 0.01,   // 毎月の配当：出した額の1%
    famePer: 2000, // 2000文ごとに名声+1
    steps: [500, 2000],
  };
  const lvOf = (s) => Math.max(0, Math.min(INV.max, (s && s.inv) || 0));
  SIM.prodMul = (s) => 1 + lvOf(s) * INV.prod;
  SIM.poolMul = (s) => 1 + lvOf(s) * INV.pool;
  const need = (s) => { const lv = lvOf(s); return lv >= INV.max ? 0 : Math.max(0, (INV.cost[s.type] || INV.cost.town)[lv] - (s.invPts || 0)); };

  SIM.investInfo = (w, p, s) => {
    const lv = lvOf(s), by = (s.invBy && s.invBy[p.id]) || 0;
    return { lv, name: INV.names[lv], max: INV.max, need: need(s), next: lv < INV.max ? (INV.cost[s.type] || INV.cost.town)[lv] : 0, prod: Math.round(lv * INV.prod * 100), pool: Math.round(lv * INV.pool * 100), mine: by, div: r10(by * INV.divid), steps: INV.steps };
  };

  SIM.commands.invest = (w, p, c) => {
    const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null;
    if (!s || s.site) return SIM.say(p.id, '拠点の中で投資できます');
    const left = need(s); if (!left) return SIM.say(p.id, `${s.name}はこれ以上大きくなりません`);
    let amt = c.kind === 'rest' ? left : Math.min(+c.qty || 0, left);
    amt = Math.min(amt, Math.floor(p.money)); if (amt <= 0) return SIM.say(p.id, 'お金が足りません');
    p.money -= amt; s.invPts = (s.invPts || 0) + amt;
    s.invBy = s.invBy || {}; s.invBy[p.id] = (s.invBy[p.id] || 0) + amt;
    const before = Math.floor(((s.invBy[p.id] - amt) || 0) / INV.famePer), after = Math.floor(s.invBy[p.id] / INV.famePer);
    if (after > before) p.fame += after - before;
    SIM.gain && SIM.gain(p, 'naisei', 1 + amt / 2000);
    if (!need(s)) {
      s.invPts = 0; s.inv = lvOf(s) + 1;
      SIM.say(p.id, `${s.name}が「${INV.names[s.inv]}${s.type === 'village' ? '村' : s.type === 'town' ? '町' : '城下'}」になりました！ 生産+${Math.round(s.inv * INV.prod * 100)}%・兵の補充+${Math.round(s.inv * INV.pool * 100)}%`);
    } else SIM.say(p.id, `${s.name}に${SIM.money(amt)}を投資しました（次の規模まであと${SIM.money(need(s))}）`);
  };

  // ---- 毎月の配当（30日ごと） ----
  SIM.systems.push(function investMonth(w) {
    const d = Math.floor(w.time.min / 1440);
    if (w.iday == null) w.iday = d;
    while (w.iday < d) {
      w.iday++;
      if (w.iday % 30) continue;
      const sum = {};
      for (const s of w.settlements) for (const pid in s.invBy || {}) { const v = r10(s.invBy[pid] * INV.divid); if (v > 0) sum[pid] = (sum[pid] || 0) + v; }
      for (const pid in sum) { const p = w.players[pid]; if (!p) continue; p.money += sum[pid]; SIM.say(pid, `投資した拠点から配当${SIM.money(sum[pid])}が届きました`); }
    }
  });

  // ---- 古いセーブの補完 ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = (w) => { baseEnsure(w); for (const s of w.settlements) { if (s.inv == null) s.inv = 0; if (s.invPts == null) s.invPts = 0; } return w; };

  // ---- 拠点の画面に出す ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid];
    if (r && p && r.here) { const s = SIM.settlement(w, r.here.id); if (s && !s.site) r.here.invest = SIM.investInfo(w, p, s); }
    return r;
  };
})();
