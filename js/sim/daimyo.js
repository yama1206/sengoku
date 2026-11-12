// 第6段階：家老・国主・大名（加増・独立・プレイヤーの家・家臣を迎える）
(function () {
  const SIM = SGK.SIM;
  const RANKS = SIM.RANKS;
  const INDEP = { rank: 5, fame: 60 }; // 独立できる条件（数値は仮）
  const COLORS = ['#e07a2f', '#2fa0c8', '#c84f9a', '#7ac83a', '#d0c040', '#9a6ad8', '#40b89a', '#c86a6a'];
  const SEI = SIM.SEI = ['木下', '明智', '前田', '佐々', '滝川', '山内', '蜂須賀', '池田', '森', '堀', '竹中', '黒田', '島', '可児', '真田', '本多', '井伊', '藤堂'];
  const held = (w, pid) => w.settlements.filter((s) => s.holder === pid && !s.site);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);

  // プレイヤーが当主の家なら、その城の主（城を任された家臣がいればその人、いなければ当主）
  SIM.lordPlayer = (w, s) => {
    const f = s && w.factions[s.owner]; if (!f || !f.player) return null;
    return w.players[s.holder] || w.players[f.leader] || null;
  };

  // ---- 城を任される：身分ごとの上限を守る・プレイヤーの家では当主の城を分け与える ----
  const baseGrant = SIM.grantCastle;
  SIM.grantCastle = (w, p) => {
    if (held(w, p.id).length >= Math.max(1, SIM.castleLimit(p))) return null;
    const s = baseGrant(w, p); if (s) return s;
    const f = w.factions[p.clan]; if (!f || !f.player || f.leader === p.id) return null;
    const pool = held(w, f.leader).filter((x) => x.id !== f.home);
    if (!pool.length) return null;
    const c = pool.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    c.holder = p.id;
    SIM.say(f.leader, `${p.name}に${c.name}を任せました`);
    return c;
  };

  // 国主は年貢1割増し
  const baseTax = SIM.tax;
  SIM.tax = (p, s) => Math.round((baseTax(p, s) * (p.rank >= 7 ? 1.1 : 1)) / 10) * 10;

  // ---- 勢力ごとの兵種の得意（控えめな強化。数値は仮） ----
  // am：攻撃×、hm：体力×、da：守り+、ra：射程+（m）
  const G = { teppo: ['teppo', 'teppogashira'], yumi: ['yumi'], yari: ['yari', 'nagayari', 'yarigashira'], naga: ['nagayari', 'yarigashira'], kiba: ['kiba', 'horo'], nohei: ['nohei'] };
  const FB = SIM.FACTION_BUFF = {
    oda: { name: '鉄砲隊', types: G.teppo, am: 1.08, text: '鉄砲の攻撃+8%' },
    takeda: { name: '武田の騎馬', types: G.kiba, am: 1.08, text: '騎馬の攻撃+8%' },
    saito: { name: '美濃の槍', types: G.yari, da: 0.3, text: '槍の守り+0.3' },
    imagawa: { name: '海道一の弓取り', types: G.yumi, am: 1.08, text: '弓の攻撃+8%' },
    azai: { name: '近江の精兵', types: G.yari, am: 1.06, text: '槍の攻撃+6%' },
    rokkaku: { name: '甲賀の鉄砲', types: G.teppo, ra: 3, text: '鉄砲の射程+3m' },
    asakura: { name: '越前の長槍', types: G.naga, hm: 1.08, text: '長槍・組頭の体力+8%' },
    miyoshi: { name: '畿内の鉄砲', types: G.teppo, hm: 1.1, text: '鉄砲の体力+10%' },
    kitabatake: { name: '伊勢の弓', types: G.yumi, hm: 1.1, text: '弓の体力+10%' },
    honganji: { name: '一向一揆', types: G.nohei, am: 1.1, hm: 1.1, text: '農兵の攻撃・体力+10%' },
    ashikaga: { name: '奉公衆', types: G.kiba, hm: 1.06, text: '騎馬の体力+6%' },
    toyama: { name: '山国の騎馬', types: G.kiba, da: 0.3, text: '騎馬の守り+0.3' },
    nagano: { name: '伊勢の弓衆', types: G.yumi, ra: 3, text: '弓の射程+3m' },
    tsutsui: { name: '大和の槍', types: G.yari, hm: 1.06, text: '槍の体力+6%' },
    hatano: { name: '丹波の山城衆', types: G.yumi, da: 0.2, text: '弓の守り+0.2' },
    seki: { name: '亀山の鉄砲', types: G.teppo, da: 0.2, text: '鉄砲の守り+0.2' },
    hatakeyama: { name: '根来の鉄砲', types: G.teppo, am: 1.06, text: '鉄砲の攻撃+6%' },
  };
  // プレイヤーの家は、独立する前の主家の得意を受け継ぐ
  SIM.factionBuff = (factions, id) => { const f = factions && factions[id]; return FB[id] || (f && f.from && FB[f.from]) || null; };
  const baseMods = SIM.unitMods;
  SIM.unitMods = (w, pid, type) => {
    const m = baseMods(w, pid, type), p = w.players[pid], b = p && p.clan && SIM.factionBuff(w.factions, p.clan);
    if (b && b.types.includes(type)) { m.am *= b.am || 1; m.hm *= b.hm || 1; m.da += b.da || 0; m.ra += b.ra || 0; }
    return m;
  };

  // ---- 足りない項目を補う ----
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    for (const [k, f] of Object.entries(w.factions)) {
      if (!f.player) continue;
      if (!w.players[f.leader]) continue;
      if (!f.home || !w.settlements.some((s) => s.id === f.home && s.owner === k)) f.home = (held(w, f.leader).find((s) => s.owner === k) || {}).id || null;
    }
    return w;
  };

  // ---- 独立して大名になる ----
  function familyName(name) {
    const s = SEI.filter((x) => name.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    return s || name.slice(0, Math.min(2, name.length));
  }
  SIM.commands.independence = (w, p) => {
    if (p.battle || p.busy) return;
    if (!p.clan || p.rank < INDEP.rank || RANKS[p.rank].indep) return SIM.say(p.id, `独立できるのは${RANKS[INDEP.rank].name}以上の家臣です`);
    if (p.fame < INDEP.fame) return SIM.say(p.id, `独立するには名声${INDEP.fame}が必要です（いま${p.fame}）`);
    const cs = held(w, p.id); if (!cs.length) return SIM.say(p.id, '治めている城がないと独立できません');
    const s = here(w, p); if (!s || s.holder !== p.id) return SIM.say(p.id, '自分の治める城の中で独立を宣言してください');
    const old = p.clan, oldName = (w.factions[old] || {}).name || '';
    let base = familyName(p.name) + '家', name = base, n = 2;
    while (Object.values(w.factions).some((f) => f.name === name)) name = base + n++;
    const id = 'pf_' + p.id;
    const used = Object.values(w.factions).map((f) => f.color);
    w.factions[id] = { name, leader: p.id, color: COLORS.find((c) => !used.includes(c)) || COLORS[0], player: true, home: s.id, from: old };
    for (const c of cs) {
      c.owner = id; c.lord = null;
      for (const n2 of Object.values(w.npcs)) if (n2.home === c.id && n2.faction === old) n2.faction = id;
    }
    p.leftClan = old; p.clan = id; p.rank = RANKS.length - 1; p.promoteHint = 0;
    p.fame += 10; p.status = `${name} ${RANKS[p.rank].name}`;
    SIM.say(p.id, `${oldName}から独立し、${name}を興しました！ ${cs.map((c) => c.name).join('・')}はあなたの領地です（名声+10）`);
    for (const q of Object.values(w.players)) if (q.id !== p.id) SIM.say(q.id, `${p.name}が${oldName}から独立し、${name}を興しました`);
  };

  // ---- 大名：家臣に城を任せる・身分を与える ----
  const vassals = (w, p) => Object.values(w.players).filter((q) => q.id !== p.id && q.clan === p.clan);
  SIM.commands.grantVassal = (w, p, c) => { // 家臣を一つ上の身分に取り立てる（大名だけ・功績や名声の条件はそのまま）
    const f = w.factions[p.clan]; if (!f || f.leader !== p.id) return;
    const q = w.players[c.id]; if (!q || q.clan !== p.clan) return;
    const nx = RANKS[q.rank + 1]; if (!nx || nx.indep) return SIM.say(p.id, `${q.name}はこれ以上取り立てられません`);
    if (q.merit < nx.merit || q.fame < nx.fame) return SIM.say(p.id, `${q.name}は功績か名声が足りません（功績${q.merit}/${nx.merit}・名声${q.fame}/${nx.fame}）`);
    if (q.rank + 1 === 5 && !SIM.grantCastle(w, q)) return SIM.say(p.id, '任せられる城がありません（居城以外に城が要ります）');
    q.rank++; q.promoteHint = 0; q.status = `${f.name} ${nx.name}`;
    if (q.rank >= 6) SIM.grantCastle(w, q);
    SIM.say(q.id, `${p.name}様から${nx.name}に取り立てられました！`);
    SIM.say(p.id, `${q.name}を${nx.name}に取り立てました`);
  };
  SIM.commands.recallCastle = (w, p, c) => { // 家臣に任せた城を返させる
    const f = w.factions[p.clan]; if (!f || f.leader !== p.id) return;
    const s = SIM.settlement(w, c.id); if (!s || s.owner !== p.clan || !s.holder || s.holder === p.id) return;
    const q = w.players[s.holder]; s.holder = p.id;
    if (q) SIM.say(q.id, `${s.name}は${p.name}様に召し上げられました`);
    SIM.say(p.id, `${s.name}を直轄にしました`);
  };

  // ---- 加増を願い出る（家老・国主で城の枠が空いているとき） ----
  SIM.commands.askCastle = (w, p) => {
    if (!p.clan || p.rank < 6 || RANKS[p.rank].indep) return;
    const s = here(w, p); if (!s || s.type !== 'castle' || s.owner !== p.clan) return SIM.say(p.id, '主家の城で願い出てください');
    const c = SIM.grantCastle(w, p);
    SIM.say(p.id, c ? `${c.name}を任されました！` : 'いまは任せられる城がないか、城の数が上限です');
  };

  // ---- 地図・画面に送る情報 ----
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = function (w, pid) {
    const d = baseDyn(w, pid);
    // 持ち主が変わった城と、プレイヤーの家（あとから増えるもの）
    d.ow = Object.fromEntries(w.settlements.filter((s) => { const o = SGK.DATA.settlements.find((x) => x.id === s.id); return o && o.owner !== s.owner; }).map((s) => [s.id, s.owner]));
    d.pf = Object.fromEntries(Object.entries(w.factions).filter(([, f]) => f.player).map(([k, f]) => [k, { name: f.name, color: f.color, leader: f.leader, player: true, from: f.from }]));
    return d;
  };
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid], f = w.factions[p.clan], s = here(w, p);
    r.me.rank.limit = SIM.castleLimit(p);
    r.me.rank.held = held(w, pid).length;
    r.me.rank.indep = { rank: INDEP.rank, fame: INDEP.fame, can: !!(p.clan && p.rank >= INDEP.rank && !RANKS[p.rank].indep && p.fame >= INDEP.fame && s && s.holder === pid) };
    r.me.rank.atClanCastle = !!(s && s.type === 'castle' && s.owner === p.clan);
    if (f && f.player && f.leader === pid) {
      r.me.rank.daimyo = {
        vassals: vassals(w, p).map((q) => { const nx = RANKS[q.rank + 1]; return { id: q.id, name: q.name, rank: RANKS[q.rank].name, ok: !!(nx && !nx.indep && q.merit >= nx.merit && q.fame >= nx.fame), next: nx && !nx.indep ? nx.name : null }; }),
        lent: w.settlements.filter((x) => x.owner === p.clan && x.holder && x.holder !== pid).map((x) => ({ id: x.id, name: x.name, who: (w.players[x.holder] || {}).name })),
        count: w.settlements.filter((x) => x.owner === p.clan).length,
      };
    }
    return r;
  };
})();
