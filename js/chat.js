'use strict';

// MC-style names for /give, /setblock, /fill (with optional "minecraft:" prefix).
VC.MC_NAMES = (function () {
  const names = Object.assign({}, VC.BLOCK_KEYS, VC.ITEM_KEYS);
  // Common aliases.
  Object.assign(names, {
    cobblestone: VC.st(4), planks: VC.st(5), log: VC.st(17), leaves: VC.st(18), wool: VC.st(35), stained_glass: VC.st(95),
    stonebrick: VC.st(98), brick_block: VC.st(45), red_flower: VC.st(38), yellow_flower: VC.st(37), web: VC.st(30),
    snow_layer: VC.st(78), lit_pumpkin: VC.st(91), flowing_water: VC.B.WATER | 1, flowing_lava: VC.B.LAVA | 2, water: VC.B.WATER, lava: VC.B.LAVA,
    fire: VC.st(51), tnt: VC.st(46), torch: VC.st(50), reeds: VC.I.REEDS, dye: VC.I.DYE, spawn_egg: VC.I.SPAWN_EGG,
  });
  return names;
})();

VC.Chat = class {
  constructor(game, api) {
    this.game = game;
    this.api = api; // hooks from main: applyEdits, setMode, close, etc.
    this.messages = [];
    this.history = [];
    this.histIdx = -1;
    this.open = false;
    this.log = document.getElementById('chat-log');
    this.input = document.getElementById('chat-input');
    this.input.addEventListener('keydown', (e) => this.onKey(e));
  }

  // ---------- Messages ----------
  print(text, cls) {
    this.messages.push({ text, cls: cls || '', t: performance.now() });
    if (this.messages.length > 100) this.messages.shift();
    this.render();
  }
  info(t) { this.print(t, 'sys'); }
  err(t) { this.print(t, 'err'); }

  render() {
    const now = performance.now();
    const list = this.open ? this.messages.slice(-20) : this.messages.slice(-10).filter((m) => now - m.t < 10000);
    this.log.innerHTML = '';
    for (const m of list) {
      const d = document.createElement('div');
      d.className = 'msg ' + m.cls;
      d.textContent = m.text;
      if (!this.open) d.style.opacity = Math.min(1, (10000 - (now - m.t)) / 1000);
      this.log.appendChild(d);
    }
    this.log.classList.toggle('open', this.open);
  }

  // Called every frame so old messages fade out.
  tick() { if (!this.open && this.messages.length) this.render(); }

  show(prefix) {
    this.open = true;
    this.input.classList.remove('hidden');
    this.input.value = prefix || '';
    this.histIdx = -1;
    setTimeout(() => { this.input.focus(); this.input.setSelectionRange(this.input.value.length, this.input.value.length); }, 0);
    this.render();
  }

  hide() {
    this.open = false;
    this.input.classList.add('hidden');
    this.input.blur();
    this.render();
  }

  onKey(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const v = this.input.value.trim();
      if (v) {
        this.history.unshift(v);
        if (this.history.length > 50) this.history.pop();
        this.submit(v);
      }
      this.api.closeChat();
    } else if (e.key === 'Escape') {
      this.api.closeChat();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      this.histIdx = Math.max(-1, Math.min(this.history.length - 1, this.histIdx + (e.key === 'ArrowUp' ? 1 : -1)));
      this.input.value = this.histIdx >= 0 ? this.history[this.histIdx] : '';
    } else if (e.key === 'Tab') {
      e.preventDefault();
      this.complete();
    }
  }

  submit(text) {
    if (text[0] !== '/') {
      if (this.api.say) this.api.say(text); // multiplayer-aware
      else this.print(`<${this.api.playerName}> ${text}`);
      return;
    }
    const args = text.slice(1).split(/\s+/);
    const name = args.shift().toLowerCase().replace(/^minecraft:/, '');
    const cmd = this.commands()[name];
    if (!cmd) { this.err(`Comando desconocido. Escribe /help para ver la lista.`); return; }
    try {
      cmd.run(args);
    } catch (ex) {
      this.err(ex.message || String(ex));
    }
  }

  // ---------- Tab completion ----------
  candidates(tokens) {
    const cmds = this.commands();
    if (tokens.length === 1) return Object.keys(cmds).map((c) => '/' + c);
    const c = cmds[tokens[0].slice(1).toLowerCase()];
    if (!c || !c.complete) return [];
    return c.complete(tokens.length - 2, tokens) || [];
  }

  complete() {
    const v = this.input.value;
    if (v[0] !== '/') return;
    const tokens = v.split(' ');
    const cur = tokens[tokens.length - 1].toLowerCase();
    const opts = this.candidates(tokens).filter((o) => o.toLowerCase().startsWith(cur));
    if (!opts.length) return;
    if (opts.length === 1) {
      tokens[tokens.length - 1] = opts[0];
      this.input.value = tokens.join(' ') + ' ';
    } else {
      let pre = opts[0];
      for (const o of opts) while (!o.startsWith(pre)) pre = pre.slice(0, -1);
      tokens[tokens.length - 1] = pre;
      this.input.value = tokens.join(' ');
      this.info(opts.slice(0, 30).join(', '));
    }
  }

  // ---------- Parsing helpers ----------
  coord(s, base) {
    if (s === undefined) throw new Error('Faltan coordenadas.');
    if (s[0] === '~') return base + (s.length > 1 ? parseFloat(s.slice(1)) : 0);
    const n = parseFloat(s);
    if (isNaN(n)) throw new Error(`Coordenada no válida: ${s}`);
    return n;
  }

  xyz(args, i, block) {
    const p = this.game.player.pos;
    const base = block ? p.map(Math.floor) : p;
    const r = [this.coord(args[i], base[0]), this.coord(args[i + 1], base[1]), this.coord(args[i + 2], base[2])];
    return block ? r.map(Math.floor) : r;
  }

  itemId(s) {
    if (s === undefined) throw new Error('Falta el objeto.');
    s = s.toLowerCase().replace(/^minecraft:/, '');
    const num = s.match(/^(\d+)(?::(\d+))?$/);
    if (num) {
      const n = (+num[1] << 4) | (+num[2] || 0);
      if (n === 0 || (VC.isItem(n) ? VC.ITEMS[n] : VC.BP.exists[n])) return n;
    }
    const meta = s.match(/^(.+):(\d+)$/);
    if (meta && VC.MC_NAMES[meta[1]] !== undefined) return (VC.MC_NAMES[meta[1]] & ~15) | +meta[2];
    const id = VC.MC_NAMES[s];
    if (id === undefined) throw new Error(`No existe el objeto: ${s}`);
    return id;
  }

  mobType(s) {
    const t = String(s || '').toLowerCase().replace(/^minecraft:/, '');
    if (!VC.MOB_TYPES[t]) throw new Error(`No se puede invocar: ${s}. Mobs: ${Object.keys(VC.MOB_TYPES).join(', ')}`);
    return t;
  }

  isSelf(s) { return s && (s[0] === '@' || s.toLowerCase() === this.api.playerName.toLowerCase()); }

  // ---------- Commands ----------
  commands() {
    if (this._cmds) return this._cmds;
    const g = this.game, api = this.api;
    const itemNames = Object.keys(VC.MC_NAMES);
    const mobNames = Object.keys(VC.MOB_TYPES);
    const C = {};
    const def = (name, usage, desc, run, complete) => { C[name] = { usage, desc, run, complete }; };

    def('help', '/help [comando]', 'Muestra la ayuda', (a) => {
      if (a[0] && C[a[0]]) { this.info(`${C[a[0]].usage} — ${C[a[0]].desc}`); return; }
      this.info('--- Comandos disponibles ---');
      for (const k of Object.keys(C).sort()) this.info(`${C[k].usage}`);
    }, (i) => (i === 0 ? Object.keys(C) : []));

    def('gamemode', '/gamemode <survival|creative|spectator> [jugador]', 'Cambia el modo de juego', (a) => {
      const m = String(a[0] || '').toLowerCase();
      const mode = { 0: 'survival', s: 'survival', survival: 'survival', 1: 'creative', c: 'creative', creative: 'creative',
        3: 'spectator', sp: 'spectator', spectator: 'spectator' }[m];
      if (!mode) throw new Error('Uso: /gamemode <survival|creative|spectator>');
      api.setMode(mode);
      this.info(`Tu modo de juego ha cambiado a ${VC.MODE_NAMES[mode]}`);
    }, (i) => (i === 0 ? ['survival', 'creative', 'spectator'] : []));

    def('time', '/time <set|add|query> <valor>', 'Cambia o consulta la hora', (a) => {
      const sub = String(a[0] || '').toLowerCase();
      const named = { day: 1000, noon: 6000, night: 13000, midnight: 18000, sunrise: 23000, sunset: 12000 };
      if (sub === 'query') {
        const what = (a[1] || 'daytime').toLowerCase();
        const v = what === 'day' ? Math.floor(g.time / 24000) : what === 'gametime' ? Math.floor(g.time) : Math.floor(g.time % 24000);
        this.info(`La hora es ${v}`);
        return;
      }
      const v = named[String(a[1]).toLowerCase()] !== undefined ? named[String(a[1]).toLowerCase()] : parseInt(a[1], 10);
      if (isNaN(v)) throw new Error('Uso: /time <set|add> <valor|day|night|noon|midnight>');
      if (sub === 'set') g.time = Math.floor(g.time / 24000) * 24000 + v;
      else if (sub === 'add') g.time += v;
      else throw new Error('Uso: /time <set|add|query> <valor>');
      this.info(`Hora establecida en ${Math.floor(g.time % 24000)}`);
    }, (i) => (i === 0 ? ['set', 'add', 'query'] : i === 1 ? ['day', 'noon', 'night', 'midnight', 'sunrise', 'sunset'] : []));

    const tp = (a) => {
      if (this.isSelf(a[0]) && a.length >= 4) a = a.slice(1);
      const [x, y, z] = this.xyz(a, 0, false);
      const p = g.player;
      p.pos = [x, y, z];
      p.vel = [0, 0, 0];
      p.fallDist = 0;
      if (a[3] !== undefined) p.yaw = -this.coord(a[3], -p.yaw * 180 / Math.PI) * Math.PI / 180;
      if (a[4] !== undefined) p.pitch = -this.coord(a[4], -p.pitch * 180 / Math.PI) * Math.PI / 180;
      this.info(`Teletransportado a ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
    };
    def('tp', '/tp <x> <y> <z> [yaw] [pitch]', 'Teletransporta (admite ~)', tp);
    def('teleport', '/teleport <x> <y> <z>', 'Igual que /tp', tp);

    def('give', '/give [jugador] <objeto> [cantidad]', 'Da objetos', (a) => {
      if (this.isSelf(a[0]) || (a.length >= 2 && isNaN(+a[1]) && VC.MC_NAMES[String(a[1]).toLowerCase().replace(/^minecraft:/, '')] !== undefined)) a = a.slice(1);
      const id = this.itemId(a[0]);
      if (!id) throw new Error('No puedes darte aire.');
      const n = Math.max(1, Math.min(64 * 36, parseInt(a[1] || '1', 10) || 1));
      const left = g.player.inventory.add(id, n);
      if (left > 0) g.dropItem(g.player.center(), VC.stack(id, left));
      this.info(`Dado ${VC.itemName(id)} x${n} a ${api.playerName}`);
    }, (i, t) => (i === 0 || (i === 1 && this.isSelf(t[1])) ? itemNames : []));

    def('summon', '/summon <mob> [x] [y] [z]', 'Invoca un mob', (a) => {
      const type = this.mobType(a[0]);
      const p = g.player, f = p.forward();
      const pos = a.length >= 4 ? this.xyz(a, 1, false) : [p.pos[0] + f[0] * 3, p.pos[1] + 0.5, p.pos[2] + f[2] * 3];
      g.entities.add(new VC.Mob(g.world, type, pos[0], pos[1], pos[2]));
      this.info(`Objeto invocado: ${VC.MOB_TYPES[type].name}`);
    }, (i) => (i === 0 ? mobNames : []));

    def('kill', '/kill [@p|@e|@e[type=mob]]', 'Mata entidades (por defecto, a ti)', (a) => {
      const sel = String(a[0] || '@p');
      if (sel === '@p' || sel === '@s' || sel === '@a' || sel.toLowerCase() === api.playerName.toLowerCase()) {
        api.killPlayer();
        return;
      }
      const m = sel.match(/^@e(?:\[type=(\w+)\])?$/);
      if (!m) throw new Error('Selector no válido. Usa @p, @e o @e[type=zombie]');
      let n = 0;
      for (const e of g.entities.list) {
        if (m[1] ? (e instanceof VC.Mob && e.type === m[1].toLowerCase()) : true) { e.removed = true; n++; }
      }
      this.info(`Eliminadas ${n} entidades`);
    }, (i) => (i === 0 ? ['@p', '@e'].concat(mobNames.map((t) => `@e[type=${t}]`)) : []));

    def('clear', '/clear [objeto]', 'Vacía tu inventario', (a) => {
      const inv = g.player.inventory;
      let n = 0;
      const id = a[0] && !this.isSelf(a[0]) ? this.itemId(a[0]) : a[1] ? this.itemId(a[1]) : null;
      inv.slots.forEach((s, i) => { if (s && (id === null || s.id === id)) { n += s.count; inv.slots[i] = null; } });
      inv.changed();
      this.info(`Quitados ${n} objetos del inventario de ${api.playerName}`);
    }, (i) => (i <= 1 ? itemNames : []));

    def('seed', '/seed', 'Muestra la semilla', () => this.info(`Semilla: [${g.world.seed}]`));

    def('spawnpoint', '/spawnpoint [x y z]', 'Fija tu punto de reaparición', (a) => {
      if (this.isSelf(a[0])) a = a.slice(1);
      const pos = a.length >= 3 ? this.xyz(a, 0, true).map((v, i) => (i === 1 ? v : v + 0.5)) : g.player.pos.slice();
      g.spawn = pos;
      this.info(`Punto de reaparición fijado en ${pos.map(Math.floor).join(', ')}`);
    });
    def('setworldspawn', '/setworldspawn [x y z]', 'Fija el punto de aparición del mundo', (a) => C.spawnpoint.run(a));

    def('setblock', '/setblock <x> <y> <z> <bloque>', 'Coloca un bloque', (a) => {
      const [x, y, z] = this.xyz(a, 0, true);
      const id = this.itemId(a[3]);
      if (VC.isItem(id) || !VC.BP.exists[id]) throw new Error(`${a[3]} no es un bloque`);
      if (y < 0 || y >= VC.CH) throw new Error(`Fuera del mundo (y 0-${VC.CH - 1})`);
      if (!g.world.getChunk(x >> 4, z >> 4)) throw new Error('Esa zona no está cargada');
      api.applyEdits([[x, y, z, id]]);
      this.info('Bloque colocado');
    }, (i) => (i === 3 ? itemNames : []));

    def('fill', '/fill <x1> <y1> <z1> <x2> <y2> <z2> <bloque> [replace <bloque>]', 'Rellena una región', (a) => {
      const p1 = this.xyz(a, 0, true), p2 = this.xyz(a, 3, true);
      const id = this.itemId(a[6]);
      if (VC.isItem(id) || !VC.BP.exists[id]) throw new Error(`${a[6]} no es un bloque`);
      const only = a[7] === 'replace' && a[8] ? this.itemId(a[8]) : null;
      const lo = p1.map((v, i) => Math.min(v, p2[i])), hi = p1.map((v, i) => Math.max(v, p2[i]));
      lo[1] = Math.max(0, lo[1]); hi[1] = Math.min(VC.CH - 1, hi[1]);
      const vol = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
      if (vol > 32768) throw new Error(`Demasiados bloques (${vol} > 32768)`);
      const edits = [];
      for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
        if (!g.world.getChunk(x >> 4, z >> 4)) continue;
        if (only !== null && g.world.getBlock(x, y, z) !== only) continue;
        edits.push([x, y, z, id]);
      }
      api.applyEdits(edits);
      this.info(`${edits.length} bloques rellenados`);
    }, (i) => (i === 6 || i === 8 ? itemNames : i === 7 ? ['replace'] : []));

    def('gamerule', '/gamerule <regla> [valor]', 'Consulta o cambia reglas', (a) => {
      const rules = g.rules;
      if (!a[0]) { this.info(Object.keys(rules).map((k) => `${k}=${rules[k]}`).join(', ')); return; }
      if (!(a[0] in rules)) throw new Error(`Regla desconocida: ${a[0]}`);
      if (a[1] === undefined) { this.info(`${a[0]} = ${rules[a[0]]}`); return; }
      if (a[1] !== 'true' && a[1] !== 'false') throw new Error('El valor debe ser true o false');
      rules[a[0]] = a[1] === 'true';
      this.info(`La regla ${a[0]} ahora es: ${rules[a[0]]}`);
    }, (i) => (i === 0 ? Object.keys(g.rules) : i === 1 ? ['true', 'false'] : []));

    def('difficulty', '/difficulty <peaceful|easy|normal|hard>', 'Cambia la dificultad', (a) => {
      const map = { 0: 'peaceful', 1: 'easy', 2: 'normal', 3: 'hard', p: 'peaceful', e: 'easy', n: 'normal', h: 'hard' };
      let d = String(a[0] || '').toLowerCase();
      d = map[d] || d;
      if (!['peaceful', 'easy', 'normal', 'hard'].includes(d)) throw new Error('Uso: /difficulty <peaceful|easy|normal|hard>');
      api.setDifficulty(d);
      this.info(`Dificultad cambiada a ${{ peaceful: 'Pacífico', easy: 'Fácil', normal: 'Normal', hard: 'Difícil' }[d]}`);
    }, (i) => (i === 0 ? ['peaceful', 'easy', 'normal', 'hard'] : []));

    def('say', '/say <mensaje>', 'Envía un mensaje', (a) => this.print(`[${api.playerName}] ${a.join(' ')}`, 'say'));
    def('me', '/me <acción>', 'Describe una acción', (a) => this.print(`* ${api.playerName} ${a.join(' ')}`));
    def('weather', '/weather <clear|rain|thunder>', 'Clima', () => this.info('En Vibecraft siempre hace buen tiempo (no hay lluvia todavía).'),
      (i) => (i === 0 ? ['clear', 'rain', 'thunder'] : []));
    def('heal', '/heal', 'Recupera vida y hambre (extra, no vanilla)', () => {
      const p = g.player;
      p.health = 20; p.food = 20; p.sat = 5; p.air = 15;
      this.info('Vida y hambre restauradas');
    });

    this._cmds = C;
    return C;
  }
};
