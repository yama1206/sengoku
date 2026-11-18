// 2.12.6 自宅：はじめに選んだ町に自宅がある。金庫（お金）と物置（荷）に預けておける。「休む」と早く傷が治る。
//  ほかの拠点へは 5貫で引っ越せる（金庫と物置の中身も一緒に運ぶ）。仕官するとその城へ無料で引っ越す
(function () {
  const SIM = SGK.SIM;
  const HM = (SIM.HOME = { moveCost: 5000, restHours: 6, restRate: 3, wifeRate: 2 }); // 休むと、拠点にいるとき（1日で全快）に加えて 1日あたり3回分ぶん早く治る（6時間で全快）
  const I = () => SGK.DATA.items;
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const kura = (p) => { p.kura = p.kura || { money: 0, inv: {}, cost: {} }; p.kura.inv = p.kura.inv || {}; p.kura.cost = p.kura.cost || {}; return p.kura; };
  const near = (w, p) => { let b = null, bd = Infinity; for (const s of w.settlements) { if (s.type !== 'town') continue; const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; b = s; } } return b; };

  // 自宅を移す（金庫と物置の中身も一緒に）
  SIM.moveHome = (w, p, sid, why) => {
    const s = SIM.settlement(w, sid); if (!s || p.home === sid) return false;
    p.home = sid;
    if (why) SIM.say(p.id, `${why}${s.name}に引っ越しました（金庫と物置の中身も運びました）`);
    return true;
  };

  // はじめに選んだ町を自宅にする
  const baseAdd = SIM.addPlayer;
  SIM.addPlayer = function (w, token, name, prof) {
    const pid = baseAdd.apply(this, arguments), p = pid && w.players[pid]; if (!p || p.home) return pid;
    const ps = prof && typeof prof.start === 'string' && SIM.settlement(w, prof.start);
    const st = ps && ps.type === 'town' ? ps : SIM.settlement(w, SGK.DATA.startSettlement);
    p.home = (st || near(w, p) || {}).id || null; kura(p);
    return pid;
  };

  // 仕官したら、その城へ無料で引っ越す
  const baseServe = SIM.commands.serve;
  SIM.commands.serve = function (w, p, c) {
    const was = p.clan, s = here(w, p);
    const r = baseServe.apply(this, arguments);
    if (!was && p.clan && s) SIM.moveHome(w, p, s.id, '仕官したので、');
    return r;
  };

  SIM.commands.home = (w, p, c) => {
    if (!c || p.battle) return;
    const s = here(w, p); if (!s) return SIM.say(p.id, '拠点の中でないとできません');
    const k = c.kind;
    if (k === 'move') {
      if (p.home === s.id) return;
      if (p.busy) return SIM.say(p.id, '仕事中です');
      if (p.money < HM.moveCost) return SIM.say(p.id, `引っ越すには${SIM.money(HM.moveCost)}かかります`);
      p.money -= HM.moveCost; SIM.moveHome(w, p, s.id, `${SIM.money(HM.moveCost)}を払って、`); return;
    }
    if (p.home !== s.id) return SIM.say(p.id, 'ここはあなたの自宅ではありません');
    const K = kura(p);
    if (k === 'rest') {
      if (p.busy) return SIM.say(p.id, '仕事中です');
      p.busy = { kind: 'rest', label: '自宅で休む', until: w.time.min + HM.restHours * 60, at: s.id, t0: w.time.min };
      p.restUntil = p.busy.until;
      return SIM.say(p.id, `自宅で休みます（${HM.restHours}時間。いつもより早く傷が治ります）`);
    }
    if (k === 'putM' || k === 'takeM') { // 金庫
      const put = k === 'putM', have = put ? p.money : K.money;
      const q = Math.floor(Math.min(have, c.qty === -1 ? have : Math.max(1, +c.qty || 0)));
      if (q <= 0) return;
      if (put) { p.money -= q; K.money += q; SIM.say(p.id, `金庫に${SIM.money(q)}を預けました`); } else { K.money -= q; p.money += q; SIM.say(p.id, `金庫から${SIM.money(q)}を出しました`); }
      return;
    }
    if (k === 'put' || k === 'take') { // 物置
      const it = I()[c.item]; if (!it) return;
      const put = k === 'put', from = put ? p.inv : K.inv, to = put ? K.inv : p.inv, fc = put ? (p.cost = p.cost || {}) : K.cost, tc = put ? K.cost : (p.cost = p.cost || {});
      const q = Math.floor(Math.min(from[c.item] || 0, c.qty === -1 ? Infinity : Math.max(1, +c.qty || 0)));
      if (q <= 0) return;
      const unit = fc[c.item] != null ? fc[c.item] : it.base, hv = to[c.item] || 0, old = tc[c.item] != null ? tc[c.item] : unit;
      tc[c.item] = (old * hv + unit * q) / (hv + q);
      from[c.item] -= q; if (!from[c.item]) { delete from[c.item]; delete fc[c.item]; }
      to[c.item] = hv + q;
      SIM.say(p.id, `${it.name}を${q}${it.unit}、物置${put ? 'に入れました' : 'から出しました'}`);
    }
  };

  SIM.systems.push(function homeTick(w, dt) {
    for (const p of Object.values(w.players)) {
      if (p.home === undefined) { const s = near(w, p); p.home = s ? s.id : null; kura(p); } // 前からいる人：近くの町を自宅にする
      if (p.busy && p.busy.kind === 'rest') { if (p.hpFrac != null && p.hpFrac < 1) p.hpFrac = Math.min(1, p.hpFrac + (dt / 1440) * (HM.restRate + (p.wife ? HM.wifeRate : 0))); } // 2.13.0 連れ合いがいるともっと早く
      else if (p.restUntil) { // 休み終わり（economy の busyTick が busy を消す）
        if (w.time.min >= p.restUntil) SIM.say(p.id, `よく休みました${p.hpFrac == null || p.hpFrac >= 1 ? '（傷はすっかり治りました）' : ''}`);
        p.restUntil = null;
      }
    }
  });

  // 本人に送る情報
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv.apply(this, arguments); const p = w.players[pid]; if (!r || !p || !r.me) return r;
    const s = p.home && SIM.settlement(w, p.home), K = kura(p);
    r.me.home = s ? { id: s.id, name: s.name } : null;
    r.me.kura = { money: K.money, inv: K.inv, cost: K.cost };
    return r;
  };
})();
