'use strict';

VC.MOB_TYPES = (function () {
  const I = VC.I;
  return {
    zombie: { name: 'Zombi', w: 0.6, h: 1.95, hp: 20, speed: 2.4, hostile: true, burns: true, dmg: 3, drops: [[I.ROTTEN_FLESH, 0, 2]] },
    skeleton: { name: 'Esqueleto', w: 0.6, h: 1.99, hp: 20, speed: 2.5, hostile: true, burns: true, ranged: true, drops: [[I.BONE, 0, 2], [I.ARROW, 0, 2]] },
    creeper: { name: 'Creeper', w: 0.6, h: 1.7, hp: 20, speed: 2.3, hostile: true, creeper: true, drops: [[I.GUNPOWDER, 0, 2]] },
    spider: { name: 'Araña', w: 1.4, h: 0.9, hp: 16, speed: 3.4, hostile: true, dmg: 2, climbs: true, drops: [[I.STRING, 0, 2], [I.SPIDER_EYE, 0, 1]] },
    pig: { name: 'Cerdo', w: 0.9, h: 0.9, hp: 10, speed: 2.0, passive: true, food: [I.CARROT, I.POTATO], drops: [[I.PORK_RAW, 1, 3]] },
    cow: { name: 'Vaca', w: 0.9, h: 1.4, hp: 10, speed: 1.9, passive: true, food: [I.WHEAT], drops: [[I.BEEF_RAW, 1, 3], [I.LEATHER, 0, 2]] },
    sheep: { name: 'Oveja', w: 0.9, h: 1.3, hp: 8, speed: 2.0, passive: true, food: [I.WHEAT], drops: [[I.MUTTON_RAW, 1, 2]] },
    chicken: { name: 'Gallina', w: 0.4, h: 0.7, hp: 4, speed: 1.8, passive: true, food: [I.SEEDS, I.PUMPKIN_SEEDS, I.MELON_SEEDS], drops: [[I.CHICKEN_RAW, 1, 1], [I.FEATHER, 0, 2]] },
    pigman: { name: 'Hombre-cerdo zombi', w: 0.6, h: 1.95, hp: 20, speed: 2.6, hostile: true, neutral: true, dmg: 5, nether: true, drops: [[I.ROTTEN_FLESH, 0, 1], [I.GOLD_NUGGET, 0, 1]] },
    ghast: { name: 'Ghast', w: 4, h: 4, hp: 10, speed: 2, hostile: true, flying: true, nether: true, drops: [[I.GUNPOWDER, 0, 2], [I.GHAST_TEAR, 0, 1]] },
  };
})();

