// 道のり：街道は速く、山は遅く、海と湖は通れない。行き先までの道筋を探す（ホストだけが使う）
(function () {
  const SIM = SGK.SIM;
  // 速さの倍率（数値はここで調整）
  const SPEED = { road: 1.6, plain: 1.0, mountain: 0.45 };
  const CELL = 1;          // 道筋探しのマス目の大きさ（km）
  const ROAD_WIDTH = 0.8;  // 街道とみなす幅（中心からkm）
  SIM.ROUTE_SPEED = SPEED;

  let grid = null; // 0=海 1=平地 2=山 3=街道
  function distSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  function build() {
    const T = SGK.DATA.terrain, B = SGK.DATA.bounds;
    const gw = Math.ceil(B.w / CELL), gh = Math.ceil(B.h / CELL);
    const g = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
      g[j * gw + i] = SIM.isSea(x, y) ? 0 : (T.mountains || []).some((m) => SIM.pointInPoly(x, y, m.pts)) ? 2 : 1;
    }
    // 街道（海の上の部分は渡し船扱いで通れるようにする）
    for (const r of T.roads || []) for (let k = 1; k < r.pts.length; k++) {
      const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - ROAD_WIDTH) / CELL)), i1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx) + ROAD_WIDTH) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - ROAD_WIDTH) / CELL)), j1 = Math.min(gh - 1, Math.floor((Math.max(ay, by) + ROAD_WIDTH) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        if (distSeg((i + 0.5) * CELL, (j + 0.5) * CELL, ax, ay, bx, by) <= ROAD_WIDTH) g[j * gw + i] = 3;
    }
    grid = { g, gw, gh };
    return grid;
  }
  const G = () => grid || build();
  const cellAt = (x, y) => {
    const { g, gw, gh } = G();
    const i = Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    return g[j * gw + i];
  };
  const MULT = [SPEED.plain, SPEED.plain, SPEED.mountain, SPEED.road];
  SIM.terrainAt = (x, y) => ['海', '平地', '山地', '街道'][cellAt(x, y)];
  SIM.speedAt = (x, y) => MULT[cellAt(x, y)];

  // 小さな二分ヒープ
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  };

  // (x0,y0) → (x1,y1) の通過点の列を返す（最後が目的地）。たどり着けなければ null
  SIM.findPath = function (x0, y0, x1, y1) {
    const { g, gw, gh } = G();
    const ci = (x) => Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), cj = (y) => Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    const s = cj(y0) * gw + ci(x0), t = cj(y1) * gw + ci(x1);
    if (s === t) return [[x1, y1]];
    const best = SPEED.road;
    const cost = new Float32Array(gw * gh).fill(Infinity), from = new Int32Array(gw * gh).fill(-1);
    const h = (k) => Math.hypot((k % gw) - (t % gw), Math.floor(k / gw) - Math.floor(t / gw)) * CELL / best;
    const open = new Heap();
    cost[s] = 0; open.push(h(s), s);
    const DIR = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    const done = new Uint8Array(gw * gh);
    let found = false;
    while (open.a.length) {
      const k = open.pop()[1];
      if (k === t) { found = true; break; }
      if (done[k]) continue;
      done[k] = 1;
      const i = k % gw, j = (k - i) / gw, mk = MULT[g[k]];
      for (const [di, dj, dl] of DIR) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
        const n = nj * gw + ni;
        if (g[n] === 0 && n !== t) continue; // 海・湖（目的地のマスだけは岸辺として許す）
        if (di && dj && (g[j * gw + ni] === 0 || g[nj * gw + i] === 0)) continue; // 岸の角を斜めにすり抜けない
        const c = cost[k] + (dl * CELL) / ((mk + (MULT[g[n]] || SPEED.plain)) / 2);
        if (c < cost[n]) { cost[n] = c; from[n] = k; open.push(c + h(n), n); }
      }
    }
    if (!found) return null;
    // マスの列 → 同じ地形のあいだは見通せる所まで一直線にする（斜めのギザギザをなくす）
    const cells = [];
    for (let k = t; k !== -1; k = from[k]) cells.push(k);
    cells.reverse();
    const cx = (k) => ((k % gw) + 0.5) * CELL, cy = (k) => (Math.floor(k / gw) + 0.5) * CELL;
    // a から b へまっすぐ進んでも、通るマスがすべて a と同じ地形か
    function clear(ax, ay, b, kind) {
      const bx = cx(b), by = cy(b), n = Math.ceil(Math.hypot(bx - ax, by - ay) / (CELL * 0.25));
      for (let s2 = 1; s2 <= n; s2++) {
        const x = ax + (bx - ax) * s2 / n, y = ay + (by - ay) * s2 / n;
        if (g[cj(y) * gw + ci(x)] !== kind) return false;
      }
      return true;
    }
    const pts = [];
    let ax = x0, ay = y0, ak = cells[0], i = 0;
    while (i < cells.length - 1) {
      let j = i + 1;
      while (j + 1 < cells.length && clear(ax, ay, cells[j + 1], g[ak])) j++;
      if (j === cells.length - 1) break;
      pts.push([cx(cells[j]), cy(cells[j])]);
      ax = cx(cells[j]); ay = cy(cells[j]); ak = cells[j]; i = j;
    }
    // 最後の区間も、見通せるなら目的地へ直行
    pts.push([x1, y1]);
    return pts;
  };

  // 道のりの長さ（km）と、かかる日数のめやす
  SIM.pathInfo = function (x0, y0, path, speed) {
    let km = 0, days = 0, px = x0, py = y0;
    for (const [x, y] of path || []) { const d = Math.hypot(x - px, y - py); km += d; days += d / (speed * SIM.speedAt((x + px) / 2, (y + py) / 2)); px = x; py = y; }
    return { km, days };
  };
})();
