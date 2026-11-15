// 0.63.0 自分で戦う：3D表示（three.js）。1.6.65 兵・本人・馬は人型モデル（js/soldier3d.js。t1〜t4の格ごと、Mixamoの動きつき）で描く。0.65.0 見た目の質を上げた（空・雲・草・木・地面の模様・具足・歩く足）。計算は action.js のまま、見た目だけを3Dで描く
// three.js が読めないときや WebGL が使えないときは、これまでの2D表示に戻る
(function () {
  const R = SGK.RENDER, SIM = SGK.SIM, TR = SIM.TROOPS;
  const X = R.act3d = { on: true, ready: false, failed: false };
  try { const v = localStorage.getItem('sgk-act3d'); if (v === '0') X.on = false; } catch (e) { /* 保存できない環境 */ }
  // 0.75.0 ビデオ設定：影（0切・1低・2高）、草の量（0なし・1少なめ・2普通・3多め）
  X.vid = { sh: 2, gr: 2 }; try { Object.assign(X.vid, JSON.parse(localStorage.getItem('sgk-vid') || '{}')); } catch (e) { /* 無視 */ }
  let grassM = null;
  X.setVid = (k, v) => { X.vid[k] = v; try { localStorage.setItem('sgk-vid', JSON.stringify(X.vid)); } catch (e) { /* 無視 */ } X.applyVid(); };
  X.applyVid = () => {
    if (sun) { const sh = X.vid.sh, sz = sh === 1 ? 1024 : 2048; sun.castShadow = sh > 0; if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } }
    if (grassM) grassM.count = Math.floor(grassM.userData.full * [0, 0.2, 0.55, 1][X.vid.gr]);
  };
  X.toggle = () => { X.on = !X.on; try { localStorage.setItem('sgk-act3d', X.on ? '1' : '0'); } catch (e) { /* 無視 */ } if (!X.on && cv) cv.style.display = 'none'; return X.on; };

  let T, rd, scene, cam3, cv, sun, hideT, W = 0, H = 0, clock = 0;
  let built = null, groundG = null, groundM = null, gateM = [], trees = [], ter = [], hills = [], sky = null;
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
    for (const t of ter) if (t.k === 'm') { const d = Math.hypot(x - t.x, y - t.y); if (d < t.r && d > (t.ri || 0) && !SGK.SIM.onBridge(ter, x, y)) h -= 1.4; }
    let wd = 0; for (const t of ter) if (t.k === 'w') { const d = Math.hypot(x - t.x, y - t.y); if (d < t.r + 4) wd = Math.max(wd, 1 - Math.pow(d / (t.r + 4), 2)); } /* 1.6.64 川の底（岸はなだらか） */
    return h - 2.4 * wd; /* 1.6.70 川底を深く */
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
    sun.shadow.bias = -0.0008; X.applyVid(); scene.add(sun); scene.add(sun.target);
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
    // 0.66.0 腕（肩を軸に回す）と武器（手に持つ。色は部分ごとに塗り分け）
    mk('armL', new T.BoxGeometry(0.13, 0.6, 0.14).translate(0, -0.3, 0), white(), CAP.body);
    mk('armR', new T.BoxGeometry(0.13, 0.6, 0.14).translate(0, -0.3, 0), white(), CAP.body);
    const vc = new T.MeshLambertMaterial({ vertexColors: true });
    const spear = (L) => merge([
      [new T.CylinderGeometry(0.03, 0.035, L, 6).rotateZ(-Math.PI / 2).translate(L / 2 - 0.9, 0, 0), 0x4a3420],
      [new T.ConeGeometry(0.06, 0.38, 6).rotateZ(-Math.PI / 2).translate(L - 0.9 + 0.19, 0, 0), 0xd8dde2],
    ]);
    mk('spearS', spear(2.6), vc, CAP.body); mk('spearL', spear(4.4), vc, CAP.body);
    mk('waki', merge([ // 0.81.0 脇差
      [new T.BoxGeometry(0.18, 0.045, 0.045).translate(0.02, 0, 0), 0x2a1c14],
      [new T.CylinderGeometry(0.06, 0.06, 0.02, 10).rotateZ(Math.PI / 2).translate(0.12, 0, 0), 0x3a3020],
      [new T.BoxGeometry(0.55, 0.06, 0.022).translate(0.4, 0, 0), 0xdfe4e8],
    ]), vc, CAP.body);
    { const tk = []; for (let i = 0; i < 7; i++) tk.push([new T.CylinderGeometry(0.05, 0.05, 1.35, 6).translate(0.48, 0.82, -0.42 + i * 0.1), i % 2 ? 0x8a9a4a : 0x9aa858]); tk.push([new T.BoxGeometry(0.03, 0.05, 0.72).translate(0.43, 1.2, -0.12), 0x5a4020], [new T.BoxGeometry(0.03, 0.05, 0.72).translate(0.43, 0.5, -0.12), 0x5a4020]); mk('take', merge(tk), vc, CAP.body); } /* 1.6.40 竹束（体の左前に構える） */
    mk('shuri', merge([ // 0.81.0 手裏剣
      [new T.BoxGeometry(0.22, 0.01, 0.05).translate(0.06, 0, 0), 0x50555a],
      [new T.BoxGeometry(0.05, 0.01, 0.22).translate(0.06, 0, 0), 0x50555a],
    ]), vc, CAP.body);
    mk('sword', merge([
      [new T.BoxGeometry(0.26, 0.05, 0.05).translate(0.02, 0, 0), 0x2a1c14],
      [new T.CylinderGeometry(0.08, 0.08, 0.02, 10).rotateZ(Math.PI / 2).translate(0.16, 0, 0), 0x3a3020],
      [new T.BoxGeometry(0.92, 0.065, 0.025).translate(0.63, 0, 0), 0xdfe4e8],
    ]), vc, CAP.body);
    const bc = Math.cos(0.4 * Math.PI) * 0.85 - 0.85;
    mk('bow', merge([
      [new T.TorusGeometry(0.85, 0.025, 4, 16, Math.PI * 0.8).rotateZ(-Math.PI * 0.4).translate(-0.85, 0, 0), 0x5a3a1c],
      [new T.BoxGeometry(0.01, Math.sin(0.4 * Math.PI) * 1.7, 0.01).translate(bc, 0, 0), 0xe8e0c8],
    ]), vc, CAP.body);
    mk('gun', merge([
      [new T.BoxGeometry(1.25, 0.065, 0.065).translate(0.4, 0, 0), 0x2b2420],
      [new T.BoxGeometry(0.45, 0.13, 0.08).translate(-0.38, -0.02, 0), 0x5a3a1c],
    ]), vc, CAP.body);
    mk('flash', new T.SphereGeometry(0.16, 6, 4), new T.MeshBasicMaterial({ color: 0xffe080 }), 80, false);
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
    // 1.6.36 格（tier）ごとの見た目：農兵は鉢巻・旗なし、組頭・頭・母衣衆は兜と前立て（母衣衆は背中に母衣）
    mk('kabutoS', new T.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.36, 0), lam({ color: 0xffffff }), CAP.body);
    mk('fuki', new T.CylinderGeometry(0.23, 0.32, 0.14, 12, 1, true).translate(0, 1.3, 0), new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), CAP.body, false);
    mk('mae', new T.TorusGeometry(0.17, 0.03, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(0.12, 1.62, 0), new T.MeshLambertMaterial({ color: 0xf0c230, emissive: 0x5a4200 }), CAP.body, false);
    mk('hachi', new T.TorusGeometry(0.19, 0.035, 4, 12).rotateX(Math.PI / 2).translate(0, 1.4, 0), lam({ color: 0xffffff }), CAP.body, false);
    mk('horoB', new T.SphereGeometry(0.5, 12, 8).scale(0.8, 1, 1).translate(-0.62, 1.45, 0), lam({ color: 0xffffff }), CAP.body);
    mk('dosh', new T.CylinderGeometry(0.255, 0.255, 0.5, 10).translate(0, 0.9, 0), lam({ color: 0xffffff }), CAP.body);
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
    if (SGK.SOLD3D) SGK.SOLD3D.load(T, scene, CAP.body); // 1.6.65 兵の人型モデル
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
  const water = (t, x, y) => { const d = Math.hypot(x - t.x, y - t.y); return (t.k === 'm' && d < t.r && d > (t.ri || 0) && !SGK.SIM.onBridge(ter, x, y)) || (!['f', 'h', 'm', 'k', 's', 'e'].includes(t.k) && d < t.r); };

  // いくつかの形を1つにまとめる（部分ごとに色を付ける）
  function merge(list) {
    const pos = [], nor = [], col = [], c = new T.Color();
    for (const [g, hex] of list) { const ng = g.index ? g.toNonIndexed() : g; c.setHex(hex); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); for (let k = 0; k < ng.attributes.position.count; k++) col.push(c.r, c.g, c.b); }
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return bg;
  }

  // 1.6.64 地図に合わせた景色：遠くの山（その方角に山地があるとき）・海・川や堀の水面。見た目だけ
  function backdrop(id, F) {
    const E = ter.find((t) => t.k === 'e') || {}, cx = F.w / 2, cy = F.h / 2, r = rng(String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 41));
    const add = (m) => { scene.add(m); trees.push(m); return m; };
    if (ter.some((t) => t.k === 'w' || t.k === 'm')) { const wm = add(new T.Mesh(new T.PlaneGeometry(F.w + 80, F.h + 80).rotateX(-Math.PI / 2).translate(cx, -0.45, cy), new T.MeshPhongMaterial({ color: 0x2f86d0, specular: 0xd0e8ff, shininess: 90, transparent: true, opacity: 0.72 }))); wm.receiveShadow = true; }
    if (E.sea != null) { const sm = add(new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new T.MeshPhongMaterial({ color: 0x35627e, specular: 0xa8c0d0, shininess: 60 }))); sm.position.set(cx + Math.cos(E.sea) * 2400, -0.2, cy + Math.sin(E.sea) * 2400); }
    let list = (E.mtn || []).slice(); if (!list.length) for (let i = 0; i < 5; i++) list.push([r() * 6.28, 20, 1]); /* 山が近くにないときは遠くの低い丘並み */
    const hz = new T.Color(0xcfdde6), base = new T.Color(0x4c5e44), pos = [], col = [], c = new T.Color();
    for (const [a, dk, low] of list) for (let k = 0; k < 3; k++) {
      const aa = a + (r() - 0.5) * 0.45, D = 560 + dk * 32 + r() * 60, H = (low ? 35 + r() * 30 : 110 + r() * 150) * (1 - dk / 60), R = H * (1.6 + r() * 1.2);
      const g = new T.ConeGeometry(R, H, 28, 6).toNonIndexed(), P = g.attributes.position, sd = r() * 100;
      for (let i = 0; i < P.count; i++) { const vx = P.getX(i), vy = P.getY(i) + H / 2, vz = P.getZ(i), an = Math.atan2(vz, vx), f = 1 + 0.22 * Math.sin(an * 5 + sd) + 0.12 * Math.sin(an * 11 + sd * 2) + 0.1 * Math.sin(vy * 0.08 + an * 3);
        const top = vy >= H - 0.01 ? 1 : f; P.setXYZ(i, vx * top, Math.max(0, vy * (0.85 + 0.15 * f)), vz * top); }
      g.computeVertexNormals(); g.translate(cx + Math.cos(aa) * D, -2, cy + Math.sin(aa) * D);
      pos.push(...P.array); const n = g.attributes.normal; c.copy(base).lerp(hz, Math.min(0.85, 0.35 + dk / 45));
      for (let i = 0; i < P.count; i++) { const l = 0.7 + 0.45 * Math.max(0, n.getX(i) * -0.4 + n.getY(i) * 0.75 + n.getZ(i) * 0.25), sn = P.getY(i) > 190 ? 0.5 : 0; col.push(Math.min(1, c.r * l + sn), Math.min(1, c.g * l + sn), Math.min(1, c.b * l + sn)); }
    }
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const mm = add(new T.Mesh(bg, new T.MeshBasicMaterial({ vertexColors: true, fog: false }))); mm.frustumCulled = false; mm.renderOrder = 0;
  }

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
        else if (t.k === 'm' && d < t.r && d > (t.ri || 0)) c.setHex(SGK.SIM.onBridge(ter, x, y) ? 0x9a8660 : 0x2f78bf);
        else if (t.k === 'k' && d < t.r) c.setHex(0xb9a57c);
        else if (t.k === 's' && d < t.r && d > (t.ri || 0)) c.lerp(new T.Color(0x8b7d55), 0.5);
        else if (t.k === 'w' && d < t.r + 3) c.lerp(new T.Color(d < t.r ? 0x2c5f8a : 0x8a7a52), 0.85); /* 1.6.64 川底と岸（1.6.70 川底を青に） */
        else if (!['f', 'h', 'm', 'k', 's', 'e', 'w'].includes(t.k) && d < t.r) c.setHex(0x2f78bf);
      }
      if (x < 0 || y < 0 || x > F.w || y > F.h) c.multiplyScalar(0.85);
      const n = (0.95 + r() * 0.08) * (0.94 + 0.08 * Math.sin(x * 0.045 + 2) * Math.sin(y * 0.05)); col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n; // 0.65.0 広いまだら模様（0.68.1 色を入れる文がコメントの中に入って地面が黒くなっていたのを直した）
    }
    groundG.setAttribute('color', new T.BufferAttribute(col, 3)); groundG.computeVertexNormals();
    if (!texG) { texG = groundTex(); texG.repeat.set((F.w + 80) / 7, (F.h + 80) / 7); }
    groundM = new T.Mesh(groundG, new T.MeshLambertMaterial({ vertexColors: true, map: texG })); groundM.receiveShadow = true; scene.add(groundM);
    backdrop(id, F);
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
    const NG = 27000, grass = new T.InstancedMesh((() => { const g1 = new T.PlaneGeometry(0.9, 0.55).translate(0, 0.27, 0), g2 = g1.clone().rotateY(Math.PI / 3), g3 = g1.clone().rotateY(-Math.PI / 3); const pos = [], uv = [], nor = []; for (const g of [g1, g2, g3]) { const ng = g.toNonIndexed(); pos.push(...ng.attributes.position.array); uv.push(...ng.attributes.uv.array); for (let k = 0; k < ng.attributes.position.count; k++) nor.push(0, 1, 0); } const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return bg; })(),
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
    grassM = grass; grass.userData.full = gi; X.applyVid(); rocks.count = ri; rocks.castShadow = true; rocks.receiveShadow = true; grass.receiveShadow = false;
    scene.add(grass, rocks); trees.push(grass, rocks);
    // 1.6.25 攻城戦：塀（当たり判定と同じ形。門＝切れ目・枡形・仕切り）と、本丸の真ん中に天守
    const CWs = SGK.SIM.castleWalls ? SGK.SIM.castleWalls(ter) || [] : [], segs = [];
    for (const c of CWs) {
      for (const q of c.rings) { if (q.moat) continue; const n = Math.max(8, Math.round(q.r * 2 * Math.PI / 4)), sl = q.r * 2 * Math.PI / n; for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; if (SGK.SIM.wallInGap(q, a, -sl / 2)) continue; segs.push([c.x + Math.cos(a) * q.r, c.y + Math.sin(a) * q.r, -a + Math.PI / 2, sl]); } }
      for (const w of c.rad) { const n = Math.max(1, Math.round((w.r1 - w.r0) / 4)), sl = (w.r1 - w.r0) / n; for (let i = 0; i < n; i++) { const d = w.r0 + (i + 0.5) * sl; segs.push([c.x + Math.cos(w.a) * d, c.y + Math.sin(w.a) * d, -w.a, sl]); } }
    }
    if (segs.length) {
      /* 1.6.38 石垣を高く（2m）＋土塀1.8m＋瓦。塀には狭間（四角い窓）を並べる */
      const N = segs.length, stone = new T.InstancedMesh(new T.BoxGeometry(1, 2.0, 1.6), new T.MeshLambertMaterial({ color: 0x7d786c }), N);
      const wallM = new T.InstancedMesh(new T.BoxGeometry(1, 1.8, 0.5), new T.MeshLambertMaterial({ color: 0xece6d6 }), N);
      const roofM = new T.InstancedMesh(new T.BoxGeometry(1, 0.22, 1.0), new T.MeshLambertMaterial({ color: 0x3a3f46 }), N);
      const winM = new T.InstancedMesh(new T.BoxGeometry(0.32, 0.32, 0.56), new T.MeshLambertMaterial({ color: 0x1c1712 }), N * 2);
      const o3 = new T.Object3D();
      segs.forEach(([x, y, r, l], k) => {
        const g = hgt(x, y); o3.rotation.set(0, r, 0); o3.scale.set(l * 1.02, 1, 1);
        o3.position.set(x, g + 0.9, y); o3.updateMatrix(); stone.setMatrixAt(k, o3.matrix);
        o3.position.set(x, g + 2.8, y); o3.updateMatrix(); wallM.setMatrixAt(k, o3.matrix);
        o3.position.set(x, g + 3.78, y); o3.updateMatrix(); roofM.setMatrixAt(k, o3.matrix);
        o3.scale.set(1, 1, 1); for (const j of [-0.25, 0.25]) { o3.position.set(x + Math.cos(r) * l * j, g + 2.75 + (j > 0 ? 0 : 0.3), y - Math.sin(r) * l * j); o3.updateMatrix(); winM.setMatrixAt(k * 2 + (j > 0 ? 1 : 0), o3.matrix); }
      });
      for (const m of [stone, wallM, roofM, winM]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); trees.push(m); }
    }
    /* 1.6.38 門：櫓門（門の上に櫓）と扉。扉は破られたら消える。外の塀の角には隅櫓 */
    gateM = [];
    const mat = (c) => new T.MeshLambertMaterial({ color: c }), addM = (m) => { m.castShadow = m.receiveShadow = true; scene.add(m); trees.push(m); return m; };
    for (const gp of SGK.SIM.gatePts ? SGK.SIM.gatePts(CWs) : []) {
      const g = hgt(gp.x, gp.y), ry = -gp.a, wd = gp.w + 1.2;
      const tw = addM(new T.Mesh(new T.BoxGeometry(2.2, 2.4, wd + 2.4), mat(0xece6d6))); tw.position.set(gp.x, g + 4.7, gp.y); tw.rotation.y = ry;
      const rf = addM(new T.Mesh(new T.BoxGeometry(3.2, 0.5, wd + 3.4), mat(0x3a3f46))); rf.position.set(gp.x, g + 6.1, gp.y); rf.rotation.y = ry;
      for (const sd of [-1, 1]) { const pl = addM(new T.Mesh(new T.BoxGeometry(1.4, 3.6, 1.0), mat(0x7d786c))); pl.position.set(gp.x - Math.sin(gp.a) * sd * (gp.w / 2 + 0.6), g + 1.8, gp.y + Math.cos(gp.a) * sd * (gp.w / 2 + 0.6)); pl.rotation.y = ry; }
      const dr = addM(new T.Mesh(new T.BoxGeometry(0.4, 3.5, gp.w), mat(0x4a3424))); dr.position.set(gp.x, g + 1.75, gp.y); dr.rotation.y = ry; dr.userData.gid = gp.id; gateM.push(dr);
    }
    for (const c of CWs) if (c.main && c.aF != null) {
      for (const da of [-0.75, 1.05, Math.PI - 0.6, Math.PI + 0.6]) {
        const a = c.aF + da, x = c.x + Math.cos(a) * (c.R - 2.5), y = c.y + Math.sin(a) * (c.R - 2.5), g = hgt(x, y);
        const bs = addM(new T.Mesh(new T.BoxGeometry(6, 2.2, 6), mat(0x7d786c))); bs.position.set(x, g + 1.1, y);
        const bd = addM(new T.Mesh(new T.BoxGeometry(4.6, 3.4, 4.6), mat(0xece6d6))); bd.position.set(x, g + 3.9, y);
        const rf = addM(new T.Mesh(new T.ConeGeometry(4.2, 1.6, 4).rotateY(Math.PI / 4), mat(0x3a3f46))); rf.position.set(x, g + 6.4, y);
      }
    }
    for (const c of CWs) if (c.main) {
      const tx = c.x, ty = c.y, g0 = hgt(tx, ty);
      const lv = [[12, 4, 0xece6d6], [9.5, 3.5, 0xece6d6], [7, 3.2, 0xece6d6]]; let yy = g0;
      const base = new T.Mesh(new T.BoxGeometry(15, 3, 15), new T.MeshLambertMaterial({ color: 0x7d786c })); base.position.set(tx, yy + 1.5, ty); yy += 3;
      base.castShadow = base.receiveShadow = true; scene.add(base); trees.push(base);
      for (const [w2, h2, col] of lv) {
        const body = new T.Mesh(new T.BoxGeometry(w2, h2, w2), new T.MeshLambertMaterial({ color: col })); body.position.set(tx, yy + h2 / 2, ty);
        const roof = new T.Mesh(new T.ConeGeometry(w2 * 0.86, 1.8, 4).rotateY(Math.PI / 4), new T.MeshLambertMaterial({ color: 0x3a3f46 })); roof.position.set(tx, yy + h2 + 0.6, ty);
        for (const m of [body, roof]) { m.castShadow = m.receiveShadow = true; scene.add(m); trees.push(m); }
        yy += h2 + 0.6;
      }
    }
    last.clear();
  }

  // ---- 1人分を置く ----
  let O, Mx, Mu, C, C2;
  const cnt = {};
  function put(name, m, color) { const im = M[name]; const i = cnt[name]++; if (i >= im.instanceMatrix.count) return; im.setMatrixAt(i, m); if (color) im.setColorAt(i, color); }
  // 体の中の一か所（x,y,z）を軸に、前後（Z軸まわり）に a だけ回して置く
  function putPart(name, base, x, y, z, a, col) { const L = L4.m.makeRotationZ(a); L.setPosition(x, y, z); Mx.multiplyMatrices(base, L); put(name, Mx, col); }
  // 0.66.0 構え・攻撃の姿勢。aR/aL＝右腕/左腕を前へ上げる角度（0で下ろす）、tilt＝武器の傾き、lean＝前かがみ、tw＝上半身のひねり
  const ease = (x) => x * x * (3 - 2 * x), lerp = (a, b, k) => a + (b - a) * k;
  function pose(s, wk, stp, now) {
    if (wk === 'waki' || wk === 'shuri') wk = 'sword'; // 0.81.0 脇差・手裏剣は刀と同じ構え
    const P = { aR: 0.35, aL: 0.25, tilt: 0.3, lean: 0, tw: 0, fl: false };
    const sw = stp * 0.45; // 歩くときの腕の振り
    const at = s.at ? (now - s.at) / (wk === 'gun' || wk === 'bow' ? 0.5 : 0.4) : 9;
    if (wk === 'sword') { P.aR = 0.55 - sw * 0.5; P.aL = 0.25 + sw; P.tilt = 1.0; }
    else if (wk === 'spearS' || wk === 'spearL') { P.aR = 0.75; P.aL = 0.95; P.tilt = 0.22 + sw * 0.1; }
    else if (wk === 'bow') { P.aL = 0.7; P.aR = 0.35 - sw * 0.5; P.tilt = 0.5; }
    else if (wk === 'gun') { P.aR = 0.9; P.aL = 1.1; P.tilt = 0.55; }
    if (s.hero && s.blk) { P.aR = 1.3; P.aL = 1.2; P.tilt = 1.5; return P; }
    if (s.hero && s.hold && !s.sw) { /* 1.6.41 構え：槍は引いて構える、弓は引きしぼる */
      if (wk === 'spearS' || wk === 'spearL') { P.aR = 0.45; P.aL = 0.7; P.tilt = 0.25; P.lean = -0.1; return P; }
      if (wk === 'bow') { P.aL = 1.55; P.aR = 1.5; P.tilt = 0; P.tw = 0.25; return P; }
    }
    if (s.hero && s.sw && (wk === 'spearS' || wk === 'spearL')) { /* 1.6.41 槍は突き出す */
      const k = 1 - Math.max(0, s.sw.t) / (s.sw.d || 0.18), e = k < 0.4 ? ease(k / 0.4) : 1 - (k - 0.4) / 0.6;
      P.aR = 0.45 + e * 1.1; P.aL = 0.7 + e * 0.85; P.tilt = 0.25 - e * 0.15; P.lean = -0.1 + e * 0.38; return P;
    }
    if (s.hero && s.sw) { // 本人の振り：横に払う（上半身ごとひねる）
      const k = 1 - Math.max(0, s.sw.t) / (s.sw.d || 0.18), a = s.sw.a + s.sw.arc * (1 - 2 * k);
      P.tw = -(a - (s.f || 0)); P.aR = 1.45; P.aL = 0.5; P.tilt = wk === 'bow' || wk === 'gun' ? 0.2 : 0; P.lean = 0.12; return P;
    }
    if (at < 1) {
      if (wk === 'sword') { // 振りかぶって、振り下ろす
        if (at < 0.35) { const k = ease(at / 0.35); P.aR = lerp(P.aR, 2.7, k); P.tilt = lerp(1.0, 2.4, k); P.aL = lerp(P.aL, 2.4, k); P.lean = -0.08 * k; }
        else { const k = ease(Math.min(1, (at - 0.35) / 0.3)); P.aR = lerp(2.7, 0.9, k); P.tilt = lerp(2.4, -0.3, k); P.aL = lerp(2.4, 0.8, k); P.lean = lerp(-0.08, 0.25, k); }
      } else if (wk === 'spearS' || wk === 'spearL') { // 突く
        const k = at < 0.3 ? -ease(at / 0.3) * 0.4 : ease(Math.min(1, (at - 0.3) / 0.25)) * (1 - Math.max(0, at - 0.7) / 0.3);
        P.aR = 0.75 + k * 0.8; P.aL = 0.95 + k * 0.6; P.tilt = 0.2 - k * 0.1; P.lean = k * 0.25;
      } else if (wk === 'bow') { // 引いて放つ
        const k = ease(Math.min(1, at / 0.5)); P.aL = lerp(0.7, 1.55, Math.min(1, at * 3)); P.tilt = lerp(0.5, 0, Math.min(1, at * 3)); P.aR = 1.5; P.tw = 0.25 * (1 - k);
      } else if (wk === 'gun') { // 撃つ（はねかえり）
        P.aR = 1.45; P.aL = 1.5; P.tilt = at < 0.15 ? 0.3 * (at / 0.15) : 0.3 * (1 - (at - 0.15) / 0.85); P.fl = at < 0.12;
      }
    }
    return P;
  }
  function weaponOf(s) {
    if (s.hero) { const n = s.wep && s.wep.name; return n === '槍' ? 'spearL' : n === '弓' ? 'bow' : n === '鉄砲' ? 'gun' : n === '脇差' ? 'waki' : n === '手裏剣' ? 'shuri' : 'sword'; }
    const t = s.type; if (!t || s.kat) return 'sword'; // 0.73.8 近づかれた弓・鉄砲は刀
    if (t === 'take' || t === 'shiyori' || t === 'takegashira') return 'waki';
    if (t === 'yumi' || t === 'tsuyoyumi' || t === 'yumigashira' || t === 'banditBow') return 'bow'; /* 1.6.67 野盗の弓 */ if (t === 'teppo' || t === 'teppogashira') return 'gun';
    if (t === 'nagayari' || t === 'yarigashira') return 'spearL'; if (t === 'bandit') return 'sword';
    return 'spearS';
  }

  // ---- 1.6.65 兵の人型モデル（t1〜t4・馬・武器。js/soldier3d.js でまとめて描く）----
  // 近くの兵はモデル、遠く（LOD m より先）はこれまでの簡単な形。読み込めないときもこれまでの形
  const LOD2 = 180 * 180, DEADN = 120;
  let SK90 = null, Mh = null, Mw = null, Ms = null, Mc = null, Mcw = null;
  function wepName(wk, tr) {
    if (wk === 'spearS') return tr <= 1 ? 'takeyari' : 'yari';
    if (wk === 'spearL') return tr >= 4 ? 'yari_t4' : 'yari';
    if (wk === 'bow') return tr >= 4 ? 'yumi_t4' : 'yumi';
    if (wk === 'gun') return tr >= 4 ? 'teppo_t4' : 'teppo';
    if (wk === 'sword' || wk === 'waki') return 'katana';
    return null;
  }
  // どの動きの何秒目か。攻撃は「当たる瞬間」の前後を、攻撃の長さ（0.4〜0.5秒）に縮めて使う
  function skClip(s, wk, mv, nowS, ph) {
    const S3 = SGK.SOLD3D, atk = wk === 'spearS' || wk === 'spearL' ? 'spear' : wk === 'bow' ? 'bow' : wk === 'gun' ? 'gun' : 'sword';
    const W = S3.win[atk] || { a: 0, b: 1, pk: 0.5 };
    // 1.6.65 動きながらの攻撃は、足は歩く・走る（low）、上半身だけ攻撃の動き
    const low = mv >= 0.4 ? { nm: mv < 3.6 ? 'walk' : 'run', t: ph, loop: true } : null;
    const hit = (k) => ({ nm: atk, t: W.a + (W.b - W.a) * Math.min(1, Math.max(0, k)), loop: false, atk: true, low });
    if (s.hero && s.sw) return hit(1 - Math.max(0, s.sw.t) / (s.sw.d || 0.18));
    if (s.hero && s.hold && (atk === 'bow' || atk === 'spear')) return { nm: atk, t: atk === 'bow' ? W.pk : W.a, loop: false, atk: true, low };
    const a = s.at ? (nowS - s.at) / (wk === 'gun' || wk === 'bow' ? 0.5 : 0.4) : 9;
    if (a >= 0 && a < 1) return atk === 'gun' ? { nm: 'gun', t: ph, loop: true, atk: true, low } : hit(a);
    if (mv < 0.4) return { nm: wk === 'gun' ? 'gun' : 'idle', t: ph, loop: true }; // 鉄砲は止まるとしゃがんで構える
    return low;
  }
  function drawSk(s, u, cav, mv, nowS, gy, f, own, col, ph) {
    const S3 = SGK.SOLD3D, tr = Math.min(4, Math.max(1, s.hero ? 4 : (s.type && TR[s.type] && TR[s.type].tier) || 2)), b = S3.tiers[tr - 1];
    const wk = weaponOf(s), sc = s.hero ? 1.1 : 1;
    const jh = s.jp > 0 ? Math.sin(Math.PI * (1 - s.jp / 0.55)) * 1.1 : 0;
    O.position.set(s.x, gy + jh, s.y); O.rotation.set(0, -f, 0); O.scale.set(1, 1, 1); O.updateMatrix();
    let c, up = 0;
    if (cav) { // 馬に乗る：馬の背に座った姿勢で
      const hb = S3.horses[s.hero || s.type === 'horo' ? 'white' : 'brown'];
      Mx.copy(O.matrix).multiply(SK90).multiply(Ms.makeScale(S3.hk, S3.hk, S3.hk));
      S3.put(hb, Mx, S3.rowAt(hb, mv < 0.6 ? 'idle' : mv < 6 ? 'walk' : 'gallop', ph, true), 0);
      up = S3.seat - b.hipSit * sc;
      const ride = { nm: 'ride', t: 0, loop: false }, ca = skClip(s, wk, mv, nowS, ph);
      c = ca.atk ? Object.assign({}, ca, { low: ride }) : ride; // 馬の上でも上半身は攻撃する
    } else c = skClip(s, wk, mv, nowS, ph);
    Mu.copy(O.matrix); Mu.elements[13] += up; // 体の位置（前が +X）。指物などはこれに付ける
    Mx.copy(Mu).multiply(SK90); if (sc !== 1) Mx.multiply(Ms.makeScale(sc, sc, sc));
    const row = S3.rowAt(b, c.nm, c.t, c.loop), rowL = c.low ? S3.rowAt(b, c.low.nm, c.low.t, c.low.loop) : row;
    if (c.low) S3.combo(b, rowL, row, Mc, Mcw);
    S3.put(b, Mx, rowL, s.fl ? 0.22 * Math.min(1, s.fl / 0.15) : 0, c.low ? row : null, c.low ? Mc : null); // 1.6.68 打たれた光りを控えめに（0.6→0.22）
    // 武器を手に持たせる（弓は左手）
    const wn = wepName(wk, tr), kind = wk === 'spearS' || wk === 'spearL' ? 'spear' : wk === 'bow' || wk === 'gun' ? wk : 'sword';
    if (wn || wk === 'shuri') {
      Mw.multiplyMatrices(Mx, S3.weapon(b, row, kind, c.nm, Mh, c.low ? Mcw : null));
      if (wk === 'waki') Mw.multiply(Ms.makeScale(0.7, 0.7, 0.7));
      if (wn) S3.putW(wn, Mw); else put('shuri', Mw);
      if (wk === 'gun' && s.at && nowS - s.at < 0.06) { Mw.multiply(Ms.makeTranslation(0, 1.0, 0)); put('flash', Mw); }
    }
    // 指物（陣営の色。どの格にも付ける）・竹束・母衣
    const flagC = s.pc ? col : s.side === 'B' ? 0xc8402f : own ? 0xf2f2f2 : 0x6fa7d8;
    if (u && u.order === 'rout') C.setHex(flagC).lerp(C2.setHex(0xffffff), 0.5); else C.setHex(flagC);
    Mu.multiply(Ms.makeScale(sc, sc, sc)).multiply(Ms.makeTranslation(-0.05, 0.12, 0));
    put('flag', Mu, C); put('pole', Mu);
    if (s.type === 'take' || s.type === 'shiyori' || s.type === 'takegashira' || s.tate) put('take', Mu);
    if (s.type === 'horo') put('horoB', Mu, C);
  }

  const COL = { A: 0x2f5a96, Aown: 0x3a6ea5, Aally: 0x5d9ab8, B: 0xa8352a };
  X.draw = function (b, myPid, sel, dt, terList, cam, w, h) {
    if (!X.on || X.failed) return false;
    if (!X.ready && !init()) return false;
    clock += dt;
    if (w !== W || h !== H) { W = w; H = h; rd.setSize(W, H, false); cam3.aspect = W / Math.max(1, H); cam3.updateProjectionMatrix(); }
    if (built !== b.id) build(b.id, terList);
    { const gt = b.act && b.act.gt; for (const d of gateM) d.visible = !gt || gt[d.userData.gid] > 0; } /* 1.6.38 破れた門の扉は消す */
    cv.style.display = 'block'; clearTimeout(hideT); hideT = setTimeout(() => { cv.style.display = 'none'; }, 250);
    if (!O) { O = new T.Object3D(); O.rotation.order = 'YXZ'; Mx = new T.Matrix4(); Mu = new T.Matrix4(); C = new T.Color(); C2 = new T.Color(); SK90 = new T.Matrix4().makeRotationY(Math.PI / 2); Mh = new T.Matrix4(); Mw = new T.Matrix4(); Ms = new T.Matrix4(); Mc = new T.Matrix4(); Mcw = new T.Matrix4(); }
    const nowS = performance.now() / 1000;
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
    const S3 = SGK.SOLD3D, skOn = !!(S3 && S3.ready); if (skOn) S3.begin();
    const A = b.act, live = (s) => s.hp > 0 && !s.gone;
    const mats = {};
    for (const s of A.s) {
      if (!live(s)) continue;
      const u = A.byG[s.g], own = u && u.owner === myPid, cav = (s.type && TR[s.type] && TR[s.type].cav) || (s.hero && u && !u.owner && !u.cmd) || !!s.rd; // 0.73.8 CPUの武将は馬に乗る
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
      // 1.6.65 近くは人型モデル（カメラの後ろは描かない）、遠くはこれまでの形
      const ex = s.x - px, ez = s.y - pz;
      if (skOn && ex * ex + ez * ez < LOD2) {
        // 1.6.68 速さはならして使う（押し合いの小さな動きで、待機と歩くが毎コマ入れ替わってチラついていた）。止まる・歩き出すの境目にも幅を持たせる
        const pp = last.get(s.id); let ms = mv;
        if (pp) { pp[3] = pp[3] == null ? mv : pp[3] + (mv - pp[3]) * Math.min(1, dt * 3); pp[4] = pp[4] ? pp[3] > 0.35 : pp[3] > 0.9; ms = pp[4] ? Math.max(0.5, pp[3]) : 0; }
        const rate = ms < 0.4 ? 1 : ms < 3.6 ? Math.min(1.8, Math.max(0.6, ms / 1.5)) : Math.min(1.5, Math.max(0.7, ms / 5));
        if (pp) pp[2] = (pp[2] || s.id * 0.37) + dt * rate;
        if (ex * dx + ez * dz > -4) drawSk(s, u, cav, ms, nowS, gy, f, own, col, pp ? pp[2] : s.id * 0.37);
      } else {
      if (cav) {
        O.position.set(s.x, gy + bob * 0.5, s.y); O.rotation.set(0, -f, 0); O.scale.set(1, 1, 1); O.updateMatrix();
        put('horse', O.matrix); put('hneck', O.matrix); put('hhead', O.matrix); put('htail', O.matrix); put('saddle', O.matrix, C.setHex(s.side === 'B' ? 0x7a2418 : 0x1f3a66));
        putPart('hlegF', O.matrix, 0.62, 0.82, 0, stp * 0.55); putPart('hlegB', O.matrix, -0.62, 0.82, 0, -stp * 0.55);
      }
      const jh = s.jp > 0 ? Math.sin(Math.PI * (1 - s.jp / 0.55)) * 1.1 : 0; // 0.64.0 ジャンプ
      O.position.set(s.x, gy + ride + bob + jh, s.y); O.rotation.set(0, -f, 0); O.scale.set(sc, sc, sc); O.updateMatrix();
      const tr = s.hero ? 5 : (s.type && TR[s.type] && TR[s.type].tier) || 2; /* 1.6.36 格ごとの見た目 */
      if (!C2) C2 = new T.Color();
      if (tr <= 2 && !s.fl) C.lerp(C2.setHex(0x7a6a4a), tr === 1 ? 0.7 : 0.35); // 農兵・足軽は色あせた野良着
      const bc = C.getHex();
      if (tr >= 2) { C.setHex(bc).multiplyScalar(0.55); put('kusa', O.matrix, C); }
      if (tr >= 3) put('obi', O.matrix); else put('obi', O.matrix, C.setHex(0x5a4a32));
      if (!cav) { putPart('legL', O.matrix, 0, 0.56, 0.11, stp * 0.6); putPart('legR', O.matrix, 0, 0.56, -0.11, -stp * 0.6); }
      // 0.66.0 上半身（前かがみ・ひねり）を作り、そこに頭・旗・腕・武器を付ける
      const wk = weaponOf(s), ps = pose(s, wk, stp, nowS);
      Mu.copy(O.matrix);
      if (ps.lean || ps.tw) { L4.m.makeTranslation(0, 0.6, 0); Mu.multiply(L4.m); if (ps.tw) Mu.multiply(L4.m.makeRotationY(ps.tw)); if (ps.lean) Mu.multiply(L4.m.makeRotationZ(-ps.lean)); Mu.multiply(L4.m.makeTranslation(0, -0.6, 0)); }
      put('body', Mu, C.setHex(bc)); put('head', Mu);
      if (tr >= 4) put('dosh', Mu, C.setHex(bc).multiplyScalar(0.75)); // 組頭から上は胴丸
      if (tr >= 3) { C.setHex(bc).multiplyScalar(0.55); put('sode', Mu, C); }
      const hatC = s.side === 'B' ? 0x3a1a14 : 0x1c2230, flagC = s.side === 'B' ? 0xc8402f : own ? 0xf2f2f2 : 0x6fa7d8;
      if (tr === 1) put('hachi', Mu, C.setHex(0xe8e0cc)); // 農兵：鉢巻だけ
      else if (tr <= 3) put('hat', Mu, C.setHex(hatC)); // 足軽：陣笠
      else { put('kabutoS', Mu, C.setHex(s.hero ? 0x1a1a1a : 0x2a2622)); put('fuki', Mu, C.setHex(bc).multiplyScalar(0.5)); if (!s.hero) put('mae', Mu); } // 兜と吹返し
      if (tr >= 2) { put('flag', Mu, C.setHex(flagC)); put('pole', Mu); }
      if (s.type === 'take' || s.type === 'shiyori' || s.type === 'takegashira') put('take', Mu); /* 1.6.40 */
      if (s.type === 'horo') put('horoB', Mu, C.setHex(flagC)); // 母衣衆：背中の母衣
      if (s.hero) put('crest', Mu);
      C.setHex(bc).multiplyScalar(0.7);
      putPart('armR', Mu, 0.02, 1.12, 0.33, ps.aR, C); putPart('armL', Mu, 0.02, 1.12, -0.33, ps.aL, C);
      // 武器：持つ手の先に、体に対して ps.tilt の傾きで
      const left = wk === 'bow', aa = left ? ps.aL : ps.aR;
      L4.m.makeRotationZ(aa); L4.m.setPosition(0.02, 1.12, left ? -0.33 : 0.33); Mx.multiplyMatrices(Mu, L4.m);
      Mx.multiply(L4.m.makeTranslation(0, -0.58, 0)); Mx.multiply(L4.m.makeRotationZ(ps.tilt - aa));
      if (wk === 'spearS' || wk === 'spearL' || wk === 'gun') Mx.multiply(L4.m.makeTranslation(0, 0, -0.14)); // 両手で持つので少し体の中ほどへ
      put(wk, Mx);
      if (ps.fl) { Mx.multiply(L4.m.makeTranslation(1.1, 0, 0)); put('flash', Mx); }
      }
      // 足もとの輪：自分の本人・選んだ隊
      const isSel = own && !s.hero && u && (u.id === sel || sel === 'all');
      if (s.pc === myPid || isSel) { O.position.set(s.x, gy, s.y); O.rotation.set(0, 0, 0); O.scale.set(s.hero ? 1.6 : 1, 1, s.hero ? 1.6 : 1); O.updateMatrix(); put('ring', O.matrix, C.setHex(s.pc === myPid ? 0xffe060 : 0xfff2a0)); }
      // 本人の体力（画面に重ねる）は 2D の側で描く
    }
    // 倒れた者
    let di = 0;
    const d0 = A.dead.length - DEADN; // 1.6.65 新しく倒れた者（近く）は人型モデルが倒れた姿で
    for (const p of A.dead) {
      O.position.set(p.x, hgt(p.x, p.y), p.y); O.rotation.set(0, (di * 2.39) % 6.28, 0); O.scale.set(1, 1, 1); O.updateMatrix();
      const ex = p.x - px, ez = p.y - pz;
      if (skOn && di >= d0 && ex * ex + ez * ez < LOD2) { const tb = S3.tiers[di % 3]; Mx.copy(O.matrix).multiply(SK90); S3.put(tb, Mx, S3.rowAt(tb, 'die', 99, false), 0); }
      else put('dead', O.matrix, C.setHex(p.side === 'A' ? 0x34405e : 0x6a2a20));
      di++;
    }
    // 飛び道具
    for (const p of A.pr) {
      const a = Math.atan2(p.vy, p.vx); O.position.set(p.x, hgt(p.x, p.y) + 1.3 + (p.h || 0), p.y); // 0.75.3 弓は山なり O.rotation.set(0, -a, 0); O.scale.set(1, 1, 1); O.updateMatrix();
      put(p.gun ? 'bullet' : 'arrow', O.matrix);
    }
    if (skOn) S3.end();
    for (const k in M) { const im = M[k]; im.count = Math.min(cnt[k], im.instanceMatrix.count); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // 振りの扇
    let fi = 0;
    for (const hh of A.s) if (hh.pc && hh.sw && live(hh)) {
      let fm = X.fans[fi]; if (!fm) { fm = X.fans[fi] = new T.Mesh(new T.CircleGeometry(1, 16, 0, 1), new T.MeshBasicMaterial({ color: 0xfffae0, transparent: true, depthWrite: false, side: T.DoubleSide })); scene.add(fm); }
      if (fm.userData.arc !== hh.sw.arc) { fm.geometry.dispose(); fm.geometry = new T.CircleGeometry(1, 16, -hh.sw.arc, hh.sw.arc * 2).rotateX(-Math.PI / 2); fm.userData.arc = hh.sw.arc; }
      fm.visible = true; fm.material.opacity = 0.45 * Math.max(0, hh.sw.t) / (hh.sw.d || 0.18);
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
