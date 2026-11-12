// 世界シミュレーション（ホストだけが動かす。状態はすべて素のデータ＝そのままセーブ・送信できる）
(function () {
  const SIM = SGK.SIM = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 乱数（状態をセーブに含めるので、ロード後も続きから同じ流れになる）
  SIM.rand = function (w) {
    let t = (w.seed = (w.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  SIM.pointInPoly = function (x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  SIM.isSea = (x, y) => SGK.DATA.terrain.seas.some((p) => SIM.pointInPoly(x, y, p));

  SIM.createWorld = function (seed) {
    const D = SGK.DATA;
    const w = {
      schema: SGK.SAVE_SCHEMA, version: SGK.VERSION, scenario: D.scenario,
      seed: (seed >>> 0) || 1, nextId: 1,
      time: { min: 0 },
      factions: clone(D.factions), people: clone(D.people),
      settlements: clone(D.settlements),
      players: {}, tokens: {}, npcs: {},
    };
    const towns = w.settlements.filter((s) => s.type !== 'castle');
    const castles = w.settlements.filter((s) => s.type === 'castle');
    towns.forEach((s) => SIM.spawnNpc(w, 'merchant', null, s));
    castles.forEach((s) => SIM.spawnNpc(w, 'patrol', s.owner, s));
    return SIM.ensure(w);
  };

  SIM.spawnNpc = function (w, kind, faction, at) {
    const id = 'n' + w.nextId++;
    w.npcs[id] = { id, kind, faction, x: at.x, y: at.y, tx: null, ty: null, dest: null, at: at.id, home: at.id,
      wait: SIM.rand(w) * 240, speed: kind === 'merchant' ? 25 : 35 };
    return w.npcs[id];
  };

  SIM.settlement = (w, id) => w.settlements.find((s) => s.id === id);

  SIM.addPlayer = function (w, token, name) {
    if (w.tokens[token]) {
      const p = w.players[w.tokens[token]];
      if (name) p.name = name;
      return p.id;
    }
    if (Object.keys(w.players).length >= SGK.CFG.MAX_PLAYERS) return null;
    const st = SIM.settlement(w, SGK.DATA.startSettlement);
    const id = 'p' + w.nextId++;
    w.players[id] = { id, name: name || '浪人', x: st.x + (SIM.rand(w) - 0.5), y: st.y + (SIM.rand(w) - 0.5),
      tx: null, ty: null, dest: null, at: st.id, speed: SGK.CFG.WALK_KM_PER_DAY, status: '浪人' };
    SIM.ensurePlayer(w.players[id]);
    w.tokens[token] = id;
    return id;
  };

  // ===== コマンド（プレイヤーの操作はすべてここを通る：通信・セーブ・記録を同じ形で扱える） =====
  SIM.commands = {
    move(w, p, c) {
      if (p.busy) return SIM.say(p.id, `${p.busy.label}の最中です（取りやめると報酬はもらえません）`);
      const B = SGK.DATA.bounds;
      let x = Math.max(0, Math.min(B.w, +c.x)), y = Math.max(0, Math.min(B.h, +c.y));
      let dest = null;
      if (c.dest) { const s = SIM.settlement(w, c.dest); if (s) { x = s.x; y = s.y; dest = s.id; } }
      if (!dest && SIM.isSea(x, y)) return; // 海の上は目的地にできない（船は後日）
      p.tx = x; p.ty = y; p.dest = dest; p.at = null;
    },
    stop(w, p) { p.tx = p.ty = null; p.dest = null; },
  };
  SIM.applyCommand = function (w, pid, cmd) {
    const p = w.players[pid];
    const fn = cmd && SIM.commands[cmd.type];
    if (p && fn) fn(w, p, cmd);
  };

  // ===== システム（毎tick順番に実行。機能を増やすときはここに足す） =====
  function moveEntity(e, dtMin) {
    if (e.tx == null) return false;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy);
    const step = (e.speed / 1440) * dtMin;
    if (d <= step) { e.x = e.tx; e.y = e.ty; e.tx = e.ty = null; return true; }
    e.x += (dx / d) * step; e.y += (dy / d) * step;
    return false;
  }
  SIM.systems = [
    function playerMove(w, dt) {
      for (const p of Object.values(w.players)) if (moveEntity(p, dt) && p.dest) { p.at = p.dest; p.dest = null; SIM.onPlayerArrive(w, p); }
    },
    function npcLife(w, dt) {
      for (const n of Object.values(w.npcs)) {
        if (n.kind === 'bandit') continue; // 野盗は military.js で動かす
        if (n.tx == null) {
          n.wait -= dt;
          if (n.wait > 0) continue;
          // 行き先を選ぶ（商人：町や村へ／巡回：自勢力の拠点の周り）
          let cands = w.settlements.filter((s) => s.id !== n.at && (n.kind === 'merchant' ? s.type !== 'castle' || SIM.rand(w) < 0.3 : s.owner === n.faction));
          if (!cands.length) cands = w.settlements.filter((s) => s.id !== n.at);
          const s = cands[Math.floor(SIM.rand(w) * cands.length)];
          if (n.kind === 'merchant') SIM.merchantDepart(w, n, SIM.settlement(w, n.at));
          n.tx = s.x; n.ty = s.y; n.dest = s.id; n.at = null;
        } else if (moveEntity(n, dt)) {
          n.at = n.dest; n.dest = null; if (n.kind === 'merchant') SIM.merchantArrive(w, n, SIM.settlement(w, n.at)); n.wait = 120 + SIM.rand(w) * 480;
        }
      }
    },
  ];

  SIM.step = function (w, dtMin) {
    while (dtMin > 0) {
      const d = Math.min(dtMin, 10);
      w.time.min += d;
      for (const sys of SIM.systems) sys(w, d);
      dtMin -= d;
    }
  };

  // 参加者へ送る動く部分（将来は「各プレイヤーの近くだけ」に絞る）
  const r = (v) => Math.round(v * 100) / 100;
  SIM.dynamicState = function (w) {
    return {
      t: w.time.min,
      p: Object.values(w.players).map((p) => [p.id, p.name, r(p.x), r(p.y), p.at, p.tx == null ? null : r(p.tx), p.ty == null ? null : r(p.ty), p.status]),
      n: Object.values(w.npcs).map((n) => [n.id, n.kind, n.faction, r(n.x), r(n.y), n.size || 0, n.battle ? 1 : 0]),
    };
  };
  SIM.staticState = (w) => ({ settlements: w.settlements, factions: w.factions, people: w.people, scenario: w.scenario });

  // ===== 暦（仮：1か月30日・閏月なし） =====
  const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  SIM.formatDate = function (min) {
    const st = SGK.DATA.start;
    const total = st.minute + min;
    const dayIdx = Math.floor(total / 1440) + (st.month - 1) * 30 + (st.day - 1);
    const mod = ((total % 1440) + 1440) % 1440;
    const year = st.year + Math.floor(dayIdx / 360);
    const month = Math.floor((dayIdx % 360) / 30) + 1, day = (dayIdx % 30) + 1;
    const hour = Math.floor(mod / 60);
    const eraY = year - st.eraStartYear + 1;
    return `${st.era}${eraY === 1 ? '元' : eraY}年 ${month}月${day}日 ${SHI[Math.floor(((hour + 1) % 24) / 2)]}の刻`;
  };
})();
