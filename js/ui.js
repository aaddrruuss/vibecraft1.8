'use strict';

// Container screens: survival inventory (2x2 crafting), crafting table (3x3),
// furnace and the creative item palette. Mouse handling mimics MC:
// left click picks/places/swaps, right click splits/places one, shift moves,
// left-drag splits evenly, right-drag places one per slot, double click gathers,
// 1-9 over a slot swaps with the hotbar, Q drops, middle click clones (creative).
VC.UI = class {
  constructor(game) {
    this.game = game;
    this.kind = null;
    this.cursor = null;
    this.grid = [];
    this.gridW = 0;
    this.furnace = null;
    this.root = document.getElementById('inventory');
    this.cursorEl = document.getElementById('cursor-item');
    this.drag = null;      // { button, slots: [] } while dragging a held stack
    this.hover = null;     // slot under the mouse
    this.lastClick = { key: null, t: 0, id: 0 };
    this.allSlots = [];
    this.container = null;
    this.creativeTab = 'building';
    this.search = '';
    this.tooltip = document.getElementById('tooltip');
    document.addEventListener('mouseup', (e) => this.endDrag(e));
    document.addEventListener('mousemove', (e) => {
      this.tooltip.style.left = (e.clientX + 14) + 'px';
      this.tooltip.style.top = (e.clientY - 26) + 'px';
    });
    document.addEventListener('mousemove', (e) => {
      this.cursorEl.style.left = e.clientX + 'px';
      this.cursorEl.style.top = e.clientY + 'px';
    });
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root && this.cursor) {
        // Clicking outside the panel throws the held stack.
        if (e.button === 2) {
          this.game.throwStack(VC.stack(this.cursor.id, 1, this.cursor.dmg));
          if (--this.cursor.count <= 0) this.cursor = null;
        } else {
          this.game.throwStack(this.cursor);
          this.cursor = null;
        }
        this.render();
      }
    });
  }

  get inv() { return this.game.player.inventory; }

  open(kind, data) {
    this.kind = kind;
    this.furnace = kind === 'furnace' ? data : null;
    this.container = kind === 'chest' ? data : null;
    this.gridW = kind === 'table' ? 3 : kind === 'inventory' ? 2 : 0;
    this.grid = new Array(this.gridW * this.gridW).fill(null);
    this.render();
  }

  close() {
    const back = [...this.grid];
    if (this.cursor) back.push(this.cursor);
    for (const s of back) {
      if (!s) continue;
      const left = this.inv.add(s.id, s.count, s.dmg);
      if (left > 0) this.game.throwStack(VC.stack(s.id, left, s.dmg));
    }
    this.grid = [];
    this.cursor = null;
    this.kind = null;
    this.furnace = null;
    this.container = null;
    this.cursorEl.innerHTML = '';
    this.tooltip.classList.add('hidden');
  }

  // ---------- Slot model ----------
  invSlot(i) {
    return {
      key: 'i' + i,
      section: i < 9 ? 'hotbar' : 'main',
      get: () => this.inv.slots[i],
      set: (s) => { this.inv.slots[i] = s; this.inv.changed(); },
      shift: () => this.shiftFromInventory(i),
      sel: i === this.game.player.sel && i < 9,
    };
  }

  armorSlot(k) {
    const i = 36 + k;
    return {
      key: 'a' + k,
      section: 'armor',
      get: () => this.inv.slots[i],
      set: (s) => { this.inv.slots[i] = s; this.inv.changed(); },
      accept: (st) => { const it = VC.item(st.id); return !!(it && it.armor && it.armor.slot === k) || (k === 0 && ((st.id >> 4) === 86 || VC.isItem(st.id) && (st.id >> 4) === 397)); },
      shift: () => this.moveToInventory(this.inv.slots[i], (st) => { this.inv.slots[i] = st; this.inv.changed(); }),
      placeholder: ['casco', 'pechera', 'pantalones', 'botas'][k],
      max1: true,
    };
  }

  containerSlot(i) {
    const c = this.container;
    return {
      key: 'c' + i,
      section: 'container',
      get: () => c.slots[i],
      set: (st) => { c.slots[i] = st; c.changed(); },
      shift: () => this.moveToInventory(c.slots[i], (st) => { c.slots[i] = st; c.changed(); }),
    };
  }

  gridSlot(i) {
    return {
      key: 'g' + i,
      section: 'grid',
      get: () => this.grid[i],
      set: (s) => { this.grid[i] = s; },
      shift: () => this.moveToInventory(this.grid[i], (s) => { this.grid[i] = s; }),
    };
  }

  resultSlot() {
    return { key: 'r', result: true, get: () => this.craftResult() };
  }

  furnaceSlot(field, accept) {
    const f = this.furnace;
    return {
      key: 'f' + field,
      section: 'furnace',
      get: () => f[field],
      set: (s) => { f[field] = s; },
      accept,
      shift: () => this.moveToInventory(f[field], (s) => { f[field] = s; }),
      outputOnly: field === 'output',
    };
  }

  craftResult() {
    if (!this.gridW) return null;
    const r = VC.Crafting.match(this.grid, this.gridW);
    return r ? VC.stack(r.id, r.count) : null;
  }

  consumeGrid() {
    for (let i = 0; i < this.grid.length; i++) {
      const s = this.grid[i];
      if (!s) continue;
      if (s.id === VC.I.WATER_BUCKET) { this.grid[i] = VC.stack(VC.I.BUCKET, 1); continue; }
      if (--s.count <= 0) this.grid[i] = null;
    }
  }

  // Merge into a slot range, then fill empties. Returns leftover count.
  mergeInto(stack, indices) {
    const max = VC.maxStack(stack.id);
    let count = stack.count;
    const slots = this.inv.slots;
    for (const i of indices) {
      const s = slots[i];
      if (count > 0 && s && s.id === stack.id && max > 1 && s.count < max) {
        const n = Math.min(count, max - s.count); s.count += n; count -= n;
      }
    }
    for (const i of indices) {
      if (count > 0 && !slots[i]) { const n = Math.min(count, max); slots[i] = VC.stack(stack.id, n, stack.dmg); count -= n; }
    }
    this.inv.changed();
    return count;
  }

  moveToInventory(stack, setter) {
    if (!stack) return;
    const all = [];
    for (let i = 0; i < 36; i++) all.push(i);
    const left = this.mergeInto(stack, all);
    setter(left > 0 ? VC.stack(stack.id, left, stack.dmg) : null);
  }

  shiftFromInventory(i) {
    const s = this.inv.slots[i];
    if (!s) return;
    const f = this.furnace;
    if (this.container) {
      const c = this.container, max = VC.maxStack(s.id);
      for (let k = 0; k < c.slots.length && s.count > 0; k++) {
        const t = c.slots[k];
        if (t && t.id === s.id && max > 1 && t.count < max) { const n = Math.min(s.count, max - t.count); t.count += n; s.count -= n; }
      }
      for (let k = 0; k < c.slots.length && s.count > 0; k++) if (!c.slots[k]) { c.slots[k] = VC.stack(s.id, s.count, s.dmg); s.count = 0; }
      if (s.count <= 0) this.inv.slots[i] = null;
      c.changed(); this.inv.changed();
      return;
    }
    const it = VC.item(s.id);
    if (this.kind === 'inventory' && it && it.armor && !this.inv.slots[36 + it.armor.slot]) {
      this.inv.slots[36 + it.armor.slot] = s; this.inv.slots[i] = null; this.inv.changed();
      return;
    }
    if (f) {
      if (VC.SMELT[s.id] && (!f.input || f.input.id === s.id)) { this.inv.slots[i] = this.stackIntoField(f, 'input', s); this.inv.changed(); return; }
      if ((VC.item(s.id) || {}).fuel && (!f.fuel || f.fuel.id === s.id)) { this.inv.slots[i] = this.stackIntoField(f, 'fuel', s); this.inv.changed(); return; }
    }
    const range = [];
    if (i < 9) for (let k = 9; k < 36; k++) range.push(k);
    else for (let k = 0; k < 9; k++) range.push(k);
    this.inv.slots[i] = null;
    const left = this.mergeInto(s, range);
    if (left > 0) this.inv.slots[i] = VC.stack(s.id, left, s.dmg);
    this.inv.changed();
  }

  stackIntoField(obj, field, s) {
    const max = VC.maxStack(s.id);
    if (!obj[field]) { obj[field] = s; return null; }
    const n = Math.min(s.count, max - obj[field].count);
    obj[field].count += n;
    s.count -= n;
    return s.count > 0 ? s : null;
  }

  // ---------- Mouse gestures ----------
  mouseDown(slot, e) {
    const now = performance.now();
    const c = this.cursor;
    const st = slot.palette ? null : slot.get();
    const dbl = this.lastClick.key === slot.key && now - this.lastClick.t < 300;
    this.lastClick = { key: slot.key, t: now, id: c ? c.id : st ? st.id : 0 };

    if (e.button === 1) { this.cloneStack(slot); return; }
    if (dbl && e.button === 0 && e.shiftKey) { this.shiftAll(this.lastClick.id); return; }
    if (dbl && e.button === 0 && c && !slot.result) { this.gather(); return; }
    // Begin a drag when holding a stack over a slot that could take it.
    if (c && !e.shiftKey && !slot.result && !slot.palette && !slot.outputOnly && (e.button === 0 || e.button === 2)) {
      this.drag = { button: e.button, slots: [slot] };
      return;
    }
    this.click(slot, e.button, e.shiftKey);
  }

  enterSlot(slot, el) {
    this.hover = slot;
    this.hoverKey = slot.key;
    const d = this.drag;
    if (!d || !this.cursor || d.slots.some((x) => x.key === slot.key)) return;
    if (slot.result || slot.palette || slot.outputOnly) return;
    const st = slot.get();
    if (st && (st.id !== this.cursor.id || st.count >= VC.maxStack(st.id))) return;
    if (slot.accept && !slot.accept(this.cursor)) return;
    if (d.button === 0 && d.slots.length >= this.cursor.count) return;
    d.slots.push(slot);
    el.classList.add('drag');
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.slots.length === 1) { this.click(d.slots[0], d.button, false); return; }
    const c = this.cursor;
    const max = VC.maxStack(c.id);
    const per = d.button === 2 ? 1 : Math.floor(c.count / d.slots.length);
    for (const slot of d.slots) {
      if (c.count <= 0) break;
      const st = slot.get();
      const have = st ? st.count : 0;
      const n = Math.min(per, max - have, c.count);
      if (n <= 0) continue;
      slot.set(st ? (st.count += n, st) : VC.stack(c.id, n, c.dmg));
      c.count -= n;
    }
    if (c.count <= 0) this.cursor = null;
    this.render();
  }

  // Double click: pull every matching item into the held stack (MC skips full stacks first).
  gather() {
    const c = this.cursor;
    if (!c) return;
    const max = VC.maxStack(c.id);
    for (const pass of [0, 1]) {
      for (const slot of this.allSlots) {
        if (c.count >= max) break;
        if (slot.result || slot.palette) continue;
        const st = slot.get();
        if (!st || st.id !== c.id || st.dmg !== c.dmg) continue;
        if (pass === 0 && st.count >= max) continue;
        const n = Math.min(st.count, max - c.count);
        c.count += n;
        st.count -= n;
        slot.set(st.count > 0 ? st : null);
      }
    }
    this.render();
  }

  // Shift + double click: quick-move every stack of this item.
  shiftAll(id) {
    if (!id) return;
    for (const slot of this.allSlots) {
      if (slot.result || slot.palette || !slot.shift) continue;
      const st = slot.get();
      if (st && st.id === id) slot.shift();
    }
    this.render();
  }

  cloneStack(slot) {
    if (!this.game.player.creative || this.cursor) return;
    const id = slot.palette ? slot.id : (slot.get() || {}).id;
    if (!id) return;
    this.cursor = VC.stack(id, VC.maxStack(id));
    this.render();
  }

  // Number keys over a slot: swap with that hotbar slot.
  hotkey(n) {
    const slot = this.hover;
    if (!slot || this.cursor) return;
    const inv = this.inv;
    const hb = inv.slots[n];
    if (slot.palette) {
      inv.slots[n] = VC.stack(slot.id, VC.maxStack(slot.id));
    } else if (slot.result) {
      const r = slot.get();
      if (!r) return;
      if (!hb) { inv.slots[n] = r; this.consumeGrid(); }
      else if (hb.id === r.id && hb.count + r.count <= VC.maxStack(r.id)) { hb.count += r.count; this.consumeGrid(); }
    } else {
      if (slot.key === 'i' + n) return;
      const st = slot.get();
      if (hb && slot.accept && !slot.accept(hb)) return;
      if (hb && slot.outputOnly) return;
      slot.set(hb || null);
      inv.slots[n] = st || null;
    }
    inv.changed();
    this.render();
  }

  // Q over a slot: drop one (or the whole stack with Ctrl).
  dropHover(all) {
    const slot = this.hover;
    if (!slot || this.cursor || slot.palette) return;
    if (slot.result) {
      const r = slot.get();
      if (r) { this.game.throwStack(r); this.consumeGrid(); this.render(); }
      return;
    }
    const st = slot.get();
    if (!st) return;
    const n = all ? st.count : 1;
    this.game.throwStack(VC.stack(st.id, n, st.dmg));
    st.count -= n;
    slot.set(st.count > 0 ? st : null);
    this.render();
  }

  click(slot, button, shift) {
    const c = this.cursor;
    if (slot.palette) {
      if (c) this.cursor = null;
      else if (shift) this.inv.add(slot.id, VC.maxStack(slot.id));
      else this.cursor = VC.stack(slot.id, button === 2 ? 1 : VC.maxStack(slot.id));
      this.render();
      return;
    }
    if (slot.result) {
      let r = slot.get();
      if (!r) return;
      if (shift) {
        let guard = 64;
        while (r && guard-- > 0) {
          const left = this.inv.add(r.id, r.count, 0);
          if (left === r.count) break;
          this.consumeGrid();
          if (left > 0) { this.game.throwStack(VC.stack(r.id, left)); break; }
          r = this.craftResult();
        }
      } else if (!c) { this.cursor = r; this.consumeGrid(); }
      else if (c.id === r.id && c.count + r.count <= VC.maxStack(c.id)) { c.count += r.count; this.consumeGrid(); }
      this.render();
      return;
    }
    const s = slot.get();
    if (shift) { slot.shift && slot.shift(); this.render(); return; }
    const accepts = (st) => !slot.outputOnly && (!slot.accept || slot.accept(st)) && (!slot.max1 || st.count === 1 || !slot.get());
    const max = c ? VC.maxStack(c.id) : 64;
    if (button === 0) {
      if (!c) { if (s) { this.cursor = s; slot.set(null); } }
      else if (!s) {
        if (accepts(c)) {
          if (slot.max1 && c.count > 1) { slot.set(VC.stack(c.id, 1, c.dmg)); c.count--; }
          else { slot.set(c); this.cursor = null; }
        }
      }
      else if (s.id === c.id && max > 1 && !slot.outputOnly) {
        const n = Math.min(c.count, max - s.count); s.count += n; c.count -= n;
        if (c.count <= 0) this.cursor = null;
        slot.set(s);
      } else if (s.id === c.id && slot.outputOnly && c.count + s.count <= max) {
        c.count += s.count; slot.set(null);
      } else if (accepts(c)) { slot.set(c); this.cursor = s; }
    } else if (button === 2) {
      if (!c) {
        if (s) {
          const half = Math.ceil(s.count / 2);
          this.cursor = VC.stack(s.id, half, s.dmg);
          s.count -= half;
          slot.set(s.count > 0 ? s : null);
        }
      } else if (!s) {
        if (accepts(c)) { slot.set(VC.stack(c.id, 1, c.dmg)); c.count--; }
      } else if (s.id === c.id && s.count < max && !slot.outputOnly) {
        s.count++; c.count--; slot.set(s);
      }
      if (this.cursor && this.cursor.count <= 0) this.cursor = null;
    }
    this.render();
  }

  paletteIds() {
    const all = VC.CREATIVE_BLOCKS.concat(VC.CREATIVE_ITEMS);
    if (this.creativeTab !== 'search') return all.filter(([, t]) => t === this.creativeTab).map(([id]) => id);
    const q = this.search.trim().toLowerCase();
    const seen = new Set(), out = [];
    for (const [id] of all) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (!q || VC.itemName(id).toLowerCase().includes(q)) out.push(id);
    }
    return out;
  }

  renderPalette(grid) {
    grid.innerHTML = '';
    this.allSlots = this.allSlots.filter((s) => !s.palette);
    for (const id of this.paletteIds()) grid.appendChild(this.slotEl({ key: 'p' + id, palette: true, id }));
  }

  // ---------- Rendering ----------
  slotEl(slot) {
    const d = document.createElement('div');
    d.className = 'slot' + (slot.sel ? ' sel' : '') + (slot.big ? ' big' : '');
    const s = slot.palette ? VC.stack(slot.id, 1) : slot.get();
    if (s) d.appendChild(this.game.stackEl(s));
    else if (slot.placeholder) d.classList.add('ph-' + slot.placeholder);
    d.addEventListener('mouseenter', () => this.showTooltip(slot));
    d.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
    d.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); this.mouseDown(slot, e); });
    d.addEventListener('mouseenter', () => this.enterSlot(slot, d));
    d.addEventListener('mouseleave', () => { if (this.hover === slot) { this.hover = null; this.hoverKey = null; } });
    if (slot.key === this.hoverKey) this.hover = slot;
    this.allSlots.push(slot);
    return d;
  }

  showTooltip(slot) {
    const s = slot.palette ? VC.stack(slot.id, 1) : slot.get();
    if (!s) { this.tooltip.classList.add('hidden'); return; }
    this.tooltip.innerHTML = '';
    const name = document.createElement('div');
    name.textContent = VC.itemName(s.id);
    const it = VC.item(s.id);
    if (it && it.glint) name.className = 'tt-ench';
    this.tooltip.appendChild(name);
    const lines = [];
    if (it && it.desc) lines.push(it.desc);
    if (it && it.tool && it.tool.type === 'sword') lines.push(`+${it.tool.damage} de daño de ataque`);
    if (it && it.armor && it.armor.points) lines.push(`+${it.armor.points} de armadura`);
    if (it && it.food) lines.push(`Restaura ${it.food / 2} de hambre`);
    if (it && it.tool && it.tool.durability && s.dmg > 0) lines.push(`Durabilidad: ${it.tool.durability - s.dmg} / ${it.tool.durability}`);
    for (const l of lines) {
      const e = document.createElement('div');
      e.className = 'tt-line';
      e.textContent = l;
      this.tooltip.appendChild(e);
    }
    this.tooltip.classList.remove('hidden');
  }

  row(slots, cls) {
    const r = document.createElement('div');
    r.className = 'slot-row ' + (cls || '');
    for (const s of slots) r.appendChild(this.slotEl(s));
    return r;
  }

  label(text) {
    const l = document.createElement('div');
    l.className = 'inv-title';
    l.textContent = text;
    return l;
  }

  inventoryRows(panel) {
    for (let r = 0; r < 3; r++) {
      const slots = [];
      for (let k = 0; k < 9; k++) slots.push(this.invSlot(9 + r * 9 + k));
      panel.appendChild(this.row(slots));
    }
    const hb = [];
    for (let k = 0; k < 9; k++) hb.push(this.invSlot(k));
    panel.appendChild(this.row(hb, 'hotbar-row'));
  }

  render() {
    if (!this.kind) return;
    this.allSlots = [];
    this.hover = null;
    const panel = document.createElement('div');
    panel.className = 'inv-panel';
    panel.addEventListener('mousedown', (e) => e.stopPropagation());

    if (this.kind === 'creative') {
      const TABS = [['building', 'Bloques de construcción', VC.st(45)], ['decoration', 'Decoración', VC.st(175, 4)], ['redstone', 'Redstone', VC.I.REDSTONE],
        ['transport', 'Transporte', VC.st(27)], ['misc', 'Varios', VC.I.LAVA_BUCKET], ['food', 'Comida', VC.I.APPLE], ['tools', 'Herramientas', VC.I.IRON_AXE],
        ['combat', 'Combate', VC.I.GOLD_SWORD], ['brewing', 'Pociones', VC.I.POTION], ['materials', 'Materiales', VC.I.STICK], ['search', 'Buscar', VC.I.COMPASS]];
      const tabs = document.createElement('div');
      tabs.className = 'tabs';
      for (const [k, label, icon] of TABS) {
        const t = document.createElement('div');
        t.className = 'tab' + (this.creativeTab === k ? ' on' : '');
        t.appendChild(this.game.stackEl(VC.stack(icon, 1)));
        t.addEventListener('mouseenter', () => { this.tooltip.textContent = label; this.tooltip.classList.remove('hidden'); });
        t.addEventListener('mouseleave', () => this.tooltip.classList.add('hidden'));
        t.addEventListener('mousedown', (e) => { e.stopPropagation(); this.creativeTab = k; this.render(); if (k === 'search') setTimeout(() => { const q = this.root.querySelector('.search'); q && q.focus(); }, 0); });
        tabs.appendChild(t);
      }
      panel.appendChild(tabs);
      const title = TABS.find((t) => t[0] === this.creativeTab);
      const head = this.label(title ? title[1] : '');
      if (this.creativeTab === 'search') {
        const q = document.createElement('input');
        q.className = 'search';
        q.placeholder = 'Buscar objetos...';
        q.value = this.search;
        q.addEventListener('mousedown', (e) => e.stopPropagation());
        q.addEventListener('keydown', (e) => e.stopPropagation());
        q.addEventListener('input', () => { this.search = q.value; this.renderPalette(grid); });
        head.appendChild(q);
      }
      panel.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'palette';
      this.renderPalette(grid);
      panel.appendChild(grid);
      panel.appendChild(this.label('Inventario'));
      this.inventoryRows(panel);
      const hint = document.createElement('div');
      hint.className = 'inv-hint';
      hint.textContent = 'Clic: coger stack · Clic derecho: coger 1 · Mayús+clic: al inventario · Clic en la paleta con algo en la mano: borrarlo.';
      panel.appendChild(hint);
    } else if (this.kind === 'chest') {
      const c = this.container;
      panel.appendChild(this.label(c.title || 'Cofre'));
      const cols = c.cols || 9;
      for (let r = 0; r < c.slots.length / cols; r++) {
        const slots = [];
        for (let k = 0; k < cols; k++) slots.push(this.containerSlot(r * cols + k));
        panel.appendChild(this.row(slots, cols < 9 ? 'centered' : ''));
      }
      panel.appendChild(this.label('Inventario'));
      this.inventoryRows(panel);
    } else if (this.kind === 'furnace') {
      const f = this.furnace;
      panel.appendChild(this.label('Horno'));
      const box = document.createElement('div');
      box.className = 'furnace-box';
      const left = document.createElement('div');
      left.className = 'furnace-col';
      left.appendChild(this.slotEl(this.furnaceSlot('input')));
      const flame = document.createElement('div');
      flame.className = 'flame';
      flame.innerHTML = `<div style="height:${f.burnMax ? Math.round(100 * f.burn / f.burnMax) : 0}%"></div>`;
      left.appendChild(flame);
      left.appendChild(this.slotEl(this.furnaceSlot('fuel', (s) => !!(VC.item(s.id) || {}).fuel)));
      const arrow = document.createElement('div');
      arrow.className = 'progress';
      arrow.innerHTML = `<div style="width:${Math.round(100 * f.cook / 10)}%"></div>`;
      box.appendChild(left);
      box.appendChild(arrow);
      box.appendChild(this.slotEl(Object.assign(this.furnaceSlot('output'), { big: true })));
      panel.appendChild(box);
      panel.appendChild(this.label('Inventario'));
      this.inventoryRows(panel);
    } else {
      panel.appendChild(this.label(this.kind === 'table' ? 'Mesa de trabajo' : 'Fabricación'));
      const box = document.createElement('div');
      box.className = 'craft-box';
      if (this.kind === 'inventory') {
        const armor = document.createElement('div');
        armor.className = 'armor-col';
        for (let k = 0; k < 4; k++) armor.appendChild(this.slotEl(this.armorSlot(k)));
        box.appendChild(armor);
        // Player preview (drawn every frame by main.js, looks at the mouse).
        if (!this.preview) {
          this.preview = document.createElement('canvas');
          this.preview.className = 'inv-preview';
          this.preview.width = 152; this.preview.height = 212;
        }
        box.appendChild(this.preview);
        const pv = document.createElement('div');
        pv.className = 'armor-points';
        pv.textContent = `Armadura: ${this.game.player.armorPoints()}`;
        box.appendChild(pv);
      }
      const g = document.createElement('div');
      g.className = 'craft-grid';
      g.style.gridTemplateColumns = `repeat(${this.gridW}, 44px)`;
      for (let i = 0; i < this.grid.length; i++) g.appendChild(this.slotEl(this.gridSlot(i)));
      box.appendChild(g);
      const arrow = document.createElement('div');
      arrow.className = 'arrow';
      arrow.textContent = '➜';
      box.appendChild(arrow);
      box.appendChild(this.slotEl(Object.assign(this.resultSlot(), { big: true })));
      panel.appendChild(box);
      panel.appendChild(this.label('Inventario'));
      this.inventoryRows(panel);
    }

    this.root.innerHTML = '';
    this.root.appendChild(panel);
    this.cursorEl.innerHTML = '';
    if (this.cursor) this.cursorEl.appendChild(this.game.stackEl(this.cursor));
  }
};
