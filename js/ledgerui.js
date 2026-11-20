// 2.58.0 帳簿の画面（テストモードの「帳簿」ボタン）。SIM.LEDGER（js/sim/ledger.js）の記録を、遊びごと・品ごとに並べる。ホストだけ
(function () {
  const SIM = SGK.SIM, U = (SGK.LEDGERUI = {});
  let el = null, tab = 'money', busy = false;
  const open = new Set(); // 開いている行
  const I = () => SGK.DATA.items || {};
  const G = () => window.SGK_G;
  const L = () => SIM.LEDGER;
  const nm = (k) => (I()[k] && I()[k].name) || k;
  const unit = (k) => (I()[k] && I()[k].unit) || '';
  const mon = (v) => (v < 0 ? '-' : '') + SIM.money(Math.abs(v));
  const num = (v) => { const a = Math.abs(v); return (v < 0 ? '-' : '') + (a >= 100 ? Math.round(a) : a >= 10 ? a.toFixed(1) : a.toFixed(2)); };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  U.close = () => { if (el) el.remove(); el = null; };
  U.open = () => { U.close(); el = document.createElement('div'); el.id = 'ledgerUi'; document.body.appendChild(el); el.addEventListener('click', onClick); render(); };

  // 出どころ（ラベル）を遊びの名前でまとめる。rows: { label: {in,out,n} }
  function group(rows) {
    const out = {};
    for (const [label, r] of Object.entries(rows)) {
      const s = L().split(label), g = (out[s.cat] = out[s.cat] || { in: 0, out: 0, n: 0, sub: [] });
      g.in += r.in; g.out += r.out; g.n += r.n || 0; g.sub.push({ what: s.cmd ? `${s.what}（命令）` : s.what === '時間の経過' ? `時間の経過（${s.file}）` : s.what, in: r.in, out: r.out, n: r.n || 0 });
    }
    return Object.entries(out).map(([cat, g]) => ({ cat, ...g, net: g.in - g.out })).sort((a, b) => b.net - a.net);
  }
  function moneyTab(days) {
    const gs = group(L().money);
    if (!gs.length) return '<div class="lg-m">まだ何も記録されていません。遊ぶか、上のボタンで日を進めてください</div>';
    let tin = 0, tout = 0;
    let h = '<div class="lg-row lg-hd"><span>遊び</span><span>入った</span><span>出た</span><span>差し引き</span><span>1日あたり</span><span>回数</span></div>';
    for (const g of gs) {
      if (g.cat !== 'テスト') { tin += g.in; tout += g.out; }
      const key = 'm|' + g.cat, op = open.has(key);
      h += `<div class="lg-row lg-g" data-tg="${esc(key)}"><span>${op ? '▾' : '▸'} ${esc(g.cat)}</span><span>${mon(g.in)}</span><span>${mon(g.out)}</span><span class="${g.net < 0 ? 'lg-neg' : 'lg-pos'}">${mon(g.net)}</span><span>${mon(g.net / days)}</span><span>${g.n || ''}</span></div>`;
      if (op) for (const s of g.sub.sort((a, b) => b.in - b.out - (a.in - a.out))) h += `<div class="lg-row lg-s"><span>${esc(s.what)}</span><span>${mon(s.in)}</span><span>${mon(s.out)}</span><span>${mon(s.in - s.out)}</span><span>${mon((s.in - s.out) / days)}</span><span>${s.n || ''}</span></div>`;
    }
    h += `<div class="lg-row lg-hd"><span>合計（テストを除く）</span><span>${mon(tin)}</span><span>${mon(tout)}</span><span>${mon(tin - tout)}</span><span>${mon((tin - tout) / days)}</span><span></span></div>`;
    return h;
  }
  // 品ごと：tab = { 品: { label: {in,out} } }
  function itemTab(T, days, pre) {
    const ks = Object.keys(T).filter((k) => Object.values(T[k]).some((r) => r.in + r.out > 1e-6));
    if (!ks.length) return '<div class="lg-m">まだ何も記録されていません</div>';
    const rows = ks.map((k) => { let i = 0, o = 0; for (const r of Object.values(T[k])) { i += r.in; o += r.out; } return { k, i, o }; }).sort((a, b) => b.i + b.o - (a.i + a.o));
    let h = '<div class="lg-row lg-hd"><span>品</span><span>増えた</span><span>減った</span><span>差し引き</span><span>1日あたり</span><span></span></div>';
    for (const r of rows) {
      const key = pre + r.k, op = open.has(key), u = unit(r.k);
      h += `<div class="lg-row lg-g" data-tg="${esc(key)}"><span>${op ? '▾' : '▸'} ${esc(nm(r.k))}</span><span>${num(r.i)}${u}</span><span>${num(r.o)}${u}</span><span class="${r.i - r.o < 0 ? 'lg-neg' : 'lg-pos'}">${num(r.i - r.o)}${u}</span><span>${num((r.i - r.o) / days)}${u}</span><span></span></div>`;
      if (op) for (const s of group(T[r.k])) h += `<div class="lg-row lg-s"><span>${esc(s.cat)}${s.sub.length > 1 || s.sub[0].what !== s.cat ? `<i class="lg-m">　${s.sub.map((x) => esc(x.what)).join('・')}</i>` : ''}</span><span>${num(s.in)}</span><span>${num(s.out)}</span><span>${num(s.net)}</span><span>${num(s.net / days)}</span><span></span></div>`;
    }
    return h;
  }
  function msTab() {
    const rows = Object.entries(L().ms).sort((a, b) => b[1] - a[1]).slice(0, 40);
    let h = '<div class="lg-m">帳簿をつけていると、そのぶん重くなります。処理ごとにかかった時間（記録を始めてからの合計）</div><div class="lg-row lg-hd"><span>処理</span><span>ミリ秒</span><span></span><span></span><span></span><span></span></div>';
    for (const [label, ms] of rows) { const s = L().split(label); h += `<div class="lg-row lg-s"><span>${esc(s.cat)}：${esc(s.what)}</span><span>${Math.round(ms)}</span><span></span><span></span><span></span><span></span></div>`; }
    return h;
  }
  function render() {
    if (!el) return;
    const g = G(), host = g && g.mode === 'host' && g.world, led = L();
    let body;
    if (!host) body = '<div class="lg-m">帳簿は世界を動かしている人（ホスト）だけが見られます</div>';
    else {
      if (led.w !== g.world) led.reset(g.world);
      const days = led.days();
      body = `<div class="lg-m">記録した長さ：${days >= 1 ? days.toFixed(1) + '日' : Math.round(days * 24) + '時間'}（ゲームの中）・${Math.round((Date.now() - led.realStart) / 60000)}分（本当の時間）。プレイヤー全員の合計です</div>`
        + `<div class="lg-btns"><button data-adv="1">1日進める</button><button data-adv="7">7日進める</button><button data-adv="30">30日進める</button><button data-rf="1">更新</button><button data-clr="1">記録を消す</button><span id="lgBusy" class="lg-m"></span></div>`
        + `<div class="lg-tabs">${[['money', 'お金'], ['pinv', 'プレイヤーの物'], ['stock', '拠点の在庫'], ['ms', '重さ']].map(([k, n]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`
        + (tab === 'money' ? moneyTab(days) : tab === 'pinv' ? '<div class="lg-m">プレイヤーの荷と蔵の中身が、何で増えて何で減ったか</div>' + itemTab(led.pinv, days, 'p|') : tab === 'stock' ? '<div class="lg-m">全部の拠点の在庫の合計が、何で増えて何で減ったか（市場の売り買いはプレイヤーの物と逆向きに出ます）</div>' + itemTab(led.stock, days, 's|') : msTab());
    }
    const sc = el.querySelector('.lg-box') ? el.querySelector('.lg-box').scrollTop : 0;
    el.innerHTML = `<style>
#ledgerUi{position:fixed;inset:0;z-index:8500;background:rgba(10,8,6,.7);display:flex;align-items:center;justify-content:center}
#ledgerUi .lg-box{background:var(--panel,rgba(24,20,15,.95));border:1px solid var(--line,#8a7448);border-radius:8px;padding:12px 14px;max-width:760px;width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:auto;color:var(--ink,#efe6cc);box-sizing:border-box}
#ledgerUi .lg-h{color:var(--gold,#f2c14e);font-weight:bold;font-size:17px;margin-bottom:4px}
#ledgerUi .lg-m{color:#bdb294;font-size:12px;font-style:normal}
#ledgerUi button{margin:2px;padding:6px 9px;background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);border-radius:5px;font:inherit;cursor:pointer}
#ledgerUi .lg-tabs{margin:8px 0 4px;border-bottom:1px solid var(--line,#8a7448)}
#ledgerUi .lg-tabs button.on{background:#5a4626;color:var(--gold,#f2c14e)}
#ledgerUi .lg-row{display:grid;grid-template-columns:minmax(0,2.2fr) repeat(4,minmax(0,1fr)) 44px;gap:4px;padding:3px 2px;font-size:13px;border-bottom:1px solid rgba(138,116,72,.25)}
#ledgerUi .lg-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ledgerUi .lg-row span:not(:first-child){text-align:right}
#ledgerUi .lg-hd{color:var(--gold,#f2c14e);font-weight:bold}
#ledgerUi .lg-g{cursor:pointer}
#ledgerUi .lg-g:hover{background:rgba(242,193,78,.08)}
#ledgerUi .lg-s{font-size:12px;color:#d6ccb0;padding-left:16px}
#ledgerUi .lg-s span:first-child{white-space:normal}
#ledgerUi .lg-pos{color:#9fd18b}
#ledgerUi .lg-neg{color:#e08a7a}
@media (max-width:560px){#ledgerUi .lg-row{grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr));font-size:11px}#ledgerUi .lg-row span:nth-child(5),#ledgerUi .lg-row span:nth-child(6){display:none}}
</style><div class="lg-box"><div class="lg-h">帳簿（テストモード）<button data-x="1" style="float:right">閉じる</button></div>${body}</div>`;
    const bx = el.querySelector('.lg-box'); if (bx) bx.scrollTop = sc;
  }
  // 日を進める（1日ずつ区切って、画面が固まらないように）
  function advance(n) {
    const g = G(); if (busy || !g || g.mode !== 'host' || !g.world) return;
    busy = true; let left = n;
    const one = () => {
      if (!el || !left) { busy = false; render(); return; }
      SIM.step(g.world, 1440); left--;
      const b = el.querySelector('#lgBusy'); if (b) b.textContent = `進めています…あと${left}日`;
      setTimeout(one, 0);
    };
    one();
  }
  function onClick(e) {
    if (e.target === el) return U.close();
    const t = e.target.closest('[data-tg]'); if (t) { const k = t.dataset.tg; if (open.has(k)) open.delete(k); else open.add(k); return render(); }
    const bt = e.target.closest('button'); if (!bt) return; const d = bt.dataset;
    if (d.x) return U.close();
    if (d.tab) { tab = d.tab; return render(); }
    if (d.rf) return render();
    if (d.clr) { L().reset(G() && G().world); return render(); }
    if (d.adv) return advance(+d.adv);
  }
})();
