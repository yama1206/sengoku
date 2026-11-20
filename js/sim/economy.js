// 第2段階：市場・依頼・仕事・会話
(function () {
  const SIM = SGK.SIM;
  const I = () => SGK.DATA.items;
  const SIZE = { castle: 1, town: 1.5, village: 0.6 };
  // 0.74.0 荷は個数の上限なし。重さ(kg)で管理し、重いほど移動が遅くなる（SIM.loadKg・SIM.loadSpeed は equip.js）

  // ---- プレイヤーへのお知らせ（セーブには入れない） ----
  SIM.out = {};
  SIM.say = (pid, text) => (SIM.out[pid] = SIM.out[pid] || []).push(text);
  SIM.drain = (pid) => { const a = SIM.out[pid] || []; delete SIM.out[pid]; return a; };
  SIM.money = (m) => { m = Math.floor(m); return m >= 1000 ? `${Math.floor(m / 1000)}貫${m % 1000 ? (m % 1000) + '文' : ''}` : `${m}文`; };
  // 持ち物の平均買値（p.cost[品] = 1つあたりの文）。買うたびに加重平均、手放して0になったら消す
  function addCost(p, k, q, unit) { p.cost = p.cost || {}; const have = p.inv[k] || 0, old = p.cost[k] != null ? p.cost[k] : unit; p.cost[k] = (old * have + unit * q) / (have + q); }
  function dropCost(p, k) { if (!p.inv[k] && p.cost) delete p.cost[k]; }
  SIM.invKg = (p) => Object.entries(p.inv || {}).reduce((a, [k, b]) => a + b * ((I()[k] && I()[k].wt) || 0), 0); // 0.74.0 荷の重さ
  SIM.room = () => Infinity; // 0.74.0 個数の上限はなし
  const fullMsg = (k) => k === 'rice' ? '米はこれ以上持てません' : 'これ以上は持てません';
  const pick = (w, arr) => arr[Math.floor(SIM.rand(w) * arr.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---- 足りない項目を補う（新規ワールド・古いセーブの両方に使う） ----
  SIM.ensure = function (w) {
    w.schema = SGK.SAVE_SCHEMA;
    syncMap(w);
    if (w.day == null) w.day = Math.floor(w.time.min / 1440);
    w.jobs = w.jobs || {};
    // 2.32.0 鉄（品物）をなくした：古いセーブの在庫・生産・荷・依頼・取引から消し、持っていた鉄は元値（1貫800文）で買い取る
    for (const s of w.settlements) { if (s.stock) delete s.stock.iron; if (s.prod) delete s.prod.iron; }
    for (const p of Object.values(w.players)) for (const box of [p, p.kura]) { if (!box || !box.inv || !box.inv.iron) continue; const n = box.inv.iron; delete box.inv.iron; if (box.cost) delete box.cost.iron; p.money = (p.money || 0) + n * 800; if (SIM.say) SIM.say(p.id, `鉄は市場で扱わなくなりました。持っていた鉄${n}貫を${SIM.money ? SIM.money(n * 800) : n * 800 + '文'}で買い取りました`); }
    for (const p of Object.values(w.players)) { if (p.cost) delete p.cost.iron; if (p.quests) p.quests = p.quests.filter((q) => q.item !== 'iron'); }
    for (const id in w.jobs || {}) if (w.jobs[id] && w.jobs[id].item === 'iron') delete w.jobs[id];
    for (const id in w.offers || {}) if (w.offers[id] && w.offers[id].item === 'iron') delete w.offers[id];
    for (const n of Object.values(w.npcs || {})) if (n.cargo && n.cargo.item === 'iron') n.cargo = null;
    for (const s of w.settlements) {
      const d = SGK.DATA.settlements.find((x) => x.id === s.id) || {};
      s.prod = s.prod || d.prod || {};
      if (!Object.keys(s.prod).length) s.prod = JSON.parse(JSON.stringify(d.prod && Object.keys(d.prod).length ? d.prod : SGK.DATA.defProd(s))); // 古いセーブで生産のない拠点に付ける
      { const tk = SGK.DATA.toku(s); if (s.type === 'village') for (const k in s.prod) if (k !== 'rice' && k !== 'firewood' && k !== tk && s.prod[k] > 3) s.prod[k] = 3; const want = I()[tk] && I()[tk].mine ? 1.5 : 7; if (tk && !((s.prod[tk] || 0) >= want)) s.prod[tk] = want; } // 2.32.1 鉄鉱石の特産は掘り出す量なので少なめ // 1.6.77 特産は多く作る（古いセーブも）。1.6.87 特産でなくなった品は3まで
      SIM.villageFood(s);
      s.size = s.size || SIZE[s.type]; if (SGK.DATA.isBig(s)) s.size = Math.max(s.size, 3); // 1.6.78 大きな町は品物が多い
      s.stock = s.stock || {};
      for (const k in I()) if (s.stock[k] == null) s.stock[k] = Math.max(6, Math.round(target(s, k))); // 1.6.88 開始時はどこも目安どおりの在庫（相場どおりの値段から始まる）
    }
    for (const p of Object.values(w.players)) SIM.ensurePlayer(p);
    if (!Object.keys(w.jobs).length) w.settlements.forEach((s) => { genJob(w, s); genJob(w, s); });
    return w;
  };
  // 地図の範囲が変わったとき：座標をずらし、新しい勢力・人物・拠点を足す（拠点の位置は常にデータに合わせる）
  function syncMap(w) {
    const D = SGK.DATA, O = D.mapOrigin, o = w.mapOrigin || { lon: 136.55, lat: 35.5 };
    if (o.lon !== O.lon || o.lat !== O.lat) {
      const dx = (o.lon - O.lon) * 91, dy = (O.lat - o.lat) * 111;
      for (const e of [...Object.values(w.players), ...Object.values(w.npcs)]) {
        for (const [a, b] of [['x', 'y'], ['tx', 'ty'], ['lx', 'ly'], ['hx', 'hy']]) if (e[a] != null) { e[a] += dx; e[b] += dy; }
        if (e.path) e.path = e.path.map(([x, y]) => [x + dx, y + dy]);
      }
    }
    w.mapOrigin = { lon: O.lon, lat: O.lat }; w.scenario = D.scenario;
    for (const k in D.factions) if (!w.factions[k]) w.factions[k] = JSON.parse(JSON.stringify(D.factions[k]));
    for (const k in D.people) if (!w.people[k]) w.people[k] = JSON.parse(JSON.stringify(D.people[k]));
    for (const d of D.settlements) {
      let s = w.settlements.find((x) => x.id === d.id);
      if (!s) { s = JSON.parse(JSON.stringify(d)); w.settlements.push(s); const cs = d.castle && w.settlements.find((x) => x.id === d.castle); if (cs) s.owner = cs.owner; /* 1.6.24 足した村は今の城の持ち主に。行商人は増やさない */ if (!d.castle) SIM.spawnNpc(w, s.type === 'castle' ? 'patrol' : 'merchant', s.type === 'castle' ? s.owner : null, s); }
      s.x = d.x; s.y = d.y; if (d.castle) s.name = d.name; /* 1.6.29 村の名前を実在の地名に（古いセーブも） */
    }
  }
  SIM.ensurePlayer = (p) => { if (p.money == null) p.money = 10000; /* 1.6.91 はじめの所持金10貫 */ p.inv = p.inv || {}; p.quests = p.quests || []; if (p.fame == null) p.fame = 0; if (p.busy === undefined) p.busy = null; };

  const pm = (s, k) => (s.prod[k] || 0) * (s.type === 'village' ? 0.6 : 1) * /* 1.6.24 村が増えたので村1つの生産は0.6倍 */ (SIM.prodMul ? SIM.prodMul(s) : 1) * (SIM.prodItemMul ? SIM.prodItemMul(s, k) : 1); // 0.71.0 政策・豊作凶作 // 0.41.0 投資で生産が増える
  // 0.70.0 人が多い拠点ほどよく使う（人口の比の平方根で増える）
  const sz = (s) => s.size * Math.sqrt(SIM.popF ? SIM.popF(s) : 1);
  // 2.59.0 拠点の種類ごとの使う量（use があればそれ、なければ cons）と、城の守備兵が食べる米（40人で1日1俵）
  const consOf = (s, k) => { const it = I()[k]; return it.use ? it.use[s.type] || 0 : it.cons; };
  SIM.consOf = consOf;
  // ---- 2.60.0 食料：米・麦・大豆・大根・肉・卵（items の food＝1つで何人日ぶんか）。兵は安い食料から食べる（米と麦が先、肉・卵はあと） ----
  SIM.FOODS = () => Object.keys(I()).filter((k) => I()[k].food > 0).sort((a, b) => I()[a].base / I()[a].food - I()[b].base / I()[b].food);
  SIM.GAR_FOOD = ['rice', 'mugi', 'daizu', 'daikon']; // 城の守備兵・軍勢が食べる順（町の人が食べる麦などを先に食べつくさないよう、米が先）
  SIM.foodMD = (box, list) => (list || SIM.FOODS()).reduce((a, k) => a + ((box && box[k]) || 0) * I()[k].food, 0); // 人日
  // box から md 人日ぶん食べる。whole なら1つ単位で（プレイヤーの荷）、そうでなければ端数も（拠点の蔵）。戻り値：{ ate: {品: 数}, left: 食べられなかった人日 }
  SIM.eatFood = (box, md, whole, order) => { // order：食べる順（なければ安い順）
    const ate = {};
    for (const k of order || SIM.FOODS()) {
      if (md <= 1e-9) break; if (!(I()[k] && I()[k].food > 0)) continue;
      const f = I()[k].food, have = (box && box[k]) || 0; if (have <= 0) continue;
      let q = Math.min(have, md / f); if (whole) q = Math.min(have, Math.floor(md / f + 1e-9)); if (q <= 0) continue;
      box[k] = have - q; md -= q * f; ate[k] = q;
    }
    return { ate, left: md };
  };
  SIM.garRice = (s) => (s.type === 'castle' && SIM.garrison ? SIM.garrison(s) / 40 : 0);
  function target(s, k) { return (consOf(s, k) * sz(s) + pm(s, k) + (k === 'rice' ? SIM.garRice(s) : 0)) * 12 + 4; }
  SIM.stockTarget = target;
  // 0.70.0 物資のそろい具合（0〜1.3）。品ごとに 在庫÷目安 を1.3までで平均。米は2倍に数える
  SIM.supplyF = (s) => { if (!s || !s.stock) return 1; let a = 0, n = 0; for (const k in I()) { const wt = k === 'rice' ? 2 : 1; a += Math.min(1.3, s.stock[k] / target(s, k)) * wt; n += wt; } return n ? a / n : 1; };
  SIM.price = (s, k) => { const b = I()[k].base * (SGK.DATA.toku(s) === k ? 0.8 : 1); /* 1.6.77 村の特産は2割安い */ return Math.max(b * 0.4, Math.min(b * 3, b * Math.sqrt(target(s, k) / (s.stock[k] + 1)))); };
  SIM.cargoPrice = (k, p) => Math.ceil(I()[k].base * 0.95 * (p && SIM.tradeMod ? SIM.tradeMod(p, 'buy') : 1));
  SIM.buyPrice = (s, k, p) => Math.ceil(SIM.price(s, k) * 1.1 * (p && SIM.tradeMod ? SIM.tradeMod(p, 'buy') : 1));
  SIM.sellPrice = (s, k, p) => Math.floor(SIM.price(s, k) * 0.9 * (p && SIM.tradeMod ? SIM.tradeMod(p, 'sell') : 1));

  // ---- 依頼の作成 ----
  function giverOf(w, s) { return s.type === 'castle' && s.lord ? (w.people[s.lord] || {}).name + '様' : s.type === 'town' ? '町の商家' : '村の名主'; }
  // 依頼の名声：ふつうは+0.5、遠く（80km以上）への届け物は+1
  function jobFame(w, q) { const a = SIM.settlement(w, q.from), b = q.to && SIM.settlement(w, q.to); return q.type === 'deliver' && a && b && dist(a, b) >= 80 ? 1 : 0.5; }
  function genJob(w, s) {
    const id = 'j' + w.nextId++, now = w.time.min, giver = giverOf(w, s);
    let job = SIM.extraJob ? SIM.extraJob(w, s, id, giver) : null; // 0.40.0 新しい種類の依頼（quest.js）
    if (job) {} else if (SIM.rand(w) < 0.8) { // 0.74.1 調達の依頼を減らす（以前は届け物55%・調達45%）
      const r = SIM.rand(w), lim = r < 0.6 ? 40 : 100; // 6割は40km以内、残りも100km以内（0.74.3 遠くへの依頼はなし）
      const ok = (x) => x.id !== s.id && !SIM.foeDest(w, s, x);
      let tos = w.settlements.filter((x) => ok(x) && dist(s, x) < lim); if (!tos.length) tos = w.settlements.filter((x) => ok(x) && dist(s, x) < 100); if (!tos.length) return;
      const to = pick(w, tos); const d = dist(s, to);
      job = { id, type: 'deliver', from: s.id, to: to.id, days: Math.ceil(d / 20) + 2, reward: Math.round((60 + d * 12) / 10) * 10, title: `${to.name}へ届け物`, giver };
    } else {
      const k = pick(w, Object.keys(I()).filter((k) => !(s.prod[k] > 0) && !I()[k].mine)); const it = I()[k]; const qty = 1 + Math.floor(SIM.rand(w) * (it.wt >= 4 ? 3 : 4)); // 0.74.1 必要数を少なく（以前は4〜12、重い品は1〜3・軽い品は1〜4）
      job = { id, type: 'procure', from: s.id, item: k, qty, days: 10, reward: Math.round((it.base * qty * 1.4 + 100) / 10) * 10, title: `${it.name}${qty}${it.unit}の調達`, giver };
    }
    job.reward = Math.max(500, job.reward * 2); /* 1.6.8 依頼の報酬を2倍。1.6.35 最低500文 */ job.expires = now + 5 * 1440;
    w.jobs[id] = job;
  }

  // ---- 2.59.0 城の守備兵が城の米を食べる。囲まれていて米が尽きると、守備兵が逃げ出す ----
  function garEat(w, s, LG) {
    const need = SIM.garRice(s); if (!need) return;
    const r = SIM.eatFood(s.stock, need * 40, false, SIM.GAR_FOOD); // 2.60.0 米が先、足りなければ麦・大豆・大根
    if (SIM.LEDGER) for (const k in r.ate) SIM.LEDGER.note('stock', k, '守備兵の兵糧', -r.ate[k]);
    const eat = need - r.left / 40;
    if (eat >= need * 0.999 || !SIM.inWar(w, s) || !s.gar) { s.starve = 0; return; }
    const lack = 1 - eat / need, before = SIM.garrison(s); s.starve = (s.starve || 0) + 1;
    for (const k in s.gar) { s.gar[k] = Math.floor(s.gar[k] * (1 - 0.12 * lack)); if (s.gar[k] <= 0) delete s.gar[k]; }
    const lost = before - SIM.garrison(s);
    if (lost > 0 && s.starve === 1) for (const p of Object.values(w.players)) if (p.clan === s.owner) SIM.say(p.id, `${s.name}の兵糧が尽きました！ 守備兵が逃げ出しています（${lost}人）。食料（米・麦など）を運び込まないと日に日に減ります`);
  }
  // 2.59.0 後から足した食べ物（麦・大豆・大根・卵・肉・毛皮）を村でも少し作る（古いセーブにも足す）
  const hashN = (id, n) => { let h = n * 7919; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };
  SIM.villageFood = (s) => {
    if (s.type !== 'village' || s.food2) return; s.food2 = 1;
    const add = (k, v, rate, n) => { if (hashN(s.id, n) < rate && !(s.prod[k] > 0)) s.prod[k] = v; };
    add('mugi', 2, 0.5, 11); add('daizu', 1, 0.4, 12); add('daikon', 1.5, 0.5, 13); add('egg', 2, 0.4, 14);
    const yama = SGK.DATA.toku(s) === 'ironore' || hashN(s.id, 15) < 0.2; if (yama) { add('meat', 0.3, 1, 16); add('hide', 0.15, 1, 17); }
  };

  // ---- 1日ごとの処理 ----
  function daily(w) {
    const now = w.time.min;
    const LG = SIM.LEDGER && SIM.LEDGER.active(w) ? {} : null; /* 2.58.0 帳簿：生産・消費・あふれを分けて数える */
    for (const s of w.settlements) { const wr = SIM.inWar(w, s); for (const k in I()) { const t = target(s, k), s0 = s.stock[k], add = wr ? 0 : pm(s, k); s.stock[k] = Math.max(0, s.stock[k] + add - consOf(s, k) * sz(s)); const s1 = s.stock[k]; if (s.stock[k] > t * 1.3) s.stock[k] -= (s.stock[k] - t * 1.3) * 0.25;
      if (LG) { const g = (LG[k] = LG[k] || [0, 0, 0]); g[0] += add; g[1] += s0 + add - s1; g[2] += s1 - s.stock[k]; } } }
    for (const s of w.settlements) if (s.type === 'castle') garEat(w, s, LG);
    if (LG) for (const k in LG) { SIM.LEDGER.note('stock', k, '拠点の生産', LG[k][0]); SIM.LEDGER.note('stock', k, '拠点の消費', -LG[k][1]); SIM.LEDGER.note('stock', k, '在庫のあふれ（消える）', -LG[k][2]); } // 1.6.90 攻城戦の準備をされている城は作らない（使うだけ）。目安の1.3倍を超えた分は傷んだり蔵からよそへ流れたりして減る
    share(w);
    for (const j of Object.values(w.jobs)) if (j.expires < now) delete w.jobs[j.id];
    const JC = {}; for (const j of Object.values(w.jobs)) JC[j.from] = (JC[j.from] || 0) + 1; /* 1.6.50 数えるのを1回に */
    for (const s of w.settlements) {
      const n = JC[s.id] || 0;
      if (n < 3 && SIM.rand(w) < 0.5) genJob(w, s);
    }
    for (const p of Object.values(w.players)) {
      p.quests = p.quests.filter((q) => {
        if (q.deadline >= now) return true;
        p.fame = Math.max(0, p.fame - 1); SIM.say(p.id, `依頼「${q.title}」の期限が過ぎてしまいました（名声-1）`); if (SIM.sellQBack) SIM.sellQBack(w, p, q); return false;
      });
    }
  }

  SIM.systems.push(
    function dayTick(w) { const d = Math.floor(w.time.min / 1440); while (w.day < d) { w.day++; daily(w); } },
    function busyTick(w) {
      for (const p of Object.values(w.players)) {
        const b = p.busy; if (!b || w.time.min < b.until) continue;
        p.busy = null;
        if ((b.kind === 'labor' || b.kind === 'gather') && SIM.workGrow) SIM.workGrow(w, SIM.settlement(w, b.at), (b.until - b.t0) / 60 || 6, p.id); /* 1.6.44 */
        if (b.kind === 'labor') { p.money += b.pay; SIM.say(p.id, `人足仕事を終えました（${SIM.money(b.pay)}）`); }
        if (b.kind === 'gather') {
          const n = b.amount;
          if (n > 0) { addCost(p, 'firewood', n, 0); p.inv.firewood = (p.inv.firewood || 0) + n; SIM.say(p.id, `薪を${n}束集めました`); } else SIM.say(p.id, '荷がいっぱいで薪を持てませんでした');
        }
      }
    },
  );

  // ---- NPC商人：出発地の余っている品を運ぶ ----
  SIM.merchantDepart = (w, n, from) => {
    if (!from) return;
    let best = null, br = 1.1;
    for (const k in I()) { const r = from.stock[k] / target(from, k); if (r > br) { br = r; best = k; } }
    if (best) { const q = Math.min(30, Math.floor(from.stock[best] - target(from, best) * 0.8)); if (q > 0) { from.stock[best] -= q; n.cargo = { item: best, qty: q }; if (SIM.LEDGER) SIM.LEDGER.note('stock', best, '商人が積む', -q); } }
  };
  // 行き先：積んだ品がいちばん足りない拠点を選びやすい（町を優先）
  SIM.inWar = (w, s) => !!(s && SIM.besieged && SIM.besieged(w, s.id)); // 1.6.90 攻城戦の準備をされている城（囲まれている）
  SIM.merchantDest = (w, n, cands) => {
    if (n.cargo) { const ok = cands.filter((s) => !SIM.inWar(w, s)); if (ok.length) cands = ok; } // 1.6.90 荷を囲まれている城へは運ばない
    if (!n.cargo) return cands[Math.floor(SIM.rand(w) * cands.length)];
    let best = null, bs = -1;
    for (const s of cands) { const sc = (target(s, n.cargo.item) / (s.stock[n.cargo.item] + 1)) * (s.type === 'town' ? 1.5 : 1) * (0.7 + SIM.rand(w) * 0.6); if (sc > bs) { bs = sc; best = s; } }
    return best;
  };
  // 近くの拠点どうしで少しずつ融通しあう（街道のない城にも物が届くように）
  let NB = null, NBn = 0;
  function neighbors(w) {
    if (NB && NBn === w.settlements.length) return NB;
    NB = []; NBn = w.settlements.length; const L = w.settlements;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) < 50) NB.push([i, j]);
    return NB;
  }
  function share(w) {
    const L = w.settlements;
    for (const [i, j] of neighbors(w)) {
      const a = L[i], b = L[j]; if (!a || !b) continue;
      for (const k in I()) {
        const ta = target(a, k), tb = target(b, k), ra = a.stock[k] / ta, rb = b.stock[k] / tb;
        if (Math.abs(ra - rb) < 0.4) continue; // 近い拠点どうしの融通は控えめ（地域ごとの値段の差を残す）
        const [hi, lo, th, tl] = ra > rb ? [a, b, ta, tb] : [b, a, tb, ta];
        if (SIM.inWar(w, lo)) continue; // 1.6.90 囲まれている城には流れ込まない
        const q = Math.min(hi.stock[k] * 0.05, Math.abs(ra - rb) * Math.min(th, tl) * 0.05);
        hi.stock[k] -= q; lo.stock[k] += q;
      }
    }
  }
  SIM.merchantArrive = (w, n, to) => { if (n.cargo && to && !SIM.inWar(w, to)) { to.stock[n.cargo.item] += n.cargo.qty; if (SIM.LEDGER) SIM.LEDGER.note('stock', n.cargo.item, '商人が下ろす', n.cargo.qty); n.cargo = null; } };

  // ---- 到着したとき：届け物の依頼を達成 ----
  SIM.onPlayerArrive = (w, p) => {
    const s = SIM.settlement(w, p.at);
    SIM.say(p.id, `${s.name}に着きました`);
    p.quests = p.quests.filter((q) => {
      if (q.type !== 'deliver' || q.to !== p.at) return true;
      const fm = jobFame(w, q); p.money += q.reward; p.fame += fm; SIM.say(p.id, `依頼「${q.title}」達成！ ${SIM.money(q.reward)}を受け取りました（名声+${fm}）`); return false;
    });
  };

  // ---- コマンド ----
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  function needTown(w, p) {
    const s = here(w, p);
    if (!s) { SIM.say(p.id, '拠点の中でないとできません'); return null; }
    if (p.busy) { SIM.say(p.id, '仕事中です'); return null; }
    return s;
  }
  // 調達の依頼が出ている品は、その拠点では買えない（買ってすぐ納品できないように）
  SIM.noBuy = (w, s) => {
    const r = new Set();
    for (const j of Object.values(w.jobs)) if (j.type === 'procure' && j.from === s.id) r.add(j.item);
    for (const p of Object.values(w.players)) for (const q of p.quests || []) if (q.type === 'procure' && q.from === s.id) r.add(q.item);
    return r;
  };
  Object.assign(SIM.commands, {
    buy(w, p, c) {
      const s = needTown(w, p), it = I()[c.item]; if (!s || !it) return;
      if (SIM.noBuy(w, s).has(c.item)) return SIM.say(p.id, `${it.name}はこの拠点で調達の依頼が出ているので、ここでは買えません`);
      const unit = SIM.buyPrice(s, c.item, p);
      const q = Math.min(Math.max(1, +c.qty || 1), Math.floor(s.stock[c.item]), SIM.room(p, c.item), Math.floor(p.money / unit));
      if (q <= 0) return SIM.say(p.id, s.stock[c.item] < 1 ? '在庫がありません' : SIM.room(p, c.item) <= 0 ? fullMsg(c.item) : 'お金が足りません');
      p.money -= unit * q; s.stock[c.item] -= q; addCost(p, c.item, q, unit); p.inv[c.item] = (p.inv[c.item] || 0) + q;
      SIM.say(p.id, `${it.name}を${q}${it.unit}買いました（${SIM.money(unit * q)}）`);
    },
    sell(w, p, c) {
      const s = needTown(w, p), it = I()[c.item]; if (!s || !it) return;
      const q = Math.min(Math.max(1, +c.qty || 1), p.inv[c.item] || 0);
      if (q <= 0) return SIM.say(p.id, '持っていません');
      const unit = SIM.sellPrice(s, c.item, p);
      p.money += unit * q; s.stock[c.item] += q; p.inv[c.item] -= q; if (!p.inv[c.item]) delete p.inv[c.item]; dropCost(p, c.item);
      SIM.say(p.id, `${it.name}を${q}${it.unit}売りました（${SIM.money(unit * q)}）`);
    },
    acceptJob(w, p, c) {
      const s = needTown(w, p), j = w.jobs[c.id]; if (!s || !j || j.from !== s.id || !SIM.jobOk(w, p, j)) return;
      if (p.quests.length >= 3) return SIM.say(p.id, '同時に受けられる依頼は3つまでです');
      delete w.jobs[j.id];
      p.quests.push(Object.assign({}, j, { deadline: w.time.min + j.days * 1440 }));
      SIM.say(p.id, `依頼「${j.title}」を受けました（期限${j.days}日）`);
    },
    deliverJob(w, p, c) {
      const s = needTown(w, p), q = p.quests.find((x) => x.id === c.id); if (!s || !q || q.type !== 'procure') return;
      if (q.from !== s.id) return SIM.say(p.id, `納品先は${SIM.settlement(w, q.from).name}です`);
      if ((p.inv[q.item] || 0) < q.qty) return SIM.say(p.id, `${I()[q.item].name}が足りません`);
      p.inv[q.item] -= q.qty; if (!p.inv[q.item]) delete p.inv[q.item]; dropCost(p, q.item); s.stock[q.item] += q.qty;
      const fm = jobFame(w, q); p.money += q.reward; p.fame += fm; p.quests = p.quests.filter((x) => x !== q);
      SIM.say(p.id, `依頼「${q.title}」達成！ ${SIM.money(q.reward)}を受け取りました（名声+${fm}）`);
    },
    abandonJob(w, p, c) {
      const q = p.quests.find((x) => x.id === c.id); if (!q) return;
      p.quests = p.quests.filter((x) => x !== q); p.fame = Math.max(0, p.fame - 1);
      SIM.say(p.id, `依頼「${q.title}」を取りやめました（名声-1）`); if (SIM.sellQBack) SIM.sellQBack(w, p, q);
    },
    work(w, p, c) {
      const s = needTown(w, p); if (!s) return;
      if (c.kind === 'labor' && s.type !== 'village') {
        const pay = Math.round(((100 + 60 * s.size + SIM.rand(w) * 40) * 5) / 10) * 10; // 0.28.0 5倍
        p.busy = { kind: 'labor', label: '人足仕事', until: w.time.min + 8 * 60, pay, at: s.id, t0: w.time.min };
      } else if (c.kind === 'gather' && s.type === 'village') {
        p.busy = { kind: 'gather', label: '薪拾い', at: s.id, t0: w.time.min, until: w.time.min + 6 * 60, amount: 3 + Math.floor(SIM.rand(w) * 3) };
      } else return;
      SIM.say(p.id, `${p.busy.label}を始めました`);
    },
    buyCargo(w, p, c) { // 地図上の行商人から荷を買う（町より少し安い）
      const n = w.npcs[c.id];
      if (!n || n.kind !== 'merchant' || !n.cargo || p.battle || p.busy) return;
      if (dist(n, p) > 1.5) return SIM.say(p.id, '行商人にもっと近づいてください');
      const it = I()[n.cargo.item], unit = SIM.cargoPrice(n.cargo.item, p);
      const q = Math.min(5, n.cargo.qty, SIM.room(p, n.cargo.item), Math.floor(p.money / unit));
      if (q <= 0) return SIM.say(p.id, SIM.room(p, n.cargo.item) <= 0 ? fullMsg(n.cargo.item) : 'お金が足りません');
      p.money -= q * unit; addCost(p, n.cargo.item, q, unit); p.inv[n.cargo.item] = (p.inv[n.cargo.item] || 0) + q; n.cargo.qty -= q; if (n.cargo.qty <= 0) n.cargo = null;
      SIM.say(p.id, `行商人から${it.name}を${q}${it.unit}買いました（${SIM.money(q * unit)}）`);
    },
    cancelWork(w, p) { if (p.busy) { SIM.say(p.id, `${p.busy.label}を取りやめました`); p.busy = null; } },
    talk(w, p) {
      const s = needTown(w, p); if (!s) return;
      const lines = [];
      const k = pick(w, Object.keys(I()).filter((k) => !I()[k].mine)); const it = I()[k];
      const ps = w.settlements.map((x) => [x, SIM.price(x, k)]).sort((a, b) => a[1] - b[1]);
      lines.push(`${ps[0][0].name}では${it.name}が安いそうですよ。${ps[ps.length - 1][0].name}なら高く売れるとか。`);
      const f = w.factions[s.owner], lord = s.lord && w.people[s.lord];
      if (f) lines.push(`このあたりは${f.name}のご領地${lord ? `で、${lord.name}様が治めておられます` : 'です'}。`);
      lines.push('駿河の今川様が、近ごろ兵を集めているという噂ですよ。', '尾張の殿様は「うつけ」と呼ばれておりますが、さてどうでしょうな。', '美濃の斎藤様は、ご病気がちだと聞きます。');
      const who = s.type === 'castle' ? '足軽' : s.type === 'town' ? '町人' : '村人';
      SIM.say(p.id, `${who}「${pick(w, lines)}」`);
    },
  });

  // ---- 本人だけに送る情報 ----
  SIM.privateState = function (w, pid) {
    const p = w.players[pid]; if (!p) return null;
    const s = here(w, p);
    return {
      me: { money: p.money, inv: p.inv, cost: p.cost || {}, quests: p.quests, fame: Math.round(p.fame * 10) / 10, busy: p.busy, meet: p.meet || null, },
      here: s ? { id: s.id, noBuy: [...SIM.noBuy(w, s)], market: Object.keys(I()).map((k) => [k, SIM.buyPrice(s, k, p), SIM.sellPrice(s, k, p), Math.floor(s.stock[k])]), jobs: Object.values(w.jobs).filter((j) => j.from === s.id && SIM.jobOk(w, p, j)) } : null,
    };
  };
})();
