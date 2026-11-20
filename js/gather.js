// 2.11.0 釣り・虫取りの画面：地図の下のボタン、タイミングを合わせる遊び、生き物図鑑（2.34.0 虫取りは木・飛ぶ・草むらの3つの遊び）
// 命令は SGK.cmd（main.js が渡す）。状態は G.priv.me（spot・gat・gatLast・zukan）。生き物のデータは SGK.DATA.creatures
(function () {
  const $ = (id) => document.getElementById(id), G = window.SGK_G, D = SGK.DATA;
  const css = document.createElement('style');
  css.textContent = `
  #gatherBox{position:fixed;left:10px;bottom:62px;z-index:6;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
  #gatherBox .row button{padding:8px 12px;font-size:14px}
  #gatherBox small{background:rgba(20,16,10,.7);color:#ddd;border-radius:4px;padding:1px 6px;font-size:11px}
  #gatherOv{position:fixed;inset:0;z-index:90;background:rgba(10,14,20,.82);display:flex;align-items:center;justify-content:center}
  #gatherOv .gc{width:min(94vw,460px);background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:16px;text-align:center;color:#f3e9d0}
  #gatherOv .big{font-size:42px;margin:6px 0}
  #gatherOv .bar{position:relative;height:34px;background:#3b3a36;border-radius:6px;margin:14px 0;overflow:hidden}
  #gatherOv .zone{position:absolute;top:0;bottom:0;background:rgba(111,191,115,.75)}
  #gatherOv .mk{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#fff;border-radius:3px}
  #gatherOv button.main{width:100%;padding:16px;font-size:20px;margin-top:6px}
  #creatPanel{position:fixed;inset:0;z-index:80;background:rgba(10,14,20,.86);display:flex;align-items:center;justify-content:center}
  #creatPanel .cc{width:min(96vw,520px);max-height:90vh;background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0;display:flex;flex-direction:column}
  #creatPanel .cl{overflow-y:auto;margin-top:8px}
  #creatPanel .it{border-bottom:1px solid rgba(255,255,255,.1);padding:6px 2px;font-size:13px}
  #creatPanel .it.no{opacity:.5}
  #creatPanel .it{display:flex;gap:10px;align-items:center}
  #creatPanel .it .ci{flex:0 0 64px;height:64px;display:flex;align-items:center;justify-content:center}
  #creatPanel .it .ci img{max-width:64px;max-height:64px}
  #creatPanel .it.no .ci img{filter:brightness(0) invert(1);opacity:.3}
  #gatherOv .cimg{max-width:200px;max-height:150px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}`;
  // 2.19.0 魚・虫の絵（assets/creatures/〇〇.webp、浮世絵ふう。tools/gen_creature_art.py → creature_cut.py）。読めない時は見えなくするだけ
  const cImg = (c, cls = '') => `<img class="${cls}" src="assets/creatures/${c.id}.webp?v=${SGK.VERSION}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  document.head.appendChild(css);

  const box = document.createElement('div'); box.id = 'gatherBox'; box.className = 'hidden';
  box.innerHTML = '<small id="gbTag"></small><div class="row" style="gap:6px"><button id="gbFish" class="hidden">釣りをする</button><button id="gbBug" class="hidden">虫を捕る</button></div>';
  document.body.appendChild(box);
  const DF = () => D.gatherDiff; SGK.GATHERUI = { isOpen: () => !!ov };
  const unitOf = (c) => (c.k === 'f' ? 'cm' : 'mm');
  let ov = null, run = null, doneN = 0, shownN = 0, was = false;

  // ---- 地図の下のボタン（立ち止まっていて、ここに生き物がいるとき） ----
  setInterval(() => {
    const P = G.priv, me = P && P.me, inGame = P && !P.battle && G.mode !== 'title' && me;
    { const live = !!(P && me && G.mode !== 'title'); if (live && !was) { shownN = me.gatLast ? me.gatLast.n : 0; if (me.gat) doneN = me.gat.n; } was = live; } // 2.40.3 世界に入った時点で残っている前回の結果・途中の釣りは、出さない
    const sp = inGame && !ov && me.spot, anyOpen = ['town', 'char', 'info', 'gameMenu'].some((i) => $(i) && !$(i).classList.contains('hidden'));
    box.classList.toggle('hidden', !sp || anyOpen);
    if (sp) {
      $('gbFish').classList.toggle('hidden', !sp.f); $('gbBug').classList.toggle('hidden', !sp.b);
      $('gbTag').textContent = `${sp.rg}・${sp.dp}　${sp.tags.length ? sp.tags.join('・') : ''}`;
      if (!sp.f && !sp.b) $('gbTag').textContent += '　（いま、ここに生き物はいません）';
    }
    // 命令の答え：掛かった（gat）→ 遊びを始める／結果（gatLast）→ 結果を見せる
    if (me && me.gat && !run && !ov && me.gat.n !== doneN) startPlay(me.gat);
    if (me && me.gatLast && me.gatLast.n > shownN && !(run && run.phase !== 'wait')) showResult(me.gatLast);
  }, 120);
  $('gbFish').onclick = () => SGK.cmd({ type: 'gatherStart', kind: 'fish' });
  $('gbBug').onclick = () => SGK.cmd({ type: 'gatherStart', kind: 'bug' });

  // ---- 遊び ----
  function open(html) { if (!ov) { ov = document.createElement('div'); ov.id = 'gatherOv'; document.body.appendChild(ov); } ov.innerHTML = `<div class="gc">${html}</div>`; }
  function close() { if (ov) ov.remove(); ov = null; run = null; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKeyUp, true); }
  let raf = 0;
  function onKeyUp(e) { delete keys[e.key]; e.stopPropagation(); }
  function onKey(e) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key) && run) { keys[e.key] = 1; e.preventDefault(); e.stopPropagation(); return; } if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (run && run.tap) run.tap(); } if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }
  function cancel() { if (run && run.party) { const cb = run.party; close(); return cb(-1); } if (run) { SGK.cmd({ type: 'gatherEnd', n: run.g.n, q: -1 }); doneN = shownN = run.g.n; } close(); }
  // 2.27.0 釣りは「釣り場」の場面から：水面を泳ぐ魚影の近くへ浮きを投げる（どうぶつの森ふう）。近づけば食いつき、アタリ→棒のタイミング遊び。
  // 大物・珍しい魚は、棒のタイミングを何回か続けて成功させる必要がある（珍しさ：ありふれた1・見かける1・珍しい2・稀少3・幻4回、大物でさらに+1）
  const RN = { ありふれた: 1, 見かける: 1, 珍しい: 2, 稀少: 3, '幻のような': 4 }, RI = { ありふれた: 0, 見かける: 1, 珍しい: 2, 稀少: 3, '幻のような': 4 };
  let keys = {}, padPrev = {};
  function startPlay(g) {
    const fish = g.k === 'f', df = DF()[g.d] || DF().普通;
    run = { g, phase: 'wait', tap: null, rd: 0, qs: [], rounds: fish ? Math.min(5, (RN[g.r] || 1) + (g.fr >= 0.85 ? 1 : 0)) : 1 }; shownN = g.n - 1; keys = {}; window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true);
    if (fish) return castScene();
    return bugScene(); // 2.34.0 虫は捕り方が3つ（木・飛ぶ・草むら）
  }
  // ---- 2.34.0 虫取りの場面（捕り方は虫で3つ） ----
  // 木：虫のいそうな木をタップして揺すり、落ちてきた虫が地面を走って逃げる前にタップ
  // 飛ぶ：速くなったり遅くなったりして飛ぶ虫をタップ（網は3回まで）
  // 草むら：3つの草むらの間を素早く行き来する影が、最後にどこで止まったかを当てる
  function bugScene() {
    const g = run.g, ri = RI[g.r] || 0, hd = ({ 簡単: 0, 普通: 1, 難しい: 2 })[g.d] ?? 1, lk = g.lk || ['fly', 'butterfly', '#e8e0c8'], mode = lk[0], shape = lk[1], col = lk[2];
    const night = !!(G.priv && G.priv.me && G.priv.me.spot && G.priv.me.spot.dp === '夜'), W = 400, H = 300, GY = 262;
    const tip = { tree: '虫のいそうな木をタップして揺すろう。落ちてきたら素早くタップ！', fly: '飛んでいる虫をタップして網で捕まえよう（網は3回まで）', grass: '草むらに潜む影の動きをよく見ていよう' }[mode];
    open(`<canvas id="gcv" width="${W}" height="${H}" style="width:100%;border-radius:8px;touch-action:none;display:block"></canvas><div id="gcm" style="margin:8px 0;min-height:22px">${tip}</div><button id="gcancel">やめる</button>`);
    $('gcancel').onclick = cancel;
    const cv = $('gcv'), c = cv.getContext('2d'), say = (t) => { const m = $('gcm'); if (m) m.textContent = t; };
    const toLocal = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    const rnd = (a, b) => a + Math.random() * (b - a);
    let last = performance.now(), end = null, T = 0, prevPad = {};
    const aim = { x: W / 2, y: H / 2, show: false }, nets = [], parts = [];
    const done = (ok, m) => { if (end) return; end = { t: ok ? 0.9 : 1.3, q: ok ? 1 : 0 }; say(m); };
    const swing = (x, y) => nets.push({ x, y, t: 0 });

    // ---- 木 ----
    const trees = [70, 200, 330].map((x, i) => ({ x, y: 92, shake: 0, tried: false, i })), hid = Math.floor(Math.random() * 3);
    let bug = null, rustle = 1.2;
    const RT = Math.max(13, 24 - hd * 4);
    const treeAt = (x, y) => trees.find((t) => Math.abs(x - t.x) < 56 && y > 26 && y < GY);
    function shake(t) {
      if (!t || t.tried || bug || end) return;
      t.tried = true; t.shake = 0.55;
      for (let k = 0; k < 9; k++) parts.push({ x: t.x + rnd(-45, 45), y: t.y + rnd(-25, 25), vx: rnd(-20, 20), vy: rnd(15, 45), life: 1.8, leaf: 1, r: rnd(0, 6) });
      if (t.i === hid) setTimeout(() => { if (!run || end) return; bug = { x: t.x + rnd(-30, 30), y: t.y + 12, vx: rnd(-25, 25), vy: -40, rot: 0, st: 'fall', t: 0 }; say('落ちてきた！'); }, rnd(200, 450));
      else say('この木にはいないようだ…');
    }
    // ---- 飛ぶ ----
    const fb = { x: rnd(80, W - 80), y: rnd(50, 170), vx: 0, vy: 0, tx: 0, ty: 0, ph: rnd(0, 6), fast: false, mt: rnd(0.8, 1.6), vis: true, face: 1 };
    const RF = Math.max(11, 23 - hd * 4 - (shape === 'bee' || shape === 'firefly' ? 2 : 0));
    let tries = 3;
    const newTarget = () => { fb.tx = rnd(30, W - 30); fb.ty = rnd(28, GY - 50); };
    newTarget();
    // ---- 草むら ----
    const clumps = [80, 200, 320].map((x) => ({ x, y: 212, rus: 0 }));
    const seq = []; { let cur = Math.floor(Math.random() * 3); seq.push(cur); for (let k = 0; k < 4 + hd * 2 + Math.min(2, ri); k++) { let nx; do nx = Math.floor(Math.random() * 3); while (nx === cur); seq.push(nx); cur = nx; } }
    const FLW = Array.from({ length: 9 }, (_, k) => [20 + k * 44 + rnd(-10, 10), rnd(14, 34), ['#f0e070', '#f4f0f0', '#d890c8', '#90b0f0'][k % 4]]);
    const sh = { st: 'intro', t: 0, i: 0, x: clumps[seq[0]].x, y: GY - 12, a: 0, dur: Math.max(0.2, 0.42 - hd * 0.08 - ri * 0.02), wait: 0 };

    function tapAt(x, y) {
      if (end) return;
      if (mode === 'tree') {
        if (bug && bug.st !== 'gone') { swing(x, y); if (Math.hypot(x - bug.x, y - bug.y) < RT) { bug.st = 'got'; done(true, '捕まえた！'); } else say('おっと、外した！'); return; }
        shake(treeAt(x, y)); return;
      }
      if (mode === 'fly') {
        swing(x, y);
        if (fb.vis && Math.hypot(x - fb.x, y - fb.y) < RF) { done(true, '捕まえた！'); return; }
        tries--; fb.fast = true; fb.mt = rnd(0.4, 0.7); newTarget();
        if (tries <= 0) done(false, '逃げられてしまった…'); else say(`外した！ 網はあと${tries}回`);
        return;
      }
      if (mode === 'grass' && sh.st === 'guess') {
        const k = clumps.findIndex((q) => Math.abs(x - q.x) < 60 && y > 140);
        if (k < 0) return;
        clumps[k].rus = 0.5; const ans = seq[seq.length - 1];
        if (k === ans) { sh.st = 'got'; done(true, 'いた！ 捕まえた！'); }
        else { sh.st = 'flee'; sh.x = clumps[ans].x; sh.t = 0; done(false, `はずれ…（${['左', '真ん中', '右'][ans]}の草むらにいた）`); }
      }
    }
    run.tap = () => { aim.show = true; tapAt(aim.x, aim.y); };
    cv.onpointermove = (e) => { if (e.pointerType === 'touch') return; [aim.x, aim.y] = toLocal(e); aim.show = false; };
    cv.onpointerdown = (e) => { e.preventDefault(); const [x, y] = toLocal(e); aim.x = x; aim.y = y; aim.show = false; tapAt(x, y); };

    function update(dt) {
      T += dt;
      for (const t of trees) t.shake = Math.max(0, t.shake - dt);
      for (const p of parts) { p.x += p.vx * dt + Math.sin(T * 3 + p.r) * 12 * dt; p.y += p.vy * dt; p.life -= dt; } while (parts.length && parts[0].life <= 0) parts.shift();
      for (const n of nets) n.t += dt; while (nets.length && nets[0].t > 0.4) nets.shift();
      if (mode === 'tree') {
        rustle -= dt; if (rustle <= 0 && !trees[hid].tried) { rustle = rnd(1.2, 2.4) + hd * 0.6; trees[hid].shake = 0.12; parts.push({ x: trees[hid].x + rnd(-35, 35), y: trees[hid].y + rnd(-10, 20), vx: rnd(-10, 10), vy: 20, life: 1.5, leaf: 1, r: 0 }); } // 虫のいる木はときどき葉が揺れる
        if (bug && bug.st === 'fall') { bug.vy += (330 + hd * 150) * dt; bug.x += bug.vx * dt; bug.y += bug.vy * dt; bug.rot += 7 * dt; if (bug.y >= GY - 6) { bug.y = GY - 6; bug.st = 'run'; bug.t = 0; bug.rot = 0; bug.vx = (Math.random() < 0.5 ? -1 : 1) * (110 + hd * 55 + ri * 12); say('地面に落ちた！ 逃げるぞ！'); } }
        else if (bug && bug.st === 'run') { bug.t += dt; bug.x += bug.vx * dt; if (bug.t > 1.0 - hd * 0.12 || bug.x < -20 || bug.x > W + 20) { bug.st = 'gone'; done(false, '草むらに逃げられてしまった…'); } }
        if (!bug && T > 22) done(false, '虫は見つからなかった…');
      }
      if (mode === 'fly') {
        fb.ph += dt; fb.mt -= dt;
        if (fb.mt <= 0) { fb.fast = !fb.fast && Math.random() < 0.55 + hd * 0.1; fb.mt = fb.fast ? rnd(0.25, 0.6) : rnd(0.7, 2.0) - hd * 0.2; if (fb.fast) newTarget(); }
        const hover = shape === 'dragonfly' && !fb.fast && Math.sin(fb.ph * 0.9) > 0.55;
        const sp = hover ? 0 : fb.fast ? 230 + hd * 90 + ri * 20 : 40 + hd * 18;
        const dx = fb.tx - fb.x, dy = fb.ty - fb.y, d = Math.hypot(dx, dy); if (d < 12) newTarget();
        const k = Math.min(1, dt * (fb.fast ? 9 : 3)); fb.vx += ((dx / (d || 1)) * sp - fb.vx) * k; fb.vy += ((dy / (d || 1)) * sp - fb.vy) * k;
        let wob = 0; if (shape === 'butterfly') wob = Math.sin(fb.ph * 9) * 40; if (shape === 'bee') wob = Math.sin(fb.ph * 17) * 55;
        fb.x = Math.max(12, Math.min(W - 12, fb.x + fb.vx * dt)); fb.y = Math.max(14, Math.min(GY - 20, fb.y + (fb.vy + wob) * dt));
        if (Math.abs(fb.vx) > 5) fb.face = Math.sign(fb.vx);
        fb.vis = shape !== 'firefly' || !night || Math.sin(fb.ph * 2.3) > -0.35 + hd * 0.15; // 蛍は光っていない間は見えない
        if (T > 15) done(false, '飛んでいってしまった…');
      }
      if (mode === 'grass') {
        for (const q of clumps) q.rus = Math.max(0, q.rus - dt);
        sh.t += dt;
        if (sh.st === 'intro') { sh.a = Math.min(1, sh.t * 2); clumps[seq[0]].rus = 0.2; if (sh.t > 1.1) { sh.st = 'move'; sh.t = 0; sh.i = 1; } }
        else if (sh.st === 'move') {
          const a = clumps[seq[sh.i - 1]], b = clumps[seq[sh.i]], u = Math.min(1, sh.t / sh.dur);
          sh.x = a.x + (b.x - a.x) * u; sh.y = GY - 12 - Math.sin(u * Math.PI) * 4; sh.a = 0.85;
          if (u >= 1) { b.rus = 0.35; sh.st = 'hide'; sh.t = 0; sh.wait = Math.random() < 0.3 ? rnd(0.3, 0.7) : rnd(0.05, 0.2); }
        } else if (sh.st === 'hide') { sh.a = 0; if (sh.t > sh.wait) { if (sh.i >= seq.length - 1) { sh.st = 'guess'; say('どの草むらに隠れた？ タップして当てよう'); } else { sh.i++; sh.st = 'move'; sh.t = 0; } } }
        else if (sh.st === 'flee') { sh.a = 0.8; sh.x += (sh.x < W / 2 ? -1 : 1) * 260 * dt; }
        else if (sh.st === 'guess' && T > 30) done(false, '影はどこかへ行ってしまった…');
      }
    }

    // ---- 描く ----
    function sparkle(x, y, r) { // 珍しい虫はキラキラ
      if (ri < 2) return; const n = ri >= 3 ? 7 : 4; c.save();
      for (let k = 0; k < n; k++) { const a = T * 1.6 + k * 2.3, px = x + Math.cos(a) * r, py = y + Math.sin(a * 1.3) * r * 0.7, tw = 0.5 + 0.5 * Math.sin(T * 6 + k), s = (ri >= 3 ? 4.5 : 3) * (0.5 + tw); c.globalAlpha = 0.3 + 0.7 * tw; c.fillStyle = ri >= 3 ? '#ffe9a0' : '#e8f6ff'; c.beginPath(); c.moveTo(px, py - s); c.lineTo(px + s * 0.3, py - s * 0.3); c.lineTo(px + s, py); c.lineTo(px + s * 0.3, py + s * 0.3); c.lineTo(px, py + s); c.lineTo(px - s * 0.3, py + s * 0.3); c.lineTo(px - s, py); c.lineTo(px - s * 0.3, py - s * 0.3); c.closePath(); c.fill(); }
      c.restore();
    }
    function drawBug(x, y, rot, face, ph) {
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(face || 1, 1);
      const dark = 'rgba(0,0,0,.55)';
      if (shape === 'kabuto' || shape === 'kuwa' || shape === 'kana' || shape === 'beetle') {
        c.strokeStyle = '#1a120a'; c.lineWidth = 1.5; for (const s of [-1, 1]) for (const k of [-5, 0, 5]) { c.beginPath(); c.moveTo(k, 0); c.lineTo(k + 3, s * 9); c.stroke(); }
        c.fillStyle = col; c.beginPath(); c.ellipse(-2, 0, 11, 7.5, 0, 0, 7); c.fill(); c.strokeStyle = dark; c.beginPath(); c.moveTo(-12, 0); c.lineTo(8, 0); c.stroke();
        c.fillStyle = col; c.beginPath(); c.ellipse(10, 0, 4.5, 5, 0, 0, 7); c.fill();
        if (shape === 'kabuto') { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.moveTo(13, 0); c.quadraticCurveTo(22, -1, 24, -9); c.stroke(); c.beginPath(); c.moveTo(12, -2); c.lineTo(17, -7); c.stroke(); }
        if (shape === 'kuwa') { c.strokeStyle = col; c.lineWidth = 2.5; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(13, s * 2); c.quadraticCurveTo(22, s * 7, 23, s * 1); c.stroke(); } }
        c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(-4, -3, 5, 2, 0, 0, 7); c.fill();
      } else if (shape === 'butterfly') {
        const f = 0.25 + 0.75 * Math.abs(Math.sin(ph * 14));
        c.fillStyle = col; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
        for (const s of [-1, 1]) { c.save(); c.scale(1, s * f); c.beginPath(); c.ellipse(2, -9, 9, 9, -0.3, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(-5, -6, 6, 6, 0.4, 0, 7); c.fill(); c.stroke(); c.restore(); }
        c.fillStyle = '#222'; c.beginPath(); c.ellipse(0, 0, 8, 2, 0, 0, 7); c.fill();
      } else if (shape === 'dragonfly') {
        c.fillStyle = 'rgba(230,240,255,.55)'; const f = Math.sin(ph * 40) * 0.25;
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(4, s * (9 + f * 4), 3, 11, 0.15 * s, 0, 7); c.fill(); c.beginPath(); c.ellipse(-2, s * (9 - f * 4), 3, 10, -0.15 * s, 0, 7); c.fill(); }
        c.fillStyle = col; c.fillRect(-22, -1.5, 24, 3); c.beginPath(); c.ellipse(5, 0, 6, 3.5, 0, 0, 7); c.fill(); c.beginPath(); c.arc(11, 0, 3.5, 0, 7); c.fill();
      } else if (shape === 'bee') {
        c.fillStyle = 'rgba(240,245,255,.6)'; const f = Math.sin(ph * 50) * 3; c.beginPath(); c.ellipse(0, -7 - f, 5, 7, 0.3, 0, 7); c.fill();
        c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, 7); c.fill(); c.fillStyle = '#1a1208'; for (const k of [-4, 0, 4]) c.fillRect(k - 1, -5, 2, 10); c.beginPath(); c.arc(8, 0, 3.5, 0, 7); c.fill();
      } else if (shape === 'firefly') {
        if (night) { const gr = c.createRadialGradient(-4, 0, 1, -4, 0, 16); gr.addColorStop(0, 'rgba(220,255,120,.95)'); gr.addColorStop(1, 'rgba(160,255,80,0)'); c.fillStyle = gr; c.beginPath(); c.arc(-4, 0, 16, 0, 7); c.fill(); }
        c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 6, 3, 0, 0, 7); c.fill(); c.fillStyle = '#d33'; c.beginPath(); c.arc(5, 0, 2, 0, 7); c.fill();
      } else { // 蝉
        c.fillStyle = 'rgba(230,240,255,.45)'; c.strokeStyle = 'rgba(0,0,0,.4)'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(-4, s * 5, 12, 4.5, s * 0.25, 0, 7); c.fill(); c.stroke(); }
        c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 10, 5, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(8, 0, 4, 5.5, 0, 0, 7); c.fill();
      }
      c.restore();
    }
    function tree(t) {
      const ox = t.shake > 0 ? Math.sin(T * 60) * 6 * Math.min(1, t.shake * 3) : 0;
      c.fillStyle = night ? '#2e2216' : '#5a4028'; c.fillRect(t.x - 10, t.y + 20, 20, GY - t.y - 20);
      c.fillStyle = night ? '#3a2a1a' : '#6e5034'; c.fillRect(t.x - 4, t.y + 40, 4, GY - t.y - 50);
      for (const [dx, dy, r, k] of [[-30, 10, 34, 0], [28, 12, 32, 1], [0, -10, 42, 2], [-14, 26, 28, 3], [18, 28, 28, 4]]) { c.fillStyle = night ? ['#16301e', '#1a3a22', '#1d4026', '#163020', '#1a3622'][k] : ['#3e7a3a', '#478a40', '#4f9446', '#3a7034', '#468440'][k]; c.beginPath(); c.arc(t.x + dx + ox * (1 + k * 0.1), t.y + dy, r, 0, 7); c.fill(); }
    }
    function clump(q, k) {
      const sw = q.rus > 0 ? Math.sin(T * 40) * 5 * Math.min(1, q.rus * 3) : 0;
      for (let i = 0; i < 26; i++) { const a = (i / 26 - 0.5) * 1.6, h = 38 + ((i * 37 + k * 11) % 23); c.strokeStyle = night ? (i % 2 ? '#1e3a1e' : '#284a26') : (i % 2 ? '#4f8a36' : '#6aa344'); c.lineWidth = 3; c.beginPath(); c.moveTo(q.x + a * 36, GY - 20); c.quadraticCurveTo(q.x + a * 40 + sw * 0.5, GY - 20 - h * 0.6, q.x + a * 50 + sw, GY - 20 - h); c.stroke(); }
    }
    function draw() {
      const sky = c.createLinearGradient(0, 0, 0, GY); if (night) { sky.addColorStop(0, '#0b1230'); sky.addColorStop(1, '#1b2440'); } else { sky.addColorStop(0, '#9fd0ee'); sky.addColorStop(1, '#d8eef0'); }
      c.fillStyle = sky; c.fillRect(0, 0, W, GY);
      if (night) { c.fillStyle = '#f2efe0'; c.beginPath(); c.arc(W - 50, 40, 14, 0, 7); c.fill(); }
      c.fillStyle = night ? '#1c2a16' : '#7aa54e'; c.fillRect(0, GY - 24, W, H - GY + 24); c.fillStyle = night ? '#2a2216' : '#8a6e44'; c.fillRect(0, GY, W, H - GY);
      if (mode === 'tree') trees.forEach(tree);
      if (mode === 'fly') for (const [fx, fh, fc] of FLW) { c.strokeStyle = night ? '#24401e' : '#4f8a36'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, GY - 18); c.lineTo(fx + 2, GY - 18 - fh); c.stroke(); c.fillStyle = night ? 'rgba(200,200,220,.4)' : fc; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(fx + 2 + Math.cos(k * 1.26) * 4, GY - 18 - fh + Math.sin(k * 1.26) * 4, 3, 0, 7); c.fill(); } } // 野の花
      if (mode === 'grass') {
        clumps.forEach(clump);
        if (sh.a > 0 && sh.st !== 'got') { c.fillStyle = `rgba(8,8,8,${sh.a * 0.85})`; c.beginPath(); c.ellipse(sh.x, sh.y, 16, 6, 0, 0, 7); c.fill(); if (night) { c.fillStyle = `rgba(255,230,140,${sh.a})`; c.fillRect(sh.x + 6, sh.y - 3, 2, 2); c.fillRect(sh.x + 10, sh.y - 3, 2, 2); } } // 影は草むらの手前の地面を走る（夜は目が光る）
        if (sh.st === 'guess' || sh.st === 'got' || sh.st === 'flee') { c.fillStyle = 'rgba(255,240,170,.85)'; c.font = '16px sans-serif'; c.textAlign = 'center'; clumps.forEach((q, i) => c.fillText(['左', '真ん中', '右'][i], q.x, GY + 22)); }
        if (sh.st === 'got') { drawBug(clumps[seq[seq.length - 1]].x, GY - 40, 0, 1, T); sparkle(clumps[seq[seq.length - 1]].x, GY - 40, 22); }
      }
      for (const p of parts) { c.fillStyle = night ? 'rgba(60,110,60,.8)' : 'rgba(80,140,60,.9)'; c.save(); c.translate(p.x, p.y); c.rotate(p.r + T * 3); c.fillRect(-3, -1.5, 6, 3); c.restore(); }
      if (mode === 'tree' && bug && bug.st !== 'gone') { drawBug(bug.x, bug.y, bug.rot, bug.vx < 0 ? -1 : 1, T); sparkle(bug.x, bug.y, 20); }
      if (mode === 'fly') { if (fb.vis) { drawBug(fb.x, fb.y, 0, fb.face, fb.ph); sparkle(fb.x, fb.y, 22); } else if (shape === 'firefly') { c.fillStyle = 'rgba(160,255,80,.08)'; c.beginPath(); c.arc(fb.x, fb.y, 10, 0, 7); c.fill(); } }
      for (const n of nets) { const k = n.t / 0.4; c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.lineWidth = 2; c.beginPath(); c.arc(n.x, n.y, 10 + k * 16, 0, 7); c.stroke(); }
      if (aim.show) { c.strokeStyle = 'rgba(255,240,170,.9)'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.arc(aim.x, aim.y, 14, 0, 7); c.stroke(); c.setLineDash([]); }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // 十字キー・スティックで狙いを動かす（Space・Aでタップ）
      let dx = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0), dy = (keys.ArrowDown || keys.s || keys.S ? 1 : 0) - (keys.ArrowUp || keys.w || keys.W ? 1 : 0);
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [], gp = pads.find((p) => p.buttons.some((b) => b && b.pressed)) || pads.find((p) => p.mapping === 'standard') || pads[0];
      if (gp) { const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); dx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0); dy += (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0); if (b(0) && !prevPad[0]) run.tap(); for (let i = 0; i < 17; i++) prevPad[i] = b(i); }
      if (dx || dy) { aim.show = true; aim.x = Math.max(8, Math.min(W - 8, aim.x + dx * 260 * dt)); aim.y = Math.max(8, Math.min(H - 8, aim.y + dy * 260 * dt)); }
      update(dt); draw();
      if (end) { end.t -= dt; if (end.t <= 0) { cancelAnimationFrame(raf); const q = end.q; open('<div class="big">…</div>'); doneN = g.n; SGK.cmd({ type: 'gatherEnd', n: g.n, q }); run.phase = 'wait'; } }
    }
    run.phase = 'play';
    raf = requestAnimationFrame(frame);
  }
  // ---- 釣り場 ----
  function castScene() {
    const g = run.g, df = DF()[g.d] || DF().普通, ri = RI[g.r] || 0, W = 400, H = 300, BX = W / 2, BY = H - 14;
    open(`<canvas id="gcv" width="${W}" height="${H}" style="width:100%;border-radius:8px;touch-action:none;display:block"></canvas><div id="gcm" style="margin:8px 0;min-height:22px">魚影の近くに浮きを投げよう（クリック／タップ・Space・Aボタン）</div><button id="gcancel">やめる</button>`);
    $('gcancel').onclick = cancel; $('gcancel').classList.add('main'); $('gcancel').classList.remove('main');
    const cv = $('gcv'), c = cv.getContext('2d'), len = 38 + 62 * (g.fr || 0.5) + ri * 4, left = Math.random() < 0.5;
    const F = { x: left ? -len : W + len, y: 70 + Math.random() * 110, vx: (left ? 1 : -1) * (24 + ri * 7), ph: Math.random() * 6, mode: 'swim', t: 0 };
    const aim = { x: BX, y: 130 }, rip = []; let bob = null, msg = '', end = null, last = performance.now(), prevPad = {};
    const say = (t) => { const m = $('gcm'); if (m) m.textContent = t; };
    const spd0 = Math.abs(F.vx);
    // 2.45.0 釣り大会では、魚影が時間差で何匹か出てくる（本命のほかは、近づいて食いつくふりをするだけの別の影）
    const party = !!run.party; F.delay = party ? 0.8 + Math.random() * 6 : 0;
    const DK = party ? [0, 1, 2].map((i) => { const l = Math.random() < 0.5, ln = 30 + Math.random() * 40; return { x: l ? -ln : W + ln, y: 60 + Math.random() * 130, vx: (l ? 1 : -1) * (20 + Math.random() * 18), ph: Math.random() * 6, len: ln, delay: 0.3 + i * 2.4 + Math.random() * 2.5, mode: 'swim', t: 0 }; }) : [];
    function cast() {
      if (end || bob) return;
      bob = { x: aim.x, y: Math.min(aim.y, BY - 30), t: 0, land: false, rest: 0 }; say('えいっ！');
    }
    run.tap = cast;
    const toLocal = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
    cv.onpointermove = (e) => { if (e.pointerType === 'touch') return; [aim.x, aim.y] = toLocal(e); };
    cv.onpointerdown = (e) => { e.preventDefault(); [aim.x, aim.y] = toLocal(e); cast(); };
    function landed() {
      bob.land = true; rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 });
      const d = Math.hypot(F.x - bob.x, F.y - bob.y);
      if (d < len * 0.3) { F.mode = 'flee'; F.vx = (F.x < bob.x ? -1 : 1) * 130; say('しぶきで魚影が逃げてしまった…'); end = { t: 1.4, q: 0 }; }
      else if (d < len * 1.7 + 24) { F.mode = 'look'; say('魚影が近づいてくる…'); }
      else {
        const dk = DK.find((o) => o.delay <= 0 && o.mode === 'swim' && Math.hypot(o.x - bob.x, o.y - bob.y) < o.len * 1.7 + 24);
        if (dk) { if (Math.hypot(dk.x - bob.x, dk.y - bob.y) < dk.len * 0.3) { dk.mode = 'flee'; dk.vx = (dk.x < bob.x ? -1 : 1) * 130; say('しぶきで魚影が逃げてしまった…'); bob.rest = 1; } else { dk.mode = 'look'; say('別の魚影が近づいてくる…'); } }
        else { say('気づかなかったようだ…'); bob.rest = 1.1; }
      }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // 十字・スティックで狙いを動かす
      let dx = (keys.ArrowRight || keys.d || keys.D ? 1 : 0) - (keys.ArrowLeft || keys.a || keys.A ? 1 : 0), dy = (keys.ArrowDown || keys.s || keys.S ? 1 : 0) - (keys.ArrowUp || keys.w || keys.W ? 1 : 0);
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [], gp = pads.find((p) => p.buttons.some((b) => b && b.pressed)) || pads.find((p) => p.mapping === 'standard') || pads[0];
      if (gp) { const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed); dx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0); dy += (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0); if (b(0) && !prevPad[0]) cast(); for (let i = 0; i < 17; i++) prevPad[i] = b(i); }
      aim.x = Math.max(10, Math.min(W - 10, aim.x + dx * 150 * dt)); aim.y = Math.max(20, Math.min(BY - 30, aim.y + dy * 150 * dt));
      // 魚影
      F.ph += dt * 2;
      if (F.delay > 0) F.delay -= dt;
      else if (F.mode === 'swim' || F.mode === 'flee') { F.x += F.vx * dt; F.y += Math.sin(F.ph) * 10 * dt; }
      else if (bob && bob.land) {
        const d = Math.hypot(bob.x - F.x, bob.y - F.y);
        if (F.mode === 'look') { if (d > 6) { const k = Math.min(1, (70 * dt) / d); F.x += (bob.x - F.x) * k; F.y += (bob.y - F.y) * k; } else { F.mode = 'nibble'; F.t = 0.9 + Math.random() * 1.6 + ri * 0.2; F.n = 0; } }
        else if (F.mode === 'nibble') {
          F.t -= dt; const dip = Math.sin(F.t * 14) > 0.9 ? 1 : 0; if (dip && !F.dip) { rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 }); } F.dip = dip;
          if (F.t <= 0) { F.mode = 'bite'; rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 }, { x: bob.x, y: bob.y, r: -6, a: 1 }); say('アタリ！'); end = { t: 0.35, bite: true }; }
        }
      }
      for (const o of DK) { // 別の魚影
        if (o.delay > 0) { o.delay -= dt; continue; } o.ph += dt * 2;
        if (o.mode === 'swim' || o.mode === 'flee') { o.x += o.vx * dt; o.y += Math.sin(o.ph) * 10 * dt; }
        else if (o.mode === 'look') { if (!bob || !bob.land) o.mode = 'swim'; else { const d = Math.hypot(bob.x - o.x, bob.y - o.y); if (d > 6) { const k = Math.min(1, (60 * dt) / d); o.x += (bob.x - o.x) * k; o.y += (bob.y - o.y) * k; } else { o.mode = 'nibble'; o.t = 0.8 + Math.random() * 1.2; } } }
        else if (o.mode === 'nibble') { o.t -= dt; if (o.t <= 0) { o.mode = 'flee'; o.vx = (o.x < BX ? -1 : 1) * 60; if (bob && bob.land && !end && F.mode !== 'look' && F.mode !== 'nibble') { rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 }); say('ただの別の魚だったようだ…'); bob.rest = 0.7; } } }
      }
      if (!end && F.delay <= 0 && (F.x < -len - 20 || F.x > W + len + 20)) { say('魚影は去っていった…'); end = { t: 1.2, q: 0 }; }
      if (bob) { bob.t += dt; if (!bob.land && bob.t >= 0.45) landed(); if (bob.land && bob.rest > 0) { bob.rest -= dt; if (bob.rest <= 0) bob = null; } }
      for (const r of rip) { r.r += 38 * dt; r.a -= dt * 0.9; } while (rip.length && rip[0].a <= 0) rip.shift();
      if (end) { end.t -= dt; if (end.t <= 0) { cancelAnimationFrame(raf); if (end.bite) hit(); else finishFish(0); return; } }
      // 描く
      const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2f7a94'); gr.addColorStop(1, '#1b4a63'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; for (let i = 0; i < 9; i++) { const y = 20 + i * 30 + Math.sin(now / 900 + i) * 3; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x / 30 + now / 700 + i) * 2); c.stroke(); }
      c.fillStyle = '#6b5a3a'; c.fillRect(0, H - 24, W, 24); c.fillStyle = '#4e7a3a'; c.fillRect(0, H - 24, W, 5); c.fillStyle = '#f3e9d0'; c.beginPath(); c.arc(BX, H - 18, 7, 0, 7); c.fill();
      for (const r of rip) { c.strokeStyle = `rgba(255,255,255,${Math.max(0, r.a) * 0.7})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(r.x, r.y, Math.abs(r.r), Math.abs(r.r) * 0.45, 0, 0, 7); c.stroke(); }
      // 魚影（向きに合わせて）
      const dirx = F.mode === 'look' && bob ? Math.sign(bob.x - F.x) || 1 : Math.sign(F.vx) || 1; c.save(); c.translate(F.x, F.y); c.scale(dirx, 1); c.fillStyle = F.mode === 'flee' ? 'rgba(0,10,20,.25)' : 'rgba(0,12,24,.42)';
      c.beginPath(); c.ellipse(0, 0, len / 2, len * 0.17, 0, 0, 7); c.fill(); const sw = Math.sin(F.ph * 3) * len * 0.07; c.beginPath(); c.moveTo(-len * 0.4, 0); c.lineTo(-len * 0.72, -len * 0.18 + sw); c.lineTo(-len * 0.72, len * 0.18 + sw); c.fill(); c.restore();
      for (const o of DK) { if (o.delay > 0) continue; const dx0 = o.mode === 'look' && bob ? Math.sign(bob.x - o.x) || 1 : Math.sign(o.vx) || 1; c.save(); c.translate(o.x, o.y); c.scale(dx0, 1); c.fillStyle = o.mode === 'flee' ? 'rgba(0,10,20,.2)' : 'rgba(0,12,24,.34)'; c.beginPath(); c.ellipse(0, 0, o.len / 2, o.len * 0.17, 0, 0, 7); c.fill(); const w2 = Math.sin(o.ph * 3) * o.len * 0.07; c.beginPath(); c.moveTo(-o.len * 0.4, 0); c.lineTo(-o.len * 0.72, -o.len * 0.18 + w2); c.lineTo(-o.len * 0.72, o.len * 0.18 + w2); c.fill(); c.restore(); }
      // 珍しい魚以上はキラキラ（稀少・幻はより強く金色に）
      if (ri >= 2) { const n = ri >= 3 ? 9 : 5; c.save(); for (let k = 0; k < n; k++) { const a = now / (500 + k * 90) + k * 2.1, px = F.x + Math.cos(a) * len * (0.3 + 0.25 * ((k * 37) % 5) / 5), py = F.y + Math.sin(a * 1.3) * len * 0.25, tw = 0.5 + 0.5 * Math.sin(now / 160 + k * 1.7), sz = (ri >= 3 ? 5 : 3.5) * (0.5 + tw); c.globalAlpha = 0.3 + 0.7 * tw; c.fillStyle = ri >= 3 ? '#ffe9a0' : '#e8f6ff'; c.beginPath(); c.moveTo(px, py - sz); c.lineTo(px + sz * 0.3, py - sz * 0.3); c.lineTo(px + sz, py); c.lineTo(px + sz * 0.3, py + sz * 0.3); c.lineTo(px, py + sz); c.lineTo(px - sz * 0.3, py + sz * 0.3); c.lineTo(px - sz, py); c.lineTo(px - sz * 0.3, py - sz * 0.3); c.closePath(); c.fill(); } c.restore(); }
      // 狙い・浮き
      if (!bob) { c.strokeStyle = 'rgba(255,240,170,.9)'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.arc(aim.x, aim.y, 13, 0, 7); c.stroke(); c.setLineDash([]); }
      else {
        const k = Math.min(1, bob.t / 0.45), bx = BX + (bob.x - BX) * k, by = BY + (bob.y - BY) * k - Math.sin(k * Math.PI) * 60;
        if (!bob.land) { c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(BX, BY); c.lineTo(bx, by); c.stroke(); }
        const dip = F.mode === 'nibble' && Math.sin(F.t * 14) > 0.5 ? 3 : 0; c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by + dip, 5, 0, 7); c.fill(); c.fillStyle = '#d33'; c.beginPath(); c.arc(bx, by + dip - 2, 4, Math.PI, 0); c.fill();
      }
    }
    raf = requestAnimationFrame(frame);
    function hit() { // アタリ！ 早めに押す
      run.phase = 'hit';
      open('<div class="big">' + SGK.ICON.html('bite', 72) + '</div><div style="font-size:22px">アタリ！</div><button class="main" id="gpull">引け！</button>');
      const go = () => { if (run.phase !== 'hit') return; clearTimeout(run.to); run.phase = 'bar'; bar(); }; run.tap = go; $('gpull').onclick = go;
      run.to = setTimeout(() => { if (run && run.phase === 'hit') { run.phase = 'done'; finishFish(0); } }, df.react);
    }
  }
  function bar() { // 棒の上を動く印を、緑の所で止める（魚：大物は何回か続ける）
    const g = run.g, df = DF()[g.d] || DF().普通, rd = run.rd + 1, n = run.rounds, spd = df.spd * (1 + 0.12 * run.rd);
    const hw = 0.5 * (1 - df.thr), c = hw + 0.05 + Math.random() * (1 - 2 * hw - 0.1);
    run.phase = 'bar';
    open(`<div style="font-size:18px">${n > 1 ? `手応えが強い！ ${rd}/${n}回目` : '魚が暴れている！'}　緑の所で引き上げろ</div><div class="bar"><div class="zone" style="left:${(c - hw) * 100}%;width:${hw * 200}%"></div><div class="mk" id="gmk"></div></div><button class="main" id="gtap">引き上げる！</button>`);
    let pos = 0, dir = 1, last = performance.now();
    const step = (now) => { const dt = (now - last) / 1000; last = now; pos += dir * spd * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } const m = $('gmk'); if (m) m.style.left = pos * 100 + '%'; raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const tap = () => {
      if (run.phase !== 'bar') return; cancelAnimationFrame(raf); const q = Math.max(0, 1 - Math.abs(pos - c) / 0.5);
      if (q < df.thr) { run.phase = 'done'; return finishFish(q); } // 失敗：逃げられる
      run.qs.push(q); run.rd++;
      if (run.rd >= n) { run.phase = 'done'; return finishFish(run.qs.reduce((a, b) => a + b, 0) / run.qs.length); }
      run.phase = 'gap'; open(`<div class="big">${SGK.ICON.html('bite', 72)}</div><div style="font-size:20px">いい手応え！ もう一息…</div>`); run.tap = null;
      setTimeout(() => { if (run && run.phase === 'gap') bar(); }, 700);
    };
    run.tap = tap; $('gtap').onclick = tap;
  }
  function finishFish(q) { if (run.party) { const cb = run.party; close(); return cb(q); } const g = run.g; open('<div class="big">…</div>'); doneN = g.n; SGK.cmd({ type: 'gatherEnd', n: g.n, q }); run.phase = 'wait'; }
  // 2.44.0 みんなで遊ぶ「釣り大会」から、いつもの釣り（釣り場の浮き投げ→アタリ→棒のタイミング）をそのまま使う。結果は命令にせず cb(q) で返す（q<0＝やめた）
  SGK.GATHERUI.party = (g, cb) => {
    if (ov || run) return cb(-1);
    run = { g, phase: 'wait', tap: null, rd: 0, qs: [], rounds: Math.min(5, (RN[g.r] || 1) + (g.fr >= 0.85 ? 1 : 0)), party: cb }; keys = {};
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true); castScene(); if (ov) ov.style.zIndex = 9500;
    const z = setInterval(() => { if (!run || !run.party) return clearInterval(z); if (ov && ov.style.zIndex !== '9500') ov.style.zIndex = 9500; }, 100);
  };
  SGK.GATHERUI.stop = () => { if (run && run.party) { const cb = run.party; close(); cb(-1); } };
  function showResult(L) {
    shownN = L.n; const ok = L.ok, c = L.id && D.creatures.find((x) => x.id === L.id);
    window.removeEventListener('keydown', onKey, true); cancelAnimationFrame(raf); run = null;
    open(`<div class="big">${ok && c ? cImg(c, 'cimg') : SGK.ICON.html(ok ? (L.k === 'f' ? 'fish' : 'bug') : 'miss', 72)}</div><div style="font-size:20px">${L.txt}</div>`
      + (ok ? `<div style="margin:8px 0">${L.isNew ? '<b style="color:#e8c46a">図鑑に新しく載りました！</b><br>' : ''}${L.rec ? '<b style="color:#6fbf73">自己ベスト更新！</b><br>' : ''}<span class="muted">${L.r}</span>　<b>+${L.gain}文</b></div>` : (L.hint ? `<div class="muted">${L.hint}</div>` : ''))
      + '<div class="row" style="gap:8px;margin-top:10px"><button class="main" id="gagain" style="flex:1">もう一度</button><button id="gend" style="flex:1">やめる</button></div>');
    $('gagain').onclick = () => { close(); SGK.cmd({ type: 'gatherStart', kind: L.k === 'f' ? 'fish' : 'bug' }); };
    $('gend').onclick = close;
  }

  // ---- 生き物図鑑 ----
  const menuBtn = document.createElement('button'); menuBtn.id = 'mCreat'; menuBtn.textContent = '生き物図鑑';
  $('mZukan').insertAdjacentElement('afterend', menuBtn);
  let ctab = 'f';
  function panel() {
    const me = G.priv && G.priv.me; if (!me) return;
    const Z = me.zukan || {}, list = D.creatures.filter((c) => c.k === ctab), got = list.filter((c) => (Z[c.id] || [0])[0] > 0).length;
    let p = $('creatPanel'); if (!p) { p = document.createElement('div'); p.id = 'creatPanel'; document.body.appendChild(p); }
    p.innerHTML = `<div class="cc"><div class="row" style="justify-content:space-between;align-items:center"><b>生き物図鑑</b><button id="cpX">閉じる</button></div>
      <div class="row" style="gap:6px;margin-top:6px"><button id="cpF" class="${ctab === 'f' ? 'on' : ''}">魚</button><button id="cpB" class="${ctab === 'b' ? 'on' : ''}">虫</button><span class="muted" style="align-self:center">${got}/${list.length}種</span></div>
      <div class="cl">${list.map((c) => { const z = Z[c.id]; return z && z[0] ? `<div class="it"><div class="ci">${cImg(c)}</div><div><b>${c.n}</b>　<span class="muted">${c.r}</span><br>取った数 ${z[0]}　最大 ${z[1]}${unitOf(c)}　（${c.sz[0]}〜${c.sz[1]}${unitOf(c)}）　基本 ${c.p}文<br><span class="muted">${c.pl.join('・')}／${c.rgT}／${c.t.join('・')}</span></div></div>` : `<div class="it no"><div class="ci">${cImg(c)}</div><b>？？？</b></div>`; }).join('')}</div></div>`;
    $('cpX').onclick = () => p.remove(); $('cpF').onclick = () => { ctab = 'f'; panel(); }; $('cpB').onclick = () => { ctab = 'b'; panel(); };
  }
  menuBtn.onclick = () => { $('mClose').click(); panel(); };
})();
