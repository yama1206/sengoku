// 1.6.48 陸地（海岸線）と街道を作って js/data/geo.js に書き出す。 node tools/gen_geo.js
// 海岸線：tools/coast.py（dataofjapan/land の japan.topojson から）→ tools/lands.json
// 街道：名のある街道（tools/roads_src.txt の拠点の並び）＋近い拠点どうしの脇道を、地形に沿って道筋探しでつなぐ
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ctx = { SGK: { RENDER: {} }, console, Math, JSON }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/config.js', 'js/data/world1560.js', 'js/data/villages.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const D = ctx.SGK.DATA, T = D.terrain, B = D.bounds;
const ll = (lat, lon) => ({ x: +((lon - 129.4) * 91).toFixed(2), y: +((41.6 - lat) * 111).toFixed(2) });
const LANDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'lands.json'), 'utf8'));
const NAMES = [['本州', 36.04, 137.05], ['九州', 32.75, 130.59], ['四国', 33.52, 133.22], ['佐渡', 38.03, 138.36], ['天草', 32.37, 130.17], ['淡路', 34.37, 134.83],
  ['隠岐', 36.24, 133.29], ['平戸', 33.3, 129.47], ['小豆島', 34.49, 134.26], ['壱岐', 33.78, 129.71], ['屋代島', 33.91, 132.31], ['伊豆大島', 34.73, 139.4], ['八丈島', 33.1, 139.8],
  ['長島', 32.17, 130.15], ['甑島', 31.7, 129.73], ['三宅島', 34.08, 139.52], ['能登島', 37.13, 136.97], ['大三島', 34.24, 132.99]];
const lands = LANDS.map((l) => { const n = NAMES.find((q) => Math.abs(q[1] - l.lat) < 0.02 && Math.abs(q[2] - l.lon) < 0.02); return { name: n ? n[0] : '島', pts: l.pts }; });

const inP = (x, y, p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const landOf = (x, y) => (T.seas.some((q) => inP(x, y, q)) ? -1 : lands.findIndex((l) => inP(x, y, l.pts)));
const dseg = (px, py, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l)) : 0; return [Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy), a[0] + t * dx, a[1] + t * dy]; };

// ---- 海に落ちた拠点を陸へ（いちばん近い岸から 0.5km 内側） ----
const MOVE = {};
const pinLand = (s) => {
  if (landOf(s.x, s.y) >= 0) return;
  let best = [1e9];
  for (const l of lands) { const p = l.pts; for (let i = 0; i < p.length; i++) { const r = dseg(s.x, s.y, p[i], p[(i + 1) % p.length]); if (r[0] < best[0]) best = r; } }
  const [, cx, cy] = best; let dx = cx - s.x, dy = cy - s.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  for (let k = 0.3; k < 3; k += 0.1) { const x = +(cx + dx * k).toFixed(2), y = +(cy + dy * k).toFixed(2); if (landOf(x, y) >= 0) { MOVE[s.id] = [x, y]; s.x = x; s.y = y; return; } }
  for (let r = 0.2; r < 4; r += 0.2) for (let a = 0; a < 24; a++) { const x = +(s.x + Math.cos(a * Math.PI / 12) * r).toFixed(2), y = +(s.y + Math.sin(a * Math.PI / 12) * r).toFixed(2); if (landOf(x, y) >= 0) { MOVE[s.id] = [x, y]; s.x = x; s.y = y; return; } }
  console.warn('陸に寄せられない', s.id);
};
D.settlements.forEach(pinLand);

// ---- マス目（route.js と同じ2km） ----
const CELL = 2, gw = Math.ceil(B.w / CELL), gh = Math.ceil(B.h / CELL), N = gw * gh;
const ter = new Uint8Array(N); // 0海 1平地 2山
function fill(pts, f) {
  for (let j = 0; j < gh; j++) {
    const y = (j + 0.5) * CELL, xs = [];
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y)) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya)); }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil(xs[k] / CELL - 0.5)), i1 = Math.min(gw - 1, Math.floor(xs[k + 1] / CELL - 0.5)); for (let i = i0; i <= i1; i++) ter[j * gw + i] = f(ter[j * gw + i]); }
  }
}
for (const l of lands) fill(l.pts, () => 1);
for (const s of T.seas) fill(s, () => 0);
for (const m of T.mountains) fill(m.pts, (v) => (v ? 2 : 0));
const ci = (x) => Math.max(0, Math.min(gw - 1, Math.floor(x / CELL))), cj = (y) => Math.max(0, Math.min(gh - 1, Math.floor(y / CELL)));
const cellOf = (s) => cj(s.y) * gw + ci(s.x);
for (const st of D.settlements) { const a0 = ci(st.x), b0 = cj(st.y); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { if (di * di + dj * dj > 5) continue; const a = a0 + di, b = b0 + dj; if (a < 0 || b < 0 || a >= gw || b >= gh) continue; const q = b * gw + a; if (ter[q] === 2) ter[q] = 1; } }
for (const st of D.settlements) if (ter[cellOf(st)] === 0) ter[cellOf(st)] = 1;

