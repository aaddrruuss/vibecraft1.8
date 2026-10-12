'use strict';

// Non-cube block geometry: boxes for rendering, collision and selection, plus
// placement rules (orientation, two-block doors/beds, support requirements).
VC.Shapes = (function () {
  const P = VC.BP, S = VC.SHAPE;
  const px = (a) => a.map((v) => v / 16);

  // Rotate a box (defined for facing south / +Z) around the block centre.
  function rot(b, f) {
    const tr = (x, z) => {
      switch (f & 3) {
        case 1: return [1 - z, x];
        case 2: return [1 - x, 1 - z];
        case 3: return [z, 1 - x];
        default: return [x, z];
      }
    };
    const [ax, az] = tr(b[0], b[2]), [bx, bz] = tr(b[3], b[5]);
    return [Math.min(ax, bx), b[1], Math.min(az, bz), Math.max(ax, bx), b[4], Math.max(az, bz)];
  }

  const FULL = [0, 0, 0, 1, 1, 1];
  const isFence = (s) => P.shape[s] === S.fence || P.shape[s] === S.gate;
  const isPane = (s) => P.shape[s] === S.pane;
  const isWall = (s) => P.shape[s] === S.wall || P.shape[s] === S.gate;
  // nb(dx, dy, dz) -> neighbour state
  function connections(nb, test) {
    const out = [];
    for (let f = 0; f < 4; f++) {
      const [dx, dz] = VC.FACING_DIR[f];
      const n = nb(dx, 0, dz);
      out.push(test(n) || P.opaque[n] === 1);
    }
    return out; // indexed by facing
  }

  // ---------- render boxes ----------
  function boxes(s, nb) {
    const m = s & 15, sh = P.shape[s];
    switch (sh) {
      case S.slab: return [(m & 8) ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
      case S.stairs: {
        const up = (m & 4) !== 0, f = m & 3;
        const base = up ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
        const step = rot(up ? [0, 0, 0.5, 1, 0.5, 1] : [0, 0.5, 0.5, 1, 1, 1], f);
        return [base, step];
      }
      case S.fence: {
        const c = connections(nb, isFence);
        const out = [px([6, 0, 6, 10, 16, 10])];
        c.forEach((on, f) => {
          if (!on) return;
          out.push(rot(px([7, 12, 10, 9, 15, 16]), f));
          out.push(rot(px([7, 6, 10, 9, 9, 16]), f));
        });
        return out;
      }
      case S.wall: {
        const c = connections(nb, isWall);
        const straight = (c[0] && c[2] && !c[1] && !c[3]) || (c[1] && c[3] && !c[0] && !c[2]);
        const out = straight ? [] : [px([4, 0, 4, 12, 16, 12])];
        c.forEach((on, f) => { if (on) out.push(rot(px([5, 0, straight ? 8 : 12, 11, 13, 16]), f)); });
        if (straight) out.push(c[0] ? px([5, 0, 0, 11, 13, 16]) : px([0, 0, 5, 16, 13, 11]));
        return out;
      }
      case S.pane: {
        const c = connections(nb, isPane);
        if (!c.some(Boolean)) return [px([7, 0, 0, 9, 16, 16]), px([0, 0, 7, 16, 16, 9])];
        const out = [px([7, 0, 7, 9, 16, 9])];
        c.forEach((on, f) => { if (on) out.push(rot(px([7, 0, 9, 9, 16, 16]), f)); });
        return out;
      }
      case S.torch:
        if (m === 0 || m === 5) return [px([7, 0, 7, 9, 10, 9])];
        return [rot(px([7, 3, 14, 9, 13, 16]), (m - 1) & 3)];
      case S.ladder: case S.vine: return [rot(px([0, 0, 15, 16, 16, 16]), m & 3)];
      case S.door: {
        const f = m & 3, open = (m & 4) !== 0;
        return [rot(px([0, 0, 13, 16, 16, 16]), open ? (f + 1) & 3 : f)];
      }
      case S.trapdoor: {
        const open = (m & 4) !== 0, top = (m & 8) !== 0;
        if (open) return [rot(px([0, 0, 13, 16, 16, 16]), m & 3)];
        return [top ? px([0, 13, 0, 16, 16, 16]) : px([0, 0, 0, 16, 3, 16])];
      }
      case S.gate: {
        const f = m & 3, open = (m & 4) !== 0;
        const r = (b) => rot(px(b), f & 1 ? 1 : 0);
        if (open) return [r([0, 5, 7, 2, 16, 9]), r([14, 5, 7, 16, 16, 9]), r([0, 6, 9, 2, 15, 16]), r([14, 6, 9, 16, 15, 16])];
        return [r([0, 5, 7, 2, 16, 9]), r([14, 5, 7, 16, 16, 9]), r([2, 6, 7, 14, 9, 9]), r([2, 12, 7, 14, 15, 9])];
      }
      case S.bed: return [[0, 0, 0, 1, 9 / 16, 1]];
      case S.carpet: return [[0, 0, 0, 1, 1 / 16, 1]];
      case S.snow: return [[0, 0, 0, 1, ((m & 7) + 1) / 8, 1]];
      case S.plate: return [px([1, 0, 1, 15, 1, 15])];
      case S.button: return [rot(px([5, 6, 14, 11, 10, 16]), (m - 1) & 3)];
      case S.lever:
        if (m === 0 || m === 8) return [px([4, 0, 5, 12, 3, 11]), px([7, 3, 7, 9, 11, 9])];
        return [rot(px([5, 4, 13, 11, 12, 16]), (m - 1) & 3), rot(px([7, 7, 6, 9, 9, 13]), (m - 1) & 3)];
      case S.cake: return [px([1 + 2 * (m & 7), 0, 1, 15, 8, 15])];
      case S.chest: return [px([1, 0, 1, 15, 14, 15])];
      case S.box: return [P.box[s] || FULL];
      case S.rail: return [[0, 0, 0, 1, 1 / 16, 1]];
      case S.dust: return [[0, 0, 0, 1, 1 / 32, 1]];
      case S.lilypad: return [[0, 0, 0, 1, 1 / 32, 1]];
      case S.cactus: return [px([1, 0, 1, 15, 16, 15])];
      case S.pot: return [px([5, 0, 5, 11, 6, 11])];
      case S.skull: return [px([4, 0, 4, 12, 8, 12])];
      case S.anvil: {
        const f = m & 3;
        return [px([2, 0, 2, 14, 4, 14]), rot(px([4, 4, 3, 12, 5, 13]), f), rot(px([6, 5, 4, 10, 10, 12]), f), rot(px([3, 10, 0, 13, 16, 16]), f)];
      }
      case S.hopper: return [px([0, 10, 0, 16, 16, 16]), px([4, 4, 4, 12, 10, 12]), px([6, 0, 6, 10, 4, 10])];
      case S.cauldron: return [px([0, 3, 0, 16, 4, 16]), px([0, 3, 0, 2, 16, 16]), px([14, 3, 0, 16, 16, 16]), px([2, 3, 0, 14, 16, 2]), px([2, 3, 14, 14, 16, 16]),
        px([0, 0, 0, 4, 3, 4]), px([12, 0, 0, 16, 3, 4]), px([0, 0, 12, 4, 3, 16]), px([12, 0, 12, 16, 3, 16])];
      case S.brewing: return [px([1, 0, 1, 15, 2, 15]), px([7, 2, 7, 9, 14, 9])];
      case S.sign: return [px([7, 0, 7, 9, 9, 9]), rot(px([0, 9, 7, 16, 16, 9]), m & 3)];
      case S.portal: return (m & 3) === 2 ? [px([6, 0, 0, 10, 16, 16])] : [px([0, 0, 6, 16, 16, 10])];
      case S.wallsign: return [rot(px([0, 4, 14, 16, 12, 16]), m & 3)];
      default: return [FULL];
    }
  }

  // ---------- collision ----------
  function collision(s, nb) {
    if (!P.solid[s]) return null;
    const sh = P.shape[s], m = s & 15;
    switch (sh) {
      case S.cube: case S.liquid: return [FULL];
      case S.fence: case S.wall: {
        const c = connections(nb, sh === S.fence ? isFence : isWall);
        const w = sh === S.fence ? [6, 10] : [4, 12];
        const out = [[w[0] / 16, 0, w[0] / 16, w[1] / 16, 1.5, w[1] / 16]];
        c.forEach((on, f) => { if (on) out.push(rot([w[0] / 16, 0, w[1] / 16, w[1] / 16, 1.5, 1], f)); });
        return out;
      }
      case S.pane: return boxes(s, nb);
      case S.gate: {
        if (m & 4) return null;
        return [rot([0, 0, 6 / 16, 1, 1.5, 10 / 16], m & 1 ? 1 : 0)];
      }
      case S.snow: return (m & 7) === 0 ? null : [[0, 0, 0, 1, (m & 7) / 8, 1]];
      case S.cross: case S.crop: case S.fire: case S.torch: case S.rail: case S.dust: case S.plate: case S.button:
      case S.lever: case S.vine: case S.sign: case S.wallsign: case S.portal: return null;
      case S.box: if ((s >> 4) === 88) return [[0, 0, 0, 1, 14 / 16, 1]]; return boxes(s, nb);
      default: return boxes(s, nb);
    }
  }

  // ---------- selection (for raycast / outline) ----------
  function selection(s, nb) {
    const sh = P.shape[s];
    if (sh === S.cube || sh === S.liquid) return [FULL];
    if (sh === S.cross || sh === S.fire) return [px([2, 0, 2, 14, 14, 14])];
    if (sh === S.crop) return [[0, 0, 0, 1, 0.25 + 0.75 * Math.min(1, ((s & 15) + 1) / 8), 1]];
    return boxes(s, nb);
  }

  function union(list) {
    const u = [1, 1, 1, 0, 0, 0];
    for (const b of list) for (let i = 0; i < 3; i++) { u[i] = Math.min(u[i], b[i]); u[i + 3] = Math.max(u[i + 3], b[i + 3]); }
    return u;
  }

  // ---------- placement ----------
  function playerFacing(yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 3 : 1;
    return fz > 0 ? 0 : 2;
  }
  // Facing index of a horizontal normal pointing from the new block towards the clicked block.
  function facingOfDir(dx, dz) {
    if (dz > 0) return 0; if (dx < 0) return 1; if (dz < 0) return 2; if (dx > 0) return 3; return -1;
  }

  // Returns a list of [x, y, z, state] to place, or null if not allowed.
  function place(s, t, hit, player, world) {
    const id = s >> 4, sh = P.shape[s], meta = s & 15;
    const pf = playerFacing(player.yaw);
    const [x, y, z] = t;
    const ny = hit.ny, wallF = facingOfDir(-hit.nx, -hit.nz);
    const hy = hit.py - Math.floor(hit.py); // fractional hit height
    const below = world.getBlock(x, y - 1, z);
    const solidBelow = P.opaque[below] || P.shape[below] === S.slab && (below & 8) || P.shape[below] === S.stairs;
    const free = (bx, by, bz) => { const b = world.getBlock(bx, by, bz); return b === 0 || P.replaceable[b]; };
    const B = (st) => [[x, y, z, st]];

    // Pillars: logs, hay bales, quartz pillar.
    if (id === 17 || id === 162 || id === 170) {
      const ax = hit.ny ? 0 : hit.nx ? 1 : 2;
      return B((id << 4) | (meta & 3) | (ax << 2));
    }
    if (id === 155 && meta === 2) return B((id << 4) | (hit.ny ? 2 : hit.nx ? 3 : 4));
    switch (sh) {
      case S.slab: {
        // Stack onto a matching slab to make a double slab.
        const cur = world.getBlock(x, y, z);
        const top = ny < 0 || (ny === 0 && hy > 0.5);
        return B(s | (top ? 8 : 0));
      }
      case S.stairs: return B((id << 4) | pf | ((ny < 0 || (ny === 0 && hy > 0.5)) ? 4 : 0));
      case S.torch: {
        if (ny > 0) return solidBelow ? B(id << 4 | 0) : null;
        if (ny < 0 || wallF < 0) return null;
        return B((id << 4) | (wallF + 1));
      }
      case S.button: case S.ladder: case S.vine: {
        if (ny !== 0 || wallF < 0) return null;
        return B((id << 4) | (sh === S.button ? wallF + 1 : wallF));
      }
      case S.lever: {
        if (ny > 0) return solidBelow ? B(id << 4) : null;
        if (ny < 0 || wallF < 0) return null;
        return B((id << 4) | (wallF + 1));
      }
      case S.sign: {
        if (ny === 0 && wallF >= 0) return B(VC.st(68, wallF));
        if (ny > 0) return B(VC.st(63, (pf + 2) & 3));
        return null;
      }
      case S.door: {
        if (!solidBelow || !free(x, y + 1, z)) return null;
        return [[x, y, z, (id << 4) | pf], [x, y + 1, z, (id << 4) | pf | 8]];
      }
      case S.bed: {
        const [dx, dz] = VC.FACING_DIR[pf];
        if (!solidBelow || !free(x + dx, y, z + dz)) return null;
        const b2 = world.getBlock(x + dx, y - 1, z + dz);
        if (!P.opaque[b2]) return null;
        return [[x, y, z, (id << 4) | pf], [x + dx, y, z + dz, (id << 4) | pf | 8]];
      }
      case S.trapdoor: {
        if (ny === 0 && wallF >= 0) return B((id << 4) | wallF | (hy > 0.5 ? 8 : 0));
        return B((id << 4) | ((pf + 2) & 3) | (ny < 0 ? 8 : 0));
      }
      case S.gate: case S.chest: case S.anvil: case S.skull:
        return B((id << 4) | ((pf + 2) & 3));
      case S.rail: return solidBelow ? B((id << 4) | (pf & 1)) : null;
      case S.dust: case S.carpet: case S.plate: case S.pot: case S.cake: case S.brewing:
        return P.solid[below] || solidBelow ? B(s) : null;
      case S.snow: return solidBelow ? B(id << 4) : null;
      case S.lilypad: return VC.waterLevel(below) === 0 ? B(s) : null;
      case S.cactus: return (below === s || (below >> 4) === 12) ? B(s) : null;
    }
    if (sh === S.cross) {
      // Plants need suitable ground.
      if (id === 175) {
        if (!free(x, y + 1, z) || !P.opaque[below]) return null;
        return [[x, y, z, VC.st(175, meta & 7)], [x, y + 1, z, VC.st(175, (meta & 7) | 8)]];
      }
      if (id === 83) {
        if (below === s) return B(s);
        if (!((below >> 4) === 2 || (below >> 4) === 3 || (below >> 4) === 12)) return null;
        const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => VC.isWater(world.getBlock(x + dx, y - 1, z + dz)));
        return nearWater ? B(s) : null;
      }
      if (id === 30) return B(s);
      if (id === 39 || id === 40) return P.opaque[below] ? B(s) : null;
      const soil = [2, 3, 60].includes(below >> 4) || (id === 32 && (below >> 4) === 12);
      return soil ? B(s) : null;
    }
    if (sh === S.crop) {
      const need = id === 115 ? 88 : 60;
      return (below >> 4) === need ? B(id << 4) : null;
    }
    // Facing blocks (front looks at the player).
    if ([23, 158, 61, 62, 86, 91].includes(id)) return B((id << 4) | ((pf + 2) & 3));
    if (id === 29 || id === 33) {
      const pitch = player.pitch;
      let d;
      if (pitch < -0.8) d = 1; else if (pitch > 0.8) d = 0;
      else d = [3, 4, 2, 5][pf] ^ 1; // face the player
      return B((id << 4) | d);
    }
    if (id === 154) return B(id << 4);
    return B(s);
  }

  return { boxes, collision, selection, union, rot, place, playerFacing };
})();
