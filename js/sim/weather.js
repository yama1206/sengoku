// 2.52.0 天気。時刻だけで決まる（みんなの画面で同じ天気になる。保存・通信は不要）。いまは見た目の表示だけで、戦闘や移動には影響しない
//  月ごとの出やすさは WX_TABLE（[天気, 確率]。足して1に）。14時間ごとに天気が変わる
(function () {
  const SIM = SGK.SIM;
  // 【仮の絵文字】あとで絵に置き換える。置き換える場所はここ（mark）だけ。night は夜の晴れ
  const WX = {
    sunny: { name: '晴れ', mark: '☀️', night: '🌙' }, cloudy: { name: '曇り', mark: '☁️' }, rain: { name: '雨', mark: '🌧️' },
    storm: { name: '嵐（雷雨）', mark: '⛈️' }, snow: { name: '雪', mark: '❄️' }, fog: { name: '霧', mark: '🌫️' },
  };
  const WINTER = [['sunny', 0.35], ['cloudy', 0.25], ['snow', 0.3], ['fog', 0.05], ['rain', 0.05]];
  const SPRING = [['sunny', 0.5], ['cloudy', 0.2], ['rain', 0.27], ['fog', 0.03]];
  const AUTUMN = [['sunny', 0.5], ['cloudy', 0.25], ['rain', 0.2], ['fog', 0.05]];
  const WX_TABLE = [null, WINTER, WINTER, SPRING, SPRING, SPRING,
    [['sunny', 0.15], ['cloudy', 0.25], ['rain', 0.55], ['storm', 0.05]], // 6月：梅雨
    [['sunny', 0.4], ['cloudy', 0.15], ['rain', 0.25], ['storm', 0.2]], // 7月：台風の洪水の月
    [['sunny', 0.55], ['cloudy', 0.15], ['rain', 0.15], ['storm', 0.15]],
    [['sunny', 0.4], ['cloudy', 0.2], ['rain', 0.25], ['storm', 0.15]], // 9月：台風
    AUTUMN, AUTUMN, WINTER];
  const hash = (n) => { let h = Math.imul(n | 0, 2654435761) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  SIM.weatherAt = (min) => {
    const st = SGK.DATA.start, total = st.minute + (min || 0), di = Math.floor(total / 1440) + (st.month - 1) * 30 + (st.day - 1);
    const mon = Math.floor((((di % 360) + 360) % 360) / 30) + 1, r = hash(Math.floor(total / 840)); let acc = 0, id = 'sunny';
    for (const [k, p] of WX_TABLE[mon]) { acc += p; if (r < acc) { id = k; break; } }
    const w = WX[id], night = SIM.daylight && SIM.daylight(min || 0) < 0.3;
    return { id, name: w.name, mark: night && w.night ? w.night : w.mark };
  };
})();
