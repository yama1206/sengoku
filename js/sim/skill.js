// 0.76.0 技能（マウント＆ブレイド2風）：使って伸びる。レベルそのものでは強くならず、25・50・75・100で特技が自動で1つずつ付く（効果は小さめ）
(function () {
  const SIM = SGK.SIM, TR = SIM.TROOPS;
  const WS = SIM.WSKILL = {
    tachi: { name: '刀', desc: '刀で敵に傷を与える・倒す' },
    yari: { name: '槍', desc: '槍で敵に傷を与える・倒す' },
    yumi: { name: '弓', desc: '弓で敵に傷を与える・倒す' },
    teppo: { name: '鉄砲', desc: '鉄砲で敵に傷を与える・倒す' },
    bajutsu: { name: '馬術', desc: '馬に乗って（馬を装備して）敵を倒す' },
    shogyo: { name: '商業', desc: '売り買いする（利益が出るとよく伸びる）' },
  };
  const MAX = 100;
  // [技能, 段階, 名前, 説明, 効果]
  const P = SIM.WPERKS = [
    ['tachi', 25, '斬り込み', '刀の威力+5%', { tachiAtk: 0.05 }], ['tachi', 50, '早業', '刀の振りが5%速い', { tachiCd: -0.05 }],
    ['tachi', 75, '刃筋', '刀の威力+5%', { tachiAtk: 0.05 }], ['tachi', 100, '剣豪', '刀の威力+8%', { tachiAtk: 0.08 }],
    ['yari', 25, '突き込み', '槍の威力+5%', { yariAtk: 0.05 }], ['yari', 50, '長柄使い', '槍の届く長さ+0.2m', { yariReach: 0.2 }],
    ['yari', 75, '石突き', '槍の振りが5%速い', { yariCd: -0.05 }], ['yari', 100, '槍の名手', '槍の威力+8%', { yariAtk: 0.08 }],
    ['yumi', 25, '強弓', '弓の威力+5%', { yumiAtk: 0.05 }], ['yumi', 50, '早引き', '弓を引くのが5%速い', { yumiCd: -0.05 }],
    ['yumi', 75, '遠矢', '矢が10%遠くまで届く', { yumiRange: 0.1 }], ['yumi', 100, '弓取り', '弓の威力+8%', { yumiAtk: 0.08 }],
    ['teppo', 25, '火縄の扱い', '鉄砲の威力+5%', { teppoAtk: 0.05 }], ['teppo', 50, '早合', '弾込めが5%速い', { teppoCd: -0.05 }],
    ['teppo', 75, '狙い澄まし', '弾が10%遠くまで届く', { teppoRange: 0.1 }], ['teppo', 100, '鉄砲名人', '鉄砲の威力+8%', { teppoAtk: 0.08 }],
    ['bajutsu', 25, '乗り慣れ', '地図での移動の速さ+0.5', { speed: 0.5 }], ['bajutsu', 50, '馬上の構え', '馬に乗っているとき本人の守り+1', { horseDef: 1 }],
    ['bajutsu', 75, '荷駄扱い', '運べる荷+5%', { carry: 0.05 }], ['bajutsu', 100, '人馬一体', '地図での移動の速さ+1', { speed: 1 }],
    ['shogyo', 25, '値切り', '買値-2%', { buy: -0.02 }], ['shogyo', 50, '売り込み', '売値+2%', { sell: 0.02 }],
    ['shogyo', 75, '目利き', '買値-3%', { buy: -0.03 }], ['shogyo', 100, '豪商', '売値+3%', { sell: 0.03 }],
  ].map(([sk, lv, name, desc, fx]) => ({ sk, lv, name, desc, fx }));
  const sk = (p) => (p.wsk = p.wsk || {});
  SIM.wsLv = (p, k) => ((sk(p)[k] || [0])[0]);
  // 次の段階までに要る経験（上がるほど伸びにくい）
  SIM.wsNeed = (lv) => Math.round(12 + lv * 1.6);
  SIM.wsFx = (p, key) => { let v = 0; for (const x of P) if (x.fx[key] && SIM.wsLv(p, x.sk) >= x.lv) v += x.fx[key]; return v; };
  SIM.wsGain = (p, k, amt) => {
    if (!p || !WS[k] || !(amt > 0)) return;
    const s = sk(p)[k] = sk(p)[k] || [0, 0]; if (s[0] >= MAX) return;
    s[1] += amt * (SIM.growMul ? SIM.growMul(p, k) : 1); // 0.76.1 成長の型
    while (s[0] < MAX && s[1] >= SIM.wsNeed(s[0])) {
      s[1] -= SIM.wsNeed(s[0]); s[0]++;
      const pk = P.find((x) => x.sk === k && x.lv === s[0]);
      if (pk) SIM.say(p.id, `${WS[k].name}が${s[0]}になり、特技「${pk.name}」（${pk.desc}）を覚えました！`);
    }
    if (s[0] >= MAX) s[1] = 0;
  };
  // 本人の攻撃で与えた傷 → 経験。相手が強いほど多い（農民兵などの弱い相手は少ない）
  SIM.wsFight = (p, kind, frac, victim, killed) => {
    const tier = victim.hero ? 4 : ((TR[victim.type] || {}).tier || 1);
    const v = (frac * 6 + (killed ? 4 : 0)) * (0.4 + tier * 0.4);
    SIM.wsGain(p, kind, v);
    if (p.equip && p.equip.horse) SIM.wsGain(p, 'bajutsu', v * 0.6);
  };

  // 既存の効果のしくみ（SIM.fx）に技能の特技を足す
  const baseFx = SIM.fx;
  SIM.fx = (p, key) => baseFx(p, key) + SIM.wsFx(p, key);
  // 馬に乗っているときの本人の守り
  const baseMods = SIM.unitMods;
  SIM.unitMods = (w, pid, type) => { const m = baseMods(w, pid, type), p = w.players[pid]; if (type === 'hero' && p && p.equip && p.equip.horse) m.da = (m.da || 0) + SIM.wsFx(p, 'horseDef'); return m; };
  // 運べる荷
  const baseCarry = SIM.carryKg;
  if (baseCarry) SIM.carryKg = (p) => baseCarry(p) * (1 + SIM.wsFx(p, 'carry'));
  // 商業：売り買いで伸びる
  const C = SIM.commands, bBuy = C.buy, bSell = C.sell;
  C.buy = (w, p, c) => { const m0 = p.money; bBuy(w, p, c); const spent = m0 - p.money; if (spent > 0) SIM.wsGain(p, 'shogyo', spent / 600); };
  C.sell = (w, p, c) => {
    const m0 = p.money, cost = (p.cost || {})[c.item], q0 = (p.inv || {})[c.item] || 0;
    bSell(w, p, c);
    const got = p.money - m0; if (!(got > 0)) return;
    const q = q0 - ((p.inv || {})[c.item] || 0), profit = cost != null ? got - cost * q : 0;
    SIM.wsGain(p, 'shogyo', got / 1200 + Math.max(0, profit) / 250);
  };
})();
