import { CONFIG } from './config.js';
import { createRng } from './random.js';
import { project } from './projection.js';
import { sampleTerrainGrid } from './world.js';
import { planeDrawSpec, planeNose } from './aircraft.js';

const MAX_GRID = 52;
const MAX_VERTS = MAX_GRID * MAX_GRID;
const projX = new Float32Array(MAX_VERTS);
const projY = new Float32Array(MAX_VERTS);
const projBehind = new Uint8Array(MAX_VERTS);
const vertWX = new Float32Array(MAX_VERTS);
const vertWY = new Float32Array(MAX_VERTS);
const vertWZ = new Float32Array(MAX_VERTS);
const vertType = new Array(MAX_VERTS);
const quadOrder = new Int32Array(MAX_VERTS);
const quadDepth = new Float32Array(MAX_VERTS);
const tmpPt = { x: 0, y: 0, z: 0 };

const SUN_DIR = (() => {
  const x = 0.92, y = 0.27, z = 0.26;
  const inv = 1 / Math.hypot(x, y, z);
  return { x: x * inv, y: y * inv, z: z * inv };
})();

let camProbe = null;
let cachedSeed = null;
let cachedSkyData = null;
let cachedVigW = 0;
let cachedVigH = 0;
let cachedVigGrad = null;
const colorCache = new Map();
const rgbParseCache = new Map();

function nextRand(rng) {
  if (typeof rng === 'function') return rng();
  if (rng && typeof rng.next === 'function') return rng.next();
  return 0.5;
}

function getPalette() {
  const p = (CONFIG && (CONFIG.colors || CONFIG.palette)) || {};
  return {
    skyTop: p.skyTop || '#162544',
    skyMid: p.skyMid || '#476b9e',
    skyLow: p.skyLow || '#f2b880',
    sun: p.sun || '#fff3c4',
    sea: p.sea || '#1b6c8a',
    seaDeep: p.seaDeep || '#0d3b54',
    sand: p.sand || '#e5cf9b',
    grass: p.grass || '#4d8d57',
    rock: p.rock || '#6d6864',
    volcano: p.volcano || '#3b2f2d',
  };
}

function parseColor(col) {
  let rgb = rgbParseCache.get(col);
  if (rgb) return rgb;
  rgb = [120, 120, 120];
  if (typeof col === 'string') {
    const s = col.trim();
    if (s[0] === '#') {
      if (s.length === 4) {
        rgb = [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
      } else if (s.length >= 7) {
        rgb = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      }
    } else if (s.startsWith('rgb')) {
      const m = s.match(/\d+/g);
      if (m && m.length >= 3) rgb = [Number(m[0]), Number(m[1]), Number(m[2])];
    }
  }
  rgbParseCache.set(col, rgb);
  return rgb;
}

function shadeColor(baseHex, factor, warmBoost = 0) {
  const qf = Math.max(8, Math.min(56, Math.round(factor * 36)));
  const qw = Math.max(0, Math.min(16, Math.round(warmBoost * 16)));
  const key = `${baseHex}|${qf}|${qw}`;
  let out = colorCache.get(key);
  if (out) return out;
  const [r, g, b] = parseColor(baseHex);
  const k = qf / 36;
  const wb = qw / 16;
  const nr = Math.max(0, Math.min(255, Math.round(r * k + wb * 95)));
  const ng = Math.max(0, Math.min(255, Math.round(g * k + wb * 28)));
  const nb = Math.max(0, Math.min(255, Math.round(b * k - wb * 18)));
  out = `rgb(${nr},${ng},${nb})`;
  colorCache.set(key, out);
  return out;
}

function ensureCamProbe() {
  if (camProbe) return camProbe;
  const dummy = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, roll: 0, fov: 70 };
  const dirs = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  const pickForward = (yawVal) => {
    dummy.yaw = yawVal;
    dummy.pitch = 0;
    let best = dirs[0];
    let bestDist = 1e9;
    for (let i = 0; i < dirs.length; i++) {
      tmpPt.x = dirs[i].x * 100;
      tmpPt.y = 0;
      tmpPt.z = dirs[i].z * 100;
      const pr = project(dummy, tmpPt);
      if (!pr.behind) {
        const d = Math.abs(pr.x - 640) + Math.abs(pr.y - 360);
        if (d < bestDist) {
          bestDist = d;
          best = dirs[i];
        }
      }
    }
    return best;
  };
  const e0 = pickForward(0);
  const e90 = pickForward(Math.PI * 0.5);
  dummy.yaw = 0;
  dummy.pitch = 0;
  tmpPt.x = e0.x * 100;
  tmpPt.y = 0;
  tmpPt.z = e0.z * 100;
  const center0 = project(dummy, tmpPt);
  dummy.pitch = 0.25;
  tmpPt.x = e0.x * 100;
  tmpPt.y = 25;
  tmpPt.z = e0.z * 100;
  const upTest = project(dummy, tmpPt);
  tmpPt.y = -25;
  const dnTest = project(dummy, tmpPt);
  const pitchSign = Math.abs(upTest.y - center0.y) < Math.abs(dnTest.y - center0.y) ? 1 : -1;
  dummy.pitch = 0;
  tmpPt.x = e0.x * 100 + e90.x * 20;
  tmpPt.y = 0;
  tmpPt.z = e0.z * 100 + e90.z * 20;
  const rightTest = project(dummy, tmpPt);
  const rightSign = rightTest.x >= center0.x ? 1 : -1;
  camProbe = { e0, e90, pitchSign, rightSign };
  return camProbe;
}

function getCamVectors(cam) {
  const { e0, e90, pitchSign, rightSign } = ensureCamProbe();
  const cy = Math.cos(cam.yaw || 0);
  const sy = Math.sin(cam.yaw || 0);
  const hfx = e0.x * cy + e90.x * sy;
  const hfz = e0.z * cy + e90.z * sy;
  const hrx = (-e0.x * sy + e90.x * cy) * rightSign;
  const hrz = (-e0.z * sy + e90.z * cy) * rightSign;
  const cp = Math.cos(cam.pitch || 0);
  const sp = Math.sin(cam.pitch || 0) * pitchSign;
  return {
    fx: hfx * cp,
    fy: sp,
    fz: hfz * cp,
    hfx,
    hfz,
    hrx,
    hrz,
  };
}

