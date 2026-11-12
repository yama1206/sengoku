// 通信（PeerJS・部屋コード方式。ホストが世界を計算し、参加者は命令を送って結果を受け取るだけ）
(function () {
  const NET = SGK.NET = {};
  const CODE_CHARS = '0123456789';
  NET.CODE_LEN = 6;
  NET.CODE_CHARS = CODE_CHARS;
  NET.makeCode = () => Array.from({ length: NET.CODE_LEN }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

  // ---- フレンド：自分のフレンドコード（＝ホストするときの部屋コード）と、フレンド一覧 ----
  NET.myCode = () => {
    let c = localStorage.getItem('sgk-fcode');
    if (!c || !/^\d{6}$/.test(c)) { c = NET.makeCode(); localStorage.setItem('sgk-fcode', c); }
    return c;
  };
  NET.friends = () => { try { return JSON.parse(localStorage.getItem('sgk-friends')) || []; } catch (e) { return []; } };
  NET.saveFriends = (l) => localStorage.setItem('sgk-friends', JSON.stringify(l.slice(0, 30)));
  NET.addFriend = (code, name) => {
    code = String(code || '').replace(/\D/g, ''); if (code.length !== NET.CODE_LEN || code === NET.myCode()) return false;
    const l = NET.friends(), f = l.find((x) => x.code === code);
    if (f) { if (name) f.name = String(name).slice(0, 12); } else l.unshift({ code, name: String(name || '').slice(0, 12) || 'フレンド' });
    NET.saveFriends(l); return true;
  };
  NET.removeFriend = (code) => NET.saveFriends(NET.friends().filter((x) => x.code !== code));
  // フレンドが部屋を開いているか調べる：cb(code, info|null)。info = { name, n, max, ver }
  NET.probe = function (codes, cb) {
    if (!window.Peer || !codes.length) return { close() {} };
    const peer = new Peer(), left = new Set(codes);
    const done = (c, info) => { if (!left.has(c)) return; left.delete(c); cb(c, info); if (!left.size) setTimeout(() => { try { peer.destroy(); } catch (e) {} }, 200); };
    peer.on('open', () => {
      for (const c of codes) {
        const conn = peer.connect(SGK.CFG.PEER_PREFIX + c, { reliable: true });
        conn.on('open', () => conn.send({ t: 'ping' }));
        conn.on('data', (m) => { if (m && m.t === 'pong') { done(c, m); conn.close(); } });
      }
    });
    peer.on('error', (e) => { if (e.type === 'peer-unavailable') { const m = String(e.message || '').match(/(\d{6})\s*$/); if (m) done(m[1], null); } });
    setTimeout(() => { for (const c of [...left]) done(c, null); }, 7000);
    return { close() { left.clear(); try { peer.destroy(); } catch (e) {} } };
  };

  // ホスト：h = { onHello(conn, msg) -> pid|null, onCmd(pid, cmd), onLeave(pid), onReady(code), onError(text), info() -> {name,n,max} }
  // 部屋コードは自分のフレンドコード（使えないときだけその場で作る）
  NET.host = function (h) {
    let code = NET.myCode(), peer, tried = false;
    const conns = new Map(); // conn -> pid
    const open = () => {
      peer = new Peer(SGK.CFG.PEER_PREFIX + code);
      peer.on('open', () => h.onReady(code));
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && !tried) { tried = true; try { peer.destroy(); } catch (x) {} code = NET.makeCode(); open(); return; } // 別のタブなどで使用中
        h.onError(e.type === 'unavailable-id' ? '部屋コードが重なりました。もう一度お試しください' : '通信エラー: ' + e.type);
      });
      peer.on('connection', onConn);
    };
    const onConn = (conn) => {
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'ping') { conn.send(Object.assign({ t: 'pong', ver: SGK.VERSION }, h.info ? h.info() : {})); setTimeout(() => conn.close(), 500); return; }
        if (m.t === 'hello') {
          if (m.ver !== SGK.VERSION) { conn.send({ t: 'bye', reason: `バージョンが違います（ホスト ${SGK.VERSION}）。更新ボタンを押してください` }); setTimeout(() => conn.close(), 500); return; }
          const pid = h.onHello(conn, m);
          if (!pid) { conn.send({ t: 'bye', reason: '満員です' }); setTimeout(() => conn.close(), 500); return; }
          conns.set(conn, pid);
        } else if (m.t === 'cmd' && conns.has(conn)) h.onCmd(conns.get(conn), m.cmd);
      });
      conn.on('close', () => { const pid = conns.get(conn); conns.delete(conn); if (pid) h.onLeave(pid); });
    };
    open();
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
      conn = peer.connect(SGK.CFG.PEER_PREFIX + code.replace(/\D/g, ''), { reliable: true });
      conn.on('open', () => conn.send({ t: 'hello', token, name, ver: SGK.VERSION, fcode: NET.myCode(), prof: NET.prof || null }));
      conn.on('data', (m) => {
        if (m.t === 'welcome') h.onWelcome(m);
        else if (m.t === 'state') h.onState(m);
        else if (m.t === 'bye') end(m.reason);
      });
      conn.on('close', () => end('ホストとの接続が切れました'));
    });
    peer.on('error', (e) => { if (e.type === 'peer-unavailable') end('その部屋が見つかりません（いまは開いていないようです）'); else h.onError('通信エラー: ' + e.type); });
    return {
      send(cmd) { if (conn && conn.open) conn.send({ t: 'cmd', cmd }); },
      close() { done = true; try { peer.destroy(); } catch (e) {} },
    };
  };
})();
