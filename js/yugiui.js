// 2.102.0 遊戯屋の画面：カードゲーム（card/index.html）を全画面で重ねて開く。お金（文）だけ天下往来とつなぐ
(function () {
  const Y = (SGK.YUGIUI = {});
  let el = null, fr = null, lastMoney = null, lastAt = 0, seen = 0, lastLobby = '', ackAt = 0; // 2.106.7 seen：届けた中継の番号・lastLobby：前に送った手合わせの相手の一覧
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
    else if (m.t === 'net' && m.mid && m.m) SGK.cmd({ type: 'yugiSend', mid: m.mid, m: m.m }); // 2.106.7 対戦のことづてを相手へ
    else if (m.t === 'inv' && m.to) SGK.cmd({ type: 'yugiInv', to: m.to });
    else if (m.t === 'accept' && m.id) SGK.cmd({ type: 'yugiAccept', id: m.id });
    else if (m.t === 'decline' && m.id) SGK.cmd({ type: 'yugiDecline', id: m.id });
    else if (m.t === 'end' && m.mid) SGK.cmd({ type: 'yugiEnd', mid: m.mid, quit: !!m.quit });
    if (m.t === 'ready') { seen = 0; lastLobby = ''; relay(Y.P, true); }
  }
  // 2.106.7 手合わせ：同じ町の人と申し込みの一覧、ホストから届いたことづてを札の画面へ渡す
  function relay(P, force) {
    const yg = P && P.me && P.me.yugi; if (!yg) return;
    const lb = JSON.stringify({ people: yg.people || [], inv: yg.inv || [] });
    if (force || lb !== lastLobby) { lastLobby = lb; send(Object.assign({ t: 'lobby' }, JSON.parse(lb))); }
    if (yg.box) {
      let top = seen; for (const x of yg.box) if (x.s > seen) { send({ t: 'net', m: x.m }); if (x.s > top) top = x.s; }
      const n = performance.now(); if (top > seen || n - ackAt > 1000) { seen = Math.max(seen, top); ackAt = n; SGK.cmd({ type: 'yugiAck', n: seen }); }
    }
  }
  Y.open = (P) => {
    if (el) return;
    Y.P = P; lastMoney = null; seen = 0; lastLobby = '';
    el = document.createElement('div'); el.id = 'yugiHall';
    el.style.cssText = 'position:fixed;inset:0;z-index:8800;background:#000';
    const v = (document.querySelector('meta[name="sgk-ver"]') || {}).content || Date.now();
    el.innerHTML = `<iframe src="card/index.html?embed=1&v=${v}" style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay"></iframe>`;
    document.body.appendChild(el); fr = el.firstChild;
    window.addEventListener('message', onMsg);
  };
  Y.close = () => { if (!el) return; window.removeEventListener('message', onMsg); el.remove(); el = fr = null; };
  Y.update = (P) => { Y.P = P; relay(P, false); const n = performance.now(); if (n - lastAt < 300) return; lastAt = n; wallet(P, false); };
})();
