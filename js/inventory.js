'use strict';

// A stack is { id, count, dmg } or null.
VC.stack = (id, count = 1, dmg = 0) => ({ id, count, dmg });

// Player inventory: 0-8 hotbar, 9-35 main, 36-39 armor. Containers reuse the class.
VC.Inventory = class {
  constructor(size = 36) {
    this.slots = new Array(size).fill(null);
    this.version = 0;
    this.addable = Math.min(size, 36);
  }

  changed() { this.version++; }

  // Adds a stack; returns how many items did not fit.
  add(id, count = 1, dmg = 0) {
    const max = VC.maxStack(id), n = this.addable;
    for (let i = 0; i < n && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max && max > 1) {
        const k = Math.min(count, max - s.count);
        s.count += k; count -= k;
      }
    }
    for (let i = 0; i < n && count > 0; i++) {
      if (!this.slots[i]) {
        const k = Math.min(count, max);
        this.slots[i] = VC.stack(id, k, dmg);
        count -= k;
      }
    }
    this.changed();
    return count;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  take(id, n) {
    let left = n;
    for (let i = this.addable - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const k = Math.min(left, s.count);
        s.count -= k; left -= k;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this.changed();
    return n - left;
  }

  serialize() { return this.slots.map((s) => (s ? [s.id, s.count, s.dmg] : null)); }

  load(arr) {
    if (!arr) return;
    for (let i = 0; i < this.slots.length && i < arr.length; i++) {
      const a = arr[i];
      this.slots[i] = a ? VC.stack(a[0], a[1], a[2] || 0) : null;
    }
    this.changed();
  }
};

// ---------- Crafting ----------
VC.Crafting = (function () {
  const I = VC.I, st = VC.st;
  const R = [];
  // Key values: exact id, {any: blockId} (any meta) or an array of accepted ids.
  const any = (bid) => ({ any: bid });
  const add = (shape, key, id, count = 1) => R.push({ shape, key, id, count });
  const shapeless = (ings, id, count = 1) => R.push({ ings, id, count });
  const PL = any(5), WOOL = any(35), COAL = [I.COAL, I.CHARCOAL];

  // Wood
  for (let w = 0; w < 6; w++) {
    const log = w < 4 ? st(17, w) : st(162, w - 4);
    add(['L'], { L: [log, log | 4, log | 8, log | 12] }, st(5, w), 4);
    add(['PPP'], { P: st(5, w) }, st(126, w), 6);
    add(['P  ', 'PP ', 'PPP'], { P: st(5, w) }, st([53, 134, 135, 136, 163, 164][w]), 4);
    add(['PSP', 'PSP'], { P: st(5, w), S: I.STICK }, st([85, 188, 189, 190, 192, 191][w]), 3);
    add(['SPS', 'SPS'], { P: st(5, w), S: I.STICK }, st([107, 183, 184, 185, 187, 186][w]));
    add(['PP', 'PP', 'PP'], { P: st(5, w) }, [I.WOOD_DOOR, I.SPRUCE_DOOR, I.BIRCH_DOOR, I.JUNGLE_DOOR, I.ACACIA_DOOR, I.DARK_OAK_DOOR][w], 3);
  }
  add(['P', 'P'], { P: PL }, I.STICK, 4);
  add(['PP', 'PP'], { P: PL }, st(58));
  add(['PPP', 'P P', 'PPP'], { P: PL }, st(54));
  add(['CCC', 'C C', 'CCC'], { C: st(4) }, st(61));
  add(['C', 'S'], { C: COAL, S: I.STICK }, st(50), 4);
  add(['S S', 'SSS', 'S S'], { S: I.STICK }, st(65), 3);
  add(['PPP', 'PPP'], { P: PL }, st(96), 2);
  add(['II', 'II'], { I: I.IRON_INGOT }, st(167));
  add(['II', 'II', 'II'], { I: I.IRON_INGOT }, I.IRON_DOOR, 3);
  add(['NNN', 'NNN'], { N: st(112) }, st(113), 6);
  add(['WWW', 'PPP'], { W: WOOL, P: PL }, I.BED);
  add(['PPP', 'PPP', ' S '], { P: PL, S: I.STICK }, I.SIGN, 3);
  add(['P P', ' P '], { P: PL }, I.BOWL, 4);
  add(['PPP', 'BBB', 'PPP'], { P: PL, B: I.BOOK }, st(47));
  add(['P P', 'PPP'], { P: PL }, I.BOAT);
  add(['PPP', 'PRP', 'PPP'], { P: PL, R: I.REDSTONE }, st(25));
  add(['PPP', 'PDP', 'PPP'], { P: PL, D: I.DIAMOND }, st(84));

  // Stone & building
  const slabs = [[st(1), 0], [any(24), 1], [st(4), 3], [st(45), 4], [any(98), 5], [st(112), 6], [any(155), 7]];
  for (const [mat, m] of slabs) add(['MMM'], { M: mat }, st(44, m), 6);
  add(['MMM'], { M: any(179) }, st(182), 6);
  const stairs = [[st(4), 67], [st(45), 108], [any(98), 109], [st(112), 114], [any(24), 128], [any(155), 156], [any(179), 180]];
  for (const [mat, id] of stairs) add(['M  ', 'MM ', 'MMM'], { M: mat }, st(id), 4);
  add(['SS', 'SS'], { S: st(1) }, st(98), 4);
  add(['SS', 'SS'], { S: st(12) }, st(24));
  add(['SS', 'SS'], { S: st(12, 1) }, st(179));
  add(['SS', 'SS'], { S: st(24) }, st(24, 2), 4);
  add(['SS', 'SS'], { S: st(179) }, st(179, 2), 4);
  add(['S', 'S'], { S: st(44, 1) }, st(24, 1));
  add(['S', 'S'], { S: st(182) }, st(179, 1));
  add(['S', 'S'], { S: st(44, 5) }, st(98, 3));
  add(['QQ', 'QQ'], { Q: I.QUARTZ }, st(155));
  add(['S', 'S'], { S: st(44, 7) }, st(155, 1));
  add(['Q', 'Q'], { Q: st(155) }, st(155, 2), 2);
  add(['CQ', 'QC'], { C: st(4), Q: I.QUARTZ }, st(1, 3), 2);
  shapeless([st(1, 3), I.QUARTZ], st(1, 1));
  shapeless([st(1, 3), st(4)], st(1, 5), 2);
  for (const [a, b] of [[1, 2], [3, 4], [5, 6]]) add(['SS', 'SS'], { S: st(1, a) }, st(1, b), 4);
  shapeless([st(4), st(106)], st(48));
  shapeless([st(98), st(106)], st(98, 1));
  add(['BB', 'BB'], { B: I.BRICK }, st(45));
  add(['NN', 'NN'], { N: I.NETHERBRICK }, st(112));
  add(['SS', 'SS'], { S: I.SNOWBALL }, st(80));
  add(['CC', 'CC'], { C: I.CLAY_BALL }, st(82));
  add(['GG', 'GG'], { G: I.GLOWSTONE_DUST }, st(89));
  add(['SS', 'SS'], { S: I.PRISMARINE_SHARD }, st(168));
  add(['SSS', 'SSS', 'SSS'], { S: I.PRISMARINE_SHARD }, st(168, 1));
  add(['SSS', 'SIS', 'SSS'], { S: I.PRISMARINE_SHARD, I: I.DYE }, st(168, 2));
  add(['SCS', 'CCC', 'SCS'], { S: I.PRISMARINE_SHARD, C: I.PRISMARINE_CRYSTALS }, st(169));
  add(['CCC', 'CCC'], { C: st(4) }, st(139), 6);
  add(['CCC', 'CCC'], { C: st(48) }, st(139, 1), 6);
  add(['GGG', 'GGG'], { G: st(20) }, st(102), 16);
  add(['III', 'III'], { I: I.IRON_INGOT }, st(101), 16);
  add(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: any(12) }, st(46));
  shapeless([st(86), st(50)], st(91));
  add(['SS', 'SS'], { S: I.STRING }, st(35));
  // Storage blocks
  const storage = [[I.IRON_INGOT, st(42)], [I.GOLD_INGOT, st(41)], [I.DIAMOND, st(57)], [I.EMERALD, st(133)], [I.DYE + 4, st(22)],
    [I.REDSTONE, st(152)], [I.COAL, st(173)], [I.WHEAT, st(170)], [I.SLIME_BALL, st(165)], [I.MELON, st(103)]];
  for (const [item, block] of storage) {
    add(['XXX', 'XXX', 'XXX'], { X: item }, block);
    if (block !== st(103)) add(['B'], { B: block }, item, 9);
  }
  add(['NNN', 'NNN', 'NNN'], { N: I.GOLD_NUGGET }, I.GOLD_INGOT);
  add(['G'], { G: I.GOLD_INGOT }, I.GOLD_NUGGET, 9);

  // Colours: wool / carpet / glass / clay. Dye meta d -> colour 15 - d.
  for (let c = 0; c < 16; c++) {
    const dye = I.DYE + (15 - c);
    shapeless([dye, st(35, 0)], st(35, c));
    add(['WW'], { W: st(35, c) }, st(171, c), 3);
    add(['GGG', 'GDG', 'GGG'], { G: st(20), D: dye }, st(95, c), 8);
    add(['GGG', 'GGG'], { G: st(95, c) }, st(160, c), 16);
    add(['CCC', 'CDC', 'CCC'], { C: st(172), D: dye }, st(159, c), 8);
  }
  const D = (c) => I.DYE + (15 - c); // dye item for colour c
  shapeless([st(38, 0)], D(14));
  shapeless([st(37)], D(4), 1);
  shapeless([st(38, 1)], D(3));
  shapeless([st(38, 2)], D(2));
  shapeless([st(38, 3)], D(8));
  shapeless([st(38, 4)], D(14));
  shapeless([st(38, 5)], D(1));
  shapeless([st(38, 6)], D(8));
  shapeless([st(38, 7)], D(6));
  shapeless([st(38, 8)], D(8));
  shapeless([st(175, 0)], D(4), 2);
  shapeless([st(175, 1)], D(2), 2);
  shapeless([st(175, 4)], D(14), 2);
  shapeless([st(175, 5)], D(6), 2);
  shapeless([I.BONE], I.BONE_MEAL, 3);
  shapeless([D(14), D(0)], D(6), 2);
  shapeless([D(14), D(4)], D(1), 2);
  shapeless([D(11), D(0)], D(3), 2);
  shapeless([D(14), D(11)], D(10), 2);
  shapeless([D(13), D(0)], D(5), 2);
  shapeless([D(13), D(11)], D(9), 2);
  shapeless([D(15), D(0)], D(7), 2);
  shapeless([D(7), D(0)], D(8), 2);
  shapeless([D(10), D(6)], D(2), 2);

  // Tools, weapons, armor
  const mats = [['WOOD', PL], ['STONE', st(4)], ['IRON', I.IRON_INGOT], ['DIAMOND', I.DIAMOND], ['GOLD', I.GOLD_INGOT]];
  for (const [m, mat] of mats) {
    add(['MMM', ' S ', ' S '], { M: mat, S: I.STICK }, I[m + '_PICK']);
    add(['MM', 'MS', ' S'], { M: mat, S: I.STICK }, I[m + '_AXE']);
    add(['M', 'S', 'S'], { M: mat, S: I.STICK }, I[m + '_SHOVEL']);
    add(['M', 'M', 'S'], { M: mat, S: I.STICK }, I[m + '_SWORD']);
    add(['MM', ' S', ' S'], { M: mat, S: I.STICK }, I[m + '_HOE']);
  }
  for (const [m, mat] of [['LEATHER', I.LEATHER], ['IRON', I.IRON_INGOT], ['DIAMOND', I.DIAMOND], ['GOLD', I.GOLD_INGOT]]) {
    add(['MMM', 'M M'], { M: mat }, I[m + '_HELMET']);
    add(['M M', 'MMM', 'MMM'], { M: mat }, I[m + '_CHESTPLATE']);
    add(['MMM', 'M M', 'M M'], { M: mat }, I[m + '_LEGGINGS']);
    add(['M M', 'M M'], { M: mat }, I[m + '_BOOTS']);
  }
  add([' TS', 'T S', ' TS'], { T: I.STICK, S: I.STRING }, I.BOW);
  add(['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, I.ARROW, 4);
  add(['  S', ' ST', 'S T'], { S: I.STICK, T: I.STRING }, I.FISHING_ROD);
  shapeless([I.IRON_INGOT, I.FLINT], I.FLINT_AND_STEEL);
  add([' I', 'I '], { I: I.IRON_INGOT }, I.SHEARS);
  add(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET);
  add([' I ', 'IRI', ' I '], { I: I.IRON_INGOT, R: I.REDSTONE }, I.COMPASS);
  add([' G ', 'GRG', ' G '], { G: I.GOLD_INGOT, R: I.REDSTONE }, I.CLOCK);
  add(['PPP', 'PCP', 'PPP'], { P: I.PAPER, C: I.COMPASS }, I.MAP_EMPTY);
  add(['SS ', 'SB ', '  S'], { S: I.STRING, B: I.SLIME_BALL }, I.LEAD, 2);
  add(['I I', 'III'], { I: I.IRON_INGOT }, I.MINECART);
  shapeless([I.MINECART, st(54)], I.CHEST_MINECART);
  shapeless([I.MINECART, st(61)], I.FURNACE_MINECART);
  shapeless([I.MINECART, st(46)], I.TNT_MINECART);
  shapeless([I.MINECART, st(154)], I.HOPPER_MINECART);
  add(['R ', ' C'], { R: I.FISHING_ROD, C: I.CARROT }, I.CARROT_ON_A_STICK);
  add(['I I', 'ISI', 'I I'], { I: I.IRON_INGOT, S: I.STICK }, st(66), 16);
  add(['G G', 'GSG', 'GRG'], { G: I.GOLD_INGOT, S: I.STICK, R: I.REDSTONE }, st(27), 6);
  add(['I I', 'IPI', 'IRI'], { I: I.IRON_INGOT, P: st(70), R: I.REDSTONE }, st(28), 6);
  add(['ISI', 'IRI', 'ISI'], { I: I.IRON_INGOT, S: I.STICK, R: st(76) }, st(157), 6);

  // Redstone
  add(['R', 'S'], { R: I.REDSTONE, S: I.STICK }, st(76));
  add(['S', 'C'], { S: I.STICK, C: st(4) }, st(69));
  shapeless([st(1)], st(77));
  shapeless([PL], st(143));
  add(['SS'], { S: st(1) }, st(70));
  add(['SS'], { S: PL }, st(72));
  add(['GG'], { G: I.GOLD_INGOT }, st(147));
  add(['II'], { I: I.IRON_INGOT }, st(148));
  add(['TRT', 'SSS'], { T: st(76), R: I.REDSTONE, S: st(1) }, I.REPEATER);
  add([' T ', 'TQT', 'SSS'], { T: st(76), Q: I.QUARTZ, S: st(1) }, I.COMPARATOR);
  add([' R ', 'RGR', ' R '], { R: I.REDSTONE, G: st(89) }, st(123));
  add(['PPP', 'CIC', 'CRC'], { P: PL, C: st(4), I: I.IRON_INGOT, R: I.REDSTONE }, st(33, 1));
  shapeless([I.SLIME_BALL, st(33, 1)], st(29, 1));
  add(['CCC', 'CBC', 'CRC'], { C: st(4), B: I.BOW, R: I.REDSTONE }, st(23));
  add(['CCC', 'C C', 'CRC'], { C: st(4), R: I.REDSTONE }, st(158));
  add(['I I', 'ICI', ' I '], { I: I.IRON_INGOT, C: st(54) }, st(154));
  shapeless([st(54), st(131)], st(146));
  add(['I', 'S', 'P'], { I: I.IRON_INGOT, S: I.STICK, P: PL }, st(131), 2);
  add(['GGG', 'QQQ', 'SSS'], { G: st(20), Q: I.QUARTZ, S: st(126) }, st(151));

  // Food
  add(['WWW'], { W: I.WHEAT }, I.BREAD);
  add(['MMM', 'SES', 'WWW'], { M: I.MILK, S: I.SUGAR, E: I.EGG, W: I.WHEAT }, I.CAKE);
  add(['WCW'], { W: I.WHEAT, C: I.DYE + 3 }, I.COOKIE, 8);
  shapeless([st(86), I.SUGAR, I.EGG], I.PUMPKIN_PIE);
  shapeless([st(39), st(40), I.BOWL], I.MUSHROOM_STEW);
  shapeless([I.RABBIT_COOKED, I.CARROT, I.BAKED_POTATO, st(39), I.BOWL], I.RABBIT_STEW);
  add(['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE }, I.GOLDEN_APPLE);
  add(['GGG', 'GAG', 'GGG'], { G: st(41), A: I.APPLE }, I.GOLDEN_APPLE + 1);
  add(['NNN', 'NCN', 'NNN'], { N: I.GOLD_NUGGET, C: I.CARROT }, I.GOLDEN_CARROT);
  add(['NNN', 'NMN', 'NNN'], { N: I.GOLD_NUGGET, M: I.MELON }, I.SPECKLED_MELON);
  shapeless([I.MELON], I.MELON_SEEDS);
  shapeless([st(86)], I.PUMPKIN_SEEDS, 4);
  shapeless([I.REEDS], I.SUGAR);
  add(['RRR'], { R: I.REEDS }, I.PAPER, 3);
  shapeless([I.PAPER, I.PAPER, I.PAPER, I.LEATHER], I.BOOK);
  shapeless([I.BOOK, I.DYE, I.FEATHER], I.WRITABLE_BOOK);
  add(['HH', 'HH'], { H: I.RABBIT_HIDE }, I.LEATHER);

  // Misc / decoration / brewing
  add([' B ', 'DOD', 'OOO'], { B: I.BOOK, D: I.DIAMOND, O: st(49) }, st(116));
  add(['BBB', ' I ', 'III'], { B: st(42), I: I.IRON_INGOT }, st(145));
  add(['I I', 'I I', 'III'], { I: I.IRON_INGOT }, I.CAULDRON);
  add([' B ', 'CCC'], { B: I.BLAZE_ROD, C: st(4) }, I.BREWING_STAND);
  add(['OOO', 'OEO', 'OOO'], { O: st(49), E: I.ENDER_EYE }, st(130));
  add(['GGG', 'GSG', 'OOO'], { G: st(20), S: I.NETHER_STAR, O: st(49) }, st(138));
  add(['B B', ' B '], { B: I.BRICK }, I.FLOWER_POT);
  add(['SSS', 'SLS', 'SSS'], { S: I.STICK, L: I.LEATHER }, I.ITEM_FRAME);
  add(['SSS', 'SWS', 'SSS'], { S: I.STICK, W: WOOL }, I.PAINTING);
  add(['SSS', ' S ', 'SPS'], { S: I.STICK, P: st(44) }, I.ARMOR_STAND);
  add(['G G', ' G '], { G: st(20) }, I.GLASS_BOTTLE, 3);
  shapeless([I.BLAZE_ROD], I.BLAZE_POWDER, 2);
  shapeless([I.ENDER_PEARL, I.BLAZE_POWDER], I.ENDER_EYE);
  shapeless([I.SLIME_BALL, I.BLAZE_POWDER], I.MAGMA_CREAM);
  shapeless([I.SPIDER_EYE, st(39), I.SUGAR], I.FERMENTED_SPIDER_EYE);
  shapeless([I.BLAZE_POWDER, I.COAL, I.GUNPOWDER], I.FIRE_CHARGE, 3);
  shapeless([I.PAPER, I.GUNPOWDER], I.FIREWORKS, 3);
  shapeless([I.GUNPOWDER, I.DYE + 1], I.FIREWORK_CHARGE);
  add(['L L', 'LSL', '   '], { L: I.LEATHER, S: I.STRING }, I.SADDLE);

  const keyMatch = (k, id) => {
    if (k === undefined) return false;
    if (Array.isArray(k)) return k.includes(id);
    if (typeof k === 'object') return id !== null && !VC.isItem(id) && (id >> 4) === k.any;
    return k === id;
  };

  // grid: array of stacks (w*w). Returns { id, count, recipe } or null.
  function match(grid, w) {
    let x0 = w, y0 = w, x1 = -1, y1 = -1;
    const ids = [];
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
      const s = grid[y * w + x];
      if (s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); ids.push(s.id); }
    }
    if (x1 < 0) return null;
    const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
    for (const r of R) {
      if (r.ings) {
        if (r.ings.length !== ids.length) continue;
        const left = ids.slice();
        let ok = true;
        for (const ing of r.ings) {
          const i = left.findIndex((id) => keyMatch(ing, id));
          if (i < 0) { ok = false; break; }
          left.splice(i, 1);
        }
        if (ok) return { id: r.id, count: r.count };
        continue;
      }
      const rh = r.shape.length, rw = Math.max(...r.shape.map((l) => l.length));
      if (rw !== gw || rh !== gh) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < rh && ok; y++) for (let x = 0; x < rw && ok; x++) {
          const ch = r.shape[y][mirror ? rw - 1 - x : x] || ' ';
          const s = grid[(y0 + y) * w + x0 + x];
          if (ch === ' ') { if (s) ok = false; }
          else if (!s || !keyMatch(r.key[ch], s.id)) ok = false;
        }
        if (ok) return { id: r.id, count: r.count };
      }
    }
    return null;
  }

  return { match, recipes: R };
})();

