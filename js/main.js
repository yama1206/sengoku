// 共通の道具（知らせ・画面の切り替え）とメニューのカーソル操作
// 画面の流れ・入力（キーボード／マウス／コントローラー／タッチ）・ホストのループ
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
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
    if (n < 2) { location.replace(location.pathname + '?v=' + Date.now()); throw new Error('reload'); } }
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
function toastMsg(text) {
  const show = () => { msgSfx(text); toast(text, 4000); bushoReply(text); };
  if (!SGK.GAMBLEUI?.deferDiceNotice(text, show)) show();
}
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
// 2.106.17 世界に入るまでの「読み込み中」。text を渡すと出す（文字を変える）、null で消す。画面を切り替えた時（show）は必ず消す
function loadMsg(text) { const m = $('loadMask'); if (!m) return; if (text == null) { m.classList.add('hidden'); return; } $('loadText').textContent = text; m.classList.remove('hidden'); }
const loadPaint = () => new Promise((r) => setTimeout(r, 40)); // 重い処理の前に「読み込み中」を描かせる（rAF は隠れた画面で止まるので setTimeout）
function show(id) { loadMsg(null); ['title', 'game'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); if (id === 'game') requestAnimationFrame(() => fit()); }

// ---------- メニュー操作（キー・コントローラー：押した方向へ移動／決定してもカーソル位置は保つ） ----------
const focusMem = {};
function activeMenuNotBattle() { const m = activeMenu(); return m && m !== $('battle'); }
function activeMenu() {
  if (G.mode === 'title') return $('mSet').parentNode === $('title') && !$('mSet').classList.contains('hidden') ? $('mSet') : !$('mapPanel').classList.contains('hidden') ? $('mapPanel') : !$('createPanel').classList.contains('hidden') ? $('createPanel') : !$('carryPanel').classList.contains('hidden') ? $('carryPanel') : !$('slotPanel').classList.contains('hidden') ? $('slotPanel') : !$('friendPanel').classList.contains('hidden') ? $('friendPanel') : !$('namePanel').classList.contains('hidden') ? $('namePanel') : $('joinPanel').classList.contains('hidden') ? $('titleMenu') : $('joinPanel');
  { const pt = document.getElementById('ptRes') || document.getElementById('ptBox'); if (pt) return pt; } // 2.69.2 「みんなで遊ぶ」の部屋・結果の窓もコントローラーで操作できるように
  if (!$('gameMenu').classList.contains('hidden')) return $('gameMenu');
  if (!$('char').classList.contains('hidden')) return $('char');
  if (!$('town').classList.contains('hidden')) return $('town');
  if (!$('battle').classList.contains('hidden')) return $('battle');
  if (!$('captive').classList.contains('hidden')) return $('captive');
  return null;
}
function menuButtons(m) { const a = [...m.querySelectorAll('button')]; if (m.id === 'titleMenu') a.push($('updateBtn')); if ((m.id === 'info' || m.id === 'town') && G.mode === 'host') a.push(...$('speedBox').querySelectorAll('button')); /* 2.99.8 拠点の窓を開いている間も、右下の時間ボタンへ十字キーで移れる */ return a.filter((b) => !b.disabled && b.offsetParent); } // 0.60.2 タイトルの更新ボタンもコントローラーで選べる
function setFocus(m, b) { menuButtons(m).forEach((x) => x.classList.toggle('focus', x === b)); focusMem[m.id] = b ? b.id || b.textContent : null; }
function currentFocus(m) {
  const bs = menuButtons(m);
  return bs.find((b) => b.classList.contains('focus')) || bs.find((b) => (b.id || b.textContent) === focusMem[m.id]) || bs[0];
}
function navMenu(dx, dy, m = activeMenu()) {
  if (!m) return false;
  const bs = menuButtons(m); if (!bs.length) return true;
  const cur = currentFocus(m);
  if (m.id === 'town' && dy) {
    const gambleTab = $('tab-gamble'), enter = $('gb-open');
    const next = dy > 0 && cur === gambleTab ? enter : dy < 0 && cur === enter ? gambleTab : null;
    if (bs.includes(next)) {
      setFocus(m, next);
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return true;
    }
  }
  if ((m.id === 'ptBox' || m.id === 'ptRes') && dx) { const i = bs.indexOf(cur), nb = bs[Math.max(0, Math.min(bs.length - 1, i + dx))]; setFocus(m, nb); try { nb.scrollIntoView({ block: 'nearest' }); } catch (e) {} return true; } // 2.72.2 遊びの部屋は縦並び：左右は前後に動く
  const cr = cur.getBoundingClientRect();
  const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
  const townVertical = m.id === 'town' && dy && m.contains(cur);
  let best = null, bs2 = Infinity;
  for (const b of bs) {
    if (b === cur) continue;
    const r = b.getBoundingClientRect(); const vx = r.left + r.width / 2 - cx, vy = r.top + r.height / 2 - cy;
    const along = vx * dx + vy * dy; if (along <= 2) continue;
    const side = Math.abs(vx * dy - vy * dx); const score = along + side * 2;
    // 町の上下移動では、画面右下の時間ボタンより町のボタンを優先する。
    const inside = townVertical && m.contains(b), bestInside = best && townVertical && m.contains(best);
    if (!best || (inside && !bestInside) || (!!inside === !!bestInside && score < bs2)) { bs2 = score; best = b; }
  }
  setFocus(m, best || cur);
  if (best) try { best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} // 0.84.1 カーソルに合わせてスクロール
  if (best && m.onNav) m.onNav(best);
  return true;
}
function pressMenu() { const m = activeMenu(); if (!m) return false; const b = currentFocus(m); if (b) { setFocus(m, b); b.click(); } return true; }
document.addEventListener('mouseover', (e) => { const m = activeMenu(); if (m && e.target.tagName === 'BUTTON' && m.contains(e.target)) setFocus(m, e.target); });

