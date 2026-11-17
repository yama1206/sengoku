// 2.12.0 攻城戦の城の形を、城の種類（平城・山城・水城）と改築の段階から作る（パーツは nawa.js の形式）
//  平城：四角い本丸を堀が囲む。枡形の大手門。段階が進むと二の丸・三の丸・総構え
//  山城：山の尾根に、高さの違う曲輪が段々に並ぶ。まわりは急な斜面（切岸）で、登れるのは細い道。曲輪の間は堀切
//  水城：水に囲まれた島の城。陸からは細い土橋が1本だけ
//  形は城ごとに少しずつ変える（城の id から決まる）。攻め手は左（-x）から来る形で作り、守る側が左の時は左右を入れ替える
(function () {
  const SIM = SGK.SIM, PI = Math.PI;
  SIM.GATE_HP.m = 600; SIM.GATE_NAME.m = '枡形の門';
  const KAI_TEXT = ['', '柵の外に空堀', '土塁と水堀・枡形の門（山城は堀切）', '石垣と櫓・二の丸', '天守と三の丸', '外まわりに総構え'];
  SIM.kaiMapText = (lv) => (KAI_TEXT[lv] ? `攻城マップ：${KAI_TEXT[lv]}` : '');
  const seedOf = (s) => { let h = 7; for (const c of String((s && s.id) || 'x')) h = (h * 31 + c.charCodeAt(0)) % 233280; return h; };
  const rngOf = (sd) => { let q = (sd * 9301 + 49297) % 233280 || 1; return () => { q = (q * 9301 + 49297) % 233280; return q / 233280; }; };
  const wst = (lv) => (lv <= 1 ? 'k' : lv === 2 ? 'd' : 'i'); // 塀の造り：柵 → 土塁に土塀 → 石垣に土塀

  // ---- 部品を並べる道具（攻め手は -x から来る） ----
  function Kit() {
    const k = { A: [], W: [], G: [], T: [], E: [], K: [], n: 1, encl: [] };
    k.box = (x, y, hx, hy) => [x - hx, y - hy, x + hx, y - hy, x + hx, y + hy, x - hx, y + hy];
    k.area = (code, sh) => k.A.push([code, sh]);
    k.rectWalls = (x, y, hx, hy, st) => { const p = k.box(x, y, hx, hy); for (let i = 0; i < 4; i++) k.W.push(['l', p[i * 2], p[i * 2 + 1], p[((i + 1) % 4) * 2], p[((i + 1) % 4) * 2 + 1], st]); };
    k.moat = (code, x, y, hx, hy, w) => k.area(code, ['P', k.box(x, y, hx + w, hy + w), k.box(x, y, hx, hy)]);
    // 門：side W/E/N/S の面、off＝面に沿ったずれ。返り値は門の真ん中と外向き
    k.gate = (x, y, hx, hy, side, off, w, suf) => {
      const S = { W: [x - hx, y + off, PI], E: [x + hx, y + off, 0], N: [x + off, y - hy, -PI / 2], S: [x + off, y + hy, PI / 2] }[side];
      const id = `${k.n++}${suf}`; k.G.push([S[0], S[1], S[2], w, id]); return { x: S[0], y: S[1], a: S[2], id, w };
    };
    // 土橋：門の外へ、堀をまたいで
    k.bridge = (g, len, w) => { const ux = Math.cos(g.a), uy = Math.sin(g.a), vx = -uy, vy = ux, hw = (w || g.w + 2) / 2; k.area('b', ['p', g.x - vx * hw, g.y - vy * hw, g.x + vx * hw, g.y + vy * hw, g.x + vx * hw + ux * len, g.y + vy * hw + uy * len, g.x - vx * hw + ux * len, g.y - vy * hw + uy * len]); };
    // 枡形：門の内側に四角い小さな囲み。中の門は横にあって、攻め手は曲がらないと入れない
    k.masugata = (g, st, sz) => {
      const ux = -Math.cos(g.a), uy = -Math.sin(g.a), vx = -uy, vy = ux, d = sz || 13, h = d / 2 + 1; // u＝内向き
      const P = (a, b) => [g.x + ux * a + vx * b, g.y + uy * a + vy * b];
      const c1 = P(0, -h), c2 = P(d, -h), c3 = P(d, h), c4 = P(0, h);
      k.W.push(['l', ...c1, ...c2, st], ['l', ...c2, ...c3, st], ['l', ...c3, ...c4, st]);
      const gi = P(d * 0.62, h), id = `${k.n++}m`; k.G.push([gi[0], gi[1], Math.atan2(vy, vx), 5.5, id]);
      k.T.push(['y', ...P(d * 0.5, 0), g.a]); // 枡形の上の櫓門（見た目）
    };
    k.corners = (x, y, hx, hy) => { for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) k.T.push(['y', x + sx * (hx - 2.5), y + sy * (hy - 2.5), 0]); };
    k.encl1 = (x, y, hx, hy, w) => { k.K.push(['p', ...k.box(x, y, hx, hy)]); k.encl.push({ x, y, hx, hy, w }); };
    k.road = (pts, w) => { for (let i = 0; i < pts.length - 1; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], l = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / l * w / 2, ny = (x2 - x1) / l * w / 2, ex = (x2 - x1) / l * w / 2, ey = (y2 - y1) / l * w / 2; k.area('r', ['p', x1 - nx - ex, y1 - ny - ey, x2 - nx + ex, y2 - ny + ey, x2 + nx + ex, y2 + ny + ey, x1 + nx - ex, y1 + ny - ey]); } };
    return k;
  }

  // ---- 平城 ----
  function genHira(lv, r) {
    const k = Kit(), st = wst(lv), hx = 30 + r() * 7, hy = 26 + r() * 8, mw = lv >= 2 ? 13 + r() * 4 : 8, gy = (r() - 0.5) * hy * 0.6;
    k.area('k', ['p', ...k.box(0, 0, hx, hy)]);
    if (lv >= 1) k.moat(lv >= 2 ? 'm' : 'd', 0, 0, hx + 4, hy + 4, mw);
    k.rectWalls(0, 0, hx, hy, st);
    const go = k.gate(0, 0, hx, hy, 'W', gy, 7, lv >= 3 ? 'h' : 'o'), side = r() < 0.5 ? 'N' : 'S', gk = k.gate(0, 0, hx, hy, side, hx * (0.2 + r() * 0.4), 6, 'k');
    if (lv >= 1) { k.bridge(go, mw + 6); k.bridge(gk, mw + 6); }
    if (lv >= 2) k.masugata(go, st);
    k.encl1(0, 0, hx, hy, 0.5);
    if (lv >= 3) { // 二の丸（攻め口の側）
      k.corners(0, 0, hx, hy);
      const off = hx + 4 + mw, nx2 = -(off + 30 + r() * 6), nhx = 26 + r() * 5, nhy = hy + 10 + r() * 8, bx = nx2 - nhx;
      k.area('d', ['P', k.box(nx2, 0, nhx + 9, nhy + 9), k.box(nx2, 0, nhx, nhy)]);
      k.area('k', ['p', ...k.box(nx2, 0, nhx, nhy)]);
      k.area('l', ['p', nx2 + nhx, gy - 8, -off + 1, gy - 8, -off + 1, gy + 8, nx2 + nhx, gy + 8]); // 二の丸から本丸の土橋までの地面
      k.bridge(go, mw + 6);
      k.rectWalls(nx2, 0, nhx, nhy, st);
      const g2 = k.gate(nx2, 0, nhx, nhy, 'W', (r() - 0.5) * nhy * 0.8, 7, 'o'); k.bridge(g2, 10);
      k.masugata(g2, st, 12);
      k.gate(nx2, 0, nhx, nhy, 'E', gy, 6, 's');
      k.corners(nx2, 0, nhx, nhy); k.encl1(nx2, 0, nhx, nhy, 0.3);
      void bx;
    }
    if (lv >= 4) { // 天守と三の丸（左右）
      k.T.push(['T', hx * 0.35, -hy * 0.3 * (side === 'N' ? -1 : 1), 0]);
      for (const sg of [-1, 1]) {
        const tx = -hx * 0.3, ty = sg * (hy + mw + 40 + r() * 8), thx = 22 + r() * 6, thy = 18 + r() * 4;
        k.area('d', ['P', k.box(tx, ty, thx + 7, thy + 7), k.box(tx, ty, thx, thy)]); k.area('k', ['p', ...k.box(tx, ty, thx, thy)]);
        k.rectWalls(tx, ty, thx, thy, st); const g3 = k.gate(tx, ty, thx, thy, 'W', 0, 6, 's'); k.bridge(g3, 8); k.encl1(tx, ty, thx, thy, 0.1);
      }
    }
    if (lv >= 5) { // 総構え：外まわりの土塁と空堀
      const ox = -60, ohx = 175, ohy = 165;
      k.A.unshift(['d', ['P', k.box(ox, 0, ohx + 10, ohy + 10), k.box(ox, 0, ohx, ohy)]]);
      k.rectWalls(ox, 0, ohx, ohy, 'd');
      for (const off of [-70, 70]) { const g = k.gate(ox, 0, ohx, ohy, 'W', off, 8, 's'); k.bridge(g, 12); }
    }
    return k;
  }

  // ---- 山城 ----
  function genYama(lv, r) {
    const k = Kit(), top = 52 + r() * 12, lean = (r() - 0.5) * 30;
    k.E.push(['m', 25, lean * 0.3, 185 + r() * 20, top + 6]);
    const st = lv >= 3 ? 'i' : lv === 2 ? 'd' : 'k', st2 = lv >= 2 ? 'd' : 'k';
    // 本丸（いちばん上）・二の丸（尾根を下った所）・三の丸
    const C = [{ x: 30, y: lean * 0.25, hx: 24 + r() * 5, hy: 17 + r() * 4, h: top }, { x: -22, y: lean * 0.5, hx: 20 + r() * 4, hy: 15 + r() * 4, h: top - 10 - r() * 3 }];
    if (lv >= 3) C.push({ x: -68, y: lean * 0.8, hx: 18 + r() * 4, hy: 16 + r() * 4, h: top - 21 - r() * 3 });
    k.area('s', ['o', 25, lean * 0.3, 150]); // 山の斜面（遅い）
    C.forEach((c, i) => { k.E.push(['f', ['p', ...k.box(c.x, c.y, c.hx + 2, c.hy + 2)], c.h, 9]); });
    if (lv >= 4) for (const sg of [-1, 1]) { const c = { x: -22, y: lean * 0.5 + sg * (C[1].hy + 16), hx: 16, hy: 7, h: C[1].h - 7 }; k.E.push(['f', ['p', ...k.box(c.x, c.y, c.hx + 1, c.hy + 1)], c.h, 7]); C.push(Object.assign(c, { koshi: 1 })); } // 腰曲輪
    // 道：ふもとから一番下の曲輪の門まで、つづら折り
    const low = C.filter((c) => !c.koshi).slice(-1)[0], gx = low.x - low.hx, gyy = low.y, foot = -175, zz = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; zz.push([foot + (gx - 4 - foot) * t, gyy + (i % 2 ? 1 : -1) * (i === 5 ? 0 : 28 * (1 - t * 0.6))]); }
    k.road(zz, 6);
    // 搦手道（うしろの谷から本丸へ。細い）
    k.road([[C[0].x + 10, C[0].y + C[0].hy + 70], [C[0].x + 6, C[0].y + C[0].hy + 30], [C[0].x + 2, C[0].y + C[0].hy + 2]], 4);
    C.forEach((c, i) => {
      k.area('k', ['p', ...k.box(c.x, c.y, c.hx, c.hy)]);
      if (c.koshi) { k.W.push(['l', c.x - c.hx, c.y + (c.y > C[1].y ? c.hy : -c.hy), c.x + c.hx, c.y + (c.y > C[1].y ? c.hy : -c.hy), 'k']); return; }
      k.rectWalls(c.x, c.y, c.hx, c.hy, i === 0 ? st : st2);
    });
    // 門：一番下の曲輪の正面（大手）、曲輪どうしの間（堀切を土橋で渡る）、本丸のうしろ（搦手）
    const enc = C.filter((c) => !c.koshi);
    enc.forEach((c, i) => {
      const nx = enc[i + 1];
      if (i === enc.length - 1) { const g = k.gate(c.x, c.y, c.hx, c.hy, 'W', 0, 6, 'o'); if (lv >= 2) k.masugata(g, i === 0 ? st : st2, 11); }
      if (nx) { // c と、その下の nx の間
        const g = k.gate(c.x, c.y, c.hx, c.hy, 'W', (r() - 0.5) * c.hy * 0.6, 5.5, i === 0 ? 'h' : 's'), gap = (c.x - c.hx) - (nx.x + nx.hx);
        k.gate(nx.x, nx.y, nx.hx, nx.hy, 'E', g.y - nx.y, 5.5, 's');
        if (lv >= 1) { const mx = nx.x + nx.hx + gap / 2; k.area('d', ['p', mx - gap * 0.3, c.y - 60, mx + gap * 0.3, c.y - 60, mx + gap * 0.3, c.y + 60, mx - gap * 0.3, c.y + 60]); } // 堀切
        k.area('b', ['p', nx.x + nx.hx - 1, g.y - 3.5, c.x - c.hx + 1, g.y - 3.5, c.x - c.hx + 1, g.y + 3.5, nx.x + nx.hx - 1, g.y + 3.5]);
        k.E.push(['f', ['p', nx.x + nx.hx, g.y - 3, c.x - c.hx, g.y - 3, c.x - c.hx, g.y + 3, nx.x + nx.hx, g.y + 3], (c.h + nx.h) / 2, 3]); // 曲輪の間の坂（土橋）
      }
    });
    k.gate(C[0].x, C[0].y, C[0].hx, C[0].hy, 'S', -C[0].hx * 0.2, 5, 'k');
    if (lv >= 2) { const c = C[0]; k.area('d', ['P', k.box(c.x, c.y, c.hx + 9, c.hy + 9), k.box(c.x, c.y, c.hx + 3, c.hy + 3)]); k.area('b', ['p', c.x - c.hx * 0.2 - 3, c.y + c.hy, c.x - c.hx * 0.2 + 3, c.y + c.hy, c.x - c.hx * 0.2 + 3, c.y + c.hy + 10, c.x - c.hx * 0.2 - 3, c.y + c.hy + 10]); } // 本丸のまわりの空堀
    if (lv >= 3) k.corners(C[0].x, C[0].y, C[0].hx, C[0].hy);
    if (lv >= 4) k.T.push(['T', C[0].x + C[0].hx * 0.35, C[0].y, 0]);
    enc.forEach((c, i) => k.encl1(c.x, c.y, c.hx, c.hy, i === 0 ? 0.45 : 0.55 / (enc.length - 1)));
    if (lv >= 5) { // 総構え：山すそを柵と空堀で囲む
      k.A.splice(1, 0, ['d', ['o', 25, lean * 0.3, 168, 160]]);
      const segs = 28; for (let i = 0; i < segs; i++) { const a0 = (i / segs) * 2 * PI, a1 = ((i + 1) / segs) * 2 * PI; k.W.push(['l', 25 + Math.cos(a0) * 158, lean * 0.3 + Math.sin(a0) * 158, 25 + Math.cos(a1) * 158, lean * 0.3 + Math.sin(a1) * 158, 'k']); }
      for (const a of [PI - 0.35, PI + 0.35]) k.G.push([25 + Math.cos(a) * 158, lean * 0.3 + Math.sin(a) * 158, a, 8, `${k.n++}s`]);
      k.G.push([25 + Math.cos(PI) * 158, lean * 0.3, PI, 8, `${k.n++}s`]);
    }
    return k;
  }

  // ---- 水城 ----
  function genMizu(lv, r) {
    const k = Kit(), st = wst(lv), ix = 25 + r() * 10, hx = 30 + r() * 6, hy = 26 + r() * 7, ihx = hx + 18, ihy = hy + 16, shore = ix - ihx - 30 - r() * 12, gy = (r() - 0.5) * 16;
    k.area('m', ['p', shore, -260, 260, -260, 260, 260, shore, 260]); // 城のうしろ・左右は水（海や湖）
    k.area('l', ['p', ...k.box(ix, 0, ihx, ihy)]); // 島
    k.area('l', ['p', shore - 2, gy - 6, ix - ihx + 1, gy - 6, ix - ihx + 1, gy + 6, shore - 2, gy + 6]); // 陸から島への細い土橋
    k.area('k', ['p', ...k.box(ix, 0, hx, hy)]);
    if (lv >= 2) { k.moat('m', ix, 0, hx + 2, hy + 2, 6); }
    k.rectWalls(ix, 0, hx, hy, st);
    const go = k.gate(ix, 0, hx, hy, 'W', gy, 7, lv >= 3 ? 'h' : 'o'); if (lv >= 2) { k.bridge(go, 9, 10); k.masugata(go, st); }
    const gk = k.gate(ix, 0, hx, hy, 'E', (r() - 0.5) * hy, 5, 'k'); if (lv >= 2) k.bridge(gk, 9); // 搦手（船着き場の方）
    k.area('l', ['p', ix + hx, gk.y - 4, ix + ihx + 14, gk.y - 4, ix + ihx + 14, gk.y + 4, ix + hx, gk.y + 4]); k.T.push(['y', ix + ihx + 8, gk.y, 0]); // 船入
    k.encl1(ix, 0, hx, hy, 0.5);
    if (lv >= 1) k.area('d', ['p', shore - 30, gy - 40, shore, gy - 40, shore, gy + 40, shore - 30, gy + 40]); // 岸の空堀
    if (lv >= 3) { // 土橋の付け根に二の丸
      k.corners(ix, 0, hx, hy);
      const nhx = 24, nhy = 26 + r() * 6, nx = shore - nhx + 3; // 土橋の付け根をふさぐ（岸ぎわから水の上まで）
      k.area('k', ['p', ...k.box(nx, gy, nhx, nhy)]); k.rectWalls(nx, gy, nhx, nhy, st);
      const g2 = k.gate(nx, gy, nhx, nhy, 'W', (r() - 0.5) * nhy * 0.6, 7, 'o'); k.masugata(g2, st, 12); k.gate(nx, gy, nhx, nhy, 'E', 0, 7, 's');
      k.corners(nx, gy, nhx, nhy); k.encl1(nx, gy, nhx, nhy, 0.3);
    }
    if (lv >= 4) { // 天守と、岸の出丸2つ
      k.T.push(['T', ix + hx * 0.4, -hy * 0.35, 0]);
      for (const sg of [-1, 1]) { const tx = shore - 20, ty = gy + sg * 85, thx = 18, thy = 16; k.area('k', ['p', ...k.box(tx, ty, thx, thy)]); k.rectWalls(tx, ty, thx, thy, st); k.gate(tx, ty, thx, thy, 'W', 0, 6, 's'); k.encl1(tx, ty, thx, thy, 0.1); }
    }
    if (lv >= 5) { // 総構え：岸ぞいに土塁と空堀
      const L = shore - 95; k.A.unshift(['d', ['p', L - 12, -230, L, -230, L, 230, L - 12, 230]]);
      k.W.push(['l', L, -230, L, gy - 50, 'd'], ['l', L, gy - 50, L, gy + 50, 'd'], ['l', L, gy + 50, L, 230, 'd']);
      for (const y of [gy - 50, gy + 50]) k.G.push([L, y + (y < gy ? 20 : -20), PI, 8, `${k.n++}s`]);
      k.W.push(['l', L, -230, shore, -230, 'd'], ['l', L, 230, shore, 230, 'd']);
    }
    return k;
  }


  // ---- 曲輪をつなぐ道具（名のある城・自分で作る城で使う）：平らにならした曲輪・塀・曲輪どうしを結ぶ門と坂 ----
  function terr(k, C, links, st) {
    C.forEach((c) => { if (c.h != null) k.E.push(['f', ['p', ...k.box(c.x, c.y, c.hx + 2, c.hy + 2)], c.h, c.bw || 9]); k.area('k', ['p', ...k.box(c.x, c.y, c.hx, c.hy)]); k.rectWalls(c.x, c.y, c.hx, c.hy, c.st || st); });
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    for (const [i, j, suf] of links) {
      const a = C[i], b = C[j], dx = b.x - a.x, dy = b.y - a.y; let ga, gb;
      if (Math.abs(dx) >= Math.abs(dy)) { const y = a.y + cl((a.y + b.y) / 2 - a.y, a.hy - 4), yb = b.y + cl(y - b.y, b.hy - 4); ga = k.gate(a.x, a.y, a.hx, a.hy, dx < 0 ? 'W' : 'E', y - a.y, 5.5, suf || 's'); gb = k.gate(b.x, b.y, b.hx, b.hy, dx < 0 ? 'E' : 'W', yb - b.y, 5.5, 's'); }
      else { const x = a.x + cl((a.x + b.x) / 2 - a.x, a.hx - 4), xb = b.x + cl(x - b.x, b.hx - 4); ga = k.gate(a.x, a.y, a.hx, a.hy, dy < 0 ? 'N' : 'S', x - a.x, 5.5, suf || 's'); gb = k.gate(b.x, b.y, b.hx, b.hy, dy < 0 ? 'S' : 'N', xb - b.x, 5.5, 's'); }
      const ux = gb.x - ga.x, uy = gb.y - ga.y, L = Math.hypot(ux, uy) || 1, nx = -uy / L * 3.5, ny = ux / L * 3.5, q = ['p', ga.x + nx, ga.y + ny, gb.x + nx, gb.y + ny, gb.x - nx, gb.y - ny, ga.x - nx, ga.y - ny];
      k.area('b', q); if (a.h != null && b.h != null && Math.abs(a.h - b.h) < 14) k.E.push(['f', q, (a.h + b.h) / 2, 4]); else k.road([[ga.x, ga.y], [gb.x, gb.y]], 6);
    }
  }
  // つづら折りの道（x0,y0 から x1,y1 へ。n 回折れる）
  const zig = (x0, y0, x1, y1, n, amp) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n; o.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + (i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amp)]); } return o; };
  const stOf = (lv, top) => (lv >= 3 && top ? 'i' : lv >= 2 ? 'd' : 'k');

  // ---- 名のある城（城の id ごとに手で作った形。改築の段階で育つ） ----
  const FAMOUS = SIM.NAWA_FAMOUS = {
    // 躑躅ヶ崎館（武田）：堀と土塁で囲んだ四角い館。大手の前に丸馬出（半月の土塁と三日月堀）
    kofu: { ck: 'hira', name: '躑躅ヶ崎館', gen(lv) {
      const k = Kit(), a = 46, mw = 12, st = lv >= 3 ? 'i' : 'd';
      k.area('k', ['p', ...k.box(0, 0, a, a)]); k.moat(lv >= 1 ? 'm' : 'd', 0, 0, a + 3, a + 3, mw); k.rectWalls(0, 0, a, a, st);
      const go = k.gate(0, 0, a, a, 'W', 0, 7, 'o'); k.bridge(go, mw + 5); const gk = k.gate(0, 0, a, a, 'S', 10, 6, 'k'); k.bridge(gk, mw + 5);
      const mx = -(a + 3 + mw); // 丸馬出
      k.area('d', ['q', mx, 0, 18, 26, PI / 2 + 0.25, PI - 0.5]); k.area('k', ['q', mx, 0, 0, 17, PI / 2, PI]); k.W.push(['a', mx, 0, 17, PI / 2 + 0.55, PI - 1.1, 'd']);
      k.encl1(0, 0, a, a, 0.75);
      if (lv >= 2) { const wx = a + 3 + mw + 26; k.area('k', ['p', ...k.box(wx, 0, 22, 30)]); k.moat('d', wx, 0, 22, 30, 8); k.rectWalls(wx, 0, 22, 30, st); const g1 = k.gate(0, 0, a, a, 'E', 0, 6, 's'); k.bridge(g1, mw + 5); k.gate(wx, 0, 22, 30, 'W', 0, 6, 's'); k.encl1(wx, 0, 22, 30, 0.25); } // 西曲輪
      if (lv >= 3) k.corners(0, 0, a, a);
      if (lv >= 5) { k.A.unshift(['d', ['P', k.box(-20, 0, 170, 150), k.box(-20, 0, 160, 140)]]); k.rectWalls(-20, 0, 160, 140, 'd'); for (const off of [-60, 60]) k.gate(-20, 0, 160, 140, 'W', off, 8, 's'); }
      return k; } },
    // 小田原城（北条）：丘の上の本丸を二の丸・三の丸が囲み、町ごと大きな総構えで囲む
    odawara: { ck: 'hira', name: '小田原城', gen(lv, r) {
      const k = Kit(), st = stOf(lv, 1), R = 200;
      k.E.push(['m', 30, 0, 150, 16]);
      // 総構え（はじめからある）：多角形の土塁と空堀
      const poly = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * 2 * PI + 0.13, rr = R * (0.88 + 0.12 * Math.sin(i * 1.7)); poly.push(-30 + Math.cos(a) * rr * 1.05, Math.sin(a) * rr * 0.95); }
      const outer = poly.map((v, i) => (i % 2 ? v * 1.06 : (v + 30) * 1.06 - 30));
      k.area('d', ['P', outer, poly]);
      for (let i = 0; i < 12; i++) k.W.push(['l', poly[i * 2], poly[i * 2 + 1], poly[((i + 1) % 12) * 2], poly[((i + 1) % 12) * 2 + 1], 'd']);
      for (const i of [5, 6, 7]) { const x = (poly[i * 2] + poly[((i + 1) % 12) * 2]) / 2, y = (poly[i * 2 + 1] + poly[((i + 1) % 12) * 2 + 1]) / 2; k.G.push([x, y, Math.atan2(y, x + 30), 8, `${k.n++}s`]); }
      // 三の丸
      if (lv >= 2) { k.area('k', ['p', ...k.box(-10, 0, 95, 80)]); k.moat('d', -10, 0, 95, 80, 10); k.rectWalls(-10, 0, 95, 80, 'd'); for (const off of [-40, 40]) k.gate(-10, 0, 95, 80, 'W', off, 7, 's'); k.encl1(-10, 0, 95, 80, 0.15); }
      // 二の丸・本丸
      k.E.push(['f', ['p', ...k.box(20, 0, 54, 46)], 10, 10], ['f', ['p', ...k.box(38, 0, 24, 20)], 17, 6]);
      k.area('k', ['p', ...k.box(20, 0, 52, 44)]); k.moat(lv >= 1 ? 'm' : 'd', 20, 0, 54, 46, 12); k.rectWalls(20, 0, 52, 44, st);
      const g2 = k.gate(20, 0, 52, 44, 'W', -12, 7, 'o'); k.bridge(g2, 16); if (lv >= 2) k.masugata(g2, st);
      const g2k = k.gate(20, 0, 52, 44, 'N', 10, 6, 'k'); k.bridge(g2k, 16);
      k.area('k', ['p', ...k.box(38, 0, 22, 18)]); if (lv >= 2) k.moat('m', 38, 0, 23, 19, 6); k.rectWalls(38, 0, 22, 18, st);
      const gh = k.gate(38, 0, 22, 18, 'W', 6, 6, 'h'); if (lv >= 2) k.bridge(gh, 8);
      k.encl1(38, 0, 22, 18, 0.45); k.encl1(20, 0, 52, 44, 0.4);
      if (lv >= 3) { k.corners(38, 0, 22, 18); k.corners(20, 0, 52, 44); }
      if (lv >= 4) k.T.push(['T', 46, -6, 0]);
      return k; } },
    // 春日山城（上杉）：高い山の頂の本丸（実城）から、尾根づたいに多くの曲輪が段々に下る
    kasugayama: { ck: 'yama', name: '春日山城', gen(lv) {
      const k = Kit(), st = stOf(lv, 1);
      k.E.push(['m', 40, 0, 205, 84]); k.area('s', ['o', 40, 0, 175]);
      const C = [{ x: 48, y: 0, hx: 16, hy: 12, h: 82, w: 0.35 }, { x: 22, y: -14, hx: 13, hy: 9, h: 74, w: 0.12 }, { x: 2, y: 8, hx: 15, hy: 9, h: 66, w: 0.12 }, { x: 46, y: 28, hx: 10, hy: 8, h: 74, w: 0.06 }, { x: -24, y: -6, hx: 13, hy: 9, h: 55, w: 0.12 }, { x: -50, y: 14, hx: 16, hy: 11, h: 43, w: 0.12 }];
      const L = [[0, 1, 'h'], [0, 3], [1, 2], [2, 4], [4, 5]];
      if (lv >= 3) { C.push({ x: -82, y: 0, hx: 17, hy: 12, h: 30, w: 0.1 }); L.push([5, 6]); }
      if (lv >= 4) { C.push({ x: 16, y: -40, hx: 12, hy: 8, h: 62, w: 0.05 }); L.push([1, 7]); }
      C[0].st = st; terr(k, C, L, lv >= 2 ? 'd' : 'k');
      const low = C[C.length - (lv >= 4 ? 2 : 1)], go = k.gate(low.x, low.y, low.hx, low.hy, 'W', 0, 6, 'o'); if (lv >= 2) k.masugata(go, 'd', 11);
      k.road(zig(-185, 30, go.x - 4, go.y, 7, 26), 6);
      const gk = k.gate(C[0].x, C[0].y, C[0].hx, C[0].hy, 'E', -4, 5, 'k'); k.road(zig(gk.x + 2, gk.y, 175, -60, 4, 18), 4);
      if (lv >= 1) k.area('d', ['p', 33, -40, 37, -40, 37, -14, 33, -14]); // 堀切
      if (lv >= 3) k.corners(C[0].x, C[0].y, C[0].hx, C[0].hy);
      if (lv >= 5) { const segs = 30; for (let i = 0; i < segs; i++) { const a0 = (i / segs) * 2 * PI, a1 = ((i + 1) / segs) * 2 * PI; k.W.push(['l', 40 + Math.cos(a0) * 185, Math.sin(a0) * 185, 40 + Math.cos(a1) * 185, Math.sin(a1) * 185, 'k']); } k.G.push([40 - 185 * Math.cos(0.17), 185 * Math.sin(0.17), PI - 0.17, 8, `${k.n++}s`]); }
      C.forEach((c) => k.encl1(c.x, c.y, c.hx, c.hy, c.w));
      return k; } },
    // 稲葉山城（斎藤）：けわしく細い尾根の上に小さな曲輪が並ぶ。ふもとに居館
    inabayama: { ck: 'yama', name: '稲葉山城', gen(lv) {
      const k = Kit(), st = stOf(lv, 1);
      k.E.push(['m', 30, 0, 160, 96]); k.area('s', ['o', 30, 0, 140]);
      const C = [{ x: 52, y: 0, hx: 13, hy: 10, h: 94, w: 0.4 }, { x: 30, y: 4, hx: 10, hy: 7, h: 86, w: 0.15 }, { x: 10, y: -2, hx: 11, hy: 7, h: 76, w: 0.15 }, { x: -12, y: 3, hx: 10, hy: 7, h: 64, w: 0.15 }];
      const L = [[0, 1, 'h'], [1, 2], [2, 3]];
      if (lv >= 2) { C.push({ x: -34, y: -2, hx: 11, hy: 7, h: 50, w: 0.1 }); L.push([3, 4]); }
      C[0].st = st; terr(k, C, L, lv >= 2 ? 'd' : 'k');
      const low = C[C.length - 1], go = k.gate(low.x, low.y, low.hx, low.hy, 'W', 0, 5.5, 'o');
      k.road(zig(-150, -20, go.x - 3, go.y, 9, 18), 5); // 七曲り
      const gk = k.gate(C[0].x, C[0].y, C[0].hx, C[0].hy, 'S', 0, 5, 'k'); k.road(zig(gk.x, gk.y + 2, 120, 140, 6, 12), 4); // 百曲り
      if (lv >= 3) { const hx = -120, hy2 = 0; k.area('k', ['p', ...k.box(hx, hy2, 26, 20)]); k.moat('d', hx, hy2, 26, 20, 8); k.rectWalls(hx, hy2, 26, 20, 'd'); k.gate(hx, hy2, 26, 20, 'W', 0, 7, 's'); k.gate(hx, hy2, 26, 20, 'E', -6, 6, 's'); k.encl1(hx, hy2, 26, 20, 0.05); } // ふもとの居館
      if (lv >= 4) k.T.push(['T', 56, -2, 0]);
      if (lv >= 3) k.corners(C[0].x, C[0].y, C[0].hx, C[0].hy);
      C.forEach((c) => k.encl1(c.x, c.y, c.hx, c.hy, c.w));
      return k; } },
    // 月山富田城（尼子）：山の中ほどの広い山中御殿に三つの口。そこから七曲りを登って三の丸・二の丸・本丸
    gassantoda: { ck: 'yama', name: '月山富田城', gen(lv) {
      const k = Kit(), st = stOf(lv, 1);
      k.E.push(['m', 40, 0, 185, 76]); k.area('s', ['o', 40, 0, 160]);
      const C = [{ x: 58, y: 0, hx: 14, hy: 10, h: 74, w: 0.3 }, { x: 37, y: 6, hx: 12, hy: 9, h: 68, w: 0.12 }, { x: 15, y: -4, hx: 14, hy: 9, h: 60, w: 0.12 }];
      C[0].st = st; terr(k, C, [[0, 1, 'h'], [1, 2]], lv >= 2 ? 'd' : 'k');
      const M = { x: -48, y: 0, hx: 30, hy: 24, h: 30 }; // 山中御殿
      k.E.push(['f', ['p', ...k.box(M.x, M.y, M.hx + 2, M.hy + 2)], M.h, 10]); k.area('k', ['p', ...k.box(M.x, M.y, M.hx, M.hy)]); k.rectWalls(M.x, M.y, M.hx, M.hy, lv >= 2 ? 'd' : 'k');
      const gW = k.gate(M.x, M.y, M.hx, M.hy, 'W', 4, 7, 'o'), gN = k.gate(M.x, M.y, M.hx, M.hy, 'N', -8, 6, 's'), gS = k.gate(M.x, M.y, M.hx, M.hy, 'S', -8, 6, 's'), gE = k.gate(M.x, M.y, M.hx, M.hy, 'E', 0, 5.5, 's');
      if (lv >= 2) k.masugata(gW, 'd', 12);
      k.road(zig(-175, 10, gW.x - 3, gW.y, 4, 16), 6); k.road(zig(gN.x, gN.y - 3, -120, -170, 3, 14), 5); k.road(zig(gS.x, gS.y + 3, -110, 175, 3, 14), 5); // 菅谷口・御子守口・塩谷口
      const g3 = k.gate(C[2].x, C[2].y, C[2].hx, C[2].hy, 'W', 0, 5.5, 's'); k.road(zig(gE.x + 3, gE.y, g3.x - 3, g3.y, 7, 12), 4); // 七曲り
      const gk = k.gate(C[0].x, C[0].y, C[0].hx, C[0].hy, 'E', 0, 5, 'k'); k.road(zig(gk.x + 2, gk.y, 170, 40, 3, 15), 4);
      if (lv >= 3) { const c = { x: -8, y: -26, hx: 10, hy: 8, h: 46, w: 0.05 }; k.E.push(['f', ['p', ...k.box(c.x, c.y, c.hx + 2, c.hy + 2)], c.h, 8]); k.area('k', ['p', ...k.box(c.x, c.y, c.hx, c.hy)]); k.rectWalls(c.x, c.y, c.hx, c.hy, 'k'); k.gate(c.x, c.y, c.hx, c.hy, 'W', 0, 5, 's'); k.encl1(c.x, c.y, c.hx, c.hy, c.w); } // 花の壇
      if (lv >= 3) k.corners(C[0].x, C[0].y, C[0].hx, C[0].hy);
      if (lv >= 4) k.T.push(['T', 62, 0, 0]);
      if (lv >= 1) k.area('d', ['p', 23 + 9, -30, 27 + 9, -30, 27 + 9, 30, 23 + 9, 30]); // 堀切
      C.forEach((c) => k.encl1(c.x, c.y, c.hx, c.hy, c.w)); k.encl1(M.x, M.y, M.hx, M.hy, 0.4);
      return k; } },
    // 石山本願寺：三方を川に囲まれた台地の寺内町。土塁と堀で囲み、まん中に御堂。陸の側に出城
    ishiyama: { ck: 'mizu', name: '石山本願寺', gen(lv) {
      const k = Kit(), st = stOf(lv, 1);
      k.E.push(['m', 10, 0, 190, 9]);
      k.area('m', ['p', -400, -260, 320, -260, 320, 260, -400, 260]); k.area('l', ['p', -420, -128, 108, -128, 108, 128, -420, 128]); // 川と台地
      k.area('k', ['p', ...k.box(0, 0, 92, 84)]); k.moat('d', 0, 0, 92, 84, 10); k.rectWalls(0, 0, 92, 84, 'd'); // 寺内町
      const g1 = k.gate(0, 0, 92, 84, 'W', -30, 8, 'o'); k.bridge(g1, 14); const g2 = k.gate(0, 0, 92, 84, 'W', 34, 7, 'k'); k.bridge(g2, 14);
      if (lv >= 2) k.masugata(g1, 'd', 13);
      k.area('k', ['p', ...k.box(38, 0, 30, 26)]); if (lv >= 2) k.moat('m', 38, 0, 31, 27, 7); k.rectWalls(38, 0, 30, 26, st); // 御堂
      const gh = k.gate(38, 0, 30, 26, 'W', 0, 7, 'h'); if (lv >= 2) k.bridge(gh, 9);
      k.T.push(['T', 42, 0, 0]); // 御影堂（大きな屋根）
      k.encl1(38, 0, 30, 26, 0.45); k.encl1(0, 0, 92, 84, 0.4);
      if (lv >= 3) for (const y of [-80, 0, 80]) { const x = -150; k.area('k', ['p', ...k.box(x, y, 16, 14)]); k.moat('d', x, y, 16, 14, 6); k.rectWalls(x, y, 16, 14, 'k'); k.gate(x, y, 16, 14, 'E', 0, 6, 's'); k.encl1(x, y, 16, 14, 0.05); } // 出城
      if (lv >= 3) k.corners(0, 0, 92, 84);
      return k; } },
  };
  // 名のある城は種類も決まっている
  { const base = SIM.castleKind; SIM.castleKind = (s) => (s && FAMOUS[s.id] ? FAMOUS[s.id].ck : base(s)); }
  SIM._nawaKit = Kit; SIM._nawaTerr = terr; SIM._nawaZig = zig;
  SIM.nawaPlace = (k, cx, cy, sx) => place(k, cx, cy, sx);


  // ---- 自分で作る城（築城）：プレイヤーが描いた縄張り（plan）をパーツにする。攻め手は -x から来る ----
  //  plan = { ck, enc:[[x,y,hx,hy,塀,まわりの堀(0|'d'|'m')]] 最初が本丸, walls:[[x1,y1,x2,y2,塀]], gates:[[x,y,a,種類 o|k|s]], moats:[[x,y,hx,hy,'d'|'m']], tow:[[x,y]], ten:[x,y]|null, roads:[[x1,y1,x2,y2]] }
  const PB = SIM.NAWA_PLAN = { X0: -170, X1: 100, Y0: -135, Y1: 135, shore: 40, mtn: [20, 0, 190, 62],
    max: { enc: 8, walls: 60, gates: 20, moats: 20, roads: 30, tow: 12 },
    rate: { // 1m（塀・道）や 1㎡（堀・曲輪をならす）あたりのお金。城の種類で変わる
      hira: { wall: { k: 30, d: 80, i: 220 }, moat: { d: 4, m: 7 }, lev: 0.3, road: 4 },
      yama: { wall: { k: 25, d: 75, i: 330 }, moat: { d: 6, m: 20 }, lev: 2.5, road: 10 }, // 山の上は石を運ぶのが大変・曲輪を切り開く手間
      mizu: { wall: { k: 30, d: 85, i: 260 }, moat: { d: 4, m: 3 }, lev: 1.2, road: 14 }, // 水堀はすぐ水が入る・水の上は埋め立て
    }, base: 5000, gate: { o: 3000, k: 1800, s: 1500 }, tower: 3000, keep: 25000, unit: 40000 };
  const mtnH = (x, y) => { const [mx, my, mr, mh] = PB.mtn, d = Math.hypot(x - mx, y - my); if (d >= mr) return 0; const q = 1 - (d / mr) * (d / mr); return mh * q * Math.sqrt(q); };
  SIM.nawaMtnH = mtnH;
  // 築く場所から城の種類を決める（山地が近い→山城、海が近い→水城、ほかは平城）
  SIM.siteKind = (x, y) => {
    let m = 0; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (SIM.terrainAt && SIM.terrainAt(x + i * 2, y + j * 2) === '山地') m++;
    if (m >= 2) return 'yama';
    if (SIM.isSea) for (let i = 0; i < 8; i++) { const a = (i * PI) / 4; if (SIM.isSea(x + Math.cos(a) * 3, y + Math.sin(a) * 3)) return 'mizu'; }
    return 'hira';
  };
  const inBox = (x, y, b) => Math.abs(x - b[0]) <= b[2] && Math.abs(y - b[1]) <= b[3];
  SIM.nawaPlanKit = (plan) => {
    const k = Kit(), ck = plan.ck, enc = plan.enc || [];
    if (ck === 'yama') { k.E.push(['m', ...PB.mtn]); k.area('s', ['o', PB.mtn[0], PB.mtn[1], 150]); }
    if (ck === 'mizu') k.area('m', ['p', PB.shore, -280, 320, -280, 320, 280, PB.shore, 280]); // 岸より奥は水
    if (ck === 'mizu') for (const [x, y, hx, hy, , mo] of enc) if (x + hx + 16 > PB.shore) k.area('l', ['p', ...k.box(x, y, hx + (mo ? 16 : 5), hy + (mo ? 16 : 5))]); // 水の上の曲輪は埋め立て
    for (const [x, y, hx, hy, t] of plan.moats || []) k.area(t === 'm' ? 'm' : 'd', ['p', ...k.box(x, y, hx, hy)]);
    for (const [x, y, hx, hy, , mo] of enc) if (mo) k.moat(mo === 'm' ? 'm' : 'd', x, y, hx + 3, hy + 3, 10);
    for (const [x1, y1, x2, y2] of plan.roads || []) k.road([[x1, y1], [x2, y2]], 6);
    const moatAt = (x, y) => (plan.moats || []).some((m) => inBox(x, y, m)) || enc.some((e) => e[5] && inBox(x, y, [e[0], e[1], e[2] + 13, e[3] + 13]) && !inBox(x, y, [e[0], e[1], e[2] + 3, e[3] + 3])) || (ck === 'mizu' && x > PB.shore && !enc.some((e) => inBox(x, y, [e[0], e[1], e[2] + 5, e[3] + 5])));
    enc.forEach(([x, y, hx, hy, st], i) => {
      if (ck === 'yama') k.E.push(['f', ['p', ...k.box(x, y, hx + 2, hy + 2)], Math.max(0, mtnH(x, y) - 2), 8]);
      k.area('k', ['p', ...k.box(x, y, hx, hy)]); if (st) k.rectWalls(x, y, hx, hy, st);
      k.encl1(x, y, hx, hy, i === 0 ? 0.5 : 0.5 / Math.max(1, enc.length - 1));
    });
    for (const [x1, y1, x2, y2, st] of plan.walls || []) k.W.push(['l', x1, y1, x2, y2, st || 'k']);
    const main = enc[0];
    for (const [x, y, a, kind] of plan.gates || []) {
      const onMain = main && Math.abs(Math.abs(x - main[0]) - main[2]) + Math.abs(Math.abs(y - main[1]) - main[3]) < Math.max(main[2], main[3]) && inBox(x, y, [main[0], main[1], main[2] + 1.5, main[3] + 1.5]);
      const suf = kind === 'o' || kind === 'k' ? kind : onMain ? 'h' : 's', g = { x, y, a, w: 6, id: `${k.n++}${suf}` };
      k.G.push([x, y, a, 6, g.id]);
      for (const sg of [1, -1]) { let hit = false; for (let d = 3; d <= 24; d += 3) if (moatAt(x + Math.cos(a) * sg * d, y + Math.sin(a) * sg * d)) hit = true; if (hit) k.bridge({ x, y, a: sg > 0 ? a : a + PI, w: 6 }, 24); } // 堀の側に土橋
    }
    for (const [x, y] of plan.tow || []) k.T.push(['y', x, y, 0]);
    if (plan.ten) k.T.push(['T', plan.ten[0], plan.ten[1], 0]);
    return k;
  };
  const len = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  SIM.nawaPlanCost = (plan) => {
    const R = PB.rate[plan.ck] || PB.rate.hira; let c = PB.base;
    for (const [x, y, hx, hy, st, mo] of plan.enc || []) { c += 4 * hx * hy * R.lev + (st ? 4 * (hx + hy) * 2 * R.wall[st] : 0); if (mo) c += (4 * (hx + 13) * (hy + 13) - 4 * (hx + 3) * (hy + 3)) * R.moat[mo]; }
    for (const [x1, y1, x2, y2, st] of plan.walls || []) c += len(x1, y1, x2, y2) * R.wall[st || 'k'];
    for (const [, , hx, hy, t] of plan.moats || []) c += 4 * hx * hy * R.moat[t === 'm' ? 'm' : 'd'];
    for (const [x1, y1, x2, y2] of plan.roads || []) c += len(x1, y1, x2, y2) * 6 * R.road;
    for (const g of plan.gates || []) c += PB.gate[g[3]] || PB.gate.s;
    c += (plan.tow || []).length * PB.tower + (plan.ten ? PB.keep : 0);
    return Math.round(c / 100) * 100;
  };
  // 縄張りの改築の段階（守りの効きに使う）：空堀→1・土塁か水堀→2・石垣→3・天守→4・大きく広い→5
  SIM.nawaPlanKai = (plan) => {
    const W = (plan.walls || []).map((w) => w[4]).concat((plan.enc || []).map((e) => e[4])), M = (plan.moats || []).map((m) => m[4]).concat((plan.enc || []).map((e) => e[5]).filter(Boolean));
    let lv = 0; if (M.length) lv = 1; if (W.includes('d') || M.includes('m')) lv = 2; if (W.includes('i')) lv = 3; if (plan.ten && lv >= 2) lv = 4;
    const per = (plan.enc || []).reduce((a, e) => a + 4 * (e[2] + e[3]), 0) + (plan.walls || []).reduce((a, w) => a + len(...w.slice(0, 4)), 0);
    if (lv >= 3 && (plan.enc || []).length >= 4 && per > 1100) lv = 5;
    return lv;
  };
  // 縄張りを確かめる：数・範囲・どの曲輪にも外から門を通って入れるか
  SIM.nawaPlanCheck = (plan) => {
    if (!plan || typeof plan !== 'object' || !['hira', 'yama', 'mizu'].includes(plan.ck)) return { ok: false, msg: '縄張りが読めません' };
    const num = (v) => typeof v === 'number' && isFinite(v), pt = (x, y) => num(x) && num(y) && x >= PB.X0 - 30 && x <= PB.X1 + 30 && y >= PB.Y0 - 30 && y <= PB.Y1 + 30;
    for (const k of Object.keys(PB.max)) if ((plan[k] || []).length > PB.max[k]) return { ok: false, msg: `${k} が多すぎます` };
    const enc = plan.enc || []; if (!enc.length) return { ok: false, msg: '曲輪を一つ以上描いてください（最初の曲輪が本丸です）' };
    for (const e of enc) if (!pt(e[0], e[1]) || !(e[2] >= 6 && e[2] <= 90 && e[3] >= 6 && e[3] <= 90) || ![0, 'k', 'd', 'i'].includes(e[4] || 0) || ![0, 'd', 'm'].includes(e[5] || 0)) return { ok: false, msg: '曲輪の大きさか場所がおかしいです' };
    for (const w of plan.walls || []) if (!pt(w[0], w[1]) || !pt(w[2], w[3]) || !['k', 'd', 'i'].includes(w[4])) return { ok: false, msg: '塀がおかしいです' };
    for (const g of plan.gates || []) if (!pt(g[0], g[1]) || !num(g[2]) || !['o', 'k', 's'].includes(g[3])) return { ok: false, msg: '門がおかしいです' };
    for (const m of plan.moats || []) if (!pt(m[0], m[1]) || !(m[2] > 0 && m[2] <= 120 && m[3] > 0 && m[3] <= 120) || !['d', 'm'].includes(m[4])) return { ok: false, msg: '堀がおかしいです' };
    for (const r of plan.roads || []) if (!pt(r[0], r[1]) || !pt(r[2], r[3])) return { ok: false, msg: '道がおかしいです' };
    for (const t of (plan.tow || []).concat(plan.ten ? [plan.ten] : [])) if (!pt(t[0], t[1])) return { ok: false, msg: '櫓の場所がおかしいです' };
    if (plan.ck === 'yama' && (plan.moats || []).some((m) => m[4] === 'm' && mtnH(m[0], m[1]) > 6) || plan.ck === 'yama' && enc.some((e) => e[5] === 'm' && mtnH(e[0], e[1]) > 6)) return { ok: false, msg: '山の上には水堀は掘れません（空堀にしてください）' };
    const k = SIM.nawaPlanKit(plan), N = SIM.nawa([place(k, 0, 0, 1)]);
    if (!N) return { ok: false, msg: '縄張りが空です' };
    for (let i = 0; i < enc.length; i++) { const r = N.reg[Math.max(0, Math.min(N.W * N.H - 1, Math.floor((enc[i][1] - N.y0) / 2) * N.W + Math.floor((enc[i][0] - N.x0) / 2)))]; if (r < 0 || N.dep[r] < 0) return { ok: false, msg: `${i ? (i + 1) + '番目の曲輪' : '本丸'}に入る門がありません（攻め手が外から門を通って入れるようにしてください）`, i }; }
    return { ok: true, cost: SIM.nawaPlanCost(plan), kai: SIM.nawaPlanKai(plan), N };
  };
  SIM.nawaFromSite = (s, cx, cy, sx) => { const k = SIM.nawaPlanKit(s.nawa.plan); return { c: place(k, cx, cy, sx), k }; };
  { const base = SIM.castleKind; SIM.castleKind = (s) => (s && s.nawa && s.nawa.plan ? s.nawa.plan.ck : base(s)); }
  // 見本の縄張り（描く画面で「見本」を押すと置かれる）
  SIM.nawaSample = (ck) => ck === 'yama'
    ? { ck, enc: [[40, 0, 20, 15, 'd', 0], [0, 4, 16, 12, 'k', 0]], walls: [], gates: [[20, 0, PI, 's'], [16, 4, 0, 's'], [-16, 4, PI, 'o'], [40, 15, PI / 2, 'k']], moats: [[28, 0, 3, 30, 'd']], tow: [], ten: null, roads: [[-150, 20, -90, -10], [-90, -10, -40, 18], [-40, 18, -18, 4]] }
    : ck === 'mizu'
      ? { ck, enc: [[75, 0, 26, 22, 'd', 'm'], [10, 0, 18, 18, 'k', 0]], walls: [], gates: [[49, 0, PI, 'h' === 'h' ? 's' : 's'], [28, 0, 0, 's'], [-8, 0, PI, 'o']], moats: [], tow: [], ten: null, roads: [[28, 0, 49, 0]] }
      : { ck, enc: [[20, 0, 30, 26, 'd', 'm']], walls: [], gates: [[-10, 4, PI, 'o'], [30, 26, PI / 2, 'k']], moats: [], tow: [[-7, -23], [47, 23]], ten: null, roads: [] };

  // ---- 向きをそろえて ter に入れる ----
  function place(k, cx, cy, sx) {
    const P = (x, y) => [cx + sx * x, cy + y], A = (a) => (sx > 0 ? a : PI - a);
    const sh = (s) => { if (s[0] === 'o') return ['o', ...P(s[1], s[2]), s[3], s[4] || 0]; if (s[0] === 'q') return ['q', ...P(s[1], s[2]), s[3], s[4], sx > 0 ? s[5] : PI - s[5] - s[6], s[6]]; const pts = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(...P(a[i], a[i + 1])); return o; }; if (s[0] === 'P') return ['P', ...s.slice(1).map(pts)]; return ['p', ...pts(s.slice(1))]; };
    const Aout = k.A.map(([c, s]) => [c, sh(s)]).concat(k.K.map((s) => ['K', sh(s)]));
    const W = k.W.map((w) => (w[0] === 'l' ? ['l', ...P(w[1], w[2]), ...P(w[3], w[4]), w[5]] : ['a', ...P(w[1], w[2]), w[3], sx > 0 ? w[4] : PI - w[4] - w[5], w[5], w[6]]));
    const G = k.G.map(([x, y, a, w, id]) => [...P(x, y), A(a), w, id]);
    const T = k.T.map(([t, x, y, a]) => [t, ...P(x, y), A(a)]);
    const E = k.E.map((e) => (e[0] === 'm' ? ['m', ...P(e[1], e[2]), e[3], e[4]] : ['f', sh(e[1]), e[2], e[3]]));
    return SIM.nawaEntry(Aout, W, G, T, [cx, cy, A(PI)], E);
  }
  SIM.nawaGen = (ck, lv, seed, cx, cy, sx) => { const r = rngOf(seed), k = (ck === 'yama' ? genYama : ck === 'mizu' ? genMizu : genHira)(Math.max(0, Math.min(5, lv)), r); return { c: place(k, cx, cy, sx), k }; };

  // ---- 攻城戦のマップ（今までの丸い城の作り方の代わり） ----
  SIM.castleLayout = (w, b, s, cside) => {
    const F = SIM.FIELD, ck = SIM.castleKind(s), lv = Math.max(0, Math.min(5, (s && s.kai) || 0)), sx = cside === 'B' ? 1 : -1;
    const cx = cside === 'B' ? F.w - 105 : 105, cy = F.h / 2, fam = s && FAMOUS[s.id];
    const own = s && s.nawa && SIM.nawaFromSite ? SIM.nawaFromSite(s, cx, cy, sx) : null; // 自分で作った城
    const g = own || (fam ? (() => { const k = fam.gen(lv, rngOf(seedOf(s))); return { c: place(k, cx, cy, sx), k }; })() : SIM.nawaGen(ck, lv, seedOf(s), cx, cy, sx)); // 名のある城は手で作った形
    const far = ck === 'yama' ? 230 : ck === 'mizu' ? 200 : lv >= 5 ? 220 : 150;
    b.ter = (b.ter || []).filter((t) => t.k !== 'c' && !(t.k === 'w' && Math.abs(t.x - cx) < far) && Math.hypot(t.x - cx, t.y - cy) > far + t.r * 0.5 && !['k', 'm', 's'].includes(t.k));
    b.ter.push(g.c);
    b.cside = cside; b.ck = ck; b.kf = SIM.kaiF ? SIM.kaiF(s) : 1; b.gf = SIM.gateF(s); b.cx = cx; b.cy = cy;
    const N = SIM.nawa(b.ter), encl = g.k ? g.k.encl : [];
    const E0 = N && N.E.find((e) => e[0] === 'm' && e[4] > 25);
    if (E0) { // 山は森に覆われている（曲輪・道・堀切は切り開いてある）
      const r = rngOf(seedOf(s) + 77), fs = [];
      for (let t = 0; t < 260 && fs.length < 34; t++) {
        const a = r() * 2 * PI, d = 40 + r() * 150, R = 14 + r() * 16, x = E0[1] + Math.cos(a) * d, y = E0[2] + Math.sin(a) * d;
        if (x < 4 || x > F.w - 4 || y < -20 || y > F.h + 20) continue;
        let ok = true; for (let k = 0; k < 13 && ok; k++) { const aa = k * 0.52, dd = k ? R + 5 : 0, px = x + Math.cos(aa) * dd, py = y + Math.sin(aa) * dd, ar = SIM.nawaArea(N, px, py); if ((ar && ar !== 4) || SIM.nawaWallCell(N, px, py)) ok = false; }
        if (ok && !fs.some((f) => Math.hypot(f.x - x, f.y - y) < (f.r + R) * 0.8)) fs.push({ k: 'f', x: Math.round(x), y: Math.round(y), r: Math.round(R) });
      }
      const ci = b.ter.indexOf(g.c); b.ter.splice(ci, 0, ...fs);
    }
    // 守り手を区画ごとに分けて置く（本丸に半分ほど、残りを外の区画へ）。弓・鉄砲は区画の前（攻め手の側）、槍・刀はその後ろ
    const defs = b.units.filter((u) => u.side === cside && (cside === 'B' || u.gar));
    const E = encl.length ? encl : [{ x: 0, y: 0, hx: 30, hy: 25, w: 1 }], tot = E.reduce((a, e) => a + e.w, 0);
    const pick = (i) => { let t = ((i * 0.618) % 1) * tot; for (let q = 0; q < E.length; q++) { t -= E[q].w; if (t <= 0) return q; } return 0; };
    defs.forEach((u, i) => {
      const T = SIM.TROOPS[u.type], q = u.type === 'hero' ? 0 : pick(i), e = E[q], row = T && T.ranged ? 0.55 : 0.15, sp = ((i * 7) % 9) / 8 - 0.5;
      u.x = cx + sx * (e.x - e.hx * row); u.y = cy + e.y + sp * e.hy * 1.4; u.home = q;
      u.order = 'hold'; u.f = sx > 0 ? PI : 0; if (T && T.ranged) u.ra = (u.ra || 0) + 4;
    });
    if (cside === 'A') for (const u of b.units) if (u.side === 'A' && !u.gar && !u.out) { u.x = cx + sx * 12; u.y = cy + (u.y - cy) * 0.3; u.home = 0; }
    void N;
  };
})();