// ---- 道筋探し ----
// 2.19.0 cost は Float64（Float32 だと丸めで「古い候補」と見なされ、たどり着けないマスが出ていた）
const COST = [Infinity, 1, 3.2], SEA = 5, REUSE = 0.45;
const net = new Uint8Array(N); // 道が通っているマス
const cost = new Float64Array(N), from = new Int32Array(N), stamp = new Uint32Array(N); let run = 0;
function Heap() { this.a = []; }
Heap.prototype.push = function (k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } };
Heap.prototype.pop = function () { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; };
const DIR = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
const stepC = (k, sea, reuse) => { const t = ter[k]; let c = t === 0 ? (sea ? SEA : Infinity) : COST[t]; if (reuse && net[k]) c *= REUSE; return c; };
function find(s, t, { sea = false, reuse = true, maxKm = 1e9 } = {}) {
  run++; const open = new Heap(), tx = t % gw, ty = Math.floor(t / gw), h = (k) => Math.hypot((k % gw) - tx, Math.floor(k / gw) - ty) * (reuse ? REUSE : 1);
  stamp[s] = run; cost[s] = 0; from[s] = -1; open.push(h(s), s);
  const sx = s % gw, sy = Math.floor(s / gw), lim = maxKm / CELL;
  while (open.a.length) {
    const [f, k] = open.pop(); if (k === t) break;
    if (f - h(k) > cost[k] + 1e-6) continue;
    const i = k % gw, j = (k - i) / gw;
    for (const [di, dj, dl] of DIR) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= gw || nj >= gh) continue;
      if (Math.abs(ni - sx) + Math.abs(nj - sy) > lim * 1.6 && Math.abs(ni - tx) + Math.abs(nj - ty) > lim * 1.6) continue;
      const n = nj * gw + ni, sc = (stepC(k, sea, reuse) + stepC(n, sea, reuse)) / 2; if (sc === Infinity) continue;
      if (di && dj && (ter[j * gw + ni] === 0 || ter[nj * gw + i] === 0) && !sea) continue; // 海の角をすり抜けない
      const c = cost[k] + sc * dl;
      if (stamp[n] !== run || c < cost[n]) { stamp[n] = run; cost[n] = c; from[n] = k; open.push(c + h(n), n); }
    }
  }
  if (stamp[t] !== run) return null;
  const cells = []; for (let k = t; k !== -1; k = from[k]) cells.push(k); cells.reverse();
  let walk = 0; for (let i = 1; i < cells.length; i++) { const a = cells[i - 1], b = cells[i]; walk += ((stepC(a, true, false) + stepC(b, true, false)) / 2) * (a % gw !== b % gw && Math.floor(a / gw) !== Math.floor(b / gw) ? Math.SQRT2 : 1); }
  return { cells, walk: walk * CELL };
}

