// 2.12.5 服の色を選ぶ画面：本物の兵の3Dモデルを、選んだ色に染めて回して見せる（戦場と同じ染め方）。決めると 1貫
(function () {
  const U = (SGK.CLOTHUI = {}), T = window.THREE;
  let el = null, st = null;
  const models = {}; // 名前 → { geo（元の色）, mask }
  function load(name) {
    if (models[name]) return Promise.resolve(models[name]);
    const tier = typeof name === 'number';
    const file = tier ? SGK.SOLD3D.modelFile(name) : `${name}.glb`;
    return new Promise((res, rej) => new T.GLTFLoader().load(`assets/models/${file}`, (g) => {
      let m = null; g.scene.traverse((o) => { if (o.isSkinnedMesh && !m) m = o; }); if (!m) g.scene.traverse((o) => { if (o.isMesh && !m) m = o; });
      const geo = m.geometry.clone(), P = geo.attributes.position, C = geo.attributes.color, base = new Float32Array(P.count * 3);
      if (!tier && name !== 'soldier_t1_rig') for (let i = 0; i < P.count; i++) { const r = C.getX(i), gg = C.getY(i), b = C.getZ(i), lo = Math.min(r, gg, b), hi = Math.max(r, gg, b); if (P.getY(i) > 1.4 && lo > 0.3 && hi - lo < 0.25 * hi) C.setXYZ(i, 0.05, 0.05, 0.058); } // 陣笠・兜は黒漆（soldier3d.js と同じ）
      const parts = tier ? Int8Array.from({ length: P.count }, (_, i) => SGK.SOLD3D.partOf(C, i)) : null;
      const mask = tier ? Uint8Array.from(parts, (id) => id < 0 ? 1 : 0)
        : SGK.SOLD3D && SGK.SOLD3D.clothMask && m.skeleton
          ? SGK.SOLD3D.clothMask(geo, m.skeleton.bones.map((bn) => bn.name)) : new Float32Array(P.count).fill(1);
      geo.deleteAttribute('skinIndex'); geo.deleteAttribute('skinWeight');
      for (let i = 0; i < P.count; i++) { base[i * 3] = C.getX(i); base[i * 3 + 1] = C.getY(i); base[i * 3 + 2] = C.getZ(i); } // 色は4つ組・整数のこともあるので getX で読む
      res((models[name] = { geo, mask, base, parts }));
    }, undefined, rej));
  }
  function paint(md, hex, colors = []) { // 戦場の染め方：色 ×（0.45 ＋ 0.9 × 元の明るさ）
    const C = md.geo.attributes.color, b = md.base, t = hex ? new T.Color(hex) : null;
    const specified = colors.map((value) => value ? new T.Color(value) : null);
    for (let i = 0; i < md.mask.length; i++) {
      const r = b[i * 3], g = b[i * 3 + 1], bl = b[i * 3 + 2];
      const custom = md.parts && specified[Math.abs(md.parts[i]) - 1];
      const color = custom || (md.mask[i] ? t : null);
      if (color) { const k = 0.45 + 0.9 * (0.299 * r + 0.587 * g + 0.114 * bl); C.setXYZ(i, color.r * k, color.g * k, color.b * k); } else C.setXYZ(i, r, g, bl);
    }
    C.needsUpdate = true;
  }
  U.close = () => { if (!st) return; cancelAnimationFrame(st.raf); st.rd.dispose(); el.remove(); el = null; st = null; };
  U.open = (me) => {
    if (el) U.close();
    const CL = SGK.SIM.CLOTH, cur = (me && me.cloth) || {};
    const keys = ['me', 'tr', ...CL.partKeys];
    st = { sel: { ...cur }, cur, keys, who: 'tr', tier: 1, part: 1, money: me ? me.money : 0 };
    el = document.createElement('div'); el.id = 'clothUi';
    el.innerHTML = `<style>
#clothUi{position:fixed;inset:0;z-index:8700;background:rgba(10,8,6,.8);display:flex;align-items:center;justify-content:center;color:var(--ink,#efe6cc)}
#clothUi .box{background:var(--panel,rgba(24,20,15,.96));border:1px solid var(--line,#8a7448);border-radius:8px;padding:12px;width:min(640px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:auto;box-sizing:border-box}
#clothUi .h{color:var(--gold,#f2c14e);font-weight:bold;font-size:17px}
#clothUi canvas{width:100%;height:260px;display:block;background:radial-gradient(ellipse at 50% 70%,#4a3c2a,#1a140e);border-radius:6px;margin:8px 0;touch-action:none}
#clothUi button{margin:2px;padding:6px 10px;background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);border-radius:5px;font:inherit;cursor:pointer}
#clothUi #clParts{margin-top:6px}
#clothUi select{padding:4px 8px;background:#2a231a;color:inherit;border:1px solid var(--line,#8a7448);border-radius:5px;font:inherit}
#clothUi button.on{border-color:var(--gold,#f2c14e);background:#5a4626}
#clothUi .sw{display:inline-flex;align-items:center;gap:4px;font-size:12px}
#clothUi .sw i{display:inline-block;width:18px;height:18px;border-radius:4px;border:1px solid rgba(255,255,255,.4)}
#clothUi .m{color:#bdb294;font-size:12px}
</style><div class="box"><div class="h">服の色<button data-x="1" style="float:right">閉じる</button></div>
<div class="m">本人と兵の服、兵の装備や布地の色を選びます。下の人形で、戦場で見える色を確かめられます（ドラッグで回せます）。決めると ${SGK.SIM.money(CL.cost)} かかります</div>
<div style="margin-top:6px"><button data-who="tr">兵の服</button><button data-who="me">自分の服</button><button data-who="parts">兵の部位別</button></div>
<div id="clParts" hidden>
<select id="clTier" aria-label="兵の種類">${CL.models.map(({ name }, i) => `<option value="${i + 1}">${name}</option>`).join('')}</select>
<select id="clPart" aria-label="色を変える部位"></select>
</div>
<canvas id="clPrev"></canvas>
<div id="clPal"></div>
<div class="row" style="margin-top:6px;align-items:center;gap:6px;display:flex;flex-wrap:wrap"><span class="m">好きな色：</span><input type="color" id="clFree" style="width:46px;height:30px;border:0;background:none"><button data-def="1">元の色に戻す</button></div>
<div id="clInfo" class="m" style="margin-top:6px"></div>
<div style="margin-top:8px"><button data-x="1">やめる</button><button data-ok="1" id="clOk">この色にする（${SGK.SIM.money(CL.cost)}）</button></div></div>`;
    document.body.appendChild(el);
    el.querySelector('#clPal').innerHTML = CL.colors.map(([n, c]) => `<button data-c="${c}" class="sw"><i style="background:${c}"></i>${n}</button>`).join('');
    el.addEventListener('click', onClick);
    el.querySelector('#clFree').addEventListener('input', (e) => { st.sel[selectedKey()] = e.target.value; refresh(); });
    const partSelect = el.querySelector('#clPart');
    const showParts = () => {
      partSelect.innerHTML = CL.models[st.tier - 1].parts.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
      partSelect.value = st.part;
    };
    showParts();
    el.querySelector('#clTier').addEventListener('change', (e) => {
      st.tier = Number(e.target.value); st.part = 1; showParts(); loadPartPreview();
    });
    partSelect.addEventListener('change', (e) => { st.part = Number(e.target.value); refresh(); });
    // 3D の人形
    const cv = el.querySelector('#clPrev'), rd = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
    rd.setPixelRatio(Math.min(2, devicePixelRatio || 1)); rd.outputEncoding = T.sRGBEncoding;
    const sc = new T.Scene(), cam = new T.PerspectiveCamera(30, 2, 0.1, 50); cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 0.85, 0);
    sc.add(new T.HemisphereLight(0xfff2dd, 0x3a2c1c, 0.9)); const dl = new T.DirectionalLight(0xffffff, 1.0); dl.position.set(2, 3, 3); sc.add(dl);
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: T.DoubleSide });
    const grp = new T.Group(); sc.add(grp);
    st.rd = rd; st.sc = sc; st.cam = cam; st.grp = grp; st.mat = mat; st.rot = 0.4; st.meshes = {};
    let drag = null; cv.addEventListener('pointerdown', (e) => { drag = e.clientX; cv.setPointerCapture(e.pointerId); }); cv.addEventListener('pointermove', (e) => { if (drag == null) return; st.rot += (e.clientX - drag) * 0.01; drag = e.clientX; }); cv.addEventListener('pointerup', () => { drag = null; });
    const session = st;
    Promise.all([load(1), load('soldier_t3_rig')]).then(([a, b]) => {
      if (st !== session) return;
      const m1 = new T.Mesh(a.geo, mat), m3 = new T.Mesh(b.geo.clone(), mat); m1.position.x = -0.55; m3.position.x = 0.55;
      st.md = { tr: a, me: { geo: m3.geometry, mask: b.mask, base: b.base } }; st.normalMeshes = [m1, m3]; grp.add(m1, m3); refresh();
    }).catch(() => { el && (el.querySelector('#clInfo').textContent = '人形を読めませんでした（色は選べます）'); });
    const loop = () => { if (!st) return; st.raf = requestAnimationFrame(loop); const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * rd.getPixelRatio())) { rd.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } if (drag == null) st.rot += 0.006; grp.rotation.y = st.rot; rd.render(sc, cam); };
    loop(); refresh();
  };
  const selectedKey = () => st.who === 'parts' ? SGK.SIM.CLOTH.partKey(st.tier, st.part) : st.who;
  function loadPartPreview() {
    const session = st, tier = st.tier;
    refresh();
    if (st.meshes[tier]) return;
    load(tier).then((md) => {
      if (st !== session || st.meshes[tier]) return;
      const preview = { ...md, geo: md.geo.clone() };
      const mesh = new T.Mesh(preview.geo, st.mat);
      st.meshes[tier] = { mesh, preview };
      st.grp.add(mesh);
      refresh();
    }).catch(() => {
      if (st === session && st.who === 'parts' && st.tier === tier) el.querySelector('#clInfo').textContent = '人形を読めませんでした（色は選べます）';
    });
  }
  function onClick(e) {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.x) return U.close();
    if (d.who) {
      st.who = d.who;
      if (d.who === 'parts') return loadPartPreview();
    }
    if (d.c) st.sel[selectedKey()] = d.c;
    if (d.def) st.sel[selectedKey()] = null;
    if (d.ok) { const c = { type: 'setCloth' }; for (const k of st.keys) if ((st.sel[k] || null) !== (st.cur[k] || null)) c[k] = st.sel[k] || null; U.close(); SGK.cmd(c); return; }
    refresh();
  }
  const nameOf = (hex) => { if (!hex) return '元の色'; const f = SGK.SIM.CLOTH.colors.find(([, c]) => c.toLowerCase() === hex.toLowerCase()); return f ? f[0] : hex; };
  function refresh() {
    if (!el) return;
    const CL = SGK.SIM.CLOTH, partsMode = st.who === 'parts', color = st.sel[selectedKey()];
    el.querySelector('#clParts').hidden = !partsMode;
    el.querySelector('[data-def]').textContent = partsMode ? '部位色を解除' : '元の色に戻す';
    el.querySelectorAll('[data-who]').forEach((b) => b.classList.toggle('on', b.dataset.who === st.who));
    el.querySelectorAll('[data-c]').forEach((b) => b.classList.toggle('on', Boolean(color && b.dataset.c.toLowerCase() === color.toLowerCase())));
    el.querySelector('#clFree').value = color || '#808080';
    if (st.normalMeshes) for (const mesh of st.normalMeshes) mesh.visible = !partsMode;
    for (const [tier, { mesh }] of Object.entries(st.meshes)) mesh.visible = partsMode && Number(tier) === st.tier;
    const model = CL.models[st.tier - 1];
    if (partsMode && st.meshes[st.tier]) {
      paint(st.meshes[st.tier].preview, st.sel.tr, model.parts.map((_, i) => st.sel[CL.partKey(st.tier, i + 1)]));
    } else if (!partsMode && st.md) {
      paint(st.md.tr, st.sel.tr, CL.models[0].parts.map((_, i) => st.sel[CL.partKey(1, i + 1)]));
      paint(st.md.me, st.sel.me);
    }
    const changed = st.keys.some((k) => (st.sel[k] || null) !== (st.cur[k] || null)), cost = CL.cost;
    const label = partsMode ? `${model.name}・${model.parts[st.part - 1]}（${color ? nameOf(color) : '個別指定なし'}）`
      : `左：兵（${nameOf(st.sel.tr)}）　右：自分（${nameOf(st.sel.me)}）`;
    el.querySelector('#clInfo').innerHTML = `${label}　${changed ? '' : '<b>いまと同じ色です</b>'}${st.money < cost ? '<br><b style="color:#ff8a6a">お金が足りません</b>' : ''}`;
    el.querySelector('#clOk').disabled = !changed || st.money < cost;
  }
})();
