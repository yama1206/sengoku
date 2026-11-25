// 自分で操る舟と、沿岸を巡る海賊船。舟の種類と海賊の位置は世界と一緒に保存する。
(function () {
  const SIM = SGK.SIM;
  const BOATS = SIM.BOATS = new Map([
    ['rowboat', { name: '小舟', cost: 5000, speed: 45 }],
    ['sailboat', { name: '帆掛け舟', cost: 18000, speed: 70 }],
    ['fastboat', { name: '早舟', cost: 45000, speed: 100 }],
  ]);
  const additionalPorts = ['mikuni', 'ishinomaki', 'kanagawa_m', 'shinagawa'];
  const isBoatPort = (s) => SIM.KAIGAI.isPort(s) || !!(s && additionalPorts.includes(s.id));
  SIM.playerBoat = (p) => BOATS.get(p.boat);
  SIM.sailingSpeed = (p) => {
    const boat = SIM.playerBoat(p);
    return boat && !p.at && SIM.isSea(p.x, p.y) ? boat.speed : 0;
  };
  SIM.boatTradeIn = (p) => Math.floor((SIM.playerBoat(p)?.cost || 0) / 2);

  SIM.commands.buyBoat = (w, p, c) => {
    const boat = BOATS.get(c.id);
    if (!boat || p.tx != null || p.busy || p.battle || p.boat === c.id || !isBoatPort(SIM.settlement(w, p.at))) return;
    const cost = boat.cost - SIM.boatTradeIn(p);
    if (p.money < cost) return SIM.say(p.id, '舟を買うには' + SIM.money(cost) + '必要です');
    p.money -= cost;
    p.boat = c.id;
    SIM.say(p.id, boat.name + 'を手に入れました。地図で水面を指定すると舟で移動できます');
  };

  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid);
    if (!r || !r.here) return r;
    const p = w.players[pid];
    if (isBoatPort(SIM.settlement(w, p.at))) {
      r.here.port = r.here.port || {};
      r.me.boat = p.boat || null;
    }
    return r;
  };

  const isOcean = (x, y) => {
    const B = SGK.DATA.bounds, T = SGK.DATA.terrain;
    return x > 0 && y > 0 && x < B.w && y < B.h && SIM.isSea(x, y)
      && !(T.seas[0] && SIM.pointInPoly(x, y, T.seas[0]))
      && !(T.lakes || []).some((lake) => SIM.pointInPoly(x, y, lake.pts));
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function clearSea(a, b) {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
    for (let i = 0; i <= steps; i++) {
      if (!isOcean(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps)) return false;
    }
    return true;
  }

  function patrolPoints(port) {
    for (const radius of [14, 22, 32]) {
      for (let i = 0; i < 16; i++) {
        const angle = i * Math.PI / 8;
        const x = port.x + Math.cos(angle) * radius, y = port.y + Math.sin(angle) * radius;
        const a = { x: x - 3 * Math.sin(angle), y: y + 3 * Math.cos(angle) };
        const b = { x: x + 3 * Math.sin(angle), y: y - 3 * Math.cos(angle) };
        if (clearSea(a, b)) return [a, b];
      }
    }
    return null;
  }

  SIM.systems.push(function pirates(w, dt) {
    if (!w.piratesReady) {
      w.piratesReady = true;
      for (const id of ['hirado', 'hakata', 'bonotsu', 'usuki', 'sakai', 'mikuni', 'ishinomaki', 'kanagawa_m']) {
        const port = SIM.settlement(w, id);
        const patrol = port && patrolPoints(port);
        if (!patrol) continue;
        const n = SIM.spawnNpc(w, 'pirate', null, patrol[0]);
        Object.assign(n, { at: null, home: null, speed: 58, patrol, next: 1 });
      }
    }
    const sailors = Object.values(w.players).filter((p) => !p.off && !p.battle && !p.busy
      && SIM.sailingSpeed(p) && (p.pirateUntil || 0) <= w.time.min && isOcean(p.x, p.y));
    for (const n of Object.values(w.npcs)) {
      if (n.kind !== 'pirate') continue;
      let target = null, nearest = 7;
      for (const p of sailors) {
        const d = distance(n, p);
        if ((p.pirateUntil || 0) > w.time.min || d >= nearest || distance(n.patrol[0], p) > 18 || !clearSea(n, p)) continue;
        nearest = d;
        target = p;
      }
      const goal = target || n.patrol[n.next];
      if (!clearSea(n, goal)) n.next = 1 - n.next;
      else {
        if (n.tx !== goal.x || n.ty !== goal.y) { n.tx = goal.x; n.ty = goal.y; n.path = null; }
        if (SIM.moveEntity(n, dt) && !target) n.next = 1 - n.next;
      }
      if (target && distance(n, target) <= 0.6) {
        const loss = Math.min(1000, Math.floor(target.money * 0.1));
        target.money -= loss;
        target.pirateUntil = w.time.min + 1440;
        SIM.say(target.id, loss ? '海賊船に追いつかれ、' + SIM.money(loss) + 'を奪われました' : '海賊船に追いつかれました');
      }
    }
  });
})();
