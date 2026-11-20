// 2.56.0 商家の画面：町の「店」タブ（自分の店・支店・相場の知らせ・茶会）、城の御用商人、堺の会合衆。命令は data-act（main.js が SIM.commands へ送る）
(function () {
  const SIM = SGK.SIM, UI = (SGK.SHOKAUI = {}), M = (n) => SIM.money(n);
  const css = document.createElement('style');
  css.textContent = `.sbTbl{border-collapse:collapse;font-size:12px;margin:4px 0;width:100%}.sbTbl th,.sbTbl td{border-bottom:1px solid rgba(201,163,90,.25);padding:3px 4px;text-align:right;white-space:nowrap}.sbTbl th:first-child,.sbTbl td:first-child{text-align:left}
.sbWrap{overflow-x:auto}.sbLo{color:#9be08a}.sbHi{color:#ff9a7a}.mzBar{height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:3px}.mzBar i{display:block;height:100%;background:#c9a35a}`;
  document.head.appendChild(css);

  // 相場の知らせ（店のある町。会合衆なら大きな町も）
  UI.soba = (sb) => {
    if (!sb || !sb.rows.length) return '';
    let h = `<div class="secH">相場の知らせ</div><div class="muted">店のある町${sb.rows.some((r) => !r.mine) ? '・大きな町（会合衆）' : ''}のいまの相場（1つの値。緑＝安い・赤＝高い）</div>`;
    h += '<div class="sbWrap"><table class="sbTbl"><tr><th>町</th>' + sb.ks.map((k) => `<th>${k.name}</th>`).join('') + '</tr>';
    for (const r of sb.rows) h += `<tr><td>${r.mine ? '<b>' : ''}${r.name}${r.mine ? '</b>' : ''}</td>` + r.pr.map((v, i) => { const q = v / sb.ks[i].base; return `<td class="${q < 0.85 ? 'sbLo' : q > 1.2 ? 'sbHi' : ''}">${v}</td>`; }).join('') + '</tr>';
    h += '</table></div>';
    if (sb.tip) h += `<div class="muted">いちばん差が大きいのは：${sb.tip}</div>`;
    return h;
  };

  // ---- 店タブ ----
  UI.mise = (P) => {
    const me = P.me, H = P.here.mise, K = me.shoka || {}; if (!H) return '';
    let h = `<div class="muted" style="margin-bottom:6px">所持金 ${M(me.money)}${K.own ? `　屋号「${K.ya}」・店${K.shops.length}つ${K.goyo ? `・${K.goyo.name}御用商人` : ''}${K.kaigo ? '・堺の会合衆' : ''}` : ''}</div>`;
    const S = H.shop;
    if (!S) {
      if (!K.own) {
        h += `<div class="card" style="display:block"><b>独立して店を持つ</b><br><span class="muted">大番頭になると、元手${M(H.cost)}で奉公先から暖簾分けしてもらい、自分の店（屋号「${H.ya}」）を開けます。店主になると給金はなくなりますが、棚に並べた品を町の人が毎日買っていき、その売上が入ります。支店も出せるようになります</span>`
          + `<div class="row" style="margin-top:4px"><button id="ms-open" data-act="shopOpen" ${H.can && me.money >= H.cost ? '' : 'disabled'}>${H.rank >= 4 ? `ここに店を開く（${M(H.cost)}）` : `大番頭から（いまは${SIM.GOSHO.RANKS[H.rank].name}）`}</button></div></div>`;
        return h;
      }
      h += `<div class="card"><div><b>${H.ya}の支店を出す</b><br><span class="muted">この町に支店を出します（支店は3つまで）。店のある町の相場はいつでも分かり、店から店へ品を送れます</span></div><button id="ms-open" data-act="shopOpen" ${H.can && me.money >= H.cost ? '' : 'disabled'}>${H.can ? `支店を出す（${M(H.cost)}）` : '支店は3つまで'}</button></div>`;
    } else {
      h += `<div class="card" style="display:block"><b>${K.ya}　${S.main ? '本店' : '支店'}・${S.lvName}</b>${S.goyo ? '　<span style="color:#ffcf4a">御用の家の領内（よく売れる）</span>' : ''}<br>`
        + `<span class="muted">棚 ${S.n}／${S.cap}　奉公人 ${S.staff}／${S.maxStaff}人　1日に売れる数 約${S.per}　この月の売上 ${M(S.sold)}</span><div class="mzBar"><i style="width:${Math.min(100, (S.n / S.cap) * 100)}%"></i></div>`
        + `<div class="row" style="margin-top:6px;flex-wrap:wrap"><button id="ms-till" data-act="shop" data-kind="till" ${S.till ? '' : 'disabled'}>売上を受け取る（${M(S.till)}）</button>`
        + (S.next ? `<button id="ms-lv" data-act="shop" data-kind="lv" ${me.money >= S.next.cost ? '' : 'disabled'}>${S.next.name}に建て直す（${M(S.next.cost)}・棚${S.next.cap}）</button>` : '')
        + `<button id="ms-hire" data-act="shop" data-kind="hire" ${S.staff < S.maxStaff && me.money >= SIM.SHOKA.staffCost ? '' : 'disabled'}>奉公人を雇う（${M(SIM.SHOKA.staffCost)}・月${M(SIM.SHOKA.wage)}）</button>`
        + (S.staff ? `<button id="ms-fire" data-act="shop" data-kind="fire">奉公人に暇を出す</button>` : '') + '</div>'
        + '<div class="muted" style="margin-top:4px">売上は月ごとに手元へ届きます（奉公人の給金を引いた残り）。ここで先に受け取ることもできます</div></div>';
      h += '<div class="secH">棚</div>';
      if (!S.shelf.length) h += '<div class="muted">棚は空です。下の荷から並べてください</div>';
      for (const x of S.shelf) {
        h += `<div class="card" style="display:block"><b>${x.name}</b> ${x.n}${x.unit}　<span class="muted">売値 約${M(x.price)}・仕入れ ${M(x.cost)}${x.price > x.cost ? `（1つ<span class="sbLo">+${M(x.price - x.cost)}</span>）` : x.cost ? '（<span class="sbHi">赤字</span>）' : ''}</span>`
          + `<div class="row" style="margin-top:3px;flex-wrap:wrap"><button id="mt-${x.k}" data-act="shop" data-kind="take" data-item="${x.k}" data-qty="10">10下げる</button><button id="mta-${x.k}" data-act="shop" data-kind="take" data-item="${x.k}" data-qty="-1">全部下げる</button>`
          + S.to.map((t) => `<button id="mx-${x.k}-${t.id}" data-act="shop" data-kind="send" data-item="${x.k}" data-id="${t.id}" data-qty="-1">${t.name}の店へ送る（${t.days}日）</button>`).join('') + '</div></div>';
      }
      if (S.inv.length) {
        h += '<div class="muted" style="margin-top:6px">持っている荷を並べる（売値はこの町の相場より少し高め）</div>';
        for (const x of S.inv) h += `<div class="card"><div>${x.name} ${x.n}${x.unit}　<span class="muted">売値 約${M(x.price)}${x.cost ? `・仕入れ ${M(x.cost)}` : ''}</span></div><button id="mp-${x.k}" data-act="shop" data-kind="put" data-item="${x.k}" data-qty="10" ${S.n < S.cap ? '' : 'disabled'}>10並べる</button><button id="mpa-${x.k}" data-act="shop" data-kind="put" data-item="${x.k}" data-qty="-1" ${S.n < S.cap ? '' : 'disabled'}>全部</button></div>`;
      }
      // 茶会
      const CK = K.chakai || {};
      h += `<div class="secH">茶会</div><div class="card" style="display:block"><span class="muted">茶器（茶入・茶碗・掛軸・香炉）を飾って客をもてなす。茶器の種類が多いほど、南蛮の珍品があるほど、店構えが大きいほど評判になる。名声が上がり、客の豪商との縁が深まる（縁が深いと、その豪商の家宝が安くなる）。支度に${M(SIM.SHOKA.chaCost)}・30日に1度</span>`
        + `<div class="row" style="margin-top:4px"><button id="ms-cha" data-act="chakai" ${S.tea && !CK.left && me.money >= SIM.SHOKA.chaCost ? '' : 'disabled'}>${!S.tea ? '茶器がありません' : CK.left ? `あと${CK.left}日` : '茶会を開く'}</button></div>`
        + (CK.res ? `<div class="muted" style="margin-top:4px">前の茶会（${CK.n}回目）：${CK.res.list.join('／')}</div>` : '') + '</div>';
      if (K.offer) h += `<div class="card"><div><b>${K.offer.name}</b>　<span class="muted">${K.offer.from}が${M(K.offer.price)}で譲ってくれる（あと${K.offer.left}日）</span></div><button id="ms-chabuy" data-act="chaBuy" ${me.money >= K.offer.price ? '' : 'disabled'}>譲り受ける</button></div>`;
    }
    // 店の一覧・送っている品
    if (K.shops.length) {
      h += '<div class="secH">店の一覧</div>' + K.shops.map((x) => `<div class="card" style="display:block"><b>${x.name}</b>　${x.main ? '本店' : '支店'}・${x.lvName}　<span class="muted">棚${x.n}／${x.cap}・奉公人${x.staff}・1日約${x.per}・売上たまり ${M(x.till)}${x.goyo ? '・御用の家の領内' : ''}</span></div>`).join('');
      if (K.send.length) h += '<div class="muted">送っている品：' + K.send.map((t) => `${t.name}${t.qty}→${t.to}（あと${t.left}日）`).join('、') + '</div>';
      if (S) h += `<div class="row" style="margin-top:6px"><button id="ms-close" data-act="shopClose">${S.main ? '本店をたたむ（浪人に戻る）' : 'この支店をたたむ'}</button></div>`;
    }
    if (K.en && K.en.length) h += '<div class="muted" style="margin-top:6px">豪商との縁：' + K.en.map((e) => `${e.name} ${e.n}${e.n >= 60 ? '（家宝1割引）' : e.n >= 30 ? '（家宝5分引）' : ''}`).join('、') + '</div>';
    h += UI.soba(K.soba);
    return h;
  };

  // ---- 城：御用商人 ----
  UI.goyo = (P) => {
    const me = P.me, G = P.here.goyo, K = me.shoka || {}; if (!G || !me.sho) return '';
    let h = `<div class="secH">${G.name}の御用</div>`;
    if (G.err) return h + `<div class="muted">${G.err}</div>`;
    h += `<div class="muted">献金したり、御用の品を納めたりすると家の覚えがよくなる。覚えが${G.need}になると御用商人を願い出られる（御用の家の領内の店がよく売れ、その家の市場で5分安く買え、毎月扶持が出る。御用商人になれるのは1つの家だけ）</div>`;
    h += `<div class="card" style="display:block">覚え ${G.fav}／${G.need}${G.mine ? '　<b style="color:#ffcf4a">この家の御用商人</b>' : K.goyo ? `　<span class="muted">（いまは${K.goyo.name}の御用商人）</span>` : ''}<div class="mzBar"><i style="width:${Math.min(100, (G.fav / G.need) * 100)}%"></i></div>`
      + '<div class="row" style="margin-top:4px;flex-wrap:wrap">' + [10000, 50000].map((q) => `<button id="gy-g${q}" data-act="goyoGift" data-qty="${q}" ${me.money >= q ? '' : 'disabled'}>${M(q)}献金する（覚え+${Math.round(q / SIM.SHOKA.giftPer)}）</button>`).join('')
      + (G.mine ? '<button id="gy-quit" data-act="goyoQuit">御用を辞する</button>' : `<button id="gy-ask" data-act="goyoAsk" ${G.fav >= G.need ? '' : 'disabled'}>御用商人を願い出る</button>`) + '</div></div>';
    for (const o of G.orders) {
      const it = SGK.DATA.items[o.item], have = (me.inv || {})[o.item] || 0;
      h += `<div class="card"><div>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}<b>${o.label}：${it.name}</b>を${o.qty}${it.unit}　<span class="muted">（所持 ${have}）<br>代金 ${M(o.pay)}・覚え+${o.fav}</span></div><button id="gy-${o.id}" data-act="goyoDeliver" data-id="${o.id}" ${o.done || have < o.qty ? 'disabled' : ''}>${o.done ? '納めた' : '納める'}</button></div>`;
    }
    return h;
  };

  // ---- 堺：会合衆 ----
  UI.kaigo = (P) => {
    const me = P.me, Q = P.here.kaigo; if (!Q) return '';
    let h = '<div class="secH">会合衆</div>';
    if (Q.member) return h + `<div class="card"><div><b>あなたは会合衆の一人</b><br><span class="muted">店がよく売れ（×1.15）、大きな町の相場が分かり、豪商の家宝が5分安い。月に一度の会合で配当（店の数しだい）</span></div><button id="kg-meet" data-act="kaigoMeet" ${Q.met ? 'disabled' : ''}>${Q.met ? '今月は出た' : '会合に出る'}</button><button id="kg-quit" data-act="kaigoQuit">抜ける</button></div>`;
    h += `<div class="muted">堺の町を治める豪商たちの寄り合い。加わると店がよく売れ、大きな町の相場が分かり、豪商の家宝が安くなり、月に一度の会合で配当がもらえる</div>`;
    h += `<div class="card"><div>${Q.need.length ? `<span class="muted">足りないもの：${Q.need.join('・')}</span>` : '<b>加われます</b>'}<br><span class="muted">入り銀 ${M(Q.fee)}</span></div><button id="kg-join" data-act="kaigoJoin" ${!Q.need.length && me.money >= Q.fee ? '' : 'disabled'}>会合衆に加わる</button></div>`;
    return h;
  };
})();
