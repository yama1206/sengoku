// 兵糧と士気：兵を連れていると毎日食料（米・麦・大豆・大根・肉・卵。2.60.0）が減る。尽きると士気が下がり、低いと格の低い兵から抜けていく
(function () {
  const SIM = SGK.SIM;
  const RICE_PER_MAN = 1 / 40;   // 1人1日あたりの米（俵）。40人で1日1俵
  const MOR_FED = 80, MOR_START = 70; // 米があるときに近づく士気・初期値
  const MOR_UP = 6, MOR_DOWN = 18;    // 1日の上がり幅・米がないときの下がり幅
  const DESERT_AT = 35, DESERT_HARD = 15; // この士気を下回ると兵が抜ける（下はさらに多く）

  const ensure = (p) => { if (p.morale == null) p.morale = MOR_START; if (p.riceDebt == null) p.riceDebt = 0; };
  SIM.riceNeed = (p) => SIM.troopCount(p.troops || {}) * RICE_PER_MAN * (SIM.riceRate ? SIM.riceRate(p) : 1);

  function daily(w) {
    for (const p of Object.values(w.players)) {
      ensure(p);
      const n = SIM.troopCount(p.troops || {});
      if (!n) { p.riceDebt = 0; p.morale = Math.min(MOR_FED, p.morale + MOR_UP); p.hungry = false; continue; }
      p.riceDebt += n * RICE_PER_MAN * (SIM.riceRate ? SIM.riceRate(p) : 1);
      // 2.60.0 米だけでなく食料（麦・大豆・大根・肉・卵）も食べる。安いものから、1つ単位で（riceDebt は米に直した俵）
      if (p.inv) { const r = SIM.eatFood(p.inv, p.riceDebt * 40, true); p.riceDebt = r.left / 40; for (const k in r.ate) if (!p.inv[k]) { delete p.inv[k]; if (p.cost) delete p.cost[k]; } }
      p.hungry = p.riceDebt >= 1; // 食べる分が足りなかった
      if (p.hungry) {
        p.riceDebt = Math.min(p.riceDebt, 1); // 足りない分は持ち越さない（飢えた分は士気で払う）
        p.morale = Math.max(0, p.morale - MOR_DOWN);
        SIM.say(p.id, `兵糧（食料）が足りません！ 兵の士気が下がっています（士気${Math.round(p.morale)}）。米・麦・大豆・大根・肉・卵を荷に入れておきましょう`);
      } else p.morale = p.morale < MOR_FED ? Math.min(MOR_FED, p.morale + MOR_UP) : Math.max(MOR_FED, p.morale - 2);
      if (p.morale < DESERT_AT) desert(w, p, n, p.morale < DESERT_HARD ? 0.2 : 0.1);
    }
  }
  // 格の低い兵から抜ける
  function desert(w, p, n, rate) {
    let go = Math.max(1, Math.round(n * rate)), left = 0;
    const order = Object.keys(p.troops).sort((a, b) => (SIM.TROOPS[a].tier || 0) - (SIM.TROOPS[b].tier || 0));
    for (const k of order) {
      if (go <= 0) break;
      const q = Math.min(go, p.troops[k]); p.troops[k] -= q; go -= q; left += q;
      if (p.troops[k] <= 0) delete p.troops[k];
    }
    if (left) SIM.say(p.id, `士気が低く、兵${left}人が逃げ出しました（格の低い兵から抜けていきます）`);
  }
  SIM.systems.push(function supplyDay(w) {
    const d = Math.floor(w.time.min / 1440);
    if (w.sday == null) w.sday = d;
    while (w.sday < d) { w.sday++; daily(w); }
  });

  // 戦の士気：普段の士気が高いほど上がり、低いほど大きく下がる
  const baseMorale = SIM.moraleBase;
  SIM.moraleBase = (w, pid) => {
    const b = baseMorale(w, pid), p = w.players[pid]; if (!p) return b;
    ensure(p);
    return Math.max(10, Math.min(98, Math.round(b + (p.morale - MOR_START) * 0.8)));
  };

  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid]; ensure(p);
    const need = SIM.riceNeed(p), md = SIM.foodMD(p.inv); // 2.60.0 食料ぜんぶ（米に直して何日もつか）
    const I = SGK.DATA.items, list = SIM.FOODS().filter((k) => p.inv && p.inv[k] > 0).map((k) => `${I[k].name}${p.inv[k]}`).join('・');
    Object.assign(r.me, { morale: Math.round(p.morale), hungry: !!p.hungry, riceNeed: Math.round(need * 10) / 10, riceDays: need ? Math.floor(md / 40 / need) : null, foodList: list, foodRice: Math.floor(md / 40) });
    return r;
  };
})();
