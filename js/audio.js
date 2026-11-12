// 音（BGM・効果音）。音源ファイルは使わず、Web Audio でその場で鳴らす和風の音
// 箏・三味線・尺八・太鼓・鼓・拍子木・鈴・法螺貝ふうの音を合成し、場面ごとに曲を自動で作り続ける
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
    setInterval(schedule, 80);
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

  // ---------- 効果音 ----------
  const SFX = {
    click: (t) => hyoshigi(t, 0.35, sfxBus),
    open: (t) => { koto(t, 74, 0.3, sfxBus); koto(t + 0.07, 79, 0.25, sfxBus); },
    close: (t) => { koto(t, 79, 0.22, sfxBus); koto(t + 0.07, 74, 0.2, sfxBus); },
    coin: (t) => { bell(t, 2093, 0.18, 0.35); bell(t + 0.08, 2637, 0.16, 0.45); },
    arrive: (t) => bell(t, 659, 0.3, 2.5),
    news: (t) => tsuzumi(t, 0.35, sfxBus),
    battleStart: (t) => { horagai(t, 0.35); taiko(t + 0.1, 0.9, true, sfxBus); taiko(t + 0.55, 0.7, false, sfxBus); taiko(t + 0.8, 0.9, true, sfxBus); },
    battleEnd: (t) => { bell(t, 196, 0.4, 3.5); taiko(t, 0.6, true, sfxBus); },
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

  let scene = null, want = null, step = 0, nextT = 0, fading = false;
  function setLevel(v, time = 0.6) { if (!ctx) return; const t = ctx.currentTime; bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setValueAtTime(Math.max(0.0001, bgmBus.gain.value), t); bgmBus.gain.linearRampToValueAtTime(v, t + time); }
  A.scene = (name) => { want = name; };
  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (want !== scene && !fading) {
      if (!scene) { scene = want; step = 0; nextT = now + 0.1; setLevel(LV_BGM[opt.bgm], 1.0); }
      else { fading = true; setLevel(0.0001, 0.8); setTimeout(() => { scene = want; step = 0; nextT = ctx.currentTime + 0.1; mel = 5; fading = false; setLevel(LV_BGM[opt.bgm], 1.2); }, 850); }
    }
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
