// 2.24.0 忍びの任務：3Dの潜入（後ろからの三人称）。見張りに見つからずに目当ての所で工作し、入ってきた所（城下の南の端）へ戻れば成功。見つかったらその場で失敗
// 舞台は城の種類（平城・山城・水城）と改修の段階で変わり、昼夜で見張りの目の届く距離が変わる。
// 石垣・梯子を登り、鉤縄で軒に上がって塀や屋根の上を歩ける。堀は泳げる。草むらでしゃがめば隠れられる。
// 後ろから当て身（気絶）・暗殺、倒した見張りは担いで隠す。煙玉・撒菱・吹き矢。
// 体は兵のモデル（soldier_t*_rig.glb）と動き（soldier_anims.glb）。しゃがむ・登る・担ぐ・泳ぐは、いまは骨を手で曲げて作っている（あとで Mixamo の動きに差しかえる）
(function () {
  const SGK = window.SGK;
  const N3 = (SGK.NINJA3D = { on: false, failed: false });
  let T = window.THREE;
  let CO = null; // 2.41.0 協力任務：{ lead, me, leader, members, names, send, ghosts, ... }。null なら1人用
  const r2 = (v) => Math.round(v * 100) / 100;
  N3.can = () => { T = window.THREE; const A = SGK.RENDER && SGK.RENDER.act3d; return !!(T && T.GLTFLoader && !N3.failed && !(A && A.failed)); };

  // ---- 決まりの数 ----
  const W = 120, D = 140, GC = 2, GX = W / GC, GZ = D / GC; // 舞台の広さ（m）と地面の升（2m）
  const STEP = 0.6, PR = 0.35, GRAV = 22, WATER_Y = -0.45, SWIM_Y = -1.55;
  const SPD = { crouch: 1.7, walk: 2.7, run: 5.6, carry: 1.9, swim: 1.5 };
  const JOB = {
    sabo: { tg: '兵糧蔵', hold: 2.4, verb: '火を付ける' }, raid: { tg: '武器蔵', hold: 2.8, verb: '打ち壊す' }, gate: { tg: '城門', hold: 2.4, verb: '細工する' },
    rumor: { tg: '町人', hold: 1.2, verb: '噂を流す' }, hurt: { tg: '寝所の武将', hold: 1.6, verb: '手傷を負わせる' }, steal: { tg: '', hold: 1.6, verb: '盗み出す' },
  };
  const STEAL = { mitsu: { name: '密書', at: '書院' }, ezu: { name: '城の絵図', at: '櫓の上' }, kin: { name: '軍資金', at: '金蔵' } };
  const TOOLS = [['kemuri', '煙玉', '1'], ['makibishi', '撒菱', '2'], ['fukiya', '吹き矢', '3']];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, k) => a + (b - a) * k;
  const angD = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function rngOf(seed) { let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); let s = h >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  // =====================================================================
  // 舞台を作る（形と当たり判定）。北が z=0（城の奥）、南が z=D（城下）
  // =====================================================================
  function makeLevel(job, d, R) {
    const L = { base: new Float32Array(GX * GZ), wet: new Uint8Array(GX * GZ), gk: new Uint8Array(GX * GZ), solids: [], climbs: [], grass: [], lamps: [], trees: [], targets: [], posts: [], deco: [], ladders: [], holds: [] };
    const ck = d.ck || 'hira', kai = clamp(d.kai || 0, 0, 5), yama = ck === 'yama', mizu = ck === 'mizu';
    const OB = { x0: 12, z0: 10, x1: 108, z1: 102 }, IB = { x0: 34, z0: 20, x1: 86, z1: 58 }, CX = W / 2;
    const hO = yama ? 3 : 0, hI = yama ? 7 : 0, WALLH = 4.6, STONE = 2.8, WT = 1.4, hw = WT / 2;
    Object.assign(L, { ck, kai, yama, mizu, OB, IB, hO, hI, CX });
    const setR = (x0, z0, x1, z1, h, wet, gk) => { for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const cx = (i + 0.5) * GC, cz = (j + 0.5) * GC; if (cx > x0 && cx < x1 && cz > z0 && cz < z1) { L.base[j * GX + i] = h; L.wet[j * GX + i] = wet ? 1 : 0; L.gk[j * GX + i] = gk; } } };
    setR(0, 0, W, D, 0, 0, 0);
    if (!yama) { const m = mizu ? [4, 2, 116, 110] : [6, 4, 114, 108]; setR(m[0], m[1], m[2], m[3], -1.8, 1, 2); }
    setR(OB.x0, OB.z0, OB.x1, OB.z1, hO, 0, 1);
    if (mizu) setR(30, 16, 90, 62, -1.8, 1, 2);
    setR(IB.x0, IB.z0, IB.x1, IB.z1, hI, 0, 1);
    setR(0, 112, W, D, 0, 0, 1); // 城下の通り
    const solid = (o) => { L.solids.push(o); return o; };
    const box = (x0, z0, x1, z1, y0, top, mat, ex) => solid(Object.assign({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, top, mat }, ex || {}));
    const roofTop = (s, x, z) => { const r = s.roof; if (r.ax === 'x') { const m = (s.z0 + s.z1) / 2, h = (s.z1 - s.z0) / 2; return r.he + r.rise * Math.max(0, 1 - Math.abs(z - m) / h); } const m = (s.x0 + s.x1) / 2, h = (s.x1 - s.x0) / 2; return r.he + r.rise * Math.max(0, 1 - Math.abs(x - m) / h); };
    const bldg = (x0, z0, x1, z1, base, he, mat, ex) => { const ax = x1 - x0 >= z1 - z0 ? 'x' : 'z', rise = Math.min(x1 - x0, z1 - z0) * 0.3; return box(x0, z0, x1, z1, base, base + he + rise, mat, Object.assign({ roof: { ax, he: base + he, rise }, topAt: roofTop }, ex || {})); };
    const rampTop = (s, x, z) => { const r = s.ramp; const u = r.ax === 'z' ? (z - s.z0) / (s.z1 - s.z0) : (x - s.x0) / (s.x1 - s.x0); return lerp(r.h0, r.h1, clamp(u, 0, 1)); };
    const ramp = (x0, z0, x1, z1, ax, h0, h1) => box(x0, z0, x1, z1, -0.5, Math.max(h0, h1), 'ramp', { ramp: { ax, h0, h1 }, topAt: rampTop });
    // 登れる所（B＝下の立つ所、U＝上の立つ所）。y はあとで決める
    const climb = (kind, bx, bz, ux, uz, uy, face) => L.climbs.push({ kind, B: { x: bx, z: bz, y: 0 }, U: { x: ux, z: uz, y: uy }, face });
    // 塀（石垣＋白壁）。ax＝向き、c＝中心線、a0〜a1＝長さ、gaps＝門の所、out＝外の向き（+1/-1）
    function wallSeg(ax, c, a0, a1, base, gaps, out, inner) {
      const top = base + WALLH; let cur = a0; const pcs = [];
      for (const [g0, g1] of gaps || []) { pcs.push([cur, g0]); cur = g1; } pcs.push([cur, a1]);
      for (const [p0, p1] of pcs) {
        if (p1 - p0 < 0.5) continue;
        if (ax === 'x') box(p0, c - hw, p1, c + hw, base - (yama ? 0 : 0.2), top, 'wall', { stoneH: STONE }); else box(c - hw, p0, c + hw, p1, base - (yama ? 0 : 0.2), top, 'wall', { stoneH: STONE });
        const n = Math.max(1, Math.floor((p1 - p0) / 15));
        for (let k = 1; k <= n; k++) {
          const a = p0 + (p1 - p0) * k / (n + 1), U = ax === 'x' ? [a, c] : [c, a];
          const pin = ax === 'x' ? [a, c - out * (hw + 0.5)] : [c - out * (hw + 0.5), a], pout = ax === 'x' ? [a, c + out * (hw + 0.45)] : [c + out * (hw + 0.45), a];
          if (k % 2 === 1 || !inner) climb('ladder', pin[0], pin[1], U[0], U[1], top, ax === 'x' ? (out > 0 ? 0 : Math.PI) : (out > 0 ? Math.PI / 2 : -Math.PI / 2));
          climb('ishigaki', pout[0], pout[1], U[0], U[1], top, ax === 'x' ? (out > 0 ? Math.PI : 0) : (out > 0 ? -Math.PI / 2 : Math.PI / 2));
        }
      }
    }
    function wallRect(r, base, gateW, inner) {
      const xa = r.x0 + hw, xb = r.x1 - hw, za = r.z0 + hw, zb = r.z1 - hw;
      wallSeg('x', za, r.x0, r.x1, base, [], -1, inner);
      wallSeg('x', zb, r.x0, r.x1, base, [[CX - gateW / 2, CX + gateW / 2]], 1, inner);
      wallSeg('z', xa, za + hw, zb - hw, base, [], -1, inner);
      wallSeg('z', xb, za + hw, zb - hw, base, [], 1, inner);
      // 門：柱と、上の櫓（上は塀と同じ高さで歩ける）
      const top = base + WALLH;
      box(CX - gateW / 2, zb - hw - 0.2, CX - gateW / 2 + 1, zb + hw + 0.2, base, top - 1, 'wood');
      box(CX + gateW / 2 - 1, zb - hw - 0.2, CX + gateW / 2, zb + hw + 0.2, base, top - 1, 'wood');
      box(CX - gateW / 2, zb - hw - 0.3, CX + gateW / 2, zb + hw + 0.3, base + 3.5, top, 'plaster', { gate: 1 });
      L.deco.push({ k: 'gateRoof', x0: CX - gateW / 2 - 0.6, x1: CX + gateW / 2 + 0.6, z0: zb - hw - 0.9, z1: zb + hw + 0.9, y: top });
      L.deco.push({ k: 'doors', x: CX, z: zb, w: gateW - 2, y: base, h: 3.5 });
      return { x: CX, z: zb, top };
    }
    // ---- 外郭と本丸 ----
    const og = wallRect(OB, hO, 6, false), ig = wallRect(IB, hI, 5, true);
    L.og = og; L.ig = ig;
    if (!yama) {
      box(CX - 2.5, OB.z1, CX + 2.5, mizu ? 110 : 108, -0.3, 0.05, 'bridge', { bridge: 1 });
      if (mizu) box(CX - 2.2, IB.z1, CX + 2.2, 62, -0.3, 0.05, 'bridge', { bridge: 1 });
    } else {
      ramp(CX - 2.5, OB.z1, CX + 2.5, 112, 'z', hO, 0);
      ramp(CX - 2.2, IB.z1, CX + 2.2, 66, 'z', hI, hO);
    }
    // ---- 建物 ----
    const kura = (x0, z0, x1, z1, base, name) => { const s = bldg(x0, z0, x1, z1, base, 4.2, 'kura', { name }); eave(s); return s; };
    function eave(s) { // 軒：鉤縄で長い辺の真ん中から屋根へ
      const ax = s.roof.ax, mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2;
      if (ax === 'x') { climb('noki', mx, s.z1 + 0.6, mx, s.z1 - 0.9, 0, Math.PI); climb('noki', mx, s.z0 - 0.6, mx, s.z0 + 0.9, 0, 0); }
      else { climb('noki', s.x1 + 0.6, mz, s.x1 - 0.9, mz, 0, -Math.PI / 2); climb('noki', s.x0 - 0.6, mz, s.x0 + 0.9, mz, 0, Math.PI / 2); }
    }
    const xW = mizu ? 18 : 17, xE = mizu ? 96 : 96;
    const hyoro = kura(xW, 30, xW + 7, 41, hO, '兵糧蔵'), buki = kura(xE, 30, xE + 7, 41, hO, '武器蔵');
    const kin = kura(IB.x0 + 4, 44, IB.x0 + 11, 52, hI, '金蔵');
    { const s = bldg(18, 74, 36, 80, hO, 3, 'nagaya'); eave(s); }
    if (kai >= 1) { const s = bldg(84, 74, 102, 80, hO, 3, 'nagaya'); eave(s); }
    if (kai >= 2) { const s = bldg(20, 86, 34, 92, hO, 3, 'nagaya'); eave(s); kura(88, 86, 95, 93, hO, '蔵'); }
    if (kai >= 4) { kura(18, 56, 25, 64, hO, '蔵'); kura(96, 56, 103, 64, hO, '蔵'); }
    // 御殿と、東の寝所（書院）。寝所は南と東が開いている
    const gx0 = 48, gx1 = 68, gz0 = 26, gz1 = 38;
    { const s = bldg(gx0, gz0, gx1, gz1, hI, 4, 'goten'); eave(s); }
    const pv = { x0: gx1, z0: 28, x1: gx1 + 8, z1: 37 };
    box(pv.x0, pv.z0, pv.x1, pv.z1, hI - 0.4, hI + 0.5, 'floor', { pav: 1 });
    box(pv.x0, pv.z0, pv.x1, pv.z0 + 0.25, hI + 0.5, hI + 3.2, 'shoji');
    for (const [x, z] of [[pv.x1 - 0.25, pv.z1 - 0.25], [pv.x1 - 0.25, pv.z0 + 0.3], [pv.x0 + 0.25, pv.z1 - 0.25]]) box(x - 0.13, z - 0.13, x + 0.13, z + 0.13, hI + 0.5, hI + 3.2, 'wood');
    { const s = box(pv.x0 - 0.2, pv.z0 - 0.7, pv.x1 + 0.7, pv.z1 + 0.7, hI + 3.2, hI + 3.2 + 1.6, 'roofOnly', { roof: { ax: 'z', he: hI + 3.2, rise: 1.6 }, topAt: roofTop }); s.roof.ax = 'x'; climb('noki', (pv.x0 + pv.x1) / 2, pv.z1 + 1.4, (pv.x0 + pv.x1) / 2, pv.z1 - 0.4, 0, Math.PI); }
    L.pv = pv;
    // 櫓：本丸の南東（絵図はここの上）、改修が進むと外郭の隅にも
    function yagura(x0, z0, base, inX, inZ) {
      const top = base + 7; box(x0, z0, x0 + 6, z0 + 6, base, top, 'yagura');
      box(x0 - 0.6, z0 - 0.6, x0 + 6.6, z0 + 6.6, top + 2.3, top + 3.8, 'roofOnly', { roof: { ax: 'x', he: top + 2.3, rise: 1.5 }, topAt: roofTop, hip: 1 });
      for (const [x, z] of [[x0 + 0.2, z0 + 0.2], [x0 + 5.8, z0 + 0.2], [x0 + 0.2, z0 + 5.8], [x0 + 5.8, z0 + 5.8]]) L.deco.push({ k: 'post', x, z, y0: top, y1: top + 2.3 });
      const bx = x0 + 3 + inX * 3.5, bz = z0 + 3 + inZ * 3.5;
      climb('ladder', bx, bz, x0 + 3 + inX * 1.6, z0 + 3 + inZ * 1.6, top, Math.atan2(-inX, -inZ));
      return { x: x0 + 3, z: z0 + 3, y: top };
    }
    const yg = yagura(IB.x1 - 1.4 - 6.2, IB.z1 - 1.4 - 6.2, hI, -1, 0);
    L.yg = yg;
    const outerYg = [];
    if (kai >= 2) { outerYg.push(yagura(OB.x0 + 1.6, OB.z0 + 1.6, hO, 1, 0), yagura(OB.x1 - 7.6, OB.z0 + 1.6, hO, -1, 0)); }
    if (kai >= 3) { outerYg.push(yagura(OB.x0 + 1.6, OB.z1 - 7.6, hO, 1, 0), yagura(OB.x1 - 7.6, OB.z1 - 7.6, hO, -1, 0)); }
    if (kai >= 3) { box(37, 23, 46, 31, hI, hI + 14, 'tenshu', { tiers: Math.min(5, kai) }); }
    // ---- 城下の町家 ----
    for (const [z0, z1] of [[114, 120], [130, 136]]) {
      let x = 2 + R() * 2;
      while (x < W - 8) { const w = 6 + R() * 3; if (!(z0 === 130 && x + w > CX - 9 && x < CX + 9) && !(x + w > CX - 4 && x < CX + 4)) { const s = bldg(x, z0, x + w, z1, 0, 2.8, 'machiya'); if (R() < 0.5) eave(s); } x += w + 1.6 + R() * 2.5; }
    }
    // ---- 木・草むら・灯籠 ----
    const tryPut = (x, z, r) => !L.solids.some((s) => x > s.x0 - r && x < s.x1 + r && z > s.z0 - r && z < s.z1 + r) && !wetAt0(L, x, z) && Math.abs(x - CX) > 4.5;
    const nTree = 10 + kai * 2;
    for (let i = 0, k = 0; i < 200 && k < nTree; i++) { const x = 4 + R() * (W - 8), z = 4 + R() * 106; if (inRect(x, z, IB, 1) && !(R() < 0.35)) continue; if (tryPut(x, z, 1.8)) { L.trees.push({ x, z, s: 0.8 + R() * 0.5 }); box(x - 0.3, z - 0.3, x + 0.3, z + 0.3, baseAt0(L, x, z) - 0.2, baseAt0(L, x, z) + 3, 'trunk', { tree: 1 }); k++; } }
    const nGr = 12 + Math.round(R() * 4);
    for (let i = 0, k = 0; i < 400 && k < nGr; i++) {
      const z = 6 + R() * 130, x = 4 + R() * (W - 8), r = 2 + R() * 2.2;
      if (z > 132 || (z > 100 && z < 112 && Math.abs(x - CX) < 8)) continue;
      if (tryPut(x, z, r * 0.7)) { L.grass.push({ x, z, r }); k++; }
    }
    const lamp = (x, z) => { L.lamps.push({ x, z, r: 6 }); box(x - 0.25, z - 0.25, x + 0.25, z + 0.25, baseAt0(L, x, z) - 0.1, baseAt0(L, x, z) + 1.4, 'lamp'); };
    { const zl = yama ? OB.z1 + 3 : mizu ? 111.2 : 109.4; lamp(CX - 4.2, zl); lamp(CX + 4.2, zl); } lamp(CX - 4, OB.z1 - 4); lamp(CX + 4, OB.z1 - 4);
    lamp(CX - 3.5, IB.z1 + (mizu ? 5 : 2.5)); lamp(CX + 3.5, IB.z1 + (mizu ? 5 : 2.5));
    lamp(pv.x1 + 1.5, pv.z1 + 1.2); lamp(CX + 4, 80);
    lamp(CX - 12, 125); lamp(CX + 14, 125);
    // ---- 目当て ----
    const T0 = (o) => { L.targets.push(Object.assign({ done: false, r: 1.7 }, o)); };
    const doorOf = (s) => ({ x: (s.x0 + s.x1) / 2, z: s.z1 + 0.9, y: baseAt0(L, (s.x0 + s.x1) / 2, s.z1 + 0.9) });
    if (job.k === 'sabo') T0(Object.assign({ name: '兵糧蔵', s: hyoro }, doorOf(hyoro)));
    if (job.k === 'raid') T0(Object.assign({ name: '武器蔵', s: buki }, doorOf(buki)));
    if (job.k === 'gate') T0({ name: '城門（内側）', x: CX + 1.6, z: OB.z1 - hw * 2 - 0.9, y: hO });
    if (job.k === 'hurt') { T0({ name: job.whoName || '城の武将', x: pv.x0 + 4, z: pv.z0 + 3.5, y: hI + 0.5, gen: true, r: 1.9 }); }
    if (job.k === 'steal') {
      if (job.sk === 'ezu') T0({ name: '城の絵図', x: yg.x, z: yg.z, y: yg.y, chest: 1 });
      else if (job.sk === 'kin') T0(Object.assign({ name: '軍資金', s: kin }, doorOf(kin)));
      else T0({ name: '密書', x: pv.x0 + 4.5, z: pv.z0 + 1.6, y: hI + 0.5, chest: 1 });
    }
    if (job.k === 'hurt') L.posts.push({ x: pv.x0 + 4, z: pv.z1 + 1.6, yaw: 0, rig: 't3', wep: 'katana' }, { x: pv.x1 + 1.6, z: pv.z0 + 4.5, yaw: Math.PI / 2, rig: 't3', wep: 'katana' });
    L.exit = { x0: CX - 7, z0: 133, x1: CX + 7, z1: D };
    L.start = { x: CX, z: 138 };
    // 見張りの持ち場
    const outY = yama ? 0 : 0;
    L.posts.push({ x: CX - 1.7, z: OB.z1 + (yama ? 3 : 1.6), yaw: 0, y: yama ? undefined : 0.05 }, { x: CX + 1.7, z: OB.z1 + (yama ? 3 : 1.6), yaw: 0, y: yama ? undefined : 0.05 });
    L.posts.push({ x: CX + 2, z: IB.z1 + (mizu ? 5 : 1.8), yaw: 0 });
    if (!mizu) L.posts.push({ x: OB.x0 + 9, z: OB.z1 - 9, yaw: -0.8 }, { x: OB.x1 - 9, z: OB.z1 - 9, yaw: 0.8 }, { x: OB.x0 + 9, z: OB.z0 + 9, yaw: 2.4 }, { x: OB.x1 - 9, z: OB.z0 + 9, yaw: -2.4 }); // 2.42.0 外曲輪の四隅にも見張り
    if (kai >= 2) L.posts.push({ x: yg.x, z: yg.z, y: yg.y, yaw: Math.PI * 0.75 });
    void outY;
    return L;
  }
  const inRect = (x, z, r, m) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  const cellOf = (x, z) => clamp(Math.floor(z / GC), 0, GZ - 1) * GX + clamp(Math.floor(x / GC), 0, GX - 1);
  const baseAt0 = (L, x, z) => L.base[cellOf(x, z)];
  const wetAt0 = (L, x, z) => !!L.wet[cellOf(x, z)];

  // ---- 当たり判定（升ごとに近くの物をまとめておく） ----
  const BK = 8, NBX = Math.ceil(W / BK), NBZ = Math.ceil(D / BK);
  function indexSolids(L) {
    L.bk = Array.from({ length: NBX * NBZ }, () => []);
    for (const s of L.solids) {
      for (let j = Math.max(0, Math.floor((s.z0 - 1) / BK)); j <= Math.min(NBZ - 1, Math.floor((s.z1 + 1) / BK)); j++)
        for (let i = Math.max(0, Math.floor((s.x0 - 1) / BK)); i <= Math.min(NBX - 1, Math.floor((s.x1 + 1) / BK)); i++) L.bk[j * NBX + i].push(s);
    }
  }
  let LV = null; // いまの舞台
  const near = (x, z) => LV.bk[clamp(Math.floor(z / BK), 0, NBZ - 1) * NBX + clamp(Math.floor(x / BK), 0, NBX - 1)];
  const baseAt = (x, z) => LV.base[cellOf(x, z)];
  const wetAt = (x, z) => !!LV.wet[cellOf(x, z)];
  const topOf = (s, x, z) => (s.topAt ? s.topAt(s, x, z) : s.top);
  // 立てる高さ：y より step 以上高くない面のうち一番高い所
  function floorAt(x, z, y, step) {
    const st = step == null ? STEP : step;
    let h = baseAt(x, z); if (LV.wet[cellOf(x, z)]) h = SWIM_Y;
    for (const s of near(x, z)) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const t = topOf(s, x, z); if (t <= y + st && t > h) h = t;
    }
    return h;
  }
  function solidAt(x, y, z) { // その点が物の中か（見通し・カメラ用）
    if (y < baseAt(x, z) + 0.1 && !LV.wet[cellOf(x, z)]) return true;
    for (const s of near(x, z)) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1 || s.tree) continue; if (y >= s.y0 && y <= topOf(s, x, z)) return true; }
    return false;
  }
  function canStand(x, z, y, hh, step) {
    if (x < 0.6 || x > W - 0.6 || z < 0.6 || z > D - 0.6) return false;
    for (const [ox, oz] of [[PR, 0], [-PR, 0], [0, PR], [0, -PR], [0, 0]]) { const bx = x + ox, bz = z + oz; if (!LV.wet[cellOf(bx, bz)] && baseAt(bx, bz) > y + step) return false; }
    for (const s of near(x, z)) {
      const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1), dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= PR * PR) continue;
      if (topOf(s, cx, cz) > y + step && s.y0 < y + hh) return false;
    }
    return true;
  }

  // 2.60.10 物にめり込んで動けなくなったら外へ押し出す（塀の上から縁を越えて落ちると、体の半径ぶん塀に重なったまま下りてしまうことがあった）
  function unstick(P, hh) {
    if (canStand(P.x, P.z, P.y, hh, STEP)) return false;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const s of near(P.x, P.z)) {
        const cx = clamp(P.x, s.x0, s.x1), cz = clamp(P.z, s.z0, s.z1), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz);
        if (d >= PR || !(topOf(s, cx, cz) > P.y + STEP && s.y0 < P.y + hh)) continue;
        if (d < 1e-4) { const e = [[P.x - s.x0, -1, 0], [s.x1 - P.x, 1, 0], [P.z - s.z0, 0, -1], [s.z1 - P.z, 0, 1]].sort((a, b) => a[0] - b[0])[0]; P.x += e[1] * (e[0] + PR + 0.03); P.z += e[2] * (e[0] + PR + 0.03); }
        else { const k = (PR + 0.03 - d) / d; P.x += dx * k; P.z += dz * k; }
        moved = true;
      }
      if (!moved || canStand(P.x, P.z, P.y, hh, STEP)) break;
    }
    if (!canStand(P.x, P.z, P.y, hh, STEP)) { // まだだめなら、近くで立てる所を探す
      const x0 = P.x, z0 = P.z;
      search: for (let r = 0.3; r <= 4; r += 0.3) for (let a = 0; a < 16; a++) {
        const x = x0 + Math.cos(a * Math.PI / 8) * r, z = z0 + Math.sin(a * Math.PI / 8) * r, y = floorAt(x, z, P.y, STEP);
        if (canStand(x, z, y, hh, STEP)) { P.x = x; P.z = z; P.y = y; break search; }
      }
    }
    { const f2 = floorAt(P.x, P.z, P.y, STEP); if (f2 > P.y) P.y = f2; } // 低くなった所へは次のコマから落ちる
    return true;
  }

  // ---- 見張りの道（1mの升で A*） ----
  function buildNav(L) {
    const n = W * D; L.navH = new Float32Array(n); L.navOK = new Uint8Array(n);
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const x = i + 0.5, z = j + 0.5, k = j * W + i, wet = wetAt(x, z);
      let f = wet ? -99 : baseAt(x, z);
      for (const s of near(x, z)) { if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue; const t = topOf(s, x, z); if ((s.bridge || s.ramp || s.pav) && t > f - 0.01 && t <= (wet ? 1 : f + 4.5)) f = t; }
      if (f < -50) continue;
      let ok = true;
      for (const s of near(x, z)) {
        if (x < s.x0 - 0.45 || x > s.x1 + 0.45 || z < s.z0 - 0.45 || z > s.z1 + 0.45) continue;
        const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1);
        if (topOf(s, cx, cz) > f + 0.7 && s.y0 < f + 1.7) { ok = false; break; }
      }
      if (ok) for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const bx = x + ox * 0.5, bz = z + oz * 0.5; if (!wetAt(bx, bz) && baseAt(bx, bz) > f + 0.7) { let r = false; for (const s of near(bx, bz)) if ((s.ramp || s.bridge) && bx >= s.x0 && bx <= s.x1 && bz >= s.z0 && bz <= s.z1) r = true; if (!r) ok = false; } }
      L.navH[k] = f; L.navOK[k] = ok ? 1 : 0;
    }
  }
  function navPath(ax, az, bx, bz) {
    const L = LV, si = clamp(Math.floor(az), 0, D - 1) * W + clamp(Math.floor(ax), 0, W - 1);
    let gi = clamp(Math.floor(bz), 0, D - 1) * W + clamp(Math.floor(bx), 0, W - 1);
    if (!L.navOK[gi]) { let best = -1, bd = 1e9; const gx = gi % W, gz = (gi / W) | 0; for (let r = 1; r < 6 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const x = gx + dx, z = gz + dz; if (x < 0 || z < 0 || x >= W || z >= D) continue; const k = z * W + x; if (L.navOK[k] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = k; } } if (best < 0) return null; gi = best; }
    const g = new Float32Array(W * D).fill(1e9), from = new Int32Array(W * D).fill(-1), closed = new Uint8Array(W * D);
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const gx = gi % W, gz = (gi / W) | 0, h = (k) => Math.hypot((k % W) - gx, ((k / W) | 0) - gz);
    g[si] = 0; push(si, h(si)); let n = 0;
    while (heap.length && n++ < 20000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === gi) break;
      const x = k % W, z = (k / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue; const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const q = nz * W + nx; if (!L.navOK[q] || closed[q] || Math.abs(L.navH[q] - L.navH[k]) > 0.75) continue;
        if (dx && dz && (!L.navOK[z * W + nx] || !L.navOK[nz * W + x])) continue;
        const c = g[k] + (dx && dz ? 1.414 : 1); if (c < g[q]) { g[q] = c; from[q] = k; push(q, c + h(q)); }
      }
    }
    if (!closed[gi]) return null;
    const out = []; for (let k = gi; k >= 0 && k !== si; k = from[k]) out.push({ x: (k % W) + 0.5, z: ((k / W) | 0) + 0.5, y: L.navH[k] });
    out.reverse();
    // 間引く（まっすぐ進める所は飛ばす）
    const sm = []; for (let i = 0; i < out.length; i++) if (i === out.length - 1 || i % 3 === 0 || Math.abs(out[i].y - (out[i + 1] || out[i]).y) > 0.05) sm.push(out[i]);
    return sm;
  }
  function randNav(R, r, h) {
    for (let i = 0; i < 300; i++) { const x = r.x0 + R() * (r.x1 - r.x0), z = r.z0 + R() * (r.z1 - r.z0), k = Math.floor(z) * W + Math.floor(x); if (LV.navOK[k] && (h == null || Math.abs(LV.navH[k] - h) < 0.2)) return { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 }; }
    return null;
  }

  // =====================================================================
  // 見た目（材質・形）
  // =====================================================================
  let MATS = null;
  function canvasTex(n, fn, rep) { const c = document.createElement('canvas'); c.width = c.height = n; fn(c.getContext('2d'), n); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4; if (rep) t.repeat.set(rep, rep); return t; }
  function makeMats() {
    if (MATS) return MATS;
    const tl = new T.TextureLoader(), img = (f) => { const t = tl.load('assets/textures/' + f); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t; };
    const stone = canvasTex(256, (g, n) => { g.fillStyle = '#5d5a52'; g.fillRect(0, 0, n, n); let y = 0; while (y < n) { const h = 22 + Math.random() * 22; let x = -Math.random() * 30; while (x < n) { const w = 30 + Math.random() * 40, v = 95 + Math.random() * 50 | 0; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.beginPath(); g.moveTo(x + 3, y + 2 + Math.random() * 3); g.lineTo(x + w - 2, y + 2); g.lineTo(x + w - 3 - Math.random() * 3, y + h - 3); g.lineTo(x + 2, y + h - 2); g.closePath(); g.fill(); x += w; } y += h; } });
    const plaster = canvasTex(128, (g, n) => { g.fillStyle = '#e9e5da'; g.fillRect(0, 0, n, n); for (let i = 0; i < 500; i++) { const v = 215 + Math.random() * 25 | 0; g.fillStyle = `rgba(${v},${v},${v - 8},.5)`; g.fillRect(Math.random() * n, Math.random() * n, 2, 2); } });
    const wood = canvasTex(128, (g, n) => { g.fillStyle = '#4a3322'; g.fillRect(0, 0, n, n); for (let x = 0; x < n; x += 2) { g.fillStyle = `rgba(${30 + Math.random() * 30},${18 + Math.random() * 15},10,.5)`; g.fillRect(x, 0, 1, n); } });
    const roof = canvasTex(128, (g, n) => { g.fillStyle = '#3b3d42'; g.fillRect(0, 0, n, n); for (let x = 0; x < n; x += 16) { g.fillStyle = '#4c4f55'; g.fillRect(x + 2, 0, 9, n); g.fillStyle = '#2a2b2f'; g.fillRect(x + 12, 0, 3, n); } for (let y = 0; y < n; y += 32) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, n, 3); } });
    const namako = canvasTex(128, (g, n) => { g.fillStyle = '#2c2d30'; g.fillRect(0, 0, n, n); g.strokeStyle = '#d8d6cf'; g.lineWidth = 4; for (let i = -n; i < n * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + n, n); g.stroke(); g.beginPath(); g.moveTo(i + n, 0); g.lineTo(i, n); g.stroke(); } });
    const shoji = canvasTex(128, (g, n) => { g.fillStyle = '#efe8d2'; g.fillRect(0, 0, n, n); g.fillStyle = '#5a4430'; for (let i = 0; i <= n; i += 32) { g.fillRect(i - 2, 0, 4, n); } for (let i = 0; i <= n; i += 21) g.fillRect(0, i - 1, n, 3); });
    const tatami = canvasTex(64, (g, n) => { g.fillStyle = '#b5a46a'; g.fillRect(0, 0, n, n); for (let y = 0; y < n; y += 2) { g.fillStyle = `rgba(90,80,40,${0.1 + Math.random() * 0.15})`; g.fillRect(0, y, n, 1); } g.fillStyle = '#2d2a20'; g.fillRect(0, 0, n, 3); });
    const grassBlade = canvasTex(128, (g, n) => { g.clearRect(0, 0, n, n); for (let i = 0; i < 26; i++) { const x = 6 + Math.random() * (n - 12), h = n * (0.55 + Math.random() * 0.45), lean = (Math.random() - 0.5) * 30; const gg = 110 + Math.random() * 60 | 0; g.strokeStyle = `rgb(${gg - 20},${gg},${50 + Math.random() * 30 | 0})`; g.lineWidth = 2 + Math.random() * 2; g.beginPath(); g.moveTo(x, n); g.quadraticCurveTo(x + lean * 0.3, n - h * 0.6, x + lean, n - h); g.stroke(); if (Math.random() < 0.4) { g.fillStyle = 'rgba(225,215,185,.9)'; g.beginPath(); g.ellipse(x + lean, n - h + 6, 3, 9, lean / 60, 0, 7); g.fill(); } } });
    grassBlade.wrapS = grassBlade.wrapT = T.ClampToEdgeWrapping;
    const S = (o) => new T.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o));
    MATS = {
      grass: S({ map: img('ground_grass_dry.jpg') }), dirt: S({ map: img('ground_dirt_packed.jpg') }), mud: S({ map: img('ground_mud_bank.jpg'), color: 0x8a8a80 }),
      stone: S({ map: stone }), plaster: S({ map: plaster }), wood: S({ map: wood }), roof: S({ map: roof, roughness: 0.7, side: T.DoubleSide }), namako: S({ map: namako }),
      shoji: S({ map: shoji, side: T.DoubleSide }), tatami: S({ map: tatami }), dark: S({ color: 0x24201c }),
      water: new T.MeshStandardMaterial({ color: 0x24404a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82 }),
      leaf: S({ color: 0x2d4a2a }), bark: S({ color: 0x4a3a2c }),
      glow: new T.MeshBasicMaterial({ color: 0xffc070 }), lampOff: S({ color: 0x8a8478 }),
      grassB: new T.MeshStandardMaterial({ map: grassBlade, alphaTest: 0.45, side: T.DoubleSide, roughness: 1 }),
      futon: S({ color: 0xd9d0c0 }), gold: S({ color: 0xc9a040, metalness: 0.7, roughness: 0.35 }), box: S({ color: 0x3a2412, roughness: 0.6 }),
      rope: S({ color: 0x9a8058 }),
    };
    return MATS;
  }
  // 形を貯めて、材質ごとに1つにまとめる
  function Batch() { this.g = {}; }
  Batch.prototype.arr = function (m) { return this.g[m] || (this.g[m] = { p: [], n: [], uv: [] }); };
  const _a = [0, 0, 0], _b = [0, 0, 0];
  Batch.prototype.quad = function (m, v0, v1, v2, v3, uvs) {
    const A = this.arr(m); _a[0] = v1[0] - v0[0]; _a[1] = v1[1] - v0[1]; _a[2] = v1[2] - v0[2]; _b[0] = v2[0] - v0[0]; _b[1] = v2[1] - v0[1]; _b[2] = v2[2] - v0[2];
    let nx = _a[1] * _b[2] - _a[2] * _b[1], ny = _a[2] * _b[0] - _a[0] * _b[2], nz = _a[0] * _b[1] - _a[1] * _b[0]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const vs = v3 ? [v0, v1, v2, v0, v2, v3] : [v0, v1, v2], us = v3 ? [uvs[0], uvs[1], uvs[2], uvs[0], uvs[2], uvs[3]] : [uvs[0], uvs[1], uvs[2]];
    for (let i = 0; i < vs.length; i++) { A.p.push(vs[i][0], vs[i][1], vs[i][2]); A.n.push(nx, ny, nz); A.uv.push(us[i][0], us[i][1]); }
  };
  // 箱。faces：使う面（'xXyYzZ' の文字。小文字＝負の向き）、u＝模様1枚の大きさ（m）
  Batch.prototype.box = function (m, x0, y0, z0, x1, y1, z1, u, faces) {
    const f = faces || 'xXYzZ', k = 1 / (u || 2);
    if (f.includes('X')) this.quad(m, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[z1 * k, y0 * k], [z0 * k, y0 * k], [z0 * k, y1 * k], [z1 * k, y1 * k]].map((q) => [-q[0], q[1]]));
    if (f.includes('x')) this.quad(m, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[z0 * k, y0 * k], [z1 * k, y0 * k], [z1 * k, y1 * k], [z0 * k, y1 * k]]);
    if (f.includes('Z')) this.quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[x0 * k, y0 * k], [x1 * k, y0 * k], [x1 * k, y1 * k], [x0 * k, y1 * k]]);
    if (f.includes('z')) this.quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[-x1 * k, y0 * k], [-x0 * k, y0 * k], [-x0 * k, y1 * k], [-x1 * k, y1 * k]]);
    if (f.includes('Y')) this.quad(m, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0 * k, -z1 * k], [x1 * k, -z1 * k], [x1 * k, -z0 * k], [x0 * k, -z0 * k]]);
    if (f.includes('y')) this.quad(m, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [[x0 * k, z0 * k], [x1 * k, z0 * k], [x1 * k, z1 * k], [x0 * k, z1 * k]]);
  };
  // 切妻屋根（ax＝棟の向き）。hip＝寄棟（四方に傾く）
  Batch.prototype.roof = function (m, x0, z0, x1, z1, he, rise, ax, ov, hip) {
    x0 -= ov; z0 -= ov; x1 += ov; z1 += ov; he -= ov * 0.3;
    const r = he + rise + ov * 0.3, u = 0.5;
    if (hip) { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ix = (x1 - x0) * 0.15, iz = (z1 - z0) * 0.15, a = [cx - ix, r, cz - iz], b = [cx + ix, r, cz - iz], c = [cx + ix, r, cz + iz], d = [cx - ix, r, cz + iz];
      this.quad(m, [x0, he, z1], [x1, he, z1], c, d, [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u * 0.65, 1], [(x1 - x0) * u * 0.35, 1]]);
      this.quad(m, [x1, he, z0], [x0, he, z0], a, b, [[0, 0], [(x1 - x0) * u, 0], [(x1 - x0) * u * 0.65, 1], [(x1 - x0) * u * 0.35, 1]]);
      this.quad(m, [x1, he, z1], [x1, he, z0], b, c, [[0, 0], [(z1 - z0) * u, 0], [(z1 - z0) * u * 0.65, 1], [(z1 - z0) * u * 0.35, 1]]);
      this.quad(m, [x0, he, z0], [x0, he, z1], d, a, [[0, 0], [(z1 - z0) * u, 0], [(z1 - z0) * u * 0.65, 1], [(z1 - z0) * u * 0.35, 1]]);
      this.quad(m, a, d, c, b, [[0, 0], [0, 1], [1, 1], [1, 0]]); return; }
    if (ax === 'x') { const zm = (z0 + z1) / 2, sl = Math.hypot(zm - z0, rise) * u;
      this.quad(m, [x0, he, z1], [x1, he, z1], [x1, r, zm], [x0, r, zm], [[x0 * u, 0], [x1 * u, 0], [x1 * u, sl], [x0 * u, sl]]);
      this.quad(m, [x1, he, z0], [x0, he, z0], [x0, r, zm], [x1, r, zm], [[x1 * u, 0], [x0 * u, 0], [x0 * u, sl], [x1 * u, sl]]);
      this.quad(m, [x0 + ov, he, z0 + ov], [x0 + ov, he, z1 - ov], [x0 + ov, r - ov * 0.3, zm], null, [[0, 0], [1, 0], [0.5, 0.6]]);
      this.quad(m, [x1 - ov, he, z1 - ov], [x1 - ov, he, z0 + ov], [x1 - ov, r - ov * 0.3, zm], null, [[0, 0], [1, 0], [0.5, 0.6]]);
    } else { const xm = (x0 + x1) / 2, sl = Math.hypot(xm - x0, rise) * u;
      this.quad(m, [x1, he, z1], [x1, he, z0], [xm, r, z0], [xm, r, z1], [[z1 * u, 0], [z0 * u, 0], [z0 * u, sl], [z1 * u, sl]]);
      this.quad(m, [x0, he, z0], [x0, he, z1], [xm, r, z1], [xm, r, z0], [[z0 * u, 0], [z1 * u, 0], [z1 * u, sl], [z0 * u, sl]]);
      this.quad(m, [x0 + ov, he, z1 - ov], [x1 - ov, he, z1 - ov], [xm, r - ov * 0.3, z1 - ov], null, [[0, 0], [1, 0], [0.5, 0.6]]);
      this.quad(m, [x1 - ov, he, z0 + ov], [x0 + ov, he, z0 + ov], [xm, r - ov * 0.3, z0 + ov], null, [[0, 0], [1, 0], [0.5, 0.6]]);
    }
  };
  Batch.prototype.meshes = function (M, group, shadow) {
    for (const m in this.g) {
      const A = this.g[m]; if (!A.p.length) continue;
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(A.p, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(A.n, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(A.uv, 2));
      const me = new T.Mesh(geo, M[m]); me.castShadow = shadow && m !== 'water' && m !== 'grass' && m !== 'dirt' && m !== 'mud'; me.receiveShadow = shadow; group.add(me);
    }
  };

  function buildScene(L, grp, shadow, night) {
    const M = makeMats(), B = new Batch();
    // 地面（升ごと）と段差の石垣
    const gm = ['grass', 'dirt', 'mud'];
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      const k = j * GX + i, h = L.base[k], x0 = i * GC, z0 = j * GC, x1 = x0 + GC, z1 = z0 + GC;
      B.box(gm[L.gk[k]], x0, h - 0.1, z0, x1, h, z1, 4, 'Y');
      if (L.wet[k]) B.box('water', x0, WATER_Y - 0.01, z0, x1, WATER_Y, z1, 4, 'Y');
      for (const [di, dj, f] of [[1, 0, 'X'], [-1, 0, 'x'], [0, 1, 'Z'], [0, -1, 'z']]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GX || nj >= GZ) continue;
        const nh = L.base[nj * GX + ni]; if (nh < h - 0.05) B.box('stone', x0, nh - 0.1, z0, x1, h, z1, 2, f);
      }
    }
    // 舞台の外の地面（堀を隠さないよう四方に分けて敷く）
    for (const [a0, b0, a1, b1] of [[-400, -400, W + 400, 0], [-400, D, W + 400, D + 400], [-400, 0, 0, D], [W, 0, W + 400, D]]) B.box('grass', a0, -0.2, b0, a1, -0.02, b1, 4, 'Y');
    for (const s of L.solids) {
      const { x0, z0, x1, z1, y0, top } = s;
      if (s.mat === 'wall') { const sy = y0 + (s.stoneH || 2.8) + (L.yama ? 0 : 0.2); B.box('stone', x0, y0, z0, x1, sy, z1, 2, 'xXzZ'); B.box('plaster', x0 + 0.08, sy, z0 + 0.08, x1 - 0.08, top - 0.25, z1 - 0.08, 2, 'xXzZ'); B.box('roof', x0 - 0.12, top - 0.25, z0 - 0.12, x1 + 0.12, top, z1 + 0.12, 1, 'xXYzZ'); }
      else if (s.mat === 'kura') { B.box('namako', x0, y0, z0, x1, y0 + 1.3, z1, 1.2, 'xXzZ'); B.box('plaster', x0, y0 + 1.3, z0, x1, s.roof.he, z1, 2, 'xXzZ'); B.roof('roof', x0, z0, x1, z1, s.roof.he, s.roof.rise, s.roof.ax, 0.6); const d = { x: (x0 + x1) / 2, z: z1 }; B.box('dark', d.x - 0.9, y0, z1, d.x + 0.9, y0 + 2.3, z1 + 0.12, 1, 'xXYZ'); }
      else if (s.mat === 'nagaya' || s.mat === 'machiya' || s.mat === 'goten') {
        const wm = s.mat === 'goten' ? 'shoji' : 'plaster';
        B.box('wood', x0, y0, z0, x1, y0 + 0.9, z1, 1, 'xXzZ'); B.box(wm, x0 + 0.05, y0 + 0.9, z0 + 0.05, x1 - 0.05, s.roof.he, z1 - 0.05, 2, 'xXzZ');
        for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(1, Math.round((x1 - x0) / 2.5))) { B.box('wood', x - 0.1, y0, z1 - 0.02, x + 0.1, s.roof.he, z1 + 0.06, 1, 'xXZ'); B.box('wood', x - 0.1, y0, z0 - 0.06, x + 0.1, s.roof.he, z0 + 0.02, 1, 'xXz'); }
        B.roof('roof', x0, z0, x1, z1, s.roof.he, s.roof.rise, s.roof.ax, s.mat === 'goten' ? 1.1 : 0.7);
      } else if (s.mat === 'roofOnly') { B.roof('roof', x0 + 0.6, z0 + 0.6, x1 - 0.6, z1 - 0.6, s.roof.he, s.roof.rise, s.roof.ax, 0.6, s.hip); }
      else if (s.mat === 'yagura') { B.box('namako', x0, y0, z0, x1, y0 + 1.6, z1, 1.2, 'xXzZ'); B.box('plaster', x0, y0 + 1.6, z0, x1, top - 0.3, z1, 2, 'xXzZ'); B.box('wood', x0 - 0.2, top - 0.3, z0 - 0.2, x1 + 0.2, top, z1 + 0.2, 1, 'xXYzZ'); B.box('wood', x0, top, z0, x1, top + 0.8, z0 + 0.15, 1, 'xXYzZ'); B.box('wood', x0, top, z1 - 0.15, x1, top + 0.8, z1, 1, 'xXYzZ'); }
      else if (s.mat === 'tenshu') { const tiers = s.tiers || 3, h = (top - y0 - 2.5) / tiers; B.box('stone', x0 - 1, y0, z0 - 1, x1 + 1, y0 + 2.5, z1 + 1, 2, 'xXYzZ'); for (let t = 0; t < tiers; t++) { const sh = t * 0.9, a = y0 + 2.5 + t * h; B.box('plaster', x0 + sh, a, z0 + sh, x1 - sh, a + h - 0.6, z1 - sh, 2, 'xXzZ'); B.roof('roof', x0 + sh, z0 + sh, x1 - sh, z1 - sh, a + h - 0.6, t === tiers - 1 ? 2.2 : 0.9, 'x', 1.0, true); } }
      else if (s.mat === 'floor') { B.box('wood', x0, y0, z0, x1, top - 0.05, z1, 1, 'xXzZ'); B.box('tatami', x0, top - 0.05, z0, x1, top, z1, 1.8, 'Y'); }
      else if (s.mat === 'shoji') B.box('shoji', x0, y0, z0, x1, top, z1, 1.8, 'xXzZY');
      else if (s.mat === 'wood') B.box('wood', x0, y0, z0, x1, top, z1, 1, 'xXzZY');
      else if (s.mat === 'plaster') { B.box('plaster', x0, y0, z0, x1, top - 0.3, z1, 2, 'xXzZy'); B.box('roof', x0 - 0.1, top - 0.3, z0 - 0.1, x1 + 0.1, top, z1 + 0.1, 1, 'xXYzZy'); }
      else if (s.mat === 'bridge') { B.box('wood', x0, y0, z0, x1, top, z1, 1, 'xXYzZy'); B.box('wood', x0, top, z0, x0 + 0.15, top + 0.9, z1, 1, 'xXYzZ'); B.box('wood', x1 - 0.15, top, z0, x1, top + 0.9, z1, 1, 'xXYzZ'); }
      else if (s.mat === 'ramp') { const r = s.ramp, a = r.ax === 'z'; // 坂（上り口）
        if (a) { const yz0 = r.h0, yz1 = r.h1; B.quad('dirt', [x0, yz1, z1], [x1, yz1, z1], [x1, yz0, z0], [x0, yz0, z0], [[0, 0], [1, 0], [1, 2], [0, 2]]); B.quad('stone', [x1, -0.3, z1], [x1, -0.3, z0], [x1, yz0, z0], [x1, yz1, z1], [[0, 0], [1, 0], [1, 1], [0, 1]]); B.quad('stone', [x0, -0.3, z0], [x0, -0.3, z1], [x0, yz1, z1], [x0, yz0, z0], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
      } else if (s.mat === 'lamp') { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; B.box('lampOff', cx - 0.12, y0, cz - 0.12, cx + 0.12, top - 0.45, cz + 0.12, 1, 'xXzZ'); B.box('lampOff', x0 - 0.1, top - 0.12, z0 - 0.1, x1 + 0.1, top, z1 + 0.1, 1, 'xXYzZ'); B.box(night ? 'glow' : 'lampOff', x0 + 0.05, top - 0.45, z0 + 0.05, x1 - 0.05, top - 0.12, z1 - 0.05, 1, 'xXzZ'); }
    }
    for (const dc of L.deco) {
      if (dc.k === 'gateRoof') B.roof('roof', dc.x0, dc.z0, dc.x1, dc.z1, dc.y, 1.3, 'x', 0.3);
      if (dc.k === 'post') B.box('wood', dc.x - 0.12, dc.y0, dc.z - 0.12, dc.x + 0.12, dc.y1, dc.z + 0.12, 1, 'xXzZ');
      if (dc.k === 'doors') { B.box('wood', dc.x - dc.w / 2, dc.y, dc.z - 1.8, dc.x - dc.w / 2 + 0.12, dc.y + dc.h, dc.z - 0.6, 1, 'xXzZY'); B.box('wood', dc.x + dc.w / 2 - 0.12, dc.y, dc.z - 1.8, dc.x + dc.w / 2, dc.y + dc.h, dc.z - 0.6, 1, 'xXzZY'); }
    }
    // 梯子と石垣の手掛かり
    for (const c of L.climbs) {
      const a = c.face, fx = Math.sin(a), fz = Math.cos(a), rx = Math.cos(a), rz = -Math.sin(a), y0 = c.B.y, y1 = c.U.y;
      if (c.kind === 'ladder') { const px = c.B.x + fx * 0.35, pz = c.B.z + fz * 0.35;
        for (const s of [-0.28, 0.28]) B.box('wood', px + rx * s - 0.05, y0, pz + rz * s - 0.05, px + rx * s + 0.05, y1 + 0.6, pz + rz * s + 0.05, 1, 'xXzZ');
        for (let y = y0 + 0.3; y < y1 + 0.4; y += 0.35) B.box('wood', px - Math.abs(rx) * 0.3 - 0.04, y, pz - Math.abs(rz) * 0.3 - 0.04, px + Math.abs(rx) * 0.3 + 0.04, y + 0.05, pz + Math.abs(rz) * 0.3 + 0.04, 1, 'xXYzZ'); }
      else if (c.kind === 'ishigaki') { const px = c.B.x + fx * 0.42, pz = c.B.z + fz * 0.42; for (let y = Math.max(y0, WATER_Y) + 0.3, i = 0; y < y1 - 0.4; y += 0.55, i++) { const s = i % 2 ? 0.22 : -0.22, qx = px + rx * s, qz = pz + rz * s; B.box('dark', qx - 0.14, y, qz - 0.14, qx + 0.14, y + 0.12, qz + 0.14, 1, 'xXYzZ'); } }
    }
    B.meshes(M, grp, shadow);
    // 木（松）
    const tB = new Batch();
    { const R2 = rngOf('outer'); for (let i = 0; i < 90; i++) { const side = i % 4, u = R2(); const x = side < 2 ? -20 + u * (W + 40) : side === 2 ? -4 - R2() * 26 : W + 4 + R2() * 26, z = side === 0 ? -4 - R2() * 26 : side === 1 ? D + 4 + R2() * 26 : -20 + u * (D + 40); L.trees.push({ x, z, s: 0.9 + R2() * 0.8, out: 1 }); } }
    for (const t of L.trees) { const y = t.out ? 0 : baseAt0(L, t.x, t.z), s = t.s; tB.box('bark', t.x - 0.18 * s, y, t.z - 0.18 * s, t.x + 0.18 * s, y + 4.2 * s, t.z + 0.18 * s, 1, 'xXzZ');
      for (let i = 0; i < 4; i++) { const h = y + (2.2 + i * 0.9) * s, r = (2.0 - i * 0.38) * s, ox = Math.sin(i * 2.1 + t.x) * 0.5 * s, oz = Math.cos(i * 1.7 + t.z) * 0.5 * s; tB.roof('leaf', t.x + ox - r, t.z + oz - r, t.x + ox + r, t.z + oz + r, h, 0.7 * s, 'x', 0, true); tB.box('leaf', t.x + ox - r * 0.9, h - 0.25 * s, t.z + oz - r * 0.9, t.x + ox + r * 0.9, h, t.z + oz + r * 0.9, 1, 'y'); } }
    tB.meshes(M, grp, shadow);
    // 草むら（ススキ）
    let nb = 0; for (const g of L.grass) nb += Math.round(g.r * g.r * 5);
    const bg = new T.PlaneGeometry(1.2, 1.4); bg.translate(0, 0.7, 0);
    const bg2 = bg.clone().rotateY(Math.PI / 2); const blade = mergeGeos([bg, bg2]);
    const im = new T.InstancedMesh(blade, M.grassB, Math.max(1, nb)); let ii = 0; const mm = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3();
    const R = rngOf('grass' + L.ck + L.kai);
    for (const g of L.grass) for (let i = 0, n = Math.round(g.r * g.r * 5); i < n; i++) { const a = R() * 6.28, r = Math.sqrt(R()) * g.r, x = g.x + Math.cos(a) * r, z = g.z + Math.sin(a) * r; q.setFromAxisAngle(new T.Vector3(0, 1, 0), R() * 3.14); const k = 0.8 + R() * 0.6; sc.set(k, k * (0.9 + R() * 0.5), k); ps.set(x, baseAt0(L, x, z) - 0.05, z); mm.compose(ps, q, sc); im.setMatrixAt(ii++, mm); }
    im.count = ii; im.receiveShadow = shadow; grp.add(im);
  }
  function mergeGeos(list) { // 位置・法線・uv だけの形をつなぐ
    const p = [], n = [], uv = [];
    for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; p.push(...g.attributes.position.array); n.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); return g;
  }

  // =====================================================================
  // 人（兵のモデルを1人ずつ複製し、AnimationMixer で動かす）
  // =====================================================================
  const MD = { ready: false, loading: null, rigs: {}, wep: {} };
  const LOOPC = ['climb_wall', 'climb_ladder', 'swim', 'crouch_walk', 'crouch_idle', 'work', 'talking', 'look_around', 'sleeping'];
  const has = (ch, n) => !!ch.acts[n];
  function loadModels() {
    if (MD.loading) return MD.loading;
    const Ld = new T.GLTFLoader(), P = (SGK.SOLD3D && SGK.SOLD3D.PATH) || 'assets/models/';
    const get = (u) => new Promise((ok, ng) => Ld.load(P + u, ok, undefined, ng));
    MD.loading = Promise.all([get('soldier_anims.glb'), get('soldier_t1_rig.glb'), get('soldier_t2_rig.glb'), get('soldier_t3_rig.glb'), get('soldier_t4_rig.glb'), get('equip/yari.glb'), get('equip/katana.glb'), get('ninja_anims.glb').catch(() => null)]).then((g) => {
      let aHip = 0; g[0].scene.traverse((o) => { if (!aHip && /Hips$/.test(o.name)) aHip = o.position.length(); });
      for (let i = 1; i <= 4; i++) {
        const gl = g[i]; let h = 0; gl.scene.traverse((o) => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o.position.length(); });
        const k = h && aHip ? h / aHip : 1, clips = {};
        for (const c of g[0].animations) { const cc = c.clone(); for (const tr of cc.tracks) if (/Hips\.position$/.test(tr.name)) { tr.values = Float32Array.from(tr.values, (v) => v * k); } clips[c.name] = cc; }
        // 2.31.0 忍びの動き（Mixamo。tools/ninja_anims.py で作る）。くり返す動きは体の移動（登りの上がり・泳ぎの前進）を消して、その場で動くように
        if (g[7]) for (const c of g[7].animations) { const cc = c.clone(); for (const tr of cc.tracks) if (/Hips\.position$/.test(tr.name)) { const v = Float32Array.from(tr.values, (x) => x * k), n = v.length / 3; if (LOOPC.includes(c.name) && n > 1) for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) v[i * 3 + a] -= (v[(n - 1) * 3 + a] - v[a]) * i / (n - 1); tr.values = v; } clips[c.name] = cc; }
        MD.rigs['t' + i] = { gl, clips };
      }
      MD.wep.yari = g[5].scene; MD.wep.katana = g[6].scene; MD.ready = true;
    });
    MD.loading.catch(() => { MD.loading = null; });
    return MD.loading;
  }
  function cloneSk(src) {
    const c = src.clone(true), a = [], b = []; src.traverse((o) => a.push(o)); c.traverse((o) => b.push(o));
    const map = new Map(); a.forEach((o, i) => map.set(o, b[i]));
    b.forEach((o, i) => { if (!o.isSkinnedMesh) return; const s = a[i]; const sk = s.skeleton.clone(); sk.bones = s.skeleton.bones.map((bn) => map.get(bn)); o.bind(sk, s.bindMatrix.clone()); });
    return c;
  }
  const charMat = () => (charMat.m || (charMat.m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side: T.DoubleSide })));
  const SKIN = [0.6, 0.39, 0.255];
  function paint(mesh, tint, hood, hat, skinC) { // 2.101.9 skinC：肌の色を変える（かくれんぼの妖怪） // 肌の色をそろえ、服（と頭巾）を tint に染める。hat：陣笠・兜の白い所を黒漆に（soldier3d.js と同じ）
    const geo = mesh.geometry, C = geo.attributes.color; if (!C) return;
    geo.computeBoundingBox(); const bb = geo.boundingBox, PY = geo.attributes.position, yTop = bb.min.y + (bb.max.y - bb.min.y) * 0.84;
    const names = mesh.skeleton.bones.map((b) => b.name.replace(/^mixamorig:?/, ''));
    const mask = SGK.SOLD3D && SGK.SOLD3D.clothMask ? SGK.SOLD3D.clothMask(geo, mesh.skeleton.bones.map((b) => b.name)) : null;
    const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const boneOf = (i) => { let bi = SI.getX(i), bw = SW.getX(i); if (SW.getY(i) > bw) { bw = SW.getY(i); bi = SI.getY(i); } if (SW.getZ(i) > bw) { bw = SW.getZ(i); bi = SI.getZ(i); } if (SW.getW(i) > bw) bi = SI.getW(i); return names[bi] || ''; };
    for (let i = 0; i < C.count; i++) {
      const r = C.getX(i), g = C.getY(i), b = C.getZ(i), lum = 0.299 * r + 0.587 * g + 0.114 * b, bn = boneOf(i);
      const skin = r >= 0.6 && r <= 0.9 && g >= 0.48 && g <= 0.7 && b >= 0.28 && b <= 0.5 && r - g > 0.07 && g - b > 0.08;
      if (skin && (skinC || !/Hand|Thumb|Index|Middle|Ring|Pinky/.test(bn))) { const sc = skinC || SKIN; C.setXYZ(i, sc[0], sc[1], sc[2]); continue; }
      if (hat && PY.getY(i) > yTop) { const lo = Math.min(r, g, b), hi = Math.max(r, g, b); if (lo > 0.3 && hi - lo < 0.25 * hi) { C.setXYZ(i, 0.05, 0.05, 0.058); continue; } }
      if (!tint) continue;
      const cl = (mask && mask[i]) || (hood && (/Head|Neck/.test(bn) || /Hand|Thumb|Index|Middle|Ring|Pinky|Foot|Toe|Leg/.test(bn)));
      if (cl) { const k = 0.45 + 0.9 * lum; C.setXYZ(i, tint.r * k, tint.g * k, tint.b * k); }
    }
    C.needsUpdate = true;
  }
  function mkChar(rig, o) {
    o = o || {};
    const R = MD.rigs[rig], root = cloneSk(R.gl.scene), bones = {}, ch0 = [];
    root.traverse((x) => {
      if (x.isBone) bones[x.name.replace(/^mixamorig:?/, '')] = x;
      if (x.isMesh) { x.geometry = x.geometry.clone(); if (x.isSkinnedMesh && SGK.SOLD3D && SGK.SOLD3D.fixArmWeights) { ch0.push(x); } x.material = charMat(); x.castShadow = true; x.receiveShadow = false; x.frustumCulled = false; if (x.isSkinnedMesh && (o.tint || o.hood || true)) paint(x, o.tint ? new T.Color(o.tint) : null, o.hood, rig === 't2' || rig === 't3', o.skin); }
    });
    root.updateMatrixWorld(true); if (rig !== 't1') for (const x of ch0) SGK.SOLD3D.fixArmWeights(x); // 2.30.1 腰の帯が腕に付いてこないように
    const mixer = new T.AnimationMixer(root), acts = {};
    for (const k in R.clips) acts[k] = mixer.clipAction(R.clips[k]);
    const q0 = []; for (const b of Object.values(bones)) q0.push([b, b.quaternion.clone()]);
    const ch = { root, bones, mixer, acts, cur: null, q0, hip0: bones.Hips ? bones.Hips.position.clone() : null, wep: {} };
    for (const w of o.weps || []) attach(ch, w, false);
    play(ch, 'idle');
    return ch;
  }
  function attach(ch, name, on) {
    if (ch.wep[name]) { ch.wep[name].visible = on; return; }
    const src = MD.wep[name], hand = ch.bones.RightHand; if (!src || !hand) return;
    const w = src.clone(true), G = (SGK.SOLD3D && SGK.SOLD3D.GRIP && SGK.SOLD3D.GRIP.R) || { p: [0.03, 0.08, 0], r: [-(Math.PI / 2 + 0.35), 0, 0] };
    ch.root.updateMatrixWorld(true); const s = new T.Vector3(); hand.getWorldScale(s); const k = 1 / (s.x || 1);
    w.position.set(G.p[0] * k, G.p[1] * k, G.p[2] * k); w.rotation.set(G.r[0], G.r[1], G.r[2]); w.scale.setScalar(k);
    w.traverse((x) => { if (x.isMesh) { x.castShadow = true; x.frustumCulled = false; } });
    hand.add(w); w.visible = on !== false; ch.wep[name] = w;
  }
  function play(ch, name, o) {
    o = o || {};
    const a = ch.acts[name] || ch.acts.idle;
    if (ch.cur === name && !o.restart) { a.timeScale = o.speed || 1; return a; }
    const prev = ch.cur && ch.acts[ch.cur];
    a.reset(); a.setLoop(o.once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!o.once; a.timeScale = o.speed || 1; a.setEffectiveWeight(1);
    if (prev && prev !== a) { prev.fadeOut(o.fade == null ? 0.2 : o.fade); a.fadeIn(o.fade == null ? 0.2 : o.fade); }
    a.play(); if (o.at != null) a.time = o.at;
    ch.cur = name; return a;
  }
  // 体を手で曲げる（キャラクターの向きで考える：+X＝左、+Y＝上、+Z＝前）
  const qa = new T.Quaternion(), qp = new T.Quaternion(), qr = new T.Quaternion(), va = new T.Vector3(), vb = new T.Vector3();
  const AX = { x: new T.Vector3(1, 0, 0), y: new T.Vector3(0, 1, 0), z: new T.Vector3(0, 0, 1) };
  function rotC(ch, b, ax, ang) {
    if (!b || !ang) return;
    b.parent.getWorldQuaternion(qp); va.copy(AX[ax]).applyQuaternion(ch.root.quaternion);
    qr.setFromAxisAngle(va, ang); qa.copy(qp).invert().multiply(qr).multiply(qp); b.quaternion.premultiply(qa); b.updateMatrixWorld(true);
  }
  function dropHips(ch, m) { const h = ch.bones.Hips; if (!h || !m) return; h.getWorldPosition(vb); vb.y -= m; h.position.copy(h.parent.worldToLocal(vb)); h.updateMatrixWorld(true); }
  function pose(ch, P) {
    const B = ch.bones; ch.root.updateMatrixWorld(true);
    const c = P.crouch || 0;
    if (c) {
      dropHips(ch, 0.4 * c);
      rotC(ch, B.Spine, 'x', 0.3 * c); rotC(ch, B.Spine1, 'x', 0.15 * c); rotC(ch, B.Neck, 'x', -0.3 * c);
      for (const s of ['Left', 'Right']) { rotC(ch, B[s + 'UpLeg'], 'x', -1.05 * c); rotC(ch, B[s + 'Leg'], 'x', 1.35 * c); rotC(ch, B[s + 'Foot'], 'x', -0.3 * c); rotC(ch, B[s + 'Arm'], 'x', -0.25 * c); }
    }
    if (P.work) { const w = P.work; for (const s of ['Left', 'Right']) { rotC(ch, B[s + 'Arm'], 'x', -0.9 * w); rotC(ch, B[s + 'ForeArm'], 'x', -0.5 * w); } }
    if (P.carry) { const k = P.carry; rotC(ch, B.Spine, 'x', 0.15 * k); rotC(ch, B.RightArm, 'z', -1.9 * k); rotC(ch, B.RightForeArm, 'x', -1.3 * k); rotC(ch, B.LeftArm, 'x', -1.1 * k); rotC(ch, B.LeftForeArm, 'x', -0.6 * k); }
    if (P.climb != null) { const f = P.climb, sL = Math.sin(f), sR = -sL;
      rotC(ch, B.LeftArm, 'x', -2.5 - 0.45 * sL); rotC(ch, B.RightArm, 'x', -2.5 - 0.45 * sR); rotC(ch, B.LeftForeArm, 'x', -0.3 - 0.4 * Math.max(0, sL)); rotC(ch, B.RightForeArm, 'x', -0.3 - 0.4 * Math.max(0, sR));
      rotC(ch, B.LeftUpLeg, 'x', -0.5 - 0.6 * Math.max(0, sR)); rotC(ch, B.RightUpLeg, 'x', -0.5 - 0.6 * Math.max(0, sL)); rotC(ch, B.LeftLeg, 'x', 0.9 + 0.5 * Math.max(0, sR)); rotC(ch, B.RightLeg, 'x', 0.9 + 0.5 * Math.max(0, sL)); }
    if (P.swim) { const f = P.swimF || 0; rotC(ch, B.LeftArm, 'x', -1.6 - 0.6 * Math.sin(f)); rotC(ch, B.RightArm, 'x', -1.6 - 0.6 * Math.sin(f)); rotC(ch, B.Neck, 'x', -0.6); }
    if (P.throwK) { rotC(ch, B.RightArm, 'x', -1.6 * P.throwK); rotC(ch, B.RightForeArm, 'x', -0.4 * P.throwK); }
    if (P.look) rotC(ch, B.Neck, 'y', P.look);
    if (P.foot) { rotC(ch, B.Spine, 'x', 0.5); rotC(ch, B.RightUpLeg, 'x', -0.9); rotC(ch, B.RightLeg, 'x', 1.4); rotC(ch, B.LeftArm, 'x', -0.6); rotC(ch, B.RightArm, 'x', -0.6); dropHips(ch, 0.2); }
  }
  // three.js は値が前のコマと同じ骨は書き直さないので、手で曲げる前の姿（動きだけの姿）を取っておき、次のコマの前に戻す
  function tick(ch, dt, P) {
    if (ch.bent) { for (const [b, q] of ch.q0) b.quaternion.copy(q); if (ch.hip0) ch.bones.Hips.position.copy(ch.hip0); }
    ch.mixer.update(dt);
    for (const [b, q] of ch.q0) q.copy(b.quaternion); if (ch.hip0) ch.hip0.copy(ch.bones.Hips.position);
    ch.bent = !!P; if (P) pose(ch, P);
  }

  // =====================================================================
  // 遊びの中身
  // =====================================================================
  let rd = null, cv = null, hud = null, scene = null, cam = null, st = null, cb = null, raf = 0, last = 0;
  const keys = new Set(), prevK = new Set(), vk = new Set(); let prevPad = {}, look = { dx: 0, dy: 0 }, drag = null, joy = null;
  const eff = () => { const A = SGK.RENDER && SGK.RENDER.act3d; return A && A.eff ? A.eff() : { sh: 2, pr: Math.min(2, window.devicePixelRatio || 1) }; };
  const isTouch = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);

  function initRenderer() {
    if (rd) return true;
    cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:50;display:none;touch-action:none';
    document.body.appendChild(cv);
    try { rd = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { N3.failed = true; cv.remove(); cv = null; return false; }
    rd.outputEncoding = T.sRGBEncoding; rd.toneMapping = T.ACESFilmicToneMapping; rd.toneMappingExposure = 1.0;
    rd.shadowMap.type = T.PCFSoftShadowMap;
    hud = document.createElement('div'); hud.id = 'nj3'; hud.style.display = 'none'; document.body.appendChild(hud);
    hud.innerHTML = `<style>
#nj3{position:fixed;inset:0;z-index:51;pointer-events:none;color:#f4ead0;font:14px/1.4 sans-serif;text-shadow:0 1px 2px #000,0 0 6px #000}
#nj3 .tl{position:absolute;left:12px;top:10px;max-width:46%}
#nj3 .tl b{color:#f2c14e;font-size:16px}
#nj3 .tools{margin-top:6px;font-size:13px}
#nj3 .tools span{display:inline-block;margin-right:10px;padding:1px 6px;border:1px solid rgba(242,193,78,.5);border-radius:4px;background:rgba(0,0,0,.35)}
#nj3 .tools span.no{opacity:.4}
#nj3 .eye{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:220px;text-align:center;font-size:12px}
#nj3 .eye i{display:block;height:8px;margin-top:3px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.25);border-radius:4px;overflow:hidden}
#nj3 .eye i u{display:block;height:100%;width:0;background:#ec3}
#nj3 .alert{color:#ff7a5a;font-weight:bold}
#nj3 .pr{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);text-align:center;font-size:16px;white-space:nowrap}
#nj3 .pr kbd{display:inline-block;min-width:16px;padding:0 5px;margin:0 3px;border:1px solid #f2c14e;border-radius:4px;background:rgba(0,0,0,.5);color:#f2c14e;font:bold 13px sans-serif}
#nj3 .bar{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);width:200px;height:7px;background:rgba(0,0,0,.5);border-radius:4px;overflow:hidden;display:none}
#nj3 .bar u{display:block;height:100%;background:#ffe070}
#nj3 .help{position:absolute;left:12px;bottom:10px;font-size:12px;color:#d8ccaa;max-width:70%}
#nj3 .msg{position:absolute;left:50%;top:32%;transform:translateX(-50%);font-size:24px;color:#ffe070;text-align:center;transition:opacity .4s;white-space:nowrap}
#nj3 .quit{position:absolute;right:12px;top:10px;pointer-events:auto;padding:6px 12px;background:rgba(30,24,18,.85);color:#efe6cc;border:1px solid #8a7448;border-radius:5px;font:inherit;cursor:pointer}
#nj3 .load,#nj3 .end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,8,10,.75);font-size:20px;text-align:center}
#nj3 .end div{background:rgba(24,20,15,.95);border:1px solid #8a7448;border-radius:8px;padding:16px 26px;font-size:16px;line-height:1.8}
#nj3 .end h2{margin:0 0 6px;color:#f2c14e;font-size:24px}
#nj3 .ok{color:#9fe08a}#nj3 .ng{color:#aaa}
#nj3 .tc{position:absolute;inset:0;pointer-events:none}
#nj3 .tc button{position:absolute;pointer-events:auto;width:58px;height:58px;border-radius:50%;background:rgba(30,24,18,.55);color:#f4ead0;border:1px solid rgba(242,193,78,.6);font:bold 13px sans-serif}
#nj3 .joy{position:absolute;width:110px;height:110px;border-radius:50%;border:2px solid rgba(255,255,255,.3);display:none}
#nj3 .joy i{position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.35)}
</style><div class="tl"><div class="goal"></div><div class="tools"></div></div><div class="eye"><span class="el">気配</span><i><u></u></i></div>
<div class="pr"></div><div class="bar"><u></u></div><div class="help"></div><div class="msg"></div><button class="quit" data-q="1">退く</button><div class="load">読み込み中…</div><div class="end" style="display:none"></div><div class="tc"></div><div class="joy"><i></i></div>`;
    hud.querySelector('.quit').addEventListener('click', () => { if (st && !st.end) finish({ ok: null, used: st.used }); });
    addEventListener('keydown', (e) => { if (!N3.on) return; const k = e.key.toLowerCase(); keys.add(k); if (e.code) keys.add(e.code); if (k !== 'f5' && k !== 'f12') e.preventDefault(); e.stopImmediatePropagation(); }, true);
    addEventListener('keyup', (e) => { if (!N3.on) return; keys.delete(e.key.toLowerCase()); if (e.code) keys.delete(e.code); if (e.key === 'Shift') keys.delete('shift'); e.stopImmediatePropagation(); }, true);
    addEventListener('blur', () => keys.clear());
    cv.addEventListener('click', () => { if (N3.on && !isTouch() && document.pointerLockElement !== cv && cv.requestPointerLock) try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 使えない */ } });
    addEventListener('mousemove', (e) => { if (!N3.on) return; if (document.pointerLockElement === cv) { look.dx += e.movementX; look.dy += e.movementY; } else if (drag && drag.m) { look.dx += e.movementX * 1.6; look.dy += e.movementY * 1.6; } });
    cv.addEventListener('mousedown', () => { drag = { m: true }; });
    addEventListener('mouseup', () => { drag = null; });
    cv.addEventListener('wheel', (e) => { if (st) st.cam.dist = clamp(st.cam.dist + Math.sign(e.deltaY) * 0.4, 2.2, 7); e.preventDefault(); }, { passive: false });
    // スマホ：左で動き、右で見回す
    cv.addEventListener('touchstart', (e) => { for (const t of e.changedTouches) { if (t.clientX < innerWidth * 0.42 && !joy) { joy = { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0 }; const j = hud.querySelector('.joy'); j.style.display = 'block'; j.style.left = t.clientX - 55 + 'px'; j.style.top = t.clientY - 55 + 'px'; } else if (!drag) drag = { id: t.identifier, x: t.clientX, y: t.clientY }; } e.preventDefault(); }, { passive: false });
    cv.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (joy && t.identifier === joy.id) { joy.dx = clamp((t.clientX - joy.x) / 45, -1, 1); joy.dy = clamp((t.clientY - joy.y) / 45, -1, 1); const l = Math.hypot(joy.dx, joy.dy); if (l > 1) { joy.dx /= l; joy.dy /= l; } hud.querySelector('.joy i').style.transform = `translate(${joy.dx * 35}px,${joy.dy * 35}px)`; } else if (drag && t.identifier === drag.id) { look.dx += (t.clientX - drag.x) * 2.2; look.dy += (t.clientY - drag.y) * 2.2; drag.x = t.clientX; drag.y = t.clientY; } } e.preventDefault(); }, { passive: false });
    const tend = (e) => { for (const t of e.changedTouches) { if (joy && t.identifier === joy.id) { joy = null; hud.querySelector('.joy').style.display = 'none'; } if (drag && t.identifier === drag.id) drag = null; } };
    cv.addEventListener('touchend', tend); cv.addEventListener('touchcancel', tend);
    const tall = (e) => { if (e && e.touches && e.touches.length) return; if (joy) { joy = null; hud.querySelector('.joy').style.display = 'none'; } drag = null; vk.clear(); }; // 2.99.3 指が全部離れたら必ず止める（離しても進み続けることがあった）
    addEventListener('touchend', tall, true); addEventListener('touchcancel', tall, true); addEventListener('blur', () => tall(null));
    return true;
  }
  function touchUi() {
    const tc = hud.querySelector('.tc'); tc.innerHTML = '';
    if (!isTouch()) return;
    const bt = [['e', '行動', 18, 150], ['q', '暗殺', 86, 190], ['f', '担ぐ', 18, 220], ['c', 'しゃがむ', 86, 120], ['shift', '走る', 154, 160], ['1', '煙玉', 150, 250], ['2', '撒菱', 86, 260], ['3', '吹矢', 18, 290]];
    for (const [k, l, r, b] of bt) { const e = document.createElement('button'); e.textContent = l; e.style.right = r + 'px'; e.style.bottom = b + 'px'; e.addEventListener('touchstart', (ev) => { vk.add(k); ev.preventDefault(); ev.stopPropagation(); }, { passive: false }); e.addEventListener('touchend', (ev) => { vk.delete(k); ev.preventDefault(); }); tc.appendChild(e); }
  }

  function readInput() {
    const has = (...ks) => ks.some((k) => keys.has(k) || vk.has(k));
    const I = { mx: 0, my: 0, run: false, e: false, q: false, f: false, c: false, t1: false, t2: false, t3: false, quit: false, help: false };
    if (has('a', 'arrowleft', 'KeyA')) I.mx -= 1; if (has('d', 'arrowright', 'KeyD')) I.mx += 1; if (has('w', 'arrowup', 'KeyW')) I.my += 1; if (has('s', 'arrowdown', 'KeyS')) I.my -= 1;
    I.run = has('shift'); I.e = has('e', ' '); I.q = has('q'); I.f = has('f', 'g'); I.c = has('c', 'control'); I.t1 = has('1', 'Digit1'); I.t2 = has('2', 'Digit2'); I.t3 = has('3', 'Digit3'); I.quit = has('escape', 'p'); I.help = has('h');
    if (joy) { I.mx += joy.dx; I.my -= joy.dy; if (Math.hypot(joy.dx, joy.dy) > 0.95) I.run = I.run || false; }
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [], gp = pads.find((p) => p.buttons.some((b) => b && b.pressed)) || pads[0];
    if (gp) {
      const ax = gp.axes, b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (Math.hypot(ax[0] || 0, ax[1] || 0) > 0.2) { I.mx += ax[0]; I.my -= ax[1]; }
      if (Math.abs(ax[2] || 0) > 0.15) look.dx += (ax[2] || 0) * 14; if (Math.abs(ax[3] || 0) > 0.15) look.dy += (ax[3] || 0) * 10;
      I.e = I.e || b(0); I.q = I.q || b(2); I.f = I.f || b(3); I.c = I.c || b(1); I.run = I.run || b(7) || b(10); I.t1 = I.t1 || b(14); I.t2 = I.t2 || b(12); I.t3 = I.t3 || b(15); I.quit = I.quit || (b(9) && !prevPad[9]); prevPad[9] = b(9);
    }
    const l = Math.hypot(I.mx, I.my); if (l > 1) { I.mx /= l; I.my /= l; }
    // 押した瞬間
    const now = new Set(Object.keys(I).filter((k) => I[k] === true)), was = new Set(prevK);
    I.tap = (k) => now.has(k) && !was.has(k);
    prevK.clear(); for (const k of now) prevK.add(k);
    return I;
  }

  // ---- 始める ----
  N3.start = (opt, done) => {
    if (!N3.can() || !initRenderer()) { N3.failed = true; return SGK.NINJA.start(opt.q.k, opt.d, done); }
    cb = done; CO = opt.co ? { lead: opt.co.leader === opt.co.me, me: opt.co.me, leader: opt.co.leader, members: opt.co.members || [], names: opt.co.names || {}, send: opt.co.send, ghosts: {}, snapT: 0, poseT: 0, rx: performance.now() + 12000, t0: performance.now(), ready: false, snap: null, endMsg: null, pv: opt.co.pvp ? opt.co.pvp.role : null, pvFoe: opt.co.pvp ? opt.co.pvp.foe : null } : null; N3.wantNight = !!(opt.d && opt.d.night); N3.on = true; keys.clear(); vk.clear(); prevK.clear(); prevPad = { 9: true }; look = { dx: 0, dy: 0 };
    cv.style.display = 'block'; hud.style.display = 'block'; hud.querySelector('.load').style.display = 'flex'; hud.querySelector('.end').style.display = 'none';
    loadModels().then(() => { if (N3.on) setup(opt); }).catch((e) => { console.warn('忍びの3Dを読めませんでした', e); N3.on = false; cv.style.display = 'none'; hud.style.display = 'none'; N3.failed = true; SGK.NINJA.start(opt.q.k, opt.d, done); });
  };
  // テスト用：工作の種類・城・昼夜を選んですぐ遊ぶ（結果はどこにも送らない）
  N3.test = (k, ck, night, kai, sk) => N3.start({ q: { k, sk: sk || 'mitsu', whoName: '某', id: 'test' + Math.random() }, d: { ck, night: !!night, kai: kai || 0, guards: 3 + (kai || 0) + 3, lv: 2 }, tools: { kemuri: 3, makibishi: 3, fukiya: 5, kaginawa: 1 } }, (r) => { if (SGK.toast) SGK.toast(JSON.stringify(r)); else console.log('忍びの結果', r); });

  // 2.57.0 テスト用：城の守り（曲者の人数 n）
  N3.testDef = (k, ck, night, kai, sk, n) => N3.start({ def: { n: n || 2 }, q: { k, sk: sk || 'mitsu', whoName: '某', id: 'tdef' + Math.random() }, d: { ck, night: !!night, kai: kai || 0, guards: 3 + (kai || 0) + 3, lv: 2 }, tools: { kemuri: 3, makibishi: 3, fukiya: 5, kaginawa: 1 } }, (r) => { if (SGK.toast) SGK.toast(JSON.stringify(r)); else console.log('守りの結果', r); });
  N3.dbg = () => st; // 確かめる用
  // 2.101.9 ほかの遊び（かくれんぼ）からも、骨入りの人のモデルと動きを使えるように
  N3.mdl = { load: () => { T = window.THREE; return loadModels(); }, ready: () => MD.ready, mk: (rig, o) => mkChar(rig, o), play: (ch, n, o) => play(ch, n, o), tick: (ch, dt) => tick(ch, dt, null) };
  N3.night = () => !!(st ? st.night : N3.wantNight); // 2.24.1 夜の任務は専用の曲（audio.js の ninja_night）
  function setup(opt) {
    const q = opt.q, d = opt.d, R = rngOf(opt.seed || q.id || 'x'), E = eff(), shadow = !!E.sh, night = !!d.night;
    const job = { k: q.k, sk: q.sk || 'mitsu', whoName: q.whoName };
    const L = makeLevel(job, d, R); LV = L; indexSolids(L);
    for (const c of L.climbs) { c.B.y = wetAt(c.B.x, c.B.z) ? SWIM_Y : floorAt(c.B.x, c.B.z, baseAt(c.B.x, c.B.z) + 0.6); if (c.kind === 'noki') { c.U.y = floorAt(c.U.x, c.U.z, 50); } }
    L.climbs = L.climbs.filter((c) => c.U.y - c.B.y > 1.2 && canStand(c.B.x, c.B.z, c.B.y, 1.6, STEP));
    buildNav(L);
    scene = new T.Scene(); const grp = new T.Group(); scene.add(grp);
    const sky = night ? 0x0d1326 : 0xa9c8e6; scene.background = new T.Color(sky); scene.fog = new T.Fog(sky, night ? 18 : 60, night ? 80 : 190);
    const hemi = new T.HemisphereLight(night ? 0x5a6a9a : 0xdfe9ff, night ? 0x141218 : 0x6a5a40, night ? 0.4 : 0.75); scene.add(hemi);
    const sun = new T.DirectionalLight(night ? 0x9fb4ff : 0xfff0d8, night ? 0.36 : 1.7); sun.position.set(W / 2 - 40, 80, D / 2 - 30); sun.target.position.set(W / 2, 0, D / 2); scene.add(sun, sun.target);
    if (shadow) { sun.castShadow = true; const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 220; sun.shadow.mapSize.set(E.sh >= 2 ? 4096 : 2048, E.sh >= 2 ? 4096 : 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; }
    rd.shadowMap.enabled = shadow; rd.setPixelRatio(E.pr || 1);
    if (night) { // 灯籠の明かり（近いものから8つまで）
      const ls = L.lamps.slice(0, 8);
      for (const l of ls) { const p = new T.PointLight(0xffb060, 1.6, 13, 2); p.position.set(l.x, baseAt(l.x, l.z) + 1.3, l.z); scene.add(p); }
      const moon = new T.Mesh(new T.SphereGeometry(4, 16, 12), new T.MeshBasicMaterial({ color: 0xf2efe0, fog: false })); moon.position.set(-60, 120, -80); scene.add(moon);
    }
    buildScene(L, grp, shadow, night);
    cam = new T.PerspectiveCamera(60, 1, 0.1, 400);
    // 人
    const S = st = { t: 0, L, job, d, night, scene, grp, guards: [], folk: [], bodies: [], smokes: [], makis: [], darts: [], fires: [], used: { kemuri: 0, makibishi: 0, fukiya: 0 }, tools: Object.assign({ kemuri: 0, makibishi: 0, fukiya: 0, kaginawa: 0 }, opt.tools || {}),
      kills: 0, unseen: true, others: [], alertAll: false, alertT: 0, done: 0, need: q.k === 'rumor' ? 3 : 1, end: null, endT: 0, msg: '', msgT: 0, help: true, cam: { yaw: Math.PI, pitch: 0.28, dist: 4.2 } };
    const P = S.p = { x: L.start.x, z: L.start.z, y: 0, vy: 0, yaw: Math.PI, yawT: Math.PI, crouch: false, run: false, swim: false, carry: null, lock: null, work: 0, workK: 0, air: false, fallFrom: 0, noiseT: 0, crouchK: 0, swimF: 0, ch: mkChar('t1', { tint: 0x1c2233, hood: true, weps: ['katana'] }) };
    attach(P.ch, 'katana', false); scene.add(P.ch.root);
    // 見張り
    const ng = clamp(Math.round((d.guards || 4) * 1.8) + 4, 8, 30), // 2.42.0 見張りを大きく増やして難しく
       townN = q.k === 'rumor' ? 3 + Math.floor(ng / 3) : 1;
    const mkG = (x, z, yaw, rig, wep, post, y) => { const ch = mkChar(rig || 't2', { weps: [wep || 'yari'] }); scene.add(ch.root); const g = { ch, x, z, y: y != null ? y : floorAt(x, z, 50), yaw, yaw0: yaw, state: post ? 'post' : 'patrol', meter: 0, seeT: 9, path: null, pi: 0, route: null, ri: 0, wait: 0, stun: 0, down: false, dead: false, phase: R() * 6, spr: mkMark(), look: 0 }; g.y = y != null ? y : (navAt(x, z) ?? floorAt(x, z, baseAt(x, z) + 1)); scene.add(g.spr); S.guards.push(g); return g; };
    for (const p of L.posts) mkG(p.x, p.z, p.yaw, p.rig, p.wep, true, p.y);
    const regions = [{ x0: L.OB.x0 + 2, z0: L.OB.z0 + 2, x1: L.OB.x1 - 2, z1: L.OB.z1 - 2, h: L.hO, w: 0.6 }, { x0: L.IB.x0 + 2, z0: L.IB.z0 + 2, x1: L.IB.x1 - 2, z1: L.IB.z1 - 2, h: L.hI, w: 0.4 }];
    const patrolN = Math.max(1, ng - L.posts.length + (q.k === 'hurt' ? 2 : 0));
    for (let i = 0; i < patrolN + townN; i++) {
      const town = i >= patrolN, rg = town ? { x0: 4, z0: 121, x1: W - 4, z1: 129, h: 0 } : regions[i % 3 === 2 ? 1 : 0];
      const pts = []; for (let k = 0; k < (town ? 3 : 4); k++) { const p = randNav(R, rg, rg.h); if (p) pts.push(p); }
      if (pts.length < 2) continue;
      const route = []; for (let k = 0; k < pts.length; k++) { const a = pts[k], b = pts[(k + 1) % pts.length], pth = navPath(a.x, a.z, b.x, b.z); if (pth) { pth[pth.length - 1].stop = 1; route.push(...pth); } }
      if (route.length < 2) continue;
      const g = mkG(pts[0].x, pts[0].z, 0, 't2', 'yari', false); g.route = route; g.ri = 0;
    }
    // 町人（流言の相手は3人、ほかに昼は町の人）
    const folkN = q.k === 'rumor' ? 3 : 0, extra = night ? 1 : 4;
    for (let i = 0; i < folkN + extra; i++) { const p = randNav(R, { x0: 6, z0: 121, x1: W - 6, z1: 129 }, 0) || { x: 30 + i * 8, z: 125 }; const ch = mkChar('t1', { tint: [0x6a5a3a, 0x3a4a6a, 0x7a4a3a, 0x5a6a4a][i % 4] }); scene.add(ch.root); const f = { ch, x: p.x, z: p.z, y: 0, yaw: R() * 6, tx: p.x, tz: p.z, wait: R() * 3, tgt: i < folkN, told: false }; S.folk.push(f); if (f.tgt) L.targets.push({ name: '町人', folk: f, r: 1.6, done: false, x: f.x, z: f.z, y: 0 }); }
    // 寝ている武将・箱・金
    for (const t of L.targets) {
      if (t.gen) { const ch = mkChar('t4', {}); ch.root.position.set(t.x, t.y + 0.05, t.z); ch.root.rotation.y = Math.PI / 2; scene.add(ch.root); S.others.push(ch); if (has(ch, 'sleeping')) play(ch, 'sleeping', { fade: 0 }); else { const a = play(ch, 'die', { once: true, fade: 0 }); a.time = a.getClip().duration; } t.ch = ch; tick(ch, 0.5, null); ch.root.updateMatrixWorld(true); const hp = ch.bones.Hips.getWorldPosition(new T.Vector3()); ch.root.position.x += t.x - hp.x; ch.root.position.z += t.z - hp.z; ch.root.position.y += t.y + 0.2 - hp.y; const fb = new T.Mesh(new T.BoxGeometry(2.2, 0.12, 1.2), makeMats().futon); fb.position.set(t.x, t.y + 0.06, t.z); scene.add(fb); } // 寝ている姿の腰が布団の真ん中に来るように
      if (t.chest) { const b = new T.Mesh(new T.BoxGeometry(0.9, 0.5, 0.6), makeMats().box); b.position.set(t.x, t.y + 0.25, t.z); b.castShadow = true; scene.add(b); }
      t.mk = mkTarget(); scene.add(t.mk);
    }
    S.exitMk = mkTarget(0x9fe08a); S.exitMk.visible = false; scene.add(S.exitMk);
    S.reticle = mkRing(); S.reticle.visible = false; scene.add(S.reticle);
    if (CO) { // 2.41.0 仲間の姿を作り、スタートの位置を少しずつずらす
      const ids = CO.members, idx = Math.max(0, ids.indexOf(CO.me)); if (!CO.pv) P.x += (idx - (ids.length - 1) / 2) * 1.6;
      ids.forEach((pid, i) => { if (pid === CO.me) return; const foe = CO.pvFoe === pid; const ch = mkChar('t1', { tint: foe ? 0x4a1414 : [0x1c2233, 0x33201c, 0x1c3320][i % 3], hood: true, weps: ['katana'] }); attach(ch, 'katana', false); scene.add(ch.root); CO.ghosts[pid] = { id: pid, pvGhost: foe, name: CO.names[pid] || (foe ? '相手' : '仲間'), ch, x: P.x, y: 0, z: P.z, yaw: Math.PI, dx: P.x, dy: 0, dz: P.z, dyaw: Math.PI, crouch: false, run: false, swim: false, moving: false, carry: null, work: 0, climb: false, hide: false, crouchK: 0, lock: null, gone: false, got: false, rx: performance.now() }; });
    }
    if (opt.def) { // 2.57.0 城の守り：本丸の門の前から始める。見張りは味方
      P.x = L.CX + 3; P.z = L.mizu ? 65 : L.IB.z1 + 3; P.yaw = P.yawT = Math.PI; S.cam.yaw = Math.PI;
      setupDef(opt.def, R);
    }
    P.y = floorAt(P.x, P.z, 1);
    touchUi(); hud.querySelector('.load').style.display = 'none';
    if (!S.def) say(night ? '夜の闇にまぎれて城下に着いた' : '昼の城下に着いた。人目に気をつけろ', 3);
    resize(); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  const navAt = (x, z) => { const k = clamp(Math.floor(z), 0, D - 1) * W + clamp(Math.floor(x), 0, W - 1); return LV.navOK[k] ? LV.navH[k] : null; };
  function spriteTex(fn, w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; }
  let TX = null;
  function texs() {
    if (TX) return TX;
    const mark = (s, col) => spriteTex((g, w, h) => { g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(s, w / 2, h / 2 + 2); g.fillStyle = col; g.fillText(s, w / 2, h / 2 + 2); }, 64, 64);
    TX = { q: mark('？', '#ffd84a'), x: mark('！', '#ff4a3a'), z: mark('z', '#cfe3ff'),
      tg: spriteTex((g, w, h) => { g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w - 10, h / 2 - 6); g.lineTo(w / 2, h - 18); g.lineTo(10, h / 2 - 6); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(w / 2, 12); g.lineTo(w - 18, h / 2 - 6); g.lineTo(w / 2, h - 26); g.lineTo(18, h / 2 - 6); g.closePath(); g.fill(); }, 64, 72),
      ring: spriteTex((g, w, h) => { g.strokeStyle = '#ff6a50'; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 6, 0, 7); g.stroke(); g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, 18); g.moveTo(w / 2, h - 4); g.lineTo(w / 2, h - 18); g.moveTo(4, h / 2); g.lineTo(18, h / 2); g.moveTo(w - 4, h / 2); g.lineTo(w - 18, h / 2); g.stroke(); }, 64, 64),
      smoke: spriteTex((g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(210,210,205,.95)'); gr.addColorStop(0.6, 'rgba(180,180,175,.55)'); gr.addColorStop(1, 'rgba(160,160,155,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 64, 64),
      fire: spriteTex((g, w, h) => { const gr = g.createRadialGradient(w / 2, h * 0.65, 2, w / 2, h * 0.6, w / 2); gr.addColorStop(0, 'rgba(255,240,160,1)'); gr.addColorStop(0.4, 'rgba(255,140,40,.85)'); gr.addColorStop(1, 'rgba(200,40,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, 64, 64) };
    return TX;
  }
  const mkMark = () => { const s = new T.Sprite(new T.SpriteMaterial({ map: texs().q, depthTest: false, transparent: true })); s.scale.set(0.6, 0.6, 1); s.visible = false; s.renderOrder = 10; return s; };
  const mkTarget = (col) => { const s = new T.Sprite(new T.SpriteMaterial({ map: texs().tg, color: col || 0xf2c14e, depthTest: false, transparent: true, sizeAttenuation: false })); s.scale.set(0.035, 0.04, 1); s.renderOrder = 11; return s; };
  const mkRing = () => { const s = new T.Sprite(new T.SpriteMaterial({ map: texs().ring, depthTest: false, transparent: true, sizeAttenuation: false })); s.scale.set(0.05, 0.05, 1); s.renderOrder = 12; return s; };
  function say(m, t) { st.msg = m; st.msgT = t || 2.2; }
  function resize() { if (!rd) return; const w = innerWidth, h = innerHeight; rd.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  addEventListener('resize', () => { if (N3.on && cam) resize(); });

  function loop(t) {
    if (!N3.on) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    if (!st) return;
    try { step(dt); if (st) render(dt); } catch (e) { console.error(e); if (st) finish({ ok: null, used: st.used }); }
  }
  function finish(r) {
    if (CO && st) { // 2.41.0 仲間へ終わりを知らせる
      if (CO.lead) { const S0 = st; coSend(coFollowers(), { k: 'end', e: S0.end || 'quit', kills: S0.kills, unseen: S0.unseen ? 1 : 0, cg: S0.caughtBy || 0 }); } else coSend([CO.leader], { k: 'quit' });
    }
    CO = null;
    N3.on = false; cancelAnimationFrame(raf);
    if (document.pointerLockElement === cv) try { document.exitPointerLock(); } catch (e) { /* 無視 */ }
    cv.style.display = 'none'; hud.style.display = 'none'; keys.clear(); vk.clear();
    if (scene) scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isSprite && o.material) o.material.dispose(); });
    scene = null; st = null; LV = null;
    const f = cb; cb = null; if (f) f(r);
  }

  // ---- 見る・聞く ----
  function los(ax, ay, az, bx, by, bz, skipEnd) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz), n = Math.ceil(d / 0.3), e = skipEnd == null ? 0.45 : skipEnd;
    for (let i = 1; i < n; i++) { const k = i / n; if (d * (1 - k) < e) break; const x = ax + dx * k, y = ay + dy * k, z = az + dz * k; if (solidAt(x, y, z)) return false; for (const s of st.smokes) if ((x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2 < s.r * s.r) return false; }
    return true;
  }
  const inGrass = (x, z, y) => Math.abs(y - baseAt(x, z)) < 0.3 && LV.grass.some((g) => (x - g.x) ** 2 + (z - g.z) ** 2 < (g.r * 0.92) ** 2);
  const litAt = (x, z) => st.fires.some((f) => (x - f.x) ** 2 + (z - f.z) ** 2 < 144) || (st.night && LV.lamps.some((l) => (x - l.x) ** 2 + (z - l.z) ** 2 < l.r * l.r));
  function seeFactor(g, tx, ty, tz, P) {
    const dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz), eye = g.y + 1.6;
    let range = (st.night ? 14 : 25) * (st.alertAll ? 1.35 : 1); // 2.42.0 見える距離を少し伸ばした
    if (st.night && litAt(tx, tz)) range = Math.max(range, 18);
    if (P) { if (P.crouch) range *= 0.62; if (P.swim) range *= 0.4; if (P.run) range *= 1.15; if (P.hide) range = Math.min(range, 1.6); }
    const near = d < (P && (P.crouch || P.hide) ? 1.1 : 2.2) && Math.abs(ty - eye) < 2.2;
    if (d > range && !near) return 0;
    const a = Math.abs(angD(Math.atan2(dx, dz), g.yaw + g.look));
    if (a > 1.0 && !near) return 0;
    if ((ty - eye) / Math.max(d, 0.5) > 0.95 && !near) return 0;
    if (!los(g.x, eye, g.z, tx, ty, tz)) return 0;
    return near ? 1 : Math.max(0.05, 1 - d / range) * (a < 0.45 ? 1 : 0.6);
  }
  function noise(x, z, r, why, y) {
    if (CO && !CO.lead) { if (why === 'self') coSend([CO.leader], { k: 'noise', x: r2(x), z: r2(z), r, y: r2(st.p.y) }); return; } // 仲間の端末では見張りを動かさない。音はリーダーへ知らせる
    const yy = y != null ? y : st.p.y;
    for (const g of st.guards) { if (g.down || g.stun > 0) continue; const d = Math.hypot(g.x - x, g.z - z); if (d < r && Math.abs(g.y - yy) < 6) { g.meter = Math.max(g.meter, 0.32); toSus(g, x, z); } }
    void why;
  }
  function toSus(g, x, z) { if (g.state === 'body') return; if (g.state !== 'sus') { g.state = 'sus'; g.sub = 'look'; g.timer = 0.9; } g.lx = x; g.lz = z; g.repath = 0; }

  // ---- 1コマ ----
  function step(dt) {
    const S = st, P = S.p, I = readInput(); S.t += dt; S.msgT -= dt;
    S.ps = S.def ? [] : CO && CO.lead ? [P, ...Object.values(CO.ghosts).filter((q) => !q.gone && !q.pvGhost)] : [P]; // 2.57.1 対戦の相手（守る人）は見張りの味方 // 見張りに見える人（協力のときは仲間も。2.57.0 守りのときは味方なので誰も）
    const C = S.cam; C.yaw -= look.dx * 0.0028; C.pitch = clamp(C.pitch + look.dy * 0.0022, -0.55, 1.2); look.dx = 0; look.dy = 0;
    if (S.end) { S.endT -= dt; if (CO && CO.lead) coLead(dt); for (const g of S.guards) stepGuardAnim(g, dt); if (S.def) for (const e of S.def.foes) stepFoeAnim(e, dt); tick(P.ch, dt, { crouch: P.crouchK }); if (S.endT <= 0) { if ((S.end === 'ok' || S.def) && !S.shown) { S.shown = 1; showEnd(); S.endT = 3.2; return; } finish(S.def ? defResult() : { ok: S.end === 'ok', kills: S.kills, unseen: S.unseen, used: S.used }); } return; }
    if (I.tap('quit')) return finish({ ok: null, used: S.used });
    if (I.tap('help')) S.help = !S.help;
    if (I.tap('t1')) useTool('kemuri'); if (I.tap('t2')) useTool('makibishi'); if (I.tap('t3')) useTool('fukiya');
    const ctx = context(P);
    if (P.lock) stepLock(P, dt);
    else {
      if (I.tap('c') && !P.carry && !P.swim) P.crouch = !P.crouch;
      const cy = C.yaw, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
      const vx = fx * I.my + rx * I.mx, vz = fz * I.my + rz * I.mx, m = Math.hypot(vx, vz);
      P.run = I.run && m > 0.1 && !P.carry && !P.swim; if (P.run) P.crouch = false;
      const working = ctx.work && I.e && !ctx.ko;
      const sp = working ? 0 : P.swim ? SPD.swim : P.carry ? SPD.carry : P.run ? SPD.run : P.crouch ? SPD.crouch : SPD.walk;
      P.moving = m > 0.05 && sp > 0;
      if (P.moving) { P.yawT = Math.atan2(vx, vz); const hh = P.swim ? 0.9 : P.crouch ? 1.1 : 1.7, stp = P.swim ? 2.1 : STEP, dx = vx * sp * dt, dz = vz * sp * dt; if (canStand(P.x + dx, P.z, P.y, hh, stp)) P.x += dx; if (canStand(P.x, P.z + dz, P.y, hh, stp)) P.z += dz; }
      P.yaw += angD(P.yawT, P.yaw) * (1 - Math.exp(-12 * dt));
      // 高さ（段を上がる・落ちる・泳ぐ）
      const fl = floorAt(P.x, P.z, P.y, P.swim ? 2.1 : STEP);
      if (fl < P.y - 0.03) { if (!P.air) { P.air = true; P.fallFrom = P.y; } P.vy -= GRAV * dt; P.y += P.vy * dt; if (P.y <= fl) { P.y = fl; P.vy = 0; P.air = false; if (P.fallFrom - fl > 2.6 && !wetAt(P.x, P.z)) { noise(P.x, P.z, 8, 'self'); say('どさっ（物音を立てた）', 1.2); if (has(P.ch, 'hard_landing')) { P.lock = { kind: 'land', t: 0, dur: 0.7 }; play(P.ch, 'hard_landing', { once: true, restart: true, speed: 1.4, fade: 0.05 }); } } } }
      else { P.y = fl; P.vy = 0; P.air = false; }
      P.swim = wetAt(P.x, P.z) && P.y <= SWIM_Y + 0.05; if (P.swim) { P.crouch = false; if (P.carry) dropBody(P, true); }
      if (!P.air) unstick(P, P.swim ? 0.9 : P.crouch ? 1.1 : 1.7); // 2.60.10 めり込んだら押し出す
      if (P.run && P.moving) { P.noiseT -= dt; if (P.noiseT <= 0) { P.noiseT = 0.45; noise(P.x, P.z, 4.5, 'self'); } }
      // 行動
      if (I.tap('e') && ctx.koP) pvpHit(ctx.koP, false); else if (I.tap('e')) { if (ctx.ko) takedown(ctx.ko, false); else if (!ctx.work && ctx.climb) startClimb(P, ctx.climb); else if (!ctx.work && ctx.noClimb) say('鉤縄がないと登れない', 1.6); }
      if (I.tap('q') && ctx.koP && CO && CO.pv === 'def') pvpHit(ctx.koP, true); else if (I.tap('q') && ctx.kill) takedown(ctx.kill, true);
      if (I.tap('f')) { if (P.carry) dropBody(P); else if (ctx.body) pickBody(P, ctx.body); }
      if (working) { P.work += dt; const tg = ctx.work; P.yawT = Math.atan2(tg.x - P.x, tg.z - P.z); if (tg.folk) tg.folk.wait = 1; if (P.work >= (JOB[S.job.k] || JOB.sabo).hold) { P.work = 0; complete(tg); } } else P.work = 0;
    }
    P.crouchK += ((P.crouch || (P.work > 0 && !ctx.work?.folk) ? 1 : 0) - P.crouchK) * (1 - Math.exp(-10 * dt));
    P.hide = P.crouch && inGrass(P.x, P.z, P.y);
    // 見張り・町人・道具
    S.maxM = 0;
    if (CO && !CO.lead) { if (coFollowStep(dt)) return; }
    else {
      if (CO && !CO.ready) coWaitReady(); // 仲間の準備ができるまで見張りは動かさない
      if (!(CO && !CO.ready)) { for (const g of S.guards) { stepGuard(g, dt); if (!g.down) S.maxM = Math.max(S.maxM, g.meter); if (S.end) { if (CO) coLead(dt, true); return; } } }
      else for (const g of S.guards) stepGuardAnim(g, dt);
      for (const f of S.folk) stepFolk(f, dt);
    }
    for (const c of S.others) tick(c, dt, null);
    if (S.def) { stepDef(dt); if (S.end) { S.ctx = ctx; return; } }
    stepFx(dt);
    if (S.pmakis) S.pmakis = S.pmakis.filter((m) => { if (!P.lock && !P.crouch && Math.hypot(P.x - m.x, P.z - m.z) < 0.8 && Math.abs(P.y - m.y) < 0.6) { P.lock = { kind: 'stun', t: 0, dur: 1.6 }; play(P.ch, 'hit', { once: true, restart: true, fade: 0.05 }); say('撒菱を踏んだ！', 1.4); S.scene.remove(m.g); return false; } return true; }); // 2.57.1 守る人の撒菱
    if (S.alertAll) S.alertT += dt;
    // 戻った
    if (!(CO && !CO.lead) && S.done >= S.need && S.ps.every((q) => q.x > LV.exit.x0 && q.x < LV.exit.x1 && q.z > LV.exit.z0 && !q.lock)) { S.end = 'ok'; S.endT = 0.6; say('城下を抜けた！', 2); }
    else if (CO && CO.lead && S.done >= S.need && P.x > LV.exit.x0 && P.x < LV.exit.x1 && P.z > LV.exit.z0 && !P.lock && S.msgT <= 0) say('仲間が城下の南の端へ戻るのを待っている', 1.5);
    if (CO && CO.lead) coLead(dt, !!S.end);
    else if (CO) coPose(dt);
    S.ctx = ctx;
  }
  function context(P) {
    const S = st, o = {};
    if (P.lock || P.air) return o;
    // 後ろから倒せる見張り（2.57.0 守りのときは曲者：後ろから・目がくらんでいる・逃げているところに追いついたら）
    let best = null, bd = 9;
    if (S.def) for (const e of S.def.foes) {
      if (e.down || e.gone) continue;
      const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz); if (d > (e.state === 'flee' ? 1.7 : 1.9) || Math.abs(P.y - e.y) > 0.9) continue;
      const ok = e.state === 'flee' || e.stun > 0 || inSmoke(e.x, e.y + 1.2, e.z) || Math.abs(angD(Math.atan2(dx, dz), e.yaw)) > 1.85;
      if (ok && d < bd) { bd = d; best = e; }
    }
    if (!S.def) for (const g of S.guards) {
      if (g.down || g.carried) continue;
      const dx = P.x - g.x, dz = P.z - g.z, d = Math.hypot(dx, dz); if (d > 1.9 || Math.abs(P.y - g.y) > 0.9) continue;
      const behind = Math.abs(angD(Math.atan2(dx, dz), g.yaw + g.look)) > 1.85, blind = g.stun > 0 || inSmoke(g.x, g.y + 1.5, g.z);
      if ((behind || blind) && g.meter < 0.75 && d < bd) { bd = d; best = g; }
    }
    if (best && !P.carry && !P.swim) { o.ko = best; o.kill = best; }
    if (CO && CO.pv && !P.carry && !P.swim) { const gh = CO.ghosts[CO.pvFoe]; if (gh && !gh.gone && gh.got) { const dx = P.x - gh.x, dz = P.z - gh.z, d = Math.hypot(dx, dz); if (d < 1.9 && Math.abs(P.y - gh.y) < 0.9 && (gh.stun || inSmoke(gh.x, gh.y + 1.2, gh.z) || Math.abs(angD(Math.atan2(dx, dz), gh.yaw)) > 1.85)) o.koP = gh; } } // 2.57.1 対戦の相手を後ろから
    // 目当て
    if (S.done < S.need && !S.def) for (const t of LV.targets) { if (t.done) continue; const d = Math.hypot(P.x - t.x, P.z - t.z); if (d < t.r && Math.abs(P.y - t.y) < 1.2 && !P.carry && !P.swim) { o.work = t; break; } }
    // 担ぐ
    if (!P.carry && !P.swim && !S.def) for (const g of S.guards) { if (!g.down || g.carried) continue; if (Math.hypot(P.x - g.x, P.z - g.z) < 1.6 && Math.abs(P.y - g.y) < 1) { o.body = g; break; } }
    // 登る・降りる
    if (!P.carry) for (const c of LV.climbs) {
      const db = Math.hypot(P.x - c.B.x, P.z - c.B.z), du = Math.hypot(P.x - c.U.x, P.z - c.U.z);
      const okK = c.kind !== 'noki' || S.tools.kaginawa > 0;
      if (db < 1.15 && Math.abs(P.y - c.B.y) < 0.9) { if (okK) o.climb = { c, up: true }; else o.noClimb = 1; break; }
      if (du < 0.95 && Math.abs(P.y - c.U.y) < 0.6) { o.climb = { c, up: false }; break; }
    }
    return o;
  }
  const inSmoke = (x, y, z) => st.smokes.some((s) => (x - s.x) ** 2 + (y - s.y) ** 2 + (z - s.z) ** 2 < s.r * s.r);
  function startClimb(P, cl) { P.crouch = false; P.lock = { kind: 'climb', c: cl.c, up: cl.up, t: 0, dur: (cl.c.U.y - cl.c.B.y) / 2.4 + 0.6 }; if (cl.c.kind === 'noki') say('鉤縄を掛けた', 1); }
  function stepLock(P, dt) {
    const L = P.lock; L.t += dt; const u = clamp(L.t / L.dur, 0, 1);
    if (L.kind === 'climb') {
      const c = L.c, k = L.up ? u : 1 - u, wx = c.B.x + Math.sin(c.face) * 0.22, wz = c.B.z + Math.cos(c.face) * 0.22;
      if (k < 0.82) { const s = k / 0.82; P.x = wx; P.z = wz; P.y = lerp(c.B.y, c.U.y + 0.05, s); }
      else { const s = (k - 0.82) / 0.18; P.x = lerp(wx, c.U.x, s); P.z = lerp(wz, c.U.z, s); P.y = c.U.y + 0.05 * (1 - s); }
      P.yaw = P.yawT = c.face;
      if (u >= 1) { const e = L.up ? c.U : c.B; P.x = e.x; P.z = e.z; P.y = e.y; P.lock = null; P.air = false; P.vy = 0; P.swim = wetAt(P.x, P.z) && P.y <= SWIM_Y + 0.05; }
    } else if (L.kind === 'take') { if (u >= 1) { P.lock = null; attach(P.ch, 'katana', false); } }
    else if (L.kind === 'throw' || L.kind === 'land' || L.kind === 'stun') { if (u >= 1) P.lock = null; }
  }
  function takedown(g, kill, by) { // by＝仲間（リーダーの端末が、仲間の知らせで倒すとき）
    const S = st, P = by ? null : S.p;
    if (P) {
      const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw), bx = g.x - fx * 0.8, bz = g.z - fz * 0.8;
      if (canStand(bx, bz, P.y, 1.7, STEP)) { P.x = bx; P.z = bz; }
      P.yaw = P.yawT = Math.atan2(g.x - P.x, g.z - P.z); P.crouch = false;
      P.lock = { kind: 'take', t: 0, dur: kill ? 1.2 : 0.85 };
      if (kill) attach(P.ch, 'katana', true);
      play(P.ch, kill && has(P.ch, 'stab') ? 'stab' : kill ? 'sword' : 'spear', { once: true, speed: kill && has(P.ch, 'stab') ? 2.2 : 1.5, restart: true, fade: 0.08 });
      if (CO && !CO.lead) coSend([CO.leader], { k: 'td', gi: S.guards.indexOf(g), kill: kill ? 1 : 0 });
    }
    g.down = true; g.dead = !!kill; g.state = 'down'; g.meter = 0; g.downT = 0; g.spr.visible = false; if (g.ch.wep.yari) g.ch.wep.yari.visible = false;
    knock(g, kill ? 'victim_stab' : 'victim_ko');
    if (kill) S.kills++;
    if (P) say(kill ? '仕留めた' : '当て身で気を失わせた', 1.2);
  }
  function knock(g, vc) { // 2.31.0 倒れる動き（あれば Mixamo の動き、なければ「当たる→倒れる」）
    if (has(g.ch, vc)) { g.lie = vc; g.fallAt = null; play(g.ch, vc, { once: true, restart: true, fade: 0.08, speed: 1.3 }); }
    else { g.lie = 'die'; play(g.ch, 'hit', { once: true, restart: true, fade: 0.05 }); g.fallAt = 0.35; }
  }
  function pickBody(P, g, by) {
    P.carry = g; g.carried = true; g.carrier = by || (CO ? CO.me : null); g.hidden = false; P.crouch = false; g.fallAt = null; play(g.ch, 'idle', { fade: 0.05 });
    if (P === st.p) { say('担いだ（F で下ろす）', 1.2); if (CO && !CO.lead) { g.lock2 = st.t + 1.2; coSend([CO.leader], { k: 'pick', gi: st.guards.indexOf(g) }); } }
  }
  function dropBody(P, silent) {
    const g = P.carry; if (!g) return; P.carry = null; g.carried = false; g.carrier = null;
    if (P === st.p && CO && !CO.lead) { g.lock2 = st.t + 1.2; coSend([CO.leader], { k: 'drop' }); }
    const x = P.x + Math.sin(P.yaw) * 0.7, z = P.z + Math.cos(P.yaw) * 0.7;
    g.x = canStand(x, z, P.y, 0.5, STEP) ? x : P.x; g.z = canStand(x, z, P.y, 0.5, STEP) ? z : P.z; g.y = floorAt(g.x, g.z, P.y + 0.3); g.yaw = P.yaw + Math.PI / 2;
    g.hidden = inGrass(g.x, g.z, g.y) || wetAt(g.x, g.z);
    { const a = play(g.ch, g.lie || 'die', { once: true, restart: true, fade: 0.05 }); a.time = a.getClip().duration - 0.01; }
    if (!silent && P === st.p) say(g.hidden ? '隠した' : '下ろした（草むらや堀に隠すと見つかりにくい）', 1.6);
  }
  function complete(t, remote) { // remote＝仲間の知らせで、リーダーの端末が済ませるとき
    const S = st; if (t.done) return; t.done = true; S.done++;
    if (!remote && CO && !CO.lead) coSend([CO.leader], { k: 'cp', ti: LV.targets.indexOf(t) });
    completeFx(t);
  }
  function completeFx(t) { // 工作が済んだときの見た目・音
    const S = st; if (t.mk) t.mk.visible = false;
    const k = S.job.k;
    if (k === 'rumor') { t.folk.told = true; say(S.done >= S.need ? '噂を流し終えた。城下の南の端へ戻れ' : `噂を流した（${S.done}/${S.need}）`, 2.2); return; }
    if (k === 'sabo') { addFire(t.s); setTimeout(() => { if (st === S && !S.end && !(CO && !CO.lead)) { S.alertAll = true; say('「火事だ！」城中が騒ぎ出した', 2.4); } }, 12000); }
    if (k === 'raid') noise(t.x, t.z, 11, 'fx', t.y);
    if (k === 'hurt') { if (t.ch && !has(t.ch, 'sleeping')) play(t.ch, 'hit', { once: true, restart: true }); noise(t.x, t.z, 14, 'fx', t.y); S.alertAll = true; if (t.ch && !has(t.ch, 'sleeping')) setTimeout(() => { if (t.ch) { const a = play(t.ch, 'die', { once: true, restart: true }); a.time = a.getClip().duration - 0.01; } }, 600); }
    if (S.def) { say(`${t.name || '目当て'}に工作をされた！ 城下の南へ逃げる前に捕らえろ`, 2.6); return; } // 2.57.1 守る人の端末
    say((k === 'hurt' ? '手傷を負わせた！' : k === 'steal' ? `${t.name}を盗み出した！` : k === 'gate' ? '門に細工をした！' : k === 'sabo' ? '兵糧蔵に火を付けた！' : '武器蔵を打ち壊した！') + ' 城下の南の端へ戻れ', 2.6);
  }
  function addFire(s) {
    const S = st, x = (s.x0 + s.x1) / 2, z = (s.z0 + s.z1) / 2, y = s.roof ? s.roof.he : s.top;
    const lt = new T.PointLight(0xff7a30, 2.4, 22, 2); lt.position.set(x, y + 1, z); S.scene.add(lt);
    const sp = []; for (let i = 0; i < 14; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: texs().fire, blending: T.AdditiveBlending, depthWrite: false, transparent: true })); m.position.set(x + (Math.random() - 0.5) * (s.x1 - s.x0), y + Math.random() * 2, z + (Math.random() - 0.5) * (s.z1 - s.z0)); m.userData.b = m.position.clone(); m.userData.p = Math.random() * 6; S.scene.add(m); sp.push(m); }
    S.fires.push({ x, z, y, lt, sp });
  }
  function spawnSmoke(px, py, pz, id, t0) { // 煙玉（px,py,pz＝投げた人の足もと）
    const S = st, sp = [];
    for (let i = 0; i < 16; i++) { const m = new T.Sprite(new T.SpriteMaterial({ map: texs().smoke, color: S.night ? 0x5a5c66 : 0xd8d8d4, depthWrite: false, transparent: true, opacity: 0.75 })); m.position.set(px + (Math.random() - 0.5) * 2, py + 0.5 + Math.random() * 1.6, pz + (Math.random() - 0.5) * 2); m.scale.setScalar(1.5); m.userData.v = new T.Vector3((Math.random() - 0.5) * 1.6, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6); S.scene.add(m); sp.push(m); }
    const o = { id: id != null ? id : (S.fxId = (S.fxId || 0) + 1), x: px, y: py + 1.2, z: pz, r: 1.2, t: t0 || 0, sp }; S.smokes.push(o); return o;
  }
  function spawnMaki(px, py, pz, id) {
    const S = st, g = new T.Group();
    for (let i = 0; i < 14; i++) { const m = new T.Mesh(new T.TetrahedronGeometry(0.06), makeMats().dark); m.position.set((Math.random() - 0.5) * 1.4, 0.04, (Math.random() - 0.5) * 1.4); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); g.add(m); }
    g.position.set(px, py, pz); S.scene.add(g); const o = { id: id != null ? id : (S.fxId = (S.fxId || 0) + 1), x: px, z: pz, y: py, g }; S.makis.push(o); return o;
  }
  function spawnDart(g, ax, ay, az) { const S = st, m = new T.Mesh(new T.CylinderGeometry(0.01, 0.01, 0.25, 4).rotateX(Math.PI / 2), makeMats().wood); S.scene.add(m); S.darts.push({ g, m, t: 0, a: new T.Vector3(ax, ay + 1.5, az), dur: Math.hypot(g.x - ax, g.z - az) / 30 + 0.05 }); }
  function remoteTool(m) { // 仲間が使った道具を、リーダーの端末で出す
    const S = st; if (m.t === 'kemuri') spawnSmoke(m.x, m.y, m.z); else if (m.t === 'makibishi') spawnMaki(m.x, m.y, m.z); else if (m.t === 'fukiya') { const g = S.guards[m.gi]; if (g && !g.down) spawnDart(g, m.x, m.y, m.z); }
  }
  function useTool(k) {
    const S = st, P = S.p; if (P.lock || S.end) return;
    if ((S.tools[k] || 0) - (S.used[k] || 0) <= 0) return say(`${TOOLS.find((t) => t[0] === k)[1]}がない`, 1.2);
    const throwA = () => { P.lock = { kind: 'throw', t: 0, dur: 0.6 }; if (has(P.ch, 'throw')) play(P.ch, 'throw', { once: true, restart: true, speed: 2.2, fade: 0.08 }); };
    const fol = CO && !CO.lead; // 仲間の端末：道具の効き目はリーダーの端末が出す（届いたら見える）
    if (k === 'kemuri') { S.used.kemuri++; throwA(); if (fol) coSend([CO.leader], { k: 'tool', t: k, x: r2(P.x), y: r2(P.y), z: r2(P.z) }); else spawnSmoke(P.x, P.y, P.z); say('煙玉！', 0.8); }
    if (k === 'makibishi') { if (P.swim) return; S.used.makibishi++; throwA(); if (fol) coSend([CO.leader], { k: 'tool', t: k, x: r2(P.x), y: r2(P.y), z: r2(P.z) }); else spawnMaki(P.x, P.y, P.z); say('撒菱を撒いた', 0.8); }
    if (k === 'fukiya') { const g = dartTarget(); if (!g) return say('吹き矢の届く見張りがいない', 1.2); S.used.fukiya++; throwA(); P.yaw = P.yawT = Math.atan2(g.x - P.x, g.z - P.z); if (g.pvGhost && !fol) { coSend([g.id], { k: 'pdart' }); say('吹き矢を当てた！', 1.2); } else if (fol) coSend([CO.leader], { k: 'tool', t: k, x: r2(P.x), y: r2(P.y), z: r2(P.z), gi: S.guards.indexOf(g), pv: g.pvGhost ? 1 : 0 }); else spawnDart(g, P.x, P.y, P.z); }
  }
  function dartTarget() {
    const S = st, P = S.p, C = S.cam, fx = Math.sin(C.yaw), fz = Math.cos(C.yaw); let best = null, ba = 0.32;
    const pg = CO && CO.pv && CO.ghosts[CO.pvFoe], list = (S.def ? S.def.foes : S.guards).concat(pg && !pg.gone && !pg.stun ? [pg] : []); // 2.57.1 対戦の相手にも
    for (const g of list) { if (g.down || g.gone) continue; const dx = g.x - P.x, dz = g.z - P.z, d = Math.hypot(dx, dz); if (d > 17 || d < 0.5) continue; const a = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (a < ba && los(P.x, P.y + 1.5, P.z, g.x, g.y + 1.3, g.z, 0.5)) { ba = a; best = g; } }
    return best;
  }
  function stepFx(dt) {
    const S = st;
    S.smokes = S.smokes.filter((s) => { s.t += dt; s.r = Math.min(4.2, 1.2 + s.t * 3); for (const m of s.sp) { m.position.addScaledVector(m.userData.v, dt * (s.t < 1 ? 2 : 0.4)); m.scale.setScalar(Math.min(4.5, 1.5 + s.t * 1.2)); m.material.opacity = clamp(0.75 * (1 - (s.t - 7) / 2), 0, 0.75); } if (s.t > 9 && !(CO && !CO.lead)) { for (const m of s.sp) { S.scene.remove(m); m.material.dispose(); } return false; } return true; });
    S.darts = S.darts.filter((d) => { d.t += dt; const g = d.g, k = clamp(d.t / d.dur, 0, 1); d.m.position.set(lerp(d.a.x, g.x, k), lerp(d.a.y, g.y + 1.4, k), lerp(d.a.z, g.z, k)); d.m.lookAt(g.x, g.y + 1.4, g.z); if (k >= 1) { S.scene.remove(d.m); if (!g.down) { g.down = true; g.dead = false; g.state = 'down'; g.meter = 0; g.spr.visible = false; knock(g, 'victim_ko'); g.downT = 0; if (g.ch.wep.yari) g.ch.wep.yari.visible = false; say('眠らせた', 1); } return false; } return true; });
    for (const f of S.fires) { f.lt.intensity = 2 + Math.sin(S.t * 13) * 0.4 + Math.sin(S.t * 7.3) * 0.3; for (const m of f.sp) { const ph = (S.t * 0.8 + m.userData.p) % 1; m.position.set(m.userData.b.x, m.userData.b.y + ph * 3, m.userData.b.z); m.scale.setScalar(2.4 * (1 - ph) + 0.3); m.material.opacity = 1 - ph; } }
    if (S.def) S.makis = S.makis.filter((m) => { for (const e of S.def.foes) { if (e.down || e.gone || e.stun > 0) continue; if (Math.hypot(e.x - m.x, e.z - m.z) < 0.85 && Math.abs(e.y - m.y) < 0.5) { e.stun = 5; play(e.ch, 'hit', { once: true, restart: true }); e.revealT = Math.max(e.revealT, 5); say('曲者が撒菱を踏んだ！', 1.4); S.scene.remove(m.g); return false; } } return true; });
    else if (!(CO && !CO.lead)) S.makis = S.makis.filter((m) => { for (const g of S.guards) { if (g.down || g.stun > 0) continue; if (Math.hypot(g.x - m.x, g.z - m.z) < 0.85 && Math.abs(g.y - m.y) < 0.5) { g.stun = 6; g.meter = 0; g.state = g.route ? 'back' : 'post'; play(g.ch, 'hit', { once: true, restart: true }); say('見張りが撒菱を踏んだ', 1.2); S.scene.remove(m.g); noise(g.x, g.z, 5); return false; } } return true; });
  }

  // ---- 見張り ----
  function follow(g, sp, dt) {
    if (!g.path || g.pi >= g.path.length) return true;
    const p = g.path[g.pi], dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
    if (d < 0.25) { g.pi++; if (p.stop && g.state === 'patrol') g.wait = 1.6 + Math.random() * 2.4; return g.pi >= g.path.length; }
    const m = Math.min(d, sp * dt); g.x += dx / d * m; g.z += dz / d * m;
    const fl = navAt(g.x, g.z); if (fl != null) g.y += (fl - g.y) * Math.min(1, dt * 12);
    g.yaw += angD(Math.atan2(dx, dz), g.yaw) * Math.min(1, dt * 7);
    return false;
  }
  function stepGuard(g, dt) {
    const S = st, P = S.p;
    if (g.down) { stepGuardAnim(g, dt); return; }
    g.look *= 0.95;
    if (g.stun > 0) { g.stun -= dt; g.meter = Math.max(0, g.meter - dt); stepGuardAnim(g, dt); return; }
    if (inSmoke(g.x, g.y + 1.5, g.z)) { g.meter = Math.max(0, g.meter - dt * 0.8); g.stun = Math.max(g.stun, 1.5); }
    // 見る
    let f = 0, vp = P; // 2.41.0 いちばんよく見える人に反応する（協力のときは仲間も）
    for (const q of S.ps) { const ff = seeFactor(g, q.x, q.y + (q.swim ? 0.25 : q.crouch ? 0.75 : 1.3), q.z, q); if (ff > f) { f = ff; vp = q; } }
    if (f > 0 && !N3.god) { g.meter += dt * (0.4 + 2.3 * f * f) * (S.alertAll ? 1.5 : 1); g.seeT = 0; if (g.meter >= 0.28) { toSus(g, vp.x, vp.z); S.unseen = false; } }
    else { g.seeT += dt; if (g.seeT > 1.2) g.meter = Math.max(0, g.meter - dt * 0.2); }
    if (g.meter >= 1) { S.end = 'ng'; S.endT = 1.8; g.spr.material.map = texs().x; g.spr.visible = true; g.yaw = Math.atan2(vp.x - g.x, vp.z - g.z); play(g.ch, 'spear', { once: true, restart: true }); say(vp === P ? '見つかった！' : `見つかった！（${vp.name || '仲間'}）`, 2); return; }
    // 倒れた仲間に気づく
    if (g.state === 'patrol' || g.state === 'post' || g.state === 'back') for (const b of S.guards) {
      if (!b.down || b.carried || b.hidden || b.found || b === g) continue;
      if (seeFactor(g, b.x, b.y + 0.3, b.z, null) > 0) { g.state = 'body'; g.body = b; g.path = navPath(g.x, g.z, b.x, b.z); g.pi = 0; break; }
    }
    // 動く
    let sp = (S.alertAll ? 1.6 : 1.2), moving = false;
    if (g.state === 'post') { g.yaw = g.yaw0 + Math.sin(S.t * 0.35 + g.phase) * 0.85; }
    else if (g.state === 'patrol') {
      if (g.wait > 0) { g.wait -= dt; g.look = Math.sin(S.t * 1.3 + g.phase) * 0.9; }
      else { if (!g.path) { g.path = g.route; g.pi = g.ri || 0; } moving = true; if (follow(g, sp, dt)) { g.pi = 0; } g.ri = g.pi; }
    } else if (g.state === 'sus') {
      if (g.sub === 'look') { g.timer -= dt; g.yaw += angD(Math.atan2(g.lx - g.x, g.lz - g.z), g.yaw) * Math.min(1, dt * 5); if (g.timer <= 0) { g.sub = 'go'; g.path = navPath(g.x, g.z, g.lx, g.lz); g.pi = 0; g.repath = 1; } }
      else if (g.sub === 'go') { g.repath -= dt; if (g.repath <= 0 && g.path && g.path.length && Math.hypot(g.path[g.path.length - 1].x - g.lx, g.path[g.path.length - 1].z - g.lz) > 2) { g.path = navPath(g.x, g.z, g.lx, g.lz); g.pi = 0; g.repath = 1; } moving = true; sp *= g.meter > 0.5 ? 1.5 : 1; if (!g.path || follow(g, sp, dt)) { g.sub = 'search'; g.timer = 4.5; } }
      else { g.timer -= dt; g.look = Math.sin(S.t * 1.6 + g.phase) * 1.2; if (g.timer <= 0 && g.meter < 0.25) backToRoute(g); }
    } else if (g.state === 'body') {
      moving = true; if (!g.path || follow(g, sp * 1.4, dt)) { g.body.found = true; if (!S.alertAll) say('倒れた仲間が見つかった！ 城中が気を張っている', 2.4); S.alertAll = true; g.state = 'sus'; g.sub = 'search'; g.timer = 6; }
    } else if (g.state === 'back') {
      moving = true; if (!g.path || follow(g, sp, dt)) { if (g.route) { g.state = 'patrol'; g.path = g.route; g.pi = g.ri = nearestRi(g); } else { g.state = 'post'; } }
    }
    g.moving = moving;
    stepGuardAnim(g, dt);
  }
  function nearestRi(g) { let b = 0, bd = 1e9; g.route.forEach((p, i) => { const d = (p.x - g.x) ** 2 + (p.z - g.z) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
  function backToRoute(g) {
    g.state = 'back';
    if (g.route) { const p = g.route[nearestRi(g)]; g.path = navPath(g.x, g.z, p.x, p.z); }
    else { g.path = navPath(g.x, g.z, g.hx != null ? g.hx : g.x, g.hz != null ? g.hz : g.z); }
    g.pi = 0;
  }
  function stepGuardAnim(g, dt) {
    const ch = g.ch;
    if (g.down) {
      if (g.fallAt != null) { g.fallAt -= dt; if (g.fallAt <= 0) { g.fallAt = null; play(ch, 'die', { once: true, restart: true, fade: 0.1 }); } }
      if (g.carried) { const P = CO && g.carrier && g.carrier !== CO.me ? CO.ghosts[g.carrier] || st.p : st.p; ch.root.position.set(P.x, P.y + 1.45, P.z); ch.root.rotation.set(0, P.yaw, 0); ch.root.rotateZ(Math.PI / 2); ch.root.rotateX(0.35); ch.root.translateY(-0.95); } // 担ぐ：立った姿を横にして、腰を肩に載せる
      else { ch.root.position.set(g.x, g.y, g.z); ch.root.rotation.set(0, g.yaw, 0); }
      tick(ch, dt, null); if (g.dead === false && g.carried === false && st.t % 2 < 0.02) { /* 気絶 */ }
      return;
    }
    if (g.hx == null) { g.hx = g.x; g.hz = g.z; }
    ch.root.position.set(g.x, g.y, g.z); ch.root.rotation.set(0, g.yaw, 0);
    if (g.stun > 0) { if (ch.cur !== 'hit' || !ch.acts.hit.isRunning()) play(ch, 'idle'); }
    else if (g.moving) play(ch, st.alertAll && g.state !== 'patrol' ? 'run' : 'walk', { speed: st.alertAll ? 1.1 : 0.9 });
    else if (ch.cur !== 'spear') play(ch, has(ch, 'look_around') && (g.wait > 0 || (g.state === 'sus' && g.sub === 'search')) ? 'look_around' : 'idle');
    tick(ch, dt, { look: ch.cur === 'look_around' ? 0 : g.look * 0.6, foot: g.stun > 0 });
    const show = g.meter > 0.05 && !st.end;
    g.spr.visible = show || (st.end === 'ng' && g.meter >= 1);
    if (show) { g.spr.material.map = g.meter > 0.75 ? texs().x : texs().q; const k = 0.35 + g.meter * 0.5; g.spr.scale.set(k, k, 1); }
    g.spr.position.set(g.x, g.y + 2.3, g.z);
  }
  function stepFolk(f, dt) {
    const ch = f.ch;
    if (f.wait > 0) { f.wait -= dt; play(ch, f.tgt && !f.told && has(ch, 'talking') && Math.hypot(st.p.x - f.x, st.p.z - f.z) < 2 ? 'talking' : 'idle'); if (f.tgt && !f.told) { const P = st.p; if (Math.hypot(P.x - f.x, P.z - f.z) < 2) f.yaw += angD(Math.atan2(P.x - f.x, P.z - f.z), f.yaw) * Math.min(1, dt * 4); } }
    else {
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
      if (d < 0.3) { f.wait = 1 + Math.random() * 4; const p = randNav(Math.random, { x0: 6, z0: 121, x1: W - 6, z1: 129 }, 0); if (p) { f.tx = p.x; f.tz = p.z; } }
      else { const m = 0.9 * dt, nx = f.x + dx / d * m, nz = f.z + dz / d * m; if (canStand(nx, nz, 0, 1.7, STEP)) { f.x = nx; f.z = nz; } else { f.tx = f.x; f.tz = f.z; } f.yaw += angD(Math.atan2(dx, dz), f.yaw) * Math.min(1, dt * 5); play(ch, 'walk', { speed: 0.75 }); }
    }
    ch.root.position.set(f.x, f.y, f.z); ch.root.rotation.set(0, f.yaw, 0); tick(ch, dt, null);
    for (const t of LV.targets) if (t.folk === f) { t.x = f.x; t.z = f.z; }
  }

  // =====================================================================
  // 2.57.0 城の守り：味方の城に入り込んだ曲者（敵の忍び）を見つけ、追って当て身で捕らえる。
  // 曲者はしゃがんで目当て（兵糧蔵・武器蔵・城門・寝所・金蔵など）へ忍び寄り、着くと工作を始める。工作が済めば負け。
  // 曲者はこちらに気づくと煙玉を投げて城下の南へ逃げ、近づくと撒菱を撒く。逃げきられたら捕らえそこね。
  // 見張り（味方）が曲者を見ると「曲者だ！」と知らせてくれる（印が出る）
  // =====================================================================
  const DEFC = { sneak: 1.6, hurry: 2.4, flee: 4.5, work: 35 }, VOL = { sabo: '火を付けようとしている', raid: '打ち壊そうとしている', gate: '細工しようとしている', hurt: '手傷を負わせようとしている', steal: '盗み出そうとしている', rumor: '噂を流そうとしている' };
  const quarter = (x, z) => { const ns = z < 45 ? '北' : z > 80 ? '南' : '', ew = x < LV.CX - 15 ? '西' : x > LV.CX + 15 ? '東' : ''; return ns + ew ? `${ns}${ew}の曲輪` : '城の真ん中'; };
  function setupDef(o, R) {
    const S = st, P = S.p, L = LV, tg = L.targets[0], n = clamp(o.n || 1, 1, 3);
    S.def = { n, foes: [], alarm: null, seen: null, seenT: 0, lost: false, tg };
    S.def.mk = new T.Sprite(new T.SpriteMaterial({ map: texs().q, depthTest: false, transparent: true })); S.def.mk.scale.set(0.9, 0.9, 1); S.def.mk.renderOrder = 10; S.def.mk.visible = false; S.scene.add(S.def.mk);
    if (o.pvp) { S.def.pvp = true; S.def.stepped = new Set(); say(`${CO ? `「${CO.names[CO.pvFoe] || '相手'}」` : '曲者'}が忍び込んできた！ 見つけて、後ろから当て身で捕らえよ`, 5); return; } // 2.57.1 人の曲者（相手の姿は仲間と同じしくみで届く）
    const rg = { x0: L.OB.x0 + 3, z0: L.OB.z0 + 3, x1: L.OB.x1 - 3, z1: L.OB.z1 - 3 };
    for (let i = 0; i < n; i++) {
      let sp = null, path = null;
      for (let k = 0; k < 60 && !path; k++) {
        const p = randNav(R, rg, null); if (!p) continue;
        if (Math.hypot(p.x - P.x, p.z - P.z) < 24 || Math.hypot(p.x - tg.x, p.z - tg.z) < 20) continue;
        const pth = navPath(p.x, p.z, tg.x, tg.z); if (pth && pth.length > 4) { sp = p; path = pth; }
      }
      if (!sp) continue;
      const ch = mkChar('t1', { tint: [0x3a1418, 0x2a2a12, 0x14262a][i % 3], hood: true, weps: ['katana'] }); attach(ch, 'katana', false); S.scene.add(ch.root);
      const e = { foe: true, ch, x: sp.x, z: sp.z, y: navAt(sp.x, sp.z) ?? floorAt(sp.x, sp.z, 50), yaw: R() * 6.28, state: 'wait', t: 3 + i * 16 + R() * 4, path, pi: 0, aw: 0, gm: 0, gt: R() * 0.2, revealT: 0, stun: 0, down: false, dead: false, gone: false, work: 0, smoke: 1, maki: 1, moving: false, mvT: 0, pauseT: 0, nextPause: 5 + R() * 5, repath: 0, spr: mkMark() };
      S.scene.add(e.spr); S.def.foes.push(e);
      // 入り込むときに見張りを1人倒していることがある（手がかり）
      if (R() < 0.6) { let g0 = null, gd = 18; for (const g of S.guards) { if (g.down) continue; const d = Math.hypot(g.x - e.x, g.z - e.z); if (d < gd) { gd = d; g0 = g; } } if (g0) takedown(g0, false, 'foe'); }
    }
    S.def.n = S.def.foes.length;
    const f0 = S.def.foes[0];
    if (f0) { S.def.seen = { x: f0.x + (R() - 0.5) * 12, z: f0.z + (R() - 0.5) * 12, y: f0.y }; S.def.seenT = 30; }
    say(`見張りの話では、曲者${S.def.n > 1 ? S.def.n + '人' : ''}が${f0 ? quarter(f0.x, f0.z) : '城'}のあたりに入り込んだらしい。探し出して捕らえよ`, 5);
  }
  function startFlee(e, why) {
    if (e.state === 'flee') return;
    const S = st; e.state = 'flee'; e.aw = 1; e.work = 0; e.path = null; e.repath = 0; e.revealT = Math.max(e.revealT, 4);
    if (S.def.alarm === e) S.def.alarm = null;
    if (e.smoke && Math.random() < 0.75) { e.smoke = 0; spawnSmoke(e.x, e.y, e.z); }
    say(why || '曲者に気づかれた！ 逃げるぞ、追え！', 2);
  }
  function stepDef(dt) {
    const S = st, D = S.def, P = S.p;
    if (D.seenT > 0) D.seenT -= dt;
    if (D.pvp) { // 2.57.1 人の曲者：見えたら印を付ける・相手の撒菱を踏む
      const gh = CO && CO.ghosts[CO.pvFoe];
      if (gh && !gh.gone && Math.hypot(P.x - gh.x, P.z - gh.z) < (S.night ? 13 : 24) && los(P.x, P.y + 1.5, P.z, gh.x, gh.y + (gh.crouch ? 0.8 : 1.3), gh.z, 0.4)) { D.seen = { x: gh.x, z: gh.z, y: gh.y }; D.seenT = 20; }
      for (const m of S.makis) if (!D.stepped.has(m.id) && !P.lock && !P.crouch && Math.hypot(P.x - m.x, P.z - m.z) < 0.8 && Math.abs(P.y - m.y) < 0.6) { D.stepped.add(m.id); P.lock = { kind: 'stun', t: 0, dur: 1.6 }; play(P.ch, 'hit', { once: true, restart: true, fade: 0.05 }); say('撒菱を踏んだ！', 1.4); }
      return;
    }
    for (const e of D.foes) { stepFoe(e, dt); if (S.end) return; }
    // 曲者の撒菱を踏む（しゃがんで歩けば踏まない）
    D.emakis = (D.emakis || []).filter((m) => { if (!P.lock && !P.crouch && Math.hypot(P.x - m.x, P.z - m.z) < 0.8 && Math.abs(P.y - m.y) < 0.6) { P.lock = { kind: 'stun', t: 0, dur: 1.6 }; play(P.ch, 'hit', { once: true, restart: true, fade: 0.05 }); say('撒菱を踏んだ！', 1.4); S.scene.remove(m.g); return false; } return true; });
    if (!D.foes.some((e) => !e.down && !e.gone)) {
      const c = D.foes.filter((e) => e.down).length;
      S.end = 'ok'; S.endT = 1.6; say(c >= D.n ? '曲者をすべて捕らえた！' : c ? '残りの曲者には逃げられた……' : '曲者に逃げられた……', 2.4);
    }
  }
  function stepFoe(e, dt) {
    const S = st, D = S.def, P = S.p;
    if (e.down || e.gone) { if (e.down) stepGuardAnim(e, dt); return; }
    e.revealT -= dt;
    // こちらから見える（近くて見通しがある）
    const dP = Math.hypot(P.x - e.x, P.z - e.z), ey = e.y + (e.state === 'flee' ? 1.3 : 0.8);
    if (dP < (S.night ? 13 : 24) && los(P.x, P.y + 1.5, P.z, e.x, ey, e.z, 0.4)) { e.revealT = Math.max(e.revealT, 0.6); D.seen = { x: e.x, z: e.z, y: e.y }; D.seenT = 25; if (!e.spotted) { e.spotted = 1; if (e.state !== 'flee') say('曲者を見つけた！ 気づかれないよう後ろから近づけ', 2.4); } }
    // 見張り（味方）が見つけると知らせてくれる
    e.gt -= dt;
    if (e.gt <= 0) { e.gt = 0.2;
      for (const g of S.guards) { if (g.down || g.stun > 0) continue; const f = seeFactor(g, e.x, ey, e.z, { crouch: e.state !== 'flee', run: e.state === 'flee' }); if (f > 0) { e.gm += 0.2 * (0.3 + 1.6 * f * f); if (e.gm >= 1) { e.gm = 0; e.revealT = 6; D.seen = { x: e.x, z: e.z, y: e.y }; D.seenT = 25; toSus(g, e.x, e.z); g.meter = 0.5; e.hurry = true; say(`見張り「曲者だ！ ${quarter(e.x, e.z)}にいるぞ！」`, 2.4); } break; } }
    }
    if (e.stun > 0) { e.stun -= dt; e.moving = false; stepFoeAnim(e, dt); return; }
    // こちらに気づく（前の向きで見える・近い・走る足音）
    if (e.state !== 'flee' && !N3.god) {
      let range = (S.night ? 7 : 12) * (P.crouch ? 0.55 : 1) * (P.run ? 1.3 : 1); if (P.hide) range = Math.min(range, 1.4);
      const a = Math.abs(angD(Math.atan2(P.x - e.x, P.z - e.z), e.yaw + (e.look || 0)));
      let f = 0;
      if (dP < range && a < 1.15 && Math.abs(P.y - e.y) < 4 && los(e.x, e.y + 1.2, e.z, P.x, P.y + (P.crouch ? 0.8 : 1.3), P.z)) f = 1 - (dP / range) * 0.7;
      if (dP < 1.3 && !P.crouch) f = 1;
      if (P.run && P.moving && dP < 7) f = Math.max(f, 0.7);
      e.aw = f > 0 ? e.aw + dt * (0.5 + 2.4 * f) : Math.max(0, e.aw - dt * 0.3);
      if (e.aw >= 1) startFlee(e);
    }
    e.look = (e.look || 0) * 0.95; e.moving = false;
    if (e.state === 'wait') { e.t -= dt; e.look = Math.sin(S.t * 1.1 + e.x) * 0.9; if (e.t <= 0) e.state = 'sneak'; }
    else if (e.state === 'sneak') {
      if (e.pauseT > 0) { e.pauseT -= dt; e.look = Math.sin(S.t * 1.4 + e.z) * 1.1; }
      else {
        e.moving = true; e.mvT += dt;
        if (!e.hurry && e.mvT > e.nextPause) { e.mvT = 0; e.nextPause = 5 + Math.random() * 6; e.pauseT = 2 + Math.random() * 3; }
        if (follow(e, e.hurry ? DEFC.hurry : DEFC.sneak, dt)) { e.state = 'work'; e.work = 0; e.moving = false; if (!D.alarm) { D.alarm = e; say(`${D.tg.name}のあたりで物音がした！ 曲者が${VOL[S.job.k] || VOL.sabo}`, 3); } }
      }
    } else if (e.state === 'work') {
      e.work += dt; e.yaw += angD(Math.atan2(D.tg.x - e.x, D.tg.z - e.z), e.yaw) * Math.min(1, dt * 5);
      if (!D.alarm) D.alarm = e;
      if (e.work >= DEFC.work) { // 工作を果たされた
        D.lost = true; S.end = 'ng'; S.endT = 3;
        const k = S.job.k; if (k === 'sabo' && D.tg.s) addFire(D.tg.s);
        say(k === 'sabo' ? '兵糧蔵に火を付けられた……' : k === 'raid' ? '武器蔵を打ち壊された……' : k === 'gate' ? '城門に細工をされた……' : k === 'hurt' ? `${S.job.whoName || '武将'}が手傷を負わされた……` : `${(STEAL[S.job.sk] || STEAL.mitsu).name}を盗まれた……`, 3);
        return;
      }
    } else if (e.state === 'flee') {
      e.repath -= dt;
      if (e.repath <= 0) { e.repath = 1; e.path = navPath(e.x, e.z, LV.start.x, LV.start.z); e.pi = 0; if (!e.path) e.noPath = (e.noPath || 0) + 1; }
      if (e.path) { e.moving = true; if (follow(e, DEFC.flee, dt) || e.z > 132) { e.gone = true; say('曲者に逃げられた……', 2); } }
      else if (e.noPath > 3) { e.gone = true; say('曲者は塀を越えて逃げた……', 2); }
      if (e.maki && dP < 4.5 && !e.gone) { e.maki = 0; const m = spawnMaki(e.x, e.y, e.z); S.makis = S.makis.filter((x) => x !== m); (D.emakis = D.emakis || []).push(m); }
    }
    stepFoeAnim(e, dt);
  }
  function stepFoeAnim(e, dt) {
    const ch = e.ch;
    if (e.down) { stepGuardAnim(e, dt); return; }
    ch.root.visible = !e.gone; if (e.gone) { e.spr.visible = false; return; }
    ch.root.position.set(e.x, e.y, e.z); ch.root.rotation.set(0, e.yaw, 0);
    const crC = has(ch, 'crouch_walk') && has(ch, 'crouch_idle'); let pz = null;
    if (e.stun > 0) { if (ch.cur !== 'hit' || !ch.acts.hit.isRunning()) play(ch, 'idle'); pz = { foot: true }; }
    else if (e.state === 'work') { if (has(ch, 'work')) play(ch, 'work'); else { play(ch, crC ? 'crouch_idle' : 'idle'); pz = { crouch: crC ? 0 : 1, work: 1 }; } }
    else if (e.moving) { if (e.state === 'flee') play(ch, 'run', { speed: 1.05 }); else { play(ch, crC ? 'crouch_walk' : 'walk', { speed: crC ? 1.1 : 0.7 }); if (!crC) pz = { crouch: 1 }; } }
    else { play(ch, crC ? 'crouch_idle' : 'idle'); if (!crC) pz = { crouch: 1 }; if (e.look) pz = Object.assign(pz || {}, { look: e.look * 0.6 }); }
    tick(ch, dt, pz);
    e.spr.visible = e.revealT > 0 && !st.end; if (e.spr.visible) { e.spr.material.map = texs().x; e.spr.scale.set(0.7, 0.7, 1); e.spr.position.set(e.x, e.y + 2.2, e.z); }
  }
  function defResult() {
    const D = st.def;
    if (D.pvp) return { ok: st.end === 'ok' && !D.lost, def: 1, caught: D.pvCaught ? 1 : 0, killed: D.pvKilled ? 1 : 0, n: 1, ko: !!D.ko, used: st.used };
    const caught = D.foes.filter((e) => e.down && !e.dead).length, killed = D.foes.filter((e) => e.down && e.dead).length;
    return { ok: st.end === 'ok' && !D.lost, def: 1, caught, killed, n: D.n, used: st.used };
  }
  // ---- 2.57.1 人と人の対戦（攻める人の端末が見張りを動かす。守る人は仲間と同じしくみで姿を送る）----
  function pvpHit(gh, kill) { // 相手を後ろから：守る人なら捕らえる・斬る、攻める人なら当て身で気を失わせる
    const S = st, P = S.p; if (S.end || P.lock) return;
    P.yaw = P.yawT = Math.atan2(gh.x - P.x, gh.z - P.z); P.crouch = false; P.lock = { kind: 'take', t: 0, dur: kill ? 1.2 : 0.85 };
    if (kill) attach(P.ch, 'katana', true);
    play(P.ch, kill && has(P.ch, 'stab') ? 'stab' : kill ? 'sword' : 'spear', { once: true, speed: kill && has(P.ch, 'stab') ? 2.2 : 1.5, restart: true, fade: 0.08 });
    if (CO.pv === 'def') { coSend([CO.leader], { k: 'catch', kill: kill ? 1 : 0 }); say(kill ? '斬りつけた！' : '当て身！', 1.2); }
    else { coSend([gh.id], { k: 'pko' }); gh.gone = true; gh.ch.root.visible = false; say('守りの忍びを当て身で倒した！ いまのうちに', 2.4); }
  }
  function pvpRecvLead(gh, m) { // 攻める人の端末：守る人からの知らせ
    const S = st, P = S.p;
    if (m.k === 'catch') {
      if (S.end || Math.hypot(P.x - gh.x, P.z - gh.z) > 2.8 || Math.abs(P.y - gh.y) > 1.5) return;
      S.caughtBy = m.kill ? 2 : 1; S.end = 'ng'; S.endT = 2.2; P.lock = null;
      play(P.ch, m.kill && has(P.ch, 'victim_stab') ? 'victim_stab' : has(P.ch, 'victim_ko') ? 'victim_ko' : 'hit', { once: true, restart: true, fade: 0.05 });
      say(m.kill ? '守りの忍びに斬られた……' : '守りの忍びに捕らえられた……', 2.4); coLead(0, true);
    } else if (m.k === 'tool') {
      if (m.t === 'kemuri') spawnSmoke(m.x, m.y, m.z);
      else if (m.t === 'makibishi') { const o = spawnMaki(m.x, m.y, m.z); S.makis = S.makis.filter((x) => x !== o); (S.pmakis = S.pmakis || []).push(o); }
      else if (m.t === 'fukiya' && m.pv && !S.end) { P.lock = { kind: 'stun', t: 0, dur: 3.5 }; play(P.ch, 'hit', { once: true, restart: true, fade: 0.05 }); say('吹き矢を受けた！ 体がしびれる', 2); }
    } else if (m.k === 'quit') { gh.gone = true; say('守りの忍びが退いた', 2); }
  }
  function pvpDefEnd(e, cg) { // 守る人の端末：攻める人の結果から勝ち負けを決める
    const S = st, D = S.def; if (!D || S.end) return;
    if (e === 'ok') { D.lost = true; S.end = 'ng'; S.endT = 2.2; say('工作を果たされ、城下へ抜けられた……', 2.6); }
    else { S.end = 'ok'; S.endT = 1.6; D.pvCaught = cg === 1; D.pvKilled = cg === 2; say(cg === 1 ? '曲者を捕らえた！' : cg === 2 ? '曲者を討ち取った！' : '曲者は見張りに見つかり、逃げ去った', 2.4); }
  }
  function hudDef() {
    const S = st, D = S.def, P = S.p, x = S.ctx || {}, J = JOB[S.job.k] || JOB.sabo;
    const left = D.foes.filter((e) => !e.down && !e.gone).length, got = D.foes.filter((e) => e.down).length, run = D.foes.some((e) => e.state === 'flee' && !e.down && !e.gone);
    if (D.pvp) setH('.goal', `<b>城の守り（対戦）</b>　${S.night ? '夜' : '昼'}<br>忍び込んできた「${String((CO && CO.names[CO.pvFoe]) || '相手').replace(/[<&]/g, '')}」を見つけ、後ろから当て身で捕らえる${S.done ? '<br><span class="alert">工作をされた！ 城下の南へ逃げる前に捕らえろ</span>' : ''}`); // 2.57.1
    else setH('.goal', `<b>城の守り</b>　${S.night ? '夜' : '昼'}<br>入り込んだ曲者を探して捕らえる（残り${left}人${got ? `・捕らえた${got}人` : ''}）${D.alarm && !D.alarm.down ? `<br><span class="alert">${D.tg.name}で曲者が${VOL[S.job.k] || VOL.sabo}！</span>` : ''}${run ? '<br><span class="alert">曲者が城下の南へ逃げている！ 追え</span>' : ''}`);
    setH('.tools', TOOLS.map(([t, n, key]) => { const c = (S.tools[t] || 0) - (S.used[t] || 0); return `<span class="${c > 0 ? '' : 'no'}">${key} ${n}×${c}</span>`; }).join('') + `<span class="${S.tools.kaginawa ? '' : 'no'}">鉤縄${S.tools.kaginawa ? 'あり' : 'なし'}</span>`);
    const wk = Math.max(0, ...D.foes.filter((e) => !e.down && !e.gone && e.state === 'work').map((e) => e.work / DEFC.work)), aw = Math.max(0, ...D.foes.filter((e) => !e.down && !e.gone && e.state !== 'flee').map((e) => e.aw));
    const m = wk || aw, u = hud.querySelector('.eye u'); u.style.width = Math.round(Math.min(1, m) * 100) + '%'; u.style.background = wk ? '#ff4a3a' : m > 0.5 ? '#ffb030' : '#ec3';
    setH('.el', wk ? '<span class="alert">曲者の工作</span>' : aw > 0.28 ? '<span class="alert">曲者が気づきそう！</span>' : P.hide ? '草むらに隠れている' : '曲者の気配');
    const pr = [];
    if (!S.end) {
      if (x.ko || x.koP) pr.push('<kbd>E</kbd>当て身（生け捕り）', '<kbd>Q</kbd>斬る');
      if (x.climb && !x.ko) pr.push(`<kbd>E</kbd>${x.climb.up ? (x.climb.c.kind === 'noki' ? '鉤縄で登る' : '登る') : '降りる'}`);
      if (x.noClimb) pr.push('鉤縄があれば登れる');
      if (S.reticle.visible) pr.push(D.pvp ? '<kbd>3</kbd>吹き矢（しびれさせる）' : '<kbd>3</kbd>吹き矢（眠らせて生け捕り）');
    }
    setH('.pr', pr.join('　'));
    hud.querySelector('.bar').style.display = 'none';
    setH('.help', S.help ? (isTouch() ? '左で動く・右で見回す' : 'WASD 動く　マウス 見回す（画面をクリック）　Shift 走る（曲者に足音を聞かれる）　C しゃがむ（曲者の撒菱を踏まない）　E 当て身　Q 斬る　1 煙玉　2 撒菱　3 吹き矢　Esc 退く　H この説明') : '');
    const msg = hud.querySelector('.msg'); setH('.msg', S.msg); msg.style.opacity = S.msgT > 0 ? 1 : 0;
    // 最後に見た所の印
    const sm = D.mk; sm.visible = !!D.seen && D.seenT > 0 && !S.end && !D.foes.some((e) => e.revealT > 0 && !e.down && !e.gone); if (sm.visible) sm.position.set(D.seen.x, D.seen.y + 1.6, D.seen.z);
  }
  function showEndDef() {
    const S = st, D = S.def, e = hud.querySelector('.end'), r = defResult(), esc = D.foes.filter((f) => f.gone).length;
    e.innerHTML = `<div><h2>${D.lost ? '守りきれなかった' : r.caught + r.killed >= D.n ? '城を守った' : '曲者を追い払った'}</h2><span class="${r.caught ? 'ok' : 'ng'}">${r.caught ? '◎' : '－'} 生け捕り ${r.caught}人</span><br><span class="ng">討ち取り ${r.killed}人</span>${esc ? `<br><span class="ng">逃げられた ${esc}人</span>` : ''}<br><span style="color:#bdb294;font-size:13px">生け捕りにすると、問いただして敵の動きが分かる</span></div>`;
    e.style.display = 'flex';
  }


  // =====================================================================
  // 2.41.0 協力任務。見張りはリーダー（任務を始めた人）の端末だけが動かし、10回/秒で全員へ配る。
  // 仲間は自分の動きだけ手もとで動かし、位置・倒す・担ぐ・工作・道具・音をリーダーへ知らせる。ホストが中継する（main.js の ninRelay）
  // 誰かが見つかれば全員失敗。成功は、全員が城下の南の端へ戻ったとき
  // =====================================================================
  const coSend = (to, m) => { if (CO && CO.send && to.length) CO.send(to, m); };
  const coFollowers = () => Object.values(CO.ghosts).filter((q) => !q.gone).map((q) => q.id);
  const poseOf = (P) => [r2(P.x), r2(P.y), r2(P.z), r2(P.yaw), (P.crouch ? 1 : 0) | (P.run ? 2 : 0) | (P.swim ? 4 : 0) | (P.moving ? 8 : 0) | (P.carry ? 16 : 0) | (P.work > 0 ? 32 : 0) | (P.lock && P.lock.kind === 'climb' ? 64 : 0) | (P.lock && P.lock.kind === 'stun' ? 128 : 0)];
  function setPose(gh, p) {
    gh.x = p[0]; gh.y = p[1]; gh.z = p[2]; gh.yaw = p[3]; const f = p[4];
    gh.crouch = !!(f & 1); gh.run = !!(f & 2); gh.swim = !!(f & 4); gh.moving = !!(f & 8); gh.work = f & 32 ? 1 : 0; gh.climb = !!(f & 64); gh.stun = !!(f & 128);
    gh.hide = gh.crouch && inGrass(gh.x, gh.z, gh.y); gh.got = true; gh.rx = performance.now();
  }
  N3.recv = (from, m) => {
    if (!CO || !st || !m) return;
    if (CO.lead) {
      const gh = CO.ghosts[from]; if (!gh || gh.gone) return; gh.rx = performance.now();
      if (m.k === 'pose') setPose(gh, m.p);
      else if (gh.pvGhost) pvpRecvLead(gh, m); // 2.57.1 対戦の相手（守る人）から
      else if (m.k === 'noise') noise(m.x, m.z, m.r, 'g', m.y);
      else if (m.k === 'td') { const g = st.guards[m.gi]; if (g && !g.down) takedown(g, !!m.kill, gh); }
      else if (m.k === 'pick') { const g = st.guards[m.gi]; if (g && g.down && !g.carried && !gh.carry) pickBody(gh, g, from); }
      else if (m.k === 'drop') dropBody(gh, true);
      else if (m.k === 'cp') { const t = LV.targets[m.ti]; if (t && !t.done) complete(t, true); }
      else if (m.k === 'tool') remoteTool(m);
      else if (m.k === 'quit') { gh.gone = true; if (gh.carry) dropBody(gh, true); }
    } else if (from === CO.leader) {
      CO.rx = performance.now();
      if (m.k === 'snap') CO.snap = m; else if (m.k === 'end') CO.endMsg = m;
      else if (m.k === 'pko') CO.pko = true; // 2.57.1 攻める人に後ろから当て身を受けた
      else if (m.k === 'pdart' && st.p && !st.end) { st.p.lock = { kind: 'stun', t: 0, dur: 3.5 }; play(st.p.ch, 'hit', { once: true, restart: true, fade: 0.05 }); say('吹き矢を受けた！ 体がしびれる', 2); }
    }
  };
  function coWaitReady() { // 仲間の端末から最初の位置が届くか、15秒たつまで待つ
    const gs = Object.values(CO.ghosts), t = performance.now() - CO.t0;
    if (t > 15000 || gs.every((q) => q.got || q.gone)) { CO.ready = true; say('潜入開始！', 1.5); } else if (st.msgT <= 0) say('仲間の準備を待っている…', 1.2);
    if (t > 15000) for (const q of gs) if (!q.got) q.gone = true;
  }
  function coLead(dt, force) { // リーダー：仲間の途切れを見張り、10回/秒で全員へ様子を配る
    const S = st, now = performance.now();
    for (const q of Object.values(CO.ghosts)) if (!q.gone && q.got && now - q.rx > 8000) { q.gone = true; if (q.carry) dropBody(q, true); say(`${q.name}との連絡が途切れた`, 2); }
    CO.snapT -= dt; if (CO.snapT > 0 && !force) return; CO.snapT = 0.1;
    const to = coFollowers(); if (!to.length) return;
    const ps = { [CO.me]: poseOf(S.p) }; for (const q of Object.values(CO.ghosts)) if (!q.gone) ps[q.id] = [r2(q.x), r2(q.y), r2(q.z), r2(q.yaw), (q.crouch ? 1 : 0) | (q.run ? 2 : 0) | (q.swim ? 4 : 0) | (q.moving ? 8 : 0) | (q.carry ? 16 : 0) | (q.work ? 32 : 0) | (q.climb ? 64 : 0)];
    coSend(to, { k: 'snap',
      g: S.guards.map((g) => [r2(g.x), r2(g.z), r2(g.y), r2(g.yaw), g.state, g.sub || '', r2(g.meter), (g.down ? 1 : 0) | (g.dead ? 2 : 0) | (g.carried ? 4 : 0) | (g.hidden ? 8 : 0) | (g.found ? 16 : 0) | (g.stun > 0 ? 32 : 0) | (g.moving ? 64 : 0) | (g.wait > 0 ? 128 : 0), r2(g.look || 0), g.carrier || '']),
      f: S.folk.map((f) => [r2(f.x), r2(f.z), r2(f.yaw), f.told ? 1 : 0]), tg: LV.targets.map((t) => (t.done ? 1 : 0)),
      sm: S.smokes.map((o) => [o.id, o.x, r2(o.y), o.z, r2(o.t)]), mk: [...S.makis, ...(S.pmakis || [])].map((o) => [o.id, o.x, o.z, o.y]), cg: S.caughtBy || 0,
      al: S.alertAll ? 1 : 0, dn: S.done, ks: S.kills, un: S.unseen ? 1 : 0, end: S.end || '', ps });
  }
  function coPose(dt) { CO.poseT -= dt; if (CO.poseT > 0) return; CO.poseT = 0.1; coSend([CO.leader], { k: 'pose', p: poseOf(st.p) }); }
  function applySnap(m) { // 仲間の端末：リーダーから届いた様子を、見張り・町人・工作・道具・仲間に反映する
    const S = st, first = !CO.gotSnap; CO.gotSnap = true;
    m.g.forEach((a, i) => {
      const g = S.guards[i]; if (!g) return;
      g.state = a[4]; g.sub = a[5]; g.meter = a[6]; g.look = a[8];
      const f = a[7], down = !!(f & 1), carried = !!(f & 4); g.dead = !!(f & 2); g.hidden = !!(f & 8); g.found = !!(f & 16); g.stun = f & 32 ? 1 : 0; g.moving = !!(f & 64); g.wait = f & 128 ? 1 : 0;
      if (down && !g.down) { g.down = true; g.state = 'down'; g.spr.visible = false; if (g.ch.wep.yari) g.ch.wep.yari.visible = false; g.downT = 0; g.lie = g.dead ? 'victim_stab' : 'victim_ko'; if (!carried) knock(g, g.lie); }
      if (g.lock2 > S.t) return; // 自分が担いだ・下ろした直後は、リーダーに伝わるまで自分の見え方を優先
      g.tx = a[0]; g.tz = a[1]; g.ty = a[2]; g.tyaw = a[3];
      if (first) { g.x = g.tx; g.z = g.tz; g.y = g.ty; g.yaw = g.tyaw; }
      if (carried && !g.carried) { g.carried = true; g.fallAt = null; play(g.ch, 'idle', { fade: 0.05 }); }
      else if (!carried && g.carried) { g.carried = false; const a2 = play(g.ch, g.lie || 'die', { once: true, restart: true, fade: 0.05 }); a2.time = a2.getClip().duration - 0.01; }
      g.carrier = a[9] || null;
    });
    m.f.forEach((a, i) => { const f = S.folk[i]; if (!f) return; f.tx2 = a[0]; f.tz2 = a[1]; f.tyaw = a[2]; f.told = !!a[3]; if (first) { f.x = a[0]; f.z = a[1]; f.yaw = a[2]; } });
    m.tg.forEach((d, i) => { const t = LV.targets[i]; if (t && d && !t.done) { t.done = true; completeFx(t); } });
    S.done = m.dn; S.kills = m.ks; S.unseen = !!m.un; S.alertAll = !!m.al;
    // 煙玉・撒菱：番号で合わせる
    const sid = new Set(m.sm.map((a) => a[0]));
    S.smokes = S.smokes.filter((o) => { if (sid.has(o.id)) return true; for (const q of o.sp) { S.scene.remove(q); q.material.dispose(); } return false; });
    for (const a of m.sm) if (!S.smokes.some((o) => o.id === a[0])) { const o = spawnSmoke(a[1], a[2] - 1.2, a[3], a[0], a[4]); o.r = Math.min(4.2, 1.2 + o.t * 3); }
    const mid = new Set(m.mk.map((a) => a[0]));
    S.makis = S.makis.filter((o) => { if (mid.has(o.id)) return true; S.scene.remove(o.g); return false; });
    for (const a of m.mk) if (!S.makis.some((o) => o.id === a[0])) spawnMaki(a[1], a[3], a[2], a[0]);
    // 仲間の位置（自分以外）
    for (const pid in m.ps) { if (pid === CO.me) continue; const gh = CO.ghosts[pid]; if (gh) { setPose(gh, m.ps[pid]); gh.gone = false; } }
    for (const q of Object.values(CO.ghosts)) if (!(q.id in m.ps)) q.gone = true;
    // 担いだつもりの見張りを、リーダーが別の人の担ぎにしていたら手放す
    if (S.p.carry && S.p.carry.lock2 <= S.t && S.p.carry.carrier !== CO.me) S.p.carry = null;
    if (m.end && !S.end) { if (CO.pv === 'def') pvpDefEnd(m.end, m.cg); else { S.end = m.end; S.endT = m.end === 'ok' ? 0.6 : 1.8; say(m.end === 'ok' ? '城下を抜けた！' : '見つかった！', 2); } }
  }
  function coFollowStep(dt) { // 仲間の端末の見張り・町人（動かさず、届いた様子へなめらかに寄せる）。true なら step を打ち切る
    const S = st, now = performance.now();
    if (CO.endMsg) { const e = CO.endMsg; CO.endMsg = null; if (e.e === 'quit') { finish({ ok: null, used: S.used }); return true; } if (!S.end && CO.pv === 'def') pvpDefEnd(e.e, e.cg); else if (!S.end) { S.end = e.e; S.endT = e.e === 'ok' ? 0.6 : 1.8; S.kills = e.kills; S.unseen = !!e.unseen; } }
    if (now - CO.rx > 8000) { finish({ ok: null, used: S.used }); return true; }
    if (CO.pko && !S.end && S.def) { CO.pko = false; S.def.ko = true; S.def.lost = true; S.end = 'ng'; S.endT = 2.2; play(S.p.ch, 'hit', { once: true, restart: true }); say('後ろから当て身を受けた……', 2.4); return true; }
    if (CO.snap) { const m = CO.snap; CO.snap = null; applySnap(m); }
    const k = Math.min(1, dt * 14);
    for (const g of S.guards) {
      if (g.tx != null && !g.carried) { g.x += (g.tx - g.x) * k; g.z += (g.tz - g.z) * k; g.y += (g.ty - g.y) * k; g.yaw += angD(g.tyaw, g.yaw) * k; }
      if (!g.down) S.maxM = Math.max(S.maxM, g.meter);
      stepGuardAnim(g, dt);
    }
    for (const f of S.folk) {
      if (f.tx2 != null) { const mv = Math.hypot(f.tx2 - f.x, f.tz2 - f.z); f.x += (f.tx2 - f.x) * k; f.z += (f.tz2 - f.z) * k; f.yaw += angD(f.tyaw, f.yaw) * k; play(f.ch, mv > 0.02 ? 'walk' : 'idle', mv > 0.02 ? { speed: 0.75 } : undefined); }
      f.ch.root.position.set(f.x, f.y, f.z); f.ch.root.rotation.set(0, f.yaw, 0); tick(f.ch, dt, null);
      for (const t of LV.targets) if (t.folk === f) { t.x = f.x; t.z = f.z; }
    }
    return false;
  }
  function renderGhost(gh, dt) { // 仲間の姿
    const ch = gh.ch; ch.root.visible = !gh.gone; if (gh.gone) return;
    const k = Math.min(1, dt * 14); if (Math.hypot(gh.x - gh.dx, gh.z - gh.dz) > 6) { gh.dx = gh.x; gh.dy = gh.y; gh.dz = gh.z; gh.dyaw = gh.yaw; }
    gh.dx += (gh.x - gh.dx) * k; gh.dy += (gh.y - gh.dy) * k; gh.dz += (gh.z - gh.dz) * k; gh.dyaw += angD(gh.yaw, gh.dyaw) * k;
    const swimC = has(ch, 'swim'), crC = has(ch, 'crouch_walk') && has(ch, 'crouch_idle');
    ch.root.position.set(gh.dx, gh.dy + (gh.swim ? (swimC ? 0.22 : -0.05) : 0), gh.dz); ch.root.rotation.set(gh.swim && !swimC ? 0.9 : 0, gh.dyaw, 0);
    gh.crouchK += ((gh.crouch ? 1 : 0) - gh.crouchK) * (1 - Math.exp(-10 * dt));
    if (gh.climb) play(ch, has(ch, 'climb_wall') ? 'climb_wall' : 'idle', { speed: 1.7, fade: 0.1 });
    else if (gh.swim) play(ch, swimC ? 'swim' : 'walk', { speed: gh.moving ? 1 : 0.5 });
    else if (gh.moving) play(ch, gh.crouch && crC ? 'crouch_walk' : gh.run ? 'run' : 'walk', { speed: gh.crouch ? (crC ? 1.1 : 0.75) : 1 });
    else play(ch, gh.crouch && crC ? 'crouch_idle' : 'idle');
    tick(ch, dt, { crouch: crC ? 0 : gh.crouchK * (gh.carry ? 0 : 1), carry: gh.carry ? 1 : 0 });
  }

  // ---- 描く ----
  function render(dt) {
    const S = st, P = S.p, C = S.cam, ch = P.ch;
    // 本人の姿勢
    const swimC = has(ch, 'swim'); ch.root.position.set(P.x, P.y + (P.swim ? (swimC ? 0.22 : -0.05) : 0), P.z); ch.root.rotation.set(P.swim && !swimC ? 0.9 : 0, P.yaw + (P.lock && P.lock.kind === 'climb' && P.lock.c.kind === 'ladder' ? Math.PI : 0), 0); // 2.42.0 ハシゴは表裏が逆だったので向きを反転
    const L = P.lock;
    const crC = has(ch, 'crouch_walk') && has(ch, 'crouch_idle'), wkC = has(ch, 'work') && P.work > 0 && !(st.ctx && st.ctx.work && st.ctx.work.folk);
    let pz = { crouch: crC || wkC ? 0 : P.crouchK * (P.carry ? 0 : 1), work: P.work > 0 && !wkC ? Math.min(1, P.work * 3) : 0, carry: P.carry ? 1 : 0 };
    if (L && L.kind === 'climb') { const cn = L.c.kind === 'ladder' ? 'climb_ladder' : 'climb_wall', k = clamp(L.t / L.dur, 0, 1); if (has(ch, cn) && k < 0.82) { play(ch, cn, { speed: cn === 'climb_ladder' ? 1.3 : 1.7, fade: 0.1 }); pz = {}; } else if (has(ch, cn)) { play(ch, 'crouch_idle', { fade: 0.15 }); pz = {}; } else { play(ch, 'idle'); pz = { climb: L.t * 7 }; } }
    else if (L && L.kind === 'land') { pz = {}; }
    else if (L && L.kind === 'take') { /* 斬る・突く動き */ }
    else if (L && L.kind === 'throw') { if (has(ch, 'throw')) pz = {}; else { play(ch, 'idle'); pz.throwK = Math.sin(clamp(L.t / L.dur, 0, 1) * Math.PI); } }
    else if (P.swim) { if (swimC) { play(ch, 'swim', { speed: P.moving ? 1 : 0.5 }); pz = {}; } else { play(ch, 'walk', { speed: 0.6 }); P.swimF += dt * 3; pz = { swim: 1, swimF: P.swimF }; } }
    else if (P.air) play(ch, 'idle');
    else if (wkC) play(ch, 'work');
    else if (P.moving) play(ch, P.crouch && crC ? 'crouch_walk' : P.run ? 'run' : 'walk', { speed: P.crouch ? (crC ? 1.1 : 0.75) : P.carry ? 0.8 : 1 });
    else play(ch, P.crouch && crC ? 'crouch_idle' : 'idle');
    tick(ch, dt, pz);
    if (L && L.kind === 'climb' && (ch.cur === 'climb_wall' || ch.cur === 'climb_ladder')) { // 2.31.0 登る動きは体が前に寄っているので、腰を壁の手前にそろえる
      ch.root.updateMatrixWorld(true); const h = ch.bones.Hips.getWorldPosition(vb), c = L.c, back = ch.cur === 'climb_ladder' ? 0.05 : 0.12;
      ch.root.position.x += c.B.x + Math.sin(c.face) * back - h.x; ch.root.position.z += c.B.z + Math.cos(c.face) * back - h.z;
    }
    // カメラ（右肩ごし。壁にめり込まないよう縮める）
    const tx = P.x - Math.cos(C.yaw) * 0.45, tz = P.z + Math.sin(C.yaw) * 0.45, ty = P.y + (P.swim ? 0.7 : P.crouchK > 0.5 ? 1.2 : 1.6);
    const fx = Math.sin(C.yaw) * Math.cos(C.pitch), fy = -Math.sin(C.pitch), fz = Math.cos(C.yaw) * Math.cos(C.pitch);
    let dist = C.dist * (P.crouchK > 0.5 ? 0.9 : 1);
    for (let k = 0.4; k <= dist; k += 0.2) { const x = tx - fx * k, y = ty - fy * k, z = tz - fz * k; if (solidAt(x, y - 0.2, z) || solidAt(x, y + 0.2, z)) { dist = Math.max(0.6, k - 0.3); break; } }
    C.cd = C.cd == null ? dist : C.cd + (dist - C.cd) * Math.min(1, dt * (dist < C.cd ? 20 : 4));
    cam.position.set(tx - fx * C.cd, ty - fy * C.cd, tz - fz * C.cd); if (cam.position.y < floorAt(cam.position.x, cam.position.z, cam.position.y) + 0.25) cam.position.y = floorAt(cam.position.x, cam.position.z, cam.position.y) + 0.25;
    cam.lookAt(tx + fx, ty + fy, tz + fz);
    // 印
    const bob = Math.sin(S.t * 3) * 0.12;
    for (const t of LV.targets) if (t.mk) { t.mk.visible = S.def ? !!S.def.alarm && !S.end : !t.done && !S.end;t.mk.position.set(t.x, (t.folk ? 0 : t.y) + 2.4 + bob, t.z); }
    S.exitMk.visible = S.done >= S.need && !S.end; S.exitMk.position.set(LV.CX, 3 + bob, 137);
    const dg = !P.lock && (S.tools.fukiya - S.used.fukiya) > 0 && !S.end ? dartTarget() : null; S.reticle.visible = !!dg; if (dg) S.reticle.position.set(dg.x, dg.y + 1.4, dg.z);
    if (CO) for (const gh of Object.values(CO.ghosts)) renderGhost(gh, dt);
    hudUpdate();
    rd.render(scene, cam);
  }
  let hudCache = {};
  function setH(sel, html) { if (hudCache[sel] === html) return; hudCache[sel] = html; hud.querySelector(sel).innerHTML = html; }
  function hudUpdate() {
    if (st.def) return hudDef();
    const S = st, P = S.p, k = S.job.k, J = JOB[k] || JOB.sabo, x = S.ctx || {};
    const tname = k === 'steal' ? (STEAL[S.job.sk] || STEAL.mitsu).name : k === 'hurt' ? (S.job.whoName || '武将') : J.tg;
    const goal = S.done >= S.need ? '果たした！ 入ってきた所（城下の南の端・緑の印）へ戻る' : k === 'rumor' ? `城下の町人に噂を流す（${S.done}/${S.need}）` : k === 'steal' ? `${(STEAL[S.job.sk] || STEAL.mitsu).at}にある${tname}を盗み出す` : k === 'hurt' ? `寝所の${tname}に手傷を負わせる（殺しはしない）` : `${tname}に${J.verb}`;
    setH('.goal', (CO ? `<span class="muted">仲間：${Object.values(CO.ghosts).filter((q) => !q.gone).map((q) => String(q.name).replace(/[<&]/g, '')).join('・') || 'なし'}${CO.lead ? '（あなたがリーダー）' : ''}</span><br>` : '') + `<b>${{ sabo: '破壊工作', raid: '襲撃', gate: '門の破壊', rumor: '流言', hurt: '武将の襲撃', steal: '盗み' }[k] || ''}</b>　${S.night ? '夜' : '昼'}${S.alertAll ? '　<span class="alert">城中が警戒している</span>' : ''}<br>${goal}`);
    setH('.tools', TOOLS.map(([t, n, key]) => { const c = (S.tools[t] || 0) - (S.used[t] || 0); return `<span class="${c > 0 ? '' : 'no'}">${key} ${n}×${c}</span>`; }).join('') + `<span class="${S.tools.kaginawa ? '' : 'no'}">鉤縄${S.tools.kaginawa ? 'あり' : 'なし'}</span>`);
    const m = S.maxM || 0; const u = hud.querySelector('.eye u'); u.style.width = Math.round(m * 100) + '%'; u.style.background = m > 0.6 ? '#ff4a3a' : m > 0.28 ? '#ffb030' : '#ec3';
    setH('.el', m > 0.28 ? '<span class="alert">怪しまれている！</span>' : P.hide ? '草むらに隠れている' : P.swim ? '堀を泳いでいる' : '気配');
    const pr = [];
    if (!S.end) {
      if (x.koP) pr.push('<kbd>E</kbd>当て身（守りの忍びを倒す）'); // 2.57.1
      else if (x.ko) pr.push('<kbd>E</kbd>当て身', '<kbd>Q</kbd>暗殺');
      else if (x.work) pr.push(`<kbd>E</kbd>長押しで${k === 'rumor' ? '噂を流す' : J.verb}`);
      if (x.climb && !x.ko) pr.push(`<kbd>E</kbd>${x.climb.up ? (x.climb.c.kind === 'noki' ? '鉤縄で登る' : '登る') : '降りる'}`);
      if (x.noClimb) pr.push('鉤縄があれば登れる');
      if (P.carry) pr.push('<kbd>F</kbd>下ろす'); else if (x.body) pr.push('<kbd>F</kbd>担ぐ');
      if (S.reticle.visible) pr.push('<kbd>3</kbd>吹き矢');
    }
    setH('.pr', pr.join('　'));
    const bar = hud.querySelector('.bar'); if (P.work > 0) { bar.style.display = 'block'; bar.firstChild.style.width = Math.round(P.work / J.hold * 100) + '%'; } else bar.style.display = 'none';
    setH('.help', S.help ? (isTouch() ? '左で動く・右で見回す' : 'WASD 動く　マウス 見回す（画面をクリック）　Shift 走る（音が出る）　C しゃがむ　E 行動　Q 暗殺　F 担ぐ　1 煙玉　2 撒菱　3 吹き矢　Esc 退く　H この説明') : '');
    const msg = hud.querySelector('.msg'); setH('.msg', S.msg); msg.style.opacity = S.msgT > 0 ? 1 : 0;
  }
  function showEnd() {
    if (st.def) return showEndDef();
    const S = st, e = hud.querySelector('.end'), used = TOOLS.filter(([t]) => S.used[t]).map(([t, n]) => `${n}×${S.used[t]}`).join('・');
    e.innerHTML = `<div><h2>任務を果たした</h2><span class="${S.unseen ? 'ok' : 'ng'}">${S.unseen ? '◎' : '－'} 気づかれずに果たした</span><br><span class="${S.kills ? 'ng' : 'ok'}">${S.kills ? '－' : '◎'} 誰も殺さなかった</span>${S.kills ? `（${S.kills}人）` : ''}<br><span style="color:#bdb294;font-size:13px">使った道具：${used || 'なし'}</span></div>`;
    e.style.display = 'flex';
  }
})();
