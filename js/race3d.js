// The same race distances and lateral positions drive the 3D scene and its HUD.
(function () {
  const SGK = window.SGK;
  let models;
  function assets(T) {
    if (!T.GLTFLoader) return null;
    if (!models) {
      const loader = new T.GLTFLoader(), base = 'assets/models/';
      const get = (path) => loader.loadAsync(base + path);
      models = Promise.all([
        get('equip/horse_brown.glb'), get('equip/horse_white.glb'),
        get('soldier_t2_rig.glb'), get('soldier_anims.glb'),
      ]).catch((error) => { models = null; throw error; });
    }
    return models;
  }

  function cloneRig(T, source) {
    const copy = source.clone(true), originals = [], clones = [], mapped = new Map();
    source.traverse((node) => originals.push(node));
    copy.traverse((node) => clones.push(node));
    originals.forEach((node, i) => mapped.set(node, clones[i]));
    for (const node of originals) {
      if (!node.isSkinnedMesh) continue;
      const skin = new T.Skeleton(node.skeleton.bones.map((bone) => mapped.get(bone)), node.skeleton.boneInverses);
      mapped.get(node).bind(skin, node.bindMatrix);
    }
    return copy;
  }

  function make(cv, lap, course, racers) {
    const T = window.THREE;
    if (!T || !cv?.parentElement) return null;
    let renderer;
    try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true }); }
    catch (error) { return null; }
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = 'race-world';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    const backdrop = document.createElement('div');
    backdrop.className = 'race-scenery';
    cv.parentElement.prepend(backdrop, renderer.domElement);
    const scene = new T.Scene(), camera = new T.PerspectiveCamera(53, 1, 0.2, 270);
    scene.fog = new T.Fog('#a4a789', 60, 180);
    scene.add(new T.HemisphereLight('#fff3df', '#73614a', 0.9));
    const sun = new T.DirectionalLight('#ffe0a7', 0.86);
    sun.position.set(-40, 55, 30);
    scene.add(sun);

    const path = new T.CatmullRomCurve3([
      [-42, 63], [15, 68], [66, 40], [75, -8], [50, -48],
      [11, -61], [-43, -50], [-72, -20], [-65, 27],
    ].map(([x, z]) => new T.Vector3(x, 0, z)), true, 'centripetal');
    path.arcLengthDivisions = 960;
    const wrap = (d) => ((d % lap) + lap) % lap / lap;
    const forward = (d) => path.getTangentAt(wrap(d));
    function point(d, x = 0, y = 0) {
      const at = path.getPointAt(wrap(d)), f = forward(d);
      return at.set(at.x - f.z * x * 5.5, y, at.z + f.x * x * 5.5);
    }
    let seed = 3751;
    const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const owned = new Set();
    const resource = (value) => { owned.add(value); return value; };
    const mat = (color, options) => resource(new T.MeshStandardMaterial({ color, roughness: 0.95, ...options }));
    const box = resource(new T.BoxGeometry(1, 1, 1));
    const ball = resource(new T.IcosahedronGeometry(1, 1));
    const cone = resource(new T.ConeGeometry(1, 1, 7));
    const tube = resource(new T.CylinderGeometry(0.78, 1, 1, 7));
    const disc = resource(new T.CircleGeometry(1, 18));
    const wood = mat('#614732'), dark = mat('#332a26'), gold = mat('#f2b742', { emissive: '#80521a', emissiveIntensity: 0.25 });
    const mud = mat('#584131'), cloth = mat('#ac3e2c', { side: T.DoubleSide });
    const board = mat('#d39760'), ink = mat('#e2c78c');
    const grass = mat('#929454', { transparent: true, depthWrite: false }), road = mat('#bd885e');
    function texture(base, contrast, size) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < size * 14; i++) {
        ctx.globalAlpha = random() * contrast;
        ctx.fillStyle = random() < 0.5 ? '#ffe5a0' : '#302518';
        ctx.fillRect(random() * size, random() * size, 1 + random() * 4, 1 + random() * 3);
      }
      const map = resource(new T.CanvasTexture(canvas));
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.encoding = T.sRGBEncoding;
      map.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      return map;
    }
    grass.map = texture('#a9ac72', 0.25, 128);
    grass.map.repeat.set(58, 58);
    grass.color.set('#c9c393');
    grass.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
        'diffuseColor.a *= 1.0 - smoothstep(69.0, 152.0, length(vViewPosition));\n#include <alphatest_fragment>');
    };
    road.map = texture('#cb986d', 0.19, 128);
    road.color.set('#ebd3ad');
    function mesh(geometry, material, parent, x, y, z, sx, sy, sz) {
      const object = new T.Mesh(geometry, material);
      object.position.set(x, y, z);
      object.scale.set(sx, sy, sz);
      parent.add(object);
      return object;
    }
    const ground = mesh(resource(new T.PlaneGeometry(580, 580)), grass, scene, 0, -0.08, 0, 1, 1, 1);
    ground.rotation.x = -Math.PI / 2;
    function ribbon(left, right, material, y) {
      const pos = [], uv = [], indices = [], steps = 480;
      for (let i = 0; i <= steps; i++) {
        const distance = lap * i / steps;
        for (const lateral of [left, right]) {
          const p = point(distance, lateral, y);
          pos.push(p.x, p.y, p.z);
          uv.push(lateral * 1.35, distance / 5);
        }
        if (i) {
          const n = 2 * i;
          indices.push(n - 2, n, n - 1, n - 1, n, n + 1);
        }
      }
      const geo = resource(new T.BufferGeometry());
      geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const surface = geo.attributes.normal.getY(0);
      if (surface < 0) {
        for (let i = 0; i < indices.length; i += 3) [indices[i], indices[i + 1]] = [indices[i + 1], indices[i]];
        geo.setIndex(indices);
        geo.computeVertexNormals();
      }
      scene.add(new T.Mesh(geo, material));
    }
    const shoulder = mat('#957341', { map: road.map });
    ribbon(-1.16, 1.16, shoulder, -0.032);
    ribbon(-1, 1, road, 0);
    ribbon(-1.035, -1.004, ink, 0.015);
    ribbon(1.004, 1.035, ink, 0.015);

    function place(group, d, x, y = 0) {
      group.position.copy(point(d, x, y));
      const dir = forward(d);
      group.rotation.y = Math.atan2(dir.x, dir.z);
    }
    function scenery() {
      const trees = [], stones = [];
      for (let d = 7; d < lap; d += 4 + random() * 2.8) {
        for (const side of [-1, 1]) {
          if (d > 452 && side === 1) continue;
          const lateral = side * (1.55 + random() * 2.7);
          const p = point(d, lateral), size = 0.8 + random() * 1.55;
          trees.push([p, size, random() < 0.62]);
          if (random() > 0.6) stones.push([point(d + 2.4, side * 1.45), 0.6 + random()]);
        }
      }
      const matrices = new T.Object3D(), terrain = mat('#ffffff');
      function batch(geometry, count, makeInstance) {
        const objects = new T.InstancedMesh(geometry, terrain, count);
        for (let i = 0; i < count; i++) {
          const color = makeInstance(matrices, i);
          matrices.updateMatrix();
          objects.setMatrixAt(i, matrices.matrix);
          objects.setColorAt(i, new T.Color(color));
        }
        scene.add(objects);
        owned.add(objects);
      }
      batch(tube, trees.length, (m, i) => {
        const [p, s] = trees[i];
        m.position.set(p.x, s * 0.66, p.z);
        m.scale.set(s * 0.13, s * 1.35, s * 0.13);
        return '#624d35';
      });
      const conifers = trees.filter((tree) => tree[2]);
      const maples = trees.filter((tree) => !tree[2]);
      batch(cone, conifers.length * 3, (m, i) => {
        const [p, s] = conifers[Math.floor(i / 3)], part = i % 3;
        m.position.set(p.x, s * (1.55 + 0.48 * part), p.z);
        m.scale.set(s * (0.96 - part * 0.19), s * 1.3, s * (0.96 - part * 0.19));
        return ['#3c5435', '#516b3d', '#667548'][part];
      });
      batch(ball, maples.length * 3, (m, i) => {
        const [p, s] = maples[Math.floor(i / 3)], part = i % 3;
        m.position.set(p.x + (part - 1) * s * 0.47, (2.05 - part * 0.11) * s, p.z + Math.sin(i) * s * 0.32);
        m.scale.set(s * 0.68, s * (0.64 - part * 0.075), s * 0.65);
        return ['#a35d34', '#ae743e', '#c18d47'][part];
      });
      batch(ball, stones.length, (m, i) => {
        const [p, s] = stones[i];
        m.position.set(p.x, s * 0.08, p.z);
        m.scale.set(s * 0.72, s * 0.34, s * 0.55);
        return '#8b8371';
      });
    }
    scenery();

    const marks = new T.Group();
    place(marks, 0, 0);
    scene.add(marks);
    const pale = mat('#f6e5b2');
    for (let row = 0; row < 2; row++) for (let col = 0; col < 12; col++) {
      mesh(box, (row + col) % 2 ? pale : dark, marks, (col - 5.5) * 11 / 12, 0.023,
        (row - 0.5) * 0.7, 11 / 12, 0.025, 0.7);
    }
    for (const x of [-5.95, 5.95]) {
      mesh(box, wood, marks, x, 2.3, 0, 0.36, 4.6, 0.42);
      mesh(box, cloth, marks, x * 0.88, 3.26, 0, 0.78, 1.8, 0.06);
      mesh(box, ink, marks, x * 0.88, 3.18, 0.041, 0.12, 1.1, 0.02);
    }
    mesh(box, wood, marks, 0, 4.45, 0, 12.9, 0.25, 0.52);
    mesh(box, dark, marks, 0, 4.78, 0, 13.5, 0.24, 0.75);
    for (const d of [96, 218, 335, 464]) {
      for (const x of [-1.32, 1.32]) {
        const banner = new T.Group();
        place(banner, d, x);
        scene.add(banner);
        mesh(tube, wood, banner, 0, 1.54, 0, 0.045, 3.1, 0.045);
        mesh(box, cloth, banner, 0.3, 2.22, 0, 0.63, 1.42, 0.032);
        mesh(box, pale, banner, 0.3, 2.35, 0.02, 0.28, 0.06, 0.02);
      }
    }

    const itemFaces = resource(new T.CanvasTexture((() => {
      const icon = document.createElement('canvas');
      icon.width = icon.height = 96;
      const c = icon.getContext('2d');
      c.fillStyle = '#3b7768';
      c.fillRect(0, 0, 96, 96);
      c.strokeStyle = '#f3cb81';
      c.lineWidth = 6;
      c.strokeRect(5, 5, 86, 86);
      c.fillStyle = '#fff1c7';
      c.font = 'bold 48px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('道', 48, 51);
      return icon;
    })()));
    itemFaces.encoding = T.sRGBEncoding;
    const item = mat('#ffffff', { map: itemFaces, emissive: '#28564c', emissiveIntensity: 0.22 });
    const itemBoxes = [];
    for (const [d, kind, lanes] of course) for (const x of lanes) {
      const group = new T.Group();
      place(group, d, x);
      scene.add(group);
      if (kind === 'box') {
        const crate = mesh(box, item, group, 0, 0.95, 0, 0.92, 0.92, 0.92);
        itemBoxes.push([crate, d]);
      } else if (kind === 'fence') {
        for (const side of [-1, 1]) mesh(box, wood, group, side * 1.45, 0.46, 0, 0.14, 0.92, 0.15);
        for (const y of [0.37, 0.73]) mesh(box, board, group, 0, y, 0, 3, 0.13, 0.11);
      } else if (kind === 'pad') {
        mesh(box, gold, group, 0, 0.035, 1.05, 2.75, 0.06, 2.05);
        for (const z of [0.55, 1.2, 1.85]) {
          for (const side of [-1, 1]) {
            const stripe = mesh(box, pale, group, side * 0.35, 0.075, z, 0.86, 0.025, 0.17);
            stripe.rotation.y = side * 0.51;
          }
        }
      } else if (kind === 'mud') {
        mesh(disc, mud, group, 0, 0.026, 0, 1.56, 2.4, 1).rotation.x = -Math.PI / 2;
      }
    }

    const traps = [];
    const colors = ['#915734', '#c6c1a9', '#4b3732'];
    const coats = colors.map((color) => mat(color));
    const tackColors = ['#70503b', '#c09b68', '#53312b'].map((color) => mat(color));
    const shadow = resource(new T.MeshBasicMaterial({ color: '#3c3423', transparent: true, opacity: 0.27, depthWrite: false }));
    const shield = resource(new T.MeshBasicMaterial({ color: '#abeace', transparent: true, opacity: 0.22, wireframe: true }));
    const models3d = racers.map((r) => {
      const root = new T.Group(), body = new T.Group(), fallback = new T.Group();
      root.add(body);
      body.add(fallback);
      scene.add(root);
      const tail = mesh(ball, dark, fallback, 0, 0.86, -0.92, 0.11, 0.55, 0.15);
      tail.rotation.x = 0.5;
      const skin = [
        mesh(ball, coats[0], fallback, 0, 1.03, 0, 0.46, 0.43, 0.97),
        mesh(ball, coats[0], fallback, 0, 1.43, 0.63, 0.23, 0.57, 0.28),
        mesh(ball, coats[0], fallback, 0, 1.82, 0.88, 0.19, 0.23, 0.35),
      ];
      const legs = [];
      for (const x of [-0.28, 0.28]) for (const z of [-0.61, 0.6]) {
        const limb = new T.Group();
        limb.position.set(x, 0.86, z);
        fallback.add(limb);
        skin.push(mesh(tube, coats[0], limb, 0, -0.33, 0, 0.11, 0.74, 0.12));
        mesh(box, dark, limb, 0, -0.73, 0.05, 0.2, 0.18, 0.23);
        legs.push(limb);
      }
      const rider = new T.Group();
      body.add(rider);
      rider.position.y = 1.29;
      const color = mat(r.color);
      mesh(ball, color, rider, 0, 0.4, 0.03, 0.34, 0.43, 0.22);
      mesh(ball, wood, rider, 0, 0.8, 0.04, 0.15, 0.18, 0.15);
      mesh(cone, dark, rider, 0, 0.97, 0.04, 0.34, 0.20, 0.34);
      const saddle = mesh(box, tackColors[0], body, 0, 1.25, -0.13, 0.72, 0.125, 0.46);
      const stirrups = [], reins = [];
      for (const x of [-0.36, 0.36]) {
        const stirrup = mesh(box, tackColors[0], body, x, 0.84, 0.08, 0.09, 0.17, 0.18);
        stirrups.push(stirrup);
        const rein = mesh(box, tackColors[0], body, x * 0.59, 1.53, 0.5, 0.03, 0.04, 0.79);
        rein.rotation.x = -0.32;
        reins.push(rein);
      }
      const bridle = mesh(box, tackColors[0], body, 0, 1.74, 1.01, 0.27, 0.037, 0.07);
      mesh(box, color, body, 0, 1.82, -0.32, 0.35, 0.28, 0.06);
      mesh(disc, shadow, root, 0, 0.03, 0, 0.66, 1.35, 1).rotation.x = -Math.PI / 2;
      const aura = mesh(ball, shield, body, 0, 1.3, 0, 0.91, 1.45, 1.36);
      return { root, body, fallback, rider, skin, legs, saddle, stirrups, reins, bridle, aura, horse: null, coat: -1, phase: 0 };
    });
    let dead = false, unavailable = false, loaded = null, previous = performance.now();
    const contextLost = (event) => { event.preventDefault(); unavailable = true; };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    assets(T)?.then((value) => { if (!dead) loaded = value; }).catch((error) => console.warn('競走の馬モデルを読み込めませんでした', error));

    function installHorse(visual, coat) {
      if (visual.horse) {
        visual.body.remove(visual.horse.object);
        visual.horse.mixer.uncacheRoot(visual.horse.object);
        visual.horse.skeletons.forEach((skeleton) => skeleton.dispose());
        if (visual.horse.tint) visual.horse.tint.dispose();
      }
      const model = loaded[coat === 1 ? 1 : 0], object = cloneRig(T, model.scene);
      const skeletons = new Set();
      let tint;
      object.traverse((child) => {
        if (child.isSkinnedMesh) skeletons.add(child.skeleton);
        if (coat === 2 && child.isMesh && !Array.isArray(child.material)) {
          tint ??= child.material.clone();
          tint.color.multiply(new T.Color('#b8b0c1'));
          child.material = tint;
        }
      });
      const mixer = new T.AnimationMixer(object);
      const animations = Object.fromEntries(['Idle', 'Gallop', 'Gallop_Jump'].map((name) =>
        [name, mixer.clipAction(model.animations.find((clip) => clip.name.endsWith('|' + name)))]));
      const back = object.getObjectByName('Back');
      animations.Idle.play();
      mixer.update(0);
      const backPosition = new T.Vector3();
      back?.getWorldPosition(backPosition);
      object.scale.setScalar(backPosition.y > 0.1 ? 1.38 / backPosition.y : 0.5);
      visual.body.add(object);
      visual.fallback.visible = false;
      visual.horse = { object, mixer, animations, active: 'Idle', back, head: object.getObjectByName('Head'), skeletons, tint };
      if (!visual.riderModel) {
        const mounted = cloneRig(T, loaded[2].scene);
        const seat = new T.AnimationMixer(mounted);
        seat.clipAction(loaded[3].animations.find((clip) => clip.name === 'ride')).play();
        seat.update(0.02);
        mounted.scale.setScalar(0.91);
        visual.rider.add(mounted);
        visual.rider.children.forEach((child) => { child.visible = child === mounted; });
        visual.riderModel = mounted;
      }
    }
    const v3 = new T.Vector3(), head = new T.Vector3(), seat = new T.Vector3();
    const reinVector = new T.Vector3(), reinEnd = new T.Vector3(), reinAxis = new T.Vector3(0, 0, 1);
    let width = 0, height = 0;
    function draw(view, me, activeTraps, time, text) {
      if (dead || unavailable) return false;
      const w = cv.width, h = cv.height;
      if (!w || !h) return false;
      if (w !== width || h !== height) {
        width = w;
        height = h;
        renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = w / h < 0.85 ? 61 : 53;
        camera.updateProjectionMatrix();
      }
      const now = performance.now(), dt = Math.min(0.06, (now - previous) / 1000);
      previous = now;
      const own = view[me], distance = own.d, f = forward(distance);
      const cameraPull = w / h < 0.85 ? 7.9 : 7.6;
      camera.position.copy(point(distance - cameraPull, own.x * 0.76, 3.5 + own.y * 0.15));
      camera.lookAt(point(distance + 11, own.x * 0.20, 0.9));
      backdrop.style.backgroundPosition = (50 + f.x * 12).toFixed(1) + '% top';
      const labels = [];
      models3d.forEach((visual, index) => {
        const r = racers[index], v = view[index];
        visual.root.visible = !r.out;
        if (r.out) return;
        place(visual.root, v.d, v.x);
        const coat = r.loadout[0];
        if (loaded && (!visual.horse || visual.coat !== coat)) installHorse(visual, coat);
        if (!visual.horse && visual.coat !== coat) visual.skin.forEach((part) => { part.material = coats[coat]; });
        visual.coat = coat;
        const [, saddle, stirrups, reins, bridle] = r.loadout;
        visual.saddle.material = tackColors[saddle];
        visual.saddle.scale.y = [0.125, 0.10, 0.17][saddle];
        visual.stirrups.forEach((part) => { part.material = tackColors[stirrups]; });
        visual.reins.forEach((part) => { part.material = tackColors[reins]; });
        visual.bridle.material = tackColors[bridle];
        visual.aura.visible = r.shield > 0;
        visual.phase += dt * (r.v > 0.4 ? 7 + r.v * 0.35 : 1);
        visual.body.position.y = v.y;
        seat.set(0, 1.25, -0.13);
        head.set(0, 1.75, 1.04);
        if (visual.horse) {
          const horse = visual.horse, action = v.y > 0.12 ? 'Gallop_Jump' : r.v > 1 ? 'Gallop' : 'Idle';
          if (action !== horse.active) {
            horse.animations[horse.active].fadeOut(0.12);
            horse.animations[action].reset().fadeIn(0.12).play();
            horse.active = action;
          }
          horse.animations[action].timeScale = action === 'Gallop' ? 0.72 + r.v / 55 : 1;
          horse.mixer.update(dt);
          if (horse.back) {
            horse.back.getWorldPosition(v3);
            visual.body.worldToLocal(v3);
            visual.rider.position.set(0, v3.y - 0.42, v3.z + 0.02);
            seat.copy(v3);
            seat.y += 0.045;
          }
          if (horse.head) {
            horse.head.getWorldPosition(v3);
            head.copy(visual.body.worldToLocal(v3));
            head.y -= 0.065;
            head.z += 0.17;
          }
        } else {
          const stride = r.v > 1 ? Math.sin(visual.phase) : 0;
          visual.legs.forEach((limb, i) => { limb.rotation.x = (i === 0 || i === 3 ? stride : -stride) * 0.45; });
          visual.rider.position.y = 1.29 + Math.abs(stride) * 0.11;
        }
        visual.saddle.position.copy(seat);
        visual.bridle.position.copy(head);
        visual.stirrups.forEach((part, i) => {
          part.position.set(i ? 0.365 : -0.365, seat.y - [0.43, 0.36, 0.49][stirrups], seat.z + 0.08);
        });
        visual.reins.forEach((part, i) => {
          const side = i ? 1 : -1;
          part.position.set(side * 0.23, seat.y + 0.34, seat.z + 0.33);
          reinEnd.copy(head);
          reinEnd.x += side * 0.14;
          reinVector.subVectors(reinEnd, part.position);
          part.scale.z = reinVector.length();
          part.position.lerp(reinEnd, 0.5);
          part.quaternion.setFromUnitVectors(reinAxis, reinVector.normalize());
        });
        const ahead = point(v.d, v.x, v.y + 2.62);
        if (ahead.distanceToSquared(camera.position) < 44 * 44 &&
          (index === me || (v.d - distance + lap) % lap < lap - 2)) labels.push([ahead, r, index === me]);
      });
      for (let i = 0; i < activeTraps.length; i++) {
        const [d, x] = activeTraps[i];
        if (!traps[i]) {
          traps[i] = mesh(disc, mud, scene, 0, 0, 0, 1.55, 1.5, 1);
          traps[i].rotation.x = -Math.PI / 2;
        }
        traps[i].position.copy(point(d, x, 0.035));
      }
      traps.forEach((trap, i) => { trap.visible = i < activeTraps.length; });
      itemBoxes.forEach(([crate, d]) => {
        crate.rotation.y = time * 0.82 + d;
        crate.position.y = 0.98 + 0.15 * Math.sin(time * 3 + d);
      });
      renderer.render(scene, camera);
      cv.getContext('2d').clearRect(0, 0, w, h);
      for (const [label, r, ownHorse] of labels) {
        label.project(camera);
        if (label.z < -1 || label.z > 1 || Math.abs(label.x) > 1 || Math.abs(label.y) > 1) continue;
        text(ownHorse ? '自分' : r.name.slice(0, 14), (label.x + 1) * w / 2, (1 - label.y) * h / 2,
          { sz: ownHorse ? 14 : 12, al: 'center', c: r.color });
      }
      return true;
    }

    function dispose() {
      dead = true;
      for (const visual of models3d) {
        visual.horse?.mixer.stopAllAction();
        visual.horse?.skeletons.forEach((skeleton) => skeleton.dispose());
        visual.riderModel?.traverse((node) => { if (node.isSkinnedMesh) node.skeleton.dispose(); });
        visual.horse?.tint?.dispose();
      }
      owned.forEach((object) => object.dispose());
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      backdrop.remove();
    }
    return { draw, dispose };
  }
  SGK.RACE3D = { make };
})();
