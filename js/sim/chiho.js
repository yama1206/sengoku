// 2.17.0 地方ごとの兵：日本を9つの地方に分け、地方ごとに雇える兵の多さ・値段（強み・弱み）と、その地方だけで雇える名物兵を作る
// 地方の分け方は五畿七道をもとにした9つ（奥羽・関東・甲信・北陸・東海・畿内・中国・南海・西海）。数値はすべて仮・ここで調整
// CPUの軍勢・城兵も本拠の地方に合わせて兵の組み合わせが変わる（名物兵も混じる）
(function () {
  const SIM = SGK.SIM, D = SGK.DATA, TR = SIM.TROOPS;

  // ---- 名物兵（3段。門徒衆だけ2段）。look は3Dの見た目（服の色・付け足す飾り・馬・武器） ----
  // mo：士気に足す値、noForest：林でも騎馬が遅くならない、meleeOk：近づかれても弱りにくい弓、gun：鉄砲（弾の速さ・音）
  const SP = {
    kisha: { name: '奥州騎射衆', short: '騎射', tier: 3, hp: 18, atk: 2.4, def: 1, spd: 12, range: 30, ranged: true, cav: true, cost: 1200, wage: 40, fame: 5, wk: 'bow',
      note: '馬の上から弓を射る。速く走りながら遠くから削るが、正面から斬り合うと弱い', look: { cloth: '#6b4a2c', parts: [['ebira']], horse: 'brown' } },
    bando: { name: '坂東武者', short: '坂東', tier: 3, hp: 28, atk: 4.2, def: 3, spd: 11, range: 4, cav: true, cost: 1150, wage: 45, fame: 8, wk: 'sword',
      note: '大鎧の重い騎馬武者。体力と守りが高いが、ほかの騎馬より遅い', look: { cloth: '#26365f', parts: [['kuwa'], ['oosode', '#3d548c']], horse: 'white' } },
    yamagake: { name: '山駆け騎馬', short: '山駆', tier: 3, hp: 21, atk: 4.6, def: 2, spd: 12.5, range: 4, cav: true, noForest: true, cost: 1050, wage: 42, fame: 5, wk: 'spearS',
      note: '山国の馬に乗る騎馬。攻めが強く、林の中でも速さが落ちない', look: { cloth: '#a8322a', parts: [['tsuno']], horse: 'brown' } },
    monto: { name: '門徒衆', short: '門徒', tier: 2, hp: 10, atk: 1.8, def: 0.5, spd: 4, range: 2.5, mo: 15, cost: 200, wage: 7, up: ['nagayari'], wk: 'spearS',
      note: '一揆に加わる村の門徒。安く、士気が高く崩れにくい（田植え・稲刈りの月も出る）', look: { cloth: '#d9d2bd', parts: [['mushiro']] } },
    kenjin: { name: '堅陣槍衆', short: '堅陣', tier: 3, hp: 15, atk: 2.3, def: 2.6, spd: 3.5, range: 3.5, mo: 10, cost: 750, wage: 20, wk: 'spearL',
      note: '置き盾を持つ粘り強い長槍。崩れにくく守りが固いが、足が遅い', look: { cloth: '#40301f', parts: [['itate']] } },
    sohei: { name: '僧兵', short: '僧兵', tier: 3, hp: 14, atk: 3, def: 1.5, spd: 4, range: 3, mo: 10, cost: 900, wage: 22, wk: 'spearL',
      note: '寺社の薙刀の衆。斬り合いに強く、士気も高い', look: { cloth: '#2a2a30', parts: [['katou']] } },
    setouchi: { name: '瀬戸内弓衆', short: '瀬弓', tier: 3, hp: 10, atk: 2.5, def: 0.5, spd: 4.2, range: 42, ranged: true, meleeOk: true, cost: 850, wage: 22, wk: 'bow',
      note: '海の上で鍛えた弓。射程が長く、近づかれてもあまり弱らない', look: { cloth: '#2c6482', parts: [['kasa2', '#c9b47a'], ['ebira']] } },
    kishu: { name: '紀州撃ち手', short: '紀筒', tier: 3, hp: 7, atk: 4.9, def: 0, spd: 3.6, range: 46, ranged: true, gun: true, cost: 1300, wage: 32, wk: 'gun',
      note: '鉄砲で名高い紀伊の撃ち手。攻撃と射程はいちばんだが、体がもろく値も張る', look: { cloth: '#3e4a2a', parts: [['kasa2', '#2a2622'], ['dor']], wn: 'teppo_t4' } },
    hayato: { name: '隼人衆', short: '隼人', tier: 3, hp: 12, atk: 3.2, def: 0.5, spd: 4.6, range: 2.5, mo: 15, cost: 850, wage: 22, wk: 'sword',
      note: '南の果ての猛き刀の衆。攻めが強く足も速く崩れにくいが、守りは薄い', look: { cloth: '#1d1d1f', parts: [['baori', '#b3281e']] } },
  };
  for (const k in SP) { TR[k] = SP[k]; TR[k].cls = SP[k].cav ? 'cav' : SP[k].ranged ? 'bow' : 'spear'; }
  TR.teppo.gun = TR.teppogashira.gun = true;
  SIM.HIRE.push(...Object.keys(SP));
  if (SIM.EQUIP && SIM.EQUIP.group) { const G = SIM.EQUIP.group; // 本人が入る隊（武器の種類ごと）
    G.yari.push('kenjin', 'sohei', 'monto'); G.tachi.unshift('bando', 'yamagake'); G.yumi.unshift('setouchi', 'kisha'); G.teppo.unshift('kishu'); G.waki.push('hayato'); }

  // ---- 9つの地方 ----
  // mul：兵の種類ごとの [補充の多さ, 値段] の倍率（nohei 農兵・spear 槍・bow 弓・gun 鉄砲・cav 騎馬・shield 竹束）
  // add：その地方だけ、拠点の種類ごとに足す兵 [1日の補充, 上限]。mix：CPUの兵の入れ替え [元, 先, 割合]
  const RG = SIM.CHIHO = {
    ou: { name: '奥羽', kuni: '陸奥・出羽', sp: 'kisha', good: '名馬の産地：騎馬が多く2割安い', bad: '寒い国で人が少ない：農兵・槍が少なく、槍は1割高い',
      mul: { cav: [1.5, 0.8], nohei: [0.7, 1], spear: [0.8, 1.1] }, mix: [['yari', 'kiba', 0.1]] },
    kanto: { name: '関東', kuni: '坂東八か国・伊豆', sp: 'bando', good: '槍・騎馬が多い（騎馬は1割安い）', bad: '竹束が少なく、弓は1割高い',
      mul: { spear: [1.2, 1], cav: [1.2, 0.9], shield: [0.6, 1], bow: [1, 1.1] }, mix: [['yari', 'nagayari', 0.1], ['yari', 'kiba', 0.06]] },
    koshin: { name: '甲信', kuni: '甲斐・信濃・飛騨', sp: 'yamagake', good: '山国の騎馬：騎馬が多く1割安い', bad: '山国で人が少ない：農兵・弓が少ない',
      mul: { cav: [1.3, 0.9], nohei: [0.7, 1], bow: [0.8, 1] }, mix: [['yari', 'kiba', 0.12]] },
    hokuriku: { name: '北陸', kuni: '若狭・越前・加賀・能登・越中・越後', sp: 'monto', good: '門徒の地：農兵が2倍集まり2割安い（門徒衆は村でも雇える）', bad: '騎馬が少ない',
      mul: { nohei: [2, 0.8], cav: [0.5, 1.1] }, mix: [['yari', 'nohei', 0.15]] },
    tokai: { name: '東海', kuni: '尾張・美濃・三河・遠江・駿河・伊勢・志摩', sp: 'kenjin', good: '槍の国：槍が多く15%安い', bad: '弓が少ない',
      mul: { spear: [1.2, 0.85], bow: [0.8, 1] }, mix: [['yari', 'nagayari', 0.12]] },
    kinai: { name: '畿内', kuni: '山城・大和・摂津・河内・和泉・近江・伊賀・丹波', sp: 'sohei', good: '銭で兵が集まる：どの兵も15%多く、鉄砲は町で雇え15%安い', bad: '騎馬が少ない',
      mul: { nohei: [1.15, 1], spear: [1.15, 1], bow: [1.15, 1], gun: [1.15, 0.85], shield: [1.15, 1], cav: [0.6, 1.1] }, add: { town: { teppo: [0.3, 4] } }, mix: [['yumi', 'teppo', 0.2]] },
    chugoku: { name: '中国', kuni: '山陰・山陽（播磨〜長門）', sp: 'setouchi', good: '瀬戸内の弓：弓が多く15%安い', bad: '騎馬がやや少ない',
      mul: { bow: [1.3, 0.85], cav: [0.7, 1] }, mix: [['yumi', 'tsuyoyumi', 0.15]] },
    nankai: { name: '南海', kuni: '四国・淡路・紀伊', sp: 'kishu', good: '半農半兵：農兵が1.5倍集まる。鉄砲は城でも雇え1割安い', bad: '馬がいない：騎馬は雇えない',
      mul: { nohei: [1.5, 1], gun: [1, 0.9], cav: [0, 1] }, add: { castle: { teppo: [0.2, 3] } }, mix: [['yari', 'nohei', 0.1], ['yumi', 'teppo', 0.12]] },
    saikai: { name: '西海', kuni: '九州', sp: 'hayato', good: '南蛮の筒：鉄砲が町でも城でも雇え1割安い', bad: '弓が少ない',
      mul: { gun: [1.2, 0.9], bow: [0.6, 1] }, add: { town: { teppo: [0.25, 3] }, castle: { teppo: [0.25, 3] } }, mix: [['yumi', 'teppo', 0.15]] },
  };
  for (const k in RG) RG[k].id = k;
  SIM.CHIHO_ORDER = ['ou', 'kanto', 'koshin', 'hokuriku', 'tokai', 'kinai', 'chugoku', 'nankai', 'saikai'];
  for (const k in SP) SP[k].home = Object.keys(RG).find((r) => RG[r].sp === k);

  // ---- 場所 → 地方（緯度経度でおおまかに国境を引く） ----
  SIM.chihoAt = (x, y) => {
    const o = D.mapOrigin, lon = o.lon + x / 91, lat = o.lat - y / 111;
    if (lat < 33.96 && lon < 132.05) return 'saikai';
    if ((lon >= 132.05 && lon < 132.6 && lat < 33.7) || (lon >= 132.6 && lon < 133 && lat < 34.15) || (lon >= 133 && lon < 134.6 && lat < 34.36) || (lon >= 134.6 && lon < 135.05 && lat < 34.5) || (lon >= 135.05 && lon < 136.3 && lat < 34.35)) return 'nankai';
    if (lon < 135.05 || (lat > 35.3 && lon < 135.4)) return 'chugoku';
    if (lat > 38.5 || (lat > 36.9 && lon >= 139.6)) return 'ou';
    if ((lon < 136.05 && lat > 35.42) || (lat > 35.6 && lon < 136.9) || (lon < 137.8 && lat > 36.45) || (lat > 36.9 && lon < 139.6)) return 'hokuriku';
    if ((lon >= 137.6 && lon < 138.8 && lat > 35.3 && lat < 36.95) || (lon >= 137 && lon < 137.6 && lat > 35.75 && lat < 36.45) || (lon >= 138.8 && lon < 139 && lat > 35.4 && lat < 35.75)) return 'koshin';
    if (lon >= 138.85) return 'kanto';
    if ((lon >= 136.35 && lat < 35.85) || (lon >= 136.2 && lat < 34.75)) return 'tokai';
    return 'kinai';
  };
  const cache = {};
  SIM.chihoOf = (s) => (s ? (cache[s.id] || (cache[s.id] = SIM.chihoAt(s.x, s.y))) : null);

  // ---- 雇える兵 ----
  const kindOf = (k) => { const t = TR[k]; return k === 'nohei' ? 'nohei' : t.shield ? 'shield' : t.gun ? 'gun' : t.cav ? 'cav' : t.ranged ? 'bow' : 'spear'; };
  const BIG = (s) => D.isBig && D.isBig(s);
  const basePool = SIM.poolOf, pcache = {};
  SIM.poolOf = (s) => {
    if (pcache[s.id]) return pcache[s.id];
    const r = RG[SIM.chihoOf(s)], P = {}, b = basePool(s);
    for (const k in b) { const m = (r && r.mul[kindOf(k)]) || [1, 1]; if (m[0] > 0) P[k] = [b[k][0] * m[0], Math.max(1, Math.round(b[k][1] * m[0]))]; }
    if (r && r.add && r.add[s.type]) for (const k in r.add[s.type]) if (!P[k]) { const a = r.add[s.type][k], m = r.mul[kindOf(k)] || [1, 1]; P[k] = [a[0] * m[0], Math.max(1, Math.round(a[1] * m[0]))]; }
    if (r) { // 名物兵：地方の城と大きな町（門徒衆は村でも）
      const sp = r.sp;
      if (s.type === 'castle' || (s.type === 'town' && BIG(s))) P[sp] = sp === 'monto' ? [0.6, 8] : [0.2, 3];
      else if (sp === 'monto') P[sp] = [0.4, 5];
    }
    return (pcache[s.id] = P);
  };
  SIM.hireMul = (s, k) => { const r = RG[SIM.chihoOf(s)], t = TR[k]; if (!r || !t || t.home) return 1; const m = r.mul[kindOf(k)]; return m ? m[1] : 1; };
  // 門徒衆は田植え・稲刈りの月でも戦に出る（military.js の addUnits は農兵だけを外す）

  // ---- CPUの兵：本拠の地方に合わせて入れ替える ----
  SIM.chihoMix = (army, rk) => {
    const r = RG[rk]; if (!r || !army) return army;
    const n = SIM.troopCount(army);
    for (const [a, b, q] of r.mix || []) { const m = Math.round((army[a] || 0) * q); if (m > 0) { army[a] -= m; if (!army[a]) delete army[a]; army[b] = (army[b] || 0) + m; } }
    if (r.mul.cav && r.mul.cav[0] === 0 && army.kiba) { army.yari = (army.yari || 0) + army.kiba; delete army.kiba; } // 南海は騎馬なし
    if (n >= 8) { // 名物兵を1割ほど（いちばん多い兵から）
      const m = Math.max(1, Math.round(n * 0.1)), from = Object.keys(army).filter((k) => !TR[k].home).sort((x, y) => army[y] - army[x])[0];
      if (from) { const q = Math.min(m, army[from]); army[from] -= q; if (!army[from]) delete army[from]; army[r.sp] = (army[r.sp] || 0) + q; }
    }
    return army;
  };
  SIM.factionChiho = (w, fid) => {
    const f = fid && w.factions[fid]; if (!f) return null;
    const s = w.settlements.find((x) => x.type === 'castle' && x.owner === fid && x.lord && x.lord === f.leader) || w.settlements.find((x) => x.type === 'castle' && x.owner === fid);
    return s ? SIM.chihoOf(s) : null;
  };
  const baseGen = SIM.genArmy;
  SIM.genArmy = (w, fid, army, free) => { const f = fid && w.factions[fid], a = baseGen(w, fid, army, free); return f && !f.player && !f.dead ? SIM.chihoMix(a, SIM.factionChiho(w, fid)) : a; };
})();
