'use strict';

// Peer-to-peer rooms over WebRTC data channels. No server of our own: the public PeerJS
// broker (0.peerjs.com) only relays the connection handshake, then all game traffic goes
// directly between players. The host registers the id "vibecraft-<code>"; guests dial it.
VC.Net = (function () {
  const SERVER = 'wss://0.peerjs.com:443/peerjs';
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const PREFIX = 'vibecraft-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const FRAG = 16000; // max characters per data channel message
  const rand = (n, abc = ALPHABET) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  // WebSocket to the PeerJS broker (its signalling protocol, no library needed).
  class Signal {
    constructor(id) {
      this.id = id;
      this.handlers = {};
      this.onclose = null;
      this.ready = new Promise((res, rej) => {
        let ws;
        try { ws = new WebSocket(`${SERVER}?key=peerjs&id=${encodeURIComponent(id)}&token=${rand(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`); } catch (e) { rej(e); return; }
        this.ws = ws;
        const fail = setTimeout(() => rej(new Error('El servidor de salas no responde')), 10000);
        ws.onmessage = (ev) => {
          let m;
          try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.type === 'OPEN') { clearTimeout(fail); res(); return; }
          if (m.type === 'ID-TAKEN') { clearTimeout(fail); rej(Object.assign(new Error('Código ocupado'), { taken: true })); return; }
          if (m.type === 'ERROR') { clearTimeout(fail); rej(new Error((m.payload && m.payload.msg) || 'Error del servidor de salas')); return; }
          const h = this.handlers[m.type];
          if (h) h(m);
        };
        ws.onerror = () => { clearTimeout(fail); rej(new Error('No se pudo contactar con el servidor de salas (¿sin internet?)')); };
        ws.onclose = () => { clearTimeout(fail); if (this.onclose) this.onclose(); };
      });
      this.hb = setInterval(() => this.raw({ type: 'HEARTBEAT' }), 5000);
    }
    on(type, fn) { this.handlers[type] = fn; }
    raw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
    // The broker validates payloads like the official PeerJS client's (and drops us otherwise).
    send(type, dst, payload, connectionId) {
      this.raw({ type, dst, payload: Object.assign({ type: 'data', connectionId, label: 'game', serialization: 'raw', reliable: true, browser: 'chrome' }, payload) });
    }
    close() { clearInterval(this.hb); if (this.ws) { this.ws.onclose = null; this.ws.close(); } }
  }

  // One WebRTC connection + ordered reliable data channel, with fragmentation and backpressure.
  class Link {
    constructor(room, peerId) {
      this.room = room;
      this.id = peerId;
      this.connId = 'dc_' + rand(10, 'abcdefghijklmnopqrstuvwxyz0123456789');
      this.pc = new RTCPeerConnection({ iceServers: ICE });
      this.queue = [];
      this.pendingIce = [];
      this.parts = new Map();
      this.open = false;
      this.closed = false;
      this.pc.onicecandidate = (e) => {
        if (e.candidate && room.signal) room.signal.send('CANDIDATE', peerId, { candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }, this.connId);
      };
      this.pc.onconnectionstatechange = () => {
        const s = this.pc.connectionState;
        if (s === 'failed' || s === 'closed') this.close();
      };
    }
    attach(dc) {
      this.dc = dc;
      dc.bufferedAmountLowThreshold = 1 << 20;
      dc.onopen = () => { this.open = true; this.flush(); this.room._linkOpen(this); };
      dc.onclose = () => this.close();
      dc.onbufferedamountlow = () => this.flush();
      dc.onmessage = (e) => this.receive(e.data);
    }
    async remote(desc) {
      await this.pc.setRemoteDescription(desc);
      for (const c of this.pendingIce) this.pc.addIceCandidate(c).catch(() => {});
      this.pendingIce = [];
    }
    ice(c) {
      if (this.pc.remoteDescription) this.pc.addIceCandidate(c).catch(() => {});
      else this.pendingIce.push(c);
    }
    send(msg) {
      if (this.closed) return;
      const s = JSON.stringify(msg);
      if (s.length <= FRAG) this.queue.push(s);
      else {
        const id = rand(6), n = Math.ceil(s.length / FRAG);
        for (let i = 0; i < n; i++) this.queue.push(JSON.stringify({ t: '~', id, i, n, s: s.slice(i * FRAG, (i + 1) * FRAG) }));
      }
      this.flush();
    }
    flush() {
      if (!this.open || !this.dc || this.dc.readyState !== 'open') return;
      while (this.queue.length && this.dc.bufferedAmount < 4 << 20) {
        try { this.dc.send(this.queue.shift()); } catch (e) { this.close(); return; }
      }
    }
    receive(data) {
      let m;
      try { m = JSON.parse(data); } catch (e) { return; }
      this.last = performance.now();
      if (m.t === '~') {
        let p = this.parts.get(m.id);
        if (!p) { p = { n: m.n, got: 0, s: [] }; this.parts.set(m.id, p); }
        if (p.s[m.i] === undefined) { p.s[m.i] = m.s; p.got++; }
        if (p.got < p.n) return;
        this.parts.delete(m.id);
        try { m = JSON.parse(p.s.join('')); } catch (e) { return; }
      }
      this.room._message(this, m);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      try { if (this.dc) this.dc.close(); } catch (e) { /* ignore */ }
      try { this.pc.close(); } catch (e) { /* ignore */ }
      this.room._linkClosed(this);
    }
  }

  // A room: the host accepts many guests (star topology); a guest has a single link to the host.
  class Room {
    constructor() {
      this.links = new Map();
      this.isHost = false;
      this.code = '';
      this.onmessage = null; // (peerId, msg)
      this.onjoin = null;    // (peerId)
      this.onleave = null;   // (peerId)
      this.onclose = null;   // (reason)
    }

    async host() {
      if (typeof RTCPeerConnection === 'undefined') throw new Error('Este navegador no soporta WebRTC');
      this.isHost = true;
      for (let tries = 0; ; tries++) {
        this.code = rand(6);
        this.signal = new Signal(PREFIX + this.code);
        try { await this.signal.ready; break; } catch (e) {
          this.signal.close();
          if (!e.taken || tries > 4) throw e;
        }
      }
      this.signal.on('OFFER', async (m) => {
        const link = new Link(this, m.src);
        link.connId = m.payload.connectionId || link.connId;
        this.links.set(m.src, link);
        link.pc.ondatachannel = (e) => link.attach(e.channel);
        try {
          await link.remote(m.payload.sdp);
          const ans = await link.pc.createAnswer();
          await link.pc.setLocalDescription(ans);
          this.signal.send('ANSWER', m.src, { sdp: link.pc.localDescription }, link.connId);
        } catch (e) { console.error(e); link.close(); }
      });
      this.signal.on('CANDIDATE', (m) => { const l = this.links.get(m.src); if (l) l.ice(m.payload.candidate); });
      this.signal.onclose = () => { /* existing links keep working; nobody new can join */ };
      return this.code;
    }

    async join(code) {
      if (typeof RTCPeerConnection === 'undefined') throw new Error('Este navegador no soporta WebRTC');
      code = normCode(code);
      if (code.length < 4) throw new Error('Código de sala no válido');
      this.code = code;
      const hostId = PREFIX + code;
      this.signal = new Signal(PREFIX + 'g' + rand(10));
      await this.signal.ready;
      const link = new Link(this, hostId);
      this.links.set(hostId, link);
      link.attach(link.pc.createDataChannel('game', { ordered: true }));
      const opened = new Promise((res, rej) => {
        this._joined = res;
        this.signal.on('EXPIRE', () => rej(new Error('No existe ninguna sala con ese código (o el anfitrión la cerró)')));
        setTimeout(() => rej(new Error('No se pudo conectar con el anfitrión (red o cortafuegos que bloquea P2P)')), 20000);
      });
      this.signal.on('ANSWER', (m) => link.remote(m.payload.sdp).catch((e) => console.error(e)));
      this.signal.on('CANDIDATE', (m) => link.ice(m.payload.candidate));
      const offer = await link.pc.createOffer();
      await link.pc.setLocalDescription(offer);
      this.signal.send('OFFER', hostId, { sdp: link.pc.localDescription }, link.connId);
      try { await opened; } catch (e) { this.close(); throw e; }
      // The handshake is done: the broker is no longer needed.
      this.signal.close();
      this.signal = null;
      return hostId;
    }

    send(id, msg) { const l = this.links.get(id); if (l) l.send(msg); }
    broadcast(msg, except) { for (const [id, l] of this.links) if (id !== except && l.open) l.send(msg); }

    close(reason) {
      if (this.closedRoom) return;
      this.closedRoom = true;
      for (const l of [...this.links.values()]) { l.room = { _linkClosed() {}, signal: null }; l.close(); }
      this.links.clear();
      if (this.signal) this.signal.close();
      if (this.onclose) this.onclose(reason);
    }

    _linkOpen(link) {
      link.last = performance.now();
      if (!this.isHost && this._joined) { this._joined(); this._joined = null; }
      if (this.isHost && this.onjoin) this.onjoin(link.id);
    }
    _message(link, m) { if (this.onmessage) this.onmessage(link.id, m); }
    _linkClosed(link) {
      this.links.delete(link.id);
      if (this.isHost) { if (link.open && this.onleave) this.onleave(link.id); }
      else this.close('Se perdió la conexión con el anfitrión');
    }
  }

  return { Room, normCode };
})();
