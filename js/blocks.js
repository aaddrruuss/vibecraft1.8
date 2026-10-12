'use strict';

// Block states are 16-bit: (blockId << 4) | meta, using the real Minecraft 1.8 ids.
// Item stacks use the same encoding: blocks < 4096, items (mc id >= 256) >= 4096.
VC.st = (id, meta = 0) => (id << 4) | meta;
VC.bid = (s) => s >> 4;
VC.bmeta = (s) => s & 15;
VC.ITEM_START = 4096;
VC.isItem = (id) => id >= VC.ITEM_START;
VC.NSTATES = 4096;
VC.ATLAS_TILES = 32; // block atlas is 32x32 tiles of 16px

// Texture atlas tiles are allocated by name; textures.js paints them.
VC.TILES = [];
VC.TILE_INDEX = {};
VC.tile = function (name) {
  let i = VC.TILE_INDEX[name];
  if (i === undefined) { i = VC.TILES.length; VC.TILES.push(name); VC.TILE_INDEX[name] = i; }
  return i;
};
for (let i = 0; i < 10; i++) VC.tile('destroy_' + i);
VC.TILE = { DESTROY: VC.TILE_INDEX.destroy_0, WATER: VC.tile('water'), LAVA: VC.tile('lava') };

// Horizontal facing (0 south +Z, 1 west -X, 2 north -Z, 3 east +X) -> mesher face index.
// Mesher faces: 0 +X, 1 -X, 2 +Y, 3 -Y, 4 +Z, 5 -Z.
VC.FACE_OF_FACING = [4, 1, 5, 0];
VC.FACING_DIR = [[0, 1], [-1, 0], [0, -1], [1, 0]];

VC.COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
VC.COLOR_RGB = [[234, 236, 236], [240, 118, 19], [189, 68, 179], [58, 175, 217], [248, 198, 39], [112, 185, 25], [237, 141, 172], [62, 68, 71],
  [142, 142, 134], [21, 137, 145], [121, 42, 172], [53, 57, 157], [114, 71, 40], [84, 109, 27], [161, 39, 34], [20, 21, 25]];
VC.COLOR_F = ['blanca', 'naranja', 'magenta', 'azul claro', 'amarilla', 'verde lima', 'rosa', 'gris', 'gris claro', 'cian', 'morada', 'azul', 'marrón', 'verde', 'roja', 'negra'];
VC.COLOR_M = ['blanco', 'naranja', 'magenta', 'azul claro', 'amarillo', 'verde lima', 'rosa', 'gris', 'gris claro', 'cian', 'morado', 'azul', 'marrón', 'verde', 'rojo', 'negro'];
VC.WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'big_oak'];
VC.WOOD_ES = ['roble', 'abeto', 'abedul', 'jungla', 'acacia', 'roble oscuro'];

VC.SHAPES = ['cube', 'cross', 'liquid', 'slab', 'stairs', 'fence', 'wall', 'pane', 'torch', 'ladder', 'door', 'trapdoor', 'gate', 'bed',
  'carpet', 'snow', 'plate', 'button', 'lever', 'cake', 'chest', 'box', 'rail', 'dust', 'crop', 'cactus', 'vine', 'lilypad', 'pot',
  'skull', 'anvil', 'hopper', 'cauldron', 'brewing', 'sign', 'wallsign', 'fire', 'none', 'portal'];
VC.SHAPE = {};
VC.SHAPES.forEach((n, i) => { VC.SHAPE[n] = i; });

