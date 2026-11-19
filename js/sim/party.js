// 2.42.0 みんなで遊ぶミニゲーム（js/party.js）の報酬。結果は遊んだ端末から届く。ひとり練習は報酬なし、2人だと6割、短い間隔での連続は受け付けない
(function () {
  const SIM = SGK.SIM, C = SIM.commands;
  const TBL = [1500, 1000, 700, 500, 400]; // 個人戦の順位ごとの賞金
  C.partyResult = (w, p, c) => {
    if (!c || p.battle) return;
    const now = Date.now(); if ((p.partyT || 0) > now - 20000) return SIM.say(p.id, '少し間をおいてから遊んでください');
    const n = Math.max(1, Math.min(5, c.n | 0)); if (n < 2) return;
    let money = 0, fame = 0, msg = '';
    if (c.game === 'cart') { if (!c.ok) return SIM.say(p.id, '荷を運びきれませんでした'); const load = Math.max(0, Math.min(1, +c.load || 0)); money = 700 + Math.round(1800 * load); fame = 1; msg = `荷運び競争に成功（荷の残り${Math.round(load * 100)}%）`; }
    else if (c.game === 'race' || c.game === 'archery') {
      const nm = c.game === 'race' ? '馬の障害レース' : '弓の的当て大会';
      if (c.team) { const k = c.team === 'win' ? 0 : c.team === 'draw' ? 1 : 2; money = [1200, 700, 400][k]; fame = k === 0 ? 1 : 0; msg = `${nm}（チーム戦）${['勝ち', '引き分け', '負け'][k]}`; }
      else { const r = Math.max(1, Math.min(5, c.rank | 0)); money = TBL[r - 1]; fame = r === 1 ? 2 : r === 2 ? 1 : 0; msg = `${nm}で${r}位`; }
    } else return;
    money = Math.round(money * (n === 2 ? 0.6 : 1) / 10) * 10; p.partyT = now; p.money += money; p.fame = (p.fame || 0) + fame;
    SIM.say(p.id, `${msg}。賞金${SIM.money(money)}${fame ? `・名声+${fame}` : ''}`);
  };
})();
