// FILE: game/src/world.js
import { CONFIG } from './config.js';
import { createRng, range, fbm } from './random.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function runwayLocalCoords(runway, x, z) {
  const rad = (runway.headingDeg * Math.PI) / 180;
  const hx = Math.sin(rad);
  const hz = -Math.cos(rad);
  const ax = -hz;
  const az = hx;
  const dx = x - runway.cx;
  const dz = z - runway.cz;
  return {
    along: dx * hx + dz * hz,
    across: dx * ax + dz * az,
  };
}

export function createWorld(seed = 42) {
  const rng = createRng(seed);
  const noiseSeed = Math.floor(rng() * 1000000);

  const runway = {
    cx: CONFIG.world.runway.cx,
    cz: CONFIG.world.runway.cz,
    headingDeg: CONFIG.world.runway.headingDeg,
    len: CONFIG.world.runway.len,
    length: CONFIG.world.runway.len,
    wid: CONFIG.world.runway.wid,
    width: CONFIG.world.runway.wid,
    elevation: CONFIG.world.runway.elevation,
  };

  const volcano = {
    x: CONFIG.world.volcano.x,
    z: CONFIG.world.volcano.z,
    h: CONFIG.world.volcano.height,
    height: CONFIG.world.volcano.height,
    radius: CONFIG.world.volcano.radius,
    craterRadius: CONFIG.world.volcano.craterRadius,
  };

  const windDir = range(rng, 0, Math.PI * 2);
  const windSpeed = range(rng, CONFIG.world.wind.minSpeed, CONFIG.world.wind.maxSpeed);
  const wind = {
    dir: windDir,
    speed: windSpeed,
    vx: Math.sin(windDir) * windSpeed,
    vz: -Math.cos(windDir) * windSpeed,
  };

  const islands = [
    { name: 'Runway Isle', x: -15, z: 35, radius: 430, peak: 30 },
    { name: 'Ember Volcano', x: volcano.x, z: volcano.z, radius: 660, peak: volcano.h },
    { name: 'Lagoon East Cay', x: 520, z: -250, radius: 245, peak: 26 },
    { name: 'Lagoon West Cay', x: -150, z: -470, radius: 270, peak: 34 },
    {
      name: 'Sunset Atoll',
      x: -760 + range(rng, -80, 80),
      z: -820 + range(rng, -80, 80),
      radius: range(rng, 260, 340),
      peak: range(rng, 52, 82),
    },
    {
      name: 'South Spire',
      x: 780 + range(rng, -90, 90),
      z: 360 + range(rng, -90, 90),
      radius: range(rng, 250, 350),
      peak: range(rng, 48, 86),
    },
    {
      name: 'Western Reach',
      x: -860 + range(rng, -80, 80),
      z: 380 + range(rng, -80, 80),
      radius: range(rng, 240, 330),
      peak: range(rng, 42, 74),
    },
    {
      name: 'North Crag',
      x: 40 + range(rng, -90, 90),
      z: -1360 + range(rng, -70, 70),
      radius: range(rng, 230, 310),
      peak: range(rng, 55, 88),
    },
  ];

  const lagoonX = 250;
  const lagoonZ = -330;

  function rawHeightAt(x, z) {
    const half = CONFIG.world.halfSize;
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));
    if (edgeDist >= half) {
      return -20;
    }

    const nLow = fbm(x * 0.0016, z * 0.0016, 4, noiseSeed);
    const nDetail = fbm(x * 0.0065, z * 0.0065, 3, noiseSeed + 71);

    let h = -16 + (nLow - 0.5) * 18;

    for (let i = 0; i < islands.length; i++) {
      const isl = islands[i];
      if (isl.name === 'Ember Volcano') continue;
      const dx = x - isl.x;
      const dz = z - isl.z;
      const distSq = dx * dx + dz * dz;
      const r = isl.radius;
      if (distSq < r * r) {
        const d = Math.sqrt(distSq) / r;
        const dome = (1 - d * d) * (1 - d);
        const ridge = 0.72 + 0.56 * nDetail;
        h = Math.max(h, -4 + dome * isl.peak * 1.45 * ridge);
      }
    }

    // Carve scenic turquoise lagoon between Runway Isle and Volcano
    const ldx = x - lagoonX;
    const ldz = z - lagoonZ;
    const lDist = Math.hypot(ldx, ldz);
    if (lDist < 310) {
      const carve = 1 - smoothstep(90, 310, lDist);
      h -= carve * 16;
    }

    // Volcano cone + summit caldera at fixed spot (600, -900)
    const vdx = x - volcano.x;
    const vdz = z - volcano.z;
    const vDist = Math.hypot(vdx, vdz);
    if (vDist < volcano.radius * 1.25) {
      const t = Math.min(1, vDist / (volcano.radius * 1.18));
      const cone = Math.pow(1 - t, 1.58) * (volcano.h + 26);
      const flutes = (nDetail - 0.5) * 22 * (1 - t) * smoothstep(35, 160, vDist);
      let vh = -6 + cone + flutes;
      if (vDist < volcano.craterRadius * 1.35) {
        const ct = 1 - smoothstep(0, volcano.craterRadius * 1.35, vDist);
        vh -= ct * 22;
      }
      h = Math.max(h, vh);
    }

    // Flatten runway strip and smooth surrounding apron
    const rw = runwayLocalCoords(runway, x, z);
    const halfLen = runway.len * 0.5;
    const halfWid = runway.wid * 0.5;
    const overAlong = Math.max(0, Math.abs(rw.along) - halfLen);
    const overAcross = Math.max(0, Math.abs(rw.across) - halfWid);
    const apronDist = Math.hypot(overAlong / 110, overAcross / 75);
    if (apronDist < 1) {
      const blend = 1 - smoothstep(0, 1, apronDist);
      const baseLand = Math.max(h, 3.2);
      h = baseLand + (runway.elevation - baseLand) * blend;
    }

    const borderFade = smoothstep(half - 320, half, edgeDist);
    return h * (1 - borderFade) - 20 * borderFade;
  }

  function heightAt(x, z) {
    const raw = rawHeightAt(x, z);
    return raw <= CONFIG.world.seaLevel ? CONFIG.world.seaLevel : raw;
  }

  function groundType(x, z) {
    const rw = runwayLocalCoords(runway, x, z);
    // 5 cm epsilon: trig in runwayLocalCoords can push a point exactly on the
    // painted edge a hair outside (e.g. across = 13.000000000000005 on a 26 m
    // wide runway); the edge is still runway, not grass.
    if (Math.abs(rw.along) <= runway.len * 0.5 + 0.05 && Math.abs(rw.across) <= runway.wid * 0.5 + 0.05) {
      return 'runway';
    }
    const raw = rawHeightAt(x, z);
    if (raw <= 0.08) {
      return 'sea';
    }
    const vDist = Math.hypot(x - volcano.x, z - volcano.z);
    if ((vDist < 420 && raw > 52) || (vDist < 250 && raw > 24)) {
      return 'volcano';
    }
    if (raw <= 4.6) {
      return 'sand';
    }
    if (raw <= 48) {
      return 'grass';
    }
    return 'rock';
  }

  // 6 scenic rings: over lagoon -> east/north/west around volcano -> back to runway
  const waypoints = [
    { x: 340, y: 46, z: -120 },
    { x: 730, y: 68, z: -470 },
    { x: 1030, y: 98, z: -920 },
    { x: 560, y: 114, z: -1370 },
    { x: 75, y: 86, z: -880 },
    { x: -380, y: 52, z: -250 },
  ];

  const rings = waypoints.map((wp, i) => {
    const rx = wp.x + range(rng, -16, 16);
    const rz = wp.z + range(rng, -16, 16);
    const minAlt = Math.max(40, heightAt(rx, rz) + 26);
    const ry = Math.max(minAlt, Math.min(120, wp.y + range(rng, -4, 4)));
    return {
      x: rx,
      y: ry,
      z: rz,
      r: CONFIG.world.ringRadius,
      passed: false,
      index: i,
      nx: 1,
      ny: 0,
      nz: 0,
      yaw: 0,
    };
  });

  for (let i = 0; i < rings.length; i++) {
    const prev = i === 0 ? { x: runway.cx + 120, z: runway.cz } : rings[i - 1];
    const next = i === rings.length - 1 ? { x: runway.cx - 210, z: runway.cz } : rings[i + 1];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    rings[i].nx = dx / len;
    rings[i].nz = dz / len;
    rings[i].yaw = Math.atan2(rings[i].nx, -rings[i].nz);
  }

  return {
    seed,
    heightAt,
    groundType,
    rings,
    runway,
    volcano,
    wind,
    islands,
  };
}

export function sampleTerrainGrid(world, cx, cz, n, step) {
  const count = Math.max(1, n | 0);
  const s = step > 0 ? step : 40;
  const baseX = Math.round(cx / s) * s;
  const baseZ = Math.round(cz / s) * s;
  const half = (count - 1) * 0.5 * s;

  const grid = new Array(count);
  for (let rz = 0; rz < count; rz++) {
    const row = new Array(count);
    const z = baseZ - half + rz * s;
    for (let rx = 0; rx < count; rx++) {
      const x = baseX - half + rx * s;
      row[rx] = {
        x,
        z,
        h: world.heightAt(x, z),
        type: world.groundType(x, z),
      };
    }
    grid[rz] = row;
  }
  return grid;
}
