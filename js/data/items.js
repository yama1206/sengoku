// 商品と各拠点の生産（1日あたり）。値段の単位は文（1000文 = 1貫）。数値はすべて仮
(function () {
  SGK.DATA.items = {
    // 1.6.0 wt＝1つの重さ(kg)。1つの量を「持ち運びやすい小分け」にそろえ、中身の重さ（密度）で決める。鉄は重く、木綿・茶は軽い
    rice: { name: '米', unit: '俵', base: 12, cons: 2, wt: 6 },       // 小俵（米 約4升）
    salt: { name: '塩', unit: '袋', base: 400, cons: 1, wt: 2 },      // 小袋（塩 約1升）
    cotton: { name: '木綿', unit: '反', base: 300, cons: 1, wt: 0.7 }, // 1反は本物も約0.7kg
    sake: { name: '酒', unit: '樽', base: 500, cons: 1, wt: 4 },      // 小樽（酒 約2升）
    firewood: { name: '薪', unit: '束', base: 40, cons: 3, wt: 3 },
    iron: { name: '鉄', unit: '貫', base: 800, cons: 0.5, wt: 3.75 },  // 1貫は本物も3.75kg
    tea: { name: '茶', unit: '斤', base: 350, cons: 0.5, wt: 0.6 },   // 1斤は本物も約0.6kg
  };
  const prod = {
    inabayama: { rice: 3, iron: 1, tea: 1 }, ogaki: { rice: 4 }, inuyama: { firewood: 4, sake: 1 },
    kiyosu: { cotton: 1 }, nagoya: {}, narumi: { cotton: 1 }, odaka: { salt: 1 }, okazaki: { rice: 3, cotton: 2, tea: 1 },
    tsushima: { sake: 2, rice: 2 }, atsuta: { salt: 5 }, ichinomiya: { cotton: 4, rice: 2 }, komaki: { rice: 3, firewood: 3 },
    sunomata: { firewood: 3 }, chiryu: { cotton: 2, rice: 2 }, anjo: { rice: 5 }, seki: { iron: 2 },
    yoshida: { rice: 3 }, hikuma: { cotton: 2 }, kakegawa: { tea: 2, rice: 2 }, sunpu: { tea: 3, rice: 2 },
    nagashima: { rice: 2, salt: 1 }, okawachi: { rice: 3 }, ano: { rice: 3, salt: 1 }, ujiyamada: { salt: 2, rice: 2, sake: 1 },
    odani: { rice: 2, iron: 1 }, kunitomo: { iron: 3 }, kannonji: { rice: 4 }, kusatsu: { rice: 2, tea: 1 }, hino: { sake: 2, firewood: 2 },
    ichijodani: { rice: 3, sake: 1 }, tsuruga: { salt: 3 },
    kariya: { rice: 2 }, nishio: { rice: 2, salt: 1 }, tahara: { salt: 2 }, gujo: { firewood: 3 }, kitakata: { rice: 2 }, sone: { rice: 2 },
    kameyama: { rice: 2 }, kanbe: { rice: 2 }, sawayama: { rice: 2 }, ono: { firewood: 2, rice: 1 }, takaya: { cotton: 2, rice: 2 }, kishiwada: { salt: 2 }, koshimizu: { rice: 2 },
    kyo: { sake: 3, tea: 2, cotton: 1 }, akutagawa: { rice: 2 }, iimori: { rice: 2 }, shigisan: { firewood: 3 }, ishiyama: { rice: 2 },
    sakai: { iron: 2, cotton: 1, salt: 1 }, hyogo: { salt: 3 }, nara: { sake: 3 },
  };
  // 個別に決めていない拠点は種類で決める：村は米・薪を多く作り、町は品物を作り、城は周りの田畑から米・薪を少し
  const EXTRA = ['salt', 'cotton', 'sake', 'iron', 'tea', 'salt', 'cotton', 'sake'];
  const hash = (id, n) => { let h = n * 7919; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const pickX = (id, n) => EXTRA[hash(id, n) % EXTRA.length];
  function defProd(s) {
    const o = {}, add = (k, v) => (o[k] = (o[k] || 0) + v);
    if (s.type === 'village') { add('rice', 5); add('firewood', 6); add(pickX(s.id, 1), 4); add(pickX(s.id, 2), 3); }
    else if (s.type === 'town') { add('rice', 1); add('firewood', 2); add(pickX(s.id, 1), 6); add(pickX(s.id, 2), 5); add(pickX(s.id, 3), 4); }
    else { add('rice', 2); add('firewood', 4); add(pickX(s.id, 1), 2); add(pickX(s.id, 2), 1); }
    return o;
  }
  SGK.DATA.defProd = defProd;
  SGK.DATA.settlements.forEach((s) => (s.prod = prod[s.id] || defProd(s)));
})();
