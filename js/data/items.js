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
    sunomata: { firewood: 3 }, chiryu: { cotton: 2, rice: 2 }, anjo: { rice: 5 },
  };
  SGK.DATA.settlements.forEach((s) => (s.prod = prod[s.id] || {}));
})();
