// 画面の流れ・入力（キーボード／マウス／コントローラー／タッチ）・ホストのループ
(function () {
  const $ = (id) => document.getElementById(id);
  const SIM = SGK.SIM, CFG = SGK.CFG, R = SGK.RENDER;
  const G = { mode: 'title', world: null, net: null, myPid: null, stat: null, dyn: null, view: null, disp: {}, selected: null, speed: 1, roomCode: null };
  window.SGK_G = G; // デバッグ用

  // ---------- 端末ごとの識別子（参加し直しても同じ武将に戻れる） ----------
  let token = localStorage.getItem('sgk_token');
  if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('sgk_token', token); }
  $('nameInput').value = localStorage.getItem('sgk_name') || '';
  const myName = () => { const n = $('nameInput').value.trim().slice(0, 12) || '浪人'; localStorage.setItem('sgk_name', n); return n; };

  // ---------- 共通UI ----------
  $('verLabel').textContent = 'ver ' + SGK.VERSION;
  $('updateBtn').onclick = () => { location.href = location.pathname + '?v=' + Date.now(); };
  function toast(text, ms = 3000) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
  function titleMsg(text) { $('titleMsg').textContent = text || ''; }
  function show(id) { ['title', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); if (id === 'game') requestAnimationFrame(() => R.resize($('map'))); }

  // ---------- メニュー操作（キー・コントローラー：押した方向へ移動／決定してもカーソル位置は保つ） ----------
  const focusMem = {};
  function activeMenu() {
    if (G.mode === 'title') return !$('createPanel').classList.contains('hidden') ? $('createPanel') : !$('slotPanel').classList.contains('hidden') ? $('slotPanel') : !$('friendPanel').classList.contains('hidden') ? $('friendPanel') : !$('namePanel').classList.contains('hidden') ? $('namePanel') : $('joinPanel').classList.contains('hidden') ? $('titleMenu') : $('joinPanel');
    if (!$('gameMenu').classList.contains('hidden')) return $('gameMenu');
    if (!$('char').classList.contains('hidden')) return $('char');
    if (!$('town').classList.contains('hidden')) return $('town');
    if (!$('battle').classList.contains('hidden')) return $('battle');
    if (!$('captive').classList.contains('hidden')) return $('captive');
    return null;
  }
  function menuButtons(m) { return [...m.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent); }
  function setFocus(m, b) { menuButtons(m).forEach((x) => x.classList.toggle('focus', x === b)); focusMem[m.id] = b ? b.id || b.textContent : null; }
  function currentFocus(m) {
    const bs = menuButtons(m);
    return bs.find((b) => b.classList.contains('focus')) || bs.find((b) => (b.id || b.textContent) === focusMem[m.id]) || bs[0];
  }
  function navMenu(dx, dy, m = activeMenu()) {
    if (!m) return false;
    const bs = menuButtons(m); if (!bs.length) return true;
    const cur = currentFocus(m); const cr = cur.getBoundingClientRect();
    const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = null, bs2 = Infinity;
    for (const b of bs) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect(); const vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy;
      const along = vx * dx + vy * dy; if (along <= 2) continue;
      const side = Math.abs(vx * dy - vy * dx); const score = along + side * 2;
      if (score < bs2) { bs2 = score; best = b; }
    }
    setFocus(m, best || cur);
    return true;
  }
  function pressMenu() { const m = activeMenu(); if (!m) return false; const b = currentFocus(m); if (b) { setFocus(m, b); b.click(); } return true; }
  document.addEventListener('mouseover', (e) => { const m = activeMenu(); if (m && e.target.tagName === 'BUTTON' && m.contains(e.target)) setFocus(m, e.target); });

  // ---------- タイトル ----------
  // ---------- セーブスロット（new：新しく作る／load：続きから／import：ファイルを読み込む） ----------
  let slotMode = 'load', slotConfirm = null, importWorld = null;
  const contBtn = () => { $('btnContinue').disabled = !SGK.SAVE.has(); };
  SGK.SAVE.ready.then(contBtn); contBtn();
  function renderSlots() {
    const T = { new: '新しいワールドを作るスロットを選んでください', load: '続きから遊ぶスロットを選んでください', import: '読み込んだセーブを入れるスロットを選んでください' };
    $('slotTitle').textContent = T[slotMode];
    $('slotList').innerHTML = SGK.SAVE.slots().map(({ n, meta: m }) => {
      const desc = m ? `${SIM.formatDate(m.min)}　${(m.names || []).join('・').replace(/[<&]/g, '')}<br><span class="muted">保存 ${new Date(m.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}　ver ${m.ver || '?'}</span>` : '<span class="muted">空き</span>';
      const cf = slotConfirm === n;
      let btns = '';
      if (slotMode === 'load') btns = `<button id="sl-${n}" data-slot="${n}" ${m ? '' : 'disabled'}>続きから</button>` + (m ? `<button id="sd-${n}" data-sdel="${n}">${slotConfirm === -n ? '本当に削除' : '削除'}</button>` : '');
      else btns = `<button id="sl-${n}" data-slot="${n}">${m ? (cf ? '本当に上書き' : '上書き') : slotMode === 'new' ? 'ここに作る' : 'ここに入れる'}</button>`;
      return `<div class="card"><div><b>スロット${n}</b>　${desc}</div><div class="row">${btns}</div></div>`;
    }).join('');
  }
  function openSlots(mode) {
    slotMode = mode; slotConfirm = null; renderSlots();
    $('slotPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden');
    const first = [...$('slotList').querySelectorAll('button:not([disabled])')][0]; setFocus($('slotPanel'), first || $('btnSlotBack'));
  }
  $('btnSlotBack').onclick = () => { importWorld = null; titleBack(); };
  $('slotList').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const keep = (id) => { renderSlots(); const nb = $(id); if (nb) setFocus($('slotPanel'), nb); };
    if (b.dataset.sdel) {
      const n = +b.dataset.sdel;
      if (slotConfirm !== -n) { slotConfirm = -n; return keep(b.id); }
      await SGK.SAVE.remove(n); slotConfirm = null; titleMsg(`スロット${n}を削除しました`); contBtn(); return keep(b.id);
    }
    const n = +b.dataset.slot, used = SGK.SAVE.slots()[n - 1].meta;
    if (slotMode !== 'load' && used && slotConfirm !== n) { slotConfirm = n; return keep(b.id); }
    if (slotMode === 'load') {
      try {
        const r = await SGK.SAVE.load(n); if (!r) return titleMsg('このスロットのセーブが読めませんでした');
        titleBack(); startHost(r.world, r.from === 'main' ? `スロット${n}の続きから再開しました` : 'セーブが読めなかったので、バックアップから再開しました');
      } catch (err) { titleMsg(err.message); }
      return;
    }
    if (used) await SGK.SAVE.remove(n);
    SGK.SAVE.slot = n;
    const w = slotMode === 'import' ? importWorld : SIM.createWorld(Math.floor(Math.random() * 2 ** 31));
    importWorld = null; titleBack();
    startHost(w, slotMode === 'import' ? `セーブファイルをスロット${n}に読み込みました` : `スロット${n}に新しいワールドを作りました`);
  });
  $('btnNew').onclick = () => openSlots('new');
  $('btnContinue').onclick = () => openSlots('load');
  // 年の表示（和暦／西暦／両方）を切り替える。押すたびに次の形式へ（カーソルはその場に残る）
  const YEAR_FMTS = [['era', '和暦'], ['ad', '西暦'], ['both', '和暦＋西暦']];
  SIM.yearFmt = YEAR_FMTS.some(([k]) => k === localStorage.getItem('sgk_yearfmt')) ? localStorage.getItem('sgk_yearfmt') : 'era';
  const yearLabel = () => { const n = YEAR_FMTS.find(([k]) => k === SIM.yearFmt)[1]; document.querySelectorAll('.yearBtn').forEach((b) => { b.textContent = `年の表示：${n}`; }); };
  const cycleYear = () => {
    const i = YEAR_FMTS.findIndex(([k]) => k === SIM.yearFmt);
    SIM.yearFmt = YEAR_FMTS[(i + 1) % YEAR_FMTS.length][0]; localStorage.setItem('sgk_yearfmt', SIM.yearFmt); yearLabel();
  };
  yearLabel();
  $('btnYear').onclick = cycleYear;
  $('mYear').onclick = cycleYear;
  $('btnImport').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) SGK.SAVE.importFile(f).then((w) => { importWorld = w; openSlots('import'); }).catch((err) => titleMsg(err.message)); };
  $('btnJoin').onclick = () => { $('joinPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); $('codeInput').focus(); };
  // 部屋コードの文字ボタン（コントローラーでも入力できる）
  const CL = SGK.NET.CODE_LEN;
  $('codeKeys').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].map((c) => `<button id="ck-${c}" data-ck="${c}">${c === 'del' ? '消す' : c}</button>`).join('');
  $('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, CL); });
  $('codeKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const ci = $('codeInput');
    ci.value = b.dataset.ck === 'del' ? ci.value.slice(0, -1) : (ci.value + b.dataset.ck).slice(0, CL);
    if (ci.value.length === CL && b.dataset.ck !== 'del') setFocus($('joinPanel'), $('btnJoinGo'));
  });
  function titleBack() { if (probe) { probe.close(); probe = null; } $('slotPanel').classList.add('hidden'); $('friendPanel').classList.add('hidden'); $('joinPanel').classList.add('hidden'); $('namePanel').classList.add('hidden'); $('createPanel').classList.add('hidden'); $('titleMenu').classList.remove('hidden'); setFocus($('titleMenu'), currentFocus($('titleMenu'))); }
  $('btnJoinBack').onclick = titleBack;
  // ---------- フレンド ----------
  let probe = null; const fstat = {};
  function renderFriends() {
    const NET = SGK.NET, l = NET.friends();
    $('myFcode').textContent = NET.myCode();
    $('friendList').innerHTML = l.length ? l.map((f) => {
      const st = fstat[f.code], on = st && st !== 'off' && st !== '…';
      const txt = st === '…' || !st ? '確認中…' : st === 'off' ? '部屋は開いていません' : st.ver !== SGK.VERSION ? `部屋あり（バージョン違い ${st.ver}）` : `部屋あり ${st.n || 1}/${st.max || CFG.MAX_PLAYERS}人`;
      return `<div class="card"><div><b>${(f.name || 'フレンド').replace(/[<&]/g, '')}</b>　<span class="muted">${f.code}</span><br><span class="${on ? '' : 'muted'}" style="${on ? 'color:#8fe08f' : ''}">${txt}</span></div>`
        + `<div class="row"><button id="fj-${f.code}" data-fjoin="${f.code}" ${on && st.ver === SGK.VERSION ? '' : 'disabled'}>参加</button><button id="fd-${f.code}" data-fdel="${f.code}">削除</button></div></div>`;
    }).join('') : '<div class="muted" style="text-align:center;margin:8px">まだフレンドがいません。部屋コードで一度参加するか、フレンドコードを追加してください</div>';
  }
  function refreshFriends() {
    const codes = SGK.NET.friends().map((f) => f.code);
    if (probe) probe.close();
    codes.forEach((c) => (fstat[c] = '…')); renderFriends();
    probe = SGK.NET.probe(codes, (c, info) => { fstat[c] = info || 'off'; if (info && info.name) SGK.NET.addFriend(c, info.name); renderFriends(); });
  }
  $('btnFriend').onclick = () => { $('friendPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); refreshFriends(); setFocus($('friendPanel'), $('btnFriendRefresh')); };
  $('btnFriendBack').onclick = titleBack;
  $('btnFriendRefresh').onclick = refreshFriends;
  $('fcInput').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, CL); });
  $('btnFcAdd').onclick = () => {
    const c = $('fcInput').value;
    if (c === SGK.NET.myCode()) return titleMsg('それは自分のフレンドコードです');
    if (!SGK.NET.addFriend(c)) return titleMsg(`フレンドコード（数字${CL}けた）を入れてください`);
    $('fcInput').value = ''; titleMsg('フレンドに追加しました'); refreshFriends();
  };
  $('friendList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fjoin) { const c = b.dataset.fjoin; titleBack(); startClient(c); }
    else if (b.dataset.fdel) { SGK.NET.removeFriend(b.dataset.fdel); renderFriends(); setFocus($('friendPanel'), $('btnFriendRefresh')); }
  });
  // ---------- 家紋の編集（人物画面とはじめの人物づくりで共用） ----------
  const MON_RANGE = { f: [0, 3], s: [0, 6], n: [1, 8], d: [0, 6], z: [1, 6], r: [0, 7], c: [-1, 6] };
  function monDefault() { return { f: 1, s: 0, n: 3, d: 3, z: 3, r: 0, c: -1 }; }
  function monStep(d, k, dir) {
    const K = SGK.KAMON; d = Object.assign({}, d);
    if (k === 'mode') return d.p ? monDefault() : { p: K.PRESETS[0] };
    if (k === 'p') { const L = K.PRESETS; d.p = L[(L.indexOf(d.p) + dir + L.length) % L.length]; return d; }
    const [a, b] = MON_RANGE[k], span = b - a + 1; d[k] = ((d[k] - a + dir) % span + span) % span + a; return d;
  }
  function monEditorHtml(d, cvId) {
    const K = SGK.KAMON;
    const row = (k, label, val) => `<div class="row" style="align-items:center;gap:6px;margin:3px 0"><span style="width:5em">${label}</span><button id="mk-${k}-m" data-mk="${k}" data-md="-1">◀</button><span style="min-width:8em;text-align:center">${val}</span><button id="mk-${k}-p" data-mk="${k}" data-md="1">▶</button></div>`;
    let h = `<div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><canvas id="${cvId}" width="120" height="120" style="background:#f4ecd8;border-radius:60px;border:2px solid #2a2118"></canvas><div>`;
    h += `<div class="row" style="gap:6px;margin-bottom:4px"><button id="mk-mode" data-mk="mode">${d.p ? '自作にする' : '名家の紋から選ぶ'}</button></div>`;
    if (d.p) h += row('p', '紋', K.PRESET_NAMES[d.p] || d.p);
    else h += row('f', '枠', K.FRAMES[d.f]) + row('s', '図形', K.SHAPES[d.s]) + row('n', '数', d.n) + row('d', '間隔', d.d) + row('z', '大きさ', d.z) + row('r', '向き', d.r) + row('c', '中央', d.c < 0 ? 'なし' : K.SHAPES[d.c]);
    return h + `</div></div><span hidden>${JSON.stringify(d)}</span>`;
  }
  function drawMonPrev(id, d) { const pv = $(id); if (!pv || !d) return; const x = pv.getContext('2d'); x.clearRect(0, 0, 120, 120); x.drawImage(SGK.KAMON.monImage(d, 120), 0, 0); }

  // ---------- 0.38.0 はじめの人物づくり（名前・家紋・能力値・成長の型） ----------
  const ATK = Object.keys(SIM.ATTRS), GK = Object.keys(SIM.GROW);
  // 0.39.0 開始地点：町から選ぶ（東から西の順）
  const START = SGK.DATA.settlements.filter((s) => s.type === 'town').sort((a, b) => b.x - a.x);
  function nearLord(t) {
    let best = null, bd = 1e9;
    for (const s of SGK.DATA.settlements) if (s.type === 'castle' && s.owner) { const d = Math.hypot(s.x - t.x, s.y - t.y); if (d < bd) { bd = d; best = s; } }
    const f = best && SGK.DATA.factions.find ? SGK.DATA.factions.find((x) => x.id === best.owner) : best && SGK.DATA.factions[best.owner];
    return f ? f.name : '';
  }
  function loadProf() {
    let p = null; try { p = JSON.parse(localStorage.getItem('sgk_prof') || 'null'); } catch (e) {}
    p = p || {}; const C = SIM.CREATE;
    if (!p.attrs || !ATK.every((k) => p.attrs[k] >= C.base)) p.attrs = { bu: 3, tou: 3, chi: 3, sei: 3, mi: 3 };
    if (!SIM.GROW[p.grow]) p.grow = 'bal';
    p.mon = p.mon || monDefault();
    if (!START.some((t) => t.id === p.start)) p.start = SGK.DATA.startSettlement;
    return p;
  }
  const myProf = () => { const p = loadProf(); SGK.NET.prof = p; return p; };
  let prof = loadProf(), crNames = [];
  const crLeft = () => SIM.CREATE.base * ATK.length + SIM.CREATE.points - ATK.reduce((a, k) => a + prof.attrs[k], 0);
  function renderCreate() {
    const C = SIM.CREATE, g = SIM.GROW[prof.grow];
    let h = `<div class="muted" style="text-align:center">新しく始める人物です（すでに遊んでいるワールドの人物は変わりません）</div>`;
    h += `<div style="margin-top:6px"><b>名前</b>　${(($('nameInput').value.trim()) || '浪人').replace(/[<&]/g, '')}</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:4px 0">${crNames.map((n, i) => `<button id="cn-${i}" data-cr="nm" data-v="${n}">${n}</button>`).join('')}</div><div class="row"><button id="cr-more" data-cr="more">ほかの候補</button></div>`;
    h += `<div style="margin-top:8px"><b>能力値</b>　<span class="muted">残り ${crLeft()}点（1つ${C.max}まで）</span></div>`;
    for (const k of ATK) h += `<div class="row" style="align-items:center;gap:6px;margin:3px 0"><span style="width:4em">${SIM.ATTRS[k]}</span><button id="ca-${k}-m" data-cr="at" data-k="${k}" data-md="-1">◀</button><span style="min-width:3em;text-align:center">${prof.attrs[k]}</span><button id="ca-${k}-p" data-cr="at" data-k="${k}" data-md="1">▶</button></div>`;
    h += `<div style="margin-top:8px"><b>成長の型</b></div><div class="row" style="align-items:center;gap:6px"><button id="cg-m" data-cr="gr" data-md="-1">◀</button><span style="min-width:6em;text-align:center">${g.name}</span><button id="cg-p" data-cr="gr" data-md="1">▶</button></div><div class="muted">${g.desc}</div>`;
    const si = Math.max(0, START.findIndex((t) => t.id === prof.start)), st = START[si], nl = nearLord(st);
    h += `<div style="margin-top:8px"><b>開始地点</b>　<span class="muted">${si + 1}/${START.length}（東から西の順）</span></div><div class="row" style="align-items:center;gap:6px"><button id="cs-mm" data-cr="st" data-md="-5">◀◀</button><button id="cs-m" data-cr="st" data-md="-1">◀</button><span style="min-width:5em;text-align:center">${st.name}</span><button id="cs-p" data-cr="st" data-md="1">▶</button><button id="cs-pp" data-cr="st" data-md="5">▶▶</button><button id="cs-r" data-cr="sr">おまかせ</button></div><div class="muted">${nl ? `近くの大名：${nl}` : ''}</div>`;
    h += `<div style="margin-top:8px"><b>家紋</b></div>` + monEditorHtml(prof.mon, 'crMon');
    h += `<div class="row" style="margin-top:8px"><button id="cr-back" data-cr="back">戻る</button><button id="cr-ok" data-cr="ok">この人物で決める</button></div>`;
    $('createBody').innerHTML = h; drawMonPrev('crMon', prof.mon);
    const pn = $('createPanel'); setFocus(pn, currentFocus(pn));
  }
  function pickNames() { const pk = (a) => a[Math.floor(Math.random() * a.length)], set = new Set(); while (set.size < 6) set.add(pk(SEI) + pk(MEI)); crNames = [...set]; }
  $('btnName').onclick = () => { prof = loadProf(); pickNames(); $('createPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); renderCreate(); setFocus($('createPanel'), $('cr-ok')); };
  $('createBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const C = SIM.CREATE, dir = +b.dataset.md || 0;
    if (b.dataset.mk) prof.mon = monStep(prof.mon, b.dataset.mk, dir);
    else if (b.dataset.cr === 'nm') { $('nameInput').value = b.dataset.v; localStorage.setItem('sgk_name', b.dataset.v); }
    else if (b.dataset.cr === 'more') pickNames();
    else if (b.dataset.cr === 'at') { const k = b.dataset.k, v = prof.attrs[k] + dir; if (v >= C.base && v <= C.max && (dir < 0 || crLeft() > 0)) prof.attrs[k] = v; }
    else if (b.dataset.cr === 'st') { const n = START.length, i = START.findIndex((t) => t.id === prof.start); prof.start = START[(((i + dir) % n) + n) % n].id; }
    else if (b.dataset.cr === 'sr') prof.start = START[Math.floor(Math.random() * START.length)].id;
    else if (b.dataset.cr === 'gr') prof.grow = GK[(GK.indexOf(prof.grow) + dir + GK.length) % GK.length];
    else if (b.dataset.cr === 'back') { $('createPanel').classList.add('hidden'); titleBack(); return; }
    else if (b.dataset.cr === 'ok') { localStorage.setItem('sgk_prof', JSON.stringify(prof)); myName(); $('createPanel').classList.add('hidden'); titleBack(); titleMsg(`${myName()}（${SIM.GROW[prof.grow].name}）で${(START.find((t) => t.id === prof.start) || {}).name || ''}から始めます${crLeft() ? `（能力値の残り${crLeft()}点は使われません）` : ''}`); return; }
    renderCreate();
  });

  // 名前を候補から選ぶ（キーボードがなくても決められる）
  const SEI = ['木下', '明智', '前田', '佐々', '滝川', '山内', '蜂須賀', '池田', '森', '堀', '竹中', '黒田', '島', '可児', '真田', '本多', '井伊', '藤堂'];
  const MEI = ['藤吉郎', '十兵衛', '又左衛門', '内蔵助', '彦右衛門', '伊右衛門', '小六', '勝三郎', '三左衛門', '久太郎', '半兵衛', '官兵衛', '左近', '才蔵', '源次郎', '平八郎', '弥助', '五郎左'];
  function fillNames() {
    const pk = (a) => a[Math.floor(Math.random() * a.length)], set = new Set();
    while (set.size < 12) set.add(pk(SEI) + pk(MEI));
    $('nameKeys').innerHTML = [...set].map((n, i) => `<button id="nk-${i}" data-nm="${n}">${n}</button>`).join('');
  }
  $('btnName').onclick = () => { fillNames(); $('namePanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); setFocus($('namePanel'), $('nk-0')); };
  $('btnNameMore').onclick = () => { fillNames(); setFocus($('namePanel'), $('btnNameMore')); };
  $('btnNameBack').onclick = titleBack;
  $('nameKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('nameInput').value = b.dataset.nm; localStorage.setItem('sgk_name', b.dataset.nm); titleBack(); titleMsg(`名前を「${b.dataset.nm}」にしました`);
  });
  $('btnJoinGo').onclick = () => { const c = $('codeInput').value.replace(/\D/g, ''); if (c.length < CL) return titleMsg(`部屋コード（数字${CL}けた）を入れてください`); startClient(c); };

  // ---------- ホスト ----------
  const timerWorker = new Worker(URL.createObjectURL(new Blob(['let iv;onmessage=e=>{clearInterval(iv);if(e.data>0)iv=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' })));
  let lastTick = 0, netAcc = 0, saveAcc = 0, saveCount = 0;

  function startHost(world, msg) {
    G.mode = 'host'; G.world = world; G.speed = 1; G.disp = {}; G.selected = null;
    G.myPid = SIM.addPlayer(world, token, myName(), myProf());
    G.stat = SIM.staticState(world);
    show('game'); hostUI(true); toast(msg);
    centerOnMe();
    lastTick = performance.now(); netAcc = saveAcc = 0;
    timerWorker.onmessage = hostTick; timerWorker.postMessage(CFG.TICK_MS);
    SGK.SAVE.save(world);
    if (window.Peer) {
      G.net = SGK.NET.host({
        onReady: (code) => { G.roomCode = code; updateRoom(); },
        onError: (t) => toast(t, 5000),
        info: () => ({ name: myName(), n: (G.net ? G.net.count() : 0) + 1, max: CFG.MAX_PLAYERS }),
        onHello: (conn, m) => {
          const pid = SIM.addPlayer(G.world, String(m.token).slice(0, 40), String(m.name || '').slice(0, 12), m.prof);
          if (pid) { if (m.fcode) SGK.NET.addFriend(m.fcode, m.name); conn.send({ t: 'welcome', pid, static: G.stat, ver: SGK.VERSION, hostCode: G.roomCode, hostName: myName() }); toast(`${G.world.players[pid].name} が参加しました`); updateRoom(); }
          return pid;
        },
        onCmd: (pid, cmd) => SIM.applyCommand(G.world, pid, cmd),
        onLeave: (pid) => { const p = G.world.players[pid]; if (p) toast(`${p.name} が退出しました`); updateRoom(); },
      });
    } else { toast('通信ライブラリを読み込めませんでした（一人で遊べます）', 5000); }
    updateRoom();
  }
  function hostTick() {
    const now = performance.now(); const dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    G.inBattle = Object.keys(G.world.battles || {}).length > 0; // 0.32.0 誰かが戦闘中は時間を等倍に
    G.effSpeed = G.inBattle && G.speed > 1 ? 1 : G.speed;
    SIM.step(G.world, dt * CFG.MIN_PER_SEC * G.effSpeed);
    netAcc += dt * 1000;
    if (netAcc >= CFG.NET_SEND_MS) {
      netAcc = 0;
      if (G.net) { G.net.each((pid) => ({ t: 'state', s: SIM.dynamicState(G.world, pid), sp: G.speed, priv: SIM.privateState(G.world, pid), msgs: SIM.drain(pid), bt: G.inBattle })); }
      for (const pid in SIM.out) if (pid !== G.myPid) delete SIM.out[pid]; // 接続していない人宛ては捨てる
    }
    saveAcc += dt;
    if (saveAcc >= CFG.AUTOSAVE_SEC) { saveAcc = 0; SGK.SAVE.save(G.world); if (++saveCount % CFG.BACKUP_EVERY === 0) SGK.SAVE.backup(G.world); }
  }
  function updateRoom() {
    if (G.mode === 'host') {
      const online = G.net ? G.net.pids() : [];
      const names = [G.world.players[G.myPid].name, ...online.map((p) => (G.world.players[p] || {}).name)].join('・');
      $('roomInfo').innerHTML = (G.roomCode ? `部屋コード <b>${G.roomCode}</b>` : '部屋を準備中…') + `<br><span class="muted">${online.length + 1}/${CFG.MAX_PLAYERS}人（${names}）</span>`;
    } else if (G.mode === 'client') $('roomInfo').textContent = '参加中';
  }
  function hostUI(on) { document.querySelectorAll('.hostOnly').forEach((e) => e.classList.toggle('hidden', !on)); }
  document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { G.speed = +b.dataset.speed; }));

  // ---------- 参加者 ----------
  function startClient(code) {
    if (!window.Peer) return titleMsg('通信ライブラリを読み込めませんでした');
    titleMsg('接続しています…');
    G.mode = 'connecting';
    myProf();
    G.net = SGK.NET.join(code, token, myName(), {
      onWelcome: (m) => { SGK.NET.addFriend(m.hostCode || code, m.hostName); G.mode = 'client'; G.myPid = m.pid; G.stat = m.static; G.disp = {}; G.selected = null; show('game'); hostUI(false); titleMsg(''); updateRoom(); toast('参加しました'); },
      onState: (m) => { G.dyn = m.s; G.speed = m.sp; G.inBattle = m.bt; G.priv = m.priv; (m.msgs || []).forEach((t) => toast(t, 4000)); if (!G.centered) { G.centered = true; buildView(); centerOnMe(); } },
      onBye: (why) => { backToTitle(); titleMsg(why); },
      onError: (t) => titleMsg(t),
    });
  }

  function backToTitle() {
    if (G.mode === 'host') { SGK.SAVE.save(G.world); timerWorker.postMessage(0); }
    if (G.net) G.net.close();
    Object.assign(G, { mode: 'title', world: null, net: null, dyn: null, view: null, centered: false, roomCode: null });
    $('gameMenu').classList.add('hidden'); $('info').classList.add('hidden'); $('town').classList.add('hidden'); $('battle').classList.add('hidden'); $('char').classList.add('hidden'); G.priv = null;
    contBtn();
    show('title');
  }
  // タブを閉じるときもセーブ
  window.addEventListener('pagehide', () => { if (G.mode === 'host') SGK.SAVE.save(G.world); });

  // ---------- 表示用データ ----------
  function buildView() {
    if (G.mode === 'host') {
      const w = G.world;
      const m = w.players[G.myPid], sr = m ? SIM.sightRadius(w, m) : 0;
      const vis = (e) => !m || e === m || SIM.canSee(m, sr, e.x, e.y);
      G.view = { t: w.time.min, sr, settlements: w.settlements, factions: w.factions, people: w.people, wars: Object.keys(w.wars || {}), players: Object.values(w.players).filter(vis), npcs: Object.values(w.npcs).filter(vis) };
    } else if (G.mode === 'client' && G.dyn) {
      const d = G.dyn, s = G.stat;
      if (d.pp) G.pp = d.pp; // 0.52.0 人口
      if ((d.rv || 0) !== (G.rv || 0)) { G.rv = d.rv || 0; SIM.applyRoads(d.ra || []); } // 0.40.0 普請でできた道
      G.view = {
        t: d.t, sr: d.sr, settlements: withOwners(d.ns && d.ns.length ? s.settlements.filter((x) => !d.ns.some((n) => n.id === x.id)).concat(d.ns) : s.settlements, d.ow),
        factions: d.pf && Object.keys(d.pf).length ? Object.assign({}, s.factions, d.pf) : s.factions, people: s.people, wars: d.wars || [],
        players: d.p.map(([id, name, x, y, at, tx, ty, status, path]) => ({ id, name, x, y, at, tx, ty, status, path, mon: d.mons && d.mons[id] })),
        npcs: d.n.map(([id, kind, faction, x, y, size, battle, dest, cargo, army, home, at, pname, extra, lead]) => ({ id, kind, faction, x, y, size, battle, dest, at, cargo: cargo && { item: cargo[0], qty: cargo[1] }, army, home, pname, lead, extra })),
      };
    }
    return G.view;
  }
  const me = () => G.view && G.view.players.find((p) => p.id === G.myPid);
  function centerOnMe() { buildView(); const m = me(); if (m) { R.cam.x = m.x; R.cam.y = m.y; } }

  // ---------- 命令（ホストは直接、参加者は送信） ----------
  function command(cmd) {
    if (G.mode === 'host') SIM.applyCommand(G.world, G.myPid, cmd);
    else if (G.mode === 'client' && G.net) G.net.send(cmd);
  }
  function moveTo(x, y, dest) { command({ type: 'move', x, y, dest: dest || null }); if (!dest && SIM.isSea(x, y)) toast('海の上には移動できません', 1500); }

  // ---------- 拠点の情報 ----------
  function selectSettlement(s) {
    G.selected = s ? s.id : null; G.selKind = s ? 's' : null; $('infoGo').textContent = 'ここへ向かう'; $('infoAct').classList.add('hidden');
    if (!s) { $('info').classList.add('hidden'); return; }
    const f = G.view.factions[s.owner], lord = lordName(s);
    const kind = { castle: '城', town: '町', village: '村' }[s.type];
    $('infoName').textContent = s.name;
    const ho = holders()[s.id];
    $('infoBody').innerHTML = `${kind}${s.site ? `（普請中 ${Math.floor(s.site.prog * 100)}%）` : ''}　勢力：<b style="color:${f ? f.color : '#ccc'}">${f ? f.name : 'なし'}</b>${(() => { const fb = SIM.factionBuff(G.view.factions, s.owner); return fb ? `<span class="muted">（得意：${fb.name}・${fb.text}）</span>` : ''; })()}<br>城主・代官：${ho ? `<b>${ho}</b>（プレイヤー）` : lord || '（不明）'}`;
    { const ry = SIM.ryoOf && SIM.ryoOf(s.id), rc = ry && G.view.settlements.find((x) => x.id === ry); // 0.52.0 城と村・町のつながり
      { const pop = (G.mode === 'client' ? G.pp && G.pp[s.id] : ((G.world && G.world.settlements.find((x) => x.id === s.id)) || {}).pop); if (pop) $('infoBody').innerHTML += `<br>人口 約${(Math.round(pop / 10) * 10).toLocaleString()}人`; }
      if (SIM.minato && SIM.minato(s)) $('infoBody').innerHTML += `<br>⚓ ${SIM.minatoName(s)}（年貢×${SIM.minatoMul(s)}）`;
      if (rc) $('infoBody').innerHTML += `<br>${rc.name}の領内`;
      if (s.type === 'castle') { const ls = G.view.settlements.filter((v) => SIM.ryoOf(v.id) === s.id); if (ls.length) $('infoBody').innerHTML += `<br>領内：${ls.map((v) => v.name + (SIM.minato(v) ? '⚓' : '') + (v.owner !== s.owner ? '（他家）' : '')).join('・')}`; const ms = SIM.minesOf(s); if (ms.length) $('infoBody').innerHTML += `<br>鉱山：${ms.map((m) => m.name + `（月+${SIM.money(SIM.KUNI.mineInc[m.k])}）`).join('・')}`; } }
    if (s.type === 'castle') {
      const cs = castleStat(s), m = G.priv && G.priv.me, W = m && m.war, R = m && m.rank, at = G.view.wars || [];
      const lordN = cs.lordName;
      $('infoBody').innerHTML += `<br>${{ yama: '山城（守りが堅い）', mizu: '水城（水堀が広い）' }[SIM.castleKind(s)] || '平城'}　守備兵 約${cs.gar}人${lordN && cs.loyal != null ? `　${lordN}の忠誠 ${cs.loyal}` : ''}`;
      { const V = m && m.vass && m.vass[s.id], fmt = ([nm, t, b]) => `${nm}<span class="muted">（統${t}・武${b}）</span>`; // 0.34.0 城の武将
        if (V) $('infoBody').innerHTML += `${V.lord ? `<br>城主：${fmt(V.lord)}` : ''}<br>家臣：${V.vass.length ? V.vass.map(fmt).join('・') : 'なし'}`;
        else $('infoBody').innerHTML += '<br><span class="muted">（40km以内に近づくと家臣の武将が分かります）</span>'; }
      if (cs.bs) $('infoBody').innerHTML += `<br><b style="color:#e06050">${cs.bs.by}に包囲されている（総攻めまであと${cs.bs.days}日）</b>`;
      const mine = R && R.clan, war = mine && s.owner !== mine && at.includes(mine < s.owner ? `${mine}|${s.owner}` : `${s.owner}|${mine}`);
      if (war) $('infoBody').innerHTML += '　<b style="color:#e06050">交戦中</b>';
      const mp = me(), near = mp && Math.hypot(mp.x - s.x, mp.y - s.y) <= (W ? W.nearKm : 2);
      let act = null;
      const sg = W && W.siege && W.siege.sid === s.id ? W.siege : null;
      if (sg) $('infoBody').innerHTML += `<br>${sg.ready ? '総攻めの支度が整っています' : `包囲中：総攻めまであと${sg.days}日`}`;
      if (sg && sg.ready && near) act = { label: '総攻めをかける', cmd: { type: 'assault', id: s.id } };
      else if (sg) act = { label: '包囲を解く', cmd: { type: 'liftSiege' } };
      else if (war && W.canSiege && near && !(W.siege)) act = { label: `城を包囲する（${W.ar ? W.ar.siegeDays : 5}日後に総攻め）`, cmd: { type: 'siege', id: s.id } };
      else if (W && W.canPersuade && cs.lord && s.owner !== mine && mp && mp.at === s.id) act = { label: `調略する（${SIM.money(W.persuadeCost)}・成功率${W.chance != null ? W.chance : '?'}%）`, cmd: { type: 'persuade' } };
      else if (R && R.daimyo && s.owner === mine && cs.lord && mp && mp.at === s.id) act = { label: `褒美を与える（${SIM.money(W.rewardCost)}）`, cmd: { type: 'reward' } };
      G.infoCmd = act ? act.cmd : null; $('infoAct').classList.toggle('hidden', !act); if (act) $('infoAct').textContent = act.label;
    }
    $('info').classList.remove('hidden');
  }
  // 城の守備兵・城主・忠誠（ホストは直接、参加者は送られてきた値）
  function castleStat(s) {
    if (G.mode === 'host') { const pr = s.lord && G.world.people[s.lord]; return { gar: SIM.garrison(s), lord: s.lord, loyal: pr ? pr.loyal : null, lordName: pr ? pr.name : null, bs: SIM.siegeInfo(G.world, s.id) }; }
    const c = G.dyn && G.dyn.cs && G.dyn.cs[s.id], bs = (G.dyn && G.dyn.bs && G.dyn.bs[s.id]) || null;
    return c ? { gar: c[0], lord: c[1], loyal: c[2], lordName: c[3] || (G.view.people[c[1]] || {}).name || null, bs } : { gar: '?', lord: s.lord, loyal: null, lordName: s.lord ? (G.view.people[s.lord] || {}).name : null, bs };
  }
  function lordName(s) { // 城は最新の城主（新しく置かれた武将も）、町や村は元のデータ
    if (s.type === 'castle') return castleStat(s).lordName;
    return s.lord ? (G.view.people[s.lord] || {}).name : null;
  }
  // 持ち主が変わった城（独立など）を地図に反映する
  const withOwners = (list, ow) => (ow && Object.keys(ow).length ? list.map((x) => (ow[x.id] && ow[x.id] !== x.owner ? Object.assign({}, x, { owner: ow[x.id] }) : x)) : list);
  const holders = () => (G.mode === 'host' ? SIM.holders(G.world) : (G.dyn && G.dyn.h) || {});
  $('infoAct').onclick = () => { if (typeof G.infoCmd === 'function') G.infoCmd(); else if (G.infoCmd) command(G.infoCmd); };
  $('infoGo').onclick = () => {
    if (G.selKind === 'u') { const u = findUnit(G.selected); if (u) command({ type: 'follow', id: u.id }); return; }
    const s = G.view.settlements.find((x) => x.id === G.selected); if (s) moveTo(s.x, s.y, s.id);
  };

  // ---------- 部隊（CPU・他プレイヤー）の情報 ----------
  const findUnit = (id) => G.view && (G.view.npcs.find((n) => n.id === id) || G.view.players.find((p) => p.id === id));
  function unitHit(sx, sy) {
    let best = null, bd = 13;
    for (const e of [...G.view.npcs, ...G.view.players]) {
      if (e.id === G.myPid || e.at) continue; // 拠点に入っている者は選べない
      const d0 = G.disp[e.id] || e, [x, y] = R.toScreen(d0.x, d0.y), d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function unitInfo(u) {
    const f = u.faction && G.view.factions[u.faction], fn = f ? `<b style="color:${f.color}">${f.name}</b>` : '';
    const m = me(), km = m ? Math.hypot(u.x - m.x, u.y - m.y).toFixed(1) : '?';
    const where = `${u.at ? sName(u.at) + 'に滞在中' : u.dest ? sName(u.dest) + 'へ向かっている' : '野外'}　（ここから ${km}km・${SIM.placeName(u.x, u.y)}）`;
    const TR = SIM.TROOPS, ar = u.army ? Object.entries(u.army).filter(([, n]) => n > 0).map(([k, n]) => `${(TR[k] || {}).name || k} ${n}人`).join('・') : `${u.size}人`;
    if (u.kind === 'merchant') {
      const it = u.cargo && SGK.DATA.items[u.cargo.item], pr = it && SIM.cargoPrice(u.cargo.item);
      return { name: '行商人', body: `${where}<br>荷：${it ? `${it.name} ${u.cargo.qty}${it.unit}　<span class="muted">売値 約${pr}文/${it.unit}（1度に5${it.unit}まで）</span>` : 'なし'}<br><span class="muted">町から町へ品物を運んでいる。1.5km以内なら荷を買える。運んだ先では品物が安くなる。</span>`,
        go: '追いかける', act: it ? { label: `${it.name}を買う`, cmd: { type: 'buyCargo', id: u.id } } : null };
    }
    const talk = Number(km) <= 1.5 ? { label: '話しかける', cmd: { type: 'talkNpc', id: u.id } } : null;
    const R0 = G.priv && G.priv.me && G.priv.me.rank, myC = R0 && R0.clan, wars0 = G.view.wars || [];
    const atWar = myC && u.faction && wars0.includes(myC < u.faction ? `${myC}|${u.faction}` : `${u.faction}|${myC}`);
    const atk = atWar && !u.battle && Number(km) <= 2 ? { label: '攻めかかる', cmd: { type: 'attackArmy', id: u.id } } : null;
    const leadTxt = u.lead && u.lead.length ? '<br>' + (u.kind === 'army' ? '武将' : '大将') + '：' + u.lead.map(([nm, t, b]) => `${nm}<span class="muted">（統率${t}・武勇${b}）</span>`).join('・') : '';
    const warNote = atWar ? '<br><b style="color:#ff6a4a">戦をしている家の武将です</b>（こちらと互角以上なら攻めかかってきます）' : '';
    if (u.kind === 'bushou') return { name: `${u.pname || '武将'}（${f ? f.name : ''}）`, body: `勢力：${fn}<br>${u.extra || ''}　${where}<br>供回り：${ar}${leadTxt}${warNote}<br><span class="muted">${talk ? '話しかけると顔をつなげる（その家に名声2で仕官できる）。うわさも聞ける' : '1.5km以内まで近づくと話しかけられる'}</span>`, go: '追いかける', act: atk || (atWar ? null : talk) };
    if (u.kind === 'ronin') { const [need, fee] = u.extra || [0, 0]; return { name: `浪人 ${u.pname || ''}`, body: `${where}<br>手勢：${ar}<br>家臣になる条件：名声${need}・支度金${SIM.money(fee)}<br><span class="muted">主を持たない武将。家臣にすると手勢が加わり、率いる人数が増える（家臣は3人まで）${talk ? '' : '。1.5km以内まで近づくと話しかけられる'}</span>`, go: '追いかける', act: talk ? { label: '家臣に誘う', cmd: talk.cmd } : null }; }
    if (u.kind === 'patrol') return { name: `${u.pname ? u.pname + '隊' : '武将の隊'} ${u.size || ''}人`, act: u.battle ? null : atk || (atWar ? null : talk), body: `${u.battle === 2 ? '<b style="color:#ff6a4a">野盗と交戦中</b>（野盗に近づくと加勢できる）<br>' : u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}勢力：${fn}<br>${where}${u.home ? `<br>本拠：${sName(u.home)}` : ''}<br>兵：${ar}${leadTxt}${warNote}<br><span class="muted">城の家臣の武将が交代で兵を率いて、自勢力の拠点のあいだを回り、近くの野盗を退治する。武勇が高いと兵の攻撃が、統率が高いと士気が上がる。話しかけると顔をつなげる。</span>`, go: '追いかける' };
    if (u.kind === 'army') {
      const t = G.mode === 'host' ? SIM.armyText(G.world, G.world.npcs[u.id]) : ((G.dyn && G.dyn.ar) || {})[u.id];
      const R = G.priv && G.priv.me && G.priv.me.rank, mine = R && R.clan, wars = G.view.wars || [];
      const war = mine && u.faction && wars.includes(mine < u.faction ? `${mine}|${u.faction}` : `${u.faction}|${mine}`);
      const act = war && !u.battle && Number(km) <= ((G.priv.me.war && G.priv.me.war.ar) ? G.priv.me.war.ar.fightKm : 2) ? { label: '攻めかかる', cmd: { type: 'attackArmy', id: u.id } } : null;
      return { name: `${t ? t.name : '軍勢'} ${u.size}人`, body: `${u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}勢力：${fn}${war ? '　<b style="color:#e06050">交戦中</b>' : ''}<br>${t ? t.text : ''}<br>兵：${ar}<br><span class="muted">${war ? `敵の軍勢。${(G.priv.me.war && G.priv.me.war.ar ? G.priv.me.war.ar.fightKm : 2)}km以内まで近づくと攻めかかれます。打ち破れば包囲が解けます` : '武将たちが率いる軍勢'}</span>`, go: '追いかける', act };
    }
    if (u.kind === 'bandit') {
      return { name: `野盗 ${u.size}人`, body: `${u.battle === 2 ? '<b style="color:#ff6a4a">巡回兵と交戦中</b>（近づくと加勢できる）<br>' : u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}${where}<br>手勢：${ar}<br><span class="muted">近づくと襲ってくる。倒すと金品が手に入る。</span>`, go: u.battle === 2 ? '加勢する' : '攻めかかる' };
    }
    // 他のプレイヤー
    return { name: u.name, body: `プレイヤー（${u.status || '浪人'}）<br>${where}`, go: '追いかける' };
  }
  function selectUnit(u) {
    if (!u) return selectSettlement(null);
    G.selected = u.id; G.selKind = 'u'; G.infoHtml = '';
    refreshUnitInfo();
    $('info').classList.remove('hidden');
  }
  function refreshUnitInfo() {
    const u = findUnit(G.selected);
    if (!u) { selectSettlement(null); toast('見失いました', 1200); return; }
    const i = unitInfo(u), html = `${i.name}|${i.body}|${i.go}|${i.act ? i.act.label : ''}`;
    if (html === G.infoHtml) return; G.infoHtml = html;
    $('infoName').textContent = i.name; $('infoBody').innerHTML = i.body; $('infoGo').textContent = i.go;
    G.infoCmd = i.act ? i.act.cmd : null; $('infoAct').classList.toggle('hidden', !i.act); if (i.act) $('infoAct').textContent = i.act.label;
  }
  $('infoClose').onclick = () => selectSettlement(null);

  // ---------- 拠点の中（市場・依頼・仕事・話す） ----------
  const IT = SGK.DATA.items;
  // 値段の色：相場より安いほど青、高いほど赤（相場の半分・2倍でいちばん濃い）
  function priceCol(r) {
    const t = Math.max(-1, Math.min(1, Math.log(r) / Math.LN2)), N = [236, 228, 210], C = t < 0 ? [80, 160, 255] : [255, 85, 70], a = Math.abs(t);
    return `rgb(${N.map((n, i) => Math.round(n + (C[i] - n) * a)).join(',')})`;
  }
  let townTab = 'market', townHtml = '';
  const dayLeft = (dl) => { const d = (dl - G.view.t) / 1440; return d >= 1 ? `あと${Math.floor(d)}日` : 'まもなく期限'; };
  const sName = (id) => (G.view.settlements.find((x) => x.id === id) || {}).name || '?';
  function openTown(open) {
    const t = $('town');
    if (open === false || !G.priv || !G.priv.here) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden'); townHtml = ''; renderTown(); setFocus(t, currentFocus(t));
  }
  function setTab(tab) { townTab = tab; townHtml = ''; renderTown(); const t = $('town'); setFocus(t, $('tab-' + tab)); }
  function renderTown() {
    const P = G.priv; if (!P || !P.here) return openTown(false);
    const me = P.me, h = P.here, hs = G.view.settlements.find((x) => x.id === h.id);
    $('tab-castle').classList.toggle('hidden', !hs || hs.type !== 'castle');
    if (townTab === 'castle' && (!hs || hs.type !== 'castle')) townTab = 'market';
    $('townName').textContent = sName(h.id);
    document.querySelectorAll('#town [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === townTab));
    let html = '';
    if (townTab === 'market') {
      html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　荷 ${SIM.cargo(me)}/${me.cap}　米 ${(me.inv && me.inv.rice) || 0}/${me.riceCap}俵（別枠）</div><div class="grid">`;
      html += '<span class="h">品</span><span class="h">買値</span><span class="h">売値</span><span class="h">在庫</span><span class="h">所持</span><span></span><span></span><span></span><span></span>';
      for (const [k, buy, sell, stock] of h.market) {
        const it = IT[k], have = me.inv[k] || 0;
        const mm = me.memo && me.memo[k], ago = (x) => (x[2] <= 0 ? '今日' : x[2] + '日前');
        const memo = mm ? `<br><span style="font-size:11px;color:#9ab">${mm.sell && mm.sell[1] > sell ? `高く売れる：${sName(mm.sell[0])} ${mm.sell[1]}文(${ago(mm.sell)})` : ''}${mm.buy && mm.buy[1] < buy ? `${mm.sell && mm.sell[1] > sell ? '<br>' : ''}安く買える：${sName(mm.buy[0])} ${mm.buy[1]}文(${ago(mm.buy)})` : ''}</span>` : '';
        html += `<span>${it.name}<span class="muted">/${it.unit}<br>相場${it.base}文</span>${memo}</span><span style="color:${priceCol(buy / 1.1 / it.base)}">${buy}文</span><span style="color:${priceCol(sell / 0.9 / it.base)}">${sell}文</span><span>${stock}</span><span>${have}${have && me.cost && me.cost[k] != null ? `<br><span style="font-size:11px;color:${sell >= me.cost[k] ? '#6fbf73' : '#e07a6a'}">平均${Math.round(me.cost[k])}文</span>` : ''}</span>`
          + ((h.noBuy || []).includes(k) ? `<button id="b1-${k}" disabled title="調達の依頼が出ているので買えない">依頼品</button><button id="b10-${k}" disabled>－</button>` : `<button id="b1-${k}" data-act="buy" data-item="${k}" data-qty="1">買1</button><button id="b10-${k}" data-act="buy" data-item="${k}" data-qty="10">買10</button>`)
          + `<button id="s1-${k}" data-act="sell" data-item="${k}" data-qty="1" ${have ? '' : 'disabled'}>売1</button><button id="sa-${k}" data-act="sell" data-item="${k}" data-qty="999" ${have ? '' : 'disabled'}>全部</button>`;
      }
      html += '</div>';
      // 0.47.0 武具（町・城）
      const EQ = SIM.EQUIP, E = me.equip || {};
      if (E && (h.shop || []).length) {
        const cur = (sl) => (E[sl] && EQ[sl][E[sl]]) ? EQ[sl][E[sl]].name : 'なし';
        const wk = E.wep && EQ.wep[E.wep] ? EQ.wep[E.wep].kind : null;
        html += `<div class="muted" style="margin-top:10px">武具　いまの装備：武器 ${cur('wep')}${wk ? `（${EQ.groupName[wk]}に入る）` : ''}・防具 ${cur('arm')}・馬 ${cur('horse')}</div>`;
        for (const [sl, id] of h.shop) {
          const e = EQ[sl][id], have = E[sl] === id, old = E[sl] && EQ[sl][E[sl]], back = old ? Math.floor(old.cost * EQ.sell) : 0;
          const eff = sl === 'wep' ? `${EQ.kindName[e.kind]}・${EQ.groupName[e.kind]}に入る${e.am ? `・本人の攻撃+${Math.round(e.am * 100)}%` : ''}` : sl === 'arm' ? `守り+${e.da}・体力+${Math.round(e.hm * 100)}%` : `1日の移動+${e.km}km`;
          html += `<div class="card"><div><b>${e.name}</b>　<span class="muted">${EQ.slotName[sl]}　${SIM.money(e.cost)}${back && !have ? `（下取り${SIM.money(back)}）` : ''}<br>${eff}</span></div><button id="eq-${id}" data-act="buyEquip" data-kind="${sl}" data-id="${id}" ${have || me.money + back < e.cost ? 'disabled' : ''}>${have ? '装備中' : '買う'}</button></div>`;
        }
      }
    } else if (townTab === 'jobs') {
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
      for (const j of h.jobs) {
        const to = j.type === 'deliver' && G.view.settlements.find((x) => x.id === j.to), fr = G.view.settlements.find((x) => x.id === j.from);
        const km = to && fr ? Math.round(Math.hypot(to.x - fr.x, to.y - fr.y)) : null;
        const what = j.what ? j.what : j.type === 'deliver' ? `届け先：${sName(j.to)}${km != null ? `（${dirOf(fr, to)}へ約${km}km）` : ''}` : `${IT[j.item].name}を${j.qty}${IT[j.item].unit}、ここへ納品`;
        html += `<div class="card"><div><b>${j.title}</b>　<span class="muted">依頼主：${j.giver}</span><br><span class="muted">${what}　報酬 ${SIM.money(j.reward)}　期限${j.days}日</span></div><div class="row">`
          + (to || j.look ? `<button id="lk-${j.id}" data-look="${to ? j.to : j.look}">地図で見る</button>` : '') + `<button id="ac-${j.id}" data-act="acceptJob" data-id="${j.id}">受ける</button></div></div>`;
      }
    } else if (townTab === 'work') {
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
      const V = h.invest; // 0.41.0 拠点への投資
      if (V) {
        const kind = s.type === 'village' ? '村' : s.type === 'town' ? '町' : '城下';
        html += `<div class="muted" style="margin-top:10px">投資　所持金 ${SIM.money(me.money)}</div>`;
        html += `<div class="card" style="display:block"><b>規模 ${V.lv}/${V.max}</b>　${V.name}${kind}<br><span class="muted">いま 生産+${V.prod}%・兵の補充+${V.pool}%`
          + (V.mine ? `<br>あなたの出資 ${SIM.money(V.mine)}（毎月の配当 約${SIM.money(V.div)}）` : '') + '</span>'
          + (V.lv < V.max ? `<div class="bar"><i style="width:${Math.round((1 - V.need / V.next) * 100)}%"></i></div><span class="muted">次の規模まで あと${SIM.money(V.need)}。上がると生産+20%・兵の補充の速さと上限+30%。出した額の1%が毎月配当で戻り、2貫ごとに名声+1</span>` : '<br><span class="muted">これ以上は大きくなりません</span>')
          + '</div>';
        if (V.lv < V.max) html += `<div class="row">${V.steps.map((q) => `<button id="iv-${q}" data-act="invest" data-qty="${q}" ${me.money >= Math.min(q, V.need) ? '' : 'disabled'}>${SIM.money(q)}出す</button>`).join('')}<button id="iv-rest" data-act="invest" data-kind="rest" ${me.money >= 1 ? '' : 'disabled'}>残りを出す（${SIM.money(V.need)}）</button></div>`;
      }
    } else if (townTab === 'army') {
      const TR = SIM.TROOPS, n = SIM.troopCount(me.troops);
      html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　兵 ${n}/${me.troopCap}　給金 ${SIM.money(me.wage)}/日</div>`;
      html += '<div class="muted">この拠点で雇える兵</div>';
      for (const [k, avail] of h.recruit) {
        const t = TR[k];
        html += `<div class="card"><div><b>${t.name}</b>　<span class="muted">${avail}人</span><br><span class="muted">1人 ${SIM.money(Math.round(t.cost * (me.costMod || 1)))}　給金 ${t.wage}文/日${t.fame ? `　名声${t.fame}以上` : ''}</span></div><div class="row">`
          + `<button id="r1-${k}" data-act="recruit" data-kind="${k}" data-qty="1" ${avail ? '' : 'disabled'}>雇う1</button><button id="r5-${k}" data-act="recruit" data-kind="${k}" data-qty="5" ${avail ? '' : 'disabled'}>雇う5</button></div></div>`;
      }
      html += '<div class="muted" style="margin-top:10px">率いている兵</div>';
      if (!n) html += '<div class="muted" style="margin-top:4px">まだいません。野盗（地図の×印）と戦うには兵を雇いましょう</div>';
      for (const k in me.troops) html += `<div class="card"><div>${TR[k].name}　${me.troops[k]}人</div><button id="dm-${k}" data-act="dismiss" data-kind="${k}" data-qty="1">1人解き放つ</button></div>`;
    } else if (townTab === 'castle') {
      const C = (me.castles || []).find((c) => c.id === h.id);
      if (h.site != null) {
        const B = me.build;
        html += `<div class="card" style="display:block"><b>普請中</b> ${h.site}%<div class="bar"><i style="width:${h.site}%"></i></div><span class="muted">普請を1回（${B.hours}時間）すると約+${B.gain}%進む（築城の技能・知略が高いほど早い）。完成すると、縄張りをした部将以上の人がこの城の城主になります</span></div>`;
        if (h.mine && !me.busy) html += `<div class="card"><div>普請に加わる</div><button id="bw" data-act="buildWork">普請する</button></div>`;
        else if (me.busy) html += `<div class="muted">${me.busy.label}の最中です</div>`;
        else html += '<div class="muted">主家の城ではないので普請に加われません</div>';
      } else if (C) {
        html += `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　毎月の年貢 約${SIM.money(C.tax)}（月の初めに届く）</div>`;
        for (const [k, v, cost, gp] of C.dev) {
          const D = SIM.DEV[k], l = Math.floor(v), pct = v >= 10 ? 100 : Math.round((v - l) * 100);
          html += `<div class="card" style="display:block"><div class="row" style="align-items:center"><span><b>${D.name}</b> ${l}<span class="muted">/10　${D.desc}</span></span>`
            + (me.busy || v >= 10 ? '' : `<button id="dv-${k}" data-act="develop" data-kind="${k}" style="flex:0 0 auto">${D.act}<br><span class="muted">${SIM.money(cost)}・${D.hours}時間</span></button>`)
            + `</div><div class="bar"><i style="width:${pct}%"></i></div><div class="muted">1回で+${gp}%（${SIM.SKILLS[D.skill].name}の技能・${SIM.ATTRS[D.attr]}が高いほど進む）</div></div>`;
        }
        if (me.busy) html += `<div class="muted">${me.busy.label}の最中です（「仕事」で取りやめられます）</div>`;
        html += fushinHtml(me);
      } else if (me.fushin && me.fushin.id === h.id) { html += fushinHtml(me);
      } else {
        const lord = lordName(hs);
        html += `<div class="card" style="display:block">城主：${h.holder ? `<b>${h.holder}</b>（プレイヤー）` : lord || '（不明）'}<br><span class="muted">${me.castle ? `あなたが治めている城：${(me.castles || []).map((c) => c.name).join('・')}` : '部将から「城主」に昇進すると、主家の城を一つ任されます。部将以上は野外に新しく城を築くこともできます（人物画面の「身分」）'}</span></div>`;
        const R = me.rank; // 0.29.1 城の画面からも仕官できるように
        if (R && !R.clan && R.canServe) {
          const need = R.serveNeed != null ? R.serveNeed : SIM.RANKS[1].fame, ok = me.fame >= need;
          html += `<div class="card"><div><b>仕官</b>　${R.factionHere}の${R.lordHere}様に仕える<br><span class="muted">名声${need}以上（いま${me.fame}）。仕えると俸禄がもらえ、主家の依頼や戦で功績が積めます${ok ? '' : '。この家の武将や隊長に話しかけて顔をつなぐと名声2で仕官できます'}</span></div><button id="tw-serve" data-act="serve" ${ok ? '' : 'disabled'}>仕官する</button></div>`;
        } else if (R && !R.clan) html += `<div class="muted">この城では仕官できません（城主のいる城で仕官できます）</div>`;
      }
    } else {
      html += `<div class="card"><div>ここの人に話を聞く<br><span class="muted">相場の噂などが聞けます</span></div><button id="tk" data-act="talk">話しかける</button></div>`;
    }
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
    if (F.next) h += `<div class="card"><div><b>改築</b>：${F.next.name}<br><span class="muted">${SIM.money(F.next.cost)}・${F.next.days}日。城を守る戦で有利になる（守りの効き ${Math.round(F.next.kf * 100)}%）${SIM.kaiMapText && SIM.kaiMapText(F.kai + 1) ? '・' + SIM.kaiMapText(F.kai + 1) : ''}</span></div><button id="fk" data-act="fushin" data-kind="kai" ${me.money >= F.next.cost ? '' : 'disabled'}>改築する</button></div>`;
    else h += '<div class="muted">これ以上の改築はできません</div>';
    const RN = ['', '大街道', '街道', '脇道'];
    for (const g of F.widen) h += `<div class="card"><div><b>道を広げる</b>：${g.name}へ（${RN[g.rank]}→${RN[g.rank - 1]}・約${g.len}km）<br><span class="muted">${SIM.money(g.cost)}・${g.days}日</span></div><button id="fw-${g.to}" data-act="fushin" data-kind="widen" data-id="${g.to}" ${me.money >= g.cost ? '' : 'disabled'}>広げる</button></div>`;
    for (const g of F.roads) h += `<div class="card"><div><b>新しい道</b>：${g.name}へ（約${g.len}km${g.mt ? `・山${g.mt}%` : ''}）<br><span class="muted">${SIM.money(g.cost)}・${g.days}日。脇道ができる</span></div><button id="fr-${g.to}" data-act="fushin" data-kind="road" data-id="${g.to}" ${me.money >= g.cost ? '' : 'disabled'}>道をつくる</button></div>`;
    return h;
  }
  function dirOf(a, b) { const ang = Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI; return ['東', '北東', '北', '北西', '西', '南西', '南', '南東'][Math.round(((ang + 360) % 360) / 45) % 8]; }
  // 依頼の届け先を地図で見る（「依頼に戻る」で拠点の画面へ戻れる）
  function lookAt(id) {
    const to = G.view.settlements.find((x) => x.id === id); if (!to) return;
    const back = { label: '依頼の画面に戻る', fn: () => { selectSettlement(null); R.cam.follow = true; openTown(true); } };
    openTown(false); R.cam.follow = false; R.cam.x = to.x; R.cam.y = to.y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; selectSettlement(to);
    G.infoCmd = back.fn; $('infoAct').textContent = back.label; $('infoAct').classList.remove('hidden');
    setFocus($('info'), $('infoAct'));
  }
  $('townBody').addEventListener('click', (e) => {
    const lb = e.target.closest('button[data-look]'); if (lb) return lookAt(lb.dataset.look);
    const lx = e.target.closest('button[data-lookxy]'); if (lx) { const [x, y] = lx.dataset.lookxy.split(',').map(Number); openTown(false); R.cam.follow = false; R.cam.x = x; R.cam.y = y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; return; }
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const c = { type: b.dataset.act };
    if (b.dataset.item) c.item = b.dataset.item;
    if (b.dataset.qty) c.qty = +b.dataset.qty;
    if (b.dataset.id) c.id = b.dataset.id;
    if (b.dataset.kind) c.kind = b.dataset.kind;
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
  function cycleTab(d) { const tabs = ['market', 'jobs', 'work', 'army', 'talk', 'castle'].filter((t) => !$('tab-' + t).classList.contains('hidden')); setTab(tabs[(tabs.indexOf(townTab) + d + tabs.length) % tabs.length]); }

  // ---------- 人物（能力・技能・特技・部隊の昇格） ----------
  let charTab = 'stat', charHtml = '';
  function openChar(open) {
    const c = $('char');
    if (open === false || !G.priv) { c.classList.add('hidden'); return; }
    if (G.priv.battle) return toast('戦闘中は開けません', 1500);
    openTown(false); toggleMenu(false); c.classList.remove('hidden'); charHtml = ''; renderChar(); setFocus(c, currentFocus(c));
  }
  function setCTab(t) { charTab = t; charHtml = ''; renderChar(); setFocus($('char'), $('ctab-' + t)); }
  function cycleCTab(d) { const t = ['stat', 'perk', 'army', 'rank', 'mon']; setCTab(t[(t.indexOf(charTab) + d + t.length) % t.length]); }
  function renderChar() {
    const P = G.priv; if (!P || !P.me.char || P.battle) return openChar(false);
    const me = P.me, C = me.char, TR = SIM.TROOPS, m = G.view && G.view.players.find((x) => x.id === G.myPid);
    $('charName').textContent = `${m ? m.name : ''}　格${C.level}　名声${C.fame}`;
    document.querySelectorAll('#char [data-ctab]').forEach((b) => b.classList.toggle('on', b.dataset.ctab === charTab));
    let html = '';
    if (charTab === 'stat') {
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
    } else if (charTab === 'mon') { // 0.36.0 家紋を選ぶ・作る
      const d = G.monDraft = G.monDraft || (me.mon ? Object.assign({}, me.mon) : monDefault());
      html += `<div class="muted" style="margin-bottom:6px">地図のあなたの印と、独立したときの家の紋になります。${me.mon ? '' : '（いまは家紋なし）'}</div>`;
      html += monEditorHtml(d, 'monPrev') + `<div class="row" style="margin-top:6px"><button id="mk-ok" data-mk="ok">この家紋にする</button></div>`;
    } else if (charTab === 'rank') {
      const R = me.rank, RK = SIM.RANKS, cur = RK[R.rank], nx = R.clan && RK[R.rank + 1] && !RK[R.rank + 1].indep ? RK[R.rank + 1] : null;
      if (me.retainers && me.retainers.length) html += `<div class="muted" style="margin-bottom:6px">家臣：${me.retainers.join('・')}（率いる人数+${me.retainers.length * 6}）</div>`;
      html += `<div class="card" style="display:block"><b>${R.clan ? R.clanName + '　' + cur.name : '浪人'}</b><br><span class="muted">${cur.desc}</span>`
        + (R.clan ? `<div class="muted">功績 ${R.merit}　俸禄 ${SIM.money(cur.stipend)}/月　率いる人数+${cur.cap}</div>` : '')
        + (R.clan ? (() => { const fb = SIM.factionBuff(G.view.factions, R.clan); return fb ? `<div class="muted">家の得意：<b>${fb.name}</b>（${fb.text}）</div>` : ''; })() : '')
        + (R.limit ? `<div class="muted">任される城 ${R.held}/${R.limit >= 99 ? '上限なし' : R.limit}</div>` : '')
        + (me.castles && me.castles.length ? `<div class="muted">治めている城：${me.castles.map((c) => `<b>${c.name}</b>（年貢 約${SIM.money(c.tax)}/月${c.lands ? '・領内の村 ' + c.lands.join('・') : ''}${c.mines ? '・' + c.mines.join('・') : ''}）`).join('・')}</div>` : '') + '</div>';
      const B = me.build;
      if (B) {
        html += `<div class="card"><div><b>築城</b>　<span class="muted">いま立っている野外に新しく城を築く（${SIM.money(B.cost)}・ほかの拠点から${B.minKm}km以上・部将以上）<br>`
          + `${B.site ? `いま${B.site}を普請中です。その城に入って「城」の画面で普請を進めます` : '縄張りのあと、その城で普請を重ねると完成し、あなたが城主になります'}</span></div>`
          + `<button id="rk-build" data-cact="buildCastle" ${B.canRank && !B.site ? '' : 'disabled'}>ここに城を築く</button></div>`;
      }
      if (!R.clan) {
        html += `<div class="muted" style="margin:6px 0">城主のいる城で仕官できます（名声${(R.serveNeed != null ? R.serveNeed : RK[1].fame)}以上）。仕えると俸禄がもらえ、主家の領地の依頼や戦で功績が積めます</div>`;
        if (R.canServe) html += `<div class="card"><div>${R.factionHere}の${R.lordHere}様に仕える</div><button id="rk-serve" data-cact="serve" ${C.fame >= (R.serveNeed != null ? R.serveNeed : RK[1].fame) ? '' : 'disabled'}>仕官する</button></div>`;
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
          html += `<div class="muted" style="margin-top:10px">戦の相手：${W.enemies.length ? W.enemies.map(fn).join('・') : 'なし'}${W.canSiege ? `　（敵の城の${W.nearKm}km以内で、城を選んで「城を包囲する」。${W.ar ? W.ar.siegeDays : 5}日後に総攻め）` : ''}</div>`;
          if (W.siege) html += `<div class="muted" style="color:#e8c060">${W.siege.name}を包囲中：${W.siege.ready ? '総攻めの支度が整っています（城を選んで「総攻めをかける」）' : `総攻めまであと${W.siege.days}日。敵の援軍に注意`}</div>`;
          for (const c of W.camps) html += `<div class="muted" style="color:#e06050">${c.att}の軍勢${c.n}人が${c.to}${c.siege ? `を包囲中（総攻めまであと${c.days}日）` : `へ進軍中（あと${c.days}日ほど）`}。城に入れば守りに加われます。軍勢に攻めかかって追い払うこともできます</div>`;
          if (W.canMuster) {
            if (W.allies) html += `<div class="card" style="margin-top:6px"><div>陣触れで加わった武将：${W.allies.gens.join('・')}<br><span class="muted">兵${W.allies.n}人・あと${W.allies.days}日。戦ではあなたの部隊として指図できます</span></div><button id="rk-disband" data-cact="disband">解散</button></div>`;
            else html += `<div class="card" style="margin-top:6px"><div>陣触れ（軍勢を集める）<br><span class="muted">主家の城で発すると、近くの城（${W.ar ? W.ar.musterKm : 40}km以内）の武将が城兵の一部を連れて加わります（${W.ar ? W.ar.musterDays : 30}日間）${W.musterCD ? `。あと${W.musterCD}日は発せません` : ''}</span></div><button id="rk-muster" data-cact="muster" ${W.musterCD ? 'disabled' : ''}>陣触れ</button></div>`;
          }
        }
        html += '<div class="muted" style="margin-top:10px">身分の一覧</div>';
        RK.forEach((r, i) => { if (i && !r.indep) html += `<div class="muted">${i === R.rank ? '▶ ' : ''}${r.name}　功績${r.merit}・名声${r.fame}　俸禄${SIM.money(r.stipend)}/月　人数+${r.cap}</div>`; });
        if (!cur.indep) html += `<div class="card" style="margin-top:10px"><div>出奔する<br><span class="muted">浪人に戻る（名声-3、功績は消え、この家には二度と仕えられない${me.castle ? '。城も返上する' : ''}）</span></div><button id="rk-leave" data-cact="leaveClan">出奔</button></div>`;
      }
    } else {
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
    const c = { type: b.dataset.cact };
    for (const k of ['attr', 'id', 'from', 'to', 'who']) if (b.dataset[k]) c[k] = b.dataset[k];
    if (b.dataset.qty) c.qty = +b.dataset.qty;
    command(c);
  });
  document.querySelectorAll('#char [data-ctab]').forEach((b) => (b.onclick = () => setCTab(b.dataset.ctab)));
  $('charClose').onclick = () => openChar(false);
  $('charBtn').onclick = () => openChar(true);
  $('mChar').onclick = () => openChar(true);
  $('townChar').onclick = () => openChar(true); // 0.29.2 拠点の画面からも人物を開ける

  // ---------- 戦闘の操作パネル ----------
  let battleHtml = '';
  const ORDN = { charge: '突撃', hold: '待機', retreat: '後退', flank: '回り込み', move: '移動中', rout: '潰走中' };
  function renderBattle(bt) {
    const TR = SIM.TROOPS;
    const sum = (side) => bt.units.filter((u) => u[1] === side).reduce((a, u) => a + (u[3] === 'hero' ? 1 : u[4]), 0);
    $('battleTitle').textContent = `${bt.foe}との戦い${bt.ck ? '（' + SIM.ckName(bt.ck) + '）' : ''}`;
    $('battleInfo').textContent = `味方 ${sum('A')}　敵 ${sum('B')}${bt.routed ? '（敗走中）' : ''}　${bt.t}秒`;
    let html = ''; // 部隊の一覧は出さない（地図の上でクリックして選ぶ）
    // 0.46.0 タップでも指図できるように：選んだ隊と全軍への指図ボタン
    const su = bt.units.find((u) => u[0] === G.selUnit && u[2] === G.myPid);
    const ob = (unit) => ['charge', 'hold', 'retreat', 'flank'].map((o) => `<button id="bo-${unit}-${o}" data-unit="${unit}" data-order="${o}">${ORDN[o]}</button>`).join('');
    if (su && su[3] !== 'hero') html += `<div class="bu"><span class="nm">${su[15] ? '本人＋' : ''}${TR[su[3]].short || TR[su[3]].name} ${su[4]}人<span class="muted">［${ORDN[su[7]] || ''}］</span></span>${ob(su[0])}</div>`;
    else html += `<div class="bu"><span class="nm muted">隊をタップして選び、地面をタップで移動</span></div>`;
    html += `<div class="bu"><span class="nm">全軍</span>${ob('all')}</div>`;
    if (bt.lead) html += `<div class="bu"><span class="nm">大将：${bt.lead === 2 ? '武将の隊も指図している' : '自分の隊だけ指図している'}</span><button id="bLead" data-lead="${bt.lead === 2 ? 0 : 1}">${bt.lead === 2 ? '自分の隊だけにする' : '武将の隊も指図する'}</button></div>`; // 0.50.0
    html += `<div class="row" style="margin-top:4px"><button id="bAuto" data-bact="battleAuto">自動で決着（スキップ）</button><button id="bFlee" data-bact="battleFlee">退却する（兵の3割を失う${bt.foe === '野盗' ? '・所持金の15%を奪われる' : ''}）</button></div>`;
    if (html !== battleHtml) { battleHtml = html; $('battleBody').innerHTML = html; G.bpick = null; setFocus($('battle'), null); }
  }
  $('battleBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sel) { G.selUnit = +b.dataset.sel; battleHtml = ''; }
    else if (b.dataset.order) command({ type: 'order', unit: b.dataset.unit, order: b.dataset.order });
    else if (b.dataset.bact) command({ type: b.dataset.bact });
    else if (b.dataset.lead) command({ type: 'leadAll', on: b.dataset.lead === '1' });
  });

  // ---------- 捕らえた武将（0.35.0：逃がすか斬るかを選ぶ） ----------
  let captiveHtml = '';
  function renderCaptive(list) {
    const el = $('captive'), on = list && list.length && !(G.priv && G.priv.battle);
    el.classList.toggle('hidden', !on); if (!on) { captiveHtml = ''; return; }
    const html = list.map(([id, nm, fn, t, b, rm, rc]) => `<div class="cp"><span>${fn}の${nm}<span class="muted">（統${t}・武${b}）</span></span><button id="cr_${id}" data-cap="releaseCaptive" data-id="${id}">逃がす（身代金${SIM.money(rm || 0)}）</button><button id="cg_${id}" data-cap="recruitCaptive" data-id="${id}" ${rc == null ? 'disabled' : ''}>${rc == null ? '登用（断られた）' : `登用する（${rc}%）`}</button><button id="ck_${id}" data-cap="killCaptive" data-id="${id}">斬る</button></div>`).join('');
    if (html !== captiveHtml) { captiveHtml = html; $('captiveBody').innerHTML = html; }
  }
  $('captiveBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b && b.dataset.cap) command({ type: b.dataset.cap, id: b.dataset.id });
  });

  // ---------- ゲーム内メニュー ----------
  function toggleMenu(open) {
    const m = $('gameMenu'); const o = open ?? m.classList.contains('hidden');
    if (o !== !m.classList.contains('hidden')) SGK.AUDIO.sfx(o ? 'open' : 'close');
    m.classList.toggle('hidden', !o); $('mMain').classList.remove('hidden'); $('mSet').classList.add('hidden');
    if (o) setFocus(m, currentFocus(m));
  }
  // B・Esc：設定を開いていればメニューへ戻る、そうでなければ閉じる
  function menuBack() { if (!$('mSet').classList.contains('hidden')) { $('mSet').classList.add('hidden'); $('mMain').classList.remove('hidden'); setFocus($('gameMenu'), $('mSettings')); } else toggleMenu(false); }
  // ---------- 設定（音・表示／操作説明：地図／操作説明：戦闘） ----------
  const PADS = {
    xbox: { name: 'Xbox系', k: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', L3: 'L3（左スティック押し込み）', BACK: 'BACK', START: 'START' } },
    ps: { name: 'PS系', k: { A: '×', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', L3: 'L3（左スティック押し込み）', BACK: 'SHARE/Create', START: 'OPTIONS' } },
    switch: { name: 'Switch', k: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', L3: '左スティック押し込み', BACK: '－', START: '＋' } },
  };
  let padStyle = 'xbox'; try { padStyle = localStorage.getItem('sgk-pad') || 'xbox'; } catch (e) {}
  if (!PADS[padStyle]) padStyle = 'xbox';
  function applyPad() { const P = PADS[padStyle]; $('mPad').textContent = `コントローラー表示：${P.name}`; document.querySelectorAll('.pk').forEach((e) => (e.textContent = P.k[e.dataset.k] || e.dataset.k)); }
  $('mPad').onclick = () => { const ks = Object.keys(PADS); padStyle = ks[(ks.indexOf(padStyle) + 1) % ks.length]; try { localStorage.setItem('sgk-pad', padStyle); } catch (e) {} applyPad(); };
  function setSetTab(id) {
    [['stSound', 'spSound'], ['stMap', 'spMap'], ['stBattle', 'spBattle']].forEach(([b, p]) => { $(b).classList.toggle('on', b === id); $(p).classList.toggle('hidden', b !== id); });
  }
  ['stSound', 'stMap', 'stBattle'].forEach((id) => ($(id).onclick = () => setSetTab(id)));
  $('mSettings').onclick = () => { $('mMain').classList.add('hidden'); $('mSet').classList.remove('hidden'); setSetTab(G.priv && G.priv.battle ? 'stBattle' : 'stMap'); setFocus($('gameMenu'), $(G.priv && G.priv.battle ? 'stBattle' : 'stMap')); };
  $('stBack').onclick = menuBack;
  const VOL = { all: 'vAll', bgm: 'vBgm', sfx: 'vSfx' };
  for (const k in VOL) $(VOL[k]).textContent = SGK.AUDIO.label(k);
  document.querySelectorAll('[data-vol]').forEach((b) => (b.onclick = () => { const k = b.dataset.vol; $(VOL[k]).textContent = SGK.AUDIO.step(k, +b.dataset.d); if (k !== 'bgm') SGK.AUDIO.sfx('coin'); }));
  applyPad();
  // ボタンを押したときの音（売り買いは小銭の音）
  document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || (b.dataset.vol && b.dataset.vol !== 'bgm')) return; SGK.AUDIO.sfx(b.dataset.act === 'buy' || b.dataset.act === 'sell' ? 'coin' : 'click'); }, true);
  $('menuBtn').onclick = () => toggleMenu(true);
  $('mClose').onclick = () => toggleMenu(false);
  $('mSave').onclick = () => { SGK.SAVE.save(G.world).then((ok) => toast(ok ? `スロット${SGK.SAVE.slot}にセーブしました` : 'セーブに失敗しました')); };
  $('mExport').onclick = () => { SGK.SAVE.save(G.world); SGK.SAVE.exportFile(G.world); };
  // 0.46.0 スマホ向け：タッチ端末なら body に touch を付け、地図のボタンを出す
  if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
  $('nearBtn').onclick = () => cycleNear();
  $('followBtn').onclick = () => $('mFollow').click();
  $('zoomIn').onclick = () => (G.priv && G.priv.battle ? (R.bcam.z *= 1.2) : R.zoom(1.2));
  $('zoomOut').onclick = () => (G.priv && G.priv.battle ? (R.bcam.z /= 1.2) : R.zoom(1 / 1.2));
  $('mFollow').onclick = () => { R.cam.follow = !R.cam.follow; toast(R.cam.follow ? '自分を追いかけます' : '追いかけを止めました', 1200); };
  $('mTitle').onclick = () => backToTitle();
  // テスト用（ホストだけ）
  $('mTest').onclick = () => { const on = document.querySelector('.testBtn').classList.contains('hidden'); document.querySelectorAll('.testBtn').forEach((b) => b.classList.toggle('hidden', !on)); };
  document.querySelectorAll('.testBtn').forEach((b) => { b.onclick = () => { if (G.mode !== 'host') return; SIM.debug(G.world, G.myPid, b.dataset.dbg); (SIM.out[G.myPid] || []).splice(0).forEach((t) => toast(t, 3000)); }; });

  // ---------- マウス・タッチ ----------
  const cv = $('map'), ctx = cv.getContext('2d');
  const ptrs = new Map(); let dragMoved = false, pinchD = 0;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, btn: e.button }); dragMoved = false; pinchD = 0; });
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) {
      p.x = e.offsetX; p.y = e.offsetY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) { if (G.priv && G.priv.battle) R.bcam.z *= d / pinchD; else R.zoom(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2); } pinchD = d; dragMoved = true; return;
    }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { dragMoved = true; R.cam.follow = false; }
    if (dragMoved) { if (G.priv && G.priv.battle) { const L = R.battleLayout(SIM.FIELD); R.bcam.x -= dx / L.sc; R.bcam.y -= dy / L.sc; } else { R.cam.x -= dx / R.cam.scale; R.cam.y -= dy / R.cam.scale; } }
  });
  cv.addEventListener('pointerup', (e) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!p || dragMoved || !G.view) return;
    const BT = G.priv && G.priv.battle;
    if (BT) { // 戦闘中：自分の部隊をクリックで選択、地面をクリックで選んだ部隊を移動
      const [fx, fy] = R.battleToField(e.offsetX, e.offsetY), L = R.battleLayout(SIM.FIELD);
      const mine = BT.units.filter((u) => u[2] === G.myPid && u[7] !== 'rout' && u[14] == null).map((u) => [u, Math.hypot(u[5] - fx, u[6] - fy)]).sort((a, b) => a[1] - b[1])[0];
      if (mine && mine[1] * L.sc < Math.max(22, (0.6 + Math.sqrt(mine[0][4]) * 0.7) * L.sc + 10) && p.btn !== 2) { G.selUnit = mine[0][0]; battleHtml = ''; return; }
      if (G.selUnit != null) command({ type: 'order', unit: G.selUnit, order: 'move', x: fx, y: fy });
      return;
    }
    const hit = R.hitSettlement(G.view, e.offsetX, e.offsetY);
    const [wx, wy] = R.toWorld(e.offsetX, e.offsetY);
    const uh = p.btn !== 2 && unitHit(e.offsetX, e.offsetY);
    if (uh) { selectUnit(uh); return; } // 部隊をクリック・タップ：情報
    if (p.btn === 2) { hit ? moveTo(hit.x, hit.y, hit.id) : moveTo(wx, wy); } // 右クリック：すぐ移動
    else if (hit) selectSettlement(hit);   // 左クリック・タップ：拠点なら情報
    else moveTo(wx, wy);                   // 地面なら移動
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (G.priv && G.priv.battle) { const L = R.battleLayout(SIM.FIELD), fx = (e.offsetX - L.ox) / L.sc, fy = (e.offsetY - L.oy) / L.sc, k = e.deltaY < 0 ? 1.15 : 1 / 1.15; R.bcam.z *= k; R.bcam.x = fx + (R.bcam.x - fx) / k; R.bcam.y = fy + (R.bcam.y - fy) / k; return; } R.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

  // ---------- キーボード ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && G.mode === 'title' && e.target.id === 'codeInput') $('btnJoinGo').click(); if (e.key === 'Enter' && e.target.id === 'fcInput') $('btnFcAdd').click(); return; }
    const k = e.key;
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (activeMenu()) {
      if (dir) { e.preventDefault(); navMenu(dir[0], dir[1]); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); pressMenu(); return; }
      if (activeMenu() === $('battle')) {
        if (k === 'Escape') { toggleMenu(true); return; }
        const o = { z: 'charge', x: 'hold', c: 'retreat', v: 'flank' }[k.toLowerCase()]; if (o) { command({ type: 'order', unit: 'all', order: o }); return; }
      }
      if (k === 'Escape') { if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); return; }
      if (activeMenu() === $('char') && (k === 'q' || k === 'e')) { cycleCTab(k === 'q' ? -1 : 1); return; }
      if (activeMenu() === $('char') && (k === 'p' || k === 'P')) { openChar(false); return; }
      if (activeMenu() === $('town') && (k === 'q' || k === 'e')) { cycleTab(k === 'q' ? -1 : 1); return; }
    }
    if (G.mode !== 'host' && G.mode !== 'client') return;
    keys.add(k.toLowerCase());
    if (k === 'Escape') toggleMenu();
    else if (k === 'f' || k === 'F') $('mFollow').click();
    else if (k === 'Tab') { e.preventDefault(); cycleNear(); }
    else if (k === 'e' || k === 'E') openTown(true);
    else if (k === 'p' || k === 'P') openChar(true);
    else if (k === 'Enter' && G.selected) $('infoGo').click();
    else if (k === '+' || k === '=') R.zoom(1.2); else if (k === '-') R.zoom(1 / 1.2);
    else if (G.mode === 'host' && '1234'.includes(k)) G.speed = [0, 1, 2, 4][+k - 1];
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // 近い拠点を順番に選ぶ（キーボードのTab／コントローラーのX）
  let nearIdx = 0;
  function cycleNear() {
    const m = me(); if (!m) return;
    const list = [...G.view.settlements].sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y)).slice(0, 6);
    const s = list[nearIdx++ % list.length]; selectSettlement(s); R.cam.follow = false; R.cam.x = s.x; R.cam.y = s.y;
  }

  // ---------- コントローラー（Xbox配置：A決定 B戻る X近くの拠点 Y追従 LB/RB拡大縮小 START メニュー／左スティック カーソル 右スティック視点） ----------
  const padPrev = {}; let navHold = 0, lastNav = 0;
  // 戦闘中のコントローラー：LB/RB で自分の部隊を選ぶ、左（右）スティックで移動先、X でそこへ移動
  // 戦闘中のコントローラー：スティックでカーソル、×/A で自分の部隊を選ぶ→行き先で ×/A を押すとそこへ移動（LB/RB でも部隊を順に選べる）
  function padBattle(down, mx, my, dt) {
    const BT = G.priv && G.priv.battle; if (!BT) return;
    const mine = BT.units.filter((u) => u[2] === G.myPid && u[7] !== 'rout' && u[14] == null);
    if (!mine.length) return;
    if (G.selUnit != null && !mine.some((u) => u[0] === G.selUnit)) G.selUnit = null;
    const F = SIM.FIELD;
    if (!G.bcur) { const u = mine.find((x) => x[0] === G.selUnit) || mine[0]; G.bcur = [u[5], u[6]]; }
    if (down(4) || down(5)) {
      const i = mine.findIndex((u) => u[0] === G.selUnit), d = down(4) ? -1 : 1;
      const u = mine[(Math.max(-1, i) + d + mine.length) % mine.length]; G.selUnit = u[0]; G.bcur = [u[5], u[6]];
    }
    if (mx || my) {
      G.bcur[0] = Math.max(0, Math.min(F.w, G.bcur[0] + mx * Math.abs(mx) * dt * 170 / R.bcam.z));
      G.bcur[1] = Math.max(0, Math.min(F.h, G.bcur[1] + my * Math.abs(my) * dt * 170 / R.bcam.z));
    }
    if (down(0) || down(2)) {
      const near = mine.map((u) => [u, Math.hypot(u[5] - G.bcur[0], u[6] - G.bcur[1])]).sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] < Math.max(8, 0.6 + Math.sqrt(near[0][4]) * 0.7 + 5) && near[0][0] !== G.selUnit) { G.selUnit = near[0][0]; SGK.AUDIO.sfx('click'); }
      else if (G.selUnit != null) { command({ type: 'order', unit: G.selUnit, order: 'move', x: G.bcur[0], y: G.bcur[1] }); toast('そこへ移動します', 800); }
    }
  }
  // 照準の十字
  function drawCross(x, y, col) {
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
      ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
    }
  }
  function pollPad(dt) {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const gp = pads[0]; if (!gp) return [0, 0];
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const down = (i) => btn(i) && !padPrev[i];
    const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0), rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    const stickNav = activeMenu() !== $('battle'); // 戦闘中は左スティックを移動先に使うので、メニュー移動は十字キーだけ
    let nx = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0) + (stickNav && Math.abs(lx) > 0.5 ? Math.sign(lx) : 0);
    let ny = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0) + (stickNav && Math.abs(ly) > 0.5 ? Math.sign(ly) : 0);
    let move = [0, 0];
    if (activeMenu()) {
      const now = performance.now();
      const inBattle = activeMenu() === $('battle');
      if (inBattle) { // 戦闘：十字キーの左右で下のボタン（自動で決着・退却）を選び、もう一度押すと選択をやめる。ボタン選択中だけ ×/A で押す
        const bb = menuButtons($('battle'));
        if (down(14) || down(15)) { const i = bb.indexOf(G.bpick), d = down(15) ? 1 : -1, j = i + d; G.bpick = j >= 0 && j < bb.length && i !== -1 ? bb[j] : i === -1 ? bb[d > 0 ? 0 : bb.length - 1] : null; setFocus($('battle'), G.bpick || null); }
        if (G.bpick && !bb.includes(G.bpick)) G.bpick = null;
        if (down(0) && G.bpick) { const b = G.bpick; G.bpick = null; setFocus($('battle'), null); b.click(); }
        else padBattle(down, lx + rx, ly + ry, dt);
      } else {
        if (nx || ny) { if (!navHold || now - lastNav > (navHold === 1 ? 400 : 150)) { navMenu(Math.abs(nx) >= Math.abs(ny) ? Math.sign(nx) : 0, Math.abs(nx) >= Math.abs(ny) ? 0 : Math.sign(ny)); lastNav = now; navHold++; } }
        else navHold = 0;
        if (down(0)) pressMenu();
      }
      if (down(1) && !inBattle) { if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); }
      if (activeMenu() === $('town')) { if (down(4)) cycleTab(-1); if (down(5)) cycleTab(1); }
      else if (activeMenu() === $('char')) { if (down(4)) cycleCTab(-1); if (down(5)) cycleCTab(1); if (down(8)) openChar(false); }
      if (!inBattle && ry) { // 右スティック：開いている画面をスクロール
        const m = activeMenu(), sc = [m, ...m.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
        if (sc) sc.scrollTop += ry * Math.abs(ry) * dt * 900;
      }
      if (down(9) && G.mode !== 'title') toggleMenu(inBattle);
    } else if (G.mode === 'host' || G.mode === 'client') {
      // 左スティック：画面のカーソルを動かす（端まで行くと地図が動く）。右スティック：視点
      const W = cv.clientWidth, H = cv.clientHeight;
      if (lx || ly) {
        if (!G.pcurOn) { G.pcurOn = true; G.pcur = [W / 2, H / 2]; }
        const sp = 650 * dt;
        G.pcur[0] = Math.max(0, Math.min(W, G.pcur[0] + lx * Math.abs(lx) * sp * 1.3));
        G.pcur[1] = Math.max(0, Math.min(H, G.pcur[1] + ly * Math.abs(ly) * sp * 1.3));
        const E = 40, ex = G.pcur[0] < E && lx < 0 ? lx : G.pcur[0] > W - E && lx > 0 ? lx : 0, ey = G.pcur[1] < E && ly < 0 ? ly : G.pcur[1] > H - E && ly > 0 ? ly : 0;
        if (ex || ey) { R.cam.follow = false; R.cam.x += ex * dt * 600 / R.cam.scale; R.cam.y += ey * dt * 600 / R.cam.scale; }
      }
      if (rx || ry) { R.cam.follow = false; R.cam.x += rx * dt * 600 / R.cam.scale; R.cam.y += ry * dt * 600 / R.cam.scale; }
      if (btn(4)) R.zoom(1 - dt * 1.5, G.pcurOn ? G.pcur[0] : undefined, G.pcurOn ? G.pcur[1] : undefined);
      if (btn(5)) R.zoom(1 + dt * 1.5, G.pcurOn ? G.pcur[0] : undefined, G.pcurOn ? G.pcur[1] : undefined);
      // 拠点・部隊の情報ウインドウ：十字キーでボタンを選び、Aで押す（スティックを動かすとカーソル操作に戻る）
      const info = $('info'), infoOpen = !info.classList.contains('hidden');
      if (!infoOpen || lx || ly) { if (G.infoNav) { G.infoNav = false; setFocus(info, null); } }
      else if (down(12) || down(13) || down(14) || down(15)) {
        if (!G.infoNav) { G.infoNav = true; const g = $('infoGo'); setFocus(info, g.offsetParent ? g : menuButtons(info)[0]); }
        else navMenu(down(15) ? 1 : down(14) ? -1 : 0, down(13) ? 1 : down(12) ? -1 : 0, info);
      }
      if (down(0) && G.infoNav) { const b = currentFocus(info); if (b) b.click(); G.infoNav = false; setFocus(info, null); }
      else if (down(0)) {
        if (G.pcurOn) { // カーソルの位置をクリック：部隊なら情報、拠点なら選ぶ（選んだ拠点をもう一度で向かう）、地面ならそこへ移動
          const [sx, sy] = G.pcur, uh = unitHit(sx, sy), hit = R.hitSettlement(G.view, sx, sy);
          if (uh) selectUnit(uh);
          else if (hit) { if (G.selKind !== 'u' && G.selected === hit.id) $('infoGo').click(); else selectSettlement(hit); }
          else { const [wx, wy] = R.toWorld(sx, sy); if (G.selected) selectSettlement(null); moveTo(wx, wy); }
        } else if (G.selected) $('infoGo').click();
        else openTown(true);
      }
      if (down(1)) { if (G.selected) selectSettlement(null); else if (G.pcurOn || !R.cam.follow) { G.pcurOn = false; R.cam.follow = true; } else command({ type: 'stop' }); }
      if (down(8)) openChar(true);
      if (G.mode === 'host' && !infoOpen && (down(14) || down(15))) { const S = [0, 1, 2, 4], i = S.indexOf(G.speed); G.speed = S[Math.max(0, Math.min(3, i + (down(15) ? 1 : -1)))]; toast(G.speed ? `時間の速さ ×${G.speed}` : '時間を止めました', 900); }
      if (down(2)) cycleNear();
      if (down(3)) $('mFollow').click();
      if (down(10)) { // L3：カーソルを自分の場所へ戻す（地図も自分に合わせて追従）
        const m = me(), d = m && (G.disp[m.id] || m);
        if (d) { R.cam.x = d.x; R.cam.y = d.y; R.cam.follow = true; G.pcurOn = true; G.pcur = [W / 2, H / 2]; }
      }
      if (down(9)) toggleMenu(true);
    }
    gp.buttons.forEach((b, i) => (padPrev[i] = b.pressed));
    return move;
  }

  // ---------- 毎フレーム ----------
  let lastFrame = performance.now(), dirSendAcc = 0, wasDirMoving = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const padMove = pollPad(dt);
    if (G.mode === 'title') SGK.AUDIO.scene('title');
    if ((G.mode === 'host' || G.mode === 'client') && buildView()) {
      if (G.mode === 'host') { G.priv = SIM.privateState(G.world, G.myPid); SIM.drain(G.myPid).forEach((t) => toast(t, 4000)); }
      // WASDで直接移動
      const BT = G.priv && G.priv.battle;
      if (BT && $('battle').classList.contains('hidden')) { SGK.AUDIO.sfx('battleStart'); $('battle').classList.remove('hidden'); openTown(false); openChar(false); selectSettlement(null); battleHtml = ''; }
      if (!BT && !$('battle').classList.contains('hidden')) { SGK.AUDIO.sfx('battleEnd'); $('battle').classList.add('hidden'); battleHtml = ''; }
      let mx = BT ? 0 : padMove[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let my = BT ? 0 : padMove[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      const m = me(); dirSendAcc += dt;
      if (BT) { mx = my = 0; }
      if (m && (mx || my)) {
        if (dirSendAcc > 0.2) { dirSendAcc = 0; const l = Math.hypot(mx, my); command({ type: 'move', x: m.x + (mx / l) * 2, y: m.y + (my / l) * 2 }); R.cam.follow = true; }
        wasDirMoving = true;
      } else if (wasDirMoving) { wasDirMoving = false; command({ type: 'stop' }); }
      // なめらか表示
      const k = Math.min(1, dt * 12);
      for (const e of [...G.view.players, ...G.view.npcs]) {
        const d = G.disp[e.id];
        if (!d || Math.hypot(d.x - e.x, d.y - e.y) > 5) G.disp[e.id] = { x: e.x, y: e.y };
        else { d.x += (e.x - d.x) * k; d.y += (e.y - d.y) * k; }
      }
      const md = m && G.disp[m.id];
      if (R.cam.follow && md) { R.cam.x += (md.x - R.cam.x) * k; R.cam.y += (md.y - R.cam.y) * k; }
      const P = G.priv, marks = new Set();
      if (P) P.me.quests.forEach((q) => marks.add(q.mk || (q.type === 'deliver' ? q.to : q.from)));
      marks.pts = P ? P.me.quests.filter((q) => q.pt).map((q) => q.pt) : [];
      if (BT) {
        for (const u of BT.units) {
          const key = 'u' + BT.id + '_' + u[0], d = G.disp[key];
          if (!d) G.disp[key] = { x: u[5], y: u[6] }; else { d.x += (u[5] - d.x) * k; d.y += (u[6] - d.y) * k; }
        }
        if (G.bcamFor !== BT.id) { // 新しい戦闘：自分の部隊が真ん中に来るように
          G.bcamFor = BT.id; const my = BT.units.filter((u) => u[2] === G.myPid);
          if (my.length) { R.bcam.x = my.reduce((a, u) => a + u[5], 0) / my.length + 90; R.bcam.y = my.reduce((a, u) => a + u[6], 0) / my.length; } R.bcam.z = 1;
          const h = my.find((u) => u[15]) || my.find((u) => u[3] === 'hero' && u[14] == null); G.selUnit = h ? h[0] : my[0] && my[0][0];
        }
        if (G.bcur) { R.bcam.x += (G.bcur[0] - R.bcam.x) * Math.min(1, k * 0.5); R.bcam.y += (G.bcur[1] - R.bcam.y) * Math.min(1, k * 0.5); }
        R.drawBattle(ctx, BT, G.disp, G.myPid, G.selUnit); renderBattle(BT);
        if (G.bcur) { const L = R.battleLayout(SIM.FIELD); drawCross(L.ox + G.bcur[0] * L.sc, L.oy + G.bcur[1] * L.sc, '#f2c14e'); }
      } else {
        G.bcur = null;
        G.view.myClan = P && P.me && P.me.rank ? P.me.rank.clan || null : null;
        R.draw(ctx, G.view, G.disp, G.myPid, G.selected, marks);
        if (G.pcurOn) drawCross(G.pcur[0], G.pcur[1], '#fff');
      }
      if (G.selKind === 'u' && !BT) refreshUnitInfo();
      $('townBtn').classList.toggle('hidden', !(P && P.here) || !!BT);
      // 拠点に着いたら自動で拠点画面を開く
      const hereId = P && P.here && !BT ? P.here.id : null;
      if (hereId && hereId !== G.lastHere && $('char').classList.contains('hidden') && $('gameMenu').classList.contains('hidden')) { SGK.AUDIO.sfx('arrive'); openTown(true); }
      // BGM：戦闘・拠点の中・昼・夜で曲を変える
      SGK.AUDIO.scene(BT ? 'battle' : !$('town').classList.contains('hidden') ? 'town' : SIM.daylight(G.view.t) < 0.5 ? 'night' : 'day');
      G.lastHere = hereId;
      if (!$('town').classList.contains('hidden')) renderTown();
      if (!$('char').classList.contains('hidden')) renderChar();
      if (P) {
        { // 本人の体力（傷は戦のあとも残り、拠点で休むと治る）
          const max = P.me.hpMax || 35, BT2 = P.battle, h = BT2 && BT2.units.find((u) => u[2] === G.myPid && u[3] === 'hero');
          const hp = BT2 ? (h ? Math.max(0, h[11] != null ? h[11] : max) : 0) : Math.round(max * (P.me.hpFrac == null ? 1 : P.me.hpFrac)), r = Math.max(0, Math.min(1, hp / max));
          const html = `体力 <span style="display:inline-block;width:110px;height:9px;background:rgba(0,0,0,.55);border:1px solid #0008;vertical-align:middle"><span style="display:block;height:100%;width:${(r * 100).toFixed(0)}%;background:${r > 0.5 ? '#6fbf73' : r > 0.25 ? '#e0c060' : '#e07a6a'}"></span></span> ${hp}/${max}${!BT2 && r < 1 ? `<span class="muted">（${P.here ? '休んで回復中' : '拠点で休むと治る'}）</span>` : ''}`;
          if ($('hpBar').innerHTML !== html) $('hpBar').innerHTML = html;
        }
        { const wb = P.me.warBoard || [], el = $('warBoard'), h = wb.length ? '<b>戦況</b>' + wb.map((x) => `<div style="color:${x.atk ? '#e0c060' : '#ff6a4a'}">${x.atk ? '⚔' : '⚠'} ${x.text}</div>`).join('') : '';
          el.classList.toggle('hidden', !h || !!(G.priv && G.priv.battle)); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } }
        renderCaptive(P.me.captives);
        $('quests').innerHTML = `所持金 ${SIM.money(P.me.money)}　荷 ${SIM.cargo(P.me)}/${P.me.cap}　名声 ${P.me.fame}${P.me.infamy ? `　<span style="color:#e07a6a">悪名 ${P.me.infamy}</span>` : ''}${P.me.rank && P.me.rank.clan ? `　功績 ${P.me.rank.merit}${(() => { const n = SIM.RANKS[P.me.rank.rank + 1]; return n && !n.indep ? '/' + n.merit : ''; })()}` : ''}　兵 ${SIM.troopCount(P.me.troops)}/${P.me.troopCap}　行軍 ${P.me.speed}km/日` + (P.me.wage ? `<br>兵の給金 ${SIM.money(P.me.wage)}/日${P.me.money < P.me.wage ? '　<b style="color:#e07a6a">払えません</b>' : '（約' + Math.floor(P.me.money / P.me.wage) + '日分）'}` : '') + (P.me.riceNeed ? `<br>士気 <b style="color:${P.me.morale < 35 ? '#e07a6a' : P.me.morale < 60 ? '#e0c060' : '#6fbf73'}">${P.me.morale}</b>　兵糧 米${(P.me.inv && P.me.inv.rice) || 0}/${P.me.riceCap}俵（1日${P.me.riceNeed}俵・${P.me.hungry ? '<b style="color:#e07a6a">米が足りません</b>' : '約' + P.me.riceDays + '日分'}）` : '') + (P.me.follow ? `<br>追跡中：${P.me.follow}` : '') + (P.me.busy ? `<br>${P.me.busy.label}中…` : '')
          + P.me.quests.map((q) => `<div class="q">◆ ${q.title}（${q.where || (q.type === 'deliver' ? sName(q.to) + 'へ' : sName(q.from) + 'へ納品')}・${dayLeft(q.deadline)}）</div>`).join('');
      }
      // HUD
      $('date').textContent = SIM.formatDate(G.view.t) + (G.speed === 0 ? '（停止中）' : G.speed > 1 ? (G.inBattle ? '（戦闘中のため×1）' : `（×${G.speed}）`) : '');
      if (m) {
        const at = m.at && G.view.settlements.find((s) => s.id === m.at);
        $('status').textContent = `${m.name}（${m.status || '浪人'}）　${BT ? '戦闘中' : at ? at.name + 'に滞在中' : m.tx != null ? `移動中（${SIM.placeName(m.x, m.y)}）` : `野外（${SIM.terrainAt(m.x, m.y)}）`}`;
      }
      document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === G.speed));
    }
    requestAnimationFrame(frame);
  }
  const fit = () => R.resize(cv);
  window.addEventListener('resize', fit); fit();
  requestAnimationFrame(frame);
  setFocus($('titleMenu'), $('btnNew'));
  show('title');
})();
