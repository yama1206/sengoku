// 2.35.0 農業：自宅のまわりの荒れ地を開墾して畑にし、田植え（種まき）・手入れ・収穫をする。農民として村を発展させる遊び。
//  ・開墾：体力を使って荒れ地を畑にする（道具が良いほど体力が少なくて済む）。畑の数には上限があり、水路で増やせる
//  ・植える：季節がある（米は4〜6月、木綿は4〜5月、茶は3〜4月）。種代がかかる。育つのに日数がかかる
//  ・手入れ（水やり・草取り）：5日おきに1段階ずつ、最大4段階。多いほど収穫が増える
//  ・夏（7月）の台風で、育ち中の作物が傷むことがある（水路が整っていると起きにくい）。秋（9月）は豊作・凶作がある
//  ・収穫は自宅の物置に入る。収穫するたびに村が発展する（人口が増え、米の産出が少し増える）
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, say = (pid, t) => SIM.say(pid, t);
  const FM = (SIM.FARM = {});
  FM.CROPS = {
    rice: { name: '米', item: 'rice', months: [4, 5, 6], days: 100, yield: 6, seed: 10 },
    cotton: { name: '木綿', item: 'cotton', months: [4, 5], days: 120, yield: 3, seed: 40 },
    tea: { name: '茶', item: 'tea', months: [3, 4], days: 200, yield: 2, seed: 80 },
  };
  FM.TOOLS = [{ name: '鍬', cost: 0, mul: 1 }, { name: '備中鍬', cost: 3000, mul: 0.75 }, { name: '牛馬の鋤', cost: 12000, mul: 0.5 }];
  FM.SUIRO = [{ name: 'なし', cost: 0, max: 6 }, { name: '小さな用水', cost: 4000, max: 8 }, { name: '用水路', cost: 10000, max: 10 }, { name: '堰と溜池', cost: 25000, max: 12 }];
  FM.kaiCost = 0.1; // 開墾1回の体力（鍬のとき）
  FM.tendCost = 0.02; // 手入れ1枚の体力
  FM.reapCost = 0.03; // 収穫1枚の体力
  FM.minHp = 0.15;
  FM.tendGap = 5; // 手入れできる間隔（日）
  FM.careMax = 4;
  FM.careMul = (c) => 0.7 + 0.15 * c; // 手入れの段階→収穫の倍率（0〜4で0.7〜1.3）
  FM.flood = 0.2; // 7月の台風が来る確率（水路ごとに -4%）
  FM.floodDmg = 0.5; // 傷んだ畑の収穫の倍率
  FM.harvEvt = 0.3; // 9月に豊作か凶作が起きる確率
  FM.popPer = 0.4; // 収穫1つあたりの村の人口の増え
  FM.devPer = 1; // 収穫1つあたりの発展度
  FM.idleDays = 10; // 実ってからこの日数ほうっておくと村人が代わりに収穫する
  FM.devRice = 0.002; // 発展度1あたりの、その村の米の産出の増え（上限 +30%）

  FM.devMul = (s) => 1 + Math.min(1, ((s && s.donated) || 0) / 30000); // 村への寄付で、村の発展が早くなる（最大2倍）
  // 家畜：買って育て、売ってお金にするか、村に寄付する。世話をしなくても育つ（世話をすると高く売れる）
  FM.ANIMALS = { hen: { name: '鶏', cost: 150, days: 30, sell: 350 }, cow: { name: '牛', cost: 1500, days: 150, sell: 4500 }, horse: { name: '馬', cost: 3000, days: 240, sell: 9000 } };
  FM.feedGap = 3; FM.feedCost = 0.01; FM.careMax2 = 4;
  FM.animalCap = (F) => 2 + F.fields.length;
  FM.animalVal = (a) => Math.round((FM.ANIMALS[a.k].sell * (0.8 + 0.1 * a.care)) / 10) * 10;
  // 狩猟：森の中で、現れた獲物を素早くタップして射る。w＝出やすさ、t＝見えている秒数、hp＝必要な命中数
  FM.PREY = { rabbit: { name: '兎', t: 1.4, hp: 1, meat: 1, hide: 0, w: 5 }, deer: { name: '鹿', t: 1.2, hp: 1, meat: 3, hide: 1, w: 4 }, boar: { name: '猪', t: 0.95, hp: 1, meat: 4, hide: 1, w: 3 }, bear: { name: '熊', t: 0.85, hp: 2, meat: 6, hide: 2, w: 1 } };
  FM.huntN = 10; FM.huntCost = 0.1; FM.huntMin = 0.25;
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const hpOf = (p) => (p.hpFrac == null ? 1 : p.hpFrac);
  const st = (p) => (p.farm = p.farm || { fields: [], tool: 0, suiro: 0, exp: 0, made: 0 });
  const kuraOf = (p) => { p.kura = p.kura || { money: 0, inv: {}, cost: {} }; p.kura.inv = p.kura.inv || {}; p.kura.cost = p.kura.cost || {}; return p.kura; };
  const maxF = (F) => FM.SUIRO[F.suiro].max;
  FM.state = (f, d) => (!f.c ? 'empty' : d - f.d0 >= FM.CROPS[f.c].days ? 'ripe' : 'grow');

  const atHome = (w, p) => {
    const s = here(w, p);
    if (!s) { say(p.id, '拠点の中でないとできません'); return null; }
    if (p.home !== s.id) { say(p.id, '畑は自宅のまわりにしかありません'); return null; }
    return s;
  };

  SIM.commands.farm = (w, p, c) => {
    if (!c || p.battle) return;
    const s = atHome(w, p); if (!s) return;
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    const F = st(p), d = day(w), m = SIM.month(w), tl = FM.TOOLS[F.tool];
    const kind = c.kind;
    if (kind === 'kai') { // 開墾
      if (F.fields.length >= maxF(F)) return say(p.id, `これ以上は開墾できません（畑は${maxF(F)}枚まで。水路を整えると増やせます）`);
      const cost = FM.kaiCost * tl.mul;
      if (hpOf(p) < Math.max(FM.minHp, cost)) return say(p.id, '体力が足りません。少し休んでから（自宅で休めば早く戻ります）');
      p.hpFrac = hpOf(p) - cost;
      F.fields.push({ c: null, d0: 0, care: 0, td: -99, dmg: 0 });
      F.exp += 1;
      return say(p.id, `荒れ地を開墾して畑を1枚ふやしました（${F.fields.length}／${maxF(F)}枚・体力 ${Math.round(p.hpFrac * 100)}%）`);
    }
    if (kind === 'sow') { // 植える（空いている畑すべてに、お金の続くかぎり）
      const cr = FM.CROPS[c.id]; if (!cr) return;
      if (!cr.months.includes(m)) return say(p.id, `${cr.name}を植えられる季節ではありません（${cr.months[0]}〜${cr.months[cr.months.length - 1]}月）`);
      let n = 0;
      for (const f of F.fields) {
        if (f.c || p.money < cr.seed) continue;
        p.money -= cr.seed; Object.assign(f, { c: c.id, d0: d, care: 0, td: -99, dmg: 0 }); n++;
      }
      if (!n) return say(p.id, F.fields.some((f) => !f.c) ? `種代が足りません（1枚${SIM.money(cr.seed)}）` : '空いている畑がありません（先に開墾するか、収穫してください）');
      F.exp += n;
      return say(p.id, `${cr.name}を${n}枚の畑に植えました（種代 ${SIM.money(cr.seed * n)}）。育つまで約${cr.days}日。ときどき手入れをしましょう`);
    }
    if (kind === 'tend') { // 手入れ（水やり・草取り）
      let n = 0;
      for (const f of F.fields) {
        if (!f.c || FM.state(f, d) !== 'grow' || d - f.td < FM.tendGap || f.care >= FM.careMax) continue;
        if (hpOf(p) < Math.max(FM.minHp, FM.tendCost)) break;
        p.hpFrac = hpOf(p) - FM.tendCost; f.care++; f.td = d; n++;
      }
      if (!n) return say(p.id, hpOf(p) < FM.minHp ? '体力が足りません' : '手入れできる畑がありません（5日おきに1回ずつ。育ち中の畑だけです）');
      F.exp += n;
      return say(p.id, `${n}枚の畑の水やりと草取りをしました（体力 ${Math.round(hpOf(p) * 100)}%）`);
    }
    if (kind === 'reap') { // 収穫
      const K = kuraOf(p), got = {};
      let n = 0, tot = 0;
      for (const f of F.fields) {
        if (!f.c || FM.state(f, d) !== 'ripe') continue;
        if (hpOf(p) < Math.max(FM.minHp, FM.reapCost)) break;
        p.hpFrac = hpOf(p) - FM.reapCost;
        const cr = FM.CROPS[f.c];
        const q = Math.max(1, Math.round(cr.yield * FM.careMul(f.care) * (f.dmg ? FM.floodDmg : 1) * (F.hv && F.hv.until > d ? F.hv.v : 1) * (0.9 + SIM.rand(w) * 0.2)));
        const hv = K.inv[cr.item] || 0, old = K.cost[cr.item] != null ? K.cost[cr.item] : 0; K.cost[cr.item] = (old * hv) / (hv + q); K.inv[cr.item] = hv + q;
        got[cr.item] = (got[cr.item] || 0) + q; tot += q; n++;
        Object.assign(f, { c: null, d0: 0, care: 0, td: -99, dmg: 0 });
      }
      if (!n) return say(p.id, hpOf(p) < FM.minHp ? '体力が足りません' : '収穫できる畑がありません');
      F.exp += n * 2; F.made = (F.made || 0) + tot;
      const dm = FM.devMul(s);
      s.farmDev = (s.farmDev || 0) + tot * FM.devPer * dm;
      if (s.pop) s.pop += Math.round(tot * FM.popPer * dm);
      const IT = SGK.DATA.items;
      say(p.id, `${Object.entries(got).map(([k, q]) => `${IT[k].name}${q}${IT[k].unit}`).join('・')}を収穫しました！　物置に入れました（村も少しにぎわいました）`);
      return;
    }
    if (kind === 'tool') { // 道具を新しくする
      const nx = FM.TOOLS[F.tool + 1]; if (!nx) return say(p.id, '道具は最高です');
      if (p.money < nx.cost) return say(p.id, `お金が足りません（${SIM.money(nx.cost)}）`);
      p.money -= nx.cost; F.tool++;
      return say(p.id, `${nx.name}を手に入れました（開墾・手入れ・収穫の体力が減ります）`);
    }
    if (kind === 'suiro') { // 水路を整える
      const nx = FM.SUIRO[F.suiro + 1]; if (!nx) return say(p.id, '水路は最高です');
      if (p.money < nx.cost) return say(p.id, `お金が足りません（${SIM.money(nx.cost)}）`);
      p.money -= nx.cost; F.suiro++; s.farmDev = (s.farmDev || 0) + 20;
      return say(p.id, `${nx.name}を整えました（畑は${nx.max}枚まで。台風の傷みも減ります）`);
    }
  };

  // ---- 季節：7月の台風で育ち中の畑が傷む・9月に豊作／凶作 ----
  SIM.systems.push(function farmSeason(w) {
    const m = SIM.month(w); if (w.farmM === m) return; w.farmM = m;
    const d = day(w);
    for (const p of Object.values(w.players)) {
      const F = p.farm; if (!F || !F.fields.length) continue;
      if (m === 7 && SIM.rand(w) < FM.flood - 0.04 * F.suiro) {
        let n = 0; for (const f of F.fields) if (f.c && FM.state(f, d) === 'grow' && !f.dmg) { f.dmg = 1; n++; }
        if (n) say(p.id, `台風で畑${n}枚が傷みました……（この畑の収穫は減ります。水路を整えると起きにくくなります）`);
        else say(p.id, '台風が来ましたが、畑に被害はありませんでした');
      }
      if (m === 9 && SIM.rand(w) < FM.harvEvt) {
        const bad = SIM.rand(w) < Math.max(0.2, 0.5 - 0.08 * F.suiro);
        F.hv = { v: bad ? 0.6 : 1.3, until: d + 120 };
        say(p.id, bad ? 'この秋は凶作のようです。収穫が減ります（水路が整っていると凶作が起きにくくなります）' : 'この秋は豊作です！　収穫がふえます');
      }
    }
  });


  // ---- 家畜 ----
  const herdOf = (F) => (F.herd = F.herd || []);
  const adult = (a, d) => d - a.d0 >= FM.ANIMALS[a.k].days;
  SIM.commands.animal = (w, p, c) => {
    if (!c || p.battle) return;
    const s = atHome(w, p); if (!s) return;
    const F = st(p), H = herdOf(F), d = day(w), kind = c.kind;
    if (kind === 'buy') {
      const A = FM.ANIMALS[c.id]; if (!A) return;
      if (H.length >= FM.animalCap(F)) return say(p.id, `これ以上は飼えません（${FM.animalCap(F)}頭まで。畑を開墾すると小屋が広がります）`);
      if (p.money < A.cost) return say(p.id, `お金が足りません（${SIM.money(A.cost)}）`);
      p.money -= A.cost; H.push({ k: c.id, d0: d, care: 0, td: -99 });
      return say(p.id, `${A.name}の子を迎えました。育つまで約${A.days}日（世話をしなくても育ちます）`);
    }
    if (kind === 'feed') {
      let n = 0;
      for (const a of H) {
        if (a.care >= FM.careMax2 || d - a.td < FM.feedGap) continue;
        if (hpOf(p) < Math.max(FM.minHp, FM.feedCost)) break;
        p.hpFrac = hpOf(p) - FM.feedCost; a.care++; a.td = d; n++;
      }
      if (!n) return say(p.id, hpOf(p) < FM.minHp ? '体力が足りません' : '世話できる家畜がいません（3日おきに1回ずつ）');
      return say(p.id, `${n}頭に餌をやり、世話をしました（世話をすると高く売れます）`);
    }
    if (kind === 'sell' || kind === 'donate') {
      const A = FM.ANIMALS[c.id]; if (!A) return;
      const out = H.filter((a) => a.k === c.id && adult(a, d)); if (!out.length) return say(p.id, `育ち切った${A.name}がいません`);
      const val = out.reduce((t, a) => t + FM.animalVal(a), 0);
      F.herd = H.filter((a) => !out.includes(a));
      F.exp += out.length;
      if (kind === 'sell') { p.money += val; return say(p.id, `${A.name}${out.length}頭を売りました（${SIM.money(val)}）`); }
      s.donated = (s.donated || 0) + val; s.farmDev = (s.farmDev || 0) + val / 40;
      if (s.pop) s.pop += Math.round(val / 600);
      p.fame = (p.fame || 0) + Math.max(1, Math.round(val / 3000));
      return say(p.id, `${A.name}${out.length}頭を村に寄付しました（${s.name}は大いに喜び、発展が早まります。名声も上がりました）`);
    }
  };

  // ---- 放置しても最低限の収穫：実ったまま10日おくと、村人が半分ほど収穫して物置に入れてくれる ----
  SIM.systems.push(function farmIdle(w) {
    const d = day(w); if (w.farmD === d) return; w.farmD = d;
    for (const p of Object.values(w.players)) {
      const F = p.farm; if (!F || !F.fields.length) continue;
      const K = kuraOf(p); let n = 0;
      for (const f of F.fields) {
        if (!f.c) continue; const cr = FM.CROPS[f.c];
        if (d - f.d0 < cr.days + FM.idleDays) continue;
        const q = Math.max(1, Math.round(cr.yield * 0.5)), hv = K.inv[cr.item] || 0, old = K.cost[cr.item] != null ? K.cost[cr.item] : 0;
        K.cost[cr.item] = (old * hv) / (hv + q); K.inv[cr.item] = hv + q; n++;
        const s = p.home && SIM.settlement(w, p.home); if (s) s.farmDev = (s.farmDev || 0) + q * 0.5;
        Object.assign(f, { c: null, d0: 0, care: 0, td: -99, dmg: 0 });
      }
      if (n) say(p.id, `実ったまま放っておいた畑${n}枚を、村人が収穫してくれました（少しだけ物置に入っています）`);
    }
  });

  // ---- 狩猟（森の中で。体力を使い、ミニゲームの結果で肉と毛皮が手に入る） ----
  SIM.commands.huntStart = (w, p) => {
    if (p.battle) return;
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    if (p.tx != null || p.at) return say(p.id, '森の中で立ち止まっているときにできます');
    if (SIM.terrainAt(p.x, p.y) !== '森') return say(p.id, 'ここは森ではありません');
    if (hpOf(p) < FM.huntMin) return say(p.id, '体力が足りません。少し休んでから');
    p.hpFrac = hpOf(p) - FM.huntCost; p.huntN = (p.huntN || 0) + 1; p.hunt = { n: p.huntN };
  };
  SIM.commands.huntEnd = (w, p, c) => {
    if (!p.hunt || +c.n !== p.hunt.n) return; p.hunt = null;
    const res = c.res && typeof c.res === 'object' ? c.res : {}; let left = FM.huntN, meat = 0, hide = 0; const got = [];
    for (const k in FM.PREY) {
      const q = Math.max(0, Math.min(left, Math.floor(+res[k] || 0))); if (!q) continue; left -= q;
      meat += FM.PREY[k].meat * q; hide += FM.PREY[k].hide * q; got.push(`${FM.PREY[k].name}${q}`);
    }
    if (!got.length) return say(p.id, '獲物は仕留められませんでした……');
    p.inv = p.inv || {}; p.cost = p.cost || {};
    for (const [k, n] of [['meat', meat], ['hide', hide]]) if (n) { const hv = p.inv[k] || 0, old = p.cost[k] != null ? p.cost[k] : 0; p.cost[k] = (old * hv) / (hv + n); p.inv[k] = hv + n; }
    say(p.id, `${got.join('・')}を仕留めました！　肉${meat}塊${hide ? `・毛皮${hide}枚` : ''}を手に入れました`);
  };

  // 村の発展：その村の米の産出が少し増える
  { const b0 = SIM.prodItemMul; SIM.prodItemMul = (s, k) => { let m = b0 ? b0(s, k) : 1; if (k === 'rice' && s && s.farmDev) m *= 1 + Math.min(0.3, s.farmDev * FM.devRice); return m; }; }

  // 本人に送る情報
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const F = st(p), d = day(w), m = SIM.month(w), s = p.home && SIM.settlement(w, p.home), nt = FM.TOOLS[F.tool + 1], ns = FM.SUIRO[F.suiro + 1];
    r.me.farm = {
      m, tool: FM.TOOLS[F.tool].name, suiro: FM.SUIRO[F.suiro].name, max: maxF(F), exp: F.exp, made: F.made || 0, dev: s ? Math.round(s.farmDev || 0) : 0, pop: s && s.pop ? s.pop : null,
      hv: F.hv && F.hv.until > d ? (F.hv.v > 1 ? '豊作' : '凶作') : null,
      kai: Math.round(FM.kaiCost * FM.TOOLS[F.tool].mul * 100),
      fields: F.fields.map((f) => { const cr = f.c && FM.CROPS[f.c], stt = FM.state(f, d); return { c: cr ? cr.name : null, st: stt, left: cr && stt === 'grow' ? Math.max(0, cr.days - (d - f.d0)) : 0, care: f.care, can: stt === 'grow' && d - f.td >= FM.tendGap && f.care < FM.careMax, dmg: f.dmg || 0 }; }),
      crops: Object.entries(FM.CROPS).map(([id, c]) => ({ id, name: c.name, seed: c.seed, days: c.days, months: c.months, ok: c.months.includes(m) })),
      herd: herdOf(F).map((a) => { const A = FM.ANIMALS[a.k], ad = adult(a, d); return { k: a.k, name: A.name, ad, left: ad ? 0 : A.days - (d - a.d0), care: a.care, can: a.care < FM.careMax2 && d - a.td >= FM.feedGap, val: FM.animalVal(a) }; }),
      acap: FM.animalCap(F), donated: s ? Math.round(s.donated || 0) : 0, devMul: s ? Math.round(FM.devMul(s) * 100) / 100 : 1,
      animals: Object.entries(FM.ANIMALS).map(([id, a]) => ({ id, name: a.name, cost: a.cost, days: a.days })),
      hunt: p.hunt ? { n: p.hunt.n } : null,
      nt: nt ? { name: nt.name, cost: nt.cost } : null, ns: ns ? { name: ns.name, cost: ns.cost, max: ns.max } : null,
    };
    return r;
  };
})();
