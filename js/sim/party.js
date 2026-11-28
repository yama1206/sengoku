// 2.42.0 みんなで遊ぶミニゲーム（js/party.js）の報酬。結果は遊んだ端末から届く。ひとり練習は報酬なし、2人だと6割、短い間隔での連続は受け付けない
(function () {
  const SIM = SGK.SIM, C = SIM.commands;
  const TBL = [1500, 1000, 700, 500, 400, 350, 300, 250, 200, 150]; // 個人戦の順位ごとの賞金
  C.partyResult = (w, p, c) => {
    if (!c || p.battle) return;
    if (c.game === 'kemari') kemariEntry(w, p, Math.max(0, Math.min(999, c.cnt | 0)), Math.max(0, Math.min(999, c.kicks | 0)), Math.max(1, Math.min(10, c.n | 0)), Math.max(0, Math.min(999, c.great | 0)), Math.max(0, Math.min(999, c.miss | 0))); // 大会の記録は間隔によらず残す（3.37.1 見事の回数と落とした回数）
    const now = Date.now(); if ((p.partyT || 0) > now - 20000) return SIM.say(p.id, '少し間をおいてから遊んでください');
    const n = Math.max(1, Math.min(10, c.n | 0)); if (n < 2) return;
    let money = 0, fame = 0, msg = '';
    if (c.game === 'cart' && !c.team) { if (!c.ok) return SIM.say(p.id, '荷を運びきれませんでした'); const load = Math.max(0, Math.min(1, +c.load || 0)); money = 700 + Math.round(1800 * load); fame = 1; msg = `荷運び競争に成功（荷の残り${Math.round(load * 100)}%）`; }
    else if (c.game === 'race' || c.game === 'archery' || c.game === 'fish' || c.game === 'cart') { // 2.65.0 荷運びのチーム戦
      const nm = c.game === 'race' ? '馬競争' : c.game === 'fish' ? '釣り大会' : c.game === 'cart' ? '荷運び競争' : '弓の的当て大会';
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

  // ---- 2.105.3 釣り大会：町の「みんなで遊ぶ」で始め、ゲームの時間で1日のあいだ、参加者がそれぞれ地図で釣った魚（gatherEnd）を数える ----
  const FT = (SIM.FISHT = { MIN: 1440 });
  C.fishTaikai = (w, p, c) => {
    if (!c || p.battle) return;
    const ids = [...new Set([p.id, ...(Array.isArray(c.ids) ? c.ids : [])].map(String))].filter((id) => w.players[id]).slice(0, 10);
    const all = (w.fishTaikai = w.fishTaikai || {}), id = 'ft' + p.id + '-' + w.time.min;
    const T = (all[id] = { id, ids, tm: Object.fromEntries(ids.map((x, i) => [x, i % 2])), team: !!c.team && ids.length >= 2, mode: c.mode === 'num' ? 'num' : 'big', end: w.time.min + FT.MIN, rec: {} });
    for (const x of ids) { const q = w.players[x]; q.fishT = T.id; SIM.say(x, `釣り大会が始まりました（${T.mode === 'big' ? 'いちばん大きい魚' : '釣った数'}で競う${T.team ? '・チーム戦' : ''}、${ids.length}人）。ゲームの時間で1日のあいだ、川・湖・海で釣った魚が数えられます${ids.length < 2 ? '（ひとりなので賞金はありません）' : ''}`); }
  };
  SIM.fishTaikaiCatch = (w, p, name, size) => { // 釣れたとき（sim/creatures.js の gatherEnd から）
    const T = p.fishT && w.fishTaikai && w.fishTaikai[p.fishT]; if (!T || w.time.min >= T.end || !T.ids.includes(p.id)) return;
    const e = (T.rec[p.id] = T.rec[p.id] || { n: 0, best: 0, bn: '' }); e.n++; if (size > e.best) { e.best = size; e.bn = name; }
  };
  const ftBoard = (w, T) => { const big = T.mode === 'big', key = (x) => (big ? x.best : x.n); return T.ids.map((id) => ({ id, name: w.players[id] ? w.players[id].name : '？', tm: T.tm[id], ...(T.rec[id] || { n: 0, best: 0, bn: '' }) })).sort((a, b) => key(b) - key(a) || (big ? b.n - a.n : b.best - a.best)); };
  SIM.systems.push(function fishTaikai(w) {
    const all = w.fishTaikai; if (!all) return;
    for (const id in all) {
      const T = all[id]; if (w.time.min < T.end) continue; delete all[id];
      const b = ftBoard(w, T), n = b.length, big = T.mode === 'big', u = big ? 'cm' : '匹', lab = (x) => (big ? (x.best ? `${x.bn} ${x.best}cm` : '釣れず') : `${x.n}匹`);
      let team = null, head = '';
      if (T.team) { const pts = [0, 0]; for (const x of b) pts[x.tm] = big ? Math.max(pts[x.tm], x.best) : pts[x.tm] + x.n; team = pts[0] === pts[1] ? -1 : pts[0] > pts[1] ? 0 : 1; head = `チーム戦 赤 ${pts[0]}${u} ― 白 ${pts[1]}${u}（${team < 0 ? '引き分け' : team === 0 ? '赤の勝ち' : '白の勝ち'}）。`; }
      const list = b.map((x, i) => `${i + 1}位 ${x.name}（${lab(x)}）`).join('、');
      b.forEach((x, i) => {
        const q = w.players[x.id]; if (!q) return; if (q.fishT === T.id) q.fishT = null;
        let money = 0, fame = 0;
        if (n >= 2 && (x.n > 0 || T.team)) {
          if (T.team) { const k = team < 0 ? 1 : team === x.tm ? 0 : 2; money = [1200, 700, 400][k]; fame = k === 0 ? 1 : 0; }
          else { money = TBL[Math.min(9, i)]; fame = i === 0 ? 2 : i === 1 ? 1 : 0; }
          money = Math.round(money * (n === 2 ? 0.6 : 1) / 10) * 10; q.money += money; q.fame = (q.fame || 0) + fame;
        }
        SIM.say(x.id, `釣り大会が終わりました。${head}${T.team ? '' : `あなたは${i + 1}位（${lab(x)}）。`}${money ? `賞金${SIM.money(money)}${fame ? `・名声+${fame}` : ''}。` : ''}順位：${list}`);
      });
    }
  });
  { const bp = SIM.privateState; SIM.privateState = (w, pid) => { const r = bp(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r; const T = p.fishT && w.fishTaikai && w.fishTaikai[p.fishT]; r.me.fishT = T ? { left: Math.max(0, T.end - w.time.min), mode: T.mode, team: T.team, board: ftBoard(w, T).map((x) => ({ name: x.name, tm: x.tm, n: x.n, best: x.best, bn: x.bn })) } : null; return r; }; }

  // ---- 2.62.0 蹴鞠大会：毎月5日、大きな町で。5日に始めた蹴鞠（2人以上）の続けた回数で競い、8日に順位を出して賞金と称号 ----
  const KM = (SIM.KEMARI = { DAY: 5, PRIZE: [10000, 5000, 3000], MIN: 10 });
  const dayIdx = (w) => { const st = SGK.DATA.start; return Math.floor((st.minute + w.time.min) / 1440) + (st.month - 1) * 30 + (st.day - 1); };
  KM.dom = (w) => (dayIdx(w) % 30) + 1; // その月の何日か
  KM.on = (w) => KM.dom(w) === KM.DAY;
  KM.key = (w) => Math.floor(dayIdx(w) / 30);
  const bigHere = (w, p) => { const s = p.at && p.tx == null ? SIM.settlement(w, p.at) : null; return s && SGK.DATA.isBig(s) ? s : null; };
  // 3.37.1 順位は見事の回数（great）で付け、同じ数なら落とした回数（miss）が少ない方が上
  function kemariEntry(w, p, cnt, mine, n, gr, ms) {
    p.kmrBest = Math.max(p.kmrBest || 0, cnt);
    if (n < 2 || !KM.on(w)) return; const s = bigHere(w, p); if (!s) return;
    const T = (w.kemari = w.kemari && w.kemari.key === KM.key(w) ? w.kemari : { key: KM.key(w), towns: {}, done: false });
    const e = ((T.towns[s.id] = T.towns[s.id] || {})[p.id] = T.towns[s.id][p.id] || { cnt: 0, kicks: 0, great: -1, miss: 0 });
    const eg = e.great == null ? -1 : e.great, em = e.miss || 0;
    if (gr > eg || (gr === eg && ms < em)) { e.cnt = cnt; e.kicks = mine; e.great = gr; e.miss = ms; }
    SIM.say(p.id, `蹴鞠大会（${s.name}）の記録：見事${e.great}回（落とした${e.miss}回）。8日に順位が出ます`);
  }
  KM.board = (w, sid, T0) => { const T = T0 || w.kemari; if (!T || (!T0 && T.key !== KM.key(w)) || !T.towns[sid]) return []; return Object.entries(T.towns[sid]).map(([id, e]) => ({ id, name: w.players[id] ? w.players[id].name : '？', cnt: e.cnt, kicks: e.kicks, great: e.great == null ? 0 : e.great, miss: e.miss || 0 })).sort((a, b) => b.great - a.great || a.miss - b.miss || b.cnt - a.cnt); };
  SIM.systems.push(function kemariTaikai(w) {
    const di = dayIdx(w); if (w.kmDay === di) return; const first = w.kmDay == null; w.kmDay = di; if (first) return;
    const dom = KM.dom(w);
    if (dom === KM.DAY - 1) SIM.newsTo(w, '明日5日は、大きな町の通りで蹴鞠大会が開かれます（2人以上で見事の回数を競う）');
    if (dom === KM.DAY) SIM.newsTo(w, '今日は蹴鞠大会の日です。大きな町の通りの「みんなで遊ぶ」から蹴鞠を始めると記録が残ります');
    const T = w.kemari; if (!T || T.done || (T.key === KM.key(w) && dom < 8)) return; T.done = true; // 8日（間が飛んでも次の月までに）順位を出す
    for (const sid in T.towns) {
      const s = SIM.settlement(w, sid), b = KM.board(w, sid, T); let rank = 0, prev = null;
      b.forEach((x, i) => {
        if (!prev || prev.great !== x.great || prev.miss !== x.miss) rank = i + 1; prev = x;
        const q = w.players[x.id]; if (!q) return;
        const prize = x.cnt >= KM.MIN && rank <= 3 ? KM.PRIZE[rank - 1] : 0; if (prize) q.money += prize;
        if (rank <= 3 && x.cnt >= KM.MIN) q.kmrPodium = (q.kmrPodium || 0) + 1;
        if (rank === 1 && x.cnt >= 50) q.kmrWin = (q.kmrWin || 0) + 1;
        q.kmrTaikai = Math.max(q.kmrTaikai || 0, x.cnt);
        SIM.say(q.id, `蹴鞠大会（${s ? s.name : ''}）：${rank}位（見事${x.great}回・落とした${x.miss}回）${prize ? `。賞金${SIM.money(prize)}` : x.cnt < KM.MIN ? `（賞金は${KM.MIN}回以上から）` : ''}`);
      });
      if (b.length && b[0].cnt >= KM.MIN) SIM.newsTo(w, `蹴鞠大会（${s ? s.name : ''}）：一番は${b.filter((x) => x.great === b[0].great && x.miss === b[0].miss).map((x) => x.name).join('・')}（見事${b[0].great}回）`);
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
