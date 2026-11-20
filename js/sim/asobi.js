// 2.62.0 賭場の遊びを3つ足す：独楽回し（自分で木から削った「マイ独楽」で胴元の独楽と勝負）・貝合わせ（胴元と札ならぬ貝をめくり合う）・絵双六（上洛双六で胴元と競走）
//  独楽：木を選び、轆轤（ろくろ）で回る木を自分のタップ／クリックで削り、色を付けて仕上げる（仕上げた時に木の代金を払う）。
//   形から重さ・回る力・安定が決まり（SGK.KOMA.phys）、勝負は同じ乱数の種から誰の画面でも同じ動きになる（SGK.KOMA.battle）。勝ち負けはホストが決める
//  貝合わせ・双六：一人ずつ胴元と勝負する（同じ町の人には、卓の様子と前の勝負の結果が見える）
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
    koma: { name: '独楽回し', rule: '自分で削った独楽と胴元の独楽を盥（たらい）で回し、先に倒れるか盥から飛び出した方の負け。勝てば2倍。掛け金が大きいほど胴元は強い独楽を出します。投げる時は力の目盛りを「ここ」で止めると強く回せます。' },
    kai: { name: '貝合わせ', rule: '伏せた24の貝から2つずつめくり、絵の合う対（つい）を取ります。合えば続けてめくれます。胴元と交互にめくり、多く取った方の勝ち（2倍）。同じ数なら賭け金が戻ります。' },
    sugoroku: { name: '絵双六', rule: '岡崎から京をめざす上洛双六。胴元と交互に賽を振り、先に「上がり」に着いた方の勝ち（2倍）。ちょうどで上がれないと、余った分だけ戻ります。' },
  };
  const tableOf = (w, sid) => { w.asobi = w.asobi || {}; const t = (w.asobi[sid] = w.asobi[sid] || {}); t.koma = t.koma || { n: 0, last: null, oya: {} }; t.kai = t.kai || { n: 0, last: null, g: {} }; t.sugoroku = t.sugoroku || { n: 0, last: null, g: {} }; return t; };
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

  // ---- 貝合わせ ----
  A.KAI = ['松', '梅', '桜', '菊', '紅葉', '竹', '鶴', '月', '波', '富士', '扇', '藤'];
  const shuffle = (w, a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(SIM.rand(w) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  SIM.commands.kaiStart = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.kai;
    if (T.g[p.id] && !T.g[p.id].done) return SAY(p.id, 'もう勝負の最中です');
    const bet = betOk(w, p, c.qty); if (!bet) return;
    p.money -= bet; p.gbPlay = (p.gbPlay || 0) + 1;
    const deck = shuffle(w, [...A.KAI.keys(), ...A.KAI.keys()]);
    T.g[p.id] = { bet, deck, own: Array(deck.length).fill(-1), pick: -1, me: 0, oya: 0, mem: {}, ev: [], seq: 0, t: Date.now() };
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
      const hit = g.deck[a] === g.deck[b]; kaiEv(g, { who: 'oya', a, b, fa: g.deck[a], fb: g.deck[b], hit });
      if (!hit) return;
      g.own[a] = g.own[b] = 1; g.oya++; delete g.mem[a]; delete g.mem[b];
    }
  }
  function kaiEnd(w, p, T, g, quit) {
    const r = quit ? -1 : g.me > g.oya ? 1 : g.me < g.oya ? -1 : 0, ret = r > 0 ? g.bet * 2 : r === 0 ? g.bet : 0; p.money += ret;
    T.n++; T.last = { id: T.n, t: Date.now(), by: p.name, pid: p.id, r, gain: ret - g.bet, head: quit ? `${p.name}が勝負を降りた（${g.me}対${g.oya}）` : `${p.name} ${g.me}対 胴元 ${g.oya}`, lines: [`${p.name}（${money(g.bet)}）→ ${r > 0 ? '勝ち ' + sign(g.bet) : r < 0 ? '負け ' + sign(-g.bet) : '引き分け（返却）'}`] };
    g.done = { r, gain: ret - g.bet }; g.end = Date.now();
    SAY(p.id, `貝合わせ：${quit ? '降りた' : r > 0 ? '勝ち' : r < 0 ? '負け' : '引き分け'}（${g.me}対${g.oya}）`);
  }
  SIM.commands.kaiFlip = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.kai, g = T.g[p.id]; if (!g || g.done) return;
    const i = +c.i; if (!(i >= 0 && i < g.deck.length) || g.own[i] >= 0 || i === g.pick) return;
    if (g.pick < 0) { g.pick = i; g.mem[i] = 1; kaiEv(g, { who: 'me', a: i, fa: g.deck[i] }); return; }
    const a = g.pick, hit = g.deck[a] === g.deck[i]; g.pick = -1; g.mem[i] = 1;
    kaiEv(g, { who: 'me', a, b: i, fa: g.deck[a], fb: g.deck[i], hit });
    if (hit) { g.own[a] = g.own[i] = 0; g.me++; delete g.mem[a]; delete g.mem[i]; } else kaiOya(w, g);
    if (g.own.every((x) => x >= 0)) kaiEnd(w, p, T, g);
  };
  SIM.commands.kaiQuit = (w, p) => { const o = ok(w, p); if (!o) return; const T = o.t.kai, g = T.g[p.id]; if (!g) return; if (g.done) { delete T.g[p.id]; return; } kaiEnd(w, p, T, g, true); };

  // ---- 絵双六（上洛双六） ----
  A.SG = [
    ['岡崎', '振り出し'], ['藤川'], ['池鯉鮒', '茶屋でひと息（もう一度）', 'again'], ['鳴海'], ['桶狭間', '落武者狩り（3つ戻る）', 'mv', -3], ['熱田', '熱田さまに参る（2つ進む）', 'mv', 2],
    ['宮の渡し'], ['七里の渡し', '時化で船止め（一回休み）', 'rest'], ['桑名'], ['四日市'], ['石薬師', '薬師さまのご利益（1つ進む）', 'mv', 1], ['庄野', '足をくじく（2つ戻る）', 'mv', -2],
    ['亀山'], ['関', '関所の取り調べ（一回休み）', 'rest'], ['坂下'], ['鈴鹿峠', '山賊の巣（6つ戻る）', 'mv', -6], ['土山'], ['水口', '馬を借りる（3つ進む）', 'mv', 3],
    ['石部'], ['草津'], ['瀬田の唐橋', '橋が焼け落ちた（一回休み）', 'rest'], ['大津'], ['逢坂の関', '抜け道を見つける（2つ進む）', 'mv', 2], ['山科'],
    ['蹴上', '都の手前で道に迷う（4つ戻る）', 'mv', -4], ['粟田口'], ['三条大橋', '人込みにもまれる（もう一度）', 'again'], ['四条', '火の手が上がる（5つ戻る）', 'mv', -5], ['二条'], ['京', '上がり'],
  ];
  const GOAL = A.SG.length - 1;
  function sgMove(w, g, who, evs) { // 1回分（もう一度なら続けて）。上がったら true
    let again = 0;
    do {
      again = 0;
      if (g.rest[who]) { g.rest[who] = 0; evs.push({ who, rest: 1 }); return false; }
      const d = 1 + Math.floor(SIM.rand(w) * 6), from = g.pos[who]; let to = from + d; if (to > GOAL) to = GOAL - (to - GOAL);
      const sq = A.SG[to], e = { who, d, from, to };
      if (to !== GOAL && sq[2] === 'mv') { e.to2 = Math.max(0, Math.min(GOAL, to + sq[3])); g.pos[who] = e.to2; }
      else { g.pos[who] = to; if (sq[2] === 'rest') g.rest[who] = 1; if (sq[2] === 'again') again = 1; }
      evs.push(e);
      if (g.pos[who] === GOAL) return true;
    } while (again);
    return false;
  }
  SIM.commands.sgStart = (w, p, c) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku;
    if (T.g[p.id] && !T.g[p.id].done) return SAY(p.id, 'もう勝負の最中です');
    const bet = betOk(w, p, c.qty); if (!bet) return;
    p.money -= bet; p.gbPlay = (p.gbPlay || 0) + 1;
    T.g[p.id] = { bet, pos: { me: 0, oya: 0 }, rest: { me: 0, oya: 0 }, ev: [], seq: 0, t: Date.now() };
  };
  SIM.commands.sgRoll = (w, p) => {
    const o = ok(w, p); if (!o) return; const T = o.t.sugoroku, g = T.g[p.id]; if (!g || g.done) return;
    const evs = []; let win = 0;
    if (sgMove(w, g, 'me', evs)) win = 1; else if (sgMove(w, g, 'oya', evs)) win = -1;
    for (const e of evs) { g.seq++; e.s = g.seq; g.ev.push(e); } while (g.ev.length > 30) g.ev.shift();
    if (win) {
      const ret = win > 0 ? g.bet * 2 : 0; p.money += ret; g.done = { r: win, gain: ret - g.bet }; g.end = Date.now();
      T.n++; T.last = { id: T.n, t: Date.now(), by: p.name, pid: p.id, r: win, gain: ret - g.bet, head: `${win > 0 ? p.name : '胴元'}が先に京へ上がった`, lines: [`${p.name}（${money(g.bet)}）→ ${win > 0 ? '勝ち ' + sign(g.bet) : '負け ' + sign(-g.bet)}`] };
      SAY(p.id, `絵双六：${win > 0 ? '勝ち' : '負け'}`);
    }
  };
  SIM.commands.sgQuit = (w, p) => { const o = ok(w, p); if (!o) return; const T = o.t.sugoroku, g = T.g[p.id]; if (!g) return; if (!g.done) { g.done = { r: -1, gain: -g.bet }; T.n++; T.last = { id: T.n, t: Date.now(), by: p.name, pid: p.id, r: -1, gain: -g.bet, head: `${p.name}が勝負を降りた`, lines: [] }; } delete T.g[p.id]; };

  // ---- 見せる情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    r.me.koma = p.koma || []; r.me.komaUse = p.komaUse || null;
    if (!r.here || !r.here.gamble) return r;
    const t = tableOf(w, r.here.id), gb = r.here.gamble;
    gb.koma = { last: t.koma.last, oya: [0, 1, 2].map((i) => oyaFor(t.koma, i)) };
    const kg = t.kai.g[pid];
    gb.kai = { last: t.kai.last, players: Object.keys(t.kai.g).filter((id) => !t.kai.g[id].done).map((id) => nameOf(w, id)),
      g: kg ? { bet: kg.bet, own: kg.own, face: kg.own.map((x, i) => (x >= 0 ? kg.deck[i] : null)), pick: kg.pick, pf: kg.pick >= 0 ? kg.deck[kg.pick] : null, me: kg.me, oya: kg.oya, ev: kg.ev, seq: kg.seq, done: kg.done || null } : null };
    const sg = t.sugoroku.g[pid];
    gb.sugoroku = { last: t.sugoroku.last, players: Object.keys(t.sugoroku.g).filter((id) => !t.sugoroku.g[id].done).map((id) => nameOf(w, id)),
      g: sg ? { bet: sg.bet, pos: sg.pos, rest: sg.rest, ev: sg.ev, seq: sg.seq, done: sg.done || null } : null };
    return r;
  };

  // ---- 称号 ----
  if (SIM.defTitle) SIM.defTitle({ id: 'komameijin', name: '独楽名人', desc: '自分で削った独楽で胴元を負かし続けた者。', cond: '独楽回しで10回勝つ', order: 53, check: (w, p) => (p.kmWin || 0) >= 10 });
})();
