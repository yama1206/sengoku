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
  // 0.53.4 画面（index.html）だけ古いまま残っていたら、自動で読み直す（JSは毎回新しいので、バージョン表示だけ新しくなってしまう）
  { const mv = document.querySelector('meta[name="sgk-ver"]'), hv = mv ? mv.content : '';
    if (hv !== SGK.VERSION) { let n = 0; try { n = +sessionStorage.getItem('sgkReload') || 0; sessionStorage.setItem('sgkReload', n + 1); } catch (e) { n = 9; }
      if (n < 2) { location.replace(location.pathname + '?v=' + Date.now()); return; } }
    else try { sessionStorage.removeItem('sgkReload'); } catch (e) {} }
  $('verLabel').textContent = 'ver ' + SGK.VERSION;
  $('updateBtn').onclick = () => { /* 2.7.4 更新中はグルグルを出して操作できなくする */
    if (document.getElementById('updOv')) return;
    const st = document.createElement('style'); st.textContent = '@keyframes updSpin{to{transform:rotate(360deg)}}'; document.head.appendChild(st);
    const ov = document.createElement('div'); ov.id = 'updOv'; ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#fff;font-size:15px;touch-action:none';
    ov.innerHTML = '<div style="width:46px;height:46px;border:5px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:updSpin .8s linear infinite"></div><div>更新しています…</div>';
    ['pointerdown', 'click', 'touchstart', 'touchmove', 'wheel', 'contextmenu'].forEach((t) => ov.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false }));
    ['keydown', 'keyup'].forEach((t) => window.addEventListener(t, (e) => { e.preventDefault(); e.stopPropagation(); }, true));
    document.body.appendChild(ov);
    setTimeout(() => { location.href = location.pathname + '?v=' + Date.now(); }, 150);
  };
  // 1.6.4 エラーは2分出しておく（タップで消える）
  function errToast(text) { const t = document.createElement('div'); t.className = 'toast'; t.style.background = '#5a1a1a'; t.style.pointerEvents = 'auto'; t.textContent = text + '（タップで消す）'; t.onclick = () => t.remove(); $('toasts').appendChild(t); setTimeout(() => t.remove(), 120000); console.error(text); }
  /* 1.6.58 知らせの言葉に合わせて効果音を鳴らす */
  const MSG_SFX = [[/^勝利|を退けました|守り抜|攻め落と|城を落とし/, 'victory'], [/^敗北|落城しました|援軍に敗れ/, 'defeat'], [/取り立てられました|に昇進/, 'promote'], [/」達成|を終えました/, 'quest'], [/を落としました|を奪われ/, 'lost'], [/合戦に加わりました|駆けつけました/, 'join']];
  let resultSfxT = 0;
  function msgSfx(text) { if (/^【/.test(text)) return; for (const [re, k] of MSG_SFX) if (re.test(text)) { if (k === 'victory' || k === 'defeat') resultSfxT = performance.now(); SGK.AUDIO.sfx(k); return; } }
  function toastMsg(text) { msgSfx(text); toast(text, 4000); bushoReply(text); }
  // 2.14.0 武将に話しかけた時の立ち絵。返事（名前で始まる知らせ）を吹き出しに出す
  function bushoTalk(name, line, wait) {
    const img = SGK.bushoImg && SGK.bushoImg(name), el = $('bushoTalk'); if (!el) return;
    if (!img) { el.classList.add('hidden'); G.bTalk = null; return; }
    el.querySelector('img').src = img; el.querySelector('b').textContent = name; el.querySelector('span').textContent = line || '';
    el.classList.remove('hidden'); G.bTalk = wait ? { name, t: performance.now() } : null;
  }
  function bushoReply(text) {
    const b = G.bTalk; if (!b || performance.now() - b.t > 6000 || !String(text).startsWith(b.name)) return;
    const r = String(text).slice(b.name.length), q = r.match(/^「([^」]*)」/);
    $('bushoTalk').querySelector('span').textContent = q ? q[1] : text; G.bTalk = null;
  }
  function bushoClose() { const el = $('bushoTalk'); if (el) el.classList.add('hidden'); G.bTalk = null; }
  function toast(text, ms = 3000) { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = SGK.ICON ? SGK.ICON.tok(text) : text; /* 2.12.4 {i:名前} は絵 */ $('toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
  function titleMsg(text) { $('titleMsg').textContent = text || ''; }
  function show(id) { ['title', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); if (id === 'game') requestAnimationFrame(() => R.resize($('map'))); }

  // ---------- メニュー操作（キー・コントローラー：押した方向へ移動／決定してもカーソル位置は保つ） ----------
  const focusMem = {};
  function activeMenuNotBattle() { const m = activeMenu(); return m && m !== $('battle'); }
  function activeMenu() {
    if (G.mode === 'title') return $('mSet').parentNode === $('title') && !$('mSet').classList.contains('hidden') ? $('mSet') : !$('mapPanel').classList.contains('hidden') ? $('mapPanel') : !$('createPanel').classList.contains('hidden') ? $('createPanel') : !$('carryPanel').classList.contains('hidden') ? $('carryPanel') : !$('slotPanel').classList.contains('hidden') ? $('slotPanel') : !$('friendPanel').classList.contains('hidden') ? $('friendPanel') : !$('namePanel').classList.contains('hidden') ? $('namePanel') : $('joinPanel').classList.contains('hidden') ? $('titleMenu') : $('joinPanel');
    if (!$('gameMenu').classList.contains('hidden')) return $('gameMenu');
    if (!$('char').classList.contains('hidden')) return $('char');
    if (!$('town').classList.contains('hidden')) return $('town');
    if (!$('battle').classList.contains('hidden')) return $('battle');
    if (!$('captive').classList.contains('hidden')) return $('captive');
    return null;
  }
  function menuButtons(m) { const a = [...m.querySelectorAll('button')]; if (m.id === 'titleMenu') a.push($('updateBtn')); return a.filter((b) => !b.disabled && b.offsetParent); } // 0.60.2 タイトルの更新ボタンもコントローラーで選べる
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
    if (best) try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} // 0.84.1 カーソルに合わせてスクロール
    if (best && m.onNav) m.onNav(best);
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
        titleBack(); playWorld(r.world.code || null, r.world, r.from === 'main' ? `スロット${n}の続きから再開しました` : 'セーブが読めなかったので、バックアップから再開しました', n);
      } catch (err) { titleMsg(err.message); }
      return;
    }
    if (used) await SGK.SAVE.remove(n);
    SGK.SAVE.slot = n;
    const w = slotMode === 'import' ? importWorld : SIM.createWorld(Math.floor(Math.random() * 2 ** 31));
    if (slotMode !== 'import' && G.testArm) { w.test = G.testArm; G.testArm = 0; } // 2.12.1 テストモードの世界（2.33.1 1＝部将、2＝忍頭）
    const imp = slotMode === 'import'; importWorld = null; titleBack();
    if (imp) delete w.code; // 読み込んだセーブは別の世界として新しいコードを付ける
    playWorld(null, w, imp ? `セーブファイルをスロット${n}に読み込みました` : `スロット${n}に新しい世界を作りました`, n);
  });
  $('btnNew').onclick = () => openSlots('new');
  { // 2.12.1 タイトルを5回タップするとテストモード（このあと新しく作る世界が、1000貫を持った部将から始まる）
    let n = 0, t0 = 0;
    document.querySelector('#title h1').addEventListener('click', () => { const now = Date.now(); if (now - t0 > 2500) n = 0; t0 = now; if (++n < 5) return; n = 0; G.testArm = ((G.testArm || 0) + 1) % 3; titleMsg(G.testArm === 1 ? 'テストモード：このあと「新しい世界を作る」と、1000貫を持った部将から始まります（左下の「戦闘」で野戦・攻城戦を試せます）。もう5回タップすると忍びで始めます' : G.testArm === 2 ? 'テストモード（忍び）：このあと「新しい世界を作る」と、1000貫と忍び道具を持った忍頭から始まります（左下の「戦闘」で忍びの任務も試せます）。もう5回タップするとやめます' : 'テストモードをやめました'); }); // 2.33.1 5回ごとに 部将 → 忍び → やめる
  }
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
  function titleBack() { probe = null; if ($('mSet').parentNode === $('title')) { $('mSet').classList.add('hidden'); $('gameMenu').insertBefore($('mSet'), $('mMain')); } $('slotPanel').classList.add('hidden'); $('friendPanel').classList.add('hidden'); $('joinPanel').classList.add('hidden'); $('namePanel').classList.add('hidden'); $('createPanel').classList.add('hidden'); $('carryPanel').classList.add('hidden'); $('titleMenu').classList.remove('hidden'); setFocus($('titleMenu'), currentFocus($('titleMenu'))); }
  $('btnJoinBack').onclick = titleBack;
  // ---------- 2.3.0 世界の一覧（入ったことのある世界。ホストがいるか・いつまで進んだか） ----------
  let probe = null; const fstat = {};
  function renderFriends() {
    const l = SGK.CLOUD.worlds();
    $('friendList').innerHTML = l.length ? l.map(({ code }) => {
      const st = fstat[code] || {}, h = st.h, inf = st.i, live = SGK.CLOUD.fresh(h);
      const txt = !st.done ? '確認中…' : !inf && !live ? 'この世界は見つかりません' : live ? (h.ver !== SGK.VERSION ? `${(h.name || '').replace(/[<&]/g, '')}がホスト（バージョン違い ${h.ver}）` : `${(h.name || '').replace(/[<&]/g, '')}がホスト　${h.cnt || 1}/${CFG.MAX_PLAYERS}人`) : '誰もいません（入るとあなたがホストになり、時間が進みます）';
      const desc = inf ? `${SIM.formatDate(inf.min || 0)}　${(inf.names || []).join('・').replace(/[<&]/g, '')}` : '';
      return `<div class="card"><div><b style="letter-spacing:.15em">${code}</b>　<span class="muted">${desc}</span><br><span class="${live ? '' : 'muted'}" style="${live ? 'color:#8fe08f' : ''}">${txt}</span></div>`
        + `<div class="row"><button id="fj-${code}" data-fjoin="${code}" ${st.done && (inf || live) ? '' : 'disabled'}>入る</button><button id="fd-${code}" data-fdel="${code}">一覧から外す</button></div></div>`;
    }).join('') : '<div class="muted" style="text-align:center;margin:8px">まだありません。新しい世界を作るか、世界コードで入ってください</div>';
  }
  function refreshFriends() {
    const my = probe = {}; renderFriends();
    for (const { code } of SGK.CLOUD.worlds()) {
      fstat[code] = {};
      Promise.all([SGK.CLOUD.clock(code).then(() => SGK.CLOUD.rest(code, 'host')).catch(() => null), SGK.CLOUD.info(code)]).then(([h, i]) => { if (probe !== my) return; fstat[code] = { h, i, done: true }; renderFriends(); });
    }
  }
  $('btnFriend').onclick = () => { $('friendPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); refreshFriends(); setFocus($('friendPanel'), $('btnFriendRefresh')); };
  $('btnFriendBack').onclick = titleBack;
  $('btnFriendRefresh').onclick = refreshFriends;
  $('friendList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fjoin) { const c = b.dataset.fjoin; titleBack(); playWorld(c, null, ''); }
    else if (b.dataset.fdel) { SGK.CLOUD.forget(b.dataset.fdel); renderFriends(); setFocus($('friendPanel'), $('btnFriendRefresh')); }
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
  const myProf = () => { const p = loadProf(); p.carry = SGK.CARRY.load(); /* 2.50.0 引き継ぎ（新しい世界に入る最初の1回だけホストが使う） */ SGK.NET.prof = p; return p; };
  let prof = loadProf(), crNames = [];
  const crLeft = () => SIM.CREATE.base * ATK.length + SIM.CREATE.points - ATK.reduce((a, k) => a + prof.attrs[k], 0);
  function renderCreate() {
    const C = SIM.CREATE, g = SIM.GROW[prof.grow];
    let h = `<div class="muted" style="text-align:center">新しく始める人物です（すでに遊んでいるワールドの人物は変わりません）</div>`;
    h += `<div style="margin-top:6px"><b>名前</b></div><div class="row"><button id="cr-name" data-cr="name">${(($('nameInput').value.trim()) || '浪人').replace(/[<&]/g, '')}　（押して入力）</button></div>`; // 0.84.0 候補をやめ、コントローラーで打てる文字盤に
    if (!SIM.GROWTH_OFF) h += `<div style="margin-top:8px"><b>能力値</b>　<span class="muted">残り ${crLeft()}点（1つ${C.max}まで）</span></div>`; // 0.73.7 能力値・成長の型はいったん無し
    if (!SIM.GROWTH_OFF) for (const k of ATK) h += `<div class="row" style="align-items:center;gap:6px;margin:3px 0"><span style="width:4em">${SIM.ATTRS[k]}</span><button id="ca-${k}-m" data-cr="at" data-k="${k}" data-md="-1">◀</button><span style="min-width:3em;text-align:center">${prof.attrs[k]}</span><button id="ca-${k}-p" data-cr="at" data-k="${k}" data-md="1">▶</button></div>`;
    h += `<div style="margin-top:8px"><b>成長の型</b></div><div class="row" style="align-items:center;gap:6px"><button id="cg-m" data-cr="gr" data-md="-1">◀</button><span style="display:inline-block;width:8.5em;white-space:nowrap;text-align:center">${g.name}</span><button id="cg-p" data-cr="gr" data-md="1">▶</button></div><div class="muted" style="min-height:4.2em">${g.desc}</div>`; // 0.83.1 型を変えてもボタンの位置が動かないよう幅・高さを固定
    const si = Math.max(0, START.findIndex((t) => t.id === prof.start)), st = START[si], nl = nearLord(st);
    h += `<div style="margin-top:8px"><b>開始地点</b>　<span class="muted">${si + 1}/${START.length}（東から西の順）</span></div><div class="row" style="align-items:center;gap:6px"><button id="cs-mm" data-cr="st" data-md="-5">◀◀</button><button id="cs-m" data-cr="st" data-md="-1">◀</button><span style="display:inline-block;width:6em;white-space:nowrap;text-align:center">${st.name}</span><button id="cs-p" data-cr="st" data-md="1">▶</button><button id="cs-pp" data-cr="st" data-md="5">▶▶</button><button id="cs-r" data-cr="sr">おまかせ</button></div><div class="row"><button id="cs-map" data-cr="map">地図から選ぶ</button></div><div class="muted">${nl ? `近くの大名：${nl}` : ''}</div>`;
    h += `<div style="margin-top:8px"><b>家紋</b></div>` + monEditorHtml(prof.mon, 'crMon');
    h += `<div class="row" style="margin-top:8px"><button id="cr-back" data-cr="back">戻る</button><button id="cr-ok" data-cr="ok">この人物で決める</button></div>`;
    $('createBody').innerHTML = h; drawMonPrev('crMon', prof.mon);
    const pn = $('createPanel'); setFocus(pn, currentFocus(pn));
  }

  // ---------- 0.55.0 開始地点を地図から選ぶ ----------
  const SM = { sc: 1, x: 0, y: 0, W: 0, H: 0, built: false };
  const smFit = () => Math.min(SM.W / SGK.DATA.bounds.w, SM.H / SGK.DATA.bounds.h) * 0.95;
  const smTS = (x, y) => [(x - SM.x) * SM.sc + SM.W / 2, (y - SM.y) * SM.sc + SM.H / 2];
  function smSize() {
    const cv = $('smCv'), d = window.devicePixelRatio || 1; SM.W = cv.clientWidth; SM.H = cv.clientHeight;
    cv.width = SM.W * d; cv.height = SM.H * d; cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
  }
  function smClamp() { const B = SGK.DATA.bounds; SM.sc = Math.max(smFit(), Math.min(12, SM.sc)); SM.x = Math.max(0, Math.min(B.w, SM.x)); SM.y = Math.max(0, Math.min(B.h, SM.y)); }
  function smOpen() {
    $('createPanel').classList.add('hidden'); $('mapPanel').classList.remove('hidden'); smSize();
    if (!SM.built) { $('smLayer').innerHTML = START.map((t) => `<button class="smT" id="sm-${t.id}" data-sm="${t.id}"><span>${t.name}</span></button>`).join(''); SM.built = true; }
    const st = START.find((t) => t.id === prof.start) || START[0];
    SM.sc = smFit() * 3; SM.x = st.x; SM.y = st.y; smDraw(); setFocus($('mapPanel'), $('sm-' + st.id));
  }
  function smClose() { $('mapPanel').classList.add('hidden'); $('createPanel').classList.remove('hidden'); renderCreate(); setFocus($('createPanel'), $('cs-map')); }
  function smZoom(f, sx = SM.W / 2, sy = SM.H / 2) {
    const wx = (sx - SM.W / 2) / SM.sc + SM.x, wy = (sy - SM.H / 2) / SM.sc + SM.y;
    SM.sc *= f; smClamp(); SM.x = wx - (sx - SM.W / 2) / SM.sc; SM.y = wy - (sy - SM.H / 2) / SM.sc; smClamp(); smDraw();
  }
  function smDraw() {
    const ctx = $('smCv').getContext('2d'), T = SGK.DATA.terrain, B = SGK.DATA.bounds, D = SGK.DATA;
    const poly = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = smTS(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); };
    ctx.fillStyle = '#7d9fae'; ctx.fillRect(0, 0, SM.W, SM.H);
    ctx.fillStyle = '#d8cda6'; for (const l of T.lands || []) { poly(l.pts); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#7d9fae'; for (const q of T.seas) { poly(q); ctx.closePath(); ctx.fill(); }
    for (const k of T.lakes || []) if (!k.block) { poly(k.pts); ctx.closePath(); ctx.fill(); } // 2.10.0 湖
    ctx.fillStyle = 'rgba(120,128,82,.4)'; for (const m of T.mountains || []) { poly(m.pts); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = 'rgba(122,84,38,.7)'; ctx.lineWidth = 1; for (const r of T.roads || []) if ((r.rank || 2) < 3) { poly(r.pts); ctx.stroke(); }
    // 城：大名の色（大名のいない城は灰色）
    const cs = Math.max(4, Math.min(9, SM.sc * 4));
    for (const s of D.settlements) if (s.type === 'castle') {
      const [a, b] = smTS(s.x, s.y); if (a < -10 || b < -10 || a > SM.W + 10 || b > SM.H + 10) continue;
      const f = s.owner && D.factions[s.owner]; ctx.fillStyle = f ? f.color : '#888'; ctx.strokeStyle = '#1a1712'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a, b - cs); ctx.lineTo(a + cs * 0.8, b + cs * 0.6); ctx.lineTo(a - cs * 0.8, b + cs * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    for (const t of START) { const e = $('sm-' + t.id), [a, b] = smTS(t.x, t.y); e.style.left = a + 'px'; e.style.top = b + 'px'; e.classList.toggle('sel', t.id === prof.start); }
    $('smLayer').classList.toggle('names', SM.sc >= smFit() * 2.2);
    const st = START.find((t) => t.id === prof.start), nl = st && nearLord(st);
    $('smInfo').innerHTML = `<b>${st ? st.name : ''}</b>${nl ? `　<span class="muted">近くの大名：${nl}</span>` : ''}<div class="muted" style="font-size:12px">町（□）を選んで「この町に決める」。▲は城（色は大名）。ドラッグで移動・ホイール／ピンチ／LB・RBで拡大縮小</div>`;
  }
  $('mapPanel').onNav = (b) => { // コントローラー・キーで選んだ町が端に寄ったら地図を動かす
    const t = b.dataset.sm && START.find((x) => x.id === b.dataset.sm); if (!t) return;
    const [a, c] = smTS(t.x, t.y); if (a < SM.W * 0.2 || a > SM.W * 0.8 || c < SM.H * 0.2 || c > SM.H * 0.8) { SM.x = t.x; SM.y = t.y; smClamp(); smDraw(); }
  };
  $('smLayer').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || smDrag.moved) return; prof.start = b.dataset.sm; setFocus($('mapPanel'), b); smDraw(); });
  $('smIn').onclick = () => smZoom(1.5); $('smOut').onclick = () => smZoom(1 / 1.5);
  $('smRnd').onclick = () => { const t = START[Math.floor(Math.random() * START.length)]; prof.start = t.id; SM.x = t.x; SM.y = t.y; smClamp(); smDraw(); };
  $('smOk').onclick = smClose;
  const smDrag = { pts: new Map(), moved: false, d0: 0 };
  $('smBox').addEventListener('pointerdown', (e) => { smDrag.pts.set(e.pointerId, [e.clientX, e.clientY]); if (smDrag.pts.size === 1) smDrag.moved = false; if (smDrag.pts.size === 2) { const [p, q] = [...smDrag.pts.values()]; smDrag.d0 = Math.hypot(p[0] - q[0], p[1] - q[1]); } });
  $('smBox').addEventListener('pointermove', (e) => {
    const o = smDrag.pts.get(e.pointerId); if (!o) return;
    const dx = e.clientX - o[0], dy = e.clientY - o[1];
    if (smDrag.pts.size === 1) { if (!smDrag.moved && Math.hypot(dx, dy) < 6) return; smDrag.moved = true; SM.x -= dx / SM.sc; SM.y -= dy / SM.sc; smClamp(); smDraw(); }
    smDrag.pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (smDrag.pts.size === 2) { smDrag.moved = true; const [p, q] = [...smDrag.pts.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]), r = $('smBox').getBoundingClientRect(); if (smDrag.d0) smZoom(d / smDrag.d0, (p[0] + q[0]) / 2 - r.left, (p[1] + q[1]) / 2 - r.top); smDrag.d0 = d; }
  });
  const smUp = (e) => { smDrag.pts.delete(e.pointerId); if (smDrag.pts.size < 2) smDrag.d0 = 0; setTimeout(() => { if (!smDrag.pts.size) smDrag.moved = false; }, 0); };
  $('smBox').addEventListener('pointerup', smUp); $('smBox').addEventListener('pointercancel', smUp);
  $('smBox').addEventListener('wheel', (e) => { e.preventDefault(); const r = $('smBox').getBoundingClientRect(); smZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  window.addEventListener('resize', () => { if (!$('mapPanel').classList.contains('hidden')) { smSize(); smClamp(); smDraw(); } });
  function pickNames() { const SEI = SGK.SIM.SEI, MEI = ['藤吉郎', '小平太', '与一', '新左衛門', '源太', '又四郎', '弥助', '勘兵衛', '十兵衛', '孫六']; const pk = (a) => a[Math.floor(Math.random() * a.length)], set = new Set(); while (set.size < 6) set.add(pk(SEI) + pk(MEI)); crNames = [...set]; } // 1.6.1 名前の候補（army.js から MEI を消したので、ここに持つ）
  $('btnName').onclick = () => { prof = loadProf(); pickNames(); $('createPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); renderCreate(); setFocus($('createPanel'), $('cr-ok')); };
  // 2.50.0 引き継ぎ画面（タイトル）。押したボタンの位置にカーソルを残す（先頭に戻さない）
  const renderCarry = (fid) => { $('carryBody').innerHTML = SGK.CARRYUI.html(); setFocus($('carryPanel'), (fid && $(fid)) || $('cy-back')); };
  $('btnCarry').onclick = () => { $('carryPanel').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); renderCarry('cy-heir-p'); };
  $('carryBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const CY = SGK.CARRY, k = b.dataset.cy;
    if (k === 'back') { titleBack(); return; }
    if (k === 'heir') CY.setHeir(+b.dataset.md || 1);
    else if (k === 'exp') { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([CY.exportText()], { type: 'application/json' })); a.download = 'tenkaourai-carry.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); titleMsg('引き継ぎデータを書き出しました'); } catch (er) { titleMsg('書き出せませんでした'); } }
    else if (k === 'imp') { const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.onchange = () => { const fl = f.files && f.files[0]; if (!fl) return; fl.text().then((t) => { titleMsg(CY.importText(t) ? '引き継ぎデータを読み込みました' : '引き継ぎデータではありません'); renderCarry('cy-imp'); }); }; f.click(); return; }
    renderCarry(b.id);
  });
  $('createBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const C = SIM.CREATE, dir = +b.dataset.md || 0;
    if (b.dataset.mk) prof.mon = monStep(prof.mon, b.dataset.mk, dir);
    else if (b.dataset.cr === 'nm') { $('nameInput').value = b.dataset.v; localStorage.setItem('sgk_name', b.dataset.v); }
    else if (b.dataset.cr === 'more') pickNames();
    else if (b.dataset.cr === 'name') { openNameKb(); return; }
    else if (b.dataset.cr === 'at') { const k = b.dataset.k, v = prof.attrs[k] + dir; if (v >= C.base && v <= C.max && (dir < 0 || crLeft() > 0)) prof.attrs[k] = v; }
    else if (b.dataset.cr === 'st') { const n = START.length, i = START.findIndex((t) => t.id === prof.start); prof.start = START[(((i + dir) % n) + n) % n].id; }
    else if (b.dataset.cr === 'map') { smOpen(); return; }
    else if (b.dataset.cr === 'sr') prof.start = START[Math.floor(Math.random() * START.length)].id;
    else if (b.dataset.cr === 'gr') prof.grow = GK[(GK.indexOf(prof.grow) + dir + GK.length) % GK.length];
    else if (b.dataset.cr === 'back') { $('createPanel').classList.add('hidden'); titleBack(); return; }
    else if (b.dataset.cr === 'ok') { localStorage.setItem('sgk_prof', JSON.stringify(prof)); myName(); $('createPanel').classList.add('hidden'); titleBack(); titleMsg(`${myName()}（${SIM.GROW[prof.grow].name}）で${(START.find((t) => t.id === prof.start) || {}).name || ''}から始めます${crLeft() ? `（能力値の残り${crLeft()}点は使われません）` : ''}`); return; }
    renderCreate();
  });

  // 0.84.0 名前の文字盤（コントローラーだけで入力できる。ひらがな・カタカナ、濁点・半濁点・小さい字）
  const KCOL = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ を ん'];
  const KEX = ['゛', '゜', '小', 'ー', '・'];
  let nmBuf = '', nmKata = false;
  const toK = (c) => (nmKata && c >= 'ぁ' && c <= 'ゔ' ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c);
  function nkShow() { $('nameShow').textContent = (nmBuf || '　') + '_'; }
  function nkRender() {
    let h = '';
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) { const ch = KCOL[c][r]; h += ch && ch !== ' ' ? `<button id="nk-${r}-${c}" data-ch="${ch}">${toK(ch)}</button>` : '<span></span>'; }
    KEX.forEach((x, i) => { h += `<button id="nk-x${i}" data-ch="${x}">${x}</button>`; });
    $('nameKeys').innerHTML = h; $('nkMode').textContent = nmKata ? 'ひらがなへ' : 'カタカナへ'; nkShow();
  }
  function nkMod(kind) { // 最後の字に濁点・半濁点・小さい字をつける（もう一度で戻す）
    if (!nmBuf) return; const last = nmBuf.slice(-1), code = last.charCodeAt(0), kata = code >= 0x30a1 && code <= 0x30f4;
    const hc = kata ? String.fromCharCode(code - 0x60) : last;
    const T = { '゛': ['かきくけこさしすせそたちつてとはひふへほう', 'がぎぐげござじずぜぞだぢづでどばびぶべぼゔ'], '゜': ['はひふへほばびぶべぼ', 'ぱぴぷぺぽぱぴぷぺぽ'], '小': ['あいうえおつやゆよわ', 'ぁぃぅぇぉっゃゅょゎ'] }[kind];
    let i = T[0].indexOf(hc), out = null; if (i >= 0) out = T[1][i]; else if ((i = T[1].indexOf(hc)) >= 0) out = kind === '゜' ? 'はひふへほ'[i % 5] : T[0][i];
    if (!out) return; nmBuf = nmBuf.slice(0, -1) + (kata ? String.fromCharCode(out.charCodeAt(0) + 0x60) : out);
  }
  function nkDel() { nmBuf = [...nmBuf].slice(0, -1).join(''); nkShow(); }
  function openNameKb() { nmBuf = $('nameInput').value.trim(); $('createPanel').classList.add('hidden'); $('namePanel').classList.remove('hidden'); nkRender(); setFocus($('namePanel'), $('nk-0-0')); }
  function closeNameKb(save) {
    if (save) { const n = [...nmBuf.trim()].slice(0, 12).join(''); $('nameInput').value = n; localStorage.setItem('sgk_name', n || '浪人'); }
    $('namePanel').classList.add('hidden'); $('createPanel').classList.remove('hidden'); renderCreate(); setFocus($('createPanel'), $('cr-name'));
  }
  $('nameKeys').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; const ch = b.dataset.ch;
    if (ch === '゛' || ch === '゜' || ch === '小') nkMod(ch); else if ([...nmBuf].length < 12) nmBuf += toK(ch);
    nkShow();
  });
  $('nkMode').onclick = () => { nmKata = !nmKata; nkRender(); setFocus($('namePanel'), $('nkMode')); };
  $('nkDel').onclick = nkDel;
  $('nkOk').onclick = () => closeNameKb(true);
  $('btnNameBack').onclick = () => closeNameKb(false);
  $('btnJoinGo').onclick = () => { const c = $('codeInput').value.replace(/\D/g, ''); if (c.length < CL) return titleMsg(`世界コード（数字${CL}けた）を入れてください`); titleBack(); playWorld(c, null, ''); };

  // ---------- ホスト ----------
  const timerWorker = new Worker(URL.createObjectURL(new Blob(['let iv;onmessage=e=>{clearInterval(iv);if(e.data>0)iv=setInterval(()=>postMessage(0),e.data)}'], { type: 'text/javascript' })));
  let lastTick = 0, netAcc = 0, saveAcc = 0, saveCount = 0;

  // ---------- 2.3.0 世界に入る（イセログ方式）：ホストがいれば参加、いなければ自分がホスト ----------
  // code：世界コード（null なら新しく作る）／local：この端末の世界（新規・控え・読み込み）／slot：この端末の控えのスロット
  let entering = false;
  async function playWorld(code, local, msg, slot) {
    if (entering) return; entering = true;
    const CLD = SGK.CLOUD;
    try {
      if (!CLD.on()) { if (!local) throw new Error('クラウドが使えません'); SGK.SAVE.slot = slot || 0; startHost(local, msg, null); return; }
      titleMsg('世界に入っています…');
      if (!code) { code = await CLD.newCode(); local.code = code; }
      myProf();
      const ent = await SGK.NET.enter(code, () => ({ name: myName(), cnt: 1 }));
      CLD.remember(code);
      if (ent.role === 'guest') { titleMsg('ホストにつないでいます…'); startClient(ent, code); return; }
      await hostFromCloud(code, ent, local, msg, slot, null);
    } catch (e) { G.mode = 'title'; titleMsg(e.message); }
    finally { entering = false; }
  }
  // ホストになる：クラウドの世界（手元の方が新しければ手元）を読んで始める。mine：引き継いだ人の「自分の分」
  async function hostFromCloud(code, ent, local, msg, slot, mine) {
    const CLD = SGK.CLOUD;
    let w = local, cloud = null;
    try { cloud = await CLD.load(code); } catch (e) { if (/新しいバージョン/.test(e.message)) { CLD.rest(code, 'host', 'DELETE').catch(() => {}); throw e; } console.warn(e); }
    if (cloud && (!w || (cloud.savedAt || 0) > (w.savedAt || 0))) { w = cloud; if (local) msg = 'クラウドの方が新しかったので、そちらから再開しました'; }
    if (!w) { CLD.rest(code, 'host', 'DELETE').catch(() => {}); try { ent.peer && ent.peer.destroy(); } catch (e) {} throw new Error('その世界は見つかりません（世界コードを確かめてください）'); }
    w.code = code;
    SGK.SAVE.slot = slot || SGK.SAVE.slotOf(code) || 0;
    // 2.4.0 引き継ぎの準備：保存より後の「自分の分」を受け付ける／途中だった「自分で戦う」合戦は、その人が戻るか30秒たったら自動で決着
    G.loadedAt = w.savedAt || 0; G.merged = {}; G.pendingMine = mine;
    const ids = Object.keys(w.battles || {}).filter((id) => w.battles[id].act);
    G.autoWait = ids.length ? { t: performance.now(), ids } : null;
    startHost(w, msg || '{i:crown} あなたがホストになりました（いまからこの世界の時間が進みます）', ent);
  }
  // 2.4.0 引き継ぎ：参加者が持っていた「自分の分」（クラウドの保存より新しいもの）で、その人の武将を置きかえる
  function mergeMine(w, pid, mine) {
    if (!mine || !mine.p || typeof mine.p !== 'object' || mine.p.id !== pid || !(mine.ma > G.loadedAt) || (G.merged || {})[pid] || !w.players[pid]) return false;
    const old = w.players[pid], p = mine.p;
    if (old.battle && w.battles[old.battle] && p.battle !== old.battle) { // 保存のあとに終わっていた合戦からは外す（古い結果で上書きしないように）
      const b = w.battles[old.battle]; b.pids = b.pids.filter((x) => x !== pid); if (b.act && b.act.inp) delete b.act.inp[pid];
      if (!b.pids.length) SIM.autoResolve(w, b);
    }
    if (p.battle && !w.battles[p.battle]) p.battle = null;
    delete p.off; SIM.ensurePlayer(p);
    w.players[pid] = p; G.merged[pid] = 1;
    return true;
  }
  // 2.4.0 参加者：ホストが抜けたら、次のホストを探す。誰もいなければ自分が引き継ぐ
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function rejoin(why) {
    if (G.rejoining || G.mode !== 'client') return; G.rejoining = true;
    const code = G.roomCode, CLD = SGK.CLOUD, old = G.hostBoard || {}, my = G.myPid;
    if (G.net) { G.net.close(); G.net = null; }
    toast(`${why}。引き継ぎ先を探しています…`, 6000); $('roomInfo').innerHTML = `世界コード <b>${code}</b><br><span class="muted">ホストを探しています…</span>`;
    let firstAt = null;
    try {
      for (let tr = 0; tr < 40; tr++) {
        if (G.mode !== 'client' || G.myPid !== my) return; // タイトルへ戻った
        const h = await CLD.rest(code, 'host').catch(() => null);
        if (CLD.fresh(h) && h.id) {
          if (firstAt == null) firstAt = h.at;
          if (h.id !== old.id || h.at > firstAt + 1000) { // 新しいホスト（同じ人でも、掲示板がまだ更新されていれば生きている）
            if (h.ver !== SGK.VERSION) throw new Error(`新しいホストのバージョンが違います（${h.ver}）。更新ボタンを押してください`);
            const peer = await SGK.NET.openPeer(); startClient({ role: 'guest', peer, board: h }, code, true); return;
          }
        } else if (!CLD.fresh(h)) {
          await sleep(Math.random() * 2000);
          const h2 = await CLD.rest(code, 'host').catch(() => null);
          if (!CLD.fresh(h2)) {
            const peer = await SGK.NET.openPeer().catch(() => null);
            const n = await SGK.NET.claim(code, peer, () => ({ name: myName(), cnt: 1 })).catch(() => null);
            if (n) { const mine = G.mine; Object.assign(G, { dyn: null, priv: null, actView: null }); await hostFromCloud(code, { role: 'host', peer, nonce: n }, null, '{i:crown} ホストを引き継ぎました（いまからこの世界の時間が進みます）', 0, mine); return; }
            if (peer) try { peer.destroy(); } catch (e) {}
          }
        }
        await sleep(3000);
      }
      throw new Error('引き継ぎ先が見つかりませんでした。少し待ってから、もう一度入ってください');
    } catch (e) { G.mode = 'client'; backToTitle(); titleMsg(e.message); }
    finally { G.rejoining = false; }
  }
  // クラウドへ保存（ホストだけ）
  let cloudAt = 0;
  function cloudSave(force) {
    if (G.mode !== 'host' || !G.world || !G.world.code || G.noCloud) return Promise.resolve(false);
    cloudAt = 0;
    return SGK.CLOUD.save(G.world.code, G.world).then((ok) => { if (!ok && SGK.CLOUD.err && G.lastCloudErr !== SGK.CLOUD.err) { G.lastCloudErr = SGK.CLOUD.err; toast('{i:cloud} クラウド保存に失敗：' + SGK.CLOUD.err, 5000); } return ok; });
  }
  const cloudSoon = () => { if (!cloudAt) cloudAt = performance.now() + CFG.CLOUD_SOON_MS; };

  function startHost(world, msg, ent) {
    G.mode = 'host'; G.world = world; G.noCloud = false; G.speed = 1; G.disp = {}; G.selected = null;
    G.myPid = SIM.addPlayer(world, token, myName(), myProf()); SIM.localPid = G.myPid;
    if (G.pendingMine) { mergeMine(world, G.myPid, G.pendingMine); G.pendingMine = null; } G.sentMine = {}; G.mineAcc = 0;
    G.stat = SIM.staticState(world);
    show('game'); hostUI(true); toast(msg);
    centerOnMe();
    lastTick = performance.now(); netAcc = saveAcc = 0;
    timerWorker.onmessage = hostTick; timerWorker.postMessage(CFG.TICK_MS);
    SGK.SAVE.save(world); cloudSave(); G.roomCode = world.code || null; G.evKey = null;
    titleMsg('');
    if (ent) {
      G.net = SGK.NET.host(ent.peer, world.code, ent.nonce, {
        onLost: (t) => { G.noCloud = true; G.net.close(t); G.net = null; backToTitle(); titleMsg(t); },
        info: () => ({ name: myName(), cnt: (G.net ? G.net.pids().length : 0) + 1 }),
        onHello: (conn, m) => {
          const pid = SIM.addPlayer(G.world, String(m.token).slice(0, 40), String(m.name || '').slice(0, 12), m.prof);
          if (pid && m.mine && mergeMine(G.world, pid, m.mine)) cloudSoon(); // 2.4.0 引き継ぎで戻ってきた人
          if (pid) { delete G.sentMine[pid]; if (G.sentPriv) delete G.sentPriv[pid]; conn.send({ t: 'welcome', pid, static: G.stat, ver: SGK.VERSION, hostCode: G.roomCode, hostName: myName() }); toast(`${G.world.players[pid].name} が参加しました`); updateRoom(); setTimeout(() => G.net && G.net.beat(), 500); }
          return pid;
        },
        onCmd: (pid, cmd) => (cmd && cmd.type === 'ninRelay' ? ninRelay(pid, cmd) : SIM.applyCommand(G.world, pid, cmd)),
        onLeave: (pid) => { for (const b of Object.values(G.world.battles || {})) if (b.act) { delete b.act.inp[pid]; } const p = G.world.players[pid]; if (p) toast(`${p.name} が退出しました`); updateRoom(); cloudSoon(); },
      });
      if (!ent.peer) toast('通信の準備ができなかったので、ほかの人は入れません（1人で遊べます）', 5000);
    } else if (SGK.CLOUD.on()) toast('クラウドにつながらないので、この端末だけで遊びます', 5000);
    updateRoom();
  }
  // 2.41.0 忍びの協力任務のやりとりを、宛先の人へそのまま届ける（ホストが中継役）
  function ninRelay(from, cmd) {
    const m = cmd.m, to = cmd.to; if (!m || !Array.isArray(to)) return;
    for (const t of to.slice(0, 4)) { if (t === G.myPid) { { const Rv = m.ch === 'party' ? SGK.PARTY : SGK.NINJA3D; if (Rv && Rv.recv) Rv.recv(from, m); } } else if (G.net && G.net.sendTo) G.net.sendTo(t, { t: 'nin', from, m }); }
  }
  SGK.ninSend = (to, m) => { if (G.mode === 'host') ninRelay(G.myPid, { m, to }); else if (G.mode === 'client' && G.net) G.net.send({ type: 'ninRelay', to, m }); };
  // 2.42.0 みんなで遊ぶミニゲーム（party.js）に、自分の名前・同じ町の人・送る道具を渡す
  if (SGK.PARTY) SGK.PARTY.init({ me: () => G.myPid, name: () => myName(), send: (to, m) => SGK.ninSend(to, m), cmd: (c) => command(c), toast: (s) => toast(s, 2500),
    others: () => { const m0 = me(); return m0 && m0.at ? G.view.players.filter((p) => p.id !== G.myPid && p.at === m0.at).map((p) => ({ id: p.id, name: p.name })) : []; } });
  function hostTick() { try { hostTick0(); } catch (e) { const t = 'エラー(ホストの進行): ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastHostErr !== t) { G.lastHostErr = t; errToast(t); } } }
  // 2.40.4 参加者ごとの「自分用の情報」は、前に送ったものから変わっていなければ送らない（参加者は前のものを使い続ける。念のため5秒ごとには送り直す）
  function privFor(pid, now) {
    const pv = SIM.privateState(G.world, pid), j = JSON.stringify(pv); G.sentPriv = G.sentPriv || {}; const o = G.sentPriv[pid];
    if (o && o.j === j && now - o.t < 5000) return undefined;
    G.sentPriv[pid] = { j, t: now }; return pv;
  }
  function hostTick0() {
    const now = performance.now(); const dt = Math.min(5, (now - lastTick) / 1000); lastTick = now;
    G.inBattle = Object.keys(G.world.battles || {}).length > 0; // 0.32.0 誰かが戦闘中は時間を等倍に
    G.effSpeed = G.inBattle && G.speed > 1 ? 1 : G.speed;
    { const on = new Set([G.myPid, ...(G.net ? G.net.pids() : [])]); for (const id in G.world.players) G.world.players[id].off = !on.has(id); } // 0.61.1 いま接続していない人（前のマルチプレイの参加者）は地図に出さない
    SIM.step(G.world, dt * CFG.MIN_PER_SEC * G.effSpeed);
    if (SIM.planCheck) SIM.planCheck(G.world, dt); // 2.23.1 軍議の終わり（時間を止めていても）
    // 0.62.0 ホストが入っていない「自分で戦う」の戦闘は、ここで進めて、その人へ様子を送る
    for (const b of Object.values(G.world.battles || {})) {
      if (!b.act || b.pids.includes(G.myPid)) continue;
      let left = Math.min(dt, 0.5); while (left > 0 && G.world.battles[b.id]) { const st = Math.min(0.05, left); SIM.actStep(G.world, b, st); left -= st; }
    }
    if (G.net) for (const pid of G.net.pids()) {
      const p = G.world.players[pid], b = p && p.battle && G.world.battles[p.battle]; if (!b || !b.act) continue;
      b.act.sn = b.act.sn || {}; const n = b.act.sn[pid] = (b.act.sn[pid] || 0) + 1;
      G.net.sendTo(pid, { t: 'act', a: SIM.actSnap(b, n % 10 === 1) });
    }
    { // 0.54.5 1人のとき：拠点に着いたら時間を止め、次に動き出すと元の速さに戻す
      const m = G.world.players[G.myPid], at = m && m.at, solo = !G.net || !G.net.pids().length;
      if (solo && at && at !== G.lastAt && G.speed > 0 && !m.battle) { G.autoPause = G.speed; G.speed = 0; toast(`${(SIM.settlement(G.world, at) || {}).name || '拠点'}に着いたので時間を止めました（動き出すと再開）`, 2500); }
      if (G.autoPause && m && (m.tx != null || m.follow)) { G.speed = G.autoPause; G.autoPause = 0; }
      G.lastAt = at;
    }
    G.mineAcc = (G.mineAcc || 0) + dt * 1000;
    if (G.net && G.mineAcc >= CFG.MINE_SEND_MS) { // 2.4.0 参加者へ「自分の分」を送る（ホストが抜けた時の引き継ぎ用。変わった時だけ）
      G.mineAcc = 0;
      for (const pid of G.net.pids()) { const p = G.world.players[pid]; if (!p) continue; const j = JSON.stringify(p); if (G.sentMine[pid] !== j) { G.sentMine[pid] = j; G.net.sendTo(pid, { t: 'mine', p }); } }
    }
    netAcc += dt * 1000;
    if (netAcc >= CFG.NET_SEND_MS) {
      netAcc = 0;
      if (G.net) { G.net.each((pid) => { try { const st = { t: 'state', s: SIM.dynamicState(G.world, pid), sp: G.speed, priv: privFor(pid, now), msgs: SIM.drain(pid), bt: G.inBattle }; G.sentOnce = G.sentOnce || {}; if (!G.sentOnce[pid]) { G.sentOnce[pid] = 1; toast(`参加者へ様子を送りはじめました（${Math.round(JSON.stringify(st).length / 1024)}KB）`, 8000); } return st; } catch (e) { // 1.6.3 参加者への様子が作れないときは、ホストと参加者の両方にエラーを出す
          const t = 'エラー(参加者へ送信): ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastNetErr !== t) { G.lastNetErr = t; errToast(t); } return { t: 'err', text: t }; } }); }
      for (const pid in SIM.out) if (pid !== G.myPid) delete SIM.out[pid]; // 接続していない人宛ては捨てる
    }
    saveAcc += dt;
    if (saveAcc >= CFG.AUTOSAVE_SEC) { saveAcc = 0; SGK.SAVE.save(G.world); cloudSave(); if (++saveCount % CFG.BACKUP_EVERY === 0) SGK.SAVE.backup(G.world); }
    { // 2.3.0 大事な出来事（合戦が終わった・城や村の持ち主が変わった・仕官や昇進）のあとはすぐクラウドへ
      const w = G.world, k = Object.keys(w.battles || {}).length + '|' + w.settlements.map((x) => x.owner || '').join(',') + '|' + Object.values(w.players).map((p) => (p.clan || '') + (p.rank && p.rank.id || p.rank || '')).join(',');
      if (G.evKey != null && k !== G.evKey) cloudSoon(); G.evKey = k;
      if (cloudAt && now >= cloudAt) cloudSave();
      if (G.autoWait) { // 2.4.0 引き継ぐ前に途中だった「自分で戦う」合戦：その人たちが戻るか、30秒たったら自動で決着
        const AW = G.autoWait, late = now - AW.t > CFG.AUTO_WAIT_MS;
        AW.ids = AW.ids.filter((id) => { const b = w.battles[id]; if (!b || !b.act) return false; if (late || b.pids.every((p) => p === G.myPid || G.merged[p])) { SIM.autoResolve(w, b); b.pids.forEach((p) => SIM.say(p, 'ホストが代わったため、途中だった合戦は自動で決着しました')); cloudSoon(); return false; } return true; });
        if (!AW.ids.length) G.autoWait = null;
      }
      if (G.net) G.net.tick();
    }
  }
  function updateRoom() {
    if (G.mode === 'host') {
      const online = G.net ? G.net.pids() : [];
      const names = [G.world.players[G.myPid].name, ...online.map((p) => (G.world.players[p] || {}).name)].join('・');
      $('roomInfo').innerHTML = (G.roomCode ? `世界コード <b>${G.roomCode}</b>` : 'この端末だけの世界') + `<br><span class="muted">${SGK.ICON.html('crown', 16)}ホスト　${online.length + 1}/${CFG.MAX_PLAYERS}人（${names.replace(/[<&]/g, '')}）</span>`;
    } else if (G.mode === 'client') $('roomInfo').innerHTML = `世界コード <b>${G.roomCode || ''}</b><br><span class="muted">${(G.hostName || '').replace(/[<&]/g, '')}がホスト</span>${G.ping ? `<br><span class="muted">通信の遅れ ${Math.round(G.ping)}ms</span>` : ''}`;
  }
  // 2.50.0 遊んでいる人物から引き継ぎの記録を取る（20秒ごと・タブを隠す時）。参加者は、ホストから届く「自分の分」から取る
  const carryNow = () => { try { if (G.mode === 'title') return; const p = G.mode === 'client' ? G.mine && G.mine.p : G.world && G.myPid && G.world.players && G.world.players[G.myPid]; if (p) SGK.CARRY.absorb(p); } catch (e) { /* 記録できなくても遊びは続ける */ } };
  setInterval(carryNow, 20000); document.addEventListener('visibilitychange', () => { if (document.hidden) carryNow(); });
  setInterval(() => { try { if (G.mode === 'client' && G.net && G.net.ping) { G.net.ping(); updateRoom(); } else if (G.mode !== 'client') G.ping = 0; } catch (e) {} }, 2000); // 2.49.0
  function hostUI(on) { document.querySelectorAll('.hostOnly').forEach((e) => e.classList.toggle('hidden', !on)); }
  document.querySelectorAll('[data-speed]').forEach((b) => (b.onclick = () => { G.speed = +b.dataset.speed; G.autoPause = 0; }));

  // ---------- 参加者 ----------
  function startClient(ent, code, again) {
    if (!again) { G.mode = 'connecting'; G.mine = null; } G.roomCode = code; G.hostBoard = ent.board;
    SGK.NET.mine = () => (again && G.mine ? G.mine : null); // 2.4.0 引き継ぎで入り直す時だけ「自分の分」を渡す
    const onState0 = (m) => { { const t = performance.now(); G.stIv = G.stT ? (G.stIv || 200) * 0.7 + (t - G.stT) * 0.3 : 200; G.stT = t; } G.dyn = m.s; G.speed = m.sp; G.inBattle = m.bt; if (m.priv) G.priv = m.priv; (m.msgs || []).forEach(toastMsg); if (!G.centered) { G.centered = true; buildView(); centerOnMe(); } };
    G.net = SGK.NET.join(ent.peer, ent.board, token, myName(), {
      onWelcome: (m) => { G.hostName = m.hostName; G.mode = 'client'; G.myPid = m.pid; SIM.localPid = m.pid; G.actView = null; G.dyn = null; G.stat = m.static; setTimeout(() => { if (G.mode === 'client' && !G.dyn) errToast('ホストから様子が届いていません（ホストの画面にエラーが出ていないか見てください）'); }, 6000); G.disp = {}; G.selected = null; show('game'); hostUI(false); titleMsg(''); updateRoom(); toast(again ? '新しいホストにつながりました' : '参加しました'); },
      onErr: (m) => { if (G.lastErr !== m.text) { G.lastErr = m.text; errToast(m.text); } },
      onAct: (m) => { const BT = G.priv && G.priv.battle; if (BT && BT.id === m.a.id) G.actView = SIM.actApply(G.actView, m.a); },
      onState: (m) => { try { onState0(m); } catch (e) { const t = 'エラー: ' + (e && e.message); if (G.lastErr !== t) { G.lastErr = t; errToast(t); } } },
      onBye: (why) => { if (again && G.mode === 'client') { G.mode = 'client'; } backToTitle(); titleMsg(why); },
      onLost: (why) => rejoin(why),
      onPing: (ms) => { G.ping = G.ping ? G.ping * 0.6 + ms * 0.4 : ms; }, // 2.49.0 通信の遅れ（往復）
      onMine: (m) => { if (m.p && m.p.id === G.myPid) G.mine = { p: m.p, ma: SGK.CLOUD.now() }; },
      onNin: (m) => { const Rv = m.m && m.m.ch === 'party' ? SGK.PARTY : SGK.NINJA3D; if (Rv && Rv.recv) Rv.recv(m.from, m.m); },
    });
  }

  function backToTitle() {
    if (G.mode === 'host') {
      SGK.SAVE.save(G.world); timerWorker.postMessage(0);
      const net = G.net; if (net) net.close();
      cloudSave().finally(() => { if (net) net.unboard(); }); // 保存が終わってから掲示板を消す（次の人が古い世界を読まないように）
    } else if (G.net) G.net.close();
    Object.assign(G, { mode: 'title', world: null, net: null, dyn: null, view: null, centered: false, roomCode: null, mine: null, autoWait: null, pendingMine: null });
    $('gameMenu').classList.add('hidden'); $('info').classList.add('hidden'); $('town').classList.add('hidden'); $('battle').classList.add('hidden'); $('char').classList.add('hidden'); G.priv = null;
    contBtn();
    show('title');
  }
  // タブを閉じるときもセーブ
  window.addEventListener('pagehide', () => { if (G.mode === 'host') { SGK.SAVE.save(G.world); if (G.net) G.net.unboard(true); } });
  // 2.3.0 画面を隠した時（タブの切り替え・閉じる前など）にクラウドへ保存。閉じる瞬間は大きなデータを送れないので、ここで先に送っておく
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && G.mode === 'host') cloudSave(); else if (document.visibilityState === 'visible' && G.mode === 'host' && G.net) G.net.beat(); });

  // ---------- 表示用データ ----------
  function buildView() {
    if (G.mode === 'host') {
      const w = G.world;
      const m = w.players[G.myPid], sr = m ? SIM.sightRadius(w, m) : 0;
      const vis = (e) => !m || e === m || SIM.canSee(m, sr, e.x, e.y);
      G.view = { t: w.time.min, sr, settlements: w.settlements, factions: w.factions, people: w.people, wars: Object.keys(w.wars || {}), players: Object.values(w.players).filter((p) => p === m || !p.off), /* 1.6.52 プレイヤーは視界の外でも出す */
        // 0.54.3 ホストでも参加者と同じ形に（大将の名前・率いる武将・用件を付ける。前はホストだけ「武将の隊」と出ていた）
        npcs: Object.values(w.npcs).filter(vis).map((n) => Object.assign({}, n, { battle: n.battle ? 1 : n.fight ? 2 : 0, at: n.tx == null ? n.at || null : null, pname: SIM.npcName ? SIM.npcName(w, n) : null,
          extra: n.kind === 'bushou' ? n.purpose : n.kind === 'ronin' ? [n.need, n.fee] : null, lead: SIM.npcLead ? SIM.npcLead(w, n) : null })), bm: SIM.battleMarks ? SIM.battleMarks(w, G.myPid) : [] };
    } else if (G.mode === 'client' && G.dyn) {
      const d = G.dyn, s = G.stat;
      if (d.pp) G.pp = d.pp; if (d.ps) G.ps = d.ps; // 0.52.0 人口（0.70.0 物資のそろい具合も）
      if ((d.rv || 0) !== (G.rv || 0)) { G.rv = d.rv || 0; SIM.applyRoads(d.ra || []); } // 0.40.0 普請でできた道
      G.view = {
        t: d.t, sr: d.sr, settlements: withOwners(d.ns && d.ns.length ? s.settlements.filter((x) => !d.ns.some((n) => n.id === x.id)).concat(d.ns) : s.settlements, d.ow),
        factions: d.pf && Object.keys(d.pf).length ? Object.assign({}, s.factions, d.pf) : s.factions, people: s.people, wars: d.wars || [],
        players: d.p.map(([id, name, x, y, at, tx, ty, status, path, spd]) => ({ id, name, x, y, at, tx, ty, status, path, spd, mon: d.mons && d.mons[id] })),
        npcs: d.n.map(([id, kind, faction, x, y, size, battle, dest, cargo, army, home, at, pname, extra, lead, spd]) => ({ id, kind, faction, x, y, size, battle, dest, at, cargo: cargo && { item: cargo[0], qty: cargo[1] }, army, home, pname, lead, extra, spd })),
        bm: d.bm || [], /* 1.6.51 味方の合戦の印 */
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
  SGK.cmd = command; // 2.11.0 釣り・虫取りの画面（gather.js）から使う
  function moveTo(x, y, dest) { command({ type: 'move', x, y, dest: dest || null }); if (!dest && SIM.isSea(x, y)) toast('海の上には移動できません', 1500); }

  // ---------- 拠点の情報 ----------
  function selectSettlement(s) {
    G.selected = s ? s.id : null; G.selKind = s ? 's' : null; G.lookJob = null; $('infoGo').textContent = 'ここへ向かう'; $('infoAct').classList.add('hidden');
    if (!s) { $('info').classList.add('hidden'); return; }
    const f = G.view.factions[s.owner], lord = lordName(s);
    const kind = { castle: '城', town: '町', village: '村' }[s.type];
    $('infoName').textContent = s.name;
    const ho = holders()[s.id];
    $('infoBody').innerHTML = `${kind}${s.site ? `（普請中 ${Math.floor(s.site.prog * 100)}%）` : ''}　勢力：<b style="color:${f ? f.color : '#ccc'}">${f ? f.name : 'なし'}</b>${(() => { const fb = SIM.factionBuff(G.view.factions, s.owner); return fb ? `<span class="muted">（得意：${fb.name}・${fb.text}）</span>` : ''; })()}${(() => { const r = SIM.chihoOf && SIM.CHIHO[SIM.chihoOf(s)]; return r ? `　<span class="muted">${r.name}（名物：${SIM.TROOPS[r.sp].name}）</span>` : ''; })()}<br>城主・代官：${ho ? `<b>${ho}</b>（プレイヤー）` : lord || '（不明）'}`;
    { const ry = SIM.ryoOf && SIM.ryoOf(s.id), rc = ry && G.view.settlements.find((x) => x.id === ry); // 0.52.0 城と村・町のつながり
      { const pop = (G.mode === 'client' ? G.pp && G.pp[s.id] : ((G.world && G.world.settlements.find((x) => x.id === s.id)) || {}).pop); if (pop) { const ws = G.world && G.world.settlements.find((x) => x.id === s.id), sf = G.mode === 'client' ? (G.ps && G.ps[s.id]) / 100 : ws && SIM.supplyF ? SIM.supplyF(ws) : null; const sl = sf == null || isNaN(sf) ? '' : sf >= 1.05 ? '　物資：豊富（人が増えやすい）' : sf >= 0.75 ? '　物資：ふつう' : sf >= 0.45 ? '　物資：不足（人が増えにくい）' : '　物資：困窮（人が減る）'; $('infoBody').innerHTML += `<br>人口 約${(Math.round(pop / 10) * 10).toLocaleString()}人${sl}`; } }
      if (SIM.minato && SIM.minato(s)) $('infoBody').innerHTML += `<br>${SGK.ICON.html('anchor', 16)} ${SIM.minatoName(s)}（年貢×${SIM.minatoMul(s)}）`;
      if (rc) $('infoBody').innerHTML += `<br>${rc.name}の領内`;
      if (s.type === 'castle') { const ls = G.view.settlements.filter((v) => SIM.ryoOf(v.id) === s.id); if (ls.length) $('infoBody').innerHTML += `<br>領内：${ls.map((v) => v.name + (SIM.minato(v) ? SGK.ICON.html('anchor', 14) : '') + (v.owner !== s.owner ? '（他家）' : '')).join('・')}`; const ms = SIM.minesOf(s); if (ms.length) $('infoBody').innerHTML += `<br>鉱山：${ms.map((m) => m.name + `（月+${SIM.money(SIM.KUNI.mineInc[m.k])}）`).join('・')}`; } }
    if (s.type === 'castle') {
      const cs = castleStat(s), m = G.priv && G.priv.me, W = m && m.war, R = m && m.rank, at = G.view.wars || [];
      const lordN = cs.lordName;
      $('infoBody').innerHTML += `<br>${{ yama: '山城（守りが堅い）', mizu: '水城（水堀が広い）' }[SIM.castleKind(s)] || '平城'}　守備兵 約${cs.gar}人${lordN && cs.loyal != null ? `　${lordN}の忠誠 ${cs.loyal}` : ''}`;
      { const V = m && m.vass && m.vass[s.id], fmt = ([nm]) => nm; // 0.34.0 城の武将
        if (V) $('infoBody').innerHTML += `${V.lord ? `<br>城主：${fmt(V.lord)}` : ''}<br>家臣：${V.vass.length ? V.vass.map(fmt).join('・') : 'なし'}`;
        else $('infoBody').innerHTML += '<br><span class="muted">（40km以内に近づくと家臣の武将が分かります）</span>'; }
      if (cs.bs) $('infoBody').innerHTML += `<br><b style="color:#e06050">${cs.bs.by}が攻城戦の準備をしている（総攻めまであと${cs.bs.days}日）</b>`;
      const mine = R && R.clan, war = mine && s.owner !== mine && at.includes(mine < s.owner ? `${mine}|${s.owner}` : `${s.owner}|${mine}`);
      if (war) $('infoBody').innerHTML += '　<b style="color:#e06050">交戦中</b>';
      const mp = me(), near = mp && Math.hypot(mp.x - s.x, mp.y - s.y) <= (W ? W.nearKm : 2);
      let act = null;
      const sg = W && W.siege && W.siege.sid === s.id ? W.siege : null;
      if (sg) $('infoBody').innerHTML += `<br>${sg.ready ? '総攻めの支度が整っています' : `攻城戦準備中：総攻めまであと${sg.days}日`}`;
      if (sg && sg.ready && near) act = { label: '総攻めをかける', cmd: { type: 'assault', id: s.id } };
      else if (sg) act = { label: '攻城戦の準備をやめる', cmd: { type: 'liftSiege' } };
      else if (war && W.canSiege && near && !(W.siege)) act = { label: `攻城戦の準備をする（${W.ar ? W.ar.siegeDays : 5}日後に総攻め）`, cmd: { type: 'siege', id: s.id } };
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
  $('infoAct').onclick = () => { const c = G.infoCmd; if (c && c.type === 'talkNpc') { const u = findUnit(c.id); if (u && u.pname) bushoTalk(u.pname, '', true); } if (typeof c === 'function') c(); else if (c) command(c); };
  $('bushoTalk').onclick = bushoClose;
  $('infoBody').addEventListener('click', (e) => { const im = e.target.closest('img[data-bt]'); if (im) bushoTalk(im.dataset.bt, ''); }); // 小さな絵を押すと大きく
  $('infoGo').onclick = () => {
    if (G.selKind === 'u') { const u = findUnit(G.selected); if (u) command({ type: 'follow', id: u.id }); selectSettlement(null); return; } // 0.60.0 追いかけると閉じる
    const s = G.view.settlements.find((x) => x.id === G.selected);
    if (s && G.lookJob) { command({ type: 'acceptJob', id: G.lookJob }); G.lookJob = null; } /* 1.6.47 依頼を受けてから向かう */
    if (s) {
      const m0 = me(), P0 = G.priv; // 2.40.1 すでにその拠点にいるなら、移動しないで拠点の画面を開く（参加者は「着いた」の変化が見えず、開かなかった）
      if (m0 && m0.at === s.id && m0.tx == null && P0 && P0.here && P0.here.id === s.id && !P0.battle) { selectSettlement(null); openTown(true); return; }
      moveTo(s.x, s.y, s.id); selectSettlement(null); // 0.54.4 向かうと閉じる
    }
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
    // 0.60.0 移動の速さ（足もとの地形の倍率込み）と、自分との比べ
    const myS = G.priv && G.priv.me && G.priv.me.speed;
    const spdTxt = u.spd ? (() => {
      const mul = SIM.speedAt ? SIM.speedAt(u.x, u.y) : 1, now = Math.round(u.spd * mul), tr = SIM.terrainHere ? SIM.terrainHere(u.x, u.y) : '';
      const cmp = myS ? (u.spd > myS * 1.05 ? '<b style="color:#e07a6a">こちらより速い</b>' : u.spd < myS * 0.95 ? '<b style="color:#6fbf73">こちらより遅い</b>' : 'こちらと同じくらい') : '';
      return `<br>移動の速さ：${u.spd}km/日<span class="muted">（いまの${tr || '地形'}では約${now}km/日）</span>${cmp ? '　' + cmp : ''}`;
    })() : '';
    const TR = SIM.TROOPS, ar = u.army ? Object.entries(u.army).filter(([, n]) => n > 0).map(([k, n]) => `${(TR[k] || {}).name || k} ${n}人`).join('・') : `${u.size}人`;
    if (u.kind === 'merchant') {
      const it = u.cargo && SGK.DATA.items[u.cargo.item], pr = it && SIM.cargoPrice(u.cargo.item);
      return { name: '行商人', body: `${where}${spdTxt}<br>荷：${it ? `${it.name} ${u.cargo.qty}${it.unit}　<span class="muted">売値 約${pr}文/${it.unit}（1度に5${it.unit}まで）</span>` : 'なし'}<br><span class="muted">町から町へ品物を運んでいる。1.5km以内なら荷を買える。運んだ先では品物が安くなる。</span>`,
        go: '追いかける', act: it ? { label: `${it.name}を買う`, cmd: { type: 'buyCargo', id: u.id } } : null };
    }
    const talk = Number(km) <= 1.5 ? { label: '話しかける', cmd: { type: 'talkNpc', id: u.id } } : null;
    const jf = u.battle && u.battle !== 2 && Number(km) <= 2 ? { label: '攻めかかる', cmd: { type: 'joinFight', id: u.id } } : null; /* 1.6.22 戦闘中の相手 → 合戦に加わる */
    const R0 = G.priv && G.priv.me && G.priv.me.rank, myC = R0 && R0.clan, wars0 = G.view.wars || [];
    const atWar = myC && u.faction && wars0.includes(myC < u.faction ? `${myC}|${u.faction}` : `${u.faction}|${myC}`);
    const atk = atWar && u.battle !== 1 && Number(km) <= 2 ? { label: u.battle === 2 ? '加勢して攻めかかる' : '攻めかかる', cmd: { type: 'attackArmy', id: u.id } } : null;
    const leadTxt = u.lead && u.lead.length ? '<br>' + (u.kind === 'army' ? '武将' : '大将') + '：' + u.lead.map(([nm]) => nm).join('・') : '';
    const warNote = atWar ? '<br><b style="color:#ff6a4a">戦をしている家の武将です</b>（こちらと互角以上なら攻めかかってきます）' : '';
    // 0.54.0 取引（1.5km以内・戦をしていない家の、武将が率いる隊）
    const T0 = !atWar && !u.battle && Number(km) <= 1.5 && G.priv && G.priv.me && G.priv.me.tr && G.priv.me.tr[u.id];
    const trade = T0 ? `<div class="trade"><span class="muted">取引（好感${T0.fav}）</span><br>`
      + `<button id="tr-rice" data-tr="rice" ${T0.rice ? '' : 'disabled'}>米を売る（1俵${T0.rp}文）</button>`
      + (u.kind !== 'army' ? `<button id="tr-troop" data-tr="troop" ${T0.troop ? '' : 'disabled'}>兵を譲ってもらう</button>` : '')
      + `<button id="tr-gift" data-tr="gift" ${T0.gift && T0.fav < 5 ? '' : 'disabled'}>進物を贈る（1貫）</button></div>` : '';
    if (u.kind === 'bushou') return { name: `${u.pname || '武将'}（${f ? f.name : ''}）`, body: `勢力：${fn}<br>${u.extra || ''}　${where}${spdTxt}<br>供回り：${ar}${leadTxt}${warNote}<br><span class="muted">${talk ? '話しかけると顔をつなげる（その家に名声2で仕官できる）。うわさも聞ける' : '1.5km以内まで近づくと話しかけられる'}</span>${trade}`, go: '追いかける', act: atk || (atWar ? null : talk) };
    if (u.kind === 'ronin') { const [need, fee] = u.extra || [0, 0]; return { name: `浪人 ${u.pname || ''}`, body: `${where}${spdTxt}<br>手勢：${ar}<br>家臣になる条件：名声${need}・支度金${SIM.money(fee)}<br><span class="muted">主を持たない武将。家臣にすると手勢が加わり、率いる人数が増える（家臣は3人まで）${talk ? '' : '。1.5km以内まで近づくと話しかけられる'}</span>`, go: '追いかける', act: talk ? { label: '家臣に誘う', cmd: talk.cmd } : null }; }
    if (u.kind === 'patrol') return { name: `${u.pname ? u.pname + '隊' : '武将の隊'} ${u.size || ''}人`, act: u.battle ? jf : atk || (atWar ? null : talk), body: `${u.battle === 2 ? '<b style="color:#ff6a4a">野盗と交戦中</b>（野盗に近づくと加勢できる）<br>' : u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}勢力：${fn}<br>${where}${spdTxt}${u.home ? `<br>本拠：${sName(u.home)}` : ''}<br>兵：${ar}${leadTxt}${warNote}<br><span class="muted">城の家臣の武将が交代で兵を率いて、自勢力の拠点のあいだを回り、近くの野盗を退治する。話しかけると顔をつなげる。</span>${trade}`, go: '追いかける' };
    if (u.kind === 'army') {
      const t = G.mode === 'host' ? SIM.armyText(G.world, G.world.npcs[u.id]) : ((G.dyn && G.dyn.ar) || {})[u.id];
      const R = G.priv && G.priv.me && G.priv.me.rank, mine = R && R.clan, wars = G.view.wars || [];
      const war = mine && u.faction && wars.includes(mine < u.faction ? `${mine}|${u.faction}` : `${u.faction}|${mine}`);
      const act = war && u.battle !== 1 && Number(km) <= ((G.priv.me.war && G.priv.me.war.ar) ? G.priv.me.war.ar.fightKm : 2) ? { label: u.battle === 2 ? '加勢して攻めかかる' : '攻めかかる', cmd: { type: 'attackArmy', id: u.id } } : null; /* 1.6.35 */
      return { name: `${t ? t.name : '軍勢'} ${u.size}人`, act: act || jf, body: `${u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}勢力：${fn}${war ? '　<b style="color:#e06050">交戦中</b>' : ''}<br>${t ? t.text : ''}${spdTxt}<br>兵：${ar}<br><span class="muted">${war ? `敵の軍勢。${(G.priv.me.war && G.priv.me.war.ar ? G.priv.me.war.ar.fightKm : 2)}km以内まで近づくと攻めかかれます。打ち破れば攻城戦の準備が崩れます` : '武将たちが率いる軍勢'}</span>${war ? '' : trade}`, go: '追いかける' };
    }
    if (u.kind === 'bandit') {
      return { name: `野盗 ${u.size}人`, act: jf, body: `${u.battle === 2 ? '<b style="color:#ff6a4a">巡回兵と交戦中</b>（近づくと加勢できる）<br>' : u.battle ? '<b style="color:#ff6a4a">戦闘中</b><br>' : ''}${where}${spdTxt}<br>手勢：${ar}<br><span class="muted">近づくと襲ってくる。倒すと金品が手に入る。</span>`, go: u.battle === 2 ? '追いかけて加勢する' : '追いかけて攻めかかる' } /* 1.6.67 */;
    }
    // 他のプレイヤー（0.54.0 1.5km以内なら取引）
    const M = G.priv && G.priv.me; let ptr = '';
    if (M) {
      const offs = (M.offIn || []).filter((o) => o.from === u.id);
      for (const o of offs) { const it = o.tk ? { name: SIM.TROOPS[o.tk].name, unit: '人' } : SGK.DATA.items[o.item]; ptr += `<div class="trade"><b>申し出</b>：${it.name}${o.qty}${it.unit}を${SIM.money(o.price)}で<br><button id="po-ok-${o.id}" data-tr="ok" data-oid="${o.id}" ${M.money < o.price ? 'disabled' : ''}>買う</button><button id="po-ng-${o.id}" data-tr="ng" data-oid="${o.id}">断る</button></div>`; }
      if (Number(km) <= 1.5) {
        ptr += `<div class="trade"><span class="muted">渡す</span><br><button id="pg-m1" data-tr="pm" data-qty="1000" ${M.money >= 1000 ? '' : 'disabled'}>1貫</button><button id="pg-m10" data-tr="pm" data-qty="10000" ${M.money >= 10000 ? '' : 'disabled'}>10貫</button></div>`;
        const trs = Object.entries(M.troops || {}).filter(([k, n]) => k !== 'hero' && n > 0);
        if (trs.length) ptr += `<div class="trade"><span class="muted">兵を預ける・売りに出す（雇うときの値段／2割引き。相手の率いる人数に空きが要ります）</span>` + trs.map(([k, n]) => `<br>${SIM.TROOPS[k].name} ${n}人　` + [1, 5, 10].filter((q) => q < n).map((q) => `<button id="pt-${k}-${q}" data-tr="pt" data-kind="${k}" data-qty="${q}">${q}人</button>`).join('') + `<button id="pt-${k}-a" data-tr="pt" data-kind="${k}" data-qty="${n}">全員</button>`
          + `<br>　売りに出す：` + [...new Set([Math.min(5, n), n])].map((q) => `<button id="pq-${k}-${q}" data-tr="ps" data-tk="${k}" data-qty="${q}" data-mul="1">${q === n ? '全員' : q + '人'}を${SIM.money(SIM.TROOPS[k].cost * q)}</button>`).join('')
          + `<button id="pq-${k}-d" data-tr="ps" data-tk="${k}" data-qty="${n}" data-mul="0.8">全員を${SIM.money(Math.round(SIM.TROOPS[k].cost * n * 0.8 / 10) * 10)}</button>`).join('') + '</div>';
        const inv = Object.entries(M.inv || {}).filter(([, n]) => n > 0);
        if (inv.length) ptr += `<div class="trade"><span class="muted">荷（渡す／相場で売りに出す／2割引きで売りに出す）${(M.offOut || []).includes(u.id) ? '　申し出中' : ''}</span>` + inv.map(([k, n]) => { const it = SGK.DATA.items[k], q = Math.min(n, 10); return `<br>${it.name}${n}${it.unit}　<button id="pi-${k}" data-tr="pi" data-item="${k}" data-qty="${q}">${q}渡す</button><button id="ps-${k}" data-tr="ps" data-item="${k}" data-qty="${q}" data-mul="1">${q}を${SIM.money(it.base * q)}</button><button id="pd-${k}" data-tr="ps" data-item="${k}" data-qty="${q}" data-mul="0.8">${q}を${SIM.money(Math.round(it.base * q * 0.8 / 10) * 10)}</button>`; }).join('') + '</div>';
      } else ptr += '<br><span class="muted">1.5km以内まで近づくと取引できます</span>';
    }
    return { name: u.name, body: `プレイヤー（${u.status || '浪人'}）<br>${where}${spdTxt}${ptr}`, go: '追いかける' };
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
    const pic = u.pname && SGK.bushoImg && SGK.bushoImg(u.pname); // 2.14.0 武将の絵
    $('infoName').textContent = i.name; $('infoBody').innerHTML = (pic ? `<img class="uPic" src="${pic}" data-bt="${u.pname}" alt="">` : '') + i.body; $('infoGo').textContent = i.go;
    G.infoCmd = i.act ? i.act.cmd : null; $('infoAct').classList.toggle('hidden', !i.act); if (i.act) $('infoAct').textContent = i.act.label;
  }
  $('infoClose').onclick = () => { bushoClose(); if (G.priv && G.priv.me && G.priv.me.meet) command({ type: 'meetEnd' }); selectSettlement(null); };
  // 0.54.0 取引のボタン（武将・プレイヤー）
  $('infoBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tr]'); if (!b || !G.selected) return; const d = b.dataset, id = G.selected;
    if (['rice', 'troop', 'gift'].includes(d.tr)) command({ type: 'npcTrade', id, kind: d.tr });
    else if (d.tr === 'ok' || d.tr === 'ng') command({ type: 'pOfferAns', id: d.oid, ok: d.tr === 'ok' });
    else if (d.tr === 'pm') command({ type: 'pGive', to: id, what: 'money', qty: +d.qty });
    else if (d.tr === 'pt') command({ type: 'pGive', to: id, what: 'troop', kind: d.kind, qty: +d.qty });
    else if (d.tr === 'pi') command({ type: 'pGive', to: id, what: 'item', item: d.item, qty: +d.qty });
    else if (d.tr === 'ps') command({ type: 'pOffer', to: id, item: d.item, tk: d.tk, qty: +d.qty, mul: +d.mul });
    G.infoHtml = '';
  });

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
  const TOWN_SECS = { street: [], renpei: ['army', 'work', 'jobs'] }, SEC_NAME = { army: '募兵', work: '調練・仕事', jobs: '依頼' };
  const TA = 'assets/town/';
  function townStage(P, hs) {
    const me = P.me, h = P.here, mu = h.musume, big = SGK.DATA.isBig(hs), isHome = me.home && me.home.id === h.id;
    const say = (who, t) => `<div class="say"><b>${who}</b>${t}</div>`;
    if (townTab === 'street') {
      return ['street', 'street2.jpg', '']; // 2.13.1 行き先は上のボタン（ほかの所と同じ並び）
    }
    if (townTab === 'market') {
      return ['', 'shop.jpg', `<img class="who" src="${TA}merchant_p.png" style="transform:scaleX(-1)">` + say('商人', 'いらっしゃい。よい品が入っていますよ')];
    }
    if (townTab === 'renpei') return ['', 'renpei.jpg', `<img class="who" src="${TA}drill_p.png">` + say('練兵所の師範', '腕を上げたければ、ここで鍛えていけ。兵も雇えるし、仕事の口も回してやるぞ')];
    if (townTab === 'gamble') return ['', '../gamble/den.jpg', `<img class="who" src="${TA}boss4.png">` + say('賭場の胴元', 'おう、遊んでいくかい。運も腕のうちだぜ')];
    if (townTab === 'talk') { // 2.13.1 茶屋：大きな町には娘がいる
      if (mu) return ['', 'chaya.jpg', `<img class="who" src="${TA}${mu.img}.png">` + say(`${mu.name}　<span class="heart">${'♥'.repeat(mu.wife ? 5 : mu.st)}${'♡'.repeat(mu.wife ? 0 : 4 - mu.st)}</span>`, (G.muSay && G.muSay[0] === mu.id && performance.now() - G.muSay[2] < 6000) ? G.muSay[1] : mu.line)];
      return ['', 'chaya.jpg', say('茶屋', '旅の人や町の人が、相場や戦の噂をしている')];
    }
    if (townTab === 'home') { const wf = me.wife; return isHome ? ['', 'home.jpg', wf ? `<img class="who" src="${TA}${wf.img}.png">` + say(wf.name, wf.line) : say('自宅', '落ち着ける我が家。金庫と物置があり、ゆっくり休める')] : ['none', '', '']; }
    return ['none', '', ''];
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
    { const [cls, bg, inner] = townStage(P, hs), key = townTab + '|' + bg + '|' + inner; // 2.13.0 町の絵
      if (key !== stageKey) { stageKey = key; const st = $('townStage'); st.className = cls; st.style.backgroundImage = bg ? `url(${TA}${bg})` : ''; st.innerHTML = inner; } }
    $('townName').textContent = sName(h.id) + (SGK.DATA.isBig(hs) ? '（大きな町）' : '');
    document.querySelectorAll('#town [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === townTab));
    let html = '';
    const NJ = me.nin; // 0.77.0 忍び：工作の城に入ったら「忍び込む」
    const njName = (q) => SIM.NIN.jobs[q.k].name + (q.k === 'steal' && SIM.NIN.steal[q.sk] ? `（${SIM.NIN.steal[q.sk].name}）` : ''); // 2.24.0
    const njDesc = (q) => (q.k === 'steal' && SIM.NIN.steal[q.sk] ? SIM.NIN.steal[q.sk].desc + `（${SIM.NIN.steal[q.sk].where}にある）` : q.k === 'hurt' ? `寝所の${q.whoName || '武将'}に手傷を負わせる（殺しはしない）。成功すると${q.whoName || 'その武将'}は${SIM.NIN.hurtDays}日のあいだ出陣できない` : SIM.NIN.jobs[q.k].desc);
    if (NJ && NJ.atTgt && NJ.q) html += `<div class="card" style="display:block;border-color:#c33"><b>${njName(NJ.q)}</b>（${NJ.q.foe}・${NJ.q.toName}）<br><span class="muted">${njDesc(NJ.q)}。見張り${NJ.d.guards}人・${NJ.d.ck === 'yama' ? '山城' : NJ.d.ck === 'mizu' ? '水城' : '平城'}・${NJ.d.night ? '夜（見張りの目が届きにくい）' : '昼'}・難しさ${SGK.ICON.html('star', 14).repeat(NJ.d.lv)}</span><div class="row" style="margin-top:4px"><button id="nj-go" data-nj="go">忍び込む</button>${!NJ.room ? '<button id="nj-rec" data-act="ninRecruit">仲間を募る</button>' : ''}</div>${njRoomHtml(NJ.room)}</div>`;
    if (townTab === 'street' && SGK.PARTY) html += '<div class="card" style="display:block"><b>みんなで遊ぶ</b>（同じ町にいる人を誘えます。2人から）<div class="row" style="margin-top:4px"><button data-party="race">馬の障害レース</button><button data-party="archery">弓の的当て</button><button data-party="fish">釣り大会</button><button data-party="cart">荷運び（協力）</button></div></div>';
    if (townTab === 'street') html += `<div class="muted">${hs && hs.type === 'village' ? '村' : '町'}の通りです。上のボタンから行き先を選んでください</div>`;
    for (const sec of TOWN_SECS[townTab] || [townTab]) { if ((TOWN_SECS[townTab] || []).length > 1) html += `<div class="secH">${SEC_NAME[sec]}</div>`;
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
      if (P.here && P.here.gamble && SGK.GAMBLEUI) html += `<div class="card"><div><b>賭場に入る</b><br><span class="muted">行灯の灯る部屋で、壺振りの丁半・賽の目増と四五六・馬くらべ・天正かるた</span></div><button id="gb-open" data-act="gbOpen">入る</button></div><details style="margin-top:6px"><summary class="muted">文字だけで遊ぶ</summary>${SGK.GAMBLE.html(P, G.gbSel, G.myPid)}</details>`; // 2.12.4
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
  // 部屋の出発の合図が届いたら、入っている全員が始める
  setInterval(() => {
    const P = G.priv, N = P && P.me && P.me.nin, R = N && N.room;
    if (!R || !R.go || !R.joined || !N.q || (SGK.NINJA3D && SGK.NINJA3D.on) || (SGK.NINJA && SGK.NINJA.on) || G.lastCoGo === R.go.at) return;
    G.lastCoGo = R.go.at; openTown(false); startNinja(N, R.go);
  }, 400);
  $('townBody').addEventListener('click', (e) => {
    const lb = e.target.closest('button[data-look]'); if (lb) return lookAt(lb.dataset.look, lb.dataset.job);
    const lx = e.target.closest('button[data-lookxy]'); if (lx) { const [x, y] = lx.dataset.lookxy.split(',').map(Number); openTown(false); R.cam.follow = false; R.cam.x = x; R.cam.y = y; G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; return; }
    const pb = e.target.closest('button[data-party]'); if (pb) { openTown(false); SGK.PARTY.openLobby(pb.dataset.party); return; } // 2.42.0
    const nj = e.target.closest('button[data-nj]'); // 0.77.0 忍び込む
    if (nj) { const N = G.priv && G.priv.me.nin; if (!N || !N.atTgt) return; openTown(false); startNinja(N, null); return; }
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
  $('townStage').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); }); // 2.13.0 通りのボタン
  function cycleTab(d) { const tabs = ['street', 'market', 'renpei', 'gamble', 'talk', 'castle', 'home'].filter((t) => !$('tab-' + t).classList.contains('hidden')); setTab(tabs[(tabs.indexOf(townTab) + d + tabs.length) % tabs.length]); }

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

  // ---------- 戦闘の操作パネル ----------
  let battleHtml = '';
  // 0.56.0 アクション戦闘（試作）：1人で遊んでいるホストだけ
  const soloHost = () => G.mode === 'host' && (!G.net || !G.net.pids().length);
  const actB = () => { // 0.62.0 参加者は、ホストから届いた戦場の様子（G.actView）を使う
    const BT = G.priv && G.priv.battle; if (!BT) return null;
    if (G.mode === 'client') return G.actView && G.actView.id === BT.id ? G.actView : null;
    const b = G.mode === 'host' && G.world.battles[BT.id]; return b && b.act ? b : null; };
  // 0.63.0 3D表示の自分で戦う（マウント＆ブレイド2風の操作）
  const ML = () => !!(R.act3dOn && actB());
  const ORDM = { root: [['F1', '移動'], ['F2', '向き'], ['F3', '隊形'], ['F4', '射撃']], form: [['F1', '通常'], ['F2', '横隊'], ['F3', '散開'], ['F4', '方陣'], ['F5', '鋒矢']], fire: [['F1', '自由に射て'], ['F2', '射撃をやめよ']], move: [['F1', 'ここへ移動'], ['F2', '突撃'], ['F3', '防御'], ['F4', '待機'], ['F5', '追従']], face: [['F1', 'この方向を向け'], ['F2', '敵の方を向け']] };
  const ORDK = { form: ['form:norm', 'form:line', 'form:loose', 'form:square', 'form:wedge'], fire: ['fire:1', 'fire:0'], move: ['move', 'charge', 'guard', 'hold', 'follow'], face: ['faceHere', 'faceFoe'] };
  function ordMenu(m) { R.ordMenu = m; R.ordItems = m ? ORDM[m] : null; }
  function myUnits3(AB) { return AB.units.filter((u) => u.idx && (u.owner === G.myPid || u.cmd === G.myPid) && u.hp > 0 && !u.gone && u.order !== 'rout'); }
  function cen3(AB, f) { let x = 0, y = 0, n = 0; for (const s of AB.act.s) if (s.hp > 0 && !s.gone && f(s)) { x += s.x; y += s.y; n++; } return n ? { x: x / n, y: y / n } : null; }
  // 1.6.66 照準（3Dは画面の真ん中、2Dはマウス・カーソル）と、そこが指す敵の隊。突撃・回り込みはその隊へ
  function aimXY() { return R.act3dOn ? [cv.clientWidth / 2, cv.clientHeight / 2] : G.vcurOn && G.vcur ? G.vcur : G.mouseXY || null; }
  function chargeTo(AB, c) {
    if (c.order !== 'charge' && c.order !== 'flank') return '';
    const a = aimXY(), id = a && R.actFoeAt ? R.actFoeAt(a[0], a[1], AB.act, G.myPid) : null, u = id != null && AB.units.find((x) => x.id === id);
    if (!u) return ''; c.tg = id; return `${u.gname ? u.gname + '隊・' : ''}${SIM.TROOPS[u.type].short || SIM.TROOPS[u.type].name}へ`;
  }
  // 2.5.0 号令の声（法螺貝・太鼓のあと「〇〇隊、突撃！」）
  const SHOUT = { charge: '突撃！', flank: '回り込め！', hold: 'その場で待て！', guard: '守りを固めよ！', retreat: '退けい！', follow: 'ついて参れ！', ai: '存分に戦え！', move: '進め！', back: '下がれ！' };
  function shout(AB, unit, kind) {
    if (!SHOUT[kind] || !SGK.AUDIO || !SGK.AUDIO.call) return;
    const u = unit != null && unit !== 'all' && AB && AB.units.find((x) => x.id === unit);
    const who = unit == null || unit === 'all' ? '全軍' : !u ? '' : u.gname ? u.gname + '隊' : (SIM.TROOPS[u.type].short || SIM.TROOPS[u.type].name) + '隊';
    SGK.AUDIO.call(kind, who ? `${who}、${SHOUT[kind]}` : SHOUT[kind]);
  }
  function ord3(kind) {
    const AB = actB(); if (!AB) return; ordMenu(null);
    const all = G.selUnit == null || G.selUnit === 'all', L = myUnits3(AB).filter((u) => all || u.id === G.selUnit);
    if (!L.length) { toast('指図できる隊がありません', 1000); return; }
    const fk = /^(form|fire):(\w+)$/.exec(kind); // 0.75.0 隊形・射撃
    if (fk) { const each = (f) => (all ? ['all'] : [G.selUnit]).forEach(f);
      if (fk[1] === 'form') { if (all) L.forEach((u) => command({ type: 'order', unit: u.id, order: 'form', fm: fk[2] })); else command({ type: 'order', unit: G.selUnit, order: 'form', fm: fk[2] }); toast(`${SIM.ACT.FORMS[fk[2]]}に組め！`, 900); }
      else { each((un) => command({ type: 'order', unit: un, order: 'fire', on: fk[2] === '1' })); toast(fk[2] === '1' ? '自由に射て！' : '射撃をやめよ！', 900); }
      return; }
    shout(AB, all ? 'all' : G.selUnit, kind);
    if (!['move', 'back', 'faceHere', 'faceFoe'].includes(kind)) { const c = { type: 'order', unit: all ? 'all' : G.selUnit, order: kind }, to = chargeTo(AB, c); command(c); if (to) { toast(`${to}${kind === 'flank' ? '回り込め' : '突撃'}！`, 1100); return; } toast({ guard: '守りを固めよ！', follow: 'ついて参れ！', charge: '突撃！', flank: '回り込め！', hold: 'その場で止まれ！', retreat: '退却！', ai: '各自の判断で戦え！（AIに任せる）' }[kind] || '', 900); return; }
    const cs = L.map((u) => [u, cen3(AB, (s) => s.g === u.id)]).filter((a) => a[1]); if (!cs.length) return;
    const mx = cs.reduce((a, c) => a + c[1].x, 0) / cs.length, my = cs.reduce((a, c) => a + c[1].y, 0) / cs.length;
    const [px, py] = R.act3d.toWorld(cv.clientWidth / 2, cv.clientHeight / 2), foe = cen3(AB, (s) => s.side === 'B') || { x: mx + 100, y: my };
    const fa = (c) => Math.atan2(foe.y - c.y, foe.x - c.x);
    if (kind === 'move') { cs.forEach(([u, c]) => command({ type: 'order', unit: u.id, order: 'move', x: px + c.x - mx, y: py + c.y - my })); toast('そこへ移動せよ！', 900); }
    if (kind === 'back') { const a = Math.atan2(my - foe.y, mx - foe.x); cs.forEach(([u, c]) => moveFace(u.id, c.x + Math.cos(a) * 25, c.y + Math.sin(a) * 25, fa(c))); toast('後退せよ！', 900); }
    if (kind === 'faceHere') { cs.forEach(([u, c]) => command({ type: 'order', unit: u.id, order: 'face', f: Math.atan2(py - c.y, px - c.x) })); toast('この方向を向け！', 900); }
    if (kind === 'faceFoe') { cs.forEach(([u, c]) => command({ type: 'order', unit: u.id, order: 'face', f: fa(c) })); toast('敵の方を向け！', 900); }
  }
  function sel3(n) { const AB = actB(); if (!AB) return; if (n === 0) G.selUnit = 'all'; else { const u = myUnits3(AB).find((x) => x.idx === n + 1); if (u) G.selUnit = u.id; } battleHtml = ''; }
  // 0.59.0 移動先を決めたあと、向く方向を決める（G.fpick = 移動先。次に押した所の方を向く）
  function moveFace(unit, x, y, face) { command({ type: 'order', unit, order: 'move', x, y }); if (face != null) command({ type: 'order', unit, order: 'face', f: face }); }
  function pickFace(fx, fy) { const P = G.fpick; G.fpick = null; if (!P) return false; if (Math.hypot(fx - P.x, fy - P.y) < 2) { toast('向きはそのままにしました', 800); return true; } command({ type: 'order', unit: P.unit, order: 'face', f: Math.atan2(fy - P.y, fx - P.x) }); toast('その方向を向かせます', 800); return true; }
  function actOrder(o, x, y) { if (G.selUnit == null) { toast('先に部隊を選んでください（右スティックのカーソルを隊に合わせてA・LB/RB・数字キー）', 1500); return; } shout(actB(), G.selUnit, o); const c = { type: 'order', unit: G.selUnit, order: o }; if (o === 'move') { c.x = x; c.y = y; } const to = actB() ? chargeTo(actB(), c) : ''; command(c); if (to) toast(`${to}${o === 'flank' ? '回り込め' : '突撃'}！`, 1100); }
  function actSel(d) { const AB = actB(); if (!AB) return; const l = [null, 'all', ...AB.units.filter((u) => u.idx && (u.owner === G.myPid || u.cmd === G.myPid) && u.hp > 0 && !u.gone).sort((a, b) => a.idx - b.idx).map((u) => u.id)]; const i = Math.max(0, l.indexOf(G.selUnit)); G.selUnit = l[(i + d + l.length) % l.length]; battleHtml = ''; }
  // 0.61.0 カーソルの所の自分の隊を選ぶ（何もなければ選択をやめる）／選んだ隊をそこへ動かす
  function actPick(sx, sy) {
    const AB = actB(); if (!AB) return; const [x, y] = R.actToWorld(sx, sy);
    let best = null, bd = 3;
    for (const s of AB.act.s) { if (s.hp <= 0 || s.gone || s.hero) continue; const u = AB.act.byG[s.g]; if (!u || !u.idx || (u.owner !== G.myPid && u.cmd !== G.myPid)) continue; const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = u; } }
    if (best) { G.selUnit = best.id; SGK.AUDIO.sfx('click'); } else if (G.selUnit != null) { G.selUnit = null; toast('選択をやめました', 700); }
    battleHtml = '';
  }
  function actMoveTo(D, E) {
    if (G.selUnit == null) { toast('先に部隊を選んでください', 1000); return; }
    const [x, y] = R.actToWorld(D[0], D[1]), [x2, y2] = R.actToWorld(E[0], E[1]), dr = Math.hypot(E[0] - D[0], E[1] - D[1]) > 14;
    moveFace(G.selUnit, x, y, dr ? Math.atan2(y2 - y, x2 - x) : null); toast(dr ? 'そこへ向かわせ、その方向を向かせます' : 'そこへ向かわせます', 800);
  }
  const ORDN = { charge: '突撃', guard: '防御', hold: '待機', retreat: '後退', flank: '回り込み', move: '移動中', rout: '潰走中', follow: '追従' };
  function renderBattle(bt) {
    const TR = SIM.TROOPS;
    const sum = (side) => bt.units.filter((u) => u[1] === side).reduce((a, u) => a + (u[3] === 'hero' ? 1 : u[4]), 0);
    $('battleTitle').textContent = `${bt.foe}との戦い${bt.ck ? '（' + SIM.ckName(bt.ck) + '）' : ''}`;
    $('battleInfo').textContent = `味方 ${sum('A')}　敵 ${sum('B')}${bt.routed ? '（敗走中）' : ''}　${bt.t}秒`;
    let html = ''; // 部隊の一覧は出さない（地図の上でクリックして選ぶ）
    if (bt.plan) { // 2.22.0 軍議：戦は止まっている。隊を置き直して、全員が準備完了で始まる
      const PL = bt.plan, nm = (x) => (bt.names && bt.names[x]) || '仲間', many = PL.ready.length + PL.wait.length > 1;
      $('battleTitle').textContent = `軍議　${bt.foe}との戦い${bt.ck ? '（' + SIM.ckName(bt.ck) + '）' : ''}`;
      html += `<div class="bu"><span class="nm muted">隊をクリックして選び、置きたい場所をクリック（初めの場所から${PL.reach}mまで）。右ドラッグで向き。突撃・防御・待機で始めの構えも決められます</span></div>`;
      if (many) html += `<div class="bu"><span class="nm">準備完了：${PL.ready.map(nm).join('・') || 'まだ誰も'}${PL.wait.length ? `<span class="muted">　待っている：${PL.wait.map(nm).join('・')}</span>` : ''}${PL.left != null ? `<span class="muted">（あと${PL.left}秒で始まります）</span>` : ''}</span></div>`;
      html += `<div class="row" style="margin-top:4px"><button id="bReady" class="main" data-bact="planReady">${PL.me ? '準備完了を取り消す' : '準備完了（合戦を始める）'}</button></div>`;
    }
    // 0.46.0 タップでも指図できるように：選んだ隊と全軍への指図ボタン
    const su = bt.units.find((u) => u[0] === G.selUnit && u[2] === G.myPid);
    const AB = actB(), ob = (unit) => ['charge', 'guard', 'hold', ...(AB ? ['follow'] : [])].map((o) => `<button id="bo-${unit}-${o}" data-unit="${unit}" data-order="${o}">${ORDN[o]}</button>`).join('');
    if (su && su[3] !== 'hero') html += `<div class="bu"><span class="nm">${su[15] ? '本人＋' : ''}${TR[su[3]].short || TR[su[3]].name} ${su[4]}人<span class="muted">［${ORDN[su[7]] || ''}］</span></span>${ob(su[0])}</div>`;
    else if (!AB) html += `<div class="bu"><span class="nm muted">隊をタップして選び、地面をタップで移動</span></div>`;
    if (!AB || G.selUnit === 'all') html += `<div class="bu"><span class="nm">全軍</span>${ob('all')}</div>`; // 0.61.0 自分で戦うときは、隊を選んだときだけ指図が出る
    else if (!su) html += `<div class="bu"><span class="nm muted">隊を選ぶと指図できます（カーソルを隊に合わせてA／LB・RB／数字キー）</span></div>`;
    if (bt.lead) html += `<div class="bu"><span class="nm">大将：${bt.lead === 2 ? '武将の隊も指図している' : '自分の隊だけ指図している'}</span><button id="bLead" data-lead="${bt.lead === 2 ? 0 : 1}">${bt.lead === 2 ? '自分の隊だけにする' : '武将の隊も指図する'}</button></div>`; // 0.50.0
    if (!AB && bt.canAct) html += `<div class="row" style="margin-top:4px"><button id="bAct" data-act="1">自分で戦う</button></div>`;
    else if (!AB && bt.act) html += `<div class="bu"><span class="nm muted">戦場の様子を受け取っています…</span></div>`;
    G.btFoe = bt.foe; G.btT = performance.now(); // 2.7.1 スキップ・退却はメニューに移した
    if (false) html += `<div class="row" style="margin-top:4px"><button id="bAuto" data-bact="battleAuto">自動で決着（スキップ）</button><button id="bFlee" data-bact="battleFlee">退却する（兵の3割を失う${bt.foe === '野盗' ? '・所持金の15%を奪われる' : ''}）</button></div>`;
    if (html !== battleHtml) { battleHtml = html; $('battleBody').innerHTML = html; G.bpick = null; setFocus($('battle'), null); }
  }
  $('battleBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act) { command({ type: 'actStart' }); G.selUnit = null; battleHtml = ''; b.blur(); }
    else if (b.dataset.sel) { G.selUnit = +b.dataset.sel; battleHtml = ''; }
    else if (b.dataset.order) shout(actB(), b.dataset.unit === 'all' ? 'all' : +b.dataset.unit, b.dataset.order), command({ type: 'order', unit: b.dataset.unit, order: b.dataset.order });
    else if (b.dataset.bact) command({ type: b.dataset.bact });
    else if (b.dataset.lead) command({ type: 'leadAll', on: b.dataset.lead === '1' });
  });

  // ---------- 捕らえた武将（1.6.82：登用か身代金、逃がすこともできる） ----------
  let captiveHtml = '';
  function renderCaptive(me) {
    const list = me.captives || [], el = $('captive'), on = (list.length || me.pow) && !(G.priv && G.priv.battle);
    el.classList.toggle('hidden', !on); if (!on) { captiveHtml = ''; return; }
    const AC = me.atCastle; /* 1.6.81 身代金と交換できるのは城だけ */
    const html = (me.pow ? `<div class="cp"><span>捕虜の兵 ${me.pow}人</span>${AC ? `<button id="cp_ransom" data-cap="ransomPow">身代金と交換（${SIM.money(me.powV || 0)}）</button>` : '<span class="muted">城で身代金と交換できる</span>'}<button id="cp_rel" data-cap="releasePow">逃がす（名声+${Math.max(1, Math.floor(me.pow / 10))}）</button></div>` : '')
      + list.map(([id, nm, fn, t, b, rm, rc]) => `<div class="cp"><span>${fn}の${nm}</span>${AC ? `<button id="cx_${id}" data-cap="ransomCaptive" data-id="${id}">身代金と交換（${SIM.money(rm || 0)}）</button>` : `<span class="muted">城で身代金${SIM.money(rm || 0)}</span>`}<button id="cr_${id}" data-cap="releaseCaptive" data-id="${id}">逃がす（名声+1）</button><button id="cg_${id}" data-cap="recruitCaptive" data-id="${id}" ${rc == null ? 'disabled' : ''}>${rc == null ? '登用（断られた）' : `登用する（${rc}%）`}</button></div>`).join('');
    if (html !== captiveHtml) { captiveHtml = html; $('captiveBody').innerHTML = html; }
  }
  $('captiveBody').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (b && b.dataset.cap) command({ type: b.dataset.cap, id: b.dataset.id });
  });

  // ---------- ゲーム内メニュー ----------
  // 1.3.0 兵士図鑑（メニューから開く）
  // 2.14.0 武将一覧：家・名前・絵のある順で並べ替え。押すと立ち絵を出す
  function bushoHtml() {
    const host = G.mode === 'host', PE = (host ? G.world.people : G.view.people) || {}, FA = (host ? G.world.factions : G.view.factions) || {}, ST = (host ? G.world.settlements : G.view.settlements) || [];
    const lordOf = {}; for (const s of ST) { const l = s.type === 'castle' ? castleStat(s).lord : s.lord; if (l && !lordOf[l]) lordOf[l] = s.name; }
    const rows = [];
    for (const id in PE) {
      const p = PE[id]; if (!p || !p.name || p.dead || p.player || p.pid) continue;
      const f = p.faction && FA[p.faction], lead = !!(f && f.leader === id);
      rows.push({ name: p.name, fam: f ? f.name : '浪人', lead, lord: !!lordOf[id], role: lead ? '当主' + (lordOf[id] ? `（${lordOf[id]}）` : '') : lordOf[id] ? lordOf[id] + 'の城主' : p.captive ? '捕らわれの身' : f ? '家臣' : '主なし', img: SGK.bushoImg(p.name) });
    }
    const so = G.bSort || 'fam', byN = (a, b) => a.name.localeCompare(b.name, 'ja'), byF = (a, b) => a.fam.localeCompare(b.fam, 'ja') || (b.lead - a.lead) || (b.lord - a.lord) || byN(a, b);
    rows.sort(so === 'name' ? byN : so === 'pic' ? (a, b) => (!!b.img - !!a.img) || byF(a, b) : byF);
    const nPic = rows.filter((r) => r.img).length;
    let html = `<div class="bsSort">${[['fam', '家の順'], ['name', '名前の順'], ['pic', '絵のある順']].map(([k, t]) => `<button id="bs-${k}" data-bsort="${k}" class="${so === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    html += `<div class="muted" style="margin-bottom:4px">${rows.length}人（絵のある武将 ${nPic}人）。押すと立ち絵が見られます</div>`;
    let last = '';
    for (const r of rows) {
      if (so === 'fam' && r.fam !== last) { last = r.fam; html += `<div class="secH">${r.fam}</div>`; }
      html += `<button class="bsRow" data-bn="${r.name}" data-br="${r.fam}・${r.role}"><span class="th" style="${r.img ? `background-image:url(${r.img})` : ''}"></span><span class="nm">${r.name}</span><span class="fm">${r.fam}</span><span class="rl">${r.role}</span></button>`;
    }
    return html;
  }
  $('mSubB').addEventListener('click', (e) => {
    if (G.sub !== 'busho') return;
    const so = e.target.closest('button[data-bsort]'); if (so) { G.bSort = so.dataset.bsort; $('mSubB').innerHTML = bushoHtml(); setFocus($('gameMenu'), $('bs-' + G.bSort)); return; }
    const r = e.target.closest('.bsRow'); if (r) { if (SGK.bushoImg(r.dataset.bn)) bushoTalk(r.dataset.bn, r.dataset.br); else toast(`${r.dataset.bn}の絵はまだありません`, 1500); }
  });
  function zukanHtml(me) {
    let html = '';
      const TRS = SIM.TROOPS, EQ = SIM.EQUIP, E = me.equip || {}, wp = E.wep && EQ.wep[E.wep], ar = E.arm && EQ.arm[E.arm], H = TRS.hero;
      const WN = { yari: '槍', nagayari: '槍', yarigashira: '槍', kiba: '槍', horo: '槍', yumi: '弓（近いと刀）', teppo: '鉄砲（近いと刀）', teppogashira: '鉄砲（近いと刀）', banditBow: '弓（近いと刀）', tsuyoyumi: '弓（近いと刀）', yumigashira: '弓（近いと刀）', take: '脇差＋竹束', shiyori: '脇差＋竹束', takegashira: '脇差＋竹束' };
      html += '<div class="muted" style="margin-bottom:6px">数値は兵1人あたり。費用は1人を雇う値段、日当は1人1日の給金。速さは戦場での速さ</div>';
      html += `<div class="card" style="display:block"><b>本人</b>　<span class="muted">いまの装備込み</span><br>体力 ${H.hp}　攻撃 ${Math.round((H.atk + ((wp && wp.atk) || 0)) * 10) / 10}　守り ${H.def + ((ar && ar.da) || 0)}　速さ ${H.spd}${E.horse ? '（馬）' : ''}　武器 ${wp ? wp.name : 'なし'}</div>`;
      const WK = { spearS: '槍', spearL: t => t.home === 'kinai' ? '薙刀' : '長槍', bow: '弓（近いと刀）', gun: '鉄砲（近いと刀）', sword: '刀' }; // 2.17.0 名物兵
      const wkName = (k, t) => { const v = t.wk && WK[t.wk]; return typeof v === 'function' ? v(t) : v || WN[k] || '刀'; };
      const row = (k) => { const t = TRS[k], up = (t.up || []).map((u) => TRS[u] && TRS[u].name).filter(Boolean);
        return `<div class="card" style="display:block"><b>${t.name}</b>${t.tier ? `　<span class="muted">${t.tier}段</span>` : ''}${t.cav ? `　<span class="muted">騎馬${t.noForest ? '' : '（林で遅い）'}</span>` : ''}${t.mo ? `　<span class="muted">士気+${t.mo}</span>` : ''}<br>体力 ${t.hp}　攻撃 ${t.atk}　守り ${t.def}　速さ ${t.spd}　${t.ranged ? `射程 ${t.range}m` : '近接'}　武器 ${wkName(k, t)}`
          + (t.note ? `<br><span class="muted">${t.note}</span>` : '')
          + (t.cost ? `<br><span class="muted">費用 ${SIM.money(t.cost)}　日当 ${t.wage}文${t.fame ? `　名声${t.fame}以上` : ''}${up.length ? `　昇格先 ${up.join('・')}` : ''}</span>` : '') + '</div>'; };
      html += '<div class="muted" style="margin-top:8px">味方の兵</div>';
      for (const k in TRS) if (TRS[k].cost && !TRS[k].home) html += row(k);
      if (SIM.CHIHO) { // 2.17.0 地方ごとの兵
        html += '<div class="muted" style="margin-top:8px">地方ごとの兵（名物兵は3段階に育ちます。1段目をその地方の城と大きな町で雇い、経験を積ませて昇格させます。拠点を選ぶと地方が分かります）</div>';
        for (const id of SIM.CHIHO_ORDER) { const r = SIM.CHIHO[id];
          html += `<div class="secH">${r.name}<span class="muted">（${r.kuni}）</span></div><div class="muted" style="margin:2px 0 4px">強み：${r.good}<br>弱み：${r.bad}<br>育ち方：${r.line.map((k) => TRS[k].name).join(' → ')}</div>` + r.line.map(row).join(''); }
      }
      html += '<div class="muted" style="margin-top:8px">敵だけの兵</div>';
      for (const k in TRS) if (k !== 'hero' && !TRS[k].cost) html += row(k);
    return html;
  }
  // 1.3.0 持っている物資（地図で△）
  function invHtml(me) {
    const IT = SGK.DATA.items, inv = Object.entries(me.inv || {}).filter(([, n]) => n > 0);
    let html = `<div class="muted" style="margin-bottom:6px">所持金 ${SIM.money(me.money)}　${loadTxt(me)}</div>`;
    if (!inv.length) html += '<div class="card">何も持っていません</div>';
    for (const [k, n] of inv) { const it = IT[k]; if (!it) continue; html += `<div class="card"><div><b>${it.ic ? SGK.ICON.html(it.ic, 18) : ''}${it.name}</b>　${n}${it.unit}</div><span class="muted">相場 約${SIM.money(it.base * n)}</span></div>`; }
    return html;
  }
  function toggleMenu(open) {
    const m = $('gameMenu'); const o = open ?? m.classList.contains('hidden');
    { const inB = performance.now() - (G.btT || 0) < 1500; $('mBAuto').classList.toggle('hidden', !inB); $('mBFlee').classList.toggle('hidden', !inB);
      $('mBFlee').textContent = `合戦：退却する（兵の3割を失う${G.btFoe === '野盗' ? '・所持金の15%を奪われる' : ''}）`; }
    if (o !== !m.classList.contains('hidden')) SGK.AUDIO.sfx(o ? 'open' : 'close');
    m.classList.toggle('hidden', !o); $('mMain').classList.remove('hidden'); $('mSet').classList.add('hidden'); $('mSub').classList.add('hidden');
    if (o) setFocus(m, currentFocus(m));
  }
  // B・Esc：設定を開いていればメニューへ戻る、そうでなければ閉じる
  // 1.3.0 メニューの中の小さな画面（兵士図鑑・物資）
  function openSub(kind) {
    const m = G.priv && G.priv.me; if (!m && kind !== 'busho') return;
    $('gameMenu').classList.remove('hidden'); $('mMain').classList.add('hidden'); $('mSet').classList.add('hidden'); $('mSub').classList.remove('hidden');
    G.sub = kind; $('mSubT').textContent = kind === 'inv' ? '持っている物資' : kind === 'busho' ? '武将一覧' : '兵士図鑑'; $('mSubB').innerHTML = kind === 'inv' ? invHtml(m) : kind === 'busho' ? bushoHtml() : zukanHtml(m); $('mSubB').scrollTop = 0;
    SGK.AUDIO.sfx('open'); setFocus($('gameMenu'), $('mSubBack'));
  }
  function menuBack() { if (!$('mSub').classList.contains('hidden')) { if (G.sub === 'inv') toggleMenu(false); else { $('mSub').classList.add('hidden'); $('mMain').classList.remove('hidden'); setFocus($('gameMenu'), $('mZukan')); } return; } if (!$('mSet').classList.contains('hidden')) { $('mSet').classList.add('hidden'); $('mMain').classList.remove('hidden'); setFocus($('gameMenu'), $('mSettings')); } else toggleMenu(false); }
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
  // 0.69.1 タブ：サウンド／ビデオ／操作（操作の中は 地図／戦闘 の小タブ）
  function setSetTab(id) {
    if (id === 'stMap' || id === 'stBattle') { setCtrlTab(id); id = 'stCtrl'; }
    [['stSound', 'spSound'], ['stVideo', 'spVideo'], ['stCtrl', 'spCtrl']].forEach(([b, p]) => { $(b).classList.toggle('on', b === id); $(p).classList.toggle('hidden', b !== id); });
  }
  function setCtrlTab(id) { [['stMap', 'spMap'], ['stBattle', 'spBattle']].forEach(([b, p]) => { $(b).classList.toggle('on', b === id); $(p).classList.toggle('hidden', b !== id); }); }
  ['stSound', 'stVideo', 'stCtrl'].forEach((id) => ($(id).onclick = () => setSetTab(id)));
  ['stMap', 'stBattle'].forEach((id) => ($(id).onclick = () => setCtrlTab(id)));
  setCtrlTab('stMap');
  $('mSettings').onclick = () => { act3dLbl(); $('mMain').classList.add('hidden'); $('mSet').classList.remove('hidden'); setSetTab(G.priv && G.priv.battle ? 'stBattle' : 'stMap'); setFocus($('gameMenu'), $('stCtrl')); };
  $('stBack').onclick = () => (G.mode === 'title' ? titleBack() : menuBack());
  // 0.69.0 タイトル画面からも設定を開く（ゲーム内メニューの設定画面をタイトルへ移して使う）
  $('btnSettings').onclick = () => { $('title').insertBefore($('mSet'), $('titleMsg')); $('mSet').classList.remove('hidden'); $('titleMenu').classList.add('hidden'); setSetTab('stSound'); act3dLbl(); setFocus($('mSet'), $('stSound')); };
  const act3dLbl = () => ($('mAct3d').textContent = `戦闘の表示：${!R.act3d || R.act3d.on ? '3D' : '2D'}（T キーでも切替）`);
  $('mAct3d').onclick = () => { if (R.act3d) R.act3d.toggle(); act3dLbl(); };
  // 1.6.13 戦の始め方：自分で戦う（基本）／指揮（2D）
  G.actDef = true; try { if (localStorage.getItem('sgk-actdef') === '0') G.actDef = false; } catch (e) { /* 無視 */ }
  const actDefLbl = () => ($('mActDef').textContent = `戦の始め方：${G.actDef ? '自分で戦う' : '指揮（2D）'}`);
  $('mActDef').onclick = () => { G.actDef = !G.actDef; try { localStorage.setItem('sgk-actdef', G.actDef ? '1' : '0'); } catch (e) { /* 無視 */ } actDefLbl(); };
  actDefLbl();
  act3dLbl();
  // 0.75.0 ビデオ設定（影・草の量）
  const vidLbl = () => { const V = R.act3d && R.act3d.vid; if (!V) return; $('mLow').textContent = `超低画質：${V.lo ? '入（影・草・仕上げなし）' : '切'}`; $('mMen').textContent = `戦場に出る兵の数：${V.men}人まで（残りは増援）`; $('mShadow').textContent = `影：${['切', '低', '高'][V.sh]}`; $('mGrass').textContent = `草の量：${['なし', '少なめ', '普通', '多め'][V.gr]}`; $('mPost').textContent = `画面の仕上げ：${V.pp === 0 ? '切' : '入'}`; };
  $('mShadow').onclick = () => { if (R.act3d) R.act3d.setVid('sh', (R.act3d.vid.sh + 1) % 3); vidLbl(); };
  $('mGrass').onclick = () => { if (R.act3d) R.act3d.setVid('gr', (R.act3d.vid.gr + 1) % 4); vidLbl(); };
  $('mPost').onclick = () => { if (R.act3d) R.act3d.setVid('pp', R.act3d.vid.pp === 0 ? 1 : 0); vidLbl(); };
  // 2.23.0 超低画質（スマホは初めから入）と、戦場に同時に出る兵の数（減ったら控えから増援が出る）
  $('mLow').onclick = () => { if (R.act3d) R.act3d.setVid('lo', R.act3d.vid.lo ? 0 : 1); vidLbl(); };
  $('mMen').onclick = () => { const X = R.act3d; if (!X) return; const L = X.MEN, i = L.indexOf(X.vid.men); X.setVid('men', L[(i + 1) % L.length]); vidLbl(); toast('次の合戦から変わります', 1200); };
  vidLbl();
  const VOL = { all: 'vAll', bgm: 'vBgm', sfx: 'vSfx' };
  for (const k in VOL) $(VOL[k]).textContent = SGK.AUDIO.label(k);
  document.querySelectorAll('[data-vol]').forEach((b) => (b.onclick = () => { const k = b.dataset.vol; $(VOL[k]).textContent = SGK.AUDIO.step(k, +b.dataset.d); if (k !== 'bgm') SGK.AUDIO.sfx('coin'); }));
  applyPad();
  // ボタンを押したときの音（売り買いは小銭の音）
  document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || (b.dataset.vol && b.dataset.vol !== 'bgm')) return; SGK.AUDIO.sfx(b.dataset.act === 'buy' || b.dataset.act === 'sell' ? 'coin' : 'click'); }, true);
  $('menuBtn').onclick = () => toggleMenu(true);
  $('mClose').onclick = () => toggleMenu(false);
  $('mSave').onclick = () => { Promise.all([SGK.SAVE.save(G.world), cloudSave()]).then(([ok, c]) => toast((SGK.SAVE.slot ? (ok ? `スロット${SGK.SAVE.slot}にセーブしました` : 'セーブに失敗しました') : 'この世界の控えはこの端末にありません') + (G.world.code ? (c ? '・クラウドに保存しました' : '・クラウド保存は後で行います') : ''))); };
  $('mExport').onclick = () => { SGK.SAVE.save(G.world); SGK.SAVE.exportFile(G.world); };
  // 0.46.0 スマホ向け：タッチ端末なら body に touch を付け、地図のボタンを出す
  if (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) document.body.classList.add('touch');
  $('nearBtn').onclick = () => cycleNear();
  $('followBtn').onclick = () => $('mFollow').click();
  $('followBtn2').onclick = () => $('mFollow').click(); // 2.39.0 キーボード・マウスのときの「自分へ」ボタン
  // 0.58.0 戦場のズーム：地図と同じ操作（ホイール・ピンチ・＋－ボタン・＋/－キー・LB/RB等）で、指した所を中心に
  const inB = () => !!(G.priv && G.priv.battle);
  function bZoom(k, sx, sy) {
    if (actB()) { R.acam.z = Math.max(4, Math.min(22, R.acam.z * k)); return; }
    const c = R.bcam, nz = Math.max(0.35, Math.min(3, c.z * k)); k = nz / c.z; if (k === 1) return;
    if (sx != null) { const L = R.battleLayout(SIM.FIELD), fx = (sx - L.ox) / L.sc, fy = (sy - L.oy) / L.sc; c.x = fx + (c.x - fx) / k; c.y = fy + (c.y - fy) / k; }
    c.z = nz;
  }
  const anyZoom = (k, sx, sy) => (inB() ? bZoom(k, sx, sy) : R.zoom(k, sx, sy));
  $('zoomIn').onclick = () => anyZoom(1.2);
  $('zoomOut').onclick = () => anyZoom(1 / 1.2);
  $('mZukan').onclick = () => openSub('zukan');
  $('mBusho').onclick = () => openSub('busho');
  $('mSubBack').onclick = () => menuBack();
  $('mFollow').onclick = () => { const m = me(), d = m && (G.disp[m.id] || m); if (d) { R.cam.x = d.x; R.cam.y = d.y; } R.cam.follow = true; if (G.pcurOn) G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2]; }; // 0.75.0 自分の所へ移って追いかける（カーソルや地図を動かすと解除）
  $('mTitle').onclick = () => backToTitle();
  // 2.7.2 スマホの合戦：画面の下に「部隊・指示・陣形」。ふだんは味方がAIで戦い、押したときだけ指図する
  G.mobTab = null;
  function mobSub() {
    const AB = actB(), el = $('mobSub'); document.querySelectorAll('#mobBar [data-mb]').forEach((b) => b.classList.toggle('on', b.dataset.mb === G.mobTab));
    if (!AB || !G.mobTab) { el.innerHTML = ''; return; }
    const TR = SIM.TROOPS, sel = G.selUnit == null ? 'all' : G.selUnit;
    let L = [];
    if (G.mobTab === 'unit') L = [['all', '全軍'], ...myUnits3(AB).filter((u) => u.type !== 'hero').map((u) => [u.id, `${u.gname ? u.gname + '隊' : TR[u.type].short || TR[u.type].name} ${u.n}`])].map(([k, t]) => [`u:${k}`, t, String(k) === String(sel)]);
    else if (G.mobTab === 'ord') L = [['charge', '突撃'], ['guard', '防御'], ['hold', '待機'], ['follow', '追従'], ['ai', '自動']].map(([k, t]) => [`o:${k}`, t]);
    else L = Object.entries(SIM.ACT.FORMS).map(([k, t]) => [`f:${k}`, t]);
    el.innerHTML = L.map(([k, t, on]) => `<button data-ms="${k}"${on ? ' class="on"' : ''}>${t}</button>`).join('');
  }
  setInterval(() => { const mb = !!actB() && document.body.classList.contains('touch'); if (mb === $('mobBar').classList.contains('hidden')) { $('mobBar').classList.toggle('hidden', !mb); if (!mb) G.mobTab = null; mobSub(); } }, 300);
  $('mobBar').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    if (b.dataset.mb) { G.mobTab = G.mobTab === b.dataset.mb ? null : b.dataset.mb; mobSub(); return; }
    const [k, v] = b.dataset.ms.split(':');
    if (k === 'u') { G.selUnit = v === 'all' ? 'all' : +v; G.mobTab = 'ord'; mobSub(); return; }
    if (k === 'o') { if (G.selUnit == null) G.selUnit = 'all'; ord3(v); }
    if (k === 'f') { if (G.selUnit == null) G.selUnit = 'all'; ord3('form:' + v); }
    G.mobTab = null; mobSub();
  });
  $('mBAuto').onclick = () => { command({ type: 'battleAuto' }); toggleMenu(false); };
  $('mBFlee').onclick = () => { command({ type: 'battleFlee' }); toggleMenu(false); };
  // テスト用（ホストだけ）

  // ---------- マウス・タッチ ----------
  const cv = $('map'), ctx = cv.getContext('2d');
  const ptrs = new Map(); let dragMoved = false, pinchD = 0;
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  // 0.56.0 アクション戦闘のマウス・タッチ（地図・戦場の操作より先に受け取る）
  window.addEventListener('pointerdown', (e) => {
    if (e.target !== cv || !actB()) return; e.stopPropagation(); e.preventDefault();
    if (ML() && e.pointerType !== 'touch') { // 0.63.0 3D：クリックでマウスを捕まえて視点操作。左＝攻撃、右＝防御
      if (document.pointerLockElement !== cv) { try { cv.requestPointerLock(); } catch (er) { /* 使えない環境 */ } return; }
      G.padUsed = false; if (e.button === 0) G.actAtk = true; else if (e.button === 2) G.actBlk = true; return;
    }
    if (e.pointerType === 'touch') { // 2.7.1 スマホ：左半分＝移動のスティック、右半分＝視点（離すと攻撃）
      const T0 = { id: e.pointerId, sx: e.offsetX, sy: e.offsetY, x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, t: performance.now() };
      if (e.offsetX < cv.clientWidth / 2) { /* 2.7.3 左半分に2本目の指＝ピンチでカメラの距離 */
        if (G.tL && G.tL.id !== e.pointerId) { G.tL2 = T0; G.pinchD = Math.hypot(G.tL.x - T0.x, G.tL.y - T0.y); G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; }
        else G.tL = T0;
      } else G.tR = T0; return; }
    G.mouseXY = [e.offsetX, e.offsetY]; G.padUsed = false;
    if (e.button === 0) G.actAtk = true;
    else if (e.button === 2) G.actRD = [e.offsetX, e.offsetY]; // 右ボタン：押した所へ移動。押したまま引っぱると、離した方向を向く
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!actB()) return;
    if (ML() && document.pointerLockElement === cv) { const c = R.acam; c.yaw = (c.yaw || 0) + e.movementX * 0.0025; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + e.movementY * 0.0022)); e.stopPropagation(); return; }
    if (e.pointerType === 'touch') {
      const L = G.tL && G.tL.id === e.pointerId ? G.tL : null, Rt = G.tR && G.tR.id === e.pointerId ? G.tR : null;
      if (G.tL2 && G.tL2.id === e.pointerId) { G.tL2.x = e.offsetX; G.tL2.y = e.offsetY; }
      if (L) { L.x = e.offsetX; L.y = e.offsetY; }
      if ((L || (G.tL2 && G.tL2.id === e.pointerId)) && G.tL && G.tL2) { const d = Math.hypot(G.tL.x - G.tL2.x, G.tL.y - G.tL2.y); if (G.pinchD > 8 && d > 8) R.acam.z = Math.max(4, Math.min(22, R.acam.z * (d / G.pinchD))); G.pinchD = d; e.stopPropagation(); return; }
      if (Rt) { const dx = e.offsetX - Rt.lx, dy = e.offsetY - Rt.ly; Rt.lx = e.offsetX; Rt.ly = e.offsetY;
        if (ML()) { const c = R.acam; c.yaw = (c.yaw || 0) + dx * 0.006; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + dy * 0.005)); }
        else if (Math.hypot(e.offsetX - Rt.sx, e.offsetY - Rt.sy) > 12) G.tAim = Math.atan2(e.offsetY - Rt.sy, e.offsetX - Rt.sx); }
      e.stopPropagation(); return; }
    if (e.target === cv) { G.mouseXY = [e.offsetX, e.offsetY]; G.vcur = G.mouseXY; G.vcurOn = false; G.padUsed = false; e.stopPropagation(); }
  }, true);
  const actUp = (e) => {
    if (!actB()) return;
    if (e.pointerType === 'touch') { if (G.tL2 && G.tL2.id === e.pointerId) { G.tL2 = null; if (G.tL) { G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; } } else if (G.tL && G.tL.id === e.pointerId) { G.tL = G.tL2; G.tL2 = null; if (G.tL) { G.tL.sx = G.tL.x; G.tL.sy = G.tL.y; } } if (G.tR && G.tR.id === e.pointerId) { G.tR = null; G.tAtk = true; } e.stopPropagation(); return; }
    G.actAtk = false; G.actTouch = null; if (e.target === cv) e.stopPropagation();
    if (ML() && e.pointerType !== 'touch') { if (e.button === 2) G.actBlk = false; G.actRD = null; return; }
    const D = G.actRD; G.actRD = null;
    if (D && e.button === 2) { const [x, y] = R.actToWorld(D[0], D[1]), [x2, y2] = R.actToWorld(e.offsetX, e.offsetY), dr = Math.hypot(e.offsetX - D[0], e.offsetY - D[1]) > 14;
      if (G.selUnit == null) { toast('先に部隊を選んでください', 1000); return; } const unit = G.selUnit; moveFace(unit, x, y, dr ? Math.atan2(y2 - y, x2 - x) : null); toast(dr ? 'そこへ向かわせ、その方向を向かせます' : 'そこへ向かわせます', 800); }
  };
  window.addEventListener('pointerup', actUp, true); window.addEventListener('pointercancel', actUp, true);
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, btn: e.button }); dragMoved = false; pinchD = 0; });
  cv.addEventListener('mousemove', (e) => { G.hov = [e.offsetX, e.offsetY]; G.hovT = performance.now(); });
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 2) {
      p.x = e.offsetX; p.y = e.offsetY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD) anyZoom(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2); pinchD = d; dragMoved = true; return;
    }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 6) { dragMoved = true; R.cam.follow = false; }
    if (dragMoved && p.btn === 2 && G.priv && G.priv.battle && G.selUnit != null) return; // 右ドラッグ：向きを決める（地図は動かさない）
    if (dragMoved) { if (G.priv && G.priv.battle) { const L = R.battleLayout(SIM.FIELD); R.bcam.x -= dx / L.sc; R.bcam.y -= dy / L.sc; } else { R.cam.x -= dx / R.cam.scale; R.cam.y -= dy / R.cam.scale; } }
  });
  cv.addEventListener('pointerup', (e) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    const BT = G.priv && G.priv.battle;
    if (p && BT && dragMoved && p.btn === 2 && G.selUnit != null && !actB()) { const [x, y] = R.battleToField(p.sx, p.sy), [x2, y2] = R.battleToField(e.offsetX, e.offsetY); G.fpick = null; moveFace(G.selUnit, x, y, Math.atan2(y2 - y, x2 - x)); toast('そこへ移動し、その方向を向かせます', 900); return; }
    if (!p || dragMoved || !G.view) return;
    if (BT) { // 戦闘中：自分の部隊をクリックで選択、地面をクリックで選んだ部隊を移動
      const [fx, fy] = R.battleToField(e.offsetX, e.offsetY), L = R.battleLayout(SIM.FIELD);
      const mine = BT.units.filter((u) => u[2] === G.myPid && u[7] !== 'rout' && u[14] == null).map((u) => [u, Math.hypot(u[5] - fx, u[6] - fy)]).sort((a, b) => a[1] - b[1])[0];
      if (mine && mine[1] * L.sc < Math.max(22, (0.6 + Math.sqrt(mine[0][4]) * 0.7) * L.sc + 10) && p.btn !== 2) { G.selUnit = mine[0][0]; G.fpick = null; battleHtml = ''; return; }
      if (G.fpick && p.btn !== 2 && pickFace(fx, fy)) return;
      if (G.selUnit != null) { moveFace(G.selUnit, fx, fy); if (p.btn !== 2) { G.fpick = { unit: G.selUnit, x: fx, y: fy }; toast('向かせたい方向をタップ（同じ所なら向きはそのまま）', 1500); } }
      return;
    }
    const hit = R.hitSettlement(G.view, e.offsetX, e.offsetY);
    const [wx, wy] = R.toWorld(e.offsetX, e.offsetY);
    const uh = p.btn !== 2 && unitHit(e.offsetX, e.offsetY);
    if (uh) { selectUnit(uh); return; } // 部隊をクリック・タップ：情報
    if (p.btn === 2) { // 0.54.10 右クリック：自分の上なら人物を開く（開いていれば閉じる）／それ以外はすぐ移動
      const mm = me(), md = mm && (G.disp[G.myPid] || mm), ms = md && R.toScreen(md.x, md.y);
      if (!$('char').classList.contains('hidden')) { openChar(false); return; }
      if (ms && Math.hypot(ms[0] - e.offsetX, ms[1] - e.offsetY) < 18) { openChar(true); return; }
    }
    if (p.btn === 2) { hit ? moveTo(hit.x, hit.y, hit.id) : moveTo(wx, wy); } // 右クリック：すぐ移動
    else if (hit) selectSettlement(hit);   // 左クリック・タップ：拠点なら情報
    else moveTo(wx, wy);                   // 地面なら移動
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); anyZoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });

  // ---------- キーボード ----------
  const keys = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Enter' && G.mode === 'title' && e.target.id === 'codeInput') $('btnJoinGo').click(); return; }
    const k = e.key;
    if (actB() && !activeMenuNotBattle() && k.toLowerCase() === 't') { const on = R.act3d && R.act3d.toggle(); if (!on && document.pointerLockElement) document.exitPointerLock(); toast(on ? '3D表示にしました' : '2D表示にしました', 1000); return; }
    if (ML() && !activeMenuNotBattle()) { // 0.63.0 マウント＆ブレイド2風：0〜9で隊を選び、F1・F2…で指図
      const kl = k.toLowerCase(), fm = /^F([1-9])$/.exec(k);
      if (fm) { e.preventDefault(); const n = +fm[1]; if (!R.ordMenu || R.ordMenu === 'root') { const m = [null, 'move', 'face', 'form', 'fire'][n]; if (m) ordMenu(m); } else { const o = ORDK[R.ordMenu][n - 1]; if (o) ord3(o); } return; }
      if ('wasd'.includes(kl) && kl.length === 1) { keys.add(kl); G.padUsed = false; return; }
      if (k === ' ') { e.preventDefault(); G.actDash = true; return; }
      if (kl === 'r') { G.actRide = true; return; } /* 1.6.17 馬の乗り降り */
      if (kl === 'q') { G.actSw = true; return; } // 0.64.0 武器の持ち替え
      if (kl === 'e') { G.actJmp = true; return; } // 0.64.0 ジャンプ
      if (/^[0-9]$/.test(k)) { sel3(+k); if (!R.ordMenu) ordMenu('root'); return; }
      if (k === 'Escape' || k === 'Backspace') { if (R.ordMenu) { ordMenu(null); return; } if (k === 'Escape') { toggleMenu(true); return; } }
      if (k === 'Tab') { e.preventDefault(); actSel(1); return; }
      return;
    }
    if (actB() && !activeMenuNotBattle()) {
      const kl = k.toLowerCase(), o = { z: 'charge', x: 'guard', c: 'hold', f: 'follow' }[kl];
      if ('wasd'.includes(kl) && kl.length === 1) { keys.add(kl); G.padUsed = false; return; }
      if (k === ' ') { e.preventDefault(); G.actDash = true; return; }
      if (o) { actOrder(o); return; }
      if (/^[1-9]$/.test(k)) { const AB = actB(), u = AB.units.find((x) => x.idx === +k && (x.owner === G.myPid || x.cmd === G.myPid)); G.selUnit = k === '1' ? (G.selUnit === 'all' ? null : 'all') : u ? (G.selUnit === u.id ? null : u.id) : G.selUnit; battleHtml = ''; return; }
      if (k === 'Escape') { toggleMenu(true); return; }
      if (k === 'Tab') { e.preventDefault(); actSel(1); return; }
    }
    const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[k];
    if (activeMenu()) {
      if (dir) { e.preventDefault(); navMenu(dir[0], dir[1]); return; }
      if (k === 'Enter' || k === ' ') { e.preventDefault(); pressMenu(); return; }
      if (activeMenu() === $('battle')) {
        if (k === 'Escape') { toggleMenu(true); return; }
        const o = { z: 'charge', x: 'guard', c: 'hold' }[k.toLowerCase()]; if (o) { shout(null, 'all', o); command({ type: 'order', unit: 'all', order: o }); return; }
      }
      if (k === 'Escape') { if (activeMenu() === $('mapPanel')) smClose(); else if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); return; }
      if (activeMenu() === $('mapPanel') && (k === '+' || k === '=' || k === '-')) { smZoom(k === '-' ? 1 / 1.5 : 1.5); return; }
      if (activeMenu() === $('char') && (k === 'q' || k === 'e')) { cycleCTab(k === 'q' ? -1 : 1); return; }
      if (activeMenu() === $('char') && (k === 'p' || k === 'P')) { openChar(false); return; }
      if (activeMenu() === $('town') && (k === 'q' || k === 'e')) { cycleTab(k === 'q' ? -1 : 1); return; }
    }
    if (G.mode !== 'host' && G.mode !== 'client') return;
    keys.add(k.toLowerCase());
    if (k === 'Escape') toggleMenu();
    else if (k === 'f' || k === 'F') $('mFollow').click();
    else if (k === 'i' || k === 'I') openSub('inv'); // 1.3.0 I：持っている物資
    else if (k === 'Tab') { e.preventDefault(); cycleNear(); }
    else if (k === 'e' || k === 'E') { if (!$('joinBtn').classList.contains('hidden')) $('joinBtn').click(); else openTown(true); }
    else if (k === 'p' || k === 'P') openChar(true);
    else if (k === 'Enter' && G.selected) $('infoGo').click();
    else if (k === '+' || k === '=' || k === ';') anyZoom(1.2); else if (k === '-') anyZoom(1 / 1.2);
    else if (G.mode === 'host' && '12345'.includes(k)) { G.speed = [0, 1, 2, 4, 8][+k - 1]; G.autoPause = 0; }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // 近い拠点を順番に選ぶ（キーボードのTab／コントローラーのX）
  let nearIdx = 0;
  function questMarks() { /* 1.6.43 依頼の作業する場所（ダイヤ印）：拠点の id と、動く相手の位置 pts */
    const P = G.priv, marks = new Set(); marks.pts = [];
    if (!P || !P.me) return marks;
    for (const q of P.me.quests || []) {
      const k = q.type === 'deliver' ? q.to : q.mk !== undefined ? q.mk : q.from;
      if (k) marks.add(k);
      if (q.pt) marks.pts.push(q.pt);
    }
    if (P.me.nin && P.me.nin.q && P.me.nin.q.to) marks.add(P.me.nin.q.to); /* 忍びの依頼 */
    return marks;
  }
  function cycleNear() { /* 1.6.43 □：受けている依頼の場所を先に（近い順）、そのあと近くの拠点 */
    const m = me(); if (!m) return;
    const dd = (a) => Math.hypot(a.x - m.x, a.y - m.y), mk = questMarks();
    const qs = [...G.view.settlements.filter((s) => mk.has(s.id)), ...mk.pts.map((p) => ({ x: p[0], y: p[1], pt: 1 }))].sort((a, b) => dd(a) - dd(b));
    const near = [...G.view.settlements].filter((s) => !mk.has(s.id)).sort((a, b) => dd(a) - dd(b)).slice(0, 6);
    const list = [...qs, ...near]; if (!list.length) return;
    const s = list[nearIdx++ % list.length];
    if (s.pt) { if (G.selected) selectSettlement(null); toast('依頼の相手', 800); } else selectSettlement(s);
    R.cam.follow = false; R.cam.x = s.x; R.cam.y = s.y;
    if (G.pcurOn) G.pcur = [cv.clientWidth / 2, cv.clientHeight / 2];
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
      if (near && near[1] < Math.max(8, 0.6 + Math.sqrt(near[0][4]) * 0.7 + 5) && near[0][0] !== G.selUnit) { G.selUnit = near[0][0]; G.fpick = null; SGK.AUDIO.sfx('click'); }
      else if (G.fpick) pickFace(G.bcur[0], G.bcur[1]);
      else if (G.selUnit != null) { moveFace(G.selUnit, G.bcur[0], G.bcur[1]); G.fpick = { unit: G.selUnit, x: G.bcur[0], y: G.bcur[1] }; toast('カーソルを向かせたい方へ動かしてA（Bで向きはそのまま）', 1500); }
    }
    if (down(1) && G.fpick) { G.fpick = null; toast('向きはそのままにしました', 800);
    }
  }
  // 照準の十字
  /* 1.6.55 地図のカーソルの見た目（設定で変える・この端末に記憶） */
  const CUR = { sz: [['小', 0.7], ['普通', 1], ['大', 1.4], ['特大', 1.9]], sh: [['十字と丸'], ['十字'], ['丸'], ['矢印'], ['点']],
    co: [['白', '#ffffff'], ['黄', '#f2c14e'], ['赤', '#ff5040'], ['水色', '#60d0ff'], ['緑', '#70e070'], ['黒', '#202020']], op: [['濃い', 1], ['少し薄い', 0.75], ['半分', 0.5], ['かなり薄い', 0.3]] };
  let curSet = { sz: 1, sh: 0, co: 0, op: 0 }; try { Object.assign(curSet, JSON.parse(localStorage.getItem('sgk-cur') || '{}')); } catch (e) {}
  const curLbl = () => { const N = { sz: '大きさ', sh: '形', co: '色', op: '薄さ' }; for (const k of ['sz', 'sh', 'co', 'op']) $('mCur' + k[0].toUpperCase() + k[1]).textContent = `${N[k]}：${CUR[k][curSet[k] % CUR[k].length][0]}`; };
  for (const k of ['sz', 'sh', 'co', 'op']) $('mCur' + k[0].toUpperCase() + k[1]).onclick = () => { curSet[k] = (curSet[k] + 1) % CUR[k].length; try { localStorage.setItem('sgk-cur', JSON.stringify(curSet)); } catch (e) {} curLbl(); };
  curLbl();
  function drawMapCur(x, y) {
    const sc = CUR.sz[curSet.sz][1], col = CUR.co[curSet.co][1], sh = curSet.sh, dark = curSet.co === 5;
    ctx.save(); ctx.globalAlpha = CUR.op[curSet.op][1]; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      ctx.strokeStyle = k ? col : dark ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.7)'; ctx.lineWidth = (k ? 2 : 4) * Math.max(1, sc * 0.8); ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      if (sh === 0 || sh === 2) { ctx.moveTo(x + 9 * sc, y); ctx.arc(x, y, 9 * sc, 0, 7); }
      if (sh === 0 || sh === 1) { const a = sh ? 2 : 5; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * a * sc, y + dy * a * sc); ctx.lineTo(x + dx * 16 * sc, y + dy * 16 * sc); } }
      if (sh === 3) { ctx.moveTo(x, y); ctx.lineTo(x, y + 20 * sc); ctx.lineTo(x + 5 * sc, y + 15 * sc); ctx.lineTo(x + 13 * sc, y + 14 * sc); ctx.closePath(); }
      ctx.stroke();
      if (sh === 4) { ctx.beginPath(); ctx.arc(x, y, (k ? 4 : 5.5) * sc, 0, 7); ctx.fill(); }
      if (sh === 3 && k) ctx.fill();
    }
    ctx.restore();
  }
  function drawCross(x, y, col) {
    ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.moveTo(x - 16, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 16, y);
      ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 16); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2;
    }
  }
  function pollPad(dt) {
    if (SGK.MINEUI && SGK.MINEUI.isOpen()) return [0, 0]; if (SGK.GATHERUI && SGK.GATHERUI.isOpen()) return [0, 0]; // 2.27.0 釣り場の画面 // 2.25.0 採掘の画面ではコントローラーを採掘に使う
    if ((SGK.NINJA && SGK.NINJA.on) || (SGK.NINJA3D && SGK.NINJA3D.on)) return [0, 0]; // 0.77.0 潜入中
    // 0.63.1 PCで別の機器（仮想コントローラーなど）が先に並ぶと使えなくなるので、最後に触ったコントローラーを使う（なければ標準配置のもの）
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false) : [];
    for (const p of pads) if (p.buttons.some((b) => b && b.pressed)) { if (G.padIdx !== p.index) { G.padIdx = p.index; for (const k in padPrev) padPrev[k] = true; } break; }
    const gp = pads.find((p) => p.index === G.padIdx) || pads.find((p) => p.mapping === 'standard') || pads[0]; if (!gp) return [0, 0];
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
        if (down(8)) { G.bpick = G.bpick ? null : bb[0] || null; G.bshare = !!G.bpick; setFocus($('battle'), G.bpick || null); } /* 1.6.62 シェアボタンで下のボタンへ移る／戻る */
        if ((!ML() || G.bpick) && (down(14) || down(15))) { const i = bb.indexOf(G.bpick), d = down(15) ? 1 : -1, j = i + d; G.bpick = j >= 0 && j < bb.length && i !== -1 ? bb[j] : G.bshare && i !== -1 ? bb[i] : i === -1 ? bb[d > 0 ? 0 : bb.length - 1] : null; setFocus($('battle'), G.bpick || null); }
        if (G.bpick && !bb.includes(G.bpick)) G.bpick = null;
        if (G.bshare && !G.bpick) G.bshare = false;
        if (down(0) && G.bpick) { const b = G.bpick; G.bpick = null; G.bshare = false; setFocus($('battle'), null); b.click(); }
        else if (ML() && !G.bpick) { // 0.64.0 りょうさんの配置：R1攻撃 L1防御 L2ホイールで隊選び R2そこへ移動 十字↑突撃↓停止→照準の方を向く←AI任せ ✕ジャンプ ○回避 △武器持ち替え □随行
          G.padMv = [lx, ly]; G.padAim = null; G.padUsed = true; G.vcurOn = false;
          const wh = btn(6), AB0 = actB(), r2 = btn(7); // 0.75.0 R2：短く押すとそこへ移動、長押しで隊形のホイール
          if (r2) G.r2t = (G.r2t || 0) + dt;
          const fw = r2 && G.r2t > 0.35 && !wh;
          if (wh && AB0) { // L2を押している間：右スティックで隊を選ぶ。離すと決定
            const TRs = SIM.TROOPS, L = [['all', '全軍'], ...myUnits3(AB0).sort((a, b) => a.idx - b.idx).map((u) => [u.id, `${u.idx - 1} ${TRs[u.type].short || TRs[u.type].name}${u.n}`])];
            if (!R.wheel || R.wheel.k) R.wheel = { L, i: Math.max(0, L.findIndex((x) => x[0] === G.selUnit)) };
            R.wheel.L = L; if (R.wheel.i >= L.length) R.wheel.i = 0;
            if (Math.hypot(rx, ry) > 0.5) { const a = (Math.atan2(rx, -ry) + Math.PI * 2) % (Math.PI * 2); R.wheel.i = Math.round(a / (Math.PI * 2 / L.length)) % L.length; }
          } else if (fw && AB0) {
            if (!R.wheel || R.wheel.k !== 'form') R.wheel = { k: 'form', L: [...ORDK.form.map((o, i) => [o, ORDM.form[i][1]]), ['fire:1', '自由に射て'], ['fire:0', '射撃をやめよ']], i: -1 };
            if (Math.hypot(rx, ry) > 0.5) { const n = R.wheel.L.length, a = (Math.atan2(rx, -ry) + Math.PI * 2) % (Math.PI * 2); R.wheel.i = Math.round(a / (Math.PI * 2 / n)) % n; }
          } else {
            if (R.wheel && R.wheel.k === 'form') { const it = R.wheel.L[R.wheel.i]; R.wheel = null; if (it) ord3(it[0]); }
            else if (R.wheel) { const it = R.wheel.L[R.wheel.i]; R.wheel = null; if (it) { G.selUnit = it[0]; battleHtml = ''; toast(`${it[1]}を選びました`, 800); } }
            const c = R.acam; c.yaw = (c.yaw || 0) + rx * 2.6 * dt; c.pitch = Math.max(-0.5, Math.min(1.2, (c.pitch || 0) + ry * 1.6 * dt));
          }
          G.padAtk = btn(5); G.padBlk = btn(4);
          if (down(0)) G.actJmp = true; if (down(1)) G.actDash = true; if (btn(3)) { G.ytT = (G.ytT || 0) + dt; if (G.ytT >= 0.6 && !G.ytDone) { G.ytDone = true; G.actRide = true; } } else { if (G.ytT > 0 && !G.ytDone) G.actSw = true; G.ytT = 0; G.ytDone = false; } /* 1.6.17 △短押し＝持ち替え、長押し＝馬の乗り降り */ if (down(2)) ord3('follow');
          if (!r2 && G.r2t) { if (G.r2t <= 0.35) ord3('move'); G.r2t = 0; } if (down(12)) ord3('charge'); if (down(15)) ord3('guard'); if (down(13)) ord3('follow'); if (down(14)) ord3('hold'); // 2.6.1 ↑突撃 →防御 ↓追従 ←待機
          if (btn(10)) bZoom(1 - dt * 1.5); if (btn(11)) bZoom(1 + dt * 1.5);
        } else if (actB()) { // 0.56.0 アクション戦闘：左スティック移動・右スティック狙い・RT/A攻撃・Bかわす・LB/RB隊を選ぶ・X突撃・Y随行・十字↑待機↓後退
          // 0.61.0 右スティックはマウスのようにカーソルを動かす（狙いもカーソルの方）。Aでカーソルの隊を選ぶ、LTでそこへ動かす（押したまま動かすと向き）
          G.padMv = [lx, ly]; G.padAim = null; G.padUsed = false;
          const W0 = cv.clientWidth, H0 = cv.clientHeight; if (!G.vcur) G.vcur = [W0 / 2 + 80, H0 / 2];
          const am = Math.hypot(rx, ry);
          if (am > 0) { const sp = 1100 * Math.pow(am, 1.6) * dt; G.vcur = [Math.max(0, Math.min(W0, G.vcur[0] + rx / am * sp * Math.min(1, am))), Math.max(0, Math.min(H0, G.vcur[1] + ry / am * sp * Math.min(1, am)))]; G.vcurOn = true; }
          if (G.vcurOn) G.mouseXY = G.vcur;
          G.padAtk = btn(7); if (down(1)) G.actDash = true;
          if (down(0)) { G.vcurOn = true; G.mouseXY = G.vcur; actPick(G.vcur[0], G.vcur[1]); }
          if (down(6)) { G.vcurOn = true; G.padRD = G.vcur.slice(); }
          if (G.padRD && !btn(6)) { const D = G.padRD; G.padRD = null; actMoveTo(D, G.vcur); }
          if (down(4)) actSel(-1); if (down(5)) actSel(1);
          if (down(2)) actOrder('charge'); if (down(3)) actOrder('follow'); if (down(12)) actOrder('charge'); if (down(15)) actOrder('guard'); if (down(13)) actOrder('follow'); if (down(14)) actOrder('hold');
          if (btn(10)) bZoom(1 - dt * 1.5); if (btn(11)) bZoom(1 + dt * 1.5); // スティック押し込み：L3縮小・R3拡大
        } else { padBattle(down, lx + rx, ly + ry, dt); if (btn(6)) bZoom(1 - dt * 1.5); if (btn(7)) bZoom(1 + dt * 1.5); } // LT縮小・RT拡大
      } else {
        if (nx || ny) { if (!navHold || now - lastNav > (navHold === 1 ? 400 : 150)) { navMenu(Math.abs(nx) >= Math.abs(ny) ? Math.sign(nx) : 0, Math.abs(nx) >= Math.abs(ny) ? 0 : Math.sign(ny)); lastNav = now; navHold++; } }
        else navHold = 0;
        if (down(0)) pressMenu();
      }
      if (down(1) && !inBattle) { if (activeMenu() === $('namePanel')) nkDel(); else if (activeMenu() === $('mapPanel')) smClose(); else if (G.mode === 'title') titleBack(); else if (activeMenu() === $('char')) openChar(false); else if (activeMenu() === $('town')) openTown(false); else menuBack(); }
      if (activeMenu() === $('mapPanel')) { if (down(4)) smZoom(1 / 1.5); if (down(5)) smZoom(1.5); }
      if (activeMenu() === $('town')) { if (down(4)) cycleTab(-1); if (down(5)) cycleTab(1); }
      else if (activeMenu() === $('char')) { if (down(4)) cycleCTab(-1); if (down(5)) cycleCTab(1); if (down(8)) openChar(false); }
      if (!inBattle && ry) { // 右スティック：開いている画面をスクロール
        const m = activeMenu(), sc = [m, ...m.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
        if (sc) sc.scrollTop += ry * Math.abs(ry) * dt * 900;
      }
      if (down(3) && !inBattle && !$('mSub').classList.contains('hidden') && G.sub === 'inv') toggleMenu(false);
      if (down(9) && G.mode !== 'title') toggleMenu(inBattle);
    } else if (G.mode === 'host' || G.mode === 'client') {
      // 左スティック：画面のカーソルを動かす（端まで行くと地図が動く）。右スティック：視点
      const W = cv.clientWidth, H = cv.clientHeight;
      if (lx || ly) {
        if (!G.pcurOn) { G.pcurOn = true; G.pcur = [W / 2, H / 2]; }
        R.cam.follow = false; // 0.75.0 カーソルを自分で動かしたら追いかけをやめる
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
        else if (!$('joinBtn').classList.contains('hidden')) $('joinBtn').click(); // 1.6.14 近くに合戦があればAで加わる
        else openTown(true);
      }
      if (down(1)) { if (G.selected) selectSettlement(null); else if (G.pcurOn || !R.cam.follow) { G.pcurOn = false; R.cam.follow = true; } else command({ type: 'stop' }); }
      if (down(8)) openChar(true);
      if (G.mode === 'host' && !infoOpen && (down(14) || down(15))) { const S = [0, 1, 2, 4, 8], i = S.indexOf(G.speed); G.autoPause = 0; G.speed = S[Math.max(0, Math.min(4, i + (down(15) ? 1 : -1)))]; toast(G.speed ? `時間の速さ ×${G.speed}` : '時間を止めました', 900); }
      if (down(2)) cycleNear();
      if (down(3)) openSub('inv'); // 1.3.0 △：持っている物資
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
  function hitShow(wn, d) { /* 1.6.18 攻撃が当たったら画面の上に武器の名前とダメージ */
    let el = document.getElementById('hitLog');
    if (!el) { el = document.createElement('div'); el.id = 'hitLog'; el.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:50;pointer-events:none;text-align:center;font-weight:bold;text-shadow:0 0 4px #000,0 0 2px #000;color:#fff'; document.body.appendChild(el); }
    const r = document.createElement('div'); r.style.cssText = 'font-size:18px;transition:opacity .6s'; r.innerHTML = `${wn || '武器'}　<span style="color:#ffd24a">${d}</span>`;
    el.prepend(r); while (el.children.length > 4) el.lastChild.remove();
    setTimeout(() => { r.style.opacity = '0'; }, 1200); setTimeout(() => r.remove(), 1900);
  }
  function actInput(AB) {
    const h = AB.act.s.find((s) => s.pc === G.myPid), pm = G.padMv || [0, 0];
    if (h && h.hn !== G.lastHn) { if (G.lastHn != null && h.hn) hitShow(h.hw, h.hd); G.lastHn = h.hn; } /* 1.6.18 */
    const inp = { mx: pm[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0), my: pm[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0), atk: !!(G.actAtk || G.padAtk), dash: !!G.actDash, aim: null };
    G.actDash = false;
    if (G.tL) { const k = 55, dx = Math.max(-1, Math.min(1, (G.tL.x - G.tL.sx) / k)), dy = Math.max(-1, Math.min(1, (G.tL.y - G.tL.sy) / k)); inp.mx += dx; inp.my += dy; }
    if (G.tAtk) { inp.atk = true; G.tAtk = false; }
    if (!ML() && G.tAim != null && (G.tR || inp.atk)) inp.aim = G.tAim;
    if (ML()) { const y = R.acam.yaw || 0, f = -inp.my, r = inp.mx; inp.mx = Math.cos(y) * f - Math.sin(y) * r; inp.my = Math.sin(y) * f + Math.cos(y) * r; inp.aim = y; inp.blk = !!(G.actBlk || G.padBlk); inp.sw = !!G.actSw; inp.jmp = !!G.actJmp; inp.ride = !!G.actRide; G.actSw = G.actJmp = G.actRide = false; return inp; }
    if (h && G.actTouch) { const [x, y] = R.actToWorld(G.actTouch[0], G.actTouch[1]), d = Math.hypot(x - h.x, y - h.y); inp.aim = Math.atan2(y - h.y, x - h.x); if (d > 3.5) { inp.mx = (x - h.x) / d; inp.my = (y - h.y) / d; } inp.atk = d < 6; }
    else if (G.padAim != null) inp.aim = G.padAim;
    else if (h && G.mouseXY && !G.padUsed) { const [x, y] = R.actToWorld(G.mouseXY[0], G.mouseXY[1]); inp.aim = Math.atan2(y - h.y, x - h.x); }
    return inp;
  }
  // 1.6.2 描画中にエラーが出ても止まらないように（エラーの内容は画面に出す）
  function frame(now) { try { frame0(now); } catch (e) { const t = 'エラー: ' + (e && e.message) + ' ' + ((e && e.stack) || '').split('\n')[1]; if (G.lastErr !== t) { G.lastErr = t; errToast(t); } requestAnimationFrame(frame); } }
  function frame0(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    const padMove = pollPad(dt);
    if (G.mode === 'title') SGK.AUDIO.scene('title');
    if ((G.mode === 'host' || G.mode === 'client') && buildView()) {
      if (G.mode === 'host') { G.priv = SIM.privateState(G.world, G.myPid); SIM.drain(G.myPid).forEach(toastMsg); }
      // WASDで直接移動
      const BT = G.priv && G.priv.battle;
      if (BT && $('battle').classList.contains('hidden')) { SGK.AUDIO.sfx('battleStart'); $('battle').classList.remove('hidden'); openTown(false); openChar(false); selectSettlement(null); battleHtml = ''; }
      if (!BT && !$('battle').classList.contains('hidden')) { setTimeout(() => { if (performance.now() - resultSfxT > 1500) SGK.AUDIO.sfx('battleEnd'); }, 400); /* 1.6.58 勝ち負けの音が鳴るときは重ねない */ $('battle').classList.add('hidden'); battleHtml = ''; }
      let mx = BT ? 0 : padMove[0] + (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let my = BT ? 0 : padMove[1] + (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
      const m = me(); dirSendAcc += dt;
      if (BT) { mx = my = 0; }
      if (m && (mx || my)) {
        if (dirSendAcc > 0.1) { dirSendAcc = 0; const l = Math.hypot(mx, my); command({ type: 'move', x: m.x + (mx / l) * 2, y: m.y + (my / l) * 2 }); R.cam.follow = true; }
        wasDirMoving = true;
      } else if (wasDirMoving) { wasDirMoving = false; command({ type: 'stop' }); }
      // なめらか表示
      const k = Math.min(1, dt * 12);
      for (const e of [...G.view.players, ...G.view.npcs]) {
        let d = G.disp[e.id];
        if (G.mode === 'client') { // 2.40.1 参加者：届いた位置へ、届く間隔ぶんの時間をかけて等速で動かす（0.2秒ごとの位置を追いかけるとカクつくため）
          if (!d || d.bx == null || Math.hypot(d.bx - e.x, d.by - e.y) > 40) G.disp[e.id] = d = { x: e.x, y: e.y, ax: e.x, ay: e.y, bx: e.x, by: e.y, t: now, dur: 200 };
          else {
            if (e.x !== d.bx || e.y !== d.by) { // 2.49.0 先読み：動いている向きへ、次の知らせが届くころの位置まで先に進めて表示の遅れを減らす（止まる時は少し行き過ぎて戻る）
              const iv = Math.min(400, Math.max(40, G.stIv || 100)), vx = e.x - d.bx, vy = e.y - d.by, L = Math.hypot(vx, vy), cap = L > 0 ? Math.min(1, 1.5 / L) : 0;
              d.ax = d.x; d.ay = d.y; d.bx = e.x; d.by = e.y; d.px = e.x + vx * 0.9 * cap; d.py = e.y + vy * 0.9 * cap; d.t = now; d.dur = iv; }
            const f = Math.min(1, (now - d.t) / d.dur), tx = d.px != null ? d.px : d.bx, ty = d.py != null ? d.py : d.by; d.x = d.ax + (tx - d.ax) * f; d.y = d.ay + (ty - d.ay) * f;
          }
        } else if (!d || Math.hypot(d.x - e.x, d.y - e.y) > 5) G.disp[e.id] = { x: e.x, y: e.y };
        else { d.x += (e.x - d.x) * k; d.y += (e.y - d.y) * k; }
      }
      const md = m && G.disp[m.id];
      if (R.cam.follow && md) { R.cam.x += (md.x - R.cam.x) * k; R.cam.y += (md.y - R.cam.y) * k; }
      const P = G.priv, marks = questMarks();
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
        if (BT.plan) G.planOf = BT.id; else if (G.planOf === BT.id) { G.planOf = null; if (G.mode === 'host' && G.speed === 0) { G.speed = 1; G.autoPause = 0; toast('合戦が始まったので、時間を動かしました', 1500); } } // 2.23.1 止めたままだと合戦が進まないので
        if (G.actDef && BT.canAct && !BT.act && G.autoActFor !== BT.id) { G.autoActFor = BT.id; command({ type: 'actStart' }); } // 1.6.13 戦が始まったら自分で戦う
        const AB = actB();
        if (!AB) { R.act3dOn = false; if (R.ordMenu) ordMenu(null); }
        if (AB && G.yawFor !== AB.id) { G.yawFor = AB.id; const h0 = AB.act.s.find((s) => s.pc === G.myPid); R.acam.yaw = h0 && h0.side === 'B' ? Math.PI : 0; R.acam.pitch = 0.28; R.acam.z = 9; G.actBlk = false; if (document.body.classList.contains('touch')) { R.act3dOn = true; command({ type: 'order', unit: 'all', order: 'ai' }); } } // 2.7.1 スマホは3Dで、味方はAIに任せる
        if (document.pointerLockElement === cv && (!ML() || !$('gameMenu').classList.contains('hidden'))) document.exitPointerLock();
        if (AB) {
          const menuOpen = !$('gameMenu').classList.contains('hidden'), inp = menuOpen ? { mx: 0, my: 0, atk: false, dash: false, aim: null } : actInput(AB);
          if (G.mode === 'host') { AB.act.inp[G.myPid] = inp; if (inp.dash) AB.act.dq[G.myPid] = true; if (inp.sw) (AB.act.wq = AB.act.wq || {})[G.myPid] = true; if (inp.jmp) (AB.act.jq = AB.act.jq || {})[G.myPid] = true; if (inp.ride) (AB.act.rq = AB.act.rq || {})[G.myPid] = true; if (!(menuOpen && soloHost())) SIM.actStep(G.world, AB, dt); }
          else { // 0.62.0 参加者：入力をホストへ送り（かわすはすぐ）、自分の本人は手もとで先に動かす
            G.actSendAcc = (G.actSendAcc || 0) + dt; const key = `${inp.mx.toFixed(2)},${inp.my.toFixed(2)},${inp.aim == null ? '' : inp.aim.toFixed(2)},${inp.atk},${inp.blk}`;
            if (inp.dash || inp.sw || inp.jmp || inp.ride || (key !== G.actLastKey && G.actSendAcc > 0.05) || G.actSendAcc > 0.5) { G.actSendAcc = 0; G.actLastKey = key; command(Object.assign({ type: 'actIn' }, inp)); }
            SIM.actSmooth(AB, dt, G.myPid, inp);
          }
          R.actPad = !!G.padUsed; R.actCur = G.vcurOn && G.vcur ? { p: G.vcur, d: G.padRD } : null; R.aimXY = aimXY(); R.drawAction(ctx, AB, G.myPid, G.selUnit, dt, BT.ter); renderBattle(BT);
        } else { R.drawBattle(ctx, BT, G.disp, G.myPid, G.selUnit); renderBattle(BT); }
        if (G.bcur && !AB) { const L = R.battleLayout(SIM.FIELD); drawCross(L.ox + G.bcur[0] * L.sc, L.oy + G.bcur[1] * L.sc, '#f2c14e'); }
        { // 0.59.0 向きを決める矢印
          let a = null, b2 = null;
          if (!AB && G.fpick) { const L = R.battleLayout(SIM.FIELD); a = [L.ox + G.fpick.x * L.sc, L.oy + G.fpick.y * L.sc]; b2 = G.bcur && !(G.hovT > performance.now() - 1500) ? [L.ox + G.bcur[0] * L.sc, L.oy + G.bcur[1] * L.sc] : G.hov; }
          const rp = [...ptrs.values()].find((q) => q.btn === 2); if (!AB && rp && dragMoved && G.selUnit != null) { a = [rp.sx, rp.sy]; b2 = [rp.x, rp.y]; }
          if (AB && G.actRD && G.mouseXY) { a = G.actRD; b2 = G.mouseXY; }
          if (a) { ctx.save(); ctx.strokeStyle = '#ffe070'; ctx.fillStyle = '#ffe070'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(a[0], a[1], 6, 0, 7); ctx.fill();
            if (b2 && Math.hypot(b2[0] - a[0], b2[1] - a[1]) > 8) { const an = Math.atan2(b2[1] - a[1], b2[0] - a[0]), e2 = [a[0] + Math.cos(an) * 46, a[1] + Math.sin(an) * 46];
              ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(e2[0], e2[1]); ctx.stroke(); ctx.beginPath(); ctx.moveTo(e2[0] + Math.cos(an) * 8, e2[1] + Math.sin(an) * 8); ctx.lineTo(e2[0] + Math.cos(an + 2.4) * 12, e2[1] + Math.sin(an + 2.4) * 12); ctx.lineTo(e2[0] + Math.cos(an - 2.4) * 12, e2[1] + Math.sin(an - 2.4) * 12); ctx.fill(); }
            ctx.restore(); }
        }
      } else {
        G.bcur = null;
        G.view.myClan = P && P.me && P.me.rank ? P.me.rank.clan || null : null;
        G.view.myHome = P && P.me && P.me.home ? P.me.home.id : null; // 2.40.0 自宅のある拠点を地図で目立たせる
        R.draw(ctx, G.view, G.disp, G.myPid, G.selected, marks);
        if (G.pcurOn) drawMapCur(G.pcur[0], G.pcur[1]);
      }
      { const mt = P && P.me && P.me.meet; if (mt && mt !== G.lastMeet && !BT) { const u = findUnit(mt); if (u) { selectUnit(u); toast('追いつきました。話しかけるか、攻めかかるかを選んでください（閉じると相手は動き出します）', 3500); } } G.lastMeet = mt || null; } // 0.73.4
      if (G.selKind === 'u' && !BT) refreshUnitInfo();
      $('townBtn').classList.toggle('hidden', !(P && P.here) || !!BT);
      $('testBtn').classList.toggle('hidden', !(P && P.me && P.me.test) || !!BT); // 2.12.1
      if (SGK.RENDER && SGK.RENDER.act3d) SGK.RENDER.act3d.cloth = P && P.battle ? P.battle.cloth || null : null; // 2.12.5 戦場の服の色
      if (SGK.GAMBLEUI && SGK.GAMBLEUI.isOpen()) { const nw = performance.now(); if (!G.gbUiT || nw - G.gbUiT > 250) { G.gbUiT = nw; SGK.GAMBLEUI.update(P); } } // 2.12.4 賭場の画面
      $('joinBtn').classList.toggle('hidden', !(P && P.nearBattle) || !!BT); if (P && P.nearBattle) $('joinBtn').textContent = `合戦に加わる（${P.nearBattle.foe}）${G.padUsed ? ' Ⓐ' : ' [E]'}`;
      // 拠点に着いたら自動で拠点画面を開く
      const hereId = P && P.here && !BT ? P.here.id : null;
      if (hereId && hereId !== G.lastHere && $('char').classList.contains('hidden') && $('gameMenu').classList.contains('hidden')) { SGK.AUDIO.sfx('arrive'); openTown(true); }
      // BGM：戦闘・拠点の中・昼・夜で曲を変える
      SGK.AUDIO.scene(SGK.NINJA3D && SGK.NINJA3D.on && SGK.NINJA3D.night() ? 'ninja_night' /* 2.24.1 忍びの任務（夜） */ : BT ? (BT.ck ? 'siege' : 'battle') /* 2.20.0 城の戦は攻城戦の曲 */ : SGK.GAMBLEUI && SGK.GAMBLEUI.isOpen() ? 'gamble' : !$('town').classList.contains('hidden') ? (TOWN_BGM[townTab] || 'town') : SIM.daylight(G.view.t) < 0.5 ? 'night' : 'day');
      G.lastHere = hereId;
      { // 0.73.0 評定が開かれたら人物画面の「評定」を開く
        const hy = P && P.me && P.me.hyo; $('ctab-hyo').classList.toggle('hidden', !hy);
        if (hy && G.hyoSeen !== hy.id) { G.hyoSeen = hy.id; SGK.AUDIO.sfx('arrive'); openChar(true); setCTab('hyo'); }
        else if (!hy && charTab === 'hyo') { charTab = 'eq'; charHtml = ''; }
      }
      if (!$('town').classList.contains('hidden')) renderTown();
      if (!$('char').classList.contains('hidden')) renderChar();
      if (P) {
        { // 本人の体力（傷は戦のあとも残り、拠点で休むと治る）
          const max = P.me.hpMax || 35, BT2 = P.battle, h = BT2 && BT2.units.find((u) => u[2] === G.myPid && u[3] === 'hero');
          const hp = BT2 ? (h ? Math.max(0, h[11] != null ? h[11] : max) : 0) : Math.round(max * (P.me.hpFrac == null ? 1 : P.me.hpFrac)), r = Math.max(0, Math.min(1, hp / max));
          const html = `体力 <span style="display:inline-block;width:110px;height:9px;background:rgba(0,0,0,.55);border:1px solid #0008;vertical-align:middle"><span style="display:block;height:100%;width:${(r * 100).toFixed(0)}%;background:${r > 0.5 ? '#6fbf73' : r > 0.25 ? '#e0c060' : '#e07a6a'}"></span></span> ${hp}/${max}${!BT2 && r < 1 ? `<span class="muted">（${P.here ? '休んで回復中' : '拠点で休むと治る'}）</span>` : ''}`;
          if ($('hpBar').innerHTML !== html) $('hpBar').innerHTML = html;
        }
        { const wb = P.me.warBoard || [], el = $('warBoard'), h = wb.length ? '<b>戦況</b>' + wb.map((x) => `<div style="color:${x.atk ? '#e0c060' : '#ff6a4a'}">${SGK.ICON.html(x.atk ? 'swords' : 'warn', 16)} ${x.text}</div>`).join('') : '';
          el.classList.toggle('hidden', !h || !!(G.priv && G.priv.battle)); if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } }
        renderCaptive(P.me);
        $('quests').innerHTML = `所持金 ${SIM.money(P.me.money)}　${loadTxt(P.me)}　名声 ${P.me.fame}${P.me.infamy ? `　<span style="color:#e07a6a">悪名 ${P.me.infamy}</span>` : ''}${P.me.rank && P.me.rank.clan ? `　功績 ${P.me.rank.merit}${(() => { const n = SIM.RANKS[P.me.rank.rank + 1]; return n && !n.indep ? '/' + n.merit : ''; })()}` : ''}　兵 ${SIM.troopCount(P.me.troops)}/${P.me.troopCap}　行軍 ${P.me.speed}km/日` + (P.me.wage ? `<br>兵の給金 ${SIM.money(P.me.wage)}/日${P.me.money < P.me.wage ? '　<b style="color:#e07a6a">払えません</b>' : '（約' + Math.floor(P.me.money / P.me.wage) + '日分）'}` : '') + (P.me.riceNeed ? `<br>士気 <b style="color:${P.me.morale < 35 ? '#e07a6a' : P.me.morale < 60 ? '#e0c060' : '#6fbf73'}">${P.me.morale}</b>　兵糧 米${(P.me.inv && P.me.inv.rice) || 0}俵（1日${P.me.riceNeed}俵・${P.me.hungry ? '<b style="color:#e07a6a">米が足りません</b>' : '約' + P.me.riceDays + '日分'}）` : '') + (P.me.follow ? `<br>追跡中：${P.me.follow}` : '') + (P.me.busy ? `<br>${P.me.busy.label}中…` : '')
          + P.me.quests.map((q) => `<div class="q">◆ ${q.title}（${q.where || (q.type === 'deliver' ? sName(q.to) + 'へ' : sName(q.from) + 'へ納品')}・${dayLeft(q.deadline)}）</div>`).join('') + (P.me.nin && P.me.nin.q ? `<div class="q">◆ ${SIM.NIN.jobs[P.me.nin.q.k].name}（${sName(P.me.nin.q.to)}・${dayLeft(P.me.nin.q.deadline)}）</div>` : '');
      }
      // HUD
      const dEl = $('date'); dEl.textContent = SIM.formatDate(G.view.t) + (G.speed === 0 ? '（停止中）' : G.speed > 1 ? (G.inBattle ? '（戦闘中のため×1）' : `（×${G.speed}）`) : '');
      { const wx = SIM.weatherAt && SIM.weatherAt(G.view.t); if (wx) { const sp = document.createElement('span'); sp.className = 'wx'; sp.title = wx.name; sp.textContent = ' ' + wx.mark; dEl.appendChild(sp); } } // 2.52.0 時間の横に天気（絵文字は仮。weather.js の mark を絵にする）
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
