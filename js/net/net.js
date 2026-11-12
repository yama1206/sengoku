// 通信（PeerJS・部屋コード方式。ホストが世界を計算し、参加者は命令を送って結果を受け取るだけ）
(function () {
  const NET = SGK.NET = {};
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  NET.CODE_CHARS = CODE_CHARS;
  NET.makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

  // ホスト：h = { onHello(conn, msg) -> pid|null, onCmd(pid, cmd), onLeave(pid), onReady(code), onError(text) }
  NET.host = function (h) {
    const code = NET.makeCode();
    const peer = new Peer(SGK.CFG.PEER_PREFIX + code);
    const conns = new Map(); // conn -> pid
    peer.on('open', () => h.onReady(code));
    peer.on('error', (e) => h.onError(e.type === 'unavailable-id' ? '部屋コードが重なりました。もう一度お試しください' : '通信エラー: ' + e.type));
    peer.on('connection', (conn) => {
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'hello') {
          if (m.ver !== SGK.VERSION) { conn.send({ t: 'bye', reason: `バージョンが違います（ホスト ${SGK.VERSION}）。更新ボタンを押してください` }); setTimeout(() => conn.close(), 500); return; }
          const pid = h.onHello(conn, m);
          if (!pid) { conn.send({ t: 'bye', reason: '満員です' }); setTimeout(() => conn.close(), 500); return; }
          conns.set(conn, pid);
        } else if (m.t === 'cmd' && conns.has(conn)) h.onCmd(conns.get(conn), m.cmd);
      });
      conn.on('close', () => { const pid = conns.get(conn); conns.delete(conn); if (pid) h.onLeave(pid); });
    });
    return {
      each(fn) { for (const [c, pid] of conns) if (c.open) c.send(fn(pid)); },
      broadcast(msg) { for (const c of conns.keys()) if (c.open) c.send(msg); },
      count: () => conns.size,
      pids: () => [...conns.values()],
      close() { for (const c of conns.keys()) try { c.send({ t: 'bye', reason: 'ホストがワールドを閉じました' }); } catch (e) {} setTimeout(() => peer.destroy(), 300); },
    };
  };

  // 参加者：h = { onWelcome(msg), onState(msg), onBye(reason), onError(text) }
  NET.join = function (code, token, name, h) {
    const peer = new Peer();
    let conn, done = false;
    const end = (why) => { if (done) return; done = true; h.onBye(why); try { peer.destroy(); } catch (e) {} };
    peer.on('open', () => {
      conn = peer.connect(SGK.CFG.PEER_PREFIX + code.trim().toUpperCase(), { reliable: true });
      conn.on('open', () => conn.send({ t: 'hello', token, name, ver: SGK.VERSION }));
      conn.on('data', (m) => {
        if (m.t === 'welcome') h.onWelcome(m);
        else if (m.t === 'state') h.onState(m);
        else if (m.t === 'bye') end(m.reason);
      });
      conn.on('close', () => end('ホストとの接続が切れました'));
    });
    peer.on('error', (e) => { if (e.type === 'peer-unavailable') end('その部屋コードの部屋が見つかりません'); else h.onError('通信エラー: ' + e.type); });
    return {
      send(cmd) { if (conn && conn.open) conn.send({ t: 'cmd', cmd }); },
      close() { done = true; try { peer.destroy(); } catch (e) {} },
    };
  };
})();