VC.Mob = class extends VC.Entity {
  constructor(world, type, x, y, z) {
    const d = VC.MOB_TYPES[type];
    super(world, d.w, d.h);
    this.type = type;
    this.def = d;
    this.pos = [x, y, z];
    this.health = d.hp;
    this.invuln = 0;
    this.hurtTime = 0;
    this.deathTime = 0;
    this.dead = false;
    this.attackCd = 0;
    this.shootCd = 1 + Math.random() * 2;
    this.wanderT = 0;
    this.wish = [0, 0];
    this.fleeT = 0;
    this.fuse = 0;
    this.fireT = 0;
    this.burning = false;
    this.provoked = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.bodyYaw = this.yaw;
    this.headPitch = 0;
    this.limbSwing = 0;
    this.limbAmp = 0;
    this.aiming = false;
    this.fireLeft = 0;
    this.envT = 0;
    if (type === 'sheep') {
      const r = Math.random();
      this.color = r < 0.82 ? 0 : r < 0.87 ? 7 : r < 0.92 ? 8 : r < 0.97 ? 15 : r < 0.997 ? 12 : 6;
      this.sheared = false;
      this.grazing = 0;
    }
    if (type === 'chicken') this.eggT = 300 + Math.random() * 300;
    if (type === 'ghast') this.stepHeight = 0;
    this.love = 0;
    this.breedCd = 0;
    this.baby = false;
    this.growT = 0;
  }

  setBaby(b) {
    this.baby = b;
    this.growT = 0;
    this.hw = this.def.w / 2 * (b ? 0.5 : 1);
    this.height = this.def.h * (b ? 0.5 : 1);
  }

  eyeHeight() { return this.height * 0.85; }
  eye() { return [this.pos[0], this.pos[1] + this.eyeHeight(), this.pos[2]]; }

  hurt(amount, src) {
    if (this.dead || this.invuln > 0) return false;
    this.health -= amount;
    this.invuln = 0.5;
    this.hurtTime = 0.4;
    if (src) {
      const dx = this.pos[0] - src[0], dz = this.pos[2] - src[2], l = Math.hypot(dx, dz) || 1;
      this.vel[0] = dx / l * 8;
      this.vel[2] = dz / l * 8;
      if (this.onGround) this.vel[1] = 6;
      this.provoked = this.def.neutral ? 40 : 20;
      this.angerShare = true;
    }
    if (this.def.passive) this.fleeT = 5;
    if (this.health <= 0) { this.dead = true; this.health = 0; }
    VC.Sound.mob(this.type, this.dead ? 'death' : 'hurt', this.center());
    return true;
  }

  dropLoot(game) {
    if (this.baby) return;
    if (this.type === 'sheep' && !this.sheared) game.dropItem(this.center(), VC.stack(VC.st(35, this.color), 1));
    if (this.type === 'zombie' && Math.random() < 0.025) game.dropItem(this.center(), VC.stack([VC.I.IRON_INGOT, VC.I.CARROT, VC.I.POTATO][Math.floor(Math.random() * 3)], 1));
    for (const [id, min, max] of this.def.drops) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (n > 0) game.dropItem(this.center(), VC.stack(id, n));
    }
  }

  update(dt, game) {
    this.age += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.provoked > 0) this.provoked -= dt;
    // Multiplayer: chase whichever player is closest.
    const d = this.def, p = game.targetFor ? game.targetFor(this) : game.player;

    this.environment(dt, game);
    if (this.removed) return;
    if (this.dead) {
      this.deathTime += dt;
      this.physics(dt, 0, 0, false);
      if (this.deathTime >= 1) { this.removed = true; this.dropLoot(game); }
      return;
    }

    const dx = p.pos[0] - this.pos[0], dz = p.pos[2] - this.pos[2], dy = p.pos[1] - this.pos[1];
    const dist = Math.hypot(dx, dz);
    const dist3 = Math.hypot(dx, dy, dz);
    if (d.flying) { this.updateFlying(dt, game, dist3); return; }
    const targetable = !p.dead && !p.creative && !p.spectator;
    let hostile = d.hostile && targetable && dist3 < (d.neutral ? 32 : 16);
    if (d.neutral && this.provoked <= 0) hostile = false;
    if (this.type === 'spider' && hostile && game.day > 0.5 && this.provoked <= 0) hostile = false;

    let wx = 0, wz = 0, jump = false, speed = d.speed, face = null, mate = null, parent = null;
    this.aiming = false;
    if (d.passive) {
      if (this.breedCd > 0) this.breedCd -= dt;
      if (this.baby && (this.growT += dt) >= 1200) this.setBaby(false);
      if (this.love > 0) {
        this.love -= dt;
        if ((this.heartT = (this.heartT || 0) + dt) > 0.7) { this.heartT = 0; game.particle(this.eye(), 'heart', 1); }
      }
    }
    if (Math.random() < dt / 9) VC.Sound.mob(this.type, 'idle', this.center());
    const fuseBefore = this.fuse;

    if (hostile) {
      const sees = this.world.lineOfSight(this.eye(), p.eye());
      face = Math.atan2(-dx, -dz);
      if (d.creeper) {
        if (dist3 < 3.2 && sees) this.fuse += dt;
        else if (dist3 > 7 || this.fuse > 0) this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse <= 0 || dist3 > 3.2) { wx = dx / (dist || 1); wz = dz / (dist || 1); }
        if (fuseBefore === 0 && this.fuse > 0) VC.Sound.fuse(this.center());
        if (this.fuse >= 1.5) { game.explode(this.center(), 3, this); this.removed = true; return; }
      } else if (d.ranged) {
        this.aiming = sees && dist3 < 15;
        if (dist3 > 10 || !sees) { wx = dx / (dist || 1); wz = dz / (dist || 1); }
        else if (dist3 < 5) { wx = -dx / (dist || 1); wz = -dz / (dist || 1); }
        this.shootCd -= dt;
        if (this.aiming && this.shootCd <= 0) {
          this.shootCd = 1.6 + Math.random() * 1.2;
          game.shootArrow(this, this.eye(), p.eye(), 22, 2 + Math.floor(Math.random() * 3));
        }
      } else {
        wx = dx / (dist || 1); wz = dz / (dist || 1);
        const reach = 0.9 + d.w / 2;
        if (dist < reach && Math.abs(dy) < 1.6 && this.attackCd <= 0) {
          this.attackCd = 1;
          p.hurt(d.dmg, this.pos, true, `fue asesinado por ${d.name}`);
        }
        if (this.type === 'spider' && dist < 4 && dist > 2 && this.onGround && Math.random() < dt * 1.5) {
          this.vel[0] = wx * 7; this.vel[2] = wz * 7; this.vel[1] = 6;
        }
      }
    } else if (d.passive && this.fleeT > 0) {
      this.fleeT -= dt;
      wx = -dx / (dist || 1); wz = -dz / (dist || 1);
      speed *= 1.7;
      this.fuse = 0;
    } else if (d.passive && this.love > 0 && (mate = this.findMate(game))) {
      // Walk to the partner; when close, a baby is born.
      const mx = mate.pos[0] - this.pos[0], mz = mate.pos[2] - this.pos[2], md = Math.hypot(mx, mz);
      if (md > 1.2) { wx = mx / md; wz = mz / md; } else this.breed(mate, game);
    } else if (d.passive && targetable && dist3 < 8 && this.tempted(p)) {
      // Follow the player holding our favourite food.
      face = Math.atan2(-dx, -dz);
      if (dist > 2) { wx = dx / dist; wz = dz / dist; }
      this.headPitch = Math.atan2(dy + p.eyeHeight() - this.eyeHeight(), dist);
    } else if (this.baby && (parent = this.findParent(game))) {
      const mx = parent.pos[0] - this.pos[0], mz = parent.pos[2] - this.pos[2], md = Math.hypot(mx, mz);
      if (md > 3) { wx = mx / md; wz = mz / md; speed *= 1.3; }
    } else {
      this.fuse = Math.max(0, this.fuse - dt);
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 5;
        if (Math.random() < 0.45) this.wish = [0, 0];
        else { const a = Math.random() * Math.PI * 2; this.wish = [Math.cos(a), Math.sin(a)]; }
      }
      wx = this.wish[0]; wz = this.wish[1];
      if (!hostile && d.hostile) speed *= 0.6;
      // Avoid wandering off cliffs into deep drops.
      if (wx || wz) {
        const ax = Math.floor(this.pos[0] + wx * 1.2), az = Math.floor(this.pos[2] + wz * 1.2), ay = Math.floor(this.pos[1]);
        if (!this.solid(ax, ay - 1, az) && !this.solid(ax, ay - 2, az) && !this.solid(ax, ay, az)) { this.wish = [0, 0]; wx = wz = 0; }
      }
    }

    if (wx || wz) {
      if (this.hCollided && this.onGround) jump = true;
      if (d.climbs && this.hCollided) this.vel[1] = 3;
      if (!face) face = Math.atan2(-wx, -wz);
    }
    if (face !== null) {
      let diff = face - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 8);
    }
    if (hostile) this.headPitch = Math.atan2(dy + p.eyeHeight() - this.eyeHeight(), dist);
    else if (!(d.passive && targetable && dist3 < 8 && this.tempted(p))) this.headPitch *= 0.9;

    if (this.type === 'sheep' && !hostile) {
      if (this.grazing > 0) {
        this.grazing -= dt;
        wx = wz = 0;
        if (this.grazing <= 0) {
          const bx = Math.floor(this.pos[0]), by = Math.floor(this.pos[1] - 0.1), bz = Math.floor(this.pos[2]);
          if (this.world.getBlock(bx, by, bz) === VC.B.GRASS) { game.setBlock(bx, by, bz, VC.B.DIRT); this.sheared = false; }
          else if (VC.BP.cross[this.world.getBlock(bx, by + 1, bz)]) { game.setBlock(bx, by + 1, bz, 0); this.sheared = false; }
        }
      } else if (this.onGround && Math.random() < dt / (this.sheared ? 20 : 60)) this.grazing = 1.2;
    }
    if (this.type === 'chicken') {
      this.eggT -= dt;
      if (this.eggT <= 0) { this.eggT = 300 + Math.random() * 300; game.dropItem(this.center(), VC.stack(VC.I.EGG, 1)); }
      if (!this.onGround && this.vel[1] < -3) this.vel[1] = -3;
    }

    // Sunlight burns undead.
    if (d.burns && game.day > 0.6 && !this.inWater) {
      const e = this.eye();
      this.burning = this.world.getSky(Math.floor(e[0]), Math.floor(e[1]), Math.floor(e[2])) >= 15;
    } else this.burning = false;
    if (this.burning) this.fireLeft = Math.max(this.fireLeft, 1);

    this.physics(dt, wx * speed, wz * speed, jump);
  }

  // ---------- Breeding ----------
  tempted(p) {
    const s = p.held();
    return !!(s && this.def.food && this.def.food.includes(s.id));
  }

  // Feeding: adults enter love mode, babies grow faster. Returns true if the food was used.
  feed(game) {
    if (this.dead) return false;
    if (this.baby) { this.growT += 120; game.particle(this.eye(), 'spark', 3); return true; }
    if (this.love > 0 || this.breedCd > 0) return false;
    this.love = 30;
    game.particle(this.eye(), 'heart', 4);
    return true;
  }

  findMate(game) {
    let best = null, bd = 64;
    for (const e of game.entities.list) {
      if (e === this || !(e instanceof VC.Mob) || e.type !== this.type || e.dead || e.baby || e.love <= 0) continue;
      const d = (e.pos[0] - this.pos[0]) ** 2 + (e.pos[1] - this.pos[1]) ** 2 + (e.pos[2] - this.pos[2]) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  findParent(game) {
    let best = null, bd = 256;
    for (const e of game.entities.list) {
      if (e === this || !(e instanceof VC.Mob) || e.type !== this.type || e.dead || e.baby) continue;
      const d = (e.pos[0] - this.pos[0]) ** 2 + (e.pos[2] - this.pos[2]) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  breed(mate, game) {
    this.love = mate.love = 0;
    this.breedCd = mate.breedCd = 300;
    const pos = [(this.pos[0] + mate.pos[0]) / 2, Math.max(this.pos[1], mate.pos[1]), (this.pos[2] + mate.pos[2]) / 2];
    const baby = new VC.Mob(this.world, this.type, pos[0], pos[1], pos[2]);
    baby.setBaby(true);
    baby.yaw = baby.bodyYaw = this.yaw;
    if (this.type === 'sheep') baby.color = Math.random() < 0.5 ? this.color : mate.color;
    game.entities.add(baby);
    game.particle([pos[0], pos[1] + 0.8, pos[2]], 'heart', 7);
    VC.Sound.mob(this.type, 'idle', pos);
    VC.Sound.pop();
  }

  // ---------- Flying mobs (ghast) ----------
  updateFlying(dt, game, dist3) {
    const p = game.targetFor ? game.targetFor(this) : game.player, d = this.def;
    const targetable = !p.dead && !p.creative && !p.spectator;
    this.wanderT -= dt;
    if (!this.goal || this.wanderT <= 0 || this.hCollided) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
      this.goal = [this.pos[0] + Math.cos(a) * r, Math.max(40, Math.min(100, this.pos[1] + (Math.random() - 0.5) * 12)), this.pos[2] + Math.sin(a) * r];
      this.wanderT = 4 + Math.random() * 5;
    }
    const gx = this.goal[0] - this.pos[0], gy = this.goal[1] - this.pos[1], gz = this.goal[2] - this.pos[2];
    const gl = Math.hypot(gx, gy, gz) || 1;
    const sp = gl > 1 ? d.speed : 0;
    const f = Math.min(1, dt * 1.5);
    this.vel[0] += (gx / gl * sp - this.vel[0]) * f;
    this.vel[1] += (gy / gl * sp - this.vel[1]) * f;
    this.vel[2] += (gz / gl * sp - this.vel[2]) * f;
    let face = Math.atan2(-this.vel[0], -this.vel[2]);
    this.attacking = false;
    const c = this.center();
    if (targetable && dist3 < 64 && this.world.lineOfSight(c, p.eye())) {
      face = Math.atan2(-(p.pos[0] - this.pos[0]), -(p.pos[2] - this.pos[2]));
      this.shootCd -= dt;
      this.attacking = this.shootCd < 0.6;
      if (this.shootCd <= 0) {
        this.shootCd = 3;
        game.shootFireball(this, c, p.eye());
      }
    } else this.shootCd = Math.min(this.shootCd + dt, 3);
    let diff = Math.atan2(Math.sin(face - this.yaw), Math.cos(face - this.yaw));
    this.yaw += diff * Math.min(1, dt * 3);
    this.bodyYaw = this.yaw;
    this._dt = dt;
    this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, false);
    if (Math.random() < dt / 6) VC.Sound.mob('ghast', 'idle', c);
  }

  // Lava, fire, cactus and burning damage shared by all mobs.
  environment(dt, game) {
    this.updateWater();
    if (this.def.nether) { this.fireLeft = 0; this.fallDist = 0; return; }
    if (this.inLava) this.fireLeft = 15;
    if (this.touchFire) this.fireLeft = Math.max(this.fireLeft, 8);
    if (this.inWater) this.fireLeft = 0;
    this.envT += dt;
    if (this.envT >= 0.5) {
      this.envT = 0;
      if (this.inLava) { this.invuln = 0; this.hurt(4, null); }
      else if (this.touchCactus) this.hurt(1, null);
    }
    if (this.fireLeft > 0) {
      this.fireLeft -= dt;
      this.fireT += dt;
      if (this.fireT >= 1) { this.fireT = 0; this.invuln = 0; this.hurt(1, null); }
    }
  }

  physics(dt, wx, wz, jump) {
    this._dt = dt;
    const accel = this.inWater ? 5 : this.onGround ? 10 : 2;
    const f = Math.min(1, accel * dt);
    if (this.inWater) { wx += this.flow[0] * 2; wz += this.flow[1] * 2; }
    this.vel[0] += (wx - this.vel[0]) * f;
    this.vel[2] += (wz - this.vel[2]) * f;
    if (this.inWater || this.inLava) {
      this.vel[1] -= 8 * dt;
      this.vel[1] *= Math.max(0, 1 - 3 * dt);
      if (!this.dead) this.vel[1] = Math.min(this.vel[1] + 16 * dt, 2.5);
    } else {
      this.vel[1] -= 32 * dt;
      if (jump && this.onGround) this.vel[1] = 8.9;
    }
    if (!this.dead) this.climb(jump, false);
    const landed = this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, false);
    if (landed > 3 && !this.dead) { this.invuln = 0; this.hurt(Math.ceil(landed - 3), null); }
    const h = Math.hypot(this.vel[0], this.vel[2]);
    this.limbAmp += (Math.min(1, h / 3) - this.limbAmp) * Math.min(1, dt * 8);
    this.limbSwing += h * dt * 2.2;
    let diff = this.yaw - this.bodyYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.bodyYaw += diff * Math.min(1, dt * 5);
  }
};

