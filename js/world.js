'use strict';

VC.Chunk = class {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = new Uint16Array(16 * 16 * VC.CH);
    this.sky = new Uint8Array(16 * 16 * VC.CH);
    this.blk = new Uint8Array(16 * 16 * VC.CH);
    this.top = 0; // highest non-air y (only grows); lets light and meshing skip empty sky
    this.dirty = true;
    this.lightDirty = true;
    this.mesh = null;
  }
};

VC.World = class {
  constructor(seed, savedEdits, opts = {}) {
    this.seed = seed;
    this.nether = !!opts.nether;
    this.hasSky = !this.nether;
    const mini = !this.nether && opts.type && VC.Minigames && VC.Minigames.TYPES[opts.type];
    this.gen = this.nether ? new VC.NetherGenerator(seed) : mini ? new mini.Generator(seed) : new VC.Generator(seed);
    this.chunks = new Map();
    this.edits = new Map(); // chunkKey -> Map(localIndex -> state)
    if (savedEdits) for (const k in savedEdits) this.edits.set(k, new Map(savedEdits[k]));
    this.queue = new Int32Array(1 << 19);
    this.waterQ = new Set();
    this.lavaQ = new Set();
    this.updateQ = new Set();
    // Hooks set by the game: falling blocks, block drops when support is lost.
    this.onFall = null;
    this.onBreak = null;
  }

  key(cx, cz) { return cx + ',' + cz; }
  getChunk(cx, cz) { return this.chunks.get(cx + ',' + cz); }

  generateChunk(cx, cz) {
    const ch = new VC.Chunk(cx, cz);
    this.gen.generate(ch);
    const e = this.edits.get(this.key(cx, cz));
    if (e) for (const [i, id] of e) ch.blocks[i] = id;
    let i = ch.blocks.length - 1;
    while (i > 0 && !ch.blocks[i]) i--;
    ch.top = i >> 8;
    this.chunks.set(this.key(cx, cz), ch);
    this.computeLight(ch);
    ch.lightDirty = true;
    return ch;
  }

  neighborsReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++)
        if (!this.chunks.has((cx + dx) + ',' + (cz + dz))) return false;
    return true;
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= VC.CH) return 0;
    const ch = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!ch) return 0;
    return ch.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getSky(x, y, z) {
    if (y >= VC.CH) return 15;
    if (y < 0) return 0;
    const ch = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!ch) return 15;
    return ch.sky[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  getBlockLight(x, y, z) {
    if (y >= VC.CH || y < 0) return 0;
    const ch = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!ch) return 0;
    return ch.blk[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }

  // Changes a block, records the edit and returns the chunks needing a remesh.
  setBlock(x, y, z, id) {
    if (y < 0 || y >= VC.CH) return [];
    const cx = x >> 4, cz = z >> 4, k = this.key(cx, cz);
    const ch = this.chunks.get(k);
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    let e = this.edits.get(k);
    if (!ch) {
      // Not loaded (multiplayer: someone else's area): keep the edit for when it generates.
      if (!e) { e = new Map(); this.edits.set(k, e); }
      if (e.get(i) === id) return [];
      e.set(i, id);
      if (this.onSet && !this.silent) this.onSet(x, y, z, id);
      return [];
    }
    const old = ch.blocks[i];
    if (old === id) return [];
    ch.blocks[i] = id;
    if (id && y > ch.top) ch.top = y;
    if (!e) { e = new Map(); this.edits.set(k, e); }
    e.set(i, id);
    if (this.onSet && !this.silent) this.onSet(x, y, z, id);

    const P = VC.BP;
    const lightChange = P.light[old] !== P.light[id];
    const out = [ch];
    const lx = x & 15, lz = z & 15;
    if (lightChange) {
      // Block light reaches 14 blocks: refresh all neighbours.
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const n = this.getChunk(cx + dx, cz + dz);
        if (n) out.push(n);
      }
    } else {
      const ox = lx === 0 ? -1 : lx === 15 ? 1 : 0;
      const oz = lz === 0 ? -1 : lz === 15 ? 1 : 0;
      const add = (dx, dz) => { const n = this.getChunk(cx + dx, cz + dz); if (n) out.push(n); };
      if (ox) add(ox, 0);
      if (oz) add(0, oz);
      if (ox && oz) add(ox, oz);
    }
    for (const c of out) { c.dirty = true; c.lightDirty = true; }
    this.scheduleAround(x, y, z);
    return out;
  }

  scheduleAround(x, y, z) {
    const pts = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of pts) {
      const s = this.getBlock(x + dx, y + dy, z + dz), k = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
      if (VC.isWater(s)) this.waterQ.add(k);
      else if (VC.isLava(s)) this.lavaQ.add(k);
      if (s) this.updateQ.add(k);
    }
  }

  canFlowInto(s) { return s === 0 || (VC.BP.replaceable[s] === 1 && !VC.BP.liquid[s]) || VC.BP.cross[s] === 1 && VC.BP.hardness[s] === 0; }

  // Liquid tick. Water spreads 7 blocks, lava 3. Lava meeting water turns to stone.
  tickLiquids(lava, max) {
    const Q = lava ? this.lavaQ : this.waterQ;
    if (!Q.size) return 0;
    const list = [];
    for (const k of Q) { list.push(k); if (list.length >= max) break; }
    for (const k of list) Q.delete(k);
    const lvl = lava ? VC.lavaLevel : VC.waterLevel, mk = lava ? VC.lavaId : VC.waterId;
    const other = lava ? VC.isWater : VC.isLava;
    const step = lava && !this.nether ? 2 : 1, maxL = 7;
    const P = VC.BP, B = VC.B;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const k of list) {
      const [x, y, z] = k.split(',').map(Number);
      if (!this.getChunk(x >> 4, z >> 4)) continue;
      let L = lvl(this.getBlock(x, y, z));
      if (L < 0) continue;

      // Lava touching water hardens.
      if (lava) {
        let touch = VC.isWater(this.getBlock(x, y + 1, z));
        for (const [dx, dz] of DIRS) if (VC.isWater(this.getBlock(x + dx, y, z + dz))) touch = true;
        if (touch) { this.setBlock(x, y, z, L === 0 ? B.OBSIDIAN : B.COBBLE); this.onFizz && this.onFizz(x, y, z); continue; }
      }

      if (L > 0) {
        let nl;
        if (lvl(this.getBlock(x, y + 1, z)) >= 0) nl = 1;
        else {
          let min = 99, sources = 0;
          for (const [dx, dz] of DIRS) {
            const n = lvl(this.getBlock(x + dx, y, z + dz));
            if (n >= 0) { if (n === 0) sources++; if (n < min) min = n; }
          }
          nl = min + step;
          const below = this.getBlock(x, y - 1, z);
          if (!lava && sources >= 2 && (P.solid[below] || lvl(below) === 0)) nl = 0;
        }
        if (nl > maxL) { this.setBlock(x, y, z, 0); continue; }
        if (nl !== L) { this.setBlock(x, y, z, mk(nl)); L = nl; }
      }

      const below = y > 0 ? this.getBlock(x, y - 1, z) : -1;
      if (below >= 0 && other(below)) {
        // Flowing onto the other liquid.
        if (lava) this.setBlock(x, y - 1, z, B.STONE);
        else this.setBlock(x, y - 1, z, VC.lavaLevel(below) === 0 ? B.OBSIDIAN : B.COBBLE);
        continue;
      }
      if (below >= 0 && this.canFlowInto(below)) {
        if (below && P.drop[below] !== undefined && this.onBreak) this.onBreak(x, y - 1, z, below, true);
        this.setBlock(x, y - 1, z, mk(1));
        continue;
      }
      const lb = lvl(below);
      if (lb > 1) { this.setBlock(x, y - 1, z, mk(1)); continue; }
      if (lb >= 0 && L !== 0) continue;
      if (L + step > maxL) continue;
      for (const [dx, dz] of DIRS) {
        const n = this.getBlock(x + dx, y, z + dz);
        const nl = lvl(n);
        if (other(n)) {
          if (!lava) this.setBlock(x + dx, y, z + dz, VC.lavaLevel(n) === 0 ? B.OBSIDIAN : B.COBBLE);
          continue;
        }
        if (this.canFlowInto(n)) {
          if (n && this.onBreak) this.onBreak(x + dx, y, z + dz, n, true);
          this.setBlock(x + dx, y, z + dz, mk(L + step));
        } else if (nl > L + step) this.setBlock(x + dx, y, z + dz, mk(L + step));
      }
    }
    return list.length;
  }

  // Block updates: gravity (sand, gravel) and blocks that need support.
  tickUpdates(max) {
    if (!this.updateQ.size) return;
    const list = [];
    for (const k of this.updateQ) { list.push(k); if (list.length >= max) break; }
    for (const k of list) this.updateQ.delete(k);
    const P = VC.BP, S = VC.SHAPE;
    for (const k of list) {
      const [x, y, z] = k.split(',').map(Number);
      const s = this.getBlock(x, y, z);
      if (!s) continue;
      const below = this.getBlock(x, y - 1, z);
      if (P.gravity[s]) {
        if (y > 0 && (below === 0 || P.liquid[below] || (P.replaceable[below] && !P.solid[below]) || (P.cross[below] && P.hardness[below] === 0))) {
          this.setBlock(x, y, z, 0);
          if (this.onFall) this.onFall(x, y, z, s);
        }
        continue;
      }
      if (!this.supported(x, y, z, s, below)) {
        if (this.onBreak) this.onBreak(x, y, z, s, true);
        this.setBlock(x, y, z, 0);
      }
    }
  }

  supported(x, y, z, s, below) {
    const P = VC.BP, S = VC.SHAPE, sh = P.shape[s], id = s >> 4, m = s & 15;
    const solidBelow = P.opaque[below] || P.shape[below] === S.slab || P.shape[below] === S.stairs || (below >> 4) === 60 || P.solid[below] && P.shape[below] !== S.cross;
    const wall = (f) => { const [dx, dz] = VC.FACING_DIR[f & 3]; return P.opaque[this.getBlock(x + dx, y, z + dz)] === 1; };
    switch (sh) {
      case S.portal: return VC.Portal.supported(this, x, y, z, s);
      case S.cross:
        if (id === 175) return (m & 8) ? this.getBlock(x, y - 1, z) >> 4 === 175 : (this.getBlock(x, y + 1, z) >> 4) === 175 && solidBelow;
        if (id === 83) return below === s || [2, 3, 12].includes(below >> 4);
        if (id === 30) return true;
        return solidBelow;
      case S.crop: return (below >> 4) === (id === 115 ? 88 : 60);
      case S.torch: return (m === 0 || m === 5) ? solidBelow : wall((m - 1) & 3);
      case S.button: return wall((m - 1) & 3);
      case S.lever: return (m === 0 || m === 8) ? solidBelow : wall((m - 1) & 3);
      case S.ladder: return wall(m & 3);
      case S.wallsign: return wall(m & 3);
      case S.door: {
        if (m & 8) return (this.getBlock(x, y - 1, z) >> 4) === id;
        return (this.getBlock(x, y + 1, z) >> 4) === id && solidBelow;
      }
      case S.bed: {
        const [dx, dz] = VC.FACING_DIR[m & 3];
        const sgn = (m & 8) ? -1 : 1;
        return (this.getBlock(x + dx * sgn, y, z + dz * sgn) >> 4) === 26;
      }
      case S.rail: case S.dust: case S.carpet: case S.plate: case S.pot: case S.cake: case S.brewing: case S.snow: case S.sign: case S.skull:
        return P.solid[below] === 1 || P.opaque[below] === 1;
      case S.lilypad: return VC.waterLevel(below) === 0;
      case S.cactus: return below === s || (below >> 4) === 12;
      default: return true;
    }
  }

  // Random block ticks for growth (called a few times per second).
  randomTicks(cx, cz, n, rng) {
    const ch = this.getChunk(cx, cz);
    if (!ch) return;
    const P = VC.BP, B = VC.B;
    for (let i = 0; i < n; i++) {
      const lx = Math.floor(rng() * 16), lz = Math.floor(rng() * 16), y = Math.floor(rng() * (ch.top + 1));
      const s = ch.blocks[(y << 8) | (lz << 4) | lx];
      if (!s) continue;
      const x = cx * 16 + lx, z = cz * 16 + lz, id = s >> 4, m = s & 15;
      const light = Math.max(this.getSky(x, y + 1, z), this.getBlockLight(x, y + 1, z));
      if ((id === 59 || id === 141 || id === 142) && m < 7 && light >= 9) {
        const wet = (this.getBlock(x, y - 1, z) & 15) > 0;
        if (rng() < (wet ? 0.35 : 0.18)) this.setBlock(x, y, z, (id << 4) | (m + 1));
      } else if (id === 115 && m < 3 && rng() < 0.15) this.setBlock(x, y, z, (id << 4) | (m + 1));
      else if (id === 6 && light >= 9 && rng() < 0.15) this.growTree(x, y, z, m & 7);
      else if (id === 2) {
        if (P.opaque[this.getBlock(x, y + 1, z)]) this.setBlock(x, y, z, B.DIRT);
        else {
          const tx = x + Math.floor(rng() * 3) - 1, ty = y + Math.floor(rng() * 5) - 3, tz = z + Math.floor(rng() * 3) - 1;
          if (this.getBlock(tx, ty, tz) === B.DIRT && !P.opaque[this.getBlock(tx, ty + 1, tz)] && this.getSky(tx, ty + 1, tz) >= 4) this.setBlock(tx, ty, tz, B.GRASS);
        }
      } else if (id === 60) {
        let wet = false;
        for (let dz = -4; dz <= 4 && !wet; dz++) for (let dx = -4; dx <= 4 && !wet; dx++) for (let dy = 0; dy <= 1; dy++) if (VC.isWater(this.getBlock(x + dx, y + dy, z + dz))) { wet = true; break; }
        if (wet && m === 0) this.setBlock(x, y, z, VC.st(60, 7));
        else if (!wet && m > 0) this.setBlock(x, y, z, VC.st(60, 0));
      } else if ((id === 83 || id === 81) && this.getBlock(x, y + 1, z) === 0) {
        let h = 1;
        while (h < 3 && this.getBlock(x, y - h, z) === s) h++;
        if (h < 3 && rng() < 0.2) this.setBlock(x, y + 1, z, s);
      } else if (id === 51) {
        // Fire burns out and spreads to flammable neighbours.
        const base = this.getBlock(x, y - 1, z) >> 4;
        if (base !== 87 && rng() < 0.4) this.setBlock(x, y, z, 0);
        const FLAM = [5, 17, 162, 18, 161, 35, 47, 85, 53, 46, 31, 126, 171, 170];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const n = this.getBlock(x + dx, y + dy, z + dz);
          if (FLAM.includes(n >> 4) && rng() < 0.25) {
            if ((n >> 4) === 46 && this.onIgnite) { this.setBlock(x + dx, y + dy, z + dz, 0); this.onIgnite(x + dx, y + dy, z + dz); }
            else this.setBlock(x + dx, y + dy, z + dz, rng() < 0.5 ? B.FIRE : 0);
          }
        }
      } else if (id === 74 && rng() < 0.3) this.setBlock(x, y, z, VC.st(73));
      else if ((id === 78 || id === 79) && this.getBlockLight(x, y, z) > 11) this.setBlock(x, y, z, id === 79 ? B.WATER : 0);
    }
  }

  growTree(x, y, z, wood) {
    const B = VC.B, P = VC.BP;
    const trunk = wood < 4 ? VC.st(17, wood) : VC.st(162, wood - 4);
    const leaf = wood < 4 ? VC.st(18, wood) : VC.st(161, wood - 4);
    const h = (wood === 1 ? 6 : 4) + Math.floor(Math.random() * 3);
    for (let i = 1; i <= h + 1; i++) if (this.getBlock(x, y + i, z) && !P.replaceable[this.getBlock(x, y + i, z)] && (this.getBlock(x, y + i, z) >> 4) !== 18) return;
    const put = (bx, by, bz, s) => { const c = this.getBlock(bx, by, bz); if (c === 0 || P.replaceable[c] || P.cross[c]) this.setBlock(bx, by, bz, s); };
    if (wood === 1) {
      for (let ly = y + 2; ly <= y + h + 1; ly++) {
        const r = Math.max(0, Math.round((y + h + 1 - ly) / 2)) % 3;
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dz) <= r + 1) put(x + dx, ly, z + dz, leaf);
      }
    } else {
      const top = y + h;
      for (let ly = top - 2; ly <= top + 1; ly++) {
        const rad = ly <= top - 1 ? 2 : 1;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (ly === top + 1 || Math.random() < 0.5)) continue;
          put(x + dx, ly, z + dz, leaf);
        }
      }
    }
    this.setBlock(x, y, z, trunk);
    for (let i = 1; i < h; i++) this.setBlock(x, y + i, z, trunk);
    if (this.getBlock(x, y - 1, z) === B.GRASS) this.setBlock(x, y - 1, z, B.DIRT);
  }

  // Sky + block light: straight sky columns, emitters, then BFS flood fill
  // seeded from already-lit neighbour borders.
  computeLight(ch) {
    this.floodLight(ch, true);
    this.floodLight(ch, false);
    ch.lightDirty = false;
  }

  floodLight(ch, skyMode) {
    const Bk = ch.blocks, L = skyMode ? ch.sky : ch.blk, P = VC.BP, q = this.queue, MASK = q.length - 1;
    const opaque = P.opaque, atten = P.atten, emit = P.light;
    let head = 0, tail = 0;
    L.fill(0);
    if (skyMode && !this.hasSky) return;
    // Everything above the highest block is open sky: full light, nothing to spread.
    const lim = Math.min(VC.CH - 1, ch.top + 1);
    if (skyMode) {
      L.fill(15, (lim + 1) << 8);
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        let l = 15;
        for (let y = lim; y >= 0; y--) {
          const i = (y << 8) | (z << 4) | x, id = Bk[i];
          if (id) {
            if (opaque[id]) break;
            l -= atten[id];
            if (l <= 0) break;
          }
          L[i] = l;
          if (l > 1) { q[tail] = i; tail = (tail + 1) & MASK; }
        }
      }
    } else {
      for (let i = 0; i < Bk.length; i++) {
        const e = emit[Bk[i]];
        if (e) { L[i] = e; q[tail] = i; tail = (tail + 1) & MASK; }
      }
    }
    const seed = (nb, getLocal, getRemote) => {
      if (!nb) return;
      const NL = skyMode ? nb.sky : nb.blk;
      const yMax = skyMode ? lim : VC.CH - 1;
      for (let y = 0; y <= yMax; y++) {
        for (let t = 0; t < 16; t++) {
          const i = getLocal(y, t), id = Bk[i];
          if (opaque[id]) continue;
          const nl = NL[getRemote(y, t)] - 1 - atten[id];
          if (nl > L[i]) { L[i] = nl; q[tail] = i; tail = (tail + 1) & MASK; }
        }
      }
    };
    seed(this.getChunk(ch.cx - 1, ch.cz), (y, t) => (y << 8) | (t << 4), (y, t) => (y << 8) | (t << 4) | 15);
    seed(this.getChunk(ch.cx + 1, ch.cz), (y, t) => (y << 8) | (t << 4) | 15, (y, t) => (y << 8) | (t << 4));
    seed(this.getChunk(ch.cx, ch.cz - 1), (y, t) => (y << 8) | t, (y, t) => (y << 8) | (15 << 4) | t);
    seed(this.getChunk(ch.cx, ch.cz + 1), (y, t) => (y << 8) | (15 << 4) | t, (y, t) => (y << 8) | t);

    while (head !== tail) {
      const i = q[head]; head = (head + 1) & MASK;
      const l = L[i];
      if (l <= 1) continue;
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      for (let n = 0; n < 6; n++) {
        let j;
        switch (n) {
          case 0: if (x === 0) continue; j = i - 1; break;
          case 1: if (x === 15) continue; j = i + 1; break;
          case 2: if (z === 0) continue; j = i - 16; break;
          case 3: if (z === 15) continue; j = i + 16; break;
          case 4: if (y === 0) continue; j = i - 256; break;
          default: if (y === VC.CH - 1) continue; j = i + 256;
        }
        const id = Bk[j];
        if (opaque[id]) continue;
        const nl = l - 1 - atten[id];
        if (nl > L[j]) { L[j] = nl; q[tail] = j; tail = (tail + 1) & MASK; }
      }
    }
  }

  // World-space collision boxes overlapping a region.
  collisionBoxes(x0, y0, z0, x1, y1, z1, out) {
    const P = VC.BP;
    out.length = 0;
    for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++)
      for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
        for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
          const s = this.getBlock(x, y, z);
          if (!s || !P.solid[s]) continue;
          if (P.shape[s] === VC.SHAPE.cube) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
          const bs = VC.Shapes.collision(s, (dx, dy, dz) => this.getBlock(x + dx, y + dy, z + dz));
          if (bs) for (const b of bs) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
        }
    return out;
  }

  // Ray vs voxels with shaped blocks. hitLiquid also stops at liquid sources.
  raycast(o, d, maxDist, hitLiquid) {
    const P = VC.BP;
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const sx = d[0] > 0 ? 1 : -1, sy = d[1] > 0 ? 1 : -1, sz = d[2] > 0 ? 1 : -1;
    const tdx = d[0] !== 0 ? Math.abs(1 / d[0]) : Infinity;
    const tdy = d[1] !== 0 ? Math.abs(1 / d[1]) : Infinity;
    const tdz = d[2] !== 0 ? Math.abs(1 / d[2]) : Infinity;
    let tmx = d[0] !== 0 ? (sx > 0 ? x + 1 - o[0] : o[0] - x) * tdx : Infinity;
    let tmy = d[1] !== 0 ? (sy > 0 ? y + 1 - o[1] : o[1] - y) * tdy : Infinity;
    let tmz = d[2] !== 0 ? (sz > 0 ? z + 1 - o[2] : o[2] - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 80; i++) {
      const id = this.getBlock(x, y, z);
      if (id) {
        let hit = null;
        if (P.liquid[id]) {
          if (hitLiquid && (id & 7) === 0) hit = { t, nx, ny, nz };
        } else if (P.shape[id] === VC.SHAPE.cube) hit = { t, nx, ny, nz };
        else {
          const boxes = VC.Shapes.selection(id, (dx, dy, dz) => this.getBlock(x + dx, y + dy, z + dz));
          for (const b of boxes) {
            const r = this.rayBox(o, d, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
            if (r && (!hit || r.t < hit.t)) hit = r;
          }
        }
        if (hit && hit.t <= maxDist) {
          return { x, y, z, id, nx: hit.nx, ny: hit.ny, nz: hit.nz, t: hit.t, px: o[0] + d[0] * hit.t, py: o[1] + d[1] * hit.t, pz: o[2] + d[2] * hit.t };
        }
      }
      if (tmx < tmy && tmx < tmz) {
        if (tmx > maxDist) break;
        t = tmx; x += sx; tmx += tdx; nx = -sx; ny = 0; nz = 0;
      } else if (tmy < tmz) {
        if (tmy > maxDist) break;
        t = tmy; y += sy; tmy += tdy; nx = 0; ny = -sy; nz = 0;
      } else {
        if (tmz > maxDist) break;
        t = tmz; z += sz; tmz += tdz; nx = 0; ny = 0; nz = -sz;
      }
    }
    return null;
  }

  rayBox(o, d, x0, y0, z0, x1, y1, z1) {
    let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
    const mn = [x0, y0, z0], mx = [x1, y1, z1];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i], s = -1;
      if (a > b) { const tt = a; a = b; b = tt; s = 1; }
      if (a > tmin) { tmin = a; axis = i; sign = s; }
      tmax = Math.min(tmax, b);
      if (tmin > tmax) return null;
    }
    if (tmax < 0) return null;
    const t = Math.max(0, tmin);
    const n = [0, 0, 0];
    if (axis >= 0) n[axis] = sign;
    return { t, nx: n[0], ny: n[1], nz: n[2] };
  }

  lineOfSight(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const dist = Math.hypot(dx, dy, dz), n = Math.ceil(dist / 0.3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (VC.BP.opaque[this.getBlock(Math.floor(a[0] + dx * t), Math.floor(a[1] + dy * t), Math.floor(a[2] + dz * t))]) return false;
    }
    return true;
  }

  flowAt(x, y, z) {
    const s = this.getBlock(x, y, z);
    const lvl = VC.isLava(s) ? VC.lavaLevel : VC.waterLevel;
    const L = lvl(s);
    if (L < 0) return [0, 0];
    let fx = 0, fz = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.getBlock(x + dx, y, z + dz), nl = lvl(n);
      if (nl >= 0) { fx += dx * (nl - L); fz += dz * (nl - L); }
      else if (this.canFlowInto(n) && this.canFlowInto(this.getBlock(x + dx, y - 1, z + dz))) { fx += dx * 4; fz += dz * 4; }
    }
    const l = Math.hypot(fx, fz);
    return l > 0 ? [fx / l, fz / l] : [0, 0];
  }

  serializeEdits() {
    const o = {};
    for (const [k, m] of this.edits) if (m.size) o[k] = Array.from(m.entries());
    return o;
  }
};
