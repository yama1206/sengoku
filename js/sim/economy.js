// 第2段階：市場・依頼・仕事・会話
(function () {
  const SIM = SGK.SIM;
  const I = () => SGK.DATA.items;
  const SIZE = { castle: 1, town: 1.5, village: 0.6 };
  const CAP = 30; // 徒歩で運べる荷の量（馬などは後日）

  // ---- プレイヤーへのお知らせ（セーブには入れない） ----
  SIM.out = {};
  SIM.say = (pid, text) => (SIM.out[pid] = SIM.out[pid] || []).push(text);
  SIM.drain = (pid) => { const a = SIM.out[pid] || []; delete SIM.out[pid]; return a; };
  SIM.money = (m) => { m = Math.floor(m); return m >= 1000 ? `${Math.floor(m / 1000)}貫${m % 1000 ? (m % 1000) + '文' : ''}` : `${m}文`; };
  SIM.cargo = (p) => Object.values(p.inv).reduce((a, b) => a + b, 0);
  const pick = (w, arr) => arr[Math.floor(SIM.rand(w) * arr.length)];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---- 足りない項目を補う（新規ワールド・古いセーブの両方に使う） ----
  SIM.ensure = function (w) {
    w.schema = SGK.SAVE_SCHEMA;
    if (w.day == null) w.day = Math.floor(w.time.min / 1440);
    w.jobs = w.jobs || {};
    for (const s of w.settlements) {
      const d = SGK.DATA.settlements.find((x) => x.id === s.id) || {};
      s.prod = s.prod || d.prod || {};
      s.size = s.size || SIZE[s.type];
      s.stock = s.stock || {};
      for (const k in I()) if (s.stock[k] == null) s.stock[k] = target(s, k) * (0.6 + SIM.rand(w) * 0.8);
    }
    for (const p of Object.values(w.players)) SIM.ensurePlayer(p);
    if (!Object.keys(w.jobs).length) w.settlements.forEach((s) => { genJob(w, s); genJob(w, s); });
    return w;
  };
  SIM.ensurePlayer = (p) => { if (p.money == null) p.money = 3000; p.inv = p.inv || {}; p.quests = p.quests || []; if (p.fame == null) p.fame = 0; if (p.busy === undefined) p.busy = null; };

  function target(s, k) { return (I()[k].cons * s.size + (s.prod[k] || 0)) * 12 + 4; }
  SIM.price = (s, k) => { const b = I()[k].base; return Math.max(b * 0.4, Math.min(b * 3, b * Math.sqrt(target(s, k) / (s.stock[k] + 1)))); };
  SIM.buyPrice = (s, k) => Math.ceil(SIM.price(s, k) * 1.1);
  SIM.sellPrice = (s, k) => Math.floor(SIM.price(s, k) * 0.9);

  // ---- 依頼の作成 ----
  function giverOf(w, s) { return s.type === 'castle' && s.lord ? (w.people[s.lord] || {}).name + '様' : s.type === 'town' ? '町の商家' : '村の名主'; }
  function genJob(w, s) {
    const id = 'j' + w.nextId++, now = w.time.min, giver = giverOf(w, s);
    let job;
    if (SIM.rand(w) < 0.55) {
      const to = pick(w, w.settlements.filter((x) => x.id !== s.id)); const d = dist(s, to);
      job = { id, type: 'deliver', from: s.id, to: to.id, days: Math.ceil(d / 20) + 2, reward: Math.round((60 + d * 12) / 10) * 10, title: `${to.name}へ届け物`, giver };
    } else {
      const k = pick(w, Object.keys(I()).filter((k) => !(s.prod[k] > 0))); const it = I()[k]; const qty = 4 + Math.floor(SIM.rand(w) * 9);
      job = { id, type: 'procure', from: s.id, item: k, qty, days: 10, reward: Math.round((it.base * qty * 1.4) / 10) * 10, title: `${it.name}${qty}${it.unit}の調達`, giver };
    }
    job.expires = now + 5 * 1440;
    w.jobs[id] = job;
  }

  // ---- 1日ごとの処理 ----
  function daily(w) {
    const now = w.time.min;
    for (const s of w.settlements) for (const k in I()) s.stock[k] = Math.max(0, s.stock[k] + (s.prod[k] || 0) - I()[k].cons * s.size);
    for (const j of Object.values(w.jobs)) if (j.expires < now) delete w.jobs[j.id];
    for (const s of w.settlements) {
      const n = Object.values(w.jobs).filter((j) => j.from === s.id).length;
      if (n < 3 && SIM.rand(w) < 0.5) genJob(w, s);
    }
    for (const p of Object.values(w.players)) {
      p.quests = p.quests.filter((q) => {
        if (q.deadline >= now) return true;
        p.fame = Math.max(0, p.fame - 1); SIM.say(p.id, `依頼「${q.title}」の期限が過ぎてしまいました（名声-1）`); return false;
      });
    }
  }

  SIM.systems.push(
    function dayTick(w) { const d = Math.floor(w.time.min / 1440); while (w.day < d) { w.day++; daily(w); } },
    function busyTick(w) {
      for (const p of Object.values(w.players)) {
        const b = p.busy; if (!b || w.time.min < b.until) continue;
        p.busy = null;
        if (b.kind === 'labor') { p.money += b.pay; SIM.say(p.id, `人足仕事を終えました（${SIM.money(b.pay)}）`); }
        if (b.kind === 'gather') {
          const n = Math.min(b.amount, CAP - SIM.cargo(p));
          if (n > 0) { p.inv.firewood = (p.inv.firewood || 0) + n; SIM.say(p.id, `薪を${n}束集めました`); } else SIM.say(p.id, '荷がいっぱいで薪を持てませんでした');
        }
      }
    },
  );

  // ---- NPC商人：出発地の余っている品を運ぶ ----
  SIM.merchantDepart = (w, n, from) => {
    if (!from) return;
    let best = null, br = 1.1;
    for (const k in I()) { const r = from.stock[k] / target(from, k); if (r > br) { br = r; best = k; } }
    if (best) { const q = Math.min(8, Math.floor(from.stock[best] / 2)); from.stock[best] -= q; n.cargo = { item: best, qty: q }; }
  };
  SIM.merchantArrive = (w, n, to) => { if (n.cargo && to) { to.stock[n.cargo.item] += n.cargo.qty; n.cargo = null; } };

  // ---- 到着したとき：届け物の依頼を達成 ----
  SIM.onPlayerArrive = (w, p) => {
    const s = SIM.settlement(w, p.at);
    SIM.say(p.id, `${s.name}に着きました`);
    p.quests = p.quests.filter((q) => {
      if (q.type !== 'deliver' || q.to !== p.at) return true;
      p.money += q.reward; p.fame += 1; SIM.say(p.id, `依頼「${q.title}」達成！ ${SIM.money(q.reward)}を受け取りました（名声+1）`); return false;
    });
  };

  // ---- コマンド ----
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  function needTown(w, p) {
    const s = here(w, p);
    if (!s) { SIM.say(p.id, '拠点の中でないとできません'); return null; }
    if (p.busy) { SIM.say(p.id, '仕事中です'); return null; }
    return s;
  }
  Object.assign(SIM.commands, {
    buy(w, p, c) {
      const s = needTown(w, p), it = I()[c.item]; if (!s || !it) return;
      const unit = SIM.buyPrice(s, c.item);
      const q = Math.min(Math.max(1, +c.qty || 1), Math.floor(s.stock[c.item]), CAP - SIM.cargo(p), Math.floor(p.money / unit));
      if (q <= 0) return SIM.say(p.id, s.stock[c.item] < 1 ? '在庫がありません' : SIM.cargo(p) >= CAP ? 'これ以上は持てません' : 'お金が足りません');
      p.money -= unit * q; s.stock[c.item] -= q; p.inv[c.item] = (p.inv[c.item] || 0) + q;
      SIM.say(p.id, `${it.name}を${q}${it.unit}買いました（${SIM.money(unit * q)}）`);
    },
    sell(w, p, c) {
      const s = needTown(w, p), it = I()[c.item]; if (!s || !it) return;
      const q = Math.min(Math.max(1, +c.qty || 1), p.inv[c.item] || 0);
      if (q <= 0) return SIM.say(p.id, '持っていません');
      const unit = SIM.sellPrice(s, c.item);
      p.money += unit * q; s.stock[c.item] += q; p.inv[c.item] -= q; if (!p.inv[c.item]) delete p.inv[c.item];
      SIM.say(p.id, `${it.name}を${q}${it.unit}売りました（${SIM.money(unit * q)}）`);
    },
    acceptJob(w, p, c) {
      const s = needTown(w, p), j = w.jobs[c.id]; if (!s || !j || j.from !== s.id) return;
      if (p.quests.length >= 3) return SIM.say(p.id, '同時に受けられる依頼は3つまでです');
      delete w.jobs[j.id];
      p.quests.push(Object.assign({}, j, { deadline: w.time.min + j.days * 1440 }));
      SIM.say(p.id, `依頼「${j.title}」を受けました（期限${j.days}日）`);
    },
    deliverJob(w, p, c) {
      const s = needTown(w, p), q = p.quests.find((x) => x.id === c.id); if (!s || !q || q.type !== 'procure') return;
      if (q.from !== s.id) return SIM.say(p.id, `納品先は${SIM.settlement(w, q.from).name}です`);
      if ((p.inv[q.item] || 0) < q.qty) return SIM.say(p.id, `${I()[q.item].name}が足りません`);
      p.inv[q.item] -= q.qty; if (!p.inv[q.item]) delete p.inv[q.item]; s.stock[q.item] += q.qty;
      p.money += q.reward; p.fame += 1; p.quests = p.quests.filter((x) => x !== q);
      SIM.say(p.id, `依頼「${q.title}」達成！ ${SIM.money(q.reward)}を受け取りました（名声+1）`);
    },
    abandonJob(w, p, c) {
      const q = p.quests.find((x) => x.id === c.id); if (!q) return;
      p.quests = p.quests.filter((x) => x !== q); p.fame = Math.max(0, p.fame - 1);
      SIM.say(p.id, `依頼「${q.title}」を取りやめました（名声-1）`);
    },
    work(w, p, c) {
      const s = needTown(w, p); if (!s) return;
      if (c.kind === 'labor' && s.type !== 'village') {
        const pay = Math.round((100 + 60 * s.size + SIM.rand(w) * 40) / 10) * 10;
        p.busy = { kind: 'labor', label: '人足仕事', until: w.time.min + 8 * 60, pay };
      } else if (c.kind === 'gather' && s.type === 'village') {
        p.busy = { kind: 'gather', label: '薪拾い', until: w.time.min + 6 * 60, amount: 3 + Math.floor(SIM.rand(w) * 3) };
      } else return;
      SIM.say(p.id, `${p.busy.label}を始めました`);
    },
    cancelWork(w, p) { if (p.busy) { SIM.say(p.id, `${p.busy.label}を取りやめました`); p.busy = null; } },
    talk(w, p) {
      const s = needTown(w, p); if (!s) return;
      const lines = [];
      const k = pick(w, Object.keys(I())); const it = I()[k];
      const ps = w.settlements.map((x) => [x, SIM.price(x, k)]).sort((a, b) => a[1] - b[1]);
      lines.push(`${ps[0][0].name}では${it.name}が安いそうですよ。${ps[ps.length - 1][0].name}なら高く売れるとか。`);
      const f = w.factions[s.owner], lord = s.lord && w.people[s.lord];
      if (f) lines.push(`このあたりは${f.name}のご領地${lord ? `で、${lord.name}様が治めておられます` : 'です'}。`);
      lines.push('駿河の今川様が、近ごろ兵を集めているという噂ですよ。', '尾張の殿様は「うつけ」と呼ばれておりますが、さてどうでしょうな。', '美濃の斎藤様は、ご病気がちだと聞きます。');
      const who = s.type === 'castle' ? '足軽' : s.type === 'town' ? '町人' : '村人';
      SIM.say(p.id, `${who}「${pick(w, lines)}」`);
    },
  });

  // ---- 本人だけに送る情報 ----
  SIM.privateState = function (w, pid) {
    const p = w.players[pid]; if (!p) return null;
    const s = here(w, p);
    return {
      me: { money: p.money, inv: p.inv, quests: p.quests, fame: p.fame, busy: p.busy, cap: CAP },
      here: s ? { id: s.id, market: Object.keys(I()).map((k) => [k, SIM.buyPrice(s, k), SIM.sellPrice(s, k), Math.floor(s.stock[k])]), jobs: Object.values(w.jobs).filter((j) => j.from === s.id) } : null,
    };
  };
})();