VC.ItemEntity = class extends VC.Entity {
  constructor(world, pos, stack, vel) {
    super(world, 0.25, 0.25);
    this.pos = [pos[0], pos[1] - 0.125, pos[2]];
    this.stack = stack;
    this.vel = vel || [(Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3];
    this.pickupDelay = 0.6;
    this.spin = Math.random() * 6;
  }

  update(dt, game) {
    this.age += dt;
    this.pickupDelay -= dt;
    if (this.age > 300) { this.removed = true; return; }
    this.updateWater();
    if (this.inWater) { this.vel[1] += (1.5 - this.vel[1]) * Math.min(1, dt * 3); this.vel[0] += this.flow[0] * dt * 6; this.vel[2] += this.flow[1] * dt * 6; }
    else this.vel[1] -= 20 * dt;
    const fr = this.onGround ? 8 : 0.5;
    this.vel[0] *= Math.max(0, 1 - fr * dt);
    this.vel[2] *= Math.max(0, 1 - fr * dt);
    this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, false);
    // Unstick if spawned inside a block.
    if (this.boxHasSolid(this.pos[0] - 0.1, this.pos[1] + 0.05, this.pos[2] - 0.1, this.pos[0] + 0.1, this.pos[1] + 0.2, this.pos[2] + 0.1)) this.pos[1] += dt * 4;

    if (this.pickupDelay > 0) return;
    if (game.netPickup && game.netPickup(this)) return; // picked up by another player
    const p = game.player;
    if (!p.dead && !p.spectator) {
      const c = this.center(), pc = p.center();
      if (Math.abs(c[0] - pc[0]) < 1.3 && Math.abs(c[1] - pc[1]) < 1.6 && Math.abs(c[2] - pc[2]) < 1.3) {
        const left = p.inventory.add(this.stack.id, this.stack.count, this.stack.dmg);
        if (left < this.stack.count) game.onPickup();
        if (left <= 0) this.removed = true;
        else this.stack.count = left;
      }
    }
  }
};

