// 2.29.0 鍛冶の画面：自宅タブの「作業場」カード（SGK.SMITHUI.html）と、槌を打つミニゲーム（SGK.SMITHUI.open）
// ミニゲーム：左右に動く印が「ちょうどいい所」にあるとき打つ。5回のうち成功した数が多いほど良い物が出やすい（飛ばして作ることもできる）
// 操作：タップ／クリック・Space・Enter・コントローラーのA＝打つ、Esc・コントローラーのB＝やめる
(function () {
  const $ = (id) => document.getElementById(id), G = window.SGK_G, SIM = SGK.SIM;
  const UI = (SGK.SMITHUI = {});
  const css = document.createElement('style');
  css.textContent = `
  #smithOv{position:fixed;inset:0;z-index:93;background:rgba(10,14,20,.9);display:flex;align-items:center;justify-content:center}
  #smithOv .sc{width:min(94vw,460px);background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0}
  #smithOv .bar{position:relative;height:38px;margin:14px 0;background:#1a1713;border:2px solid #5a4526;border-radius:6px;overflow:hidden}
  #smithOv .zn{position:absolute;top:0;bottom:0;background:rgba(232,196,106,.45);border-left:2px solid #e8c46a;border-right:2px solid #e8c46a}
  #smithOv .mk{position:absolute;top:0;bottom:0;width:6px;margin-left:-3px;background:#ff8a4a;box-shadow:0 0 8px #ff8a4a}
  #smithOv .dots{display:flex;gap:6px;justify-content:center;font-size:20px;min-height:26px}
  #smithOv button{padding:12px;font-size:16px}`;
  document.head.appendChild(css);
  const pct = (v) => `${Math.round(v * 100)}%`;

  // ---- 自宅タブの作業場カード ----
  UI.html = (me) => {
    const S = me.smith, IT = SGK.DATA.items; if (!S) return '';
    const qn = SIM.SMITH.QN;
    let h = '<div class="muted" style="margin-top:8px"><b>作業場</b></div>';
    if (S.lv < 1) {
      h += `<div class="card"><div><b>作業場を建てる</b><br><span class="muted">自宅で鍛冶ができるようになります。鉄鉱石などから武器・防具を作れます（最初は粗末な物ばかり。腕と設備が上がると良い物が出ます）</span></div>`
        + `<button id="sm-build" data-act="smith" data-kind="build" ${me.money >= S.next.cost ? '' : 'disabled'}>建てる（${SIM.money(S.next.cost)}）</button></div>`;
      return h;
    }
    const dist = (d) => d.map((v, j) => `${qn[j]}${pct(v)}`).join('　');
    h += `<div class="card" style="display:block"><b>${S.fac}</b>　腕：<b>${S.armName}</b>${S.nextExp != null ? `<span class="muted">（経験 ${S.exp}／次 ${S.nextExp}）</span>` : ''}<br>`
      + `<span class="muted">作れる品質の上限：<b style="color:#ffe070">${S.capName}</b>（腕と設備の低いほう）</span><br>`
      + `<span class="muted">出やすさ　そのまま：${dist(S.d0)}<br>　　　　　　ミニゲーム全成功：${dist(S.d5)}</span>`
      + (S.next ? `<div class="row" style="margin-top:6px"><button id="sm-build" data-act="smith" data-kind="build" ${me.money >= S.next.cost ? '' : 'disabled'}>${S.next.name}に広げる（${SIM.money(S.next.cost)}）</button><span class="muted">設備の上限：${S.next.cap}</span></div>` : '<div class="muted">設備は最高です</div>')
      + '</div>';
    if (S.last) h += `<div class="muted">さっき作った物：<b>${S.last.name}</b></div>`;
    for (const r of S.rec) {
      const okArm = S.arm >= r.arm, okMat = r.need.every(([, n, hv]) => hv >= n), ok = okArm && okMat;
      const mat = r.need.map(([k, n, hv]) => `<span style="${hv >= n ? '' : 'color:#e07a6a'}">${IT[k].name}${n}（${hv}）</span>`).join('　');
      h += `<div class="card"><div><b>${r.name}</b>　<span class="muted">${r.slot === 'arm' ? '防具' : '武器'}${okArm ? '' : `　<span style="color:#e07a6a">腕：${SIM.SMITH.ARM_NAME[r.arm]}から</span>`}<br>${mat}</span></div>`
        + `<div class="row" style="flex-direction:column;gap:4px"><button id="sm-play-${r.id}" data-act="smithPlay" data-id="${r.id}" ${ok ? '' : 'disabled'}>打つ</button><button id="sm-fast-${r.id}" data-act="smith" data-kind="craft" data-id="${r.id}" ${ok ? '' : 'disabled'}>そのまま作る</button></div></div>`;
    }
    return h;
  };

  // ---- ミニゲーム ----
  let ov = null, raf = 0, st = null;
  const N = () => SIM.SMITH.STRIKES;
  function close() { if (ov) ov.remove(); ov = null; st = null; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); }
  function newZone() { const w = 0.2 - st.i * 0.02; st.zw = w; st.zc = 0.15 + Math.random() * 0.7; }
  function draw() {
    if (!ov) return;
    const t = (performance.now() - st.t0) / 1000, sp = 0.9 + st.i * 0.25, ph = (t * sp) % 2, pos = ph < 1 ? ph : 2 - ph;
    st.pos = pos;
    $('smMk').style.left = pct(pos); const z = $('smZn'); z.style.left = pct(st.zc - st.zw / 2); z.style.width = pct(st.zw);
    raf = requestAnimationFrame(draw); pad();
  }
  function strike() {
    if (!st || st.done) return;
    const hit = Math.abs(st.pos - st.zc) <= st.zw / 2; st.res.push(hit); if (hit) st.hits++;
    st.i++; $('smDots').textContent = Array.from({ length: N() }, (_, k) => (k < st.res.length ? (st.res[k] ? '🔥' : '✕') : '・')).join(' ');
    $('smMsg').textContent = hit ? 'いい音だ！' : 'ずれた……';
    if (st.i >= N()) { st.done = true; const id = st.id, hits = st.hits; $('smGo').disabled = true; $('smMsg').textContent = `成功 ${hits}／${N()}`; setTimeout(() => { close(); SGK.cmd({ type: 'smith', kind: 'craft', id, qty: hits }); }, 700); }
    else newZone();
  }
  const onKey = (e) => {
    if (!ov) return; e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) strike(); }
  };
  let prevA = false, prevB = false;
  function pad() {
    const ps = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [], gp = ps[0]; if (!gp) return;
    const a = !!(gp.buttons[0] && gp.buttons[0].pressed), b = !!(gp.buttons[1] && gp.buttons[1].pressed);
    if (a && !prevA) strike(); if (b && !prevB) close(); prevA = a; prevB = b;
  }
  UI.open = (id, me) => {
    const r = me && me.smith && me.smith.rec.find((x) => x.id === id); if (!r || ov) return;
    st = { id, i: 0, hits: 0, res: [], t0: performance.now(), done: false }; newZone();
    ov = document.createElement('div'); ov.id = 'smithOv';
    ov.innerHTML = `<div class="sc"><b>鍛冶：${r.name}</b><div class="muted" style="margin-top:4px">印が明るい帯に入ったときに打つ（${N()}回）。成功が多いほど良い物が出やすい</div>`
      + `<div class="bar"><div class="zn" id="smZn"></div><div class="mk" id="smMk"></div></div><div class="dots" id="smDots">${Array.from({ length: N() }, () => '・').join(' ')}</div>`
      + `<div class="muted" id="smMsg" style="text-align:center;min-height:20px"></div><div class="row" style="gap:8px;margin-top:6px"><button id="smGo" class="main" style="flex:1">打つ！</button><button id="smCancel">やめる</button></div></div>`;
    document.body.appendChild(ov);
    $('smGo').onclick = strike; $('smCancel').onclick = close;
    window.addEventListener('keydown', onKey, true); prevA = prevB = true; raf = requestAnimationFrame(draw);
  };
})();
