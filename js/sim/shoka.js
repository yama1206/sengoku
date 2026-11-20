// 2.56.0 商家：独立して店を持つ・支店と相場の知らせ・御用商人・茶会と会合衆（このゲームなりの商人の遊び）。
//  ・店：大番頭が元手を出して独立すると「店主」になる（給金はなくなり、店の売上で稼ぐ）。品を棚に並べると、町の人が毎日少しずつ買っていく
//    （その町の相場より少し高く売れる。店構えを大きくし、奉公人を雇うと売れる数が増える）。売上は月ごとに手元へ届く
//  ・支店：ほかの町に3つまで。店から店へ品を送れる（数日かかる）。店のある町の相場は、いつでも分かる（相場の知らせ）
//  ・御用商人：城で大名家に献金したり、御用の品（兵糧など）を納めたりして気に入られると、その家の御用商人になれる
//    （その家の領内の店がよく売れ、その家の市場で安く買え、毎月扶持が出る）
//  ・茶会：茶器（家宝）を持っていると、自分の店で茶会を開ける。名声が上がり、豪商との縁が深まる（縁が深いと家宝が安く買える）
//  ・会合衆：堺の豪商と縁が深く、店を2つ以上持つ店主は、堺の会合衆に加われる（店がよく売れ、大きな町の相場が分かり、月に一度の会合で配当）
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, C = SIM.commands, say = (pid, t) => SIM.say(pid, t);
  const GS = SIM.GOSHO, I = () => SGK.DATA.items;
  const SK = (SIM.SHOKA = {});
  SK.openCost = 50000;    // 独立して本店を開く元手
  SK.branchCost = 30000;  // 支店1つ
  SK.maxBranch = 3;
  SK.LV = [null, { name: '小店', cap: 60, mul: 1 }, { name: '表店', cap: 120, mul: 1.35, cost: 20000 }, { name: '大店', cap: 200, mul: 1.7, cost: 50000 }];
  SK.staffCost = 1000; SK.wage = 300; SK.staffMul = 0.35; // 奉公人：雇うとき・月の給金・1人あたり売れる数の増え
  SK.base = (s) => 1 + 1.5 * (s.size || 1); // 1日に売れる数の目安（店構え・奉公人の前）
  SK.markup = 1.05;       // 相場より5%高く売れる
  SK.sendDays = (a, b) => Math.max(2, Math.min(12, 2 + Math.round(Math.hypot(a.x - b.x, a.y - b.y) / 60)));
  SK.sendFee = 0.03;      // 送る品の値の3%
  // 御用商人
  SK.goyoNeed = 100; SK.giftPer = 400; SK.goyoPay = 1500; SK.goyoSale = 1.3; SK.goyoBuy = 0.95; SK.goyoRank = 2;
  // 茶会・会合衆
  SK.chaCost = 3000; SK.chaGap = 30;
  SK.CHAKI = ['chaire', 'tenmoku', 'jiku', 'koro']; // 茶会に使う茶器（南蛮の品は珍品として少し足しになる）
  SK.kaigoTown = 'sakai'; SK.kaigoFee = 30000; SK.kaigoEn = 30; SK.kaigoFame = 35; SK.kaigoSale = 1.15;
  SK.enOff = (n) => (n >= 60 ? 0.1 : n >= 30 ? 0.05 : 0); // 豪商との縁で家宝が安くなる

  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const sho = (p) => (p.sho && p.sho.rank ? p.sho : null);
  const owner = (p) => { const S = sho(p); return S && S.own ? S : null; };
  const shops = (p) => (p.shops = p.shops || {});
  const shopOk = (s) => !!(s && !s.site && (s.type === 'town' || s.type === 'castle'));
  const nm = (w, id) => { const s = SIM.settlement(w, id); return s ? s.name : id; };
  const fname = (w, id) => { const n = (w.factions[id] || {}).name || ''; return !n || n.endsWith('家') ? n : n + '家'; };
  const addInv = (inv, cost, k, q, c) => { const hv = inv[k] || 0, old = cost[k] != null ? cost[k] : c; cost[k] = (old * hv + c * q) / (hv + q); inv[k] = hv + q; };
  const takeInv = (inv, cost, k, q) => { inv[k] -= q; if (!(inv[k] > 0)) { delete inv[k]; if (cost) delete cost[k]; } };
  const shelfN = (sh) => Object.values(sh.shelf).reduce((a, n) => a + n, 0);
  const yaName = (s) => s.name.replace(/[町城村湊]$/, '') + '屋';
  SK.retail = (s, k) => Math.round(Math.min(SIM.price(s, k), I()[k].base * 1.6) * SK.markup);
  const clanAlive = (w, c) => !!(c && w.factions[c] && w.settlements.some((s) => s.type === 'castle' && s.owner === c));
  const isGoyo = (w, p, s) => !!(p.goyo && p.goyo.clan && s && s.owner === p.goyo.clan);
  const inKaigo = (p) => !!(p.kaigo && owner(p));
  SK.saleMul = (w, p, s, sh) => SK.LV[sh.lv].mul * (1 + SK.staffMul * sh.staff) * (isGoyo(w, p, s) ? SK.goyoSale : 1) * (inKaigo(p) ? SK.kaigoSale : 1);
  SK.perDay = (w, p, s, sh) => SK.base(s) * SK.saleMul(w, p, s, sh);

  // 豪商の家宝の値引き：格＋縁＋会合衆（gosho.js の off を広げる）
  const baseOff = GS.off;
  GS.off = (p, sid) => Math.min(0.4, baseOff(p) + (sid ? SK.enOff((p.en || {})[sid] || 0) : 0) + (inKaigo(p) ? 0.05 : 0));
  const addEn = (p, sid, n) => { if (!GS.HOUSES[sid]) return 0; p.en = p.en || {}; p.en[sid] = Math.min(100, (p.en[sid] || 0) + n); return n; };
  SK.addEn = addEn;

  // ---- 店 ----
  C.shopOpen = (w, p) => {
    const s = here(w, p); if (!s || p.battle || p.busy) return;
    if (!shopOk(s)) return say(p.id, '店を開けるのは町か城下だけです');
    const S = sho(p); if (!S) return say(p.id, '店を開けるのは商人だけです');
    const sh = shops(p); if (sh[s.id]) return say(p.id, 'ここにはもう店があります');
    if (!S.own) {
      if (S.rank < 4) return say(p.id, `独立して店を持てるのは${GS.RANKS[4].name}からです（いま${GS.RANKS[S.rank].name}）`);
      if (p.money < SK.openCost) return say(p.id, `元手が足りません（${SIM.money(SK.openCost)}）`);
      p.money -= SK.openCost; const from = GS.houseName(S.house);
      S.own = true; S.rank = 5; S.ya = yaName(s); S.house = s.id; S.hint = 0; p.status = `${S.ya} 店主`;
      sh[s.id] = { lv: 1, shelf: {}, cost: {}, till: 0, staff: 0, sold: 0, d0: day(w) };
      p.fame += 5;
      return say(p.id, `${from}から暖簾分けを許され、${s.name}に「${S.ya}」を開きました！ 店主になりました（名声+5）。棚に品を並べると、町の人が毎日買っていきます`);
    }
    if (Object.keys(sh).length > SK.maxBranch) return say(p.id, `支店は${SK.maxBranch}つまでです`);
    if (p.money < SK.branchCost) return say(p.id, `お金が足りません（${SIM.money(SK.branchCost)}）`);
    p.money -= SK.branchCost; sh[s.id] = { lv: 1, shelf: {}, cost: {}, till: 0, staff: 0, sold: 0, d0: day(w) };
    say(p.id, `${s.name}に${S.ya}の支店を出しました。この町の相場はいつでも分かるようになります`);
  };
  const myShop = (w, p) => { const s = here(w, p), sh = s && shops(p)[s.id]; return sh && owner(p) ? [s, sh] : [null, null]; };
  C.shop = (w, p, c) => {
    if (!c || p.battle) return; const [s, sh] = myShop(w, p); if (!sh) return say(p.id, 'ここに自分の店はありません');
    const k = c.item, kind = c.kind; p.inv = p.inv || {}; p.cost = p.cost || {};
    if (kind === 'put') { // 棚に並べる
      const have = p.inv[k] || 0; if (!have || !I()[k]) return;
      const room = SK.LV[sh.lv].cap - shelfN(sh); if (room <= 0) return say(p.id, `棚がいっぱいです（${SK.LV[sh.lv].cap}まで。店構えを大きくすると増えます）`);
      const q = Math.min(have, room, c.qty > 0 ? c.qty : have), cst = p.cost[k] != null ? p.cost[k] : I()[k].base;
      takeInv(p.inv, p.cost, k, q); addInv(sh.shelf, sh.cost, k, q, cst);
      return say(p.id, `${I()[k].name}${q}${I()[k].unit}を棚に並べました（1つ${SIM.money(SK.retail(s, k))}ほどで売れます）`);
    }
    if (kind === 'take') { // 棚から下げる
      const have = sh.shelf[k] || 0; if (!have) return;
      const q = Math.min(have, c.qty > 0 ? c.qty : have);
      if (SIM.loadKg && SIM.carryKg && SIM.loadKg(p) + I()[k].wt * q > SIM.carryKg(p) * 1.5) return say(p.id, '荷が重すぎて持てません');
      const cst = sh.cost[k] != null ? sh.cost[k] : I()[k].base; takeInv(sh.shelf, sh.cost, k, q); addInv(p.inv, p.cost, k, q, cst);
      return say(p.id, `${I()[k].name}${q}${I()[k].unit}を棚から下げました`);
    }
    if (kind === 'till') { if (!sh.till) return; p.money += sh.till; say(p.id, `売上${SIM.money(sh.till)}を受け取りました`); sh.till = 0; return; }
    if (kind === 'lv') {
      const nx = SK.LV[sh.lv + 1]; if (!nx) return say(p.id, '店構えはこれ以上大きくできません');
      if (p.money < nx.cost) return say(p.id, `お金が足りません（${SIM.money(nx.cost)}）`);
      p.money -= nx.cost; sh.lv++; p.fame += 2;
      return say(p.id, `店を${nx.name}に建て直しました（棚${nx.cap}・よく売れるようになります）`);
    }
    if (kind === 'hire') {
      if (sh.staff >= sh.lv * 2) return say(p.id, `この店構えでは奉公人は${sh.lv * 2}人までです`);
      if (p.money < SK.staffCost) return say(p.id, `お金が足りません（${SIM.money(SK.staffCost)}）`);
      p.money -= SK.staffCost; sh.staff++;
      return say(p.id, `奉公人を1人雇いました（${sh.staff}人・給金は月${SIM.money(SK.wage)}ずつ売上から）`);
    }
    if (kind === 'fire') { if (!sh.staff) return; sh.staff--; return say(p.id, `奉公人に暇を出しました（${sh.staff}人）`); }
    if (kind === 'send') { // ほかの店へ送る
      const to = SIM.settlement(w, c.id), dst = to && shops(p)[to.id]; if (!dst || to.id === s.id) return;
      const have = sh.shelf[k] || 0; if (!have) return; const q = Math.min(have, c.qty > 0 ? c.qty : have);
      const fee = Math.max(10, Math.round(I()[k].base * q * SK.sendFee)); if (p.money < fee) return say(p.id, `送り賃が足りません（${SIM.money(fee)}）`);
      p.money -= fee; const cst = sh.cost[k] != null ? sh.cost[k] : I()[k].base; takeInv(sh.shelf, sh.cost, k, q);
      const dd = SK.sendDays(s, to); (p.shopSend = p.shopSend || []).push({ to: to.id, item: k, qty: q, cost: cst, arr: day(w) + dd });
      return say(p.id, `${I()[k].name}${q}${I()[k].unit}を${to.name}の店へ送りました（送り賃${SIM.money(fee)}・${dd}日ほどで着きます）`);
    }
  };
  // 店をたたむ（品は手元へ。本店をたたむと店主をやめて浪人に）
  C.shopClose = (w, p) => {
    const [s, sh] = myShop(w, p); if (!sh) return; const S = owner(p), main = S.house === s.id;
    if (main && Object.keys(shops(p)).length > 1) return say(p.id, '本店をたたむのは、支店をすべてたたんでからです');
    const K = (p.kura = p.kura || { money: 0, inv: {}, cost: {} }); K.inv = K.inv || {}; K.cost = K.cost || {};
    for (const k in sh.shelf) addInv(K.inv, K.cost, k, sh.shelf[k], sh.cost[k] != null ? sh.cost[k] : I()[k].base);
    p.money += sh.till; delete shops(p)[s.id];
    if (main) { p.sho = { prev: S.prev, prevRank: S.prevRank }; p.goyo = null; p.kaigo = null; p.status = '浪人'; say(p.id, `${S.ya}をたたみ、浪人に戻りました（棚の品は自宅の物置へ送りました）`); }
    else say(p.id, `${s.name}の支店をたたみました（棚の品は自宅の物置へ送りました）`);
  };

  // ---- 毎日：店が売る・送った品が着く ----
  SIM.systems.push(function shopDay(w) {
    const d = day(w); if (w.shopD === d) return; w.shopD = d;
    for (const p of Object.values(w.players)) {
      if (!owner(p) || !p.shops) continue;
      for (const sid in p.shops) {
        const sh = p.shops[sid], s = SIM.settlement(w, sid); if (!s) continue;
        let n = SK.perDay(w, p, s, sh); n = Math.floor(n) + (SIM.rand(w) < n % 1 ? 1 : 0);
        if (SIM.inWar && SIM.inWar(w, s)) n = Math.floor(n / 2); // 戦の最中は客が減る
        for (let i = 0; i < n; i++) {
          const ks = Object.keys(sh.shelf); if (!ks.length) break;
          let r = SIM.rand(w) * shelfN(sh), k = ks[0]; for (const x of ks) { r -= sh.shelf[x]; if (r < 0) { k = x; break; } }
          const v = SK.retail(s, k); takeInv(sh.shelf, sh.cost, k, 1); sh.till += v; sh.sold += v;
          if (s.stock) s.stock[k] = (s.stock[k] || 0) + 0.5; // 売った分、町の品も少し増える（値が下がる）
        }
      }
      if (p.shopSend && p.shopSend.length) {
        const keep = [];
        for (const t of p.shopSend) {
          if (t.arr > d) { keep.push(t); continue; }
          const sh = p.shops[t.to];
          if (sh) { addInv(sh.shelf, sh.cost, t.item, t.qty, t.cost); say(p.id, `${I()[t.item].name}${t.qty}${I()[t.item].unit}が${nm(w, t.to)}の店に着きました（棚に並べました）`); }
          else { const K = (p.kura = p.kura || { money: 0, inv: {}, cost: {} }); K.inv = K.inv || {}; K.cost = K.cost || {}; addInv(K.inv, K.cost, t.item, t.qty, t.cost); }
        }
        p.shopSend = keep;
      }
    }
  });

  // ---- 毎月：売上が届く・給金・相場の知らせ・御用の扶持 ----
  SIM.systems.push(function shopMonth(w) {
    const d = day(w);
    for (const p of Object.values(w.players)) {
      const S = owner(p);
      if (p.goyo && p.goyo.clan && !clanAlive(w, p.goyo.clan)) { say(p.id, `御用を務めていた${p.goyo.name || ''}が滅び、御用商人ではなくなりました`); p.goyo.clan = null; }
      if (!S) continue;
      if (S.md == null) S.md = d;
      if (d - S.md < 30) continue; S.md = d;
      let till = 0, wage = 0, sold = 0;
      for (const sid in shops(p)) { const sh = p.shops[sid]; till += sh.till; sold += sh.sold; wage += sh.staff * SK.wage; sh.till = 0; sh.sold = 0; }
      const net = till - wage; p.money += net;
      say(p.id, `各店からこの月の売上${SIM.money(sold)}の残り${SIM.money(net)}が届きました${wage ? `（奉公人の給金${SIM.money(wage)}を払った後）` : ''}`);
      if (p.goyo && p.goyo.clan) { p.money += SK.goyoPay; say(p.id, `${fname(w, p.goyo.clan)}から御用商人の扶持${SIM.money(SK.goyoPay)}が届きました`); }
      const ns = soba(w, p); if (ns.tip) say(p.id, `相場の知らせ：${ns.tip}`);
    }
  });

  // ---- 相場の知らせ：店のある町（会合衆なら大きな町も）の相場 ----
  function soba(w, p) {
    const ids = Object.keys(shops(p)); if (inKaigo(p)) for (const s of w.settlements) if (SGK.DATA.isBig(s) && !ids.includes(s.id)) ids.push(s.id);
    const ss = ids.map((id) => SIM.settlement(w, id)).filter((s) => s && s.stock);
    const ks = Object.keys(I()).filter((k) => !I()[k].mine || ['meat', 'hide', 'mugi', 'daizu', 'daikon', 'egg'].includes(k));
    const rows = ss.map((s) => ({ id: s.id, name: s.name, mine: !!shops(p)[s.id], pr: ks.map((k) => Math.round(SIM.price(s, k))) }));
    let tip = '', best = 1.25;
    if (ss.length >= 2) ks.forEach((k, i) => { let lo = null, hi = null; for (const r of rows) { if (!lo || r.pr[i] < lo.pr[i]) lo = r; if (!hi || r.pr[i] > hi.pr[i]) hi = r; } const q = hi.pr[i] / Math.max(1, lo.pr[i]); if (q > best) { best = q; tip = `${I()[k].name}は${lo.name}で安く（${SIM.money(lo.pr[i])}）、${hi.name}で高い（${SIM.money(hi.pr[i])}）`; } });
    return { ks, rows, tip };
  }

  // ---- 御用商人 ----
  function goyoOrders(w, clan) {
    w.goyoOrd = w.goyoOrd || {}; const per = Math.floor(day(w) / 30); let O = w.goyoOrd[clan];
    if (O && O.per === per) return O.list;
    const pool = ['rice', 'rice', 'salt', 'sake', 'cotton', 'firewood', 'tea']; let h = 0; for (const ch of clan + per) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    const list = [];
    for (let i = 0; i < 2; i++) {
      h = (Math.imul(h ^ (h >>> 13), 1103515245) + 12345) >>> 0; const k = pool[h % pool.length], it = I()[k];
      const qty = k === 'rice' ? 40 + (h >>> 8) % 41 : k === 'firewood' ? 20 + (h >>> 8) % 21 : 6 + (h >>> 8) % 10;
      list.push({ id: `${clan}-${per}-${i}`, item: k, qty, pay: Math.round(it.base * qty * 1.4 / 10) * 10, fav: 12 + Math.round(it.base * qty / 600), done: false, label: k === 'rice' ? '兵糧' : '御用の品' });
    }
    w.goyoOrd[clan] = { per, list }; return list;
  }
  const atClan = (w, p) => { const s = here(w, p); return s && s.type === 'castle' && s.owner && w.factions[s.owner] ? s : null; };
  const needGoyo = (p) => { const S = sho(p); if (!S) return '御用を務められるのは商人だけです'; if (S.rank < SK.goyoRank) return `御用を願い出られるのは${GS.RANKS[SK.goyoRank].name}からです`; return ''; };
  const favUp = (w, p, clan, n) => {
    p.goyo = p.goyo || { clan: null, fav: {} }; p.goyo.fav = p.goyo.fav || {};
    const f = (p.goyo.fav[clan] = Math.min(200, (p.goyo.fav[clan] || 0) + n));
    if (p.goyo.clan !== clan && f >= SK.goyoNeed && !(p.goyo.hint || {})[clan]) { p.goyo.hint = Object.assign(p.goyo.hint || {}, { [clan]: 1 }); say(p.id, `${fname(w, clan)}の覚えがめでたくなりました。その家の城で御用商人を願い出られます`); }
  };
  C.goyoGift = (w, p, c) => {
    const s = atClan(w, p); if (!s || p.battle) return; const e = needGoyo(p); if (e) return say(p.id, e);
    const q = Math.max(1000, Math.floor(+c.qty || 0)); if (p.money < q) return say(p.id, `お金が足りません（${SIM.money(q)}）`);
    p.money -= q; const n = Math.round(q / SK.giftPer); favUp(w, p, s.owner, n);
    const f = w.factions[s.owner]; if (f && f.money != null) f.money += q; // 献金は大名家の蔵へ
    say(p.id, `${fname(w, s.owner)}に${SIM.money(q)}を献金しました（覚え+${n}・${p.goyo.fav[s.owner]}／${SK.goyoNeed}）`);
  };
  C.goyoDeliver = (w, p, c) => {
    const s = atClan(w, p); if (!s || p.battle) return; const e = needGoyo(p); if (e) return say(p.id, e);
    const o = goyoOrders(w, s.owner).find((x) => x.id === c.id); if (!o || o.done) return;
    const it = I()[o.item], have = (p.inv || {})[o.item] || 0; if (have < o.qty) return say(p.id, `${it.name}が${o.qty - have}${it.unit}足りません`);
    takeInv(p.inv, p.cost, o.item, o.qty); o.done = true; p.money += o.pay; favUp(w, p, s.owner, o.fav);
    say(p.id, `${fname(w, s.owner)}に${it.name}${o.qty}${it.unit}を納め、${SIM.money(o.pay)}を受け取りました（覚え+${o.fav}）`);
    if (SIM.shoMerit) SIM.shoMerit(w, p, Math.round(o.fav / 2), `${fname(w, s.owner)}の御用`);
  };
  C.goyoAsk = (w, p) => {
    const s = atClan(w, p); if (!s || p.battle) return; const e = needGoyo(p); if (e) return say(p.id, e);
    const f = ((p.goyo || {}).fav || {})[s.owner] || 0; if (f < SK.goyoNeed) return say(p.id, `まだ覚えが足りません（${f}／${SK.goyoNeed}）`);
    const old = p.goyo.clan; p.goyo.clan = s.owner; p.goyo.name = fname(w, s.owner); p.fame += 5;
    say(p.id, `${fname(w, s.owner)}の御用商人になりました！（名声+5）${old && old !== s.owner ? `　${fname(w, old)}の御用は辞しました` : ''}　領内の店がよく売れ、この家の市場で安く買え、毎月扶持が出ます`);
  };
  C.goyoQuit = (w, p) => { if (!p.goyo || !p.goyo.clan) return; say(p.id, `${fname(w, p.goyo.clan)}の御用を辞しました`); p.goyo.clan = null; };
  { const b0 = SIM.buyPrice; SIM.buyPrice = (s, k, p) => { const v = b0(s, k, p); return p && p.goyo && p.goyo.clan && s && s.owner === p.goyo.clan ? Math.ceil(v * SK.goyoBuy) : v; }; }

  // ---- 茶会 ----
  C.chakai = (w, p) => {
    const [s, sh] = myShop(w, p); if (!sh || p.busy) return say(p.id, '茶会は自分の店で開けます');
    const T = p.takara || {}, tea = SK.CHAKI.filter((k) => T[k] > 0), nb = Object.keys(T).filter((k) => T[k] > 0 && GS.TAKARA[k] && GS.TAKARA[k].nanban);
    if (!tea.length) return say(p.id, '茶会を開くには茶器（茶入・茶碗・掛軸・香炉のどれか）が要ります。大きな町の豪商で買えます');
    const d = day(w), CK = (p.chakai = p.chakai || { last: -999, n: 0 });
    if (d - CK.last < SK.chaGap) return say(p.id, `次の茶会はあと${SK.chaGap - (d - CK.last)}日ほどしてから`);
    if (p.money < SK.chaCost) return say(p.id, `支度のお金が足りません（${SIM.money(SK.chaCost)}）`);
    p.money -= SK.chaCost; CK.last = d; CK.n++;
    const score = tea.length * 2 + nb.length + sh.lv - 1 + (inKaigo(p) ? 2 : 0);
    const fame = 1 + Math.floor(score / 2); p.fame += fame;
    const hs = Object.keys(GS.HOUSES); const g = []; while (g.length < 2) { const h = hs[Math.floor(SIM.rand(w) * hs.length)]; if (!g.includes(h)) g.push(h); }
    const en = 4 + score; for (const h of g) addEn(p, h, en);
    const res = [`名声+${fame}`, `${g.map((h) => GS.houseName(h)).join('・')}との縁+${en}`];
    const r = SIM.rand(w);
    if (r < 0.35) { // 客の豪商が家宝を安く譲ると言う
      const ks = Object.keys(GS.TAKARA).filter((k) => !(T[k] > 0)); const k = ks.length ? ks[Math.floor(SIM.rand(w) * ks.length)] : null;
      if (k) { p.chaOffer = { k, price: Math.round(GS.TAKARA[k].price * 0.75), from: g[0], until: d + 20 }; res.push(`${GS.houseName(g[0])}が「${GS.TAKARA[k].name}」を${SIM.money(p.chaOffer.price)}で譲ってもよいと言っています（20日のうちに、この店で）`); }
    } else if (r < 0.6 && s.owner && w.factions[s.owner]) { // 城から来た客
      favUp(w, p, s.owner, 10); res.push(`${fname(w, s.owner)}の家臣が客に来て、その家の覚えがよくなりました（+10）`);
    } else { const ns = soba(w, p); if (ns.tip) res.push(`客の話では、${ns.tip}とのこと`); }
    CK.res = { d, list: res, tea: tea.map((k) => GS.TAKARA[k].name) };
    say(p.id, `${s.name}の店で茶会を開きました。${tea.map((k) => GS.TAKARA[k].name).join('・')}を飾り、客をもてなしました（${res.join('／')}）`);
  };
  C.chaBuy = (w, p) => {
    const [s, sh] = myShop(w, p), o = p.chaOffer; if (!sh || !o) return; if (day(w) > o.until) { p.chaOffer = null; return say(p.id, '譲ってもらう話は流れてしまいました'); }
    if (p.money < o.price) return say(p.id, `お金が足りません（${SIM.money(o.price)}）`);
    p.money -= o.price; p.chaOffer = null; const f = GS.gotTakara(p, o.k);
    say(p.id, `${GS.houseName(o.from)}から「${GS.TAKARA[o.k].name}」を譲り受けました${f ? `（${f}）` : ''}`);
  };

  // ---- 会合衆（堺） ----
  const kaigoNeed = (w, p) => {
    const S = owner(p), out = [];
    if (!S) out.push('店主であること'); if (Object.keys(shops(p)).length < 2) out.push('店を2つ以上');
    if (((p.en || {})[SK.kaigoTown] || 0) < SK.kaigoEn) out.push(`${GS.houseName(SK.kaigoTown)}との縁${SK.kaigoEn}以上（茶会や家宝の買い物で深まる）`);
    if (p.fame < SK.kaigoFame) out.push(`名声${SK.kaigoFame}以上`);
    return out;
  };
  C.kaigoJoin = (w, p) => {
    const s = here(w, p); if (!s || s.id !== SK.kaigoTown || inKaigo(p)) return;
    const nd = kaigoNeed(w, p); if (nd.length) return say(p.id, `会合衆に加わるには：${nd.join('・')}`);
    if (p.money < SK.kaigoFee) return say(p.id, `入り銀が足りません（${SIM.money(SK.kaigoFee)}）`);
    p.money -= SK.kaigoFee; p.kaigo = { since: day(w), per: -1 }; p.fame += 8;
    say(p.id, `${s.name}の会合衆に加わりました！（名声+8）　店がよく売れ、大きな町の相場が分かり、豪商の家宝が安くなります。月に一度、会合に出ると配当があります`);
  };
  C.kaigoMeet = (w, p) => {
    const s = here(w, p); if (!s || s.id !== SK.kaigoTown || !inKaigo(p)) return;
    const per = Math.floor(day(w) / 30); if (p.kaigo.per === per) return say(p.id, '今月の会合にはもう出ました');
    p.kaigo.per = per; const n = Object.keys(shops(p)).length, pay = 1000 * n + Math.round(SIM.rand(w) * 1000) * n;
    p.money += pay; let t = `会合に出て、配当${SIM.money(pay)}を受け取りました`;
    const r = SIM.rand(w);
    if (r < 0.3) { p.fame += 2; t += '。町の普請の相談をまとめ、名声+2'; }
    else if (r < 0.55) { addEn(p, SK.kaigoTown, 5); t += `。${GS.houseName(SK.kaigoTown)}との縁+5`; }
    else if (r < 0.75) { const ks = Object.keys(GS.TAKARA).filter((k) => GS.TAKARA[k].nanban); const k = ks[Math.floor(SIM.rand(w) * ks.length)]; p.chaOffer = { k, price: Math.round(GS.TAKARA[k].price * 0.7), from: SK.kaigoTown, until: day(w) + 20 }; t += `。仲間が「${GS.TAKARA[k].name}」を${SIM.money(p.chaOffer.price)}で譲ると言っています（自分の店で、20日のうちに）`; }
    say(p.id, t);
  };
  C.kaigoQuit = (w, p) => { if (!p.kaigo) return; p.kaigo = null; say(p.id, '会合衆を抜けました'); };

  // 豪商で家宝を買う・頼まれごとを納めると縁が深まる
  { const b = C.buyKaho; C.buyKaho = function (w, p, c) { const m0 = p.money, r = b.apply(this, arguments), s = here(w, p); if (p.money < m0 && s) addEn(p, s.id, 3); return r; }; }
  { const b = C.goshoTask; C.goshoTask = function (w, p, c) { const m0 = p.money, r = b.apply(this, arguments), s = here(w, p); if (p.money > m0 && s) addEn(p, s.id, 2); return r; }; }
  // 店主は仕官できない（店をたたんでから）
  { const b = C.serve; C.serve = function (w, p, c) { if (owner(p)) return say(p.id, '店主のままでは仕官できません（本店をたたんでから）'); return b.apply(this, arguments); }; }
  { const b = C.shoQuit; C.shoQuit = function (w, p, c) { if (owner(p)) return say(p.id, '店主は暇をもらえません（店をたたむと浪人に戻ります）'); return b.apply(this, arguments); }; }

  // ---- 本人に送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const S = sho(p), O = owner(p), s = here(w, p), d = day(w);
    const shopInfo = (sid) => { const sh = p.shops[sid], ss = SIM.settlement(w, sid); return { id: sid, name: ss ? ss.name : sid, main: O && O.house === sid, lv: sh.lv, lvName: SK.LV[sh.lv].name, cap: SK.LV[sh.lv].cap, n: shelfN(sh), staff: sh.staff, till: Math.round(sh.till), sold: Math.round(sh.sold), per: ss ? Math.round(SK.perDay(w, p, ss, sh) * 10) / 10 : 0, goyo: isGoyo(w, p, ss) }; };
    r.me.shoka = {
      own: !!O, ya: O ? O.ya : null, shops: O ? Object.keys(shops(p)).map(shopInfo) : [],
      send: (p.shopSend || []).map((t) => ({ to: nm(w, t.to), name: I()[t.item].name, qty: t.qty, left: Math.max(0, t.arr - d) })),
      goyo: p.goyo && p.goyo.clan ? { clan: p.goyo.clan, name: fname(w, p.goyo.clan) } : null,
      en: Object.entries(p.en || {}).filter(([, n]) => n > 0).map(([id, n]) => ({ id, name: GS.houseName(id), n })),
      kaigo: inKaigo(p), chakai: p.chakai ? { left: Math.max(0, SK.chaGap - (d - p.chakai.last)), n: p.chakai.n, res: p.chakai.res || null } : { left: 0, n: 0, res: null },
      offer: p.chaOffer && p.chaOffer.until >= d ? { name: GS.TAKARA[p.chaOffer.k].name, price: p.chaOffer.price, from: GS.houseName(p.chaOffer.from), left: p.chaOffer.until - d } : null,
      soba: O || inKaigo(p) ? (() => { const sb = soba(w, p); return { ks: sb.ks.map((k) => ({ k, name: I()[k].name, base: I()[k].base })), rows: sb.rows, tip: sb.tip }; })() : null,
    };
    if (r.here && s && S) {
      if (shopOk(s)) {
        const sh = O && shops(p)[s.id];
        r.here.mise = {
          can: !sh && (O ? Object.keys(shops(p)).length <= SK.maxBranch : S.rank >= 4), cost: O ? SK.branchCost : SK.openCost, branch: !!O, rank: S.rank, ya: O ? O.ya : yaName(s),
          shop: sh ? Object.assign(shopInfo(s.id), {
            shelf: Object.entries(sh.shelf).map(([k, n]) => ({ k, name: I()[k].name, unit: I()[k].unit, n, cost: Math.round(sh.cost[k] || 0), price: SK.retail(s, k) })),
            next: SK.LV[sh.lv + 1] ? { name: SK.LV[sh.lv + 1].name, cost: SK.LV[sh.lv + 1].cost, cap: SK.LV[sh.lv + 1].cap } : null, maxStaff: sh.lv * 2,
            to: Object.keys(shops(p)).filter((id) => id !== s.id).map((id) => { const t = SIM.settlement(w, id); return { id, name: t ? t.name : id, days: t ? SK.sendDays(s, t) : 0 }; }),
            inv: Object.entries(p.inv || {}).filter(([k, n]) => n > 0 && I()[k]).map(([k, n]) => ({ k, name: I()[k].name, unit: I()[k].unit, n, price: SK.retail(s, k), cost: Math.round((p.cost || {})[k] || 0) })),
            tea: SK.CHAKI.filter((k) => (p.takara || {})[k] > 0).length,
          }) : null,
        };
      }
      if (s.type === 'castle' && s.owner && w.factions[s.owner]) {
        const fav = ((p.goyo || {}).fav || {})[s.owner] || 0;
        r.here.goyo = { clan: s.owner, name: fname(w, s.owner), fav, need: SK.goyoNeed, mine: !!(p.goyo && p.goyo.clan === s.owner), err: needGoyo(p), orders: goyoOrders(w, s.owner).map((o) => Object.assign({}, o)) };
      }
    }
    if (r.here && s && s.id === SK.kaigoTown && r.here.gosho) r.here.kaigo = { member: inKaigo(p), need: kaigoNeed(w, p), fee: SK.kaigoFee, met: inKaigo(p) && p.kaigo.per === Math.floor(d / 30) };
    if (r.here && r.here.gosho && s) r.here.gosho.en = (p.en || {})[s.id] || 0;
    return r;
  };
})();
