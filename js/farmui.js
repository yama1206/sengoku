// 2.35.0 農業の画面：自宅タブの「畑」カード（SGK.FARMUI.html）。命令は data-act="farm" data-kind=〇〇（main.js が SIM.commands.farm へ送る）
// 2.56.0 作り直し：畑を1枚ずつ絵で並べ、タップで世話する（上で「おまかせ」「肥やし」「種」を選ぶ）。家畜は1頭ずつ、満腹・なつき・世話を見せる
(function () {
  const SIM = SGK.SIM, UI = (SGK.FARMUI = {});
  const G = window.SGK_G, $ = (id) => document.getElementById(id);
  // 2.54.0 狩りの獲物の絵（assets/icons/prey_〇〇.png）。PREY_ICON の絵文字は絵が読めないときの代わり
  const PREY_ICON = { rabbit: '🐇', deer: '🦌', boar: '🐗', bear: '🐻' };
  // 2.56.0 畑と家畜の絵（assets/icons）。[絵の名前, 絵が読めないときの絵文字]
  const CROP_IC = { rice: ['rice', '🌾'], mugi: ['mugi', '🌾'], daizu: ['daizu', '🫘'], daikon: ['daikon', '🥬'], cotton: ['cotton', '☁️'], tea: ['tea2', '🍵'] };
  const ISS_IC = { kusa: ['weed', '🌿'], mushi: ['bug', '🐛'], kawaki: ['drop', '💧'] };
  const AN_IC = { hen: ['hen', '🐔'], cow: ['cow', '🐄'], horse: ['horse', '🐎'] };
  const ic = (a, px) => SGK.ICON.fb(a[0], px, a[1]);
  const star = (n, max) => '★'.repeat(n) + '☆'.repeat(max - n);
  const bar = (v, col) => `<span class="fmBar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${col}"></i></span>`;
  UI.mode = 'auto'; // 畑をタップしたときにすること（auto＝おまかせ・koe＝肥やし・作物の名前＝その種を植える）
  const css = document.createElement('style');
  css.textContent = `.fmGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:6px;margin:6px 0}
.fmT{position:relative;aspect-ratio:1;padding:0;border-radius:9px;border:2px solid #5a4126;overflow:hidden;cursor:pointer;color:#f3e9d0;font-size:11px;
background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 3px,transparent 3px 11px),var(--soil)}
.fmT:hover{filter:brightness(1.12)}.fmT.ripe{border-color:#ffd25a;box-shadow:0 0 10px rgba(255,210,90,.6) inset}.fmT.ripe .cr{animation:fmBob 1.4s ease-in-out infinite}
.fmT.iss{border-color:#e07a6a}.fmT .no{position:absolute;left:4px;top:2px;opacity:.75}.fmT .cr{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);line-height:0}
.fmT .is{position:absolute;right:2px;top:2px;line-height:0;animation:fmPulse 1s ease-in-out infinite alternate}.fmT .lb{position:absolute;left:0;right:0;bottom:9px;text-align:center;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden}
.fmT .pg{position:absolute;left:5px;right:5px;bottom:4px;height:4px;border-radius:2px;background:rgba(0,0,0,.4)}.fmT .pg i{display:block;height:100%;border-radius:2px;background:#9be08a}.fmT.ripe .pg i{background:#ffd25a}
.fmT .dm{position:absolute;left:3px;bottom:14px;font-size:10px;color:#ffb0a0}
@keyframes fmBob{50%{transform:translate(-50%,-58%)}}@keyframes fmPulse{to{transform:scale(1.18)}}
.fmChips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.fmChips button{padding:3px 8px;font-size:12px;border-radius:14px;opacity:.75}.fmChips button.on{opacity:1;outline:2px solid #ffd25a}
.fmBar{display:inline-block;width:54px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;vertical-align:middle}.fmBar i{display:block;height:100%}
.fmAn{display:flex;gap:8px;align-items:center}.fmAn .pic{flex:0 0 auto;width:56px;text-align:center;line-height:0}.fmAn .tx{flex:1;font-size:12px;line-height:1.6}.fmAn .bt{display:flex;flex-direction:column;gap:3px}.fmAn .bt button{padding:3px 8px;font-size:12px}
.fmAn.hun{border-color:#e07a6a}`;
  document.head.appendChild(css);
  const soilBg = (s) => { const l = 30 - s * 0.14; return `linear-gradient(160deg,hsl(28,38%,${l + 6}%),hsl(25,40%,${l}%))`; };
  // タップのしかたを選ぶ（画面だけの選択。描き直しを待たずに、その場で畑のボタンへ反映する）
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fmode]'); if (!b) return;
    UI.mode = b.dataset.fmode;
    document.querySelectorAll('[data-fmode]').forEach((x) => x.classList.toggle('on', x.dataset.fmode === UI.mode));
    document.querySelectorAll('.fmT').forEach((x) => (x.dataset.item = UI.mode));
  });

  UI.herdHtml = (me) => {
    const F = me.farm;
    let h = `<div class="secH" style="margin-top:10px">家畜　<span class="muted" style="font-weight:normal">${F.herd.length}／${F.acap}頭　餌 ${F.esa}　卵 ${F.egg}　肥やし ${F.koe}</span></div>`;
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">'
      + `<button id="an-grass" data-act="animal" data-kind="grass">草を刈る（餌+8・体力5%）</button>`
      + F.grain.map((g) => `<button id="an-gr-${g.k}" data-act="animal" data-kind="grain" data-item="${g.k}">物置の${g.name}を餌に（+${g.esa}・${g.n}俵）</button>`).join('')
      + `<button id="an-feed" data-act="animal" data-kind="feed" ${F.herd.some((a) => a.full < 90) && F.esa ? '' : 'disabled'}>餌をやる（${F.herd.filter((a) => a.full < 90).length}頭）</button>`
      + `<button id="an-egg" data-act="animal" data-kind="egg" ${F.egg ? '' : 'disabled'}>${SGK.ICON.fb('egg', 16, '🥚')} 卵を集める（${F.egg}）</button></div>`;
    for (const a of F.herd) {
      const px = a.ad ? 52 : 34 + Math.round(a.prog * 14), hun = a.full <= 20;
      h += `<div class="card fmAn${hun ? ' hun' : ''}"><div class="pic">${ic(AN_IC[a.k], px)}</div><div class="tx"><b>${a.nm}</b>　<span class="muted">${a.name}・${a.ad ? '<span style="color:#ffe070">育った</span>' : `子（あと${a.left}日）`}　世話 ${star(a.care, 4)}</span><br>`
        + `満腹 ${bar(a.full, a.full > 40 ? '#e0a050' : '#e07a6a')} ${a.full}${hun ? ' <span style="color:#e07a6a">お腹がすいている</span>' : ''}　なつき ${bar(a.nat, '#f08fb0')} ${a.nat}<br><span class="muted">${a.ad ? `売値 ${SIM.money(a.val)}` : '育つと売れる'}${a.k === 'hen' && a.ad ? '・卵を産む' : a.k !== 'hen' && a.ad ? '・肥やしを出す' : ''}</span></div>`
        + `<div class="bt"><button id="an-pet-${a.i}" data-act="animal" data-kind="pet" data-id="${a.i}" ${a.pet ? '' : 'disabled'}>${a.pet ? 'なでる' : 'なでた'}</button>`
        + (a.ad && a.k === 'horse' ? `<button id="an-ride-${a.i}" data-act="animal" data-kind="ride" data-id="${a.i}">乗り馬にする</button>` : '')
        + (a.ad ? `<button id="an-s1-${a.i}" data-act="animal" data-kind="sell" data-id="${a.k}" data-item="${a.i}">売る</button>` : '') + '</div></div>';
    }
    h += '<div class="row" style="flex-wrap:wrap;gap:6px">' + F.animals.map((a) => `<button id="an-buy-${a.id}" data-act="animal" data-kind="buy" data-id="${a.id}" ${F.herd.length < F.acap && me.money >= a.cost ? '' : 'disabled'}>${ic(AN_IC[a.id], 16)} ${a.name}の子を迎える（${SIM.money(a.cost)}・${a.days}日）</button>`).join('') + '</div>';
    const ad = (id) => F.herd.filter((a) => a.k === id && a.ad).length;
    h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px">' + F.animals.filter((a) => ad(a.id)).map((a) => `<button id="an-br-${a.id}" data-act="animal" data-kind="breed" data-id="${a.id}" ${ad(a.id) >= 2 && !a.breed && F.herd.length < F.acap ? '' : 'disabled'}>${a.name}の子を産ませる${a.breed ? `（あと${a.breed}日）` : ''}</button><button id="an-sell-${a.id}" data-act="animal" data-kind="sell" data-id="${a.id}">育った${a.name}を全部売る（${ad(a.id)}頭）</button><button id="an-don-${a.id}" data-act="animal" data-kind="donate" data-id="${a.id}">${a.name}を村に寄付</button>`).join('') + '</div>';
    h += `<div class="muted">家畜は毎日お腹がすく（1回の餌：鶏${F.animals[0].esa}・牛${F.animals[1].esa}・馬${F.animals[2].esa}）。腹ぺこだと育たず、なつきが減る。毎日なでるとなつく。育った2頭がなついていれば子が生まれる（30日に1度）。育った牛がいると開墾が楽になる</div>`;
    return h;
  };
  const SEASON = (m) => (m >= 3 && m <= 5 ? '春' : m >= 6 && m <= 8 ? '夏' : m >= 9 && m <= 11 ? '秋' : '冬');
  UI.html = (me) => {
    const F = me.farm; if (!F) return '';
    const hp = me.hpFrac == null ? 1 : me.hpFrac, tired = hp < 0.15;
    const ripe = F.fields.filter((f) => f.st === 'ripe').length, empty = F.fields.filter((f) => f.st === 'empty').length;
    const need = F.fields.filter((f) => f.st === 'grow' && (f.iss || f.can)).length, issN = F.fields.filter((f) => f.iss).length;
    if (UI.mode !== 'auto' && UI.mode !== 'koe' && !F.crops.some((c) => c.id === UI.mode && c.ok)) UI.mode = 'auto';
    let h = `<div class="secH" style="margin-top:8px">畑　<span class="muted" style="font-weight:normal">${F.m}月・${SEASON(F.m)}${F.wet ? '（雨で畑がうるおっている）' : ''}</span></div>`;
    h += `<div class="muted">${F.fields.length}／${F.max}枚　道具：${F.tool}　水路：${F.suiro}　体力 ${Math.round(hp * 100)}%　村の発展 ${F.dev}${F.pop != null ? `　村の人口 ${F.pop}` : ''}　収穫した合計 ${F.made}${F.hv ? `　<b style="color:${F.hv === '豊作' ? '#9be08a' : '#e07a6a'}">この秋は${F.hv}</b>` : ''}</div>`;
    // タップのしかた
    h += '<div class="fmChips">' + `<button data-fmode="auto" class="${UI.mode === 'auto' ? 'on' : ''}">おまかせ（収穫・草取り・虫取り・水やり・手入れ）</button>`
      + `<button data-fmode="koe" class="${UI.mode === 'koe' ? 'on' : ''}">${SGK.ICON.fb('koe', 16, '🧺')} 肥やし（${F.koe}）</button>`
      + F.crops.map((c) => (c.ok ? `<button data-fmode="${c.id}" class="${UI.mode === c.id ? 'on' : ''}">${ic(CROP_IC[c.id], 16)} ${c.name}を植える（${SIM.money(c.seed)}）</button>` : '')).join('') + '</div>';
    if (F.fields.length) {
      h += '<div class="fmGrid">' + F.fields.map((f, i) => {
        const px = f.stage < 0 ? 0 : [26, 34, 42, 50][f.stage];
        const crop = f.stage < 0 ? '' : f.stage === 0 ? SGK.ICON.fb('sprout', px, '🌱') : ic(CROP_IC[f.k], px);
        const lb = f.st === 'empty' ? '空き' : f.st === 'ripe' ? `${f.c}・収穫！` : `${f.c}・あと${f.left}日`;
        const tip = `${i + 1}枚目　土の肥え ${f.soil}${f.c ? `　出来 ${f.q}　手入れ ${star(f.care, 4)}` : ''}${f.issName ? `　${f.issName}が出ている` : ''}${f.can ? '　手入れできる' : ''}`;
        return `<button class="fmT${f.st === 'ripe' ? ' ripe' : ''}${f.iss ? ' iss' : ''}" style="--soil:${soilBg(f.soil)}" title="${tip}" data-act="farm" data-kind="tap" data-id="${i}" data-item="${UI.mode}">`
          + `<span class="no">${i + 1}</span>${crop ? `<span class="cr">${crop}</span>` : ''}${f.iss ? `<span class="is">${ic(ISS_IC[f.iss], 22)}</span>` : f.can ? '<span class="is" style="font-size:11px;line-height:1;color:#9be08a">手入れ</span>' : ''}`
          + `${f.dmg ? '<span class="dm">傷み</span>' : ''}<span class="lb">${lb}</span>${f.c ? `<span class="pg"><i style="width:${Math.round(f.prog * 100)}%"></i></span>` : ''}</button>`;
      }).join('') + '</div>';
      h += `<div class="muted">${SGK.HINT.txt('畑を[[タップ|クリック|タップ]]すると、上で選んだことをします。')}土の色が濃いほど肥えている（肥えた畑ほど多く取れる。収穫すると痩せ、大豆は土を肥やす）。${issN ? `<b style="color:#e07a6a">草・虫・乾きの出ている畑が${issN}枚</b>（放っておくと育ちが止まり、出来が落ちる）` : '草・虫・乾きが出たら片づけよう'}</div>`;
    } else h += '<div class="muted">まだ畑がありません。荒れ地を開墾しましょう</div>';
    h += `<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:4px"><button id="fm-kai" data-act="farm" data-kind="kai" ${F.fields.length >= F.max || tired ? 'disabled' : ''}>開墾する（体力${F.kai}%）</button>`
      + `<button id="fm-tend" data-act="farm" data-kind="tend" ${need && !tired ? '' : 'disabled'}>見回る（${need}枚）</button>`
      + `<button id="fm-reap" data-act="farm" data-kind="reap" ${ripe && !tired ? '' : 'disabled'}>全部収穫（${ripe}枚）</button>`
      + `<button id="fm-koe" data-act="farm" data-kind="koe" ${F.koe && F.fields.some((f) => f.soil < 100) ? '' : 'disabled'}>痩せた畑に肥やし</button>`
      + `<button id="fm-hoshika" data-act="farm" data-kind="hoshika" ${me.money >= F.hoshika.cost ? '' : 'disabled'}>干鰯を買う（肥やし${F.hoshika.n}・${SIM.money(F.hoshika.cost)}）</button></div>`;
    h += '<div class="muted" style="margin-top:6px">空いている畑すべてに植える（種代は1枚ごと）</div><div class="row" style="flex-wrap:wrap;gap:6px">'
      + F.crops.map((c) => `<button id="fm-sow-${c.id}" data-act="farm" data-kind="sow" data-id="${c.id}" ${c.ok && empty && me.money >= c.seed ? '' : 'disabled'}>${ic(CROP_IC[c.id], 16)} ${c.name}（${c.months[0]}〜${c.months[c.months.length - 1]}月・${c.days}日${c.draw < 0 ? '・土が肥える' : ''}）</button>`).join('') + '</div>';
    h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">'
      + (F.nt ? `<button id="fm-tool" data-act="farm" data-kind="tool" ${me.money >= F.nt.cost ? '' : 'disabled'}>${F.nt.name}にする（${SIM.money(F.nt.cost)}）</button>` : '')
      + (F.ns ? `<button id="fm-suiro" data-act="farm" data-kind="suiro" ${me.money >= F.ns.cost ? '' : 'disabled'}>${F.ns.name}（${SIM.money(F.ns.cost)}・畑${F.ns.max}枚まで）</button>` : '') + '</div>';
    h += UI.herdHtml(me);
    h += '<div class="muted">収穫は物置に入ります。収穫が増えるほど村がにぎわい、人口と米の産出が増えます</div>';
    return h;
  };

  // ---- 狩猟：森の中で、現れた獲物を素早くタップして射る（反射神経）。結果は命令 huntEnd で送る ----
  const css2 = document.createElement('style');
  css2.textContent = '#huntOv{position:fixed;inset:0;z-index:93;background:rgba(10,14,20,.9);display:flex;align-items:center;justify-content:center}#huntOv .hc{width:min(96vw,460px);background:#2a2118;border:1px solid #8a6a2a;border-radius:10px;padding:12px;color:#f3e9d0;text-align:center}';
  document.head.appendChild(css2);
  const FM = () => SIM.FARM;
  let ov = null, raf = 0, doneN = 0, run = null;
  function close(send) { if (run && send !== false) SGK.cmd({ type: 'huntEnd', n: run.n, res: run.res }); cancelAnimationFrame(raf); if (ov) ov.remove(); ov = null; run = null; }
  // 獲物を描く：ここを絵に置き換える（仮は絵文字）
  function drawPrey(ctx, k, x, y, hit) {
    const im = SGK.ICON && SGK.ICON.img('prey_' + k); ctx.globalAlpha = hit ? 0.5 : 1;
    if (im) ctx.drawImage(im, x - 36, y - 36, 72, 72);
    else { ctx.font = '56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(PREY_ICON[k], x, y); }
    ctx.globalAlpha = 1;
  }
  function startHunt(n) {
    if (SGK.ICON) for (const k in PREY_ICON) SGK.ICON.img('prey_' + k); // 絵を先に読んでおく
    if (ov) return; const W = 400, H = 300, P = FM().PREY, N = FM().huntN, keys = Object.keys(P), tw = keys.reduce((a, k) => a + P[k].w, 0);
    run = { n, res: {}, i: 0, cur: null, next: performance.now() + 900, hits: 0, arrows: [], left: FM().huntArrows, last: performance.now() };
    ov = document.createElement('div'); ov.id = 'huntOv';
    ov.innerHTML = `<div class="hc"><b>狩り</b><div class="muted" style="margin:2px 0">${SGK.HINT.txt('現れた獲物をすばやく[[タップ|クリック|タップ]]して射よう（熊は3回）。')}獲物は${N}回出て、矢は${FM().huntArrows}本。外すと減ります</div><canvas id="hcv" width="${W}" height="${H}" style="width:100%;border-radius:8px;touch-action:none;display:block"></canvas><div id="hmsg" style="min-height:22px;margin:6px 0"></div><button id="hcancel">やめる</button></div>`;
    document.body.appendChild(ov);
    const cv = $('hcv'), ctx = cv.getContext('2d');
    const pick = () => { let r = Math.random() * tw; for (const k of keys) { r -= P[k].w; if (r < 0) return k; } return keys[0]; };
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (!run || run.left <= 0) return; const rc = cv.getBoundingClientRect(), x = ((e.clientX - rc.left) / rc.width) * W, y = ((e.clientY - rc.top) / rc.height) * H;
      run.arrows.push({ x, y, t: performance.now() }); run.left--;
      const c = run.cur; if (!c || c.dead || Math.hypot(x - c.x, y - c.y) > P[c.k].r) return;
      c.hp--; c.hitAt = performance.now();
      if (c.hp <= 0) { c.dead = true; run.res[c.k] = (run.res[c.k] || 0) + 1; run.hits++; $('hmsg').textContent = `${P[c.k].name}を仕留めた！`; c.until = performance.now() + 250; }
    });
    $('hcancel').onclick = () => close(true);
    const loop = () => {
      if (!run) return; const now = performance.now();
      // 背景（森）
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2f5a2a'); g.addColorStop(1, '#1d3a1a'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 8; i++) { ctx.fillRect(20 + i * 52, 0, 10, H); }
      const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
      const c = run.cur;
      if (c && !c.dead) { // 獲物が動く（壁で跳ね返る）。向きは種類ごとの間隔で変わる
        const sp = P[c.k].sp; c.zt -= dt;
        if (P[c.k].zig && c.zt <= 0) { const a = Math.random() * Math.PI * 2; c.vx = Math.cos(a); c.vy = Math.sin(a); c.zt = P[c.k].zig * (0.6 + Math.random() * 0.8); }
        c.x += c.vx * sp * dt; c.y += c.vy * sp * dt;
        if (c.x < 30 || c.x > W - 30) { c.vx = -c.vx; c.x = Math.max(30, Math.min(W - 30, c.x)); } if (c.y < 40 || c.y > H - 30) { c.vy = -c.vy; c.y = Math.max(40, Math.min(H - 30, c.y)); }
      }
      if (c && now > c.until) { if (!c.dead) $('hmsg').textContent = `${P[c.k].name}に逃げられた……`; run.cur = null; run.next = now + 350 + Math.random() * 700; }
      if (!run.cur && now >= run.next) {
        if (run.i >= N || (run.left <= 0 && !run.cur)) { $('hmsg').textContent = `おしまい！　仕留めた数：${run.hits}`; const r = run; setTimeout(() => { if (run === r) close(true); }, 1000); run.next = Infinity; }
        else { const k = pick(), sp = P[k]; const a = Math.random() * Math.PI * 2; run.i++; run.cur = { k, hp: sp.hp, x: 50 + Math.random() * (W - 100), y: 60 + Math.random() * (H - 120), vx: Math.cos(a), vy: Math.sin(a), zt: sp.zig, until: now + sp.t * 1000 * Math.max(0.5, 1 - run.i * 0.05) }; }
      }
      if (run.cur) drawPrey(ctx, run.cur.k, run.cur.x, run.cur.y, run.cur.dead || (run.cur.hitAt && now - run.cur.hitAt < 120));
      for (const a of run.arrows) if (now - a.t < 200) { ctx.strokeStyle = '#f3e9d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a.x, H); ctx.lineTo(a.x, a.y); ctx.stroke(); }
      run.arrows = run.arrows.filter((a) => now - a.t < 200);
      ctx.fillStyle = '#f3e9d0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(`${Math.min(run.i, N)}／${N}　仕留めた ${run.hits}　矢 ${run.left}`, 8, 6);
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
