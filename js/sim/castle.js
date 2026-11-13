// 第5段階：城主（主家から城を任される・内政（農業・商業）・築城（城壁）・毎月の年貢）
(function () {
  const SIM = SGK.SIM;
  const fx = (p, k) => SIM.fx(p, k), lv = (p, k) => SIM.lvOf(p, k);
  const MAXLV = 10;
  // 開発の種類（数値はすべて仮）
  const DEV = SIM.DEV = {
    agri: { name: '農業', act: '田畑の開発', skill: 'naisei', attr: 'sei', hours: 12, fxKey: 'devFx', desc: '年貢が増え、城の米の生産が増える' },
    com: { name: '商業', act: '城下の町割り', skill: 'naisei', attr: 'sei', hours: 12, fxKey: 'devFx', desc: '年貢（銭）が大きく増える' },
    wall: { name: '城壁', act: '城壁の普請', skill: 'chikujo', attr: 'chi', hours: 16, fxKey: 'wallFx', desc: '城の近く（15km）の戦で兵の守り・士気が上がり、城からの視界が広がる' },
  };
  const NEAR_KM = 15;
  SIM.devCost = (p, s, k) => Math.round(((800 + Math.floor(s.dev[k]) * 500) * (1 + fx(p, 'devCost'))) / 10) * 10;
  SIM.devGain = (p, s, k) => { const D = DEV[k]; return (0.25 * (1 + lv(p, D.skill) * 0.015 + (p.attrs[D.attr] - 3) * 0.05) * (1 + fx(p, D.fxKey))) / (1 + Math.floor(s.dev[k]) * 0.15); };
  SIM.tax = (p, s) => Math.round(((800 + Math.floor(s.dev.agri) * 250 + Math.floor(s.dev.com) * 350) * (1 + lv(p, 'naisei') * 0.005 + (p.attrs.sei - 3) * 0.03 + fx(p, 'tax'))) / 10) * 10;
  const heldAll = (w, pid) => w.settlements.filter((s) => s.holder === pid);
  const heldBy = (w, pid) => heldAll(w, pid)[0];
  SIM.heldCastle = heldBy;
  const nearHeld = (w, p) => heldAll(w, p.id).filter((s) => Math.hypot(s.x - p.x, s.y - p.y) < NEAR_KM).sort((a, b) => b.dev.wall - a.dev.wall)[0] || null;
  // 築城（新しく城を築く）：数値は仮
  const BUILD = SIM.BUILD = { cost: 40000, minRank: 4, minKm: 5, hours: 16 };
  SIM.siteGain = (p) => 0.12 * (1 + lv(p, 'chikujo') * 0.02 + (p.attrs.chi - 3) * 0.05) * (1 + fx(p, 'wallFx'));

  // 米の生産を農業の段階に合わせる
  function syncProd(s) {
    const d = SGK.DATA.settlements.find((x) => x.id === s.id) || {};
    const base = (d.prod && d.prod.rice) || 0, add = Math.floor(s.dev.agri) * 0.4;
    if (add || s.prod.rice != null) s.prod.rice = base + add;
  }

  // ---- 城を任される・手放す ----
  SIM.grantCastle = (w, p) => {
    const f = w.factions[p.clan]; if (!f) return null;
    const ok = (s) => s.type === 'castle' && s.owner === p.clan && !s.holder && s.lord !== f.leader;
    const cur = p.at ? SIM.settlement(w, p.at) : null;
    const s = cur && ok(cur) ? cur : w.settlements.filter(ok).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (!s) return null;
    s.holder = p.id;
    return s;
  };
  SIM.releaseCastle = (w, p) => {
    for (const s of heldAll(w, p.id)) { s.holder = null; SIM.say(p.id, `${s.name}を主家に返しました`); }
    for (const s of w.settlements) if (s.site && s.site.by === p.id) s.site.by = null; // 普請中の城は主家が引き継ぐ
  };
  SIM.holders = (w) => Object.fromEntries(w.settlements.filter((s) => s.holder && w.players[s.holder]).map((s) => [s.id, w.players[s.holder].name]));

  // ---- 足りない項目を補う ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    if (w.cday == null) w.cday = Math.floor(w.time.min / 1440);
    for (const s of w.settlements) {
      if (s.type !== 'castle') continue;
      s.dev = s.dev || { agri: 0, com: 0, wall: 0 };
      if (s.holder === undefined) s.holder = null;
      const h = s.holder && w.players[s.holder];
      if (s.holder && (!h || h.clan !== s.owner || h.rank < 5)) s.holder = null; // 主家が変わった・身分が戻ったら返上
      syncProd(s);
    }
    return w;
  };

  // ---- 効果：城の近くの戦・視界 ----
  const baseMods = SIM.unitMods;
  SIM.unitMods = (w, pid, type) => {
    const m = baseMods(w, pid, type), p = w.players[pid], s = p && nearHeld(w, p);
    if (s) m.da += Math.floor(s.dev.wall) * 0.15 + fx(p, 'wallDef');
    return m;
  };
  const baseMorale = SIM.moraleBase;
  SIM.moraleBase = (w, pid) => { const p = w.players[pid], s = p && nearHeld(w, p); return Math.min(98, baseMorale(w, pid) + (s ? Math.floor(s.dev.wall) * 1.5 : 0)); };
  const baseSight = SIM.sightRadius;
  SIM.sightRadius = (w, p) => {
    let r = baseSight(w, p);
    const s2 = p.at && p.tx == null ? heldAll(w, p.id).find((x) => x.id === p.at) : null;
    if (s2) r *= 1 + Math.floor(s2.dev.wall) * 0.05 + fx(p, 'castleSight');
    return r;
  };

  // ---- 開発の完了（economy の仕事処理より先に） ----
  SIM.systems.unshift(function devDone(w) {
    for (const p of Object.values(w.players)) {
      const b = p.busy; if (!b || (b.kind !== 'dev' && b.kind !== 'site') || w.time.min < b.until) continue;
      if (b.kind === 'site') { p.busy = null; siteDone(w, p, SIM.settlement(w, b.sid)); continue; }
      p.busy = null;
      const s = SIM.settlement(w, b.sid), D = DEV[b.dev]; if (!s || s.holder !== p.id || !D) continue;
      const before = Math.floor(s.dev[b.dev]);
      s.dev[b.dev] = Math.min(MAXLV, s.dev[b.dev] + SIM.devGain(p, s, b.dev));
      const after = Math.floor(s.dev[b.dev]);
      SIM.gain(p, D.skill, 6 + before * 0.6);
      if (b.dev === 'agri') syncProd(s);
      SIM.say(p.id, after > before ? `${D.act}を終え、${s.name}の${D.name}が${after}になりました！` : `${D.act}を終えました（${D.name} ${Math.floor((s.dev[b.dev] - after) * 100)}%）`);
    }
  });

  // ---- 築城の普請が進む・できあがる ----
  function siteDone(w, p, s) {
    if (!s || !s.site) return;
    s.site.prog = Math.min(1, s.site.prog + SIM.siteGain(p));
    SIM.gain(p, 'chikujo', 8);
    if (s.site.prog < 1) return SIM.say(p.id, `${s.name}の普請が進みました（${Math.floor(s.site.prog * 100)}%）`);
    const by = s.site.by; s.site = null;
    SIM.say(p.id, `${s.name}が完成しました！`);
    const q = by && w.players[by];
    if (q && q.clan === s.owner && q.rank >= BUILD.minRank) {
      s.holder = q.id;
      if (q.rank === 4) { q.rank = 5; q.status = `${(w.factions[q.clan] || {}).name || ''} ${SIM.RANKS[5].name}`; SIM.say(q.id, `自ら築いた${s.name}の城主となりました！`); }
      else SIM.say(q.id, `${s.name}もあなたが治めます`);
    }
    if (s.owner) SIM.spawnNpc(w, 'patrol', s.owner, s);
    SIM.ensure(w);
  }
  function castleName(w, x, y) {
    const near = w.settlements.filter((s) => !s.built).reduce((a, s) => (Math.hypot(s.x - x, s.y - y) < Math.hypot(a.x - x, a.y - y) ? s : a));
    const base = near.name.replace(/(城|館|本願寺)$/, '');
    for (const suf of ['新城', '砦', '山城', '岡城', '要害']) { const n = base + suf; if (!w.settlements.some((s) => s.name === n)) return n; }
    return base + '新城' + w.nextId;
  }

  // ---- 毎月の年貢 ----
  SIM.systems.push(function castleMonth(w) {
    const d = Math.floor(w.time.min / 1440);
    while (w.cday < d) {
      w.cday++;
      if (w.cday % 30) continue;
      for (const s of w.settlements) {
        const p = s.holder && w.players[s.holder]; if (!p) continue;
        const t = SIM.tax(p, s); p.money += t;
        SIM.gain(p, 'naisei', 2);
        SIM.say(p.id, `${s.name}から年貢${SIM.money(t)}が納められました`);
      }
    }
  });

  // ---- コマンド ----
  SIM.commands.develop = (w, p, c) => {
    const D = DEV[c.kind]; if (!D) return;
    const s = p.at && p.tx == null && !p.battle ? SIM.settlement(w, p.at) : null;
    if (!s || s.holder !== p.id || s.site) return SIM.say(p.id, '任されている城の中でないとできません');
    if (p.busy) return SIM.say(p.id, `${p.busy.label}の最中です`);
    if (s.dev[c.kind] >= MAXLV) return SIM.say(p.id, `${D.name}はこれ以上上げられません`);
    const cost = SIM.devCost(p, s, c.kind);
    if (p.money < cost) return SIM.say(p.id, `お金が足りません（${SIM.money(cost)}）`);
    p.money -= cost;
    p.busy = { kind: 'dev', dev: c.kind, sid: s.id, label: D.act, until: w.time.min + D.hours * 60 };
    SIM.say(p.id, `${D.act}を始めました（${SIM.money(cost)}）`);
  };

  SIM.commands.buildCastle = (w, p) => { // いまいる野外に新しく城を築く
    if (p.battle || p.busy) return;
    if (!p.clan || p.rank < BUILD.minRank) return SIM.say(p.id, `城を築けるのは${SIM.RANKS[BUILD.minRank].name}以上です`);
    if (p.at) return SIM.say(p.id, '拠点の外（野外）で築城を始めてください');
    if (SIM.isSea(p.x, p.y)) return;
    const near = w.settlements.find((s) => Math.hypot(s.x - p.x, s.y - p.y) < BUILD.minKm);
    if (near) return SIM.say(p.id, `${near.name}に近すぎます（${BUILD.minKm}km以上離れてください）`);
    if (w.settlements.some((s) => s.site && s.site.by === p.id)) return SIM.say(p.id, 'すでに普請中の城があります');
    if (p.money < BUILD.cost) return SIM.say(p.id, `お金が足りません（${SIM.money(BUILD.cost)}必要）`);
    p.money -= BUILD.cost;
    const id = 'c' + w.nextId++, name = castleName(w, p.x, p.y);
    const s = { id, name, type: 'castle', owner: p.clan, lord: null, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, built: true, holder: null, site: { prog: 0, by: p.id }, prod: {} };
    w.settlements.push(s); SIM.ensure(w);
    p.x = s.x; p.y = s.y; p.tx = p.ty = null; p.path = null; p.at = s.id;
    SIM.say(p.id, `${name}の縄張りを始めました（${SIM.money(BUILD.cost)}）。城の画面の「城」で普請を進めましょう`);
  };
  SIM.commands.buildWork = (w, p) => {
    const s = p.at && p.tx == null && !p.battle ? SIM.settlement(w, p.at) : null;
    if (!s || !s.site) return SIM.say(p.id, '普請中の城の中でないとできません');
    if (s.owner !== p.clan) return SIM.say(p.id, '主家の城でないと普請に加われません');
    if (p.busy) return SIM.say(p.id, `${p.busy.label}の最中です`);
    p.busy = { kind: 'site', sid: s.id, label: `${s.name}の普請`, until: w.time.min + BUILD.hours * 60 };
    SIM.say(p.id, `${s.name}の普請を始めました`);
  };

  // ---- 本人だけに送る情報・地図に載せる城主名 ----
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid];
    r.me.castles = heldAll(w, pid).filter((s) => !s.site).map((s) => ({ id: s.id, name: s.name, tax: SIM.tax(p, s),
      dev: Object.keys(DEV).map((k) => [k, Math.round(s.dev[k] * 100) / 100, SIM.devCost(p, s, k), Math.round(SIM.devGain(p, s, k) * 100)]) }));
    r.me.castle = r.me.castles[0] || null;
    r.me.build = { canRank: !!p.clan && p.rank >= BUILD.minRank, cost: BUILD.cost, minKm: BUILD.minKm, hours: BUILD.hours, gain: Math.round(SIM.siteGain(p) * 100),
      site: (w.settlements.find((s) => s.site && s.site.by === pid) || {}).name || null };
    if (r.here) { const h = SIM.settlement(w, r.here.id); r.here.holder = h.holder ? (w.players[h.holder] || {}).name || null : null; r.here.site = h.site ? Math.floor(h.site.prog * 100) : null; r.here.mine = h.owner === p.clan; }
    return r;
  };
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) {
    const d = baseDyn(w, pid); d.h = SIM.holders(w);
    d.ns = w.settlements.filter((s) => s.built).map((s) => ({ id: s.id, name: s.name, type: s.type, owner: s.owner, lord: null, x: s.x, y: s.y, built: true, site: s.site ? { prog: s.site.prog } : null }));
    return d;
  };
})();
