// 0.63.0 自分で戦う：3D表示（three.js）。0.65.0 見た目の質を上げた（空・雲・草・木・地面の模様・具足・歩く足）。計算は action.js のまま、見た目だけを3Dで描く
// three.js が読めないときや WebGL が使えないときは、これまでの2D表示に戻る
(function () {
  const R = SGK.RENDER, SIM = SGK.SIM, TR = SIM.TROOPS;
  const X = R.act3d = { on: true, ready: false, failed: false };
  try { const v = localStorage.getItem('sgk-act3d'); if (v === '0') X.on = false; } catch (e) { /* 保存できない環境 */ }
  X.toggle = () => { X.on = !X.on; try { localStorage.setItem('sgk-act3d', X.on ? '1' : '0'); } catch (e) { /* 無視 */ } if (!X.on && cv) cv.style.display = 'none'; return X.on; };

  let T, rd, scene, cam3, cv, sun, hideT, W = 0, H = 0, clock = 0;
  let built = null, groundG = null, groundM = null, trees = [], ter = [], hills = [], sky = null;
  const L4 = { m: null }; // 足などの部分を動かすための行列
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
    h += 0.35 * Math.sin(x * 0.07 + 1.3) * Math.sin(y * 0.06 + 0.7) + 0.18 * Math.sin(x * 0.17 - y * 0.13); // 0.65.0 地面の小さな起伏
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
    scene = new T.Scene(); scene.background = new T.Color(0xcfdde6); scene.fog = new T.Fog(0xcfdde6, 150, 520);
    cam3 = new T.PerspectiveCamera(45, 1, 0.5, 2000);
    scene.add(new T.HemisphereLight(0xd6e6f5, 0x4f5a34, 0.72));
    sun = new T.DirectionalLight(0xffe6c0, 1.0); sun.castShadow = true;
    sun.shadow.normalBias = 0.03;
    // 0.65.0 空（色の移り変わり・太陽・ゆっくり流れる雲）
    sky = new T.Mesh(new T.SphereGeometry(1500, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(0x4f86c2) }, hor: { value: new T.Color(0xcfdde6) }, sunD: { value: new T.Vector3(0.4, 0.8, -0.3) }, tm: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 hor; uniform vec3 sunD; uniform float tm; varying vec3 vP;',
        'float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fb(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * ns(p); p *= 2.03; a *= 0.5; } return v; }',
        'void main(){ float h = max(vP.y, 0.0); vec3 c = mix(hor, top, pow(h, 0.5));',
        ' if (vP.y > 0.0) { vec2 q = vP.xz / (vP.y + 0.12) * 1.6 + vec2(tm * 0.012, tm * 0.004); float cl = smoothstep(0.52, 0.78, fb(q)) * smoothstep(0.0, 0.25, vP.y); c = mix(c, vec3(0.97, 0.97, 0.95), cl * 0.85); }',
        ' else c = hor * 0.95;',
        ' float s = max(dot(vP, normalize(sunD)), 0.0); c += vec3(1.0, 0.9, 0.7) * (pow(s, 900.0) * 1.5 + pow(s, 10.0) * 0.16);',
        ' gl_FragColor = vec4(c, 1.0); }',
      ].join('\n'),
    }));
    sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    sun.shadow.bias = -0.0008; scene.add(sun); scene.add(sun.target);
    // 戦場の外の広い地面
    const out = new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x6d7c44 }));
    out.position.set(350, -0.3, 230); out.receiveShadow = true; scene.add(out);

    const lam = (o) => new T.MeshLambertMaterial(o);
    const mk = (name, geo, mat, cap, shadow = true) => { const im = new T.InstancedMesh(geo, mat, cap); im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.castShadow = shadow; im.receiveShadow = false; im.frustumCulled = false; im.setColorAt(0, new T.Color(0xffffff)); im.instanceColor.array.fill(1); im.count = 0; /* 0.65.0 色を付けない部分も素材の色で出す（以前は黒くなっていた） */ scene.add(im); M[name] = im; return im; };
    const white = () => lam({ color: 0xffffff });
    // 人：胴（色は陣営ごと）、頭、陣笠、背中の旗（指物）。前が +X
    // 0.65.0 胴（色は陣営）・草摺（腰の防具）・袖（肩の防具）・両足（歩くと前後に振る）
    mk('body', new T.CylinderGeometry(0.24, 0.29, 0.62, 10).translate(0, 0.86, 0), white(), CAP.body);
    mk('kusa', new T.CylinderGeometry(0.3, 0.42, 0.34, 10, 1, true).translate(0, 0.5, 0), new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), CAP.body);
    mk('sode', new T.BoxGeometry(0.26, 0.2, 0.84).translate(0, 1.08, 0), white(), CAP.body);
    mk('obi', new T.CylinderGeometry(0.295, 0.295, 0.08, 10).translate(0, 0.66, 0), lam({ color: 0xc9a65a }), CAP.body, false);
    const leg = new T.BoxGeometry(0.15, 0.56, 0.17).translate(0, -0.28, 0);
    mk('legL', leg, lam({ color: 0x2a2118 }), CAP.body); mk('legR', leg, lam({ color: 0x2a2118 }), CAP.body);
    mk('head', new T.SphereGeometry(0.19, 10, 8).translate(0, 1.33, 0), lam({ color: 0xe0b48a }), CAP.body);
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
    mk('hhead', new T.BoxGeometry(0.55, 0.24, 0.24).rotateZ(-0.5).translate(1.38, 1.82, 0), lam({ color: 0x5e3a20 }), 200);
    mk('htail', new T.BoxGeometry(0.12, 0.6, 0.12).rotateZ(-0.5).translate(-0.98, 1.1, 0), lam({ color: 0x241810 }), 200, false);
    mk('saddle', new T.BoxGeometry(0.6, 0.12, 0.62).translate(0, 1.56, 0), white(), 200, false);
    const hleg = new T.BoxGeometry(0.17, 0.82, 0.46).translate(0, -0.41, 0); // 左右の2本をまとめて1つに（前足・後足）
    mk('hlegF', hleg, lam({ color: 0x4a2e18 }), 200); mk('hlegB', hleg, lam({ color: 0x4a2e18 }), 200);
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
    L4.m = new T.Matrix4();
    X.ready = true;
    return true;
  }

  // 0.65.0 絵の具（画面の中で作る模様。外から画像は読まない）
  let texG = null, texGrass = null;
  function canvasTex(n, fn) { const c = document.createElement('canvas'); c.width = c.height = n; fn(c.getContext('2d'), n); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = rd.capabilities.getMaxAnisotropy ? Math.min(8, rd.capabilities.getMaxAnisotropy()) : 1; return t; }
  function groundTex() {
    return canvasTex(256, (g, n) => {
      const r = rng(11); g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 2600; i++) { const v = 170 + Math.floor(r() * 85); g.fillStyle = `rgba(${v},${v},${v},0.55)`; const w = 1 + r() * 3; g.fillRect(r() * n, r() * n, w, w); }
      for (let i = 0; i < 700; i++) { const v = 255; g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.lineWidth = 1; const x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 4); g.stroke(); }
    });
  }
  function grassTex() {
    const t = canvasTex(128, (g, n) => {
      const r = rng(5); g.clearRect(0, 0, n, n);
      for (let i = 0; i < 46; i++) { const x = 8 + r() * (n - 16), h = n * (0.45 + r() * 0.5), lean = (r() - 0.5) * 30, v = 170 + Math.floor(r() * 85);
        g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.moveTo(x - 2.5, n); g.quadraticCurveTo(x + lean * 0.4, n - h * 0.6, x + lean, n - h); g.quadraticCurveTo(x + lean * 0.4 + 1, n - h * 0.6, x + 2.5, n); g.fill(); }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t;
  }
  const water = (t, x, y) => { const d = Math.hypot(x - t.x, y - t.y); return (t.k === 'm' && d < t.r && d > (t.ri || 0)) || (!['f', 'h', 'm', 'k', 's'].includes(t.k) && d < t.r); };

  // ---- 戦場ごとの地面と木 ----
  function build(id, list) {
    built = id; ter = list || []; hills = ter.filter((t) => t.k === 'h').map((t) => ({ x: t.x, y: t.y, r: t.r * 1.15, hh: Math.min(14, t.r * 0.16) }));
    if (groundM) { scene.remove(groundM); groundG.dispose(); }
    for (const t of trees) { scene.remove(t); t.geometry.dispose(); if (t.material) t.material.dispose(); if (t.dispose) t.dispose(); }
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
      const n = (0.95 + r() * 0.08) * (0.94 + 0.08 * Math.sin(x * 0.045 + 2) * Math.sin(y * 0.05)); // 0.65.0 広いまだら模様 col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
    }
    groundG.setAttribute('color', new T.BufferAttribute(col, 3)); groundG.computeVertexNormals();
    if (!texG) { texG = groundTex(); texG.repeat.set((F.w + 80) / 7, (F.h + 80) / 7); }
    groundM = new T.Mesh(groundG, new T.MeshLambertMaterial({ vertexColors: true, map: texG })); groundM.receiveShadow = true; scene.add(groundM);
    // 森の木
    const pts = [], rr = rng(String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 3));
    for (const t of ter) if (t.k === 'f') { const n = Math.min(160, Math.round(t.r * t.r * 0.07)); for (let i = 0; i < n; i++) { const a = rr() * 7, d = Math.sqrt(rr()) * t.r; pts.push([t.x + Math.cos(a) * d, t.y + Math.sin(a) * d, 0.8 + rr() * 0.6]); } }
    if (pts.length) {
      // 0.65.0 木：杉（三段の円すい）と広葉樹（丸い葉）を混ぜ、葉の色を少しずつ変える
      const o = new T.Object3D(), cc = new T.Color(), pine = [], broad = [];
      pts.forEach((p, i) => ((i * 7 + Math.floor(p[2] * 10)) % 5 < 3 ? pine : broad).push(p));
      const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.26, 2.4, 6).translate(0, 1.2, 0), new T.MeshLambertMaterial({ color: 0x4a3420 }), pts.length);
      const pin1 = new T.InstancedMesh(new T.ConeGeometry(1.8, 3.2, 8).translate(0, 3.2, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const pin2 = new T.InstancedMesh(new T.ConeGeometry(1.35, 2.8, 8).translate(0, 4.6, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const pin3 = new T.InstancedMesh(new T.ConeGeometry(0.85, 2.2, 8).translate(0, 5.9, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const blf = new T.InstancedMesh(new T.IcosahedronGeometry(1.9, 1).scale(1, 0.85, 1).translate(0, 3.6, 0), new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, broad.length));
      const blf2 = new T.InstancedMesh(new T.IcosahedronGeometry(1.3, 1).translate(0.9, 4.4, 0.4), new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, broad.length));
      let ti = 0;
      const place = (x, y, s, rot) => { o.position.set(x, hgt(x, y) - 0.1, y); o.scale.set(s, s * (0.9 + (s * 13 % 0.3)), s); o.rotation.set(0, rot, 0); o.updateMatrix(); };
      pine.forEach(([x, y, s], i) => { place(x, y, s, s * 9); trunk.setMatrixAt(ti++, o.matrix); for (const m of [pin1, pin2, pin3]) { m.setMatrixAt(i, o.matrix); m.setColorAt(i, cc.setHSL(0.3 + (s * 7 % 0.05), 0.42, 0.2 + (s * 11 % 0.06))); } });
      broad.forEach(([x, y, s], i) => { place(x, y, s, s * 9); trunk.setMatrixAt(ti++, o.matrix); for (const m of [blf, blf2]) { m.setMatrixAt(i, o.matrix); m.setColorAt(i, cc.setHSL(0.24 + (s * 5 % 0.06), 0.45, 0.26 + (s * 13 % 0.07))); } });
      pin1.count = pin2.count = pin3.count = pine.length; blf.count = blf2.count = broad.length;
      for (const m of [trunk, pin1, pin2, pin3, blf, blf2]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); trees.push(m); }
    }
    // 0.65.0 草むらと石（戦場の中に散らす。水・曲輪の中には置かない）
    if (!texGrass) texGrass = grassTex();
    const NG = 15000, grass = new T.InstancedMesh((() => { const g1 = new T.PlaneGeometry(0.9, 0.55).translate(0, 0.27, 0), g2 = g1.clone().rotateY(Math.PI / 3), g3 = g1.clone().rotateY(-Math.PI / 3); const pos = [], uv = [], nor = []; for (const g of [g1, g2, g3]) { const ng = g.toNonIndexed(); pos.push(...ng.attributes.position.array); uv.push(...ng.attributes.uv.array); for (let k = 0; k < ng.attributes.position.count; k++) nor.push(0, 1, 0); } const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return bg; })(),
      new T.MeshLambertMaterial({ map: texGrass, alphaTest: 0.45, side: T.DoubleSide }), NG);
    const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(0.45, 0).scale(1, 0.6, 1), new T.MeshLambertMaterial({ color: 0x8a877c, flatShading: true }), 260);
    const o2 = new T.Object3D(), c2 = new T.Color(), rg = rng(String(id).length * 31 + 17);
    let gi = 0, ri = 0;
    for (let tries = 0; tries < NG * 2 && gi < NG; tries++) {
      const x = -30 + rg() * (F.w + 60), y = -30 + rg() * (F.h + 60);
      if (ter.some((t) => water(t, x, y) || (t.k === 'k' && Math.hypot(x - t.x, y - t.y) < t.r))) continue;
      const inF = ter.some((t) => t.k === 'f' && Math.hypot(x - t.x, y - t.y) < t.r);
      const s = 0.7 + rg() * 0.9;
      o2.position.set(x, hgt(x, y) - 0.03, y); o2.rotation.set(0, rg() * 6.28, 0); o2.scale.set(s, s * (0.8 + rg() * 0.6), s); o2.updateMatrix();
      grass.setMatrixAt(gi, o2.matrix); grass.setColorAt(gi, c2.setHSL(0.2 + rg() * 0.07, 0.45, (inF ? 0.22 : 0.3) + rg() * 0.1)); gi++;
      if (ri < 260 && rg() < 0.018) { o2.scale.set(0.5 + rg() * 1.4, 0.5 + rg(), 0.5 + rg() * 1.2); o2.rotation.set(rg(), rg() * 6.28, 0); o2.position.y = hgt(x, y) + 0.05; o2.updateMatrix(); rocks.setMatrixAt(ri++, o2.matrix); }
    }
    grass.count = gi; rocks.count = ri; rocks.castShadow = true; rocks.receiveShadow = true; grass.receiveShadow = false;
    scene.add(grass, rocks); trees.push(grass, rocks);
    last.clear();
  }

  // ---- 1人分を置く ----
  let O, Mx, C;
  const cnt = {};
  function put(name, m, color) { const im = M[name]; const i = cnt[name]++; if (i >= im.instanceMatrix.count) return; im.setMatrixAt(i, m); if (color) im.setColorAt(i, color); }
  // 体の中の一か所（x,y,z）を軸に、前後（Z軸まわり）に a だけ回して置く
  function putPart(name, base, x, y, z, a) { const L = L4.m.makeRotationZ(a); L.setPosition(x, y, z); Mx.multiplyMatrices(base, L); put(name, Mx); }
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
    sky.position.copy(cam3.position); sky.material.uniforms.tm.value = clock; sky.material.uniforms.sunD.value.set(-60, 120, 40);
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
      const stp = mv > 0.6 ? Math.sin(clock * (cav ? 9 : 11) * 0.5 + s.id) : 0; // 0.65.0 足を前後に振る
      if (cav) {
        O.position.set(s.x, gy + bob * 0.5, s.y); O.rotation.set(0, -f, 0); O.scale.set(1, 1, 1); O.updateMatrix();
        put('horse', O.matrix); put('hneck', O.matrix); put('hhead', O.matrix); put('htail', O.matrix); put('saddle', O.matrix, C.setHex(s.side === 'B' ? 0x7a2418 : 0x1f3a66));
        putPart('hlegF', O.matrix, 0.62, 0.82, 0, stp * 0.55); putPart('hlegB', O.matrix, -0.62, 0.82, 0, -stp * 0.55);
      }
      const jh = s.jp > 0 ? Math.sin(Math.PI * (1 - s.jp / 0.55)) * 1.1 : 0; // 0.64.0 ジャンプ
      O.position.set(s.x, gy + ride + bob + jh, s.y); O.rotation.set(0, -f, 0); O.scale.set(sc, sc, sc); O.updateMatrix();
      const bc = C.getHex();
      put('body', O.matrix, C); put('head', O.matrix);
      C.setHex(bc).multiplyScalar(0.55); put('kusa', O.matrix, C); put('sode', O.matrix, C); put('obi', O.matrix);
      if (!cav) { putPart('legL', O.matrix, 0, 0.56, 0.11, stp * 0.6); putPart('legR', O.matrix, 0, 0.56, -0.11, -stp * 0.6); }
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
