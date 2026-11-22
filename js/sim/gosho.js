// 2.55.0 豪商と商人：大きな町には豪商がいて、家宝（名品の武具・茶器・南蛮渡来の品）はここでしか買えない。
//  豪商に奉公すると商人になれる（丁稚・手代・番頭・大番頭。足軽・足軽組頭・侍大将・部将と同じ格）。
//  商人は荷を多く持て、荷が重くても遅くなりにくい。毎月の給金・豪商の頼まれごと・商いの儲け・海外との商いで功績を積んで格が上がる。
//  武士・忍びから奉公すると格はそのまま（主家には暇をもらう。出奔ではないので名声は減らない）。元の主家に戻れば元の格で仕えられる。
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, C = SIM.commands, say = (pid, t) => SIM.say(pid, t);
  const GS = (SIM.GOSHO = {});
  // 大きな町の豪商（名前は作ったもの）
  GS.HOUSES = {
    kyo: { ya: '錦屋', name: '宗玄' }, sakai: { ya: '納屋', name: '宗佐' }, hakata: { ya: '筑紫屋', name: '宗伯' },
    yamaguchi: { ya: '周防屋', name: '道寿' }, tsuruga: { ya: '敦賀屋', name: '久兵衛' }, niigata: { ya: '越後屋', name: '弥平次' },
    sakata: { ya: '出羽屋', name: '清兵衛' }, shinagawa: { ya: '武蔵屋', name: '長右衛門' }, tsushima: { ya: '尾張屋', name: '甚左衛門' },
    utazu: { ya: '讃岐屋', name: '与兵衛' },
  };
  // 商人の格（武士の足軽〜部将と同じ格。merit・fame は rank.js の RANKS と同じ）
  GS.RANKS = [null,
    { name: '丁稚', pay: 200, carry: 1.3, pow: 0.6, min: 0.35, off: 0.05, desc: '奉公したばかり。荷を多く持て、荷が重くても遅くなりにくい。湊で船員を雇える' },
    { name: '手代', pay: 600, carry: 1.5, pow: 0.5, min: 0.4, off: 0.1, desc: '商いを任される。荷をさらに多く持てる。弁才船で海外と商いができる' },
    { name: '番頭', pay: 1400, carry: 1.7, pow: 0.4, min: 0.45, off: 0.15, desc: '店を切り盛りする。唐船を持てる' },
    { name: '大番頭', pay: 2800, carry: 2.0, pow: 0.3, min: 0.5, off: 0.2, desc: '豪商の右腕。大船を持てる。元手があれば独立して店を持てる' },
    { name: '店主', pay: 0, carry: 2.2, pow: 0.25, min: 0.55, off: 0.2, desc: '独立して自分の店を持つ（2.56.0）。給金はなく、店の売上で稼ぐ' },
  ];
  // 家宝：名品の武具（equip.js の castle:true）と、茶器・南蛮渡来の品。fame＝初めて手に入れたときの名声、kenjo＝主家に献上したときの功績
  GS.TAKARA = {
    chaire: { name: '唐物茶入「秋霧」', price: 45000, fame: 10, kenjo: 150, desc: '茶の湯の名物。持っているだけで一目置かれる' },
    tenmoku: { name: '天目茶碗「星屑」', price: 32000, fame: 8, kenjo: 110, desc: '黒い釉に星のような斑の浮かぶ茶碗' },
    jiku: { name: '墨絵の掛軸「寒山」', price: 22000, fame: 5, kenjo: 70, desc: '名のある絵師の墨絵' },
    koro: { name: '青磁の香炉「浜風」', price: 26000, fame: 6, kenjo: 85, desc: '海を渡ってきた青磁の香炉' },
    tokei: { name: '南蛮の時計', price: 38000, fame: 9, kenjo: 130, nanban: true, desc: '南蛮渡来の、ひとりでに時を刻む器械' },
    megane: { name: '南蛮の遠眼鏡', price: 30000, fame: 7, kenjo: 100, nanban: true, desc: '遠くの物が近くに見える南蛮の筒' },
    byobu: { name: '南蛮屏風', price: 50000, fame: 12, kenjo: 170, nanban: true, desc: '南蛮船と南蛮人を描いた屏風' },
  };
  GS.NANBAN_TOWNS = ['sakai', 'hakata', 'yamaguchi']; // 南蛮渡来の家宝が並ぶ町
  GS.stockN = 3;        // 一度に並ぶ家宝の数
  GS.stockDays = 30;    // 品が入れ替わる間隔（日）
  GS.sellBack = 0.7;    // 家宝を豪商に売ると7割
  GS.tradeMerit = 400;  // 商人が市場で儲けた額 400文ごとに功績1（1回の売りで最大15）
  GS.taskN = 2;         // 豪商の頼まれごとの数
  const RK = () => SIM.RANKS;
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const isBig = (s) => !!(s && !s.site && SGK.DATA.isBig(s) && GS.HOUSES[s.id]);
  const houseName = (id) => { const h = GS.HOUSES[id]; return h ? `${h.ya}${h.name}` : '豪商'; };
  GS.houseName = houseName;
  const sho = (p) => (p.sho && p.sho.rank ? p.sho : null);
  SIM.isMerchant = (p) => !!sho(p);
  const setSt = (p) => { const S = sho(p); if (S) p.status = S.own ? `${S.ya} 店主` : `${GS.HOUSES[S.house] ? GS.HOUSES[S.house].ya : ''} ${GS.RANKS[S.rank].name}`; };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // ---- 家宝の品ぞろえ（町ごと・30日ごとに入れ替わる。売れた品はその間は品切れ） ----
  function gearPool() { const E = SIM.EQUIP, out = []; for (const sl of ['wep', 'arm', 'horse']) for (const id in E[sl]) if (E[sl][id].castle) out.push('g:' + id); return out; }
  function stock(w, s) {
    w.gosho = w.gosho || {};
    const per = Math.floor(day(w) / GS.stockDays); let G = w.gosho[s.id];
    if (!G || G.per !== per) {
      const pool = gearPool().concat(Object.keys(GS.TAKARA).filter((k) => !GS.TAKARA[k].nanban || GS.NANBAN_TOWNS.includes(s.id)).map((k) => 't:' + k));
      const items = []; let h = hash(s.id + ':' + per);
      while (items.length < Math.min(GS.stockN, pool.length)) { h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; const k = pool[h % pool.length]; if (!items.includes(k)) items.push(k); }
      G = w.gosho[s.id] = { per, items, sold: [], tasks: G && G.per === per ? G.tasks : null };
    }
    return G;
  }
  const off = (p) => { const S = sho(p); return S ? GS.RANKS[S.rank].off : 0; };
  GS.off = off;
  function kahoInfo(k) {
    const [t, id] = k.split(':');
    if (t === 't') { const T = GS.TAKARA[id]; return T && { k, kind: 'takara', id, name: T.name, price: T.price, desc: T.desc, fame: T.fame, kenjo: T.kenjo }; }
    const sl = SIM.EQUIP.slotOf(id), e = sl && SIM.EQUIP[sl][id]; if (!e) return null;
    const eff = sl === 'wep' ? `${SIM.EQUIP.kindName[e.kind]}・攻撃+${e.atk}` : sl === 'arm' ? `守り+${e.da}` : `1日の移動+${e.km}km・荷+${e.cw}kg`;
    return { k, kind: 'gear', id, slot: sl, name: e.name, price: Math.round(e.cost * 1.5), desc: `名品の${SIM.EQUIP.slotName[sl]}（${eff}）` };
  }
  GS.kahoInfo = kahoInfo;
  const gotTakara = (p, id) => {
    const T = GS.TAKARA[id]; p.takara = p.takara || {}; p.takara[id] = (p.takara[id] || 0) + 1;
    p.takaraSeen = p.takaraSeen || {};
    if (!p.takaraSeen[id]) { p.takaraSeen[id] = 1; p.fame += T.fame; return `名声+${T.fame}`; }
    return '';
  };
  GS.gotTakara = gotTakara;

  // ---- 豪商の頼まれごと：品を納める（町ごと・30日ごと。商人なら功績も） ----
  function tasks(w, s) {
    const G = stock(w, s); if (G.tasks) return G.tasks;
    const I = SGK.DATA.items, ks = Object.keys(I).filter((k) => !I[k].mine && k !== 'firewood' && k !== 'rice'); let h = hash('t' + s.id + G.per);
    G.tasks = [];
    for (let i = 0; i < GS.taskN; i++) {
      h = Math.imul(h ^ (h >>> 13), 1103515245) + 12345 >>> 0; const item = ks[h % ks.length]; const qty = 6 + (h >>> 8) % 10;
      G.tasks.push({ id: `${s.id}-${G.per}-${i}`, item, qty, reward: Math.round(I[item].base * qty * 1.6 / 10) * 10, merit: 10 + Math.round(I[item].base * qty / 250), done: false });
    }
    return G.tasks;
  }

  // ---- コマンド ----
  C.buyKaho = (w, p, c) => {
    const s = here(w, p); if (!isBig(s) || p.battle) return;
    const G = stock(w, s), k = c.id; if (!G.items.includes(k) || G.sold.includes(k)) return say(p.id, 'その品はもうありません');
    const K = kahoInfo(k); if (!K) return;
    const price = Math.round(K.price * (1 - GS.off(p, s.id)));
    if (p.money < price) return say(p.id, `お金が足りません（${SIM.money(price)}）`);
    p.money -= price; G.sold.push(k);
    if (K.kind === 'gear') { p.gear = p.gear || {}; p.gear[K.id] = (p.gear[K.id] || 0) + 1; say(p.id, `${houseName(s.id)}から家宝「${K.name}」を${SIM.money(price)}で買いました（人物の装備タブで付けられます）`); }
    else { const f = gotTakara(p, K.id); say(p.id, `${houseName(s.id)}から家宝「${K.name}」を${SIM.money(price)}で買いました${f ? `（${f}）` : ''}`); }
  };
  C.sellTakara = (w, p, c) => {
    const s = here(w, p); if (!isBig(s) || p.battle) return; const T = GS.TAKARA[c.id];
    if (!T || !(p.takara && p.takara[c.id] > 0)) return;
    const v = Math.round(T.price * GS.sellBack); p.takara[c.id]--; if (!p.takara[c.id]) delete p.takara[c.id]; p.money += v;
    say(p.id, `${T.name}を${houseName(s.id)}に${SIM.money(v)}で売りました`);
  };
  C.kenjo = (w, p, c) => { // 主家の城で家宝を献上して功績を得る
    const s = here(w, p), T = GS.TAKARA[c.id]; if (!T || !(p.takara && p.takara[c.id] > 0) || p.battle) return;
    if (!s || s.type !== 'castle' || !p.clan || s.owner !== p.clan) return say(p.id, '主家の城で献上できます');
    p.takara[c.id]--; if (!p.takara[c.id]) delete p.takara[c.id];
    say(p.id, `${T.name}を主家に献上しました`); if (SIM.addMerit) SIM.addMerit(w, p, T.kenjo, `家宝「${T.name}」の献上`);
  };
  C.goshoTask = (w, p, c) => {
    const s = here(w, p); if (!isBig(s) || p.battle) return; const t = tasks(w, s).find((x) => x.id === c.id); if (!t || t.done) return;
    const it = SGK.DATA.items[t.item], have = (p.inv || {})[t.item] || 0;
    if (have < t.qty) return say(p.id, `${it.name}が${t.qty - have}${it.unit}足りません`);
    p.inv[t.item] -= t.qty; if (!p.inv[t.item]) { delete p.inv[t.item]; if (p.cost) delete p.cost[t.item]; }
    t.done = true; p.money += t.reward;
    say(p.id, `${houseName(s.id)}に${it.name}${t.qty}${it.unit}を納め、${SIM.money(t.reward)}を受け取りました`);
    shoMerit(w, p, t.merit, `${houseName(s.id)}の頼まれごと`);
  };
  // 奉公する（商人になる）
  C.shoJoin = (w, p) => {
    const s = here(w, p); if (!isBig(s) || p.battle || p.busy) return;
    if (sho(p)) return say(p.id, `すでに${houseName(p.sho.house)}に奉公しています`);
    if (p.camp) return say(p.id, '陣を敷いている間は奉公できません');
    if (p.allies) return say(p.id, '陣触れで集めた軍勢を率いている間は奉公できません');
    if (p.clan && (p.rank >= 5 || (RK()[p.rank] || {}).indep)) return say(p.id, '城を任されている身分（城主より上）は商人になれません');
    if (p.fame < RK()[1].fame) return say(p.id, `奉公するには名声${RK()[1].fame}が必要です（いま${Math.floor(p.fame)}）`);
    let g = 1, prev = null, msg = '';
    if (p.clan) {
      g = Math.max(1, Math.min(4, p.rank)); prev = p.clan; const f = (w.factions[p.clan] || {}).name || '';
      if (p.nin && p.ninQ) p.ninQ = null;
      p.nin = false; p.clan = null; p.rank = 0; p.merit = 0; p.promoteHint = 0;
      msg = `${f}に暇をもらい、`;
    }
    p.sho = { house: s.id, rank: g, merit: 0, prev, prevRank: prev ? g : 0, pd: day(w), hint: 0 }; setSt(p);
    say(p.id, `${msg}${houseName(s.id)}に${GS.RANKS[g].name}として奉公することになりました！ 荷を多く持て、重くても遅くなりにくくなります`);
  };
  C.shoPromote = (w, p) => {
    const S = sho(p), s = here(w, p); if (!S) return; if (!s || s.id !== S.house) return say(p.id, `奉公先の${houseName(S.house)}の店で願い出てください`);
    if (S.rank >= 4) return say(p.id, '大番頭は商人の最高位です');
    const nx = RK()[S.rank + 1];
    if (S.merit < nx.merit) return say(p.id, `功績が足りません（${S.merit}/${nx.merit}）`);
    if (p.fame < nx.fame) return say(p.id, `名声が足りません（${Math.floor(p.fame)}/${nx.fame}）`);
    S.rank++; S.hint = 0; setSt(p);
    say(p.id, `${GS.RANKS[S.rank].name}に取り立てられました！ 給金は月${SIM.money(GS.RANKS[S.rank].pay)}になります`);
  };
  C.shoQuit = (w, p) => {
    const S = sho(p); if (!S || p.battle) return; const n = houseName(S.house);
    p.sho = { prev: S.prev, prevRank: S.prevRank }; p.status = '浪人';
    say(p.id, `${n}から暇をもらい、浪人に戻りました${S.prev ? `（元の主家・${(w.factions[S.prev] || {}).name || ''}の城でなら元の格で仕えられます）` : ''}`);
  };
  function shoMerit(w, p, n, why) {
    const S = sho(p); if (!S || !(n > 0)) return; n = Math.round(n); S.merit += n;
    say(p.id, `商人の功績+${n}（${why}）`);
    const nx = S.rank < 4 && RK()[S.rank + 1];
    if (nx && S.merit >= nx.merit && p.fame >= nx.fame && !S.hint) { S.hint = 1; say(p.id, `${GS.RANKS[S.rank + 1].name}への取り立てを願い出られます（奉公先の${houseName(S.house)}の店で）`); }
  }
  SIM.shoMerit = shoMerit;

  // 仕官すると商人はやめる。元の主家なら元の格で
  const baseServe = C.serve;
  C.serve = function (w, p, c) {
    const S = p.sho, was = p.clan; if (sho(p) && p.battle) return;
    const r = baseServe.apply(this, arguments);
    if (!was && p.clan && S) {
      if (S.prev === p.clan && S.prevRank > 1) { p.rank = S.prevRank; p.status = `${(w.factions[p.clan] || {}).name || ''} ${RK()[p.rank].name}`; say(p.id, `元の主家に戻り、${RK()[p.rank].name}として仕えることになりました`); }
      if (S.rank) say(p.id, `${houseName(S.house)}への奉公は終わりました`);
      p.sho = null;
    }
    return r;
  };
  // 商いの儲けで功績
  const baseSell = C.sell;
  C.sell = function (w, p, c) {
    const S = sho(p), k = c && c.item, cost = p.cost && k != null ? p.cost[k] : null, m0 = p.money, n0 = (p.inv || {})[k] || 0;
    const r = baseSell.apply(this, arguments);
    if (S && cost != null) { const q = n0 - ((p.inv || {})[k] || 0), prof = (p.money - m0) - cost * q; if (prof > 0) { const m = Math.min(15, Math.floor(prof / GS.tradeMerit)); if (m > 0) shoMerit(w, p, m, '商いの儲け'); } }
    return r;
  };
  // 荷を多く持てる・重くても遅くなりにくい
  const baseCarry = SIM.carryKg; SIM.carryKg = (p) => { const S = sho(p); return baseCarry(p) * (S ? GS.RANKS[S.rank].carry : 1); };
  const baseLS = SIM.loadSpeed;
  SIM.loadSpeed = (p) => {
    const S = sho(p); if (!S) return baseLS(p);
    const R = GS.RANKS[S.rank], r = SIM.loadKg(p) / Math.max(1, SIM.carryKg(p));
    return r <= 1 ? 1 : Math.max(R.min, Math.pow(r, -R.pow));
  };
  // 毎月の給金（30日ごと）
  SIM.systems.push(function shoPay(w) {
    const d = day(w);
    for (const p of Object.values(w.players)) {
      const S = sho(p); if (!S) continue;
      if (S.pd == null) S.pd = d;
      while (d - S.pd >= 30) { S.pd += 30; const pay = GS.RANKS[S.rank].pay; if (!pay) continue; p.money += pay; say(p.id, `${houseName(S.house)}から給金${SIM.money(pay)}が届きました`); }
    }
  });
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) { baseEnsure(w); for (const p of Object.values(w.players)) { if (sho(p)) { if (p.clan) p.sho = null; else setSt(p); } } return w; };

  // ---- 本人に送る情報 ----
  // ---- 2.107.0 盗み：豪商の蔵に忍び込んで銭を盗む。忍びの潜入（3D）を流用する。忍びでなくてもできる（忍び道具は持っていれば使える）。
  //  難しさは3段（表の蔵・奥の蔵・金蔵）。段が上がるほど見張りが増え、盗める額も増える（10〜50貫）。見つかる（バレる）と名声が大きく下がる。数値は仮
  GS.NUSUMI = {
    lv: [null,
      { name: '表の蔵', guards: 3, lv: 1, kai: 1, loot: [10, 20], fame: 10, desc: '見張りは少なめ。盗める額は10〜20貫' },
      { name: '奥の蔵', guards: 5, lv: 3, kai: 2, loot: [20, 35], fame: 18, desc: '見張りが増える。盗める額は20〜35貫' },
      { name: '金蔵', guards: 8, lv: 5, kai: 3, loot: [35, 50], fame: 28, desc: '見張りが多く目も鋭い。盗める額は35〜50貫' },
    ],
    coolDays: 4,   // 盗みに挑んだ（成功・失敗とも）町の蔵には、しばらく近づけない
    limitDays: 1,  // 忍び込む支度をしてから、この日数で支度は無かったことになる
  };
  const nusumiD = (w, L) => ({ guards: L.guards, lv: L.lv, kai: L.kai, ck: 'hira', night: SIM.daylight ? SIM.daylight(w.time.min) < 0.5 : false });
  const nusumiCd = (w, p, sid) => Math.max(0, Math.ceil((((p.nusumiCd || {})[sid] || 0) - w.time.min) / 1440));
  // 支度をする（同じ町・同じ段・同じ日なら仲間と同じ id になる＝協力できる）
  function nusumiMake(w, p, s, lv) {
    const L = GS.NUSUMI.lv[lv]; if (!L) return false;
    if (p.nusumi) { say(p.id, `すでに${p.nusumi.toName}の蔵へ忍び込む支度をしています`); return false; }
    const cd = nusumiCd(w, p, s.id); if (cd > 0) { say(p.id, `${houseName(s.id)}は用心しています。あと${cd}日ほどは近づけません`); return false; }
    const kan = L.loot[0] + Math.floor(SIM.rand(w) * (L.loot[1] - L.loot[0] + 1));
    p.nusumi = { id: `nusumi-${s.id}-${lv}-${day(w)}`, to: s.id, toName: houseName(s.id), lv, name: L.name, loot: kan * 1000, fame: L.fame, deadline: w.time.min + GS.NUSUMI.limitDays * 1440 };
    return true;
  }
  C.nusumiTake = (w, p, c) => {
    const s = here(w, p); if (!isBig(s) || p.battle || p.busy || !GS.NUSUMI.lv[+c.id]) return;
    if (!nusumiMake(w, p, s, +c.id)) return; const L = GS.NUSUMI.lv[+c.id];
    say(p.id, `${houseName(s.id)}の${L.name}へ忍び込みます。見張りを避けて銭を盗み出し、入ってきた所へ戻れば成功。見つかると名声が${L.fame}下がります。仲間を募って一緒に盗むこともできます`);
  };
  C.nusumiDrop = (w, p) => { if (!p.nusumi) return; say(p.id, `${p.nusumi.toName}への盗みは取りやめました`); SIM.ninRoom.leaveRoom(w, p); p.nusumi = null; };
  // ---- 2.108.0 協力して盗む：忍びの協力任務と同じ部屋（最大3人）。盗めた額は全員に満額。誰かが見つかったら全員失敗。仲間が増えたぶん見張りも増える
  C.nusumiRecruit = (w, p) => {
    const q = p.nusumi, s = here(w, p), R = SIM.ninRoom; if (!q || !s || s.id !== q.to || p.battle) return;
    const r = R.roomOf(w, s.id); if (r) return say(p.id, r.mem.includes(p.id) ? 'すでに募集しています' : r.go ? '別の仲間がもう忍び込んでいます' : '別の仲間が募集しています');
    R.ROOMS[s.id] = { id: q.id, leader: p.id, mem: [p.id], t: Date.now(), go: null, nus: true };
    say(p.id, `仲間を募りました。同じ町にいる人が「加わる」を押すと一緒に盗めます（最大${R.CO_MAX}人）`);
  };
  C.nusumiJoin = (w, p) => {
    const s = here(w, p), R = SIM.ninRoom, r = s && isBig(s) && R.roomOf(w, s.id); if (!r || !r.nus || r.go || r.mem.includes(p.id) || p.battle || p.busy) return;
    if (r.mem.length >= R.CO_MAX) return say(p.id, `満員です（${R.CO_MAX}人まで）`);
    if (p.nusumi && p.nusumi.id !== r.id) return say(p.id, '別の盗みの支度をしています。先にやめてください');
    if (!p.nusumi && !nusumiMake(w, p, s, +String(r.id).split('-')[2])) return;
    if (p.nusumi.id !== r.id) { p.nusumi = null; return say(p.id, '日が替わったので、この募集には加われません'); }
    r.mem.push(p.id); for (const id of r.mem) say(id, `${R.nm(w, p.id)}が加わりました（${r.mem.length}/${R.CO_MAX}人）`);
  };
  C.nusumiGo = (w, p) => {
    const s = here(w, p), R = SIM.ninRoom, r = s && R.roomOf(w, s.id), q = p.nusumi; if (!r || !r.nus || r.go || r.leader !== p.id || !q || r.id !== q.id) return;
    const d = nusumiD(w, GS.NUSUMI.lv[q.lv]); d.guards = Math.min(16, d.guards + (r.mem.length - 1));
    r.go = { at: Date.now(), q: { id: q.id, k: 'steal', sk: 'zeni', toName: q.toName }, d, mem: r.mem.slice(), lead: p.id, names: Object.fromEntries(r.mem.map((id) => [id, R.nm(w, id)])) };
  };
  C.nusumiResult = (w, p, c) => {
    const q = p.nusumi, s = here(w, p); if (!q || !s || s.id !== q.to || p.battle) return;
    p.nusumi = null; if (SIM.ninUseTools) SIM.ninUseTools(p, c.used); SIM.ninRoom.leaveRoom(w, p);
    p.nusumiCd = p.nusumiCd || {}; p.nusumiCd[q.to] = w.time.min + GS.NUSUMI.coolDays * 1440;
    if (c.ok) { p.money += q.loot; return say(p.id, `${q.toName}の${q.name}から${SIM.money(q.loot)}を盗み出しました！ 気づかれずに抜けられました`); }
    const lost = Math.min(p.fame || 0, q.fame); p.fame = Math.max(0, (p.fame || 0) - q.fame);
    say(p.id, `見つかってしまいました！ ${q.toName}の盗人として噂が広まり、名声が${lost}下がりました（盗んだ銭は取り戻されました）`);
  };
  SIM.systems.push(function nusumiTick(w) { for (const p of Object.values(w.players)) if (p.nusumi && w.time.min > p.nusumi.deadline) { say(p.id, `${p.nusumi.toName}への盗みの支度は流れました`); p.nusumi = null; } });

  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const S = sho(p);
    r.me.sho = S ? { own: !!S.own, house: S.house, houseName: S.own ? S.ya : houseName(S.house), rank: S.rank, name: GS.RANKS[S.rank].name, merit: S.merit, next: S.rank < 4 ? { name: GS.RANKS[S.rank + 1].name, merit: RK()[S.rank + 1].merit, fame: RK()[S.rank + 1].fame } : null, pay: GS.RANKS[S.rank].pay, carry: GS.RANKS[S.rank].carry, off: GS.RANKS[S.rank].off } : null;
    r.me.takara = Object.entries(p.takara || {}).filter(([k, n]) => n > 0 && GS.TAKARA[k]).map(([k, n]) => ({ id: k, n, name: GS.TAKARA[k].name, kenjo: GS.TAKARA[k].kenjo, sell: Math.round(GS.TAKARA[k].price * GS.sellBack) }));
    const s = here(w, p);
    { const R = SIM.ninRoom, rm = s && isBig(s) && R ? R.roomOf(w, s.id) : null; r.me.nusumiRoom = null;
      if (rm && rm.nus) { const joined = rm.mem.includes(p.id), canJoin = !joined && !rm.go && rm.mem.length < R.CO_MAX && (!p.nusumi || p.nusumi.id === rm.id);
        if (joined || canJoin) r.me.nusumiRoom = { joined, canJoin, leader: rm.leader === p.id, lname: R.nm(w, rm.leader), names: rm.mem.map((id) => R.nm(w, id)), n: rm.mem.length, max: R.CO_MAX, lvName: (GS.NUSUMI.lv[+String(rm.id).split('-')[2]] || {}).name || '', go: joined ? rm.go : null }; } }
    const NQ = p.nusumi; r.me.nusumi = NQ ? Object.assign({}, NQ, { at: !!(s && s.id === NQ.to), d: nusumiD(w, GS.NUSUMI.lv[NQ.lv]) }) : null; // 2.107.0
    if (r.here && isBig(s)) {
      const G = stock(w, s), o = GS.off(p, s.id);
      r.here.gosho = {
        name: houseName(s.id), ya: GS.HOUSES[s.id].ya, left: GS.stockDays - (day(w) % GS.stockDays),
        items: G.items.map((k) => { const K = kahoInfo(k); return K && Object.assign({}, K, { price: Math.round(K.price * (1 - o)), sold: G.sold.includes(k) }); }).filter(Boolean),
        tasks: tasks(w, s).map((t) => ({ id: t.id, item: t.item, qty: t.qty, reward: t.reward, merit: t.merit, done: t.done })),
        nusumi: { lv: GS.NUSUMI.lv.slice(1).map((L) => ({ name: L.name, guards: L.guards, loot: L.loot, fame: L.fame, desc: L.desc })), cd: nusumiCd(w, p, s.id) }, // 2.107.0
        canJoin: !S && !(p.clan && p.rank >= 5), mine: !!(S && !S.own && S.house === s.id), off: Math.round(o * 100),
        ranks: GS.RANKS.slice(1, 5).map((R, i) => ({ name: R.name, pay: R.pay, carry: R.carry, desc: R.desc, merit: RK()[i + 1].merit, fame: RK()[i + 1].fame })),
      };
    }
    return r;
  };
})();
