// Ember Isles — automated test suite (Node 22, stdlib only).
// Run: node tests/test.mjs   (exit 0 = all pass)
// Covers: core functionality, all 15 Fase-2 edge cases, determinism, benchmarks.
import assert from 'node:assert/strict';
import { createRng, range, fbm, hash2 } from '../game/src/random.js';
import { CONFIG } from '../game/src/config.js';
import { createCamera, project, updateChaseCamera } from '../game/src/projection.js';
import { createWorld, sampleTerrainGrid } from '../game/src/world.js';
import {
  createPlane, stepPlane, checkRingPass, checkCrash, checkRunwayTouchdown, planeSpeed,
} from '../game/src/aircraft.js';
import { createInput } from '../game/src/input.js';
import { MISSIONS, createMissionState, updateMission, missionObjectiveText } from '../game/src/missions.js';
import { createAudio } from '../game/src/audio.js';
import { createEffects } from '../game/src/effects.js';
import { applyShot, stageShot, SHOT_LIST } from '../game/src/shots.js';
import { getRunwayAxis } from '../game/src/render.js';

let passed = 0;
let failed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    failures.push(name + ': ' + e.message);
    console.log('FAIL ' + name + ' — ' + e.message);
  }
}
function approx(a, b, eps = 1e-9) { assert.ok(Math.abs(a - b) <= eps, `${a} != ${b} ±${eps}`); }
function noNaN(p) {
  for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(p.pos[k]), 'pos.' + k + ' NaN');
  for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(p.vel[k]), 'vel.' + k + ' NaN');
  assert.ok(Number.isFinite(p.speed) && Number.isFinite(p.fuel), 'speed/fuel NaN');
}

// ---------- random ----------
test('random: same seed reproduces sequence', () => {
  const a = createRng(42); const b = createRng(42);
  for (let i = 0; i < 200; i++) approx(a(), b());
});
test('random: range/pick within bounds', () => {
  const r = createRng(7);
  for (let i = 0; i < 500; i++) { const v = range(r, -3, 9); assert.ok(v >= -3 && v < 9); }
  const r2 = createRng(11);
  for (let i = 0; i < 200; i++) { const v = range(r2, 5); assert.ok(v >= 0 && v < 5); }
  const r3 = createRng(13);
  for (let i = 0; i < 200; i++) {
    const v = [10, 20, 30][Math.floor(r3() * 3)];
    assert.ok([10, 20, 30].includes(v));
  }
});
test('random: fbm in [0,1], hash2 deterministic', () => {
  for (let i = 0; i < 200; i++) {
    const v = fbm(i * 0.37, i * 0.91, 4, 99);
    assert.ok(v >= 0 && v <= 1, 'fbm out of range ' + v);
  }
  approx(hash2(3, 4, 5), hash2(3, 4, 5));
});

// ---------- world ----------
test('world: deterministic heights for same seed', () => {
  const w1 = createWorld(42); const w2 = createWorld(42);
  const r = createRng(3);
  for (let i = 0; i < 60; i++) {
    const x = (r() - 0.5) * 3000; const z = (r() - 0.5) * 3000;
    approx(w1.heightAt(x, z), w2.heightAt(x, z));
    assert.equal(w1.groundType(x, z), w2.groundType(x, z));
  }
});
test('world: runway is flat at elevation, center is runway', () => {
  const w = createWorld(42);
  assert.equal(w.groundType(0, 0), 'runway');
  const h0 = w.heightAt(0, 0);
  approx(h0, CONFIG.world.runway.elevation, 0.6);
  for (const s of [-180, -90, 0, 90, 180]) {
    approx(w.heightAt(s, 0), CONFIG.world.runway.elevation, 0.6);
  }
});
test('world: rings float above terrain, 6 rings, ordered path', () => {
  const w = createWorld(42);
  assert.equal(w.rings.length, 6);
  for (const ring of w.rings) {
    assert.ok(ring.y > w.heightAt(ring.x, ring.z) + 20, 'ring too low');
    assert.ok(ring.r > 10 && ring.r < 60);
  }
  assert.ok(Math.abs(w.wind.speed) >= CONFIG.world.wind.minSpeed - 0.01);
  assert.ok(Math.abs(w.wind.speed) <= CONFIG.world.wind.maxSpeed + 0.01);
});
test('world: sampleTerrainGrid shape + sea at far edge', () => {
  const w = createWorld(42);
  const g = sampleTerrainGrid(w, 0, 0, 9, 40);
  assert.equal(g.length, 9); assert.equal(g[0].length, 9);
  assert.ok(w.heightAt(1900, 1900) <= 0.01, 'far corner should be sea level');
});

