'use strict';

// Procedurally paints every block tile into a 512x512 atlas (32x32 tiles of 16px).

VC.Textures = (function () {
  const S = 512, NT = VC.ATLAS_TILES;

  function build() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;

    let seed = 1337;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const ri = (n) => Math.floor(rnd() * n);
    const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const vary = (c, v) => mul(c, 1 + (rnd() - 0.5) * v);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const T = (name) => VC.tile(name);

    function set(t, x, y, c, a) {
      if (x < 0 || y < 0 || x > 15 || y > 15) return;
      const px = (t % NT) * 16 + x, py = Math.floor(t / NT) * 16 + y, i = (py * S + px) * 4;
      d[i] = cl(c[0]); d[i + 1] = cl(c[1]); d[i + 2] = cl(c[2]); d[i + 3] = a === undefined ? 255 : a;
    }
    function get(t, x, y) {
      const px = (t % NT) * 16 + (x & 15), py = Math.floor(t / NT) * 16 + (y & 15), i = (py * S + px) * 4;
      return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    }
    function copy(src, dst) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = get(src, x, y); set(dst, x, y, c, c[3]); }
    }
    const each = (fn) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) fn(x, y); };
    const painted = new Set();
    // paint(name, fn(set(x,y,c,a), get)) — fn draws in tile-local coordinates.
    function paint(name, fn) {
      const t = T(name);
      painted.add(name);
      fn((x, y, c, a) => set(t, x, y, c, a), (x, y) => get(t, x, y), t);
      return t;
    }
    const noisy = (name, base, v, extra) => paint(name, (p) => each((x, y) => {
      let c = vary(base, v);
      if (extra) c = extra(x, y, c) || c;
      p(x, y, c);
    }));
    function voronoi(name, count, colorFn, mortarW, mortarCol) {
      const pts = [];
      for (let i = 0; i < count; i++) pts.push({ x: rnd() * 16, y: rnd() * 16, c: colorFn() });
      paint(name, (p) => each((x, y) => {
        let d1 = 1e9, d2 = 1e9, best = null;
        for (const q of pts) {
          let dx = Math.abs(x + 0.5 - q.x), dy = Math.abs(y + 0.5 - q.y);
          dx = Math.min(dx, 16 - dx); dy = Math.min(dy, 16 - dy);
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < d1) { d2 = d1; d1 = dd; best = q; } else if (dd < d2) d2 = dd;
        }
        p(x, y, d2 - d1 < mortarW ? vary(mortarCol, 0.1) : vary(best.c, 0.1));
      }));
    }
    const derive = (name, src, fn) => paint(name, (p, g, t) => { copy(T(src), t); fn && fn(p, g); });

    // ---------- Natural ----------
    const DIRT = [134, 96, 67], GRASS = [95, 159, 53];
    noisy('dirt', DIRT, 0.25, (x, y, c) => { const r = rnd(); return r < 0.12 ? mul(c, 0.72) : r < 0.2 ? mul(c, 1.15) : c; });
    noisy('coarse_dirt', DIRT, 0.3, (x, y, c) => (rnd() < 0.25 ? vary([110, 110, 110], 0.2) : c));
    noisy('grass_top', GRASS, 0.3, (x, y, c) => (rnd() < 0.12 ? mul(c, 0.8) : c));
    derive('grass_side', 'dirt', (p) => { for (let x = 0; x < 16; x++) { const dp = 3 + ri(2) + (rnd() < 0.25 ? 1 : 0); for (let y = 0; y < dp; y++) p(x, y, vary(GRASS, 0.3)); } });
    derive('grass_side_snowed', 'dirt', (p) => { for (let x = 0; x < 16; x++) { const dp = 2 + ri(2) + (rnd() < 0.3 ? 1 : 0); for (let y = 0; y < dp; y++) p(x, y, vary([240, 251, 251], 0.05)); } });
    noisy('podzol_top', [92, 62, 32], 0.3, (x, y, c) => (rnd() < 0.2 ? vary([60, 40, 20], 0.2) : c));
    derive('podzol_side', 'dirt', (p) => { for (let x = 0; x < 16; x++) { const dp = 3 + ri(2); for (let y = 0; y < dp; y++) p(x, y, vary([92, 62, 32], 0.25)); } });
    noisy('mycelium_top', [111, 98, 101], 0.25, (x, y, c) => (rnd() < 0.15 ? vary([150, 130, 140], 0.1) : c));
    derive('mycelium_side', 'dirt', (p) => { for (let x = 0; x < 16; x++) { const dp = 3 + ri(2); for (let y = 0; y < dp; y++) p(x, y, vary([111, 98, 101], 0.25)); } });
    noisy('sand', [219, 207, 160], 0.1, (x, y, c) => (rnd() < 0.08 ? mul(c, 0.88) : c));
    noisy('red_sand', [190, 102, 33], 0.12, (x, y, c) => (rnd() < 0.08 ? mul(c, 0.85) : c));
    voronoi('gravel', 22, () => [[130, 124, 122], [100, 95, 95], [160, 152, 150], [115, 104, 95]][ri(4)], 0.5, [85, 80, 80]);
    noisy('clay', [160, 166, 179], 0.08);
    noisy('snow', [240, 251, 251], 0.05);
    paint('ice', (p) => each((x, y) => p(x, y, vary([140, 180, 252], 0.08), 170)));
    noisy('ice_packed', [160, 190, 250], 0.1);
    noisy('soul_sand', [84, 64, 51], 0.25, (x, y, c) => (((x % 5 === 2) && (y % 6 === 3)) || ((x % 5 === 3) && (y % 6 === 3)) ? [40, 30, 25] : c));
    noisy('netherrack', [111, 54, 52], 0.3, (x, y, c) => (rnd() < 0.15 ? vary([80, 30, 30], 0.2) : c));
    paint('glowstone', (p) => each((x, y) => p(x, y, rnd() < 0.4 ? vary([254, 224, 140], 0.1) : vary([170, 130, 70], 0.2))));
    noisy('end_stone', [221, 223, 165], 0.1, (x, y, c) => (rnd() < 0.08 ? mul(c, 0.85) : c));
    noisy('obsidian', [20, 18, 30], 0.3, (x, y, c) => (rnd() < 0.12 ? vary([62, 45, 92], 0.2) : c));
    paint('bedrock', (p) => each((x, y) => { const g = [40, 70, 100, 135][ri(4)]; p(x, y, [g, g, g]); }));
    paint('water', (p) => each((x, y) => p(x, y, mul([44, 86, 206], 1 + 0.12 * Math.sin((x + y * 0.5) * 0.8) + (rnd() - 0.5) * 0.08), 175)));
    paint('lava', (p) => each((x, y) => {
      const k = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2);
      p(x, y, mix([200, 60, 0], [255, 200, 40], k * (0.7 + rnd() * 0.3)));
    }));
    noisy('sponge', [195, 192, 74], 0.15, (x, y, c) => (rnd() < 0.2 ? mul(c, 0.7) : c));
    noisy('sponge_wet', [171, 181, 70], 0.15, (x, y, c) => (rnd() < 0.2 ? mul(c, 0.7) : c));

    // ---------- Stone family ----------
    function stone(name, base, v = 0.14) {
      paint(name, (p) => {
        each((x, y) => p(x, y, vary(base, v)));
        for (let i = 0; i < 10; i++) {
          const sx = ri(16), sy = ri(16), len = 2 + ri(3), k = rnd() < 0.5 ? 0.82 : 1.1;
          for (let j = 0; j < len; j++) p((sx + j) & 15, sy, vary(mul(base, k), 0.06));
        }
      });
    }
    stone('stone', [125, 125, 125]);
    stone('granite', [154, 106, 89], 0.2);
    stone('diorite', [188, 188, 188], 0.2);
    stone('andesite', [136, 136, 137], 0.18);
    const polished = (name, base) => paint(name, (p) => each((x, y) => {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      p(x, y, vary(edge ? mul(base, 0.85) : base, 0.07));
    }));
    polished('granite_smooth', [159, 107, 88]);
    polished('diorite_smooth', [196, 196, 198]);
    polished('andesite_smooth', [132, 135, 134]);
    function ore(name, col, base = [125, 125, 125]) {
      paint(name, (p, g, t) => {
        each((x, y) => p(x, y, vary(base, 0.14)));
        for (let c = 0; c < 5; c++) {
          let cx = 1 + ri(13), cy = 1 + ri(13);
          const n = 3 + ri(3);
          for (let k = 0; k < n; k++) {
            p(cx, cy, mul(col, 0.8 + rnd() * 0.4));
            if (rnd() < 0.5) cx += ri(3) - 1; else cy += ri(3) - 1;
          }
        }
      });
    }
    ore('coal_ore', [35, 35, 35]);
    ore('iron_ore', [216, 175, 147]);
    ore('gold_ore', [252, 238, 75]);
    ore('diamond_ore', [93, 236, 245]);
    ore('lapis_ore', [30, 70, 190]);
    ore('redstone_ore', [220, 20, 20]);
    ore('emerald_ore', [23, 221, 98]);
    ore('quartz_ore', [235, 228, 220], [111, 54, 52]);
    voronoi('cobblestone', 10, () => mul([125, 125, 125], 0.75 + rnd() * 0.45), 1.0, [70, 70, 70]);
    derive('cobblestone_mossy', 'cobblestone', (p) => {
      const mn = new VC.Noise(7);
      each((x, y) => { if (mn.noise2(x / 5, y / 5) > 0.05 && rnd() < 0.85) p(x, y, vary([78, 112, 52], 0.25)); });
    });
    const bricks = (name, base, mortar, rowH = 4, len = 8) => paint(name, (p) => each((x, y) => {
      const row = Math.floor(y / rowH), off = (row & 1) ? len / 2 : 0;
      if (y % rowH === rowH - 1 || ((x + off) % len) === len - 1) p(x, y, vary(mortar, 0.06));
      else p(x, y, vary(base, 0.15));
    }));
    bricks('brick', [151, 74, 58], [178, 168, 158]);
    bricks('nether_brick', [55, 26, 32], [30, 14, 18]);
    const stoneBrick = (name, base, f) => paint(name, (p) => each((x, y) => {
      const half = y >> 3, vx = half ? 7 : 15;
      let c;
      if ((y & 7) === 7 || x === vx) c = mul(base, 0.6);
      else if ((y & 7) === 0 || x === ((vx + 1) & 15)) c = mul(base, 1.15);
      else c = base;
      c = vary(c, 0.1);
      p(x, y, f ? f(x, y, c) : c);
    }));
    stoneBrick('stonebrick', [122, 122, 122]);
    stoneBrick('stonebrick_mossy', [122, 122, 122], (x, y, c) => (rnd() < 0.35 ? vary([78, 112, 52], 0.25) : c));
    stoneBrick('stonebrick_cracked', [118, 118, 118], (x, y, c) => (Math.abs(x - 8 - Math.sin(y) * 2) < 0.6 ? [60, 60, 60] : c));
    paint('stonebrick_carved', (p) => each((x, y) => {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p(x, y, vary(r > 6.5 ? [100, 100, 100] : r > 5 ? [150, 150, 150] : r > 2 ? [120, 120, 120] : [95, 95, 95], 0.08));
    }));
    paint('stone_slab_top', (p) => each((x, y) => p(x, y, vary(x === 0 || y === 0 || x === 15 || y === 15 ? [150, 150, 150] : [168, 168, 168], 0.05))));
    paint('stone_slab_side', (p) => each((x, y) => p(x, y, vary(y === 7 || y === 8 ? [120, 120, 120] : y === 0 || y === 15 ? [150, 150, 150] : [165, 165, 165], 0.05))));
    // Sandstones
    const sandstone = (pre, base, top) => {
      noisy(pre + '_top', mul(base, 1.03), 0.06);
      noisy(pre + '_bottom', mul(base, 0.97), 0.08);
      const bandK = []; for (let i = 0; i < 16; i++) bandK.push(0.94 + rnd() * 0.1);
      paint(pre + '_normal', (p) => each((x, y) => {
        let c = y < 3 ? mul(base, 1.06) : y === 3 ? mul(base, 0.88) : mul(base, bandK[y]);
        if (y > 12) c = mul(c, 0.95);
        p(x, y, vary(c, 0.05));
      }));
      paint(pre + '_carved', (p) => each((x, y) => {
        let c = base;
        if (y < 2 || y > 13) c = mul(base, 1.05);
        else if (y === 2 || y === 13) c = mul(base, 0.8);
        else if (Math.abs(x - 7.5) < 3 && Math.abs(y - 7.5) < 3.5) c = mul(base, ((x + y) & 1) ? 0.8 : 0.95);
        p(x, y, vary(c, 0.05));
      }));
      paint(pre + '_smooth', (p) => each((x, y) => p(x, y, vary(y < 1 || y > 14 ? mul(base, 1.05) : base, 0.04))));
    };
    sandstone('sandstone', [216, 203, 155]);
    sandstone('red_sandstone', [180, 96, 32]);
    // Quartz
    noisy('quartz_block_top', [236, 230, 223], 0.04);
    noisy('quartz_block_side', [236, 230, 223], 0.04);
    noisy('quartz_block_bottom', [228, 222, 215], 0.04);
    paint('quartz_block_chiseled', (p) => each((x, y) => p(x, y, vary((y === 1 || y === 14 || (x === 3 || x === 12) && y > 3 && y < 12) ? [200, 192, 184] : [236, 230, 223], 0.04))));
    paint('quartz_block_chiseled_top', (p) => each((x, y) => p(x, y, vary(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 5.5 && Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) < 6.6 ? [200, 192, 184] : [236, 230, 223], 0.04))));
    paint('quartz_block_lines', (p) => each((x, y) => p(x, y, vary(x % 4 === 0 ? [210, 203, 195] : [236, 230, 223], 0.04))));
    paint('quartz_block_lines_top', (p) => each((x, y) => p(x, y, vary(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)) > 6.5 ? [210, 203, 195] : [236, 230, 223], 0.04))));
    // Prismarine
    noisy('prismarine_rough', [99, 156, 151], 0.25, (x, y, c) => (rnd() < 0.2 ? vary([70, 120, 140], 0.2) : c));
    bricks('prismarine_bricks', [99, 171, 158], [70, 130, 120], 8, 16);
    bricks('prismarine_dark', [51, 91, 75], [30, 60, 50], 8, 8);
    paint('sea_lantern', (p) => each((x, y) => {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const cross = Math.abs(x - y) < 1.5 || Math.abs(x + y - 15) < 1.5;
      p(x, y, vary(edge ? [140, 170, 160] : cross ? [250, 255, 250] : [200, 225, 215], 0.05));
    }));
    // Clays
    const HC = [150, 92, 66];
    noisy('hardened_clay', HC, 0.06);
    VC.COLORS.forEach((c, i) => {
      const col = mix(VC.COLOR_RGB[i], HC, 0.45);
      noisy('hardened_clay_stained_' + c, col, 0.06);
    });
    // Metal & gem blocks
    const metal = (name, base, hi) => paint(name, (p) => each((x, y) => {
      let c = base;
      if (x === 0 || y === 0) c = hi;
      else if (x === 15 || y === 15) c = mul(base, 0.75);
      else if ((x + y) % 7 === 0) c = mix(base, hi, 0.4);
      p(x, y, vary(c, 0.04));
    }));
    metal('gold_block', [249, 210, 60], [255, 250, 160]);
    metal('iron_block', [220, 220, 220], [250, 250, 250]);
    metal('diamond_block', [98, 219, 214], [200, 255, 250]);
    metal('emerald_block', [42, 203, 87], [150, 255, 180]);
    metal('lapis_block', [30, 68, 160], [90, 130, 230]);
    metal('redstone_block', [175, 25, 10], [240, 80, 60]);
    noisy('coal_block', [24, 24, 24], 0.3);

    // ---------- Wood ----------
    const WOOD_PLANK = { oak: [160, 130, 80], spruce: [104, 78, 47], birch: [196, 179, 123], jungle: [160, 115, 80], acacia: [168, 90, 50], big_oak: [66, 43, 20] };
    const WOOD_BARK = { oak: [104, 83, 50], spruce: [58, 37, 16], birch: [215, 215, 210], jungle: [87, 67, 26], acacia: [104, 97, 88], big_oak: [60, 46, 26] };
    const WOOD_LEAF = { oak: [58, 128, 36], spruce: [56, 92, 56], birch: [100, 140, 70], jungle: [48, 140, 20], acacia: [75, 130, 30], big_oak: [50, 110, 30] };
    function planks(name, base) {
      const boardK = [], seams = [];
      for (let i = 0; i < 4; i++) { boardK.push(0.9 + rnd() * 0.15); seams.push(ri(16)); }
      paint(name, (p) => each((x, y) => {
        const b = y >> 2;
        let c = mul(base, boardK[b] * (1 + (rnd() - 0.5) * 0.08));
        if ((y & 3) === 3) c = mul(c, 0.66);
        else if (x === seams[b]) c = mul(c, 0.72);
        else if (rnd() < 0.08) c = mul(c, 0.9);
        p(x, y, c);
      }));
    }
    for (const w of VC.WOODS) {
      planks('planks_' + w, WOOD_PLANK[w]);
      const bark = WOOD_BARK[w];
      const colK = []; for (let i = 0; i < 16; i++) colK.push(0.72 + rnd() * 0.38);
      paint('log_' + w, (p) => each((x, y) => {
        let c = mul(bark, colK[x] * (1 + (rnd() - 0.5) * 0.12));
        if (w === 'birch' && rnd() < 0.12) c = vary([40, 40, 40], 0.3);
        else if (rnd() < 0.03) c = mul(c, 0.7);
        p(x, y, c);
      }));
      paint('log_' + w + '_top', (p) => each((x, y) => {
        const r = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
        const pl = WOOD_PLANK[w];
        p(x, y, vary(r >= 7 ? mul(bark, 0.8 + rnd() * 0.3) : (r % 2 === 0 ? mul(pl, 1.1) : mul(pl, 0.9)), 0.06));
      }));
      paint('leaves_' + w, (p) => each((x, y) => {
        if (rnd() < 0.2) return;
        let k = 1 + (rnd() - 0.5) * 0.35; if (rnd() < 0.15) k *= 0.7;
        p(x, y, mul(WOOD_LEAF[w], k));
      }));
      paint('sapling_' + w, (p) => {
        for (let y = 8; y < 16; y++) p(7, y, vary(bark, 0.15));
        for (let k = 0; k < 26; k++) {
          const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (w === 'spruce' ? 4 : 5);
          p(Math.round(7.5 + Math.cos(a) * r), Math.round(6 + Math.sin(a) * r * (w === 'spruce' ? 1.3 : 0.9)), vary(WOOD_LEAF[w], 0.3));
        }
      });
    }

    // ---------- Wool & glass ----------
    VC.COLORS.forEach((c, i) => {
      const base = VC.COLOR_RGB[i];
      paint('wool_' + c, (p) => each((x, y) => {
        const k = ((x + y * 3) % 5 === 0 ? 0.88 : 1) * (1 + (rnd() - 0.5) * 0.1);
        p(x, y, mul(base, k));
      }));
      paint('glass_' + c, (p) => each((x, y) => {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        p(x, y, edge ? mul(base, 0.9) : base, edge ? 220 : 120);
      }));
    });
    paint('glass', (p) => {
      each((x, y) => { if (x === 0 || y === 0 || x === 15 || y === 15) p(x, y, [218, 238, 245]); });
      [[3, 4], [4, 3], [5, 2], [9, 11], [10, 10], [11, 9], [12, 8]].forEach(([x, y]) => p(x, y, [200, 230, 240]));
    });
    paint('iron_bars', (p) => each((x, y) => { if (x % 5 === 1 || x % 5 === 2 || y === 0 || y === 15) p(x, y, vary([120, 120, 120], 0.15)); }));
    paint('slime', (p) => each((x, y) => {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      const inner = x > 4 && x < 11 && y > 4 && y < 11;
      p(x, y, vary(edge || inner ? [100, 170, 80] : [120, 200, 100], 0.05), edge || inner ? 230 : 150);
    }));

    // ---------- Plants ----------
    const stem = [40, 110, 30];
    const flower = (name, petal, center, opt = {}) => paint(name, (p) => {
      for (let y = opt.stemTop || 8; y < 16; y++) p(7, y, vary(stem, 0.15));
      p(6, 12, vary(stem, 0.2)); p(8, 13, vary(stem, 0.2)); p(5, 11, vary(stem, 0.2)); p(9, 12, vary(stem, 0.2));
      const cy = opt.cy || 5, r = opt.r || 2.6;
      each((x, y) => {
        const dd = Math.hypot(x - 7, (y - cy) * (opt.squash || 1));
        if (dd < r) p(x, y, dd < 1 && center ? center : vary(petal, 0.2));
      });
    });
    flower('flower_dandelion', [245, 215, 40], null, { cy: 7, r: 2.3, stemTop: 9 });
    flower('flower_rose', [195, 22, 26], [110, 10, 10]);
    flower('flower_blue_orchid', [40, 160, 230], [200, 230, 255]);
    flower('flower_allium', [190, 110, 230], [230, 180, 255], { r: 3 });
    flower('flower_houstonia', [230, 235, 245], [240, 220, 80], { r: 3 });
    flower('flower_tulip_red', [220, 40, 30], null, { squash: 0.7 });
    flower('flower_tulip_orange', [240, 130, 30], null, { squash: 0.7 });
    flower('flower_tulip_white', [235, 235, 235], null, { squash: 0.7 });
    flower('flower_tulip_pink', [240, 160, 200], null, { squash: 0.7 });
    flower('flower_oxeye_daisy', [240, 240, 240], [240, 210, 40], { r: 3 });
    const blades = (name, col, n = 11, hmin = 5, hvar = 10) => paint(name, (p) => {
      for (let k = 0; k < n; k++) {
        let x = 1 + ri(14);
        const h = hmin + ri(hvar), lean = rnd() < 0.5 ? -1 : 1;
        for (let i = 0; i < h; i++) { if (i > h * 0.6 && rnd() < 0.4) x += lean; p(x, 15 - i, vary(col, 0.3)); }
      }
    });
    blades('tallgrass', [82, 150, 50]);
    blades('fern', [70, 130, 50], 8, 6, 8);
    blades('deadbush', [140, 100, 50], 7, 4, 8);
    blades('reeds', [120, 190, 80], 5, 14, 2);
    paint('web', (p) => each((x, y) => { if (x === y || x === 15 - y || x === 7 || y === 7 || (Math.abs(Math.hypot(x - 7.5, y - 7.5) - 5) < 0.5)) p(x, y, [230, 230, 230], 230); }));
    const mushroom = (name, cap, spots) => paint(name, (p) => {
      for (let y = 9; y < 15; y++) { p(7, y, [220, 210, 190]); p(8, y, [210, 200, 180]); }
      each((x, y) => { if (y >= 4 && y <= 9 && Math.hypot(x - 7.5, (y - 9) * 1.4) < 5) p(x, y, spots && rnd() < 0.2 ? spots : vary(cap, 0.1)); });
    });
    mushroom('mushroom_brown', [150, 110, 80]);
    mushroom('mushroom_red', [200, 30, 30], [240, 240, 240]);
    for (let s = 0; s < 8; s++) {
      const col = mix([60, 160, 40], [200, 170, 60], s / 7);
      paint('wheat_stage_' + s, (p) => {
        const h = 2 + Math.round(s * 1.7);
        for (const x0 of [2, 6, 9, 13]) for (let i = 0; i < h; i++) p(x0 + (i > h - 3 ? 1 : 0), 15 - i, vary(col, 0.15));
      });
    }
    const roots = (pre, top, n) => {
      for (let s = 0; s < n; s++) paint(pre + s, (p) => {
        const h = 3 + s * 3;
        for (const x0 of [3, 7, 11]) for (let i = 0; i < h; i++) p(x0 + (i & 1), 15 - i, vary([60, 150, 40], 0.2));
        if (s === n - 1) for (const x0 of [3, 7, 11]) p(x0, 15, top);
      });
    };
    roots('carrots_stage_', [240, 140, 30], 4);
    roots('potatoes_stage_', [200, 170, 90], 4);
    for (let s = 0; s < 3; s++) paint('nether_wart_stage_' + s, (p) => {
      for (const x0 of [3, 7, 11]) for (let i = 0; i < 3 + s * 3; i++) p(x0 + (i % 2), 15 - i, vary([150, 20, 30], 0.2));
    });
    paint('vine', (p) => each((x, y) => { if (((x * 7 + y * 3) % 5 < 2 && rnd() < 0.8) || x % 6 === 2) p(x, y, vary([60, 120, 40], 0.3)); }));
    paint('waterlily', (p) => each((x, y) => { const r = Math.hypot(x - 7.5, y - 7.5); if (r < 7.5 && !(x > 7 && Math.abs(y - 7.5) < x - 7)) p(x, y, vary([32, 128, 48], 0.2)); }));
    const DP = { sunflower: [250, 200, 30], syringa: [200, 140, 220], grass: null, fern: null, rose: [210, 30, 40], paeonia: [230, 170, 220] };
    for (const k in DP) {
      paint('double_plant_' + k + '_bottom', (p) => {
        for (let y = 0; y < 16; y++) p(7, y, vary(stem, 0.15));
        for (let i = 0; i < 6; i++) { p(6 - (i & 1), 4 + i * 2, vary(stem, 0.2)); p(8 + (i & 1), 5 + i * 2, vary(stem, 0.2)); }
        if (!DP[k]) for (let x = 1; x < 15; x += 2) for (let y = 3 + ri(4); y < 16; y++) p(x, y, vary(k === 'fern' ? [70, 130, 50] : [82, 150, 50], 0.3));
      });
      paint('double_plant_' + k + '_top', (p) => {
        if (!DP[k]) { for (let x = 1; x < 15; x += 2) for (let y = 4 + ri(6); y < 16; y++) p(x, y, vary(k === 'fern' ? [70, 130, 50] : [82, 150, 50], 0.3)); return; }
        for (let y = 8; y < 16; y++) p(7, y, vary(stem, 0.15));
        each((x, y) => { const r = Math.hypot(x - 7.5, y - 6); if (r < (k === 'sunflower' ? 5 : 4)) p(x, y, k === 'sunflower' && r < 2.5 ? [100, 60, 20] : vary(DP[k], 0.2)); });
      });
    }
    noisy('cactus_side', [26, 118, 38], 0.12, (x, y, c) => (x === 0 || x === 15 ? [18, 88, 26] : x === 4 || x === 11 ? [16, 82, 24] : rnd() < 0.035 ? [220, 220, 180] : c));
    paint('cactus_top', (p) => each((x, y) => { const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p(x, y, vary(r > 6 ? [18, 88, 26] : r > 4 ? [30, 128, 44] : [70, 160, 70], 0.1)); }));
    noisy('cactus_bottom', [150, 190, 120], 0.1);
    paint('melon_side', (p) => each((x, y) => p(x, y, vary((x % 4 < 2) ? [110, 150, 30] : [80, 120, 20], 0.12))));
    paint('melon_top', (p) => each((x, y) => p(x, y, vary(Math.hypot(x - 7.5, y - 7.5) < 2 ? [130, 120, 40] : [100, 140, 30], 0.12))));
    paint('pumpkin_side', (p) => each((x, y) => p(x, y, vary((x % 4 === 0) ? [180, 100, 10] : [225, 135, 20], 0.1))));
    paint('pumpkin_top', (p) => each((x, y) => p(x, y, vary(Math.hypot(x - 7.5, y - 7.5) < 2 ? [100, 90, 30] : (x % 4 === 0 || y % 4 === 0) ? [190, 110, 15] : [225, 135, 20], 0.1))));
    const face = (name, glow) => derive(name, 'pumpkin_side', (p) => {
      const c = glow ? [255, 220, 60] : [40, 25, 5];
      [[3, 4], [4, 4], [3, 5], [11, 4], [12, 4], [12, 5]].forEach(([x, y]) => p(x, y, c));
      for (let x = 3; x <= 12; x++) p(x, 10, c);
      for (let x = 4; x <= 11; x++) if (x % 3) p(x, 11, c);
    });
    face('pumpkin_face_off', false);
    face('pumpkin_face_on', true);
    noisy('hay_block_side', [200, 170, 30], 0.15, (x, y, c) => (y === 3 || y === 12 ? [120, 70, 20] : c));
    noisy('hay_block_top', [180, 150, 30], 0.2);
    paint('mushroom_block_skin_brown', (p) => each((x, y) => p(x, y, vary([142, 106, 80], 0.1))));
    paint('mushroom_block_skin_red', (p) => each((x, y) => p(x, y, rnd() < 0.08 ? [240, 240, 240] : vary([182, 30, 30], 0.1))));

    // ---------- Crafted / utility ----------
    derive('crafting_table_top', 'planks_oak', (p) => each((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) p(x, y, vary([92, 64, 36], 0.1));
      else if (x === 5 || x === 10 || y === 5 || y === 10) p(x, y, vary([120, 88, 50], 0.1));
    }));
    derive('crafting_table_side', 'planks_oak', (p) => each((x, y) => {
      if (y < 3) p(x, y, vary([92, 64, 36], 0.12));
      if (y >= 5 && y <= 12 && (x === 3 || x === 12)) p(x, y, [70, 70, 70]);
      if (y === 6 && x >= 3 && x <= 6) p(x, y, [150, 150, 150]);
    }));
    derive('crafting_table_front', 'crafting_table_side', (p) => each((x, y) => {
      if (y >= 5 && y <= 12 && x >= 5 && x <= 10) p(x, y, x === 7 || x === 8 ? [110, 80, 45] : [150, 150, 150]);
    }));
    stone('furnace_top', [125, 125, 125]);
    paint('furnace_side', (p) => each((x, y) => p(x, y, vary(x === 0 || y === 0 || x === 15 || y === 15 ? [95, 95, 95] : [118, 118, 118], 0.12))));
    const furnaceFront = (name, lit) => derive(name, 'furnace_side', (p) => each((x, y) => {
      if (y >= 8 && y <= 13 && x >= 4 && x <= 11) p(x, y, x === 4 || x === 11 || y === 8 ? [60, 60, 60] : lit ? (y > 10 ? [255, 150, 30] : [255, 220, 80]) : [25, 22, 20]);
      if (y >= 2 && y <= 4 && x >= 3 && x <= 12) p(x, y, [70, 70, 70]);
    }));
    furnaceFront('furnace_front_off', false);
    furnaceFront('furnace_front_on', true);
    derive('dispenser_front', 'furnace_side', (p) => each((x, y) => { if (Math.hypot(x - 7.5, y - 7.5) < 3) p(x, y, [30, 30, 30]); }));
    derive('dropper_front', 'furnace_side', (p) => each((x, y) => { if (Math.abs(x - 7.5) < 3 && Math.abs(y - 7.5) < 3) p(x, y, Math.abs(x - 7.5) < 1.5 && Math.abs(y - 7.5) < 1.5 ? [20, 20, 20] : [50, 50, 50]); }));
    noisy('noteblock', [100, 64, 40], 0.15, (x, y, c) => (x > 3 && x < 12 && y > 3 && y < 12 && ((x === 5 || x === 10) || y === 5) ? [40, 30, 20] : c));
    noisy('jukebox_side', [100, 64, 40], 0.15, (x, y, c) => (x === 0 || x === 15 || y === 0 || y === 15 ? [70, 45, 30] : c));
    noisy('jukebox_top', [100, 64, 40], 0.15, (x, y, c) => (Math.hypot(x - 7.5, y - 7.5) < 3 ? [30, 30, 30] : c));
    derive('bookshelf', 'planks_oak', (p) => {
      const cols = [[160, 40, 40], [40, 80, 160], [50, 130, 50], [140, 100, 40], [120, 40, 120]];
      for (const yr of [[1, 6], [9, 14]]) {
        let x = 1;
        while (x < 15) {
          const w = 1 + ri(2), c = cols[ri(cols.length)], h = ri(2);
          for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = yr[0] + h; y <= yr[1]; y++) p(xx, y, vary(c, 0.15));
          x += w;
        }
      }
    });
    noisy('tnt_side', [200, 40, 30], 0.1, (x, y, c) => (y >= 6 && y <= 9 ? (x > 2 && x < 13 && ((x + y) % 3 === 0) ? [20, 20, 20] : [235, 235, 235]) : x % 4 === 0 ? mul(c, 0.8) : c));
    noisy('tnt_top', [200, 40, 30], 0.1, (x, y, c) => (Math.hypot(x - 7.5, y - 7.5) < 2 ? [60, 60, 60] : c));
    noisy('tnt_bottom', [200, 40, 30], 0.1);
    paint('torch_on', (p) => {
      for (let y = 6; y < 16; y++) { p(7, y, vary([110, 80, 45], 0.1)); p(8, y, vary([95, 70, 40], 0.1)); }
      p(7, 6, [255, 255, 160]); p(8, 6, [255, 220, 80]); p(7, 7, [255, 200, 60]); p(8, 7, [255, 160, 40]);
    });
    paint('torch_top', (p) => each((x, y) => p(x, y, [255, 230, 120])));
    const rtorch = (name, on) => paint(name, (p) => {
      for (let y = 6; y < 16; y++) { p(7, y, vary([110, 80, 45], 0.1)); p(8, y, vary([95, 70, 40], 0.1)); }
      const c = on ? [255, 40, 30] : [90, 20, 20];
      p(7, 6, c); p(8, 6, c); p(7, 7, c); p(8, 7, c);
    });
    rtorch('redstone_torch_on', true);
    rtorch('redstone_torch_off', false);
    paint('fire', (p) => each((x, y) => { const h = 6 + 8 * Math.abs(Math.sin(x * 1.3)); if (15 - y < h && rnd() < 0.85) p(x, y, mix([255, 230, 80], [220, 60, 0], (15 - y) / h)); }));
    paint('mob_spawner', (p) => each((x, y) => { if (x % 4 === 0 || y % 4 === 0) p(x, y, vary([30, 40, 60], 0.2)); }));
    noisy('chest_side', [160, 110, 40], 0.12, (x, y, c) => (x === 0 || x === 15 || y === 0 || y === 15 || y === 5 ? [80, 50, 20] : c));
    noisy('chest_top', [160, 110, 40], 0.12, (x, y, c) => (x === 0 || x === 15 || y === 0 || y === 15 ? [80, 50, 20] : c));
    derive('chest_front', 'chest_side', (p) => { for (let y = 4; y <= 7; y++) for (let x = 7; x <= 8; x++) p(x, y, [200, 200, 200]); });
    derive('chest_trapped_front', 'chest_front', (p) => { p(7, 5, [200, 30, 30]); p(8, 5, [200, 30, 30]); });
    noisy('ender_chest_side', [24, 40, 40], 0.2, (x, y, c) => (x === 0 || x === 15 || y === 0 || y === 15 || y === 5 ? [10, 20, 20] : c));
    noisy('ender_chest_top', [24, 40, 40], 0.2, (x, y, c) => (x === 0 || x === 15 || y === 0 || y === 15 ? [10, 20, 20] : c));
    derive('ender_chest_front', 'ender_chest_side', (p) => { for (let y = 4; y <= 7; y++) for (let x = 7; x <= 8; x++) p(x, y, [60, 220, 160]); });
    const dust = (name, col) => paint(name, (p) => each((x, y) => { if ((Math.abs(x - 7.5) < 1.6 || Math.abs(y - 7.5) < 1.6) && rnd() < 0.85) p(x, y, vary(col, 0.2)); }));
    dust('redstone_dust', [110, 0, 0]);
    dust('redstone_dust_on', [255, 30, 20]);
    noisy('farmland_dry', [120, 85, 55], 0.2, (x, y, c) => (y % 4 === 0 ? mul(c, 0.75) : c));
    noisy('farmland_wet', [70, 45, 25], 0.2, (x, y, c) => (y % 4 === 0 ? mul(c, 0.75) : c));
    const DOORC = { wood: [160, 120, 70], spruce: [104, 78, 47], birch: [210, 195, 140], jungle: [160, 115, 80], acacia: [168, 90, 50], dark_oak: [70, 45, 22], iron: [200, 200, 200] };
    for (const k in DOORC) {
      const c = DOORC[k];
      paint(`door_${k}_upper`, (p) => each((x, y) => {
        const frame = x < 2 || x > 13 || y < 2;
        const pane = !frame && (y > 2 && y < 13) && x > 2 && x < 13 && !(x === 7 || x === 8 || y === 7);
        if (pane && k !== 'iron') return; // window
        p(x, y, vary(frame ? mul(c, 0.8) : c, 0.08));
      }));
      paint(`door_${k}_lower`, (p) => each((x, y) => {
        const frame = x < 2 || x > 13 || y > 13;
        p(x, y, vary(frame ? mul(c, 0.8) : (y % 5 === 0 ? mul(c, 0.85) : c), 0.08));
        if (x === 12 && y === 1) p(x, y, [40, 40, 40]);
      }));
    }
    paint('trapdoor', (p) => each((x, y) => { if (!(x > 2 && x < 13 && y > 2 && y < 13 && (x % 4 === 1 || y % 4 === 1))) p(x, y, vary(x < 2 || x > 13 || y < 2 || y > 13 ? [110, 80, 45] : [150, 115, 65], 0.1)); }));
    paint('iron_trapdoor', (p) => each((x, y) => { if (!(x > 2 && x < 13 && y > 2 && y < 13 && (x % 3 === 0 && y % 3 === 0))) p(x, y, vary([200, 200, 200], 0.06)); }));
    paint('ladder', (p) => each((x, y) => { if (x === 2 || x === 13 || (y % 4 === 1 && x > 1 && x < 14)) p(x, y, vary([125, 95, 55], 0.1)); }));
    paint('lever', (p) => each((x, y) => p(x, y, vary([125, 95, 55], 0.1))));
    const rail = (name, side) => {
      paint(name + '_ns', (p) => each((x, y) => {
        if (y % 4 === 1 || y % 4 === 2) p(x, y, vary([110, 80, 45], 0.1));
        if (x === 3 || x === 12) p(x, y, side);
      }));
      paint(name + '_ew', (p) => each((x, y) => {
        if (x % 4 === 1 || x % 4 === 2) p(x, y, vary([110, 80, 45], 0.1));
        if (y === 3 || y === 12) p(x, y, side);
      }));
    };
    rail('rail_normal', [160, 160, 160]);
    rail('rail_golden', [240, 200, 60]);
    rail('rail_detector', [130, 130, 130]);
    rail('rail_activator', [200, 50, 40]);
    noisy('piston_side', [120, 120, 120], 0.12, (x, y, c) => (y < 4 ? vary([160, 125, 75], 0.1) : c));
    noisy('piston_bottom', [110, 110, 110], 0.12);
    noisy('piston_top_normal', [160, 125, 75], 0.1, (x, y, c) => (Math.abs(x - 7.5) < 2 && Math.abs(y - 7.5) < 2 ? [120, 120, 120] : c));
    noisy('piston_top_sticky', [160, 125, 75], 0.1, (x, y, c) => (Math.hypot(x - 7.5, y - 7.5) < 5 ? vary([100, 170, 80], 0.1) : c));
    const bed = (name, f) => paint(name, (p) => each((x, y) => { const c = f(x, y); if (c.length < 4 || c[3]) p(x, y, c); }));
    const RED = [170, 30, 30], WH = [230, 230, 230], PL = [160, 130, 80];
    bed('bed_feet_top', (x, y) => vary(RED, 0.08));
    bed('bed_head_top', (x, y) => vary(y < 8 ? WH : RED, 0.06));
    bed('bed_feet_side', (x, y) => (y < 7 ? [0, 0, 0, 0] : y < 10 ? vary(RED, 0.08) : vary(PL, 0.1)));
    bed('bed_head_side', (x, y) => (y < 7 ? [0, 0, 0, 0] : y < 10 ? vary(x < 8 ? WH : RED, 0.08) : vary(PL, 0.1)));
    bed('bed_feet_end', (x, y) => (y < 7 ? [0, 0, 0, 0] : y < 10 ? vary(RED, 0.08) : vary(PL, 0.1)));
    bed('bed_head_end', (x, y) => (y < 7 ? [0, 0, 0, 0] : y < 10 ? vary(WH, 0.08) : vary(PL, 0.1)));
    noisy('cake_top', [240, 230, 225], 0.05, (x, y, c) => (rnd() < 0.08 ? [200, 30, 30] : c));
    noisy('cake_bottom', [170, 110, 60], 0.1);
    noisy('cake_side', [170, 110, 60], 0.1, (x, y, c) => (y < 6 ? vary([240, 230, 225], 0.05) : y === 9 ? [240, 230, 225] : c));
    noisy('cake_inner', [220, 180, 120], 0.1, (x, y, c) => (y < 6 ? vary([240, 230, 225], 0.05) : c));
    const diode = (name, a, b) => paint(name, (p) => each((x, y) => {
      let c = vary([168, 168, 168], 0.05);
      if (x > 6 && x < 9 && y > 1 && y < 14) c = [110, 20, 20];
      if ((x === 7 || x === 8) && (y === a || y === b)) c = [230, 40, 30];
      p(x, y, c);
    }));
    diode('repeater_off', 3, 10);
    diode('comparator_off', 3, 12);
    paint('enchanting_table_top', (p) => each((x, y) => p(x, y, vary(x < 2 || y < 2 || x > 13 || y > 13 ? [150, 30, 30] : [30, 25, 40], 0.15))));
    noisy('enchanting_table_side', [20, 18, 30], 0.3, (x, y, c) => (y < 4 ? vary([150, 30, 30], 0.15) : c));
    noisy('enchanting_table_bottom', [20, 18, 30], 0.3);
    paint('brewing_stand', (p) => { for (let y = 2; y < 16; y++) p(7, y, [120, 100, 60]); p(7, 1, [230, 200, 60]); });
    noisy('brewing_stand_base', [110, 110, 110], 0.15);
    noisy('cauldron_side', [60, 60, 60], 0.15);
    noisy('cauldron_top', [60, 60, 60], 0.15);
    noisy('cauldron_bottom', [50, 50, 50], 0.15);
    noisy('endframe_top', [70, 110, 100], 0.15, (x, y, c) => (x < 3 || x > 12 || y < 3 || y > 12 ? vary([221, 223, 165], 0.1) : c));
    derive('endframe_eye', 'endframe_top', (p) => each((x, y) => { if (Math.hypot(x - 7.5, y - 7.5) < 3) p(x, y, Math.hypot(x - 7.5, y - 7.5) < 1.2 ? [20, 20, 20] : [60, 140, 80]); }));
    noisy('endframe_side', [221, 223, 165], 0.1, (x, y, c) => (y < 3 ? vary([70, 110, 100], 0.15) : c));
    noisy('dragon_egg', [20, 10, 25], 0.3, (x, y, c) => (rnd() < 0.1 ? [80, 30, 100] : c));
    noisy('redstone_lamp_off', [90, 55, 30], 0.15, (x, y, c) => ((x + y) % 4 === 0 ? [120, 80, 50] : c));
    noisy('redstone_lamp_on', [240, 190, 120], 0.12, (x, y, c) => ((x + y) % 4 === 0 ? [255, 240, 200] : c));
    paint('trip_wire_source', (p) => { for (let y = 4; y < 14; y++) p(7, y, [110, 80, 45]); for (let x = 5; x < 10; x++) p(x, 4, [160, 160, 160]); });
    paint('beacon', (p) => each((x, y) => {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      if (edge) p(x, y, [200, 240, 240]);
      else if (x > 3 && x < 12 && y > 3 && y < 12) p(x, y, vary([120, 230, 230], 0.1));
    }));
    noisy('flower_pot', [130, 65, 45], 0.12);
    const SKULL = { skeleton: [[200, 200, 200], [30, 30, 30]], wither: [[40, 40, 40], [10, 10, 10]], zombie: [[92, 140, 78], [20, 40, 20]], char: [[198, 140, 105], [60, 40, 22]], creeper: [[90, 180, 80], [10, 10, 10]] };
    for (const k in SKULL) {
      const [base, dark] = SKULL[k];
      noisy(`skull_${k}_side`, base, 0.1);
      noisy(`skull_${k}_top`, k === 'char' ? dark : base, 0.12);
      paint(`skull_${k}_front`, (p) => each((x, y) => {
        let c = vary(base, 0.1);
        const eye = (y >= 6 && y <= 7) && (x === 4 || x === 5 || x === 10 || x === 11);
        if (eye) c = k === 'char' ? [70, 55, 140] : dark;
        if (k === 'creeper' && ((y >= 9 && y <= 12 && x >= 6 && x <= 9) || (y >= 11 && (x === 5 || x === 10)))) c = dark;
        if (k !== 'creeper' && y === 11 && x >= 5 && x <= 10) c = mul(dark, 1.5);
        if (k === 'char' && y < 4) c = vary(dark, 0.15);
        p(x, y, c);
      }));
    }
    noisy('anvil_base', [64, 64, 64], 0.15);
    noisy('anvil_top', [80, 80, 80], 0.15, (x, y, c) => (x > 2 && x < 13 && y > 2 && y < 13 ? mul(c, 0.8) : c));
    noisy('daylight_detector_top', [220, 210, 180], 0.08, (x, y, c) => (x % 5 === 0 || y % 5 === 0 ? [90, 120, 140] : vary([40, 60, 80], 0.2)));
    noisy('daylight_detector_side', [160, 130, 80], 0.1);
    noisy('hopper_outside', [60, 60, 60], 0.15);
    noisy('hopper_top', [60, 60, 60], 0.15, (x, y, c) => (x > 1 && x < 14 && y > 1 && y < 14 ? [30, 30, 30] : c));

    // Nether portal: swirling purple, translucent.
    paint('portal', (p) => each((x, y) => {
      const a = Math.sin(Math.hypot(x - 7.5, y - 7.5) * 1.3 + Math.atan2(y - 7.5, x - 7.5) * 2);
      p(x, y, mix([60, 0, 140], [200, 90, 255], (a + 1) / 2 * (0.7 + rnd() * 0.3)), 190);
    }));

    // ---------- Build minigame materials ----------
    // Wood: wide light planks with dark seams and staggered joints.
    paint('build_wood', (p) => each((x, y) => {
      const row = y >> 2, seam = (y & 3) === 3, joint = (x + row * 6) % 13 === 0;
      let c = vary([201, 156, 98], 0.1);
      if (seam || joint) c = vary([118, 80, 44], 0.1);
      else if (rnd() < 0.1) c = mul(c, 0.88);
      else if ((x + y * 3) % 7 === 0) c = mul(c, 1.06);
      p(x, y, c);
    }));
    paint('build_wood_frame', (p) => each((x, y) => {
      let c = vary([112, 74, 40], 0.12);
      if ((x === 2 || x === 13) && (y === 2 || y === 13)) c = [70, 70, 74]; // nails
      else if ((y + (x >> 2)) % 5 === 0) c = mul(c, 0.85);
      p(x, y, c);
    }));
    // Stone: irregular grey blocks with dark mortar.
    paint('build_stone', (p) => each((x, y) => {
      const row = Math.floor(y / 5), off = row % 2 ? 4 : 0;
      const mortar = y % 5 === 4 || (x + off) % 8 === 7;
      const shade = 0.88 + (((x + off) >> 3) * 37 + row * 53) % 5 * 0.04;
      p(x, y, mortar ? vary([82, 82, 88], 0.1) : vary(mul([158, 158, 164], shade), 0.08));
    }));
    paint('build_stone_frame', (p) => each((x, y) => p(x, y, vary(rnd() < 0.15 ? [86, 86, 92] : [112, 112, 120], 0.1))));
    // Metal: corrugated sheet with rivets.
    paint('build_metal', (p) => each((x, y) => {
      const rib = [0.78, 0.95, 1.08, 0.95][x & 3];
      let c = vary(mul([168, 176, 186], rib), 0.03);
      if ((y === 1 || y === 14) && (x & 3) === 2) c = [96, 100, 108];
      p(x, y, c);
    }));
    paint('build_metal_frame', (p) => each((x, y) => {
      let c = vary([84, 90, 98], 0.06);
      if ((x === 2 || x === 13) && (y === 2 || y === 13)) c = [150, 156, 164];
      p(x, y, c);
    }));
    paint('build_white', (p) => each((x, y) => p(x, y, (x === 0 || y === 0 || x === 15 || y === 15) ? [255, 255, 255] : [210, 235, 255])));

    // Soft round shadow drawn under entities (alpha falls off towards the edge).
    paint('shadow_blob', (p) => each((x, y) => {
      const r = Math.hypot(x - 7.5, y - 7.5) / 7.5;
      p(x, y, [0, 0, 0], r < 1 ? Math.round(170 * (1 - r * r)) : 0);
    }));

    // ---------- Breaking stages ----------
    const cracks = [];
    for (const [sx, sy] of [[8, 8], [8, 8], [3, 4], [12, 12], [12, 3], [4, 12]]) {
      let x = sx, y = sy;
      const ang = rnd() * Math.PI * 2;
      for (let k = 0; k < 9; k++) {
        cracks.push([x & 15, y & 15]);
        x += Math.round(Math.cos(ang + (rnd() - 0.5) * 1.5));
        y += Math.round(Math.sin(ang + (rnd() - 0.5) * 1.5));
      }
    }
    for (let s = 0; s < 10; s++) {
      paint('destroy_' + s, (p) => {
        const n = Math.ceil(cracks.length * (s + 1) / 10);
        for (let k = 0; k < n; k++) p(cracks[k][0], cracks[k][1], [20 + ri(30), 20 + ri(30), 20 + ri(30)]);
      });
    }

    // Anything referenced but not painted: magenta/black checker (like MC's missing texture).
    for (const name of VC.TILES) {
      if (painted.has(name)) continue;
      paint(name, (p) => each((x, y) => p(x, y, ((x >> 3) + (y >> 3)) & 1 ? [248, 0, 248] : [0, 0, 0])));
      console.warn('Textura sin pintar:', name);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // Tile position in an atlas whose tiles are ts pixels (16 procedural, more with HD packs).
  function tileRect(t, ts = 16) { return [(t % NT) * ts, Math.floor(t / NT) * ts]; }

  // Isometric icon per creative block (flat sprite for plants & thin shapes).
  function icons(atlas, ids) {
    const ts = atlas.width / NT;
    const shaded = (k) => {
      const c = document.createElement('canvas');
      c.width = c.height = atlas.width;
      const x = c.getContext('2d');
      x.drawImage(atlas, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(0,0,0,${1 - k})`;
      x.fillRect(0, 0, atlas.width, atlas.width);
      return c;
    };
    const mid = shaded(0.8), dark = shaded(0.6);
    const P = VC.BP, SH = VC.SHAPE, out = {};
    const flat = new Set([SH.cross, SH.crop, SH.torch, SH.ladder, SH.vine, SH.rail, SH.dust, SH.lilypad, SH.pane, SH.fire, SH.lever, SH.button, SH.door]);
    const s = 15 / 16;
    for (const id of ids) {
      if (!P.exists[id]) continue;
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      const face = (src, tile, a, b, cc, dd, e, f, h = 16, oy = 0) => {
        const [tx, ty] = tileRect(tile, ts), k = ts / 16;
        x.setTransform(a, b, cc, dd, e, f);
        x.drawImage(src, tx, ty + oy * k, ts, h * k, 0, oy, 16, h);
      };
      const tex = (f) => P.tex[id * 6 + f];
      const sh = P.shape[id];
      if (flat.has(sh)) {
        face(atlas, tex(sh === SH.vine || sh === SH.lilypad || sh === SH.rail || sh === SH.dust ? 2 : 4), 2, 0, 0, 2, 0, 0);
      } else {
        // Slabs, carpets and snow layers show only their lower part.
        const hgt = sh === SH.slab ? 8 : sh === SH.carpet ? 1 : sh === SH.snow ? 2 : sh === SH.plate ? 1 : 16;
        const oy = 16 - hgt, lift = oy;
        face(mid, tex(4), s, 7 / 16, 0, 1, 1, 8, hgt, oy);
        face(dark, tex(0), s, -7 / 16, 0, 1, 16, 15, hgt, oy);
        x.setTransform(1, 0, 0, 1, 0, lift);
        const [tx, ty] = tileRect(tex(2), ts);
        x.setTransform(s, -7 / 16, s, 7 / 16, 1, 8 + lift);
        x.drawImage(atlas, tx, ty, ts, ts, 0, 0, 16, 16);
      }
      out[id] = c.toDataURL();
    }
    return out;
  }

  function menuBackground(atlas) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const x = c.getContext('2d');
    const ts = atlas.width / NT, [tx, ty] = tileRect(VC.tile('dirt'), ts);
    x.drawImage(atlas, tx, ty, ts, ts, 0, 0, 16, 16);
    x.fillStyle = 'rgba(0,0,0,0.55)';
    x.fillRect(0, 0, 16, 16);
    return c.toDataURL();
  }

  return { build, icons, menuBackground, tileRect };
})();
