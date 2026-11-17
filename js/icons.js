// 2.12.4 絵文字の代わりの絵（assets/icons/名前.png。tools/gen_art.py で作り、背景を抜いたもの）
//  SGK.ICON.html(名前, 大きさ) で <img>、SGK.ICON.img(名前) で地図に描く絵（読めていなければ null）、
//  SGK.ICON.tok(文) で文の中の {i:名前} を絵にする（お知らせなど）
(function () {
  const I = (SGK.ICON = {}), cache = {};
  I.url = (k) => `assets/icons/${k}.png`;
  I.html = (k, px = 18, alt = '') => `<img class="ico" src="assets/icons/${k}.png" alt="${alt}" draggable="false" style="width:${px}px;height:${px}px;vertical-align:-0.22em;object-fit:contain">`;
  I.img = (k) => { let im = cache[k]; if (!im) { im = cache[k] = new Image(); im.src = I.url(k); } return im.complete && im.naturalWidth ? im : null; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  I.tok = (s, px = 18) => esc(s).replace(/\{i:(\w+)\}/g, (_, k) => I.html(k, px));
  // 地図の村の特産などで使う絵は、はじめに読んでおく
  for (const k of ['rice', 'salt', 'cotton', 'sake', 'firewood', 'iron', 'tea']) I.img(k);
})();
