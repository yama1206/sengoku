// 0.47.0 装備：武器・防具・馬。武器で本人の入る隊（兵種）が決まり、本人のいる隊は少し強くなる
(function () {
  const SIM = SGK.SIM, TR = () => SIM.TROOPS;

  // 数値はここで調整。am＝本人の攻撃の上乗せ、da＝守り、hm＝体力の上乗せ、km＝1日の移動距離の上乗せ
  const EQ = SIM.EQUIP = {
    wep: {
      yari1: { name: '素槍', kind: 'yari', cost: 0, am: 0 },
      yari2: { name: '大身槍', kind: 'yari', cost: 3000, am: 0.25, fx: { troopAtk: 0.05 } },
      yari3: { name: '名槍', kind: 'yari', cost: 12000, am: 0.5, castle: true, fx: { troopAtk: 0.1, troopDef: 0.5 } },
      tachi1: { name: '太刀', kind: 'tachi', cost: 1500, am: 0.1, fx: { heroHp: 5 } },
      tachi2: { name: '大太刀', kind: 'tachi', cost: 4000, am: 0.3, fx: { cavAtk: 0.1 } },
      tachi3: { name: '名刀', kind: 'tachi', cost: 14000, am: 0.55, castle: true, fx: { cavAtk: 0.2, heroDef: 1 } },
      yumi1: { name: '半弓', kind: 'yumi', cost: 1000, am: 0 },
      yumi2: { name: '重籐弓', kind: 'yumi', cost: 3500, am: 0.25, fx: { rangedAtk: 0.08 } },
      yumi3: { name: '名弓', kind: 'yumi', cost: 12000, am: 0.5, castle: true, fx: { rangedAtk: 0.15, rangedRange: 5 } },
      teppo1: { name: '火縄銃', kind: 'teppo', cost: 3000, am: 0.1 },
      teppo2: { name: '堺筒', kind: 'teppo', cost: 7000, am: 0.3, fx: { rangedAtk: 0.1 } },
      teppo3: { name: '国友の名銃', kind: 'teppo', cost: 16000, am: 0.55, castle: true, fx: { rangedAtk: 0.2, rangedRange: 5 } },
    },
    arm: {
      arm1: { name: '胴丸', cost: 1500, da: 0.5, hm: 0.1 },
      arm2: { name: '当世具足', cost: 5000, da: 1, hm: 0.25, fx: { troopCap: 5 } },
      arm3: { name: '名甲冑', cost: 16000, da: 1.6, hm: 0.4, castle: true, fx: { troopCap: 10, troopDef: 0.5 } },
    },
    horse: {
      horse1: { name: '駄馬', cost: 2000, km: 4 },
      horse2: { name: '駿馬', cost: 6000, km: 7, fx: { cavAtk: 0.05 } },
      horse3: { name: '名馬', cost: 18000, km: 10, castle: true, fx: { cavAtk: 0.1, troopCap: 5 } },
    },
    slotName: { wep: '武器', wep2: '副武器', arm: '防具', horse: '馬' },
    kindName: { yari: '槍', tachi: '太刀', yumi: '弓', teppo: '鉄砲' },
    // 武器ごとに入る隊（左ほど優先。そのうち人数の多い隊に入る）
    group: { yari: ['yarigashira', 'nagayari', 'yari', 'nohei'], tachi: ['horo', 'kiba'], yumi: ['yumi'], teppo: ['teppogashira', 'teppo'] },
    groupName: { yari: '槍の隊', tachi: '騎馬の隊', yumi: '弓の隊', teppo: '鉄砲の隊' },
    lead: { am: 1.1, mo: 5 }, // 本人のいる隊：攻撃+10%・士気+5（兵種の相性は覆らない程度）
    sell: 0.5,                // 買い替えたとき、前の装備は半値で引き取り
  };
  // 0.73.7 装備についている能力（能力値・特技の代わり）。主の武器・防具・馬の分が効く（副武器は持ち替えるまで効かない）
  EQ.fxName = { troopAtk: ['兵の攻撃', '%'], troopDef: ['兵の守り', ''], heroHp: ['本人の体力', ''], heroDef: ['本人の守り', ''], cavAtk: ['騎馬の攻撃', '%'], rangedAtk: ['弓・鉄砲の攻撃', '%'], rangedRange: ['弓・鉄砲の射程', 'm'], troopCap: ['率いる人数', '人'] };
  SIM.eqFxText = (e) => Object.entries((e && e.fx) || {}).map(([k, v]) => { const n = EQ.fxName[k] || [k, '']; return `${n[0]}+${n[1] === '%' ? Math.round(v * 100) + '%' : v + n[1]}`; }).join('・');
  SIM.eqFx = (p, key) => { const e = p.equip || {}; let v = 0; for (const [sl, id] of [['wep', e.wep], ['arm', e.arm], ['horse', e.horse]]) { const it = id && EQ[sl][id]; if (it && it.fx && it.fx[key]) v += it.fx[key]; } return v; };
  EQ.wep2 = EQ.wep; // 0.64.0 副武器（戦場へ2つ持ち込み、△・Qで持ち替える）
  const eqOf = (p) => { p.equip = p.equip || { wep: 'yari1', arm: null, horse: null }; if (p.equip.wep2 === undefined) p.equip.wep2 = null; return p.equip; };
  const item = (slot, id) => id && EQ[slot][id];
  SIM.heroKind = (p) => { const e = item('wep', eqOf(p).wep); return e ? e.kind : null; };
  SIM.heroKind2 = (p) => { const e = item('wep', eqOf(p).wep2); return e ? e.kind : null; };

  const baseEP = SIM.ensurePlayer;
  SIM.ensurePlayer = (p) => { baseEP(p); eqOf(p); };

  // ---- 本人の強さ・移動の速さ ----
  const baseMods = SIM.unitMods;
  SIM.unitMods = (w, pid, type) => {
    const m = baseMods(w, pid, type), p = w.players[pid];
    if (type !== 'hero' || !p) return m;
    const e = eqOf(p), wp = item('wep', e.wep), ar = item('arm', e.arm);
    return Object.assign({}, m, { am: m.am * (1 + ((wp && wp.am) || 0)), da: m.da + ((ar && ar.da) || 0), hm: m.hm * (1 + ((ar && ar.hm) || 0)) });
  };
  const baseSpd = SIM.speedBonus;
  SIM.speedBonus = (p) => { const h = item('horse', eqOf(p).horse); return baseSpd(p) + ((h && h.km) || 0); };

  // ---- 戦：本人を武器に合った隊に入れる（military.js の addUnits から呼ぶ） ----
  SIM.attachHero = (w, units, owner) => {
    const p = w.players[owner], hero = units.find((u) => u.type === 'hero'); if (!p || !hero) return;
    const set = EQ.group[SIM.heroKind(p)] || [];
    const g = units.filter((u) => set.includes(u.type) && u.n > 0).sort((a, b) => b.n - a.n)[0]; if (!g) return;
    hero.att = g.id; g.lead = 1; g.am = (g.am || 1) * EQ.lead.am; g.mo = g.mor = Math.min(98, g.mo + EQ.lead.mo);
    hero.x = g.x; hero.y = g.y;
  };

  // ---- 買う ----
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  function shopList(s) {
    if (!s || s.site || s.type === 'village') return [];
    const out = [];
    for (const slot of ['wep', 'arm', 'horse']) for (const id in EQ[slot]) { const e = EQ[slot][id]; if (e.cost && (!e.castle || s.type === 'castle')) out.push([slot, id]); }
    return out;
  }
  SIM.commands.buyEquip = (w, p, c) => {
    const s = here(w, p), ok = shopList(s).some(([sl, id]) => sl === (c.kind === 'wep2' ? 'wep' : c.kind) && id === c.id); if (!ok) return;
    const e = EQ[c.kind][c.id], eq = eqOf(p); if (eq[c.kind] === c.id || (c.kind.startsWith('wep') && (eq.wep === c.id || eq.wep2 === c.id))) return SIM.say(p.id, 'もう持っています');
    const old = item(c.kind, eq[c.kind]), back = old ? Math.floor(old.cost * EQ.sell) : 0;
    if (p.money + back < e.cost) return SIM.say(p.id, `お金が足りません（${SIM.money(e.cost)}）`);
    p.money += back - e.cost; eq[c.kind] = c.id;
    SIM.say(p.id, `${e.name}を手に入れました${old ? `（${old.name}は${SIM.money(back)}で引き取ってもらいました）` : ''}`);
  };

  SIM.commands.swapWep = (w, p) => { const e = eqOf(p); if (p.battle || !e.wep2) return; [e.wep, e.wep2] = [e.wep2, e.wep]; SIM.say(p.id, `主の武器を${item('wep', e.wep).name}にしました`); };

  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const e = eqOf(p);
    r.me.equip = { wep: e.wep, wep2: e.wep2, arm: e.arm, horse: e.horse };
    if (r.here) r.here.shop = shopList(SIM.settlement(w, r.here.id)).map(([sl, id]) => [sl, id]);
    return r;
  };
})();
