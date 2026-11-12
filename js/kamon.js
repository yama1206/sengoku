// 家紋：勢力ごとの紋を描く（簡略化した図案）。地図の城・町・軍勢の印に使う
// 図案は -1〜1 の座標で描き、勢力ごとに一度だけ小さなキャンバスへ描いて使い回す
(function () {
  const K = (SGK.KAMON = {});
  const INK = '#1b1712', PAPER = '#f4ecd8';
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
  // 木瓜：花びら n 枚＋中の花
  function mokko(c, x, y, R, n) {
    c.fillStyle = INK;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; circ(c, x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5, R * 0.5); }
    c.fillStyle = PAPER; circ(c, x, y, R * 0.36);
    c.fillStyle = INK; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; circ(c, x + Math.cos(a) * R * 0.2, y + Math.sin(a) * R * 0.2, R * 0.11); }
    circ(c, x, y, R * 0.1);
  }
  const hex = (x, y, r) => Array.from({ length: 6 }, (_, i) => [x + Math.cos(i * Math.PI / 3) * r, y + Math.sin(i * Math.PI / 3) * r]);
  const DESIGNS = {
    oda(c) { mokko(c, 0, 0, 0.95, 5); }, // 織田木瓜
    asakura(c) { mokko(c, 0, -0.47, 0.47, 4); mokko(c, -0.5, 0.38, 0.47, 4); mokko(c, 0.5, 0.38, 0.47, 4); }, // 三つ盛木瓜
    azai(c) { // 三つ盛亀甲
      for (const [x, y] of [[0, -0.45], [-0.47, 0.37], [0.47, 0.37]]) { c.fillStyle = INK; poly(c, hex(x, y, 0.5)); c.fillStyle = PAPER; poly(c, hex(x, y, 0.32)); c.fillStyle = INK; poly(c, hex(x, y, 0.17)); }
    },
    rokkaku(c) { // 隅立て四つ目結
      for (const [x, y] of [[0, -0.5], [0.5, 0], [0, 0.5], [-0.5, 0]]) { c.fillStyle = INK; poly(c, [[x, y - 0.44], [x + 0.44, y], [x, y + 0.44], [x - 0.44, y]]); c.fillStyle = PAPER; poly(c, [[x, y - 0.17], [x + 0.17, y], [x, y + 0.17], [x - 0.17, y]]); }
    },
    miyoshi(c) { // 三階菱
      c.fillStyle = INK;
      [[-0.56, 0.36], [0, 0.62], [0.56, 0.88]].forEach(([y, w]) => poly(c, [[0, y - 0.25], [w, y], [0, y + 0.25], [-w, y]]));
    },
    imagawa(c) { c.fillStyle = INK; c.fillRect(-0.9, -0.5, 1.8, 0.36); c.fillRect(-0.9, 0.14, 1.8, 0.36); }, // 二つ引両
    tsutsui(c) { // 梅鉢
      c.fillStyle = INK; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 1.2566; circ(c, Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0.34); }
      c.fillStyle = PAPER; circ(c, 0, 0, 0.26); c.fillStyle = INK; circ(c, 0, 0, 0.14);
    },
    ashikaga(c) { // 五七桐（簡略）
      c.fillStyle = INK;
      for (const a of [-0.75, 0, 0.75]) { c.save(); c.translate(0, 0.45); c.rotate(a); c.beginPath(); c.ellipse(0, -0.05, 0.28, 0.5, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      for (let i = 0; i < 4; i++) circ(c, 0, -0.85 + i * 0.22, 0.1);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) circ(c, s * 0.5, -0.62 + i * 0.22, 0.09);
    },
    saito(c) { // 立波（簡略）
      c.strokeStyle = INK; c.lineWidth = 0.17; c.lineCap = 'round';
      for (const y of [-0.45, 0, 0.45]) { c.beginPath(); for (let x = -0.85; x <= 0.85; x += 0.05) { const yy = y + Math.sin((x + 0.85) * 5.5) * 0.12; x === -0.85 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.stroke(); }
    },
    kitabatake(c) { // 笹竜胆（簡略）
      c.fillStyle = INK;
      for (const a of [-0.55, 0, 0.55]) { c.save(); c.translate(0, 0.85); c.rotate(a); c.beginPath(); c.ellipse(0, -0.42, 0.13, 0.42, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
      for (const [x, y] of [[-0.48, -0.38], [0, -0.62], [0.48, -0.38]]) poly(c, [[x - 0.22, y - 0.2], [x - 0.07, y - 0.05], [x, y - 0.24], [x + 0.07, y - 0.05], [x + 0.22, y - 0.2], [x + 0.14, y + 0.18], [x - 0.14, y + 0.18]]);
    },
    honganji(c) { // 下り藤（簡略）
      c.strokeStyle = INK; c.lineWidth = 0.12; c.beginPath(); c.arc(0, 0.1, 0.78, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      c.fillStyle = INK;
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const t = i / 4; c.beginPath(); c.ellipse(s * (0.66 - t * 0.42), -0.18 + t * 0.95, 0.17 - t * 0.05, 0.12 - t * 0.03, s * 0.5, 0, Math.PI * 2); c.fill(); }
    },
    nagano(c) { // 檜扇
      c.fillStyle = INK; c.beginPath(); c.moveTo(0, 0.8); c.arc(0, 0.8, 1.55, -Math.PI * 0.78, -Math.PI * 0.22); c.closePath(); c.fill();
      c.strokeStyle = PAPER; c.lineWidth = 0.06; for (let i = 1; i < 7; i++) { const a = -Math.PI * 0.78 + i * Math.PI * 0.56 / 7; c.beginPath(); c.moveTo(0, 0.8); c.lineTo(Math.cos(a) * 1.55, 0.8 + Math.sin(a) * 1.55); c.stroke(); }
      c.fillStyle = PAPER; circ(c, 0, 0.62, 0.1);
    },
    takeda(c) { // 武田菱（割菱）
      c.fillStyle = INK; const g = 0.06;
      for (const [x, y] of [[0, -0.47], [0.47, 0], [0, 0.47], [-0.47, 0]]) poly(c, [[x, y - 0.45 + g], [x + 0.45 - g, y], [x, y + 0.45 - g], [x - 0.45 + g, y]]);
    },
    hojo(c) { c.fillStyle = INK; poly(c, [[0, -0.85], [0.42, -0.05], [-0.42, -0.05]]); poly(c, [[-0.44, 0.05], [-0.02, 0.85], [-0.86, 0.85]]); poly(c, [[0.44, 0.05], [0.86, 0.85], [0.02, 0.85]]); }, // 三つ鱗
    mori(c) { c.fillStyle = INK; c.fillRect(-0.8, -0.72, 1.6, 0.26); circ(c, 0, 0.0, 0.27); circ(c, -0.4, 0.5, 0.27); circ(c, 0.4, 0.5, 0.27); }, // 一文字に三つ星
    shimazu(c) { // 丸に十字
      c.strokeStyle = INK; c.lineWidth = 0.16; c.beginPath(); c.arc(0, 0, 0.84, 0, Math.PI * 2); c.stroke();
      c.fillStyle = INK; c.fillRect(-0.62, -0.1, 1.24, 0.2); c.fillRect(-0.1, -0.62, 0.2, 1.24);
    },
    amako(c) { // 平四つ目結
      for (const [x, y] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) { c.fillStyle = INK; c.fillRect(x - 0.36, y - 0.36, 0.72, 0.72); c.fillStyle = PAPER; c.fillRect(x - 0.13, y - 0.13, 0.26, 0.26); }
    },
    nagao(c) { c.fillStyle = INK; circ(c, 0, 0, 0.3); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; circ(c, Math.cos(a) * 0.66, Math.sin(a) * 0.66, 0.2); } }, // 九曜
    ryuzoji(c) { // 日足
      c.fillStyle = INK; circ(c, 0, 0, 0.3);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, b = 0.16; poly(c, [[Math.cos(a - b) * 0.38, Math.sin(a - b) * 0.38], [Math.cos(a) * 0.92, Math.sin(a) * 0.92], [Math.cos(a + b) * 0.38, Math.sin(a + b) * 0.38]]); }
    },
    mogami(c) { // 丸に二つ引両
      c.strokeStyle = INK; c.lineWidth = 0.16; c.beginPath(); c.arc(0, 0, 0.84, 0, Math.PI * 2); c.stroke();
      c.fillStyle = INK; c.fillRect(-0.7, -0.4, 1.4, 0.26); c.fillRect(-0.7, 0.14, 1.4, 0.26);
    },
    utsunomiya(c) { // 三つ巴
      c.fillStyle = INK;
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(i * Math.PI * 2 / 3); c.beginPath(); c.arc(0, -0.42, 0.36, 0, Math.PI * 2); c.fill(); c.beginPath(); c.moveTo(0.36, -0.42); c.quadraticCurveTo(0.6, 0.3, -0.2, 0.75); c.quadraticCurveTo(0.3, 0.2, -0.05, -0.1); c.closePath(); c.fill(); c.restore(); }
    },
    ito(c) { mokko(c, 0, 0, 0.9, 4); }, // 木瓜
    chosokabe(c) { // 片喰
      c.fillStyle = INK;
      for (let i = 0; i < 3; i++) { c.save(); c.rotate(i * Math.PI * 2 / 3); circ(c, -0.2, -0.5, 0.27); circ(c, 0.2, -0.5, 0.27); poly(c, [[-0.44, -0.45], [0, 0], [0.44, -0.45]]); c.restore(); }
    },
  };
  // 図案がない勢力（独立した家など）は名前の一字を丸で囲んだ文字紋
  function charMon(c, ch) {
    c.strokeStyle = INK; c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.86, 0, Math.PI * 2); c.stroke();
    c.fillStyle = INK; c.font = 'bold 1.15px "Hiragino Mincho ProN","Yu Mincho",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 0, 0.06);
  }
  // ---- 自作の家紋：枠・図形・数・間隔・大きさ・向き・中央の図形を組み合わせる ----
  K.FRAMES = ['なし', '丸', '角', '菱'];
  K.SHAPES = ['丸', '菱', '角', '鱗', '花弁', '引両', '輪'];
  K.PRESETS = Object.keys(DESIGNS);
  K.PRESET_NAMES = { oda: '織田木瓜', asakura: '三つ盛木瓜', azai: '三つ盛亀甲', rokkaku: '隅立て四つ目結', miyoshi: '三階菱', imagawa: '二つ引両', tsutsui: '梅鉢', ashikaga: '五七桐', saito: '立波', kitabatake: '笹竜胆', honganji: '下り藤', nagano: '檜扇', takeda: '武田菱', hojo: '三つ鱗', mori: '一文字に三つ星', shimazu: '丸に十字', amako: '平四つ目結', nagao: '九曜', ryuzoji: '日足', mogami: '丸に二つ引両', utsunomiya: '三つ巴', ito: '木瓜', chosokabe: '片喰' };
  function shape(c, k, x, y, r, a) {
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = INK;
    if (k === 0) circ(c, 0, 0, r);
    else if (k === 1) poly(c, [[0, -r], [r * 0.75, 0], [0, r], [-r * 0.75, 0]]);
    else if (k === 2) c.fillRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
    else if (k === 3) poly(c, [[0, -r], [r * 0.95, r * 0.7], [-r * 0.95, r * 0.7]]);
    else if (k === 4) { c.beginPath(); c.ellipse(0, 0, r * 0.45, r, 0, 0, Math.PI * 2); c.fill(); }
    else if (k === 5) c.fillRect(-r * 1.4, -r * 0.3, r * 2.8, r * 0.6);
    else { circ(c, 0, 0, r); c.fillStyle = PAPER; circ(c, 0, 0, r * 0.55); }
    c.restore();
  }
  K.drawMon = function (c, m) {
    if (m.p && DESIGNS[m.p]) return DESIGNS[m.p](c);
    const inner = m.f ? 0.72 : 0.95;
    if (m.f) {
      c.strokeStyle = INK; c.lineWidth = 0.14; c.beginPath();
      if (m.f === 1) c.arc(0, 0, 0.86, 0, Math.PI * 2); else if (m.f === 2) c.rect(-0.8, -0.8, 1.6, 1.6); else { c.moveTo(0, -0.92); c.lineTo(0.92, 0); c.lineTo(0, 0.92); c.lineTo(-0.92, 0); c.closePath(); }
      c.stroke();
    }
    const n = m.n || 1, d = (m.d || 0) / 6 * inner * 0.7, r = (m.z || 3) / 6 * inner * 0.6, rot = (m.r || 0) * Math.PI / 8;
    if (m.s === 5 && n > 1) { for (let i = 0; i < n; i++) shape(c, 5, 0, (i - (n - 1) / 2) * r * 0.9 * (1 + d * 2), r * 0.6, rot); } // 引両は並べる
    else for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n + rot; shape(c, m.s || 0, n > 1 ? Math.cos(a) * d : 0, n > 1 ? Math.sin(a) * d : 0, r, n > 1 ? a + Math.PI / 2 : rot); }
    if (m.c != null && m.c >= 0) shape(c, m.c, 0, 0, r * 0.6, 0);
  };
  K.monImage = function (m, px) {
    const key = 'mon:' + JSON.stringify(m) + ':' + (px || PX);
    if (cache[key]) return cache[key];
    const P = px || PX, cv = document.createElement('canvas'); cv.width = cv.height = P;
    const c = cv.getContext('2d'); c.translate(P / 2, P / 2); c.scale(P * 0.4, P * 0.4); K.drawMon(c, m);
    return (cache[key] = cv);
  };
  const cache = {};
  const PX = 64;
  K.image = function (fid, f) {
    if (f && f.mon) return K.monImage(f.mon);
    const key = fid + ':' + (f && f.name);
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = PX;
    const c = cv.getContext('2d'); c.translate(PX / 2, PX / 2); c.scale(PX * 0.4, PX * 0.4);
    const d = DESIGNS[(f && f.kamon) || fid];
    if (d) d(c); else charMon(c, ((f && f.name) || '?').replace(/家$/, '').charAt(0));
    return (cache[key] = cv);
  };
  // プレイヤーの印（家紋を決めていれば紋、なければ null を返して呼び手が点を描く）
  K.monBadge = function (ctx, m, x, y, size, frame, lw) {
    if (!m) return false; const h = size / 2;
    ctx.fillStyle = PAPER; ctx.strokeStyle = frame || '#2a2118'; ctx.lineWidth = lw || 2;
    ctx.beginPath(); ctx.arc(x, y, h, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(K.monImage(m), x - h * 0.98, y - h * 0.98, h * 1.96, h * 1.96); ctx.stroke();
    return true;
  };
  // 紋の印を描く：shape は 'sq'（城）か 'ci'（町・村・部隊）。frame は枠の色
  K.badge = function (ctx, fid, f, x, y, size, shape, frame, lw) {
    const h = size / 2;
    ctx.fillStyle = PAPER; ctx.strokeStyle = frame || '#2a2118'; ctx.lineWidth = lw || 1.5;
    ctx.beginPath(); if (shape === 'sq') ctx.rect(x - h, y - h, size, size); else ctx.arc(x, y, h, 0, Math.PI * 2);
    ctx.fill();
    if (fid) ctx.drawImage(K.image(fid, f), x - h * 0.98, y - h * 0.98, h * 1.96, h * 1.96);
    ctx.stroke();
  };
})();
