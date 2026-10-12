'use strict';

VC.SEA = 62;
VC.CH = 256; // world height (build limit y 255); terrain itself stays below 128

VC.BIOME = { PLAINS: 0, FOREST: 1, DESERT: 2, SNOWY: 3, MOUNTAINS: 4, OCEAN: 5, BEACH: 6 };
VC.BIOME_NAMES = ['Llanuras', 'Bosque', 'Desierto', 'Tundra nevada', 'Colinas extremas', 'Océano', 'Playa'];

VC.Generator = class {
  constructor(seed) {
    this.seed = seed | 0;
    const N = VC.Noise;
    this.nC = new N(seed);
    this.nD = new N(seed + 11);
    this.nM = new N(seed + 23);
    this.nR = new N(seed + 37);
    this.nT = new N(seed + 51);
    this.nW = new N(seed + 67);
    this.c1 = new N(seed + 79);
    this.c2 = new N(seed + 97);
  }

  hash(x, z, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul((this.seed + s * 7919) | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Terrain height + biome for a world column. Pure function of (seed, x, z).
  column(x, z) {
    const U = VC.util, BI = VC.BIOME, SEA = VC.SEA;
    const c = this.nC.fbm2(x / 400, z / 400, 5);
    const d = this.nD.fbm2(x / 100, z / 100, 4);
    const m = U.smoothstep(0.04, 0.3, this.nM.fbm2(x / 320 + 100, z / 320 - 100, 3));
    const ridge = U.clamp(1 - Math.abs(this.nR.fbm2(x / 140, z / 140, 4)) * 1.6, 0, 1);
    let h = 66 + c * 36 + d * 7 + m * (ridge * ridge * 55 + 10 + d * 8);
    h = U.clamp(Math.round(h), 3, 123);

    const t = this.nT.fbm2(x / 700, z / 700, 3);
    const w = this.nW.fbm2(x / 600 + 50, z / 600, 3);
    let biome;
    if (h < SEA - 1) biome = BI.OCEAN;
    else if (m > 0.4) biome = BI.MOUNTAINS;
    else if (t > 0.18 && w < 0.05) biome = BI.DESERT;
    else if (t < -0.2) biome = BI.SNOWY;
    else if (h <= SEA + 1) biome = BI.BEACH;
    else if (w > 0.06) biome = BI.FOREST;
    else biome = BI.PLAINS;
    return { h, biome };
  }

  caveLimit(h) { return h < VC.SEA + 3 ? h - 5 : h; }

  isCave(x, y, z, h) {
    if (y < 5 || y > this.caveLimit(h)) return false;
    const a = this.c1.noise3(x / 48, y / 24, z / 48);
    if (a > 0.068 || a < -0.068) return false;
    const b = this.c2.noise3(x / 48, y / 24, z / 48);
    return a * a + b * b < 0.0046;
  }

  generate(ch) {
    const Bk = ch.blocks, bx = ch.cx * 16, bz = ch.cz * 16;
    const SEA = VC.SEA, B = VC.B, BI = VC.BIOME, P = VC.BP, st = VC.st;
    const hs = new Int16Array(256), bs = new Uint8Array(256);
    const I = (x, y, z) => (y << 8) | (z << 4) | x;

    // 1. Base terrain
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const wx = bx + x, wz = bz + z;
        const col = this.column(wx, wz);
        const h = col.h, biome = col.biome;
        hs[z * 16 + x] = h; bs[z * 16 + x] = biome;

        let top = B.GRASS, fill = B.DIRT;
        const fillDepth = 3 + (this.hash(wx, wz, 1) < 0.5 ? 1 : 0);
        switch (biome) {
          case BI.DESERT: top = fill = B.SAND; break;
          case BI.BEACH: top = fill = B.SAND; break;
          case BI.OCEAN: {
            const r = this.hash(wx, wz, 2);
            if (h > SEA - 7) top = fill = r < 0.08 ? B.CLAY : B.SAND;
            else top = fill = r < 0.6 ? B.GRAVEL : B.DIRT;
            break;
          }
          case BI.MOUNTAINS:
            if (h >= 97) { top = B.SNOW; fill = B.STONE; }
            else if (h >= 84) { top = fill = B.STONE; }
            break;
          case BI.FOREST:
            if (this.hash(wx, wz, 3) < 0.04) top = st(3, 2); // podzol patches
            break;
        }
        if (h < SEA && (top === B.GRASS || (top >> 4) === 3)) top = this.hash(wx, wz, 4) < 0.15 ? B.CLAY : B.DIRT;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = B.BEDROCK;
          else if (y < 4 && this.hash(wx, wz, 100 + y) < (4 - y) * 0.25) id = B.BEDROCK;
          else if (y === h) id = top;
          else if (y > h - fillDepth) id = fill;
          else if (biome === BI.DESERT && y > h - fillDepth - 4) id = B.SANDSTONE;
          else id = B.STONE;
          Bk[I(x, y, z)] = id;
        }
        for (let y = h + 1; y <= SEA; y++) Bk[I(x, y, z)] = B.WATER;
        if (biome === BI.SNOWY && h < SEA) Bk[I(x, SEA, z)] = B.ICE;
      }
    }

    // 2. Caves; deep cave air becomes lava lakes like in MC.
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const h = hs[z * 16 + x], lim = this.caveLimit(h);
        const wx = bx + x, wz = bz + z;
        for (let y = 5; y <= lim; y++) {
          const i = I(x, y, z), id = Bk[i];
          if (VC.isWater(id) || id === B.BEDROCK || id === B.ICE) continue;
          const a = this.c1.noise3(wx / 48, y / 24, wz / 48);
          if (a > 0.068 || a < -0.068) continue;
          const b = this.c2.noise3(wx / 48, y / 24, wz / 48);
          if (a * a + b * b < 0.0046) Bk[i] = y <= 10 ? B.LAVA : B.AIR;
        }
      }
    }

    // 3. Ores and stone variants (random-walk veins replacing stone)
    const rng = VC.rng((this.hash(ch.cx, ch.cz, 999) * 4294967296) | 0);
    const ores = [
      [st(1, 1), 3, 24, 5, 80], [st(1, 3), 3, 24, 5, 80], [st(1, 5), 3, 24, 5, 80], [B.DIRT, 4, 20, 5, 120], [B.GRAVEL, 4, 16, 5, 100],
      [B.COAL, 20, 8, 5, 120], [B.IRON, 14, 6, 5, 64], [B.GOLD, 2, 6, 5, 32], [B.REDSTONE_ORE, 6, 6, 5, 16],
      [B.DIAMOND, 1, 5, 5, 16], [B.LAPIS_ORE, 1, 6, 5, 30],
    ];
    for (const [id, count, size, y0, y1] of ores) {
      for (let n = 0; n < count; n++) {
        let x = Math.floor(rng() * 16), y = y0 + Math.floor(rng() * (y1 - y0)), z = Math.floor(rng() * 16);
        for (let k = 0; k < size; k++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < 128) {
            const i = I(x, y, z);
            if (Bk[i] === B.STONE) Bk[i] = id;
          }
          const r = rng();
          if (r < 0.33) x += rng() < 0.5 ? 1 : -1; else if (r < 0.66) z += rng() < 0.5 ? 1 : -1; else y += rng() < 0.5 ? 1 : -1;
        }
      }
    }
    if (bs[136] === BI.MOUNTAINS) {
      for (let n = 0; n < 4; n++) {
        const i = I(Math.floor(rng() * 16), 5 + Math.floor(rng() * 25), Math.floor(rng() * 16));
        if (Bk[i] === B.STONE) Bk[i] = B.EMERALD_ORE;
      }
    }

    // 4. Surface decoration
    const FLOWERS = [B.ROSE, B.DANDELION, st(38, 1), st(38, 2), st(38, 3), st(38, 4), st(38, 5), st(38, 6), st(38, 7), st(38, 8)];
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const h = hs[z * 16 + x];
        if (h >= 124) continue;
        const wx = bx + x, wz = bz + z;
        const topId = Bk[I(x, h, z)];
        if (Bk[I(x, h + 1, z)] !== B.AIR) continue;
        const r = this.hash(wx, wz, 5), r2 = this.hash(wx, wz, 9), biome = bs[z * 16 + x];
        if (biome === BI.SNOWY && (topId === B.GRASS || (topId >> 4) === 3)) { Bk[I(x, h + 1, z)] = B.SNOW_LAYER; continue; }
        if (topId === B.GRASS || topId === st(3, 2)) {
          let plant = 0;
          if (biome === BI.PLAINS) plant = r < 0.14 ? B.TALLGRASS : r < 0.17 ? FLOWERS[Math.floor(r2 * FLOWERS.length)] : r < 0.172 ? st(175, Math.floor(r2 * 6)) : 0;
          else if (biome === BI.FOREST) plant = r < 0.07 ? B.TALLGRASS : r < 0.08 ? B.FERN : r < 0.088 ? FLOWERS[Math.floor(r2 * 4)] : r < 0.091 ? (r2 < 0.5 ? B.BROWN_MUSHROOM : B.RED_MUSHROOM) : 0;
          else plant = r < 0.05 ? B.TALLGRASS : 0;
          if (r > 0.995 && r2 < 0.3) plant = st(86, Math.floor(r2 * 13) & 3); // pumpkin patch
          if (plant) {
            Bk[I(x, h + 1, z)] = plant;
            if ((plant >> 4) === 175 && h < 126) Bk[I(x, h + 2, z)] = plant | 8;
          }
          // Sugar cane next to water.
          if (!plant && r < 0.3 && h === SEA) {
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
              const nx = x + dx, nz = z + dz;
              return nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && VC.isWater(Bk[I(nx, h, nz)]);
            });
            if (near && r2 < 0.5) for (let k = 1; k <= 1 + Math.floor(r2 * 6); k++) Bk[I(x, h + k, z)] = B.REEDS;
          }
        } else if (topId === B.SAND) {
          if (biome === BI.DESERT && r < 0.005) {
            const ch2 = 1 + Math.floor(this.hash(wx, wz, 6) * 3);
            for (let y = h + 1; y <= h + ch2; y++) Bk[I(x, y, z)] = B.CACTUS;
          } else if (biome === BI.DESERT && r < 0.012) Bk[I(x, h + 1, z)] = B.DEADBUSH;
          else if (h === SEA && r < 0.08) {
            const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
              const nx = x + dx, nz = z + dz;
              return nx >= 0 && nx < 16 && nz >= 0 && nz < 16 && VC.isWater(Bk[I(nx, h, nz)]);
            });
            if (near) for (let k = 1; k <= 1 + Math.floor(r2 * 3); k++) Bk[I(x, h + k, z)] = B.REEDS;
          }
        } else if (VC.isWater(topId) || h < SEA) {
          // Lily pads on shallow water
          if (h >= SEA - 3 && h < SEA && biome !== BI.OCEAN && r < 0.02 && Bk[I(x, SEA + 1, z)] === 0) Bk[I(x, SEA + 1, z)] = B.WATERLILY;
        }
      }
    }

    // 5. Trees (scan a margin so trees from neighbouring chunks spill in)
    const density = [0.004, 0.045, 0, 0.02, 0.008, 0, 0];
    for (let wz = bz - 3; wz < bz + 19; wz++) {
      for (let wx = bx - 3; wx < bx + 19; wx++) {
        const r = this.hash(wx, wz, 13);
        if (r > 0.045) continue;
        const col = this.column(wx, wz), h = col.h;
        if (r >= density[col.biome] || h <= VC.SEA || h >= 84 || h > 116) continue;
        if (this.isCave(wx, h, wz, h)) continue;
        const kindR = this.hash(wx, wz, 19);
        const wood = col.biome === BI.SNOWY ? 1 : col.biome === BI.FOREST && kindR < 0.3 ? 2 : col.biome === BI.FOREST && kindR < 0.4 ? 5 : 0;
        const log = wood < 4 ? st(17, wood) : st(162, wood - 4), leaf = wood < 4 ? st(18, wood) : st(161, wood - 4);
        const put = (x, y, z, id) => {
          const lx = x - bx, lz = z - bz;
          if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y > 127) return;
          const i = I(lx, y, lz), cur = Bk[i];
          if (id === log) { if (cur === B.AIR || (cur >> 4) === 18 || (cur >> 4) === 161 || P.cross[cur] || cur === B.SNOW_LAYER) Bk[i] = id; }
          else if (cur === B.AIR || P.cross[cur] || cur === B.SNOW_LAYER) Bk[i] = id;
        };
        if (wood === 1) {
          // Spruce: tall cone
          const th = 6 + Math.floor(this.hash(wx, wz, 17) * 4), top = h + th;
          for (let ly = h + 3; ly <= top + 1; ly++) {
            const rad = ly === top + 1 ? 0 : ((top - ly) % 3 === 0 ? 1 : (top - ly) % 3 === 1 ? 2 : 1) * (ly < top - 3 ? 1 : 1);
            const rr = Math.min(rad + (ly < h + th / 2 ? 1 : 0), 3);
            for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
              if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
              put(wx + dx, ly, wz + dz, leaf);
              if (col.biome === BI.SNOWY && ly < 127) put(wx + dx, ly + 1, wz + dz, B.SNOW_LAYER);
            }
          }
          for (let y = h + 1; y <= top; y++) put(wx, y, wz, log);
        } else {
          const th = (wood === 2 ? 5 : 4) + Math.floor(this.hash(wx, wz, 17) * 3), top = h + th;
          for (let ly = top - 2; ly <= top + 1; ly++) {
            const rad = ly <= top - 1 ? 2 : 1;
            for (let dz = -rad; dz <= rad; dz++) {
              for (let dx = -rad; dx <= rad; dx++) {
                if (Math.abs(dx) === rad && Math.abs(dz) === rad) {
                  if (ly === top + 1) continue;
                  if (this.hash(wx + dx, wz + dz, 200 + ly) < 0.5) continue;
                }
                put(wx + dx, ly, wz + dz, leaf);
              }
            }
          }
          for (let y = h + 1; y <= top; y++) put(wx, y, wz, log);
        }
        const lx = wx - bx, lz = wz - bz;
        if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
          const gi = I(lx, h, lz);
          if (Bk[gi] === B.GRASS) Bk[gi] = B.DIRT;
        }
      }
    }
  }
};
