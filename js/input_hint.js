// 3.24.0 操作表記の切り替え：いま触っている機器（キーボード・マウス／コントローラー／タッチ）に合わせて、画面の操作の文字を変える
// 使い方：SGK.HINT.pick({ kb: 'Space', pad: '×', touch: '「速く」ボタン' }) で、いまの機器の文字を取る
//        SGK.HINT.btn('A') で、コントローラーの名前（A/B/X/Y/LB/RB/START）を設定どおりの文字にする（Xbox系・PS系・Switch）
//        HTML の要素に data-kb / data-pad / data-touch を付けると、機器が変わった時に自動で書き換わる
(function () {
  const SGK = window.SGK, H = (SGK.HINT = { dev: 'kb' });
  const set = (d) => {
    if (H.dev === d) return;
    H.dev = d;
    try { document.body && (document.body.dataset.dev = d); } catch (e) {}
    try { window.dispatchEvent(new Event('sgk-device')); } catch (e) {}
    H.apply();
  };
  addEventListener('keydown', () => set('kb'), true);
  addEventListener('pointerdown', (e) => set(e.pointerType === 'touch' ? 'touch' : 'kb'), true);
  // コントローラーは押したか、スティックを大きく倒した時に切り替える
  setInterval(() => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    const on = pads.some((p) => p && p.connected !== false && (p.buttons.some((b) => b && b.pressed) || p.axes.some((a) => Math.abs(a) > 0.5)));
    if (on) set('pad');
  }, 150);

  // コントローラーの表示（設定の「コントローラー表示」と同じ並び）
  const STYLES = {
    xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', START: 'START' },
    ps: { A: '×', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', START: 'OPTIONS' },
    switch: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', START: '＋' },
  };
  H.padStyle = () => { try { const s = localStorage.getItem('sgk-pad'); return STYLES[s] ? s : 'xbox'; } catch (e) { return 'xbox'; } };
  H.btn = (name) => (H.dev === 'pad' ? (STYLES[H.padStyle()][name] || name) : name);
  // 機器ごとの文字を選ぶ（touch がなければ kb、pad がなければ kb を使う）
  H.pick = (m) => {
    if (H.dev === 'pad' && m.pad != null) return m.pad;
    if (H.dev === 'touch' && m.touch != null) return m.touch;
    return m.kb != null ? m.kb : '';
  };
  // data-kb / data-pad / data-touch の付いた要素を、いまの機器の文字に書き換える
  H.apply = () => {
    if (!document.querySelectorAll) return;
    document.querySelectorAll('[data-kb],[data-pad],[data-touch]').forEach((el) => {
      const v = H.pick({ kb: el.dataset.kb, pad: el.dataset.pad, touch: el.dataset.touch });
      if (v) el.textContent = v;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', H.apply); else H.apply();
})();
