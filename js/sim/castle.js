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
  const heldBy = (w, pid) => w.settlements.find((s) => s.holder === pid);
  SIM.heldCastle = heldBy;
  const nearHeld = (w, p) => { const s = heldBy(w, p.id); return s && Math.hypot(s.x - p.x, s.y - p.y) < NEAR_KM ? s : null; };

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
  SIM.releaseCastle = (w, p) => { const s = heldBy(w, p.id); if (s) { s.holder = null; SIM.say(p.id, `${s.name}を主家に返しました`); } };
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
    const s = heldBy(w, p.id);
    if (s && p.at === s.id && p.tx == null) r *= 1 + Math.floor(s.dev.wall) * 0.05 + fx(p, 'castleSight');
    return r;
  };

  // ---- 開発の完了（economy の仕事処理より先に） ----
  SIM.systems.unshift(function devDone(w) {
    for (const p of Object.values(w.players)) {
      const b = p.busy; if (!b || b.kind !== 'dev' || w.time.min < b.until) continue;
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
    if (!s || s.holder !== p.id) return SIM.say(p.id, '任されている城の中でないとできません');
    if (p.busy) return SIM.say(p.id, `${p.busy.label}の最中です`);
    if (s.dev[c.kind] >= MAXLV) return SIM.say(p.id, `${D.name}はこれ以上上げられません`);
    const cost = SIM.devCost(p, s, c.kind);
    if (p.money < cost) return SIM.say(p.id, `お金が足りません（${SIM.money(cost)}）`);
    p.money -= cost;
    p.busy = { kind: 'dev', dev: c.kind, sid: s.id, label: D.act, until: w.time.min + D.hours * 60 };
    SIM.say(p.id, `${D.act}を始めました（${SIM.money(cost)}）`);
  };

  // ---- 本人だけに送る情報・地図に載せる城主名 ----
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], s = heldBy(w, pid);
    r.me.castle = s ? { id: s.id, name: s.name, tax: SIM.tax(p, s), near: !!nearHeld(w, p),
      dev: Object.keys(DEV).map((k) => [k, Math.round(s.dev[k] * 100) / 100, SIM.devCost(p, s, k), Math.round(SIM.devGain(p, s, k) * 100)]) } : null;
    if (r.here) { const h = SIM.settlement(w, r.here.id); r.here.holder = h.holder ? (w.players[h.holder] || {}).name || null : null; }
    return r;
  };
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) { const d = baseDyn(w, pid); d.h = SIM.holders(w); return d; };
})();