// ---------- Furnace ----------
VC.SMELT = (function () {
  const I = VC.I, st = VC.st, m = {};
  const add = (a, b) => { m[a] = b; };
  add(st(15), I.IRON_INGOT); add(st(14), I.GOLD_INGOT); add(st(56), I.DIAMOND); add(st(129), I.EMERALD);
  add(st(16), I.COAL); add(st(21), I.DYE + 4); add(st(73), I.REDSTONE); add(st(153), I.QUARTZ);
  add(st(12), st(20)); add(st(12, 1), st(20)); add(st(4), st(1)); add(I.CLAY_BALL, I.BRICK); add(st(82), st(172));
  add(st(87), I.NETHERBRICK); add(st(81), I.DYE + 2); add(st(19, 1), st(19)); add(st(98), st(98, 2));
  for (let w = 0; w < 4; w++) for (let a = 0; a < 4; a++) add(st(17, w | (a << 2)), I.CHARCOAL);
  for (let w = 0; w < 2; w++) for (let a = 0; a < 4; a++) add(st(162, w | (a << 2)), I.CHARCOAL);
  add(I.PORK_RAW, I.PORK_COOKED); add(I.BEEF_RAW, I.STEAK); add(I.CHICKEN_RAW, I.CHICKEN_COOKED);
  add(I.MUTTON_RAW, I.MUTTON_COOKED); add(I.RABBIT_RAW, I.RABBIT_COOKED); add(I.FISH, I.COOKED_FISH); add(I.FISH + 1, I.COOKED_FISH + 1);
  add(I.POTATO, I.BAKED_POTATO);
  return m;
})();

