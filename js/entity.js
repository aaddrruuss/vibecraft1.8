'use strict';

// Base for everything that moves: AABB physics against block collision boxes,
// with Minecraft-style step-up (0.6 blocks) so slabs and stairs can be walked up.
VC.Entity = class {
  constructor(world, width, height) {
    this.world = world;
    this.pos = [0, 0, 0];
    this.vel = [0, 0, 0];
    this.hw = width / 2;
    this.height = height;
    this.yaw = 0;
    this.onGround = false;
    this.inWater = false;
    this.inLava = false;
    this.inWeb = false;
    this.onLadder = false;
    this.touchFire = false;
    this.touchCactus = false;
    this.groundBlock = 0;
    this.eyeInWater = false;
    this.hCollided = false;
    this.fallDist = 0;
    this.flow = [0, 0];
    this.removed = false;
    this.age = 0;
    this.stepHeight = 0.6;
    this._boxes = [];
  }

  eyeHeight() { return this.height * 0.85; }

  solid(x, y, z) { const b = this.world.getBlock(x, y, z); return VC.BP.solid[b] === 1 && !VC.BP.liquid[b]; }

  boxHasSolid(x0, y0, z0, x1, y1, z1) {
    return this.world.collisionBoxes(x0, y0, z0, x1, y1, z1, this._boxes).some((b) =>
      b[3] > x0 && b[0] < x1 && b[4] > y0 && b[1] < y1 && b[5] > z0 && b[2] < z1);
  }
  center() { return [this.pos[0], this.pos[1] + this.height / 2, this.pos[2]]; }

  aabb() {
    const p = this.pos, hw = this.hw;
    return [p[0] - hw, p[1], p[2] - hw, p[0] + hw, p[1] + this.height, p[2] + hw];
  }

  intersectsBlock(bx, by, bz) {
    const a = this.aabb();
    return a[3] > bx && a[0] < bx + 1 && a[4] > by && a[1] < by + 1 && a[5] > bz && a[2] < bz + 1;
  }

  // Clip a movement along one axis against boxes (MC calculateXOffset & co.).
  clip(axis, d, boxes) {
    if (d === 0) return 0;
    const a = this.aabb(), E = 1e-7;
    const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
    for (const b of boxes) {
      if (b[o1 + 3] <= a[o1] + E || b[o1] >= a[o1 + 3] - E) continue;
      if (b[o2 + 3] <= a[o2] + E || b[o2] >= a[o2 + 3] - E) continue;
      if (d > 0 && b[axis] >= a[axis + 3] - E) d = Math.min(d, b[axis] - a[axis + 3]);
      else if (d < 0 && b[axis + 3] <= a[axis] + E) d = Math.max(d, b[axis + 3] - a[axis]);
    }
    this.pos[axis] += d;
    return d;
  }

  groundBelow(boxes, ox = 0, oz = 0) {
    const a = this.aabb();
    for (const b of boxes) {
      if (b[3] <= a[0] + ox || b[0] >= a[3] + ox) continue;
      if (b[5] <= a[2] + oz || b[2] >= a[5] + oz) continue;
      if (b[4] <= a[1] && b[4] >= a[1] - 0.6) return true;
    }
    return false;
  }

  updateWater() {
    const a = this.aabb(), w = this.world, P = VC.BP;
    let inW = false, inL = false, web = false, ladder = false, fire = false, cactus = false, wx = 0, wy = 0, wz = 0;
    const top = Math.min(a[1] + this.height * 0.65, a[1] + 1.2);
    for (let y = Math.floor(a[1] + 0.05); y <= Math.floor(a[4] - 0.01); y++)
      for (let z = Math.floor(a[2] - 0.01); z <= Math.floor(a[5] + 0.01); z++)
        for (let x = Math.floor(a[0] - 0.01); x <= Math.floor(a[3] + 0.01); x++) {
          const s = w.getBlock(x, y, z);
          if (!s) continue;
          const id = s >> 4;
          const inside = x + 1 > a[0] && x < a[3] && z + 1 > a[2] && z < a[5];
          if (inside && P.liquid[s] && y <= top) {
            if (VC.isLava(s)) inL = true; else { inW = true; wx = x; wy = y; wz = z; }
          }
          if (inside && id === 30) web = true;
          if (inside && id === 51) fire = true;
          if (P.climb[s] && inside) ladder = true;
          if (id === 81) cactus = true;
        }
    this.inWater = inW;
    this.inLava = inL;
    this.inWeb = web;
    this.onLadder = ladder;
    this.touchFire = fire;
    this.touchCactus = cactus;
    this.flow = inW ? w.flowAt(wx, wy, wz) : [0, 0];
    const p = this.pos;
    const ex = Math.floor(p[0]), ey = p[1] + this.eyeHeight(), ez = Math.floor(p[2]);
    const by = Math.floor(ey), id = w.getBlock(ex, by, ez);
    if (!P.liquid[id]) this.eyeInWater = false;
    else {
      const full = P.liquid[w.getBlock(ex, by + 1, ez)];
      const h = full ? 1 : 1 - ((id & 7) + 1) / 9;
      this.eyeInWater = ey - by < h ? (VC.isLava(id) ? 'lava' : 'water') : false;
    }
    if (inW || inL) this.fallDist = 0;
    this.groundBlock = w.getBlock(Math.floor(p[0]), Math.floor(p[1] - 0.05), Math.floor(p[2]));
  }

  // Moves with collision. Returns fall distance when landing this step (else 0).
  move(dx, dy, dz, edgeGuard) {
    if (this.inWeb) { dx *= 0.25; dz *= 0.25; dy *= 0.05; }
    const a = this.aabb(), st = this.stepHeight;
    const boxes = this.world.collisionBoxes(
      Math.min(a[0], a[0] + dx) - 0.01, Math.min(a[1], a[1] + dy) - 0.01, Math.min(a[2], a[2] + dz) - 0.01,
      Math.max(a[3], a[3] + dx) + 0.01, Math.max(a[4], a[4] + dy) + st + 0.01, Math.max(a[5], a[5] + dz) + 0.01, this._boxes);
    const wasGround = this.onGround;

    // Sneaking: shrink horizontal movement so the feet stay over ground.
    if (edgeGuard && wasGround && this.groundBelow(boxes)) {
      const step = 0.05;
      while (dx !== 0 && !this.groundBelow(boxes, dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
      while (dz !== 0 && !this.groundBelow(boxes, 0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      while (dx !== 0 && dz !== 0 && !this.groundBelow(boxes, dx, dz)) {
        dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
      }
    }

    const start = this.pos.slice();
    const ry = this.clip(1, dy, boxes);
    const rx = this.clip(0, dx, boxes);
    const rz = this.clip(2, dz, boxes);
    let hColl = rx !== dx || rz !== dz;
    let landedNow = dy < 0 && ry !== dy;

    // Step up onto slabs / stairs / blocks up to 0.6 high.
    if (st > 0 && hColl && (wasGround || landedNow)) {
      const after = this.pos.slice();
      this.pos = start.slice();
      const up = this.clip(1, st, boxes);
      const sx = this.clip(0, dx, boxes);
      const sz = this.clip(2, dz, boxes);
      const down = this.clip(1, -up + Math.min(0, dy), boxes);
      if (sx * sx + sz * sz > rx * rx + rz * rz + 1e-6) {
        hColl = sx !== dx || sz !== dz;
        landedNow = true;
      } else {
        this.pos = after;
      }
    }

    this.hCollided = hColl;
    if (ry !== dy || landedNow) this.vel[1] = 0;
    this.onGround = landedNow || (dy < 0 && ry !== dy);
    if (rx !== dx && Math.abs(this.pos[0] - start[0]) < Math.abs(dx) - 1e-6) this.vel[0] = 0;
    if (rz !== dz && Math.abs(this.pos[2] - start[2]) < Math.abs(dz) - 1e-6) this.vel[2] = 0;

    let landed = 0;
    if (!this.onGround && dy < 0 && !this.inWater && !this.inLava && !this.onLadder) this.fallDist -= ry;
    if (this.onLadder || this.inWeb) this.fallDist = 0;
    if (this.onGround) {
      landed = this.fallDist;
      this.fallDist = 0;
      // Slime blocks bounce and cancel fall damage.
      const g = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.1), Math.floor(this.pos[2]));
      if ((g >> 4) === 165 && dy < -0.05 && !this.sneaking) {
        this.vel[1] = Math.min(20, -dy / (this._dt || 0.016) * 0.85);
        this.onGround = false;
        landed = 0;
      }
    }
    return landed;
  }

  // Ladder/vine climbing shared by player and mobs.
  climb(jump, sneak) {
    if (!this.onLadder) return;
    if (this.vel[1] < -2.5) this.vel[1] = -2.5;
    if (this.hCollided || jump) this.vel[1] = 2.35;
    else if (sneak && this.vel[1] < 0) this.vel[1] = 0;
  }
};
