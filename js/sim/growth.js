// 第4段階：成長要素（本人の能力値・技能・特技／兵の経験と昇格）
(function () {
  const SIM = SGK.SIM, TR = SIM.TROOPS;

  // ---- 能力値と技能（技能は使うほど伸び、元になる能力値が高いほど伸びやすい） ----
  const ATTRS = SIM.ATTRS = { bu: '武勇', tou: '統率', chi: '知略', sei: '政務', mi: '魅力' };
  const SKILLS = SIM.SKILLS = {
    bugei: { name: '武芸', attr: 'bu', desc: '本人の強さ' },
    shiki: { name: '指揮', attr: 'tou', desc: '率いる人数・兵の攻撃' },
    kyujutsu: { name: '弓術', attr: 'bu', desc: '弓・鉄砲の兵の攻撃' },
    bajutsu: { name: '馬術', attr: 'bu', desc: '移動の速さ・騎馬の攻撃' },
    sanjutsu: { name: '算術', attr: 'sei', desc: '売り買いの値段' },
    kosho: { name: '交渉', attr: 'mi', desc: '依頼の報酬・兵を雇う値段' },
    ijutsu: { name: '医術', attr: 'chi', desc: '戦の後に助かる兵' },
    chouren: { name: '調練', attr: 'tou', desc: '兵の経験の伸び' },
    naisei: { name: '内政', attr: 'sei', desc: '城の開発（農業・商業）の進み・年貢' },
    chikujo: { name: '築城', attr: 'chi', desc: '城壁の普請の進み・城の近くの戦での守り' },
  };
  // 特技：技能が25・50に達すると、2つのうち1つを選べる
  const PERKS = SIM.PERKS = [
    ['bugei', 25, 'onimusha', '鬼武者', '本人の攻撃+25%', { heroAtk: 0.25 }], ['bugei', 25, 'fujimi', '不死身', '本人の体力+40', { heroHp: 40 }],
    ['bugei', 50, 'ikki', '一騎当千', '本人の攻撃+40%', { heroAtk: 0.4 }], ['bugei', 50, 'teppeki', '鉄壁', '本人の守り+3', { heroDef: 3 }],
    ['shiki', 25, 'jinbo', '人望', '率いる人数+10', { troopCap: 10 }], ['shiki', 25, 'kobu', '鼓舞', '兵の攻撃+8%', { troopAtk: 0.08 }],
    ['shiki', 50, 'taisho', '大将の器', '率いる人数+20', { troopCap: 20 }], ['shiki', 50, 'kenjin', '堅陣', '兵の守り+1', { troopDef: 1 }],
    ['kyujutsu', 25, 'sokusha', '速射', '弓・鉄砲の攻撃+15%', { rangedAtk: 0.15 }], ['kyujutsu', 25, 'tooya', '遠矢', '弓・鉄砲の射程+8m', { rangedRange: 8 }],
    ['kyujutsu', 50, 'sogeki', '狙撃', '弓・鉄砲の攻撃+25%', { rangedAtk: 0.25 }], ['kyujutsu', 50, 'yumigumi', '弓組統率', '弓・鉄砲の兵の体力+20%', { rangedHp: 0.2 }],
    ['bajutsu', 25, 'hayagake', '早駆け', '移動の速さ+4', { speed: 4 }], ['bajutsu', 25, 'kibashinan', '騎馬指南', '騎馬の攻撃+15%', { cavAtk: 0.15 }],
    ['bajutsu', 50, 'idaten', '韋駄天', '移動の速さ+6', { speed: 6 }], ['bajutsu', 50, 'kibatotsu', '騎馬突撃', '騎馬の攻撃+25%', { cavAtk: 0.25 }],
    ['sanjutsu', 25, 'negiri', '値切り上手', '買値-5%', { buy: -0.05 }], ['sanjutsu', 25, 'urikomi', '売り込み上手', '売値+5%', { sell: 0.05 }],
    ['sanjutsu', 50, 'goshou', '豪商の目', '買値-8%', { buy: -0.08 }], ['sanjutsu', 50, 'oakinai', '大商い', '売値+8%', { sell: 0.08 }],
    ['kosho', 25, 'benzetsu', '弁舌', '依頼の報酬+10%', { reward: 0.1 }], ['kosho', 25, 'kaobiro', '顔が広い', '依頼達成で名声がさらに+1', { jobFame: 1 }],
    ['kosho', 50, 'kuchihatcho', '口八丁', '依頼の報酬+20%', { reward: 0.2 }], ['kosho', 50, 'jintoku', '仁徳', '給金-15%', { wage: -0.15 }],
    ['ijutsu', 25, 'teate', '応急手当', '助かる兵+15%', { survive: 0.15 }], ['ijutsu', 25, 'kusushi', '薬師', '助かる兵+10%・本人の体力+20', { survive: 0.1, heroHp: 20 }],
    ['ijutsu', 50, 'meii', '名医', '助かる兵+25%', { survive: 0.25 }], ['ijutsu', 50, 'senjoui', '戦場医', '助かる兵+15%・戦の経験+15%', { survive: 0.15, battleXp: 0.15 }],
    ['chouren', 25, 'onikyokan', '鬼教官', '調練の経験+30%', { drillXp: 0.3 }], ['chouren', 25, 'jissen', '実戦主義', '戦の経験+30%', { battleXp: 0.3 }],
    ['chouren', 50, 'meihakuraku', '名伯楽', '昇格の費用-30%', { upCost: -0.3 }], ['chouren', 50, 'seihei', '精兵育成', '調練の経験+50%', { drillXp: 0.5 }],
    ['naisei', 25, 'kanno', '勧農', '開発の進み+25%', { devFx: 0.25 }], ['naisei', 25, 'rakuichi', '楽市', '年貢+15%', { tax: 0.15 }],
    ['naisei', 50, 'kenchi', '検地', '開発・普請の費用-30%', { devCost: -0.3 }], ['naisei', 50, 'meibugyo', '名奉行', '年貢+25%', { tax: 0.25 }],
    ['chikujo', 25, 'fushin', '普請上手', '城壁の普請の進み+30%', { wallFx: 0.3 }], ['chikujo', 25, 'monomi', '物見櫓', '自分の城での視界+30%', { castleSight: 0.3 }],
    ['chikujo', 50, 'meijo', '名城', '城壁の普請の進み+50%', { wallFx: 0.5 }], ['chikujo', 50, 'kenrou', '堅牢', '城の近くの戦で兵の守り+1', { wallDef: 1 }],
  ].map(([skill, lv, id, name, desc, fx]) => ({ skill, lv, id, name, desc, fx }));
  const PERK = Object.fromEntries(PERKS.map((x) => [x.id, x]));

  const MAX_SKILL = 100, MAX_ATTR = 10;
  SIM.skillNeed = (lv) => 20 + lv * 6; // 次の段階までに必要な経験
  SIM.upNeed = (tier) => [0, 30, 60, 120, 240][tier]; // 兵が1段階上がるのに必要な経験
  SIM.upCost = (p, to) => Math.round(TR[to].tier * 150 * (1 + fx(p, 'upCost')));
  const lvOf = (p, k) => (p.skills[k] || [0])[0];
  const fx = SIM.fx = (p, key) => (p.perks || []).reduce((a, id) => a + ((PERK[id] && PERK[id].fx[key]) || 0), 0);
  SIM.charLevel = (p) => 1 + Math.floor(Object.keys(SKILLS).reduce((a, k) => a + lvOf(p, k), 0) / 15);
  SIM.attrPoints = (p) => SIM.charLevel(p) - 1 - p.spent;

  // 技能の経験を得る
  function gain(p, k, amt) {
    if (!(amt > 0) || !SKILLS[k]) return;
    const s = p.skills[k] = p.skills[k] || [0, 0];
    if (s[0] >= MAX_SKILL) return;
    const before = SIM.charLevel(p);
    s[1] += amt * (0.5 + p.attrs[SKILLS[k].attr] * 0.15);
    while (s[0] < MAX_SKILL && s[1] >= SIM.skillNeed(s[0])) {
      s[1] -= SIM.skillNeed(s[0]); s[0]++;
      if (PERKS.some((x) => x.skill === k && x.lv === s[0])) SIM.say(p.id, `${SKILLS[k].name}が${s[0]}になりました！ 人物画面で特技を選べます`);
    }
    const after = SIM.charLevel(p);
    if (after > before) SIM.say(p.id, `人物の格が${after}になりました！ 能力値を1つ上げられます`);
  }
  SIM.gain = gain; SIM.lvOf = lvOf;
  function troopXp(p, k, amt) { if (amt > 0 && p.troops[k] && TR[k].up) p.txp[k] = (p.txp[k] || 0) + amt; }

  // ---- 足りない項目を補う ----
  const baseEnsurePlayer = SIM.ensurePlayer;
  SIM.ensurePlayer = (p) => {
    baseEnsurePlayer(p);
    p.attrs = p.attrs || { bu: 3, tou: 3, chi: 3, sei: 3, mi: 3 };
    p.skills = p.skills || {}; p.perks = p.perks || []; p.txp = p.txp || {};
    if (p.spent == null) p.spent = 0;
    if (p.lx == null) { p.lx = p.x; p.ly = p.y; }
  };

  // ---- 成長が効くところ（military.js・economy.js の差し込み口を上書き） ----
  const baseCap = SIM.troopCap;
  SIM.troopCap = (p) => Math.ceil(Math.min(200, baseCap(p) + (p.attrs.tou - 3) * 2 + Math.floor(lvOf(p, 'shiki') / 5) + fx(p, 'troopCap')));
  const baseWage = SIM.wage;
  SIM.wage = (tr, p) => Math.round(baseWage(tr) * (p ? 1 + fx(p, 'wage') : 1));
  SIM.costMod = (p) => Math.max(0.5, 1 - (p.attrs.mi - 3) * 0.03 - lvOf(p, 'kosho') * 0.002);
  SIM.speedBonus = (p) => lvOf(p, 'bajutsu') * 0.1 + fx(p, 'speed');
  SIM.tradeMod = (p, side) => side === 'buy' ? 1 - lvOf(p, 'sanjutsu') * 0.0015 + fx(p, 'buy') : 1 + lvOf(p, 'sanjutsu') * 0.0015 + fx(p, 'sell');
  SIM.surviveRate = (w, pid) => { const p = w.players[pid]; return p ? Math.min(0.8, 0.1 + lvOf(p, 'ijutsu') * 0.004 + (p.attrs.chi - 3) * 0.01 + fx(p, 'survive')) : 0.1; };
  SIM.autoBonus = (w, b) => { const ps = b.pids.map((x) => w.players[x]).filter(Boolean); return ps.length ? 1 + ps.reduce((a, p) => a + (p.attrs.chi - 3) * 0.03 + lvOf(p, 'shiki') * 0.002, 0) / ps.length : 1; };
  SIM.unitMods = (w, pid, type) => {
    const p = w.players[pid], t = TR[type];
    if (!p) return { am: 1, da: 0, ra: 0, hm: 1 };
    if (type === 'hero') return {
      am: (1 + lvOf(p, 'bugei') / 50) * (1 + (p.attrs.bu - 3) * 0.05) * (1 + fx(p, 'heroAtk')),
      da: fx(p, 'heroDef'), ra: 0, hm: (TR.hero.hp + (p.attrs.bu - 3) * 5 + lvOf(p, 'bugei') + fx(p, 'heroHp')) / TR.hero.hp,
    };
    let am = 1 + lvOf(p, 'shiki') * 0.003 + fx(p, 'troopAtk');
    if (t.ranged) am *= 1 + lvOf(p, 'kyujutsu') * 0.005 + fx(p, 'rangedAtk');
    if (t.cav) am *= 1 + lvOf(p, 'bajutsu') * 0.004 + fx(p, 'cavAtk');
    return { am, da: fx(p, 'troopDef'), ra: t.ranged ? fx(p, 'rangedRange') : 0, hm: t.ranged ? 1 + fx(p, 'rangedHp') : 1 };
  };
  SIM.moraleBase = (w, pid) => { const p = w.players[pid]; return p ? Math.min(95, 60 + (p.attrs.tou - 3) * 4 + lvOf(p, 'shiki') * 0.25 + (p.attrs.mi - 3) * 1.5) : 65; };
  SIM.onBattleEnd = (w, b, p, res, after) => {
    const foe = b.foeN || 10, men = SIM.troopCount(b.start[p.id]);
    gain(p, 'bugei', ((b.hd || {})[p.id] || 0) * 0.15 + 2);
    gain(p, 'shiki', men * 0.4 + (res === 'win' ? 4 : 1));
    gain(p, 'kyujutsu', ((b.rd || {})[p.id] || 0) * 0.08);
    gain(p, 'ijutsu', Math.max(0, men - SIM.troopCount(after)) * 0.8);
    const mul = (res === 'win' ? 1 : 0.4) * (1 + fx(p, 'battleXp') + lvOf(p, 'chouren') * 0.005);
    for (const k in after) troopXp(p, k, after[k] * (6 + foe * 0.6) * mul);
  };

  // 依頼の報酬・達成時の交渉経験
  const baseAccept = SIM.commands.acceptJob;
  SIM.commands.acceptJob = (w, p, c) => {
    const n = p.quests.length; baseAccept(w, p, c);
    if (p.quests.length > n) { const q = p.quests[p.quests.length - 1]; q.reward = Math.round((q.reward * (1 + lvOf(p, 'kosho') * 0.005 + fx(p, 'reward'))) / 10) * 10; }
  };
  function jobDone(fn) {
    return (w, p, c) => {
      const n = p.quests.length, m = p.money; fn(w, p, c);
      const done = n - p.quests.length;
      if (done > 0) { p.fame += done * fx(p, 'jobFame'); gain(p, 'kosho', done * 4 + (p.money - m) / 80); }
    };
  }
  SIM.onPlayerArrive = jobDone(SIM.onPlayerArrive);
  SIM.commands.deliverJob = jobDone(SIM.commands.deliverJob);
  // 売り買いで算術
  for (const k of ['buy', 'sell']) { const f = SIM.commands[k]; SIM.commands[k] = (w, p, c) => { const m = p.money; f(w, p, c); gain(p, 'sanjutsu', Math.abs(p.money - m) / 150); }; }
  const baseTalk = SIM.commands.talk;
  SIM.commands.talk = (w, p, c) => { baseTalk(w, p, c); if (p.at) gain(p, 'kosho', 0.5); };
  // 仕事：城や町で「調練」
  const baseWork = SIM.commands.work;
  SIM.commands.work = (w, p, c) => {
    if (c.kind !== 'drill') return baseWork(w, p, c);
    const s = p.at && p.tx == null && !p.battle && !p.busy ? SIM.settlement(w, p.at) : null;
    if (!s || s.type === 'village') return SIM.say(p.id, '調練は城か町でできます');
    if (!SIM.troopCount(p.troops)) return SIM.say(p.id, '調練する兵がいません');
    p.busy = { kind: 'drill', label: '調練', until: w.time.min + 8 * 60 };
    SIM.say(p.id, '調練を始めました');
  };

  // ---- 毎tick・毎日 ----
  SIM.systems.unshift(function drillDone(w) { // economy の仕事処理より先に終わらせる
    for (const p of Object.values(w.players)) {
      const b = p.busy; if (!b || b.kind !== 'drill' || w.time.min < b.until) continue;
      p.busy = null;
      const mul = (1 + lvOf(p, 'chouren') * 0.01) * (1 + fx(p, 'drillXp'));
      for (const k in p.troops) troopXp(p, k, p.troops[k] * 6 * mul);
      gain(p, 'chouren', 3 + SIM.troopCount(p.troops) * 0.1); gain(p, 'shiki', 1);
      SIM.say(p.id, '調練を終えました。兵が経験を積みました');
    }
  });
  SIM.systems.push(function growthTick(w) {
    for (const p of Object.values(w.players)) {
      const d = Math.hypot(p.x - p.lx, p.y - p.ly); p.lx = p.x; p.ly = p.y;
      if (d < 3) { // 移動した距離で馬術（ワープ・敗走は除く）。ふだんは少しだけ、騎馬を連れていると多めに上がる
        const n = SIM.troopCount(p.troops || {}); let cav = 0; for (const k in p.troops || {}) if (SIM.TROOPS[k] && SIM.TROOPS[k].cav) cav += p.troops[k];
        gain(p, 'bajutsu', d * 0.025 * (1 + (n ? cav / n : 0) * 3));
      }
    }
    const day = Math.floor(w.time.min / 1440);
    if (w.gday == null) w.gday = day;
    while (w.gday < day) {
      w.gday++;
      for (const p of Object.values(w.players)) {
        const n = SIM.troopCount(p.troops); if (!n) continue;
        gain(p, 'shiki', n * 0.03);
        const lv = lvOf(p, 'chouren'); if (lv) for (const k in p.troops) troopXp(p, k, p.troops[k] * lv * 0.03);
      }
    }
  });

  // ---- コマンド：昇格・能力値・特技 ----
  Object.assign(SIM.commands, {
    upgrade(w, p, c) {
      const from = TR[c.from], to = TR[c.to];
      if (p.battle || !from || !to || !(from.up || []).includes(c.to) || !p.troops[c.from]) return;
      if (to.fame && p.fame < to.fame) return SIM.say(p.id, `${to.name}にするには名声${to.fame}が必要です`);
      const need = SIM.upNeed(from.tier), cost = SIM.upCost(p, c.to);
      const q = Math.min(Math.max(1, +c.qty || 1), p.troops[c.from], Math.floor((p.txp[c.from] || 0) / need), Math.floor(p.money / cost));
      if (q <= 0) return SIM.say(p.id, (p.txp[c.from] || 0) < need ? '経験が足りません' : 'お金が足りません');
      p.txp[c.from] -= q * need; p.money -= q * cost;
      p.troops[c.from] -= q; if (!p.troops[c.from]) { delete p.troops[c.from]; delete p.txp[c.from]; }
      p.troops[c.to] = (p.troops[c.to] || 0) + q;
      gain(p, 'chouren', q * 0.8);
      SIM.say(p.id, `${from.name}${q}人が${to.name}になりました（${SIM.money(q * cost)}）`);
    },
    addAttr(w, p, c) {
      if (!ATTRS[c.attr] || SIM.attrPoints(p) <= 0 || p.attrs[c.attr] >= MAX_ATTR) return;
      p.attrs[c.attr]++; p.spent++;
      SIM.say(p.id, `${ATTRS[c.attr]}が${p.attrs[c.attr]}になりました`);
    },
    pickPerk(w, p, c) {
      const k = PERK[c.id]; if (!k || p.perks.includes(k.id) || lvOf(p, k.skill) < k.lv) return;
      if (PERKS.some((x) => x.skill === k.skill && x.lv === k.lv && p.perks.includes(x.id))) return;
      p.perks.push(k.id); SIM.say(p.id, `特技「${k.name}」を身につけました`);
    },
  });

  // ---- 本人だけに送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid];
    r.me.char = { attrs: p.attrs, skills: p.skills, perks: p.perks, level: SIM.charLevel(p), points: SIM.attrPoints(p), txp: p.txp, fame: Math.round(p.fame * 10) / 10 };
    return r;
  };
})();
