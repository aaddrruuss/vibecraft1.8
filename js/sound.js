'use strict';

// Procedural sound effects (WebAudio). Mojang's sounds are copyrighted, so every
// effect is synthesised from noise and oscillators to resemble the original feel.
VC.Sound = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let volume = 0.8;
  const listener = { pos: [0, 0, 0], yaw: 0 };

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  // Browsers only allow audio after a user gesture.
  const unlock = () => { if (init() && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('mousedown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  function setVolume(v) { volume = v; if (master) master.gain.value = v; }

  // Output node with distance attenuation + stereo pan relative to the listener.
  function out(pos, gain = 1, range = 16) {
    if (!ctx || ctx.state !== 'running') return null;
    let g = gain, pan = 0;
    if (pos) {
      const dx = pos[0] - listener.pos[0], dy = pos[1] - listener.pos[1], dz = pos[2] - listener.pos[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > range) return null;
      g *= Math.max(0, 1 - d / range);
      // Listener right vector = (cos yaw, 0, -sin yaw)
      const rx = Math.cos(listener.yaw), rz = -Math.sin(listener.yaw);
      pan = d > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) * 0.8 : 0;
    }
    const gn = ctx.createGain();
    gn.gain.value = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      gn.connect(p);
      p.connect(master);
    } else gn.connect(master);
    return gn;
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  let record = null;

  // Filtered noise burst with an attack/decay envelope.
  function noise(dest, { t = 0, dur = 0.2, type = 'bandpass', freq = 1000, q = 1, freqEnd, vol = 1, attack = 0.005, rate = 1 }) {
    const now = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, now);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(now, Math.random() * 1.5, dur + 0.05);
  }

  // Oscillator tone with optional pitch glide and lowpass.
  function tone(dest, { t = 0, dur = 0.2, type = 'sine', freq = 440, freqEnd, vol = 1, attack = 0.01, lp, vibrato = 0, vibRate = 6 }) {
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    if (vibrato) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = vibRate; lg.gain.value = vibrato;
      l.connect(lg); lg.connect(o.frequency);
      l.start(now); l.stop(now + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let last = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lp;
      o.connect(f); last = f;
    }
    last.connect(g); g.connect(dest);
    o.start(now); o.stop(now + dur + 0.05);
  }

  // ---------- Block materials (from the block registry) ----------
  function material(id) { return (VC.BP.sound && VC.BP.sound[id]) || 'stone'; }

  function blockSound(id, pos, strength) {
    const o = out(pos, strength);
    if (!o) return;
    const m = material(id), p = rnd(0.85, 1.15);
    switch (m) {
      case 'grass':
        noise(o, { dur: 0.18, type: 'bandpass', freq: 2600 * p, q: 0.6, vol: 0.5 });
        noise(o, { t: 0.04, dur: 0.12, type: 'highpass', freq: 4000, vol: 0.25 });
        break;
      case 'gravel':
        for (let i = 0; i < 5; i++) noise(o, { t: i * 0.025, dur: 0.06, type: 'bandpass', freq: rnd(700, 1600), q: 1.5, vol: 0.45 });
        break;
      case 'sand':
        noise(o, { dur: 0.22, type: 'highpass', freq: 2500 * p, vol: 0.3, attack: 0.03 });
        break;
      case 'snow':
        noise(o, { dur: 0.2, type: 'bandpass', freq: 1800 * p, q: 0.8, vol: 0.3, attack: 0.02 });
        break;
      case 'wood':
        tone(o, { dur: 0.12, type: 'triangle', freq: 210 * p, freqEnd: 150, vol: 0.5 });
        noise(o, { dur: 0.1, type: 'lowpass', freq: 900 * p, vol: 0.5 });
        break;
      case 'glass':
        for (let i = 0; i < 6; i++) tone(o, { t: i * 0.02, dur: rnd(0.15, 0.4), freq: rnd(2200, 5200), vol: 0.12 });
        noise(o, { dur: 0.25, type: 'highpass', freq: 3000, vol: 0.4 });
        break;
      case 'metal':
        noise(o, { dur: 0.12, type: 'bandpass', freq: 2200 * p, q: 3, vol: 0.4 });
        tone(o, { dur: 0.25, type: 'triangle', freq: 880 * p, vol: 0.15 });
        tone(o, { dur: 0.2, type: 'triangle', freq: 1320 * p, vol: 0.08 });
        break;
      case 'cloth':
        noise(o, { dur: 0.15, type: 'lowpass', freq: 900 * p, vol: 0.4, attack: 0.02 });
        break;
      case 'slime':
        tone(o, { dur: 0.15, type: 'sine', freq: 200 * p, freqEnd: 90, vol: 0.4 });
        noise(o, { dur: 0.12, type: 'lowpass', freq: 700, vol: 0.3 });
        break;
      case 'water':
        noise(o, { dur: 0.3, type: 'lowpass', freq: 1500, vol: 0.3 });
        break;
      default: // stone
        noise(o, { dur: 0.14, type: 'bandpass', freq: 1300 * p, q: 1.2, vol: 0.6 });
        tone(o, { dur: 0.06, type: 'square', freq: 120 * p, vol: 0.12, lp: 600 });
    }
  }

  // ---------- Effects ----------
  const S = {
    get listener() { return listener; },
    setVolume,
    dig(id, pos) { blockSound(id, pos, 1); },
    place(id, pos) { blockSound(id, pos, 0.9); },
    hit(id, pos) { blockSound(id, pos, 0.25); },
    step(id, pos) { blockSound(id, pos, 0.18); },

    hurt(pos) {
      const o = out(pos, 1);
      if (!o) return;
      tone(o, { dur: 0.22, type: 'sawtooth', freq: rnd(330, 380), freqEnd: 170, vol: 0.45, lp: 1200 });
      noise(o, { dur: 0.12, type: 'bandpass', freq: 900, vol: 0.25 });
    },

    mob(type, kind, pos) {
      const o = out(pos, kind === 'idle' ? 0.6 : 1);
      if (!o) return;
      const pitch = kind === 'death' ? 0.75 : kind === 'hurt' ? 1.2 : rnd(0.9, 1.1);
      switch (type) {
        case 'zombie':
          tone(o, { dur: kind === 'idle' ? 1.0 : 0.45, type: 'sawtooth', freq: 105 * pitch, freqEnd: 80 * pitch, vol: 0.5, lp: 650, vibrato: 12, vibRate: 7, attack: 0.08 });
          noise(o, { dur: 0.5, type: 'lowpass', freq: 500, vol: 0.2, attack: 0.1 });
          break;
        case 'skeleton':
          for (let i = 0; i < (kind === 'death' ? 9 : 5); i++) {
            noise(o, { t: i * rnd(0.035, 0.06), dur: 0.04, type: 'bandpass', freq: rnd(1800, 3200) * pitch, q: 4, vol: 0.6 });
          }
          break;
        case 'creeper':
          if (kind === 'idle') return;
          noise(o, { dur: 0.35, type: 'highpass', freq: 3500, vol: 0.4 });
          break;
        case 'spider':
          if (kind === 'idle') {
            noise(o, { dur: 0.5, type: 'highpass', freq: 3000, vol: 0.25, attack: 0.1 });
            for (let i = 0; i < 4; i++) noise(o, { t: 0.1 + i * 0.07, dur: 0.03, type: 'bandpass', freq: 2500, q: 5, vol: 0.4 });
          } else {
            noise(o, { dur: 0.3, type: 'bandpass', freq: 1600 * pitch, q: 2, vol: 0.5 });
          }
          break;
        case 'pig': {
          const n = kind === 'idle' ? 2 : 1;
          for (let i = 0; i < n; i++) {
            tone(o, { t: i * 0.22, dur: 0.16, type: 'sawtooth', freq: 300 * pitch, freqEnd: 220 * pitch, vol: 0.4, lp: 1400, vibrato: 30, vibRate: 30 });
          }
          break;
        }
        case 'cow':
          tone(o, { dur: kind === 'idle' ? 1.1 : 0.4, type: 'sawtooth', freq: 150 * pitch, freqEnd: 105 * pitch, vol: 0.45, lp: 700, attack: 0.12, vibrato: 3, vibRate: 5 });
          break;
        case 'sheep':
          tone(o, { dur: kind === 'idle' ? 0.7 : 0.35, type: 'sawtooth', freq: 330 * pitch, freqEnd: 300 * pitch, vol: 0.35, lp: 1500, vibrato: 25, vibRate: 11, attack: 0.05 });
          break;
        case 'chicken':
          for (let i = 0; i < (kind === 'idle' ? 3 : 2); i++) tone(o, { t: i * 0.12, dur: 0.08, type: 'square', freq: rnd(900, 1300) * pitch, freqEnd: 700, vol: 0.18, lp: 3000 });
          break;
        case 'pigman':
          tone(o, { dur: kind === 'idle' ? 0.5 : 0.3, type: 'sawtooth', freq: 160 * pitch, freqEnd: 110 * pitch, vol: 0.45, lp: 900, vibrato: 30, vibRate: 22, attack: 0.03 });
          noise(o, { dur: 0.25, type: 'lowpass', freq: 600, vol: 0.2 });
          break;
        case 'ghast':
          if (kind === 'idle') tone(o, { dur: 1.6, type: 'sine', freq: 520 * pitch, freqEnd: 380 * pitch, vol: 0.35, vibrato: 30, vibRate: 5, attack: 0.3 });
          else tone(o, { dur: 0.6, type: 'sawtooth', freq: 900 * pitch, freqEnd: 500 * pitch, vol: 0.35, lp: 2500, vibrato: 60, vibRate: 30 });
          break;
        case 'player':
          S.hurt(pos);
          break;
      }
    },

    fuse(pos) {
      const o = out(pos, 1);
      if (!o) return;
      noise(o, { dur: 1.5, type: 'highpass', freq: 3000, freqEnd: 5000, vol: 0.5, attack: 0.4 });
    },

    explode(pos) {
      const o = out(pos, 1.6, 48);
      if (!o) return;
      noise(o, { dur: 2.2, type: 'lowpass', freq: 1400, freqEnd: 90, vol: 1, attack: 0.005, rate: 0.6 });
      tone(o, { dur: 1.2, freq: 70, freqEnd: 30, vol: 0.9 });
      noise(o, { t: 0.05, dur: 0.5, type: 'bandpass', freq: 600, vol: 0.5 });
    },

    fireworkLaunch(pos) {
      const o = out(pos, 0.9, 32);
      if (!o) return;
      noise(o, { dur: 0.7, type: 'bandpass', freq: 700, freqEnd: 3500, q: 1.5, vol: 0.5, attack: 0.03 });
    },

    // Bang, then (for twinkling stars) a delayed crackle.
    fireworkBlast(pos, large, twinkle) {
      const o = out(pos, large ? 1.6 : 1.1, 128);
      if (!o) return;
      noise(o, { dur: large ? 1.6 : 0.9, type: 'lowpass', freq: 3000, freqEnd: 150, vol: 0.9, attack: 0.003 });
      tone(o, { dur: 0.5, freq: large ? 60 : 90, freqEnd: 35, vol: 0.6 });
      if (twinkle) for (let i = 0; i < 24; i++) noise(o, { t: 0.5 + rnd(0, 0.9), dur: 0.03, type: 'highpass', freq: rnd(2500, 6000), vol: rnd(0.1, 0.3) });
    },

    // Creaking wood + string while drawing a bow.
    bowPull(pos) {
      const o = out(pos, 0.7);
      if (!o) return;
      noise(o, { dur: 0.9, type: 'bandpass', freq: 380, freqEnd: 700, q: 6, vol: 0.25, attack: 0.15 });
      tone(o, { dur: 0.8, type: 'triangle', freq: 110, freqEnd: 150, vol: 0.08, attack: 0.2 });
    },

    bow(pos) {
      const o = out(pos, 1);
      if (!o) return;
      noise(o, { dur: 0.3, type: 'bandpass', freq: 1500, freqEnd: 600, q: 1, vol: 0.45 });
      tone(o, { dur: 0.15, type: 'triangle', freq: rnd(380, 460), freqEnd: 300, vol: 0.3 });
    },

    arrowHit(pos) {
      const o = out(pos, 1);
      if (!o) return;
      tone(o, { dur: 0.08, type: 'triangle', freq: 260, freqEnd: 140, vol: 0.4 });
      noise(o, { dur: 0.06, type: 'lowpass', freq: 1200, vol: 0.4 });
    },

    eat() {
      const o = out(null, 0.7);
      if (!o) return;
      for (let i = 0; i < 3; i++) noise(o, { t: i * 0.03, dur: 0.05, type: 'bandpass', freq: rnd(1000, 2500), q: 2, vol: 0.5 });
    },

    burp() {
      const o = out(null, 0.6);
      if (!o) return;
      tone(o, { dur: 0.35, type: 'sawtooth', freq: 90, freqEnd: 70, vol: 0.5, lp: 400, vibrato: 15, vibRate: 25 });
    },

    pop() {
      const o = out(null, 0.35);
      if (!o) return;
      const f = rnd(500, 900);
      tone(o, { dur: 0.08, freq: f, freqEnd: f * 2.2, vol: 0.6 });
    },

    splash(pos, big) {
      const o = out(pos, big ? 1 : 0.5);
      if (!o) return;
      noise(o, { dur: big ? 0.8 : 0.4, type: 'lowpass', freq: 2500, freqEnd: 400, vol: 0.7, attack: 0.01 });
      for (let i = 0; i < 5; i++) tone(o, { t: rnd(0, 0.3), dur: 0.08, freq: rnd(600, 1400), freqEnd: rnd(1500, 2500), vol: 0.08 });
    },

    click() {
      const o = out(null, 0.4);
      if (!o) return;
      tone(o, { dur: 0.04, type: 'square', freq: 1000, vol: 0.25, lp: 3000 });
      noise(o, { dur: 0.03, type: 'highpass', freq: 3000, vol: 0.2 });
    },

    door(open, pos) {
      const o = out(pos, 0.8);
      if (!o) return;
      noise(o, { dur: open ? 0.35 : 0.2, type: 'bandpass', freq: open ? 500 : 350, q: 2, vol: 0.5, attack: 0.02 });
      tone(o, { dur: 0.12, type: 'triangle', freq: open ? 220 : 160, vol: 0.25 });
    },

    chest(pos) {
      const o = out(pos, 0.8);
      if (!o) return;
      noise(o, { dur: 0.4, type: 'bandpass', freq: 600, freqEnd: 300, q: 3, vol: 0.4, attack: 0.05 });
    },

    fizz(pos) {
      const o = out(pos, 1);
      if (!o) return;
      noise(o, { dur: 0.6, type: 'highpass', freq: 3000, vol: 0.4 });
    },

    ignite(pos) {
      const o = out(pos, 0.8);
      if (!o) return;
      noise(o, { dur: 0.08, type: 'highpass', freq: 4000, vol: 0.5 });
      noise(o, { t: 0.05, dur: 0.4, type: 'bandpass', freq: 800, vol: 0.3, attack: 0.05 });
    },

    equip() {
      const o = out(null, 0.5);
      if (!o) return;
      noise(o, { dur: 0.2, type: 'bandpass', freq: 1800, q: 2, vol: 0.4 });
      tone(o, { dur: 0.2, type: 'triangle', freq: 600, vol: 0.12 });
    },

    shear(pos) {
      const o = out(pos, 0.8);
      if (!o) return;
      noise(o, { dur: 0.06, type: 'highpass', freq: 5000, vol: 0.5 });
      noise(o, { t: 0.1, dur: 0.06, type: 'highpass', freq: 5000, vol: 0.5 });
    },

    drink() {
      const o = out(null, 0.5);
      if (!o) return;
      tone(o, { dur: 0.12, type: 'sine', freq: rnd(250, 330), freqEnd: 500, vol: 0.4 });
    },

    // Note block: 25 pitches; instrument from the block underneath like MC.
    note(n, below, pos) {
      const o = out(pos, 1, 48);
      if (!o) return;
      const f = 185 * Math.pow(2, (n - 12) / 12);
      const m = material(below), id = below >> 4;
      if (id === 5 || id === 17 || m === 'wood') tone(o, { dur: 0.5, type: 'sawtooth', freq: f / 2, vol: 0.4, lp: 600 });
      else if (m === 'stone' || m === 'metal') { tone(o, { dur: 0.25, freq: 120, freqEnd: 40, vol: 0.8 }); noise(o, { dur: 0.1, type: 'lowpass', freq: 400, vol: 0.4 }); }
      else if (m === 'sand' || m === 'gravel') noise(o, { dur: 0.18, type: 'bandpass', freq: 1800, q: 0.7, vol: 0.6 });
      else if (m === 'glass') noise(o, { dur: 0.05, type: 'highpass', freq: 6000, vol: 0.6 });
      else { tone(o, { dur: 0.8, type: 'triangle', freq: f, vol: 0.4 }); tone(o, { dur: 0.4, type: 'sine', freq: f * 2, vol: 0.12 }); }
    },

    // Music discs: a generated calm melody per disc (the real tracks are copyrighted).
    playRecord(name, pos) {
      S.stopRecord();
      const o = out(pos, 1, 64);
      if (!o) return;
      record = o;
      let seed = 0;
      for (const c of name) seed = (seed * 31 + c.charCodeAt(0)) | 0;
      const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const scales = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 3, 7, 8], [0, 2, 5, 7, 9]];
      const scale = scales[Math.floor(r() * scales.length)];
      const root = 220 * Math.pow(2, Math.floor(r() * 7) / 12);
      const beat = 0.28 + r() * 0.2;
      let deg = 2;
      for (let i = 0; i < 96; i++) {
        deg = Math.max(0, Math.min(9, deg + Math.floor(r() * 5) - 2));
        const semis = scale[deg % 5] + 12 * Math.floor(deg / 5);
        const f = root * Math.pow(2, semis / 12);
        if (r() < 0.85) tone(o, { t: i * beat, dur: beat * (r() < 0.3 ? 3 : 1.6), type: r() < 0.5 ? 'triangle' : 'sine', freq: f, vol: 0.25 });
        if (i % 4 === 0) tone(o, { t: i * beat, dur: beat * 4, type: 'sine', freq: root / 2 * Math.pow(2, scale[(i / 4) % 5] / 12), vol: 0.18 });
      }
    },

    stopRecord() {
      if (record) { try { record.disconnect(); } catch (e) { /* already gone */ } record = null; }
    },

    portalTrigger() {
      const o = out(null, 0.6);
      if (!o) return;
      tone(o, { dur: 3.5, type: 'sawtooth', freq: 70, freqEnd: 140, vol: 0.3, lp: 500, vibrato: 8, vibRate: 3, attack: 0.8 });
      noise(o, { dur: 3.5, type: 'bandpass', freq: 400, freqEnd: 1600, q: 2, vol: 0.2, attack: 1 });
    },

    portalTravel() {
      const o = out(null, 0.7);
      if (!o) return;
      tone(o, { dur: 2, type: 'sawtooth', freq: 300, freqEnd: 60, vol: 0.35, lp: 900, vibrato: 12, vibRate: 6 });
      noise(o, { dur: 1.5, type: 'lowpass', freq: 1500, freqEnd: 200, vol: 0.3 });
    },

    levelUp() {
      const o = out(null, 0.5);
      if (!o) return;
      [523, 659, 784].forEach((f, i) => tone(o, { t: i * 0.08, dur: 0.25, type: 'triangle', freq: f, vol: 0.3 }));
    },
  };

  // UI clicks on every Minecraft-style button.
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('button.mc')) S.click(); });

  return S;
})();
