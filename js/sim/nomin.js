// 2.56.1 村長と農民の身分：どの村にも村長がいて、浪人は村長に雇ってもらうと農民になれる（2.56.2 始めるときはいつも浪人）。
//  身分：作男（雇われ農民）・小作人・本百姓・名主（足軽〜部将と同じ格）。名主が村の信頼を集めると、年老いた村長のあとを継いで村長になれる。
//  ・作男：村長の田畑で野良仕事をして日銭をもらう
//  ・小作人から：村長から田畑を借りられる（自宅の畑の数が増える）。毎月、村長から米が届く
//  ・名主から：村の発展が早くなる。毎月の手当もふえる
//  ・村長：村人が自分の畑を見回ってくれる（草取り・虫取り・水やり・手入れ）
//  信頼は、野良仕事・村の頼みごと・自分の畑の収穫・普請の手伝いで積む
// 数値はすべて仮
(function () {
  const SIM = SGK.SIM, C = SIM.commands, say = (pid, t) => SIM.say(pid, t), I = () => SGK.DATA.items;
  const NM = (SIM.NOMIN = {});
  // trust・fame＝その格になるのに要る信頼と名声。lend＝借りる田畑、lendA＝飼える家畜の増え、rice＝毎月の米、pay＝毎月の手当、wage＝野良仕事の日銭
  NM.RANKS = [null,
    { name: '作男', trust: 0, fame: 0, lend: 0, lendA: 0, rice: 0, pay: 0, wage: 150, desc: '村長に雇われた農民。村長の田畑で野良仕事をして日銭をもらう' },
    { name: '小作人', trust: 40, fame: 2, lend: 2, lendA: 1, rice: 3, pay: 0, wage: 180, desc: '村長から田畑を2枚借りる（自宅がこの村なら畑が増える）。毎月、米が届く' },
    { name: '本百姓', trust: 120, fame: 6, lend: 3, lendA: 2, rice: 5, pay: 300, wage: 200, desc: '自分の田畑を持つ一人前の百姓。借りる田畑と飼える家畜が増える' },
    { name: '名主', trust: 300, fame: 12, lend: 4, lendA: 3, rice: 8, pay: 1000, wage: 220, desc: '村役人。村の発展が2割早くなる。毎月の手当' },
    { name: '村長', trust: 600, fame: 20, lend: 6, lendA: 4, rice: 12, pay: 2000, wage: 250, desc: '村をまとめる長。村人が自分の畑を見回ってくれる' },
  ];
  NM.workCost = 0.15; NM.workTrust = 2; // 野良仕事（1日1回）
  NM.fushinCost = 0.3; NM.fushinTrust = 10; // 普請の手伝い（月に1回）
  NM.reapTrust = 5; // 収穫5つごとに信頼1（1回で10まで）
  const day = (w) => Math.floor(w.time.min / 1440);
  const here = (w, p) => (p.at && p.tx == null ? SIM.settlement(w, p.at) : null);
  const hpOf = (p) => (p.hpFrac == null ? 1 : p.hpFrac);
  const isVil = (s) => !!(s && s.type === 'village' && !s.site);
  const nmn = (p) => (p.nomin && p.nomin.rank ? p.nomin : null);
  SIM.isNomin = (p) => !!nmn(p);
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  // 村長の名前（村ごとに決まる。作ったもの）
  const A = ['与', '甚', '茂', '源', '惣', '久', '弥', '権', '孫', '長', '善', '利', '作', '吉', '清', '太'], B = ['兵衛', '右衛門', '左衛門', '助', '太夫', '蔵', '次郎', '三郎'];
  NM.headName = (w, vid) => { const S = (w.soncho || {})[vid]; if (S && S.pid && w.players[S.pid]) return w.players[S.pid].name; const h = hash(vid); return A[h % A.length] + B[(h >>> 8) % B.length]; };
  const vname = (w, vid) => { const s = SIM.settlement(w, vid); return s ? s.name : ''; };
  const setSt = (w, p) => { const N = nmn(p); if (N) p.status = `${vname(w, N.v)} ${NM.RANKS[N.rank].name}`; };
  // 借りた田畑・家畜の分を畑に入れる（自宅がその村のときだけ）
  const lendSync = (p) => { const N = nmn(p), F = p.farm; if (!F) return; const R = N && p.home === N.v ? NM.RANKS[N.rank] : null; F.lend = R ? R.lend : 0; F.lendA = R ? R.lendA : 0; };
  NM.lendSync = lendSync;
  function addTrust(w, p, n, why) {
    const N = nmn(p); if (!N || !(n > 0)) return; n = Math.round(n); N.trust += n;
    say(p.id, `村の信頼+${n}（${why}）`);
    const nx = NM.RANKS[N.rank + 1];
    if (nx && N.trust >= nx.trust && p.fame >= nx.fame && N.hint !== N.rank) { N.hint = N.rank; say(p.id, N.rank === 4 ? `村長のあとを継げます（${vname(w, N.v)}の村長の家で）` : `${nx.name}への取り立てを願い出られます（${vname(w, N.v)}の村長の家で）`); }
  }
  NM.addTrust = addTrust;
  function becomeNomin(w, p, s, msg) {
    p.nomin = { v: s.id, rank: 1, trust: 0, wd: -1, fd: -1, pd: day(w) }; setSt(w, p); lendSync(p);
    say(p.id, msg || `${s.name}の村長・${NM.headName(w, s.id)}に雇われ、作男として働くことになりました。村長の田畑で野良仕事をすれば日銭がもらえます`);
  }
  NM.become = becomeNomin;

  // ---- 村の頼みごと（村ごと・30日ごと） ----
  function tasks(w, s) {
    w.vtask = w.vtask || {}; const per = Math.floor(day(w) / 30); let T = w.vtask[s.id];
    if (T && T.per === per) return T.list;
    const pool = ['firewood', 'rice', 'daikon', 'egg', 'meat', 'mugi', 'daizu', 'hide', 'salt'].filter((k) => I()[k]);
    let h = hash(s.id + ':' + per); const list = [];
    for (let i = 0; i < 2; i++) {
      h = (Math.imul(h ^ (h >>> 13), 1103515245) + 12345) >>> 0; const k = pool[h % pool.length], it = I()[k];
      const qty = Math.max(2, Math.round((80 + (h >>> 8) % 120) / Math.max(10, it.base) * (k === 'egg' ? 2 : 1)));
      list.push({ id: `${s.id}-${per}-${i}`, item: k, qty: Math.min(qty, 30), reward: Math.round(it.base * Math.min(qty, 30) * 1.3 / 10) * 10, trust: 6 + (h >>> 4) % 6, done: false });
    }
    w.vtask[s.id] = { per, list }; return list;
  }

  // ---- コマンド ----
  const atVil = (w, p) => { const s = here(w, p); return isVil(s) && !p.battle ? s : null; };
  C.nominJoin = (w, p) => {
    const s = atVil(w, p); if (!s || p.busy) return;
    if (nmn(p)) return say(p.id, `すでに${vname(w, p.nomin.v)}で働いています`);
    if (p.clan) return say(p.id, '主家に仕えている間は農民にはなれません（浪人になってから）');
    if (SIM.isMerchant && SIM.isMerchant(p)) return say(p.id, '商人のままでは農民にはなれません（奉公先から暇をもらってから）');
    becomeNomin(w, p, s);
  };
  C.nominWork = (w, p) => { // 野良仕事
    const s = atVil(w, p), N = nmn(p); if (!s || !N) return; if (s.id !== N.v) return say(p.id, `野良仕事は${vname(w, N.v)}で`);
    if (p.busy) return say(p.id, `${p.busy.label}の最中です`);
    const d = day(w); if (N.wd === d) return say(p.id, '今日の野良仕事はもう済ませました');
    if (hpOf(p) < Math.max(0.15, NM.workCost)) return say(p.id, '体力が足りません。少し休んでから');
    p.hpFrac = hpOf(p) - NM.workCost; N.wd = d; const R = NM.RANKS[N.rank]; p.money += R.wage;
    const jobs = ['田の草取り', '畦の塗り直し', '肥やし運び', '稲の刈り取り', '薪割り', '水路のどぶさらい', '麦踏み', '牛の世話'];
    if (p.farm) p.farm.exp = (p.farm.exp || 0) + 1;
    say(p.id, `村長の田畑で${jobs[d % jobs.length]}をしました。日銭${SIM.money(R.wage)}をもらいました`);
    addTrust(w, p, NM.workTrust, '野良仕事');
  };
  C.nominTask = (w, p, c) => {
    const s = atVil(w, p), N = nmn(p); if (!s) return; const t = tasks(w, s).find((x) => x.id === c.id); if (!t || t.done) return;
    const it = I()[t.item], have = (p.inv || {})[t.item] || 0; if (have < t.qty) return say(p.id, `${it.name}が${t.qty - have}${it.unit}足りません`);
    p.inv[t.item] -= t.qty; if (!p.inv[t.item]) { delete p.inv[t.item]; if (p.cost) delete p.cost[t.item]; }
    t.done = true; p.money += t.reward; s.farmDev = (s.farmDev || 0) + 5;
    say(p.id, `村の頼みで${it.name}${t.qty}${it.unit}を納め、礼金${SIM.money(t.reward)}をもらいました`);
    if (N && N.v === s.id) addTrust(w, p, t.trust, '村の頼みごと');
  };
  C.nominFushin = (w, p) => { // 用水や道の普請を手伝う（月に1回）
    const s = atVil(w, p), N = nmn(p); if (!s || !N || s.id !== N.v) return;
    const per = Math.floor(day(w) / 30); if (N.fd === per) return say(p.id, '今月の普請はもう手伝いました');
    if (hpOf(p) < Math.max(0.15, NM.fushinCost)) return say(p.id, '体力が足りません');
    p.hpFrac = hpOf(p) - NM.fushinCost; N.fd = per; s.farmDev = (s.farmDev || 0) + 15;
    say(p.id, `村総出の普請（用水の修繕・道の手入れ）を手伝いました。村が少し豊かになりました`);
    addTrust(w, p, NM.fushinTrust, '普請の手伝い');
  };
  C.nominPromote = (w, p) => {
    const s = atVil(w, p), N = nmn(p); if (!s || !N) return; if (s.id !== N.v) return say(p.id, `${vname(w, N.v)}の村長の家で願い出てください`);
    const nx = NM.RANKS[N.rank + 1]; if (!nx) return say(p.id, 'もう村長です');
    if (N.trust < nx.trust) return say(p.id, `信頼が足りません（${N.trust}/${nx.trust}）`);
    if (p.fame < nx.fame) return say(p.id, `名声が足りません（${Math.floor(p.fame)}/${nx.fame}）`);
    if (N.rank === 4) {
      if (p.home !== s.id) return say(p.id, '村長を継ぐには、この村に住んでいなければなりません（自宅をこの村に）');
      w.soncho = w.soncho || {}; const S = w.soncho[s.id]; if (S && S.pid && S.pid !== p.id && w.players[S.pid]) return say(p.id, 'この村にはもう別の村長がいます');
      const old = NM.headName(w, s.id); w.soncho[s.id] = { pid: p.id, d: day(w) }; N.rank = 5; setSt(w, p); lendSync(p); p.fame += 5;
      return say(p.id, `年老いた村長・${old}に代わり、${s.name}の村長になりました！（名声+5）　これからは村人が畑を見回ってくれます`);
    }
    N.rank++; setSt(w, p); lendSync(p);
    say(p.id, `${NM.RANKS[N.rank].name}に取り立てられました！ ${NM.RANKS[N.rank].desc}`);
  };
  C.nominQuit = (w, p) => {
    const N = nmn(p); if (!N || p.battle) return;
    if (w.soncho && w.soncho[N.v] && w.soncho[N.v].pid === p.id) delete w.soncho[N.v];
    p.nomin = null; p.status = '浪人'; lendSync(p);
    say(p.id, `${vname(w, N.v)}の村長から暇をもらい、浪人に戻りました（借りていた田畑は返しました。植えてある畑はそのままです）`);
  };
  // 仕官・奉公すると農民はやめる
  const endBy = (name) => { const b = C[name]; if (!b) return; C[name] = function (w, p) { const N = nmn(p), r = b.apply(this, arguments); if (N && (p.clan || (SIM.isMerchant && SIM.isMerchant(p)))) { if (w.soncho && w.soncho[N.v] && w.soncho[N.v].pid === p.id) delete w.soncho[N.v]; p.nomin = null; lendSync(p); say(p.id, `${vname(w, N.v)}での百姓暮らしは終わりました`); } return r; }; };
  endBy('serve'); endBy('shoJoin');
  // 引っ越すと借りた田畑の数が変わる
  { const b = SIM.moveHome; if (b) SIM.moveHome = function (w, p) { const r = b.apply(this, arguments); lendSync(p); return r; }; }
  // 自分の畑の収穫で信頼
  { const b = C.farm; C.farm = function (w, p, c) { const F = p.farm, m0 = F ? F.made || 0 : 0, r = b.apply(this, arguments), N = nmn(p); if (N && p.farm && p.home === N.v) { const g = (p.farm.made || 0) - m0; if (g >= NM.reapTrust) addTrust(w, p, Math.min(10, Math.floor(g / NM.reapTrust)), '田畑の実り'); } return r; }; }
  // 名主・村長の村は発展が早い
  let curDay = 0; // 名主・村長のいる村には毎日しるし（s.nanushi＝その日）を付ける
  { const b = SIM.FARM && SIM.FARM.devMul; if (b) SIM.FARM.devMul = (s) => b(s) * (s && s.nanushi != null && curDay - s.nanushi <= 1 ? 1.2 : 1); }

  // ---- 毎日：村長の村人の見回り／毎月：米と手当 ----
  SIM.systems.push(function nominDay(w) {
    const d = day(w); curDay = d; if (w.nominD === d) return; w.nominD = d;
    for (const p of Object.values(w.players)) {
      const N = nmn(p); if (!N) continue; lendSync(p);
      if (N.rank >= 4) { const vs = SIM.settlement(w, N.v); if (vs) vs.nanushi = d; }
      if (N.rank >= 5 && p.farm && p.home === N.v) { // 村人が畑を見回る
        const FM = SIM.FARM; let n = 0;
        for (const f of p.farm.fields) { if (!f.c || FM.state(f, d) !== 'grow') continue; if (f.iss) { f.iss = null; n++; } else if (d - f.td >= FM.tendGap && f.care < FM.careMax) { f.care++; f.td = d; n++; } }
        if (n && d % 5 === 0) say(p.id, `村人が畑を見回ってくれました`);
      }
      if (N.pd == null) N.pd = d;
      while (d - N.pd >= 30) {
        N.pd += 30; const R = NM.RANKS[N.rank], got = [];
        if (R.rice) { const K = (p.kura = p.kura || { money: 0, inv: {}, cost: {} }); K.inv = K.inv || {}; K.cost = K.cost || {}; const hv = K.inv.rice || 0; K.cost.rice = ((K.cost.rice || 0) * hv) / (hv + R.rice); K.inv.rice = hv + R.rice; got.push(`米${R.rice}俵（物置へ）`); }
        if (R.pay) { p.money += R.pay; got.push(SIM.money(R.pay)); }
        if (got.length) say(p.id, `${vname(w, N.v)}から${N.rank >= 5 ? '村長' : R.name}の取り分として${got.join('と')}が届きました`);
      }
    }
  });

  // 2.56.2 始めるときはいつも浪人（農民には村長に雇ってもらってなる）
  const baseEnsure = SIM.ensure;
  SIM.ensure = function (w) { baseEnsure(w); for (const p of Object.values(w.players)) if (nmn(p)) { if (p.clan) p.nomin = null; else setSt(w, p); } return w; };

  // ---- 本人に送る情報 ----
  const basePriv = SIM.privateState;
  SIM.privateState = (w, pid) => {
    const r = basePriv(w, pid), p = w.players[pid]; if (!r || !p || !r.me) return r;
    const N = nmn(p), d = day(w);
    r.me.nomin = N ? { v: N.v, vname: vname(w, N.v), rank: N.rank, name: NM.RANKS[N.rank].name, trust: N.trust, next: NM.RANKS[N.rank + 1] ? { name: N.rank === 4 ? '村長（継ぐ）' : NM.RANKS[N.rank + 1].name, trust: NM.RANKS[N.rank + 1].trust, fame: NM.RANKS[N.rank + 1].fame } : null, home: p.home === N.v } : null;
    const s = here(w, p);
    if (r.here && isVil(s)) {
      const S = (w.soncho || {})[s.id];
      r.here.soncho = {
        head: NM.headName(w, s.id), me: !!(S && S.pid === p.id), mine: !!(N && N.v === s.id),
        canJoin: !N && !p.clan && !(SIM.isMerchant && SIM.isMerchant(p)), clan: !!p.clan,
        worked: !!(N && N.wd === d), fushin: !!(N && N.fd === Math.floor(d / 30)), wage: N ? NM.RANKS[N.rank].wage : NM.RANKS[1].wage,
        tasks: tasks(w, s).map((t) => Object.assign({}, t)), dev: Math.round(s.farmDev || 0), pop: s.pop || null,
        ranks: NM.RANKS.slice(1).map((R) => ({ name: R.name, trust: R.trust, fame: R.fame, desc: R.desc, wage: R.wage, rice: R.rice, pay: R.pay })),
      };
    }
    return r;
  };
})();