VC.Furnace = class {
  constructor(o) {
    this.input = null; this.fuel = null; this.output = null;
    this.burn = 0; this.burnMax = 0; this.cook = 0;
    if (o) Object.assign(this, o);
  }

  canSmelt() {
    if (!this.input) return false;
    const out = VC.SMELT[this.input.id];
    if (out === undefined) return false;
    return !this.output || (this.output.id === out && this.output.count < VC.maxStack(out));
  }

  tick(dt) {
    let changed = false;
    if (this.burn > 0) this.burn -= dt;
    const can = this.canSmelt();
    if (this.burn <= 0 && can && this.fuel) {
      const f = (VC.item(this.fuel.id) || {}).fuel;
      if (f) {
        this.burn = this.burnMax = f;
        if (this.fuel.id === VC.I.LAVA_BUCKET) this.fuel = VC.stack(VC.I.BUCKET, 1);
        else if (--this.fuel.count <= 0) this.fuel = null;
        changed = true;
      }
    }
    if (this.burn > 0 && can) {
      this.cook += dt;
      if (this.cook >= 10) {
        this.cook = 0;
        const out = VC.SMELT[this.input.id];
        if (this.output) this.output.count++;
        else this.output = VC.stack(out, 1);
        if (--this.input.count <= 0) this.input = null;
        changed = true;
      }
    } else if (this.cook > 0) {
      this.cook = Math.max(0, this.cook - dt * 2);
    }
    if (this.burn < 0) this.burn = 0;
    return changed;
  }

  get lit() { return this.burn > 0; }

  serialize() {
    const s = (x) => (x ? [x.id, x.count, x.dmg] : null);
    return { i: s(this.input), f: s(this.fuel), o: s(this.output), b: this.burn, bm: this.burnMax, c: this.cook };
  }

  static load(o) {
    const s = (a) => (a ? VC.stack(a[0], a[1], a[2] || 0) : null);
    return new VC.Furnace({ input: s(o.i), fuel: s(o.f), output: s(o.o), burn: o.b, burnMax: o.bm, cook: o.c });
  }
};
