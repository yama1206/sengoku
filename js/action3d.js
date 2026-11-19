// 0.63.0 自分で戦う：3D表示（three.js）。1.6.65 兵・本人・馬は人型モデル（js/soldier3d.js。t1〜t4の格ごと、Mixamoの動きつき）で描く。0.65.0 見た目の質を上げた（空・雲・草・木・地面の模様・具足・歩く足）。計算は action.js のまま、見た目だけを3Dで描く
// three.js が読めないときや WebGL が使えないときは、これまでの2D表示に戻る
(function () {
  const R = SGK.RENDER, SIM = SGK.SIM, TR = SIM.TROOPS;
  const X = R.act3d = { on: true, ready: false, failed: false };
  try { const v = localStorage.getItem('sgk-act3d'); if (v === '0') X.on = false; } catch (e) { /* 保存できない環境 */ }
  // 0.75.0 ビデオ設定：影（0切・1低・2高）、草の量（0なし・1少なめ・2普通・3多め）
  X.vid = { sh: 2, gr: 2, pp: 1, lo: 0, men: 360 }; /* 2.2.0 pp：画面の仕上げ（0切・1入）。2.23.0 lo：超低画質、men：戦場に同時に出る兵の数 */
  // 2.23.0 スマホは初めから超低画質（自分で設定を変えたら、それを使う）
  X.phone = /Android|iPhone|iPod|iPad/i.test(navigator.userAgent || '') || (!!window.matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);
  if (X.phone) Object.assign(X.vid, { lo: 1, men: 150 });
  try { Object.assign(X.vid, JSON.parse(localStorage.getItem('sgk-vid') || '{}')); } catch (e) { /* 無視 */ }
  X.MEN = [80, 120, 150, 200, 250, 360, 500]; // 設定で選べる数
  X.eff = () => (X.vid.lo ? { sh: 0, gr: 0, pp: 0, pr: 1 } : { sh: X.vid.sh, gr: X.vid.gr, pp: X.vid.pp, pr: Math.min(2, window.devicePixelRatio || 1) }); // 超低画質：影・草・仕上げを切り、細かさは画面の1倍
  if (SGK.SIM && SGK.SIM.ACT) SGK.SIM.ACT.fieldMen = () => X.vid.men || 360;
  let grassM = null;
  X.setVid = (k, v) => { X.vid[k] = v; try { localStorage.setItem('sgk-vid', JSON.stringify(X.vid)); } catch (e) { /* 無視 */ } X.applyVid(); };
  X.applyVid = () => {
    const E = X.eff(); if (rd && rd.getPixelRatio() !== E.pr) rd.setPixelRatio(E.pr);
    if (sun) { const sh = E.sh, sz = sh === 1 ? 2048 : 4096, bx = sh === 1 ? 90 : 130; sun.castShadow = sh > 0; { const c = sun.shadow.camera; if (c.right !== bx) { c.left = c.bottom = -bx; c.right = c.top = bx; c.updateProjectionMatrix(); } } /* 2.2.0 影を細かく・広く */ if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } }
    if (grassM) grassM.count = Math.floor(grassM.userData.full * [0, 0.2, 0.55, 1][E.gr]);
  };
  X.toggle = () => { X.on = !X.on; try { localStorage.setItem('sgk-act3d', X.on ? '1' : '0'); } catch (e) { /* 無視 */ } if (!X.on && cv) cv.style.display = 'none'; return X.on; };

  let T, rd, scene, cam3, cv, sun, hideT, W = 0, H = 0, clock = 0;
  let built = null, groundG = null, groundM = null, gateM = [], trees = [], ter = [], NW = null, hills = [], sky = null, hemi = null, tod = null, texMacro = null, texGN = null, envT = null, waterT = []; const gTime = { value: 0 }, wOff = { value: null };
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
    if (NW) { if (NW.hg) h += SGK.SIM.nawaH(NW, x, y); if (SGK.SIM.nawaAreaExact(NW, x, y) === 2) { const L = SGK.SIM.nawaMoatL(NW, x, y); h = (L != null && NW.hg ? h - SGK.SIM.nawaH(NW, x, y) + L : h) - 1.4; } } /* 2.12.0 城の山の高さと水堀（堀の底は水の高さにそろえる） */
    let wd = 0; for (const t of ter) if (t.k === 'w') { const d = Math.hypot(x - t.x, y - t.y); if (d < t.r + 4) wd = Math.max(wd, 1 - Math.pow(d / (t.r + 4), 2)); } /* 1.6.64 川の底（岸はなだらか） */
    return h - 2.4 * wd; /* 1.6.70 川底を深く */
  }
  X.hgt = hgt;
  X.FLAGS = false; // 2.12.4 戦闘の旗（指物）を出すか。いまはプレイヤー・兵・武将の全部で出さない

  function rng(seed) { let s = (seed * 9301 + 49297) % 233280 || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  function init() {
    T = window.THREE; if (!T) return false;
    cv = document.createElement('canvas'); cv.id = 'act3d';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none';
    const m = document.getElementById('map'); m.parentNode.insertBefore(cv, m);
    if (T.ColorManagement) T.ColorManagement.legacyMode = false; /* 2.1.0 色を正しく扱う（明暗がはっきりする） */
    try { rd = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { X.failed = true; return false; }
    rd.setPixelRatio(X.eff().pr);
    rd.shadowMap.enabled = true; rd.shadowMap.type = T.PCFSoftShadowMap;
    rd.outputEncoding = T.sRGBEncoding; rd.toneMapping = T.ACESFilmicToneMapping; rd.toneMappingExposure = 1.0;
    scene = new T.Scene(); scene.background = new T.Color(0xcfdde6); scene.fog = new T.Fog(0xcfdde6, 150, 520);
    cam3 = new T.PerspectiveCamera(45, 1, 0.5, 2000);
    hemi = new T.HemisphereLight(0xd6e6f5, 0x4f5a34, 0.72); scene.add(hemi);
    sun = new T.DirectionalLight(0xffe6c0, 1.0); sun.castShadow = true;
    sun.shadow.normalBias = 0.03;
    // 2.1.0 空：地平のかすみ・太陽のまわりの光・陰のある雲・高い筋雲。時刻（朝・昼・夕）で色が変わる
    sky = new T.Mesh(new T.SphereGeometry(1500, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new T.Color(0x4f86c2) }, hor: { value: new T.Color(0xcfdde6) }, sunC: { value: new T.Color(0xfff0d0) }, sunD: { value: new T.Vector3(0.4, 0.8, -0.3) }, tm: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 hor; uniform vec3 sunC; uniform vec3 sunD; uniform float tm; varying vec3 vP;',
        'float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fb(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * ns(p); p *= 2.03; a *= 0.5; } return v; }',
        'void main(){ vec3 d = normalize(vP), sd = normalize(sunD); float h = max(d.y, 0.0), s = max(dot(d, sd), 0.0);',
        ' vec3 c = mix(hor, top, pow(h, 0.45)); c = mix(c, hor * 1.04, exp(-h * 14.0) * 0.45);',
        ' c += sunC * (pow(s, 6.0) * 0.2 + pow(s, 48.0) * 0.3) * (1.0 - h * 0.4);',
        ' if (d.y > 0.0) { vec2 q = d.xz / (d.y + 0.1) * 1.4 + vec2(tm * 0.010, tm * 0.003);',
        '  float n = fb(q), cl = smoothstep(0.5, 0.8, n) * smoothstep(0.0, 0.2, d.y), n2 = fb(q + sd.xz * 0.09);',
        '  float lit = clamp(0.62 + (n - n2) * 3.2, 0.32, 1.1); vec3 cc = mix(hor * 0.7, vec3(1.0), lit); cc = mix(cc, sunC, pow(s, 8.0) * 0.55);',
        '  c = mix(c, cc, cl * 0.9);',
        '  float st = smoothstep(0.56, 0.78, fb(vec2(q.x * 0.3, q.y * 1.9) + tm * 0.004)) * smoothstep(0.1, 0.5, d.y) * 0.22; c = mix(c, vec3(1.0), st); }',
        ' else c = hor * 0.92;',
        ' c += sunC * pow(s, 1200.0) * 2.0;',
        ' gl_FragColor = vec4(c, 1.0);',
        ' #include <tonemapping_fragment>',
        ' #include <encodings_fragment>',
        '}',
      ].join('\n'),
    }));
    sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
    sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 520;
    sun.shadow.bias = -0.0008; X.applyVid(); scene.add(sun); scene.add(sun.target);
    // 戦場の外の広い地面
    const og = new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), on = og.attributes.position.count; /* 2.6.4 写真の模様も貼れるように */
    og.setAttribute('color', new T.BufferAttribute(new Float32Array(on * 3).fill(0.82), 3)); og.setAttribute('spA', new T.BufferAttribute(new Float32Array(on * 4), 4)); og.setAttribute('spB', new T.BufferAttribute(new Float32Array(on * 2), 2));
    outOld = new T.MeshLambertMaterial({ color: 0x6d7c44, depthWrite: false }); outM = new T.Mesh(og, outOld);
    outM.position.set(350, -0.3, 230); outM.receiveShadow = true; outM.renderOrder = -0.5; scene.add(outM); /* 先に描いて奥行きは書かない：戦場の地面のくぼみや川を上から覆わないように */
    loadGroundTex(); loadTreeTex();

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
    // 2.17.0 名物兵の飾り。頭（h：首の上）・胸（b：背骨の上の方）・馬（r：乗り手の足もと）からの位置。前が +X
    // 2.18.0 飾りを作り込む（色を付ける飾りは vcw：頂点の明るさで模様、色は兵ごとに掛ける）。羽根の立物・鉢巻・面頬・指物・馬鎧を足した
    { const vd = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), vcw = () => new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), G0 = 0xd8b030, G1 = 0xa8801c, AN = 0x5a3d22;
      const ring = (r, t, y) => new T.TorusGeometry(r, t, 5, 18).rotateX(Math.PI / 2).translate(0, y, 0);
      // 鍬形：金の二本角と、真ん中の丸い前立て
      mk('p_kuwa', merge([[new T.BoxGeometry(0.025, 0.32, 0.05).rotateX(0.5).translate(0.15, 0.31, 0.085), G0], [new T.BoxGeometry(0.025, 0.32, 0.05).rotateX(-0.5).translate(0.15, 0.31, -0.085), G0], [new T.BoxGeometry(0.04, 0.05, 0.18).translate(0.15, 0.17, 0), G1], [new T.CylinderGeometry(0.05, 0.05, 0.02, 12).rotateZ(Math.PI / 2).translate(0.165, 0.21, 0), G0]]), new T.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a2a00 }), CAP.body, false);
      const tn = []; for (const z of [1, -1]) { tn.push([new T.CylinderGeometry(0.018, 0.024, 0.4, 5).rotateX(z * 0.7).translate(0.04, 0.36, z * 0.15), AN], [new T.CylinderGeometry(0.013, 0.016, 0.16, 4).rotateZ(-0.6).rotateX(z * 0.2).translate(0.1, 0.4, z * 0.17), AN], [new T.CylinderGeometry(0.013, 0.016, 0.14, 4).rotateZ(0.5).rotateX(z * 0.3).translate(-0.02, 0.5, z * 0.25), AN], [new T.CylinderGeometry(0.011, 0.014, 0.12, 4).rotateZ(-0.3).rotateX(z * 0.9).translate(0.06, 0.55, z * 0.3), AN]); }
      mk('p_tsuno', merge(tn).scale(0.8, 0.8, 0.8), vc, CAP.body, false);
      // 裹頭（顔のところだけあける）
      mk('p_katou', merge([[new T.SphereGeometry(0.19, 14, 9, Math.PI + 0.7, Math.PI * 2 - 1.4).scale(1, 1.2, 1).translate(-0.02, 0.14, 0), 0xffffff], [new T.CylinderGeometry(0.2, 0.27, 0.22, 14, 1, true, Math.PI / 2 + 0.7, Math.PI * 2 - 1.4).translate(-0.02, -0.03, 0), 0xeeeeee], [new T.BoxGeometry(0.03, 0.26, 0.3).translate(-0.17, -0.1, 0), 0xdddddd]]), vcw(), CAP.body, false);
      // 笠：編み目の筋と、てっぺんの結び
      { const kp = [[new T.ConeGeometry(0.38, 0.15, 16, 1, true).translate(0, 0.25, 0), 0xffffff], [new T.CylinderGeometry(0.02, 0.03, 0.04, 6).translate(0, 0.34, 0), 0x777777]]; for (const r of [0.13, 0.24, 0.34]) kp.push([ring(r, 0.006, 0.325 - r * 0.39), 0x9a9a9a]); mk('p_kasa2', merge(kp), vcw(), CAP.body, false); }
      // 箙：矢の束（羽根が肩から出る）
      { const ep = [[new T.BoxGeometry(0.08, 0.55, 0.15).rotateX(0.35).translate(-0.2, -0.02, 0.12), 0x3a2814], [new T.BoxGeometry(0.09, 0.05, 0.16).rotateX(0.35).translate(-0.2, -0.27, 0.03), 0x1e140a]];
        for (let i = 0; i < 7; i++) { const dz = (i - 3) * 0.02, dx = (i % 2) * 0.02; ep.push([new T.CylinderGeometry(0.006, 0.006, 0.3, 4).rotateX(0.35).translate(-0.2 + dx, 0.36, 0.25 + dz), 0x8a6a40], [new T.BoxGeometry(0.004, 0.1, 0.035).rotateX(0.35).translate(-0.2 + dx, 0.46, 0.29 + dz), i % 3 ? 0xf0ece0 : 0x2a2a2a]); }
        mk('p_ebira', merge(ep), vc, CAP.body, false); }
      // 大袖：板を重ねて糸で縅した肩の守り（段ごとに筋）
      { const op = []; for (const z of [1, -1]) for (let k = 0; k < 5; k++) op.push([new T.BoxGeometry(0.3, 0.068, 0.035).rotateX(-z * 0.25).translate(0, 0.08 - k * 0.07 - 0.0, z * (0.29 + k * 0.008)), k % 2 ? 0xffffff : 0xb8b8b8], [new T.BoxGeometry(0.31, 0.012, 0.04).rotateX(-z * 0.25).translate(0, 0.045 - k * 0.07, z * (0.292 + k * 0.008)), 0x333333]);
        mk('p_oosode', merge(op), vcw(), CAP.body, false); }
      mk('p_mushiro', merge([[new T.CylinderGeometry(0.02, 0.02, 1.6, 4).translate(-0.22, 0.4, 0), 0x3b2a18], [new T.PlaneGeometry(0.3, 0.72).rotateY(Math.PI / 2).translate(-0.22, 0.82, 0.16), 0xe9e4d4], [new T.BoxGeometry(0.03, 0.09, 0.31).translate(-0.22, 1.14, 0.16), 0x1a1a1a], [new T.BoxGeometry(0.03, 0.5, 0.05).translate(-0.22, 0.78, 0.16), 0x1a1a1a]]), vd, CAP.body, false); // 門徒の旗（白地に黒い帯と文字の列）
      mk('p_itate', merge([[new T.BoxGeometry(0.05, 0.8, 0.46).translate(0.34, -0.55, -0.24), 0x7a5a36], [new T.BoxGeometry(0.06, 0.05, 0.47).translate(0.34, -0.3, -0.24), 0x2a1e12], [new T.BoxGeometry(0.06, 0.05, 0.47).translate(0.34, -0.78, -0.24), 0x2a1e12], [new T.BoxGeometry(0.052, 0.8, 0.012).translate(0.34, -0.55, -0.24), 0x5a4026]]), vc, CAP.body, false);
      // 胴乱：弾と火薬の入れ物、腰の火縄
      mk('p_dor', merge([[new T.BoxGeometry(0.16, 0.13, 0.09).translate(0.06, -0.47, 0.22), 0x2a1e14], [new T.BoxGeometry(0.17, 0.03, 0.1).translate(0.06, -0.4, 0.22), 0x4a3424], [new T.TorusGeometry(0.06, 0.01, 4, 10).rotateY(Math.PI / 2).translate(-0.02, -0.5, -0.2), 0xa83020]]), vc, CAP.body, false);
      // 陣羽織：背中の家紋（明るい丸）と、裾の切れ込み
      mk('p_baori', merge([[new T.BoxGeometry(0.04, 0.4, 0.5).translate(-0.17, -0.12, 0), 0xc4c4c4], [new T.BoxGeometry(0.04, 0.26, 0.23).translate(-0.17, -0.45, 0.13), 0xc4c4c4], [new T.BoxGeometry(0.04, 0.26, 0.23).translate(-0.17, -0.45, -0.13), 0xc4c4c4], [new T.CylinderGeometry(0.08, 0.08, 0.045, 14).rotateZ(Math.PI / 2).translate(-0.18, -0.05, 0), 0xffffff], [new T.CylinderGeometry(0.05, 0.05, 0.05, 14).rotateZ(Math.PI / 2).translate(-0.185, -0.05, 0), 0x6a6a6a], [new T.BoxGeometry(0.05, 0.03, 0.52).translate(-0.17, 0.08, 0), 0x8a8a8a]]), vcw(), CAP.body, false);
      // 羽根の立物：兜の後ろに扇のように立つ羽根
      { const hp = []; for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.22; hp.push([new T.ConeGeometry(0.035, 0.42, 4).translate(0, 0.21, 0).rotateZ(0.35).rotateX(a).translate(-0.06, 0.24, 0), i % 2 ? 0xffffff : 0xd6d6d6]); } hp.push([new T.SphereGeometry(0.04, 8, 6).translate(-0.06, 0.24, 0), 0x777777]); mk('p_hane', merge(hp), vcw(), CAP.body, false); }
      // 鉢巻：額に巻き、後ろで結んで垂らす
      mk('p_hachi', merge([[ring(0.115, 0.018, 0.1), 0xffffff], [new T.BoxGeometry(0.02, 0.16, 0.04).rotateX(0.3).translate(-0.13, 0.03, 0.03), 0xe6e6e6], [new T.BoxGeometry(0.02, 0.14, 0.04).rotateX(-0.3).translate(-0.13, 0.04, -0.03), 0xe6e6e6]]), vcw(), CAP.body, false);
      // 面頬：口元を覆う面と垂れ（喉の守り）
      mk('p_mempo', merge([[new T.SphereGeometry(0.1, 10, 6, Math.PI - 0.9, 1.8, Math.PI * 0.45, Math.PI * 0.4).translate(0.03, 0.07, 0), 0xffffff], [new T.BoxGeometry(0.03, 0.05, 0.05).translate(0.13, 0.08, 0), 0xcccccc], [new T.CylinderGeometry(0.11, 0.14, 0.09, 12, 1, true, Math.PI / 2 - 1.1, 2.2).translate(0.02, -0.02, 0), 0x9a9a9a]]), vcw(), CAP.body, false);
      // 指物：背中に立てる小旗（上に家の印の帯）
      mk('p_sashi', merge([[new T.CylinderGeometry(0.015, 0.015, 1.25, 4).translate(-0.2, 0.42, 0), 0x3b2a18], [new T.PlaneGeometry(0.26, 0.6).rotateY(Math.PI / 2).translate(-0.2, 0.72, 0.14), 0xffffff], [new T.PlaneGeometry(0.262, 0.1).rotateY(Math.PI / 2).translate(-0.199, 0.95, 0.14), 0x3a3a3a], [new T.BoxGeometry(0.02, 0.02, 0.3).translate(-0.2, 1.03, 0.14), 0x3b2a18]]), vcw(), CAP.body, false);
      // 馬鎧：馬の胴を覆う布（左右と胸）と房
      { const up = []; for (const z of [1, -1]) up.push([new T.BoxGeometry(1.25, 0.42, 0.02).translate(0.1, -0.08, z * 0.32), 0xd0d0d0], [new T.BoxGeometry(1.27, 0.05, 0.03).translate(0.1, -0.27, z * 0.325), 0x6a6a6a], [new T.ConeGeometry(0.04, 0.14, 6).rotateX(Math.PI).translate(0.6, -0.33, z * 0.33), 0xffffff], [new T.ConeGeometry(0.04, 0.14, 6).rotateX(Math.PI).translate(-0.4, -0.33, z * 0.33), 0xffffff]);
        up.push([new T.BoxGeometry(0.02, 0.4, 0.66).translate(0.75, -0.08, 0), 0xd0d0d0]); mk('p_uma', merge(up), vcw(), Math.ceil(CAP.body / 3), false); }
    }
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
  function canvasTex(n, fn, lin) { const c = document.createElement('canvas'); c.width = c.height = n; fn(c.getContext('2d'), n); const t = new T.CanvasTexture(c); if (!lin) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = rd.capabilities.getMaxAnisotropy ? Math.min(8, rd.capabilities.getMaxAnisotropy()) : 1; return t; }
  // 2.2.0 くり返せるなめらかな乱数の高さ（n×n、G：格子の数）
  function tileNoise(n, G, oct, seed) {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0, a = 0.5, g = G;
      for (let o = 0; o < oct; o++) { const fx = x / n * g, fy = y / n * g, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, w = fy - yi, uu = u * u * (3 - 2 * u), ww = w * w * (3 - 2 * w), at = (X2, Y2) => vh((((X2 % g) + g) % g) + o * 101 + seed, (((Y2 % g) + g) % g) + o * 57); /* 2.6.4 配列の外を読んで NaN になり、水面に縞と黒い点が出ていた */
        s += a * ((at(xi, yi) * (1 - uu) + at(xi + 1, yi) * uu) * (1 - ww) + (at(xi, yi + 1) * (1 - uu) + at(xi + 1, yi + 1) * uu) * ww); a *= 0.5; g *= 2; }
      out[y * n + x] = s;
    }
    return out;
  }
  // 2.2.0 高さから凹凸の向きの絵（法線マップ）を作る
  function normalTex(n, hgtArr, k) {
    return canvasTex(n, (g) => {
      const im = g.createImageData(n, n), H2 = (x, y) => hgtArr[((y + n) % n) * n + ((x + n) % n)];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const dx = (H2(x + 1, y) - H2(x - 1, y)) * k, dy = (H2(x, y + 1) - H2(x, y - 1)) * k, l = Math.hypot(dx, dy, 1), q = (y * n + x) * 4;
        im.data[q] = (-dx / l * 0.5 + 0.5) * 255; im.data[q + 1] = (dy / l * 0.5 + 0.5) * 255; im.data[q + 2] = (1 / l * 0.5 + 0.5) * 255; im.data[q + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, true);
  }
  // 2.2.0 地面の凹凸：地面の模様の明るさ（草の筋・土の粒）を高さとみなす
  function groundNormal(cvs) {
    const n = cvs.width, d = cvs.getContext('2d').getImageData(0, 0, n, n).data, h = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) h[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765;
    return normalTex(n, h, 3.5);
  }
  // 2.1.0 地面の模様：細かい草・土の粒・小石・土の色むら
  function groundTex() {
    return canvasTex(512, (g, n) => {
      const r = rng(11); g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, n, n);
      for (let i = 0; i < 90; i++) { const v = 150 + Math.floor(r() * 60), x = r() * n, y = r() * n, rr = 6 + r() * 26; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(${v + 10},${v},${v - 20},0.35)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 9000; i++) { const v = 150 + Math.floor(r() * 105); g.fillStyle = `rgba(${v},${v},${v},0.5)`; const w = 1 + r() * 2.5; g.fillRect(r() * n, r() * n, w, w); }
      for (let i = 0; i < 2600; i++) { const v = 200 + Math.floor(r() * 55); g.strokeStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`; g.lineWidth = 1 + r(); const x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 5, y - 3 - r() * 7); g.stroke(); }
      for (let i = 0; i < 160; i++) { const v = 120 + Math.floor(r() * 50); g.fillStyle = `rgba(${v},${v},${v},0.6)`; g.beginPath(); g.arc(r() * n, r() * n, 1 + r() * 2.2, 0, 7); g.fill(); }
    });
  }
  // 2.1.0 大きな色むら（模様のくり返しを目立たなくする）
  function macroTex() {
    return canvasTex(128, (g, n) => {
      const r = rng(23), G = 8, v = []; for (let i = 0; i < G * G * 2; i++) v.push(r());
      const at = (k, x, y) => v[k * G * G + ((y % G + G) % G) * G + ((x % G + G) % G)];
      const im = g.createImageData(n, n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const o = [0, 0];
        for (let k = 0; k < 2; k++) { let s = 0, a = 0.6, f = 1; for (let oc = 0; oc < 3; oc++) { const fx = x / n * G * f, fy = y / n * G * f, xi = Math.floor(fx), yi = Math.floor(fy), u = fx - xi, w = fy - yi, uu = u * u * (3 - 2 * u), ww = w * w * (3 - 2 * w);
          s += a * ((at(k, xi, yi) * (1 - uu) + at(k, xi + 1, yi) * uu) * (1 - ww) + (at(k, xi, yi + 1) * (1 - uu) + at(k, xi + 1, yi + 1) * uu) * ww); a *= 0.5; f *= 2; } o[k] = s / 1.05; }
        const q = (y * n + x) * 4; im.data[q] = o[0] * 255; im.data[q + 1] = o[1] * 255; im.data[q + 2] = 128; im.data[q + 3] = 255;
      }
      g.putImageData(im, 0, 0);
    }, true);
  }
  function grassTex() {
    const t = canvasTex(128, (g, n) => {
      const r = rng(5); g.clearRect(0, 0, n, n);
      for (let i = 0; i < 46; i++) { const x = 8 + r() * (n - 16), h = n * (0.45 + r() * 0.5), lean = (r() - 0.5) * 30, v = 170 + Math.floor(r() * 85);
        g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.moveTo(x - 2.5, n); g.quadraticCurveTo(x + lean * 0.4, n - h * 0.6, x + lean, n - h); g.quadraticCurveTo(x + lean * 0.4 + 1, n - h * 0.6, x + 2.5, n); g.fill(); }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping; return t;
  }
  // 2.1.0 草：風でなびく・根元は暗く先は明るい・遠くの草は小さくして消す
  function grassMat() {
    const m = new T.MeshLambertMaterial({ map: texGrass, alphaTest: 0.45, side: T.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.gT = gTime;
      sh.vertexShader = 'uniform float gT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n vec4 gw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); transformed *= 1.0 - smoothstep(150.0, 230.0, distance(cameraPosition.xz, gw.xz)); float gk = position.y / 0.55; transformed.x += sin(gT * 1.6 + gw.x * 0.35 + gw.z * 0.22) * 0.13 * gk; transformed.z += cos(gT * 1.3 + gw.x * 0.2 + gw.z * 0.31) * 0.08 * gk;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.55, 1.12, vUv.y);')
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);'); /* 2.6.5 裏から見た草の束が黒くなっていた（両面の板は裏で向きが逆になる） */
    };
    return m;
  }
  // 2.1.0 なめらかな乱数の模様（地面の色むら用）
  const vh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, uu = u * u * (3 - 2 * u), ww = v * v * (3 - 2 * v); return (vh(xi, yi) * (1 - uu) + vh(xi + 1, yi) * uu) * (1 - ww) + (vh(xi, yi + 1) * (1 - uu) + vh(xi + 1, yi + 1) * uu) * ww; };
  const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.3 + vn(x * 4.3, y * 4.3) * 0.2;
  // 2.6.4 写真から作った地面の模様（assets/textures/ground_*.jpg）。場所ごとの割合（頂点の spA・spB）で混ぜる。
  // 読めない時・file:// で開いた時は、これまでの模様（groundTex と頂点色）のまま
  const GT = { names: ['grass_lush', 'grass_dry', 'grass_weedy', 'forest_floor', 'dirt_packed', 'dirt_rocky', 'mud_bank', 'riverbed'], tex: {}, ok: false, fail: false, U: null };
  function loadGroundTex() {
    if (location.protocol === 'file:') { GT.fail = true; return; }
    const ld = new T.TextureLoader(), an = rd.capabilities.getMaxAnisotropy ? Math.min(8, rd.capabilities.getMaxAnisotropy()) : 1;
    let left = GT.names.length;
    for (const n of GT.names) ld.load(`assets/textures/ground_${n}.jpg`, (t) => {
      t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = an; GT.tex[n] = t;
      if (--left === 0 && !GT.fail) { GT.ok = true; if (groundM) useGroundTex(); }
    }, undefined, () => { GT.fail = true; });
  }
  function groundMat(bump) {
    const U = GT.U || (GT.U = {
      tG1: { value: null }, tG2: { value: null }, tDy: { value: null }, tFo: { value: null }, tDp: { value: null }, tDr: { value: null }, tMu: { value: null }, tRb: { value: null },
      uSc: { value: 1 / 3 }, uRot: { value: 0 }, uDry: { value: 0.5 }, uG2d: { value: 0 }, uTint: { value: new T.Color(1, 1, 1) },
    });
    const m = new T.MeshStandardMaterial({ vertexColors: true, normalMap: bump ? texGN : null, normalScale: new T.Vector2(0.45, 0.45), roughness: 0.93, metalness: 0 }); /* 凹凸（2.2.0）は弱めに残す */
    m.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, U);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 spA; attribute vec2 spB; varying vec4 vSpA; varying vec2 vSpB; varying vec2 vGP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = (modelMatrix * vec4(transformed, 1.0)).xz; vSpA = spA; vSpB = spB;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', ['#include <common>',
          'uniform sampler2D tG1, tG2, tDy, tFo, tDp, tDr, tMu, tRb; uniform float uSc, uRot, uDry, uG2d; uniform vec3 uTint;',
          'varying vec4 vSpA; varying vec2 vSpB; varying vec2 vGP;',
          'float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
          'float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), f.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), f.x), f.y); }',
          'float gf(vec2 p){ return gn(p) * 0.55 + gn(p * 2.13 + 7.1) * 0.3 + gn(p * 4.7 + 3.3) * 0.15; }',
          'vec2 gUV1, gUV2; float gTB;',
          'vec3 gD(vec3 c){ return mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.6) * vec3(0.97, 0.98, 0.9); }', // 枯れ草は黄色を抑える
          // 同じ模様の繰り返しを隠す：向き・大きさを変えたもう1枚と、まだらに混ぜる
          'vec3 gS(sampler2D t){ return mix(texture2D(t, gUV1).rgb, texture2D(t, gUV2).rgb, gTB); }',
          // 割合 w を模様の明るさで崩して混ぜる（境目が丸くならず、石や草の形に沿って変わる）
          'vec3 gL(vec3 c, vec3 l, float w, float n){ float h = dot(l, vec3(0.3, 0.5, 0.2)); float k = clamp((w - 0.5) * 2.6 + 0.5 + (h - 0.4) * 1.1 + (n - 0.5) * 0.7, 0.0, 1.0); return mix(c, l, w <= 0.001 ? 0.0 : w >= 0.999 ? 1.0 : k); }',
        ].join('\n'))
        .replace('#include <map_fragment>', [
          'float cr = cos(uRot), sr = sin(uRot); vec2 wp = mat2(cr, sr, -sr, cr) * vGP;',
          'gUV1 = wp * uSc; gUV2 = mat2(0.80, -0.60, 0.60, 0.80) * wp * uSc * 0.77 + vec2(0.37, 0.11);',
          'float n1 = gf(vGP * 0.021), n2 = gf(vGP * 0.07 + 13.0), n3 = gn(vGP * 0.9) * 0.55 + gn(vGP * 0.23 + 3.7) * 0.45;',
          'gTB = smoothstep(0.3, 0.7, n2);',
          'vec3 g2 = gS(tG2); vec3 gc = mix(gS(tG1), mix(g2, gD(g2), uG2d), smoothstep(0.42, 0.72, n1) * uDry);',
          'gc = gL(gc, gD(gS(tDy)), vSpA.x, n3); gc = gL(gc, gS(tFo), vSpA.y, n3); gc = gL(gc, gS(tDp), vSpA.z, n3); gc = gL(gc, gS(tDr), vSpA.w, n3);',
          'gc = gL(gc, gS(tMu), vSpB.x, n3); gc = gL(gc, gS(tRb), vSpB.y, n3);',
          'gc = mix(vec3(dot(gc, vec3(0.3, 0.55, 0.15))), gc, 0.85) * (0.86 + 0.28 * gf(vGP * 0.012 + 5.0)) * uTint;', // 鮮やかすぎないように // 広い明るさのむら
          'diffuseColor.rgb *= gc;',
        ].join('\n'));
    };
    return m;
  }
  // 戦場ごとに草の組み合わせ・模様の向き・色合いを変える（同じ景色が続かないように）
  function groundLook(id) {
    const U = GT.U, E = ter.find((t) => t.k === 'e') || {}, r = rng(String(id).split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0) & 0xffff, 97) + 5), tx = GT.tex;
    const dryish = (E.mt || 0) > 0.3 || r() < 0.3, lush = r() < 0.5;
    U.tG1.value = lush ? tx.grass_lush : tx.grass_weedy; // 地面の基本
    U.tG2.value = dryish || r() < 0.45 ? tx.grass_dry : lush ? tx.grass_weedy : tx.grass_lush; // まだらに混ぜる草
    U.uG2d.value = U.tG2.value === tx.grass_dry ? 1 : 0;
    U.uDry.value = dryish ? 0.75 + r() * 0.25 : 0.3 + r() * 0.5;
    U.tDy.value = tx.grass_dry; U.tFo.value = tx.forest_floor; U.tDp.value = tx.dirt_packed; U.tDr.value = tx.dirt_rocky; U.tMu.value = tx.mud_bank; U.tRb.value = tx.riverbed;
    U.uRot.value = r() * 6.283;
    U.uTint.value.setRGB(0.97 + r() * 0.08, 0.97 + r() * 0.06, 0.93 + r() * 0.07);
  }
  let outM = null, outOld = null;
  function useGroundTex() {
    if (!groundM.userData.tex) { groundM.material.dispose(); groundM.material = groundMat(true); groundM.userData.tex = true; }
    groundLook(built);
    groundG.setAttribute('color', groundG.userData.tint);
    if (outM && outM.material === outOld) { outM.material = groundMat(false); outM.material.depthWrite = false; }
  }
  // 2.6.5 写真から作った木（assets/textures/tree_*）：杉・松・広葉樹2種（欅・楢）。枝葉の写真を貼った板を幹のまわりに何十枚も重ね、
  // 樹皮の写真を貼った幹と枝に付ける。戦場ごとに形（各3通り）と混ざり方を変える。風で梢がゆれる。
  // 読めない時・file:// で開いた時は、これまでの木（円すいと丸い葉）のまま
  const TT = { leaf: ['sugi', 'pine', 'keyaki', 'oak'], bark: ['sugi', 'pine', 'oak'], tex: {}, ok: false, fail: false, pts: null, objs: [] };
  function loadTreeTex() {
    if (location.protocol === 'file:') { TT.fail = true; return; }
    const ld = new T.TextureLoader(), an = rd.capabilities.getMaxAnisotropy ? Math.min(8, rd.capabilities.getMaxAnisotropy()) : 1, files = [];
    for (const n of TT.leaf) files.push([`leaf_${n}_c`, 'jpg', true], [`leaf_${n}_a`, 'png', false]);
    for (const n of TT.bark) files.push([`bark_${n}`, 'jpg', true]);
    let left = files.length;
    for (const [n, ext, srgb] of files) ld.load(`assets/textures/tree_${n}.${ext}`, (t) => {
      if (srgb) t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = n.startsWith('bark') ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.anisotropy = an; TT.tex[n] = t;
      if (--left === 0 && !TT.fail) { TT.ok = true; if (TT.pts && built === TT.pts[0]) plantTrees(TT.pts[0], TT.pts[1]); }
    }, undefined, () => { TT.fail = true; });
  }
  // 形を作る道具：p 位置・n 向き（光の当たり方）・uv・c 暗さ（幹のそばや下の方は暗い）
  const TB = () => ({ p: [], n: [], uv: [], c: [], ix: [] });
  function tbGeo(B) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(B.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(B.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(B.uv, 2)); g.setAttribute('color', new T.Float32BufferAttribute(B.c, 3)); g.setIndex(B.ix); return g; }
  // 葉の板1枚：O＝絵の左下の角、ex＝絵の横、ey＝絵の下から上。cell＝2×2 に並べた絵のどれか。nf(点)→向き、af(点)→暗さ
  function leafCard(B, cell, O, ex, ey, nf, af) {
    const u0 = (cell % 2) * 0.5 + 0.004, u1 = u0 + 0.492, v1 = 1 - Math.floor(cell / 2) * 0.5 - 0.004, v0 = v1 - 0.492, b = B.p.length / 3;
    const P = [O.clone(), O.clone().add(ex), O.clone().add(ex).add(ey), O.clone().add(ey)], UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    P.forEach((q, k) => { const n = nf(q), a = af(q); B.p.push(q.x, q.y, q.z); B.n.push(n.x, n.y, n.z); B.uv.push(...UV[k]); B.c.push(a, a, a); });
    B.ix.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // 幹・枝：点の列に沿った管（樹皮の絵を巻く）
  function barkTube(B, pts, rad, seg, uRep, ao) {
    const b = B.p.length / 3, up = new T.Vector3(0, 1, 0), t = new T.Vector3(), s1 = new T.Vector3(), s2 = new T.Vector3(); let L = 0;
    for (let k = 0; k < pts.length; k++) {
      t.copy(pts[Math.min(pts.length - 1, k + 1)]).sub(pts[Math.max(0, k - 1)]).normalize();
      s1.crossVectors(t, Math.abs(t.y) > 0.9 ? new T.Vector3(1, 0, 0) : up).normalize(); s2.crossVectors(t, s1).normalize();
      if (k) L += pts[k].distanceTo(pts[k - 1]);
      for (let j = 0; j <= seg; j++) { const a = j / seg * Math.PI * 2, n = s1.clone().multiplyScalar(Math.cos(a)).addScaledVector(s2, Math.sin(a)), q = pts[k].clone().addScaledVector(n, rad[k]);
        B.p.push(q.x, q.y, q.z); B.n.push(n.x, n.y, n.z); B.uv.push(j / seg * uRep, L / 0.9); const c = ao * (0.75 + 0.25 * Math.min(1, pts[k].y / 3)); B.c.push(c, c, c); }
    }
    for (let k = 0; k < pts.length - 1; k++) for (let j = 0; j < seg; j++) { const a = b + k * (seg + 1) + j, c = a + seg + 1; B.ix.push(a, c, a + 1, a + 1, c, c + 1); }
  }
  const V3 = (x, y, z) => new T.Vector3(x, y, z);
  // 横にのびる向き d を軸に、板を roll だけ傾けた横の向き
  const sideOf = (d, roll) => { const s = V3(-d.z, 0, d.x); if (s.lengthSq() < 1e-6) s.set(1, 0, 0); s.normalize(); const w = new T.Vector3().crossVectors(d, s).normalize(); return s.multiplyScalar(Math.cos(roll)).addScaledVector(w, Math.sin(roll)); };
  // 杉：まっすぐな幹に、垂れた枝葉を輪のように重ねた細い円すい
  function treeSugi(r) {
    const Tr = TB(), Cr = TB(), Ht = 12 + r() * 4, y0 = 2 + r() * 1.5, R0 = 2.3 + r() * 0.9, ph = r() * 6, tp = [], tr = [];
    for (let k = 0; k <= 8; k++) { const y = -0.4 + (Ht + 0.4) * k / 8; tp.push(V3(0.12 * Math.sin(y * 0.3 + ph), y, 0.1 * Math.cos(y * 0.23 + ph))); tr.push(0.05 + 0.34 * Math.pow(1 - k / 8, 0.9)); }
    barkTube(Tr, tp, tr, 8, 2, 1);
    const nf = (q) => V3(q.x, 0, q.z).normalize().multiplyScalar(0.85).add(V3(0, 0.6, 0)).normalize();
    for (let y = y0; y < Ht - 0.4; y += 0.3 + r() * 0.12) {
      const t = (y - y0) / (Ht - y0), Rc = R0 * Math.pow(1 - t, 0.9) * (0.8 + r() * 0.35) + 0.45, nb = 4 + Math.floor(r() * 3);
      const af = (q) => (0.42 + 0.58 * Math.min(1, Math.hypot(q.x, q.z) / Rc)) * (0.68 + 0.32 * t);
      for (let b = 0; b < nb; b++) {
        const f = r() * Math.PI * 2, dr = 0.5 - 0.25 * t + r() * 0.25, d = V3(Math.cos(f), -dr, Math.sin(f)).normalize(), h = Rc * 1.2, w = h * (0.7 + r() * 0.3);
        const A = V3(Math.cos(f) * 0.15, y, Math.sin(f) * 0.15), ex = sideOf(d, (r() - 0.5) * 1.2).multiplyScalar(w), ey = d.clone().multiplyScalar(-h);
        leafCard(Cr, Math.floor(r() * 4), A.clone().addScaledVector(d, h).addScaledVector(ex, -0.5), ex, ey, (q) => (Math.hypot(q.x, q.z) < 0.3 ? V3(d.x, 0.6, d.z).normalize() : nf(q)), af);
      }
    }
    for (let k = 0; k < 3; k++) { const f = k * 2.1 + r(), d = V3(Math.cos(f) * 0.3, -1, Math.sin(f) * 0.3).normalize(), ex = sideOf(V3(Math.cos(f), 0, Math.sin(f)), 0).multiplyScalar(0.9), A = V3(0, Ht + 0.7, 0);
      leafCard(Cr, k, A.clone().addScaledVector(d, 1.9).addScaledVector(ex, -0.5), ex, d.clone().multiplyScalar(-1.9), () => V3(0, 1, 0), () => 0.95); }
    return { trunk: tbGeo(Tr), crown: tbGeo(Cr) };
  }
  // 松：傾いて曲がった幹から枝を出し、その先に針葉の房を平たいかたまりにして付ける
  function treePine(r) {
    const Tr = TB(), Cr = TB(), Ht = 8 + r() * 3.5, ls = r() * Math.PI * 2, lean = 0.6 + r() * 1.3, tp = [], tr = [];
    const at = (t) => V3(Math.cos(ls) * lean * t * t + 0.3 * Math.sin(t * 5 + ls), Ht * t - 0.4 * (1 - t), Math.sin(ls) * lean * t * t + 0.3 * Math.cos(t * 4 + ls) * t);
    for (let k = 0; k <= 9; k++) { tp.push(at(k / 9)); tr.push(0.06 + 0.24 * Math.pow(1 - k / 9, 0.8)); }
    barkTube(Tr, tp, tr, 8, 2, 1);
    const pad = (C, pr) => {
      const nf = (q) => q.clone().sub(C).add(V3(0, 0.55 * pr, 0)).normalize(), af = (q) => Math.min(1.05, 0.55 + 0.45 * Math.max(0, (q.y - C.y) / pr + 0.5) + 0.15 * Math.hypot(q.x - C.x, q.z - C.z) / pr);
      for (let k = 0, n = 7 + Math.floor(r() * 4); k < n; k++) {
        const f = r() * Math.PI * 2, o = r() * pr * 0.45, A = V3(C.x + Math.cos(f) * o, C.y - 0.2 * pr, C.z + Math.sin(f) * o);
        const d = V3(Math.cos(f) * (0.6 + r() * 0.5), 0.55 + r() * 0.5, Math.sin(f) * (0.6 + r() * 0.5)).normalize(), h = pr * (0.95 + r() * 0.35), ex = sideOf(d, (r() - 0.5) * 0.9).multiplyScalar(h * 0.95);
        leafCard(Cr, Math.floor(r() * 4), A.clone().addScaledVector(ex, -0.5), ex, d.clone().multiplyScalar(h), nf, af);
      }
    };
    for (let b = 0, nb = 5 + Math.floor(r() * 4); b < nb; b++) {
      const t = 0.42 + 0.5 * b / nb + r() * 0.05, B0 = at(t), f = r() * Math.PI * 2, L = (1.4 + r() * 1.8) * (1.15 - 0.55 * (t - 0.42) / 0.5), up = 0.15 + r() * 0.4;
      const bp = [B0], br = [0.11 * (1.2 - t)]; for (let k = 1; k <= 3; k++) { const s = k / 3; bp.push(V3(B0.x + Math.cos(f) * L * s, B0.y + L * up * s + 0.25 * s * s, B0.z + Math.sin(f) * L * s)); br.push(Math.max(0.04, br[0] * (1 - s * 0.6))); }
      barkTube(Tr, bp, br, 5, 1, 0.9);
      pad(bp[3].clone().add(V3(0, 0.25, 0)), 1.1 + r() * 0.7); if (L > 1.8) pad(bp[2].clone().add(V3(0, 0.3, 0)), 0.85 + r() * 0.45);
    }
    pad(at(1).add(V3(0, 0.3, 0)), 1.1 + r() * 0.4);
    return { trunk: tbGeo(Tr), crown: tbGeo(Cr) };
  }
  // 広葉樹（欅・楢）：低い所で幹が分かれ、丸いかたまりがいくつか集まった樹冠
  function treeBroad(r) {
    const Tr = TB(), Cr = TB(), hb = 2.4 + r() * 1.2, rx = 3.1 + r() * 0.9, ry = 2.5 + r() * 0.8, hc = hb + ry + 0.6, C = V3(0, hc, 0);
    barkTube(Tr, [V3(0, -0.4, 0), V3(0.05, hb * 0.5, 0.03), V3(0, hb, 0)], [0.36, 0.3, 0.26], 8, 2, 1);
    const blobs = [];
    for (let k = 0, n = 6 + Math.floor(r() * 3); k < n; k++) {
      const f = k / n * Math.PI * 2 + r() * 0.6, e = (r() - 0.25) * 0.9, S = V3(Math.cos(f) * Math.cos(e) * rx * 0.55, hc + Math.sin(e) * ry * 0.6, Math.sin(f) * Math.cos(e) * rx * 0.55);
      blobs.push([S, 1.5 + r() * 0.7]);
      const lp = [V3(0, hb - 0.2, 0), V3(S.x * 0.35, hb + (S.y - hb) * 0.45, S.z * 0.35), V3(S.x * 0.8, S.y - 0.3, S.z * 0.8)];
      barkTube(Tr, lp, [0.17, 0.11, 0.05], 5, 1, 0.85);
    }
    blobs.push([V3(0, hc + ry * 0.5, 0), 1.7 + r() * 0.5]);
    for (const [S, br] of blobs) for (let k = 0, n = 13 + Math.floor(r() * 4); k < n; k++) {
      const dir = V3(r() - 0.5, r() - 0.4, r() - 0.5).normalize(), P = S.clone().addScaledVector(dir, br * (0.55 + 0.45 * r()));
      const nn = P.clone().sub(S).normalize().addScaledVector(V3(r() - 0.5, r() - 0.5, r() - 0.5), 0.9).normalize(), u = new T.Vector3().crossVectors(nn, V3(r() - 0.5, r() - 0.5, r() - 0.5)).normalize(), d = new T.Vector3().crossVectors(u, nn);
      const sz = 1.25 + r() * 0.65, ex = u.multiplyScalar(sz), ey = d.multiplyScalar(sz);
      leafCard(Cr, Math.floor(r() * 4), P.clone().addScaledVector(ex, -0.5).addScaledVector(ey, -0.5), ex, ey,
        (q) => q.clone().sub(C).multiply(V3(1 / rx, 1 / ry, 1 / rx)).normalize().multiplyScalar(0.7).add(q.clone().sub(S).normalize().multiplyScalar(0.3)).normalize(),
        (q) => { const e = q.clone().sub(C).multiply(V3(1 / rx, 1 / ry, 1 / rx)), l = e.length(); return Math.min(1.05, (0.4 + 0.6 * Math.pow(Math.min(1, l), 1.6)) * (0.78 + 0.22 * Math.max(0, Math.min(1, e.y + 0.5)))); });
    }
    return { trunk: tbGeo(Tr), crown: tbGeo(Cr) };
  }
  // 風のゆれ（幹と葉で同じ動き。高い所ほど大きい）
  const SWAY = '#ifdef USE_INSTANCING\n { vec4 tw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float k = position.y * position.y * 0.0011; transformed.x += sin(gT * 0.8 + tw.x * 0.07 + tw.z * 0.05) * k; transformed.z += cos(gT * 0.63 + tw.x * 0.04 + tw.z * 0.08) * k * 0.7; }\n#endif\n';
  function treeMat(leaf, map, amap) {
    const m = new T.MeshLambertMaterial(leaf ? { map, alphaMap: amap, alphaTest: 0.45, side: T.DoubleSide, vertexColors: true } : { map, vertexColors: true });
    m.customProgramCacheKey = () => (leaf ? 'treeLeaf' : 'treeBark');
    m.onBeforeCompile = (sh) => {
      sh.uniforms.gT = gTime;
      sh.vertexShader = 'uniform float gT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY + (leaf ? 'transformed += vec3(sin(gT * 2.6 + position.x * 1.7 + position.y * 1.3), 0.0, cos(gT * 2.2 + position.z * 1.9 + position.y)) * 0.03;\n' : ''));
      if (leaf) sh.fragmentShader = sh.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);') // 板の裏も表と同じ向きの光（裏だけ暗くならない）
        .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.rgb *= 0.5 + 0.5 * smoothstep(0.45, 0.95, diffuseColor.a);\n' /* 葉の縁（白い背景が少し混ざった所）を暗くして白く光らせない */ + (rd.capabilities.isWebGL2 ? ' { vec2 dd = max(abs(dFdx(vUv)), abs(dFdy(vUv))) * 512.0; diffuseColor.a *= 1.0 + max(0.0, log2(max(dd.x, dd.y))) * 0.35; }' : '')); // 遠くで葉がすけすけにならない
    };
    return m;
  }
  function plantTrees(id, pts) {
    for (const m of TT.objs) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose(); const k = trees.indexOf(m); if (k >= 0) trees.splice(k, 1); }
    TT.objs = []; TT.pts = [id, pts];
    if (!pts.length) return;
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); trees.push(m); TT.objs.push(m); };
    const o = new T.Object3D(), cc = new T.Color();
    if (!TT.ok) { // 0.65.0 これまでの木：杉（三段の円すい）と広葉樹（丸い葉）
      const pine = [], broad = [];
      pts.forEach((p, i) => ((i * 7 + Math.floor(p[2] * 10)) % 5 < 3 ? pine : broad).push(p));
      const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.26, 2.4, 6).translate(0, 1.2, 0), new T.MeshLambertMaterial({ color: 0x4a3420 }), pts.length);
      const pin1 = new T.InstancedMesh(new T.ConeGeometry(1.8, 3.2, 8).translate(0, 3.2, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const pin2 = new T.InstancedMesh(new T.ConeGeometry(1.35, 2.8, 8).translate(0, 4.6, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const pin3 = new T.InstancedMesh(new T.ConeGeometry(0.85, 2.2, 8).translate(0, 5.9, 0), new T.MeshLambertMaterial({ color: 0xffffff }), Math.max(1, pine.length));
      const blf = new T.InstancedMesh(new T.IcosahedronGeometry(1.9, 1).scale(1, 0.85, 1).translate(0, 3.6, 0), new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, broad.length));
      const blf2 = new T.InstancedMesh(new T.IcosahedronGeometry(1.3, 1).translate(0.9, 4.4, 0.4), new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, broad.length));
      let ti = 0;
      const place = (x, y, s, rot) => { o.position.set(x, hgt(x, y) - 0.1, y); o.scale.set(s, s * (0.9 + (s * 13 % 0.3)), s); o.rotation.set(0, rot, 0); o.updateMatrix(); };
      pine.forEach(([x, y, s], i) => { place(x, y, s, s * 9); trunk.setMatrixAt(ti++, o.matrix); for (const m of [pin1, pin2, pin3]) { m.setMatrixAt(i, o.matrix); m.setColorAt(i, cc.setHSL(0.3 + (s * 7 % 0.05), 0.42, 0.2 + (s * 11 % 0.06), T.SRGBColorSpace)); } });
      broad.forEach(([x, y, s], i) => { place(x, y, s, s * 9); trunk.setMatrixAt(ti++, o.matrix); for (const m of [blf, blf2]) { m.setMatrixAt(i, o.matrix); m.setColorAt(i, cc.setHSL(0.24 + (s * 5 % 0.06), 0.45, 0.26 + (s * 13 % 0.07), T.SRGBColorSpace)); } });
      pin1.count = pin2.count = pin3.count = pine.length; blf.count = blf2.count = broad.length;
      for (const m of [trunk, pin1, pin2, pin3, blf, blf2]) add(m);
      return;
    }
    // 戦場ごとに木の種類の割合と形を変える。種類は場所ごとにまとまる（杉の林・松の林…）
    const hid = String(id).split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0) & 0xffff, 7), r = rng(hid + 29), E = ter.find((t) => t.k === 'e') || {};
    const KD = [ // 海の近くは松林、山地の近くは杉が多い
      { mk: treeSugi, leaf: 'sugi', bark: 'sugi', w: 0.3 + r() * 0.45 + (E.mt || 0) * 0.5, tint: [0.42, 0.5, 0.4] }, // 写真の葉は明るいので、木の種類ごとに暗くする（杉はいちばん濃い）
      { mk: treePine, leaf: 'pine', bark: 'pine', w: (r() < 0.25 ? 0.55 : 0.08) + r() * 0.3 + (E.sea != null ? 0.8 : 0), tint: [0.55, 0.62, 0.48] },
      { mk: treeBroad, leaf: 'keyaki', bark: 'oak', w: 0.15 + r() * 0.35, tint: [0.48, 0.5, 0.4] },
      { mk: treeBroad, leaf: 'oak', bark: 'oak', w: 0.08 + r() * 0.3, tint: [0.48, 0.53, 0.42] },
    ];
    const NV = 3, grp = KD.map(() => [[], [], []]);
    pts.forEach(([x, y, s], i) => {
      let best = -1, bk = 0;
      KD.forEach((K, k) => { const v = K.w * (0.35 + 1.3 * vn(x * 0.03 + k * 37.1, y * 0.03 + k * 11.7)) * (0.8 + 0.4 * vh(i, k)); if (v > best) { best = v; bk = k; } });
      grp[bk][Math.floor(vh(i * 3.1, 9) * NV)].push([x, y, s, i]);
    });
    KD.forEach((K, k) => {
      const tm = treeMat(false, TT.tex[`bark_${K.bark}`]), lm = treeMat(true, TT.tex[`leaf_${K.leaf}_c`], TT.tex[`leaf_${K.leaf}_a`]);
      for (let v = 0; v < NV; v++) {
        const L = grp[k][v]; if (!L.length) continue;
        const g = K.mk(rng(hid * 7 + k * 101 + v * 13 + 1)), tI = new T.InstancedMesh(g.trunk, tm, L.length), cI = new T.InstancedMesh(g.crown, lm, L.length);
        L.forEach(([x, y, s, i], j) => {
          const sc = 0.72 + (s - 0.8) * 0.8, q = vh(i, 5);
          o.position.set(x, hgt(x, y) - 0.15, y); o.rotation.set(0, vh(i, 3) * 6.283, 0); o.scale.set(sc, sc * (0.9 + 0.2 * vh(i, 4)), sc); o.updateMatrix();
          tI.setMatrixAt(j, o.matrix); cI.setMatrixAt(j, o.matrix);
          const lv = 0.82 + 0.3 * q; cI.setColorAt(j, cc.setRGB(K.tint[0] * lv * (0.95 + 0.1 * vh(i, 6)), K.tint[1] * lv, K.tint[2] * lv * (0.92 + 0.12 * vh(i, 7))));
        });
        add(tI); add(cI);
      }
    });
  }

  const nwCov = (x, y) => { const o = [0, 0, 0, 0, 0, 0, 0]; let any = 0; for (const [dx, dy] of [[0, 0], [1.6, 0], [-1.6, 0], [0, 1.6], [0, -1.6]]) { const v = SGK.SIM.nawaAreaExact(NW, x + dx, y + dy); if (v) { o[v] += 0.2; any = 1; } } return any ? o : null; }; // 2.12.0 城の地面の割合（縁をぼかす）
  const water = (t, x, y) => { const d = Math.hypot(x - t.x, y - t.y); return !['f', 'h', 'e', 'c'].includes(t.k) && d < t.r; };

  // いくつかの形を1つにまとめる（部分ごとに色を付ける）
  function merge(list) {
    const pos = [], nor = [], col = [], c = new T.Color();
    for (const [g, hex] of list) { const ng = g.index ? g.toNonIndexed() : g; c.setHex(hex); pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); for (let k = 0; k < ng.attributes.position.count; k++) col.push(c.r, c.g, c.b); }
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); bg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return bg;
  }

  // 2.2.0 水：空と山が映り込む（戦場ごとに一度だけ周りの景色を写し取る）・さざ波が2重に流れる
  let mtnM = null;
  function waterMat(col, rep, op) {
    if (!wOff.value) wOff.value = new T.Vector4();
    if (!waterT.base) waterT.base = normalTex(256, tileNoise(256, 6, 4, 77), 9);
    const nt = waterT.base.clone(); nt.needsUpdate = true; nt.repeat.set(rep, rep); waterT.push(nt);
    const m = new T.MeshStandardMaterial({ color: col, roughness: 0.05, metalness: 0, normalMap: nt, normalScale: new T.Vector2(0.4, 0.4), envMap: envT, transparent: op < 1, opacity: op });
    m.onBeforeCompile = (sh) => { sh.uniforms.wO = wOff; sh.fragmentShader = 'uniform vec4 wO;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', 'vec3 mapN = (texture2D(normalMap, vUv + wO.xy).xyz + texture2D(normalMap, vUv * 1.63 + wO.zw).xyz) - 1.0; mapN.xy *= normalScale; normal = perturbNormal2Arb(-vViewPosition, normal, mapN, faceDirection);'); };
    return m;
  }
  function makeEnv(F) {
    const es = new T.Scene(); es.background = new T.Color(tod ? tod.haze : 0xcfdde6);
    scene.remove(sky); es.add(sky); sky.position.set(0, 0, 0);
    if (mtnM) { const m2 = new T.Mesh(mtnM.geometry, mtnM.material); m2.position.set(-F.w / 2, -3, -F.h / 2); es.add(m2); }
    const pm = new T.PMREMGenerator(rd); if (envT) envT.dispose(); envT = pm.fromScene(es, 0, 1, 3200).texture; pm.dispose();
    es.remove(sky); scene.add(sky);
    for (const t of trees) if (t.material && t.material.normalMap && waterT.includes(t.material.normalMap)) { t.material.envMap = envT; t.material.needsUpdate = true; }
    if (SGK.SOLD3D) { SGK.SOLD3D.env = envT; if (SGK.SOLD3D.ready) SGK.SOLD3D.setEnv(envT); } // 2.7.0 兵の具足に空を映す
  }

  // 1.6.64 地図に合わせた景色：遠くの山（その方角に山地があるとき）・海・川や堀の水面。見た目だけ
  function backdrop(id, F) {
    const E = ter.find((t) => t.k === 'e') || {}, cx = F.w / 2, cy = F.h / 2, r = rng(String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 41));
    const add = (m) => { scene.add(m); trees.push(m); return m; };
    if (NW) for (const m of NW.mw || []) if (m.L > 0.3) { /* 2.12.0 高い所の水堀には、その高さに水面を張る */
      const sh = m.s; let g = null;
      const toS = (pts) => { const S = new T.Shape(); for (let i = 0; i < pts.length; i += 2) (i ? S.lineTo(pts[i], -pts[i + 1]) : S.moveTo(pts[i], -pts[i + 1])); return S; };
      if (sh[0] === 'o') g = new T.RingGeometry(sh[4] || 0, sh[3], 48); else if (sh[0] === 'p') g = new T.ShapeGeometry(toS(sh.slice(1))); else if (sh[0] === 'P') { const S = toS(sh[1]); for (const hl of sh.slice(2)) S.holes.push(toS(hl)); g = new T.ShapeGeometry(S); }
      if (!g) continue; g.rotateX(-Math.PI / 2); if (sh[0] === 'o') g.translate(sh[1], 0, sh[2]);
      const wm = add(new T.Mesh(g, waterMat(0x1f5f86, 0.12, 0.86))); wm.position.y = m.L - 0.9; wm.receiveShadow = true;
    }
    if (ter.some((t) => t.k === 'w') || (NW && NW.hasM)) { const wm = add(new T.Mesh(new T.PlaneGeometry(F.w + 80, F.h + 80).rotateX(-Math.PI / 2).translate(cx, -0.9, cy) /* 2.6.4 -0.45 だと地面の小さなくぼみに水が透けていた */, waterMat(0x1f5f86, (F.w + 80) / 10, 0.86))); wm.receiveShadow = true; }
    if (E.sea != null) { const sm = add(new T.Mesh(new T.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), waterMat(0x234f6a, 4000 / 18, 1))); sm.position.set(cx + Math.cos(E.sea) * 2400, -0.2, cy + Math.sin(E.sea) * 2400); }
    const mm = add(new T.Mesh(mtnGeo(F, E, r), mtnMat())); mtnM = mm; mm.frustumCulled = false; mm.renderOrder = 0;
  }

  // 2.6.5 遠くの山：戦場をぐるりと囲む地形。円すいをやめ、尾根と谷のある山並みにした（地図で山地のある方角は高く・近く、
  // ほかの方角は手前に木の茂った低い丘と、奥に低い山並み）。海の方角は開ける。
  const PERM = new Uint8Array(512);
  function permSeed(seed) { const r = rng(seed), a = []; for (let i = 0; i < 256; i++) a.push(i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } for (let i = 0; i < 512; i++) PERM[i] = a[i & 255]; }
  function pn(x, y) { // なめらかな乱数（-1〜1 くらい）
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X0 = xi & 255, Y0 = yi & 255;
    const g = (h, dx, dy) => { switch (h & 7) { case 0: return dx + dy; case 1: return -dx + dy; case 2: return dx - dy; case 3: return -dx - dy; case 4: return dx; case 5: return -dx; case 6: return dy; default: return -dy; } };
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = g(PERM[PERM[X0] + Y0], xf, yf), b = g(PERM[PERM[X0 + 1] + Y0], xf - 1, yf), c = g(PERM[PERM[X0] + Y0 + 1], xf, yf - 1), d = g(PERM[PERM[X0 + 1] + Y0 + 1], xf - 1, yf - 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }
  function ridged(x, y, oct) { let s = 0, a = 0.5, w = 1; for (let o = 0; o < oct; o++) { let n = 1 - Math.abs(pn(x, y)); n *= n * w; w = Math.min(1, n * 2); s += n * a; x = x * 2.03 + 17.1; y = y * 2.03 - 5.3; a *= 0.5; } return s; } // 尾根（とがった筋）
  function pfbm(x, y, oct) { let s = 0, a = 0.5; for (let o = 0; o < oct; o++) { s += pn(x, y) * a; x = x * 2.1 + 3.7; y = y * 2.1 + 9.2; a *= 0.5; } return s; }
  function mtnGeo(F, E, r) {
    permSeed(Math.floor(r() * 60000) + 7); const ox = r() * 500, oz = r() * 500;
    const cx = F.w / 2, cy = F.h / 2, NA = 720, NS = 72, RMAX = 1480, mt = E.mtn || [], sea = E.sea;
    const ang = (d) => Math.atan2(Math.sin(d), Math.cos(d));
    const pos = new Float32Array(NA * NS * 3), hs = new Float32Array(NA * NS), ao = new Float32Array(NA * NS);
    for (let i = 0; i < NA; i++) {
      const th = i / NA * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th);
      const r0 = Math.min((F.w / 2 + 75) / Math.max(1e-3, Math.abs(ca)), (F.h / 2 + 75) / Math.max(1e-3, Math.abs(sa))); // 戦場の地面の外から始める
      // この方角の山の高さと近さ（いちばん強い山地）
      let am = 0, sp = 900;
      for (const [a, d] of mt) { const da = ang(th - a), k = Math.exp(-da * da / (2 * 0.3 * 0.3)) * (1.1 - d / 34); if (k > am) { am = k; sp = 180 + d * 34; } }
      am = Math.min(1, am) * (0.85 + 0.3 * (pfbm(th * 3 + ox, 1.3, 2) + 0.5));
      const open = sea != null ? 1 - Math.min(1, Math.max(0, (Math.cos(th - sea) - 0.3) / 0.4)) : 1; // 海の方は開ける
      const smax = RMAX - r0, fm = 0.25 + 0.95 * Math.min(1, Math.max(0, pfbm(th * 2.2 + oz, 4.1, 3) * 1.6 + 0.55)); // 手前の丘が途切れて奥まで見通せる方角も作る
      for (let j = 0; j < NS; j++) {
        const s = smax * Math.pow(j / (NS - 1), 1.55), R = r0 + s, x = cx + ca * R, z = cy + sa * R, X0 = (x + ox) / 1, Z0 = (z + oz) / 1;
        const rise = Math.min(1, s / 110), rs = rise * rise * (3 - 2 * rise);
        const foot = (10 + 30 * (pfbm(X0 / 140, Z0 / 140, 4) * 0.5 + 0.5) + 14 * ridged(X0 / 180, Z0 / 180, 4)) * rs * fm; // 手前の木の茂った丘
        const main = am * (150 + 190 * ridged(X0 / 330, Z0 / 330, 6)) * Math.min(1, Math.max(0, (s - sp + 420) / 420)) ** 1.5; // 山地のある方の高い山
        const back = (55 + 120 * ridged(X0 / 300 + 40, Z0 / 300, 5)) * Math.min(1, Math.max(0, (s - 640) / 330)); // 奥の山並み（どの方角にも）
        const bump = 2.5 * pn(X0 / 9, Z0 / 9) * rs * (s < 600 ? 1 : 0.4); // 木々の梢のでこぼこ
        let h = (foot + (Math.max(main, back * (0.55 + 0.45 * open)) + Math.min(main, back) * 0.25) * rs) * open + bump - 2.5 + 2.5 * rs; /* 手前の縁は必ず地面の高さから（浮くと下から空が見える） */
        if (open < 1) h -= (1 - open) * 12;
        const k = i * NS + j; hs[k] = h; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      }
    }
    // 谷は暗く・尾根は明るく（まわりより低い所ほど暗い）
    for (let i = 0; i < NA; i++) for (let j = 0; j < NS; j++) {
      const k = i * NS + j, a = hs[((i + 1) % NA) * NS + j] + hs[((i + NA - 1) % NA) * NS + j], b = hs[i * NS + Math.min(NS - 1, j + 1)] + hs[i * NS + Math.max(0, j - 1)];
      ao[k] = Math.min(1.15, Math.max(0.55, 1 + (hs[k] - (a + b) / 4) * 0.035));
    }
    const idx = [];
    for (let i = 0; i < NA; i++) for (let j = 0; j < NS - 1; j++) { const a = i * NS + j, b = ((i + 1) % NA) * NS + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('ao', new T.BufferAttribute(ao, 1)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function mtnMat() {
    const t = tod || TODS.day, C = (h) => new T.Color(h);
    return new T.ShaderMaterial({
      fog: false,
      uniforms: { sunD: { value: (t.v || new T.Vector3(...t.dir).normalize()).clone() }, sunC: { value: C(t.sun).multiplyScalar(t.si) }, skyC: { value: C(t.hs).multiplyScalar(t.hi) }, gndC: { value: C(t.hg).multiplyScalar(t.hi) },
        hor: { value: C(t.hor) }, top: { value: C(t.top) }, haze: { value: C(t.haze) } },
      vertexShader: 'attribute float ao; varying vec3 vW; varying vec3 vN; varying float vAo; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vAo = ao; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform vec3 sunD, sunC, skyC, gndC, hor, top, haze; varying vec3 vW; varying vec3 vN; varying float vAo;',
        'float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'void main(){',
        ' if (vW.y < -0.25) discard;', // 地面より下は描かない（戦場の外の地面を上から塗らない）
        ' vec3 N = normalize(vN); float d = distance(cameraPosition, vW), fd = 1.0 - smoothstep(350.0, 1300.0, d);',
        ' float n1 = ns(vW.xz * 0.004), n2 = ns(vW.xz * 0.017 + 3.1), c1 = ns(vW.xz * 0.16), c2 = ns(vW.xz * 0.47 + 7.0);',
        // 森の色：杉・檜の濃い緑と、広葉樹の明るい緑がまだらに。近い所は梢の粒が見える
        ' float mixB = smoothstep(0.35, 0.7, n1 * 0.6 + n2 * 0.4);', // 0＝杉・檜の多い所、1＝広葉樹の多い所
        ' vec3 cCon = vec3(0.022, 0.055, 0.016), cBro = vec3(0.05, 0.095, 0.02);',
        ' vec3 col = mix(cCon, cBro, mixB * 0.8);',
        ' col = mix(col, vec3(0.13, 0.11, 0.045), smoothstep(0.75, 0.92, n2) * 0.45);',
        ' col *= 0.85 + ((c1 * 0.6 + c2 * 0.4) - 0.5) * 0.5 * fd;',
        // 近い山は梢（木の丸い頭）を一つずつ：格子ごとにずらした点からの距離で丸を作り、日の当たる側を明るく、すき間を暗く。
        // 木ごとに大きさと色（杉の濃い緑・広葉樹の明るい緑）を変える
        ' { vec2 q = vW.xz / 2.8 + vec2(vW.y * 0.1, 0.0), qi = floor(q), qf = fract(q); float best = 9.0; vec2 bv = vec2(0.0), bc = vec2(0.0);',
        '   for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), o = vec2(hs(qi + g), hs(qi + g + 17.3)), v = g + o - qf; float dd = dot(v, v) / (0.55 + 0.9 * hs(qi + g + 5.1)); if (dd < best) { best = dd; bv = v; bc = qi + g; } }',
        '   float crown = 1.0 - smoothstep(0.2, 0.75, best), lit = clamp(0.5 - dot(normalize(bv + 1e-4), normalize(sunD.xz + 1e-4)) * 0.5 * sqrt(clamp(best * 2.5, 0.0, 1.0)), 0.0, 1.0);',
        '   float k = smoothstep(1500.0, 450.0, d) * smoothstep(-0.2, 0.3, N.y), sp = hs(bc + 9.7);',
        '   vec3 tc = mix(cCon, cBro, step(1.0 - mixB * 0.85 - 0.1, sp) * 0.7) * (0.9 + 0.2 * hs(bc + 2.3));',
        '   col = mix(col, tc, k * 0.6) * mix(1.0, (0.5 + 0.5 * crown) * (0.86 + 0.28 * lit), k); }',
        // 高く急な所は岩肌、ふもとは草地
        ' float sl = 1.0 - N.y; col = mix(col, vec3(0.2, 0.19, 0.17) * (0.8 + 0.4 * c1), smoothstep(0.45, 0.7, sl + (n2 - 0.5) * 0.3) * smoothstep(120.0, 260.0, vW.y));',
        ' col = mix(col, vec3(0.11, 0.13, 0.05), (1.0 - smoothstep(0.5, 3.0, vW.y)) * 0.6);',
        ' float df = max(dot(N, sunD), 0.0); vec3 amb = mix(gndC, skyC, N.y * 0.5 + 0.5);',
        ' col *= (sunC * df * 1.25 + amb * 0.45) * vAo * vAo;',
        // 遠いほど空の色にかすむ（遠い山は青く）。谷や低い所には霧
        ' vec3 V = normalize(vW - cameraPosition); float sv = pow(max(dot(V, sunD), 0.0), 6.0);',
        ' vec3 hz = mix(hor, mix(hor, top, 0.35), smoothstep(500.0, 1500.0, d)) + sunC * sv * 0.12;',
        ' float f = 1.0 - exp(-d / 2300.0) + smoothstep(800.0, 1750.0, d) * 0.3;',
        ' float mist = (1.0 - smoothstep(6.0, 60.0, vW.y)) * smoothstep(600.0, 1300.0, d) * 0.22;',
        ' col = mix(col, hz, clamp(f + mist * (1.0 - f), 0.0, 0.82));',
        ' gl_FragColor = vec4(col, 1.0);',
        ' #include <tonemapping_fragment>',
        ' #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
  }

  // 2.1.0 時刻（戦場ごとに朝・昼・夕のどれか。昼が多い）で太陽・空・かすみの色を変える
  const TODS = {
    day: { dir: [-0.45, 0.82, 0.32], sun: 0xfff1d8, si: 1.25, hs: 0xcfe3f7, hg: 0x5a603a, hi: 0.62, top: 0x3d7ac4, hor: 0xd3e2ec, haze: 0xcbdbe6, ex: 1.0 },
    morning: { dir: [0.85, 0.4, -0.3], sun: 0xffd2a0, si: 1.15, hs: 0xc6d6ec, hg: 0x4f5634, hi: 0.58, top: 0x5487c8, hor: 0xf0dccb, haze: 0xdcd6d0, ex: 1.0 },
    evening: { dir: [-0.85, 0.3, 0.35], sun: 0xffa866, si: 1.2, hs: 0xd6c2bc, hg: 0x4a4630, hi: 0.55, top: 0x46679f, hor: 0xf2b98a, haze: 0xd8b8a0, ex: 1.05 },
  };
  function setTod(id) {
    const r = rng(String(id).split('').reduce((a, ch) => a + ch.charCodeAt(0) * 7, 13))(), k = r < 0.6 ? 'day' : r < 0.8 ? 'morning' : 'evening';
    tod = TODS[k]; tod.v = new T.Vector3(...tod.dir).normalize();
    sun.color.set(tod.sun); sun.intensity = tod.si; hemi.color.set(tod.hs); hemi.groundColor.set(tod.hg); hemi.intensity = tod.hi;
    const U = sky.material.uniforms; U.top.value.set(tod.top); U.hor.value.set(tod.hor); U.sunC.value.set(tod.sun); U.sunD.value.copy(tod.v);
    scene.background = new T.Color(tod.haze); scene.fog = new T.Fog(tod.haze, 170, 850); rd.toneMappingExposure = tod.ex;
  }

  // ---- 戦場ごとの地面と木 ----
  function build(id, list) {
    built = id; ter = list || []; NW = SGK.SIM.nawa ? SGK.SIM.nawa(ter) : null; setTod(id); hills = ter.filter((t) => t.k === 'h').map((t) => ({ x: t.x, y: t.y, r: t.r * 1.15, hh: Math.min(14, t.r * 0.16) }));
    if (groundM) { scene.remove(groundM); groundG.dispose(); groundM.material.dispose(); }
    for (const t of trees) { scene.remove(t); t.geometry.dispose(); if (t.material) t.material.dispose(); if (t.dispose) t.dispose(); }
    trees = [];
    const F = SIM.FIELD;
    groundG = new T.PlaneGeometry(F.w + 80, F.h + 80, 190, 130).rotateX(-Math.PI / 2).translate(F.w / 2, 0, F.h / 2);
    const P = groundG.attributes.position, col = new Float32Array(P.count * 3), c = new T.Color(), r = rng(7);
    // 2.6.4 写真の模様の割合：spA＝枯れ草・落ち葉・踏み固めた土・岩まじりの土、spB＝ぬかるみ・川底。tint＝模様に掛ける色（ふつうは白）
    const spA = new Float32Array(P.count * 4), spB = new Float32Array(P.count * 2), tint = new Float32Array(P.count * 3), tc = new T.Color();
    const sm = (a, b, v) => { const q = Math.min(1, Math.max(0, (v - a) / (b - a))); return q * q * (3 - 2 * q); }, up = (a, k, v) => { a[k] = Math.max(a[k], v); };
    const GC = { g: new T.Color(0x7e9450), dry: new T.Color(0xa3a05e), lush: new T.Color(0x5c7d38), dirt: new T.Color(0x8c7652) };
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getZ(i); P.setY(i, hgt(x, y));
      tc.setRGB(1, 1, 1); const a4 = i * 4, b2 = i * 2;
      for (const t of ter) {
        const d = Math.hypot(x - t.x, y - t.y);
        if (t.k === 'f') { const dd = d * (0.6 + 0.8 * vn(x * 0.05, y * 0.05)); up(spA, a4 + 1, 0.75 * (1 - sm(t.r * 0.45, t.r * 1.05, dd))); } /* 2.12.0 落ち葉の縁はぼかしてぎざぎざに */
        else if (t.k === 'h') up(spA, a4, 0.7 * (1 - sm(t.r * 0.3, t.r * 1.2, d)));
        else if (t.k === 'w' && d < t.r + 6) { if (d < t.r - 1) { up(spB, b2 + 1, 1); tc.setRGB(0.5, 0.72, 0.98); } else up(spB, b2, 1 - sm(t.r + 2, t.r + 6, d)); }
        else if (!['f', 'h', 'e', 'w', 'c'].includes(t.k) && d < t.r + 3) { if (d < t.r) { up(spB, b2 + 1, 1); tc.setRGB(0.5, 0.72, 0.98); } else up(spB, b2, 0.9); }
      }
      const na = NW ? nwCov(x, y) : null; /* 2.12.0 城の地面（パーツから）：水堀・土橋・曲輪・空堀・斜面 */
      if (na) { if (na[2] > 0.5) { up(spB, b2 + 1, 1); tc.setRGB(0.5, 0.72, 0.98); } else if (na[2] > 0) up(spB, b2, 0.9); if (na[5] || na[1] || na[6]) up(spA, a4 + 2, Math.max(na[5], na[1], na[6])); if (na[3]) up(spA, a4 + 3, 0.8 * na[3]); if (na[4]) { up(spA, a4 + 3, 0.4 * na[4]); up(spA, a4, 0.5 * na[4]); } }
      // 2.1.0 草地に色むら：枯れ草・土の出た所・濃い草
      c.copy(GC.g); const dr = fbm(x * 0.018, y * 0.018), dt2 = vn(x * 0.07 + 50, y * 0.07 + 9), lu = fbm(x * 0.05 + 30, y * 0.05 + 70);
      if (dr > 0.56) c.lerp(GC.dry, Math.min(0.8, (dr - 0.56) * 3));
      if (lu < 0.36) c.lerp(GC.lush, Math.min(0.7, (0.36 - lu) * 4));
      if (dt2 > 0.74) c.lerp(GC.dirt, Math.min(0.75, (dt2 - 0.74) * 4));
      for (const t of ter) {
        const d = Math.hypot(x - t.x, y - t.y);
        if (t.k === 'f' && d < t.r * 1.2) { const dd = d * (0.6 + 0.8 * vn(x * 0.05, y * 0.05)); if (dd < t.r) c.lerp(new T.Color(0x4f6c34), 0.45 * (1 - sm(t.r * 0.4, t.r, dd))); }
        else if (t.k === 'h' && d < t.r * 1.15) c.lerp(new T.Color(0xa49866), 0.55 * (1 - d / (t.r * 1.15)) + 0.2);
        else if (t.k === 'w' && d < t.r + 3) c.lerp(new T.Color(d < t.r ? 0x2c5f8a : 0x8a7a52), 0.85); /* 1.6.64 川底と岸（1.6.70 川底を青に） */
        else if (!['f', 'h', 'e', 'w', 'c'].includes(t.k) && d < t.r) c.setHex(0x2f78bf);
      }
      if (na) { if (na[1]) c.lerp(new T.Color(0xb9a57c), na[1]); if (na[3]) c.lerp(new T.Color(0x8a7a52), 0.6 * na[3]); if (na[4]) c.lerp(new T.Color(0x7d8a4c), 0.35 * na[4]); if (na[5]) c.lerp(new T.Color(0x9a8660), na[5]); if (na[6]) c.lerp(new T.Color(0x9c8a64), 0.8 * na[6]); if (na[2]) c.lerp(new T.Color(0x2f78bf), na[2]); }
      if (x < 0 || y < 0 || x > F.w || y > F.h) c.multiplyScalar(0.85);
      const n = (0.96 + r() * 0.06) * (0.9 + 0.2 * fbm(x * 0.04 + 7, y * 0.04 + 3)); col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n; // 0.65.0 広いまだら模様（0.68.1 色を入れる文がコメントの中に入って地面が黒くなっていたのを直した）
      const o = x < 0 || y < 0 || x > F.w || y > F.h ? 0.9 : 1; tint[i * 3] = tc.r * o; tint[i * 3 + 1] = tc.g * o; tint[i * 3 + 2] = tc.b * o;
    }
    groundG.setAttribute('color', new T.BufferAttribute(col, 3)); groundG.computeVertexNormals();
    { const N = groundG.attributes.normal; for (let i = 0; i < P.count; i++) up(spA, i * 4 + 3, 0.8 * sm(0.9, 0.74, N.getY(i))); } /* 急な斜面は岩まじりの土 */
    groundG.setAttribute('spA', new T.BufferAttribute(spA, 4)); groundG.setAttribute('spB', new T.BufferAttribute(spB, 2)); groundG.userData.tint = new T.BufferAttribute(tint, 3);
    if (!texG) { texG = groundTex(); texG.repeat.set((F.w + 80) / 7, (F.h + 80) / 7); }
    if (!texMacro) texMacro = macroTex();
    if (!texGN) { texGN = groundNormal(texG.image); texGN.repeat.copy(texG.repeat); }
    const gmat = new T.MeshStandardMaterial({ vertexColors: true, map: texG, normalMap: texGN, normalScale: new T.Vector2(0.9, 0.9), roughness: 0.93, metalness: 0 }); /* 2.2.0 凹凸のある地面 */
    gmat.onBeforeCompile = (sh) => { sh.uniforms.mT = { value: texMacro }; sh.fragmentShader = 'uniform sampler2D mT;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(0.8, 1.14, texture2D(mT, vUv * 0.083).r) * mix(0.9, 1.08, texture2D(mT, vUv * 0.019 + 0.37).g);'); };
    groundM = new T.Mesh(groundG, gmat); groundM.receiveShadow = true; scene.add(groundM);
    if (GT.ok) useGroundTex();
    for (const t of waterT.splice(0)) t.dispose(); mtnM = null;
    backdrop(id, F); makeEnv(F);
    // 森の木
    const pts = []; for (const F of SIM.treePts ? SIM.treePts(id, ter) : []) for (const p of F.p) pts.push(p); /* 2.12.0 木の生え方は action.js と同じ（幹の当たり判定と合う） */
    TT.objs = []; plantTrees(id, pts);
    // 0.65.0 草むらと石（戦場の中に散らす。水・曲輪の中には置かない）
    if (!texGrass) texGrass = grassTex();
    const NG = 150000, /* 2.2.0 草を増やした（27000→150000） */ grass = new T.InstancedMesh((() => { const g1 = new T.PlaneGeometry(0.9, 0.55).translate(0, 0.27, 0), g2 = g1.clone().rotateY(Math.PI / 3), g3 = g1.clone().rotateY(-Math.PI / 3); const pos = [], uv = [], nor = []; for (const g of [g1, g2, g3]) { const ng = g.toNonIndexed(); pos.push(...ng.attributes.position.array); uv.push(...ng.attributes.uv.array); for (let k = 0; k < ng.attributes.position.count; k++) nor.push(0, 1, 0); } const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); return bg; })(),
      grassMat(), NG);
    const rocks = new T.InstancedMesh(new T.DodecahedronGeometry(0.45, 0).scale(1, 0.6, 1), new T.MeshLambertMaterial({ color: 0x8a877c, flatShading: true }), 260);
    const o2 = new T.Object3D(), c2 = new T.Color(), rg = rng(String(id).length * 31 + 17);
    let gi = 0, ri = 0;
    for (let tries = 0; tries < NG * 2 && gi < NG; tries++) {
      const x = -30 + rg() * (F.w + 60), y = -30 + rg() * (F.h + 60);
      if (ter.some((t) => water(t, x, y)) || (NW && (SGK.SIM.nawaArea(NW, x, y) || SGK.SIM.nawaWallCell(NW, x, y)))) continue; /* 2.12.0 城の中・堀・塀の下には草を生やさない */
      const inF = ter.some((t) => t.k === 'f' && Math.hypot(x - t.x, y - t.y) < t.r);
      const s = 0.7 + rg() * 0.9;
      o2.position.set(x, hgt(x, y) - 0.03, y); o2.rotation.set(0, rg() * 6.28, 0); o2.scale.set(s, s * (0.8 + rg() * 0.6), s); o2.updateMatrix();
      grass.setMatrixAt(gi, o2.matrix); grass.setColorAt(gi, c2.setHSL(0.2 + rg() * 0.07, 0.45, (inF ? 0.22 : 0.3) + rg() * 0.1, T.SRGBColorSpace)); gi++;
      if (ri < 260 && rg() < 0.018) { o2.scale.set(0.5 + rg() * 1.4, 0.5 + rg(), 0.5 + rg() * 1.2); o2.rotation.set(rg(), rg() * 6.28, 0); o2.position.y = hgt(x, y) + 0.05; o2.updateMatrix(); rocks.setMatrixAt(ri++, o2.matrix); }
    }
    grassM = grass; grass.userData.full = gi; X.applyVid(); rocks.count = ri; rocks.castShadow = true; rocks.receiveShadow = true; grass.receiveShadow = false;
    scene.add(grass, rocks); trees.push(grass, rocks);
    // 1.6.25 攻城戦：塀・門・櫓・天守（2.12.0 城のパーツ（nawa.js）から作る。当たり判定と同じ形）
    const segs = [];
    if (NW) for (const sg of NW.segs) { const n = Math.max(1, Math.round(sg.len / 4)), sl = sg.len / n, ro = -Math.atan2(sg.uy, sg.ux); for (let i = 0; i < n; i++) { const t = (i + 0.5) * sl; segs.push([sg.x1 + sg.ux * t, sg.y1 + sg.uy * t, ro, sl, sg.st]); } }
    { /* 1.6.38 塀（2.12.0 造りは3通り：i 石垣2m＋土塀1.8m＋瓦・d 土塁＋土塀・k 木の柵）。土塀には狭間（四角い窓）を並べる */
      const KIND = { i: { bh: 2.0, bw: 1.6, bc: 0x7d786c, wall: 1 }, d: { bh: 1.5, bw: 3.4, bc: 0x5f6440, wall: 1 }, k: { bh: 0, bw: 0, bc: 0, wall: 0 } };
      for (const kd of ['i', 'd', 'k']) {
        const L = segs.filter((q) => (q[4] || 'i') === kd); if (!L.length) continue; const K = KIND[kd], N = L.length, ms = [], o3 = new T.Object3D();
        const mk = (g, c, n) => { const m = new T.InstancedMesh(g, new T.MeshLambertMaterial({ color: c }), n); ms.push(m); return m; };
        if (kd === 'k') { // 柵：板を立て並べ、上に横木
          const pl = mk(new T.BoxGeometry(1, 2.3, 0.16), 0x5b4630, N), rl = mk(new T.BoxGeometry(1, 0.14, 0.24), 0x3e2f20, N * 2);
          L.forEach(([x, y, r, l], k) => { const g = hgt(x, y); o3.rotation.set(0, r, 0); o3.scale.set(l * 1.01, 1, 1); o3.position.set(x, g + 1.05, y); o3.updateMatrix(); pl.setMatrixAt(k, o3.matrix); for (const [j, hh] of [[0, 1.9], [1, 0.8]]) { o3.position.set(x, g + hh, y); o3.updateMatrix(); rl.setMatrixAt(k * 2 + j, o3.matrix); } });
        } else {
          const stone = mk(new T.BoxGeometry(1, K.bh, K.bw), K.bc, N), wallM = mk(new T.BoxGeometry(1, 1.8, 0.5), 0xece6d6, N), roofM = mk(new T.BoxGeometry(1, 0.22, 1.0), 0x3a3f46, N), winM = mk(new T.BoxGeometry(0.32, 0.32, 0.56), 0x1c1712, N * 2);
          L.forEach(([x, y, r, l], k) => {
            const g = hgt(x, y); o3.rotation.set(0, r, 0); o3.scale.set(l * 1.02, 1, 1);
            o3.position.set(x, g + K.bh / 2 - 0.1, y); o3.updateMatrix(); stone.setMatrixAt(k, o3.matrix);
            o3.position.set(x, g + K.bh + 0.8, y); o3.updateMatrix(); wallM.setMatrixAt(k, o3.matrix);
            o3.position.set(x, g + K.bh + 1.78, y); o3.updateMatrix(); roofM.setMatrixAt(k, o3.matrix);
            o3.scale.set(1, 1, 1); for (const j of [-0.25, 0.25]) { o3.position.set(x + Math.cos(r) * l * j, g + K.bh + 0.75 + (j > 0 ? 0 : 0.3), y - Math.sin(r) * l * j); o3.updateMatrix(); winM.setMatrixAt(k * 2 + (j > 0 ? 1 : 0), o3.matrix); }
          });
        }
        for (const m of ms) { m.castShadow = true; m.receiveShadow = true; scene.add(m); trees.push(m); }
      }
    }
    /* 1.6.38 門：櫓門（門の上に櫓）と扉。扉は破られたら消える。外の塀の角には隅櫓 */
    gateM = [];
    const mat = (c) => new T.MeshLambertMaterial({ color: c }), addM = (m) => { m.castShadow = m.receiveShadow = true; scene.add(m); trees.push(m); return m; };
    for (const gp of SGK.SIM.gatePts(NW)) {
      const g = hgt(gp.x, gp.y), ry = -gp.a, wd = gp.w + 1.2;
      const tw = addM(new T.Mesh(new T.BoxGeometry(2.2, 2.4, wd + 2.4), mat(0xece6d6))); tw.position.set(gp.x, g + 4.7, gp.y); tw.rotation.y = ry;
      const rf = addM(new T.Mesh(new T.BoxGeometry(3.2, 0.5, wd + 3.4), mat(0x3a3f46))); rf.position.set(gp.x, g + 6.1, gp.y); rf.rotation.y = ry;
      for (const sd of [-1, 1]) { const pl = addM(new T.Mesh(new T.BoxGeometry(1.4, 3.6, 1.0), mat(0x7d786c))); pl.position.set(gp.x - Math.sin(gp.a) * sd * (gp.w / 2 + 0.6), g + 1.8, gp.y + Math.cos(gp.a) * sd * (gp.w / 2 + 0.6)); pl.rotation.y = ry; }
      const dr = addM(new T.Mesh(new T.BoxGeometry(0.4, 3.5, gp.w), mat(0x4a3424))); dr.position.set(gp.x, g + 1.75, gp.y); dr.rotation.y = ry; dr.userData.gid = gp.id; gateM.push(dr);
    }
    for (const tw of NW ? NW.towers : []) if (tw[0] === 'y') { /* 隅櫓 */
      const x = tw[1], y = tw[2], g = hgt(x, y);
      const bs = addM(new T.Mesh(new T.BoxGeometry(6, 2.2, 6), mat(0x7d786c))); bs.position.set(x, g + 1.1, y);
      const bd = addM(new T.Mesh(new T.BoxGeometry(4.6, 3.4, 4.6), mat(0xece6d6))); bd.position.set(x, g + 3.9, y);
      const rf = addM(new T.Mesh(new T.ConeGeometry(4.2, 1.6, 4).rotateY(Math.PI / 4), mat(0x3a3f46))); rf.position.set(x, g + 6.4, y);
    }
    for (const tw of NW ? NW.towers : []) if (tw[0] === 'T') { /* 天守 */
      const tx = tw[1], ty = tw[2], g0 = hgt(tx, ty);
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
    if (TR[t] && TR[t].wk) return TR[t].wk; // 2.17.0 名物兵
    if (t === 'take' || t === 'shiyori' || t === 'takegashira') return 'waki';
    if (t === 'yumi' || t === 'tsuyoyumi' || t === 'yumigashira' || t === 'banditBow') return 'bow'; /* 1.6.67 野盗の弓 */ if (t === 'teppo' || t === 'teppogashira') return 'gun';
    if (t === 'nagayari' || t === 'yarigashira') return 'spearL'; if (t === 'bandit') return 'sword';
    return 'spearS';
  }

  // ---- 1.6.65 兵の人型モデル（t1〜t4・馬・武器。js/soldier3d.js でまとめて描く）----
  // 近くの兵はモデル、遠く（LOD m より先）はこれまでの簡単な形。読み込めないときもこれまでの形
  // 2.2.0 画面の仕上げ（PC向け）：物陰の暗さ（SSAO）・光のにじみ（ブルーム）・色調・周辺を少し暗く
  let PP = null;
  function ppMake() {
    const VS = 'varying vec2 vU; void main(){ vU = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const sm = (u, fs) => new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    const qs = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2)); quad.frustumCulled = false; qs.add(quad);
    const ao = sm({ tD: { value: null }, pInv: { value: new T.Matrix4() }, p11: { value: 1 }, asp: { value: 1 } }, [
      'uniform sampler2D tD; uniform mat4 pInv; uniform float p11; uniform float asp; varying vec2 vU;',
      'vec3 vp(vec2 u){ float d = texture2D(tD, u).x; vec4 p = pInv * vec4(vec3(u, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }',
      'void main(){ float d = texture2D(tD, vU).x; if (d >= 1.0) { gl_FragColor = vec4(1.0, 9999.0, 0.0, 1.0); return; }',
      ' vec3 P = vp(vU), N = normalize(cross(dFdx(P), dFdy(P))); float z = -P.z, R = 1.3, rs = min(0.08, R * p11 / z * 0.5);',
      ' float an = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2832, o = 0.0;',
      ' for (int i = 0; i < 14; i++) { float f = (float(i) + 0.5) / 14.0, a = an + f * 18.85; vec2 off = vec2(cos(a) / asp, sin(a)) * rs * f;',
      '  vec3 v = vp(vU + off) - P; float vv = dot(v, v); o += max(0.0, 1.0 - vv / (R * R)) * max(0.0, dot(v, N) * inversesqrt(vv + 1e-4) - 0.12); }',
      ' float k = clamp(1.0 - o / 14.0 * 2.2, 0.0, 1.0); k = mix(k, 1.0, smoothstep(120.0, 220.0, z));',
      ' gl_FragColor = vec4(k, z, 0.0, 1.0); }'].join('\n'));
    const bright = sm({ tC: { value: null } }, 'uniform sampler2D tC; varying vec2 vU; void main(){ vec3 c = texture2D(tC, vU).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); gl_FragColor = vec4(c * smoothstep(0.9, 1.8, l), 1.0); }');
    const blur = sm({ tC: { value: null }, dir: { value: new T.Vector2() } }, 'uniform sampler2D tC; uniform vec2 dir; varying vec2 vU; void main(){ vec3 c = texture2D(tC, vU).rgb * 0.2270; c += (texture2D(tC, vU + dir * 1.3846).rgb + texture2D(tC, vU - dir * 1.3846).rgb) * 0.3162; c += (texture2D(tC, vU + dir * 3.2308).rgb + texture2D(tC, vU - dir * 3.2308).rgb) * 0.0703; gl_FragColor = vec4(c, 1.0); }');
    const comp = sm({ tC: { value: null }, tA: { value: null }, tB1: { value: null }, tB2: { value: null }, aPx: { value: new T.Vector2() } }, [
      'uniform sampler2D tC; uniform sampler2D tA; uniform sampler2D tB1; uniform sampler2D tB2; uniform vec2 aPx; varying vec2 vU;',
      'void main(){ vec3 c = texture2D(tC, vU).rgb; float z0 = texture2D(tA, vU).y, s = 0.0, w = 0.0;',
      ' for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) { vec2 a = texture2D(tA, vU + vec2(float(x), float(y)) * aPx).xy; float ww = 1.0 / (1.0 + abs(a.y - z0) * 3.0); s += a.x * ww; w += ww; }',
      ' c *= s / w; c += texture2D(tB1, vU).rgb * 0.35 + texture2D(tB2, vU).rgb * 0.45;',
      ' float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, 1.12); vec2 q = vU - 0.5; c *= 1.0 - dot(q, q) * 0.5;',
      ' gl_FragColor = vec4(c, 1.0);', ' #include <tonemapping_fragment>', ' #include <encodings_fragment>', '}'].join('\n'));
    return { qs, quad, qc: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), ao, bright, blur, comp, w: 0, h: 0, ok: true };
  }
  function ppSize(w, h) {
    for (const k of ['rt', 'a', 'b1', 'b1b', 'b2', 'b2b']) if (PP[k]) PP[k].dispose();
    const hf = { type: T.HalfFloatType, depthBuffer: false };
    PP.rt = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, samples: 4 }); PP.rt.depthTexture = new T.DepthTexture(w, h, T.UnsignedIntType);
    PP.a = new T.WebGLRenderTarget(Math.ceil(w / 2), Math.ceil(h / 2), hf);
    PP.b1 = new T.WebGLRenderTarget(Math.ceil(w / 4), Math.ceil(h / 4), hf); PP.b1b = PP.b1.clone();
    PP.b2 = new T.WebGLRenderTarget(Math.ceil(w / 8), Math.ceil(h / 8), hf); PP.b2b = PP.b2.clone();
    PP.w = w; PP.h = h;
  }
  function ppRender() {
    if (!rd.capabilities.isWebGL2) return false;
    if (!PP) PP = ppMake(); if (!PP.ok) return false;
    const pr = rd.getPixelRatio(), w = Math.max(1, Math.floor(W * pr)), h = Math.max(1, Math.floor(H * pr));
    if (PP.w !== w || PP.h !== h) ppSize(w, h);
    const pass = (m, tg) => { PP.quad.material = m; rd.setRenderTarget(tg); rd.render(PP.qs, PP.qc); };
    rd.setRenderTarget(PP.rt); rd.render(scene, cam3);
    const A = PP.ao.uniforms; A.tD.value = PP.rt.depthTexture; A.pInv.value.copy(cam3.projectionMatrixInverse); A.p11.value = cam3.projectionMatrix.elements[5]; A.asp.value = w / h; pass(PP.ao, PP.a);
    PP.bright.uniforms.tC.value = PP.rt.texture; pass(PP.bright, PP.b1);
    const B = PP.blur.uniforms, bl = (src, dst, dx, dy) => { B.tC.value = src.texture; B.dir.value.set(dx / src.width, dy / src.height); pass(PP.blur, dst); };
    bl(PP.b1, PP.b1b, 1, 0); bl(PP.b1b, PP.b1, 0, 1); bl(PP.b1, PP.b2, 1, 0); bl(PP.b2, PP.b2b, 0, 1); bl(PP.b2b, PP.b2, 1, 0); bl(PP.b2, PP.b2b, 0, 1);
    const C3 = PP.comp.uniforms; C3.tC.value = PP.rt.texture; C3.tA.value = PP.a.texture; C3.tB1.value = PP.b1.texture; C3.tB2.value = PP.b2b.texture; C3.aPx.value.set(1 / PP.a.width, 1 / PP.a.height);
    pass(PP.comp, null);
    return true;
  }

  const LOD2 = 400 * 400, /* 2.2.0 人型で描く距離 180m→400m */ DEADN = 120;
  let SK90 = null, Mh = null, Mw = null, Ms = null, Mc = null, Mcw = null;
  // 2.17.0 名物兵の飾り：頭・胸の位置（人型モデルは骨の位置、遠くの簡単な形は決まった高さ）に、体の向きのまま付ける
  const PART_AT = { kuwa: 'h', tsuno: 'h', katou: 'h', kasa2: 'h', hane: 'h', hachi: 'h', mempo: 'h', uma: 'r' };
  const PART_COL = { katou: 0xece8dc, oosode: 0x333333, baori: 0x333333, kasa2: 0xc9b47a, hane: 0xf2efe6, hachi: 0xe8e0cc, mempo: 0x2a2622, sashi: 0xe8dcc0, uma: 0x6b4a2c };
  let Vh = null, Vb = null, Mp = null, Cp = null, Mhd = null, Mbk = null, Mt = null, Mt2 = null, Qa = null, Qb = null, Pa = null, Sa = null, SK90i = null;
  const lookOf = (s) => !s.hero && s.type && TR[s.type] && TR[s.type].look;
  // 骨（頭・胸）の行列：位置は骨の位置、向きは「立っている時からどれだけ回ったか」を体の向きに足す（しゃがむ・前かがみに付いていく）
  function boneMat(b, name, row, cw, out) {
    const a = b && b.att[name]; if (!a) return null;
    if (!Mt) { Mt = new T.Matrix4(); Mt2 = new T.Matrix4(); Qa = new T.Quaternion(); Qb = new T.Quaternion(); Pa = new T.Vector3(); Sa = new T.Vector3(); SK90i = SK90.clone().invert(); }
    Mt.fromArray(a, b.rows.idle.r0 * 16).decompose(Pa, Qb, Sa); Mt.fromArray(a, row * 16).decompose(Pa, Qa, Sa);
    out.makeRotationFromQuaternion(Qa.multiply(Qb.invert())).setPosition(Pa); if (cw) out.premultiply(cw);
    return out.premultiply(Mx).multiply(SK90i);
  }
  function putLook(LK, head, back, root) { // head・back・root：飾りを置く行列（体の向き・前が +X）
    if (!Mp) { Mp = new T.Matrix4(); Cp = new T.Color(); }
    for (const [nm, col] of LK.parts || []) { const at = PART_AT[nm], c = col || PART_COL[nm]; if (at === 'r' && !root) continue; put('p_' + nm, at === 'h' ? head : at === 'r' ? root : back, c != null ? Cp.set(c) : undefined); }
  }
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
    let c, up = 0, fw = 0;
    if (cav) { // 馬に乗る：馬の背に座った姿勢で
      const hb = S3.horses[s.hero || s.type === 'horo' ? 'white' : (lookOf(s) && lookOf(s).horse) || 'brown'];
      const hh = s.hh != null ? s.hh : null; if (hh != null) { O.rotation.set(0, -hh, 0); O.updateMatrix(); } /* 1.6.76 馬は馬の向き、乗り手は狙う方へ少しひねる */
      Mx.copy(O.matrix).multiply(SK90).multiply(Ms.makeScale(S3.hk, S3.hk, S3.hk));
      const hr = S3.rowAt(hb, mv < 0.6 ? 'idle' : mv < 6 ? 'walk' : 'gallop', ph, true); S3.put(hb, Mx, hr, 0);
      up = S3.seat - b.hipSit * sc;
      const HB = hb.att.Back; if (HB) { const i0 = hb.rows.idle.r0 * 16; up += (HB[hr * 16 + 13] - HB[i0 + 13]) * S3.hk; fw = (HB[hr * 16 + 14] - HB[i0 + 14]) * S3.hk; } /* 1.6.71 馬の背の揺れに合わせて乗り手も上下・前後に動く */
      const ride = { nm: 'ride', t: 0, loop: false }, ca = skClip(s, wk, mv, nowS, ph);
      c = ca.atk ? Object.assign({}, ca, { low: ride }) : ride; // 馬の上でも上半身は攻撃する
      if (hh != null) { let d = f - hh; d = Math.atan2(Math.sin(d), Math.cos(d)); O.rotation.set(0, -(hh + d * 0.6), 0); O.updateMatrix(); }
    } else c = skClip(s, wk, mv, nowS, ph);
    Mu.copy(O.matrix); Mu.elements[13] += up; if (fw) Mu.multiply(Ms.makeTranslation(Math.max(-0.3, Math.min(0.3, fw)), 0, 0)); // 体の位置（前が +X）。指物などはこれに付ける
    Mx.copy(Mu).multiply(SK90); if (sc !== 1) Mx.multiply(Ms.makeScale(sc, sc, sc));
    const row = S3.rowAt(b, c.nm, c.t, c.loop), rowL = c.low ? S3.rowAt(b, c.low.nm, c.low.t, c.low.loop) : row;
    if (c.low) S3.combo(b, rowL, row, Mc, Mcw);
    S3.put(b, Mx, rowL, s.fl ? 0.22 * Math.min(1, s.fl / 0.15) : 0, c.low ? row : null, c.low ? Mc : null, skTint); // 1.6.68 （2.12.5 skTint＝服の色） 打たれた光りを控えめに（0.6→0.22）
    // 武器を手に持たせる（弓は左手）
    const wn = (lookOf(s) && lookOf(s).wn) || wepName(wk, tr), kind = wk === 'spearS' || wk === 'spearL' ? 'spear' : wk === 'bow' || wk === 'gun' ? wk : 'sword';
    if (wn || wk === 'shuri') {
      Mw.multiplyMatrices(Mx, S3.weapon(b, row, kind, c.nm, Mh, c.low ? Mcw : null));
      if (wk === 'waki') Mw.multiply(Ms.makeScale(0.7, 0.7, 0.7));
      if (wn) S3.putW(wn, Mw); else put('shuri', Mw);
      if (wk === 'gun' && s.at && nowS - s.at < 0.06) { Mw.multiply(Ms.makeTranslation(0, 1.0, 0)); put('flash', Mw); }
    }
    { const LK = lookOf(s); if (LK) { if (!Mhd) { Mhd = new T.Matrix4(); Mbk = new T.Matrix4(); } const cw = c.low ? Mcw : null;
      putLook(LK, boneMat(b, 'Head', row, cw, Mhd) || Mhd.copy(Mu).multiply(Ms.makeTranslation(0, 1.5, 0)), boneMat(b, 'Spine2', row, cw, Mbk) || Mbk.copy(Mu).multiply(Ms.makeTranslation(0, 1.3, 0)), cav ? Mu : null); } } // 2.17.0 名物兵の飾り（2.18.0 馬鎧）
    // 指物（陣営の色。どの格にも付ける）・竹束・母衣
    const flagC = s.pc ? col : s.side === 'B' ? 0xc8402f : own ? 0xf2f2f2 : 0x6fa7d8;
    if (u && u.order === 'rout') C.setHex(flagC).lerp(C2.setHex(0xffffff), 0.5); else C.setHex(flagC);
    Mu.multiply(Ms.makeScale(sc, sc, sc)).multiply(Ms.makeTranslation(-0.05, 0.12, 0));
    if (X.FLAGS) { put('flag', Mu, C); put('pole', Mu); } // 2.12.4 旗はいったん全部消す（X.FLAGS = true で戻る）
    if (s.type === 'take' || s.type === 'shiyori' || s.type === 'takegashira' || s.tate) put('take', Mu);
    if (s.type === 'horo') put('horoB', Mu, C);
  }

  const COL = { A: 0x2f5a96, Aown: 0x3a6ea5, Aally: 0x5d9ab8, B: 0xa8352a };
  /* 2.12.5 プレイヤーが選んだ服の色（X.cloth＝{ pid: { me:'#色', tr:'#色' } }。main.js が毎コマ入れる）。本人は me、その人の兵は tr */
  X.cloth = null; let skTint = null; const tintC = {};
  const clothOf = (s, u) => { const CL = X.cloth; if (!CL || s.side === 'B') return null; const o = s.pc || (u && (u.owner || u.cmd)), c = o && CL[o]; const hx = c && (s.pc || s.hero ? c.me : c.tr); if (!hx) return null; return tintC[hx] || (tintC[hx] = new T.Color(hx)); };
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
    { const v = tod ? tod.v : new T.Vector3(-0.45, 0.82, 0.32); sun.position.set(hx + v.x * 150, th + v.y * 150, hy + v.z * 150); sun.target.position.set(hx, th, hy); }
    sky.position.copy(cam3.position); sky.material.uniforms.tm.value = clock; gTime.value = clock; if (wOff.value) wOff.value.set(clock * 0.006, clock * 0.0025, -clock * 0.004, clock * 0.005);
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
      skTint = clothOf(s, u); if (skTint && !(u && u.order === 'rout')) col = skTint.getHex(); // 2.12.5 選んだ服の色
      if (!skTint) { const lk = lookOf(s); if (lk && lk.cloth) skTint = tintC[lk.cloth] || (tintC[lk.cloth] = new T.Color(lk.cloth)); } // 2.17.0 名物兵の服の色
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
      if (tr >= 2 && X.FLAGS) { put('flag', Mu, C.setHex(flagC)); put('pole', Mu); } // 2.12.4 旗はいったん消す
      if (s.type === 'take' || s.type === 'shiyori' || s.type === 'takegashira') put('take', Mu); /* 1.6.40 */
      if (s.type === 'horo') put('horoB', Mu, C.setHex(flagC)); // 母衣衆：背中の母衣
      if (s.hero) put('crest', Mu);
      { const LK = lookOf(s); if (LK) { if (!Mhd) { Mhd = new T.Matrix4(); Mbk = new T.Matrix4(); } putLook(LK, Mhd.copy(Mu).multiply(L4.m.makeTranslation(0, 1.22, 0)), Mbk.copy(Mu).multiply(L4.m.makeTranslation(0, 1.05, 0)), cav ? O.matrix : null); } } // 2.17.0 名物兵の飾り
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
    if (X.eff().pp !== 0 && ppRender()) { /* 2.2.0 仕上げ処理つきで描いた */ } else { rd.setRenderTarget(null); rd.render(scene, cam3); }
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
