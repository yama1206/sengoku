// 第3段階：募兵・部隊・野盗・リアルタイム戦闘・自動決着・結果の反映
(function () {
  const SIM = SGK.SIM, CFG = SGK.CFG;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 兵の種類（数値はすべて仮）。hp/atk/def は兵1人あたり、spd は戦場での m/秒、range は m
  const TR = SIM.TROOPS = {
    hero: { name: '本人', hp: 60, atk: 6, def: 2, spd: 5, range: 2 },
    yari: { name: '足軽（槍）', short: '槍', hp: 10, atk: 2, def: 1, spd: 4, range: 2.5, cost: 300, wage: 10 },
    yumi: { name: '弓足軽', short: '弓', hp: 8, atk: 1.5, def: 0, spd: 4, range: 35, ranged: true, cost: 500, wage: 15 },
    kiba: { name: '騎馬武者', short: '騎', hp: 18, atk: 4, def: 2, spd: 9, range: 2.5, cost: 1500, wage: 40, fame: 5 },
    bandit: { name: '野盗', hp: 9, atk: 1.8, def: 0, spd: 4.5, range: 2.5 },
    banditBow: { name: '野盗（弓）', hp: 7, atk: 1.2, def: 0, spd: 4.5, range: 30, ranged: true },
  };
  SIM.HIRE = ['yari', 'yumi', 'kiba'];
  // 拠点ごとに雇える兵（1日の補充数・上限）
  const POOL = {
    village: { yari: [1, 8] },
    town: { yari: [1, 8], yumi: [0.5, 6] },
    castle: { yari: [1, 10], yumi: [0.5, 6], kiba: [0.25, 3] },
  };
  const FIELD = { w: 120, h: 80 };
  const MAX_BANDITS = 4;

  SIM.troopCount = (tr) => Object.values(tr || {}).reduce((a, b) => a + b, 0);
  SIM.troopCap = (p) => Math.min(120, 10 + p.fame * 3);
  SIM.wage = (tr) => Object.entries(tr || {}).reduce((a, [k, n]) => a + (TR[k].wage || 0) * n, 0);
  const power = (army) => Object.entries(army || {}).reduce((a, [k, n]) => a + TR[k].hp * TR[k].atk * n, 0);

  // ---- 足りない項目を補う ----
  const baseEnsurePlayer = SIM.ensurePlayer;
  SIM.ensurePlayer = (p) => { baseEnsurePlayer(p); p.troops = p.troops || {}; if (p.battle === undefined) p.battle = null; };
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) {
    baseEnsure(w);
    w.battles = w.battles || {};
    if (w.mday == null) w.mday = w.day;
    for (const s of w.settlements) {
      s.pool = s.pool || {};
      for (const k in POOL[s.type]) if (s.pool[k] == null) s.pool[k] = Math.floor(POOL[s.type][k][1] / 2);
    }
    for (const p of Object.values(w.players)) if (p.battle && !w.battles[p.battle]) p.battle = null;
    if (!Object.values(w.npcs).some((n) => n.kind === 'bandit')) for (let i = 0; i < 3; i++) spawnBandit(w);
    return w;
  };

  // ---- 野盗 ----
  function spawnBandit(w) {
    const B = SGK.DATA.bounds;
    for (let i = 0; i < 40; i++) {
      const x = 3 + rnd(w) * (B.w - 6), y = 3 + rnd(w) * (B.h - 6);
      if (SIM.isSea(x, y) || w.settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 4)) continue;
      const id = 'n' + w.nextId++;
      const army = { bandit: 6 + Math.floor(rnd(w) * 13) };
      const bows = Math.floor(rnd(w) * 7); if (bows) army.banditBow = bows;
      w.npcs[id] = { id, kind: 'bandit', faction: null, x, y, tx: null, ty: null, hx: x, hy: y, wait: 0, speed: 28,
        army, size: SIM.troopCount(army), loot: Math.round((300 + rnd(w) * 1200) / 10) * 10, calm: 0, battle: null };
      return;
    }
  }
  function moveTo(e, dtMin) {
    if (e.tx == null) return false;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy), step = (e.speed / 1440) * dtMin;
    if (d <= step) { e.x = e.tx; e.y = e.ty; e.tx = e.ty = null; return true; }
    e.x += (dx / d) * step; e.y += (dy / d) * step; return false;
  }
  const inField = (p) => !p.battle && !(p.at && p.tx == null); // 拠点にいる人は襲われない
  function playerPower(p) { return power(p.troops) + TR.hero.hp * TR.hero.atk; }

  function banditTick(w, dt) {
    const now = w.time.min, B = SGK.DATA.bounds;
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'bandit' || n.battle) continue;
      let tgt = null, td = 5;
      if (n.calm < now) for (const p of Object.values(w.players)) { const d = dist(n, p); if (inField(p) && d < td) { td = d; tgt = p; } }
      if (tgt) {
        if (playerPower(tgt) > power(n.army) * 2) { // 強い相手からは逃げる
          const d = td || 1; n.tx = Math.max(0, Math.min(B.w, n.x + ((n.x - tgt.x) / d) * 3)); n.ty = Math.max(0, Math.min(B.h, n.y + ((n.y - tgt.y) / d) * 3));
        } else { n.tx = tgt.x; n.ty = tgt.y; }
        moveTo(n, dt);
        if (dist(n, tgt) < 0.35) startBattle(w, n, tgt);
        continue;
      }
      if (n.tx == null) {
        n.wait -= dt; if (n.wait > 0) continue;
        const x = n.hx + (rnd(w) - 0.5) * 12, y = n.hy + (rnd(w) - 0.5) * 12;
        if (x > 0 && y > 0 && x < B.w && y < B.h && !SIM.isSea(x, y)) { n.tx = x; n.ty = y; }
        n.wait = 60 + rnd(w) * 300;
      } else moveTo(n, dt);
    }
  }

  // ---- 戦闘の開始 ----
  function addUnits(b, side, owner, army) {
    const list = Object.entries(army).filter(([, n]) => n > 0);
    const fx = side === 'A' ? 1 : -1, base = side === 'A' ? 22 : FIELD.w - 22;
    list.forEach(([type, n], i) => {
      const t = TR[type];
      b.units.push({ id: b.next++, side, owner, type, n, hp: n * t.hp,
        x: base - fx * (t.ranged ? 8 : type === 'hero' ? 4 : 0), y: FIELD.h / 2 + (i - (list.length - 1) / 2) * 14 + (side === 'A' ? (b.pids.length - 1) * 6 : 0),
        order: side === 'A' ? 'hold' : 'charge' });
    });
  }
  function startBattle(w, n, p) {
    const id = 'b' + w.nextId++;
    const b = w.battles[id] = { id, npc: n.id, foe: '野盗', foeN: n.size, loot: n.loot, pids: [], units: [], next: 1, t: 0, start: {}, routed: false };
    n.battle = id; n.tx = n.ty = null;
    const joiners = Object.values(w.players).filter((q) => q === p || (inField(q) && dist(q, n) < 1.5));
    for (const q of joiners) {
      b.pids.push(q.id); q.battle = id; q.tx = q.ty = null; q.dest = null; b.start[q.id] = Object.assign({}, q.troops);
      addUnits(b, 'A', q.id, Object.assign({ hero: 1 }, q.troops));
      SIM.say(q.id, `野盗${n.size}人に襲われました！ 部隊に命令を出してください`);
    }
    addUnits(b, 'B', null, n.army);
  }

  // ---- 戦闘の計算（ホストで毎tick） ----
  const rad = (u) => 0.6 + Math.sqrt(u.n) * 0.7;
  const alive = (u) => u.hp > 0 && !u.gone;
  function stepBattle(w, b, dt) {
    b.t += dt;
    const us = b.units.filter(alive), dmg = new Map();
    for (const u of us) {
      const t = TR[u.type];
      if (u.order === 'retreat') {
        const ex = u.side === 'A' ? -4 : FIELD.w + 4; u.x += Math.sign(ex - u.x) * t.spd * dt;
        if ((u.side === 'A' && u.x < 1) || (u.side === 'B' && u.x > FIELD.w - 1)) u.gone = true;
        continue;
      }
      let e = null, ed = Infinity;
      for (const v of us) if (v.side !== u.side) { const d = dist(u, v); if (d < ed) { ed = d; e = v; } }
      if (!e) continue;
      const reach = rad(u) + rad(e) + t.range;
      if (ed > reach) {
        if (u.order === 'charge') { const s = Math.min(t.spd * dt, ed - reach + 0.3); u.x += ((e.x - u.x) / ed) * s; u.y += ((e.y - u.y) / ed) * s; }
        continue;
      }
      const per = Math.max(0.25, t.atk - TR[e.type].def * 0.5);
      const d = t.ranged ? u.n * per * dt * 0.35 * (1 - ed / (reach * 1.6)) : Math.min(u.n, e.n * 2 + 3) * per * dt * 0.5;
      dmg.set(e, (dmg.get(e) || 0) + d);
    }
    // 味方同士が重ならないように押し合う
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], c = us[j]; if (a.side !== c.side) continue;
      const d = dist(a, c) || 0.01, m = rad(a) + rad(c);
      if (d < m) { const k = (m - d) / 2 / d; a.x -= (c.x - a.x) * k; a.y -= (c.y - a.y) * k; c.x += (c.x - a.x) * k; c.y += (c.y - a.y) * k; }
    }
    for (const u of us) { u.y = Math.max(2, Math.min(FIELD.h - 2, u.y)); }
    for (const [u, d] of dmg) { u.hp = Math.max(0, u.hp - d); u.n = Math.ceil(u.hp / TR[u.type].hp - 1e-6); }
    // 野盗は数が減ると逃げ出す
    const bn = b.units.filter((u) => u.side === 'B' && alive(u)).reduce((a, u) => a + u.n, 0);
    if (!b.routed && bn < b.foeN * 0.3) { b.routed = true; b.units.forEach((u) => { if (u.side === 'B') u.order = 'retreat'; }); b.pids.forEach((pid) => SIM.say(pid, '野盗が逃げ出しました！')); }
    const aLive = b.units.some((u) => u.side === 'A' && alive(u)), bLive = b.units.some((u) => u.side === 'B' && alive(u));
    if (!bLive) finish(w, b, 'win');
    else if (!aLive) finish(w, b, b.units.some((u) => u.side === 'A' && u.gone && u.hp > 0) ? 'escape' : 'lose');
    else if (b.t > 300) autoResolve(w, b); // 長引いたら自動で決着
  }

  function autoResolve(w, b) {
    const pw = (side) => b.units.filter((u) => u.side === side && alive(u)).reduce((a, u) => a + u.hp * TR[u.type].atk, 0);
    const rA = pw('A') * (0.75 + rnd(w) * 0.5), rB = pw('B') * (0.75 + rnd(w) * 0.5);
    const win = rA >= rB, loss = Math.min(0.9, (win ? rB / rA : rA / rB) * 0.6);
    for (const u of b.units) {
      if (!alive(u)) continue;
      const winner = (u.side === 'A') === win;
      u.hp = winner ? u.hp * Math.max(0, 1 - loss * (0.6 + rnd(w) * 0.8)) : u.side === 'A' ? u.hp * 0.2 : 0; // 負けても一部は逃げ延びる
      u.n = Math.ceil(u.hp / TR[u.type].hp - 1e-6);
    }
    finish(w, b, win ? 'win' : 'lose');
  }

  // ---- 結果の反映 ----
  function surviving(b, pid) {
    const tr = {};
    for (const u of b.units) if (u.owner === pid && u.type !== 'hero' && u.hp > 0) tr[u.type] = (tr[u.type] || 0) + u.n;
    return tr;
  }
  function lossText(before, after) {
    const l = SIM.troopCount(before) - SIM.troopCount(after);
    return l > 0 ? `兵${l}人を失いました` : '兵の損失はありません';
  }
  function nearestSettlement(w, p) { return w.settlements.reduce((a, s) => (dist(s, p) < dist(a, p) ? s : a)); }
  function finish(w, b, res) {
    const n = w.npcs[b.npc];
    for (const pid of b.pids) {
      const p = w.players[pid]; if (!p) continue;
      const after = surviving(b, pid), lt = lossText(b.start[pid] || {}, after);
      p.troops = after; p.battle = null;
      if (res === 'win') {
        const share = Math.floor(b.loot / b.pids.length), fame = 1 + Math.floor(b.foeN / 10);
        p.money += share; p.fame += fame;
        SIM.say(pid, `勝利！ ${SIM.money(share)}を手に入れました（名声+${fame}）。${lt}`);
      } else if (res === 'lose') {
        const lost = Math.floor(p.money * 0.3); p.money -= lost;
        const s = nearestSettlement(w, p); p.x = s.x; p.y = s.y; p.at = s.id; p.tx = p.ty = null;
        SIM.say(pid, `敗北…… ${SIM.money(lost)}を奪われ、気がつくと${s.name}で手当てを受けていました。${lt}`);
      } else SIM.say(pid, `戦場から退きました。${lt}`);
    }
    if (n) {
      if (res === 'win') delete w.npcs[n.id];
      else {
        const army = {}; for (const u of b.units) if (u.side === 'B' && u.hp > 0) army[u.type] = (army[u.type] || 0) + u.n;
        if (!SIM.troopCount(army)) delete w.npcs[n.id];
        else { n.army = army; n.size = SIM.troopCount(army); n.battle = null; n.calm = w.time.min + 8 * 60; if (res === 'lose') n.loot += 200; }
      }
    }
    delete w.battles[b.id];
  }

  // ---- 1日ごと：兵の補充・給金・野盗の出現 ----
  function daily(w) {
    for (const s of w.settlements) for (const k in POOL[s.type]) { const [add, cap] = POOL[s.type][k]; s.pool[k] = Math.min(cap, (s.pool[k] || 0) + add); }
    for (const p of Object.values(w.players)) {
      const wage = SIM.wage(p.troops); if (!wage) continue;
      if (p.money >= wage) { p.money -= wage; continue; }
      let left = 0;
      for (const k in p.troops) { const go = Math.ceil(p.troops[k] * 0.2); p.troops[k] -= go; left += go; if (p.troops[k] <= 0) delete p.troops[k]; }
      SIM.say(p.id, `給金が払えず、兵${left}人が去りました`);
    }
    if (Object.values(w.npcs).filter((n) => n.kind === 'bandit').length < MAX_BANDITS && rnd(w) < 0.6) spawnBandit(w);
  }

  SIM.systems.push(
    function militaryDay(w) { const d = Math.floor(w.time.min / 1440); while (w.mday < d) { w.mday++; daily(w); } },
    function partySpeed(w) { for (const p of Object.values(w.players)) p.speed = CFG.WALK_KM_PER_DAY - (SIM.troopCount(p.troops) ? 4 : 0); },
    banditTick,
    function battles(w, dtMin) { const sec = dtMin / CFG.MIN_PER_SEC; for (const b of Object.values(w.battles)) stepBattle(w, b, sec); },
  );

  // ---- コマンド ----
  function inTown(w, p) {
    const s = p.at && p.tx == null && !p.battle ? SIM.settlement(w, p.at) : null;
    if (!s) { SIM.say(p.id, '拠点の中でないとできません'); return null; }
    if (p.busy) { SIM.say(p.id, '仕事中です'); return null; }
    return s;
  }
  const baseMove = SIM.commands.move;
  Object.assign(SIM.commands, {
    move(w, p, c) { if (p.battle) return; baseMove(w, p, c); },
    recruit(w, p, c) {
      const s = inTown(w, p), t = TR[c.kind]; if (!s || !t || !SIM.HIRE.includes(c.kind)) return;
      if (t.fame && p.fame < t.fame) return SIM.say(p.id, `${t.name}を雇うには名声${t.fame}が必要です`);
      const q = Math.min(Math.max(1, +c.qty || 1), Math.floor(s.pool[c.kind] || 0), SIM.troopCap(p) - SIM.troopCount(p.troops), Math.floor(p.money / t.cost));
      if (q <= 0) return SIM.say(p.id, (s.pool[c.kind] || 0) < 1 ? 'いま雇える者がいません' : SIM.troopCount(p.troops) >= SIM.troopCap(p) ? 'これ以上は率いられません（名声を上げると増えます）' : 'お金が足りません');
      p.money -= q * t.cost; s.pool[c.kind] -= q; p.troops[c.kind] = (p.troops[c.kind] || 0) + q;
      SIM.say(p.id, `${t.name}を${q}人雇いました（${SIM.money(q * t.cost)}）`);
    },
    dismiss(w, p, c) {
      if (p.battle || !p.troops[c.kind]) return;
      const q = Math.min(Math.max(1, +c.qty || 1), p.troops[c.kind]);
      p.troops[c.kind] -= q; if (!p.troops[c.kind]) delete p.troops[c.kind];
      SIM.say(p.id, `${TR[c.kind].name}を${q}人解き放ちました`);
    },
    order(w, p, c) {
      const b = w.battles[p.battle]; if (!b || !['charge', 'hold', 'retreat'].includes(c.order)) return;
      for (const u of b.units) if (u.owner === p.id && (c.unit === 'all' || u.id === +c.unit)) u.order = c.order;
    },
    battleAuto(w, p) { const b = w.battles[p.battle]; if (b) autoResolve(w, b); },
    battleFlee(w, p) {
      const b = w.battles[p.battle]; if (!b) return;
      const before = b.start[p.id] || {}, tr = surviving(b, p.id);
      for (const k in tr) { tr[k] = Math.floor(tr[k] * 0.7); if (!tr[k]) delete tr[k]; }
      p.troops = tr; p.battle = null;
      b.units = b.units.filter((u) => u.owner !== p.id); b.pids = b.pids.filter((x) => x !== p.id);
      SIM.say(p.id, `退却しました。${lossText(before, tr)}`);
      const n = w.npcs[b.npc]; if (n) n.calm = w.time.min + 6 * 60;
      if (!b.pids.length) finish(w, b, 'escape');
    },
  });

  // ---- 本人だけに送る情報（部隊・募兵・戦闘） ----
  const basePriv = SIM.privateState;
  const r1 = (v) => Math.round(v * 10) / 10;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid];
    Object.assign(r.me, { troops: p.troops, troopCap: SIM.troopCap(p), wage: SIM.wage(p.troops) });
    if (r.here) { const s = SIM.settlement(w, r.here.id); r.here.recruit = Object.keys(POOL[s.type]).map((k) => [k, Math.floor(s.pool[k] || 0)]); }
    const b = p.battle && w.battles[p.battle];
    r.battle = b ? { id: b.id, foe: b.foe, t: Math.floor(b.t), routed: b.routed,
      names: Object.fromEntries(b.pids.map((x) => [x, (w.players[x] || {}).name])),
      units: b.units.filter(alive).map((u) => [u.id, u.side, u.owner, u.type, u.n, r1(u.x), r1(u.y), u.order, Math.round((u.hp / (u.n * TR[u.type].hp || 1)) * 100)]) } : null;
    return r;
  };
  SIM.FIELD = FIELD;
})();
