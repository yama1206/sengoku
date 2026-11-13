// 0.40.0 普請：城主以上が任された城で、道を広げる・新しい道をつくる・城を改築する
(function () {
  const SIM = SGK.SIM, T = () => SGK.DATA.terrain;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const r10 = (v) => Math.round(v / 10) * 10;

  // 数値はここで調整
  const FU = SIM.FUSHIN = {
    kai: [ // 改築の段階。kf＝城の守りの効き（0.35だと平地とあまり変わらない、1.35で今までより堅い）
      { name: '掻き揚げの砦', kf: 0.35 },
      { name: '柵と空堀', kf: 0.55, cost: 3000, days: 8 },
      { name: '土塁と水堀', kf: 0.75, cost: 7000, days: 14 },
      { name: '櫓と石垣', kf: 0.95, cost: 14000, days: 20 },
      { name: '天守', kf: 1.15, cost: 24000, days: 30 },
      { name: '総構え', kf: 1.35, cost: 40000, days: 45 },
    ],
    roadKm: 40,                         // 新しい道をつくれる相手までの距離
    newCost: 120, newMtCost: 260,       // 新しい道：1kmあたりのお金（平地／山）
    newDay: 0.35, newMtDay: 1.0,        // 新しい道：1kmあたりの日数（平地／山）
    widenCost: [0, 0, 220, 100],        // 広げる：今の格ごとの1kmあたりのお金（脇道→街道 100、街道→大街道 220）
    widenDay: [0, 0, 0.3, 0.2],
    minRank: 5,                         // 城主
  };
  SIM.kaiF = (s) => (FU.kai[Math.max(0, Math.min(5, (s && s.kai) || 0))] || FU.kai[0]).kf;

  // ---- 道：普請でできた道は w.roadAdd に入れ、地図の道に足す ----
  let BASE = null;
  SIM.applyRoads = (list) => {
    const t = T(); if (!BASE) BASE = t.roads.slice();
    t.roads = BASE.concat(list || []); SIM.resetRoutes && SIM.resetRoutes();
  };
  const key = (x, y) => Math.round(x * 20) + ',' + Math.round(y * 20);
  function sMap(w) { const m = {}; for (const s of w.settlements) m[key(s.x, s.y)] = s; return m; }
  // 拠点から出ている道を、次の拠点までの区間に分ける
  function segsFrom(w, s) {
    const M = sMap(w), out = {};
    for (const r of T().roads) {
      const P = r.pts;
      for (let i = 0; i < P.length; i++) {
        if (key(P[i][0], P[i][1]) !== key(s.x, s.y)) continue;
        for (const d of [-1, 1]) {
          const pts = [P[i]]; let len = 0, to = null;
          for (let j = i + d; j >= 0 && j < P.length; j += d) {
            len += Math.hypot(P[j][0] - P[j - d][0], P[j][1] - P[j - d][1]); pts.push(P[j]);
            const hit = M[key(P[j][0], P[j][1])]; if (hit) { to = hit; break; }
          }
          if (!to || to === s) continue;
          const rk = r.rank || 2, o = out[to.id];
          if (!o || rk < o.rank) out[to.id] = { to: to.id, name: to.name, rank: rk, len, pts };
        }
      }
    }
    return out;
  }
  function mtFrac(a, b) { // 道筋のうち山にかかる割合（海を渡るなら -1）
    const n = Math.max(2, Math.ceil(dist(a, b) / 1)); let m = 0;
    for (let i = 1; i < n; i++) {
      const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
      if (SIM.isSea(x, y)) return -1;
      if (SIM.terrainAt(x, y) === '山地') m++;
    }
    return m / (n - 1);
  }

  // ---- 普請できる城か ----
  function myCastle(w, p) {
    const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null;
    if (!s || s.type !== 'castle' || s.site) return null;
    const f = w.factions[s.owner], lead = f && f.leader === p.id;
    if (!(lead || (s.holder === p.id && p.rank >= FU.minRank))) return null;
    return s;
  }
  SIM.fushinInfo = (w, p) => {
    const s = myCastle(w, p); if (!s) return null;
    const lv = s.kai || 0, nx = FU.kai[lv + 1];
    const segs = Object.values(segsFrom(w, s));
    const widen = segs.filter((g) => g.rank > 1).map((g) => ({ to: g.to, name: g.name, len: Math.round(g.len), rank: g.rank, cost: r10(g.len * FU.widenCost[g.rank]), days: Math.ceil(g.len * FU.widenDay[g.rank]) + 2 }));
    const linked = new Set(segs.map((g) => g.to));
    const roads = [];
    for (const t of w.settlements) {
      if (t === s || linked.has(t.id) || t.site || dist(s, t) > FU.roadKm) continue;
      const mf = mtFrac(s, t); if (mf < 0) continue;
      const len = dist(s, t);
      roads.push({ to: t.id, name: t.name, len: Math.round(len), mt: Math.round(mf * 100), cost: r10(len * (FU.newCost * (1 - mf) + FU.newMtCost * mf)), days: Math.ceil(len * (FU.newDay * (1 - mf) + FU.newMtDay * mf)) + 2 });
    }
    roads.sort((a, b) => a.len - b.len);
    const wk = s.work && { label: s.work.label, left: Math.max(0, Math.ceil((s.work.until - w.time.min) / 1440)) };
    return { id: s.id, kai: lv, kaiName: FU.kai[lv].name, kf: FU.kai[lv].kf, next: nx ? { lv: lv + 1, name: nx.name, cost: nx.cost, days: nx.days, kf: nx.kf } : null, work: wk, widen, roads: roads.slice(0, 8) };
  };

  SIM.commands.fushin = (w, p, c) => {
    const s = myCastle(w, p); if (!s) return SIM.say(p.id, '普請は城主以上が、任された城の中でできます');
    if (s.work) return SIM.say(p.id, `いまは${s.work.label}の最中です`);
    const info = SIM.fushinInfo(w, p), now = w.time.min;
    let job = null;
    if (c.kind === 'kai' && info.next) job = { kind: 'kai', label: `改築（${info.next.name}）`, cost: info.next.cost, days: info.next.days, lv: info.next.lv };
    else if (c.kind === 'widen') {
      const g = info.widen.find((x) => x.to === c.id), seg = g && segsFrom(w, s)[c.id];
      if (g && seg) job = { kind: 'road', label: `${g.name}への道を広げる`, cost: g.cost, days: g.days, road: { name: g.rank === 2 ? '大街道（普請）' : '街道（普請）', rank: g.rank - 1, pts: seg.pts } };
    } else if (c.kind === 'road') {
      const g = info.roads.find((x) => x.to === c.id), t = g && SIM.settlement(w, c.id);
      if (g && t) job = { kind: 'road', label: `${g.name}への道づくり`, cost: g.cost, days: g.days, road: { name: '脇道（普請）', rank: 3, pts: [[s.x, s.y], [t.x, t.y]] } };
    }
    if (!job) return;
    if (p.money < job.cost) return SIM.say(p.id, `お金が足りません（${SIM.money(job.cost)}）`);
    p.money -= job.cost; s.work = Object.assign(job, { until: now + job.days * 1440, by: p.id });
    SIM.gain && SIM.gain(p, 'chikujo', 3);
    SIM.say(p.id, `${job.label}を始めました（${job.days}日・${SIM.money(job.cost)}）`);
  };

  SIM.systems.push(function fushinTick(w) {
    for (const s of w.settlements) {
      const k = s.work; if (!k || w.time.min < k.until) continue;
      s.work = null;
      if (k.kind === 'kai') { s.kai = Math.max(s.kai || 0, k.lv); SIM.say(k.by, `${s.name}の改築が終わりました：${FU.kai[s.kai].name}`); }
      else if (k.kind === 'road') { w.roadAdd.push(k.road); w.roadVer = (w.roadVer || 0) + 1; SIM.applyRoads(w.roadAdd); SIM.say(k.by, `${k.label}が終わりました`); }
    }
  });

  // ---- 古いセーブの補完：改築の段階（大名の居城は2、ほかは0か1） ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = (w) => {
    baseEnsure(w);
    w.roadAdd = w.roadAdd || []; w.roadVer = w.roadVer || 0;
    for (const s of w.settlements) if (s.type === 'castle' && s.kai == null) {
      const f = w.factions[s.owner], h = [...s.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1000, 7);
      s.kai = s.built ? 0 : f && f.leader === s.lord ? 2 : h % 100 < 40 ? 1 : 0;
    }
    SIM.applyRoads(w.roadAdd);
    return w;
  };

  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = (w, pid) => { const d = baseDyn(w, pid); d.rv = w.roadVer || 0; if (d.rv) d.ra = w.roadAdd; return d; };
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => { const r = basePriv(w, pid), p = w.players[pid]; if (r && p) r.me.fushin = SIM.fushinInfo(w, p); return r; };
})();
