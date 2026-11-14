// 0.37.0 攻城戦のマップ：城ごとに山城か平城か。城の中（曲輪）の守り手は討たれにくく、堀・斜面は攻め手の足が鈍る
(function () {
  const SIM = SGK.SIM;
  // 山城か平城か：城のまわり（5km）に山地があれば山城、なければ城ごとに決まった割合（35%）で山城。データの s.ck があればそちらを使う
  SIM.castleKind = (s) => {
    if (!s) return 'hira';
    if (s.ck) return s.ck;
    if (s._ck) return s._ck;
    let m = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (SIM.terrainAt(s.x + i * 2.5, s.y + j * 2.5) === '山地') m++;
    let h = 0; for (const c of String(s.id)) h = (h * 31 + c.charCodeAt(0)) % 997; // 地図に山がなくても、この時代は山城が多い（城ごとに決まった値）
    const k = m >= 1 || h % 100 < 35 ? 'yama' : 'hira';
    Object.defineProperty(s, '_ck', { value: k, enumerable: false, writable: true }); // セーブには入れない
    return k;
  };
  SIM.castleLayout = (w, b, s, cside) => {
    const F = SIM.FIELD, ck = SIM.castleKind(s), cx = cside === 'B' ? F.bx + 40 : F.ax - 40, cy = F.h / 2;
    const far = ck === 'yama' ? 190 : 120;
    b.ter = (b.ter || []).filter((t) => Math.hypot(t.x - cx, t.y - cy) > far + t.r * 0.5);
    let kr;
    if (ck === 'yama') {
      kr = 58;
      b.ter.push({ k: 'h', x: cx, y: cy, r: 160 }); // 山
      b.ter.push({ k: 's', x: cx, y: cy, r: 125, ri: kr + 2 }); // 険しい斜面
      b.ter.push({ k: 'f', x: cx, y: cy - 175, r: 34 }, { k: 'f', x: cx, y: cy + 175, r: 34 });
    } else {
      kr = 55;
      b.ter.push({ k: 'm', x: cx, y: cy, r: kr + 22, ri: kr + 4 }); // 堀
    }
    b.ter.push({ k: 'k', x: cx, y: cy, r: kr }); // 曲輪
    b.cside = cside; b.ck = ck; b.kf = SIM.kaiF ? SIM.kaiF(s) : 1; b.cx = cx; b.cy = cy; // 0.40.0 改築の段階で守りの強さが変わる
    // 守り手を曲輪の中に並べる（城兵は動かず守る。弓・鉄砲は塀の上から少し遠くまで届く）
    const defs = b.units.filter((u) => u.side === cside && (cside === 'B' || u.gar));
    const front = cside === 'B' ? -1 : 1;
    defs.forEach((u, i) => {
      const T = SIM.TROOPS[u.type], row = T.ranged ? 0 : 1, k = defs.filter((x, j) => j < i && !!SIM.TROOPS[x.type].ranged === !!T.ranged).length;
      const n = defs.filter((x) => !!SIM.TROOPS[x.type].ranged === !!T.ranged).length;
      u.x = cx + front * (row ? kr * 0.15 : kr * 0.55); u.y = cy + (k - (n - 1) / 2) * Math.min(18, (kr * 1.5) / Math.max(1, n));
      u.order = 'hold'; u.f = cside === 'B' ? Math.PI : 0;
      if (T.ranged) u.ra = (u.ra || 0) + 4;
    });
    if (cside === 'A') for (const u of b.units) if (u.side === 'A' && !u.gar) { u.x = cx + kr * 0.45 + (u.type === 'hero' ? -6 : 0); u.y = Math.max(cy - kr * 0.8, Math.min(cy + kr * 0.8, u.y)); }
  };
})();
