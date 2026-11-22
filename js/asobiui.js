// 2.62.0 賭場の新しい遊びの画面：独楽回し（マイ独楽を削る轆轤・盥の勝負）・貝絵合わせ・絵双六（仕組みは sim/asobi.js）
//  賭場の画面（gambleui.js）のタブから呼ばれる：mount(st, tab) で場面を作り、update(st, tab, P, myId, sel) で毎回あわせる
(function () {
  const UI = (SGK.ASOBIUI = {}), K = SGK.KOMA, A = SGK.ASOBI;
  const sfx = (k) => { try { SGK.AUDIO.sfx(k); } catch (e) {} };
  const money = (n) => SGK.SIM.money(n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cmd = (c) => SGK.cmd(c);
  let ruleOpen = false; document.addEventListener('toggle', (e) => { if (e.target && e.target.classList && e.target.classList.contains('asRule')) ruleOpen = e.target.open; }, true);
  const ruleHtml = (txt, extra) => `<details class="rule asRule" ${ruleOpen ? 'open' : ''}><summary>遊び方</summary>${esc(txt)}</details>${extra || ''}`; // 2.67.1 スマホで場所をとらないよう、遊び方はたたむ
  UI.has = (tab) => tab === 'koma' || tab === 'kai' || tab === 'sugoroku';

  const CSS = `<style id="asbCss">
#gbHall .asb{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:6px 8px var(--pb,200px);box-sizing:border-box;overflow:auto}
#gbHall .asb .ttl{background:rgba(10,6,3,.75);color:#fff2cc;font-weight:bold;padding:2px 14px;border-radius:12px;margin:4px 0}
#gbHall .kmList{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
#gbHall .kmCard{background:rgba(20,12,6,.8);border:1px solid #7a5a2e;border-radius:8px;padding:4px 6px;text-align:center;cursor:pointer;min-width:84px;font-size:12px}
#gbHall .kmCard.on{border-color:#f2c14e;box-shadow:0 0 8px #f2c14e88}
#gbHall .kmCard svg{display:block;margin:0 auto}
#gbHall .stt{display:grid;grid-template-columns:auto 90px auto;gap:1px 6px;font-size:11px;align-items:center;text-align:left}
#gbHall .stt i{display:block;height:6px;background:#0008;border-radius:3px;overflow:hidden}#gbHall .stt i b{display:block;height:100%;background:#f2c14e}
#gbHall .tarai{position:relative;width:min(340px,80vw,max(150px,calc(100vh - var(--pb,200px) - 150px)));aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 45%,#d9c39a,#a8875a 70%,#6a4a2a 72%,#4a3018 76%,transparent 77%);flex:none}
#gbHall .tarai canvas{position:absolute;inset:0;width:100%;height:100%}
#gbHall .vs{display:flex;gap:14px;align-items:center;justify-content:center;flex-wrap:wrap}
#gbHall .gauge{position:relative;width:min(360px,80vw);height:26px;background:linear-gradient(90deg,#3a5a8a,#5a9a5a 55%,#e6b422 82%,#f2c14e 88%,#c8281e 93%);border:2px solid #f2c14e;border-radius:6px;margin:6px auto;cursor:pointer}
#gbHall .kmGov{position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.45);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;cursor:pointer}
#gbHall .gauge b{position:absolute;top:-4px;bottom:-4px;width:4px;background:#fff;box-shadow:0 0 6px #000}
#gbHall .kaiB{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;width:min(480px,94vw)}
#gbHall .shell{position:relative;aspect-ratio:1.15;cursor:pointer;perspective:400px}
#gbHall .shell .in{position:absolute;inset:0;transition:transform .35s;transform-style:preserve-3d}
#gbHall .shell.open .in{transform:rotateY(180deg)}
#gbHall .shell .bk,#gbHall .shell .fc{position:absolute;inset:0;backface-visibility:hidden;border-radius:50% 50% 46% 46%/58% 58% 42% 42%;box-shadow:0 3px 6px rgba(0,0,0,.5)}
#gbHall .shell .bk{background:repeating-conic-gradient(from 180deg at 50% 100%,#e8dcc4 0 4deg,#cdbb98 4deg 8deg),#e0d0b0;border:2px solid #8a7450}
#gbHall .shell .fc{transform:rotateY(180deg);background:radial-gradient(circle at 50% 40%,#fff3c4,#e6b84a 60%,#b8862a);border:2px solid #7a5a1e;display:flex;align-items:center;justify-content:center;font-size:clamp(16px,4.5vw,28px);font-weight:bold}
#gbHall .shell.mine .fc{border-color:#ffe08a;box-shadow:0 0 8px #ffd76a}#gbHall .shell.oya .fc{filter:saturate(.4) brightness(.65)}
#gbHall .shell.gone{opacity:.85;cursor:default}
#gbHall .sgB{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;width:min(620px,96vw)}
#gbHall .sq{position:relative;background:#f3ead2;color:#3a2a1a;border:2px solid #8a6a3a;border-radius:6px;min-height:50px;padding:2px 3px;font-size:11px;line-height:1.2;box-sizing:border-box}
#gbHall .sq b{display:block;font-size:12px}#gbHall .sq small{color:#8a2a1a;font-size:10px}
#gbHall .sq.ev{background:#f6dcc0}#gbHall .sq.sgoal{background:#f2c14e}#gbHall .sq.start{background:#d8e6c8}
#gbHall .sq .sh{display:none;color:#8a2a1a;font-weight:bold;font-size:11px}
#gbHall details.rule summary{cursor:pointer;color:#f2c14e}
@media (max-width:600px){#gbHall .sq{min-height:34px;font-size:10px;padding:1px 2px}#gbHall .sq b{font-size:10px}#gbHall .sq small{display:none}#gbHall .sq .sh{display:block}#gbHall .tok{width:13px;height:13px}#gbHall .tok.t1{right:17px}#gbHall .asb{padding-left:4px;padding-right:4px}}
#gbHall .tok{position:absolute;width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px #000a;bottom:2px;transition:all .22s}
#gbHall .tok.t0{background:#c8281e;right:3px}#gbHall .tok.t1{background:#1e1e1e;right:23px}
#kmCraft{position:fixed;inset:0;z-index:8900;background:#1a120a;color:#f3ead2;font-family:"Hiragino Mincho ProN","Yu Mincho",serif;display:flex;flex-direction:column;overflow:auto}
#kmCraft button{font:inherit;color:#f3ead2;background:linear-gradient(#5a3e22,#2e2012);border:1px solid #a07c42;border-radius:6px;padding:6px 11px;cursor:pointer}
#kmCraft button.on{background:linear-gradient(#a0702e,#5a3e18);border-color:#f2c14e}#kmCraft button:disabled{opacity:.45}
#kmCraft .top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 10px;background:#0008}
#kmCraft .top .t{font-size:20px;font-weight:bold;color:#f2c14e;letter-spacing:.2em;margin-right:6px}
#kmCraft .body{flex:1;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:flex-start;padding:8px}
#kmCraft canvas{background:radial-gradient(ellipse at 50% 40%,#3a2a1a,#140c06);border:2px solid #7a5a2e;border-radius:8px;touch-action:none;cursor:crosshair;max-width:94vw}
#kmCraft .side{width:min(320px,94vw);display:flex;flex-direction:column;gap:8px;font-size:13px}
#kmCraft .woods{display:grid;grid-template-columns:1fr 1fr;gap:6px}#kmCraft .woods button{text-align:left;font-size:12px}
#kmCraft .pal{display:flex;gap:4px;flex-wrap:wrap}#kmCraft .pal button{width:30px;height:30px;padding:0;border-radius:50%}
#kmCraft input{font:inherit;background:#f3ead2;color:#2a1a10;border:1px solid #a07c42;border-radius:4px;padding:4px 6px;width:150px}
#kmCraft .stt{display:grid;grid-template-columns:auto 1fr auto;gap:3px 8px;align-items:center}
#kmCraft .stt i{display:block;height:8px;background:#0008;border-radius:4px;overflow:hidden}#kmCraft .stt i b{display:block;height:100%;background:#f2c14e}
#kmCraft .help{color:#cdbf9a;font-size:12px;line-height:1.5}
</style>`;

  // ================= 独楽の絵 =================
  const woodCol = (k) => (K.WOODS[k.wood] || K.WOODS.sugi).col;
  // 横から：SVG。sc＝1目盛りあたりの点
  function sideSvg(k, w) {
    const N = K.N, R = K.RMAX, H = N * K.DZ, top = 8, hh = H + top + 4, sc = w / (R * 2 + 4), cx = R + 2, pr = k.prof, wc = woodCol(k), id = 'kc' + Math.random().toString(36).slice(2, 8);
    const pts = []; for (let i = 0; i < N; i++) pts.push([cx + pr[i], top + i * K.DZ], [cx + pr[i], top + (i + 1) * K.DZ]);
    const left = pts.map(([x, y]) => [2 * cx - x, y]).reverse(), poly = pts.concat(left).map(([x, y]) => `${x.toFixed(1)},${y}`).join(' ');
    let bands = ''; for (let i = 0; i < N; i++) if (k.col && k.col[i]) bands += `<rect x="0" y="${top + i * K.DZ}" width="${R * 2 + 4}" height="${K.DZ}" fill="${k.col[i]}"/>`;
    let ring = ''; if (k.ring) { const ph = K.phys(k); ring = `<rect x="0" y="${top + ph.rowMax * K.DZ - 1}" width="${R * 2 + 4}" height="${K.DZ + 2}" fill="#5a5f66"/>`; }
    return `<svg width="${w}" height="${(hh * sc).toFixed(0)}" viewBox="0 0 ${R * 2 + 4} ${hh}"><defs><clipPath id="${id}"><polygon points="${poly}"/></clipPath><linearGradient id="${id}g" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient></defs>
<rect x="${cx - 0.8}" y="0" width="1.6" height="${top + 2}" fill="#4a3018"/><g clip-path="url(#${id})"><rect x="0" y="0" width="${R * 2 + 4}" height="${hh}" fill="${wc}"/>${bands}${ring}<rect x="0" y="0" width="${R * 2 + 4}" height="${hh}" fill="url(#${id}g)"/></g><polygon points="${poly}" fill="none" stroke="#2a1a0a" stroke-width=".6"/></svg>`;
  }
  // 上から：canvas に描いた円盤（回すときはこれを回す）
  function topImg(k, px) {
    const c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'), R = K.RMAX, ph = K.phys(k), s = px / 2 / R, wc = woodCol(k);
    for (let rho = Math.ceil(ph.rmax); rho >= 1; rho--) { let col = null; for (let i = 0; i < K.N; i++) if (k.prof[i] >= rho - 0.25) { col = (k.col && k.col[i]) || wc; break; } g.fillStyle = col || wc; g.beginPath(); g.arc(px / 2, px / 2, rho * s, 0, 7); g.fill(); }
    if (k.ring) { g.strokeStyle = '#5a5f66'; g.lineWidth = 2.5 * s; g.beginPath(); g.arc(px / 2, px / 2, (ph.rmax - 0.8) * s, 0, 7); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px / 2 - ph.rmax * s * 0.9, px / 2 - 1.2 * s, ph.rmax * s * 0.9, 2.4 * s); // 回っているのが見える印
    g.fillStyle = '#3a2410'; g.beginPath(); g.arc(px / 2, px / 2, Math.max(2, 1.6 * s), 0, 7); g.fill();
    const gr = g.createRadialGradient(px * 0.4, px * 0.35, 1, px / 2, px / 2, ph.rmax * s); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.beginPath(); g.arc(px / 2, px / 2, ph.rmax * s, 0, 7); g.fill();
    return c;
  }
  const bar = (v, mx) => `<i><b style="width:${Math.max(0, Math.min(100, (v / mx) * 100))}%"></b></i>`;
  function statHtml(k) { const s = K.stats(k); return `<div class="stt"><span>重さ</span>${bar(s.omo, 100)}<span>${s.omo}</span><span>持ち</span>${bar(s.mochi, 90)}<span>${s.mochi}秒</span><span>安定</span>${bar(s.stab, 100)}<span>${s.stab}</span><span>攻め</span>${bar(s.atk, 100)}<span>${s.atk}</span></div>`; }

  // ================= 轆轤（独楽を削る） =================
  let CR = null;
  function openCraft(P) {
    closeCraft(); const me = P.me;
    CR = { wood: 'sakura', ring: false, prof: K.blank().map(Number), col: Array(K.N).fill(''), mode: 'cut', color: K.COLORS[1], undo: [], spin: 0, chips: [], raf: 0, down: false, last: 0, money: me.money };
    const el = document.createElement('div'); el.id = 'kmCraft';
    el.innerHTML = (document.getElementById('asbCss') ? '' : CSS) + `<div class="top"><span class="t">独楽づくり</span><span class="help">轆轤で回る木を、指やマウスで押し当てて削る</span><span style="flex:1"></span><button data-c="x">やめる</button></div>
<div class="body"><canvas id="kmLathe" width="420" height="460"></canvas><div class="side">
<div><b>木を選ぶ</b><div class="woods">${Object.entries(K.WOODS).map(([k, W]) => `<button data-w="${k}"><b>${W.name}</b> ${money(W.price)}<br><span class="help">${W.note}</span></button>`).join('')}</div>
<label style="display:block;margin-top:4px"><input type="checkbox" id="kmRing" style="width:auto"> 鉄の輪をはめる（${money(K.RING_PRICE)}・いちばん太い所に。重く硬くなる）</label></div>
<div><b>道具</b><div class="row" style="display:flex;gap:4px;flex-wrap:wrap"><button data-m="cut">鉋（削る）</button><button data-m="paint">筆（色）</button><button data-c="undo">一つ戻す</button><button data-c="reset">木を替える（最初から）</button></div>
<div class="pal" id="kmPal" style="margin-top:4px">${K.COLORS.map((c) => `<button data-col="${c}" title="${c ? '' : '色を落とす'}" style="background:${c || 'repeating-linear-gradient(45deg,#d9c39a 0 4px,#b9a37a 4px 8px)'}"></button>`).join('')}</div></div>
<div><b>できばえ</b><div id="kmStat"></div><div class="help" id="kmHint"></div></div>
<div><b>名前</b> <input id="kmName" maxlength="10" placeholder="例：疾風丸"></div>
<div><button data-c="make" id="kmMake">仕上げる</button> <span id="kmCost"></span></div>
<div class="help">コツ：上は細い持ち手、胴（いちばん太い所）は低く平たく、先は細く尖らせると長く回る。背が高い・重心が高い独楽はすぐ倒れる。</div></div></div>`;
    document.body.appendChild(el); CR.el = el; CR.cv = el.querySelector('#kmLathe'); CR.g = CR.cv.getContext('2d');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.c === 'x') return closeCraft();
      if (d.w) { if (CR.wood !== d.w) { CR.wood = d.w; } }
      if (d.m) CR.mode = d.m;
      if (d.col != null) { CR.color = d.col; CR.mode = 'paint'; }
      if (d.c === 'undo' && CR.undo.length) { const u = CR.undo.pop(); CR.prof = u.p; CR.col = u.c; }
      if (d.c === 'reset') { CR.prof = K.blank().map(Number); CR.col = Array(K.N).fill(''); CR.undo = []; }
      if (d.c === 'make') { const k = cur(); cmd({ type: 'kmMake', wood: k.wood, ring: k.ring, prof: k.prof, col: k.col, name: el.querySelector('#kmName').value }); sfx('coin'); closeCraft(); return; }
      side();
    });
    el.querySelector('#kmRing').onchange = (e) => { CR.ring = e.target.checked; side(); };
    const cv = CR.cv, at = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height]; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); CR.down = true; CR.undo.push({ p: CR.prof.slice(), c: CR.col.slice() }); if (CR.undo.length > 40) CR.undo.shift(); tool(...at(e)); });
    cv.addEventListener('pointermove', (e) => { if (CR.down) tool(...at(e)); });
    const up = () => { if (CR) { CR.down = false; side(); } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    side(); loop();
  }
  const cur = () => ({ wood: CR.wood, ring: CR.ring, prof: K.clean(CR.prof), col: CR.col.slice() });
  function closeCraft() { if (!CR) return; cancelAnimationFrame(CR.raf); CR.el.remove(); CR = null; }
  UI.closeCraft = closeCraft;
  // 轆轤の上の位置：中心 cx、上から top、1目盛り sc 点
  const LG = () => { const W = CR.cv.width, H = CR.cv.height, sc = Math.min((W - 40) / (K.RMAX * 2), (H - 70) / (K.N * K.DZ)); return { cx: W / 2, top: 40, sc }; };
  function tool(x, y) {
    const { cx, top, sc } = LG(), row = Math.floor((y - top) / (K.DZ * sc)); if (row < 0 || row >= K.N) return;
    if (CR.mode === 'paint') { CR.col[row] = CR.color; return; }
    const rad = Math.abs(x - cx) / sc; let cut = false;
    for (let d = -1; d <= 1; d++) {
      const i = row + d; if (i < 0 || i >= K.N) continue; const tgt = Math.max(1, rad + Math.abs(d) * 1.6);
      if (CR.prof[i] > tgt) { CR.prof[i] = Math.max(tgt, CR.prof[i] - (d ? 0.5 : 1.1)); cut = true; }
    }
    if (cut) { const now = performance.now(); if (now - CR.last > 70) { CR.last = now; sfx('carve'); } for (let n = 0; n < 2; n++) CR.chips.push({ x: cx + (x > cx ? 1 : -1) * CR.prof[row] * sc, y, vx: (x > cx ? 1 : -1) * (40 + Math.random() * 80), vy: -40 - Math.random() * 60, t: 0 }); }
  }
  function side() {
    if (!CR) return; const k = cur(), W = K.WOODS[CR.wood], cost = W.price + (CR.ring ? K.RING_PRICE : 0), s = K.stats(k), el = CR.el;
    el.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('on', b.dataset.w === CR.wood));
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === CR.mode));
    el.querySelectorAll('[data-col]').forEach((b) => b.classList.toggle('on', CR.mode === 'paint' && b.dataset.col === CR.color));
    el.querySelector('#kmStat').innerHTML = statHtml(k).replace('class="stt"', 'class="stt"');
    const ph = s.ph, hint = ph.tip > 5 ? '先が太くて擦れる。下をもっと尖らせよう' : s.stab < 60 ? '背が高く倒れやすい。胴を低く、上を細く' : s.mochi < 25 ? 'まだ重すぎる。外側を残して内側を削るとよい' : s.mochi >= 55 && s.stab >= 75 ? 'よい独楽になりそうだ！' : 'なかなかの形';
    el.querySelector('#kmHint').textContent = hint;
    el.querySelector('#kmCost').textContent = `お代 ${money(cost)}（持ち金 ${money(CR.money)}）`;
    el.querySelector('#kmMake').disabled = CR.money < cost;
  }
  function loop() {
    if (!CR) return; CR.raf = requestAnimationFrame(loop);
    const g = CR.g, W = CR.cv.width, H = CR.cv.height, { cx, top, sc } = LG(), k = { wood: CR.wood, ring: CR.ring, prof: CR.prof, col: CR.col }, Wd = K.WOODS[CR.wood];
    CR.spin += 0.35; g.clearRect(0, 0, W, H);
    // 轆轤の軸
    g.fillStyle = '#555'; g.fillRect(cx - 3, 0, 6, top); g.fillRect(cx - 3, top + K.N * K.DZ * sc, 6, H);
    g.fillStyle = '#2a1a0a'; g.fillRect(cx - 40, 2, 80, 10); g.fillRect(cx - 40, H - 12, 80, 10);
    // 木（行ごとに帯。木目は回って流れる）
    for (let i = 0; i < K.N; i++) {
      const r = CR.prof[i] * sc, y = top + i * K.DZ * sc, h = K.DZ * sc + 0.5, c = CR.col[i] || Wd.col;
      const gr = g.createLinearGradient(cx - r, 0, cx + r, 0); gr.addColorStop(0, shade(c, -0.45)); gr.addColorStop(0.42, shade(c, 0.15)); gr.addColorStop(1, shade(c, -0.5)); g.fillStyle = gr; g.fillRect(cx - r, y, r * 2, h);
      if (!CR.col[i]) { g.fillStyle = Wd.grain + '55'; for (let q = 0; q < 3; q++) { const ph = ((CR.spin * 0.6 + q * 2.1 + i * 0.7) % 6.283), xx = Math.cos(ph) * r; if (Math.sin(ph) > 0) g.fillRect(cx + xx - 1, y, 2, h); } }
    }
    if (CR.ring) { const ph = K.phys(cur()); const r = ph.rmax * sc + 2, y = top + ph.rowMax * K.DZ * sc; const gr = g.createLinearGradient(cx - r, 0, cx + r, 0); gr.addColorStop(0, '#2a2e33'); gr.addColorStop(0.45, '#aab0b8'); gr.addColorStop(1, '#2a2e33'); g.fillStyle = gr; g.fillRect(cx - r, y - 1, r * 2, K.DZ * sc + 2); }
    // 削りくず
    CR.chips = CR.chips.filter((c) => (c.t += 1 / 60) < 0.8); for (const c of CR.chips) { c.vy += 400 / 60; c.x += c.vx / 60; c.y += c.vy / 60; g.fillStyle = Wd.col; g.fillRect(c.x, c.y, 3, 2); }
    g.fillStyle = '#cdbf9a'; g.font = '13px serif'; g.textAlign = 'center'; g.fillText(CR.mode === 'paint' ? '筆：なぞった段に色を付ける' : '鉋：押し当てた所まで削れる（左右どちらでも）', cx, H - 22);
  }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g2 = (n >> 8) & 255, b = n & 255, m = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))); return `rgb(${m(r)},${m(g2)},${m(b)})`; }

  // ================= 2.63.0 人と人の勝負：挑む・受ける =================
  const GN = { koma: '独楽回し', kai: '貝絵合わせ', sugoroku: '絵双六' };
  let pickTo = ''; // 挑む相手（選んだまま残す）
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'asTo') pickTo = e.target.value; });
  function vsHtml(P, tab, sel, busy) {
    const gb = P.here.gamble, inv = (gb.inv || []).filter((v) => v.game === tab), ppl = gb.people || [];
    let h = '';
    for (const v of inv) h += v.mine ? `<div class="row"><span>${esc(v.who)}に${money(v.bet)}で挑んでいる（返事待ち）</span><button data-vd="${v.id}">取り下げる</button></div>`
      : `<div class="row" style="color:#ffd76a"><b>${esc(v.who)}から${GN[tab]}の挑戦（${money(v.bet)}${v.koma ? `・独楽「${esc(v.koma)}」` : ''}）</b><button data-va="${v.id}" data-vb="${v.bet}" ${P.me.money < v.bet || busy ? 'disabled' : ''}>受ける</button><button data-vd="${v.id}">断る</button></div>`;
    if (!ppl.some((x) => x.id === pickTo)) pickTo = ppl.length ? ppl[0].id : '';
    if (ppl.length && !inv.some((v) => v.mine)) h += `<div class="row"><span class="rule">人と勝負：</span><select id="asTo" style="font:inherit">${ppl.map((x) => `<option value="${x.id}" ${x.id === pickTo ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button data-vc="1" ${P.me.money < sel || busy ? 'disabled' : ''}>${money(sel)}で挑む</button></div>`;
    else if (!ppl.length && !inv.length) h += '<div class="rule">この町にほかの人がいれば、人とも勝負できます</div>';
    return h;
  }

  // ================= 独楽回し（タブ） =================
  const ST = {}; // 場面ごとの状態
  function komaMount(st) {
    st.innerHTML = `<div class="asb"><div class="ttl">盥の勝負</div><div class="vs"><div id="kmMe" style="text-align:center"></div><div class="tarai"><canvas id="kmCv" width="400" height="400"></canvas></div><div id="kmOya" style="text-align:center"></div></div><div id="kmGauge"></div></div><div class="big"></div><div class="res"></div><div class="panel"></div>`;
    ST.koma = { seen: null, busy: false, gauge: null };
  }
  function komaUpdate(st, P, myId, sel, setPanel) {
    const S = ST.koma, gb = P.here.gamble.koma, me = P.me, ks = me.koma || [], use = ks.find((k) => k.id === me.komaUse) || ks[0], oy = gb.oya[K.tierOf(sel)];
    if (S.seen == null) S.seen = gb.last ? gb.last.id : 0;
    const M = gb.match;
    if (!S.busy && M) { // 2.64.0 独楽対決の前：両方の独楽を見せて、見物人が賭ける
      const mk = `<b>${esc(M.aName)}の「${esc(M.ka.name)}」</b>${sideSvg(M.ka, 70)}${statHtml(M.ka)}`, oh = `<b>${esc(M.bName)}の「${esc(M.kb.name)}」</b>${sideSvg(M.kb, 70)}${statHtml(M.kb)}`;
      if (S.mkH !== mk) { S.mkH = mk; S.drawn = 0; st.querySelector('#kmMe').innerHTML = mk; }
      if (S.oh !== oh) { S.oh = oh; S.drawn = 0; st.querySelector('#kmOya').innerHTML = oh; }
      if (!S.drawn) { S.drawn = 1; drawTarai(st, M.ka, M.kb, null); }
    } else if (!S.busy) {
      const mk = use ? `<b>${esc(use.name)}</b>${sideSvg(use, 70)}${statHtml(use)}` : '<span class="rule">独楽がありません</span>';
      if (S.mkH !== mk) { S.mkH = mk; S.drawn = 0; st.querySelector('#kmMe').innerHTML = mk; }
      const oh = `<b>胴元の「${esc(oy.name)}」</b><br><small>${K.WOODS[oy.wood].name}${oy.ring ? '・鉄輪' : ''}・${['並', '上', '名人'][oy.tier]}の独楽</small>${sideSvg(oy, 70)}${statHtml(oy)}`;
      if (S.oh !== oh) { S.oh = oh; S.drawn = 0; st.querySelector('#kmOya').innerHTML = oh; }
      if (!S.drawn) { S.drawn = 1; drawTarai(st, use, oy, null); }
    }
    let h = '';
    if (M) {
      h += `<div class="row" style="color:#ffd76a"><b>独楽対決 ${esc(M.aName)} 対 ${esc(M.bName)}　あと${Math.ceil(M.left / 1000)}秒で回す</b></div><div class="row"><span class="rule">見物の賭け：${esc(M.aName)}に${money(M.pool[0])}・${esc(M.bName)}に${money(M.pool[1])}（当てた人で全部を分ける）</span></div>`;
      if (M.role < 0) h += `<div class="row">${M.my ? `<span>${esc(M.my.side ? M.bName : M.aName)}に${money(M.my.amt)}賭けている</span>` : ''}<button data-ms="0" ${me.money < sel ? 'disabled' : ''}>${esc(M.aName)}に${money(sel)}</button><button data-ms="1" ${me.money < sel ? 'disabled' : ''}>${esc(M.bName)}に${money(sel)}</button></div>`;
      else h += '<div class="row rule">見物人の賭けを待っています</div>';
    }
    h += ruleHtml(A.GAMES.koma.rule) + '<div class="row">';
    h += `<button data-as="craft" ${ks.length >= K.MAX_OWN ? 'disabled' : ''}>独楽を作る</button>`;
    if (use) h += `<button data-as="spin" ${me.money < sel || S.busy ? 'disabled' : ''}>${money(sel)} 賭けて回す</button>`;
    h += `</div><div class="row kmList">${ks.map((k) => `<div class="kmCard ${use && k.id === use.id ? 'on' : ''}" data-use="${k.id}"><b>${esc(k.name)}</b>${sideSvg(k, 40)}<small>${K.WOODS[k.wood].name}${k.ring ? '・鉄輪' : ''}　${k.win || 0}勝${k.lose || 0}敗</small><br><button data-brk="${k.id}" style="font-size:11px;padding:1px 6px">割る</button></div>`).join('')}</div>`;
    h += vsHtml(P, 'koma', sel, S.busy || !use);
    if (gb.last) h += `<div class="log">前の勝負：${esc(gb.last.head)}<br>${(gb.last.lines || []).map(esc).join('<br>')}</div>`;
    setPanel(h);
    const L = gb.last; if (L && L.id !== S.seen && !S.busy) { S.seen = L.id; S.busy = true; playKoma(st, L, myId).catch(() => {}).then(() => { S.busy = false; S.mkH = S.oh = null; S.drawn = 0; }); }
  }
  function drawTarai(st, a, b, fr) {
    const cv = st.querySelector('#kmCv'); if (!cv) return; const g = cv.getContext('2d'), W = cv.width, c = W / 2, R = W * 0.44; g.clearRect(0, 0, W, W);
    const put = (k, x, y, rot, wob, img) => { if (!k) return; const s = K.phys(k), px = (0.07 + (0.11 * s.rmax) / K.RMAX) * R * 2; g.save(); g.translate(c + x * R, c + y * R); g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(4, 6, px / 2, px / 2.3, 0, 0, 7); g.fill(); g.rotate(rot); g.scale(1 - wob * 0.25, 1); g.drawImage(img || topImg(k, 96), -px / 2, -px / 2, px, px); g.restore(); };
    if (!fr) { put(a, -0.5, 0.15, 0, 0); put(b, 0.5, -0.1, 0, 0); return; }
    put(a, fr.ax, fr.ay, fr.ar, fr.aw, fr.ai); put(b, fr.bx, fr.by, fr.br, fr.bw, fr.bi);
    if (fr.hit) { g.fillStyle = 'rgba(255,240,180,.85)'; g.beginPath(); g.arc(c + ((fr.ax + fr.bx) / 2) * R, c + ((fr.ay + fr.by) / 2) * R, 14, 0, 7); g.fill(); }
  }
  async function playKoma(st, L, myId) {
    const top = st.querySelector('.big'), res = st.querySelector('.res'); top.classList.remove('show'); res.classList.remove('show');
    const a = L.me, b = L.oya, sim = K.battle({ k: a, pow: a.pow }, { k: b, pow: b.pow }, L.seed), F = sim.frames, ai = topImg(a, 96), bi = topImg(b, 96);
    st.querySelector('#kmMe').innerHTML = `<b>${esc(L.by)}の「${esc(a.name)}」</b>${sideSvg(a, 70)}`; st.querySelector('#kmOya').innerHTML = `<b>${L.pvp ? esc(L.bName) + 'の' : '胴元の'}「${esc(b.name)}」</b>${sideSvg(b, 70)}`;
    sfx('kmSpin'); let ar = 0, br = 0;
    for (let i = 0; i < F.length; i++) {
      const f = F[i]; ar += f[2] * 1.4; br += f[6] * 1.4; if (f[8]) sfx('kmHit');
      drawTarai(st, a, b, { ax: f[0], ay: f[1], ar, aw: f[3] * Math.abs(Math.sin(i * 0.9)), ai, bx: f[4], by: f[5], br, bw: f[7] * Math.abs(Math.sin(i * 0.9 + 1)), bi, hit: f[8] });
      if (!document.getElementById('kmCv')) return; await wait(200);
    }
    const HOW = { out: '場外！', down: '倒れた！', both: '相打ち', time: '判定' };
    top.textContent = L.r > 0 ? `${a.name}の勝ち` : L.r < 0 ? `${b.name}の勝ち` : '引き分け'; top.classList.add('show');
    const gn = L.pid === myId ? L.gain : L.pidB === myId ? L.gainB : L.side && L.side[myId] != null ? L.side[myId] : null;
    if (gn != null) { res.innerHTML = gn > 0 ? `<span style="color:#ffd76a">勝ち　＋${money(gn)}</span>` : gn < 0 ? `<span style="color:#ff8a7a">負け　－${money(-gn)}</span>` : '引き分け（返却）'; res.classList.add('show'); sfx(gn > 0 ? 'gbWin' : gn < 0 ? 'gbLose' : 'click'); }
    else { res.textContent = HOW[L.how] || ''; res.classList.add('show'); }
    await wait(2600); top.classList.remove('show'); res.classList.remove('show');
  }
  // 力の目盛り：左右に動く針を止める（0.85〜0.92 がいちばん強い。行き過ぎると力みすぎ）
  // 2.106.5 目盛りは賭け方の欄の上に重ねて出す（欄に隠れて止められなかった）。どこを押しても・空白キーでも止まる
  function gauge(st, sel, send) {
    const S = ST.koma; if (S.gauge) return; const box = st.querySelector('#kmGauge');
    const ov = document.createElement('div'); ov.className = 'kmGov';
    ov.innerHTML = '<div class="rule" style="text-align:center;font-size:16px">針が金色の所で止める（どこでもクリック／タップ・空白キー）</div><div class="gauge"><b></b></div>';
    (document.getElementById('gbHall') || document.body).appendChild(ov);
    const gEl = ov.querySelector('.gauge'), n = gEl.querySelector('b'), t0 = performance.now(); let raf = 0, v = 0;
    const step = () => { if (!ov.isConnected) return; const t = (performance.now() - t0) / 1000; v = (1 - Math.cos(t * 3.4)) / 2; n.style.left = `calc(${(v * 100).toFixed(1)}% - 2px)`; raf = requestAnimationFrame(step); }; step();
    const key = (e) => { if (!ov.isConnected) { document.removeEventListener('keydown', key, true); S.gauge = null; return; } if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); S.gauge && S.gauge(); } };
    document.addEventListener('keydown', key, true);
    S.gauge = () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', key, true); ov.remove(); const pow = v <= 0.88 ? v / 0.88 : v <= 0.93 ? 1 : 0.6; if (box) box.innerHTML = `<div class="rule" style="text-align:center">${v > 0.93 ? '力みすぎた！' : pow > 0.95 ? '会心の投げ！' : pow > 0.75 ? 'よい投げ' : '弱い投げ…'}</div>`; S.gauge = null; const pw = Math.round(pow * 100) / 100; if (send) send(pw); else cmd({ type: 'kmPlay', qty: sel, pow: pw }); setTimeout(() => { if (box && box.isConnected) box.innerHTML = ''; }, 2500); };
    ov.onclick = (e) => { e.stopPropagation(); S.gauge && S.gauge(); };
  }

  // ================= 貝絵合わせ =================
  const KAICOL = ['#2e5a34', '#c8285a', '#e87a9a', '#c89a1e', '#c8401e', '#3a7a3a', '#2a2a5a', '#b8901e', '#1e4a8c', '#4a5a7a', '#8a1e1e', '#7b3fa0'];
  function kaiMount(st) { st.innerHTML = `<div class="asb"><div class="ttl" id="kaiTtl">貝絵合わせ</div><div class="kaiB" id="kaiB"></div></div><div class="big"></div><div class="res"></div><div class="panel"></div>`; ST.kai = { seen: null, busy: false, board: 0 }; }
  function kaiBoard(st, n) { const b = st.querySelector('#kaiB'); b.innerHTML = Array.from({ length: n }, (_, i) => `<div class="shell" data-kai="${i}"><div class="in"><div class="bk"></div><div class="fc"></div></div></div>`).join(''); }
  const shellEl = (st, i) => st.querySelector(`[data-kai="${i}"]`);
  function shellShow(st, i, f, cls) { const e = shellEl(st, i); if (!e) return; const fc = e.querySelector('.fc'); if (f != null) { fc.textContent = A.KAI[f]; fc.style.color = KAICOL[f]; } e.className = 'shell' + (f != null ? ' open' : '') + (cls ? ' ' + cls : ''); }
  function kaiSync(st, g) { g.own.forEach((o, i) => { if (o >= 0) shellShow(st, i, g.face[i], 'gone ' + (o === g.me ? 'mine' : 'oya')); else if (i === g.pick) shellShow(st, i, g.pf, ''); else shellShow(st, i, null, ''); }); }
  function kaiUpdate(st, P, myId, sel, setPanel) {
    const S = ST.kai, T = P.here.gamble.kai, g = T.g, me = P.me;
    if (!g) { if (S.board) { st.querySelector('#kaiB').innerHTML = ''; S.board = 0; } S.seen = null; }
    else if (!S.busy && (!S.board || S.seen == null || g.seq < S.seen)) { kaiBoard(st, g.own.length); S.board = 1; S.seen = g.seq; kaiSync(st, g); } // 開いた時・新しい勝負
    if (g && !S.busy) {
      const nev = g.ev.filter((e) => e.s > S.seen);
      if (nev.length) { S.busy = true; S.seen = g.seq; playKai(st, nev, g).catch(() => {}).then(() => { S.busy = false; }); }
      else kaiSync(st, g);
    }
    st.querySelector('#kaiTtl').textContent = g ? `あなた ${g.sc[g.me]} ― ${g.nm[1 - g.me]} ${g.sc[1 - g.me]}${S.busy || g.done ? '' : g.turn === g.me ? '　（あなたの番）' : `　（${g.nm[1 - g.me]}の番）`}` : '貝絵合わせ';
    let h = ruleHtml(A.GAMES.kai.rule) + '<div class="row">';
    if (!g || g.done) h += `<button data-as="kaiStart" ${me.money < sel ? 'disabled' : ''}>${money(sel)} 賭けて始める</button>${g ? '<button data-as="kaiQuit">片づける</button>' : ''}`;
    else h += `<span>${money(g.bet)} 賭けている${g.pvp ? `（対 ${esc(g.nm[1 - g.me])}）` : ''}</span><button data-as="kaiQuit">降りる（負け）</button>${g.stale ? '<button data-as="kaiClaim">相手が戻らないので勝ちにする</button>' : ''}`;
    h += `<span class="rule">${T.players.length ? '勝負中：' + T.players.map(esc).join('、') : ''}</span></div>`;
    if (!g || g.done) h += vsHtml(P, 'kai', sel, false);
    if (T.last) h += `<div class="log">前の勝負：${esc(T.last.head)}<br>${(T.last.lines || []).map(esc).join('<br>')}</div>`;
    setPanel(h);
    if (g && g.done && !S.busy && S.doneShown !== g.bet + ':' + g.seq) { S.doneShown = g.bet + ':' + g.seq; const top = st.querySelector('.big'), res = st.querySelector('.res'); top.textContent = g.done.r > 0 ? '勝ち！' : g.done.r < 0 ? '負け' : '引き分け'; top.classList.add('show'); res.innerHTML = g.done.gain > 0 ? `<span style="color:#ffd76a">＋${money(g.done.gain)}</span>` : g.done.gain < 0 ? `<span style="color:#ff8a7a">－${money(-g.done.gain)}</span>` : '賭け金が戻った'; res.classList.add('show'); sfx(g.done.r > 0 ? 'gbWin' : g.done.r < 0 ? 'gbLose' : 'click'); setTimeout(() => { top.classList.remove('show'); res.classList.remove('show'); }, 2600); }
  }
  async function playKai(st, evs, g) {
    for (const e of evs) {
      if (!st.isConnected) return;
      const ttl = st.querySelector('#kaiTtl'), opp = e.who !== g.me; if (opp) { ttl.textContent = `${g.nm[e.who]}の番…`; await wait(450); }
      shellShow(st, e.a, e.fa, ''); sfx('kaiFlip');
      if (e.b == null) continue;
      await wait(opp ? 550 : 250); shellShow(st, e.b, e.fb, ''); sfx('kaiFlip'); await wait(850);
      if (e.hit) { const c = opp ? 'gone oya' : 'gone mine'; shellShow(st, e.a, e.fa, c); shellShow(st, e.b, e.fb, c); sfx(opp ? 'click' : 'coin'); await wait(300); }
      else { shellShow(st, e.a, null, ''); shellShow(st, e.b, null, ''); await wait(250); }
    }
    kaiSync(st, g);
  }

  // ================= 絵双六 =================
  const sgShort = (q, i, N) => (i === 0 ? '振り出し' : i === N - 1 ? '上がり' : q[2] === 'mv' ? (q[3] > 0 ? `${q[3]}進む` : `${-q[3]}戻る`) : q[2] === 'rest' ? '一回休み' : q[2] === 'again' ? 'もう一度' : ''); // スマホでは短い言葉
  function sgMount(st) {
    const N = A.SG.length, order = []; for (let r = 0; r < Math.ceil(N / 6); r++) { const row = []; for (let c = 0; c < 6; c++) { const i = r * 6 + c; if (i < N) row.push(i); } order.push(...(r % 2 ? row.reverse() : row)); }
    st.innerHTML = `<div class="asb"><div class="ttl" id="sgTtl">上洛双六</div><div id="sgDice" style="display:flex;gap:10px;justify-content:center;margin:2px 0"></div><div class="sgB">${order.map((i) => { const q = A.SG[i]; return `<div class="sq ${i === 0 ? 'start' : i === N - 1 ? 'sgoal' : q[2] ? 'ev' : ''}" data-sq="${i}"><b>${i ? i + ' ' : ''}${q[0]}</b>${q[1] ? `<small>${q[1]}</small><i class="sh">${sgShort(q, i, N)}</i>` : ''}</div>`; }).join('')}</div></div><div class="big"></div><div class="res"></div><div class="panel"></div>`;
    st.querySelector('#sgDice').innerHTML = SGK.GAMBLEUI.die(1, 'sgD');
    ST.sugoroku = { seen: null, busy: false, pos: [0, 0] };
  }
  function sgPut(st, who, i) { let t = st.querySelector('.tok.t' + who); if (!t) { t = document.createElement('div'); t.className = 'tok t' + who; } const sq = st.querySelector(`[data-sq="${i}"]`); if (sq && t.parentNode !== sq) sq.appendChild(t); ST.sugoroku.pos[who] = i; }
  function sgUpdate(st, P, myId, sel, setPanel) {
    const S = ST.sugoroku, T = P.here.gamble.sugoroku, g = T.g, me = P.me;
    if (g && S.seen == null) { S.seen = g.seq; sgPut(st, 0, g.pos[0]); sgPut(st, 1, g.pos[1]); }
    if (!g) { S.seen = null; st.querySelectorAll('.tok').forEach((t) => t.remove()); }
    if (g && !S.busy) {
      if (g.seq < S.seen) { S.seen = g.seq; sgPut(st, 0, g.pos[0]); sgPut(st, 1, g.pos[1]); }
      const nev = g.ev.filter((e) => e.s > S.seen);
      if (nev.length) { S.busy = true; S.seen = g.seq; playSg(st, nev, g).catch(() => {}).then(() => { S.busy = false; }); }
      else { sgPut(st, 0, g.pos[0]); sgPut(st, 1, g.pos[1]); }
    }
    const nm = (i) => (g ? (i === g.me ? 'あなた' : esc(g.nm[i])) : i ? '胴元' : 'あなた');
    let h = ruleHtml(A.GAMES.sugoroku.rule, `<div class="rule"><span style="color:#ff8a7a">●</span>${nm(0)}　<span style="color:#888">●</span>${nm(1)}</div>`) + '<div class="row">';
    if (!g || g.done) h += `<button data-as="sgStart" ${me.money < sel ? 'disabled' : ''}>${money(sel)} 賭けて始める</button>${g ? '<button data-as="sgQuit">片づける</button>' : ''}`;
    else h += `<button data-as="sgRoll" ${S.busy || g.turn !== g.me ? 'disabled' : ''}>${g.turn === g.me ? '賽を振る' : `${esc(g.nm[g.turn])}の番`}</button><span>${money(g.bet)} 賭けている${g.pvp ? `（対 ${esc(g.nm[1 - g.me])}）` : ''}${g.rest[g.me] ? '（次は一回休み）' : ''}</span><button data-as="sgQuit">降りる（負け）</button>${g.stale ? '<button data-as="sgClaim">相手が戻らないので勝ちにする</button>' : ''}`;
    h += `<span class="rule">${T.players.length ? '勝負中：' + T.players.map(esc).join('、') : ''}</span></div>`;
    if (!g || g.done) h += vsHtml(P, 'sugoroku', sel, false);
    if (T.last) h += `<div class="log">前の勝負：${esc(T.last.head)}<br>${(T.last.lines || []).map(esc).join('<br>')}</div>`;
    setPanel(h);
    if (g && g.done && !S.busy && S.doneShown !== g.seq) { S.doneShown = g.seq; const top = st.querySelector('.big'), res = st.querySelector('.res'); top.textContent = g.done.r > 0 ? '上がり！' : `${g.nm[1 - g.me]}の上がり`; top.classList.add('show'); res.innerHTML = g.done.gain > 0 ? `<span style="color:#ffd76a">勝ち　＋${money(g.done.gain)}</span>` : `<span style="color:#ff8a7a">負け　－${money(-g.done.gain)}</span>`; res.classList.add('show'); sfx(g.done.r > 0 ? 'gbWin' : 'gbLose'); setTimeout(() => { top.classList.remove('show'); res.classList.remove('show'); }, 2600); }
  }
  async function playSg(st, evs, g) {
    const ttl = st.querySelector('#sgTtl'), GOAL = A.SG.length - 1;
    for (const e of evs) {
      if (!st.isConnected) return; const who = e.who === g.me ? 'あなた' : g.nm[e.who];
      if (e.rest) { ttl.textContent = `${who}は一回休み`; await wait(900); continue; }
      ttl.textContent = `${who}が振る…`; sfx('diceShake'); await wait(300);
      const d = st.querySelector('#sgD'); if (d) { SGK.GAMBLEUI.roll(d, e.d, 800); sfx('diceRoll'); } await wait(900);
      ttl.textContent = `${who}：${e.d}`;
      // 行き過ぎたら折り返す道のり
      const steps = []; let q = e.from, dir = 1; for (let k = 0; k < e.d; k++) { if (q === GOAL) dir = -1; q += dir; steps.push(q); }
      for (const s of steps) { sgPut(st, e.who, s); sfx('click'); await wait(230); }
      const sq = A.SG[e.to];
      if (e.to2 != null) { ttl.textContent = `${who}：${sq[0]}　${sq[1]}`; await wait(900); sgPut(st, e.who, e.to2); await wait(400); }
      else if (sq[2] === 'rest' || sq[2] === 'again') { ttl.textContent = `${who}：${sq[0]}　${sq[1]}`; await wait(900); }
    }
    sgPut(st, 0, g.pos[0]); sgPut(st, 1, g.pos[1]); ttl.textContent = '上洛双六';
  }

  // ================= 入口 =================
  UI.mount = (st, tab) => { if (!document.getElementById('asbCss')) document.head.insertAdjacentHTML('beforeend', CSS); ({ koma: komaMount, kai: kaiMount, sugoroku: sgMount })[tab](st); };
  UI.update = (st, tab, P, myId, sel, setPanel) => { const gb = P.here.gamble; if (!gb || !gb[tab]) return; ({ koma: komaUpdate, kai: kaiUpdate, sugoroku: sgUpdate })[tab](st, P, myId, sel, setPanel); };
  UI.click = (e, P, sel, st) => { // 賭場の画面のクリックのうち、ここの分
    const b = e.target.closest('[data-as],[data-use],[data-brk],[data-kai],[data-va],[data-vd],[data-vc],[data-ms]'); if (!b) return false; const d = b.dataset, tab = SGK.GAMBLEUI.tab();
    if (d.ms != null) { cmd({ type: 'kmSide', side: +d.ms, qty: sel }); sfx('coin'); return true; }
    if (d.vd) { cmd({ type: 'asDecline', id: d.vd }); sfx('click'); return true; }
    if (d.va) { if (tab === 'koma') gauge(st, +d.vb, (pow) => cmd({ type: 'asAccept', id: d.va, pow })); else { cmd({ type: 'asAccept', id: d.va }); sfx('coin'); } return true; }
    if (d.vc) { const to = (st.querySelector('#asTo') || {}).value || pickTo; if (!to) return true; pickTo = to; if (tab === 'koma') gauge(st, sel, (pow) => cmd({ type: 'asChallenge', game: 'koma', to, qty: sel, pow })); else { cmd({ type: 'asChallenge', game: tab, to, qty: sel }); sfx('coin'); } return true; }
    if (d.brk) { if (confirm('この独楽を割りますか？（元に戻せません）')) cmd({ type: 'kmBreak', id: d.brk }); return true; }
    if (d.use) { cmd({ type: 'kmUse', id: d.use }); sfx('click'); return true; }
    if (d.kai != null) { const S = ST.kai, g = P.here.gamble.kai.g; if (!g || g.done || S.busy || g.turn !== g.me || g.own[+d.kai] >= 0 || +d.kai === g.pick) return true; sfx('kaiFlip'); cmd({ type: 'kaiFlip', i: +d.kai }); return true; }
    const a = d.as;
    if (a === 'craft') openCraft(P);
    else if (a === 'spin') gauge(st, sel);
    else if (a === 'kaiStart') { cmd({ type: 'kaiStart', qty: sel }); sfx('coin'); }
    else if (a === 'kaiQuit') cmd({ type: 'kaiQuit' });
    else if (a === 'sgStart') { cmd({ type: 'sgStart', qty: sel }); sfx('coin'); ST.sugoroku.seen = null; }
    else if (a === 'sgRoll') cmd({ type: 'sgRoll' });
    else if (a === 'sgQuit') cmd({ type: 'sgQuit' });
    else if (a === 'kaiClaim' || a === 'sgClaim') cmd({ type: a });
    return true;
  };
})();
