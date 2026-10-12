'use strict';

// Firework star colours (particle_fw_<name> sprites).
VC.FW_COLORS = {
  red: [255, 60, 50], orange: [255, 150, 30], yellow: [255, 235, 60], lime: [110, 255, 70], cyan: [60, 230, 255],
  blue: [70, 110, 255], purple: [190, 80, 255], pink: [255, 120, 200], white: [255, 255, 255],
};

// Procedural 16x16 pixel art for every item sprite + HUD glyphs.
VC.ItemArt = (function () {
  const S = 512, NT = 32;

  function build() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;
    let seed = 777;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const lighter = (c, k = 1.3) => c.map((v) => Math.min(255, v * k));
    const painted = new Set();

    // Paints into a 16x16 buffer, then adds a dark outline and copies to the atlas.
    function sprite(name, paint, noOutline) {
      painted.add(name);
      const buf = new Array(256).fill(null);
      const put = (x, y, c, v = 0.1) => {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x > 15 || y > 15 || !c) return;
        const k = 1 + (rnd() - 0.5) * v;
        buf[y * 16 + x] = [c[0] * k, c[1] * k, c[2] * k, c[3] === undefined ? 255 : c[3]];
      };
      paint(put);
      const t = VC.sprite(name), ox = (t % NT) * 16, oy = Math.floor(t / NT) * 16;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        let c = buf[y * 16 + x];
        if (!c) {
          if (noOutline) continue;
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && buf[ny * 16 + nx];
          });
          if (!nb) continue;
          c = [28, 22, 18, 255];
        }
        const i = ((oy + y) * S + ox + x) * 4;
        d[i] = cl(c[0]); d[i + 1] = cl(c[1]); d[i + 2] = cl(c[2]); d[i + 3] = c[3];
      }
    }
    const line = (put, x0, y0, x1, y1, c, v = 0.1) => {
      const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let i = 0; i <= n; i++) put(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c, v);
    };
    const blob = (put, cx, cy, rx, c, v = 0.15, ry = rx) => {
      for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -Math.ceil(rx); x <= rx; x++)
        if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) put(cx + x, cy + y, c, v);
    };
    const rect = (put, x0, y0, x1, y1, c, v = 0.08) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c, v); };
    const WOOD = [137, 103, 59];
    const handle = (put) => line(put, 2, 13, 9, 6, WOOD, 0.15);

    // ---------- Tools & weapons ----------
    const MATCOL = { wood: [160, 125, 70], stone: [125, 125, 125], iron: [225, 225, 225], diamond: [80, 230, 215], gold: [250, 220, 70] };
    for (const m in MATCOL) {
      const c = MATCOL[m];
      sprite(`tool_pick_${m}`, (put) => {
        handle(put);
        for (let a = 0; a <= 20; a++) {
          const ang = -Math.PI * 0.05 + (a / 20) * Math.PI * 0.6;
          put(3 + Math.cos(ang) * 10, 12 - Math.sin(ang) * 10, c);
          put(3 + Math.cos(ang) * 9.2, 12 - Math.sin(ang) * 9.2, c);
        }
      });
      sprite(`tool_axe_${m}`, (put) => {
        handle(put);
        for (let y = 1; y <= 7; y++) for (let x = 7; x <= 12; x++) if (x + y >= 10 && x - y <= 8 && !(x < 9 && y > 5)) put(x, y, c);
      });
      sprite(`tool_shovel_${m}`, (put) => {
        handle(put);
        for (let y = 1; y <= 7; y++) for (let x = 8; x <= 14; x++) { const u = (x - 11) + (y - 4), v = (x - 11) - (y - 4); if (Math.abs(u) <= 3 && Math.abs(v) <= 2) put(x, y, c); }
      });
      sprite(`tool_hoe_${m}`, (put) => { handle(put); line(put, 7, 3, 12, 3, c); line(put, 7, 4, 9, 4, c); line(put, 11, 4, 12, 4, c); });
      sprite(`tool_sword_${m}`, (put) => {
        line(put, 5, 10, 13, 2, c); line(put, 6, 10, 13, 3, c); line(put, 5, 9, 12, 2, lighter(c), 0);
        line(put, 3, 9, 7, 13, [90, 70, 40]); line(put, 2, 13, 4, 11, WOOD);
      });
    }
    sprite('flint_and_steel', (put) => {
      for (let a = 0; a < 14; a++) { const ang = a / 13 * Math.PI * 1.3 + 0.4; put(10 + Math.cos(ang) * 3.5, 6 + Math.sin(ang) * 3.5, [180, 180, 180]); }
      blob(put, 5, 11, 2.5, [50, 50, 55], 0.2);
    });
    sprite('shears', (put) => { line(put, 4, 4, 11, 11, [200, 200, 200]); line(put, 11, 4, 4, 11, [180, 180, 180]); blob(put, 3, 12, 1.5, [160, 40, 40]); blob(put, 12, 12, 1.5, [160, 40, 40]); });
    sprite('fishing_rod', (put) => { line(put, 2, 14, 12, 2, WOOD); for (let y = 3; y < 14; y++) put(13, y, [220, 220, 220], 0); put(13, 13, [150, 150, 150]); });
    sprite('compass', (put) => { blob(put, 8, 8, 6, [120, 120, 130]); blob(put, 8, 8, 4.5, [210, 210, 200]); line(put, 8, 8, 10, 4, [220, 30, 30], 0); line(put, 8, 8, 6, 12, [60, 60, 60], 0); });
    sprite('clock', (put) => { blob(put, 8, 8, 6, [230, 190, 60]); blob(put, 8, 8, 4.5, [120, 180, 240]); rect(put, 4, 9, 12, 12, [40, 160, 50]); put(8, 8, [250, 250, 120]); });
    sprite('lead', (put) => { for (let a = 0; a < 30; a++) { const t = a / 29 * Math.PI * 3; put(8 + Math.cos(t) * (2 + a / 8), 8 + Math.sin(t) * (2 + a / 8), [160, 120, 80]); } });
    sprite('name_tag', (put) => { rect(put, 4, 5, 13, 11, [220, 200, 160]); put(3, 8, [180, 160, 120]); line(put, 0, 4, 3, 8, [200, 200, 200], 0); });
    sprite('bow', (put) => {
      for (let a = 0; a <= 24; a++) { const ang = Math.PI * 0.75 + (a / 24) * Math.PI; put(9 + Math.cos(ang) * 5.3, 7 + Math.sin(ang) * 5.3, WOOD); }
      line(put, 2, 4, 11, 13, [230, 230, 230], 0);
    });
    sprite('arrow', (put) => {
      line(put, 3, 12, 12, 3, [140, 110, 70]);
      put(12, 3, [200, 200, 200]); put(11, 3, [200, 200, 200]); put(12, 4, [200, 200, 200]); put(13, 2, [230, 230, 230]);
      put(2, 12, [240, 240, 240]); put(3, 13, [240, 240, 240]); put(2, 13, [240, 240, 240]); put(4, 13, [220, 220, 220]); put(2, 11, [220, 220, 220]);
    });
    const ARM = { leather: [150, 90, 50], chain: [165, 165, 165], iron: [220, 220, 220], diamond: [80, 220, 210], gold: [245, 205, 60] };
    for (const m in ARM) {
      const c = ARM[m], dots = m === 'chain';
      const pc = (put, x, y) => put(x, y, dots && (x + y) % 2 ? mul(c, 0.6) : c);
      sprite(`armor_helmet_${m}`, (put) => { for (let y = 3; y <= 10; y++) for (let x = 3; x <= 12; x++) if (!(y > 6 && x > 4 && x < 11) && !(y === 3 && (x < 5 || x > 10))) pc(put, x, y); });
      sprite(`armor_chestplate_${m}`, (put) => { for (let y = 2; y <= 14; y++) for (let x = 2; x <= 13; x++) { if (y < 6 && x > 5 && x < 10) continue; if (y > 6 && (x < 4 || x > 11)) continue; pc(put, x, y); } });
      sprite(`armor_leggings_${m}`, (put) => { for (let y = 2; y <= 14; y++) for (let x = 3; x <= 12; x++) { if (y > 5 && x > 6 && x < 9) continue; pc(put, x, y); } });
      sprite(`armor_boots_${m}`, (put) => { rect(put, 2, 6, 6, 13, c); rect(put, 9, 6, 13, 13, c); rect(put, 1, 11, 6, 13, c); rect(put, 9, 11, 14, 13, c); });
    }
    for (const [k, c] of [['iron_horse_armor', [220, 220, 220]], ['golden_horse_armor', [245, 205, 60]], ['diamond_horse_armor', [80, 220, 210]]]) {
      sprite(k, (put) => { rect(put, 2, 4, 13, 9, c); rect(put, 10, 1, 14, 5, c); rect(put, 3, 10, 4, 13, c); rect(put, 11, 10, 12, 13, c); });
    }

    // ---------- Food ----------
    const apple = (c) => (put) => { blob(put, 8, 9, 5, c); put(6, 7, lighter(c, 1.5)); line(put, 8, 2, 8, 4, [90, 60, 30], 0); put(9, 3, [60, 150, 40]); put(10, 3, [60, 150, 40]); };
    sprite('apple', apple([210, 30, 35]));
    sprite('apple_golden', apple([245, 210, 60]));
    const meat = (col, fat) => (put) => { blob(put, 9, 7, 4, col); blob(put, 7, 9, 3, col); line(put, 4, 12, 6, 10, fat, 0); line(put, 3, 13, 4, 12, [235, 235, 225], 0); };
    sprite('porkchop', meat([240, 150, 150], [255, 220, 220]));
    sprite('cooked_porkchop', meat([190, 125, 75], [230, 200, 150]));
    sprite('beef', meat([200, 50, 45], [240, 210, 200]));
    sprite('cooked_beef', meat([130, 80, 45], [190, 150, 110]));
    sprite('mutton', meat([210, 70, 70], [240, 200, 190]));
    sprite('cooked_mutton', meat([140, 70, 50], [200, 150, 120]));
    sprite('rabbit', meat([230, 160, 150], [250, 220, 210]));
    sprite('cooked_rabbit', meat([180, 110, 70], [220, 180, 140]));
    sprite('rotten_flesh', (put) => { meat([150, 110, 70], [110, 140, 70])(put); put(9, 6, [90, 130, 60]); put(8, 9, [90, 130, 60]); });
    const drumstick = (c) => (put) => { blob(put, 9, 6, 4, c); line(put, 6, 9, 3, 12, [240, 235, 220], 0); put(2, 13, [240, 235, 220]); put(3, 13, [240, 235, 220]); };
    sprite('chicken', drumstick([240, 190, 170]));
    sprite('cooked_chicken', drumstick([200, 130, 60]));
    const fish = (c, belly) => (put) => { blob(put, 8, 8, 5, c, 0.1, 3); put(13, 6, c); put(13, 10, c); put(14, 5, c); put(14, 11, c); line(put, 4, 10, 10, 10, belly, 0); put(5, 7, [20, 20, 20]); };
    sprite('fish_raw', fish([110, 140, 160], [200, 210, 220]));
    sprite('salmon_raw', fish([170, 60, 50], [240, 140, 120]));
    sprite('clownfish', (put) => { fish([240, 120, 30], [250, 250, 250])(put); line(put, 7, 5, 7, 11, [250, 250, 250], 0); line(put, 10, 5, 10, 11, [250, 250, 250], 0); });
    sprite('pufferfish', (put) => { blob(put, 8, 8, 5, [230, 200, 50]); for (let a = 0; a < 8; a++) put(8 + Math.cos(a) * 6.5, 8 + Math.sin(a) * 6.5, [250, 250, 220]); put(5, 7, [20, 20, 20]); });
    sprite('fish_cooked', fish([170, 120, 70], [210, 170, 120]));
    sprite('salmon_cooked', fish([160, 80, 50], [210, 140, 100]));
    const bowl = (put, fillC) => {
      for (let y = 8; y <= 13; y++) { const w = 6 - (y - 8) * 0.8; for (let x = 8 - w; x <= 7 + w; x++) put(x, y, [140, 100, 55]); }
      if (fillC) rect(put, 3, 7, 12, 8, fillC);
    };
    sprite('bowl', (put) => bowl(put));
    sprite('mushroom_stew', (put) => bowl(put, [180, 130, 90]));
    sprite('rabbit_stew', (put) => { bowl(put, [170, 110, 60]); put(5, 7, [240, 140, 30]); put(9, 7, [120, 160, 40]); });
    sprite('bread', (put) => { for (let x = 2; x <= 13; x++) for (let y = 7 - Math.round(Math.sin((x - 2) / 11 * Math.PI) * 3); y <= 11; y++) put(x, y, y < 8 ? [200, 140, 60] : [220, 170, 90]); });
    sprite('cookie', (put) => { blob(put, 8, 8, 5, [200, 140, 70]); [[6, 6], [10, 7], [7, 10], [10, 10]].forEach(([x, y]) => put(x, y, [70, 40, 20])); });
    sprite('melon', (put) => { for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) if (x + y >= 14 && x <= y + 2) put(x, y, x === 13 || y === 13 ? [60, 140, 30] : (x + y) % 5 === 0 ? [30, 20, 20] : [220, 50, 50]); });
    sprite('speckled_melon', (put) => { for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) if (x + y >= 14 && x <= y + 2) put(x, y, (x * y) % 7 === 0 ? [255, 230, 60] : x === 13 || y === 13 ? [60, 140, 30] : [220, 50, 50]); });
    sprite('spider_eye', (put) => { blob(put, 8, 8, 5, [160, 20, 40]); blob(put, 8, 8, 2, [40, 0, 0]); put(6, 6, [240, 120, 140]); });
    sprite('fermented_spider_eye', (put) => { blob(put, 8, 9, 5, [150, 60, 60]); blob(put, 8, 9, 2, [60, 20, 20]); rect(put, 5, 2, 11, 4, [130, 90, 60]); });
    const carrot = (c, top) => (put) => { for (let i = 0; i < 10; i++) { put(4 + i, 12 - i, c); put(4 + i, 11 - i, c); if (i < 6) put(5 + i, 12 - i, c); } put(13, 2, top); put(12, 1, top); put(14, 3, top); };
    sprite('carrot', carrot([240, 130, 30], [60, 150, 40]));
    sprite('golden_carrot', carrot([250, 210, 60], [250, 230, 120]));
    sprite('carrot_on_a_stick', (put) => { line(put, 2, 14, 11, 5, WOOD); line(put, 11, 5, 12, 12, [220, 220, 220], 0); put(12, 13, [240, 130, 30]); put(12, 14, [240, 130, 30]); });
    sprite('potato', (put) => blob(put, 8, 8, 5, [200, 165, 90], 0.12, 4));
    sprite('baked_potato', (put) => blob(put, 8, 8, 5, [210, 140, 60], 0.12, 4));
    sprite('poisonous_potato', (put) => { blob(put, 8, 8, 5, [170, 180, 90], 0.12, 4); put(6, 7, [80, 140, 40]); put(10, 9, [80, 140, 40]); });
    sprite('pumpkin_pie', (put) => { for (let y = 6; y <= 12; y++) for (let x = 2; x <= 13; x++) put(x, y, y < 8 ? [230, 140, 40] : [200, 150, 90]); });
    sprite('cake', (put) => { rect(put, 2, 6, 13, 13, [170, 110, 60]); rect(put, 2, 5, 13, 8, [240, 235, 230]); put(5, 5, [200, 30, 30]); put(9, 5, [200, 30, 30]); put(11, 6, [200, 30, 30]); });
    const bucket = (water) => (put) => {
      for (let y = 5; y <= 13; y++) for (let x = 3 + (y - 5) / 4; x <= 12 - (y - 5) / 4; x++) put(x, y, [190, 190, 190], 0.08);
      if (water) { line(put, 4, 5, 11, 5, water, 0.1); line(put, 5, 6, 10, 6, water, 0.1); } else { line(put, 4, 5, 11, 5, [60, 60, 60], 0.1); }
      line(put, 4, 4, 6, 2, [160, 160, 160], 0); line(put, 6, 2, 9, 2, [160, 160, 160], 0); line(put, 9, 2, 11, 4, [160, 160, 160], 0);
    };
    sprite('bucket', bucket(null));
    sprite('water_bucket', bucket([50, 90, 210]));
    sprite('lava_bucket', bucket([240, 120, 20]));
    sprite('milk_bucket', bucket([250, 250, 250]));

    // ---------- Materials ----------
    const ingot = (c) => (put) => { for (let y = 6; y <= 10; y++) for (let x = 3 + (10 - y) / 2; x <= 12 - (y - 6) / 3; x++) put(x, y, c, 0.08); line(put, 5, 6, 11, 6, lighter(c), 0); };
    sprite('iron_ingot', ingot([215, 215, 215]));
    sprite('gold_ingot', ingot([245, 210, 50]));
    sprite('brick', ingot([170, 80, 60]));
    sprite('netherbrick', ingot([90, 40, 45]));
    const gem = (c) => (put) => {
      for (let y = 4; y <= 12; y++) { const w = y < 7 ? 4 + (y - 4) : 6 - (y - 7) * 1.2; for (let x = 8 - w; x <= 7 + w; x++) put(x, y, y < 7 ? lighter(c) : c, 0.08); }
      put(6, 5, [255, 255, 255]);
    };
    sprite('diamond', gem([70, 210, 200]));
    sprite('emerald', gem([30, 190, 80]));
    sprite('coal', (put) => { blob(put, 8, 8, 4, [45, 45, 45], 0.4); put(6, 6, [90, 90, 90]); });
    sprite('charcoal', (put) => { blob(put, 8, 8, 4, [60, 45, 35], 0.4); put(6, 6, [110, 90, 70]); });
    sprite('stick', (put) => line(put, 3, 12, 12, 3, WOOD, 0.2));
    sprite('blaze_rod', (put) => { line(put, 3, 12, 12, 3, [250, 190, 40], 0.2); line(put, 4, 12, 12, 4, [240, 140, 20], 0.2); });
    sprite('string', (put) => { for (let x = 2; x <= 13; x++) put(x, 8 + Math.round(Math.sin(x * 0.9) * 2), [235, 235, 235], 0.05); });
    sprite('feather', (put) => { line(put, 3, 13, 12, 3, [200, 200, 200], 0); for (let i = 0; i < 8; i++) { put(5 + i, 9 - i, [245, 245, 245]); put(6 + i, 11 - i, [235, 235, 235]); } });
    const pile = (c, n = 40) => (put) => { for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 5; put(8 + Math.cos(a) * r, 9 + Math.sin(a) * r * 0.7, c, 0.5); } };
    sprite('gunpowder', pile([80, 80, 80]));
    sprite('glowstone_dust', pile([250, 210, 90]));
    sprite('sugar', pile([245, 245, 245], 30));
    sprite('blaze_powder', pile([250, 160, 30]));
    sprite('redstone', pile([200, 20, 10]));
    const seeds = (c, big) => (put) => { for (let i = 0; i < (big ? 6 : 9); i++) blob(put, 3 + rnd() * 10, 4 + rnd() * 9, big ? 1.2 : 0.6, c, 0.2); };
    sprite('wheat_seeds', seeds([90, 170, 60]));
    sprite('pumpkin_seeds', seeds([220, 210, 160], true));
    sprite('melon_seeds', seeds([40, 30, 25], true));
    sprite('wheat', (put) => { for (const x0 of [5, 8, 11]) { line(put, x0 - 3, 14, x0, 3, [210, 180, 60]); put(x0, 2, [230, 200, 80]); put(x0 - 1, 4, [230, 200, 80]); } });
    sprite('flint', (put) => { for (let y = 3; y <= 13; y++) for (let x = 4; x <= 12; x++) if (Math.abs(x - 8) + Math.abs(y - 8) * 0.7 < 5) put(x, y, [50, 50, 55], 0.2); });
    sprite('leather', (put) => { for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) if (Math.hypot(x - 8, (y - 8) * 0.9) < 5.5 && !(x === 3 && y === 3)) put(x, y, [150, 90, 50], 0.15); });
    sprite('rabbit_hide', (put) => { for (let y = 3; y <= 13; y++) for (let x = 3; x <= 13; x++) if (Math.hypot(x - 8, y - 8) < 5.5) put(x, y, rnd() < 0.3 ? [240, 230, 220] : [170, 130, 90], 0.15); });
    sprite('rabbit_foot', (put) => { blob(put, 8, 10, 3, [190, 150, 110]); line(put, 8, 7, 9, 2, [190, 150, 110]); });
    sprite('clay_ball', (put) => blob(put, 8, 8, 4.5, [160, 166, 179], 0.1));
    sprite('slime_ball', (put) => { blob(put, 8, 8, 4.5, [110, 190, 90], 0.1); put(6, 6, [200, 255, 180]); });
    sprite('magma_cream', (put) => { blob(put, 8, 8, 4.5, [220, 120, 30], 0.15); put(7, 7, [250, 230, 80]); put(9, 9, [250, 230, 80]); });
    sprite('ender_pearl', (put) => { blob(put, 8, 8, 5, [20, 90, 80], 0.1); blob(put, 7, 7, 2, [60, 180, 160]); });
    sprite('ender_eye', (put) => { blob(put, 8, 8, 5, [20, 120, 70], 0.1); blob(put, 8, 8, 2, [10, 40, 20]); put(6, 6, [150, 240, 180]); });
    sprite('reeds', (put) => { for (const x of [5, 9, 12]) { line(put, x, 14, x - 1, 2, [130, 200, 90]); put(x - 1, 6, [80, 140, 50]); } });
    sprite('paper', (put) => rect(put, 3, 2, 12, 13, [245, 245, 235], 0.03));
    sprite('map', (put) => { rect(put, 2, 2, 13, 13, [230, 220, 180], 0.03); rect(put, 4, 4, 11, 11, [200, 190, 150], 0.1); });
    const book = (c, extra) => (put) => { rect(put, 3, 2, 12, 13, c); rect(put, 11, 3, 12, 12, [240, 240, 230]); if (extra) extra(put); };
    sprite('book', book([130, 60, 30]));
    sprite('writable_book', book([130, 60, 30], (put) => line(put, 6, 12, 13, 3, [240, 240, 240])));
    sprite('written_book', book([130, 60, 30], (put) => rect(put, 5, 5, 9, 6, [240, 200, 60])));
    sprite('enchanted_book', book([150, 50, 150], (put) => rect(put, 5, 5, 9, 6, [230, 200, 255])));
    sprite('bone', (put) => { line(put, 4, 11, 11, 4, [235, 235, 220], 0.05); blob(put, 3, 12, 1, [235, 235, 220], 0.05); blob(put, 12, 3, 1, [235, 235, 220], 0.05); });
    sprite('ghast_tear', (put) => { blob(put, 8, 10, 3, [220, 240, 240]); line(put, 8, 3, 8, 7, [220, 240, 240]); });
    sprite('gold_nugget', (put) => blob(put, 8, 9, 3, [250, 220, 60], 0.15));
    sprite('nether_wart', (put) => { blob(put, 6, 9, 3, [160, 20, 30]); blob(put, 10, 8, 3, [140, 20, 30]); });
    sprite('nether_star', (put) => { for (let a = 0; a < 4; a++) line(put, 8, 8, 8 + Math.cos(a * Math.PI / 2) * 6, 8 + Math.sin(a * Math.PI / 2) * 6, [240, 240, 255]); blob(put, 8, 8, 2, [255, 255, 200]); });
    sprite('quartz', (put) => { for (let y = 3; y <= 13; y++) for (let x = 4; x <= 12; x++) if (Math.abs(x - 8) + Math.abs(y - 8) * 0.6 < 4.5) put(x, y, [240, 235, 225], 0.08); });
    sprite('prismarine_shard', (put) => { line(put, 4, 12, 11, 3, [110, 180, 170]); line(put, 5, 12, 12, 4, [90, 160, 150]); });
    sprite('prismarine_crystals', (put) => { for (let i = 0; i < 6; i++) blob(put, 3 + rnd() * 10, 3 + rnd() * 10, 1.4, [180, 230, 220], 0.15); });
    // Dyes (meta order: ink sac ... bone meal)
    const DYE = [[30, 30, 35], [180, 40, 40], [80, 110, 30], [110, 70, 40], [40, 70, 180], [130, 50, 180], [30, 140, 150], [160, 160, 160],
      [70, 70, 70], [240, 140, 170], [120, 200, 40], [240, 210, 50], [110, 170, 230], [200, 80, 200], [240, 140, 40], [240, 240, 235]];
    DYE.forEach((c, m) => {
      if (m === 0) sprite('dye_0', (put) => { blob(put, 8, 9, 5, c, 0.1, 4); line(put, 6, 3, 10, 3, [60, 60, 70]); });
      else if (m === 3) sprite('dye_3', (put) => { blob(put, 6, 9, 2.5, c); blob(put, 10, 7, 2.5, c); });
      else if (m === 4) sprite('dye_4', gem(c));
      else if (m === 15) sprite('dye_15', pile(c));
      else sprite('dye_' + m, (put) => { for (let y = 4; y <= 13; y++) for (let x = 4; x <= 12; x++) if (Math.hypot(x - 8, y - 9) < 4.5) put(x, y, c, 0.1); line(put, 6, 3, 10, 3, mul(c, 0.7)); });
    });
    const bottle = (liq) => (put) => {
      for (let y = 6; y <= 13; y++) for (let x = 4; x <= 11; x++) if (Math.hypot(x - 7.5, y - 9.5) < 4) put(x, y, liq || [220, 235, 240, 150]);
      rect(put, 6, 2, 9, 5, [220, 235, 240, 200]); rect(put, 6, 1, 9, 1, [140, 100, 60]);
    };
    sprite('glass_bottle', bottle(null));
    sprite('potion', bottle([50, 70, 230]));
    sprite('experience_bottle', bottle([120, 230, 60]));
    sprite('fire_charge', (put) => { blob(put, 8, 8, 5, [50, 40, 30], 0.3); put(6, 6, [250, 150, 30]); put(10, 9, [250, 200, 60]); put(8, 11, [240, 100, 20]); });
    sprite('snowball', (put) => blob(put, 8, 8, 4.5, [245, 250, 250], 0.05));
    sprite('egg', (put) => blob(put, 8, 9, 3.5, [230, 210, 170], 0.08, 5));
    sprite('fireworks', (put) => { rect(put, 6, 4, 9, 11, [200, 40, 40]); line(put, 7, 12, 7, 15, WOOD); put(7, 3, [240, 240, 240]); });
    sprite('firework_charge', (put) => { blob(put, 8, 8, 4.5, [70, 70, 70], 0.2); put(7, 7, [240, 80, 80]); put(9, 9, [80, 120, 240]); });
    const EGGC = { zombie: [[0, 170, 170], [120, 160, 100]], skeleton: [[190, 190, 190], [80, 80, 80]], creeper: [[20, 160, 20], [10, 10, 10]], spider: [[50, 40, 35], [160, 20, 20]],
      pig: [[240, 160, 160], [200, 100, 100]], cow: [[70, 50, 35], [170, 170, 170]], sheep: [[230, 230, 230], [240, 180, 170]], chicken: [[200, 200, 200], [220, 30, 30]],
      pigman: [[230, 150, 150], [80, 110, 50]], ghast: [[245, 245, 245], [180, 180, 180]] };
    for (const k in EGGC) sprite('egg_' + k, (put) => {
      blob(put, 8, 9, 4.5, EGGC[k][0], 0.05, 5.5);
      for (let i = 0; i < 6; i++) blob(put, 5 + rnd() * 6, 5 + rnd() * 8, 1, EGGC[k][1], 0.05);
    });
    const REC = ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait'];
    const RECC = [[230, 200, 40], [60, 200, 60], [220, 100, 30], [180, 40, 30], [150, 220, 60], [120, 90, 220], [210, 160, 220], [30, 30, 30], [240, 240, 240], [40, 150, 60], [60, 60, 60], [40, 120, 200]];
    REC.forEach((r, i) => sprite('record_' + r, (put) => { blob(put, 8, 8, 6, [30, 30, 35], 0.05); blob(put, 8, 8, 2, RECC[i], 0.05); put(8, 8, [10, 10, 10]); }));

    // ---------- Block-like items ----------
    sprite('sign', (put) => { rect(put, 2, 3, 13, 9, [170, 130, 75]); line(put, 7, 10, 7, 14, WOOD); line(put, 8, 10, 8, 14, WOOD); });
    sprite('bed', (put) => { rect(put, 1, 8, 14, 11, [170, 30, 30]); rect(put, 1, 7, 4, 9, [235, 235, 235]); rect(put, 1, 12, 1, 13, WOOD); rect(put, 14, 12, 14, 13, WOOD); });
    sprite('item_frame', (put) => { rect(put, 2, 2, 13, 13, [140, 100, 60]); rect(put, 4, 4, 11, 11, [190, 150, 110]); });
    sprite('painting', (put) => { rect(put, 1, 3, 14, 12, [140, 100, 60]); rect(put, 2, 4, 13, 11, [100, 160, 220]); rect(put, 2, 9, 13, 11, [80, 150, 50]); blob(put, 10, 6, 1.5, [250, 230, 80]); });
    sprite('flower_pot', (put) => { for (let y = 7; y <= 13; y++) for (let x = 4 + (y - 7) / 3; x <= 11 - (y - 7) / 3; x++) put(x, y, [140, 70, 50]); rect(put, 5, 7, 10, 7, [80, 50, 30]); });
    sprite('brewing_stand', (put) => { line(put, 8, 2, 8, 13, [120, 100, 60]); put(8, 1, [230, 200, 60]); rect(put, 3, 13, 13, 14, [100, 100, 100]); blob(put, 4, 10, 1.5, [220, 235, 240]); blob(put, 12, 10, 1.5, [220, 235, 240]); });
    sprite('cauldron', (put) => { for (let y = 4; y <= 13; y++) for (let x = 2; x <= 13; x++) if (y > 11 || x < 4 || x > 11) put(x, y, [60, 60, 60], 0.15); rect(put, 4, 4, 11, 5, [70, 70, 70]); });
    sprite('armor_stand', (put) => { line(put, 8, 2, 8, 13, WOOD); line(put, 4, 5, 12, 5, WOOD); line(put, 5, 9, 11, 9, WOOD); rect(put, 4, 14, 12, 14, [130, 130, 130]); blob(put, 8, 2, 1.2, WOOD); });
    const SKC = [[200, 200, 200], [40, 40, 40], [92, 140, 78], [198, 140, 105], [90, 180, 80]];
    SKC.forEach((c, i) => sprite('skull_' + i, (put) => {
      rect(put, 3, 3, 12, 12, c);
      const dark = i === 3 ? [70, 55, 140] : [20, 20, 20];
      rect(put, 5, 6, 6, 7, dark); rect(put, 9, 6, 10, 7, dark);
      if (i === 4) { rect(put, 7, 8, 8, 11, dark); } else rect(put, 6, 10, 9, 10, mul(c, 0.6));
      if (i === 3) rect(put, 3, 3, 12, 4, [60, 40, 22]);
    }));
    const diode = (put) => { rect(put, 1, 9, 14, 12, [168, 168, 168]); line(put, 3, 10, 12, 10, [140, 20, 20], 0); };
    sprite('repeater', (put) => { diode(put); line(put, 4, 5, 4, 9, WOOD); put(4, 4, [255, 40, 30]); line(put, 10, 5, 10, 9, WOOD); put(10, 4, [255, 40, 30]); });
    sprite('comparator', (put) => { diode(put); line(put, 3, 5, 3, 9, WOOD); put(3, 4, [255, 40, 30]); line(put, 12, 5, 12, 9, WOOD); put(12, 4, [255, 40, 30]); put(8, 7, [255, 40, 30]); });
    const DOORC = { wooden_door: [160, 120, 70], iron_door: [200, 200, 200], spruce_door: [104, 78, 47], birch_door: [210, 195, 140], jungle_door: [160, 115, 80], acacia_door: [168, 90, 50], dark_oak_door: [70, 45, 22] };
    for (const k in DOORC) sprite('door_' + k, (put) => {
      rect(put, 4, 1, 11, 14, DOORC[k]);
      rect(put, 5, 2, 10, 6, [180, 210, 230]);
      put(10, 8, [40, 40, 40]);
    });
    const cart = (extra) => (put) => { rect(put, 2, 6, 13, 11, [120, 120, 125]); rect(put, 3, 7, 12, 8, [70, 70, 75]); blob(put, 4, 12, 1.2, [50, 50, 50]); blob(put, 11, 12, 1.2, [50, 50, 50]); if (extra) extra(put); };
    sprite('minecart', cart());
    sprite('chest_minecart', cart((put) => rect(put, 4, 3, 11, 7, [160, 110, 40])));
    sprite('furnace_minecart', cart((put) => rect(put, 4, 3, 11, 7, [110, 110, 110])));
    sprite('tnt_minecart', cart((put) => rect(put, 4, 3, 11, 7, [200, 40, 30])));
    sprite('hopper_minecart', cart((put) => rect(put, 5, 3, 10, 7, [60, 60, 60])));
    sprite('saddle', (put) => { for (let x = 2; x <= 13; x++) for (let y = 6 + Math.round(Math.abs(x - 7.5) / 3); y <= 9; y++) put(x, y, [130, 70, 30]); line(put, 5, 10, 5, 14, [100, 100, 100]); line(put, 10, 10, 10, 14, [100, 100, 100]); });
    sprite('boat', (put) => { for (let y = 7; y <= 11; y++) for (let x = 1 + (y - 7); x <= 14 - (y - 7); x++) put(x, y, WOOD); rect(put, 1, 6, 14, 6, [110, 80, 45]); });

    // Particles & projectiles
    sprite('particle_heart', (put) => {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const a = Math.hypot(x - 5, y - 5) < 3.5 || Math.hypot(x - 10, y - 5) < 3.5 || (y >= 5 && Math.abs(x - 7.5) < 12.5 - y);
        if (a && y > 1 && y < 14) put(x, y, y < 5 && (x === 4 || x === 9) ? [255, 160, 160] : [230, 30, 40], 0.05);
      }
    });
    sprite('particle_angry', (put) => { blob(put, 8, 9, 5, [60, 50, 60], 0.2); blob(put, 6, 6, 3, [80, 70, 80], 0.2); line(put, 4, 10, 12, 8, [200, 30, 30], 0); });
    sprite('particle_portal', (put) => blob(put, 8, 8, 3, [190, 80, 255], 0.2), true);
    sprite('particle_smoke', (put) => blob(put, 8, 8, 5, [120, 120, 120], 0.3), true);
    sprite('particle_flame', (put) => { blob(put, 8, 10, 3, [255, 140, 20], 0.2); blob(put, 8, 7, 2, [255, 230, 90], 0.1); }, true);
    sprite('particle_spark', (put) => { line(put, 8, 3, 8, 13, [255, 250, 200], 0); line(put, 3, 8, 13, 8, [255, 250, 200], 0); }, true);
    // Firework stars: one sprite per colour, plus the bright flash of the blast.
    for (const [k, c] of Object.entries(VC.FW_COLORS)) {
      sprite('particle_fw_' + k, (put) => {
        blob(put, 8, 8, 3, c, 0.1);
        line(put, 8, 2, 8, 14, c, 0); line(put, 2, 8, 14, 8, c, 0);
        blob(put, 8, 8, 1.2, lighter(c, 1.6), 0);
      }, true);
    }
    sprite('particle_flash', (put) => {
      blob(put, 8, 8, 7.5, [255, 240, 200], 0.05);
      blob(put, 8, 8, 4.5, [255, 255, 245], 0);
    }, true);
    sprite('elytra', (put) => {
      const c = [140, 140, 165];
      for (let y = 2; y <= 14; y++) for (let x = 1; x <= 14; x++) {
        const dx = Math.abs(x - 7.5);
        if (dx < 1 || y > 2 + dx * 1.6 + 5 || y < 2 + (7 - dx) * 0.3) continue;
        put(x, y, (x + y) % 3 === 0 ? mul(c, 0.75) : c, 0.08);
      }
    });
    sprite('fireball', (put) => {
      blob(put, 8, 8, 6, [90, 40, 10], 0.3);
      for (let i = 0; i < 25; i++) put(3 + rnd() * 10, 3 + rnd() * 10, [255, 120 + rnd() * 120, 20]);
    });

    for (const name of VC.SPRITES) {
      if (painted.has(name)) continue;
      sprite(name, (put) => { for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) put(x, y, ((x >> 2) + (y >> 2)) & 1 ? [248, 0, 248] : [0, 0, 0], 0); });
      console.warn('Sprite sin pintar:', name);
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  function icons(atlas) {
    const out = {}, ts = atlas.width / NT;
    for (const k in VC.ITEMS) {
      const it = VC.ITEMS[k], t = it.sprite;
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      x.drawImage(atlas, (t % NT) * ts, Math.floor(t / NT) * ts, ts, ts, 0, 0, 32, 32);
      if (it.glint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(160,80,255,0.3)'; x.fillRect(0, 0, 32, 32); }
      out[k] = c.toDataURL();
    }
    return out;
  }

  // 9x9 HUD glyphs. K outline, R fill, W highlight, E empty interior.
  const HEART = ['.KKK.KKK.', 'KRWRKRRRK', 'KWRRRRRRK', 'KRRRRRRRK', '.KRRRRRK.', '..KRRRK..', '...KRK...', '....K....', '.........'];
  const FOOD = ['.....KKK.', '....KRRRK', '...KRWRRK', '...KRRRRK', '..KWKRRK.', '.KWK.KK..', 'KWWK.....', '.KK......', '.........'];
  const BUBBLE = ['..KKKKK..', '.KRRRRRK.', 'KRWWRRRRK', 'KRWRRRRRK', 'KRRRRRRRK', 'KRRRRRRRK', '.KRRRRRK.', '..KKKKK..', '.........'];
  const ARMOR = ['KKK...KKK', 'KRRKKKRRK', 'KRWRRRRRK', 'KRRRRRRRK', '.KRRRRRK.', '.KRRRRRK.', '.KRRRRRK.', '..KKKKK..', '.........'];
  function glyph(rows, fill, mode) {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const x = c.getContext('2d');
    const col = { K: '#000', R: fill[0], W: fill[1], E: '#2a2a2a' };
    rows.forEach((row, y) => {
      for (let i = 0; i < 9; i++) {
        let ch = row[i];
        if (ch === '.') continue;
        if (ch !== 'K' && (mode === 'empty' || (mode === 'half' && i >= 5))) ch = 'E';
        x.fillStyle = col[ch];
        x.fillRect(i, y, 1, 1);
      }
    });
    return c.toDataURL();
  }
  function hud() {
    const h = ['#d82020', '#ff9a9a'], f = ['#b8743a', '#e8c090'], b = ['#3060e0', '#e0f0ff'], a = ['#c8c8c8', '#ffffff'];
    return {
      heart: glyph(HEART, h, 'full'), heartHalf: glyph(HEART, h, 'half'), heartEmpty: glyph(HEART, h, 'empty'),
      food: glyph(FOOD, f, 'full'), foodHalf: glyph(FOOD, f, 'half'), foodEmpty: glyph(FOOD, f, 'empty'),
      bubble: glyph(BUBBLE, b, 'full'),
      armor: glyph(ARMOR, a, 'full'), armorHalf: glyph(ARMOR, a, 'half'), armorEmpty: glyph(ARMOR, a, 'empty'),
    };
  }

  return { build, icons, hud };
})();
