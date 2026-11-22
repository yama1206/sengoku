// 0.77.0 忍び：忍びとして仕官すると、兵なしで身軽に動き、主家から敵の城への工作（破壊工作・襲撃・流言）を請け負う。工作は潜入のミニゲーム（js/ninja.js）で成否が決まる
(function () {
  const SIM = SGK.SIM, C = SIM.commands;
  const NR = SIM.NRANKS = [null,
    { name: '下忍', desc: '忍びとして召し抱えられたばかり。主家から敵の城への工作を請け負う' },
    { name: '中忍', desc: '腕を認められた忍び。工作の報酬が2割増える' },
    { name: '上忍', desc: '忍びをまとめる者。工作の報酬が4割増える' },
    { name: '忍頭', desc: '主家の忍びの頭。工作の報酬が6割増える。忍びはここが最高位' },
  ];
  const NIN = SIM.NIN = {
    mapSpd: 8,    // 地図での移動の速さ（加算）1.6.56 4→8
    actSpd: 1.35, // 合戦での本人の走る速さ（倍）1.6.32 1.2→1.35
    view: 1.4,    // 1.6.32 地図の視界（倍）
    seen: 0.6,    // 野盗などから見つかる距離（倍）
    armySeen: 0.45, // 0.78.0 大名の軍勢（武将の隊）から見つかる距離（倍）
    jobs: {
      sabo: { name: '破壊工作', desc: '兵糧蔵に火を付ける。成功すると城の守備兵が2割減る', reward: 1600, merit: 30 },
      raid: { name: '襲撃', desc: '武器蔵を壊す。成功すると30日のあいだ城の守りが15%下がる', reward: 2000, merit: 36 },
      gate: { name: '門の破壊', desc: '城門に細工をして傷める。成功すると門の強さが4割減る（普請で直すまでそのまま）。攻城戦で門を破りやすくなり、守りも弱まる', reward: 1500, merit: 28 },
      rumor: { name: '流言', desc: '城下の町人3人に噂を流す。成功すると守備兵が1割減り、30日のあいだ城の守りが8%下がる', reward: 1100, merit: 22 },
      // 2.24.0 武将に手傷を負わせる（殺しはしない）・盗む
      hurt: { name: '武将の襲撃', desc: '寝所の武将に手傷を負わせる（殺しはしない）。成功するとその武将は7日のあいだ出陣できない', reward: 2400, merit: 40 },
      steal: { name: '盗み', desc: '城の中から盗み出す', reward: 1800, merit: 32 },
    },
    // 2.24.0 盗む物（どれかが頼まれる）
    steal: {
      mitsu: { name: '密書', where: '御殿の書院', desc: '密書を盗む。成功すると敵の大名が次に攻めようとしている城と、近くの敵の城の守備兵の数が分かる' },
      ezu: { name: '城の絵図', where: '櫓の上', desc: '城の絵図を盗む。成功すると30日のあいだ、この城を攻める時の守りが12%下がる' },
      kin: { name: '軍資金', where: '金蔵', desc: '兵の給金を盗む。成功すると守備兵が1割減り、盗んだ金の分け前（報酬の半分）も入る' },
    },
    hurtDays: 7, // 2.24.0 ユーザーの希望で60日→7日
    // 2.24.0 忍び道具（町や城で買う。持てる数に限りがある。鉤縄は使ってもなくならない）
    tools: {
      kemuri: { name: '煙玉', price: 300, max: 5, desc: '足もとで煙を上げ、見張りの目をさえぎる' },
      makibishi: { name: '撒菱', price: 200, max: 5, desc: '足もとに撒く。踏んだ見張りはしばらく動けず、何も見えない' },
      fukiya: { name: '吹き矢', price: 250, max: 8, desc: '遠くの見張りを眠らせる（殺さない）' },
      kaginawa: { name: '鉤縄', price: 800, max: 1, desc: '建物の軒へ掛けて登る。使ってもなくならない' },
    },
    bonus: { unseen: 0.3, noKill: 0.2 }, // 2.24.0 気づかれずに・誰も殺さずに果たすと報酬が増える
    km: 100,
  };
  const fName = (w, id) => (w.factions[id] || {}).name || '';
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const day = (w) => Math.floor(w.time.min / 1440);
  const nst = (w, p) => { p.status = `${fName(w, p.clan)} ${NR[Math.min(4, p.rank)].name}`; };
  SIM.rankName = (p) => (p.nin && p.clan && NR[p.rank] ? NR[p.rank].name : (SIM.RANKS[p.rank] || {}).name);

  // ---- 状態 ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) { baseEnsure(w); for (const p of Object.values(w.players)) { if (p.nin && !p.clan) p.nin = false; if (p.nin) nst(w, p); } return w; };

  // ---- 忍びとして仕官（兵は解き放ち、馬は荷へ） ----
  const baseServe = C.serve;
  C.serve = (w, p, c) => {
    const was = p.clan; baseServe(w, p, c);
    if (was || !p.clan || !(c && c.nin)) return;
    p.nin = true; nst(w, p);
    const n = SIM.troopCount ? SIM.troopCount(p.troops || {}) : 0; p.troops = {};
    SIM.say(p.id, `${fName(w, p.clan)}の下忍として召し抱えられました！${n ? `連れていた兵${n}人は解き放ちました。` : ''}忍びの間は兵を雇えません`);
  };
  // 2.33.0 武士⇄忍びの切り替え（主家の城で願い出る。身分は同じ格のまま：足軽⇄下忍、足軽組頭⇄中忍、侍大将⇄上忍、部将⇄忍頭）
  C.switchRole = (w, p) => {
    if (!p.clan || p.battle || p.busy) return;
    const s = here(w, p); if (!s || s.type !== 'castle' || s.owner !== p.clan) return SIM.say(p.id, '主家の城で願い出てください');
    if (p.camp) return SIM.say(p.id, '陣を敷いている間は替われません');
    if (p.nin) {
      if (p.ninQ) SIM.say(p.id, `請け負っていた${NIN.jobs[p.ninQ.k].name}を取りやめました`);
      p.nin = false; p.ninQ = null; p.status = `${fName(w, p.clan)} ${SIM.RANKS[p.rank].name}`;
      SIM.say(p.id, `忍びをやめ、${fName(w, p.clan)}の${SIM.RANKS[p.rank].name}として仕えることになりました。兵を雇えます`);
    } else {
      if (p.rank >= 5 || (SIM.RANKS[p.rank] || {}).indep) return SIM.say(p.id, '城を任されている身分（城主より上）は忍びになれません');
      if (p.allies) return SIM.say(p.id, '陣触れで集めた軍勢を率いている間は替われません');
      const n = SIM.troopCount ? SIM.troopCount(p.troops || {}) : 0; p.troops = {};
      p.nin = true; nst(w, p);
      SIM.say(p.id, `${fName(w, p.clan)}の${NR[Math.min(4, p.rank)].name}になりました！${n ? `連れていた兵${n}人は解き放ちました。` : ''}主家の城で敵の城への工作を請け負えます`);
    }
  };
  const baseLeave = C.leaveClan;
  C.leaveClan = (w, p, c) => { const was = p.nin; baseLeave(w, p, c); if (was && !p.clan) { p.nin = false; p.ninQ = null; } };
  const basePromote = C.promote;
  C.promote = (w, p, c) => {
    if (!p.nin) return basePromote(w, p, c);
    if (p.rank >= 4) return SIM.say(p.id, '忍頭は忍びの最高位です');
    const nx = SIM.RANKS[p.rank + 1];
    if (p.merit < nx.merit) return SIM.say(p.id, `功績が足りません（${p.merit}/${nx.merit}）`);
    if (p.fame < nx.fame) return SIM.say(p.id, `名声が足りません（${p.fame}/${nx.fame}）`);
    p.rank++; p.promoteHint = 0; nst(w, p);
    SIM.say(p.id, `${NR[p.rank].name}に取り立てられました！ 俸禄は月${SIM.money(SIM.RANKS[p.rank].stipend)}になります`);
  };
  // 兵を雇えない（1.6.56 馬には乗れるようにした）
  for (const k of ['recruit']) { const b = C[k]; if (b) C[k] = (w, p, c) => (p.nin ? SIM.say(p.id, '忍びの間は兵を雇えません') : b(w, p, c)); }
  // 身軽さ
  // 2.61.1 忍びは地図で敵の部隊（野盗・大名の軍勢・武将の隊）に見つからない（自分から追いかけて攻めかかるのはできる）
  { const baseHid = SIM.hidden; SIM.hidden = (w, p) => !!(p && p.nin) || baseHid(w, p); }
  const baseSpd = SIM.speedBonus; SIM.speedBonus = (p) => baseSpd(p) + (p.nin ? NIN.mapSpd : 0);
  /* 1.6.57 忍びが敵の部隊（野盗以外）との戦から退くと、ときどき逃げそこねて所持金の何割かを落とす */
  NIN.fleeFail = 0.4; NIN.fleeLoss = [0.2, 0.4];
  const baseFleeN = C.battleFlee;
  C.battleFlee = (w, p, c) => {
    const b = p.nin && p.battle && w.battles[p.battle], n = b && w.npcs[b.npc];
    const risky = b && !(n && n.kind === 'bandit') && SIM.rand(w) < NIN.fleeFail;
    baseFleeN(w, p, c);
    if (!risky || p.battle) return;
    const r = NIN.fleeLoss[0] + SIM.rand(w) * (NIN.fleeLoss[1] - NIN.fleeLoss[0]), lost = Math.floor((p.money || 0) * r);
    if (lost <= 0) return;
    p.money -= lost; if (n && w.npcs[n.id]) n.loot = (n.loot || 0) + lost;
    SIM.say(p.id, `逃げそこねて追いすがられ、${SIM.money(lost)}（所持金の${Math.round(r * 100)}%）を落としました`);
  };
  const baseMM = SIM.moveMul; SIM.moveMul = (e, x, y) => (e.nin && SIM.forestAt(x, y) ? 1 : baseMM(e, x, y)); /* 1.6.56 忍びは森でも遅くならない（平地と同じ） */
  // 戦の城に入れる：請け負った工作の城だけ
  const baseCan = SIM.canEnter; SIM.canEnter = (w, p, s) => baseCan(w, p, s) || !!(p.nin && p.ninQ && p.ninQ.to === s.id);

  // ---- 工作の依頼（主家の城で、戦をしている家の100km以内の城へ） ----
  function offers(w, p, s) {
    if (!p.nin || !p.clan || !s || s.type !== 'castle' || s.owner !== p.clan) return [];
    const tg = w.settlements.filter((t) => t.type === 'castle' && t.owner && SIM.atWar && SIM.atWar(w, p.clan, t.owner) && dist(s, t) <= NIN.km);
    if (!tg.length) return [];
    let h = day(w) * 7 + String(s.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const mul = 1 + (p.rank - 1) * 0.2;
    return Object.keys(NIN.jobs).map((k, i) => { h = (h * 9301 + 49297) % 233280; const t = tg[h % tg.length], J = NIN.jobs[k], km = dist(s, t);
      const o = { id: `${k}-${t.id}-${day(w)}`, k, to: t.id, toName: t.name, foe: fName(w, t.owner), km: Math.round(km), days: Math.ceil(km / 25) + 4, reward: Math.round(J.reward * mul * (1 + km / 150) / 10) * 10, merit: J.merit };
      if (k === 'steal') o.sk = Object.keys(NIN.steal)[h % 3];
      if (k === 'hurt') { const who = hurtTarget(w, t); if (!who) return null; o.who = who; o.whoName = w.people[who].name; }
      return o; }).filter(Boolean);
  }
  // 2.24.0 武将の手傷：hurt＝治るまでの時（分）。手傷の武将は出陣しない
  const isHurt = SIM.isHurt = (w, id) => !!(id && w.people[id] && w.people[id].hurt > w.time.min);
  function hurtTarget(w, t) { // その城にいる武将（城主か家臣）で、いま手傷のない人
    const ok = (id) => id && w.people[id] && !w.people[id].dead && !w.people[id].captive && !isHurt(w, id);
    if (ok(t.lord)) return t.lord;
    return (t.vass || []).find(ok) || null;
  }
  const baseLaunchN = SIM.launchArmy;
  SIM.launchArmy = (w, o) => { // 手傷の武将は出陣の前に外す（城の家臣から加わる人も）
    const src = o && o.from, v = src && src.vass;
    if (o && o.gens) o = Object.assign({}, o, { gens: o.gens.filter((id) => !isHurt(w, id)) });
    if (v) src.vass = v.filter((id) => !isHurt(w, id));
    try { const n = baseLaunchN(w, o); if (n && n.gens) n.gens = n.gens.filter((id) => !isHurt(w, id)); return n; }
    finally { if (v) src.vass = v; }
  };
  // 2.24.0 忍び道具を買う
  C.ninBuy = (w, p, c) => {
    const t = NIN.tools[c.kind]; if (!p.nin || !t || !here(w, p)) return;
    p.ninTools = p.ninTools || {}; const have = p.ninTools[c.kind] || 0;
    if (have >= t.max) return SIM.say(p.id, `${t.name}はこれ以上持てません（${t.max}まで）`);
    if (p.money < t.price) return SIM.say(p.id, 'お金が足りません');
    p.money -= t.price; p.ninTools[c.kind] = have + 1;
  };
  const useTools = (p, used) => { if (!used || !p.ninTools) return; for (const k in used) if (NIN.tools[k] && k !== 'kaginawa') p.ninTools[k] = Math.max(0, (p.ninTools[k] || 0) - Math.max(0, +used[k] || 0)); };
  SIM.ninUseTools = useTools; // 2.107.0 豪商の蔵への盗み（gosho.js）でも忍び道具を減らす
  C.ninUse = (w, p, c) => { useTools(p, c.used); leaveRoom(w, p); if (p.ninDef) { p.ninDef.go = false; p.ninDef.fight = false; } const s = here(w, p); if (s) pvpEnd(w, s.id, p.id); }; // 退いたときも使った道具は減る
  C.ninTake = (w, p, c) => {
    const s = here(w, p), o = offers(w, p, s).find((x) => x.id === c.id); if (!o) return;
    if (p.ninQ) return SIM.say(p.id, '工作は一度に一つまでです');
    p.ninQ = Object.assign({}, o, { from: s.id, deadline: w.time.min + o.days * 1440 });
    SIM.say(p.id, `${o.toName}への${NIN.jobs[o.k].name}を請け負いました（期限${o.days}日）。その城に入り「忍び込む」で工作します`);
    pvpAlert(w, p);
  };
  C.ninDrop = (w, p) => { if (!p.ninQ) return; SIM.say(p.id, `${NIN.jobs[p.ninQ.k].name}の工作を取りやめました`); pvpClear(w, p, 'drop'); p.ninQ = null; };
  // 期限切れ
  SIM.systems.push(function ninTick(w) { for (const p of Object.values(w.players)) if (p.ninQ && w.time.min > p.ninQ.deadline) { SIM.say(p.id, `${p.ninQ.toName}への工作の期限が過ぎました`); pvpClear(w, p, 'drop'); p.ninQ = null; } });

  // ---- 2.57.1 人と人の対戦：プレイヤーの忍びが敵の城への工作を請け負うと、その城の家に仕えるプレイヤーの忍び（いま入っている人）に急報が届く。
  // 守る人がその城で待ち構えているときに攻める人が忍び込むと、二人一緒の3Dになる（見張りは攻める人の端末が動かす）。
  // 守る人は攻める人を当て身で捕らえれば勝ち。攻める人は工作を果たして城下へ抜ければ勝ち（守る人を後ろから当て身で倒すこともできる）
  const PVP = {}, PVP_RUN = 40 * 60 * 1000;
  const onlineIds = (w) => (SIM.online ? SIM.online() : Object.keys(w.players));
  function pvpAlert(w, a) {
    const q = a.ninQ, t = q && SIM.settlement(w, q.to); if (!t || !t.owner) return;
    const on = new Set(onlineIds(w));
    const b = Object.values(w.players).filter((x) => x !== a && on.has(x.id) && x.nin && x.clan === t.owner && !(x.ninDef && x.ninDef.pvp)).sort((x, y) => Math.hypot(x.x - t.x, x.y - t.y) - Math.hypot(y.x - t.x, y.y - t.y))[0];
    if (!b) return;
    const J = NIN.jobs[q.k], days = Math.max(1, Math.round((q.deadline - w.time.min) / 1440));
    if (b.ninDef && !b.ninDef.go) b.ninDef = null; // 人の曲者を先に（ふつうの急報は取り消す）
    if (b.ninDef) return;
    b.ninDef = { id: `pvp-${q.id}`, pvp: a.id, pvpName: a.name, k: q.k, sk: q.sk || null, who: q.who || null, whoName: q.whoName || null, to: t.id, toName: t.name, foe: a.clan, foeName: fName(w, a.clan), n: 1,
      deadline: q.deadline, reward: Math.round(J.reward * 1.3 / 10) * 10, merit: J.merit + 10, go: false };
    q.pvpDef = b.id;
    SIM.say(b.id, `急報！ ${fName(w, a.clan)}の忍び「${a.name}」が${t.name}を狙っています（期限${days}日）。${t.name}で待ち構え、忍び込んできたら捕らえてください`);
    SIM.say(a.id, `${t.name}には${fName(w, t.owner)}の忍び「${b.name}」がいます。守りに来るかもしれません`);
  }
  function pvpClear(w, a, why, ok) { // 攻める人の工作が終わったとき、守る人の急報を片づける（対戦の最中なら守る人の結果を待つ）
    const q = a.ninQ, b = q && q.pvpDef && w.players[q.pvpDef], d = b && b.ninDef;
    if (!d || d.pvp !== a.id || d.fight) return;
    b.ninDef = null;
    SIM.say(b.id, why === 'drop' ? `${a.name}は${d.toName}への工作をあきらめたようです` : ok ? `${d.toName}で${a.name}に${NIN.jobs[d.k].name}を果たされてしまいました（守りに間に合わなかった）` : `${a.name}は${d.toName}の見張りに見つかり、逃げ去りました`);
  }
  const pvpOf = (w, sid) => { const r = PVP[sid]; if (!r) return null; if (Date.now() - r.at > PVP_RUN || !w.players[r.att] || !w.players[r.def]) { delete PVP[sid]; return null; } return r; };
  C.ninPvpGo = (w, a) => { // 攻める人が「忍び込む」を押したとき、守る人がその城にいれば対戦を始める
    const q = a.ninQ, s = here(w, a); if (!q || !s || s.id !== q.to || a.battle || !q.pvpDef) return;
    const b = w.players[q.pvpDef], d = b && b.ninDef, bs = b && here(w, b);
    if (!d || d.pvp !== a.id || !bs || bs.id !== s.id || b.battle || !new Set(onlineIds(w)).has(b.id)) return SIM.say(a.id, '守りの忍びは城にいないようです');
    if (pvpOf(w, s.id)) return;
    d.fight = true; d.go = true;
    PVP[s.id] = { att: a.id, def: b.id, at: Date.now(), go: { at: Date.now(), att: a.id, def: b.id, q: { id: q.id, k: q.k, sk: q.sk || null, whoName: q.whoName || null }, d: diff(w, s), names: { [a.id]: nm(w, a.id), [b.id]: nm(w, b.id) } } };
    SIM.say(a.id, `${s.name}には守りの忍び「${b.name}」が待ち構えています！`); SIM.say(b.id, `${a.name}が${s.name}に忍び込んできた！`);
  };
  const pvpEnd = (w, sid, pid) => { const r = PVP[sid]; if (r && (r.att === pid || r.def === pid)) { r[pid === r.att ? 'attDone' : 'defDone'] = 1; if (r.attDone && r.defDone) delete PVP[sid]; } };

  // ---- 潜入の難しさ（城の規模・改修・山城か平城か・昼夜） ----
  function diff(w, s) {
    const gar = SIM.garrison ? SIM.garrison(s) : 300, kai = s.kai || 0, ck = SIM.castleKind ? SIM.castleKind(s) : 'hira';
    const night = SIM.daylight ? SIM.daylight(w.time.min) < 0.5 : false;
    return { guards: Math.min(14, 3 + Math.floor(gar / 150) + kai), kai, ck, night, lv: Math.min(5, 1 + Math.floor(gar / 400) + Math.floor(kai / 2)) };
  }
  // ---- 2.41.0 協力任務：同じ工作を請け負った忍びが、その城で部屋を作って一緒に潜入する（最大3人）。部屋は端末の中だけ（保存しない）
  const CO_MAX = 3, ROOM_WAIT = 15 * 60 * 1000, ROOM_RUN = 40 * 60 * 1000, ROOMS = {};
  const roomOf = (w, sid) => { const r = ROOMS[sid]; if (!r) return null; r.mem = r.mem.filter((id) => w.players[id]); if (!r.mem.length || !w.players[r.leader] || Date.now() - r.t > (r.go ? ROOM_RUN : ROOM_WAIT)) { delete ROOMS[sid]; return null; } return r; };
  const leaveRoom = (w, p) => { for (const sid of Object.keys(ROOMS)) { const r = roomOf(w, sid); if (!r || !r.mem.includes(p.id)) continue; r.mem = r.mem.filter((id) => id !== p.id); if (!r.mem.length || (r.leader === p.id && !r.go)) delete ROOMS[sid]; } };
  const nm = (w, id) => (w.players[id] || {}).name || '？';
  C.ninRecruit = (w, p) => {
    const q = p.ninQ, s = here(w, p); if (!p.nin || !q || !s || s.id !== q.to || p.battle) return;
    const r = roomOf(w, s.id); if (r) return SIM.say(p.id, r.mem.includes(p.id) ? 'すでに募集しています' : r.go ? '別の仲間がもう潜入しています' : r.id === q.id ? `${nm(w, r.leader)}が募集しています。加わってください` : '別の工作の募集中です');
    ROOMS[s.id] = { id: q.id, leader: p.id, mem: [p.id], t: Date.now(), go: null };
    SIM.say(p.id, '仲間を募りました。同じ工作を請け負った忍びが、この城で「加わる」を押すと一緒に潜入できます（最大3人）');
  };
  C.ninJoin = (w, p) => {
    const s = here(w, p), r = s && roomOf(w, s.id), q = p.ninQ; if (!p.nin || !q || !r || r.go || r.id !== q.id || r.mem.includes(p.id)) return;
    if (r.mem.length >= CO_MAX) return SIM.say(p.id, `満員です（${CO_MAX}人まで）`);
    r.mem.push(p.id); for (const id of r.mem) SIM.say(id, `${nm(w, p.id)}が潜入に加わりました（${r.mem.length}/${CO_MAX}人）`);
  };
  C.ninRoomLeave = (w, p) => leaveRoom(w, p);
  C.ninGo = (w, p) => {
    const s = here(w, p), r = s && roomOf(w, s.id), q = p.ninQ; if (!r || r.go || r.leader !== p.id || !q || r.id !== q.id) return;
    const d = diff(w, s); d.guards = Math.min(16, d.guards + (r.mem.length - 1)); // 仲間が増えたぶん、見張りも少し増える
    r.go = { at: Date.now(), q: { id: q.id, k: q.k, sk: q.sk || null, whoName: q.whoName || null }, d, mem: r.mem.slice(), lead: p.id, names: Object.fromEntries(r.mem.map((id) => [id, nm(w, id)])) };
  };

  // 工作の効き目を城にかける。def＝2.57.0 守りに失敗して、自分の側の城が受けるとき。note＝知らせ、extra＝盗んだ金の分け前
  function applyJob(w, s, q, def) {
    const now = w.time.min, deb = (v) => { if (!(s.ninT > now) || (s.ninDeb || 0) < v) s.ninDeb = v; s.ninT = Math.max(s.ninT || 0, now + 30 * 1440); };
    if (q.k === 'sabo' || q.k === 'rumor') for (const k in s.gar || {}) s.gar[k] = Math.floor(s.gar[k] * (q.k === 'sabo' ? 0.8 : 0.9));
    if (q.k === 'gate') { s.gate = Math.max(0, SIM.gateF(s) - 0.4); if (s.holder && w.players[s.holder]) SIM.say(s.holder, `${s.name}の門が何者かに壊されました（門の強さ${Math.round(s.gate * 100)}%）。普請で修理できます`); }
    if (q.k === 'raid' || q.k === 'rumor') deb(q.k === 'raid' ? 0.15 : 0.08);
    let extra = 0, note = '';
    if (def) note = { sabo: '兵糧蔵が焼け、守備兵が2割減りました。', raid: '武器蔵が壊され、30日のあいだ城の守りが15%下がります。', gate: '城門に細工をされ、門の強さが4割減りました（普請で直せます）。', rumor: '城下に噂が流れ、守備兵が1割減りました。' }[q.k] || '';
    if (q.k === 'hurt' && q.who && w.people[q.who]) { // 2.24.0 武将に手傷
      const g = w.people[q.who]; g.hurt = now + NIN.hurtDays * 1440; note = `${g.name}は手傷を負い、${NIN.hurtDays}日のあいだ出陣できません。`;
      if (s.holder && w.players[s.holder]) SIM.say(s.holder, `${s.name}で${g.name}が何者かに襲われ、手傷を負いました`);
    }
    if (q.k === 'steal') { // 2.24.0 盗み
      if (q.sk === 'ezu') { deb(0.12); note = def ? `${s.name}の絵図を盗まれました。30日のあいだ、この城を守る戦で不利になります。` : `${s.name}の絵図を手に入れました。30日のあいだ、この城を攻める時の守りが下がります。`; }
      if (q.sk === 'kin') { for (const k in s.gar || {}) s.gar[k] = Math.floor(s.gar[k] * 0.9); extra = Math.round((q.reward || 0) * 0.5 / 10) * 10; note = def ? '軍資金を盗まれ、守備兵が1割減りました。' : `給金が消えて守備兵が1割減りました。分け前${SIM.money(extra)}。`; }
      if (q.sk === 'mitsu') note = def ? '密書を盗まれました。' : `密書によると、${intelOf(w, s.owner, s)}`;
    }
    return { note, extra };
  }
  // 密書・捕らえた曲者から分かること：その家が次に攻めようとしている城と、近くの城の守備兵
  function intelOf(w, fac, s) {
    const m = (w.musters || []).find((x) => x.att === fac), a = !m && Object.values(w.npcs).find((n) => n.kind === 'army' && n.faction === fac && n.mode === 'siege' && n.to);
    const tg = m ? SIM.settlement(w, m.tgt) : a ? SIM.settlement(w, a.to) : null;
    const near = w.settlements.filter((t) => t.type === 'castle' && t.owner === fac && dist(t, s) <= 120).slice(0, 6).map((t) => `${t.name}${SIM.garrison ? SIM.garrison(t) : '?'}人`);
    return `${fName(w, fac)}は${tg ? `${tg.name}を攻めようとしています` : 'いまはどこも攻める支度をしていません'}。近くの城の守備兵：${near.join('・') || 'なし'}。`;
  }

  // ---- 2.57.0 城の守り：主家と戦をしている家が、月に1回くらい主家の城（敵の城から100km以内）へ忍びを送ってくる。
  // 急報が届いたら期限までにその城へ駆けつけ、「曲者を探す」で3Dの守りの任務（味方の城の中で曲者を見つけ、追って当て身で捕らえる）。
  // 間に合わない・曲者に工作を果たされると、攻めの工作と同じ効き目を自分の側の城が受ける
  NIN.def = { every: [24, 36], retry: 4, first: 8, km: 100, kinds: ['sabo', 'raid', 'gate', 'hurt', 'steal'], perCatch: 0.25, pvpWait: 2 };
  const nextDef = (w, p) => { const [a, b] = NIN.def.every; p.ninDefNext = day(w) + a + Math.floor(SIM.rand(w) * (b - a + 1)); };
  function rollDef(w, p, force) {
    const now = day(w);
    if (!force) { if (p.ninDefNext == null) { p.ninDefNext = now + NIN.def.first; return; } if (now < p.ninDefNext) return; }
    const cands = [];
    for (const s of w.settlements) {
      if (s.type !== 'castle' || s.owner !== p.clan) continue;
      const foes = w.settlements.filter((t) => t.type === 'castle' && t.owner && SIM.atWar && SIM.atWar(w, p.clan, t.owner) && dist(s, t) <= NIN.def.km);
      if (foes.length) cands.push([s, foes, Math.hypot(s.x - p.x, s.y - p.y)]);
    }
    if (!cands.length) { p.ninDefNext = now + NIN.def.retry; return; }
    cands.sort((a, b) => a[2] - b[2]); // 本人に近い城ほど選ばれやすい（近い3つから）
    const [s, foes, km0] = cands[Math.floor(SIM.rand(w) * Math.min(3, cands.length))], t = foes[Math.floor(SIM.rand(w) * foes.length)];
    let k = NIN.def.kinds[Math.floor(SIM.rand(w) * NIN.def.kinds.length)], who = null;
    if (k === 'hurt') { who = hurtTarget(w, s); if (!who) k = 'sabo'; }
    const J = NIN.jobs[k], days = clampI(Math.ceil(km0 / 25) + 3, 3, 12);
    const n = 1 + (p.rank >= 2 && SIM.rand(w) < 0.5 ? 1 : 0) + (p.rank >= 3 && SIM.rand(w) < 0.35 ? 1 : 0);
    p.ninDef = { id: `def-${s.id}-${now}`, k, sk: k === 'steal' ? Object.keys(NIN.steal)[Math.floor(SIM.rand(w) * 3)] : null, who, whoName: who ? w.people[who].name : null, to: s.id, toName: s.name, foe: t.owner, foeName: fName(w, t.owner), n,
      deadline: w.time.min + days * 1440, reward: Math.round(J.reward * (1 + (p.rank - 1) * 0.2) * 0.9 / 10) * 10, merit: J.merit, go: false };
    nextDef(w, p);
    SIM.say(p.id, `急報！ ${p.ninDef.foeName}の忍びが${s.name}に入り込んだ気配があります（期限${days}日）。${s.name}へ駆けつけ、「曲者を探す」で捕らえてください`);
  }
  const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
  function defFail(w, p, s, why, caught, killed) {
    const q = p.ninDef; p.ninDef = null;
    const { note } = applyJob(w, s, q, true);
    const got = (caught || 0) + (killed || 0);
    if (got && SIM.addMerit) SIM.addMerit(w, p, 6 * got, `${s.name}で曲者を捕らえた`);
    SIM.say(p.id, `${why === 'late' ? `${s.name}へ駆けつけるのが間に合いませんでした。` : `${s.name}を守りきれませんでした。`}${q.foeName}の忍びに${NIN.jobs[q.k].name}${q.k === 'steal' && NIN.steal[q.sk] ? `（${NIN.steal[q.sk].name}）` : ''}を果たされ、${note}`);
  }
  SIM.systems.push(function ninDefTick(w) {
    for (const p of Object.values(w.players)) {
      if (!p.nin || !p.clan) { if (p.ninDef) p.ninDef = null; continue; }
      const q = p.ninDef;
      if (!q) { rollDef(w, p, false); continue; }
      const s = SIM.settlement(w, q.to);
      if (!s || s.owner !== p.clan) { SIM.say(p.id, `${q.toName}はもう主家の城ではないので、守りの任務はなくなりました`); p.ninDef = null; continue; }
      if (q.pvp) { // 2.57.1 人の曲者：攻める人の工作がなくなったら片づける（対戦の最中は待つ）
        const a = w.players[q.pvp];
        if ((!q.fight && (!a || !a.ninQ || a.ninQ.pvpDef !== p.id)) || w.time.min > q.deadline + 1440) p.ninDef = null;
        continue;
      }
      if (!q.go && w.time.min > q.deadline) defFail(w, p, s, 'late');
    }
  });
  C.ninDefGo = (w, p) => { const q = p.ninDef, s = here(w, p); if (q && s && s.id === q.to && !p.battle) q.go = true; }; // 守りの最中は期限で失敗にしない
  C.ninDefTest = (w, p) => { if (w.test && p.nin && p.clan) { p.ninDef = null; rollDef(w, p, true); if (!p.ninDef) SIM.say(p.id, '主家と戦をしている家の城が近くにないので、曲者は来ません'); } };
  C.ninDefResult = (w, p, c) => {
    const q = p.ninDef, s = here(w, p); if (!q || !s || s.id !== q.to) return;
    useTools(p, c.used);
    const caught = clampI(Math.floor(+c.caught || 0), 0, q.n), killed = clampI(Math.floor(+c.killed || 0), 0, q.n - caught);
    if (q.pvp) { // 2.57.1 人と人の対戦の結果（城への効き目は攻める人の結果でかかる）
      pvpEnd(w, s.id, p.id); p.ninDef = null;
      const an = `「${q.pvpName}」`;
      if (!c.ok) return SIM.say(p.id, c.ko ? `${an}に後ろから当て身を受け、気を失いました……` : `${an}に${NIN.jobs[q.k].name}を果たされ、逃げられました……`);
      const got = caught + killed > 0, rew = Math.round(q.reward * (got ? 1 : 0.4) / 10) * 10, merit = got ? q.merit : Math.round(q.merit * 0.4), fame = got ? 4 : 1;
      p.money += rew; p.fame += fame; if (SIM.addMerit) SIM.addMerit(w, p, merit, `${s.name}の守り`);
      return SIM.say(p.id, `${s.name}を守りました！ ${got ? `${q.foeName}の忍び${an}を${killed ? '討ち取りました' : '捕らえました'}。` : `${an}は見張りに見つかって逃げ去りました。`}報酬${SIM.money(rew)}・名声+${fame}。${caught ? `問いただすと：${intelOf(w, q.foe, s)}` : ''}`);
    }
    if (!c.ok) return defFail(w, p, s, 'lost', caught, killed);
    p.ninDef = null;
    const all = caught + killed >= q.n, rew = Math.round(q.reward * (all ? 1 : 0.5) * (1 + NIN.def.perCatch * caught) / 10) * 10;
    const merit = Math.round(q.merit * (all ? 1 : 0.5)) + 6 * caught, fame = 1 + caught + (all ? 1 : 0);
    p.money += rew; p.fame += fame; if (SIM.addMerit) SIM.addMerit(w, p, merit, `${s.name}の守り`);
    SIM.say(p.id, `${s.name}を守りました！ ${all ? (caught ? `曲者${q.n}人のうち${caught}人を生け捕り${killed ? `、${killed}人を討ち取り` : ''}ました。` : `曲者${q.n}人を討ち取りました。`) : `曲者を追い払いました${caught + killed ? `（${caught + killed}人を捕らえた）` : ''}。`}報酬${SIM.money(rew)}・名声+${fame}。${caught ? `捕らえた曲者を問いただすと：${intelOf(w, q.foe, s)}` : ''}`);
  };

  // 成否はミニゲームから届く
  C.ninResult = (w, p, c) => {
    const q = p.ninQ, s = here(w, p); if (!q || !s || s.id !== q.to || p.battle) return;
    pvpClear(w, p, 'res', !!c.ok); pvpEnd(w, s.id, p.id); // 2.57.1
    p.ninQ = null; const J = NIN.jobs[q.k];
    useTools(p, c.used); leaveRoom(w, p);
    if (c.ok) {
      const dup = s.ninDone === q.id; s.ninDone = q.id; // 2.41.0 仲間が先に果たした工作の効果は、重ねてかけない（報酬は全員に出る）
      const keep = dup ? { gar: s.gar && Object.assign({}, s.gar), gate: s.gate } : null;
      const { note, extra } = applyJob(w, s, q, false);
      if (keep) { s.gar = keep.gar; s.gate = keep.gate; }
      const b = NIN.bonus, mulB = 1 + (c.unseen ? b.unseen : 0) + (c.kills ? 0 : b.noKill), rew = Math.round(q.reward * mulB / 10) * 10 + extra;
      const fame = 2 + (c.unseen ? 1 : 0) + (c.kills ? 0 : 1);
      p.money += rew; p.fame += fame; if (SIM.addMerit) SIM.addMerit(w, p, q.merit, `${q.toName}での${J.name}`);
      const tags = [c.unseen ? '気づかれずに' : '', c.kills ? '' : '誰も殺さずに'].filter(Boolean).join('・');
      SIM.say(p.id, `${J.name}${q.k === 'steal' && NIN.steal[q.sk] ? `（${NIN.steal[q.sk].name}）` : ''}に成功しました！ ${tags ? tags + '果たした。' : ''}報酬${SIM.money(rew)}・名声+${fame}。${note}`);
    } else {
      const lost = Math.floor(p.money * 0.3); p.money -= lost; p.hpFrac = 0.15; // 合戦で負けたときと同じ
      p.at = null; // 城から追い出される
      SIM.say(p.id, `見つかってしまいました…… 手傷を負って逃げ延び、${SIM.money(lost)}を失いました`);
    }
  };
  SIM.ninDeb = (s, now) => (s && s.ninT > now ? s.ninDeb || 0 : 0);
  SIM.systems.push(function ninNow(w) { SIM._now = w.time.min; });

  function roomInfo(w, p, s) { // 2.41.0 いまいる城の協力部屋（入っている人か、加われる人にだけ見せる）
    const r = s && p.ninQ && s.id === p.ninQ.to ? roomOf(w, s.id) : null; if (!r) return null;
    const joined = r.mem.includes(p.id), canJoin = !joined && !r.go && r.id === p.ninQ.id && r.mem.length < CO_MAX;
    if (!joined && !canJoin) return null;
    return { joined, canJoin, leader: r.leader === p.id, lname: nm(w, r.leader), names: r.mem.map((id) => nm(w, id)), n: r.mem.length, max: CO_MAX, go: joined ? r.go : null };
  }
  // ---- 本人だけに送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const s = here(w, p);
    r.me.nin = p.nin ? { rank: NR[p.rank] ? NR[p.rank].name : '', q: p.ninQ || null, tools: Object.assign({}, p.ninTools || {}), offers: offers(w, p, s), atTgt: !!(p.ninQ && s && s.id === p.ninQ.to), d: p.ninQ && s && s.id === p.ninQ.to ? diff(w, s) : null, room: roomInfo(w, p, s),
      def: p.ninDef ? Object.assign({}, p.ninDef, { at: !!(s && s.id === p.ninDef.to), d: s && s.id === p.ninDef.to ? diff(w, s) : null }) : null } : null; // 2.57.0 城の守り
    if (r.me.nin && s) { // 2.57.1 人と人の対戦：守る人がこの城にいるか・始まりの合図
      const q = p.ninQ, b = q && q.pvpDef && s.id === q.to ? w.players[q.pvpDef] : null, bs = b && here(w, b);
      if (b && b.ninDef && b.ninDef.pvp === p.id) r.me.nin.pvp = { name: b.name, here: !!(bs && bs.id === s.id) };
      const R = pvpOf(w, s.id); if (R && (R.att === p.id || R.def === p.id) && !R[R.att === p.id ? 'attDone' : 'defDone']) r.me.nin.pvpGo = R.go;
    }
    return r;
  };
})();
