// 2.12.5 服の色：部隊の画面で、自分（本人）と兵の服の色を選ぶ。変えるたびに 1貫。戦場の3Dでその色に染まる（一緒に遊ぶ人にも見える）
(function () {
  const SIM = SGK.SIM;
  const CL = SIM.CLOTH = {
    models: [
      { name: '農民', parts: ['上着', '鉢巻', '腰紐', '袴', '草鞋'] },
      { name: '足軽', parts: ['胴', '肩当て', '草摺・腰帯', '布地'] },
      { name: '兜付き兵', parts: ['胴', '肩当て', '草摺・腰帯', '布地・履物', '手袋'] },
    ],
    cost: 1000, // 1貫
    // 和の色（名前, 色）
    colors: [['紺', '#1f2f5a'], ['藍', '#165e83'], ['浅葱', '#00a3af'], ['萌黄', '#a7b23a'], ['若竹', '#68be8d'], ['常磐', '#007b43'], ['山吹', '#f8b500'], ['黄土', '#c39143'],
      ['朱', '#eb6101'], ['茜', '#b7282e'], ['蘇芳', '#9e3d3f'], ['紫', '#884898'], ['藤', '#bbbcde'], ['墨', '#2b2b2b'], ['鈍', '#727171'], ['白', '#f3f3ec']],
  };
  CL.partKey = (tier, part) => `t${tier}_${part}`;
  CL.partKeys = CL.models.flatMap(({ parts }, i) => parts.map((_, j) => CL.partKey(i + 1, j + 1)));
  const ok = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  SIM.commands.setCloth = (w, p, c) => {
    if (!c || p.battle) return;
    const ch = {}; if (c.me !== undefined) ch.me = c.me; if (c.tr !== undefined) ch.tr = c.tr;
    for (const k of CL.partKeys) if (c[k] !== undefined) ch[k] = c[k];
    for (const k in ch) if (ch[k] !== null && !ok(ch[k])) return;
    const cur = p.cloth || {}, diff = Object.keys(ch).filter((k) => (cur[k] || null) !== (ch[k] ? ch[k].toLowerCase() : null));
    if (!diff.length) return;
    if (p.money < CL.cost) return SIM.say(p.id, `服の色を変えるには${SIM.money(CL.cost)}かかります（お金が足りません）`);
    p.money -= CL.cost; p.cloth = Object.assign({}, cur);
    for (const k of diff) { if (ch[k]) p.cloth[k] = ch[k].toLowerCase(); else delete p.cloth[k]; }
    SIM.say(p.id, `服の色を変えました（${SIM.money(CL.cost)}）`);
  };
  const basePriv = SIM.privateState;
  SIM.privateState = function (w, pid) {
    const r = basePriv(w, pid); if (!r) return r;
    const p = w.players[pid]; r.me.cloth = (p && p.cloth) || {};
    if (r.battle) { const b = w.battles[r.battle.id]; if (b) { const m = {}; for (const q of b.pids || []) { const pl = w.players[q]; if (pl && pl.cloth && Object.keys(pl.cloth).length) m[q] = pl.cloth; } r.battle.cloth = m; } }
    return r;
  };
})();