function getSeededSky(seed) {
  if (cachedSkyData && cachedSeed === seed) return cachedSkyData;
  cachedSeed = seed;
  const rng = createRng((Number(seed) || 1) ^ 0x6c00d5);
  const layerA = [];
  const layerB = [];
  for (let i = 0; i < 16; i++) {
    const puffs = [];
    const count = 3 + Math.floor(nextRand(rng) * 3);
    for (let k = 0; k < count; k++) {
      puffs.push({
        ox: (k - (count - 1) * 0.5) * (28 + nextRand(rng) * 26),
        oy: (nextRand(rng) - 0.5) * 10,
        rx: 38 + nextRand(rng) * 44,
        ry: 11 + nextRand(rng) * 12,
      });
    }
    layerA.push({
      az: nextRand(rng) * Math.PI * 2,
      el: 0.08 + nextRand(rng) * 0.28,
      alpha: 0.42 + nextRand(rng) * 0.24,
      puffs,
    });
  }
  for (let i = 0; i < 14; i++) {
    const puffs = [];
    const count = 3 + Math.floor(nextRand(rng) * 2);
    for (let k = 0; k < count; k++) {
      puffs.push({
        ox: (k - (count - 1) * 0.5) * (34 + nextRand(rng) * 32),
        oy: (nextRand(rng) - 0.5) * 12,
        rx: 48 + nextRand(rng) * 58,
        ry: 14 + nextRand(rng) * 15,
      });
    }
    layerB.push({
      az: nextRand(rng) * Math.PI * 2,
      el: 0.05 + nextRand(rng) * 0.22,
      alpha: 0.5 + nextRand(rng) * 0.25,
      puffs,
    });
  }
  const sparkles = [];
  for (let i = 0; i < 85; i++) {
    const u = nextRand(rng);
    sparkles.push({
      dist: 65 + u * u * 2500,
      lat: (nextRand(rng) - 0.5) * 0.26,
      phase: nextRand(rng) * Math.PI * 2,
      freq: 2.2 + nextRand(rng) * 3.8,
      size: 1.5 + nextRand(rng) * 3.5,
    });
  }
  cachedSkyData = { layerA, layerB, sparkles };
  return cachedSkyData;
}

function computeHorizon(cam, cv, W, H) {
  tmpPt.x = cam.pos.x + cv.hfx * 6000 - cv.hrx * 3200;
  tmpPt.y = 0;
  tmpPt.z = cam.pos.z + cv.hfz * 6000 - cv.hrz * 3200;
  const pL = project(cam, tmpPt);
  tmpPt.x = cam.pos.x + cv.hfx * 6000 + cv.hrx * 3200;
  tmpPt.y = 0;
  tmpPt.z = cam.pos.z + cv.hfz * 6000 + cv.hrz * 3200;
  const pR = project(cam, tmpPt);
  if (!pL.behind && !pR.behind) {
    return {
      mx: (pL.x + pR.x) * 0.5,
      my: (pL.y + pR.y) * 0.5,
      angle: Math.atan2(pR.y - pL.y, pR.x - pL.x),
    };
  }
  const diag = Math.hypot(W, H) * 1.4;
  return {
    mx: W * 0.5,
    my: cv.fy >= 0 ? H + diag : -diag,
    angle: -(cam.roll || 0),
  };
}

