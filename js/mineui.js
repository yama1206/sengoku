// 2.25.0 採掘の画面：山地・金山銀山のそばで「採掘する」→ 岩のマスを道具で掘り、中の鉱物を傷つけずに取り出す。制限時間なし
// 岩の作り方・掘る規則は SGK.MINE（js/sim/mining.js）。終わると操作の記録をホストへ送り、ホストが同じ規則でやり直して結果を決める
// 操作：マウス/タッチ＝マスを押す（タッチは1回目で狙いを見せ、同じマスをもう一度押すと実行）／キーボード＝矢印・WASDで移動、Space・Enterで実行、1〜4・Q/Eで道具／コントローラー＝十字・スティックで移動、A実行、LB/RBで道具、Startで終える
(function () {
  const $ = (id) => document.getElementById(id), G = window.SGK_G, M = SGK.MINE;
  const UI = (SGK.MINEUI = {});
  const css = document.createElement('style');
  css.textContent = `
  #mineBox{position:fixed;left:10px;bottom:104px;z-index:6;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
  #mineBox button{padding:8px 12px;font-size:14px}
  #mineBox small{background:rgba(20,16,10,.7);color:#ddd;border-radius:4px;padding:1px 6px;font-size:11px}
  #mineOv{position:fixed;inset:0;z-index:92;background:rgba(10,14,20,.9);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto}
  #mineOv .mc{width:min(96vw,600px);margin:8px 0;background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:10px;color:#f3e9d0}
  #mineOv .tl{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:6px 0}
  #mineOv .tl button{padding:8px 2px;font-size:13px;line-height:1.25}
  #mineOv .tl button.on{outline:2px solid #e8c46a;background:#5a4526}
  #mineOv canvas{display:block;margin:0 auto;border:2px solid #5a4526;border-radius:4px;touch-action:none;background:#1a1713}
  #mineOv .lg{display:flex;flex-wrap:wrap;gap:6px;font-size:11px;margin:6px 0;align-items:center}
  #mineOv .lg i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:2px}
  #mineOv .gl{font-size:12px;margin:6px 0}
  #mineOv .gl div{padding:2px 0;border-bottom:1px solid rgba(255,255,255,.08)}
  #minePanel{position:fixed;inset:0;z-index:80;background:rgba(10,14,20,.86);display:flex;align-items:center;justify-content:center}
  #minePanel .cc{width:min(96vw,520px);max-height:90vh;background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0;display:flex;flex-direction:column}
  #minePanel .cl{overflow-y:auto;margin-top:8px}
  #minePanel .it{border-bottom:1px solid rgba(255,255,255,.1);padding:6px 2px;font-size:13px;display:flex;gap:8px;align-items:center;justify-content:space-between}`;
  document.head.appendChild(css);
  const chip = (m) => `<i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${m.col};margin-right:4px;vertical-align:-1px"></i>`;
  const LVC = ['#8f7f66', '#6f6252', '#52483f', '#3a332d'];

  // ---- 地図の下のボタン ----
  const box = document.createElement('div'); box.id = 'mineBox'; box.className = 'hidden';
  box.innerHTML = '<small id="mbTag"></small><div class="row"><button id="mbGo">採掘する</button></div>';
  document.body.appendChild(box);
  let ov = null, run = null, doneN = 0, shownN = 0;
  UI.isOpen = () => !!ov;
  setInterval(() => {
    const P = G.priv, me = P && P.me, inGame = P && !P.battle && G.mode !== 'title' && me;
    const sp = inGame && !ov && me.mineSpot, anyOpen = ['town', 'char', 'info', 'gameMenu'].some((i) => $(i) && !$(i).classList.contains('hidden'));
    box.classList.toggle('hidden', !sp || anyOpen);
    if (sp) $('mbTag').textContent = sp.near ? `${sp.name}のそば（${sp.near === 'kin' ? '金' : '銀'}が出やすい）` : '山の岩場';
    if (me && me.mine && !run && !ov && me.mine.n !== doneN) startPlay(me.mine);
    if (me && me.mineLast && me.mineLast.n > shownN && !(run && !run.over)) showResult(me.mineLast);
  }, 150);
  $('mbGo').onclick = () => SGK.cmd({ type: 'mineStart' });

  // ---- 画面 ----
  function openOv() { if (!ov) { ov = document.createElement('div'); ov.id = 'mineOv'; document.body.appendChild(ov); } return ov; }
  function close() { if (ov) ov.remove(); ov = null; run = null; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', swallow, true); }
  let raf = 0, padPrev = {}, padT = 0;
  const swallow = (e) => { if (ov) e.stopPropagation(); };
  function startPlay(m) {
    const S = M.gen(m.seed, m.near);
    run = { m, S, log: [], tool: 0, cx: (M.W / 2) | 0, cy: (M.H / 2) | 0, over: false, endAsk: false, lastTap: -1 };
    doneN = m.n; shownN = m.n - 1;
    window.addEventListener('keydown', onKey, true); window.addEventListener('keyup', swallow, true);
    openOv().innerHTML = `<div class="mc">
      <div class="row" style="justify-content:space-between;align-items:center"><b>採掘：${m.name}</b><span class="muted" id="mHits"></span></div>
      <div class="tl" id="mTools">${M.TOOLS.map((t, i) => `<button data-t="${i}">${t.name}<br><small>${t.info}</small></button>`).join('')}<button data-t="3">手<br><small>露出した宝石を取り出す</small></button></div>
      <canvas id="mCv"></canvas>
      <div class="lg">${M.LV.map((n, i) => `<span><i style="background:${LVC[i]}"></i>${n}</span>`).join('')}</div>
      <div class="gl" id="mGl"></div>
      <div class="row" style="gap:6px"><button id="mEnd" class="main" style="flex:1;padding:12px">掘り終える</button></div>
      <div class="muted" style="font-size:11px;margin-top:4px">岩を掘ると中の鉱物が見えてきます。全マスの岩を取り除いたら「手」で取り出すと持ち帰れます。道具が強いほど早いけれど、宝石に衝撃が伝わって傷みます。手数が少ないと手際のよさで上乗せがあります。</div></div>`;
    const cv = $('mCv'), w = Math.min(window.innerWidth * 0.92, 560, (window.innerHeight - 330) * M.W / M.H + 40), cs = Math.max(20, Math.floor(w / M.W));
    run.cs = cs; const dpr = window.devicePixelRatio || 1;
    cv.width = cs * M.W * dpr; cv.height = cs * M.H * dpr; cv.style.width = cs * M.W + 'px'; cv.style.height = cs * M.H + 'px'; run.dpr = dpr;
    const cellOf = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / cs), Math.floor((e.clientY - r.top) / cs)]; };
    cv.onpointermove = (e) => { if (e.pointerType === 'touch') return; const [x, y] = cellOf(e); if (x >= 0 && y >= 0 && x < M.W && y < M.H) { run.cx = x; run.cy = y; draw(); } };
    cv.onpointerdown = (e) => {
      e.preventDefault(); const [x, y] = cellOf(e); if (x < 0 || y < 0 || x >= M.W || y >= M.H) return;
      const i = y * M.W + x;
      if (e.pointerType === 'touch' && run.lastTap !== i) { run.cx = x; run.cy = y; run.lastTap = i; draw(); return; } // タッチ：1回目は狙いを見せるだけ
      run.cx = x; run.cy = y; act();
    };
    $('mTools').onclick = (e) => { const b = e.target.closest('button[data-t]'); if (b) { run.tool = +b.dataset.t; draw(); } };
    $('mEnd').onclick = () => endAsk();
    raf = requestAnimationFrame(loop); draw();
  }
  function endAsk() {
    if (!run || run.over) return;
    if (!run.endAsk) { run.endAsk = true; draw(); return; }
    finish();
  }
  function finish() {
    run.over = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true);
    openOv().innerHTML = '<div class="mc" style="text-align:center"><div style="font-size:30px;margin:20px">…</div></div>';
    SGK.cmd({ type: 'mineEnd', n: run.m.n, log: run.log });
  }
  function act() {
    if (!run || run.over) return; run.endAsk = false;
    const t = run.tool, i = run.cy * M.W + run.cx;
    if (M.step(run.S, t, i)) { run.log.push(t * 1000 + i); run.lastTap = -1; }
    draw();
    if (run.S.gems.every((g) => g.got || g.dur <= 0)) setTimeout(() => { if (run && !run.over) finish(); }, 600); // 全部取り出した／砕けたら自動で終わる
  }
  function onKey(e) {
    if (!run || run.over) return; const k = e.key; let used = true;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') run.cx = Math.max(0, run.cx - 1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') run.cx = Math.min(M.W - 1, run.cx + 1);
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') run.cy = Math.max(0, run.cy - 1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') run.cy = Math.min(M.H - 1, run.cy + 1);
    else if (k === ' ' || k === 'Enter') return void (e.preventDefault(), e.stopPropagation(), act());
    else if (k >= '1' && k <= '4') run.tool = +k - 1;
    else if (k === 'q' || k === 'Q') run.tool = (run.tool + 3) % 4;
    else if (k === 'e' || k === 'E') run.tool = (run.tool + 1) % 4;
    else if (k === 'Escape') { endAsk(); }
    else used = false;
    e.stopPropagation(); if (used) { e.preventDefault(); run.endAsk = k === 'Escape' ? run.endAsk : false; draw(); }
  }
  // コントローラー（十字・左スティックで移動、A＝実行、LB/RB＝道具、Start＝終える）
  function loop(now) {
    raf = requestAnimationFrame(loop); if (!run || run.over) return;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [];
    const gp = pads.find((p) => p.buttons.some((b) => b && b.pressed)) || pads.find((p) => p.mapping === 'standard') || pads[0]; if (!gp) return;
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), down = (i) => btn(i) && !padPrev[i];
    let dx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0), dy = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0; if (Math.abs(lx) > 0.5) dx = Math.sign(lx); if (Math.abs(ly) > 0.5) dy = Math.sign(ly);
    if ((dx || dy) && now - padT > 170) { padT = now; run.cx = Math.max(0, Math.min(M.W - 1, run.cx + dx)); run.cy = Math.max(0, Math.min(M.H - 1, run.cy + dy)); run.endAsk = false; draw(); }
    if (down(0)) act();
    if (down(4)) { run.tool = (run.tool + 3) % 4; run.endAsk = false; draw(); }
    if (down(5)) { run.tool = (run.tool + 1) % 4; run.endAsk = false; draw(); }
    if (down(9)) endAsk();
    for (let i = 0; i < 17; i++) padPrev[i] = btn(i);
  }

  // ---- 描く ----
  function crack(c, x, y, s, a, seed) {
    c.strokeStyle = `rgba(0,0,0,${a})`; c.lineWidth = 1.4; c.beginPath();
    let h = seed * 2654435761 >>> 0; const r = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 2; k++) { let px = x + s * (0.2 + r() * 0.6), py = y + s * (0.1 + r() * 0.2); c.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (r() - 0.5) * s * 0.5; py += s * 0.28; c.lineTo(px, py); } }
    c.stroke();
  }
  function draw() {
    if (!run || !ov) return; const S = run.S, cs = run.cs, cv = $('mCv'); if (!cv) return; const c = cv.getContext('2d'), W = M.W, H = M.H;
    c.setTransform(run.dpr, 0, 0, run.dpr, 0, 0); c.fillStyle = '#1a1713'; c.fillRect(0, 0, W * cs, H * cs);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, px = x * cs, py = y * cs, gi = S.occ[i], g = gi >= 0 ? S.gems[gi] : null;
      if (S.hp[i] > 0) {
        const f = S.hp[i] / M.HP[S.lv[i]]; c.fillStyle = LVC[S.lv[i]]; c.fillRect(px + 1, py + 1, cs - 2, cs - 2);
        c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(px + 1, py + 1, cs - 2, 3);
        if (f < 1) crack(c, px, py, cs, 0.25 + 0.5 * (1 - f), i + 7);
      } else if (g) {
        const m = M.byId(g.id);
        if (g.got) { c.strokeStyle = 'rgba(255,255,255,.18)'; c.strokeRect(px + 3, py + 3, cs - 6, cs - 6); }
        else if (g.dur <= 0) { c.fillStyle = m.col; c.globalAlpha = 0.5; for (let k = 0; k < 4; k++) c.fillRect(px + ((k * 7 + i * 3) % (cs - 6)) + 2, py + ((k * 11 + i * 5) % (cs - 6)) + 2, 4, 4); c.globalAlpha = 1; }
        else { c.fillStyle = m.col; c.fillRect(px + 2, py + 2, cs - 4, cs - 4); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(px + 4, py + 4, cs * 0.35, cs * 0.18); if (g.dur < 100) crack(c, px, py, cs, Math.min(0.8, 0.2 + (100 - g.dur) / 100), i + 3); }
      }
    }
    // 狙い（道具の当たる範囲）
    const t = run.tool, area = t === M.HAND ? [[0, 0]] : M.TOOLS[t].area;
    c.lineWidth = 2; for (const [dx, dy] of area) { const x = run.cx + dx, y = run.cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; c.strokeStyle = dx === 0 && dy === 0 ? '#ffe28a' : 'rgba(255,226,138,.55)'; c.strokeRect(x * cs + 1.5, y * cs + 1.5, cs - 3, cs - 3); }
    // 表
    $('mHits').textContent = `手数 ${S.hits}（目安 ${M.PAR}）`;
    [...$('mTools').children].forEach((b) => b.classList.toggle('on', +b.dataset.t === t));
    const cell = run.cy * W + run.cx, tip = S.hp[cell] > 0 ? M.LV[S.lv[cell]] + `（あと ${S.hp[cell]}）` : '掘った跡';
    const rows = [];
    S.gems.forEach((g, gi) => {
      const seen = g.cells.filter((i) => S.hp[i] <= 0).length; if (!seen && !g.got) return;
      const m = M.byId(g.id), q = M.quality(g.dur), whole = seen === g.cells.length;
      rows.push(`<div>${chip(m)}<b>${m.name}</b>　${g.got ? '<span style="color:#6fbf73">取り出し済み</span>' : g.dur <= 0 ? '<span style="color:#d66">砕けた…</span>' : whole ? '<span style="color:#e8c46a">全体が見えた（手で取り出せます）</span>' : `見えている ${seen}/${g.cells.length}マス`}　<span class="muted">${g.dur <= 0 ? '' : M.QTXT[q] + '（耐久 ' + Math.round(g.dur) + '）'}</span></div>`);
    });
    $('mGl').innerHTML = `<div class="muted">狙い：${tip}</div>` + (rows.join('') || '<div class="muted">まだ宝石は見つかっていません</div>');
    $('mEnd').textContent = run.endAsk ? 'ほんとうに終える？（取り出した分だけ持ち帰ります）' : '掘り終える';
  }

  // ---- 結果 ----
  function showResult(L) {
    shownN = L.n; window.removeEventListener('keydown', onKey, true); cancelAnimationFrame(raf); run = null;
    const rows = L.out.map((o) => { const m = M.byId(o.id); return `<div class="it">${chip(m)}<span style="flex:1">${m.name}</span><b>${M.QN[o.q]}</b>${M.GOODS[o.id] ? `<span class="muted" style="margin-left:6px">${o.n ? '物資×' + o.n : '物資にならず'}</span>` : ''}</div>`; }).join('');
    openOv().innerHTML = `<div class="mc" style="text-align:center"><div style="font-size:20px;margin:6px">採掘の結果</div>
      <div style="text-align:left;font-size:13px">${rows || '<div class="muted" style="text-align:center">取れた鉱物はありませんでした</div>'}</div>
      <div class="muted" style="margin:8px 0">手数 ${L.hits}${L.bonus ? `　手際のよさで +${SGK.SIM.money(L.bonus)}` : ''}${L.lost.length ? `　取り出せなかった鉱物 ${L.lost.length}個` : ''}</div>
      <div class="row" style="gap:8px"><button class="main" id="mAgain" style="flex:1">もう一度掘る</button><button id="mBag" style="flex:1">鉱石袋</button><button id="mDone" style="flex:1">やめる</button></div></div>`;
    $('mAgain').onclick = () => { close(); SGK.cmd({ type: 'mineStart' }); };
    $('mBag').onclick = () => { close(); panel(); };
    $('mDone').onclick = close;
  }

  // ---- 鉱石袋 ----
  const menuBtn = document.createElement('button'); menuBtn.id = 'mOre'; menuBtn.textContent = '鉱石袋';
  $('mZukan').insertAdjacentElement('afterend', menuBtn);
  function panel() {
    const me = G.priv && G.priv.me; if (!me) return; const ore = me.ore || {};
    let p = $('minePanel'); if (!p) { p = document.createElement('div'); p.id = 'minePanel'; document.body.appendChild(p); }
    const list = M.MIN.filter((m) => ore[m.id] && ore[m.id].some((n) => n));
    p.innerHTML = `<div class="cc"><div class="row" style="justify-content:space-between;align-items:center"><b>鉱石袋</b><button id="opX">閉じる</button></div>
      <div class="muted" style="font-size:12px;margin-top:4px">鉱石は拠点（町・村・城）にいるときに売れます。大きな町は1.2倍。</div>
      <div class="cl">${list.map((m) => { const a = ore[m.id], val = a.reduce((s, n, q) => s + n * m.price * M.QM[q], 0); return `<div class="it"><div>${chip(m)}<b>${m.name}</b><br><span class="muted">${[3, 2, 1, 0].filter((q) => a[q]).map((q) => `${M.QN[q]}×${a[q]}`).join('　')}</span></div><button data-id="${m.id}">売る<br><small>約${SGK.SIM.money(val)}</small></button></div>`; }).join('') || '<div class="muted" style="padding:10px">まだ鉱石を持っていません</div>'}</div></div>`;
    $('opX').onclick = () => p.remove();
    p.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = () => { SGK.cmd({ type: 'oreSell', id: b.dataset.id }); setTimeout(panel, 400); }));
  }
  menuBtn.onclick = () => { $('mClose').click(); panel(); };

  // ---- 鉱石図鑑 ----
  const zb = document.createElement('button'); zb.id = 'mOreZ'; zb.textContent = '鉱石図鑑'; menuBtn.insertAdjacentElement('afterend', zb);
  function zukan() {
    const me = G.priv && G.priv.me; if (!me) return; const Z = me.oreZ || {};
    let p = $('minePanel'); if (!p) { p = document.createElement('div'); p.id = 'minePanel'; document.body.appendChild(p); }
    const got = M.MIN.filter((m) => (Z[m.id] || []).some((n) => n)).length;
    p.innerHTML = `<div class="cc"><div class="row" style="justify-content:space-between;align-items:center"><b>鉱石図鑑</b><span class="muted">${got}/${M.MIN.length}種</span><button id="opX">閉じる</button></div><div class="cl">${M.MIN.map((m) => { const a = Z[m.id]; if (!a || !a.some((n) => n)) return '<div class="it"><b>？？？</b></div>'; const best = [3, 2, 1, 0].find((q) => a[q]); return `<div class="it"><div>${chip(m)}<b>${m.name}</b>　<span class="muted">最高 ${M.QN[best]}</span><br><span style="font-size:12px">${M.DESC[m.id]}</span><br><span class="muted">採取 ${a.reduce((x, y) => x + y, 0)}個（${[3, 2, 1, 0].filter((q) => a[q]).map((q) => M.QN[q] + '×' + a[q]).join('・')}）　無傷の値 約${SGK.SIM.money(m.price * M.QM[3])}</span></div></div>`; }).join('')}</div></div>`;
    $('opX').onclick = () => p.remove();
  }
  zb.onclick = () => { $('mClose').click(); zukan(); };
})();
