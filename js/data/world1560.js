// シナリオデータ：永禄3年(1560)正月 尾張・美濃・西三河（第0段階の試作用・史実の確認は今後）
(function () {
  // 緯度経度 → ゲーム内のkm座標（x:東, y:南）。原点は北西の角（東経135.1度・北緯36.1度）
  const LON0 = 135.1, LAT0 = 36.1;
  const ll = (lat, lon) => ({ x: +((lon - LON0) * 91).toFixed(2), y: +((LAT0 - lat) * 111).toFixed(2) });
  const S = (id, name, type, lat, lon, owner, lord) => Object.assign({ id, name, type, owner, lord }, ll(lat, lon));
  const poly = (pts) => pts.map(([a, b]) => { const p = ll(a, b); return [p.x, p.y]; });

  SGK.DATA = {
    scenario: '永禄3年 近畿・東海（試作）',
    mapOrigin: { lon: LON0, lat: LAT0 }, // 変えたら save.js の移行で座標をずらす
    start: { year: 1560, era: '永禄', eraStartYear: 1558, month: 1, day: 1, minute: 6 * 60 },
    bounds: { w: 309, h: 200 },
    startSettlement: 'tsushima',
    factions: {
      oda: { name: '織田家', leader: 'oda_nobunaga', color: '#c8402f' },
      saito: { name: '斎藤家', leader: 'saito_yoshitatsu', color: '#3a6fc4' },
      imagawa: { name: '今川家', leader: 'imagawa_yoshimoto', color: '#8a55b8' },
      azai: { name: '浅井家', leader: 'azai_hisamasa', color: '#2f8f6a' },
      rokkaku: { name: '六角家', leader: 'rokkaku_yoshikata', color: '#b08a2e' },
      asakura: { name: '朝倉家', leader: 'asakura_yoshikage', color: '#6d8a2a' },
      miyoshi: { name: '三好家', leader: 'miyoshi_nagayoshi', color: '#2d7e8e' },
      kitabatake: { name: '北畠家', leader: 'kitabatake_tomonori', color: '#b0567f' },
      honganji: { name: '本願寺', leader: 'kennyo', color: '#8a7560' },
      ashikaga: { name: '足利将軍家', leader: 'ashikaga_yoshiteru', color: '#d9b44a' },
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
      iio_noritatsu: { name: '飯尾連龍', faction: 'imagawa' },
      asahina_yasutomo: { name: '朝比奈泰朝', faction: 'imagawa' },
      azai_hisamasa: { name: '浅井久政', faction: 'azai' },
      rokkaku_yoshikata: { name: '六角義賢', faction: 'rokkaku' },
      asakura_yoshikage: { name: '朝倉義景', faction: 'asakura' },
      miyoshi_nagayoshi: { name: '三好長慶', faction: 'miyoshi' },
      matsunaga_hisahide: { name: '松永久秀', faction: 'miyoshi' },
      kitabatake_tomonori: { name: '北畠具教', faction: 'kitabatake' },
      kennyo: { name: '本願寺顕如', faction: 'honganji' },
      ashikaga_yoshiteru: { name: '足利義輝', faction: 'ashikaga' },
    },
    settlements: [
      // 尾張・美濃・三河
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
      S('seki', '関', 'village', 35.49, 136.918, 'saito', null),
      S('chiryu', '知立', 'village', 35.002, 137.051, 'imagawa', null),
      S('anjo', '安城', 'village', 34.959, 137.080, 'imagawa', null),
      // 遠江・駿河
      S('yoshida', '吉田城', 'castle', 34.769, 137.392, 'imagawa', null),
      S('hikuma', '曳馬城', 'castle', 34.711, 137.726, 'imagawa', 'iio_noritatsu'),
      S('kakegawa', '掛川城', 'castle', 34.775, 138.014, 'imagawa', 'asahina_yasutomo'),
      S('sunpu', '駿府館', 'castle', 34.980, 138.383, 'imagawa', 'imagawa_yoshimoto'),
      // 伊勢
      S('nagashima', '長島', 'town', 35.09, 136.70, 'honganji', null),
      S('okawachi', '大河内城', 'castle', 34.53, 136.47, 'kitabatake', 'kitabatake_tomonori'),
      S('ano', '安濃津', 'town', 34.72, 136.505, 'kitabatake', null),
      S('ujiyamada', '宇治山田', 'town', 34.49, 136.71, 'kitabatake', null),
      // 近江・越前
      S('odani', '小谷城', 'castle', 35.459, 136.277, 'azai', 'azai_hisamasa'),
      S('kunitomo', '国友', 'village', 35.41, 136.29, 'azai', null),
      S('kannonji', '観音寺城', 'castle', 35.144, 136.157, 'rokkaku', 'rokkaku_yoshikata'),
      S('kusatsu', '草津', 'town', 35.017, 135.96, 'rokkaku', null),
      S('hino', '日野', 'village', 35.015, 136.25, 'rokkaku', null),
      S('ichijodani', '一乗谷城', 'castle', 36.0, 136.30, 'asakura', 'asakura_yoshikage'),
      S('tsuruga', '敦賀', 'town', 35.64, 136.07, 'asakura', null),
      // 畿内
      S('kyo', '京', 'town', 35.011, 135.768, 'ashikaga', null),
      S('akutagawa', '芥川山城', 'castle', 34.873, 135.592, 'miyoshi', 'miyoshi_nagayoshi'),
      S('iimori', '飯盛山城', 'castle', 34.734, 135.664, 'miyoshi', null),
      S('shigisan', '信貴山城', 'castle', 34.61, 135.674, 'miyoshi', 'matsunaga_hisahide'),
      S('ishiyama', '石山本願寺', 'castle', 34.684, 135.526, 'honganji', 'kennyo'),
      S('sakai', '堺', 'town', 34.573, 135.483, 'miyoshi', null),
      S('hyogo', '兵庫津', 'town', 34.70, 135.18, 'miyoshi', null),
      S('nara', '奈良', 'town', 34.685, 135.83, 'miyoshi', null),
    ],
    terrain: {
      seas: [
        // 日本海（若狭湾・越前）
        poly([[36.2, 135.0], [36.2, 136.12], [36.0, 136.03], [35.8, 135.98], [35.7, 136.03], [35.66, 136.07], [35.63, 135.98], [35.57, 135.90],
          [35.53, 135.78], [35.49, 135.73], [35.55, 135.62], [35.51, 135.50], [35.47, 135.38], [35.55, 135.33], [35.77, 135.25], [35.78, 135.0]]),
        // 琵琶湖（いまは海と同じく通れない）
        poly([[35.52, 136.15], [35.45, 136.21], [35.38, 136.25], [35.27, 136.22], [35.15, 136.08], [35.10, 136.03], [35.03, 135.94], [34.98, 135.91],
          [35.00, 135.87], [35.07, 135.88], [35.20, 135.93], [35.32, 136.02], [35.41, 136.04], [35.48, 136.07]]),
        // 大坂湾
        poly([[34.75, 135.0], [34.70, 135.1], [34.68, 135.20], [34.71, 135.30], [34.71, 135.42], [34.62, 135.44], [34.57, 135.46], [34.46, 135.36],
          [34.37, 135.25], [34.28, 135.1], [34.2, 135.0]]),
        // 伊勢湾・三河湾・遠州灘・駿河湾
        poly([[35.04, 136.70], [35.07, 136.78], [35.10, 136.84], [35.11, 136.90], [35.06, 136.89], [34.96, 136.85], [34.85, 136.84], [34.75, 136.86],
          [34.69, 136.93], [34.72, 136.98], [34.80, 136.99], [34.86, 137.02], [34.86, 137.10], [34.82, 137.17], [34.79, 137.26], [34.76, 137.33],
          [34.72, 137.35], [34.68, 137.25], [34.64, 137.12], [34.60, 137.02], [34.57, 137.01], [34.60, 137.20], [34.63, 137.40], [34.66, 137.60],
          [34.67, 137.78], [34.65, 137.98], [34.60, 138.18], [34.62, 138.23], [34.75, 138.27], [34.88, 138.33], [34.94, 138.41], [35.00, 138.50],
          [35.05, 138.6], [34.2, 138.6], [34.2, 136.88], [34.30, 136.88], [34.40, 136.88], [34.48, 136.84], [34.51, 136.74], [34.53, 136.65],
          [34.60, 136.56], [34.72, 136.53], [34.84, 136.59], [34.95, 136.64], [35.02, 136.68]]),
      ],
      rivers: [
        { name: '木曽川', pts: poly([[35.45, 137.12], [35.40, 136.97], [35.39, 136.93], [35.36, 136.85], [35.30, 136.75], [35.20, 136.72], [35.06, 136.72]]) },
        { name: '長良川', pts: poly([[35.52, 136.80], [35.44, 136.78], [35.38, 136.72], [35.30, 136.69], [35.05, 136.69]]) },
        { name: '矢作川', pts: poly([[35.20, 137.25], [35.05, 137.19], [35.00, 137.16], [34.86, 137.08]]) },
        { name: '天竜川', pts: poly([[35.05, 137.85], [34.85, 137.82], [34.67, 137.80]]) },
        { name: '大井川', pts: poly([[35.10, 138.10], [34.90, 138.17], [34.77, 138.26]]) },
        { name: '淀川', pts: poly([[34.98, 135.90], [34.92, 135.80], [34.85, 135.68], [34.77, 135.55], [34.71, 135.43]]) },
        { name: '九頭竜川', pts: poly([[35.95, 136.55], [36.05, 136.35], [36.15, 136.15]]) },
      ],
    },
  };
})();
