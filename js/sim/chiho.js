// 2.17.0 地方ごとの兵：日本を9つの地方に分け、地方ごとに雇える兵の多さ・値段（強み・弱み）と、その地方だけで雇える名物兵を作る
// 地方の分け方は五畿七道をもとにした9つ（奥羽・関東・甲信・北陸・東海・畿内・中国・南海・西海）。数値はすべて仮・ここで調整
// CPUの軍勢・城兵も本拠の地方に合わせて兵の組み合わせが変わる（名物兵も混じる）
(function () {
  const SIM = SGK.SIM, D = SGK.DATA, TR = SIM.TROOPS;

  // ---- 名物兵：地方ごとに3段階の系統（2段で雇い、経験を積むと 3段 → 4段 に昇格）。look は3Dの見た目（服の色・付け足す飾り・馬・武器） ----
  // mo：士気に足す値、noForest：林でも騎馬が遅くならない、meleeOk：近づかれても弱りにくい弓、gun：鉄砲（弾の速さ・音）
  // 2.18.0 1段目・3段目を足した（2段目は 2.17.0 の名物兵。門徒衆は1段目）。段が上がるほど飾りが増える
  // 飾り（action3d.js の p_〇〇）：hachi 鉢巻・kasa2 笠・kuwa 鍬形・tsuno 鹿角・hane 羽根の立物・katou 裹頭・mempo 面頬（頭）
  //   ebira 箙・oosode 大袖・baori 陣羽織・sashi 指物・mushiro 門徒の旗・itate 置き盾・dor 胴乱（胸）、uma 馬鎧（馬）
  const SP = {
    // 奥羽：騎射
    komaashi: { name: '奥州駒足軽', short: '駒足', tier: 2, hp: 15, atk: 2.6, def: 1, spd: 11, range: 3, cav: true, cost: 450, wage: 22, up: ['kisha'], wk: 'spearS',
      note: '奥州の小さな駒に乗る軽い騎馬。安く速いが、体力は低い', look: { cloth: '#7a5a38', parts: [['hachi', '#e8e0cc']], horse: 'brown' } },
    kisha: { name: '奥州騎射衆', short: '騎射', tier: 3, hp: 18, atk: 2.4, def: 1, spd: 12, range: 30, ranged: true, cav: true, cost: 1200, wage: 40, fame: 5, up: ['kishagashira'], wk: 'bow',
      note: '馬の上から弓を射る。速く走りながら遠くから削るが、正面から斬り合うと弱い', look: { cloth: '#6b4a2c', parts: [['ebira'], ['sashi', '#e8dcc0']], horse: 'brown' } },
    kishagashira: { name: '奥羽騎射頭', short: '騎射頭', tier: 4, hp: 24, atk: 3.3, def: 1.6, spd: 12.5, range: 36, ranged: true, cav: true, cost: 2400, wage: 60, fame: 15, wk: 'bow',
      note: '騎射衆を率いる名手。遠くから強く射て、すぐに離れる', look: { cloth: '#4e3218', parts: [['ebira'], ['hane', '#f2efe6'], ['mempo', '#8a2a1a'], ['uma', '#6b4a2c']], horse: 'white' } },
    // 関東：重い騎馬武者
    bandowaka: { name: '坂東若武者', short: '若武者', tier: 2, hp: 18, atk: 3, def: 2, spd: 10.5, range: 4, cav: true, cost: 550, wage: 26, up: ['bando'], wk: 'sword',
      note: '坂東の家の若い騎馬武者。騎馬にしては守りが固いが、まだ遅い', look: { cloth: '#34477a', parts: [['oosode', '#34477a']], horse: 'brown' } },
    bando: { name: '坂東武者', short: '坂東', tier: 3, hp: 28, atk: 4.2, def: 3, spd: 11, range: 4, cav: true, cost: 1150, wage: 45, fame: 8, up: ['oyoroi'], wk: 'sword',
      note: '大鎧の重い騎馬武者。体力と守りが高いが、ほかの騎馬より遅い', look: { cloth: '#26365f', parts: [['kuwa'], ['oosode', '#3d548c']], horse: 'white' } },
    oyoroi: { name: '坂東大鎧武者', short: '大鎧', tier: 4, hp: 38, atk: 5.2, def: 4.2, spd: 10.5, range: 4, cav: true, mo: 8, cost: 3200, wage: 75, fame: 18, wk: 'sword',
      note: '金の糸で縅した大鎧の武者。戦場でいちばん打たれ強い騎馬', look: { cloth: '#1c2850', parts: [['kuwa'], ['oosode', '#c9a040'], ['mempo', '#222222'], ['uma', '#1c2850']], horse: 'white' } },
    // 甲信：山駆けの騎馬
    yamakoma: { name: '甲信駒足軽', short: '山駒', tier: 2, hp: 15, atk: 3.2, def: 1, spd: 11.5, range: 3, cav: true, noForest: true, cost: 500, wage: 24, up: ['yamagake'], wk: 'spearS',
      note: '山道に慣れた駒に乗る足軽。林の中でも速さが落ちない', look: { cloth: '#8a3a30', parts: [['sashi', '#a8322a']], horse: 'brown' } },
    yamagake: { name: '甲信山駆け騎馬', short: '山駆', tier: 3, hp: 21, atk: 4.6, def: 2, spd: 12.5, range: 4, cav: true, noForest: true, cost: 1050, wage: 42, fame: 5, up: ['yamagashira'], wk: 'spearS',
      note: '山国の馬に乗る騎馬。攻めが強く、林の中でも速さが落ちない', look: { cloth: '#a8322a', parts: [['tsuno'], ['sashi', '#a8322a']], horse: 'brown' } },
    yamagashira: { name: '甲信山駆け頭', short: '山駆頭', tier: 4, hp: 28, atk: 5.8, def: 2.6, spd: 13, range: 4, cav: true, noForest: true, mo: 5, cost: 2800, wage: 68, fame: 15, wk: 'spearL',
      note: '山駆けの騎馬を率いる猛者。突き崩す力がいちばん強い', look: { cloth: '#b01f1a', parts: [['tsuno'], ['mempo', '#b01f1a'], ['baori', '#5a0e0a'], ['uma', '#a8322a']], horse: 'brown' } },
    // 北陸：門徒・一揆
    monto: { name: '北陸門徒衆', short: '門徒', tier: 2, hp: 10, atk: 1.8, def: 0.5, spd: 4, range: 2.5, mo: 15, cost: 200, wage: 7, up: ['ikki'], wk: 'spearS',
      note: '一揆に加わる村の門徒。安く、士気が高く崩れにくい（田植え・稲刈りの月も出る）', look: { cloth: '#d9d2bd', parts: [['mushiro']] } },
    ikki: { name: '北陸一揆槍衆', short: '一揆', tier: 3, hp: 13, atk: 2.4, def: 1, spd: 4, range: 3.5, mo: 18, cost: 450, wage: 12, up: ['bokan'], wk: 'spearL',
      note: '長い槍をそろえた一揆の衆。値の割に強く、なかなか崩れない', look: { cloth: '#cfc6ad', parts: [['kasa2', '#c9b47a'], ['mushiro']] } },
    bokan: { name: '北陸坊官衆', short: '坊官', tier: 4, hp: 17, atk: 3.2, def: 2, spd: 4, range: 3.5, mo: 22, cost: 1100, wage: 26, wk: 'spearL',
      note: '寺から遣わされて一揆を率いる坊官。士気がいちばん高い', look: { cloth: '#3a3a40', parts: [['katou'], ['mushiro'], ['baori', '#e9e4d4']] } },
    // 東海：粘り強い槍
    kenashi: { name: '東海堅陣足軽', short: '堅足', tier: 2, hp: 12, atk: 1.9, def: 1.6, spd: 3.8, range: 2.5, mo: 5, cost: 350, wage: 11, up: ['kenjin'], wk: 'spearS',
      note: '踏みとどまることを叩き込まれた足軽。守りが固い', look: { cloth: '#4a3a28', parts: [['kasa2', '#3a2a1a'], ['sashi', '#e0c040']] } },
    kenjin: { name: '東海堅陣槍衆', short: '堅陣', tier: 3, hp: 15, atk: 2.3, def: 2.6, spd: 3.5, range: 3.5, mo: 10, cost: 750, wage: 20, up: ['kenjingashira'], wk: 'spearL',
      note: '置き盾を持つ粘り強い長槍。崩れにくく守りが固いが、足が遅い', look: { cloth: '#40301f', parts: [['itate'], ['sashi', '#e0c040']] } },
    kenjingashira: { name: '東海堅陣槍頭', short: '堅陣頭', tier: 4, hp: 21, atk: 3.1, def: 3.5, spd: 3.6, range: 3.5, mo: 15, cost: 1700, wage: 36, wk: 'spearL',
      note: '堅陣の槍衆を束ねる頭。並ぶと騎馬でも突き崩せない', look: { cloth: '#2e2418', parts: [['itate'], ['hane', '#1a1a1a'], ['mempo', '#2a2622'], ['sashi', '#e0c040']] } },
    // 畿内：寺社の衆
    gyonin: { name: '畿内行人', short: '行人', tier: 2, hp: 11, atk: 2.2, def: 1, spd: 4, range: 3, mo: 5, cost: 380, wage: 12, up: ['sohei'], wk: 'spearL',
      note: '寺に仕えて武芸も積む行人。斬り合いに強めの足軽', look: { cloth: '#5a5048', parts: [['katou', '#8a8478']] } },
    sohei: { name: '畿内僧兵', short: '僧兵', tier: 3, hp: 14, atk: 3, def: 1.5, spd: 4, range: 3, mo: 10, cost: 900, wage: 22, up: ['shuto'], wk: 'spearL',
      note: '寺社の薙刀の衆。斬り合いに強く、士気も高い', look: { cloth: '#2a2a30', parts: [['katou']] } },
    shuto: { name: '畿内衆徒頭', short: '衆徒', tier: 4, hp: 19, atk: 3.9, def: 2.2, spd: 4.1, range: 3, mo: 15, cost: 1800, wage: 38, wk: 'spearL',
      note: '大寺の衆徒を率いる頭。斬り合いでは侍にも引けを取らない', look: { cloth: '#1a1a1e', parts: [['katou'], ['baori', '#d9c9a0'], ['sashi', '#d9c9a0']] } },
    // 中国：瀬戸内の弓
    urayumi: { name: '瀬戸内浦弓足軽', short: '浦弓', tier: 2, hp: 8, atk: 1.7, def: 0.2, spd: 4.1, range: 37, ranged: true, meleeOk: true, cost: 520, wage: 15, up: ['setouchi'], wk: 'bow',
      note: '海辺の村の弓足軽。ふつうの弓より少し遠くまで届き、近づかれても弱りにくい', look: { cloth: '#3d6f86', parts: [['hachi', '#2c6482'], ['ebira']] } },
    setouchi: { name: '瀬戸内弓衆', short: '瀬弓', tier: 3, hp: 10, atk: 2.5, def: 0.5, spd: 4.2, range: 42, ranged: true, meleeOk: true, cost: 850, wage: 22, up: ['uragashira'], wk: 'bow',
      note: '海の上で鍛えた弓。射程が長く、近づかれてもあまり弱らない', look: { cloth: '#2c6482', parts: [['kasa2', '#c9b47a'], ['ebira']] } },
    uragashira: { name: '瀬戸内浦弓頭', short: '浦弓頭', tier: 4, hp: 13, atk: 3.3, def: 1, spd: 4.3, range: 50, ranged: true, meleeOk: true, cost: 1700, wage: 36, wk: 'bow',
      note: '船の上から敵を射すくめる弓の頭。いちばん遠くまで届く弓', look: { cloth: '#1f4d66', parts: [['kasa2', '#c9b47a'], ['ebira'], ['baori', '#2c6482'], ['mempo', '#2a2622']] } },
    // 南海：紀州の鉄砲
    kitsutsu: { name: '紀州筒足軽', short: '紀足', tier: 2, hp: 7, atk: 3.4, def: 0, spd: 3.6, range: 60, ranged: true, gun: true, cost: 700, wage: 18, up: ['kishu'], wk: 'gun',
      note: '紀伊の村で鉄砲を習った足軽。2段なのに鉄砲を撃てる', look: { cloth: '#4a5634', parts: [['hachi', '#2a2622'], ['dor']] } },
    kishu: { name: '紀州撃ち手', short: '紀筒', tier: 3, hp: 7, atk: 4.9, def: 0, spd: 3.6, range: 75, ranged: true, gun: true, cost: 1300, wage: 32, up: ['kishugashira'], wk: 'gun',
      note: '鉄砲で名高い紀伊の撃ち手。攻撃と射程はいちばんだが、体がもろく値も張る', look: { cloth: '#3e4a2a', parts: [['kasa2', '#2a2622'], ['dor']], wn: 'teppo_t4' } },
    kishugashira: { name: '紀州筒頭', short: '紀筒頭', tier: 4, hp: 9, atk: 6.2, def: 0.5, spd: 3.6, range: 85, ranged: true, gun: true, cost: 2600, wage: 50, fame: 10, wk: 'gun',
      note: '撃ち手を束ねる鉄砲の名人。ひと撃ちで侍も倒すが、近づかれるともろい', look: { cloth: '#2e3820', parts: [['kasa2', '#2a2622'], ['dor'], ['baori', '#1e1e1e'], ['sashi', '#c8b040']] } },
    // 西海：隼人の刀
    hayaashi: { name: '隼人足軽', short: '隼足', tier: 2, hp: 10, atk: 2.4, def: 0.3, spd: 4.5, range: 2.5, mo: 8, cost: 380, wage: 12, up: ['hayato'], wk: 'sword',
      note: '南の国の気の荒い足軽。刀で斬り込み、足が速い', look: { cloth: '#2a2a2a', parts: [['hachi', '#f2efe6']] } },
    hayato: { name: '隼人衆', short: '隼人', tier: 3, hp: 12, atk: 3.2, def: 0.5, spd: 4.6, range: 2.5, mo: 15, cost: 850, wage: 22, up: ['hayatogashira'], wk: 'sword',
      note: '南の果ての猛き刀の衆。攻めが強く足も速く崩れにくいが、守りは薄い', look: { cloth: '#1d1d1f', parts: [['baori', '#b3281e'], ['hachi', '#f2efe6']] } },
    hayatogashira: { name: '隼人頭', short: '隼人頭', tier: 4, hp: 17, atk: 4.4, def: 1, spd: 4.8, range: 2.5, mo: 20, cost: 1900, wage: 40, wk: 'sword',
      note: '一の太刀にすべてを懸ける斬り込みの頭。攻めはどの歩兵より強い', look: { cloth: '#121214', parts: [['baori', '#b3281e'], ['hane', '#f2efe6'], ['mempo', '#b3281e']] } },
  };
  for (const k in SP) { TR[k] = SP[k]; TR[k].cls = SP[k].cav ? 'cav' : SP[k].ranged ? 'bow' : 'spear'; }
  TR.teppo.gun = TR.teppogashira.gun = true;
  SIM.HIRE.push(...Object.keys(SP));
  if (SIM.EQUIP && SIM.EQUIP.group) { const G = SIM.EQUIP.group; // 本人が入る隊（武器の種類ごと。格の高い兵から）
    for (const k in SP) { const t = SP[k], g = t.gun ? G.teppo : t.ranged ? G.yumi : t.cav ? G.tachi : t.wk === 'sword' ? G.waki : G.yari; if (t.tier >= 3) g.unshift(k); else g.push(k); } }

  // ---- 9つの地方 ----
  // mul：兵の種類ごとの [補充の多さ, 値段] の倍率（nohei 農兵・spear 槍・bow 弓・gun 鉄砲・cav 騎馬・shield 竹束）
  // add：その地方だけ、拠点の種類ごとに足す兵 [1日の補充, 上限]。mix：CPUの兵の入れ替え [元, 先, 割合]
  const RG = SIM.CHIHO = {
    ou: { name: '奥羽', kuni: '陸奥・出羽', sp: 'komaashi', good: '名馬の産地：騎馬が多く2割安い', bad: '寒い国で人が少ない：農兵・槍が少なく、槍は1割高い',
      mul: { cav: [1.5, 0.8], nohei: [0.7, 1], spear: [0.8, 1.1] }, mix: [['yari', 'kiba', 0.1]] },
    kanto: { name: '関東', kuni: '坂東八か国・伊豆', sp: 'bandowaka', good: '槍・騎馬が多い（騎馬は1割安い）', bad: '竹束が少なく、弓は1割高い',
      mul: { spear: [1.2, 1], cav: [1.2, 0.9], shield: [0.6, 1], bow: [1, 1.1] }, mix: [['yari', 'nagayari', 0.1], ['yari', 'kiba', 0.06]] },
    koshin: { name: '甲信', kuni: '甲斐・信濃・飛騨', sp: 'yamakoma', good: '山国の騎馬：騎馬が多く1割安い', bad: '山国で人が少ない：農兵・弓が少ない',
      mul: { cav: [1.3, 0.9], nohei: [0.7, 1], bow: [0.8, 1] }, mix: [['yari', 'kiba', 0.12]] },
    hokuriku: { name: '北陸', kuni: '若狭・越前・加賀・能登・越中・越後', sp: 'monto', good: '門徒の地：農兵が2倍集まり2割安い（門徒衆は村でも雇える）', bad: '騎馬が少ない',
      mul: { nohei: [2, 0.8], cav: [0.5, 1.1] }, mix: [['yari', 'nohei', 0.15]] },
    tokai: { name: '東海', kuni: '尾張・美濃・三河・遠江・駿河・伊勢・志摩', sp: 'kenashi', good: '槍の国：槍が多く15%安い', bad: '弓が少ない',
      mul: { spear: [1.2, 0.85], bow: [0.8, 1] }, mix: [['yari', 'nagayari', 0.12]] },
    kinai: { name: '畿内', kuni: '山城・大和・摂津・河内・和泉・近江・伊賀・丹波', sp: 'gyonin', good: '銭で兵が集まる：どの兵も15%多く、鉄砲は町で雇え15%安い', bad: '騎馬が少ない',
      mul: { nohei: [1.15, 1], spear: [1.15, 1], bow: [1.15, 1], gun: [1.15, 0.85], shield: [1.15, 1], cav: [0.6, 1.1] }, add: { town: { teppo: [0.3, 4] } }, mix: [['yumi', 'teppo', 0.2]] },
    chugoku: { name: '中国', kuni: '山陰・山陽（播磨〜長門）', sp: 'urayumi', good: '瀬戸内の弓：弓が多く15%安い', bad: '騎馬がやや少ない',
      mul: { bow: [1.3, 0.85], cav: [0.7, 1] }, mix: [['yumi', 'tsuyoyumi', 0.15]] },
    nankai: { name: '南海', kuni: '四国・淡路・紀伊', sp: 'kitsutsu', good: '半農半兵：農兵が1.5倍集まる。鉄砲は城でも雇え1割安い', bad: '馬がいない：騎馬は雇えない',
      mul: { nohei: [1.5, 1], gun: [1, 0.9], cav: [0, 1] }, add: { castle: { teppo: [0.2, 3] } }, mix: [['yari', 'nohei', 0.1], ['yumi', 'teppo', 0.12]] },
    saikai: { name: '西海', kuni: '九州', sp: 'hayaashi', good: '南蛮の筒：鉄砲が町でも城でも雇え1割安い', bad: '弓が少ない',
      mul: { gun: [1.2, 0.9], bow: [0.6, 1] }, add: { town: { teppo: [0.25, 3] }, castle: { teppo: [0.25, 3] } }, mix: [['yumi', 'teppo', 0.15]] },
  };
  for (const k in RG) { const r = RG[k]; r.id = k; r.line = [r.sp, TR[r.sp].up[0], TR[TR[r.sp].up[0]].up[0]]; } // 系統（1段目 → 2段目 → 3段目）
  SIM.CHIHO_ORDER = ['ou', 'kanto', 'koshin', 'hokuriku', 'tokai', 'kinai', 'chugoku', 'nankai', 'saikai'];
  for (const k in SP) SP[k].home = Object.keys(RG).find((r) => RG[r].line.includes(k));

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
    if (r) { // 名物兵（系統の1段目）：地方の城と大きな町（門徒衆は村でも）。上の段は昇格で育てる
      const sp = r.sp;
      if (s.type === 'castle' || (s.type === 'town' && BIG(s))) P[sp] = sp === 'monto' ? [0.6, 8] : [0.35, 5];
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
    if (n >= 8) { // 名物兵を1割ほど（いちばん多い兵から）。1段目が多く、大きな軍勢ほど上の段も混じる
      const m = Math.max(1, Math.round(n * 0.1)), from = Object.keys(army).filter((k) => !TR[k].home).sort((x, y) => army[y] - army[x])[0];
      if (from) {
        const q = Math.min(m, army[from]), q3 = n >= 30 ? Math.round(q * 0.15) : 0, q2 = n >= 15 ? Math.round(q * 0.35) : 0, q1 = q - q2 - q3;
        army[from] -= q; if (!army[from]) delete army[from];
        [q1, q2, q3].forEach((v, i) => { if (v > 0) army[r.line[i]] = (army[r.line[i]] || 0) + v; });
      }
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
