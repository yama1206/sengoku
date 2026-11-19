// 2.35.0 農業の画面：自宅タブの「畑」カード（SGK.FARMUI.html）。命令は data-act="farm" data-kind=〇〇（main.js が SIM.commands.farm へ送る）
(function () {
  const SIM = SGK.SIM, UI = (SGK.FARMUI = {});
  const star = (n, max) => '★'.repeat(n) + '☆'.repeat(max - n);
  UI.html = (me) => {
    const F = me.farm; if (!F) return '';
    const hp = me.hpFrac == null ? 1 : me.hpFrac, tired = hp < 0.15;
    const ripe = F.fields.filter((f) => f.st === 'ripe').length, empty = F.fields.filter((f) => f.st === 'empty').length, can = F.fields.filter((f) => f.can).length;
    let h = '<div class="muted" style="margin-top:8px"><b>畑</b>　<span>' + F.m + '月</span></div>';
    h += `<div class="card" style="display:block"><b>${F.fields.length}／${F.max}枚</b>　道具：${F.tool}　水路：${F.suiro}<br>`
      + `<span class="muted">体力 ${Math.round(hp * 100)}%　村の発展 ${F.dev}${F.pop != null ? `　村の人口 ${F.pop}` : ''}　収穫した合計 ${F.made}${F.hv ? `　<b style="color:${F.hv === '豊作' ? '#9be08a' : '#e07a6a'}">この秋は${F.hv}</b>` : ''}</span></div>`;
    if (F.fields.length) {
      h += '<div class="card" style="display:block">' + F.fields.map((f, i) => {
        const t = f.st === 'empty' ? '<span class="muted">空き</span>' : f.st === 'ripe' ? `<b style="color:#ffe070">${f.c}・収穫できます</b>` : `${f.c}・あと${f.left}日　手入れ ${star(f.care, 4)}${f.can ? ' <span style="color:#9be08a">（手入れできます）</span>' : ''}`;
        return `<div style="font-size:13px;padding:2px 0">${i + 1}. ${t}${f.dmg ? ' <span style="color:#e07a6a">（台風で傷んだ）</span>' : ''}</div>`;
      }).join('') + '</div>';
    }
    h += `<div class="row" style="flex-wrap:wrap;gap:6px"><button id="fm-kai" data-act="farm" data-kind="kai" ${F.fields.length >= F.max || tired ? 'disabled' : ''}>開墾する（体力${F.kai}%）</button>`
      + `<button id="fm-tend" data-act="farm" data-kind="tend" ${can && !tired ? '' : 'disabled'}>手入れ（${can}枚）</button>`
      + `<button id="fm-reap" data-act="farm" data-kind="reap" ${ripe && !tired ? '' : 'disabled'}>収穫（${ripe}枚）</button></div>`;
    h += '<div class="muted" style="margin-top:6px">空いている畑に植える（種代は1枚ごと）</div><div class="row" style="flex-wrap:wrap;gap:6px">'
      + F.crops.map((c) => `<button id="fm-sow-${c.id}" data-act="farm" data-kind="sow" data-id="${c.id}" ${c.ok && empty && me.money >= c.seed ? '' : 'disabled'}>${c.name}（${SIM.money(c.seed)}・${c.months[0]}〜${c.months[c.months.length - 1]}月・${c.days}日）</button>`).join('') + '</div>';
    h += '<div class="row" style="flex-wrap:wrap;gap:6px;margin-top:6px">'
      + (F.nt ? `<button id="fm-tool" data-act="farm" data-kind="tool" ${me.money >= F.nt.cost ? '' : 'disabled'}>${F.nt.name}にする（${SIM.money(F.nt.cost)}）</button>` : '')
      + (F.ns ? `<button id="fm-suiro" data-act="farm" data-kind="suiro" ${me.money >= F.ns.cost ? '' : 'disabled'}>${F.ns.name}（${SIM.money(F.ns.cost)}・畑${F.ns.max}枚まで）</button>` : '') + '</div>';
    h += '<div class="muted">収穫は物置に入ります。収穫が増えるほど村がにぎわい、人口と米の産出が増えます</div>';
    return h;
  };
})();