// ---------- projection ----------
test('projection: point ahead projects on-screen, behind flagged', () => {
  const cam = createCamera();
  cam.pos = { x: 0, y: 10, z: 0 }; cam.yaw = 0; cam.pitch = 0; cam.roll = 0;
  const ahead = project(cam, { x: 0, y: 10, z: -100 });
  assert.ok(!ahead.behind && Math.abs(ahead.x - 640) < 2 && Math.abs(ahead.y - 360) < 2);
  const behind = project(cam, { x: 0, y: 10, z: 100 });
  assert.ok(behind.behind);
});
test('projection: chase camera converges on plane', () => {
  const cam = createCamera(); const plane = createPlane();
  plane.pos = { x: 100, y: 40, z: -200 };
  cam.pos = { x: 0, y: 0, z: 0 }; // far from the plane: must converge
  const d0 = Math.hypot(cam.pos.x - plane.pos.x, cam.pos.y - plane.pos.y, cam.pos.z - plane.pos.z);
  assert.ok(d0 > 200, 'setup: camera should start far, got ' + d0);
  for (let i = 0; i < 180; i++) updateChaseCamera(cam, plane, 1 / 60);
  const d1 = Math.hypot(cam.pos.x - plane.pos.x, cam.pos.y - plane.pos.y, cam.pos.z - plane.pos.z);
  assert.ok(d1 < d0 * 0.25, 'chase dist should shrink toward ~27, got ' + d1);
  assert.ok(d1 > 10 && d1 < 60, 'chase dist ' + d1);
});

