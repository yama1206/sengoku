// 商品と各拠点の生産（1日あたり）。値段の単位は文（1000文 = 1貫）。数値はすべて仮
(function () {
  SGK.DATA.items = {
    rice: { name: '米', unit: '俵', base: 600, cons: 2 },
    salt: { name: '塩', unit: '俵', base: 400, cons: 1 },
    cotton: { name: '木綿', unit: '反', base: 300, cons: 1 },
    sake: { name: '酒', unit: '樽', base: 500, cons: 1 },
    firewood: { name: '薪', unit: '束', base: 40, cons: 3 },
    iron: { name: '鉄', unit: '貫', base: 800, cons: 0.5 },
    tea: { name: '茶', unit: '斤', base: 350, cons: 0.5 },
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
    kyo: { sake: 3, tea: 2, cotton: 1 }, akutagawa: { rice: 2 }, iimori: { rice: 2 }, shigisan: { firewood: 3 }, ishiyama: { rice: 2 },
    sakai: { iron: 2, cotton: 1, salt: 1 }, hyogo: { salt: 3 }, nara: { sake: 3 },
  };
  SGK.DATA.settlements.forEach((s) => (s.prod = prod[s.id] || {}));
})();
