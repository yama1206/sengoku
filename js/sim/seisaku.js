// 0.71.0 季節の出来事（夏の洪水・秋の豊作/凶作・冬の積雪）と、家の蔵・上納・政策
(function () {
  const SIM = SGK.SIM;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ll = (lat, lon) => ({ x: (lon - 129.4) * 91, y: (41.6 - lat) * 111 });
  let W = null; // いまの世界（年貢などの式から家の政策を見るため。ホストで毎回入れ直す）
  const SZ = SIM.SEASON = { flood: 0.2, floodLoss: 0.05, harvest: 0.3, snow: 0.5, snowSpd: 0.6, harvTax: 0.15 };

  // ---- 暦 ----
  const dayIdx = (w) => { const st = SGK.DATA.start; return Math.floor((st.minute + w.time.min) / 1440) + (st.month - 1) * 30 + (st.day - 1); };
  const monthOf = (di) => Math.floor((di % 360) / 30) + 1;

  // ---- 豪雪地帯（日本海側・山国）。中心と半径km ----
  const SNOW = [[37.5, 138.8, 110], [36.7, 136.9, 80], [35.95, 136.2, 50], [36.2, 137.25, 40], [35.55, 136.25, 22], [36.75, 138.3, 35], [37.5, 139.9, 45], [38.8, 140.2, 120], [40.6, 140.5, 70], [35.45, 134.6, 45], [35.25, 133.4, 35]]
    .map(([la, lo, r]) => Object.assign(ll(la, lo), { r }));
  const snowZone = (x, y) => { for (let i = 0; i < SNOW.length; i++) if (Math.hypot(x - SNOW[i].x, y - SNOW[i].y) < SNOW[i].r) return i; return -1; };
  SIM.snowAt = (w, x, y) => { const z = snowZone(x, y); return z >= 0 && !!(w && w.snow && w.snow.includes(z)); };

  // ---- その場所を治める城（30km以内でいちばん近い城）。5kmのます目ごとに覚える ----
  const cell = new Map(); let byId = null, byIdW = null;
  const sOf = (w, id) => { if (byIdW !== w) { byIdW = w; byId = new Map(w.settlements.map((s) => [s.id, s])); } return byId.get(id) || null; };
  function castleAt(x, y) {
    const k = Math.floor(x / 5) * 10000 + Math.floor(y / 5);
    if (!cell.has(k)) { let best = '', bd = 30; for (const c of SGK.DATA.settlements) if (c.type === 'castle') { const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = c.id; } } cell.set(k, best); }
    return cell.get(k);
  }
  const ownerAt = (w, x, y) => { const id = castleAt(x, y), s = id && sOf(w, id); return s ? s.owner : null; };
  const castleOfS = (w, s) => (s.type === 'castle' ? s : (SIM.ryoOf && sOf(w, SIM.ryoOf(s.id))) || null);

  // ---- 政策 ----
  const P = SIM.POLICY = {
    rakuichi: { name: '楽市楽座', cost: 3000, up: 300, text: '家の町の品物の生産+15%（物資が集まり人が増えやすい）。町からの上がり-10%' },
    kenchi: { name: '検地', cost: 2000, up: 200, text: '年貢・領内の上がり+15%。人口の増え方が少し下がる' },
    sekisho: { name: '関所撤廃', cost: 1500, up: 100, text: '領内の移動+15%・村や町の生産+5%。城主と大名の収入-5%' },
    shinden: { name: '新田開発', cost: 2500, up: 150, text: '村の米の生産+20%。凶作が起きにくくなる' },
    joka: { name: '城下町整備', cost: 3000, up: 200, text: '城のある拠点の人口の上限+30%' },
    chisui: { name: '治水', cost: 5000, up: 300, text: '人口の上限+15%。洪水が起きにくく、被害も半分' },
    // 大名ごとの固有政策
    heino: { name: '兵農分離', only: 'oda', cost: 3000, up: 400, text: '集まる兵+30%' },
    rakuichirei: { name: '楽市令', only: 'rokkaku', cost: 2500, up: 200, text: '家の町の品物の生産+25%（上がりは減らない）' },
    kanamokuroku: { name: '今川仮名目録', only: 'imagawa', cost: 2000, up: 150, text: '年貢・領内の上がり+15%（人口の増え方は下がらない）' },
    shingenzutsumi: { name: '信玄堤', only: 'takeda', cost: 2500, up: 150, text: '治水と同じ効き目（人口の上限+15%・洪水が起きにくく被害も半分）' },
    shikou: { name: '四公六民', only: 'hojo', cost: 1500, up: 100, text: '年貢・領内の上がり-15%。人口がよく増える' },
    sanbon: { name: '三本の矢', only: 'mori', cost: 2000, up: 100, text: '上納を上げても城主の忠誠が下がらない' },
    egoshu: { name: '堺の会合衆', only: 'miyoshi', cost: 2500, up: 200, text: '家の拠点で鉄・茶・酒・木綿・塩が15%安く買える' },
    yukiguni: { name: '雪国の備え', only: 'nagao', cost: 2000, up: 100, text: '領内は積雪でも遅くなりにくい・兵糧の減りが3割少ない' },
    nanban: { name: '南蛮貿易', only: 'otomo', cost: 3000, up: 200, text: '湊町の上がり+30%・家の拠点で鉄が15%安く買える' },
    monto: { name: '門徒動員', only: 'honganji', cost: 2000, up: 200, text: '集まる兵+40%' },
    // プレイヤーの家（3つから1つ選ぶ）
    goyo: { name: '御用商人', mine: true, cost: 2500, up: 150, text: '家の町の品物の生産+15%・家の拠点で品物が10%安く買える' },
    gunyaku: { name: '軍役の定め', mine: true, cost: 2500, up: 250, text: '集まる兵+25%' },
    jinsei: { name: '仁政', mine: true, cost: 2000, up: 150, text: '人口の増え方が上がる・城主の忠誠が上がる' },
  };
  const COOL = 180; // やめてから同じ政策をまた使えるまでの日数
  const has = (fid, id) => { const f = W && fid && W.factions[fid]; return !!(f && f.pol && f.pol[id] != null); };
  const canUse = (w, fid, id) => { const f = w.factions[fid], q = P[id]; return !!(f && q && (q.only ? q.only === fid : q.mine ? f.player && f.mine === id : true)); };

  // ---- 効き目（ほかのファイルの式にかける） ----
  function harvMul(s) { const c = W && castleOfS(W, s); return c && c.harv && c.harv.until > dayIdx(W) ? 1 + c.harv.v * SZ.harvTax : 1; }
  SIM.incMul = (s) => {
    if (!s) return 1; const o = s.owner; let m = 1;
    if (has(o, 'kenchi') || has(o, 'kanamokuroku')) m *= 1.15;
    if (has(o, 'shikou')) m *= 0.85;
    if (has(o, 'sekisho')) m *= 0.95;
    if (s.type === 'town' && has(o, 'rakuichi') && !has(o, 'rakuichirei')) m *= 0.9;
    if (SIM.minato && SIM.minato(s) && has(o, 'nanban')) m *= 1.3;
    return m * harvMul(s);
  };
  { const t0 = SIM.tax; SIM.tax = (p, s) => Math.round((t0(p, s) * SIM.incMul(s)) / 10) * 10; }
  { const p0 = SIM.poolMul; if (p0) SIM.poolMul = (s) => p0(s) * (has(s.owner, 'heino') ? 1.3 : 1) * (has(s.owner, 'monto') ? 1.4 : 1) * (has(s.owner, 'gunyaku') ? 1.25 : 1); }
  SIM.prodItemMul = (s, k) => {
    const o = s.owner; let m = 1;
    if (s.type === 'town') m *= has(o, 'rakuichirei') ? 1.25 : has(o, 'rakuichi') || has(o, 'goyo') ? 1.15 : 1;
    if (s.type !== 'castle' && has(o, 'sekisho')) m *= 1.05;
    if (k === 'rice') { if (s.type === 'village' && has(o, 'shinden')) m *= 1.2; m *= harvMul(s); }
    return m;
  };
  const TRADE = ['iron', 'tea', 'sake', 'cotton', 'salt'];
  { const b0 = SIM.buyPrice; SIM.buyPrice = (s, k, p) => { let m = 1; const o = s && s.owner; if (has(o, 'egoshu') && TRADE.includes(k)) m *= 0.85; if (has(o, 'nanban') && k === 'iron') m *= 0.85; if (has(o, 'goyo')) m *= 0.9; return Math.ceil(b0(s, k, p) * m); }; }
  SIM.popMod = (w, s) => {
    const o = s.owner; let g = 0, cap = 1;
    if (has(o, 'kenchi')) g -= 0.003;
    if (has(o, 'shikou')) g += 0.006;
    if (has(o, 'jinsei')) g += 0.004;
    if (s.type === 'castle' && has(o, 'joka')) cap *= 1.3;
    if (has(o, 'chisui') || has(o, 'shingenzutsumi')) cap *= 1.15;
    return { g, cap };
  };
  { const sp0 = SIM.speedAt; SIM.speedAt = (x, y) => {
    let v = sp0(x, y); if (!W) return v;
    const o = ownerAt(W, x, y);
    if (SIM.snowAt(W, x, y)) v *= has(o, 'yukiguni') ? 0.9 : SZ.snowSpd;
    if (o && has(o, 'sekisho')) v *= 1.15;
    return v;
  }; }
  SIM.riceRate = (p) => (p && has(p.clan, 'yukiguni') ? 0.7 : 1);
  SIM.riceSkip = (w, n) => has(n.faction, 'yukiguni') && rnd(w) < 0.3;
  SIM.factionBuff = () => null; // 0.71.0 大名ごとの兵種の強化はなくした

  // ---- 季節の出来事（月のはじめ） ----
  const news = (w, m) => SIM.newsTo && SIM.newsTo(w, m);
  const tell = (w, s, m) => { const h = s.holder && w.players[s.holder]; if (h) SIM.say(h.id, m); news(w, m); };
  const ryo = (w, c) => [c].concat(SIM.landsOf ? SIM.landsOf(w, c) : []);
  // 0.72.0 田植え（5月）：農民は田に出ていて戦に加われない
  SIM.taue = (w) => monthOf(dayIdx(w)) === 5;
  function season(w, di) {
    const m = monthOf(di), castles = w.settlements.filter((s) => s.type === 'castle' && !s.site);
    if (m === 5) news(w, '田植えの季節です。今月は農民が田に出ていて、農兵は戦に加われません（雇うこともできません）');
    if (m === 6) news(w, '田植えが終わり、農兵がまた戦に加われるようになりました');
    if (m === 7) for (const c of castles) { // 夏：台風の洪水
      const ch = has(c.owner, 'chisui') || has(c.owner, 'shingenzutsumi');
      if (rnd(w) >= SZ.flood * (ch ? 0.5 : 1)) continue;
      const loss = SZ.floodLoss * (ch ? 0.5 : 1); for (const x of ryo(w, c)) if (x.pop) x.pop = Math.round(x.pop * (1 - loss));
      tell(w, c, `${c.name}の領内で台風による洪水が起き、人が流されました（人口-${Math.round(loss * 100)}%）`);
    }
    if (m === 9) for (const c of castles) { // 秋：豊作・凶作
      if (rnd(w) >= SZ.harvest) continue;
      const bad = rnd(w) < (has(c.owner, 'shinden') ? 0.25 : 0.5);
      c.harv = { v: bad ? -1 : 1, until: di + 360 };
      for (const x of ryo(w, c)) if (x.stock && x.stock.rice != null) x.stock.rice *= bad ? 0.5 : 1.5;
      tell(w, c, bad ? `${c.name}の領内は凶作です。この一年、米が少なく年貢も減ります` : `${c.name}の領内は豊作です。この一年、米がよくとれ年貢も増えます`);
    }
    if (m === 12 || m === 1 || m === 2) { // 冬：豪雪地帯の積雪
      w.snow = SNOW.map((_, i) => i).filter(() => rnd(w) < SZ.snow);
      for (const p of Object.values(w.players)) if (SIM.snowAt(w, p.x, p.y)) SIM.say(p.id, '雪が積もり、道が歩きにくくなっています');
    } else if (w.snow && w.snow.length) { w.snow = []; }
  }

  // ---- 家の蔵・上納・政策の維持（月に1回） ----
  const npcInc = (w, s) => Math.round((1500 * (SIM.popF ? SIM.popF(s) : 1) + (SIM.landsOf ? SIM.landsOf(w, s).length : 0) * 500) * SIM.incMul(s));
  const jonoOf = (w, fid) => { const f = w.factions[fid]; if (f.jono == null) { let h = 0; for (const ch of fid) h = (h * 31 + ch.charCodeAt(0)) % 97; f.jono = f.player ? 0.2 : [0.15, 0.2, 0.25, 0.3][h % 4]; } return f.jono; };
  const leaderP = (w, f) => (f.player && w.players[f.leader]) || null;
  const purse = (w, f) => { const lp = leaderP(w, f); return lp ? lp.money : f.kura || 0; };
  const pay = (w, f, v) => { const lp = leaderP(w, f); if (lp) lp.money += v; else f.kura = (f.kura || 0) + v; };
  function houseMonth(w, di) {
    for (const [fid, f] of Object.entries(w.factions)) {
      if (f.dead) continue;
      const cs = w.settlements.filter((s) => s.type === 'castle' && s.owner === fid && !s.site); if (!cs.length) continue;
      const rate = jonoOf(w, fid), lp = leaderP(w, f); let inc = 0;
      for (const s of cs) {
        const hp = s.holder && w.players[s.holder];
        if (hp && hp.id !== f.leader) { // プレイヤーの城主：年貢と領内の上がりから納める
          const owed = Math.round(((SIM.tax(hp, s) || 0) + (SIM.landsIncome ? SIM.landsIncome(w, hp, s) : 0)) * rate / 10) * 10, t = Math.max(0, Math.min(owed, hp.money));
          if (t > 0) { hp.money -= t; inc += t; SIM.say(hp.id, `${s.name}の上がりから${f.name}へ上納しました（${Math.round(rate * 100)}%・${SIM.money(t)}）`); }
        } else if (!hp && s.lord && s.lord !== f.leader) inc += npcInc(w, s) * rate; // CPUの城主
        else if (!hp && !lp) inc += npcInc(w, s) * 0.6; // CPUの大名の直轄
      }
      inc = Math.round(inc / 10) * 10;
      if (inc > 0) { pay(w, f, inc); if (lp) SIM.say(lp.id, `城主たちから上納${SIM.money(inc)}が納められました`); }
      // 政策の維持費。払えなければ高いものからやめる
      f.pol = f.pol || {}; f.cool = f.cool || {};
      let up = Object.keys(f.pol).reduce((a, k) => a + (P[k] ? P[k].up : 0), 0);
      while (up > 0 && purse(w, f) < up) {
        const k = Object.keys(f.pol).sort((a, b) => P[b].up - P[a].up)[0]; stop(w, f, k, di); up -= P[k].up;
        if (lp) SIM.say(lp.id, `お金が足りず、政策「${P[k].name}」をやめました`);
      }
      if (up > 0) pay(w, f, -up);
      // 忠誠：上納2割を超えると下がり、下回ると上がる（三本の矢は下がらない・仁政は上がる）
      for (const s of cs) {
        const pr = s.lord && s.lord !== f.leader && w.people[s.lord]; if (!pr || pr.loyal == null) continue;
        let d = -(rate - 0.2) * 4; if (has(fid, 'sanbon')) d = Math.max(0, d); if (has(fid, 'jinsei')) d += 1;
        pr.loyal = Math.max(0, Math.min(100, Math.round(pr.loyal + d)));
      }
      if (!lp) npcPolicy(w, fid, f, di);
    }
  }
  function stop(w, f, k, di) { delete f.pol[k]; f.cool = f.cool || {}; f.cool[k] = di + COOL; }
  function start(w, fid, f, k, di) { pay(w, f, -P[k].cost); f.pol = f.pol || {}; f.pol[k] = di; }
  // CPUの大名：蔵に余裕があれば政策を始める（固有を先に）
  function npcPolicy(w, fid, f, di) {
    if (rnd(w) > 0.4) return; // 0.72.0 枠はなし（蔵の余裕だけで決める）
    const ids = Object.keys(P).filter((k) => canUse(w, fid, k) && f.pol[k] == null && !((f.cool || {})[k] > di));
    const uniq = ids.filter((k) => P[k].only), pick = uniq.length ? uniq[0] : ids[Math.floor(rnd(w) * ids.length)];
    if (!pick) return;
    const upAll = Object.keys(f.pol).reduce((a, k) => a + P[k].up, 0) + P[pick].up;
    if ((f.kura || 0) < P[pick].cost + upAll * 6) return;
    start(w, fid, f, pick, di);
    news(w, `${f.name}が「${P[pick].name}」を始めたそうです`);
  }

  SIM.systems.push(function seisaku(w) {
    W = w;
    const di = dayIdx(w), mi = Math.floor(di / 30);
    if (w.sm == null) w.sm = mi;
    while (w.sm < mi) { w.sm++; season(w, w.sm * 30); }
    if (w.hday == null) w.hday = di;
    while (w.hday < di) { w.hday++; if (w.hday % 30 === 3) houseMonth(w, w.hday); }
  });

  // ---- コマンド（当主だけ） ----
  const myHouse = (w, p) => { const f = p.clan && w.factions[p.clan]; return f && f.player && f.leader === p.id ? f : null; };
  SIM.commands.setPolicy = (w, p, c) => {
    const f = myHouse(w, p); if (!f) return SIM.say(p.id, '政策は当主（大名）だけが決められます');
    const k = c.id, q = P[k], di = dayIdx(w); f.pol = f.pol || {};
    if (!q || !canUse(w, p.clan, k)) return SIM.say(p.id, 'その政策は使えません');
    if (f.pol[k] != null) { stop(w, f, k, di); return SIM.say(p.id, `政策「${q.name}」をやめました（${COOL}日たつとまた使えます）`); }
    if ((f.cool || {})[k] > di) return SIM.say(p.id, `「${q.name}」はやめたばかりです。あと${f.cool[k] - di}日で使えます`);
    if (p.money < q.cost) return SIM.say(p.id, `お金が足りません（${SIM.money(q.cost)}）`);
    start(w, p.clan, f, k, di); SIM.say(p.id, `政策「${q.name}」を始めました（${SIM.money(q.cost)}・毎月${SIM.money(q.up)}）`);
  };
  SIM.commands.setJono = (w, p, c) => {
    const f = myHouse(w, p); if (!f) return SIM.say(p.id, '上納の割合は当主（大名）だけが決められます');
    f.jono = Math.max(0.1, Math.min(0.4, Math.round((jonoOf(w, p.clan) + (+c.qty > 0 ? 0.05 : -0.05)) * 100) / 100));
    SIM.say(p.id, `上納を${Math.round(f.jono * 100)}%にしました${f.jono > 0.2 ? '（城主の忠誠が下がっていきます）' : f.jono < 0.2 ? '（城主の忠誠が上がっていきます）' : ''}`);
  };
  SIM.commands.pickMine = (w, p, c) => {
    const f = myHouse(w, p); if (!f) return SIM.say(p.id, '当主（大名）だけが選べます');
    if (f.mine) return SIM.say(p.id, 'もう家の固有政策を選んでいます');
    if (!P[c.id] || !P[c.id].mine) return;
    f.mine = c.id; SIM.say(p.id, `家の固有政策を「${P[c.id].name}」に決めました`);
  };

  // ---- 本人に送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid], f = p && p.clan && w.factions[p.clan];
    if (r && r.me && f) {
      const di = dayIdx(w), lead = f.player && f.leader === p.id;
      r.me.pol = {
        house: f.name, lead, jono: Math.round(jonoOf(w, p.clan) * 100), kura: lead ? p.money : null,
        on: Object.keys(f.pol || {}).filter((k) => P[k]).map((k) => [k, P[k].name, P[k].text, P[k].up]),
        list: lead ? Object.keys(P).filter((k) => canUse(w, p.clan, k) && !(f.pol || {})[k]).map((k) => [k, P[k].name, P[k].text, P[k].cost, P[k].up, Math.max(0, ((f.cool || {})[k] || 0) - di)]) : [],
        mine: lead && !f.mine ? Object.keys(P).filter((k) => P[k].mine).map((k) => [k, P[k].name, P[k].text]) : null,
      };
    }
    return r;
  };
})();
