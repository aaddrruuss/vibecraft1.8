'use strict';

VC.rng = function (seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Seeded improved Perlin noise (2D and 3D) with fractal helpers.
VC.Noise = class {
  constructor(seed) {
    const r = VC.rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  noise2(x, y) {
    const P = this.perm;
    let X = Math.floor(x), Y = Math.floor(y);
    x -= X; y -= Y;
    X &= 255; Y &= 255;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const aa = P[P[X] + Y], ab = P[P[X] + Y + 1], ba = P[P[X + 1] + Y], bb = P[P[X + 1] + Y + 1];
    const g = (h, x, y) => {
      switch (h & 7) {
        case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
        case 4: return x; case 5: return -x; case 6: return y; default: return -y;
      }
    };
    const x1 = g(aa, x, y) + u * (g(ba, x - 1, y) - g(aa, x, y));
    const x2 = g(ab, x, y - 1) + u * (g(bb, x - 1, y - 1) - g(ab, x, y - 1));
    return (x1 + v * (x2 - x1)) * 0.7;
  }

  noise3(x, y, z) {
    const P = this.perm;
    let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    X &= 255; Y &= 255; Z &= 255;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
    const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
    const g = (h, x, y, z) => {
      h &= 15;
      const a = h < 8 ? x : y;
      const b = h < 4 ? y : (h === 12 || h === 14 ? x : z);
      return ((h & 1) ? -a : a) + ((h & 2) ? -b : b);
    };
    const l = (t, a, b) => a + t * (b - a);
    return l(w,
      l(v, l(u, g(P[AA], x, y, z), g(P[BA], x - 1, y, z)),
           l(u, g(P[AB], x, y - 1, z), g(P[BB], x - 1, y - 1, z))),
      l(v, l(u, g(P[AA + 1], x, y, z - 1), g(P[BA + 1], x - 1, y, z - 1)),
           l(u, g(P[AB + 1], x, y - 1, z - 1), g(P[BB + 1], x - 1, y - 1, z - 1))));
  }

  fbm2(x, y, oct) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += this.noise2(x * f, y * f) * amp;
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }
};
