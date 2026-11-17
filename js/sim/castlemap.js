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
  SIM._ringWalls = (ter) => /* 2.12.0 今は丸い城をパーツに直す時だけ使う（nawa.js） */ {
    if (!ter || !ter.length) return null;
    let c = CWC.get(ter); if (c !== undefined) return c;
    const F = SIM.FIELD, out = [], hg = (w, r) => w / 2 / r;
    let ci = 0;
    for (const t of ter) if (t.k === 'k') {
      const G = (k) => ci + k; ci++; /* 1.6.38 門のid（閉じた門は破るまで攻め手は通れない） */
      const aF = t.x > F.w / 2 ? PI : 0, R = t.r;
      if (R >= 45) {
        const ri = Math.round(R * 0.4), rm = R - 7, gA = aF + 0.35;
        const o = { x: t.x, y: t.y, R, main: 1, rings: [
          { r: ri, gaps: [[aF + PI, hg(7, ri), G('h')]] }, // 本丸（門は奥）
          { r: rm, gaps: [[gA + PI, PI - hg(18, rm)]] }, // 枡形（大手門の内側だけ塀）
          { r: R, gaps: [[gA, hg(7, R), G('o')], [aF - 0.35 * PI, hg(6, R), G('k')]] } // 外の塀（大手門・搦手門）
        ], rad: [{ a: aF - PI / 2, r0: ri, r1: R }], aF, gA }; // 仕切りの塀（片側をふさいで、本丸の門まで遠回りさせる）
        /* 1.6.37 堀は通れない（w：堀の幅の半分）。大手門・搦手門の前だけ土橋（切れ目）で渡れる */
        const mt = ter.find((m) => m.k === 'm' && Math.abs(m.x - t.x) < 1 && Math.abs(m.y - t.y) < 1);
        if (mt) { const mr = (mt.r + (mt.ri || R)) / 2; o.rings.push({ r: mr, w: (mt.r - (mt.ri || R)) / 2, moat: 1, gaps: [[gA, hg(8, mr)], [aF - 0.35 * PI, hg(8, mr)]] }); o.RO = mt.r; }
        out.push(o);
      } else out.push({ x: t.x, y: t.y, R, rings: [{ r: R, gaps: [[aF + 0.3, hg(6, R), G('s')]] }], rad: [], aF });
    }
    c = out.length ? out : null; CWC.set(ter, c); return c;
  };
  /* 1.6.38 門の強さと名前。当たり判定・道さがしは 2.12.0 から nawa.js（城をパーツで持つ） */
  SIM.GATE_HP = { o: 900, k: 750, h: 600, s: 600 };
  SIM.GATE_NAME = { o: '大手門', k: '搦手門', h: '本丸の門', s: '門' };
  /* 1.6.39 城の門の傷み（s.gate：1＝無傷、0＝壊れている）。忍びの破壊工作で減り、普請の修理で戻る */
  SIM.gateF = (s) => (s && s.gate != null ? Math.max(0, Math.min(1, s.gate)) : 1);
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
      b.ter.push({ k: 'm', x: cx, y: cy, r: kr + 22, ri: kr + 6 }); // 堀
    }
    b.ter.push({ k: 'k', x: cx, y: cy, r: kr }); // 曲輪
    b.cside = cside; b.ck = ck; b.kf = SIM.kaiF ? SIM.kaiF(s) : 1; b.gf = SIM.gateF(s); b.cx = cx; b.cy = cy; // 0.40.0 改築の段階で守りの強さが変わる
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
