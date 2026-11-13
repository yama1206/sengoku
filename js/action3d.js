// 0.63.0 自分で戦う：3D表示（three.js）。計算は action.js のまま、見た目だけを3Dで描く
// three.js が読めないときや WebGL が使えないときは、これまでの2D表示に戻る
(function () {
  const R = SGK.RENDER, SIM = SGK.SIM, TR = SIM.TROOPS;
  const X = R.act3d = { on: true, ready: false, failed: false };
  try { const v = localStorage.getItem('sgk-act3d'); if (v === '0') X.on = false; } catch (e) { /* 保存できない環境 */ }
  X.toggle = () => { X.on = !X.on; try { localStorage.setItem('sgk-act3d', X.on ? '1' : '0'); } catch (e) { /* 無視 */ } if (!X.on && cv) cv.style.display = 'none'; return X.on; };

  let T, rd, scene, cam3, cv, sun, hideT, W = 0, H = 0, clock = 0;
  let built = null, groundG = null, groundM = null, trees = [], ter = [], hills = [];
  const M = {}; // 兵の各部分（まとめて描く InstancedMesh）
  const CAP = { body: 700, dead: 520, arrow: 300, ring: 120 };
  const last = new Map(); // 兵ごとの前の位置（歩く揺れに使う）

  // ---- 地面の高さ（丘は盛り上げる。計算には影響しない見た目だけ） ----
  function hgt(x, y) {
    let h = 0;
    for (const t of hills) {
      const d = Math.hypot(x - t.x, y - t.y); if (d >= t.r) continue;
      const q = 1 - (d / t.r) * (d / t.r); h += t.hh * q * q;
    }
    for (const t of ter) if (t.k === 'm') { const d = Math.hypot(x - t.x, y - t.y); if (d < t.r && d > (t.ri || 0)) h -= 1.4; }
    return h;
  }
  X.hgt = hgt;

  function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  function init() {
    T = window.THREE; if (!T) return false;
    cv = document.createElement('canvas'); cv.id = 'act3d';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
    const m = document.getElementById('map'); m.parentNode.insertBefore(cv, m);
    try { rd = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { X.failed = true; return false; }
    rd.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    rd.shadowMap.enabled = true; rd.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene(); scene.background = new T.Color(0xa9c6d6); scene.fog = new T.Fog(0xa9c6d6, 160, 460);
    cam3 = new T.PerspectiveCamera(45, 1, 0.5, 2000);
    scene.add(new T.HemisphereLight(0xdfeaf2, 0x55613a, 0.75));
    sun = new T.DirectionalLight(0xfff2dc, 0.85); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);
    // 戦場の外の広い地面
    const out = new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x66733f }));
    out.position.set(350, -0.3, 230); out.receiveShadow = true; scene.add(out);

    const lam = (o) => new T.MeshLambertMaterial(o);
    const mk = (name, geo, mat, cap, shadow = true) => { const im = new T.InstancedMesh(geo, mat, cap); im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.castShadow = shadow; im.receiveShadow = false; im.frustumCulled = false; im.setColorAt(0, new T.Color(0xffffff)); im.count = 0; scene.add(im); M[name] = im; return im; };
    const white = () => lam({ color: 0xffffff });
    // 人：胴（色は陣営ごと）、頭、陣笠、背中の旗（指物）。前が +X
    mk('body', new T.CylinderGeometry(0.26, 0.36, 1.05, 8).translate(0, 0.62, 0), white(), CAP.body);
    mk('legs', new T.BoxGeometry(0.3, 0.12, 0.42).translate(0, 0.06, 0), lam({ color: 0x2a2118 }), CAP.body, false);
    mk('head', new T.SphereGeometry(0.19, 8, 6).translate(0, 1.33, 0), lam({ color: 0xe0b48a }), CAP.body);
    mk('hat', new T.ConeGeometry(0.42, 0.2, 10).translate(0, 1.52, 0), white(), CAP.body);
    mk('flag', new T.PlaneGeometry(0.42, 0.62).rotateY(Math.PI / 2).translate(-0.3, 1.95, 0), new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), CAP.body, false);
    mk('pole', new T.CylinderGeometry(0.02, 0.02, 1.3, 4).translate(-0.3, 1.6, 0), lam({ color: 0x3b2a18 }), CAP.body, false);
    // 武器（長さは種類ごとに別の形）
    const spear = (L) => new T.CylinderGeometry(0.035, 0.035, L, 5).rotateZ(-Math.PI / 2 + 0.32).translate(0.3 + L * 0.22, 1.05 + L * 0.15, 0.22);
    mk('spearS', spear(2.6), lam({ color: 0x4a3420 }), CAP.body);
    mk('spearL', spear(4.4), lam({ color: 0x4a3420 }), CAP.body);
    mk('sword', new T.BoxGeometry(1.0, 0.06, 0.04).translate(0.75, 1.0, 0.25), lam({ color: 0xd8dde2 }), CAP.body);
    mk('bow', new T.TorusGeometry(0.75, 0.03, 4, 12, Math.PI * 0.9).rotateZ(-Math.PI * 0.45).rotateY(Math.PI / 2).translate(0.32, 1.05, 0), lam({ color: 0x5a3a1c }), CAP.body);
    mk('gun', new T.BoxGeometry(1.25, 0.08, 0.08).translate(0.55, 1.08, 0.18), lam({ color: 0x2b2420 }), CAP.body);
    // 馬
    const horse = new T.BoxGeometry(1.7, 0.75, 0.55).translate(0, 1.15, 0);
    mk('horse', horse, lam({ color: 0x6b4426 }), 200);
    mk('hneck', new T.BoxGeometry(0.75, 0.32, 0.3).rotateZ(0.8).translate(0.95, 1.6, 0), lam({ color: 0x6b4426 }), 200);
    mk('hlegs', new T.BoxGeometry(1.3, 0.8, 0.4).translate(0, 0.4, 0), lam({ color: 0x4a2e18 }), 200);
    // 本人の兜の飾り（前立て）
    mk('crest', new T.TorusGeometry(0.3, 0.05, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(0.12, 1.62, 0), new T.MeshLambertMaterial({ color: 0xf0c230, emissive: 0x5a4200 }), 40);
    // 倒れた者
    mk('dead', new T.BoxGeometry(1.3, 0.22, 0.45).translate(0, 0.11, 0), white(), CAP.dead, false);
    // 飛び道具
    mk('arrow', new T.BoxGeometry(1.1, 0.05, 0.05), new T.MeshBasicMaterial({ color: 0x3a2610 }), CAP.arrow, false);
    mk('bullet', new T.BoxGeometry(2.4, 0.09, 0.09), new T.MeshBasicMaterial({ color: 0xfff0a0 }), CAP.arrow, false);
    // 足もとの輪（選んだ隊・本人）
    mk('ring', new T.RingGeometry(0.55, 0.75, 16).rotateX(-Math.PI / 2).translate(0, 0.06, 0), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }), CAP.body, false);
    // 振りの扇
    X.fans = [];
    X.ready = true;
    return true;
  }

  // ---- 戦場ごとの地面と木 ----
  function build(id, list) {
    built = id; ter = list || []; hills = ter.filter((t) => t.k === 'h').map((t) => ({ x: t.x, y: t.y, r: t.r * 1.15, hh: Math.min(14, t.r * 0.16) }));
    if (groundM) { scene.remove(groundM); groundG.dispose(); }
    for (const t of trees) { scene.remove(t); t.geometry.dispose(); }
    trees = [];
    const F = SIM.FIELD;
    groundG = new T.PlaneGeometry(F.w + 80, F.h + 80, 190, 130).rotateX(-Math.PI / 2).translate(F.w / 2, 0, F.h / 2);
    const P = groundG.attributes.position, col = new Float32Array(P.count * 3), c = new T.Color(), r = rng(7);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getZ(i); P.setY(i, hgt(x, y));
      c.setHex(0x7e9450);
      for (const t of ter) {
        const d = Math.hypot(x - t.x, y - t.y);
        if (t.k === 'f' && d < t.r) c.lerp(new T.Color(0x4f6c34), 0.75);
        else if (t.k === 'h' && d < t.r * 1.15) c.lerp(new T.Color(0xa49866), 0.55 * (1 - d / (t.r * 1.15)) + 0.2);
        else if (t.k === 'm' && d < t.r && d > (t.ri || 0)) c.setHex(0x4d6f8e);
        else if (t.k === 'k' && d < t.r) c.setHex(0xb9a57c);
        else if (t.k === 's' && d < t.r && d > (t.ri || 0)) c.lerp(new T.Color(0x8b7d55), 0.5);
        else if (!['f', 'h', 'm', 'k', 's'].includes(t.k) && d < t.r) c.setHex(0x4d6f8e);
      }
      if (x < 0 || y < 0 || x > F.w || y > F.h) c.multiplyScalar(0.85);
      const n = 0.94 + r() * 0.1; col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
    }
    groundG.setAttribute('color', new T.BufferAttribute(col, 3)); groundG.computeVertexNormals();
    groundM = new T.Mesh(groundG, new T.MeshLambertMaterial({ vertexColors: true })); groundM.receiveShadow = true; scene.add(groundM);
    // 森の木
    const pts = [], rr = rng(String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 3));
    for (const t of ter) if (t.k === 'f') { const n = Math.min(160, Math.round(t.r * t.r * 0.07)); for (let i = 0; i < n; i++) { const a = rr() * 7, d = Math.sqrt(rr()) * t.r; pts.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, 0.8 + rr() * 0.6]); } }
    if (pts.length) {
      const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.25, 2, 5).translate(0, 1, 0), new T.MeshLambertMaterial({ color: 0x4a3420 }), pts.length);
      const leaf = new T.InstancedMesh(new T.ConeGeometry(1.6, 4.5, 7).translate(0, 4, 0), new T.MeshLambertMaterial({ color: 0x2f5426 }), pts.length);
      const o = new T.Object3D();
      pts.forEach(([x, y, s], i) => { o.position.set(x, hgt(x, y), y); o.scale.set(s, s, s); o.rotation.y = s * 9; o.updateMatrix(); trunk.setMatrixAt(i, o.matrix); leaf.setMatrixAt(i, o.matrix); });
      trunk.castShadow = leaf.castShadow = true; leaf.receiveShadow = true; scene.add(trunk, leaf); trees.push(trunk, leaf);
    }
    last.clear();
  }

  // ---- 1人分を置く ----
  let O, Mx, C;
  const cnt = {};
  function put(name, m, color) { const im = M[name]; const i = cnt[name]++; if (i >= im.instanceMatrix.count) return; im.setMatrixAt(i, m); if (color) im.setColorAt(i, color); }
  function weaponOf(s) {
    if (s.hero) { const n = s.wep && s.wep.name; return n === '槍' ? 'spearL' : n === '弓' ? 'bow' : n === '鉄砲' ? 'gun' : 'sword'; }
    const t = s.type; if (!t) return 'sword';
    if (t === 'yumi') return 'bow'; if (t === 'teppo' || t === 'teppogashira') return 'gun';
    if (t === 'nagayari' || t === 'yarigashira') return 'spearL'; if (t === 'bandit') return 'sword';
    return 'spearS';
  }

  const COL = { A: 0x2f5a96, Aown: 0x3a6ea5, Aally: 0x5d9ab8, B: 0xa8352a };
  X.draw = function (b, myPid, sel, dt, terList, cam, w, h) {
    if (!X.on || X.failed) return false;
    if (!X.ready && !init()) return false;
    clock += dt;
    if (w !== W || h !== H) { W = w; H = h; rd.setSize(W, H, false); cam3.aspect = W / Math.max(1, H); cam3.updateProjectionMatrix(); }
    if (built !== b.id) build(b.id, terList);
    cv.style.display = 'block'; clearTimeout(hideT); hideT = setTimeout(() => { cv.style.display = 'none'; }, 250);
    if (!O) { O = new T.Object3D(); O.rotation.order = 'YXZ'; Mx = new T.Matrix4(); C = new T.Color(); }
    // カメラ：マウント＆ブレイド2のように本人の肩越し（マウスで向き、ホイールで寄る・引く）
    const hx = cam.hx != null ? cam.hx : cam.x, hy = cam.hy != null ? cam.hy : cam.y;
    if (cam.yaw == null) cam.yaw = 0; if (cam.pitch == null) cam.pitch = 0.28;
    const D = 45 / cam.z, yw = cam.yaw, pt = cam.pitch, th = hgt(hx, hy) + 1.75;
    const dx = Math.cos(yw) * Math.cos(pt), dy = -Math.sin(pt), dz = Math.sin(yw) * Math.cos(pt), rx = -Math.sin(yw), rz = Math.cos(yw);
    let px = hx - dx * D + rx * 0.55, py = th - dy * D + 0.3, pz = hy - dz * D + rz * 0.55;
    py = Math.max(py, hgt(px, pz) + 0.4);
    cam3.position.set(px, py, pz); cam3.lookAt(px + dx, py + dy, pz + dz);
    sun.position.set(hx - 60, th + 120, hy + 40); sun.target.position.set(hx, th, hy);
    for (const k in M) cnt[k] = 0;
    const A = b.act, live = (s) => s.hp > 0 && !s.gone;
    const mats = {};
    for (const s of A.s) {
      if (!live(s)) continue;
      const u = A.byG[s.g], own = u && u.owner === myPid, cav = s.type && TR[s.type] && TR[s.type].cav;
      // 歩くと少し上下に揺れる
      const p = last.get(s.id); let mv = 0; if (p) { mv = Math.hypot(s.x - p[0], s.y - p[1]) / Math.max(dt, 0.001); p[0] = s.x; p[1] = s.y; } else last.set(s.id, [s.x, s.y]);
      const bob = mv > 0.6 ? Math.abs(Math.sin(clock * (cav ? 9 : 11) + s.id)) * (cav ? 0.18 : 0.1) : 0;
      const gy = hgt(s.x, s.y), f = s.f || 0, sc = s.hero ? 1.22 : 1;
      let col = s.side === 'B' ? COL.B : own ? COL.Aown : u && (u.owner || u.cmd) ? COL.Aally : COL.A;
      if (u && u.order === 'rout') col = s.side === 'B' ? 0xd88a7f : 0x9db3c7;
      if (s.pc) col = s.pc === myPid ? 0xe8b923 : 0xe88a23;
      C.setHex(s.fl ? 0xffffff : col);
      const ride = cav ? 0.95 : 0;
      if (cav) { O.position.set(s.x, gy + bob * 0.5, s.y); O.rotation.set(0, -f, 0); O.scale.set(1, 1, 1); O.updateMatrix(); put('horse', O.matrix); put('hneck', O.matrix); put('hlegs', O.matrix); }
      O.position.set(s.x, gy + ride + bob, s.y); O.rotation.set(0, -f, 0); O.scale.set(sc, sc, sc); O.updateMatrix();
      put('body', O.matrix, C); if (!cav) put('legs', O.matrix); put('head', O.matrix);
      const hatC = s.side === 'B' ? 0x3a1a14 : 0x1c2230; put('hat', O.matrix, C.setHex(s.hero ? 0x2a2a2a : hatC));
      put('flag', O.matrix, C.setHex(s.side === 'B' ? 0xc8402f : own ? 0xf2f2f2 : 0x6fa7d8)); put('pole', O.matrix);
      if (s.hero) put('crest', O.matrix);
      // 武器（本人が振るときは横に払う）
      const wk = weaponOf(s);
      if (s.hero && s.blk) { O.rotation.set(0.9, -f, 0); O.updateMatrix(); }
      if (s.sw && s.hero) {
        const k = 1 - Math.max(0, s.sw.t) / 0.18, a = s.sw.a + s.sw.arc * (1 - 2 * k);
        O.rotation.set(0, -a, 0); O.updateMatrix();
      }
      put(wk, O.matrix);
      // 足もとの輪：自分の本人・選んだ隊
      const isSel = own && !s.hero && u && (u.id === sel || sel === 'all');
      if (s.pc === myPid || isSel) { O.position.set(s.x, gy, s.y); O.rotation.set(0, 0, 0); O.scale.set(s.hero ? 1.6 : 1, 1, s.hero ? 1.6 : 1); O.updateMatrix(); put('ring', O.matrix, C.setHex(s.pc === myPid ? 0xffe060 : 0xfff2a0)); }
      // 本人の体力（画面に重ねる）は 2D の側で描く
    }
    // 倒れた者
    let di = 0;
    for (const p of A.dead) { O.position.set(p.x, hgt(p.x, p.y), p.y); O.rotation.set(0, (di++ * 2.39) % 6.28, 0); O.scale.set(1, 1, 1); O.updateMatrix(); put('dead', O.matrix, C.setHex(p.side === 'A' ? 0x34405e : 0x6a2a20)); }
    // 飛び道具
    for (const p of A.pr) {
      const a = Math.atan2(p.vy, p.vx); O.position.set(p.x, hgt(p.x, p.y) + 1.3, p.y); O.rotation.set(0, -a, 0); O.scale.set(1, 1, 1); O.updateMatrix();
      put(p.gun ? 'bullet' : 'arrow', O.matrix);
    }
    for (const k in M) { const im = M[k]; im.count = Math.min(cnt[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // 振りの扇
    let fi = 0;
    for (const hh of A.s) if (hh.pc && hh.sw && live(hh)) {
      let fm = X.fans[fi]; if (!fm) { fm = X.fans[fi] = new T.Mesh(new T.CircleGeometry(1, 16, 0, 1), new T.MeshBasicMaterial({ color: 0xfffae0, transparent: true, depthWrite: false, side: T.DoubleSide })); scene.add(fm); }
      if (fm.userData.arc !== hh.sw.arc) { fm.geometry.dispose(); fm.geometry = new T.CircleGeometry(1, 16, -hh.sw.arc, hh.sw.arc * 2).rotateX(-Math.PI / 2); fm.userData.arc = hh.sw.arc; }
      fm.visible = true; fm.material.opacity = 0.45 * Math.max(0, hh.sw.t) / 0.18;
      fm.position.set(hh.x, hgt(hh.x, hh.y) + 0.9, hh.y); fm.rotation.set(0, -hh.sw.a, 0); fm.scale.set(hh.sw.r, 1, hh.sw.r); fi++;
    }
    for (; fi < X.fans.length; fi++) X.fans[fi].visible = false;
    rd.render(scene, cam3);
    // 掃除：いなくなった兵の記録を消す
    if (last.size > A.s.length * 2 + 50) { const ids = new Set(A.s.map((s) => s.id)); for (const k of last.keys()) if (!ids.has(k)) last.delete(k); }
    return true;
  };

  // 戦場の位置 → 画面の位置（hh = 地面からの高さ）
  const V = () => (X._v || (X._v = new T.Vector3()));
  X.S = (x, y, hh = 0) => { const v = V().set(x, hgt(x, y) + hh, y).project(cam3); if (v.z > 1) return [-9999, -9999]; return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  // 画面の位置 → 戦場の位置（地面に当たる所。丘の高さも少し考える）
  X.toWorld = (sx, sy) => {
    const rc = X._rc || (X._rc = new T.Raycaster()), n = new T.Vector2((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    rc.setFromCamera(n, cam3); const o = rc.ray.origin, d = rc.ray.direction;
    let gh = 0, t = 0;
    for (let i = 0; i < 3; i++) { if (Math.abs(d.y) < 1e-4) break; t = (gh - o.y) / d.y; gh = hgt(o.x + d.x * t, o.z + d.z * t); }
    return [o.x + d.x * t, o.z + d.z * t];
  };
})();
