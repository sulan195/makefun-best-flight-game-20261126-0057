import { CONFIG } from './config.js';
import { createCamera, project, updateChaseCamera } from './projection.js';
import { createWorld } from './world.js';
import { createPlane, planeNose } from './aircraft.js';
import { MISSIONS, createMissionState, missionObjectiveText } from './missions.js';
import { createEffects } from './effects.js';
import { getRunwayAxis } from './render.js';

export const SHOT_LIST = [
  { name: '1-cover.jpg', shot: 'start', seed: 1 },
  { name: '2-cockpit.jpg', shot: 'cockpit', seed: 1 },
  { name: '3-rings.jpg', shot: 'rings', seed: 1 },
  { name: '4-landing.jpg', shot: 'landing', seed: 1 },
];

let planeBasisCache = null;
let camBasisCache = null;

function getPlaneBasis() {
  if (planeBasisCache) return planeBasisCache;
  const p = createPlane();
  p.pos.x = 0; p.pos.y = 0; p.pos.z = 0;
  p.roll = 0;
  const unitNose = (yaw, pitch) => {
    p.yaw = yaw;
    p.pitch = pitch;
    const n = planeNose(p);
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / len, y: n.y / len, z: n.z / len };
  };
  const e0 = unitNose(0, 0);
  const e90 = unitNose(Math.PI * 0.5, 0);
  const pTest = unitNose(0, 0.3);
  const pitchSign = pTest.y >= 0 ? 1 : -1;
  planeBasisCache = { e0, e90, pitchSign };
  return planeBasisCache;
}

function getCamBasis() {
  if (camBasisCache) return camBasisCache;
  const c = createCamera();
  c.pos.x = 0; c.pos.y = 0; c.pos.z = 0; c.roll = 0;
  const dirs = [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ];
  const pickDir = (yaw) => {
    c.yaw = yaw; c.pitch = 0;
    let best = dirs[0];
    let bestD = 1e9;
    for (let i = 0; i < dirs.length; i++) {
      const pr = project(c, { x: dirs[i].x * 100, y: 0, z: dirs[i].z * 100 });
      if (!pr.behind) {
        const d = Math.abs(pr.x - 640) + Math.abs(pr.y - 360);
        if (d < bestD) { bestD = d; best = dirs[i]; }
      }
    }
    return best;
  };
  const e0 = pickDir(0);
  const e90 = pickDir(Math.PI * 0.5);
  c.yaw = 0; c.pitch = 0;
  const c0 = project(c, { x: e0.x * 100, y: 0, z: e0.z * 100 });
  c.pitch = 0.25;
  const up = project(c, { x: e0.x * 100, y: 25, z: e0.z * 100 });
  const dn = project(c, { x: e0.x * 100, y: -25, z: e0.z * 100 });
  const pitchSign = Math.abs(up.y - c0.y) < Math.abs(dn.y - c0.y) ? 1 : -1;
  camBasisCache = { e0, e90, pitchSign };
  return camBasisCache;
}

export function orientPlaneToward(plane, dx, dy, dz, roll = 0) {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const { e0, e90, pitchSign } = getPlaneBasis();
  const c0 = ux * e0.x + uz * e0.z;
  const c90 = ux * e90.x + uz * e90.z;
  plane.yaw = Math.atan2(c90, c0);
  plane.pitch = pitchSign * Math.asin(Math.max(-0.98, Math.min(0.98, uy)));
  plane.roll = roll;
}

export function orientCameraToward(cam, dx, dy, dz, roll = 0) {
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const { e0, e90, pitchSign } = getCamBasis();
  const c0 = ux * e0.x + uz * e0.z;
  const c90 = ux * e90.x + uz * e90.z;
  cam.yaw = Math.atan2(c90, c0);
  cam.pitch = pitchSign * Math.asin(Math.max(-0.98, Math.min(0.98, uy)));
  cam.roll = roll;
}

export function syncCockpitCamera(cam, plane) {
  const nose = planeNose(plane);
  let fx = nose.x - plane.pos.x;
  let fy = nose.y - plane.pos.y;
  let fz = nose.z - plane.pos.z;
  const fl = Math.hypot(fx, fy, fz);
  if (fl < 0.001 || fl > 40) {
    fx = nose.x; fy = nose.y; fz = nose.z;
  }
  const inv = 1 / (Math.hypot(fx, fy, fz) || 1);
  fx *= inv; fy *= inv; fz *= inv;
  cam.pos.x = plane.pos.x + fx * 0.65;
  cam.pos.y = plane.pos.y + 0.58 + fy * 0.65;
  cam.pos.z = plane.pos.z + fz * 0.65;
  orientCameraToward(cam, fx, fy, fz, plane.roll || 0);
}

