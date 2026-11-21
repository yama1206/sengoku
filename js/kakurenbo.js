// 2.70.0 「かくれんぼ？」（みんなで遊ぶ）：クォータービューのプロップハント風。隠れる側は木箱や樽などに化けて、探す側から逃げる
// 全員が同じ種（seed）で同じ舞台・置物を作り、それぞれの端末で動かして、位置と「化けた物」だけ送り合う（js/party.js の枠から呼ばれる）
//  - 探す側が叩く（hs）→ 叩かれた場所にいる隠れる側の端末が「見つかった」と決めて全員に知らせる（hc）
//  - 置物（本物）を叩いてしまうと探す側の体力が1減る
// 絵は仮：three.js の簡単な形（あとで置き換えやすいよう、置物は mkProp、人は mkHuman に分けてある）
(function () {
  const SGK = window.SGK, HD = (SGK.HIDE = {});
  const KIND = { crate: '木箱', barrel: '樽', jar: '壺', lantern: '石灯籠', stone: '石', bucket: '桶', bale: '米俵', stump: '切り株' };
  HD.KIND = KIND;
  HD.OPTS = [
    { k: 'st', n: '舞台', v: [['street', '町の通り'], ['castle', '城下'], ['yashiki', '屋敷の庭']] },
    { k: 'sk', n: '探す側の人数', v: [[1, '1人'], [2, '2人'], [3, '3人']] },
    { k: 'mv', n: '化けたあとの動き', v: [['slow', 'ゆっくり動ける'], ['none', '動けない']] },
    { k: 'cau', n: '見つかったら', v: [['seek', '探す側に回る'], ['out', 'その回は終わり']] },
  ];
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r2 = (v) => Math.round(v * 100) / 100;
  const ROUND = 180, HIDE_T = 15, BEACON0 = 30, BEACON_EVERY = 22, R_HIT = 1.3, SP_H = 4.2, SP_HS = 2.0, SP_S = 4.6;
  const SQ = Math.SQRT1_2, RIGHT = [SQ, -SQ], FWD = [-SQ, -SQ]; // 画面の右・奥（カメラは (+,+,+) の斜め上から）

  // ---------------- 部品 ----------------
  const mats = {}, geos = {};
  const M = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
  const G = (k, f) => geos[k] || (geos[k] = f());
  const part = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  /* 置物（化けられる物）。あとで絵に置き換えるときはここだけ直す */
  function mkProp(kind, v) {
    const g = new THREE.Group(), W = (v || 0) % 3;
    if (kind === 'crate') {
      g.add(part(G('cb', () => new THREE.BoxGeometry(1, 0.9, 1)), M([0x9a7040, 0x84602f, 0xa98150][W]), 0, 0.45, 0));
      for (const x of [-0.34, 0.34]) g.add(part(G('cs', () => new THREE.BoxGeometry(0.13, 0.94, 1.04)), M(0x5a3d1c), x, 0.45, 0));
    } else if (kind === 'barrel') {
      g.add(part(G('ba', () => new THREE.CylinderGeometry(0.4, 0.4, 1, 14)), M([0x8b5a2b, 0x7a4d24, 0x9a6a3a][W]), 0, 0.5, 0));
      for (const y of [0.25, 0.75]) g.add(part(G('br', () => new THREE.CylinderGeometry(0.43, 0.43, 0.07, 14)), M(0x2d2d2d), 0, y, 0));
    } else if (kind === 'jar') {
      const b = part(G('jb', () => new THREE.SphereGeometry(0.5, 14, 10)), M([0x6a4b3a, 0x4d5a63, 0x7a5a2a][W]), 0, 0.55, 0); b.scale.set(1, 1.1, 1); g.add(b);
      g.add(part(G('jn', () => new THREE.CylinderGeometry(0.2, 0.28, 0.25, 12)), M([0x6a4b3a, 0x4d5a63, 0x7a5a2a][W]), 0, 1.15, 0));
      g.add(part(G('jr', () => new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12)), M(0x2a2018), 0, 1.29, 0));
    } else if (kind === 'lantern') {
      g.add(part(G('lb', () => new THREE.CylinderGeometry(0.4, 0.45, 0.25, 10)), M(0x8a8a84), 0, 0.12, 0));
      g.add(part(G('lp', () => new THREE.CylinderGeometry(0.14, 0.16, 0.9, 10)), M(0x9a9a92), 0, 0.7, 0));
      g.add(part(G('ll', () => new THREE.BoxGeometry(0.5, 0.45, 0.5)), new THREE.MeshLambertMaterial({ color: 0xe8dca8, emissive: 0x403818 }), 0, 1.35, 0));
      const r = part(G('lr', () => new THREE.ConeGeometry(0.55, 0.4, 4)), M(0x6e6e68), 0, 1.8, 0); r.rotation.y = Math.PI / 4; g.add(r);
    } else if (kind === 'stone') {
      const s = part(G('so', () => new THREE.DodecahedronGeometry(0.55)), M([0x8a8a84, 0x777770, 0x9a968c][W]), 0, 0.4, 0); s.scale.set(1.1, 0.75, 0.95); g.add(s);
    } else if (kind === 'bucket') {
      g.add(part(G('ub', () => new THREE.CylinderGeometry(0.3, 0.25, 0.5, 12)), M(0x9a7a4a), 0, 0.25, 0));
      g.add(part(G('ur', () => new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12)), M(0x3a2a18), 0, 0.4, 0));
    } else if (kind === 'bale') {
      const b = part(G('ab', () => new THREE.CylinderGeometry(0.34, 0.34, 0.9, 12)), M(0xc9a45a), 0, 0.34, 0); b.rotation.z = Math.PI / 2; g.add(b);
      for (const x of [-0.25, 0.25]) { const r = part(G('ar', () => new THREE.CylinderGeometry(0.355, 0.355, 0.05, 12)), M(0x7a5a2a), x, 0.34, 0); r.rotation.z = Math.PI / 2; g.add(r); }
    } else { // stump
      g.add(part(G('tb', () => new THREE.CylinderGeometry(0.42, 0.48, 0.55, 12)), M(0x6b4a2a), 0, 0.27, 0));
      g.add(part(G('tt', () => new THREE.CylinderGeometry(0.38, 0.38, 0.02, 12)), M(0xb99a6a), 0, 0.56, 0));
    }
    return g;
  }
  function mkHuman(col, seeker) {
    const g = new THREE.Group();
    g.add(part(G('hb', () => new THREE.CylinderGeometry(0.28, 0.34, 0.95, 10)), M(col), 0, 0.5, 0));
    g.add(part(G('hs', () => new THREE.BoxGeometry(0.62, 0.1, 0.4)), M(seeker ? 0xf2f2f2 : 0x3a2a1a), 0, 0.72, 0));
    g.add(part(G('hh', () => new THREE.SphereGeometry(0.22, 12, 10)), M(0xf0c9a0), 0, 1.2, 0));
    g.add(seeker ? part(G('hj', () => new THREE.ConeGeometry(0.42, 0.22, 12)), M(0x2b2b2b), 0, 1.45, 0) : part(G('hk', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.2)), M(0x2a2018), 0, 1.22, 0));
    return g;
  }
  function house(S, x, z, w, d, h, wall, roof) {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(w, h, d), M(wall), 0, h / 2, 0));
    g.add(part(new THREE.BoxGeometry(w + 0.8, 0.28, d + 0.8), M(roof), 0, h + 0.14, 0));
    g.add(part(new THREE.BoxGeometry(w * 0.6, 0.3, d * 0.6), M(roof), 0, h + 0.42, 0));
    g.position.set(x, 0, z); S.scene.add(g); S.boxes.push([x - w / 2, z - d / 2, x + w / 2, z + d / 2]);
  }
  function tree(S, x, z, s, pine) {
    const g = new THREE.Group();
    g.add(part(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.2 * s, 8), M(0x5a3d1c), 0, 1.1 * s, 0));
    if (pine) { for (let i = 0; i < 3; i++) g.add(part(new THREE.ConeGeometry((1.7 - i * 0.4) * s, 1.5 * s, 9), M(0x2f5a30), 0, (2.4 + i * 1.0) * s, 0)); }
    else { const f = part(new THREE.SphereGeometry(1.6 * s, 10, 8), M(0x3f7a38), 0, 3 * s, 0); f.scale.set(1, 0.85, 1); g.add(f); }
    g.position.set(x, 0, z); S.scene.add(g); S.circs.push([x, z, 0.7 * s]);
  }
  /* 舞台：町の通り／城下／屋敷の庭。置物の数・種類もここで決める */
  const STAGES = {
    street: { name: '町の通り', HX: 20, HZ: 14, gnd: 0x9b8760, n: 58, kinds: ['crate', 'crate', 'barrel', 'barrel', 'jar', 'bucket', 'bale', 'stone', 'stump', 'lantern'],
      build(S) {
        const r = part(new THREE.PlaneGeometry(46, 6), M(0xb8a47a), 0, 0.02, 1); r.rotation.x = -Math.PI / 2; r.castShadow = false; S.scene.add(r);
        [[-14, -11.5, 7, 4, 3, 0xe6dcc0], [-5, -11.5, 6, 4, 3.2, 0xd9c8a0], [4, -11.5, 8, 4, 3, 0xe6dcc0], [14, -11.5, 6, 4, 3.4, 0xcfbf98], [-12, 11.5, 8, 4, 3, 0xd9c8a0], [-1, 11.5, 6, 4, 3.3, 0xe6dcc0], [11, 11.5, 9, 4, 3, 0xcfbf98]]
          .forEach(([x, z, w, d, h, c]) => house(S, x, z, w, d, h, c, 0x3a3f46));
        S.circs.push([0, 5.5, 0.5]); const tb = part(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), M(0x6a4a2a), 0, 0.6, 5.5); tb.position.x = 0; S.scene.add(tb); // 井戸（仮）
      } },
    castle: { name: '城下', HX: 18, HZ: 16, gnd: 0x8a8575, n: 52, kinds: ['crate', 'barrel', 'barrel', 'jar', 'stone', 'stone', 'bale', 'stump', 'bucket', 'lantern'],
      build(S) {
        const wl = part(new THREE.BoxGeometry(40, 3.2, 1.6), M(0x7d786c), 0, 1.6, -14.5); S.scene.add(wl); S.boxes.push([-20, -15.3, 20, -13.7]);
        for (const x of [-17, 17]) house(S, x, -13, 4, 4, 5, 0xece6d6, 0x3a3f46);
        house(S, -13, 9, 7, 4, 3, 0xd9c8a0, 0x4a4a46); house(S, 13, 10, 6, 4, 3, 0xd9c8a0, 0x4a4a46);
        [[-8, 3], [9, -3], [-14, -4], [15, 3]].forEach(([x, z], i) => tree(S, x, z, 1.1, i % 2 === 0));
        const p = part(new THREE.PlaneGeometry(6, 30), M(0x9d9886), 0, 0.02, 0); p.rotation.x = -Math.PI / 2; p.castShadow = false; S.scene.add(p);
      } },
    yashiki: { name: '屋敷の庭', HX: 16, HZ: 16, gnd: 0x6f8f4a, n: 46, kinds: ['stone', 'stone', 'lantern', 'lantern', 'jar', 'bucket', 'stump', 'crate', 'bale'],
      build(S) {
        house(S, 0, -12.5, 18, 5, 3.4, 0xe6dcc0, 0x4a4036);
        const pd = part(new THREE.CylinderGeometry(4.2, 4.2, 0.05, 28), M(0x4a86a8), -6, 0.03, 4); pd.castShadow = false; S.scene.add(pd); S.circs.push([-6, 4, 4.2]);
        tree(S, 9, 3, 1.3, true); tree(S, -12, -4, 1.2, true); tree(S, 11, 11, 1, true); tree(S, -2, 12, 1.1, false);
        for (let i = 0; i < 6; i++) { const s = part(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), M(0x9a968c), 3 + i * 0.9, 0.03, -6 + i * 1.7); s.castShadow = false; S.scene.add(s); }
      } },
  };
  HD.STAGES = STAGES;

  // ---------------- 遊びの本体 ----------------
  HD.make = function (env) {
    const { cfg, me, ids, cv, g2: g, IN, send } = env;
    const o = Object.assign({ st: 'street', sk: 1, mv: 'slow', cau: 'seek' }, cfg.o || {}), stg = STAGES[o.st] || STAGES.street;
    const solo = ids.length < 2, rng = mulberry((cfg.seed ^ 0x2f6e2b1) >>> 0), HX = stg.HX, HZ = stg.HZ;
    const root = cv.parentNode, T3 = THREE;
    // 3D の画面（絵は下の canvas、文字は上の canvas）
    const rd = new T3.WebGLRenderer({ antialias: true }); rd.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); rd.outputEncoding = T3.sRGBEncoding; rd.shadowMap.enabled = true;
    const c3 = rd.domElement; c3.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0'; root.insertBefore(c3, cv);
    cv.style.position = 'absolute'; cv.style.left = cv.style.top = '0'; cv.style.zIndex = 1;
    const scene = new T3.Scene(); scene.background = new T3.Color(0xbfd9ee); scene.fog = new T3.Fog(0xbfd9ee, 60, 110);
    scene.add(new T3.AmbientLight(0xffffff, 0.62)); const sun = new T3.DirectionalLight(0xfff0d8, 0.85); sun.position.set(12, 22, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 70 }); scene.add(sun);
    const S = { scene, boxes: [], circs: [] };
    const gr = part(new T3.PlaneGeometry(HX * 2 + 24, HZ * 2 + 24), M(stg.gnd), 0, 0, 0); gr.rotation.x = -Math.PI / 2; gr.castShadow = false; scene.add(gr);
    for (const [w, d, x, z] of [[HX * 2 + 1, 0.3, 0, -HZ], [HX * 2 + 1, 0.3, 0, HZ], [0.3, HZ * 2, -HX, 0], [0.3, HZ * 2, HX, 0]]) scene.add(part(new T3.BoxGeometry(w, 0.8, d), M(0x6b5a3a), x, 0.4, z));
    stg.build(S);
    const blocked = (x, z, r) => {
      if (Math.abs(x) > HX - 0.5 - r || Math.abs(z) > HZ - 0.5 - r) return true;
      for (const [x0, z0, x1, z1] of S.boxes) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
      for (const [cx, cz, cr] of S.circs) if (Math.hypot(x - cx, z - cz) < cr + r) return true;
      return false;
    };
    const free = (r) => { for (let i = 0; i < 200; i++) { const x = (rng() * 2 - 1) * (HX - 2), z = (rng() * 2 - 1) * (HZ - 2); if (!blocked(x, z, r)) return [x, z]; } return [0, 0]; };
    // 置物（本物）
    const props = [];
    for (let i = 0; i < stg.n; i++) {
      let p = null;
      for (let k = 0; k < 40 && !p; k++) { const [x, z] = free(1.2); if (props.every((q) => Math.hypot(q.x - x, q.z - z) > 1.7)) p = { x, z }; }
      if (!p) continue; p.kind = stg.kinds[Math.floor(rng() * stg.kinds.length)]; p.v = Math.floor(rng() * 3); p.rot = rng() * 6.28;
      p.m = mkProp(p.kind, p.v); p.m.position.set(p.x, 0, p.z); p.m.rotation.y = p.rot; scene.add(p.m); props.push(p);
    }
    // 役割（同じ種で全員同じ）
    const order = ids.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const nSk = solo ? 0 : clamp(+o.sk || 1, 1, Math.max(1, ids.length - 1));
    const P = {}, col = (id) => env.pal[ids.indexOf(id) % env.pal.length], hex = (s) => parseInt(String(s).replace('#', ''), 16);
    order.forEach((id, i) => {
      const sk = i < nSk, [x, z] = sk ? [(i - (nSk - 1) / 2) * 2, HZ - 3.2] : free(0.6);
      P[id] = { id, role: sk ? 's' : 'h', role0: sk ? 's' : 'h', x, z, tx: x, tz: z, fx: 0, fz: -1, form: null, mv: 0, hp: 3, out: false, caught: 0, stun: 0, cd: 0, fcd: 0, grp: null, key: '', bob: 0 };
    });
    const cpu = solo ? { id: '__cpu', x: 0, z: HZ - 3, fx: 0, fz: -1, cd: 1.5, tgt: null, grp: mkHuman(0xb03030, true), mv: 0 } : null; if (cpu) scene.add(cpu.grp);
    const MY = P[me], nm = (id) => (id === '__cpu' ? '見回り' : env.names[id] || '？');
    // カメラ（斜め上から見下ろす）
    const cam = new T3.OrthographicCamera(-10, 10, 10, -10, 0.1, 120), VH = 21; let camX = MY.x, camZ = MY.z;
    const fitCam = () => { rd.setSize(innerWidth, innerHeight, false); const a = innerWidth / Math.max(1, innerHeight); cam.left = -VH * a / 2; cam.right = VH * a / 2; cam.top = VH / 2; cam.bottom = -VH / 2; cam.updateProjectionMatrix(); }; fitCam(); addEventListener('resize', fitCam);
    const setCam = () => { cam.position.set(camX + 15, 17, camZ + 15); cam.lookAt(camX, 0, camZ); };
    // 印（探す先の輪・叩いた所・ビーコン）
    const ring = (c, ri, ro) => { const m = new T3.Mesh(new T3.RingGeometry(ri, ro, 28), new T3.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, side: T3.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; scene.add(m); return m; };
    const hl = ring(0xffe070, 0.7, 0.85), bc = ring(0xff8040, 5.6, 6), sw = ring(0xffffff, 0.9, 1.3), swm = ring(0xff4040, 0.9, 1.3);

    // 状態
    const FX = []; let t = 0, phase = 'hide', done = false, toast = null, toastT = 0, pend = null, sendT = 0, bk = 0, beacon = null, bcT = 0, last = { aT: 0 };
    const say = (s) => { toast = s; toastT = 3; };
    const alive = (p) => p && !p.out && !env.gone[p.id];
    const hiders = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 'h');
    const seekers = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 's' && p.hp > 0);
    const look = (p) => { // 見た目（化けていれば置物、そうでなければ人）
      const key = p.role === 'h' && p.form ? p.form.k + p.form.v : 'p' + p.role; if (key === p.key && p.grp) return; p.key = key;
      if (p.grp) scene.remove(p.grp);
      p.grp = p.role === 'h' && p.form ? mkProp(p.form.k, p.form.v) : mkHuman(p.role === 's' ? 0xb03030 : hex(col(p.id)), p.role === 's'); scene.add(p.grp);
    };
    const near = (x, z, r) => { let b = null, bd = r; for (const q of props) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; b = q; } } return b; };
    const moveBy = (p, dx, dz, r) => { const nx = p.x + dx, nz = p.z + dz; if (!blocked(nx, p.z, r)) p.x = nx; if (!blocked(p.x, nz, r)) p.z = nz; };
    const stick = { on: false, id: -1, x0: 0, y0: 0, x: 0, y: 0 };
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const pd = (e) => { if (!coarse || stick.on || e.clientX > innerWidth * 0.55) return; stick.on = true; stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.x = stick.y = 0; };
    const pm = (e) => { if (!stick.on || e.pointerId !== stick.id) return; const dx = e.clientX - stick.x0, dy = e.clientY - stick.y0, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 50); stick.x = dx / l * k; stick.y = dy / l * k; };
    const pu = (e) => { if (e.pointerId === stick.id) { stick.on = false; stick.x = stick.y = 0; } };
    cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); addEventListener('pointerup', pu); addEventListener('pointercancel', pu);
    const inVec = () => {
      let ix = (IN.r ? 1 : 0) - (IN.l ? 1 : 0), iy = (IN.d ? 1 : 0) - (IN.u ? 1 : 0);
      const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.connected);
      if (gp) { const bt = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); ix += (Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0) + (bt(15) ? 1 : 0) - (bt(14) ? 1 : 0); iy += (Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0) + (bt(13) ? 1 : 0) - (bt(12) ? 1 : 0); }
      ix += stick.x; iy += stick.y; const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; } return [ix, iy];
    };
    const tell = (m) => send(env.others, m);
    // 叩く
    const strike = (p) => {
      if (p.cd > 0 || p.stun > 0) return; p.cd = 0.8; const x = p.x + p.fx * 1.2, z = p.z + p.fz * 1.2; FX.push({ x, z, t: 0.25, bad: false }); SGK.AUDIO.sfx('slash');
      if (p === MY) { tell({ k: 'hs', id: me, x: r2(x), z: r2(z) }); pend = { t: 0.5, x, z, ok: false }; }
    };
    const caught = (id, by) => {
      const p = P[id]; if (!p || p.role !== 'h') return; p.form = null; p.caught0 = true; if (o.cau === 'out') p.out = true; else { p.role = 's'; p.hp = 3; }
      if (P[by]) P[by].caught++; say(`${nm(id)}が見つかった！`); SGK.AUDIO.sfx('hit');
    };
    const hurt = (p) => { p.hp--; p.stun = 1; FX.push({ x: p.x, z: p.z, t: 0.4, bad: true }); SGK.AUDIO.sfx('gbLose'); if (p === MY) { tell({ k: 'hl', id: me, hp: p.hp }); say(p.hp > 0 ? '外れ！ ただの置物だった（体力-1）' : '体力がなくなった…'); } };

    const game = {
      msg(from, m) {
        const p = P[m.id || from];
        if (m.k === 'hp') { const q = P[from]; if (!q) return; q.tx = m.x; q.tz = m.z; q.fx = m.fx; q.fz = m.fz; q.mv = m.m; const f = m.f ? { k: m.f[0], v: m.f[1] } : null; if (q.role === 'h') q.form = f; }
        else if (m.k === 'hs') { if (MY.role === 'h' && alive(MY) && phase !== 'end' && Math.hypot(m.x - MY.x, m.z - MY.z) < R_HIT) { caught(me, m.id); tell({ k: 'hc', id: me, by: m.id }); } }
        else if (m.k === 'hc') { if (P[m.id] && P[m.id].role === 'h') caught(m.id, m.by); if (m.by === me && pend) pend.ok = true; }
        else if (m.k === 'hl') { if (p) p.hp = m.hp; }
      },
      update(dt) {
        t += dt; phase = t < HIDE_T ? 'hide' : 'play'; toastT -= dt;
        for (const id of ids) { const p = P[id]; p.cd -= dt; p.stun -= dt; p.fcd -= dt; }
        // 自分の操作
        const [ix, iy] = inVec(), wx = RIGHT[0] * ix + FWD[0] * -iy, wz = RIGHT[1] * ix + FWD[1] * -iy, ml = Math.hypot(wx, wz);
        const act = alive(MY) && !done; MY.mv = 0;
        if (act && MY.stun <= 0) {
          const locked = MY.role === 's' && phase === 'hide';
          const dis = MY.role === 'h' && MY.form;
          if (!locked && ml > 0.05) {
            if (dis && o.mv === 'none') { const a = Math.atan2(MY.fx, MY.fz) - ix * 3 * dt; MY.fx = Math.sin(a); MY.fz = Math.cos(a); }
            else { const sp = MY.role === 's' ? SP_S : dis ? SP_HS : SP_H; moveBy(MY, wx / Math.max(1, ml) * sp * dt, wz / Math.max(1, ml) * sp * dt, 0.4); MY.fx = wx / ml; MY.fz = wz / ml; MY.mv = 1; }
          }
          if (IN.aT) {
            if (MY.role === 's') { if (!locked) strike(MY); }
            else if (MY.fcd <= 0) { const q = near(MY.x, MY.z, 2.4); if (q) { MY.form = { k: q.kind, v: q.v }; MY.fcd = 0.8; SGK.AUDIO.sfx('kmrKick'); say(`${KIND[q.kind]}に化けた`); } else say('近くに化けられる物がありません'); }
          }
          if (IN.bT && MY.role === 'h' && MY.form) { MY.form = null; MY.fcd = 0.5; say('人の姿に戻った'); }
        }
        // 送る
        sendT -= dt; if (sendT <= 0 && !solo) { sendT = 0.1; tell({ k: 'hp', x: r2(MY.x), z: r2(MY.z), fx: r2(MY.fx), fz: r2(MY.fz), m: MY.mv, f: MY.role === 'h' && MY.form ? [MY.form.k, MY.form.v] : 0 }); }
        // ほかの人の位置をなめらかに
        for (const id of ids) { if (id === me) continue; const p = P[id]; p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.z += (p.tz - p.z) * Math.min(1, dt * 12); }
        // 叩いた結果（ほかの人の「見つかった」が来なければ置物に当たっただけ）
        if (pend) { pend.t -= dt; if (pend.t <= 0) { if (!pend.ok && near(pend.x, pend.z, R_HIT)) hurt(MY); pend = null; } }
        // ひとり練習の見回り
        if (cpu && !done) {
          cpu.cd -= dt;
          if (phase === 'play') {
            if (!cpu.tgt || Math.hypot(cpu.tgt.x - cpu.x, cpu.tgt.z - cpu.z) < 1.1) { if (cpu.tgt && cpu.cd <= 0) { cpu.cd = 1.4; FX.push({ x: cpu.tgt.x, z: cpu.tgt.z, t: 0.25, bad: false }); if (alive(MY) && MY.role === 'h' && Math.hypot(cpu.tgt.x - MY.x, cpu.tgt.z - MY.z) < R_HIT) caught(me, '__cpu'); } if (!cpu.tgt || cpu.cd > 0.2) cpu.tgt = props[Math.floor(Math.random() * props.length)] || null; }
            if (cpu.tgt) { const dx = cpu.tgt.x - cpu.x, dz = cpu.tgt.z - cpu.z, l = Math.hypot(dx, dz) || 1; if (l > 1) { cpu.x += dx / l * 3 * dt; cpu.z += dz / l * 3 * dt; cpu.fx = dx / l; cpu.fz = dz / l; } }
          }
        }
        // 音の合図（ときどきだれかの近くを知らせる）
        if (!solo && t > BEACON0 + bk * BEACON_EVERY && !done) {
          const hs = hiders().sort((a, b) => (a.id < b.id ? -1 : 1));
          if (hs.length) { const q = hs[(bk * 5 + (cfg.seed % 7)) % hs.length], rr = mulberry((cfg.seed + bk * 977) >>> 0); const a = rr() * 6.28, d = rr() * 3.5; beacon = { x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d }; bcT = 6; SGK.AUDIO.sfx('news'); say('どこかで物音がした…'); }
          bk++;
        } else if (solo && t > BEACON0 + bk * BEACON_EVERY) { bk++; }
        bcT -= dt;
        // 終わり？
        if (!done) {
          const hs = hiders(), ss = seekers(); let over = null;
          if (!solo && !hs.length) over = 's'; else if (solo && (!alive(MY) || MY.role !== 'h')) over = 's'; else if (!solo && !ss.length && phase === 'play') over = 'h'; else if (t >= ROUND) over = 'h';
          if (over) { done = true; this.finish(over); }
        }
        // 絵に反映
        for (const id of ids) { const p = P[id]; if (p.role === 'h' && !p.form) { /* 人 */ } look(p); const gp = p.grp; if (!gp) continue; gp.visible = !p.out; p.bob += dt * (p.mv ? 9 : 0); const hop = p.mv ? Math.abs(Math.sin(p.bob)) * (p.role === 'h' && p.form ? 0.22 : 0.08) : 0; gp.position.set(p.x, hop, p.z); gp.rotation.y = Math.atan2(p.fx, p.fz); }
        if (cpu) { cpu.grp.position.set(cpu.x, 0, cpu.z); cpu.grp.rotation.y = Math.atan2(cpu.fx, cpu.fz); }
        camX += (MY.x - camX) * Math.min(1, dt * 6); camZ += (MY.z - camZ) * Math.min(1, dt * 6);
        // 印
        const q = MY.role === 'h' && alive(MY) ? near(MY.x, MY.z, 2.4) : null; hl.visible = !!q && act; if (q) hl.position.set(q.x, 0.06, q.z);
        bc.visible = bcT > 0 && !!beacon; if (beacon) { bc.position.set(beacon.x, 0.06, beacon.z); bc.scale.setScalar(1 + 0.08 * Math.sin(t * 8)); }
        for (const f of FX) f.t -= dt; while (FX.length && FX[0].t <= 0) FX.shift();
        const f0 = FX.find((f) => !f.bad), f1 = FX.find((f) => f.bad); sw.visible = !!f0; if (f0) { sw.position.set(f0.x, 0.07, f0.z); sw.scale.setScalar(1 + (0.25 - f0.t) * 3); } swm.visible = !!f1; if (f1) { swm.position.set(f1.x, 0.07, f1.z); }
      },
      finish(over) {
        const ini = MY.role0, hs = ids.filter((i) => P[i].role0 === 'h'), surv = (id) => !P[id].caught0 && !env.gone[id];
        const win = ini === 'h' ? surv(me) : over === 's';
        const rows = ids.map((id) => { const p = P[id]; return `<b style="color:${col(id)}">${nm(id)}</b>　${p.role0 === 'h' ? (surv(id) ? '隠れきった！' : '見つかった') : `探す側：${p.caught}人見つけた`}`; });
        env.end({ title: win ? (ini === 'h' ? '隠れきった！' : '全員見つけた！') : (ini === 'h' ? '見つかってしまった…' : '見つけきれなかった…'), rows, cmd: { type: 'partyResult', game: 'hide', n: ids.length, win: win ? 1 : 0, cnt: P[me].caught, role: ini } });
      },
      draw() {
        setCam(); rd.render(scene, cam);
        const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
        const txt = (s, x, y, o2) => env.text(g, s, x, y, o2), pj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
        // 名前（探す側は全員に、隠れる側は仲間にだけ）
        for (const id of ids) { const p = P[id]; if (!alive(p) || id === me) continue; if (!(p.role === 's' || MY.role === 'h' || !alive(MY))) continue; const [sx, sy] = pj(p.x, p.role === 'h' && p.form ? 1.5 : 2, p.z); txt(nm(id), sx, sy, { al: 'center', sz: 13, c: p.role === 's' ? '#ff9a8a' : '#cfe8ff' }); }
        if (cpu) { const [sx, sy] = pj(cpu.x, 2, cpu.z); txt('見回り', sx, sy, { al: 'center', sz: 13, c: '#ff9a8a' }); }
        { const [sx, sy] = pj(MY.x, MY.role === 'h' && MY.form ? 1.6 : 2.1, MY.z); txt('▼', sx, sy, { al: 'center', sz: 14, c: '#ffe070' }); }
        const rem = Math.max(0, Math.ceil(ROUND - t)); txt(`${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`, W / 2, 30, { al: 'center', sz: 26, b: 1 });
        txt(`${stg.name}　${MY.role === 's' ? '探す側' : alive(MY) ? '隠れる側' : '見つかった（観戦）'}　隠れている：${solo ? (alive(MY) ? 1 : 0) : hiders().length}人`, W / 2, 52, { al: 'center', sz: 14 });
        if (MY.role === 's') txt('体力 ' + '●'.repeat(Math.max(0, MY.hp)) + '○'.repeat(Math.max(0, 3 - MY.hp)), 16, 30, { sz: 20, c: '#ff9a8a' });
        else if (MY.form) txt(`いまの姿：${KIND[MY.form.k]}${o.mv === 'none' ? '（動けない・←→で向き）' : '（ゆっくり動ける）'}`, 16, 30, { sz: 16, c: '#ffe070' });
        const qn = MY.role === 'h' && alive(MY) ? near(MY.x, MY.z, 2.4) : null;
        const hint = MY.role === 's' ? 'A／Space：叩く（置物を叩くと体力-1）　移動：矢印／WASD／スティック' : alive(MY) ? `${qn ? `A／Space：${KIND[qn.kind]}に化ける　` : ''}${MY.form ? 'B／X：人に戻る　' : ''}移動：矢印／WASD／スティック` : '';
        txt(hint, W / 2, H - 16, { al: 'center', sz: 14 });
        if (toastT > 0 && toast) txt(toast, W / 2, H * 0.28, { al: 'center', sz: 22, b: 1, c: '#ffe9a0' });
        if (phase === 'hide') { const left = Math.ceil(HIDE_T - t); if (MY.role === 's') { g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(0, 0, W, H); txt(`目をつぶって数えています… ${left}`, W / 2, H / 2, { al: 'center', sz: 28, b: 1 }); } else txt(`隠れよう！（あと${left}秒）近くの物でAを押すと化けられる`, W / 2, H * 0.2, { al: 'center', sz: 20, b: 1, c: '#bff0c0' }); }
        if (MY.stun > 0) { g.fillStyle = 'rgba(255,0,0,0.18)'; g.fillRect(0, 0, W, H); }
        if (stick.on) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(stick.x0, stick.y0, 50, 0, 7); g.stroke(); g.beginPath(); g.arc(stick.x0 + stick.x * 50, stick.y0 + stick.y * 50, 20, 0, 7); g.fillStyle = 'rgba(255,255,255,.45)'; g.fill(); }
      },
      dispose() { removeEventListener('resize', fitCam); cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu); try { rd.dispose(); } catch (e) {} if (c3.parentNode) c3.parentNode.removeChild(c3); },
    };
    return game;
  };
})();
