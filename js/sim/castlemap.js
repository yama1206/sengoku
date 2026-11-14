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
  /* 1.6.25 城の塀（当たり判定つき）。曲輪ごとに同じ中心の輪（門＝切れ目）と、輪の間を仕切る塀。地形 ter から毎回同じ形に作る（3D・2D・動きで共通）
     本丸の大きな曲輪：外の塀（大手門は正面から少しずらす・搦手門は横）→ 大手門のすぐ内に枡形の塀 → 片側を仕切る塀 → 本丸の塀（門は奥側）。
     小さな曲輪（二の丸など）：塀1重、門1つ */
  const PI = Math.PI, WT = 0.8, nrm = (a) => { a %= 2 * PI; return a > PI ? a - 2 * PI : a < -PI ? a + 2 * PI : a; };
  const CWC = new WeakMap();
  SIM.WALL_T = WT;
  SIM.castleWalls = (ter) => {
    if (!ter || !ter.length) return null;
    let c = CWC.get(ter); if (c !== undefined) return c;
    const F = SIM.FIELD, out = [], hg = (w, r) => w / 2 / r;
    for (const t of ter) if (t.k === 'k') {
      const aF = t.x > F.w / 2 ? PI : 0, R = t.r;
      if (R >= 45) {
        const ri = Math.round(R * 0.4), rm = R - 7, gA = aF + 0.35;
        out.push({ x: t.x, y: t.y, R, main: 1, rings: [
          { r: ri, gaps: [[aF + PI, hg(7, ri)]] }, // 本丸（門は奥）
          { r: rm, gaps: [[gA + PI, PI - hg(18, rm)]] }, // 枡形（大手門の内側だけ塀）
          { r: R, gaps: [[gA, hg(7, R)], [aF - 0.35 * PI, hg(6, R)]] } // 外の塀（大手門・搦手門）
        ], rad: [{ a: aF - PI / 2, r0: ri, r1: R }] }); // 仕切りの塀（片側をふさいで、本丸の門まで遠回りさせる）
      } else out.push({ x: t.x, y: t.y, R, rings: [{ r: R, gaps: [[aF + 0.3, hg(6, R)]] }], rad: [] });
    }
    c = out.length ? out : null; CWC.set(ter, c); return c;
  };
  const inGap = (q, a, m) => q.gaps.some(([ga, gw]) => Math.abs(nrm(a - ga)) < gw - m / q.r);
  SIM.wallInGap = inGap;
  // 塀にめり込んだら押し戻す（rad：体の半径）
  SIM.wallPush = (cw, s, rad) => {
    for (const c of cw) {
      let dx = s.x - c.x, dy = s.y - c.y, d = Math.hypot(dx, dy) || 0.01;
      if (d > c.R + 3) continue;
      const m = rad + WT;
      for (const q of c.rings) if (Math.abs(d - q.r) < m && !inGap(q, Math.atan2(dy, dx), rad)) {
        const nr = d < q.r ? q.r - m : q.r + m; s.x = c.x + dx / d * nr; s.y = c.y + dy / d * nr; dx = s.x - c.x; dy = s.y - c.y; d = nr;
      }
      for (const w of c.rad) {
        const ux = Math.cos(w.a), uy = Math.sin(w.a), along = dx * ux + dy * uy; if (along < w.r0 - m || along > w.r1 + m) continue;
        const cl = Math.max(w.r0, Math.min(w.r1, along)), px = dx - ux * cl, py = dy - uy * cl, pd = Math.hypot(px, py);
        if (pd < m) { const k = pd < 0.01 ? 1 : m / pd; s.x = c.x + ux * cl + (pd < 0.01 ? -uy * m : px * k); s.y = c.y + uy * cl + (pd < 0.01 ? ux * m : py * k); dx = s.x - c.x; dy = s.y - c.y; }
      }
    }
  };
  // まっすぐ行くと塀に当たるか
  const blocked = (c, x0, y0, x1, y1) => {
    const ax = x0 - c.x, ay = y0 - c.y, vx = x1 - x0, vy = y1 - y0, A = vx * vx + vy * vy; if (A < 1e-6) return false;
    for (const q of c.rings) {
      const B = 2 * (ax * vx + ay * vy), C = ax * ax + ay * ay - q.r * q.r, D = B * B - 4 * A * C; if (D < 0) continue;
      for (const sg of [-1, 1]) { const t = (-B + sg * Math.sqrt(D)) / (2 * A); if (t > 0.02 && t < 0.98 && !inGap(q, Math.atan2(ay + vy * t, ax + vx * t), 0.6)) return true; }
    }
    for (const w of c.rad) {
      const ux = Math.cos(w.a), uy = Math.sin(w.a), ex = ux * (w.r1 - w.r0), ey = uy * (w.r1 - w.r0), sx = ux * w.r0 - ax, sy = uy * w.r0 - ay, den = vx * ey - vy * ex;
      if (Math.abs(den) < 1e-6) continue; const t = (sx * ey - sy * ex) / den, u = (sx * vy - sy * vx) / den;
      if (t > 0 && t < 1 && u > -0.05 && u < 1.05) return true;
    }
    return false;
  };
  // 塀を回り込む行き先（門を通る）。変わらなければそのまま返す
  SIM.wallWay = (cw, s, gx, gy) => {
    for (const c of cw) {
      const sx = s.x - c.x, sy = s.y - c.y, ds = Math.hypot(sx, sy), dg = Math.hypot(gx - c.x, gy - c.y);
      if (ds > c.R + 6 && dg > c.R + 6 && !blocked(c, s.x, s.y, gx, gy)) continue;
      const band = (r) => c.rings.filter((q) => q.r < r).length, bs = band(ds), bg = band(dg), as = Math.atan2(sy, sx);
      const lo = bs ? c.rings[bs - 1].r + 2.2 : 0, hi = bs < c.rings.length ? c.rings[bs].r - 2.2 : 1e9;
      const radIn = c.rad.filter((w) => ds > w.r0 && ds < w.r1);
      const pm = (x) => ((x % (2 * PI)) + 2 * PI) % (2 * PI), wallBetween = (a0, a1, dir) => radIn.some((w) => { const o = pm((w.a - a0) * dir); return o > 0.001 && o < pm((a1 - a0) * dir); });
      const orbit = (ta) => {
        let diff = nrm(ta - as), dir = diff >= 0 ? 1 : -1;
        if (wallBetween(as, ta, dir)) { dir = -dir; diff = 9; }
        const rr = Math.max(lo, Math.min(hi, Math.max(ds, bs === c.rings.length ? c.R + 3 : 0))), st = Math.min(Math.abs(diff), 10 / Math.max(rr, 5)), a = as + dir * st;
        return [c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr];
      };
      if (bs === bg) { if (!blocked(c, s.x, s.y, gx, gy)) continue; return orbit(Math.atan2(gy - c.y, gx - c.x)); }
      const q = c.rings[bs < bg ? bs : bs - 1], out = bs < bg ? 1 : -1;
      let best = null, bc = 1e9;
      for (const [ga, gw] of q.gaps) {
        const m = Math.max(0, gw - 3.5 / q.r), pa = ga + Math.max(-m, Math.min(m, nrm(as - ga)));
        let dd = Math.abs(nrm(pa - as)); if (wallBetween(as, pa, nrm(pa - as) >= 0 ? 1 : -1)) dd = 2 * PI - dd;
        const px = c.x + Math.cos(pa) * q.r, py = c.y + Math.sin(pa) * q.r, cost = dd * Math.max(ds, 5) + Math.hypot(gx - px, gy - py);
        if (cost < bc) { bc = cost; best = pa; }
      }
      if (best == null) continue;
      const px = c.x + Math.cos(best) * q.r, py = c.y + Math.sin(best) * q.r;
      if (Math.hypot(px - s.x, py - s.y) < 2.5) return [c.x + Math.cos(best) * (q.r + out * 4), c.y + Math.sin(best) * (q.r + out * 4)];
      // 門の手前（同じ側に 3m）をめざす
      const fx = c.x + Math.cos(best) * (q.r - out * 3), fy = c.y + Math.sin(best) * (q.r - out * 3);
      if (Math.hypot(fx - s.x, fy - s.y) < 2) return [px, py];
      if (!blocked(c, s.x, s.y, fx, fy)) return [fx, fy];
      return orbit(best);
    }
    return null;
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
      u.x = cx + front * (row ? kr * 0.25 : kr * 0.55); u.y = cy + (k - (n - 1) / 2) * Math.min(18, (kr * 1.5) / Math.max(1, n));
      u.order = 'hold'; u.f = cside === 'B' ? Math.PI : 0;
      if (T.ranged) u.ra = (u.ra || 0) + 4;
    });
    if (cside === 'A') for (const u of b.units) if (u.side === 'A' && !u.gar) { u.x = cx + kr * 0.45 + (u.type === 'hero' ? -6 : 0); u.y = Math.max(cy - kr * 0.5, Math.min(cy + kr * 0.5, u.y)); }
  };
})();
