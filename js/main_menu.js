// 戦闘の操作パネル・捕らえた武将・ゲーム内メニュー・設定
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
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
function menuBack() { { const pt = document.getElementById('ptBox') || document.getElementById('ptRes'); if (pt) { const bs = menuButtons(pt); if (bs.length) bs[bs.length - 1].click(); return; } } // 2.69.2 みんなで遊ぶの窓：Bで閉じる（いちばん後ろのボタン＝閉じる・やめる）
  if (!$('mSub').classList.contains('hidden')) { if (G.sub === 'inv') toggleMenu(false); else { $('mSub').classList.add('hidden'); $('mMain').classList.remove('hidden'); setFocus($('gameMenu'), $('mZukan')); } return; } if (!$('mSet').classList.contains('hidden')) { $('mSet').classList.add('hidden'); $('mMain').classList.remove('hidden'); setFocus($('gameMenu'), $('mSettings')); } else toggleMenu(false); }
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
$('mRefit').onclick = () => { if (window.SGK_refit) window.SGK_refit(); toast('画面を合わせ直しました', 1200); }; // 2.99.4 縦横を切り替えたあとの予備
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
setInterval(() => { const mb = !!actB() && $('gameMenu').classList.contains('hidden') && document.body.classList.contains('touch'); if (mb === $('mobBar').classList.contains('hidden')) { $('mobBar').classList.toggle('hidden', !mb); if (!mb) G.mobTab = null; mobSub(); } }, 300);
$('mobBar').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
  if (b.id === 'mobWeapon') {
    if (actB() && $('gameMenu').classList.contains('hidden')) G.actSw = true;
    return;
  }
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

