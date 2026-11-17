// 道のり：街道は速く、山は遅く、海と湖は通れない。行き先までの道筋を探す（ホストだけが使う）
(function () {
  const SIM = SGK.SIM;
  // 速さの倍率（数値はここで調整）
  // 0.40.0 道の格ごとの速さ。山の中の道（峠）は pass 倍、海の上の道（渡し船）は ferry
  const SPEED = { road: 1.8, plain: 1.0, mountain: 0.45, forest: 0.6, forestRate: 0.07, /* 1.6.47 森（遅い）・山は街道（峠）でしか通れない */ roads: [0, 1.8, 1.65, 1.5], pass: 0.7, ferry: 1.0 };
  const RANK_NAME = ['', '大街道', '街道', '脇道'];
  const CELL = 2;          // 道筋探しのマス目の大きさ（km）。全国の地図なので2kmマス
  const ROAD_WIDTH = 1.42; // 街道とみなす幅（中心からkm）。道が通るマスはすべて道になるよう √2 より少し広め（1.1.0）
  SIM.ROUTE_SPEED = SPEED;
  // 2.2.1 道の上とみなす幅（道の中心からkm）＝地図に描いた道の幅の半分＋少しのゆとり（大街道0.97・街道0.77・脇道0.6）
  const RW = [0, 1.25, 0.85, 0.5], vis = (rk) => RW[rk] * 0.5 + 0.35;

  let grid = null, buf = null; // 値 = 地形(0=海 1=平地 2=山 3=森) + 4×道の格(0=なし 1=大街道 2=街道 3=脇道)（1.6.47 4進）
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function build() {
    const T = SGK.DATA.terrain, B = SGK.DATA.bounds;
    const gw = Math.ceil(B.w / CELL), gh = Math.ceil(B.h / CELL);
    const g = new Uint8Array(gw * gh);
    // 1.1.0 マスごとに一番近い道（道の番号と、道の上の位置＝区間番号+割合）を覚えておく。道の上をなめらかに進むため
    const rd = new Int32Array(gw * gh).fill(-1), rpos = new Float32Array(gw * gh), rdist = new Float32Array(gw * gh).fill(1e9);
    // 多角形を行ごとに塗る（全国の地図でも速い）。f(今の値) → 新しい値
    function fill(pts, f) {
      for (let j = 0; j < gh; j++) {
        const y = (j + 0.5) * CELL, xs = [];
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
          const [xa, ya] = pts[a], [xb, yb] = pts[b];
          if ((ya > y) !== (yb > y)) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const i0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), i1 = Math.min(gw - 1, Math.floor(xs[k + 1] / CELL - 0.5));
          for (let i = i0; i <= i1; i++) g[j * gw + i] = f(g[j * gw + i]);
        }
      }
    }
    if (T.lands) for (const l of T.lands) fill(l.pts, () => 1); else g.fill(1);
    for (const s of T.seas) fill(s, () => 0);
    for (const m of T.mountains || []) fill(m.pts, (v) => (v ? 2 : 0));
    { /* 1.6.47 森：決まった乱数の模様で平地に置く（山のふもとほど多い）。どの端末でも同じ形になる */
      const hs = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
      const sm = (t) => t * t * (3 - 2 * t);
      const noise = (x, y, sc) => { const X = x / sc, Y = y / sc, i = Math.floor(X), j = Math.floor(Y), fx = sm(X - i), fy = sm(Y - j);
        const a = hs(i, j), b = hs(i + 1, j), c = hs(i, j + 1), d = hs(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
      const near = new Uint8Array(gw * gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) if (g[j * gw + i] === 2) for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < gw && b < gh) near[b * gw + a] = 1; }
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const q = j * gw + i; if (g[q] !== 1) continue;
        const v = noise(i, j, 9) * 0.65 + noise(i + 500, j + 500, 3) * 0.35 + (near[q] ? 0.12 : 0);
        if (v > 1 - SPEED.forestRate - 0.3) g[q] = 3;
      }
    }
    // 街道（海の上の部分は渡し船扱いで通れるようにする）
    const segs = new Map(); /* 2.2.1 マスごとに近くを通る道の区間を覚える（見た目どおりの幅で道かどうか決めるため） */
    (T.roads || []).forEach((r, ri) => { for (let k = 1; k < r.pts.length; k++) {
      const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k];
      { const tol = vis(r.rank || 2), a0 = Math.max(0, Math.floor((Math.min(ax, bx) - tol) / CELL)), a1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx) + tol) / CELL)), b0 = Math.max(0, Math.floor((Math.min(ay, by) - tol) / CELL)), b1 = Math.min(gh - 1, Math.floor((Math.max(ay, by) + tol) / CELL));
        for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) { const q = j * gw + i; let L = segs.get(q); if (!L) segs.set(q, L = []); L.push(ri, k); } }
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - ROAD_WIDTH) / CELL)), i1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx) + ROAD_WIDTH) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - ROAD_WIDTH) / CELL)), j1 = Math.min(gh - 1, Math.floor((Math.max(ay, by) + ROAD_WIDTH) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
          const px = (i + 0.5) * CELL, py = (j + 0.5) * CELL, d = distSeg(px, py, ax, ay, bx, by);
          if (d > ROAD_WIDTH) continue;
          const q = j * gw + i, v = g[q], t = v % 4, r0 = (v - t) / 4, rk = r.rank || 2;
          g[q] = t + 4 * (r0 ? Math.min(r0, rk) : rk); // 重なったら格の高い道
          if (d < rdist[q]) {
            const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
            rdist[q] = d; rd[q] = ri; rpos[q] = (k - 1) + (l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0);
          }
        }
    } });
    /* 1.6.47 拠点のまわり（半径2マス）は山・森でも平地にする（山の中の村にも出入りできる） */
    for (const st of SGK.DATA.settlements || []) { const ci0 = Math.floor(st.x / CELL), cj0 = Math.floor(st.y / CELL);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { if (di * di + dj * dj > 5) continue; const a = ci0 + di, b = cj0 + dj; if (a < 0 || b < 0 || a >= gw || b >= gh) continue; const q = b * gw + a, t = g[q] % 4; if (t >= 2) g[q] += 1 - t; } }
    grid = { g, gw, gh, rd, rpos, segs };
    return grid;
  }
  const G = () => grid || build();
  SIM.resetRoutes = () => { grid = null; }; // 0.40.0 道が増えたり広がったりしたら作り直す
  const cellAt = (x, y) => {
    const { g, gw, gh } = G();
    const i = Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    return g[j * gw + i];
  };
  const MULT = [], PASS = [];
  for (let r = 0; r < 4; r++) for (let t = 0; t < 4; t++) {
    MULT.push(r === 0 ? [SPEED.plain, SPEED.plain, SPEED.mountain, SPEED.forest][t] : t === 0 ? SPEED.ferry : t === 2 ? SPEED.roads[r] * SPEED.pass : SPEED.roads[r]);
    PASS.push(!(t === 0 && r === 0) && !(t === 2 && r === 0)); // 海と、道のない山は通れない
  }
  const TN = ['海', '平地', '山地', '森'];
  // 2.2.1 見た目の道の上にいれば道の格（1〜3）、いなければ 0。2kmマスの判定ではなく、道の線からの近さで決める
  const roadHere = (x, y) => {
    const { gw, gh, segs } = G(), i = Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(gh - 1, Math.floor(y / CELL))), L = segs.get(j * gw + i);
    if (!L) return 0; const RD2 = SGK.DATA.terrain.roads || []; let best = 0;
    for (let a = 0; a < L.length; a += 2) { const r = RD2[L[a]]; if (!r) continue; const rk = r.rank || 2; if (best && rk >= best) continue; const P = r.pts, k = L[a + 1]; if (distSeg(x, y, P[k - 1][0], P[k - 1][1], P[k][0], P[k][1]) <= vis(rk)) best = rk; }
    return best;
  };
  SIM.roadHere = roadHere;
  // 足もとの本当の地形：道の上なら道（格・峠・渡し）、外れていれば下の地形（山の中の道から外れたら山の速さ）
  const here = (x, y) => { const v = cellAt(x, y), t = v % 4, rk = v >= 4 ? roadHere(x, y) : 0; return t + 4 * rk; };
  SIM.terrainHere = (x, y) => { const v = here(x, y); return v >= 4 ? '街道' : TN[v]; };
  SIM.terrainAt = (x, y) => { const v = cellAt(x, y); return v >= 4 ? '街道' : TN[v]; };
  SIM.roadAt = (x, y) => RANK_NAME[Math.floor(cellAt(x, y) / 4)] || null; // 道の格の名前（道でなければ null）
  SIM.placeName = (x, y) => { const v = here(x, y), t = v % 4, r = (v - t) / 4; return r ? RANK_NAME[r] + (t === 0 ? '・渡し' : t === 2 ? '・峠' : t === 3 ? '・森' : '') : TN[t]; };
  SIM.speedAt = (x, y) => MULT[here(x, y)]; /* 2.2.1 見た目の道の上だけ速い */
  SIM.blockedAt = (x, y) => !PASS[cellAt(x, y)]; /* 1.6.47 */
  SIM.forestAt = (x, y) => cellAt(x, y) === 3; /* 1.6.47 道のない森 */
  SIM.terrainGrid = () => { const q = G(); return { g: q.g, gw: q.gw, gh: q.gh, CELL }; };
  SIM.cavMul = (tr) => { const n = SIM.troopCount ? SIM.troopCount(tr || {}) : 0; if (!n || !SIM.TROOPS) return 1; let c = 0; for (const k in tr) if (SIM.TROOPS[k] && SIM.TROOPS[k].cav) c += tr[k]; return 1 + 0.3 * c / n; };
  SIM.moveMul = (e, x, y) => { const v = SIM.speedAt(x, y); return SIM.forestAt(x, y) ? v / SIM.cavMul(e.troops || e.army) : v; }; /* 1.6.47 森では騎馬の速さが出ない */

  // 小さな二分ヒープ
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  };

  // (x0,y0) → (x1,y1) の通過点の列を返す（最後が目的地）。たどり着けなければ null
  // 1.6.15 行き過ぎて戻る動きをなくす：目的地（出発地）のすぐそばの点まで来たら、その先の寄り道を省く（道のり4km以内だけ見る）
  function trimBack(out, x0, y0, x1, y1) {
    const LIM = 4, dd = (q, x, y) => Math.hypot(q[0] - x, q[1] - y);
    if (out.length > 2) { // 終わり側
      let len = 0, k = -1, best = dd(out[out.length - 2], x1, y1);
      for (let i = out.length - 2; i >= 0 && len < LIM; i--) { const d = dd(out[i], x1, y1); if (d < best - 0.01) { best = d; k = i; } if (i > 0) len += dd(out[i], out[i - 1][0], out[i - 1][1]); }
      if (k >= 0 && best < 3) out.splice(k + 1, out.length - 2 - k);
    }
    if (out.length > 1) { // 始まり側
      let len = 0, k = -1, best = Infinity;
      for (let i = 0; i < out.length - 1 && len < LIM; i++) { const d = dd(out[i], x0, y0); if (d < best - 0.01) { best = d; k = i; } len += dd(out[i + 1], out[i][0], out[i][1]); }
      if (k > 0 && best < 3) out.splice(0, k);
    }
    /* 2.2.2 はじめの点が後ろ（次の点と逆向き）で近いときは、まっすぐ次の点へ向かう（通れるときだけ） */
    const passL = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4); for (let s2 = 1; s2 < n; s2++) if (!PASS[cellAt(ax + (bx - ax) * s2 / n, ay + (by - ay) * s2 / n)]) return false; return true; };
    while (out.length > 1) { const a = out[0], b = out[1]; if (dd(a, x0, y0) < 2.5 && (a[0] - x0) * (b[0] - a[0]) + (a[1] - y0) * (b[1] - a[1]) < 0 && passL(x0, y0, b[0], b[1])) out.shift(); else break; }
    /* 1.6.59 拠点の出入り：近く（6km以内）でぐるっと回るときは、見通せる所からまっすぐ入る（出る） */
    const clearL = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 0.4); for (let s2 = 1; s2 < n; s2++) { const x = ax + (bx - ax) * s2 / n, y = ay + (by - ay) * s2 / n; if (!PASS[cellAt(x, y)] || cellAt(x, y) % 4 === 0) return false; } return true; };
    const NEAR = 6;
    if (out.length > 1) { // 終わり側
      let len = 0;
      for (let i = out.length - 2; i >= 0; i--) { const nx = out[i + 1]; len += dd(out[i], nx[0], nx[1]); }
      let acc = 0, cut = -1;
      for (let i = 0; i < out.length - 1; i++) { const d = dd(out[i], x1, y1), rest = len - acc; if (d <= NEAR && rest > d * 1.15 + 0.3 && clearL(out[i][0], out[i][1], x1, y1)) { cut = i; break; } acc += dd(out[i + 1], out[i][0], out[i][1]); }
      if (cut >= 0) out.splice(cut + 1, out.length - cut - 1, [x1, y1]);
    }
    if (out.length > 1) { // 始まり側
      let acc = Math.hypot(out[0][0] - x0, out[0][1] - y0), cut = -1;
      for (let i = 0; i < out.length - 1; i++) { const d = dd(out[i], x0, y0); if (d > NEAR) break; if (acc > d * 1.15 + 0.3 && clearL(x0, y0, out[i][0], out[i][1])) cut = i; acc += dd(out[i + 1], out[i][0], out[i][1]); }
      if (cut > 0) out.splice(0, cut);
    }
    return out;
  }
  SIM.findPath = function (x0, y0, x1, y1) {
    const { g, gw, gh } = G();
    const ci = (x) => Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), cj = (y) => Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    const s = cj(y0) * gw + ci(x0), t = cj(y1) * gw + ci(x1);
    if (s === t) return [[x1, y1]];
    const best = SPEED.road;
    // 作業用の配列は使い回す（毎回作ると重い）。stamp が今回の番号でないマスは未訪問
    if (!buf || buf.n !== gw * gh) buf = { n: gw * gh, cost: new Float32Array(gw * gh), from: new Int32Array(gw * gh), stamp: new Uint32Array(gw * gh), done: new Uint32Array(gw * gh), run: 0 };
    const run = ++buf.run, { stamp, done } = buf, C = buf.cost, F = buf.from;
    const getC = (k) => (stamp[k] === run ? C[k] : Infinity);
    const h = (k) => Math.hypot((k % gw) - (t % gw), Math.floor(k / gw) - Math.floor(t / gw)) * CELL / best;
    const open = new Heap();
    stamp[s] = run; C[s] = 0; F[s] = -1; open.push(h(s), s);
    const DIR = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (open.a.length) {
      const k = open.pop()[1];
      if (k === t) { found = true; break; }
      if (done[k] === run) continue;
      done[k] = run;
      const i = k % gw, j = (k - i) / gw, mk = MULT[g[k]];
      for (const [di, dj, dl] of DIR) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
        const n = nj * gw + ni;
        if (!PASS[g[n]] && n !== t && PASS[g[k]]) continue; // 海・湖・道のない山（目的地のマスだけは岸辺として許す。通れない所にいるときは抜け出せる）
        if (g[n] === 0 && n !== t) continue;
        if (di && dj && !(g[k] >= 3 && g[n] >= 3) && (g[j * gw + ni] === 0 || g[nj * gw + i] === 0)) continue; // 岸の角を斜めにすり抜けない（渡し船の道どうしは斜めにつながってよい）
        const c = C[k] + (dl * CELL) / ((mk + (MULT[g[n]] || SPEED.plain)) / 2);
        if (c < getC(n)) { stamp[n] = run; C[n] = c; F[n] = k; open.push(c + h(n), n); }
      }
    }
    if (!found) return null;
    // マスの列 → 道のマスは本物の道筋（街道の線）にのせる。道でない所は見通せる所まで一直線（1.1.0）
    const cells = [];
    for (let k = t; k !== -1; k = F[k]) cells.push(k);
    cells.reverse();
    const { rd, rpos } = grid, R = SGK.DATA.terrain.roads || [];
    const cx = (k) => ((k % gw) + 0.5) * CELL, cy = (k) => (Math.floor(k / gw) + 0.5) * CELL;
    const isRoad = (k) => g[k] >= 3 && rd[k] >= 0;
    // 道 ri の位置 pos の座標
    const at = (ri, pos) => { const P = R[ri].pts, n = Math.min(P.length - 2, Math.max(0, Math.floor(pos))), f = pos - n; return [P[n][0] + (P[n + 1][0] - P[n][0]) * f, P[n][1] + (P[n + 1][1] - P[n][1]) * f]; };
    // 2.2.2 (x,y) にいちばん近い道 ri の上の位置（near のあたりだけ見る）。3km以上離れていれば null
    const proj = (ri, x, y, near) => {
      const P = R[ri].pts, n0 = Math.max(0, Math.floor(near) - 3), n1 = Math.min(P.length - 2, Math.floor(near) + 3); let bd = 3, bp = null;
      for (let n = n0; n <= n1; n++) { const [ax2, ay2] = P[n], [bx2, by2] = P[n + 1], dx = bx2 - ax2, dy = by2 - ay2, l = dx * dx + dy * dy, f = l ? Math.max(0, Math.min(1, ((x - ax2) * dx + (y - ay2) * dy) / l)) : 0, d = Math.hypot(x - ax2 - f * dx, y - ay2 - f * dy); if (d < bd) { bd = d; bp = n + f; } }
      return bp;
    };
    function clear(ax, ay, b, kind) {
      const bx = cx(b), by = cy(b), n = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL * 0.25));
      for (let s2 = 1; s2 <= n; s2++) {
        const x = ax + (bx - ax) * s2 / n, y = ay + (by - ay) * s2 / n;
        if (g[cj(y) * gw + ci(x)] !== kind) return false;
      }
      return true;
    }
    const pts = [];
    let ax = x0, ay = y0, i = 0;
    while (i < cells.length) {
      if (isRoad(cells[i])) {
        // 同じ道が続くあいだをひとまとめにし、その道の線（曲がり角の点も含む）をたどる
        const ri = rd[cells[i]]; let p0 = rpos[cells[i]];
        let j = i; while (j + 1 < cells.length && isRoad(cells[j + 1]) && rd[cells[j + 1]] === ri) j++;
        // 交差点で別の道のマスを1つだけかすめた時は、その寄り道をしない
        if (i === j && i > 0 && j + 1 < cells.length && isRoad(cells[i - 1]) && isRoad(cells[j + 1]) && rd[cells[i - 1]] === rd[cells[j + 1]]) { i++; continue; }
        let p1 = rpos[cells[j]];
        /* 2.2.2 出発・到着のマスでは、マスの真ん中ではなく本人（目的地）の位置を道に当てる（追いかけるたびに道を戻る動きをなくす） */
        if (i === 0) { const q = proj(ri, x0, y0, p0); if (q) p0 = q; }
        if (j === cells.length - 1) { const q = proj(ri, x1, y1, p1); if (q) p1 = q; }
        pts.push(at(ri, p0));
        if (p1 > p0) for (let v = Math.floor(p0) + 1; v < p1; v++) pts.push(R[ri].pts[v].slice());
        else for (let v = Math.ceil(p0) - 1; v > p1; v--) pts.push(R[ri].pts[v].slice());
        if (p1 !== p0) pts.push(at(ri, p1));
        [ax, ay] = pts[pts.length - 1]; i = j + 1;
      } else {
        // 道でない所：同じ地形のあいだは見通せる所まで一直線
        let j = i; while (j + 1 < cells.length && !isRoad(cells[j + 1])) j++;
        let a = i, kind = g[cells[i]];
        while (a < j) {
          let b2 = a + 1;
          while (b2 + 1 <= j && clear(ax, ay, cells[b2 + 1], kind)) b2++;
          if (b2 === j) break;
          pts.push([cx(cells[b2]), cy(cells[b2])]); ax = cx(cells[b2]); ay = cy(cells[b2]); kind = g[cells[b2]]; a = b2;
        }
        i = j + 1;
      }
    }
    // 目的地の町などは道の脇にあることもあるので、最後は目的地へ
    pts.push([x1, y1]);
    // ほとんど同じ点が続いたら1つにする
    const out = [];
    for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.05) out.push(q); }
    if (out.length > 1 && Math.hypot(out[out.length - 1][0] - x1, out[out.length - 1][1] - y1) > 0.05) out.push([x1, y1]);
    return trimBack(out, x0, y0, x1, y1);
  };

  // 道のりの長さ（km）と、かかる日数のめやす
  SIM.pathInfo = function (x0, y0, path, speed) {
    let km = 0, days = 0, px = x0, py = y0;
    for (const [x, y] of path || []) { const d = Math.hypot(x - px, y - py); km += d; days += d / (speed * SIM.speedAt((x + px) / 2, (y + py) / 2)); px = x; py = y; }
    return { km, days };
  };
})();
