// FILE: game/src/random.js
function normalizeSeed(seed) {
  if (typeof seed === 'string') {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.floor(seed) >>> 0);
  }
  return 1337;
}

export function createRng(seed = 1337) {
  let state = normalizeSeed(seed);
  return function rng() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, a, b) {
  if (b === undefined) {
    return rng() * a;
  }
  return a + rng() * (b - a);
}

export function pick(rng, arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return undefined;
  }
  const idx = Math.min(arr.length - 1, Math.floor(rng() * arr.length));
  return arr[idx];
}

export function hash2(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = xi === x ? 0 : Math.floor((x - xi) * 2147483647);
  const zf = zi === z ? 0 : Math.floor((z - zi) * 2147483647);

  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (xi | 0), 0x85ebca6b);
  h = Math.imul(h ^ (zi | 0), 0xc2b2ae35);
  if (xf !== 0 || zf !== 0) {
    h = Math.imul(h ^ xf, 0x27d4eb2f);
    h = Math.imul(h ^ zf, 0x165667b1);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function smoothNoise(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const n00 = hash2(ix, iz, seed);
  const n10 = hash2(ix + 1, iz, seed);
  const n01 = hash2(ix, iz + 1, seed);
  const n11 = hash2(ix + 1, iz + 1, seed);

  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uz;
}

export function fbm(x, z, octaves = 4, seed = 0) {
  const count = Math.max(1, octaves | 0);
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < count; i++) {
    const ox = x * freq + i * 17.31;
    const oz = z * freq - i * 31.73;
    sum += amp * smoothNoise(ox, oz, (seed | 0) + i * 1013);
    norm += amp;
    freq *= 2.02;
    amp *= 0.5;
  }
  return norm > 0 ? sum / norm : 0;
}
