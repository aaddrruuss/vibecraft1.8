'use strict';

// ---------- Nether terrain ----------
// 3D density sampled on a coarse 4x8x4 grid and trilinearly interpolated (like MC),
// giving big caverns, a lava sea at y <= 31 and bedrock floor + ceiling.
VC.NetherGenerator = class {
  constructor(seed) {
    this.seed = seed | 0;
    this.n1 = new VC.Noise(seed + 501);
    this.n2 = new VC.Noise(seed + 502);
    this.n3 = new VC.Noise(seed + 503);
    this.n4 = new VC.Noise(seed + 504);
  }

  hash(x, z, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul((this.seed + s * 7919) | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Not used for the nether, kept for API compatibility (spawn search, F3).
  column() { return { h: 64, biome: VC.BIOME.NETHER }; }

  density(x, y, z) {
    const a = this.n1.noise3(x / 48, y / 26, z / 48) + this.n2.noise3(x / 16, y / 12, z / 16) * 0.45;
    // Force solid near floor and ceiling.
    const edge = y < 24 ? (24 - y) / 10 : y > 104 ? (y - 104) / 10 : 0;
    return a + edge - 0.08;
  }

  generate(ch) {
    const Bk = ch.blocks, bx = ch.cx * 16, bz = ch.cz * 16, B = VC.B, st = VC.st;
    const I = (x, y, z) => (y << 8) | (z << 4) | x;
    const NETHERRACK = st(87), LAVA = B.LAVA, BEDROCK = B.BEDROCK;
    // Density grid: 5 x 17 x 5 samples (every 4 blocks horizontally, 8 vertically).
    const G = new Float32Array(5 * 17 * 5);
    for (let gz = 0; gz < 5; gz++) for (let gy = 0; gy < 17; gy++) for (let gx = 0; gx < 5; gx++)
      G[(gz * 17 + gy) * 5 + gx] = this.density(bx + gx * 4, gy * 8, bz + gz * 4);
    const g = (gx, gy, gz) => G[(gz * 17 + gy) * 5 + gx];
    for (let z = 0; z < 16; z++) {
      const gz = z >> 2, tz = (z & 3) / 4;
      for (let x = 0; x < 16; x++) {
        const gx = x >> 2, tx = (x & 3) / 4;
        for (let y = 0; y < 128; y++) {
          const gy = Math.min(15, y >> 3), ty = (y - gy * 8) / 8;
          const l = (a, b, t) => a + (b - a) * t;
          const d = l(
            l(l(g(gx, gy, gz), g(gx + 1, gy, gz), tx), l(g(gx, gy + 1, gz), g(gx + 1, gy + 1, gz), tx), ty),
            l(l(g(gx, gy, gz + 1), g(gx + 1, gy, gz + 1), tx), l(g(gx, gy + 1, gz + 1), g(gx + 1, gy + 1, gz + 1), tx), ty), tz);
          let id = d > 0 ? NETHERRACK : y <= 31 ? LAVA : 0;
          const wx = bx + x, wz = bz + z;
          if (y === 0 || y === 127) id = BEDROCK;
          else if (y < 5 && this.hash(wx, wz, 600 + y) < (5 - y) * 0.2) id = BEDROCK;
          else if (y > 122 && this.hash(wx, wz, 700 + y) < (y - 122) * 0.2) id = BEDROCK;
          Bk[I(x, y, z)] = id;
        }
      }
    }

    // Surface patches: soul sand and gravel near the lava sea.
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = bx + x, wz = bz + z;
      const ss = this.n3.noise2(wx / 14, wz / 14) > 0.18;
      const gr = this.n4.noise2(wx / 12 + 40, wz / 12) > 0.25;
      for (let y = 26; y < 44; y++) {
        const i = I(x, y, z);
        if (Bk[i] !== NETHERRACK || Bk[I(x, y + 1, z)] !== 0) continue;
        for (let k = 0; k < 3 && y - k > 0; k++) {
          const j = I(x, y - k, z);
          if (Bk[j] === NETHERRACK) Bk[j] = ss ? B.SOUL_SAND : gr ? B.GRAVEL : NETHERRACK;
        }
      }
    }

    const rng = VC.rng((this.hash(ch.cx, ch.cz, 911) * 4294967296) | 0);
    // Quartz ore veins.
    for (let n = 0; n < 16; n++) {
      let x = Math.floor(rng() * 16), y = 10 + Math.floor(rng() * 108), z = Math.floor(rng() * 16);
      for (let k = 0; k < 7; k++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < 127 && Bk[I(x, y, z)] === NETHERRACK) Bk[I(x, y, z)] = B.QUARTZ_ORE;
        const r = rng();
        if (r < 0.33) x += rng() < 0.5 ? 1 : -1; else if (r < 0.66) z += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1;
      }
    }
    // Glowstone clusters hanging from ceilings.
    for (let n = 0; n < 2; n++) {
      const x0 = 2 + Math.floor(rng() * 12), z0 = 2 + Math.floor(rng() * 12);
      let y0 = 120;
      while (y0 > 40 && !(Bk[I(x0, y0, z0)] === NETHERRACK && Bk[I(x0, y0 - 1, z0)] === 0)) y0--;
      if (y0 <= 40) continue;
      for (let k = 0; k < 60; k++) {
        const x = x0 + Math.floor(rng() * 5) - 2, y = y0 - 1 - Math.floor(rng() * 6), z = z0 + Math.floor(rng() * 5) - 2;
        if (x < 0 || x > 15 || z < 0 || z > 15 || Bk[I(x, y, z)] !== 0) continue;
        const touching = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => {
          const nx = x + dx, nz = z + dz;
          return nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && (Bk[I(nx, y + dy, nz)] === B.GLOWSTONE || (dy === 1 && Bk[I(nx, y + dy, nz)] === NETHERRACK));
        });
        if (touching) Bk[I(x, y, z)] = B.GLOWSTONE;
      }
    }
    // Fire and mushrooms on floors.
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(rng() * 16), z = Math.floor(rng() * 16);
      for (let y = 33; y < 120; y++) {
        if (Bk[I(x, y, z)] === NETHERRACK && Bk[I(x, y + 1, z)] === 0) {
          Bk[I(x, y + 1, z)] = n < 2 ? B.FIRE : rng() < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM;
          break;
        }
      }
    }
  }
};
VC.BIOME.NETHER = 7;
VC.BIOME_NAMES[7] = 'Infierno';

