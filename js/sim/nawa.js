// 2.12.0 縄張り（城の形）：城を「パーツ」の組み合わせで持つ。当たり判定・兵の道さがし・3D・2D はみなここから作る
//  （城の種類ごとの形・有名な城・自分で作る城は、どれもこのパーツの並びで表す）
//  A：地面 [種類, 形]。種類 k 曲輪・m 水堀（通れない）・d 空堀（通れるが遅い）・s 急な斜面・b 土橋・r 道（斜面でも速く歩ける）・l 陸地（何もない地面に戻す）
//     ・K 守る区画（見えない。最初の K が本丸。守り手はそれぞれの区画を守る）
//     形 ['o',x,y,r,ri]＝円（ri があれば輪）・['q',x,y,r0,r1,a0,da]＝輪の一部・['p',x,y,x,y,...]＝多角形・['P',[x,y,...],[x,y,...]]＝穴あきの多角形。後のものが前のものを上書きする
//  W：塀 ['l',x1,y1,x2,y2,種類]＝まっすぐ・['a',x,y,r,a0,da,種類]＝弧。種類 i＝石垣に土塀・d＝土塁に土塀・k＝柵（矢は抜ける）
//  E：高さ ['m',x,y,r,h]＝山（まん中が h m）・['f',形,h,bw]＝平らにならした所（高さ h、まわり bw m で元の地面へ。曲輪・切岸）
//  G：門 [x,y,a,w,id]（a＝塀に直角の向き、w＝幅、id の末尾 o 大手・k 搦手・h 本丸・s そのほか）。門と重なる塀は自動で切る
//  T：建物 [種類,x,y,a]（T 天守・y 櫓）。M：[本丸の中心x, y, 攻め手の来る向き]
//  戦場の ter に { k:'c', ... } として入れる（参加者にもそのまま届く）
(function () {
  const SIM = SGK.SIM, PI = Math.PI, CS = 2, BK = 8, PAD = 24;
  const AC = SIM.NAWA_AC = { k: 1, m: 2, d: 3, s: 4, b: 5, r: 6, l: 0 };
  const WT = () => SIM.WALL_T || 0.8;
  const pm = (a) => ((a % (2 * PI)) + 2 * PI) % (2 * PI);
  const nrm = (a) => { a = pm(a); return a > PI ? a - 2 * PI : a; };
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

  // ---- 形 ----
  function inSh(s, x, y) {
    if (s[0] === 'o') { const d = Math.hypot(x - s[1], y - s[2]); return d < s[3] && !(s[4] && d < s[4]); }
    if (s[0] === 'q') { const d = Math.hypot(x - s[1], y - s[2]); return d >= s[3] && d <= s[4] && pm(Math.atan2(y - s[2], x - s[1]) - s[5]) <= s[6]; }
    if (s[0] === 'P') { let c = false; for (let k = 1; k < s.length; k++) if (inSh(['p'].concat(s[k]), x, y)) c = !c; return c; }
    let c = false;
    for (let i = 1, j = s.length - 2; i < s.length; j = i, i += 2) { const xi = s[i], yi = s[i + 1], xj = s[j], yj = s[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
    return c;
  }
  function boxSh(s) {
    if (s[0] === 'o') return [s[1] - s[3], s[2] - s[3], s[1] + s[3], s[2] + s[3]];
    if (s[0] === 'q') return [s[1] - s[4], s[2] - s[4], s[1] + s[4], s[2] + s[4]];
    if (s[0] === 'P') return boxSh(['p'].concat(s[1]));
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (let i = 1; i < s.length; i += 2) { a = Math.min(a, s[i]); c = Math.max(c, s[i]); b = Math.min(b, s[i + 1]); d = Math.max(d, s[i + 1]); }
    return [a, b, c, d];
  }
  SIM.nawaInShape = inSh;
  function wallSegs(w) {
    if (w[0] === 'l') return [[w[1], w[2], w[3], w[4], w[5] || 'i']];
    const [, x, y, r, a0, da] = w, st = w[6] || 'i', n = Math.max(1, Math.ceil((da * r) / 4)), o = [];
    for (let i = 0; i < n; i++) { const p = a0 + (da * i) / n, q = a0 + (da * (i + 1)) / n; o.push([x + Math.cos(p) * r, y + Math.sin(p) * r, x + Math.cos(q) * r, y + Math.sin(q) * r, st]); }
    return o;
  }
  const mkGate = (x, y, a, w, id) => { const nx = Math.cos(a), ny = Math.sin(a), ux = -ny, uy = nx; return { x, y, a, w, id, nx, ny, ux, uy, x1: x - ux * w / 2, y1: y - uy * w / 2, x2: x + ux * w / 2, y2: y + uy * w / 2, len: w, cells: [] }; };
  function cutByGates(raw, gates) { // 門と重なる所の塀を切る
    const out = [];
    for (const [x1, y1, x2, y2, st] of raw) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); if (L < 0.05) continue;
      const ux = dx / L, uy = dy / L; let iv = [[0, L]];
      for (const g of gates) {
        if (Math.abs(ux * g.nx + uy * g.ny) > 0.5) continue;
        const px = g.x - x1, py = g.y - y1; if (Math.abs(px * uy - py * ux) > 1.2) continue;
        const c = px * ux + py * uy, a = c - g.w / 2, b = c + g.w / 2; if (b < 0.3 || a > L - 0.3) continue;
        const nv = []; for (const [p, q] of iv) { if (b <= p || a >= q) { nv.push([p, q]); continue; } if (a - p > 0.3) nv.push([p, a]); if (q - b > 0.3) nv.push([b, q]); }
        iv = nv;
      }
      for (const [p, q] of iv) out.push({ x1: x1 + ux * p, y1: y1 + uy * p, x2: x1 + ux * q, y2: y1 + uy * q, st, ux, uy, len: q - p });
    }
    return out;
  }

  // ---- 小さな道具 ----
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (k, v) { const K = this.k, V = this.v; let i = K.length; K.push(k); V.push(v); while (i > 0) { const p = (i - 1) >> 1; if (V[p] <= v) break; K[i] = K[p]; V[i] = V[p]; i = p; } K[i] = k; V[i] = v; };
  Heap.prototype.pop = function () { const K = this.k, V = this.v, k = K[0]; this.lv = V[0]; const lk = K.pop(), lv = V.pop(); if (K.length) { let i = 0; const n = K.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && V[c + 1] < V[c]) c++; if (V[c] >= lv) break; K[i] = K[c]; V[i] = V[c]; i = c; } K[i] = lk; V[i] = lv; } return k; };
  const segHit = (ax, ay, bx, by, cx, cy, dx, dy) => { const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy, den = rx * sy - ry * sx; if (Math.abs(den) < 1e-9) return false; const t = ((cx - ax) * sy - (cy - ay) * sx) / den, u = ((cx - ax) * ry - (cy - ay) * rx) / den; return t > 0 && t < 1 && u >= 0 && u <= 1; };
  const ptSeg = (sg, x, y) => { const t = Math.max(0, Math.min(sg.len, (x - sg.x1) * sg.ux + (y - sg.y1) * sg.uy)); return [sg.x1 + sg.ux * t, sg.y1 + sg.uy * t]; };
  const dSeg = (sg, x, y) => { const p = ptSeg(sg, x, y); return Math.hypot(x - p[0], y - p[1]); };
  const segSeg = (sg, ax, ay, bx, by) => (segHit(ax, ay, bx, by, sg.x1, sg.y1, sg.x2, sg.y2) ? 0 : Math.min(dSeg(sg, ax, ay), dSeg(sg, bx, by), (() => { const l = Math.hypot(bx - ax, by - ay) || 1, o = { x1: ax, y1: ay, ux: (bx - ax) / l, uy: (by - ay) / l, len: l }; return Math.min(dSeg(o, sg.x1, sg.y1), dSeg(o, sg.x2, sg.y2)); })()));
  /* 門：G＝{ gs: 門の残りの強さ, side: 通る者の側, cs: 守り手の側 }。閉じた門はだれも通れない。守り手は内側の門（本丸の門など）は開けて通れる。外の門（大手・搦手）は破られるまで閉じたまま */
  const gOpen = (id, G) => !id || !G || !G.gs || !(G.gs[id] > 0) || (G.side && G.side === G.cs && !/[ok]$/.test(id));

  // ---- パーツから当たり判定・マス目を作る ----
  function build(c) {
    const N = { id: c.id, gates: [], towers: (c.T || []).slice(), M: c.M ? { x: c.M[0], y: c.M[1], aF: c.M[2] } : null, A: c.A || [], waits: {}, gf: [], goal: new Map() };
    for (const [x, y, a, w, id] of c.G || []) N.gates.push(mkGate(x, y, a, w, id));
    let raw = []; for (const w of c.W || []) raw = raw.concat(wallSegs(w));
    N.segs = cutByGates(raw, N.gates);
    N.K = N.A.filter((a) => a[0] === 'K').map((a) => a[1]);
    N.E = c.E || [];
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const ext = (a, b, c2, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c2); y1 = Math.max(y1, d); };
    for (const [, s] of N.A) ext(...boxSh(s));
    for (const s of N.segs) ext(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.max(s.x1, s.x2), Math.max(s.y1, s.y2));
    for (const g of N.gates) ext(g.x - g.w, g.y - g.w, g.x + g.w, g.y + g.w);
    for (const e of N.E) if (e[0] === 'm') ext(e[1] - e[3], e[2] - e[3], e[1] + e[3], e[2] + e[3]); else ext(...boxSh(e[1]));
    if (x0 > x1) return null;
    N.x0 = Math.floor((x0 - PAD) / CS) * CS; N.y0 = Math.floor((y0 - PAD) / CS) * CS;
    const W = (N.W = Math.ceil((x1 + PAD - N.x0) / CS)), H = (N.H = Math.ceil((y1 + PAD - N.y0) / CS)), n = W * H;
    N.x1 = N.x0 + W * CS; N.y1 = N.y0 + H * CS;
    const ar = (N.ar = new Uint8Array(n)), kin = (N.kin = new Uint8Array(n)), nav = (N.nav = new Uint8Array(n)), gi = (N.gi = new Int16Array(n).fill(-1));
    for (const [code, s] of N.A) {
      const [a, b, c2, d] = boxSh(s), i0 = Math.max(0, Math.floor((a - N.x0) / CS)), i1 = Math.min(W - 1, Math.ceil((c2 - N.x0) / CS)), j0 = Math.max(0, Math.floor((b - N.y0) / CS)), j1 = Math.min(H - 1, Math.ceil((d - N.y0) / CS));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (inSh(s, N.x0 + (i + 0.5) * CS, N.y0 + (j + 0.5) * CS)) { if (code !== 'K') ar[j * W + i] = AC[code] || 0; }
    }
    for (let q = N.K.length - 1; q >= 0; q--) { const s = N.K[q], [a, b, c2, d] = boxSh(s); for (let j = Math.max(0, Math.floor((b - N.y0) / CS)); j <= Math.min(H - 1, Math.ceil((d - N.y0) / CS)); j++) for (let i = Math.max(0, Math.floor((a - N.x0) / CS)); i <= Math.min(W - 1, Math.ceil((c2 - N.x0) / CS)); i++) if (inSh(s, N.x0 + (i + 0.5) * CS, N.y0 + (j + 0.5) * CS)) kin[j * W + i] = q + 1; } // 守る区画の番号（1 が本丸）
    if (N.E.length) heights(N);
    // 水堀ごとの水の高さ（堀の中でいちばん低い地面。高い所の堀も水が張る）
    N.mw = N.A.filter((a) => a[0] === 'm').map(([, s]) => { let L = Infinity; if (N.hg) { const [a, b, c2, d] = boxSh(s); for (let j = Math.max(0, Math.floor((b - N.y0) / CS)); j <= Math.min(H - 1, Math.ceil((d - N.y0) / CS)); j++) for (let i = Math.max(0, Math.floor((a - N.x0) / CS)); i <= Math.min(W - 1, Math.ceil((c2 - N.x0) / CS)); i++) if (inSh(s, N.x0 + (i + 0.5) * CS, N.y0 + (j + 0.5) * CS)) L = Math.min(L, N.hg[j * W + i]); } return { s, L: L === Infinity ? 0 : Math.max(0, L) }; });
    { // 歩きにくさ（道のりを比べる時に使う）：斜面・空堀・急な登りは遠回りでも避け、道を選ぶ
      const cost = new Float32Array(n); let any = 0;
      for (let k = 0; k < n; k++) { let c = ar[k] === AC.s ? 2 : ar[k] === AC.d ? 1.8 : ar[k] === AC.r ? 0.85 : 1; if (N.hg && ar[k] !== AC.r) { const i = k % W, j = (k - i) / W, gx = (N.hg[j * W + Math.min(W - 1, i + 1)] - N.hg[j * W + Math.max(0, i - 1)]) / (2 * CS), gy = (N.hg[Math.min(H - 1, j + 1) * W + i] - N.hg[Math.max(0, j - 1) * W + i]) / (2 * CS); c += Math.hypot(gx, gy) * 1.6; } cost[k] = c; if (c !== 1) any = 1; }
      if (any) N.cost = cost;
    }
    for (let k = 0; k < n; k++) if (ar[k] === AC.m) { nav[k] = 1; N.hasM = 1; }
    const mark = (x, y, v, g) => { const i = Math.floor((x - N.x0) / CS), j = Math.floor((y - N.y0) / CS); if (i < 0 || j < 0 || i >= W || j >= H) return; const k = j * W + i; nav[k] = v; if (g != null && gi[k] !== g) { gi[k] = g; N.gates[g].cells.push(k); } };
    for (const s of N.segs) { for (let t = 0; t < s.len; t += 0.5) mark(s.x1 + s.ux * t, s.y1 + s.uy * t, 1); mark(s.x2, s.y2, 1); }
    N.gates.forEach((g, k) => { for (let t = 0; t <= g.w; t += 0.5) mark(g.x1 + g.ux * t, g.y1 + g.uy * t, 2, k); });
    // 塀を近い順に引けるように、8m ごとの箱に入れる
    const BW = (N.BW = Math.ceil((W * CS) / BK)), BH = (N.BH = Math.ceil((H * CS) / BK));
    N.bk = Array.from({ length: BW * BH }, () => []);
    N.segs.forEach((s, k) => { const a = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - N.x0) / BK)), b = Math.min(BW - 1, Math.floor((Math.max(s.x1, s.x2) - N.x0) / BK)), c2 = Math.max(0, Math.floor((Math.min(s.y1, s.y2) - N.y0) / BK)), d = Math.min(BH - 1, Math.floor((Math.max(s.y1, s.y2) - N.y0) / BK)); for (let j = c2; j <= d; j++) for (let i = a; i <= b; i++) N.bk[j * BW + i].push(k); });
    // 塀・水堀・門で仕切られた場所（地域）に分ける
    const reg = (N.reg = new Int16Array(n).fill(-1)); let nr = 0; const st = [];
    for (let k = 0; k < n; k++) if (nav[k] === 0 && reg[k] < 0) {
      reg[k] = nr; st.push(k);
      while (st.length) { const q = st.pop(), i = q % W, j = (q - i) / W; for (let m = 0; m < 4; m++) { const ii = i + DX[m], jj = j + DY[m]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const p = jj * W + ii; if (nav[p] === 0 && reg[p] < 0) { reg[p] = nr; st.push(p); } } }
      nr++;
    }
    N.nr = nr; N.out = reg[0];
    const sides = (g) => { g.side = [[-1, -1], [-1, -1]]; for (const [sd, sg] of [[0, 1], [1, -1]]) for (let d = 1; d <= 7; d += 0.5) { const k = cellAt(N, g.x + g.nx * sg * d, g.y + g.ny * sg * d); if (k >= 0 && nav[k] === 0) { g.side[sd] = [k, reg[k]]; break; } } };
    N.gates.forEach(sides);
    // 外からいくつ門をくぐるか（深さ）。門の向き（nx,ny）は外向きにそろえる
    const dep = (N.dep = new Int16Array(nr).fill(-1)), qq = [];
    if (N.out >= 0) { dep[N.out] = 0; qq.push(N.out); }
    while (qq.length) { const r = qq.shift(); for (const g of N.gates) { const a = g.side[0][1], b = g.side[1][1]; if (a < 0 || b < 0 || a === b) continue; const o = a === r ? b : b === r ? a : -1; if (o >= 0 && dep[o] < 0) { dep[o] = dep[r] + 1; qq.push(o); } } }
    N.gates = N.gates.map((g) => { const a = g.side[0][1], b = g.side[1][1]; if (a >= 0 && b >= 0 && dep[a] > dep[b]) { const h = mkGate(g.x, g.y, g.a + PI, g.w, g.id); h.cells = g.cells; h.side = [g.side[1], g.side[0]]; return h; } return g; });
    for (const g of N.gates) if (g.id && /[ok]$/.test(g.id) && !N.waits[g.id.slice(-1)]) N.waits[g.id.slice(-1)] = [g.x - g.nx * 11, g.y - g.ny * 11];
    // 守る区画ごとの門（区画の外から入ってくる門）と、槍・刀の守り手が待つ所
    N.encl = N.K.map((s, q) => { const gs = N.gates.filter((g) => inSh(s, g.x - g.nx * 3, g.y - g.ny * 3) && !inSh(s, g.x + g.nx * 3, g.y + g.ny * 3)); return { q, waits: gs.map((g) => [g.x - g.nx * 9, g.y - g.ny * 9]) }; });
    return N;
  }
  // 高さ：山（なだらか）を足し、曲輪は平らにならす（まわりは切岸になって元の地面へ）
  function moundH(E, x, y) { let h = 0; for (const e of E) if (e[0] === 'm') { const d = Math.hypot(x - e[1], y - e[2]); if (d < e[3]) { const q = 1 - (d / e[3]) * (d / e[3]); h = Math.max(h, e[4] * q * Math.sqrt(q) * (1 + 0.06 * Math.sin(x * 0.05 + e[4]) * Math.sin(y * 0.043))); } } return h; }
  function heights(N) {
    const W = N.W, H = N.H, n = W * H, hg = (N.hg = new Float32Array(n)), ph = new Float32Array(n).fill(NaN), dist = new Float64Array(n).fill(Infinity), bw = new Float32Array(n), h = new Heap();
    for (let k = 0; k < n; k++) hg[k] = moundH(N.E, N.x0 + ((k % W) + 0.5) * CS, N.y0 + (Math.floor(k / W) + 0.5) * CS);
    for (const e of N.E) if (e[0] === 'f') { const [a, b, c2, d] = boxSh(e[1]); for (let j = Math.max(0, Math.floor((b - N.y0) / CS)); j <= Math.min(H - 1, Math.ceil((d - N.y0) / CS)); j++) for (let i = Math.max(0, Math.floor((a - N.x0) / CS)); i <= Math.min(W - 1, Math.ceil((c2 - N.x0) / CS)); i++) if (inSh(e[1], N.x0 + (i + 0.5) * CS, N.y0 + (j + 0.5) * CS)) { const k = j * W + i; ph[k] = e[2]; bw[k] = e[3] || 6; dist[k] = 0; } }
    for (let k = 0; k < n; k++) if (dist[k] === 0) h.push(k, 0);
    while (h.k.length) { const k = h.pop(), d = h.lv; if (d > dist[k]) continue; const i = k % W, j = (k - i) / W; for (let m = 0; m < 8; m++) { const ii = i + DX[m], jj = j + DY[m]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const q = jj * W + ii, nd = d + (m >= 4 ? 1.414 : 1) * CS; if (nd < dist[q] && nd < bw[k]) { dist[q] = nd; ph[q] = ph[k]; bw[q] = bw[k]; h.push(q, nd); } } }
    for (let k = 0; k < n; k++) if (!isNaN(ph[k])) { const t = Math.min(1, dist[k] / bw[k]), s2 = t * t * (3 - 2 * t); hg[k] = ph[k] + (hg[k] - ph[k]) * s2; }
  }
  // 高さ（m）。マス目の間はなめらかにつなぐ。範囲の外は山の形だけ
  SIM.nawaH = (N, x, y) => {
    if (!N || !N.hg) return 0;
    const fx = (x - N.x0) / CS - 0.5, fy = (y - N.y0) / CS - 0.5; if (fx < 0 || fy < 0 || fx >= N.W - 1 || fy >= N.H - 1) return moundH(N.E, x, y);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * N.W + i, g = N.hg;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + N.W] * (1 - u) + g[k + N.W + 1] * u) * v;
  };
  // 戦場の地面の高さ（丘＋城の山）。登り坂で遅くなる・高い所から射ると遠くまで届く、の計算に使う
  SIM.groundH = (b, x, y) => {
    let h = 0; for (const t of b.ter || []) if (t.k === 'h') { const r = t.r * 1.15, d = Math.hypot(x - t.x, y - t.y); if (d < r) { const q = 1 - (d / r) * (d / r); h += Math.min(14, t.r * 0.16) * q * q; } }
    const N = SIM.nawa(b.ter); return N && N.hg ? h + SIM.nawaH(N, x, y) : h;
  };
  const cellAt = (N, x, y) => { const i = Math.floor((x - N.x0) / CS), j = Math.floor((y - N.y0) / CS); return i < 0 || j < 0 || i >= N.W || j >= N.H ? -1 : j * N.W + i; };
  const cellIn = (N, x, y) => { const i = Math.max(0, Math.min(N.W - 1, Math.floor((x - N.x0) / CS))), j = Math.max(0, Math.min(N.H - 1, Math.floor((y - N.y0) / CS))); return j * N.W + i; };
  const ccx = (N, k) => N.x0 + ((k % N.W) + 0.5) * CS, ccy = (N, k) => N.y0 + (Math.floor(k / N.W) + 0.5) * CS;
  function nearSegs(N, x0, y0, x1, y1, f) { // 線分のまわりの塀
    const BW = N.BW, a = Math.max(0, Math.floor((Math.min(x0, x1) - N.x0) / BK) - 1), b = Math.min(BW - 1, Math.floor((Math.max(x0, x1) - N.x0) / BK) + 1), c = Math.max(0, Math.floor((Math.min(y0, y1) - N.y0) / BK) - 1), d = Math.min(N.BH - 1, Math.floor((Math.max(y0, y1) - N.y0) / BK) + 1);
    if (a > b || c > d) return;
    const seen = N._seen || (N._seen = new Uint32Array(N.segs.length)); N._stamp = (N._stamp || 0) + 1;
    const long = (b - a + 1) * (d - c + 1) > 12, L = Math.hypot(x1 - x0, y1 - y0), ux = L ? (x1 - x0) / L : 0, uy = L ? (y1 - y0) / L : 0;
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) {
      if (long) { const bx = N.x0 + (i + 0.5) * BK - x0, by = N.y0 + (j + 0.5) * BK - y0, t = Math.max(0, Math.min(L, bx * ux + by * uy)); if (Math.hypot(bx - ux * t, by - uy * t) > BK * 1.3) continue; } // 長い線は、線の近くの箱だけ
      for (const k of N.bk[j * BW + i]) if (seen[k] !== N._stamp) { seen[k] = N._stamp; if (f(N.segs[k]) === false) return; }
    }
  }

  // ---- 戦場の ter から城を取り出す ----
  const WM = new WeakMap(), IDC = new Map();
  SIM.nawa = (ter) => {
    if (!ter || !ter.length) return null;
    let n = WM.get(ter); if (n !== undefined) return n;
    let c = ter.find((t) => t.k === 'c');
    if (!c && ter.some((t) => t.k === 'k')) c = fromRings(ter); // 古いセーブの丸い城はパーツに直す
    n = null;
    if (c) { n = IDC.get(c.id); if (!n) { n = build(c); IDC.set(c.id, n); if (IDC.size > 6) IDC.delete(IDC.keys().next().value); } }
    WM.set(ter, n); return n;
  };
  SIM.castleWalls = SIM.nawa; // 前の名前（ほかの所から呼ばれても同じものを返す）
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  SIM.nawaEntry = (A, W, G, T, M, E) => { const r1 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : Array.isArray(v) ? v.map(r1) : v); const c = { k: 'c', x: -9999, y: -9999, r: 0, A: r1(A), W: r1(W), G: r1(G), T: r1(T), M: r1(M) }; if (E && E.length) c.E = r1(E); c.id = hash(JSON.stringify(c)); return c; };

  // ---- 今までの丸い城（輪の組み合わせ）をパーツに直す ----
  function fromRings(ter) {
    const RW = (SIM._ringWalls && SIM._ringWalls(ter)) || [], A = [], W = [], G = [], T = []; let M = null;
    const mains = new Set();
    for (const c of RW) if (c.main) { const mt = ter.find((m) => m.k === 'm' && Math.abs(m.x - c.x) < 1 && Math.abs(m.y - c.y) < 1); if (mt) mains.add(mt); }
    for (const k of ['s', 'd', 'k', 'm']) for (const t of ter) {
      if (t.k === 's' && k === 's') A.push(['s', ['o', t.x, t.y, t.r, t.ri || 0]]);
      else if (t.k === 'm' && k === (mains.has(t) ? 'm' : 'd')) A.push([k, ['o', t.x, t.y, t.r, t.ri || 0]]); // 本丸の堀だけ通れない水堀（ほかは今までどおり通れる堀）
      else if (t.k === 'k' && k === 'k') A.push(['k', ['o', t.x, t.y, t.r]]);
    }
    for (const c of RW) {
      if (c.main) { A.push(['K', ['o', c.x, c.y, c.R]]); M = [c.x, c.y, c.aF]; T.push(['T', c.x, c.y, 0]); for (const da of [-0.75, 1.05, PI - 0.6, PI + 0.6]) { const a = c.aF + da; T.push(['y', c.x + Math.cos(a) * (c.R - 2.5), c.y + Math.sin(a) * (c.R - 2.5), a]); } }
      for (const q of c.rings) {
        if (q.moat) { for (const [ga, gw] of q.gaps) A.push(['b', ['q', c.x, c.y, q.r - q.w - 0.6, q.r + q.w + 0.6, pm(ga - gw), 2 * gw]]); continue; }
        const gs = q.gaps.map(([ga, gw]) => [pm(ga - gw), 2 * gw]).sort((a, b) => a[0] - b[0]);
        if (!gs.length) W.push(['a', c.x, c.y, q.r, 0, 2 * PI, 'i']);
        gs.forEach(([s0, w0], i) => { const [s1] = gs[(i + 1) % gs.length], st = s0 + w0, len = pm(s1 - st) || (gs.length === 1 ? 2 * PI - w0 : 0); if (len > 0.01) W.push(['a', c.x, c.y, q.r, st, len, 'i']); });
        for (const [ga, gw, id] of q.gaps) if (id) G.push([c.x + Math.cos(ga) * q.r, c.y + Math.sin(ga) * q.r, ga, 2 * gw * q.r, id]);
      }
      for (const w of c.rad) W.push(['l', c.x + Math.cos(w.a) * w.r0, c.y + Math.sin(w.a) * w.r0, c.x + Math.cos(w.a) * w.r1, c.y + Math.sin(w.a) * w.r1, 'i']);
    }
    for (let i = ter.length - 1; i >= 0; i--) if (['k', 'm', 's'].includes(ter[i].k)) ter.splice(i, 1);
    const c = SIM.nawaEntry(A, W, G, T, M); ter.push(c); return c;
  }
  // 攻城戦のマップを作ったら、丸い城をパーツに直して ter に入れる
  const baseLayout = SIM.castleLayout;
  SIM.castleLayout = (w, b, s, cside) => { baseLayout(w, b, s, cside); b.ter = b.ter.filter((t) => t.k !== 'c'); fromRings(b.ter); };

  // ---- 地面の種類・本丸の内側か ----
  SIM.nawaArea = (N, x, y) => { const k = cellAt(N, x, y); return k < 0 ? 0 : N.ar[k]; };
  SIM.nawaAreaExact = (N, x, y) => { if (x < N.x0 || y < N.y0 || x > N.x1 || y > N.y1) return 0; let a = 0; for (const [code, s] of N.A) if (code !== 'K' && inSh(s, x, y)) a = AC[code] || 0; return a; }; // 見た目用（マス目でなく形そのもので。縁がぎざぎざにならない）
  SIM.nawaMoatL = (N, x, y) => { let L = null; for (const m of N.mw || []) if (inSh(m.s, x, y)) L = m.L; return L; }; // 水堀の水の高さ（堀でなければ null）
  SIM.nawaInMain = (N, x, y, q) => { const k = cellAt(N, x, y); return k >= 0 && N.kin[k] === (q || 0) + 1; };
  SIM.nawaEncl = (N, x, y) => { const k = cellAt(N, x, y); return k >= 0 ? N.kin[k] - 1 : -1; }; // 守る区画の番号（-1＝どこでもない）
  SIM.onBridge = (ter, x, y) => { const N = SIM.nawa(ter); return !!N && SIM.nawaArea(N, x, y) === AC.b; };
  SIM.nawaWallCell = (N, x, y) => { const k = cellAt(N, x, y); return k >= 0 && N.nav[k] !== 0; };

  // ---- 門 ----
  SIM.gatePts = (N) => (N ? N.gates.filter((g) => g.id).map((g) => ({ id: g.id, x: g.x, y: g.y, a: g.a, w: g.w })) : []);
  SIM.gateInit = (N, f) => { const gs = {}; f = f == null ? 1 : f; for (const g of (N && N.gates) || []) if (g.id) gs[g.id] = Math.round((SIM.GATE_HP[g.id.slice(-1)] || 600) * f); return gs; };
  SIM.gateLeft = (b) => { const A = b.act; if (!A || !A.gt || !SIM.nawa(b.ter)) return null; let n = 0, m = 0; for (const id in A.gt) { n += A.gt[id]; m += SIM.GATE_HP[id.slice(-1)] || 600; } return m ? n / m : null; };
  SIM.wallInGap = () => false; // 前の仕組みの名残（使わない）

  // ---- 飛び道具が塀・閉じた門に当たるか（堀は関係なし） ----
  SIM.wallHit = (N, x0, y0, x1, y1, G) => {
    if (!N || (Math.max(x0, x1) < N.x0 || Math.min(x0, x1) > N.x1 || Math.max(y0, y1) < N.y0 || Math.min(y0, y1) > N.y1)) return false;
    let hit = false;
    nearSegs(N, x0, y0, x1, y1, (s) => { if (s.st !== 'k' && segHit(x0, y0, x1, y1, s.x1, s.y1, s.x2, s.y2)) { hit = true; return false; } }); // 柵は矢・弾が抜ける
    if (!hit) for (const g of N.gates) if (!gOpen(g.id, G) && segHit(x0, y0, x1, y1, g.x1, g.y1, g.x2, g.y2)) return true;
    return hit;
  };
  /* 2.12.0 近接の攻撃が塀（柵も）・閉じた門にさえぎられるか（塀ごしには斬れない・突けない） */
  SIM.wallBlock = (N, x0, y0, x1, y1, G) => {
    if (!N || (Math.max(x0, x1) < N.x0 || Math.min(x0, x1) > N.x1 || Math.max(y0, y1) < N.y0 || Math.min(y0, y1) > N.y1)) return false;
    let hit = false;
    nearSegs(N, x0, y0, x1, y1, (s) => { if (segHit(x0, y0, x1, y1, s.x1, s.y1, s.x2, s.y2)) { hit = true; return false; } });
    if (!hit) for (const g of N.gates) if (!gOpen(g.id, G) && segHit(x0, y0, x1, y1, g.x1, g.y1, g.x2, g.y2)) return true;
    return hit;
  };
  /* 塀のすぐ内側（狭間から撃てる場所）にいるか */
  SIM.atLoophole = (N, x, y) => { if (!N) return false; let r = false; nearSegs(N, x, y, x, y, (s) => { if (dSeg(s, x, y) < 3.2) { r = true; return false; } }); return r; };

  // ---- 塀・閉じた門・水堀にめり込んだら押し戻す（rad：体の半径） ----
  const LAST = new WeakMap();
  SIM.wallPush = (N, s, rad, G) => {
    if (!N || s.x < N.x0 || s.y < N.y0 || s.x > N.x1 || s.y > N.y1) { if (N) LAST.delete(s); return; }
    const m = rad + WT(), lp = LAST.get(s);
    const push = (sg) => {
      const [px, py] = ptSeg(sg, s.x, s.y), dx = s.x - px, dy = s.y - py, d = Math.hypot(dx, dy);
      const nx = -sg.uy, ny = sg.ux, cur = (s.x - sg.x1) * nx + (s.y - sg.y1) * ny; let side = cur;
      if (lp && segHit(lp[0], lp[1], s.x, s.y, sg.x1, sg.y1, sg.x2, sg.y2)) { const sg2 = (lp[0] - sg.x1) * nx + (lp[1] - sg.y1) * ny >= 0 ? 1 : -1; s.x = px + nx * sg2 * m; s.y = py + ny * sg2 * m; return; } // 押されて塀を越えた：元の側へ戻す
      if (d >= m) return;
      if (lp) { const ps = (lp[0] - sg.x1) * nx + (lp[1] - sg.y1) * ny, t = (lp[0] - sg.x1) * sg.ux + (lp[1] - sg.y1) * sg.uy; if (Math.abs(ps) > 0.02 && t > -m && t < sg.len + m) side = ps; } // 前の位置の側へ（すり抜け防止。塀のつなぎ目も）
      const ins = (s.x - sg.x1) * sg.ux + (s.y - sg.y1) * sg.uy;
      if ((ins > 0 && ins < sg.len) || (side >= 0) !== (cur >= 0)) { const sg2 = side >= 0 ? 1 : -1; s.x = px + nx * sg2 * m; s.y = py + ny * sg2 * m; }
      else if (d > 1e-4) { s.x = px + (dx / d) * m; s.y = py + (dy / d) * m; }
    };
    nearSegs(N, s.x, s.y, s.x, s.y, (sg) => { push(sg); });
    for (const g of N.gates) if (Math.abs(s.x - g.x) < g.w + 3 && Math.abs(s.y - g.y) < g.w + 3 && !gOpen(g.id, G)) push(g);
    const k = cellAt(N, s.x, s.y);
    const lk = lp ? cellAt(N, lp[0], lp[1]) : -1;
    if (k >= 0 && N.ar[k] === AC.m && lk >= 0 && N.ar[lk] !== AC.m) { s.x = lp[0]; s.y = lp[1]; } // 水堀には入れない：元の場所へ戻す
    else if (k >= 0 && N.ar[k] === AC.m) { // 初めから水堀の上：いちばん近い通れる所へ
      const i0 = k % N.W, j0 = (k - i0) / N.W; let best = null, bd = 1e9;
      for (let r = 1; r <= 5 && !best; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (i < 0 || j < 0 || i >= N.W || j >= N.H || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r)) continue;
        const q = j * N.W + i; if (N.nav[q] !== 0) continue;
        const bx = N.x0 + i * CS, by = N.y0 + j * CS, qx = Math.max(bx + 0.05, Math.min(bx + CS - 0.05, s.x)), qy = Math.max(by + 0.05, Math.min(by + CS - 0.05, s.y)), dd = Math.hypot(qx - s.x, qy - s.y);
        if (dd < bd) { bd = dd; best = [qx, qy]; }
      }
      if (best) { s.x = best[0]; s.y = best[1]; }
    }
    LAST.set(s, [s.x, s.y]);
  };

  // ---- 道さがし ----
  function clear(N, x0, y0, x1, y1, G) { // まっすぐ行けるか（塀・閉じた門・水堀）
    let ok = true;
    nearSegs(N, x0, y0, x1, y1, (s) => { if (segHit(x0, y0, x1, y1, s.x1, s.y1, s.x2, s.y2) || (segSeg(s, x0, y0, x1, y1) < 0.9 && dSeg(s, x0, y0) > 1 && dSeg(s, x1, y1) > 1)) { ok = false; return false; } });
    if (!ok) return false;
    for (const g of N.gates) if (!gOpen(g.id, G) && segHit(x0, y0, x1, y1, g.x1, g.y1, g.x2, g.y2)) return false;
    if (N.hasM) { const L = Math.hypot(x1 - x0, y1 - y0); for (let t = 1.5; t < L - 1; t += 1) { const k = cellAt(N, x0 + ((x1 - x0) * t) / L, y0 + ((y1 - y0) * t) / L); if (k >= 0 && N.ar[k] === AC.m) return false; } }
    return true;
  }
  function freeCell(N, x, y) { // その場所から塀を越えずに行ける、通れるマス
    const k = cellIn(N, x, y); if (N.nav[k] === 0) return k;
    const i0 = k % N.W, j0 = (k - i0) / N.W; let best = -1, bd = 1e9;
    for (let r = 1; r <= 4 && best < 0; r++) for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (i < 0 || j < 0 || i >= N.W || j >= N.H || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r)) continue;
      const q = j * N.W + i; if (N.nav[q] !== 0) continue;
      const cx = ccx(N, q), cy = ccy(N, q), dd = Math.hypot(cx - x, cy - y); if (dd >= bd) continue;
      let cross = false; nearSegs(N, x, y, cx, cy, (s) => { if (segHit(x, y, cx, cy, s.x1, s.y1, s.x2, s.y2)) { cross = true; return false; } });
      if (!cross) { bd = dd; best = q; }
    }
    return best;
  }
  function dijkstra(N, seeds, ok) {
    const W = N.W, H = N.H, f = new Float64Array(W * H).fill(Infinity), h = new Heap();
    for (const k of seeds) { f[k] = 0; h.push(k, 0); }
    while (h.k.length) {
      const k = h.pop(), d = h.lv; if (d > f[k]) continue;
      const i = k % W, j = (k - i) / W;
      for (let m = 0; m < 8; m++) {
        const ii = i + DX[m], jj = j + DY[m]; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const q = jj * W + ii; if (!ok(q)) continue;
        if (m >= 4 && (!ok(j * W + ii) || !ok(jj * W + i))) continue;
        const nd = d + (m >= 4 ? 1.414 : 1) * CS * (N.cost ? (N.cost[k] + N.cost[q]) / 2 : 1); if (nd < f[q]) { f[q] = nd; h.push(q, nd); }
      }
    }
    return f;
  }
  const gateField = (N, i) => { if (N.gf[i]) return N.gf[i]; const g = N.gates[i], ra = g.side[0][1], rb = g.side[1][1]; return (N.gf[i] = dijkstra(N, g.cells, (q) => (N.nav[q] === 0 && (N.reg[q] === ra || N.reg[q] === rb)) || N.gi[q] === i)); };
  function goalField(N, cg) {
    const key = cg - (cg % N.W) + (Math.floor((cg % N.W) / 2) * 2), f0 = N.goal.get(key); if (f0) { N.goal.delete(key); N.goal.set(key, f0); return f0; } // 4m ごとにまとめて使い回す
    if ((N.budget || 0) <= 0) return null; N.budget--;
    const r = N.reg[cg], f = dijkstra(N, [cg], (q) => N.nav[q] === 0 && N.reg[q] === r);
    N.goal.set(key, f); if (N.goal.size > 48) N.goal.delete(N.goal.keys().next().value);
    return f;
  }
  function step(N, f, cs, s, G) { // 道のりの短くなる方へ、まっすぐ見通せる所まで
    const W = N.W; let c = cs, best = -1;
    for (let k = 0; k < 12; k++) {
      let nb = -1, nv = f[c]; const i = c % W, j = (c - i) / W;
      for (let m = 0; m < 8; m++) { const ii = i + DX[m], jj = j + DY[m]; if (ii < 0 || jj < 0 || ii >= W || jj >= N.H) continue; const q = jj * W + ii; if (f[q] < nv) { if (m >= 4 && (f[j * W + ii] === Infinity || f[jj * W + i] === Infinity)) continue; nv = f[q]; nb = q; } }
      if (nb < 0) break; c = nb;
      if (best < 0 || clear(N, s.x, s.y, ccx(N, c), ccy(N, c), G)) best = c; else break;
    }
    return best < 0 ? null : [ccx(N, best), ccy(N, best)];
  }
  function route(N, cs, rs, cg, rg, G) { // どの門を通って行くか（門を通るたびの道のりで比べる。閉じた門は打ち破る分だけ遠いとみなす）
    const ng = N.gates.length, best = new Float64Array(ng * 2).fill(Infinity), first = new Int16Array(ng * 2).fill(-1), done = new Uint8Array(ng * 2);
    const pen = (i) => (gOpen(N.gates[i].id, G) ? 0 : 60);
    for (let i = 0; i < ng; i++) for (let sd = 0; sd < 2; sd++) { const g = N.gates[i]; if (g.side[sd][1] !== rs) continue; const o = g.side[1 - sd][1]; if (o < 0 || o === rs) continue; const c = gateField(N, i)[cs] + pen(i); const st = i * 2 + (1 - sd); if (c < best[st]) { best[st] = c; first[st] = i; } }
    let bt = Infinity, bf = -1;
    for (;;) {
      let u = -1; for (let k = 0; k < ng * 2; k++) if (!done[k] && best[k] < Infinity && (u < 0 || best[k] < best[u])) u = k;
      if (u < 0 || best[u] >= bt) break; done[u] = 1;
      const gi = u >> 1, e = u & 1, r = N.gates[gi].side[e][1], ec = N.gates[gi].side[e][0];
      if (r === rg) { const t = best[u] + gateField(N, gi)[cg]; if (t < bt) { bt = t; bf = first[u]; } continue; }
      for (let j = 0; j < ng; j++) if (j !== gi) for (let sd = 0; sd < 2; sd++) { const h = N.gates[j]; if (h.side[sd][1] !== r) continue; const o = h.side[1 - sd][1]; if (o < 0 || o === r) continue; const c = best[u] + gateField(N, j)[ec] + pen(j), st = j * 2 + (1 - sd); if (c < best[st]) { best[st] = c; first[st] = first[u]; } }
    }
    return bf;
  }
  function way(N, s, gx, gy, G) {
    const cs = freeCell(N, s.x, s.y), cg = freeCell(N, gx, gy); if (cs < 0 || cg < 0) return null;
    const rs = N.reg[cs], rg = N.reg[cg];
    if (rs === rg) { if (clear(N, s.x, s.y, gx, gy, G)) return null; const f = goalField(N, cg); return f ? step(N, f, cs, s, G) : null; }
    const gi = route(N, cs, rs, cg, rg, G); if (gi < 0) return null;
    const g = N.gates[gi], f = gateField(N, gi), d = f[cs], sg = g.side[0][1] === rs ? 1 : -1;
    const near = [g.x + g.nx * sg * 2.2, g.y + g.ny * sg * 2.2];
    if (!gOpen(g.id, G)) { const w = d <= 4 ? near : step(N, f, cs, s, G) || near; return [w[0], w[1], g.id, g.x, g.y]; } // 閉じた門：門の前まで行って打ち破る
    if (d <= 4) { const lat = Math.abs((s.x - g.x) * g.ux + (s.y - g.y) * g.uy), off = Math.abs((s.x - g.x) * g.nx + (s.y - g.y) * g.ny); return lat > g.w / 2 - 0.7 && off > 1 ? near : [g.x - g.nx * sg * 4.5, g.y - g.ny * sg * 4.5]; } // 門をくぐる
    return step(N, f, cs, s, G) || near;
  }
  SIM.nawaWarm = (N) => { if (N) N.gates.forEach((g, i) => gateField(N, i)); }; // 門ごとの道のりを先に作っておく（戦の途中で一度に作ると引っかかる）
  /* 塀を回り込む行き先（門を通る）。まっすぐ行けるなら null。閉じた門を打ち破る時は [行き先x,y, 門id, 門x,y] */
  const WAY = new WeakMap();
  SIM.wallWay = (N, s, gx, gy, G) => {
    if (!N) return null;
    const inB = (x, y) => x >= N.x0 && y >= N.y0 && x < N.x1 && y < N.y1;
    if (!inB(s.x, s.y) && !inB(gx, gy)) { // 城の外どうし：城の範囲をよぎらなければそのまま
      let t0 = 0, t1 = 1; const dx = gx - s.x, dy = gy - s.y;
      for (const [p, q] of [[-dx, s.x - N.x0], [dx, N.x1 - s.x], [-dy, s.y - N.y0], [dy, N.y1 - s.y]]) { if (p === 0) { if (q < 0) return null; continue; } const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); }
      if (t0 > t1) return null;
    }
    const now = Date.now(), key = cellIn(N, gx, gy), c = WAY.get(s);
    if (c && c.id === N.id && c.key === key && now - c.t < 250 && (!c.r || Math.hypot(c.r[0] - s.x, c.r[1] - s.y) > 1)) return c.r;
    if (!N.bt || now - N.bt > 50) { N.bt = now; N.budget = 6; } // 1回の計算で新しく作る道のりは少しだけ（重くならないように）
    const r = way(N, s, gx, gy, G);
    WAY.set(s, { id: N.id, key, t: now, r }); return r;
  };

  // ---- 守り手の弓・鉄砲がつく狭間（本丸の外まわりの塀のすぐ内側。攻め手の来る側から） ----
  SIM.nawaPosts = (N, max, q) => {
    if (!N || !N.M || !N.K.length) return [];
    const KS = N.K[q || 0] || N.K[0], inK = (N2, x, y) => inSh(KS, x, y);
    const o = [];
    for (const sg of N.segs) {
      const nx = -sg.uy, ny = sg.ux;
      for (let t = 1.0; t < sg.len - 0.6; t += 2.0) {
        const x = sg.x1 + sg.ux * t, y = sg.y1 + sg.uy * t, ia = inK(N, x + nx * 1.6, y + ny * 1.6), ib = inK(N, x - nx * 1.6, y - ny * 1.6); if (ia === ib) continue;
        const s2 = ia ? 1 : -1, df = Math.abs(nrm(Math.atan2(-ny * s2, -nx * s2) - N.M.aF)); if (df > 2.2) continue;
        if (N.gates.some((g) => Math.hypot(x - g.x, y - g.y) < g.w / 2 + 2)) continue;
        o.push({ x: x + nx * s2 * 1.6, y: y + ny * s2 * 1.6, df });
      }
    }
    return o.sort((a, b) => a.df - b.df).slice(0, max);
  };
})();
