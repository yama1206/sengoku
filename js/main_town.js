// 拠点の中（市場・依頼・仕事・話す）
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- 拠点の中（市場・依頼・仕事・話す） ----------
const IT = SGK.DATA.items;
// 値段の色：相場より安いほど青、高いほど赤（相場の半分・2倍でいちばん濃い）
function priceCol(r) {
  const t = Math.max(-1, Math.min(1, Math.log(r) / Math.LN2)), N = [236, 228, 210], C = t < 0 ? [80, 160, 255] : [255, 85, 70], a = Math.abs(t);
  return `rgb(${N.map((n, i) => Math.round(n + (C[i] - n) * a)).join(',')})`;
}
let townTab = 'street', townHtml = '', stageKey = '';
const TOWN_BGM = { renpei: 'renpei', gamble: 'gamble', talk: 'chaya', home: 'home', market: 'market' }; // 2.14.3 行き先ごとの曲（ほかは町の曲）。2.20.0 市場
// 2.13.0 町の中：通りの絵から市場・練兵所・賭場・話す（・城・自宅）へ。練兵所＝募兵・調練と仕事・依頼
const TOWN_SECS = { street: [], renpei: ['army', 'work', 'jobs'] }, SEC_NAME = { army: '募兵', work: '調練・仕事', jobs: '依頼', castle: '城' };
const TA = 'assets/town/';
// 0.41.0 拠点への投資（2.61.2 関数に。村は村長のタブ、町・城は練兵所の仕事の下）
function investHtml(h, me, s) {
  const V = h.invest; if (!V) return '';
  let html = '';
  const kind = s.type === 'village' ? '村' : s.type === 'town' ? '町' : '城下';
  html += `<div class="muted" style="margin-top:10px">投資　所持金 ${SIM.money(me.money)}</div>`;
  html += `<div class="card" style="display:block"><b>規模 ${V.lv}/${V.max}</b>　${V.name}${kind}<br><span class="muted">いま 生産+${V.prod}%・兵の補充+${V.pool}%`
    + (V.mine ? `<br>あなたの出資 ${SIM.money(V.mine)}（毎月の配当 約${SIM.money(V.div)}）` : '') + '</span>'
    + (V.lv < V.max ? `<div class="bar"><i style="width:${Math.round((1 - V.need / V.next) * 100)}%"></i></div><span class="muted">次の規模まで あと${SIM.money(V.need)}。上がると生産+20%・兵の補充の速さと上限+30%。出した額の${Math.round((SIM.INVEST ? SIM.INVEST.divid : 0.05) * 100)}%が毎月配当で戻り、2貫ごとに名声+1</span>` : '<br><span class="muted">これ以上は大きくなりません</span>')
    + '</div>';
  if (V.lv < V.max) html += `<div class="row">${V.steps.map((q) => `<button id="iv-${q}" data-act="invest" data-qty="${q}" ${me.money >= Math.min(q, V.need) ? '' : 'disabled'}>${SIM.money(q)}出す</button>`).join('')}<button id="iv-rest" data-act="invest" data-kind="rest" ${me.money >= 1 ? '' : 'disabled'}>残りを出す（${SIM.money(V.need)}）</button></div>`;
  return html;
}
function townStage(P, hs) {
  const me = P.me, h = P.here, mu = h.musume, big = SGK.DATA.isBig(hs), isHome = me.home && me.home.id === h.id;
  const say = (who, t) => `<div class="say"><b>${who}</b>${t}</div>`;
  if (townTab === 'street') {
    return ['street', 'street2.jpg', '']; // 2.13.1 行き先は上のボタン（ほかの所と同じ並び）
  }
  if (townTab === 'market') {
    return ['', 'shop.jpg', `<img class="who" src="${TA}merchant_p.png" style="transform:scaleX(-1)">` + say('商人', 'いらっしゃい。よい品が入っていますよ')];
  }
  if (townTab === 'renpei') { const o = h.otoko; // 2.61.0 大きな町の練兵所には、仲良くなれる男がいる
    if (o) return ['', 'renpei.jpg', `<img class="who" src="${TA}${o.img}.png" onerror="this.onerror=null;this.src='${TA}drill_p.png'">` + say(`${o.name}　<span class="heart">${'♥'.repeat(o.st)}${'♡'.repeat(4 - o.st)}</span>`, o.line)];
    return ['', 'renpei.jpg', `<img class="who" src="${TA}drill_p.png">` + say('練兵所の師範', '腕を上げたければ、ここで鍛えていけ。兵も雇えるし、仕事の口も回してやるぞ')]; }
  if (townTab === 'gosho' && h.gosho) return ['', 'gosho.jpg', `<img class="who" src="${TA}gosho_p.png" onerror="this.src='${TA}merchant_p.png'">` + say(h.gosho.name, me.sho && me.sho.house === h.id ? 'おう、精が出るな。商いは信用が第一だぞ' : '手前どもの蔵には、よそでは手に入らぬ家宝がございます')]; // 2.55.0 豪商
  if (townTab === 'soncho' && h.soncho) return ['', 'soncho.jpg', `<img class="who" src="${TA}soncho_p.png">` + say(h.soncho.me ? '村の衆' : `村長 ${h.soncho.head}`, h.soncho.me ? '村長様、今日もよろしくお願いいたします' : me.nomin && h.soncho.mine ? 'おう、今日も精を出してくれよ。田んぼは待ってくれんでな' : '見ねえ顔だな。働き手ならいつでも歓迎するぞ')]; // 2.56.1 村長
  if (townTab === 'mise') return ['', 'shop.jpg', `<img class="who" src="${TA}merchant_p.png">` + say('店の番頭', me.shoka && me.shoka.own ? '旦那様、本日も商いに励みます' : '自分の店を持つのは、商人の夢でございます')]; // 2.56.0 自分の店
  if (townTab === 'minato') return ['', 'minato.jpg', say('湊の船問屋', '海の向こうとの商いなら、船と腕のいい船乗りが要りますぜ')]; // 2.55.0 湊
  if (townTab === 'gamble') return ['', '../gamble/den.jpg', `<img class="who" src="${TA}boss4.png">` + say('賭場の胴元', 'おう、遊んでいくかい。運も腕のうちだぜ')];
  if (townTab === 'talk') { // 2.13.1 茶屋：大きな町には娘がいる
    if (mu) return ['', 'chaya.jpg', `<img class="who" src="${TA}${mu.img}.png">` + say(`${mu.name}　<span class="heart">${'♥'.repeat(mu.wife ? 5 : mu.st)}${'♡'.repeat(mu.wife ? 0 : 4 - mu.st)}</span>`, (G.muSay && G.muSay[0] === mu.id && performance.now() - G.muSay[2] < 6000) ? G.muSay[1] : mu.line)];
    return ['', 'chaya.jpg', say('茶屋', '旅の人や町の人が、相場や戦の噂をしている')];
  }
  if (townTab === 'home') { const wf = me.wife; return isHome ? ['', 'home.jpg', wf ? `<img class="who" src="${TA}${wf.img}.png">` + say(wf.name, wf.line) : say('自宅', '落ち着ける我が家。金庫と物置があり、ゆっくり休める')] : ['none', '', '']; }
  return ['none', '', ''];
}
function kemariHtml(h) { // 2.62.0 蹴鞠大会（毎月5日・大きな町）の知らせと番付
  const k = h && h.kemari; if (!k) return '';
  const nm = (x) => String(x).replace(/[&<>"]/g, '');
  if (k.dom < 5) return '<div class="muted" style="margin-top:4px">明日5日は、この町で蹴鞠大会（2人以上で蹴鞠を続けた回数を競う）</div>';
  const bd = k.board.length ? k.board.map((x, i) => `${i + 1}. ${nm(x.name)} ${x.cnt}回（${x.kicks}）`).join('　') : 'まだ記録はありません';
  return `<div style="margin-top:4px"><b style="color:#f2c14e">${k.on ? '本日、蹴鞠大会！' : k.dom >= 8 ? '今月の蹴鞠大会の結果' : '蹴鞠大会の番付（8日に順位が決まります）'}</b> <span class="muted">${k.on ? '2人以上で蹴鞠を始めると記録が残ります。3位まで賞金（10回以上）' : ''}</span><br><span class="muted">${bd}</span></div>`;
}
const dayLeft = (dl) => { const d = (dl - G.view.t) / 1440; return d >= 1 ? `あと${Math.floor(d)}日` : 'まもなく期限'; };
const sName = (id) => (G.view.settlements.find((x) => x.id === id) || {}).name || '?';
function openTown(open, keep) {
  const t = $('town');
  if (open === false || !G.priv || !G.priv.here) { t.classList.add('hidden'); return; }
  if (!keep) townTab = 'street'; // 2.13.0 拠点に入ったら通りの絵から
  t.classList.remove('hidden'); townHtml = ''; stageKey = ''; renderTown(); setFocus(t, keep ? currentFocus(t) : $('tab-market'));
}
function setTab(tab) { townTab = tab; townHtml = ''; stageKey = ''; renderTown(); const t = $('town'); setFocus(t, $('tab-' + tab)); }
function renderTown() {
  const P = G.priv; if (!P || !P.here) return openTown(false);
  const me = P.me, h = P.here, hs = G.view.settlements.find((x) => x.id === h.id);
  $('tab-castle').classList.toggle('hidden', !hs || hs.type !== 'castle');
  $('tab-gamble').classList.toggle('hidden', !SGK.DATA.isBig(hs)); /* 2.8.0 賭場は大きな町だけ */
  if (townTab === 'gamble' && !SGK.DATA.isBig(hs)) townTab = 'street';
  if (townTab === 'castle' && (!hs || hs.type !== 'castle')) townTab = 'street';
  $('tab-gosho').classList.toggle('hidden', !h.gosho); $('tab-minato').classList.toggle('hidden', !h.port); $('tab-mise').classList.toggle('hidden', !h.mise); // 2.56.0 店
  $('tab-soncho').classList.toggle('hidden', !h.soncho); if (townTab === 'soncho' && !h.soncho) townTab = 'street'; // 2.56.1 村長 // 2.55.0 豪商（大きな町）・湊（南蛮貿易の湊）
  if ((townTab === 'gosho' && !h.gosho) || (townTab === 'minato' && !h.port) || (townTab === 'mise' && !h.mise)) townTab = 'street';
  { const [cls, bg, inner] = townStage(P, hs), key = townTab + '|' + bg + '|' + inner; // 2.13.0 町の絵
    if (key !== stageKey) { stageKey = key; const st = $('townStage'); st.className = cls; st.style.backgroundImage = bg ? `url(${TA}${bg})` : ''; st.innerHTML = inner; } }
  $('townName').textContent = sName(h.id) + (SGK.DATA.isBig(hs) ? '（大きな町）' : '');
  document.querySelectorAll('#town [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === townTab));
  let html = '';
  const NJ = me.nin; // 0.77.0 忍び：工作の城に入ったら「忍び込む」
  const njName = (q) => SIM.NIN.jobs[q.k].name + (q.k === 'steal' && SIM.NIN.steal[q.sk] ? `（${SIM.NIN.steal[q.sk].name}）` : ''); // 2.24.0
  const njDesc = (q) => (q.k === 'steal' && SIM.NIN.steal[q.sk] ? SIM.NIN.steal[q.sk].desc + `（${SIM.NIN.steal[q.sk].where}にある）` : q.k === 'hurt' ? `寝所の${q.whoName || '武将'}に手傷を負わせる（殺しはしない）。成功すると${q.whoName || 'その武将'}は${SIM.NIN.hurtDays}日のあいだ出陣できない` : SIM.NIN.jobs[q.k].desc);
  if (NJ && NJ.atTgt && NJ.q) html += `<div class="card" style="display:block;border-color:#c33"><b>${njName(NJ.q)}</b>（${NJ.q.foe}・${NJ.q.toName}）<br><span class="muted">${njDesc(NJ.q)}。見張り${NJ.d.guards}人・${NJ.d.ck === 'yama' ? '山城' : NJ.d.ck === 'mizu' ? '水城' : '平城'}・${NJ.d.night ? '夜（見張りの目が届きにくい）' : '昼'}・難しさ${SGK.ICON.html('star', 14).repeat(NJ.d.lv)}</span>${NJ.pvp ? `<br><b style="color:#ff8a6a">${NJ.pvp.here ? `守りの忍び「${String(NJ.pvp.name).replace(/[<&]/g, '')}」がこの城で待ち構えている（忍び込むと対戦になる）` : `守りの忍び「${String(NJ.pvp.name).replace(/[<&]/g, '')}」が駆けつけてくるかもしれない`}</b>` : ''}<div class="row" style="margin-top:4px"><button id="nj-go" data-nj="go">忍び込む</button>${!NJ.room ? '<button id="nj-rec" data-act="ninRecruit">仲間を募る</button>' : ''}</div>${njRoomHtml(NJ.room)}</div>`;
  const njDefTxt = (q) => `${q.foeName}の忍び${q.pvp ? `「${String(q.pvpName).replace(/[<&]/g, '')}」` : q.n > 1 ? q.n + '人' : ''}が${q.toName}${q.pvp ? 'で' : 'に入り込み、'}${njName(q)}${q.k === 'hurt' ? `（${q.whoName || '武将'}）` : ''}を狙っている`; // 2.57.0 城の守り
  if (NJ && NJ.def && NJ.def.pvp && NJ.def.at) html += `<div class="card" style="display:block;border-color:#c33"><b>城の守り（人の忍び）</b>（${NJ.def.toName}）<br><span class="muted">${njDefTxt(NJ.def)}。この城で待ち構えていると、相手が忍び込んできたときに一緒の3Dが始まります（城を出ないでください）。後ろから近づいて当て身で捕らえれば勝ち。相手に工作を果たされて城下へ抜けられたら負け。${dayLeft(NJ.def.deadline)}・報酬${SIM.money(NJ.def.reward)}</span></div>`; // 2.57.1
  else if (NJ && NJ.def && NJ.def.pvp) html += `<div class="card" style="display:block;border-color:#c33"><b>急報：城の守り（人の忍び）</b><br><span class="muted">${njDefTxt(NJ.def)}。${NJ.def.toName}へ駆けつけて待ち構えてください（${dayLeft(NJ.def.deadline)}）。間に合わなければ相手は見張りだけを相手にします</span><div class="row" style="margin-top:4px"><button id="nj-deflook" data-look="${NJ.def.to}">地図で見る</button></div></div>`;
  else if (NJ && NJ.def && NJ.def.at) html += `<div class="card" style="display:block;border-color:#c33"><b>城の守り</b>（${NJ.def.toName}）<br><span class="muted">${njDefTxt(NJ.def)}。城の中で曲者を探し、追って当て身で捕らえる（生け捕りにすると敵の動きが分かる）。${NJ.def.d ? `${NJ.def.d.ck === 'yama' ? '山城' : NJ.def.d.ck === 'mizu' ? '水城' : '平城'}・${NJ.def.d.night ? '夜（曲者が見えにくい）' : '昼'}・` : ''}${dayLeft(NJ.def.deadline)}・報酬${SIM.money(NJ.def.reward)}</span><div class="row" style="margin-top:4px"><button id="nj-def" data-njdef="go">曲者を探す</button></div></div>`;
  else if (NJ && NJ.def) html += `<div class="card" style="display:block;border-color:#c33"><b>急報：城の守り</b><br><span class="muted">${njDefTxt(NJ.def)}。期限までに${NJ.def.toName}へ駆けつけてください（${dayLeft(NJ.def.deadline)}）。間に合わないと工作を果たされます</span><div class="row" style="margin-top:4px"><button id="nj-deflook" data-look="${NJ.def.to}">地図で見る</button></div></div>`;
  if (townTab === 'street' && SGK.PARTY) html += '<div class="card" style="display:block"><b>みんなで遊ぶ</b>（同じ町にいる人を誘えます。2人から）<div class="row" style="margin-top:4px"><button data-party="race">馬の障害レース</button><button data-party="archery">弓の的当て</button><button data-party="fish">釣り大会</button><button data-party="cart">荷運び競争</button><button data-party="kemari">蹴鞠</button><button data-party="hayashi">囃子合わせ</button><button data-party="hide">かくれんぼ？</button></div>' + kemariHtml(h) + '</div>';
  if (townTab === 'street') html += `<div class="muted">${hs && hs.type === 'village' ? '村' : '町'}の通りです。上のボタンから行き先を選んでください</div>`;
  if (townTab === 'renpei' && h.otoko) { const m = h.otoko, gifts = Object.keys(me.inv || {}).filter((k) => me.inv[k] > 0 && IT[k]); // 2.61.0 練兵所の男（看板娘と同じ。命令は data-id="man"）
    html += `<div class="card" style="display:block"><b>${m.name}</b>（${m.role}・${m.age}歳くらい）　仲 ${m.a}/100・${m.stName}${m.like ? `　好きな品：${IT[m.like].name}` : '　好きな品：？（顔なじみになると分かる）'}`
      + `<div class="row" style="flex-wrap:wrap;margin-top:4px"><button id="rp-talk" data-act="musume" data-id="man" data-kind="talk" ${m.talked ? 'disabled' : ''}>${m.talked ? '今日は話した' : '話す'}</button>`
      + (m.gifted ? '<button disabled>今日は贈った</button>' : gifts.map((k) => `<button id="rp-g-${k}" data-act="musume" data-id="man" data-kind="gift" data-item="${k}">${IT[k].name}を贈る</button>`).join(''))
      + `<button id="rp-date" data-act="musume" data-id="man" data-kind="date" ${m.a < SIM.MUSUME.dateNeed || m.dated || me.money < SIM.MUSUME.dateCost ? 'disabled' : ''}>酒を酌み交わす（${SIM.money(SIM.MUSUME.dateCost)}）</button>`
      + (!m.married && m.st >= 4 ? '<button id="rp-pro" data-act="musume" data-id="man" data-kind="propose" style="border-color:#e0607e">想いを伝える</button>' : '')
      + `</div><span class="muted">話す・贈り物は1日1回。${m.a < SIM.MUSUME.dateNeed ? `仲が${SIM.MUSUME.dateNeed}になると酒を酌み交わせます。` : ''}${m.married ? 'あなたには連れ合いがいます' : '仲が100になると想いを伝えられます'}</span></div>`; }
  let secs = TOWN_SECS[townTab] || [townTab]; // 2.61.6 城のある拠点では、依頼は城のタブで受ける（練兵所からは外す）
  if (hs && hs.type === 'castle') { if (townTab === 'renpei') secs = secs.filter((x) => x !== 'jobs'); else if (townTab === 'castle') secs = ['jobs', 'castle']; }
  for (const sec of secs) { if (secs.length > 1) html += `<div class="secH">${SEC_NAME[sec]}</div>`;
  if (sec === 'talk' && h.musume) { const m = h.musume, gifts = Object.keys(me.inv || {}).filter((k) => me.inv[k] > 0 && IT[k]); // 2.13.0 看板娘
    html += `<div class="card" style="display:block"><b>${m.name}</b>　仲 ${m.a}/100・${m.wife ? '夫婦' : m.stName}${m.like ? `　好きな品：${IT[m.like].name}` : '　好きな品：？（顔なじみになると分かる）'}`
      + `<div class="row" style="flex-wrap:wrap;margin-top:4px"><button id="mu-talk" data-act="musume" data-kind="talk" ${m.talked ? 'disabled' : ''}>${m.talked ? '今日は話した' : '話す'}</button>`
      + (m.gifted ? '<button disabled>今日は贈った</button>' : gifts.map((k) => `<button id="mu-g-${k}" data-act="musume" data-kind="gift" data-item="${k}">${IT[k].name}を贈る</button>`).join(''))
      + (m.wife ? '' : `<button id="mu-date" data-act="musume" data-kind="date" ${m.a < SIM.MUSUME.dateNeed || m.dated || me.money < SIM.MUSUME.dateCost ? 'disabled' : ''}>お団子をごちそうする（${SIM.money(SIM.MUSUME.dateCost)}）</button>`)
      + (!m.married && m.st >= 4 ? '<button id="mu-pro" data-act="musume" data-kind="propose" style="border-color:#e0607e">想いを伝える</button>' : '')
      + `</div><span class="muted">話す・贈り物は1日1回。${m.a < SIM.MUSUME.dateNeed ? `仲が${SIM.MUSUME.dateNeed}になるとお団子をごちそうできます。` : ''}${m.married && !m.wife ? 'あなたには連れ合いがいます' : '仲が100になると想いを伝えられます'}</span></div>`; }
  if (sec === 'market') {
    html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　${loadTxt(me)}</div><div class="grid">`;
    html += '<span class="h">品</span><span class="h">買値</span><span class="h">売値</span><span class="h">在庫</span><span class="h">所持</span><span></span><span></span><span></span><span></span>';
    for (const [k, buy, sell, stock] of h.market.slice().sort((a, b) => IT[a[0]].base - IT[b[0]].base)) { // 1.6.87 相場の安い順
      const it = IT[k], have = me.inv[k] || 0;
      const memo = ''; // 0.74.4 相場の記録（高く売れる・安く買える）は表示しない
      html += `<span>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}${it.name}${SGK.DATA.toku(hs) === k ? '<b style="color:#e8b923">（特産）</b>' : ''}<span class="muted">/${it.unit}・${it.wt}kg<br>相場${it.base}文</span>${memo}</span><span style="color:${priceCol(buy / 1.1 / it.base)}">${buy}文</span><span style="color:${priceCol(sell / 0.9 / it.base)}">${sell}文</span><span>${stock}</span><span>${have}${have && me.cost && me.cost[k] != null ? `<br><span style="font-size:11px;color:${sell >= me.cost[k] ? '#6fbf73' : '#e07a6a'}">平均${Math.round(me.cost[k])}文</span>` : ''}</span>`
        + ((h.noBuy || []).includes(k) ? `<button id="b1-${k}" disabled title="調達の依頼が出ているので買えない">依頼品</button><button id="b10-${k}" disabled>－</button>` : `<button id="b1-${k}" data-act="buy" data-item="${k}" data-qty="1">買1</button><button id="b10-${k}" data-act="buy" data-item="${k}" data-qty="10">買10</button>`)
        + `<button id="s1-${k}" data-act="sell" data-item="${k}" data-qty="1" ${have ? '' : 'disabled'}>売1</button><button id="sa-${k}" data-act="sell" data-item="${k}" data-qty="999" ${have ? '' : 'disabled'}>全部</button>`;
    }
    html += '</div>';
    // 0.47.0 武具（町・城）
    const EQ = SIM.EQUIP, E = me.equip || {};
    if (E && (h.shop || []).length) {
      const cur = (sl) => (E[sl] && EQ[sl][E[sl]]) ? EQ[sl][E[sl]].name : 'なし';
      const wk = E.wep && EQ.wep[E.wep] ? EQ.wep[E.wep].kind : null;
      html += `<div class="muted" style="margin-top:10px">武具（前の装備は荷に入ります。人物の装備タブで付け替え・売却）　いまの装備：武器 ${cur('wep')}${wk ? `（${EQ.groupName[wk]}に入る）` : ''}・副武器 ${E.wep2 ? EQ.wep[E.wep2].name : 'なし'}・防具 ${cur('arm')}・馬 ${cur('horse')}</div>`;
      if (E.wep2) html += `<div class="row" style="margin:4px 0"><button id="eqSwap" data-act="swapWep">主の武器と副武器を入れ替える</button></div>`;
      for (const [sl, id] of h.shop) {
        const e = EQ[sl][id], have = E[sl] === id;
        const ex = SIM.eqFxText(e), eff = (sl === 'wep' ? `${EQ.kindName[e.kind]}・${EQ.groupName[e.kind]}に入る${e.atk ? `・攻撃+${e.atk}` : ''}` : sl === 'arm' ? `守り+${e.da}` : `1日の移動+${e.km}km`) + (ex ? `<br><b style="color:#e8c46a">${ex}</b>` : '');
        const own2 = sl === 'wep' && E.wep2 === id;
        const b2 = sl === 'wep' ? `<button id="eq2-${id}" data-act="buyEquip" data-kind="wep2" data-id="${id}" ${have || own2 || me.money < e.cost ? 'disabled' : ''}>${own2 ? '副で装備中' : '副武器に買う'}</button>` : '';
        html += `<div class="card"><div><b>${e.name}</b>　<span class="muted">${EQ.slotName[sl]}　${SIM.money(e.cost)}${e.wt ? `　${e.wt}kg` : e.cw ? `　荷+${e.cw}kg` : ''}<br>${eff}</span></div><div class="row"><button id="eq-${id}" data-act="buyEquip" data-kind="${sl}" data-id="${id}" ${have || own2 || me.money < e.cost ? 'disabled' : ''}>${have ? '装備中' : sl === 'wep' ? '主に買う' : '買う'}</button>${b2}</div></div>`;
      }
    }
  } else if (sec === 'gosho' || sec === 'minato') { if (SGK.GOSHOUI) html += SGK.GOSHOUI[sec](P); // 2.55.0
    if (sec === 'gosho' && SGK.SHOKAUI) html += SGK.SHOKAUI.kaigo(P); // 2.56.0 堺の会合衆
  } else if (sec === 'mise') { if (SGK.SHOKAUI) html += SGK.SHOKAUI.mise(P); // 2.56.0 自分の店
  } else if (sec === 'soncho') { if (SGK.NOMINUI) html += SGK.NOMINUI.soncho(P); // 2.56.1 村長
    { const sv = G.view.settlements.find((x) => x.id === h.id); if (sv && sv.type === 'village') html += investHtml(h, me, sv); } // 2.61.2 村への投資は村長のところで
  } else if (sec === 'jobs') {
    html += `<div class="muted">受けている依頼（${me.quests.length}/3）</div>`;
    if (!me.quests.length) html += '<div class="muted" style="margin:4px 0 8px">なし</div>';
    for (const q of me.quests) {
      const where = q.where || (q.type === 'deliver' ? `届け先：${sName(q.to)}` : `納品先：${sName(q.from)}（所持 ${me.inv[q.item] || 0}/${q.qty}）`);
      const canDeliver = q.type === 'procure' && q.from === h.id;
      const canAct = q.act && q.actAt === h.id && !(q.type === 'labor' && me.busy);
      html += `<div class="card"><div><b>${q.title}</b><br><span class="muted">${where}　報酬 ${SIM.money(q.reward)}　${dayLeft(q.deadline)}</span></div><div class="row">`
        + (canDeliver ? `<button id="dq-${q.id}" data-act="deliverJob" data-id="${q.id}">納品</button>` : '')
        + (canAct ? `<button id="qa-${q.id}" data-act="questAct" data-id="${q.id}">${q.act}</button>` : '')
        + (q.pt ? `<button id="ql-${q.id}" data-lookxy="${q.pt[0]},${q.pt[1]}">地図で見る</button>` : q.mk && q.mk !== h.id ? `<button id="ql-${q.id}" data-look="${q.mk}">地図で見る</button>` : '')
        + `<button id="aq-${q.id}" data-act="abandonJob" data-id="${q.id}">やめる</button></div></div>`;
    }
    html += '<div class="muted" style="margin-top:10px">この拠点の依頼</div>';
    if (!h.jobs.length) html += '<div class="muted" style="margin-top:4px">いまは依頼がありません</div>';
    { const hs = G.view.settlements.find((x) => x.id === h.id); if (hs && hs.type === 'castle' && !(G.priv.me && G.priv.me.rank && G.priv.me.rank.clan === hs.owner)) html += '<div class="muted" style="margin-top:4px">兵糧の運び込みは、この家に仕えると受けられます（偵察・調略の使いは忍びとして仕えると受けられます）</div>'; }
    for (const j of h.jobs) {
      const to = j.type === 'deliver' && G.view.settlements.find((x) => x.id === j.to), fr = G.view.settlements.find((x) => x.id === j.from);
      const km = to && fr ? Math.round(Math.hypot(to.x - fr.x, to.y - fr.y)) : null;
      const what = j.what ? j.what : j.type === 'deliver' ? `届け先：${sName(j.to)}${km != null ? `（${dirOf(fr, to)}へ約${km}km）` : ''}` : `${IT[j.item].name}を${j.qty}${IT[j.item].unit}、ここへ納品`;
      html += `<div class="card"><div><b>${j.title}</b>　<span class="muted">依頼主：${j.giver}</span><br><span class="muted">${what}　報酬 ${SIM.money(j.reward)}　期限${j.days}日</span></div><div class="row">`
        + (to || j.look ? `<button id="lk-${j.id}" data-look="${to ? j.to : j.look}" data-job="${j.id}">地図で見る</button>` : '') + `<button id="ac-${j.id}" data-act="acceptJob" data-id="${j.id}">受ける</button></div></div>`;
    }
  } else if (sec === 'work') {
    const s = G.view.settlements.find((x) => x.id === h.id);
    if (me.busy) {
      const left = Math.max(0, Math.ceil((me.busy.until - G.view.t) / 60));
      html += `<div class="card"><div><b>${me.busy.label}</b>の最中です<br><span class="muted">残り約${left}時間</span></div><button id="cw" data-act="cancelWork">取りやめる</button></div>`;
    } else if (s.type === 'village') {
      html += `<div class="card"><div><b>薪拾い</b><br><span class="muted">6時間　薪を3〜5束（荷に空きが必要）</span></div><button id="wg" data-act="work" data-kind="gather">始める</button></div>`;
    } else {
      html += `<div class="card"><div><b>調練</b><br><span class="muted">8時間　率いている兵が経験を積む（調練の技能も伸びる）</span></div><button id="wd" data-act="work" data-kind="drill">始める</button></div>`;
      html += `<div class="card"><div><b>人足仕事</b><br><span class="muted">8時間　荷運びなどの日雇い仕事で賃金をもらう</span></div><button id="wl" data-act="work" data-kind="labor">始める</button></div>`;
    }
    html += '<div class="muted">仕事中は移動できません。</div>';
    if (s.type !== 'village') html += investHtml(h, me, s); // 2.61.2 村の投資は村長のところで
  } else if (sec === 'army') {
    const TR = SIM.TROOPS, n = SIM.troopCount(me.troops);
    html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　兵 ${n}/${me.troopCap}　給金 ${SIM.money(me.wage)}/日</div>`;
    html += '<div class="muted">この拠点で雇える兵</div>';
    if (h.chiho && SIM.CHIHO && SIM.CHIHO[h.chiho]) { const r = SIM.CHIHO[h.chiho]; html += `<div class="muted" style="margin-bottom:4px">${r.name}の兵　強み：${r.good}　弱み：${r.bad}</div>`; } // 2.17.0
    for (const [k, avail, hm] of h.recruit) {
      const t = TR[k];
      html += `<div class="card"><div><b>${t.name}</b>${t.home ? '　<span class="muted">〔名物〕</span>' : ''}　<span class="muted">${avail}人</span><br><span class="muted">1人 ${SIM.money(Math.round(t.cost * (me.costMod || 1) * (hm || 1)))}　給金 ${t.wage}文/日${t.fame ? `　名声${t.fame}以上` : ''}</span></div><div class="row">`
        + `<button id="r1-${k}" data-act="recruit" data-kind="${k}" data-qty="1" ${avail ? '' : 'disabled'}>雇う1</button><button id="r5-${k}" data-act="recruit" data-kind="${k}" data-qty="5" ${avail ? '' : 'disabled'}>雇う5</button></div></div>`;
    }
    html += '<div class="muted" style="margin-top:10px">率いている兵</div>';
    if (!n) html += '<div class="muted" style="margin-top:4px">まだいません。野盗（地図の×印）と戦うには兵を雇いましょう</div>';
    for (const k in me.troops) html += `<div class="card"><div>${TR[k].name}　${me.troops[k]}人</div><button id="dm-${k}" data-act="dismiss" data-kind="${k}" data-qty="1">1人解き放つ</button></div>`;
  } else if (sec === 'castle') {
    const C = (me.castles || []).find((c) => c.id === h.id);
    if (SGK.GOSHOUI && hs && me.rank && hs.owner === me.rank.clan) html += SGK.GOSHOUI.kenjo(P); // 2.55.0 家宝の献上
    if (SGK.SHOKAUI && h.goyo) html += SGK.SHOKAUI.goyo(P); // 2.56.0 御用商人
    if (NJ) { // 0.77.0 忍びの工作の依頼（主家の城で）
      if (NJ.q) html += `<div class="card"><div><b>請け負っている工作</b>　${njName(NJ.q)}：${NJ.q.foe}の${NJ.q.toName}<br><span class="muted">報酬${SIM.money(NJ.q.reward)}・${dayLeft(NJ.q.deadline)}</span></div><button id="nj-look" data-look="${NJ.q.to}">地図で見る</button><button id="nj-drop" data-act="ninDrop">取りやめる</button></div>`;
      else if (NJ.offers.length) for (const o of NJ.offers) html += `<div class="card"><div><b>${njName(o)}</b>　${o.foe}の${o.toName}（${o.km}km・期限${o.days}日）<br><span class="muted">${njDesc(o)}。報酬${SIM.money(o.reward)}</span></div><button id="nj-${o.k}" data-act="ninTake" data-id="${o.id}">請け負う</button></div>`;
      else if (hs && hs.owner === me.rank.clan) html += `<div class="muted" style="margin-bottom:6px">いま工作を頼める敵の城がありません（戦をしている家の100km以内の城が対象）</div>`;
      if (hs && hs.owner === me.rank.clan) { // 2.24.0 忍び道具
        html += '<div class="secH">忍び道具</div>';
        for (const [k, t] of Object.entries(SIM.NIN.tools)) { const n = (NJ.tools || {})[k] || 0; html += `<div class="card"><div><b>${t.name}</b>　${n}/${t.max}<br><span class="muted">${t.desc}。${SIM.money(t.price)}</span></div><button id="nt-${k}" data-act="ninBuy" data-kind="${k}" ${n >= t.max || me.money < t.price ? 'disabled' : ''}>買う</button></div>`; }
      }
    }
    if (h.site != null) {
      const B = me.build;
      html += `<div class="card" style="display:block"><b>普請中</b> ${h.site}%<div class="bar"><i style="width:${h.site}%"></i></div><span class="muted">普請を1回（${B.hours}時間）すると約+${B.gain}%進む（築城の技能・知略が高いほど早い）。完成すると、縄張りをした部将以上の人がこの城の城主になります</span></div>`;
      if (h.mine && !me.busy) html += `<div class="card"><div>普請に加わる</div><button id="bw" data-act="buildWork">普請する</button></div>`;
      else if (me.busy) html += `<div class="muted">${me.busy.label}の最中です</div>`;
      else html += '<div class="muted">主家の城ではないので普請に加われません</div>';
    } else if (C) {
      html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　毎月の年貢 約${SIM.money(C.tax)}（月の初めに届く）</div>`;
      if (C.nawa) html += `<div class="card"><div><b>縄張り</b>　<span class="muted">${SIM.ckName(C.nawa.ck)}。曲輪・塀・門・堀を描き直して増築できる（増えた分のお金を払うとすぐ直る）</span></div><button id="nw-edit" data-act="openNawaEdit" data-id="${C.id}">縄張りを描き直す</button></div>`; // 2.12.0
      for (const [k, v, cost, gp] of C.dev) {
        const D = SIM.DEV[k], l = Math.floor(v), pct = v >= 10 ? 100 : Math.round((v - l) * 100);
        html += `<div class="card" style="display:block"><div class="row" style="align-items:center"><span><b>${D.name}</b> ${l}<span class="muted">/10　${D.desc}</span></span>`
          + (me.busy || v >= 10 ? '' : `<button id="dv-${k}" data-act="develop" data-kind="${k}" style="flex:0 0 auto">${D.act}<br><span class="muted">${SIM.money(cost)}・${D.hours}時間</span></button>`)
          + `</div><div class="bar"><i style="width:${pct}%"></i></div><div class="muted">1回で+${gp}%（${SIM.SKILLS[D.skill].name}の技能・${SIM.ATTRS[D.attr]}が高いほど進む）</div></div>`;
      }
      if (me.busy) html += `<div class="muted">${me.busy.label}の最中です（「仕事」で取りやめられます）</div>`;
      { /* 1.6.28 守備兵の管理（連れている兵と入れ替え） */
        const TR = SIM.TROOPS, gn = Object.values(C.gar || {}).reduce((a, x) => a + x, 0), qb = (act, k, have) => [1, 10, have].filter((q, i, a) => q > 0 && q <= have && a.indexOf(q) === i).map((q) => `<button id="g${act}-${k}-${q}" data-act="${act}" data-kind="${k}" data-qty="${q}" style="flex:0 0 auto">${q === have && q > 10 ? '全員' : q + '人'}</button>`).join('');
        html += `<div class="muted" style="margin-top:10px"><b>守備兵</b>　${gn}/${C.garMax}人（月の初めに足りない分が補充されます）</div>`;
        const ks = [...new Set([...Object.keys(C.gar || {}), ...Object.keys(me.troops || {})])].filter((k) => TR[k] && k !== 'hero');
        if (!ks.length) html += '<div class="muted">城にも手元にも兵がいません</div>';
        for (const k of ks) { const a = (C.gar || {})[k] || 0, b2 = (me.troops || {})[k] || 0;
          html += `<div class="card" style="display:block"><b>${TR[k].name}</b>　城${a}人／手元${b2}人<div class="row" style="gap:4px;margin-top:4px;flex-wrap:wrap">${a ? '<span class="muted">連れて行く</span>' + qb('garOut', k, a) : ''}${b2 ? '<span class="muted" style="margin-left:6px">城に残す</span>' + qb('garIn', k, b2) : ''}</div></div>`; }
      }
      html += fushinHtml(me);
    } else if (me.fushin && me.fushin.id === h.id) { html += fushinHtml(me);
    } else {
      const lord = lordName(hs);
      html += `<div class="card" style="display:block">城主：${h.holder ? `<b>${h.holder}</b>（プレイヤー）` : lord || '（不明）'}<br><span class="muted">${me.castle ? `あなたが治めている城：${(me.castles || []).map((c) => c.name).join('・')}` : '部将から「城主」に昇進すると、主家の城を一つ任されます。部将以上は野外に新しく城を築くこともできます（人物画面の「身分」）'}</span></div>`;
      const R = me.rank; // 0.29.1 城の画面からも仕官できるように
      if (R && !R.clan && R.canServe) {
        const need = R.serveNeed != null ? R.serveNeed : SIM.RANKS[1].fame, ok = me.fame >= need;
        html += `<div class="card"><div><b>仕官</b>　${R.factionHere}の${R.lordHere}様に仕える<br><span class="muted">名声${need}以上（いま${me.fame}）。仕えると俸禄がもらえ、主家の依頼や戦で功績が積めます${ok ? '' : '。この家の武将や隊長に話しかけて顔をつなぐと名声2で仕官できます'}</span></div><button id="tw-serve" data-act="serve" ${ok ? '' : 'disabled'}>武士として仕官</button><button id="tw-serve-n" data-act="serve" data-nin="1" ${ok ? '' : 'disabled'}>忍びとして仕官</button></div>`;
      } else if (R && !R.clan) html += `<div class="muted">この城では仕官できません（城主のいる城で仕官できます）</div>`;
    }
  } else if (sec === 'home') { // 2.12.6 自宅
    const HO = me.home, HM = SIM.HOME, K = me.kura || { money: 0, inv: {} };
    if (!HO || HO.id !== h.id) {
      html += `<div class="card"><div><b>ここに引っ越す</b><br><span class="muted">いまの自宅：${HO ? HO.name : 'なし'}。${SIM.money(HM.moveCost)}かかります。金庫と物置の中身も一緒に運びます</span></div><button id="hm-move" data-act="home" data-kind="move" ${me.money >= HM.moveCost && !me.busy ? '' : 'disabled'}>引っ越す（${SIM.money(HM.moveCost)}）</button></div>`;
      html += '<div class="muted">仕官すると、仕えた城へ無料で引っ越します</div>';
    } else {
      const hp = me.hpFrac == null ? 1 : me.hpFrac;
      if (me.busy && me.busy.kind === 'rest') html += `<div class="card"><div><b>休んでいます</b><br><span class="muted">残り約${Math.max(0, Math.ceil((me.busy.until - G.view.t) / 60))}時間　体力 ${Math.round(hp * 100)}%</span></div><button id="hm-stop" data-act="cancelWork">起きる</button></div>`;
      else html += `<div class="card"><div><b>休む</b><br><span class="muted">${HM.restHours}時間。ふつうに拠点にいるより早く傷が治る（いま体力 ${Math.round(hp * 100)}%）</span></div><button id="hm-rest" data-act="home" data-kind="rest" ${me.busy ? 'disabled' : ''}>休む</button></div>`;
      if (SGK.SMITHUI) html += SGK.SMITHUI.html(me); // 2.29.0 作業場（鍛冶）
      if (SGK.FARMUI) html += SGK.FARMUI.html(me); // 2.35.0 畑（農業）
      html += `<div class="muted" style="margin-top:8px"><b>金庫</b>　預けている ${SIM.money(K.money)}　所持金 ${SIM.money(me.money)}</div><div class="row" style="flex-wrap:wrap">`
        + [1000, 10000].map((q) => `<button id="hm-pm${q}" data-act="home" data-kind="putM" data-qty="${q}" ${me.money >= q ? '' : 'disabled'}>${SIM.money(q)}預ける</button>`).join('')
        + `<button id="hm-pma" data-act="home" data-kind="putM" data-qty="-1" ${me.money > 0 ? '' : 'disabled'}>全部預ける</button>`
        + [1000, 10000].map((q) => `<button id="hm-tm${q}" data-act="home" data-kind="takeM" data-qty="${q}" ${K.money >= q ? '' : 'disabled'}>${SIM.money(q)}出す</button>`).join('')
        + `<button id="hm-tma" data-act="home" data-kind="takeM" data-qty="-1" ${K.money > 0 ? '' : 'disabled'}>全部出す</button></div>`;
      html += `<div class="muted" style="margin-top:8px"><b>物置</b>　${loadTxt(me)}</div>`;
      const ks = [...new Set([...Object.keys(me.inv || {}), ...Object.keys(K.inv || {})])].filter((k) => IT[k]).sort((a, b) => IT[a].base - IT[b].base);
      if (!ks.length) html += '<div class="muted">荷も物置も空です</div>';
      else {
        html += '<div class="grid" style="grid-template-columns:auto auto auto repeat(4,auto)"><span class="h">品</span><span class="h">持っている</span><span class="h">物置</span><span></span><span></span><span></span><span></span>';
        for (const k of ks) { const it = IT[k], a = me.inv[k] || 0, b = K.inv[k] || 0;
          html += `<span>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}${it.name}</span><span>${a}</span><span>${b}</span>`
            + `<button id="hp1-${k}" data-act="home" data-kind="put" data-item="${k}" data-qty="1" ${a ? '' : 'disabled'}>入れる1</button><button id="hpa-${k}" data-act="home" data-kind="put" data-item="${k}" data-qty="-1" ${a ? '' : 'disabled'}>全部入れる</button>`
            + `<button id="ht1-${k}" data-act="home" data-kind="take" data-item="${k}" data-qty="1" ${b ? '' : 'disabled'}>出す1</button><button id="hta-${k}" data-act="home" data-kind="take" data-item="${k}" data-qty="-1" ${b ? '' : 'disabled'}>全部出す</button>`; }
        html += '</div>';
      }
    }
  } else if (sec === 'gamble') {
    if (P.here && P.here.gamble && SGK.GAMBLEUI) html += `<div class="card"><div><b>賭場に入る</b><br><span class="muted">行灯の灯る部屋で、壺振りの丁半・賽の目増と四五六・馬くらべ・天正かるた・独楽回し（自分で削った独楽）・貝絵合わせ・絵双六</span></div><button id="gb-open" data-act="gbOpen">入る</button></div><details style="margin-top:6px"><summary class="muted">文字だけで遊ぶ</summary>${SGK.GAMBLE.html(P, G.gbSel, G.myPid)}</details>`; // 2.12.4
    else html += SGK.GAMBLE.html(P, G.gbSel, G.myPid);
  } else {
    html += `<div class="card"><div>ここの人に話を聞く<br><span class="muted">相場の噂などが聞けます</span></div><button id="tk" data-act="talk">話しかける</button></div>`;
  }
  } // 2.13.0 sec のくり返し
  html += `<div class="muted" style="margin-top:8px">名声 ${me.fame}</div>`;
  if (html !== townHtml) {
    townHtml = html; $('townBody').innerHTML = html;
    const t = $('town'), f = currentFocus(t); if (f) setFocus(t, f);
  }
}
// 方角（地図の上が北）
// 0.40.0 普請（改築・道を広げる・新しい道）
function fushinHtml(me) {
  const F = me.fushin; if (!F) return '';
  let h = `<div class="muted" style="margin-top:10px"><b>普請</b>　城の構え：${F.kaiName}（${F.kai}/5段階・守りの効き ${Math.round(F.kf * 100)}%）</div>`;
  if (F.work) return h + `<div class="card" style="display:block">${F.work.label}の最中です（あと${F.work.left}日）</div>`;
  if (F.gate) h += `<div class="card"><div><b>門の修理</b>：門の強さ ${Math.round(F.gate.f * 100)}%（忍びや戦で傷んでいる）<br><span class="muted">${SIM.money(F.gate.cost)}・${F.gate.days}日。門を元の強さに戻す</span></div><button id="fg" data-act="fushin" data-kind="gate" ${me.money >= F.gate.cost ? '' : 'disabled'}>修理する</button></div>`;
  if (F.next) h += `<div class="card"><div><b>改築</b>：${F.next.name}<br><span class="muted">${SIM.money(F.next.cost)}・${F.next.days}日。城を守る戦で有利になる（守りの効き ${Math.round(F.next.kf * 100)}%）${SIM.kaiMapText && SIM.kaiMapText(F.kai + 1) ? '・' + SIM.kaiMapText(F.kai + 1) : ''}</span></div><button id="fk" data-act="fushin" data-kind="kai" ${me.money >= F.next.cost ? '' : 'disabled'}>改築する</button></div>`;
  else h += '<div class="muted">これ以上の改築はできません</div>';
  const RN = ['', '大街道', '街道', '脇道'];
  for (const g of F.widen) h += `<div class="card"><div><b>道を広げる</b>：${g.name}へ（${RN[g.rank]}→${RN[g.rank - 1]}・約${g.len}km）<br><span class="muted">${SIM.money(g.cost)}・${g.days}日</span></div><button id="fw-${g.to}" data-act="fushin" data-kind="widen" data-id="${g.to}" ${me.money >= g.cost ? '' : 'disabled'}>広げる</button></div>`;
  for (const g of F.roads) h += `<div class="card"><div><b>新しい道</b>：${g.name}へ（約${g.len}km${g.mt ? `・山${g.mt}%` : ''}）<br><span class="muted">${SIM.money(g.cost)}・${g.days}日。脇道ができる</span></div><button id="fr-${g.to}" data-act="fushin" data-kind="road" data-id="${g.to}" ${me.money >= g.cost ? '' : 'disabled'}>道をつくる</button></div>`;
  return h;
}
// 2.41.0 協力任務の部屋（同じ工作を請け負った仲間と一緒に潜入。最大3人・誰かが見つかれば全員失敗・報酬は全員に満額）
function njRoomHtml(R) {
  if (!R) return '';
  const names = R.names.map((n) => n.replace(/[<&]/g, '')).join('・');
  if (R.canJoin) return `<div style="margin-top:6px;border-top:1px solid #8884;padding-top:4px"><b>${R.lname.replace(/[<&]/g, '')}が仲間を募っています</b>（${R.n}/${R.max}人：${names}）<div class="row" style="margin-top:4px"><button id="nj-join" data-act="ninJoin">加わる</button></div></div>`;
  return `<div style="margin-top:6px;border-top:1px solid #8884;padding-top:4px"><b>協力して潜入</b>（${R.n}/${R.max}人：${names}）<div class="row" style="margin-top:4px">${R.leader ? '<button id="nj-cogo" data-act="ninGo">この仲間で出発する</button>' : '<span class="muted">リーダーが出発すると始まります</span>'}<button id="nj-leave" data-act="ninRoomLeave">${R.leader ? '募集をやめる' : '抜ける'}</button></div></div>`;
}
function dirOf(a, b) { const ang = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI; return ['東', '北東', '北', '北西', '西', '南西', '南', '南東'][Math.round(((ang + 360) % 360) / 45) % 8]; }
// 依頼の届け先を地図で見る（「依頼に戻る」で拠点の画面へ戻れる）
function lookAt(id, job) {
  const to = G.view.settlements.find((x) => x.id === id); if (!to) return;
  const back = { label: '依頼の画面に戻る', fn: () => { selectSettlement(null); R.cam.follow = true; openTown(true, true); } };
  openTown(false); R.cam.follow = false; R.cam.x = to.x; R.cam.y = to.y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; selectSettlement(to);
  G.infoCmd = back.fn; $('infoAct').textContent = back.label; $('infoAct').classList.remove('hidden');
  if (job) { G.lookJob = job; $('infoGo').textContent = '依頼を受けて、ここへ向かう'; } /* 1.6.47 */
  setFocus($('info'), job ? $('infoGo') : $('infoAct'));
}
// 忍びの潜入を始める（co＝協力任務の部屋の情報。1人のときは null）
function startNinja(N, co) {
  const fin = (r) => { r = r && typeof r === 'object' ? r : { ok: r }; // 2.24.0 3Dの潜入は { ok, kills, unseen, used } を返す
    if (r.ok === null || r.ok === undefined) { command({ type: 'ninUse', used: r.used || null }); toast('いったん退きました（工作はまだ請け負ったまま）', 1500); }
    else command({ type: 'ninResult', ok: !!r.ok, kills: r.kills || 0, unseen: !!r.unseen, used: r.used || null }); };
  if (co) { // 2.41.0 協力任務：部屋を作った人（リーダー）の端末が見張りを動かし、ほかの人へ配る
    if (!(SGK.NINJA3D && SGK.NINJA3D.can())) { toast('3Dが使えないので、協力任務はできません', 3000); command({ type: 'ninRoomLeave' }); return; }
    SGK.NINJA3D.start({ q: Object.assign({}, N.q, co.q), d: co.d, tools: N.tools || {}, seed: co.q.id, co: { me: G.myPid, leader: co.lead, members: co.mem, names: co.names, send: SGK.ninSend } }, fin); return;
  }
  if (SGK.NINJA3D && SGK.NINJA3D.can()) SGK.NINJA3D.start({ q: N.q, d: N.d, tools: N.tools || {}, seed: N.q.id }, fin); else SGK.NINJA.start(N.q.k, N.d, fin);
}
// 2.57.0 城の守り（3D）。3Dが使えないときは、その場で運しだいで決まる
function startNinjaDef(N) {
  const q = N.def, fin = (r) => { r = r && typeof r === 'object' ? r : { ok: r };
    if (r.ok === null || r.ok === undefined) { command({ type: 'ninUse', used: r.used || null }); toast('いったん退きました（曲者はまだ城の中にいる）', 1500); }
    else command({ type: 'ninDefResult', ok: !!r.ok, caught: r.caught || 0, killed: r.killed || 0, used: r.used || null }); };
  command({ type: 'ninDefGo' });
  if (!(SGK.NINJA3D && SGK.NINJA3D.can())) { const ok = Math.random() < 0.6; fin({ ok, caught: ok ? 1 : 0, killed: 0 }); return; }
  SGK.NINJA3D.start({ def: { n: q.n }, q: { k: q.k, sk: q.sk, whoName: q.whoName, id: q.id }, d: q.d, tools: N.tools || {}, seed: q.id }, fin);
}
// 2.57.1 人と人の忍びの対戦：合図が届いたら、攻める人（見張りを動かす）と守る人の両方が始める
function startNinjaPvp(N, go) {
  const att = go.att === G.myPid, co = { me: G.myPid, leader: go.att, members: [go.att, go.def], names: go.names || {}, send: SGK.ninSend, pvp: { role: att ? 'att' : 'def', foe: att ? go.def : go.att } };
  if (!(SGK.NINJA3D && SGK.NINJA3D.can())) { toast('3Dが使えないので、対戦はできません', 3000); command({ type: 'ninUse', used: null }); return; }
  if (att) {
    SGK.NINJA3D.start({ q: Object.assign({}, N.q, go.q), d: go.d, tools: N.tools || {}, seed: go.q.id, co }, (r) => { r = r && typeof r === 'object' ? r : { ok: r };
      if (r.ok === null || r.ok === undefined) { command({ type: 'ninUse', used: r.used || null }); toast('いったん退きました（工作はまだ請け負ったまま）', 1500); }
      else command({ type: 'ninResult', ok: !!r.ok, kills: r.kills || 0, unseen: !!r.unseen, used: r.used || null }); });
  } else {
    command({ type: 'ninDefGo' });
    SGK.NINJA3D.start({ def: { n: 1, pvp: true }, q: go.q, d: go.d, tools: N.tools || {}, seed: go.q.id, co }, (r) => { r = r && typeof r === 'object' ? r : { ok: r };
      if (r.ok === null || r.ok === undefined) { command({ type: 'ninUse', used: r.used || null }); toast('対戦を抜けました', 1500); }
      else command({ type: 'ninDefResult', ok: !!r.ok, caught: r.caught || 0, killed: r.killed || 0, ko: !!r.ko, used: r.used || null }); });
  }
}
setInterval(() => {
  const N = G.priv && G.priv.me && G.priv.me.nin, go = N && N.pvpGo;
  if (!go || (SGK.NINJA3D && SGK.NINJA3D.on) || (SGK.NINJA && SGK.NINJA.on) || G.lastPvpGo === go.at) return;
  if (go.att === G.myPid ? !N.q : !N.def) return;
  G.lastPvpGo = go.at; openTown(false); startNinjaPvp(N, go);
}, 400);
// 部屋の出発の合図が届いたら、入っている全員が始める
setInterval(() => {
  const P = G.priv, N = P && P.me && P.me.nin, R = N && N.room;
  if (!R || !R.go || !R.joined || !N.q || (SGK.NINJA3D && SGK.NINJA3D.on) || (SGK.NINJA && SGK.NINJA.on) || G.lastCoGo === R.go.at) return;
  G.lastCoGo = R.go.at; openTown(false); startNinja(N, R.go);
}, 400);
$('townBody').addEventListener('click', (e) => {
  const lb = e.target.closest('button[data-look]'); if (lb) return lookAt(lb.dataset.look, lb.dataset.job);
  const lx = e.target.closest('button[data-lookxy]'); if (lx) { const [x, y] = lx.dataset.lookxy.split(',').map(Number); openTown(false); R.cam.follow = false; R.cam.x = x; R.cam.y = y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; return; }
  const pb = e.target.closest('button[data-party]'); if (pb) { SGK.PARTY.openLobby(pb.dataset.party); return; } /* 2.69.4 町の窓は開けたまま（やめるで遊びを選ぶ画面へ戻る。遊びを始める時に閉じる） */ // 2.42.0
  const nj = e.target.closest('button[data-nj]'); // 0.77.0 忍び込む
  if (nj) { const N = G.priv && G.priv.me.nin; if (!N || !N.atTgt) return; if (N.pvp && N.pvp.here) { command({ type: 'ninPvpGo' }); toast('守りの忍びと対戦します…', 2000); return; } openTown(false); startNinja(N, null); return; } // 2.57.1 守る人がいれば対戦
  const nd = e.target.closest('button[data-njdef]'); // 2.57.0 城の守り
  if (nd) { const N = G.priv && G.priv.me.nin; if (!N || !N.def || !N.def.at) return; openTown(false); startNinjaDef(N); return; }
  const gs = e.target.closest('button[data-gbset]'); if (gs) { G.gbSel = +gs.dataset.gbset; townHtml = ''; renderTown(); return; } // 2.8.0 賭場の掛け金
  const b = e.target.closest('button[data-act]'); if (!b) return;
  if (b.dataset.act === 'smithPlay') { if (SGK.SMITHUI) SGK.SMITHUI.open(b.dataset.id, G.priv && G.priv.me); return; } // 2.29.0 鍛冶のミニゲーム
  if (b.dataset.act === 'gbOpen') { if (SGK.GAMBLEUI) SGK.GAMBLEUI.open(G.priv, G.myPid); return; } // 2.12.4 賭場の画面
  if (b.dataset.act === 'openNawaEdit') { const me2 = G.priv && G.priv.me, C2 = me2 && (me2.castles || []).find((x) => x.id === b.dataset.id); if (C2 && C2.nawa && SGK.NAWAEDIT) SGK.NAWAEDIT.open({ mode: 'edit', id: C2.id, plan: C2.nawa, ck: C2.nawa.ck, money: me2.money }); return; } // 2.12.0 縄張りを描き直す
  const c = { type: b.dataset.act };
  if (b.dataset.item) c.item = b.dataset.item;
  if (b.dataset.qty) c.qty = +b.dataset.qty;
  if (b.dataset.id) c.id = b.dataset.id;
  if (b.dataset.kind) c.kind = b.dataset.kind;
  if (b.dataset.nin) c.nin = 1;
  const job = c.type === 'acceptJob' && G.priv && G.priv.here && (G.priv.here.jobs || []).find((j) => j.id === c.id);
  command(c);
  if (job && job.type === 'deliver' && (G.priv.me.quests || []).length < 3) { // 届け物を受けたら、届け先へカーソルを合わせる
    const to = G.view.settlements.find((x) => x.id === job.to);
    if (to) { openTown(false); R.cam.follow = false; R.cam.x = to.x; R.cam.y = to.y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; selectSettlement(to); }
  }
});
document.querySelectorAll('#town [data-tab]').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
$('townClose').onclick = () => openTown(false);
$('townBtn').onclick = () => openTown(true);
$('joinBtn').onclick = () => command({ type: 'joinBattle' }); // 1.6.12 合戦の途中参加
$('testBtn').onclick = () => SGK.TESTUI && SGK.TESTUI.open(G.priv && G.priv.me); // 2.12.1 テストモードの戦闘
$('ledgerBtn').onclick = () => SGK.LEDGERUI && SGK.LEDGERUI.open(); // 2.58.0 帳簿
$('townStage').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); }); // 2.13.0 通りのボタン
function cycleTab(d) { const tabs = ['street', 'market', 'renpei', 'gamble', 'gosho', 'minato', 'mise', 'soncho', 'talk', 'castle', 'home'].filter((t) => !$('tab-' + t).classList.contains('hidden')); setTab(tabs[(tabs.indexOf(townTab) + d + tabs.length) % tabs.length]); }

