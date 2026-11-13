// 0.54.0 武将との取引：見回りの隊・旅の武将・軍勢に話しかけて、米を売る・兵を譲ってもらう・進物を贈る
// 取引の相手は「率いている武将その人」。進物で武将ごとの好感が上がり、値段が良くなる（p.fav[武将のid]）
(function () {
  const SIM = SGK.SIM;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const I = () => SGK.DATA.items;

  // 数値はここで調整
  const TH = SIM.TORI = {
    km: 1.5,                                   // この距離まで近づくと取引できる
    riceMul: 1.5,                              // 陣中の米は相場（基準値）の何倍で買ってくれるか
    riceNeed: { patrol: 15, bushou: 10, army: 40 }, // 1度に買ってくれる米の上限（俵）
    riceDays: 5,                               // 同じ相手に米を売れるのは何日ごと
    troopQty: 5, troopMul: 1.4, troopMin: 15, troopDays: 10, // 兵を譲ってもらう：人数・雇う値段の倍率・相手に残る最低人数・何日ごと
    troopFav: 2,                               // 兵を譲ってもらうのに要る好感（同じ家なら要らない）
    gift: 1000, giftFav: 1, favMax: 5, giftDays: 3, // 進物：1貫で好感+1（最大5）・何日ごと
    favRate: 0.03,                             // 好感1つごとに値段が3%よくなる
    sameClan: 0.05,                            // 同じ家の武将なら5%よくなる
  };

  const leaderOf = (w, n) => { const id = n && (n.person || (n.gens && n.gens[0])); const pr = id && w.people[id]; return pr && !pr.dead ? [id, pr] : [null, null]; };
  const favOf = (p, id) => ((p.fav || {})[id] || 0);
  const good = (p, id, fac) => 1 + favOf(p, id) * TH.favRate + (p.clan && p.clan === fac ? TH.sameClan : 0);
  const ready = (n, k, w) => !((n.td || {})[k] > w.time.min);
  const wait = (n, k, w, days) => { n.td = n.td || {}; n.td[k] = w.time.min + days * 1440; };

  SIM.commands.npcTrade = (w, p, c) => {
    const n = w.npcs[c.id]; if (!n || !['patrol', 'bushou', 'army'].includes(n.kind) || p.battle || n.battle || n.fight) return;
    if (dist(n, p) > TH.km) return SIM.say(p.id, `もっと近づかないと取引できません（${TH.km}km以内）`);
    if (SIM.atWar && SIM.atWar(w, p.clan, n.faction)) return SIM.say(p.id, '戦をしている家の武将とは取引できません');
    const [pid, pr] = leaderOf(w, n); if (!pr) return SIM.say(p.id, '率いている武将がいないので取引できません');
    const nm = pr.name, g = good(p, pid, n.faction), tm = (side) => (SIM.tradeMod ? SIM.tradeMod(p, side) : 1);

    if (c.kind === 'rice') {
      if (!ready(n, 'rice', w)) return SIM.say(p.id, `${nm}「米はもう足りておる。また日を改めて来られよ」`);
      const have = (p.inv && p.inv.rice) || 0; if (!have) return SIM.say(p.id, '売る米を持っていません');
      const q = Math.min(have, TH.riceNeed[n.kind] || 10), unit = Math.floor(I().rice.base * TH.riceMul * g * tm('sell')), t = unit * q;
      p.inv.rice -= q; p.money += t; wait(n, 'rice', w, TH.riceDays);
      return SIM.say(p.id, `${nm}「兵糧はありがたい」　米${q}俵を${SIM.money(t)}で売りました（1俵${unit}文）`);
    }
    if (c.kind === 'troop') {
      if (n.kind === 'army') return SIM.say(p.id, `${nm}「出陣の最中ゆえ、兵は割けぬ」`);
      if (p.clan !== n.faction && favOf(p, pid) < TH.troopFav) return SIM.say(p.id, `${nm}「見知らぬ者に兵は預けられぬ」（好感${TH.troopFav}以上か、同じ家に仕えていれば譲ってもらえます）`);
      if (!ready(n, 'troop', w)) return SIM.say(p.id, `${nm}「これ以上は割けぬ。しばらく待たれよ」`);
      const ar = n.army || {}, k = ['yari', 'yumi', 'nohei'].find((x) => (ar[x] || 0) >= TH.troopQty);
      if (!k || (n.size || 0) - TH.troopQty < TH.troopMin) return SIM.say(p.id, `${nm}「わが隊も手薄ゆえ、兵は割けぬ」`);
      const room = SIM.troopCap(p) - SIM.troopCount(p.troops); if (room < TH.troopQty) return SIM.say(p.id, `率いる人数に空きがありません（あと${TH.troopQty}人の空きが要ります）`);
      const cost = Math.ceil((SIM.TROOPS[k].cost * TH.troopQty * TH.troopMul) / g / 10) * 10;
      if (p.money < cost) return SIM.say(p.id, `${nm}「${SIM.TROOPS[k].name}${TH.troopQty}人なら${SIM.money(cost)}じゃ」（お金が足りません）`);
      p.money -= cost; ar[k] -= TH.troopQty; n.size = Math.max(0, (n.size || 0) - TH.troopQty);
      p.troops[k] = (p.troops[k] || 0) + TH.troopQty; wait(n, 'troop', w, TH.troopDays);
      return SIM.say(p.id, `${nm}から${SIM.TROOPS[k].name}${TH.troopQty}人を${SIM.money(cost)}で譲ってもらいました`);
    }
    if (c.kind === 'gift') {
      if (!ready(n, 'gift', w)) return SIM.say(p.id, `${nm}「先日の品、まことにかたじけない」（進物は${TH.giftDays}日ごとに贈れます）`);
      if (favOf(p, pid) >= TH.favMax) return SIM.say(p.id, `${nm}「お主とはもう十分に昵懇の間柄じゃ」`);
      if (p.money < TH.gift) return SIM.say(p.id, `進物にはお金${SIM.money(TH.gift)}が要ります`);
      p.money -= TH.gift; p.fav = p.fav || {}; p.fav[pid] = favOf(p, pid) + TH.giftFav; wait(n, 'gift', w, TH.giftDays);
      p.kao = p.kao || {}; const f = w.factions[n.faction], first = f && !p.kao[n.faction]; if (f) p.kao[n.faction] = true;
      return SIM.say(p.id, `${nm}に進物を贈りました。好感${p.fav[pid]}（取引の値段が${Math.round(good(p, pid, n.faction) * 100 - 100)}%よくなります）${first ? `。${f.name}と顔をつなぎました` : ''}`);
    }
  };


  // ===== プレイヤー同士の取引：渡す（お金・荷・兵）と、売りに出す（相手が受けると代金と品が入れ替わる） =====
  TH.pKm = 1.5; TH.offerMin = 120; // 申し出はゲーム内2時間で消える
  const CAPN = 30;
  const near = (w, p, c) => { const q = w.players[c.to]; if (!q || q === p) return null; if (dist(p, q) > TH.pKm) { SIM.say(p.id, `もっと近づかないと渡せません（${TH.pKm}km以内）`); return null; } if (p.battle || q.battle) { SIM.say(p.id, '戦の最中は取引できません'); return null; } return q; };
  const room = (q, k) => (k === 'rice' ? (SIM.riceCap ? SIM.riceCap(q) : 999) - ((q.inv && q.inv.rice) || 0) : CAPN - SIM.cargo(q));
  const moveItem = (a, b, k, n) => { a.inv[k] -= n; b.inv[k] = (b.inv[k] || 0) + n; };
  SIM.commands.pGive = (w, p, c) => {
    const q = near(w, p, c); if (!q) return;
    if (c.what === 'money') { const n = Math.min(p.money, Math.max(0, +c.qty || 0)); if (!n) return SIM.say(p.id, 'お金が足りません'); p.money -= n; q.money += n; SIM.say(p.id, `${q.name}に${SIM.money(n)}を渡しました`); return SIM.say(q.id, `${p.name}から${SIM.money(n)}を受け取りました`); }
    if (c.what === 'item') { const k = c.item, it = I()[k]; if (!it) return; const n = Math.min((p.inv[k] || 0), +c.qty || 0, Math.max(0, room(q, k))); if (n <= 0) return SIM.say(p.id, (p.inv[k] || 0) ? `${q.name}の荷にもう空きがありません` : `${it.name}を持っていません`); moveItem(p, q, k, n); SIM.say(p.id, `${q.name}に${it.name}${n}${it.unit}を渡しました`); return SIM.say(q.id, `${p.name}から${it.name}${n}${it.unit}を受け取りました`); }
    if (c.what === 'troop') { // 0.54.1 兵種と人数を選んで預ける
      const k = c.kind; if (!SIM.TROOPS[k] || k === 'hero' || !(p.troops[k] > 0)) return SIM.say(p.id, 'その兵はいません');
      const n = Math.min(p.troops[k], Math.max(1, +c.qty || 1), SIM.troopCap(q) - SIM.troopCount(q.troops)); if (n <= 0) return SIM.say(p.id, `${q.name}は率いる人数に空きがありません`);
      p.troops[k] -= n; q.troops[k] = (q.troops[k] || 0) + n; SIM.say(p.id, `${q.name}に${SIM.TROOPS[k].name}${n}人を預けました`); return SIM.say(q.id, `${p.name}から${SIM.TROOPS[k].name}${n}人を預かりました`);
    }
  };
  SIM.commands.pOffer = (w, p, c) => {
    const q = near(w, p, c); if (!q) return; const k = c.item, it = I()[k]; if (!it) return;
    const n = Math.min(p.inv[k] || 0, +c.qty || 0); if (n <= 0) return SIM.say(p.id, `${it.name}を持っていません`);
    const price = Math.max(0, Math.round((it.base * n * (+c.mul || 1)) / 10) * 10);
    w.offers = w.offers || {}; for (const [id, o] of Object.entries(w.offers)) if (o.from === p.id && o.to === q.id) delete w.offers[id]; // 同じ相手への申し出は1つだけ
    const id = 'of' + w.nextId++; w.offers[id] = { id, from: p.id, to: q.id, item: k, qty: n, price, until: w.time.min + TH.offerMin };
    SIM.say(p.id, `${q.name}に「${it.name}${n}${it.unit}を${SIM.money(price)}で」と申し出ました`);
    SIM.say(q.id, `${p.name}から申し出：${it.name}${n}${it.unit}を${SIM.money(price)}で売りたい（地図で${p.name}を選ぶと受けられます）`);
  };
  SIM.commands.pOfferAns = (w, p, c) => {
    const o = (w.offers || {})[c.id]; if (!o || o.to !== p.id) return; delete w.offers[c.id];
    const a = w.players[o.from], it = I()[o.item]; if (!a) return;
    if (!c.ok) { SIM.say(p.id, '申し出を断りました'); return SIM.say(a.id, `${p.name}は申し出を断りました`); }
    if (dist(a, p) > TH.pKm * 2) return SIM.say(p.id, '相手が離れてしまいました');
    if ((a.inv[o.item] || 0) < o.qty) { SIM.say(p.id, `${a.name}はもう${it.name}を持っていません`); return SIM.say(a.id, `${it.name}が足りず、取引できませんでした`); }
    if (p.money < o.price) return SIM.say(p.id, 'お金が足りません');
    if (room(p, o.item) < o.qty) return SIM.say(p.id, '荷に空きがありません');
    p.money -= o.price; a.money += o.price; moveItem(a, p, o.item, o.qty);
    SIM.say(p.id, `${a.name}から${it.name}${o.qty}${it.unit}を${SIM.money(o.price)}で買いました`); SIM.say(a.id, `${p.name}が${it.name}${o.qty}${it.unit}を${SIM.money(o.price)}で買いました`);
  };
  SIM.systems.push(function offerTick(w) { if (!w.offers) return; for (const [id, o] of Object.entries(w.offers)) if (o.until < w.time.min || !w.players[o.from] || !w.players[o.to]) delete w.offers[id]; });

  // 参加者へ：近くの取引相手の武将への好感と、待ち時間（自分に見える相手だけ）
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const tr = {};
    for (const n of Object.values(w.npcs)) {
      if (!['patrol', 'bushou', 'army'].includes(n.kind) || dist(n, p) > 3) continue;
      const [id] = leaderOf(w, n); if (!id) continue;
      tr[n.id] = { fav: favOf(p, id), rice: ready(n, 'rice', w), troop: ready(n, 'troop', w), gift: ready(n, 'gift', w),
        rp: Math.floor(I().rice.base * TH.riceMul * good(p, id, n.faction) * (SIM.tradeMod ? SIM.tradeMod(p, 'sell') : 1)) };
    }
    r.me.tr = tr;
    r.me.offIn = Object.values(w.offers || {}).filter((o) => o.to === pid).map((o) => ({ id: o.id, from: o.from, item: o.item, qty: o.qty, price: o.price }));
    r.me.offOut = Object.values(w.offers || {}).filter((o) => o.from === pid).map((o) => o.to);
    return r;
  };
})();
