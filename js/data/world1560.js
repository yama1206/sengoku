// シナリオデータ：永禄3年(1560)正月 尾張・美濃・西三河（第0段階の試作用・史実の確認は今後）
(function () {
  // 緯度経度 → ゲーム内のkm座標（x:東, y:南）
  const ll = (lat, lon) => ({ x: +((lon - 136.55) * 91).toFixed(2), y: +((35.5 - lat) * 111).toFixed(2) });
  const S = (id, name, type, lat, lon, owner, lord) => Object.assign({ id, name, type, owner, lord }, ll(lat, lon));
  const poly = (pts) => pts.map(([a, b]) => { const p = ll(a, b); return [p.x, p.y]; });

  SGK.DATA = {
    scenario: '永禄3年 尾張・美濃・三河（試作）',
    start: { year: 1560, era: '永禄', eraStartYear: 1558, month: 1, day: 1, minute: 6 * 60 },
    bounds: { w: 64, h: 89 },
    startSettlement: 'tsushima',
    factions: {
      oda: { name: '織田家', leader: 'oda_nobunaga', color: '#c8402f' },
      saito: { name: '斎藤家', leader: 'saito_yoshitatsu', color: '#3a6fc4' },
      imagawa: { name: '今川家', leader: 'imagawa_yoshimoto', color: '#8a55b8' },
    },
    people: {
      oda_nobunaga: { name: '織田信長', faction: 'oda' },
      oda_nobukiyo: { name: '織田信清', faction: 'oda' },
      hayashi_hidesada: { name: '林秀貞', faction: 'oda' },
      shibata_katsuie: { name: '柴田勝家', faction: 'oda' },
      niwa_nagahide: { name: '丹羽長秀', faction: 'oda' },
      saito_yoshitatsu: { name: '斎藤義龍', faction: 'saito' },
      imagawa_yoshimoto: { name: '今川義元', faction: 'imagawa' },
      okabe_motonobu: { name: '岡部元信', faction: 'imagawa' },
      udono_nagateru: { name: '鵜殿長照', faction: 'imagawa' },
      matsudaira_motoyasu: { name: '松平元康', faction: 'imagawa' },
    },
    settlements: [
      S('inabayama', '稲葉山城', 'castle', 35.434, 136.782, 'saito', 'saito_yoshitatsu'),
      S('ogaki', '大垣城', 'castle', 35.362, 136.612, 'saito', null),
      S('inuyama', '犬山城', 'castle', 35.388, 136.939, 'oda', 'oda_nobukiyo'),
      S('kiyosu', '清洲城', 'castle', 35.215, 136.843, 'oda', 'oda_nobunaga'),
      S('nagoya', '那古野城', 'castle', 35.185, 136.899, 'oda', 'hayashi_hidesada'),
      S('narumi', '鳴海城', 'castle', 35.083, 136.950, 'imagawa', 'okabe_motonobu'),
      S('odaka', '大高城', 'castle', 35.064, 136.940, 'imagawa', 'udono_nagateru'),
      S('okazaki', '岡崎城', 'castle', 34.956, 137.159, 'imagawa', null),
      S('tsushima', '津島', 'town', 35.177, 136.741, 'oda', null),
      S('atsuta', '熱田', 'town', 35.128, 136.909, 'oda', null),
      S('ichinomiya', '一宮', 'village', 35.303, 136.803, 'oda', null),
      S('komaki', '小牧', 'village', 35.291, 136.912, 'oda', null),
      S('sunomata', '墨俣', 'village', 35.365, 136.686, 'saito', null),
      S('chiryu', '知立', 'village', 35.002, 137.051, 'imagawa', null),
      S('anjo', '安城', 'village', 34.959, 137.080, 'imagawa', null),
    ],
    terrain: {
      seas: [
        poly([[35.10, 136.50], [35.10, 136.70], [35.12, 136.82], [35.125, 136.905], [35.06, 136.90], [34.95, 136.86], [34.85, 136.85], [34.68, 136.85], [34.68, 136.50]]),
        poly([[34.98, 136.97], [34.92, 136.99], [34.86, 137.05], [34.80, 137.10], [34.78, 137.30], [34.68, 137.30], [34.68, 136.97]]),
      ],
      rivers: [
        { name: '木曽川', pts: poly([[35.45, 137.12], [35.40, 136.97], [35.39, 136.93], [35.36, 136.85], [35.30, 136.75], [35.20, 136.70], [35.10, 136.69]]) },
        { name: '長良川', pts: poly([[35.52, 136.80], [35.44, 136.78], [35.38, 136.72], [35.30, 136.69], [35.10, 136.68]]) },
        { name: '矢作川', pts: poly([[35.20, 137.25], [35.05, 137.19], [35.00, 137.16], [34.87, 137.07]]) },
      ],
    },
  };
})();
