// 2.56.1 村の「村長」タブ（雇ってもらう・野良仕事・村の頼みごと・普請・取り立て）。命令は data-act（main.js が SIM.commands へ送る）
(function () {
  const SIM = SGK.SIM, UI = (SGK.NOMINUI = {}), M = (n) => SIM.money(n);
  UI.soncho = (P) => {
    const me = P.me, V = P.here.soncho, N = me.nomin; if (!V) return '';
    const hp = me.hpFrac == null ? 1 : me.hpFrac, NM = SIM.NOMIN;
    let h = `<div class="muted" style="margin-bottom:6px">村長 ${V.me ? 'あなた' : V.head}　村の発展 ${V.dev}${V.pop ? `　人口 ${V.pop}` : ''}${N ? `　あなたは${N.vname}の<b>${N.name}</b>` : ''}</div>`;
    if (V.mine) {
      const nx = N.next, pct = nx ? Math.min(100, (N.trust / nx.trust) * 100) : 100;
      h += `<div class="card" style="display:block"><b>${N.vname}　${N.name}</b>　村の信頼 ${N.trust}${nx ? `／${nx.trust}（次は${nx.name}・名声${nx.fame}以上）` : ''}`
        + `<div class="mzBar" style="height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:3px"><i style="display:block;height:100%;width:${pct}%;background:#9be08a"></i></div>`
        + `<span class="muted">${NM.RANKS[N.rank].desc}${!N.home && N.rank >= 2 ? '。<b style="color:#e07a6a">自宅がこの村ではないので、借りた田畑は使えません</b>' : ''}</span>`
        + `<div class="row" style="margin-top:4px;flex-wrap:wrap">${nx ? `<button id="nm-up" data-act="nominPromote" ${N.trust >= nx.trust && me.fame >= nx.fame ? '' : 'disabled'}>${N.rank === 4 ? '村長のあとを継ぐ' : `${nx.name}への取り立てを願い出る`}</button>` : ''}<button id="nm-quit" data-act="nominQuit">暇をもらう</button></div></div>`;
      h += '<div class="secH">村の仕事</div>';
      h += `<div class="card"><div><b>野良仕事</b><br><span class="muted">村長の田畑で働く（1日1回・体力${Math.round(NM.workCost * 100)}%）。日銭${M(V.wage)}・信頼+${NM.workTrust}</span></div><button id="nm-work" data-act="nominWork" ${V.worked || hp < NM.workCost ? 'disabled' : ''}>${V.worked ? '今日は済んだ' : '働く'}</button></div>`;
      h += `<div class="card"><div><b>普請の手伝い</b><br><span class="muted">村総出で用水や道を直す（月に1回・体力${Math.round(NM.fushinCost * 100)}%）。村が豊かになり、信頼+${NM.fushinTrust}</span></div><button id="nm-fushin" data-act="nominFushin" ${V.fushin || hp < NM.fushinCost ? 'disabled' : ''}>${V.fushin ? '今月は済んだ' : '手伝う'}</button></div>`;
    } else if (N) {
      h += `<div class="card" style="display:block"><span class="muted">あなたは${N.vname}で働いています。野良仕事や取り立ては${N.vname}の村長の家で。ここでは村の頼みごとを引き受けられます</span></div>`;
    } else {
      h += `<div class="card" style="display:block"><b>村長に雇ってもらう</b><br><span class="muted">浪人なら、村長に雇われて作男（雇われ農民）になれます。野良仕事で日銭を稼ぎ、村の信頼を集めると小作人・本百姓・名主と取り立てられ（足軽〜部将と同じ格）、やがて村長のあとを継げます。自宅をこの村に移せば、借りた田畑で自分の畑も広がります</span>`
        + `<div class="row" style="margin-top:4px"><button id="nm-join" data-act="nominJoin" ${V.canJoin ? '' : 'disabled'}>${V.clan ? '主家に仕えている間はなれない' : V.canJoin ? `${V.head}に雇ってもらう` : '商人の間はなれない'}</button></div></div>`;
    }
    h += '<div class="secH">村の頼みごと</div><div class="muted">品を納めると礼金がもらえ、村も少し豊かになる（この村で働いていれば信頼も）</div>';
    for (const t of V.tasks) {
      const it = SGK.DATA.items[t.item], have = (me.inv || {})[t.item] || 0;
      h += `<div class="card"><div>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}<b>${it.name}</b>を${t.qty}${it.unit}　<span class="muted">（所持 ${have}）<br>礼金 ${M(t.reward)}${V.mine ? `・信頼+${t.trust}` : ''}</span></div><button id="nt-${t.id}" data-act="nominTask" data-id="${t.id}" ${t.done || have < t.qty ? 'disabled' : ''}>${t.done ? '納めた' : '納める'}</button></div>`;
    }
    h += '<div class="secH">百姓の身分</div><div class="card" style="display:block">' + V.ranks.map((R) => `<b>${R.name}</b>　<span class="muted">信頼${R.trust}・名声${R.fame}　日銭${M(R.wage)}${R.rice ? `・毎月米${R.rice}俵` : ''}${R.pay ? `・手当${M(R.pay)}` : ''}　${R.desc}</span>`).join('<br>') + '</div>';
    return h;
  };
})();