VC.Arrow = class {
  constructor(world, owner, pos, vel, dmg) {
    this.world = world;
    this.owner = owner; // 'player' or Mob
    this.pos = pos.slice();
    this.vel = vel.slice();
    this.dmg = dmg;
    this.stuck = false;
    this.age = 0;
    this.removed = false;
    this.yaw = 0;
    this.pitch = 0;
    this.orient();
  }

  orient() {
    const v = this.vel;
    this.yaw = Math.atan2(v[0], v[2]);
    this.pitch = Math.atan2(v[1], Math.hypot(v[0], v[2]));
  }

  update(dt, game) {
    this.age += dt;
    if (this.stuck) {
      if (this.age > 60) this.removed = true;
      const p = game.player;
      if (!p.dead && !p.spectator && this.owner === 'player' && Math.hypot(p.pos[0] - this.pos[0], p.pos[1] + 0.9 - this.pos[1], p.pos[2] - this.pos[2]) < 1.5) {
        if (p.creative || p.inventory.add(VC.I.ARROW, 1) === 0) { this.removed = true; game.onPickup(); }
      }
      return;
    }
    if (this.age > 30) { this.removed = true; return; }
    if (this.crit && Math.random() < 0.8) game.particle(this.pos, 'spark', 1);
    this.vel[1] -= 20 * dt;
    const drag = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
    const k = VC.BP.liquid[drag] ? 0.5 : 0.995;
    for (let i = 0; i < 3; i++) this.vel[i] *= Math.pow(k, dt * 20);
    const step = Math.hypot(...this.vel) * dt, n = Math.max(1, Math.ceil(step / 0.25));
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt / n;
      const id = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
      const piece = this.world.pieceAt ? this.world.pieceAt(this.pos) : null;
      if (piece && game.onPieceHit) game.onPieceHit(piece, Math.ceil(Math.hypot(...this.vel) / 55 * 40));
      if (VC.BP.solid[id] || piece) {
        for (let i = 0; i < 3; i++) this.pos[i] -= this.vel[i] * dt / n * 0.5;
        this.stuck = true; this.age = 0;
        VC.Sound.arrowHit(this.pos);
        return;
      }
      const hit = game.entityAt(this.pos, this.owner);
      if (hit) {
        const speed = Math.hypot(...this.vel);
        let dmg = this.owner === 'player' ? Math.ceil(speed / 55 * 9) : this.dmg;
        if (this.crit) dmg += Math.floor(Math.random() * (dmg / 2 + 2));
        const src = [this.pos[0] - this.vel[0], 0, this.pos[2] - this.vel[2]];
        if (hit === game.player) hit.hurt(dmg, src, true, 'fue disparado por Esqueleto');
        else hit.hurt(dmg, src, game);
        VC.Sound.arrowHit(this.pos);
        this.removed = true;
        return;
      }
    }
    this.orient();
  }
};