// ---------- aircraft physics ----------
test('aircraft: takeoff — full throttle + pitch reaches liftoff', () => {
  const w = createWorld(42); const p = createPlane();
  let liftoff = false;
  for (let i = 0; i < 60 * 30 && !liftoff; i++) {
    const ev = stepPlane(p, { throttleDelta: 1, pitch: 1 }, w, 1 / 60);
    if (ev.some((e) => e.type === 'liftoff')) liftoff = true;
    noNaN(p);
  }
  assert.ok(liftoff, 'no liftoff in 30s; speed=' + p.speed + ' onGround=' + p.onGround);
  assert.ok(!p.onGround && p.pos.y > w.heightAt(p.pos.x, p.pos.z));
});
test('aircraft: stall at low airspeed in flight', () => {
  const w = createWorld(42); const p = createPlane();
  p.onGround = false; p.pos.y = 120; p.vel = { x: 0, y: 0, z: -5 }; p.speed = 5;
  stepPlane(p, { throttleDelta: 0 }, w, 0.5);
  assert.ok(p.stall || p.stalling, 'expected stall flag');
});
test('aircraft: ring pass only through the ring plane, forward direction', () => {
  const w = createWorld(42); const ring = w.rings[0];
  const p = createPlane();
  p.prevPos = { x: ring.x - ring.nx * 5, y: ring.y, z: ring.z - ring.nz * 5 };
  p.pos = { x: ring.x + ring.nx * 5, y: ring.y, z: ring.z + ring.nz * 5 };
  p.vel = { x: ring.nx * 40, y: 0, z: ring.nz * 40 };
  assert.ok(checkRingPass(p, ring), 'forward pass through center should count');
  const p2 = createPlane();
  p2.prevPos = { x: ring.x + ring.nx * 5, y: ring.y, z: ring.z + ring.nz * 5 };
  p2.pos = { x: ring.x - ring.nx * 5, y: ring.y, z: ring.z - ring.nz * 5 };
  p2.vel = { x: -ring.nx * 40, y: 0, z: -ring.nz * 40 };
  assert.ok(!checkRingPass(p2, ring), 'backward pass must not count');
  const p3 = createPlane();
  p3.prevPos = { x: ring.x - ring.nx * 5, y: ring.y + ring.r + 30, z: ring.z - ring.nz * 5 };
  p3.pos = { x: ring.x + ring.nx * 5, y: ring.y + ring.r + 30, z: ring.z + ring.nz * 5 };
  p3.vel = { x: ring.nx * 40, y: 0, z: ring.nz * 40 };
  assert.ok(!checkRingPass(p3, ring), 'pass outside ring radius must not count');
});
test('aircraft: crash into sea is detected', () => {
  const w = createWorld(42); const p = createPlane();
  p.onGround = false; p.pos = { x: 1900, y: 0.5, z: 1900 }; p.vel = { x: 0, y: -20, z: 0 };
  const c = checkCrash(p, w);
  assert.ok(c && c.type === 'crash', 'expected crash, got ' + JSON.stringify(c));
});
test('aircraft: gentle runway touchdown scores >= base', () => {
  const w = createWorld(42); const p = createPlane();
  p.onGround = false; p.pos = { x: 0, y: w.heightAt(0, 0) + 1.7, z: 0 };
  p.vel = { x: 0, y: -1.5, z: -30 }; p.yaw = Math.PI / 2; p.gearDown = true;
  const td = checkRunwayTouchdown(p, w);
  assert.ok(td.onRunway && td.score >= CONFIG.scoring.landingBase, 'td=' + JSON.stringify(td));
  assert.ok(td.perfect || td.score > 100);
});
test('aircraft: fuel burns with throttle, zero fuel = no thrust', () => {
  const w = createWorld(42); const p = createPlane();
  const f0 = p.fuel;
  for (let i = 0; i < 60; i++) stepPlane(p, { throttleDelta: 1 }, w, 1 / 60);
  assert.ok(p.fuel < f0, 'fuel should burn');
  p.fuel = 0; p.onGround = true; p.speed = 0;
  for (let i = 0; i < 120; i++) stepPlane(p, { throttleDelta: 1 }, w, 1 / 60);
  assert.ok(p.speed < 1, 'no thrust without fuel, speed=' + p.speed);
});
test('aircraft: NaN guards — dt 0/NaN/huge never corrupts state', () => {
  const w = createWorld(42); const p = createPlane();
  stepPlane(p, {}, w, 0); noNaN(p);
  stepPlane(p, { throttleDelta: 1 }, w, NaN); noNaN(p);
  stepPlane(p, { throttleDelta: 1, pitch: 1 }, w, 5); noNaN(p);
  assert.ok(Math.abs(p.pos.x) < 1000 && Math.abs(p.pos.z) < 1000, 'huge dt must be clamped');
});

