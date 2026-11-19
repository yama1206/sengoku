// 音（BGM・効果音）。Web Audio でその場で鳴らす和風の音
// 箏・三味線・尺八・太鼓・鼓・拍子木・鈴・法螺貝ふうの音を合成し、場面ごとに曲を自動で作り続ける
// 2.15.0 AIで作った曲のファイルがある場面（TRACKS）は、読み込めたらそちらを繰り返し流す
(function () {
  const A = (SGK.AUDIO = {});
  // 音量は 0〜10 の11段階（全体・BGM・効果音）。0 は消音
  const MAX = 10, BGM_MAX = 0.5, SFX_MAX = 1.0, MASTER_MAX = 0.9;
  let opt = { v: 2, all: 10, bgm: 5, sfx: 6 };
  try {
    const o = JSON.parse(localStorage.getItem('sgk-audio') || '{}');
    if (o.v !== 2) { if (o.bgm != null) opt.bgm = [0, 3, 5, 8][o.bgm] ?? 5; if (o.sfx != null) opt.sfx = [0, 3, 6, 9][o.sfx] ?? 6; } // 旧4段階から移す
    else Object.assign(opt, o);
  } catch (e) {}
  const LV_BGM = new Proxy({}, { get: (_, k) => (+k / MAX) * BGM_MAX }), LV_SFX = new Proxy({}, { get: (_, k) => (+k / MAX) * SFX_MAX });
  const saveOpt = () => { try { localStorage.setItem('sgk-audio', JSON.stringify(opt)); } catch (e) {} };

  let ctx = null, master, bgmBus, sfxBus, rev, noiseBuf;
  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = MASTER_MAX * opt.all / MAX; master.connect(ctx.destination);
    bgmBus = ctx.createGain(); bgmBus.gain.value = LV_BGM[opt.bgm]; bgmBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = LV_SFX[opt.sfx]; sfxBus.connect(master);
    // 残響（お寺の広間くらい）
    rev = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    rev.buffer = ir;
    const rg = ctx.createGain(); rg.gain.value = 0.35; rev.connect(rg); rg.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    setInterval(() => { schedule(); dinTick(); }, 80);
    return true;
  }
  // 最初の操作で音を出せるようにする（ブラウザの決まり）
  A.unlock = () => { if (init() && ctx.state !== 'running') ctx.resume(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, A.unlock, { capture: true }));

  // ---------- 音色 ----------
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function out(node, bus, wet) { node.connect(bus); if (wet) { const g = ctx.createGain(); g.gain.value = wet; node.connect(g); g.connect(rev); } }
  function env(t, a, peak, dec) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); return g; }
  function noise(t, dur) { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.start(t); n.stop(t + dur); return n; }
  function osc(type, f, t, dur) { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur); return o; }

  // 箏：はじいた弦。明るく始まってすぐ丸くなる
  function koto(t, m, vol, bus = bgmBus) {
    const f = hz(m), dec = 1.6, g = env(t, 0.004, vol, dec), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(650, t + 0.35);
    const a = osc('triangle', f * 1.012, t, dec + 0.1); a.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const b = osc('sawtooth', f, t, dec + 0.1), bg = ctx.createGain(); bg.gain.value = 0.25;
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); out(g, bus, 0.5);
  }
  // 三味線：短く硬い音、少しさわりの響き
  function shami(t, m, vol, bus = bgmBus) {
    const f = hz(m), dec = 0.45, g = env(t, 0.003, vol, dec), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(1100, t + 0.12);
    const a = osc('sawtooth', f * 1.02, t, dec + 0.05); a.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const b = osc('square', f * 2.003, t, dec + 0.05), bg = ctx.createGain(); bg.gain.value = 0.12;
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); out(g, bus, 0.25);
  }
  // 尺八：息の混じった笛。少ししゃくり上げて、のばすと揺れる
  function flute(t, m, dur, vol, bus = bgmBus) {
    const f = hz(m), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.setValueAtTime(vol, t + Math.max(0.16, dur - 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    const o = osc('sine', f * 0.96, t, dur + 0.4); o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
    const lfo = osc('sine', 5.2, t, dur + 0.4), lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(dur, 0.8)); lfo.connect(lg); lg.connect(o.frequency);
    const o2 = osc('triangle', f * 2, t, dur + 0.4), g2 = ctx.createGain(); g2.gain.value = 0.08; o2.connect(g2); g2.connect(g);
    const n = noise(t, dur + 0.4), bp = ctx.createBiquadFilter(), ng = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; ng.gain.value = 0.18; n.connect(bp); bp.connect(ng); ng.connect(g);
    o.connect(g); out(g, bus, 0.6);
  }
  // 太鼓：低くドンと響く
  function taiko(t, vol, big, bus = bgmBus) {
    const o = osc('sine', big ? 110 : 150, t, 1.2), g = env(t, 0.003, vol, big ? 0.9 : 0.45);
    o.frequency.exponentialRampToValueAtTime(big ? 42 : 60, t + 0.15); o.connect(g);
    const n = noise(t, 0.15), lp = ctx.createBiquadFilter(), ng = env(t, 0.002, vol * 0.6, 0.08); lp.type = 'lowpass'; lp.frequency.value = 400; n.connect(lp); lp.connect(ng);
    out(g, bus, 0.3); out(ng, bus, 0.2);
  }
  // 鼓：ポンと高く鳴る
  function tsuzumi(t, vol, bus = bgmBus) {
    const o = osc('sine', 560, t, 0.4), g = env(t, 0.002, vol, 0.25);
    o.frequency.exponentialRampToValueAtTime(270, t + 0.07); o.connect(g); out(g, bus, 0.4);
  }
  // 拍子木：カンと乾いた木の音
  function hyoshigi(t, vol, bus = bgmBus) {
    const n = noise(t, 0.08), bp = ctx.createBiquadFilter(), g = env(t, 0.001, vol, 0.06);
    bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 9; n.connect(bp); bp.connect(g);
    const o = osc('sine', 1750, t, 0.08), og = env(t, 0.001, vol * 0.5, 0.05); o.connect(og); og.connect(g);
    out(g, bus, 0.25);
  }
  // 2.12.4 賭場の音：木の賽が当たる音（高さを変えて）・ずしんと伏せる音・紙の札のこすれ
  function woodTap(t, vol, f, bus = sfxBus) {
    const n = noise(t, 0.05), bp = ctx.createBiquadFilter(), g = env(t, 0.001, vol, 0.035);
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; n.connect(bp); bp.connect(g);
    const o = osc('triangle', f * 0.62, t, 0.05), og = env(t, 0.001, vol * 0.35, 0.03); o.connect(og); og.connect(g);
    out(g, bus, 0.15);
  }
  function thud(t, vol, f, bus = sfxBus) {
    const o = osc('sine', f, t, 0.3), g = env(t, 0.002, vol, 0.18); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.12); o.connect(g); out(g, bus, 0.2);
    const n = noise(t, 0.12), lp = ctx.createBiquadFilter(), ng = env(t, 0.001, vol * 0.5, 0.08); lp.type = 'lowpass'; lp.frequency.value = 900; n.connect(lp); lp.connect(ng); out(ng, bus, 0.1);
  }
  function rustle(t, vol, dur, f, bus = sfxBus) {
    const n = noise(t, dur), hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'bandpass'; hp.frequency.value = f; hp.Q.value = 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur); n.connect(hp); hp.connect(g); out(g, bus, 0.1);
  }
  // 鈴・りん：澄んだ金属の余韻
  function bell(t, f, vol, dec, bus = sfxBus) {
    [[1, 1], [2.76, 0.4], [5.4, 0.2], [8.9, 0.08]].forEach(([r, a]) => {
      const o = osc('sine', f * r, t, dec + 0.1), g = env(t, 0.003, vol * a, dec / r ** 0.4); o.connect(g); out(g, bus, 0.5);
    });
  }
  // 法螺貝：ぶおーっと低くしゃくり上げる
  function horagai(t, vol, bus = sfxBus) {
    const f = 233, dur = 1.5, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = osc('sawtooth', f * 0.78, t, dur), lp = ctx.createBiquadFilter(); o.frequency.exponentialRampToValueAtTime(f, t + 0.4); o.frequency.setValueAtTime(f, t + 1.0); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 4; o.connect(lp); lp.connect(g); out(g, bus, 0.6);
  }

  // ---------- 0.68.0 戦の音（距離で小さく、左右に振る） ----------
  // 鳴らす先：音量 v と左右 pan(-1〜1) をつけた出口をつくる
  function dest(t, v, pan) {
    const g = ctx.createGain(); g.gain.value = v;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); g.connect(p); out(p, sfxBus, 0.18 + (1 - Math.min(1, v)) * 0.3); }
    else out(g, sfxBus, 0.25);
    return g;
  }
  // 風切り：刀や槍を振るヒュッ
  function swish(t, v, pan, hi = 1) {
    const d = dest(t, v, pan), n = noise(t, 0.22), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.setValueAtTime(900 * hi, t); bp.frequency.exponentialRampToValueAtTime(3800 * hi, t + 0.07); bp.frequency.exponentialRampToValueAtTime(700 * hi, t + 0.2);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp); bp.connect(g); g.connect(d);
  }
  // 刃と刃・刃と具足がぶつかるキン
  function clash(t, v, pan, big) {
    const d = dest(t, v, pan), f = (big ? 1700 : 2100) * (0.85 + R() * 0.35);
    [[1, 0.5, 0.35], [1.47, 0.3, 0.22], [2.31, 0.22, 0.15], [3.13, 0.12, 0.1]].forEach(([r, a, dec]) => { const o = osc('sine', f * r, t, dec * (big ? 2.2 : 1.4) + 0.05), g = env(t, 0.001, a, dec * (big ? 2 : 1.3)); o.connect(g); g.connect(d); });
    const n = noise(t, 0.05), hp = ctx.createBiquadFilter(), ng = env(t, 0.001, 0.7, 0.035); hp.type = 'highpass'; hp.frequency.value = 3000; n.connect(hp); hp.connect(ng); ng.connect(d);
  }
  // 体に当たるドス
  function thud(t, v, pan, f = 1) {
    const d = dest(t, v, pan), o = osc('sine', 140 * f, t, 0.25), g = env(t, 0.002, 0.8, 0.16);
    o.frequency.exponentialRampToValueAtTime(55 * f, t + 0.12); o.connect(g); g.connect(d);
    const n = noise(t, 0.12), lp = ctx.createBiquadFilter(), ng = env(t, 0.001, 0.6, 0.07); lp.type = 'lowpass'; lp.frequency.value = 1300 * f; n.connect(lp); lp.connect(ng); ng.connect(d);
  }
  // 人の声（うっ・ぐあっ・おおー）。のこぎり波に口の形のフィルター
  function voice(t, v, pan, f0, f1, dur, vow = 'a') {
    const d = dest(t, v, pan), F = { a: [750, 1200], o: [480, 850], u: [350, 1300] }[vow], g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + Math.min(0.06, dur * 0.2)); g.gain.setValueAtTime(0.5, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o = osc('sawtooth', f0, t, dur + 0.05); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const vib = osc('sine', 6 + R() * 3, t, dur + 0.05), vg = ctx.createGain(); vg.gain.value = f0 * 0.03; vib.connect(vg); vg.connect(o.frequency);
    F.forEach((ff, i) => { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 7; const bg = ctx.createGain(); bg.gain.value = i ? 0.5 : 1; o.connect(bp); bp.connect(bg); bg.connect(g); });
    g.connect(d);
  }
  // 鉄砲：パンと鋭く、ドーンと低く、遠くまで響く
  function gunshot(t, v, pan) {
    const d = dest(t, v, pan), n = noise(t, 0.6), lp = ctx.createBiquadFilter(), g = env(t, 0.001, 1, 0.45);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(400, t + 0.3); n.connect(lp); lp.connect(g); g.connect(d);
    const o = osc('sine', 120, t, 0.5), og = env(t, 0.002, 0.9, 0.35); o.frequency.exponentialRampToValueAtTime(38, t + 0.3); o.connect(og); og.connect(d);
    const rg = ctx.createGain(); rg.gain.value = v * 0.5; g.connect(rg); rg.connect(rev);
  }
  // 弓：弦のビンと矢のヒュン
  function bowshot(t, v, pan) {
    const d = dest(t, v, pan), o = osc('triangle', 210, t, 0.3), g = env(t, 0.001, 0.6, 0.2); o.frequency.exponentialRampToValueAtTime(150, t + 0.15); o.connect(g); g.connect(d);
    swish(t + 0.03, v * 0.6, pan, 1.6);
  }
  // 倒れる：ドサッ＋ときどき声
  function fall(t, v, pan) {
    if (R() < 0.6) voice(t, v * 0.55, pan, 190 + R() * 60, 90, 0.35 + R() * 0.2, R() < 0.5 ? 'a' : 'u');
    thud(t + 0.18, v * 0.8, pan, 0.6);
  }
  // 鬨の声：大勢で「えい、えい、おー」の「おー」
  function shout(t, v, vow, dur) { for (let i = 0; i < 10; i++) { const f = 125 + R() * 80; voice(t + R() * 0.05, v * 0.25, (R() - 0.5) * 1.4, f, f * (vow === 'o' ? 1.15 : 0.95), dur + R() * 0.15, vow); } } /* 1.6.58 大勢の掛け声 */
  function warcry(t, v) {
    for (let i = 0; i < 9; i++) { const f = 120 + R() * 90; voice(t + R() * 0.25, v * 0.25, (R() - 0.5) * 1.4, f * 0.9, f * 1.08, 1.4 + R() * 0.5, 'o'); }
  }
  // 遠くの合戦のざわめき（ずっと鳴らして、激しさで音量を変える）
  let din = null, dinLv = 0, dinT = 0;
  function dinStart() {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.playbackRate.value = 0.7;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.8;
    const am = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 3.3; lg.gain.value = 0.35; am.gain.value = 0.65; lfo.connect(lg); lg.connect(am.gain); lfo.start();
    const g = ctx.createGain(); g.gain.value = 0;
    n.connect(bp); bp.connect(am); am.connect(g); out(g, sfxBus, 0.4); n.start();
    din = g;
  }
  const BUDGET = 10; let used = 0, usedT = 0;
  // name：swing/clash/thud/hurt/block/gun/bow/fall、v：音量（距離込み）、pan：左右
  A.at = (name, v, pan) => {
    if (!ctx || ctx.state !== 'running' || !opt.sfx || v < 0.03) return;
    const now = ctx.currentTime; if (now - usedT > 0.12) { used = 0; usedT = now; } if (used >= BUDGET && v < 0.6) return; used++;
    const t = now + 0.01 + R() * 0.02;
    if (name === 'swing') swish(t, v * 0.35, pan);
    else if (name === 'clash') clash(t, v * 0.35, pan);
    else if (name === 'thud') thud(t, v * 0.5, pan);
    else if (name === 'hurt') { thud(t, v * 0.8, pan); voice(t + 0.02, v * 0.5, pan, 170, 120, 0.22, 'u'); }
    else if (name === 'block') clash(t, v * 0.6, pan, true);
    else if (name === 'gun') gunshot(t, v * 0.6, pan);
    else if (name === 'bow') bowshot(t, v * 0.45, pan);
    else if (name === 'fall') fall(t, v * 0.5, pan);
    else if (name === 'cry') warcry(t, v * 0.5);
  };
  // 激しさ（0〜1くらい）を毎フレーム渡す。渡されなくなったら静かになる
  A.din = (lv) => { dinLv = lv; dinT = ctx ? ctx.currentTime : 0; };
  function dinTick() {
    if (!ctx || ctx.state !== 'running') return;
    if (!din) { if (dinLv <= 0) return; dinStart(); }
    const now = ctx.currentTime, lv = now - dinT > 0.4 ? 0 : Math.min(1, dinLv);
    din.gain.setTargetAtTime(opt.sfx ? lv * 0.12 : 0, now, 0.5);
  }

  // ---------- 効果音 ----------
  const SFX = {
    click: (t) => hyoshigi(t, 0.35, sfxBus),
    open: (t) => { koto(t, 74, 0.3, sfxBus); koto(t + 0.07, 79, 0.25, sfxBus); },
    close: (t) => { koto(t, 79, 0.22, sfxBus); koto(t + 0.07, 74, 0.2, sfxBus); },
    coin: (t) => { bell(t, 2093, 0.18, 0.35); bell(t + 0.08, 2637, 0.16, 0.45); },
    arrive: (t) => bell(t, 659, 0.3, 2.5),
    news: (t) => tsuzumi(t, 0.35, sfxBus),
    battleStart: (t) => { horagai(t, 0.35); taiko(t + 0.1, 0.9, true, sfxBus); taiko(t + 0.55, 0.7, false, sfxBus); taiko(t + 0.8, 0.9, true, sfxBus); warcry(t + 1.3, 0.5); },
    slash: (t) => swish(t, 0.5, 0),
    hit: (t) => clash(t, 0.4, 0),
    bow: (t) => bowshot(t, 0.5, 0),
    gun: (t) => gunshot(t, 0.7, 0),
    battleEnd: (t) => { bell(t, 196, 0.4, 3.5); taiko(t, 0.6, true, sfxBus); },
    /* 1.6.58 結果の音 */
    victory: (t) => { // 勝ち鬨：太鼓の連打→法螺貝→箏の駆け上がり→鐘→「えい、えい、おう！」
      for (let i = 0; i < 10; i++) taiko(t + i * 0.09 * (1 - i * 0.04), 0.35 + i * 0.05, i % 3 === 0, sfxBus);
      taiko(t + 0.85, 1, true, sfxBus); taiko(t + 1.05, 0.8, false, sfxBus);
      horagai(t + 0.85, 0.32);
      [62, 64, 67, 69, 71, 74, 76, 79, 81, 86].forEach((m, i) => koto(t + 0.9 + i * 0.07, m, 0.22, sfxBus));
      [74, 79, 83, 86].forEach((m) => koto(t + 1.65, m, 0.2, sfxBus)); bell(t + 1.65, 880, 0.2, 3); bell(t + 1.65, 1318, 0.12, 2.5);
      shout(t + 2.3, 0.28, 'a', 0.35); shout(t + 2.85, 0.28, 'a', 0.35); shout(t + 3.4, 0.38, 'o', 0.9); taiko(t + 2.3, 0.7, true, sfxBus); taiko(t + 2.85, 0.7, true, sfxBus); taiko(t + 3.4, 1, true, sfxBus);
    },
    defeat: (t) => { taiko(t, 0.7, true, sfxBus); [69, 68, 64, 62, 57].forEach((m, i) => koto(t + 0.2 + i * 0.32, m, 0.2, sfxBus)); bell(t + 1.9, 147, 0.3, 4); },
    promote: (t) => { tsuzumi(t, 0.4, sfxBus); tsuzumi(t + 0.18, 0.4, sfxBus); [67, 71, 74, 79].forEach((m, i) => koto(t + 0.35 + i * 0.09, m, 0.24, sfxBus)); bell(t + 0.75, 1046, 0.22, 3); bell(t + 0.75, 1568, 0.12, 2.5); taiko(t + 0.75, 0.6, true, sfxBus); },
    quest: (t) => { bell(t, 2093, 0.16, 0.4); bell(t + 0.08, 2637, 0.15, 0.5); koto(t + 0.15, 74, 0.22, sfxBus); koto(t + 0.27, 79, 0.24, sfxBus); koto(t + 0.27, 86, 0.14, sfxBus); },
    lost: (t) => { [2637, 2349, 2093, 1760].forEach((f, i) => bell(t + i * 0.07, f, 0.12, 0.3)); koto(t + 0.35, 57, 0.2, sfxBus); },
    join: (t) => { horagai(t, 0.25); taiko(t + 0.2, 0.8, true, sfxBus); taiko(t + 0.45, 0.6, false, sfxBus); },
    /* 2.12.4 賭場 */
    diceShake: (t) => { for (let i = 0; i < 9; i++) woodTap(t + i * 0.055 + Math.random() * 0.02, 0.22, 1800 + Math.random() * 1600); },
    diceRoll: (t) => { let tt = t; for (let i = 0; i < 11; i++) { tt += 0.05 + i * i * 0.004; woodTap(tt, 0.4 * (1 - i / 13), 1500 + Math.random() * 2000); } },
    tsuboDown: (t) => { thud(t, 0.75, 140); woodTap(t + 0.01, 0.2, 900); },
    tsuboOpen: (t) => { rustle(t, 0.25, 0.25, 1800); hyoshigi(t + 0.22, 0.5, sfxBus); },
    card: (t) => rustle(t, 0.3, 0.12, 3500),
    gallop: (t) => { for (let i = 0; i < 16; i++) { const b = t + Math.floor(i / 4) * 0.42 + (i % 4) * 0.075; thud(b, 0.18 + Math.random() * 0.08, 90 + Math.random() * 40); } },
    zawa: (t) => { for (let i = 0; i < 3; i++) rustle(t + i * 0.25, 0.08, 0.9, 350 + Math.random() * 250); },
    gbWin: (t) => { [1568, 2093, 2637].forEach((f, i) => bell(t + i * 0.09, f, 0.16, 0.8)); taiko(t + 0.3, 0.4, true, sfxBus); },
    gbLose: (t) => { koto(t, 50, 0.25, sfxBus); koto(t + 0.18, 45, 0.22, sfxBus); },
  };
  let lastSfx = {};
  A.sfx = (name) => {
    if (!ctx || ctx.state !== 'running' || !opt.sfx || !SFX[name]) return;
    const now = ctx.currentTime; if (lastSfx[name] && now - lastSfx[name] < 0.05) return; lastSfx[name] = now;
    SFX[name](now + 0.01);
  };

  // ---------- BGM（場面ごとに自動で作曲し続ける） ----------
  const YO = [0, 2, 5, 7, 9], IN = [0, 1, 5, 7, 8]; // 陽音階・陰音階（都節）
  const R = Math.random, pick = (a) => a[Math.floor(R() * a.length)];
  function note(sc, root, deg) { const o = Math.floor(deg / 5), i = ((deg % 5) + 5) % 5; return root + 12 * o + sc[i]; }
  let mel = 5, chord = 0;
  function walk(lo, hi, jump = 2) { mel = Math.max(lo, Math.min(hi, mel + pick([-jump, -1, -1, 1, 1, jump, 0]))); return mel; }

  // step は8分音符ひとつ。bar は小節（8ステップ）
  const SCENES = {
    title: { bpm: 58, play(s, t, b) {
      const sc = IN, root = 62;
      if (s % 32 === 0) chord = pick([0, 0, -2, 3]);
      if (s % 2 === 0 && R() < 0.8) koto(t, note(sc, root - 12, chord + [0, 2, 4, 5, 7, 5, 4, 2][(s % 16) / 2]), 0.22);
      if (s % 8 === 0) koto(t, note(sc, root - 24, chord), 0.2);
      if (s % 8 === 4 && R() < 0.4) flute(t, note(sc, root, walk(3, 9)), b * pick([4, 6, 8]), 0.13);
    } },
    day: { bpm: 74, play(s, t, b) {
      const sc = YO, root = 62;
      if (s % 16 === 0) chord = pick([0, 3, 1, 0, -1]);
      if (s % 2 === 0 && R() < 0.85) koto(t, note(sc, root - 12, chord + [0, 2, 4, 5][(s / 2) % 4]), 0.2);
      if (s % 8 === 0) koto(t, note(sc, root - 24, chord), 0.18);
      if (s % 4 === 0 && R() < 0.5) flute(t, note(sc, root, walk(2, 10)), b * pick([2, 3, 4, 6]), 0.12);
    } },
    night: { bpm: 52, play(s, t, b) {
      const sc = IN, root = 57;
      if (s % 2 === 0 && R() < 0.35) koto(t, note(sc, root, walk(-2, 7)), 0.16);
      if (s % 16 === 0) koto(t, note(sc, root - 12, pick([0, 0, 2, -1])), 0.16);
      if (s % 16 === 8 && R() < 0.35) flute(t, note(sc, root, walk(0, 7, 1)), b * pick([6, 8]), 0.09);
      if (s % 32 === 30 && R() < 0.5) tsuzumi(t, 0.12);
    } },
    town: { bpm: 104, play(s, t, b) {
      const sc = YO, root = 62;
      if (R() < (s % 2 ? 0.45 : 0.85)) shami(t, note(sc, root, walk(0, 9)), 0.16);
      if (s % 8 === 0) shami(t, note(sc, root - 12, pick([0, 0, 3])), 0.14);
      if (s % 8 === 0 || s % 8 === 5) tsuzumi(t, 0.18);
      if (s % 16 === 14) hyoshigi(t, 0.12);
    } },
    // 2.14.3 町の中の行き先ごとの曲
    // 賭場：薄暗く色っぽい。低い三味線のくり返しに鼓の「ポン」、ときどき尺八がすべりこむ
    gamble: { bpm: 84, play(s, t, b) {
      const sc = IN, root = 57, k = s % 8;
      if (s % 32 === 0) chord = pick([0, 0, -1, 2]);
      if (k === 0 || k === 3 || k === 6) shami(t, note(sc, root - 12, chord + [0, 2, 1][k / 3]), 0.17);
      if (k === 2 || k === 5) tsuzumi(t, 0.14);
      if (k === 7 && R() < 0.5) hyoshigi(t, 0.08);
      if (s % 2 === 1 && R() < 0.3) shami(t, note(sc, root, chord + walk(0, 7)), 0.1);
      if (s % 16 === 8 && R() < 0.45) flute(t, note(sc, root + 12, walk(0, 6, 1)), b * pick([3, 5]), 0.08);
    } },
    // 練兵所：勇ましい行進。太鼓の刻みに拍子木、陽音階の笛が長くのびる
    renpei: { bpm: 112, play(s, t, b) {
      const sc = YO, root = 55, k = s % 8;
      if (k === 0) taiko(t, 0.5, true);
      if (k === 4) taiko(t, 0.38, false);
      if (k === 6 || (k === 7 && R() < 0.4)) taiko(t, 0.28, false);
      if (k === 2) hyoshigi(t, 0.1);
      if (s % 16 === 0) chord = pick([0, 0, 2, 3]);
      if (k === 0 || k === 4) shami(t, note(sc, root - 12, chord), 0.15);
      if (s % 4 === 0 && R() < 0.75) flute(t, note(sc, root + 12, chord + walk(0, 7)), b * pick([2, 4, 4]), 0.11);
    } },
    // 茶屋：やわらかい箏の分散和音、ときどき尺八
    chaya: { bpm: 66, play(s, t, b) {
      const sc = YO, root = 64;
      if (s % 16 === 0) chord = pick([0, 2, 3, 0]);
      if (s % 2 === 0) koto(t, note(sc, root - 12, chord + [0, 2, 4, 7, 5, 4, 2, 4][(s / 2) % 8]), 0.17);
      if (s % 16 === 0) koto(t, note(sc, root - 24, chord), 0.16);
      if (s % 8 === 6 && R() < 0.35) flute(t, note(sc, root, walk(2, 9, 1)), b * pick([4, 6]), 0.09);
      if (s % 32 === 28 && R() < 0.5) tsuzumi(t, 0.08);
    } },
    // 自宅：静かで温かい。ゆっくりの箏だけ
    home: { bpm: 54, play(s, t, b) {
      const sc = YO, root = 60;
      if (s % 32 === 0) chord = pick([0, 0, 3, -2]);
      if (s % 4 === 0 && R() < 0.85) koto(t, note(sc, root, chord + walk(-1, 6, 1)), 0.14);
      if (s % 16 === 0) koto(t, note(sc, root - 12, chord), 0.15);
      if (s % 16 === 10 && R() < 0.4) koto(t, note(sc, root - 12, chord + 4), 0.11);
    } },
    battle: { bpm: 136, play(s, t, b) {
      const sc = IN, root = 50, k = s % 8;
      if (k === 0) taiko(t, 0.55, true);
      else if (k === 3 || k === 4 || k === 6) taiko(t, 0.35, false);
      else if (k === 7 && R() < 0.5) taiko(t, 0.3, false);
      if (s % 16 === 0) chord = pick([0, 0, 1, -2]);
      if (R() < 0.7) shami(t, note(sc, root + 12, chord + walk(-1, 7)), 0.14);
      if (s % 32 === 16 && R() < 0.6) flute(t, note(sc, root + 24, pick([2, 3, 4])), b * 6, 0.1);
    } },
  };
  SCENES.siege = SCENES.battle; SCENES.market = SCENES.town; // 2.20.0 曲ファイルを読めない時の合成の曲

  let scene = null, want = null, step = 0, nextT = 0, fading = false;
  function setLevel(v, time = 0.6) { if (!ctx) return; const t = ctx.currentTime; bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), t); bgmBus.gain.linearRampToValueAtTime(v, t + time); }
  // 2.5.0 号令：法螺貝・太鼓のあとに声で「〇〇隊、突撃！」（ブラウザの読み上げ。あとで VOICEVOX の音声ファイルに差し替えられる）
  let jaVoice = null;
  const pickVoice = () => { const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || []; const ja = vs.filter((v) => /^ja/i.test(v.lang)); jaVoice = ja.find((v) => /Keita|Ichiro|Otoya|male|男/i.test(v.name)) || ja[0] || null; };
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  A.speak = (text) => {
    if (!window.speechSynthesis || !text || !opt.sfx || !opt.all) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; if (jaVoice) u.voice = jaVoice;
      u.pitch = 0.6; u.rate = 1.15; u.volume = Math.min(1, (opt.sfx / MAX) * (opt.all / MAX) * 1.3); speechSynthesis.speak(u); } catch (e) {}
  };
  A.call = (kind, text) => {
    let wait = 0;
    if (init() && ctx.state === 'running') { const t = ctx.currentTime + 0.02;
      if (kind === 'charge' || kind === 'flank') { horagai(t, 0.4); wait = 900; }
      else if (kind === 'retreat') { bell(t, 880, 0.3, 0.5); bell(t + 0.25, 880, 0.3, 0.5); bell(t + 0.5, 880, 0.3, 0.5); wait = 500; }
      else { taiko(t, 0.8, true, sfxBus); wait = 150; } }
    setTimeout(() => A.speak(text), wait);
  };
  A.scene = (name) => { want = name; };

  // 2.15.0 曲ファイル（AIで作った曲。tools/gen_music.py → tame.py → loop.py）
  // loopStart〜loopEnd（秒）をくり返す。読み込み中・失敗した時は合成の曲を流す
  const TRACKS = {
    // 2.20.0 ユーザーが選んだ曲。前の戦の曲（三味線＋ヘヴィロック）は攻城戦へ
    battle: { url: 'assets/bgm/battle.mp3', loopStart: 7.95, loopEnd: 76.5175, gain: 1 }, // 野戦：太鼓とオーケストラ（s_siege_1671793101）
    siege: { url: 'assets/bgm/siege.mp3', loopStart: 9.58, loopEnd: 84.226, gain: 1 }, // 攻城戦：一騎打ちの曲（三味線＋ヘヴィロック）
    market: { url: 'assets/bgm/market.mp3', loopStart: 21.63, loopEnd: 82.2519, gain: 1 }, // 市場（s_day_199674712）
    town: { url: 'assets/bgm/town.mp3', loopStart: 22.09, loopEnd: 62.5104, gain: 1 }, // 通り・曲のない行き先（s_day_2142866112）
    gamble: { url: 'assets/bgm/gamble.mp3', loopStart: 21.78, loopEnd: 81.7975, gain: 1 }, // 賭場（s_gamble_1901902036）
    home: { url: 'assets/bgm/home.mp3', loopStart: 11.48, loopEnd: 59.4664, gain: 1 }, // 自宅（s_home_1234933656）
    ninja_night: { url: 'assets/bgm/ninja_night.mp3', loopStart: 7.96, loopEnd: 59.9462, gain: 1 }, // 2.24.1 忍びの任務（夜）（s_night_487092298）
  };
  // 2.20.0 曲は場面に入る時に読み込む（全部を先に読むと 1曲 30MB ほどのメモリを食うので、読んだ曲は新しい順に3曲まで残す）
  const trackBuf = {}, loading = {}, recent = [], KEEP = 3;
  let src = null, srcScene = null;
  function loadTrack(k) {
    const T = TRACKS[k]; if (!T || !ctx || trackBuf[k] || loading[k]) return;
    loading[k] = fetch(T.url + '?v=' + SGK.VERSION).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((a) => new Promise((ok, ng) => ctx.decodeAudioData(a, ok, ng)))
      .then((b) => {
        trackBuf[k] = b; recent.unshift(k);
        while (recent.length > KEEP) { // 鳴っている曲と今読んだ曲は残し、いちばん古い曲を捨てる
          let i = recent.length - 1; while (i >= 0 && (recent[i] === srcScene || recent[i] === k)) i--;
          if (i < 0) break; delete trackBuf[recent[i]]; recent.splice(i, 1);
        }
      })
      .catch((e) => console.warn('BGM の曲を読めない', k, e))
      .finally(() => { delete loading[k]; });
  }
  function stopTrack() { if (src) { try { src.stop(); } catch (e) {} src.disconnect(); } src = null; srcScene = null; }
  function startTrack(name) {
    const T = TRACKS[name], b = trackBuf[name]; if (!T || !b) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = b; s.loop = true; s.loopStart = T.loopStart; s.loopEnd = T.loopEnd; g.gain.value = T.gain;
    s.connect(g); g.connect(bgmBus); s.start(); src = s; srcScene = name; return true;
  }
  A.trackInfo = () => ({ ctx: ctx && ctx.state, loaded: Object.keys(trackBuf), scene, playing: srcScene, at: src && ctx ? ctx.currentTime : null }); // 確かめ用

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (want) loadTrack(want); // 次の場面の曲を、フェードの間に読み始める
    if (want !== scene && !fading) {
      if (!scene) { scene = want; step = 0; nextT = now + 0.1; setLevel(LV_BGM[opt.bgm], 1.0); }
      else { fading = true; setLevel(0.0001, 0.8); setTimeout(() => { scene = want; step = 0; nextT = ctx.currentTime + 0.1; mel = 5; fading = false; setLevel(LV_BGM[opt.bgm], 1.2); }, 850); }
    }
    // 曲ファイルのある場面：場面が変わったら（フェードが終わってから）差し替える。鳴っている間は合成しない
    if (!fading && srcScene !== scene) { stopTrack(); if (opt.bgm) startTrack(scene); }
    if (src && srcScene === scene) { nextT = Math.max(nextT, now); return; }
    const S = SCENES[scene]; if (!S || fading || !opt.bgm) { nextT = Math.max(nextT, now); return; }
    const b = 60 / S.bpm / 2;
    if (nextT < now) nextT = now + 0.05;
    while (nextT < now + 0.25) { S.play(step, nextT, b); step++; nextT += b; }
  }

  // ---------- 音量（メニューで − ＋） ----------
  const NAMES = { all: '全体', bgm: 'BGM', sfx: '効果音' };
  A.get = (k) => opt[k];
  A.label = (k) => `${NAMES[k]}：${opt[k] ? '■'.repeat(opt[k]) + '□'.repeat(MAX - opt[k]) : '消音'}`;
  A.step = (k, d) => {
    opt[k] = Math.max(0, Math.min(MAX, opt[k] + d)); saveOpt();
    if (ctx) {
      if (k === 'bgm') setLevel(LV_BGM[opt.bgm], 0.2);
      else if (k === 'sfx') sfxBus.gain.value = LV_SFX[opt.sfx];
      else master.gain.value = MASTER_MAX * opt.all / MAX;
    }
    return A.label(k);
  };
  A.cycle = (k) => A.step(k, opt[k] >= MAX ? -MAX : 1);
})();
