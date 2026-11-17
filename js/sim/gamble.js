// 2.8.0 賭場（大きな町だけ）。丁半・目増・四五六・天正かるた。親（賭場）が相手で、同じ町の人は同じ卓で一緒に勝負できる。
// 賭けの進行（サイコロ・札）はホストだけが決める。命令の引数は c.id＝遊び名、c.qty＝賭け金、c.kind＝丁半の「丁/半」
(function () {
  const SIM = SGK.SIM, DATA = SGK.DATA;
  const G = (SGK.GAMBLE = {});
  G.BETS = [10, 50, 100, 500, 1000];
  G.GAMES = {
    chouhan: { name: '丁半', rule: 'サイコロ2つの合計が偶数なら「丁」、奇数なら「半」。当たれば2倍。誰かが壺を開けると全員の勝負が決まります。' },
    memashi: { name: '目増', rule: '親と自分がサイコロを2つずつ振り、合計が大きい方の勝ち（勝てば2倍・同じなら賭け金が戻る）。' },
    shigoro: { name: '四五六', rule: 'サイコロ3つの役の強さを親と比べます。ピンゾロ5倍・アラシ(ゾロ目)3倍・シゴロ(四五六)2倍・目の勝ちは2倍。目なしは3回まで振り直し、ヒフミ(一二三)は即負け。' },
    karuta: { name: '天正かるた', rule: '札(1〜12)を2枚配り、合計の一の位が9に近い方の勝ち。もう1枚引くか(最大3枚)勝負するかを選びます。同点は親の勝ち。最初の2枚が同じ数字(ゾロ目)なら3倍。親は一の位が4以下なら3枚目を引きます。' },
  };
  // 札の絵：img/karuta/<札の種類0〜3>-<数字1〜12>.png を置くと自動で絵に差し替わる（無ければ文字の札）
  G.CARD_IMG = (c) => `img/karuta/${c.s}-${c.n}.png`;
  G.SUITS = [['剣', '#4a7bd0'], ['杯', '#d04a4a'], ['棍', '#3f9a55'], ['金', '#c9a227']];
  const D6 = '⚀⚁⚂⚃⚄⚅';
  const SAY = (pid, t) => SIM.say(pid, t);
  const d6 = (w) => 1 + Math.floor(SIM.rand(w) * 6);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const money = (m) => SIM.money(m);
  const nameOf = (w, pid) => (w.players[pid] ? w.players[pid].name : '？');

  function tableOf(w, id) {
    w.gamble = w.gamble || {}; const t = (w.gamble[id] = w.gamble[id] || {});
    for (const g of ['chouhan', 'memashi', 'shigoro']) t[g] = t[g] || { bets: {}, last: null };
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
    if (a[0] === a[2]) return { rank: 90 + a[0], mult: 3, label: `アラシ(${a[0]}のゾロ目)` };
    if (a[0] === 4 && a[1] === 5 && a[2] === 6) return { rank: 80, mult: 2, label: 'シゴロ' };
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
  const diceTxt = (d) => d.map((x) => D6[x - 1]).join('');

  // ---- 丁半・目増・四五六：賭けて、誰かが開ける ----
  SIM.commands.gbBet = (w, p, c) => {
    const T = ok(w, p, c); if (!T) return;
    const bet = +c.qty;
    if (!G.BETS.includes(bet)) return;
    if (c.id === 'karuta' && T.phase !== 'bet') return SAY(p.id, 'いまは勝負の最中です。終わるまでお待ちを');
    if (T.bets[p.id]) return SAY(p.id, 'もう賭けています');
    if (c.id === 'chouhan' && c.kind !== 'even' && c.kind !== 'odd') return;
    if (p.money < bet) return SAY(p.id, '持ち金が足りません');
    p.money -= bet; T.bets[p.id] = { bet, pick: c.kind || null };
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
    const lines = []; let head = '';
    if (c.id === 'chouhan') {
      const a = d6(w), b = d6(w), even = (a + b) % 2 === 0; head = `${diceTxt([a, b])} ${a}・${b}＝${a + b}　${even ? '丁' : '半'}`;
      for (const pid in T.bets) { const x = T.bets[pid], q = w.players[pid]; const win = (x.pick === 'even') === even; if (q) pay(q, win ? x.bet * 2 : 0); lines.push(`${nameOf(w, pid)}（${x.pick === 'even' ? '丁' : '半'}・${money(x.bet)}）→ ${win ? '当たり ' + sign(x.bet) : 'はずれ ' + sign(-x.bet)}`); }
    } else if (c.id === 'memashi') {
      const pa = [d6(w), d6(w)], ps = pa[0] + pa[1]; head = `親 ${diceTxt(pa)}＝${ps}`;
      for (const pid in T.bets) {
        const x = T.bets[pid], q = w.players[pid], ma = [d6(w), d6(w)], ms = ma[0] + ma[1];
        const r = ms > ps ? 1 : ms < ps ? -1 : 0; if (q) pay(q, r > 0 ? x.bet * 2 : r === 0 ? x.bet : 0);
        lines.push(`${nameOf(w, pid)}（${money(x.bet)}）${diceTxt(ma)}＝${ms} → ${r > 0 ? '勝ち ' + sign(x.bet) : r === 0 ? '引き分け（返却）' : '負け ' + sign(-x.bet)}`);
      }
    } else {
      const pr = shigoroRoll(w); head = `親 ${diceTxt(pr.d)} ${pr.e.label}${pr.n > 1 ? `（${pr.n}回目）` : ''}`;
      for (const pid in T.bets) {
        const x = T.bets[pid], q = w.players[pid], m = shigoroRoll(w);
        const r = m.e.rank > pr.e.rank ? 1 : m.e.rank < pr.e.rank ? -1 : 0; const ret = r > 0 ? x.bet * m.e.mult : r === 0 ? x.bet : 0; if (q) pay(q, ret);
        lines.push(`${nameOf(w, pid)}（${money(x.bet)}）${diceTxt(m.d)} ${m.e.label} → ${r > 0 ? '勝ち ' + sign(ret - x.bet) : r === 0 ? '引き分け（返却）' : '負け ' + sign(-x.bet)}`);
      }
    }
    T.last = { head, lines, by: nameOf(w, p.id) };
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
    const ps = val(T.parent), pz = zoro({ cards: T.parent }), lines = [], head = `親 ${cardTxt(T.parent)} → ${ps}${pz ? '（ゾロ目）' : ''}`;
    for (const pid in T.hands) {
      const h = T.hands[pid], q = w.players[pid], ms = val(h.cards), mz = zoro(h); let win;
      if (mz && !pz) win = 3; else if (pz && !mz) win = 0; else win = ms > ps ? 2 : 0;
      if (q) pay(q, win * h.bet);
      lines.push(`${nameOf(w, pid)}（${money(h.bet)}）${cardTxt(h.cards)} → ${ms}${mz ? '（ゾロ目）' : ''} → ${win ? '勝ち ' + sign(win * h.bet - h.bet) : '負け ' + sign(-h.bet)}`);
      SAY(pid, `天正かるた：親${ps} 自分${ms} ${win ? '勝ち' : '負け'}`);
    }
    T.last = { head, lines }; T.phase = 'bet'; T.bets = {}; T.hands = {}; T.parent = []; T.deck = [];
  }

  // ---- 見せる情報（その町にいる人へ） ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.here) return r;
    const s = SIM.settlement(w, r.here.id); if (!s || !DATA.isBig(s)) return r;
    const t = tableOf(w, s.id), out = {};
    for (const g of ['chouhan', 'memashi', 'shigoro']) out[g] = { bets: Object.entries(t[g].bets).map(([id, x]) => ({ id, name: nameOf(w, id), bet: x.bet, pick: x.pick })), last: t[g].last };
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
    sel = G.BETS.includes(sel) ? sel : 100;
    let h = G.css + `<div class="muted">所持金 ${money(me.money)}　<span class="muted">（同じ町にいる人と同じ卓で勝負できます）</span></div>`;
    h += '<div class="row" style="margin:6px 0">掛け金：' + G.BETS.map((b) => `<button data-gbset="${b}" class="${b === sel ? 'on' : ''}">${b}文</button>`).join('') + '</div>';
    const last = (L) => (L ? `<div class="muted" style="margin-top:4px">前の勝負：${L.head}${L.by ? `（${L.by}が開けた）` : ''}<br>${L.lines.join('<br>')}</div>` : '');
    const who = (T) => (T.bets.length ? `卓：${T.bets.map((x) => `${x.name}${x.pick ? (x.pick === 'even' ? '[丁]' : '[半]') : ''}${x.bet}文`).join('、')}` : '卓：まだ誰も賭けていません');
    for (const g of ['chouhan', 'memashi', 'shigoro']) {
      const T = gb[g], mine = T.bets.find((x) => x.id === myId), G0 = G.GAMES[g];
      h += `<div class="card" style="display:block"><b>${G0.name}</b><br><span class="muted">${G0.rule}</span><div class="muted" style="margin-top:4px">${who(T)}</div><div class="row" style="margin-top:6px">`;
      if (!mine) h += g === 'chouhan' ? `<button id="gb-${g}-e" data-act="gbBet" data-id="${g}" data-qty="${sel}" data-kind="even" ${me.money < sel ? 'disabled' : ''}>丁に${sel}文</button><button id="gb-${g}-o" data-act="gbBet" data-id="${g}" data-qty="${sel}" data-kind="odd" ${me.money < sel ? 'disabled' : ''}>半に${sel}文</button>` : `<button id="gb-${g}-b" data-act="gbBet" data-id="${g}" data-qty="${sel}" ${me.money < sel ? 'disabled' : ''}>${sel}文を賭ける</button>`;
      else h += `<span>賭け済み ${mine.bet}文${mine.pick ? (mine.pick === 'even' ? '（丁）' : '（半）') : ''}</span><button id="gb-${g}-r" data-act="gbRoll" data-id="${g}">${g === 'chouhan' ? '壺を開ける' : '振る'}</button><button id="gb-${g}-c" data-act="gbCancel" data-id="${g}">取り消す</button>`;
      h += `</div>${last(T.last)}</div>`;
    }
    const K = gb.karuta, mineB = K.bets.find((x) => x.id === myId), myH = K.hands.find((x) => x.id === myId);
    h += `<div class="card" style="display:block"><b>${G.GAMES.karuta.name}</b><br><span class="muted">${G.GAMES.karuta.rule}</span>`;
    if (K.phase === 'bet') {
      h += `<div class="muted" style="margin-top:4px">${K.bets.length ? '卓：' + K.bets.map((x) => `${x.name}${x.bet}文`).join('、') : '卓：まだ誰も賭けていません'}</div><div class="row" style="margin-top:6px">`;
      if (!mineB) h += `<button id="gb-k-b" data-act="gbBet" data-id="karuta" data-qty="${sel}" ${me.money < sel ? 'disabled' : ''}>${sel}文を賭ける</button>`;
      else h += `<span>賭け済み ${mineB.bet}文</span><button id="gb-k-d" data-act="gbDeal" data-id="karuta">札を配る</button><button id="gb-k-c" data-act="gbCancel" data-id="karuta">取り消す</button>`;
      h += '</div>';
    } else {
      h += `<div style="margin-top:6px">親：${K.parent.map(cardHtml).join('')}</div>`;
      for (const x of K.hands) h += `<div>${x.name}（${x.bet}文）${x.cards.map(cardHtml).join('')} ${x.done ? '<span class="muted">勝負</span>' : '<span class="muted">考え中…</span>'}</div>`;
      h += '<div class="row" style="margin-top:6px">';
      if (myH && !myH.done) h += `<button id="gb-k-h" data-act="gbHit" data-id="karuta">もう1枚引く</button><button id="gb-k-s" data-act="gbStand" data-id="karuta">勝負する</button>`;
      if (myH) h += `<button id="gb-k-x" data-act="gbClose" data-id="karuta">みんな勝負にして締める</button>`;
      h += '</div>';
    }
    h += last(K.last) + '</div>';
    return h;
  };
})();