// Owns all non-player entities: spawning, despawning, explosions, queries.
VC.EntityManager = class {
  static nextId = 0;
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 0;
  }

  add(e) {
    // Multiplayer guests forward most spawns to the host instead (netAdd returns false).
    if (this.game.netAdd && !this.game.netAdd(e)) return e;
    if (!e.netId) e.netId = ++VC.EntityManager.nextId;
    this.list.push(e);
    return e;
  }
  mobs() { return this.list.filter((e) => e instanceof VC.Mob); }

  update(dt) {
    const g = this.game, p = g.player;
    for (const e of this.list) {
      if (e.removed) continue;
      // Freeze entities whose chunk is not loaded.
      if (!g.world.getChunk(Math.floor(e.pos[0]) >> 4, Math.floor(e.pos[2]) >> 4)) continue;
      // One broken entity must not stall the rest of the tick (and keep re-running every frame).
      try {
        e.update(dt, g);
      } catch (err) {
        e.removed = true;
        console.error(err);
        continue;
      }
      if (e.netProxy) continue; // mirrored from the host, which decides when it goes away
      const q = g.targetFor && e instanceof VC.Mob ? g.targetFor(e) : p;
      const dx = e.pos[0] - q.pos[0], dz = e.pos[2] - q.pos[2];
      if (e instanceof VC.Mob && dx * dx + dz * dz > 100 * 100) e.removed = true;
      else if (e instanceof VC.Mob && e.def.hostile && dx * dx + dz * dz > 40 * 40 && Math.random() < dt / 30) e.removed = true;
      if (e.pos[1] < -64) e.removed = true;
    }
    // Hitting a zombie pigman angers every pigman nearby.
    for (const e of this.list) {
      if (!(e instanceof VC.Mob) || !e.angerShare || !e.def.neutral) continue;
      e.angerShare = false;
      for (const o of this.list) {
        if (o instanceof VC.Mob && o.type === e.type && o !== e && (o.pos[0] - e.pos[0]) ** 2 + (o.pos[2] - e.pos[2]) ** 2 < 32 * 32) o.provoked = Math.max(o.provoked, 40);
      }
    }
    this.list = this.list.filter((e) => !e.removed);
    this.spawnT += dt;
    if (this.spawnT >= 1) { this.spawnT = 0; this.trySpawn(); }
  }

  trySpawn() {
    const g = this.game, w = g.world, p = g.spawnAnchor ? g.spawnAnchor() : g.player;
    if (!g.rules.doMobSpawning || g.netNoSpawn) return;
    if (g.dim === 'nether') { this.trySpawnNether(); return; }
    let hostiles = 0, passives = 0;
    for (const e of this.list) if (e instanceof VC.Mob) { if (e.def.hostile) hostiles++; else passives++; }
    const P = VC.BP;
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 32;
      const x = Math.floor(p.pos[0] + Math.cos(a) * r), z = Math.floor(p.pos[2] + Math.sin(a) * r);
      const ch = w.getChunk(x >> 4, z >> 4);
      if (!ch || !w.neighborsReady(x >> 4, z >> 4)) continue;
      let top = Math.min(VC.CH - 1, ch.top);
      while (top > 0 && !P.solid[w.getBlock(x, top, z)] && !P.liquid[w.getBlock(x, top, z)]) top--;
      const passive = Math.random() < 0.3;
      if (passive) {
        if (passives >= 10 || g.day < 0.5) continue;
        if (w.getBlock(x, top, z) !== VC.B.GRASS) continue;
        const type = ['pig', 'cow', 'sheep', 'chicken'][Math.floor(Math.random() * 4)];
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.add(new VC.Mob(w, type, x + 0.5 + (Math.random() - 0.5) * 2, top + 1, z + 0.5 + (Math.random() - 0.5) * 2));
        passives += n;
      } else {
        if (hostiles >= 18 || g.difficulty === 'peaceful') continue;
        // Surface at night, or a random cave pocket.
        const y = Math.random() < 0.5 ? top + 1 : 5 + Math.floor(Math.random() * Math.max(1, top - 5));
        if (!P.solid[w.getBlock(x, y - 1, z)] || !P.opaque[w.getBlock(x, y - 1, z)]) continue;
        if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
        const light = Math.max(0, w.getSky(x, y, z) - Math.round(11 * (1 - g.day)));
        if (light > 7) continue;
        const types = ['zombie', 'skeleton', 'creeper', 'spider'];
        const type = types[Math.floor(Math.random() * types.length)];
        if (type === 'spider' && (w.getBlock(x + 1, y, z) !== 0 || w.getBlock(x, y, z + 1) !== 0)) continue;
        this.add(new VC.Mob(w, type, x + 0.5, y, z + 0.5));
        hostiles++;
      }
    }
  }

  trySpawnNether() {
    const g = this.game, w = g.world, p = g.spawnAnchor ? g.spawnAnchor() : g.player, P = VC.BP;
    let pigmen = 0, ghasts = 0;
    for (const e of this.list) if (e instanceof VC.Mob) { if (e.type === 'pigman') pigmen++; if (e.type === 'ghast') ghasts++; }
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 40;
      const x = Math.floor(p.pos[0] + Math.cos(a) * r), z = Math.floor(p.pos[2] + Math.sin(a) * r);
      const ch = w.getChunk(x >> 4, z >> 4);
      if (!ch || !w.neighborsReady(x >> 4, z >> 4)) continue;
      if (Math.random() < 0.12) {
        if (ghasts >= 3 || g.difficulty === 'peaceful') continue;
        const y = 45 + Math.floor(Math.random() * 50);
        let free = true;
        for (let dy = 0; dy < 5 && free; dy += 2) for (let dx = -2; dx <= 2 && free; dx += 2) for (let dz = -2; dz <= 2 && free; dz += 2)
          if (w.getBlock(x + dx, y + dy, z + dz) !== 0) free = false;
        if (free) { this.add(new VC.Mob(w, 'ghast', x + 0.5, y, z + 0.5)); ghasts++; }
      } else {
        if (pigmen >= 14 || g.difficulty === 'peaceful') continue;
        const y = 32 + Math.floor(Math.random() * 80);
        if (!P.opaque[w.getBlock(x, y - 1, z)] || w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
        const n = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.add(new VC.Mob(w, 'pigman', x + 0.5, y, z + 0.5));
        pigmen += n;
      }
    }
  }

  // Nearest living mob hit by a ray, within maxDist.
  raycast(o, d, maxDist) {
    let best = null, bt = maxDist;
    for (const e of this.list) {
      if (!(e instanceof VC.Mob) || e.dead) continue;
      const hw = e.hw + 0.1;
      const mn = [e.pos[0] - hw, e.pos[1], e.pos[2] - hw], mx = [e.pos[0] + hw, e.pos[1] + e.height + 0.1, e.pos[2] + hw];
      let t0 = 0, t1 = bt, ok = true;
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) ok = false; continue; }
        let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bt) { bt = t0; best = e; }
    }
    return best ? { mob: best, t: bt } : null;
  }
};

