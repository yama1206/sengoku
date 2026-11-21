// 2.42.0 みんなで遊ぶミニゲーム（js/party.js）の報酬。結果は遊んだ端末から届く。ひとり練習は報酬なし、2人だと6割、短い間隔での連続は受け付けない
(function () {
  const SIM = SGK.SIM, C = SIM.commands;
  const TBL = [1500, 1000, 700, 500, 400, 350, 300, 250, 200, 150]; // 個人戦の順位ごとの賞金
  C.partyResult = (w, p, c) => {
    if (!c || p.battle) return;
    if (c.game === 'kemari') kemariEntry(w, p, Math.max(0, Math.min(999, c.cnt | 0)), Math.max(0, Math.min(999, c.kicks | 0)), Math.max(1, Math.min(10, c.n | 0))); // 大会の記録は間隔によらず残す
    const now = Date.now(); if ((p.partyT || 0) > now - 20000) return SIM.say(p.id, '少し間をおいてから遊んでください');
    const n = Math.max(1, Math.min(10, c.n | 0)); if (n < 2) return;
    let money = 0, fame = 0, msg = '';
    if (c.game === 'cart' && !c.team) { if (!c.ok) return SIM.say(p.id, '荷を運びきれませんでした'); const load = Math.max(0, Math.min(1, +c.load || 0)); money = 700 + Math.round(1800 * load); fame = 1; msg = `荷運び競争に成功（荷の残り${Math.round(load * 100)}%）`; }
    else if (c.game === 'race' || c.game === 'archery' || c.game === 'fish' || c.game === 'cart') { // 2.65.0 荷運びのチーム戦
      const nm = c.game === 'race' ? '馬の障害レース' : c.game === 'fish' ? '釣り大会' : c.game === 'cart' ? '荷運び競争' : '弓の的当て大会';
      if (c.team) { const k = c.team === 'win' ? 0 : c.team === 'draw' ? 1 : 2; money = [1200, 700, 400][k]; fame = k === 0 ? 1 : 0; msg = `${nm}（チーム戦）${['勝ち', '引き分け', '負け'][k]}`; }
      else { const r = Math.max(1, Math.min(10, c.rank | 0)); money = TBL[r - 1]; fame = r === 1 ? 2 : r === 2 ? 1 : 0; msg = `${nm}で${r}位`; }
    } else if (c.game === 'hayashi') { // 2.68.0 囃子合わせ：みんなの合わせぐあいと難しさ
      const acc = Math.max(0, Math.min(1, +c.acc || 0)), df = Math.max(0, Math.min(2, c.diff | 0));
      money = Math.round((200 + acc * acc * 1300) * [0.7, 1, 1.4][df]); fame = acc >= 0.95 && df >= 1 ? 1 : 0; msg = `囃子合わせ（合わせぐあい${Math.round(acc * 100)}%）`;
    } else if (c.game === 'hide') { // 2.70.0 かくれんぼ？：隠れきる・全員見つける（探す側は見つけた人数も）
      const win = c.win ? 1 : 0, cnt = Math.max(0, Math.min(9, c.cnt | 0)), ws = Math.max(1, Math.min(9, c.ws | 0)); // 2.87.0 勝った逃げる側は4貫を山分け、勝った鬼側は5貫
      if (c.role !== 's' && c.ex) { // 2.88.0 脱出モードの逃げる側：全員(4人)脱出か3人脱出は1貫ずつ、2人なら脱出1.5貫・捕まった1貫、1人だけなら脱出2.5貫・捕まった0.5貫（人数が違うときは割合で同じ段階）
        const N = Math.max(1, Math.min(9, c.nh | 0)), E = Math.max(0, Math.min(N, c.ne | 0)), mine = c.esc ? 1 : 0;
        money = E === 0 ? 450 : E * 4 >= N * 3 ? 1000 : E * 2 >= N ? (mine ? 1500 : 1000) : (mine ? 2500 : 500);
      } else money = win ? (c.role === 's' ? 5000 : Math.floor(4000 / ws)) : 450 + (c.role === 's' ? cnt * 150 : 0); fame = win ? 1 : 0; msg = `かくれんぼ？${win ? '（勝ち）' : '（負け）'}`;
    } else if (c.game === 'kemari') { // 2.62.0 蹴鞠：続けた回数（みんなの）と自分が蹴った数
      const cnt = Math.max(0, Math.min(999, c.cnt | 0)), mine = Math.max(0, Math.min(cnt + 1, c.kicks | 0));
      money = Math.min(2000, cnt * 25 + mine * 15); fame = cnt >= 40 ? 1 : 0; msg = `蹴鞠で${cnt}回続けた（自分は${mine}回蹴った）`;
    } else return;
    money = Math.round(money * (n === 2 ? 0.6 : 1) / 10) * 10; p.partyT = now; p.money += money; p.fame = (p.fame || 0) + fame;
    SIM.say(p.id, `${msg}。賞金${SIM.money(money)}${fame ? `・名声+${fame}` : ''}`);
  };

  // ---- 2.62.0 蹴鞠大会：毎月5日、大きな町で。5日に始めた蹴鞠（2人以上）の続けた回数で競い、8日に順位を出して賞金と称号 ----
  const KM = (SIM.KEMARI = { DAY: 5, PRIZE: [10000, 5000, 3000], MIN: 10 });
  const dayIdx = (w) => { const st = SGK.DATA.start; return Math.floor((st.minute + w.time.min) / 1440) + (st.month - 1) * 30 + (st.day - 1); };
  KM.dom = (w) => (dayIdx(w) % 30) + 1; // その月の何日か
  KM.on = (w) => KM.dom(w) === KM.DAY;
  KM.key = (w) => Math.floor(dayIdx(w) / 30);
  const bigHere = (w, p) => { const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null; return s && SGK.DATA.isBig(s) ? s : null; };
  function kemariEntry(w, p, cnt, mine, n) {
    p.kmrBest = Math.max(p.kmrBest || 0, cnt);
    if (n < 2 || !KM.on(w)) return; const s = bigHere(w, p); if (!s) return;
    const T = (w.kemari = w.kemari && w.kemari.key === KM.key(w) ? w.kemari : { key: KM.key(w), towns: {}, done: false });
    const e = ((T.towns[s.id] = T.towns[s.id] || {})[p.id] = T.towns[s.id][p.id] || { cnt: 0, kicks: 0 });
    if (cnt > e.cnt || (cnt === e.cnt && mine > e.kicks)) { e.cnt = cnt; e.kicks = mine; }
    SIM.say(p.id, `蹴鞠大会（${s.name}）の記録：${e.cnt}回（自分${e.kicks}回）。8日に順位が出ます`);
  }
  KM.board = (w, sid, T0) => { const T = T0 || w.kemari; if (!T || (!T0 && T.key !== KM.key(w)) || !T.towns[sid]) return []; return Object.entries(T.towns[sid]).map(([id, e]) => ({ id, name: w.players[id] ? w.players[id].name : '？', cnt: e.cnt, kicks: e.kicks })).sort((a, b) => b.cnt - a.cnt || b.kicks - a.kicks); };
  SIM.systems.push(function kemariTaikai(w) {
    const di = dayIdx(w); if (w.kmDay === di) return; const first = w.kmDay == null; w.kmDay = di; if (first) return;
    const dom = KM.dom(w);
    if (dom === KM.DAY - 1) SIM.newsTo(w, '明日5日は、大きな町の通りで蹴鞠大会が開かれます（2人以上で続けた回数を競う）');
    if (dom === KM.DAY) SIM.newsTo(w, '今日は蹴鞠大会の日です。大きな町の通りの「みんなで遊ぶ」から蹴鞠を始めると記録が残ります');
    const T = w.kemari; if (!T || T.done || (T.key === KM.key(w) && dom < 8)) return; T.done = true; // 8日（間が飛んでも次の月までに）順位を出す
    for (const sid in T.towns) {
      const s = SIM.settlement(w, sid), b = KM.board(w, sid, T); let rank = 0, prev = null;
      b.forEach((x, i) => {
        if (!prev || prev.cnt !== x.cnt || prev.kicks !== x.kicks) rank = i + 1; prev = x;
        const q = w.players[x.id]; if (!q) return;
        const prize = x.cnt >= KM.MIN && rank <= 3 ? KM.PRIZE[rank - 1] : 0; if (prize) q.money += prize;
        if (rank <= 3 && x.cnt >= KM.MIN) q.kmrPodium = (q.kmrPodium || 0) + 1;
        if (rank === 1 && x.cnt >= 50) q.kmrWin = (q.kmrWin || 0) + 1;
        q.kmrTaikai = Math.max(q.kmrTaikai || 0, x.cnt);
        SIM.say(q.id, `蹴鞠大会（${s ? s.name : ''}）：${rank}位（${x.cnt}回）${prize ? `。賞金${SIM.money(prize)}` : x.cnt < KM.MIN ? `（賞金は${KM.MIN}回以上から）` : ''}`);
      });
      if (b.length && b[0].cnt >= KM.MIN) SIM.newsTo(w, `蹴鞠大会（${s ? s.name : ''}）：一番は${b.filter((x) => x.cnt === b[0].cnt && x.kicks === b[0].kicks).map((x) => x.name).join('・')}（${b[0].cnt}回）`);
    }
  });
  SIM.defTitle({ id: 'mariashi', name: '鞠足', desc: '蹴鞠大会で三位までに入った者。', cond: '蹴鞠大会で3位以内（10回以上）', order: 54, check: (w, p) => (p.kmrPodium || 0) >= 1 });
  SIM.defTitle({ id: 'kemarimeijin', name: '蹴鞠の名手', desc: '蹴鞠大会で鞠を50回以上つないで優勝した者。', cond: '蹴鞠大会で50回以上続けて優勝', order: 55, check: (w, p) => (p.kmrWin || 0) >= 1 });
  SIM.defTitle({ id: 'kemarisennin', name: '鞠聖', desc: '鞠を百回つないだ、蹴鞠の神に愛された者。', cond: '蹴鞠大会で100回以上続ける', order: 56, check: (w, p) => (p.kmrTaikai || 0) >= 100 });

  // 通りに大会の様子を出す
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.here) return r;
    const s = SIM.settlement(w, r.here.id); if (!s || !SGK.DATA.isBig(s)) return r;
    const dom = KM.dom(w); if (dom < KM.DAY - 1 || dom > 8) return r;
    r.here.kemari = { dom, on: dom === KM.DAY, board: KM.board(w, s.id).slice(0, 10) };
    return r;
  };
})();
