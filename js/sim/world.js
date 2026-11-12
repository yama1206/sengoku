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
      players: {}, tokens: {}, npcs: {}, mapOrigin: Object.assign({}, D.mapOrigin),
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
      const path = SIM.findPath(p.x, p.y, x, y);
      if (!path) return SIM.say(p.id, 'そこへは陸路で行けません');
      p.tx = x; p.ty = y; p.dest = dest; p.at = null; p.path = path;
    },
    stop(w, p) { p.tx = p.ty = null; p.dest = null; p.path = null; },
  };
  SIM.applyCommand = function (w, pid, cmd) {
    const p = w.players[pid];
    const fn = cmd && SIM.commands[cmd.type];
    if (p && fn) fn(w, p, cmd);
  };

  // ===== システム（毎tick順番に実行。機能を増やすときはここに足す） =====
  // 道筋（path）の通過点を順にたどる。速さは足もとの地形（街道・平地・山）で変わる
  function moveEntity(e, dtMin) {
    if (e.tx == null) { e.path = null; return false; }
    if (!e.path || !e.path.length) e.path = [[e.tx, e.ty]];
    let left = dtMin;
    while (left > 0 && e.path.length) {
      const [wx, wy] = e.path[0];
      const dx = wx - e.x, dy = wy - e.y, d = Math.hypot(dx, dy);
      const v = (e.speed / 1440) * SIM.speedAt(e.x, e.y); // km/分
      if (d <= v * left) { e.x = wx; e.y = wy; left -= v > 0 ? d / v : left; e.path.shift(); continue; }
      e.x += (dx / d) * v * left; e.y += (dy / d) * v * left; left = 0;
    }
    if (!e.path.length) { e.x = e.tx; e.y = e.ty; e.tx = e.ty = null; e.path = null; return true; }
    return false;
  }
  SIM.moveEntity = moveEntity;
  SIM.systems = [
    function playerMove(w, dt) {
      for (const p of Object.values(w.players)) {
        if (moveEntity(p, dt) && p.dest) { p.at = p.dest; p.dest = null; SIM.onPlayerArrive(w, p); continue; }
        // 歩いて（WASD・スティック）拠点の上で止まったときも「到着」とみなす
        if (p.tx == null && !p.at && !p.battle) {
          const s = w.settlements.find((x) => Math.hypot(x.x - p.x, x.y - p.y) < 0.8);
          if (s) { p.x = s.x; p.y = s.y; p.at = s.id; SIM.onPlayerArrive(w, p); }
        }
      }
    },
    function npcLife(w, dt) {
      for (const n of Object.values(w.npcs)) {
        if (n.kind === 'bandit' || n.kind === 'army') continue; // 野盗は military.js、軍勢は army.js で動かす
        if (n.tx == null) {
          n.wait -= dt;
          if (n.wait > 0) continue;
          // 行き先を選ぶ（商人：町や村へ／巡回：自勢力の拠点の周り）
          let cands = w.settlements.filter((s) => s.id !== n.at && (n.kind === 'merchant' ? s.type !== 'castle' || SIM.rand(w) < 0.3 : s.owner === n.faction));
          if (!cands.length) cands = w.settlements.filter((s) => s.id !== n.at);
          const s = cands[Math.floor(SIM.rand(w) * cands.length)];
          if (n.kind === 'merchant') SIM.merchantDepart(w, n, SIM.settlement(w, n.at));
          n.tx = s.x; n.ty = s.y; n.dest = s.id; n.at = null; n.path = SIM.findPath(n.x, n.y, s.x, s.y);
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

  // 地図の視界：自分の周りだけ他の部隊（NPC・他プレイヤー）が見える
  SIM.sightRadius = function (w, p) {
    let r = SGK.CFG.SIGHT_KM * (0.7 + 0.3 * SIM.daylight(w.time.min)); // 夜は視界が7割
    if (p.at && p.tx == null) { const s = SIM.settlement(w, p.at); if (s && s.type === 'castle') r *= 1.5; }
    else if (SIM.speedAt && SIM.terrainAt(p.x, p.y) === '山地') r *= 0.6;
    return r;
  };
  SIM.canSee = (p, r, x, y) => Math.hypot(x - p.x, y - p.y) <= r;

  // 参加者へ送る動く部分（pid を渡すと、その人に見えるものだけ）
  const r = (v) => Math.round(v * 100) / 100;
  SIM.dynamicState = function (w, pid) {
    const me = pid && w.players[pid], sr = me ? SIM.sightRadius(w, me) : 0;
    const vis = (e) => !me || e === me || SIM.canSee(me, sr, e.x, e.y);
    return {
      sr: me ? r(sr) : null,
      t: w.time.min,
      p: Object.values(w.players).filter(vis).map((p) => [p.id, p.name, r(p.x), r(p.y), p.at, p.tx == null ? null : r(p.tx), p.ty == null ? null : r(p.ty), p.status,
        p.tx != null && p.path ? p.path.map(([x, y]) => [r(x), r(y)]) : null]),
      n: Object.values(w.npcs).filter(vis).map((n) => [n.id, n.kind, n.faction, r(n.x), r(n.y), n.size || 0, n.battle ? 1 : 0,
        n.dest || null, n.cargo ? [n.cargo.item, n.cargo.qty] : null, n.kind === 'bandit' || n.kind === 'patrol' || n.kind === 'army' ? n.army || null : null, n.home || null, n.tx == null ? n.at || null : null]),
    };
  };
  SIM.staticState = (w) => ({ settlements: w.settlements, factions: w.factions, people: w.people, scenario: w.scenario });

  // ===== 暦（仮：1か月30日・閏月なし） =====
  const SHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  // 年の表示形式（'era'=和暦 / 'ad'=西暦 / 'both'=両方）。見た目だけの設定なので各自の端末に保存する
  SIM.yearFmt = 'era';
  SIM.formatDate = function (min) {
    const st = SGK.DATA.start;
    const total = st.minute + min;
    const dayIdx = Math.floor(total / 1440) + (st.month - 1) * 30 + (st.day - 1);
    const mod = ((total % 1440) + 1440) % 1440;
    const year = st.year + Math.floor(dayIdx / 360);
    const month = Math.floor((dayIdx % 360) / 30) + 1, day = (dayIdx % 30) + 1;
    const hour = Math.floor(mod / 60);
    const eraY = year - st.eraStartYear + 1;
    const wa = `${st.era}${eraY === 1 ? '元' : eraY}年`;
    const ys = SIM.yearFmt === 'ad' ? `${year}年` : SIM.yearFmt === 'both' ? `${wa}（${year}年）` : wa;
    return `${ys} ${month}月${day}日 ${String(hour).padStart(2, '0')}:${String(Math.floor(mod % 60)).padStart(2, '0')}`;
  };
  // 明るさ（1＝昼、0＝夜）。5〜7時に明けて、17〜19時に暮れる
  SIM.daylight = function (min) {
    const h = ((((SGK.DATA.start.minute + min) % 1440) + 1440) % 1440) / 60;
    const s = (x) => Math.max(0, Math.min(1, x)), e = (x) => x * x * (3 - 2 * x);
    return e(s((h - 5) / 2)) * (1 - e(s((h - 17) / 2)));
  };
})();
