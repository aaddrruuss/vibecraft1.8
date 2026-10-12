'use strict';

// Items use real Minecraft 1.8 ids: stack id = (mcId << 4) | meta.
VC.ITEMS = {};
VC.ITEM_KEYS = {};      // registry name -> stack id
VC.CREATIVE_ITEMS = []; // [id, tab]
VC.SPRITES = [];
VC.SPRITE_INDEX = {};
VC.sprite = function (name) {
  let i = VC.SPRITE_INDEX[name];
  if (i === undefined) { i = VC.SPRITES.length; VC.SPRITES.push(name); VC.SPRITE_INDEX[name] = i; }
  return i;
};
VC.MOB_EGGS = ['zombie', 'skeleton', 'creeper', 'spider', 'pig', 'cow', 'sheep', 'chicken', 'pigman', 'ghast'];

VC.I = (function () {
  const I = {};
  const st = (id, m = 0) => (id << 4) | m;

  function def(mcId, key, name, o = {}) {
    const metas = o.metas || 1;
    for (let m = 0; m < metas; m++) {
      const id = st(mcId, m);
      const nm = Array.isArray(name) ? name[m] : name;
      const k = Array.isArray(key) ? key[m] : key;
      const sp = Array.isArray(o.sprite) ? o.sprite[m] : (o.sprite || k);
      VC.ITEMS[id] = Object.assign({ id, name: nm, key: k, stack: 64, sprite: VC.sprite(sp) }, o.props ? o.props(m) : {}, o.common || {});
      if (VC.ITEM_KEYS[k] === undefined) VC.ITEM_KEYS[k] = id;
      if (o.tab) VC.CREATIVE_ITEMS.push([id, o.tab]);
    }
    return st(mcId);
  }

  const TO = 'tools', CO = 'combat', FO = 'food', MA = 'materials', MI = 'misc', BR = 'brewing', RE = 'redstone', TR = 'transport', DE = 'decoration';
  const MATS = [['WOOD', 'wooden', 'madera', 0, 2, 59], ['STONE', 'stone', 'piedra', 1, 4, 131], ['IRON', 'iron', 'hierro', 2, 6, 250],
    ['DIAMOND', 'diamond', 'diamante', 3, 8, 1561], ['GOLD', 'golden', 'oro', 0, 12, 32]];
  const TOOL_IDS = {
    WOOD: { SHOVEL: 269, PICK: 270, AXE: 271, SWORD: 268, HOE: 290 },
    STONE: { SHOVEL: 273, PICK: 274, AXE: 275, SWORD: 272, HOE: 291 },
    IRON: { SHOVEL: 256, PICK: 257, AXE: 258, SWORD: 267, HOE: 292 },
    DIAMOND: { SHOVEL: 277, PICK: 278, AXE: 279, SWORD: 276, HOE: 293 },
    GOLD: { SHOVEL: 284, PICK: 285, AXE: 286, SWORD: 283, HOE: 294 },
  };
  const KINDS = [['SHOVEL', 'shovel', 'Pala', 'shovel', 1], ['PICK', 'pickaxe', 'Pico', 'pick', 2], ['AXE', 'axe', 'Hacha', 'axe', 3],
    ['SWORD', 'sword', 'Espada', 'sword', 4], ['HOE', 'hoe', 'Azada', 'hoe', 0]];
  for (const [M, mk, mes, tier, speed, dur] of MATS) {
    for (const [K, kk, kes, type, base] of KINDS) {
      const gold = M === 'GOLD';
      const dmg = type === 'hoe' ? 1 : base + (gold ? 0 : tier) + 1;
      I[M + '_' + K] = def(TOOL_IDS[M][K], `${mk}_${kk}`, `${kes} de ${mes}`, {
        tab: type === 'sword' ? CO : TO, sprite: `tool_${type}_${M.toLowerCase()}`,
        common: { stack: 1, tool: { type, tier, speed, durability: dur, damage: dmg }, fuel: M === 'WOOD' ? 10 : undefined },
      });
    }
  }
  I.FLINT_AND_STEEL = def(259, 'flint_and_steel', 'Mechero', { tab: TO, common: { stack: 1, tool: { type: 'flint', durability: 64, damage: 1 } } });
  I.SHEARS = def(359, 'shears', 'Tijeras', { tab: TO, common: { stack: 1, tool: { type: 'shears', durability: 238, damage: 1, speed: 15 } } });
  I.FISHING_ROD = def(346, 'fishing_rod', 'Caña de pescar', { tab: TO, common: { stack: 1, tool: { type: 'rod', durability: 64, damage: 1 } } });
  I.COMPASS = def(345, 'compass', 'Brújula', { tab: TO });
  I.CLOCK = def(347, 'clock', 'Reloj', { tab: TO });
  I.LEAD = def(420, 'lead', 'Correa', { tab: TO });
  I.NAME_TAG = def(421, 'name_tag', 'Etiqueta', { tab: TO });

  I.BOW = def(261, 'bow', 'Arco', { tab: CO, common: { stack: 1, bow: true, tool: { type: 'bow', durability: 384, damage: 1 } } });
  I.ARROW = def(262, 'arrow', 'Flecha', { tab: CO });
  const ARMOR = [['LEATHER', 'leather', 'cuero', 298, [1, 3, 2, 1], 5], ['CHAIN', 'chainmail', 'cota de malla', 302, [2, 5, 4, 1], 15],
    ['IRON', 'iron', 'hierro', 306, [2, 6, 5, 2], 15], ['DIAMOND', 'diamond', 'diamante', 310, [3, 8, 6, 3], 33], ['GOLD', 'golden', 'oro', 314, [2, 5, 3, 1], 7]];
  const PIECES = [['HELMET', 'helmet', 'Casco', 11], ['CHESTPLATE', 'chestplate', 'Pechera', 16], ['LEGGINGS', 'leggings', 'Pantalones', 15], ['BOOTS', 'boots', 'Botas', 13]];
  for (const [M, mk, mes, base, pts, durMul] of ARMOR) {
    PIECES.forEach(([P, pk, pes, durBase], slot) => {
      const nm = M === 'LEATHER' && P !== 'CHESTPLATE' ? `${pes} de cuero` : `${pes} de ${mes}`;
      I[M + '_' + P] = def(base + slot, `${mk}_${pk}`, nm.replace('Pechera de cuero', 'Túnica de cuero'), {
        tab: CO, sprite: `armor_${pk}_${M.toLowerCase()}`,
        common: { stack: 1, armor: { slot, points: pts[slot], material: M.toLowerCase() }, tool: { type: 'armor', durability: durBase * durMul, damage: 1 } },
      });
    });
  }

  // Elytra (from 1.9): worn in the chestplate slot, lets you glide. Wears 1 durability per second.
  I.ELYTRA = def(443, 'elytra', 'Élitros', {
    tab: CO,
    common: { stack: 1, desc: 'Salta en el aire para planear', armor: { slot: 1, points: 0, material: 'elytra' }, elytra: true, tool: { type: 'armor', durability: 432, damage: 1 } },
  });

  const food = (h, s, extra) => Object.assign({ food: h, sat: s * 1 }, extra || {});
  I.APPLE = def(260, 'apple', 'Manzana', { tab: FO, common: food(4, 2.4) });
  I.MUSHROOM_STEW = def(282, 'mushroom_stew', 'Estofado de champiñones', { tab: FO, common: food(6, 7.2, { stack: 1, bowl: true }) });
  I.BREAD = def(297, 'bread', 'Pan', { tab: FO, common: food(5, 6) });
  I.PORK_RAW = def(319, 'porkchop', 'Chuleta de cerdo cruda', { tab: FO, common: food(3, 1.8) });
  I.PORK_COOKED = def(320, 'cooked_porkchop', 'Chuleta de cerdo cocinada', { tab: FO, common: food(8, 12.8) });
  I.GOLDEN_APPLE = def(322, ['golden_apple', 'enchanted_golden_apple'], ['Manzana dorada', 'Manzana dorada encantada'], { metas: 2, tab: FO, sprite: ['apple_golden', 'apple_golden'], props: (m) => food(4, 9.6, { always: true, heal: m ? 8 : 4, glint: m === 1 }) });
  I.FISH = def(349, ['fish', 'salmon', 'clownfish', 'pufferfish'], ['Pescado crudo', 'Salmón crudo', 'Pez payaso', 'Pez globo'], { metas: 4, tab: FO, sprite: ['fish_raw', 'salmon_raw', 'clownfish', 'pufferfish'], props: (m) => [food(2, 0.4), food(2, 0.4), food(1, 0.2), food(1, 0.2, { poison: true })][m] });
  I.COOKED_FISH = def(350, ['cooked_fish', 'cooked_salmon'], ['Pescado cocinado', 'Salmón cocinado'], { metas: 2, tab: FO, sprite: ['fish_cooked', 'salmon_cooked'], props: (m) => [food(5, 6), food(6, 9.6)][m] });
  I.CAKE = def(354, 'cake', 'Pastel', { tab: FO, common: { stack: 1, place: () => VC.st(92) } });
  I.COOKIE = def(357, 'cookie', 'Galleta', { tab: FO, common: food(2, 0.4) });
  I.MELON = def(360, 'melon', 'Rodaja de sandía', { tab: FO, common: food(2, 1.2) });
  I.BEEF_RAW = def(363, 'beef', 'Filete crudo', { tab: FO, common: food(3, 1.8) });
  I.STEAK = def(364, 'cooked_beef', 'Filete cocinado', { tab: FO, common: food(8, 12.8) });
  I.CHICKEN_RAW = def(365, 'chicken', 'Pollo crudo', { tab: FO, common: food(2, 1.2, { poison: true }) });
  I.CHICKEN_COOKED = def(366, 'cooked_chicken', 'Pollo asado', { tab: FO, common: food(6, 7.2) });
  I.ROTTEN_FLESH = def(367, 'rotten_flesh', 'Carne podrida', { tab: FO, common: food(4, 0.8, { poison: true }) });
  I.SPIDER_EYE = def(375, 'spider_eye', 'Ojo de araña', { tab: FO, common: food(2, 3.2, { poison: true }) });
  I.CARROT = def(391, 'carrot', 'Zanahoria', { tab: FO, common: food(3, 3.6, { place: () => VC.st(141), soil: 'farmland' }) });
  I.POTATO = def(392, 'potato', 'Patata', { tab: FO, common: food(1, 0.6, { place: () => VC.st(142), soil: 'farmland' }) });
  I.BAKED_POTATO = def(393, 'baked_potato', 'Patata asada', { tab: FO, common: food(5, 6) });
  I.POISONOUS_POTATO = def(394, 'poisonous_potato', 'Patata venenosa', { tab: FO, common: food(2, 1.2, { poison: true }) });
  I.GOLDEN_CARROT = def(396, 'golden_carrot', 'Zanahoria dorada', { tab: BR, common: food(6, 14.4) });
  I.PUMPKIN_PIE = def(400, 'pumpkin_pie', 'Tarta de calabaza', { tab: FO, common: food(8, 4.8) });
  I.RABBIT_RAW = def(411, 'rabbit', 'Conejo crudo', { tab: FO, common: food(3, 1.8) });
  I.RABBIT_COOKED = def(412, 'cooked_rabbit', 'Conejo cocinado', { tab: FO, common: food(5, 6) });
  I.RABBIT_STEW = def(413, 'rabbit_stew', 'Estofado de conejo', { tab: FO, common: food(10, 12, { stack: 1, bowl: true }) });
  I.MUTTON_RAW = def(423, 'mutton', 'Cordero crudo', { tab: FO, common: food(2, 1.2) });
  I.MUTTON_COOKED = def(424, 'cooked_mutton', 'Cordero cocinado', { tab: FO, common: food(6, 9.6) });
  I.MILK = def(335, 'milk_bucket', 'Cubo de leche', { tab: MI, common: { stack: 1, drink: true } });

  I.COAL = def(263, ['coal', 'charcoal'], ['Carbón', 'Carbón vegetal'], { metas: 2, tab: MA, sprite: ['coal', 'charcoal'], common: { fuel: 80 } });
  I.CHARCOAL = I.COAL + 1;
  I.DIAMOND = def(264, 'diamond', 'Diamante', { tab: MA });
  I.IRON_INGOT = def(265, 'iron_ingot', 'Lingote de hierro', { tab: MA });
  I.GOLD_INGOT = def(266, 'gold_ingot', 'Lingote de oro', { tab: MA });
  I.STICK = def(280, 'stick', 'Palo', { tab: MA, common: { fuel: 5 } });
  I.BOWL = def(281, 'bowl', 'Cuenco', { tab: MA, common: { fuel: 5 } });
  I.STRING = def(287, 'string', 'Cuerda', { tab: MA });
  I.FEATHER = def(288, 'feather', 'Pluma', { tab: MA });
  I.GUNPOWDER = def(289, 'gunpowder', 'Pólvora', { tab: MA });
  I.SEEDS = def(295, 'wheat_seeds', 'Semillas', { tab: MA, common: { place: () => VC.st(59), soil: 'farmland' } });
  I.WHEAT = def(296, 'wheat', 'Trigo', { tab: MA });
  I.FLINT = def(318, 'flint', 'Pedernal', { tab: MA });
  I.LEATHER = def(334, 'leather', 'Cuero', { tab: MA });
  I.BRICK = def(336, 'brick', 'Ladrillo', { tab: MA });
  I.CLAY_BALL = def(337, 'clay_ball', 'Bola de arcilla', { tab: MA });
  I.REEDS = def(338, 'reeds', 'Cañas de azúcar', { tab: MA, common: { place: () => VC.st(83), soil: 'reeds' } });
  I.PAPER = def(339, 'paper', 'Papel', { tab: MI });
  I.BOOK = def(340, 'book', 'Libro', { tab: MI });
  I.SLIME_BALL = def(341, 'slime_ball', 'Bola de slime', { tab: MI });
  I.EGG = def(344, 'egg', 'Huevo', { tab: MA, common: { stack: 16, throwable: 'egg' } });
  I.GLOWSTONE_DUST = def(348, 'glowstone_dust', 'Polvo de piedra luminosa', { tab: MA });
  const DYE_N = ['Bolsa de tinta', 'Rojo rosa', 'Verde cactus', 'Granos de cacao', 'Lapislázuli', 'Tinte morado', 'Tinte cian', 'Tinte gris claro',
    'Tinte gris', 'Tinte rosa', 'Tinte verde lima', 'Amarillo diente de león', 'Tinte azul claro', 'Tinte magenta', 'Tinte naranja', 'Polvo de hueso'];
  const DYE_K = ['ink_sac', 'red_dye', 'green_dye', 'cocoa_beans', 'lapis_lazuli', 'purple_dye', 'cyan_dye', 'light_gray_dye', 'gray_dye', 'pink_dye',
    'lime_dye', 'yellow_dye', 'light_blue_dye', 'magenta_dye', 'orange_dye', 'bone_meal'];
  I.DYE = def(351, DYE_K, DYE_N, { metas: 16, tab: MA, sprite: DYE_K.map((k, m) => 'dye_' + m), props: (m) => ({ dye: 15 - m }) });
  I.BONE_MEAL = I.DYE + 15;
  I.BONE = def(352, 'bone', 'Hueso', { tab: MI });
  I.SUGAR = def(353, 'sugar', 'Azúcar', { tab: BR });
  I.PUMPKIN_SEEDS = def(361, 'pumpkin_seeds', 'Semillas de calabaza', { tab: MA });
  I.MELON_SEEDS = def(362, 'melon_seeds', 'Semillas de sandía', { tab: MA });
  I.BLAZE_ROD = def(369, 'blaze_rod', 'Vara de blaze', { tab: MA, common: { fuel: 120 } });
  I.GHAST_TEAR = def(370, 'ghast_tear', 'Lágrima de ghast', { tab: BR });
  I.GOLD_NUGGET = def(371, 'gold_nugget', 'Pepita de oro', { tab: MA });
  I.NETHER_WART = def(372, 'nether_wart', 'Verruga del Nether', { tab: MA, common: { place: () => VC.st(115), soil: 'soul_sand' } });
  I.EMERALD = def(388, 'emerald', 'Esmeralda', { tab: MA });
  I.NETHER_STAR = def(399, 'nether_star', 'Estrella del Nether', { tab: MA });
  I.NETHERBRICK = def(405, 'netherbrick', 'Ladrillo del Nether', { tab: MA });
  I.QUARTZ = def(406, 'quartz', 'Cuarzo del Nether', { tab: MA });
  I.PRISMARINE_SHARD = def(409, 'prismarine_shard', 'Fragmento de prismarina', { tab: MA });
  I.PRISMARINE_CRYSTALS = def(410, 'prismarine_crystals', 'Cristales de prismarina', { tab: MA });
  I.RABBIT_HIDE = def(415, 'rabbit_hide', 'Piel de conejo', { tab: MA });
  I.RABBIT_FOOT = def(414, 'rabbit_foot', 'Pata de conejo', { tab: BR });

  I.POTION = def(373, 'potion', 'Botella de agua', { tab: BR, common: { stack: 1, drink: true } });
  I.GLASS_BOTTLE = def(374, 'glass_bottle', 'Frasco de cristal', { tab: BR });
  I.FERMENTED_SPIDER_EYE = def(376, 'fermented_spider_eye', 'Ojo de araña fermentado', { tab: BR });
  I.BLAZE_POWDER = def(377, 'blaze_powder', 'Polvo de blaze', { tab: BR });
  I.MAGMA_CREAM = def(378, 'magma_cream', 'Crema de magma', { tab: BR });
  I.BREWING_STAND = def(379, 'brewing_stand', 'Soporte para pociones', { tab: BR, common: { place: () => VC.st(117) } });
  I.CAULDRON = def(380, 'cauldron', 'Caldero', { tab: BR, common: { place: () => VC.st(118) } });
  I.ENDER_EYE = def(381, 'ender_eye', 'Ojo de Ender', { tab: MI });
  I.SPECKLED_MELON = def(382, 'speckled_melon', 'Rodaja de sandía reluciente', { tab: BR });

  I.BUCKET = def(325, 'bucket', 'Cubo', { tab: MI, common: { stack: 16 } });
  I.WATER_BUCKET = def(326, 'water_bucket', 'Cubo de agua', { tab: MI, common: { stack: 1 } });
  I.LAVA_BUCKET = def(327, 'lava_bucket', 'Cubo de lava', { tab: MI, common: { stack: 1, fuel: 1000 } });
  I.SNOWBALL = def(332, 'snowball', 'Bola de nieve', { tab: MI, common: { stack: 16, throwable: 'snowball' } });
  I.ENDER_PEARL = def(368, 'ender_pearl', 'Perla de Ender', { tab: MI, common: { stack: 16, throwable: 'pearl' } });
  I.EXP_BOTTLE = def(384, 'experience_bottle', 'Frasco de experiencia', { tab: MI, common: { throwable: 'exp' } });
  I.FIRE_CHARGE = def(385, 'fire_charge', 'Carga ígnea', { tab: MI });
  I.WRITABLE_BOOK = def(386, 'writable_book', 'Libro y pluma', { tab: MI, common: { stack: 1 } });
  I.WRITTEN_BOOK = def(387, 'written_book', 'Libro escrito', { common: { stack: 16 } });
  I.MAP_EMPTY = def(395, 'map', 'Mapa vacío', { tab: MI });
  I.FIREWORKS = def(401, 'fireworks', 'Cohete de fuegos artificiales', { tab: MI, common: { desc: 'Úsalo sobre un bloque o mientras planeas' } });
  I.FIREWORK_CHARGE = def(402, 'firework_charge', 'Estrella de fuegos artificiales', { tab: MI });
  I.ENCHANTED_BOOK = def(403, 'enchanted_book', 'Libro encantado', { tab: MI, common: { stack: 1, glint: true } });
  const EGG_N = ['zombi', 'esqueleto', 'creeper', 'araña', 'cerdo', 'vaca', 'oveja', 'gallina', 'hombre-cerdo zombi', 'ghast'];
  I.SPAWN_EGG = def(383, VC.MOB_EGGS.map((m) => m + '_spawn_egg'), EGG_N.map((n) => `Generar ${n}`), { metas: VC.MOB_EGGS.length, tab: MI, sprite: VC.MOB_EGGS.map((m) => 'egg_' + m), props: (m) => ({ spawn: VC.MOB_EGGS[m] }) });
  const RECORDS = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait'];
  RECORDS.forEach((r, i) => { I['RECORD_' + r.toUpperCase()] = def(2256 + i, 'record_' + r, 'Disco de música', { tab: MI, sprite: 'record_' + r, common: { stack: 1, record: r, desc: 'C418 - ' + r } }); });

  I.PAINTING = def(321, 'painting', 'Cuadro', { tab: DE });
  I.SIGN = def(323, 'sign', 'Cartel', { tab: DE, common: { stack: 16, place: () => VC.st(63) } });
  I.BED = def(355, 'bed', 'Cama', { tab: DE, common: { stack: 1, place: () => VC.st(26) } });
  I.ITEM_FRAME = def(389, 'item_frame', 'Marco', { tab: DE });
  I.FLOWER_POT = def(390, 'flower_pot', 'Maceta', { tab: DE, common: { place: () => VC.st(140) } });
  I.SKULL = def(397, ['skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'player_head', 'creeper_head'],
    ['Calavera de esqueleto', 'Calavera de esqueleto Wither', 'Cabeza de zombi', 'Cabeza', 'Cabeza de creeper'],
    { metas: 5, tab: DE, sprite: ['skull_0', 'skull_1', 'skull_2', 'skull_3', 'skull_4'], props: (m) => ({ place: () => VC.st(200 + m), wearable: 0 }) });
  I.ARMOR_STAND = def(416, 'armor_stand', 'Soporte para armaduras', { tab: DE, common: { stack: 16 } });

  I.REDSTONE = def(331, 'redstone', 'Redstone', { tab: RE, common: { place: () => VC.st(55) } });
  I.REPEATER = def(356, 'repeater', 'Repetidor de redstone', { tab: RE, common: { place: () => VC.st(93) } });
  I.COMPARATOR = def(404, 'comparator', 'Comparador de redstone', { tab: RE, common: { place: () => VC.st(149) } });
  const DOORS = [[324, 'WOOD_DOOR', 'wooden_door', 'Puerta de roble', 64], [330, 'IRON_DOOR', 'iron_door', 'Puerta de hierro', 71],
    [427, 'SPRUCE_DOOR', 'spruce_door', 'Puerta de abeto', 193], [428, 'BIRCH_DOOR', 'birch_door', 'Puerta de abedul', 194],
    [429, 'JUNGLE_DOOR', 'jungle_door', 'Puerta de jungla', 195], [430, 'ACACIA_DOOR', 'acacia_door', 'Puerta de acacia', 196],
    [431, 'DARK_OAK_DOOR', 'dark_oak_door', 'Puerta de roble oscuro', 197]];
  for (const [mc, K, key, nm, block] of DOORS) I[K] = def(mc, key + '_item', nm, { tab: RE, sprite: 'door_' + key, common: { stack: 1, place: () => VC.st(block) } });

  I.MINECART = def(328, 'minecart', 'Vagoneta', { tab: TR, common: { stack: 1 } });
  I.SADDLE = def(329, 'saddle', 'Montura', { tab: TR, common: { stack: 1 } });
  I.BOAT = def(333, 'boat', 'Bote', { tab: TR, common: { stack: 1 } });
  I.CHEST_MINECART = def(342, 'chest_minecart', 'Vagoneta con cofre', { tab: TR, common: { stack: 1 } });
  I.FURNACE_MINECART = def(343, 'furnace_minecart', 'Vagoneta con horno', { tab: TR, common: { stack: 1 } });
  I.TNT_MINECART = def(407, 'tnt_minecart', 'Vagoneta con dinamita', { tab: TR, common: { stack: 1 } });
  I.HOPPER_MINECART = def(408, 'hopper_minecart', 'Vagoneta con tolva', { tab: TR, common: { stack: 1 } });
  I.CARROT_ON_A_STICK = def(398, 'carrot_on_a_stick', 'Caña con zanahoria', { tab: TR, common: { stack: 1 } });
  I.IRON_HORSE_ARMOR = def(417, 'iron_horse_armor', 'Armadura de hierro para caballo', { tab: MI, common: { stack: 1 } });
  I.GOLD_HORSE_ARMOR = def(418, 'golden_horse_armor', 'Armadura de oro para caballo', { tab: MI, common: { stack: 1 } });
  I.DIAMOND_HORSE_ARMOR = def(419, 'diamond_horse_armor', 'Armadura de diamante para caballo', { tab: MI, common: { stack: 1 } });
  return I;
})();

VC.resolveBlockItems();

// Fuel values for block items (seconds).
VC.BLOCK_FUEL = { 5: 15, 17: 15, 162: 15, 58: 15, 6: 5, 126: 7.5, 85: 15, 107: 15, 53: 15, 54: 15, 47: 15, 173: 800, 84: 15, 25: 15, 96: 15 };

VC.item = function (id) {
  if (id === undefined || id === null) return null;
  if (VC.isItem(id)) return VC.ITEMS[id] || null;
  const bid = id >> 4;
  return { id, name: VC.blockName(id), stack: 64, fuel: VC.BLOCK_FUEL[bid], block: true };
};
VC.itemName = (id) => (VC.item(id) || {}).name || '?';
VC.maxStack = (id) => (VC.item(id) || {}).stack || 64;
// Block state an item places (or null).
VC.placeState = function (id) {
  if (!VC.isItem(id)) return VC.BP.exists[id] ? id : null;
  const it = VC.ITEMS[id];
  return it && it.place ? it.place() : null;
};