// ---------- missions ----------
function autopilotInput(p, target, world) {
  const dx = target.x - p.pos.x; const dy = target.y - p.pos.y; const dz = target.z - p.pos.z;
  const wantYaw = Math.atan2(dx, -dz);
  let err = wantYaw - p.yaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const roll = Math.max(-1, Math.min(1, err * 1.6 - p.roll * 1.2));
  // PD on climb rate + terrain clearance: never fly below terrain+28 ahead,
  // or the straight ring-to-ring line clips the volcano flank.
  let wantAlt = target.y;
  if (world) {
    const aheadX = p.pos.x + Math.sin(p.yaw) * 120, aheadZ = p.pos.z - Math.cos(p.yaw) * 120;
    wantAlt = Math.max(target.y, world.heightAt(p.pos.x, p.pos.z) + 28, world.heightAt(aheadX, aheadZ) + 28);
  }
  const wantVy = Math.max(-8, Math.min(12, (wantAlt - p.pos.y) * 0.3));
  const pitch = Math.max(-1, Math.min(1, (wantVy - p.vel.y) * 0.08));
  return { throttleDelta: 1, pitch, roll, yaw: Math.max(-1, Math.min(1, err * 0.5)) };
}
test('missions: autopilot completes Ring Race (end-to-end)', () => {
  const w = createWorld(42); const p = createPlane();
  const ms = createMissionState('rings', w);
  let done = false; let crashed = false;
  for (let i = 0; i < 60 * 240 && !done && !crashed; i++) {
    const ring = w.rings[ms.nextRingIndex] || w.rings[0];
    const ev = stepPlane(p, autopilotInput(p, ring, w), w, 1 / 60);
    const out = updateMission(ms, p, w, ev, 1 / 60, null);
    if (ms.done) done = true;
    if (ms.failed) crashed = true;
    if (i % 600 === 0) noNaN(p);
  }
  assert.ok(done, 'ring race not completed; rings=' + ms.nextRingIndex + '/6 score=' + ms.score + ' failed=' + ms.failed + ' ' + ms.reason);
  assert.ok(ms.score >= 6 * CONFIG.scoring.ringPoints, 'score ' + ms.score);
});
test('missions: ring combo multiplies points within 12s, resets after gap or wrong way', () => {
  const w = createWorld(42); const p = createPlane();
  const ms = createMissionState('rings', w);
  const ringEv = (i) => [{ type: 'ring', ring: w.rings[i], index: i }];
  const advance = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) updateMission(ms, p, w, [], 1 / 60, null); };
  updateMission(ms, p, w, ringEv(0), 1 / 60, null);
  assert.equal(ms.score, 250, 'first ring is x1 = 250');
  assert.equal(ms.combo, 1);
  advance(5);
  updateMission(ms, p, w, ringEv(1), 1 / 60, null);
  assert.equal(ms.combo, 2, 'second ring within 12s chains to x2');
  assert.equal(ms.score, 750, '250 + 500');
  assert.equal(ms.lastRingPoints, 500);
  advance(13);
  updateMission(ms, p, w, ringEv(2), 1 / 60, null);
  assert.equal(ms.combo, 1, 'gap over 12s resets combo');
  assert.equal(ms.score, 1000, '750 + 250');
  // Wrong way resets the combo without scoring.
  updateMission(ms, p, w, [{ type: 'ring', ring: w.rings[4], index: 4 }], 1 / 60, null);
  assert.equal(ms.score, 1000, 'wrong-way ring scores nothing');
  assert.equal(ms.combo, 1);
  // Combo caps at x5: chain five quick rings from a fresh mission.
  const ms2 = createMissionState('rings', w);
  for (let i = 0; i < 5; i++) {
    updateMission(ms2, p, w, [{ type: 'ring', ring: w.rings[i], index: i }], 1 / 60, null);
  }
  assert.equal(ms2.combo, 5, 'combo caps at x5');
  assert.equal(ms2.score, 250 + 500 + 750 + 1000 + 1250, 'capped combo sum');
});
test('missions: landing phases advance takeoff -> circuit -> approach -> done', () => {
  const w = createWorld(42); const p = createPlane();
  const ms = createMissionState('landing', w);
  assert.equal(ms.phase, 'takeoff');
  p.onGround = false; p.pos.y = w.heightAt(0, 0) + 20;
  updateMission(ms, p, w, [{ type: 'liftoff', speed: 50 }], 1 / 60, null);
  assert.equal(ms.phase, 'circuit');
  p.pos = { x: 500, y: 60, z: 0 };
  updateMission(ms, p, w, [], 1 / 60, null);
  assert.equal(ms.phase, 'approach');
  p.pos = { x: 0, y: w.heightAt(0, 0) + 1.7, z: 0 }; p.vel = { x: 0, y: -1, z: -25 };
  p.yaw = Math.PI / 2; p.onGround = true; p.gearDown = true;
  updateMission(ms, p, w, [{ type: 'touchdown', onRunway: true, score: 300, perfect: true }], 1 / 60, null);
  assert.ok(ms.done, 'landing mission should complete; phase=' + ms.phase);
  assert.ok(ms.score > 0);
});
test('missions: off-runway touchdown/hardLanding do not complete landing (Luna Fase 5)', () => {
  const w = createWorld(42); const p = createPlane();
  const ms = createMissionState('landing', w);
  p.onGround = false; p.pos.y = w.heightAt(0, 0) + 20;
  updateMission(ms, p, w, [{ type: 'liftoff', speed: 50 }], 1 / 60, null);
  p.pos = { x: 500, y: 60, z: 0 };
  updateMission(ms, p, w, [], 1 / 60, null);
  assert.equal(ms.phase, 'approach');
  // Touchdown off the runway: mission stays open, player can retry.
  let out = updateMission(ms, p, w, [{ type: 'touchdown', onRunway: false, score: 0, perfect: false }], 1 / 60, null);
  assert.equal(ms.done, false, 'off-runway touchdown must not complete');
  assert.ok(out.some((o) => o.text && o.text.includes('OFF RUNWAY')));
  // Hard landing on grass: same — no completion.
  out = updateMission(ms, p, w, [{ type: 'hardLanding', sinkRate: 10, speed: 40, groundType: 'grass', damage: 30 }], 1 / 60, null);
  assert.equal(ms.done, false, 'off-runway hard landing must not complete');
  // Hard landing ON the runway: completes with the base score.
  out = updateMission(ms, p, w, [{ type: 'hardLanding', sinkRate: 10, speed: 40, groundType: 'runway', damage: 30 }], 1 / 60, null);
  assert.ok(ms.done, 'runway hard landing must complete');
  assert.equal(ms.score, 100, 'hard landing scores the base only');
});
test('missions: canyon supply drop over zone scores, wrong-way ring rejected', () => {
  const w = createWorld(42); const p = createPlane();
  const ms = createMissionState('canyon', w);
  p.pos = { x: ms.dropZone.x, y: 40, z: ms.dropZone.z };
  const fakeInput = { consumePressed: () => true };
  const out = updateMission(ms, p, w, [], 1 / 60, fakeInput);
  assert.ok(ms.dropDelivered, 'drop should deliver over zone');
  assert.ok(out.some((o) => o.text && o.text.includes('SUPPLY DROP')));
  // wrong way: teleport through ring 2 while ring 1 is next
  const w2 = createWorld(42); const p2 = createPlane(); const ms2 = createMissionState('rings', w2);
  const r2 = w2.rings[1];
  p2.prevPos = { x: r2.x - r2.nx * 5, y: r2.y, z: r2.z - r2.nz * 5 };
  p2.pos = { x: r2.x + r2.nx * 5, y: r2.y, z: r2.z + r2.nz * 5 };
  p2.vel = { x: r2.nx * 40, y: 0, z: r2.nz * 40 };
  const out2 = updateMission(ms2, p2, w2, [{ type: 'ring', ring: r2, index: 1 }], 1 / 60, null);
  assert.ok(out2.some((o) => o.text === 'WRONG WAY'), 'out-of-order ring must warn');
  assert.equal(ms2.score, 0);
  // WRONG WAY is throttled by the 2s cooldown (GPT-OSS 120B Fase 5): a second
  // wrong-way pass inside the window warns nothing; after the window it
  // warns again. Combo still resets on every wrong-way pass.
  const out3 = updateMission(ms2, p2, w2, [{ type: 'ring', ring: r2, index: 1 }], 1 / 60, null);
  assert.ok(!out3.some((o) => o.text === 'WRONG WAY'), 'second pass inside cooldown must not warn');
  for (let i = 0; i < 130; i++) updateMission(ms2, p2, w2, [], 1 / 60, null);
  const out4 = updateMission(ms2, p2, w2, [{ type: 'ring', ring: r2, index: 1 }], 1 / 60, null);
  assert.ok(out4.some((o) => o.text === 'WRONG WAY'), 'pass after cooldown expiry must warn again');
});
test('missions: out of bounds >30s fails; fuel-out in flight fails', () => {
  const w = createWorld(42); const p = createPlane(); const ms = createMissionState('rings', w);
  p.onGround = false; p.pos = { x: 2500, y: 100, z: 0 }; p.vel = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60 * 31; i++) updateMission(ms, p, w, [], 1 / 60, null);
  assert.ok(ms.failed && ms.reason.includes('Out of bounds'), 'reason=' + ms.reason);
  const p2 = createPlane(); const ms2 = createMissionState('rings', w);
  p2.onGround = false; p2.pos.y = 100; p2.fuel = 0;
  updateMission(ms2, p2, w, [], 1 / 60, null);
  assert.ok(ms2.failed && ms2.reason.includes('Fuel'), 'reason=' + ms2.reason);
});
test('missions: objective text is mission-specific', () => {
  const w = createWorld(42);
  assert.ok(missionObjectiveText(createMissionState('rings', w)).includes('RING RACE'));
  assert.ok(missionObjectiveText(createMissionState('landing', w)).includes('PRECISION LANDING'));
  assert.ok(missionObjectiveText(createMissionState('canyon', w)).includes('CANYON RUN'));
  assert.equal(MISSIONS.length, 3);
});

