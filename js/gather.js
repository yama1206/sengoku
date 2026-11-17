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
  #gatherOv .gc{width:min(92vw,420px);background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:16px;text-align:center;color:#f3e9d0}
  #gatherOv .big{font-size:42px;margin:6px 0}
  #gatherOv .bar{position:relative;height:34px;background:#3b3a36;border-radius:6px;margin:14px 0;overflow:hidden}
  #gatherOv .zone{position:absolute;top:0;bottom:0;background:rgba(111,191,115,.75)}
  #gatherOv .mk{position:absolute;top:-2px;bottom:-2px;width:6px;margin-left:-3px;background:#fff;border-radius:3px}
  #gatherOv button.main{width:100%;padding:16px;font-size:20px;margin-top:6px}
  #creatPanel{position:fixed;inset:0;z-index:80;background:rgba(10,14,20,.86);display:flex;align-items:center;justify-content:center}
  #creatPanel .cc{width:min(96vw,520px);max-height:90vh;background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0;display:flex;flex-direction:column}
  #creatPanel .cl{overflow-y:auto;margin-top:8px}
  #creatPanel .it{border-bottom:1px solid rgba(255,255,255,.1);padding:6px 2px;font-size:13px}
  #creatPanel .it.no{opacity:.5}`;
  document.head.appendChild(css);

  const box = document.createElement('div'); box.id = 'gatherBox'; box.className = 'hidden';
  box.innerHTML = '<small id="gbTag"></small><div class="row" style="gap:6px"><button id="gbFish" class="hidden">釣りをする</button><button id="gbBug" class="hidden">虫を捕る</button></div>';
  document.body.appendChild(box);
  const DF = () => D.gatherDiff;
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
  function close() { if (ov) ov.remove(); ov = null; run = null; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); }
  let raf = 0;
  function onKey(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (run && run.tap) run.tap(); } if (e.key === 'Escape') { e.stopPropagation(); cancel(); } }
  function cancel() { if (run) { SGK.cmd({ type: 'gatherEnd', n: run.g.n, q: -1 }); doneN = shownN = run.g.n; } close(); }
  function startPlay(g) {
    const fish = g.k === 'f', df = DF()[g.d] || DF().普通;
    run = { g, phase: 'wait', tap: null }; shownN = g.n - 1; window.addEventListener('keydown', onKey, true);
    open(`<div class="big">${SGK.ICON.html(fish ? 'rod' : 'net', 72)}</div><div id="gmsg">${fish ? 'ウキを見つめている…' : 'そっと近づく…'}</div><div style="margin-top:10px"><button id="gcancel">やめる</button></div>`);
    $('gcancel').onclick = cancel;
    const wait = (fish ? 1800 : 1000) + Math.random() * 2600;
    setTimeout(() => { if (!run || run.g !== g) return; fish ? hit() : bar(); }, wait);
    function hit() { // 釣り：アタリ！ 早めに押す
      run.phase = 'hit'; let t0 = performance.now();
      open('<div class="big">' + SGK.ICON.html('bite', 72) + '</div><div style="font-size:22px">アタリ！</div><button class="main" id="gpull">引け！</button>');
      const go = () => { if (run.phase !== 'hit') return; run.phase = 'bar'; bar(); }; run.tap = go; $('gpull').onclick = go;
      run.to = setTimeout(() => { if (run && run.phase === 'hit') { run.phase = 'done'; finish(0); } }, df.react);
    }
    function bar() { // 棒の上を動く印を、緑の所で止める
      clearTimeout(run.to); run.phase = 'bar';
      const hw = 0.5 * (1 - df.thr), c = hw + 0.05 + Math.random() * (1 - 2 * hw - 0.1);
      open(`<div style="font-size:18px">${fish ? '魚が暴れている！ 緑の所で引き上げろ' : '網を振るなら、緑の所で！'}</div><div class="bar"><div class="zone" style="left:${(c - hw) * 100}%;width:${hw * 200}%"></div><div class="mk" id="gmk"></div></div><button class="main" id="gtap">${fish ? '引き上げる！' : '捕まえる！'}</button>`);
      let pos = 0, dir = 1, last = performance.now();
      const step = (now) => { const dt = (now - last) / 1000; last = now; pos += dir * df.spd * dt; if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; } const m = $('gmk'); if (m) m.style.left = pos * 100 + '%'; raf = requestAnimationFrame(step); };
      raf = requestAnimationFrame(step);
      const tap = () => { if (run.phase !== 'bar') return; run.phase = 'done'; cancelAnimationFrame(raf); finish(Math.max(0, 1 - Math.abs(pos - c) / 0.5)); };
      run.tap = tap; $('gtap').onclick = tap;
    }
    function finish(q) { open('<div class="big">…</div>'); doneN = g.n; SGK.cmd({ type: 'gatherEnd', n: g.n, q }); run.phase = 'wait'; }
  }
  function showResult(L) {
    shownN = L.n; const ok = L.ok, c = L.id && D.creatures.find((x) => x.id === L.id);
    window.removeEventListener('keydown', onKey, true); cancelAnimationFrame(raf); run = null;
    open(`<div class="big">${SGK.ICON.html(ok ? (L.k === 'f' ? 'fish' : 'bug') : 'miss', 72)}</div><div style="font-size:20px">${L.txt}</div>`
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
      <div class="cl">${list.map((c) => { const z = Z[c.id]; return z && z[0] ? `<div class="it"><b>${c.n}</b>　<span class="muted">${c.r}</span><br>取った数 ${z[0]}　最大 ${z[1]}${unitOf(c)}　（${c.sz[0]}〜${c.sz[1]}${unitOf(c)}）　基本 ${c.p}文<br><span class="muted">${c.pl.join('・')}／${c.rgT}／${c.m[0]}〜${c.m[1]}月／${c.t.join('・')}</span></div>` : '<div class="it no"><b>？？？</b></div>'; }).join('')}</div></div>`;
    $('cpX').onclick = () => p.remove(); $('cpF').onclick = () => { ctab = 'f'; panel(); }; $('cpB').onclick = () => { ctab = 'b'; panel(); };
  }
  menuBtn.onclick = () => { $('mClose').click(); panel(); };
})();
