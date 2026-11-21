// 2.70.0 「かくれんぼ？」（みんなで遊ぶ）：クォータービューのプロップハント風。隠れる側は木箱や樽などに化けて、探す側から逃げる
// 全員が同じ種（seed）で同じ舞台・置物を作り、それぞれの端末で動かして、位置と「化けた物」だけ送り合う（js/party.js の枠から呼ばれる）
//  - 探す側が叩く（hs）→ 叩かれた場所にいる隠れる側の端末が「見つかった」と決めて全員に知らせる（hc）
//  - 置物（本物）を叩いてしまうと探す側の体力が1減る
// 絵は仮：three.js の簡単な形（あとで置き換えやすいよう、置物は mkProp、人は mkHuman に分けてある）
(function () {
  const SGK = window.SGK, HD = (SGK.HIDE = {});
  const KIND = { sack: '麻袋', basket: '籠', sign: '立て札', bench: '長椅子', cart: '荷車', umbrella: '傘', firewood: '薪の山', haystack: '藁山', pot: '鉢植え', bush: '茂み', drum: '太鼓', cask: '酒樽', tub: '盥', stool: '腰掛け', shrine: '祠', rock: '大岩', crate: '木箱', barrel: '樽', jar: '壺', lantern: '石灯籠', stone: '石', bucket: '桶', bale: '米俵', stump: '切り株' };
  HD.KIND = KIND;
  HD.OPTS = [
    { k: 'wn', n: '勝ち方', v: [['time', '時間まで隠れる'], ['escape', '宝箱の鍵を集めて脱出']] },
    { k: 'st', n: '舞台', v: [['street', '町の通り'], ['castle', '城下'], ['yashiki', '屋敷の庭'], ['rooms', '大きな屋敷（部屋がたくさん）']] },
    { k: 'mv', n: '化けたあとの動き', v: [['slow', 'ゆっくり動ける'], ['none', '動けない']] },
    { k: 'cau', n: '見つかったら', v: [['seek', '探す側に回る'], ['out', 'その回は終わり']] },
    { k: 'on', n: '鬼の人数', v: [['1', '1人'], ['2', '2人']] }, // 2.96.0
    { k: 'hn', n: '逃げる側の人数', v: [['4', '4人'], ['5', '5人'], ['6', '6人'], ['7', '7人'], ['8', '8人']] }, // 2.96.0 足りない分はCPUが加わる（CPUありのとき）
    { k: 'cpS', n: '鬼のCPU', v: [['off', 'なし'], ['1', 'よわい'], ['2', 'ふつう'], ['3', 'つよい']] }, // 2.95.0 立候補した人がいなければ、鬼をCPUがやる
    { k: 'cpH', n: '逃げる側のCPU', v: [['off', 'なし'], ['1', 'よわい'], ['2', 'ふつう'], ['3', 'つよい']] }, // 2.95.0 逃げる側が4人になるまでCPUが加わる
  ];
  /* 2.71.0 キャラ（見た目＋パッシブ＋アクティブ）。逃げる側は人間、鬼は日本の妖怪。数値は仮
     キャラの足し方：①ここ（HD.CH）に { k, n, pa（パッシブの説明）, ac（アクティブの説明）, cd（待ち時間・秒） } を足す
       ②見た目：人間は mkHuman、妖怪は mkYokai に k の分岐を足す（足さなければ初期の見た目）
       ③アクティブ：make の中の useSkill に k の分岐を足す　④パッシブ：使う所で cho(p) === 'k' を見て効果をつける（速さは update の sp、外れた時は hurt など）
       部屋のキャラ選び（js/party.js）はこの一覧から自動で作られる */
  HD.CH = {
    h: [
      { k: 'ninja', n: '忍者', pa: '音の合図で居場所がつかまれにくい', ac: '忍び足：前へ短く瞬間移動', cd: 50 },
      { k: 'shonin', n: '商人', pa: '化けたあとも速く動ける', ac: '偽物：化けた物と同じ偽の置物をその場に出す（化けている時だけ）', cd: 50 },
      { k: 'miko', n: '巫女', pa: '鬼が近づくと気配で分かる', ac: 'お札：鬼の叩きを1回だけ無効にする', cd: 50 },
      { k: 'kodomo', n: '子ども', pa: '足が速く、叩かれにくい', ac: 'ダッシュ：3秒間とても速く走る', cd: 50 },
      { k: 'kariudo', n: '狩人', pa: '化けたあとの動きが少し速い', ac: '罠：足元に罠を置く。鬼が踏むと2.5秒動けない（鬼には見えない）', cd: 50 },
      { k: 'sou', n: '僧侶', pa: '天狗の風・河童の水・雪女の吹雪を受けない', ac: '読経：近くの鬼を3秒間、半分の速さにする', cd: 50 },
      { k: 'dorobo', n: '泥棒', pa: '宝箱を開けるのが早い（1.5倍）', ac: '逃げ足：4秒間、足が速くなる', cd: 50 },
      { k: 'kenzan', n: '検断', pa: '捕まった仲間がいると、そこへ向かう足が1.4倍になる', ac: '銭投げ：前の鬼に銭を投げて、2秒だけ怯ませる', cd: 50 },
      { k: 'geinin', n: '旅芸人', pa: 'すぐ別の物に化けかえられる', ac: '声まね：前の離れた所から物音を出して、鬼を引きつける', cd: 50 },
    ],
    s: [
      { k: 'tengu', n: '天狗', pa: '足が速い', ac: '羽ばたき：前方に風を起こし、化けた人を人の姿に戻す', cd: 18 },
      { k: 'kappa', n: '河童', pa: '叩いて外してもすぐ動ける', ac: '水かけ：前方の人に印をつけ、6秒間光って見える', cd: 16 },
      { k: 'yuki', n: '雪女', pa: '近くの逃げる側が少し遅くなる', ac: '吹雪：周りの逃げる側が3秒間動けなくなる', cd: 22 },
      { k: 'neko', n: '化け猫', pa: '動いている逃げる側が近いと「？」が出る', ac: 'かぎつけ：いちばん近い逃げる側の方向を5秒間示す', cd: 20 },
      { k: 'oni', n: '赤鬼', pa: '捕まえた人を担いでも足が遅くならない', ac: '金棒：広い範囲をまとめて叩く', cd: 14 },
    ],
  };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r2 = (v) => Math.round(v * 100) / 100;
  // 2.80.0 逃げる側の体力は100。化けた物が大きいほど受けるダメージは少なく、小さいほど大きい（人の姿は40）
  const SZ = { cart: 'L', rock: 'L', haystack: 'L', shrine: 'L', barrel: 'L', cask: 'L', bench: 'L', crate: 'M', lantern: 'M', stone: 'M', jar: 'M', bale: 'M', firewood: 'M', sign: 'M', umbrella: 'M', bush: 'M', drum: 'M', bucket: 'S', stool: 'S', pot: 'S', tub: 'S', basket: 'S', stump: 'S', sack: 'S' };
  const DMG = { L: 25, M: 34, S: 60, H: 40 }, SZN = { L: '大きい', M: 'ふつう', S: '小さい', H: 'ふつう' };
  const CARRY_T = 15; // 鬼が1人を担いでいられる時間（秒）。過ぎると逃げる側がふりほどく
  const CAGE_T = 45; // 牢に入れられてから完全に負けるまで（秒）。仲間が近づいて1秒で救助できる
  const ROUND = 180, HIDE_T = 15, BEACON0 = 30, BEACON_EVERY = 22, R_HIT = 1.3, R_BIG = 3.2, SP_H = 4.2, SP_HS = 2.0, SP_S = 5.4; // 鬼の基本の速さは、逃げる側の基本（子ども5.0が最速）より速い
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
    } else if (kind === 'sack') {
      const b = part(G('sk1', () => new THREE.SphereGeometry(0.45, 10, 8)), M([0xc8b080, 0xb89a68, 0xd2bd90][W]), 0, 0.4, 0); b.scale.set(1, 1.05, 0.85); g.add(b); g.add(part(G('sk2', () => new THREE.CylinderGeometry(0.12, 0.2, 0.2, 8)), M(0x8a6a3a), 0, 0.9, 0));
    } else if (kind === 'basket') {
      g.add(part(G('bk1', () => new THREE.CylinderGeometry(0.42, 0.3, 0.55, 10)), M([0xb98a4a, 0xa87a3a, 0xc99a5a][W]), 0, 0.28, 0)); g.add(part(G('bk2', () => new THREE.TorusGeometry(0.4, 0.04, 5, 12)), M(0x6a4a22), 0, 0.56, 0)).rotation.x = Math.PI / 2;
    } else if (kind === 'sign') {
      g.add(part(G('sg1', () => new THREE.BoxGeometry(0.12, 1.3, 0.12)), M(0x6b4a2a), 0, 0.65, 0)); g.add(part(G('sg2', () => new THREE.BoxGeometry(0.9, 0.5, 0.08)), M([0xd8c08a, 0xc8a870, 0xe0cc9a][W]), 0, 1.2, 0));
    } else if (kind === 'bench') {
      g.add(part(G('bn1', () => new THREE.BoxGeometry(1.5, 0.12, 0.5)), M(0x8a6a3a), 0, 0.5, 0)); for (const x of [-0.6, 0.6]) g.add(part(G('bn2', () => new THREE.BoxGeometry(0.12, 0.5, 0.45)), M(0x5a3d1c), x, 0.25, 0));
    } else if (kind === 'cart') {
      g.add(part(G('ct1', () => new THREE.BoxGeometry(1.6, 0.4, 0.9)), M(0x8a5a2a), 0, 0.6, 0)); for (const z of [-0.5, 0.5]) { const w = part(G('ct2', () => new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12)), M(0x4a3018), 0, 0.4, z); w.rotation.x = Math.PI / 2; g.add(w); }
    } else if (kind === 'umbrella') {
      g.add(part(G('um1', () => new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6)), M(0x5a3d1c), 0, 0.75, 0)); g.add(part(G('um2', () => new THREE.ConeGeometry(0.8, 0.4, 14)), M([0xc8402f, 0xd8a02f, 0x3a6aa8][W]), 0, 1.6, 0));
    } else if (kind === 'firewood') {
      for (const [x, y] of [[-0.25, 0.15], [0.25, 0.15], [0, 0.45]]) { const l = part(G('fw', () => new THREE.CylinderGeometry(0.17, 0.17, 1, 7)), M(0x8a6034), x, y, 0); l.rotation.z = Math.PI / 2; g.add(l); }
    } else if (kind === 'haystack') {
      g.add(part(G('hs', () => new THREE.ConeGeometry(0.7, 1.3, 10)), M([0xd2b45a, 0xc4a44a][W % 2]), 0, 0.65, 0));
    } else if (kind === 'pot') {
      g.add(part(G('pt1', () => new THREE.CylinderGeometry(0.3, 0.22, 0.4, 10)), M(0xa85a3a), 0, 0.2, 0)); const b = part(G('pt2', () => new THREE.SphereGeometry(0.34, 8, 6)), M([0x4a8a3a, 0x5a9a4a, 0x3a7a3a][W]), 0, 0.6, 0); g.add(b);
    } else if (kind === 'bush') {
      for (const [x, z, r] of [[0, 0, 0.55], [0.4, 0.2, 0.4], [-0.35, 0.15, 0.4]]) g.add(part(G('bu' + r, () => new THREE.SphereGeometry(r, 8, 6)), M([0x3f7a3a, 0x4a8a44, 0x35692f][W]), x, r * 0.8, z));
    } else if (kind === 'drum') {
      g.add(part(G('dr1', () => new THREE.CylinderGeometry(0.5, 0.5, 0.6, 14)), M(0xa8402a), 0, 0.5, 0)); for (const y of [0.2, 0.8]) g.add(part(G('dr2', () => new THREE.CylinderGeometry(0.51, 0.51, 0.04, 14)), M(0xe8dcc0), 0, y, 0));
      for (const x of [-0.35, 0.35]) g.add(part(G('dr3', () => new THREE.BoxGeometry(0.1, 0.3, 0.5)), M(0x4a3018), x, 0.15, 0));
    } else if (kind === 'cask') {
      g.add(part(G('ck1', () => new THREE.CylinderGeometry(0.5, 0.5, 0.7, 14)), M(0xb88a4a), 0, 0.35, 0)); g.add(part(G('ck2', () => new THREE.CylinderGeometry(0.51, 0.51, 0.06, 14)), M(0xe0d4b0), 0, 0.72, 0));
    } else if (kind === 'tub') {
      g.add(part(G('tu1', () => new THREE.CylinderGeometry(0.55, 0.45, 0.3, 14)), M(0x9a7a4a), 0, 0.15, 0)); g.add(part(G('tu2', () => new THREE.CylinderGeometry(0.48, 0.48, 0.02, 14)), M(0x4a86a8), 0, 0.28, 0));
    } else if (kind === 'stool') {
      g.add(part(G('sl1', () => new THREE.CylinderGeometry(0.3, 0.3, 0.1, 10)), M(0x8a6a3a), 0, 0.5, 0)); g.add(part(G('sl2', () => new THREE.CylinderGeometry(0.22, 0.28, 0.45, 8)), M(0x5a3d1c), 0, 0.25, 0));
    } else if (kind === 'shrine') {
      g.add(part(G('sh1', () => new THREE.BoxGeometry(0.8, 0.6, 0.7)), M(0x9a968c), 0, 0.3, 0)); const r = part(G('sh2', () => new THREE.ConeGeometry(0.7, 0.45, 4)), M(0x6a3a2a), 0, 0.85, 0); r.rotation.y = Math.PI / 4; g.add(r);
    } else if (kind === 'rock') {
      const r = part(G('rk', () => new THREE.DodecahedronGeometry(0.8)), M([0x7a7a74, 0x6a6a64, 0x8a8a82][W]), 0, 0.55, 0); r.scale.set(1.2, 0.85, 1); g.add(r);
    } else { // stump
      g.add(part(G('tb', () => new THREE.CylinderGeometry(0.42, 0.48, 0.55, 12)), M(0x6b4a2a), 0, 0.27, 0));
      g.add(part(G('tt', () => new THREE.CylinderGeometry(0.38, 0.38, 0.02, 12)), M(0xb99a6a), 0, 0.56, 0));
    }
    return g;
  }
  /* 人間（逃げる側）と妖怪（鬼）の見た目。あとで絵に置き換えるときはここだけ直す */
  function mkHuman(col, ch) {
    const g = new THREE.Group(), K = ch || 'ninja', sc = K === 'kodomo' ? 0.78 : 1;
    const body = { ninja: 0x23232b, shonin: 0x7a5a3a, miko: 0xf2f2f2, kodomo: 0xe0b43c, kariudo: 0x4f6a3a, sou: 0x4a3a6a, geinin: 0xd8503c, dorobo: 0x3a4a5a, kenzan: 0x2a3f6a }[K] || col;
    g.add(part(G('hb', () => new THREE.CylinderGeometry(0.28, 0.34, 0.95, 10)), M(body), 0, 0.5, 0));
    g.add(part(G('hs', () => new THREE.BoxGeometry(0.62, 0.1, 0.4)), M({ ninja: 0x8a2a2a, shonin: 0x3a2a1a, miko: 0xc8402f, kodomo: col, kariudo: 0x5a3d1c, sou: 0xe08a2a, geinin: 0xf2f2f2, dorobo: 0x4a8a5a, kenzan: 0xc8a030 }[K] || 0x3a2a1a), 0, 0.72, 0));
    g.add(part(G('hh', () => new THREE.SphereGeometry(0.22, 12, 10)), M(0xf0c9a0), 0, 1.2, 0));
    if (K === 'ninja') g.add(part(G('hn', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.9)), M(0x23232b), 0, 1.22, 0));
    else if (K === 'shonin') g.add(part(G('hm', () => new THREE.CylinderGeometry(0.12, 0.3, 0.2, 12)), M(0xc9a45a), 0, 1.45, 0));
    else if (K === 'miko') { g.add(part(G('hr', () => new THREE.SphereGeometry(0.235, 12, 8, 0, 6.3, 0, 1.2)), M(0x2a2018), 0, 1.22, 0)); g.add(part(G('hrb', () => new THREE.BoxGeometry(0.1, 0.1, 0.5)), M(0xc8402f), 0, 1.42, 0)); }
    else if (K === 'kariudo') g.add(part(G('hf', () => new THREE.SphereGeometry(0.25, 12, 8, 0, 6.3, 0, 1.3)), M(0x7a5a2a), 0, 1.24, 0));
    else if (K === 'sou') g.add(part(G('hq', () => new THREE.TorusGeometry(0.2, 0.04, 6, 14)), M(0xe0b43c), 0, 0.86, 0.12));
    else if (K === 'kenzan') { g.add(part(G('hz1', () => new THREE.ConeGeometry(0.42, 0.24, 14)), M(0x25252b), 0, 1.4, 0)); g.add(part(G('hz2', () => new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6)), M(0xc8a030), 0.3, 0.8, 0.22)); }
    else if (K === 'dorobo') { g.add(part(G('hd1', () => new THREE.SphereGeometry(0.245, 12, 8, 0, 6.3, 0, 1.45)), M(0x4a8a5a), 0, 1.22, 0)); const sb = part(G('hd2', () => new THREE.SphereGeometry(0.28, 8, 6)), M(0xc8b080), 0, 0.75, -0.3); sb.scale.set(1, 1.1, 0.8); g.add(sb); }
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
  const hh = (i) => { const v = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); }; // 決まった「でたらめ」（全員同じ配置にするため）
  const flat = (S, w, d, x, z, c) => { const m = part(new THREE.PlaneGeometry(w, d), M(c), x, 0.02, z); m.rotation.x = -Math.PI / 2; m.castShadow = false; S.scene.add(m); };
  const wall = (S, x0, z0, x1, z1, c) => { const w = Math.max(0.4, x1 - x0), d = Math.max(0.4, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; S.scene.add(part(new THREE.BoxGeometry(w, 2.8, d), M(c || 0xd9cfb4), cx, 1.4, cz)); S.boxes.push([cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2]); };
  /* 2.75.0 舞台：端から端まで走って40秒ほどの広さ。置物の数・種類もここで決める */
  const STAGES = {
    street: { name: '町の通り', HX: 85, HZ: 45, gnd: 0x9b8760, n: 380, kinds: ['crate', 'barrel', 'jar', 'bucket', 'bale', 'sack', 'basket', 'sign', 'bench', 'cart', 'umbrella', 'firewood', 'cask', 'tub', 'stool', 'drum', 'stone', 'pot', 'lantern'],
      build(S) {
        flat(S, 172, 8, 0, 1, 0xb8a47a); const XR = [-45, 0, 45]; for (const x of XR) flat(S, 6, 92, x, 0, 0xb8a47a);
        const W = [7, 6, 8, 6, 9, 7, 6, 8], C = [0xe6dcc0, 0xd9c8a0, 0xcfbf98], ok = (x) => XR.every((r) => Math.abs(x - r) > 6);
        for (const [z, k0] of [[-42, 0], [42, 3], [-11, 5], [13, 2], [-26, 1], [28, 4]]) { let x = -81, k = k0; while (x < 80) { const w = W[k % W.length]; if (ok(x + w / 2) && hh(x * 3 + z) > 0.12) house(S, x + w / 2, z, w, 4, 3 + (k % 3) * 0.2, C[k % 3], 0x3a3f46); x += w + 1.5 + hh(x + z) * 3; k++; } }
      } },
    castle: { name: '城下', HX: 80, HZ: 50, gnd: 0x8a8575, n: 340, kinds: ['crate', 'barrel', 'jar', 'stone', 'rock', 'bale', 'sack', 'cart', 'firewood', 'cask', 'drum', 'bench', 'sign', 'lantern', 'shrine', 'bush', 'stump', 'haystack'],
      build(S) {
        flat(S, 7, 100, 0, 0, 0x9d9886); flat(S, 160, 5, 0, 2, 0x9d9886);
        S.scene.add(part(new THREE.BoxGeometry(156, 3.2, 1.6), M(0x7d786c), 0, 1.6, -47.8)); S.boxes.push([-78, -48.6, 78, -47]);
        for (const x of [-76, -38, 38, 76]) house(S, x, -44, 5, 5, 5, 0xece6d6, 0x3a3f46);
        let n = 0; for (const x of [-68, -52, -36, -20, 20, 36, 52, 68]) for (const z of [-32, -14, 16, 30, 42]) { if (hh(n++) < 0.25) continue; house(S, x + (hh(n) - 0.5) * 4, z, 6 + Math.floor(hh(n + 7) * 3), 4, 3 + hh(n + 3) * 0.4, 0xd9c8a0, 0x4a4a46); }
        for (let i = 0; i < 40; i++) { const x = (hh(i + 300) * 2 - 1) * 74, z = (hh(i + 400) * 2 - 1) * 44; if (Math.abs(x) < 6 || Math.abs(z - 2) < 4) continue; tree(S, x, z, 1.0 + hh(i) * 0.3, i % 2 === 0); }
      } },
    yashiki: { name: '屋敷の庭', HX: 80, HZ: 50, gnd: 0x6f8f4a, n: 300, kinds: ['stone', 'rock', 'lantern', 'jar', 'bucket', 'stump', 'bush', 'pot', 'shrine', 'bench', 'basket', 'umbrella', 'stool', 'tub', 'sign', 'haystack', 'bale'],
      build(S) {
        house(S, 0, -45, 60, 6, 3.6, 0xe6dcc0, 0x4a4036); house(S, 60, -28, 8, 6, 3.2, 0xd9c8a0, 0x4a4036); house(S, -60, -28, 8, 6, 3.2, 0xd9c8a0, 0x4a4036); house(S, 66, 30, 7, 6, 3, 0xd9c8a0, 0x4a4036); house(S, -66, 34, 7, 6, 3, 0xd9c8a0, 0x4a4036);
        const ponds = [[-30, 10, 10], [42, 14, 7], [10, 34, 6]]; for (const [x, z, r] of ponds) { const pd = part(new THREE.CylinderGeometry(r, r, 0.05, 36), M(0x4a86a8), x, 0.03, z); pd.castShadow = false; S.scene.add(pd); S.circs.push([x, z, r]); }
        for (let i = 0; i < 46; i++) { const x = (hh(i + 500) * 2 - 1) * 74, z = (hh(i + 600) * 2 - 1) * 44; if (ponds.some(([px, pz, r]) => Math.hypot(x - px, z - pz) < r + 3) || z < -36) continue; tree(S, x, z, 1.0 + hh(i) * 0.4, i % 3 !== 0); }
        for (let i = 0; i < 30; i++) { const s2 = part(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 10), M(0x9a968c), -4 + i * 1.2, 0.03, -36 + i * 1.5); s2.castShadow = false; S.scene.add(s2); }
      } },
    rooms: { name: '大きな屋敷', HX: 72, HZ: 39, gnd: 0x8a6a48, n: 360, kinds: ['crate', 'barrel', 'jar', 'bucket', 'sack', 'basket', 'bench', 'stool', 'drum', 'cask', 'tub', 'pot', 'lantern', 'firewood', 'sign', 'umbrella', 'cart', 'shrine'],
      build(S) { // 部屋 9×6。部屋の境にはかべと戸口（戸口の位置は少しずつずらす）
        const cw = 16, ch = 13, C = 9, R = 6, FL = [0xb8a47a, 0xa8b58a, 0xc9b28f];
        for (let i = 0; i < C; i++) for (let j = 0; j < R; j++) flat(S, cw - 0.4, ch - 0.4, -72 + cw * (i + 0.5), -39 + ch * (j + 0.5), FL[(i + j * 2) % 3]);
        for (let k = 1; k < C; k++) for (let j = 0; j < R; j++) { const x = -72 + cw * k, z0 = -39 + ch * j, dc = z0 + ch / 2 + (((k + j) % 3) - 1) * 3; wall(S, x - 0.2, z0, x + 0.2, dc - 1.5); wall(S, x - 0.2, dc + 1.5, x + 0.2, z0 + ch); }
        for (let k = 1; k < R; k++) for (let i = 0; i < C; i++) { const z = -39 + ch * k, x0 = -72 + cw * i, dc = x0 + cw / 2 + (((k * 2 + i) % 3) - 1) * 3; wall(S, x0, z - 0.2, dc - 1.5, z + 0.2); wall(S, dc + 1.5, z - 0.2, x0 + cw, z + 0.2); }
      } },
  };
  HD.STAGES = STAGES;

  // ---------------- 遊びの本体 ----------------
  // 2.98.0 かくれんぼの操作設定（キーボードのキー・コントローラーのボタン。部屋の「操作設定」から変えられる）
  const KDEF = { l: ['ArrowLeft', 'a'], r: ['ArrowRight', 'd'], u: ['ArrowUp', 'w'], d: ['ArrowDown', 's'], a: [' ', 'z', 'Enter', 'f'], b: ['x', 'Shift', 'j'], c: ['e', 'q'], qx: ['c'], qy: ['v'] };
  const PDEF = { pa: [0], pb: [2, 1], pc: [3], qa: [0], qb: [1], qx: [2], qy: [3] }; // PS配置：0=× 1=○ 2=□ 3=△
  HD.KA = [['u', '上へ移動'], ['d', '下へ移動'], ['l', '左へ移動'], ['r', '右へ移動'], ['a', '叩く／化ける（A）'], ['b', '人・鬼の姿に戻る（B）'], ['c', 'スキル'], ['qx', '宝箱の合図：X'], ['qy', '宝箱の合図：Y']];
  HD.KP = [['pa', '叩く／化ける'], ['pb', '人・鬼の姿に戻る'], ['pc', 'スキル'], ['qa', '宝箱の合図：A'], ['qb', '宝箱の合図：B'], ['qx', '宝箱の合図：X'], ['qy', '宝箱の合図：Y']];
  const PSN = ['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'SELECT', 'START', 'L3', 'R3', '十字↑', '十字↓', '十字←', '十字→'];
  HD.kn = (k) => ({ ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[k] || (k.length === 1 ? k.toUpperCase() : k));
  HD.pn = (i) => PSN[i] || 'ボタン' + i;
  let KC = null, KM = null;
  HD.keys = () => {
    if (KC) return KC; let st = {}; try { st = JSON.parse(localStorage.getItem('sgk-hide-keymap') || '{}') || {}; } catch (e) {}
    const kb = {}, pd = {}; for (const k in KDEF) kb[k] = st.kb && Array.isArray(st.kb[k]) ? st.kb[k].slice() : KDEF[k].slice(); for (const k in PDEF) pd[k] = st.pd && Array.isArray(st.pd[k]) ? st.pd[k].slice() : PDEF[k].slice();
    KM = {}; for (const act of ['l', 'r', 'u', 'd', 'a', 'b', 'c']) for (const key of kb[act]) { KM[key] = act; if (key.length === 1) { KM[key.toUpperCase()] = act; KM[key.toLowerCase()] = act; } }
    return (KC = { kb, pd });
  };
  HD.keyMap = () => { HD.keys(); return KM; };
  const saveKeys = (c) => { try { localStorage.setItem('sgk-hide-keymap', JSON.stringify(c)); } catch (e) {} KC = null; };
  HD.setKey = (act, key) => { const c = HD.keys(), lk = key.toLowerCase(); for (const k in c.kb) c.kb[k] = c.kb[k].filter((x) => x.toLowerCase() !== lk); c.kb[act] = [key]; saveKeys(c); };
  HD.setPad = (act, idx) => { const c = HD.keys(), grp = act[0] === 'p' ? ['pa', 'pb', 'pc'] : ['qa', 'qb', 'qx', 'qy']; for (const k of grp) c.pd[k] = c.pd[k].filter((x) => x !== idx); c.pd[act] = [idx]; saveKeys(c); };
  HD.resetKeys = () => { try { localStorage.removeItem('sgk-hide-keymap'); } catch (e) {} KC = null; };

  // 2.73.0 部屋のキャラ一覧用：キャラの見た目を小さな絵にして返す（一度作ったら使い回す）
  const prevC = {}; let prevR = null, prevS = null, prevCam = null;
  HD.preview = function (role, key) {
    const id = role + key; if (prevC[id]) return prevC[id];
    try {
      if (!prevR) {
        prevR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); prevR.setSize(120, 150); prevR.setPixelRatio(1); prevR.outputEncoding = THREE.sRGBEncoding;
        prevS = new THREE.Scene(); prevS.add(new THREE.HemisphereLight(0xffffff, 0x887766, 1.0)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(2, 4, 3); prevS.add(dl);
        prevCam = new THREE.PerspectiveCamera(32, 120 / 150, 0.1, 50); prevCam.position.set(0, 1.15, 4.4); prevCam.lookAt(0, 0.8, 0);
      }
      const o = role === 'h' ? mkHuman(0xc0a060, key) : mkYokai(key); o.rotation.y = 0.5; prevS.add(o); prevR.render(prevS, prevCam); prevS.remove(o);
      return (prevC[id] = prevR.domElement.toDataURL('image/png'));
    } catch (e) { return ''; }
  };
  HD.make = function (env) {
    const { cfg, me, ids: hids, cv, g2: g, IN, send } = env;
    const o = Object.assign({ st: 'street', sk: 1, mv: 'slow', wn: 'time', cau: 'seek', cpS: 'off', cpH: 'off', on: '1', hn: '4' }, cfg.o || {}), stg = STAGES[o.st] || STAGES.street;
    const LS = +o.cpS || 0, LH = +o.cpH || 0, solo = hids.length < 2 && !(LS > 0 || LH > 0), rng = mulberry((cfg.seed ^ 0x2f6e2b1) >>> 0), HX = stg.HX, HZ = stg.HZ;
    const root = cv.parentNode, T3 = THREE;
    // 3D の画面（絵は下の canvas、文字は上の canvas）
    const rd = new T3.WebGLRenderer({ antialias: true }); rd.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); rd.outputEncoding = T3.sRGBEncoding; rd.shadowMap.enabled = true;
    const c3 = rd.domElement; c3.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:0'; root.insertBefore(c3, cv);
    cv.style.position = 'absolute'; cv.style.left = cv.style.top = '0'; cv.style.zIndex = 1;
    const scene = new T3.Scene(); scene.background = new T3.Color(0xbfd9ee); scene.fog = new T3.Fog(0xbfd9ee, 60, 110);
    scene.add(new T3.AmbientLight(0xffffff, 0.62)); const sun = new T3.DirectionalLight(0xfff0d8, 0.85); sun.position.set(12, 22, 8); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 70 }); scene.add(sun); scene.add(sun.target);
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
    // 井戸（決まった位置に5か所。最後の1人になったとき、どれか1つの蓋が開いて脱出口になる）
    const wells = [];
    [[-0.55, -0.35], [0.55, -0.35], [-0.65, 0.4], [0.65, 0.4], [0, 0.05]].forEach(([ax, az], i) => {
      let wx = ax * HX, wz = az * HZ; for (let k = 0; k < 150 && blocked(wx, wz, 2.2); k++) { const a = hh(i * 31 + k) * 6.283, r = 1.5 + k * 0.4; wx = ax * HX + Math.cos(a) * r; wz = az * HZ + Math.sin(a) * r; }
      const wg = new THREE.Group(); wg.add(part(G('wl1', () => new THREE.CylinderGeometry(0.95, 1.0, 0.9, 16)), M(0x8a8a82), 0, 0.45, 0));
      const inner = part(G('wl2', () => new THREE.CylinderGeometry(0.7, 0.7, 0.02, 16)), new THREE.MeshLambertMaterial({ color: 0x1a1a22 }), 0, 0.88, 0); wg.add(inner);
      const lid = new THREE.Group(); lid.add(part(G('wl3', () => new THREE.CylinderGeometry(0.98, 0.98, 0.12, 16)), M(0x7a5a2a), 0, 0, 0)); lid.add(part(G('wl4', () => new THREE.BoxGeometry(1.7, 0.06, 0.18)), M(0x4a3018), 0, 0.09, 0)); lid.position.set(0, 0.96, 0); wg.add(lid);
      const beam = new THREE.Mesh(G('wlb', () => new THREE.CylinderGeometry(0.8, 0.8, 7, 16, 1, true)), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 3.5; beam.visible = false; wg.add(beam);
      wg.position.set(wx, 0, wz); scene.add(wg); S.circs.push([wx, wz, 1.0]); wells.push({ x: wx, z: wz, lid, inner, beam });
    });
    const setWell = (w, on) => { w.lid.position.set(on ? 1.5 : 0, on ? 0.2 : 0.96, 0); w.lid.rotation.z = on ? -1.0 : 0; w.beam.visible = on; w.inner.material.color.setHex(on ? 0x6ad0ff : 0x1a1a22); };
    // 置物（本物）
    const props = [];
    for (let i = 0; i < stg.n; i++) {
      let p = null;
      for (let k = 0; k < 40 && !p; k++) { const [x, z] = free(1.2); if (props.every((q) => Math.hypot(q.x - x, q.z - z) > 1.7)) p = { x, z }; }
      if (!p) continue; p.kind = stg.kinds[Math.floor(rng() * stg.kinds.length)]; p.v = Math.floor(rng() * 3); p.rot = rng() * 6.28;
      p.m = mkProp(p.kind, p.v); p.m.position.set(p.x, 0, p.z); p.m.rotation.y = p.rot; scene.add(p.m); props.push(p);
    }
    // 牢（鬼が体力のなくなった逃げる側を担いで運ぶ先）。全員同じ場所
    const cages = [];
    for (let i = 0; i < 12; i++) { // 4×3 に等間隔（置けない所は近くにずらす）
      const cw = HX * 2 / 4, ch = HZ * 2 / 3, cx = -HX + (i % 4 + 0.5) * cw, cz = -HZ + (Math.floor(i / 4) + 0.5) * ch; let q = null;
      for (let k = 0; k < 60 && !q; k++) { const r = Math.min(cw, ch) * 0.1 + k * 0.4, x = k ? cx + (rng() * 2 - 1) * r : cx, z = k ? cz + (rng() * 2 - 1) * r : cz; if (!blocked(x, z, 2) && Math.hypot(x, z - (HZ - 6)) > 6 && props.every((pp) => Math.hypot(pp.x - x, pp.z - z) > 2.2)) q = { x, z }; }
      if (!q) { const [x, z] = free(2); q = { x, z }; }
      const cg = new THREE.Group(), wd = M(0x6b4a2a); cg.add(part(G('cgb', () => new THREE.BoxGeometry(2, 0.15, 2)), M(0x4a3018), 0, 0.08, 0)); cg.add(part(G('cgr', () => new THREE.BoxGeometry(2.3, 0.15, 2.3)), wd, 0, 2.2, 0));
      for (let j = 0; j < 8; j++) { const a = j / 8 * 6.283; cg.add(part(G('cgp', () => new THREE.BoxGeometry(0.12, 2.1, 0.12)), wd, Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9)); }
      const bm = new THREE.Mesh(G('cgl', () => new THREE.CylinderGeometry(0.15, 0.15, 7, 8)), new THREE.MeshBasicMaterial({ color: 0xb060ff, transparent: true, opacity: 0.3, depthWrite: false })); bm.position.y = 3.5; cg.add(bm);
      cg.position.set(q.x, 0, q.z); scene.add(cg); cages.push({ x: q.x, z: q.z, id: null, t: 0, by: null, m: cg });
    }
    // 役割（同じ種で全員同じ）
    const order = hids.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    { const isV = (i) => !!((cfg.mem || []).find((x) => x.id === i) || {}).vol, vo = order.filter(isV), rest = order.filter((i) => !isV(i)); order.length = 0; order.push(...vo, ...rest); } // 2.91.0 鬼は立候補した人からランダム（立候補がいなければ全員から）
    // 2.96.0 鬼は1〜2人・逃げる側は4〜8人まで。人が足りない分は、CPUの設定があればCPUが入る
    const ON = o.on === '2' ? 2 : 1, HN = clamp(+o.hn || 4, 4, 8), volOf = (i) => !!((cfg.mem || []).find((x) => x.id === i) || {}).vol;
    const nHumOni = solo ? 0 : LS > 0 ? Math.min(ON, order.filter(volOf).length) : Math.min(ON, LH > 0 ? hids.length : hids.length - 1), nCpuOni = !solo && LS > 0 ? ON - nHumOni : 0;
    const nFill = !solo && LH > 0 ? Math.max(0, HN - (hids.length - nHumOni)) : 0, nSk = nHumOni + nCpuOni;
    const cpuIds = []; for (let k = 0; k < nCpuOni + nFill; k++) cpuIds.push('__c' + k);
    const ids = hids.concat(cpuIds); cpuIds.forEach((c2, k) => { env.names[c2] = 'CPU' + (k + 1); });
    const fullOrder = order.slice(0, nHumOni).concat(cpuIds.slice(0, nCpuOni), order.slice(nHumOni), cpuIds.slice(nCpuOni)), cpuCh = {};
    cpuIds.forEach((c2) => { cpuCh[c2] = { h: HD.CH.h[Math.floor(rng() * HD.CH.h.length)].k, s: HD.CH.s[Math.floor(rng() * HD.CH.s.length)].k }; });
    const P = {}, col = (id) => env.pal[ids.indexOf(id) % env.pal.length], hex = (s) => parseInt(String(s).replace('#', ''), 16);
    const chOf0 = (id, r) => { if (cpuCh[id]) return cpuCh[id][r]; const m = (cfg.mem || []).find((x) => x.id === id), c = m && m.ch && m.ch[r]; return HD.CH[r].some((x) => x.k === c) ? c : HD.CH[r][0].k; };
    fullOrder.forEach((id, i) => {
      const sk = i < nSk, [x, z] = sk ? [(i - (nSk - 1) / 2) * 2, HZ - 6] : free(0.6);
      P[id] = { id, role: sk ? 's' : 'h', role0: sk ? 's' : 'h', x, z, tx: x, tz: z, fx: 0, fz: -1, form: null, mv: 0, hp: 3, out: false, caught: 0, stun: 0, cd: 0, fcd: 0, grp: null, key: '', bob: 0, chh: chOf0(id, 'h'), chs: chOf0(id, 's'), sk: 0, boost: 0, freeze: 0, slowT: 0, olk: 0, hh: 100, inv: 0, pan: 0, car: null, carry: null, carryT: 0, cage: null, rsT: 0, hangs: 0, weak: false, shield: false, arrowT: 0 };
    });
    cpuIds.forEach((c2) => { P[c2].cpu = 1; });
    const cho = (p) => (p.role === 'h' ? p.chh : p.chs), chN = (p) => (HD.CH[p.role].find((x) => x.k === cho(p)) || HD.CH[p.role][0]).n, marks = {};
    const cpu = solo ? { id: '__cpu', x: 0, z: HZ - 6, fx: 0, fz: -1, cd: 1.5, tgt: null, grp: mkYokai('oni'), mv: 0 } : null; if (cpu) scene.add(cpu.grp);
    // 脱出モード：鍵が4つ、3つ集めると鳥居の出口が開く（出口に着いた人は脱出成功）
    // 2.78.0 合図はA/B/X/Y（コントローラーはPS配置：×=A ○=B □=X △=Y）
    const esc = o.wn === 'escape', RND = esc ? 600 : ROUND, NK = 11, NEED = 7, OPEN_W = 80, EXIT_W = 20, keys = [], exitP = { open: false, list: [] }; let kgot = 0, exM = null, exBeam = null, chInfo = false, chBtn = [12, 80, 118, 28], opening = null, rescuing = null, qte = null, qtT = 0, pdir = null; const QK = ['a', 'b', 'x', 'y'], qq = [], padPrev = [], qrects = []; let padOn = false; const QL = (c) => (padOn ? HD.pn((HD.keys().pd['q' + c] || [])[0]) : c.toUpperCase()); const openCh = (q) => { if (q.lid) q.lid.rotation.x = -1.9; if (q.beam) q.beam.visible = false; };
    if (esc) {
      for (let i = 0; i < NK; i++) { let q = null; for (const th of [16, 11, 7]) for (let k = 0; k < 60 && !q; k++) { const [x, z] = free(1); if (z < HZ - 7 && keys.every((y) => Math.hypot(y.x - x, y.z - z) > th)) q = { x, z }; } if (!q) { const [x, z] = free(1); q = { x, z }; } q.got = false; const gk = new THREE.Group(), GD = new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x806010 }); gk.add(part(G('chb', () => new THREE.BoxGeometry(1.2, 0.7, 0.75)), M(0x7a4a22), 0, 0.35, 0)); const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.37); const lm = part(G('chl', () => new THREE.CylinderGeometry(0.375, 0.375, 1.2, 12, 1, false, 0, Math.PI)), M(0x8a5a2a), 0, 0, 0.37); lm.rotation.z = Math.PI / 2; lm.rotation.y = Math.PI / 2; lid.add(lm); gk.add(lid); q.lid = lid; for (const x of [-0.45, 0.45]) gk.add(part(G('chg', () => new THREE.BoxGeometry(0.1, 0.75, 0.8)), GD, x, 0.37, 0)); gk.add(part(G('chk', () => new THREE.BoxGeometry(0.2, 0.22, 0.08)), GD, 0, 0.6, 0.4)); const bm = new THREE.Mesh(G('kyl', () => new THREE.CylinderGeometry(0.1, 0.1, 3, 8)), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.35, depthWrite: false })); bm.position.y = 1.9; gk.add(bm); q.beam = bm; q.pr = 0; { const ef = new THREE.LineSegments(new THREE.EdgesGeometry(G('chf', () => new THREE.BoxGeometry(1.8, 1.4, 1.4))), new THREE.LineBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true })), ff = new THREE.Mesh(G('chf', () => new THREE.BoxGeometry(1.8, 1.4, 1.4)), new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true, opacity: 0.22 })); const fr = new THREE.Group(); fr.add(ef, ff); fr.position.y = 0.55; fr.renderOrder = 999; ef.renderOrder = ff.renderOrder = 999; fr.visible = false; gk.add(fr); q.frame = fr; } gk.position.set(q.x, 0, q.z); scene.add(gk); q.m = gk; gk.rotation.y = hh(keys.length + 9) * 6.28; keys.push(q); }
      for (const sgn of [-1, 1]) { let e = null; for (let k = 0; k < 120 && !e; k++) { const [x, z] = free(2.5); if (x * sgn > HX * 0.4 && keys.every((y) => Math.hypot(y.x - x, y.z - z) > 5) && exitP.list.every((o2) => Math.hypot(o2.x - x, o2.z - z) > HX * 1.1)) e = { x, z }; } if (!e) { const [x, z] = free(2.5); e = { x, z }; } exitP.list.push(e); }
      const rm = M(0xc8402f); for (const e of exitP.list) { const m = new THREE.Group(); for (const x of [-1.8, 1.8]) m.add(part(G('tp', () => new THREE.CylinderGeometry(0.25, 0.3, 3.4, 10)), rm, x, 1.7, 0)); m.add(part(G('tk', () => new THREE.BoxGeometry(4.8, 0.32, 0.7)), M(0x2a2a2a), 0, 3.5, 0)); m.add(part(G('tn2', () => new THREE.BoxGeometry(3.8, 0.22, 0.34)), rm, 0, 2.8, 0)); const bm = new THREE.Mesh(G('exb', () => new THREE.CylinderGeometry(1.5, 1.5, 6, 16, 1, true)), new THREE.MeshBasicMaterial({ color: 0x7affa0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); bm.position.y = 3; bm.visible = false; m.add(bm); m.position.set(e.x, 0, e.z); m.visible = false; scene.add(m); e.m = m; e.beam = bm; e.pr = 0; e.opened = false; }
    }
    const MY = P[me], nm = (id) => (id === '__cpu' ? '見回り' : env.names[id] || '？');
    // カメラ（斜め上から見下ろす）
    let view = 'tp'; try { view = localStorage.getItem('sgk-hide-vw') || 'tp'; } catch (e) {} if (view !== 'fp') view = 'tp'; // 2.74.1 見下ろしは廃止
    const qv = view === 'qv', cam = qv ? new T3.OrthographicCamera(-10, 10, 10, -10, 0.1, 120) : new T3.PerspectiveCamera(view === 'fp' ? 72 : 58, 1, 0.1, 220), VH = 21; let camX = MY.x, camZ = MY.z, cyaw = Math.atan2(MY.fx, MY.fz);
    const fitCam = () => { rd.setSize(innerWidth, innerHeight, false); const a = innerWidth / Math.max(1, innerHeight); if (qv) { cam.left = -VH * a / 2; cam.right = VH * a / 2; cam.top = VH / 2; cam.bottom = -VH / 2; } else cam.aspect = a; cam.updateProjectionMatrix(); }; fitCam(); addEventListener('resize', fitCam);
    const setCam = () => {
      sun.position.set(camX + 12, 22, camZ + 8); sun.target.position.set(camX, 0, camZ); sun.target.updateMatrixWorld();
      if (qv) { cam.position.set(camX + 15, 17, camZ + 15); cam.lookAt(camX, 0, camZ); return; }
      const sn = Math.sin(cyaw), cs = Math.cos(cyaw);
      if (view === 'fp') { cam.position.set(MY.x, 1.55, MY.z); cam.lookAt(MY.x + sn * 5, 1.45, MY.z + cs * 5); }
      else { const d = 5.5, ex = clamp(MY.x - sn * d, -HX - 1.5, HX + 1.5), ez = clamp(MY.z - cs * d, -HZ - 1.5, HZ + 1.5); cam.position.set(ex, 3.2, ez); cam.lookAt(MY.x + sn * 1.5, 1.0, MY.z + cs * 1.5); }
    };
    // 印（探す先の輪・叩いた所・ビーコン）
    const ring = (c, ri, ro) => { const m = new T3.Mesh(new T3.RingGeometry(ri, ro, 28), new T3.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, side: T3.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.visible = false; scene.add(m); return m; };
    const nz = ring(0x70c8ff, 4.6, 5), hl = ring(0xffe070, 0.75, 1.0), bc = ring(0xff8040, 5.6, 6), sw = ring(0xffffff, 0.9, 1.3), swm = ring(0xff4040, 0.9, 1.3);

    // 状態
    const FX = [], traps = []; let nzo = null, t = 0, phase = 'hide', done = false, toast = null, toastT = 0, pend = null, sendT = 0, bk = 0, beacon = null, bcT = 0, last = { aT: 0 };
    const say = (s) => { toast = s; toastT = 3; };
    const alive = (p) => p && !p.out && !p.esc && !env.gone[p.id];
    const hiders = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 'h');
    const seekers = () => ids.map((i) => P[i]).filter((p) => alive(p) && p.role === 's' && p.hp > 0);
    const cpuP = () => cpuIds.map((i) => P[i]), isHost = () => cpuIds.length > 0 && hids.find((i) => !env.gone[i]) === me, mine = (p) => p === MY || (!!p.cpu && isHost()); // CPUはリーダー（いなくなったら次の人）の端末が動かす
    const cpuH = () => (isHost() ? cpuP().filter((c) => c.role === 'h' && alive(c)) : []), lvOf = (c) => (c.role === 's' ? LS || LH : LH || LS);
    const look = (p) => { // 見た目（化けていれば置物、そうでなければ人）
      const key = p.form ? p.form.k + p.form.v : 'p' + p.role + cho(p); if (key === p.key && p.grp) return; p.key = key;
      if (p.grp) scene.remove(p.grp);
      p.grp = p.form ? mkProp(p.form.k, p.form.v) : p.role === 's' ? mkYokai(cho(p)) : mkHuman(hex(col(p.id)), cho(p)); scene.add(p.grp);
    };
    const near = (x, z, r) => { let b = null, bd = r; for (const q of props) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; b = q; } } return b; };
    const moveBy = (p, dx, dz, r) => { const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2)); for (let i = 0; i < n; i++) { const nx = p.x + dx / n, nz = p.z + dz / n; if (!blocked(nx, p.z, r)) p.x = nx; if (!blocked(p.x, nz, r)) p.z = nz; } }; // 2.89.3 細かく刻んで動かし、速くても壁をすり抜けない
    const wallBetween = (x0, z0, x1, z1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3)); for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; for (const b of S.boxes) if (x > b[0] && x < b[2] && z > b[1] && z < b[3]) return true; } return false; };
    const stick = { on: false, id: -1, x0: 0, y0: 0, x: 0, y: 0 };
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    const pd = (e) => { if (!coarse || stick.on || e.clientX > innerWidth * 0.55) return; stick.on = true; stick.id = e.pointerId; stick.x0 = e.clientX; stick.y0 = e.clientY; stick.x = stick.y = 0; };
    const pm = (e) => { if (!stick.on || e.pointerId !== stick.id) return; const dx = e.clientX - stick.x0, dy = e.clientY - stick.y0, l = Math.hypot(dx, dy) || 1, k = Math.min(1, l / 50); stick.x = dx / l * k; stick.y = dy / l * k; };
    const pu = (e) => { if (e.pointerId === stick.id) { stick.on = false; stick.x = stick.y = 0; } };
    const dg = { id: -1, x: 0 };
    const dd = (e) => { if (qv || dg.id >= 0 || (coarse && e.clientX < innerWidth * 0.55)) return; dg.id = e.pointerId; dg.x = e.clientX; };
    const dm = (e) => { if (e.pointerId !== dg.id) return; cyaw -= (e.clientX - dg.x) * 0.006; dg.x = e.clientX; };
    const du = (e) => { if (e.pointerId === dg.id) dg.id = -1; };
    const qk = (e) => { if (!qte || e.repeat) return; const kb = HD.keys().kb, lk = e.key.toLowerCase(), c = [['a', 'a'], ['b', 'b'], ['qx', 'x'], ['qy', 'y']].find((q2) => kb[q2[0]].some((x) => x.toLowerCase() === lk)); if (c) qq.push(c[1]); };
    const qp = (e) => { if (!qte || !qrects.length) return; const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height; for (const [rx, ry, rw, rh, c] of qrects) if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) { qq.push(c); break; } };
    const ip = (e) => { const r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * cv.width / r.width, py = (e.clientY - r.top) * cv.height / r.height, [bx, by, bw2, bh2] = chBtn; if (px >= bx && px <= bx + bw2 && py >= by && py <= by + bh2) { chInfo = !chInfo; e.stopImmediatePropagation(); e.preventDefault(); } else if (chInfo && px < Math.min(cv.width - 12, 572) && py >= by && py <= by + 184) { chInfo = false; e.stopImmediatePropagation(); e.preventDefault(); } }; cv.addEventListener('pointerdown', ip);
    addEventListener('keydown', qk); cv.addEventListener('pointerdown', qp);
    cv.addEventListener('pointerdown', dd); cv.addEventListener('pointermove', dm); addEventListener('pointerup', du); addEventListener('pointercancel', du);
    cv.addEventListener('pointerdown', pd); cv.addEventListener('pointermove', pm); addEventListener('pointerup', pu); addEventListener('pointercancel', pu);
    const tall = (e) => { if (e && e.touches && e.touches.length) return; stick.on = false; stick.id = -1; stick.x = stick.y = 0; dg.id = -1; }; // 2.99.3 指が全部離れたら必ず止める（離しても進み続けることがあった）
    const blr = () => tall(null); addEventListener('touchend', tall, true); addEventListener('touchcancel', tall, true); addEventListener('blur', blr);
    const inVec = () => {
      let ix = (IN.r ? 1 : 0) - (IN.l ? 1 : 0), iy = (IN.d ? 1 : 0) - (IN.u ? 1 : 0);
      const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.connected);
      if (gp) { const bt = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); ix += (Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0) + (bt(15) ? 1 : 0) - (bt(14) ? 1 : 0); iy += (Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0) + (bt(13) ? 1 : 0) - (bt(12) ? 1 : 0); }
      ix += stick.x; iy += stick.y; const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; } return [ix, iy];
    };
    const tell = (m) => send(env.others, m);
    // 叩く
    const strike = (p, big) => {
      if (p.cd > 0 || p.stun > 0 || p.carry) return; p.cd = 0.8; if (p.form) { p.form = null; p.fcd = 0.5; } const R = big ? R_BIG : R_HIT, off = big ? 1.5 : 1.2, x = p.x + p.fx * off, z = p.z + p.fz * off; FX.push({ x, z, t: 0.25, bad: false, big }); SGK.AUDIO.sfx(big ? 'hit' : 'slash');
      if (p === MY || p.cpu) { const hm = { k: 'hs', id: p.id, x: r2(x), z: r2(z), r: R }; tell(hm); const pe = { t: 0.5, x, z, R, ok: false }; if (p === MY) pend = pe; else p.pend = pe; if (isHost()) { if (p !== MY) takeHit(MY, hm); for (const c of cpuH()) takeHit(c, hm); } }
    };
    const addDecoy = (x, z, kd, v, rot) => { const q = { x, z, kind: kd, v, rot, dc: 1, m: mkProp(kd, v) }; q.m.position.set(x, 0, z); q.m.rotation.y = rot; scene.add(q.m); props.push(q); };
    const addTrap = (tid, x, z) => { const m = new THREE.Mesh(G('trg', () => new THREE.RingGeometry(0.35, 0.75, 14)), new THREE.MeshBasicMaterial({ color: 0x6b3a1a, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.07, z); scene.add(m); traps.push({ tid, x, z, m }); };
    const useSkill = () => {
      const ch = cho(MY), def = HD.CH[MY.role].find((x) => x.k === ch); if (!def || MY.sk > 0 || MY.stun > 0 || !alive(MY)) return;
      if (MY.role === 's' && phase === 'hide') return;
      if (MY.role === 's' && MY.form) { MY.form = null; MY.fcd = 0.5; }
      let ok = true; const fx = MY.fx, fz = MY.fz;
      if (ch === 'ninja') { let d = 0; for (let k = 0.25; k <= 5; k += 0.25) { if (!blocked(MY.x + fx * k, MY.z + fz * k, 0.4)) d = k; else break; } MY.x += fx * d; MY.z += fz * d; FX.push({ x: MY.x, z: MY.z, t: 0.3, bad: false }); SGK.AUDIO.sfx('kaiFlip'); }
      else if (ch === 'shonin') { if (!MY.form) { say('偽物は、化けている時に使えます'); ok = false; } else { let x = MY.x - fx * 2, z = MY.z - fz * 2; if (blocked(x, z, 0.5)) { x = MY.x; z = MY.z; } const rot = Math.random() * 6.28; addDecoy(x, z, MY.form.k, MY.form.v, rot); tell({ k: 'dc', x: r2(x), z: r2(z), kd: MY.form.k, v: MY.form.v, rot: r2(rot) }); say('偽物を置いた'); SGK.AUDIO.sfx('kmrKick'); } }
      else if (ch === 'miko') { MY.shield = true; say('お札を構えた（次の叩きを1回防ぐ）'); SGK.AUDIO.sfx('open'); }
      else if (ch === 'kodomo') { MY.boost = 3; say('ダッシュ！'); }
      else if (ch === 'dorobo') { MY.boost = 4; say('逃げ足！'); }
      else if (ch === 'kariudo') { const tid = me + ':' + Math.floor(t * 10); addTrap(tid, MY.x, MY.z); tell({ k: 'tr', tid, x: r2(MY.x), z: r2(MY.z) }); say('罠を置いた'); SGK.AUDIO.sfx('carve'); }
      else if (ch === 'geinin') { let x = MY.x + fx * 7, z = MY.z + fz * 7; for (let k = 7; k > 0 && blocked(x, z, 0.4); k -= 1) { x = MY.x + fx * k; z = MY.z + fz * k; } nzo = { x, z, t: 5 }; tell({ k: 'ns', x: r2(x), z: r2(z) }); say('声まねをした'); SGK.AUDIO.sfx('news'); }
      else if (ch === 'tengu' || ch === 'kappa' || ch === 'yuki' || ch === 'sou' || ch === 'kenzan') { { const sm = { k: 'sk', s: ch === 'kenzan' ? 'zeni' : ch, id: me, x: r2(MY.x), z: r2(MY.z), fx: r2(fx), fz: r2(fz) }; tell(sm); if (isHost()) cpuSk(sm); } FX.push({ x: MY.x + (ch === 'yuki' || ch === 'sou' ? 0 : fx * 2.5), z: MY.z + (ch === 'yuki' || ch === 'sou' ? 0 : fz * 2.5), t: 0.5, bad: false, big: true }); SGK.AUDIO.sfx(ch === 'yuki' || ch === 'sou' ? 'zawa' : 'bow'); say(ch === 'tengu' ? '羽ばたき！' : ch === 'kappa' ? '水かけ！' : ch === 'yuki' ? '吹雪！' : ch === 'kenzan' ? '銭投げ！' : '読経…'); }
      else if (ch === 'neko') { MY.arrowT = 5; say('においをかぎつけた…'); }
      else if (ch === 'oni') { MY.cd = 0; strike(MY, true); }
      if (ok) MY.sk = def.cd;
    };
    const caught = (id, by) => {
      const p = P[id]; if (!p || p.role !== 'h') return; p.form = null; if (p.car && P[p.car]) P[p.car].carry = null; p.car = null; p.cage = null; cages.forEach((c) => { if (c.id === id) c.id = null; }); p.caught0 = true; if (o.cau === 'out') p.out = true; else { p.role = 's'; p.hp = 3; }
      if (P[by]) P[by].caught++; say(`${nm(id)}が見つかった！`); SGK.AUDIO.sfx('hit');
    };
    const applyCage = (i, id, by) => { const c = cages[i], h = P[id]; if (!c || !h || c.id) return; h.car = null; if (P[by]) P[by].carry = null;
      const instant = h.weak || h.hangs >= 2; h.hangs++; h.weak = false; // 2.82.0 3回目、または前に半分を過ぎてから救助された人は、吊るされたらすぐ負け
      if (instant) { if (mine(h)) { if (h === MY) say(h.hangs >= 3 ? '3回目…もう耐えられない！' : '前の消耗で、耐えられない！'); else say(`${nm(id)}は吊るされてすぐ力尽きた…`); caught(id, by); tell({ k: 'hc', id, by }); } else say(`${nm(id)}は吊るされてすぐ力尽きた…`); return; }
      c.id = id; c.t = CAGE_T; c.by = by; h.cage = i; if (mine(h)) { h.x = c.x; h.z = c.z; if (h === MY) say('牢に入れられた…仲間の救助を待て'); else say(`${nm(id)}が牢に入れられた`); } else say(`${nm(id)}が牢に入れられた`); SGK.AUDIO.sfx('open'); };
    const applyRelease = (id) => { const h = P[id]; if (!h || !h.car) return; if (P[h.car]) P[h.car].carry = null; h.car = null; if (mine(h)) { h.hh = 30; h.inv = 2; h.pan = 3; if (h === MY) say('鬼の手をふりほどいた！逃げろ！'); else say(`${nm(id)}が鬼の手をふりほどいた！`); } else say(`${nm(id)}が鬼の手をふりほどいた！`); };
    const applyRescue = (i) => { const c = cages[i]; if (!c || !c.id) return; const id = c.id, h = P[id], late = c.t < CAGE_T / 2; c.id = null; if (h) { h.cage = null; if (late) h.weak = true; if (mine(h)) { h.hh = 50; h.inv = 2; h.pan = 3; if (h === MY) say(late ? '救助された！ただし半分を過ぎた…次に吊るされたらすぐ負け' : '救助された！次に吊るされても、また45秒耐えられる'); else say(`${nm(id)}が救助された！`); } else say(`${nm(id)}が救助された！`); } SGK.AUDIO.sfx('coin'); };
    const hurt = (p) => { /* 鬼に体力はない（外してもひるむだけ） */ p.stun = cho(p) === 'kappa' ? 0.4 : 1; FX.push({ x: p.x, z: p.z, t: 0.4, bad: true }); SGK.AUDIO.sfx('gbLose'); if (mine(p)) { tell({ k: 'hl', id: p.id, hp: p.hp }); if (p === MY) say('外れ！ ただの置物だった'); } };

    const rush = () => esc && (exitP.list.some((e) => e.opened) || !!exitP.extra); // 脱出口が開いている間は、鬼は一撃でダウン・足が少し速い
    const applyBlock = () => { if (!exitP.extra) return; setWell(exitP.extra.w, false); exitP.extra = null; exitP.blocked = true; exitP.open = true; say('井戸の蓋が閉じられた！普通の出口が現れた！'); SGK.AUDIO.sfx('hit'); };

    // ===== 2.95.0 CPU（リーダー側の端末が動かして、位置などを全員に送る。強さ：1=よわい 2=ふつう 3=つよい）=====
    let NG = null, hosted = false;
    const gInit = () => { if (NG) return NG; const w = Math.ceil(HX * 2), h = Math.ceil(HZ * 2), b = new Uint8Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) b[j * w + i] = blocked(-HX + i + 0.5, -HZ + j + 0.5, 0.55) ? 1 : 0; return (NG = { w, h, b }); };
    const pathTo = (x0, z0, x1, z1) => { // 幅1の升目で道を探す（壁・建物をよける）
      const { w, h, b } = gInit(), ci = (x) => clamp(Math.floor(x + HX), 0, w - 1), cj = (z) => clamp(Math.floor(z + HZ), 0, h - 1);
      const s = cj(z0) * w + ci(x0), gi = ci(x1), gj = cj(z1), gl = gj * w + gi; if (s === gl) return [[x1, z1]];
      const par = new Int32Array(w * h).fill(-2), q = [s]; par[s] = -1; let end = -1;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi], cx = c % w, cz = (c / w) | 0;
        if (c === gl || (b[gl] && Math.abs(cx - gi) <= 1 && Math.abs(cz - gj) <= 1)) { end = c; break; }
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue; const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue; const n = nz * w + nx; if (par[n] !== -2 || b[n]) continue;
          if (dx && dz && (b[cz * w + nx] || b[nz * w + cx])) continue; par[n] = c; q.push(n);
        }
      }
      if (end < 0) return [[x1, z1]];
      const pts = []; for (let c = end; c >= 0 && c !== s; c = par[c]) pts.push([-HX + (c % w) + 0.5, -HZ + ((c / w) | 0) + 0.5]);
      pts.reverse(); pts.push([x1, z1]); return pts;
    };
    const cpuGo = (c, tx, tz, sp, dt, stop) => { // 目的地へ歩く（着いたら true）
      const a = c.ai; if (Math.hypot(tx - c.x, tz - c.z) < stop) { c.mv = 0; return true; }
      a.rp -= dt; if (!a.wp || a.rp <= 0 || Math.hypot(a.gx - tx, a.gz - tz) > 1.5) { a.wp = pathTo(c.x, c.z, tx, tz); a.gx = tx; a.gz = tz; a.rp = 1.2; a.wi = 0; }
      while (a.wi < a.wp.length - 1 && Math.hypot(a.wp[a.wi][0] - c.x, a.wp[a.wi][1] - c.z) < 0.7) a.wi++;
      const [wx, wz] = a.wp[Math.min(a.wi, a.wp.length - 1)], dx = wx - c.x, dz = wz - c.z, l = Math.hypot(dx, dz) || 1;
      moveBy(c, dx / l * sp * dt, dz / l * sp * dt, c.role === 's' ? 0.6 : 0.4); c.fx = dx / l; c.fz = dz / l; c.mv = 1; return false;
    };
    const seekSp = (c) => { let sp = c.form ? 2.8 : cho(c) === 'tengu' ? 6.0 : SP_S; if (c.carry && cho(c) !== 'oni') sp *= 0.85; if (rush()) sp *= 1.15; if (c.slowT > 0) sp *= 0.5; return sp * [0.8, 0.95, 1.08][lvOf(c) - 1]; };
    const hidSp = (c) => { const k = cho(c); let sp = c.form ? (k === 'shonin' ? 3.2 : k === 'kariudo' ? 2.6 : SP_HS) : (k === 'kodomo' ? 5.0 : SP_H); if (c.pan > 0) sp *= 1.5; if (c.boost > 0) sp *= 1.6; if (k === 'kenzan' && cages.some((k2) => k2.id && k2.id !== c.id)) sp *= 1.4; if (seekers().some((q) => cho(q) === 'yuki' && Math.hypot(q.x - c.x, q.z - c.z) < 3.5)) sp *= 0.85; return sp * [0.88, 0.97, 1.05][lvOf(c) - 1]; };
    // 鬼（探す側）のCPU
    const seekBrain = (c, dt) => {
      const a = c.ai, L = lvOf(c); c.mv = 0;
      if (c.hp <= 0 || c.stun > 0 || c.freeze > 0 || phase === 'hide') return;
      if (c.form) c.form = null;
      for (const q of traps) if (Math.hypot(q.x - c.x, q.z - c.z) < 1.0) { c.stun = 2.5; tell({ k: 'tx', tid: q.tid, x: r2(q.x), z: r2(q.z), by: c.id }); scene.remove(q.m); traps.splice(traps.indexOf(q), 1); FX.push({ x: q.x, z: q.z, t: 0.5, bad: true }); SGK.AUDIO.sfx('hit'); return; }
      if (c.carry) { // 担いだ人を牢へ運ぶ
        c.carryT += dt; if (c.carryT >= CARRY_T) { const id = c.carry; tell({ k: 'cr', id }); applyRelease(id); return; }
        let cg = -1, bd = 1e9; cages.forEach((k, i) => { if (!k.id) { const d = Math.hypot(k.x - c.x, k.z - c.z); if (d < bd) { bd = d; cg = i; } } });
        if (cg >= 0) { if (bd < 1.8) { const id = c.carry; tell({ k: 'cg', i: cg, id, by: c.id }); applyCage(cg, id, c.id); } else cpuGo(c, cages[cg].x, cages[cg].z, seekSp(c), dt, 1.5); }
        return;
      }
      if (exitP.extra && L >= 2) { const w = exitP.extra; if (Math.hypot(w.x - c.x, w.z - c.z) < 2.4) { c.blkT = (c.blkT || 0) + dt; if (c.blkT >= 2) { c.blkT = 0; tell({ k: 'xb' }); applyBlock(); } } else cpuGo(c, w.x, w.z, seekSp(c), dt, 2.2); return; } // 開いた井戸の蓋を閉じに行く
      if (a.wait > 0) { a.wait -= dt; return; }
      a.tk -= dt;
      if (a.tk <= 0) {
        a.tk = 0.4; const SR = [0, 4.5, 6.5, 9][L], MR = [0, 7, 10, 14][L], PC = [0, 0.06, 0.16, 0.35][L], VR = [0, 7, 11, 15][L]; let best = null, bd = 1e9;
        for (const h of hiders()) {
          if (h.cage != null || h.car) continue; const d = Math.hypot(h.x - c.x, h.z - c.z); if (d > 20) continue; let see = false;
          if (esc && exitP.open && L >= 2) see = true; // 脱出口が開いたら全員の位置が見える
          else if (!h.form && d < VR && !wallBetween(c.x, c.z, h.x, h.z)) see = true; // 人の姿のままなら見つかる
          else if (h.mv && d < MR && !wallBetween(c.x, c.z, h.x, h.z)) see = true; // 動くと目立つ
          else if (d < SR && Math.random() < PC) see = true; // 化けていても、近いと怪しまれる
          if (see && d < bd) { bd = d; best = h; }
        }
        if (best) a.tg = { x: best.x, z: best.z, hard: 1, id: best.id };
        else if (!a.tg || a.tg.hard) {
          a.tg = null;
          if (L >= 2 && bcT > 0 && beacon && (L === 3 || Math.random() < 0.5)) a.tg = { x: beacon.x, z: beacon.z, area: 1 }; // 物音のした方へ
          else {
            let cand = props.map((q, i) => [q, i]).filter((p2) => t - (a.seen[p2[1]] || -999) > [0, 20, 40, 80][L]); if (!cand.length) cand = props.map((q, i) => [q, i]);
            if (L >= 2) cand.sort((p1, p2) => Math.hypot(p1[0].x - c.x, p1[0].z - c.z) - Math.hypot(p2[0].x - c.x, p2[0].z - c.z));
            const pk = L === 1 ? cand[Math.floor(Math.random() * cand.length)] : cand[Math.floor(Math.random() * Math.min(cand.length, L === 2 ? 25 : 8))];
            if (pk) a.tg = { x: pk[0].x, z: pk[0].z, i: pk[1] };
          }
        }
      }
      if (!a.tg) return;
      const arrive = a.tg.hard ? 1.0 : 1.3, d = Math.hypot(a.tg.x - c.x, a.tg.z - c.z);
      if (d > arrive) { cpuGo(c, a.tg.x, a.tg.z, seekSp(c), dt, arrive); return; }
      const dx = a.tg.x - c.x, dz = a.tg.z - c.z, l = Math.hypot(dx, dz) || 1; c.fx = dx / l; c.fz = dz / l; c.mv = 0;
      if (a.tg.hard) { if (c.cd <= 0) { strike(c); a.wait = [0, 1.2, 0.6, 0.15][L]; } }
      else { a.seen[a.tg.i] = t; if (a.tg.i != null && Math.random() < [0, 0.5, 0.3, 0.1][L] && c.cd <= 0) { strike(c); a.wait = 0.9; } else a.wait = 0.5; a.tg = null; } // 怪しまれていない置物は、強いほど叩かず通り過ぎる
    };
    // 逃げる側のCPU
    const cpuEscape = (c) => { c.esc = true; const m = { k: 'es', id: c.id }; tell(m); game.msg(c.id, m); };
    const hideBrain = (c, dt) => {
      const a = c.ai, L = lvOf(c), play = phase === 'play'; c.mv = 0;
      if (c.car) { const cr = P[c.car]; if (cr) { c.x = cr.x; c.z = cr.z; } return; }
      if (c.cage != null) { const k = cages[c.cage]; c.x = k.x; c.z = k.z; if (k.t <= 0 && !done) { const by = k.by; caught(c.id, by); tell({ k: 'hc', id: c.id, by }); } return; }
      if (c.stun > 0 || c.freeze > 0) return;
      let od = 1e9, on = null; for (const s of seekers()) { const d = Math.hypot(s.x - c.x, s.z - c.z); if (d < od) { od = d; on = s; } }
      const face = on && od > 0.1 ? ((c.x - on.x) * on.fx + (c.z - on.z) * on.fz) / od : 0;
      const danger = play && !!on && (od < [0, 1.6, 2.2, 2.6][L] || (L >= 2 && od < (L === 3 ? 6.5 : 4.5) && face > 0.7)); // 強いほど、鬼がこちらへ向かってくるのを早く察して逃げる
      const dd = (e) => Math.hypot(e.x - c.x, e.z - c.z), nearest = (arr) => arr.reduce((b, e) => (!b || dd(e) < dd(b) ? e : b), null);
      const pickHide = () => { // 隠れる場所：強いほど大きな置物（受けるダメージが少ない）を選ぶ
        const sz = (q) => SZ[q.kind] || 'M', ok = props.filter((q) => !q.dc && (!on || Math.hypot(q.x - on.x, q.z - on.z) > 10) && dd(q) < (L === 1 ? 45 : 35));
        let pool = L === 3 ? ok.filter((q) => sz(q) === 'L') : L === 2 ? ok.filter((q) => sz(q) !== 'S') : ok; if (!pool.length) pool = ok; const q = pool[Math.floor(Math.random() * pool.length)]; return q ? { x: q.x, z: q.z } : null;
      };
      const hidePlace = () => { a.dst = pickHide(); a.tries = 0; a.job = 'hide'; };
      const stand = (x, z, st) => cpuGo(c, x, z, hidSp(c), dt, st);
      if (danger && a.job !== 'hide') { c.form = null; a.qT = 0; a.flee = 1; hidePlace(); }
      if (a.job === 'hide') {
        if (c.form) { a.job = 'still'; return; }
        if (!a.dst) hidePlace(); if (!a.dst) { a.job = 'still'; return; }
        if (stand(a.dst.x, a.dst.z, 1.4)) {
          if (a.lazy && !a.flee) { a.job = 'still'; return; } // よわいCPUは、ときどき化けずに立っているだけ
          if (c.fcd <= 0 && near(c.x, c.z, 2.4)) { const q = near(c.x, c.z, 2.4); c.form = { k: q.kind, v: q.v }; c.fcd = 0.8; a.job = 'still'; a.flee = 0; a.cool = 2; }
          else { a.tries++; if (a.tries > 3) a.job = 'still'; else if (c.fcd <= 0) a.dst = pickHide(); }
        }
        return;
      }
      if (a.job === 'still') {
        if (!play) return; a.cool = (a.cool || 0) - dt; if (a.cool > 0) return; a.cool = 1;
        if (L >= 2 && od > (L === 3 ? 7 : 10)) { const i = cages.findIndex((k) => k.id && k.id !== c.id); if (i >= 0) { c.form = null; a.job = 'rescue'; a.ci = i; a.rs = 0; return; } } // 牢の仲間を助けに行く
        if (esc && od > 9 && (a.bold || exitP.extra)) {
          if (exitP.extra || (exitP.open && kgot >= NEED)) { c.form = null; a.job = 'exit'; return; }
          const q = nearest(keys.filter((k) => !k.got && (!on || Math.hypot(k.x - on.x, k.z - on.z) > 8))); if (q) { c.form = null; a.job = 'chest'; a.qi = keys.indexOf(q); a.qT = 0; }
        }
        return;
      }
      if (a.job === 'chest') { // 宝箱を開ける（12秒ごとの合図は、強さに応じて失敗する）
        const q = keys[a.qi]; if (!q || q.got) { hidePlace(); return; }
        if (stand(q.x, q.z, 1.2)) { a.qT += dt; if (a.qT >= 12) { a.qT = 0; if (Math.random() < [0, 0.5, 0.25, 0.08][L]) { c.olk = 1; const qm = { k: 'qf', id: c.id, x: r2(q.x), z: r2(q.z) }; tell(qm); game.msg(c.id, qm); } else q.pr += 4; } } else a.qT = 0;
        return;
      }
      if (a.job === 'exit') {
        if (exitP.extra) { const w = exitP.extra; if (stand(w.x, w.z, 1.2)) cpuEscape(c); return; }
        if (!exitP.open) { hidePlace(); return; }
        const op = nearest(exitP.list.filter((e) => e.opened)); if (op) { if (stand(op.x, op.z, 1.2)) cpuEscape(c); return; }
        const e = nearest(exitP.list); if (e) stand(e.x, e.z, 1.8); return;
      }
      if (a.job === 'rescue') {
        const k = cages[a.ci]; if (!k || !k.id || (on && od < 5)) { hidePlace(); return; }
        if (stand(k.x, k.z, 1.4)) { a.rs += dt; if (a.rs >= 1) { a.rs = 0; tell({ k: 'rs', i: a.ci }); applyRescue(a.ci); hidePlace(); } } else a.rs = 0;
      }
    };
    const cpuTick = (dt) => {
      if (!hosted) { hosted = true; for (const c of cpuP()) { c.x = c.tx; c.z = c.tz; } }
      for (const c of cpuP()) {
        if (!alive(c)) continue;
        if (!c.ai) c.ai = { tk: 0, rp: 0, wi: 0, wp: null, tg: null, wait: 0, seen: [], job: 'hide', dst: null, bold: Math.random() < [0, 0.35, 0.65, 0.95][lvOf(c) - 1], lazy: lvOf(c) === 1 && Math.random() < 0.25, qT: 0, tries: 0, rs: 0, cool: 0 };
        if (c.pend) { c.pend.t -= dt; if (c.pend.t <= 0) { if (!c.pend.ok && near(c.pend.x, c.pend.z, c.pend.R || R_HIT)) hurt(c); c.pend = null; } }
        if (c.role === 'h') hideBrain(c, dt); else seekBrain(c, dt);
        c.tx = c.x; c.tz = c.z;
      }
    };
    // 隠れる側が叩かれたときの判定。自分の分は自分の端末、CPUの分はリーダーの端末が決める
    const takeHit = (v, m) => {
      const mn = v === MY, sy = (s) => { if (mn) say(s); };
      if (!(v.role === 'h' && alive(v) && phase !== 'end' && !(P[m.id] && wallBetween(P[m.id].x, P[m.id].z, v.x, v.z)) && Math.hypot(m.x - v.x, m.z - v.z) < (m.r || R_HIT) * (cho(v) === 'kodomo' ? 0.78 : 1))) return;
      const d1 = { k: 'hc', id: v.id, by: m.id, d: 1 }; let shielded = false;
      if (v.car || v.cage != null) tell(d1);
      else if (v.shield) { v.shield = false; shielded = true; tell({ k: 'hb', by: m.id }); sy('お札が鬼の一撃を防いだ！'); SGK.AUDIO.sfx('open'); }
      else if (v.inv > 0) tell(d1);
      else {
        v.hh -= rush() ? 999 : DMG[v.form ? SZ[v.form.k] || 'M' : 'H'];
        if (v.hh <= 0) { v.hh = 0; v.car = m.id; v.form = null; if (P[m.id]) P[m.id].carry = v.id; FX.push({ x: v.x, z: v.z, t: 0.4, bad: true }); SGK.AUDIO.sfx('hit'); sy('動けない！鬼に担がれた…'); tell({ k: 'hc', id: v.id, by: m.id, d: 1, dn: 1 }); }
        else { v.inv = 1; v.pan = 3; FX.push({ x: v.x, z: v.z, t: 0.4, bad: true }); SGK.AUDIO.sfx('hit'); sy(`ダメージ！ 体力${Math.round(v.hh)}　しばらく足が速い！`); tell(d1); }
      }
      const cb = P[m.id]; if (cb && cb.cpu && isHost() && cb.pend) { cb.pend.ok = true; if (shielded) cb.stun = 1.2; } // CPUの鬼に「当たった」と知らせる
    };
    const cpuSk = (m) => { // 人の技が、CPUにも効く
      for (const c of cpuP()) {
        if (!alive(c)) continue; const dx = c.x - m.x, dz = c.z - m.z, d = Math.hypot(dx, dz) || 0.01, dot = (dx * m.fx + dz * m.fz) / d;
        if (c.role === 's') { if (m.s === 'zeni' && d < 8 && dot > 0.5) c.stun = 2; if (m.s === 'sou' && d < 6) c.slowT = 3; }
        else if (cho(c) !== 'sou') { if (m.s === 'tengu' && d < 5.5 && dot > 0.4) { c.form = null; c.fcd = 3; } else if (m.s === 'kappa' && d < 6 && dot > 0.5) { marks[c.id] = 6; tell({ k: 'mk', id: c.id }); } else if (m.s === 'yuki' && d < 7) c.freeze = 3; }
      }
    };
    const game = {
      msg(from, m) {
        const p = P[m.id || from];
        if (m.k === 'hp') { const q = P[m.id || from]; if (!q || mine(q)) return; q.tx = m.x; q.tz = m.z; q.fx = m.fx; q.fz = m.fz; q.mv = m.m; const f = m.f ? { k: m.f[0], v: m.f[1] } : null; q.form = f; }
        else if (m.k === 'hs') { takeHit(MY, m); if (isHost()) for (const c of cpuH()) takeHit(c, m); }
        else if (m.k === 'hb') { if (m.by === me) { MY.stun = 1.2; if (pend) pend.ok = true; say('お札にはじかれた！'); } else if (isHost() && P[m.by] && P[m.by].cpu) { P[m.by].stun = 1.2; if (P[m.by].pend) P[m.by].pend.ok = true; } }
        else if (m.k === 'qf') { const q2 = P[m.id]; if (q2) q2.olk = 1; if (MY.role === 's' && alive(MY)) { nzo = { x: m.x, z: m.z, t: 4 }; FX.push({ x: m.x, z: m.z, t: 0.6, bad: true }); SGK.AUDIO.sfx('hit'); say('宝箱のほうで物音がした！'); } }
        else if (m.k === 'tr') { addTrap(m.tid, m.x, m.z); }
        else if (m.k === 'tx') { const i = traps.findIndex((q) => q.tid === m.tid); if (i >= 0) { scene.remove(traps[i].m); traps.splice(i, 1); } if (m.by) { FX.push({ x: m.x, z: m.z, t: 0.5, bad: true }); SGK.AUDIO.sfx('hit'); } }
        else if (m.k === 'ns') { nzo = { x: m.x, z: m.z, t: 5 }; SGK.AUDIO.sfx('news'); say('どこかで声がした…'); }
        else if (m.k === 'dc') { addDecoy(m.x, m.z, m.kd, m.v, m.rot); }
        else if (m.k === 'mk') { marks[m.id] = 6; }
        else if (m.k === 'kp') { const q = keys[m.i]; if (q && !q.got) { q.got = true; openCh(q); kgot++; say(`宝箱が開けられた（${kgot}/${NEED}）`); if (kgot >= NEED && !exitP.open) { exitP.open = true; say('出口が2か所に現れた！20秒そばにいると開く（全員の位置が壁越しに見える）'); } } }
        else if (m.k === 'xb') { applyBlock(); }
        else if (m.k === 'xo') { const e = exitP.list[m.i]; if (e && !e.opened) { e.opened = true; say('出口が開いた！鬼が強くなった（一撃でダウン・足が少し速い）'); SGK.AUDIO.sfx('coin'); } }
        else if (m.k === 'es') { const q = P[m.id]; if (q) { q.esc = true; say(`${nm(m.id)}が脱出した！`); SGK.AUDIO.sfx('gbWin'); } }
        else if (m.k === 'sk') {
          FX.push({ x: m.x + (m.s === 'yuki' || m.s === 'sou' ? 0 : m.fx * 2.5), z: m.z + (m.s === 'yuki' || m.s === 'sou' ? 0 : m.fz * 2.5), t: 0.5, bad: false, big: true });
          if (m.s === 'zeni' && MY.role === 's' && alive(MY)) { const dx = MY.x - m.x, dz = MY.z - m.z, d = Math.hypot(dx, dz) || 0.01; if (d < 8 && (dx * m.fx + dz * m.fz) / d > 0.5) { MY.stun = 2; say('銭を投げられて怯んだ！'); } }
          if (m.s === 'sou' && MY.role === 's' && alive(MY) && Math.hypot(MY.x - m.x, MY.z - m.z) < 6) { MY.slowT = 3; say('読経で足が重い…'); }
          if (MY.role === 'h' && alive(MY) && cho(MY) !== 'sou') { const dx = MY.x - m.x, dz = MY.z - m.z, d = Math.hypot(dx, dz) || 0.01, dot = (dx * m.fx + dz * m.fz) / d;
            if (m.s === 'tengu' && d < 5.5 && dot > 0.4) { MY.form = null; MY.fcd = 3; say('天狗の風で姿があらわになった！'); }
            else if (m.s === 'kappa' && d < 6 && dot > 0.5) { marks[me] = 6; tell({ k: 'mk', id: me }); say('水をかけられた！しばらく光って見える'); }
            else if (m.s === 'yuki' && d < 7) { MY.freeze = 3; say('吹雪で動けない！'); } }
          if (isHost()) cpuSk(m);
        }
        else if (m.k === 'hc') { if (P[m.id] && P[m.id].role === 'h') { if (m.d) { if (m.dn) { const h = P[m.id], sk = P[m.by]; if (h && sk && sk.role === 's') { h.car = m.by; sk.carry = m.id; sk.carryT = 0; sk.form = null; h.form = null; if (m.by === me) say(`${nm(m.id)}を担いだ！牢へ運べ`); else if (m.id !== me) say(`${nm(m.id)}が担がれた！`); } } if (m.id !== me) { FX.push({ x: P[m.id].x, z: P[m.id].z, t: 0.4, bad: true }); SGK.AUDIO.sfx('hit'); } } else caught(m.id, m.by); } if (m.by === me && pend) pend.ok = true; { const cb = P[m.by]; if (cb && cb.cpu && isHost() && cb.pend) cb.pend.ok = true; } }
        else if (m.k === 'cg') { applyCage(m.i, m.id, m.by); }
        else if (m.k === 'cr') { applyRelease(m.id); }
        else if (m.k === 'rs') { applyRescue(m.i); }
        else if (m.k === 'hl') { if (p) p.hp = m.hp; }
      },
      update(dt) {
        t += dt; phase = t < HIDE_T ? 'hide' : 'play'; toastT -= dt;
        for (const id of ids) { const p = P[id]; p.cd -= dt; p.stun -= dt; p.fcd -= dt; p.sk = Math.max(0, p.sk - dt); p.boost -= dt; p.freeze -= dt; p.slowT -= dt; p.olk -= dt; p.inv -= dt; p.pan -= dt; p.arrowT -= dt; }
        for (const k in marks) marks[k] -= dt;
        // 自分の操作
        { const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.connected); if (gp && !qv && Math.abs(gp.axes[2]) > 0.2) cyaw -= gp.axes[2] * 2.6 * dt; }
        const sn = Math.sin(cyaw), cs = Math.cos(cyaw), RT = qv ? RIGHT : [-cs, sn], FW = qv ? FWD : [sn, cs];
        const [ix, iy] = inVec(), wx = RT[0] * ix + FW[0] * -iy, wz = RT[1] * ix + FW[1] * -iy, ml = Math.hypot(wx, wz);
        const act = alive(MY) && !done && !MY.car && MY.cage == null; MY.mv = 0;
        // 担ぐ・牢・救助
        for (const c of cages) if (c.id) c.t -= dt;
        if (MY.car) { const cr = P[MY.car]; if (cr) { MY.x = cr.x; MY.z = cr.z; } }
        else if (MY.cage != null) { const c = cages[MY.cage]; MY.x = c.x; MY.z = c.z; if (c.t <= 0 && !done) { const by = c.by; c.id = null; caught(me, by); tell({ k: 'hc', id: me, by }); } }
        if (MY.role === 's' && MY.carry && alive(MY)) { MY.carryT += dt; if (MY.carryT >= CARRY_T) { const id = MY.carry; tell({ k: 'cr', id }); applyRelease(id); } }
        if (MY.role === 's' && MY.carry && alive(MY)) { const ci = cages.findIndex((c) => !c.id && Math.hypot(c.x - MY.x, c.z - MY.z) < 1.8); if (ci >= 0) { const id = MY.carry; tell({ k: 'cg', i: ci, id, by: me }); applyCage(ci, id, me); } }
        rescuing = null; if (MY.role === 'h' && act && !MY.form) { cages.forEach((c, i) => { if (c.id && c.id !== me && Math.hypot(c.x - MY.x, c.z - MY.z) < 1.8) rescuing = i; }); if (rescuing != null) { MY.rsT += dt; if (MY.rsT >= 1) { MY.rsT = 0; tell({ k: 'rs', i: rescuing }); applyRescue(rescuing); rescuing = null; } } else MY.rsT = 0; } else MY.rsT = 0;
        if (act && MY.stun <= 0) {
          const locked = (MY.role === 's' && phase === 'hide') || !!qte;
          const dis = MY.role === 'h' && MY.form;
          if (!locked && MY.freeze <= 0 && ml > 0.05) {
            if (dis && o.mv === 'none') { const a = Math.atan2(MY.fx, MY.fz) - ix * 3 * dt; MY.fx = Math.sin(a); MY.fz = Math.cos(a); }
            else { const c = cho(MY); let sp; if (MY.role === 's') { sp = MY.form ? 2.8 : c === 'tengu' ? 6.0 : SP_S; if (MY.carry && c !== 'oni') sp *= 0.85; if (rush()) sp *= 1.15; if (MY.slowT > 0) sp *= 0.5; } else { sp = dis ? (c === 'shonin' ? 3.2 : c === 'kariudo' ? 2.6 : SP_HS) : (c === 'kodomo' ? 5.0 : SP_H); if (MY.pan > 0) sp *= 1.5; if (c === 'kenzan' && (cages.some((cc) => cc.id && cc.id !== me) || ids.some((i) => i !== me && P[i].car))) sp *= 1.4; if (MY.boost > 0) sp *= c === 'dorobo' ? 1.6 : 1.8; if (seekers().some((q) => q.id !== me && cho(q) === 'yuki' && Math.hypot(q.x - MY.x, q.z - MY.z) < 3.5)) sp *= 0.85; } moveBy(MY, wx / Math.max(1, ml) * sp * dt, wz / Math.max(1, ml) * sp * dt, MY.role === 's' ? 0.6 : 0.4); MY.fx = wx / ml; MY.fz = wz / ml; MY.mv = 1; }
          }
          if (IN.aT && !qte) {
            if (MY.role === 's') { if (!locked) strike(MY); }
            else if (MY.fcd <= 0) { const q = near(MY.x, MY.z, 2.4); if (q) { MY.form = { k: q.kind, v: q.v }; MY.fcd = cho(MY) === 'geinin' ? 0.2 : 0.8; SGK.AUDIO.sfx('kmrKick'); say(`${KIND[q.kind]}に化けた`); } else say('近くに化けられる物がありません'); }
          }
          if (IN.cT) useSkill();
          if (IN.bT && !qte && MY.role === 'h' && MY.form) { MY.form = null; MY.fcd = 0.5; say('人の姿に戻った'); }
          if (IN.bT && MY.role === 's' && phase === 'play') { if (MY.form) { MY.form = null; MY.fcd = 0.5; say('鬼の姿に戻った'); } else if (MY.fcd <= 0 && !MY.carry) { const q2 = near(MY.x, MY.z, 2.4); if (q2) { MY.form = { k: q2.kind, v: q2.v }; MY.fcd = 0.8; SGK.AUDIO.sfx('kmrKick'); say(`${KIND[q2.kind]}に化けた（Aで叩くと正体を現す）`); } else say('近くに化けられる物がありません'); } }
        }
        // 鍵・出口
        if (esc) {
          const RATE = [0, 1, 1.7, 2.1, 2.2], okH = (q2) => q2.role === 'h' && alive(q2) && q2.olk <= 0 && !q2.form && !q2.mv && q2.stun <= 0 && q2.freeze <= 0; // 開ける人数が増えるほど1人あたりは遅くなる
          const qfail = (msg) => { MY.olk = 1; tell({ k: 'qf', id: me, x: r2(qte.q.x), z: r2(qte.q.z) }); say(msg); SGK.AUDIO.sfx('hit'); qte = null; };
          { const gp2 = (navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.connected); padOn = !!gp2; const pdq = HD.keys().pd; for (let i2 = 0; i2 < 4; i2++) { const on = !!(gp2 && (pdq['q' + QK[i2]] || []).some((bi) => gp2.buttons[bi] && gp2.buttons[bi].pressed)); if (on && !padPrev[i2]) qq.push(QK[i2]); padPrev[i2] = on; } if (!qte) qq.length = 0; }
          let n1 = null;
          keys.forEach((q, i) => {
            if (q.got) return; let n = 0;
            for (const id of ids) { const p = P[id]; if (!okH(p) || Math.hypot(q.x - p.x, q.z - p.z) >= 1.8 || (id === me && qte)) continue; n++; }
            if (act && MY.role === 'h' && okH(MY) && Math.hypot(q.x - MY.x, q.z - MY.z) < 1.8) n1 = q;
            if (n > 0) { let ws = 0; for (const id of ids) { const p = P[id]; if (okH(p) && Math.hypot(q.x - p.x, q.z - p.z) < 1.8 && !(id === me && qte)) ws += cho(p) === 'dorobo' ? 1.5 : 1; } q.pr += ws * (RATE[Math.min(4, n)] / Math.min(4, n)) * dt; }
            if (q.pr >= OPEN_W) { q.got = true; openCh(q); kgot++; tell({ k: 'kp', i }); say(`宝箱が開いて鍵を手に入れた（${kgot}/${NEED}）`); SGK.AUDIO.sfx('coin'); if (kgot >= NEED && !exitP.open) { exitP.open = true; say('出口が2か所に現れた！20秒そばにいると開く（全員の位置が壁越しに見える）'); } }
          });
          opening = n1 && !n1.got ? n1 : null; keys.forEach((q) => { if (q.frame) q.frame.visible = MY.role === 's' && !q.got; });
          if (opening && !qte) { qtT += dt; if (qtT >= 12) { qtT = 0; qte = { q: opening, seq: [0, 1, 2, 3].map(() => QK[Math.floor(Math.random() * 4)]), i: 0, t: 4 }; say('合図の順に押せ！'); } } else if (!qte) qtT = Math.max(0, qtT - dt);
          if (qte) {
            if (!act || qte.q.got || MY.stun > 0 || MY.role !== 'h' || Math.hypot(qte.q.x - MY.x, qte.q.z - MY.z) > 2.4) qte = null;
            else {
              qte.t -= dt; const pk = qq.shift() || null;
              if (pk) { if (pk === qte.seq[qte.i]) { qte.i++; SGK.AUDIO.sfx('kmrKick'); if (qte.i >= qte.seq.length) { qte.q.pr += 4; say('成功！'); qte = null; } } else qfail('失敗…1秒だけ開けられない'); }
              else if (qte.t <= 0) qfail('間に合わなかった…1秒だけ開けられない');
            }
          }
          if (exitP.open) exitP.list.forEach((e, ei) => { if (e.opened) return; let ws = 0; for (const id of ids) { const p = P[id]; if (okH(p) && Math.hypot(e.x - p.x, e.z - p.z) < 2.6) ws += cho(p) === 'dorobo' ? 1.5 : 1; } e.pr += ws * dt; if (e.pr >= EXIT_W) { e.opened = true; tell({ k: 'xo', i: ei }); say('出口が開いた！鬼が強くなった（一撃でダウン・足が少し速い）'); SGK.AUDIO.sfx('coin'); } }); // 出口は20秒そばにいると開く（やめても進捗は残る）
          if (act && MY.role === 'h' && ((exitP.open && exitP.list.some((e) => e.opened && Math.hypot(e.x - MY.x, e.z - MY.z) < 1.9)) || (exitP.extra && Math.hypot(exitP.extra.x - MY.x, exitP.extra.z - MY.z) < 1.9))) { MY.esc = true; tell({ k: 'es', id: me }); say('脱出成功！'); SGK.AUDIO.sfx('gbWin'); }
        }
        if (esc) for (const e of exitP.list) { e.m.visible = exitP.open; e.beam.visible = !!e.opened; }
        // 逃げる側が1人だけになったら、ランダムな位置に即使える脱出口が出る（位置は種から決めるので全員同じ）
        if (esc && !solo && !exitP.extra && !exitP.blocked && !done && ids.filter((i) => P[i].role0 === 'h').length >= 2 && hiders().length === 1) {
          const rr = mulberry((cfg.seed ^ 0x5a17) >>> 0), w = wells[Math.floor(rr() * wells.length)]; setWell(w, true); exitP.extra = { x: w.x, z: w.z, w };
          say('最後の1人に脱出口が現れた！井戸の蓋が開いた（鬼は近くに2秒いると蓋を閉じられる）'); SGK.AUDIO.sfx('open');
        }
        // 鬼が開いた井戸の近くに2秒とどまると蓋を閉じられる。閉じると普通の出口（2か所）が開く
        if (esc && exitP.extra && MY.role === 's' && alive(MY) && phase === 'play' && MY.stun <= 0 && !MY.carry && Math.hypot(exitP.extra.x - MY.x, exitP.extra.z - MY.z) < 2.6) { MY.blkT = (MY.blkT || 0) + dt; if (MY.blkT >= 2) { MY.blkT = 0; tell({ k: 'xb' }); applyBlock(); } } else MY.blkT = 0;
        // 送る
        sendT -= dt; if (sendT <= 0 && !solo) { sendT = 0.1; tell({ k: 'hp', x: r2(MY.x), z: r2(MY.z), fx: r2(MY.fx), fz: r2(MY.fz), m: MY.mv, f: MY.form ? [MY.form.k, MY.form.v] : 0 }); if (isHost()) for (const c of cpuP()) tell({ k: 'hp', id: c.id, x: r2(c.x), z: r2(c.z), fx: r2(c.fx), fz: r2(c.fz), m: c.mv, f: c.form ? [c.form.k, c.form.v] : 0 }); }
        // ほかの人の位置をなめらかに
        for (const id of ids) { if (id === me || mine(P[id])) continue; const p = P[id]; p.x += (p.tx - p.x) * Math.min(1, dt * 12); p.z += (p.tz - p.z) * Math.min(1, dt * 12); }
        // 叩いた結果（ほかの人の「見つかった」が来なければ置物に当たっただけ）
        if (pend) { pend.t -= dt; if (pend.t <= 0) { if (!pend.ok && near(pend.x, pend.z, pend.R || R_HIT)) hurt(MY); pend = null; } }
        if (isHost() && !done) cpuTick(dt); // 2.95.0 CPUを動かす
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
          const escN = ids.filter((i) => P[i].esc).length, cgt = ids.filter((i) => P[i].caught0).length, nH0 = ids.filter((i) => P[i].role0 === 'h').length, WN = Math.min(nH0 <= 4 ? 3 : Math.ceil(nH0 * 0.75), nH0), ev = () => (cgt >= WN ? 's' : WN >= 2 && cgt === WN - 1 ? 'd' : escN > 0 ? 'h' : 's'); // 鬼が3人以上で勝ち・2人で引き分け
          const dnd = (p) => !!p.car || p.cage != null; // 2.99.12 ダウン＝鬼に担がれている／牢に入れられている
          const allDn = esc && phase === 'play' && hs.length > 0 && hs.every(dnd); // 脱出モード：残った逃げる側が全員ダウンしたら、その時点で終わり（助けに来られる人がいない）
          if (allDn) { for (const p of hs) p.caught0 = true; const c2 = cgt + hs.length; over = solo ? 's' : c2 >= WN ? 's' : WN >= 2 && c2 === WN - 1 ? 'd' : escN > 0 ? 'h' : 's'; }
          else if (esc && solo && MY.esc) over = 'h'; else if (esc && !solo && cgt >= WN) over = 's'; else if (esc && !solo && !hs.length) over = ev(); else if (!solo && !hs.length) over = 's'; else if (solo && (!alive(MY) || MY.role !== 'h')) over = 's'; else if (!solo && !ss.length && phase === 'play') over = esc ? 'k' : 'h'; else if (t >= RND) over = esc ? 's' : 'h'; // 脱出モードは10分で、時間切れは鬼の勝ち
          if (over) { done = true; this.finish(over); }
        }
        // 絵に反映
        for (const id of ids) { const p = P[id]; if (p.role === 'h' && !p.form) { /* 人 */ } look(p); const gp = p.grp; if (!gp) continue; gp.visible = !p.out && !p.esc; p.bob += dt * (p.mv ? 9 : 0); const hop = p.mv ? Math.abs(Math.sin(p.bob)) * (p.form ? 0.22 : 0.08) : 0; gp.position.set(p.x, hop, p.z); gp.rotation.y = Math.atan2(p.fx, p.fz); }
        if (cpu) { cpu.grp.position.set(cpu.x, 0, cpu.z); cpu.grp.rotation.y = Math.atan2(cpu.fx, cpu.fz); }
        if (view === 'fp') { if (act && MY.stun <= 0 && !(MY.role === 'h' && MY.form && o.mv === 'none')) { MY.fx = Math.sin(cyaw); MY.fz = Math.cos(cyaw); } if (MY.grp) MY.grp.visible = false; }
        camX += (MY.x - camX) * Math.min(1, dt * 6); camZ += (MY.z - camZ) * Math.min(1, dt * 6);
        // 印
        const q = alive(MY) && !(MY.role === 's' && (phase === 'hide' || MY.form)) ? near(MY.x, MY.z, 2.4) : null; hl.visible = !!q && act; if (q) { hl.position.set(q.x, 0.06, q.z); hl.scale.setScalar(1.5 + 0.3 * Math.sin(t * 8)); }
        if (MY.role === 's' && alive(MY) && MY.stun <= 0 && !done) for (const q of traps) if (Math.hypot(q.x - MY.x, q.z - MY.z) < 1.0) { MY.stun = 2.5; say('罠にかかった！'); tell({ k: 'tx', tid: q.tid, x: r2(q.x), z: r2(q.z), by: me }); scene.remove(q.m); traps.splice(traps.indexOf(q), 1); FX.push({ x: q.x, z: q.z, t: 0.5, bad: true }); SGK.AUDIO.sfx('hit'); break; }
        for (const q of traps) q.m.visible = MY.role !== 's';
        if (nzo) { nzo.t -= dt; nz.visible = nzo.t > 0; nz.position.set(nzo.x, 0.06, nzo.z); nz.scale.setScalar(1 + 0.1 * Math.sin(t * 10)); if (nzo.t <= 0) nzo = null; } else nz.visible = false;
        bc.visible = bcT > 0 && !!beacon; if (beacon) { bc.position.set(beacon.x, 0.06, beacon.z); bc.scale.setScalar(1 + 0.08 * Math.sin(t * 8)); }
        for (const f of FX) f.t -= dt; while (FX.length && FX[0].t <= 0) FX.shift();
        const f0 = FX.find((f) => !f.bad), f1 = FX.find((f) => f.bad); sw.visible = !!f0; if (f0) { sw.position.set(f0.x, 0.07, f0.z); sw.scale.setScalar((1 + (0.25 - f0.t) * 3) * (f0.big ? 2.6 : 1)); } swm.visible = !!f1; if (f1) { swm.position.set(f1.x, 0.07, f1.z); }
      },
      finish(over) {
        const ini = MY.role0, hs = ids.filter((i) => P[i].role0 === 'h'), surv = (id) => !P[id].caught0 && !env.gone[id];
        const escN2 = ids.filter((i) => P[i].esc).length, winH = (id) => (esc ? (over === 'k' ? surv(id) : escN2 * 2 <= hs.length ? !!P[id].esc : over === 'h' || !!P[id].esc) : surv(id)), win = ini === 'h' ? winH(me) : over === 's', ws = hs.filter(winH).length; // 脱出できたのが半分以下なら、脱出できた人だけ勝ち
        const rows = ids.map((id) => { const p = P[id]; return `<b style="color:${col(id)}">${nm(id)}</b>（${(HD.CH[p.role0].find((x) => x.k === (p.role0 === 'h' ? p.chh : p.chs)) || {}).n}）　${p.role0 === 'h' ? (esc ? (p.esc ? '脱出成功！' : surv(id) ? '脱出できなかった' : '見つかった') : surv(id) ? '隠れきった！' : '見つかった') : `探す側：${p.caught}人見つけた`}`; });
        env.end({ title: win ? (ini === 'h' ? (esc ? (P[me].esc ? '脱出成功！' : 'みんなの勝ち！') : '隠れきった！') : '全員見つけた！') : over === 'd' ? '引き分け！' : (ini === 'h' ? (P[me].caught0 ? '見つかってしまった…' : '脱出できなかった…') : '見つけきれなかった…'), rows, cmd: { type: 'partyResult', game: 'hide', n: hids.length, win: win ? 1 : 0, ws, ex: esc ? 1 : 0, ne: escN2, nh: hs.length, esc: P[me].esc ? 1 : 0, cnt: P[me].caught, role: ini } });
      },
      draw() {
        setCam(); rd.render(scene, cam);
        const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
        const txt = (s, x, y, o2) => env.text(g, s, x, y, o2), pj = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
        const pv = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(cam); return v.z > 1 ? null : [(v.x * 0.5 + 0.5) * W, (-v.y * 0.5 + 0.5) * H]; };
        const vis = (p) => (p.role === 's' ? MY.role === 's' || !alive(MY) : MY.role === 'h' || !alive(MY)); // 逃げる側には鬼の名前を出さない
        for (const id of ids) { const p = P[id]; if (!alive(p) || id === me) continue; if (!vis(p)) continue; const sp0 = pv(p.x, p.form ? 1.5 : 2, p.z); if (!sp0 || sp0[0] < 0 || sp0[0] > W || sp0[1] < 0 || sp0[1] > H) continue; const [sx, sy] = sp0; txt(p.role === 's' ? `${nm(id)}（${chN(p)}）` : nm(id), sx, sy, { al: 'center', sz: 13, c: p.role === 's' ? '#ff9a8a' : '#cfe8ff' }); }
        { const [sx, sy] = pj(MY.x, MY.role === 'h' && MY.form ? 1.6 : 2.1, MY.z); txt('▼', sx, sy, { al: 'center', sz: 14, c: '#ffe070' }); }
        if (esc && exitP.open && alive(MY)) for (const id of ids) { const p = P[id]; if (id === me || !alive(p)) continue; const sp2 = pv(p.x, 1.1, p.z); if (!sp2 || sp2[0] < 0 || sp2[0] > W || sp2[1] < 0 || sp2[1] > H) continue; const isS = p.role === 's'; g.strokeStyle = isS ? '#ff5a4a' : '#6ac8ff'; g.lineWidth = 3; g.beginPath(); g.arc(sp2[0], sp2[1], 18, 0, 7); g.stroke(); if (isS || !vis(p)) txt(isS ? `鬼：${nm(id)}` : nm(id), sp2[0], sp2[1] - 26, { al: 'center', sz: 13, c: isS ? '#ff9a8a' : '#cfe8ff' }); }
        if (alive(MY) && !MY.form && !MY.carry && !MY.car && !(MY.role === 's' && phase === 'hide')) { const kk = MY.role === 'h' ? 'A' : 'B', nb = near(MY.x, MY.z, 2.4); // 化けられる物の目印（近い物に◆、いちばん近い物は大きく表示）
          for (const q of props) { if (q === nb || Math.hypot(q.x - MY.x, q.z - MY.z) > 9) continue; const sp3 = pv(q.x, 1.5, q.z); if (sp3) txt('◆', sp3[0], sp3[1], { al: 'center', sz: 14, c: '#e6c860' }); }
          if (nb) { const sp3 = pv(nb.x, 2.3, nb.z); if (sp3) { txt('▼', sp3[0], sp3[1] + 6, { al: 'center', sz: 22, b: 1, c: '#ffe070' }); txt(`${kk}：${KIND[nb.kind]}に化ける`, sp3[0], sp3[1] - 14, { al: 'center', sz: 16, b: 1, c: '#ffe070' }); } } }
        const rem = Math.max(0, Math.ceil(RND - t)); txt(`${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`, W / 2, 30, { al: 'center', sz: 26, b: 1 });
        txt(`${stg.name}　${MY.role === 's' ? '探す側' : MY.esc ? '脱出成功（観戦）' : alive(MY) ? '隠れる側' : '見つかった（観戦）'}　隠れている：${solo ? (alive(MY) ? 1 : 0) : hiders().length}人`, W / 2, 52, { al: 'center', sz: 14 });
        if (MY.role === 's' && MY.form) txt(`いまの姿：${KIND[MY.form.k]}（ゆっくり動ける・Aで叩くと正体を現す）`, 16, 56, { sz: 15, c: '#ffe070' });
        
        else if (MY.form) txt(`いまの姿：${KIND[MY.form.k]}（受けるダメージ：${SZN[SZ[MY.form.k] || 'M']}）${o.mv === 'none' ? '（動けない・←→で向き）' : '（ゆっくり動ける）'}　体力 ${Math.max(0, Math.round(MY.hh))}`, 16, 30, { sz: 16, c: '#ffe070' });
        else if (MY.role === 'h' && alive(MY)) txt(`体力 ${Math.max(0, Math.round(MY.hh))}${MY.pan > 0 ? '　足が速い！' : ''}`, 16, 30, { sz: 18, c: '#ffe070' });
        if (MY.role === 'h' && alive(MY)) { const k = Math.max(0, Math.min(1, MY.hh / 100)); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(16, 38, 150, 12); g.fillStyle = k > 0.5 ? '#6adf7a' : k > 0.25 ? '#f2c14e' : '#ff6a5a'; g.fillRect(18, 40, 146 * k, 8); }
        // キャラ（パッシブ・アクティブ）
        const BO = coarse ? 100 : 0; // スマホは下の操作ボタンの上に出す
        { const def = HD.CH[MY.role].find((x) => x.k === cho(MY)) || HD.CH[MY.role][0], keyN = coarse ? 'スキルボタン' : `${HD.kn(HD.keys().kb.c[0] || '?')}／${HD.pn((HD.keys().pd.pc || [])[0])}`;
          if (!qte) txt(`${keyN}：${def.ac.split('：')[0]}　${MY.sk > 0 ? `あと${Math.ceil(MY.sk)}秒` : '使える！'}`, 16, H - BO - 34, { sz: 14, c: MY.sk > 0 ? '#aaa' : '#ffe070', b: MY.sk <= 0 });
          // 左上のメニュー：パッシブ・スキルの説明
          { const [bx, by, bw2, bh2] = chBtn; g.fillStyle = 'rgba(40,30,15,.85)'; g.fillRect(bx, by, bw2, bh2); g.strokeStyle = '#b89a5a'; g.lineWidth = 1; g.strokeRect(bx, by, bw2, bh2); txt(chInfo ? '説明を閉じる' : 'スキル説明', bx + bw2 / 2, by + 19, { al: 'center', sz: 14, c: '#ffe9a0' });
            if (chInfo) { const pw = Math.min(W - 24, 560); g.fillStyle = 'rgba(0,0,0,.78)'; g.fillRect(bx, by + bh2 + 4, pw, 148); txt(def.n, bx + 10, by + bh2 + 26, { sz: 16, b: 1, c: '#ffe9a0' }); txt(`パッシブ：${def.pa}`, bx + 10, by + bh2 + 52, { sz: 13, c: '#cfe8ff' }); txt(`スキル（${keyN}）：${def.ac}`, bx + 10, by + bh2 + 78, { sz: 13, c: '#ffe9a0' }); txt('（どこかを押すと閉じます）', bx + 10, by + bh2 + 134, { sz: 12, c: '#aaa' }); } }
          if (MY.shield) txt('お札を構えている', 16, 52, { sz: 14, c: '#ffe070' }); if (MY.boost > 0) txt('ダッシュ中！', 16, 52, { sz: 14, c: '#ffe070' }); if (MY.freeze > 0) txt('動けない！', 16, 52, { sz: 16, c: '#9ad0ff' }); }
        if (MY.role === 'h' && cho(MY) === 'miko' && alive(MY) && seekers().some((q) => Math.hypot(q.x - MY.x, q.z - MY.z) < 6)) { g.fillStyle = 'rgba(255,40,40,0.12)'; g.fillRect(0, 0, W, H); txt('鬼の気配！', W / 2, H * 0.36, { al: 'center', sz: 20, b: 1, c: '#ff8a8a' }); }
        if (MY.role === 's') {
          for (const id in marks) if (marks[id] > 0 && P[id] && alive(P[id]) && P[id].role === 'h') { const q = P[id], [sx, sy] = pj(q.x, 0.1, q.z); g.strokeStyle = '#7ad0ff'; g.lineWidth = 4; g.beginPath(); g.ellipse(sx, sy, 34, 18, 0, 0, 7); g.stroke(); }
          if (cho(MY) === 'neko') for (const q of hiders()) if (q.id !== me && q.mv && Math.hypot(q.x - MY.x, q.z - MY.z) < 8) { const [sx, sy] = pj(q.x, 2.1, q.z); txt('？', sx, sy, { al: 'center', sz: 26, b: 1, c: '#ffe070' }); }
          if (MY.arrowT > 0) { let b = null, bd = 1e9; for (const q of hiders()) { if (q.id === me) continue; const d = Math.hypot(q.x - MY.x, q.z - MY.z); if (d < bd) { bd = d; b = q; } } if (b) { const [ax, ay] = pj(MY.x, 1, MY.z), [bx, by] = pj(b.x, 1, b.z), l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l; txt('➤', ax + ux * 110, ay + uy * 110, { al: 'center', sz: 30, c: '#ffe070' }); txt(`${Math.round(bd)}m`, ax + ux * 140, ay + uy * 140 + 6, { al: 'center', sz: 14, c: '#ffe070' }); } }
        }
        for (const c of cages) if (c.id) { const [sx, sy] = pj(c.x, 3.2, c.z); txt(`牢 あと${Math.max(0, Math.ceil(c.t))}秒`, sx, sy, { al: 'center', sz: 16, c: '#e0b0ff' }); }
        if (MY.car) txt('鬼に担がれている…', W / 2, H * 0.62, { al: 'center', sz: 22, c: '#ffb0b0' });
        else if (MY.cage != null) txt(`牢の中… あと${Math.max(0, Math.ceil(cages[MY.cage].t))}秒で完全に負け（仲間の救助を待つ）`, W / 2, H * 0.62, { al: 'center', sz: 18, c: '#e0b0ff' });
        if (MY.carry && MY.role === 's') txt(`${nm(MY.carry)}を担いでいる（あと${Math.max(0, Math.ceil(CARRY_T - MY.carryT))}秒）→ 牢へ運べ（紫の光の所）`, W / 2, H * 0.62, { al: 'center', sz: 18, c: '#ffd0a0' });
        if (rescuing != null) { const k = Math.min(1, MY.rsT / 1); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W / 2 - 80, H * 0.66, 160, 14); g.fillStyle = '#9affb0'; g.fillRect(W / 2 - 78, H * 0.66 + 2, 156 * k, 10); txt('救助中…', W / 2, H * 0.66 - 6, { al: 'center', sz: 15, c: '#c8ffd0' }); }
        if (MY.blkT > 0 && exitP.extra) { const k = Math.min(1, MY.blkT / 2); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W / 2 - 80, H * 0.66, 160, 14); g.fillStyle = '#ffb060'; g.fillRect(W / 2 - 78, H * 0.66 + 2, 156 * k, 10); txt('井戸の蓋を閉めている…', W / 2, H * 0.66 - 6, { al: 'center', sz: 15, c: '#ffd9a8' }); }
        if (esc && opening && !qte) { const k = Math.min(1, opening.pr / OPEN_W); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W / 2 - 110, H * 0.7, 220, 16); g.fillStyle = '#ffd24a'; g.fillRect(W / 2 - 108, H * 0.7 + 2, 216 * k, 12); txt(qte ? '' : MY.olk > 0 ? '中断中…' : '宝箱を開けている…（動かない・化けない／12秒ごとに合図／やめても進捗は残る）', W / 2, H * 0.7 - 8, { al: 'center', sz: 15, c: '#ffe9a0' }); }
        if (esc && MY.role === 'h' && alive(MY)) { // 出口を開けている進み具合と、宝箱・出口の進捗（逃げる側にだけ見える）
          const ex = exitP.open ? exitP.list.find((e) => !e.opened && Math.hypot(e.x - MY.x, e.z - MY.z) < 2.6) : null;
          if (ex && ex.pr > 0) { const k = Math.min(1, ex.pr / EXIT_W); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(W / 2 - 110, H * 0.76, 220, 16); g.fillStyle = '#7affa0'; g.fillRect(W / 2 - 108, H * 0.76 + 2, 216 * k, 12); txt(`出口を開けている…あと${Math.ceil(EXIT_W - ex.pr)}秒（動かず化けずに・やめても進捗は残る）`, W / 2, H * 0.76 - 8, { al: 'center', sz: 14, c: '#c8ffd0' }); }
          for (const q of keys) if (!q.got && q.pr > 0) { const sp4 = pv(q.x, 1.8, q.z); if (sp4) txt(`${Math.floor(q.pr / OPEN_W * 100)}%`, sp4[0], sp4[1], { al: 'center', sz: 14, c: '#ffe9a0' }); }
          if (exitP.open) for (const e of exitP.list) if (!e.opened && e.pr > 0) { const sp4 = pv(e.x, 3.9, e.z); if (sp4) txt(`出口 ${Math.floor(e.pr / EXIT_W * 100)}%`, sp4[0], sp4[1], { al: 'center', sz: 14, c: '#9affb0' }); } }
        if (qte) { const bw = 54, x0 = W / 2 - bw * 2 - 9, y0 = H * 0.42; g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(x0 - 12, y0 - 40, bw * 4 + 54, bw * 2 + 104); txt('この順に押す！', W / 2, y0 - 18, { al: 'center', sz: 16, c: '#ffe9a0' }); qte.seq.forEach((c, i2) => { g.fillStyle = i2 < qte.i ? '#4aa84a' : i2 === qte.i ? '#f2c14e' : '#6a5a3a'; g.fillRect(x0 + i2 * (bw + 6), y0, bw, bw); txt(QL(c), x0 + i2 * (bw + 6) + bw / 2, y0 + bw / 2 + 10, { al: 'center', sz: 28, c: '#1a1208' }); }); g.fillStyle = '#ffd24a'; g.fillRect(x0, y0 + bw + 10, (bw * 4 + 18) * Math.max(0, qte.t / 4), 8);
          qrects.length = 0; QK.forEach((c, i2) => { const rx = x0 + i2 * (bw + 6), ry = y0 + bw + 30; qrects.push([rx, ry, bw, bw, c]); g.fillStyle = '#3a6a9a'; g.fillRect(rx, ry, bw, bw); txt(QL(c), rx + bw / 2, ry + bw / 2 + 10, { al: 'center', sz: 26, c: '#fff' }); }); txt((() => { const kb = HD.keys().kb, f = (k) => HD.kn(kb[k][0] || '?'); return `キー：${f('a')}=A　${f('b')}=B　${f('qx')}=X　${f('qy')}=Y　／　画面のボタンも押せます`; })(), W / 2, y0 + bw * 2 + 52, { al: 'center', sz: 13, c: '#e8dcc0' }); } else qrects.length = 0;
        if (esc) { txt(`宝箱 ${kgot}/${NEED}　出口：${exitP.open ? '2か所に出現！全員の位置が見える' : 'まだ現れない'}`, W / 2, 74, { al: 'center', sz: 15, c: exitP.open ? '#9affb0' : '#ffe070' });
          if (MY.role === 'h' && alive(MY)) for (const e of (exitP.open ? exitP.list : []).concat(exitP.extra ? [exitP.extra] : [])) { const [ax, ay] = pj(MY.x, 1, MY.z), [bx, by] = pj(e.x, 1, e.z), l = Math.hypot(bx - ax, by - ay) || 1; if (l > 120) txt('出口 ➤', ax + (bx - ax) / l * 120, ay + (by - ay) / l * 120, { al: 'center', sz: 20, b: 1, c: '#9affb0' }); } }
        if (rush()) txt('脱出口が開いている間：鬼は一撃でダウン・足が少し速い！', W / 2, 96, { al: 'center', sz: 15, c: '#ff9a8a' });
        const qn = alive(MY) && !(MY.role === 's' && phase === 'hide') ? near(MY.x, MY.z, 2.4) : null;
        const KN = (k) => HD.kn(HD.keys().kb[k][0] || '?'), mvK = () => `${KN('u')}${KN('l')}${KN('d')}${KN('r')}／スティック`; const hint = MY.role === 's' ? `${KN('a')}：叩く（置物を叩くと体力-1）　${MY.form ? `${KN('b')}：鬼の姿に戻る　` : qn ? `${KN('b')}：${KIND[qn.kind]}に化ける　` : ''}移動：${mvK()}` : alive(MY) ? `${qn ? `${KN('a')}：${KIND[qn.kind]}に化ける　` : ''}${MY.form ? `${KN('b')}：人に戻る　` : ''}移動：${mvK()}` : '';
        if (chInfo && hint) txt(`操作：${hint}`, 22, 80 + 28 + 4 + 104, { sz: 13, c: '#e8dcc0' });
        if (toastT > 0 && toast) txt(toast, W / 2, H * 0.28, { al: 'center', sz: 22, b: 1, c: '#ffe9a0' });
        if (phase === 'hide') { const left = Math.ceil(HIDE_T - t); if (MY.role === 's') { g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(0, 0, W, H); txt(`目をつぶって数えています… ${left}`, W / 2, H / 2, { al: 'center', sz: 28, b: 1 }); } else if (!esc) txt(`隠れよう！（あと${left}秒）◆の付いた物の近くでAを押すと化けられる`, W / 2, H * 0.2, { al: 'center', sz: 20, b: 1, c: '#bff0c0' }); }
        if (MY.stun > 0) { g.fillStyle = 'rgba(255,0,0,0.18)'; g.fillRect(0, 0, W, H); }
        if (stick.on) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(stick.x0, stick.y0, 50, 0, 7); g.stroke(); g.beginPath(); g.arc(stick.x0 + stick.x * 50, stick.y0 + stick.y * 50, 20, 0, 7); g.fillStyle = 'rgba(255,255,255,.45)'; g.fill(); }
      },
      dispose() { removeEventListener('resize', fitCam); removeEventListener('keydown', qk); cv.removeEventListener('pointerdown', qp); cv.removeEventListener('pointerdown', ip); cv.removeEventListener('pointerdown', dd); cv.removeEventListener('pointermove', dm); removeEventListener('pointerup', du); removeEventListener('pointercancel', du); cv.removeEventListener('pointerdown', pd); cv.removeEventListener('pointermove', pm); removeEventListener('pointerup', pu); removeEventListener('pointercancel', pu); removeEventListener('touchend', tall, true); removeEventListener('touchcancel', tall, true); removeEventListener('blur', blr); try { rd.dispose(); } catch (e) {} if (c3.parentNode) c3.parentNode.removeChild(c3); },
    };
    return game;
  };
})();