// Falling sand / gravel.
VC.FallingBlock = class extends VC.Entity {
  constructor(world, x, y, z, state) {
    super(world, 0.98, 0.98);
    this.pos = [x + 0.5, y, z + 0.5];
    this.state = state;
    this.stepHeight = 0;
  }

  update(dt, game) {
    this.age += dt;
    this._dt = dt;
    this.vel[1] = Math.max(-40, this.vel[1] - 32 * dt);
    this.move(0, this.vel[1] * dt, 0, false);
    if (this.onGround || this.age > 30) {
      const x = Math.floor(this.pos[0]), y = Math.round(this.pos[1]), z = Math.floor(this.pos[2]);
      const cur = this.world.getBlock(x, y, z);
      if (cur === 0 || VC.BP.replaceable[cur]) game.setBlock(x, y, z, this.state);
      else game.dropItem([x + 0.5, y + 0.5, z + 0.5], VC.stack(VC.BP.item[this.state] || this.state, 1));
      this.removed = true;
    }
  }
};

// Lit TNT: explodes after its fuse.
VC.PrimedTNT = class extends VC.Entity {
  constructor(world, x, y, z, fuse) {
    super(world, 0.98, 0.98);
    this.pos = [x + 0.5, y, z + 0.5];
    this.fuse = fuse === undefined ? 4 : fuse;
    this.vel = [(Math.random() - 0.5) * 0.4, 4, (Math.random() - 0.5) * 0.4];
    this.stepHeight = 0;
  }

  update(dt, game) {
    this._dt = dt;
    this.age += dt;
    this.vel[1] -= 32 * dt;
    this.vel[0] *= 0.98; this.vel[2] *= 0.98;
    this.move(this.vel[0] * dt, this.vel[1] * dt, this.vel[2] * dt, false);
    if (this.onGround) { this.vel[0] *= 0.7; this.vel[2] *= 0.7; }
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.removed = true;
      game.explode([this.pos[0], this.pos[1] + 0.49, this.pos[2]], 4, null);
    }
  }
};

