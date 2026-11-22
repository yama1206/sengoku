// 2.102.0 遊戯屋の画面：カードゲーム（card/index.html）を全画面で重ねて開く。お金（文）だけ天下往来とつなぐ
(function () {
  const Y = (SGK.YUGIUI = {});
  let el = null, fr = null, lastMoney = null, lastAt = 0;
  Y.isOpen = () => !!el;
  const send = (o) => { try { fr.contentWindow.postMessage(Object.assign({ sgkCard: 1 }, o), '*'); } catch (e) { /* 読み込み前は無視 */ } };
  const wallet = (P, force) => {
    const m = P && P.me ? P.me.money : null; if (m == null) return;
    if (force || m !== lastMoney) { lastMoney = m; send({ t: 'wallet', money: m }); }
  };
  function onMsg(e) {
    if (!el || !fr || e.source !== fr.contentWindow) return;
    const m = e.data; if (!m || m.sgkCard !== 1) return;
    if (m.t === 'ready') wallet(Y.P, true);
    else if (m.t === 'pay') { const d = Math.trunc(+m.d); if (d) SGK.cmd({ type: 'yugiPay', d }); }
    else if (m.t === 'close') Y.close();
  }
  Y.open = (P) => {
    if (el) return;
    Y.P = P; lastMoney = null;
    el = document.createElement('div'); el.id = 'yugiHall';
    el.style.cssText = 'position:fixed;inset:0;z-index:8800;background:#000';
    const v = (document.querySelector('meta[name="sgk-ver"]') || {}).content || Date.now();
    el.innerHTML = `<iframe src="card/index.html?embed=1&v=${v}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay"></iframe>`;
    document.body.appendChild(el); fr = el.firstChild;
    window.addEventListener('message', onMsg);
  };
  Y.close = () => { if (!el) return; window.removeEventListener('message', onMsg); el.remove(); el = fr = null; };
  Y.update = (P) => { Y.P = P; const n = performance.now(); if (n - lastAt < 300) return; lastAt = n; wallet(P, false); };
})();