// ---- 道の候補 ----
const byId = {}; D.settlements.forEach((s) => (byId[s.id] = s));
const tops = D.settlements.filter((s) => !s.castle);
const SRC = fs.readFileSync(path.join(__dirname, 'roads_src.txt'), 'utf8');
const sb = { ROADS: null, poly: (p) => p, console };
vm.createContext(sb); vm.runInContext(SRC.replace('const ROADS =', 'ROADS =').replace(/\n\s*for \(const \[a, b\] of (\[[\s\S]*?\]\])\) ROADS\.push[^\n]*/, '\nPAIRS = $1;'), sb);
const MAJOR = ['東海道', '東海道（東）', '中山道', '中山道（東）', '北陸道', '北陸道（越前・加賀）', '北陸道（越後）', '北国街道', '山陰道', '山陽道', '西国街道', '西海道', '奥州街道', '甲州道', '美濃路'];
const near = (lat, lon, not) => { const p = ll(lat, lon); let b = null, bd = 15; for (const s of tops) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd && !not.includes(s.id)) { bd = d; b = s.id; } } return b; };
const EDGES = []; // { a, b, name, rank, sea }
for (const r of sb.ROADS) {
  if (/渡し/.test(r.name)) continue; // 渡しは下で作り直す
  if (r.strict) { // 2.19.0 途中の [緯度, 経度] を必ず通る道（ほかの道に寄らず、その道筋で新しく敷く）
    const ids = r.via.filter((v) => typeof v === 'string');
    EDGES.push({ a: ids[0], b: ids[ids.length - 1], name: r.name, rank: MAJOR.includes(r.name) ? 1 : 2, through: r.via.map((v) => (typeof v === 'string' ? v : ll(v[0], v[1]))) });
    continue;
  }
  const ids = r.via.filter((v) => typeof v === 'string');
  const v = r.via.slice();
  if (typeof v[0] !== 'string') { const n = near(v[0][0], v[0][1], ids); if (n) ids.unshift(n); }
  if (typeof v[v.length - 1] !== 'string') { const n = near(v[v.length - 1][0], v[v.length - 1][1], ids); if (n) ids.push(n); }
  const rank = MAJOR.includes(r.name) ? 1 : 2;
  for (let i = 1; i < ids.length; i++) if (ids[i] !== ids[i - 1]) EDGES.push({ a: ids[i - 1], b: ids[i], name: r.name, rank, sea: true });
}
// 渡し（海を渡る道）
const sado = ll(38.04, 138.25); byId.sado_m = { id: 'sado_m', x: sado.x, y: sado.y }; pinLand(byId.sado_m);
for (const [a, b, name, rank] of [['hyogo', 'sumoto', '淡路の渡し', 2], ['sumoto', 'shozui', '鳴門の渡し', 2], ['okayama', 'utazu', '讃岐の渡し', 2], ['onomichi', 'kurushima', '芸予の渡し', 2],
  ['jizogatake', 'funai', '豊予の渡し', 2], ['akamagaseki', 'moji', '関門の渡し', 1], ['teradomari', 'sado_m', '佐渡の渡し', 2]]) EDGES.push({ a, b, name, rank, sea: true, ferry: true });
// 脇道の候補：近い拠点（45km以内・近い順に5つ）と、前からあった脇道
const cand = [];
for (const a of tops) for (const b of tops.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < 45).sort((p, q) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(a.x - q.x, a.y - q.y)).slice(0, 5)) cand.push([a.id, b.id]);
for (const [a, b] of sb.PAIRS) if (byId[a] && byId[b]) cand.push([a, b]);
const seen = new Set(), cand2 = [];
for (const [a, b] of cand) { const k = a < b ? a + '|' + b : b + '|' + a; if (!seen.has(k)) { seen.add(k); cand2.push([a, b]); } }
cand2.sort((p, q) => Math.hypot(byId[p[0]].x - byId[p[1]].x, byId[p[0]].y - byId[p[1]].y) - Math.hypot(byId[q[0]].x - byId[q[1]].x, byId[q[0]].y - byId[q[1]].y));

