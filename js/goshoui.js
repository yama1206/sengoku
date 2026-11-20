// 2.55.0 豪商（家宝・頼まれごと・奉公）と湊（船・船員の求人・海外との商い）の画面。命令は data-act（main.js が SIM.commands へ送る）
(function () {
  const SIM = SGK.SIM, UI = (SGK.GOSHOUI = {}), $ = (id) => document.getElementById(id);
  const IT = () => SGK.DATA.items, M = (n) => SIM.money(n);
  const star = (r) => '★'.repeat(r) + '<span style="opacity:.3">' + '★'.repeat(4 - r) + '</span>';
  const RC = [null, '#b9b1a0', '#6fb3e0', '#c78bf0', '#ffcf4a']; // ★ごとの色
  const css = document.createElement('style');
  css.textContent = `.gsCrew{display:flex;align-items:center;gap:8px}.gsCrew .st{font-size:12px;color:#d8cdb2}.gsCrew.away{opacity:.55}
#gachaOv{position:fixed;inset:0;z-index:95;background:rgba(8,10,16,.88);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}
#gachaOv .cards{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:min(96vw,640px)}
#gachaOv .gc{width:108px;height:150px;perspective:600px}#gachaOv .gi{position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d}
#gachaOv .gc.open .gi{transform:rotateY(180deg)}#gachaOv .gf,#gachaOv .gb{position:absolute;inset:0;border-radius:8px;backface-visibility:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px;text-align:center}
#gachaOv .gb{background:repeating-linear-gradient(45deg,#3a2a1a 0 8px,#44321f 8px 16px);border:2px solid #8a6a2a;font-size:28px;color:#c9a35a}
#gachaOv .gf{transform:rotateY(180deg);background:#2a2118;border:2px solid var(--rc);color:#f3e9d0;font-size:12px;box-shadow:0 0 var(--gl) var(--rc)}
#gachaOv .gf b{font-size:15px;margin:4px 0}#gachaOv .gf .s{color:var(--rc);font-size:14px}
#gachaOv .gc.r4 .gb{animation:gsGlow 1s infinite alternate}@keyframes gsGlow{from{box-shadow:0 0 6px #ffcf4a}to{box-shadow:0 0 22px #ffcf4a}}`;
  document.head.appendChild(css);

  // ---- 豪商 ----
  UI.gosho = (P) => {
    const me = P.me, G = P.here.gosho; if (!G) return '';
    const S = me.sho; let h = `<div class="muted" style="margin-bottom:6px">所持金 ${M(me.money)}${S ? `　あなたは${S.houseName}の<b>${S.name}</b>（家宝は${Math.round(S.off * 100)}%引き）` : ''}</div>`;
    h += `<div class="secH">家宝の蔵</div><div class="muted">ここでしか買えない名品（あと${G.left}日で品が入れ替わる）</div>`;
    for (const K of G.items) {
      h += `<div class="card"><div><b>${K.name}</b>　<span class="muted">${M(K.price)}<br>${K.desc}${K.kind === 'takara' ? `<br>初めて手に入れると名声+${K.fame}・主家の城で献上すると功績+${K.kenjo}` : ''}</span></div>`
        + `<button id="kh-${K.k.replace(':', '-')}" data-act="buyKaho" data-id="${K.k}" ${K.sold || me.money < K.price ? 'disabled' : ''}>${K.sold ? '売り切れ' : '買う'}</button></div>`;
    }
    if ((me.takara || []).length) {
      h += '<div class="muted" style="margin-top:6px">持っている家宝（茶器など）</div>';
      for (const T of me.takara) h += `<div class="card"><div>${T.name}　×${T.n}<br><span class="muted">献上で功績+${T.kenjo}（主家の城で）</span></div><button id="kt-${T.id}" data-act="sellTakara" data-id="${T.id}">${M(T.sell)}で売る</button></div>`;
    }
    h += `<div class="secH">頼まれごと</div><div class="muted">品をそろえて納めると礼金がもらえる${S ? '（商人は功績も）' : ''}</div>`;
    for (const t of G.tasks) {
      const it = IT()[t.item], have = (me.inv || {})[t.item] || 0;
      h += `<div class="card"><div>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}<b>${it.name}</b>を${t.qty}${it.unit}　<span class="muted">（所持 ${have}）<br>礼金 ${M(t.reward)}${S ? `・功績+${t.merit}` : ''}</span></div>`
        + `<button id="gt-${t.id}" data-act="goshoTask" data-id="${t.id}" ${t.done || have < t.qty ? 'disabled' : ''}>${t.done ? '納めた' : '納める'}</button></div>`;
    }
    h += '<div class="secH">奉公（商人になる）</div>';
    if (S) {
      h += `<div class="card" style="display:block"><b>${S.houseName}　${S.name}</b>　功績 ${S.merit}${S.next ? `/${S.next.merit}（次は${S.next.name}・名声${S.next.fame}以上）` : '（最高位）'}<br><span class="muted">給金 月${M(S.pay)}・持てる荷×${S.carry}・荷が重くても遅くなりにくい。功績は頼まれごと・市場での儲け・海外との商いで積む</span>`
        + `<div class="row" style="margin-top:4px">${G.mine && S.next ? `<button id="sh-up" data-act="shoPromote" ${S.merit >= S.next.merit && me.fame >= S.next.fame ? '' : 'disabled'}>${S.next.name}への取り立てを願い出る</button>` : ''}<button id="sh-quit" data-act="shoQuit">暇をもらう</button></div></div>`;
    } else {
      h += `<div class="muted">豪商に奉公すると商人になれる。武士・忍びからなら格はそのまま（主家には暇をもらう。元の主家の城でなら元の格で仕え直せる）。城主より上は奉公できない</div>`;
      h += '<div class="card" style="display:block">' + G.ranks.map((R) => `<b>${R.name}</b>　<span class="muted">月${M(R.pay)}・荷×${R.carry}・功績${R.merit}・名声${R.fame}　${R.desc}</span>`).join('<br>') + '</div>';
      h += `<div class="row"><button id="sh-join" data-act="shoJoin" ${G.canJoin ? '' : 'disabled'}>${G.name}に奉公する</button></div>`;
    }
    return h;
  };
  // 城で家宝を献上
  UI.kenjo = (P) => {
    const T = P.me.takara || []; if (!T.length) return '';
    return '<div class="secH">家宝の献上</div>' + T.map((t) => `<div class="card"><div>${t.name}　×${t.n}</div><button id="kj-${t.id}" data-act="kenjo" data-id="${t.id}">献上する（功績+${t.kenjo}）</button></div>`).join('');
  };

  // ---- 湊 ----
  let lastG = null;
  UI.minato = (P) => {
    const me = P.me, H = P.here, KG = SIM.KAIGAI, K = me.kaigai || { crew: [] };
    if (me.gachaRes && me.gachaRes.t !== lastG) { lastG = me.gachaRes.t; const L = me.gachaRes.list; setTimeout(() => showGacha(L), 0); } // 求人の結果が届いたら、めくる画面を出す
    let h = `<div class="muted" style="margin-bottom:6px">所持金 ${M(me.money)}　海の向こう（天川・呂宋・交趾・暹羅）との商い。船は船員が動かすので、出帆したら待たずに動けます</div>`;
    // 船
    h += '<div class="secH">船</div>';
    if (K.ship) h += `<div class="card" style="display:block"><b>${K.shipName}</b>　<span class="muted">船員${K.slots}人まで・元手${M(K.cap)}まで　${K.voy ? `航海中：${K.voy.dest}（あと${K.voy.left}日・元手${M(K.voy.money)}）` : `${K.portName}の湊につないである`}</span>${!K.voy && K.port !== H.id ? `<div class="row" style="margin-top:4px"><button id="sp-move" data-act="moveShip">この湊へ回す（${M(2000)}）</button></div>` : ''}</div>`;
    for (const [id, S] of Object.entries(KG.SHIPS)) {
      if (K.ship === id) continue;
      const back = K.ship ? Math.round(KG.SHIPS[K.ship].cost * KG.sellShip) : 0;
      h += `<div class="card"><div><b>${S.name}</b>　<span class="muted">${M(S.cost)}${back ? `（下取り${M(back)}）` : ''}<br>${S.desc}</span></div><button id="sb-${id}" data-act="buyShip" data-id="${id}" ${K.voy || me.money + back < S.cost ? 'disabled' : ''}>${K.ship ? '買い替える' : '買う'}</button></div>`;
    }
    // 求人
    const g = H.port.gacha;
    h += `<div class="secH">船員の求人</div><div class="muted">誰が来るかは運次第。★4は名のある船乗り（重ねて来ると腕が上がる）。10回だと1割引で★3以上が1人は必ず来る。抱えられるのは${KG.maxCrew}人まで（${(K.crew || []).length}人）</div>`
      + `<div class="row" style="margin:4px 0"><button id="ga-1" data-act="crewGacha" data-kind="one" ${me.money < g.one ? 'disabled' : ''}>求人を出す（${M(g.one)}）</button><button id="ga-10" data-act="crewGacha" data-kind="ten" ${me.money < g.ten ? 'disabled' : ''}>10回まとめて（${M(g.ten)}）</button></div>`
      + `<div class="muted">出る見込み：★1 ${KG.RARE[1].w}%・★2 ${KG.RARE[2].w}%・★3 ${KG.RARE[3].w}%・★4 ${KG.RARE[4].w}%</div>`;
    // 船員
    if ((K.crew || []).length) {
      h += `<div class="secH">船員</div><div class="muted">船に乗るのは「乗せる」にした者のうち、良い順に${K.slots || 0}人まで（太字）。航海・商い・腕っぷしが高いほど、嵐に強く・儲かり・海賊に強い</div>`;
      for (const c of K.crew) {
        const on = (K.riders || []).includes(c.id);
        h += `<div class="card gsCrew${c.away ? ' away' : ''}"><div style="flex:1"><span style="color:${RC[c.r]}">${star(c.r)}</span> ${on ? '<b>' : ''}${c.name}${on ? '</b>' : ''}　<span class="muted">${c.title}・Lv${c.lv}・得意：${KG.JOBS[c.job]}</span><br><span class="st">航海${c.nav}　商い${c.trade}　腕っぷし${c.fight}${c.skill ? `　<b style="color:#ffcf4a">${c.skill}</b>` : ''}${c.away ? '　（航海中）' : ''}</span></div>`
          + (c.away ? '' : `<button id="cr-${c.id}" data-act="crewRide" data-id="${c.id}">${c.ride ? '降ろす' : '乗せる'}</button><button id="cd-${c.id}" data-act="crewDismiss" data-id="${c.id}">暇を出す</button>`) + '</div>';
      }
    }
    // 航海
    h += '<div class="secH">船を出す</div>';
    if (!K.ship) h += '<div class="muted">まず船を手に入れてください</div>';
    else if (K.voy) h += `<div class="muted">いまは航海中です（${K.voy.dest}・あと${K.voy.left}日）</div>`;
    else if (K.port !== H.id) h += `<div class="muted">船は${K.portName}の湊にあります</div>`;
    else if ((K.riders || []).length < KG.minCrew) h += `<div class="muted">船員が${KG.minCrew}人以上いないと出せません</div>`;
    else {
      for (const [d, D] of Object.entries(KG.DEST)) {
        const v = K.prev[d], qs = [10000, 30000, K.cap].filter((q, i, a) => q <= K.cap && a.indexOf(q) === i);
        h += `<div class="card" style="display:block"><b>${D.name}</b>　<span class="muted">${D.desc}。持ち帰る品：${D.goods}<br>${v.days}日ほど・儲けの見込み 元手の約${v.mul}倍・嵐${v.storm}%・海賊${v.pirate}%（7〜9月に出ると嵐が増える）</span>`
          + `<div class="row" style="margin-top:4px;flex-wrap:wrap">${qs.map((q) => `<button id="vy-${d}-${q}" data-act="voyage" data-kind="${d}" data-qty="${q}" ${me.money < q ? 'disabled' : ''}>元手${M(q)}で出す</button>`).join('')}</div></div>`;
      }
    }
    if ((K.log || []).length) h += '<div class="muted" style="margin-top:6px">これまでの航海：' + K.log.map((l) => `${l.dest} ${M(l.money)}→${M(l.val)}`).join('、') + '</div>';
    return h;
  };

  // ---- 求人の結果（カードをめくる） ----
  function showGacha(list) {
    let ov = $('gachaOv'); if (ov) ov.remove();
    ov = document.createElement('div'); ov.id = 'gachaOv';
    ov.innerHTML = `<b style="color:#f3e9d0;font-size:18px">求人に${list.length}人が来た！</b><div class="cards">${list.map((c, i) => `<div class="gc r${c.r}" data-i="${i}"><div class="gi"><div class="gb">${c.r >= 3 ? '✦' : '?'}</div>`
      + `<div class="gf" style="--rc:${RC[c.r]};--gl:${c.r >= 3 ? 14 : 0}px"><span class="s">${'★'.repeat(c.r)}</span><b>${c.name}</b><span>${c.title}</span><span class="muted">${SIM.KAIGAI.JOBS[c.job]}が得意</span><span style="font-size:11px">航${c.nav} 商${c.trade} 腕${c.fight}</span>${c.dup ? '<span style="color:#ffcf4a">重なった！腕が上がる</span>' : c.swap ? `<span class="muted">${c.swap}と入れ替わり</span>` : c.full ? '<span class="muted">抱えきれず帰した</span>' : ''}</div></div></div>`).join('')}</div>`
      + '<div class="row"><button id="gaAll">全部めくる</button><button id="gaClose">閉じる</button></div>';
    document.body.appendChild(ov);
    const cards = [...ov.querySelectorAll('.gc')];
    cards.forEach((el) => (el.onclick = () => flip(el)));
    let i = 0; const tm = setInterval(() => { if (i >= cards.length || !document.body.contains(ov)) return clearInterval(tm); flip(cards[i++]); }, list.length > 1 ? 260 : 400);
    function flip(el) { if (el.classList.contains('open')) return; el.classList.add('open'); const r = +el.className.match(/r(\d)/)[1]; if (SGK.AUDIO && SGK.AUDIO.sfx) SGK.AUDIO.sfx(r >= 3 ? 'coin' : 'click'); }
    $('gaAll').onclick = () => cards.forEach(flip);
    $('gaClose').onclick = () => ov.remove();
  }
})();
