// 2.104.0 端末の引っ越し（クロスセーブ）：この端末の「自分の分」（プレイヤーの識別・名前・引き継ぎデータ）をコードにして、別の端末へ移す
//  どの世界でも、同じプレイヤーとして戻れる（世界はクラウド保存なので、世界コードで入れば続きから）
(function () {
  const $ = (id) => document.getElementById(id);
  const KEYS = ['sgk_token', 'sgk_name', 'sgk_carry']; // 移すもの
  const enc = (s) => btoa(unescape(encodeURIComponent(s)));
  const dec = (s) => decodeURIComponent(escape(atob(s)));
  function makeCode() { const o = {}; for (const k of KEYS) { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) { /* 無視 */ } } return 'SGK1:' + enc(JSON.stringify(o)); }
  function applyCode(code) {
    code = String(code || '').trim(); if (!code.startsWith('SGK1:')) throw new Error('コードの形が違います（SGK1: から始まるコードを貼ってください）');
    let o; try { o = JSON.parse(dec(code.slice(5))); } catch (e) { throw new Error('コードが読めませんでした（途中で切れていないか確かめてください）'); }
    if (!o || typeof o !== 'object' || typeof o.sgk_token !== 'string' || o.sgk_token.length < 8 || o.sgk_token.length > 60) throw new Error('コードが正しくありません');
    for (const k of KEYS) if (typeof o[k] === 'string') localStorage.setItem(k, o[k]);
  }
  function open() {
    if (document.getElementById('xferBox')) return;
    const d = document.createElement('div'); d.id = 'xferBox';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:12px';
    d.innerHTML = '<div style="background:#2a1d10;border:2px solid #c9a24a;border-radius:8px;max-width:520px;width:100%;padding:14px;color:#f2e6c9;font-size:14px;line-height:1.6">' +
      '<b>端末の引っ越し（クロスセーブ）</b><br><span style="font-size:12px;opacity:.85">この端末の「自分の分」（武将の識別・名前・腕/図鑑/家宝の引き継ぎ）をコードで別の端末へ移します。世界はクラウドに保存されるので、移したあと同じ世界コードで入れば続きから遊べます。コードは他の人に見せないでください（そのコードを使うと、あなたの武将として入れてしまいます）。</span>' +
      '<div style="margin:8px 0 4px"><b>① この端末のコードを取り出す</b></div><button id="xfMake">コードを作ってコピー</button>' +
      '<div style="margin:10px 0 4px"><b>② 別の端末で、コードを貼って読み込む</b></div><textarea id="xfText" rows="4" style="width:100%;box-sizing:border-box;font-size:12px" placeholder="SGK1:…"></textarea>' +
      '<div style="margin-top:6px"><button id="xfApply">この端末に読み込む（いまの端末の分は置きかわります）</button> <button id="xfClose">閉じる</button></div><div id="xfMsg" style="margin-top:6px;font-size:13px;color:#ffd98a"></div></div>';
    document.body.appendChild(d);
    const msg = (t) => { $('xfMsg').textContent = t; };
    $('xfClose').onclick = () => d.remove();
    $('xfMake').onclick = async () => {
      const c = makeCode(); $('xfText').value = c;
      try { await navigator.clipboard.writeText(c); msg('コピーしました。別の端末の②に貼ってください'); } catch (e) { $('xfText').select(); msg('下の枠のコードを全部コピーしてください'); }
    };
    $('xfApply').onclick = () => {
      try { applyCode($('xfText').value); msg('読み込みました。ページを読み込み直します…'); setTimeout(() => location.reload(), 800); } catch (e) { msg(e.message); }
    };
  }
  document.addEventListener('DOMContentLoaded', () => { const b = $('btnXfer'); if (b) b.onclick = open; });
  if (document.readyState !== 'loading') { const b = $('btnXfer'); if (b) b.onclick = open; }
})();
