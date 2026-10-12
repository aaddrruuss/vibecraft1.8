'use strict';

VC.Renderer = (function () {
  const CHUNK_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aShade;
layout(location=3) in float aSky;
layout(location=4) in float aBlk;
uniform mat4 uVP;
uniform vec3 uOffset;
uniform vec3 uCam;
out vec2 vUV;
out float vShade;
out float vSky;
out float vBlk;
out float vDist;
void main() {
  vec3 wp = aPos + uOffset;
  vBlk = aBlk;
  gl_Position = uVP * vec4(wp, 1.0);
  vUV = aUV;
  vShade = aShade;
  vSky = aSky;
  vDist = length(wp - uCam);
}`;

  const CHUNK_FS = `#version 300 es
precision highp float;
in vec2 vUV;
in float vShade;
in float vSky;
in float vBlk;
in float vDist;
uniform sampler2D uTex;
uniform float uDay;
uniform vec3 uFog;
uniform vec2 uFogRange;
uniform float uAlphaTest;
uniform vec4 uTint;
uniform float uAmbient;
out vec4 outColor;
void main() {
  vec4 t = texture(uTex, vUV);
  if (t.a < uAlphaTest) discard;
  // Sky light dims at night; block light (torches, lava...) is slightly warm.
  vec3 L = max(vec3(vSky * uDay), vBlk * vec3(1.0, 0.93, 0.8));
  L = max(L, vec3(uAmbient)) * vShade;
  vec3 c = mix(t.rgb * L, uTint.rgb, uTint.a);
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  outColor = vec4(mix(c, uFog, f), t.a);
}`;

  const FLAT_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
uniform vec3 uCam;
out float vDist;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  vDist = length(aPos - uCam);
  gl_PointSize = 2.0;
}`;

  const FLAT_FS = `#version 300 es
precision highp float;
in float vDist;
uniform vec4 uColor;
uniform vec3 uFog;
uniform vec2 uFogRange;
out vec4 outColor;
void main() {
  float f = clamp((vDist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  outColor = vec4(mix(uColor.rgb, uFog, f), uColor.a);
}`;

  const CLOUD_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uVP;
out vec3 vW;
void main() {
  vW = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;

  const CLOUD_FS = `#version 300 es
precision highp float;
in vec3 vW;
uniform sampler2D uTex;
uniform float uOff;
uniform vec3 uColor;
uniform vec3 uCam;
uniform float uFar;
out vec4 outColor;
void main() {
  vec2 uv = (vW.xz + vec2(uOff, 0.0)) / (12.0 * 128.0);
  if (texture(uTex, uv).a < 0.5) discard;
  float d = length(vW.xz - uCam.xz);
  float fade = 1.0 - smoothstep(uFar * 0.45, uFar, d);
  if (fade <= 0.0) discard;
  outColor = vec4(uColor, 0.8 * fade);
}`;

  const U = VC.util, M = VC.mat4;

  return class Renderer {
    constructor(canvas) {
      const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('Tu navegador no soporta WebGL2.');
      this.gl = gl;
      this.canvas = canvas;
      this.chunk = this.program(CHUNK_VS, CHUNK_FS, ['uVP', 'uOffset', 'uCam', 'uTex', 'uDay', 'uFog', 'uFogRange', 'uAlphaTest', 'uTint', 'uAmbient']);
      this.flat = this.program(FLAT_VS, FLAT_FS, ['uVP', 'uCam', 'uColor', 'uFog', 'uFogRange']);
      this.cloud = this.program(CLOUD_VS, CLOUD_FS, ['uVP', 'uTex', 'uOff', 'uColor', 'uCam', 'uFar']);

      this.flatVAO = gl.createVertexArray();
      this.flatVBO = gl.createBuffer();
      gl.bindVertexArray(this.flatVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
      gl.bindVertexArray(null);

      this.dynVAO = gl.createVertexArray();
      this.dynVBO = gl.createBuffer();
      gl.bindVertexArray(this.dynVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVBO);
      for (const [loc, n, off] of [[0, 3, 0], [1, 2, 12], [2, 1, 20], [3, 1, 24], [4, 1, 28]]) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 32, off);
      }
      gl.bindVertexArray(null);
      this.textures = {};

      this.cloudTex = this.makeCloudTexture();
      this.proj = M.create(); this.view = M.create(); this.vp = M.create();
      this.frustum = new VC.Frustum();
      this.cam = new Float32Array(3);
      this.fogColor = new Float32Array(3);
      this.visible = [];
      this.stats = { drawn: 0 };

      const r = VC.rng(99);
      this.stars = [];
      for (let i = 0; i < 500; i++) {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        this.stars.push([s * Math.cos(a), u, s * Math.sin(a)]);
      }
      this.starBuf = new Float32Array(this.stars.length * 3);
      gl.enable(gl.DEPTH_TEST);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    program(vs, fs, uniforms) {
      const gl = this.gl;
      const sh = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const u = {};
      for (const n of uniforms) u[n] = gl.getUniformLocation(p, n);
      return { p, u };
    }

    setAtlas(canvas) {
      this.atlas = this.setTexture('blocks', canvas);
    }

    setTexture(name, canvas) {
      const gl = this.gl;
      if (this.textures[name]) gl.deleteTexture(this.textures[name]);
      const t = gl.createTexture();
      this.textures[name] = t;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    // Draws CPU-built geometry (entities, hand, overlays) with the chunk shader.
    // batch: { tex, buf: {a, n}, ranges?: [{start, count, tint}] }
    drawBatch(batch) {
      const gl = this.gl, u = this.chunk.u;
      if (!batch.buf.n) return;
      gl.bindVertexArray(this.dynVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.dynVBO);
      gl.bufferData(gl.ARRAY_BUFFER, batch.buf.a.subarray(0, batch.buf.n * 8), gl.STREAM_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[batch.tex]);
      gl.uniform3f(u.uOffset, 0, 0, 0);
      const ranges = batch.ranges || [{ start: 0, count: batch.buf.n, tint: null }];
      for (const r of ranges) {
        if (!r.count) continue;
        const t = r.tint || [0, 0, 0, 0];
        gl.uniform4f(u.uTint, t[0], t[1], t[2], t[3]);
        gl.drawArrays(gl.TRIANGLES, r.start, r.count);
      }
      gl.uniform4f(u.uTint, 0, 0, 0, 0);
    }

    makeCloudTexture() {
      const gl = this.gl, S = 128, r = VC.rng(4242);
      let a = new Float32Array(S * S);
      for (let i = 0; i < a.length; i++) a[i] = r();
      for (let pass = 0; pass < 3; pass++) {
        const b = new Float32Array(S * S);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
          let s = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
            s += a[((y + dy + S) % S) * S + ((x + dx + S) % S)];
          b[y * S + x] = s / 25;
        }
        a = b;
      }
      const sorted = Array.from(a).sort((p, q) => p - q), thr = sorted[Math.floor(sorted.length * 0.62)];
      const data = new Uint8Array(S * S * 4);
      for (let i = 0; i < S * S; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
        data[i * 4 + 3] = a[i] > thr ? 255 : 0;
      }
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, S, S, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    }

    makeMesh(part) {
      if (!part.count) return null;
      const gl = this.gl;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, part.v, gl.STATIC_DRAW);
      const st = 32;
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, st, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, st, 20);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 24);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 28);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.i, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, vbo, ibo, count: part.count };
    }

    upload(ch, mesh) {
      this.free(ch);
      ch.mesh = { o: this.makeMesh(mesh.o), w: this.makeMesh(mesh.w) };
    }

    free(ch) {
      if (!ch.mesh) return;
      const gl = this.gl;
      for (const m of [ch.mesh.o, ch.mesh.w]) {
        if (!m) continue;
        gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo);
      }
      ch.mesh = null;
    }

    drawFlat(data, mode, color, fogRange) {
      const gl = this.gl, f = this.flat;
      gl.useProgram(f.p);
      gl.bindVertexArray(this.flatVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(f.u.uVP, false, this.vp);
      gl.uniform3fv(f.u.uCam, this.cam);
      gl.uniform4f(f.u.uColor, color[0], color[1], color[2], color[3]);
      gl.uniform3fv(f.u.uFog, this.fogColor);
      gl.uniform2f(f.u.uFogRange, fogRange[0], fogRange[1]);
      gl.drawArrays(mode, 0, data.length / 3);
    }

    // Quad centred at cam + dir*dist, spanned by unit vectors a and b.
    billboard(dir, a, b, dist, size) {
      const c = this.cam, out = new Float32Array(18);
      const cx = c[0] + dir[0] * dist, cy = c[1] + dir[1] * dist, cz = c[2] + dir[2] * dist;
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      pts.forEach(([s, t], i) => {
        out[i * 3] = cx + (a[0] * s + b[0] * t) * size;
        out[i * 3 + 1] = cy + (a[1] * s + b[1] * t) * size;
        out[i * 3 + 2] = cz + (a[2] * s + b[2] * t) * size;
      });
      return out;
    }

    render(s) {
      const gl = this.gl, c = this.canvas;
      gl.viewport(0, 0, c.width, c.height);
      const viewDist = s.renderDist * 16;
      const far = Math.max(300, viewDist + 64);
      M.perspective(this.proj, s.fov * Math.PI / 180, c.width / c.height, 0.08, far);
      const cp = Math.cos(s.pitch);
      const fwd = [-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp];
      this.cam.set(s.eye);
      M.lookDir(this.view, s.eye, fwd, [0, 1, 0]);
      M.multiply(this.vp, this.proj, this.view);
      this.frustum.setFromMatrix(this.vp);

      // Sky / time of day
      const ang = (s.time / 24000) * Math.PI * 2;
      const sunH = Math.sin(ang);
      const day = U.smoothstep(-0.2, 0.25, sunH);
      const daylight = 0.12 + 0.88 * day;
      const skyCol = U.mix3([0.0, 0.0, 0.03], [0.47, 0.65, 1.0], day);
      let fog = U.mix3([0.02, 0.02, 0.06], [0.73, 0.84, 1.0], day);
      const sunset = Math.max(0, 1 - Math.abs(sunH) / 0.3);
      fog = U.mix3(fog, [0.98, 0.62, 0.38], sunset * day * 0.35);
      let fogRange = [viewDist * 0.55, viewDist * 0.95];
      if (s.nether) {
        fog = [0.2, 0.03, 0.03];
        fogRange = [Math.min(24, viewDist * 0.2), Math.min(110, viewDist * 0.8)];
      }
      if (s.underwater === 'lava') {
        fog = [0.6, 0.1, 0.0];
        fogRange = [0, 2];
      } else if (s.underwater) {
        fog = [0.04 * daylight, 0.1 * daylight, 0.35 * daylight];
        fogRange = [0.5, 16];
      }
      this.fogColor.set(fog);
      this.daylight = daylight;

      gl.clearColor(fog[0], fog[1], fog[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const e = s.eye;
      if (!s.underwater && !s.nether) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        const R = far * 0.9, y = e[1] + 16;
        const plane = new Float32Array([
          e[0] - R, y, e[2] - R, e[0] + R, y, e[2] - R, e[0] + R, y, e[2] + R,
          e[0] - R, y, e[2] - R, e[0] + R, y, e[2] + R, e[0] - R, y, e[2] + R,
        ]);
        this.drawFlat(plane, gl.TRIANGLES, [skyCol[0], skyCol[1], skyCol[2], 1], [0, viewDist * 0.8]);

        gl.enable(gl.BLEND);
        const sinA = Math.sin(ang), cosA = Math.cos(ang);
        if (day < 1) {
          const sb = this.starBuf;
          this.stars.forEach((p, i) => {
            const x = p[0] * cosA - p[1] * sinA, yy = p[0] * sinA + p[1] * cosA;
            sb[i * 3] = e[0] + x * 200; sb[i * 3 + 1] = e[1] + yy * 200; sb[i * 3 + 2] = e[2] + p[2] * 200;
          });
          this.drawFlat(sb, gl.POINTS, [1, 1, 1, (1 - day) * 0.9], [1e9, 2e9]);
        }
        const sunDir = [cosA, sinA, 0], perp = [-sinA, cosA, 0], side = [0, 0, 1];
        this.drawFlat(this.billboard(sunDir, side, perp, 200, 13), gl.TRIANGLES, [1, 0.96, 0.62, 1], [1e9, 2e9]);
        this.drawFlat(this.billboard([-cosA, -sinA, 0], side, perp, 200, 10), gl.TRIANGLES, [0.86, 0.89, 0.96, 1], [1e9, 2e9]);
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
      }

      // Opaque + cutout geometry
      const ch = this.chunk;
      gl.useProgram(ch.p);
      gl.uniformMatrix4fv(ch.u.uVP, false, this.vp);
      gl.uniform3fv(ch.u.uCam, this.cam);
      gl.uniform1i(ch.u.uTex, 0);
      gl.uniform1f(ch.u.uDay, daylight);
      gl.uniform3fv(ch.u.uFog, this.fogColor);
      gl.uniform2f(ch.u.uFogRange, fogRange[0], fogRange[1]);
      gl.uniform1f(ch.u.uAlphaTest, 0.5);
      gl.uniform4f(ch.u.uTint, 0, 0, 0, 0);
      gl.uniform1f(ch.u.uAmbient, s.nether ? 0.3 : 0.035);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.enable(gl.CULL_FACE);

      const vis = this.visible;
      vis.length = 0;
      for (const c2 of s.world.chunks.values()) {
        if (!c2.mesh) continue;
        const x0 = c2.cx * 16, z0 = c2.cz * 16;
        if (!this.frustum.boxVisible(x0, 0, z0, x0 + 16, c2.top + 2, z0 + 16)) continue;
        vis.push(c2);
        const m = c2.mesh.o;
        if (!m) continue;
        gl.uniform3f(ch.u.uOffset, x0, 0, z0);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }
      this.stats.drawn = vis.length;

      // Entities and the block-breaking overlay
      gl.disable(gl.CULL_FACE);
      for (const b of s.batches || []) this.drawBatch(b);
      if (s.crack) {
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -1);
        this.drawBatch(s.crack);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.bindVertexArray(null);
      gl.useProgram(ch.p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);

      // Water (translucent)
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.uniform1f(ch.u.uAlphaTest, 0.0);
      for (const c2 of vis) {
        const m = c2.mesh.w;
        if (!m) continue;
        gl.uniform3f(ch.u.uOffset, c2.cx * 16, 0, c2.cz * 16);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      }

      // Clouds
      if (!s.underwater && !s.nether) {
        const cl = this.cloud, R = Math.min(far * 0.95, viewDist + 120), y = 110.5;
        const quad = new Float32Array([
          e[0] - R, y, e[2] - R, e[0] + R, y, e[2] - R, e[0] + R, y, e[2] + R,
          e[0] - R, y, e[2] - R, e[0] + R, y, e[2] + R, e[0] - R, y, e[2] + R,
        ]);
        gl.useProgram(cl.p);
        gl.bindVertexArray(this.flatVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.flatVBO);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.DYNAMIC_DRAW);
        gl.uniformMatrix4fv(cl.u.uVP, false, this.vp);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
        gl.uniform1i(cl.u.uTex, 0);
        gl.uniform1f(cl.u.uOff, (s.totalTime * 0.6) % (12 * 128));
        const cb = 0.25 + 0.75 * day;
        gl.uniform3f(cl.u.uColor, cb, cb, cb * 1.02);
        gl.uniform3fv(cl.u.uCam, this.cam);
        gl.uniform1f(cl.u.uFar, R);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      // Block selection outline
      if (s.target) {
        const t = s.target, a = 0.002, bx = t.box || [0, 0, 0, 1, 1, 1];
        const x0 = t.x + bx[0] - a, y0 = t.y + bx[1] - a, z0 = t.z + bx[2] - a, x1 = t.x + bx[3] + a, y1 = t.y + bx[4] + a, z1 = t.z + bx[5] + a;
        const L = [
          x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0,
          x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0,
          x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1,
        ];
        this.drawFlat(new Float32Array(L), gl.LINES, [0, 0, 0, 0.45], [1e9, 2e9]);
      }

      // First-person hand, drawn on top of the world.
      if (s.hand && s.hand.length) {
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.useProgram(ch.p);
        gl.uniform2f(ch.u.uFogRange, 1e9, 2e9);
        gl.uniform1f(ch.u.uAlphaTest, 0.5);
        for (const b of s.hand) this.drawBatch(b);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
  };
})();
