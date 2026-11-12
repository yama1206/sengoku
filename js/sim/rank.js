// 第4段階（続き）：身分（仕官・功績・昇進・俸禄）
(function () {
  const SIM = SGK.SIM;

  // 身分の段階（数値はすべて仮）。merit：必要な功績、fame：必要な名声、cap：率いる人数の加算、stipend：毎月の俸禄（文）
  const RANKS = SIM.RANKS = [
    { name: '浪人', merit: 0, fame: 0, cap: 0, stipend: 0, desc: 'どこにも仕えていない' },
    { name: '足軽', merit: 0, fame: 5, cap: 5, stipend: 300, desc: '仕官したばかり。主家の依頼や戦で功績を積む' },
    { name: '足軽組頭', merit: 60, fame: 10, cap: 15, stipend: 800, desc: '主家の城で兵を2割安く雇える' },
    { name: '侍大将', merit: 200, fame: 20, cap: 30, stipend: 1800, desc: '主家の城で騎馬を名声に関係なく雇える' },
    { name: '部将', merit: 500, fame: 35, cap: 50, stipend: 3500, desc: '大軍を率いる重臣' },
    { name: '城主', merit: 900, fame: 50, cap: 70, stipend: 2000, desc: '主家から城を一つ任される。内政・築城で城を育て、毎月の年貢を受け取る' },
    { name: '家老', merit: 1500, fame: 70, cap: 90, stipend: 3000, castles: 2, desc: '城を2つまで任される（加増）。主家の城で兵を3割安く雇える' },
    { name: '国主', merit: 2500, fame: 90, cap: 120, stipend: 4500, castles: 4, desc: '一国を預かる重臣。城を4つまで任され、年貢が1割増える' },
    { name: '大名', merit: 0, fame: 60, cap: 150, stipend: 0, castles: 99, indep: true, desc: '城主以上が独立してなる。自分の家を興し、治める城はすべて自分の領地。ほかのプレイヤーを家臣に迎えられる' },
  ];
  SIM.castleLimit = (p) => (p.rank >= 5 ? RANKS[p.rank].castles || 1 : 0);
  const fName = (w, p) => (w.factions[p.clan] || {}).name || '';
  const setStatus = (w, p) => { p.status = p.clan ? `${fName(w, p)} ${RANKS[p.rank].name}` : '浪人'; };
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const ownCastle = (w, p) => { const s = here(w, p); return s && p.clan && s.owner === p.clan && s.type === 'castle' ? s : null; };

  // 功績を得る
  function addMerit(w, p, n, why) {
    if (!p.clan || !(n > 0)) return;
    n = Math.round(n); p.merit += n;
    SIM.say(p.id, `功績+${n}（${why}）`);
    const nx = RANKS[p.rank + 1];
    if (nx && p.merit >= nx.merit && p.fame >= nx.fame && !p.promoteHint) { p.promoteHint = 1; SIM.say(p.id, `${nx.name}への昇進を願い出られます。主家の城で人物画面の「身分」から`); }
  }
  SIM.addMerit = addMerit;

  // ---- 足りない項目を補う ----
  const baseEnsurePlayer = SIM.ensurePlayer;
  SIM.ensurePlayer = (p) => {
    baseEnsurePlayer(p);
    if (p.clan === undefined) p.clan = null;
    if (p.rank == null) p.rank = 0;
    if (p.merit == null) p.merit = 0;
  };
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    if (w.rday == null) w.rday = Math.floor(w.time.min / 1440);
    for (const p of Object.values(w.players)) { if (p.clan && !w.factions[p.clan]) { p.clan = null; p.rank = 0; } setStatus(w, p); }
    return w;
  };

  // ---- 身分が効くところ ----
  const baseCap = SIM.troopCap;
  SIM.troopCap = (p) => Math.ceil(Math.min(250, baseCap(p) + RANKS[p.rank || 0].cap)); // 小数は切り上げ
  // 募兵：主家の城では組頭以上が2割引、侍大将以上は騎馬の名声条件なし
  const baseRecruit = SIM.commands.recruit;
  if (baseRecruit) SIM.commands.recruit = (w, p, c) => {
    const s = ownCastle(w, p), T = SIM.TROOPS[c.kind];
    const oldCost = SIM.costMod, oldFame = T && T.fame;
    if (s && p.rank >= 2) SIM.costMod = (q) => oldCost(q) * (p.rank >= 6 ? 0.7 : 0.8);
    if (s && p.rank >= 3 && T) T.fame = 0;
    try { baseRecruit(w, p, c); } finally { SIM.costMod = oldCost; if (T) T.fame = oldFame; }
  };

  // 功績：主家の領地の依頼を果たす
  function jobMerit(fn) {
    return (w, p, c) => {
      const before = p.quests.slice(); fn(w, p, c);
      if (!p.clan) return;
      for (const q of before) if (!p.quests.includes(q)) {
        const s = SIM.settlement(w, q.from); if (!s || s.owner !== p.clan || p.quests.length > before.length) continue;
        if (c && c.type === 'abandonJob') continue;
        addMerit(w, p, (s.type === 'castle' ? 12 : 6) + q.reward / 100, `${fName(w, p)}の領地の依頼`);
      }
    };
  }
  SIM.onPlayerArrive = jobMerit(SIM.onPlayerArrive);
  SIM.commands.deliverJob = jobMerit(SIM.commands.deliverJob);
  // 功績：戦に勝つ（主家の領地の近くの野盗退治は多め）
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = (w, b, p, res, after) => {
    baseEnd(w, b, p, res, after);
    if (!p.clan || res !== 'win' || b.siege || b.war) return;
    const near = w.settlements.filter((s) => s.owner === p.clan).some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 12);
    addMerit(w, p, (5 + (b.foeN || 10) * 0.6) * (near ? 1.5 : 1), near ? '領内の野盗を討った' : '野盗を討った');
  };

  // ---- 毎月の俸禄 ----
  SIM.systems.push(function stipend(w) {
    const d = Math.floor(w.time.min / 1440);
    while (w.rday < d) {
      w.rday++;
      if (w.rday % 30) continue;
      for (const p of Object.values(w.players)) {
        const r = RANKS[p.rank]; if (!p.clan || !r.stipend) continue;
        p.money += r.stipend; SIM.say(p.id, `${fName(w, p)}から俸禄${SIM.money(r.stipend)}が届きました`);
      }
    }
  });

  // ---- コマンド ----
  Object.assign(SIM.commands, {
    serve(w, p) { // 仕官
      const s = here(w, p);
      const lordP = s && SIM.lordPlayer && SIM.lordPlayer(w, s);
      if (!s || s.type !== 'castle' || !(s.lord || lordP) || !w.factions[s.owner]) return SIM.say(p.id, '城主のいる城でないと仕官できません');
      if (p.clan) return SIM.say(p.id, `すでに${fName(w, p)}に仕えています`);
      if (p.battle || p.busy) return;
      if (lordP && lordP.id === p.id) return;
      if (p.fame < RANKS[1].fame) return SIM.say(p.id, `仕官するには名声${RANKS[1].fame}が必要です（いま${p.fame}）`);
      if (p.leftClan === s.owner) return SIM.say(p.id, `${w.factions[s.owner].name}は、出奔した者を二度とは迎えてくれないようです`);
      p.clan = s.owner; p.rank = 1; p.merit = 0; p.promoteHint = 0; setStatus(w, p);
      if (lordP) SIM.say(lordP.id, `${p.name}が家臣として仕えました`);
      SIM.say(p.id, `${lordP ? lordP.name : (w.people[s.lord] || {}).name}様に目通りし、${fName(w, p)}の足軽として召し抱えられました！`);
    },
    promote(w, p) { // 昇進を願い出る
      if (!ownCastle(w, p)) return SIM.say(p.id, '主家の城でないと願い出られません');
      const nx = RANKS[p.rank + 1]; if (!nx) return;
      if (nx.indep) return SIM.say(p.id, '国主より上は、主家から独立して大名になるしかありません（人物画面の「身分」）');
      if (p.merit < nx.merit) return SIM.say(p.id, `功績が足りません（${p.merit}/${nx.merit}）`);
      if (p.fame < nx.fame) return SIM.say(p.id, `名声が足りません（${p.fame}/${nx.fame}）`);
      if (p.rank + 1 === 5) { // 城主：主家の城を一つ任される
        const s = SIM.grantCastle(w, p);
        if (!s) return SIM.say(p.id, `いま${fName(w, p)}に任せられる城がありません。野外に新しく城を築くこともできます（人物画面の「身分」）`);
        SIM.say(p.id, `${s.name}を任されました！ 城の「城」の画面で内政・築城ができます`);
      }
      p.rank++; p.promoteHint = 0; setStatus(w, p);
      if (p.rank >= 6) { const s2 = SIM.grantCastle(w, p); if (s2) SIM.say(p.id, `加増として${s2.name}も任されました`); }
      SIM.say(p.id, `${nx.name}に取り立てられました！ 率いる人数が増え、俸禄は月${SIM.money(nx.stipend)}になります`);
    },
    leaveClan(w, p) { // 出奔
      if (!p.clan || p.battle) return;
      if (RANKS[p.rank].indep) return SIM.say(p.id, '大名は出奔できません');
      const f = fName(w, p);
      SIM.releaseCastle(w, p);
      p.leftClan = p.clan; p.clan = null; p.rank = 0; p.merit = 0; p.fame = Math.max(0, p.fame - 3); setStatus(w, p);
      SIM.say(p.id, `${f}を出奔し、浪人に戻りました（名声-3）`);
    },
  });

  // ---- 本人だけに送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], s = here(w, p);
    r.me.rank = { clan: p.clan, clanName: fName(w, p), rank: p.rank, merit: p.merit, left: p.leftClan || null,
      canServe: !!(s && s.type === 'castle' && (s.lord || (SIM.lordPlayer && SIM.lordPlayer(w, s) && SIM.lordPlayer(w, s).id !== p.id)) && !p.clan), atOwn: !!ownCastle(w, p),
      lordHere: s && s.lord ? (w.people[s.lord] || {}).name : s && SIM.lordPlayer && SIM.lordPlayer(w, s) ? SIM.lordPlayer(w, s).name : null, factionHere: s ? (w.factions[s.owner] || {}).name : null };
    r.me.troopCap = SIM.troopCap(p);
    return r;
  };
})();
