// 2.12.4 賭場の画面：畳の部屋で、壺振り・賽が転がる・馬が走る・札を配る、を絵と動きで見せる（仕組みは sim/gamble.js のまま）
//  結果（last）の番号が変わったら、その勝負の演出を流してから結果を出す。同じ町にいる人の賭けも同じように見える
(function () {
  const UI = (SGK.GAMBLEUI = {}), G = SGK.GAMBLE, AU = () => SGK.AUDIO;
  const ART = 'assets/gamble/';
  let el = null, tab = 'chouhan', P = null, myId = null, seen = {}, busy = {}, sel = 100, lastHtml = {};
  const sfx = (k) => { try { AU().sfx(k); } catch (e) {} };
  const money = (n) => SGK.SIM.money(n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---- 賽（CSSの立方体。目は点で描く。一は赤くて大きい） ----
  const PIPS = { 1: [[50, 50]], 2: [[27, 27], [73, 73]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[27, 27], [73, 27], [27, 73], [73, 73]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]], 6: [[27, 22], [73, 22], [27, 50], [73, 50], [27, 78], [73, 78]] };
  const face = (n) => `<div class="gf gf${n}">${PIPS[n].map(([x, y]) => `<i style="left:${x}%;top:${y}%"${n === 1 ? ' class="r"' : ''}></i>`).join('')}</div>`;
  const ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] }; // その目を上（手前）に向ける回し方
  const die = (n, id) => `<div class="gd" ${id ? `id="${id}"` : ''}><div class="gc" style="transform:rotateX(${ROT[n || 1][0]}deg) rotateY(${ROT[n || 1][1]}deg)">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div>`;
  function roll(dEl, n, ms) { // 転がって n の目で止まる
    const c = dEl.querySelector('.gc'), [rx, ry] = ROT[n], sx = 720 + 360 * Math.floor(Math.random() * 3), sy = 720 + 360 * Math.floor(Math.random() * 3);
    c.style.transition = 'none'; c.style.transform = `rotateX(${rx + 37}deg) rotateY(${ry + 61}deg)`; void c.offsetWidth;
    c.style.transition = `transform ${ms}ms cubic-bezier(.15,.75,.25,1)`; c.style.transform = `rotateX(${rx + sx}deg) rotateY(${ry + sy}deg)`;
    dEl.classList.remove('bounce'); void dEl.offsetWidth; dEl.style.animationDuration = ms + 'ms'; dEl.classList.add('bounce');
  }

  const CSS = `<style>
#gbHall{position:fixed;inset:0;z-index:8800;color:#f3ead2;font-family:"Hiragino Mincho ProN","Yu Mincho",serif;background:#140f0a url(${ART}den.jpg) center/cover no-repeat;display:flex;flex-direction:column;overflow:hidden}
#gbHall:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,.05),rgba(0,0,0,.6));pointer-events:none}
#gbHall>*{position:relative}
#gbHall .top{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(rgba(10,6,3,.85),rgba(10,6,3,.4))}
#gbHall .top .t{font-size:20px;font-weight:bold;color:#f2c14e;margin-right:8px;letter-spacing:.2em}
#gbHall button{font:inherit;color:#f3ead2;background:linear-gradient(#5a3e22,#2e2012);border:1px solid #a07c42;border-radius:6px;padding:6px 11px;cursor:pointer;box-shadow:0 2px 0 rgba(0,0,0,.5)}
#gbHall button:disabled{opacity:.45;cursor:default}
#gbHall button.on{background:linear-gradient(#a0702e,#5a3e18);border-color:#f2c14e}
#gbHall .tabs{display:flex;gap:4px;flex-wrap:wrap;padding:4px 10px}
#gbHall .stage{flex:1;position:relative;min-height:0}
#gbHall .panel{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);width:min(760px,calc(100% - 16px));background:rgba(18,12,7,.82);border:1px solid #7a5a2e;border-radius:8px;padding:8px 10px;box-sizing:border-box}
#gbHall .rule{font-size:12px;color:#cdbf9c}
#gbHall .log{font-size:12px;color:#d8cba8;max-height:68px;overflow:auto;margin-top:4px}
#gbHall .row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}
#gbHall .mat{position:absolute;left:50%;top:48%;transform:translate(-50%,-50%);width:min(620px,92%);height:min(240px,40%);background:linear-gradient(#f3efe3,#dcd6c4);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.6),inset 0 0 30px rgba(120,100,60,.25)}
#gbHall .mat .half{position:absolute;top:0;bottom:0;width:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:rgba(60,30,20,.35);font-size:64px;font-weight:bold}
#gbHall .chips{display:flex;flex-wrap:wrap;gap:4px;justify-content:center;font-size:11px;color:#3a2a1a;max-width:90%}
#gbHall .chip{display:flex;align-items:center;gap:2px;background:rgba(255,255,255,.6);border-radius:10px;padding:1px 6px}
#gbHall .chip img{width:18px;height:18px}
#gbHall .who{position:absolute;bottom:42%;height:46%;max-height:330px;pointer-events:none;filter:drop-shadow(0 8px 12px rgba(0,0,0,.6))}
#gbHall .tsubo{position:absolute;left:50%;top:50%;width:110px;height:110px;margin:-75px 0 0 -55px;transition:transform .35s ease;z-index:3}
#gbHall .tsubo img{width:100%;height:100%;object-fit:contain;transform:scaleY(-1);filter:drop-shadow(0 -6px 6px rgba(0,0,0,.45))}
#gbHall .tsubo.up{transform:translateY(-90px)}
#gbHall .tsubo.shake{animation:gbShake .12s linear infinite alternate}
@keyframes gbShake{from{transform:translateY(-110px) rotate(-14deg)}to{transform:translateY(-100px) rotate(14deg)}}
#gbHall .dice{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;gap:16px;z-index:2}
#gbHall .gd{width:46px;height:46px;perspective:400px}
#gbHall .gd.bounce{animation:gbBounce 1s ease-out}
@keyframes gbBounce{0%{transform:translate(-160px,-120px)}35%{transform:translate(-30px,0)}55%{transform:translate(-10px,-18px)}75%{transform:translate(0,0)}87%{transform:translate(0,-5px)}100%{transform:translate(0,0)}}
#gbHall .gc{position:relative;width:100%;height:100%;transform-style:preserve-3d}
#gbHall .gf{position:absolute;inset:0;background:radial-gradient(circle at 35% 30%,#fffdf6,#e9e1cc);border:1px solid #b9ae94;border-radius:8px;box-shadow:inset 0 0 6px rgba(0,0,0,.18)}
#gbHall .gf i{position:absolute;width:18%;height:18%;margin:-9% 0 0 -9%;border-radius:50%;background:#1e1a16;box-shadow:inset 0 1px 1px rgba(255,255,255,.3)}
#gbHall .gf i.r{width:30%;height:30%;margin:-15% 0 0 -15%;background:#c81e1e}
#gbHall .gf1{transform:translateZ(23px)}#gbHall .gf6{transform:rotateY(180deg) translateZ(23px)}#gbHall .gf2{transform:rotateY(90deg) translateZ(23px)}#gbHall .gf5{transform:rotateY(-90deg) translateZ(23px)}#gbHall .gf3{transform:rotateX(90deg) translateZ(23px)}#gbHall .gf4{transform:rotateX(-90deg) translateZ(23px)}
#gbHall .big{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.3);opacity:0;font-size:84px;font-weight:bold;color:#fff;text-shadow:0 0 18px #c81e1e,0 4px 0 #400;transition:all .35s cubic-bezier(.2,1.6,.4,1);z-index:6;white-space:nowrap;pointer-events:none}
#gbHall .big.show{transform:translate(-50%,-50%) scale(1);opacity:1}
#gbHall .res{position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);font-size:26px;font-weight:bold;z-index:6;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 2px 6px #000;white-space:nowrap}
#gbHall .res.show{opacity:1}
#gbHall .say{position:absolute;background:#fffaf0;color:#2a1a10;border-radius:12px;padding:4px 10px;font-size:18px;font-weight:bold;opacity:0;transition:opacity .2s;z-index:7;pointer-events:none}
#gbHall .say.show{opacity:1}
#gbHall .tray{position:absolute;left:50%;top:45%;width:min(300px,60%);aspect-ratio:1;transform:translate(-50%,-50%);background:url(${ART}tray.png) center/contain no-repeat}
#gbHall .tray .dice{gap:10px}
#gbHall .track{position:absolute;left:0;right:0;top:4%;bottom:34%;background:url(${ART}track.jpg) 50% 60%/cover no-repeat;border-top:3px solid #3a2a1a;border-bottom:3px solid #3a2a1a;overflow:hidden}
#gbHall .track:after{content:"";position:absolute;left:0;right:0;bottom:0;height:9%;background:repeating-linear-gradient(90deg,#6b4a2a 0 10px,transparent 10px 140px),linear-gradient(transparent 30%,#7a5a36 30% 45%,transparent 45%);opacity:.9}
#gbHall .track.run:after{animation:gbScroll .5s linear infinite}
@keyframes gbScroll{from{background-position-x:0,0}to{background-position-x:-150px,0}}
#gbHall .lane{position:absolute;left:0;right:0;height:27%;}
#gbHall .horse{position:absolute;right:2%;bottom:0;height:100%;aspect-ratio:1;transform:translateX(50%)}
#gbHall .horse img{height:100%;width:100%;object-fit:contain;filter:drop-shadow(0 3px 3px rgba(0,0,0,.5))}
#gbHall .horse.gal img{animation:gbGal .32s ease-in-out infinite alternate}
@keyframes gbGal{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-12%) rotate(3deg)}}
#gbHall .horse b{position:absolute;right:-6px;top:0;background:#000a;border-radius:8px;padding:0 5px;font-size:12px}
#gbHall .goal{position:absolute;left:5%;top:0;bottom:0;width:6px;background:repeating-linear-gradient(#fff 0 10px,#c81e1e 10px 20px)}
#gbHall .call{position:absolute;left:50%;top:2%;transform:translateX(-50%);background:rgba(0,0,0,.65);padding:3px 14px;border-radius:14px;font-size:17px;white-space:nowrap;z-index:5}
#gbHall .kc{display:inline-block;width:58px;height:84px;margin:3px;border-radius:6px;perspective:500px;vertical-align:middle}
#gbHall .kc .in{display:block;position:relative;width:100%;height:100%;transition:transform .5s;transform-style:preserve-3d}
#gbHall .kc.back .in{transform:rotateY(180deg)}
#gbHall .kc .fc,#gbHall .kc .bk{position:absolute;inset:0;border-radius:6px;backface-visibility:hidden;box-shadow:0 3px 6px rgba(0,0,0,.5)}
#gbHall .kc .fc{background:#f6efdc;border:2px solid;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:3px 0;box-sizing:border-box}
#gbHall .kc .fc b{font-size:20px;line-height:1}#gbHall .kc .fc img{width:70%;height:50%;object-fit:contain}
#gbHall .kc .bk{background:#7a1a12 url(${ART}cardback.png) center/cover;transform:rotateY(180deg);border:2px solid #d8b060}
#gbHall .kc.deal{animation:gbDeal .45s ease-out both}
@keyframes gbDeal{from{transform:translate(160px,-160px) rotate(40deg);opacity:0}to{transform:none;opacity:1}}
#gbHall .hand{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
#gbHall .kar{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(680px,94%);text-align:center}
#gbHall .lbl{font-size:13px;color:#e8d8b0;min-width:70px}
@media (max-width:600px){#gbHall .mat .half{font-size:44px}#gbHall .big{font-size:60px}#gbHall .who{height:34%}}
</style>`;

  UI.open = (priv, id) => {
    if (el) UI.close();
    P = priv; myId = id; seen = {}; busy = {}; lastHtml = {};
    const gb = P && P.here && P.here.gamble; if (!gb) return;
    for (const g of ['chouhan', 'memashi', 'shigoro', 'uma', 'karuta']) seen[g] = gb[g].last ? gb[g].last.id : null; // 入る前の結果は流さない
    el = document.createElement('div'); el.id = 'gbHall';
    el.innerHTML = CSS + `<div class="top"><span class="t">賭場</span><span id="gbMoney"></span><span style="flex:1"></span><span class="lbl">掛け金</span><span id="gbBets"></span><button data-x="1">出る</button></div><div class="tabs" id="gbTabs"></div><div class="stage" id="gbStage"></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    sfx('zawa'); render(true);
  };
  UI.close = () => { if (el) el.remove(); el = null; P = null; };
  UI.isOpen = () => !!el;
  UI.update = (priv) => { if (!el) return; P = priv; const gb = P && P.here && P.here.gamble; if (!gb) return UI.close(); render(false); };

  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.x) return UI.close();
    if (d.tab) { tab = d.tab; lastHtml = {}; render(true); return; }
    if (d.sel) { sel = +d.sel; render(false); return; }
    if (d.cmd) { const c = { type: d.cmd, id: d.id }; if (d.kind != null) c.kind = d.kind; if (d.cmd === 'gbBet') c.qty = sel; SGK.cmd(c); sfx(d.cmd === 'gbBet' ? 'coin' : 'click'); }
  }
  const NAMES = { chouhan: '丁半', memashi: '目増', shigoro: '四五六', uma: '馬くらべ', karuta: '天正かるた' };
  function render(full) {
    const gb = P.here.gamble, me = P.me;
    el.querySelector('#gbMoney').innerHTML = `${SGK.ICON ? SGK.ICON.html('coins', 20) : ''} ${money(me.money)}`;
    el.querySelector('#gbBets').innerHTML = G.BETS.map((v) => `<button data-sel="${v}" class="${v === sel ? 'on' : ''}">${v}文</button>`).join('');
    el.querySelector('#gbTabs').innerHTML = Object.entries(NAMES).map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('');
    const st = el.querySelector('#gbStage');
    if (full || !st.dataset.g || st.dataset.g !== tab) { st.dataset.g = tab; st.innerHTML = SCENE[tab](); }
    PANEL[tab](st.querySelector('.panel'), gb[tab], me);
    const L = gb[tab].last;
    if (L && L.id != null && L.id !== seen[tab] && !busy[tab]) { seen[tab] = L.id; busy[tab] = 1; PLAY[tab](st, L, gb[tab]).catch(() => {}).then(() => { busy[tab] = 0; if (el) render(false); }); }
    for (const g of Object.keys(NAMES)) if (g !== tab && gb[g].last && gb[g].last.id !== seen[g]) seen[g] = gb[g].last.id; // 見ていない卓の結果は流さない
  }
  const setPanel = (pn, key, html) => { if (lastHtml[key] !== html) { lastHtml[key] = html; pn.innerHTML = html; } };
  const logHtml = (L) => (L ? `<div class="log">前の勝負：${esc(L.head)}${L.by ? `（${esc(L.by)}）` : ''}<br>${(L.lines || []).map(esc).join('<br>')}</div>` : '');
  const coin = () => (SGK.ICON ? SGK.ICON.html('coins', 18) : '');
  const chip = (x, t) => `<span class="chip">${coin()}${esc(x.name)}${t ? ' ' + t : ''} ${x.bet}文</span>`;
  const mine = (T) => T.bets.find((x) => x.id === myId);
  function banner(st, txt, col) { const b = st.querySelector('.big'); if (!b) return; b.textContent = txt; b.style.textShadow = `0 0 18px ${col || '#c81e1e'},0 4px 0 #400`; b.classList.add('show'); }
  function result(st, L) {
    const r = (L.rows || []).find((x) => x.id === myId), el2 = st.querySelector('.res'); if (!r || !el2) return;
    el2.innerHTML = r.r > 0 ? `<span style="color:#ffd76a">勝ち　＋${money(r.gain)}</span>` : r.r < 0 ? `<span style="color:#ff8a7a">負け　－${money(-r.gain)}</span>` : '<span>引き分け（返却）</span>';
    el2.classList.add('show'); sfx(r.r > 0 ? 'gbWin' : r.r < 0 ? 'gbLose' : 'click');
  }
  function say(st, txt, x, y) { const s = st.querySelector('.say'); if (!s) return; s.textContent = txt; s.style.left = x; s.style.top = y; s.classList.add('show'); setTimeout(() => s.classList.remove('show'), 1100); }
  const clear = (st) => { for (const c of st.querySelectorAll('.big,.res')) c.classList.remove('show'); };

  // ---- 場面（絵の配置） ----
  const SCENE = {
    chouhan: () => `<img class="who" src="${ART}dealer2_p.png" style="left:1%;bottom:14%;height:58%;max-height:none"><div class="mat"><div class="half" style="left:0">丁<div class="chips" id="gbE"></div></div><div class="half" style="right:0">半<div class="chips" id="gbO"></div></div><div class="dice">${die(1, 'gd0')}${die(1, 'gd1')}</div><div class="tsubo" id="gbTsubo"><img src="${ART}tsubo.png"></div></div><div class="say"></div><div class="big"></div><div class="res"></div><div class="panel"></div>`,
    memashi: () => diceScene(2),
    shigoro: () => diceScene(3),
    uma: () => `<div class="track" id="gbTrack"><div class="goal"></div>${[0, 1, 2, 3, 4, 5].map((i) => `<div class="lane" style="top:${-4 + i * 12.6}%;z-index:${i + 1}"><div class="horse" id="gbH${i}" style="right:4%"><img src="${ART}horse.png" style="filter:hue-rotate(${i * 55}deg) saturate(${0.8 + (i % 3) * 0.25}) brightness(${1.1 - (i % 2) * 0.15}) drop-shadow(0 3px 3px rgba(0,0,0,.5))"><b>${i + 1}</b></div></div>`).join('')}<div class="call" id="gbCall">さあ、どの馬に賭ける</div></div><div class="big"></div><div class="res"></div><div class="panel"></div>`,
    karuta: () => `<img class="who" src="${ART}boss4.png" style="right:6%;height:40%"><div class="kar"><div class="lbl">親</div><div class="hand" id="gbPar"></div><div class="lbl" style="margin-top:10px">あなた</div><div class="hand" id="gbMine"></div></div><div class="big"></div><div class="res"></div><div class="panel"></div>`,
  };
  const diceScene = (n) => `<img class="who" src="${ART}boss4.png" style="right:4%;height:42%"><div class="lbl" style="position:absolute;left:50%;top:6%;transform:translateX(-50%);font-size:16px" id="gbPL">親の賽</div><div class="tray"><div class="dice" id="gbPD">${Array.from({ length: n }, (_, i) => die(1, 'gp' + i)).join('')}</div></div><div class="lbl" style="position:absolute;left:50%;top:70%;transform:translateX(-50%);font-size:16px" id="gbML">あなたの賽</div><div class="dice" id="gbMD" style="top:78%">${Array.from({ length: n }, (_, i) => die(1, 'gm' + i)).join('')}</div><div class="big"></div><div class="res"></div><div class="panel"></div>`;

  // ---- 下の操作の欄 ----
  const PANEL = {
    chouhan(pn, T, me) {
      const m = mine(T);
      const e = el.querySelector('#gbE'), o = el.querySelector('#gbO');
      if (e) { const h1 = T.bets.filter((x) => x.pick === 'even').map((x) => chip(x)).join(''), h2 = T.bets.filter((x) => x.pick === 'odd').map((x) => chip(x)).join(''); if (e.innerHTML !== h1) e.innerHTML = h1; if (o.innerHTML !== h2) o.innerHTML = h2; }
      setPanel(pn, 'ch', `<div class="rule">${esc(G.GAMES.chouhan.rule)}</div><div class="row">${m ? `<span>${m.pick === 'even' ? '丁' : '半'}に${m.bet}文 張った</span><button data-cmd="gbRoll" data-id="chouhan">勝負！（壺を開ける）</button><button data-cmd="gbCancel" data-id="chouhan">取り消す</button>` : `<button data-cmd="gbBet" data-id="chouhan" data-kind="even" ${me.money < sel ? 'disabled' : ''}>丁に張る（${sel}文）</button><button data-cmd="gbBet" data-id="chouhan" data-kind="odd" ${me.money < sel ? 'disabled' : ''}>半に張る（${sel}文）</button>`}</div>${logHtml(T.last)}`);
    },
    memashi(pn, T, me) { dicePanel(pn, T, me, 'memashi'); },
    shigoro(pn, T, me) { dicePanel(pn, T, me, 'shigoro'); },
    uma(pn, T, me) {
      const m = mine(T);
      setPanel(pn, 'um', `<div class="rule">${esc(G.GAMES.uma.rule)}</div><div class="row">${T.horses.map((x, i) => `<button data-cmd="gbBet" data-id="uma" data-kind="${i}" ${m || me.money < sel ? 'disabled' : ''} class="${m && m.pick === i ? 'on' : ''}" style="font-size:12px">${i + 1} ${esc(x.name)}<br>${x.odds}倍・${x.form}</button>`).join('')}</div><div class="row">${m ? `<button data-cmd="gbRoll" data-id="uma">走らせる</button><button data-cmd="gbCancel" data-id="uma">取り消す</button>` : `<span class="rule">賭ける馬を選んでください（${sel}文）</span>`}<span class="rule">${T.bets.map((x) => `${esc(x.name)}［${x.pick + 1}］${x.bet}文`).join('、')}</span></div>${logHtml(T.last)}`);
    },
    karuta(pn, T, me) {
      const mb = mine(T), myH = T.hands.find((x) => x.id === myId);
      if (!busy.karuta) { // 配られた札（演出中でなければ今の札を出す）
        const par = el.querySelector('#gbPar'), my = el.querySelector('#gbMine');
        if (par && T.phase === 'play') { const h1 = T.parent.map((c) => cardHtml(c)).join(''), h2 = myH ? myH.cards.map((c) => cardHtml(c)).join('') : '<span class="rule">（見物中）</span>'; if (par.dataset.h !== h1) { par.dataset.h = h1; par.innerHTML = h1; } if (my.dataset.h !== h2) { const nn = my.querySelectorAll('.kc').length; my.dataset.h = h2; my.innerHTML = h2; [...my.querySelectorAll('.kc')].slice(nn).forEach((c) => { c.classList.add('deal'); sfx('card'); }); } }
        else if (par && T.phase === 'bet' && !T.last) { par.innerHTML = cardHtml(null) + cardHtml(null); my.innerHTML = ''; }
      }
      let h = `<div class="rule">${esc(G.GAMES.karuta.rule)}</div><div class="row">`;
      if (T.phase === 'bet') h += mb ? `<span>${mb.bet}文 賭けた</span><button data-cmd="gbDeal" data-id="karuta">札を配る</button><button data-cmd="gbCancel" data-id="karuta">取り消す</button>` : `<button data-cmd="gbBet" data-id="karuta" ${me.money < sel ? 'disabled' : ''}>${sel}文 賭ける</button>`;
      else { if (myH && !myH.done) h += `<button data-cmd="gbHit" data-id="karuta">もう1枚引く</button><button data-cmd="gbStand" data-id="karuta">勝負する</button>`; if (myH) h += `<button data-cmd="gbClose" data-id="karuta">みんな勝負にして締める</button>`; h += `<span class="rule">${T.hands.map((x) => `${esc(x.name)}${x.done ? '（勝負）' : '（考え中）'}`).join('、')}</span>`; }
      setPanel(pn, 'ka', h + `</div><div class="rule">${T.phase === 'bet' ? T.bets.map((x) => `${esc(x.name)} ${x.bet}文`).join('、') : ''}</div>${logHtml(T.last)}`);
    },
  };
  function dicePanel(pn, T, me, g) {
    const m = mine(T);
    setPanel(pn, g, `<div class="rule">${esc(G.GAMES[g].rule)}</div><div class="row">${m ? `<span>${m.bet}文 賭けた</span><button data-cmd="gbRoll" data-id="${g}">振る</button><button data-cmd="gbCancel" data-id="${g}">取り消す</button>` : `<button data-cmd="gbBet" data-id="${g}" ${me.money < sel ? 'disabled' : ''}>${sel}文 賭ける</button>`}<span class="rule">${T.bets.map((x) => `${esc(x.name)} ${x.bet}文`).join('、')}</span></div>${logHtml(T.last)}`);
  }
  const SUIT = ['sword', 'cup', 'club', 'coin'], KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  function cardHtml(c, back) {
    if (!c) return `<span class="kc back"><span class="in"><span class="fc"></span><span class="bk"></span></span></span>`;
    const [nm, col] = G.SUITS[c.s];
    return `<span class="kc${back ? ' back' : ''}"><span class="in"><span class="fc" style="border-color:${col};color:${col}"><b>${KAN[c.n]}</b><img src="${ART}suit_${SUIT[c.s]}.png" alt="${nm}"><small style="font-size:10px">${nm}</small></span><span class="bk"></span></span></span>`;
  }

  // ---- 演出 ----
  const PLAY = {
    async chouhan(st, L) {
      clear(st); const ts = st.querySelector('#gbTsubo'), d0 = st.querySelector('#gd0'), d1 = st.querySelector('#gd1');
      ts.classList.remove('up'); ts.classList.add('shake'); sfx('diceShake'); say(st, '入ります！', '58%', '18%');
      await wait(900); ts.classList.remove('shake'); sfx('tsuboDown'); await wait(500);
      say(st, 'さあ張った張った！', '58%', '18%'); await wait(900);
      say(st, '勝負！', '58%', '18%'); await wait(500);
      for (const [dd, n] of [[d0, L.d[0]], [d1, L.d[1]]]) { const c = dd.querySelector('.gc'), [rx, ry] = ROT[n]; c.style.transition = 'none'; c.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; }
      ts.classList.add('up'); sfx('tsuboOpen'); await wait(450);
      banner(st, `${L.d[0] + L.d[1]}の${L.even ? '丁' : '半'}！`, L.even ? '#c81e1e' : '#1e5ac8'); await wait(700); result(st, L); await wait(1600);
    },
    async memashi(st, L) { await diceShow(st, L, 2); },
    async shigoro(st, L) { await diceShow(st, L, 3); },
    async uma(st, L, T) {
      clear(st); const tr = st.querySelector('#gbTrack'), call = st.querySelector('#gbCall'), F = L.frames, names = L.names || T.horses.map((h) => h.name);
      if (!F || !F.length) return;
      tr.classList.add('run'); const hs = [0, 1, 2, 3, 4, 5].map((i) => st.querySelector('#gbH' + i)); hs.forEach((h) => h.classList.add('gal'));
      call.textContent = 'いっせいに駆け出した！'; sfx('gallop');
      const step = 300; let lead = -1;
      for (let k = 0; k < F.length; k++) {
        hs.forEach((h, i) => { h.style.transition = `right ${step}ms linear`; h.style.right = `${4 + F[k][i] * 0.88}%`; });
        const order = F[k].map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); if (L.win != null && k >= F.length - 3) order[0] = [0, L.win]; // ゴール前は本当の一着を
        if (k > 0 && order[0][1] !== lead) { lead = order[0][1]; call.textContent = k < F.length - 2 ? `${names[lead]}が前に出た！` : `${names[lead]}、抜け出した！`; }
        if (k % 4 === 3) sfx('gallop');
        await wait(step);
      }
      tr.classList.remove('run'); hs.forEach((h) => h.classList.remove('gal'));
      const fin = L.fin, win = L.win != null ? L.win : fin.indexOf(Math.max(...fin)); // 本当の一着（ゴールでは何頭も100%で並ぶので） hs[win].style.right = `${4 + F[F.length - 1][win] * 0.88 + 3}%`; call.textContent = `一着は ${names[win]}！`; // 一着の馬を少し前に
      banner(st, `一着　${win + 1}`, '#c8a01e'); await wait(500); result(st, L); await wait(1800);
    },
    async karuta(st, L) {
      clear(st); const par = st.querySelector('#gbPar'), my = st.querySelector('#gbMine'), r = (L.rows || []).find((x) => x.id === myId);
      par.innerHTML = L.parent.map((c) => cardHtml(c, true)).join(''); par.dataset.h = '';
      if (r) { my.innerHTML = r.cards.map((c) => cardHtml(c)).join(''); my.dataset.h = ''; }
      await wait(400);
      for (const c of par.querySelectorAll('.kc')) { c.classList.remove('back'); sfx('card'); await wait(380); }
      banner(st, `親は ${L.pv}${L.pz ? '（ゾロ目）' : ''}`, '#7a3ac8'); await wait(900);
      if (r) { st.querySelector('.big').classList.remove('show'); await wait(200); banner(st, `あなたは ${r.v}${r.z ? '（ゾロ目）' : ''}`, r.r > 0 ? '#c8a01e' : '#555'); await wait(600); result(st, L); }
      await wait(1800);
    },
  };
  async function diceShow(st, L, n) {
    clear(st);
    const pl = st.querySelector('#gbPL'), ml = st.querySelector('#gbML');
    pl.textContent = '親が振る…'; sfx('diceShake'); await wait(500);
    L.pd.forEach((v, i) => roll(st.querySelector('#gp' + i), v, 1100)); sfx('diceRoll'); await wait(1250);
    pl.textContent = `親：${L.pd.join('・')}${L.pl ? '　' + L.pl : `　合計${L.pd[0] + L.pd[1]}`}`;
    if (L.pl && /ピンゾロ|アラシ|シゴロ|ヒフミ/.test(L.pl)) { banner(st, L.pl.replace(/\(.*\)/, ''), '#c81e1e'); await wait(900); st.querySelector('.big').classList.remove('show'); }
    const r = (L.rows || []).find((x) => x.id === myId);
    if (r) {
      ml.textContent = 'あなたが振る…'; sfx('diceShake'); await wait(450);
      r.d.forEach((v, i) => roll(st.querySelector('#gm' + i), v, 1100)); sfx('diceRoll'); await wait(1250);
      ml.textContent = `あなた：${r.d.join('・')}${r.label ? '　' + r.label : `　合計${r.d[0] + r.d[1]}`}`;
      if (r.label && /ピンゾロ|アラシ|シゴロ|ヒフミ/.test(r.label)) { banner(st, r.label.replace(/\(.*\)/, ''), '#c8a01e'); await wait(800); }
      result(st, L);
    } else ml.textContent = '（見物中）';
    await wait(1800);
  }
})();
