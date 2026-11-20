// 2.62.0 賭場の遊びを3つ足す：独楽回し（自分で木から削った「マイ独楽」で胴元の独楽と勝負）・貝絵合わせ（胴元と札ならぬ貝をめくり合う）・絵双六（上洛双六で胴元と競走）
//  独楽：木を選び、轆轤（ろくろ）で回る木を自分のタップ／クリックで削り、色を付けて仕上げる（仕上げた時に木の代金を払う）。
//   形から重さ・回る力・安定が決まり（SGK.KOMA.phys）、勝負は同じ乱数の種から誰の画面でも同じ動きになる（SGK.KOMA.battle）。勝ち負けはホストが決める
//  貝絵合わせ・双六：一人ずつ胴元と勝負する（同じ町の人には、卓の様子と前の勝負の結果が見える）
(function () {
  const SIM = SGK.SIM, DATA = SGK.DATA;
  const K = (SGK.KOMA = {});
  const SAY = (pid, t) => SIM.say(pid, t);
  const money = (m) => SIM.money(m);
  const nameOf = (w, pid) => (w.players[pid] ? w.players[pid].name : '？');
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const sign = (n) => (n >= 0 ? '+' : '－') + money(Math.abs(n));

  // ================= 独楽の形と力 =================
  K.N = 24; K.RMAX = 24; K.DZ = 2; K.MAX_OWN = 6;
  K.WOODS = {
    sugi: { name: '杉', price: 200, rho: 0.5, hard: 0.6, col: '#ead2a2', grain: '#c9a46a', note: '軽くて安い。削りやすいが当たりに弱い' },
    sakura: { name: '山桜', price: 800, rho: 0.72, hard: 0.9, col: '#d29a74', grain: '#a86a48', note: 'ほどよい重さ。くせがない' },
    kashi: { name: '樫', price: 2000, rho: 0.95, hard: 1.1, col: '#dcc08e', grain: '#b08e5a', note: '重くて硬い。喧嘩独楽の定番' },
    kokutan: { name: '黒檀', price: 6000, rho: 1.2, hard: 1.35, col: '#4a362c', grain: '#2a1c16', note: 'とても重く硬い南蛮渡りの木。値が張る' },
  };
  K.RING_PRICE = 1500; // 鉄の輪（いちばん太い所にはめる）
  K.COLORS = ['', '#c8281e', '#1e3c8c', '#1e1e1e', '#e6b422', '#2e7d4a', '#f4f0e6', '#7b3fa0', '#e87a2a'];
  K.blank = () => Array(K.N).fill(K.RMAX);
  const clampR = (v) => Math.max(1, Math.min(K.RMAX, Math.round(+v * 2) / 2 || 1));
  K.clean = (prof) => { const a = Array.isArray(prof) ? prof.slice(0, K.N) : []; while (a.length < K.N) a.push(K.RMAX); return a.map(clampR); };
  // 形 → 重さ m・回る向きの慣性 Ia・倒れる向きの慣性 It・重心の高さ zc・先(心棒の先)の太さ tip（block＝削っていない樫の塊を1とした値）
  const M0 = K.RMAX * K.RMAX * K.N * K.DZ, I0 = M0 * K.RMAX * K.RMAX / 2;
  K.phys = (k) => {
    const W = K.WOODS[k.wood] || K.WOODS.sugi, pr = k.prof || K.blank(); let m = 0, Ia = 0, It = 0, mz = 0, rmax = 0, rowMax = 0;
    for (let i = 0; i < K.N; i++) {
      const r = pr[i], z = (K.N - 1 - i + 0.5) * K.DZ, dm = W.rho * r * r * K.DZ;
      m += dm; Ia += dm * r * r / 2; It += dm * (r * r / 4 + z * z); mz += dm * z; if (r > rmax) { rmax = r; rowMax = i; }
    }
    let hard = W.hard;
    if (k.ring) { const z = (K.N - 1 - rowMax + 0.5) * K.DZ, mr = 0.12 * M0 * (rmax / K.RMAX); m += mr; Ia += mr * rmax * rmax; It += mr * (rmax * rmax / 2 + z * z); mz += mr * z; hard += 0.35; }
    const tip = Math.max(0.5, (pr[K.N - 1] * 2 + pr[K.N - 2]) / 3);
    return { m: m / M0, Ia: Ia / I0, It: It / I0, zc: mz / m / (K.N * K.DZ), tip, rmax, rowMax, hard };
  };
  // 回り始めの速さ・減り方・倒れる速さ
  K.spinOf = (ph, pow) => {
    const w0 = (0.45 + 0.55 * pow) * 20 / Math.sqrt(ph.Ia + 0.15); // 軽いほど速く回せる
    const dec = 0.35 * ph.m * (0.3 + ph.tip / 3) / ph.Ia; // 先が太いほど擦れて早く止まる
    const wc = 6 * Math.sqrt(ph.m * ph.zc * ph.It) / ph.Ia; // これより遅くなると倒れる（背が高い・重心が高い形ほど早く倒れる）
    return { w0, dec, wc };
  };
  // 見せる数値（0〜100）と持ち（秒）
  K.stats = (k) => {
    const ph = K.phys(k), s = K.spinOf(ph, 0.85), T = Math.max(0, (s.w0 - s.wc) / s.dec);
    const atk = ph.m * (ph.rmax / K.RMAX) * ph.hard;
    const st = Math.max(0, Math.min(1, 1 - s.wc / s.w0));
    return { omo: Math.min(100, Math.round(ph.m / 0.9 * 100)), mochi: Math.round(T), stab: Math.round(st * 100), atk: Math.min(100, Math.round(atk / 0.8 * 100)), ph };
  };
  
  // 決まった乱数（ホストと参加者で同じ動きにする。三角関数は使わない）
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  // 勝負：盥（たらい）の中で2つの独楽を回す。frames は 0.2秒ごとの [x,y,回る速さの割合,ゆらぎ] ×2 と当たり
  K.battle = (A, B, seed) => {
    // s.dec・s.w0 に揺らぎ：その日の盥の具合・手元の狂い
    const R = rng(seed), dt = 0.05, mk = (k, pow, sx) => { const ph = K.phys(k), s = Object.assign({}, K.spinOf(ph, pow)); s.dec *= 0.7 + R() * 0.6; s.w0 *= 0.92 + R() * 0.16; return { ph, s, w: s.w0, x: sx, y: (R() - 0.5) * 0.3, vx: -sx * 0.9 + (R() - 0.5) * 0.4, vy: (R() - 0.5) * 0.8, rad: 0.07 + 0.11 * ph.rmax / K.RMAX, down: 0, out: 0 }; };
    const a = mk(A.k, A.pow, -0.55), b = mk(B.k, B.pow, 0.55), T = [a, b], frames = []; let hits = 0, end = null, t = 0;
    const fr = (hit) => frames.push([...T.flatMap((o) => [Math.round(o.x * 1000) / 1000, Math.round(o.y * 1000) / 1000, Math.round(Math.max(0, o.w / o.s.w0) * 100) / 100, Math.round(Math.max(0, Math.min(1, 1.6 - o.w / Math.max(0.01, o.s.wc) * 0.6)) * 100) / 100]), hit ? 1 : 0]);
    fr(0); let hitNow = 0;
    for (let step = 1; step <= 120 / dt; step++) {
      t = step * dt;
      for (const o of T) {
        const wob = o.w < o.s.wc * 1.6 ? 1 + (o.s.wc * 1.6 - o.w) / o.s.wc * 2 : 1;
        o.w -= o.s.dec * dt * wob;
        const wander = (0.15 + o.ph.tip / 10) * wob;
        o.vx += (-1.1 * o.x + (R() - 0.5) * 4 * wander) * dt; o.vy += (-1.1 * o.y + (R() - 0.5) * 4 * wander) * dt;
        o.vx *= 1 - 0.35 * dt; o.vy *= 1 - 0.35 * dt; o.x += o.vx * dt; o.y += o.vy * dt;
      }
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, rr = a.rad + b.rad;
      if (d < rr) {
        const nx = dx / d, ny = dy / d;
        if (!hitNow) { // 当たった瞬間だけ弾き合う（縁の速さ×重さ×硬さが強いほど相手を飛ばし、回りを削る）
          const sa = Math.max(0, a.w) * a.ph.rmax / K.RMAX, sb = Math.max(0, b.w) * b.ph.rmax / K.RMAX, mt = a.ph.m + b.ph.m;
          const rel = Math.max(0, (a.vx - b.vx) * nx + (a.vy - b.vy) * ny);
          const J = (0.012 * (a.ph.m * sa * a.ph.hard + b.ph.m * sb * b.ph.hard) + rel * 0.5 * a.ph.m * b.ph.m / mt) * (0.35 + R() * 1.1); // 正面か、かすっただけか
          const ja = J * (b.ph.m * b.ph.hard) / (mt * a.ph.hard) * 2, jb = J * (a.ph.m * a.ph.hard) / (mt * b.ph.hard) * 2;
          a.vx -= nx * ja / a.ph.m * 0.4; a.vy -= ny * ja / a.ph.m * 0.4; b.vx += nx * jb / b.ph.m * 0.4; b.vy += ny * jb / b.ph.m * 0.4;
          a.w -= 0.8 * ja / a.ph.Ia; b.w -= 0.8 * jb / b.ph.Ia;
        }
        const push = (rr - d) / 2 + 0.002; a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        if (!hitNow) hits++; hitNow = 1;
      } else hitNow = 0;
      for (const o of T) { if (o.x * o.x + o.y * o.y > 1) o.out = 1; else if (o.w <= o.s.wc) o.down = 1; }
      if (step % 4 === 0 || a.out || b.out || a.down || b.down) fr(hitNow);
      const la = a.out || a.down, lb = b.out || b.down;
      if (la || lb) {
        if (la && lb) { const ra = a.out ? -1 : a.w / a.s.wc, rb = b.out ? -1 : b.w / b.s.wc; end = ra === rb ? 0 : ra > rb ? 1 : -1; } else end = la ? -1 : 1;
        end = { r: end, how: (la && !lb ? (a.out ? 'out' : 'down') : lb && !la ? (b.out ? 'out' : 'down') : 'both'), t };
        break;
      }
    }
    if (!end) end = { r: a.w / a.s.wc > b.w / b.s.wc ? 1 : -1, how: 'time', t };
    return { r: end.r, how: end.how, t: Math.round(end.t * 10) / 10, hits, frames };
  };

  // 胴元の独楽（掛け金が大きいほど腕のいい独楽を出す）
  const OYA_NAMES = ['鬼車', '疾風丸', '岩砕き', '雷電', '竜巻', '朧月', '鉄壁', '赤鬼', '黒旋風', '不動', '影法師', '金剛'];
  K.makeShape = (q, R) => { // q：0〜1 の出来のよさ。よいほど胴（いちばん太い所）が低く平たく、先が細い
    const hRows = Math.round(3 + q * 8 + R() * 3), hr = 1.5 + R() * 2.5 + (1 - q) * 4, body = Math.round(2 + R() * 3 + (1 - q) * 3);
    const pk0 = Math.min(K.N - 5, hRows + 1), pk1 = Math.min(K.N - 4, pk0 + body), pr = 13 + q * 9 + R() * 3, tip = 0.5 + (1 - q) * 3.5 + R() * 1.5;
    const prof = [];
    for (let i = 0; i < K.N; i++) {
      let r;
      if (i < hRows) r = hr;
      else if (i < pk0) r = hr + (pr - hr) * 0.6;
      else if (i <= pk1) r = pr;
      else r = pr + (tip - pr) * Math.pow((i - pk1) / (K.N - 1 - pk1), 0.7 + q * 0.6);
      prof.push(clampR(r));
    }
    return prof;
  };
  K.oyaKoma = (tier, seed) => {
    const R = rng(seed), q = Math.min(1, 0.15 + tier * 0.28 + R() * 0.3), wl = ['sugi', 'sakura', 'kashi', 'kokutan'], wood = wl[Math.min(3, Math.floor(tier + R() * 2))];
    const col = Array(K.N).fill(''), c1 = 1 + Math.floor(R() * (K.COLORS.length - 1)), c2 = 1 + Math.floor(R() * (K.COLORS.length - 1));
    for (let i = 0; i < K.N; i++) col[i] = i % 5 === 1 ? K.COLORS[c1] : i % 5 === 3 ? K.COLORS[c2] : '';
    return { name: OYA_NAMES[Math.floor(R() * OYA_NAMES.length)], wood, prof: K.makeShape(q, R), col, ring: tier >= 2 && R() < 0.6, oya: 1 };
  };
  K.tierOf = (bet) => (bet <= 100 ? 0 : bet <= 1000 ? 1 : 2);

  // ================= 卓 =================
  const A = (SGK.ASOBI = {});
  A.GAMES = {
    koma: { name: '独楽回し', rule: '自分で削った独楽と、胴元か挑んだ人の独楽を盥（たらい）で回し、先に倒れるか盥から飛び出した方の負け。勝てば2倍。掛け金が大きいほど胴元は強い独楽を出します。投げる時は力の目盛りを「ここ」で止めると強く回せます。' },
    kai: { name: '貝絵合わせ', rule: '伏せた24の貝から2つずつめくり、絵の合う対（つい）を取ります。合えば続けてめくれます。相手（胴元か、挑んだ人）と交互にめくり、多く取った方の勝ち（2倍）。同じ数なら賭け金が戻ります。' },
    sugoroku: { name: '絵双六', rule: '岡崎から京をめざす上洛双六。相手（胴元か、挑んだ人）と交互に賽を振り、先に「上がり」に着いた方の勝ち（2倍）。ちょうどで上がれないと、余った分だけ戻ります。' },
  };
  const tableOf = (w, sid) => {
    w.asobi = w.asobi || {}; const t = (w.asobi[sid] = w.asobi[sid] || {}); t.koma = t.koma || { n: 0, last: null, oya: {} }; t.inv = t.inv || {};
    for (const k of ['kai', 'sugoroku']) { t[k] = t[k] || { n: 0, last: null, g: {} }; if (!t[k].by) { t[k].g = {}; t[k].by = {}; } } // 2.63.0 勝負は id ごと（人と人でも遊べるように）。前の形の勝負は消す
    return t;
  };
  function ok(w, p) {
    const s = here(w, p);
    if (!s || !DATA.isBig(s)) { SAY(p.id, '賭場があるのは大きな町だけです'); return null; }
    if (p.busy) { SAY(p.id, `${p.busy.label}の最中です`); return null; }
    return { s, t: tableOf(w, s.id) };
  }
  const betOk = (w, p, q) => { const bet = +q; if (!SGK.GAMBLE || !SGK.GAMBLE.BETS.includes(bet)) return 0; if (p.money < bet) { SAY(p.id, '持ち金が足りません'); return 0; } return bet; };
  const seedOf = (w) => Math.floor(SIM.rand(w) * 2147483647);

  // ---- 独楽づくり ----
  SIM.commands.kmMake = (w, p, c) => {
    const W = K.WOODS[c.wood]; if (!W) return;
    p.koma = p.koma || [];
    if (p.koma.length >= K.MAX_OWN) return SAY(p.id, `独楽は${K.MAX_OWN}つまでしか持てません（いらない独楽を割ってください）`);
    const cost = W.price + (c.ring ? K.RING_PRICE : 0);
    if (p.money < cost) return SAY(p.id, '持ち金が足りません');
    const prof = K.clean(c.prof), col = Array.from({ length: K.N }, (_, i) => (c.col && K.COLORS.includes(c.col[i]) ? c.col[i] : ''));
    const name = String(c.name || '').replace(/[<>&"]/g, '').trim().slice(0, 10) || `${W.name}の独楽`;
    p.money -= cost; p.komaN = (p.komaN || 0) + 1;
    const k = { id: 'k' + Date.now().toString(36) + p.komaN, name, wood: c.wood, prof, col, ring: !!c.ring, win: 0, lose: 0 };
    p.koma.push(k); p.komaUse = k.id;
    SAY(p.id, `独楽「${name}」が仕上がった（${money(cost)}）`);
  };
  SIM.commands.kmUse = (w, p, c) => { if ((p.koma || []).some((k) => k.id === c.id)) p.komaUse = c.id; };
  SIM.commands.kmBreak = (w, p, c) => { if (!p.koma) return; const k = p.koma.find((x) => x.id === c.id); if (!k) return; p.koma = p.koma.filter((x) => x !== k); if (p.komaUse === k.id) p.komaUse = p.koma[0] ? p.koma[0].id : null; SAY(p.id, `独楽「${k.name}」を割って薪にした`); };
  SIM.commands.kmName = (w, p, c) => { const k = (p.koma || []).find((x) => x.id === c.id); if (k) k.name = String(c.name || '').replace(/[<>&"]/g, '').trim().slice(0, 10) || k.name; };

  // ---- 独楽回し ----
  const oyaFor = (T, tier) => { if (!T.oya[tier]) T.oya[tier] = Object.assign(K.oyaKoma(tier, Math.floor(Math.random() * 2147483647)), { tier }); return T.oya[tier]; };
  SIM.commands.kmPlay = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.koma;
    const k = (p.koma || []).find((x) => x.id === p.komaUse) || (p.koma || [])[0]; if (!k) return SAY(p.id, 'まず独楽を作ってください');
    const bet = betOk(w, p, c.qty); if (!bet) return;
    const tier = K.tierOf(bet), oy = oyaFor(T, tier), pow = Math.max(0, Math.min(1, +c.pow || 0)), opow = 0.55 + SIM.rand(w) * 0.4, seed = seedOf(w);
    const res = K.battle({ k, pow }, { k: oy, pow: opow }, seed);
    p.money -= bet; p.gbPlay = (p.gbPlay || 0) + 1;
    const ret = res.r > 0 ? bet * 2 : res.r === 0 ? bet : 0; p.money += ret;
    if (res.r > 0) { k.win = (k.win || 0) + 1; p.kmWin = (p.kmWin || 0) + 1; } else if (res.r < 0) k.lose = (k.lose || 0) + 1;
    const HOW = { out: '盥から飛び出した', down: '回り止んで倒れた', both: '両方倒れた', time: '勝負がつかず回りの強さで判定' };
    const loser = res.how === 'both' || res.how === 'time' ? '' : res.r > 0 ? `${oy.name}が` : `${k.name}が`;
    T.n++;
    T.last = { id: T.n, t: Date.now(), by: p.name, pid: p.id, bet, seed, me: { name: k.name, wood: k.wood, prof: k.prof, col: k.col, ring: k.ring, pow }, oya: { name: oy.name, wood: oy.wood, prof: oy.prof, col: oy.col, ring: oy.ring, pow: opow }, r: res.r, how: res.how, sec: res.t, hits: res.hits, gain: ret - bet,
      head: `${p.name}の「${k.name}」 対 胴元の「${oy.name}」→ ${loser}${HOW[res.how]}（${res.t}秒・当たり${res.hits}回）`, lines: [`${p.name}（${money(bet)}）→ ${res.r > 0 ? '勝ち ' + sign(bet) : res.r < 0 ? '負け ' + sign(-bet) : '引き分け（返却）'}`] };
    SAY(p.id, `独楽回し：${res.r > 0 ? '勝ち' : res.r < 0 ? '負け' : '引き分け'}`);
    if (res.r > 0) delete T.oya[tier]; // 負けた胴元は独楽を替える
  };

  // ---- 2.63.0 人と人の勝負：挑戦状（賭け金は挑んだ時に預かり、断られたり3分たったら返す）。勝った方が両方の賭け金をもらう ----
  const SAMEAT = (w, q, sid) => q && !q.off && q.at === sid && q.tx == null;
  const NAMEG = { koma: '独楽回し', kai: '貝絵合わせ', sugoroku: '絵双六' };
  const playing = (T, pid) => { const gid = T.by[pid], g = gid && T.g[gid]; return g && !g.done ? g : null; };
  function dropInv(w, t, id, why) { const v = t.inv[id]; if (!v) return; delete t.inv[id]; const q = w.players[v.from]; if (q) { q.money += v.bet; if (why) SAY(q.id, why); } }
  SIM.commands.asChallenge = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const t = o.t, game = c.game; if (!NAMEG[game]) return;
    const q = w.players[c.to]; if (!q || q === p || !SAMEAT(w, q, o.s.id)) return SAY(p.id, '相手が同じ町にいません');
    if (game === 'koma' && !(p.koma || []).length) return SAY(p.id, 'まず独楽を作ってください');
    if (game !== 'koma' && (playing(t[game], p.id) || playing(t[game], q.id))) return SAY(p.id, 'どちらかが、まだ別の勝負の最中です');
    for (const id in t.inv) if (t.inv[id].from === p.id) dropInv(w, t, id); // 前の挑戦は取り下げる
    const bet = betOk(w, p, c.qty); if (!bet) return;
    p.money -= bet; t.invN = (t.invN || 0) + 1; const id = 'v' + t.invN;
    const inv = { id, game, from: p.id, to: q.id, bet, t: Date.now() };
    if (game === 'koma') { const k = (p.koma || []).find((x) => x.id === p.komaUse) || p.koma[0]; inv.koma = { id: k.id, name: k.name, wood: k.wood, prof: k.prof, col: k.col, ring: k.ring }; inv.pow = Math.max(0, Math.min(1, +c.pow || 0)); }
    t.inv[id] = inv;
    SAY(p.id, `${q.name}に${NAMEG[game]}の勝負を挑んだ（${money(bet)}）。返事を待っています`);
    SAY(q.id, `${p.name}が賭場で${NAMEG[game]}の勝負を挑んできた（${money(bet)}）。この町の賭場の「${NAMEG[game]}」で受けられます`);
  };
  SIM.commands.asDecline = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const v = o.t.inv[c.id]; if (!v || (v.to !== p.id && v.from !== p.id)) return;
    const other = w.players[v.from === p.id ? v.to : v.from];
    dropInv(w, o.t, c.id, v.to === p.id ? `${p.name}は${NAMEG[v.game]}の勝負を断った（賭け金は戻った）` : null);
    if (v.from === p.id && other) SAY(other.id, `${p.name}は${NAMEG[v.game]}の挑戦を取り下げた`);
  };
  SIM.commands.asAccept = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const t = o.t, v = t.inv[c.id]; if (!v || v.to !== p.id) return;
    const a = w.players[v.from]; if (!SAMEAT(w, a, o.s.id)) return dropInv(w, t, v.id, '相手が町を離れたので、挑戦は取りやめになった（賭け金は戻った）');
    if (p.money < v.bet) return SAY(p.id, '持ち金が足りません');
    if (v.game === 'koma' && !(p.koma || []).length) return SAY(p.id, 'まず独楽を作ってください');
    if (v.game !== 'koma' && (playing(t[v.game], p.id) || playing(t[v.game], a.id))) return SAY(p.id, 'どちらかが、まだ別の勝負の最中です');
    delete t.inv[v.id]; p.money -= v.bet; p.gbPlay = (p.gbPlay || 0) + 1; a.gbPlay = (a.gbPlay || 0) + 1;
    if (v.game === 'koma') return komaPvp(w, t.koma, a, p, v, Math.max(0, Math.min(1, +c.pow || 0)));
    const g = v.game === 'kai' ? kaiNew(w, t.kai, [a.id, p.id], v.bet) : sgNew(w, t.sugoroku, [a.id, p.id], v.bet);
    g.nm = [a.name, p.name];
    SAY(a.id, `${p.name}が${NAMEG[v.game]}の勝負を受けた！ 賭場で始まります（先手はあなた）`); SAY(p.id, `${NAMEG[v.game]}の勝負が始まった（先手は${a.name}）`);
  };
  SIM.systems.push(function asobiInv(w) { // 3分たった挑戦状は取りやめ
    if (!w.asobi) return; const now = Date.now();
    for (const sid in w.asobi) { const t = w.asobi[sid]; if (!t.inv) continue; for (const id in t.inv) if (now - t.inv[id].t > 180000) dropInv(w, t, id, `${NAMEG[t.inv[id].game]}の挑戦に返事がなかった（賭け金は戻った）`); }
  });
  function komaPvp(w, T, a, b, v, powB) {
    const kb = (b.koma || []).find((x) => x.id === b.komaUse) || b.koma[0], ka = v.koma, bet = v.bet, seed = seedOf(w);
    const res = K.battle({ k: ka, pow: v.pow }, { k: kb, pow: powB }, seed);
    const retA = res.r > 0 ? bet * 2 : res.r === 0 ? bet : 0, retB = res.r < 0 ? bet * 2 : res.r === 0 ? bet : 0; a.money += retA; b.money += retB;
    const kA = (a.koma || []).find((x) => x.id === ka.id);
    if (res.r > 0) { if (kA) kA.win = (kA.win || 0) + 1; kb.lose = (kb.lose || 0) + 1; a.kmWin = (a.kmWin || 0) + 1; } else if (res.r < 0) { kb.win = (kb.win || 0) + 1; if (kA) kA.lose = (kA.lose || 0) + 1; b.kmWin = (b.kmWin || 0) + 1; }
    const HOW = { out: '盥から飛び出した', down: '回り止んで倒れた', both: '両方倒れた', time: '勝負がつかず回りの強さで判定' };
    const loser = res.how === 'both' || res.how === 'time' ? '' : res.r > 0 ? `${kb.name}が` : `${ka.name}が`;
    T.n++;
    T.last = { id: T.n, t: Date.now(), pvp: 1, by: a.name, pid: a.id, bName: b.name, pidB: b.id, bet, seed, me: Object.assign({}, ka, { pow: v.pow }), oya: { name: kb.name, wood: kb.wood, prof: kb.prof, col: kb.col, ring: kb.ring, pow: powB }, r: res.r, how: res.how, sec: res.t, hits: res.hits, gain: retA - bet, gainB: retB - bet,
      head: `${a.name}の「${ka.name}」 対 ${b.name}の「${kb.name}」→ ${loser}${HOW[res.how]}（${res.t}秒・当たり${res.hits}回）`, lines: [`${a.name}（${money(bet)}）→ ${res.r > 0 ? '勝ち ' + sign(bet) : res.r < 0 ? '負け ' + sign(-bet) : '引き分け（返却）'}`, `${b.name}（${money(bet)}）→ ${res.r < 0 ? '勝ち ' + sign(bet) : res.r > 0 ? '負け ' + sign(-bet) : '引き分け（返却）'}`] };
    for (const [q, r] of [[a, res.r], [b, -res.r]]) SAY(q.id, `独楽回し（対${q === a ? b.name : a.name}）：${r > 0 ? '勝ち' : r < 0 ? '負け' : '引き分け'}`);
  }

  // ---- 遊びの勝負の決着（貝絵合わせ・双六で共通）：r0＝先手から見た勝ち負け ----
  function settle(w, T, g, r0, head, gameName) {
    g.done = true; g.res = {}; g.end = Date.now();
    const lines = [];
    g.pl.forEach((pid, i) => {
      if (pid === 'oya') return; const r = i === 0 ? r0 : -r0, q = w.players[pid], ret = r > 0 ? g.bet * 2 : r === 0 ? g.bet : 0;
      if (q) q.money += ret; g.res[pid] = { r, gain: ret - g.bet };
      lines.push(`${g.nm[i]}（${money(g.bet)}）→ ${r > 0 ? '勝ち ' + sign(g.bet) : r < 0 ? '負け ' + sign(-g.bet) : '引き分け（返却）'}`);
      SAY(pid, `${gameName}：${r > 0 ? '勝ち' : r < 0 ? '負け' : '引き分け'}`);
    });
    T.n++; T.last = { id: T.n, t: Date.now(), by: g.nm[0], pid: g.pl[0], head, lines };
  }
  const gid = (T) => { T.gn = (T.gn || 0) + 1; return 'g' + T.gn; };
  function cleanup(T, pid) { const id = T.by[pid]; if (!id) return; delete T.by[pid]; if (!Object.values(T.by).includes(id)) delete T.g[id]; }
  const idxOf = (g, pid) => g.pl.indexOf(pid);
  const STALE = 120000; // 相手の番のまま2分動かなければ、勝ちにできる

  // ---- 貝絵合わせ ----
  A.KAI = ['松', '梅', '桜', '菊', '紅葉', '竹', '鶴', '月', '波', '富士', '扇', '藤'];
  const shuffle = (w, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(SIM.rand(w) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function kaiNew(w, T, pl, bet) {
    for (const pid of pl) if (pid !== 'oya') cleanup(T, pid);
    const deck = shuffle(w, [...A.KAI.keys(), ...A.KAI.keys()]), id = gid(T);
    const g = (T.g[id] = { id, pl, nm: pl.map((x) => (x === 'oya' ? '胴元' : nameOf(w, x))), bet, deck, own: Array(deck.length).fill(-1), pick: -1, sc: [0, 0], turn: 0, mem: {}, ev: [], seq: 0, t: Date.now(), lastT: Date.now(), done: false, res: null });
    for (const pid of pl) if (pid !== 'oya') T.by[pid] = id;
    return g;
  }
  SIM.commands.kaiStart = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.kai;
    if (playing(T, p.id)) return SAY(p.id, 'もう勝負の最中です');
    const bet = betOk(w, p, c.qty); if (!bet) return;
    p.money -= bet; p.gbPlay = (p.gbPlay || 0) + 1; kaiNew(w, T, [p.id, 'oya'], bet);
  };
  const kaiEv = (g, e) => { g.seq++; e.s = g.seq; g.ev.push(e); if (g.ev.length > 30) g.ev.shift(); };
  function kaiOya(w, g) { // 胴元の番：覚えている貝は（たまに忘れつつ）当てにいく
    let guard = 0;
    while (g.own.some((x) => x < 0) && guard++ < 20) {
      const left = g.own.map((x, i) => (x < 0 ? i : -1)).filter((i) => i >= 0);
      const known = left.filter((i) => g.mem[i] != null && SIM.rand(w) < 0.8);
      let a = -1, b = -1;
      for (const i of known) { const j = known.find((x) => x !== i && g.deck[x] === g.deck[i]); if (j != null) { a = i; b = j; break; } }
      if (a < 0) {
        const unk = left.filter((i) => g.mem[i] == null); a = (unk.length ? unk : left)[Math.floor(SIM.rand(w) * (unk.length ? unk : left).length)];
        const mate = known.find((x) => x !== a && g.deck[x] === g.deck[a]);
        if (mate != null) b = mate; else { const rest = left.filter((x) => x !== a && g.mem[x] == null), pool = rest.length ? rest : left.filter((x) => x !== a); b = pool[Math.floor(SIM.rand(w) * pool.length)]; }
      }
      g.mem[a] = 1; g.mem[b] = 1;
      const hit = g.deck[a] === g.deck[b]; kaiEv(g, { who: 1, a, b, fa: g.deck[a], fb: g.deck[b], hit });
      if (!hit) { g.turn = 0; return; }
      g.own[a] = g.own[b] = 1; g.sc[1]++; delete g.mem[a]; delete g.mem[b];
    }
  }
  const kaiHead = (g, quitIdx) => (quitIdx != null ? `${g.nm[quitIdx]}が勝負を降りた（${g.sc[0]}対${g.sc[1]}）` : `${g.nm[0]} ${g.sc[0]}対 ${g.nm[1]} ${g.sc[1]}`);
  SIM.commands.kaiFlip = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.kai, g = playing(T, p.id); if (!g) return;
    const me = idxOf(g, p.id); if (g.turn !== me) return SAY(p.id, '相手の番です');
    const i = +c.i; if (!(i >= 0 && i < g.deck.length) || g.own[i] >= 0 || i === g.pick) return;
    g.lastT = Date.now();
    if (g.pick < 0) { g.pick = i; g.mem[i] = 1; kaiEv(g, { who: me, a: i, fa: g.deck[i] }); return; }
    const a = g.pick, hit = g.deck[a] === g.deck[i]; g.pick = -1; g.mem[i] = 1;
    kaiEv(g, { who: me, a, b: i, fa: g.deck[a], fb: g.deck[i], hit });
    if (hit) { g.own[a] = g.own[i] = me; g.sc[me]++; delete g.mem[a]; delete g.mem[i]; }
    else { g.turn = 1 - me; if (g.pl[g.turn] === 'oya') kaiOya(w, g); }
    if (g.own.every((x) => x >= 0)) settle(w, T, g, g.sc[0] > g.sc[1] ? 1 : g.sc[0] < g.sc[1] ? -1 : 0, kaiHead(g), '貝絵合わせ');
  };
  SIM.commands.kaiQuit = (w, p) => { // 終わった勝負を片づける／途中なら降りる（負け）
    const o = ok(w, p); if (!o) return; const T = o.t.kai, id = T.by[p.id], g = id && T.g[id]; if (!g) return;
    if (!g.done) { const me = idxOf(g, p.id); settle(w, T, g, me === 0 ? -1 : 1, kaiHead(g, me), '貝絵合わせ'); }
    cleanup(T, p.id);
  };
  SIM.commands.kaiClaim = (w, p) => { // 相手が来ない
    const o = ok(w, p); if (!o) return; const T = o.t.kai, g = playing(T, p.id); if (!g) return; const me = idxOf(g, p.id);
    if (g.turn === me || g.pl[1 - me] === 'oya' || Date.now() - g.lastT < STALE) return;
    settle(w, T, g, me === 0 ? 1 : -1, `${g.nm[1 - me]}が戻らず、${g.nm[me]}の勝ち（${g.sc[0]}対${g.sc[1]}）`, '貝絵合わせ');
  };

  // ---- 絵双六（上洛双六） ----
  A.SG = [
    ['岡崎', '振り出し'], ['藤川'], ['池鯉鮒', '茶屋でひと息（もう一度）', 'again'], ['鳴海'], ['桶狭間', '落武者狩り（3つ戻る）', 'mv', -3], ['熱田', '熱田さまに参る（2つ進む）', 'mv', 2],
    ['宮の渡し'], ['七里の渡し', '時化で船止め（一回休み）', 'rest'], ['桑名'], ['四日市'], ['石薬師', '薬師さまのご利益（1つ進む）', 'mv', 1], ['庄野', '足をくじく（2つ戻る）', 'mv', -2],
    ['亀山'], ['関', '関所の取り調べ（一回休み）', 'rest'], ['坂下'], ['鈴鹿峠', '山賊の巣（6つ戻る）', 'mv', -6], ['土山'], ['水口', '馬を借りる（3つ進む）', 'mv', 3],
    ['石部'], ['草津'], ['瀬田の唐橋', '橋が焼け落ちた（一回休み）', 'rest'], ['大津'], ['逢坂の関', '抜け道を見つける（2つ進む）', 'mv', 2], ['山科'],
    ['蹴上', '都の手前で道に迷う（4つ戻る）', 'mv', -4], ['粟田口'], ['三条大橋', '人込みにもまれる（もう一度）', 'again'], ['四条', '火の手が上がる（5つ戻る）', 'mv', -5], ['二条'], ['京', '上がり'],
  ];
  const GOAL = A.SG.length - 1;
  function sgMove(w, g, who, evs) { // who＝0（先手）か1。1回分（もう一度なら続けて）。上がったら true
    let again = 0;
    do {
      again = 0;
      const d = 1 + Math.floor(SIM.rand(w) * 6), from = g.pos[who]; let to = from + d; if (to > GOAL) to = GOAL - (to - GOAL);
      const sq = A.SG[to], e = { who, d, from, to };
      if (to !== GOAL && sq[2] === 'mv') { e.to2 = Math.max(0, Math.min(GOAL, to + sq[3])); g.pos[who] = e.to2; }
      else { g.pos[who] = to; if (sq[2] === 'rest') g.rest[who] = 1; if (sq[2] === 'again') again = 1; }
      evs.push(e);
      if (g.pos[who] === GOAL) return true;
    } while (again);
    return false;
  }
  function sgNext(w, g, evs) { // 番を回す（休みは飛ばし、胴元はその場で振る）。上がった人の番号か -1
    for (let k = 0; k < 6; k++) {
      g.turn = 1 - g.turn; const who = g.turn;
      if (g.rest[who]) { g.rest[who] = 0; evs.push({ who, rest: 1 }); continue; }
      if (g.pl[who] === 'oya') { if (sgMove(w, g, who, evs)) return who; continue; }
      return -1;
    }
    return -1;
  }
  function sgNew(w, T, pl, bet) {
    for (const pid of pl) if (pid !== 'oya') cleanup(T, pid);
    const id = gid(T), g = (T.g[id] = { id, pl, nm: pl.map((x) => (x === 'oya' ? '胴元' : nameOf(w, x))), bet, pos: [0, 0], rest: [0, 0], turn: 0, ev: [], seq: 0, t: Date.now(), lastT: Date.now(), done: false, res: null });
    for (const pid of pl) if (pid !== 'oya') T.by[pid] = id;
    return g;
  }
  SIM.commands.sgStart = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku;
    if (playing(T, p.id)) return SAY(p.id, 'もう勝負の最中です');
    const bet = betOk(w, p, c.qty); if (!bet) return;
    p.money -= bet; p.gbPlay = (p.gbPlay || 0) + 1; sgNew(w, T, [p.id, 'oya'], bet);
  };
  SIM.commands.sgRoll = (w, p) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku, g = playing(T, p.id); if (!g) return;
    const me = idxOf(g, p.id); if (g.turn !== me) return SAY(p.id, '相手の番です');
    g.lastT = Date.now(); const evs = [];
    const win = sgMove(w, g, me, evs) ? me : sgNext(w, g, evs);
    for (const e of evs) { g.seq++; e.s = g.seq; g.ev.push(e); } while (g.ev.length > 30) g.ev.shift();
    if (win >= 0) settle(w, T, g, win === 0 ? 1 : -1, `${g.nm[win]}が先に京へ上がった`, '絵双六');
  };
  SIM.commands.sgQuit = (w, p) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku, id = T.by[p.id], g = id && T.g[id]; if (!g) return;
    if (!g.done) { const me = idxOf(g, p.id); settle(w, T, g, me === 0 ? -1 : 1, `${g.nm[me]}が勝負を降りた`, '絵双六'); }
    cleanup(T, p.id);
  };
  SIM.commands.sgClaim = (w, p) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku, g = playing(T, p.id); if (!g) return; const me = idxOf(g, p.id);
    if (g.turn === me || g.pl[1 - me] === 'oya' || Date.now() - g.lastT < STALE) return;
    settle(w, T, g, me === 0 ? 1 : -1, `${g.nm[1 - me]}が戻らず、${g.nm[me]}の勝ち`, '絵双六');
  };

  // ---- 見せる情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    r.me.koma = p.koma || []; r.me.komaUse = p.komaUse || null;
    if (!r.here || !r.here.gamble) return r;
    const t = tableOf(w, r.here.id), gb = r.here.gamble, now = Date.now();
    gb.people = Object.values(w.players).filter((q) => q !== p && SAMEAT(w, q, r.here.id)).map((q) => ({ id: q.id, name: q.name }));
    gb.inv = Object.values(t.inv).filter((v) => v.to === pid || v.from === pid).map((v) => ({ id: v.id, game: v.game, bet: v.bet, mine: v.from === pid, who: nameOf(w, v.from === pid ? v.to : v.from), koma: v.koma ? v.koma.name : null }));
    gb.koma = { last: t.koma.last, oya: [0, 1, 2].map((i) => oyaFor(t.koma, i)) };
    const view = (T, extra) => { const id = T.by[pid], g = id && T.g[id]; if (!g) return null; const me = idxOf(g, pid); return Object.assign({ bet: g.bet, me, nm: g.nm, pvp: g.pl[1] !== 'oya', turn: g.turn, ev: g.ev, seq: g.seq, done: g.done ? g.res[pid] || { r: 0, gain: 0 } : null, stale: !g.done && g.turn !== me && g.pl[1 - me] !== 'oya' && now - g.lastT > STALE }, extra(g)); };
    const act = (T) => Object.values(T.g).filter((g) => !g.done).map((g) => g.nm.join('対'));
    gb.kai = { last: t.kai.last, players: act(t.kai), g: view(t.kai, (g) => ({ own: g.own, face: g.own.map((x, i) => (x >= 0 ? g.deck[i] : null)), pick: g.pick, pf: g.pick >= 0 ? g.deck[g.pick] : null, sc: g.sc })) };
    gb.sugoroku = { last: t.sugoroku.last, players: act(t.sugoroku), g: view(t.sugoroku, (g) => ({ pos: g.pos, rest: g.rest })) };
    return r;
  };

  // ---- 称号 ----
  if (SIM.defTitle) SIM.defTitle({ id: 'komameijin', name: '独楽名人', desc: '自分で削った独楽で胴元を負かし続けた者。', cond: '独楽回しで10回勝つ', order: 53, check: (w, p) => (p.kmWin || 0) >= 10 });
})();
