'use strict';

// Box models (MC style) for mobs, arrows, dropped items, the breaking overlay and
// the first-person hand. Geometry is rebuilt on the CPU every frame in the same
// 8-float vertex layout as chunks: x, y, z, u, v, shade, sky, block.
VC.Models = (function () {
  const S = 512;
  const regions = {};
  let cx = 0, cy = 0, rowH = 0;

  // ---------- Mob texture atlas ----------
  function alloc(key, w, h, d) {
    const W = 2 * d + 2 * w, H = d + h;
    if (cx + W > S) { cx = 0; cy += rowH; rowH = 0; }
    regions[key] = { u: cx, v: cy, w, h, d };
    cx += W + 1;
    rowH = Math.max(rowH, H + 1);
  }

  // Face rectangles in the classic box-UV layout.
  function faceRect(r, face) {
    const { u, v, w, h, d } = r;
    switch (face) {
      case 'top': return [u + d, v, w, d];
      case 'bottom': return [u + d + w, v, w, d];
      case 'west': return [u, v + d, d, h];
      case 'front': return [u + d, v + d, w, h];
      case 'east': return [u + d + w, v + d, d, h];
      default: return [u + 2 * d + w, v + d, w, h]; // back
    }
  }

  function buildAtlas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const dd = img.data;
    let seed = 4321;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const vary = (c, v = 0.12) => { const k = 1 + (rnd() - 0.5) * v; return [c[0] * k, c[1] * k, c[2] * k]; };
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const cowN = new VC.Noise(31);

    function paint(key, w, h, d, fn) {
      alloc(key, w, h, d);
      const r = regions[key];
      for (const face of ['top', 'bottom', 'west', 'front', 'east', 'back']) {
        const [fx, fy, fw, fh] = faceRect(r, face);
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          const c = fn(face, x, y, fw, fh, fx + x, fy + y);
          if (!c) continue;
          const i = ((fy + y) * S + fx + x) * 4;
          dd[i] = Math.max(0, Math.min(255, c[0])); dd[i + 1] = Math.max(0, Math.min(255, c[1]));
          dd[i + 2] = Math.max(0, Math.min(255, c[2])); dd[i + 3] = 255;
        }
      }
    }

    // Zombie
    const ZSKIN = [92, 140, 78], SHIRT = [36, 140, 140], PANTS = [62, 58, 150];
    paint('zombie_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front') {
        if (y === 4 && (x === 2 || x === 5)) return [15, 25, 15];
        if (y === 4 && (x === 1 || x === 6)) return [40, 70, 40];
        if (y === 5 && (x === 3 || x === 4)) return vary([60, 95, 52]);
        if (y === 6 && x >= 2 && x <= 5) return vary([50, 80, 45]);
      }
      if ((f === 'top') || (f !== 'bottom' && y < 2)) return vary([55, 95, 50], 0.2);
      return vary(ZSKIN, 0.15);
    });
    paint('zombie_body', 8, 12, 4, (f, x, y) => vary(y > 9 ? PANTS : SHIRT, 0.12));
    paint('zombie_arm', 4, 12, 4, (f, x, y) => vary((f !== 'bottom' && (f === 'top' || y < 4)) ? SHIRT : ZSKIN, 0.14));
    paint('zombie_leg', 4, 12, 4, (f, x, y) => vary(f === 'bottom' || y > 10 ? [80, 80, 80] : PANTS, 0.12));

    // Skeleton
    const BONE = [200, 200, 200], DARK = [55, 55, 55];
    paint('skeleton_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front') {
        if ((y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6)) return [25, 25, 25];
        if (y === 5 && (x === 3 || x === 4)) return [80, 80, 80];
        if (y === 6 && x >= 1 && x <= 6) return x % 2 ? [70, 70, 70] : vary(BONE, 0.08);
      }
      return vary(BONE, 0.1);
    });
    paint('skeleton_body', 8, 12, 4, (f, x, y) => {
      if (f === 'front' || f === 'back') {
        if (x === 3 || x === 4) return vary(BONE, 0.08);
        if (y % 2 === 0 && y < 9 && x > 0 && x < 7) return vary(BONE, 0.08);
        return DARK;
      }
      return vary(y % 2 === 0 ? BONE : DARK, 0.1);
    });
    paint('skeleton_limb', 2, 12, 2, () => vary(BONE, 0.1));

    // Creeper
    const CG = [[80, 170, 70], [100, 200, 90], [60, 140, 55], [130, 210, 120], [70, 160, 60]];
    paint('creeper_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front') {
        if ((y === 2 || y === 3) && (x === 1 || x === 2 || x === 5 || x === 6)) return [10, 10, 10];
        if (y === 4 && (x === 3 || x === 4)) return [10, 10, 10];
        if ((y === 5 || y === 6) && x >= 2 && x <= 5) return [10, 10, 10];
        if (y === 7 && (x === 2 || x === 5)) return [10, 10, 10];
      }
      return rnd() < 0.05 ? [215, 235, 210] : vary(pick(CG), 0.1);
    });
    paint('creeper_body', 8, 12, 4, () => (rnd() < 0.05 ? [215, 235, 210] : vary(pick(CG), 0.1)));
    paint('creeper_leg', 4, 6, 4, (f, x, y) => (f === 'bottom' ? [40, 70, 35] : vary(pick(CG), 0.1)));

    // Spider
    const SP = [48, 40, 36];
    paint('spider_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front') {
        if ((y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) || (y === 2 && (x === 3 || x === 4))) return [220, 30, 30];
        if (y === 4 && (x === 2 || x === 5)) return [170, 20, 20];
      }
      return vary(SP, 0.25);
    });
    paint('spider_neck', 6, 6, 6, () => vary([40, 34, 30], 0.2));
    paint('spider_body', 10, 8, 12, (f, x, y) => {
      if (f === 'top' && (x === 4 || x === 5) && y > 2) return vary([90, 70, 60], 0.15);
      return vary(SP, 0.3);
    });
    paint('spider_leg', 16, 2, 2, () => vary([38, 32, 28], 0.2));

    // Pig
    const PINK = [238, 160, 152];
    paint('pig_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front' && y === 3) {
        if (x === 1 || x === 6) return [250, 250, 250];
        if (x === 2 || x === 5) return [20, 20, 20];
      }
      return vary(PINK, 0.08);
    });
    paint('pig_snout', 4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [150, 80, 80] : vary([225, 128, 125], 0.06)));
    paint('pig_body', 10, 8, 16, () => vary(PINK, 0.1));
    paint('pig_leg', 4, 6, 4, (f, x, y) => (f === 'bottom' || y === 5 ? [120, 80, 70] : vary(PINK, 0.08)));

    // Cow
    const cowCol = (gx, gy) => (cowN.noise2(gx / 5, gy / 5) > 0.15 ? vary([235, 235, 230], 0.05) : vary([62, 46, 36], 0.12));
    paint('cow_head', 8, 8, 6, (f, x, y, fw, fh, gx, gy) => {
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 6)) return [15, 15, 15];
        if (y >= 5) return vary([200, 175, 165], 0.06);
      }
      return cowCol(gx, gy);
    });
    paint('cow_horn', 1, 3, 1, () => vary([225, 220, 205], 0.05));
    paint('cow_body', 12, 10, 18, (f, x, y, fw, fh, gx, gy) => cowCol(gx, gy));
    paint('cow_leg', 4, 12, 4, (f, x, y, fw, fh, gx, gy) => (f === 'bottom' || y > 10 ? [50, 40, 32] : cowCol(gx, gy)));

    // Player (Steve-like)
    const SKIN = [198, 140, 105], HAIR = [60, 40, 22], TEE = [0, 168, 168], JEANS = [52, 48, 140];
    paint('steve_head', 8, 8, 8, (f, x, y) => {
      if (f === 'top') return vary(HAIR, 0.15);
      if (f === 'bottom') return vary(SKIN, 0.05);
      if (f === 'front') {
        if (y < 2 || (y === 2 && (x === 0 || x === 7))) return vary(HAIR, 0.15);
        if (y === 4 && (x === 1 || x === 6)) return [245, 245, 245];
        if (y === 4 && (x === 2 || x === 5)) return [70, 55, 140];
        if (y === 5 && (x === 3 || x === 4)) return vary([150, 95, 70], 0.05);
        if (y === 6 && x >= 2 && x <= 5) return vary([110, 60, 45], 0.05);
        if (y === 7 && x >= 2 && x <= 5) return vary(HAIR, 0.15);
        return vary(SKIN, 0.05);
      }
      if (f === 'back') return vary(HAIR, 0.15);
      return y < 3 + (x > 4 ? 1 : 0) ? vary(HAIR, 0.15) : vary(SKIN, 0.05);
    });
    paint('steve_body', 8, 12, 4, (f, x, y) => (y >= 11 && f !== 'top' ? vary([75, 60, 40], 0.1) : vary(TEE, 0.08)));
    paint('steve_arm', 4, 12, 4, (f, x, y) => vary(f === 'top' || (f !== 'bottom' && y < 4) ? TEE : SKIN, 0.06));
    paint('steve_leg', 4, 12, 4, (f, x, y) => vary(f === 'bottom' || y > 10 ? [90, 90, 90] : JEANS, 0.1));

    // Sheep
    const WOOLC = [234, 236, 236], SSKIN = [215, 190, 170];
    paint('sheep_wool', 8, 8, 16, () => vary(WOOLC, 0.06));
    paint('sheep_skin', 6, 6, 14, () => vary(SSKIN, 0.06));
    paint('sheep_head', 6, 6, 8, (f, x, y) => {
      if (f === 'front') {
        if (y === 2 && (x === 1 || x === 4)) return [20, 20, 20];
        if (y === 2 && (x === 0 || x === 5)) return [240, 240, 240];
        if (y >= 4 && x >= 2 && x <= 3) return [220, 170, 160];
        return vary(SSKIN, 0.05);
      }
      return f === 'bottom' ? vary(SSKIN, 0.05) : vary(WOOLC, 0.06);
    });
    paint('sheep_leg', 4, 12, 4, (f, x, y) => (y < 6 && f !== 'bottom' ? vary(WOOLC, 0.06) : vary(SSKIN, 0.05)));
    // Chicken
    paint('chicken_body', 6, 6, 8, () => vary([245, 245, 245], 0.04));
    paint('chicken_head', 4, 6, 3, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [20, 20, 20] : vary([245, 245, 245], 0.04)));
    paint('chicken_beak', 4, 2, 2, () => vary([240, 180, 40], 0.05));
    paint('chicken_wattle', 2, 2, 2, () => vary([210, 30, 30], 0.05));
    paint('chicken_wing', 1, 4, 6, () => vary([230, 230, 230], 0.05));
    paint('chicken_leg', 1, 5, 1, () => vary([240, 170, 40], 0.05));

    // Zombie pigman
    const PIGSKIN = [232, 150, 150], ROT = [110, 150, 90], RAG = [110, 80, 50];
    paint('pigman_head', 8, 8, 8, (f, x, y) => {
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 6)) return [240, 240, 240];
        if (y === 3 && (x === 2 || x === 5)) return [200, 20, 20];
        if (y >= 5 && y <= 6 && x >= 2 && x <= 5) return vary([220, 120, 120], 0.05);
        if (x < 3 && y < 4) return vary(ROT, 0.15);
      }
      if (f === 'west' && x < 5 && y > 2) return vary([225, 225, 210], 0.06); // exposed skull
      return vary(PIGSKIN, 0.08);
    });
    paint('pigman_body', 8, 12, 4, (f, x, y) => (y > 8 ? vary(RAG, 0.15) : (x + y) % 5 === 0 ? vary(ROT, 0.15) : vary([140, 110, 70], 0.12)));
    paint('pigman_arm', 4, 12, 4, (f, x, y) => (y > 6 && f !== 'top' ? vary([225, 225, 210], 0.05) : vary(PIGSKIN, 0.08)));
    paint('pigman_leg', 4, 12, 4, (f, x, y) => (y < 6 ? vary(RAG, 0.15) : vary(PIGSKIN, 0.08)));
    // Ghast
    paint('ghast_body', 16, 16, 16, (f, x, y) => {
      if (f === 'front') {
        if ((y === 5 || y === 6) && ((x >= 3 && x <= 5) || (x >= 10 && x <= 12))) return [60, 60, 60];
        if (y >= 10 && y <= 12 && x >= 5 && x <= 10) return [40, 40, 40];
      }
      return vary([240, 240, 240], 0.03);
    });
    paint('ghast_leg', 2, 9, 2, () => vary([235, 235, 235], 0.04));

    // Worn armor: one set of pieces per material (drawn as slightly bigger boxes over the player).
    const ARMOR_COL = { leather: [160, 101, 64], chain: [150, 150, 155], iron: [215, 215, 215], gold: [240, 200, 60], diamond: [75, 215, 205] };
    for (const [m, c] of Object.entries(ARMOR_COL)) {
      const tex = (f, x, y, fw, fh) => {
        if (m === 'chain') return (x + y) % 2 ? vary([70, 70, 75], 0.1) : vary(c, 0.08);
        const edge = x === 0 || y === 0 || x === fw - 1 || y === fh - 1;
        if (edge) return vary(c.map((v) => v * 0.7), 0.06);
        if (m !== 'leather' && x === 1 && y < fh - 2) return c.map((v) => Math.min(255, v * 1.2 + 25));
        return vary(c, m === 'leather' ? 0.1 : 0.05);
      };
      paint(`armor_${m}_head`, 8, 8, 8, tex);
      paint(`armor_${m}_brow`, 8, 2, 1, tex);
      paint(`armor_${m}_body`, 8, 12, 4, tex);
      paint(`armor_${m}_shoulder`, 4, 5, 4, tex);
      paint(`armor_${m}_belt`, 8, 4, 4, tex);
      paint(`armor_${m}_leg`, 4, 9, 4, tex);
      paint(`armor_${m}_boot`, 4, 4, 4, tex);
    }

    // Elytra wing: grey membrane with darker feather bands.
    paint('elytra_wing', 10, 20, 2, (f, x, y, fw, fh) => {
      if (x === 0 || y === fh - 1) return vary([95, 95, 115], 0.06);
      return vary((x + Math.floor(y / 2)) % 4 === 0 ? [110, 110, 132] : [150, 150, 172], 0.06);
    });

    // Arrow + first person arm
    paint('arrow_shaft', 1, 1, 12, () => vary([130, 100, 62], 0.1));
    paint('arrow_head', 2, 2, 2, () => vary([170, 170, 170], 0.1));
    paint('arrow_feather', 3, 1, 3, () => vary([235, 235, 235], 0.05));
    paint('hand', 4, 4, 12, () => vary([205, 150, 112], 0.06));

    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // ---------- Geometry helpers ----------
  const VS = 8;
  const UNIT = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], face: 'east', fi: 0 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], face: 'west', fi: 1 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], face: 'top', fi: 2 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], face: 'bottom', fi: 3 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], face: 'front', fi: 4 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], face: 'back', fi: 5 },
  ];
  const QUV = [[0, 1], [1, 1], [1, 0], [0, 0]];

  function makeBuf() { return { a: new Float32Array(VS * 6 * 2048), n: 0 }; }
  function ensure(b, verts) {
    if ((b.n + verts) * VS > b.a.length) { const n = new Float32Array(Math.max(b.a.length * 2, (b.n + verts) * VS)); n.set(b.a); b.a = n; }
  }
  function vtx(b, p, u, v, shade, light) {
    const a = b.a, o = b.n * VS;
    a[o] = p[0]; a[o + 1] = p[1]; a[o + 2] = p[2]; a[o + 3] = u; a[o + 4] = v; a[o + 5] = shade; a[o + 6] = light[0]; a[o + 7] = light[1];
    b.n++;
  }
  function shadeOf(n) {
    return n[0] * n[0] * 0.6 + n[2] * n[2] * 0.8 + n[1] * n[1] * (n[1] > 0 ? 1 : 0.5);
  }
  // Quad (two triangles) from 4 corners, uv rect [u0,v0,u1,v1] in 0..1 atlas space.
  function quad(b, pts, uv, shade, light, twoSided, uvPts) {
    ensure(b, twoSided ? 12 : 6);
    const UV = uvPts || QUV.map(([U, V]) => [U ? uv[2] : uv[0], V ? uv[3] : uv[1]]);
    const order = twoSided ? [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const k of order) vtx(b, pts[k], UV[k][0], UV[k][1], shade, light);
  }

  const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
  const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; };
  const rotZ = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };

  // Emits a box. xf maps local points to world, xn maps normals. uvFor(face, fi) -> rect or null.
  function box(b, origin, size, uvFor, xf, xn, light) {
    for (const F of UNIT) {
      const uv = uvFor(F.face, F.fi);
      if (!uv) continue;
      const pts = F.c.map((c) => xf([origin[0] + c[0] * size[0], origin[1] + c[1] * size[1], origin[2] + c[2] * size[2]]));
      quad(b, pts, uv, shadeOf(xn(F.n)), light, false);
    }
  }

  function regionUV(key) {
    const r = regions[key], PX = 1 / S;
    return (face) => {
      const [x, y, w, h] = faceRect(r, face);
      return [(x + 0.01) * PX, (y + 0.01) * PX, (x + w - 0.01) * PX, (y + h - 0.01) * PX];
    };
  }
  // Player skins use the standard 64x64 (or legacy 64x32) layout.
  let skinH = 64;
  const SKIN = {
    head: [0, 0], hat: [32, 0], body: [16, 16], jacket: [16, 32], rarm: [40, 16], rsleeve: [40, 32],
    larm: [32, 48], lsleeve: [48, 48], rleg: [0, 16], rpants: [0, 32], lleg: [16, 48], lpants: [0, 48],
  };
  function skinUV(part, w, h, d) {
    let [u, v] = SKIN[part];
    if (skinH === 32) {
      if (part === 'larm') [u, v] = SKIN.rarm; else if (part === 'lleg') [u, v] = SKIN.rleg;
      else if (!['head', 'hat', 'body', 'rarm', 'rleg'].includes(part)) return () => null;
    }
    const r = { u, v, w, h, d };
    return (face) => {
      const [x, y, fw, fh] = faceRect(r, face);
      return [(x + 0.01) / 64, (y + 0.01) / skinH, (x + fw - 0.01) / 64, (y + fh - 0.01) / skinH];
    };
  }
  function tileUV(tile) {
    const N = VC.ATLAS_TILES, e = 0.0004, u = (tile % N) / N, v = Math.floor(tile / N) / N;
    return [u + e, v + e, u + 1 / N - e, v + 1 / N - e];
  }
  function blockUV(id) {
    const P = VC.BP;
    return (face, fi) => tileUV(P.tex[id * 6 + fi]);
  }
  const curve = (l) => (l ? Math.pow(0.8, 15 - l) : 0);
  function lightAt(world, p) {
    const x = Math.floor(p[0]), y = Math.floor(p[1]), z = Math.floor(p[2]);
    return [Math.pow(0.8, 15 - world.getSky(x, y, z)), curve(world.getBlockLight(x, y, z))];
  }

  // ---------- Mob models ----------
  // Player body parts in order head, body, right arm, left arm, right leg, left leg.
  // Each entry: [key, origin, size, pivot, rot, skin overlay layer].
  function playerList(m) {
    const sw = m.limbSwing, amp = m.limbAmp, PI = Math.PI;
    const leg = Math.cos(sw * 1.3) * 1.1 * amp;
    const hy = Math.atan2(Math.sin(m.yaw - m.bodyYaw), Math.cos(m.yaw - m.bodyYaw));
    const hp = -m.headPitch;
    const swing = m.swing ? Math.sin(Math.sqrt(m.swing) * PI) : 0;
    const armR = Math.cos(sw * 1.3 + PI) * 0.9 * amp - swing * 1.4 - (m.using ? 0.6 : 0);
    const armL = Math.cos(sw * 1.3) * 0.9 * amp;
    // Drawing a bow: both arms raised towards where the head looks (like skeletons).
    const aim = -PI / 2 - m.headPitch + (m.tilt || 0);
    const rotR = m.bowing ? [aim, hy - 0.1, 0] : null, rotL = m.bowing ? [aim, hy + 0.4, 0] : null;
    const K = (steve, part) => (m.skin ? 'skin:' + part : steve);
    if (m.sneaking) {
      const t = 0.5, c = Math.cos(t), sn = Math.sin(t);
      return [
        [K('steve_head', 'head'), [-4, 0, -4], [8, 8, 8], [0, 12 + 12 * c, 12 * sn], [hp, hy, 0], 'hat'],
        [K('steve_body', 'body'), [-4, 0, -2], [8, 12, 4], [0, 12, 0], [t, 0, 0], 'jacket'],
        [K('steve_arm', 'rarm'), [-2, -10, -2], [4, 12, 4], [-6, 12 + 10 * c, 10 * sn], [armR + t, 0, 0], 'rsleeve'],
        [K('steve_arm', 'larm'), [-2, -10, -2], [4, 12, 4], [6, 12 + 10 * c, 10 * sn], [armL + t, 0, 0], 'lsleeve'],
        [K('steve_leg', 'rleg'), [-2, -12, -2], [4, 12, 4], [-2, 12, -1], [leg, 0, 0], 'rpants'],
        [K('steve_leg', 'lleg'), [-2, -12, -2], [4, 12, 4], [2, 12, -1], [-leg, 0, 0], 'lpants'],
      ];
    }
    return [
      [K('steve_head', 'head'), [-4, 0, -4], [8, 8, 8], [0, 24, 0], [hp, hy, 0], 'hat'],
      [K('steve_body', 'body'), [-4, 0, -2], [8, 12, 4], [0, 12, 0], [0, 0, 0], 'jacket'],
      [K('steve_arm', 'rarm'), [-2, -10, -2], [4, 12, 4], [-6, 22, 0], rotR || [armR, 0, 0.05], 'rsleeve'],
      [K('steve_arm', 'larm'), [-2, -10, -2], [4, 12, 4], [6, 22, 0], rotL || [armL, 0, -0.05], 'lsleeve'],
      [K('steve_leg', 'rleg'), [-2, -12, -2], [4, 12, 4], [-2, 12, 0], [leg, 0, 0], 'rpants'],
      [K('steve_leg', 'lleg'), [-2, -12, -2], [4, 12, 4], [2, 12, 0], [-leg, 0, 0], 'lpants'],
    ];
  }

  // Worn armor boxes. m.armor = [helmet, chestplate, leggings, boots] material names (or null).
  // Each box is inflated past the skin overlay layers so it always sits on top.
  // Entry: [key, origin, size, pivot, rot, faces to skip].
  function armorParts(m) {
    const a = m.armor || [];
    if (!a.some(Boolean) && !m.elytra) return [];
    const [head, body, rarm, larm, rleg, lleg] = playerList(m);
    const out = [];
    if (m.elytra) {
      // Wings hinge at the top of the back; m.wing (0 folded .. 1 gliding) spreads them out.
      const bt = body[4][0], w = m.wing || 0;
      const rx = 0.26 + w * 0.1 + (m.sneaking ? 0.5 : 0), rz = 0.26 + w * 1.15;
      for (const side of [1, -1]) {
        const pv = rotX([side * 5, 12, -2], bt);
        out.push(['elytra_wing', [side > 0 ? -10 : 0, -20, -2], [10, 20, 2],
          [pv[0] + body[3][0], pv[1] + body[3][1], pv[2] + body[3][2]], [rx + bt, 0, side * rz]]);
      }
    }
    const add = (mat, piece, part, o, s, inf, skip) =>
      out.push([`armor_${mat}_${piece}`, o.map((v) => v - inf), s.map((v) => v + inf * 2), part[3], part[4], skip]);
    if (a[0]) {
      // Open at the front (face visible) and bottom; a brow strip covers the top of the face.
      add(a[0], 'head', head, [-4, 0, -4], [8, 8, 8], 1, ['front', 'bottom']);
      out.push([`armor_${a[0]}_brow`, [-5, 6, 4], [10, 3, 1], head[3], head[4], ['back', 'top', 'bottom', 'east', 'west']]);
    }
    if (a[1]) {
      add(a[1], 'body', body, [-4, 0, -2], [8, 12, 4], 1);
      for (const arm of [rarm, larm]) add(a[1], 'shoulder', arm, [-2, -3, -2], [4, 5, 4], 1);
    }
    if (a[2]) {
      add(a[2], 'belt', body, [-4, 0, -2], [8, 4, 4], 0.5, ['top', 'bottom']);
      for (const leg of [rleg, lleg]) add(a[2], 'leg', leg, [-2, -9, -2], [4, 9, 4], 0.5, ['top']);
    }
    if (a[3]) for (const leg of [rleg, lleg]) add(a[3], 'boot', leg, [-2, -12, -2], [4, 4, 4], 1);
    return out;
  }

  function parts(m) {
    const sw = m.limbSwing, amp = m.limbAmp;
    const leg = Math.cos(sw * 1.3) * 1.1 * amp;
    const hy = Math.atan2(Math.sin(m.yaw - m.bodyYaw), Math.cos(m.yaw - m.bodyYaw));
    const hp = -m.headPitch;
    const PI = Math.PI;
    switch (m.type) {
      case 'zombie': return [
        ['zombie_head', [-4, 0, -4], [8, 8, 8], [0, 24, 0], [hp, hy, 0]],
        ['zombie_body', [-4, 0, -2], [8, 12, 4], [0, 12, 0], [0, 0, 0]],
        ['zombie_arm', [-2, -10, -2], [4, 12, 4], [-6, 22, 0], [-PI / 2 + Math.sin(m.age * 2) * 0.05, 0, 0]],
        ['zombie_arm', [-2, -10, -2], [4, 12, 4], [6, 22, 0], [-PI / 2 - Math.sin(m.age * 2) * 0.05, 0, 0]],
        ['zombie_leg', [-2, -12, -2], [4, 12, 4], [-2, 12, 0], [leg, 0, 0]],
        ['zombie_leg', [-2, -12, -2], [4, 12, 4], [2, 12, 0], [-leg, 0, 0]],
      ];
      case 'skeleton': {
        const arm = m.aiming ? -PI / 2 - m.headPitch : 0;
        return [
          ['skeleton_head', [-4, 0, -4], [8, 8, 8], [0, 24, 0], [hp, hy, 0]],
          ['skeleton_body', [-4, 0, -2], [8, 12, 4], [0, 12, 0], [0, 0, 0]],
          ['skeleton_limb', [-1, -10, -1], [2, 12, 2], [-5, 22, 0], [m.aiming ? arm : -leg * 0.7, m.aiming ? -0.1 : 0, 0]],
          ['skeleton_limb', [-1, -10, -1], [2, 12, 2], [5, 22, 0], [m.aiming ? arm : leg * 0.7, m.aiming ? 0.4 : 0, 0]],
          ['skeleton_limb', [-1, -12, -1], [2, 12, 2], [-2, 12, 0], [leg, 0, 0]],
          ['skeleton_limb', [-1, -12, -1], [2, 12, 2], [2, 12, 0], [-leg, 0, 0]],
        ];
      }
      case 'creeper': return [
        ['creeper_head', [-4, 0, -4], [8, 8, 8], [0, 18, 0], [hp, hy, 0]],
        ['creeper_body', [-4, 0, -2], [8, 12, 4], [0, 6, 0], [0, 0, 0]],
        ['creeper_leg', [-2, -6, -2], [4, 6, 4], [-2, 6, 4], [leg, 0, 0]],
        ['creeper_leg', [-2, -6, -2], [4, 6, 4], [2, 6, 4], [-leg, 0, 0]],
        ['creeper_leg', [-2, -6, -2], [4, 6, 4], [-2, 6, -4], [-leg, 0, 0]],
        ['creeper_leg', [-2, -6, -2], [4, 6, 4], [2, 6, -4], [leg, 0, 0]],
      ];
      case 'spider': {
        const out = [
          ['spider_neck', [-3, -3, -3], [6, 6, 6], [0, 9, 0], [0, 0, 0]],
          ['spider_head', [-4, -4, 0], [8, 8, 8], [0, 9, 3], [hp, hy, 0]],
          ['spider_body', [-5, -4, -12], [10, 8, 12], [0, 9, -3], [0, 0, 0]],
        ];
        const fan = [-0.7, -0.25, 0.25, 0.7], zs = [2, 1, 0, -1];
        for (let i = 0; i < 4; i++) {
          const a = Math.sin(sw * 2 + i * PI / 2) * 0.4 * amp;
          out.push(['spider_leg', [0, -1, -1], [16, 2, 2], [4, 9, zs[i]], [0, fan[i] + a, -0.55]]);
          out.push(['spider_leg', [-16, -1, -1], [16, 2, 2], [-4, 9, zs[i]], [0, -fan[i] - a, 0.55]]);
        }
        return out;
      }
      case 'pig': return [
        ['pig_body', [-5, -4, -8], [10, 8, 16], [0, 10, 0], [0, 0, 0]],
        ['pig_head', [-4, -4, 0], [8, 8, 8], [0, 12, 7], [hp, hy, 0]],
        ['pig_snout', [-2, -3, 8], [4, 3, 1], [0, 12, 7], [hp, hy, 0]],
        ['pig_leg', [-2, -6, -2], [4, 6, 4], [-3, 6, 5], [leg, 0, 0]],
        ['pig_leg', [-2, -6, -2], [4, 6, 4], [3, 6, 5], [-leg, 0, 0]],
        ['pig_leg', [-2, -6, -2], [4, 6, 4], [-3, 6, -5], [-leg, 0, 0]],
        ['pig_leg', [-2, -6, -2], [4, 6, 4], [3, 6, -5], [leg, 0, 0]],
      ];
      case 'cow': return [
        ['cow_body', [-6, -5, -9], [12, 10, 18], [0, 17, 0], [0, 0, 0]],
        ['cow_head', [-4, -4, 0], [8, 8, 6], [0, 19, 8], [hp, hy, 0]],
        ['cow_horn', [-5, 3, 1], [1, 3, 1], [0, 19, 8], [hp, hy, 0]],
        ['cow_horn', [4, 3, 1], [1, 3, 1], [0, 19, 8], [hp, hy, 0]],
        ['cow_leg', [-2, -12, -2], [4, 12, 4], [-4, 12, 6], [leg, 0, 0]],
        ['cow_leg', [-2, -12, -2], [4, 12, 4], [4, 12, 6], [-leg, 0, 0]],
        ['cow_leg', [-2, -12, -2], [4, 12, 4], [-4, 12, -6], [-leg, 0, 0]],
        ['cow_leg', [-2, -12, -2], [4, 12, 4], [4, 12, -6], [leg, 0, 0]],
      ];
      case 'pigman': {
        const angry = m.provoked > 0;
        return [
          ['pigman_head', [-4, 0, -4], [8, 8, 8], [0, 24, 0], [hp, hy, 0]],
          ['pigman_body', [-4, 0, -2], [8, 12, 4], [0, 12, 0], [0, 0, 0]],
          ['pigman_arm', [-2, -10, -2], [4, 12, 4], [-6, 22, 0], [angry ? -PI / 2 : -leg * 0.7, 0, 0]],
          ['pigman_arm', [-2, -10, -2], [4, 12, 4], [6, 22, 0], [angry ? -PI / 2 : leg * 0.7, 0, 0]],
          ['pigman_leg', [-2, -12, -2], [4, 12, 4], [-2, 12, 0], [leg, 0, 0]],
          ['pigman_leg', [-2, -12, -2], [4, 12, 4], [2, 12, 0], [-leg, 0, 0]],
        ];
      }
      case 'ghast': {
        const out = [['ghast_body', [-32, 0, -32], [64, 64, 64], [0, 0, 0], [0, 0, 0]]];
        let i = 0;
        for (const tz of [-20, 0, 20]) for (const tx of [-20, 0, 20]) {
          const len = 28 + ((i * 37) % 13);
          out.push(['ghast_leg', [-4, -len, -4], [8, len, 8], [tx, 2, tz], [Math.sin(m.age * 2 + i) * 0.25, 0, Math.cos(m.age * 1.7 + i) * 0.15]]);
          i++;
        }
        return out;
      }
      case 'sheep': {
        const head = Math.min(0.9, m.grazing || 0);
        return [
          [m.sheared ? 'sheep_skin' : 'sheep_wool', m.sheared ? [-3, -3, -7] : [-4, -4, -8], m.sheared ? [6, 6, 14] : [8, 8, 16], [0, 16, 0], [0, 0, 0]],
          ['sheep_head', [-3, -3, 0], [6, 6, 8], [0, 18, 7], [hp + head, hy, 0]],
          ['sheep_leg', [-2, -12, -2], [4, 12, 4], [-3, 12, 5], [leg, 0, 0]],
          ['sheep_leg', [-2, -12, -2], [4, 12, 4], [3, 12, 5], [-leg, 0, 0]],
          ['sheep_leg', [-2, -12, -2], [4, 12, 4], [-3, 12, -5], [-leg, 0, 0]],
          ['sheep_leg', [-2, -12, -2], [4, 12, 4], [3, 12, -5], [leg, 0, 0]],
        ];
      }
      case 'chicken': {
        const flap = m.onGround ? 0 : Math.sin(m.age * 30) * 0.8 + 0.8;
        return [
          ['chicken_body', [-3, -3, -4], [6, 6, 8], [0, 8, 0], [0, 0, 0]],
          ['chicken_head', [-2, 0, -1.5], [4, 6, 3], [0, 9, 4], [hp, hy, 0]],
          ['chicken_beak', [-2, 2, 1.5], [4, 2, 2], [0, 9, 4], [hp, hy, 0]],
          ['chicken_wattle', [-1, 0, 1.5], [2, 2, 2], [0, 9, 4], [hp, hy, 0]],
          ['chicken_wing', [-1, -4, -3], [1, 4, 6], [-3, 11, 0], [0, 0, flap]],
          ['chicken_wing', [0, -4, -3], [1, 4, 6], [3, 11, 0], [0, 0, -flap]],
          ['chicken_leg', [-0.5, -5, -0.5], [1, 5, 1], [-1.5, 5, 0], [leg, 0, 0]],
          ['chicken_leg', [-0.5, -5, -0.5], [1, 5, 1], [1.5, 5, 0], [-leg, 0, 0]],
        ];
      }
      case 'player': {
        const sk = m.skin;
        const list = playerList(m);
        if (!sk) return list.map((p) => p.slice(0, 5));
        // Skin overlay layers (hat, jacket, sleeves, pants) are slightly bigger boxes.
        const out = [];
        for (const p of list) {
          out.push(p.slice(0, 5));
          const inf = p[5] === 'hat' ? 0.5 : 0.25;
          out.push(['skin:' + p[5], p[1].map((v) => v - inf), p[2].map((v) => v + inf * 2), p[3], p[4]]);
        }
        return out;
      }
    }
    return [];
  }

  function mob(b, m, world) { emit(b, m, world, parts(m)); }

  // Armor worn by a player-shaped model; uses the mob atlas whatever the skin.
  function armor(b, m, world) { emit(b, m, world, armorParts(m)); }

  // Point / normal transforms from a model part's local pixel space to the world.
  function partXf(m, pivot, rot) {
    const yawR = m.bodyYaw + Math.PI;
    const death = m.dead ? Math.min(1, m.deathTime * 2.5) * Math.PI / 2 : 0;
    const swell = m.type === 'creeper' ? 1 + Math.min(1, m.fuse / 1.5) * 0.18 : 1;
    const scale = m.baby ? 0.5 : 1;
    const pos = m.pos, tilt = m.tilt || 0;
    const xn = (n) => rotY(rotZ(rotX(rotZ(rotY(rotX(n, rot[0]), rot[1]), rot[2]), tilt), death), yawR);
    const xf = (v) => {
      let p = rotZ(rotY(rotX(v, rot[0]), rot[1]), rot[2]);
      p = [p[0] + pivot[0], p[1] + pivot[1], p[2] + pivot[2]];
      // Whole-body lean (gliding), around the waist.
      if (tilt) { p = rotX([p[0], p[1] - 12, p[2]], tilt); p[1] += 12; }
      p = [p[0] / 16 * swell * scale, p[1] / 16 * scale, p[2] / 16 * swell * scale];
      p = rotY(rotZ(p, death), yawR);
      return [p[0] + pos[0], p[1] + pos[1], p[2] + pos[2]];
    };
    return [xf, xn];
  }

  // Item held in the right hand of a player-shaped model (third person).
  function heldItem(blockBuf, itemBuf, m, world, id) {
    if (!id) return;
    const light = lightAt(world, m.center());
    const arm = playerList(m)[2];
    const [xf, xn] = partXf(m, arm[3], arm[4]);
    if (!VC.isItem(id) && !flatBlock(id)) {
      // Small cube gripped at the hand, turned a bit like in first person.
      const c = [0, -11, 1];
      box(blockBuf, [-3, -3, -3], [6, 6, 6], blockUV(id),
        (v) => xf(rotY(v, 0.75).map((k, i) => k + c[i])), (n) => xn(rotY(n, 0.75)), light);
      return;
    }
    // Flat sprite in the arm's side plane: image right = forward, tilted so the
    // handle (bottom-left) sits in the hand and the tip points ahead.
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const p = rotX([0, b * 5, a * 5], Math.PI / 4);
      return xf([p[0], p[1] - 9, p[2] + 3]);
    });
    if (VC.isItem(id)) quad(itemBuf, pts, tileUV(VC.ITEMS[id].sprite), 1, light, true);
    else quad(blockBuf, pts, tileUV(VC.BP.tex[id * 6 + 4]), 1, light, true);
  }

  function emit(b, m, world, list) {
    const light = lightAt(world, m.center());
    for (const [key, o, s, pivot, rot, skip] of list) {
      const [xf, xn] = partXf(m, pivot, rot);
      let uv;
      if (key.startsWith('skin:')) {
        const part = key.slice(5);
        const base = { hat: [8, 8, 8], jacket: [8, 12, 4], rsleeve: [4, 12, 4], lsleeve: [4, 12, 4], rpants: [4, 12, 4], lpants: [4, 12, 4] }[part];
        uv = skinUV(part, ...(base || s));
      } else uv = regionUV(key);
      if (skip) { const full = uv; uv = (face, fi) => (skip.includes(face) ? null : full(face, fi)); }
      box(b, o, s, uv, xf, xn, light);
    }
  }

  function arrow(b, a, world) {
    const light = lightAt(world, a.pos);
    const xf = (v) => {
      const p = rotY(rotX([v[0] / 16, v[1] / 16, v[2] / 16], -a.pitch), a.yaw);
      return [p[0] + a.pos[0], p[1] + a.pos[1], p[2] + a.pos[2]];
    };
    const xn = (n) => rotY(rotX(n, -a.pitch), a.yaw);
    box(b, [-0.5, -0.5, -9], [1, 1, 12], regionUV('arrow_shaft'), xf, xn, light);
    box(b, [-1, -1, 3], [2, 2, 2], regionUV('arrow_head'), xf, xn, light);
    box(b, [-1.5, -0.5, -9], [3, 1, 3], regionUV('arrow_feather'), xf, xn, light);
  }

  const flatBlock = (id) => {
    const P = VC.BP, SH = VC.SHAPE, sh = P.shape[id];
    return P.cross[id] || [SH.torch, SH.ladder, SH.vine, SH.rail, SH.dust, SH.lilypad, SH.pane, SH.fire, SH.lever, SH.button, SH.door].includes(sh);
  };

  // Item rendered as a cube (blocks) or a sprite (items/plants) centred at c.
  function itemModel(blockBuf, itemBuf, id, c, size, rot, light) {
    if (!VC.isItem(id) && !flatBlock(id)) {
      box(blockBuf, [-0.5, -0.5, -0.5], [1, 1, 1], blockUV(id),
        (v) => { const p = rotY(v, rot); return [c[0] + p[0] * size, c[1] + p[1] * size, c[2] + p[2] * size]; },
        (n) => rotY(n, rot), light);
      return;
    }
    const sz = size * 0.9;
    const pts = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]].map((v) => {
      const p = rotY(v, rot);
      return [c[0] + p[0] * sz, c[1] + p[1] * sz, c[2] + p[2] * sz];
    });
    if (VC.isItem(id)) quad(itemBuf, pts, tileUV(VC.ITEMS[id].sprite), 1, light, true);
    else quad(blockBuf, pts, tileUV(VC.BP.tex[id * 6 + 4]), 1, light, true);
  }

  function droppedItem(blockBuf, itemBuf, e, world, time) {
    const light = lightAt(world, e.center());
    const rot = time * 1.5 + e.spin;
    const bob = Math.sin(time * 2.5 + e.spin) * 0.06 + 0.1;
    const copies = e.stack.count > 1 ? 2 : 1;
    for (let k = 0; k < copies; k++) {
      const off = k * 0.06;
      itemModel(blockBuf, itemBuf, e.stack.id, [e.pos[0] + off, e.pos[1] + bob + 0.12 + off, e.pos[2] - off], 0.25, rot, light);
    }
  }

  // Thrown snowballs / eggs / pearls: sprite facing the camera.
  function thrown(itemBuf, e, world, camYaw) {
    itemModel(null, itemBuf, e.itemId, e.pos, 0.25, camYaw, lightAt(world, e.pos));
  }

  // Full-size block entity (falling sand, primed TNT).
  function blockEntity(b, pos, id, world, scale = 1) {
    const light = lightAt(world, [pos[0], pos[1] + 0.5, pos[2]]);
    box(b, [-0.5, 0, -0.5], [1, 1, 1], blockUV(id), (v) => [pos[0] + v[0] * scale, pos[1] + v[1] * scale, pos[2] + v[2] * scale], (n) => n, light);
  }

  function crack(b, x, y, z, stage, world, bx) {
    let best = 0;
    for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 0, 0]]) best = Math.max(best, world.getSky(x + dx, y + dy, z + dz));
    const light = [Math.pow(0.8, 15 - best) * 0.7, curve(world.getBlockLight(x, y + 1, z)) * 0.7];
    const e = 0.004, B = bx || [0, 0, 0, 1, 1, 1];
    const uv = tileUV(VC.TILE.DESTROY + stage);
    box(b, [x + B[0] - e, y + B[1] - e, z + B[2] - e], [B[3] - B[0] + 2 * e, B[4] - B[1] + 2 * e, B[5] - B[2] + 2 * e], () => uv, (v) => v, (n) => n, light);
  }

  // First-person hand / held item. cam = { eye, yaw, pitch }.
  function hand(blockBuf, itemBuf, mobBuf, cam, held, swing, use, light, skin, sprite) {
    const cp = Math.cos(cam.pitch);
    const F = [-Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), -Math.cos(cam.yaw) * cp];
    const R = [Math.cos(cam.yaw), 0, -Math.sin(cam.yaw)];
    const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
    const E = cam.eye;
    const toWorld = (l) => [
      E[0] + R[0] * l[0] + U[0] * l[1] + F[0] * l[2],
      E[1] + R[1] * l[0] + U[1] * l[1] + F[1] * l[2],
      E[2] + R[2] * l[0] + U[2] * l[1] + F[2] * l[2],
    ];
    const toWorldN = (n) => [R[0] * n[0] + U[0] * n[1] + F[0] * n[2], R[1] * n[0] + U[1] * n[1] + F[1] * n[2], R[2] * n[0] + U[2] * n[1] + F[2] * n[2]];
    const sq = Math.sqrt(swing);
    const off = [-Math.sin(sq * Math.PI) * 0.3, Math.sin(sq * Math.PI * 2) * 0.12 - use * 0.05, -Math.sin(swing * Math.PI) * 0.15];
    const tilt = -Math.sin(swing * Math.PI) * 0.8 + use * 0.4;
    const id = held ? held.id : 0;

    if (!id) {
      const base = [0.48 + off[0], -0.62 + off[1], 0.55 + off[2]];
      const xf = (v) => toWorld(rotX(rotY([v[0] * 0.016, v[1] * 0.016, v[2] * 0.06], -0.15), tilt + 0.15).map((c, i) => c + base[i]));
      const xn = (n) => toWorldN(rotX(rotY(n, -0.15), tilt + 0.15));
      if (skin) {
        // Arm box oriented along the view: use the skin's right arm (4x12x4) faces.
        const uv = skinUV('rarm', 4, 12, 4);
        const remap = { top: 'front', bottom: 'back', front: 'bottom', back: 'top', east: 'east', west: 'west' };
        box(skin, [-2, -2, -6], [4, 4, 12], (face) => uv(remap[face]), xf, xn, light);
      } else box(mobBuf, [-2, -2, -6], [4, 4, 12], regionUV('hand'), xf, xn, light);
      return;
    }
    if (!VC.isItem(id) && !flatBlock(id)) {
      const base = [0.5 + off[0], -0.45 + off[1], 0.8 + off[2]];
      const sz = 0.36;
      const xf = (v) => toWorld(rotX(rotY([v[0] * sz, v[1] * sz, v[2] * sz], 0.75), tilt).map((c, i) => c + base[i]));
      box(blockBuf, [-0.5, -0.5, -0.5], [1, 1, 1], blockUV(id), xf, (n) => toWorldN(rotX(rotY(n, 0.75), tilt)), light);
      return;
    }
    const base = [0.52 + off[0], -0.36 + off[1], 0.75 + off[2]];
    const sz = 0.3;
    const pts = [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]].map((v) =>
      toWorld(rotX(rotZ(rotY([v[0] * sz, v[1] * sz, 0], -0.35), 0.25), tilt).map((c, i) => c + base[i])));
    if (VC.isItem(id)) quad(itemBuf, pts, tileUV(sprite !== undefined ? sprite : VC.ITEMS[id].sprite), 1, light, true);
    else quad(blockBuf, pts, tileUV(VC.BP.tex[id * 6 + 4]), 1, light, true);
  }

  // Chest lid (MC proportions: base 10px, lid 4px), opened `ang` radians around its back hinge.
  function chestLid(b, x, y, z, state, ang, world) {
    const P = VC.BP, m = state & 15, front = VC.FACE_OF_FACING[m & 3];
    const side = front === 0 || front === 1 ? 4 : 0;
    // Canonical frame: front is +z. Then turn it to the chest's facing.
    const yaw = { 4: 0, 5: Math.PI, 0: Math.PI / 2, 1: -Math.PI / 2 }[front];
    const crop = (tile, u0, v0, u1, v1) => { const r = tileUV(tile), w = r[2] - r[0], h = r[3] - r[1]; return [r[0] + u0 * w, r[1] + v0 * h, r[0] + u1 * w, r[1] + v1 * h]; };
    const t = (fi) => P.tex[state * 6 + fi];
    const uvFor = (face) => {
      if (face === 'top' || face === 'bottom') return crop(t(2), 1 / 16, 1 / 16, 15 / 16, 15 / 16);
      return crop(t(face === 'front' ? front : side), 1 / 16, 2 / 16, 15 / 16, 6 / 16);
    };
    const light = lightAt(world, [x + 0.5, y + 0.8, z + 0.5]);
    const xf = (v) => {
      // v in pixels; hinge at y = 10, z = 1 (back edge).
      let p = rotX([v[0], v[1] - 10, v[2] - 1], -ang);
      p = [p[0] - 8, p[1] + 10, p[2] + 1 - 8];
      p = rotY(p, yaw);
      return [x + 0.5 + p[0] / 16, y + p[1] / 16, z + 0.5 + p[2] / 16];
    };
    const xn = (n) => rotY(rotX(n, -ang), yaw);
    box(b, [1, 10, 1], [14, 4, 14], uvFor, xf, xn, light);
    // Latch.
    box(b, [7, 8, 15], [2, 4, 1], () => crop(t(front), 7 / 16, 3 / 16, 9 / 16, 7 / 16), xf, xn, light);
  }

  function setSkinSize(h) { skinH = h === 32 ? 32 : 64; }

  // Camera-facing sprite from the item atlas (particles, fireballs).
  function billboard(itemBuf, pos, sprite, size, camYaw, light) {
    const R = [Math.cos(camYaw) * size, 0, -Math.sin(camYaw) * size], U = [0, size, 0];
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [pos[0] + R[0] * a + U[0] * b, pos[1] + R[1] * a + U[1] * b, pos[2] + R[2] * a + U[2] * b]);
    quad(itemBuf, pts, tileUV(sprite), 1, light, true);
  }

  // Atlas layout for resource packs: region key -> { u, v, w, h, d } in pixels of an S x S atlas.
  const atlasInfo = () => ({ regions, S, faceRect });

  return { chestLid, buildAtlas, atlasInfo, makeBuf, mob, armor, heldItem, arrow, droppedItem, thrown, blockEntity, crack, hand, setSkinSize, lightAt, billboard };
})();
