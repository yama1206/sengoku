// 2.102.0 遊戯屋（大きな町）：カードゲーム「戦国思想録」の入口。カードの所持は別セーブ、お金（文）だけ天下往来とつなぐ
//  カード側（card/index.html）が postMessage で「何文払った／もらった」を送り、画面側（yugiui.js）が yugiPay 命令にしてホストへ届ける
(function () {
  const SIM = SGK.SIM;
  SIM.commands.yugiPay = (w, p, c) => {
    let d = Math.trunc(+c.d);
    if (!isFinite(d) || !d) return;
    if (d < 0) { if (p.money < -d) return; p.money += d; return; } // 払う：足りなければ何も起きない
    p.money += Math.min(d, 5000); // もらう：対戦の賞金。1回5貫まで
  };
})();