function drawSkyAndSea(ctx, cam, cv, world, time, pal, W, H) {
  const hz = computeHorizon(cam, cv, W, H);
  const diag = Math.hypot(W, H) * 1.6;
  ctx.save();
  ctx.translate(hz.mx, hz.my);
  ctx.rotate(hz.angle);

  const skyH = Math.max(H * 0.95, 680);
  const skyGrad = ctx.createLinearGradient(0, -skyH, 0, 2);
  skyGrad.addColorStop(0, pal.skyTop);
  skyGrad.addColorStop(0.58, pal.skyMid);
  skyGrad.addColorStop(1, pal.skyLow);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(-diag, -diag * 1.5, diag * 2, diag * 1.5 + 2);

  const seaH = Math.max(H * 0.85, 620);
  const seaGrad = ctx.createLinearGradient(0, 0, 0, seaH);
  seaGrad.addColorStop(0, pal.sea);
  seaGrad.addColorStop(0.35, pal.sea);
  seaGrad.addColorStop(1, pal.seaDeep);
  ctx.fillStyle = seaGrad;
  ctx.fillRect(-diag, 0, diag * 2, diag * 1.5);

  ctx.fillStyle = pal.skyLow;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(-diag, -3, diag * 2, 7);
  ctx.globalAlpha = 1;
  ctx.restore();

  tmpPt.x = cam.pos.x + SUN_DIR.x * 5200;
  tmpPt.y = cam.pos.y + SUN_DIR.y * 5200;
  tmpPt.z = cam.pos.z + SUN_DIR.z * 5200;
  const sunP = project(cam, tmpPt);
  if (!sunP.behind && sunP.x > -240 && sunP.x < W + 240 && sunP.y > -240 && sunP.y < H + 240) {
    const glow = ctx.createRadialGradient(sunP.x, sunP.y, 12, sunP.x, sunP.y, 165);
    glow.addColorStop(0, pal.sun);
    glow.addColorStop(0.22, 'rgba(255,240,190,0.65)');
    glow.addColorStop(0.55, 'rgba(242,184,128,0.22)');
    glow.addColorStop(1, 'rgba(242,184,128,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunP.x, sunP.y, 165, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fffdf2';
    ctx.beginPath();
    ctx.arc(sunP.x, sunP.y, 25, 0, Math.PI * 2);
    ctx.fill();
  }

  const skyData = getSeededSky(world.seed);
  const drawCloudLayer = (layer, driftRate, yawParallax, dist, scaleMul) => {
    const yawShift = (cam.yaw || 0) * yawParallax;
    for (let i = 0; i < layer.length; i++) {
      const cl = layer[i];
      const az = cl.az + time * driftRate + yawShift;
      const ce = Math.cos(cl.el);
      tmpPt.x = cam.pos.x + Math.cos(az) * ce * dist;
      tmpPt.y = cam.pos.y + Math.sin(cl.el) * dist;
      tmpPt.z = cam.pos.z + Math.sin(az) * ce * dist;
      const cp = project(cam, tmpPt);
      if (cp.behind || cp.x < -220 || cp.x > W + 220 || cp.y < -160 || cp.y > H + 160) continue;
      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.rotate(hz.angle);
      for (let k = 0; k < cl.puffs.length; k++) {
        const pf = cl.puffs[k];
        ctx.globalAlpha = cl.alpha * 0.45;
        ctx.fillStyle = pal.skyLow;
        ctx.beginPath();
        ctx.ellipse(pf.ox * scaleMul, (pf.oy + 5) * scaleMul, pf.rx * scaleMul, pf.ry * scaleMul, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = cl.alpha;
        ctx.fillStyle = '#fffaf2';
        ctx.beginPath();
        ctx.ellipse(pf.ox * scaleMul, pf.oy * scaleMul, pf.rx * scaleMul, pf.ry * 0.9 * scaleMul, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
  drawCloudLayer(skyData.layerA, 0.0028, -0.12, 4600, 0.85);
  drawCloudLayer(skyData.layerB, 0.0062, 0.06, 3200, 1.12);

  const shLen = Math.hypot(SUN_DIR.x, SUN_DIR.z) || 1;
  const sx = SUN_DIR.x / shLen;
  const sz = SUN_DIR.z / shLen;
  const px = -sz;
  const pz = sx;
  ctx.fillStyle = pal.sun;
  for (let i = 0; i < skyData.sparkles.length; i++) {
    const sp = skyData.sparkles[i];
    const tw = Math.sin(time * sp.freq + sp.phase) * Math.cos(time * sp.freq * 0.61 + sp.phase * 1.7);
    if (tw <= 0.14) continue;
    const lat = sp.dist * sp.lat;
    tmpPt.x = cam.pos.x + sx * sp.dist + px * lat;
    tmpPt.y = 0;
    tmpPt.z = cam.pos.z + sz * sp.dist + pz * lat;
    const pr = project(cam, tmpPt);
    if (pr.behind || pr.x < 0 || pr.x > W || pr.y < 0 || pr.y > H) continue;
    const w = Math.min(18, 2.2 + sp.size * (900 / (sp.dist + 160)));
    const h = Math.max(1.1, w * 0.24);
    ctx.globalAlpha = Math.min(0.88, (tw - 0.14) * 0.95);
    ctx.beginPath();
    ctx.ellipse(pr.x, pr.y, w, h, hz.angle, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function isWaterType(t) {
  return !t || t === 'sea' || t === 'water' || t === 'ocean' || t === 'deep';
}

function colorForTerrain(type, avgH, slopeDot, pal, volcanoH) {
  const light = 0.84 + slopeDot * 0.22;
  const t = String(type || '').toLowerCase();
  if (t.includes('runway') || t.includes('asphalt')) {
    return shadeColor('#363940', light);
  }
  if (t.includes('volcano') || t.includes('lava') || t.includes('ash') || t.includes('crater')) {
    const hDark = Math.max(0.45, 1.04 - (avgH / (volcanoH || 260)) * 0.52);
    const ember = avgH > (volcanoH || 260) * 0.84 ? (avgH / (volcanoH || 260) - 0.84) * 3.5 : 0;
    return shadeColor(pal.volcano, hDark * light, ember);
  }
  if (t.includes('rock') || t.includes('cliff') || t.includes('stone') || avgH > 92) {
    const hDark = Math.max(0.48, 1.05 - (avgH / 240) * 0.48);
    return shadeColor(pal.rock, hDark * light);
  }
  if (t.includes('sand') || t.includes('beach') || t.includes('shore') || avgH < 4.2) {
    const beachShade = Math.min(1.08, 0.94 + avgH * 0.015);
    return shadeColor(pal.sand, beachShade * light);
  }
  const grassShade = Math.max(0.68, 1.02 - avgH * 0.0032);
  return shadeColor(pal.grass, grassShade * light);
}

function drawTerrainAndVolcano(ctx, cam, world, pal, W, H) {
  const N = 48;
  const STEP = 40;
  const snapX = Math.round(cam.pos.x / STEP) * STEP;
  const snapZ = Math.round(cam.pos.z / STEP) * STEP;
  const res = sampleTerrainGrid(world, snapX, snapZ, N, STEP);
  const raw = Array.isArray(res) ? res : (res && (res.grid || res.points || res.vertices || res.cells || res.data)) || [];
  let rows = 0;
  let cols = 0;
  const is2D = Array.isArray(raw[0]);
  if (is2D) {
    rows = Math.min(MAX_GRID, raw.length);
    cols = Math.min(MAX_GRID, raw[0].length);
  } else if (raw.length > 0) {
    const side = (res && (res.cols || res.size || res.n)) || Math.round(Math.sqrt(raw.length));
    cols = Math.min(MAX_GRID, side);
    rows = Math.min(MAX_GRID, Math.floor(raw.length / Math.max(1, cols)));
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const cell = is2D ? raw[r][c] : raw[idx];
      let wx, wy, wz, tp;
      if (cell && typeof cell === 'object') {
        wx = cell.x;
        wz = cell.z;
        wy = cell.y !== undefined ? cell.y : cell.h !== undefined ? cell.h : cell.height !== undefined ? cell.height : world.heightAt(wx, wz);
        tp = cell.type || cell.groundType || cell.ground || (wy > 0.01 ? world.groundType(wx, wz) : 'sea');
      } else {
        wx = snapX + (c - (cols - 1) * 0.5) * STEP;
        wz = snapZ + (r - (rows - 1) * 0.5) * STEP;
        wy = typeof cell === 'number' ? cell : world.heightAt(wx, wz);
        tp = wy > 0.01 ? world.groundType(wx, wz) : 'sea';
      }
      vertWX[idx] = wx;
      vertWY[idx] = wy;
      vertWZ[idx] = wz;
      vertType[idx] = tp;

      tmpPt.x = wx;
      tmpPt.y = wy > 0 ? wy : 0;
      tmpPt.z = wz;
      const pr = project(cam, tmpPt);
      projX[idx] = pr.x;
      projY[idx] = pr.y;
      projBehind[idx] = pr.behind ? 1 : 0;
    }
  }

  let qCount = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i0 = r * cols + c;
      const i1 = i0 + 1;
      const i2 = i0 + cols + 1;
      const i3 = i0 + cols;
      if (projBehind[i0] || projBehind[i1] || projBehind[i2] || projBehind[i3]) continue;
      const h0 = vertWY[i0], h1 = vertWY[i1], h2 = vertWY[i2], h3 = vertWY[i3];
      if (h0 <= 0.02 && h1 <= 0.02 && h2 <= 0.02 && h3 <= 0.02 &&
          isWaterType(vertType[i0]) && isWaterType(vertType[i1]) && isWaterType(vertType[i2]) && isWaterType(vertType[i3])) {
        continue;
      }
      const x0 = projX[i0], x1 = projX[i1], x2 = projX[i2], x3 = projX[i3];
      const y0 = projY[i0], y1 = projY[i1], y2 = projY[i2], y3 = projY[i3];
      const minX = Math.min(x0, x1, x2, x3);
      const maxX = Math.max(x0, x1, x2, x3);
      const minY = Math.min(y0, y1, y2, y3);
      const maxY = Math.max(y0, y1, y2, y3);
      if (maxX < -32 || minX > W + 32 || maxY < -32 || minY > H + 32) continue;

      const mx = (vertWX[i0] + vertWX[i2]) * 0.5 - cam.pos.x;
      const my = (Math.max(0, h0) + Math.max(0, h2)) * 0.5 - cam.pos.y;
      const mz = (vertWZ[i0] + vertWZ[i2]) * 0.5 - cam.pos.z;
      quadDepth[i0] = mx * mx + my * my + mz * mz;
      quadOrder[qCount++] = i0;
    }
  }

  if (qCount > 1) {
    quadOrder.subarray(0, qCount).sort((a, b) => quadDepth[b] - quadDepth[a]);
  }

  const volH = (world.volcano && world.volcano.h) || 260;
  let lastFill = '';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.75;
  for (let k = 0; k < qCount; k++) {
    const i0 = quadOrder[k];
    const i1 = i0 + 1;
    const i2 = i0 + cols + 1;
    const i3 = i0 + cols;
    const h0 = Math.max(0, vertWY[i0]);
    const h1 = Math.max(0, vertWY[i1]);
    const h2 = Math.max(0, vertWY[i2]);
    const h3 = Math.max(0, vertWY[i3]);
    const avgH = (h0 + h1 + h2 + h3) * 0.25;
    const dhx = (h1 + h2 - h0 - h3) * 0.5;
    const dhz = (h2 + h3 - h0 - h1) * 0.5;
    const nx = -dhx;
    const ny = STEP;
    const nz = -dhz;
    const invN = 1 / Math.hypot(nx, ny, nz);
    const slopeDot = (nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z) * invN;

    let domType = vertType[i0];
    if (isWaterType(domType)) domType = !isWaterType(vertType[i1]) ? vertType[i1] : !isWaterType(vertType[i2]) ? vertType[i2] : vertType[i3];
    const col = colorForTerrain(domType, avgH, slopeDot, pal, volH);
    if (col !== lastFill) {
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      lastFill = col;
    }
    ctx.beginPath();
    ctx.moveTo(projX[i0], projY[i0]);
    ctx.lineTo(projX[i1], projY[i1]);
    ctx.lineTo(projX[i2], projY[i2]);
    ctx.lineTo(projX[i3], projY[i3]);
    ctx.closePath();
    ctx.fill();
    if (quadDepth[i0] < 480000) ctx.stroke();
  }

  if (world.volcano) {
    const vx = world.volcano.x;
    const vz = world.volcano.z;
    const vh = world.volcano.h || 260;
    tmpPt.x = vx;
    tmpPt.y = vh;
    tmpPt.z = vz;
    const apex = project(cam, tmpPt);
    if (!apex.behind) {
      const segs = 20;
      const baseR = 320;
      const wedges = [];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const bx0 = vx + Math.cos(a0) * baseR;
        const bz0 = vz + Math.sin(a0) * baseR;
        const by0 = Math.max(0, world.heightAt(bx0, bz0));
        const bx1 = vx + Math.cos(a1) * baseR;
        const bz1 = vz + Math.sin(a1) * baseR;
        const by1 = Math.max(0, world.heightAt(bx1, bz1));
        tmpPt.x = bx0; tmpPt.y = by0; tmpPt.z = bz0;
        const p0 = project(cam, tmpPt);
        tmpPt.x = bx1; tmpPt.y = by1; tmpPt.z = bz1;
        const p1 = project(cam, tmpPt);
        if (p0.behind || p1.behind) continue;
        const am = (a0 + a1) * 0.5;
        const mx = (vx + bx0 + bx1) / 3 - cam.pos.x;
        const my = (vh + by0 + by1) / 3 - cam.pos.y;
        const mz = (vz + bz0 + bz1) / 3 - cam.pos.z;
        const sunShade = 0.68 + 0.34 * (Math.cos(am) * SUN_DIR.x + 0.55 * SUN_DIR.y + Math.sin(am) * SUN_DIR.z);
        wedges.push({
          d: mx * mx + my * my + mz * mz,
          x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y,
          col: shadeColor(pal.volcano, sunShade, 0.08),
        });
      }
      wedges.sort((a, b) => b.d - a.d);
      for (let i = 0; i < wedges.length; i++) {
        const w = wedges[i];
        ctx.fillStyle = w.col;
        ctx.strokeStyle = w.col;
        ctx.beginPath();
        ctx.moveTo(apex.x, apex.y);
        ctx.lineTo(w.x0, w.y0);
        ctx.lineTo(w.x1, w.y1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#ff6422';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        tmpPt.x = vx + Math.cos(a) * 28;
        tmpPt.y = vh + 0.5;
        tmpPt.z = vz + Math.sin(a) * 28;
        const cp = project(cam, tmpPt);
        if (cp.behind) continue;
        if (i === 0) ctx.moveTo(cp.x, cp.y);
        else ctx.lineTo(cp.x, cp.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawClippedQuad3D(ctx, cam, cv, p0, p1, p2, p3, fillStyle) {
  const near = 1.4;
  const poly = [p0, p1, p2, p3];
  const dist = (p) => (p.x - cam.pos.x) * cv.fx + (p.y - cam.pos.y) * cv.fy + (p.z - cam.pos.z) * cv.fz;
  const clipped = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % poly.length];
    const dCur = dist(cur);
    const dNxt = dist(nxt);
    const inCur = dCur >= near;
    const inNxt = dNxt >= near;
    if (inCur) clipped.push(cur);
    if (inCur !== inNxt) {
      const t = (near - dCur) / (dNxt - dCur);
      clipped.push({
        x: cur.x + (nxt.x - cur.x) * t,
        y: cur.y + (nxt.y - cur.y) * t,
        z: cur.z + (nxt.z - cur.z) * t,
      });
    }
  }
  if (clipped.length < 3) return;
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  for (let i = 0; i < clipped.length; i++) {
    tmpPt.x = clipped[i].x;
    tmpPt.y = clipped[i].y;
    tmpPt.z = clipped[i].z;
    const pr = project(cam, tmpPt);
    if (pr.behind) return;
    if (i === 0) ctx.moveTo(pr.x, pr.y);
    else ctx.lineTo(pr.x, pr.y);
  }
  ctx.closePath();
  ctx.fill();
}

export function getRunwayAxis(world) {
  const rw = world.runway || { cx: 0, cz: 0, headingDeg: 90, len: 420, wid: 26 };
  const rad = ((rw.headingDeg ?? 90) * Math.PI) / 180;
  const c1 = { dx: Math.sin(rad), dz: -Math.cos(rad) };
  const c2 = { dx: Math.cos(rad), dz: Math.sin(rad) };
  const t1 = String(world.groundType(rw.cx + c1.dx * 120, rw.cz + c1.dz * 120) || '').toLowerCase();
  const t2 = String(world.groundType(rw.cx + c2.dx * 120, rw.cz + c2.dz * 120) || '').toLowerCase();
  if (t2.includes('runway') && !t1.includes('runway')) return c2;
  if (t1.includes('runway')) return c1;
  const h0 = world.heightAt(rw.cx, rw.cz);
  const e1 = Math.abs(world.heightAt(rw.cx + c1.dx * 140, rw.cz + c1.dz * 140) - h0);
  const e2 = Math.abs(world.heightAt(rw.cx + c2.dx * 140, rw.cz + c2.dz * 140) - h0);
  return e2 + 0.25 < e1 ? c2 : c1;
}

function drawRunway(ctx, cam, cv, world) {
  const rw = world.runway;
  if (!rw) return;
  const { dx, dz } = getRunwayAxis(world);
  const { rightSign, e0, e90 } = ensureCamProbe();
  const c0 = dx * e0.x + dz * e0.z;
  const c90 = dx * e90.x + dz * e90.z;
  const yawAlong = Math.atan2(c90, c0);
  const rx = (-e0.x * Math.sin(yawAlong) + e90.x * Math.cos(yawAlong)) * rightSign;
  const rz = (-e0.z * Math.sin(yawAlong) + e90.z * Math.cos(yawAlong)) * rightSign;

  const ry = Math.max(0, world.heightAt(rw.cx, rw.cz)) + 0.08;
  const hl = (rw.len || 420) * 0.5;
  const hw = (rw.wid || 26) * 0.5;
  const pt = (s, u, lift = 0) => ({
    x: rw.cx + dx * s + rx * u,
    y: ry + lift,
    z: rw.cz + dz * s + rz * u,
  });

  drawClippedQuad3D(ctx, cam, cv, pt(-hl, -hw), pt(-hl, hw), pt(hl, hw), pt(hl, -hw), '#2b2e35');
  drawClippedQuad3D(ctx, cam, cv, pt(-hl + 2, -hw + 0.9, 0.02), pt(-hl + 2, -hw + 1.5, 0.02), pt(hl - 2, -hw + 1.5, 0.02), pt(hl - 2, -hw + 0.9, 0.02), '#e8ecf2');
  drawClippedQuad3D(ctx, cam, cv, pt(-hl + 2, hw - 1.5, 0.02), pt(-hl + 2, hw - 0.9, 0.02), pt(hl - 2, hw - 0.9, 0.02), pt(hl - 2, hw - 1.5, 0.02), '#e8ecf2');
  drawClippedQuad3D(ctx, cam, cv, pt(-hl + 42, -0.32, 0.02), pt(-hl + 42, 0.32, 0.02), pt(hl - 42, 0.32, 0.02), pt(hl - 42, -0.32, 0.02), '#f2c94c');

  for (let s = -hl + 50; s <= hl - 62; s += 24) {
    drawClippedQuad3D(ctx, cam, cv, pt(s, -0.55, 0.03), pt(s, 0.55, 0.03), pt(s + 12, 0.55, 0.03), pt(s + 12, -0.55, 0.03), '#f6f8fb');
  }

  for (const endSign of [-1, 1]) {
    const baseS = endSign * (hl - 16);
    for (const side of [-1, 1]) {
      for (let b = 0; b < 3; b++) {
        const u0 = side * (2.6 + b * 2.7);
        const u1 = u0 + side * 1.6;
        drawClippedQuad3D(ctx, cam, cv, pt(baseS - 7, u0, 0.03), pt(baseS - 7, u1, 0.03), pt(baseS + 7, u1, 0.03), pt(baseS + 7, u0, 0.03), '#f6f8fb');
      }
    }
  }

  const s0 = -hl + 27;
  const drawRect = (sA, sB, uA, uB) => {
    drawClippedQuad3D(ctx, cam, cv, pt(sA, uA, 0.04), pt(sA, uB, 0.04), pt(sB, uB, 0.04), pt(sB, uA, 0.04), '#f6f8fb');
  };
  // Digit "0" on left of centerline
  drawRect(s0, s0 + 11, -5.4, -4.3);
  drawRect(s0, s0 + 11, -2.3, -1.2);
  drawRect(s0 + 9.6, s0 + 11, -5.4, -1.2);
  drawRect(s0, s0 + 1.4, -5.4, -1.2);
  // Digit "9" on right of centerline
  drawRect(s0 + 9.6, s0 + 11, 1.2, 5.4);
  drawRect(s0 + 5.0, s0 + 6.3, 1.2, 5.4);
  drawRect(s0, s0 + 1.4, 1.2, 5.4);
  drawRect(s0 + 5.0, s0 + 11, 1.2, 2.3);
  drawRect(s0, s0 + 11, 4.3, 5.4);
}

function drawRingsAndDropZones(ctx, cam, world, mission, drops, time) {
  const rings = world.rings || [];
  const items = [];
  let firstUnpassed = -1;
  for (let i = 0; i < rings.length; i++) {
    if (!rings[i].passed && firstUnpassed === -1) firstUnpassed = i;
    const r = rings[i];
    const dx = r.x - cam.pos.x;
    const dy = r.y - cam.pos.y;
    const dz = r.z - cam.pos.z;
    items.push({ idx: i, r, d2: dx * dx + dy * dy + dz * dz });
  }
  items.sort((a, b) => b.d2 - a.d2);

  for (let n = 0; n < items.length; n++) {
    const { idx, r } = items[n];
    tmpPt.x = r.x; tmpPt.y = r.y; tmpPt.z = r.z;
    const centerP = project(cam, tmpPt);
    if (centerP.behind) continue;

    let tx = 0, tz = 1;
    if (typeof r.yaw === 'number') {
      tx = Math.sin(r.yaw);
      tz = -Math.cos(r.yaw);
    } else if (rings.length > 1) {
      const prev = idx > 0 ? rings[idx - 1] : { x: 0, z: 0 };
      const next = idx < rings.length - 1 ? rings[idx + 1] : r;
      const vx = next.x - prev.x;
      const vz = next.z - prev.z;
      const len = Math.hypot(vx, vz);
      if (len > 0.01) {
        tx = vx / len;
        tz = vz / len;
      }
    }
    const ux = -tz, uz = tx;
    const pulse = idx === firstUnpassed ? 1 + 0.06 * Math.sin(time * 6) : 1;
    const rad = (r.r || 18) * pulse;
    const pts = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const ca = Math.cos(a) * rad;
      const sa = Math.sin(a) * rad;
      tmpPt.x = r.x + ux * ca;
      tmpPt.y = r.y + sa;
      tmpPt.z = r.z + uz * ca;
      pts.push(project(cam, tmpPt));
    }

    const baseW = Math.max(2.2, Math.min(18, (centerP.scale || 0.02) * 3.8));
    const glowCol = r.passed ? '#2be37a' : '#ff7b1c';
    const coreCol = r.passed ? '#b7ffd4' : '#ffe099';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let started = false;
      for (let k = 0; k <= 12; k++) {
        const pA = pts[k % 12];
        if (pA.behind) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(pA.x, pA.y);
          started = true;
        } else {
          ctx.lineTo(pA.x, pA.y);
        }
      }
      if (pass === 0) {
        ctx.strokeStyle = glowCol;
        ctx.shadowColor = glowCol;
        ctx.shadowBlur = 18;
        ctx.globalAlpha = r.passed ? 0.45 : 0.68;
        ctx.lineWidth = baseW * 2.1;
      } else {
        ctx.strokeStyle = coreCol;
        ctx.shadowBlur = 0;
        ctx.globalAlpha = r.passed ? 0.85 : 0.96;
        ctx.lineWidth = baseW * 0.9;
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  const zones = mission && (mission.targets || mission.dropZones || mission.zones || mission.waypoints);
  if (Array.isArray(zones)) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (!z || z.done || z.hit || z.delivered || z.passed) continue;
      const zx = z.x !== undefined ? z.x : z.pos?.x;
      const zz = z.z !== undefined ? z.z : z.pos?.z;
      if (zx === undefined || zz === undefined) continue;
      const zy = (z.y !== undefined ? z.y : world.heightAt(zx, zz)) + 0.8;
      const zr = z.r || z.radius || 28;
      ctx.save();
      ctx.strokeStyle = '#4ef2ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      let ok = false;
      for (let k = 0; k <= 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        tmpPt.x = zx + Math.cos(a) * zr;
        tmpPt.y = zy;
        tmpPt.z = zz + Math.sin(a) * zr;
        const pr = project(cam, tmpPt);
        if (pr.behind) continue;
        if (!ok) { ctx.moveTo(pr.x, pr.y); ok = true; }
        else ctx.lineTo(pr.x, pr.y);
      }
      if (ok) ctx.stroke();
      ctx.restore();
    }
  }

  if (Array.isArray(drops)) {
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      tmpPt.x = d.x; tmpPt.y = d.y; tmpPt.z = d.z;
      const dp = project(cam, tmpPt);
      if (dp.behind) continue;
      const sz = Math.max(4, Math.min(22, (dp.scale || 0.02) * 5));
      ctx.fillStyle = '#fff5e4';
      ctx.beginPath();
      ctx.arc(dp.x, dp.y - sz * 1.8, sz * 1.3, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#d9792b';
      ctx.fillRect(dp.x - sz * 0.5, dp.y - sz * 0.5, sz, sz);
    }
  }
}

function drawChasePlane(ctx, game, W, H) {
  const { plane, world, effects, time } = game;
  const spec = (typeof planeDrawSpec === 'function' && planeDrawSpec()) || {};
  const cols = spec.colors || {};
  const bodyCol = cols.body || cols.fuselage || cols.primary || '#f2efe6';
  const wingCol = cols.wing || cols.wings || cols.secondary || bodyCol;
  const trimCol = cols.trim || cols.accent || cols.stripe || cols.tail || '#e34c30';
  const glassCol = cols.canopy || cols.glass || cols.cockpit || '#74c7ff';
  const rawSpan = Number(spec.wingSpan) || 11;
  const spanPx = rawSpan < 35 ? Math.max(150, Math.min(240, rawSpan * 17.5)) : Math.max(140, Math.min(260, rawSpan));
  const halfSpan = spanPx * 0.5;

  if (effects && typeof effects.spawnEngineSmoke === 'function' && plane.throttle > 0.05 && game._smokeT !== time) {
    game._smokeT = time;
    const nose = planeNose(plane);
    let fx = nose.x - plane.pos.x;
    let fy = nose.y - plane.pos.y;
    let fz = nose.z - plane.pos.z;
    const fl = Math.hypot(fx, fy, fz);
    if (fl < 0.001 || fl > 40) {
      fx = nose.x; fy = nose.y; fz = nose.z;
    }
    const inv = 1 / (Math.hypot(fx, fy, fz) || 1);
    const sx = plane.pos.x - fx * inv * 3.2;
    const sy = plane.pos.y - fy * inv * 3.2;
    const sz = plane.pos.z - fz * inv * 3.2;
    effects.spawnEngineSmoke(sx, sy, sz, plane.throttle);
  }

  const cx = W * 0.5;
  const cy = H * 0.58 + Math.max(-22, Math.min(22, -(plane.pitch || 0) * 26));
  const agl = plane.pos.y - Math.max(0, world.heightAt(plane.pos.x, plane.pos.z));
  if (agl < 18) {
    const shAlpha = Math.max(0, (1 - agl / 18) * 0.36);
    ctx.save();
    ctx.translate(cx, cy + 20 + agl * 2.2);
    ctx.fillStyle = `rgba(10,12,18,${shAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, halfSpan * 0.82, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(plane.roll || 0);

  // Spinning propeller disc + blades ahead of nose
  const propY = -20;
  const propR = 26;
  ctx.save();
  ctx.translate(0, propY);
  ctx.fillStyle = 'rgba(225,235,245,0.22)';
  ctx.beginPath();
  ctx.arc(0, 0, propR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const propAngle = time * 40;
  ctx.rotate(propAngle);
  ctx.fillStyle = 'rgba(45,50,58,0.68)';
  ctx.fillRect(-propR, -2.5, propR * 2, 5);
  ctx.rotate(Math.PI * 0.5);
  ctx.fillStyle = 'rgba(45,50,58,0.38)';
  ctx.fillRect(-propR * 0.9, -2, propR * 1.8, 4);
  ctx.restore();

  // Landing gear
  if (plane.gearDown || plane.onGround) {
    ctx.strokeStyle = '#3c434f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 8); ctx.lineTo(-24, 25);
    ctx.moveTo(12, 8); ctx.lineTo(24, 25);
    ctx.moveTo(0, 12); ctx.lineTo(0, 23);
    ctx.stroke();
    ctx.fillStyle = '#1d2026';
    ctx.fillRect(-28, 21, 7, 11);
    ctx.fillRect(21, 21, 7, 11);
    ctx.fillRect(-3, 20, 6, 8);
  }

  // Wing struts
  ctx.strokeStyle = '#9aa3b0';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-14, 7); ctx.lineTo(-halfSpan * 0.52, -7);
  ctx.moveTo(14, 7); ctx.lineTo(halfSpan * 0.52, -7);
  ctx.stroke();

  // Main high wing
  ctx.fillStyle = wingCol;
  ctx.strokeStyle = '#2d333d';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-halfSpan, -9);
  ctx.lineTo(halfSpan, -9);
  ctx.lineTo(halfSpan - 7, 1);
  ctx.lineTo(-halfSpan + 7, 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Wingtip accent stripes
  ctx.fillStyle = trimCol;
  ctx.fillRect(-halfSpan + 2, -8.5, 18, 8.5);
  ctx.fillRect(halfSpan - 20, -8.5, 18, 8.5);

  // Flaps when lowered
  if (plane.flaps) {
    ctx.fillStyle = '#d6d2c7';
    ctx.fillRect(-halfSpan * 0.5, 1, halfSpan * 0.34, 5.5);
    ctx.fillRect(halfSpan * 0.16, 1, halfSpan * 0.34, 5.5);
  }

  // Blinking nav lights: red left / green right
  const blinkOn = Math.sin(time * 5.5) > -0.25;
  const strobe = (time % 1.2) < 0.16 ? 1.35 : 0.9;
  if (blinkOn) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.85 * strobe);
    ctx.shadowBlur = 12 * strobe;
    ctx.shadowColor = '#ff2a2a';
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.arc(-halfSpan + 2, -4, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = '#2aff6a';
    ctx.fillStyle = '#35ff75';
    ctx.beginPath();
    ctx.arc(halfSpan - 2, -4, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Fuselage + canopy
  ctx.fillStyle = bodyCol;
  ctx.strokeStyle = '#2d333d';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = glassCol;
  ctx.beginPath();
  ctx.ellipse(0, -4, 10, 6.5, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = trimCol;
  ctx.fillRect(-14, 2, 28, 4);

  // Horizontal tailplane + vertical fin
  const tailSpan = halfSpan * 0.36;
  ctx.fillStyle = wingCol;
  ctx.beginPath();
  ctx.moveTo(-tailSpan, 4);
  ctx.lineTo(tailSpan, 4);
  ctx.lineTo(tailSpan - 5, 9);
  ctx.lineTo(-tailSpan + 5, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = trimCol;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(-4.5, 6);
  ctx.lineTo(4.5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawCockpitFrame(ctx, game, W, H) {
  const p = game.plane;
  ctx.save();

  // Canopy glass reflection + sight pipper
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(W * 0.5, H * 0.44, 16, 0, Math.PI * 2);
  ctx.moveTo(W * 0.5 - 26, H * 0.44); ctx.lineTo(W * 0.5 - 10, H * 0.44);
  ctx.moveTo(W * 0.5 + 10, H * 0.44); ctx.lineTo(W * 0.5 + 26, H * 0.44);
  ctx.moveTo(W * 0.5, H * 0.44 - 22); ctx.lineTo(W * 0.5, H * 0.44 - 10);
  ctx.stroke();

  // Canopy struts & top bow
  ctx.fillStyle = '#1b2029';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 28);
  ctx.quadraticCurveTo(W * 0.5, 52, 0, 28);
  ctx.closePath();
  ctx.fill();

  const drawStrut = (xTop, xBot, wTop, wBot) => {
    ctx.fillStyle = '#1f2530';
    ctx.beginPath();
    ctx.moveTo(xTop - wTop, 0);
    ctx.lineTo(xTop + wTop, 0);
    ctx.lineTo(xBot + wBot, H * 0.78);
    ctx.lineTo(xBot - wBot, H * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3c4659';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  drawStrut(W * 0.14, W * 0.04, 16, 26);
  drawStrut(W * 0.86, W * 0.96, 16, 26);

  // Glareshield
  ctx.fillStyle = '#151922';
  ctx.beginPath();
  ctx.moveTo(-10, H * 0.81);
  ctx.quadraticCurveTo(W * 0.5, H * 0.7, W + 10, H * 0.81);
  ctx.lineTo(W + 10, H * 0.85);
  ctx.lineTo(-10, H * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#394254';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-10, H * 0.81);
  ctx.quadraticCurveTo(W * 0.5, H * 0.7, W + 10, H * 0.81);
  ctx.stroke();

  // Dashboard panel
  ctx.fillStyle = '#212734';
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  ctx.quadraticCurveTo(W * 0.5, H * 0.73, W, H * 0.82);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  const drawDial = (gx, gy, r, label, normVal) => {
    ctx.fillStyle = '#11151d';
    ctx.strokeStyle = '#4f5b73';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const ang = -Math.PI * 0.75 + Math.max(0, Math.min(1, normVal)) * Math.PI * 1.5;
    ctx.strokeStyle = '#ff9d42';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(ang) * (r - 8), gy + Math.sin(ang) * (r - 8));
    ctx.stroke();
    ctx.fillStyle = '#aeb9cc';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, gx, gy + r - 10);
  };

  const gy = H * 0.895;
  drawDial(W * 0.34, gy, 44, 'SPD', (p.speed || 0) / 100);
  drawDial(W * 0.66, gy, 44, 'ALT', (p.pos.y || 0) / 350);

  // Attitude indicator center dial
  const ax = W * 0.5;
  const ar = 48;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, gy, ar, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(ax, gy);
  ctx.rotate(-(p.roll || 0));
  const pShift = Math.max(-32, Math.min(32, (p.pitch || 0) * 55));
  ctx.fillStyle = '#2d6fa3';
  ctx.fillRect(-ar * 2, -ar * 2 + pShift, ar * 4, ar * 2);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(-ar * 2, pShift, ar * 4, ar * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ar, pShift); ctx.lineTo(ar, pShift);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#5c6982';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(ax, gy, ar, 0, Math.PI * 2);
  ctx.stroke();

  // Status lamps (GEAR / FLAPS)
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = p.gearDown ? '#2ee878' : '#39414f';
  ctx.fillRect(W * 0.22 - 24, gy - 16, 48, 18);
  ctx.fillStyle = '#0d1117';
  ctx.fillText('GEAR', W * 0.22, gy - 3);

  ctx.fillStyle = p.flaps ? '#ffd15c' : '#39414f';
  ctx.fillRect(W * 0.78 - 24, gy - 16, 48, 18);
  ctx.fillStyle = '#0d1117';
  ctx.fillText('FLAPS', W * 0.78, gy - 3);

  ctx.restore();
}

function drawVignette(ctx, W, H) {
  if (!cachedVigGrad || cachedVigW !== W || cachedVigH !== H) {
    cachedVigW = W;
    cachedVigH = H;
    cachedVigGrad = ctx.createRadialGradient(
      W * 0.5, H * 0.5, Math.min(W, H) * 0.36,
      W * 0.5, H * 0.5, Math.hypot(W, H) * 0.55
    );
    cachedVigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    cachedVigGrad.addColorStop(0.72, 'rgba(12,10,22,0.12)');
    cachedVigGrad.addColorStop(1, 'rgba(10,8,18,0.52)');
  }
  ctx.fillStyle = cachedVigGrad;
  ctx.fillRect(0, 0, W, H);
}

export function render(ctx, game) {
  const W = (ctx.canvas && ctx.canvas.width) || 1280;
  const H = (ctx.canvas && ctx.canvas.height) || 720;
  const pal = getPalette();
  const { plane, world, cam, effects, mission } = game;
  const time = Number(game.time) || 0;
  const cv = getCamVectors(cam);

  const shk = effects && typeof effects.shakeOffset === 'function' ? effects.shakeOffset() : null;
  const sx = shk ? (Array.isArray(shk) ? shk[0] : shk.x || 0) : 0;
  const sy = shk ? (Array.isArray(shk) ? shk[1] : shk.y || 0) : 0;

  ctx.save();
  if (sx || sy) ctx.translate(sx, sy);

  drawSkyAndSea(ctx, cam, cv, world, time, pal, W, H);
  drawTerrainAndVolcano(ctx, cam, world, pal, W, H);
  drawRunway(ctx, cam, cv, world);
  drawRingsAndDropZones(ctx, cam, world, mission, game.drops, time);

  if (game.view === 'cockpit') {
    if (effects && typeof effects.draw === 'function') {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      effects.draw(ctx, project, cam);
    }
    drawCockpitFrame(ctx, game, W, H);
  } else {
    drawChasePlane(ctx, game, W, H);
    if (effects && typeof effects.draw === 'function') {
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      effects.draw(ctx, project, cam);
    }
  }

  ctx.restore();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  drawVignette(ctx, W, H);
}
