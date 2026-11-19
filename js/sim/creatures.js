// 2.11.0 生き物集め（釣り・虫取り）。地図で立った場所の地形（川・渓流・海・湖・池・田・森・山林…）と、地方・月・時間帯で、いる生き物が決まる。
// 取れた生き物は図鑑に記録され、その場でお金になる。生き物のデータは js/data/creatures.js（元は tools/creatures.txt）
// 流れ：gatherStart（何が掛かったかをホストが決める）→ 本人の画面でタイミングを合わせる → gatherEnd（成否をホストが決める）
(function () {
  const SIM = SGK.SIM, D = SGK.DATA, C = SIM.commands;
  const DIFF = (D.gatherDiff = { 簡単: { thr: 0.4, spd: 0.9, react: 1200 }, 普通: { thr: 0.6, spd: 1.3, react: 900 }, 難しい: { thr: 0.8, spd: 1.9, react: 650 } });
  const RARE = (D.rarityW = { ありふれた: 50, 見かける: 25, 珍しい: 12, 稀少: 4, '幻のような': 1 });
  /* 2.12.2 珍しさの段ごとの出やすさ（その場所にいる種類の数によらない）。先に段を決め、その段の中から1種類を選ぶ。
     その段の生き物がいない時は、よりありふれた段に下げる。珍しいものしかいない所では、たいてい何も掛からない */
  const TIERS = ['ありふれた', '見かける', '珍しい', '稀少', '幻のような'];
  const TIER_P = (D.rarityP = { ありふれた: 0.6, 見かける: 0.25, 珍しい: 0.1, 稀少: 0.04, '幻のような': 0.01 });
  SIM.gatherRoll = (w, list) => {
    let r = SIM.rand(w), t = 0; for (; t < TIERS.length - 1; t++) { r -= TIER_P[TIERS[t]]; if (r < 0) break; }
    const has = (i) => list.filter((x) => x.r === TIERS[i]);
    let i = t; while (i >= 0 && !has(i).length) i--;
    if (i < 0) { i = TIERS.findIndex((_, k) => has(k).length); if (i >= 2) return null; } // 珍しいものしかいない所は、その段が出た時だけ掛かる
    const L = has(i); return L[Math.floor(SIM.rand(w) * L.length)] || null;
  };
  const byId = (id) => (D.creatures || []).find((c) => c.id === id);
  SIM.creature = byId;
  const say = (pid, t) => SIM.say(pid, t);

  // ---- 地方（西から東へ 0九州・1中国四国・2近畿・3東海・4北陸/関東/甲信・5東北南部・6東北北部） ----
  SIM.regionOf = (x, y) => {
    const o = D.mapOrigin, lon = o.lon + x / 91, lat = o.lat - y / 111;
    if (lat < 34.0 && lon < 132.0) return { band: 0, name: '九州' };
    if (lon < 134.4) return { band: 1, name: lat < 34.3 ? '四国' : '中国' };
    if (lat < 34.4 && lon < 135.2) return { band: 1, name: '四国' };
    if (lon < 136.6) return { band: 2, name: '近畿' };
    if (lat < 35.25 && lon < 139.2) return { band: 3, name: '東海' };
    if (lat < 36.0 && lon < 138.6) return { band: 3, name: '東海' };
    if (lat > 38.3) return { band: 6, name: '東北' };
    if (lat > 36.9 && lon > 139.4) return { band: 5, name: '東北' };
    return { band: 4, name: lon < 138.6 ? '北陸' : '関東' };
  };
  const daypart = (w) => { const h = Math.floor(((D.start.minute + w.time.min) % 1440) / 60); return h >= 5 && h < 10 ? '朝' : h >= 10 && h < 16 ? '昼' : h >= 16 && h < 19 ? '夕' : '夜'; };
  const inMonth = (m, [a, b]) => (a <= b ? m >= a && m <= b : m >= a || m <= b);

  // ---- 立っている場所の地形タグ ----
  const T = () => D.terrain;
  const inPoly = (x, y, p) => SIM.pointInPoly(x, y, p);
  const lakeAt = (x, y) => { const t = T(); return (t.seas[0] && inPoly(x, y, t.seas[0])) || (t.lakes || []).some((k) => inPoly(x, y, k.pts)); }; // 琵琶湖は seas の先頭
  function distRiver(x, y) {
    let best = 1e9;
    for (const r of T().rivers || []) for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return best;
  }
  SIM.spotTags = (w, x, y) => {
    const pts = [[0, 0]]; for (const r of [1.5, 3]) for (let i = 0; i < 8; i++) pts.push([Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r]);
    let sea = 0, lake = 0, mount = 0, forest = 0, road = 0, plain = 0;
    for (const [dx, dy] of pts) {
      const px = x + dx, py = y + dy;
      if (SIM.isSea(px, py)) { if (lakeAt(px, py)) lake++; else sea++; continue; }
      const t = SIM.terrainAt(px, py); if (t === '山地') mount++; else if (t === '森') forest++; else if (t === '街道') road++; else plain++;
    }
    const c = SIM.terrainAt(x, y), river = distRiver(x, y) <= 1.8;
    const vill = (w.settlements || []).some((s) => (s.type === 'village' || s.type === 'town') && Math.hypot(s.x - x, s.y - y) <= 2.2);
    const tg = new Set();
    if (sea) { tg.add('海'); tg.add('海岸'); if (mount) tg.add('岩場'); if (river || vill) { tg.add('河口'); if (plain) tg.add('湿地'); } }
    if (lake) { tg.add('湖'); tg.add('池'); if (plain) tg.add('湿地'); }
    if (river || vill) tg.add('川');
    if (river) { tg.add('川辺'); if (c === '山地' || mount >= 3) tg.add('渓流'); }
    if (vill && plain) { tg.add('田'); tg.add('畑'); tg.add('水路'); }
    if (c === '森') tg.add('森'); if (c === '森' || c === '山地' || mount) tg.add('山林');
    if (c === '街道') { tg.add('平地'); if (mount) tg.add('山道'); } else if (c === '平地') tg.add('平地');
    if (c !== '海' && !sea && !lake) tg.delete('海岸');
    if (plain && c !== '森' && c !== '山地') tg.add('草地'); // 2.11.2 草の野原
    if (river || lake || sea) tg.add('水辺'); // 川・湖・池・海のほとり
    return tg;
  };
  // いま、ここでいる生き物（kind: 'f'魚 / 'b'虫）
  SIM.spotCreatures = (w, x, y, kind) => {
    const tags = SIM.spotTags(w, x, y), rg = SIM.regionOf(x, y), mon = SIM.month(w), dp = daypart(w);
    return (D.creatures || []).filter((c) => c.k === kind && c.pl.some((p) => tags.has(p)) && (c.rg ? rg.band >= c.rg[0] && rg.band <= c.rg[1] : c.only.includes(rg.name)) && inMonth(mon, c.m) && c.t.includes(dp));
  };

  // ---- 命令 ----
  C.gatherStart = (w, p, c) => {
    const kind = c.kind === 'bug' ? 'b' : 'f';
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    if (p.tx != null) return say(p.id, '歩いている最中は始められません。立ち止まってください');
    if (SIM.isSea(p.x, p.y)) return;
    const list = SIM.spotCreatures(w, p.x, p.y, kind), n = (p.gatN = (p.gatN || 0) + 1);
    p.gatLast = null;
    if (!list.length) { p.gat = null; p.gatLast = { n, ok: false, k: kind, txt: kind === 'f' ? 'ここでは、いまの時間に釣れる魚がいないようです' : 'ここでは、いまの時間に捕れる虫がいないようです' }; return; }
    const sp = SIM.gatherRoll(w, list);
    if (!sp) { p.gat = null; p.gatLast = { n, ok: false, k: kind, txt: kind === 'f' ? '何も掛からなかった…（ここには珍しい魚しかいないようです）' : '何も見つからなかった…（ここには珍しい虫しかいないようです）' }; return; }
    const u = (SIM.rand(w) + SIM.rand(w)) / 2, frac = u, size = kind === 'f' ? Math.round((sp.sz[0] + (sp.sz[1] - sp.sz[0]) * frac) * 10) / 10 : Math.round(sp.sz[0] + (sp.sz[1] - sp.sz[0]) * frac);
    p.gat = { n, k: kind, id: sp.id, size, frac, at: Date.now() };
  };
  const monthIdx = (w) => { const st = D.start; return Math.floor((st.minute + w.time.min) / 1440 / 30) + (st.month - 1); };
  C.gatherEnd = (w, p, c) => {
    const g = p.gat; if (!g || +c.n !== g.n) return; p.gat = null;
    const sp = byId(g.id), q = +c.q, dif = DIFF[sp.d] || DIFF.普通, verb = g.k === 'f' ? '釣る' : '捕る';
    if (!(q >= 0) || Date.now() - g.at > 120000) return void (p.gatLast = { n: g.n, ok: false, k: g.k, txt: 'やめました' });
    if (q < dif.thr) return void (p.gatLast = { n: g.n, ok: false, k: g.k, txt: g.k === 'f' ? '逃げられた…' : '逃げられた…', hint: sp.r === '幻のような' || sp.r === '稀少' ? '大物の気配がした' : '' });
    const z = (p.zukan = p.zukan || {}), e = (z[g.id] = z[g.id] || [0, 0]), isNew = e[0] === 0, rec = g.size > e[1];
    e[0]++; if (rec) e[1] = g.size;
    const gain = Math.max(1, Math.round(sp.p * (0.7 + 0.8 * g.frac))); p.money += gain;
    const mi = monthIdx(w), zm = (p.zmon = p.zmon || {}), mm = (zm[mi] = zm[mi] || { n: 0 }); mm.n++; // 大会のための月ごとの記録（一番大きかった物）
    const key = g.k === 'f' ? 'f' : 'b'; if (!mm[key] || g.frac > mm[key][2]) mm[key] = [g.id, g.size, Math.round(g.frac * 1000) / 1000]; for (const k of Object.keys(zm)) if (+k < mi - 3) delete zm[k];
    const unit = g.k === 'f' ? 'cm' : 'mm';
    p.gatLast = { n: g.n, ok: true, k: g.k, id: g.id, name: sp.n, size: g.size, unit, gain, isNew, rec: rec && !isNew, r: sp.r, txt: `${sp.n}（${g.size}${unit}）を${g.k === 'f' ? '釣った' : '捕まえた'}！` };
    say(p.id, `${sp.n}（${g.size}${unit}）を${g.k === 'f' ? '釣り' : '捕まえ'}ました！ +${SIM.money(gain)}${isNew ? '　図鑑に載りました' : ''}`);
  };

  // ---- 本人へ ----
  const cache = {};
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    let sp = null;
    if (p.tx == null && !SIM.isSea(p.x, p.y) && !p.busy) {
      const key = `${Math.round(p.x * 2)},${Math.round(p.y * 2)},${SIM.month(w)},${daypart(w)}`, ch = cache[pid];
      if (ch && ch.key === key) sp = ch.v; else { const tg = [...SIM.spotTags(w, p.x, p.y)]; sp = { f: SIM.spotCreatures(w, p.x, p.y, 'f').length, b: SIM.spotCreatures(w, p.x, p.y, 'b').length, tags: tg, rg: SIM.regionOf(p.x, p.y).name, dp: daypart(w) }; cache[pid] = { key, v: sp }; }
    }
    r.me.spot = sp; r.me.zukan = p.zukan || {};
    r.me.gat = p.gat ? { n: p.gat.n, k: p.gat.k, d: (byId(p.gat.id) || {}).d, r: (byId(p.gat.id) || {}).r, fr: p.gat.frac, bite: 1800 + ((p.gat.n * 7919) % 2600) } : null;
    r.me.gatLast = p.gatLast || null;
    return r;
  };

  // ---- 称号 ----
  if (SIM.defTitle) {
    const have = (p, k) => Object.keys(p.zukan || {}).filter((id) => id[0] === k && (p.zukan[id] || [0])[0] > 0).length, total = (k) => (D.creatures || []).filter((c) => c.k === k).length;
    SIM.defTitle({ id: 'tsuri5', name: '釣り人', desc: '釣りの楽しさを知った者。', cond: '魚を5種類釣る', order: 60, check: (w, p) => have(p, 'f') >= 5 });
    SIM.defTitle({ id: 'tsuriall', name: '釣り名人', desc: 'あらゆる魚を釣り上げた者。', cond: '魚の図鑑をすべて埋める', order: 61, check: (w, p) => have(p, 'f') >= total('f') && total('f') > 0 });
    SIM.defTitle({ id: 'mushi5', name: '虫愛づる者', desc: '虫を見る目を持つ者。', cond: '虫を5種類捕まえる', order: 62, check: (w, p) => have(p, 'b') >= 5 });
    SIM.defTitle({ id: 'mushiall', name: '虫博士', desc: 'あらゆる虫を捕らえた者。', cond: '虫の図鑑をすべて埋める', order: 63, check: (w, p) => have(p, 'b') >= total('b') && total('b') > 0 });
    SIM.defTitle({ id: 'maboroshi', name: '幻を捕えし者', desc: '幻のような生き物に出会った者。', cond: '「幻のような」珍しさの生き物を取る', order: 64, check: (w, p) => Object.keys(p.zukan || {}).some((id) => { const c = byId(id); return c && c.r === '幻のような' && p.zukan[id][0] > 0; }) });
  }
})();
