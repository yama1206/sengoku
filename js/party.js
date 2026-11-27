// 2.42.0 みんなで遊ぶミニゲーム：馬の障害レース／弓の的当て大会（どちらも個人戦・チーム戦）／荷運び競争（協力）
// 町の通りの「みんなで遊ぶ」から部屋を作り、同じ町にいる人を誘う。やりとりは忍びの協力任務と同じ中継（main.js の ninRelay、ch:'party'）を使う。
//  馬の障害レースはリーダーが全員の走りと順位を計算する。弓は各自で的を射って点数を送り合う
//  荷運び：部屋を作った人（リーダー）の端末が荷車を動かして全員に配る。報酬は sim/party.js の partyResult
// 絵は仮：馬・人・荷車・的は canvas で描いた簡単な形（あとで絵に置き換えやすいよう、描く関数を分けてある）
(function () {
  const SGK = window.SGK, PT = (SGK.PARTY = {});
  let ENV = null; // { me(), name(), others(), send(to, m), cmd(c) }
  PT.init = (e) => { ENV = e; };
  const GAMES = {
    race: { name: '馬の障害レース', max: 10, team: true, desc: '同じコースを3周して着順を競います。馬は自動で前へ走ります。左右キー／スティックで道幅の中を自由に移動し、Space／Aで柵を跳び越え、Shift／X・Bでダッシュ。金色の板を踏むと加速し、緑の箱を通ると道具が手に入ります。E／Yで道具を使います。早駆けは加速、守り札は減速を一度防ぎ、泥袋は後ろの相手に罠を置きます。重い馬は減速に強く、軽い馬はカーブで外へ流されにくくなります。ひとり練習ではCPU5頭と競走できます。' },
    archery: { name: '弓の的当て大会', max: 10, team: true, desc: '動く的を10本で射抜いて点を競う。風で矢が流れる。狙う＝マウス／矢印／スティック、射つ＝クリック／A／Space。金の的は2倍' },
    fish: { name: '釣り大会', max: 10, team: true, mode: true, desc: '始めてからゲームの時間で1日のあいだ、それぞれ地図の川・湖・海へ出て、いつもの釣りで釣った魚でくらべる（拠点の中では釣れません）。勝ち方は「いちばん大きい魚」か「釣った数」を選べます。1日たつと順位と賞金が届きます' },
    hayashi: { name: '囃子合わせ', max: 5, team: false, desc: '和楽器のリズム遊び。太鼓・鼓・篠笛・三味線・鉦から楽器を選び、みんなで一つの曲を合わせる。流れてくる譜を下の線で打つ（赤＝F・J・Space、白＝D・K。画面では左右に赤と白のボタン）。自分のパートは叩いた音で鳴る' },
    hide: { name: 'かくれんぼ？', max: 10, team: false, opts: true, desc: '隠れる側は木箱・樽・壺などの置物に化けて、探す側から逃げ切る。隠れる側：Aで近くの物に化ける、Bで人に戻る。逃げる側は体力100で、叩かれるとダメージを受けて少しのあいだ足が速くなる。体力がなくなると鬼に担がれて（15秒以内に運べないとふりほどかれる）牢（紫の光・マップに12個）に入れられ、45秒たつと完全に負けるが、仲間が牢に近づいて1秒で救助できる（残り時間が半分を過ぎてから救助されると、次に吊るされたらすぐ負け。半分より前なら、次もまた45秒耐えられる。3回目はすぐ負け）（化けた物が大きいほど受けるダメージは少なく、小さいほど大きい）。探す側：Aで叩く（本物の置物を叩くと体力が減る）、Bで近くの置物に化けることもできる（Aで叩くと正体を現す）。最初の15秒は探す側は目をつぶって動けない。ときどき音がして、だれかの近くが分かる。勝ち方は「宝箱の鍵を集めて脱出」。場面に11個ある宝箱のそばで動かずにいると少しずつ開き（1人だと約80秒、人数が増えるほど早い。化けたままでは開けられない）、12秒ごとに出る4つの合図（A・B・X・Yのボタン。コントローラーはPS配置で ×=A ○=B □=X △=Y）を時間内に順に押さないと1秒だけ開けられなくなり、鬼に宝箱の場所が知らされる（鬼には宝箱が赤い枠で壁越しにも見える）。7つ開けると離れた2か所に鳥居の出口が現れ（このとき全員の位置が壁越しに見える）、出口は動かずに20秒そばにいると開き（宝箱も出口も、途中でやめても進捗は残る）、開いた出口に着いた人が脱出成功になります。脱出口（出口や井戸）が開いている間は、鬼の叩きが一撃でダウンになり、足が少し速くなります。鬼が2人捕まえたら引き分け、3人以上で鬼の勝ちです。脱出できた逃げる側が半分以下のときは、脱出できた人だけが勝ちになります。逃げる側が1人だけになると、場面に5か所ある井戸のうちランダムな1つの蓋が開いて、すぐ使える脱出口になります。鬼がその井戸の近くに2秒とどまると蓋を閉じられて、閉じると普通の出口（2か所）が開きます。鬼は部屋で「鬼に立候補する」を押すと立候補でき、立候補がいなければ全員から、複数いれば立候補した人からランダムで決まります。脱出モードの制限時間は10分で、時間切れは鬼の勝ちです。賞金：鬼側が勝つと5貫。逃げる側（脱出モード）は、4人脱出か3人脱出なら全員1貫ずつ、2人脱出なら脱出した人1.5貫・捕まった人1貫、1人だけ脱出なら脱出した人2.5貫・捕まった人0.5貫です。逃げる側は◆の付いた物に化けられます。人数：参加は最大10人。鬼は1〜2人、逃げる側は4〜8人（部屋で選べます）。CPU：「鬼のCPU」を選ぶと、鬼の人数に足りない分（立候補した人が足りない分）をCPUがやります。「逃げる側のCPU」を選ぶと、決めた人数に足りない分だけCPUが加わります（強さは よわい・ふつう・つよい）。1人でも「ひとりで練習」でCPUと遊べます（報酬なし）。CPUはリーダーの端末が動かします。舞台・探す側の人数・化けたあとの動き・勝ち方・見つかったあとを選べます' },
    kemari: { name: '蹴鞠', max: 10, team: false, desc: '輪になって鞠を蹴り回す。鞠が自分に飛んできたら、足もとの輪に重なった瞬間に蹴る。速く返すかゆるく返すかを選ぶ（操作の文字は使っている機器に合わせて出ます）。ひとり50回ずつ蹴り切り、タイミングの正確さを競う。落としても続き、続けるほど鞠は速くなる。毎月5日は大きな町で蹴鞠大会' },
    cart: { name: '荷運び競争', max: 10, team: true, desc: '荷車を引いてゴールまで運ぶ。←→で5本の道を選ぶ（みんなの平均で進む）、A／Space／画面の「引く」を連打すると加速する。岩にぶつかると荷が崩れる。「？」の箱で道具（加速・修理・守り、チーム戦では相手に岩落とし）が手に入り、B／X／クリックで使う。チーム戦は赤と白の荷車で競走' },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const TEAM = [{ n: '赤', c: '#e0463c' }, { n: '白', c: '#f2f2f2' }], PAL = ['#e0463c', '#3c8ce0', '#e0b43c', '#4cc06a', '#b46ae0', '#ee8a3c', '#3cc8c8', '#e06aa8', '#8a8a8a', '#7a5a3a'];
  const send = (to, m) => { if (ENV && to.length) ENV.send(to, Object.assign({}, m, { ch: 'party' })); };

  // ---- 見た目（CSS） ----
  let css = false;
  function addCss() {
    if (css) return; css = true; const s = document.createElement('style');
    s.textContent = `#ptBox,#ptRes{position:fixed;inset:0;z-index:9300;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:inherit}
#ptBox>div,#ptRes>div{max-height:92vh;overflow:auto;background:#2a2118;color:#f3ead2;border:2px solid #a07c42;border-radius:10px;padding:16px 20px;max-width:min(92vw,460px);box-shadow:0 8px 30px #000a}
#ptBox .race-choices{width:min(460px,calc(100vw - 24px));box-sizing:border-box}
#ptBox .race-choices button{margin-right:0}
#ptBox .race-option{display:flex;align-items:center;gap:10px;margin:7px 0 0;padding:9px 10px}
#ptBox .race-option img{width:54px;height:64px;object-fit:contain;flex:none;background:#322519;border-radius:5px}
#ptBox .race-option-text{flex:1;min-width:0}
#ptBox .race-option .race-stats{grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))}
#ptGame .race-world,#ptGame .race-scenery{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#ptGame .race-scenery{background:#a9b1a1 url('assets/race/shinano.jpg') center top / max(100%, 171vh) auto no-repeat}
#ptGame .race-world{z-index:1}#ptGame canvas.race-hud{position:absolute;inset:0;z-index:2}
#ptBox .race-option[aria-current="true"]{border-color:#f2c14e}
#ptBox .race-equipped{margin-left:10px;color:#ffe09a;font-size:12px}
#ptBox .race-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;margin-top:6px;font-size:12px;color:#eee0c6}
#ptBox .race-stats strong{margin-left:4px}
#ptBox .race-rise{color:#b9edba}#ptBox .race-fall{color:#ffb5a7}
#ptBox h2,#ptRes h2{margin:0 0 6px;color:#f2c14e;font-size:20px}#ptBox .d{font-size:13px;color:#cdbf9a;margin-bottom:8px}
#ptBox button,#ptRes button,#ptInv button,#ptGame .tb button{font:inherit;color:#f3ead2;background:linear-gradient(#5a3e22,#2e2012);border:1px solid #a07c42;border-radius:6px;padding:7px 12px;margin:3px 3px 0 0;cursor:pointer}
#ptBox button{display:block;width:100%;text-align:left;box-sizing:border-box}#ptBox .m{padding:3px 0;border-bottom:1px solid #fff2}#ptRes .r{padding:3px 0;border-bottom:1px solid #fff2}
#ptInv{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9400;background:#2a2118;color:#f3ead2;border:2px solid #f2c14e;border-radius:10px;padding:10px 14px;box-shadow:0 4px 18px #000a;max-width:92vw}
#ptGame{position:fixed;inset:0;z-index:9200;background:#000}#ptGame canvas{width:100%;height:100%;display:block;touch-action:none}
#ptGame .tb{position:absolute;right:8px;top:8px;z-index:5}#ptGame .pad{position:absolute;bottom:14px;display:none;gap:10px;z-index:5}
#ptGame .pad{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#ptGame .pad button{width:72px;height:72px;border-radius:36px;font-size:14px;opacity:.85;white-space:pre-line;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#ptGame.race .pad{gap:5px}#ptGame.race .pad button{width:clamp(44px,14vw,66px);height:clamp(44px,14vw,66px);font-size:13px}`;
    document.head.appendChild(s);
  }
  const box = (id) => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; document.body.appendChild(e); } return e; };

  // =====================================================================
  // 部屋と招待
  // =====================================================================
  let LB = null, RUN = null, invT = null; // LB＝部屋 { g, rid, lead, leader, mem:[{id,name}], team }
  const memIds = () => (LB ? LB.mem.map((x) => x.id).filter((id) => id !== ENV.me()) : []);
  PT.current = () => (RUN ? RUN.g : null); // 2.68.0 いま遊んでいる遊び（囃子合わせの間は BGM を止める）
  PT.openLobby = (g) => {
    if (!ENV || RUN) return; addCss();
    LB = { g, rid: ENV.me() + '-' + Date.now(), lead: true, leader: ENV.me(), mem: [{ id: ENV.me(), name: ENV.name(), ch: myCh() }], team: false, mode: 'big', o: GAMES[g].opts ? defOpts() : null };
    drawLobby();
  };
  const chGet = () => { try { return JSON.parse(localStorage.getItem('sgk-hide-ch') || '{}'); } catch (e) { return {}; } };
  const myCh = () => { if (!SGK.HIDE) return null; const c = chGet(), H = SGK.HIDE.CH; return { h: H.h.some((x) => x.k === c.h) ? c.h : H.h[0].k, s: H.s.some((x) => x.k === c.s) ? c.s : H.s[0].k }; };
  const chName = (r, k) => { const x = SGK.HIDE.CH[r].find((y) => y.k === k) || SGK.HIDE.CH[r][0]; return x.n; };
  const defOpts = () => { const o = {}; for (const op of SGK.HIDE.OPTS) o[op.k] = op.v[0][0]; return o; };
  const optTxt = (o) => SGK.HIDE.OPTS.map((op) => `${op.n}：${(op.v.find((x) => x[0] === o[op.k]) || op.v[0])[1]}`).join('　');
  function closeLobby(tell) { if (LB && tell && !LB.lead) send([LB.leader], { k: 'leave', rid: LB.rid }); if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: [], closed: 1 }); LB = null; const b = document.getElementById('ptBox'); if (b) b.remove(); }
  function pushMem() { if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: LB.mem, team: LB.team, mode: LB.mode, o: LB.o }); }
  function vwGet() { let v = 'tp'; try { v = localStorage.getItem('sgk-hide-vw') || 'tp'; } catch (er) {} return v === 'fp' ? v : 'tp'; }
  // 2.98.0 かくれんぼの操作設定（部屋の「操作設定」）。変えたい項目を選んでキー／ボタンを押す
  function keysHtml() {
    const H = SGK.HIDE, c = H.keys(), sel = LB.kc.sel;
    const row = (id, n, v) => `<button data-a="ks:${id}" style="${sel === id ? 'background:#a0702e;' : ''}">${n}：<b>${sel === id ? '押してください…（Escで取り消し）' : v}</b></button>`;
    return `<div><h2>操作設定（かくれんぼ？）</h2><div class="d">変えたい項目を選んでから、キーボードのキー／コントローラーのボタンを押すと決まります（コントローラーはPS配置：×○□△）。移動のスティック・十字キーと、視点のスティックは変えられません</div><div style="max-height:56vh;overflow:auto"><b>キーボード</b>${H.KA.map(([k, n]) => row('k:' + k, n, c.kb[k].map(H.kn).join('・') || '未設定')).join('')}<b>コントローラー</b>${H.KP.map(([k, n]) => row('p:' + k, n, c.pd[k].map(H.pn).join('・') || '未設定')).join('')}</div><div><button data-a="kr">初期設定に戻す</button><button data-a="kx">閉じる</button></div></div>`;
  }
  let capK = false, capT = 0, capPrev = [];
  function capOn() {
    if (!capK) { capK = true; addEventListener('keydown', (e) => { if (!LB || !LB.kc || !LB.kc.sel || !LB.kc.sel.startsWith('k:')) return; e.preventDefault(); e.stopPropagation(); if (e.key !== 'Escape') SGK.HIDE.setKey(LB.kc.sel.slice(2), e.key); LB.kc.sel = null; drawLobby(); }, true); }
    clearInterval(capT); capPrev = []; // コントローラーのボタンを待つ
    capT = setInterval(() => {
      if (!LB || !LB.kc) { clearInterval(capT); return; } const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((g) => g && g.connected); if (!gp) return;
      const sel = LB.kc.sel; gp.buttons.forEach((b, i) => { const on = !!b.pressed; if (on && !capPrev[i] && sel && sel.startsWith('p:')) { SGK.HIDE.setPad(sel.slice(2), i); LB.kc.sel = null; drawLobby(); } capPrev[i] = on; });
    }, 60);
  }
  function pickHtml() { // 2.73.0 キャラ一覧（見た目・パッシブ・アクティブを見比べる）
    SGK.HIDE.onPreview = () => { if (LB && LB.pk) drawLobby(); }; // 2.101.10 3Dモデルを読み終わったら絵を描き直す
    const r = LB.pk, L = SGK.HIDE.CH[r], cur = myCh()[r];
    return `<div><h2>${r === 'h' ? '逃げる時のキャラ' : '鬼の時のキャラ'}</h2><div class="d">選ぶと決まります</div><div style="max-height:62vh;overflow:auto">${L.map((x) => { const im = SGK.HIDE.preview(r, x.k); return `<button data-a="pk:${x.k}" style="display:flex;gap:8px;align-items:center;${x.k === cur ? 'background:#a0702e;' : ''}">${im ? `<img src="${im}" width="60" height="75" style="flex:none">` : ''}<span><b>${x.n}</b>${x.k === cur ? '（いま選んでいる）' : ''}<br><span style="font-size:12px;color:#cdbf9a">パッシブ：${x.pa}<br>スキル：${x.ac}（${x.cd}秒）</span></span></button>`; }).join('')}</div><div><button data-a="pkx">もどる</button></div></div>`;
  }
  function secHtml() { // 2.99.0 部屋の設定を種類ごとに分ける（自分の設定／遊び方／人数・CPU）
    const s = LB.sec, ov = (op) => (op.v.find((x) => x[0] === LB.o[op.k]) || op.v[0])[1];
    const opB = (ks) => SGK.HIDE.OPTS.filter((op) => ks.includes(op.k)).map((op) => `<button data-a="o:${op.k}">${op.n}：${ov(op)}（変える）</button>`).join('');
    let t = '', body = '';
    if (s === 'me') { t = '自分の設定'; body = `<button data-a="ch:h">逃げる時のキャラを選ぶ</button><button data-a="ch:s">鬼の時のキャラを選ぶ</button><button data-a="kc">操作設定（キー・ボタン）</button><button data-a="vw">視点：${({ tp: '三人称（うしろから）', fp: '一人称' })[vwGet()]}（変える）</button>`; }
    else if (s === 'rule' && LB.lead && LB.o) { t = '遊び方の設定'; body = opB(['st', 'sz', 'tm', 'ht', 'mv', 'cau']); }
    else if (s === 'ppl' && LB.lead && LB.o) { t = '人数・CPUの設定'; body = opB(['on', 'hn', 'cpS', 'cpH']) + '<div class="d">人が足りない分はCPUが加わります（CPUありのとき）</div>'; }
    else { LB.sec = null; return ''; }
    return `<div><h2>${t}</h2><div>${body}</div><div style="margin-top:8px"><button data-a="secx">もどる</button></div></div>`;
  }
  const raceParts = [
    ['馬', [
      ['風切（栗毛）', 5, 2, 3, 2, ['#945f3d', '#795138']],
      ['小春（芦毛）', 3, 5, 5, 2, ['#c2c0b5', '#8b9189']],
      ['黒鉄（黒鹿毛）', 5, 3, 2, 5, ['#524139', '#352d2a']],
    ]],
    ['鞍', [['並鞍', 0, 0, 0, 0], ['軽鞍', 0, 1, 1, -1], ['厚鞍', 1, 0, -1, 2]]],
    ['鐙', [['並鐙', 0, 0, 0, 0], ['短鐙', -1, 2, 0, 0], ['深鐙', 0, -1, 1, 1]]],
    ['手綱', [['並手綱', 0, 0, 0, 0], ['短手綱', -1, 0, 2, 0], ['長手綱', 2, 0, -1, 0]]],
    ['頭絡', [['並頭絡', 0, 0, 0, 0], ['軽頭絡', 0, 1, 0, -1], ['厚頭絡', 0, -1, 0, 2]]],
  ];
  const raceLoadout = (raw) => raceParts.map(([, options], i) => (
    Number.isInteger(raw?.[i]) && options[raw[i]] ? raw[i] : 0
  ));
  function raceStats(loadout) {
    return [1, 2, 3, 4].map((stat) => clamp(raceParts.reduce(
      (total, [, options], i) => total + options[loadout[i]][stat], 0), 1, 9));
  }
  let raceSelection;
  function myRaceLoadout() {
    if (raceSelection) return raceSelection;
    try { raceSelection = raceLoadout(JSON.parse(localStorage.getItem('sgk-race-tack'))); }
    catch (error) { raceSelection = raceLoadout(null); }
    return raceSelection;
  }
  const raceStatNames = ['最高速', '加速', '曲がりやすさ', '重さ'];
  function raceTackHtml() {
    const selected = myRaceLoadout(), stats = raceStats(selected);
    const buttons = raceParts.map(([slot, options], i) =>
      '<button data-a="race-part:' + i + '">' + slot + '　' + options[selected[i]][0] + '</button>');
    return '<div class="d">' + buttons.join('') + '<div>現在の能力　' +
      raceStatNames.map((name, i) => name + ' ' + stats[i]).join('　') + '</div></div>';
  }
  function raceChoicesHtml(slot) {
    const [label, options] = raceParts[slot], selected = myRaceLoadout();
    const equipped = selected[slot], current = raceStats(selected);
    const cards = options.map(([name], index) => {
      const proposed = selected.slice();
      proposed[slot] = index;
      const active = equipped === index;
      const stats = raceStats(proposed).map((value, i) => {
        const delta = value - current[i];
        const change = delta > 0 ? '<strong class="race-rise">↑ +' + delta + '</strong>' :
          delta < 0 ? '<strong class="race-fall">↓ −' + Math.abs(delta) + '</strong>' : '';
        const values = delta ? current[i] + ' → ' + value : String(value);
        return '<span>' + raceStatNames[i] + ' ' + values + change + '</span>';
      }).join('');
      return '<button class="race-option" data-a="race-equip:' + index + '"' +
        (active ? ' aria-current="true"' : '') + '><img alt="" src="assets/race/tack-' + slot + '-' + index +
        (slot === 0 ? '.jpg' : '.png') + '"><span class="race-option-text"><b>' + name + '</b>' +
        (active ? '<span class="race-equipped">選択中</span>' : '') +
        '<span class="race-stats">' + stats + '</span></span></button>';
    }).join('');
    return '<div class="race-choices"><h2>' + label + 'を選ぶ</h2><div class="d">現在の構成から替えたときの能力（各9段階）</div>' +
      cards + '<button data-a="race-back">戻る</button></div>';
  }
  function drawLobby(focusAction) {
    if (!LB) return; const d = GAMES[LB.g], e = box('ptBox'), n = LB.mem.length;
    if (LB.sec && (!d.opts || (LB.sec !== 'me' && !(LB.lead && LB.o)))) LB.sec = null;
    const list = LB.mem.map((x, i) => `<div class="m">${LB.team ? `<b style="color:${TEAM[i % 2].c}">${TEAM[i % 2].n}</b> ` : ''}${esc(x.name)}${x.id === LB.leader ? '（リーダー）' : ''}${d.opts && x.vol ? '<span style="font-size:12px;color:#ffb0a0">　【鬼に立候補】</span>' : ''}${d.opts && x.ch ? `<span style="font-size:12px;color:#cdbf9a">　逃げ：${chName('h', x.ch.h)}／鬼：${chName('s', x.ch.s)}</span>` : ''}</div>`).join('');
    e.innerHTML = LB.raceSlot != null ? raceChoicesHtml(LB.raceSlot) : LB.kc ? keysHtml() : LB.pk ? pickHtml() : LB.sec ? secHtml() : `<div><h2>${d.name}</h2><div><button data-a="desc">ゲーム説明${LB.desc ? '（閉じる）' : ''}</button></div>${LB.desc ? `<div class="d">${esc(d.desc)}</div>` : ''}<div>参加者 ${n}/${d.max}人${LB.team ? '（チーム戦：交互に赤・白）' : ''}${d.opts && LB.o ? `<div style="font-size:13px;color:#cdbf9a">${optTxt(LB.o)}</div>` : ''}${d.mode ? `　勝ち方：${LB.mode === 'big' ? '大物（いちばん大きい魚）' : '数（釣った数）'}` : ''}</div>${list}${LB.g === 'race' ? raceTackHtml() : ''}
      ${d.opts ? (() => { const c = myCh(), H = SGK.HIDE.CH, a = H.h.find((x) => x.k === c.h), b = H.s.find((x) => x.k === c.s); return `<div style="margin-top:6px;font-size:12px;color:#cdbf9a"><b>逃げる時：${a.n}</b>　${a.pa}／${a.ac}<br><b>鬼の時：${b.n}</b>　${b.pa}／${b.ac}</div><div><button data-a="vol">${(LB.mem.find((y) => y.id === ENV.me()) || {}).vol ? '鬼に立候補をやめる' : '鬼に立候補する'}</button><button data-a="sec:me">自分の設定（キャラ・操作・視点）</button>${LB.lead && LB.o ? '<button data-a="sec:rule">遊び方の設定（勝ち方・舞台など）</button><button data-a="sec:ppl">人数・CPUの設定</button>' : ''}</div>`; })() : ''}
      <div style="margin-top:8px">${LB.lead ? `<button data-a="inv">同じ町の人を誘う</button>${d.team ? `<button data-a="team">${LB.team ? '個人戦にする' : 'チーム戦にする'}</button>` : ''}${d.mode ? '<button data-a="mode">勝ち方を変える</button>' : ''}${n >= 2 ? '<button data-a="go">出発する</button>' : ''}<button data-a="solo">ひとりで練習（報酬なし）</button>` : '<div class="d">リーダーが出発すると始まります</div>'}<button data-a="close">${LB.lead ? 'やめる' : '抜ける'}</button></div></div>`;
    const focus = focusAction && e.querySelector('button[data-a="' + focusAction + '"]');
    if (focus) focus.focus({ preventScroll: true });
    try { if (typeof setFocus === 'function') setFocus(e, focus || currentFocus(e)); } catch (er) {} // 2.69.2 作り直してもコントローラーの選択を保つ
    e.onclick = (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || !LB) return; const a = b.dataset.a;
      if (a === 'inv') { const to = ENV.others().map((x) => x.id); send(to, { k: 'inv', g: LB.g, rid: LB.rid, nm: ENV.name(), team: LB.team, mode: LB.mode, o: LB.o }); b.textContent = to.length ? `${to.length}人に声をかけた` : '同じ町にほかの人がいません'; }
      else if (a === 'team') { LB.team = !LB.team; pushMem(); drawLobby(); }
      else if (a === 'mode') { LB.mode = LB.mode === 'big' ? 'num' : 'big'; pushMem(); drawLobby(); }
      else if (a.startsWith('o:') && LB.lead && LB.o) { const op = SGK.HIDE.OPTS.find((x) => x.k === a.slice(2)); if (op) { const i = op.v.findIndex((x) => x[0] === LB.o[op.k]); LB.o[op.k] = op.v[(i + 1) % op.v.length][0]; pushMem(); drawLobby(); } }
      else if (a === 'ch:h' || a === 'ch:s') { LB.pk = a.slice(3); drawLobby(); }
      else if (a === 'kc') { LB.kc = { sel: null }; capOn(); drawLobby(); }
      else if (a === 'kx') { LB.kc = null; drawLobby(); }
      else if (a === 'kr') { SGK.HIDE.resetKeys(); if (LB.kc) LB.kc.sel = null; drawLobby(); }
      else if (a.startsWith('ks:')) { if (LB.kc) LB.kc.sel = a.slice(3); drawLobby(); }
      else if (a === 'vw') { try { localStorage.setItem('sgk-hide-vw', vwGet() === 'tp' ? 'fp' : 'tp'); } catch (er) {} drawLobby(); }
      else if (a.startsWith('race-part:') && LB.g === 'race') {
        LB.raceSlot = Number(a.split(':')[1]);
        drawLobby('race-equip:' + myRaceLoadout()[LB.raceSlot]);
      }
      else if (LB.raceSlot != null && (a === 'race-back' || a.startsWith('race-equip:'))) {
        const slot = LB.raceSlot;
        if (a !== 'race-back') {
          const selected = myRaceLoadout();
          selected[slot] = Number(a.split(':')[1]);
          try { localStorage.setItem('sgk-race-tack', JSON.stringify(selected)); } catch (error) {}
        }
        LB.raceSlot = null;
        drawLobby('race-part:' + slot);
      }
      else if (a === 'desc') { LB.desc = !LB.desc; drawLobby(); }
      else if (a === 'pkx') { LB.pk = null; drawLobby(); }
      else if (a.startsWith('sec:')) { LB.sec = a.slice(4); drawLobby(); }
      else if (a === 'secx') { LB.sec = null; drawLobby(); }
      else if (a.startsWith('pk:') && LB.pk) { const r = LB.pk, c = myCh(); c[r] = a.slice(3); LB.pk = null; try { localStorage.setItem('sgk-hide-ch', JSON.stringify(c)); } catch (er) {} const x = LB.mem.find((y) => y.id === ENV.me()); if (x) x.ch = c; if (LB.lead) pushMem(); else send([LB.leader], { k: 'pick', rid: LB.rid, cs: c }); drawLobby(); }
      else if (a === 'vol') { const x = LB.mem.find((y) => y.id === ENV.me()); if (x) { x.vol = !x.vol; if (LB.lead) pushMem(); else send([LB.leader], { k: 'pick', rid: LB.rid, vol: x.vol }); drawLobby(); } }
      else if (a === 'go') startRoom(false);
      else if (a === 'solo') startRoom(true);
      else closeLobby(true);
    };
  }
  function startRoom(solo) {
    if (LB.g === 'fish') { // 2.105.3 釣り大会は部屋で遊ばず、ゲームの時間で1日のあいだ各自が地図で釣った魚を数える（集計は sim/party.js の fishTaikai）
      const mem = solo ? [LB.mem[0]] : LB.mem; ENV.cmd({ type: 'fishTaikai', ids: mem.map((x) => x.id), team: !solo && LB.team, mode: LB.mode });
      if (!solo) send(memIds(), { k: 'go', rid: LB.rid, cfg: { g: 'fish' } }); closeLobby(false); fishToast(); return;
    }
    const seed = (Math.random() * 1e9) | 0, mem = (solo ? [LB.mem[0]] : LB.mem).map((x, i) => ({ id: x.id, name: x.name, tm: i % 2, ch: x.ch || null, vol: !!x.vol }));
    const cfg = { g: LB.g, seed, mem, team: !solo && LB.team, lead: LB.leader, solo, mode: LB.mode, o: LB.o, rid: LB.rid };
    if (!solo) send(memIds(), { k: 'go', rid: LB.rid, cfg });
    closeLobby(false); startGame(cfg);
  }
  function showInvite(from, m) {
    if (RUN || !GAMES[m.g]) return; addCss(); const e = box('ptInv'); clearTimeout(invT);
    e.innerHTML = `<b>${esc(m.nm)}</b>が『${GAMES[m.g].name}』${m.team ? '（チーム戦）' : ''}の仲間を募っています <button data-a="y">参加する</button><button data-a="n">閉じる</button>`;
    e.onclick = (ev) => { const b = ev.target.closest('button[data-a]'); if (!b) return; e.remove(); if (b.dataset.a !== 'y') return; if (LB) closeLobby(true); LB = { g: m.g, rid: m.rid, lead: false, leader: from, mem: [], team: !!m.team, mode: m.mode || 'big', o: m.o || null }; const jn = () => send([from], { k: 'join', rid: m.rid, nm: ENV.name(), cs: myCh() }); jn(); drawLobby(); let tr = 0; const jt = setInterval(() => { /* 2.98.6 リーダーの名簿に入れたか確かめ、届いていなければ「参加する」を送り直す */ if (!LB || LB.lead || LB.rid !== m.rid || LB.mem.length || ++tr > 6) { clearInterval(jt); return; } jn(); }, 1500); };
    invT = setTimeout(() => { if (e.parentNode) e.remove(); }, 60000);
  }

  PT.recv = (from, m) => {
    if (!ENV || !m) return;
    if (m.k === 'inv') return showInvite(from, m);
    if (m.k === 'join') { if (LB && LB.lead && m.rid === LB.rid) { if (!LB.mem.some((x) => x.id === from) && LB.mem.length < GAMES[LB.g].max) { LB.mem.push({ id: from, name: m.nm, ch: m.cs || null }); drawLobby(); } if (LB.mem.some((x) => x.id === from)) pushMem(); /* 2.98.6 もう入っている人からの「参加する」でも名簿を送り直す */ } return; }
    if (m.k === 'pick') { if (LB && LB.lead && m.rid === LB.rid) { const x = LB.mem.find((y) => y.id === from); if (x) { if (m.cs) x.ch = m.cs; if (m.vol != null) x.vol = !!m.vol; pushMem(); drawLobby(); } } return; }
    if (m.k === 'leave') { if (LB && LB.lead && m.rid === LB.rid) { LB.mem = LB.mem.filter((x) => x.id !== from); pushMem(); drawLobby(); } return; }
    if (m.k === 'mem') { if (LB && !LB.lead && m.rid === LB.rid) { if (m.closed) { closeLobby(false); ENV.toast && ENV.toast('部屋がなくなりました'); } else { LB.mem = m.mem; LB.team = !!m.team; LB.mode = m.mode || 'big'; if (m.o) LB.o = m.o; drawLobby(); } } return; }
    if (m.k === 'go') { if (LB && !LB.lead && m.rid === LB.rid && !RUN) { closeLobby(false); if (m.cfg && m.cfg.g === 'fish') fishToast(); else startGame(m.cfg); } return; }
    if (RUN && RUN.on) RUN.on(from, m);
  };

  // =====================================================================
  // 実行の枠（canvas・入力・終わりの表示）
  // =====================================================================
  const IN = { l: 0, r: 0, u: 0, d: 0, a: 0, b: 0, c: 0, cT: 0, aT: 0, lT: 0, rT: 0, mx: null, my: null, click: 0 };
  let keysBound = false;
  function bindKeys() {
    if (keysBound) return; keysBound = true;
    const map = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd', ' ': 'a', e: 'c', E: 'c', q: 'c', Q: 'c', z: 'a', Z: 'a', Enter: 'a', x: 'b', X: 'b', Shift: 'b', f: 'a', F: 'a', j: 'b', J: 'b' };
    addEventListener('blur', () => {
      if (RUN && RUN.g === 'race') for (const key of ['l', 'r', 'u', 'd', 'a', 'b', 'c', 'aT', 'cT']) IN[key] = 0;
    });
    addEventListener('keydown', (e) => { if (!RUN) return; const k = (RUN.g === 'hide' ? SGK.HIDE.keyMap() : map)[e.key]; if (!k) return; e.preventDefault(); if (!IN[k] && !e.repeat) { if (k === 'a') { IN.aT = 1; IN.aAt = performance.now(); } if (k === 'b') { IN.bT = 1; IN.bAt = performance.now(); } if (k === 'c') IN.cT = 1; if (k === 'l') IN.lT = 1; if (k === 'r') IN.rT = 1; } IN[k] = 1; });
    addEventListener('keyup', (e) => { if (!RUN) return; const k = (RUN.g === 'hide' ? SGK.HIDE.keyMap() : map)[e.key]; if (k) { e.preventDefault(); IN[k] = 0; } });
  }
  let padC = false, padA = false, padB = false, padL = false, padR = false;
  function readPad() {
    const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((g) => g && g.connected); if (!gp) { padA = padB = padC = padL = padR = IN.pa = IN.pb = IN.pu = false; return { x: 0, y: 0 }; }
    const x = Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, y = Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0, hk = RUN && RUN.g === 'hide' ? SGK.HIDE.keys().pd : null, pr = (ls) => ls.some((i) => gp.buttons[i] && gp.buttons[i].pressed), a = hk ? pr(hk.pa) : !!(gp.buttons[0] && gp.buttons[0].pressed), b = hk ? pr(hk.pb) : !!(gp.buttons[2] && gp.buttons[2].pressed || gp.buttons[1] && gp.buttons[1].pressed);
    const l = x < -0.5 || !!(gp.buttons[14] && gp.buttons[14].pressed), r = x > 0.5 || !!(gp.buttons[15] && gp.buttons[15].pressed);
    if (a && !padA) IN.aT = 1; if (b && !padB) IN.bT = 1; padB = b; if (l && !padL) IN.lT = 1; if (r && !padR) IN.rT = 1; { const cc = hk ? pr(hk.pc) : !!(gp.buttons[3] && gp.buttons[3].pressed); if (cc && !padC) IN.cT = 1; padC = cc; } padA = a; padL = l; padR = r; IN.pa = a; IN.pb = b; IN.pu = y < -0.5 || !!(gp.buttons[12] && gp.buttons[12].pressed);
    return { x, y };
  }
  function backToRoom(cfg, gone) { // 2.99.5 遊びが終わったら町の窓を開け直し、その遊びの部屋（最初の画面）へ戻る
    try { if (typeof openTown === 'function') openTown(true); } catch (er) {}
    if (!ENV || LB || !GAMES[cfg.g]) return; const me = ENV.me();
    const base = { g: cfg.g, team: !!cfg.team, mode: cfg.mode || 'big', o: cfg.o || (GAMES[cfg.g].opts ? defOpts() : null) };
    if (cfg.solo || !cfg.rid) { LB = Object.assign(base, { rid: me + '-' + Date.now(), lead: true, leader: me, mem: [{ id: me, name: ENV.name(), ch: myCh() }] }); }
    else if (cfg.lead === me) { // リーダー：同じ部屋をそのまま開き直す（途中で抜けた人は外す）。戻ってきた人は「参加する」を送り直してくる
      LB = Object.assign(base, { rid: cfg.rid, lead: true, leader: me, mem: cfg.mem.filter((x) => x.id === me || !(gone && gone[x.id])).map((x) => ({ id: x.id, name: x.name, ch: x.id === me ? myCh() : x.ch || null, vol: !!x.vol })) });
      pushMem();
    } else { // 参加していた人：同じ部屋に戻り、リーダーへ「参加する」を送る
      LB = Object.assign(base, { rid: cfg.rid, lead: false, leader: cfg.lead, mem: [] });
      const jn = () => send([cfg.lead], { k: 'join', rid: cfg.rid, nm: ENV.name(), cs: myCh() }); jn();
      let tr = 0; const jt = setInterval(() => { /* リーダーがまだ遊びの中かもしれないので、名簿が届くまで送り直す（最大1分） */ if (!LB || LB.lead || LB.rid !== cfg.rid || LB.mem.some((x) => x.id === me) || ++tr > 40) { clearInterval(jt); return; } jn(); }, 1500);
    }
    addCss(); drawLobby();
  }
  function fishToast() { try { const tw = document.getElementById('town'); if (tw && !tw.classList.contains('hidden') && typeof openTown === 'function') openTown(false); } catch (er) {} if (ENV.toast) ENV.toast('釣り大会が始まりました。1日のあいだ、川・湖・海で釣りをしましょう'); }
  function startGame(cfg) {
    try { const tw = document.getElementById('town'); if (tw && !tw.classList.contains('hidden') && typeof openTown === 'function') openTown(false); } catch (er) {} // 2.69.4 遊びを始める時に町の窓を閉じる
    if (RUN || !GAMES[cfg.g]) return; addCss(); bindKeys();
    const root = box('ptGame'); root.innerHTML = '<canvas></canvas><div class="tb"><button data-a="quit">やめる</button></div><div class="pad pl"></div><div class="pad pr"></div>';
    const cv = root.querySelector('canvas'), g2 = cv.getContext('2d'), me = ENV.me();
    const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); const onR = () => fit(); addEventListener('resize', onR);
    // 画面の操作ボタン（タッチのときだけ）
    const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), hold = (el, k) => { const on = (e) => { e.preventDefault(); if (!IN[k]) { if (k === 'a') { IN.aT = 1; IN.aAt = performance.now(); } if (k === 'b') { IN.bT = 1; IN.bAt = performance.now(); } if (k === 'c') IN.cT = 1; if (k === 'l') IN.lT = 1; if (k === 'r') IN.rT = 1; } IN[k] = 1; }, off = (e) => { e.preventDefault(); IN[k] = 0; }; el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off); };
    const mkBtn = (host, txt, k) => { const b = document.createElement('button'); b.textContent = txt; host.appendChild(b); hold(b, k); };
    const pl = root.querySelector('.pl'), pr = root.querySelector('.pr');
    for (const pad of [pl, pr]) {
      pad.addEventListener('contextmenu', (e) => e.preventDefault());
      pad.addEventListener('selectstart', (e) => e.preventDefault());
      // 長押し時のブラウザー操作を抑止し、ゲーム入力は Pointer Events で受け取る。
      pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    }
    if (touch) { pl.style.display = pr.style.display = 'flex'; pl.style.left = '14px'; pr.style.right = '14px'; if (cfg.g === 'cart') { mkBtn(pl, '←', 'l'); mkBtn(pl, '→', 'r'); mkBtn(pr, '使う', 'b'); mkBtn(pr, '引く', 'a'); } else if (cfg.g === 'race') { root.classList.add('race'); mkBtn(pl, '←', 'l'); mkBtn(pl, '→', 'r'); mkBtn(pr, '走る', 'b'); mkBtn(pr, '跳ぶ', 'a'); mkBtn(pr, '道具', 'c'); } else if (cfg.g === 'hide') { mkBtn(pl, '戻る', 'b'); mkBtn(pl, 'スキル', 'c'); mkBtn(pr, '化ける\n叩く', 'a'); } else if (cfg.g === 'kemari') { mkBtn(pl, 'ゆるく', 'b'); mkBtn(pr, '速く', 'a'); } else if (cfg.g === 'hayashi') { /* 2.68.2 囃子合わせは自分でボタンを置く */ } else mkBtn(pr, '射つ', 'a'); } // 2.106.11 蹴鞠のスマホボタン：速く／ゆるく（2.106.20 コメントが後ろの処理を巻き込んでいたのを直した）
    const ptr = (e) => { const r = cv.getBoundingClientRect(); IN.mx = (e.clientX - r.left) * cv.width / r.width; IN.my = (e.clientY - r.top) * cv.height / r.height; };
    cv.addEventListener('pointermove', ptr); cv.addEventListener('pointerdown', (e) => { ptr(e); if (cfg.g === 'archery' || cfg.g === 'cart') IN.click = 1; else if (cfg.g === 'kemari') { if (e.button === 2) IN.bT = 1; else IN.aT = 1; } }); // 2.106.11 蹴鞠：左クリック＝速く返す、右クリック＝ゆるく返す
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    const env = { cfg, me, ids: cfg.mem.map((x) => x.id), names: Object.fromEntries(cfg.mem.map((x) => [x.id, x.name])), tm: Object.fromEntries(cfg.mem.map((x) => [x.id, x.tm])), others: cfg.mem.map((x) => x.id).filter((id) => id !== me), cv, g2, finished: false, gone: {}, IN, send, pal: PAL, text: drawText };
    const game = { race: raceGame, archery: archeryGame, cart: cartGame, kemari: kemariGame, hayashi: hayashiGame, hide: (e) => SGK.HIDE.make(e) }[cfg.g](env);
    let raf = 0, last = performance.now(); const stop = () => { cancelAnimationFrame(raf); removeEventListener('resize', onR); try { if (game.dispose) game.dispose(); } catch (er) {} root.remove(); RUN = null; for (const k of ['l', 'r', 'u', 'd', 'a', 'b', 'c']) IN[k] = 0; backToRoom(cfg, env.gone); };
    RUN = { g: cfg.g, on: (from, m) => { if (cfg.g === 'race' && m.seed !== cfg.seed) return; if (m.k === 'quit') { env.gone[from] = 1; } if (game.msg) game.msg(from, m); } };
    env.end = (res) => { if (env.finished) return; env.finished = true; showResult(env, res, () => stop()); };
    if (cfg.g === 'race') {
      cv.classList.add('race-hud');
      if (!touch) root.classList.add('race-keys');
    }
    root.querySelector('button[data-a="quit"]').onclick = () => { send(env.others, { k: 'quit', seed: cfg.seed }); stop(); };
    const loop = (t) => {
      raf = requestAnimationFrame(loop); const dt = clamp((t - last) / 1000, 0, 0.05); last = t;
      const pd = readPad(); env.pad = pd; IN.dash = IN.b || IN.u || IN.r || IN.pb || IN.pu;
      try { if (!env.finished) game.update(dt); game.draw(); } catch (e) { console.error(e); stop(); return; }
      IN.aT = IN.bT = IN.cT = IN.lT = IN.rT = IN.click = 0;
    };
    raf = requestAnimationFrame(loop);
  }
  function showResult(env, res, close) { // res＝{ title, rows:[html], cmd }
    const e = box('ptRes'); e.innerHTML = `<div><h2>${esc(res.title)}</h2>${res.rows.map((r) => `<div class="r">${r}</div>`).join('')}<div style="margin-top:8px"><button data-a="ok">閉じる</button></div></div>`;
    if (res.cmd && !env.cfg.solo) ENV.cmd(res.cmd);
    const button = e.querySelector('button');
    button.onclick = () => { e.remove(); close(); };
    setFocus(e, button);
  }
  const nameOf = (env, id) => env.names[id] || '？';
  const tcol = (env, id) => (env.cfg.team ? TEAM[env.tm[id]].c : PAL[env.ids.indexOf(id) % PAL.length]);
  function drawText(g, s, x, y, o) { o = o || {}; g.font = (o.b ? 'bold ' : '') + (o.sz || 16) + 'px sans-serif'; g.textAlign = o.al || 'left'; g.fillStyle = o.c || '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(s, x, y); g.fillText(s, x, y); }

  // ---- 馬・人の絵（仮） ----
  function drawHorse(g, x, y, sc, col, ph, air, coat) {
    g.save();
    g.translate(x, y);
    g.scale(sc, sc);
    g.lineCap = 'round';
    for (const [side, phase] of [[-1, 0], [1, Math.PI]]) {
      const stride = Math.cos(ph + phase);
      const toe = air ? -10 : -Math.max(0, stride) * 9;
      g.strokeStyle = '#503326';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(side * 8, -25);
      g.lineTo(side * 11, -13 + stride * 4);
      g.lineTo(side * 10, toe);
      g.stroke();
      g.strokeStyle = '#302923';
      g.beginPath();
      g.moveTo(side * 11, toe - 1);
      g.lineTo(side * 9, toe - 1);
      g.stroke();
    }
    const bob = air ? 0 : Math.sin(ph * 2) * 1.5;
    g.translate(0, bob);
    const oval = (xx, yy, rx, ry, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(xx, yy, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    };
    oval(0, -34, 11, 15, coat[1]);
    oval(0, -25, 16, 13, coat[0]);
    oval(0, -28, 13, 5, '#d1a269');
    g.strokeStyle = '#392b22';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, -28);
    g.quadraticCurveTo(3, -17, Math.sin(ph) * 6, -10);
    g.stroke();
    oval(0, -42, 10, 11, col);
    g.fillStyle = '#4d3929';
    g.fillRect(-8, -58, 16, 4);
    oval(0, -57, 5.8, 5, '#5b4834');
    g.restore();
  }
  function drawMan(g, x, y, sc, col, ph, pull) {
    g.save(); g.translate(x, y); g.scale(sc, sc); g.strokeStyle = '#222'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -22); g.lineTo(Math.sin(ph) * 6, 0); g.moveTo(0, -22); g.lineTo(-Math.sin(ph) * 6, 0); g.stroke();
    g.fillStyle = col; g.fillRect(-6, -42, 12, 20); g.fillStyle = '#e8c9a0'; g.beginPath(); g.arc(0, -48, 6, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.beginPath(); g.moveTo(0, -38); g.lineTo(pull ? -14 : -6, pull ? -34 : -26); g.stroke(); g.restore();
  }
  const bar = (g, x, y, w, h, v, c) => { g.fillStyle = '#0008'; g.fillRect(x, y, w, h); g.fillStyle = c; g.fillRect(x, y, w * clamp(v, 0, 1), h); g.strokeStyle = '#fff8'; g.lineWidth = 1; g.strokeRect(x, y, w, h); };

  // =====================================================================
  // 馬の障害レース
  // =====================================================================
  function raceGame(env) {
    const { cfg, me, g2: g, cv, ids, send, others } = env;
    const host = cfg.lead === me, rng = mulberry(cfg.seed), lap = 480, laps = 3, goal = lap * laps;
    const racers = ids.map((id, i) => ({ id, name: nameOf(env, id), color: tcol(env, id), team: env.tm[id] }));
    if (cfg.solo) {
      ['小春', '黒鉄', '風切', '小春', '黒鉄'].forEach((name, i) => {
        racers.push({ id: null, name: name + '（CPU）', color: PAL[i + 1], cpu: i + 1 });
      });
    }
    const mine = racers.find((r) => r.id === me), loadout = myRaceLoadout().slice();
    function setLoadout(r, selected) {
      r.loadout = selected;
      [r.speed, r.accel, r.turn, r.weight] = raceStats(selected);
    }
    for (const [i, r] of racers.entries()) Object.assign(r, {
      d: -Math.floor(i / 3) * 3, x: [0, -0.59, 0.59][i % 3], v: 0, y: 0, vy: 0, fin: null,
      item: '', boost: 0, slow: 0, shield: 0, reserve: 1, steer: 0, dash: false,
      jump: false, use: false, seen: -3, out: false, row: -1,
    });
    for (const r of racers) setLoadout(r, r === mine ? loadout : raceLoadout([r.cpu ? r.cpu % 3 : 0]));
    const course = [
      [28, 'box', [-0.59, 0, 0.59]], [57, 'fence', [-0.59, 0]],
      [83, 'pad', [0.59]], [110, 'mud', [0, 0.59]], [135, 'box', [-0.59, 0, 0.59]],
      [162, 'fence', [-0.59, 0, 0.59]], [188, 'pad', [-0.59]], [215, 'mud', [-0.59, 0]],
      [242, 'box', [-0.59, 0, 0.59]], [269, 'fence', [0, 0.59]], [297, 'pad', [0]],
      [326, 'mud', [-0.59, 0.59]], [354, 'box', [-0.59, 0, 0.59]],
      [384, 'fence', [-0.59, 0, 0.59]], [413, 'pad', [0.59]], [445, 'mud', [-0.59, 0]],
    ];
    const features = [];
    for (let i = 0; i < laps; i++) {
      for (const [offset, kind, lanes] of course) features.push({ d: i * lap + offset, kind, lanes });
    }
    const world = SGK.RACE3D?.make(cv, lap, course, racers);
    const itemNames = { boost: '早駆け', shield: '守り札', mud: '泥袋' };
    const traps = [];
    let t = -3, heartbeat = performance.now(), clock = 0, first = null, over = false;
    let notice = '', noticeUntil = 0;
    const show = (message) => { notice = message; noticeUntil = t + 1.6; };
    const curve = (d) => Math.sin(d * Math.PI * 2 / lap) + 0.36 * Math.sin(d * Math.PI * 6 / lap);
    const rank = () => racers.slice().sort((a, b) => (
      Number(a.out) - Number(b.out) || (a.fin ?? Infinity) - (b.fin ?? Infinity) || b.d - a.d
    ));

    let heard = { count: 4, airborne: false, item: '', boost: 0, shield: 0, slow: 0, lap: 0, done: false };
    let hoofDelay = 0, stride = 0;
    function raceAudio(dt = 0) {
      const play = (cue) => SGK.AUDIO?.sfx(cue);
      if (t < 0) {
        const count = Math.ceil(-t);
        if (count < heard.count) play('raceCount');
        heard.count = count;
        return;
      }
      if (heard.count > 0) {
        play('raceStart');
        heard.count = 0;
      }
      if (mine.fin != null) {
        if (!heard.done) play('raceGoal');
        heard.done = true;
        return;
      }
      const currentLap = Math.floor(Math.max(0, mine.d) / lap);
      const airborne = mine.y > 0.015;
      if (currentLap > heard.lap) play('raceLap');
      if (airborne !== heard.airborne) {
        play(airborne ? 'raceJump' : 'raceLand');
        hoofDelay = airborne ? 0 : 0.12;
        stride = 0;
      }
      if (mine.slow > 0 && mine.slow > heard.slow + 0.05) play('raceHit');
      if (mine.item && mine.item !== heard.item) play('racePickup');
      if (heard.item === 'mud' && !mine.item) play('raceMud');
      if (mine.boost > 0 && mine.boost > heard.boost + 0.05) play('raceBoost');
      if (mine.shield > 0 && mine.shield > heard.shield + 0.05) play('raceShield');
      if (!airborne && mine.v > 4 && dt > 0) {
        hoofDelay -= dt;
        if (hoofDelay <= 0) {
          play(stride === 2 ? 'raceHoofAccent' : 'raceHoof');
          hoofDelay += [0.078, 0.084, 0.257][stride] * clamp(23 / mine.v, 0.74, 2.1);
          stride = (stride + 1) % 3;
        }
      }
      heard = { count: 0, airborne, item: mine.item, boost: mine.boost, shield: mine.shield, slow: mine.slow, lap: currentLap, done: false };
    }

    function finish(cancelled) {
      if (cancelled) {
        env.end({ title: '競走を中断しました', rows: ['リーダーとの通信が切れました。'] });
        return;
      }
      const order = rank(), n = order.length, place = order.indexOf(mine) + 1;
      const points = [0, 0];
      if (cfg.team) order.forEach((r, i) => { if (!r.out) points[r.team] += n - i; });
      const winner = Math.sign(points[0] - points[1]);
      const team = cfg.team ? (!winner ? 'draw' : (winner > 0 ? 0 : 1) === mine.team ? 'win' : 'lose') : null;
      const rows = cfg.team ? ['<b>赤 ' + points[0] + '点　白 ' + points[1] + '点</b>'] : [];
      order.forEach((r, i) => {
        const result = r.out ? '途中退出' : r.fin == null ? '走り切れず' : r.fin.toFixed(1) + '秒';
        rows.push((i + 1) + '位　<b style="color:' + r.color + '">' + esc(r.name) + '</b>　' + result);
      });
      env.end({
        title: cfg.team ? { win: 'チームの勝ち！', lose: 'チームの負け…', draw: '引き分け' }[team] : place + '位',
        rows, cmd: { type: 'partyResult', game: 'race', n, rank: place, team },
      });
    }

    function hit(r) {
      if (r.shield > 0) {
        r.shield = 0;
        if (r === mine) show('守り札で防いだ！');
      } else {
        r.slow = 1.16 - r.weight * 0.055;
        r.v *= 0.37 + r.weight * 0.035;
        if (r === mine) show('減速！');
      }
    }

    function useItem(r) {
      if (!r.item) return;
      if (r === mine) show(itemNames[r.item] + '！');
      if (r.item === 'boost') r.boost = 2.4;
      if (r.item === 'shield') r.shield = 9;
      if (r.item === 'mud') traps.push({ d: r.d - 2, x: r.x, owner: r, until: t + 12 });
      r.item = '';
    }

    function step(r, dt) {
      if (r.out || r.fin != null) return;
      if (r.id !== me && !r.cpu && t - r.seen > 9) {
        r.out = true;
        return;
      }
      if (r.id !== me && !r.cpu && t - r.seen > 0.6) {
        r.steer = 0;
        r.dash = r.jump = r.use = false;
      }
      const next = features[r.row + 1];
      if (r.cpu) {
        let lane = [-0.59, 0, 0.59][(r.cpu + Math.floor(r.d / 83 + 1)) % 3];
        if (next && next.d - r.d < 26) {
          if ((next.kind === 'pad' && (r.cpu > 2 || r.row % 3 === 0)) || (next.kind === 'box' && !r.item)) {
            lane = next.lanes[r.cpu % next.lanes.length];
          } else if (next.lanes.includes(lane)) {
            lane = [-0.59, 0, 0.59].find((x) => !next.lanes.includes(x)) ?? lane;
          }
        }
        r.steer = clamp((lane - r.x) * 4, -1, 1);
        r.dash = (t + r.cpu * 1.7) % (5 + r.cpu * 0.55) < 1.45;
        r.jump = next && next.kind === 'fence' && next.d - r.d < r.v * (0.2 + r.cpu * 0.016);
        r.use = r.item === 'boost' || (r.item === 'shield' && !!r.jump) || (r.item === 'mud' && r.row % 3 === 0);
      }
      if (r.use) useItem(r);
      r.use = false;
      const dashing = r.dash && !r.exhausted && r.slow <= 0;
      r.reserve = clamp(r.reserve + dt * (dashing ? -0.48 : 0.29), 0, 1);
      if (r.reserve === 0) r.exhausted = true;
      if (r.reserve >= 0.34) r.exhausted = false;
      const bend = curve(r.d + 10) - 2 * curve(r.d) + curve(r.d - 10);
      const steering = 1.12 + r.turn * 0.14;
      r.x = clamp(r.x + (r.steer * steering - bend * r.v * (0.19 + r.weight * 0.027)) * dt, -0.97, 0.97);
      const topSpeed = 19 + r.speed * 0.72 - (r.cpu ? (6 - r.cpu) * 0.65 : 0);
      const target = r.slow > 0 ? 11 : topSpeed + (r.boost > 0 ? 13 : dashing ? 6 : 0);
      const speed = Math.abs(r.x) > 0.88 ? Math.min(target, 17) : target;
      r.v += (speed - r.v) * Math.min(1, dt * (3.1 + r.accel * 0.53));
      const before = r.d, travelled = r.v * dt;
      r.d += travelled;
      if (r.jump && r.y === 0) r.vy = 7.7;
      r.jump = false;
      r.vy -= 20 * dt;
      r.y = Math.max(0, r.y + r.vy * dt);
      if (!r.y) r.vy = 0;
      for (const timer of ['boost', 'shield', 'slow']) r[timer] = Math.max(0, r[timer] - dt);

      if (next && r.d >= next.d) {
        r.row++;
        if (next.lanes.some((lane) => Math.abs(lane - r.x) < 0.285)) {
          if (next.kind === 'box' && !r.item) {
            const behind = rank().indexOf(r) >= racers.length / 2;
            const roll = rng();
            r.item = roll < (behind ? 0.7 : 0.36) ? 'boost' : roll < 0.84 ? 'shield' : 'mud';
            if (r === mine) show(itemNames[r.item] + 'を拾った！');
          }
          if (next.kind === 'pad' && r.y < 0.25) r.boost = Math.max(r.boost, 1.45);
          if (next.kind === 'fence' && r.y < 0.6) hit(r);
          if (next.kind === 'mud' && r.y < 0.25) hit(r);
        }
      }
      for (const trap of traps) {
        if (trap.until <= t || trap.owner === r || (cfg.team && trap.owner.team === r.team)) continue;
        const trapDistance = trap.d + Math.round((before - trap.d) / lap) * lap;
        if (before < trapDistance && r.d >= trapDistance && Math.abs(r.x - trap.x) < 0.3 && r.y < 0.3) {
          hit(r);
          trap.until = t;
        }
      }
      if (r.d >= goal) {
        r.d = goal;
        r.fin = t - dt * (before + travelled - goal) / travelled;
        first ??= r.fin;
      }
    }

    function publish() {
      send(others, {
        k: 'raceState', seed: cfg.seed, t: r2(t), over,
        riders: racers.map((r) => [over ? r.d : r1(r.d), r2(r.x), r2(r.y), r1(r.v), r.fin, r.item,
          r2(r.reserve), r2(r.boost), r2(r.shield), r2(r.slow), Number(r.out), r.loadout]),
        traps: traps.map((trap) => [r1(trap.d), r2(trap.x)]),
      });
    }

    function input() {
      const keys = (IN.r ? 1 : 0) - (IN.l ? 1 : 0);
      const steer = keys || env.pad?.x || (padR ? 1 : 0) - (padL ? 1 : 0);
      return [r2(steer), !!(IN.b || IN.u || IN.pb || IN.pu), !!IN.aT, !!IN.cT];
    }

    function applyInput(r, [steer, dash, jump, use]) {
      r.steer = Number.isFinite(steer) ? clamp(steer, -1, 1) : 0;
      r.dash = dash === true;
      r.jump ||= jump === true;
      r.use ||= use === true;
      r.seen = t;
    }

    const view = racers.map((r) => ({ d: r.d, x: r.x, y: 0 }));
    let displayedTraps = [];
    function drawFlat() {
      const w = cv.width, h = cv.height, horizon = h * 0.29, near = Math.min(w * 0.53, h * 0.79);
      const self = view[racers.indexOf(mine)], camera = self.d - 10;
      const bend = curve(camera), bendAhead = curve(camera + 14) - bend;
      const perspective = (d, x = 0) => {
        const z = Math.max(2, d - camera);
        const scale = 10 / z;
        const center = (curve(d) - bend - bendAhead * z / 14) * 0.53;
        return { x: w / 2 + (x - self.x * 0.48 + center) * near * scale,
          y: horizon + h * 0.5 * scale, half: near * scale, scale };
      };
      const fill = (color, ...points) => {
        g.fillStyle = color;
        g.beginPath();
        points.forEach(([x, y], i) => { if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); });
        g.closePath();
        g.fill();
      };
      const strip = (a, b, l, r, color) => fill(color,
        [a.x + a.half * l, a.y], [a.x + a.half * r, a.y],
        [b.x + b.half * r, b.y], [b.x + b.half * l, b.y]);
      const sky = g.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#547f9c');
      sky.addColorStop(1, '#f3dfb4');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = -1; i < 6; i++) {
        const x = (i / 4 - bend * 0.06) * w;
        fill(i % 2 ? '#789381' : '#688b84', [x - w * 0.24, horizon + 5],
          [x + w * 0.09, horizon * (0.46 + (i % 3) * 0.09)], [x + w * 0.35, horizon + 5]);
      }
      g.fillStyle = '#64834b';
      g.fillRect(0, horizon, w, h - horizon);
      const start = Math.floor((camera + 5) / 2) * 2;
      for (let d = start + 124; d >= start; d -= 2) {
        const a = perspective(d), b = perspective(d + 2), dark = Math.floor(d / 6) % 2;
        g.fillStyle = dark ? '#708f4d' : '#779954';
        g.fillRect(0, b.y, w, a.y - b.y + 1);
        strip(a, b, -1.07, 1.07, dark ? '#eee0b5' : '#9c472f');
        strip(a, b, -1, 1, dark ? '#ab794c' : '#b68454');
        if (dark) for (const lane of [-0.3, 0.3]) strip(a, b, lane - 0.009, lane + 0.009, '#debb82');
      }

      const objects = [];
      const visible = (d) => d > camera + 4 && d < camera + 125;
      for (let d = Math.floor((camera + 8) / 9) * 9; d < camera + 125; d += 9) {
        if (visible(d)) objects.push({ d, kind: 'tree', x: (Math.floor(d / 9) % 2 ? -1 : 1) * (1.23 + 0.18 * Math.sin(d)) });
      }
      for (let i = 0; i <= laps; i++) if (visible(i * lap)) objects.push({ d: i * lap, kind: 'line', x: 0 });
      for (const row of features) if (visible(row.d)) {
        for (const x of row.lanes) objects.push({ d: row.d, kind: row.kind, x });
      }
      for (const [d, x] of displayedTraps) if (visible(d)) objects.push({ d, x, kind: 'trap' });
      racers.forEach((r, i) => {
        if (r.out) return;
        const current = view[i], distance = current.d - self.d;
        const d = r !== mine && r.fin == null ? current.d - Math.round(distance / lap) * lap : current.d;
        if (visible(d)) objects.push({ ...current, d, r, kind: 'horse' });
      });
      objects.sort((a, b) => b.d - a.d);
      for (const o of objects) {
        const p = perspective(o.d, o.x), { x, y, scale } = p;
        const size = Math.min(1.65, Math.min(w / 550, h / 470) * scale);
        if (o.kind === 'line') {
          const far = perspective(o.d + 1.6);
          for (let k = 0; k < 12; k++) strip(p, far, k / 6 - 1, (k + 1) / 6 - 1, k % 2 ? '#282621' : '#f5ead0');
        } else if (o.kind === 'tree') {
          g.fillStyle = '#604a33';
          g.fillRect(x - 4 * size, y - 40 * size, 8 * size, 40 * size);
          fill('#365943', [x, y - 95 * size], [x - 30 * size, y - 25 * size], [x + 30 * size, y - 25 * size]);
          fill('#507353', [x, y - 86 * size], [x - 24 * size, y - 40 * size], [x + 19 * size, y - 40 * size]);
        } else if (o.kind === 'mud' || o.kind === 'trap') {
          g.fillStyle = '#554033';
          g.beginPath();
          g.ellipse(x, y, p.half * 0.265, 10 * size, 0, 0, 7);
          g.fill();
        } else if (o.kind === 'pad') {
          const far = perspective(o.d + 4, o.x);
          strip(p, far, -0.275, 0.275, '#ecd273');
          fill('#fef1bb', [x, far.y], [x - p.half * 0.19, y], [x, (y + far.y) / 2], [x + p.half * 0.19, y]);
        } else if (o.kind === 'box') {
          const a = 32 * size, top = y - a * (1.22 + 0.09 * Math.sin(t * 5 + o.d));
          g.fillStyle = '#24766f';
          g.fillRect(x - a / 2, top, a, a);
          g.strokeStyle = '#f6da91';
          g.lineWidth = Math.max(1, 2 * size);
          g.strokeRect(x - a / 2, top, a, a);
          if (a > 6) drawText(g, '道', x, top + a * 0.73, { sz: a * 0.65, al: 'center', b: 1 });
        } else if (o.kind === 'fence') {
          const span = p.half * 0.28, height = 24 * size;
          g.fillStyle = '#63472c';
          g.fillRect(x - span, y - height, 5 * size, height);
          g.fillRect(x + span - 5 * size, y - height, 5 * size, height);
          g.fillStyle = '#f0c786';
          g.fillRect(x - span, y - height, span * 2, 5 * size);
          g.fillRect(x - span, y - height * 0.59, span * 2, 3 * size);
        } else {
          const r = o.r, lift = o.y * 31 * size;
          g.fillStyle = '#30271d66';
          g.beginPath();
          g.ellipse(x, y, 19 * size, 5 * size, 0, 0, 7);
          g.fill();
          if (r.shield > 0) {
            g.strokeStyle = '#b2f0df';
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(x, y - lift - 23 * size, 33 * size, 31 * size, 0, 0, 7);
            g.stroke();
          }
          const coat = raceParts[0][1][r.loadout[0]][5];
          drawHorse(g, x, y - lift, size * 1.2, r.color, o.d * 0.85, o.y > 0.05, coat);
          if (r === mine || size > 0.34) drawText(g, r === mine ? '自分' : r.name.slice(0, 14),
            x, y - lift - 71 * size, { sz: r === mine ? 14 : 12, al: 'center', c: r.color });
        }
      }

    }

    function draw() {
      const w = cv.width, h = cv.height;
      if (!world?.draw(view, racers.indexOf(mine), displayedTraps, t, (s, x, y, options) => drawText(g, s, x, y, options))) drawFlat();
      const order = rank(), place = order.indexOf(mine) + 1;
      g.fillStyle = '#23251cdd';
      g.fillRect(12, 12, 162, 94);
      drawText(g, place + '位 / ' + racers.length, 22, 46, { sz: 28, b: 1 });
      drawText(g, Math.min(laps, 1 + Math.floor(Math.max(0, mine.d) / lap)) + ' / ' + laps + '周',
        23, 69, { sz: 15, c: '#f4d389' });
      drawText(g, 'ダッシュ', 22, 92, { sz: 12 });
      bar(g, 83, 82, 77, 11, mine.reserve, '#efc24e');
      const trackWidth = Math.min(280, w - 36), trackX = (w - trackWidth) / 2, trackY = 122;
      g.fillStyle = '#282820bb';
      g.fillRect(trackX, trackY, trackWidth, 5);
      for (const r of order.slice().reverse()) {
        if (r.out) continue;
        g.fillStyle = r.color;
        g.beginPath();
        g.arc(trackX + clamp(r.d / goal, 0, 1) * trackWidth, trackY + 2.5, r === mine ? 6 : 4, 0, 7);
        g.fill();
      }
      drawText(g, mine.item ? '道具　' + itemNames[mine.item] : '道具　―', w / 2, 152,
        { sz: 16, al: 'center', b: 1, c: mine.item ? '#ffe19a' : '#f2ead7' });
      if (cv.parentElement.classList.contains('race-keys')) {
        g.fillStyle = '#23251cdd';
        g.fillRect(0, h - 29, w, 29);
        drawText(g, '← → 進路　 Space 跳ぶ　 Shift 加速　 E 道具', w / 2, h - 10,
          { sz: Math.min(14, w / 25), al: 'center' });
      }
      if (noticeUntil > t && t >= 0) drawText(g, notice, w / 2, 179, { sz: 16, al: 'center' });
      if (t < 0 || t < 0.65) drawText(g, t < 0 ? String(Math.ceil(-t)) : '出走！', w / 2, h * 0.54,
        { sz: Math.min(80, w * 0.17), b: 1, al: 'center', c: '#ffe6a2' });
      else if (mine.fin != null && !over) drawText(g, 'ゴール！　' + mine.fin.toFixed(1) + '秒', w / 2, h * 0.51,
        { sz: Math.min(38, w * 0.075), b: 1, al: 'center' });
    }

    return {
      msg(from, m) {
        if (m.k === 'quit') {
          if (!host && from === cfg.lead) finish(true);
          if (host) {
            const r = racers.find((r) => r.id === from);
            if (r && r.fin == null) r.out = true;
          }
          return;
        }
        if (m.seed !== cfg.seed) return;
        if (host && m.k === 'raceInput' && Array.isArray(m.input)) {
          const r = racers.find((r) => r.id === from);
          if (r && r !== mine && !r.out) {
            if (!r.loadoutLocked) {
              setLoadout(r, raceLoadout(m.loadout));
              r.loadoutLocked = true;
            }
            applyInput(r, m.input);
          }
        }
        if (!host && from === cfg.lead && m.k === 'raceState' && m.riders?.length === racers.length) {
          heartbeat = performance.now();
          t = m.t;
          over = m.over;
          racers.forEach((r, i) => {
            const oldItem = r.item, oldSlow = r.slow;
            let out, selected;
            [r.d, r.x, r.y, r.v, r.fin, r.item, r.reserve, r.boost, r.shield, r.slow, out, selected] = m.riders[i];
            if (r !== mine) r.loadout = raceLoadout(selected);
            r.out = !!out;
            if (r === mine && r.item && r.item !== oldItem) show(itemNames[r.item] + 'を拾った！');
            if (r === mine && !r.item && oldItem) show(itemNames[oldItem] + '！');
            if (r === mine && !oldSlow && r.slow) show('減速！');
          });
          displayedTraps = m.traps;
          if (over) { raceAudio(); finish(false); }
        }
      },
      update(dt) {
        if (env.finished) return;
        const controls = input();
        clock -= dt;
        if (host) {
          t += dt;
          applyInput(mine, controls);
          if (t >= 0) {
            for (const r of racers) step(r, dt);
            for (let i = traps.length - 1; i >= 0; i--) if (traps[i].until <= t) traps.splice(i, 1);
            displayedTraps = traps.map((trap) => [trap.d, trap.x]);
            over = racers.every((r) => r.out || r.fin != null) || (first != null && t - first >= 18) || t >= 110;
          } else {
            for (const r of racers) r.jump = r.use = false;
          }
          if (over || clock <= 0) {
            publish();
            clock = 0.065;
          }
          raceAudio(dt);
          if (over) finish(false);
        } else if (performance.now() - heartbeat > 10000) {
          finish(true);
        } else if (clock <= 0 || controls[2] || controls[3]) {
          send([cfg.lead], { k: 'raceInput', seed: cfg.seed, input: controls, loadout });
          clock = 0.05;
        }
        if (!host && !env.finished) raceAudio(dt);
        racers.forEach((r, i) => {
          const v = view[i], weight = Math.min(1, dt * 22);
          v.d += (r.d - v.d) * (host ? 1 : weight);
          v.x += (r.x - v.x) * (host ? 1 : weight);
          v.y += (r.y - v.y) * (host ? 1 : weight);
        });
      },
      draw,
      dispose() { world?.dispose(); },
    };
  }


  // =====================================================================
  // 弓の的当て大会（仮想の広さ 160×90）
  // =====================================================================
  function archeryGame(env) {
    const { cfg, me, g2: g, cv } = env, rng = mulberry(cfg.seed), VW = 160, VH = 90, ARROWS = 10, FLY = 0.4;
    const tg = []; // 的：行ごとに動く
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) tg.push({ y: 22 + row * 20, r: 5.5 - row * 0.6, v: (row % 2 ? -1 : 1) * (9 + rng() * 10 + row * 4), ph: rng() * 200, gold: row === 1 && i === 0 });
    tg.find((x) => x.gold).r = 3.6; tg.find((x) => x.gold).v *= 1.6;
    const pos = (o, t) => { const L = VW + o.r * 2 + 10; return ((((o.ph + o.v * t) % L) + L) % L) - o.r - 5; };
    const wind0 = rng() * 6, windAt = (t) => 5 * Math.sin(t * 0.4 + wind0) + 2 * Math.sin(t * 1.1 + wind0 * 2);
    // 2.67.0 風を目で見せる：流れる木の葉と風の筋、両側の吹き流し、上の大きな風の目盛り
    const leaves = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % VW, y: 4 + ((i * 53) % 56), k: i % 3, sp: 0.7 + ((i * 29) % 10) / 15, ph: i })); let lastDraw = performance.now();
    const S = {}; for (const id of env.ids) S[id] = { sc: 0, n: 0, done: false }; let t = -2, cx = VW / 2, cy = 40, cd = 0, marks = [], doneAt = null, tOver = null;
    const me0 = S[me];
    function finishAll() {
      const rk = env.ids.slice().sort((a, b) => S[b].sc - S[a].sc), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows = [];
      if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) pts[env.tm[id]] += S[id].sc; team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose'; rows.push(`<b>チーム戦　赤 ${pts[0]}点 ― 白 ${pts[1]}点　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`); }
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${S[id].sc}点`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'archery', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = S[from]; if (!o) return; if (m.k === 'sc') { o.sc = m.s; o.n = m.n; } else if (m.k === 'done') { o.sc = m.s; o.n = ARROWS; o.done = true; } },
      update(dt) {
        t += dt; if (t < 0) return; cd -= dt;
        const pd = env.pad || { x: 0, y: 0 }, sp = 60;
        if (IN.l) cx -= sp * dt; if (IN.r) cx += sp * dt; if (IN.u) cy -= sp * dt; if (IN.d) cy += sp * dt; cx += pd.x * sp * dt; cy += pd.y * sp * dt;
        if (IN.mx != null) { const sc = Math.min(cv.width / VW, cv.height / VH); cx = (IN.mx - (cv.width - VW * sc) / 2) / sc; cy = (IN.my - (cv.height - VH * sc) / 2) / sc; IN.mx = null; }
        cx = clamp(cx, 0, VW); cy = clamp(cy, 8, VH - 4);
        if ((IN.aT || IN.click) && cd <= 0 && me0.n < ARROWS) {
          cd = 0.45; const lx = cx + windAt(t) * 0.9, lt = t + FLY; let pts = 0, gold = false;
          for (const o of tg) { const d = Math.hypot(pos(o, lt) - lx, o.y - cy); if (d < o.r) { const q = d / o.r, p = q < 0.3 ? 10 : q < 0.65 ? 7 : 4; if (p * (o.gold ? 2 : 1) > pts) { pts = p * (o.gold ? 2 : 1); gold = o.gold; } } }
          me0.n++; marks.push({ x: lx, y: cy, at: lt, pts, gold, shown: false });
        }
        for (const m of marks) if (!m.shown && t >= m.at) { m.shown = true; me0.sc += m.pts; send(env.others, { k: 'sc', s: me0.sc, n: marks.filter((q) => q.shown).length }); }
        if (me0.n >= ARROWS && marks.every((m) => m.shown) && !me0.done) { me0.done = true; doneAt = t; send(env.others, { k: 'done', s: me0.sc }); }
        const alive = env.ids.filter((id) => !env.gone[id]);
        if (alive.every((id) => S[id].done) || t > 120) finishAll(); // 2.59.2 全員が射終わるまで待つ（相手の最後の点が入らず、二人とも1位になるのを防ぐ）
        void tOver;
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, sc = Math.min(W0 / VW, H0 / VH), ox = (W0 - VW * sc) / 2, oy = (H0 - VH * sc) / 2;
        g.fillStyle = '#1b2a1b'; g.fillRect(0, 0, W0, H0); g.save(); g.translate(ox, oy); g.scale(sc, sc);
        g.fillStyle = '#a7d3f2'; g.fillRect(0, 0, VW, VH); g.fillStyle = '#5e9a4a'; g.fillRect(0, 62, VW, 28);
        for (const o of tg) { const x = pos(o, Math.max(0, t)); g.strokeStyle = '#6b4a2a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, o.y); g.lineTo(x, o.y + o.r + 12); g.stroke();
          g.fillStyle = o.gold ? '#f2c14e' : '#fff'; g.beginPath(); g.arc(x, o.y, o.r, 0, 7); g.fill(); g.fillStyle = o.gold ? '#fff2a0' : '#d33'; g.beginPath(); g.arc(x, o.y, o.r * 0.65, 0, 7); g.fill(); g.fillStyle = o.gold ? '#e08a00' : '#fff'; g.beginPath(); g.arc(x, o.y, o.r * 0.3, 0, 7); g.fill(); }
        for (const m of marks) if (m.shown && t - m.at < 3) { g.fillStyle = m.pts ? '#2a7a2a' : '#555'; g.beginPath(); g.arc(m.x, m.y, 1, 0, 7); g.fill(); g.font = 'bold 6px sans-serif'; g.fillStyle = m.pts ? '#fff' : '#ccc'; g.textAlign = 'center'; g.fillText(m.pts ? '+' + m.pts + (m.gold ? ' 金!' : '') : 'はずれ', m.x, m.y - 3 - (t - m.at) * 2); }
        const wnd = windAt(Math.max(0, t)), nowD = performance.now(), ddt = Math.min(0.05, (nowD - lastDraw) / 1000); lastDraw = nowD;
        // 木の葉と風の筋：風の向き・強さで流れる
        for (const L of leaves) {
          L.x += (wnd * 6 * L.sp + (wnd >= 0 ? 1 : -1) * 2) * ddt; L.y += Math.sin(nowD / 400 + L.ph) * 3 * ddt; L.ph += ddt;
          if (L.x > VW + 4) L.x = -4; if (L.x < -4) L.x = VW + 4;
          if (L.k === 2) { g.strokeStyle = `rgba(255,255,255,${Math.min(0.55, Math.abs(wnd) / 8)})`; g.lineWidth = 0.4; g.beginPath(); g.moveTo(L.x, L.y); g.lineTo(L.x - wnd * 2.2, L.y); g.stroke(); }
          else { g.save(); g.translate(L.x, L.y); g.rotate(nowD / 300 + L.ph); g.fillStyle = L.k ? '#c8601e' : '#6aa040'; g.beginPath(); g.ellipse(0, 0, 1.4, 0.7, 0, 0, 7); g.fill(); g.restore(); }
        }
        // 吹き流し（左右の竿）：風が強いほど横になびく
        for (const px of [6, VW - 6]) {
          g.strokeStyle = '#5a3a1a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(px, 62); g.lineTo(px, 14); g.stroke();
          const a = clamp(wnd / 7, -1, 1), len = 14, dx = a * len, dy = (1 - Math.abs(a)) * len * 0.9;
          for (let k = 0; k < 4; k++) { const f = k / 4, f2 = (k + 1) / 4, wv = Math.sin(nowD / 120 + k) * Math.abs(a) * 0.8; g.fillStyle = k % 2 ? '#fff' : '#d33'; g.beginPath(); g.moveTo(px + dx * f, 15 + dy * f + wv); g.lineTo(px + dx * f2, 15 + dy * f2 + wv); g.lineTo(px + dx * f2, 18 + dy * f2 + wv); g.lineTo(px + dx * f, 18 + dy * f + wv); g.fill(); }
        }
        const lx = cx + wnd * 0.9;
        if (Math.abs(lx - cx) > 0.5) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.4; g.setLineDash([1.5, 1.5]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(lx, cy); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(cx, cy, 0.7, 0, 7); g.fill(); } // 狙った所から、風で流される先へ
        g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.6; g.beginPath(); g.arc(lx, cy, 3, 0, 7); g.moveTo(lx - 5, cy); g.lineTo(lx + 5, cy); g.moveTo(lx, cy - 5); g.lineTo(lx, cy + 5); g.stroke(); g.restore();
        drawText(g, `残り ${ARROWS - me0.n} 本　${me0.sc} 点`, 16, 28, { sz: 22, b: 1 });
        { // 風の目盛り（上のまん中）：向きの矢印・強さの色と言葉
          const wv = windAt(Math.max(0, t)), aw = Math.abs(wv), gw = Math.min(360, W0 * 0.42), gx = W0 / 2 - gw / 2, gy = 14, col = aw < 0.8 ? '#cfe8ff' : aw < 2.5 ? '#9ad46a' : aw < 4.5 ? '#f2c14e' : '#e0463c';
          const word = aw < 0.8 ? '無風' : aw < 2.5 ? '弱い' : aw < 4.5 ? 'やや強い' : '強い';
          g.fillStyle = '#000a'; g.fillRect(gx - 8, gy - 4, gw + 16, 46); g.fillStyle = '#ffffff22'; g.fillRect(gx, gy + 6, gw, 14);
          const fw = (clamp(wv, -7, 7) / 7) * (gw / 2); g.fillStyle = col; g.fillRect(fw >= 0 ? W0 / 2 : W0 / 2 + fw, gy + 6, Math.abs(fw), 14);
          g.fillStyle = '#fff'; g.fillRect(W0 / 2 - 1, gy + 2, 2, 22);
          if (aw >= 0.8) { const ax = W0 / 2 + fw, dir = wv > 0 ? 1 : -1; g.fillStyle = col; g.beginPath(); g.moveTo(ax + dir * 14, gy + 13); g.lineTo(ax, gy + 1); g.lineTo(ax, gy + 25); g.fill(); }
          drawText(g, `風 ${aw < 0.8 ? '' : wv > 0 ? '→ ' : '← '}${word}（${aw.toFixed(1)}）`, W0 / 2, gy + 40, { sz: 15, b: 1, al: 'center', c: col });
        }
        env.ids.forEach((id, i) => drawText(g, `${nameOf(env, id)}　${S[id].sc}点${S[id].done ? '（終了）' : ''}`, W0 - 16, 30 + i * 20, { sz: 15, al: 'right', c: tcol(env, id) }));
        if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) pts[env.tm[id]] += S[id].sc; drawText(g, `赤 ${pts[0]} ― 白 ${pts[1]}`, W0 / 2, H0 - 16, { sz: 20, b: 1, al: 'center' }); }
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' });
      },
    };
  }

  // =====================================================================
  // 荷運び競争（協力）：リーダーの端末が荷車を動かし、10回/秒で全員へ配る
  // =====================================================================
  // 2.65.0 荷運び：レーン5本・道具（加速／修理／守り／相手に岩）・チーム戦（赤と白の荷車で競走）。速さは道の流れと速さの目盛りで見せる
  const CART_IT = { boost: { n: '加速', c: '#f2c14e', d: '3秒のあいだ速く走る' }, repair: { n: '修理', c: '#6ac46a', d: '崩れた荷を2割直す' }, shield: { n: '守り', c: '#6aa8e0', d: '次の岩を1回だけ防ぐ' }, rock: { n: '岩落とし', c: '#e0463c', d: '相手の荷車の前に岩を3つ落とす' } };
  function cartGame(env) {
    const { cfg, me, g2: g, cv } = env, lead = cfg.lead === me, rng = mulberry(cfg.seed), LEN = 700, TL = 120, LN = 5, team = !!cfg.team, NC = team ? 2 : 1;
    const base = [], items = [];
    for (let d = 40; d < LEN - 15; d += 20 + rng() * 18) { const n = rng() < 0.3 ? 2 : 1, ls = []; while (ls.length < n) { const l = (rng() * LN) | 0; if (!ls.includes(l)) ls.push(l); } base.push({ d, lanes: ls }); }
    for (let d = 60; d < LEN - 40; d += 45 + rng() * 30) { let l = (rng() * LN) | 0; if (base.some((o) => Math.abs(o.d - d) < 6 && o.lanes.includes(l))) l = (l + 2) % LN; items.push({ d, lane: l }); }
    const mkC = () => ({ d: 0, v: 0, load: 1, t: -3, stun: 0, lane: 2, end: 0, hits: 0, item: null, boost: 0, shield: 0, fin: 0, obs: base.map((o) => ({ d: o.d, lanes: o.lanes, hit: false })), atk: [], got: [] });
    const CS = Array.from({ length: NC }, mkC), PS = {}; for (const id of env.ids) PS[id] = { lane: 2, effort: 0, taps: 0, c: team ? env.tm[id] : 0 };
    const myC = PS[me] ? PS[me].c : 0;
    let snapT = 0, inT = 0, lastLane = 2, ph = 0, rx = performance.now(), T = -3, over = 0, useQ = 0, taps = 0; const flash = [0, 0], msg = [null, null];
    const say = (ci, t) => { msg[ci] = { t, at: performance.now() }; };
    function result() {
      const ci = myC, C = CS[ci];
      if (!team) return env.end({ title: over === 1 ? '荷を運びきった！' : '荷を運びきれなかった…', rows: over === 1 ? [`荷の残り ${Math.round(C.load * 100)}%　かかった時間 ${C.t.toFixed(1)}秒`, `崩した回数 ${C.hits}回`] : ['もう一度、みんなで息を合わせよう'], cmd: { type: 'partyResult', game: 'cart', n: env.ids.length, ok: over === 1, load: r2(C.load) } });
      const w = winner(), res = w < 0 ? 'draw' : w === ci ? 'win' : 'lose';
      env.end({ title: w < 0 ? '引き分け' : `${TEAM[w].n}の荷車の勝ち！`, rows: CS.map((c, i) => `<b style="color:${TEAM[i].c}">${TEAM[i].n}</b>：${c.fin ? `ゴール ${c.fin.toFixed(1)}秒` : `道のり ${Math.round(clamp(c.d / LEN, 0, 1) * 100)}%`}　荷 ${Math.round(c.load * 100)}%　崩した ${c.hits}回`), cmd: { type: 'partyResult', game: 'cart', n: env.ids.length, team: res } });
    }
    function winner() { // 先にゴール、どちらもゴールしなければ道のりの長い方
      const [a, b] = CS; if (a.fin && b.fin) return a.fin < b.fin ? 0 : a.fin > b.fin ? 1 : -1; if (a.fin) return 0; if (b.fin) return 1;
      const da = a.load > 0 ? a.d : 0, db = b.load > 0 ? b.d : 0; return Math.abs(da - db) < 1 ? -1 : da > db ? 0 : 1;
    }
    function useItem(ci) { // リーダー：その荷車の道具を使う
      const C = CS[ci], it = C.item; if (!it || C.end) return; C.item = null;
      if (it === 'boost') C.boost = 3; else if (it === 'repair') C.load = Math.min(1, C.load + 0.2); else if (it === 'shield') C.shield = 1;
      else if (it === 'rock') { const O = CS[1 - ci]; if (O) for (let k = 0; k < 3; k++) O.atk.push({ d: O.d + 22 + k * 9 + Math.random() * 6, lanes: [(Math.random() * LN) | 0], hit: false }); say(1 - ci, '岩が落ちてきた！'); }
      say(ci, `${CART_IT[it].n}を使った！`);
    }
    function applyTaps(p, total) {
      if (!Number.isSafeInteger(total) || total <= p.taps) return;
      const presses = total - p.taps;
      p.taps = total;
      if (T >= 0) p.effort = Math.min(1, p.effort + presses * 0.32);
    }
    function stepCart(ci, dt) {
      const C = CS[ci]; if (C.end) { C.v *= 0.9; return; }
      const mem = env.ids.filter((id) => !env.gone[id] && PS[id].c === ci); let pull = 0, lanes = 0;
      for (const id of mem) {
        const q = PS[id];
        pull += q.effort;
        q.effort = Math.max(0, q.effort - 0.9 * dt);
        lanes += q.lane;
      }
      const ln = mem.length ? lanes / mem.length : 2; C.lane += (Math.round(ln) - C.lane) * Math.min(1, dt * 8);
      let target = 0.6 + 15.4 * pull / Math.max(1, mem.length); if (C.boost > 0) { C.boost -= dt; target = target * 1.5 + 5; } if (C.stun > 0) { C.stun -= dt; target *= 0.3; }
      C.v += (target - C.v) * Math.min(1, dt * 2.2); C.d += C.v * dt; C.t += dt;
      const L = Math.round(C.lane);
      for (const o of C.obs.concat(C.atk)) if (!o.hit && C.d >= o.d) { o.hit = true; if (o.lanes.includes(L)) { if (C.shield) { C.shield = 0; say(ci, '守りで岩を防いだ！'); } else { C.load = Math.max(0, C.load - 0.17); C.stun = 1; C.v *= 0.3; C.hits++; flash[ci] = 0.4; } } }
      items.forEach((it, k) => { if (!C.got.includes(k) && C.d >= it.d && C.d - it.d < 8) { if (it.lane === L) { C.got.push(k); const pool = team ? ['boost', 'boost', 'repair', 'shield', 'rock', 'rock'] : ['boost', 'boost', 'repair', 'shield']; C.item = pool[(Math.random() * pool.length) | 0]; say(ci, `${CART_IT[C.item].n}を手に入れた！`); } else if (C.d - it.d > 4) C.got.push(k); } });
      if (C.d >= LEN) { C.end = 1; C.fin = C.t; } else if (C.load <= 0) C.end = 2;
    }
    function snap() { send(env.others, { k: 'snap', T: r1(T), over, cs: CS.map((C) => ({ d: r1(C.d), v: r1(C.v), load: r2(C.load), t: r1(C.t), st: C.stun > 0 ? r2(C.stun) : 0, lane: r2(C.lane), hits: C.hits, item: C.item, bo: C.boost > 0 ? r1(C.boost) : 0, sh: C.shield, end: C.end, fin: C.fin, got: C.got, atk: C.atk.map((o) => [r1(o.d), o.lanes[0], o.hit ? 1 : 0]), hit: C.obs.filter((o) => o.hit).length })), ps: Object.fromEntries(env.ids.map((id) => [id, [PS[id].lane, r2(PS[id].effort)]])), msg }); }
    return {
      msg(from, m) {
        if (lead) { const p = PS[from]; if (p && m.k === 'in') { p.lane = clamp(m.lane | 0, 0, LN - 1); applyTaps(p, m.taps); if (m.use) useItem(p.c); } return; }
        if (from !== cfg.lead || m.k !== 'snap') return; rx = performance.now(); T = m.T;
        m.cs.forEach((s, i) => { const C = CS[i]; if (!C) return; if (s.hits > C.hits) flash[i] = 0.4; Object.assign(C, { d: s.d, v: s.v, load: s.load, t: s.t, stun: s.st, lane: s.lane, hits: s.hits, item: s.item, boost: s.bo, shield: s.sh, end: s.end, fin: s.fin, got: s.got }); C.atk = s.atk.map(([d, l, h]) => ({ d, lanes: [l], hit: !!h })); C.obs.forEach((o, k) => { o.hit = k < s.hit; }); });
        for (const id in m.ps) if (PS[id]) { if (id !== me) PS[id].lane = m.ps[id][0]; PS[id].effort = m.ps[id][1]; }
        m.msg.forEach((x, i) => { if (x && (!msg[i] || msg[i].t !== x.t)) say(i, x.t); });
        if (m.over && !over) { over = m.over; result(); }
      },
      update(dt) {
        ph += dt; flash[0] -= dt; flash[1] -= dt;
        const p = PS[me]; if (p) { if (IN.lT) p.lane = clamp(p.lane - 1, 0, LN - 1); if (IN.rT) p.lane = clamp(p.lane + 1, 0, LN - 1); if (IN.aT && T >= 0) { taps++; if (lead) applyTaps(p, taps); } if (IN.bT || IN.click) useQ = 1; }
        if (!lead) { inT -= dt; if (p && (inT <= 0 || p.lane !== lastLane || useQ)) { inT = 0.1; lastLane = p.lane; send([cfg.lead], { k: 'in', lane: p.lane, taps, use: useQ }); useQ = 0; } if (performance.now() - rx > 8000) env.end({ title: 'リーダーとの通信が切れました', rows: [], cmd: null }); return; }
        if (useQ && p) { useItem(p.c); useQ = 0; }
        T += dt; if (T < 0) { snapT -= dt; if (snapT <= 0) { snapT = 0.1; snap(); } return; }
        if (!over) {
          CS.forEach((_, i) => stepCart(i, dt));
          if (!team) { const C = CS[0]; if (C.end === 1) over = 1; else if (C.end === 2 || T > TL) over = 2; }
          else if (CS.some((C) => C.end === 1) || CS.every((C) => C.end) || T > TL) over = 1;
          if (over) { snap(); snap(); result(); }
        }
        snapT -= dt; if (snapT <= 0) { snapT = 0.1; snap(); }
      },
      draw() {
        const W0 = cv.width, H0 = cv.height; g.fillStyle = '#5d8a46'; g.fillRect(0, 0, W0, H0);
        const order = NC === 2 ? [myC, 1 - myC] : [0], vw = W0 / NC;
        order.forEach((ci, k) => drawRoad(ci, k * vw, vw, H0));
        if (NC === 2) { g.fillStyle = '#000'; g.fillRect(vw - 2, 0, 4, H0); }
        if (T < 0) drawText(g, String(Math.ceil(-T)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' });
        const t = Math.max(0, T); drawText(g, `${t.toFixed(0)}/${TL}秒`, W0 / 2, 24, { sz: 16, al: 'center' });
      },
    };
    function drawRoad(ci, x0v, vw, H0) {
      const C = CS[ci], rw = Math.min(vw * 0.82, 460), x0 = x0v + (vw - rw) / 2, ln = rw / LN, cy = H0 * 0.7, ppm = (H0 * 0.6) / 22, off = (C.d * ppm) % 40;
      g.save(); g.beginPath(); g.rect(x0v, 0, vw, H0); g.clip();
      // 道ばたの草（道と同じ速さで流れるので、速さが目で分かる）
      g.fillStyle = '#4f7a3a'; for (let y = -40 + off; y < H0 + 40; y += 40) { g.fillRect(x0 - 26, y, 10, 4); g.fillRect(x0 + rw + 16, y + 20, 10, 4); }
      g.fillStyle = '#b89a6a'; g.fillRect(x0, 0, rw, H0); g.fillStyle = '#8a7048'; g.fillRect(x0 - 4, 0, 4, H0); g.fillRect(x0 + rw, 0, 4, H0);
      g.strokeStyle = '#8a7048'; g.lineWidth = 2; g.setLineDash([14, 26]); g.lineDashOffset = -C.d * ppm; for (let i = 1; i < LN; i++) { g.beginPath(); g.moveTo(x0 + ln * i, 0); g.lineTo(x0 + ln * i, H0); g.stroke(); } g.setLineDash([]); g.lineDashOffset = 0;
      // 速さの線（速いほど多く長く）
      if (C.v > 5) { g.strokeStyle = `rgba(255,255,255,${Math.min(0.5, (C.v - 5) / 20)})`; g.lineWidth = 2; for (let k = 0; k < Math.min(14, C.v); k++) { const sx = x0 + ((k * 97 + 13) % rw), sy = ((k * 53 + C.d * ppm * 1.5) % (H0 + 80)) - 40, L2 = C.v * 3; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy + L2); g.stroke(); } }
      const put = (o, col) => { const y = cy - (o.d - C.d) * ppm; if (y < -40 || y > H0 + 40) return; for (const l of o.lanes) { g.fillStyle = o.hit ? '#7a7a7a77' : col; g.beginPath(); g.ellipse(x0 + ln * (l + 0.5), y, ln * 0.34, 14, 0, 0, 7); g.fill(); } };
      for (const o of C.obs) put(o, '#6a6a6a'); for (const o of C.atk) put(o, '#8a3a2a');
      items.forEach((it, k) => { if (C.got.includes(k)) return; const y = cy - (it.d - C.d) * ppm; if (y < -30 || y > H0 + 30) return; const x = x0 + ln * (it.lane + 0.5); g.fillStyle = `hsl(${(ph * 120 + k * 40) % 360},70%,60%)`; g.fillRect(x - 13, y - 13, 26, 26); g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x - 13, y - 13, 26, 26); drawText(g, '？', x, y + 7, { sz: 18, b: 1, al: 'center' }); });
      const gy = cy - (LEN - C.d) * ppm; if (gy > -20) { g.fillStyle = '#fff'; g.fillRect(x0, gy, rw, 8); drawText(g, 'ゴール', x0 + rw / 2, gy - 8, { sz: 18, b: 1, al: 'center' }); }
      const cxp = x0 + ln * (C.lane + 0.5); g.save(); g.translate(cxp, cy + (C.stun > 0 ? Math.sin(ph * 40) * 2 : 0));
      if (C.boost > 0) { g.fillStyle = 'rgba(242,193,78,.5)'; g.beginPath(); g.moveTo(-20, 30); g.lineTo(0, 30 + 30 + Math.sin(ph * 30) * 8); g.lineTo(20, 30); g.fill(); }
      g.fillStyle = team ? TEAM[ci].c : '#7a4a22'; g.fillRect(-26, -30, 52, 60); g.fillStyle = '#c9a15a'; const h = 50 * C.load; g.fillRect(-22, 24 - h, 44, h); g.strokeStyle = '#3a2410'; g.lineWidth = 3; g.strokeRect(-26, -30, 52, 60);
      if (C.shield) { g.strokeStyle = 'rgba(106,168,224,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 42, 0, 7); g.stroke(); }
      g.restore();
      env.ids.filter((id) => PS[id].c === ci).forEach((id, i, arr) => { const q = PS[id], px = cxp + (i - (arr.length - 1) / 2) * 28, py = cy - 50 - q.effort * 6; drawMan(g, px, py + 24, 0.85, team ? TEAM[ci].c : PAL[env.ids.indexOf(id) % PAL.length], ph * (2 + C.v * 0.5) + i, q.effort > 0.1); });
      // 左上：荷・道のり・速さ（数字と目盛り。速さで色が変わる）
      const hx = x0v + 12, sp = Math.max(0, C.v), spc = sp > 14 ? '#f2c14e' : sp > 8 ? '#9ad46a' : sp > 3 ? '#e0e0e0' : '#e07a6a';
      if (team) drawText(g, `${TEAM[ci].n}の荷車${ci === myC ? '（味方）' : ''}`, hx, 48, { sz: 16, b: 1, c: TEAM[ci].c });
      drawText(g, `荷 ${Math.round(C.load * 100)}%`, hx, 72, { sz: 18, b: 1 }); bar(g, hx, 78, 130, 9, C.load, '#c9a15a');
      drawText(g, `道のり ${Math.round(clamp(C.d / LEN, 0, 1) * 100)}%`, hx, 104, { sz: 14 }); bar(g, hx, 110, 130, 6, C.d / LEN, '#fff');
      drawText(g, `速さ ${sp.toFixed(1)}`, hx, 140, { sz: 26, b: 1, c: spc }); bar(g, hx, 148, 130, 12, sp / 25, spc);
      drawText(g, sp > 14 ? 'ぐんぐん！' : sp > 8 ? 'すいすい' : sp > 3 ? 'のろのろ' : C.stun > 0 ? '止まった！' : '連打で加速！', hx, 178, { sz: 14, c: spc });
      // 右下：道具
      if (ci === myC) { const it = C.item && CART_IT[C.item], bx = x0v + vw - 150, by = H0 - 70; g.fillStyle = '#000a'; g.fillRect(bx, by, 138, 56); g.strokeStyle = it ? it.c : '#777'; g.lineWidth = 2; g.strokeRect(bx, by, 138, 56); drawText(g, it ? it.n : '道具なし', bx + 69, by + 24, { sz: 18, b: 1, al: 'center', c: it ? it.c : '#aaa' }); drawText(g, it ? 'B／X／クリックで使う' : '？の箱を拾う', bx + 69, by + 44, { sz: 11, al: 'center' }); }
      const ms = msg[ci]; if (ms && performance.now() - ms.at < 1500) drawText(g, ms.t, x0 + rw / 2, H0 * 0.32, { sz: 24, b: 1, al: 'center', c: '#ffd76a' });
      if (flash[ci] > 0) { g.fillStyle = `rgba(255,60,40,${flash[ci]})`; g.fillRect(x0v, 0, vw, H0); drawText(g, '荷が崩れた！', x0v + vw / 2, H0 / 2, { sz: 34, b: 1, al: 'center' }); }
      if (C.end === 1) drawText(g, 'ゴール！', x0v + vw / 2, H0 * 0.45, { sz: 40, b: 1, al: 'center', c: '#ffd76a' }); else if (C.end === 2) drawText(g, '荷がなくなった…', x0v + vw / 2, H0 * 0.45, { sz: 30, b: 1, al: 'center', c: '#ff8a7a' });
      g.restore();
    }
  }

  // =====================================================================
  // 2.62.0 蹴鞠（見下ろし）：輪になって立ち、募った人（リーダー）から蹴り出す。リーダーの端末が鞠の行き先と速さを決めて配る。
  //  受ける人は、鞠が届いた瞬間（自分の端末で鞠が足もとに来た時）に「蹴る」。判定は受ける人の端末でして、結果をリーダーへ送る
  // =====================================================================
  function kemariGame(env) {
    const { cfg, me, g2: g, cv } = env, lead = cfg.lead === me, rng = mulberry((cfg.seed ^ 0x5bd1e995) >>> 0), ids = env.ids, N = ids.length;
    // 3.24.0 1人50回まで（判定の回数で数える）。判定幅は自分の端末で、続けて当てると狭く・外すと広く（案2）
    const WMIN = 90, WMAX = 320, MAXK = 50, GREAT = 70, CALLS = ['アリ', 'ヤア', 'オウ'];
    let win = 220;
    const H = SGK.HINT || { pick: (m) => m.kb, btn: (n) => n };
    const HF = () => H.pick({ kb: '左クリック／Space', pad: H.btn('A'), touch: '「速く」' }), HS = () => H.pick({ kb: '右クリック／X', pad: H.btn('B') + '／' + H.btn('X'), touch: '「ゆるく」' }); // 描くたびに、いまの機器の文字を選ぶ
    const S = { seq: 0, from: cfg.lead, to: cfg.lead, dur: 0, v: 0, cnt: 0, kicks: {}, great: {}, tries: {}, phase: 'ready', over: null, call: null };
    ids.forEach((id) => { S.kicks[id] = 0; S.great[id] = 0; S.tries[id] = 0; });
    let t0 = performance.now(), judged = 0, fb = null, rx = performance.now(), hb = 0, endT = 0, callT = 0, ph = 0;
    const swing = {}, myI = Math.max(0, ids.indexOf(me));
    const kickSnd = () => { try { SGK.AUDIO.sfx('kmrKick'); } catch (e) {} };
    const ang = (id) => Math.PI / 2 + ((ids.indexOf(id) - myI) * 2 * Math.PI) / N; // 自分がいちばん手前
    const unit = (id) => (N === 1 ? [0, 1] : [Math.cos(ang(id)), Math.sin(ang(id))]);
    const range = (c) => [0.9 + c * 0.07, 1.6 + c * 0.14]; // 鞠の速さの下限（ゆるく返す）・上限（速く返す）（輪の半径／秒）。続けるほど際限なく上がる（2.100.0 上限なし／2.106.11 上がり方を倍に）
    const alive = () => ids.filter((id) => !env.gone[id]);
    const pack = () => ({ k: 'km', seq: S.seq, from: S.from, to: S.to, dur: S.dur, v: S.v, cnt: S.cnt, kicks: S.kicks, great: S.great, tries: S.tries, phase: S.phase, over: S.over, call: S.call });
    const cast = () => { hb = 1; send(env.others, pack()); };
    function fly(from, sp) { // リーダー：次の行き先と速さ（2.106.11 sp＝'f'速く／'s'ゆるく。蹴った人が選ぶ）
      if (alive().every((id) => (S.tries[id] || 0) >= MAXK)) { S.phase = 'over'; S.over = null; cast(); finish(); return; } // 3.24.0 全員が50回判定したら終わり
      // 3.24.0 判定の回数が少ない人へ送る（全員が同じ回数になるように）
      const pool = alive().filter((id) => id !== from), mn = pool.length ? Math.min(...pool.map((id) => S.tries[id] || 0)) : 0, cand = pool.filter((id) => (S.tries[id] || 0) === mn), to = cand.length ? cand[Math.floor(rng() * cand.length)] : from;
      const [lo, hi] = range(S.cnt), v = sp === 's' ? lo : sp === 'f' ? hi : lo + rng() * (hi - lo), a = unit(from), b = unit(to), dist = to === from ? 0.9 : Math.hypot(a[0] - b[0], a[1] - b[1]);
      S.seq++; S.from = from; S.to = to; S.v = r2(v); S.dur = Math.round(Math.max(150, (dist / v) * 1000 + 220)); S.phase = 'fly'; t0 = performance.now(); cast();
    }
    function apply(id, ok, gr, sp) { // リーダー：受けた人の結果
      if (S.phase !== 'fly' || id !== S.to) return;
      S.tries[id] = (S.tries[id] || 0) + 1; // 3.24.0 落としても終わらず、落とした人から上げ直す（案1）
      if (ok) { S.cnt++; S.kicks[id]++; if (gr) S.great[id]++; S.call = [id, S.cnt % 3]; swing[id] = callT = performance.now(); if (id !== me) kickSnd(); fly(id, sp); }
      else { S.call = null; fly(id, 's'); }
    }
    function judge(ok, gr, txt, sp) { judged = S.seq; fb = { txt, t: performance.now(), ok }; win = ok ? Math.max(WMIN, win * 0.97) : Math.min(WMAX, win * 1.08); /* 3.24.0 判定幅の自動調整（案2） */ if (ok) { swing[me] = performance.now(); kickSnd(); } if (lead) apply(me, ok, gr, sp); else send([cfg.lead], { k: 'kick', seq: S.seq, ok: ok ? 1 : 0, gr: gr ? 1 : 0, sp }); }
    function finish() {
      if (endT) return; endT = performance.now();
      setTimeout(() => {
        const rows = [`<b>成功 ${S.cnt}回</b>（ひとり${MAXK}回ずつ蹴り切りました）`].concat(ids.map((id) => `${esc(nameOf(env, id))}：${S.tries[id] || 0}回中 ${S.kicks[id] || 0}回成功${S.great[id] ? `（見事 ${S.great[id]}）` : ''}`));
        env.end({ title: 'みんなで蹴り切った！', rows, cmd: { type: 'partyResult', game: 'kemari', n: N, cnt: S.cnt, kicks: S.kicks[me] || 0 } });
      }, 1600);
    }
    return {
      msg(from, m) {
        if (lead) { if (m.k === 'kick' && m.seq === S.seq) apply(from, !!m.ok, !!m.gr, m.sp === 's' ? 's' : 'f'); return; }
        if (from !== cfg.lead || m.k !== 'km') return; rx = performance.now();
        if (m.seq !== S.seq) { t0 = performance.now(); if (m.call) { callT = performance.now(); if (m.call[0] !== me) { swing[m.call[0]] = callT; kickSnd(); } } }
        Object.assign(S, { seq: m.seq, from: m.from, to: m.to, dur: m.dur, v: m.v, cnt: m.cnt, kicks: m.kicks, great: m.great, tries: m.tries || S.tries, phase: m.phase, over: m.over, call: m.call });
        if (S.phase === 'over') finish();
      },
      update(dt) {
        ph += dt; const now = performance.now();
        if (S.phase === 'ready') { if (lead && (IN.aT || IN.bT)) { S.kicks[me]++; S.call = [me, 0]; swing[me] = callT = now; kickSnd(); fly(me, IN.bT && !IN.aT ? 's' : 'f'); } }
        else if (S.phase === 'fly' && S.to === me && judged !== S.seq) {
          const err = now - (t0 + S.dur);
          if (IN.aT || IN.bT) { const sp = IN.bT && !IN.aT ? 's' : 'f', how = sp === 's' ? '（ゆるく）' : '（速く）'; if (Math.abs(err) <= win) judge(true, Math.abs(err) <= GREAT, (Math.abs(err) <= GREAT ? '見事！' : err < 0 ? 'よし（少し早い）' : 'よし（少し遅い）') + how, sp); else judge(false, false, err < 0 ? '早すぎた…' : '遅れた…'); }
          else if (err > win) judge(false, false, '取りこぼした…');
        }
        if (lead) {
          if (S.phase === 'fly' && (env.gone[S.to] || now > t0 + S.dur + 4000)) { if (env.gone[S.to]) fly(S.from); else apply(S.to, false, false); }
          hb -= dt; if (hb <= 0) cast();
        } else if (S.phase !== 'over' && now - rx > 10000) env.end({ title: 'リーダーとの通信が切れました', rows: [], cmd: null });
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, cx = W0 / 2, cy = H0 * 0.53, R = Math.min(W0, H0) * 0.32, pr = Math.max(14, R * 0.12), now = performance.now();
        // 鞠庭：白砂と四隅の懸（かかり）の木（桜・柳・楓・松）
        g.fillStyle = '#5d7a46'; g.fillRect(0, 0, W0, H0);
        const sq = R * 1.55; g.fillStyle = '#ddd0ac'; g.fillRect(cx - sq, cy - sq, sq * 2, sq * 2);
        g.strokeStyle = 'rgba(160,140,100,.35)'; g.lineWidth = 1; for (let y = cy - sq + 8; y < cy + sq; y += 10) { g.beginPath(); g.moveTo(cx - sq, y); g.lineTo(cx + sq, y); g.stroke(); }
        [['#f4b8c8', '#e898ae', -1, -1], ['#9cc46a', '#7aa84e', 1, -1], ['#d8502e', '#b8381e', -1, 1], ['#2f5a34', '#234528', 1, 1]].forEach(([c1, c2, sx, sy]) => {
          const tx = cx + sx * sq * 0.86, ty = cy + sy * sq * 0.86; g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(tx + 6, ty + 8, R * 0.26, 0, 7); g.fill();
          for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? c1 : c2; g.beginPath(); g.arc(tx + Math.cos(k * 1.05) * R * 0.1, ty + Math.sin(k * 1.05) * R * 0.1, R * 0.15, 0, 7); g.fill(); }
        });
        g.strokeStyle = 'rgba(120,90,50,.25)'; g.lineWidth = 2; g.setLineDash([6, 8]); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke(); g.setLineDash([]);
        const P = (id) => { const u = unit(id); return [cx + u[0] * R, cy + u[1] * R]; };
        // 人（上から：肩・頭・烏帽子）
        ids.forEach((id, i) => {
          const [x, y] = P(id), a = Math.atan2(cy - y, cx - x), col = PAL[i % PAL.length], sw = swing[id] && now - swing[id] < 250 ? (now - swing[id]) / 250 : 0;
          g.save(); g.translate(x, y); g.rotate(a);
          if (sw) { g.strokeStyle = '#222'; g.lineWidth = pr * 0.28; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, pr * 0.3); g.lineTo(pr * (0.6 + Math.sin(sw * Math.PI) * 0.9), pr * 0.35); g.stroke(); }
          g.fillStyle = env.gone[id] ? '#777' : col; g.beginPath(); g.ellipse(0, 0, pr * 0.7, pr, 0, 0, 7); g.fill(); g.strokeStyle = '#0006'; g.lineWidth = 2; g.stroke();
          g.fillStyle = '#e8c9a0'; g.beginPath(); g.arc(pr * 0.05, 0, pr * 0.42, 0, 7); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(-pr * 0.1, 0, pr * 0.36, pr * 0.26, 0, 0, 7); g.fill();
          g.restore();
          const lx = cx + (x - cx) * 1.28, ly = cy + (y - cy) * 1.28 + 5; drawText(g, nameOf(env, id) + (id === me ? '（自分）' : ''), lx, ly, { sz: 13, al: 'center', c: col, b: id === me });
          if (S.call && S.call[0] === id && now - callT < 900 && S.phase !== 'ready') {
            const bw = 46, bx = x - bw / 2, by = y - pr - 34; g.fillStyle = '#fffaf0'; g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.beginPath(); if (g.roundRect) g.roundRect(bx, by, bw, 24, 10); else g.rect(bx, by, bw, 24); g.fill(); g.stroke();
            drawText(g, CALLS[S.call[1]], x, by + 18, { sz: 16, b: 1, al: 'center', c: '#2a1a10' });
          }
        });
        // 受ける人の足もとに縮んでいく輪（足もとの細い輪と重なった時が蹴る時）
        const frac = S.phase === 'fly' ? clamp((now - t0) / S.dur, 0, 1.25) : 0;
        if (S.phase === 'fly' && frac < 1.2) { const [tx, ty] = P(S.to), rr = pr * (1.05 + 2.4 * Math.max(0, 1 - frac)); g.strokeStyle = S.to === me ? '#f2c14e' : 'rgba(255,255,255,.7)'; g.lineWidth = S.to === me ? 4 : 2; g.beginPath(); g.arc(tx, ty, rr, 0, 7); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.beginPath(); g.arc(tx, ty, pr * 1.05, 0, 7); g.stroke(); }
        // 鞠（影は地面、鞠は高さぶん上に大きく）
        let bx, by, h = 0;
        if (S.phase === 'ready') { [bx, by] = P(S.from); bx += (cx - bx) * 0.12; by += (cy - by) * 0.12; h = Math.abs(Math.sin(ph * 3)) * 6; }
        else if (S.phase === 'over') { const [x, y] = P((S.over && S.over.id) || S.to); bx = x + (cx - x) * 0.18; by = y + (cy - y) * 0.18; }
        else {
          const [ax, ay] = P(S.from), [tx, ty] = P(S.to), f = Math.min(1, frac), self = S.from === S.to, bow = self ? 0.25 * Math.sin(f * Math.PI) : 0;
          bx = ax + (tx - ax) * f + (cx - ax) * bow; by = ay + (ty - ay) * f + (cy - ay) * bow; h = 4 * f * (1 - f) * R * (0.35 + 0.25 / Math.max(1, S.v));
          if (frac > 1) { const k = frac - 1; bx += (cx - tx) * k * 0.6; by += (cy - ty) * k * 0.6; }
        }
        const br = pr * 0.42 * (1 + (h / R) * 0.9), gy = by - h;
        g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(bx, by, pr * 0.42, pr * 0.28, 0, 0, 7); g.fill();
        g.fillStyle = '#fbf8ef'; g.beginPath(); g.arc(bx, gy, br, 0, 7); g.fill(); g.strokeStyle = '#b8a888'; g.lineWidth = 1.5; g.stroke();
        g.strokeStyle = '#8a3a5a'; g.lineWidth = 1.2; g.beginPath(); g.arc(bx, gy, br * 0.55, ph * 6, ph * 6 + 2.2); g.stroke(); g.beginPath(); g.arc(bx, gy, br * 0.55, ph * 6 + 3.14, ph * 6 + 5.3); g.stroke();
        // 上の表示
        const [lo, hi] = range(S.cnt);
        drawText(g, `成功 ${S.cnt}　自分 ${S.tries[me] || 0}／${MAXK}回`, cx, 40, { sz: 28, b: 1, al: 'center', c: '#fff2cc' });
        drawText(g, `鞠の速さ ${lo.toFixed(1)}〜${hi.toFixed(1)}${S.phase === 'fly' ? `（いま ${S.v.toFixed(1)}）` : ''}`, cx, 64, { sz: 14, al: 'center' });
        drawText(g, `${HF()}＝速く返す　${HS()}＝ゆるく返す`, cx, 84, { sz: 13, al: 'center', c: '#e8dcc0' }); // 2.106.11（3.24.0 操作の文字は機器に合わせる）
        if (S.phase === 'ready') drawText(g, lead ? `${HF()}で蹴り出す（${HS()}でゆるく）` :`${nameOf(env, cfg.lead)}が蹴り出すのを待っています`, cx, cy, { sz: 22, b: 1, al: 'center' });
        if (S.phase === 'fly' && S.to === me && judged !== S.seq) drawText(g, '蹴る！', cx, cy + R * 0.45, { sz: Math.round(30 + 10 * Math.max(0, frac - 0.6)), b: 1, al: 'center', c: frac > 0.8 ? '#ffd76a' : '#fff' });
        if (fb && now - fb.t < 1000) drawText(g, fb.txt, cx, cy - R * 0.3, { sz: 30, b: 1, al: 'center', c: fb.ok ? '#ffd76a' : '#ff8a7a' });
        if (S.phase === 'over') drawText(g, '鞠が落ちた！', cx, cy, { sz: 40, b: 1, al: 'center', c: '#ff8a7a' });
      },
    };
  }

  // =====================================================================
  // 2.68.0 囃子合わせ：和楽器のリズム遊び。曲は js/hayashi.js（楽器ごとのパート＝譜面）
  //  始める前に各自が楽器を選び、リーダーが曲と難しさを決める。自分のパートは叩いた時だけ鳴り、ほかの人・空いた楽器のパートは自動で鳴る
  //  譜面は上から流れて、下の拍子木の線に重なった時に打つ（A＝打：Space／Z／F、B＝縁：X／J）。判定は各自の端末
  // =====================================================================
  function hayashiGame(env) {
    const { cfg, me, g2: g, cv } = env, lead = cfg.lead === me, HY = SGK.HAYASHI, M = () => SGK.AUDIO && SGK.AUDIO.music;
    const GOOD = 0.05, OK = 0.11, WIN = 0.15;
    const st = { phase: 'pick', song: 0, diff: 1, picks: {} }; // picks[pid]＝楽器の id
    let doneQ = 0, chart = null, t0 = 0, a0 = 0, schedI = {}, mine = null, myInst = null, fx = [], combo = 0, maxCombo = 0, score = 0, cnt = { good: 0, ok: 0, miss: 0 }, sendT = 0, rx = performance.now(), endT = 0, startAt = 0;
    const others = {}; for (const id of env.ids) others[id] = { s: 0, good: 0, ok: 0, miss: 0, combo: 0 };
    const root = document.getElementById('ptGame'), box = document.createElement('div');
    box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#2a2118ee;color:#f3ead2;border:2px solid #a07c42;border-radius:10px;padding:12px 16px;max-width:92vw;max-height:86vh;overflow:auto;font-size:14px;z-index:2';
    root.appendChild(box);
    const instOf = (id) => HY.INST.find((x) => x.id === st.picks[id]);
    // 2.68.2 各自の設定（音量・譜の速さ）はこの端末に残す
    const DEFK = { a: ['f', 'j', ' '], b: ['d', 'k'] }, DEFP = { a: [0, 1, 6, 7], b: [2, 3, 4, 5] };
    const OPT = Object.assign({ my: 1, oth: 0.8, spd: 1, keys: { a: DEFK.a.slice(), b: DEFK.b.slice() }, pads: { a: DEFP.a.slice(), b: DEFP.b.slice() }, redTop: false }, (() => { try { return JSON.parse(localStorage.getItem('sgk-hayashi')) || {}; } catch (e) { return {}; } })());
    const saveOpt = () => { try { localStorage.setItem('sgk-hayashi', JSON.stringify(OPT)); } catch (e) {} };
    // 2.68.2 打つ操作：赤・白それぞれ2つずつ（キーボード 赤＝F・J・Space、白＝D・K／コントローラー 赤＝A・B・LT・RT、白＝X・Y・LB・RB／画面 左右に赤と白）。押すたびに数える（同じ色を2つで交互に打てる）
    const Q = [], hit = (k) => Q.push({ k, at: performance.now() });
    // 2.68.3 どのキー・ボタンで打つかは自分で決められる（「キーを足す」を押してから、使いたいキーかコントローラーのボタンを押す）
    let learn = null; // 'a'（赤）か 'b'（白）を覚え中
    const kname = (k) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k), PADN = { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'SELECT', 9: 'START', 10: 'L押込', 11: 'R押込', 12: '↑', 13: '↓', 14: '←', 15: '→' };
    const keyOf = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key), colorOfKey = (k) => (OPT.keys.a.includes(k) ? 'a' : OPT.keys.b.includes(k) ? 'b' : null), colorOfPad = (i) => (OPT.pads.a.includes(i) ? 'a' : OPT.pads.b.includes(i) ? 'b' : null);
    function assign(kind, v) { const L = kind === 'key' ? OPT.keys : OPT.pads; L.a = L.a.filter((x) => x !== v); L.b = L.b.filter((x) => x !== v); L[learn].push(v); learn = null; saveOpt(); drawPick(); }
    const onKey = (e) => {
      if (!root.isConnected) { removeEventListener('keydown', onKey, true); return; } const key = keyOf(e);
      if (learn) { if (key === 'Escape') { learn = null; drawPick(); } else assign('key', key); e.preventDefault(); e.stopPropagation(); return; }
      const k = colorOfKey(key); if (!k) return; e.preventDefault(); e.stopPropagation(); if (!e.repeat && st.phase === 'play') hit(k);
    };
    addEventListener('keydown', onKey, true);
    const padPrev = [];
    const pollPad = () => { const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((x) => x && x.connected); if (!gp) return; gp.buttons.forEach((b, i) => { const on = !!(b && b.pressed); if (on && !padPrev[i]) { if (learn) assign('pad', i); else { const k = colorOfPad(i); if (k && st.phase === 'play') hit(k); } } padPrev[i] = on; }); };
    const touch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), tcols = [];
    function makeTouch() {
      tcols.forEach((c) => c.remove()); tcols.length = 0; if (!touch) return;
      for (const side of ['left', 'right']) {
      const col = document.createElement('div'); col.style.cssText = `position:absolute;bottom:12px;${side}:10px;display:flex;flex-direction:column;gap:10px;z-index:1`; tcols.push(col);
      const two = [['b', '白', '#f3ead2', '#1a1a1a'], ['a', '赤', '#c8401e', '#fff']]; if (OPT.redTop) two.reverse();
      for (const [k, nm, bg, fg] of two) { const b = document.createElement('button'); b.textContent = nm; b.style.cssText = `width:38vw;height:84px;border-radius:18px;font-size:28px;font-weight:bold;background:${bg};color:${fg};border:3px solid #1a1a1a;opacity:.92;touch-action:none`; b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (st.phase === 'play') hit(k); b.style.filter = 'brightness(1.4)'; setTimeout(() => { b.style.filter = ''; }, 80); }); col.appendChild(b); }
      root.appendChild(col);
      }
    }
    makeTouch();
    function drawPick() {
      if (st.phase !== 'pick') { box.style.display = 'none'; return; } box.style.display = '';
      const used = Object.values(st.picks);
      box.innerHTML = `<div style="font-size:18px;color:#f2c14e;font-weight:bold;margin-bottom:6px">囃子合わせ</div>
<div>楽器を選ぶ（同じ楽器を何人で選んでもよい）</div><div>${HY.INST.map((x) => `<button data-hi="${x.id}" style="border-color:${x.c};${st.picks[me] === x.id ? 'background:#a0702e' : ''}">${x.n}${used.filter((u) => u === x.id).length ? `（${used.filter((u) => u === x.id).length}）` : ''}</button>`).join('')}</div>
<div style="margin-top:6px">${env.ids.map((id) => `${esc(nameOf(env, id))}：${instOf(id) ? instOf(id).n : '…'}`).join('　')}</div>
<div style="margin-top:8px">曲：${lead ? HY.SONGS.map((s, i) => `<button data-hs="${i}" ${st.song === i ? 'style="background:#a0702e"' : ''}>${s.name}</button>`).join('') : `<b>${HY.SONGS[st.song].name}</b>`}</div>
<div>難しさ：${lead ? HY.DIFF.map((d, i) => `<button data-hd="${i}" ${st.diff === i ? 'style="background:#a0702e"' : ''}>${d}</button>`).join('') : `<b>${HY.DIFF[st.diff]}</b>`}</div>
<div style="margin-top:8px">${lead ? `<button data-hgo="1" ${env.ids.every((id) => st.picks[id] || env.gone[id]) ? '' : 'disabled'}>始める</button>` : 'リーダーが始めるのを待っています'}</div>
<div style="margin-top:8px;display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;align-items:center">
<span>自分の楽器の音</span><input type="range" min="0" max="1.5" step="0.05" value="${OPT.my}" data-ho="my"><span>${Math.round(OPT.my * 100)}%</span>
<span>ほかの楽器の音</span><input type="range" min="0" max="1.5" step="0.05" value="${OPT.oth}" data-ho="oth"><span>${Math.round(OPT.oth * 100)}%</span>
<span>譜の流れる速さ</span><input type="range" min="0.5" max="2.5" step="0.1" value="${OPT.spd}" data-ho="spd"><span>${OPT.spd.toFixed(1)}倍</span></div>
<div style="margin-top:8px"><b>打つキー・ボタン</b>（「足す」を押してから、使いたいキーかコントローラーのボタンを押す。Escでやめる）
${['a', 'b'].map((c) => `<div style="margin-top:3px"><span style="color:${c === 'a' ? '#ff7a5a' : '#f3ead2'};font-weight:bold">${c === 'a' ? '赤' : '白'}</span>：${OPT.keys[c].map((k) => `<button data-hk="${c}|${encodeURIComponent(k)}" title="外す">${kname(k)} ✕</button>`).join('')}${OPT.pads[c].map((i) => `<button data-hp="${c}|${i}" title="外す">🎮${PADN[i] || '#' + i} ✕</button>`).join('')}<button data-hl="${c}" ${learn === c ? 'style="background:#a0702e"' : ''}>${learn === c ? 'キーかボタンを押して…' : '足す'}</button></div>`).join('')}
<div style="margin-top:3px">${touch ? `画面のボタン：<button data-ht="1">${OPT.redTop ? '赤が上・白が下' : '白が上・赤が下'}（押すと入れ替え）</button>` : ''}<button data-hr="1">元に戻す</button></div></div>
<div style="font-size:12px;color:#cdbf9a;margin-top:6px">赤い丸は赤、白い丸は白で打つ。下の線に重なった時に打つ</div>`;
    }
    box.oninput = (e) => { const k = e.target.dataset && e.target.dataset.ho; if (!k) return; OPT[k] = +e.target.value; saveOpt(); const sp = e.target.nextElementSibling; if (sp) sp.textContent = k === 'spd' ? `${OPT.spd.toFixed(1)}倍` : `${Math.round(OPT[k] * 100)}%`; };
    box.onchange = (e) => { const k = e.target.dataset && e.target.dataset.ho; if (k === 'my' && st.picks[me]) { const mu = M(); if (mu && mu.ok()) mu.play(st.picks[me], mu.now() + 0.02, 'a', 74, 0.3, 0.55 * OPT.my); } };
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.hl) { learn = learn === d.hl ? null : d.hl; drawPick(); return; }
      if (d.hk) { const [c, k] = d.hk.split('|'); OPT.keys[c] = OPT.keys[c].filter((x) => x !== decodeURIComponent(k)); saveOpt(); drawPick(); return; }
      if (d.hp) { const [c, i] = d.hp.split('|'); OPT.pads[c] = OPT.pads[c].filter((x) => x !== +i); saveOpt(); drawPick(); return; }
      if (d.ht) { OPT.redTop = !OPT.redTop; saveOpt(); makeTouch(); drawPick(); return; }
      if (d.hr) { OPT.keys = { a: DEFK.a.slice(), b: DEFK.b.slice() }; OPT.pads = { a: DEFP.a.slice(), b: DEFP.b.slice() }; OPT.redTop = false; saveOpt(); makeTouch(); drawPick(); return; }
      if (d.hi) { st.picks[me] = d.hi; if (lead) cast(); else send([cfg.lead], { k: 'hpick', inst: d.hi }); const mu = M(); if (mu && mu.ok()) { const L = HY.build(HY.SONGS[0], 2).notes[d.hi], na = L.find((n) => n.k === 'a') || L[0], nb = L.find((n) => n.k === 'b') || na; mu.play(d.hi, mu.now() + 0.02, 'a', na.m, 0.3, 0.55 * OPT.my); mu.play(d.hi, mu.now() + 0.4, 'b', nb.m, 0.3, 0.55 * OPT.my); } } // 選んだ楽器の音（赤・白）を鳴らす
      if (lead && d.hs) { st.song = +d.hs; cast(); } if (lead && d.hd) { st.diff = +d.hd; cast(); }
      if (lead && d.hgo) { st.phase = 'play'; startAt = Date.now() + 2500; cast(); begin(2500); }
      drawPick();
    };
    function cast() { send(env.others, { k: 'hst', song: st.song, diff: st.diff, picks: st.picks, phase: st.phase }); }
    function begin(ms) {
      chart = HY.build(HY.SONGS[st.song], st.diff); myInst = st.picks[me] || null;
      mine = myInst ? chart.notes.taiko.map((n) => Object.assign({ j: null }, n)) : []; // 2.99.6 全員同じ譜面（音だけ自分の楽器）
      const mu = M(); if (mu) mu.ok();
      t0 = performance.now() + ms; a0 = (mu ? mu.now() : 0) + ms / 1000; schedI = {}; drawPick();
    }
    const songT = () => (performance.now() - t0) / 1000;
    const players = () => env.ids.filter((id) => st.picks[id]);
    function judge(k, at) { // at＝押した時刻（performance.now）
      if (!mine || !mine.length) return; const t = (at - t0) / 1000; let best = null, bd = 9;
      for (const n of mine) { if (n.j) continue; const d = t - n.t; if (d < -WIN) break; if (Math.abs(d) < bd) { bd = Math.abs(d); best = n; } }
      if (!best || bd > WIN) return; // 遠すぎる空打ちは数えない
      const mu = M();
      if (best.k !== k || bd > OK) { best.j = 'miss'; cnt.miss++; combo = 0; fx.push({ t: 'ずれ', c: '#ff8a7a', at: performance.now() }); return; }
      best.j = bd <= GOOD ? 'good' : 'ok'; cnt[best.j]++; combo++; maxCombo = Math.max(maxCombo, combo);
      score += (best.j === 'good' ? 100 : 50) * (1 + Math.min(combo, 100) / 100);
      fx.push({ t: best.j === 'good' ? '良' : '可', c: best.j === 'good' ? '#ffd76a' : '#e0e0e0', at: performance.now(), hit: 1 });
      if (mu) mu.play(myInst, mu.now(), best.k, best.m, best.d, 0.55 * OPT.my);
    }
    function finish() {
      if (endT) return; endT = performance.now();
      const me0 = { s: Math.round(score), good: cnt.good, ok: cnt.ok, miss: cnt.miss }; others[me] = Object.assign(others[me], me0);
      const ps = players(), tot = ps.reduce((a, id) => { const o = others[id]; return [a[0] + o.good + o.ok * 0.5, a[1] + o.good + o.ok + o.miss]; }, [0, 0]), acc = tot[1] ? tot[0] / tot[1] : 0;
      const rank = acc >= 0.95 ? '雅' : acc >= 0.85 ? '秀' : acc >= 0.7 ? '良' : '可';
      env.end({ title: `${HY.SONGS[st.song].name}（${HY.DIFF[st.diff]}）　出来ばえ「${rank}」`, rows: [`みんなの合わせぐあい ${Math.round(acc * 100)}%`].concat(ps.map((id) => { const o = others[id]; return `${esc(nameOf(env, id))}（${instOf(id).n}）：${o.s}点　良${o.good}・可${o.ok}・不可${o.miss}`; })), cmd: myInst ? { type: 'partyResult', game: 'hayashi', n: ps.length, acc: r2(acc), diff: st.diff } : null });
    }
    return {
      msg(from, m) {
        if (m.k === 'hsc') { others[from] = Object.assign(others[from] || {}, m.v); return; }
        if (lead) { if (m.k === 'hpick' && st.phase === 'pick' && HY.INST.some((x) => x.id === m.inst)) { st.picks[from] = m.inst; cast(); drawPick(); } return; }
        if (from !== cfg.lead) return; rx = performance.now();
        if (m.k === 'hst') { const was = st.phase; st.song = m.song; st.diff = m.diff; st.picks = m.picks; st.phase = m.phase; if (was === 'pick' && st.phase === 'play') begin(2400); drawPick(); }
      },
      update() {
        if (st.phase === 'pick') { pollPad(); if (!box.innerHTML) drawPick(); if (lead) { sendT -= 0.016; if (sendT <= 0) { sendT = 1; cast(); } } else if (performance.now() - rx > 10000) env.end({ title: 'リーダーとの通信が切れました', rows: [], cmd: null }); return; }
        if (!chart) return; const t = songT(), mu = M();
        // 自動で鳴らすパート（自分以外の人の楽器・空いた楽器）と数えの拍子木を、少し先まで予約する
        if (mu) {
          const ahead = t + 0.25;
          if (schedI.cnt == null) schedI.cnt = 0; while (schedI.cnt < 4 && schedI.cnt * chart.beat < ahead) { mu.play('hyoshi', a0 + schedI.cnt * chart.beat, 'a', 0, 0, 0.6); schedI.cnt++; }
          for (const inst in chart.notes) {
            if (inst === 'taiko') continue; const L = chart.notes[inst]; let i = schedI[inst] || 0;
            while (i < L.length && L[i].t < ahead) { if (L[i].t >= t - 0.05) mu.play(inst, a0 + L[i].t, L[i].k, L[i].m, L[i].d, 0.45 * OPT.oth); i++; } schedI[inst] = i;
          }
        }
        pollPad(); while (Q.length) { const h = Q.shift(); judge(h.k, h.at); }
        for (const n of mine) { if (n.j) continue; if (t - n.t > OK) { n.j = 'miss'; cnt.miss++; combo = 0; fx.push({ t: '不可', c: '#ff8a7a', at: performance.now() }); } else break; }
        sendT -= 0.016; if (sendT <= 0) { sendT = 0.5; send(env.others, { k: 'hsc', v: { s: Math.round(score), good: cnt.good, ok: cnt.ok, miss: cnt.miss, combo } }); }
        if (t > chart.len && !doneQ) { doneQ = 1; send(env.others, { k: 'hsc', v: { s: Math.round(score), good: cnt.good, ok: cnt.ok, miss: cnt.miss, combo } }); setTimeout(finish, 1200); } /* 2.68.1 曲が終わったら1.2秒後に結果（前は終わらなかった） */
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, now = performance.now();
        const bg = g.createLinearGradient(0, 0, 0, H0); bg.addColorStop(0, '#141a33'); bg.addColorStop(1, '#2a1a10'); g.fillStyle = bg; g.fillRect(0, 0, W0, H0);
        for (let i = 0; i < 8; i++) { const x = ((i + 0.5) * W0) / 8, y = 26 + (i % 2) * 8; g.strokeStyle = '#0006'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 10); g.stroke(); g.fillStyle = i % 2 ? '#e0462c' : '#f0a030'; g.beginPath(); g.ellipse(x, y, 9, 12, 0, 0, 7); g.fill(); g.fillStyle = '#ffd76a55'; g.beginPath(); g.arc(x, y, 18, 0, 7); g.fill(); } // 提灯
        if (st.phase === 'pick' || !chart) return;
        const t = songT(), ps = myInst ? [me] : [], lw = Math.min(230, W0 * 0.6), totalW = lw * ps.length, x0 = (W0 - totalW) / 2, hitY = touch ? Math.min(H0 * 0.8, H0 - 215) : H0 * 0.8, pxs = H0 * (0.55 + st.diff * 0.15) * OPT.spd; // 1秒あたりの点（譜の速さの設定をかける）
        ps.forEach((id, li) => {
          const ins = instOf(id) || HY.INST[0], lx = x0 + li * lw, isMe = id === me, cx = lx + lw / 2;
          g.fillStyle = isMe ? '#ffffff14' : '#00000033'; g.fillRect(lx + 3, 50, lw - 6, H0 - 50); g.strokeStyle = ins.c + '88'; g.lineWidth = 2; g.strokeRect(lx + 3, 50, lw - 6, H0 - 50);
          drawText(g, ins.n, cx, 70, { sz: 16, b: 1, al: 'center', c: ins.c }); drawText(g, nameOf(env, id) + (isMe ? '（自分）' : ''), cx, 88, { sz: 11, al: 'center' });
          g.fillStyle = '#8a5a2a'; g.fillRect(lx + 6, hitY - 4, lw - 12, 8); g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.beginPath(); g.arc(cx, hitY, 20, 0, 7); g.stroke(); // 拍子木の線と打つ所
          const L = mine;
          for (const n of L) {
            const y = hitY - (n.t - t) * pxs; if (y < 40) break; if (y > H0 + 30) continue; if (isMe && n.j && n.j !== 'miss') continue; if (!isMe && n.t < t - 0.05) continue;
            const tail = n.d > 0.3 ? n.d * pxs : 0; if (tail) { g.fillStyle = ins.c + '55'; g.fillRect(cx - 6, y - tail, 12, tail); }
            const r = n.orn ? 9 : 15, miss = isMe && n.j === 'miss';
            if (n.k === 'a') { g.fillStyle = miss ? '#666' : '#d8401e'; g.beginPath(); g.arc(cx, y, r, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
            else { g.fillStyle = '#f3ead2'; g.beginPath(); g.arc(cx, y, r, 0, 7); g.fill(); g.strokeStyle = miss ? '#666' : '#1a1a1a'; g.lineWidth = 4; g.stroke(); }
          }
          if (!isMe) { const o = others[id] || {}; drawText(g, `${o.s || 0}点 ${o.combo ? o.combo + '連' : ''}`, cx, H0 - 12, { sz: 12, al: 'center' }); }
        });
        // 自分の判定と連打
        const meI = ps.indexOf(me); if (meI >= 0) {
          const cx = x0 + meI * lw + lw / 2;
          fx = fx.filter((f) => now - f.at < 600); for (const f of fx) { const k = (now - f.at) / 600; drawText(g, f.t, cx, hitY - 40 - k * 30, { sz: 26, b: 1, al: 'center', c: f.c }); if (f.hit) { g.strokeStyle = `rgba(255,215,106,${1 - k})`; g.lineWidth = 3; g.beginPath(); g.arc(cx, hitY, 20 + k * 30, 0, 7); g.stroke(); } }
          if (combo >= 5) drawText(g, `${combo} 連`, cx, hitY + 46, { sz: 22, b: 1, al: 'center', c: '#ffd76a' });
          drawText(g, `${Math.round(score)}点`, cx, H0 - 12, { sz: 16, b: 1, al: 'center' });
        }
        { const pl = players().slice().sort((a, b) => ((others[b] || {}).s || 0) - ((others[a] || {}).s || 0)); pl.forEach((id, i) => { const o = id === me ? { s: Math.round(score), combo } : others[id] || {}; drawText(g, `${esc(nameOf(env, id))}（${(instOf(id) || {}).n || ''}）${o.s || 0}点${o.combo ? ' ' + o.combo + '連' : ''}`, W0 - 12, 66 + i * 18, { sz: 13, al: 'right', c: id === me ? '#ffe9a0' : '#fff' }); }); }
        drawText(g, `${HY.SONGS[st.song].name}（${HY.DIFF[st.diff]}）`, 14, 66, { sz: 14 }); bar(g, 14, 74, 140, 6, t / chart.len, '#f2c14e');
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 80, b: 1, al: 'center' });
        if (!myInst) drawText(g, '見物中（楽器を選ばなかった）', W0 / 2, H0 * 0.45, { sz: 18, al: 'center' });
      },
    };
  }
})();