// ---------- Nether portals ----------
VC.Portal = (function () {
  const OBS = () => VC.st(49);
  const isObs = (w, x, y, z) => w.getBlock(x, y, z) === OBS();
  const inside = (s) => s === 0 || (s >> 4) === 51 || (s >> 4) === 90;

  // Try to light a portal whose interior contains (x, y, z). Returns true if lit.
  function tryLight(w, x, y, z) {
    for (const axis of [1, 2]) {
      const dx = axis === 1 ? 1 : 0, dz = axis === 2 ? 1 : 0;
      // Walk down to the frame bottom.
      let by = y;
      while (by > 0 && inside(w.getBlock(x, by - 1, z)) && y - by < 21) by--;
      if (!isObs(w, x, by - 1, z)) continue;
      // Walk to the left edge.
      let lx = x, lz = z, n = 0;
      while (inside(w.getBlock(lx - dx, by, lz - dz)) && n++ < 21) { lx -= dx; lz -= dz; }
      if (!isObs(w, lx - dx, by, lz - dz)) continue;
      // Width
      let width = 0;
      while (inside(w.getBlock(lx + dx * width, by, lz + dz * width)) && width < 22) width++;
      if (width < 2 || width > 21 || !isObs(w, lx + dx * width, by, lz + dz * width)) continue;
      // Height
      let height = 0;
      while (inside(w.getBlock(lx, by + height, lz)) && height < 22) height++;
      if (height < 3 || height > 21) continue;
      let ok = true;
      for (let i = 0; i < width && ok; i++) {
        if (!isObs(w, lx + dx * i, by - 1, lz + dz * i) || !isObs(w, lx + dx * i, by + height, lz + dz * i)) ok = false;
        for (let h = 0; h < height && ok; h++) if (!inside(w.getBlock(lx + dx * i, by + h, lz + dz * i))) ok = false;
      }
      for (let h = 0; h < height && ok; h++) {
        if (!isObs(w, lx - dx, by + h, lz - dz) || !isObs(w, lx + dx * width, by + h, lz + dz * width)) ok = false;
      }
      if (!ok) continue;
      const cells = [];
      for (let i = 0; i < width; i++) for (let h = 0; h < height; h++) cells.push([lx + dx * i, by + h, lz + dz * i, VC.st(90, axis)]);
      return cells;
    }
    return null;
  }

  // Is this portal block still held by a frame?
  function supported(w, x, y, z, s) {
    const axis = s & 3, dx = axis === 2 ? 0 : 1, dz = axis === 2 ? 1 : 0;
    const ok = (b) => b === OBS() || (b >> 4) === 90;
    return ok(w.getBlock(x, y - 1, z)) && ok(w.getBlock(x, y + 1, z)) && ok(w.getBlock(x - dx, y, z - dz)) && ok(w.getBlock(x + dx, y, z + dz));
  }

  // Nearest portal block within radius (loaded chunks only).
  function find(w, x, z, r) {
    let best = null, bd = Infinity;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const cx = x + dx, cz = z + dz;
      if (!w.getChunk(cx >> 4, cz >> 4)) continue;
      for (let y = 1; y < 127; y++) {
        if ((w.getBlock(cx, y, cz) >> 4) !== 90) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          // Use the bottom portal block of this column.
          let by = y;
          while ((w.getBlock(cx, by - 1, cz) >> 4) === 90) by--;
          bd = d; best = [cx, by, cz, w.getBlock(cx, y, cz) & 3];
        }
        break;
      }
    }
    return best;
  }

  // Builds a 4x5 obsidian portal near (x, y, z) on solid ground; returns [x, y, z, axis] of its interior.
  function build(w, x, z, nether) {
    const P = VC.BP;
    const air = (s) => s === 0 || (P.replaceable[s] && !P.liquid[s]);
    let spot = null;
    const yRange = nether ? [32, 110] : [VC.SEA, 120];
    for (let r = 0; r <= 12 && !spot; r++) {
      for (let dz = -r; dz <= r && !spot; dz++) for (let dx = -r; dx <= r && !spot; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = x + dx, cz = z + dz;
        for (let y = yRange[1]; y >= yRange[0]; y--) {
          if (!P.solid[w.getBlock(cx, y - 1, cz)] || P.liquid[w.getBlock(cx, y - 1, cz)]) continue;
          let free = true;
          for (let i = -1; i <= 2 && free; i++) for (let h = 0; h < 4 && free; h++) if (!air(w.getBlock(cx + i, y + h, cz))) free = false;
          if (free && P.solid[w.getBlock(cx + 1, y - 1, cz)]) { spot = [cx, y, cz]; break; }
        }
      }
    }
    if (!spot) {
      // Nothing suitable: carve a room and lay an obsidian platform.
      const y = nether ? 70 : 80;
      for (let i = -2; i <= 3; i++) for (let k = -2; k <= 2; k++) {
        for (let h = 0; h < 5; h++) w.setBlock(x + i, y + h, z + k, 0);
        w.setBlock(x + i, y - 1, z + k, OBS());
      }
      spot = [x, y, z];
    }
    const [sx, sy, sz] = spot;
    for (let i = -1; i <= 2; i++) for (let h = -1; h <= 3; h++) {
      const frame = i === -1 || i === 2 || h === -1 || h === 3;
      w.setBlock(sx + i, sy + h, sz, frame ? OBS() : VC.st(90, 1));
    }
    // Clear space in front and behind so the player is not stuck.
    for (const k of [-1, 1]) for (let i = 0; i <= 1; i++) for (let h = 0; h < 3; h++) {
      if (!air(w.getBlock(sx + i, sy + h, sz + k))) w.setBlock(sx + i, sy + h, sz + k, 0);
    }
    return [sx, sy, sz, 1];
  }

  return { tryLight, supported, find, build };
})();
