'use strict';

// Build minigame: Fortnite-style pieces (walls, floors, ramps, cones) on their own grid,
// independent of the voxel world. Handles storage, collision, targeting, edits, structural
// integrity and geometry. main.js drives input, rendering batches and networking.
VC.Build = (function () {
  const W = 5, H = 4;            // grid cell: 5 blocks wide, 4 tall
  const WT = 0.3, FT = 0.25, ST = 0.25; // wall / floor / slope thickness
  const N8 = 8;                  // slope collision resolution (steps per side)
  const KINDS = ['wall', 'floor', 'ramp', 'cone'];
  const KIND_NAMES = { wall: 'Muro', floor: 'Suelo', ramp: 'Rampa', cone: 'Cono' };
  const MATS = [
    { name: 'Madera', tex: 'build_wood', frame: 'build_wood_frame', hp: 150, time: 3, sound: VC.st(5) },
    { name: 'Piedra', tex: 'build_stone', frame: 'build_stone_frame', hp: 300, time: 6, sound: VC.st(4) },
    { name: 'Metal', tex: 'build_metal', frame: 'build_metal_frame', hp: 500, time: 9, sound: VC.st(42) },
  ];
  const DIRS = VC.FACING_DIR; // 0:+z 1:-x 2:-z 3:+x
  const now = () => performance.now() / 1000;

  // ---------- Pieces ----------
  // { k: kind, x, y, z: grid cell, a: wall axis ('x' spans X / 'z' spans Z), r: ramp dir,
  //   e: edit (wall/floor: removed-tile mask, cone: raised-quadrant mask), m: material,
  //   o: owner name, dmg: damage taken, born: local time placed }
  function keyOf(p) {
    if (p.k === 'wall') return `w${p.a}:${p.x},${p.y},${p.z}`;
    return `${p.k[0]}:${p.x},${p.y},${p.z}`;
  }

  class World {
    constructor(baseY) {
      this.baseY = baseY;          // world y of grid level 0
      this.pieces = new Map();
      this.cells = new Map();      // "x,y,z" -> Set of keys (for spatial queries)
      this.version = 0;
    }

    by(y) { return this.baseY + y * H; }
    cellKey(x, y, z) { return x + ',' + y + ',' + z; }

    add(p) {
      p.key = keyOf(p);
      if (this.pieces.has(p.key)) this.remove(p.key);
      p.e = p.e || 0; p.dmg = p.dmg || 0;
      if (p.born === undefined) p.born = now();
      p.geo = null;
      this.pieces.set(p.key, p);
      const ck = this.cellKey(p.x, p.y, p.z);
      if (!this.cells.has(ck)) this.cells.set(ck, new Set());
      this.cells.get(ck).add(p.key);
      this.version++;
      return p;
    }

    remove(key) {
      const p = this.pieces.get(key);
      if (!p) return null;
      this.pieces.delete(key);
      const s = this.cells.get(this.cellKey(p.x, p.y, p.z));
      if (s) s.delete(key);
      this.version++;
      return p;
    }

    get(key) { return this.pieces.get(key); }

    // Pieces whose cell is within the given world-space box (+1 cell margin).
    near(x0, y0, z0, x1, y1, z1) {
      const out = [];
      const gx0 = Math.floor(x0 / W) - 1, gx1 = Math.floor(x1 / W) + 1;
      const gz0 = Math.floor(z0 / W) - 1, gz1 = Math.floor(z1 / W) + 1;
      const gy0 = Math.floor((y0 - this.baseY) / H) - 1, gy1 = Math.floor((y1 - this.baseY) / H) + 1;
      for (let y = gy0; y <= gy1; y++) for (let z = gz0; z <= gz1; z++) for (let x = gx0; x <= gx1; x++) {
        const s = this.cells.get(x + ',' + y + ',' + z);
        if (s) for (const k of s) out.push(this.pieces.get(k));
      }
      return out;
    }

    // ----- Shape -----
    aabb(p) {
      const x0 = p.x * W, z0 = p.z * W, b = this.by(p.y);
      if (p.k === 'wall') {
        return p.a === 'x' ? [x0, b, z0 - WT / 2, x0 + W, b + H, z0 + WT / 2] : [x0 - WT / 2, b, z0, x0 + WT / 2, b + H, z0 + W];
      }
      if (p.k === 'floor') return [x0, b - FT, z0, x0 + W, b, z0 + W];
      return [x0, b - ST, z0, x0 + W, b + H, z0 + W];
    }

    // 3x3 heightfield (0..1) of a ramp or cone; h[i][j], i along x, j along z.
    heights(p) {
      const h = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      if (p.k === 'ramp') {
        const [dx, dz] = DIRS[p.r & 3];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          h[i][j] = dx > 0 ? i / 2 : dx < 0 ? 1 - i / 2 : dz > 0 ? j / 2 : 1 - j / 2;
        }
      } else {
        h[1][1] = 1;
        for (let q = 0; q < 4; q++) {
          if (!(p.e & (1 << q))) continue;
          const qi = q & 1, qj = q >> 1;
          h[2 * qi][2 * qj] = 1; h[1][2 * qj] = 1; h[2 * qi][1] = 1;
        }
      }
      return h;
    }

    // Surface height (0..1) at local (u, v) in 0..1, matching the rendered triangles.
    static surface(h, u, v) {
      const gx = Math.min(1.9999, Math.max(0, u * 2)), gz = Math.min(1.9999, Math.max(0, v * 2));
      const qi = Math.floor(gx), qj = Math.floor(gz), a = gx - qi, b = gz - qj;
      const h00 = h[qi][qj], h10 = h[qi + 1][qj], h01 = h[qi][qj + 1], h11 = h[qi + 1][qj + 1];
      // Each quadrant is split along the diagonal through the cell centre.
      if ((1 - qi) === (1 - qj)) {
        return a >= b ? h00 + a * (h10 - h00) + b * (h11 - h10) : h00 + b * (h01 - h00) + a * (h11 - h01);
      }
      return a + b <= 1 ? h00 + a * (h10 - h00) + b * (h01 - h00) : h11 + (1 - a) * (h01 - h11) + (1 - b) * (h10 - h11);
    }

    // Collision boxes of a piece (walls/floors per remaining tile, slopes as thin steps).
    boxes(p, out = []) {
      const x0 = p.x * W, z0 = p.z * W, b = this.by(p.y);
      if (p.k === 'wall') {
        for (let t = 0; t < 9; t++) {
          if (p.e & (1 << t)) continue;
          const col = t % 3, row = Math.floor(t / 3);
          const u0 = col * W / 3, u1 = u0 + W / 3, v0 = b + row * H / 3, v1 = v0 + H / 3;
          if (p.a === 'x') out.push([x0 + u0, v0, z0 - WT / 2, x0 + u1, v1, z0 + WT / 2]);
          else out.push([x0 - WT / 2, v0, z0 + u0, x0 + WT / 2, v1, z0 + u1]);
        }
      } else if (p.k === 'floor') {
        for (let t = 0; t < 4; t++) {
          if (p.e & (1 << t)) continue;
          const qi = t & 1, qj = t >> 1;
          out.push([x0 + qi * W / 2, b - FT, z0 + qj * W / 2, x0 + (qi + 1) * W / 2, b, z0 + (qj + 1) * W / 2]);
        }
      } else {
        const h = this.heights(p), s = W / N8;
        for (let i = 0; i < N8; i++) for (let j = 0; j < N8; j++) {
          const top = b + World.surface(h, (i + 0.5) / N8, (j + 0.5) / N8) * H;
          out.push([x0 + i * s, top - 0.35, z0 + j * s, x0 + (i + 1) * s, top, z0 + (j + 1) * s]);
        }
      }
      return out;
    }

    // Hook for VC.World.collisionBoxes.
    collide(x0, y0, z0, x1, y1, z1, out) {
      for (const p of this.near(x0, y0, z0, x1, y1, z1)) {
        const a = this.aabb(p);
        if (a[3] < x0 || a[0] > x1 || a[4] < y0 - 1 || a[1] > y1 + 1 || a[5] < z0 || a[2] > z1) continue;
        for (const bx of this.boxes(p)) out.push(bx);
      }
    }

    // Piece containing a point (for arrows / snowballs).
    at(pos) {
      for (const p of this.near(pos[0], pos[1], pos[2], pos[0], pos[1], pos[2])) {
        for (const b of this.boxes(p)) {
          if (pos[0] >= b[0] && pos[0] <= b[3] && pos[1] >= b[1] && pos[1] <= b[4] && pos[2] >= b[2] && pos[2] <= b[5]) return p;
        }
      }
      return null;
    }

    // Nearest piece along a ray: { piece, t }. full: walls/floors count their holes too (edit mode).
    raycast(o, d, maxT, full) {
      let best = null, bt = maxT;
      const e = [o[0] + d[0] * maxT, o[1] + d[1] * maxT, o[2] + d[2] * maxT];
      const cand = this.near(Math.min(o[0], e[0]), Math.min(o[1], e[1]), Math.min(o[2], e[2]), Math.max(o[0], e[0]), Math.max(o[1], e[1]), Math.max(o[2], e[2]));
      for (const p of cand) {
        const ta = rayBox(o, d, this.aabb(p), bt);
        if (ta === null) continue;
        if (full && (p.k === 'wall' || p.k === 'floor')) { if (ta < bt) { bt = ta; best = p; } continue; }
        for (const b of this.boxes(p)) {
          const t = rayBox(o, d, b, bt);
          if (t !== null && t < bt) { bt = t; best = p; }
        }
      }
      return best ? { piece: best, t: bt } : null;
    }

    // ----- Placement -----
    // Where a piece of `kind` goes for a player (Fortnite-like rules: adjacent cell in the
    // facing direction, above when looking up, at your feet when looking down).
    target(pl, kind, rot) {
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      const d = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 3 : 1) : (fz > 0 ? 0 : 2);
      const [dx, dz] = DIRS[d];
      const cx = Math.floor(pl.pos[0] / W), cz = Math.floor(pl.pos[2] / W);
      const cy = Math.floor((pl.pos[1] - this.baseY + 0.05) / H);
      const pitch = pl.pitch;
      // Standing on a ramp that rises the way we face: the cell ahead starts a level higher.
      const here = this.pieces.get(`r:${cx},${cy},${cz}`);
      const ly = here && here.r === d ? cy + 1 : cy;
      if (kind === 'wall') {
        const y = pitch > 0.75 ? cy + 1 : cy;
        if (d === 3) return { k: 'wall', a: 'z', x: cx + 1, y, z: cz };
        if (d === 1) return { k: 'wall', a: 'z', x: cx, y, z: cz };
        if (d === 0) return { k: 'wall', a: 'x', x: cx, y, z: cz + 1 };
        return { k: 'wall', a: 'x', x: cx, y, z: cz };
      }
      if (kind === 'floor') {
        if (pitch > 0.45) return { k: 'floor', x: cx, y: cy + 1, z: cz };
        if (pitch < -0.95) return { k: 'floor', x: cx, y: cy, z: cz };
        return { k: 'floor', x: cx + dx, y: ly, z: cz + dz };
      }
      if (kind === 'ramp') {
        const r = (d + (rot || 0)) & 3;
        if (pitch < -0.85) return { k: 'ramp', r, x: cx, y: cy, z: cz };
        return { k: 'ramp', r, x: cx + dx, y: ly, z: cz + dz };
      }
      if (pitch > 0.25) return { k: 'cone', x: cx, y: cy + 1, z: cz };
      return { k: 'cone', x: cx + dx, y: ly, z: cz + dz };
    }

    // Touches the terrain (any solid voxel just under its footprint).
    grounded(p, world) {
      const a = this.aabb(p), P = VC.BP;
      const y = Math.floor(a[1] - 0.05);
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        const x = Math.floor(a[0] + (a[3] - a[0]) * (0.1 + i * 0.4)), z = Math.floor(a[2] + (a[5] - a[2]) * (0.1 + j * 0.4));
        if (P.solid[world.getBlock(x, y, z)] || P.solid[world.getBlock(x, y + 1, z)]) return true;
      }
      return false;
    }

    touching(p, q) {
      const a = this.aabb(p), b = this.aabb(q), e = 0.06;
      return a[0] <= b[3] + e && a[3] >= b[0] - e && a[1] <= b[4] + e && a[4] >= b[1] - e && a[2] <= b[5] + e && a[5] >= b[2] - e;
    }

    // A new piece must touch the ground or another piece (no floating builds).
    supported(spec, world) {
      if (this.grounded(spec, world)) return true;
      const a = this.aabb(spec);
      for (const q of this.near(a[0], a[1], a[2], a[3], a[4], a[5])) if (this.touching(spec, q)) return true;
      return false;
    }

    // After removals: everything no longer connected to the ground collapses. Returns keys.
    unsupported(world) {
      const ok = new Set(), queue = [];
      for (const p of this.pieces.values()) if (this.grounded(p, world)) { ok.add(p.key); queue.push(p); }
      while (queue.length) {
        const p = queue.pop(), a = this.aabb(p);
        for (const q of this.near(a[0], a[1], a[2], a[3], a[4], a[5])) {
          if (!ok.has(q.key) && this.touching(p, q)) { ok.add(q.key); queue.push(q); }
        }
      }
      return [...this.pieces.keys()].filter((k) => !ok.has(k));
    }

    // ----- Health -----
    maxHp(p) { return Math.round(MATS[p.m].hp * (p.k === 'wall' ? 1 : 0.93)); }
    // Pieces start at 10% and grow to full while "building".
    progress(p) { return Math.min(1, (now() - p.born) / MATS[p.m].time); }
    hp(p) { return Math.max(0, Math.round(this.maxHp(p) * (0.1 + 0.9 * this.progress(p)) - p.dmg)); }

    // ----- Editing -----
    tiles(p) { return p.k === 'wall' ? 9 : 4; }
    // Tile under a ray during edit mode (ignores holes). null when off the piece.
    tileAt(p, o, d) {
      const x0 = p.x * W, z0 = p.z * W, b = this.by(p.y);
      let t, u, v;
      if (p.k === 'wall') {
        if (p.a === 'x') { if (Math.abs(d[2]) < 1e-6) return null; t = (z0 - o[2]) / d[2]; u = (o[0] + d[0] * t - x0) / W; }
        else { if (Math.abs(d[0]) < 1e-6) return null; t = (x0 - o[0]) / d[0]; u = (o[2] + d[2] * t - z0) / W; }
        v = (o[1] + d[1] * t - b) / H;
        if (t < 0 || u < 0 || u >= 1 || v < 0 || v >= 1) return null;
        return Math.floor(u * 3) + 3 * Math.floor(v * 3);
      }
      const py = p.k === 'floor' ? b : b + H / 2;
      if (Math.abs(d[1]) < 1e-6) return null;
      t = (py - o[1]) / d[1];
      u = (o[0] + d[0] * t - x0) / W; v = (o[2] + d[2] * t - z0) / W;
      if (t < 0 || u < 0 || u >= 1 || v < 0 || v >= 1) return null;
      return Math.floor(u * 2) + 2 * Math.floor(v * 2);
    }

    // Initial selection when entering edit mode.
    editSelection(p) {
      const s = new Set();
      if (p.k !== 'ramp') for (let t = 0; t < this.tiles(p); t++) if (p.e & (1 << t)) s.add(t);
      return s;
    }

    // Resulting {e, r} for a confirmed selection, or null when the edit is not valid.
    applyEdit(p, sel, order) {
      if (p.k === 'ramp') {
        if (order.length !== 2) return null;
        const [a, b] = order;
        const dx = (b & 1) - (a & 1), dz = (b >> 1) - (a >> 1);
        if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
        const r = DIRS.findIndex(([x, z]) => x === dx && z === dz);
        return { e: 0, r };
      }
      let mask = 0;
      for (const t of sel) mask |= 1 << t;
      if (p.k === 'wall' && mask === 511) return null;
      if (p.k === 'floor' && mask === 15) return null;
      return { e: mask, r: p.r };
    }

    // ----- Save / network -----
    static pack(p) { return [p.k, p.x, p.y, p.z, p.a || p.r || 0, p.e || 0, p.m, Math.round(p.dmg || 0), p.o || '']; }
    static unpack(a) {
      const p = { k: a[0], x: a[1], y: a[2], z: a[3], e: a[5], m: a[6], dmg: a[7], o: a[8] };
      if (p.k === 'wall') p.a = a[4]; else if (p.k === 'ramp') p.r = a[4];
      return p;
    }
    serialize() { return [...this.pieces.values()].map(World.pack); }
    load(list) {
      for (const a of list || []) {
        const p = World.unpack(a);
        p.born = now() - 60; // already built
        this.add(p);
      }
    }
  }

  function rayBox(o, d, b, maxT) {
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < b[i] || o[i] > b[i + 3]) return null; continue; }
      let a = (b[i] - o[i]) / d[i], c = (b[i + 3] - o[i]) / d[i];
      if (a > c) { const t = a; a = c; c = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      if (t0 > t1) return null;
    }
    return t0;
  }

  // ---------- Geometry ----------
  // Vertex layout matches the chunk shader: x, y, z, u, v, shade, sky, block.
  function tileRect(name) {
    const N = VC.ATLAS_TILES, t = VC.TILE_INDEX[name] || 0, e = 0.0004;
    const u = (t % N) / N, v = Math.floor(t / N) / N;
    return [u + e, v + e, u + 1 / N - e, v + 1 / N - e];
  }
  const shadeOf = (n) => n[0] * n[0] * 0.6 + n[2] * n[2] * 0.8 + n[1] * n[1] * (n[1] > 0 ? 1 : 0.5);

  class Geo {
    constructor() { this.a = new Float32Array(4096); this.n = 0; }
    ensure(k) { if ((this.n + k) * 8 > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, (this.n + k) * 8)); b.set(this.a); this.a = b; } }
    v(p, u, v, sh, L) { const a = this.a, o = this.n * 8; a[o] = p[0]; a[o + 1] = p[1]; a[o + 2] = p[2]; a[o + 3] = u; a[o + 4] = v; a[o + 5] = sh; a[o + 6] = L[0]; a[o + 7] = L[1]; this.n++; }
    tri(p0, p1, p2, t0, t1, t2, L) {
      this.ensure(3);
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n) || 1;
      const sh = shadeOf([n[0] / l, n[1] / l, n[2] / l]);
      this.v(p0, t0[0], t0[1], sh, L); this.v(p1, t1[0], t1[1], sh, L); this.v(p2, t2[0], t2[1], sh, L);
    }
    quad(p, uv, L) { this.tri(p[0], p[1], p[2], uv[0], uv[1], uv[2], L); this.tri(p[0], p[2], p[3], uv[0], uv[2], uv[3], L); }
    box(mn, mx, rect, L) {
      const [u0, v0, u1, v1] = rect, uv = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]];
      const X0 = mn[0], Y0 = mn[1], Z0 = mn[2], X1 = mx[0], Y1 = mx[1], Z1 = mx[2];
      this.quad([[X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1]], uv, L);
      this.quad([[X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0]], uv, L);
      this.quad([[X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0]], uv, L);
      this.quad([[X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1]], uv, L);
      this.quad([[X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1]], uv, L);
      this.quad([[X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0]], uv, L);
    }
    data() { return this.a.subarray(0, this.n * 8); }
  }

  const LIGHT = [1, 0];
  const BEAM = 0.28;

  // Wall/floor tiles plus a frame beam on every tile edge facing a hole or the outside.
  function gridGeo(g, bw, p, mat, light, opts) {
    const cols = p.k === 'wall' ? 3 : 2, rows = cols;
    const has = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !(p.e & (1 << (c + r * cols)));
    const tex = tileRect(MATS[mat].tex), frame = tileRect(MATS[mat].frame);
    const x0 = p.x * W, z0 = p.z * W, b = bw.by(p.y);
    // Maps tile-local (u along span, v up/along, w depth) to world boxes.
    const toBox = (u0, u1, v0, v1, w0, w1) => {
      if (p.k === 'wall' && p.a === 'x') return [[x0 + u0, b + v0, z0 + w0], [x0 + u1, b + v1, z0 + w1]];
      if (p.k === 'wall') return [[x0 + w0, b + v0, z0 + u0], [x0 + w1, b + v1, z0 + u1]];
      return [[x0 + u0, b + w0, z0 + v0], [x0 + u1, b + w1, z0 + v1]]; // floor: v is z, w is y
    };
    const span = W, tall = p.k === 'wall' ? H : W;
    const tw = span / cols, th = tall / rows;
    const d0 = p.k === 'wall' ? -WT / 2 : -FT, d1 = p.k === 'wall' ? WT / 2 : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (opts && opts.all ? false : !has(c, r)) continue;
      const u0 = c * tw, u1 = u0 + tw, v0 = r * th, v1 = v0 + th;
      if (opts && opts.overlay) {
        const sel = opts.sel.has(c + r * cols);
        if (sel !== opts.selected) continue;
        const [mn, mx] = toBox(u0 + 0.04, u1 - 0.04, v0 + 0.04, v1 - 0.04, d0 - 0.06, d1 + 0.06);
        g.box(mn, mx, tileRect('build_white'), light);
        continue;
      }
      const [mn, mx] = toBox(u0, u1, v0, v1, d0, d1);
      g.box(mn, mx, tex, light);
      // Frame beams, slightly proud of the panel.
      const e0 = d0 - 0.05, e1 = d1 + 0.05;
      if (!has(c - 1, r)) { const [a, z] = toBox(u0, u0 + BEAM, v0, v1, e0, e1); g.box(a, z, frame, light); }
      if (!has(c + 1, r)) { const [a, z] = toBox(u1 - BEAM, u1, v0, v1, e0, e1); g.box(a, z, frame, light); }
      if (!has(c, r - 1)) { const [a, z] = toBox(u0, u1, v0, v0 + BEAM, e0, e1); g.box(a, z, frame, light); }
      if (!has(c, r + 1)) { const [a, z] = toBox(u0, u1, v1 - BEAM, v1, e0, e1); g.box(a, z, frame, light); }
    }
  }

  // Ramp / cone: textured top and bottom surfaces + side skirts, from the heightfield.
  function slopeGeo(g, bw, p, mat, light, opts) {
    const h = bw.heights(p), x0 = p.x * W, z0 = p.z * W, b = bw.by(p.y);
    const rect = tileRect(opts && opts.overlay ? 'build_white' : MATS[mat].tex);
    const lift = opts && opts.overlay ? 0.08 : 0;
    const P = (i, j, dy) => [x0 + i * W / 2, b + h[i][j] * H + dy + lift, z0 + j * W / 2];
    const T = (a, c) => [rect[0] + a * (rect[2] - rect[0]), rect[1] + c * (rect[3] - rect[1])];
    for (let q = 0; q < 4; q++) {
      const qi = q & 1, qj = q >> 1;
      if (opts && opts.overlay && opts.sel.has(q) !== opts.selected) continue;
      const i0 = qi, j0 = qj, i1 = qi + 1, j1 = qj + 1;
      const main = (1 - qi) === (1 - qj); // diagonal through the centre: (i0,j0)-(i1,j1)
      for (const dy of opts && opts.overlay ? [0] : [0, -ST]) {
        const a = P(i0, j0, dy), bq = P(i1, j0, dy), c = P(i1, j1, dy), d = P(i0, j1, dy);
        if (main) { g.tri(a, bq, c, T(0, 0), T(1, 0), T(1, 1), light); g.tri(a, c, d, T(0, 0), T(1, 1), T(0, 1), light); }
        else { g.tri(a, bq, d, T(0, 0), T(1, 0), T(0, 1), light); g.tri(c, d, bq, T(1, 1), T(0, 1), T(1, 0), light); }
      }
    }
    if (opts && opts.overlay) return;
    // Skirts along the outer edge so the slab has visible thickness.
    const frame = tileRect(MATS[mat].frame), F = (a, c) => [frame[0] + a * (frame[2] - frame[0]), frame[1] + c * (frame[3] - frame[1])];
    const edge = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]];
    for (let k = 0; k < 8; k++) {
      const [i0, j0] = edge[k], [i1, j1] = edge[k + 1];
      g.quad([P(i0, j0, -ST), P(i1, j1, -ST), P(i1, j1, 0), P(i0, j0, 0)], [F(0, 1), F(1, 1), F(1, 0), F(0, 0)], light);
    }
  }

  // Geometry of a piece (cached on the piece unless opts are given).
  function geometry(bw, p, opts) {
    if (!opts && p.geo) return p.geo;
    const g = new Geo(), mat = opts && opts.mat !== undefined ? opts.mat : p.m;
    const light = opts && opts.light ? opts.light : LIGHT;
    if (p.k === 'wall' || p.k === 'floor') gridGeo(g, bw, p, mat, light, opts);
    else slopeGeo(g, bw, p, mat, light, opts);
    const data = g.data().slice();
    if (!opts) p.geo = data;
    return data;
  }

  return { World, geometry, keyOf, W, H, KINDS, KIND_NAMES, MATS, DIRS };
})();
