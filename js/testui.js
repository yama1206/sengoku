// 2.12.1 テストモードの「戦闘」ボタンで開く画面：野戦・攻城戦を選んで、すぐ戦場を確かめる
(function () {
  const T = (SGK.TESTUI = {}), SIM = SGK.SIM;
  let el = null;
  T.close = () => { if (el) el.remove(); el = null; };
  T.open = (me) => {
    T.close();
    const t = (me && me.test) || { own: [] }, FAM = SIM.NAWA_FAMOUS || {}, KAI = (SIM.FUSHIN && SIM.FUSHIN.kai) || [];
    const b = (data, label) => `<button ${Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(' ')}>${label}</button>`;
    let h = `<div class="tm-box"><div class="tm-h">テストの戦闘<button data-x="1" style="float:right">閉じる</button></div>`
      + `<div class="tm-m">終わると兵・お金・場所は元に戻ります。兵は決まった数（槍・長槍・弓・鉄砲・騎馬）で戦います</div>`
      + `<div class="tm-h2">野戦</div>${b({ kind: 'field' }, '野盗（小勢）')}${b({ kind: 'field', big: 1 }, '敵の軍勢（大勢）')}<div class="tm-m">毎回ちがう場所の地形になります（森・丘・川・海）</div>`
      + `<div class="tm-h2">攻城戦</div>`;
    for (const [ck, nm] of [['hira', '平城'], ['yama', '山城'], ['mizu', '水城']]) h += `<div class="tm-row"><b>${nm}</b>${[0, 1, 2, 3, 4, 5].map((lv) => b({ kind: 'siege', ck, lv }, `${lv}<span class="tm-s">${(KAI[lv] || {}).name || ''}</span>`)).join('')}</div>`;
    h += `<div class="tm-h2">名のある城</div><div class="tm-row"><span class="tm-m">改築の段階：</span><select id="tmLv">${[0, 1, 2, 3, 4, 5].map((lv) => `<option value="${lv}" ${lv === 3 ? 'selected' : ''}>${lv} ${(KAI[lv] || {}).name || ''}</option>`).join('')}</select></div>`
      + Object.entries(FAM).map(([id, f]) => b({ kind: 'siege', fam: id }, f.name)).join('');
    if (t.own && t.own.length) h += `<div class="tm-h2">自分で築いた城</div>${t.own.map(([id, nm]) => b({ kind: 'siege', own: id }, nm)).join('')}`;
    h += '</div>';
    el = document.createElement('div'); el.id = 'testUi';
    el.innerHTML = `<style>
#testUi{position:fixed;inset:0;z-index:8500;background:rgba(10,8,6,.7);display:flex;align-items:center;justify-content:center}
#testUi .tm-box{background:var(--panel,rgba(24,20,15,.95));border:1px solid var(--line,#8a7448);border-radius:8px;padding:12px 14px;max-width:560px;width:calc(100% - 24px);max-height:calc(100% - 24px);overflow:auto;color:var(--ink,#efe6cc);box-sizing:border-box}
#testUi .tm-h{color:var(--gold,#f2c14e);font-weight:bold;font-size:17px;margin-bottom:4px}
#testUi .tm-h2{color:var(--gold,#f2c14e);font-weight:bold;margin:10px 0 4px}
#testUi .tm-m{color:#bdb294;font-size:12px}
#testUi .tm-row{display:flex;flex-wrap:wrap;align-items:center;gap:2px;margin:3px 0}
#testUi .tm-row b{width:44px}
#testUi .tm-s{display:block;font-size:10px;color:#bdb294}
#testUi button{margin:2px;padding:6px 9px;background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);border-radius:5px;font:inherit;cursor:pointer}
#testUi select{background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);padding:4px}
</style>${h}`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el) return T.close();
      const bt = e.target.closest('button'); if (!bt) return; const d = bt.dataset;
      if (d.x) return T.close();
      const c = { type: 'testBattle', kind: d.kind };
      if (d.big) c.big = 1; if (d.ck) c.ck = d.ck; if (d.lv != null) c.lv = +d.lv; if (d.fam) { c.fam = d.fam; c.lv = +el.querySelector('#tmLv').value; } if (d.own) c.own = d.own;
      T.close(); SGK.cmd(c);
    });
  };
})();
