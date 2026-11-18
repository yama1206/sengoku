// 1.6.65 兵の人型モデル（t1〜t4）・馬・武器を、まとめて（InstancedMesh で）描く
// 読み込んだとき、動きごとに骨の行列を絵（テクスチャ）に焼き込んでおく。描くときは「どの動きの何コマ目か」を1人ずつ渡すだけなので、何百人いても軽い
// モデルは足元が高さ0・前が +Z。武器は握る所が原点・刃先が +Y
(function () {
  const SGK = (window.SGK = window.SGK || {});
  const S = (SGK.SOLD3D = { ready: false, failed: false, loading: false, fps: 30, tiers: [], horses: {}, wep: {}, win: {}, hk: 0.5, seat: 1.5 });
  S.PATH = 'assets/models/';
  const WEPS = ['katana', 'yari', 'yari_t4', 'takeyari', 'yumi', 'yumi_t4', 'teppo', 'teppo_t4'];
  const ATT = ['RightHand', 'LeftHand', 'Hips', 'Back'];
  // 武器の持ち方：手の骨から見た位置 p（m）と回し方 r（ラジアン、XYZの順）
  // 手の骨の -Z が拳の穴の向き（親指の側）。右手は少し上へ傾ける
  S.GRIP = { R: { p: [0.03, 0.08, 0], r: [-(Math.PI / 2 + 0.35), 0, 0] }, L: { p: [-0.03, 0.08, 0], r: [-Math.PI / 2, 0, 0] } };
  let T = null;

  // 部品をまとめて1つの形にする。素材の色は頂点の色にする（まとめて描くため）
  function mergeParts(list, skin) {
    let nv = 0, ni = 0;
    for (const p of list) { const n = p.geo.attributes.position.count; nv += n; ni += p.geo.index ? p.geo.index.count : n; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
    const si = skin ? new Float32Array(nv * 4) : null, sw = skin ? new Float32Array(nv * 4) : null;
    const v = new T.Vector3(), nm = new T.Matrix3();
    let ov = 0, oi = 0, allN = true;
    for (const p of list) {
      const g = p.geo, P = g.attributes.position, N = g.attributes.normal, Cl = g.attributes.color, n = P.count;
      if (!N) allN = false;
      if (p.mat) nm.getNormalMatrix(p.mat);
      for (let i = 0; i < n; i++) {
        const o = ov + i;
        v.fromBufferAttribute(P, i); if (p.mat) v.applyMatrix4(p.mat); v.toArray(pos, o * 3);
        if (N) { v.fromBufferAttribute(N, i); if (p.mat) v.applyMatrix3(nm).normalize(); v.toArray(nor, o * 3); }
        if (Cl) { col[o * 3] = Cl.getX(i); col[o * 3 + 1] = Cl.getY(i); col[o * 3 + 2] = Cl.getZ(i); }
        else if (p.color) p.color.toArray(col, o * 3); else col.fill(1, o * 3, o * 3 + 3);
        if (skin) {
          const I = g.attributes.skinIndex, W = g.attributes.skinWeight;
          si[o * 4] = I.getX(i); si[o * 4 + 1] = I.getY(i); si[o * 4 + 2] = I.getZ(i); si[o * 4 + 3] = I.getW(i);
          sw[o * 4] = W.getX(i); sw[o * 4 + 1] = W.getY(i); sw[o * 4 + 2] = W.getZ(i); sw[o * 4 + 3] = W.getW(i);
        }
      }
      if (g.index) for (let k = 0; k < g.index.count; k++) idx[oi + k] = g.index.getX(k) + ov;
      else for (let k = 0; k < n; k++) idx[oi + k] = k + ov;
      oi += g.index ? g.index.count : n; ov += n;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    if (skin) { geo.setAttribute('skinIndex', new T.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T.BufferAttribute(sw, 4)); }
    geo.setIndex(new T.BufferAttribute(idx, 1));
    if (!allN) geo.computeVertexNormals();
    return geo;
  }

  /* 2.12.5 服の所（染める頂点）を、どの骨で動くかと色で見分ける：頭・首・手で動く所（顔・手・陣笠・兜）は染めない。
     足先の肌色（素足）・黒い具足・白い所も染めない。足軽の着物は肌に近い色なので、色だけでは見分けられない */
  S.clothMask = (geo, boneNames) => {
    const P = geo.attributes.position, C = geo.attributes.color, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, m = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      let bi = SI.getX(i), bw = SW.getX(i); for (const k of ['getY', 'getZ', 'getW']) if (SW[k](i) > bw) { bw = SW[k](i); bi = SI[k](i); }
      const bn = (boneNames[bi] || '').replace(/^mixamorig:?/, ''), r = C.getX(i), g = C.getY(i), b = C.getZ(i), lo = Math.min(r, g, b), hi = Math.max(r, g, b), lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const skinCol = r > 0.6 && g > 0.45 && b > 0.28 && r > g && g > b && lum > 0.5;
      const bare = /Head|Neck|Hand|Thumb|Index|Middle|Ring|Pinky|Eye/.test(bn) || (skinCol && /Leg$|Foot|Toe/.test(bn));
      m[i] = !bare && lum < 0.82 && !(lum < 0.2 && hi - lo < 0.12) ? 1 : 0;
    }
    return m;
  };
  // 動きを焼き込む。1行＝1コマ、1行に骨の数×4画素（行列1つ＝4画素）
  // hipK：腰の位置を体の大きさに合わせる倍率（動きはt3の体で作られているため）
  function bake(gl, clips, hipK) {
    const root = gl.scene; root.updateMatrixWorld(true);
    const meshes = []; root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    const sm = meshes[0], sk = sm.skeleton, nb = sk.bones.length;
    const geo = mergeParts(meshes.map((m) => ({ geo: m.geometry, color: m.geometry.attributes.color ? null : m.material.color })), true);
    const bones = {}; for (const b of sk.bones) bones[b.name.replace(/^mixamorig:?/, '')] = b;
    { const cm = S.clothMask(geo, sk.bones.map((b) => b.name)), C = geo.attributes.color; for (let i = 0; i < cm.length; i++) if (cm[i]) C.setX(i, -Math.max(C.getX(i), 0.001)); } // 2.12.5 服の所は赤をマイナスにして印にする（属性を増やすと数の上限を超えるので）
    const hips = bones.Hips;
    const mixer = new T.AnimationMixer(root), rows = {};
    let H = 0;
    for (const [nm, c] of clips) { const n = Math.max(1, Math.round(c.duration * S.fps) + 1); rows[nm] = { r0: H, n, dur: Math.max(c.duration, 1e-3), clip: c }; H += n; }
    const W = nb * 4, data = new Float32Array(W * H * 4), att = {};
    for (const a of ATT) if (bones[a]) att[a] = new Float32Array(H * 16);
    const m = new T.Matrix4(), base = new T.Matrix4().copy(sm.matrixWorld).multiply(sm.bindMatrixInverse);
    for (const nm in rows) {
      const R = rows[nm]; mixer.stopAllAction();
      const act = mixer.clipAction(R.clip); act.setLoop(T.LoopOnce); act.clampWhenFinished = true; act.reset().play();
      for (let i = 0; i < R.n; i++) {
        mixer.setTime(Math.min(R.clip.duration, i / S.fps));
        if (hipK && hips) hips.position.multiplyScalar(hipK);
        root.updateMatrixWorld(true);
        const row = R.r0 + i;
        for (let b = 0; b < nb; b++) {
          m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]).premultiply(base).multiply(sm.bindMatrix);
          m.toArray(data, (row * W + b * 4) * 4);
        }
        for (const a in att) bones[a].matrixWorld.toArray(att[a], row * 16);
      }
      delete R.clip;
    }
    mixer.stopAllAction();
    const tex = new T.DataTexture(data, W, H, T.RGBAFormat, T.FloatType); tex.needsUpdate = true;
    // 上半身の骨（背骨とその先）。歩きながら攻撃するとき、ここだけ攻撃の動きにする
    const upper = new Float32Array(64);
    sk.bones.forEach((bn, i) => { for (let o = bn; o; o = o.parent) if (/Spine$/.test(o.name)) { upper[i] = 1; break; } });
    return { geo, tex, nb, H, rows, att, upper, base: base.clone(), baseInv: base.clone().invert() };
  }

  // 高さ y0 より上の白っぽい頂点（明るく色みが少ない）を黒漆の色にする
  function blackHat(geo, y0) {
    const P = geo.attributes.position, C = geo.attributes.color;
    for (let i = 0; i < P.count; i++) {
      if (P.getY(i) < y0) continue;
      const r = Math.abs(C.getX(i)), g = C.getY(i), b = C.getZ(i), lo = Math.min(r, g, b), hi = Math.max(r, g, b);
      if (lo > 0.3 && hi - lo < 0.25 * hi) C.setXYZ(i, C.getX(i) < 0 ? -0.05 : 0.05, 0.05, 0.058);
    }
    C.needsUpdate = true;
  }

  // 2.7.0 質感：色の暗い所（黒漆の具足・陣笠）はつやを出し、明るい灰色（刃・金具）は金属に。ふちを少し明るくして形を見やすく
  S.mats = [];
  S.setEnv = (env) => { for (const m of S.mats) { m.envMap = env; m.envMapIntensity = 0.55; m.needsUpdate = true; } };
  function look(sh, metal) {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_COLOR\n  float lum_ = dot(vColor.rgb, vec3(0.299, 0.587, 0.114)), sat_ = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));\n  roughnessFactor = mix(0.42, 0.88, smoothstep(0.04, 0.22, lum_));\n#endif')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n#ifdef USE_COLOR\n' + (metal ? '  if (lum_ > 0.45 && sat_ < 0.12) { metalnessFactor = 0.9; roughnessFactor = 0.3; }\n' : '  if (lum_ > 0.6 && sat_ < 0.08 && lum_ < 0.85) { metalnessFactor = 0.5; roughnessFactor = 0.45; }\n') + '#endif')
      .replace('#include <dithering_fragment>', '  { float rim_ = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0); gl_FragColor.rgb += vec3(1.0, 0.93, 0.8) * pow(rim_, 3.0) * 0.22; }\n#include <dithering_fragment>');
  }
  const stdMat = (metal) => { const m = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.85, metalness: 0 }); S.mats.push(m); return m; };
  // 焼き込んだ骨の行列で体を動かす素材（影用も）
  function skinMat(b, depth) {
    const m = depth ? new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }) : stdMat(false);
    m.onBeforeCompile = (sh) => {
      if (!depth) look(sh, false);
      sh.uniforms.bT = { value: b.tex }; sh.uniforms.bS = { value: new T.Vector2(b.nb * 4, b.H) }; sh.uniforms.bU = { value: b.upper };
      // aR＝(下半身の行, 上半身の行, 白く光る量)。aC＝上半身を下半身の腰につなぐ行列
      sh.vertexShader = [
        'uniform sampler2D bT; uniform vec2 bS; uniform float bU[64]; attribute vec4 skinIndex; attribute vec4 skinWeight; attribute vec4 aR; attribute mat4 aC;',
        'mat4 bM(float i) { bool up = bU[int(i + 0.5)] > 0.5; float y = ((up ? aR.y : aR.x) + 0.5) / bS.y, dx = 1.0 / bS.x, x = (i * 4.0 + 0.5) * dx;',
        '  mat4 m = mat4(texture2D(bT, vec2(x, y)), texture2D(bT, vec2(x + dx, y)), texture2D(bT, vec2(x + 2.0 * dx, y)), texture2D(bT, vec2(x + 3.0 * dx, y)));',
        '  return up ? aC * m : m; }',
        sh.vertexShader
          .replace('#include <skinbase_vertex>', 'mat4 skM = skinWeight.x * bM(skinIndex.x) + skinWeight.y * bM(skinIndex.y) + skinWeight.z * bM(skinIndex.z) + skinWeight.w * bM(skinIndex.w);')
          .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(skM) * objectNormal);')
          .replace('#include <skinning_vertex>', 'transformed = (skM * vec4(transformed, 1.0)).xyz;')
          .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\n  float cl_ = vColor.r < 0.0 ? 1.0 : 0.0; vColor.rgb = abs(vColor.rgb);\n  if (aR.w >= 0.0 && cl_ > 0.5) { vec3 tc = vec3(floor(aR.w / 65536.0), mod(floor(aR.w / 256.0), 256.0), mod(aR.w, 256.0)) / 255.0; vColor.rgb = tc * (0.45 + 0.9 * dot(vColor.rgb, vec3(0.299, 0.587, 0.114))); }\n  vColor.rgb = mix(vColor.rgb, vec3(1.0), aR.z);\n#endif'), // 2.12.5 服を選んだ色に染める（aR.w＝色を1つの数にしたもの。-1 なら元の色。服かどうかは色で見分ける）
      ].join('\n');
    };
    m.customProgramCacheKey = () => 'sold3d5' + (depth ? 'd' : 'c');
    return m;
  }

  function mkSkin(b, cap, scene) {
    const ra = new T.InstancedBufferAttribute(new Float32Array(cap * 4), 4), fa = new T.InstancedBufferAttribute(new Float32Array(cap * 16), 16);
    ra.setUsage(T.DynamicDrawUsage); fa.setUsage(T.DynamicDrawUsage);
    b.geo.setAttribute('aR', ra); b.geo.setAttribute('aC', fa);
    const im = new T.InstancedMesh(b.geo, skinMat(b, false), cap);
    im.customDepthMaterial = skinMat(b, true);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.count = 0;
    scene.add(im);
    return Object.assign(b, { im, ra, fa, n: 0, cap });
  }
  function mkStatic(gl, cap, scene) {
    gl.scene.updateMatrixWorld(true);
    const parts = []; gl.scene.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry, mat: o.matrixWorld, color: o.material.color }); });
    const sm = stdMat(true); sm.onBeforeCompile = (sh) => look(sh, true); sm.customProgramCacheKey = () => 'sold3dw';
    const im = new T.InstancedMesh(mergeParts(parts, false), sm, cap);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.count = 0;
    scene.add(im);
    return { im, n: 0, cap };
  }

  // 読み込む（終わると S.ready）。cap＝一度に描ける人数
  S.load = function (THREE, scene, cap, done) {
    if (S.loading || !THREE || !THREE.GLTFLoader) return; S.loading = true; T = THREE;
    const L = new T.GLTFLoader(), get = (u) => new Promise((ok, ng) => L.load(S.PATH + u, ok, undefined, ng));
    Promise.all([get('soldier_anims.glb'), ...[1, 2, 3, 4].map((i) => get(`soldier_t${i}_rig.glb`)), get('equip/horse_brown.glb'), get('equip/horse_white.glb'), ...WEPS.map((n) => get(`equip/${n}.glb`))]).then((g) => {
      const an = g[0]; let aHip = 0;
      an.scene.traverse((o) => { if (!aHip && /Hips$/.test(o.name)) aHip = o.position.length(); });
      const clips = an.animations.map((c) => [c.name, c]);
      for (let i = 0; i < 4; i++) {
        let h = 0; g[1 + i].scene.traverse((o) => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o.position.length(); });
        const bk = bake(g[1 + i], clips, h && aHip ? h / aHip : 1);
        if (i === 1 || i === 2) blackHat(bk.geo, 1.4); // t2の陣笠・t3の兜の白い所は黒漆に
        const b = mkSkin(bk, cap, scene);
        const rr = b.rows.ride; b.hipSit = rr && b.att.Hips ? b.att.Hips[rr.r0 * 16 + 13] : 0.53; // 座った姿勢の腰の高さ
        S.tiers.push(b);
      }
      // 攻撃の「当たる瞬間」（腕がいちばん前に出たコマ）を探し、その前後を攻撃の動きに使う
      const t1 = S.tiers[0], z = (a, r) => t1.att[a][r * 16 + 14];
      for (const nm of ['spear', 'sword', 'bow', 'gun']) {
        const R = t1.rows[nm]; if (!R) continue;
        let best = -1e9, bi = 0;
        for (let i = 0; i < R.n; i++) { const r = R.r0 + i, v = nm === 'bow' ? z('LeftHand', r) - z('RightHand', r) : z('RightHand', r) - z('Hips', r); if (v > best) { best = v; bi = i; } }
        const pk = bi / S.fps; S.win[nm] = { a: Math.max(0, pk - 0.5), b: Math.min(R.dur, pk + 0.25), pk };
      }
      // 馬：立つ・歩く・駆ける
      for (const [k, gi] of [['brown', 5], ['white', 6]]) {
        const hc = g[gi].animations.filter((c) => /\|(Idle|Walk|Gallop)$/.test(c.name)).map((c) => [c.name.replace(/^.*\|/, '').toLowerCase(), c]);
        S.horses[k] = mkSkin(bake(g[gi], hc, 0), Math.ceil(cap / 3), scene);
      }
      // 馬の大きさ：背の骨の高さが 1.45m になるように縮める
      const hb = S.horses.brown, by = hb.att.Back ? hb.att.Back[hb.rows.idle.r0 * 16 + 13] : 0;
      S.hk = by > 0.1 ? 1.45 / by : 0.5; S.seat = 1.45 + 0.1;
      WEPS.forEach((n, i) => { S.wep[n] = mkStatic(g[7 + i], cap, scene); });
      if (S.env) S.setEnv(S.env); S.ready = true; if (done) done();
    }).catch((e) => { S.failed = true; console.warn('兵のモデルを読めませんでした（これまでの形で描きます）', e); });
  };

  const all = () => [...S.tiers, ...Object.values(S.horses), ...Object.values(S.wep)];
  S.begin = () => { for (const b of all()) b.n = 0; };
  S.end = () => {
    for (const b of all()) { b.im.count = b.n; b.im.instanceMatrix.needsUpdate = true; if (b.ra) { b.ra.needsUpdate = true; b.fa.needsUpdate = true; } }
  };
  // 動き name の t 秒目のコマ（行）
  S.rowAt = (b, name, t, loop) => {
    const R = b.rows[name] || b.rows.idle;
    const tt = loop ? ((t % R.dur) + R.dur) % R.dur : Math.max(0, Math.min(R.dur, t));
    return R.r0 + Math.min(R.n - 1, Math.round(tt * S.fps));
  };
  // row＝下半身（または全身）の行、rowU・cs＝上半身の行とつなぐ行列（S.combo で作る。なければ全身 row）
  const I16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  S.put = (b, m, row, fx, rowU, cs, tint) => { // tint＝服の色 THREE.Color（なければ元の色）
    if (b.n >= b.cap) return false; const n = b.n;
    b.im.setMatrixAt(n, m);
    b.ra.array[n * 4] = row; b.ra.array[n * 4 + 1] = rowU == null ? row : rowU; b.ra.array[n * 4 + 2] = fx || 0;
    b.ra.array[n * 4 + 3] = tint ? Math.round(Math.min(1, tint.r) * 255) * 65536 + Math.round(Math.min(1, tint.g) * 255) * 256 + Math.round(Math.min(1, tint.b) * 255) : -1; // 2.12.5 服の色
    if (cs && rowU != null) cs.toArray(b.fa.array, n * 16); else b.fa.array.set(I16, n * 16);
    b.n++; return true;
  };
  // 歩きながら攻撃：上半身（rowUp）を下半身（rowLow）の腰につなぐ。cs＝体を動かす用、cw＝武器などを置く用
  S.combo = (b, rowLow, rowUp, cs, cw) => {
    // 1.6.69 向きは攻撃の動きのまま、位置だけ腰に合わせる（腰ごと回すと、腰をひねって構える槍の突きが横を向いていた）
    const lo = b.att.Hips, i = rowLow * 16, j = rowUp * 16;
    cw.makeTranslation(lo[i + 12] - lo[j + 12], lo[i + 13] - lo[j + 13], lo[i + 14] - lo[j + 14]);
    cs.multiplyMatrices(b.base, cw).multiply(b.baseInv);
  };
  S.putW = (name, m) => { const w = S.wep[name]; if (!w || w.n >= w.cap) return; w.im.setMatrixAt(w.n++, m); };
  // 手の骨の行列（体の中での位置と向き）
  S.hand = (b, row, side, out) => out.fromArray(b.att[side === 'L' ? 'LeftHand' : 'RightHand'], row * 16);
  // 武器の行列（体の中で）。kind：spear・gun・sword・bow。両手で持つ動き（突く・構える・斬る）では、両手を結ぶ線を武器の向きにする
  const TWO = { spear: ['spear', 1], gun: ['gun', 1], sword: ['sword', -1] };
  let v1, v2, v3, v4, mT;
  // cw：歩きながら攻撃するとき、上半身を腰につなぐ行列（S.combo の cw）
  S.weapon = (b, row, kind, clip, out, cw) => { weapon0(b, row, kind, clip, out); if (cw) out.premultiply(cw); return out; };
  const weapon0 = (b, row, kind, clip, out) => {
    if (!v1) { v1 = new T.Vector3(); v2 = new T.Vector3(); v3 = new T.Vector3(); v4 = new T.Vector3(); mT = new T.Matrix4(); }
    const side = kind === 'bow' ? 'L' : 'R';
    S.hand(b, row, side, out).multiply(S.grip(side));
    const tw = TWO[kind]; if (!tw || tw[0] !== clip) return out;
    const r = b.att.RightHand, l = b.att.LeftHand, o = row * 16;
    v1.set(l[o + 12] - r[o + 12], l[o + 13] - r[o + 13], l[o + 14] - r[o + 14]); if (v1.lengthSq() < 1e-4) return out;
    v1.normalize().multiplyScalar(tw[1]); // 武器の向き（+Y）
    v2.set(0, 1, 0); if (Math.abs(v1.y) > 0.95) v2.set(0, 0, 1);
    v3.crossVectors(v1, v2).normalize(); v4.crossVectors(v3, v1);
    v2.setFromMatrixPosition(out); mT.makeBasis(v3, v1, v4).setPosition(v2);
    return out.copy(mT);
  };
  const gm = {};
  S.grip = (side) => {
    const G = S.GRIP[side], key = side + G.p.join() + G.r.join();
    if (!gm[side] || gm[side].k !== key) gm[side] = { k: key, m: new T.Matrix4().compose(new T.Vector3(...G.p), new T.Quaternion().setFromEuler(new T.Euler(...G.r)), new T.Vector3(1, 1, 1)) };
    return gm[side].m;
  };
})();
