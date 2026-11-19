// 2.35.0 農業の画面：自宅タブの「畑」カード（SGK.FARMUI.html）。命令は data-act="farm" data-kind=〇〇（main.js が SIM.commands.farm へ送る）
(function () {
  const SIM = SGK.SIM, UI = (SGK.FARMUI = {});
  const G = window.SGK_G, $ = (id) => document.getElementById(id);
  // 【仮の絵文字】狩りの獲物の見た目。あとで絵（assets/ 以下の画像）に置き換える。置き換えるのは PREY_ICON と drawPrey() だけ
  const PREY_ICON = { rabbit: '🐇', deer: '🦌', boar: '🐗', bear: '🐻' };
  const star = (n, max) => '★'.repeat(n) + '☆'.repeat(max - n);
  UI.herdHtml = (me) => {
    const F = me.farm; let h = `<div class="muted" style="margin-top:8px"><b>家畜</b>　${F.herd.length}／${F.acap}頭　村への寄付 ${SIM.money(F.donated)}${F.devMul > 1 ? `（村の発展 ×${F.devMul}）` : ''}</div>`;
    if (F.herd.length) h += '<div class="card" style="display:block">' + F.herd.map((a) => `<div style="font-size:13px;padding:2px 0">${a.name}・${a.ad ? `<b style="color:#ffe070">育ち切りました</b>` : `あと${a.left}日`}　世話 ${star(a.care, 4)}　<span class="muted">売値 ${SIM.money(a.val)}</span></div>`).join('') + '</div>';
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">' + F.animals.map((a) => `<button id="an-buy-${a.id}" data-act="animal" data-kind="buy" data-id="${a.id}" ${F.herd.length < F.acap && me.money >= a.cost ? '' : 'disabled'}>${a.name}を迎える（${SIM.money(a.cost)}・${a.days}日）</button>`).join('')
      + `<button id="an-feed" data-act="animal" data-kind="feed" ${F.herd.some((a) => a.can) ? '' : 'disabled'}>世話をする（${F.herd.filter((a) => a.can).length}頭）</button></div>`;
    const ad = (id) => F.herd.filter((a) => a.k === id && a.ad).length;
    h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">' + F.animals.map((a) => `<button id="an-sell-${a.id}" data-act="animal" data-kind="sell" data-id="${a.id}" ${ad(a.id) ? '' : 'disabled'}>${a.name}を売る（${ad(a.id)}頭）</button><button id="an-don-${a.id}" data-act="animal" data-kind="donate" data-id="${a.id}" ${ad(a.id) ? '' : 'disabled'}>${a.name}を村に寄付</button>`).join('') + '</div>';
    return h;
  };
  UI.html = (me) => {
    const F = me.farm; if (!F) return '';
    const hp = me.hpFrac == null ? 1 : me.hpFrac, tired = hp < 0.15;
    const ripe = F.fields.filter((f) => f.st === 'ripe').length, empty = F.fields.filter((f) => f.st === 'empty').length, can = F.fields.filter((f) => f.can).length;
    let h = '<div class="muted" style="margin-top:8px"><b>畑</b>　<span>' + F.m + '月</span></div>';
    h += `<div class="card" style="display:block"><b>${F.fields.length}／${F.max}枚</b>　道具：${F.tool}　水路：${F.suiro}<br>`
      + `<span class="muted">体力 ${Math.round(hp * 100)}%　村の発展 ${F.dev}${F.pop != null ? `　村の人口 ${F.pop}` : ''}　収穫した合計 ${F.made}${F.hv ? `　<b style="color:${F.hv === '豊作' ? '#9be08a' : '#e07a6a'}">この秋は${F.hv}</b>` : ''}</span></div>`;
    if (F.fields.length) {
      h += '<div class="card" style="display:block">' + F.fields.map((f, i) => {
        const t = f.st === 'empty' ? '<span class="muted">空き</span>' : f.st === 'ripe' ? `<b style="color:#ffe070">${f.c}・収穫できます</b>` : `${f.c}・あと${f.left}日　手入れ ${star(f.care, 4)}${f.can ? ' <span style="color:#9be08a">（手入れできます）</span>' : ''}`;
        return `<div style="font-size:13px;padding:2px 0">${i + 1}. ${t}${f.dmg ? ' <span style="color:#e07a6a">（台風で傷んだ）</span>' : ''}</div>`;
      }).join('') + '</div>';
    }
    h += `<div class="row" style="flex-wrap:wrap;gap:6px"><button id="fm-kai" data-act="farm" data-kind="kai" ${F.fields.length >= F.max || tired ? 'disabled' : ''}>開墾する（体力${F.kai}%）</button>`
      + `<button id="fm-tend" data-act="farm" data-kind="tend" ${can && !tired ? '' : 'disabled'}>手入れ（${can}枚）</button>`
      + `<button id="fm-reap" data-act="farm" data-kind="reap" ${ripe && !tired ? '' : 'disabled'}>収穫（${ripe}枚）</button></div>`;
    h += '<div class="muted" style="margin-top:6px">空いている畑に植える（種代は1枚ごと）</div><div class="row" style="flex-wrap:wrap;gap:6px">'
      + F.crops.map((c) => `<button id="fm-sow-${c.id}" data-act="farm" data-kind="sow" data-id="${c.id}" ${c.ok && empty && me.money >= c.seed ? '' : 'disabled'}>${c.name}（${SIM.money(c.seed)}・${c.months[0]}〜${c.months[c.months.length - 1]}月・${c.days}日）</button>`).join('') + '</div>';
    h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">'
      + (F.nt ? `<button id="fm-tool" data-act="farm" data-kind="tool" ${me.money >= F.nt.cost ? '' : 'disabled'}>${F.nt.name}にする（${SIM.money(F.nt.cost)}）</button>` : '')
      + (F.ns ? `<button id="fm-suiro" data-act="farm" data-kind="suiro" ${me.money >= F.ns.cost ? '' : 'disabled'}>${F.ns.name}（${SIM.money(F.ns.cost)}・畑${F.ns.max}枚まで）</button>` : '') + '</div>';
    h += UI.herdHtml(me);
    h += '<div class="muted">収穫は物置に入ります。収穫が増えるほど村がにぎわい、人口と米の産出が増えます</div>';
    return h;
  };

  // ---- 狩猟：森の中で、現れた獲物を素早くタップして射る（反射神経）。結果は命令 huntEnd で送る ----
  const css = document.createElement('style');
  css.textContent = '#huntOv{position:fixed;inset:0;z-index:93;background:rgba(10,14,20,.9);display:flex;align-items:center;justify-content:center}#huntOv .hc{width:min(96vw,460px);background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0;text-align:center}';
  document.head.appendChild(css);
  const FM = () => SIM.FARM;
  let ov = null, raf = 0, doneN = 0, run = null;
  function close(send) { if (run && send !== false) SGK.cmd({ type: 'huntEnd', n: run.n, res: run.res }); cancelAnimationFrame(raf); if (ov) ov.remove(); ov = null; run = null; }
  // 獲物を描く：ここを絵に置き換える（仮は絵文字）
  function drawPrey(ctx, k, x, y, hit) { ctx.font = '56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = hit ? 0.5 : 1; ctx.fillText(PREY_ICON[k], x, y); ctx.globalAlpha = 1; }
  function startHunt(n) {
    if (ov) return; const W = 400, H = 300, P = FM().PREY, N = FM().huntN, keys = Object.keys(P), tw = keys.reduce((a, k) => a + P[k].w, 0);
    run = { n, res: {}, i: 0, cur: null, next: performance.now() + 900, hits: 0, arrows: [], msg: '' };
    ov = document.createElement('div'); ov.id = 'huntOv';
    ov.innerHTML = `<div class="hc"><b>狩り</b><div class="muted" style="margin:2px 0">現れた獲物をすばやくタップして射よう（熊は2回）。${N}回出ます</div><canvas id="hcv" width="${W}" height="${H}" style="width:100%;border-radius:8px;touch-action:none;display:block"></canvas><div id="hmsg" style="min-height:22px;margin:6px 0"></div><button id="hcancel">やめる</button></div>`;
    document.body.appendChild(ov);
    const cv = $('hcv'), ctx = cv.getContext('2d');
    const pick = () => { let r = Math.random() * tw; for (const k of keys) { r -= P[k].w; if (r < 0) return k; } return keys[0]; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (!run) return; const rc = cv.getBoundingClientRect(), x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
      run.arrows.push({ x, y, t: performance.now() });
      const c = run.cur; if (!c || c.dead || Math.hypot(x - c.x, y - c.y) > 38) return;
      c.hp--; c.hitAt = performance.now();
      if (c.hp <= 0) { c.dead = true; run.res[c.k] = (run.res[c.k] || 0) + 1; run.hits++; $('hmsg').textContent = `${P[c.k].name}を仕留めた！`; c.until = performance.now() + 250; }
    });
    $('hcancel').onclick = () => close(true);
    const loop = () => {
      if (!run) return; const now = performance.now();
      // 背景（森）
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2f5a2a'); g.addColorStop(1, '#1d3a1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 8; i++) { ctx.fillRect(20 + i * 52, 0, 10, H); }
      const c = run.cur;
      if (c && now > c.until) { if (!c.dead) $('hmsg').textContent = `${P[c.k].name}に逃げられた……`; run.cur = null; run.next = now + 350 + Math.random() * 700; }
      if (!run.cur && now >= run.next) {
        if (run.i >= N) { $('hmsg').textContent = `おしまい！　仕留めた数：${run.hits}`; const r = run; setTimeout(() => { if (run === r) close(true); }, 1000); run.next = Infinity; }
        else { const k = pick(), sp = P[k]; run.i++; run.cur = { k, hp: sp.hp, x: 50 + Math.random() * (W - 100), y: 60 + Math.random() * (H - 120), until: now + sp.t * 1000 * Math.max(0.6, 1 - run.i * 0.03) }; }
      }
      if (run.cur) drawPrey(ctx, run.cur.k, run.cur.x, run.cur.y, run.cur.dead || (run.cur.hitAt && now - run.cur.hitAt < 120));
      for (const a of run.arrows) if (now - a.t < 200) { ctx.strokeStyle = '#f3e9d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, H); ctx.lineTo(a.x, a.y); ctx.stroke(); }
      run.arrows = run.arrows.filter((a) => now - a.t < 200);
      ctx.fillStyle = '#f3e9d0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`${Math.min(run.i, N)}／${N}　仕留めた ${run.hits}`, 8, 6);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  // 森にいるとき、地図の下に「狩りをする」ボタン（薪集めのボタンの上）
  const box = document.createElement('div'); box.className = 'hidden'; box.style.cssText = 'position:fixed;left:10px;bottom:146px;z-index:6';
  box.innerHTML = '<button id="hbGo" style="padding:8px 12px;font-size:14px">狩りをする</button>';
  document.body.appendChild(box);
  setInterval(() => {
    const P = G.priv, me = P && P.me, sp = me && !P.battle && G.mode !== 'title' && me.woodSpot;
    const anyOpen = ['town', 'char', 'info', 'gameMenu'].some((i) => $(i) && !$(i).classList.contains('hidden')), mineOn = !!(me && me.mineSpot);
    box.classList.toggle('hidden', !sp || anyOpen || ov || mineOn);
    if (sp) { const hp = me.hpFrac == null ? 1 : me.hpFrac; $('hbGo').textContent = `狩りをする（体力${Math.round(FM().huntCost * 100)}%）`; $('hbGo').disabled = hp < FM().huntMin; }
    if (me && me.farm && me.farm.hunt && !ov && me.farm.hunt.n !== doneN) { doneN = me.farm.hunt.n; startHunt(me.farm.hunt.n); }
  }, 200);
  $('hbGo').onclick = () => SGK.cmd({ type: 'huntStart' });
})();
