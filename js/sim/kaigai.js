// 2.55.0 海外との商い（南蛮貿易）：九州・堺の湊で船を買い、求人（ガチャ）で船員を雇い、元手を積んで天川（マカオ）・呂宋・交趾・暹羅へ船を出す。
//  船は船頭たちが動かすので、本人は待たずに自由に動ける。何日かで湊に戻り、儲け（と、ときどき南蛮渡来の家宝）を持ち帰る。
//  船員：★1〜★4。航海（嵐に強い）・商い（儲けが増える）・腕っぷし（海賊に強い）の腕がある。航海のたびに経験を積んで育つ。
//  史実：南蛮船が来た湊は平戸（〜1561）→ 横瀬浦・福田・口之津 → 長崎（1571〜）。豊後（府内・臼杵）・薩摩（坊津）にもときどき。品を国内に広めたのは堺・博多の商人
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, C = SIM.commands, say = (pid, t) => SIM.say(pid, t);
  const KG = (SIM.KAIGAI = {});
  KG.PORTS = ['nagasaki', 'hirado', 'hakata', 'sakai', 'bonotsu', 'usuki']; // 船を出せる湊
  KG.SHIPS = {
    kobune: { name: '小廻りの弁才船', cost: 20000, slots: 4, cap: 30000, desc: '船員4人・元手30貫まで' },
    karabune: { name: '唐船', cost: 60000, slots: 6, cap: 80000, desc: '船員6人・元手80貫まで。嵐に少し強い', tough: 0.1 },
    ookbune: { name: '大船（南蛮風の船）', cost: 150000, slots: 8, cap: 200000, desc: '船員8人・元手200貫まで。嵐と海賊に強い', tough: 0.2 },
  };
  KG.sellShip = 0.5;
  // 行き先：days＝行って帰るまでの日数、mul＝儲けの倍率の元、risk＝嵐・海賊に遭う元、goods＝持ち帰る品の名（知らせ用）
  KG.DEST = {
    macau: { name: '天川（マカオ）', days: 24, mul: 1.3, risk: 0.14, goods: '生糸・絹織物', desc: 'ポルトガルの拠点。明の生糸を銀で買う' },
    luzon: { name: '呂宋（マニラ）', days: 18, mul: 1.2, risk: 0.11, goods: '蘇木・陶器', desc: 'いちばん近い。イスパニアの銀も集まる' },
    kochi: { name: '交趾（ホイアン）', days: 30, mul: 1.4, risk: 0.18, goods: '生糸・砂糖・香木', desc: '日本人の商人も多く住む湊町' },
    siam: { name: '暹羅（アユタヤ）', days: 40, mul: 1.55, risk: 0.22, goods: '鹿皮・蘇木・鮫皮', desc: 'いちばん遠いが、儲けも大きい' },
  };
  KG.minCrew = 2;
  KG.typhoon = [7, 8, 9]; // この月に出ると嵐に遭いやすい（1.6倍）
  KG.typhoonMul = 1.6;
  KG.nanbanDrop = 0.12; // 航海が無事なら、この確率で南蛮渡来の家宝を持ち帰る
  KG.maxCrew = 16;      // 抱えておける船員の数
  // 求人（ガチャ）
  KG.GACHA = { one: 1000, ten: 9000 }; // 10回は1割引で、★3以上が1人は必ず来る
  KG.RARE = [null, { w: 62, lo: 1, hi: 2, name: '水夫' }, { w: 28, lo: 2, hi: 4, name: '腕の立つ水夫' }, { w: 8.5, lo: 4, hi: 6, name: '船頭' }, { w: 1.5, lo: 6, hi: 8, name: '名のある船乗り' }];
  KG.JOBS = { nav: '航海', trade: '商い', fight: '腕っぷし' };
  KG.lvMax = 5; KG.lvExp = [0, 1, 3, 6, 10]; // 航海の回数で育つ（Lvごとに得意な腕+1）
  // ★4 は名前と得意が決まった者（重ねて来たら、その者の腕が上がる）
  KG.LEGEND = [
    { id: 'pedro', name: 'ペドロ', job: 'nav', title: '南蛮の水先案内', skill: '嵐を読む（嵐に遭いにくい）', sk: 'storm' },
    { id: 'rin', name: '林五官', job: 'trade', title: '唐人の大商人', skill: '唐の相場に明るい（儲け+10%）', sk: 'profit' },
    { id: 'gonroku', name: '鬼の権六', job: 'fight', title: '海賊あがりの荒くれ', skill: '海賊を追い払う（海賊に遭っても無事）', sk: 'pirate' },
    { id: 'oshio', name: 'お汐', job: 'nav', title: '瀬戸内の女船頭', skill: '潮を読む（航海の日数が2割短い）', sk: 'fast' },
  ];
  const SEI = ['弥', '与', '源', '孫', '彦', '甚', '吉', '藤', '助', '勘', '三', '太', '平', '新', '久', '半'];
  const MEI = ['助', '吉', '蔵', '八', '六', '七', '兵衛', '左衛門', '次', '作', '平', '太郎'];
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const isPort = (s) => !!(s && !s.site && KG.PORTS.includes(s.id));
  KG.isPort = isPort;
  const st = (p) => (p.kaigai = p.kaigai || { ship: null, port: null, crew: [], voy: null, nid: 1, log: [] });
  const R = (w) => SIM.rand(w);
  const ri = (w, a, b) => a + Math.floor(R(w) * (b - a + 1));
  const off = (p) => (SIM.GOSHO && SIM.GOSHO.off ? SIM.GOSHO.off(p) : 0);

  function roll(w, minR) {
    let r = 1;
    if (minR) { const t = KG.RARE.slice(minR).reduce((a, x) => a + x.w, 0); let u = R(w) * t; for (let i = minR; i <= 4; i++) { u -= KG.RARE[i].w; if (u <= 0) { r = i; break; } r = i; } }
    else { let u = R(w) * 100; for (let i = 1; i <= 4; i++) { u -= KG.RARE[i].w; if (u <= 0) { r = i; break; } r = i; } }
    return r;
  }
  function makeCrew(w, K, r) {
    const RR = KG.RARE[r], c = { id: 'c' + K.nid++, r, lv: 1, exp: 0, ride: true };
    if (r === 4) { const L = KG.LEGEND[ri(w, 0, KG.LEGEND.length - 1)]; Object.assign(c, { name: L.name, job: L.job, leg: L.id, title: L.title }); }
    else { c.name = SEI[ri(w, 0, SEI.length - 1)] + MEI[ri(w, 0, MEI.length - 1)]; c.job = Object.keys(KG.JOBS)[ri(w, 0, 2)]; c.title = RR.name; }
    c.nav = ri(w, RR.lo - 1, RR.hi - 1); c.trade = ri(w, RR.lo - 1, RR.hi - 1); c.fight = ri(w, RR.lo - 1, RR.hi - 1); c[c.job] = ri(w, RR.lo + 1, RR.hi + 1);
    return c;
  }
  const legOf = (c) => c.leg && KG.LEGEND.find((L) => L.id === c.leg);

  // ---- 求人（ガチャ） ----
  C.crewGacha = (w, p, c) => {
    const s = here(w, p); if (!isPort(s) || p.battle) return say(p.id, '船員の求人は湊（長崎・平戸・博多・堺・坊津・臼杵）で出せます');
    const K = st(p), ten = c.kind === 'ten', n = ten ? 10 : 1, cost = Math.round((ten ? KG.GACHA.ten : KG.GACHA.one) * (1 - off(p)));
    if (p.money < cost) return say(p.id, `お金が足りません（${SIM.money(cost)}）`);
    p.money -= cost;
    const got = [];
    for (let i = 0; i < n; i++) { let r = roll(w); if (ten && i === n - 1 && !got.some((x) => x.r >= 3)) r = roll(w, 3); got.push(makeCrew(w, K, r)); }
    const res = [];
    for (const g of got) {
      const same = g.leg && K.crew.find((x) => x.leg === g.leg);
      if (same) { same[same.job] += 1; res.push(Object.assign({}, g, { dup: true })); continue; } // 名のある船乗りが重なったら腕が上がる
      if (K.crew.length >= KG.maxCrew) { // 抱えきれないときは、いちばん下の者（航海に出ていない）より★が上なら入れ替える
        const sum = (x) => x.nav + x.trade + x.fight, wk = K.crew.filter((x) => !(K.voy && K.voy.crew.includes(x.id))).sort((a, b) => a.r - b.r || sum(a) - sum(b))[0];
        if (wk && g.r > wk.r) { K.crew.splice(K.crew.indexOf(wk), 1); K.crew.push(g); res.push(Object.assign({}, g, { swap: wk.name })); continue; }
        const pay = g.r * 300; p.money += pay; res.push(Object.assign({}, g, { full: pay })); continue;
      }
      K.crew.push(g); res.push(g);
    }
    p.gachaRes = { t: w.time.min, list: res.map((g) => ({ name: g.name, r: g.r, job: g.job, title: g.title, nav: g.nav, trade: g.trade, fight: g.fight, dup: !!g.dup, full: g.full || 0, swap: g.swap || '', leg: !!g.leg })) };
    const best = Math.max(...got.map((g) => g.r));
    say(p.id, `求人に${n}人が来ました（いちばん良いのは★${best}）${res.some((x) => x.swap) ? `。抱えきれないので${res.filter((x) => x.swap).map((x) => x.swap).join('・')}に暇を出しました` : ''}${res.some((x) => x.full) ? '。抱えきれない者には手間賃を渡して帰しました' : ''}`);
  };
  C.crewDismiss = (w, p, c) => { const K = st(p), i = K.crew.findIndex((x) => x.id === c.id); if (i < 0) return; if (K.voy && K.voy.crew.includes(c.id)) return say(p.id, '航海に出ている船員は暇を出せません'); const x = K.crew.splice(i, 1)[0]; say(p.id, `${x.name}に暇を出しました`); };
  C.crewRide = (w, p, c) => { const K = st(p), x = K.crew.find((y) => y.id === c.id); if (!x || (K.voy && K.voy.crew.includes(x.id))) return; x.ride = !x.ride; };

  // ---- 船 ----
  C.buyShip = (w, p, c) => {
    const s = here(w, p), S = KG.SHIPS[c.id]; if (!isPort(s) || !S || p.battle) return;
    const K = st(p); if (K.voy) return say(p.id, '船が航海から戻るまで買い替えられません');
    if (K.ship === c.id) return;
    const back = K.ship ? Math.round(KG.SHIPS[K.ship].cost * KG.sellShip) : 0;
    if (p.money + back < S.cost) return say(p.id, `お金が足りません（${SIM.money(S.cost - back)}${back ? '・今の船の下取りを引いた額' : ''}）`);
    p.money += back - S.cost; K.ship = c.id; K.port = s.id;
    say(p.id, `${S.name}を手に入れました${back ? `（今の船を${SIM.money(back)}で下取り）` : ''}。${s.name}の湊につないであります`);
  };
  C.moveShip = (w, p) => { const s = here(w, p), K = st(p); if (!isPort(s) || !K.ship || K.voy || K.port === s.id) return; const cost = 2000; if (p.money < cost) return say(p.id, `船を回すには${SIM.money(cost)}かかります`); p.money -= cost; K.port = s.id; say(p.id, `船を${s.name}の湊に回しました（${SIM.money(cost)}）`); };

  // ---- 航海 ----
  function crewSum(K, ids) { const o = { nav: 0, trade: 0, fight: 0, sk: {} }; for (const id of ids) { const c = K.crew.find((x) => x.id === id); if (!c) continue; o.nav += c.nav; o.trade += c.trade; o.fight += c.fight; const L = legOf(c); if (L) o.sk[L.sk] = 1; } return o; }
  function riders(K) { const S = KG.SHIPS[K.ship]; return K.crew.filter((c) => c.ride).sort((a, b) => b.r - a.r || (b.nav + b.trade + b.fight) - (a.nav + a.trade + a.fight)).slice(0, S ? S.slots : 0); }
  KG.preview = (p, dest) => {
    const K = st(p), D = KG.DEST[dest]; if (!K.ship || !D) return null;
    const cs = crewSum(K, riders(K).map((c) => c.id)), S = KG.SHIPS[K.ship];
    // 腕は合計で効くが、だんだん頭打ちになる（嵐・海賊は最大6割減、儲けは最大+25%）
    const sat = (v, k) => 1 - Math.exp(-v / k);
    const storm = Math.max(0.03, D.risk * (1 - 0.6 * sat(cs.nav, 20)) * (1 - (S.tough || 0)) * (cs.sk.storm ? 0.5 : 1));
    const pirate = Math.max(0.03, D.risk * 0.8 * (1 - 0.6 * sat(cs.fight, 20)) * (1 - (S.tough || 0) / 2));
    const mul = D.mul * (1 + 0.25 * sat(cs.trade, 25)) * (cs.sk.profit ? 1.1 : 1);
    return { storm, pirate: cs.sk.pirate ? 0 : pirate, mul, days: Math.round(D.days * (cs.sk.fast ? 0.8 : 1)), cs };
  };
  C.voyage = (w, p, c) => {
    const s = here(w, p), K = st(p), D = KG.DEST[c.kind]; if (!isPort(s) || !D || p.battle) return;
    if (!K.ship) return say(p.id, 'まず船を手に入れてください');
    if (K.port !== s.id) return say(p.id, `船は${(SIM.settlement(w, K.port) || {}).name || '別の湊'}につないであります`);
    if (K.voy) return say(p.id, '船はもう航海に出ています');
    const rs = riders(K); if (rs.length < KG.minCrew) return say(p.id, `船員が${KG.minCrew}人以上いないと船を出せません（求人で雇えます）`);
    const S = KG.SHIPS[K.ship], q = Math.floor(Math.min(+c.qty || 0, S.cap, p.money));
    if (q < 1000) return say(p.id, '元手は1貫以上積んでください');
    const pv = KG.preview(p, c.kind), m = SIM.month ? SIM.month(w) : 1;
    p.money -= q;
    K.voy = { dest: c.kind, money: q, crew: rs.map((x) => x.id), from: s.id, t0: w.time.min, until: w.time.min + pv.days * 1440, ty: KG.typhoon.includes(m) };
    say(p.id, `${S.name}が元手${SIM.money(q)}を積んで${D.name}へ出帆しました（${pv.days}日ほどで戻る見込み）${K.voy.ty ? '。野分（台風）の季節なので嵐に遭いやすい' : ''}`);
  };
  function finish(w, p, K) {
    const V = K.voy, D = KG.DEST[V.dest], S = KG.SHIPS[K.ship], pv = KG.preview(p, V.dest), cs = crewSum(K, V.crew);
    const storm = Math.min(0.9, pv.storm * (V.ty ? KG.typhoonMul : 1)), out = [];
    let val = V.money * pv.mul * (0.85 + R(w) * 0.3), ok = true;
    if (R(w) < storm) { const l = 0.3 + R(w) * 0.4; val *= 1 - l; ok = false; out.push(`嵐に遭い、荷の${Math.round(l * 100)}%を失いました`); }
    if (R(w) < pv.pirate) {
      if (R(w) < Math.min(0.85, 0.25 + cs.fight * 0.04)) { val *= 1.1; out.push('海賊に襲われましたが、追い払って逆に戦利品を得ました'); }
      else { const l = 0.4 + R(w) * 0.4; val *= 1 - l; ok = false; out.push(`海賊に襲われ、荷の${Math.round(l * 100)}%を奪われました`); }
    }
    val = Math.round(val); p.money += val;
    const prof = val - V.money;
    // 船員が育つ
    const ups = [];
    for (const id of V.crew) { const c = K.crew.find((x) => x.id === id); if (!c || c.lv >= KG.lvMax) continue; c.exp++; if (c.exp >= KG.lvExp[c.lv]) { c.lv++; c[c.job]++; ups.push(c.name); } }
    let drop = '';
    if (ok && R(w) < KG.nanbanDrop && SIM.GOSHO) { const ks = Object.keys(SIM.GOSHO.TAKARA).filter((k) => SIM.GOSHO.TAKARA[k].nanban), k = ks[Math.floor(R(w) * ks.length)], f = SIM.GOSHO.gotTakara(p, k); drop = `。南蛮渡来の家宝「${SIM.GOSHO.TAKARA[k].name}」も持ち帰りました${f ? `（${f}）` : ''}`; }
    if (ok) p.fame += 1;
    const port = (SIM.settlement(w, V.from) || {}).name || '湊';
    say(p.id, `${S.name}が${D.name}から${port}に戻りました。${out.join('。')}${out.length ? '。' : ''}${D.goods}などを売って${SIM.money(val)}（${prof >= 0 ? '儲け' : '損'}${SIM.money(Math.abs(prof))}）${drop}${ups.length ? `。${ups.join('・')}の腕が上がりました` : ''}`);
    if (prof > 0 && SIM.shoMerit) SIM.shoMerit(w, p, Math.min(80, 8 + prof / 600), `${D.name}との商い`);
    K.log.unshift({ d: day(w), dest: D.name, money: V.money, val, ok }); K.log = K.log.slice(0, 5);
    K.port = V.from; K.voy = null;
  }
  SIM.systems.push(function kaigai(w) {
    for (const p of Object.values(w.players)) { const K = p.kaigai; if (K && K.voy && w.time.min >= K.voy.until) finish(w, p, K); }
  });

  // ---- 本人に送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const K = p.kaigai;
    if (K && (K.ship || K.crew.length)) {
      const S = K.ship && KG.SHIPS[K.ship];
      r.me.kaigai = {
        ship: K.ship, shipName: S ? S.name : null, slots: S ? S.slots : 0, cap: S ? S.cap : 0, port: K.port, portName: K.port ? (SIM.settlement(w, K.port) || {}).name : null,
        crew: K.crew.slice().sort((a, b) => b.r - a.r || b.lv - a.lv).map((c) => { const L = legOf(c); return { id: c.id, name: c.name, r: c.r, job: c.job, title: c.title, lv: c.lv, nav: c.nav, trade: c.trade, fight: c.fight, ride: c.ride, skill: L ? L.skill : null, away: !!(K.voy && K.voy.crew.includes(c.id)) }; }),
        riders: S ? riders(K).map((c) => c.id) : [],
        voy: K.voy ? { dest: KG.DEST[K.voy.dest].name, money: K.voy.money, left: Math.max(0, Math.ceil((K.voy.until - w.time.min) / 1440)) } : null,
        log: K.log || [],
        prev: S && !K.voy ? Object.fromEntries(Object.keys(KG.DEST).map((d) => { const v = KG.preview(p, d); return [d, { storm: Math.round(v.storm * 100), pirate: Math.round(v.pirate * 100), mul: Math.round(v.mul * 100) / 100, days: v.days }]; })) : null,
      };
    }
    if (p.gachaRes && w.time.min - p.gachaRes.t < 60) r.me.gachaRes = p.gachaRes;
    const s = here(w, p);
    if (r.here && isPort(s)) r.here.port = { gacha: { one: Math.round(KG.GACHA.one * (1 - off(p))), ten: Math.round(KG.GACHA.ten * (1 - off(p))) } };
    return r;
  };
})();
