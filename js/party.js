// 2.42.0 みんなで遊ぶミニゲーム：馬の障害レース／弓の的当て大会（どちらも個人戦・チーム戦）／荷運び競争（協力）
// 町の通りの「みんなで遊ぶ」から部屋を作り、同じ町にいる人を誘う。やりとりは忍びの協力任務と同じ中継（main.js の ninRelay、ch:'party'）を使う。
//  レース・弓：全員が同じ種（seed）で同じ障害物・的を出し、それぞれの端末で動かして、位置・点数だけ送り合う（順位は各端末で数える）
//  荷運び：部屋を作った人（リーダー）の端末が荷車を動かして全員に配る。報酬は sim/party.js の partyResult
// 絵は仮：馬・人・荷車・的は canvas で描いた簡単な形（あとで絵に置き換えやすいよう、描く関数を分けてある）
(function () {
  const SGK = window.SGK, PT = (SGK.PARTY = {});
  let ENV = null; // { me(), name(), others(), send(to, m), cmd(c) }
  PT.init = (e) => { ENV = e; };
  const GAMES = {
    race: { name: '馬の障害レース', max: 10, team: true, desc: '鬼の難しさの障害コース。ジャンプ＝A／Space（長押しで高く・すぐ離すと小さく）、ダッシュ＝↑／B（スタミナを使う）。高い柵は長押しで跳ぶ、枝の下は跳ばずにくぐる、大穴はダッシュで跳ばないと落ちて戻される、ぬかるみでは遅くなる' },
    archery: { name: '弓の的当て大会', max: 10, team: true, desc: '動く的を10本で射抜いて点を競う。風で矢が流れる。狙う＝マウス／矢印／スティック、射つ＝クリック／A／Space。金の的は2倍' },
    fish: { name: '釣り大会', max: 10, team: true, mode: true, desc: '朝・昼・夕の3日間（1日40秒）で釣りくらべ。釣り方はいつもの釣りと同じ（浮きを投げる→アタリ→タイミング）。勝ち方は「いちばん大きい魚」か「釣った数」を選べます' },
    hayashi: { name: '囃子合わせ', max: 5, team: false, desc: '和楽器のリズム遊び。太鼓・鼓・篠笛・三味線・鉦から楽器を選び、みんなで一つの曲を合わせる。流れてくる譜を下の線で打つ（赤＝F・J・Space、白＝D・K。画面では左右に赤と白のボタン）。自分のパートは叩いた音で鳴る' },
    hide: { name: 'かくれんぼ？', max: 5, team: false, opts: true, desc: '隠れる側は木箱・樽・壺などの置物に化けて、探す側から逃げ切る。隠れる側：Aで近くの物に化ける、Bで人に戻る。逃げる側は体力100で、叩かれるとダメージを受けて少しのあいだ足が速くなる。体力がなくなると鬼に担がれて（15秒以内に運べないとふりほどかれる）牢（紫の光・マップに12個）に入れられ、45秒たつと完全に負けるが、仲間が牢に近づいて1秒で救助できる（残り時間が半分を過ぎてから救助されると、次に吊るされたらすぐ負け。半分より前なら、次もまた45秒耐えられる。3回目はすぐ負け）（化けた物が大きいほど受けるダメージは少なく、小さいほど大きい）。探す側：Aで叩く（本物の置物を叩くと体力が減る）、Bで近くの置物に化けることもできる（Aで叩くと正体を現す）。最初の15秒は探す側は目をつぶって動けない。ときどき音がして、だれかの近くが分かる。勝ち方を「宝箱の鍵を集めて脱出」にすると、場面に7つある宝箱のそばで動かずにいると少しずつ開き（1人だと約80秒、人数が増えるほど早い。化けたままでは開けられない）、12秒ごとに出る4つの合図（A・B・X・Yのボタン。コントローラーはPS配置で ×=A ○=B □=X △=Y）を時間内に順に押さないと1秒だけ開けられなくなり、鬼に宝箱の場所が知らされる（鬼には宝箱が赤い枠で壁越しにも見える）。5つ開けると離れた2か所に鳥居の出口が現れ（このとき全員の位置が壁越しに見える）、出口に着いた人が脱出成功になります。鬼が2人捕まえたら引き分け、3人以上で鬼の勝ちです。逃げる側は◆の付いた物に化けられます。舞台・探す側の人数・化けたあとの動き・勝ち方・見つかったあとを選べます' },
    kemari: { name: '蹴鞠', max: 10, team: false, desc: '輪になって鞠を蹴り回す。鞠が自分に飛んできたら、足もとの輪に重なった瞬間に「蹴る」（クリック／タップ／A／Space）。続けるほど鞠は速くなる。毎月5日は大きな町で蹴鞠大会' },
    cart: { name: '荷運び競争', max: 10, team: true, desc: '荷車を引いてゴールまで運ぶ。←→で5本の道を選ぶ（みんなの平均で進む）、A／Spaceを押している間引く。岩にぶつかると荷が崩れる。「？」の箱で道具（加速・修理・守り、チーム戦では相手に岩落とし）が手に入り、B／X／クリックで使う。チーム戦は赤と白の荷車で競走' },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const TEAM = [{ n: '赤', c: '#e0463c' }, { n: '白', c: '#f2f2f2' }], PAL = ['#e0463c', '#3c8ce0', '#e0b43c', '#4cc06a', '#b46ae0', '#ee8a3c', '#3cc8c8', '#e06aa8', '#8a8a8a', '#7a5a3a'];
  const send = (to, m) => { if (ENV && to.length) ENV.send(to, Object.assign({ ch: 'party' }, m)); };

  // ---- 見た目（CSS） ----
  let css = false;
  function addCss() {
    if (css) return; css = true; const s = document.createElement('style');
    s.textContent = `#ptBox,#ptRes{position:fixed;inset:0;z-index:9300;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font-family:inherit}
#ptBox>div,#ptRes>div{max-height:92vh;overflow:auto;background:#2a2118;color:#f3ead2;border:2px solid #a07c42;border-radius:10px;padding:16px 20px;max-width:min(92vw,460px);box-shadow:0 8px 30px #000a}
#ptBox h2,#ptRes h2{margin:0 0 6px;color:#f2c14e;font-size:20px}#ptBox .d{font-size:13px;color:#cdbf9a;margin-bottom:8px}
#ptBox button,#ptRes button,#ptInv button,#ptGame .tb button{font:inherit;color:#f3ead2;background:linear-gradient(#5a3e22,#2e2012);border:1px solid #a07c42;border-radius:6px;padding:7px 12px;margin:3px 3px 0 0;cursor:pointer}
#ptBox button{display:block;width:100%;text-align:left;box-sizing:border-box}#ptBox .m{padding:3px 0;border-bottom:1px solid #fff2}#ptRes .r{padding:3px 0;border-bottom:1px solid #fff2}
#ptInv{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9400;background:#2a2118;color:#f3ead2;border:2px solid #f2c14e;border-radius:10px;padding:10px 14px;box-shadow:0 4px 18px #000a;max-width:92vw}
#ptGame{position:fixed;inset:0;z-index:9200;background:#000}#ptGame canvas{width:100%;height:100%;display:block;touch-action:none}
#ptGame .tb{position:absolute;right:8px;top:8px;z-index:5}#ptGame .pad{position:absolute;bottom:14px;display:none;gap:10px;z-index:5}
#ptGame .pad button{width:72px;height:72px;border-radius:36px;font-size:14px;opacity:.85;white-space:pre-line;touch-action:none}`;
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
  const myCh = () => { const c = chGet(), H = SGK.HIDE.CH; return { h: H.h.some((x) => x.k === c.h) ? c.h : H.h[0].k, s: H.s.some((x) => x.k === c.s) ? c.s : H.s[0].k }; };
  const chName = (r, k) => { const x = SGK.HIDE.CH[r].find((y) => y.k === k) || SGK.HIDE.CH[r][0]; return x.n; };
  const defOpts = () => { const o = {}; for (const op of SGK.HIDE.OPTS) o[op.k] = op.v[0][0]; return o; };
  const optTxt = (o) => SGK.HIDE.OPTS.map((op) => `${op.n}：${(op.v.find((x) => x[0] === o[op.k]) || op.v[0])[1]}`).join('　');
  function closeLobby(tell) { if (LB && tell && !LB.lead) send([LB.leader], { k: 'leave', rid: LB.rid }); if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: [], closed: 1 }); LB = null; const b = document.getElementById('ptBox'); if (b) b.remove(); }
  function pushMem() { if (LB && LB.lead) send(memIds(), { k: 'mem', rid: LB.rid, g: LB.g, mem: LB.mem, team: LB.team, mode: LB.mode, o: LB.o }); }
  function vwGet() { let v = 'tp'; try { v = localStorage.getItem('sgk-hide-vw') || 'tp'; } catch (er) {} return v === 'fp' ? v : 'tp'; }
  function pickHtml() { // 2.73.0 キャラ一覧（見た目・パッシブ・アクティブを見比べる）
    const r = LB.pk, L = SGK.HIDE.CH[r], cur = myCh()[r];
    return `<div><h2>${r === 'h' ? '逃げる時のキャラ' : '鬼の時のキャラ'}</h2><div class="d">選ぶと決まります</div><div style="max-height:62vh;overflow:auto">${L.map((x) => { const im = SGK.HIDE.preview(r, x.k); return `<button data-a="pk:${x.k}" style="display:flex;gap:8px;align-items:center;${x.k === cur ? 'background:#a0702e;' : ''}">${im ? `<img src="${im}" width="60" height="75" style="flex:none">` : ''}<span><b>${x.n}</b>${x.k === cur ? '（いま選んでいる）' : ''}<br><span style="font-size:12px;color:#cdbf9a">パッシブ：${x.pa}<br>スキル：${x.ac}（${x.cd}秒）</span></span></button>`; }).join('')}</div><div><button data-a="pkx">もどる</button></div></div>`;
  }
  function drawLobby() {
    if (!LB) return; const d = GAMES[LB.g], e = box('ptBox'), n = LB.mem.length;
    const list = LB.mem.map((x, i) => `<div class="m">${LB.team ? `<b style="color:${TEAM[i % 2].c}">${TEAM[i % 2].n}</b> ` : ''}${esc(x.name)}${x.id === LB.leader ? '（リーダー）' : ''}${d.opts && x.ch ? `<span style="font-size:12px;color:#cdbf9a">　逃げ：${chName('h', x.ch.h)}／鬼：${chName('s', x.ch.s)}</span>` : ''}</div>`).join('');
    e.innerHTML = LB.pk ? pickHtml() : `<div><h2>${d.name}</h2><div><button data-a="desc">ゲーム説明${LB.desc ? '（閉じる）' : ''}</button></div>${LB.desc ? `<div class="d">${esc(d.desc)}</div>` : ''}<div>参加者 ${n}/${d.max}人${LB.team ? '（チーム戦：交互に赤・白）' : ''}${d.opts && LB.o ? `<div style="font-size:13px;color:#cdbf9a">${optTxt(LB.o)}</div>` : ''}${d.mode ? `　勝ち方：${LB.mode === 'big' ? '大物（いちばん大きい魚）' : '数（釣った数）'}` : ''}</div>${list}
      ${d.opts ? (() => { const c = myCh(), H = SGK.HIDE.CH, a = H.h.find((x) => x.k === c.h), b = H.s.find((x) => x.k === c.s); return `<div style="margin-top:6px;font-size:12px;color:#cdbf9a"><b>逃げる時：${a.n}</b>　${a.pa}／${a.ac}<br><b>鬼の時：${b.n}</b>　${b.pa}／${b.ac}</div><div><button data-a="ch:h">逃げる時のキャラを選ぶ</button><button data-a="ch:s">鬼の時のキャラを選ぶ</button><button data-a="vw">視点：${({ tp: '三人称（うしろから）', fp: '一人称' })[vwGet()]}（変える）</button></div>`; })() : ''}
      <div style="margin-top:8px">${LB.lead ? `<button data-a="inv">同じ町の人を誘う</button>${d.team ? `<button data-a="team">${LB.team ? '個人戦にする' : 'チーム戦にする'}</button>` : ''}${d.mode ? '<button data-a="mode">勝ち方を変える</button>' : ''}${d.opts && LB.o ? SGK.HIDE.OPTS.map((op) => `<button data-a="o:${op.k}">${op.n}を変える</button>`).join('') : ''}${n >= 2 ? '<button data-a="go">出発する</button>' : ''}<button data-a="solo">ひとりで練習（報酬なし）</button>` : '<div class="d">リーダーが出発すると始まります</div>'}<button data-a="close">${LB.lead ? 'やめる' : '抜ける'}</button></div></div>`;
    try { if (typeof setFocus === 'function') setFocus(e, currentFocus(e)); } catch (er) {} // 2.69.2 作り直してもコントローラーの選択を保つ
    e.onclick = (ev) => {
      const b = ev.target.closest('button[data-a]'); if (!b || !LB) return; const a = b.dataset.a;
      if (a === 'inv') { const to = ENV.others().map((x) => x.id); send(to, { k: 'inv', g: LB.g, rid: LB.rid, nm: ENV.name(), team: LB.team, mode: LB.mode, o: LB.o }); b.textContent = to.length ? `${to.length}人に声をかけた` : '同じ町にほかの人がいません'; }
      else if (a === 'team') { LB.team = !LB.team; pushMem(); drawLobby(); }
      else if (a === 'mode') { LB.mode = LB.mode === 'big' ? 'num' : 'big'; pushMem(); drawLobby(); }
      else if (a.startsWith('o:') && LB.lead && LB.o) { const op = SGK.HIDE.OPTS.find((x) => x.k === a.slice(2)); if (op) { const i = op.v.findIndex((x) => x[0] === LB.o[op.k]); LB.o[op.k] = op.v[(i + 1) % op.v.length][0]; pushMem(); drawLobby(); } }
      else if (a === 'ch:h' || a === 'ch:s') { LB.pk = a.slice(3); drawLobby(); }
      else if (a === 'vw') { try { localStorage.setItem('sgk-hide-vw', vwGet() === 'tp' ? 'fp' : 'tp'); } catch (er) {} drawLobby(); }
      else if (a === 'desc') { LB.desc = !LB.desc; drawLobby(); }
      else if (a === 'pkx') { LB.pk = null; drawLobby(); }
      else if (a.startsWith('pk:') && LB.pk) { const r = LB.pk, c = myCh(); c[r] = a.slice(3); LB.pk = null; try { localStorage.setItem('sgk-hide-ch', JSON.stringify(c)); } catch (er) {} const x = LB.mem.find((y) => y.id === ENV.me()); if (x) x.ch = c; if (LB.lead) pushMem(); else send([LB.leader], { k: 'pick', rid: LB.rid, ch: c }); drawLobby(); }
      else if (a === 'go') startRoom(false);
      else if (a === 'solo') startRoom(true);
      else closeLobby(true);
    };
  }
  function startRoom(solo) {
    const seed = (Math.random() * 1e9) | 0, mem = (solo ? [LB.mem[0]] : LB.mem).map((x, i) => ({ id: x.id, name: x.name, tm: i % 2, ch: x.ch || null }));
    const cfg = { g: LB.g, seed, mem, team: !solo && LB.team, lead: LB.leader, solo, mode: LB.mode, o: LB.o };
    if (!solo) send(memIds(), { k: 'go', rid: LB.rid, cfg });
    closeLobby(false); startGame(cfg);
  }
  function showInvite(from, m) {
    if (RUN || !GAMES[m.g]) return; addCss(); const e = box('ptInv'); clearTimeout(invT);
    e.innerHTML = `<b>${esc(m.nm)}</b>が『${GAMES[m.g].name}』${m.team ? '（チーム戦）' : ''}の仲間を募っています <button data-a="y">参加する</button><button data-a="n">閉じる</button>`;
    e.onclick = (ev) => { const b = ev.target.closest('button[data-a]'); if (!b) return; e.remove(); if (b.dataset.a !== 'y') return; if (LB) closeLobby(true); LB = { g: m.g, rid: m.rid, lead: false, leader: from, mem: [], team: !!m.team, mode: m.mode || 'big', o: m.o || null }; send([from], { k: 'join', rid: m.rid, nm: ENV.name(), ch: myCh() }); drawLobby(); };
    invT = setTimeout(() => { if (e.parentNode) e.remove(); }, 60000);
  }

  PT.recv = (from, m) => {
    if (!ENV || !m) return;
    if (m.k === 'inv') return showInvite(from, m);
    if (m.k === 'join') { if (LB && LB.lead && m.rid === LB.rid && LB.mem.length < GAMES[LB.g].max && !LB.mem.some((x) => x.id === from)) { LB.mem.push({ id: from, name: m.nm, ch: m.ch || null }); pushMem(); drawLobby(); } return; }
    if (m.k === 'pick') { if (LB && LB.lead && m.rid === LB.rid) { const x = LB.mem.find((y) => y.id === from); if (x) { x.ch = m.ch; pushMem(); drawLobby(); } } return; }
    if (m.k === 'leave') { if (LB && LB.lead && m.rid === LB.rid) { LB.mem = LB.mem.filter((x) => x.id !== from); pushMem(); drawLobby(); } return; }
    if (m.k === 'mem') { if (LB && !LB.lead && m.rid === LB.rid) { if (m.closed) { closeLobby(false); ENV.toast && ENV.toast('部屋がなくなりました'); } else { LB.mem = m.mem; LB.team = !!m.team; LB.mode = m.mode || 'big'; if (m.o) LB.o = m.o; drawLobby(); } } return; }
    if (m.k === 'go') { if (LB && !LB.lead && m.rid === LB.rid && !RUN) { closeLobby(false); startGame(m.cfg); } return; }
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
    addEventListener('keydown', (e) => { if (!RUN) return; const k = map[e.key]; if (!k) return; e.preventDefault(); if (!IN[k] && !e.repeat) { if (k === 'a') { IN.aT = 1; IN.aAt = performance.now(); } if (k === 'b') { IN.bT = 1; IN.bAt = performance.now(); } if (k === 'c') IN.cT = 1; if (k === 'l') IN.lT = 1; if (k === 'r') IN.rT = 1; } IN[k] = 1; });
    addEventListener('keyup', (e) => { if (!RUN) return; const k = map[e.key]; if (k) { e.preventDefault(); IN[k] = 0; } });
  }
  let padC = false, padA = false, padB = false, padL = false, padR = false;
  function readPad() {
    const gp = (navigator.getGamepads ? navigator.getGamepads() : []).find((g) => g && g.connected); if (!gp) return { x: 0, y: 0 };
    const x = Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, y = Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0, a = !!(gp.buttons[0] && gp.buttons[0].pressed), b = !!(gp.buttons[2] && gp.buttons[2].pressed || gp.buttons[1] && gp.buttons[1].pressed);
    const l = x < -0.5 || !!(gp.buttons[14] && gp.buttons[14].pressed), r = x > 0.5 || !!(gp.buttons[15] && gp.buttons[15].pressed);
    if (a && !padA) IN.aT = 1; if (b && !padB) IN.bT = 1; padB = b; if (l && !padL) IN.lT = 1; if (r && !padR) IN.rT = 1; { const cc = !!(gp.buttons[3] && gp.buttons[3].pressed); if (cc && !padC) IN.cT = 1; padC = cc; } padA = a; padL = l; padR = r; IN.pa = a; IN.pb = b; IN.pu = y < -0.5 || !!(gp.buttons[12] && gp.buttons[12].pressed);
    return { x, y };
  }
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
    if (touch) { pl.style.display = pr.style.display = 'flex'; pl.style.left = '14px'; pr.style.right = '14px'; if (cfg.g === 'cart') { mkBtn(pl, '←', 'l'); mkBtn(pl, '→', 'r'); mkBtn(pr, '使う', 'b'); mkBtn(pr, '引く', 'a'); } else if (cfg.g === 'race') { mkBtn(pl, 'ダッシュ', 'b'); mkBtn(pr, 'ジャンプ', 'a'); } else if (cfg.g === 'fish') mkBtn(pr, '釣る', 'a'); else if (cfg.g === 'hide') { mkBtn(pl, '戻る', 'b'); mkBtn(pl, 'スキル', 'c'); mkBtn(pr, '化ける\n叩く', 'a'); } else if (cfg.g === 'kemari') mkBtn(pr, '蹴る', 'a'); else if (cfg.g === 'hayashi') { /* 2.68.2 囃子合わせは自分でボタンを置く */ } else mkBtn(pr, '射つ', 'a'); }
    const ptr = (e) => { const r = cv.getBoundingClientRect(); IN.mx = (e.clientX - r.left) * cv.width / r.width; IN.my = (e.clientY - r.top) * cv.height / r.height; };
    cv.addEventListener('pointermove', ptr); cv.addEventListener('pointerdown', (e) => { ptr(e); if (cfg.g === 'archery' || cfg.g === 'cart') IN.click = 1; else if (cfg.g === 'fish' || cfg.g === 'kemari') IN.aT = 1; });
    const env = { cfg, me, ids: cfg.mem.map((x) => x.id), names: Object.fromEntries(cfg.mem.map((x) => [x.id, x.name])), tm: Object.fromEntries(cfg.mem.map((x) => [x.id, x.tm])), others: cfg.mem.map((x) => x.id).filter((id) => id !== me), cv, g2, finished: false, gone: {}, IN, send, pal: PAL, text: drawText };
    const game = { race: raceGame, archery: archeryGame, cart: cartGame, fish: fishGame, kemari: kemariGame, hayashi: hayashiGame, hide: (e) => SGK.HIDE.make(e) }[cfg.g](env);
    let raf = 0, last = performance.now(); const stop = () => { cancelAnimationFrame(raf); removeEventListener('resize', onR); try { if (game.dispose) game.dispose(); } catch (er) {} root.remove(); RUN = null; for (const k of ['l', 'r', 'u', 'd', 'a', 'b', 'c']) IN[k] = 0; };
    RUN = { g: cfg.g, on: (from, m) => { if (m.k === 'quit') { env.gone[from] = 1; } if (game.msg) game.msg(from, m); } };
    env.end = (res) => { if (env.finished) return; env.finished = true; showResult(env, res, () => stop()); };
    root.querySelector('button[data-a="quit"]').onclick = () => { send(env.others, { k: 'quit' }); stop(); };
    const loop = (t) => {
      raf = requestAnimationFrame(loop); const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
      const pd = readPad(); env.pad = pd; IN.dash = IN.b || IN.u || IN.r || IN.pb || IN.pu; IN.pull = IN.a || IN.pa;
      try { if (!env.finished) game.update(dt); game.draw(); } catch (e) { console.error(e); stop(); return; }
      IN.aT = IN.bT = IN.cT = IN.lT = IN.rT = IN.click = 0;
    };
    raf = requestAnimationFrame(loop);
  }
  function showResult(env, res, close) { // res＝{ title, rows:[html], cmd }
    const e = box('ptRes'); e.innerHTML = `<div><h2>${esc(res.title)}</h2>${res.rows.map((r) => `<div class="r">${r}</div>`).join('')}<div style="margin-top:8px"><button data-a="ok">閉じる</button></div></div>`;
    if (res.cmd && !env.cfg.solo) ENV.cmd(res.cmd);
    e.querySelector('button').onclick = () => { e.remove(); close(); };
  }
  const nameOf = (env, id) => env.names[id] || '？';
  const tcol = (env, id) => (env.cfg.team ? TEAM[env.tm[id]].c : PAL[env.ids.indexOf(id) % PAL.length]);
  function drawText(g, s, x, y, o) { o = o || {}; g.font = (o.b ? 'bold ' : '') + (o.sz || 16) + 'px sans-serif'; g.textAlign = o.al || 'left'; g.fillStyle = o.c || '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(s, x, y); g.fillText(s, x, y); }

  // ---- 馬・人の絵（仮） ----
  function drawHorse(g, x, y, sc, col, ph, air) { // x,y＝足もと
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; const sw = air ? 0.9 : Math.sin(ph) * 0.8;
    for (const [lx, a] of [[-14, 0], [-10, Math.PI], [10, Math.PI * 0.5], [14, Math.PI * 1.5]]) { g.beginPath(); g.moveTo(lx, -20); g.lineTo(lx + Math.sin(ph + a) * 9 * (air ? 0.6 : 1) + (air ? (lx > 0 ? 8 : -8) : 0), -2 - (air ? 6 : Math.max(0, Math.cos(ph + a)) * 5)); g.stroke(); }
    g.fillStyle = '#8a5a30'; g.beginPath(); g.ellipse(0, -26, 20, 10, sw * 0.05, 0, 7); g.fill();
    g.beginPath(); g.moveTo(14, -30); g.lineTo(26, -44); g.lineTo(34, -40); g.lineTo(28, -30); g.closePath(); g.fill();
    g.fillStyle = '#3a2410'; g.fillRect(14, -42, 4, 12);
    g.fillStyle = col; g.fillRect(-6, -42, 12, 16); g.beginPath(); g.arc(0, -48, 6, 0, 7); g.fill(); g.restore();
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
    const { cfg, me, g2: g, cv } = env, rng = mulberry(cfg.seed), LEN = 800, obs = [];
    // 2.66.0 鬼の難しさ：障害が詰まり、組み合わせで来る。高い柵（長押しで大跳び）・枝（跳ぶと当たる）・大穴（ダッシュで跳ばないと落ちて戻される）・ぬかるみ（遅くなる）
    const add = (x, type) => obs.push({ x, type, hit: false });
    for (let x = 35; x < LEN - 40;) {
      const p = x / LEN, r = rng(), k = Math.floor(rng() * (p < 0.3 ? 6 : 9));
      if (k === 0) add(x, 'fence'); else if (k === 1) add(x, 'hurdle'); else if (k === 2) add(x, 'ditch'); else if (k === 3) add(x, 'branch'); else if (k === 4) add(x, 'pit');
      else if (k === 5) { add(x, 'mud'); add(x + 6.2, 'hurdle'); x += 6; } // ぬかるみを出てすぐ柵
      else if (k === 6) { add(x, 'hurdle'); add(x + 6.5, 'branch'); x += 7; } // 小さく跳んでから、くぐる
      else if (k === 7) { add(x, 'fence'); add(x + 9, 'fence'); x += 9; } // 柵が続く
      else { add(x, 'branch'); add(x + 4, 'ditch'); add(x + 13, 'pit'); x += 14; } // くぐって、堀、大穴
      x += 9 + r * 11 * (1 - p * 0.5);
    }
    const W = { fence: 1, hurdle: 1, ditch: 4, pit: 10, branch: 1.5, mud: 6 }, H = { fence: 1.4, hurdle: 0.6, ditch: 0.5, pit: 0.3 };
    const P = {}; for (const id of env.ids) P[id] = { x: 0, y: 0, stun: 0, fin: null, dx: 0, dy: 0 };
    const s = P[me]; let t = -3, vy = 0, v = 0, stam = 1, poseT = 0, firstFin = null, ph = 0;
    const rank = () => { const a = env.ids.slice(); a.sort((p, q) => { const A = P[p], B = P[q]; if (A.fin != null && B.fin != null) return A.fin - B.fin; if (A.fin != null) return -1; if (B.fin != null) return 1; return B.x - A.x; }); return a; };
    function finishAll() {
      const rk = rank(), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows;
      if (cfg.team) { const pts = [0, 0]; rk.forEach((id, i) => { pts[env.tm[id]] += n - i; }); team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose';
        rows = [`<b>チーム戦　赤 ${pts[0]}点 ― 白 ${pts[1]}点　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`]; }
      else rows = [];
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${P[id].fin != null ? P[id].fin.toFixed(1) + '秒' : '走り切れず'}`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'race', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = P[from]; if (!o) return; if (m.k === 'p') { o.x = m.x; o.y = m.y; o.stun = m.s; } else if (m.k === 'fin') { o.fin = m.t; o.x = LEN; if (firstFin == null) firstFin = t; } },
      update(dt) {
        t += dt; if (t < 0) return; ph += dt * (6 + v * 0.5);
        const dash = IN.dash && stam > 0.05 && s.stun <= 0; let target = dash ? 17.5 : 13; if (s.stun > 0) { s.stun -= dt; target = 4.5; }
        if (s.y <= 0.001 && obs.some((o) => o.type === 'mud' && s.x > o.x && s.x < o.x + W.mud)) target = Math.min(target, dash ? 8 : 5.5); // ぬかるみ
        if (s.fin != null) target = 0; v += (target - v) * Math.min(1, dt * 3); stam = clamp(stam + (dash ? -0.38 : 0.18) * dt, 0, 1); s.x += v * dt;
        if (IN.aT && s.y <= 0.001 && s.fin == null) vy = 9.2; if (vy > 3 && !IN.pull) vy = 3; // すぐ離すと小さく跳ぶ
        vy -= 24 * dt; s.y += vy * dt; if (s.y <= 0) { s.y = 0; vy = 0; }
        for (const o of obs) {
          if (o.hit || o.type === 'mud') continue;
          if (s.x > o.x && s.x < o.x + W[o.type]) {
            const bad = o.type === 'branch' ? s.y > 0.35 : s.y <= H[o.type];
            if (bad) { o.hit = true; if (o.type === 'pit') { s.stun = 1.6; v = 0; s.x = o.x - 18; vy = 0; s.y = 0; o.hit = false; /* 落ちたら戻されて、跳び直し */ } else { s.stun = 1.3; v *= 0.3; } }
          } else if (s.x >= o.x + W[o.type]) o.hit = true;
        }
        if (s.x >= LEN && s.fin == null) { s.fin = t; send(env.others, { k: 'fin', t: r1(t) }); if (firstFin == null) firstFin = t; }
        poseT -= dt; if (poseT <= 0) { poseT = 0.1; send(env.others, { k: 'p', x: r1(s.x), y: r2(s.y), s: s.stun > 0 ? 1 : 0 }); }
        for (const id of env.ids) if (id !== me) { const o = P[id]; o.dx += (o.x - o.dx) * Math.min(1, dt * 12); o.dy += (o.y - o.dy) * Math.min(1, dt * 12); }
        const alive = env.ids.filter((id) => !env.gone[id]), allFin = alive.every((id) => P[id].fin != null);
        if (allFin || (firstFin != null && t > firstFin + 15) || t > 150) finishAll();
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, ppm = W0 / 34, n = env.ids.length, rowH = Math.min(120, (H0 * 0.78) / n), top = H0 * 0.14, camX = s.x - 7;
        g.fillStyle = '#9fd0f0'; g.fillRect(0, 0, W0, H0); g.fillStyle = '#6fae56'; g.fillRect(0, top + 20, W0, H0);
        env.ids.forEach((id, i) => {
          const y0 = top + i * rowH + rowH * 0.82, me0 = id === me, o = P[id], x = me0 ? s.x : o.dx, yy = me0 ? s.y : o.dy;
          g.fillStyle = i % 2 ? '#7bbd62' : '#6fae56'; g.fillRect(0, y0 - rowH * 0.8, W0, rowH); g.strokeStyle = '#fff6'; g.beginPath(); g.moveTo(0, y0 + 2); g.lineTo(W0, y0 + 2); g.stroke();
          for (const ob of obs) { const px = (ob.x - camX) * ppm; if (px < -80 || px > W0 + 80) continue;
            if (ob.type === 'ditch') { g.fillStyle = '#4a3320'; g.fillRect(px, y0 - 3, W.ditch * ppm, 7); }
            else if (ob.type === 'pit') { g.fillStyle = '#1a0f08'; g.fillRect(px, y0 - 4, W.pit * ppm, 12); g.fillStyle = '#5a3a20'; g.fillRect(px - 4, y0 - 6, 6, 8); g.fillRect(px + W.pit * ppm - 2, y0 - 6, 6, 8); }
            else if (ob.type === 'mud') { g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(px + W.mud * ppm / 2, y0, W.mud * ppm / 2, 6, 0, 0, 7); g.fill(); }
            else if (ob.type === 'branch') { const by = y0 - 0.55 * ppm * 0.9 - 14; g.fillStyle = '#5a3a1a'; g.fillRect(px - 4, by - rowH * 0.5, 8, rowH * 0.5); g.fillRect(px - 4, by, W.branch * ppm + 8, 7); g.fillStyle = '#3f7a2a'; g.beginPath(); g.arc(px + W.branch * ppm, by, 10, 0, 7); g.fill(); }
            else { g.fillStyle = ob.type === 'fence' ? '#8b5a2b' : '#b08040'; const hh = H[ob.type] * ppm * 0.9 + 8; g.fillRect(px, y0 - hh, 6, hh); g.fillRect(px - 6, y0 - hh, 18, 5); } }
          const gx = (LEN - camX) * ppm; g.fillStyle = '#fff'; g.fillRect(gx, y0 - rowH * 0.8, 6, rowH); // ゴール
          drawHorse(g, (x - camX) * ppm, y0 - yy * ppm * 0.9, Math.min(1.1, rowH / 85), tcol(env, id), me0 ? ph : (x * 0.9), yy > 0.05);
          drawText(g, nameOf(env, id), (x - camX) * ppm, y0 - rowH * 0.62 - yy * ppm * 0.9, { sz: 13, al: 'center', c: tcol(env, id) });
        });
        const pr = clamp(s.x / LEN, 0, 1); g.fillStyle = '#0008'; g.fillRect(20, 14, W0 - 40, 10); env.ids.forEach((id) => { g.fillStyle = tcol(env, id); g.beginPath(); g.arc(20 + clamp((id === me ? s.x : P[id].x) / LEN, 0, 1) * (W0 - 40), 19, id === me ? 7 : 5, 0, 7); g.fill(); });
        bar(g, 20, 32, 140, 10, stam, '#f2c14e'); drawText(g, 'スタミナ', 168, 42, { sz: 12 });
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 90, b: 1, al: 'center' }); else if (t < 0.8) drawText(g, 'スタート！', W0 / 2, H0 / 2, { sz: 60, b: 1, al: 'center' });
        void pr;
      },
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
        if (Math.abs(lx - cx) > 0.5) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.4; g.setLineDash([1.5, 1.5]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(lx, cy); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(cx, cy, 0.7, 0, 7); g.fill(); } // 狙った所から、風で流される先へ g.strokeStyle = '#1a1a1a'; g.lineWidth = 0.6; g.beginPath(); g.arc(lx, cy, 3, 0, 7); g.moveTo(lx - 5, cy); g.lineTo(lx + 5, cy); g.moveTo(lx, cy - 5); g.lineTo(lx, cy + 5); g.stroke(); g.restore();
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
  // 釣り大会：朝・昼・夕の3日間（1日40秒）。勝ち方は mode='big'（いちばん大きい魚）か 'num'（釣った数）
  // =====================================================================
  // いつもの釣り（gather.js の釣り場の場面）をそのまま使い、結果だけここで数える。魚は生き物図鑑（SGK.DATA.creatures）の魚から出る
  function fishGame(env) {
    const { cfg, me, g2: g, cv } = env, DAY = 40, DN = ['朝', '昼', '夕'], big = cfg.mode !== 'num';
    const RW = { ありふれた: 10, 見かける: 6, 珍しい: 3, 稀少: 1.2, '幻のような': 0.4 }, LIST = ((SGK.DATA && SGK.DATA.creatures) || []).filter((c) => c.k === 'f'), TW = LIST.reduce((a, c) => a + (RW[c.r] || 1), 0);
    const S = {}; for (const id of env.ids) S[id] = { n: 0, best: 0, bn: '', done: false }; const m0 = S[me];
    let t = -2, busy = false, msg = '', msgT = 0, doneAt = null, dayShown = -1, over = false, catchImg = null; // 2.59.2 釣れた魚の絵（assets/creatures/〇〇.webp）
    const IMG = {}; const fishImg = (id) => { if (!IMG[id]) { const im = new Image(); im.src = `assets/creatures/${id}.webp?v=${SGK.VERSION}`; IMG[id] = im; } return IMG[id]; };
    const pick = () => { let r = Math.random() * TW; for (const c of LIST) { r -= RW[c.r] || 1; if (r <= 0) return c; } return LIST[0]; };
    function cast() {
      if (busy || !LIST.length || !SGK.GATHERUI || !SGK.GATHERUI.party) return; const sp = pick(), frac = (Math.random() + Math.random()) / 2; busy = true; catchImg = null; fishImg(sp.id); /* 先に読んでおく */
      SGK.GATHERUI.party({ n: -1, k: 'f', id: sp.id, d: sp.d, r: sp.r, fr: frac }, (q) => {
        busy = false; if (q < 0) { msg = 'やめた'; msgT = 1.5; return; }
        const thr = ((SGK.DATA.gatherDiff || {})[sp.d] || { thr: 0.6 }).thr; if (q < thr) { msg = '逃げられた…'; msgT = 2; return; }
        const sz = Math.round((sp.sz[0] + (sp.sz[1] - sp.sz[0]) * frac) * 10) / 10; m0.n++; const rec = sz > m0.best; if (rec) { m0.best = sz; m0.bn = sp.n; }
        msg = `${sp.n}（${sz}cm）を釣った！${rec && m0.n > 1 ? ' 自己ベスト！' : ''}`; msgT = 3; catchImg = fishImg(sp.id); send(env.others, { k: 'f', n: m0.n, b: m0.best, bn: m0.bn });
      });
    }
    function finishAll() {
      if (over) return; over = true; if (SGK.GATHERUI && SGK.GATHERUI.stop) SGK.GATHERUI.stop();
      const key = (x) => (big ? x.best : x.n), rk = env.ids.slice().sort((a, b) => key(S[b]) - key(S[a]) || S[b].n - S[a].n), n = rk.length, myRank = rk.indexOf(me) + 1; let team = null, rows = [];
      const lab = (x) => (big ? (x.best ? `${x.bn} ${x.best}cm` : '釣れず') : `${x.n}匹`) + (big ? `（${x.n}匹）` : x.best ? `（最大 ${x.best}cm）` : '');
      if (cfg.team) { const pts = [0, 0]; for (const id of env.ids) { const o = S[id], tt = env.tm[id]; pts[tt] = big ? Math.max(pts[tt], o.best) : pts[tt] + o.n; } const u = big ? 'cm' : '匹';
        team = pts[0] === pts[1] ? 'draw' : (pts[0] > pts[1] ? 0 : 1) === env.tm[me] ? 'win' : 'lose'; rows.push(`<b>チーム戦（${big ? '各チームの最大' : '合計'}）　赤 ${pts[0]}${u} ― 白 ${pts[1]}${u}　${pts[0] === pts[1] ? '引き分け' : pts[0] > pts[1] ? '赤の勝ち' : '白の勝ち'}</b>`); }
      rk.forEach((id, i) => rows.push(`${i + 1}位　<b style="color:${tcol(env, id)}">${esc(nameOf(env, id))}</b>　${lab(S[id])}`));
      env.end({ title: cfg.team ? (team === 'win' ? 'チームの勝ち！' : team === 'lose' ? 'チームの負け…' : '引き分け') : `${myRank}位`, rows, cmd: { type: 'partyResult', game: 'fish', n, rank: myRank, team } });
    }
    return {
      msg(from, m) { const o = S[from]; if (!o) return; if (m.k === 'f') { o.n = m.n; o.best = m.b; o.bn = m.bn; } else if (m.k === 'done') { o.n = m.n; o.best = m.b; o.bn = m.bn; o.done = true; } },
      update(dt) {
        t += dt; if (t < 0) return; msgT -= dt;
        const day = Math.min(2, Math.floor(t / DAY)); if (day !== dayShown) { dayShown = day; if (!busy) { msg = `${day + 1}日目（${DN[day]}）`; msgT = 2; } }
        if (t >= DAY * 3) { if (!m0.done && !busy) { m0.done = true; doneAt = t; send(env.others, { k: 'done', n: m0.n, b: m0.best, bn: m0.bn }); } if (busy && t > DAY * 3 + 25 && SGK.GATHERUI.stop) SGK.GATHERUI.stop(); }
        else if (!busy && IN.aT) cast();
        const alive = env.ids.filter((id) => !env.gone[id]);
        if (alive.every((id) => S[id].done) || t > DAY * 3 + 40) finishAll(); // 2.59.2 全員の最後の結果（done）がそろうまで待つ（前は自分が終わって15秒で決めていたので、相手の最後の1匹が入らず、二人とも1位になることがあった）。相手が釣りの途中なら+25秒で止まる
      },
      draw() {
        const W0 = cv.width, H0 = cv.height, day = clamp(Math.floor(Math.max(0, t) / DAY), 0, 2), sky = ['#bfe3f5', '#8fcdf2', '#f4b27a'][day];
        g.fillStyle = sky; g.fillRect(0, 0, W0, H0 * 0.45); g.fillStyle = '#6fae56'; g.fillRect(0, H0 * 0.38, W0, H0 * 0.1); g.fillStyle = '#3d7fb0'; g.fillRect(0, H0 * 0.48, W0, H0);
        g.fillStyle = day === 2 ? '#ff9a3c' : '#fff6a0'; g.beginPath(); g.arc(W0 * (0.2 + day * 0.3), H0 * 0.14, 30, 0, 7); g.fill();
        const rem = Math.max(0, DAY - (Math.max(0, t) - day * DAY)); drawText(g, `${day + 1}日目（${DN[day]}）　残り ${Math.ceil(rem)}秒`, 16, 30, { sz: 20, b: 1 }); bar(g, 16, 40, 160, 8, rem / DAY, '#f2c14e');
        drawText(g, `${m0.n}匹　最大 ${m0.best ? m0.bn + ' ' + m0.best + 'cm' : '―'}`, 16, 74, { sz: 17 }); drawText(g, big ? '勝ち方：大物' : '勝ち方：数', 16, 98, { sz: 14, c: '#f2c14e' });
        env.ids.forEach((id, i) => drawText(g, `${nameOf(env, id)}${S[id].done ? '（終了）' : ''}`, W0 - 16, 30 + i * 20, { sz: 15, al: 'right', c: tcol(env, id) })); // 2.60.5 ほかの人の釣果は結果発表まで見せない（名前と終わったかだけ）
        if (msgT > 0 && catchImg && catchImg.complete && catchImg.naturalWidth) { // 2.59.2 釣れた魚の絵を、言葉の下に出す
          const sc = Math.min(260 / catchImg.naturalWidth, (H0 * 0.32) / catchImg.naturalHeight), w = catchImg.naturalWidth * sc, h = catchImg.naturalHeight * sc;
          g.save(); g.globalAlpha = Math.min(1, msgT * 2); g.fillStyle = 'rgba(255,248,230,.85)'; g.beginPath(); g.ellipse(W0 / 2, H0 * 0.38 + h / 2 + 10, w / 2 + 26, h / 2 + 18, 0, 0, 7); g.fill();
          g.drawImage(catchImg, W0 / 2 - w / 2, H0 * 0.38 + 10, w, h); g.restore();
        }
        if (msgT <= 0) catchImg = null;
        if (msgT > 0) drawText(g, msg, W0 / 2, H0 * 0.34, { sz: 30, b: 1, al: 'center' });
        else if (!busy && t >= 0 && t < DAY * 3) drawText(g, 'A／Space／タップで釣りを始める', W0 / 2, H0 * 0.6, { sz: 20, al: 'center' });
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
    const CS = Array.from({ length: NC }, mkC), PS = {}; for (const id of env.ids) PS[id] = { lane: 2, pull: 0, stam: 1, c: team ? env.tm[id] : 0 };
    const myC = PS[me] ? PS[me].c : 0;
    let snapT = 0, inT = 0, lastLane = 2, ph = 0, rx = performance.now(), T = -3, over = 0, useQ = 0; const flash = [0, 0], msg = [null, null];
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
    function stepCart(ci, dt) {
      const C = CS[ci]; if (C.end) { C.v *= 0.9; return; }
      const mem = env.ids.filter((id) => !env.gone[id] && PS[id].c === ci); let pull = 0, lanes = 0;
      for (const id of mem) { const q = PS[id]; if (q.pull && q.stam > 0.02) { pull++; q.stam = clamp(q.stam - 0.4 * dt, 0, 1); } else q.stam = clamp(q.stam + 0.25 * dt, 0, 1); lanes += q.lane; }
      const ln = mem.length ? lanes / mem.length : 2; C.lane += (Math.round(ln) - C.lane) * Math.min(1, dt * 8);
      let target = pull ? 3 + 13 * (pull / Math.max(1, mem.length)) : 0.6; if (C.boost > 0) { C.boost -= dt; target = target * 1.5 + 5; } if (C.stun > 0) { C.stun -= dt; target *= 0.3; }
      C.v += (target - C.v) * Math.min(1, dt * 2.2); C.d += C.v * dt; C.t += dt;
      const L = Math.round(C.lane);
      for (const o of C.obs.concat(C.atk)) if (!o.hit && C.d >= o.d) { o.hit = true; if (o.lanes.includes(L)) { if (C.shield) { C.shield = 0; say(ci, '守りで岩を防いだ！'); } else { C.load = Math.max(0, C.load - 0.17); C.stun = 1; C.v *= 0.3; C.hits++; flash[ci] = 0.4; } } }
      items.forEach((it, k) => { if (!C.got.includes(k) && C.d >= it.d && C.d - it.d < 8) { if (it.lane === L) { C.got.push(k); const pool = team ? ['boost', 'boost', 'repair', 'shield', 'rock', 'rock'] : ['boost', 'boost', 'repair', 'shield']; C.item = pool[(Math.random() * pool.length) | 0]; say(ci, `${CART_IT[C.item].n}を手に入れた！`); } else if (C.d - it.d > 4) C.got.push(k); } });
      if (C.d >= LEN) { C.end = 1; C.fin = C.t; } else if (C.load <= 0) C.end = 2;
    }
    function snap() { send(env.others, { k: 'snap', T: r1(T), over, cs: CS.map((C) => ({ d: r1(C.d), v: r1(C.v), load: r2(C.load), t: r1(C.t), st: C.stun > 0 ? r2(C.stun) : 0, lane: r2(C.lane), hits: C.hits, item: C.item, bo: C.boost > 0 ? r1(C.boost) : 0, sh: C.shield, end: C.end, fin: C.fin, got: C.got, atk: C.atk.map((o) => [r1(o.d), o.lanes[0], o.hit ? 1 : 0]), hit: C.obs.filter((o) => o.hit).length })), ps: Object.fromEntries(env.ids.map((id) => [id, [PS[id].lane, PS[id].pull, r2(PS[id].stam)]])), msg }); }
    return {
      msg(from, m) {
        if (lead) { const p = PS[from]; if (p && m.k === 'in') { p.lane = clamp(m.lane | 0, 0, LN - 1); p.pull = m.pull ? 1 : 0; if (m.use) useItem(p.c); } return; }
        if (from !== cfg.lead || m.k !== 'snap') return; rx = performance.now(); T = m.T;
        m.cs.forEach((s, i) => { const C = CS[i]; if (!C) return; if (s.hits > C.hits) flash[i] = 0.4; Object.assign(C, { d: s.d, v: s.v, load: s.load, t: s.t, stun: s.st, lane: s.lane, hits: s.hits, item: s.item, boost: s.bo, shield: s.sh, end: s.end, fin: s.fin, got: s.got }); C.atk = s.atk.map(([d, l, h]) => ({ d, lanes: [l], hit: !!h })); C.obs.forEach((o, k) => { o.hit = k < s.hit; }); });
        for (const id in m.ps) if (PS[id]) { PS[id].lane = m.ps[id][0]; PS[id].pull = m.ps[id][1]; PS[id].stam = m.ps[id][2]; }
        m.msg.forEach((x, i) => { if (x && (!msg[i] || msg[i].t !== x.t)) say(i, x.t); });
        if (m.over && !over) { over = m.over; result(); }
      },
      update(dt) {
        ph += dt; flash[0] -= dt; flash[1] -= dt;
        const p = PS[me]; if (p) { if (IN.lT) p.lane = clamp(p.lane - 1, 0, LN - 1); if (IN.rT) p.lane = clamp(p.lane + 1, 0, LN - 1); p.pull = IN.pull ? 1 : 0; if (IN.bT || IN.click) useQ = 1; }
        if (!lead) { inT -= dt; if (p && (inT <= 0 || p.lane !== lastLane || useQ)) { inT = 0.1; lastLane = p.lane; send([cfg.lead], { k: 'in', lane: p.lane, pull: p.pull, use: useQ }); useQ = 0; } if (performance.now() - rx > 8000) env.end({ title: 'リーダーとの通信が切れました', rows: [], cmd: null }); return; }
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
      env.ids.filter((id) => PS[id].c === ci).forEach((id, i, arr) => { const q = PS[id], px = cxp + (i - (arr.length - 1) / 2) * 28, py = cy - 50 - (q.pull ? 6 : 0); drawMan(g, px, py + 24, 0.85, team ? TEAM[ci].c : PAL[env.ids.indexOf(id) % PAL.length], ph * (2 + C.v * 0.5) + i, q.pull); });
      // 左上：荷・道のり・速さ（数字と目盛り。速さで色が変わる）
      const hx = x0v + 12, sp = Math.max(0, C.v), spc = sp > 14 ? '#f2c14e' : sp > 8 ? '#9ad46a' : sp > 3 ? '#e0e0e0' : '#e07a6a';
      if (team) drawText(g, `${TEAM[ci].n}の荷車${ci === myC ? '（味方）' : ''}`, hx, 48, { sz: 16, b: 1, c: TEAM[ci].c });
      drawText(g, `荷 ${Math.round(C.load * 100)}%`, hx, 72, { sz: 18, b: 1 }); bar(g, hx, 78, 130, 9, C.load, '#c9a15a');
      drawText(g, `道のり ${Math.round(clamp(C.d / LEN, 0, 1) * 100)}%`, hx, 104, { sz: 14 }); bar(g, hx, 110, 130, 6, C.d / LEN, '#fff');
      drawText(g, `速さ ${sp.toFixed(1)}`, hx, 140, { sz: 26, b: 1, c: spc }); bar(g, hx, 148, 130, 12, sp / 25, spc);
      drawText(g, sp > 14 ? 'ぐんぐん！' : sp > 8 ? 'すいすい' : sp > 3 ? 'のろのろ' : C.stun > 0 ? '止まった！' : '引いて！', hx, 178, { sz: 14, c: spc });
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
    const WIN = 220, GREAT = 70, CALLS = ['アリ', 'ヤア', 'オウ'];
    const S = { seq: 0, from: cfg.lead, to: cfg.lead, dur: 0, v: 0, cnt: 0, kicks: {}, great: {}, phase: 'ready', over: null, call: null };
    ids.forEach((id) => { S.kicks[id] = 0; S.great[id] = 0; });
    let t0 = performance.now(), judged = 0, fb = null, rx = performance.now(), hb = 0, endT = 0, callT = 0, ph = 0;
    const swing = {}, myI = Math.max(0, ids.indexOf(me));
    const kickSnd = () => { try { SGK.AUDIO.sfx('kmrKick'); } catch (e) {} };
    const ang = (id) => Math.PI / 2 + ((ids.indexOf(id) - myI) * 2 * Math.PI) / N; // 自分がいちばん手前
    const unit = (id) => (N === 1 ? [0, 1] : [Math.cos(ang(id)), Math.sin(ang(id))]);
    const range = (c) => [Math.min(4, 0.9 + c * 0.035), Math.min(6, 1.5 + c * 0.06)]; // 鞠の速さの下限・上限（輪の半径／秒）。続けるほど上がる
    const alive = () => ids.filter((id) => !env.gone[id]);
    const pack = () => ({ k: 'km', seq: S.seq, from: S.from, to: S.to, dur: S.dur, v: S.v, cnt: S.cnt, kicks: S.kicks, great: S.great, phase: S.phase, over: S.over, call: S.call });
    const cast = () => { hb = 1; send(env.others, pack()); };
    function fly(from) { // リーダー：次の行き先と速さ
      const pool = alive().filter((id) => id !== from), to = pool.length ? pool[Math.floor(rng() * pool.length)] : from;
      const [lo, hi] = range(S.cnt), v = lo + rng() * (hi - lo), a = unit(from), b = unit(to), dist = to === from ? 0.9 : Math.hypot(a[0] - b[0], a[1] - b[1]);
      S.seq++; S.from = from; S.to = to; S.v = r2(v); S.dur = Math.round(Math.max(380, (dist / v) * 1000 + 220)); S.phase = 'fly'; t0 = performance.now(); cast();
    }
    function apply(id, ok, gr) { // リーダー：受けた人の結果
      if (S.phase !== 'fly' || id !== S.to) return;
      if (ok) { S.cnt++; S.kicks[id]++; if (gr) S.great[id]++; S.call = [id, S.cnt % 3]; swing[id] = callT = performance.now(); if (id !== me) kickSnd(); fly(id); }
      else { S.phase = 'over'; S.over = { id }; cast(); finish(); }
    }
    function judge(ok, gr, txt) { judged = S.seq; fb = { txt, t: performance.now(), ok }; if (ok) { swing[me] = performance.now(); kickSnd(); } if (lead) apply(me, ok, gr); else send([cfg.lead], { k: 'kick', seq: S.seq, ok: ok ? 1 : 0, gr: gr ? 1 : 0 }); }
    function finish() {
      if (endT) return; endT = performance.now();
      setTimeout(() => {
        const rows = [`<b>続けた回数 ${S.cnt}回</b>${S.over && S.over.id ? `　（${esc(nameOf(env, S.over.id))}が落とした）` : ''}`].concat(ids.map((id) => `${esc(nameOf(env, id))}：蹴った ${S.kicks[id] || 0}回${S.great[id] ? `（見事 ${S.great[id]}）` : ''}`));
        env.end({ title: S.cnt >= 50 ? 'お見事！ 鞠はなかなか落ちなかった' : '鞠が落ちた', rows, cmd: { type: 'partyResult', game: 'kemari', n: N, cnt: S.cnt, kicks: S.kicks[me] || 0 } });
      }, 1600);
    }
    return {
      msg(from, m) {
        if (lead) { if (m.k === 'kick' && m.seq === S.seq) apply(from, !!m.ok, !!m.gr); return; }
        if (from !== cfg.lead || m.k !== 'km') return; rx = performance.now();
        if (m.seq !== S.seq) { t0 = performance.now(); if (m.call) { callT = performance.now(); if (m.call[0] !== me) { swing[m.call[0]] = callT; kickSnd(); } } }
        Object.assign(S, { seq: m.seq, from: m.from, to: m.to, dur: m.dur, v: m.v, cnt: m.cnt, kicks: m.kicks, great: m.great, phase: m.phase, over: m.over, call: m.call });
        if (S.phase === 'over') finish();
      },
      update(dt) {
        ph += dt; const now = performance.now();
        if (S.phase === 'ready') { if (lead && IN.aT) { S.kicks[me]++; S.call = [me, 0]; swing[me] = callT = now; kickSnd(); fly(me); } }
        else if (S.phase === 'fly' && S.to === me && judged !== S.seq) {
          const err = now - (t0 + S.dur);
          if (IN.aT) { if (Math.abs(err) <= WIN) judge(true, Math.abs(err) <= GREAT, Math.abs(err) <= GREAT ? '見事！' : err < 0 ? 'よし（少し早い）' : 'よし（少し遅い）'); else judge(false, false, err < 0 ? '早すぎた…' : '遅れた…'); }
          else if (err > WIN) judge(false, false, '取りこぼした…');
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
        drawText(g, `続けた回数 ${S.cnt}`, cx, 40, { sz: 28, b: 1, al: 'center', c: '#fff2cc' });
        drawText(g, `鞠の速さ ${lo.toFixed(1)}〜${hi.toFixed(1)}${S.phase === 'fly' ? `（いま ${S.v.toFixed(1)}）` : ''}`, cx, 64, { sz: 14, al: 'center' });
        if (S.phase === 'ready') drawText(g, lead ? '「蹴る」で蹴り出す' : `${nameOf(env, cfg.lead)}が蹴り出すのを待っています`, cx, cy, { sz: 22, b: 1, al: 'center' });
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
      mine = myInst ? chart.notes[myInst].map((n) => Object.assign({ j: null }, n)) : [];
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
            if (inst === myInst) continue; const L = chart.notes[inst]; let i = schedI[inst] || 0;
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
        const t = songT(), ps = players().length ? players() : [me], lw = Math.min(150, (W0 * 0.9) / Math.max(ps.length, 1)), totalW = lw * ps.length, x0 = (W0 - totalW) / 2, hitY = touch ? Math.min(H0 * 0.8, H0 - 215) : H0 * 0.8, pxs = H0 * (0.55 + st.diff * 0.15) * OPT.spd; // 1秒あたりの点（譜の速さの設定をかける）
        ps.forEach((id, li) => {
          const ins = instOf(id) || HY.INST[0], lx = x0 + li * lw, isMe = id === me, cx = lx + lw / 2;
          g.fillStyle = isMe ? '#ffffff14' : '#00000033'; g.fillRect(lx + 3, 50, lw - 6, H0 - 50); g.strokeStyle = ins.c + '88'; g.lineWidth = 2; g.strokeRect(lx + 3, 50, lw - 6, H0 - 50);
          drawText(g, ins.n, cx, 70, { sz: 16, b: 1, al: 'center', c: ins.c }); drawText(g, nameOf(env, id) + (isMe ? '（自分）' : ''), cx, 88, { sz: 11, al: 'center' });
          g.fillStyle = '#8a5a2a'; g.fillRect(lx + 6, hitY - 4, lw - 12, 8); g.strokeStyle = '#f2c14e'; g.lineWidth = 2; g.beginPath(); g.arc(cx, hitY, 20, 0, 7); g.stroke(); // 拍子木の線と打つ所
          const L = isMe ? mine : chart.notes[ins.id];
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
        drawText(g, `${HY.SONGS[st.song].name}（${HY.DIFF[st.diff]}）`, 14, 66, { sz: 14 }); bar(g, 14, 74, 140, 6, t / chart.len, '#f2c14e');
        if (t < 0) drawText(g, String(Math.ceil(-t)), W0 / 2, H0 / 2, { sz: 80, b: 1, al: 'center' });
        if (!myInst) drawText(g, '見物中（楽器を選ばなかった）', W0 / 2, H0 * 0.45, { sz: 18, al: 'center' });
      },
    };
  }
})();