function settleChase(cam, plane, world) {
  const nose = planeNose(plane);
  let fx = nose.x - plane.pos.x;
  let fz = nose.z - plane.pos.z;
  if (Math.hypot(fx, fz) < 0.001 || Math.hypot(fx, fz) > 40) {
    fx = nose.x; fz = nose.z;
  }
  const hLen = Math.hypot(fx, fz) || 1;
  fx /= hLen; fz /= hLen;
  cam.pos.x = plane.pos.x - fx * 26;
  cam.pos.y = plane.pos.y + 7;
  cam.pos.z = plane.pos.z - fz * 26;
  orientCameraToward(cam, fx, -0.12, fz, 0);
  for (let i = 0; i < 40; i++) {
    updateChaseCamera(cam, plane, 0.05);
  }
  const minCamY = Math.max(0, world.heightAt(cam.pos.x, cam.pos.z)) + 2.2;
  if (cam.pos.y < minCamY) cam.pos.y = minCamY;
}

function setFlightState(plane, pos, dir, speed, throttle, roll, gearDown, flaps, onGround) {
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const ux = dir.x / len, uy = dir.y / len, uz = dir.z / len;
  plane.pos.x = pos.x;
  plane.pos.y = pos.y;
  plane.pos.z = pos.z;
  orientPlaneToward(plane, ux, uy, uz, roll);
  plane.speed = speed;
  plane.vel.x = ux * speed;
  plane.vel.y = uy * speed;
  plane.vel.z = uz * speed;
  plane.throttle = throttle;
  plane.gearDown = gearDown;
  plane.flaps = flaps;
  plane.onGround = onGround;
  plane.fuel = 100;
  plane.damage = 0;
}

function parseQuery(query) {
  if (!query) return { shot: null, seed: 1 };
  if (typeof query.get === 'function') {
    const shot = query.get('shot');
    const s = query.get('seed');
    return { shot: shot ? shot.trim() : null, seed: s !== null && s !== '' ? Number(s) : 1 };
  }
  if (typeof query === 'string') {
    return parseQuery(new URLSearchParams(query));
  }
  return {
    shot: query.shot || null,
    seed: query.seed !== undefined ? Number(query.seed) : 1,
  };
}

