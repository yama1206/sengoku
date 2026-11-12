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
  };
  // 図案がない勢力（独立した家など）は名前の一字を丸で囲んだ文字紋
  function charMon(c, ch) {
    c.strokeStyle = INK; c.lineWidth = 0.13; c.beginPath(); c.arc(0, 0, 0.86, 0, Math.PI * 2); c.stroke();
    c.fillStyle = INK; c.font = 'bold 1.15px "Hiragino Mincho ProN","Yu Mincho",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 0, 0.06);
  }
  const cache = {};
  const PX = 64;
  K.image = function (fid, f) {
    const key = fid + ':' + (f && f.name);
    if (cache[key]) return cache[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = PX;
    const c = cv.getContext('2d'); c.translate(PX / 2, PX / 2); c.scale(PX * 0.4, PX * 0.4);
    const d = DESIGNS[(f && f.kamon) || fid];
    if (d) d(c); else charMon(c, ((f && f.name) || '?').replace(/家$/, '').charAt(0));
    return (cache[key] = cv);
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
