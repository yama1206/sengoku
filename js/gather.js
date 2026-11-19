// 2.11.0 釣り・虫取りの画面：地図の下のボタン、タイミングを合わせる遊び、生き物図鑑
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
  let ov = null, run = null, doneN = 0, shownN = 0;

  // ---- 地図の下のボタン（立ち止まっていて、ここに生き物がいるとき） ----
  setInterval(() => {
    const P = G.priv, me = P && P.me, inGame = P && !P.battle && G.mode !== 'title' && me;
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
  function cancel() { if (run) { SGK.cmd({ type: 'gatherEnd', n: run.g.n, q: -1 }); doneN = shownN = run.g.n; } close(); }
  // 2.27.0 釣りは「釣り場」の場面から：水面を泳ぐ魚影の近くへ浮きを投げる（どうぶつの森ふう）。近づけば食いつき、アタリ→棒のタイミング遊び。
  // 大物・珍しい魚は、棒のタイミングを何回か続けて成功させる必要がある（珍しさ：ありふれた1・見かける1・珍しい2・稀少3・幻4回、大物でさらに+1）
  const RN = { ありふれた: 1, 見かける: 1, 珍しい: 2, 稀少: 3, '幻のような': 4 }, RI = { ありふれた: 0, 見かける: 1, 珍しい: 2, 稀少: 3, '幻のような': 4 };
  let keys = {}, padPrev = {};
  function startPlay(g) {
    const fish = g.k === 'f', df = DF()[g.d] || DF().普通;
    run = { g, phase: 'wait', tap: null, rd: 0, qs: [], rounds: fish ? Math.min(5, (RN[g.r] || 1) + (g.fr >= 0.85 ? 1 : 0)) : 1 }; shownN = g.n - 1; keys = {}; window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', onKeyUp, true);
    if (fish) return castScene();
    open(`<div class="big">${SGK.ICON.html('net', 72)}</div><div id="gmsg">そっと近づく…</div><div style="margin-top:10px"><button id="gcancel">やめる</button></div>`);
    $('gcancel').onclick = cancel;
    setTimeout(() => { if (!run || run.g !== g) return; bar(); }, 1000 + Math.random() * 2600);
    function bar() { // 棒の上を動く印を、緑の所で止める（虫）
      run.phase = 'bar';
      const hw = 0.5 * (1 - df.thr), c = hw + 0.05 + Math.random() * (1 - 2 * hw - 0.1);
      open(`<div style="font-size:18px">網を振るなら、緑の所で！</div><div class="bar"><div class="zone" style="left:${(c - hw) * 100}%;width:${hw * 200}%"></div><div class="mk" id="gmk"></div></div><button class="main" id="gtap">捕まえる！</button>`);
      let pos = 0, dir = 1, last = performance.now();
      const step = (now) => { const dt = (now - last) / 1000; last = now; pos += dir * df.spd * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } const m = $('gmk'); if (m) m.style.left = pos * 100 + '%'; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      const tap = () => { if (run.phase !== 'bar') return; run.phase = 'done'; cancelAnimationFrame(raf); finish(Math.max(0, 1 - Math.abs(pos - c) / 0.5)); };
      run.tap = tap; $('gtap').onclick = tap;
    }
    function finish(q) { open('<div class="big">…</div>'); doneN = g.n; SGK.cmd({ type: 'gatherEnd', n: g.n, q }); run.phase = 'wait'; }
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
      else { say('気づかなかったようだ…'); bob.rest = 1.1; }
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
      if (F.mode === 'swim' || F.mode === 'flee') { F.x += F.vx * dt; F.y += Math.sin(F.ph) * 10 * dt; }
      else if (bob && bob.land) {
        const d = Math.hypot(bob.x - F.x, bob.y - F.y);
        if (F.mode === 'look') { if (d > 6) { const k = Math.min(1, (70 * dt) / d); F.x += (bob.x - F.x) * k; F.y += (bob.y - F.y) * k; } else { F.mode = 'nibble'; F.t = 0.9 + Math.random() * 1.6 + ri * 0.2; F.n = 0; } }
        else if (F.mode === 'nibble') {
          F.t -= dt; const dip = Math.sin(F.t * 14) > 0.9 ? 1 : 0; if (dip && !F.dip) { rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 }); } F.dip = dip;
          if (F.t <= 0) { F.mode = 'bite'; rip.push({ x: bob.x, y: bob.y, r: 2, a: 1 }, { x: bob.x, y: bob.y, r: -6, a: 1 }); say('アタリ！'); end = { t: 0.35, bite: true }; }
        }
      }
      if (!end && (F.x < -len - 20 || F.x > W + len + 20)) { say('魚影は去っていった…'); end = { t: 1.2, q: 0 }; }
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
  function finishFish(q) { const g = run.g; open('<div class="big">…</div>'); doneN = g.n; SGK.cmd({ type: 'gatherEnd', n: g.n, q }); run.phase = 'wait'; }
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
