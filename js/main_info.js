// 地図で選んだ拠点・部隊の情報
// 2.57.2 main.js を画面ごとに分けた。main*.js は外側の関数で包まず、名前（G・$・toast など）を大域で分け合う。index.html の順に読み込むこと
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

