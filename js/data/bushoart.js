// 2.14.0 武将の立ち絵：絵のある武将の名前 → assets/busho/ のファイル名（tools/busho_cut.py が tools/busho/art.json から作る。手で直さない）
(function () {
  const ART = {

  };
  SGK.bushoImg = (name) => (name && ART[name] ? `assets/busho/${ART[name]}.png` : null);
  SGK.bushoCount = () => Object.keys(ART).length;
})();
