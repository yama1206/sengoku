// 2.50.0 引き継ぎの画面（タイトルの「引き継ぎ」）。表示だけ。ボタンの動きは main.js（carryBody のクリック）
(function () {
  const SIM = SGK.SIM, UI = (SGK.CARRYUI = {});
  UI.html = () => {
    const CY = SGK.CARRY, c = CY.load(), SM = SIM.SMITH, D = SGK.DATA;
    const nCr = Object.keys(c.zukan).length, nOre = Object.keys(c.oreZ).length, totCr = (D.creatures || []).length, totOre = SGK.MINE ? SGK.MINE.MIN.length : 0;
    const arm = SM ? SM.ARM_NAME[SM.armTier(c.smith)] : '';
    const heir = CY.heirName(c.heir), nc = c.cand.length;
    return `<div style="text-align:center"><b>引き継ぎ</b></div>
    <div class="muted" style="margin:4px 0 8px">遊ぶと自動でこの端末に記録され、新しい世界に入るとき（最初の1回だけ）持ち込まれます。身分・お金・城・畑・家畜・作業場・家宝以外の装備は、世界ごとにゼロから始まります。</div>
    <div class="card" style="display:block">鍛冶の腕：${arm}（経験 ${c.smith}）<br>農の腕：経験 ${c.farm}<br>生き物図鑑：${nCr}／${totCr}種　鉱石図鑑：${nOre}／${totOre}種<br>称号：${c.titles.length}／${(SIM.TITLES || []).length}個</div>
    <div class="muted" style="margin-top:8px"><b>家宝</b>（持ち込める武具は1つだけ。最後に遊んだ世界で持っていた物から選べます${nc ? `・${nc}個` : '・まだありません'}）</div>
    <div class="row" style="align-items:center;gap:6px;margin:3px 0"><button id="cy-heir-m" data-cy="heir" data-md="-1">◀</button><span style="min-width:12em;text-align:center">${heir}</span><button id="cy-heir-p" data-cy="heir" data-md="1">▶</button></div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px"><button id="cy-exp" data-cy="exp">書き出す（ファイル）</button><button id="cy-imp" data-cy="imp">読み込む（ファイル）</button><button id="cy-back" data-cy="back">戻る</button></div>`;
  };
})();
