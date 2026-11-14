// 0.40.0 依頼の種類を増やす
// 村：野盗退治・村の守り・労役／町：行商人の護衛・大口の売り込み／城：偵察・兵糧の運び込み・お尋ね者の捕縛・調略の使い
(function () {
  const SIM = SGK.SIM, rnd = (w) => SIM.rand(w), I = () => SGK.DATA.items;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pick = (w, a) => a[Math.floor(rnd(w) * a.length)];
  const r10 = (v) => Math.round(v / 10) * 10;
  const DIRS = ['東', '北東', '北', '北西', '西', '南西', '南', '南東'];
  const dirOf = (a, b) => DIRS[Math.round(((Math.atan2(-(b.y - a.y), b.x - a.x) * 180 / Math.PI + 360) % 360) / 45) % 8];
  const nearest = (w, x, y) => w.settlements.reduce((a, s) => (Math.hypot(s.x - x, s.y - y) < Math.hypot(a.x - x, a.y - y) ? s : a));
  const whereXY = (w, x, y) => { const s = nearest(w, x, y), d = Math.round(Math.hypot(s.x - x, s.y - y)); return d < 2 ? `${s.name}のそば` : `${s.name}の${dirOf(s, { x, y })} 約${d}km`; };
  const st = (w, id) => SIM.settlement(w, id);
  const nm = (w, id) => (st(w, id) || {}).name || '？';

  // 数値はここで調整
  const QC = {
    fame: { bandit: 1, defend: 1.5, labor: 0.5, escort: 1, sell: 0.5, scout: 1, supply: 1, outlaw: 2, envoy: 1 },
    extraRate: 0.55, castleRate: 0.4, // 新しい依頼がこちらの種類になる割合（村・町／城）
  };
  SIM.QUEST = QC;
  const OUTLAWS = ['鬼熊', '赤鬼の権太', '闇の五郎蔵', '猿の佐吉', '人斬り半兵衛', '黒狐の六', '石川の小太郎', '辻斬り弥平', '山犬の源八', '火付けの藤六'];
  const LABOR = ['刈り入れの手伝い', '田植えの手伝い', '用水路の普請', '堤の修繕', '屋根の葺き替え'];

  // 陸の上の、中心から rmin〜rmax km の場所
  function spot(w, cx, cy, rmin, rmax) {
    for (let i = 0; i < 60; i++) {
      const a = rnd(w) * Math.PI * 2, r = rmin + rnd(w) * (rmax - rmin), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (SIM.terrainAt(x, y) === '海' || SIM.isSea(x, y) || (i < 50 && SIM.terrainAt(x, y) === '山地')) continue; /* 1.6.9 なるべく山を避ける */
      if (w.settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 2)) continue;
      return [x, y];
    }
    return [cx + rmin, cy];
  }
  function spawnBandit(w, x, y, n, bows, extra) {
    const id = 'n' + w.nextId++, army = { bandit: n }; if (bows) army.banditBow = bows;
    w.npcs[id] = Object.assign({ id, kind: 'bandit', faction: null, x, y, tx: null, ty: null, hx: x, hy: y, wait: 0, speed: 28,
      army, size: SIM.troopCount(army), loot: r10(200 + rnd(w) * 600), calm: 0, battle: null }, extra || {});
    return w.npcs[id];
  }
  const grow = (w) => Math.min(14, Math.floor(w.time.min / 1440 / 15)); // 日が経つほど強い野盗

  // 敵の城（ちがう家の、城主のいる城）を近い順に
  function enemyCastles(w, s, km) {
    return w.settlements.filter((t) => t.type === 'castle' && t.owner && t.owner !== s.owner && dist(s, t) < km).sort((a, b) => dist(s, a) - dist(s, b));
  }
  // 前線の城：自家の城のうち、敵の城にいちばん近いもの
  function frontCastle(w, s) {
    const own = w.settlements.filter((t) => t.type === 'castle' && t !== s && t.owner === s.owner && dist(s, t) < 100); // 0.74.3 100km以内
    let best = null, bd = 1e9;
    for (const t of own) { const e = enemyCastles(w, t, 60)[0]; if (e && dist(t, e) < bd) { bd = dist(t, e); best = t; } }
    return best;
  }

  // 0.53.2 偵察・兵糧の運び込み・調略の使いは、その城の家に仕えている人だけが受けられる
  QC.milTypes = ['scout', 'supply', 'envoy'];
  // 0.74.3 届け先が出す側か受ける人と戦をしている家なら、その依頼は出さない・見せない（偵察・調略は敵の城が目当てなので別）
  QC.foeOk = ['scout', 'envoy'];
  SIM.foeDest = (w, a, b) => !!(SIM.atWar && a && b && SIM.atWar(w, a.owner, b.owner));
  SIM.jobOk = (w, p, j) => {
    if (j.to && !QC.foeOk.includes(j.type)) { const t = st(w, j.to), f = st(w, j.from); if (t && ((p.clan && SIM.atWar(w, p.clan, t.owner)) || SIM.foeDest(w, f, t))) return false; }
    return !QC.milTypes.includes(j.type) || (!!p.clan && st(w, j.from) && st(w, j.from).owner === p.clan);
  };

  // ---- 依頼をつくる（economy.js の genJob から呼ばれる） ----
  SIM.extraJob = (w, s, id, giver) => {
    if (rnd(w) > (s.type === 'castle' ? QC.castleRate : QC.extraRate)) return null;
    const base = { id, from: s.id, giver };
    if (s.type === 'village') {
      const k = pick(w, ['bandit', 'defend', 'labor']);
      if (k === 'bandit') return Object.assign(base, { type: k, days: 6, reward: r10(400 + rnd(w) * 400 + grow(w) * 30), title: '野盗退治', what: '村の近くに巣くう野盗を討つ' });
      if (k === 'defend') { const wait = 2 + Math.floor(rnd(w) * 3); return Object.assign(base, { type: k, wait, days: wait + 2, reward: r10(700 + rnd(w) * 500 + grow(w) * 40), title: '村の守り', what: `${wait}日後に野盗が村を襲う。村の外で迎え撃つ` }); }
      const hours = pick(w, [12, 18, 24]);
      return Object.assign(base, { type: k, hours, days: 4, reward: r10(hours * 55 + rnd(w) * 200), title: pick(w, LABOR), what: `村で${hours}時間はたらく（受けるとすぐ始まります）` });
    }
    if (s.type === 'town') {
      if (rnd(w) < 0.5) {
        const tos = w.settlements.filter((t) => t.type !== 'castle' && t !== s && dist(s, t) > 25 && dist(s, t) < 90 && !SIM.foeDest(w, s, t)); if (!tos.length) return null;
        const to = pick(w, tos), d = dist(s, to);
        return Object.assign(base, { type: 'escort', to: to.id, days: Math.ceil(d / 18) + 4, reward: r10(300 + d * 15), title: `${to.name}まで行商人の護衛`, what: `行商人について${to.name}まで守る（${dirOf(s, to)}へ約${Math.round(d)}km）`, look: to.id });
      }
      const tos = w.settlements.filter((t) => t.type === 'town' && t !== s && dist(s, t) < 100 && !SIM.foeDest(w, s, t)); if (!tos.length) return null; // 0.74.3 100km以内・戦の相手の町はなし
      const to = pick(w, tos), k = pick(w, Object.keys(I())), it = I()[k], qty = 10 + Math.floor(rnd(w) * 16);
      return Object.assign(base, { type: 'sell', to: to.id, item: k, qty, left: qty, days: 15, reward: r10(it.base * qty * 0.4 + 200), title: `${to.name}で${it.name}${qty}${it.unit}を売る`, what: `${to.name}の市で${it.name}を${qty}${it.unit}売りさばく（売った代金とは別に報酬）`, look: to.id });
    }
    if (s.type !== 'castle' || !s.owner || !w.factions[s.owner]) return null;
    let k = pick(w, ['scout', 'supply', 'outlaw', 'envoy']); if (k === 'supply' && rnd(w) < 0.5) k = pick(w, ['scout', 'outlaw', 'envoy']); // 0.74.1 兵糧運びを半分に
    if (k === 'scout') {
      const t = pick(w, enemyCastles(w, s, 100).slice(0, 4)); if (!t) return null; const d = dist(s, t);
      return Object.assign(base, { type: k, to: t.id, stage: 0, days: Math.ceil((d * 2) / 20) + 3, reward: r10(400 + d * 10), title: `${t.name}の偵察`, what: `${t.name}に近づいて守りを調べ、ここへ戻って報告する`, look: t.id });
    }
    if (k === 'supply') {
      const t = frontCastle(w, s); if (!t) return null; const d = dist(s, t), qty = 3 + Math.floor(rnd(w) * 4); // 0.74.1 以前は10〜20俵
      return Object.assign(base, { type: k, to: t.id, item: 'rice', qty, days: Math.ceil(d / 20) + 5, reward: r10(I().rice.base * qty * 1.5 + 200 + d * 5), title: `${t.name}へ兵糧の運び込み`, what: `米${qty}俵を前線の${t.name}へ運ぶ（${dirOf(s, t)}へ約${Math.round(d)}km）`, look: t.id });
    }
    if (k === 'outlaw') {
      const name = pick(w, OUTLAWS);
      return Object.assign(base, { type: k, oname: name, stage: 0, days: 10, reward: r10(800 + rnd(w) * 700 + grow(w) * 40), title: `お尋ね者「${name}」の捕縛`, what: `${name}とその手下を討ち、捕らえてここへ連れてくる` });
    }
    const t = enemyCastles(w, s, 100).filter((x) => x.lord && w.people[x.lord] && !(w.factions[x.owner] && w.factions[x.owner].leader === x.lord)).slice(0, 4);
    const to = t.length && pick(w, t); if (!to) return null; const d = dist(s, to), lord = w.people[to.lord];
    return Object.assign(base, { type: 'envoy', to: to.id, days: Math.ceil(d / 20) + 4, reward: r10(600 + d * 8), title: `${lord.name}への調略の使い`, what: `${to.name}に入り、城主${lord.name}に寝返りを説く（受けた人の知略で成否が決まる）`, look: to.id });
  };

  // ---- 達成・失敗 ----
  function done(w, p, q, msg) {
    const fm = QC.fame[q.type] || 0.5;
    p.money += q.reward; p.fame += fm; p.quests = p.quests.filter((x) => x !== q);
    SIM.say(p.id, `${msg ? msg + ' ' : ''}依頼「${q.title}」達成！ ${SIM.money(q.reward)}を受け取りました（名声+${fm}）`);
    const s = st(w, q.from);
    if (SIM.addMerit && p.clan && s && s.owner === p.clan) SIM.addMerit(w, p, (s.type === 'castle' ? 12 : 6) + q.reward / 100, `${w.factions[p.clan] ? w.factions[p.clan].name : ''}の領地の依頼`);
  }
  function drop(w, p, q, msg, fame) {
    p.quests = p.quests.filter((x) => x !== q);
    if (fame) p.fame = Math.max(0, p.fame - fame);
    SIM.say(p.id, `依頼「${q.title}」は果たせませんでした。${msg}${fame ? `（名声-${fame}）` : ''}`);
  }

  // ---- 受けたとき ----
  const baseAccept = SIM.commands.acceptJob;
  SIM.commands.acceptJob = (w, p, c) => {
    const n = p.quests.length; baseAccept(w, p, c);
    if (p.quests.length <= n) return;
    const q = p.quests[p.quests.length - 1], s = st(w, q.from), now = w.time.min, g = grow(w);
    if (q.type === 'bandit') {
      const [x, y] = spot(w, s.x, s.y, 5, 11), b = spawnBandit(w, x, y, 8 + Math.floor(rnd(w) * 8) + g, 2 + Math.floor(rnd(w) * 4), { qid: q.id });
      q.npc = b.id; SIM.say(p.id, `野盗は${whereXY(w, x, y)}あたりにいるそうです`);
    } else if (q.type === 'defend') {
      q.raid = now + q.wait * 1440; q.deadline = q.raid + 1.5 * 1440;
      SIM.say(p.id, `${q.wait}日後に野盗が来ます。その日までに${s.name}に戻っておきましょう`);
    } else if (q.type === 'labor') startLabor(w, p, q);
    else if (q.type === 'escort') {
      const to = st(w, q.to), m = SIM.spawnNpc(w, 'merchant', null, s);
      Object.assign(m, { tx: to.x, ty: to.y, dest: to.id, at: null, path: SIM.findPath(s.x, s.y, to.x, to.y), wait: 0, escort: p.id, qid: q.id, speed: 22 });
      q.npc = m.id; q.half = dist(s, to) / 2;
      SIM.say(p.id, '行商人が出発しました。地図で行商人を選んで「ついて行く」と楽です');
    } else if (q.type === 'outlaw') {
      const [x, y] = spot(w, s.x, s.y, 10, 22), b = spawnBandit(w, x, y, 14 + Math.floor(rnd(w) * 8) + g, 4 + Math.floor(rnd(w) * 4), { qid: q.id, qname: `お尋ね者・${q.oname}` });
      b.loot += 500; q.npc = b.id; SIM.say(p.id, `${q.oname}は${whereXY(w, x, y)}あたりに出るそうです`);
    }
  };
  function startLabor(w, p, q) {
    if (p.busy) return SIM.say(p.id, '仕事中です');
    p.busy = { kind: 'qlabor', label: q.title, until: w.time.min + q.hours * 60, qid: q.id };
    SIM.say(p.id, `${q.title}を始めました（${q.hours}時間）`);
  }
  SIM.npcName = ((base) => (w, n) => (n && n.qname) || (base ? base(w, n) : null))(SIM.npcName);

  // 売り込みの品は、その町では買えない（買ってすぐ売って達成しないように）
  const baseNoBuy = SIM.noBuy;
  SIM.noBuy = (w, s) => {
    const r = baseNoBuy(w, s);
    for (const p of Object.values(w.players)) for (const q of p.quests || []) if (q.type === 'sell' && q.to === s.id) r.add(q.item);
    return r;
  };
  const baseSell = SIM.commands.sell;
  SIM.commands.sell = (w, p, c) => {
    const before = p.inv[c.item] || 0, at = p.at; baseSell(w, p, c);
    const sold = before - (p.inv[c.item] || 0); if (sold <= 0) return;
    for (const q of p.quests.slice()) if (q.type === 'sell' && q.to === at && q.item === c.item) {
      q.left -= sold;
      if (q.left <= 0) done(w, p, q); else SIM.say(p.id, `売り込みの残り：${q.left}${I()[q.item].unit}`);
      break;
    }
  };

  // その場でする仕事（労役の再開・兵糧の納め・調略）
  SIM.commands.questAct = (w, p, c) => {
    const q = p.quests.find((x) => x.id === c.id); if (!q || p.battle) return;
    if (!(p.at && p.tx == null)) return SIM.say(p.id, '拠点の中でないとできません');
    if (q.type === 'labor' && p.at === q.from) return startLabor(w, p, q);
    if (q.type === 'supply' && p.at === q.to) return supplyIn(w, p, q, true);
    if (q.type === 'envoy' && p.at === q.to) {
      const t = st(w, q.to), pr = t.lord && w.people[t.lord];
      if (!pr || t.owner === p.clan) return drop(w, p, q, '城主が替わってしまいました');
      const ch = Math.min(0.85, (SIM.persuadeChance ? SIM.persuadeChance(w, p, t) : 0.2) * 1.5 + 0.2);
      SIM.gain && SIM.gain(p, 'naisei', 3);
      if (rnd(w) < ch) { const dn = 10 + Math.floor(rnd(w) * 8); pr.loyal = Math.max(0, pr.loyal - dn); done(w, p, q, `${pr.name}の心が揺らぎました（忠誠-${dn} → ${pr.loyal}）。`); }
      else drop(w, p, q, `${pr.name}「帰られよ」と追い返されました`);
    }
  };
  function supplyIn(w, p, q, loud) {
    if ((p.inv.rice || 0) < q.qty) { if (loud) SIM.say(p.id, `米が足りません（${p.inv.rice || 0}/${q.qty}俵）`); return; }
    p.inv.rice -= q.qty; if (!p.inv.rice) delete p.inv.rice;
    const t = st(w, q.to); if (t && t.stock) t.stock.rice = (t.stock.rice || 0) + q.qty;
    done(w, p, q, `米${q.qty}俵を納めました。`);
  }

  // 着いたとき：偵察の報告・兵糧の納め・お尋ね者の引き渡し
  const baseArrive = SIM.onPlayerArrive;
  SIM.onPlayerArrive = (w, p) => {
    baseArrive(w, p);
    for (const q of p.quests.slice()) {
      if (q.type === 'scout' && q.stage === 1 && p.at === q.from) done(w, p, q, '偵察の報告をしました。');
      else if (q.type === 'supply' && p.at === q.to) supplyIn(w, p, q, true);
      else if (q.type === 'outlaw' && q.stage === 1 && p.at === q.from) done(w, p, q, `${q.oname}を引き渡しました。`);
    }
  };

  // 戦に勝ったとき
  const baseEnd = SIM.onBattleEnd;
  SIM.onBattleEnd = (w, b, p, res, after) => {
    baseEnd(w, b, p, res, after);
    if (res !== 'win' || !b.npc) return;
    for (const q of p.quests.slice()) {
      if (q.npc !== b.npc) { if (q.ambush === b.npc) q.ambushWon = true; continue; }
      if (q.type === 'bandit' || q.type === 'defend') done(w, p, q, '野盗を退けました。');
      else if (q.type === 'outlaw') { q.stage = 1; q.npc = null; SIM.say(p.id, `${q.oname}を捕らえました！ ${nm(w, q.from)}へ連れていきましょう`); }
    }
  };

  // ---- 毎tick：見張り ----
  SIM.systems.unshift(function questLabor(w) { // 労役（economy.js の busyTick より先に）
    for (const p of Object.values(w.players)) {
      const b = p.busy; if (!b || b.kind !== 'qlabor' || w.time.min < b.until) continue;
      p.busy = null; const q = p.quests.find((x) => x.id === b.qid);
      if (q) done(w, p, q, `${q.title}を終えました。`);
    }
  });
  SIM.systems.push(function questTick(w) {
    const now = w.time.min;
    for (const p of Object.values(w.players)) for (const q of (p.quests || []).slice()) {
      const s = st(w, q.from), to = q.to && st(w, q.to); if (!s) continue;
      q.mk = q.from; q.pt = null;
      if (q.type === 'bandit' || q.type === 'outlaw' || q.type === 'defend') {
        if (q.type === 'defend' && !q.npc) {
          q.where = `${s.name}（あと${Math.max(0, Math.ceil((q.raid - now) / 1440))}日で野盗が来る）`;
          if (now >= q.raid) {
            const [x, y] = spot(w, s.x, s.y, 3, 4), g = grow(w);
            const n = spawnBandit(w, x, y, 14 + Math.floor(rnd(w) * 10) + g, 4 + Math.floor(rnd(w) * 5), { qid: q.id });
            n.tx = s.x + (x - s.x) * 0.3; n.ty = s.y + (y - s.y) * 0.3; n.hx = n.tx; n.hy = n.ty; q.npc = n.id;
            SIM.say(p.id, `野盗が${s.name}に迫っています！ 村の外へ出て迎え撃ちましょう`);
          }
          continue;
        }
        if (q.type === 'outlaw' && q.stage === 1) { q.where = `${s.name}へ連れていく`; continue; }
        const n = q.npc && w.npcs[q.npc];
        if (!n) { drop(w, p, q, 'ほかの者に討たれてしまいました'); continue; }
        if (!n.battle) { q.pt = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]; q.where = `${q.type === 'outlaw' ? q.oname : '野盗'}：${whereXY(w, n.x, n.y)}`; }
      } else if (q.type === 'labor') {
        q.where = p.busy && p.busy.qid === q.id ? `${s.name}ではたらいている` : `${s.name}で（あと${q.hours}時間）`;
        q.act = '務める'; q.actAt = q.from;
      } else if (q.type === 'escort') {
        q.mk = q.to; const n = w.npcs[q.npc];
        if (!n) { drop(w, p, q, '行商人を見失いました'); continue; }
        q.pt = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10];
        q.where = `行商人：${whereXY(w, n.x, n.y)} → ${to.name}`;
        if (!q.ambush && n.tx != null && dist(n, to) < q.half) { // 道のりの半ばで野盗に襲われる
          const [x, y] = spot(w, n.x, n.y, 0.8, 1.4), g = grow(w);
          q.ambush = spawnBandit(w, x, y, 9 + Math.floor(rnd(w) * 8) + g, 2 + Math.floor(rnd(w) * 4), { qid: q.id }).id;
          n.hold = now + 1440; SIM.say(p.id, '行商人が野盗に道をふさがれました！ 1日のうちに追い払いましょう');
        }
        if (q.ambush && q.ambush !== -1 && !w.npcs[q.ambush]) { q.ambush = -1; n.hold = null; SIM.say(p.id, '行商人がふたたび歩き出しました'); }
        if (q.ambush && q.ambush !== -1 && n.hold && now > n.hold) { n.hold = null; delete n.escort; drop(w, p, q, '行商人の荷が奪われてしまいました', 1); continue; }
        if (n.at === q.to && n.tx == null) {
          delete n.escort; n.speed = 25;
          if (dist(p, n) < 3) done(w, p, q, `行商人が無事に${to.name}に着きました。`); else drop(w, p, q, `行商人だけが${to.name}に着きました（そばにいませんでした）`);
        }
      } else if (q.type === 'sell') { q.mk = q.to; q.where = `${to.name}で${I()[q.item].name}を売る（残り${q.left}${I()[q.item].unit}）`; }
      else if (q.type === 'scout') {
        if (q.stage === 0) {
          q.mk = q.to; q.where = `${to.name}に近づく`;
          if (dist(p, to) < 3) {
            q.stage = 1; const gar = SIM.garrison ? SIM.garrison(to) : 0, lord = to.lord && w.people[to.lord];
            SIM.say(p.id, `${to.name}の守りを見届けました：守兵およそ${Math.round(gar / 10) * 10 || gar}人${lord ? `、城主は${lord.name}` : ''}。${s.name}へ戻って報告しましょう`);
          }
        } else q.where = `${s.name}へ戻って報告`;
      } else if (q.type === 'supply') { q.mk = q.to; q.where = `${to.name}へ米${q.qty}俵（所持 ${p.inv.rice || 0}）`; q.act = '納める'; q.actAt = q.to; }
      else if (q.type === 'envoy') { q.mk = q.to; q.where = `${to.name}の城主に会う`; q.act = '寝返りを説く'; q.actAt = q.to; }
    }
  });
})();
