// 1.6.65 兵の人型モデル（t1〜t4）・馬・武器を、まとめて（InstancedMesh で）描く
// 読み込んだとき、動きごとに骨の行列を絵（テクスチャ）に焼き込んでおく。描くときは「どの動きの何コマ目か」を1人ずつ渡すだけなので、何百人いても軽い
// モデルは足元が高さ0・前が +Z。武器は握る所が原点・刃先が +Y
(function () {
  const SGK = (window.SGK = window.SGK || {});
  const S = (SGK.SOLD3D = { ready: false, failed: false, loading: false, fps: 30, tiers: [], horses: {}, wep: {}, win: {}, hk: 0.5, seat: 1.5 });
  S.PATH = 'assets/models/';
  const WEPS = ['katana', 'yari', 'yari_t4', 'takeyari', 'yumi', 'yumi_t4', 'teppo', 'teppo_t4'];
  const ATT = ['RightHand', 'LeftHand', 'Hips', 'Back', 'Head', 'Spine2']; // 2.17.0 頭・胸（名物兵の飾りを付ける所）
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
  /* 2.30.1 腕の骨の重みの付きすぎを直す：自動で骨を入れた時、腰の帯・草摺など（腰の高さで腕から離れた所）が腕や手の骨にも
     引っぱられる重みになっていて、腕を振ると服の一部が付いてきていた。腰の高さの頂点で、腕（上腕・前腕・手）から離れているものは、
     腕の重みを外して残りの骨（なければ背骨か腰）に分け直す。頂点の位置と骨の位置は、読み込んだ時の姿（バインドの姿）で比べる。
     t1（素手の足軽）は袖が腰まで垂れていて、袖が腕について行くのが正しいので直さない（直すと袖がちぎれる） */
  S.fixArmWeights = (mesh) => {
    if (!T) T = window.THREE;
    const geo = mesh.geometry, P = geo.attributes.position, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight; if (!P || !SI || !SW) return 0;
    const bones = mesh.skeleton.bones, names = bones.map((b) => b.name.replace(/^mixamorig:?/, '')), idx = (n) => names.indexOf(n);
    const wp = (i) => { const v = new T.Vector3(); bones[i].getWorldPosition(v); return v; };
    mesh.updateMatrixWorld(true); const iH = idx('Hips'), iS = idx('Spine'); if (iH < 0) return 0;
    const HP = wp(iH), hipY = HP.y, segs = [];
    for (const s of ['Left', 'Right']) { const a = idx(s + 'Arm'), f = idx(s + 'ForeArm'), h = idx(s + 'Hand'); if (a < 0 || f < 0 || h < 0) continue; const A = wp(a), F = wp(f), H = wp(h), E = H.clone().add(H.clone().sub(F).normalize().multiplyScalar(0.2)); segs.push([A, F], [F, H], [H, E]); }
    const arm = names.map((n) => /Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Pinky/.test(n));
    const v = new T.Vector3(), q = new T.Vector3(), d = (p, a, b) => { q.subVectors(b, a); const t = Math.max(0, Math.min(1, v.copy(p).sub(a).dot(q) / (q.lengthSq() || 1))); return p.distanceTo(q.multiplyScalar(t).add(a)); };
    const p = new T.Vector3(), K = ['X', 'Y', 'Z', 'W'], N = P.count, cls = new Int8Array(N); // 0：腕の重みなし、1：外す、2：残す
    const finger = names.map((n) => /Thumb|Index|Middle|Ring|Pinky/.test(n));
    for (let k = 0; k < N; k++) {
      let aw = 0, bi = -1, bw = 0; for (const c of K) { const b = SI['get' + c](k), w = SW['get' + c](k); if (arm[b]) aw += w; if (w > bw) { bw = w; bi = b; } }
      if (aw < 0.01) continue;
      p.fromBufferAttribute(P, k).applyMatrix4(mesh.bindMatrix);
      if (p.y > hipY + 0.25 || finger[bi]) { cls[k] = 2; continue; } // 腰より上と、指の骨で動く所はそのまま
      let near = 9; for (const [a, b] of segs) near = Math.min(near, d(p, a, b));
      cls[k] = near < 0.085 ? 2 : 1; // 手首から先・前腕のすぐそばは手そのもの。それより離れた腰の高さの所（帯・草摺）は外す // 手首から先・前腕のすぐそばは手そのもの。それより離れた腰の高さの所（裾・帯）は外す
    }
    let n = 0;
    for (let k = 0; k < N; k++) {
      if (cls[k] !== 1) continue;
      p.fromBufferAttribute(P, k).applyMatrix4(mesh.bindMatrix);
      const ws = K.map((c) => (arm[SI['get' + c](k)] ? 0 : SW['get' + c](k))), rest = ws.reduce((x, y) => x + y, 0);
      if (rest > 0.01) K.forEach((c, j) => SW['set' + c](k, ws[j] / rest));
      else { SI.setXYZW(k, p.y > hipY + 0.05 && iS >= 0 ? iS : iH, 0, 0, 0); SW.setXYZW(k, 1, 0, 0, 0); }
      n++;
    }
    SI.needsUpdate = SW.needsUpdate = true; return n;
  };
  const GUN_POSES = [
    // 進行度、胴の反り、左腕の上下、右腕の上下、右腕の開き
    [0, 0, 0, 0, 0],
    [0.025, -0.12, -0.12, -0.14, 0],
    [0.09, 0, 0.12, 0.15, 0],
    [0.24, 0.12, 0.35, 0.55, -0.30],
    [0.42, 0.08, -0.32, -0.52, -0.12],
    [0.57, 0.11, -0.22, -0.26, -0.22],
    [0.70, 0.08, -0.31, -0.48, -0.10],
    [0.85, 0.04, 0.15, 0.22, -0.08],
    [1, 0, 0, 0, 0],
  ];
  S.gunPose = (phase) => {
    const i = GUN_POSES.findIndex(([t]) => t >= phase);
    if (i <= 0) return GUN_POSES[i === 0 ? 0 : GUN_POSES.length - 1];
    const a = GUN_POSES[i - 1], b = GUN_POSES[i], k = (phase - a[0]) / (b[0] - a[0]);
    const blend = k * k * (3 - 2 * k);
    return a.map((v, j) => v + (b[j] - v) * blend);
  };

  // 構えの一コマを基に、射撃後から構え直しまでの全身ポーズを焼く。
  // 角度はモデルの軸で指定し、各骨の親座標へ変換して適用する。
  function gunCyclePose(root, bones, phase, turn, axis, parent) {
    const [, spine, left, right, open] = S.gunPose(phase);
    bendBone(root, bones.Spine, spine, 0, turn, axis, parent);
    bendBone(root, bones.LeftArm, left, 0, turn, axis, parent);
    bendBone(root, bones.RightArm, right, open, turn, axis, parent);
    bendBone(root, bones.RightForeArm, right * 0.32, 0, turn, axis, parent);
  }

  function bendBone(root, bone, x, z, turn, axis, parent, y = 0) {
    if (!bone || !(x || y || z)) return;
    bone.parent.getWorldQuaternion(parent).invert();
    axis.set(x, y, z).normalize().applyQuaternion(parent);
    bone.quaternion.premultiply(turn.setFromAxisAngle(axis, Math.hypot(x, y, z)));
    root.updateMatrixWorld(true);
  }

  const ATTACK_CLIPS = ['spear', 'sword', 'bow'];
  const TRANSITIONS = [
    ['spearRecover', 'spear', 'b'],
    ['swordRecover', 'sword', 'b'],
    ['swordLead', 'sword', 'a'],
    ['bowRecover', 'bow', 'b'],
    ['gunSet', 'gun', 'pose'],
  ];
  const smooth = (k) => k * k * (3 - 2 * k);

  function attackWindow(rows, hands, name) {
    const R = rows[name];
    // 弓素材の末尾が弓を引き切った構え。放った後は別のポーズで補う。
    if (name === 'bow') return { a: Math.max(0, R.dur - 0.32), b: R.dur, pk: R.dur };
    const z = (hand, row) => hands[hand][row * 16 + 14];
    let best = -Infinity, frame = 0;
    for (let i = 0; i < R.n; i++) {
      const row = R.r0 + i;
      const reach = z('RightHand', row) - z('Hips', row);
      if (reach > best) { best = reach; frame = i; }
    }
    const pk = Math.min(R.dur, frame / S.fps);
    return { a: Math.max(0, pk - 0.5), b: Math.min(R.dur, pk + 0.25), pk };
  }

  // 歩きと走りは足の周期をそろえ、速度に応じた中間姿勢を読み込み時に焼く。
  const GAITS = ['walk', 'jog1', 'jog2', 'jog3', 'jog4', 'jog5', 'jog6', 'jog7', 'run'];
  S.gait = (speed) => GAITS[Math.round(Math.max(0, Math.min(1, (speed - 2.6) / 2)) * (GAITS.length - 1))];
  S.gaitRow = (b, name, phase) => {
    const R = b.rows[name];
    return R.r0 + Math.round((phase % 1) * (R.n - 1));
  };

  // 16 ビットの頂点色 alpha に部位番号を持つ。布には従来の一括染色も適用できる。
  S.partOf = (colors, i) => {
    const flag = Math.round(colors.getW(i) * 65535);
    if (flag > 65520 && flag <= 65525) return -(flag - 65520);
    if (flag > 65510 && flag <= 65515) return flag - 65510;
    return 0;
  };
  S.modelFile = (tier) => tier === 4 ? 'soldier_t4_rig.glb' : `soldier_t${tier}_battle.glb?v=3`;

  // 動きを焼き込む。1行＝1コマ、1行に骨の数×4画素（行列1つ＝4画素）
  // hipK：腰の位置を体の大きさに合わせる倍率（動きはt3の体で作られているため）
  function bake(gl, clips, hipK, fixArms, paintedArmor = false) {
    const root = gl.scene; root.updateMatrixWorld(true);
    const meshes = []; root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
    if (fixArms) for (const m of meshes) S.fixArmWeights(m); // 2.30.1
    const sm = meshes[0], sk = sm.skeleton, nb = sk.bones.length;
    const geo = mergeParts(meshes.map((m) => ({ geo: m.geometry, color: m.geometry.attributes.color ? null : m.material.color })), true);
    const bones = {}; for (const b of sk.bones) bones[b.name.replace(/^mixamorig:?/, '')] = b;
    const C = geo.attributes.color;
    if (paintedArmor) {
      // 赤の整数部に部位番号、負号に一括染色の対象を記録する。
      let offset = 0;
      for (const mesh of meshes) {
        const source = mesh.geometry.attributes.color;
        for (let i = 0; i < source.count; i++) {
          const part = Math.round(source.getW(i) * 65535), j = offset + i;
          const colorPart = S.partOf(source, i);
          if (colorPart) C.setX(j, Math.sign(colorPart) * (2 * Math.abs(colorPart) + C.getX(j)));
          if (part === 65533) C.setY(j, -C.getY(j));
        }
        offset += source.count;
      }
    } else {
      const mask = S.clothMask(geo, sk.bones.map((b) => b.name));
      for (let i = 0; i < mask.length; i++) if (mask[i]) C.setX(i, -Math.max(C.getX(i), 0.001));
    }
    const hips = bones.Hips;
    const mixer = new T.AnimationMixer(root), rows = {};
    let H = 0;
    for (const [nm, c] of clips) { const n = Math.max(1, Math.round(c.duration * S.fps) + 1); rows[nm] = { r0: H, n, dur: Math.max(c.duration, 1e-3), clip: c }; H += n; }
    if (rows.sword && rows.walk && rows.run) {
      const walk = rows.walk.clip, run = rows.run.clip;
      for (let i = 1; i < GAITS.length - 1; i++) {
        const weight = i / (GAITS.length - 1), dur = walk.duration + (run.duration - walk.duration) * weight;
        const n = Math.round(dur * S.fps) + 1;
        rows[GAITS[i]] = { r0: H, n, dur, clip: walk, blend: run, weight };
        H += n;
      }
    }
    if (rows.gun) {
      rows.gunCycle = { r0: H, n: S.fps + 1, dur: 1, clip: rows.gun.clip };
      H += rows.gunCycle.n;
    }
    const idle = rows.idle && rows.idle.clip;
    for (const [name, from, edge] of TRANSITIONS) if (idle && rows[from]) {
      const n = 12;
      rows[name] = { r0: H, n, dur: 1, clip: rows[from].clip, from, edge };
      H += n;
    }
    if (idle && rows.sword) {
      const n = 21;
      rows.throw = { r0: H, n, dur: 1, clip: idle };
      H += n;
    }
    const W = nb * 4, data = new Float32Array(W * H * 4), att = {};
    for (const a of ATT) if (bones[a]) att[a] = new Float32Array(H * 16);
    const m = new T.Matrix4(), base = new T.Matrix4().copy(sm.matrixWorld).multiply(sm.bindMatrixInverse);
    const turn = new T.Quaternion(), axis = new T.Vector3(), parent = new T.Quaternion();
    const posedBones = [bones.Spine, bones.LeftArm, bones.RightArm, bones.RightForeArm].filter(Boolean);
    const restPose = posedBones.map(() => new T.Quaternion());
    const hipPosition = new T.Vector3();
    for (const nm in rows) {
      const R = rows[nm]; mixer.stopAllAction();
      const act = mixer.clipAction(R.clip); act.setLoop(T.LoopOnce); act.clampWhenFinished = true; act.reset().play();
      const rest = R.from ? mixer.clipAction(idle).reset().play() : null;
      const blend = R.blend ? mixer.clipAction(R.blend).reset().play() : null;
      if (blend) {
        act.setEffectiveWeight(1 - R.weight);
        blend.setEffectiveWeight(R.weight);
      }
      const gait = GAITS.includes(nm) && rows.sword;
      const cycle = nm === 'gunCycle', throwing = nm === 'throw', bowRelease = nm === 'bowRecover';
      for (let i = 0; i < R.n; i++) {
        const phase = i / (R.n - 1);
        if (rest) {
          const weight = smooth(bowRelease ? Math.max(0, (phase - 0.27) / 0.73) : phase);
          act.time = R.from === 'gun' ? 1 : S.win[R.from][R.edge];
          rest.time = 0;
          act.setEffectiveWeight(1 - weight);
          rest.setEffectiveWeight(weight);
          mixer.update(0);
        } else if (blend) {
          act.time = phase * R.clip.duration;
          blend.time = phase * R.blend.duration;
          mixer.update(0);
        } else {
          mixer.setTime(Math.min(R.clip.duration, cycle ? 1 : throwing ? 0 : gait ? phase * R.clip.duration : i / S.fps));
        }
        if (hipK && hips) {
          hipPosition.copy(hips.position);
          hips.position.multiplyScalar(hipK);
        }
        if (cycle || throwing || bowRelease) {
          posedBones.forEach((bone, j) => restPose[j].copy(bone.quaternion));
          if (cycle) gunCyclePose(root, bones, phase, turn, axis, parent);
          else if (bowRelease) {
            const k = phase < 0.18 ? phase / 0.18 : (1 - phase) / 0.82;
            const loose = smooth(k);
            bendBone(root, bones.RightArm, -0.18 * loose, 0.12 * loose, turn, axis, parent, 0.26 * loose);
            bendBone(root, bones.RightForeArm, 0.27 * loose, 0, turn, axis, parent);
          } else {
            const flick = Math.sin(Math.PI * phase);
            bendBone(root, bones.Spine, 0.18 * flick, 0, turn, axis, parent, -0.32 * flick);
            bendBone(root, bones.RightArm, -1.55 * flick, -0.26 * flick, turn, axis, parent);
            bendBone(root, bones.RightForeArm, 0.55 * flick * (1 - phase), 0, turn, axis, parent);
          }
        }
        root.updateMatrixWorld(true);
        const row = R.r0 + i;
        for (let b = 0; b < nb; b++) {
          m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]).premultiply(base).multiply(sm.bindMatrix);
          m.toArray(data, (row * W + b * 4) * 4);
        }
        for (const a in att) bones[a].matrixWorld.toArray(att[a], row * 16);
        if (cycle || throwing || bowRelease) posedBones.forEach((bone, j) => bone.quaternion.copy(restPose[j]));
        if (hipK && hips) hips.position.copy(hipPosition);
      }
      if (ATTACK_CLIPS.includes(nm) && !S.win[nm]) S.win[nm] = attackWindow(rows, att, nm);
      delete R.clip;
      delete R.blend;
    }
    mixer.stopAllAction();
    const tex = new T.DataTexture(data, W, H, T.RGBAFormat, T.FloatType); tex.needsUpdate = true;
    // 上半身の骨（背骨とその先）。歩きながら攻撃するとき、ここだけ攻撃の動きにする
    const upper = new Float32Array(64);
    sk.bones.forEach((bn, i) => { for (let o = bn; o; o = o.parent) if (/Spine$/.test(o.name)) { upper[i] = 1; break; } });
    return { geo, tex, nb, H, rows, att, upper, paintedArmor, base: base.clone(), baseInv: base.clone().invert(), boneNames: sk.bones.map((b) => b.name) };
  }

  /* 2.21.0 肌の色：モデルの肌（0.8,0.6,0.4 など。頂点の色はリニアなので画面では白っぽい肌色になっていた）を、
     日本人らしい少し日に焼けた肌色に。兵の段（t1〜t4）や服の色に関係なく、いつも同じ色にする（肌に服の印が付いていたら外す）。
     手（手首から先の骨で動く所）は手袋なので肌にせず、服と同じく選んだ色に染まるようにする（染めない時は革の色） */
  S.SKIN = [0.6, 0.39, 0.255]; // 画面の色で #cba98b くらい（黄みのある肌色）
  S.GLOVE = [0.2, 0.15, 0.11]; // 染めない時の手袋（こげ茶の革）
  function skinTone(geo, boneNames) {
    const C = geo.attributes.color, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    for (let i = 0; i < C.count; i++) {
      const r = Math.abs(C.getX(i)), g = C.getY(i), b = C.getZ(i); // 腕の肌は服の印（赤がマイナス）が付いて服の色に染まっていたので、印も外す
      if (!(r >= 0.62 && r <= 0.88 && g >= 0.5 && g <= 0.68 && b >= 0.3 && b <= 0.47 && r - g > 0.08 && g - b > 0.1)) continue;
      let bi = SI.getX(i), bw = SW.getX(i); for (const k of ['getY', 'getZ', 'getW']) if (SW[k](i) > bw) { bw = SW[k](i); bi = SI[k](i); }
      const bn = (boneNames[bi] || '').replace(/^mixamorig:?/, '');
      if (/Hand|Thumb|Index|Middle|Ring|Pinky/.test(bn)) C.setXYZ(i, -S.GLOVE[0], S.GLOVE[1], S.GLOVE[2]); // 手袋：赤をマイナスにして服の印
      else C.setXYZ(i, S.SKIN[0], -S.SKIN[1], S.SKIN[2]); // 肌：緑をマイナスにして肌の印（空の映り込みを弱める。look を見る）
    }
    C.needsUpdate = true;
  }

  // 2.7.0 質感：色の暗い所（黒漆の具足・陣笠）はつやを出し、明るい灰色（刃・金具）は金属に。ふちを少し明るくして形を見やすく
  S.mats = [];
  S.setEnv = (env) => { for (const m of S.mats) { m.envMap = env; m.envMapIntensity = 0.55; m.needsUpdate = true; } };
  function look(sh, metal, skin) {
    // 2.22.0 肌（緑がマイナスの印）は空の明るさを強く映さない。戦場では空の映り込みで白っぽく見えていた
    if (skin) sh.fragmentShader = 'varying float vSk_;\n' + sh.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n  if (vSk_ > 0.5) { iblIrradiance *= 0.3; radiance *= 0.15; }');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n#ifdef USE_COLOR\n  float lum_ = dot(vColor.rgb, vec3(0.299, 0.587, 0.114)), sat_ = max(vColor.r, max(vColor.g, vColor.b)) - min(vColor.r, min(vColor.g, vColor.b));\n  roughnessFactor = mix(0.42, 0.88, smoothstep(0.04, 0.22, lum_));\n#endif')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n#ifdef USE_COLOR\n' + (metal ? '  if (lum_ > 0.45 && sat_ < 0.12) { metalnessFactor = 0.9; roughnessFactor = 0.3; }\n' : '  if (lum_ > 0.6 && sat_ < 0.08 && lum_ < 0.85) { metalnessFactor = 0.5; roughnessFactor = 0.45; }\n') + '#endif')
      .replace('#include <dithering_fragment>', '  { float rim_ = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0); gl_FragColor.rgb += vec3(1.0, 0.93, 0.8) * pow(rim_, 3.0) * ' + (skin ? '0.22 * (1.0 - 0.8 * vSk_)' : '0.22') + '; }\n#include <dithering_fragment>');
  }
  const stdMat = (metal) => { const m = new T.MeshStandardMaterial({ vertexColors: true, side: T.DoubleSide, roughness: 0.85, metalness: 0 }); S.mats.push(m); return m; };
  // 部位色はプレイヤー単位で共有し、各兵に行番号だけ渡す。列0は従来の一括染色。
  const paletteWidth = 6, paletteRows = 256;
  let paletteTex;
  const paletteIndex = new Map();
  let paletteCache = new WeakMap();
  function paletteRow(colors, tint) {
    let rows = paletteCache.get(colors);
    if (!rows) paletteCache.set(colors, (rows = new Map()));
    if (rows.has(tint)) return rows.get(tint);
    const key = [tint ? tint.getHex() : '', ...colors].join('/');
    if (paletteIndex.has(key)) {
      const row = paletteIndex.get(key);
      rows.set(tint, row);
      return row;
    }
    const row = paletteIndex.size;
    if (row >= paletteRows) return -1;
    const data = paletteTex.image.data;
    for (let i = 0; i < paletteWidth; i++) {
      const color = i === 0 ? tint : colors[i - 1] && new T.Color(colors[i - 1]);
      const offset = (row * paletteWidth + i) * 4;
      data[offset] = color ? Math.round(color.r * 255) : 0;
      data[offset + 1] = color ? Math.round(color.g * 255) : 0;
      data[offset + 2] = color ? Math.round(color.b * 255) : 0;
      data[offset + 3] = color ? 255 : 0;
    }
    paletteIndex.set(key, row);
    rows.set(tint, row);
    paletteTex.needsUpdate = true;
    return row;
  }

  // 焼き込んだ骨の行列で体を動かす素材（影用も）
  function skinMat(b, depth) {
    const m = depth ? new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }) : stdMat(false);
    m.onBeforeCompile = (sh) => {
      if (!depth) look(sh, false, true);
      const painted = b.paintedArmor && !depth;
      if (painted) sh.uniforms.partPalette = { value: paletteTex };
      sh.uniforms.bT = { value: b.tex }; sh.uniforms.bS = { value: new T.Vector2(b.nb * 4, b.H) }; sh.uniforms.bU = { value: b.upper };
      // aR＝(下半身の行, 上半身の行, 白く光る量)。aC＝上半身を下半身の腰につなぐ行列
      sh.vertexShader = [
        painted ? 'uniform sampler2D partPalette;' : '',
        'uniform sampler2D bT; uniform vec2 bS; uniform float bU[64]; attribute vec4 skinIndex; attribute vec4 skinWeight; attribute vec4 aR; attribute mat4 aC; varying float vSk_;',
        'mat4 bM(float i) { bool up = bU[int(i + 0.5)] > 0.5; float y = ((up ? aR.y : aR.x) + 0.5) / bS.y, dx = 1.0 / bS.x, x = (i * 4.0 + 0.5) * dx;',
        '  mat4 m = mat4(texture2D(bT, vec2(x, y)), texture2D(bT, vec2(x + dx, y)), texture2D(bT, vec2(x + 2.0 * dx, y)), texture2D(bT, vec2(x + 3.0 * dx, y)));',
        '  return up ? aC * m : m; }',
        sh.vertexShader
          .replace('#include <skinbase_vertex>', 'mat4 skM = skinWeight.x * bM(skinIndex.x) + skinWeight.y * bM(skinIndex.y) + skinWeight.z * bM(skinIndex.z) + skinWeight.w * bM(skinIndex.w);')
          .replace('#include <skinnormal_vertex>', 'objectNormal = normalize(mat3(skM) * objectNormal);')
          .replace('#include <skinning_vertex>', 'transformed = (skM * vec4(transformed, 1.0)).xyz;')
          .replace('#include <color_vertex>', [
            '#include <color_vertex>',
            '#ifdef USE_COLOR',
            'bool cloth = vColor.r < 0.0; vSk_ = vColor.g < 0.0 ? 1.0 : 0.0; vColor.rgb = abs(vColor.rgb);',
            painted ? 'float part = floor(vColor.r * 0.5); vColor.r -= part * 2.0;' : '',
            'vec4 chosen = vec4(0.0);',
            'if (aR.w >= 0.0 && cloth) chosen = vec4(vec3(floor(aR.w / 65536.0), mod(floor(aR.w / 256.0), 256.0), mod(aR.w, 256.0)) / 255.0, 1.0);',
            painted ? `if (aR.w <= -2.0 && part > 0.0) {
              float y = (-aR.w - 1.5) / ${paletteRows}.0;
              chosen = texture2D(partPalette, vec2((part + 0.5) / ${paletteWidth}.0, y));
              if (chosen.a == 0.0 && cloth) chosen = texture2D(partPalette, vec2(0.5 / ${paletteWidth}.0, y));
            }` : '',
            'if (chosen.a > 0.0) vColor.rgb = chosen.rgb * (0.45 + 0.9 * dot(vColor.rgb, vec3(0.299, 0.587, 0.114)));',
            'vColor.rgb = mix(vColor.rgb, vec3(1.0), aR.z);',
            '#endif'
          ].join('\n')),
      ].join('\n');
    };
    m.customProgramCacheKey = () => 'sold3d7' + (depth ? 'd' : b.paintedArmor ? 'p' : 'c');
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
    paletteTex = new T.DataTexture(new Uint8Array(paletteWidth * paletteRows * 4), paletteWidth, paletteRows);
    paletteTex.needsUpdate = true;
    Promise.all([get('soldier_anims.glb'), ...[1, 2, 3, 4].map((i) => get(S.modelFile(i))), get('equip/horse_brown.glb'), get('equip/horse_white.glb'), ...WEPS.map((n) => get(`equip/${n}.glb`)), get('ninja_anims.glb').catch(() => null)]).then((g) => {
      const an = g[0]; let aHip = 0;
      an.scene.traverse((o) => { if (!aHip && /Hips$/.test(o.name)) aHip = o.position.length(); });
      const clips = an.animations.map((c) => [c.name, c]);
      { /* 2.69.1 忍びの梯子登りの動き（ninja_anims.glb）を、壁を登る時にも使う。体の上がりは消して、その場で登る */
        const ng = g[7 + WEPS.length], lc = ng && ng.animations.find((c) => c.name === 'climb_ladder');
        if (lc) { const cc = lc.clone(); for (const tr of cc.tracks) if (/Hips\.position$/.test(tr.name)) { const v = Float32Array.from(tr.values), n = v.length / 3; if (n > 1) for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) v[i * 3 + a] -= (v[(n - 1) * 3 + a] - v[a]) * i / (n - 1); tr.values = v; } clips.push(['climb_ladder', cc]); }
      }
      // 首と頭は回転だけ共用し、骨の間隔は兵士モデルごとの値を使う。
      const soldierClips = clips.map(([name, clip]) => [name, new T.AnimationClip(
        clip.name, clip.duration, clip.tracks.filter((track) => !/(?:Neck|Head)\.position$/.test(track.name)), clip.blendMode
      )]);
      for (let i = 0; i < 4; i++) {
        let h = 0; g[1 + i].scene.traverse((o) => { if (!h && o.isBone && /Hips$/.test(o.name)) h = o.position.length(); });
        const paintedArmor = i < 3;
        const bk = bake(g[1 + i], soldierClips, h && aHip ? h / aHip : 1, i > 0, paintedArmor);
        if (!paintedArmor) skinTone(bk.geo, bk.boneNames); // 2.21.0 兵の肌の色をそろえる（馬には使わない）
        const b = mkSkin(bk, cap, scene);
        const rr = b.rows.ride; b.hipSit = rr && b.att.Hips ? b.att.Hips[rr.r0 * 16 + 13] : 0.53; // 座った姿勢の腰の高さ
        S.tiers.push(b);
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
  S.begin = () => {
    if (paletteIndex.size >= paletteRows) {
      paletteIndex.clear();
      paletteCache = new WeakMap();
    }
    for (const b of all()) b.n = 0;
  };
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
  S.put = (b, m, row, fx, rowU, cs, tint, parts) => { // tint＝服の色 THREE.Color（なければ元の色）
    if (b.n >= b.cap) return false; const n = b.n;
    b.im.setMatrixAt(n, m);
    b.ra.array[n * 4] = row; b.ra.array[n * 4 + 1] = rowU == null ? row : rowU; b.ra.array[n * 4 + 2] = fx || 0;
    const palette = b.paintedArmor && parts ? paletteRow(parts, tint) : -1;
    b.ra.array[n * 4 + 3] = palette >= 0 ? -2 - palette : tint ? Math.round(Math.min(1, tint.r) * 255) * 65536 + Math.round(Math.min(1, tint.g) * 255) * 256 + Math.round(Math.min(1, tint.b) * 255) : -1; // 2.12.5 服の色
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
  let v1, v2, v3, v4, mT, handRot, twoRot;
  // cw：歩きながら攻撃するとき、上半身を腰につなぐ行列（S.combo の cw）
  S.weapon = (b, row, kind, clip, out, cw, grip = 1) => { weapon0(b, row, kind, clip, out, grip); if (cw) out.premultiply(cw); return out; };
  const weapon0 = (b, row, kind, clip, out, grip) => {
    if (!v1) { v1 = new T.Vector3(); v2 = new T.Vector3(); v3 = new T.Vector3(); v4 = new T.Vector3(); mT = new T.Matrix4(); handRot = new T.Quaternion(); twoRot = new T.Quaternion(); }
    const side = kind === 'bow' ? 'L' : 'R';
    S.hand(b, row, side, out).multiply(S.grip(side));
    if (clip === 'carry') {
      // 武器ごとに、移動中に体の横で保つ向きを決める。
      if (kind === 'spear') v1.set(0, 0.16, 1);
      else if (kind === 'gun') v1.set(0, 0.74, 0.67);
      else if (kind === 'bow') v1.set(0, 1, 0.12);
      else v1.set(-0.16, -0.22, 1);
      v1.normalize();
      v2.setFromMatrixColumn(out, 1).normalize();
      v3.setFromMatrixPosition(out);
      return out.premultiply(mT.makeRotationFromQuaternion(handRot.setFromUnitVectors(v2, v1))).setPosition(v3);
    }
    const tw = TWO[kind]; if (!grip || !tw || (tw[0] !== clip && !(kind === 'gun' && (clip === 'gunCycle' || clip === 'gunSet')))) return out;
    const r = b.att.RightHand, l = b.att.LeftHand, o = row * 16;
    v1.set(l[o + 12] - r[o + 12], l[o + 13] - r[o + 13], l[o + 14] - r[o + 14]); if (v1.lengthSq() < 1e-4) return out;
    v1.normalize().multiplyScalar(tw[1]); // 武器の向き（+Y）
    v2.set(0, 1, 0); if (Math.abs(v1.y) > 0.95) v2.set(0, 0, 1);
    v3.crossVectors(v1, v2).normalize(); v4.crossVectors(v3, v1);
    v2.setFromMatrixPosition(out); mT.makeBasis(v3, v1, v4).setPosition(v2);
    if (grip === 1) return out.copy(mT);
    handRot.setFromRotationMatrix(out).slerp(twoRot.setFromRotationMatrix(mT), grip);
    return out.makeRotationFromQuaternion(handRot).setPosition(v2);
  };
  const gm = {};
  S.grip = (side) => {
    const G = S.GRIP[side], key = side + G.p.join() + G.r.join();
    if (!gm[side] || gm[side].k !== key) gm[side] = { k: key, m: new T.Matrix4().compose(new T.Vector3(...G.p), new T.Quaternion().setFromEuler(new T.Euler(...G.r)), new T.Vector3(1, 1, 1)) };
    return gm[side].m;
  };
})();
