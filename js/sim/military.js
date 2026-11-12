// 第3段階：募兵・部隊・野盗・リアルタイム戦闘・自動決着・結果の反映
(function () {
  const SIM = SGK.SIM, CFG = SGK.CFG;
  const rnd = (w) => SIM.rand(w);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // 兵の種類（数値はすべて仮）。hp/atk/def は兵1人あたり、spd は戦場での m/秒、range は m
  const TR = SIM.TROOPS = {
    hero: { name: '本人', hp: 50, atk: 6, def: 2, spd: 5, range: 2 },
    // tier：兵の格。up：昇格先（兵種ツリー）
    nohei: { name: '農兵', short: '農', tier: 1, hp: 8, atk: 1.4, def: 0, spd: 4, range: 2.5, cost: 150, wage: 6, up: ['yari', 'yumi'] },
    yari: { name: '足軽（槍）', short: '槍', tier: 2, hp: 10, atk: 2, def: 1, spd: 4, range: 2.5, cost: 300, wage: 10, up: ['nagayari', 'kiba'] },
    yumi: { name: '弓足軽', short: '弓', tier: 2, hp: 8, atk: 1.5, def: 0, spd: 4, range: 35, ranged: true, cost: 500, wage: 15, up: ['teppo'] },
    nagayari: { name: '長槍足軽', short: '長槍', tier: 3, hp: 12, atk: 2.6, def: 1.5, spd: 4, range: 3.5, cost: 700, wage: 18, up: ['yarigashira'] },
    kiba: { name: '騎馬武者', short: '騎', tier: 3, hp: 18, atk: 4, def: 2, spd: 9, range: 2.5, cav: true, cost: 1500, wage: 40, fame: 5, up: ['horo'] },
    teppo: { name: '鉄砲足軽', short: '鉄砲', tier: 3, hp: 8, atk: 3, def: 0, spd: 3.5, range: 40, ranged: true, cost: 1000, wage: 25, up: ['teppogashira'] },
    yarigashira: { name: '槍組頭', short: '組頭', tier: 4, hp: 15, atk: 3.4, def: 2.2, spd: 4.2, range: 3.5, cost: 1200, wage: 30 },
    teppogashira: { name: '鉄砲頭', short: '鉄砲頭', tier: 4, hp: 10, atk: 4, def: 0.5, spd: 3.5, range: 45, ranged: true, cost: 1800, wage: 40 },
    horo: { name: '母衣衆', short: '母衣', tier: 4, hp: 24, atk: 5, def: 3, spd: 10, range: 2.5, cav: true, cost: 3000, wage: 70, fame: 15 },
    bandit: { name: '野盗', hp: 10, atk: 2.0, def: 0, spd: 4.5, range: 2.5 },
    banditBow: { name: '野盗（弓）', hp: 7, atk: 1.4, def: 0, spd: 4.5, range: 30, ranged: true },
  };
  SIM.HIRE = ['nohei', 'yari', 'yumi', 'kiba'];
  // 拠点ごとに雇える兵（1日の補充数・上限）
  const POOL = {
    village: { nohei: [2, 12] },
    town: { nohei: [1, 8], yari: [1, 8], yumi: [0.5, 6] },
    castle: { yari: [1, 10], yumi: [0.5, 6], kiba: [0.25, 3] },
  };
  const FIELD = { w: 300, h: 200 };
  const MAX_BANDITS = 14; // 地図の広さに合わせて

  SIM.troopCount = (tr) => Object.values(tr || {}).reduce((a, b) => a + b, 0);
  SIM.troopCap = (p) => Math.min(120, 10 + p.fame * 3);
  SIM.wage = (tr) => Object.entries(tr || {}).reduce((a, [k, n]) => a + (TR[k].wage || 0) * n, 0);
  // 成長要素（growth.js）が上書きする差し込み口
  SIM.unitMods = () => ({ am: 1, da: 0, ra: 0, hm: 1 });
  SIM.surviveRate = () => 0.1;
  SIM.costMod = () => 1;
  SIM.speedBonus = () => 0;
  SIM.autoBonus = () => 1;
  SIM.onBattleEnd = () => {};
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
    for (const b of Object.values(w.battles)) { b.ter = b.ter || []; b.lk = b.lk || { A: null, B: null }; for (const u of b.units) { if (u.f == null) u.f = u.side === 'A' ? 0 : Math.PI; if (u.mor == null) u.mor = u.mo = 65; if (u.n0 == null) u.n0 = u.n; } }
    if (!Object.values(w.npcs).some((n) => n.kind === 'bandit')) for (let i = 0; i < 10; i++) spawnBandit(w);
    for (const n of Object.values(w.npcs)) if (n.kind === 'patrol' && !n.army) { // 巡回兵の手勢
      n.army = { yari: 8 + Math.floor(rnd(w) * 8), yumi: 2 + Math.floor(rnd(w) * 5) }; n.size = SIM.troopCount(n.army);
    }
    return w;
  };

  // ---- 野盗 ----
  function spawnBandit(w) {
    const B = SGK.DATA.bounds;
    for (let i = 0; i < 40; i++) {
      const x = 3 + rnd(w) * (B.w - 6), y = 3 + rnd(w) * (B.h - 6);
      if (SIM.isSea(x, y) || w.settlements.some((s) => Math.hypot(s.x - x, s.y - y) < 4)) continue;
      const id = 'n' + w.nextId++;
      // 日が経つほど大きな野盗団が出る。ときどき大勢の野盗団も
      const extra = Math.min(14, Math.floor(w.time.min / 1440 / 15)), big = rnd(w) < 0.25 ? 1.6 : 1;
      const army = { bandit: Math.round((7 + Math.floor(rnd(w) * 12) + extra) * big) };
      const bows = Math.round((Math.floor(rnd(w) * 7) + extra / 3) * big); if (bows) army.banditBow = bows;
      w.npcs[id] = { id, kind: 'bandit', faction: null, x, y, tx: null, ty: null, hx: x, hy: y, wait: 0, speed: 28,
        army, size: SIM.troopCount(army), loot: Math.round((300 + rnd(w) * 1200) / 10) * 10, calm: 0, battle: null };
      return;
    }
  }
  function moveTo(e, dtMin) {
    if (e.tx == null) return false;
    const dx = e.tx - e.x, dy = e.ty - e.y, d = Math.hypot(dx, dy), step = (e.speed / 1440) * dtMin * SIM.speedAt(e.x, e.y);
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

  // ---- 兵種の区分・視界・地形（数値はすべて仮・ここで調整） ----
  const CLS = { nohei: 'spear', yari: 'spear', nagayari: 'spear', yarigashira: 'spear', bandit: 'spear',
    yumi: 'bow', teppo: 'bow', teppogashira: 'bow', banditBow: 'bow', kiba: 'cav', horo: 'cav' };
  for (const k in CLS) TR[k].cls = CLS[k];
  SIM.CLS_NAME = { spear: '槍', cav: '騎馬', bow: '弓' };
  const VIS = { base: 50, cav: 65, hero: 60, hill: 30, forestHide: 22, reveal: 2 }; // 視界（m）。林の中の敵は22mまで近づかないと見えない。撃つと2秒見える
  const ROUT = 15; // 士気がこれ以下で潰走
  SIM.moraleBase = SIM.moraleBase || (() => 65);

  function genTerrain(w) {
    const ter = [], nf = 4 + Math.floor(rnd(w) * 4), nh = 2 + Math.floor(rnd(w) * 2);
    for (let i = 0; i < nf + nh; i++) {
      const hill = i >= nf;
      ter.push({ k: hill ? 'h' : 'f', x: Math.round(55 + rnd(w) * (FIELD.w - 110)), y: Math.round(15 + rnd(w) * (FIELD.h - 30)), r: Math.round(hill ? 22 + rnd(w) * 14 : 11 + rnd(w) * 15) });
    }
    return ter;
  }
  function terAt(b, u) {
    const o = { f: false, h: false };
    for (const t of b.ter || []) if (Math.hypot(u.x - t.x, u.y - t.y) < t.r) o[t.k] = true;
    return o;
  }
  function visRange(b, u) {
    const t = terAt(b, u), T = TR[u.type];
    let r = T.cav ? VIS.cav : u.type === 'hero' ? VIS.hero : VIS.base;
    if (t.h) r += VIS.hill; if (t.f) r *= 0.7;
    return r;
  }
  function visibleTo(b, side, us) {
    const own = us.filter((u) => u.side === side), set = new Set();
    for (const e of us) {
      if (e.side === side) continue;
      if (b.t - (e.shot || -99) < VIS.reveal) { set.add(e); continue; }
      const hide = terAt(b, e).f;
      for (const o of own) { const vr = visRange(b, o); if (dist(o, e) < (hide ? Math.min(VIS.forestHide, vr) : vr) + rad(e)) { set.add(e); break; } }
    }
    return set;
  }
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
  function turnTo(u, a, rate) { let d = a - u.f; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; u.f += Math.max(-rate, Math.min(rate, d)); }

  // ---- 戦闘の開始 ----
  function addUnits(w, b, side, owner, army) {
    const list = Object.entries(army).filter(([, n]) => n > 0);
    const fx = side === 'A' ? 1 : -1, base = side === 'A' ? 28 : FIELD.w - 28;
    const mo = owner ? SIM.moraleBase(w, owner) : 55;
    list.forEach(([type, n], i) => {
      const t = TR[type], m = owner ? SIM.unitMods(w, owner, type) : { am: 1, da: 0, ra: 0, hm: 1 };
      b.units.push({ id: b.next++, side, owner, type, n, n0: n, hp: n * t.hp * m.hm, mh: t.hp * m.hm, am: m.am, da: m.da, ra: m.ra,
        x: base - fx * (t.ranged ? 8 : type === 'hero' ? 4 : 0), y: FIELD.h / 2 + (i - (list.length - 1) / 2) * 14 + (side === 'A' ? (b.pids.length - 1) * 6 : 0),
        f: side === 'A' ? 0 : Math.PI, mor: type === 'hero' ? 100 : mo, mo, order: side === 'A' ? 'hold' : !t.ranged && i % 2 ? 'flank' : 'charge' }); // 敵の近接は半分が回り込む
    });
  }
  function startBattle(w, n, p) {
    const id = 'b' + w.nextId++;
    const b = w.battles[id] = { id, npc: n.id, foe: '野盗', foeN: n.size, loot: n.loot, pids: [], units: [], next: 1, t: 0, start: {}, routed: false, hd: {}, rd: {},
      ter: genTerrain(w), lk: { A: null, B: { x: 28, y: FIELD.h / 2 } }, visA: [] };
    n.battle = id; n.tx = n.ty = null;
    const joiners = Object.values(w.players).filter((q) => q === p || (inField(q) && dist(q, n) < 1.5));
    for (const q of joiners) {
      b.pids.push(q.id); q.battle = id; q.tx = q.ty = null; q.dest = null; b.start[q.id] = Object.assign({}, q.troops);
      addUnits(w, b, 'A', q.id, Object.assign({ hero: 1 }, q.troops));
      SIM.say(q.id, `野盗${n.size}人に襲われました！ 敵の姿はまだ見えません。偵察に出すか、待ち構えるか…`);
    }
    addUnits(w, b, 'B', null, n.army);
  }

  // ---- 戦闘の計算（ホストで毎tick） ----
  const rad = (u) => 0.6 + Math.sqrt(u.n) * 0.7;
  const alive = (u) => u.hp > 0 && !u.gone;
  const unitName = (u) => (u.type === 'hero' ? '本人' : TR[u.type].name);
  function stepBattle(w, b, dt) {
    b.t += dt;
    const us = b.units.filter(alive), dmg = new Map(), hit = new Map();
    const vis = { A: visibleTo(b, 'A', us), B: visibleTo(b, 'B', us) };
    b.visA = [...vis.A].map((u) => u.id);
    for (const s of ['A', 'B']) if (vis[s].size) { const a = [...vis[s]]; b.lk[s] = { x: a.reduce((q, u) => q + u.x, 0) / a.length, y: a.reduce((q, u) => q + u.y, 0) / a.length }; }
    const goTo = (u, x, y, spd) => { const d = Math.hypot(x - u.x, y - u.y); if (d < 0.3) return true; const s = Math.min(spd * dt, d); u.x += ((x - u.x) / d) * s; u.y += ((y - u.y) / d) * s; u.f = Math.atan2(y - u.y, x - u.x); return false; };
    for (const u of us) {
      const t = TR[u.type], tu = terAt(b, u);
      const spd = t.spd * (t.cav && tu.f ? 0.5 : 1) * (tu.h ? 0.85 : 1);
      if (u.order === 'retreat' || u.order === 'rout') {
        const ex = u.side === 'A' ? -4 : FIELD.w + 4; u.x += Math.sign(ex - u.x) * spd * (u.order === 'rout' ? 1.1 : 1) * dt; u.f = u.side === 'A' ? Math.PI : 0;
        if ((u.side === 'A' && u.x < 1) || (u.side === 'B' && u.x > FIELD.w - 1)) u.gone = true;
        continue;
      }
      let e = null, ed = Infinity;
      for (const v of vis[u.side]) if (alive(v)) { const d = dist(u, v); if (d < ed) { ed = d; e = v; } }
      const reach = e ? rad(u) + rad(e) + t.range + (u.ra || 0) + (t.ranged && tu.h ? 5 : 0) : 0;
      if (!e || ed > reach) {
        if (u.order === 'move') { if (goTo(u, u.mx, u.my, spd)) u.order = 'hold'; }
        else if (u.order === 'charge' || u.order === 'flank') {
          if (e && u.order === 'flank' && angDiff(e.f, Math.atan2(u.y - e.y, u.x - e.x)) < 1.2) {
            // 回り込み：敵の向きに対して横～後ろの点を目指す
            const sgn = Math.sin(Math.atan2(u.y - e.y, u.x - e.x) - e.f) >= 0 ? 1 : -1, a = e.f + sgn * Math.PI * 0.6, R2 = rad(e) + 16;
            goTo(u, Math.max(2, Math.min(FIELD.w - 2, e.x + Math.cos(a) * R2)), Math.max(2, Math.min(FIELD.h - 2, e.y + Math.sin(a) * R2)), spd);
          } else if (e) goTo(u, e.x + ((u.x - e.x) / ed) * (reach - 0.3), e.y + ((u.y - e.y) / ed) * (reach - 0.3), spd);
          else { // 見えない：最後に見た場所、なければ敵陣の方へ進む
            const lk = b.lk[u.side];
            if (lk) { if (goTo(u, lk.x, lk.y, spd * 0.8) || Math.hypot(lk.x - u.x, lk.y - u.y) < 6) b.lk[u.side] = null; }
            else goTo(u, u.side === 'A' ? FIELD.w - 10 : 10, u.y, spd * 0.8);
          }
        }
        continue;
      }
      // 攻撃
      turnTo(u, Math.atan2(e.y - u.y, e.x - u.x), (t.cav ? 1.6 : 0.9) * dt);
      const te = terAt(b, e), T2 = TR[e.type];
      const per = Math.max(0.25, t.atk * (u.am || 1) - (T2.def + (e.da || 0)) * 0.5);
      let mul = 1;
      const dirA = angDiff(e.f, Math.atan2(u.y - e.y, u.x - e.x)), dir = dirA < Math.PI / 3 ? 'front' : dirA < (Math.PI * 2) / 3 ? 'side' : 'rear';
      if (!t.ranged) { if (dir === 'side') mul *= t.cav ? 1.4 : 1.25; if (dir === 'rear') mul *= t.cav ? 1.8 : 1.5; } else if (dir !== 'front') mul *= 1.15;
      if (t.cav && T2.cls === 'spear' && dir === 'front') mul *= 0.7; // 槍衾への正面突撃
      const melee = ed < rad(u) + rad(e) + 3.5;
      if (t.ranged && melee) mul *= 0.45; // 弓・鉄砲は接近戦に弱い
      if (t.ranged && te.f) mul *= 0.6; // 林の中の敵は射ちにくい
      if (t.cav && tu.f) mul *= 0.7;
      if (tu.h && !te.h) mul *= 1.15; // 高所から
      mul *= 0.55 + (0.45 * u.mor) / 100; // 士気
      const d = (t.ranged && !melee ? u.n * per * dt * 0.35 * (1 - ed / (reach * 1.6)) : Math.min(u.n, e.n * 2 + 3) * per * dt * 0.5) * mul;
      dmg.set(e, (dmg.get(e) || 0) + d);
      if (dir !== 'front') hit.set(e, Math.max(hit.get(e) || 0, dir === 'rear' ? 2 : 1));
      if (t.ranged) u.shot = b.t;
      if (u.owner) { const key = u.type === 'hero' ? 'hd' : t.ranged ? 'rd' : null; if (key) { b[key] = b[key] || {}; b[key][u.owner] = (b[key][u.owner] || 0) + d; } }
    }
    // 味方同士が重ならないように押し合う
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], c = us[j]; if (a.side !== c.side) continue;
      const d = dist(a, c) || 0.01, m = rad(a) + rad(c);
      if (d < m) { const k = (m - d) / 2 / d; a.x -= (c.x - a.x) * k; a.y -= (c.y - a.y) * k; c.x += (c.x - a.x) * k; c.y += (c.y - a.y) * k; }
    }
    for (const u of us) { u.y = Math.max(2, Math.min(FIELD.h - 2, u.y)); if (u.order !== 'retreat' && u.order !== 'rout') u.x = Math.max(2, Math.min(FIELD.w - 2, u.x)); }
    for (const [u, d] of dmg) {
      const before = u.n;
      u.hp = Math.max(0, u.hp - d); u.n = Math.ceil(u.hp / (u.mh || TR[u.type].hp) - 1e-6);
      if (u.type === 'hero') { if (u.hp <= 0 && u.owner) for (const v of us) if (v.owner === u.owner && v !== u) v.mor -= 25; continue; }
      u.mor -= ((before - u.n) / (u.n0 || 1)) * 110 + (hit.get(u) || 0) * 3 * dt; // 損害と側面・背後からの攻撃で士気が下がる
    }
    // 士気の回復と潰走
    for (const u of us) {
      if (u.type === 'hero' || !alive(u) || u.order === 'rout') continue;
      if (!dmg.has(u)) { const hero = us.some((h) => h.type === 'hero' && h.side === u.side && alive(h) && dist(h, u) < 40); u.mor = Math.min(u.mo, u.mor + dt * (hero ? 2 : 1)); }
      if (u.mor <= ROUT) {
        u.order = 'rout';
        for (const v of us) if (v.side === u.side && v !== u && v.type !== 'hero' && dist(u, v) < 40) v.mor -= 10;
        if (u.owner) SIM.say(u.owner, `${unitName(u)}が崩れて逃げ出しました！`);
        else b.pids.forEach((pid) => SIM.say(pid, `敵の${unitName(u)}が崩れました！`));
      }
    }
    // 野盗は数が減ると逃げ出す
    const bn = b.units.filter((u) => u.side === 'B' && alive(u)).reduce((a, u) => a + u.n, 0);
    if (!b.routed && bn < b.foeN * 0.2) { b.routed = true; b.units.forEach((u) => { if (u.side === 'B') u.order = 'rout'; }); b.pids.forEach((pid) => SIM.say(pid, '野盗が逃げ出しました！')); }
    const aLive = b.units.some((u) => u.side === 'A' && alive(u)), bLive = b.units.some((u) => u.side === 'B' && alive(u));
    const bFight = b.units.some((u) => u.side === 'B' && alive(u) && u.order !== 'rout');
    if (!bLive || (!bFight && b.routed)) finish(w, b, 'win');
    else if (!aLive) finish(w, b, b.units.some((u) => u.side === 'A' && u.gone && u.hp > 0) ? 'escape' : 'lose');
    else if (b.t > 420) autoResolve(w, b); // 長引いたら自動で決着
  }

  function autoResolve(w, b) {
    const pw = (side) => b.units.filter((u) => u.side === side && alive(u)).reduce((a, u) => a + u.hp * TR[u.type].atk, 0);
    const rA = pw('A') * SIM.autoBonus(w, b) * (0.75 + rnd(w) * 0.5), rB = pw('B') * (0.75 + rnd(w) * 0.5);
    const win = rA >= rB, loss = Math.min(0.9, (win ? rB / rA : rA / rB) * 0.6);
    for (const u of b.units) {
      if (!alive(u)) continue;
      const winner = (u.side === 'A') === win;
      u.hp = winner ? u.hp * Math.max(0, 1 - loss * (0.6 + rnd(w) * 0.8)) : u.side === 'A' ? u.hp * 0.2 : 0; // 負けても一部は逃げ延びる
      u.n = Math.ceil(u.hp / (u.mh || TR[u.type].hp) - 1e-6);
    }
    finish(w, b, win ? 'win' : 'lose');
  }

  // ---- 結果の反映 ----
  function surviving(w, b, pid) {
    const tr = {}, st = b.start[pid] || {}, sr = SIM.surviveRate(w, pid);
    for (const u of b.units) if (u.owner === pid && u.type !== 'hero' && u.hp > 0) tr[u.type] = (tr[u.type] || 0) + u.n;
    for (const k in st) { const back = Math.floor(Math.max(0, st[k] - (tr[k] || 0)) * sr); if (back) tr[k] = (tr[k] || 0) + back; } // 手当てで助かった兵
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
      const after = surviving(w, b, pid), lt = lossText(b.start[pid] || {}, after);
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
      SIM.onBattleEnd(w, b, p, res, after);
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
      const wage = SIM.wage(p.troops, p); if (!wage) continue;
      if (p.money >= wage) { p.money -= wage; continue; }
      let left = 0;
      for (const k in p.troops) { const go = Math.ceil(p.troops[k] * 0.2); p.troops[k] -= go; left += go; if (p.troops[k] <= 0) delete p.troops[k]; }
      SIM.say(p.id, `給金が払えず、兵${left}人が去りました`);
    }
    if (Object.values(w.npcs).filter((n) => n.kind === 'bandit').length < MAX_BANDITS && rnd(w) < 0.6) spawnBandit(w);
  }

  SIM.systems.push(
    function militaryDay(w) { const d = Math.floor(w.time.min / 1440); while (w.mday < d) { w.mday++; daily(w); } },
    function partySpeed(w) { for (const p of Object.values(w.players)) p.speed = CFG.WALK_KM_PER_DAY - (SIM.troopCount(p.troops) ? 4 : 0) + SIM.speedBonus(p); },
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
      const cost = Math.round(t.cost * SIM.costMod(p));
      const q = Math.min(Math.max(1, +c.qty || 1), Math.floor(s.pool[c.kind] || 0), SIM.troopCap(p) - SIM.troopCount(p.troops), Math.floor(p.money / cost));
      if (q <= 0) return SIM.say(p.id, (s.pool[c.kind] || 0) < 1 ? 'いま雇える者がいません' : SIM.troopCount(p.troops) >= SIM.troopCap(p) ? 'これ以上は率いられません（名声を上げると増えます）' : 'お金が足りません');
      p.money -= q * cost; s.pool[c.kind] -= q; p.troops[c.kind] = (p.troops[c.kind] || 0) + q;
      SIM.say(p.id, `${t.name}を${q}人雇いました（${SIM.money(q * cost)}）`);
    },
    dismiss(w, p, c) {
      if (p.battle || !p.troops[c.kind]) return;
      const q = Math.min(Math.max(1, +c.qty || 1), p.troops[c.kind]);
      p.troops[c.kind] -= q; if (!p.troops[c.kind]) delete p.troops[c.kind];
      SIM.say(p.id, `${TR[c.kind].name}を${q}人解き放ちました`);
    },
    order(w, p, c) {
      const b = w.battles[p.battle]; if (!b || !['charge', 'hold', 'retreat', 'flank', 'move'].includes(c.order)) return;
      for (const u of b.units) if (u.owner === p.id && u.order !== 'rout' && (c.unit === 'all' || u.id === +c.unit)) {
        u.order = c.order;
        if (c.order === 'move') { u.mx = Math.max(2, Math.min(FIELD.w - 2, +c.x || 0)); u.my = Math.max(2, Math.min(FIELD.h - 2, +c.y || 0)); }
      }
    },
    battleAuto(w, p) { const b = w.battles[p.battle]; if (b) autoResolve(w, b); },
    battleFlee(w, p) {
      const b = w.battles[p.battle]; if (!b) return;
      const before = b.start[p.id] || {}, tr = surviving(w, b, p.id);
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
    Object.assign(r.me, { troops: p.troops, troopCap: SIM.troopCap(p), wage: SIM.wage(p.troops, p), costMod: SIM.costMod(p) });
    if (r.here) { const s = SIM.settlement(w, r.here.id); r.here.recruit = Object.keys(POOL[s.type]).map((k) => [k, Math.floor(s.pool[k] || 0)]); }
    const b = p.battle && w.battles[p.battle];
    r.battle = b ? { id: b.id, foe: b.foe, t: Math.floor(b.t), routed: b.routed,
      names: Object.fromEntries(b.pids.map((x) => [x, (w.players[x] || {}).name])),
      ter: b.ter || [], units: b.units.filter((u) => alive(u) && (u.side === 'A' || (b.visA || []).includes(u.id)))
        .map((u) => [u.id, u.side, u.owner, u.type, u.n, r1(u.x), r1(u.y), u.order, Math.round(visRange(b, u)), Math.round(u.mor), r1(u.f)]) } : null;
    return r;
  };
  SIM.FIELD = FIELD;
})();
