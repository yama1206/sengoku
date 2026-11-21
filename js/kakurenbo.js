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
    { k: 'wn', n: '勝ち方', v: [['time', '時間まで隠れる'], ['escape', '鍵を集めて脱出']] },
    { k: 'cau', n: '見つかったら', v: [['seek', '探す側に回る'], ['out', 'その回は終わり']] },
  ];
  /* 2.71.0 キャラ（見た目＋パッシブ＋アクティブ）。逃げる側は人間、鬼は日本の妖怪。数値は仮
     キャラの足し方：①ここ（HD.CH）に { k, n, pa（パッシブの説明）, ac（アクティブの説明）, cd（待ち時間・秒） } を足す
       ②見た目：人間は mkHuman、妖怪は mkYokai に k の分岐を足す（足さなければ初期の見た目）
       ③アクティブ：make の中の useSkill に k の分岐を足す　④パッシブ：使う所で cho(p) === 'k' を見て効果をつける（速さは update の sp、外れた時は hurt など）
       部屋のキャラ選び（js/party.js）はこの一覧から自動で作られる */
  HD.CH = {
    h: [
      { k: 'ninja', n: '忍者', pa: '音の合図で居場所がつかまれにくい', ac: '忍び足：前へ短く瞬間移動', cd: 12 },
      { k: 'shonin', n: '商人', pa: '化けたあとも速く動ける', ac: '偽物：化けた物と同じ偽の置物をその場に出す（化けている時だけ）', cd: 20 },
      { k: 'miko', n: '巫女', pa: '鬼が近づくと気配で分かる', ac: 'お札：鬼の叩きを1回だけ無効にする', cd: 25 },
      { k: 'kodomo', n: '子ども', pa: '足が速く、叩かれにくい', ac: 'ダッシュ：3秒間とても速く走る', cd: 15 },
      { k: 'kariudo', n: '狩人', pa: '化けたあとの動きが少し速い', ac: '罠：足元に罠を置く。鬼が踏むと2.5秒動けない（鬼には見えない）', cd: 20 },
      { k: 'sou', n: '僧侶', pa: '天狗の風・河童の水・雪女の吹雪を受けない', ac: '読経：近くの鬼を3秒間、半分の速さにする', cd: 22 },
      { k: 'geinin', n: '旅芸人', pa: 'すぐ別の物に化けかえられる', ac: '声まね：前の離れた所から物音を出して、鬼を引きつける', cd: 18 },
    ],
    s: [
      { k: 'tengu', n: '天狗', pa: '足が速い', ac: '羽ばたき：前方に風を起こし、化けた人を人の姿に戻す', cd: 18 },
      { k: 'kappa', n: '河童', pa: '叩いて外してもすぐ動ける', ac: '水かけ：前方の人に印をつけ、6秒間光って見える', cd: 16 },
      { k: 'yuki', n: '雪女', pa: '近くの逃げる側が少し遅くなる', ac: '吹雪：周りの逃げる側が3秒間動けなくなる', cd: 22 },
      { k: 'neko', n: '化け猫', pa: '動いている逃げる側が近いと「？」が出る', ac: 'かぎつけ：いちばん近い逃げる側の方向を5秒間示す', cd: 20 },
      { k: 'oni', n: '赤鬼', pa: '置物を叩いて外しても体力が減らない', ac: '金棒：広い範囲をまとめて叩く', cd: 14 },
    ],
  };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r2 = (v) => Math.round(v * 100) / 100;
  const ROUND = 180, HIDE_T = 15, BEACON0 = 30, BEACON_EVERY = 22, R_HIT = 1.3, R_BIG = 3.2, SP_H = 4.2, SP_HS = 2.0, SP_S = 4.6;
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
  /* 人間（逃げる側）と妖怪（鬼）の見た目。あとで絵に置き換えるときはここだけ直す */
  function mkHuman(col, ch) {
    const g = new THREE.Group(), K = ch || 'ninja', sc = K === 'kodomo' ? 0.78 : 1;
    const body = { ninja: 0x23232b, shonin: 0x7a5a3a, miko: 0xf2f2f2, kodomo: 0xe0b43c, kariudo: 0x4f6a3a, sou: 0x4a3a6a, geinin: 0xd8503c }[K] || col;
    g.add(part(G('hb', () => new THREE.CylinderGeometry(0.28, 0.34, 0.95, 10)), M(body), 0, 0.5, 0));
    g.add(part(G('hs', () => new THREE.BoxGeometry(0.62, 0.1, 0.4)), M({ ninja: 0x8a2a2a, shonin: 0x3a2a1a, miko: 0xc8402f, kodomo: col, kariudo: 0x5a3d1c, sou: 0xe08a2a, geinin: 0xf2f2f2 }[K] || 0x3a2a1a), 0, 0.72, 0));
    g.add(part(G('hh', () => new THREE.SphereGeometry(0.22, 12, 10)), M(0xf0c9a0), 0, 1.2, 0));
    if (K === 'ninja') g.add(part(G('hn', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.9)), M(0x23232b), 0, 1.22, 0));
    else if (K === 'shonin') g.add(part(G('hm', () => new THREE.CylinderGeometry(0.12, 0.3, 0.2, 12)), M(0xc9a45a), 0, 1.45, 0));
    else if (K === 'miko') { g.add(part(G('hr', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.2)), M(0x2a2018), 0, 1.22, 0)); g.add(part(G('hrb', () => new THREE.BoxGeometry(0.1, 0.1, 0.5)), M(0xc8402f), 0, 1.42, 0)); }
    else if (K === 'kariudo') g.add(part(G('hf', () => new THREE.SphereGeometry(0.25, 12, 8, 0, 6.3, 0, 1.3)), M(0x7a5a2a), 0, 1.24, 0));
    else if (K === 'sou') g.add(part(G('hq', () => new THREE.TorusGeometry(0.2, 0.04, 6, 14)), M(0xe0b43c), 0, 0.86, 0.12));
    else if (K === 'geinin') g.add(part(G('hg', () => new THREE.ConeGeometry(0.22, 0.4, 8)), M(0xe0b43c), 0, 1.5, 0));
    else g.add(part(G('hk', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.2)), M(0x2a2018), 0, 1.22, 0));
    g.scale.setScalar(sc); return g;
  }
  function mkYokai(ch) {
    const g = new THREE.Group(), K = ch || 'oni';
    const body = { tengu: 0x7a2a2a, kappa: 0x4f9a5a, yuki: 0xdfeaf6, neko: 0x6a4a8a, oni: 0xc2362c }[K] || 0xb03030;
    const hb = part(G('yb' + K, () => new THREE.CylinderGeometry(0.34, 0.42, K === 'yuki' ? 1.4 : 1.05, 10)), M(body), 0, K === 'yuki' ? 0.7 : 0.55, 0); g.add(hb);
    const face = { tengu: 0xd8503c, kappa: 0x6bbf74, yuki: 0xf4f8ff, neko: 0x8a6aaa, oni: 0xd8453a }[K];
    g.add(part(G('yh', () => new THREE.SphereGeometry(0.27, 12, 10)), M(face), 0, K === 'yuki' ? 1.65 : 1.35, 0));
    const hy = K === 'yuki' ? 1.65 : 1.35;
    if (K === 'tengu') { const n = part(G('tn', () => new THREE.ConeGeometry(0.1, 0.45, 8)), M(0xd8503c), 0, hy - 0.02, 0.32); n.rotation.x = Math.PI / 2; g.add(n); g.add(part(G('tw', () => new THREE.BoxGeometry(1.5, 0.7, 0.08)), M(0x2a2a2a), 0, 0.85, -0.3)); g.add(part(G('tc', () => new THREE.CylinderGeometry(0.16, 0.2, 0.16, 8)), M(0x1a1a1a), 0, hy + 0.3, 0)); }
    else if (K === 'kappa') { g.add(part(G('kd', () => new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12)), M(0xdfe8d8), 0, hy + 0.27, 0)); const b = part(G('kb', () => new THREE.ConeGeometry(0.09, 0.2, 6)), M(0xe0b43c), 0, hy - 0.04, 0.3); b.rotation.x = Math.PI / 2; g.add(b); g.add(part(G('ks', () => new THREE.SphereGeometry(0.4, 10, 8)), M(0x3a7a44), 0, 0.85, -0.25)); }
    else if (K === 'yuki') { g.add(part(G('yu', () => new THREE.SphereGeometry(0.29, 12, 8, 0, 6.3, 0, 1.4)), M(0x1a1a24), 0, hy + 0.03, -0.02)); g.add(part(G('yo', () => new THREE.CylinderGeometry(0.36, 0.5, 0.12, 12)), M(0x6a9ac8), 0, 0.1, 0)); }
    else if (K === 'neko') { for (const x of [-0.16, 0.16]) g.add(part(G('ne', () => new THREE.ConeGeometry(0.1, 0.22, 4)), M(0x6a4a8a), x, hy + 0.3, 0)); for (const x of [-0.18, 0.18]) { const t = part(G('nt', () => new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6)), M(0x6a4a8a), x, 0.8, -0.4); t.rotation.x = -0.6; g.add(t); } }
    else { for (const x of [-0.14, 0.14]) g.add(part(G('oh', () => new THREE.ConeGeometry(0.07, 0.25, 6)), M(0xf2e8c8), x, hy + 0.3, 0)); const c = part(G('oc', () => new THREE.CylinderGeometry(0.08, 0.14, 1.3, 8)), M(0x4a3a2a), 0.5, 0.8, 0.1); c.rotation.z = -0.3; g.add(c); g.add(part(G('ok', () => new THREE.SphereGeometry(0.16, 8, 6)), M(0x2a2a2a), 0.65, 1.4, 0.1)); }
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
    const o = Object.assign({ st: 'street', sk: 1, mv: 'slow', wn: 'time', cau: 'seek' }, cfg.o || {}), stg = STAGES[o.st] || STAGES.street;
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
    const chOf0 = (id, r) => { const m = (cfg.mem || []).find((x) => x.id === id), c = m && m.ch && m.ch[r]; return HD.CH[r].some((x) => x.k === c) ? c : HD.CH[r][0].k; };
    order.forEach((id, i) => {
      const sk = i < nSk, [x, z] = sk ? [(i - (nSk - 1) / 2) * 2, HZ - 3.2] : free(0.6);
      P[id] = { id, role: sk ? 's' : 'h', role0: sk ? 's' : 'h', x, z, tx: x, tz: z, fx: 0, fz: -1, form: null, mv: 0, hp: 3, out: false, caught: 0, stun: 0, cd: 0, fcd: 0, grp: null, key: '', bob: 0, chh: chOf0(id, 'h'), chs: chOf0(id, 's'), sk: 0, boost: 0, freeze: 0, slowT: 0, shield: false, arrowT: 0 };
    });
    const cho = (p) => (p.role === 'h' ? p.chh : p.chs), chN = (p) => (HD.CH[p.role].find((x) => x.k === cho(p)) || HD.CH[p.role][0]).n, marks = {};
    const cpu = solo ? { id: '__cpu', x: 0, z: HZ - 3, fx: 0, fz: -1, cd: 1.5, tgt: null, grp: mkYokai('oni'), mv: 0 } : null; if (cpu) scene.add(cpu.grp);
    // 脱出モード：鍵が4つ、3つ集めると鳥居の出口が開く（出口に着いた人は脱出成功）
    const esc = o.wn === 'escape', NK = 4, NEED = 3, keys = [], exitP = { x: 0, z: -HZ + 3, open: false }; let kgot = 0, exM = null, exBeam = null;
    if (esc) {
      for (let i = 0; i < NK; i++) { let q = null; for (let k = 0; k < 80 && !q; k++) { const [x, z] = free(1); if (z < HZ - 7 && keys.every((y) => Math.hypot(y.x - x, y.z - z) > 8)) q = { x, z }; } if (!q) { const [x, z] = free(1); q = { x, z }; } q.got = false; const gk = new THREE.Group(); gk.add(part(G('kyb', () => new THREE.BoxGeometry(0.5, 0.18, 0.3)), new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x806010 }), 0, 0.8, 0)); gk.add(part(G('kyr', () => new THREE.TorusGeometry(0.2, 0.05, 6, 12)), new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x806010 }), -0.35, 0.8, 0)); const bm = new THREE.Mesh(G('kyl', () => new THREE.CylinderGeometry(0.1, 0.1, 3, 8)), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.35, depthWrite: false })); bm.position.y = 1.5; gk.add(bm); gk.position.set(q.x, 0, q.z); scene.add(gk); q.m = gk; keys.push(q); }
      for (let k = 0; k < 80; k++) { const [x, z] = free(2.5); if (z < -HZ * 0.25 && keys.every((y) => Math.hypot(y.x - x, y.z - z) > 5)) { exitP.x = x; exitP.z = z; break; } }
      exM = new THREE.Group(); const rm = M(0xc8402f); for (const x of [-1.8, 1.8]) exM.add(part(G('tp', () => new THREE.CylinderGeometry(0.25, 0.3, 3.4, 10)), rm, x, 1.7, 0)); exM.add(part(G('tk', () => new THREE.BoxGeometry(4.8, 0.32, 0.7)), M(0x2a2a2a), 0, 3.5, 0)); exM.add(part(G('tn2', () => new THREE.BoxGeometry(3.8, 0.22, 0.34)), rm, 0, 2.8, 0));
      exBeam = new THREE.Mesh(G('exb', () => new THREE.CylinderGeometry(1.5, 1.5, 6, 16, 1, true)), new THREE.MeshBasicMaterial({ color: 0x7affa0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); exBeam.position.y = 3; exBeam.visible = false; exM.add(exBeam); exM.position.set(exitP.x, 0, exitP.z); scene.add(exM);
    }
    const MY = P[me], nm = (id) => (id === '__cpu' ? '見回り' : env.names[id] || '？');
    // カメラ（斜め上から見下ろす）
    const cam = new T3.OrthographicCamera(-10, 10, 10, -10, 0.1, 120), VH = 21; let camX = MY.x, camZ = MY.z;
    const fitCam = () => { rd.setSize(innerWidth, innerHeight, false); const a = innerWidth / Math.max(1, innerHeight); cam.left = -VH * a / 2; cam.right = VH * a / 2; cam.top = VH / 2; cam.bottom = -VH / 2; cam.updateProjectionMatrix(); }; fitCam(); addEventListener('resize', fitCam);
    const setCam = () => { cam.position.set(camX + 15, 17, camZ + 15); cam.lookAt(camX, 0, camZ); };
    // 印（探す先の輪・叩いた所・ビーコン）
    const ring = (c, ri, ro) => { const m = new T3.Mesh(new T3.RingGeometry(ri, ro, 28), new T3.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, side: T3.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; scene.add(m); return m; };
    const nz = ring(0x70c8ff, 4.6, 5), hl = ring(0xffe070, 0.7, 0.85), bc = ring(0xff8040, 5.6, 6), sw = ring(0xffffff, 0.9, 1.3), swm = ring(0xff4040, 0.9, 1.3);

    // 状態
    const FX = [], traps = []; let nzo = null, t = 0, phase = 'hide', done = false, toast = null, toastT = 0, pend = null, sendT = 0, bk = 0, beacon = null, bcT = 0, last = { aT: 0 };
    const say = (s) => { toast = s; toastT = 3; };
    const alive = (p) => p && !p.out && !p.esc && !env.gone[p.id];
    const hiders = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 'h');
    const seekers = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 's' && p.hp > 0);
    const look = (p) => { // 見た目（化けていれば置物、そうでなければ人）
      const key = p.role === 'h' && p.form ? p.form.k + p.form.v : 'p' + p.role + cho(p); if (key === p.key && p.grp) return; p.key = key;
      if (p.grp) scene.remove(p.grp);
      p.grp = p.role === 'h' && p.form ? mkProp(p.form.k, p.form.v) : p.role === 's' ? mkYokai(cho(p)) : mkHuman(hex(col(p.id)), cho(p)); scene.add(p.grp);
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
    const strike = (p, big) => {
      if (p.cd > 0 || p.stun > 0) return; p.cd = 0.8; const R = big ? R_BIG : R_HIT, off = big ? 1.5 : 1.2, x = p.x + p.fx * off, z = p.z + p.fz * off; FX.push({ x, z, t: 0.25, bad: false, big }); SGK.AUDIO.sfx(big ? 'hit' : 'slash');
      if (p === MY) { tell({ k: 'hs', id: me, x: r2(x), z: r2(z), r: R }); pend = { t: 0.5, x, z, R, ok: false }; }
    };
    const addDecoy = (x, z, kd, v, rot) => { const q = { x, z, kind: kd, v, rot, dc: 1, m: mkProp(kd, v) }; q.m.position.set(x, 0, z); q.m.rotation.y = rot; scene.add(q.m); props.push(q); };
    const addTrap = (tid, x, z) => { const m = new THREE.Mesh(G('trg', () => new THREE.RingGeometry(0.35, 0.75, 14)), new THREE.MeshBasicMaterial({ color: 0x6b3a1a, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); scene.add(m); traps.push({ tid, x, z, m }); };
    const useSkill = () => {
      const ch = cho(MY), def = HD.CH[MY.role].find((x) => x.k === ch); if (!def || MY.sk > 0 || MY.stun > 0 || !alive(MY)) return;
      if (MY.role === 's' && phase === 'hide') return;
      let ok = true; const fx = MY.fx, fz = MY.fz;
      if (ch === 'ninja') { let d = 0; for (let k = 0.25; k <= 5; k += 0.25) { if (!blocked(MY.x + fx * k, MY.z + fz * k, 0.4)) d = k; else break; } MY.x += fx * d; MY.z += fz * d; FX.push({ x: MY.x, z: MY.z, t: 0.3, bad: false }); SGK.AUDIO.sfx('kaiFlip'); }
      else if (ch === 'shonin') { if (!MY.form) { say('偽物は、化けている時に使えます'); ok = false; } else { let x = MY.x - fx * 2, z = MY.z - fz * 2; if (blocked(x, z, 0.5)) { x = MY.x; z = MY.z; } const rot = Math.random() * 6.28; addDecoy(x, z, MY.form.k, MY.form.v, rot); tell({ k: 'dc', x: r2(x), z: r2(z), kd: MY.form.k, v: MY.form.v, rot: r2(rot) }); say('偽物を置いた'); SGK.AUDIO.sfx('kmrKick'); } }
      else if (ch === 'miko') { MY.shield = true; say('お札を構えた（次の叩きを1回防ぐ）'); SGK.AUDIO.sfx('open'); }
      else if (ch === 'kodomo') { MY.boost = 3; say('ダッシュ！'); }
      else if (ch === 'kariudo') { const tid = me + ':' + Math.floor(t * 10); addTrap(tid, MY.x, MY.z); tell({ k: 'tr', tid, x: r2(MY.x), z: r2(MY.z) }); say('罠を置いた'); SGK.AUDIO.sfx('carve'); }
      else if (ch === 'geinin') { let x = MY.x + fx * 7, z = MY.z + fz * 7; for (let k = 7; k > 0 && blocked(x, z, 0.4); k -= 1) { x = MY.x + fx * k; z = MY.z + fz * k; } nzo = { x, z, t: 5 }; tell({ k: 'ns', x: r2(x), z: r2(z) }); say('声まねをした'); SGK.AUDIO.sfx('news'); }
      else if (ch === 'tengu' || ch === 'kappa' || ch === 'yuki' || ch === 'sou') { tell({ k: 'sk', s: ch, id: me, x: r2(MY.x), z: r2(MY.z), fx: r2(fx), fz: r2(fz) }); FX.push({ x: MY.x + (ch === 'yuki' || ch === 'sou' ? 0 : fx * 2.5), z: MY.z + (ch === 'yuki' || ch === 'sou' ? 0 : fz * 2.5), t: 0.5, bad: false, big: true }); SGK.AUDIO.sfx(ch === 'yuki' || ch === 'sou' ? 'zawa' : 'bow'); say(ch === 'tengu' ? '羽ばたき！' : ch === 'kappa' ? '水かけ！' : ch === 'yuki' ? '吹雪！' : '読経…'); }
      else if (ch === 'neko') { MY.arrowT = 5; say('においをかぎつけた…'); }
      else if (ch === 'oni') { MY.cd = 0; strike(MY, true); }
      if (ok) MY.sk = def.cd;
    };
    const caught = (id, by) => {
      const p = P[id]; if (!p || p.role !== 'h') return; p.form = null; p.caught0 = true; if (o.cau === 'out') p.out = true; else { p.role = 's'; p.hp = 3; }
      if (P[by]) P[by].caught++; say(`${nm(id)}が見つかった！`); SGK.AUDIO.sfx('hit');
    };
    const hurt = (p) => { if (cho(p) !== 'oni') p.hp--; p.stun = cho(p) === 'kappa' ? 0.4 : 1; FX.push({ x: p.x, z: p.z, t: 0.4, bad: true }); SGK.AUDIO.sfx('gbLose'); if (p === MY) { tell({ k: 'hl', id: me, hp: p.hp }); say(p.hp > 0 ? (cho(p) === 'oni' ? '外れ！ ただの置物だった' : '外れ！ ただの置物だった（体力-1）') : '体力がなくなった…'); } };

    const game = {
      msg(from, m) {
        const p = P[m.id || from];
        if (m.k === 'hp') { const q = P[from]; if (!q) return; q.tx = m.x; q.tz = m.z; q.fx = m.fx; q.fz = m.fz; q.mv = m.m; const f = m.f ? { k: m.f[0], v: m.f[1] } : null; if (q.role === 'h') q.form = f; }
        else if (m.k === 'hs') { if (MY.role === 'h' && alive(MY) && phase !== 'end' && Math.hypot(m.x - MY.x, m.z - MY.z) < (m.r || R_HIT) * (cho(MY) === 'kodomo' ? 0.78 : 1)) { if (MY.shield) { MY.shield = false; tell({ k: 'hb', by: m.id }); say('お札が鬼の一撃を防いだ！'); SGK.AUDIO.sfx('open'); } else { caught(me, m.id); tell({ k: 'hc', id: me, by: m.id }); } } }
        else if (m.k === 'hb') { if (m.by === me) { MY.stun = 1.2; if (pend) pend.ok = true; say('お札にはじかれた！'); } }
        else if (m.k === 'tr') { addTrap(m.tid, m.x, m.z); }
        else if (m.k === 'tx') { const i = traps.findIndex((q) => q.tid === m.tid); if (i >= 0) { scene.remove(traps[i].m); traps.splice(i, 1); } if (m.by) { FX.push({ x: m.x, z: m.z, t: 0.5, bad: true }); SGK.AUDIO.sfx('hit'); } }
        else if (m.k === 'ns') { nzo = { x: m.x, z: m.z, t: 5 }; SGK.AUDIO.sfx('news'); say('どこかで声がした…'); }
        else if (m.k === 'dc') { addDecoy(m.x, m.z, m.kd, m.v, m.rot); }
        else if (m.k === 'mk') { marks[m.id] = 6; }
        else if (m.k === 'kp') { const q = keys[m.i]; if (q && !q.got) { q.got = true; q.m.visible = false; kgot++; say(`鍵が見つかった（${kgot}/${NEED}）`); if (kgot >= NEED && !exitP.open) { exitP.open = true; say('出口が開いた！'); } } }
        else if (m.k === 'es') { const q = P[m.id]; if (q) { q.esc = true; say(`${nm(m.id)}が脱出した！`); SGK.AUDIO.sfx('gbWin'); } }
        else if (m.k === 'sk') {
          FX.push({ x: m.x + (m.s === 'yuki' || m.s === 'sou' ? 0 : m.fx * 2.5), z: m.z + (m.s === 'yuki' || m.s === 'sou' ? 0 : m.fz * 2.5), t: 0.5, bad: false, big: true });
          if (m.s === 'sou' && MY.role === 's' && alive(MY) && Math.hypot(MY.x - m.x, MY.z - m.z) < 6) { MY.slowT = 3; say('読経で足が重い…'); }
          if (MY.role === 'h' && alive(MY) && cho(MY) !== 'sou') { const dx = MY.x - m.x, dz = MY.z - m.z, d = Math.hypot(dx, dz) || 0.01, dot = (dx * m.fx + dz * m.fz) / d;
            if (m.s === 'tengu' && d < 5.5 && dot > 0.4) { MY.form = null; MY.fcd = 3; say('天狗の風で姿があらわになった！'); }
            else if (m.s === 'kappa' && d < 6 && dot > 0.5) { marks[me] = 6; tell({ k: 'mk', id: me }); say('水をかけられた！しばらく光って見える'); }
            else if (m.s === 'yuki' && d < 7) { MY.freeze = 3; say('吹雪で動けない！'); } }
        }
        else if (m.k === 'hc') { if (P[m.id] && P[m.id].role === 'h') caught(m.id, m.by); if (m.by === me && pend) pend.ok = true; }
        else if (m.k === 'hl') { if (p) p.hp = m.hp; }
      },
      update(dt) {
        t += dt; phase = t < HIDE_T ? 'hide' : 'play'; toastT -= dt;
        for (const id of ids) { const p = P[id]; p.cd -= dt; p.stun -= dt; p.fcd -= dt; p.sk = Math.max(0, p.sk - dt); p.boost -= dt; p.freeze -= dt; p.slowT -= dt; p.arrowT -= dt; }
        for (const k in marks) marks[k] -= dt;
        // 自分の操作
        const [ix, iy] = inVec(), wx = RIGHT[0] * ix + FWD[0] * -iy, wz = RIGHT[1] * ix + FWD[1] * -iy, ml = Math.hypot(wx, wz);
        const act = alive(MY) && !done; MY.mv = 0;
        if (act && MY.stun <= 0) {
          const locked = MY.role === 's' && phase === 'hide';
          const dis = MY.role === 'h' && MY.form;
          if (!locked && MY.freeze <= 0 && ml > 0.05) {
            if (dis && o.mv === 'none') { const a = Math.atan2(MY.fx, MY.fz) - ix * 3 * dt; MY.fx = Math.sin(a); MY.fz = Math.cos(a); }
            else { const c = cho(MY); let sp; if (MY.role === 's') { sp = c === 'tengu' ? 5.2 : SP_S; if (MY.slowT > 0) sp *= 0.5; } else { sp = dis ? (c === 'shonin' ? 3.2 : c === 'kariudo' ? 2.6 : SP_HS) : (c === 'kodomo' ? 5.0 : SP_H); if (MY.boost > 0) sp *= 1.8; if (seekers().some((q) => q.id !== me && cho(q) === 'yuki' && Math.hypot(q.x - MY.x, q.z - MY.z) < 3.5)) sp *= 0.85; } moveBy(MY, wx / Math.max(1, ml) * sp * dt, wz / Math.max(1, ml) * sp * dt, 0.4); MY.fx = wx / ml; MY.fz = wz / ml; MY.mv = 1; }
          }
          if (IN.aT) {
            if (MY.role === 's') { if (!locked) strike(MY); }
            else if (MY.fcd <= 0) { const q = near(MY.x, MY.z, 2.4); if (q) { MY.form = { k: q.kind, v: q.v }; MY.fcd = cho(MY) === 'geinin' ? 0.2 : 0.8; SGK.AUDIO.sfx('kmrKick'); say(`${KIND[q.kind]}に化けた`); } else say('近くに化けられる物がありません'); }
          }
          if (IN.cT) useSkill();
          if (IN.bT && MY.role === 'h' && MY.form) { MY.form = null; MY.fcd = 0.5; say('人の姿に戻った'); }
        }
        // 鍵・出口
        if (esc && act && MY.role === 'h') {
          keys.forEach((q, i) => { if (!q.got && Math.hypot(q.x - MY.x, q.z - MY.z) < 1.3) { q.got = true; q.m.visible = false; kgot++; tell({ k: 'kp', i }); say(`鍵を手に入れた（${kgot}/${NEED}）`); SGK.AUDIO.sfx('coin'); if (kgot >= NEED && !exitP.open) { exitP.open = true; say('出口が開いた！'); } } });
          if (exitP.open && Math.hypot(exitP.x - MY.x, exitP.z - MY.z) < 1.9) { MY.esc = true; tell({ k: 'es', id: me }); say('脱出成功！'); SGK.AUDIO.sfx('gbWin'); }
        }
        if (esc) { keys.forEach((q) => { if (q.m.visible) q.m.rotation.y += dt * 2; }); if (exBeam) exBeam.visible = exitP.open; }
        // 送る
        sendT -= dt; if (sendT <= 0 && !solo) { sendT = 0.1; tell({ k: 'hp', x: r2(MY.x), z: r2(MY.z), fx: r2(MY.fx), fz: r2(MY.fz), m: MY.mv, f: MY.role === 'h' && MY.form ? [MY.form.k, MY.form.v] : 0 }); }
        // ほかの人の位置をなめらかに
        for (const id of ids) { if (id === me) continue; const p = P[id]; p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.z += (p.tz - p.z) * Math.min(1, dt * 12); }
        // 叩いた結果（ほかの人の「見つかった」が来なければ置物に当たっただけ）
        if (pend) { pend.t -= dt; if (pend.t <= 0) { if (!pend.ok && near(pend.x, pend.z, pend.R || R_HIT)) hurt(MY); pend = null; } }
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
          if (hs.length) { const q = hs[(bk * 5 + (cfg.seed % 7)) % hs.length], rr = mulberry((cfg.seed + bk * 977) >>> 0); const a = rr() * 6.28, d = (cho(q) === 'ninja' ? 4.5 : 0) + rr() * 3.5; beacon = { x: q.x + Math.cos(a) * d, z: q.z + Math.sin(a) * d }; bcT = 6; SGK.AUDIO.sfx('news'); say('どこかで物音がした…'); }
          bk++;
        } else if (solo && t > BEACON0 + bk * BEACON_EVERY) { bk++; }
        bcT -= dt;
        // 終わり？
        if (!done) {
          const hs = hiders(), ss = seekers(); let over = null;
          const escN = ids.filter((i) => P[i].esc).length, cgt = ids.filter((i) => P[i].caught0).length, hwin = escN > 0 && escN >= cgt;
          if (esc && solo && MY.esc) over = 'h'; else if (esc && !solo && !hs.length) over = hwin ? 'h' : 's'; else if (!solo && !hs.length) over = 's'; else if (solo && (!alive(MY) || MY.role !== 'h')) over = 's'; else if (!solo && !ss.length && phase === 'play') over = 'h'; else if (t >= ROUND) over = esc ? (solo ? 's' : hwin ? 'h' : 's') : 'h';
          if (over) { done = true; this.finish(over); }
        }
        // 絵に反映
        for (const id of ids) { const p = P[id]; if (p.role === 'h' && !p.form) { /* 人 */ } look(p); const gp = p.grp; if (!gp) continue; gp.visible = !p.out && !p.esc; p.bob += dt * (p.mv ? 9 : 0); const hop = p.mv ? Math.abs(Math.sin(p.bob)) * (p.role === 'h' && p.form ? 0.22 : 0.08) : 0; gp.position.set(p.x, hop, p.z); gp.rotation.y = Math.atan2(p.fx, p.fz); }
        if (cpu) { cpu.grp.position.set(cpu.x, 0, cpu.z); cpu.grp.rotation.y = Math.atan2(cpu.fx, cpu.fz); }
        camX += (MY.x - camX) * Math.min(1, dt * 6); camZ += (MY.z - camZ) * Math.min(1, dt * 6);
        // 印
        const q = MY.role === 'h' && alive(MY) ? near(MY.x, MY.z, 2.4) : null; hl.visible = !!q && act; if (q) hl.position.set(q.x, 0.06, q.z);
        if (MY.role === 's' && alive(MY) && MY.stun <= 0 && !done) for (const q of traps) if (Math.hypot(q.x - MY.x, q.z - MY.z) < 1.0) { MY.stun = 2.5; say('罠にかかった！'); tell({ k: 'tx', tid: q.tid, x: r2(q.x), z: r2(q.z), by: me }); scene.remove(q.m); traps.splice(traps.indexOf(q), 1); FX.push({ x: q.x, z: q.z, t: 0.5, bad: true }); SGK.AUDIO.sfx('hit'); break; }
        for (const q of traps) q.m.visible = MY.role !== 's';
        if (nzo) { nzo.t -= dt; nz.visible = nzo.t > 0; nz.position.set(nzo.x, 0.06, nzo.z); nz.scale.setScalar(1 + 0.1 * Math.sin(t * 10)); if (nzo.t <= 0) nzo = null; } else nz.visible = false;
        bc.visible = bcT > 0 && !!beacon; if (beacon) { bc.position.set(beacon.x, 0.06, beacon.z); bc.scale.setScalar(1 + 0.08 * Math.sin(t * 8)); }
        for (const f of FX) f.t -= dt; while (FX.length && FX[0].t <= 0) FX.shift();
        const f0 = FX.find((f) => !f.bad), f1 = FX.find((f) => f.bad); sw.visible = !!f0; if (f0) { sw.position.set(f0.x, 0.07, f0.z); sw.scale.setScalar((1 + (0.25 - f0.t) * 3) * (f0.big ? 2.6 : 1)); } swm.visible = !!f1; if (f1) { swm.position.set(f1.x, 0.07, f1.z); }
      },
      finish(over) {
        const ini = MY.role0, hs = ids.filter((i) => P[i].role0 === 'h'), surv = (id) => !P[id].caught0 && !env.gone[id];
        const win = ini === 'h' ? (esc ? !!P[me].esc : surv(me)) : over === 's';
        const rows = ids.map((id) => { const p = P[id]; return `<b style="color:${col(id)}">${nm(id)}</b>（${(HD.CH[p.role0].find((x) => x.k === (p.role0 === 'h' ? p.chh : p.chs)) || {}).n}）　${p.role0 === 'h' ? (esc ? (p.esc ? '脱出成功！' : surv(id) ? '脱出できなかった' : '見つかった') : surv(id) ? '隠れきった！' : '見つかった') : `探す側：${p.caught}人見つけた`}`; });
        env.end({ title: win ? (ini === 'h' ? (esc ? '脱出成功！' : '隠れきった！') : '全員見つけた！') : (ini === 'h' ? (P[me].caught0 ? '見つかってしまった…' : '脱出できなかった…') : '見つけきれなかった…'), rows, cmd: { type: 'partyResult', game: 'hide', n: ids.length, win: win ? 1 : 0, cnt: P[me].caught, role: ini } });
      },
      draw() {
        setCam(); rd.render(scene, cam);
        const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
        const txt = (s, x, y, o2) => env.text(g, s, x, y, o2), pj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
        // 名前（探す側は全員に、隠れる側は仲間にだけ）
        for (const id of ids) { const p = P[id]; if (!alive(p) || id === me) continue; if (!(p.role === 's' || MY.role === 'h' || !alive(MY))) continue; const [sx, sy] = pj(p.x, p.role === 'h' && p.form ? 1.5 : 2, p.z); txt(p.role === 's' ? `${nm(id)}（${chN(p)}）` : nm(id), sx, sy, { al: 'center', sz: 13, c: p.role === 's' ? '#ff9a8a' : '#cfe8ff' }); }
        if (cpu) { const [sx, sy] = pj(cpu.x, 2, cpu.z); txt('見回り', sx, sy, { al: 'center', sz: 13, c: '#ff9a8a' }); }
        { const [sx, sy] = pj(MY.x, MY.role === 'h' && MY.form ? 1.6 : 2.1, MY.z); txt('▼', sx, sy, { al: 'center', sz: 14, c: '#ffe070' }); }
        const rem = Math.max(0, Math.ceil(ROUND - t)); txt(`${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`, W / 2, 30, { al: 'center', sz: 26, b: 1 });
        txt(`${stg.name}　${MY.role === 's' ? '探す側' : MY.esc ? '脱出成功（観戦）' : alive(MY) ? '隠れる側' : '見つかった（観戦）'}　隠れている：${solo ? (alive(MY) ? 1 : 0) : hiders().length}人`, W / 2, 52, { al: 'center', sz: 14 });
        if (MY.role === 's') txt('体力 ' + '●'.repeat(Math.max(0, MY.hp)) + '○'.repeat(Math.max(0, 3 - MY.hp)), 16, 30, { sz: 20, c: '#ff9a8a' });
        else if (MY.form) txt(`いまの姿：${KIND[MY.form.k]}${o.mv === 'none' ? '（動けない・←→で向き）' : '（ゆっくり動ける）'}`, 16, 30, { sz: 16, c: '#ffe070' });
        // キャラ（パッシブ・アクティブ）
        { const def = HD.CH[MY.role].find((x) => x.k === cho(MY)) || HD.CH[MY.role][0], keyN = coarse ? 'スキルボタン' : 'E／Q／△(Y)';
          txt(`${def.n}　パッシブ：${def.pa}`, 16, H - 52, { sz: 13, c: '#cfe8ff' }); txt(`${keyN}：${def.ac.split('：')[0]}　${MY.sk > 0 ? `あと${Math.ceil(MY.sk)}秒` : '使える！'}`, 16, H - 34, { sz: 14, c: MY.sk > 0 ? '#aaa' : '#ffe070', b: MY.sk <= 0 });
          if (MY.shield) txt('お札を構えている', 16, 52, { sz: 14, c: '#ffe070' }); if (MY.boost > 0) txt('ダッシュ中！', 16, 52, { sz: 14, c: '#ffe070' }); if (MY.freeze > 0) txt('動けない！', 16, 52, { sz: 16, c: '#9ad0ff' }); }
        if (MY.role === 'h' && cho(MY) === 'miko' && alive(MY) && seekers().some((q) => Math.hypot(q.x - MY.x, q.z - MY.z) < 6)) { g.fillStyle = 'rgba(255,40,40,0.12)'; g.fillRect(0, 0, W, H); txt('鬼の気配！', W / 2, H * 0.36, { al: 'center', sz: 20, b: 1, c: '#ff8a8a' }); }
        if (MY.role === 's') {
          for (const id in marks) if (marks[id] > 0 && P[id] && alive(P[id]) && P[id].role === 'h') { const q = P[id], [sx, sy] = pj(q.x, 0.1, q.z); g.strokeStyle = '#7ad0ff'; g.lineWidth = 4; g.beginPath(); g.ellipse(sx, sy, 34, 18, 0, 0, 7); g.stroke(); }
          if (cho(MY) === 'neko') for (const q of hiders()) if (q.id !== me && q.mv && Math.hypot(q.x - MY.x, q.z - MY.z) < 8) { const [sx, sy] = pj(q.x, 2.1, q.z); txt('？', sx, sy, { al: 'center', sz: 26, b: 1, c: '#ffe070' }); }
          if (MY.arrowT > 0) { let b = null, bd = 1e9; for (const q of hiders()) { if (q.id === me) continue; const d = Math.hypot(q.x - MY.x, q.z - MY.z); if (d < bd) { bd = d; b = q; } } if (b) { const [ax, ay] = pj(MY.x, 1, MY.z), [bx, by] = pj(b.x, 1, b.z), l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l; txt('➤', ax + ux * 110, ay + uy * 110, { al: 'center', sz: 30, c: '#ffe070' }); txt(`${Math.round(bd)}m`, ax + ux * 140, ay + uy * 140 + 6, { al: 'center', sz: 14, c: '#ffe070' }); } }
        }
        if (esc) { txt(`鍵 ${kgot}/${NEED}　出口：${exitP.open ? '開いた！（鳥居へ）' : 'まだ閉じている'}`, W / 2, 74, { al: 'center', sz: 15, c: exitP.open ? '#9affb0' : '#ffe070' });
          if (exitP.open && MY.role === 'h' && alive(MY)) { const [ax, ay] = pj(MY.x, 1, MY.z), [bx, by] = pj(exitP.x, 1, exitP.z), l = Math.hypot(bx - ax, by - ay) || 1; if (l > 120) txt('出口 ➤', ax + (bx - ax) / l * 120, ay + (by - ay) / l * 120, { al: 'center', sz: 20, b: 1, c: '#9affb0' }); } }
        const qn = MY.role === 'h' && alive(MY) ? near(MY.x, MY.z, 2.4) : null;
        const hint = MY.role === 's' ? 'A／Space：叩く（置物を叩くと体力-1）　移動：矢印／WASD／スティック' : alive(MY) ? `${qn ? `A／Space：${KIND[qn.kind]}に化ける　` : ''}${MY.form ? 'B／X：人に戻る　' : ''}移動：矢印／WASD／スティック` : '';
        txt(hint, W / 2, H - 16, { al: 'center', sz: 14 });
        if (toastT > 0 && toast) txt(toast, W / 2, H * 0.28, { al: 'center', sz: 22, b: 1, c: '#ffe9a0' });
        if (phase === 'hide') { const left = Math.ceil(HIDE_T - t); if (MY.role === 's') { g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(0, 0, W, H); txt(`目をつぶって数えています… ${left}`, W / 2, H / 2, { al: 'center', sz: 28, b: 1 }); } else txt(esc ? `隠れよう！（あと${left}秒）鍵を3つ集めると出口が開く` : `隠れよう！（あと${left}秒）近くの物でAを押すと化けられる`, W / 2, H * 0.2, { al: 'center', sz: 20, b: 1, c: '#bff0c0' }); }
        if (MY.stun > 0) { g.fillStyle = 'rgba(255,0,0,0.18)'; g.fillRect(0, 0, W, H); }
        if (stick.on) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(stick.x0, stick.y0, 50, 0, 7); g.stroke(); g.beginPath(); g.arc(stick.x0 + stick.x * 50, stick.y0 + stick.y * 50, 20, 0, 7); g.fillStyle = 'rgba(255,255,255,.45)'; g.fill(); }
      },
      dispose() { removeEventListener('resize', fitCam); cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu); try { rd.dispose(); } catch (e) {} if (c3.parentNode) c3.parentNode.removeChild(c3); },
    };
    return game;
  };
})();
