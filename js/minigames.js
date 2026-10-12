'use strict';

// Minigames: alternative worlds started from the "Minijuegos" menu. Each has its own save slot.
VC.Minigames = (function () {
  const B = VC.B, I = VC.I, st = VC.st;

  // ---------- Skyblock ----------
  // Classic layout: an L-shaped dirt island with a tree and a chest, floating in the void,
  // plus a small sand island with a cactus and a second chest further away.
  const SKY_Y = 60; // bottom layer of the islands
  function skyblockBlocks() {
    const out = new Map();
    const put = (x, y, z, s) => out.set(x + ',' + y + ',' + z, s);
    // Main island: 6x6 minus one 3x3 quarter, 3 layers (dirt, dirt, grass).
    for (let x = 0; x < 6; x++) for (let z = 0; z < 6; z++) {
      if (x >= 3 && z >= 3) continue;
      put(x, SKY_Y, z, B.DIRT);
      put(x, SKY_Y + 1, z, B.DIRT);
      put(x, SKY_Y + 2, z, B.GRASS);
    }
    // Oak tree at the end of one arm.
    const tx = 4, tz = 1, ty = SKY_Y + 3;
    for (let ly = ty + 2; ly <= ty + 5; ly++) {
      const r = ly >= ty + 4 ? 1 : 2;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 1 || ly === ty + 3)) continue;
        put(tx + dx, ly, tz + dz, st(18));
      }
    }
    for (let i = 0; i < 5; i++) put(tx, ty + i, tz, st(17));
    put(0, SKY_Y + 3, 4, st(54, 1)); // chest at the end of the other arm
    // Sand island (sandstone underneath so the sand doesn't fall), with a cactus and a chest.
    const sx = 60, sz = 1;
    for (let x = sx; x < sx + 3; x++) for (let z = sz; z < sz + 3; z++) {
      put(x, SKY_Y, z, B.SANDSTONE);
      put(x, SKY_Y + 1, z, B.SAND);
      put(x, SKY_Y + 2, z, B.SAND);
    }
    put(sx + 2, SKY_Y + 3, sz + 2, B.CACTUS);
    put(sx, SKY_Y + 3, sz, st(54, 1));
    return out;
  }
  const SKY_CHESTS = {
    [`0,${SKY_Y + 3},4`]: [[I.STRING, 12], [I.LAVA_BUCKET, 1], [I.BONE, 1], [I.REEDS, 1], [B.RED_MUSHROOM, 1], [B.ICE, 2],
      [I.PUMPKIN_SEEDS, 1], [B.BROWN_MUSHROOM, 1], [I.MELON, 1], [B.CACTUS, 1]],
    [`60,${SKY_Y + 3},1`]: [[B.OBSIDIAN, 10], [I.MELON_SEEDS, 1], [B.SAND, 8]],
  };

  class SkyblockGenerator {
    constructor(seed) {
      this.seed = seed | 0;
      this.blocks = skyblockBlocks();
    }
    column() { return { h: 0, biome: VC.BIOME.PLAINS }; }
    generate(ch) {
      const x0 = ch.cx * 16, z0 = ch.cz * 16;
      for (const [k, s] of this.blocks) {
        const [x, y, z] = k.split(',').map(Number);
        if (x < x0 || x >= x0 + 16 || z < z0 || z >= z0 + 16) continue;
        ch.blocks[(y << 8) | ((z - z0) << 4) | (x - x0)] = s;
      }
    }
  }

  // Save data for a brand new skyblock world.
  function newSkyblock(seed) {
    const containers = {};
    for (const k in SKY_CHESTS) {
      const slots = new Array(27).fill(null);
      SKY_CHESTS[k].forEach(([id, n], i) => { slots[i] = [id, n, 0]; });
      containers[k] = slots;
    }
    const spawn = [1.5, SKY_Y + 3, 1.5];
    return { v: 3, type: 'skyblock', seed, mode: 'survival', containers, spawn, player: { pos: spawn.slice(), yaw: Math.PI * 0.75, pitch: -0.3 } };
  }

  // World types by id: generator for the overworld + save slot + label.
  const TYPES = {
    skyblock: { name: 'Skyblock', Generator: SkyblockGenerator, saveKey: 'vibecraft_save_skyblock', create: newSkyblock },
  };
  return { TYPES };
})();
