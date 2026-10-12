'use strict';

VC.Player = class extends VC.Entity {
  constructor(world) {
    super(world, 0.6, 1.8);
    this.pos = [0.5, 100, 0.5];
    this.pitch = 0;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.walkDist = 0;
    this.fovMul = 1;
    this.creative = false;
    this.spectator = false;
    this.specSpeed = 1;

    // Survival stats (MC units: health/food in half-icons).
    this.health = 20;
    this.food = 20;
    this.sat = 5;
    this.exh = 0;
    this.air = 15;
    this.dead = false;
    this.invuln = 0;
    this.hurtTime = 0;
    this.regenT = 0;
    this.starveT = 0;
    this.drownT = 0;
    this.voidT = 0;
    this.lavaT = 0;
    this.cactusT = 0;
    this.fireT = 0;      // seconds left burning
    this.fireDmgT = 0;
    this.inventory = new VC.Inventory(40); // 0-8 hotbar, 9-35 main, 36-39 armor (helmet..boots)
    this.sel = 0;
    this.damageScale = 1;
    this.peaceful = false;
    this.lastCause = 'murió';
    this.sleeping = false;
    this.gliding = false; // elytra flight
    this.glideAcc = 0;    // physics runs at MC's 20 ticks/s while gliding
    this.glideWear = 0;
    this.boostT = 0;      // seconds of firework boost left
  }

  // Elytra in the chestplate slot and not about to break (MC keeps it at 1 durability).
  canGlide() {
    const s = this.inventory.slots[37], it = s && VC.item(s.id);
    return !!(it && it.elytra && s.dmg < it.tool.durability - 1);
  }

  startGlide() {
    if (this.gliding || this.onGround || this.flying || this.spectator || this.inWater || this.inLava || this.onLadder || !this.canGlide()) return false;
    this.gliding = true;
    this.glideAcc = 0;
    return true;
  }

  eyeHeight() { return this.sleeping ? 0.3 : this.sneaking ? 1.54 : 1.62; }

  eye() {
    const bob = this.onGround && !this.flying ? Math.abs(Math.sin(this.walkDist * Math.PI * 0.6)) * 0.07 : 0;
    return [this.pos[0], this.pos[1] + this.eyeHeight() + bob, this.pos[2]];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  held() { return this.inventory.slots[this.sel]; }

  armorPoints() {
    let n = 0;
    for (let i = 36; i < 40; i++) {
      const s = this.inventory.slots[i], it = s && VC.item(s.id);
      if (it && it.armor) n += it.armor.points;
    }
    return n;
  }

  addExhaustion(v) { if (!this.creative && !this.peaceful) this.exh += v; }

  // Returns true if damage was applied. src = attacker position (scaled by difficulty).
  hurt(amount, src, knock = true, cause, armorable) {
    if (this.creative || this.spectator || this.dead || this.invuln > 0 || amount <= 0) return false;
    if (src) amount = Math.max(0, Math.round(amount * this.damageScale * 2) / 2);
    if (amount <= 0) return false;
    if (armorable === undefined) armorable = !!src;
    if (armorable) {
      const pts = Math.min(20, this.armorPoints());
      if (pts > 0) {
        amount = amount * (1 - pts * 0.04);
        for (let i = 36; i < 40; i++) {
          const s = this.inventory.slots[i], it = s && VC.item(s.id);
          if (!it || !it.armor || it.elytra) continue;
          s.dmg += Math.max(1, Math.floor(amount / 4));
          if (s.dmg >= it.tool.durability) this.inventory.slots[i] = null;
        }
        this.inventory.changed();
      }
    }
    this.health = Math.round((this.health - amount) * 2) / 2;
    if (cause) this.lastCause = cause;
    this.invuln = 0.5;
    this.hurtTime = 0.4;
    this.addExhaustion(0.3);
    if (knock && src) {
      const dx = this.pos[0] - src[0], dz = this.pos[2] - src[2];
      const l = Math.hypot(dx, dz) || 1;
      this.vel[0] = dx / l * 7;
      this.vel[2] = dz / l * 7;
      this.vel[1] = 6;
    }
    if (this.health <= 0) { this.health = 0; this.dead = true; }
    return true;
  }

  heal(n) { this.health = Math.min(20, this.health + n); }

  eat(item) {
    this.food = Math.min(20, this.food + item.food);
    this.sat = Math.min(this.food, this.sat + item.sat);
    if (item.heal) this.heal(item.heal);
  }

  respawn(spawn) {
    this.pos = spawn.slice();
    this.vel = [0, 0, 0];
    this.health = 20; this.food = 20; this.sat = 5; this.exh = 0; this.air = 15;
    this.dead = false; this.fallDist = 0; this.hurtTime = 0; this.invuln = 1; this.fireT = 0; this.sleeping = false;
    this.gliding = false; this.boostT = 0;
  }

  update(dt, input) {
    if (this.dead) return;
    this._dt = dt;
    const k = input.keys;
    const fw = (k.forward ? 1 : 0) - (k.back ? 1 : 0);
    const st = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    const jump = !!k.jump, down = !!k.sneak;
    if (this.spectator) { this.spectate(dt, k, fw, st, jump, down, input); return; }
    if (!this.creative) this.flying = false;

    this.sneaking = down && !this.flying;
    const canSprint = this.creative || this.food > 6;
    if ((k.sprint || input.sprintTap) && fw > 0 && !this.sneaking && canSprint) this.sprinting = true;
    if (fw <= 0 || this.sneaking || !canSprint || (this.hCollided && !this.flying)) this.sprinting = false;
    this.updateWater();
    const liquid = this.inWater || this.inLava;
    if (this.gliding && (this.onGround || liquid || this.flying || this.onLadder || !this.canGlide())) this.gliding = false;
    if (this.gliding) {
      this.sneaking = this.sprinting = false;
      this.glide(dt);
      this.updateStats(dt);
      return;
    }
    this.boostT = 0;

    let speed = this.flying ? (this.sprinting ? 21.6 : 10.9) : this.sneaking ? 1.31 : this.sprinting ? 5.61 : 4.317;
    if (liquid && !this.flying) speed *= this.inLava ? 0.25 : 0.45;
    if (input.slow) speed *= 0.3;
    if (this.onGround && (this.groundBlock >> 4) === 88) speed *= 0.4;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx = wx / len * speed; wz = wz / len * speed; }
    if (this.inWater && !this.flying) { wx += this.flow[0] * 2.4; wz += this.flow[1] * 2.4; }
    const ice = this.onGround && ((this.groundBlock >> 4) === 79 || (this.groundBlock >> 4) === 174);
    const accel = this.flying ? 8 : liquid ? 6 : this.onGround ? (ice ? 1.5 : 14) : 3;
    const f = Math.min(1, accel * dt);
    this.vel[0] += (wx - this.vel[0]) * f;
    this.vel[2] += (wz - this.vel[2]) * f;

    if (this.flying) {
      const ty = ((jump ? 1 : 0) - (down ? 1 : 0)) * 8;
      this.vel[1] += (ty - this.vel[1]) * Math.min(1, 10 * dt);
    } else if (liquid) {
      this.vel[1] -= 10 * dt;
      this.vel[1] *= Math.max(0, 1 - (this.inLava ? 5 : 3) * dt);
      if (jump) this.vel[1] = this.hCollided ? 5 : Math.min(this.vel[1] + 28 * dt, this.inLava ? 2 : 3.5);
    } else {
      this.vel[1] -= 32 * dt;
      if (this.vel[1] < -78) this.vel[1] = -78;
      if (jump && this.onGround) {
        this.vel[1] = 8.9;
        this.addExhaustion(this.sprinting ? 0.2 : 0.05);
        if (this.sprinting) { this.vel[0] -= sy * 2; this.vel[2] -= cy * 2; }
      }
    }
    if (!this.flying) this.climb(jump, down);

    const ox = this.pos[0], oz = this.pos[2];
    const landed = this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, this.sneaking);
    if (this.flying) this.fallDist = 0;
    if (this.flying && this.onGround) this.flying = false;
    const moved = Math.hypot(this.pos[0] - ox, this.pos[2] - oz);
    if (this.onGround) this.walkDist += moved;
    if (this.sprinting) this.addExhaustion(0.1 * moved);
    if (landed > 3) this.hurt(Math.ceil(landed - 3), null, false, 'cayó desde muy alto', false);

    const targetFov = this.sprinting ? 1.15 : 1;
    this.fovMul += (targetFov - this.fovMul) * Math.min(1, dt * 10);
    this.updateStats(dt);
  }

  // Elytra flight, a port of MC's per-tick glide physics (motion in blocks/tick).
  // Looking down trades height for speed, looking up trades speed for lift.
  glide(dt) {
    const f = this.forward(), pitch = -this.pitch; // MC pitch: positive = looking down
    let mx = this.vel[0] / 20, my = this.vel[1] / 20, mz = this.vel[2] / 20;
    this.glideAcc += dt * 20;
    while (this.glideAcc >= 1) {
      this.glideAcc -= 1;
      const hl = Math.hypot(f[0], f[2]), hs = Math.hypot(mx, mz);
      const c = Math.cos(pitch) ** 2;
      my += -0.08 + c * 0.06;
      if (my < 0 && hl > 0) {
        const d = my * -0.1 * c;
        my += d; mx += f[0] * d / hl; mz += f[2] * d / hl;
      }
      if (pitch < 0 && hl > 0) {
        const d = hs * -Math.sin(pitch) * 0.04;
        my += d * 3.2; mx -= f[0] * d / hl; mz -= f[2] * d / hl;
      }
      if (hl > 0) { mx += (f[0] / hl * hs - mx) * 0.1; mz += (f[2] / hl * hs - mz) * 0.1; }
      if (this.boostT > 0) {
        // Firework rocket: pull towards 1.5 blocks/tick along the look direction.
        this.boostT -= 0.05;
        mx += f[0] * 0.1 + (f[0] * 1.5 - mx) * 0.5;
        my += f[1] * 0.1 + (f[1] * 1.5 - my) * 0.5;
        mz += f[2] * 0.1 + (f[2] * 1.5 - mz) * 0.5;
      }
      mx *= 0.99; my *= 0.98; mz *= 0.99;
    }
    this.vel = [mx * 20, my * 20, mz * 20];
    // Gentle descent resets the fall, only steep dives hurt on landing.
    if (my > -0.5) this.fallDist = 1;
    const hBefore = Math.hypot(mx, mz);
    const landed = this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, false);
    if (this.hCollided) {
      const dmg = (hBefore - Math.hypot(this.vel[0], this.vel[2]) / 20) * 10 - 3;
      if (dmg > 0) this.hurt(Math.ceil(dmg), null, false, 'experimentó energía cinética', false);
    }
    if (landed > 3) this.hurt(Math.ceil(landed - 3), null, false, 'cayó desde muy alto', false);
    if (this.onGround) this.gliding = false;

    if (!this.creative && (this.glideWear += dt) >= 1) {
      this.glideWear -= 1;
      const s = this.inventory.slots[37];
      if (s) { s.dmg++; this.inventory.changed(); }
    }
    const speed = Math.hypot(...this.vel);
    const targetFov = 1 + Math.min(0.2, speed / 200);
    this.fovMul += (targetFov - this.fovMul) * Math.min(1, dt * 4);
  }

  // Spectator: free flight through blocks, no collisions, no damage.
  spectate(dt, k, fw, st, jump, down, input) {
    this.flying = true;
    this.gliding = false;
    this.sneaking = false;
    this.onGround = false;
    this.fallDist = 0;
    this.sprinting = (k.sprint || input.sprintTap) && fw > 0;
    const speed = 10.9 * this.specSpeed * (this.sprinting ? 2 : 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * fw + cy * st, wz = -cy * fw - sy * st;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx = wx / len * speed; wz = wz / len * speed; }
    const wy = ((jump ? 1 : 0) - (down ? 1 : 0)) * speed * 0.75;
    const f = Math.min(1, 8 * dt);
    this.vel[0] += (wx - this.vel[0]) * f;
    this.vel[1] += (wy - this.vel[1]) * f;
    this.vel[2] += (wz - this.vel[2]) * f;
    for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
    if (this.pos[1] < -60) this.pos[1] = -60;
    if (this.pos[1] > 300) this.pos[1] = 300;
    this.updateWater();
    this.inWater = this.inLava = this.inWeb = this.onLadder = this.touchFire = this.touchCactus = false;
    this.fireT = 0;
    this.health = 20; this.air = 15;
    const targetFov = this.sprinting ? 1.15 : 1;
    this.fovMul += (targetFov - this.fovMul) * Math.min(1, dt * 10);
  }

  updateStats(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.creative) { this.health = 20; this.food = 20; this.air = 15; this.fireT = 0; return; }

    if (this.inLava) {
      this.fireT = 15;
      if ((this.lavaT += dt) >= 0.5) { this.lavaT = 0; this.invuln = 0; this.hurt(4, null, false, 'intentó nadar en lava', true); }
    } else this.lavaT = 0.5;
    if (this.touchFire) this.fireT = Math.max(this.fireT, 8);
    if (this.inWater) this.fireT = 0;
    if (this.fireT > 0) {
      this.fireT -= dt;
      if ((this.fireDmgT += dt) >= 1) { this.fireDmgT = 0; this.invuln = 0; this.hurt(1, null, false, 'ardió hasta morir', true); }
    }
    if (this.touchCactus) {
      if ((this.cactusT += dt) >= 0.5) { this.cactusT = 0; this.hurt(1, null, false, 'murió pinchado por un cactus', true); }
    } else this.cactusT = 0.5;

    if (this.eyeInWater === 'water') {
      this.air -= dt;
      if (this.air <= 0) {
        this.air = 0;
        this.drownT += dt;
        if (this.drownT >= 1) { this.drownT = 0; this.invuln = 0; this.hurt(2, null, false, 'se ahogó', false); }
      }
    } else {
      this.air = Math.min(15, this.air + dt * 6);
      this.drownT = 0;
    }

    if (this.pos[1] < -10) {
      this.voidT += dt;
      if (this.voidT > 0.5) { this.voidT = 0; this.invuln = 0; this.hurt(4, null, false, 'cayó fuera del mundo', false); }
    }

    if (this.peaceful) {
      this.exh = 0;
      this.food = 20;
      this.regenT += dt;
      if (this.regenT >= 1 && this.health < 20) { this.regenT = 0; this.heal(1); }
      return;
    }
    while (this.exh >= 4) {
      this.exh -= 4;
      if (this.sat > 0) this.sat = Math.max(0, this.sat - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    if (this.food >= 18 && this.health < 20) {
      this.regenT += dt;
      if (this.regenT >= 4) { this.regenT = 0; this.heal(1); this.exh += 3; }
    } else this.regenT = 0;
    if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT = 0; if (this.health > 10) { this.invuln = 0; this.hurt(1, null, false, 'murió de hambre', false); } }
    } else this.starveT = 0;
  }
};
