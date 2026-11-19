// 通信（2.3.0 イセログ方式：世界コード＋ホストの掲示板。ホストが世界を計算し、参加者は命令を送って結果を受け取る）
// 掲示板 worlds/sg世界コード/host ＝ { id:ホストのPeerJS ID, n:合言葉, at:サーバー時刻, name, cnt:人数, ver }
// ホストは HOST_BEAT ごとに at を更新する。HOST_TTL より古ければ「空き」で、次に入った人がホストになる
(function () {
  const NET = SGK.NET = {};
  const CL = SGK.CLOUD;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  NET.CODE_LEN = 6;

  NET.openPeer = () => new Promise((res, rej) => {
    if (!window.Peer) return rej(new Error('通信ライブラリを読み込めませんでした'));
    const p = new Peer(), tm = setTimeout(() => { try { p.destroy(); } catch (e) {} rej(new Error('通信の準備ができませんでした')); }, 10000);
    p.on('open', () => { clearTimeout(tm); res(p); });
    p.on('error', (e) => { if (!p.open) { clearTimeout(tm); rej(new Error('通信エラー: ' + e.type)); } });
  });

  // ホストに名乗り出る：書いてから少し待って読み直し、自分の合言葉が残っていればホスト
  NET.claim = claim;
  async function claim(code, peer, info) {
    const n = Math.random().toString(36).slice(2, 10);
    await CL.rest(code, 'host', 'PUT', Object.assign({ id: peer ? peer.id : '', n, at: { '.sv': 'timestamp' }, ver: SGK.VERSION }, info()));
    await sleep(1200 + Math.random() * 400);
    const h = await CL.rest(code, 'host');
    return h && h.n === n ? n : null;
  }

  // 世界に入る：ホストがいれば参加者、いなければ自分がホスト。{ role:'host', peer, nonce } / { role:'guest', peer, board }
  NET.enter = async function (code, info) {
    await CL.clock(code);
    let peer = null; try { peer = await NET.openPeer(); } catch (e) { console.warn(e); } // 使えなくても、ホストとして1人では遊べる
    try {
      for (let tr = 0; tr < 4; tr++) {
        const h = await CL.rest(code, 'host');
        if (CL.fresh(h)) {
          if (h.ver !== SGK.VERSION) throw new Error(`この世界はいま ver ${h.ver} で遊ばれています（あなたは ${SGK.VERSION}）。両方とも更新ボタンを押してください`);
          if (!peer) throw new Error('通信の準備ができませんでした。少し待ってから、もう一度入ってください');
          if (h.id) return { role: 'guest', peer, board: h };
          await sleep(2500); continue;
        }
        const n = await claim(code, peer, info);
        if (n) return { role: 'host', peer, nonce: n };
        await sleep(2500);
      }
      throw new Error('ホストにつながりませんでした。少し待ってから、もう一度入ってください');
    } catch (e) { if (peer) try { peer.destroy(); } catch (x) {} throw e; }
  };

  // ホスト：h = { onHello(conn, msg) -> pid|null, onCmd(pid, cmd), onLeave(pid), onLost(text), info() -> {name,cnt} }
  NET.host = function (peer, code, nonce, h) {
    const conns = new Map(); // conn -> pid
    let gone = false;
    const rec = () => Object.assign({ id: peer ? peer.id : '', n: nonce, at: { '.sv': 'timestamp' }, ver: SGK.VERSION }, h.info());
    let lastBeat = Date.now(), beating = false;
    const beat = async () => {
      if (beating) return; beating = true; lastBeat = Date.now();
      try {
        const b = await CL.rest(code, 'host'); if (gone) return;
        if (b && b.n !== nonce && CL.fresh(b)) { gone = true; h.onLost('別の人がこの世界のホストになりました'); return; }
        await CL.rest(code, 'host', 'PUT', rec());
      } catch (e) { console.warn(e); } finally { beating = false; }
    };
    // 裏のタブでは setInterval が遅くなるので、ホストの進行（Worker の合図）からも呼ぶ
    const tick = () => { if (!gone && Date.now() - lastBeat >= SGK.CFG.HOST_BEAT) beat(); };
    const iv = setInterval(tick, 1000);
    if (peer) {
      peer.on('connection', (conn) => {
        conn.on('data', (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'hello') {
            if (m.ver !== SGK.VERSION) { conn.send({ t: 'bye', reason: `バージョンが違います（ホスト ${SGK.VERSION}）。更新ボタンを押してください` }); setTimeout(() => conn.close(), 500); return; }
            const pid = h.onHello(conn, m);
            if (!pid) { conn.send({ t: 'bye', reason: '満員です' }); setTimeout(() => conn.close(), 500); return; }
            for (const [c, p] of conns) if (p === pid && c !== conn) { conns.delete(c); try { c.close(); } catch (e) {} } // 同じ人がつなぎ直したら古い方を切る
            conns.set(conn, pid);
          } else if (m.t === 'cmd' && conns.has(conn)) h.onCmd(conns.get(conn), m.cmd);
        });
        conn.on('close', () => { const pid = conns.get(conn); if (!pid) return; conns.delete(conn); if (![...conns.values()].includes(pid)) h.onLeave(pid); });
      });
      peer.on('disconnected', () => setTimeout(() => { try { if (!gone && !peer.destroyed) peer.reconnect(); } catch (e) {} }, 2000));
    }
    return {
      each(fn) { for (const [c, pid] of conns) if (c.open) { const m = fn(pid); try { c.send(JSON.stringify(m)); } catch (e) { console.error(e); try { c.send({ t: 'err', text: 'エラー(送信): ' + (e && e.message) }); } catch (e2) {} } } },
      sendTo(pid, msg) { const j = JSON.stringify(msg); for (const [c, p] of conns) if (p === pid && c.open) c.send(j); },
      broadcast(msg) { const j = JSON.stringify(msg); for (const c of conns.keys()) if (c.open) c.send(j); },
      count: () => conns.size,
      pids: () => [...new Set(conns.values())],
      beat, tick,
      // 掲示板を消す（すぐ次の人がホストになれるように）。閉じる時は keepalive で送りっぱなし
      unboard(ka) { return CL.rest(code, 'host', 'DELETE', undefined, ka).catch(() => {}); },
      close(why) {
        gone = true; clearInterval(iv);
        for (const c of conns.keys()) try { c.send({ t: 'bye', reason: why || 'ホストが世界から出ました', h: 1 }); } catch (e) {} // h：ホストが抜けた（参加者は引き継ぎへ）
        setTimeout(() => { try { if (peer) peer.destroy(); } catch (e) {} }, 300);
      },
    };
  };

  // 参加者：h = { onWelcome(msg), onState(msg), onAct(msg), onMine(msg), onErr(msg), onBye(reason), onLost(reason) }
  // 2.4.0 onLost：ホストが抜けた・届かなくなった（引き継ぎへ）。onBye：入れなかった（タイトルへ）
  NET.join = function (peer, board, token, name, h) {
    let conn, done = false, ok = false, lastRx = Date.now();
    const end = (why, lost) => { if (done) return; done = true; clearInterval(wd); (lost && ok && h.onLost ? h.onLost : h.onBye)(why); try { peer.destroy(); } catch (e) {} };
    const wd = setInterval(() => { if (ok && Date.now() - lastRx > SGK.CFG.HOST_LOST) end('ホストから届かなくなりました', true); }, 2000);
    const tm = setTimeout(() => { if (!ok) end('ホストから返事がありませんでした。少し待ってから、もう一度入ってください'); }, 12000);
    conn = peer.connect(board.id, { reliable: true });
    conn.on('open', () => conn.send({ t: 'hello', token, name, ver: SGK.VERSION, prof: NET.prof || null, mine: NET.mine ? NET.mine() : null }));
    conn.on('data', (m) => {
      lastRx = Date.now();
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { if (h.onErr) h.onErr({ text: 'エラー(受信): ' + e.message }); return; } } // ホストからは文字列(JSON)で届く
      if (!m || !m.t) { if (h.onErr) h.onErr({ text: 'エラー(受信): 読めないデータ ' + typeof m }); return; }
      if (m.t === 'welcome') { ok = true; clearTimeout(tm); h.onWelcome(m); }
      else if (m.t === 'state') h.onState(m);
      else if (m.t === 'act') { if (h.onAct) h.onAct(m); }
      else if (m.t === 'mine') { if (h.onMine) h.onMine(m); }
      else if (m.t === 'nin') { if (h.onNin) h.onNin(m); } // 2.41.0 忍びの協力任務のやりとり（ホストが中継）
      else if (m.t === 'err') { if (h.onErr) h.onErr(m); }
      else if (m.t === 'bye') end(m.reason, !!m.h);
    });
    conn.on('close', () => end('ホストとの接続が切れました', true));
    peer.on('error', (e) => { if (e.type === 'peer-unavailable') end('ホストが見つかりませんでした（抜けたばかりかもしれません）。20秒ほど待ってから、もう一度入ってください'); else if (!ok) end('通信エラー: ' + e.type); else end('通信エラー: ' + e.type, true); });
    return {
      send(cmd) { if (conn && conn.open) conn.send({ t: 'cmd', cmd }); },
      close() { done = true; clearTimeout(tm); clearInterval(wd); try { peer.destroy(); } catch (e) {} },
    };
  };
})();