// ---- 道を敷く ----
const adj = {}, laid = [];
const link = (a, b, w) => { (adj[a] = adj[a] || []).push([b, w]); (adj[b] = adj[b] || []).push([a, w]); };
function gdist(a, b, lim) { // 今ある道で a→b の歩く手間（lim を超えたら打ち切り）
  const d = { [a]: 0 }, h = new Heap(); h.push(0, a);
  while (h.a.length) { const [c, k] = h.pop(); if (k === b) return c; if (c > d[k] || c > lim) continue; for (const [n, w] of adj[k] || []) { const nc = c + w; if (d[n] == null || nc < d[n]) { d[n] = nc; h.push(nc, n); } } }
  return Infinity;
}
function lay(e, p) { for (const k of p.cells) net[k] = 1; laid.push(Object.assign({}, e, { cells: p.cells })); link(e.a, e.b, p.walk); }
for (const rk of [1, 2]) for (const e of EDGES.filter((x) => x.rank === rk || (x.ferry && rk === 2 && x.rank === 1))) {
  if (e._done) continue; e._done = true;
  const A = byId[e.a], Bb = byId[e.b]; if (!A || !Bb) { console.warn('no', e.a, e.b); continue; }
  let p;
  if (e.through) { // 途中の点を順に、ほかの道に寄らずにつなぐ
    const cs = e.through.map((v) => cellOf(typeof v === 'string' ? byId[v] : v)); p = { cells: [cs[0]], walk: 0 };
    for (let i = 1; i < cs.length && p; i++) {
      let q = null; // まれに道筋探しがそのマスへ届かないことがあるので、となりのマスも試す（端の拠点のマスは動かさない）
      for (const o of i === cs.length - 1 ? [0] : [0, 1, -1, gw, -gw, gw + 1, -gw - 1]) { q = find(p.cells[p.cells.length - 1], cs[i] + o, { reuse: false }); if (q) break; }
      if (!q) { p = null; break; } p.cells.push(...q.cells.slice(1)); p.walk += q.walk;
    }
  } else p = find(cellOf(A), cellOf(Bb), { sea: !!e.ferry }) || find(cellOf(A), cellOf(Bb), { sea: true });
  if (!p) { console.warn('道なし', e.name, e.a, e.b); continue; }
  lay(e, p);
}
let nW = 0;
for (const [a, b] of cand2) {
  const A = byId[a], Bb = byId[b], st = Math.hypot(A.x - Bb.x, A.y - Bb.y);
  const free = find(cellOf(A), cellOf(Bb), { reuse: false, maxKm: st * 1.6 + 6 }); if (!free || free.walk > st * 2.4 + 6) continue;
  if (gdist(a, b, free.walk * 1.5) <= free.walk * 1.45) continue; // 今の道で十分
  const p = find(cellOf(A), cellOf(Bb), { maxKm: st * 1.6 + 6 }); if (!p) continue;
  lay({ a, b, name: '脇道', rank: 3 }, p); nW++;
}
// つながっていない拠点を近くへ
for (let pass = 0; pass < 3; pass++) for (const a of tops) {
  if ((adj[a.id] || []).length) continue;
  const bs = tops.filter((b) => b !== a && adj[b.id]).sort((p, q) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(a.x - q.x, a.y - q.y)).slice(0, 3);
  for (const b of bs) { const p = find(cellOf(a), cellOf(b), { maxKm: 120 }); if (p) { lay({ a: a.id, b: b.id, name: '脇道', rank: 3 }, p); nW++; break; } }
}
// 島ごと・地続きでばらばらのまとまりをつなぐ（同じ陸地の中だけ）
{
  const comp = {}; let nc = 0;
  for (const s of tops) { if (comp[s.id] != null) continue; const st = [s.id]; comp[s.id] = nc; while (st.length) { const k = st.pop(); for (const [n] of adj[k] || []) if (comp[n] == null) { comp[n] = nc; st.push(n); } } nc++; }
  const sizes = {}; for (const s of tops) sizes[comp[s.id]] = (sizes[comp[s.id]] || 0) + 1;
  const main = +Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a])[0];
  for (const c of Object.keys(sizes).map(Number)) {
    if (c === main) continue;
    let best = null;
    for (const a of tops.filter((s) => comp[s.id] === c)) for (const b of tops.filter((s) => comp[s.id] !== c)) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (!best || d < best[2]) best = [a, b, d]; }
    if (!best) continue;
    const p = find(cellOf(best[0]), cellOf(best[1]), { maxKm: best[2] * 2 + 20 });
    if (p) { lay({ a: best[0].id, b: best[1].id, name: '脇道', rank: 3 }, p); nW++; } else console.warn('孤立', tops.filter((s) => comp[s.id] === c).map((s) => s.name).join(','));
  }
}

