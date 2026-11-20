// 2.50.0 世界をまたぐ引き継ぎ。「人物そのもの」についてくるものだけを、この端末（ブラウザ）に記録して、新しい世界に入るとき持ち込む。
//  持ち込むもの：鍛冶の腕・農の腕（経験）／生き物図鑑・鉱石図鑑／称号／家宝（武具1つ）
//  持ち込まないもの：身分・所属・お金・城・畑・家畜・作業場・家宝以外の装備（世界ごとのもの）
//  遊んでいる間は SGK.CARRY.absorb(p) が自動で記録する（多いほうを残す）。新しい世界に最初に入るときだけ、ホストが SIM.applyCarry で人物に反映する
(function () {
  const SIM = SGK.SIM, EQ = SIM.EQUIP, D = SGK.DATA, C = (SGK.CARRY = {});
  const KEY = 'sgk_carry';
  const blank = () => ({ v: 1, smith: 0, farm: 0, zukan: {}, oreZ: {}, titles: [], title: null, heir: null, cand: [] });
  const num = (x, mx) => (Number.isFinite(+x) ? Math.max(0, Math.min(mx, Math.floor(+x))) : 0);
  const okGear = (id) => typeof id === 'string' && id.length < 40 && !!EQ.slotOf(id);
  const gearOf = (id) => { const sl = EQ.slotOf(id); return sl ? EQ[sl][id] : null; };

  // 形をそろえる（ホストが参加者から受け取ったものも、ファイルから読み込んだものも、必ずここを通す）
  C.clean = (c) => {
    const o = blank(); if (!c || typeof c !== 'object') return o;
    o.smith = num(c.smith, 100000); o.farm = num(c.farm, 100000);
    const cr = new Set((D.creatures || []).map((x) => x.id));
    if (c.zukan && typeof c.zukan === 'object') for (const id of Object.keys(c.zukan).slice(0, 1000)) {
      const a = c.zukan[id]; if (!cr.has(id) || !Array.isArray(a)) continue;
      const n = num(a[0], 99999); if (n > 0) o.zukan[id] = [n, Math.round(Math.min(99999, Math.max(0, +a[1] || 0)) * 10) / 10];
    }
    if (c.oreZ && typeof c.oreZ === 'object' && SGK.MINE) for (const id of Object.keys(c.oreZ).slice(0, 100)) {
      const a = c.oreZ[id]; if (!SGK.MINE.byId(id) || !Array.isArray(a)) continue;
      const z = [0, 1, 2, 3].map((i) => num(a[i], 99999)); if (z.some((v) => v > 0)) o.oreZ[id] = z;
    }
    const tl = (SIM.TITLES || []).map((t) => t.id);
    if (Array.isArray(c.titles)) o.titles = [...new Set(c.titles.filter((id) => typeof id === 'string' && tl.includes(id)))].slice(0, 200);
    o.title = typeof c.title === 'string' && o.titles.includes(c.title) ? c.title : null;
    if (Array.isArray(c.cand)) o.cand = [...new Set(c.cand.filter(okGear))].slice(0, 80);
    o.heir = okGear(c.heir) ? c.heir : null;
    return o;
  };
  C.load = () => { try { return C.clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { return blank(); } };
  C.save = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch (e) { return false; } };

  // 多いほうを残して重ね合わせる（a に b を足す）
  function merge(a, b) {
    a.smith = Math.max(a.smith, b.smith); a.farm = Math.max(a.farm, b.farm);
    for (const id in b.zukan) { const x = a.zukan[id] || [0, 0]; a.zukan[id] = [Math.max(x[0], b.zukan[id][0]), Math.max(x[1], b.zukan[id][1])]; }
    for (const id in b.oreZ) { const x = a.oreZ[id] || [0, 0, 0, 0]; a.oreZ[id] = x.map((v, i) => Math.max(v, b.oreZ[id][i])); }
    a.titles = [...new Set([...a.titles, ...b.titles])];
    if (!a.title && b.title) a.title = b.title;
    return a;
  }

  // 遊んでいる人物（p）から記録する
  C.absorb = (p) => {
    if (!p || typeof p !== 'object') return;
    const e = p.equip || {}, own = [e.wep, e.wep2, e.arm, e.horse, ...Object.keys(p.gear || {})].filter(okGear);
    const t = C.clean({ smith: p.smith && p.smith.exp, farm: p.farm && p.farm.exp, zukan: p.zukan, oreZ: p.oreZ, titles: p.titles, title: p.title });
    const c = merge(C.load(), t);
    if (own.length) c.cand = [...new Set(own)].slice(0, 80); // 家宝にできるのは、いちばん最近遊んだ世界で持っていた武具
    C.save(C.clean(c));
  };

  // 家宝を選ぶ（dir：+1／-1。いちばん手前は「なし」）
  C.setHeir = (dir) => {
    const c = C.load(), list = [null, ...c.cand], i = Math.max(0, list.indexOf(c.heir));
    c.heir = list[(i + dir + list.length) % list.length]; C.save(c); return c;
  };
  C.heirName = (id) => { const g = id && gearOf(id); return g ? g.name : 'なし'; };

  // 書き出し・読み込み（端末をかえるとき用）
  C.exportText = () => JSON.stringify(Object.assign({ app: 'tenka-ourai', kind: 'carry' }, C.load()));
  C.importText = (txt) => {
    let j; try { j = JSON.parse(txt); } catch (e) { return false; }
    if (!j || j.kind !== 'carry') return false;
    const n = C.clean(j), c = merge(C.load(), n); if (n.heir) c.heir = n.heir; if (n.cand.length) c.cand = [...new Set([...c.cand, ...n.cand])].slice(0, 80);
    return C.save(C.clean(c));
  };

  // 新しい世界に入る人（ホストが受け取る）。prof.carry を人物に反映する。家宝は最初の1回だけ
  SIM.applyCarry = (p, raw) => {
    const c = C.clean(raw);
    if (c.smith) { const S = (p.smith = p.smith || { lv: 0, exp: 0 }); S.exp = Math.max(S.exp || 0, c.smith); }
    if (c.farm) { const F = (p.farm = p.farm || { fields: [], tool: 0, suiro: 0, exp: 0, made: 0 }); F.exp = Math.max(F.exp || 0, c.farm); }
    if (Object.keys(c.zukan).length) { const z = (p.zukan = p.zukan || {}); for (const id in c.zukan) { const x = z[id] || [0, 0]; z[id] = [Math.max(x[0], c.zukan[id][0]), Math.max(x[1], c.zukan[id][1])]; } }
    if (Object.keys(c.oreZ).length) { const z = (p.oreZ = p.oreZ || {}); for (const id in c.oreZ) { const x = z[id] || [0, 0, 0, 0]; z[id] = x.map((v, i) => Math.max(v, c.oreZ[id][i])); } }
    if (c.titles.length) { p.titles = [...new Set([...(p.titles || []), ...c.titles])]; if (!p.title && c.title) p.title = c.title; }
    if (c.heir) { p.gear = p.gear || {}; p.gear[c.heir] = (p.gear[c.heir] || 0) + 1; SIM.say(p.id, `家宝「${C.heirName(c.heir)}」を持ち込みました（人物画面の装備タブから付けられます）`); }
  };
  const baseAP = SIM.applyProfile;
  SIM.applyProfile = (p, pr) => {
    if (baseAP) baseAP(p, pr);
    if (pr && typeof pr === 'object' && pr.carry) { try { SIM.applyCarry(p, pr.carry); } catch (e) { /* 引き継ぎに失敗しても、人物づくりは続ける */ } }
  };
})();
