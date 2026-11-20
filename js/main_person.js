// 人物の画面（能力・技能・特技・部隊の昇格）
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- 人物（能力・技能・特技・部隊の昇格） ----------
let charTab = 'eq', charHtml = '';
// 0.74.0 荷の重さの表示
const loadTxt = (me) => me.loadKg == null ? '' : `荷 <b style="color:${me.loadSpd < 1 ? '#e07a6a' : 'inherit'}">${me.loadKg}kg</b>/目安${me.carryKg}kg${me.loadSpd < 1 ? `（重くて移動×${me.loadSpd}）` : ''}`;
function openChar(open) {
  const c = $('char');
  if (open === false || !G.priv) { c.classList.add('hidden'); return; }
  if (G.priv.battle) return toast('戦闘中は開けません', 1500);
  openTown(false); toggleMenu(false); c.classList.remove('hidden'); charHtml = ''; renderChar(); setFocus(c, currentFocus(c));
}
function setCTab(t) { charTab = t; charHtml = ''; renderChar(); setFocus($('char'), $('ctab-' + t)); }
function cycleCTab(d) { const t = ['eq', 'inv', 'skill', 'stat', 'perk', 'army', 'rank', 'pol', 'mon', 'hyo'].filter((x) => !$('ctab-' + x).classList.contains('hidden')); setCTab(t[(t.indexOf(charTab) + d + t.length) % t.length]); }
function renderChar() {
  const P = G.priv; if (!P || !P.me.char || P.battle) return openChar(false);
  const me = P.me, C = me.char, TR = SIM.TROOPS, m = G.view && G.view.players.find((x) => x.id === G.myPid);
  { const tt = me.titles && me.titles.cur && me.titles.list.find((x) => x[0] === me.titles.cur); $('charTitle').textContent = tt ? `称号：${tt[1]}` : '称号'; $('charTitle').classList.toggle('on', charTab === 'title'); } /* 2.9.0 */
  $('charName').textContent = C.off ? `${m ? m.name : ''}　名声${C.fame}` : `${m ? m.name : ''}　格${C.level}　名声${C.fame}`;
  $('ctab-stat').classList.toggle('hidden', !!C.off); $('ctab-perk').classList.toggle('hidden', !!C.off); if (C.off && (charTab === 'perk' || charTab === 'stat')) charTab = 'eq'; // 0.74.0 装備は専用タブ
  document.querySelectorAll('#char [data-ctab]').forEach((b) => b.classList.toggle('on', b.dataset.ctab === charTab));
  let html = '';
  if (charTab === 'title') html += SGK.TITLE_HTML(me) + '<div class="row" style="margin-top:8px"><button id="ti-back" data-cact="backChar">戻る</button></div>';
  else if (charTab === 'inv') html += invHtml(me); /* 1.6.31 持っている物資 */
  else if (charTab === 'eq') { // 0.74.0 装備タブ：付ける・外す・売る、荷の重さ
    const EQ = SIM.EQUIP, E = me.equip || {}, G2 = me.gear || {};
    const desc = (sl, e) => [sl === 'wep' ? `${EQ.kindName[e.kind]}${e.atk ? `・攻撃+${e.atk}` : ''}` : sl === 'arm' ? `守り+${e.da}` : `1日の移動+${e.km}km・荷+${e.cw}kg`, e.wt ? `${e.wt}kg` : ''].filter(Boolean).join('・');
    { const H = SIM.TROOPS.hero, wp = E.wep && EQ.wep[E.wep], ar = E.arm && EQ.arm[E.arm], pl = (b, a) => a ? `${b}<span style="color:#6fbf73">+${a}</span>` : `${b}`;
      html += `<div class="card" style="display:block"><b>本人の強さ</b>　体力 ${H.hp}　攻撃 ${pl(H.atk, wp && wp.atk)}　守り ${pl(H.def, ar && ar.da)}<br><span class="muted">兵士と比べるときはメニューの「兵士図鑑」を見てください</span></div>`; } // 0.74.2
    html += `<div class="muted" style="margin-bottom:6px">${loadTxt(me)}<br>目安＝本人${EQ.carry.self}kg＋兵1人${EQ.carry.man}kg（騎馬${EQ.carry.cav}kg）＋馬。超えると移動が遅くなります</div>`;
    html += '<div class="muted">装備中</div>';
    for (const sl of ['wep', 'wep2', 'arm', 'horse']) {
      const id = E[sl], e = id && EQ[sl === 'wep2' ? 'wep' : sl][id];
      const off = e && (sl !== 'wep' || E.wep2) ? `<button id="uq-${sl}" data-cact="unequip" data-to="${sl}">外す</button>` : '';
      html += `<div class="card"><div><b>${EQ.slotName[sl]}</b>　${e ? `${e.name}<br><span class="muted">${desc(sl === 'wep2' ? 'wep' : sl, e)}${sl === 'wep2' ? '（持ち替えると効く）' : ''}</span>` : '<span class="muted">なし</span>'}</div>${sl === 'wep2' && e ? '<button id="uq-swap" data-cact="swapWep">主と入れ替え</button>' : ''}${off}</div>`;
    }
    const ids = Object.keys(G2).filter((k) => G2[k] > 0);
    html += `<div class="muted" style="margin-top:10px">荷の中の武具${me.canSell ? '（ここで半値で売れます）' : '（売るのは大きな町で）'}</div>`;
    if (!ids.length) html += '<div class="muted" style="margin:4px 0">なし</div>';
    for (const id of ids) {
      const sl = EQ.slotOf(id), e = EQ[sl][id];
      const bt = sl === 'wep' ? `<button id="gq-${id}" data-cact="equipGear" data-id="${id}" data-to="wep">主に</button><button id="gq2-${id}" data-cact="equipGear" data-id="${id}" data-to="wep2">副に</button>` : `<button id="gq-${id}" data-cact="equipGear" data-id="${id}" data-to="${sl}">付ける</button>`;
      html += `<div class="card"><div><b>${e.name}</b>${G2[id] > 1 ? ` ×${G2[id]}` : ''}　<span class="muted">${EQ.slotName[sl]}<br>${desc(sl, e)}</span></div><div class="row">${bt}${me.canSell ? `<button id="gs-${id}" data-cact="sellGear" data-id="${id}">売る ${SIM.money(Math.floor((e.cost || e.val || 0) * EQ.sell))}</button>` : ''}</div></div>`;
    }
    if (C.off) html += '<div class="muted" style="margin-top:8px">いまは能力値・技能・特技はありません。本人の強さは装備で変わります（武具は京・堺・博多などの大きな町で買えます）</div>';
  } else if (charTab === 'skill') { // 0.76.0 技能：使うと伸び、25・50・75・100で特技が自動で付く
    const WS = SIM.WSKILL, K = C.wsk || {};
    if (me.grow) html += `<div class="muted" style="margin-bottom:4px">成長の型：<b>${me.grow}</b></div>`;
    html += `<div class="muted" style="margin-bottom:6px">使うほど伸びます（強い相手ほど・利益が出るほどよく伸びる）。25・50・75・100で特技を自動で覚えます</div>`;
    for (const k in WS) {
      const [lv, xp] = K[k] || [0, 0], need = SIM.wsNeed(lv), pr = lv >= 100 ? 1 : Math.min(1, xp / need);
      const pk = SIM.WPERKS.filter((x) => x.sk === k).map((x) => `<span style="${lv >= x.lv ? 'color:#ffe070' : 'opacity:.5'}">${x.lv} ${x.name}（${x.desc}）</span>`).join('<br>');
      html += `<div class="card" style="display:block"><b>${WS[k].name}</b>　${lv}<span class="muted">　${WS[k].desc}</span><div style="height:6px;background:rgba(0,0,0,.4);margin:4px 0"><div style="height:6px;width:${Math.round(pr * 100)}%;background:#c9a64a"></div></div><span style="font-size:12px">${pk}</span></div>`;
    }
  } else if (charTab === 'stat') {
    if (me.grow) html += `<div class="muted" style="margin-bottom:4px">成長の型：<b>${me.grow}</b></div>`;
    html += `<div class="muted" style="margin-bottom:6px">能力値（上げられる点：${C.points}）　技能は使うほど伸び、元の能力値が高いほど伸びやすくなります</div>`;
    for (const a in SIM.ATTRS) html += `<div class="card"><div><b>${SIM.ATTRS[a]}</b>　${C.attrs[a]}<span class="muted">/10</span></div><button id="at-${a}" data-cact="addAttr" data-attr="${a}" ${C.points > 0 && C.attrs[a] < 10 ? '' : 'disabled'}>＋1</button></div>`;
    html += '<div class="muted" style="margin:10px 0 4px">技能</div>';
    for (const k in SIM.SKILLS) {
      const sk = SIM.SKILLS[k], [lv, xp] = C.skills[k] || [0, 0], pct = lv >= 100 ? 100 : Math.floor((xp / SIM.skillNeed(lv)) * 100);
      html += `<div class="card" style="display:block"><b>${sk.name}</b> ${lv}　<span class="muted">（${SIM.ATTRS[sk.attr]}）${sk.desc}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`;
    }
  } else if (charTab === 'perk') {
    html += '<div class="muted" style="margin-bottom:6px">技能が25・50になると、2つのうち1つを選べます</div>';
    for (const k in SIM.SKILLS) for (const lv of [25, 50]) {
      const opts = SIM.PERKS.filter((x) => x.skill === k && x.lv === lv), have = opts.find((x) => C.perks.includes(x.id));
      const reach = (C.skills[k] || [0])[0] >= lv;
      html += `<div class="muted" style="margin-top:6px">${SIM.SKILLS[k].name} ${lv}${reach ? '' : '（未到達）'}</div>`;
      for (const x of opts) html += `<div class="card perk ${have === x ? 'have' : ''}"><div><b>${x.name}</b><br><span class="muted">${x.desc}</span></div>`
        + (have === x ? '<span>習得</span>' : `<button id="pk-${x.id}" data-cact="pickPerk" data-id="${x.id}" ${reach && !have ? '' : 'disabled'}>選ぶ</button>`) + '</div>';
    }
  } else if (charTab === 'hyo') { // 0.73.0 評定
    const H = me.hyo;
    if (!H) html += '<div class="muted">いまは評定は開かれていません（毎月1日、大名の居城で開かれます）</div>';
    else {
      html += `<div class="card" style="display:block"><b>${H.seat}の評定</b>　<span class="muted">出ている人：${H.who.join('・')}　（評定のあいだは時が止まります）</span></div>`;
      if (H.lead) html += `<div class="card"><div>政策と上納を決める</div><button id="hy-pol" data-cact="goPol">政策タブへ</button></div>`;
      html += '<div class="muted" style="margin-top:8px">出された意見</div>';
      if (!H.ops.length) html += '<div class="muted">まだありません</div>';
      for (const [n, who, txt, st] of H.ops) html += `<div class="card"><div>${who}「${txt}」　<span class="muted">${st === 'ok' ? '採用' : st === 'ng' ? '却下' : '返事待ち'}</span></div>`
        + (H.lead && st === 'wait' ? `<button id="hj-${n}-ok" data-cact="hyoJudge" data-id="${n}" data-to="ok">採る</button><button id="hj-${n}-ng" data-cact="hyoJudge" data-id="${n}" data-to="ng">退ける</button>` : '') + '</div>';
      if (!H.lead) {
        html += `<div class="muted" style="margin-top:8px">意見を出す（功績${H.merit}。評定ごとに1つ。退けられると功績が半分戻ります）</div>`;
        if (H.done) html += '<div class="muted">今回はもう意見を出しました</div>';
        else {
          html += `<div class="card"><div>褒美を願う　<span class="muted">功績${H.rewCost}</span></div><button id="hy-rew" data-cact="hyoOp" data-id="rew" ${H.merit >= H.rewCost ? '' : 'disabled'}>願う</button></div>`;
          html += `<div class="muted">攻め先を進言する（功績${H.atkCost}）</div>`;
          if (!H.tgts.length) html += '<div class="muted">戦をしている相手がいません</div>';
          for (const [id, nm, fn] of H.tgts) html += `<div class="card"><div>${nm}　<span class="muted">${fn}</span></div><button id="hy-a-${id}" data-cact="hyoOp" data-id="atk" data-to="${id}" ${H.merit >= H.atkCost ? '' : 'disabled'}>攻めるべし</button></div>`;
        }
      }
      html += `<div class="card" style="margin-top:8px"><div>${H.lead ? '評定を終える（時が動き出します）' : '評定から下がる'}</div><button id="hy-end" data-cact="hyoLeave">${H.lead ? '終える' : '下がる'}</button></div>`;
    }
  } else if (charTab === 'pol') { // 0.71.0 家の政策・上納
    const Q = me.pol;
    if (!Q) html += '<div class="muted">家に仕えると、その家の政策と上納の割合が見られます。独立して大名になると政策を決められます</div>';
    else {
      html += `<div class="card" style="display:block"><b>${Q.house}</b>　<span class="muted">上納 ${Q.jono}%（城主の年貢・領内の上がりから家へ納める）　政策 ${Q.on.length}つ${Q.kura != null ? `　所持金 ${SIM.money(Q.kura)}` : ''}</span></div>`;
      if (Q.lead && !Q.hyo) html += '<div class="muted">政策と上納は、毎月1日の評定のときに決められます</div>';
      if (Q.lead) html += `<div class="card"><div>上納の割合 <b>${Q.jono}%</b><br><span class="muted">10〜40%。2割より高いと城主の忠誠が下がり、低いと上がります</span></div><button id="jn-m" data-cact="setJono" data-qty="-1">－</button><button id="jn-p" data-cact="setJono" data-qty="1">＋</button></div>`;
      if (Q.mine) { html += '<div class="muted" style="margin-top:8px">家の固有政策を1つ選んでください（あとから変えられません）</div>'; for (const [k, n, t] of Q.mine) html += `<div class="card"><div><b>${n}</b><br><span class="muted">${t}</span></div><button id="pm-${k}" data-cact="pickMine" data-id="${k}">これにする</button></div>`; }
      html += '<div class="muted" style="margin-top:8px">行っている政策</div>';
      if (!Q.on.length) html += '<div class="muted">なし</div>';
      for (const [k, n, t, up] of Q.on) html += `<div class="card"><div><b>${n}</b>　<span class="muted">毎月${SIM.money(up)}<br>${t}</span></div>${Q.lead ? `<button id="po-${k}" data-cact="setPolicy" data-id="${k}">やめる</button>` : ''}</div>`;
      if (Q.lead) {
        html += '<div class="muted" style="margin-top:8px">始められる政策（費用を払って始め、毎月の維持費がかかります）</div>';
        for (const [k, n, t, cost, up, cd] of Q.list) html += `<div class="card"><div><b>${n}</b>　<span class="muted">${SIM.money(cost)}・毎月${SIM.money(up)}<br>${t}${cd ? `<br>あと${cd}日で使えます` : ''}</span></div><button id="pl-${k}" data-cact="setPolicy" data-id="${k}" ${cd || Q.kura < cost || !Q.hyo ? 'disabled' : ''}>始める</button></div>`;
      }
    }
  } else if (charTab === 'mon') { // 0.36.0 家紋を選ぶ・作る
    const d = G.monDraft = G.monDraft || (me.mon ? Object.assign({}, me.mon) : monDefault());
    html += `<div class="muted" style="margin-bottom:6px">地図のあなたの印と、独立したときの家の紋になります。${me.mon ? '' : '（いまは家紋なし）'}</div>`;
    html += monEditorHtml(d, 'monPrev') + `<div class="row" style="margin-top:6px"><button id="mk-ok" data-mk="ok">この家紋にする</button></div>`;
  } else if (charTab === 'rank') {
    const R = me.rank, NR = me.nin ? SIM.NRANKS : null, RK = NR ? SIM.RANKS.map((x, i) => (NR[i] ? Object.assign({}, x, NR[i], { cap: 0 }) : x)) : SIM.RANKS, cur = RK[R.rank], nx = R.clan && RK[R.rank + 1] && !RK[R.rank + 1].indep && !(NR && R.rank >= 4) ? RK[R.rank + 1] : null; // 0.77.0 忍びの身分
    if (me.retainers && me.retainers.length) html += `<div class="muted" style="margin-bottom:6px">家臣：${me.retainers.join('・')}（率いる人数+${me.retainers.length * 6}）</div>`;
    html += `<div class="card" style="display:block"><b>${R.clan ? R.clanName + '　' + cur.name : '浪人'}</b><br><span class="muted">${cur.desc}</span>`
      + (R.clan ? `<div class="muted">功績 ${R.merit}　俸禄 ${SIM.money(cur.stipend)}/月　率いる人数+${cur.cap}</div>` : '')
      + (R.clan ? (() => { const fb = SIM.factionBuff(G.view.factions, R.clan); return fb ? `<div class="muted">家の得意：<b>${fb.name}</b>（${fb.text}）</div>` : ''; })() : '')
      + (R.limit ? `<div class="muted">任される城 ${R.held}/${R.limit >= 99 ? '上限なし' : R.limit}</div>` : '')
      + (me.castles && me.castles.length ? `<div class="muted">治めている城：${me.castles.map((c) => `<b>${c.name}</b>（年貢 約${SIM.money(c.tax)}/月${c.lands ? '・領内の村 ' + c.lands.join('・') : ''}${c.mines ? '・' + c.mines.join('・') : ''}）`).join('・')}</div>` : '') + '</div>';
    const B = me.build;
    if (B) {
      html += `<div class="card"><div><b>築城</b>　<span class="muted">いま立っている野外に新しく城を築く（ほかの拠点から${B.minKm}km以上・部将以上）。ここに築くと<b>${SIM.ckName(B.ck || 'hira')}</b>になる<br>`
        + `曲輪・塀・門・堀・櫓を自分で置いて縄張りを描く。費用は城の種類と置いた数で決まる（描かずに築くと決まった形で${SIM.money(B.cost)}）<br>`
        + `${B.site ? `いま${B.site}を普請中です。その城に入って「城」の画面で普請を進めます` : '縄張りのあと、その城で普請を重ねると完成し、あなたが城主になります'}</span></div>`
        + `<div class="row"><button id="rk-nawa" data-cact="openNawa" ${B.canRank && !B.site ? '' : 'disabled'}>縄張りを描いて築く</button><button id="rk-build" data-cact="buildCastle" ${B.canRank && !B.site ? '' : 'disabled'}>決まった形で築く</button></div></div>`;
    }
    if (!R.clan) {
      html += `<div class="muted" style="margin:6px 0">城主のいる城で仕官できます（名声${(R.serveNeed != null ? R.serveNeed : RK[1].fame)}以上）。仕えると俸禄がもらえ、主家の領地の依頼や戦で功績が積めます</div>`;
      if (R.canServe) html += `<div class="card"><div>${R.factionHere}の${R.lordHere}様に仕える</div><button id="rk-serve" data-cact="serve" ${C.fame >= (R.serveNeed != null ? R.serveNeed : RK[1].fame) ? '' : 'disabled'}>武士として仕官</button><button id="rk-serve-n" data-cact="serve" data-nin="1" ${C.fame >= (R.serveNeed != null ? R.serveNeed : RK[1].fame) ? '' : 'disabled'}>忍びとして仕官</button></div>`;
    } else {
      if (nx) html += `<div class="card"><div>次：<b>${nx.name}</b>　<span class="muted">功績${R.merit}/${nx.merit}　名声${C.fame}/${nx.fame}<br>${nx.desc}</span></div><button id="rk-promote" data-cact="promote" ${R.merit >= nx.merit && C.fame >= nx.fame ? '' : 'disabled'}>昇進を願う</button></div>`
        + '';
      if (R.rank >= 6 && !cur.indep && R.held < R.limit) html += `<div class="card"><div>加増を願う<br><span class="muted">城をもう一つ任せてもらう（主家の城で）</span></div><button id="rk-ask" data-cact="askCastle" ${R.atClanCastle ? '' : 'disabled'}>願い出る</button></div>`;
      if (!cur.indep && R.rank >= R.indep.rank - 1) html += `<div class="card"><div><b>独立する</b>　<span class="muted">${RK[R.indep.rank].name}以上・名声${R.indep.fame}以上で、自分の治める城の中で宣言できる。治める城をすべて持って自分の家を興し、大名になる（主家には二度と戻れない）</span></div><button id="rk-indep" data-cact="independence" ${R.indep.can ? '' : 'disabled'}>独立</button></div>`;
      const D = R.daimyo;
      if (D) {
        html += `<div class="muted" style="margin-top:10px">当主として（領地の城 ${D.count}）</div>`;
        if (!D.vassals.length) html += '<div class="muted">家臣はまだいません。ほかのプレイヤーがあなたの城で「仕官する」と家臣になります</div>';
        for (const v of D.vassals) html += `<div class="card"><div>${v.name}　<span class="muted">${v.rank}${v.next ? `　次：${v.next}` : ''}</span></div><button id="vs-${v.id}" data-cact="grantVassal" data-id="${v.id}" ${v.ok ? '' : 'disabled'}>取り立てる</button></div>`;
        if (D.generals.length) { html += '<div class="muted" style="margin-top:6px">武将の忠誠（低いと寝返ることがあります。城で「褒美を与える」と上がります）</div>'; for (const g of D.generals) html += `<div class="muted">${g.name}（${g.castle}）　忠誠 <b style="color:${g.loyal < 30 ? '#e06050' : g.loyal < 50 ? '#d0a040' : 'inherit'}">${g.loyal}</b></div>`; }
        html += `<div class="muted" style="margin-top:6px">外交（宣戦・和睦。和睦は${SIM.money(D.peaceCost)}・相手が断ることも）</div>`;
        for (const d of D.diplo) html += `<div class="card"><div>${d.name}　<span class="muted">城${d.castles}${d.kou ? '　' + d.kou : ''}${d.war ? '　<b style="color:#e06050">交戦中</b>' : d.truce ? `　和睦中（あと${d.truce}日）` : ''}</span></div>`
          + (d.war ? `<button id="dp-${d.id}" data-cact="makePeace" data-id="${d.id}">和睦</button>` : `<button id="dp-${d.id}" data-cact="declareWar" data-id="${d.id}" ${d.truce ? 'disabled' : ''}>宣戦</button>`) + '</div>';
        if (D.open && D.open.length) { html += '<div class="muted" style="margin-top:6px">城主の任命（家臣を城主にすると、その城はCPUの城主が治めます。家臣の枠も空きます）</div>';
          for (const [cid, cn] of D.open) html += `<div class="card"><div>${cn}</div>${D.ret.length ? D.ret.map(([rid, rn]) => `<button id="ap-${cid}-${rid}" data-cact="appointLord" data-id="${cid}" data-who="${rid}">${rn}を任命</button>`).join('') : '<span class="muted">任命できる家臣がいません</span>'}</div>`; }
        for (const [cid, cn, ln] of D.lords || []) html += `<div class="card"><div>${cn}　<span class="muted">城主：${ln}</span></div><button id="dl-${cid}" data-cact="dismissLord" data-id="${cid}">直轄にする</button></div>`;
        for (const c of D.lent) html += `<div class="card"><div>${c.name}　<span class="muted">${c.who}に任せている</span></div><button id="rc-${c.id}" data-cact="recallCastle" data-id="${c.id}">召し上げる</button></div>`;
      }
      if (me.war) {
        const fn = (k) => (G.view.factions[k] || {}).name || k;
        const W = me.war;
        html += `<div class="muted" style="margin-top:10px">戦の相手：${W.enemies.length ? W.enemies.map(fn).join('・') : 'なし'}${W.canSiege ? `　（敵の城の${W.nearKm}km以内で、城を選んで「攻城戦の準備をする」。${W.ar ? W.ar.siegeDays : 5}日後に総攻め）` : ''}</div>`;
        if (W.siege) html += `<div class="muted" style="color:#e8c060">${W.siege.name}の攻城戦準備中：${W.siege.ready ? '総攻めの支度が整っています（城を選んで「総攻めをかける」）' : `総攻めまであと${W.siege.days}日。敵の援軍に注意`}</div>`;
        for (const c of W.camps) html += `<div class="muted" style="color:#e06050">${c.att}の軍勢${c.n}人が${c.to}${c.siege ? `の攻城戦準備中（総攻めまであと${c.days}日）` : `へ進軍中（あと${c.days}日ほど）`}。城に入れば守りに加われます。軍勢に攻めかかって追い払うこともできます</div>`;
        if (W.canMuster) {
          if (W.allies) html += `<div class="card" style="margin-top:6px"><div>陣触れで加わった武将：${W.allies.gens.join('・')}<br><span class="muted">兵${W.allies.n}人・あと${W.allies.days}日。戦ではあなたの部隊として指図できます</span></div><button id="rk-disband" data-cact="disband">解散</button></div>`;
          else html += `<div class="card" style="margin-top:6px"><div>陣触れ（軍勢を集める）<br><span class="muted">主家の城で発すると、近くの城（${W.ar ? W.ar.musterKm : 40}km以内）の武将が城兵の一部を連れて加わります（${W.ar ? W.ar.musterDays : 30}日間）${W.musterCD ? `。あと${W.musterCD}日は発せません` : ''}</span></div><button id="rk-muster" data-cact="muster" ${W.musterCD ? 'disabled' : ''}>陣触れ</button></div>`;
        }
      }
      html += '<div class="muted" style="margin-top:10px">身分の一覧</div>';
      RK.forEach((r, i) => { if (i && !r.indep) html += `<div class="muted">${i === R.rank ? '▶ ' : ''}${r.name}　功績${r.merit}・名声${r.fame}　俸禄${SIM.money(r.stipend)}/月　人数+${r.cap}</div>`; });
      if (!cur.indep) { // 2.33.0 武士⇄忍び
        const toNin = !me.nin, ok = R.atClanCastle && (!toNin || R.rank < 5), nm = toNin ? SIM.NRANKS[Math.min(4, R.rank)].name : SIM.RANKS[R.rank].name;
        html += `<div class="card" style="margin-top:10px"><div><b>${toNin ? '忍びになる' : '武士に戻る'}</b><br><span class="muted">${toNin ? `${nm}になる（同じ格の忍び）。連れている兵は解き放ち、兵は雇えなくなる。敵の城への工作を請け負える${R.rank >= 5 ? '。城を任されている身分ではなれない' : ''}` : `${nm}に戻る（同じ格の武士）。請け負っている工作は取りやめ。兵を雇えるようになる`}。主家の城で願い出る</span></div><button id="rk-role" data-cact="switchRole" ${ok ? '' : 'disabled'}>${toNin ? '忍びになる' : '武士に戻る'}</button></div>`;
      }
      if (!cur.indep) html += `<div class="card" style="margin-top:10px"><div>出奔する<br><span class="muted">浪人に戻る（名声-3、功績は消え、この家には二度と仕えられない${me.castle ? '。城も返上する' : ''}）</span></div><button id="rk-leave" data-cact="leaveClan">出奔</button></div>`;
    }
  } else {
    { const cl = me.cloth || {}, nm = (h) => { if (!h) return '元の色'; const f = SIM.CLOTH && SIM.CLOTH.colors.find(([, c]) => c === h); return f ? f[0] : h; }, sw = (h) => (h ? `<i style="display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;background:${h};border:1px solid rgba(255,255,255,.4)"></i>` : ''); // 2.12.5 服の色
      html += `<div class="card"><div><b>服の色</b>　兵 ${sw(cl.tr)}${nm(cl.tr)}　自分 ${sw(cl.me)}${nm(cl.me)}<br><span class="muted">戦場で見える服の色。人形で確かめてから選べます（変えるたびに${SIM.money(SIM.CLOTH ? SIM.CLOTH.cost : 1000)}）</span></div><button id="cl-open" data-cact="openCloth">色を選ぶ</button></div>`; }
    html += `<div class="muted" style="margin-bottom:6px">兵 ${SIM.troopCount(me.troops)}/${me.troopCap}　所持金 ${SIM.money(me.money)}　給金 ${SIM.money(me.wage)}/日<br>戦や調練で兵が経験を積むと、上の兵種へ昇格できます（どこでもできます）</div>`;
    if (!SIM.troopCount(me.troops)) html += '<div class="muted">まだ兵がいません。拠点の「募兵」で雇えます</div>';
    for (const k in me.troops) {
      const t = TR[k], n = me.troops[k], need = SIM.upNeed(t.tier), xp = Math.floor(C.txp[k] || 0), ready = t.up ? Math.min(n, Math.floor(xp / need)) : 0;
      html += `<div class="card" style="display:block"><b>${t.name}</b> ${n}人　<span class="muted">格${t.tier}　攻${t.atk} 守${t.def} 体${t.hp}${t.ranged ? '　射程' + t.range + 'm' : ''}</span>`;
      if (!t.up) html += '<div class="muted">最上位の兵種です</div>';
      else {
        html += `<div class="muted">経験 ${xp}（1人あたり${need}）　昇格できる人数 ${ready}</div>`;
        for (const to of t.up) {
          const u = TR[to], cost = SIM.upCost({ perks: C.perks }, to), lock = u.fame && C.fame < u.fame;
          html += `<div class="row" style="margin-top:4px;align-items:center"><span>→ ${u.name}　<span class="muted">攻${u.atk} 守${u.def} 体${u.hp}　1人 ${SIM.money(cost)}${lock ? `　名声${u.fame}以上` : ''}</span></span>`
            + `<button id="up1-${k}-${to}" data-cact="upgrade" data-from="${k}" data-to="${to}" data-qty="1" ${ready && !lock ? '' : 'disabled'}>1人</button>`
            + `<button id="upa-${k}-${to}" data-cact="upgrade" data-from="${k}" data-to="${to}" data-qty="999" ${ready && !lock ? '' : 'disabled'}>全員</button></div>`;
        }
      }
      html += '</div>';
    }
  }
  if (html !== charHtml) { charHtml = html; $('charBody').innerHTML = html; const c = $('char'), f = currentFocus(c); if (f) setFocus(c, f);
    drawMonPrev('monPrev', G.monDraft); }
}
$('charBody').addEventListener('click', (e) => {
  const m = e.target.closest('button[data-mk]'); if (!m || !G.monDraft) return;
  if (m.dataset.mk === 'ok') { command({ type: 'setMon', mon: G.monDraft }); return; }
  G.monDraft = monStep(G.monDraft, m.dataset.mk, +m.dataset.md); renderChar();
});
$('charBody').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cact]'); if (!b) return;
  if (b.dataset.cact === 'openCloth') { if (SGK.CLOTHUI && G.priv) SGK.CLOTHUI.open(G.priv.me); return; } // 2.12.5 服の色
  if (b.dataset.cact === 'openNawa') { const me2 = G.priv && G.priv.me; if (me2 && me2.build && SGK.NAWAEDIT) SGK.NAWAEDIT.open({ mode: 'new', ck: me2.build.ck, money: me2.money }); return; } // 2.12.0 縄張りを描く
  if (b.dataset.cact === 'goPol') return setCTab('pol');
  if (b.dataset.cact === 'backChar') return setCTab('eq');
  const c = { type: b.dataset.cact };
  for (const k of ['attr', 'id', 'from', 'to', 'who', 'nin']) if (b.dataset[k]) c[k] = b.dataset[k];
  if (b.dataset.qty) c.qty = +b.dataset.qty;
  command(c);
});
document.querySelectorAll('#char [data-ctab]').forEach((b) => (b.onclick = () => setCTab(b.dataset.ctab)));
$('charClose').onclick = () => openChar(false);
$('charTitle').onclick = () => { charTab = 'title'; charHtml = ''; renderChar(); setFocus($('char'), $('charTitle')); }; // 2.9.0 称号の一覧
$('hudL').onclick = () => { if ($('char').classList.contains('hidden')) openChar(true); else openChar(false); }; /* 1.6.31 左上の窓をタップで人物 */
// 0.54.10 ウインドウの上で右クリック：そのウインドウを閉じる（マウスだけで操作できるように）
$('char').addEventListener('contextmenu', (e) => { e.preventDefault(); openChar(false); });
$('town').addEventListener('contextmenu', (e) => { e.preventDefault(); openTown(false); });
$('info').addEventListener('contextmenu', (e) => { e.preventDefault(); selectSettlement(null); });
$('charBtn').onclick = () => openChar(true);
$('mChar').onclick = () => openChar(true);
$('townChar').onclick = () => openChar(true); // 0.29.2 拠点の画面からも人物を開ける