// ---------- input / effects / audio ----------
test('input: keyboard state drives axes; blur clears', () => {
  const inp = createInput();
  inp.keys.add('KeyW');
  inp.update(1 / 60);
  assert.equal(inp.axes.throttleDelta, 1);
  inp.keys.add('ArrowLeft');
  inp.update(1 / 60);
  assert.ok(inp.axes.roll < 0);
  inp.detach();
  assert.equal(inp.axes.throttleDelta, 0);
});
test('effects: explosion spawns 44 particles, cap 400, decay over time', () => {
  const fx = createEffects(99);
  fx.spawnExplosion(0, 50, 0);
  assert.equal(fx.particles.length, 44);
  fx.spawnExplosion(0, 50, 0); fx.spawnExplosion(0, 50, 0);
  for (let i = 0; i < 12; i++) fx.spawnExplosion(i, 50, i);
  assert.ok(fx.particles.length <= 400, 'cap violated: ' + fx.particles.length);
  fx.update(2);
  assert.ok(fx.particles.length < 400, 'particles should decay');
  fx.addText(100, 100, '+250');
  assert.equal(fx.texts.length, 1);
  fx.addShake(10); assert.ok(fx.shake > 0);
  fx.update(2); assert.ok(fx.shake < 0.1);
});
test('effects: ring burst is sparse (14 sparks) and ring flash is a thin circle', () => {
  const fx = createEffects(7);
  fx.spawnRingBurst(0, 50, 0);
  assert.equal(fx.particles.length, 14, 'burst must stay sparse so the plane stays visible');
  assert.ok(fx.particles.every((p) => p.kind === 'spark' && p.size <= 1.3), 'sparks small');
  fx.spawnRingFlash(0, 50, 0, 18);
  const flash = fx.particles.find((p) => p.kind === 'ringflash');
  assert.ok(flash, 'ring flash particle exists');
  assert.equal(flash.size, 18, 'flash radius equals the ring radius');
  fx.spawnEmbers(0, 50, 0);
  assert.equal(fx.particles.filter((p) => p.kind === 'fire').length, 6);
  fx.spawnWheelSmoke(0, 2, 0);
  assert.equal(fx.particles.filter((p) => p.kind === 'smoke').length, 6);
});
test('audio: Node-safe no-ops without AudioContext', () => {
  const a = createAudio();
  assert.equal(a.ensure(), null);
  a.engine(1, 60); a.wind(50); a.ring(); a.touchdown(90); a.crash(); a.alarm('stall');
  a.setMuted(true); a.startMusic(); a.stopMusic();
});

