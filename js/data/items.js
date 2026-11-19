// 商品と各拠点の生産（1日あたり）。値段の単位は文（1000文 = 1貫）。数値はすべて仮
(function () {
  SGK.DATA.items = {
    // 1.6.0 wt＝1つの重さ(kg)。1つの量を「持ち運びやすい小分け」にそろえ、中身の重さ（密度）で決める。鉄は重く、木綿・茶は軽い
    rice: { name: '米', ic: 'rice', unit: '俵', base: 12, cons: 2, wt: 6 },       // 小俵（米 約4升）
    salt: { name: '塩', ic: 'salt', unit: '袋', base: 400, cons: 1, wt: 2 },      // 小袋（塩 約1升）
    cotton: { name: '木綿', ic: 'cotton', unit: '反', base: 300, cons: 1, wt: 0.7 }, // 1反は本物も約0.7kg
    sake: { name: '酒', ic: 'sake', unit: '樽', base: 500, cons: 1, wt: 4 },      // 小樽（酒 約2升）
    firewood: { name: '薪', ic: 'firewood', unit: '束', base: 40, cons: 3, wt: 3 },
    // 2.32.0 鉄（品物）は市場からなくした。鉄鉱石（採掘・鍛冶）は残す
    // 2.28.0 採掘で取れる物資（品質は個数に換算して入る）。後で加工できるようにする予定。金山・銀山の近くの町・城だけで少し産する（mine:true）
    ironore: { name: '鉄鉱石', ic: 'iron', unit: '塊', base: 120, cons: 0, mine: true, wt: 4 },
    quartz: { name: '水晶', ic: 'star', unit: '粒', base: 540, cons: 0, mine: true, wt: 0.3 },
    agate: { name: '瑪瑙', ic: 'star', unit: '粒', base: 360, cons: 0, mine: true, wt: 0.3 },
    jade: { name: '翡翠', ic: 'star', unit: '粒', base: 1500, cons: 0, mine: true, wt: 0.3 },
    garnet: { name: '柘榴石', ic: 'star', unit: '粒', base: 720, cons: 0, mine: true, wt: 0.3 },
    tea: { name: '茶', ic: 'tea2', /* 2.13.1 茶の葉の絵 */ unit: '斤', base: 350, cons: 0.5, wt: 0.6 },   // 1斤は本物も約0.6kg
  };
  const prod = {
    inabayama: { rice: 3, tea: 1 }, ogaki: { rice: 4 }, inuyama: { firewood: 4, sake: 1 },
    kiyosu: { cotton: 1 }, nagoya: {}, narumi: { cotton: 1 }, odaka: { salt: 1 }, okazaki: { rice: 3, cotton: 2, tea: 1 },
    tsushima: { sake: 2, rice: 2 }, atsuta: { salt: 5 }, ichinomiya: { cotton: 4, rice: 2 }, komaki: { rice: 3, firewood: 3 },
    sunomata: { firewood: 3 }, chiryu: { cotton: 2, rice: 2 }, anjo: { rice: 5 }, seki: { firewood: 2 },
    yoshida: { rice: 3 }, hikuma: { cotton: 2 }, kakegawa: { tea: 2, rice: 2 }, sunpu: { tea: 3, rice: 2 },
    nagashima: { rice: 2, salt: 1 }, okawachi: { rice: 3 }, ano: { rice: 3, salt: 1 }, ujiyamada: { salt: 2, rice: 2, sake: 1 },
    odani: { rice: 2 }, kunitomo: { firewood: 2, rice: 1 }, kannonji: { rice: 4 }, kusatsu: { rice: 2, tea: 1 }, hino: { sake: 2, firewood: 2 },
    ichijodani: { rice: 3, sake: 1 }, tsuruga: { salt: 3 },
    kariya: { rice: 2 }, nishio: { rice: 2, salt: 1 }, tahara: { salt: 2 }, gujo: { firewood: 3 }, kitakata: { rice: 2 }, sone: { rice: 2 },
    kameyama: { rice: 2 }, kanbe: { rice: 2 }, sawayama: { rice: 2 }, ono: { firewood: 2, rice: 1 }, takaya: { cotton: 2, rice: 2 }, kishiwada: { salt: 2 }, koshimizu: { rice: 2 },
    kyo: { sake: 3, tea: 2, cotton: 1 }, akutagawa: { rice: 2 }, iimori: { rice: 2 }, shigisan: { firewood: 3 }, ishiyama: { rice: 2 },
    sakai: { cotton: 2, salt: 1, tea: 1 }, hyogo: { salt: 3 }, nara: { sake: 3 },
  };
  // 個別に決めていない拠点は種類で決める：村は米・薪を多く作り、町は品物を作り、城は周りの田畑から米・薪を少し
  const EXTRA = ['salt', 'cotton', 'sake', 'tea', 'tea', 'salt', 'cotton', 'sake'];
  const hash = (id, n) => { let h = n * 7919; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const pickX = (id, n) => EXTRA[hash(id, n) % EXTRA.length];
  function defProd(s) {
    const o = {}, add = (k, v) => (o[k] = (o[k] || 0) + v);
    if (s.type === 'village') { add('rice', 5); add('firewood', 6); add(pickX(s.id, 1), 3); add(pickX(s.id, 2), 2); } // 1.6.87 特産は toku で別に決める（economy.js で7にする）
    else if (s.type === 'town') { add('rice', 1); add('firewood', 2); add(pickX(s.id, 1), 6); add(pickX(s.id, 2), 5); add(pickX(s.id, 3), 4); }
    else { add('rice', 2); add('firewood', 4); add(pickX(s.id, 1), 2); add(pickX(s.id, 2), 1); }
    return o;
  }
  SGK.DATA.defProd = defProd;
  // 1.6.78 大きな町（地方ごとに1つ以上）。武具はここでしか売り買いできない
  const BIG = ['sakata', 'shinagawa', 'niigata', 'tsuruga', 'tsushima', 'kyo', 'sakai', 'yamaguchi', 'utazu', 'hakata'];
  SGK.DATA.isBig = (s) => !!(s && BIG.includes(s.id));
  // 1.6.87 村の特産：地形で決める（塩＝海・酒＝川・木綿＝森・茶＝平地に近い。2.32.0 鉄＝山はなくした）。1つの城の領内の村のうち1つだけ
  let TOKU = null;
  function buildToku() {
    const SIM = SGK.SIM, T = SGK.DATA.terrain || {}, D = SGK.DATA.settlements, MAXD = 30;
    const cs = D.filter((x) => x.type === 'castle'), dd = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const near = (v, name) => { let best = MAXD; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; for (let d = 1; d < best; d += 1) if (SIM.terrainAt(v.x + Math.cos(a) * d, v.y + Math.sin(a) * d) === name) { best = d; break; } } return best; };
    const riv = (v) => { let best = MAXD; for (const rv of T.rivers || []) for (let k = 1; k < rv.pts.length; k++) {
      const [ax, ay] = rv.pts[k - 1], [bx, by] = rv.pts[k], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, q = l ? Math.max(0, Math.min(1, ((v.x - ax) * dx + (v.y - ay) * dy) / l)) : 0;
      best = Math.min(best, Math.hypot(v.x - ax - q * dx, v.y - ay - q * dy)); } return best; };
    const plain = (v) => { let n = 0, c = 0; for (const r of [3, 6, 9]) for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, t = SIM.terrainAt(v.x + Math.cos(a) * r, v.y + Math.sin(a) * r); n++; if (t === '平地' || t === '街道') c++; } return c / n; };
    const cl = (d) => Math.max(0, 1 - d / MAXD);
    const best = {}; // 城ごとに一番ふさわしい村
    for (const v of D) if (v.type === 'village') {
      const sc = { salt: cl(near(v, '海')) * 1.05, sake: cl(riv(v)) * 1.02, cotton: cl(near(v, '森')) * 0.98, tea: plain(v) * 0.78 };
      let k = 'tea'; for (const x in sc) if (sc[x] > sc[k]) k = x;
      const c = cs.slice().sort((a, b) => dd(a, v) - dd(b, v))[0], key = c ? c.id : v.id, h = (hash(v.id, 3) % 1000) / 1e6; // 同点は決まった順
      if (!best[key] || sc[k] + h > best[key].s) best[key] = { id: v.id, k, s: sc[k] + h };
    }
    TOKU = {}; for (const c in best) TOKU[best[c].id] = best[c].k;
  }
  SGK.DATA.toku = (s) => { if (!s || s.type !== 'village') return null; if (!TOKU) { if (!(SGK.SIM && SGK.SIM.terrainAt)) return null; buildToku(); } return TOKU[s.id] || null; };
  SGK.DATA.mk = (k) => (SGK.DATA.items[k] && SGK.DATA.items[k].ic) || ''; // 2.12.4 絵の名前（assets/icons/）
  SGK.DATA.settlements.forEach((s) => (s.prod = prod[s.id] || defProd(s)));
})();