(function () {
  const N = VC.NSTATES;
  const P = VC.BP = {
    exists: new Uint8Array(N),
    opaque: new Uint8Array(N),      // full, light-blocking cube (culls neighbours)
    solid: new Uint8Array(N),       // has collision
    cross: new Uint8Array(N),       // rendered as crossed sprites
    liquid: new Uint8Array(N),
    translucent: new Uint8Array(N), // drawn in the blended pass
    atten: new Uint8Array(N),
    light: new Uint8Array(N),       // block light emission
    shape: new Uint8Array(N),
    tex: new Uint16Array(N * 6),
    hardness: new Float32Array(N),
    tier: new Int8Array(N),
    replaceable: new Uint8Array(N),
    gravity: new Uint8Array(N),
    climb: new Uint8Array(N),
    tool: [],
    drop: [],
    name: [],
    key: [],
    item: new Int32Array(N),        // item stack id that this state drops / picks as
    itemFn: [],
    sound: [],
    box: [],                        // optional custom box for 'box' shape [x0,y0,z0,x1,y1,z1]
    tab: [],
  };
  VC.BLOCK_KEYS = {}; // registry name -> state
  VC.CREATIVE_BLOCKS = []; // [stateId, tab]
  const T = VC.tile;

  // ---------- texture spec helpers (return fn(meta, face) -> tile name) ----------
  const all = (n) => () => n;
  const tbs = (t, b, s) => (m, f) => (f === 2 ? t : f === 3 ? b : s);
  const facingTex = (front, side, top, bottom) => (m, f) => {
    if (f === 2) return top;
    if (f === 3) return bottom || top;
    return f === VC.FACE_OF_FACING[m & 3] ? front : side;
  };
  // Logs / pillars: axis in bits 2-3 (0 y, 1 x, 2 z, 3 bark everywhere)
  const pillar = (end, side) => (m, f) => {
    const ax = (m >> 2) & 3;
    if (ax === 3) return side;
    const endFaces = ax === 0 ? [2, 3] : ax === 1 ? [0, 1] : [4, 5];
    return endFaces.includes(f) ? end : side;
  };

  function def(id, key, o) {
    const names = o.names || [o.name];
    const variant = o.variant || ((m) => (names.length > 1 ? m : 0));
    for (let m = 0; m < 16; m++) {
      const s = (id << 4) | m;
      if (o.validMeta && !o.validMeta(m)) continue;
      const v = variant(m);
      if (v >= names.length) continue;
      P.exists[s] = 1;
      const shape = VC.SHAPE[o.shape || 'cube'];
      P.shape[s] = shape;
      const isCube = shape === VC.SHAPE.cube;
      P.opaque[s] = o.opaque !== undefined ? (o.opaque ? 1 : 0) : (isCube && !o.transparent ? 1 : 0);
      P.solid[s] = o.solid !== undefined ? (o.solid ? 1 : 0) : 1;
      P.cross[s] = shape === VC.SHAPE.cross || shape === VC.SHAPE.crop || shape === VC.SHAPE.fire ? 1 : 0;
      P.liquid[s] = shape === VC.SHAPE.liquid ? 1 : 0;
      P.translucent[s] = o.translucent ? 1 : 0;
      P.atten[s] = P.opaque[s] ? 15 : (o.atten || 0);
      P.light[s] = typeof o.light === 'function' ? o.light(m) : (o.light || 0);
      P.hardness[s] = o.hardness !== undefined ? o.hardness : 1;
      P.tier[s] = o.tier !== undefined ? o.tier : -1;
      P.tool[s] = o.tool;
      P.replaceable[s] = o.replaceable ? 1 : 0;
      P.gravity[s] = o.gravity ? 1 : 0;
      P.climb[s] = o.climb ? 1 : 0;
      P.sound[s] = o.sound || 'stone';
      P.box[s] = o.box;
      P.name[s] = typeof names[v] === 'function' ? names[v](m) : names[v];
      P.key[s] = o.keys ? o.keys[v] : key;
      const tex = typeof o.tex === 'function' ? o.tex : typeof o.tex === 'string' ? all(o.tex) : o.tex ? tbs(o.tex.top, o.tex.bottom || o.tex.top, o.tex.side) : all(key);
      for (let f = 0; f < 6; f++) P.tex[s * 6 + f] = T(tex(m, f, v));
      const itemMeta = o.itemMeta ? o.itemMeta(m) : v;
      if (typeof o.item === 'function') { P.itemFn[s] = o.item; P.item[s] = -1; }
      else P.item[s] = o.item !== undefined ? o.item : (id << 4) | itemMeta;
      P.drop[s] = o.drop || null; // null -> default (drop own item)
      P.tab[s] = o.tab;
    }
    const keys = o.keys || [key];
    keys.forEach((k, i) => { if (k && VC.BLOCK_KEYS[k] === undefined) VC.BLOCK_KEYS[k] = (id << 4) | (o.creativeMetas ? o.creativeMetas[i] : i); });
    if (o.tab) {
      const metas = o.creativeMetas || names.map((_, i) => i);
      for (const m of metas) VC.CREATIVE_BLOCKS.push([(id << 4) | m, o.tab]);
    }
  }
  VC.defBlock = def;

  const C = VC.COLORS, CF = VC.COLOR_F, CM = VC.COLOR_M, W = VC.WOODS, WES = VC.WOOD_ES;
  const B = 'building', D = 'decoration', R = 'redstone', TR = 'transport', MI = 'misc';
  const none = () => null;
  const dropItem = (sid, min = 1, max = min) => () => [sid, min + Math.floor(Math.random() * (max - min + 1))];

  P.name[0] = 'Aire'; P.key[0] = 'air'; P.exists[0] = 1; P.replaceable[0] = 1; VC.BLOCK_KEYS.air = 0;
  P.shape[0] = VC.SHAPE.none;

  def(1, 'stone', {
    names: ['Piedra', 'Granito', 'Granito pulido', 'Diorita', 'Diorita pulida', 'Andesita', 'Andesita pulida'],
    keys: ['stone', 'granite', 'polished_granite', 'diorite', 'polished_diorite', 'andesite', 'polished_andesite'],
    tex: (m) => ['stone', 'granite', 'granite_smooth', 'diorite', 'diorite_smooth', 'andesite', 'andesite_smooth'][m],
    hardness: 1.5, tool: 'pick', tier: 0, tab: B,
    drop: (m) => (m === 0 ? [VC.st(4), 1] : [VC.st(1, m), 1]),
  });
  def(2, 'grass', { name: 'Bloque de hierba', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', tab: B, drop: dropItem(VC.st(3)) });
  def(3, 'dirt', {
    names: ['Tierra', 'Tierra estéril', 'Podzol'], keys: ['dirt', 'coarse_dirt', 'podzol'],
    tex: (m, f) => (m === 2 ? (f === 2 ? 'podzol_top' : f === 3 ? 'dirt' : 'podzol_side') : m === 1 ? 'coarse_dirt' : 'dirt'),
    hardness: 0.5, tool: 'shovel', sound: 'gravel', tab: B, drop: (m) => [VC.st(3, m === 1 ? 1 : 0), 1],
  });
  def(4, 'cobblestone', { name: 'Roca', tex: 'cobblestone', hardness: 2, tool: 'pick', tier: 0, tab: B });
  def(5, 'planks', { names: WES.map((w) => `Tablas de ${w}`), keys: W.map((w) => w + '_planks'), tex: (m) => 'planks_' + W[m], hardness: 2, tool: 'axe', sound: 'wood', tab: B });
  def(6, 'sapling', {
    names: WES.map((w) => `Brote de ${w}`), keys: W.map((w) => w + '_sapling'), variant: (m) => m & 7,
    shape: 'cross', solid: false, transparent: true, tex: (m) => 'sapling_' + W[m & 7], hardness: 0, sound: 'grass', tab: D, itemMeta: (m) => m & 7,
  });
  def(7, 'bedrock', { name: 'Piedra base', tex: 'bedrock', hardness: -1, tab: B });
  def(9, 'water', { name: 'Agua', shape: 'liquid', solid: false, translucent: true, atten: 2, tex: 'water', hardness: -1, replaceable: true, drop: none, sound: 'water' });
  def(11, 'lava', { name: 'Lava', shape: 'liquid', solid: false, atten: 0, light: 15, tex: 'lava', hardness: -1, replaceable: true, drop: none, sound: 'water' });
  def(12, 'sand', { names: ['Arena', 'Arena roja'], keys: ['sand', 'red_sand'], tex: (m) => (m ? 'red_sand' : 'sand'), hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand', tab: B });
  def(13, 'gravel', { name: 'Grava', tex: 'gravel', hardness: 0.6, tool: 'shovel', gravity: true, sound: 'gravel', tab: B, drop: () => (Math.random() < 0.1 ? [VC.I.FLINT, 1] : [VC.st(13), 1]) });
  def(14, 'gold_ore', { name: 'Mena de oro', tex: 'gold_ore', hardness: 3, tool: 'pick', tier: 2, tab: B });
  def(15, 'iron_ore', { name: 'Mena de hierro', tex: 'iron_ore', hardness: 3, tool: 'pick', tier: 1, tab: B });
  def(16, 'coal_ore', { name: 'Mena de carbón', tex: 'coal_ore', hardness: 3, tool: 'pick', tier: 0, tab: B, drop: () => [VC.I.COAL, 1] });
  const logNames = (ws) => ws.map((w) => `Tronco de ${w}`);
  def(17, 'log', {
    names: logNames(WES.slice(0, 4)), keys: W.slice(0, 4).map((w) => w + '_log'), variant: (m) => m & 3, itemMeta: (m) => m & 3,
    tex: (m, f) => pillar('log_' + W[m & 3] + '_top', 'log_' + W[m & 3])(m, f), hardness: 2, tool: 'axe', sound: 'wood', tab: B,
  });
  def(162, 'log2', {
    names: logNames(WES.slice(4)), keys: W.slice(4).map((w) => w + '_log'), variant: (m) => m & 3, itemMeta: (m) => m & 3, validMeta: (m) => (m & 3) < 2,
    tex: (m, f) => pillar('log_' + W[4 + (m & 3)] + '_top', 'log_' + W[4 + (m & 3)])(m, f), hardness: 2, tool: 'axe', sound: 'wood', tab: B,
  });
  const leafDrop = (wood) => (m) => {
    const r = Math.random();
    if (r < 0.05) return [VC.st(6, wood), 1];
    if ((wood === 0 || wood === 5) && r < 0.07) return [VC.I.APPLE, 1];
    return null;
  };
  def(18, 'leaves', {
    names: WES.slice(0, 4).map((w) => `Hojas de ${w}`), keys: W.slice(0, 4).map((w) => w + '_leaves'), variant: (m) => m & 3, itemMeta: (m) => m & 3,
    transparent: true, atten: 1, tex: (m) => 'leaves_' + W[m & 3], hardness: 0.2, tool: 'shears', sound: 'grass', tab: D,
    drop: (m) => leafDrop(m & 3)(m),
  });
  def(161, 'leaves2', {
    names: WES.slice(4).map((w) => `Hojas de ${w}`), keys: W.slice(4).map((w) => w + '_leaves'), variant: (m) => m & 3, itemMeta: (m) => m & 3, validMeta: (m) => (m & 3) < 2,
    transparent: true, atten: 1, tex: (m) => 'leaves_' + W[4 + (m & 3)], hardness: 0.2, tool: 'shears', sound: 'grass', tab: D,
    drop: (m) => leafDrop(4 + (m & 3))(m),
  });
  def(19, 'sponge', { names: ['Esponja', 'Esponja mojada'], keys: ['sponge', 'wet_sponge'], tex: (m) => (m ? 'sponge_wet' : 'sponge'), hardness: 0.6, sound: 'grass', tab: B });
  def(20, 'glass', { name: 'Cristal', transparent: true, tex: 'glass', hardness: 0.3, sound: 'glass', tab: B, drop: none });
  def(21, 'lapis_ore', { name: 'Mena de lapislázuli', tex: 'lapis_ore', hardness: 3, tool: 'pick', tier: 1, tab: B, drop: () => [VC.I.DYE + 4, 4 + Math.floor(Math.random() * 5)] });
  def(22, 'lapis_block', { name: 'Bloque de lapislázuli', tex: 'lapis_block', hardness: 3, tool: 'pick', tier: 1, tab: B });
  def(23, 'dispenser', { name: 'Dispensador', tex: facingTex('dispenser_front', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pick', tier: 0, tab: R, itemMeta: () => 0 });
  def(24, 'sandstone', { names: ['Arenisca', 'Arenisca cincelada', 'Arenisca lisa'], keys: ['sandstone', 'chiseled_sandstone', 'smooth_sandstone'], tex: (m, f) => (f === 2 ? 'sandstone_top' : f === 3 ? 'sandstone_bottom' : ['sandstone_normal', 'sandstone_carved', 'sandstone_smooth'][m]), hardness: 0.8, tool: 'pick', tier: 0, tab: B });
  def(179, 'red_sandstone', { names: ['Arenisca roja', 'Arenisca roja cincelada', 'Arenisca roja lisa'], keys: ['red_sandstone', 'chiseled_red_sandstone', 'smooth_red_sandstone'], tex: (m, f) => (f === 2 ? 'red_sandstone_top' : f === 3 ? 'red_sandstone_bottom' : ['red_sandstone_normal', 'red_sandstone_carved', 'red_sandstone_smooth'][m]), hardness: 0.8, tool: 'pick', tier: 0, tab: B });
  def(25, 'noteblock', { name: 'Bloque musical', tex: 'noteblock', hardness: 0.8, tool: 'axe', sound: 'wood', tab: R });
  def(26, 'bed', {
    name: 'Cama', shape: 'bed', solid: true, hardness: 0.2, sound: 'wood', item: () => VC.I.BED, drop: (m) => ((m & 8) ? [VC.I.BED, 1] : null),
    tex: (m, f) => {
      const head = (m & 8) !== 0;
      if (f === 2) return head ? 'bed_head_top' : 'bed_feet_top';
      if (f === 3) return 'planks_oak';
      const fac = m & 3, fwd = VC.FACE_OF_FACING[fac], back = VC.FACE_OF_FACING[(fac + 2) & 3];
      if (f === fwd) return head ? 'bed_head_end' : 'bed_feet_side';
      if (f === back) return head ? 'bed_head_side' : 'bed_feet_end';
      return head ? 'bed_head_side' : 'bed_feet_side';
    },
  });
  const railTex = (n) => (m, f) => (f === 2 || f === 3 ? n + ((m & 1) ? '_ew' : '_ns') : n + '_ns');
  def(27, 'golden_rail', { name: 'Raíl propulsor', shape: 'rail', solid: false, tex: railTex('rail_golden'), hardness: 0.7, tool: 'pick', tab: TR, itemMeta: () => 0 });
  def(28, 'detector_rail', { name: 'Raíl detector', shape: 'rail', solid: false, tex: railTex('rail_detector'), hardness: 0.7, tool: 'pick', tab: TR, itemMeta: () => 0 });
  def(66, 'rail', { name: 'Raíl', shape: 'rail', solid: false, tex: railTex('rail_normal'), hardness: 0.7, tool: 'pick', tab: TR, itemMeta: () => 0 });
  def(157, 'activator_rail', { name: 'Raíl activador', shape: 'rail', solid: false, tex: railTex('rail_activator'), hardness: 0.7, tool: 'pick', tab: TR, itemMeta: () => 0 });
  const pistonTex = (topName) => (m, f) => {
    const dir = m & 7; // 0 down, 1 up, 2 north, 3 south, 4 west, 5 east (MC)
    const faceOfDir = [3, 2, 5, 4, 1, 0][dir] ?? 2;
    const backOfDir = [2, 3, 4, 5, 0, 1][dir] ?? 3;
    if (f === faceOfDir) return topName;
    if (f === backOfDir) return 'piston_bottom';
    return 'piston_side';
  };
  def(29, 'sticky_piston', { name: 'Pistón pegajoso', tex: pistonTex('piston_top_sticky'), hardness: 0.5, tab: R, itemMeta: () => 1 });
  def(33, 'piston', { name: 'Pistón', tex: pistonTex('piston_top_normal'), hardness: 0.5, tab: R, itemMeta: () => 1 });
  def(30, 'web', { name: 'Telaraña', shape: 'cross', solid: false, transparent: true, tex: 'web', hardness: 4, tool: 'sword', sound: 'cloth', tab: D, drop: () => null });
  def(31, 'tallgrass', {
    names: ['Arbusto', 'Hierba', 'Helecho'], keys: ['shrub', 'tallgrass', 'fern'], shape: 'cross', solid: false, transparent: true, replaceable: true,
    tex: (m) => ['deadbush', 'tallgrass', 'fern'][m], hardness: 0, sound: 'grass', tab: D, creativeMetas: [1, 2],
    drop: () => (Math.random() < 0.125 ? [VC.I.SEEDS, 1] : null),
  });
  def(32, 'deadbush', { name: 'Arbusto muerto', shape: 'cross', solid: false, transparent: true, replaceable: true, tex: 'deadbush', hardness: 0, sound: 'grass', tab: D, drop: () => [VC.I.STICK, Math.floor(Math.random() * 3)] });
  def(35, 'wool', { names: CF.map((c) => `Lana ${c}`), keys: C.map((c) => c + '_wool'), tex: (m) => 'wool_' + C[m], hardness: 0.8, tool: 'shears', sound: 'cloth', tab: B });
  def(37, 'yellow_flower', { name: 'Diente de león', shape: 'cross', solid: false, transparent: true, tex: 'flower_dandelion', hardness: 0, sound: 'grass', tab: D });
  const FLOWERS = ['rose', 'blue_orchid', 'allium', 'houstonia', 'tulip_red', 'tulip_orange', 'tulip_white', 'tulip_pink', 'oxeye_daisy'];
  def(38, 'red_flower', {
    names: ['Amapola', 'Orquídea azul', 'Allium', 'Rubiales', 'Tulipán rojo', 'Tulipán naranja', 'Tulipán blanco', 'Tulipán rosa', 'Margarita'],
    keys: ['poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy'],
    shape: 'cross', solid: false, transparent: true, tex: (m) => 'flower_' + FLOWERS[m], hardness: 0, sound: 'grass', tab: D,
  });
  def(39, 'brown_mushroom', { name: 'Champiñón marrón', shape: 'cross', solid: false, transparent: true, light: 1, tex: 'mushroom_brown', hardness: 0, sound: 'grass', tab: D });
  def(40, 'red_mushroom', { name: 'Champiñón rojo', shape: 'cross', solid: false, transparent: true, tex: 'mushroom_red', hardness: 0, sound: 'grass', tab: D });
  def(41, 'gold_block', { name: 'Bloque de oro', tex: 'gold_block', hardness: 3, tool: 'pick', tier: 2, sound: 'metal', tab: B });
  def(42, 'iron_block', { name: 'Bloque de hierro', tex: 'iron_block', hardness: 5, tool: 'pick', tier: 1, sound: 'metal', tab: B });

  // Slabs: bit 3 = top half. Double slabs drop two.
  const SLAB_V = [['Losa de piedra', 'stone_slab', 'stone_slab_top', 'stone_slab_side'], ['Losa de arenisca', 'sandstone_slab', 'sandstone_top', 'sandstone_normal'],
    ['Losa de madera de piedra', 'petrified_oak_slab', 'planks_oak', 'planks_oak'], ['Losa de roca', 'cobblestone_slab', 'cobblestone', 'cobblestone'],
    ['Losa de ladrillos', 'brick_slab', 'brick', 'brick'], ['Losa de ladrillos de piedra', 'stone_brick_slab', 'stonebrick', 'stonebrick'],
    ['Losa de ladrillos del Nether', 'nether_brick_slab', 'nether_brick', 'nether_brick'], ['Losa de cuarzo', 'quartz_slab', 'quartz_block_top', 'quartz_block_side']];
  def(44, 'stone_slab', {
    names: SLAB_V.map((v) => v[0]), keys: SLAB_V.map((v) => v[1]), variant: (m) => m & 7, itemMeta: (m) => m & 7, shape: 'slab', atten: 0,
    tex: (m, f) => (f === 2 || f === 3 ? SLAB_V[m & 7][2] : SLAB_V[m & 7][3]), hardness: 2, tool: 'pick', tier: 0, tab: B, creativeMetas: [0, 1, 3, 4, 5, 6, 7],
  });
  def(43, 'double_stone_slab', {
    names: SLAB_V.map((v) => 'Losa doble: ' + v[0].slice(8)), variant: (m) => m & 7, tex: (m, f) => (f === 2 || f === 3 ? SLAB_V[m & 7][2] : SLAB_V[m & 7][3]),
    hardness: 2, tool: 'pick', tier: 0, drop: (m) => [VC.st(44, m & 7), 2],
  });
  def(126, 'wooden_slab', {
    names: WES.map((w) => `Losa de ${w}`), keys: W.map((w) => w + '_slab'), variant: (m) => m & 7, itemMeta: (m) => m & 7, validMeta: (m) => (m & 7) < 6,
    shape: 'slab', tex: (m) => 'planks_' + W[m & 7], hardness: 2, tool: 'axe', sound: 'wood', tab: B,
  });
  def(125, 'double_wooden_slab', { names: WES.map((w) => `Losa doble de ${w}`), variant: (m) => m & 7, validMeta: (m) => (m & 7) < 6, tex: (m) => 'planks_' + W[m & 7], hardness: 2, tool: 'axe', sound: 'wood', drop: (m) => [VC.st(126, m & 7), 2] });
  def(182, 'stone_slab2', { name: 'Losa de arenisca roja', variant: (m) => m & 7, itemMeta: () => 0, validMeta: (m) => (m & 7) === 0, shape: 'slab', tex: (m, f) => (f === 2 ? 'red_sandstone_top' : f === 3 ? 'red_sandstone_bottom' : 'red_sandstone_normal'), hardness: 2, tool: 'pick', tier: 0, tab: B });

  def(45, 'brick_block', { name: 'Ladrillos', tex: 'brick', hardness: 2, tool: 'pick', tier: 0, tab: B });
  def(46, 'tnt', { name: 'Dinamita', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass', tab: R });
  def(47, 'bookshelf', { name: 'Librería', tex: { top: 'planks_oak', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', tab: B, drop: () => [VC.I.BOOK, 3] });
  def(48, 'mossy_cobblestone', { name: 'Roca musgosa', tex: 'cobblestone_mossy', hardness: 2, tool: 'pick', tier: 0, tab: B });
  def(49, 'obsidian', { name: 'Obsidiana', tex: 'obsidian', hardness: 50, tool: 'pick', tier: 3, tab: B });
  def(50, 'torch', { name: 'Antorcha', shape: 'torch', solid: false, transparent: true, light: 14, tex: (m, f) => (f === 2 ? 'torch_top' : 'torch_on'), hardness: 0, sound: 'wood', tab: D, itemMeta: () => 0 });
  def(51, 'fire', { name: 'Fuego', shape: 'fire', solid: false, transparent: true, light: 15, tex: 'fire', hardness: 0, replaceable: true, drop: none });
  def(52, 'mob_spawner', { name: 'Generador de monstruos', transparent: true, tex: 'mob_spawner', hardness: 5, tool: 'pick', tier: 0, sound: 'metal', drop: none });

  const STAIRS = [[53, 'oak_stairs', 'Escaleras de roble', 'planks_oak', 'axe'], [67, 'stone_stairs', 'Escaleras de roca', 'cobblestone', 'pick'],
    [108, 'brick_stairs', 'Escaleras de ladrillos', 'brick', 'pick'], [109, 'stone_brick_stairs', 'Escaleras de ladrillos de piedra', 'stonebrick', 'pick'],
    [114, 'nether_brick_stairs', 'Escaleras de ladrillos del Nether', 'nether_brick', 'pick'], [128, 'sandstone_stairs', 'Escaleras de arenisca', ['sandstone_top', 'sandstone_bottom', 'sandstone_normal'], 'pick'],
    [134, 'spruce_stairs', 'Escaleras de abeto', 'planks_spruce', 'axe'], [135, 'birch_stairs', 'Escaleras de abedul', 'planks_birch', 'axe'],
    [136, 'jungle_stairs', 'Escaleras de jungla', 'planks_jungle', 'axe'], [156, 'quartz_stairs', 'Escaleras de cuarzo', ['quartz_block_top', 'quartz_block_bottom', 'quartz_block_side'], 'pick'],
    [163, 'acacia_stairs', 'Escaleras de acacia', 'planks_acacia', 'axe'], [164, 'dark_oak_stairs', 'Escaleras de roble oscuro', 'planks_big_oak', 'axe'],
    [180, 'red_sandstone_stairs', 'Escaleras de arenisca roja', ['red_sandstone_top', 'red_sandstone_bottom', 'red_sandstone_normal'], 'pick']];
  for (const [id, key, name, tx, tool] of STAIRS) {
    def(id, key, {
      name, shape: 'stairs', tex: Array.isArray(tx) ? tbs(tx[0], tx[1], tx[2]) : all(tx), hardness: 2, tool, tier: tool === 'pick' ? 0 : -1,
      sound: tool === 'axe' ? 'wood' : 'stone', tab: B, itemMeta: () => 0, atten: 0,
    });
  }

  const chestTex = (front) => (m, f) => (f === 2 || f === 3 ? 'chest_top' : f === VC.FACE_OF_FACING[m & 3] ? front : 'chest_side');
  def(54, 'chest', { name: 'Cofre', shape: 'chest', tex: chestTex('chest_front'), hardness: 2.5, tool: 'axe', sound: 'wood', tab: D, itemMeta: () => 0 });
  def(146, 'trapped_chest', { name: 'Cofre trampa', shape: 'chest', tex: chestTex('chest_trapped_front'), hardness: 2.5, tool: 'axe', sound: 'wood', tab: R, itemMeta: () => 0 });
  def(130, 'ender_chest', { name: 'Cofre de Ender', shape: 'chest', light: 7, tex: (m, f) => (f === 2 || f === 3 ? 'ender_chest_top' : f === VC.FACE_OF_FACING[m & 3] ? 'ender_chest_front' : 'ender_chest_side'), hardness: 22.5, tool: 'pick', tier: 0, tab: D, itemMeta: () => 0, drop: () => [VC.st(49), 8] });
  def(55, 'redstone_wire', { name: 'Redstone', shape: 'dust', solid: false, transparent: true, tex: (m) => (m > 0 ? 'redstone_dust_on' : 'redstone_dust'), hardness: 0, item: () => VC.I.REDSTONE, light: 0 });
  def(56, 'diamond_ore', { name: 'Mena de diamante', tex: 'diamond_ore', hardness: 3, tool: 'pick', tier: 2, tab: B, drop: () => [VC.I.DIAMOND, 1] });
  def(57, 'diamond_block', { name: 'Bloque de diamante', tex: 'diamond_block', hardness: 5, tool: 'pick', tier: 2, sound: 'metal', tab: B });
  def(58, 'crafting_table', { name: 'Mesa de trabajo', tex: (m, f) => (f === 2 ? 'crafting_table_top' : f === 3 ? 'planks_oak' : f >= 4 ? 'crafting_table_front' : 'crafting_table_side'), hardness: 2.5, tool: 'axe', sound: 'wood', tab: D });
  def(59, 'wheat', { name: 'Trigo', shape: 'crop', solid: false, transparent: true, tex: (m) => 'wheat_stage_' + Math.min(7, m), hardness: 0, sound: 'grass', item: () => VC.I.SEEDS, validMeta: (m) => m < 8,
    drop: (m) => (m >= 7 ? [VC.I.WHEAT, 1] : [VC.I.SEEDS, 1]) });
  def(141, 'carrots', { name: 'Zanahorias', shape: 'crop', solid: false, transparent: true, tex: (m) => 'carrots_stage_' + [0, 0, 1, 1, 2, 2, 2, 3][m & 7], hardness: 0, sound: 'grass', item: () => VC.I.CARROT, validMeta: (m) => m < 8,
    drop: (m) => [VC.I.CARROT, m >= 7 ? 1 + Math.floor(Math.random() * 4) : 1] });
  def(142, 'potatoes', { name: 'Patatas', shape: 'crop', solid: false, transparent: true, tex: (m) => 'potatoes_stage_' + [0, 0, 1, 1, 2, 2, 2, 3][m & 7], hardness: 0, sound: 'grass', item: () => VC.I.POTATO, validMeta: (m) => m < 8,
    drop: (m) => [VC.I.POTATO, m >= 7 ? 1 + Math.floor(Math.random() * 4) : 1] });
  def(115, 'nether_wart', { name: 'Verruga del Nether', shape: 'crop', solid: false, transparent: true, tex: (m) => 'nether_wart_stage_' + [0, 1, 1, 2][m & 3], hardness: 0, sound: 'grass', item: () => VC.I.NETHER_WART, validMeta: (m) => m < 4,
    drop: (m) => [VC.I.NETHER_WART, m >= 3 ? 2 + Math.floor(Math.random() * 3) : 1] });
  def(60, 'farmland', { name: 'Tierra de cultivo', shape: 'box', box: [0, 0, 0, 1, 15 / 16, 1], tex: (m, f) => (f === 2 ? (m > 0 ? 'farmland_wet' : 'farmland_dry') : 'dirt'), hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: () => [VC.st(3), 1] });
  def(61, 'furnace', { name: 'Horno', tex: facingTex('furnace_front_off', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pick', tier: 0, tab: D, itemMeta: () => 0 });
  def(62, 'lit_furnace', { name: 'Horno encendido', light: 13, tex: facingTex('furnace_front_on', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pick', tier: 0, item: () => VC.st(61) });
  def(63, 'standing_sign', { name: 'Cartel', shape: 'sign', solid: false, tex: 'planks_oak', hardness: 1, tool: 'axe', sound: 'wood', item: () => VC.I.SIGN });
  def(68, 'wall_sign', { name: 'Cartel', shape: 'wallsign', solid: false, tex: 'planks_oak', hardness: 1, tool: 'axe', sound: 'wood', item: () => VC.I.SIGN });
  const DOORS = [[64, 'wooden_door', 'Puerta de roble', 'door_wood', 'axe', 'WOOD_DOOR'], [71, 'iron_door', 'Puerta de hierro', 'door_iron', 'pick', 'IRON_DOOR'],
    [193, 'spruce_door', 'Puerta de abeto', 'door_spruce', 'axe', 'SPRUCE_DOOR'], [194, 'birch_door', 'Puerta de abedul', 'door_birch', 'axe', 'BIRCH_DOOR'],
    [195, 'jungle_door', 'Puerta de jungla', 'door_jungle', 'axe', 'JUNGLE_DOOR'], [196, 'acacia_door', 'Puerta de acacia', 'door_acacia', 'axe', 'ACACIA_DOOR'],
    [197, 'dark_oak_door', 'Puerta de roble oscuro', 'door_dark_oak', 'axe', 'DARK_OAK_DOOR']];
  for (const [id, key, name, t, tool, itemKey] of DOORS) {
    def(id, key, {
      name, shape: 'door', transparent: true, tex: (m) => t + ((m & 8) ? '_upper' : '_lower'), hardness: tool === 'pick' ? 5 : 3, tool, tier: tool === 'pick' ? 0 : -1,
      sound: tool === 'pick' ? 'metal' : 'wood', item: () => VC.I[itemKey], drop: (m) => ((m & 8) ? null : [VC.I[itemKey], 1]),
    });
  }
  def(65, 'ladder', { name: 'Escalera de mano', shape: 'ladder', solid: true, transparent: true, climb: true, tex: 'ladder', hardness: 0.4, tool: 'axe', sound: 'wood', tab: D, itemMeta: () => 0 });
  def(69, 'lever', { name: 'Palanca', shape: 'lever', solid: false, transparent: true, tex: (m, f) => 'lever', hardness: 0.5, sound: 'wood', tab: R, itemMeta: () => 0 });
  const PLATES = [[70, 'stone_pressure_plate', 'Placa de presión de piedra', 'stone', 'pick'], [72, 'wooden_pressure_plate', 'Placa de presión de madera', 'planks_oak', 'axe'],
    [147, 'light_weighted_pressure_plate', 'Placa de presión de peso (ligera)', 'gold_block', 'pick'], [148, 'heavy_weighted_pressure_plate', 'Placa de presión de peso (pesada)', 'iron_block', 'pick']];
  for (const [id, key, name, t, tool] of PLATES) def(id, key, { name, shape: 'plate', solid: false, transparent: true, tex: t, hardness: 0.5, tool, tab: R, itemMeta: () => 0 });
  def(73, 'redstone_ore', { name: 'Mena de redstone', tex: 'redstone_ore', hardness: 3, tool: 'pick', tier: 2, tab: B, drop: () => [VC.I.REDSTONE, 4 + Math.floor(Math.random() * 2)] });
  def(74, 'lit_redstone_ore', { name: 'Mena de redstone', light: 9, tex: 'redstone_ore', hardness: 3, tool: 'pick', tier: 2, drop: () => [VC.I.REDSTONE, 4 + Math.floor(Math.random() * 2)], item: () => VC.st(73) });
  def(75, 'unlit_redstone_torch', { name: 'Antorcha de redstone', shape: 'torch', solid: false, transparent: true, tex: 'redstone_torch_off', hardness: 0, sound: 'wood', item: () => VC.st(76) });
  def(76, 'redstone_torch', { name: 'Antorcha de redstone', shape: 'torch', solid: false, transparent: true, light: 7, tex: 'redstone_torch_on', hardness: 0, sound: 'wood', tab: R, itemMeta: () => 0 });
  def(77, 'stone_button', { name: 'Botón de piedra', shape: 'button', solid: false, transparent: true, tex: 'stone', hardness: 0.5, tab: R, itemMeta: () => 0 });
  def(143, 'wooden_button', { name: 'Botón de madera', shape: 'button', solid: false, transparent: true, tex: 'planks_oak', hardness: 0.5, sound: 'wood', tab: R, itemMeta: () => 0 });
  def(78, 'snow_layer', { name: 'Nieve', shape: 'snow', transparent: true, tex: 'snow', hardness: 0.1, tool: 'shovel', sound: 'snow', tab: D, itemMeta: () => 0, replaceable: false, drop: () => [VC.I.SNOWBALL, 1] });
  def(79, 'ice', { name: 'Hielo', transparent: true, translucent: true, atten: 2, tex: 'ice', hardness: 0.5, tool: 'pick', sound: 'glass', tab: B, drop: none });
  def(174, 'packed_ice', { name: 'Hielo compacto', tex: 'ice_packed', hardness: 0.5, tool: 'pick', sound: 'glass', tab: B, drop: none });
  def(80, 'snow', { name: 'Bloque de nieve', tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow', tab: B, drop: () => [VC.I.SNOWBALL, 4] });
  def(81, 'cactus', { name: 'Cactus', shape: 'cactus', transparent: true, tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' }, hardness: 0.4, sound: 'cloth', tab: D, itemMeta: () => 0 });
  def(82, 'clay', { name: 'Arcilla', tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel', tab: B, drop: () => [VC.I.CLAY_BALL, 4] });
  def(83, 'reeds', { name: 'Cañas de azúcar', shape: 'cross', solid: false, transparent: true, tex: 'reeds', hardness: 0, sound: 'grass', item: () => VC.I.REEDS });
  def(84, 'jukebox', { name: 'Tocadiscos', tex: { top: 'jukebox_top', side: 'jukebox_side' }, hardness: 2, tool: 'axe', sound: 'wood', tab: D });
  const FENCES = [[85, 'fence', 'Valla de roble', 'planks_oak'], [188, 'spruce_fence', 'Valla de abeto', 'planks_spruce'], [189, 'birch_fence', 'Valla de abedul', 'planks_birch'],
    [190, 'jungle_fence', 'Valla de jungla', 'planks_jungle'], [191, 'dark_oak_fence', 'Valla de roble oscuro', 'planks_big_oak'], [192, 'acacia_fence', 'Valla de acacia', 'planks_acacia']];
  for (const [id, key, name, t] of FENCES) def(id, key, { name, shape: 'fence', transparent: true, tex: t, hardness: 2, tool: 'axe', sound: 'wood', tab: D });
  def(113, 'nether_brick_fence', { name: 'Valla de ladrillos del Nether', shape: 'fence', transparent: true, tex: 'nether_brick', hardness: 2, tool: 'pick', tier: 0, tab: D });
  const GATES = [[107, 'fence_gate', 'Puerta de valla de roble', 'planks_oak'], [183, 'spruce_fence_gate', 'Puerta de valla de abeto', 'planks_spruce'],
    [184, 'birch_fence_gate', 'Puerta de valla de abedul', 'planks_birch'], [185, 'jungle_fence_gate', 'Puerta de valla de jungla', 'planks_jungle'],
    [186, 'dark_oak_fence_gate', 'Puerta de valla de roble oscuro', 'planks_big_oak'], [187, 'acacia_fence_gate', 'Puerta de valla de acacia', 'planks_acacia']];
  for (const [id, key, name, t] of GATES) def(id, key, { name, shape: 'gate', transparent: true, tex: t, hardness: 2, tool: 'axe', sound: 'wood', tab: R, itemMeta: () => 0 });
  const pumpkinTex = (face) => (m, f) => (f === 2 || f === 3 ? 'pumpkin_top' : f === VC.FACE_OF_FACING[m & 3] ? face : 'pumpkin_side');
  def(86, 'pumpkin', { name: 'Calabaza', tex: pumpkinTex('pumpkin_face_off'), hardness: 1, tool: 'axe', sound: 'wood', tab: B, itemMeta: () => 0 });
  def(91, 'lit_pumpkin', { name: 'Calabaza iluminada', light: 15, tex: pumpkinTex('pumpkin_face_on'), hardness: 1, tool: 'axe', sound: 'wood', tab: B, itemMeta: () => 0 });
  def(87, 'netherrack', { name: 'Piedra infernal', tex: 'netherrack', hardness: 0.4, tool: 'pick', tier: 0, tab: B });
  def(88, 'soul_sand', { name: 'Arena de almas', shape: 'box', box: [0, 0, 0, 1, 1, 1], opaque: true, tex: 'soul_sand', hardness: 0.5, tool: 'shovel', sound: 'sand', tab: B });
  def(90, 'portal', { name: 'Portal', shape: 'portal', solid: false, translucent: true, light: 11, tex: 'portal', hardness: 0, sound: 'glass', drop: none, item: () => 0 });
  def(89, 'glowstone', { name: 'Piedra luminosa', light: 15, tex: 'glowstone', hardness: 0.3, sound: 'glass', tab: B, drop: () => [VC.I.GLOWSTONE_DUST, 2 + Math.floor(Math.random() * 3)] });
  def(92, 'cake', { name: 'Pastel', shape: 'cake', transparent: true, tex: (m, f) => (f === 2 ? 'cake_top' : f === 3 ? 'cake_bottom' : (f === 1 && m > 0) ? 'cake_inner' : 'cake_side'), hardness: 0.5, sound: 'cloth', item: () => VC.I.CAKE, validMeta: (m) => m < 7, drop: none });
  def(93, 'unpowered_repeater', { name: 'Repetidor de redstone', shape: 'box', box: [0, 0, 0, 1, 2 / 16, 1], transparent: true, tex: (m, f) => (f === 2 ? 'repeater_off' : 'stone_slab_top'), hardness: 0, item: () => VC.I.REPEATER });
  def(149, 'unpowered_comparator', { name: 'Comparador de redstone', shape: 'box', box: [0, 0, 0, 1, 2 / 16, 1], transparent: true, tex: (m, f) => (f === 2 ? 'comparator_off' : 'stone_slab_top'), hardness: 0, item: () => VC.I.COMPARATOR });
  def(95, 'stained_glass', { names: CM.map((c) => `Cristal tintado ${c}`), keys: C.map((c) => c + '_stained_glass'), transparent: true, translucent: true, tex: (m) => 'glass_' + C[m], hardness: 0.3, sound: 'glass', tab: B, drop: none });
  def(160, 'stained_glass_pane', { names: CM.map((c) => `Panel de cristal tintado ${c}`), keys: C.map((c) => c + '_stained_glass_pane'), shape: 'pane', translucent: true, tex: (m) => 'glass_' + C[m], hardness: 0.3, sound: 'glass', tab: D, drop: none });
  def(102, 'glass_pane', { name: 'Panel de cristal', shape: 'pane', transparent: true, tex: 'glass', hardness: 0.3, sound: 'glass', tab: D, drop: none });
  def(101, 'iron_bars', { name: 'Barrotes de hierro', shape: 'pane', transparent: true, tex: 'iron_bars', hardness: 5, tool: 'pick', tier: 0, sound: 'metal', tab: D });
  def(96, 'trapdoor', { name: 'Trampilla', shape: 'trapdoor', transparent: true, tex: 'trapdoor', hardness: 3, tool: 'axe', sound: 'wood', tab: R, itemMeta: () => 0 });
  def(167, 'iron_trapdoor', { name: 'Trampilla de hierro', shape: 'trapdoor', transparent: true, tex: 'iron_trapdoor', hardness: 5, tool: 'pick', tier: 0, sound: 'metal', tab: R, itemMeta: () => 0 });
  def(98, 'stonebrick', { names: ['Ladrillos de piedra', 'Ladrillos de piedra musgosos', 'Ladrillos de piedra agrietados', 'Ladrillos de piedra cincelados'], keys: ['stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks', 'chiseled_stone_bricks'], tex: (m) => ['stonebrick', 'stonebrick_mossy', 'stonebrick_cracked', 'stonebrick_carved'][m], hardness: 1.5, tool: 'pick', tier: 0, tab: B });
  def(99, 'brown_mushroom_block', { name: 'Bloque de champiñón marrón', tex: 'mushroom_block_skin_brown', hardness: 0.2, tool: 'axe', sound: 'wood', tab: D, validMeta: (m) => m === 14 || m === 0, creativeMetas: [14], item: () => VC.st(99, 14), drop: () => (Math.random() < 0.2 ? [VC.st(39), 1] : null) });
  def(100, 'red_mushroom_block', { name: 'Bloque de champiñón rojo', tex: 'mushroom_block_skin_red', hardness: 0.2, tool: 'axe', sound: 'wood', tab: D, validMeta: (m) => m === 14 || m === 0, creativeMetas: [14], item: () => VC.st(100, 14), drop: () => (Math.random() < 0.2 ? [VC.st(40), 1] : null) });
  def(103, 'melon_block', { name: 'Sandía', tex: { top: 'melon_top', side: 'melon_side' }, hardness: 1, tool: 'axe', sound: 'wood', tab: B, drop: () => [VC.I.MELON, 3 + Math.floor(Math.random() * 5)] });
  def(106, 'vine', { name: 'Enredaderas', shape: 'vine', solid: false, transparent: true, climb: true, replaceable: true, tex: 'vine', hardness: 0.2, tool: 'shears', sound: 'grass', tab: D, itemMeta: () => 0, drop: none });
  def(110, 'mycelium', { name: 'Micelio', tex: { top: 'mycelium_top', bottom: 'dirt', side: 'mycelium_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', tab: B, drop: dropItem(VC.st(3)) });
  def(111, 'waterlily', { name: 'Nenúfar', shape: 'lilypad', transparent: true, tex: 'waterlily', hardness: 0, sound: 'grass', tab: D });
  def(112, 'nether_brick', { name: 'Ladrillos del Nether', tex: 'nether_brick', hardness: 2, tool: 'pick', tier: 0, tab: B });
  def(116, 'enchanting_table', { name: 'Mesa de encantamientos', shape: 'box', box: [0, 0, 0, 1, 12 / 16, 1], tex: { top: 'enchanting_table_top', bottom: 'enchanting_table_bottom', side: 'enchanting_table_side' }, hardness: 5, tool: 'pick', tier: 0, tab: D, light: 0 });
  def(117, 'brewing_stand', { name: 'Soporte para pociones', shape: 'brewing', transparent: true, tex: (m, f) => (f === 3 || f === 2 ? 'brewing_stand_base' : 'brewing_stand'), hardness: 0.5, tool: 'pick', light: 1, item: () => VC.I.BREWING_STAND });
  def(118, 'cauldron', { name: 'Caldero', shape: 'cauldron', transparent: true, tex: (m, f) => (f === 2 ? 'cauldron_top' : f === 3 ? 'cauldron_bottom' : 'cauldron_side'), hardness: 2, tool: 'pick', tier: 0, sound: 'metal', item: () => VC.I.CAULDRON });
  def(120, 'end_portal_frame', { name: 'Marco del portal del End', shape: 'box', box: [0, 0, 0, 1, 13 / 16, 1], tex: (m, f) => (f === 2 ? ((m & 4) ? 'endframe_eye' : 'endframe_top') : f === 3 ? 'end_stone' : 'endframe_side'), hardness: -1, light: 1, tab: D, itemMeta: () => 0 });
  def(121, 'end_stone', { name: 'Piedra del End', tex: 'end_stone', hardness: 3, tool: 'pick', tier: 0, tab: B });
  def(122, 'dragon_egg', { name: 'Huevo de dragón', shape: 'box', box: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16], transparent: true, light: 1, tex: 'dragon_egg', hardness: 3, tool: 'pick', tab: D });
  def(123, 'redstone_lamp', { name: 'Lámpara de redstone', tex: 'redstone_lamp_off', hardness: 0.3, sound: 'glass', tab: R });
  def(124, 'lit_redstone_lamp', { name: 'Lámpara de redstone', light: 15, tex: 'redstone_lamp_on', hardness: 0.3, sound: 'glass', item: () => VC.st(123) });
  def(129, 'emerald_ore', { name: 'Mena de esmeralda', tex: 'emerald_ore', hardness: 3, tool: 'pick', tier: 2, tab: B, drop: () => [VC.I.EMERALD, 1] });
  def(133, 'emerald_block', { name: 'Bloque de esmeralda', tex: 'emerald_block', hardness: 5, tool: 'pick', tier: 2, sound: 'metal', tab: B });
  def(131, 'tripwire_hook', { name: 'Gancho de cuerda de trampa', shape: 'button', solid: false, transparent: true, tex: 'trip_wire_source', hardness: 0, sound: 'wood', tab: R, itemMeta: () => 0 });
  def(138, 'beacon', { name: 'Faro', transparent: true, light: 15, tex: 'beacon', hardness: 3, sound: 'glass', tab: MI });
  def(139, 'cobblestone_wall', { names: ['Muro de roca', 'Muro de roca musgosa'], keys: ['cobblestone_wall', 'mossy_cobblestone_wall'], shape: 'wall', transparent: true, tex: (m) => (m ? 'cobblestone_mossy' : 'cobblestone'), hardness: 2, tool: 'pick', tier: 0, tab: D });
  def(140, 'flower_pot', { name: 'Maceta', shape: 'pot', transparent: true, tex: (m, f) => (f === 2 ? 'dirt' : 'flower_pot'), hardness: 0, item: () => VC.I.FLOWER_POT });
  const SKULLS = ['skeleton', 'wither', 'zombie', 'char', 'creeper'];
  SKULLS.forEach((sk, i) => def(200 + i, 'skull_' + sk, {
    name: ['Calavera de esqueleto', 'Calavera de esqueleto Wither', 'Cabeza de zombi', 'Cabeza', 'Cabeza de creeper'][i],
    shape: 'skull', transparent: true, tex: (m, f) => 'skull_' + sk + (f === VC.FACE_OF_FACING[m & 3] ? '_front' : f === 2 ? '_top' : '_side'),
    hardness: 1, sound: 'stone', item: () => VC.I.SKULL + i,
  }));
  def(145, 'anvil', { name: 'Yunque', shape: 'anvil', transparent: true, tex: (m, f) => (f === 2 ? 'anvil_top' : 'anvil_base'), hardness: 5, tool: 'pick', tier: 0, sound: 'metal', tab: D, itemMeta: () => 0 });
  def(151, 'daylight_detector', { name: 'Sensor de luz solar', shape: 'box', box: [0, 0, 0, 1, 6 / 16, 1], transparent: true, tex: (m, f) => (f === 2 ? 'daylight_detector_top' : 'daylight_detector_side'), hardness: 0.2, tool: 'axe', sound: 'wood', tab: R });
  def(152, 'redstone_block', { name: 'Bloque de redstone', tex: 'redstone_block', hardness: 5, tool: 'pick', tier: 0, sound: 'metal', tab: R });
  def(153, 'quartz_ore', { name: 'Mena de cuarzo del Nether', tex: 'quartz_ore', hardness: 3, tool: 'pick', tier: 0, tab: B, drop: () => [VC.I.QUARTZ, 1] });
  def(154, 'hopper', { name: 'Tolva', shape: 'hopper', transparent: true, tex: (m, f) => (f === 2 ? 'hopper_top' : 'hopper_outside'), hardness: 3, tool: 'pick', tier: 0, sound: 'metal', tab: R, itemMeta: () => 0 });
  def(155, 'quartz_block', {
    names: ['Bloque de cuarzo', 'Bloque de cuarzo cincelado', 'Pilar de cuarzo'], keys: ['quartz_block', 'chiseled_quartz_block', 'quartz_pillar'],
    variant: (m) => Math.min(m, 2), validMeta: (m) => m <= 4, itemMeta: (m) => Math.min(m, 2),
    tex: (m, f) => {
      if (m === 0) return f === 2 ? 'quartz_block_top' : f === 3 ? 'quartz_block_bottom' : 'quartz_block_side';
      if (m === 1) return f === 2 || f === 3 ? 'quartz_block_chiseled_top' : 'quartz_block_chiseled';
      const ax = m === 2 ? 0 : m === 3 ? 1 : 2;
      const ends = ax === 0 ? [2, 3] : ax === 1 ? [0, 1] : [4, 5];
      return ends.includes(f) ? 'quartz_block_lines_top' : 'quartz_block_lines';
    },
    hardness: 0.8, tool: 'pick', tier: 0, tab: B,
  });
  def(158, 'dropper', { name: 'Soltador', tex: facingTex('dropper_front', 'furnace_side', 'furnace_top'), hardness: 3.5, tool: 'pick', tier: 0, tab: R, itemMeta: () => 0 });
  def(159, 'stained_hardened_clay', { names: CF.map((c) => `Arcilla tintada ${c}`), keys: C.map((c) => c + '_stained_hardened_clay'), tex: (m) => 'hardened_clay_stained_' + C[m], hardness: 1.25, tool: 'pick', tier: 0, tab: B });
  def(172, 'hardened_clay', { name: 'Arcilla endurecida', tex: 'hardened_clay', hardness: 1.25, tool: 'pick', tier: 0, tab: B });
  def(165, 'slime', { name: 'Bloque de slime', transparent: true, translucent: true, tex: 'slime', hardness: 0, sound: 'slime', tab: R });
  def(168, 'prismarine', { names: ['Prismarina', 'Ladrillos de prismarina', 'Prismarina oscura'], keys: ['prismarine', 'prismarine_bricks', 'dark_prismarine'], tex: (m) => ['prismarine_rough', 'prismarine_bricks', 'prismarine_dark'][m], hardness: 1.5, tool: 'pick', tier: 0, tab: B });
  def(169, 'sea_lantern', { name: 'Linterna de mar', light: 15, tex: 'sea_lantern', hardness: 0.3, sound: 'glass', tab: B, drop: () => [VC.I.PRISMARINE_CRYSTALS, 2 + Math.floor(Math.random() * 2)] });
  def(170, 'hay_block', { name: 'Bala de heno', tex: (m, f) => pillar('hay_block_top', 'hay_block_side')(m, f), hardness: 0.5, sound: 'grass', tab: B, itemMeta: () => 0 });
  def(171, 'carpet', { names: CF.map((c) => `Alfombra ${c}`), keys: C.map((c) => c + '_carpet'), shape: 'carpet', transparent: true, tex: (m) => 'wool_' + C[m], hardness: 0.1, sound: 'cloth', tab: D });
  def(173, 'coal_block', { name: 'Bloque de carbón', tex: 'coal_block', hardness: 5, tool: 'pick', tier: 0, tab: B });
  const DP = ['sunflower', 'syringa', 'grass', 'fern', 'rose', 'paeonia'];
  def(175, 'double_plant', {
    names: ['Girasol', 'Lila', 'Hierba alta doble', 'Helecho grande', 'Rosal', 'Peonía'], keys: ['sunflower', 'lilac', 'double_grass', 'large_fern', 'rose_bush', 'peony'],
    variant: (m) => m & 7, itemMeta: (m) => m & 7, validMeta: (m) => (m & 7) < 6, shape: 'cross', solid: false, transparent: true,
    tex: (m) => 'double_plant_' + DP[m & 7] + ((m & 8) ? '_top' : '_bottom'), hardness: 0, sound: 'grass', tab: D, replaceable: false,
    drop: (m) => ((m & 8) ? null : [VC.st(175, m & 7), 1]),
  });
})();

// Convenience constants used across the code (states with meta 0 unless noted).
VC.B = (function () {
  const s = VC.st;
  return {
    AIR: 0, STONE: s(1), GRASS: s(2), DIRT: s(3), COBBLE: s(4), PLANKS: s(5), SAPLING: s(6), BEDROCK: s(7),
    WATER: s(9), LAVA: s(11), SAND: s(12), RED_SAND: s(12, 1), GRAVEL: s(13), GOLD: s(14), IRON: s(15), COAL: s(16),
    LOG: s(17), LEAVES: s(18), SPONGE: s(19), GLASS: s(20), LAPIS_ORE: s(21), SANDSTONE: s(24), BED: s(26),
    WEB: s(30), TALLGRASS: s(31, 1), FERN: s(31, 2), DEADBUSH: s(32), WOOL: s(35), DANDELION: s(37), ROSE: s(38),
    BROWN_MUSHROOM: s(39), RED_MUSHROOM: s(40), BRICK: s(45), TNT: s(46), BOOKSHELF: s(47), MOSSY: s(48), OBSIDIAN: s(49),
    TORCH: s(50), FIRE: s(51), CHEST: s(54), REDSTONE_WIRE: s(55), DIAMOND: s(56), CRAFTING_TABLE: s(58), WHEAT: s(59),
    FARMLAND: s(60), FURNACE: s(61), LIT_FURNACE: s(62), LADDER: s(65), REDSTONE_ORE: s(73), SNOW_LAYER: s(78), ICE: s(79),
    SNOW: s(80), CACTUS: s(81), CLAY: s(82), REEDS: s(83), JUKEBOX: s(84), PUMPKIN: s(86), NETHERRACK: s(87),
    SOUL_SAND: s(88), GLOWSTONE: s(89), CAKE: s(92), STONEBRICK: s(98), MELON: s(103), VINE: s(106), MYCELIUM: s(110),
    WATERLILY: s(111), EMERALD_ORE: s(129), ENDER_CHEST: s(130), TRAPPED_CHEST: s(146), CARROTS: s(141), POTATOES: s(142),
    NETHER_WART: s(115), NOTEBLOCK: s(25), DISPENSER: s(23), DROPPER: s(158), HOPPER: s(154), LOG2: s(162), LEAVES2: s(161),
    SNOWY_GRASS: s(2), // grass under a snow layer renders snowy
    PORTAL: s(90), QUARTZ_ORE: s(153),
  };
})();

VC.isWater = (s) => (s >> 4) === 9 || (s >> 4) === 8;
VC.isLava = (s) => (s >> 4) === 11 || (s >> 4) === 10;
// Liquid level: 0 = source, 1..7 = flowing (meta), -1 = not this liquid.
VC.waterLevel = (s) => (VC.isWater(s) ? s & 7 : -1);
VC.lavaLevel = (s) => (VC.isLava(s) ? s & 7 : -1);
VC.waterId = (level) => VC.B.WATER | level;
VC.lavaId = (level) => VC.B.LAVA | level;
VC.isBlock = (s, id) => (s >> 4) === id;
VC.blockName = (s) => VC.BP.name[s] || VC.BP.name[s & ~15] || '?';

// Items are defined after blocks: resolve block -> item links that reference VC.I.
VC.resolveBlockItems = function () {
  const P = VC.BP;
  for (let s = 0; s < VC.NSTATES; s++) if (P.itemFn[s]) P.item[s] = P.itemFn[s](s & 15);
};
