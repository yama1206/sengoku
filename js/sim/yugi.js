// 2.102.0 遊戯屋（大きな町）：カードゲーム「戦国思想録」の入口。カードの所持は別セーブ、お金（文）だけ天下往来とつなぐ
//  カード側（card/index.html）が postMessage で「何文払った／もらった」を送り、画面側（yugiui.js）が yugiPay 命令にしてホストへ届ける
(function () {
  const SIM = SGK.SIM;
  SIM.commands.yugiPay = (w, p, c) => {
    let d = Math.trunc(+c.d);
    if (!isFinite(d) || !d) return;
    if (d < 0) { if (p.money < -d) return; p.money += d; return; } // 払う：足りなければ何も起きない
    p.money += Math.min(d, 5000); // もらう：対戦の賞金。1回5貫まで
  };

  // ---- 2.106.7 人と人の対戦：挑戦状と、対戦中のやりとりの中継（札の処理は挑んだ人の画面が全部行い、ホストはことづてを運ぶだけ） ----
  const SAY = (pid, t) => SIM.say(pid, t);
  const Y = (w) => { w.yugi = w.yugi || {}; const y = w.yugi; y.inv = y.inv || {}; y.match = y.match || {}; y.box = y.box || {}; y.n = y.n || 0; return y; };
  const near = (w, p, q) => !!(p && q && q !== p && !q.off && p.at && q.at === p.at && p.tx == null && q.tx == null);
  const post = (w, pid, m) => {
    const y = Y(w), b = (y.box[pid] = y.box[pid] || { n: 0, q: [] });
    if (m.t === 'state') b.q = b.q.filter((x) => !(x.m.t === 'state' && x.m.mid === m.mid)); // 古い盤面はまだ届いていなければ置き換える
    b.n++; b.q.push({ s: b.n, m }); if (b.q.length > 60) b.q.splice(0, b.q.length - 60);
  };
  const participants = (M) => M.members ? M.members.filter(Boolean) : [M.a, M.b];
  const inMatch = (w, pid) => Object.values(Y(w).match).find((M) => participants(M).includes(pid));
  const endMatch = (w, mid, quitter) => {
    const y = Y(w), M = y.match[mid]; if (!M) return; delete y.match[mid];
    if (quitter) for (const pid of participants(M)) if (pid !== quitter) post(w, pid, { t: 'quit', mid, quitter: M.members ? M.members.indexOf(quitter) : participants(M).indexOf(quitter) });
  };
  SIM.commands.yugiInv = (w, p, c) => {
    const y = Y(w), q = w.players[c.to];
    if (!near(w, p, q)) return SAY(p.id, '相手が同じ町にいません');
    if (inMatch(w, p.id) || inMatch(w, q.id)) return SAY(p.id, 'どちらかが、まだ別の手合わせの最中です');
    for (const id in y.inv) if (y.inv[id].from === p.id) delete y.inv[id]; // 前の挑戦は取り下げる
    y.n++; const id = 'y' + y.n; y.inv[id] = { id, from: p.id, to: q.id, t: Date.now() };
    SAY(p.id, `${q.name}に戦国思想録の手合わせを申し込んだ。返事を待っています`);
    SAY(q.id, `${p.name}が戦国思想録の手合わせを申し込んできた。この町の遊戯屋の「人と手合わせ」で受けられます`);
  };
  SIM.commands.yugiTagInv = (w, p, c) => {
    const y = Y(w), ids = Array.isArray(c.members) ? c.members.slice(0, 3) : [];
    if (ids.length !== 3 || new Set([p.id, ...ids]).size !== 4) return;
    if (inMatch(w, p.id) || ids.some((id) => !near(w, p, w.players[id]) || inMatch(w, id))) return SAY(p.id, '4人が同じ町で手合わせできる状態にしてください');
    y.n++; const id = 't' + y.n;
    y.inv[id] = { id, from: p.id, members: [p.id, ...ids], accepted: [p.id], t: Date.now() };
    for (const pid of ids) SAY(pid, `${p.name}から戦国思想録のタッグ戦に誘われた。遊戯屋で返事をしてください`);
  };
  SIM.commands.yugiTagCpuInv = (w, p, c) => {
    const y = Y(w), q = w.players[c.to];
    if (!near(w, p, q) || inMatch(w, p.id) || inMatch(w, q.id)) return;
    y.n++; const id = 't' + y.n;
    y.inv[id] = { id, from: p.id, members: [p.id, null, q.id, null], accepted: [p.id], cpu: true, t: Date.now() };
    SAY(q.id, `${p.name}から戦国思想録のCPUタッグ戦に誘われた。遊戯屋で返事をしてください`);
  };
  SIM.commands.yugiDecline = (w, p, c) => {
    const y = Y(w), v = y.inv[c.id]; if (!v || (v.members ? !v.members.includes(p.id) : v.to !== p.id && v.from !== p.id)) return; delete y.inv[c.id];
    if (v.members) { for (const pid of v.members) if (pid && pid !== p.id) SAY(pid, `${p.name}がタッグ戦の誘いを取り下げた`); return; }
    const other = v.from === p.id ? v.to : v.from;
    SAY(other, v.from === p.id ? `${p.name}は手合わせの申し込みを取り下げた` : `${p.name}は手合わせを断った`);
  };
  SIM.commands.yugiAccept = (w, p, c) => {
    const y = Y(w), v = y.inv[c.id]; if (!v || v.to !== p.id) return; const a = w.players[v.from];
    if (!near(w, p, a)) { delete y.inv[c.id]; return SAY(p.id, '相手が町を離れたので、手合わせは取りやめになった'); }
    if (inMatch(w, p.id) || inMatch(w, a.id)) return SAY(p.id, 'どちらかが、まだ別の手合わせの最中です');
    delete y.inv[c.id]; y.n++; const mid = 'm' + y.n; y.match[mid] = { a: a.id, b: p.id, t: Date.now() };
    post(w, a.id, { t: 'start', mid, host: 1, opp: p.name }); post(w, p.id, { t: 'start', mid, host: 0, opp: a.name });
  };
  SIM.commands.yugiTagAccept = (w, p, c) => {
    const y = Y(w), v = y.inv[c.id];
    if (!v || !v.members || !v.members.includes(p.id) || v.accepted.includes(p.id)) return;
    if (v.members.some((id) => id && id !== p.id && !near(w, p, w.players[id])) || v.members.some((id) => id && inMatch(w, id))) { delete y.inv[c.id]; return SAY(p.id, '参加者が町を離れたため、タッグ戦を取りやめた'); }
    v.accepted.push(p.id);
    if (v.accepted.length !== (v.cpu ? 2 : 4)) return;
    delete y.inv[c.id]; y.n++; const mid = 'm' + y.n;
    y.match[mid] = { a: v.members[0], b: v.members[1], members: v.members, t: Date.now() };
    v.members.forEach((pid, slot) => { if(pid)post(w, pid, { t: 'start', mid, host: slot === 0 ? 1 : 0, slot, tagCpu:!!v.cpu, members: v.members.map((id,i) => id ? w.players[id].name : i===1?'敵の先鋒CPU':'敵の次鋒CPU'), opp: w.players[v.members[slot===0?2:0]].name }); });
  };
  SIM.commands.yugiSend = (w, p, c) => {
    const M = Y(w).match[c.mid]; if (!M || !participants(M).includes(p.id) || !c.m || typeof c.m !== 'object') return;
    let n = 0; try { n = JSON.stringify(c.m).length; } catch (e) { return; } if (n > 200000) return;
    M.t = Date.now();
    if (M.members) {
      const to = M.members[c.m.to];
      if (to && to !== p.id) post(w, to, Object.assign({}, c.m, { mid: c.mid, from: M.members.indexOf(p.id) }));
    } else post(w, M.a === p.id ? M.b : M.a, Object.assign({}, c.m, { mid: c.mid }));
  };
  SIM.commands.yugiAck = (w, p, c) => { const b = Y(w).box[p.id]; if (b) b.q = b.q.filter((x) => x.s > +c.n); };
  SIM.commands.yugiEnd = (w, p, c) => { const M = Y(w).match[c.mid]; if (M && participants(M).includes(p.id)) endMatch(w, c.mid, c.quit ? p.id : null); };
  SIM.systems.push(function yugiTick(w) {
    if (!w.yugi) return; const y = w.yugi, now = Date.now();
    for (const id in y.inv) { const v = y.inv[id]; if (now - v.t > 180000) { delete y.inv[id]; SAY(v.from, '手合わせの申し込みに返事がなかった'); } }
    for (const mid in y.match) { const M = y.match[mid]; // 抜けた・町を離れた人がいれば、相手に知らせて終わる
      for (const pid of participants(M)) { const x = w.players[pid]; if (!x || x.off || x.at == null || x.tx != null) { endMatch(w, mid, pid); break; } }
      if (y.match[mid] && now - (M.t || 0) > 30 * 60000) endMatch(w, mid, null); // 30分なにもなければ片付ける
    }
  });
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const y = Y(w), b = y.box[pid], nm = (id) => (w.players[id] ? w.players[id].name : '？');
    r.me.yugi = {
      people: Object.values(w.players).filter((q) => near(w, p, q)).map((q) => ({ id: q.id, name: q.name })),
      inv: Object.values(y.inv).filter((v) => v.members ? v.members.includes(pid) : v.to === pid || v.from === pid).map((v) => ({ id: v.id, mine: v.from === pid, who: nm(v.from === pid ? (v.to || v.members?.find((id) => id && id !== pid)) : v.from), tag: !!v.members, cpu: !!v.cpu, accepted: !!v.accepted?.includes(pid), ready: v.accepted?.length || 0 })),
      box: b && b.q.length ? b.q : null,
    };
    return r;
  };
})();