// ---------- shots / staging ----------
test('shots: applyShot start/play/rings/landing/cockpit valid; unknown rejected', () => {
  for (const name of ['start', 'play', 'rings', 'landing', 'cockpit']) {
    const g = {};
    assert.ok(applyShot(g, '?shot=' + name + '&seed=1'), name + ' should stage');
    assert.equal(g.state, 'flying');
    assert.ok(g.world && g.plane && g.cam && g.mission);
    noNaN(g.plane);
  }
  const g2 = {};
  assert.ok(!applyShot(g2, '?shot=nope&seed=1'), 'unknown shot must fail');
  assert.ok(!applyShot(g2, ''), 'empty query must fail');
  assert.ok(stageShot({}, 'rings'), 'stageShot by name');
  assert.ok(!stageShot({}, 'nope'), 'stageShot unknown must fail');
  assert.ok(Array.isArray(SHOT_LIST) && SHOT_LIST.length >= 4);
});
test('shots: same seed stages identical plane state (deterministic)', () => {
  const a = {}; const b = {};
  applyShot(a, '?shot=start&seed=1'); applyShot(b, '?shot=start&seed=1');
  approx(a.plane.pos.x, b.plane.pos.x); approx(a.plane.pos.y, b.plane.pos.y); approx(a.plane.pos.z, b.plane.pos.z);
  approx(a.world.heightAt(100, -200), b.world.heightAt(100, -200));
});