// Snowballs, eggs, ender pearls, bottles o' enchanting.
VC.Thrown = class {
  constructor(world, owner, itemId, kind, pos, vel) {
    this.world = world;
    this.owner = owner;
    this.itemId = itemId;
    this.kind = kind;
    this.pos = pos.slice();
    this.vel = vel.slice();
    this.removed = false;
    this.age = 0;
  }

  center() { return this.pos; }

  impact(game, target, prev) {
    this.removed = true;
    const p = prev || this.pos;
    if (target) {
      if (target === game.player) target.hurt(this.kind === 'snowball' ? 0.01 : 0.01, p, true);
      else target.hurt(target.type === 'blaze' && this.kind === 'snowball' ? 3 : 0, p, game);
    }
    if (this.kind === 'egg' && Math.random() < 0.125) {
      const n = Math.random() < 1 / 32 ? 4 : 1;
      for (let i = 0; i < n; i++) {
        const c = game.entities.add(new VC.Mob(this.world, 'chicken', p[0], p[1], p[2]));
        c.baby = true;
      }
    }
    if (this.kind === 'pearl' && this.owner === 'player') {
      const pl = game.player, w = this.world;
      // Land on top of the block column we hit, never inside it.
      const x = Math.floor(p[0]), z = Math.floor(p[2]);
      let y = Math.floor(p[1]);
      while (y < VC.CH - 1 && (VC.BP.solid[w.getBlock(x, y, z)] || VC.BP.solid[w.getBlock(x, y + 1, z)])) y++;
      pl.pos = [p[0], Math.max(y, p[1]), p[2]];
      pl.vel = [0, 0, 0];
      pl.fallDist = 0;
      pl.invuln = 0;
      pl.hurt(5, null, false, 'cayó desde muy alto', false);
      VC.Sound.pop();
    }
    const fx = { pearl: 'portal', exp: 'spark', snowball: 'smoke', egg: 'smoke' }[this.kind];
    if (fx && game.particle) game.particle(p, fx, this.kind === 'exp' ? 12 : 4);
  }

  update(dt, game) {
    if (this.removed) return;
    this.age += dt;
    if (this.age > 20) { this.removed = true; return; }
    this.vel[1] -= 12 * dt;
    const n = Math.max(1, Math.ceil(Math.hypot(...this.vel) * dt / 0.25));
    for (let s = 0; s < n; s++) {
      const prev = this.pos.slice();
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt / n;
      const id = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
      if (VC.BP.solid[id] || VC.BP.liquid[id] || (this.world.pieceAt && this.world.pieceAt(this.pos))) { this.impact(game, null, prev); return; }
      if (this.age > 0.1) {
        const hit = game.entityAt(this.pos, this.owner);
        if (hit) { this.impact(game, hit); return; }
      }
    }
  }
};

