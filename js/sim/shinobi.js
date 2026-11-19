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
  C.ninUse = (w, p, c) => useTools(p, c.used); // 退いたときも使った道具は減る
  C.ninTake = (w, p, c) => {
    const s = here(w, p), o = offers(w, p, s).find((x) => x.id === c.id); if (!o) return;
    if (p.ninQ) return SIM.say(p.id, '工作は一度に一つまでです');
    p.ninQ = Object.assign({}, o, { from: s.id, deadline: w.time.min + o.days * 1440 });
    SIM.say(p.id, `${o.toName}への${NIN.jobs[o.k].name}を請け負いました（期限${o.days}日）。その城に入り「忍び込む」で工作します`);
  };
  C.ninDrop = (w, p) => { if (!p.ninQ) return; SIM.say(p.id, `${NIN.jobs[p.ninQ.k].name}の工作を取りやめました`); p.ninQ = null; };
  // 期限切れ
  SIM.systems.push(function ninTick(w) { for (const p of Object.values(w.players)) if (p.ninQ && w.time.min > p.ninQ.deadline) { SIM.say(p.id, `${p.ninQ.toName}への工作の期限が過ぎました`); p.ninQ = null; } });

  // ---- 潜入の難しさ（城の規模・改修・山城か平城か・昼夜） ----
  function diff(w, s) {
    const gar = SIM.garrison ? SIM.garrison(s) : 300, kai = s.kai || 0, ck = SIM.castleKind ? SIM.castleKind(s) : 'hira';
    const night = SIM.daylight ? SIM.daylight(w.time.min) < 0.5 : false;
    return { guards: Math.min(14, 3 + Math.floor(gar / 150) + kai), kai, ck, night, lv: Math.min(5, 1 + Math.floor(gar / 400) + Math.floor(kai / 2)) };
  }
  // 成否はミニゲームから届く
  C.ninResult = (w, p, c) => {
    const q = p.ninQ, s = here(w, p); if (!q || !s || s.id !== q.to || p.battle) return;
    p.ninQ = null; const J = NIN.jobs[q.k];
    useTools(p, c.used);
    if (c.ok) {
      const now = w.time.min, deb = (v) => { if (!(s.ninT > now) || (s.ninDeb || 0) < v) s.ninDeb = v; s.ninT = Math.max(s.ninT || 0, now + 30 * 1440); };
      if (q.k === 'sabo' || q.k === 'rumor') for (const k in s.gar || {}) s.gar[k] = Math.floor(s.gar[k] * (q.k === 'sabo' ? 0.8 : 0.9));
      if (q.k === 'gate') { s.gate = Math.max(0, SIM.gateF(s) - 0.4); if (s.holder && w.players[s.holder]) SIM.say(s.holder, `${s.name}の門が何者かに壊されました（門の強さ${Math.round(s.gate * 100)}%）。普請で修理できます`); }
      if (q.k === 'raid' || q.k === 'rumor') deb(q.k === 'raid' ? 0.15 : 0.08);
      let extra = 0, note = '';
      if (q.k === 'hurt' && q.who && w.people[q.who]) { // 2.24.0 武将に手傷
        const g = w.people[q.who]; g.hurt = now + NIN.hurtDays * 1440; note = `${g.name}は手傷を負い、${NIN.hurtDays}日のあいだ出陣できません。`;
        if (s.holder && w.players[s.holder]) SIM.say(s.holder, `${s.name}で${g.name}が何者かに襲われ、手傷を負いました`);
      }
      if (q.k === 'steal') { // 2.24.0 盗み
        if (q.sk === 'ezu') { deb(0.12); note = `${s.name}の絵図を手に入れました。30日のあいだ、この城を攻める時の守りが下がります。`; }
        if (q.sk === 'kin') { for (const k in s.gar || {}) s.gar[k] = Math.floor(s.gar[k] * 0.9); extra = Math.round(q.reward * 0.5 / 10) * 10; note = `給金が消えて守備兵が1割減りました。分け前${SIM.money(extra)}。`; }
        if (q.sk === 'mitsu') {
          const m = (w.musters || []).find((x) => x.att === s.owner), a = !m && Object.values(w.npcs).find((n) => n.kind === 'army' && n.faction === s.owner && n.mode === 'siege' && n.to);
          const tg = m ? SIM.settlement(w, m.tgt) : a ? SIM.settlement(w, a.to) : null;
          const near = w.settlements.filter((t) => t.type === 'castle' && t.owner === s.owner && dist(t, s) <= 120).slice(0, 6).map((t) => `${t.name}${SIM.garrison ? SIM.garrison(t) : '?'}人`);
          note = `密書によると、${fName(w, s.owner)}は${tg ? `${tg.name}を攻めようとしています` : 'いまはどこも攻める支度をしていません'}。近くの城の守備兵：${near.join('・') || 'なし'}。`;
        }
      }
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

  // ---- 本人だけに送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const s = here(w, p);
    r.me.nin = p.nin ? { rank: NR[p.rank] ? NR[p.rank].name : '', q: p.ninQ || null, tools: Object.assign({}, p.ninTools || {}), offers: offers(w, p, s), atTgt: !!(p.ninQ && s && s.id === p.ninQ.to), d: p.ninQ && s && s.id === p.ninQ.to ? diff(w, s) : null } : null;
    return r;
  };
})();
