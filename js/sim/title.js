// 2.9.0 称号システム。条件を満たすともらえて、人物画面の「称号」から表示するものを選ぶ（名前の前につく）。
// 【あとから称号を足すには】 SIM.defTitle({ id, name, desc, cond, check(w, p) }) を1つ呼ぶだけ（下の「称号の一覧」にならべて書けばよい）。
//   id：重複しない英数字　name：名前の前につく言葉　desc：説明　cond：もらえる条件の説明
//   check(w, p)：true になると自動でもらえる（毎ゲーム内1時間ごとに確認）。check を書かず、ほかの機能から SIM.grantTitle(w, p, id) で渡してもよい
//   secret:true なら、もらうまで名前と条件を「？？？」で隠す　order：並び順（小さいほど上）
(function () {
  const SIM = SGK.SIM, DEFS = (SIM.TITLES = []);
  SIM.defTitle = (d) => { const i = DEFS.findIndex((x) => x.id === d.id); if (i >= 0) DEFS[i] = d; else DEFS.push(d); DEFS.sort((a, b) => (a.order || 0) - (b.order || 0)); return d; };
  const def = (id) => DEFS.find((x) => x.id === id);
  const own = (p) => (p.titles = p.titles || []);

  SIM.grantTitle = (w, p, id) => {
    const d = def(id); if (!d || own(p).includes(id)) return false;
    p.titles.push(id); SIM.say(p.id, `称号「${d.name}」を手に入れました！（人物画面の「称号」で表示を選べます）`);
    if (!p.title) p.title = id; return true;
  };
  SIM.titleName = (p) => { const d = p.title && own(p).includes(p.title) && def(p.title); return d ? d.name : ''; };
  SIM.titledName = (p) => SIM.titleName(p) + p.name;
  function checkAll(w, p) { for (const d of DEFS) if (d.check && !own(p).includes(d.id)) { let ok = false; try { ok = d.check(w, p); } catch (e) { ok = false; } if (ok) SIM.grantTitle(w, p, d.id); } }

  SIM.commands.setTitle = (w, p, c) => { // c.id：称号のid（'none'で表示しない）
    checkAll(w, p);
    if (c.id === 'none') { p.title = null; return; }
    if (def(c.id) && own(p).includes(c.id)) p.title = c.id;
  };

  // 毎ゲーム内1時間ごとに、まだ持っていない称号の条件を確かめる
  const baseStep = SIM.step;
  SIM.step = function (w, dtMin) {
    const r = baseStep(w, dtMin);
    if (w.time && w.time.min - (w.titleChk || 0) >= 60) { w.titleChk = w.time.min; for (const p of Object.values(w.players)) if (!p.off) checkAll(w, p); }
    return r;
  };

  // 他のプレイヤーにも、名前の前に称号がついて見える
  const baseDyn = SIM.dynamicState;
  SIM.dynamicState = (w, pid) => {
    const r = baseDyn(w, pid);
    if (r && r.p) for (const a of r.p) { const q = w.players[a[0]]; if (q && q.title) a[1] = SIM.titledName(q); }
    return r;
  };

  // 本人へ：持っている称号と、全部の一覧
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p) return r;
    const o = own(p);
    r.me.titles = { cur: p.title || null, list: DEFS.map((d) => { const has = o.includes(d.id); return [d.id, has || !d.secret ? d.name : '？？？', has || !d.secret ? d.desc : '', has || !d.secret ? d.cond || '' : '？？？', has ? 1 : 0]; }) };
    return r;
  };

  // 画面（人物画面の「称号」を押したときの中身）
  SGK.TITLE_HTML = (me) => {
    const T = me.titles; if (!T) return '';
    const got = T.list.filter((x) => x[4]).length;
    let h = `<div class="muted" style="margin-bottom:6px">称号を選ぶと、名前の前につきます（持っている ${got}/${T.list.length}）</div>`;
    h += `<div class="card" style="display:block"><b>表示しない</b>　<button id="ti-none" data-cact="setTitle" data-id="none" ${T.cur ? '' : 'disabled'}>${T.cur ? 'これにする' : '選択中'}</button></div>`;
    for (const [id, name, desc, cond, has] of T.list) {
      h += `<div class="card" style="display:block;${has ? '' : 'opacity:.55'}"><b>${name}</b>　${has ? `<button id="ti-${id}" data-cact="setTitle" data-id="${id}" ${T.cur === id ? 'disabled' : ''}>${T.cur === id ? '表示中' : '表示する'}</button>` : '<span class="muted">未取得</span>'}<br><span class="muted">${has ? desc : `条件：${cond}`}</span></div>`;
    }
    return h;
  };

  // ======== 称号の一覧（足すときは、ここに SIM.defTitle を並べる） ========
  const warrior = (p) => !p.nin && p.clan; // 武将の道（忍びではない）
  const ranks = [[3, 'samurai', '侍大将', '大軍を率いる侍大将に昇進する'], [5, 'castle', '城主', '城主になる（主家から城を任される）'], [6, 'karo', '家老', '家老に昇進する'], [7, 'kokushu', '国主', '国主に昇進する'], [8, 'daimyo', '大名', '独立して大名になる']];
  ranks.forEach(([lv, id, name, cond], i) => SIM.defTitle({ id, name, desc: `${name}を務めた証。`, cond, order: 10 + i, check: (w, p) => warrior(p) && p.rank >= lv }));
  [[1, 'genin', '下忍', '忍びとして召し抱えられる'], [2, 'chunin', '中忍', '忍びの腕を認められ、中忍になる'], [3, 'jonin', '上忍', '上忍になる'], [4, 'nintou', '忍頭', '忍頭になる']].forEach(([lv, id, name, cond], i) => SIM.defTitle({ id, name, desc: `忍びの階級「${name}」の証。`, cond, order: 30 + i, check: (w, p) => !!p.nin && p.clan && p.rank >= lv }));
  SIM.defTitle({ id: 'meishi', name: '名士', desc: '名が世に知られた者。', cond: '名声が50になる', order: 50, check: (w, p) => (p.fame || 0) >= 50 });
  SIM.defTitle({ id: 'fugou', name: '豪商', desc: '蔵にたっぷり銭を蓄えた商人。', cond: '所持金が100貫（10万文）になる', order: 51, check: (w, p) => (p.money || 0) >= 100000 });
  SIM.defTitle({ id: 'bakuto', name: '博徒', desc: '賭場に通い詰めた者。', cond: '賭場で30回賭ける', order: 52, check: (w, p) => (p.gbPlay || 0) >= 30 });
})();
