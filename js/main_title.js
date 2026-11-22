// タイトル・セーブの枠・世界の一覧・家紋の編集・はじめの人物づくり・開始地点
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
// ---------- タイトル ----------
// ---------- セーブスロット（new：新しく作る／load：続きから／import：ファイルを読み込む） ----------
let slotMode = 'load', slotConfirm = null, importWorld = null, slotBusy = false;
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
    if (entering || slotBusy) return; slotBusy = true; // 2.106.17 二度押しで二重に読み込まない
    try {
      titleMsg(''); loadMsg('セーブを読み込んでいます…'); await loadPaint();
      const r = await SGK.SAVE.load(n); if (!r) { loadMsg(null); return titleMsg('このスロットのセーブが読めませんでした'); }
      titleBack(); await playWorld(r.world.code || null, r.world, r.from === 'main' ? `スロット${n}の続きから再開しました` : 'セーブが読めなかったので、バックアップから再開しました', n);
    } catch (err) { loadMsg(null); titleMsg(err.message); } finally { slotBusy = false; }
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

