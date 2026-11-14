// 0.47.0 装備：武器・防具・馬。武器で本人の入る隊（兵種）が決まり、本人のいる隊は少し強くなる
(function () {
  const SIM = SGK.SIM, TR = () => SIM.TROOPS;

  // 数値はここで調整。atk＝本人の攻撃に足す実数（0.74.2 以前は am＝割合）、da＝守り、hm＝体力の上乗せ、km＝1日の移動距離の上乗せ
  const EQ = SIM.EQUIP = {
    wep: {
      yari1: { name: '素槍', kind: 'yari', cost: 0, atk: 0, wt: 3 },
      yari2: { name: '大身槍', kind: 'yari', cost: 3000, atk: 1, wt: 4 },
      yari3: { name: '名槍', kind: 'yari', cost: 12000, atk: 2, castle: true, wt: 3.5 },
      tachi1: { name: '太刀', kind: 'tachi', cost: 1500, atk: 0.5, wt: 1.5 },
      tachi2: { name: '大太刀', kind: 'tachi', cost: 4000, atk: 1.5, wt: 4 },
      tachi3: { name: '名刀', kind: 'tachi', cost: 14000, atk: 2.5, castle: true, wt: 1.5 },
      yumi1: { name: '半弓', kind: 'yumi', cost: 1000, atk: 0, wt: 1.5 },
      yumi2: { name: '重籐弓', kind: 'yumi', cost: 3500, atk: 1, wt: 2 },
      yumi3: { name: '名弓', kind: 'yumi', cost: 12000, atk: 2, castle: true, wt: 2 },
      teppo1: { name: '火縄銃', kind: 'teppo', cost: 3000, atk: 0.5, wt: 4 },
      teppo2: { name: '堺筒', kind: 'teppo', cost: 7000, atk: 1.5, wt: 5 },
      teppo3: { name: '国友の名銃', kind: 'teppo', cost: 16000, atk: 2.5, castle: true, wt: 5 },
      waki1: { name: '脇差', kind: 'waki', cost: 600, atk: 0.3, wt: 0.8 }, // 0.81.0
      waki2: { name: '名脇差', kind: 'waki', cost: 9000, atk: 1.5, castle: true, wt: 0.8 },
      shuri1: { name: '棒手裏剣', kind: 'shuri', cost: 800, atk: 0, wt: 0.5 },
      shuri2: { name: '十字手裏剣', kind: 'shuri', cost: 3000, atk: 0.8, wt: 0.6 },
    },
    arm: {
      arm1: { name: '胴丸', cost: 1500, da: 1, wt: 10 }, // 0.73.8 防具は守りだけ（体力の上乗せは無し）
      arm2: { name: '当世具足', cost: 5000, da: 2, wt: 18 },
      arm3: { name: '名甲冑', cost: 16000, da: 3, castle: true, wt: 18 },
    },
    horse: {
      horse1: { name: '駄馬', cost: 2000, km: 4, cw: 150 },
      horse2: { name: '駿馬', cost: 6000, km: 7, cw: 90 },
      horse3: { name: '名馬', cost: 18000, km: 10, castle: true, cw: 110 },
    },
    slotName: { wep: '武器', wep2: '副武器', arm: '防具', horse: '馬' },
    kindName: { yari: '槍', tachi: '太刀', yumi: '弓', teppo: '鉄砲', waki: '脇差', shuri: '手裏剣' },
    // 武器ごとに入る隊（左ほど優先。そのうち人数の多い隊に入る）
    group: { yari: ['yarigashira', 'nagayari', 'yari', 'nohei'], tachi: ['horo', 'kiba'], yumi: ['yumi'], teppo: ['teppogashira', 'teppo'], waki: ['horo', 'kiba'], shuri: ['yumi'] },
    groupName: { yari: '槍の隊', tachi: '騎馬の隊', yumi: '弓の隊', teppo: '鉄砲の隊', waki: '騎馬の隊', shuri: '弓の隊' },
    lead: { am: 1.1, mo: 5 }, // 本人のいる隊：攻撃+10%・士気+5（兵種の相性は覆らない程度）
    sell: 0.5,                // 武具を売ると半値
    // 0.74.0 荷の重さ：目安(kg)＝本人＋兵1人ごと＋馬。目安を超えると遅くなる（2倍で約0.57倍、下限0.25倍）
    carry: { self: 100, man: 15, cav: 40, minSpd: 0.25, pow: 0.8 },
  };
  // 0.73.7 装備についている能力（能力値・特技の代わり）。主の武器・防具・馬の分が効く（副武器は持ち替えるまで効かない）
  EQ.fxName = { troopAtk: ['兵の攻撃', '%'], troopDef: ['兵の守り', ''], heroHp: ['本人の体力', ''], heroDef: ['本人の守り', ''], cavAtk: ['騎馬の攻撃', '%'], rangedAtk: ['弓・鉄砲の攻撃', '%'], rangedRange: ['弓・鉄砲の射程', 'm'], troopCap: ['率いる人数', '人'] };
  SIM.eqFxText = (e) => Object.entries((e && e.fx) || {}).map(([k, v]) => { const n = EQ.fxName[k] || [k, '']; return `${n[0]}+${n[1] === '%' ? Math.round(v * 100) + '%' : v + n[1]}`; }).join('・');
  SIM.eqFx = (p, key) => { const e = p.equip || {}; let v = 0; for (const [sl, id] of [['wep', e.wep], ['arm', e.arm], ['horse', e.horse]]) { const it = id && EQ[sl][id]; if (it && it.fx && it.fx[key]) v += it.fx[key]; } return v; };
  EQ.wep2 = EQ.wep; // 0.64.0 副武器（戦場へ2つ持ち込み、△・Qで持ち替える）
  const eqOf = (p) => { p.equip = p.equip || { wep: 'yari1', arm: null, horse: null }; if (p.equip.wep2 === undefined) p.equip.wep2 = null; p.gear = p.gear || {}; return p.equip; };
  const item = (slot, id) => id && EQ[slot][id];
  // 0.74.0 持っている武具（装備していない分）p.gear = { id: 個数 }
  EQ.slotOf = (id) => (EQ.wep[id] ? 'wep' : EQ.arm[id] ? 'arm' : EQ.horse[id] ? 'horse' : null);
  const gAdd = (p, id, n = 1) => { if (!id) return; p.gear[id] = (p.gear[id] || 0) + n; if (p.gear[id] <= 0) delete p.gear[id]; };
  const wtOf = (id) => { const sl = EQ.slotOf(id); return (sl && EQ[sl][id].wt) || 0; };
  SIM.loadKg = (p) => { const e = eqOf(p); let kg = SIM.invKg(p) + wtOf(e.wep) + wtOf(e.wep2) + wtOf(e.arm); for (const id in p.gear) if (EQ.slotOf(id) !== 'horse') kg += wtOf(id) * p.gear[id]; return kg; };
  SIM.carryKg = (p) => { const C = EQ.carry, h = item('horse', eqOf(p).horse); let kg = C.self + ((h && h.cw) || 0); for (const k in p.troops || {}) { const T = SIM.TROOPS[k]; if (T && k !== 'hero') kg += (p.troops[k] || 0) * (T.cav ? C.cav : C.man); } for (const id in p.gear) if (EQ.slotOf(id) === 'horse') kg += (EQ.horse[id].cw || 0) * p.gear[id]; return kg; }; // 連れている替え馬も荷を運ぶ
  SIM.loadSpeed = (p) => { const r = SIM.loadKg(p) / Math.max(1, SIM.carryKg(p)); return r <= 1 ? 1 : Math.max(EQ.carry.minSpd, Math.pow(r, -EQ.carry.pow)); };
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
    return Object.assign({}, m, { am: m.am * (1 + ((wp && wp.atk) || 0) / TR().hero.atk), da: m.da + ((ar && ar.da) || 0), hm: m.hm }); // 0.74.2 武器の攻撃は実数で足す
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
    const old = item(c.kind, eq[c.kind]);
    if (p.money < e.cost) return SIM.say(p.id, `お金が足りません（${SIM.money(e.cost)}）`);
    p.money -= e.cost; gAdd(p, eq[c.kind]); eq[c.kind] = c.id; // 0.74.0 前の装備は売らずに荷へ
    SIM.say(p.id, `${e.name}を手に入れました${old ? `（${old.name}は荷に入れました。人物の装備タブで付け替え・売却できます）` : ''}`);
  };
  // 0.74.0 人物の装備タブ：付ける・外す・売る
  SIM.commands.equipGear = (w, p, c) => {
    const e = eqOf(p), sl = EQ.slotOf(c.id), to = c.to || sl; if (p.battle || !sl || !(p.gear[c.id] > 0)) return;
    if (!(to === sl || (sl === 'wep' && to === 'wep2'))) return;
    gAdd(p, c.id, -1); gAdd(p, e[to]); e[to] = c.id;
    SIM.say(p.id, `${EQ[sl][c.id].name}を${EQ.slotName[to]}にしました`);
  };
  SIM.commands.unequip = (w, p, c) => {
    const e = eqOf(p), to = c.to; if (p.battle || !['wep2', 'arm', 'horse', 'wep'].includes(to) || !e[to]) return;
    if (to === 'wep') { if (!e.wep2) return SIM.say(p.id, '主の武器は外せません（副武器があれば入れ替えになります）'); gAdd(p, e.wep); e.wep = e.wep2; e.wep2 = null; return SIM.say(p.id, `主の武器を外し、${item('wep', e.wep).name}を主にしました`); }
    const nm = item(to === 'wep2' ? 'wep' : to, e[to]).name; gAdd(p, e[to]); e[to] = null; SIM.say(p.id, `${nm}を外しました`);
  };
  SIM.commands.sellGear = (w, p, c) => {
    const s = here(w, p); if (!shopList(s).length) return SIM.say(p.id, '武具は町か城でしか売れません');
    const sl = EQ.slotOf(c.id); if (!sl || !(p.gear[c.id] > 0)) return;
    const v = Math.floor(EQ[sl][c.id].cost * EQ.sell); gAdd(p, c.id, -1); p.money += v; SIM.say(p.id, `${EQ[sl][c.id].name}を${SIM.money(v)}で売りました`);
  };

  SIM.commands.swapWep = (w, p) => { const e = eqOf(p); if (p.battle || !e.wep2) return; [e.wep, e.wep2] = [e.wep2, e.wep]; SIM.say(p.id, `主の武器を${item('wep', e.wep).name}にしました`); };

  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const e = eqOf(p);
    r.me.equip = { wep: e.wep, wep2: e.wep2, arm: e.arm, horse: e.horse }; r.me.gear = p.gear;
    r.me.loadKg = Math.round(SIM.loadKg(p) * 10) / 10; r.me.carryKg = Math.round(SIM.carryKg(p)); r.me.loadSpd = Math.round(SIM.loadSpeed(p) * 100) / 100; r.me.canSell = !!(r.here && shopList(SIM.settlement(w, r.here.id)).length);
    if (r.here) r.here.shop = shopList(SIM.settlement(w, r.here.id)).map(([sl, id]) => [sl, id]);
    return r;
  };
})();
