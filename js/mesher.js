'use strict';

// Builds chunk geometry. Vertex layout (8 floats): x, y, z, u, v, shade, sky, block.
// Full cubes get per-vertex ambient occlusion and smooth light; shaped blocks are
// emitted as boxes from VC.Shapes with UVs cropped like Minecraft does.
VC.Mesher = (function () {
  const P = VC.BP, SH = VC.SHAPE;
  const SX = 18, SZ = 18, SY = VC.CH + 2, LAYER = SX * SZ;
  const pb = new Uint16Array(SX * SY * SZ);
  const pl = new Uint8Array(SX * SY * SZ);
  const pk = new Uint8Array(SX * SY * SZ);
  // Ambient occlusion per corner; scaled by the "smooth lighting" option (0 = flat).
  const AO_BASE = [0.42, 0.62, 0.8, 1.0];
  const AO = AO_BASE.slice();
  let smooth = 1;
  function setSmooth(level) {
    smooth = level;
    for (let i = 0; i < 4; i++) AO[i] = 1 - (1 - AO_BASE[i]) * level;
  }
  const NT = VC.ATLAS_TILES, TS = 1 / NT, EPS = 0.0002;
  const VS = 8;
  const off = (x, y, z) => y * LAYER + z * SX + x;

  const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.6 },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.6 },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
  ];
  // UV (0..1 inside the tile) of a point on face f.
  function uvOf(f, x, y, z) {
    switch (f) {
      case 0: return [1 - z, 1 - y];
      case 1: return [z, 1 - y];
      case 4: return [x, 1 - y];
      case 5: return [1 - x, 1 - y];
      default: return [x, z];
    }
  }
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    F.nOff = off(F.n[0], F.n[1], F.n[2]);
    const axes = [0, 1, 2].filter((a) => F.n[a] === 0);
    F.s1 = []; F.s2 = []; F.cr = [];
    for (const c of F.c) {
      const t1 = [0, 0, 0], t2 = [0, 0, 0];
      t1[axes[0]] = c[axes[0]] ? 1 : -1;
      t2[axes[1]] = c[axes[1]] ? 1 : -1;
      F.s1.push(off(t1[0], t1[1], t1[2]));
      F.s2.push(off(t2[0], t2[1], t2[2]));
      F.cr.push(off(t1[0] + t2[0], t1[1] + t2[1], t1[2] + t2[2]));
    }
  }

  function makeBuf() { return { v: new Float32Array(VS * 4 * 4096), i: new Uint32Array(6 * 4096), vn: 0, in: 0 }; }
  const O = makeBuf(), W = makeBuf();
  function reserve(b, quads) {
    if ((b.vn + quads * 4) * VS > b.v.length) { const n = new Float32Array(Math.max(b.v.length * 2, (b.vn + quads * 4) * VS)); n.set(b.v); b.v = n; }
    if (b.in + quads * 12 > b.i.length) { const n = new Uint32Array(Math.max(b.i.length * 2, b.in + quads * 12)); n.set(b.i); b.i = n; }
  }
  function vert(b, x, y, z, u, v, shade, sky, blk) {
    const a = b.v, o = b.vn * VS;
    a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = u; a[o + 4] = v; a[o + 5] = shade; a[o + 6] = sky; a[o + 7] = blk;
    b.vn++;
  }
  function quadIdx(b, base, flip, twoSided) {
    const I = b.i;
    let o = b.in;
    if (!flip) { I[o++] = base; I[o++] = base + 1; I[o++] = base + 2; I[o++] = base; I[o++] = base + 2; I[o++] = base + 3; }
    else { I[o++] = base; I[o++] = base + 1; I[o++] = base + 3; I[o++] = base + 1; I[o++] = base + 2; I[o++] = base + 3; }
    if (twoSided) { I[o++] = base; I[o++] = base + 2; I[o++] = base + 1; I[o++] = base; I[o++] = base + 3; I[o++] = base + 2; }
    b.in = o;
  }

  // Copies the chunk plus a 1-block border into the padded arrays, up to height lim.
  function fill(world, ch, lim) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = (dx || dz) ? world.getChunk(ch.cx + dx, ch.cz + dz) : ch;
        const x0 = dx < 0 ? 15 : 0, x1 = dx > 0 ? 0 : 15;
        const z0 = dz < 0 ? 15 : 0, z1 = dz > 0 ? 0 : 15;
        const px0 = dx < 0 ? 0 : dx === 0 ? 1 : 17;
        const pz0 = dz < 0 ? 0 : dz === 0 ? 1 : 17;
        for (let y = 0; y <= lim; y++) {
          for (let z = z0; z <= z1; z++) {
            let dst = (y + 1) * LAYER + (z - z0 + pz0) * SX + px0;
            let src = (y << 8) | (z << 4) | x0;
            for (let x = x0; x <= x1; x++, dst++, src++) {
              if (c) { pb[dst] = c.blocks[src]; pl[dst] = c.sky[src]; pk[dst] = c.blk[src]; }
              else { pb[dst] = 0; pl[dst] = 15; pk[dst] = 0; }
            }
          }
        }
      }
    }
    for (let i = 0; i < LAYER; i++) {
      pb[i] = VC.B.BEDROCK; pl[i] = 0; pk[i] = 0;
      const t = (lim + 2) * LAYER + i;
      pb[t] = 0; pl[t] = world.hasSky ? 15 : 0; pk[t] = 0;
    }
  }

  const curve = (l) => Math.pow(0.8, 15 - l);
  const CURVE = new Float32Array(16);
  for (let i = 0; i < 16; i++) CURVE[i] = i ? curve(i) : 0;
  const SKYC = new Float32Array(16);
  for (let i = 0; i < 16; i++) SKYC[i] = curve(i);

  function tileUV(tile) { return [(tile % NT) * TS, Math.floor(tile / NT) * TS]; }

  // Crossed sprites (plants), '#' crops and fire.
  function sprites(b, x, y, z, s, p, shape) {
    const [u0, v0] = tileUV(P.tex[s * 6 + 4]);
    const sky = SKYC[pl[p]], blk = CURVE[pk[p]];
    let quads;
    if (shape === SH.crop) {
      quads = [
        [[0.25, 0, 0], [0.25, 0, 1], [0.25, 1, 1], [0.25, 1, 0]], [[0.75, 0, 0], [0.75, 0, 1], [0.75, 1, 1], [0.75, 1, 0]],
        [[0, 0, 0.25], [1, 0, 0.25], [1, 1, 0.25], [0, 1, 0.25]], [[0, 0, 0.75], [1, 0, 0.75], [1, 1, 0.75], [0, 1, 0.75]],
      ];
    } else {
      const a = shape === SH.fire ? 0 : 0.15, c = 1 - a;
      quads = [[[a, 0, a], [c, 0, c], [c, 1, c], [a, 1, a]], [[a, 0, c], [c, 0, a], [c, 1, a], [a, 1, c]]];
    }
    // Small random offset for flowers & grass like MC.
    let ox = 0, oz = 0;
    if (shape === SH.cross && (s >> 4) !== 175 && (s >> 4) !== 83) {
      const h = (Math.imul(x + 1, 3129871) ^ Math.imul(z + 1, 116129781)) >>> 0;
      ox = ((h & 15) / 15 - 0.5) * 0.3; oz = (((h >> 4) & 15) / 15 - 0.5) * 0.3;
    }
    reserve(b, quads.length * 2);
    for (const q of quads) {
      const base = b.vn;
      for (let k = 0; k < 4; k++) {
        const U = k === 1 || k === 2 ? 1 : 0, V = k < 2 ? 1 : 0;
        const wave = shape === SH.fire ? 0 : q[k][1] ? 20 : 10; // top corners sway
        vert(b, x + q[k][0] + ox, y + q[k][1], z + q[k][2] + oz, u0 + (U ? TS - EPS : EPS), v0 + (V ? TS - EPS : EPS), 0.95 + wave, sky, blk);
      }
      quadIdx(b, base, false, true);
    }
  }

  // Shaped block made of boxes.
  function shaped(b, x, y, z, s, p) {
    const nb = (dx, dy, dz) => pb[p + off(dx, dy, dz)];
    const boxes = VC.Shapes.boxes(s, nb);
    reserve(b, boxes.length * 6);
    for (const bx of boxes) {
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const onEdge = (f === 0 && bx[3] >= 1) || (f === 1 && bx[0] <= 0) || (f === 2 && bx[4] >= 1) || (f === 3 && bx[1] <= 0) || (f === 4 && bx[5] >= 1) || (f === 5 && bx[2] <= 0);
        const q = onEdge ? p + F.nOff : p;
        if (onEdge && P.opaque[pb[q]]) continue;
        const [u0, v0] = tileUV(P.tex[s * 6 + f]);
        const ls = Math.max(pl[q], pl[p]), lk = Math.max(pk[q], pk[p]);
        const base = b.vn;
        for (let k = 0; k < 4; k++) {
          const c = F.c[k];
          const X = c[0] ? bx[3] : bx[0], Y = c[1] ? bx[4] : bx[1], Z = c[2] ? bx[5] : bx[2];
          const [u, v] = uvOf(f, X, Y, Z);
          vert(b, x + X, y + Y, z + Z, u0 + Math.min(TS - EPS, Math.max(EPS, u * TS)), v0 + Math.min(TS - EPS, Math.max(EPS, v * TS)), F.shade, SKYC[ls], CURVE[lk]);
        }
        quadIdx(b, base, false, false);
      }
    }
  }

  function liquidHeight(s, above) {
    if (P.liquid[above] && (above >> 4) === (s >> 4)) return 1;
    return 1 - ((s & 7) + 1) / 9;
  }

  function build(world, ch) {
    if (ch.lightDirty) world.computeLight(ch);
    // Only mesh up to the highest block (+1 layer of neighbours for faces / AO).
    let top = ch.top;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(ch.cx + dx, ch.cz + dz);
      if (c && c.top > top) top = c.top;
    }
    const lim = Math.min(VC.CH - 1, top + 1);
    fill(world, ch, lim);
    O.vn = O.in = W.vn = W.in = 0;
    const opaque = P.opaque, liquid = P.liquid, shapeT = P.shape, tex = P.tex;
    const ao = [0, 0, 0, 0], lt = [0, 0, 0, 0], lb = [0, 0, 0, 0];
    const SNOWY_SIDE = VC.tile('grass_side_snowed'), SNOW_TOP = VC.tile('snow');

    for (let y = 0; y <= Math.min(ch.top, VC.CH - 1); y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const p = (y + 1) * LAYER + (z + 1) * SX + (x + 1);
          const s = pb[p];
          if (!s) continue;
          const sh = shapeT[s];
          if (sh === SH.cross || sh === SH.crop || sh === SH.fire) { sprites(O, x, y, z, s, p, sh); continue; }
          if (sh === SH.none) continue;
          const isLiquid = liquid[s];
          const b = P.translucent[s] ? W : O;
          if (sh !== SH.cube && !isLiquid) { shaped(b, x, y, z, s, p); continue; }

          const topH = isLiquid ? liquidHeight(s, pb[p + LAYER]) : 1;
          const self = s >> 4;
          const above = pb[p + LAYER];
          const snowy = self === 2 && ((above >> 4) === 78 || (above >> 4) === 80);
          const leaves = self === 18 || self === 161;

          for (let f = 0; f < 6; f++) {
            const F = FACES[f], q = p + F.nOff, n = pb[q];
            if (opaque[n]) continue;
            if (n === s && !leaves) continue; // glass, ice, liquids against themselves
            if (isLiquid && liquid[n] && (n >> 4) === self) {
              if (f === 2 || f === 3) continue;
              if (liquidHeight(n, pb[q + LAYER]) >= topH) continue;
            }

            reserve(b, 1);
            let tile = tex[s * 6 + f];
            if (snowy) tile = f === 2 ? SNOW_TOP : f === 3 ? tile : SNOWY_SIDE;
            const [u0, v0] = tileUV(tile);

            for (let k = 0; k < 4; k++) {
              if (isLiquid) { ao[k] = 3; lt[k] = SKYC[pl[q]]; lb[k] = CURVE[Math.max(pk[q], pk[p])]; continue; }
              const a1 = q + F.s1[k], a2 = q + F.s2[k], a3 = q + F.cr[k];
              const o1 = opaque[pb[a1]], o2 = opaque[pb[a2]], o3 = opaque[pb[a3]];
              ao[k] = (o1 && o2) ? 0 : 3 - (o1 + o2 + o3);
              let ss = pl[q], sk = pk[q], cnt = 1;
              if (!o1) { ss += pl[a1]; sk += pk[a1]; cnt++; }
              if (!o2) { ss += pl[a2]; sk += pk[a2]; cnt++; }
              if (!o3 && !(o1 && o2)) { ss += pl[a3]; sk += pk[a3]; cnt++; }
              if (smooth > 0) { lt[k] = curve(ss / cnt); lb[k] = sk > 0 ? curve(sk / cnt) : 0; }
              else { lt[k] = SKYC[pl[q]]; lb[k] = CURVE[pk[q]]; }
            }

            const base = b.vn;
            const flag = leaves ? 30 : isLiquid && f === 2 && !VC.isLava(s) ? 40 : 0;
            for (let k = 0; k < 4; k++) {
              const c = F.c[k];
              const vy = c[1] === 1 ? topH : 0;
              const [u, v] = uvOf(f, c[0], vy, c[2]);
              vert(b, x + c[0], y + vy, z + c[2], u0 + Math.min(TS - EPS, Math.max(EPS, u * TS)), v0 + Math.min(TS - EPS, Math.max(EPS, v * TS)),
                F.shade * AO[ao[k]] + flag, lt[k], lb[k]);
            }
            quadIdx(b, base, ao[0] + ao[2] < ao[1] + ao[3], false);
          }
        }
      }
    }
    ch.dirty = false;
    return {
      o: { v: O.v.subarray(0, O.vn * VS), i: O.i.subarray(0, O.in), count: O.in },
      w: { v: W.v.subarray(0, W.vn * VS), i: W.i.subarray(0, W.in), count: W.in },
    };
  }

  return { build, uvOf, FACES, setSmooth };
})();
