// 2.29.0 鍛冶：自宅にお金をかけて作業場を建て、採掘で得た鉄鉱石などから武器・防具を作る。
// 品質（粗悪・並・良・上・名品）は「腕」と「設備（作業場の段階）」で決まる。素材の質は関係ない。
//  ・上限＝腕と設備の低いほう。上限までのどれが出るかはランダムで、腕・設備が良いほど上のものが出やすい
//  ・ミニゲーム（槌を打つ）で成功した数だけ、さらに出やすくなる。ミニゲームを飛ばして作ることもできる
// 数値はすべて仮。品質ごとの能力は SM.QATK（武器の攻撃に足す）・SM.QDA（防具の守りに足す）
(function () {
  const SIM = SGK.SIM, EQ = SIM.EQUIP, say = (pid, t) => SIM.say(pid, t);
  const SM = (SIM.SMITH = {});
  SM.QN = ['粗悪', '並', '良', '上', '名品'];
  SM.QATK = [-0.3, 0, 0.3, 0.7, 1.2];
  SM.QDA = [-0.3, 0, 0.3, 0.6, 1.0];
  SM.QV = [0.4, 0.7, 1, 1.5, 2.2]; // 値段の倍率
  SM.STRIKES = 5; // ミニゲームの打つ回数（成功の数＝hits 0〜5）
  // 設備：作業場の段階。cap＝作れる品質の上限（0粗悪〜4名品）
  SM.FAC = [{ name: 'なし' }, { name: '小さな炉', cost: 8000, cap: 1 }, { name: '鍛冶場', cost: 25000, cap: 2 }, { name: '大鍛冶場', cost: 70000, cap: 3 }, { name: '名工の工房', cost: 180000, cap: 4 }];
  // 腕：作った経験(exp)で上がる。腕の段階 t のとき上限は t+1
  SM.ARM_EXP = [0, 8, 25, 60, 120];
  SM.ARM_NAME = ['見習い', '駆け出し', '一人前', '熟練', '名工'];
  // レシピ：base＝もとにする武具（slot, id）、need＝材料、arm＝必要な腕の段階
  SM.RECIPES = [
    { id: 'shuri', base: ['wep', 'shuri2'], need: { ironore: 1, firewood: 1 }, arm: 0 },
    { id: 'waki', base: ['wep', 'waki1'], need: { ironore: 2, firewood: 2 }, arm: 0 },
    { id: 'yari', base: ['wep', 'yari1'], need: { ironore: 3, firewood: 2 }, arm: 0 },
    { id: 'tachi', base: ['wep', 'tachi1'], need: { ironore: 4, firewood: 3 }, arm: 1 },
    { id: 'dou', base: ['arm', 'arm1'], need: { ironore: 5, firewood: 3, cotton: 1 }, arm: 1 },
    { id: 'yari2', base: ['wep', 'yari2'], need: { ironore: 6, firewood: 4 }, arm: 2 },
    { id: 'tachi2', base: ['wep', 'tachi2'], need: { ironore: 7, firewood: 5 }, arm: 2 },
    { id: 'gusoku', base: ['arm', 'arm2'], need: { ironore: 9, firewood: 6, cotton: 2 }, arm: 2 },
    { id: 'teppo', base: ['wep', 'teppo1'], need: { ironore: 8, firewood: 5 }, arm: 3 },
  ];
  SM.gid = (r, q) => `${r.base[1]}@${q}`; // 作った武具の id（もとの id ＋ @品質）
  // 品質ごとの武具を装備の表に入れる（買えない・売れる）
  for (const r of SM.RECIPES) {
    const [slot, bid] = r.base, b = EQ[slot][bid];
    for (let q = 0; q < 5; q++) {
      const e = Object.assign({}, b, { name: `${b.name}【${SM.QN[q]}】`, crafted: 1, q, val: Math.round(((b.cost || 600) * SM.QV[q]) / 10) * 10 });
      delete e.cost; delete e.castle;
      if (slot === 'wep') e.atk = Math.max(0, Math.round(((b.atk || 0) + SM.QATK[q]) * 100) / 100); else e.da = Math.max(0.3, Math.round((b.da + SM.QDA[q]) * 100) / 100);
      EQ[slot][SM.gid(r, q)] = e;
    }
  }

  const st = (p) => (p.smith = p.smith || { lv: 0, exp: 0 });
  SM.armTier = (exp) => { let t = 0; for (let i = 0; i < SM.ARM_EXP.length; i++) if (exp >= SM.ARM_EXP[i]) t = i; return t; };
  SM.cap = (s) => (s.lv > 0 ? Math.min(SM.armTier(s.exp) + 1, SM.FAC[s.lv].cap, 4) : -1);
  // 抽選の偏り k：小さいほど上のものが出やすい（r＝乱数^k）。hits＝ミニゲームの成功数
  SM.k = (s, hits) => Math.max(0.3, 1.6 - 0.2 * SM.armTier(s.exp) - 0.15 * (s.lv - 1) - 0.08 * hits);
  // 品質ごとの出る確率（0〜cap）
  SM.dist = (s, hits) => {
    const cap = SM.cap(s); if (cap < 0) return [];
    const k = SM.k(s, hits), ge = (j) => (j <= 0 ? 1 : j > cap ? 0 : 1 - Math.pow(j / (cap + 1), 1 / k));
    return Array.from({ length: cap + 1 }, (_, j) => ge(j) - ge(j + 1));
  };
  SM.roll = (s, hits, u) => Math.min(SM.cap(s), Math.floor(Math.pow(u, SM.k(s, hits)) * (SM.cap(s) + 1)));

  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const kuraInv = (p) => { p.kura = p.kura || { money: 0, inv: {}, cost: {} }; p.kura.inv = p.kura.inv || {}; p.kura.cost = p.kura.cost || {}; return p.kura; };
  const have = (p, k) => ((p.inv || {})[k] || 0) + (kuraInv(p).inv[k] || 0);
  const take = (p, k, n) => { // 手元の荷から先に、足りなければ物置から使う
    const K = kuraInv(p); p.inv = p.inv || {}; p.cost = p.cost || {};
    const a = Math.min(n, p.inv[k] || 0); if (a) { p.inv[k] -= a; if (!p.inv[k]) { delete p.inv[k]; delete p.cost[k]; } }
    const b = n - a; if (b) { K.inv[k] -= b; if (!K.inv[k]) { delete K.inv[k]; delete K.cost[k]; } }
  };

  SIM.commands.smith = (w, p, c) => {
    if (!c || p.battle) return;
    const s = here(w, p); if (!s) return say(p.id, '拠点の中でないとできません');
    if (p.home !== s.id) return say(p.id, '作業場は自宅にしかありません');
    const S = st(p);
    if (c.kind === 'build') { // 作業場を建てる・広げる
      const nx = SM.FAC[S.lv + 1]; if (!nx) return say(p.id, 'これ以上は広げられません');
      if (p.money < nx.cost) return say(p.id, `お金が足りません（${SIM.money(nx.cost)}）`);
      p.money -= nx.cost; S.lv++;
      return say(p.id, S.lv === 1 ? `自宅に作業場（${nx.name}）を建てました！` : `作業場を${nx.name}に広げました（作れる品質の上限が上がりました）`);
    }
    if (c.kind !== 'craft') return;
    if (S.lv < 1) return say(p.id, '作業場がありません。先に自宅に建ててください');
    const r = SM.RECIPES.find((x) => x.id === c.id); if (!r) return;
    const t0 = SM.armTier(S.exp);
    if (t0 < r.arm) return say(p.id, `腕が足りません（${SM.ARM_NAME[r.arm]}以上）`);
    for (const k in r.need) if (have(p, k) < r.need[k]) return say(p.id, `材料が足りません（${SGK.DATA.items[k].name}${r.need[k]}${SGK.DATA.items[k].unit}）`);
    const hits = Math.max(0, Math.min(SM.STRIKES, Math.floor(+c.qty || 0)));
    for (const k in r.need) take(p, k, r.need[k]);
    const q = SM.roll(S, hits, SIM.rand(w)), id = SM.gid(r, q), e = EQ[r.base[0]][id];
    p.gear = p.gear || {}; p.gear[id] = (p.gear[id] || 0) + 1;
    S.exp += 2 + q; S.made = (S.made || 0) + 1;
    p.smithLast = { n: S.made, id, name: e.name, q, hits: c.qty == null ? null : hits };
    say(p.id, `${e.name}ができました！${q >= 3 ? '会心の出来です' : q === 0 ? '……粗末な出来でした' : ''}`);
    const t1 = SM.armTier(S.exp); if (t1 > t0) say(p.id, `鍛冶の腕が上がりました（${SM.ARM_NAME[t1]}）。作れる品質の上限が上がります`);
  };

  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const S = st(p), t = SM.armTier(S.exp), nx = SM.FAC[S.lv + 1], cap = SM.cap(S);
    r.me.smith = {
      lv: S.lv, fac: SM.FAC[S.lv].name, exp: S.exp, arm: t, armName: SM.ARM_NAME[t], nextExp: SM.ARM_EXP[t + 1] != null ? SM.ARM_EXP[t + 1] : null,
      cap, capName: cap >= 0 ? SM.QN[cap] : null, next: nx ? { name: nx.name, cost: nx.cost, cap: SM.QN[nx.cap] } : null,
      d0: SM.dist(S, 0), d5: SM.dist(S, SM.STRIKES), last: p.smithLast || null,
      rec: SM.RECIPES.map((x) => { const b = EQ[x.base[0]][x.base[1]]; return { id: x.id, name: b.name, slot: x.base[0], kind: b.kind, arm: x.arm, need: Object.entries(x.need).map(([k, n]) => [k, n, have(p, k)]) }; }),
    };
    return r;
  };

  // ---- 森で薪を集める：体力（傷の少なさ）を使う。体力は時間がたつと戻る（拠点にいると早い・自宅で休むとさらに早い） ----
  const WD = (SM.WOOD = { cost: 0.08, min: 0.25, lo: 3, hi: 6 });
  const hpOf = (p) => (p.hpFrac == null ? 1 : p.hpFrac);
  const woodCache = {};
  SIM.commands.gatherWood = (w, p) => {
    if (p.battle) return;
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    if (p.tx != null || p.at) return say(p.id, '森の中で立ち止まっているときにできます');
    if (SIM.terrainAt(p.x, p.y) !== '森') return say(p.id, 'ここは森ではありません');
    if (hpOf(p) < WD.min) return say(p.id, '体力が足りません。少し休んでから（体力が戻るまで待つか、自宅で休んでください）');
    p.hpFrac = Math.max(0, hpOf(p) - WD.cost);
    const n = WD.lo + Math.floor(SIM.rand(w) * (WD.hi - WD.lo + 1));
    p.inv = p.inv || {}; p.cost = p.cost || {};
    const hv = p.inv.firewood || 0, old = p.cost.firewood != null ? p.cost.firewood : 0; p.cost.firewood = (old * hv) / (hv + n); p.inv.firewood = hv + n;
    say(p.id, `薪を${n}束集めました（体力 ${Math.round(p.hpFrac * 100)}%）`);
  };
  const basePriv2 = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv2(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    let ok = false;
    if (p.tx == null && !p.busy && !p.at && !p.battle) {
      const key = `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`, ch = woodCache[pid];
      if (ch && ch.key === key) ok = ch.v; else { ok = SIM.terrainAt(p.x, p.y) === '森'; woodCache[pid] = { key, v: ok }; }
    }
    r.me.woodSpot = ok ? { cost: WD.cost, min: WD.min } : null;
    return r;
  };
})();
