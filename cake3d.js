(function () {
  'use strict';

  /* ================= 3D 生日蛋糕 ================= */
  const canvas = document.getElementById('cakeCanvas');

  let renderer, scene, camera, root, flameGroup, flameMesh, flameGlow, flameLight;
  let smokePoints, smokeGeo, smokeVel = [], smokeLife = [];
  let candleLight, ballCollider, candleCollider;
  let clock;
  let built = false, armed = false, blown = false, blowT0 = 0, flameScale = 1;

  // 轨道控制（手动 360° 旋转）
  const orbit = { theta: 0.42, phi: 1.30, radius: 6.4, dragging: false, lx: 0, ly: 0, moved: 0, downT: 0, vel: 0 };

  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,225,1)');
    gr.addColorStop(0.22, 'rgba(255,205,120,.85)');
    gr.addColorStop(0.55, 'rgba(255,140,50,.28)');
    gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function smokeTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(230,226,240,.85)');
    gr.addColorStop(0.5, 'rgba(200,196,215,.35)');
    gr.addColorStop(1, 'rgba(180,176,195,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function init() {
    if (built) return;
    built = true;
    clock = new THREE.Clock();

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0814, 10, 26);

    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);

    /* ---- 环境贴图（让金属/陶瓷有反射） ---- */
    (function () {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, 64);
      grd.addColorStop(0, '#6b5b96');
      grd.addColorStop(0.35, '#ffd9b8');
      grd.addColorStop(0.5, '#ffc79a');
      grd.addColorStop(0.72, '#7a5a7e');
      grd.addColorStop(1, '#150e1c');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(renderer);
      pm.compileEquirectangularShader();
      scene.environment = pm.fromEquirectangular(tex).texture;
      tex.dispose(); pm.dispose();
    })();

    /* ---- 灯光 ---- */
    const hemi = new THREE.HemisphereLight(0xfff2dd, 0x2b1c3c, 1.0);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd9ac, 2.6);
    key.position.set(3.2, 6.2, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3.4;
    key.shadow.camera.bottom = -2;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x9db4ff, 0.85);
    fill.position.set(-4.5, 2.6, 2.2);
    scene.add(fill);

    const front = new THREE.DirectionalLight(0xfff4e6, 0.55);
    front.position.set(0.4, 1.6, 6);
    scene.add(front);

    const rim = new THREE.DirectionalLight(0xff9ec8, 0.9);
    rim.position.set(-1.2, 2.2, -5);
    scene.add(rim);

    /* ---- 地面（接收阴影） ---- */
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x140e1f, roughness: 0.86, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.001;
    floor.receiveShadow = true;
    scene.add(floor);

    root = new THREE.Group();
    scene.add(root);

    /* ---- 材质 ---- */
    const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xfffaf2, roughness: 0.22, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 0.7 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe6bd78, roughness: 0.3, metalness: 1.0, envMapIntensity: 0.9 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xfff3e2, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.45 });
    const blush = new THREE.MeshStandardMaterial({ color: 0xf7c8cc, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.45 });
    const pearl = new THREE.MeshPhysicalMaterial({ color: 0xfffdf8, roughness: 0.18, metalness: 0.0, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.8 });
    const berry = new THREE.MeshStandardMaterial({ color: 0xc71f3f, roughness: 0.34, metalness: 0.0 });

    /* ---- 蛋糕架 ---- */
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 0.15, 64), gold);
    foot.position.y = 0.075;
    foot.castShadow = true; foot.receiveShadow = true;
    root.add(foot);

    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.02, 0.055, 96), ceramic);
    plat.position.y = 0.175;
    plat.castShadow = true; plat.receiveShadow = true;
    root.add(plat);

    const platRim = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.018, 10, 96), gold);
    platRim.rotation.x = Math.PI / 2;
    platRim.position.y = 0.2;
    root.add(platRim);

    /* ---- 三层蛋糕 ---- */
    const BASE = 0.203;
    const tiers = [
      { r: 0.95, h: 0.58, mat: cream },
      { r: 0.72, h: 0.48, mat: blush },
      { r: 0.50, h: 0.42, mat: cream }
    ];
    let y = BASE;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const geo = new THREE.CylinderGeometry(t.r, t.r * 1.012, t.h, 96, 1, false);
      const m = new THREE.Mesh(geo, t.mat);
      m.position.y = y + t.h / 2;
      m.castShadow = true; m.receiveShadow = true;
      root.add(m);

      // 顶部一圈珍珠裱花
      const n = 26 - i * 4;
      const pr = 0.048 - i * 0.006;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.SphereGeometry(pr, 18, 14), pearl);
        p.position.set(Math.cos(a) * (t.r - pr * 0.55), y + t.h - pr * 0.35, Math.sin(a) * (t.r - pr * 0.55));
        p.scale.set(1, 0.85, 1);
        p.castShadow = true;
        root.add(p);
      }

      // 底部金边
      const band = new THREE.Mesh(new THREE.TorusGeometry(t.r * 1.008, 0.012, 8, 96), gold);
      band.rotation.x = Math.PI / 2;
      band.position.y = y + 0.012;
      root.add(band);

      y += t.h;
    }
    const TOP = y;
    /* ---- 顶部草莓（带籽纹理） ---- */
    const strawTex = (function () {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(128, 118, 10, 128, 128, 190);
      grd.addColorStop(0, '#ff5b6b');
      grd.addColorStop(0.5, '#df1f3e');
      grd.addColorStop(1, '#980d24');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      for (let row = 0; row < 12; row++) {
        for (let col = 0; col < 13; col++) {
          const x = (col + (row % 2 ? 0.5 : 0)) * (256 / 12.5) + 8;
          const y = row * (256 / 12) + 16;
          g.fillStyle = '#ffe9b2';
          g.beginPath(); g.ellipse(x, y, 2.3, 3.3, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(105,12,24,.32)';
          g.beginPath(); g.ellipse(x, y + 2.1, 2.1, 1.2, 0, 0, Math.PI * 2); g.fill();
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    })();
    const strawMat = new THREE.MeshPhysicalMaterial({
      map: strawTex, bumpMap: strawTex, bumpScale: 0.0035,
      roughness: 0.33, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.45, envMapIntensity: 0.7
    });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7d4a, roughness: 0.62 });
    const strawPts = [
      new THREE.Vector2(0.0009, 0),
      new THREE.Vector2(0.014, 0.006),
      new THREE.Vector2(0.028, 0.020),
      new THREE.Vector2(0.040, 0.045),
      new THREE.Vector2(0.0455, 0.072),
      new THREE.Vector2(0.038, 0.094),
      new THREE.Vector2(0.021, 0.108),
      new THREE.Vector2(0.0009, 0.113)
    ];
    const strawGeo = new THREE.LatheGeometry(strawPts, 28);

    const BEAR_ANGLE = 0.45;
    const PIG_ANGLE = 1.30;
    function nearProp(a) {
      const list = [BEAR_ANGLE, PIG_ANGLE];
      for (let i = 0; i < list.length; i++) {
        let d = Math.abs(a - list[i]) % (Math.PI * 2);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d < 0.5) return true;
      }
      return false;
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + 0.25;
      if (nearProp(a)) continue;
      const sg = new THREE.Group();
      const body = new THREE.Mesh(strawGeo, strawMat);
      body.castShadow = true; body.receiveShadow = true;
      sg.add(body);
      for (let s = 0; s < 6; s++) {
        const la = (s / 6) * Math.PI * 2 + 0.3;
        const lf = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.045, 6), leafMat);
        lf.position.set(Math.cos(la) * 0.026, 0.104, Math.sin(la) * 0.026);
        lf.rotation.set(Math.sin(la) * 0.8, 0, -Math.cos(la) * 0.8);
        lf.castShadow = true;
        sg.add(lf);
      }
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.032, 6), leafMat);
      stem.position.y = 0.126;
      stem.castShadow = true;
      sg.add(stem);
      sg.position.set(Math.cos(a) * 0.355, TOP, Math.sin(a) * 0.355);
      sg.rotation.y = -a + (Math.random() - 0.5) * 0.7;
      sg.rotation.z = (Math.random() - 0.5) * 0.14;
      sg.scale.setScalar(1.02 + Math.random() * 0.12);
      root.add(sg);
    }

    const sph = new THREE.SphereGeometry(1, 20, 16);

    /* ---- 小熊 ---- */
    const bearMat = new THREE.MeshStandardMaterial({ color: 0xb9825a, roughness: 0.76, metalness: 0.0 });
    const bearLight = new THREE.MeshStandardMaterial({ color: 0xf0d9bd, roughness: 0.82 });
    const bearDark = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.5 });
    const bear = new THREE.Group();
    function bp(mat, x, y, z, sx, sy, sz) {
      const m = new THREE.Mesh(sph, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      bear.add(m);
    }
    bp(bearMat, 0, 0.075, 0, 0.078, 0.082, 0.072);
    bp(bearMat, 0, 0.176, 0, 0.060, 0.058, 0.058);
    bp(bearMat, -0.046, 0.218, -0.004, 0.024, 0.024, 0.020);
    bp(bearMat, 0.046, 0.218, -0.004, 0.024, 0.024, 0.020);
    bp(bearLight, 0, 0.163, 0.049, 0.030, 0.026, 0.026);
    bp(bearDark, 0, 0.169, 0.070, 0.011, 0.009, 0.009);
    bp(bearDark, -0.024, 0.192, 0.054, 0.010, 0.010, 0.010);
    bp(bearDark, 0.024, 0.192, 0.054, 0.010, 0.010, 0.010);
    bp(bearMat, -0.082, 0.100, 0.012, 0.026, 0.038, 0.026);
    bp(bearMat, 0.082, 0.100, 0.012, 0.026, 0.038, 0.026);
    bp(bearMat, -0.048, 0.030, 0.042, 0.034, 0.028, 0.042);
    bp(bearMat, 0.048, 0.030, 0.042, 0.034, 0.028, 0.042);
    bear.position.set(Math.cos(BEAR_ANGLE) * 0.27, TOP, Math.sin(BEAR_ANGLE) * 0.27);
    bear.rotation.y = Math.PI / 2 - BEAR_ANGLE;
    bear.scale.setScalar(1.4);
    root.add(bear);

    /* ---- 小猪 ---- */
    const pigMat = new THREE.MeshStandardMaterial({ color: 0xf8aabb, roughness: 0.6, metalness: 0.0 });
    const pigSnout = new THREE.MeshStandardMaterial({ color: 0xe98ba3, roughness: 0.5, metalness: 0.0 });
    const pigDark = new THREE.MeshStandardMaterial({ color: 0x33202a, roughness: 0.5, metalness: 0.0 });
    const pig = new THREE.Group();
    function pp(mat, x, y, z, sx, sy, sz) {
      const m = new THREE.Mesh(sph, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      pig.add(m);
      return m;
    }
    pp(pigMat, 0, 0.066, 0, 0.080, 0.060, 0.094);          // 身体
    pp(pigMat, 0, 0.132, 0.056, 0.056, 0.052, 0.050);      // 头
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.022, 18), pigSnout);
    snout.position.set(0, 0.126, 0.100);
    snout.rotation.x = Math.PI / 2;
    snout.castShadow = true;
    pig.add(snout);
    pp(pigDark, -0.009, 0.126, 0.112, 0.004, 0.004, 0.004); // 鼻孔
    pp(pigDark, 0.009, 0.126, 0.112, 0.004, 0.004, 0.004);
    pp(pigDark, -0.023, 0.150, 0.102, 0.011, 0.011, 0.011); // 眼睛
    pp(pigDark, 0.023, 0.150, 0.102, 0.011, 0.011, 0.011);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.032, 8), pigMat);
    earL.position.set(-0.038, 0.178, 0.044);
    earL.rotation.set(-0.25, 0, 0.35);
    pig.add(earL);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.032, 8), pigMat);
    earR.position.set(0.038, 0.178, 0.044);
    earR.rotation.set(-0.25, 0, -0.35);
    pig.add(earR);
    pp(pigMat, -0.044, 0.016, 0.048, 0.018, 0.018, 0.018);  // 四条腿
    pp(pigMat, 0.044, 0.016, 0.048, 0.018, 0.018, 0.018);
    pp(pigMat, -0.044, 0.016, -0.048, 0.018, 0.018, 0.018);
    pp(pigMat, 0.044, 0.016, -0.048, 0.018, 0.018, 0.018);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 8, 14), pigMat);
    tail.position.set(0, 0.086, -0.092);
    tail.rotation.y = Math.PI / 2;
    pig.add(tail);
    pig.position.set(Math.cos(PIG_ANGLE) * 0.28, TOP, Math.sin(PIG_ANGLE) * 0.28);
    pig.rotation.y = Math.PI / 2 - PIG_ANGLE;
    pig.scale.setScalar(1.25);
    root.add(pig);

    /* ---- 蜡烛 ---- */
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.08, 0.028, 32), gold);
    holder.position.y = TOP + 0.014;
    holder.castShadow = true;
    root.add(holder);

    const CANDLE_H = 0.34;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, CANDLE_H, 32), new THREE.MeshStandardMaterial({ color: 0xfff6e6, roughness: 0.45 }));
    candle.position.y = TOP + 0.028 + CANDLE_H / 2;
    candle.castShadow = true;
    root.add(candle);
    candleCollider = candle;

    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8), new THREE.MeshStandardMaterial({ color: 0x201410 }));
    wick.position.y = TOP + 0.028 + CANDLE_H + 0.012;
    root.add(wick);

    const FLAME_Y = TOP + 0.028 + CANDLE_H + 0.035;

    /* ---- 火焰 ---- */
    flameGroup = new THREE.Group();
    flameGroup.position.y = FLAME_Y;
    root.add(flameGroup);

    const pts = [
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.032, 0.028),
      new THREE.Vector2(0.042, 0.075),
      new THREE.Vector2(0.030, 0.125),
      new THREE.Vector2(0.012, 0.165),
      new THREE.Vector2(0.001, 0.185)
    ];
    flameMesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 26), new THREE.MeshBasicMaterial({
      color: 0xffdf8a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    flameGroup.add(flameMesh);

    const core = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.001, 0),
      new THREE.Vector2(0.018, 0.03),
      new THREE.Vector2(0.012, 0.075),
      new THREE.Vector2(0.001, 0.105)
    ], 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flameGroup.add(core);

    flameGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffc266, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    flameGlow.scale.set(0.85, 0.85, 1);
    flameGlow.position.y = 0.07;
    flameGroup.add(flameGlow);

    flameLight = new THREE.PointLight(0xff9a3c, 2.2, 3.2, 2);
    flameLight.position.y = 0.09;
    flameGroup.add(flameLight);

    /* ---- 点击热区（不可见但可拾取） ---- */
    ballCollider = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
    ballCollider.position.copy(flameGroup.position);
    ballCollider.position.y += 0.05;
    root.add(ballCollider);

    /* ---- 糖粒 ---- */
    const sprGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.045, 6);
    const sprColors = [0xffd166, 0xff7b9c, 0x6fc8ff, 0xa6e77a, 0xffffff, 0xc9a4ff];
    const dummy = new THREE.Object3D();
    let idx = 0;
    const total = 90;
    const inst = new THREE.InstancedMesh(sprGeo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }), total);
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const setColor = new THREE.Color();
    let yy = BASE;
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const inner = i < tiers.length - 1 ? tiers[i + 1].r + 0.04 : 0.14;
      const count = i < tiers.length - 1 ? 32 : 26;
      for (let k = 0; k < count && idx < total; k++) {
        const a = Math.random() * Math.PI * 2;
        const rr = inner + (t.r - 0.07 - inner) * Math.sqrt(Math.random());
        dummy.position.set(Math.cos(a) * rr, yy + t.h + 0.016, Math.sin(a) * rr);
        dummy.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.3, 0, Math.random() * Math.PI);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);
        setColor.setHex(sprColors[idx % sprColors.length]);
        inst.setColorAt(idx, setColor);
        idx++;
      }
      yy += t.h;
    }
    inst.count = idx;
    inst.castShadow = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    root.add(inst);

    /* ---- 烟雾粒子 ---- */
    const N = 60;
    smokeGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -99;
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    smokeLife = new Array(N).fill(0);
    smokeVel = new Array(N).fill(0).map(() => new THREE.Vector3());
    smokePoints = new THREE.Points(smokeGeo, new THREE.PointsMaterial({
      map: smokeTexture(), size: 0.13, transparent: true, opacity: 0.0, depthWrite: false, sizeAttenuation: true, color: 0xdcd6ea
    }));
    smokePoints.frustumCulled = false;
    scene.add(smokePoints);
    smokePoints.userData.origin = new THREE.Vector3(0, FLAME_Y, 0);

    sizeToViewport();
    window.addEventListener('resize', sizeToViewport);
    if (window.ResizeObserver) new ResizeObserver(sizeToViewport).observe(canvas.parentElement);

    bindDrag();

    renderer.setAnimationLoop(tick);
  }

  function updateCamera() {
    const r = orbit.radius, p = orbit.phi, t = orbit.theta;
    camera.position.set(
      r * Math.sin(p) * Math.sin(t),
      1.02 + r * Math.cos(p),
      r * Math.sin(p) * Math.cos(t)
    );
    camera.lookAt(0, 1.02, 0);
  }

  function sizeToViewport() {
    if (!renderer) return;
    const host = canvas.parentElement;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const tan = Math.tan(camera.fov * Math.PI / 360);
    const needW = 2.5;
    const needH = 2.62;
    const rW = needW / (2 * tan * camera.aspect);
    const rH = needH / (2 * tan);
    orbit.radius = Math.max(rW, rH);
    camera.updateProjectionMatrix();
    updateCamera();
  }

  /* ---------- 拖动旋转 ---------- */
  function bindDrag() {
    canvas.addEventListener('pointerdown', function (e) {
      orbit.dragging = true;
      orbit.lx = e.clientX; orbit.ly = e.clientY;
      orbit.moved = 0; orbit.downT = Date.now(); orbit.vel = 0;
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { } }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!orbit.dragging) return;
      const dx = e.clientX - orbit.lx;
      const dy = e.clientY - orbit.ly;
      orbit.lx = e.clientX; orbit.ly = e.clientY;
      orbit.moved += Math.abs(dx) + Math.abs(dy);
      orbit.theta -= dx * 0.008;
      orbit.vel = -dx * 0.008;
      orbit.phi = Math.min(1.46, Math.max(1.02, orbit.phi - dy * 0.004));
      updateCamera();
    });

    function endDrag(e) {
      if (!orbit.dragging) return;
      orbit.dragging = false;
      const quick = Date.now() - orbit.downT < 320;
      if (quick && orbit.moved < 10) {
        tapAt(e.clientX, e.clientY);
      }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', function () { orbit.dragging = false; });
  }

  function tapAt(cx, cy) {
    if (!armed || blown) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((cx - rect.left) / rect.width) * 2 - 1;
    const py = -((cy - rect.top) / rect.height) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: px, y: py }, camera);
    const hit = ray.intersectObjects([ballCollider, candleCollider], false);
    if (hit.length && window.blowCandle) window.blowCandle();
  }

  function tick() {
    const t = clock.getElapsedTime();

    // 松手后的惯性
    if (!orbit.dragging && Math.abs(orbit.vel) > 0.0002) {
      orbit.theta += orbit.vel;
      orbit.vel *= 0.92;
      updateCamera();
    }

    if (flameGroup && flameGroup.visible) {
      const flick = 1 + Math.sin(t * 17) * 0.05 + Math.sin(t * 7.3) * 0.04;
      let s = flameScale * flick;
      if (blown) {
        const e = Math.min(1, (performance.now() - blowT0) / 420);
        s *= Math.max(0, 1 - e) * (1 + Math.sin(e * 26) * 0.12);
      }
      flameGroup.scale.set(s, s * (1 + (flick - 1) * 0.6), s);
      flameGroup.rotation.z = Math.sin(t * 3.1) * 0.035;
      const fade = blown ? Math.max(0, 1 - (performance.now() - blowT0) / 380) : 1;
      flameLight.intensity = 2.2 * flick * fade;
      if (flameGlow) flameGlow.material.opacity = 0.8 * flick * fade;
      if (blown && performance.now() - blowT0 > 430) flameGroup.visible = false;
    }

    if (smokePoints) {
      const pos = smokeGeo.attributes.position.array;
      let any = 0;
      for (let i = 0; i < smokeLife.length; i++) {
        if (smokeLife[i] > 0) {
          any++;
          smokeLife[i] -= 0.012;
          pos[i * 3] += smokeVel[i].x * 0.012;
          pos[i * 3 + 1] += smokeVel[i].y * 0.012;
          pos[i * 3 + 2] += smokeVel[i].z * 0.012;
          smokeVel[i].x *= 0.985; smokeVel[i].z *= 0.985;
          if (smokeLife[i] <= 0) pos[i * 3 + 1] = -99;
        }
      }
      if (any) {
        smokeGeo.attributes.position.needsUpdate = true;
        smokePoints.material.opacity = 0.5;
      } else {
        smokePoints.material.opacity = 0;
      }
    }

    renderer.render(scene, camera);
  }

  function spawnSmoke() {
    const pos = smokeGeo.attributes.position.array;
    const o = smokePoints.userData.origin;
    let n = 0;
    for (let i = 0; i < smokeLife.length && n < 46; i++) {
      if (smokeLife[i] > 0) continue;
      n++;
      pos[i * 3] = o.x + (Math.random() - 0.5) * 0.03;
      pos[i * 3 + 1] = o.y - 0.02;
      pos[i * 3 + 2] = o.z + (Math.random() - 0.5) * 0.03;
      smokeLife[i] = 0.7 + Math.random() * 0.7;
      smokeVel[i].set((Math.random() - 0.5) * 0.25, 0.55 + Math.random() * 0.35, (Math.random() - 0.5) * 0.25);
    }
    smokeGeo.attributes.position.needsUpdate = true;
  }

  function build() { init(); }
  function arm() { armed = true; }
  function blow() {
    if (blown) return;
    blown = true;
    blowT0 = performance.now();
    setTimeout(spawnSmoke, 180);
    setTimeout(spawnSmoke, 420);
    setTimeout(spawnSmoke, 700);
  }

  function screenPoint() {
    if (!camera || !flameGroup) return null;
    scene.updateMatrixWorld(true);
    const v = new THREE.Vector3(0, flameGroup.position.y + 0.06, 0);
    v.applyMatrix4(root.matrixWorld);
    v.project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
  }

  window.Cake3D = { build, arm, blow, screenPoint, isBuilt: function () { return built; } };
})();