// ---------- determinism end-to-end ----------
test('determinism: scripted Ring Race replay is bit-identical', () => {
  function run() {
    const w = createWorld(42); const p = createPlane(); const ms = createMissionState('rings', w);
    for (let i = 0; i < 60 * 60; i++) {
      const ring = w.rings[ms.nextRingIndex] || w.rings[0];
      const ev = stepPlane(p, autopilotInput(p, ring, w), w, 1 / 60);
      updateMission(ms, p, w, ev, 1 / 60, null);
      if (ms.done || ms.failed) break;
    }
    return { score: ms.score, x: p.pos.x, y: p.pos.y, z: p.pos.z, fuel: p.fuel, rings: ms.nextRingIndex };
  }
  const a = run(); const b = run();
  assert.deepEqual(a, b);
});

// ---------- render helpers ----------
test('render: getRunwayAxis returns a unit-ish direction', () => {
  const w = createWorld(42);
  const ax = getRunwayAxis(w);
  const len = Math.hypot(ax.dx, ax.dz);
  approx(len, 1, 0.01);
});

// ---------- benchmark ----------
test('benchmark: 60s sim of 3 missions < 5s wall (1 CPU friendly)', () => {
  const t0 = Date.now();
  for (const id of ['rings', 'landing', 'canyon']) {
    const w = createWorld(42); const p = createPlane(); const ms = createMissionState(id, w);
    for (let i = 0; i < 60 * 60; i++) {
      const ring = w.rings[ms.nextRingIndex] || w.rings[0];
      const ev = stepPlane(p, autopilotInput(p, ring, w), w, 1 / 60);
      updateMission(ms, p, w, ev, 1 / 60, null);
      if (ms.done || ms.failed) break;
    }
  }
  const ms = Date.now() - t0;
  console.log('   benchmark: 3×60s sims in ' + ms + 'ms');
  assert.ok(ms < 5000, 'too slow: ' + ms + 'ms');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILURES:\n' + failures.join('\n')); process.exit(1); }
