'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const B = VC.B, P = VC.BP, I = VC.I;
  const SAVE_KEY = 'vibecraft_save', SETTINGS_KEY = 'vibecraft_settings';
  const CREATIVE_HOTBAR = [B.STONE, B.GRASS, B.DIRT, B.COBBLE, B.PLANKS, B.LOG, B.LEAVES, B.GLASS, B.BRICK];

  const canvas = $('game');
  let renderer;
  try {
    // Antialiasing can only be chosen when the WebGL context is created (Gráficos -> needs restart).
    let early = {};
    try { early = JSON.parse(localStorage.getItem('vibecraft_settings') || '{}'); } catch (e) { early = {}; }
    renderer = new VC.Renderer(canvas, { antialias: !!(early.gfx && early.gfx.aa) });
  } catch (e) {
    $('menu').classList.add('hidden');
    $('error').classList.remove('hidden');
    $('error').textContent = 'No se pudo iniciar WebGL2:\n' + e.message;
    return;
  }

  // Procedural textures; a resource pack is drawn over copies of these (see applyTextures).
  const baseTex = { atlas: VC.Textures.build(), items: VC.ItemArt.build(), mobs: VC.Models.buildAtlas() };
  let atlas = baseTex.atlas;
  renderer.setAtlas(atlas);
  renderer.setTexture('items', baseTex.items);
  renderer.setTexture('mobs', baseTex.mobs);
  const icons = VC.ItemArt.icons(baseTex.items);
  // Block icons are drawn lazily the first time they are needed.
  const iconFor = (id) => {
    if (icons[id] === undefined) {
      if (VC.isItem(id)) icons[id] = '';
      else Object.assign(icons, VC.Textures.icons(atlas, [id]));
      if (icons[id] === undefined) icons[id] = '';
    }
    return icons[id];
  };
  const hudIcons = VC.ItemArt.hud();
  document.body.style.setProperty('--dirt', `url(${VC.Textures.menuBackground(atlas)})`);

  // Swaps every atlas, icon and HUD glyph (t = VC.Packs.build result, or baseTex for none).
  let curTex = baseTex;
  function applyTextures(t) {
    curTex = t;
    atlas = gfxAtlas(t.atlas);
    renderer.setAtlas(atlas);
    renderer.setFiltering(settings.gfx.mipmaps, settings.gfx.aniso);
    renderer.setTexture('items', t.items);
    renderer.setTexture('mobs', t.mobs);
    for (const k in icons) delete icons[k];
    Object.assign(icons, VC.ItemArt.icons(t.items));
    Object.assign(hudIcons, VC.ItemArt.hud(), t.hud || {});
    document.body.style.setProperty('--dirt', `url(${VC.Textures.menuBackground(atlas)})`);
    hotbarVersion = -1;
    statsKey = '';
    if (game.ui && state === 'inventory') game.ui.render();
  }

  // ---------- Settings ----------
  // [action, label, default code]
  const ACTIONS = [
    ['forward', 'Avanzar', 'KeyW'], ['back', 'Retroceder', 'KeyS'], ['left', 'Izquierda', 'KeyA'], ['right', 'Derecha', 'KeyD'],
    ['jump', 'Saltar', 'Space'], ['sneak', 'Agacharse', 'ShiftLeft'], ['sprint', 'Correr', 'ControlLeft'],
    ['attack', 'Atacar/Destruir', 'Mouse0'], ['use', 'Usar objeto/Colocar bloque', 'Mouse2'], ['pick', 'Coger bloque', 'Mouse1'],
    ['drop', 'Tirar objeto', 'KeyQ'], ['inventory', 'Inventario', 'KeyE'], ['chat', 'Abrir chat', 'KeyT'], ['command', 'Abrir comando', 'Slash'],
    ['perspective', 'Cambiar perspectiva', 'F5'], ['debug', 'Pantalla de depuración', 'F3'], ['hideHud', 'Ocultar HUD', 'F1'],
  ];
  // Build minigame (Fortnite-style). These win over other actions on the same key while in that minigame.
  ACTIONS.push(['build_wall', 'Construir: muro', 'KeyZ'], ['build_floor', 'Construir: suelo', 'KeyX'], ['build_ramp', 'Construir: rampa', 'KeyC'],
    ['build_cone', 'Construir: cono', 'KeyV'], ['build_edit', 'Editar construcción', 'KeyG'], ['build_rotate', 'Rotar rampa', 'KeyR'],
    ['build_mat', 'Cambiar material', 'KeyB'], ['zoom', 'Zoom', 'KeyC']);
  for (let i = 1; i <= 9; i++) ACTIONS.push(['hotbar' + i, 'Casilla ' + i, 'Digit' + i]);
  const DEFAULT_KEYS = Object.fromEntries(ACTIONS.map(([a, , c]) => [a, c]));
  const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  const settings = Object.assign({ renderDist: 8, fov: 70, sens: 100, invertY: false, volume: 80, name: 'Jugador', editOnRelease: true, turbo: true }, stored);
  // Graphics options (OptiFine-like "Gráficos..." screen).
  const GFX_DEFAULTS = {
    brightness: 0.5, smooth: 1, dynLights: 'fancy', fog: 'fancy', fogStart: 0.55, clouds: 'fancy', cloudHeight: 110,
    sky: true, stars: true, sunMoon: true, leaves: 'fancy', betterGrass: false, clearWater: false, mipmaps: 0, aniso: 1, aa: false,
    shadows: true, vignette: true, bob: true, dynFov: true, showFps: false,
    animWater: true, particles: 'all', fpsLimit: 0, renderScale: 1, chunkSpeed: 'normal',
    waving: true, waterWaves: true, colorLight: true,
  };
  settings.gfx = Object.assign({}, GFX_DEFAULTS, stored.gfx || {});
  VC.gfx = settings.gfx;
  settings.keys = Object.assign({}, DEFAULT_KEYS, stored.keys || {});
  VC.Sound.setVolume(settings.volume / 100);
  const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

  // ---------- Shared game context (used by mobs, UI, items) ----------
  const game = {
    world: null,
    player: null,
    entities: null,
    ui: null,
    furnaces: new Map(),
    dims: {},
    dim: 'overworld',
    portals: [], // [dim, x, y, z] of known portal blocks
    spawn: [0.5, 80, 0.5],
    time: 1000,
    day: 1,
    flash: 0,
    chat: null,
    difficulty: 'normal',
    rules: { doDaylightCycle: true, doMobSpawning: true, keepInventory: false, mobGriefing: true },

    icon: iconFor,
    containers: new Map(),
    enderChest: new VC.Inventory(27),
    jukebox: new Map(),
    notes: new Map(),
    skin: false,

    stackEl(s) {
      const d = document.createElement('div');
      d.className = 'stack';
      const img = document.createElement('img');
      img.src = iconFor(s.id);
      d.appendChild(img);
      if (s.count > 1) {
        const c = document.createElement('span');
        c.className = 'count';
        c.textContent = s.count;
        d.appendChild(c);
      }
      const it = VC.item(s.id);
      if (it && it.tool && s.dmg > 0) {
        const f = 1 - s.dmg / it.tool.durability;
        const bar = document.createElement('div');
        bar.className = 'dura';
        bar.innerHTML = `<div style="width:${Math.round(f * 100)}%;background:hsl(${Math.round(f * 120)},100%,45%)"></div>`;
        d.appendChild(bar);
      }
      return d;
    },

    dropItem(pos, stack, vel) {
      if (!stack || stack.count <= 0) return;
      game.entities.add(new VC.ItemEntity(game.world, pos, stack, vel));
    },

    throwStack(stack) {
      if (!stack || !game.player) return;
      const p = game.player, f = p.forward(), e = p.eye();
      const it = new VC.ItemEntity(game.world, [e[0] + f[0] * 0.3, e[1] - 0.3, e[2] + f[2] * 0.3], stack,
        [f[0] * 6, f[1] * 6 + 2, f[2] * 6]);
      it.pickupDelay = 2;
      game.entities.add(it);
    },

    onPickup() { VC.Sound.pop(); },

    particles: [],
    // Small camera-facing sprites: hearts, smoke, portal sparkles...
    particle(pos, kind, n = 1) {
      const conf = {
        heart: ['particle_heart', 0.12, [0, 1.2, 0], 1.2, 0.3],
        angry: ['particle_angry', 0.15, [0, 0.8, 0], 1, 0.3],
        smoke: ['particle_smoke', 0.25, [0, 1.5, 0], 1.2, 1.4],
        portal: ['particle_portal', 0.06, [0, 0.4, 0], 1.2, 1.5],
        spark: ['particle_spark', 0.1, [0, 1, 0], 0.8, 0.8],
        flame: ['particle_flame', 0.1, [0, 0.6, 0], 0.7, 0.3],
      }[kind];
      if (!conf) return;
      const lvl = settings.gfx.particles;
      if (lvl === 'minimal') return;
      if (lvl === 'decreased') n = Math.ceil(n / 2);
      for (let i = 0; i < n && game.particles.length < 400; i++) {
        const j = conf[4];
        game.particles.push({
          pos: [pos[0] + (Math.random() - 0.5) * j, pos[1] + (Math.random() - 0.5) * j * 0.5, pos[2] + (Math.random() - 0.5) * j],
          vel: [conf[2][0] + (Math.random() - 0.5) * j, conf[2][1] * (0.6 + Math.random() * 0.6), conf[2][2] + (Math.random() - 0.5) * j],
          life: conf[3] * (0.7 + Math.random() * 0.6), sprite: VC.SPRITE_INDEX[conf[0]], size: conf[1],
        });
      }
    },

    // Free-form full-bright particle (fireworks) with its own drag, gravity and fade.
    spark(pos, vel, sprite, size, life, o = {}) {
      if (game.particles.length >= 1500) return;
      const lvl = settings.gfx.particles;
      if (sprite !== 'particle_flash' && (lvl === 'minimal' || (lvl === 'decreased' && Math.random() < 0.5))) return;
      game.particles.push({
        pos: pos.slice(), vel, life, max: life, sprite: VC.SPRITE_INDEX[sprite], size, bright: true,
        drag: o.drag || 0, grav: o.grav || 0, fade: o.fade !== false, twinkle: !!o.twinkle,
      });
    },

    fireworkTrail(pos) {
      if (Math.random() < 0.7) {
        game.spark([pos[0], pos[1] - 0.25, pos[2]], [(Math.random() - 0.5) * 0.8, -1 - Math.random(), (Math.random() - 0.5) * 0.8],
          'particle_spark', 0.07, 0.25 + Math.random() * 0.3, { drag: 2 });
      }
    },

    // Burst of coloured stars + a bright flash where the rocket explodes.
    fireworkBurst(pos) {
      const names = Object.keys(VC.FW_COLORS), pickC = () => names[Math.floor(Math.random() * names.length)];
      const cols = Math.random() < 0.5 ? [pickC()] : [pickC(), pickC()];
      const large = Math.random() < 0.3, twinkle = Math.random() < 0.4;
      const n = large ? 150 : 80, speed = large ? 14 : 8;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        // Even spread over a sphere (Fibonacci), slightly jittered.
        const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * golden;
        const s = speed * (0.85 + Math.random() * 0.3);
        game.spark(pos, [Math.cos(a) * r * s, y * s, Math.sin(a) * r * s], 'particle_fw_' + cols[i % cols.length],
          0.12, 1.1 + Math.random() * 0.7, { drag: 2.4, grav: 2.5, twinkle });
      }
      game.spark(pos, [0, 0, 0], 'particle_flash', large ? 3.5 : 2.2, 0.2);
      const p = game.player, d = Math.hypot(pos[0] - p.pos[0], pos[1] - p.pos[1], pos[2] - p.pos[2]);
      game.flash = Math.max(game.flash, Math.max(0, 1 - d / 48) * 0.12);
      VC.Sound.fireworkBlast(pos, large, twinkle);
    },

    shootFireball(owner, from, to) {
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], l = Math.hypot(...d) || 1, sp = 14;
      const start = [from[0] + d[0] / l * 2.5, from[1] + d[1] / l * 2.5, from[2] + d[2] / l * 2.5];
      game.entities.add(new VC.Fireball(game.world, owner, start, d.map((c) => c / l * sp)));
      VC.Sound.mob('ghast', 'hurt', from);
    },

    shootArrow(owner, from, to, speed, dmg) {
      const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
      const h = Math.hypot(d[0], d[2]), t = h / speed;
      d[1] += 0.5 * 20 * t * t;
      const l = Math.hypot(...d) || 1;
      const spread = 0.03;
      const v = d.map((c) => (c / l + (Math.random() - 0.5) * spread) * speed);
      const start = [from[0] + d[0] / l * 0.6, from[1], from[2] + d[2] / l * 0.6];
      game.entities.add(new VC.Arrow(game.world, owner, start, v, dmg));
      VC.Sound.bow(from);
    },

    // Players in a dimension (multiplayer adds the remote ones).
    playersIn(dim) { return game.player && game.dim === dim ? [game.player] : []; },

    // Who does an arrow at pos hit?
    entityAt(pos, owner) {
      if (owner !== 'player') {
        for (const p of game.playersIn(game.dim)) {
          if (!p.creative && !p.spectator && !p.dead && Math.abs(pos[0] - p.pos[0]) < 0.4 && Math.abs(pos[2] - p.pos[2]) < 0.4 && pos[1] > p.pos[1] && pos[1] < p.pos[1] + 1.8) return p;
        }
        return null;
      }
      for (const e of game.entities.list) {
        if (!(e instanceof VC.Mob) || e.dead) continue;
        if (Math.abs(pos[0] - e.pos[0]) < e.hw + 0.1 && Math.abs(pos[2] - e.pos[2]) < e.hw + 0.1 && pos[1] > e.pos[1] && pos[1] < e.pos[1] + e.height) return e;
      }
      for (const q of mpHittable()) {
        if (Math.abs(pos[0] - q.pos[0]) < 0.4 && Math.abs(pos[2] - q.pos[2]) < 0.4 && pos[1] > q.pos[1] && pos[1] < q.pos[1] + 1.8) return q;
      }
      return null;
    },

    explode(c, power, src, fire) {
      const w = game.world, chunks = new Set();
      const R = Math.ceil(power);
      for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy, dz);
        if (d > power * (0.7 + Math.random() * 0.5)) continue;
        const x = Math.floor(c[0] + dx), y = Math.floor(c[1] + dy), z = Math.floor(c[2] + dz);
        const id = w.getBlock(x, y, z);
        if (!id || id === B.BEDROCK || id === B.OBSIDIAN || P.liquid[id]) continue;
        if (src && !game.rules.mobGriefing) continue;
        if (P.hardness[id] < 0) continue;
        for (const ch of w.setBlock(x, y, z, 0)) chunks.add(ch);
        removeBlockData(x, y, z, true);
        if ((id >> 4) === 46) { game.entities.add(new VC.PrimedTNT(w, x, y, z, 0.5 + Math.random())); continue; }
        if (Math.random() < 1 / power) {
          const dr = dropsFor(id, null);
          if (dr && dr[1] > 0) game.dropItem([x + 0.5, y + 0.5, z + 0.5], VC.stack(dr[0], dr[1]));
        }
      }
      if (fire) {
        for (let i = 0; i < 12; i++) {
          const x = Math.floor(c[0] + (Math.random() - 0.5) * power * 3), y = Math.floor(c[1] + (Math.random() - 0.5) * power * 2), z = Math.floor(c[2] + (Math.random() - 0.5) * power * 3);
          if (w.getBlock(x, y, z) === 0 && P.opaque[w.getBlock(x, y - 1, z)]) for (const ch of w.setBlock(x, y, z, B.FIRE)) chunks.add(ch);
        }
      }
      game.particle(c, 'smoke', 12);
      for (const ch of chunks) if (ch.mesh || w.neighborsReady(ch.cx, ch.cz)) meshChunk(ch);
      const hurtAt = (ent, center) => {
        const d = Math.hypot(center[0] - c[0], center[1] - c[1], center[2] - c[2]);
        if (d >= power * 2) return;
        const imp = 1 - d / (power * 2);
        const dmg = Math.floor((imp * imp + imp) / 2 * 4 * power * 2 + 1);
        ent.invuln = 0;
        if (ent === game.player) ent.hurt(dmg, c, true, src ? (src.type === 'ghast' ? 'murió por una bola de fuego de Ghast' : 'explotó por culpa de un Creeper') : 'explotó', true);
        else ent.hurt(dmg, c, game);
        const l = d || 1;
        ent.vel[0] += (center[0] - c[0]) / l * imp * 12;
        ent.vel[1] += imp * 8;
        ent.vel[2] += (center[2] - c[2]) / l * imp * 12;
      };
      for (const q of game.playersIn(game.dim)) hurtAt(q, q.center());
      for (const e of game.entities.list) if (e instanceof VC.Mob && e !== src && !(src && src.type === 'ghast' && e.type === 'ghast')) hurtAt(e, e.center());
      VC.Sound.explode(c);
      const pd = Math.hypot(game.player.pos[0] - c[0], game.player.pos[2] - c[2]);
      game.flash = Math.max(game.flash, Math.max(0, 1 - pd / 16) * 0.8);
    },
  };

  // ---------- Game modes ----------
  VC.MODE_NAMES = { survival: 'Supervivencia', creative: 'Creativo', spectator: 'Espectador' };
  const MODES = ['survival', 'creative', 'spectator'];
  const modeOf = (p) => (p.spectator ? 'spectator' : p.creative ? 'creative' : 'survival');
  let spectating = null; // mob whose eyes the spectator is looking through
  function setMode(mode) {
    const p = game.player;
    if (!p) return;
    p.creative = mode === 'creative';
    p.spectator = mode === 'spectator';
    p.flying = mode !== 'survival';
    p.vel = [0, 0, 0];
    p.sleeping = false;
    spectating = null;
    mining.progress = 0;
    use = null;
    hotbarVersion = -1;
    statsKey = '';
    if (mode !== 'spectator' && !p.creative) {
      // Leaving spectator inside a block: pop up to the surface.
      const x = Math.floor(p.pos[0]), z = Math.floor(p.pos[2]);
      let y = Math.floor(p.pos[1]);
      while (y < VC.CH - 1 && (P.solid[game.world.getBlock(x, y, z)] || P.solid[game.world.getBlock(x, y + 1, z)])) y++;
      p.pos[1] = Math.max(p.pos[1], y);
    }
    $('hud').classList.toggle('spectator', mode === 'spectator');
  }

  // ---------- State ----------
  let state = 'menu', optionsReturn = 'menu', hudHidden = false;
  let perspective = 0; // 0 first person, 1 third person back, 2 third person front
  let rebinding = null;
  let totalTime = 0, spawnPending = false, target = null, newMode = 'survival';
  const input = { keys: {}, sprintTap: false, slow: false };
  const mouse = { left: false, right: false, leftT: 0, rightT: 0 };
  const mining = { x: 0, y: 0, z: 0, progress: 0, cd: 0, active: false };
  let use = null; // { type: 'eat' | 'bow', t }
  let swingT = 1;
  let lastSpace = 0, lastW = 0, stepDist = 0;

  const SCREENS = { sounds: 'sounds', video: 'video', minigames: 'minigames', join: 'join', packs: 'packs', controls: 'controls', menu: 'menu', newworld: 'newworld', options: 'options', loading: 'loading', ready: 'ready', paused: 'pause', inventory: 'inventory', dead: 'death' };
  function setState(s) {
    state = s;
    for (const k in SCREENS) $(SCREENS[k]).classList.toggle('hidden', SCREENS[k] !== SCREENS[s]);
    $('hud').classList.toggle('hidden', !['playing', 'paused', 'inventory', 'ready', 'dead', 'chat'].includes(s) || hudHidden);
    if (s === 'menu') $('btn-continue').disabled = !localStorage.getItem(SAVE_KEY);
    if (s === 'paused' && game.player) $('btn-mode').textContent = 'Modo: ' + VC.MODE_NAMES[modeOf(game.player)];
  }

  // ---------- World lifecycle ----------
  function hashSeed(str) {
    if (/^-?\d+$/.test(str)) return parseInt(str, 10) | 0;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h;
  }

  function findSpawn(gen) {
    for (let i = 0; i < 600; i++) {
      const a = i * 2.39996, r = 6 * Math.sqrt(i) * 4;
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      const col = gen.column(x, z);
      if (col.biome !== VC.BIOME.OCEAN && col.h > VC.SEA + 1 && col.h < 88) return { x, z, h: col.h };
    }
    return { x: 0, z: 0, h: 80 };
  }

  // Saves from before the 1.8 block-state refactor used small custom ids.
  function migrateSave(save) {
    if (save.v >= 3) return save;
    const st = VC.st;
    const OLD_B = [0, st(1), st(2), st(3), st(4), st(5), st(17), st(18), st(12), st(9), st(20), st(7), st(13), st(16), st(15), st(14), st(56),
      st(45), st(2), st(31, 1), st(38), st(37), st(81), st(24), st(49), st(48), st(98), st(80), st(58), st(61)];
    const OLD_I = [I.STICK, I.COAL, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND, I.WOOD_PICK, I.WOOD_AXE, I.WOOD_SHOVEL, I.WOOD_SWORD,
      I.STONE_PICK, I.STONE_AXE, I.STONE_SHOVEL, I.STONE_SWORD, I.IRON_PICK, I.IRON_AXE, I.IRON_SHOVEL, I.IRON_SWORD,
      I.DIAMOND_PICK, I.DIAMOND_AXE, I.DIAMOND_SHOVEL, I.DIAMOND_SWORD, I.APPLE, I.PORK_RAW, I.PORK_COOKED, I.BEEF_RAW, I.STEAK,
      I.ROTTEN_FLESH, I.BONE, I.ARROW, I.GUNPOWDER, I.STRING, I.BOW, I.BUCKET, I.WATER_BUCKET];
    const mapId = (id) => {
      if (id >= 256) return OLD_I[id - 256] || 0;
      if (id >= 30 && id <= 36) return VC.B.WATER | (id - 29);
      return OLD_B[id] !== undefined ? OLD_B[id] : 0;
    };
    const mapStack = (a) => (a ? [mapId(a[0]), a[1], a[2] || 0] : null);
    if (save.edits) for (const k in save.edits) save.edits[k] = save.edits[k].map(([i, id]) => [i, mapId(id)]);
    if (save.inv) save.inv = save.inv.map(mapStack);
    if (save.hotbar) save.hotbar = save.hotbar.map(mapId);
    if (save.furnaces) for (const k in save.furnaces) { const f = save.furnaces[k]; f.i = mapStack(f.i); f.f = mapStack(f.f); f.o = mapStack(f.o); }
    save.v = 3;
    return save;
  }

  // Each dimension has its own world (chunks, edits) and entity list.
  function makeDimension(dim, seed, edits) {
    const world = new VC.World(seed, edits, { nether: dim === 'nether', type: dim === 'overworld' ? game.worldType : null });
    world.onFall = (x, y, z, st) => game.entities.add(new VC.FallingBlock(world, x, y, z, st));
    world.onBreak = (x, y, z, st, drop) => {
      if (drop && !game.player.creative) {
        const dr = dropsFor(st, null);
        if (dr && dr[1] > 0) game.dropItem([x + 0.5, y + 0.5, z + 0.5], VC.stack(dr[0], dr[1]));
      }
    };
    world.onIgnite = (x, y, z) => igniteTNT(x, y, z, 0.5 + Math.random());
    world.onFizz = (x, y, z) => VC.Sound.fizz([x + 0.5, y + 0.5, z + 0.5]);
    world.onSet = (x, y, z, s) => mpBlockChanged(dim, x, y, z, s);
    world.chestOpen = (x, y, z) => game.dims[dim] && game.world === world && chestAnims.has(x + ',' + y + ',' + z);
    if (dim === 'overworld') {
      world.extraBoxes = (x0, y0, z0, x1, y1, z1, out) => { if (game.build) game.build.collide(x0, y0, z0, x1, y1, z1, out); };
      world.pieceAt = (pos) => (game.build ? game.build.at(pos) : null);
    }
    game.dims[dim] = { world, entities: new VC.EntityManager(game) };
    return game.dims[dim];
  }

  function enterDimension(dim) {
    if (!game.dims[dim]) makeDimension(dim, game.dims.overworld.world.seed, null);
    if (game.world && game.world !== game.dims[dim].world) {
      for (const ch of game.world.chunks.values()) renderer.free(ch);
      game.world.chunks.clear(); // regenerated (with edits) when we come back
    }
    game.dim = dim;
    game.world = game.dims[dim].world;
    game.entities = game.dims[dim].entities;
    if (game.player) game.player.world = game.world;
  }

  function startWorld(save) {
    closeWorld(false);
    save = migrateSave(save);
    game.worldType = save.type || null;
    const mini = game.worldType && VC.Minigames.TYPES[game.worldType];
    game.saveKey = mini ? mini.saveKey : SAVE_KEY;
    game.build = mini && mini.buildBaseY !== undefined ? new VC.Build.World(mini.buildBaseY) : null;
    if (game.build) game.build.load(save.build);
    bm.mode = null; bm.edit = null; bm.rot = 0;
    game.dims = {};
    game.portals = save.portals || [];
    makeDimension('overworld', save.seed, save.edits);
    if (save.netherEdits) makeDimension('nether', save.seed, save.netherEdits);
    const world = game.dims.overworld.world;
    const player = new VC.Player(world);
    game.world = world;
    game.player = player;
    enterDimension(save.dim === 'nether' ? 'nether' : 'overworld');
    game.furnaces = new Map();
    if (save.furnaces) for (const k in save.furnaces) game.furnaces.set(k, VC.Furnace.load(save.furnaces[k]));
    game.containers = new Map();
    if (save.containers) for (const k in save.containers) { const c = new VC.Inventory(save.containers[k].length); c.load(save.containers[k]); game.containers.set(k, c); }
    game.enderChest = new VC.Inventory(27);
    if (save.ender) game.enderChest.load(save.ender);
    game.jukebox = new Map(save.jukebox || []);
    game.notes = new Map(save.notes || []);
    game.guests = save.guests || {};
    sleep = null;

    const mode = save.mode || (save.v ? 'survival' : 'creative');
    game.player = player;
    setMode(mode);
    if (save.player) {
      const sp = save.player;
      player.pos = sp.pos.slice();
      player.yaw = sp.yaw; player.pitch = sp.pitch;
      player.flying = player.spectator || (!!sp.flying && player.creative);
      if (sp.health !== undefined) { player.health = sp.health; player.food = sp.food; player.sat = sp.sat; player.air = sp.air; }
      player.sel = sp.sel || 0;
      game.spawn = save.spawn || sp.pos.slice();
      spawnPending = false;
    } else {
      const sp = findSpawn(game.dims.overworld.world.gen);
      player.pos = [sp.x + 0.5, sp.h + 1, sp.z + 0.5];
      game.spawn = player.pos.slice();
      spawnPending = true;
    }
    if (save.inv) player.inventory.load(save.inv);
    else if (player.creative) (save.hotbar || CREATIVE_HOTBAR).forEach((id, i) => { if (id) player.inventory.slots[i] = VC.stack(id, 64); });
    game.time = save.time !== undefined ? save.time : 1000;
    game.rules = Object.assign({ doDaylightCycle: true, doMobSpawning: true, keepInventory: false, mobGriefing: true }, save.rules || {});
    setDifficulty(save.difficulty || 'normal');
    game.chat.messages = [];
    game.chat.render();
    hotbarVersion = -1;
    setState('loading');
  }

  function saveWorld() {
    if (!game.world || mp.guest) return; // guests never overwrite their own single-player save
    const p = game.player;
    const furnaces = {};
    for (const [k, f] of game.furnaces) furnaces[k] = f.serialize();
    const containers = {};
    for (const [k, c] of game.containers) containers[k] = c.serialize();
    const data = {
      v: 3,
      type: game.worldType || undefined,
      containers,
      ender: game.enderChest.serialize(),
      jukebox: Array.from(game.jukebox.entries()),
      notes: Array.from(game.notes.entries()),
      seed: game.dims.overworld.world.seed,
      mode: modeOf(p),
      time: game.time,
      spawn: game.spawn,
      player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, flying: p.flying, health: p.health, food: p.food, sat: p.sat, air: p.air, sel: p.sel },
      inv: p.inventory.serialize(),
      furnaces,
      rules: game.rules,
      difficulty: game.difficulty,
      dim: game.dim,
      portals: game.portals,
      edits: game.dims.overworld.world.serializeEdits(),
      netherEdits: game.dims.nether ? game.dims.nether.world.serializeEdits() : undefined,
      guests: game.guests, // multiplayer guests' inventories and positions, by name
      build: game.build ? game.build.serialize() : undefined,
    };
    try {
      localStorage.setItem(game.saveKey || SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('No se pudo guardar el mundo', e);
    }
  }

  function closeWorld(save) {
    if (!game.world) return;
    if (game.ui && game.ui.kind) game.ui.close();
    if (save) saveWorld();
    for (const ch of game.world.chunks.values()) renderer.free(ch);
    VC.Sound.stopRecord();
    game.dims = {};
    game.world = null;
    game.player = null;
    game.entities = null;
  }

  // ---------- Chunk streaming ----------
  const spiralCache = {};
  function spiral(r) {
    if (spiralCache[r]) return spiralCache[r];
    const out = [];
    const R = Math.ceil(r);
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++)
        if (dx * dx + dz * dz <= r * r) out.push([dx, dz, dx * dx + dz * dz]);
    out.sort((a, b) => a[2] - b[2]);
    return (spiralCache[r] = out);
  }

  function meshChunk(ch) { renderer.upload(ch, VC.Mesher.build(game.world, ch)); }

  let unloadTimer = 0;
  function updateChunks(dt) {
    const world = game.world, player = game.player;
    const pcx = Math.floor(player.pos[0] / 16), pcz = Math.floor(player.pos[2] / 16);
    const R = settings.renderDist, R2 = (R + 0.5) * (R + 0.5);
    const deadline = performance.now() + (state === 'loading' ? 30 : 7 * ({ slow: 0.5, fast: 2.5 }[settings.gfx.chunkSpeed] || 1));
    for (const [dx, dz, d2] of spiral(R + 1.5)) {
      if (performance.now() > deadline) break;
      const cx = pcx + dx, cz = pcz + dz;
      const ch = world.getChunk(cx, cz);
      if (!ch) { world.generateChunk(cx, cz); continue; }
      if (ch.dirty && d2 <= R2 && world.neighborsReady(cx, cz)) meshChunk(ch);
    }
    // Host: keep the area around each guest generated so mobs, water, etc. run there too (not meshed).
    const anchors = [[pcx, pcz, R + 3]];
    if (mp.host) {
      for (const r of mp.players.values()) {
        if (!r.ready || r.st.d !== game.dim) continue;
        const gx = Math.floor(r.pos[0] / 16), gz = Math.floor(r.pos[2] / 16);
        anchors.push([gx, gz, 6]);
        for (const [dx, dz] of spiral(4)) {
          if (performance.now() > deadline) break;
          if (!world.getChunk(gx + dx, gz + dz)) world.generateChunk(gx + dx, gz + dz);
        }
      }
    }
    unloadTimer += dt;
    if (unloadTimer > 1) {
      unloadTimer = 0;
      for (const [k, ch] of world.chunks) {
        const keep = anchors.some(([ax, az, r]) => (ch.cx - ax) ** 2 + (ch.cz - az) ** 2 <= r * r);
        if (!keep) { renderer.free(ch); world.chunks.delete(k); }
      }
    }
  }

  function chunkReady(x, z) {
    const ch = game.world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
    return ch && !ch.dirty;
  }

  function checkLoaded() {
    const world = game.world, player = game.player;
    const pcx = Math.floor(player.pos[0] / 16), pcz = Math.floor(player.pos[2] / 16);
    const list = spiral(Math.min(3, settings.renderDist));
    let done = 0;
    for (const [dx, dz] of list) {
      const ch = world.getChunk(pcx + dx, pcz + dz);
      if (ch && !ch.dirty) done++;
    }
    $('load-bar').firstElementChild.style.width = (100 * done / list.length) + '%';
    if (done === list.length) {
      if (spawnPending) {
        const x = Math.floor(player.pos[0]), z = Math.floor(player.pos[2]);
        let y = VC.CH - 1;
        while (y > 0 && !P.solid[world.getBlock(x, y, z)]) y--;
        player.pos[1] = y + 1;
        game.spawn = player.pos.slice();
        spawnPending = false;
      }
      $('loading-title').textContent = 'Generando terreno';
      if (document.pointerLockElement === canvas) setState('playing');
      else setState('ready');
    }
  }

  // ---------- Nether portals ----------
  let portalT = 0, portalCooldown = false;
  function changeDimension(dim, pos) {
    const fromNether = game.dim === 'nether';
    const p = game.player;
    const scale = dim === 'nether' ? 1 / 8 : 8;
    const tx = pos ? pos[0] : Math.floor(p.pos[0] * scale), tz = pos ? pos[2] : Math.floor(p.pos[2] * scale);
    enterDimension(dim);
    const w = game.world;
    if (pos) {
      p.pos = pos.slice();
    } else {
      // Load the destination area, then reuse a nearby portal or build one.
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const cx = (tx >> 4) + dx, cz = (tz >> 4) + dz;
        if (!w.getChunk(cx, cz)) w.generateChunk(cx, cz);
      }
      // Known portals within 128 blocks first (like MC's portal search), then nearby, else build one.
      let pt = null, bd = 128 * 128;
      for (const [d, x, y, z] of game.portals) {
        if (d !== dim) continue;
        const dd = (x - tx) ** 2 + (z - tz) ** 2;
        if (dd >= bd) continue;
        if (!w.getChunk(x >> 4, z >> 4)) w.generateChunk(x >> 4, z >> 4);
        const b = w.getBlock(x, y, z);
        if ((b >> 4) === 90) { bd = dd; pt = [x, y, z, b & 3]; }
      }
      if (pt) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const cx = (pt[0] >> 4) + dx, cz = (pt[2] >> 4) + dz;
        if (!w.getChunk(cx, cz)) w.generateChunk(cx, cz);
      }
      if (!pt) pt = VC.Portal.find(w, tx, tz, 24);
      if (!pt) pt = VC.Portal.build(w, tx, tz, dim === 'nether');
      rememberPortal(dim, pt[0], pt[1], pt[2]);
      const [px, py, pz, axis] = pt;
      p.pos = axis === 2 ? [px + 0.5, py, pz + 1] : [px + 1, py, pz + 0.5];
      portalCooldown = true;
    }
    p.vel = [0, 0, 0];
    p.fallDist = 0;
    spectating = null;
    VC.Sound.portalTravel();
    $('loading-title').textContent = dim === 'nether' ? 'Entrando en el Nether' : fromNether ? 'Saliendo del Nether' : 'Generando terreno';
    if (game.ui.kind) game.ui.close();
    setState('loading');
  }

  function rememberPortal(dim, x, y, z) {
    game.portals = game.portals.filter(([d, px, py, pz]) => !(d === dim && Math.abs(px - x) < 4 && Math.abs(py - y) < 4 && Math.abs(pz - z) < 4));
    game.portals.push([dim, x, y, z]);
  }

  function updatePortal(dt) {
    const p = game.player, w = game.world, a = p.aabb();
    let inPortal = false;
    for (let y = Math.floor(a[1]); y <= Math.floor(a[4]) && !inPortal; y++)
      for (let z = Math.floor(a[2]); z <= Math.floor(a[5]) && !inPortal; z++)
        for (let x = Math.floor(a[0]); x <= Math.floor(a[3]); x++)
          if ((w.getBlock(x, y, z) >> 4) === 90) { inPortal = true; break; }
    if (!inPortal) { portalCooldown = false; portalT = Math.max(0, portalT - dt * 2); }
    else if (!portalCooldown) {
      if (portalT === 0) VC.Sound.portalTrigger();
      portalT += dt;
      if (portalT >= (p.creative || p.spectator ? 1 : 4)) {
        portalT = 0;
        changeDimension(game.dim === 'nether' ? 'overworld' : 'nether');
      }
    }
    $('portal-fx').style.opacity = Math.min(0.85, portalT / 4);
    if (inPortal && Math.random() < dt * 8) game.particle([p.pos[0] + (Math.random() - 0.5), p.pos[1] + Math.random() * 2, p.pos[2] + (Math.random() - 0.5)], 'portal', 1);
  }

  // ---------- Block & entity interaction ----------
  const reach = () => (game.player.creative ? 5 : 4.5);
  function pick(liquid) {
    const p = game.player;
    const h = game.world.raycast(p.eye(), p.forward(), reach(), liquid);
    if (h) h.box = VC.Shapes.union(VC.Shapes.selection(h.id, (dx, dy, dz) => game.world.getBlock(h.x + dx, h.y + dy, h.z + dz)));
    return h;
  }

  function applyEdit(x, y, z, id) {
    for (const ch of game.world.setBlock(x, y, z, id)) {
      if (ch.mesh || game.world.neighborsReady(ch.cx, ch.cz)) meshChunk(ch);
    }
  }
  game.setBlock = applyEdit;

  const fkey = (x, y, z) => (game.dim === 'nether' ? 'n:' : '') + x + ',' + y + ',' + z;
  // Furnaces / chests / dispensers keep their contents in maps keyed by position.
  function removeBlockData(x, y, z, drop) {
    const k = fkey(x, y, z), at = [x + 0.5, y + 0.5, z + 0.5];
    const f = game.furnaces.get(k);
    if (f) {
      if (drop) for (const s of [f.input, f.fuel, f.output]) if (s) game.dropItem(at, s);
      game.furnaces.delete(k);
    }
    const c = game.containers.get(k);
    if (c) {
      if (drop) for (const s of c.slots) if (s) game.dropItem(at, s);
      game.containers.delete(k);
    }
    if (f || c) mpSend({ t: 'cdel', k });
  }

  function containerAt(x, y, z, size, title, cols) {
    const k = fkey(x, y, z);
    if (!game.containers.has(k)) game.containers.set(k, new VC.Inventory(size));
    const c = game.containers.get(k);
    c.title = title; c.cols = cols;
    return c;
  }

  function heldTool() {
    const s = game.player.held();
    const it = s && VC.item(s.id);
    return it && it.tool ? it.tool : null;
  }

  function damageHeld(n) {
    const p = game.player;
    if (p.creative) return;
    const s = p.held(), it = s && VC.item(s.id);
    if (!it || !it.tool) return;
    s.dmg += n;
    if (s.dmg >= it.tool.durability) { p.inventory.slots[p.sel] = null; VC.Sound.dig(VC.B.GLASS, null); }
    p.inventory.changed();
  }

  function consumeHeld(n = 1) {
    const p = game.player, s = p.held();
    if (p.creative || !s) return;
    s.count -= n;
    if (s.count <= 0) p.inventory.slots[p.sel] = null;
    p.inventory.changed();
  }

  function canHarvest(id, tool) {
    const t = P.tool[id];
    if (t === 'sword' && !(tool && (tool.type === 'sword' || tool.type === 'shears'))) return false;
    if (P.tier[id] < 0) return true;
    return !!tool && tool.type === 'pick' && t === 'pick' && tool.tier >= P.tier[id];
  }

  function breakTime(id) {
    const h = P.hardness[id];
    if (h < 0) return Infinity;
    if (h === 0) return 0.05;
    const tool = heldTool(), p = game.player;
    let speed = 1;
    if (tool && tool.type === P.tool[id] && tool.speed) speed = tool.speed;
    if (tool && tool.type === 'shears' && ((id >> 4) === 18 || (id >> 4) === 161 || (id >> 4) === 30)) speed = 15;
    if (tool && tool.type === 'shears' && (id >> 4) === 35) speed = 5;
    if (tool && tool.type === 'sword' && (id >> 4) === 30) speed = 15;
    if (tool && tool.type === 'sword' && ((id >> 4) === 18 || (id >> 4) === 161)) speed = 1.5;
    let dmg = speed / h / (canHarvest(id, tool) ? 30 : 100);
    if (p.eyeInWater) dmg /= 5;
    if (!p.onGround && !p.flying) dmg /= 5;
    return Math.ceil(1 / dmg) / 20;
  }

  // What a block drops when broken (respecting shears for leaves/grass/vines).
  function dropsFor(id, tool) {
    const bid = id >> 4;
    if (tool && tool.type === 'shears' && [18, 161, 31, 106, 30].includes(bid)) return bid === 30 ? [I.STRING, 1] : [P.item[id] > 0 ? P.item[id] : id & ~0, 1];
    if (P.drop[id]) return P.drop[id](id & 15);
    const it = P.item[id];
    return it > 0 ? [it, 1] : null;
  }

  // Breaks a block (and the other half of doors/beds/tall plants).
  function breakAt(x, y, z, id, withDrops, tool) {
    const S = VC.SHAPE, sh = P.shape[id], m = id & 15;
    const others = [];
    if (sh === S.door) others.push([x, y + ((m & 8) ? -1 : 1), z]);
    if (sh === S.bed) { const [dx, dz] = VC.FACING_DIR[m & 3]; const sg = (m & 8) ? -1 : 1; others.push([x + dx * sg, y, z + dz * sg]); }
    if ((id >> 4) === 175) others.push([x, y + ((m & 8) ? -1 : 1), z]);
    for (const [ox, oy, oz] of others) if ((game.world.getBlock(ox, oy, oz) >> 4) === (id >> 4)) applyEdit(ox, oy, oz, 0);
    applyEdit(x, y, z, 0);
    removeBlockData(x, y, z, withDrops);
    if ((id >> 4) === 84) ejectRecord(x, y, z);
    if (withDrops && (canHarvest(id, tool) || P.hardness[id] === 0)) {
      const dr = dropsFor(id, tool);
      if (dr && dr[1] > 0) game.dropItem([x + 0.5, y + 0.5, z + 0.5], VC.stack(dr[0], dr[1]));
    }
    // Ice melts into water when broken (not in creative).
    if ((id >> 4) === 79 && withDrops && P.solid[game.world.getBlock(x, y - 1, z)]) applyEdit(x, y, z, B.WATER);
  }

  function harvest(hit) {
    const { x, y, z, id } = hit;
    const p = game.player, tool = heldTool();
    VC.Sound.dig(id, [x + 0.5, y + 0.5, z + 0.5]);
    breakAt(x, y, z, id, !p.creative, tool);
    if (!p.creative) {
      if (tool && P.hardness[id] > 0) damageHeld(tool.type === 'sword' ? 2 : 1);
      p.addExhaustion(0.025);
    }
  }

  function attack() {
    const p = game.player, e = p.eye(), f = p.forward();
    const hitB = pick();
    const bd = hitB ? hitB.t : Infinity;
    const hitE = game.entities.raycast(e, f, p.creative ? 5 : 3.5);
    // Other players (multiplayer PvP).
    const hitP = mpRaycastPlayers(e, f, Math.min(bd, hitE ? hitE.t : Infinity, p.creative ? 5 : 3.5));
    if (hitP) {
      const tool = heldTool();
      let dmg = tool ? tool.damage : 1;
      if (p.fallDist > 0 && !p.onGround && !p.inWater) dmg *= 1.5;
      if (hitP.hurt(dmg, p.pos, true, `fue asesinado por ${playerName()}`, true)) {
        if (tool) damageHeld(tool.type === 'sword' ? 1 : 2);
        p.addExhaustion(0.3);
        VC.Sound.hurt(hitP.center());
      }
      swingT = 0;
      return true;
    }
    if (hitE && hitE.t < bd) {
      const tool = heldTool();
      let dmg = tool ? tool.damage : 1;
      if (p.fallDist > 0 && !p.onGround && !p.inWater) dmg *= 1.5;
      if (hitE.mob.hurt(dmg, p.pos, game)) {
        if (p.sprinting) { hitE.mob.vel[0] *= 1.6; hitE.mob.vel[2] *= 1.6; }
        if (tool) damageHeld(tool.type === 'sword' ? 1 : 2);
        p.addExhaustion(0.3);
      }
      swingT = 0;
      return true;
    }
    // Punching fire puts it out.
    if (hitB && (hitB.id >> 4) === 51) { applyEdit(hitB.x, hitB.y, hitB.z, 0); return true; }
    return false;
  }

  function blockedByEntity(x, y, z, s) {
    if (!P.solid[s]) return false;
    const boxes = VC.Shapes.collision(s, (dx, dy, dz) => game.world.getBlock(x + dx, y + dy, z + dz)) || [];
    const hits = (e) => {
      const a = e.aabb();
      return boxes.some((b) => a[3] > x + b[0] && a[0] < x + b[3] && a[4] > y + b[1] && a[1] < y + b[4] && a[5] > z + b[2] && a[2] < z + b[5]);
    };
    if (hits(game.player)) return true;
    for (const e of game.entities.list) if (e instanceof VC.Mob && !e.dead && hits(e)) return true;
    return false;
  }

  function placeBlock(stateOverride) {
    const p = game.player, hit = pick();
    const s = p.held();
    if (!hit || !s) return false;
    let state = stateOverride !== undefined ? stateOverride : VC.placeState(s.id);
    if (state === null || state === undefined) return false;
    let x = hit.x, y = hit.y, z = hit.z;
    const w = game.world;

    // Slab on slab of the same kind -> double slab.
    const slabDouble = { 44: 43, 126: 125, 182: 181 };
    const hb = hit.id >> 4;
    if (slabDouble[hb] && (state >> 4) === hb && ((hit.id & 7) === (state & 7))) {
      const top = (hit.id & 8) !== 0;
      if ((hit.ny > 0 && !top) || (hit.ny < 0 && top)) {
        applyEdit(x, y, z, VC.st(slabDouble[hb], hit.id & 7));
        VC.Sound.place(state, [x + 0.5, y + 0.5, z + 0.5]);
        consumeHeld(); swingT = 0;
        return true;
      }
    }
    if (!P.replaceable[hit.id] || P.liquid[hit.id]) { x += hit.nx; y += hit.ny; z += hit.nz; }
    if (y < 0) return false;
    if (y >= VC.CH) { heightLimitMsg(); return false; }
    const cur = w.getBlock(x, y, z);
    if (cur !== 0 && !P.replaceable[cur]) {
      // Merge into a slab half in the target cell.
      const cb = cur >> 4;
      if (slabDouble[cb] && (state >> 4) === cb && (cur & 7) === (state & 7)) {
        applyEdit(x, y, z, VC.st(slabDouble[cb], cur & 7));
        consumeHeld(); swingT = 0;
        return true;
      }
      return false;
    }
    const it = VC.item(s.id);
    if (it && it.soil) {
      const below = w.getBlock(x, y - 1, z) >> 4;
      if (it.soil === 'farmland' && below !== 60) return false;
      if (it.soil === 'soul_sand' && below !== 88) return false;
    }
    const cells = VC.Shapes.place(state, [x, y, z], hit, p, w);
    if (!cells) return false;
    for (const [cx, cy, cz, cs] of cells) {
      if (cy < 0) return false;
      if (cy >= VC.CH) { heightLimitMsg(); return false; }
      const c = w.getBlock(cx, cy, cz);
      if ((cx !== x || cy !== y || cz !== z) && c !== 0 && !P.replaceable[c]) return false;
      if (blockedByEntity(cx, cy, cz, cs)) return false;
    }
    for (const [cx, cy, cz, cs] of cells) applyEdit(cx, cy, cz, cs);
    VC.Sound.place(state, [x + 0.5, y + 0.5, z + 0.5]);
    swingT = 0;
    consumeHeld();
    return true;
  }

  // Shown when placing above the top of the world (at most every few seconds).
  let heightMsgT = 0;
  function heightLimitMsg() {
    const now = performance.now();
    if (now - heightMsgT < 3000) return;
    heightMsgT = now;
    game.chat.info(`El límite de altura para construir es ${VC.CH} bloques (y ${VC.CH - 1})`);
  }

  // ---------- Using blocks ----------
  const CONTAINERS = { 54: [27, 'Cofre', 9], 146: [27, 'Cofre trampa', 9], 23: [9, 'Dispensador', 3], 158: [9, 'Soltador', 3], 154: [5, 'Tolva', 5] };
  const NOTE_STEPS = 25;

  function ejectRecord(x, y, z) {
    const k = fkey(x, y, z), rec = game.jukebox.get(k);
    if (!rec) return;
    game.jukebox.delete(k);
    VC.Sound.stopRecord();
    game.dropItem([x + 0.5, y + 1.2, z + 0.5], VC.stack(rec, 1));
  }

  function toggleDoor(x, y, z, id) {
    const m = id & 15, open = (m & 4) ^ 4;
    applyEdit(x, y, z, (id & ~4) | open);
    if (P.shape[id] === VC.SHAPE.door) {
      const oy = (m & 8) ? y - 1 : y + 1, other = game.world.getBlock(x, oy, z);
      if ((other >> 4) === (id >> 4)) applyEdit(x, oy, z, (other & ~4) | open);
    }
    VC.Sound.door(!!open, [x + 0.5, y + 0.5, z + 0.5]);
  }

  // Returns true if the block consumed the right click.
  function useBlock(hit) {
    const p = game.player, { x, y, z, id } = hit, bid = id >> 4, m = id & 15;
    const s = p.held(), it = s && VC.item(s.id);
    if (bid === 58) { openContainer('table'); return true; }
    if (bid === 61 || bid === 62) {
      const k = fkey(x, y, z);
      if (!game.furnaces.has(k)) game.furnaces.set(k, new VC.Furnace());
      openContainer('furnace', game.furnaces.get(k));
      return true;
    }
    if (CONTAINERS[bid]) {
      const [n, title, cols] = CONTAINERS[bid];
      VC.Sound.chest([x + 0.5, y + 0.5, z + 0.5]);
      if (bid === 54 || bid === 146) chestViewer(x, y, z, true, true);
      openContainer('chest', containerAt(x, y, z, n, title, cols));
      return true;
    }
    if (bid === 130) { VC.Sound.chest([x + 0.5, y + 0.5, z + 0.5]); chestViewer(x, y, z, true, true); game.enderChest.title = 'Cofre de Ender'; game.enderChest.cols = 9; openContainer('chest', game.enderChest); return true; }
    if (bid === 26) {
      if (game.dim === 'nether') {
        breakAt(x, y, z, id, false, null);
        game.explode([x + 0.5, y + 0.5, z + 0.5], 5, null, true);
        return true;
      }
      sleepIn(x, y, z, id);
      return true;
    }
    if (P.shape[id] === VC.SHAPE.door || P.shape[id] === VC.SHAPE.trapdoor || P.shape[id] === VC.SHAPE.gate) {
      if (bid === 71 || bid === 167) return false; // iron needs redstone
      toggleDoor(x, y, z, id);
      return true;
    }
    if (bid === 69) { applyEdit(x, y, z, id ^ 8); VC.Sound.click(); return true; }
    if (bid === 77 || bid === 143) { VC.Sound.click(); return true; }
    if (bid === 25) {
      const k = fkey(x, y, z), n = ((game.notes.get(k) || 0) + 1) % NOTE_STEPS;
      game.notes.set(k, n);
      VC.Sound.note(n, game.world.getBlock(x, y - 1, z), [x + 0.5, y + 0.5, z + 0.5]);
      return true;
    }
    if (bid === 84) {
      const k = fkey(x, y, z);
      if (game.jukebox.has(k)) { ejectRecord(x, y, z); return true; }
      if (it && it.record) {
        game.jukebox.set(k, s.id);
        VC.Sound.playRecord(it.record, [x + 0.5, y + 0.5, z + 0.5]);
        game.chat.info(`Reproduciendo: C418 - ${it.record}`);
        consumeHeld();
        return true;
      }
      return false;
    }
    if (bid === 92) {
      if (p.creative || p.food < 20) {
        p.eat({ food: 2, sat: 0.4 });
        VC.Sound.eat();
        applyEdit(x, y, z, m >= 6 ? 0 : id + 1);
      }
      return true;
    }
    if (bid === 46 && it && (s.id === I.FLINT_AND_STEEL || s.id === I.FIRE_CHARGE)) {
      applyEdit(x, y, z, 0);
      igniteTNT(x, y, z, 4);
      if (s.id === I.FLINT_AND_STEEL) damageHeld(1); else consumeHeld();
      return true;
    }
    if (bid === 73) applyEdit(x, y, z, VC.st(74));
    return false;
  }

  function igniteTNT(x, y, z, fuse) {
    game.entities.add(new VC.PrimedTNT(game.world, x, y, z, fuse));
    VC.Sound.fuse([x + 0.5, y + 0.5, z + 0.5]);
  }

  // ---------- Using items ----------
  function useItem() {
    const p = game.player, hit = pick();
    const s = p.held(), it = s && VC.item(s.id);

    // Entities first (shearing, dyeing, milking).
    const ent = game.entities.raycast(p.eye(), p.forward(), 3.5);
    if (ent && (!hit || ent.t < hit.t) && useOnEntity(ent.mob, s, it)) { swingT = 0; return; }

    if (hit && !p.sneaking && useBlock(hit)) { swingT = 0; return; }
    if (!s) return;
    if (it && it.food && !it.drink) { if (p.creative || p.food < 20 || it.always) use = { type: 'eat', t: 0 }; return; }
    if (it && it.drink) { use = { type: 'drink', t: 0 }; return; }
    if (it && it.bow) { if (p.creative || p.inventory.count(I.ARROW) > 0) { use = { type: 'bow', t: 0 }; VC.Sound.bowPull(p.eye()); } return; }
    if (it && it.armor) {
      const slot = 36 + it.armor.slot, old = p.inventory.slots[slot];
      p.inventory.slots[slot] = VC.stack(s.id, 1, s.dmg);
      p.inventory.slots[p.sel] = old;
      p.inventory.changed();
      VC.Sound.equip();
      return;
    }
    if (it && it.throwable) {
      const e = p.eye(), f = p.forward(), speed = it.throwable === 'exp' ? 14 : 22;
      game.entities.add(new VC.Thrown(game.world, 'player', s.id, it.throwable, [e[0] + f[0] * 0.4, e[1] - 0.1, e[2] + f[2] * 0.4], f.map((c) => c * speed)));
      VC.Sound.bow(e);
      consumeHeld();
      swingT = 0;
      return;
    }
    if (s.id === I.FIREWORKS) {
      // Launch from the clicked face, or boost the player while gliding with elytra.
      if (p.gliding) game.entities.add(new VC.Firework(game.world, p.pos, p));
      else if (hit) game.entities.add(new VC.Firework(game.world, [hit.px + hit.nx * 0.15, hit.py + hit.ny * 0.15, hit.pz + hit.nz * 0.15]));
      else return;
      VC.Sound.fireworkLaunch(p.gliding ? null : [hit.px, hit.py, hit.pz]);
      consumeHeld();
      swingT = 0;
      return;
    }
    if (it && it.spawn && hit) {
      game.entities.add(new VC.Mob(game.world, it.spawn, hit.x + hit.nx + 0.5, hit.y + Math.max(0, hit.ny) + (hit.ny < 0 ? -1 : 0), hit.z + hit.nz + 0.5));
      consumeHeld();
      swingT = 0;
      return;
    }
    if (s.id === I.BUCKET) {
      const h = pick(true);
      if (h && P.liquid[h.id] && (h.id & 7) === 0) {
        const lava = VC.isLava(h.id);
        applyEdit(h.x, h.y, h.z, 0);
        VC.Sound.splash([h.x + 0.5, h.y + 0.5, h.z + 0.5], false);
        swingT = 0;
        if (!p.creative) {
          const filled = lava ? I.LAVA_BUCKET : I.WATER_BUCKET;
          if (s.count <= 1) p.inventory.slots[p.sel] = VC.stack(filled, 1);
          else { s.count--; if (p.inventory.add(filled, 1) > 0) game.throwStack(VC.stack(filled, 1)); }
          p.inventory.changed();
        }
      }
      return;
    }
    if (s.id === I.GLASS_BOTTLE) {
      const h = pick(true);
      if (h && VC.isWater(h.id)) {
        consumeHeld();
        if (p.inventory.add(I.POTION, 1) > 0) game.throwStack(VC.stack(I.POTION, 1));
        VC.Sound.splash(null, false);
      }
      return;
    }
    if (s.id === I.WATER_BUCKET && game.dim === 'nether') {
      if (hit) {
        VC.Sound.fizz([hit.x + 0.5, hit.y + 1, hit.z + 0.5]);
        game.particle([hit.x + hit.nx + 0.5, hit.y + hit.ny + 0.5, hit.z + hit.nz + 0.5], 'smoke', 6);
        if (!p.creative) { p.inventory.slots[p.sel] = VC.stack(I.BUCKET, 1); p.inventory.changed(); }
      }
      return;
    }
    if (s.id === I.WATER_BUCKET || s.id === I.LAVA_BUCKET) {
      if (placeBlock(s.id === I.WATER_BUCKET ? B.WATER : B.LAVA)) {
        VC.Sound.splash(null, false);
        if (!p.creative) { p.inventory.slots[p.sel] = VC.stack(I.BUCKET, 1); p.inventory.changed(); }
      }
      return;
    }
    if (!hit) return;
    const { x, y, z } = hit;
    if (it && it.tool && it.tool.type === 'hoe') {
      const b = hit.id >> 4;
      if ((b === 2 || b === 3) && hit.ny >= 0 && game.world.getBlock(x, y + 1, z) === 0) {
        applyEdit(x, y, z, VC.st(60));
        VC.Sound.step(B.DIRT, [x + 0.5, y + 1, z + 0.5]);
        damageHeld(1);
        swingT = 0;
      }
      return;
    }
    if (s.id === I.FLINT_AND_STEEL || s.id === I.FIRE_CHARGE) {
      const fx = x + hit.nx, fy = y + hit.ny, fz = z + hit.nz;
      const portal = game.world.getBlock(fx, fy, fz) === 0 && (game.world.getBlock(fx, fy - 1, fz) >> 4) === 49 ? VC.Portal.tryLight(game.world, fx, fy, fz) : null;
      if (portal) {
        applyEdits(portal.map(([px, py, pz, ps]) => [px, py, pz, ps]));
        rememberPortal(game.dim, portal[0][0], portal[0][1], portal[0][2]);
        VC.Sound.ignite([fx + 0.5, fy + 0.5, fz + 0.5]);
        VC.Sound.portalTrigger();
        if (s.id === I.FLINT_AND_STEEL) damageHeld(1); else consumeHeld();
        swingT = 0;
        return;
      }
      if (game.world.getBlock(fx, fy, fz) === 0) {
        applyEdit(fx, fy, fz, B.FIRE);
        VC.Sound.ignite([fx + 0.5, fy + 0.5, fz + 0.5]);
        if (s.id === I.FLINT_AND_STEEL) damageHeld(1); else consumeHeld();
        swingT = 0;
      }
      return;
    }
    if (s.id === I.BONE_MEAL) {
      if (bonemeal(x, y, z, hit.id)) { consumeHeld(); swingT = 0; }
      return;
    }
    placeBlock();
  }

  function bonemeal(x, y, z, id) {
    const w = game.world, b = id >> 4;
    const sparkle = () => VC.Sound.pop();
    if ([59, 141, 142].includes(b) && (id & 15) < 7) { applyEdit(x, y, z, (id & ~15) | Math.min(7, (id & 15) + 2 + Math.floor(Math.random() * 3))); sparkle(); return true; }
    if (b === 6) { if (Math.random() < 0.45) w.growTree(x, y, z, id & 7); sparkle(); return true; }
    if (b === 2) {
      for (let i = 0; i < 24; i++) {
        const dx = Math.floor(Math.random() * 7) - 3, dz = Math.floor(Math.random() * 7) - 3;
        if (w.getBlock(x + dx, y, z + dz) === B.GRASS && w.getBlock(x + dx, y + 1, z + dz) === 0) {
          const r = Math.random();
          applyEdit(x + dx, y + 1, z + dz, r < 0.8 ? B.TALLGRASS : r < 0.9 ? B.DANDELION : B.ROSE);
        }
      }
      sparkle();
      return true;
    }
    return false;
  }

  function useOnEntity(mob, s, it) {
    const p = game.player;
    if (s && mob.def.food && mob.def.food.includes(s.id) && mob.feed(game)) {
      mpMobUse(mob, 'feed');
      consumeHeld();
      VC.Sound.eat();
      return true;
    }
    if (mob.type === 'sheep' && s && s.id === I.SHEARS && !mob.sheared) {
      mob.sheared = true;
      mpMobUse(mob, 'shear');
      const n = 1 + Math.floor(Math.random() * 3);
      game.dropItem(mob.center(), VC.stack(VC.st(35, mob.color), n));
      VC.Sound.shear(mob.center());
      damageHeld(1);
      return true;
    }
    if (mob.type === 'sheep' && it && it.dye !== undefined && !mob.sheared && mob.color !== it.dye) {
      mob.color = it.dye;
      mpMobUse(mob, 'dye', it.dye);
      consumeHeld();
      return true;
    }
    if (mob.type === 'cow' && s && s.id === I.BUCKET) {
      if (!p.creative) {
        if (s.count <= 1) p.inventory.slots[p.sel] = VC.stack(I.MILK, 1);
        else { s.count--; if (p.inventory.add(I.MILK, 1) > 0) game.throwStack(VC.stack(I.MILK, 1)); }
        p.inventory.changed();
      }
      VC.Sound.mob('cow', 'idle', mob.center());
      return true;
    }
    return false;
  }

  // ---------- Sleeping ----------
  let sleep = null; // { t, bed: [x,y,z] }
  function sleepIn(x, y, z, id) {
    const p = game.player;
    const t = game.time % 24000;
    if (t < 12541 || t > 23458) { game.chat.info('Solo puedes dormir de noche.'); return; }
    for (const e of game.entities.list) {
      if (e instanceof VC.Mob && e.def.hostile && !e.dead && Math.abs(e.pos[0] - x) < 8 && Math.abs(e.pos[1] - y) < 5 && Math.abs(e.pos[2] - z) < 8) {
        game.chat.info('No puedes descansar ahora, hay monstruos cerca.');
        return;
      }
    }
    const m = id & 15;
    let hx = x, hz = z;
    if (!(m & 8)) { const [dx, dz] = VC.FACING_DIR[m & 3]; hx += dx; hz += dz; }
    game.spawn = [x + 0.5, y + 1, z + 0.5];
    game.chat.info('Punto de reaparición establecido.');
    p.sleeping = true;
    p.pos = [hx + 0.5, y + 0.56, hz + 0.5];
    p.vel = [0, 0, 0];
    sleep = { t: 0, bed: [x, y, z] };
  }

  function updateSleep(dt) {
    if (!sleep) return;
    const p = game.player;
    sleep.t += dt;
    $('sleep').style.opacity = Math.min(1, sleep.t / 2);
    if (sleep.t >= 2.5 || p.dead) {
      if (!p.dead) {
        game.time = (Math.floor(game.time / 24000) + 1) * 24000;
        game.chat.info('Has dormido toda la noche.');
      }
      p.sleeping = false;
      p.pos[1] += 0.6;
      sleep = null;
      $('sleep').style.opacity = 0;
    }
  }

  function releaseUse() {
    const p = game.player;
    if (use && use.type === 'bow') {
      const t = use.t, power = Math.min(1, (t * t + 2 * t) / 3);
      if (power >= 0.1) {
        const e = p.eye(), f = p.forward();
        const speed = 55 * power;
        const arrow = game.entities.add(new VC.Arrow(game.world, 'player', [e[0] + f[0] * 0.5, e[1] - 0.1, e[2] + f[2] * 0.5], f.map((c) => c * speed), 0));
        if (power >= 1) arrow.crit = true;
        VC.Sound.bow(e);
        if (!p.creative) p.inventory.take(I.ARROW, 1);
        damageHeld(1);
      }
    }
    use = null;
  }

  function pickBlock() {
    const hit = pick(), p = game.player;
    if (!hit) return;
    const id = P.item[hit.id] > 0 ? P.item[hit.id] : hit.id;
    const slot = p.inventory.slots.findIndex((s, i) => i < 9 && s && s.id === id);
    if (slot >= 0) selectSlot(slot);
    else if (p.creative) { p.inventory.slots[p.sel] = VC.stack(id, VC.maxStack(id)); p.inventory.changed(); showItemName(); }
  }

  function dropHeld(all) {
    const p = game.player, s = p.held();
    if (!s) return;
    const n = all ? s.count : 1;
    game.throwStack(VC.stack(s.id, n, s.dmg));
    s.count -= n;
    if (s.count <= 0) p.inventory.slots[p.sel] = null;
    p.inventory.changed();
    swingT = 0;
  }

  // ---------- HUD ----------
  let hotbarVersion = -1, hotbarSel = -1, statsKey = '';
  function updateHotbar() {
    const p = game.player;
    if (p.inventory.version === hotbarVersion && p.sel === hotbarSel) return;
    hotbarVersion = p.inventory.version;
    hotbarSel = p.sel;
    const hb = $('hotbar');
    hb.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot' + (i === p.sel ? ' sel' : '');
      const s = p.inventory.slots[i];
      if (s) d.appendChild(game.stackEl(s));
      hb.appendChild(d);
    }
  }

  function icons10(value, full, half, empty, reverse) {
    let h = '';
    for (let i = 0; i < 10; i++) {
      const v = value - i * 2;
      const src = v >= 2 ? full : v === 1 ? half : empty;
      h += `<img src="${src}">`;
    }
    return reverse ? `<div class="rev">${h}</div>` : h;
  }

  function updateStats() {
    const p = game.player;
    $('stats').classList.toggle('hidden', p.creative || p.spectator);
    if (p.creative || p.spectator) return;
    const air = p.eyeInWater === 'water' || p.air < 15 ? Math.ceil(p.air / 1.5) : -1;
    const shake = p.health <= 4 ? Math.floor(totalTime * 10) : 0;
    const armor = p.armorPoints();
    const key = `${Math.ceil(p.health)}|${p.food}|${air}|${shake}|${armor}`;
    if (key === statsKey) return;
    statsKey = key;
    $('hearts').innerHTML = icons10(Math.ceil(p.health), hudIcons.heart, hudIcons.heartHalf, hudIcons.heartEmpty);
    if (shake) for (const img of $('hearts').children) img.style.transform = `translateY(${(Math.random() * 2 - 1) | 0}px)`;
    $('food').innerHTML = icons10(p.food, hudIcons.food, hudIcons.foodHalf, hudIcons.foodEmpty, true);
    let bubbles = '';
    for (let i = 0; i < Math.max(0, air); i++) bubbles += `<img src="${hudIcons.bubble}">`;
    $('air').innerHTML = air >= 0 ? `<div class="rev">${bubbles}</div>` : '';
    $('armor').innerHTML = armor > 0 ? icons10(armor, hudIcons.armor, hudIcons.armorHalf, hudIcons.armorEmpty) : '';
  }

  let nameTimer = 0;
  function showItemName() {
    const p = game.player, s = p.held();
    const el = $('hotbar-name');
    el.textContent = s ? VC.itemName(s.id) : '';
    el.style.opacity = 1;
    nameTimer = 2;
  }

  function selectSlot(i) {
    game.player.sel = (i + 9) % 9;
    use = null;
    mining.progress = 0;
    showItemName();
  }

  // ---------- Containers ----------
  function openContainer(kind, data) {
    game.ui.open(kind, data);
    setState('inventory');
    releaseAll();
    mouse.left = mouse.right = false;
    use = null;
    document.exitPointerLock();
  }

  function closeContainer() {
    game.ui.close();
    canvas.requestPointerLock();
  }

  // ---------- Death ----------
  function onDeath() {
    const p = game.player;
    mpSay(`${playerName()} ${p.lastCause}`);
    p.lastCause = 'murió';
    if (game.chat.open) closeChat();
    if (!p.creative && !game.rules.keepInventory) {
      const c = p.center();
      p.inventory.slots.forEach((s, i) => {
        if (!s) return;
        game.dropItem(c, s, [(Math.random() - 0.5) * 6, 3, (Math.random() - 0.5) * 6]);
        p.inventory.slots[i] = null;
      });
      p.inventory.changed();
    }
    use = null;
    if (game.ui.kind) game.ui.close();
    setState('dead');
    document.exitPointerLock();
  }

  // ---------- Chat & commands ----------
  // In a room, guests use the name the host gave them (it may add a number to avoid repeats).
  const playerName = () => (mp.guest && mp.myName) || (settings.name || 'Jugador').slice(0, 16);

  function setDifficulty(d) {
    game.difficulty = d;
    const p = game.player;
    if (!p) return;
    p.damageScale = { peaceful: 0, easy: 0.5, normal: 1, hard: 1.5 }[d];
    p.peaceful = d === 'peaceful';
    if (p.peaceful) for (const e of game.entities.list) if (e instanceof VC.Mob && e.def.hostile) e.removed = true;
  }

  function applyEdits(list) {
    const chunks = new Set();
    for (const [x, y, z, id] of list) {
      removeBlockData(x, y, z, false);
      for (const ch of game.world.setBlock(x, y, z, id)) chunks.add(ch);
    }
    for (const ch of chunks) if (ch.mesh || game.world.neighborsReady(ch.cx, ch.cz)) meshChunk(ch);
  }

  function openChat(prefix) {
    setState('chat');
    releaseAll();
    mouse.left = mouse.right = false;
    use = null;
    document.exitPointerLock();
    game.chat.show(prefix);
  }

  function closeChat() {
    game.chat.hide();
    if (state !== 'chat') return;
    setState('paused');
    canvas.requestPointerLock();
  }

  game.ui = new VC.UI(game);
  // Closing any container (Esc, death, portals...) also closes the chest lid we opened.
  const uiClose = game.ui.close.bind(game.ui);
  game.ui.close = () => {
    if (myChest) { const [x, y, z] = myChest; myChest = null; chestViewer(x, y, z, false, true); }
    uiClose();
  };
  game.chat = new VC.Chat(game, {
    get playerName() { return playerName(); },
    // Multiplayer helpers for /tp.
    playerNames() { return [...mp.players.values()].map((r) => r.name); },
    findPlayer(name) {
      const r = [...mp.players.values()].find((q) => q.name.toLowerCase() === String(name).toLowerCase());
      return r && r.ready ? { self: false, id: r.id, name: r.name, pos: r.pos.slice(), dim: r.st.d } : null;
    },
    teleportSelf(pos, dim) { mpTeleportSelf(pos, dim); },
    teleportPlayer(t, pos, dim) {
      const msg = { t: 'tp', p: pos, d: dim, by: playerName() };
      if (mp.guest) mpSend(Object.assign(msg, { t: 'tpto', to: t.id })); // the host forwards it
      else mpSend(msg, t.id);
    },
    say(text) { mpSay(`<${playerName()}> ${text}`); },
    closeChat,
    applyEdits,
    setDifficulty,
    setMode,
    killPlayer() {
      const p = game.player;
      p.lastCause = 'murió';
      p.health = 0;
      p.dead = true;
    },
  });

  // ---------- Options ----------
  function refreshOptions() {
    $('opt-rd').value = settings.renderDist;
    $('opt-fov').value = settings.fov;
    $('opt-sens').value = settings.sens;
    $('opt-rd-l').textContent = `Distancia de renderizado: ${settings.renderDist} chunks`;
    $('opt-fov-l').textContent = `Campo de visión: ${settings.fov}`;
    $('opt-sens-l').textContent = `Sensibilidad: ${settings.sens}%`;
    $('opt-vol').value = settings.volume;
    $('opt-vol-l').textContent = `Volumen: ${settings.volume}%`;
    $('opt-invert').textContent = `Invertir ratón: ${settings.invertY ? 'SÍ' : 'NO'}`;
    $('opt-name').value = settings.name || '';
    $('opt-editrelease').textContent = `Construcción: editar al soltar: ${settings.editOnRelease ? 'SÍ' : 'NO'}`;
    $('opt-turbo').textContent = `Construcción turbo: ${settings.turbo ? 'SÍ' : 'NO'}`;
  }
  $('opt-name').addEventListener('change', (e) => { settings.name = e.target.value.trim().slice(0, 16) || 'Jugador'; saveSettings(); });
  $('opt-name').addEventListener('keydown', (e) => e.stopPropagation());
  $('opt-editrelease').addEventListener('click', () => { settings.editOnRelease = !settings.editOnRelease; refreshOptions(); saveSettings(); });
  $('opt-turbo').addEventListener('click', () => { settings.turbo = !settings.turbo; refreshOptions(); saveSettings(); });
  $('opt-rd').addEventListener('input', (e) => { settings.renderDist = +e.target.value; refreshOptions(); saveSettings(); });
  $('opt-fov').addEventListener('input', (e) => { settings.fov = +e.target.value; refreshOptions(); saveSettings(); });
  $('opt-sens').addEventListener('input', (e) => { settings.sens = +e.target.value; refreshOptions(); saveSettings(); });
  $('opt-vol').addEventListener('input', (e) => { settings.volume = +e.target.value; VC.Sound.setVolume(settings.volume / 100); refreshOptions(); saveSettings(); });
  function openOptions(from) { optionsReturn = from; refreshOptions(); setState('options'); }
  $('opt-invert').addEventListener('click', () => { settings.invertY = !settings.invertY; refreshOptions(); saveSettings(); });

  // ---------- Graphics (OptiFine-like video settings) ----------
  const OFF_ON = [[false, 'NO'], [true, 'SÍ']];
  const GFX_SPEC = [
    ['Calidad'],
    ['brightness', 'Brillo', [[0, 'Oscuro'], [0.25, 'Bajo'], [0.5, 'Normal'], [0.75, 'Alto'], [1, 'Brillante']]],
    ['smooth', 'Iluminación suave', [[0, 'NO'], [0.5, 'Mínima'], [1, 'Máxima']]],
    ['dynLights', 'Luces dinámicas', [['off', 'NO'], ['fast', 'Rápidas'], ['fancy', 'Elegantes']]],
    ['fog', 'Niebla', [['fancy', 'Elegante'], ['off', 'NO']]],
    ['fogStart', 'Inicio de niebla', [[0.2, '0.2'], [0.4, '0.4'], [0.55, '0.55'], [0.7, '0.7'], [0.8, '0.8']]],
    ['clouds', 'Nubes', [['fancy', 'Elegantes (3D)'], ['fast', 'Rápidas'], ['off', 'NO']]],
    ['cloudHeight', 'Altura de nubes', [[96, '96'], [110, '110'], [128, '128'], [160, '160'], [192, '192']]],
    ['leaves', 'Hojas', [['fancy', 'Elegantes'], ['fast', 'Rápidas']]],
    ['betterGrass', 'Mejor hierba', [[false, 'NO'], [true, 'Rápida']]],
    ['clearWater', 'Agua clara', OFF_ON],
    ['sky', 'Cielo', OFF_ON], ['stars', 'Estrellas', OFF_ON], ['sunMoon', 'Sol y luna', OFF_ON],
    ['mipmaps', 'Niveles de mipmap', [[0, 'NO'], [1, '1'], [2, '2'], [3, '3'], [4, 'Máx.']]],
    ['aniso', 'Filtro anisotrópico', [[1, 'NO'], [2, '2x'], [4, '4x'], [8, '8x'], [16, '16x']]],
    ['aa', 'Suavizado (reiniciar)', OFF_ON],
    ['Detalles'],
    ['shadows', 'Sombras de entidades', OFF_ON], ['vignette', 'Viñeta', OFF_ON],
    ['bob', 'Balanceo de cámara', OFF_ON], ['dynFov', 'FOV dinámico', OFF_ON], ['showFps', 'Mostrar FPS', OFF_ON],
    ['Animaciones'],
    ['animWater', 'Agua y lava animadas', OFF_ON],
    ['particles', 'Partículas', [['all', 'Todas'], ['decreased', 'Reducidas'], ['minimal', 'Mínimas']]],
    ['Rendimiento'],
    ['fpsLimit', 'FPS máximos', [[0, 'VSync'], [30, '30'], [60, '60'], [120, '120'], [240, '240']]],
    ['renderScale', 'Escala de resolución', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.5, '150%'], [2, '200%']]],
    ['chunkSpeed', 'Carga de chunks', [['slow', 'Lenta'], ['normal', 'Normal'], ['fast', 'Rápida']]],
    ['Shaders'],
    ['waving', 'Plantas y hojas al viento', OFF_ON], ['waterWaves', 'Olas en el agua', OFF_ON], ['colorLight', 'Luz de color (amanecer/noche)', OFF_ON],
  ];
  function renderVideo() {
    const list = $('video-list');
    list.innerHTML = '';
    let grid = null;
    for (const [key, label, opts] of GFX_SPEC) {
      if (!opts) {
        const h = document.createElement('div');
        h.className = 'video-head';
        h.textContent = key;
        list.appendChild(h);
        grid = document.createElement('div');
        grid.className = 'video-grid';
        list.appendChild(grid);
        continue;
      }
      const b = document.createElement('button');
      b.className = 'mc video-opt';
      const cur = opts.findIndex(([v]) => v === settings.gfx[key]);
      b.textContent = `${label}: ${opts[Math.max(0, cur)][1]}`;
      // Left click: next value, right click: previous.
      const cycle = (step) => {
        const i = opts.findIndex(([v]) => v === settings.gfx[key]);
        settings.gfx[key] = opts[((i < 0 ? 0 : i) + step + opts.length) % opts.length][0];
        saveSettings();
        applyGfx(key);
        renderVideo();
      };
      b.addEventListener('click', () => cycle(1));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); cycle(-1); });
      grid.appendChild(b);
    }
  }
  function remeshAll() { if (game.world) for (const ch of game.world.chunks.values()) ch.dirty = true; }
  // Applies an option change (key = which one; null = everything, at startup).
  function applyGfx(key) {
    const G = settings.gfx;
    VC.gfx = G;
    if (!key || key === 'smooth') { VC.Mesher.setSmooth(G.smooth); if (key) remeshAll(); }
    if (key === 'leaves' || key === 'betterGrass' || key === 'clearWater') applyTextures(curTex);
    if (!key && (G.leaves === 'fast' || G.betterGrass || G.clearWater)) applyTextures(curTex);
    if (!key || key === 'mipmaps' || key === 'aniso') renderer.setFiltering(G.mipmaps, G.aniso);
    if (!key || key === 'renderScale') resize();
    $('vignette').classList.toggle('hidden', !G.vignette);
    $('fps-counter').classList.toggle('hidden', !G.showFps);
    if (key === 'aa' && game.chat) game.chat.info('El suavizado se aplica al recargar la página.');
  }
  // Atlas tweaks for "Hojas rápidas", "Mejor hierba" and "Agua clara".
  function gfxAtlas(src) {
    const G = settings.gfx;
    if (G.leaves !== 'fast' && !G.betterGrass && !G.clearWater) return src;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    const N = VC.ATLAS_TILES, ts = src.width / N;
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
    const each = (name, fn) => {
      const t = VC.TILE_INDEX[name];
      if (t === undefined) return;
      const ox = (t % N) * ts, oy = Math.floor(t / N) * ts;
      for (let y = 0; y < ts; y++) for (let xx = 0; xx < ts; xx++) fn(((oy + y) * c.width + ox + xx) * 4);
    };
    if (G.leaves === 'fast') {
      for (const name of VC.TILES) {
        if (!name.startsWith('leaves_')) continue;
        let r = 0, g = 0, b = 0, n = 0;
        each(name, (i) => { if (d[i + 3] > 127) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } });
        if (n) each(name, (i) => { if (d[i + 3] <= 127) { d[i] = r / n * 0.45; d[i + 1] = g / n * 0.45; d[i + 2] = b / n * 0.45; d[i + 3] = 255; } });
      }
    }
    if (G.betterGrass) {
      // Grass sides become fully green (OptiFine "Better Grass: Fast").
      const top = [], snow = [];
      each('grass_top', (i) => top.push(d[i], d[i + 1], d[i + 2], d[i + 3]));
      each('snow', (i) => snow.push(d[i], d[i + 1], d[i + 2], d[i + 3]));
      let k = 0;
      each('grass_side', (i) => { for (let j = 0; j < 4; j++) d[i + j] = top[k++]; });
      k = 0;
      each('grass_side_snowed', (i) => { for (let j = 0; j < 4; j++) d[i + j] = snow[k++]; });
    }
    if (G.clearWater) each('water', (i) => { d[i + 3] = d[i + 3] * 0.5; });
    x.putImageData(img, 0, 0);
    return c;
  }

  // Zoom (OptiFine's C key): narrower FOV and slower mouse while held.
  // Drawing a bow narrows the view a little (up to 15% at full draw), like MC.
  const bowFov = () => {
    if (!use || use.type !== 'bow') return 1;
    return 1 - 0.15 * Math.min(1, (use.t * use.t + 2 * use.t) / 3);
  };
  const zoomFactor = () => (state === 'playing' && !buildActive() && isDown('zoom') ? 0.25 : 1);

  // Dynamic lights: light-emitting things held, dropped, burning or exploding (nearest 8).
  const ITEM_LIGHT = {};
  for (const [k, v] of [['LAVA_BUCKET', 15], ['BLAZE_ROD', 10], ['BLAZE_POWDER', 8], ['GLOWSTONE_DUST', 8], ['NETHER_STAR', 15],
    ['MAGMA_CREAM', 8], ['PRISMARINE_CRYSTALS', 8], ['FIRE_CHARGE', 15]]) if (I[k]) ITEM_LIGHT[I[k]] = v;
  const lightOf = (id) => (!id ? 0 : VC.isItem(id) ? ITEM_LIGHT[id] || 0 : P.light[id] || 0);
  function dynamicLights(eye) {
    const G = settings.gfx;
    if (G.dynLights === 'off' || !game.world) return [];
    const out = [];
    const add = (pos, lvl) => { if (lvl > 0) out.push([pos[0], pos[1], pos[2], lvl]); };
    const p = game.player;
    if (p && !p.spectator && !p.dead) { const h = p.held(); add(p.center(), h ? lightOf(h.id) : 0); }
    for (const r of mp.players.values()) if (r.ready && r.st.d === game.dim && !r.dead) add(r.center(), lightOf(r.st.h));
    for (const e of game.entities.list) {
      if (e instanceof VC.ItemEntity) add(e.center(), lightOf(e.stack.id));
      else if (e instanceof VC.Mob) add(e.center(), e.burning || e.fireLeft > 0 ? 15 : e.fuse > 0 ? 10 : 0);
      else if (e instanceof VC.Fireball || e instanceof VC.Firework || e instanceof VC.PrimedTNT) add(e.pos, 15);
    }
    const d2 = (a) => (a[0] - eye[0]) ** 2 + (a[1] - eye[1]) ** 2 + (a[2] - eye[2]) ** 2;
    out.sort((a, b) => d2(a) - d2(b));
    return out.slice(0, G.dynLights === 'fast' ? 3 : 8);
  }

  // Round soft shadows under mobs, players and dropped items.
  const shadowBuf = VC.Models.makeBuf();
  function entityShadows(eye) {
    if (!settings.gfx.shadows || !game.world) return null;
    const w = game.world, b = shadowBuf, N = VC.ATLAS_TILES, t = VC.TILE_INDEX.shadow_blob;
    if (t === undefined) return null;
    const u0 = (t % N) / N, v0 = Math.floor(t / N) / N, u1 = u0 + 1 / N, v1 = v0 + 1 / N;
    b.n = 0;
    const solidAt = (x, y, z) => P.solid[w.getBlock(Math.floor(x), y, Math.floor(z))];
    const put = (pos, r) => {
      if ((pos[0] - eye[0]) ** 2 + (pos[2] - eye[2]) ** 2 > 48 * 48) return;
      let y = Math.floor(pos[1] + 0.2);
      for (let k = 0; k < 4 && !solidAt(pos[0], y - 1, pos[2]); k++) y--;
      if (!solidAt(pos[0], y - 1, pos[2])) return;
      const gy = y + 0.02, s = r * Math.max(0.3, 1 - (pos[1] - y) / 4);
      const pts = [[pos[0] - s, gy, pos[2] - s, u0, v0], [pos[0] + s, gy, pos[2] - s, u1, v0], [pos[0] + s, gy, pos[2] + s, u1, v1], [pos[0] - s, gy, pos[2] + s, u0, v1]];
      if ((b.n + 6) * 8 > b.a.length) { const a = new Float32Array(b.a.length * 2); a.set(b.a); b.a = a; }
      for (const k of [0, 1, 2, 0, 2, 3]) { const q = pts[k]; b.a.set([q[0], q[1], q[2], q[3], q[4], 1, 1, 0], b.n * 8); b.n++; }
    };
    for (const e of game.entities.list) {
      if (e instanceof VC.Mob && !e.def.flying) put(e.pos, e.hw * 1.3);
      else if (e instanceof VC.ItemEntity) put(e.pos, 0.22);
    }
    for (const r of mp.players.values()) if (r.ready && r.st.d === game.dim && !r.spectator) put(r.pos, 0.45);
    if (perspective !== 0 && game.player && !game.player.spectator) put(game.player.pos, 0.45);
    return b.n ? { tex: 'blocks', buf: b, alpha: 0.7 } : null;
  }

  // ---------- Controls screen ----------
  const KEY_NAMES = {
    Space: 'Espacio', ShiftLeft: 'Mayús izq.', ShiftRight: 'Mayús der.', ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.',
    AltLeft: 'Alt izq.', AltRight: 'Alt der.', Tab: 'Tab', Enter: 'Enter', Backspace: 'Retroceso', CapsLock: 'Bloq Mayús',
    Mouse0: 'Botón izquierdo', Mouse1: 'Botón central', Mouse2: 'Botón derecho', Mouse3: 'Botón 4', Mouse4: 'Botón 5',
    Slash: '/', Minus: '-', Equal: '=', Comma: ',', Period: '.', Semicolon: 'Ñ', Quote: '´', BracketLeft: '`', BracketRight: '+',
    Backquote: 'º', Backslash: 'Ç', IntlBackslash: '<', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  const keyName = (c) => {
    if (!c) return 'NINGUNA';
    if (KEY_NAMES[c]) return KEY_NAMES[c];
    if (c.startsWith('Key')) return c.slice(3);
    if (c.startsWith('Digit')) return c.slice(5);
    if (c.startsWith('Numpad')) return 'Num ' + c.slice(6);
    return c;
  };

  function renderControls() {
    const list = $('keys-list');
    list.innerHTML = '';
    const used = {};
    for (const a in settings.keys) used[settings.keys[a]] = (used[settings.keys[a]] || 0) + 1;
    for (const [a, label] of ACTIONS) {
      const row = document.createElement('div');
      row.className = 'key-row';
      const l = document.createElement('span');
      l.textContent = label;
      const b = document.createElement('button');
      b.className = 'mc small';
      const code = settings.keys[a];
      b.textContent = rebinding === a ? '> ? <' : keyName(code);
      if (code && used[code] > 1 && rebinding !== a) b.classList.add('conflict');
      b.addEventListener('click', () => { rebinding = a; renderControls(); });
      row.appendChild(l);
      row.appendChild(b);
      list.appendChild(row);
    }
  }

  function finishRebind(code) {
    if (code) settings.keys[rebinding] = code;
    rebinding = null;
    saveSettings();
    renderControls();
  }

  $('btn-controls').addEventListener('click', () => { renderControls(); setState('controls'); });
  $('btn-video').addEventListener('click', () => { renderVideo(); setState('video'); });
  $('btn-video-done').addEventListener('click', () => setState('options'));
  $('btn-controls-reset').addEventListener('click', () => { settings.keys = Object.assign({}, DEFAULT_KEYS); rebinding = null; saveSettings(); renderControls(); });
  $('btn-controls-done').addEventListener('click', () => { rebinding = null; setState('options'); });

  // ---------- Custom skin ----------
  // Priority: skin chosen in Options (stored in localStorage) > skin/skin.png next to index.html.
  let localSkinH = 64, mySkinUrl = null, skinImg = null; // mySkinUrl is sent to other players
  function applySkin(img, source) {
    try {
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) throw new Error('La skin debe ser un PNG de 64x64 o 64x32');
      renderer.setTexture('skin', img);
      skinImg = img;
      VC.Models.setSkinSize(img.height);
      localSkinH = img.height;
      mySkinUrl = img.src.startsWith('data:') ? img.src : null;
      if (!mySkinUrl) {
        try {
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          mySkinUrl = c.toDataURL();
        } catch (e) { mySkinUrl = null; } // file:// pages can't read skin/skin.png back
      }
      game.skin = true;
      $('skin-status').textContent = `Skin: ${source}`;
    } catch (e) {
      game.skin = false;
      mySkinUrl = null;
      skinImg = null;
      $('skin-status').textContent = 'Skin: Steve (' + e.message + ')';
    }
  }
  function loadSkin() {
    const stored = localStorage.getItem('vibecraft_skin');
    const img = new Image();
    img.onload = () => applySkin(img, stored ? 'personalizada' : 'skin/skin.png');
    img.onerror = () => { game.skin = false; $('skin-status').textContent = 'Skin: Steve (no hay skin/skin.png)'; };
    img.src = stored || 'skin/skin.png';
  }
  $('skin-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { localStorage.setItem('vibecraft_skin', r.result); loadSkin(); };
    r.readAsDataURL(f);
  });
  $('btn-skin').addEventListener('click', () => $('skin-file').click());
  $('btn-skin-reset').addEventListener('click', () => { localStorage.removeItem('vibecraft_skin'); loadSkin(); });
  loadSkin();

  // ---------- Buttons ----------
  $('btn-continue').addEventListener('click', () => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) startWorld(JSON.parse(raw));
  });
  const refreshNewMode = () => { $('btn-newmode').textContent = 'Modo de juego: ' + VC.MODE_NAMES[newMode]; };
  $('btn-newmode').addEventListener('click', () => { newMode = MODES[(MODES.indexOf(newMode) + 1) % 3]; refreshNewMode(); });
  refreshNewMode();
  $('btn-new').addEventListener('click', () => { $('seed-input').value = ''; setState('newworld'); $('seed-input').focus(); });
  $('btn-cancel').addEventListener('click', () => setState('menu'));
  $('btn-create').addEventListener('click', () => {
    const txt = $('seed-input').value.trim();
    const seed = txt ? hashSeed(txt) : (Math.random() * 2147483647) | 0;
    localStorage.removeItem(SAVE_KEY);
    startWorld({ seed, mode: newMode, v: 3 });
    saveWorld();
  });
  $('seed-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-create').click(); });
  // ---------- Resource packs ----------
  let packBusy = false;
  // id null = default textures. pack = already-loaded pack (skips re-reading the zip).
  async function activatePack(id, pack) {
    if (packBusy) return;
    packBusy = true;
    const status = $('packs-status');
    try {
      if (!id) applyTextures(baseTex);
      else {
        status.textContent = 'Cargando paquete...';
        if (!pack) {
          const data = await VC.Packs.getData(id);
          if (!data) throw new Error('El paquete ya no está instalado');
          pack = await VC.Packs.load(data);
        }
        applyTextures(VC.Packs.build(pack, baseTex));
        status.textContent = pack.format > 1 ? 'Aviso: este paquete es de una versión más nueva que la 1.8; puede faltar alguna textura.' : '';
      }
      settings.pack = id || null;
      saveSettings();
    } catch (e) {
      console.error(e);
      status.textContent = 'Error: ' + e.message;
      applyTextures(baseTex);
      settings.pack = null;
      saveSettings();
    }
    packBusy = false;
    renderPacks();
  }

  async function renderPacks() {
    let packs = [];
    try { packs = await VC.Packs.list(); } catch (e) { $('packs-status').textContent = 'Este navegador no permite guardar paquetes: ' + e.message; }
    const list = $('packs-list');
    list.innerHTML = '';
    const row = (info, name, desc) => {
      const r = document.createElement('div');
      r.className = 'pack-row' + ((settings.pack || null) === (info ? info.id : null) ? ' active' : '');
      const icon = document.createElement(info && info.icon ? 'img' : 'div');
      if (info && info.icon) icon.src = info.icon; else icon.className = 'pack-noicon';
      const text = document.createElement('div');
      text.className = 'pack-text';
      const n = document.createElement('span'), d = document.createElement('span');
      n.className = 'pack-name'; n.textContent = name;
      d.className = 'pack-desc'; d.textContent = desc;
      text.append(n, d);
      r.append(icon, text);
      r.addEventListener('click', () => activatePack(info ? info.id : null));
      if (info) {
        const del = document.createElement('button');
        del.className = 'mc pack-del';
        del.textContent = 'X';
        del.title = 'Borrar paquete';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await VC.Packs.remove(info.id);
          if (settings.pack === info.id) activatePack(null); else renderPacks();
        });
        r.append(del);
      }
      list.append(r);
    };
    row(null, 'Por defecto', 'Texturas de Vibecraft');
    for (const p of packs) if (p.hasTex !== false) row(p, p.name, p.desc || '');
  }

  $('btn-packs').addEventListener('click', () => { $('packs-status').textContent = ''; renderPacks(); setState('packs'); });
  $('btn-packs-done').addEventListener('click', () => setState('options'));
  $('btn-pack-add').addEventListener('click', () => $('pack-file').click());
  $('pack-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('packs-status').textContent = `Instalando ${f.name}...`;
    try {
      const { info, pack } = await VC.Packs.install(f);
      await activatePack(info.id, pack);
    } catch (err) {
      console.error(err);
      $('packs-status').textContent = 'Error: ' + err.message;
    }
  });
  if (settings.pack) activatePack(settings.pack);

  // ---------- Sound packs ----------
  // Same .zip resource packs (assets/minecraft/sounds + sounds.json), e.g. Minecraft's own sounds
  // or community packs. Anything the pack lacks keeps the synthesized sound.
  let soundBusy = false;
  async function activateSoundPack(id) {
    if (soundBusy) return;
    soundBusy = true;
    const status = $('sounds-status');
    try {
      if (!id) VC.Sound.setPack(null);
      else {
        status.textContent = 'Cargando sonidos...';
        const data = await VC.Packs.getData(id);
        if (!data) throw new Error('El paquete ya no está instalado');
        const pack = await VC.Packs.loadSounds(data);
        VC.Sound.setPack(pack);
        status.textContent = `${pack.files.size} sonidos cargados.`;
      }
      settings.soundPack = id || null;
      saveSettings();
    } catch (e) {
      console.error(e);
      status.textContent = 'Error: ' + e.message;
      VC.Sound.setPack(null);
      settings.soundPack = null;
      saveSettings();
    }
    soundBusy = false;
    renderSoundPacks();
  }
  async function renderSoundPacks() {
    let packs = [];
    try { packs = await VC.Packs.list(); } catch (e) { $('sounds-status').textContent = 'Este navegador no permite guardar paquetes: ' + e.message; }
    const list = $('sounds-list');
    list.innerHTML = '';
    const row = (info, name, desc) => {
      const r = document.createElement('div');
      r.className = 'pack-row' + ((settings.soundPack || null) === (info ? info.id : null) ? ' active' : '');
      const icon = document.createElement(info && info.icon ? 'img' : 'div');
      if (info && info.icon) icon.src = info.icon; else icon.className = 'pack-noicon';
      const text = document.createElement('div');
      text.className = 'pack-text';
      const n = document.createElement('span'), d = document.createElement('span');
      n.className = 'pack-name'; n.textContent = name;
      d.className = 'pack-desc'; d.textContent = desc;
      text.append(n, d);
      r.append(icon, text);
      r.addEventListener('click', () => activateSoundPack(info ? info.id : null));
      if (info) {
        const del = document.createElement('button');
        del.className = 'mc pack-del';
        del.textContent = 'X';
        del.title = 'Borrar paquete';
        del.addEventListener('click', async (e) => {
          e.stopPropagation();
          await VC.Packs.remove(info.id);
          if (settings.soundPack === info.id) activateSoundPack(null); else renderSoundPacks();
        });
        r.append(del);
      }
      list.append(r);
    };
    row(null, 'Por defecto', 'Sonidos sintetizados de Vibecraft');
    for (const p of packs) if (p.hasSounds) row(p, p.name, p.desc || '');
    $('btn-music').textContent = `Música de fondo del paquete: ${settings.music !== false ? 'SÍ' : 'NO'}`;
  }
  $('btn-sounds').addEventListener('click', () => { $('sounds-status').textContent = ''; renderSoundPacks(); setState('sounds'); });
  $('btn-sounds-done').addEventListener('click', () => setState('options'));
  $('btn-sound-add').addEventListener('click', () => $('sound-file').click());
  $('btn-music').addEventListener('click', () => {
    settings.music = settings.music === false;
    VC.Sound.setMusic(settings.music);
    saveSettings();
    renderSoundPacks();
  });
  $('sound-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('sounds-status').textContent = `Instalando ${f.name}...`;
    try {
      const { info } = await VC.Packs.install(f, 'sounds');
      await activateSoundPack(info.id);
    } catch (err) {
      console.error(err);
      $('sounds-status').textContent = 'Error: ' + err.message;
    }
  });
  VC.Sound.setMusic(settings.music !== false);
  if (settings.soundPack) activateSoundPack(settings.soundPack);

  $('btn-options').addEventListener('click', () => openOptions('menu'));
  $('btn-pause-options').addEventListener('click', () => openOptions('paused'));
  $('btn-opt-done').addEventListener('click', () => setState(optionsReturn));
  $('btn-resume').addEventListener('click', () => canvas.requestPointerLock());
  $('btn-mode').addEventListener('click', () => {
    const p = game.player;
    setMode(MODES[(MODES.indexOf(modeOf(p)) + 1) % 3]);
    setState('paused');
  });
  $('btn-quit').addEventListener('click', () => {
    if (mp.guest) { mpLeave(); return; }
    mpLeave();
    closeWorld(true);
    setState('menu');
  });
  $('ready').addEventListener('click', () => canvas.requestPointerLock());
  $('btn-respawn').addEventListener('click', () => {
    game.player.respawn(game.spawn);
    if (game.dim !== 'overworld') { changeDimension('overworld', game.spawn); statsKey = ''; return; }
    statsKey = '';
    setState('ready');
  });
  $('btn-death-quit').addEventListener('click', () => {
    game.player.respawn(game.spawn);
    if (mp.guest) { mpLeave(); return; }
    mpLeave();
    closeWorld(true);
    setState('menu');
  });

  // ---------- Inventory player preview ----------
  // Like MC: the player (with your skin and armor) turns its head and body towards the mouse.
  const mousePos = { x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => { mousePos.x = e.clientX; mousePos.y = e.clientY; });
  const shadedCache = new Map();
  // Darkened copy of a texture for a face brightness level (cached).
  function shadedTex(img, k) {
    let byImg = shadedCache.get(img);
    if (!byImg) { byImg = new Map(); shadedCache.set(img, byImg); }
    if (byImg.has(k)) return byImg.get(k);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    if (k < 1) {
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(0,0,0,${1 - k})`;
      x.fillRect(0, 0, c.width, c.height);
    }
    byImg.set(k, c);
    return c;
  }
  function drawInventoryPreview() {
    const c = game.ui.preview;
    if (!c || !c.isConnected || !game.player) return;
    const r = c.getBoundingClientRect();
    const ax = Math.atan((mousePos.x - (r.left + r.width / 2)) / 40);
    const ay = Math.atan((mousePos.y - (r.top + r.height * 0.28)) / 40);
    const m = Object.assign({}, avatar, {
      pos: [0, 0, 0], bodyYaw: -Math.PI - ax * 0.35, yaw: -Math.PI - ax * 0.75, headPitch: -ay * 0.5,
      limbSwing: 0, limbAmp: 0, swing: 0, sneaking: false, using: false, bowing: false, tilt: 0, wing: 0,
      dead: false, deathTime: 0, skin: game.skin && !!skinImg,
    });
    const faces = VC.Models.previewFaces(m);
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const scale = c.height / 2.25, ox = c.width / 2, oy = c.height * 0.95;
    const P = (p) => [ox + p[0] * scale, oy - p[1] * scale];
    // Painter's algorithm, back faces culled (we look along -z).
    const vis = faces.filter((f) => f.n[2] > 0.01).map((f) => ({ f, z: (f.pts[0][2] + f.pts[1][2] + f.pts[2][2] + f.pts[3][2]) / 4 }));
    vis.sort((a, b) => a.z - b.z);
    const mobs = curTex.mobs;
    for (const { f } of vis) {
      const src = f.tex === 'skin' ? skinImg : mobs;
      if (!src) continue;
      const k = Math.round(Math.min(1, VC.Models.shadeOf(f.n)) * 10) / 10;
      const img = shadedTex(src, k);
      const W = img.width, H = img.height;
      const u0 = f.uv[0] * W, v0 = f.uv[1] * H, w = (f.uv[2] - f.uv[0]) * W, h = (f.uv[3] - f.uv[1]) * H;
      if (w <= 0 || h <= 0) continue;
      // Corners: pts[3] -> (u0,v0), pts[2] -> (u1,v0), pts[0] -> (u0,v1).
      const a = P(f.pts[3]), b = P(f.pts[2]), d = P(f.pts[0]);
      ctx.setTransform((b[0] - a[0]) / w, (b[1] - a[1]) / w, (d[0] - a[0]) / h, (d[1] - a[1]) / h, a[0], a[1]);
      ctx.drawImage(img, u0, v0, w, h, 0, 0, w, h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- Chest lid animation ----------
  // Lids open while anybody has the chest open; the mesher leaves the lid out while animating.
  const chestAnims = new Map(); // "x,y,z" -> { x, y, z, viewers, t }
  let myChest = null;
  function chestViewer(x, y, z, open, mine) {
    const k = x + ',' + y + ',' + z;
    let a = chestAnims.get(k);
    if (!a) {
      if (!open) return;
      a = { x, y, z, viewers: 0, t: 0 };
      chestAnims.set(k, a);
      remeshAt(x, z);
    }
    a.viewers = Math.max(0, a.viewers + (open ? 1 : -1));
    if (mine) {
      myChest = open ? [x, y, z] : null;
      mpSend({ t: 'chest', d: game.dim, x, y, z, o: open });
    }
  }
  function remeshAt(x, z) {
    const ch = game.world && game.world.getChunk(x >> 4, z >> 4);
    if (ch) ch.dirty = true;
  }
  function drawChestLids(w, dt, blockRanges) {
    if (!chestAnims.size) return;
    const start = bufs.blocks.n;
    for (const [k, a] of chestAnims) {
      const s = w.getBlock(a.x, a.y, a.z), bid = s >> 4;
      if (bid !== 54 && bid !== 146 && bid !== 130) { chestAnims.delete(k); remeshAt(a.x, a.z); continue; }
      const was = a.t;
      a.t = Math.max(0, Math.min(1, a.t + (a.viewers > 0 ? dt : -dt) * 4));
      if (was > 0.4 && a.t <= 0.4 && a.viewers === 0) VC.Sound.chestClose([a.x + 0.5, a.y + 0.5, a.z + 0.5]);
      if (a.t <= 0 && a.viewers === 0) { chestAnims.delete(k); remeshAt(a.x, a.z); continue; }
      const e = 1 - (1 - a.t) ** 3;
      VC.Models.chestLid(bufs.blocks, a.x, a.y, a.z, s, e * Math.PI / 2 * 0.95, w);
    }
    if (bufs.blocks.n > start) blockRanges.push({ start, count: bufs.blocks.n - start, tint: null });
  }

  // ---------- Build minigame (Fortnite-style building) ----------
  // bm.mode: piece kind while in build mode (null = pickaxe). bm.edit: active edit session.
  const bm = { mode: null, kind: 'wall', mat: 0, rot: 0, placeT: 0, hitT: 0, edit: null, prev: null };
  const BT = VC.Build;
  const buildActive = () => !!game.build && game.dim === 'overworld';
  const pieceCenter = (pc) => { const a = game.build.aabb(pc); return [(a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2]; };

  function buildEnter(kind) {
    if (bm.edit) buildEditCancel();
    bm.mode = kind; bm.kind = kind; bm.placeT = 0;
    use = null;
  }
  function buildExit() { if (bm.edit) buildEditCancel(); bm.mode = null; }

  // Input while in the build minigame. Returns true when the key was consumed.
  function buildPress(acts) {
    const has = (a) => acts.includes(a);
    if (has('build_edit')) { buildEditKey(); return true; }
    if (bm.edit) {
      if (has('attack')) { mouse.left = true; buildEditMouse(); return true; }
      if (has('use')) { buildEditReset(); return true; }
      if (acts.some((a) => a.startsWith('hotbar'))) { buildEditCancel(); return false; }
      return acts.every((a) => !['chat', 'command', 'perspective', 'debug', 'hideHud', 'forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'].includes(a));
    }
    for (const k of BT.KINDS) if (has('build_' + k)) { buildEnter(k); return true; }
    if (has('build_mat')) { bm.mat = (bm.mat + 1) % BT.MATS.length; return true; }
    if (bm.mode) {
      if (has('attack')) { mouse.left = true; bm.placeT = 0; buildTryPlace(); return true; }
      if (has('use')) { bm.mat = (bm.mat + 1) % BT.MATS.length; return true; }
      if (has('build_rotate')) { bm.rot = (bm.rot + 1) & 3; return true; }
      if (acts.some((a) => a.startsWith('hotbar'))) { buildExit(); return false; }
      return false;
    }
    if (has('attack')) {
      mouse.left = true;
      bm.hitT = 0.45;
      if (buildPickaxe()) return true;
      return false; // nothing built in front: normal attack (other players)
    }
    if (has('use')) return true; // no block placing in this minigame
    return false;
  }
  function buildRelease(acts) {
    if (acts.includes('attack') && bm.edit) bm.edit.drag = null;
    if (acts.includes('build_edit') && bm.edit && settings.editOnRelease) buildEditConfirm();
  }

  function buildUpdate(dt) {
    const p = game.player;
    if (swingT < 1) swingT = Math.min(1, swingT + dt / 0.3);
    // Turbo build: keep placing while the button is held.
    if (bm.mode && mouse.left && settings.turbo && (bm.placeT -= dt) <= 0) buildTryPlace();
    // Pickaxe: repeated hits while held.
    if (!bm.mode && !bm.edit && mouse.left && (bm.hitT -= dt) <= 0) { bm.hitT = 0.45; buildPickaxe(); }
    if (bm.edit) {
      const ed = bm.edit, pc = game.build.get(ed.key);
      if (!pc || Math.hypot(...pieceCenter(pc).map((v, i) => v - p.eye()[i])) > 9) { buildEditCancel(); return; }
      ed.hover = game.build.tileAt(pc, p.eye(), p.forward());
      if (ed.drag && ed.hover !== null) buildEditTile(ed.hover);
    }
  }

  // ----- Placing -----
  function buildTryPlace() {
    bm.placeT = 0.05;
    const p = game.player, B = game.build;
    const spec = B.target(p, bm.mode, bm.rot);
    if (B.get(BT.keyOf(spec)) || !B.supported(spec, game.world)) return false;
    spec.m = bm.mat; spec.o = playerName(); spec.e = 0;
    const pc = B.add(spec);
    buildResolveOverlap(pc);
    VC.Sound.place(BT.MATS[pc.m].sound, pieceCenter(pc));
    swingT = 0;
    mpSend({ t: 'bp', p: BT.World.pack(pc) });
    return true;
  }

  // A piece placed on top of us lifts us onto it; a wall pushes us to one side.
  function buildResolveOverlap(pc) {
    const p = game.player;
    if (!p || game.dim !== 'overworld') return;
    const a = p.aabb();
    let lift = 0, wall = null;
    for (const b of game.build.boxes(pc)) {
      if (a[3] <= b[0] || a[0] >= b[3] || a[4] <= b[1] || a[1] >= b[4] || a[5] <= b[2] || a[2] >= b[5]) continue;
      if (pc.k === 'wall') wall = b; else lift = Math.max(lift, b[4]);
    }
    if (lift && lift - p.pos[1] < 4.2) { p.pos[1] = lift + 0.001; if (p.vel[1] < 0) p.vel[1] = 0; p.fallDist = 0; }
    if (wall) {
      const i = pc.a === 'x' ? 2 : 0, mid = (wall[i] + wall[i + 3]) / 2;
      p.pos[i] = p.pos[i] < mid ? wall[i] - 0.31 : wall[i + 3] + 0.31;
    }
  }

  // ----- Damage -----
  function buildPickaxe() {
    const p = game.player, e = p.eye(), f = p.forward();
    const hit = game.build.raycast(e, f, 4.5);
    if (!hit || mpRaycastPlayers(e, f, hit.t)) return false;
    buildDamage(hit.piece, 50);
    swingT = 0;
    return true;
  }
  function buildDamage(pc, dmg) {
    pc.dmg += dmg;
    pc.hitT = performance.now() / 1000;
    VC.Sound.hit(BT.MATS[pc.m].sound, pieceCenter(pc));
    if (game.build.hp(pc) <= 0) mpSend({ t: 'bx', l: buildDestroy([pc.key]) });
    else mpSend({ t: 'bd', k: pc.key, d: dmg });
  }
  game.onPieceHit = (pc, dmg) => { if (game.build && dmg > 0) buildDamage(pc, dmg); };
  // Removes pieces plus everything left floating. Returns all removed keys.
  function buildDestroy(keys) {
    const B = game.build, out = [];
    const kill = (k) => {
      const pc = B.remove(k);
      if (!pc) return;
      out.push(k);
      const c = pieceCenter(pc);
      game.particle(c, 'smoke', 6);
      VC.Sound.dig(BT.MATS[pc.m].sound, c);
    };
    for (const k of keys) kill(k);
    for (const k of B.unsupported(game.dims.overworld.world)) kill(k);
    if (bm.edit && !B.get(bm.edit.key)) bm.edit = null;
    return out;
  }
  // Explosions damage nearby pieces (only where the explosion is simulated).
  const buildBaseExplode = game.explode;
  game.explode = (c, power, src, fire) => {
    buildBaseExplode(c, power, src, fire);
    if (!game.build || game.dim !== 'overworld') return;
    const r = power * 2;
    for (const pc of game.build.near(c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r)) {
      const pcC = pieceCenter(pc), d = Math.hypot(pcC[0] - c[0], pcC[1] - c[1], pcC[2] - c[2]);
      if (d < r && game.build.get(pc.key)) buildDamage(pc, Math.round(200 * (1 - d / r)));
    }
  };

  // ----- Editing -----
  function buildEditKey() {
    if (bm.edit) { if (!settings.editOnRelease) buildEditConfirm(); return; }
    const p = game.player, hit = game.build.raycast(p.eye(), p.forward(), 6, true);
    if (!hit) return;
    const pc = hit.piece;
    if (pc.o && pc.o !== playerName()) { game.chat.info('Solo puedes editar tus propias construcciones'); return; }
    bm.prev = bm.mode;
    bm.mode = null;
    bm.edit = { key: pc.key, sel: game.build.editSelection(pc), order: [], drag: null, hover: null };
    VC.Sound.click();
  }
  function buildEditMouse() {
    const ed = bm.edit, pc = game.build.get(ed.key);
    if (!pc || ed.hover === null) return;
    if (pc.k === 'ramp') { ed.order = []; ed.sel.clear(); ed.drag = 'add'; }
    else ed.drag = ed.sel.has(ed.hover) ? 'remove' : 'add';
    buildEditTile(ed.hover);
  }
  function buildEditTile(t) {
    const ed = bm.edit, pc = game.build.get(ed.key);
    if (!pc) return;
    if (pc.k === 'ramp') { if (!ed.order.includes(t) && ed.order.length < 2) { ed.order.push(t); ed.sel.add(t); } return; }
    if (ed.drag === 'add') ed.sel.add(t); else ed.sel.delete(t);
  }
  function buildSetEdit(pc, e, r) {
    pc.e = e;
    if (pc.k === 'ramp') pc.r = r;
    pc.geo = null;
    game.build.version++;
  }
  function buildEditConfirm() {
    const ed = bm.edit, pc = ed && game.build.get(ed.key);
    if (pc) {
      const res = game.build.applyEdit(pc, ed.sel, ed.order);
      if (res && (res.e !== pc.e || (pc.k === 'ramp' && res.r !== pc.r))) {
        buildSetEdit(pc, res.e, res.r);
        mpSend({ t: 'be', k: pc.key, e: res.e, r: res.r });
        VC.Sound.place(BT.MATS[pc.m].sound, pieceCenter(pc));
      }
    }
    bm.edit = null;
    bm.mode = bm.prev;
  }
  function buildEditReset() {
    const pc = game.build.get(bm.edit.key);
    if (pc && pc.e) {
      buildSetEdit(pc, 0, pc.r);
      mpSend({ t: 'be', k: pc.key, e: 0, r: pc.r });
      VC.Sound.place(BT.MATS[pc.m].sound, pieceCenter(pc));
    }
    bm.edit = null;
    bm.mode = bm.prev;
  }
  function buildEditCancel() { bm.edit = null; }

  // ----- Network -----
  function buildNet(m) {
    const B = game.build;
    if (!B) return;
    if (m.t === 'bp') { const pc = B.add(BT.World.unpack(m.p)); buildResolveOverlap(pc); VC.Sound.place(BT.MATS[pc.m].sound, pieceCenter(pc)); }
    else if (m.t === 'be') { const pc = B.get(m.k); if (pc) buildSetEdit(pc, m.e, m.r); }
    else if (m.t === 'bd') { const pc = B.get(m.k); if (pc) { pc.dmg += m.d; pc.hitT = performance.now() / 1000; VC.Sound.hit(BT.MATS[pc.m].sound, pieceCenter(pc)); } }
    else if (m.t === 'bx') {
      for (const k of m.l) {
        const pc = B.remove(k);
        if (pc) { const c = pieceCenter(pc); game.particle(c, 'smoke', 6); VC.Sound.dig(BT.MATS[pc.m].sound, c); }
      }
      if (bm.edit && !B.get(bm.edit.key)) bm.edit = null;
    }
  }

  // ----- Rendering -----
  const ghostBuf = VC.Models.makeBuf(), editBufA = VC.Models.makeBuf(), editBufB = VC.Models.makeBuf();
  function bufAppend(b, data) {
    const k = data.length / 8;
    if ((b.n + k) * 8 > b.a.length) { const a = new Float32Array(Math.max(b.a.length * 2, (b.n + k) * 8)); a.set(b.a); b.a = a; }
    b.a.set(data, b.n * 8);
    b.n += k;
  }
  // Pieces go into the block batch; previews and edit grids are returned as translucent overlays.
  function buildDraw(eye, blockRanges) {
    const B = game.build, overlays = [];
    if (!B || game.dim !== 'overworld') return overlays;
    const t = performance.now() / 1000, R = settings.renderDist * 16, special = [];
    const start = bufs.blocks.n;
    for (const pc of B.pieces.values()) {
      const c = pieceCenter(pc);
      if ((c[0] - eye[0]) ** 2 + (c[2] - eye[2]) ** 2 > R * R) continue;
      if (B.progress(pc) < 1 || (pc.hitT && t - pc.hitT < 0.12)) { special.push(pc); continue; }
      bufAppend(bufs.blocks, BT.geometry(B, pc));
    }
    if (bufs.blocks.n > start) blockRanges.push({ start, count: bufs.blocks.n - start, tint: null });
    for (const pc of special) {
      const s = bufs.blocks.n;
      bufAppend(bufs.blocks, BT.geometry(B, pc));
      const flash = pc.hitT && t - pc.hitT < 0.12;
      blockRanges.push({ start: s, count: bufs.blocks.n - s, tint: flash ? [1, 1, 1, 0.45] : [0.35, 0.7, 1, 0.6 * (1 - B.progress(pc))] });
    }
    const p = game.player;
    // Holographic preview of the piece about to be placed.
    if (bm.mode && state === 'playing') {
      const spec = B.target(p, bm.mode, bm.rot);
      spec.e = 0;
      const ok = !B.get(BT.keyOf(spec)) && B.supported(spec, game.world);
      ghostBuf.n = 0;
      bufAppend(ghostBuf, BT.geometry(B, spec, { mat: bm.mat, light: [1, 1] }));
      overlays.push({ tex: 'blocks', buf: ghostBuf, alpha: 0.45, ranges: [{ start: 0, count: ghostBuf.n, tint: ok ? [0.3, 0.65, 1, 0.65] : [1, 0.25, 0.25, 0.6] }] });
    }
    // Edit grid: every tile, selected ones highlighted.
    if (bm.edit) {
      const pc = B.get(bm.edit.key);
      if (pc) {
        const base = { overlay: true, all: true, sel: bm.edit.sel, light: [1, 1] };
        editBufA.n = 0; editBufB.n = 0;
        bufAppend(editBufA, BT.geometry(B, pc, Object.assign({ selected: false }, base)));
        bufAppend(editBufB, BT.geometry(B, pc, Object.assign({ selected: true }, base)));
        overlays.push({ tex: 'blocks', buf: editBufA, alpha: 0.28, ranges: [{ start: 0, count: editBufA.n, tint: [0.75, 0.9, 1, 0.35] }] });
        overlays.push({ tex: 'blocks', buf: editBufB, alpha: 0.6, ranges: [{ start: 0, count: editBufB.n, tint: [0.15, 0.5, 1, 0.7] }] });
      }
    }
    return overlays;
  }

  // ----- HUD -----
  const buildIcons = (() => {
    const icon = (draw) => {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const x = c.getContext('2d');
      x.fillStyle = '#e8d2a8'; x.strokeStyle = '#5a3c1c'; x.lineWidth = 2;
      draw(x);
      return c.toDataURL();
    };
    return {
      wall: icon((x) => { x.fillRect(6, 5, 20, 22); x.strokeRect(6, 5, 20, 22); x.beginPath(); x.moveTo(6, 16); x.lineTo(26, 16); x.moveTo(16, 5); x.lineTo(16, 27); x.stroke(); }),
      floor: icon((x) => { x.beginPath(); x.moveTo(2, 20); x.lineTo(12, 12); x.lineTo(30, 12); x.lineTo(20, 20); x.closePath(); x.fill(); x.stroke(); }),
      ramp: icon((x) => { x.beginPath(); x.moveTo(4, 27); x.lineTo(28, 27); x.lineTo(28, 6); x.closePath(); x.fill(); x.stroke(); }),
      cone: icon((x) => { x.beginPath(); x.moveTo(3, 26); x.lineTo(16, 6); x.lineTo(29, 26); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.moveTo(16, 6); x.lineTo(16, 26); x.stroke(); }),
    };
  })();
  let buildHudKey = '';
  function updateBuildHud() {
    const on = buildActive() && !hudHidden && ['playing', 'paused', 'chat', 'inventory'].includes(state);
    $('buildbar').classList.toggle('hidden', !on);
    $('build-info').classList.toggle('hidden', !on);
    if (!on) return;
    // Piece under the crosshair: material and health.
    const p = game.player, hit = game.build.raycast(p.eye(), p.forward(), 8);
    let info = '';
    if (bm.edit) info = settings.editOnRelease ? `Editando · suelta ${keyName(settings.keys.build_edit)} para confirmar · clic der.: restablecer` : `Editando · ${keyName(settings.keys.build_edit)} para confirmar · clic der.: restablecer`;
    else if (hit) { const pc = hit.piece; info = `${BT.KIND_NAMES[pc.k]} de ${BT.MATS[pc.m].name.toLowerCase()} · ${game.build.hp(pc)}/${game.build.maxHp(pc)}`; }
    const key = [bm.mode, bm.mat, bm.rot, info, ...BT.KINDS.map((k) => settings.keys['build_' + k])].join('|');
    if (key === buildHudKey) return;
    buildHudKey = key;
    const bar = $('buildbar');
    bar.innerHTML = '';
    for (const k of BT.KINDS) {
      const d = document.createElement('div');
      d.className = 'bslot' + (bm.mode === k ? ' sel' : '');
      const img = document.createElement('img');
      img.src = buildIcons[k];
      const l = document.createElement('span');
      l.textContent = keyName(settings.keys['build_' + k]);
      d.append(img, l);
      bar.appendChild(d);
    }
    const mat = document.createElement('div');
    mat.className = 'bmat m' + bm.mat;
    mat.textContent = `${BT.MATS[bm.mat].name} ∞`;
    bar.appendChild(mat);
    $('build-info').textContent = info;
  }

  // ---------- Multiplayer (P2P rooms) ----------
  // The host owns the world: it simulates mobs, items, water, etc. and relays everything.
  // Guests send their own actions (block edits, hits, spawns) and mirror the host's entities.
  // A guest in another dimension than the host simulates that dimension itself.
  const NET_VERSION = 1;
  const mp = {
    room: null, host: false, guest: false,
    players: new Map(), // peer id -> Remote ('host' on guests)
    outBlocks: [],
    sim: true,          // guest: true when it simulates its own dimension
    hostDim: 'overworld',
    proxyDim: null,
    stateT: 0, entT: 0, timeT: 0, pdT: 0, uiT: 0, furnT: 0, pingT: 0,
    myPing: null,       // guest: round trip to the host in ms
    lastUi: '',
  };
  game.guests = {};

  // Another player, seen through the network. Quacks enough like VC.Player for mob AI.
  class Remote {
    constructor(id, name) {
      this.id = id;
      this.name = name;
      this.ready = false;
      this.pos = [0, -500, 0];
      this.vel = [0, 0, 0];
      this.st = { d: 'overworld' };
      this.av = {
        type: 'player', pos: [0, -500, 0], yaw: 0, bodyYaw: 0, headPitch: 0, limbSwing: 0, limbAmp: 0, age: 0,
        dead: false, deathTime: 0, fuse: 0, swing: 0, sneaking: false, using: false, armor: [null, null, null, null],
        elytra: false, wing: 0, tilt: 0, skin: false, center() { return [this.pos[0], this.pos[1] + 0.9, this.pos[2]]; },
      };
      this.buf = VC.Models.makeBuf();
      this.tag = document.createElement('div');
      this.tag.className = 'nametag';
      this.tag.textContent = name;
      $('nametags').appendChild(this.tag);
    }
    get dead() { return !!this.st.dd; }
    get creative() { return this.st.m === 'creative'; }
    get spectator() { return this.st.m === 'spectator'; }
    get sneaking() { return !!this.st.sn; }
    eyeHeight() { return this.sneaking ? 1.54 : 1.62; }
    eye() { return [this.pos[0], this.pos[1] + this.eyeHeight(), this.pos[2]]; }
    center() { return [this.pos[0], this.pos[1] + 0.9, this.pos[2]]; }
    aabb() { const p = this.pos; return [p[0] - 0.3, p[1], p[2] - 0.3, p[0] + 0.3, p[1] + 1.8, p[2] + 0.3]; }
    held() { return this.st.h ? VC.stack(this.st.h, 1) : null; }
    // Damage dealt by the host's mobs / explosions is applied on the owner's machine.
    hurt(amount, src, knock = true, cause, armorable) {
      if (this.dead || this.creative || this.spectator || amount <= 0) return false;
      const msg = { t: 'hurt', a: amount, s: src || null, k: !!knock, c: typeof cause === 'string' ? cause : null, ar: armorable === undefined ? !!src : armorable };
      // Guests have no direct link to each other: player-vs-player damage goes through the host.
      if (mp.guest) mpSend(Object.assign(msg, { t: 'pvp', to: this.id }));
      else mpSend(msg, this.id);
      this.hitT = 0.4; // red flash until their own state says they were hurt
      return true;
    }
    setSkin(url) {
      if (!url) return;
      const img = new Image();
      img.onload = () => {
        if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return;
        renderer.setTexture('skin_' + this.id, img);
        this.skinH = img.height;
      };
      img.src = url;
    }
    remove() { this.tag.remove(); }
  }

  // Sends to the host (guest) or to one peer / everybody (host).
  function mpSend(msg, to) {
    if (!mp.room) return;
    if (mp.guest) mp.room.send(mp.hostLink, msg);
    else if (to) mp.room.send(to, msg);
    else mp.room.broadcast(msg);
  }
  const mpRemotesIn = (dim) => [...mp.players.values()].filter((r) => r.ready && r.st.d === dim);
  // Other players this client can hit (host and guests alike).
  const mpHittable = () => mpRemotesIn(game.dim).filter((r) => !r.dead && !r.spectator && !r.creative);
  // Nearest other player along a ray, closer than maxT.
  function mpRaycastPlayers(o, d, maxT) {
    let best = null, bt = maxT;
    for (const q of mpHittable()) {
      const mn = [q.pos[0] - 0.4, q.pos[1], q.pos[2] - 0.4], mx = [q.pos[0] + 0.4, q.pos[1] + 1.9, q.pos[2] + 0.4];
      let t0 = 0, t1 = bt, ok = true;
      for (let i = 0; i < 3 && ok; i++) {
        if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) ok = false; continue; }
        let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bt) { bt = t0; best = q; }
    }
    return best;
  }

  function mpSay(line, cls) {
    game.chat.print(line, cls);
    if (!mp.room) return;
    mpSend({ t: 'chat', m: line, c: cls || '' });
  }
  function mpInfo(line) { mpSay(line, 'sys'); }

  // ----- Hooks used by the rest of the game -----
  game.playersIn = (dim) => {
    const out = game.player && game.dim === dim ? [game.player] : [];
    if (mp.host) out.push(...mpRemotesIn(dim));
    return out;
  };
  // Nearest player a mob should care about (survival players first).
  game.targetFor = (mob) => {
    if (!mp.host || !mp.players.size) return game.player;
    let best = null, bd = Infinity, any = null, ad = Infinity;
    for (const q of game.playersIn(game.dim)) {
      const d = (q.pos[0] - mob.pos[0]) ** 2 + (q.pos[1] - mob.pos[1]) ** 2 + (q.pos[2] - mob.pos[2]) ** 2;
      if (d < ad) { ad = d; any = q; }
      if (!q.dead && !q.creative && !q.spectator && d < bd) { bd = d; best = q; }
    }
    return best || any || game.player;
  };
  game.spawnAnchor = () => {
    const list = game.playersIn(game.dim);
    return list[Math.floor(Math.random() * list.length)] || game.player;
  };
  // Host: items next to a guest go into the guest's inventory.
  game.netPickup = (item) => {
    if (!mp.host) return false;
    const c = item.center();
    for (const r of mpRemotesIn(game.dim)) {
      if (r.dead || r.spectator || item.skipFor === r.id) continue;
      const pc = r.center();
      if (Math.abs(c[0] - pc[0]) < 1.3 && Math.abs(c[1] - pc[1]) < 1.6 && Math.abs(c[2] - pc[2]) < 1.3) {
        mpSend({ t: 'give', s: [item.stack.id, item.stack.count, item.stack.dmg || 0] }, r.id);
        item.removed = true;
        return true;
      }
    }
    return false;
  };
  // Guest mirroring the host: only its own projectiles stay local, other spawns go to the host.
  game.netAdd = (e) => {
    if (!mp.guest || mp.sim || e.netProxy) return true;
    if (e instanceof VC.Thrown || (e instanceof VC.Arrow && e.owner === 'player') || (e instanceof VC.Firework && e.rider)) { e.local = true; return true; }
    const spec = mpSpec(e);
    if (spec) mpSend({ t: 'spawn', e: spec });
    return false;
  };
  Object.defineProperty(game, 'netNoSpawn', { get: () => mp.guest && !mp.sim });

  function mpSpec(e) {
    const p = e.pos.map((v) => Math.round(v * 1000) / 1000);
    if (e instanceof VC.ItemEntity) return { k: 'i', p: [p[0], p[1] + 0.125, p[2]], s: [e.stack.id, e.stack.count, e.stack.dmg || 0], v: e.vel, pd: e.pickupDelay };
    if (e instanceof VC.Mob) return { k: 'm', ty: e.type, p, b: e.baby, c: e.color };
    if (e instanceof VC.PrimedTNT) return { k: 'n', p: [p[0] - 0.5, p[1], p[2] - 0.5], f: e.fuse };
    if (e instanceof VC.Firework) return { k: 'w', p };
    return null;
  }
  function mpFromSpec(o, w) {
    if (o.k === 'i') { const e = new VC.ItemEntity(w, o.p, VC.stack(o.s[0], o.s[1], o.s[2]), o.v); e.pickupDelay = o.pd || 0; return e; }
    if (o.k === 'm' && VC.MOB_TYPES[o.ty]) { const e = new VC.Mob(w, o.ty, o.p[0], o.p[1], o.p[2]); if (o.b) e.setBaby(true); if (o.c !== undefined) e.color = o.c; return e; }
    if (o.k === 'n') return new VC.PrimedTNT(w, o.p[0], o.p[1], o.p[2], o.f);
    if (o.k === 'w') return new VC.Firework(w, o.p);
    return null;
  }

  // Moves the local player (changing dimension if needed).
  function mpTeleportSelf(pos, dim) {
    const p = game.player;
    if (!p) return;
    if (dim && dim !== game.dim) { changeDimension(dim, pos.slice()); return; }
    p.pos = pos.slice();
    p.vel = [0, 0, 0];
    p.fallDist = 0;
  }

  function mpMobUse(mob, kind, v) { if (mob.netProxy) mpSend({ t: 'mu', id: mob.netId, k: kind, v }); }

  // Effects that only change what players see/hear are relayed as 'fx'.
  const baseExplode = game.explode, baseBurst = game.fireworkBurst;
  game.explode = (c, power, src, fire) => {
    baseExplode(c, power, src, fire);
    if (mp.room) mpSend({ t: 'fx', k: 'boom', p: c, w: power, d: game.dim });
  };
  game.fireworkBurst = (pos) => {
    baseBurst(pos);
    if (mp.room) mpSend({ t: 'fx', k: 'fw', p: pos, d: game.dim });
  };
  function mpFx(m) {
    if (m.d !== game.dim) return;
    if (m.k === 'fw') baseBurst(m.p);
    if (m.k === 'boom') {
      game.particle(m.p, 'smoke', 12);
      VC.Sound.explode(m.p);
      const pd = Math.hypot(game.player.pos[0] - m.p[0], game.player.pos[2] - m.p[2]);
      game.flash = Math.max(game.flash, Math.max(0, 1 - pd / 16) * 0.8);
    }
  }

  // ----- Blocks -----
  function mpBlockChanged(dim, x, y, z, s) {
    if (mp.room) mp.outBlocks.push([dim, x, y, z, s]);
  }
  // Applies block changes from the network. silent: don't echo them back.
  function mpApplyBlocks(list, silent) {
    const chunks = new Set();
    for (const [d, x, y, z, s] of list) {
      if (!game.dims[d]) makeDimension(d, game.dims.overworld.world.seed, null);
      const w = game.dims[d].world;
      w.silent = silent;
      try { for (const ch of w.setBlock(x, y, z, s)) if (w === game.world) chunks.add(ch); } finally { w.silent = false; }
    }
    for (const ch of chunks) if (ch.mesh || game.world.neighborsReady(ch.cx, ch.cz)) meshChunk(ch);
  }

  // ----- Entity snapshots (host -> guests in the same dimension) -----
  const r2 = (v) => Math.round(v * 100) / 100;
  function mpSnap(e) {
    const b = [e.netId, r2(e.pos[0]), r2(e.pos[1]), r2(e.pos[2])];
    if (e instanceof VC.Mob) {
      const f = (e.hurtTime > 0 ? 1 : 0) | (e.dead ? 2 : 0) | (e.baby ? 4 : 0) | (e.sheared ? 8 : 0) | (e.aiming ? 16 : 0) |
        (e.burning ? 32 : 0) | (e.attacking ? 64 : 0) | (e.provoked > 0 ? 128 : 0);
      return b.concat('m', e.type, r2(e.yaw), r2(e.bodyYaw), r2(e.headPitch), r2(e.limbSwing), r2(e.limbAmp), f, e.color | 0, r2(e.fuse), r2(e.deathTime), r2(e.grazing || 0));
    }
    if (e instanceof VC.ItemEntity) return b.concat('i', e.stack.id, e.stack.count, e.stack.dmg || 0);
    if (e instanceof VC.Arrow) return b.concat('a', r2(e.yaw), r2(e.pitch));
    if (e instanceof VC.Fireball) return b.concat('f');
    if (e instanceof VC.Thrown) return b.concat('t', e.itemId);
    if (e instanceof VC.Firework) return b.concat('w');
    if (e instanceof VC.PrimedTNT) return b.concat('n', r2(e.fuse));
    if (e instanceof VC.FallingBlock) return b.concat('b', e.state);
    return null;
  }
  function mpSendEntities() {
    for (const r of mpRemotesIn(game.dim)) {
      const list = [];
      for (const e of game.entities.list) {
        if (e.removed || (e.pos[0] - r.pos[0]) ** 2 + (e.pos[2] - r.pos[2]) ** 2 > 96 * 96) continue;
        const s = mpSnap(e);
        if (s) list.push(s);
      }
      mpSend({ t: 'e', d: game.dim, l: list }, r.id);
    }
  }

  const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  // Guest-side stand-in for a host entity: just follows the snapshots.
  function proxyUpdate(dt) {
    const t = this.net;
    this.age = (this.age || 0) + dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    const k = Math.min(1, dt * 12);
    const far = Math.abs(t.p[0] - this.pos[0]) + Math.abs(t.p[1] - this.pos[1]) + Math.abs(t.p[2] - this.pos[2]) > 8;
    for (let i = 0; i < 3; i++) this.pos[i] = far ? t.p[i] : this.pos[i] + (t.p[i] - this.pos[i]) * k;
    if (this instanceof VC.Mob) {
      this.yaw = lerpAng(this.yaw, t.yaw, k); this.bodyYaw = lerpAng(this.bodyYaw, t.by, k);
      this.headPitch += (t.hp - this.headPitch) * k;
      this.limbSwing += (t.ls - this.limbSwing) * k; this.limbAmp += (t.la - this.limbAmp) * k;
      if (this.dead) this.deathTime += dt;
    }
    if (this instanceof VC.Firework) game.fireworkTrail(this.pos);
  }
  function proxyHurt(amount, src) {
    if (this.dead || this.invuln > 0) return false;
    this.invuln = 0.5;
    this.hurtTime = 0.4;
    mpSend({ t: 'mh', id: this.netId, a: amount, s: src || null });
    VC.Sound.mob(this.type, 'hurt', this.center());
    return true;
  }
  function mpMakeProxy(a, w) {
    const [id, x, y, z, k] = a;
    let e = null;
    if (k === 'm' && VC.MOB_TYPES[a[5]]) { e = new VC.Mob(w, a[5], x, y, z); e.hurt = proxyHurt; }
    else if (k === 'i') e = new VC.ItemEntity(w, [x, y + 0.125, z], VC.stack(a[5], a[6], a[7]));
    else if (k === 'a') e = new VC.Arrow(w, 'host', [x, y, z], [0, 0, 1], 0);
    else if (k === 'f') e = new VC.Fireball(w, null, [x, y, z], [0, 0, 0]);
    else if (k === 't') e = new VC.Thrown(w, 'host', a[5], 'snowball', [x, y, z], [0, 0, 0]);
    else if (k === 'w') e = new VC.Firework(w, [x, y, z]);
    else if (k === 'n') e = new VC.PrimedTNT(w, x - 0.5, y, z - 0.5, a[5]);
    else if (k === 'b') e = new VC.FallingBlock(w, x - 0.5, y, z - 0.5, a[5]);
    if (!e) return null;
    e.netId = id;
    e.netProxy = true;
    e.update = proxyUpdate;
    e.net = { p: [x, y, z] };
    return e;
  }
  function mpApplyEntities(m) {
    if (mp.sim || m.d !== game.dim) return;
    const w = game.world, seen = new Set();
    const byId = new Map();
    for (const e of game.entities.list) if (e.netProxy) byId.set(e.netId, e);
    for (const a of m.l) {
      const [id, x, y, z, k] = a;
      seen.add(id);
      let e = byId.get(id);
      if (!e) { e = mpMakeProxy(a, w); if (!e) continue; game.entities.list.push(e); }
      e.net.p = [x, y, z];
      if (k === 'm') {
        const f = a[12];
        Object.assign(e.net, { yaw: a[6], by: a[7], hp: a[8], ls: a[9], la: a[10] });
        if ((f & 1) && e.hurtTime <= 0) { e.hurtTime = 0.4; if (e.invuln <= 0) VC.Sound.mob(e.type, 'hurt', e.center()); }
        if ((f & 2) && !e.dead) { e.dead = true; VC.Sound.mob(e.type, 'death', e.center()); }
        if (!!(f & 4) !== e.baby) e.setBaby(!!(f & 4));
        e.sheared = !!(f & 8); e.aiming = !!(f & 16); e.burning = !!(f & 32); e.attacking = !!(f & 64);
        e.provoked = f & 128 ? 40 : 0;
        e.color = a[13]; e.fuse = a[14]; if (e.dead) e.deathTime = Math.max(e.deathTime, a[15]); e.grazing = a[16];
      } else if (k === 'i') { e.stack = VC.stack(a[5], a[6], a[7]); }
      else if (k === 'a') { e.yaw = a[5]; e.pitch = a[6]; }
      else if (k === 'n') { e.fuse = a[5]; }
    }
    for (const e of game.entities.list) if (e.netProxy && !seen.has(e.netId)) e.removed = true;
  }

  // ----- Player state -----
  function mpMyState() {
    const p = game.player, a = avatar, s = p.held();
    return {
      d: game.dim, x: r2(p.pos[0]), y: r2(p.pos[1]), z: r2(p.pos[2]),
      yaw: r2(a.yaw), by: r2(a.bodyYaw), hp: r2(a.headPitch), ls: r2(a.limbSwing), la: r2(a.limbAmp),
      sw: r2(a.swing), sn: p.sneaking ? 1 : 0, us: a.using ? 1 : 0, h: s ? s.id : 0, ar: a.armor, el: a.elytra ? 1 : 0,
      wi: r2(a.wing), ti: r2(a.tilt), dd: p.dead ? 1 : 0, sl: p.sleeping ? 1 : 0, m: modeOf(p), hu: p.hurtTime > 0 ? 1 : 0, bw: a.bowing ? 1 : 0,
    };
  }
  function mpApplyState(r, st) {
    r.st = st;
    if (!r.ready || Math.hypot(st.x - r.pos[0], st.y - r.pos[1], st.z - r.pos[2]) > 16) r.pos = [st.x, st.y, st.z];
    r.target = [st.x, st.y, st.z];
    r.ready = true;
  }

  // Draws the other players (called from buildBatches). Returns extra skin batches.
  function mpDrawPlayers(w, ranges, blockRanges) {
    const out = [];
    for (const r of mp.players.values()) {
      if (!r.ready || r.st.d !== game.dim || r.spectator) continue;
      const st = r.st, av = r.av;
      if (r.target) for (let i = 0; i < 3; i++) r.pos[i] += (r.target[i] - r.pos[i]) * 0.3;
      av.pos = r.pos.slice();
      Object.assign(av, {
        yaw: st.yaw, bodyYaw: st.by, headPitch: st.hp, limbSwing: st.ls, limbAmp: st.la, swing: st.sw, sneaking: !!st.sn,
        using: !!st.us, bowing: !!st.bw, armor: st.ar || [null, null, null, null], elytra: !!st.el, wing: st.wi || 0, tilt: st.ti || 0, dead: !!st.dd,
      });
      av.deathTime = av.dead ? (av.deathTime || 0) + 0.016 : 0;
      av.skin = !!r.skinH;
      if (r.hitT > 0) r.hitT -= 0.016;
      const tint = av.dead || st.hu || r.hitT > 0 ? [1, 0, 0, 0.45] : null;
      if (r.skinH) {
        r.buf.n = 0;
        VC.Models.setSkinSize(r.skinH);
        VC.Models.mob(r.buf, av, w);
        VC.Models.setSkinSize(localSkinH);
        out.push({ tex: 'skin_' + r.id, buf: r.buf, ranges: [{ start: 0, count: r.buf.n, tint }] });
      }
      const start = bufs.mobs.n;
      if (!r.skinH) VC.Models.mob(bufs.mobs, av, w);
      VC.Models.armor(bufs.mobs, av, w);
      if (bufs.mobs.n > start) ranges.push({ start, count: bufs.mobs.n - start, tint });
      if (st.h && !st.sl) {
        const b0 = bufs.blocks.n;
        VC.Models.heldItem(bufs.blocks, bufs.items, av, w, st.h);
        if (bufs.blocks.n > b0) blockRanges.push({ start: b0, count: bufs.blocks.n - b0, tint: null });
      }
    }
    return out;
  }

  // Name tags: project the head position with the renderer's camera matrix.
  function mpNametags() {
    if (!mp.players.size) return;
    const m = renderer.vp, W = canvas.clientWidth, H = canvas.clientHeight;
    for (const r of mp.players.values()) {
      const vis = r.ready && r.st.d === game.dim && !r.spectator && !hudHidden;
      let shown = false;
      if (vis) {
        const x = r.pos[0], y = r.pos[1] + (r.sneaking ? 2.05 : 2.2), z = r.pos[2];
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        const d = Math.hypot(x - game.player.pos[0], z - game.player.pos[2]);
        if (cw > 0.1 && d < 64) {
          r.tag.style.left = ((cx / cw) * 0.5 + 0.5) * W + 'px';
          r.tag.style.top = (1 - ((cy / cw) * 0.5 + 0.5)) * H + 'px';
          shown = true;
        }
      }
      r.tag.style.display = shown ? '' : 'none';
    }
  }

  // ----- Containers & furnaces (last write wins) -----
  function mpOpenKey() {
    const ui = game.ui;
    if (ui.kind === 'chest' && ui.container && ui.container !== game.enderChest) {
      for (const [k, c] of game.containers) if (c === ui.container) return ['c', k, c.serialize()];
    }
    if (ui.kind === 'furnace' && ui.furnace) {
      for (const [k, f] of game.furnaces) if (f === ui.furnace) return ['f', k, f.serialize()];
    }
    return null;
  }
  function mpApplyContainer(m) {
    if (m.t === 'c') {
      let c = game.containers.get(m.k);
      if (!c) { c = new VC.Inventory(m.v.length); game.containers.set(m.k, c); }
      c.load(m.v);
    } else {
      const f = game.furnaces.get(m.k), n = VC.Furnace.load(m.v);
      if (f) Object.assign(f, n); else game.furnaces.set(m.k, n);
    }
    if (game.ui.kind && state === 'inventory' && !game.ui.drag) game.ui.render();
    const open = mpOpenKey();
    if (open && open[1] === m.k) mp.lastUi = JSON.stringify(open);
  }

  // ----- Per-frame network work -----
  function mpTick(dt) {
    if (!mp.room || !game.player) return;
    // Guests decide whether they mirror the host or simulate their own dimension.
    if (mp.guest) {
      const sim = game.dim !== mp.hostDim;
      if (sim !== mp.sim || mp.proxyDim !== game.dim) {
        mp.sim = sim;
        mp.proxyDim = game.dim;
        game.entities.list = game.entities.list.filter((e) => (sim ? !e.netProxy : e.local));
      }
    }
    if (mp.outBlocks.length) {
      mpSend(mp.guest ? { t: 'set', l: mp.outBlocks } : { t: 'b', l: mp.outBlocks });
      mp.outBlocks = [];
    }
    if ((mp.stateT += dt) >= 0.05) {
      mp.stateT = 0;
      const st = mpMyState();
      st.i = mp.guest ? mp.myId : 'host';
      mpSend({ t: 'p', st });
    }
    if (mp.host && (mp.entT += dt) >= 0.1) { mp.entT = 0; mpSendEntities(); }
    if (mp.host && (mp.timeT += dt) >= 1) {
      mp.timeT = 0;
      mpSend({ t: 'time', v: game.time, r: game.rules, df: game.difficulty, sp: game.spawn });
    }
    if (mp.host && (mp.furnT += dt) >= 3) {
      mp.furnT = 0;
      for (const [k, f] of game.furnaces) if (f.lit || f.input) mpSend({ t: 'f', k, v: f.serialize() });
    }
    if (mp.guest && (mp.pdT += dt) >= 5) { mp.pdT = 0; mpSend({ t: 'pd', v: mpMyData() }); }
    // Host measures each guest's round trip and shares the table (shown with TAB).
    if (mp.host && (mp.pingT += dt) >= 2) {
      mp.pingT = 0;
      const l = {};
      for (const r of mp.players.values()) {
        mpSend({ t: 'ping', ts: performance.now() }, r.id);
        if (r.ping !== undefined) l[r.id] = r.ping;
      }
      mpSend({ t: 'pings', l });
    }
    // Open chest / furnace: send our edits.
    if ((mp.uiT += dt) >= 0.2) {
      mp.uiT = 0;
      const open = state === 'inventory' ? mpOpenKey() : null;
      const key = open ? JSON.stringify(open) : '';
      if (open && key !== mp.lastUi) mpSend({ t: open[0], k: open[1], v: open[2] });
      mp.lastUi = key;
    }
  }

  // What the host stores for a guest between sessions.
  function mpMyData() {
    const p = game.player;
    return {
      pos: p.pos.map(r2), dim: game.dim, yaw: p.yaw, pitch: p.pitch, inv: p.inventory.serialize(), ender: game.enderChest.serialize(),
      health: p.health, food: p.food, sat: p.sat, mode: modeOf(p), spawn: game.spawn,
    };
  }

  // ----- Messages -----
  function mpOnMessage(from, m) {
    switch (m.t) {
      // --- both directions ---
      case 'chat':
        game.chat.print(m.m, m.c);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'fx':
        mpFx(m);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'c': case 'f':
        mpApplyContainer(m);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'cdel':
        game.containers.delete(m.k); game.furnaces.delete(m.k);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'p': {
        if (mp.host) {
          const g = mp.players.get(from);
          if (!g) break;
          m.st.i = from;
          mpApplyState(g, m.st);
          mp.room.broadcast(m, from);
        } else {
          const q = mp.players.get(m.st.i);
          if (q) mpApplyState(q, m.st);
          if (m.st.i === 'host') mp.hostDim = m.st.d;
        }
        break;
      }
      // --- guest -> host ---
      case 'hello': mpHostHello(from, m); break;
      case 'set':
        if (mp.host) mpApplyBlocks(m.l, false); // re-broadcast through onSet
        break;
      case 'spawn': {
        const g = mp.players.get(from);
        if (!mp.host || !g || g.st.d !== game.dim) break;
        const e = mpFromSpec(m.e, game.world);
        if (e) game.entities.add(e);
        break;
      }
      case 'mh': {
        if (!mp.host) break;
        const e = game.entities.list.find((q) => q.netId === m.id);
        if (e && e.hurt) e.hurt(m.a, m.s, game);
        break;
      }
      case 'mu': {
        if (!mp.host) break;
        const e = game.entities.list.find((q) => q.netId === m.id);
        if (!e) break;
        if (m.k === 'feed') e.feed(game);
        else if (m.k === 'shear') e.sheared = true;
        else if (m.k === 'dye') e.color = m.v;
        break;
      }
      case 'pd': {
        const g = mp.players.get(from);
        if (mp.host && g) game.guests[g.name] = m.v;
        break;
      }
      // --- host -> guest ---
      case 'welcome': mpGuestWelcome(m); break;
      case 'pinfo': {
        if (m.i === mp.myId) break;
        let q = mp.players.get(m.i);
        if (!q) { q = new Remote(m.i, m.n); mp.players.set(m.i, q); }
        q.setSkin(m.skin);
        break;
      }
      case 'leave': {
        const q = mp.players.get(m.i);
        if (q) { q.remove(); mp.players.delete(m.i); }
        break;
      }
      case 'b': mpApplyBlocks(m.l, true); break;
      case 'e': mpApplyEntities(m); break;
      case 'time':
        game.time = m.v;
        game.rules = m.r;
        game.spawn = m.sp || game.spawn;
        if (m.df !== game.difficulty) setDifficulty(m.df);
        break;
      case 'ping': mpSend({ t: 'pong', ts: m.ts }); break;
      case 'pong': {
        const g = mp.players.get(from);
        if (mp.host && g) g.ping = Math.round(performance.now() - m.ts);
        break;
      }
      case 'pings':
        for (const [id, ms] of Object.entries(m.l)) {
          if (id === mp.myId) mp.myPing = ms;
          const q = mp.players.get(id);
          if (q) q.ping = ms;
        }
        break;
      case 'bp': case 'be': case 'bd': case 'bx':
        buildNet(m);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'chest':
        if (m.d === game.dim) chestViewer(m.x, m.y, m.z, m.o, false);
        if (mp.host) mp.room.broadcast(m, from);
        break;
      case 'tpto': {
        if (!mp.host) break;
        const tp = Object.assign({}, m, { t: 'tp' });
        if (m.to === 'host') mpOnMessage(from, tp);
        else mp.room.send(m.to, tp);
        break;
      }
      case 'tp':
        mpTeleportSelf(m.p, m.d);
        if (m.by && m.by !== playerName()) game.chat.info(`${m.by} te ha teletransportado`);
        break;
      case 'pvp': {
        if (!mp.host) break;
        const hit = Object.assign({}, m, { t: 'hurt' });
        if (m.to === 'host') mpOnMessage(from, hit);
        else mp.room.send(m.to, hit);
        break;
      }
      case 'hurt': {
        const p = game.player, ds = p.damageScale;
        if (!ds) p.damageScale = 1; // Peaceful only removes monsters, players can still hit
        p.hurt(m.a, m.s, m.k, m.c || 'murió', m.ar);
        p.damageScale = ds;
        break;
      }
      case 'give': {
        const p = game.player;
        const left = p.inventory.add(m.s[0], m.s[1], m.s[2]);
        if (left < m.s[1]) game.onPickup();
        if (left > 0) {
          // Inventory full: drop it, but not straight back into our hands.
          const it = new VC.ItemEntity(game.world, p.center(), VC.stack(m.s[0], left, m.s[2]), [0, 2, 0]);
          it.pickupDelay = 5;
          game.entities.add(it);
        }
        break;
      }
      case 'kick':
        mpLeave(m.m || 'Desconectado por el anfitrión');
        break;
    }
  }

  // Host: a guest said hello -> send it the world.
  function mpHostHello(from, m) {
    if (m.v !== NET_VERSION) { mp.room.send(from, { t: 'kick', m: 'Versión del juego distinta a la del anfitrión' }); return; }
    let name = String(m.name || 'Jugador').slice(0, 16).replace(/[<>]/g, '') || 'Jugador';
    const taken = () => name === playerName() || [...mp.players.values()].some((q) => q.name === name);
    for (let n = 2; taken(); n++) name = String(m.name).slice(0, 13) + n;
    const g = new Remote(from, name);
    g.skinUrl = m.skin || null;
    g.setSkin(g.skinUrl);
    mp.players.set(from, g);
    const containers = {}, furnaces = {};
    for (const [k, c] of game.containers) containers[k] = c.serialize();
    for (const [k, f] of game.furnaces) furnaces[k] = f.serialize();
    mp.room.send(from, {
      t: 'welcome', id: from, name, seed: game.dims.overworld.world.seed, type: game.worldType,
      build: game.build ? game.build.serialize() : undefined,
      edits: game.dims.overworld.world.serializeEdits(),
      netherEdits: game.dims.nether ? game.dims.nether.world.serializeEdits() : undefined,
      time: game.time, rules: game.rules, difficulty: game.difficulty, spawn: game.spawn, portals: game.portals,
      containers, furnaces, mode: modeOf(game.player) === 'spectator' ? 'creative' : modeOf(game.player),
      you: game.guests[name] || null, hostDim: game.dim,
    });
    // Introduce everybody to everybody.
    mp.room.send(from, { t: 'pinfo', i: 'host', n: playerName(), skin: mySkinUrl });
    for (const q of mp.players.values()) {
      if (q === g) continue;
      mp.room.send(from, { t: 'pinfo', i: q.id, n: q.name, skin: q.skinUrl });
    }
    mp.room.broadcast({ t: 'pinfo', i: from, n: name, skin: g.skinUrl }, from);
    mpInfo(`${name} se ha unido a la partida`);
  }

  // Guest: the host's world arrived -> start playing it.
  function mpGuestWelcome(m) {
    mp.myId = m.id;
    mp.myName = m.name;
    mp.hostDim = m.hostDim;
    const you = m.you;
    const save = {
      v: 3, type: m.type || undefined, build: m.build, seed: m.seed, edits: m.edits, netherEdits: m.netherEdits, time: m.time, rules: m.rules, difficulty: m.difficulty,
      spawn: (you && you.spawn) || m.spawn, portals: m.portals, containers: m.containers, furnaces: m.furnaces,
      mode: you ? you.mode : m.mode, dim: you ? you.dim : 'overworld',
      player: you ? { pos: you.pos, yaw: you.yaw, pitch: you.pitch, health: you.health, food: you.food, sat: you.sat, air: 15 } : { pos: m.spawn.slice(), yaw: 0, pitch: 0 },
      inv: you ? you.inv : null, ender: you ? you.ender : null,
    };
    const players = mp.players;
    startWorld(save);
    mp.players = players; // startWorld -> closeWorld must not forget who is here
    if (m.name !== (settings.name || 'Jugador').slice(0, 16)) game.chat.info(`Tu nombre en esta sala es ${m.name}`);
    game.chat.info(`Conectado a la sala ${mp.room.code}`);
  }

  async function mpHost() {
    if (mp.room || !game.world) return;
    $('room-info').textContent = 'Abriendo sala...';
    $('btn-host').disabled = true;
    const room = new VC.Net.Room();
    try {
      await room.host();
    } catch (e) {
      $('room-info').textContent = 'No se pudo abrir la sala: ' + e.message;
      $('btn-host').disabled = false;
      return;
    }
    mp.room = room; mp.host = true; mp.guest = false;
    room.onmessage = mpOnMessage;
    room.onleave = (id) => {
      const g = mp.players.get(id);
      if (!g) return;
      g.remove();
      mp.players.delete(id);
      room.broadcast({ t: 'leave', i: id });
      mpInfo(`${g.name} ha abandonado la partida`);
    };
    room.onclose = () => {};
    mpRoomInfo();
    game.chat.info(`Sala abierta. Código: ${room.code}`);
  }

  function mpRoomInfo() {
    const el = $('room-info');
    $('btn-host').classList.toggle('hidden', !!mp.room);
    $('btn-host').disabled = false;
    $('btn-quit').textContent = mp.guest ? 'Salir de la sala' : 'Guardar y salir al título';
    if (!mp.room) { el.textContent = ''; return; }
    el.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = mp.room.code;
    el.append(mp.host ? 'Sala abierta · código ' : 'En la sala ', b, mp.host ? ' (clic para copiar)' : '');
  }
  $('room-info').addEventListener('click', () => { if (mp.room && navigator.clipboard) navigator.clipboard.writeText(mp.room.code).catch(() => {}); });

  async function mpJoin() {
    const name = $('join-name').value.trim().slice(0, 16) || 'Jugador';
    const code = VC.Net.normCode($('join-code').value);
    settings.name = name;
    saveSettings();
    const status = $('join-status');
    if (!code) { status.textContent = 'Escribe el código de la sala.'; return; }
    status.textContent = 'Conectando...';
    $('btn-join-go').disabled = true;
    const room = new VC.Net.Room();
    try {
      mp.hostLink = await room.join(code);
    } catch (e) {
      status.textContent = e.message;
      $('btn-join-go').disabled = false;
      return;
    }
    $('btn-join-go').disabled = false;
    mp.room = room; mp.guest = true; mp.host = false; mp.sim = false; mp.proxyDim = null;
    mp.players = new Map();
    mpRoomInfo();
    room.onmessage = mpOnMessage;
    room.onclose = (reason) => mpLeave(reason || 'Se cerró la sala');
    status.textContent = 'Descargando el mundo...';
    room.send(mp.hostLink, { t: 'hello', v: NET_VERSION, name, skin: mySkinUrl });
  }

  // Leaves the room (and, for guests, the world). reason: shown on the join screen.
  function mpLeave(reason) {
    if (!mp.room) return;
    const wasGuest = mp.guest, room = mp.room;
    if (wasGuest) mpSend({ t: 'pd', v: mpMyData() });
    mp.room = null;
    setTimeout(() => room.close(), 200); // let the last message go out
    for (const q of mp.players.values()) q.remove();
    mp.players.clear();
    mp.host = mp.guest = false;
    mp.myName = null;
    mp.sim = true;
    mp.outBlocks = [];
    mpRoomInfo();
    if (wasGuest) {
      if (game.world) closeWorld(false);
      $('join-status').textContent = reason || '';
      $('btn-join-go').disabled = false;
      setState(reason ? 'join' : 'menu');
    }
  }

  // ---------- Minigames ----------
  function openMinigames() {
    $('btn-sky-continue').disabled = !localStorage.getItem(VC.Minigames.TYPES.skyblock.saveKey);
    $('btn-build-continue').disabled = !localStorage.getItem(VC.Minigames.TYPES.build.saveKey);
    setState('minigames');
  }
  for (const [id, type] of [['btn-build-continue', 'build']]) {
    $(id).addEventListener('click', () => {
      const raw = localStorage.getItem(VC.Minigames.TYPES[type].saveKey);
      if (raw) startWorld(JSON.parse(raw));
    });
  }
  $('btn-build-new').addEventListener('click', () => {
    const t = VC.Minigames.TYPES.build;
    localStorage.removeItem(t.saveKey);
    startWorld(t.create((Math.random() * 2147483647) | 0));
    saveWorld();
  });
  $('btn-minigames').addEventListener('click', openMinigames);
  $('btn-minigames-back').addEventListener('click', () => setState('menu'));
  $('btn-sky-continue').addEventListener('click', () => {
    const raw = localStorage.getItem(VC.Minigames.TYPES.skyblock.saveKey);
    if (raw) startWorld(JSON.parse(raw));
  });
  $('btn-sky-new').addEventListener('click', () => {
    const t = VC.Minigames.TYPES.skyblock;
    localStorage.removeItem(t.saveKey);
    startWorld(t.create((Math.random() * 2147483647) | 0));
    saveWorld();
  });

  $('btn-host').addEventListener('click', mpHost);
  $('btn-join').addEventListener('click', () => {
    $('join-name').value = settings.name || '';
    $('join-status').textContent = 'Pide el código al anfitrión (Menú del juego → Abrir sala online).';
    setState('join');
    $(settings.name ? 'join-code' : 'join-name').focus();
  });
  $('btn-join-go').addEventListener('click', mpJoin);
  $('btn-join-cancel').addEventListener('click', () => setState('menu'));
  for (const id of ['join-name', 'join-code']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') mpJoin(); });
  window.addEventListener('beforeunload', () => { if (mp.room) mpLeave(); });

  // ---------- Player list (hold TAB) ----------
  let listShown = false, listT = 0;
  function pingCell(ms) {
    if (ms === null || ms === undefined) return ['…', '#aaa'];
    return [ms + ' ms', ms < 80 ? '#55ff55' : ms < 200 ? '#ffff55' : ms < 400 ? '#ffaa00' : '#ff5555'];
  }
  function renderPlayerList() {
    const el = $('playerlist');
    el.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'pl-title';
    title.textContent = mp.room ? `Sala ${mp.room.code} · ${mp.players.size + 1} jugador${mp.players.size ? 'es' : ''}` : 'Un jugador';
    el.appendChild(title);
    const rows = [];
    const me = { name: playerName(), you: true, host: mp.host || !mp.room, ping: mp.guest ? mp.myPing : null };
    rows.push(me);
    for (const r of mp.players.values()) rows.push({ name: r.name, host: r.id === 'host', ping: r.id === 'host' ? null : r.ping });
    rows.sort((a, b) => (b.host - a.host) || a.name.localeCompare(b.name));
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'pl-row' + (r.you ? ' you' : '');
      const n = document.createElement('span');
      n.textContent = r.name + (r.host && mp.room ? ' (anfitrión)' : '');
      const pg = document.createElement('span');
      pg.className = 'pl-ping';
      if (r.host) { pg.textContent = mp.room ? '—' : ''; pg.style.color = '#aaa'; }
      else { const [t, c] = pingCell(r.ping); pg.textContent = t; pg.style.color = c; }
      row.append(n, pg);
      el.appendChild(row);
    }
  }
  function updatePlayerList(dt) {
    const show = listShown && (state === 'playing' || state === 'paused') && !hudHidden;
    $('playerlist').classList.toggle('hidden', !show);
    if (show && (listT -= dt) <= 0) { listT = 0.25; renderPlayerList(); }
  }

  // ---------- Input ----------
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (locked) {
      setState('playing');
    } else if (state === 'playing') {
      releaseAll();
      setState('paused');
      saveWorld();
    }
  });

  // Raw device state -> remappable actions. Codes: KeyboardEvent.code or 'Mouse0/1/2'.
  const rawDown = new Set();
  const isDown = (action) => rawDown.has(settings.keys[action]);
  const actionsFor = (code) => Object.keys(settings.keys).filter((a) => settings.keys[a] === code);
  function moveKeys() {
    return {
      forward: isDown('forward'), back: isDown('back'), left: isDown('left'), right: isDown('right'),
      jump: isDown('jump'), sneak: isDown('sneak'), sprint: isDown('sprint'),
    };
  }
  function releaseAll() {
    rawDown.clear();
    mouse.left = mouse.right = false;
    input.sprintTap = false;
    use = null;
  }

  const SPECTATOR_ACTIONS = new Set(['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint', 'attack', 'chat', 'command', 'perspective', 'debug', 'hideHud']);
  function pressAction(code, e) {
    const p = game.player, now = performance.now();
    if (buildActive() && buildPress(actionsFor(code))) return;
    for (const a of actionsFor(code)) {
      if (p.spectator) {
        if (!SPECTATOR_ACTIONS.has(a)) continue;
        if (a === 'attack') {
          // Click a mob to see through its eyes.
          const hitE = game.entities.raycast(p.eye(), p.forward(), 30);
          if (hitE) { spectating = hitE.mob; game.chat.info(`Viendo como: ${hitE.mob.def.name} (Mayús para salir)`); }
          continue;
        }
        if (a === 'sneak' && spectating) { p.pos = spectating.pos.slice(); spectating = null; continue; }
      }
      switch (a) {
        case 'jump':
          if (!p.spectator && p.startGlide()) { lastSpace = now; break; }
          if (p.creative) {
            if (now - lastSpace < 300) { p.flying = !p.flying; p.vel[1] = 0; lastSpace = 0; } else lastSpace = now;
          }
          break;
        case 'forward':
          if (now - lastW < 300) input.sprintTap = true;
          lastW = now;
          break;
        case 'attack':
          mouse.left = true; mouse.leftT = 0;
          if (attack()) break;
          swingT = 0;
          if (p.creative) { const hit = pick(); if (hit) harvest(hit); }
          break;
        case 'use': mouse.right = true; mouse.rightT = 0; useItem(); break;
        case 'pick': pickBlock(); break;
        case 'drop': dropHeld(e && e.ctrlKey); break;
        case 'inventory': openContainer(p.creative ? 'creative' : 'inventory'); return;
        case 'chat': openChat(''); return;
        case 'command': openChat('/'); return;
        case 'perspective': perspective = (perspective + 1) % 3; break;
        case 'debug': $('debug').classList.toggle('hidden'); break;
        case 'hideHud': hudHidden = !hudHidden; setState(state); break;
        default:
          if (a.startsWith('hotbar')) selectSlot(+a.slice(6) - 1);
      }
    }
  }

  function releaseAction(code) {
    if (buildActive()) buildRelease(actionsFor(code));
    for (const a of actionsFor(code)) {
      if (a === 'attack') { mouse.left = false; mining.progress = 0; }
      if (a === 'use') { mouse.right = false; if (game.player) releaseUse(); }
      if (a === 'forward') input.sprintTap = false;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (rebinding) { e.preventDefault(); finishRebind(e.code === 'Escape' ? null : e.code); return; }
    if (['F1', 'F3', 'F5', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'Tab' && state === 'playing') { listShown = true; listT = 0; }
    if (state === 'inventory') {
      if (e.code === settings.keys.inventory || e.code === 'Escape') { closeContainer(); return; }
      for (let i = 1; i <= 9; i++) if (e.code === settings.keys['hotbar' + i]) { game.ui.hotkey(i - 1); return; }
      if (e.code === settings.keys.drop) game.ui.dropHover(e.ctrlKey);
      return;
    }
    if (state !== 'playing') return;
    if (e.code === 'Space' || Object.values(settings.keys).includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    // "/" typed with a layout where it needs Shift (e.g. Spanish Shift+7).
    if (e.key === '/' && e.code !== settings.keys.command) { openChat('/'); return; }
    if (e.code === 'Enter') { openChat(''); return; }
    rawDown.add(e.code);
    pressAction(e.code, e);
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') listShown = false;
    rawDown.delete(e.code);
    releaseAction(e.code);
  });
  window.addEventListener('blur', () => { releaseAll(); listShown = false; });

  document.addEventListener('mousemove', (e) => {
    if (state !== 'playing') return;
    const s = 0.0022 * settings.sens / 100 * zoomFactor(), p = game.player;
    p.yaw -= e.movementX * s;
    p.pitch -= e.movementY * s * (settings.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.001;
    if (p.pitch > lim) p.pitch = lim;
    if (p.pitch < -lim) p.pitch = -lim;
  });

  document.addEventListener('mousedown', (e) => {
    if (rebinding) { e.preventDefault(); finishRebind('Mouse' + e.button); return; }
    if (state !== 'playing' || e.target !== canvas) return;
    if (e.button === 1) e.preventDefault();
    const code = 'Mouse' + e.button;
    rawDown.add(code);
    pressAction(code, e);
  });
  document.addEventListener('mouseup', (e) => {
    const code = 'Mouse' + e.button;
    rawDown.delete(code);
    releaseAction(code);
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (state !== 'playing') return;
    const p = game.player;
    if (p.spectator) {
      p.specSpeed = Math.max(0.1, Math.min(5, p.specSpeed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      const el = $('hotbar-name');
      el.textContent = `Velocidad de vuelo: ${Math.round(p.specSpeed * 100)}%`;
      el.style.opacity = 1;
      nameTimer = 1.5;
      return;
    }
    if (buildActive() && (bm.mode || bm.edit)) { buildExit(); return; }
    selectSlot(p.sel + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  window.addEventListener('beforeunload', () => saveWorld());

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * (settings.gfx.renderScale || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();
  applyGfx(null);

  // ---------- Per-frame interaction ----------
  function updateInteraction(dt) {
    const p = game.player;
    if (swingT < 1) swingT = Math.min(1, swingT + dt / 0.3);

    if (mouse.left) {
      if (p.creative) {
        if ((mouse.leftT += dt) >= 0.25) { mouse.leftT = 0; const hit = pick(); if (hit) { harvest(hit); swingT = 0; } }
      } else if (mining.cd > 0) {
        mining.cd -= dt;
      } else {
        const hit = pick();
        if (!hit) mining.progress = 0;
        else {
          if (hit.x !== mining.x || hit.y !== mining.y || hit.z !== mining.z) {
            mining.x = hit.x; mining.y = hit.y; mining.z = hit.z; mining.progress = 0;
          }
          mining.progress += dt / breakTime(hit.id);
          if ((mining.hitT = (mining.hitT || 0) + dt) >= 0.25) { mining.hitT = 0; VC.Sound.hit(hit.id, [hit.x + 0.5, hit.y + 0.5, hit.z + 0.5]); }
          if (swingT >= 1) swingT = 0;
          if (mining.progress >= 1) { harvest(hit); mining.progress = 0; mining.cd = 0.25; }
        }
      }
    }

    if (mouse.right && !use && (mouse.rightT += dt) >= 0.25) {
      mouse.rightT = 0;
      const s = p.held(), it = s && VC.item(s.id);
      if (s && VC.placeState(s.id) !== null && !(it && (it.food || it.bow || it.drink))) placeBlock();
    }

    if (use) {
      use.t += dt;
      if (use.type === 'eat' && use.t > 0.3 && (use.crunch = (use.crunch || 0) + dt) >= 0.22) { use.crunch = 0; VC.Sound.eat(); }
      const s = p.held(), it = s && VC.item(s.id);
      if (use.type === 'drink' && use.t > 0.3 && (use.gulp = (use.gulp || 0) + dt) >= 0.3) { use.gulp = 0; VC.Sound.drink(); }
      if (!it || (use.type === 'eat' && !it.food) || (use.type === 'bow' && !it.bow) || (use.type === 'drink' && !it.drink)) use = null;
      else if ((use.type === 'eat' || use.type === 'drink') && use.t >= 1.6) {
        if (it.food) p.eat(it);
        if (s.id === I.MILK) p.fireT = 0;
        VC.Sound.burp();
        if (!p.creative) {
          const ret = it.bowl ? I.BOWL : s.id === I.MILK ? I.BUCKET : s.id === I.POTION ? I.GLASS_BOTTLE : 0;
          if (--s.count <= 0) p.inventory.slots[p.sel] = ret ? VC.stack(ret, 1) : null;
          else if (ret && p.inventory.add(ret, 1) > 0) game.throwStack(VC.stack(ret, 1));
        }
        p.inventory.changed();
        use = mouse.right && use.type === 'eat' && (p.creative || p.food < 20) && p.held() && VC.item(p.held().id).food ? { type: 'eat', t: 0 } : null;
      }
    }
    input.slow = !!use;
  }

  // ---------- Camera ----------
  function cameraFor(p) {
    const e = p.eye();
    if (p.sleeping) return { eye: e, yaw: p.yaw, pitch: 0.3, underwater: false };
    if (spectating) {
      p.pos = [spectating.pos[0], spectating.pos[1] + spectating.eyeHeight() - p.eyeHeight(), spectating.pos[2]];
      return { eye: spectating.eye(), yaw: spectating.yaw, pitch: spectating.headPitch || 0, underwater: false };
    }
    if (perspective === 0) return { eye: e, yaw: p.yaw, pitch: p.pitch, underwater: p.eyeInWater };
    const f = p.forward(), sign = perspective === 1 ? -1 : 1;
    // Pull the camera back until it would hit a block.
    let d = 4;
    for (let t = 0.1; t <= 4; t += 0.05) {
      const x = e[0] + f[0] * t * sign, y = e[1] + f[1] * t * sign, z = e[2] + f[2] * t * sign;
      let blocked = false;
      for (const [ox, oy, oz] of [[0, 0, 0], [0.15, 0.15, 0.15], [-0.15, -0.15, -0.15], [0.15, -0.15, -0.15], [-0.15, 0.15, 0.15]]) {
        const id = game.world.getBlock(Math.floor(x + ox), Math.floor(y + oy), Math.floor(z + oz));
        if (P.opaque[id] || (P.solid[id] && !P.cross[id])) { blocked = true; break; }
      }
      if (blocked) { d = Math.max(0.2, t - 0.2); break; }
    }
    const eye = [e[0] + f[0] * d * sign, e[1] + f[1] * d * sign, e[2] + f[2] * d * sign];
    const id = game.world.getBlock(Math.floor(eye[0]), Math.floor(eye[1]), Math.floor(eye[2]));
    return {
      eye,
      yaw: perspective === 1 ? p.yaw : p.yaw + Math.PI,
      pitch: perspective === 1 ? p.pitch : -p.pitch,
      underwater: P.liquid[id] ? (VC.isLava(id) ? 'lava' : 'water') : false,
    };
  }

  // Animation state for the player model (third person).
  const avatar = {
    type: 'player', pos: [0, 0, 0], yaw: 0, bodyYaw: 0, headPitch: 0, limbSwing: 0, limbAmp: 0,
    age: 0, dead: false, deathTime: 0, fuse: 0, swing: 0, sneaking: false, using: false, armor: [null, null, null, null],
    elytra: false, wing: 0, tilt: 0,
    center() { return [this.pos[0], this.pos[1] + 0.9, this.pos[2]]; },
  };
  function updateAvatar(dt) {
    const p = game.player, a = avatar;
    a.pos = p.pos.slice();
    a.yaw = p.yaw;
    a.headPitch = p.pitch;
    const h = Math.hypot(p.vel[0], p.vel[2]);
    if (h > 0.5) {
      const moveYaw = Math.atan2(-p.vel[0], -p.vel[2]);
      const d = Math.atan2(Math.sin(moveYaw - a.bodyYaw), Math.cos(moveYaw - a.bodyYaw));
      a.bodyYaw += d * Math.min(1, dt * 6);
    }
    // The head may turn at most ~50 degrees away from the body.
    const diff = Math.atan2(Math.sin(a.yaw - a.bodyYaw), Math.cos(a.yaw - a.bodyYaw));
    if (Math.abs(diff) > 0.9) a.bodyYaw = a.yaw - Math.sign(diff) * 0.9;
    a.limbSwing = p.walkDist * 2.2;
    a.limbAmp += ((p.onGround ? Math.min(1, h / 3) : 0) - a.limbAmp) * Math.min(1, dt * 8);
    a.age += dt;
    a.swing = swingT < 1 ? swingT : 0;
    a.sneaking = p.sneaking;
    a.using = !!use;
    a.bowing = !!(use && use.type === 'bow');
    a.dead = p.dead;
    a.deathTime = p.dead ? a.deathTime + dt : 0;
    a.elytra = false;
    for (let i = 0; i < 4; i++) {
      const s = p.inventory.slots[36 + i], it = s && VC.item(s.id);
      if (it && it.elytra) a.elytra = true;
      a.armor[i] = it && it.armor && !it.elytra ? it.armor.material : null;
    }
    // Gliding: body leans along the look direction, wings spread.
    const k = Math.min(1, dt * 8);
    a.wing += ((p.gliding ? 1 : 0) - a.wing) * k;
    a.tilt += ((p.gliding ? Math.PI / 2 - p.pitch : 0) - a.tilt) * k;
    if (p.gliding) a.bodyYaw = p.yaw;
    a.headPitch = p.pitch + a.tilt;
  }

  // ---------- Entity rendering batches ----------
  const bufs = {
    mobs: VC.Models.makeBuf(), blocks: VC.Models.makeBuf(), items: VC.Models.makeBuf(), crack: VC.Models.makeBuf(),
    handB: VC.Models.makeBuf(), handI: VC.Models.makeBuf(), handM: VC.Models.makeBuf(), skin: VC.Models.makeBuf(), handS: VC.Models.makeBuf(),
  };
  function buildBatches(eye, dt) {
    for (const k in bufs) bufs[k].n = 0;
    const ranges = [];
    const w = game.world;
    updateAvatar(dt);
    const blockRanges = [];
    let skinTint = null;
    if ((perspective !== 0 || game.player.sleeping) && !game.player.spectator) {
      avatar.skin = game.skin;
      const tint = game.player.hurtTime > 0 || game.player.dead ? [1, 0, 0, 0.45] : null;
      const start = bufs.mobs.n;
      if (game.skin) { VC.Models.mob(bufs.skin, avatar, w); skinTint = tint; }
      else VC.Models.mob(bufs.mobs, avatar, w);
      VC.Models.armor(bufs.mobs, avatar, w);
      if (bufs.mobs.n > start) ranges.push({ start, count: bufs.mobs.n - start, tint });
      const held = game.player.held(), bStart = bufs.blocks.n;
      if (held && !game.player.sleeping) VC.Models.heldItem(bufs.blocks, bufs.items, avatar, w, held.id);
      if (bufs.blocks.n > bStart) blockRanges.push({ start: bStart, count: bufs.blocks.n - bStart, tint: null });
    }
    const remoteSkins = mpDrawPlayers(w, ranges, blockRanges);
    drawChestLids(w, dt, blockRanges);
    const overlays = buildDraw(eye, blockRanges);
    const shadows = entityShadows(eye);
    if (shadows) overlays.unshift(shadows);
    for (const e of game.entities.list) {
      if (e === spectating) continue;
      const dx = e.pos[0] - eye[0], dz = e.pos[2] - eye[2];
      if (dx * dx + dz * dz > settings.renderDist * settings.renderDist * 256) continue;
      if (e instanceof VC.Mob) {
        const start = bufs.mobs.n;
        VC.Models.mob(bufs.mobs, e, w);
        let tint = null;
        if (e.hurtTime > 0 || e.dead) tint = [1, 0, 0, 0.45];
        else if (e.fuse > 0 && Math.floor(e.fuse * 8) % 2 === 0) tint = [1, 1, 1, 0.6];
        else if (e.burning) tint = [1, 0.45, 0.05, 0.25 + 0.15 * Math.sin(totalTime * 20)];
        ranges.push({ start, count: bufs.mobs.n - start, tint });
      } else if (e instanceof VC.Arrow) {
        const start = bufs.mobs.n;
        VC.Models.arrow(bufs.mobs, e, w);
        ranges.push({ start, count: bufs.mobs.n - start, tint: null });
      } else if (e instanceof VC.ItemEntity) {
        const start = bufs.blocks.n;
        VC.Models.droppedItem(bufs.blocks, bufs.items, e, w, totalTime);
        blockRanges.push({ start, count: bufs.blocks.n - start, tint: null });
      } else if (e instanceof VC.FallingBlock) {
        const start = bufs.blocks.n;
        VC.Models.blockEntity(bufs.blocks, e.pos, e.state, w);
        blockRanges.push({ start, count: bufs.blocks.n - start, tint: null });
      } else if (e instanceof VC.PrimedTNT) {
        const start = bufs.blocks.n, k = e.fuse < 1 ? 1 + (1 - e.fuse) * 0.15 : 1;
        VC.Models.blockEntity(bufs.blocks, [e.pos[0], e.pos[1] - (k - 1) / 2, e.pos[2]], B.TNT, w, k);
        blockRanges.push({ start, count: bufs.blocks.n - start, tint: Math.floor(e.fuse * 4) % 2 === 0 ? [1, 1, 1, 0.6] : null });
      } else if (e instanceof VC.Fireball) {
        VC.Models.billboard(bufs.items, e.pos, VC.SPRITE_INDEX.fireball, 0.5, game.player.yaw, [1, 1]);
      } else if (e instanceof VC.Thrown) {
        VC.Models.thrown(bufs.items, e, w, game.player.yaw);
      } else if (e instanceof VC.Firework) {
        // A rocket on the player's back would cover the first-person view.
        if (!e.rider || perspective !== 0) VC.Models.thrown(bufs.items, e, w, game.player.yaw);
      }
    }
    const camYaw = perspective === 2 ? game.player.yaw + Math.PI : game.player.yaw;
    const FULL = [1, 1];
    for (const pt of game.particles) {
      if (pt.twinkle && pt.life < pt.max * 0.6 && Math.random() < 0.45) continue;
      const size = pt.fade && pt.max ? pt.size * (0.35 + 0.65 * pt.life / pt.max) : pt.size;
      VC.Models.billboard(bufs.items, pt.pos, pt.sprite, size, camYaw, pt.bright ? FULL : VC.Models.lightAt(w, pt.pos));
    }
    const batches = [
      { tex: 'mobs', buf: bufs.mobs, ranges },
      { tex: 'blocks', buf: bufs.blocks, ranges: blockRanges },
      { tex: 'items', buf: bufs.items },
    ];
    if (game.skin && bufs.skin.n) batches.push({ tex: 'skin', buf: bufs.skin, ranges: [{ start: 0, count: bufs.skin.n, tint: skinTint }] });
    batches.push(...remoteSkins);
    let crack = null;
    if (mining.progress > 0 && mouse.left && !game.player.creative) {
      VC.Models.crack(bufs.crack, mining.x, mining.y, mining.z, Math.min(9, Math.floor(mining.progress * 10)), w, target && target.box);
      crack = { tex: 'blocks', buf: bufs.crack };
    }
    let hand = null;
    if (!hudHidden && perspective === 0 && !game.player.spectator && (state === 'playing' || state === 'inventory' || state === 'paused' || state === 'chat')) {
      const p = game.player;
      const light = VC.Models.lightAt(w, eye);
      let useAnim = 0;
      if (use && (use.type === 'eat' || use.type === 'drink')) useAnim = Math.abs(Math.sin(use.t * 12)) * 0.5 + 0.5;
      if (use && use.type === 'bow') useAnim = Math.min(1, use.t);
      const pull = use && use.type === 'bow' ? VC.SPRITE_INDEX['bow_pulling_' + (use.t < 0.3 ? 0 : use.t < 0.75 ? 1 : 2)] : undefined;
      VC.Models.hand(bufs.handB, bufs.handI, bufs.handM, { eye, yaw: p.yaw, pitch: p.pitch }, p.held(), swingT >= 1 ? 0 : swingT, useAnim, light, game.skin ? bufs.handS : null, pull);
      hand = [{ tex: 'blocks', buf: bufs.handB }, { tex: 'items', buf: bufs.handI }, { tex: 'mobs', buf: bufs.handM }];
      if (game.skin) hand.push({ tex: 'skin', buf: bufs.handS });
    }
    return { batches, crack, hand, overlays };
  }

  // ---------- Debug overlay ----------
  const FACING = ['Norte (hacia -Z)', 'Oeste (hacia -X)', 'Sur (hacia +Z)', 'Este (hacia +X)'];
  function debugText(fps) {
    const world = game.world, player = game.player;
    const p = player.pos, bx = Math.floor(p[0]), by = Math.floor(p[1]), bz = Math.floor(p[2]);
    const yaw = ((player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const facing = FACING[Math.round(yaw / (Math.PI / 2)) % 4];
    const col = world.gen.column(bx, bz);
    let meshed = 0;
    for (const ch of world.chunks.values()) if (ch.mesh) meshed++;
    let mobs = 0;
    for (const e of game.entities.list) if (e instanceof VC.Mob) mobs++;
    const lines = [
      `Vibecraft 1.8 (${fps} fps)`,
      `C: ${renderer.stats.drawn}/${meshed} visibles, ${world.chunks.size} cargados`,
      `E: ${mobs} mobs, ${game.entities.list.length} entidades · agua ${world.waterQ.size} · lava ${world.lavaQ.size}`,
      '',
      `XYZ: ${p[0].toFixed(3)} / ${p[1].toFixed(5)} / ${p[2].toFixed(3)}`,
      `Bloque: ${bx} ${by} ${bz}`,
      `Chunk: ${bx & 15} ${by} ${bz & 15} en ${bx >> 4} ${bz >> 4}`,
      `Mirando: ${facing}`,
      `Dimensión: ${game.dim === 'nether' ? 'Nether' : 'Mundo normal'} · Bioma: ${VC.BIOME_NAMES[col.biome]}`,
      `Luz: ${world.getSky(bx, by + 1, bz)} cielo, ${world.getBlockLight(bx, by + 1, bz)} bloque`,
      `Hora: ${Math.floor(game.time % 24000)} (día ${Math.floor(game.time / 24000) + 1})`,
      `Semilla: ${world.seed}`,
      `Modo: ${VC.MODE_NAMES[modeOf(player)]}${player.flying ? ', volando' : ''}${player.sprinting ? ', corriendo' : ''}${spectating ? ', viendo ' + spectating.def.name : ''}`,
      player.creative || player.spectator ? '' : `Vida ${player.health} · Hambre ${player.food} · Saturación ${player.sat.toFixed(1)} · Agotamiento ${player.exh.toFixed(2)}`,
    ];
    if (target) lines.push('', `Bloque apuntado: ${VC.blockName(target.id)} [${target.id >> 4}:${target.id & 15}] (${target.x}, ${target.y}, ${target.z})`);
    return lines.join('\n');
  }

  // ---------- Main loop ----------
  let last = performance.now(), fpsN = 0, fpsT = 0, fps = 0, debugT = 0, autosaveT = 0, liquidT = 0, lavaT = 0, randT = 0, uiT = 0;
  let lastFrame = 0, fpsShownT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const lim = settings.gfx.fpsLimit;
    if (lim > 0 && now - lastFrame < 1000 / lim - 1) return;
    lastFrame = now;
    step(now);
    if (settings.gfx.showFps && now - fpsShownT > 500) { fpsShownT = now; $('fps-counter').textContent = `${fps} FPS`; }
  }
  // Browsers stop requestAnimationFrame in hidden tabs; in multiplayer the world must keep
  // running (the host simulates it for everybody), so a worker timer drives it meanwhile.
  try {
    const src = 'setInterval(() => postMessage(0), 50);';
    const timer = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    timer.onmessage = () => { if (document.hidden && mp.room) step(performance.now()); };
  } catch (e) { /* no workers: hidden tabs just pause */ }

  function step(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    fpsN++; fpsT += dt;
    if (fpsT >= 1) { fps = fpsN; fpsN = 0; fpsT = 0; }

    if (!game.world) return;
    try {
      tick(dt);
    } catch (e) {
      // Never freeze the whole game on one bad frame.
      if (!frame.errors) frame.errors = 0;
      if (frame.errors++ < 5) console.error(e);
    }
  }

  function tick(dt) {
    const world = game.world, player = game.player;

    updateChunks(dt);
    if (state === 'loading') checkLoaded();

    const ang = (game.time / 24000) * Math.PI * 2;
    game.day = VC.util.smoothstep(-0.2, 0.25, Math.sin(ang));

    const active = state === 'playing' || state === 'inventory' || state === 'chat';
    const ready = chunkReady(player.pos[0], player.pos[2]);
    if (active && ready) {
      input.keys = player.sleeping ? {} : moveKeys();
      const hpBefore = player.health, wasInWater = player.inWater, velY = player.vel[1], wasGround = player.onGround;
      player.update(dt, input);
      if (player.health < hpBefore) VC.Sound.hurt(null);
      if (!wasInWater && player.inWater && velY < -4) VC.Sound.splash(player.pos, velY < -10);
      const below = world.getBlock(Math.floor(player.pos[0]), Math.floor(player.pos[1] - 0.2), Math.floor(player.pos[2]));
      if (player.onGround && !wasGround && velY < -6) VC.Sound.step(below, player.pos);
      if (player.walkDist - stepDist > 1.7) {
        stepDist = player.walkDist;
        if (player.onGround && !player.sneaking && below && !P.liquid[below]) VC.Sound.step(below, player.pos);
      }
      updateSleep(dt);
      updatePortal(dt);
      if (player.dead && state !== 'dead') onDeath();
    }
    // In multiplayer the world keeps running while this player is paused or dead.
    if (ready && (active || mp.room)) {
      game.entities.update(dt);
      // Guests in the host's dimension only mirror it: the host runs water, crops, furnaces...
      const authority = !mp.guest || mp.sim;
      if (authority) {
        world.tickUpdates(400);
        liquidT += dt;
        if (liquidT >= 0.25) { liquidT = 0; world.tickLiquids(false, 3000); }
        lavaT += dt;
        if (lavaT >= 1.5) { lavaT = 0; world.tickLiquids(true, 2000); }
        randT += dt;
        if (randT >= 0.25) {
          randT = 0;
          for (const q of game.playersIn(game.dim)) {
            const pcx = Math.floor(q.pos[0] / 16), pcz = Math.floor(q.pos[2] / 16);
            for (const [dx, dz] of spiral(6)) world.randomTicks(pcx + dx, pcz + dz, 12, Math.random);
          }
        }
      } else {
        world.waterQ.clear(); world.lavaQ.clear(); world.updateQ.clear();
      }
      for (const [k, f] of game.furnaces) {
        const was = f.lit;
        f.tick(dt);
        if (authority && was !== f.lit && k.startsWith('n:') === (game.dim === 'nether')) {
          const [fx, fy, fz] = k.replace('n:', '').split(',').map(Number), cur = world.getBlock(fx, fy, fz);
          if ((cur >> 4) === 61 || (cur >> 4) === 62) applyEdit(fx, fy, fz, VC.st(f.lit ? 62 : 61, cur & 15));
        }
      }
      for (const pt of game.particles) {
        pt.life -= dt;
        if (pt.grav) pt.vel[1] -= pt.grav * dt;
        if (pt.drag) { const k = Math.exp(-pt.drag * dt); for (let i = 0; i < 3; i++) pt.vel[i] *= k; }
        for (let i = 0; i < 3; i++) pt.pos[i] += pt.vel[i] * dt;
        if (!pt.drag) { pt.vel[0] *= 0.96; pt.vel[2] *= 0.96; }
      }
      game.particles = game.particles.filter((pt) => pt.life > 0);
    }
    mpTick(dt);
    if (state === 'playing' && !player.sleeping && !player.spectator) {
      if (buildActive()) buildUpdate(dt); else updateInteraction(dt);
      autosaveT += dt;
      if (autosaveT > 30) { autosaveT = 0; saveWorld(); }
    }
    if (state === 'inventory' && game.ui.kind === 'furnace' && (uiT += dt) > 0.25 && !game.ui.drag) { uiT = 0; game.ui.render(); }
    if ((state !== 'paused' && state !== 'dead') || mp.room) {
      if (game.rules.doDaylightCycle) game.time += dt * 20;
      totalTime += dt;
    }
    game.chat.tick();

    target = state === 'playing' && !player.spectator && !buildActive() ? pick() : null;
    if (spectating && (spectating.removed || spectating.dead)) spectating = null;
    const cam = cameraFor(player);
    VC.Sound.listener.pos = cam.eye;
    VC.Sound.listener.yaw = cam.yaw;
    const { batches, crack, hand, overlays } = buildBatches(cam.eye, dt);
    renderer.render({
      world,
      eye: cam.eye,
      yaw: cam.yaw,
      pitch: cam.pitch,
      fov: settings.fov * (settings.gfx.dynFov ? player.fovMul * bowFov() : 1) * (player.hurtTime > 0 ? 0.98 : 1) * zoomFactor(),
      gfx: settings.gfx,
      dynLights: dynamicLights(cam.eye),
      renderDist: settings.renderDist,
      time: game.time,
      totalTime,
      target,
      underwater: cam.underwater,
      nether: game.dim === 'nether',
      batches,
      crack,
      hand,
      overlays,
    });
    updateBuildHud();

    mpNametags();
    updatePlayerList(dt);
    if (state === 'inventory' && game.ui.kind === 'inventory') drawInventoryPreview();
    updateHotbar();
    updateStats();
    $('hurt').style.opacity = Math.max(0, player.hurtTime / 0.4) * 0.5;
    game.flash = Math.max(0, game.flash - dt * 2);
    $('flash').style.opacity = game.flash;
    if (nameTimer > 0) {
      nameTimer -= dt;
      if (nameTimer <= 0) $('hotbar-name').style.opacity = 0;
    }
    debugT += dt;
    if (debugT > 0.25 && !$('debug').classList.contains('hidden')) {
      debugT = 0;
      $('debug').textContent = debugText(fps);
    }
  }

  // Console hook for debugging: VC.debug.player.pos, VC.debug.setState('playing'), ...
  VC.debug = {
    game,
    get world() { return game.world; },
    get player() { return game.player; },
    setState, selectSlot, attack, useItem, placeBlock, openContainer, closeContainer,
    setTime(t) { game.time = t; },
    spawn(type) {
      const p = game.player, f = p.forward();
      return game.entities.add(new VC.Mob(game.world, type, p.pos[0] + f[0] * 4, p.pos[1] + 1, p.pos[2] + f[2] * 4));
    },
    give(id, n = 1) { game.player.inventory.add(id, n); },
    harvest, breakAt, useBlock, pick, iconFor, changeDimension,
    step, // advance one frame by hand (tests)
    build: { bm, enter: buildEnter, exit: buildExit, place: buildTryPlace, editKey: buildEditKey, editTile: buildEditTile, confirm: buildEditConfirm, pickaxe: buildPickaxe },
  };

  setState('menu');
  requestAnimationFrame(frame);
})();
