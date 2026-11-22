// 2.35.0 農業：自宅のまわりの荒れ地を開墾して畑にし、植えて・世話をして・収穫する。農民として村を発展させる遊び。
// 2.56.0 作り直し：
//  ・作物を増やした（米・麦・大豆・大根・木綿・茶）。冬に麦を植えれば二毛作になる
//  ・畑ごとに「土の肥え」がある。収穫すると痩せる（大豆は逆に肥える）。家畜の肥やしや干鰯をまくと戻る。肥えた畑ほど多く取れる
//  ・育ち中の畑には、毎日ときどき草が生え・虫がつき・乾く（雨の日は乾かない）。放っておくと育ちが止まり、出来（質）が落ちる
//  ・畑を1枚ずつタップして世話できる（選んだ種を植える・肥やしをまく・おまかせ＝その畑にいま要ることをする）。まとめてする「見回り」もある
//  ・家畜は1頭ずつ名前があり、満腹・なつきがある。餌（草刈り・麦や大豆）をやる・なでる。鶏は卵を産み、牛と馬は肥やしを出す。
//    2頭そろってなついていれば子が生まれる。育った馬は乗り馬にできる
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, say = (pid, t) => SIM.say(pid, t);
  const FM = (SIM.FARM = {});
  // draw＝収穫で痩せる土の肥え（負なら肥える）
  FM.CROPS = {
    // 2.101.4 育つ日数は最長でも1週間（7日）に
    rice: { name: '米', item: 'rice', months: [4, 5, 6], days: 6, yield: 6, seed: 10, draw: 12 },
    mugi: { name: '麦', item: 'mugi', months: [10, 11], days: 7, yield: 5, seed: 8, draw: 10 },
    daizu: { name: '大豆', item: 'daizu', months: [5, 6, 7], days: 5, yield: 4, seed: 15, draw: -15 },
    daikon: { name: '大根', item: 'daikon', months: [8, 9], days: 4, yield: 6, seed: 5, draw: 8 },
    cotton: { name: '木綿', item: 'cotton', months: [4, 5], days: 6, yield: 3, seed: 40, draw: 15 },
    tea: { name: '茶', item: 'tea', months: [3, 4], days: 7, yield: 2, seed: 80, draw: 6 },
  };
  FM.TOOLS = [{ name: '鍬', cost: 0, mul: 1 }, { name: '備中鍬', cost: 3000, mul: 0.75 }, { name: '牛馬の鋤', cost: 12000, mul: 0.5 }];
  FM.SUIRO = [{ name: 'なし', cost: 0, max: 6 }, { name: '小さな用水', cost: 4000, max: 8 }, { name: '用水路', cost: 10000, max: 10 }, { name: '堰と溜池', cost: 25000, max: 12 }];
  FM.kaiCost = 0.1; // 開墾1回の体力（鍬のとき）
  FM.tendCost = 0.02; // 手入れ・草取り・虫取り・水やり 1枚の体力
  FM.reapCost = 0.03; // 収穫1枚の体力
  FM.minHp = 0.15;
  FM.tendGap = 1; // 手入れできる間隔（日）（2.101.4 作物が1週間以内で育つので、毎日できるように）
  FM.careMax = 4;
  FM.careMul = (c) => 0.7 + 0.15 * c; // 手入れの段階→収穫の倍率（0〜4で0.7〜1.3）
  FM.soil0 = 60; FM.koeUp = 25; // 開墾したての土の肥え・肥やし1つで肥える量
  FM.soilMul = (s) => 0.6 + 0.6 * s / 100; // 土の肥え（0〜100）→収穫の倍率（0.6〜1.2）
  FM.qMul = (q) => 0.5 + q / 200; // 出来（0〜100）→収穫の倍率
  FM.hoshika = { n: 5, cost: 1500 }; // 干鰯（肥やし5つ分）
  // 畑の困りごと：1日あたりの起きやすさ・育ちが止まっている間に出来が落ちる量
  FM.ISS = { kusa: { name: '草', fix: '草取り', p: 0.05, q: 3 }, mushi: { name: '虫', fix: '虫取り', p: 0.03, q: 4 }, kawaki: { name: '乾き', fix: '水やり', p: 0.06, q: 3 } };
  FM.flood = 0.2; // 7月の台風が来る確率（水路ごとに -4%）
  FM.floodDmg = 0.5; // 傷んだ畑の収穫の倍率
  FM.harvEvt = 0.3; // 9月に豊作か凶作が起きる確率
  FM.popPer = 0.4; // 収穫1つあたりの村の人口の増え
  FM.devPer = 1; // 収穫1つあたりの発展度
  FM.idleDays = 10; // 実ってからこの日数ほうっておくと村人が代わりに収穫する
  FM.devRice = 0.002; // 発展度1あたりの、その村の米の産出の増え（上限 +30%）

  FM.devMul = (s) => 1 + Math.min(1, ((s && s.donated) || 0) / 30000); // 村への寄付で、村の発展が早くなる（最大2倍）
  // 家畜：買って育て、売るか村に寄付する。hunger＝1日に減る満腹、esa＝1回の餌、koe＝肥やしを出す間隔（日）
  FM.ANIMALS = { // 2.106.6 育つ日数を10分の1に（鶏30→3・牛150→15・馬240→24）
    hen: { name: '鶏', cost: 150, days: 3, sell: 350, hunger: 12, esa: 1, egg: 0.8 },
    cow: { name: '牛', cost: 1500, days: 15, sell: 4500, hunger: 10, esa: 3, koe: 2 },
    horse: { name: '馬', cost: 3000, days: 24, sell: 9000, hunger: 10, esa: 3, koe: 3 },
  };
  FM.NAMES = {
    hen: ['おたま', 'こまち', 'ちよ', 'はな', 'きく', 'つる', 'もみじ', 'あずき', 'ごま', 'しろ', 'とさか', 'こはる'],
    cow: ['黒丸', 'まだら', 'おぼろ', '太郎', 'ふく', 'もも', 'くろ', 'こむぎ', '玉', '大黒'],
    horse: ['疾風', '月影', '青嵐', '鬼鹿毛', '白雲', '栗丸', '稲妻', '朝霧', '小雪', '黒鉄'],
  };
  FM.feedGap = 3; FM.feedCost = 0.01; FM.careMax2 = 4;
  FM.grassCost = 0.05; FM.grassEsa = 8; // 草刈り：体力5%で餌8
  FM.GRAIN = { mugi: 6, daizu: 6, rice: 4 }; // 物置の穀物1俵で餌いくつ
  FM.breedGap = 30; FM.breedNat = 50; // 子が生まれるのに要る、なつき
  FM.animalCap = (F) => 2 + F.fields.length + (F.lendA || 0); // 2.56.1 lendA＝村長から許された分（農民の身分）
  FM.animalVal = (a) => Math.round((FM.ANIMALS[a.k].sell * (0.7 + 0.1 * (a.care || 0) + (a.nat || 0) / 250)) / 10) * 10;
  // 狩猟：森の中で、現れた獲物を素早くタップして射る。w＝出やすさ、t＝見えている秒数、hp＝必要な命中数
  // t＝見えている秒数、r＝当たりの大きさ(px)、sp＝動く速さ(px/秒)、zig＝向きを変える間隔(秒、0なら直進)、hp＝必要な命中数。難しさは兎＜鹿＜猪＜熊（猪は速い直進、熊は3回当てる）
  FM.PREY = { rabbit: { name: '兎', t: 1.0, r: 27, sp: 110, zig: 0.25, hp: 1, meat: 1, hide: 0, w: 5 }, deer: { name: '鹿', t: 0.9, r: 26, sp: 150, zig: 0.5, hp: 1, meat: 2, hide: 1, w: 4 }, boar: { name: '猪', t: 0.75, r: 22, sp: 260, zig: 0, hp: 1, meat: 2, hide: 0, w: 3 }, bear: { name: '熊', t: 1.5, r: 36, sp: 90, zig: 0.7, hp: 3, meat: 4, hide: 2, w: 1 } };
  FM.huntN = 6; FM.huntArrows = 9; // 矢の数（外すと減る）。2.60.3 稼げすぎたので獲物10回→6回・矢14→9、鹿・猪・熊の肉と猪の毛皮を減らす（1回の儲けは前の4割ほど）
  FM.huntCost = 0.1; FM.huntMin = 0.25;
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const hpOf = (p) => (p.hpFrac == null ? 1 : p.hpFrac);
  const newField = () => ({ c: null, d0: 0, care: 0, td: -99, dmg: 0, soil: FM.soil0, iss: null, q: 100 });
  const st = (p) => {
    const F = (p.farm = p.farm || { fields: [], tool: 0, suiro: 0, exp: 0, made: 0 });
    if (!F.v56) { F.v56 = 1; for (const f of F.fields) { if (f.soil == null) f.soil = FM.soil0; if (f.q == null) f.q = 100; if (f.iss === undefined) f.iss = null; } for (const a of F.herd || []) fixAnimal(a, F); F.esa = F.esa || 0; F.koe = F.koe || 0; F.egg = F.egg || 0; }
    return F;
  };
  const fixAnimal = (a, F) => { if (a.full == null) a.full = 80; if (a.nat == null) a.nat = 20; if (!a.name) a.name = pickName(a.k, F); if (a.pd == null) a.pd = 0; if (a.nd == null) a.nd = -1; };
  const pickName = (k, F) => { const used = (F.herd || []).map((a) => a.name), L = FM.NAMES[k].filter((n) => !used.includes(n)); return L.length ? L[Math.floor(Math.random() * L.length)] : FM.NAMES[k][0] + ((F.herd || []).length + 1); };
  const kuraOf = (p) => { p.kura = p.kura || { money: 0, inv: {}, cost: {} }; p.kura.inv = p.kura.inv || {}; p.kura.cost = p.kura.cost || {}; return p.kura; };
  const addKura = (K, k, q) => { const hv = K.inv[k] || 0, old = K.cost[k] != null ? K.cost[k] : 0; K.cost[k] = (old * hv) / (hv + q); K.inv[k] = hv + q; };
  const maxF = (F) => FM.SUIRO[F.suiro].max + (F.lend || 0); // 2.56.1 lend＝村長から借りた田畑（農民の身分）
  FM.state = (f, d) => (!f.c ? 'empty' : d - f.d0 >= FM.CROPS[f.c].days ? 'ripe' : 'grow');
  FM.stage = (f, d) => { if (!f.c) return -1; const r = (d - f.d0) / FM.CROPS[f.c].days; return r >= 1 ? 3 : r >= 0.6 ? 2 : r >= 0.25 ? 1 : 0; }; // 芽・若い・育った・実り
  const rainy = (w) => { const id = SIM.weatherAt ? SIM.weatherAt(w.time.min).id : ''; return id === 'rain' || id === 'storm' || id === 'snow'; };

  const atHome = (w, p) => {
    const s = here(w, p);
    if (!s) { say(p.id, '拠点の中でないとできません'); return null; }
    if (p.home !== s.id) { say(p.id, '畑は自宅のまわりにしかありません'); return null; }
    return s;
  };
  const tired = (p, c) => hpOf(p) < Math.max(FM.minHp, c);
  const use = (p, c) => { p.hpFrac = hpOf(p) - c; };

  // 1枚の畑に、いま要ること（おまかせ）。返り値は した事の名前（できなければ null）
  function work(w, p, F, f, d, mode, s, got) {
    if (mode && FM.CROPS[mode]) { // 種を植える
      if (f.c) return null; const cr = FM.CROPS[mode];
      if (!cr.months.includes(SIM.month(w))) return say(p.id, `${cr.name}を植えられる季節ではありません（${cr.months[0]}〜${cr.months[cr.months.length - 1]}月）`), null;
      if (p.money < cr.seed) return say(p.id, `種代が足りません（${SIM.money(cr.seed)}）`), null;
      p.money -= cr.seed; Object.assign(f, { c: mode, d0: d, care: 0, td: -99, dmg: 0, iss: null, q: 100 }); F.exp += 1; return `${cr.name}を植えた`;
    }
    if (mode === 'koe') { // 肥やしをまく
      if (!(F.koe > 0)) return say(p.id, '肥やしがありません（牛・馬を飼うか、干鰯を買う）'), null;
      if (f.soil >= 100) return null; F.koe--; f.soil = Math.min(100, f.soil + FM.koeUp); return '肥やしをまいた';
    }
    const stt = FM.state(f, d);
    if (stt === 'ripe') return reap(w, p, F, f, d, got) ? '収穫した' : null;
    if (stt !== 'grow') return null;
    if (f.iss) { if (tired(p, FM.tendCost)) return null; use(p, FM.tendCost); const n = FM.ISS[f.iss].fix; f.iss = null; F.exp += 1; return n; }
    if (d - f.td >= FM.tendGap && f.care < FM.careMax) { if (tired(p, FM.tendCost)) return null; use(p, FM.tendCost); f.care++; f.td = d; F.exp += 1; return '手入れした'; }
    return null;
  }
  function reap(w, p, F, f, d, got) {
    if (tired(p, FM.reapCost)) return false; use(p, FM.reapCost);
    const cr = FM.CROPS[f.c], K = kuraOf(p);
    const q = Math.max(1, Math.round(cr.yield * FM.careMul(f.care) * FM.soilMul(f.soil) * FM.qMul(f.q) * (f.dmg ? FM.floodDmg : 1) * (F.hv && F.hv.until > d ? F.hv.v : 1) * (0.9 + SIM.rand(w) * 0.2)));
    addKura(K, cr.item, q); got[cr.item] = (got[cr.item] || 0) + q; got._n = (got._n || 0) + q;
    f.soil = Math.max(10, Math.min(100, f.soil - cr.draw));
    Object.assign(f, { c: null, d0: 0, care: 0, td: -99, dmg: 0, iss: null, q: 100 }); F.exp += 2;
    return true;
  }
  function afterReap(w, p, F, s, got) {
    const tot = got._n || 0; if (!tot) return; delete got._n;
    F.made = (F.made || 0) + tot;
    const dm = FM.devMul(s);
    s.farmDev = (s.farmDev || 0) + tot * FM.devPer * dm;
    if (s.pop) s.pop += Math.round(tot * FM.popPer * dm);
    const IT = SGK.DATA.items;
    say(p.id, `${Object.entries(got).map(([k, q]) => `${IT[k].name}${q}${IT[k].unit}`).join('・')}を収穫しました！　物置に入れました（村も少しにぎわいました）`);
  }

  SIM.commands.farm = (w, p, c) => {
    if (!c || p.battle) return;
    const s = atHome(w, p); if (!s) return;
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    const F = st(p), d = day(w), tl = FM.TOOLS[F.tool];
    const kind = c.kind;
    if (kind === 'kai') { // 開墾（育った牛がいると楽）
      if (F.fields.length >= maxF(F)) return say(p.id, `これ以上は開墾できません（畑は${maxF(F)}枚まで。水路を整えると増やせます）`);
      const ox = (F.herd || []).some((a) => a.k === 'cow' && adult(a, d));
      const cost = FM.kaiCost * tl.mul * (ox ? 0.7 : 1);
      if (tired(p, cost)) return say(p.id, '体力が足りません。少し休んでから（自宅で休めば早く戻ります）');
      use(p, cost); F.fields.push(newField()); F.exp += 1;
      return say(p.id, `荒れ地を開墾して畑を1枚ふやしました${ox ? '（牛に鋤を引かせました）' : ''}（${F.fields.length}／${maxF(F)}枚・体力 ${Math.round(p.hpFrac * 100)}%）`);
    }
    if (kind === 'tap') { // 畑を1枚えらんで世話する
      const f = F.fields[+c.id]; if (!f) return; const got = {};
      const r = work(w, p, F, f, d, c.item && c.item !== 'auto' ? c.item : null, s, got);
      if (got._n) return afterReap(w, p, F, s, got);
      if (r) return say(p.id, `${+c.id + 1}枚目の畑：${r}（体力 ${Math.round(hpOf(p) * 100)}%）`);
      if (tired(p, FM.tendCost)) return say(p.id, '体力が足りません');
      if (!c.item || c.item === 'auto') return say(p.id, f.c ? `${+c.id + 1}枚目の畑：いまはすることがありません` : `${+c.id + 1}枚目の畑は空いています。上で種を選んでからタップすると植えられます`);
      return;
    }
    if (kind === 'sow') { // 空いている畑すべてに植える
      const cr = FM.CROPS[c.id]; if (!cr) return;
      if (!cr.months.includes(SIM.month(w))) return say(p.id, `${cr.name}を植えられる季節ではありません（${cr.months[0]}〜${cr.months[cr.months.length - 1]}月）`);
      let n = 0;
      for (const f of F.fields) { if (f.c || p.money < cr.seed) continue; p.money -= cr.seed; Object.assign(f, { c: c.id, d0: d, care: 0, td: -99, dmg: 0, iss: null, q: 100 }); n++; }
      if (!n) return say(p.id, F.fields.some((f) => !f.c) ? `種代が足りません（1枚${SIM.money(cr.seed)}）` : '空いている畑がありません（先に開墾するか、収穫してください）');
      F.exp += n;
      return say(p.id, `${cr.name}を${n}枚の畑に植えました（種代 ${SIM.money(cr.seed * n)}）。育つまで約${cr.days}日。見回って草や虫や乾きを片づけましょう`);
    }
    if (kind === 'tend') { // 見回り：困りごとを片づけ、手入れできる畑は手入れする
      const done = {}; let n = 0;
      for (const f of F.fields) { if (FM.state(f, d) !== 'grow') continue; const r = work(w, p, F, f, d, null, s, {}); if (r) { done[r] = (done[r] || 0) + 1; n++; } }
      if (!n) return say(p.id, tired(p, FM.tendCost) ? '体力が足りません' : 'いま世話のいる畑はありません');
      return say(p.id, `畑を見回りました：${Object.entries(done).map(([k, v]) => `${k}${v}枚`).join('・')}（体力 ${Math.round(hpOf(p) * 100)}%）`);
    }
    if (kind === 'reap') { // 実った畑をすべて収穫
      const got = {};
      for (const f of F.fields) if (f.c && FM.state(f, d) === 'ripe' && !reap(w, p, F, f, d, got)) break;
      if (!got._n) return say(p.id, tired(p, FM.reapCost) ? '体力が足りません' : '収穫できる畑がありません');
      return afterReap(w, p, F, s, got);
    }
    if (kind === 'koe') { // 痩せた畑から順に肥やしをまく
      if (!(F.koe > 0)) return say(p.id, '肥やしがありません（牛・馬を飼うか、干鰯を買う）');
      let n = 0; const L = F.fields.filter((f) => f.soil < 100).sort((a, b) => a.soil - b.soil);
      for (const f of L) { if (!(F.koe > 0)) break; F.koe--; f.soil = Math.min(100, f.soil + FM.koeUp); n++; }
      return say(p.id, n ? `${n}枚の畑に肥やしをまきました（残り${F.koe}）` : 'どの畑も十分に肥えています');
    }
    if (kind === 'hoshika') {
      if (p.money < FM.hoshika.cost) return say(p.id, `お金が足りません（${SIM.money(FM.hoshika.cost)}）`);
      p.money -= FM.hoshika.cost; F.koe = (F.koe || 0) + FM.hoshika.n;
      return say(p.id, `干鰯を買いました（肥やし+${FM.hoshika.n}・いま${F.koe}）`);
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
      return say(p.id, `${nx.name}を整えました（畑は${nx.max}枚まで。台風の傷みや畑の乾きも減ります）`);
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
      p.money -= A.cost; const a = { k: c.id, d0: d, care: 0, td: -99 }; fixAnimal(a, F); a.full = 100; H.push(a);
      return say(p.id, `${A.name}の子「${a.name}」を迎えました。育つまで約${A.days}日。餌をやり、なでてやりましょう`);
    }
    if (kind === 'grass') { // 草刈り（餌になる）
      if (tired(p, FM.grassCost)) return say(p.id, '体力が足りません');
      use(p, FM.grassCost); F.esa = (F.esa || 0) + FM.grassEsa;
      return say(p.id, `草を刈りました（餌+${FM.grassEsa}・いま${F.esa}）`);
    }
    if (kind === 'grain') { // 物置の穀物を餌にする
      const k = c.item, per = FM.GRAIN[k], K = kuraOf(p); if (!per) return;
      if (!(K.inv[k] > 0)) return say(p.id, `物置に${SGK.DATA.items[k].name}がありません`);
      K.inv[k]--; if (!K.inv[k]) { delete K.inv[k]; delete K.cost[k]; } F.esa = (F.esa || 0) + per;
      return say(p.id, `${SGK.DATA.items[k].name}1${SGK.DATA.items[k].unit}を餌にしました（餌+${per}・いま${F.esa}）`);
    }
    if (kind === 'feed') { // 腹をすかせた順に餌をやる
      let n = 0, short = false;
      for (const a of H.slice().sort((x, y) => x.full - y.full)) {
        if (a.full >= 90) continue; const A = FM.ANIMALS[a.k];
        if ((F.esa || 0) < A.esa) { short = true; continue; }
        if (tired(p, FM.feedCost)) break;
        use(p, FM.feedCost); F.esa -= A.esa; a.full = 100; n++;
        if (a.care < FM.careMax2 && d - a.td >= FM.feedGap) { a.care++; a.td = d; }
      }
      if (!n) return say(p.id, short ? `餌が足りません（いま${F.esa || 0}。草を刈るか、物置の麦・大豆を餌に）` : hpOf(p) < FM.minHp ? '体力が足りません' : 'どの家畜もお腹いっぱいです');
      return say(p.id, `${n}頭に餌をやりました（餌の残り${F.esa}）${short ? '。餌が足りず、やれなかった家畜もいます' : ''}`);
    }
    if (kind === 'pet') { // なでる（1日1回・体力いらず）
      const a = H[+c.id]; if (!a) return;
      if (a.nd === d) return say(p.id, `${a.name}は今日はもうなでました`);
      a.nd = d; a.nat = Math.min(100, a.nat + 8);
      return say(p.id, `${a.name}をなでました。${a.nat >= 80 ? 'すっかりなついています' : a.nat >= 50 ? 'うれしそうです' : '少し慣れてきたようです'}（なつき ${a.nat}）`);
    }
    if (kind === 'egg') { // 卵を集める
      const n = Math.floor(F.egg || 0); if (!n) return say(p.id, '卵はまだありません');
      F.egg -= n; addKura(kuraOf(p), 'egg', n); F.exp += 1;
      return say(p.id, `卵を${n}個集めて物置に入れました`);
    }
    if (kind === 'breed') { // 子を産ませる（2頭そろってなついていれば）
      const A = FM.ANIMALS[c.id]; if (!A) return;
      const pr = H.filter((a) => a.k === c.id && adult(a, d) && a.nat >= FM.breedNat && a.full > 40);
      if (pr.length < 2) return say(p.id, `育った${A.name}が2頭いて、どちらもなついて（${FM.breedNat}以上）お腹がすいていないと子は生まれません`);
      F.bd = F.bd || {}; if (d - (F.bd[c.id] || -999) < FM.breedGap) return say(p.id, `${A.name}の子はあと${FM.breedGap - (d - F.bd[c.id])}日ほどしてから`);
      if (H.length >= FM.animalCap(F)) return say(p.id, `小屋がいっぱいです（${FM.animalCap(F)}頭まで）`);
      F.bd[c.id] = d; const b = { k: c.id, d0: d, care: 0, td: -99 }; fixAnimal(b, F); b.full = 100; b.nat = 40; H.push(b); F.exp += 3;
      return say(p.id, `${pr[0].name}と${pr[1].name}の間に、${A.name}の子「${b.name}」が生まれました！`);
    }
    if (kind === 'ride') { // 育った馬を乗り馬にする（よくなつき、世話の行き届いた馬は駿馬に）
      const a = H[+c.id]; if (!a || a.k !== 'horse' || !adult(a, d)) return;
      const good = a.nat >= 80 && a.care >= 4, id = good ? 'horse2' : 'horse1';
      F.herd = H.filter((x) => x !== a); p.gear = p.gear || {}; p.gear[id] = (p.gear[id] || 0) + 1;
      return say(p.id, `${a.name}を乗り馬にしました（${SIM.EQUIP.horse[id].name}として、人物の装備タブで付けられます）`);
    }
    if (kind === 'sell' || kind === 'donate') {
      const A = FM.ANIMALS[c.id]; if (!A) return;
      const out = c.item != null ? [H[+c.item]].filter((a) => a && a.k === c.id && adult(a, d)) : H.filter((a) => a.k === c.id && adult(a, d));
      if (!out.length) return say(p.id, `育ち切った${A.name}がいません`);
      const val = out.reduce((t, a) => t + FM.animalVal(a), 0), names = out.map((a) => a.name).join('・');
      F.herd = H.filter((a) => !out.includes(a));
      F.exp += out.length;
      if (kind === 'sell') { p.money += val; return say(p.id, `${A.name}の${names}を売りました（${SIM.money(val)}）`); }
      s.donated = (s.donated || 0) + val; s.farmDev = (s.farmDev || 0) + val / 40;
      if (s.pop) s.pop += Math.round(val / 600);
      p.fame = (p.fame || 0) + Math.max(1, Math.round(val / 3000));
      return say(p.id, `${A.name}の${names}を村に寄付しました（${s.name}は大いに喜び、発展が早まります。名声も上がりました）`);
    }
  };

  // ---- 毎日：畑の困りごと・家畜の腹へり・卵と肥やし・放置した実りの収穫 ----
  SIM.systems.push(function farmIdle(w) {
    const d = day(w); if (w.farmD === d) return; w.farmD = d;
    const wet = rainy(w), m = SIM.month(w);
    for (const p of Object.values(w.players)) {
      if (!p.farm) continue; const F = st(p);
      // 畑
      if (F.fields.length) {
        const K = kuraOf(p); let n = 0, iss = 0;
        for (const f of F.fields) {
          if (!f.c) continue; const cr = FM.CROPS[f.c];
          if (FM.state(f, d) === 'grow') {
            if (wet && f.iss === 'kawaki') f.iss = null;
            if (f.iss) { f.d0++; f.q = Math.max(0, f.q - FM.ISS[f.iss].q); } // 困りごとがあると育ちが止まり、出来が落ちる
            else {
              const pk = SIM.rand(w);
              const pm = FM.ISS.mushi.p * (m >= 6 && m <= 8 ? 2 : 1), pw = wet || m === 12 || m <= 2 ? 0 : FM.ISS.kawaki.p * (m === 7 || m === 8 ? 1.5 : 1) * (f.c === 'rice' ? 1.5 : 1) * Math.max(0.3, 1 - 0.2 * F.suiro);
              if (pk < FM.ISS.kusa.p) f.iss = 'kusa'; else if (pk < FM.ISS.kusa.p + pm) f.iss = 'mushi'; else if (pk < FM.ISS.kusa.p + pm + pw) f.iss = 'kawaki';
              if (f.iss) iss++;
            }
            continue;
          }
          if (d - f.d0 < cr.days + FM.idleDays) continue;
          const q = Math.max(1, Math.round(cr.yield * 0.5)); addKura(K, cr.item, q); n++;
          f.soil = Math.max(10, Math.min(100, f.soil - cr.draw));
          const s = p.home && SIM.settlement(w, p.home); if (s) s.farmDev = (s.farmDev || 0) + q * 0.5;
          Object.assign(f, { c: null, d0: 0, care: 0, td: -99, dmg: 0, iss: null, q: 100 });
        }
        if (n) say(p.id, `実ったまま放っておいた畑${n}枚を、村人が収穫してくれました（少しだけ物置に入っています）`);
        if (iss >= 2) say(p.id, `畑${iss}枚に草や虫や乾きが出ています。見回ってやりましょう`);
      }
      // 家畜
      let hungry = 0;
      for (const a of F.herd || []) {
        const A = FM.ANIMALS[a.k]; a.full = Math.max(0, a.full - A.hunger);
        if (a.full < 30 && (F.esa || 0) >= A.esa) { F.esa -= A.esa; a.full = 70; } // 留守の間は餌箱から自分で食べる（世話にはならない）
        if (a.full <= 0) { a.d0++; a.nat = Math.max(0, a.nat - 4); hungry++; continue; } // 腹ぺこだと育たず、なつきも減る
        if (!adult(a, d) || a.full < 30) continue;
        if (A.egg && SIM.rand(w) < A.egg) F.egg = Math.min(60, (F.egg || 0) + 1);
        if (A.koe && d - (a.pd || 0) >= A.koe) { a.pd = d; F.koe = Math.min(99, (F.koe || 0) + 1); }
      }
      if (hungry > (F.hun || 0)) say(p.id, `家畜${hungry}頭がお腹をすかせています（餌箱も空です）。草を刈るか、麦・大豆を餌にしてやってください`);
      F.hun = hungry;
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
    const F = st(p), d = day(w), m = SIM.month(w), s = p.home && SIM.settlement(w, p.home), nt = FM.TOOLS[F.tool + 1], ns = FM.SUIRO[F.suiro + 1], K = p.kura || { inv: {} };
    r.me.farm = {
      m, tool: FM.TOOLS[F.tool].name, suiro: FM.SUIRO[F.suiro].name, max: maxF(F), exp: F.exp, made: F.made || 0, dev: s ? Math.round(s.farmDev || 0) : 0, pop: s && s.pop ? s.pop : null,
      hv: F.hv && F.hv.until > d ? (F.hv.v > 1 ? '豊作' : '凶作') : null, wet: rainy(w),
      kai: Math.round(FM.kaiCost * FM.TOOLS[F.tool].mul * ((F.herd || []).some((a) => a.k === 'cow' && adult(a, d)) ? 0.7 : 1) * 100),
      koe: F.koe || 0, esa: F.esa || 0, egg: Math.floor(F.egg || 0), hoshika: FM.hoshika,
      grain: Object.keys(FM.GRAIN).filter((k) => (K.inv || {})[k] > 0).map((k) => ({ k, name: SGK.DATA.items[k].name, n: K.inv[k], esa: FM.GRAIN[k] })),
      fields: F.fields.map((f) => { const cr = f.c && FM.CROPS[f.c], stt = FM.state(f, d); return { k: f.c, c: cr ? cr.name : null, st: stt, stage: FM.stage(f, d), prog: cr ? Math.min(1, (d - f.d0) / cr.days) : 0, left: cr && stt === 'grow' ? Math.max(0, cr.days - (d - f.d0)) : 0, care: f.care, can: stt === 'grow' && d - f.td >= FM.tendGap && f.care < FM.careMax, dmg: f.dmg || 0, soil: Math.round(f.soil), q: Math.round(f.q), iss: f.iss, issName: f.iss ? FM.ISS[f.iss].name : null }; }),
      crops: Object.entries(FM.CROPS).map(([id, c]) => ({ id, name: c.name, seed: c.seed, days: c.days, months: c.months, ok: c.months.includes(m), draw: c.draw })),
      herd: herdOf(F).map((a, i) => { const A = FM.ANIMALS[a.k], ad = adult(a, d); return { i, k: a.k, name: A.name, nm: a.name, ad, left: ad ? 0 : A.days - (d - a.d0), prog: Math.min(1, (d - a.d0) / A.days), care: a.care, full: Math.round(a.full), nat: Math.round(a.nat), pet: a.nd !== d, val: FM.animalVal(a) }; }),
      acap: FM.animalCap(F), donated: s ? Math.round(s.donated || 0) : 0, devMul: s ? Math.round(FM.devMul(s) * 100) / 100 : 1,
      animals: Object.entries(FM.ANIMALS).map(([id, a]) => ({ id, name: a.name, cost: a.cost, days: a.days, esa: a.esa, breed: Math.max(0, FM.breedGap - (d - ((F.bd || {})[id] ?? -999))) })),
      hunt: p.hunt ? { n: p.hunt.n } : null,
      nt: nt ? { name: nt.name, cost: nt.cost } : null, ns: ns ? { name: ns.name, cost: ns.cost, max: ns.max } : null,
    };
    return r;
  };
})();
