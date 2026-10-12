'use strict';

// Resource packs: reads Minecraft 1.8 resource pack .zip files natively and rebuilds the
// block, item and mob atlases from them. Anything the pack doesn't provide keeps the
// procedural texture. Installed packs are stored in IndexedDB.
VC.Packs = (function () {
  // ---------- Zip reader (store + deflate, via DecompressionStream) ----------
  function readZip(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let e = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error('No es un archivo .zip válido');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const files = new Map(), dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Zip dañado');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/');
      p += 46 + nl + xl + cl;
      if (!name.endsWith('/')) files.set(name.toLowerCase(), { name, method, csize, off });
    }
    async function read(name) {
      const f = files.get(name.toLowerCase());
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const data = u8.subarray(start, start + f.csize);
      if (f.method === 0) return data.slice();
      if (f.method !== 8) throw new Error('Compresión no soportada en ' + f.name);
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede descomprimir .zip (actualízalo)');
      const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }
    return { names: [...files.keys()], read };
  }

  // ---------- Images: { w, h, d: RGBA bytes } ----------
  async function decodePng(bytes) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
  }
  const blank = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
  function crop(img, x0, y0, w, h) {
    const o = blank(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y;
      if (sx < 0 || sy < 0 || sx >= img.w || sy >= img.h) continue;
      const i = (sy * img.w + sx) * 4, j = (y * w + x) * 4;
      o.d[j] = img.d[i]; o.d[j + 1] = img.d[i + 1]; o.d[j + 2] = img.d[i + 2]; o.d[j + 3] = img.d[i + 3];
    }
    return o;
  }
  // Animated textures are vertical strips of square frames: keep the first one.
  const frame = (img) => (img && img.h > img.w ? crop(img, 0, 0, img.w, img.w) : img);
  // Nearest-neighbour resample; fn(u, v) -> [su, sv] optionally remaps (rotations / flips).
  function scale(img, w, h, fn) {
    const o = blank(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let u = (x + 0.5) / w, v = (y + 0.5) / h;
      if (fn) [u, v] = fn(u, v);
      const sx = Math.min(img.w - 1, Math.floor(u * img.w)), sy = Math.min(img.h - 1, Math.floor(v * img.h));
      const i = (sy * img.w + sx) * 4, j = (y * w + x) * 4;
      o.d[j] = img.d[i]; o.d[j + 1] = img.d[i + 1]; o.d[j + 2] = img.d[i + 2]; o.d[j + 3] = img.d[i + 3];
    }
    return o;
  }
  function tint(img, c) {
    const o = { w: img.w, h: img.h, d: new Uint8ClampedArray(img.d) };
    for (let i = 0; i < o.d.length; i += 4) { o.d[i] = o.d[i] * c[0] / 255; o.d[i + 1] = o.d[i + 1] * c[1] / 255; o.d[i + 2] = o.d[i + 2] * c[2] / 255; }
    return o;
  }
  // Alpha-composites b over a (b resampled to a's size).
  function over(a, b) {
    if (!b) return a;
    if (b.w !== a.w || b.h !== a.h) b = scale(b, a.w, a.h);
    const o = { w: a.w, h: a.h, d: new Uint8ClampedArray(a.d) };
    for (let i = 0; i < o.d.length; i += 4) {
      const t = b.d[i + 3] / 255;
      if (!t) continue;
      for (let k = 0; k < 3; k++) o.d[i + k] = o.d[i + k] * (1 - t) + b.d[i + k] * t;
      o.d[i + 3] = Math.max(o.d[i + 3], b.d[i + 3]);
    }
    return o;
  }
  const rot90 = (img) => scale(img, img.h, img.w, (u, v) => [v, 1 - u]);
  const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    const x = c.getContext('2d'), id = x.createImageData(img.w, img.h);
    id.data.set(img.d);
    x.putImageData(id, 0, 0);
    return c;
  }
  function fromCanvas(c) {
    return { w: c.width, h: c.height, d: c.getContext('2d').getImageData(0, 0, c.width, c.height).data };
  }
  function blit(dst, img, dx, dy) {
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = (y * img.w + x) * 4, j = ((dy + y) * dst.w + dx + x) * 4;
      dst.d[j] = img.d[i]; dst.d[j + 1] = img.d[i + 1]; dst.d[j + 2] = img.d[i + 2]; dst.d[j + 3] = img.d[i + 3];
    }
  }
  // Upscales a 16px-tile procedural atlas so pack tiles of size R fit; returns { img, R }.
  function upscaleAtlas(base, R) {
    const n = base.width / 16, img = scale(fromCanvas(base), n * R, n * R);
    return img;
  }
  const pow2 = (n) => { let r = 16; while (r < n && r < 64) r *= 2; return r; };

  // ---------- 1.8 name mapping ----------
  const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
  const BLOCK_RENAME = {
    water: 'water_still', lava: 'lava_still', fire: 'fire_layer_0', anvil_top: 'anvil_top_damaged_0',
    dispenser_front: 'dispenser_front_horizontal', dropper_front: 'dropper_front_horizontal', sapling_big_oak: 'sapling_roofed_oak',
  };
  for (const c of COLORS) BLOCK_RENAME['wool_' + c] = 'wool_colored_' + c;
  for (let i = 0; i < 10; i++) BLOCK_RENAME['destroy_' + i] = 'destroy_stage_' + i;

  const DYES = ['black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'silver', 'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white'];
  const ITEM_RENAME = {
    fishing_rod: 'fishing_rod_uncast', bow: 'bow_standby', porkchop: 'porkchop_raw', cooked_porkchop: 'porkchop_cooked',
    fish_raw: 'fish_cod_raw', salmon_raw: 'fish_salmon_raw', clownfish: 'fish_clownfish_raw', pufferfish: 'fish_pufferfish_raw',
    fish_cooked: 'fish_cod_cooked', salmon_cooked: 'fish_salmon_cooked', beef: 'beef_raw', cooked_beef: 'beef_cooked',
    chicken: 'chicken_raw', cooked_chicken: 'chicken_cooked', baked_potato: 'potato_baked', poisonous_potato: 'potato_poisonous',
    golden_carrot: 'carrot_golden', rabbit: 'rabbit_raw', cooked_rabbit: 'rabbit_cooked', mutton: 'mutton_raw', cooked_mutton: 'mutton_cooked',
    milk_bucket: 'bucket_milk', wheat_seeds: 'seeds_wheat', book: 'book_normal', slime_ball: 'slimeball', pumpkin_seeds: 'seeds_pumpkin',
    melon_seeds: 'seeds_melon', glass_bottle: 'potion_bottle_empty', fermented_spider_eye: 'spider_eye_fermented',
    speckled_melon: 'melon_speckled', bucket: 'bucket_empty', water_bucket: 'bucket_water', lava_bucket: 'bucket_lava',
    fire_charge: 'fireball', fireball: 'fireball', writable_book: 'book_writable', written_book: 'book_written', map: 'map_empty',
    enchanted_book: 'book_enchanted', armor_stand: 'wooden_armorstand', redstone: 'redstone_dust',
    door_wooden_door: 'door_wood', door_iron_door: 'door_iron', door_spruce_door: 'door_spruce', door_birch_door: 'door_birch',
    door_jungle_door: 'door_jungle', door_acacia_door: 'door_acacia', door_dark_oak_door: 'door_dark_oak',
    minecart: 'minecart_normal', chest_minecart: 'minecart_chest', furnace_minecart: 'minecart_furnace', tnt_minecart: 'minecart_tnt',
    hopper_minecart: 'minecart_hopper', skull_0: 'skull_skeleton', skull_1: 'skull_wither', skull_2: 'skull_zombie', skull_3: 'skull_steve', skull_4: 'skull_creeper',
  };
  DYES.forEach((c, i) => { ITEM_RENAME['dye_' + i] = 'dye_powder_' + c; });
  const TOOL_MAT = { wood: 'wood', stone: 'stone', iron: 'iron', diamond: 'diamond', gold: 'gold' };
  const TOOL_KIND = { pick: 'pickaxe', axe: 'axe', shovel: 'shovel', sword: 'sword', hoe: 'hoe' };
  for (const m in TOOL_MAT) for (const k in TOOL_KIND) ITEM_RENAME[`tool_${k}_${m}`] = `${TOOL_MAT[m]}_${TOOL_KIND[k]}`;
  const ARMOR_MAT = { leather: 'leather', chain: 'chainmail', iron: 'iron', diamond: 'diamond', gold: 'gold' };
  for (const m in ARMOR_MAT) for (const k of ['helmet', 'chestplate', 'leggings', 'boots']) ITEM_RENAME[`armor_${k}_${m}`] = `${ARMOR_MAT[m]}_${k}`;
  // Spawn egg colours (base, spots) from MC.
  const EGG_COL = {
    zombie: [0x00afaf, 0x799c65], skeleton: [0xc1c1c1, 0x494949], creeper: [0x0da70b, 0x000000], spider: [0x342d27, 0xa80e0e],
    pig: [0xf0a5a2, 0xdb635f], cow: [0x443626, 0xa1a1a1], sheep: [0xe7e7e7, 0xffb5b5], chicken: [0xa1a1a1, 0xff0000],
    pigman: [0xea9393, 0x4c7129], ghast: [0xf9f9f9, 0xbcbcbc],
  };
  const LEATHER = hex(0xa06540);

  // Mob atlas regions: [our key, entity texture, u, v, w, h, d, options]
  // rot: body modelled lying down in MC (pig, cow, sheep, chicken) but upright in our box.
  const MOBS = [
    ['zombie_head', 'zombie/zombie', 0, 0, 8, 8, 8], ['zombie_body', 'zombie/zombie', 16, 16, 8, 12, 4],
    ['zombie_arm', 'zombie/zombie', 40, 16, 4, 12, 4], ['zombie_leg', 'zombie/zombie', 0, 16, 4, 12, 4],
    ['skeleton_head', 'skeleton/skeleton', 0, 0, 8, 8, 8], ['skeleton_body', 'skeleton/skeleton', 16, 16, 8, 12, 4],
    ['skeleton_limb', 'skeleton/skeleton', 40, 16, 2, 12, 2],
    ['creeper_head', 'creeper/creeper', 0, 0, 8, 8, 8], ['creeper_body', 'creeper/creeper', 16, 16, 8, 12, 4], ['creeper_leg', 'creeper/creeper', 0, 16, 4, 6, 4],
    ['spider_head', 'spider/spider', 32, 4, 8, 8, 8], ['spider_neck', 'spider/spider', 0, 0, 6, 6, 6],
    ['spider_body', 'spider/spider', 0, 12, 10, 8, 12], ['spider_leg', 'spider/spider', 18, 0, 16, 2, 2],
    ['pig_head', 'pig/pig', 0, 0, 8, 8, 8], ['pig_snout', 'pig/pig', 16, 16, 4, 3, 1], ['pig_body', 'pig/pig', 28, 8, 10, 16, 8, 'rot'], ['pig_leg', 'pig/pig', 0, 16, 4, 6, 4],
    ['cow_head', 'cow/cow', 0, 0, 8, 8, 6], ['cow_horn', 'cow/cow', 22, 0, 1, 3, 1], ['cow_body', 'cow/cow', 18, 4, 12, 18, 10, 'rot'], ['cow_leg', 'cow/cow', 0, 16, 4, 12, 4],
    ['steve_head', 'steve', 0, 0, 8, 8, 8], ['steve_body', 'steve', 16, 16, 8, 12, 4], ['steve_arm', 'steve', 40, 16, 4, 12, 4], ['steve_leg', 'steve', 0, 16, 4, 12, 4],
    ['sheep_wool', 'sheep/sheep_fur', 28, 8, 8, 16, 6, 'rot'], ['sheep_skin', 'sheep/sheep', 28, 8, 8, 16, 6, 'rot'],
    ['sheep_head', 'sheep/sheep', 0, 0, 6, 6, 8], ['sheep_leg', 'sheep/sheep', 0, 16, 4, 12, 4],
    ['chicken_body', 'chicken', 0, 9, 6, 8, 6, 'rot'], ['chicken_head', 'chicken', 0, 0, 4, 6, 3], ['chicken_beak', 'chicken', 14, 0, 4, 2, 2],
    ['chicken_wattle', 'chicken', 14, 4, 2, 2, 2], ['chicken_wing', 'chicken', 24, 13, 1, 4, 6], ['chicken_leg', 'chicken', 26, 0, 3, 5, 3],
    ['pigman_head', 'zombie_pigman', 0, 0, 8, 8, 8], ['pigman_body', 'zombie_pigman', 16, 16, 8, 12, 4],
    ['pigman_arm', 'zombie_pigman', 40, 16, 4, 12, 4], ['pigman_leg', 'zombie_pigman', 0, 16, 4, 12, 4],
    ['ghast_body', 'ghast/ghast', 0, 0, 16, 16, 16], ['ghast_leg', 'ghast/ghast', 0, 0, 2, 9, 2],
  ];
  // Worn armor pieces: [piece, layer, u, v, w, h, d, first row, last row] (rows crop the side faces).
  const ARMOR_PIECES = [
    ['head', 1, 0, 0, 8, 8, 8], ['body', 1, 16, 16, 8, 12, 4], ['shoulder', 1, 40, 16, 4, 12, 4, 0, 5],
    ['belt', 2, 16, 16, 8, 12, 4, 8, 12], ['leg', 2, 0, 16, 4, 12, 4, 0, 9], ['boot', 1, 0, 16, 4, 12, 4, 8, 12],
  ];

  // ---------- Building atlases from a pack ----------
  // Folder holding pack.mcmeta (some zips wrap everything in a top folder).
  function packRoot(zip) {
    const meta = zip.names.filter((n) => n.endsWith('pack.mcmeta')).sort((a, b) => a.length - b.length)[0];
    if (meta) return { meta, root: meta.slice(0, -'pack.mcmeta'.length) };
    const a = zip.names.find((n) => n.includes('assets/minecraft/'));
    return { meta: null, root: a ? a.slice(0, a.indexOf('assets/minecraft/')) : '' };
  }

  async function load(buf) {
    const zip = readZip(buf);
    const { meta, root } = packRoot(zip);
    const tex = root + 'assets/minecraft/textures/';
    if (!zip.names.some((n) => n.startsWith(tex))) throw new Error('El .zip no tiene assets/minecraft/textures (¿es un paquete de recursos?)');
    let name = 'Paquete', desc = '', format = 1;
    if (meta) {
      try {
        const m = JSON.parse(new TextDecoder().decode(await zip.read(meta)).replace(/^﻿/, ''));
        const d = m.pack && m.pack.description;
        desc = typeof d === 'string' ? d : d && d.text ? d.text : Array.isArray(d) ? d.map((p) => (typeof p === 'string' ? p : p.text || '')).join('') : '';
        desc = desc.replace(/§./g, '');
        format = (m.pack && m.pack.pack_format) || 1;
      } catch (e) { /* tolerate broken mcmeta */ }
    }
    // Decode every texture we may use.
    const imgs = new Map();
    const wanted = (n) => /\.png$/.test(n) && (/^(blocks?|items?|entity|models\/armor|colormap|particle)\//.test(n) || n === 'gui/icons.png');
    await Promise.all(zip.names.filter((n) => n.startsWith(tex) && wanted(n.slice(tex.length))).map(async (n) => {
      try { imgs.set(n.slice(tex.length, -4), await decodePng(await zip.read(n))); } catch (e) { /* skip unreadable png */ }
    }));
    let icon = null;
    const iconBytes = await zip.read(root + 'pack.png').catch(() => null);
    if (iconBytes) try { icon = toCanvas(scale(await decodePng(iconBytes), 64, 64)).toDataURL(); } catch (e) { /* no icon */ }
    return { imgs, format, desc, icon, name };
  }

  // 1.13+ packs use singular folder names; try both.
  function getter(imgs) {
    return (dir, n) => imgs.get(dir + '/' + n) || imgs.get(dir.replace(/s$/, '') + '/' + n) || null;
  }

  function colormapAt(img, fallback) {
    if (!img) return fallback;
    // Plains: temperature 0.8, rainfall 0.4.
    const x = Math.floor((1 - 0.8) * (img.w - 1)), y = Math.floor((1 - 0.4 * 0.8) * (img.h - 1)), i = (y * img.w + x) * 4;
    return [img.d[i], img.d[i + 1], img.d[i + 2]];
  }

  function blockTiles(get, pack) {
    const B = (n) => frame(get('blocks', n));
    const grass = colormapAt(get('colormap', 'grass'), hex(0x91bd59)), foliage = colormapAt(get('colormap', 'foliage'), hex(0x77ab2f));
    const TINT = {
      grass_top: grass, tallgrass: grass, fern: grass, reeds: grass, vine: foliage, waterlily: hex(0x208030),
      double_plant_grass_bottom: grass, double_plant_grass_top: grass, double_plant_fern_bottom: grass, double_plant_fern_top: grass,
      leaves_oak: foliage, leaves_jungle: foliage, leaves_acacia: foliage, leaves_big_oak: foliage, leaves_spruce: hex(0x619961), leaves_birch: hex(0x80a755),
    };
    const out = {};
    for (const name of VC.TILES) {
      let img = B(BLOCK_RENAME[name] || name);
      if (img && TINT[name]) img = tint(img, TINT[name]);
      if (img) out[name] = img;
    }
    // Composites.
    const side = B('grass_side'), ov = B('grass_side_overlay');
    if (side) out.grass_side = over(side, ov && tint(ov, grass));
    for (const r of ['normal', 'golden', 'detector', 'activator']) {
      const img = B('rail_' + r);
      if (img) { out[`rail_${r}_ns`] = img; out[`rail_${r}_ew`] = rot90(img); }
    }
    const dot = B('redstone_dust_dot'), l0 = B('redstone_dust_line0') || B('redstone_dust_line'), l1 = B('redstone_dust_line1') || (l0 && rot90(l0));
    if (dot || l0) {
      let cross = dot || blank(l0.w, l0.h);
      cross = over(over(cross, l0), l1);
      out.redstone_dust = tint(cross, [110, 0, 0]);
      out.redstone_dust_on = tint(cross, [255, 40, 10]);
    }
    // Chests are entity textures in 1.8: build the block faces from the model's UV layout.
    for (const [key, file] of [['chest', 'chest/normal'], ['ender_chest', 'chest/ender'], ['chest_trapped', 'chest/trapped']]) {
      const e = get('entity', file);
      if (!e || e.w < 64) continue;
      const k = e.w / 64, c = (x, y, w, h) => crop(e, x * k, y * k, w * k, h * k);
      const tile = (lid, base, knob) => {
        const t = blank(16 * k, 16 * k);
        blit(t, scale(lid, 16 * k, 6 * k), 0, 0);
        blit(t, scale(base, 16 * k, 10 * k), 0, 6 * k);
        if (knob) blit(t, knob, 7 * k, 3 * k);
        return t;
      };
      const front = tile(c(14, 14, 14, 5), c(14, 33, 14, 10), c(1, 1, 2, 4));
      if (key === 'chest_trapped') { out.chest_trapped_front = front; continue; }
      out[key + '_front'] = front;
      out[key + '_side'] = tile(c(0, 14, 14, 5), c(0, 33, 14, 10));
      out[key + '_top'] = scale(c(14, 0, 14, 14), 16 * k, 16 * k);
    }
    // Mob heads.
    for (const [key, file] of [['skeleton', 'skeleton/skeleton'], ['wither', 'skeleton/wither_skeleton'], ['zombie', 'zombie/zombie'], ['char', 'steve'], ['creeper', 'creeper/creeper']]) {
      const e = get('entity', file);
      if (!e) continue;
      const k = e.w / 64, s = (x, y) => scale(crop(e, x * k, y * k, 8 * k, 8 * k), 16 * k, 16 * k);
      out[`skull_${key}_side`] = s(0, 8); out[`skull_${key}_top`] = s(8, 0); out[`skull_${key}_front`] = s(8, 8);
    }
    return out;
  }

  function itemSprites(get) {
    const I = (n) => frame(get('items', n));
    const out = {};
    for (const name of VC.SPRITES) {
      const img = I(ITEM_RENAME[name] || name);
      if (img) out[name] = img;
    }
    for (const k of ['helmet', 'chestplate', 'leggings', 'boots']) {
      const base = I('leather_' + k);
      if (base) out['armor_' + k + '_leather'] = over(tint(base, LEATHER), I(`leather_${k}_overlay`));
    }
    const egg = I('spawn_egg'), spots = I('spawn_egg_overlay');
    if (egg) for (const m in EGG_COL) out['egg_' + m] = over(tint(egg, hex(EGG_COL[m][0])), spots && tint(spots, hex(EGG_COL[m][1])));
    const bottle = I('potion_bottle_drinkable'), liquid = I('potion_overlay');
    if (bottle) out.potion = over(bottle, liquid && tint(liquid, hex(0x385dc6)));
    const xp = I('experience_bottle');
    if (xp) out.experience_bottle = xp;
    // Particles (8px cells in a 16x16 grid).
    const sheet = get('particle', 'particles');
    if (sheet) {
      const k = sheet.w / 128, cell = (i) => crop(sheet, (i % 16) * 8 * k, Math.floor(i / 16) * 8 * k, 8 * k, 8 * k);
      out.particle_heart = cell(80); out.particle_angry = cell(81); out.particle_flame = cell(48);
      out.particle_smoke = tint(cell(7), [160, 160, 160]); out.particle_portal = tint(cell(7), [190, 80, 255]);
    }
    return out;
  }

  // Writes tiles into a copy of a procedural atlas (32x32 tiles), at the pack's resolution.
  function buildAtlas(base, tiles, index) {
    const sizes = Object.values(tiles).map((t) => t.w);
    const R = pow2(sizes.length ? Math.max(...sizes) : 16);
    const atlas = upscaleAtlas(base, R), N = base.width / 16;
    for (const name in tiles) {
      const t = index[name];
      if (t === undefined) continue;
      const img = tiles[name];
      blit(atlas, img.w === R && img.h === R ? img : scale(img, R, R), (t % N) * R, Math.floor(t / N) * R);
    }
    return toCanvas(atlas);
  }

  // Mob atlas: copies MC box-UV layouts into our regions, at k x the base resolution.
  function buildMobAtlas(base, get) {
    const { regions, S, faceRect } = VC.Models.atlasInfo();
    const ent = (n) => get('entity', n);
    const jobs = [];
    for (const [key, file, u, v, w, h, d, rot] of MOBS) { const img = ent(file); if (img && regions[key]) jobs.push([key, img, u, v, w, h, d, rot]); }
    for (const m in ARMOR_COLS) {
      const l1 = get('models', 'armor/' + ARMOR_COLS[m] + '_layer_1'), l2 = get('models', 'armor/' + ARMOR_COLS[m] + '_layer_2');
      for (const [piece, layer, u, v, w, h, d, r0, r1] of ARMOR_PIECES) {
        let img = layer === 1 ? l1 : l2;
        if (!img) continue;
        if (m === 'leather') img = over(tint(img, LEATHER), get('models', `armor/leather_layer_${layer}_overlay`));
        jobs.push([`armor_${m}_${piece}`, img, u, v, w, h, d, null, r0, r1]);
        if (piece === 'head') jobs.push([`armor_${m}_brow`, img, u, v, w, h, d, null, 0, 2]);
      }
    }
    if (!jobs.length) return base;
    const K = Math.max(1, Math.min(4, ...jobs.map((j) => Math.round(j[1].w / 64))));
    const atlas = scale(fromCanvas(base), S * K, S * K);
    for (const [key, img, u, v, w, h, d, rot, r0, r1] of jobs) {
      const k = img.w / 64, R = regions[key];
      const src = { u, v, w, h, d };
      for (const face of ['top', 'bottom', 'west', 'front', 'east', 'back']) {
        let sf = face;
        if (rot) sf = { front: 'top', back: 'bottom', top: 'back', bottom: 'front', west: 'west', east: 'east' }[face];
        const [sx, sy, sw, sh] = faceRect(src, sf);
        let part = crop(img, sx * k, sy * k, sw * k, sh * k);
        const side = sf !== 'top' && sf !== 'bottom';
        if (r0 !== undefined && side) part = crop(part, 0, r0 * k, sw * k, (r1 - r0) * k);
        const [dx, dy, dw, dh] = faceRect(R, face);
        let fn = null;
        if (rot && (face === 'west' || face === 'east')) fn = (a, b) => [1 - b, 1 - a];
        else if (rot && face === 'front') fn = (a, b) => [a, 1 - b];
        blit(atlas, scale(part, dw * K, dh * K, fn), dx * K, dy * K);
      }
    }
    return toCanvas(atlas);
  }
  const ARMOR_COLS = { leather: 'leather', chain: 'chainmail', iron: 'iron', gold: 'gold', diamond: 'diamond' };

  // HUD glyphs from gui/icons.png (9x9 cells drawn over their empty container).
  function hudIcons(get) {
    const g = get('gui', 'icons');
    if (!g) return null;
    const k = g.w / 256, c = (x, y) => crop(g, x * k, y * k, 9 * k, 9 * k), url = (img) => toCanvas(img).toDataURL();
    const set = (bg, full, half) => [url(over(bg, full)), url(over(bg, half)), url(bg)];
    const [heart, heartHalf, heartEmpty] = set(c(16, 0), c(52, 0), c(61, 0));
    const [food, foodHalf, foodEmpty] = set(c(16, 27), c(52, 27), c(61, 27));
    return {
      heart, heartHalf, heartEmpty, food, foodHalf, foodEmpty,
      armor: url(c(34, 9)), armorHalf: url(c(25, 9)), armorEmpty: url(c(16, 9)), bubble: url(c(16, 18)),
    };
  }

  // Returns { atlas, items, mobs, hud } canvases built over the procedural ones.
  function build(pack, base) {
    const get = getter(pack.imgs);
    return {
      atlas: buildAtlas(base.atlas, blockTiles(get), VC.TILE_INDEX),
      items: buildAtlas(base.items, itemSprites(get), VC.SPRITE_INDEX),
      mobs: buildMobAtlas(base.mobs, get),
      hud: hudIcons(get),
    };
  }

  // ---------- Storage (IndexedDB) ----------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('vibecraft', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('packs', mode), st = t.objectStore('packs');
      const r = fn(st);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error);
    });
  }
  const list = () => tx('readonly', (st) => st.getAll()).then((all) => (all || []).map(({ data, ...info }) => info));
  const getData = (id) => tx('readonly', (st) => st.get(id)).then((p) => p && p.data);
  const remove = (id) => tx('readwrite', (st) => st.delete(id));
  // ---------- Sounds ----------
  // { files: Map('dig/stone1' -> ogg bytes), events: sounds.json (names lowercased, file refs only) }
  async function loadSounds(buf) {
    const zip = readZip(buf);
    const { root } = packRoot(zip);
    const dir = root + 'assets/minecraft/sounds/';
    const files = new Map();
    await Promise.all(zip.names.filter((n) => n.startsWith(dir) && n.endsWith('.ogg')).map(async (n) => {
      try { files.set(n.slice(dir.length, -4), await zip.read(n)); } catch (e) { /* skip */ }
    }));
    const events = {};
    const json = await zip.read(root + 'assets/minecraft/sounds.json').catch(() => null);
    if (json) {
      try {
        const j = JSON.parse(new TextDecoder().decode(json).replace(/^\uFEFF/, ''));
        for (const [k, v] of Object.entries(j)) {
          const list = (v.sounds || []).map((e) => (typeof e === 'string' ? { name: e } : e)).filter((e) => e.name && e.type !== 'event')
            .map((e) => ({ name: e.name.toLowerCase().replace(/^minecraft:/, ''), volume: e.volume === undefined ? 1 : e.volume, pitch: e.pitch === undefined ? 1 : e.pitch, weight: e.weight === undefined ? 1 : e.weight }));
          events[k.toLowerCase()] = list;
        }
      } catch (e) { /* broken sounds.json: files alone still work */ }
    }
    return { files, events };
  }

  // Stores a pack. kind 'textures' also returns it loaded (to apply right away); 'sounds' just checks.
  async function install(file, kind = 'textures') {
    const data = await file.arrayBuffer();
    const zip = readZip(data);
    const { root } = packRoot(zip);
    const hasTex = zip.names.some((n) => n.startsWith(root + 'assets/minecraft/textures/'));
    const hasSounds = zip.names.some((n) => n.startsWith(root + 'assets/minecraft/sounds/') && n.endsWith('.ogg'));
    if (kind === 'sounds' && !hasSounds) throw new Error('Este .zip no tiene sonidos (assets/minecraft/sounds/*.ogg)');
    const pack = hasTex ? await load(data) : null; // validates and gets name/icon
    let icon = pack ? pack.icon : null, desc = pack ? pack.desc : '', format = pack ? pack.format : 1;
    if (!pack) {
      const iconBytes = await zip.read(root + 'pack.png').catch(() => null);
      if (iconBytes) try { icon = toCanvas(scale(await decodePng(iconBytes), 64, 64)).toDataURL(); } catch (e) { /* no icon */ }
      const meta = await zip.read(root + 'pack.mcmeta').catch(() => null);
      if (meta) try {
        const m = JSON.parse(new TextDecoder().decode(meta).replace(/^\uFEFF/, '')), d = m.pack && m.pack.description;
        desc = (typeof d === 'string' ? d : d && d.text ? d.text : '').replace(/§./g, '');
        format = (m.pack && m.pack.pack_format) || 1;
      } catch (e) { /* no description */ }
    }
    const info = { id: Date.now().toString(36), name: file.name.replace(/\.zip$/i, ''), desc, icon, format, hasTex, hasSounds };
    await tx('readwrite', (st) => st.put(Object.assign({ data }, info)));
    return { info, pack };
  }

  return { readZip, load, loadSounds, build, list, getData, install, remove };
})();