// Firework rocket: climbs with a spark trail and bursts into coloured stars.
// When `rider` is set (used while gliding) it sticks to the player and boosts them.
VC.Firework = class {
  constructor(world, pos, rider) {
    this.world = world;
    this.itemId = VC.I.FIREWORKS;
    this.pos = pos.slice();
    this.rider = rider || null;
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.04;
    this.vel = [g(), 1, g()];
    this.removed = false;
    this.age = 0;
    // MC: 10 * (flight + 1) + rand(6) + rand(7) ticks, flight duration 1.
    this.life = (20 + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 7)) / 20;
  }

  center() { return this.pos; }

  update(dt, game) {
    if (this.removed) return;
    this.age += dt;
    if (this.rider) {
      const r = this.rider;
      if (r.gliding) r.boostT = Math.max(r.boostT, this.life - this.age);
      this.pos = [r.pos[0] + r.vel[0] * 0.05, r.pos[1] + 0.6, r.pos[2] + r.vel[2] * 0.05];
    } else {
      this.vel[1] += 16 * dt;
      const k = Math.pow(1.15, dt * 20);
      this.vel[0] *= k; this.vel[2] *= k;
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt;
      const id = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
      if (this.age > 0.1 && VC.BP.solid[id]) this.age = this.life;
    }
    if (game.fireworkTrail) game.fireworkTrail(this.pos);
    if (this.age >= this.life) {
      this.removed = true;
      if (game.fireworkBurst) game.fireworkBurst(this.pos);
    }
  }
};

// Ghast fireball: flies straight, explodes (small, with fire) on impact.
VC.Fireball = class {
  constructor(world, owner, pos, vel) {
    this.world = world;
    this.owner = owner;
    this.pos = pos.slice();
    this.vel = vel.slice();
    this.removed = false;
    this.age = 0;
  }

  center() { return this.pos; }

  update(dt, game) {
    this.age += dt;
    if (this.age > 12) { this.removed = true; return; }
    const n = Math.max(1, Math.ceil(Math.hypot(...this.vel) * dt / 0.3));
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < 3; i++) this.pos[i] += this.vel[i] * dt / n;
      const id = this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1]), Math.floor(this.pos[2]));
      const hit = this.age > 0.2 ? game.entityAt(this.pos, this.owner) : null;
      if (VC.BP.solid[id] || hit) {
        this.removed = true;
        if (hit) hit.hurt(6, this.pos, true, 'murió por una bola de fuego de Ghast', true);
        game.explode(this.pos, 1, this.owner, true);
        return;
      }
    }
    if (Math.random() < 0.5) game.particle(this.pos, 'smoke', 1);
  }
};