// ---- マスの道 → なめらかな線 ----
const nodeOf = {}; for (const s of tops) nodeOf[cellOf(s)] = s; nodeOf[cellOf(byId.sado_m)] = byId.sado_m;
const G = new Map(); const addG = (a, b) => { if (!G.has(a)) G.set(a, new Set()); G.get(a).add(b); };
for (const e of laid) for (let i = 1; i < e.cells.length; i++) { addG(e.cells[i - 1], e.cells[i]); addG(e.cells[i], e.cells[i - 1]); }
const special = (k) => !!nodeOf[k] || (G.get(k) || new Set()).size !== 2;
const cc = (k) => [((k % gw) + 0.5) * CELL, (Math.floor(k / gw) + 0.5) * CELL];
const posOf = (k) => (nodeOf[k] ? [nodeOf[k].x, nodeOf[k].y] : cc(k));
const isSeaPt = (x, y) => ter[cj(y) * gw + ci(x)] === 0;
function simplify(P, sea) {
  // ならす（端は動かさない）
  let Q = P.map((p) => p.slice());
  for (let it = 0; it < 3; it++) Q = Q.map((p, i) => { if (i === 0 || i === Q.length - 1) return p; const a = Q[i - 1], b = Q[i + 1], np = [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; return !sea && isSeaPt(np[0], np[1]) ? p : np; });
  const keep = new Array(Q.length).fill(false); keep[0] = keep[Q.length - 1] = true;
  const st = [[0, Q.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); if (b - a < 2) continue;
    let m = -1, md = 0; for (let i = a + 1; i < b; i++) { const d = dseg(Q[i][0], Q[i][1], Q[a], Q[b])[0]; if (d > md) { md = d; m = i; } }
    let bad = md > 0.45;
    if (!bad && !sea) { const n = Math.ceil(Math.hypot(Q[b][0] - Q[a][0], Q[b][1] - Q[a][1]) / 0.4); for (let s = 1; s < n && !bad; s++) if (isSeaPt(Q[a][0] + ((Q[b][0] - Q[a][0]) * s) / n, Q[a][1] + ((Q[b][1] - Q[a][1]) * s) / n)) bad = true; if (bad && m < 0) m = (a + b) >> 1; }
    if (bad) { keep[m] = true; st.push([a, m], [m, b]); }
  }
  return Q.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]);
}
const chainMemo = new Map();
function chain(c0, c1) { // c0（分かれ目）から c1 の向きへ次の分かれ目まで
  const key = c0 + '>' + c1; if (chainMemo.has(key)) return chainMemo.get(key);
  const cells = [c0, c1]; let prev = c0, cur = c1;
  while (!special(cur)) { const nx = [...G.get(cur)].find((n) => n !== prev); prev = cur; cur = nx; cells.push(cur); }
  const P = cells.map(posOf), sea = cells.some((k) => ter[k] === 0);
  const S = simplify(P, sea), r = { cells, pts: S };
  chainMemo.set(key, r); chainMemo.set(cur + '>' + cells[cells.length - 2], { cells: cells.slice().reverse(), pts: S.slice().reverse() });
  return r;
}
const roads = [];
for (const e of laid) {
  const C = e.cells; let pts = [posOf(C[0])], i = 0;
  while (i < C.length - 1) { const ch = chain(C[i], C[i + 1]); pts = pts.concat(ch.pts.slice(1)); i += ch.cells.length - 1; }
  pts[0] = [byId[e.a].x, byId[e.a].y]; pts[pts.length - 1] = [byId[e.b].x, byId[e.b].y];
  roads.push({ name: e.name, rank: e.rank, pts });
}
// ---- 書き出し ----
const R1 = (a) => JSON.stringify(a);
let out = `// 1.6.48 自動生成（tools/gen_geo.js）。手で直さないこと\n// 陸地：国土の海岸線（dataofjapan/land）を間引いたもの。街道：地形に沿って道筋探しでつないだもの\n(function () {\n  const D = SGK.DATA, T = D.terrain;\n`;
out += `  T.lands = [\n${lands.map((l) => `    { name: ${R1(l.name)}, pts: ${R1(l.pts)} },`).join('\n')}\n  ];\n`;
out += `  const MOVE = ${R1(MOVE)}; // 海岸線に合わせて陸へ寄せた拠点\n  for (const s of D.settlements) if (MOVE[s.id]) { s.x = MOVE[s.id][0]; s.y = MOVE[s.id][1]; }\n`;
out += `  T.roads = [\n${roads.map((r) => `    { name: ${R1(r.name)}, rank: ${r.rank}, pts: ${R1(r.pts)} },`).join('\n')}\n  ];\n})();\n`;
fs.writeFileSync(path.join(ROOT, 'js/data/geo.js'), out);
console.log('lands', lands.length, 'moved', Object.keys(MOVE).length, 'roads', roads.length, '(脇道', nW + ')', 'pts', roads.reduce((a, r) => a + r.pts.length, 0), 'bytes', out.length);
