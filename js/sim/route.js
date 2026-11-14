// 道のり：街道は速く、山は遅く、海と湖は通れない。行き先までの道筋を探す（ホストだけが使う）
(function () {
  const SIM = SGK.SIM;
  // 速さの倍率（数値はここで調整）
  // 0.40.0 道の格ごとの速さ。山の中の道（峠）は pass 倍、海の上の道（渡し船）は ferry
  const SPEED = { road: 1.8, plain: 1.0, mountain: 0.45, roads: [0, 1.8, 1.65, 1.5], pass: 0.7, ferry: 1.0 };
  const RANK_NAME = ['', '大街道', '街道', '脇道'];
  const CELL = 2;          // 道筋探しのマス目の大きさ（km）。全国の地図なので2kmマス
  const ROAD_WIDTH = 1.42; // 街道とみなす幅（中心からkm）。道が通るマスはすべて道になるよう √2 より少し広め（1.1.0）
  SIM.ROUTE_SPEED = SPEED;

  let grid = null, buf = null; // 値 = 地形(0=海 1=平地 2=山) + 3×道の格(0=なし 1=大街道 2=街道 3=脇道)
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
    // 街道（海の上の部分は渡し船扱いで通れるようにする）
    (T.roads || []).forEach((r, ri) => { for (let k = 1; k < r.pts.length; k++) {
      const [ax, ay] = r.pts[k - 1], [bx, by] = r.pts[k];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - ROAD_WIDTH) / CELL)), i1 = Math.min(gw - 1, Math.floor((Math.max(ax, bx) + ROAD_WIDTH) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - ROAD_WIDTH) / CELL)), j1 = Math.min(gh - 1, Math.floor((Math.max(ay, by) + ROAD_WIDTH) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        {
          const px = (i + 0.5) * CELL, py = (j + 0.5) * CELL, d = distSeg(px, py, ax, ay, bx, by);
          if (d > ROAD_WIDTH) continue;
          const q = j * gw + i, v = g[q], t = v % 3, r0 = (v - t) / 3, rk = r.rank || 2;
          g[q] = t + 3 * (r0 ? Math.min(r0, rk) : rk); // 重なったら格の高い道
          if (d < rdist[q]) {
            const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
            rdist[q] = d; rd[q] = ri; rpos[q] = (k - 1) + (l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0);
          }
        }
    } });
    grid = { g, gw, gh, rd, rpos };
    return grid;
  }
  const G = () => grid || build();
  SIM.resetRoutes = () => { grid = null; }; // 0.40.0 道が増えたり広がったりしたら作り直す
  const cellAt = (x, y) => {
    const { g, gw, gh } = G();
    const i = Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), j = Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
    return g[j * gw + i];
  };
  const MULT = [];
  for (let r = 0; r < 4; r++) for (let t = 0; t < 3; t++) MULT.push(r === 0 ? [SPEED.plain, SPEED.plain, SPEED.mountain][t] : t === 0 ? SPEED.ferry : t === 2 ? SPEED.roads[r] * SPEED.pass : SPEED.roads[r]);
  SIM.terrainAt = (x, y) => { const v = cellAt(x, y); return v >= 3 ? '街道' : ['海', '平地', '山地'][v]; };
  SIM.roadAt = (x, y) => RANK_NAME[Math.floor(cellAt(x, y) / 3)] || null; // 道の格の名前（道でなければ null）
  SIM.placeName = (x, y) => { const v = cellAt(x, y), t = v % 3, r = (v - t) / 3; return r ? RANK_NAME[r] + (t === 0 ? '・渡し' : t === 2 ? '・峠' : '') : ['海', '平地', '山地'][t]; };
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
        if (g[n] === 0 && n !== t) continue; // 海・湖（目的地のマスだけは岸辺として許す）
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
        const ri = rd[cells[i]], p0 = rpos[cells[i]];
        let j = i; while (j + 1 < cells.length && isRoad(cells[j + 1]) && rd[cells[j + 1]] === ri) j++;
        // 交差点で別の道のマスを1つだけかすめた時は、その寄り道をしない
        if (i === j && i > 0 && j + 1 < cells.length && isRoad(cells[i - 1]) && isRoad(cells[j + 1]) && rd[cells[i - 1]] === rd[cells[j + 1]]) { i++; continue; }
        const p1 = rpos[cells[j]];
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
