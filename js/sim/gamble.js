// 2.8.0 賭場（大きな町だけ）。丁半・目増・四五六・天正かるた。親（賭場）が相手で、同じ町の人は同じ卓で一緒に勝負できる。
// 賭けの進行（サイコロ・札）はホストだけが決める。命令の引数は c.id＝遊び名、c.qty＝賭け金、c.kind＝丁半の「丁/半」
(function () {
  const SIM = SGK.SIM, DATA = SGK.DATA;
  const G = (SGK.GAMBLE = {});
  G.BETS = [100, 500, 1000, 3000, 5000, 10000]; // 2.60.2 3貫・5貫を足す／2.103.0 押すたびに足していく（足す額のボタン）
  G.BET_MAX = 100000; // 2.103.0 掛け金の上限（100貫）
  G.betValid = (n) => Number.isInteger(n) && n >= 10 && n <= G.BET_MAX; // 2.103.0 好きな額（10文以上・100貫まで）
  // 2.103.0 ボタンの押し方：数字＝足す（最初の1回だけ今の額を置き換え）／-1＝いちばん小さい足し分(100文)を引く／0＝100文に戻す／max＝持ち金いっぱい
  G.betStep = (cur, cmd, touched, money) => {
    cur = G.betValid(cur) ? cur : 100;
    if (cmd === '0') return 100;
    if (cmd === 'max') return Math.max(10, Math.min(G.BET_MAX, Math.floor((money || 0) / 10) * 10));
    if (cmd === '-1') return Math.max(100, cur - 100);
    return Math.min(G.BET_MAX, (touched ? cur : 0) + (+cmd || 0));
  };
  G.GAMES = {
    chouhan: { name: '丁半', rule: 'サイコロ2つの合計が偶数なら「丁」、奇数なら「半」。当たれば2倍。誰かが壺を開けると全員の勝負が決まります。' },
    memashi: { name: '目増', rule: '親と自分がサイコロを2つずつ振り、合計が大きい方の勝ち（勝てば2倍・同じなら賭け金が戻る）。' },
    shigoro: { name: '四五六', rule: 'サイコロ3つの役の強さを親と比べます。ピンゾロ5倍・アラシ(ゾロ目)4倍・シゴロ(四五六)3倍・目の勝ちは2倍。負けた時は親の役の倍率で取られます(親がシゴロなら賭け金の3倍)。目なしは3回まで振り直し、ヒフミ(一二三)は即負け。' },
    uma: { name: '馬くらべ', rule: '6頭の馬から1頭を選んで賭けます。一着の馬に賭けていれば、その馬の倍率で払い戻し。誰かが「走らせる」を押すとレースが始まります。' },
    karuta: { name: '天正かるた', rule: '札(1〜12)を2枚配り、合計の一の位が9に近い方の勝ち。もう1枚引くか(最大3枚)勝負するかを選びます。同点は親の勝ち。最初の2枚が同じ数字(ゾロ目)なら3倍。親は一の位が4以下なら3枚目を引きます。' },
  };
  // 札の絵：img/karuta/<札の種類0〜3>-<数字1〜12>.png を置くと自動で絵に差し替わる（無ければ文字の札）
  G.CARD_IMG = (c) => `img/karuta/${c.s}-${c.n}.png`;
  G.SUITS = [['剣', '#4a7bd0'], ['杯', '#d04a4a'], ['棍', '#3f9a55'], ['金', '#c9a227']];
  const SAY = (pid, t) => SIM.say(pid, t);
  const d6 = (w) => 1 + Math.floor(SIM.rand(w) * 6);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const money = (m) => SIM.money(m);
  const nameOf = (w, pid) => (w.players[pid] ? w.players[pid].name : '？');

  // ---- 馬くらべ ----
  const HORSES = ['黒鹿毛の疾風', '白雲', '月毛の朧', '栗毛の稲妻', '青毛の夜叉', '葦毛の霞', '鹿毛の朱雀', '河原毛の陽炎', '連銭葦毛の雷', '佐目毛の春駒', '駁の鬼丸', '尾花栗毛の風花'];
  function newRace(w, U) {
    const pool = HORSES.slice(), hs = [];
    while (hs.length < 6) { const i = Math.floor(SIM.rand(w) * pool.length); const st = 0.75 + SIM.rand(w) * 0.5; hs.push({ name: pool.splice(i, 1)[0], st }); }
    const sum = hs.reduce((a, h) => a + h.st * h.st, 0);
    for (const h of hs) { const pr = (h.st * h.st) / sum; h.odds = Math.max(1.5, Math.min(20, Math.round(0.85 / pr * 10) / 10)); h.form = h.st > 1.07 ? '好調' : h.st < 0.93 ? '不調' : '普通'; }
    U.horses = hs;
  }
  function umaRace(w, p, T) {
    const hs = T.horses, pos = hs.map(() => 0), frames = [pos.slice()];
    for (let k = 0; k < 30 && Math.max(...pos) < 100; k++) { for (let i = 0; i < hs.length; i++) pos[i] += 5 + hs[i].st * 5 + SIM.rand(w) * 5; frames.push(pos.map((x) => Math.min(100, Math.round(x * 10) / 10))); }
    const fin = pos.slice(), order = fin.map((x, i) => i).sort((a, b) => fin[b] - fin[a]), win = order[0], lines = [], rows = [];
    for (const pid in T.bets) { const x = T.bets[pid], q = w.players[pid], hit = x.pick === win, ret = hit ? Math.floor(x.bet * hs[win].odds) : 0; if (q) pay(q, ret); rows.push({ id: pid, name: nameOf(w, pid), bet: x.bet, pick: x.pick, r: hit ? 1 : -1, gain: ret - x.bet }); lines.push(`${nameOf(w, pid)}（${hs[x.pick].name}・${money(x.bet)}）→ ${hit ? '的中 ' + sign(ret - x.bet) : 'はずれ ' + sign(-x.bet)}`); }
    T.n++; T.last = { id: T.n, t: Date.now(), rows, win, order: order.slice(0, 3), frames, fin: frames[frames.length - 1], names: hs.map((h) => h.name), head: `一着：${hs[win].name}　二着：${hs[order[1]].name}　三着：${hs[order[2]].name}`, lines, by: nameOf(w, p.id) };
    for (const pid in T.bets) SAY(pid, `馬くらべ：一着は${hs[win].name}`);
    T.bets = {}; newRace(w, T);
  }
  function tableOf(w, id) {
    w.gamble = w.gamble || {}; const t = (w.gamble[id] = w.gamble[id] || {});
    for (const g of ['chouhan', 'memashi', 'shigoro']) t[g] = t[g] || { bets: {}, last: null };
    t.uma = t.uma || { bets: {}, last: null, horses: null, n: 0 }; if (!t.uma.horses) newRace(w, t.uma);
    t.karuta = t.karuta || { phase: 'bet', bets: {}, hands: {}, parent: [], deck: [], last: null };
    return t;
  }
  // 入れる条件：大きな町にいる・仕事中でない
  function ok(w, p, c) {
    const s = here(w, p);
    if (!s || !DATA.isBig(s)) { SAY(p.id, '賭場があるのは大きな町だけです'); return null; }
    if (p.busy) { SAY(p.id, `${p.busy.label}の最中です`); return null; }
    if (!G.GAMES[c.id]) return null;
    return tableOf(w, s.id)[c.id];
  }
  const pay = (p, ret) => { p.money += ret; };
  const sign = (n) => (n >= 0 ? '+' : '－') + money(Math.abs(n));

  // ---- 四五六の役 ----
  function shigoroEval(d) {
    const a = d.slice().sort((x, y) => x - y);
    if (a[0] === 1 && a[1] === 1 && a[2] === 1) return { rank: 100, mult: 5, label: 'ピンゾロ' };
    if (a[0] === a[2]) return { rank: 90 + a[0], mult: 4, /* 2.60.1 3倍→4倍 */ label: `アラシ(${a[0]}のゾロ目)` };
    if (a[0] === 4 && a[1] === 5 && a[2] === 6) return { rank: 80, mult: 3, label: 'シゴロ' }; // 2.60.1 2倍→3倍
    if (a[0] === 1 && a[1] === 2 && a[2] === 3) return { rank: -1, mult: 1, label: 'ヒフミ' };
    if (a[0] === a[1]) return { rank: a[2], mult: 2, label: `${a[2]}の目` };
    if (a[1] === a[2]) return { rank: a[0], mult: 2, label: `${a[0]}の目` };
    return { rank: 0, mult: 1, label: '目なし' };
  }
  function shigoroRoll(w) {
    let d, e, n = 0;
    do { d = [d6(w), d6(w), d6(w)]; e = shigoroEval(d); n++; } while (e.rank === 0 && n < 3);
    return { d, e, n };
  }
  const diceTxt = (d) => `［${d.join('・')}］`; // 2.12.4 絵文字の賽はやめて数字（賭場の画面では賽の絵で見せる）

  // ---- 丁半・目増・四五六：賭けて、誰かが開ける ----
  SIM.commands.gbBet = (w, p, c) => {
    const T = ok(w, p, c); if (!T) return;
    const bet = +c.qty;
    if (!G.betValid(bet)) return;
    if (c.id === 'karuta' && T.phase !== 'bet') return SAY(p.id, 'いまは勝負の最中です。終わるまでお待ちを');
    if (T.bets[p.id]) return SAY(p.id, 'もう賭けています');
    if (c.id === 'chouhan' && c.kind !== 'even' && c.kind !== 'odd') return;
    if (c.id === 'uma') { const hi = +c.kind; if (!(hi >= 0 && hi < 6)) return; c.kind = hi; }
    if (p.money < bet) return SAY(p.id, '持ち金が足りません');
    p.gbPlay = (p.gbPlay || 0) + 1; p.money -= bet; T.bets[p.id] = { bet, pick: c.kind != null ? c.kind : null };
  };
  SIM.commands.gbCancel = (w, p, c) => {
    const T = ok(w, p, c); if (!T) return;
    const b = T.bets[p.id]; if (!b) return;
    if (c.id === 'karuta' && T.phase !== 'bet') return;
    pay(p, b.bet); delete T.bets[p.id];
  };
  SIM.commands.gbRoll = (w, p, c) => {
    const T = ok(w, p, c); if (!T || c.id === 'karuta') return;
    if (!T.bets[p.id]) return SAY(p.id, 'まず賭けてください');
    if (c.id === 'uma') return umaRace(w, p, T);
    const lines = [], rows = []; let head = '', ex = {}; // 2.12.4 rows・ex：賭場の画面で賽の動きを見せるための目と勝ち負け
    if (c.id === 'chouhan') {
      const a = d6(w), b = d6(w), even = (a + b) % 2 === 0; head = `${diceTxt([a, b])}＝${a + b}　${even ? '丁' : '半'}`; ex = { d: [a, b], even };
      for (const pid in T.bets) { const x = T.bets[pid], q = w.players[pid]; const win = (x.pick === 'even') === even; if (q) pay(q, win ? x.bet * 2 : 0); lines.push(`${nameOf(w, pid)}（${x.pick === 'even' ? '丁' : '半'}・${money(x.bet)}）→ ${win ? '当たり ' + sign(x.bet) : 'はずれ ' + sign(-x.bet)}`); rows.push({ id: pid, name: nameOf(w, pid), pick: x.pick, bet: x.bet, r: win ? 1 : -1, gain: win ? x.bet : -x.bet }); }
    } else if (c.id === 'memashi') {
      const pa = [d6(w), d6(w)], ps = pa[0] + pa[1]; head = `親 ${diceTxt(pa)}＝${ps}`; ex = { pd: pa };
      for (const pid in T.bets) {
        const x = T.bets[pid], q = w.players[pid], ma = [d6(w), d6(w)], ms = ma[0] + ma[1];
        const r = ms > ps ? 1 : ms < ps ? -1 : 0; if (q) pay(q, r > 0 ? x.bet * 2 : r === 0 ? x.bet : 0);
        lines.push(`${nameOf(w, pid)}（${money(x.bet)}）${diceTxt(ma)}＝${ms} → ${r > 0 ? '勝ち ' + sign(x.bet) : r === 0 ? '引き分け（返却）' : '負け ' + sign(-x.bet)}`);
        rows.push({ id: pid, name: nameOf(w, pid), bet: x.bet, d: ma, r, gain: r > 0 ? x.bet : r === 0 ? 0 : -x.bet });
      }
    } else {
      const pr = shigoroRoll(w); head = `親 ${diceTxt(pr.d)} ${pr.e.label}${pr.n > 1 ? `（${pr.n}回目）` : ''}`; ex = { pd: pr.d, pl: pr.e.label, pn: pr.n };
      for (const pid in T.bets) {
        const x = T.bets[pid], q = w.players[pid], m = shigoroRoll(w);
        const r = m.e.rank > pr.e.rank ? 1 : m.e.rank < pr.e.rank ? -1 : 0; const ret = r > 0 ? x.bet * m.e.mult : r === 0 ? x.bet : 0; if (q) pay(q, ret);
        // 2.106.4 負けた時は親の役の倍率で取られる（賭け金は先に払っているので、足りない分を持ち金から。無ければ取れる分だけ）
        let extra = 0; if (r < 0 && pr.e.mult > 1) { extra = x.bet * (pr.e.mult - 1); if (q) { extra = Math.min(extra, Math.max(0, q.money)); q.money -= extra; } }
        const gain = r < 0 ? -(x.bet + extra) : ret - x.bet;
        lines.push(`${nameOf(w, pid)}（${money(x.bet)}）${diceTxt(m.d)} ${m.e.label} → ${r > 0 ? '勝ち ' + sign(gain) : r === 0 ? '引き分け（返却）' : '負け ' + sign(gain) + (extra ? `（親の${pr.e.label}で${pr.e.mult}倍取り）` : '')}`);
        rows.push({ id: pid, name: nameOf(w, pid), bet: x.bet, d: m.d, label: m.e.label, n: m.n, r, gain });
      }
    }
    T.n = (T.n || 0) + 1;
    T.last = Object.assign({ head, lines, by: nameOf(w, p.id), id: T.n, t: Date.now(), rows }, ex);
    for (const pid in T.bets) SAY(pid, `${G.GAMES[c.id].name}：${head}`);
    T.bets = {};
  };

  // ---- 天正かるた ----
  const val = (cards) => cards.reduce((s, x) => s + x.n, 0) % 10;
  const cardTxt = (cs) => cs.map((x) => `${G.SUITS[x.s][0]}${x.n}`).join(' ');
  const zoro = (h) => h.cards.length >= 2 && h.cards[0].n === h.cards[1].n;
  SIM.commands.gbDeal = (w, p, c) => {
    c.id = 'karuta'; const T = ok(w, p, c); if (!T) return;
    if (T.phase !== 'bet') return; if (!T.bets[p.id]) return SAY(p.id, 'まず賭けてください');
    const deck = []; for (let s = 0; s < 4; s++) for (let n = 1; n <= 12; n++) deck.push({ s, n });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(SIM.rand(w) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    T.deck = deck; T.parent = [deck.pop(), deck.pop()]; T.hands = {};
    for (const pid in T.bets) T.hands[pid] = { bet: T.bets[pid].bet, cards: [deck.pop(), deck.pop()], done: false };
    T.phase = 'play'; T.last = null;
  };
  SIM.commands.gbHit = (w, p, c) => {
    c.id = 'karuta'; const T = ok(w, p, c); if (!T || T.phase !== 'play') return;
    const h = T.hands[p.id]; if (!h || h.done) return; if (h.cards.length >= 3) return SAY(p.id, '札は3枚までです');
    h.cards.push(T.deck.pop()); if (h.cards.length >= 3) h.done = true; settleIfDone(w, T);
  };
  SIM.commands.gbStand = (w, p, c) => {
    c.id = 'karuta'; const T = ok(w, p, c); if (!T || T.phase !== 'play') return;
    const h = T.hands[p.id]; if (!h || h.done) return; h.done = true; settleIfDone(w, T);
  };
  SIM.commands.gbClose = (w, p, c) => { // まだ決めていない人を「勝負」にして締める
    c.id = 'karuta'; const T = ok(w, p, c); if (!T || T.phase !== 'play' || !T.hands[p.id]) return;
    for (const pid in T.hands) T.hands[pid].done = true; settleIfDone(w, T);
  };
  function settleIfDone(w, T) {
    if (Object.values(T.hands).some((h) => !h.done)) return;
    while (T.parent.length < 3 && val(T.parent) <= 4) T.parent.push(T.deck.pop());
    const ps = val(T.parent), pz = zoro({ cards: T.parent }), lines = [], rows = [], head = `親 ${cardTxt(T.parent)} → ${ps}${pz ? '（ゾロ目）' : ''}`;
    for (const pid in T.hands) {
      const h = T.hands[pid], q = w.players[pid], ms = val(h.cards), mz = zoro(h); let win;
      if (mz && !pz) win = 3; else if (pz && !mz) win = 0; else win = ms > ps ? 2 : 0;
      if (q) pay(q, win * h.bet);
      lines.push(`${nameOf(w, pid)}（${money(h.bet)}）${cardTxt(h.cards)} → ${ms}${mz ? '（ゾロ目）' : ''} → ${win ? '勝ち ' + sign(win * h.bet - h.bet) : '負け ' + sign(-h.bet)}`);
      rows.push({ id: pid, name: nameOf(w, pid), bet: h.bet, cards: h.cards, v: ms, z: mz, r: win ? 1 : -1, gain: win * h.bet - h.bet });
      SAY(pid, `天正かるた：親${ps} 自分${ms} ${win ? '勝ち' : '負け'}`);
    }
    T.n = (T.n || 0) + 1; T.last = { head, lines, id: T.n, t: Date.now(), parent: T.parent.slice(), pv: ps, pz, rows }; T.phase = 'bet'; T.bets = {}; T.hands = {}; T.parent = []; T.deck = [];
  }

  // ---- 見せる情報（その町にいる人へ） ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.here) return r;
    const s = SIM.settlement(w, r.here.id); if (!s || !DATA.isBig(s)) return r;
    const t = tableOf(w, s.id), out = {};
    for (const g of ['chouhan', 'memashi', 'shigoro']) out[g] = { bets: Object.entries(t[g].bets).map(([id, x]) => ({ id, name: nameOf(w, id), bet: x.bet, pick: x.pick })), last: t[g].last };
    out.uma = { horses: t.uma.horses.map((h) => ({ name: h.name, odds: h.odds, form: h.form })), bets: Object.entries(t.uma.bets).map(([id, x]) => ({ id, name: nameOf(w, id), bet: x.bet, pick: x.pick })), last: t.uma.last ? Object.assign({}, t.uma.last, { frames: Date.now() - t.uma.last.t < 12000 ? t.uma.last.frames : null }) : null };
    const k = t.karuta, play = k.phase === 'play';
    out.karuta = {
      phase: k.phase, last: k.last,
      bets: Object.entries(k.bets).map(([id, x]) => ({ id, name: nameOf(w, id), bet: x.bet })),
      parent: play ? [null, ...k.parent.slice(1)] : [], // 親の1枚目は伏せる
      hands: play ? Object.entries(k.hands).map(([id, h]) => ({ id, name: nameOf(w, id), bet: h.bet, cards: h.cards, done: h.done })) : [],
    };
    r.here.gamble = out; return r;
  };

  // ---- 画面（町の「賭場」タブ） ----
  const cardHtml = (c) => {
    if (!c) return '<span class="kcard" style="background:#5a4a3a;color:#aaa">？</span>';
    const [nm, col] = G.SUITS[c.s];
    return `<span class="kcard" style="border-color:${col};color:${col}"><b>${c.n}</b><small>${nm}</small><img src="${G.CARD_IMG(c)}" alt="" onerror="this.style.display='none'"></span>`;
  };
  G.css = '<style>.kcard{position:relative;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:38px;height:54px;margin:2px;border:2px solid;border-radius:5px;background:#f6ecd0;font-size:17px;line-height:1}.kcard small{font-size:11px}.kcard img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:3px}.gbdice{font-size:30px;letter-spacing:2px}</style>';
  G.html = (P, sel, myId) => {
    const gb = P.here.gamble, me = P.me; if (!gb) return '<div class="muted">賭場があるのは大きな町だけです</div>';
    sel = G.betValid(sel) ? sel : 100;
    let h = G.css + `<div class="muted">所持金 ${money(me.money)}　<span class="muted">（同じ町にいる人と同じ卓で勝負できます）</span></div>`;
    h += `<div class="row" style="margin:6px 0">掛け金：<b>${SIM.money(sel)}</b>　` + G.BETS.map((b) => `<button data-gbadd="${b}">+${SIM.money(b)}</button>`).join('') + `<button data-gbadd="-1">-100文</button><button data-gbadd="0">100文に戻す</button><button data-gbadd="max">全額</button></div>`; // 2.103.0 押すたびに足す
    const last = (L) => (L ? `<div class="muted" style="margin-top:4px">前の勝負：${L.head}${L.by ? `（${L.by}が開けた）` : ''}<br>${L.lines.join('<br>')}</div>` : '');
    const who = (T) => (T.bets.length ? `卓：${T.bets.map((x) => `${x.name}${x.pick ? (x.pick === 'even' ? '[丁]' : '[半]') : ''}${SIM.money(x.bet)}`).join('、')}` : '卓：まだ誰も賭けていません');
    for (const g of ['chouhan', 'memashi', 'shigoro']) {
      const T = gb[g], mine = T.bets.find((x) => x.id === myId), G0 = G.GAMES[g];
      h += `<div class="card" style="display:block"><b>${G0.name}</b><br><span class="muted">${G0.rule}</span><div class="muted" style="margin-top:4px">${who(T)}</div><div class="row" style="margin-top:6px">`;
      if (!mine) h += g === 'chouhan' ? `<button id="gb-${g}-e" data-act="gbBet" data-id="${g}" data-qty="${sel}" data-kind="even" ${me.money < sel ? 'disabled' : ''}>丁に${SIM.money(sel)}</button><button id="gb-${g}-o" data-act="gbBet" data-id="${g}" data-qty="${sel}" data-kind="odd" ${me.money < sel ? 'disabled' : ''}>半に${SIM.money(sel)}</button>` : `<button id="gb-${g}-b" data-act="gbBet" data-id="${g}" data-qty="${sel}" ${me.money < sel ? 'disabled' : ''}>${SIM.money(sel)}を賭ける</button>`;
      else h += `<span>賭け済み ${SIM.money(mine.bet)}${mine.pick ? (mine.pick === 'even' ? '（丁）' : '（半）') : ''}</span><button id="gb-${g}-r" data-act="gbRoll" data-id="${g}">${g === 'chouhan' ? '壺を開ける' : '振る'}</button><button id="gb-${g}-c" data-act="gbCancel" data-id="${g}">取り消す</button>`;
      h += `</div>${last(T.last)}</div>`;
    }
    { const U = gb.uma, mine = U.bets.find((x) => x.id === myId), L = U.last;
      h += `<div class="card" style="display:block"><b>${G.GAMES.uma.name}</b><br><span class="muted">${G.GAMES.uma.rule}</span>`;
      if (L) { // 走る様子（走りだして十数秒はアニメ、あとは着順の位置）
        const n = L.frames ? L.frames.length : 0;
        if (n) h += '<style>' + L.fin.map((_, i) => `@keyframes um${L.id}_${i}{${L.frames.map((f, k) => `${(k / (n - 1) * 100).toFixed(1)}%{right:${(f[i] * 0.88).toFixed(1)}%}`).join('')}}`).join('') + '</style>';
        h += '<div style="margin-top:6px;background:#3d5a2a;border-radius:4px;padding:2px 0">' + L.fin.map((x, i) => `<div style="position:relative;height:22px;border-bottom:1px dashed rgba(255,255,255,.25)"><span style="position:absolute;right:${n ? 0 : (x * 0.88).toFixed(1)}%;${n ? `animation:um${L.id}_${i} ${Math.max(3, n * 0.45).toFixed(1)}s linear forwards;` : ''}font-size:18px;white-space:nowrap">${SGK.ICON ? SGK.ICON.html('horse', 22) : ''}<small style="font-size:10px;color:#fff">${i + 1}</small></span></div>`).join('') + '<div class="muted" style="text-align:left;font-size:10px">← ゴール</div></div>';
        h += `<div class="muted" style="margin-top:4px">前のレース：${L.head}${L.by ? `（${L.by}が走らせた）` : ''}<br>${L.lines.join('<br>') || '賭けた人はいませんでした'}</div>`;
      }
      h += '<div style="margin-top:6px">' + U.horses.map((x, i) => `<div class="row" style="align-items:center;gap:6px;margin:2px 0"><span style="min-width:120px">${i + 1} ${x.name}<span class="muted">（${x.form}）</span></span><span>${x.odds}倍</span>` + (mine ? (mine.pick === i ? '<b>←賭け済み</b>' : '') : `<button id="gb-uma-${i}" data-act="gbBet" data-id="uma" data-qty="${sel}" data-kind="${i}" ${me.money < sel ? 'disabled' : ''}>${SIM.money(sel)}</button>`) + '</div>').join('') + '</div>';
      h += `<div class="muted" style="margin-top:4px">${U.bets.length ? '卓：' + U.bets.map((x) => `${x.name}[${U.horses[x.pick].name}]${SIM.money(x.bet)}`).join('、') : '卓：まだ誰も賭けていません'}</div>`;
      if (mine) h += `<div class="row" style="margin-top:6px"><button id="gb-uma-r" data-act="gbRoll" data-id="uma">走らせる</button><button id="gb-uma-c" data-act="gbCancel" data-id="uma">取り消す</button></div>`;
      h += '</div>'; }
    const K = gb.karuta, mineB = K.bets.find((x) => x.id === myId), myH = K.hands.find((x) => x.id === myId);
    h += `<div class="card" style="display:block"><b>${G.GAMES.karuta.name}</b><br><span class="muted">${G.GAMES.karuta.rule}</span>`;
    if (K.phase === 'bet') {
      h += `<div class="muted" style="margin-top:4px">${K.bets.length ? '卓：' + K.bets.map((x) => `${x.name}${SIM.money(x.bet)}`).join('、') : '卓：まだ誰も賭けていません'}</div><div class="row" style="margin-top:6px">`;
      if (!mineB) h += `<button id="gb-k-b" data-act="gbBet" data-id="karuta" data-qty="${sel}" ${me.money < sel ? 'disabled' : ''}>${SIM.money(sel)}を賭ける</button>`;
      else h += `<span>賭け済み ${SIM.money(mineB.bet)}</span><button id="gb-k-d" data-act="gbDeal" data-id="karuta">札を配る</button><button id="gb-k-c" data-act="gbCancel" data-id="karuta">取り消す</button>`;
      h += '</div>';
    } else {
      h += `<div style="margin-top:6px">親：${K.parent.map(cardHtml).join('')}</div>`;
      for (const x of K.hands) h += `<div>${x.name}（${SIM.money(x.bet)}）${x.cards.map(cardHtml).join('')} ${x.done ? '<span class="muted">勝負</span>' : '<span class="muted">考え中…</span>'}</div>`;
      h += '<div class="row" style="margin-top:6px">';
      if (myH && !myH.done) h += `<button id="gb-k-h" data-act="gbHit" data-id="karuta">もう1枚引く</button><button id="gb-k-s" data-act="gbStand" data-id="karuta">勝負する</button>`;
      if (myH) h += `<button id="gb-k-x" data-act="gbClose" data-id="karuta">みんな勝負にして締める</button>`;
      h += '</div>';
    }
    h += last(K.last) + '</div>';
    return h;
  };
})();