export function applyShot(game, query) {
  const { shot, seed } = parseQuery(query);
  if (!shot) return false;
  const valid = ['start', 'play', 'rings', 'landing', 'cockpit'];
  if (!valid.includes(shot)) return false;

  const cleanSeed = Number.isFinite(seed) ? seed : 1;
  const world = createWorld(cleanSeed);
  const plane = createPlane();
  const cam = createCamera();
  const effects = createEffects();
  const ringPts = CONFIG?.scoring?.ringPoints || CONFIG?.ringPoints || 250;
  const cruise = CONFIG?.physics?.cruiseSpeed || CONFIG?.cruiseSpeed || 55;
  const maxSpd = CONFIG?.physics?.maxSpeed || CONFIG?.maxSpeed || 95;

  const basePlaneY = plane.pos.y - Math.max(0, world.heightAt(plane.pos.x, plane.pos.z));
  const gearClearance = basePlaneY > 0.4 && basePlaneY < 4.5 ? basePlaneY : 1.8;

  const rw = world.runway || { cx: 0, cz: 0, headingDeg: 90, len: 420, wid: 26 };
  const { dx, dz } = getRunwayAxis(world);
  const ry = Math.max(0, world.heightAt(rw.cx, rw.cz));
  const threshX = rw.cx - dx * (rw.len * 0.43);
  const threshZ = rw.cz - dz * (rw.len * 0.43);

  let missionId = shot === 'landing' ? 'landing' : 'rings';
  let mIdx = Math.max(0, MISSIONS.findIndex((m) => m.id === missionId));
  const ms = createMissionState(missionId, world);

  game.seed = cleanSeed;
  game.world = world;
  game.plane = plane;
  game.cam = cam;
  game.effects = effects;
  game.missionIndex = mIdx;
  game.missionId = missionId;
  game.mission = ms;
  game.state = 'flying';
  game.view = 'chase';
  game.score = 0;
  game.drops = [];
  game._smokeT = -1;

  const rings = world.rings || [];

  if (shot === 'start') {
    game.time = 12.0;
    setFlightState(
      plane,
      { x: threshX, y: ry + gearClearance, z: threshZ },
      { x: dx, y: 0, z: dz },
      0, 0.7, 0, true, false, true
    );
    settleChase(cam, plane, world);
  } else if (shot === 'play') {
    game.time = 28.4;
    for (let i = 0; i < Math.min(2, rings.length); i++) rings[i].passed = true;
    game.score = Math.min(2, rings.length) * ringPts;
    if (ms && typeof ms === 'object') {
      ms.score = game.score;
      // Keep the mission's ring cursor in sync with the staged passes, or
      // the mission would re-score rings 0-1 on the first simulated frame.
      if (typeof ms.nextRingIndex === 'number') ms.nextRingIndex = Math.min(2, rings.length);
      if (typeof ms.passed === 'number') ms.passed = Math.min(2, rings.length);
      if (typeof ms.ringsPassed === 'number') ms.ringsPassed = Math.min(2, rings.length);
    }
    const target = rings[2] || rings[0] || { x: rw.cx + dx * 450, y: 80, z: rw.cz - 220 };
    const prev = rings[1] || { x: rw.cx, y: 80, z: rw.cz };
    let vx = target.x - prev.x;
    let vz = target.z - prev.z;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const px = target.x - vx * 115;
    const pz = target.z - vz * 115;
    const py = Math.max(80, world.heightAt(px, pz) + 36);
    plane.fuel = 91;
    setFlightState(
      plane,
      { x: px, y: py, z: pz },
      { x: vx, y: (target.y - py) / 140, z: vz },
      cruise, 0.8, 0.16, false, false, false
    );
    plane.fuel = 91;
    settleChase(cam, plane, world);
  } else if (shot === 'rings') {
    game.time = 35.2;
    for (let i = 0; i < Math.min(2, rings.length); i++) rings[i].passed = true;
    game.score = Math.min(2, rings.length) * ringPts;
    if (ms && typeof ms === 'object') {
      ms.score = game.score;
      if (typeof ms.nextRingIndex === 'number') ms.nextRingIndex = Math.min(2, rings.length);
    }
    const r3 = rings[2] || rings[0] || { x: 320, y: 78, z: -180, r: 18 };
    const rPrev = rings[1] || { x: rw.cx, y: 70, z: rw.cz };
    let vx = r3.x - rPrev.x;
    let vz = r3.z - rPrev.z;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const px = r3.x - vx * 20;
    const pz = r3.z - vz * 20;
    const py = Math.max(r3.y - 1.2, world.heightAt(px, pz) + 16);
    setFlightState(
      plane,
      { x: px, y: py, z: pz },
      { x: vx, y: (r3.y - py) / 22, z: vz },
      maxSpd * 0.86, 1.0, -0.22, false, false, false
    );
    plane.fuel = 86;
    settleChase(cam, plane, world);
    cam.pos.x = plane.pos.x - vx * 14.5;
    cam.pos.y = plane.pos.y + 4.0;
    cam.pos.z = plane.pos.z - vz * 14.5;
    orientCameraToward(cam, vx, (r3.y - cam.pos.y) / 38, vz, 0);
  } else if (shot === 'landing') {
    game.time = 44.0;
    const px = threshX - dx * 300;
    const pz = threshZ - dz * 300;
    const py = Math.max(ry + 36, world.heightAt(px, pz) + 22);
    const aimX = threshX + dx * 38 - px;
    const aimY = ry + gearClearance - py;
    const aimZ = threshZ + dz * 38 - pz;
    setFlightState(
      plane,
      { x: px, y: py, z: pz },
      { x: aimX, y: aimY, z: aimZ },
      36, 0.36, 0, true, true, false
    );
    plane.fuel = 74;
    settleChase(cam, plane, world);
  } else if (shot === 'cockpit') {
    game.time = 19.6;
    game.view = 'cockpit';
    if (rings.length > 0) rings[0].passed = true;
    game.score = rings.length > 0 ? ringPts : 0;
    if (ms && typeof ms === 'object') {
      ms.score = game.score;
      if (typeof ms.nextRingIndex === 'number') ms.nextRingIndex = rings.length > 0 ? 1 : 0;
    }
    const rAhead = rings[1] || rings[0] || { x: rw.cx + dx * 380, y: 76, z: rw.cz - 120, r: 18 };
    const rFrom = rings[0] || { x: rw.cx, y: 65, z: rw.cz };
    let vx = rAhead.x - rFrom.x;
    let vz = rAhead.z - rFrom.z;
    const vl = Math.hypot(vx, vz) || 1;
    vx /= vl; vz /= vl;
    const px = rAhead.x - vx * 82;
    const pz = rAhead.z - vz * 82;
    const py = Math.max(rAhead.y + 3, world.heightAt(px, pz) + 28, 68);
    setFlightState(
      plane,
      { x: px, y: py, z: pz },
      { x: vx, y: (rAhead.y + 2 - py) / 82, z: vz },
      cruise * 1.08, 0.85, 0.08, false, false, false
    );
    plane.fuel = 94;
    syncCockpitCamera(cam, plane);
  }

  game.ringsPassed = rings.filter((r) => r.passed).length;
  game.ringsTotal = rings.length;
  game.objective = missionObjectiveText(ms);
  return true;
}

export function stageShot(game, name) {
  const entry = SHOT_LIST.find((s) => s.name === name || s.shot === name);
  if (!entry) return false;
  return applyShot(game, new URLSearchParams({ shot: entry.shot, seed: String(entry.seed) }));
}
