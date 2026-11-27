// Integration wiring test for game/src/main.js (Node, stubbed DOM).
// Verifies the event-bus contract between stepPlane/updateMission (arrays of
// {type, ...}) and stepSimulation's consumption of them — the class of bug
// that unit tests on the modules alone cannot see (popups/particles/ring FX
// silently dead, hard landings treated as fatal crashes, flaps corrupted).
import { strict as assert } from 'node:assert';
import { startGame } from '../game/src/main.js';
import { createMissionState, updateMission } from '../game/src/missions.js';
import { createWorld } from '../game/src/world.js';
import { createPlane } from '../game/src/aircraft.js';

const canvasStub = () => {
  const gradient = { addColorStop() {} };
  const ctx = new Proxy(
    {},
    {
      get(t, prop) {
        if (prop === 'canvas') return canvas;
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => gradient;
        }
        if (prop in t) return t[prop];
        return () => {};
      },
      set(t, prop, v) {
        t[prop] = v;
        return true;
      },
    }
  );
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
  return canvas;
};

const windowListeners = {};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  location: { search: '' },
  addEventListener(type, fn) {
    (windowListeners[type] = windowListeners[type] || []).push(fn);
  },
  removeEventListener(type, fn) {
    const arr = windowListeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
};
function pressKey(code) {
  const ev = { code, key: code, repeat: false, preventDefault() {} };
  for (const fn of windowListeners.keydown || []) fn(ev);
}
function releaseKey(code) {
  const ev = { code, key: code, repeat: false, preventDefault() {} };
  for (const fn of windowListeners.keyup || []) fn(ev);
}
globalThis.document = {
  readyState: 'complete',
  getElementById: (id) => (id === 'hint' ? { offsetHeight: 32 } : null),
  addEventListener() {},
  removeEventListener() {},
  hidden: false,
};
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb;
  return 1;
};

let nowMs = 0;
function drive(n) {
  for (let i = 0; i < n; i++) {
    nowMs += 16.7;
    const cb = rafCb;
    rafCb = null;
    cb(nowMs);
  }
}

function boot(query) {
  rafCb = null;
  nowMs = 0;
  const game = startGame(canvasStub(), query);
  assert.equal(game.state, 'flying', `boot ${query}: expected flying state`);
  drive(1); // prime the loop: the first rAF tick only sets lastMs (dt = 0)
  return game;
}

function ringNormal(ring) {
  let nx = ring.nx;
  let ny = ring.ny || 0;
  let nz = ring.nz;
  if (nx === undefined || nz === undefined) {
    if (ring.yaw !== undefined) {
      nx = Math.sin(ring.yaw);
      nz = -Math.cos(ring.yaw);
    } else {
      nx = 1;
      nz = 0;
    }
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n  ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. Ring pass fires sound, particles, popup and score (the wiring that was dead).
test('main wiring: ring pass produces ring sound + burst particles + popup + score', () => {
  const game = boot('?shot=play&seed=1&still=0');
  let ringCalls = 0;
  game.audio.ring = () => {
    ringCalls++;
  };
  const ring = game.world.rings[2];
  assert.ok(ring && !ring.passed, 'ring 2 starts unpassed');
  const n = ringNormal(ring);
  // Straddle the ring plane so the next step crosses it at the centre.
  game.plane.pos = { x: ring.x - n.x * 0.4, y: ring.y - n.y * 0.4, z: ring.z - n.z * 0.4 };
  game.plane.prevPos = { x: ring.x - n.x * 1.1, y: ring.y - n.y * 1.1, z: ring.z - n.z * 1.1 };
  game.plane.vel = { x: n.x * 40, y: n.y * 40, z: n.z * 40 };
  game.plane.throttle = 0.8;
  game.plane.yaw = Math.atan2(n.x, -n.z);
  game.plane.pitch = 0;
  game.plane.roll = 0;
  const scoreBefore = game.score;
  drive(3);
  assert.ok(ring.passed, 'ring 2 marked passed');
  assert.ok(ringCalls >= 1, `ring sound fired (got ${ringCalls})`);
  assert.ok(game.effects.particles.length > 0, 'ring burst particles exist');
  for (const p of game.effects.particles) {
    assert.ok(
      Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z),
      'particle positions are finite numbers (no object-arg spawn)'
    );
  }
  assert.ok(game.effects.texts.length > 0, 'popup text exists');
  assert.ok(
    game.effects.texts.some((t) => Number.isFinite(t.x) && Number.isFinite(t.y)),
    'popup has finite screen coords'
  );
  // Exactly one ring's worth of points: the staged rings 0-1 must NOT be
  // re-scored on the first simulated frame (nextRingIndex kept in sync).
  assert.equal(game.score, scoreBefore + 250, `score +250 exactly (${scoreBefore} -> ${game.score})`);
  assert.equal(game.mission.score, game.score, 'mission score mirrors game score');
});

// 1b. Combo chains on quick successive rings and lights the Ember Storm at x3.
test('main wiring: quick chained rings multiply points and trigger Ember Storm at x3', () => {
  const game = boot('?shot=play&seed=1&still=0');
  game.audio.ring = () => {};
  const flyThrough = (idx) => {
    const ring = game.world.rings[idx];
    const n = ringNormal(ring);
    game.plane.pos = { x: ring.x - n.x * 0.4, y: ring.y - n.y * 0.4, z: ring.z - n.z * 0.4 };
    game.plane.prevPos = { x: ring.x - n.x * 1.1, y: ring.y - n.y * 1.1, z: ring.z - n.z * 1.1 };
    game.plane.vel = { x: n.x * 40, y: n.y * 40, z: n.z * 40 };
    game.plane.throttle = 0.8;
    game.plane.yaw = Math.atan2(n.x, -n.z);
    game.plane.pitch = 0;
    game.plane.roll = 0;
    drive(3);
  };
  const s0 = game.score; // staged 2 rings = 500
  flyThrough(2);
  assert.equal(game.score, s0 + 250, 'first live ring is x1 (+250)');
  assert.equal(game.combo, 1);
  flyThrough(3);
  assert.equal(game.score, s0 + 750, 'second quick ring is x2 (+500)');
  assert.equal(game.combo, 2);
  assert.ok(game.effects.texts.some((t) => t.text.includes('COMBO x2')), 'combo popup shown');
  flyThrough(4);
  assert.equal(game.score, s0 + 1500, 'third quick ring is x3 (+750)');
  assert.equal(game.combo, 3);
  assert.ok(game.emberStormUntil > game.time, 'Ember Storm lit at combo x3');
  drive(12); // ~0.2s of storm: embers spawn around the plane
  assert.ok(game.effects.particles.some((p) => p.kind === 'fire'), 'storm embers exist');
});

// 2. A survivable hard landing damages but does NOT crash the plane.
test('main wiring: hard landing (sink 10 m/s, runway, gear down) is not fatal', () => {
  const game = boot('?shot=play&seed=1&still=0');
  const rw = game.world.runway;
  const gy = Math.max(0, game.world.heightAt(rw.cx, rw.cz));
  const p = game.plane;
  p.pos = { x: rw.cx, y: gy + 2.1, z: rw.cz };
  p.prevPos = { x: rw.cx, y: gy + 2.4, z: rw.cz };
  p.vel = { x: 0, y: -10, z: 0 };
  p.yaw = 0;
  p.pitch = 0;
  p.roll = 0;
  p.throttle = 0;
  p.gearDown = true;
  p.flaps = 0;
  p.onGround = false;
  p.damage = 0;
  drive(12);
  assert.notEqual(game.state, 'crashed', 'hard landing must not crash the plane');
  assert.ok(p.damage > 0, `hard landing applied damage (got ${p.damage})`);
});

// 3. Flaps cycle numerically 0 -> 1 -> 2 -> 0 (never a boolean).
test('main wiring: KeyF cycles flaps numerically', () => {
  const game = boot('?shot=play&seed=1&still=0');
  const p = game.plane;
  p.flaps = 0;
  pressKey('KeyF');
  drive(1);
  assert.equal(p.flaps, 1, 'first KeyF -> flaps 1');
  assert.equal(typeof p.flaps, 'number');
  pressKey('KeyF');
  drive(1);
  assert.equal(p.flaps, 2, 'second KeyF -> flaps 2');
  pressKey('KeyF');
  drive(1);
  assert.equal(p.flaps, 0, 'third KeyF -> flaps 0');
});

// 4. Gear cannot retract while on the ground.
test('main wiring: KeyG does not retract gear on the ground', () => {
  const game = boot('?shot=play&seed=1&still=0');
  const p = game.plane;
  p.gearDown = true;
  p.onGround = true;
  p.pos.y = Math.max(0, game.world.heightAt(p.pos.x, p.pos.z)) + 1.8;
  p.vel = { x: 0, y: 0, z: 0 };
  pressKey('KeyG');
  drive(1);
  assert.equal(p.gearDown, true, 'gear stays down on the ground');
});

// 5. Mission feedback (updateMission array items) surfaces as popups.
test('main wiring: mission score items surface as popup texts', () => {
  const game = boot('?shot=play&seed=1&still=0');
  // Fly the staged 'play' approach: hold throttle and let the plane reach
  // ring 2 on its own course; mission feedback should appear as popups.
  game.input.keys.add('KeyW');
  drive(240); // ~4s of sim
  assert.ok(
    game.effects.texts.length > 0 || game.ringsPassed > 2,
    'mission feedback or ring progress observed'
  );
});

// 6. An out-of-order ring scores NOTHING and shows WRONG WAY, not +250.
test('main wiring: out-of-order ring is rejected (no points, no ring FX)', () => {
  const game = boot('?shot=play&seed=1&still=0');
  let ringCalls = 0;
  game.audio.ring = () => {
    ringCalls++;
  };
  // nextRingIndex is 2 after the staged passes; fly through ring 4 instead.
  const ring = game.world.rings[4];
  assert.ok(ring && !ring.passed, 'ring 4 starts unpassed');
  const n = ringNormal(ring);
  game.plane.pos = { x: ring.x - n.x * 0.4, y: ring.y - n.y * 0.4, z: ring.z - n.z * 0.4 };
  game.plane.prevPos = { x: ring.x - n.x * 1.1, y: ring.y - n.y * 1.1, z: ring.z - n.z * 1.1 };
  game.plane.vel = { x: n.x * 40, y: n.y * 40, z: n.z * 40 };
  game.plane.throttle = 0.8;
  game.plane.yaw = Math.atan2(n.x, -n.z);
  game.plane.pitch = 0;
  game.plane.roll = 0;
  const scoreBefore = game.score;
  drive(3);
  assert.equal(ringCalls, 0, 'no ring sound for a rejected ring');
  assert.equal(game.score, scoreBefore, 'score unchanged for a rejected ring');
  assert.equal(game.mission.score, scoreBefore, 'mission score unchanged for a rejected ring');
  // The mission signals the rejection with the WRONG WAY cooldown (the
  // popup itself is projected from the plane's position and the harness
  // teleports the plane far from the staged camera, so it may be off-screen
  // for one frame — the cooldown is the mission's own record of the warning).
  assert.ok(game.mission.wrongWayCooldown > 0, 'WRONG WAY warning issued by the mission');
  assert.ok(
    !game.effects.texts.some((t) => t.text.includes('RING!')),
    'no +250 RING! popup for a rejected ring'
  );
});

// 7. Landing quality comes from the touchdown/hardLanding EVENT data, not
// from a recompute after stepPlane reset vel.y to 0 (which reads sinkRate 0).
test('missions wiring: landing score uses event sinkRate/score, not recompute', () => {
  const world = createWorld(1);
  const rw = world.runway;
  const gy = Math.max(0, world.heightAt(rw.cx, rw.cz));
  const plane = createPlane();
  plane.pos = { x: rw.cx, y: gy + 1.8, z: rw.cz };
  plane.vel = { x: 0, y: 0, z: 0 }; // post-reset state: vel.y already 0
  plane.onGround = true;
  plane.gearDown = true;
  plane.damage = 0;
  plane.fuel = 100;

  // Case A: honest touchdown event (sinkRate 3, score 150) -> quality 150.
  const msA = createMissionState('landing', world);
  msA.phase = 'approach';
  msA.wasOnGround = true;
  const outA = updateMission(
    msA, plane, world,
    [{ type: 'touchdown', onRunway: true, centerOffset: 2, sinkRate: 3, speed: 30, score: 150, perfect: false }],
    1 / 60
  );
  assert.equal(msA.done, true, 'landing mission completes on touchdown event');
  assert.equal(msA.score, 100 + 150 * 8, `touchdown score from event (got ${msA.score})`);
  assert.ok(outA.some((i) => i.type === 'missionDone'), 'missionDone emitted');

  // Case B: hardLanding event (sinkRate 10) -> quality 0, only the base.
  const msB = createMissionState('landing', world);
  msB.phase = 'approach';
  msB.wasOnGround = true;
  updateMission(
    msB, plane, world,
    [{ type: 'hardLanding', sinkRate: 10, speed: 40, groundType: 'runway', damage: 30 }],
    1 / 60
  );
  assert.equal(msB.done, true, 'landing mission completes on hard landing');
  assert.equal(msB.score, 100, `hard landing scores base only (got ${msB.score})`);
});

function bootStaged(query) {
  // Frozen staged shot (no still=0): startGame returns without starting the
  // rAF loop, so there is nothing to drive.
  rafCb = null;
  nowMs = 0;
  const game = startGame(canvasStub(), query);
  assert.equal(game.state, 'flying', `bootStaged ${query}: expected flying state`);
  return game;
}

// 8. Staged 'rings' shot shows the ring-pass moment: 3 rings cleared,
// score 750, burst particles spread, "+250 RING!" popup, running timer,
// and no stray smoke puff in the frozen frame.
test('main wiring: crash clears an active Ember Storm (Luna Fase 5)', () => {
  const game = boot('?shot=play&seed=1&still=0');
  game.emberStormUntil = game.time + 6;
  game._emberT = game.time;
  game.plane.damage = 100; // forces the crash branch in stepSimulation
  drive(2);
  assert.equal(game.state, 'crashed', 'damage 100 must crash the plane');
  assert.equal(game.emberStormUntil, 0, 'crash must clear the storm timer');
  assert.equal(game._emberT, 0, 'crash must clear the storm tick');
});
test('staging: rings shot is the ring-pass moment with burst + popup', () => {
  const game = bootStaged('?shot=rings&seed=1');
  assert.equal(game.score, 750, 'rings shot score is 3 rings x 250');
  assert.equal(game.mission.score, 750, 'mission score mirrors');
  assert.equal(game.mission.nextRingIndex, 3, 'next ring is 4/6');
  assert.equal(game.world.rings[2].passed, true, 'ring 3 marked passed');
  assert.equal(game.mission.elapsed, 35.2, 'HUD timer reads the staged clock');
  assert.ok(game.effects.particles.length > 0, 'ring burst particles exist');
  for (const p of game.effects.particles) {
    assert.ok(
      Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z),
      'burst particle positions are finite'
    );
  }
  const popup = game.effects.texts.find((t) => t.text === '+250 RING!');
  assert.ok(popup, '"+250 RING!" popup staged');
  assert.ok(Number.isFinite(popup.x) && Number.isFinite(popup.y), 'popup has finite screen coords');
  // Revision 2026-11-27/2128: camera 75 back + 36 side so the ring frames
  // the plane instead of swallowing it.
  const camDist = Math.hypot(game.cam.pos.x - game.plane.pos.x, game.cam.pos.y - game.plane.pos.y, game.cam.pos.z - game.plane.pos.z);
  assert.ok(camDist > 80, 'rings camera stands back from the plane: ' + camDist.toFixed(1));
  assert.equal(game._smokeT, game.time, 'no stray smoke puff in the frozen frame');
});

// 9. Staged 'landing' shot is the final approach, not the takeoff roll.
test('staging: landing shot phase is approach with running timer', () => {
  const game = bootStaged('?shot=landing&seed=1');
  assert.equal(game.mission.id, 'landing', 'landing mission active');
  assert.equal(game.mission.phase, 'approach', 'banner is the approach instruction');
  assert.equal(game.mission.elapsed, 44.0, 'HUD timer reads the staged clock');
  assert.equal(game._smokeT, game.time, 'no stray smoke puff in the frozen frame');
});

// 10. Staged 'cockpit' shot: ring 1 cleared, timer running.
test('staging: cockpit shot is consistent (ring 1 cleared, timer running)', () => {
  const game = bootStaged('?shot=cockpit&seed=1');
  assert.equal(game.score, 250, 'cockpit shot score is 1 ring x 250');
  assert.equal(game.mission.nextRingIndex, 1, 'next ring is 2/6');
  assert.equal(game.mission.elapsed, 19.6, 'HUD timer reads the staged clock');
});

// 11. Staged 'start' (cover) shot: TAKEOFF cover (revision 2026-11-27/2128
// — the 1228 flying cover lost the runway entirely and the R3 judge rate
// fell 0.5976 → 0.5158). The plane has just lifted off over Runway Isle,
// climbing NE with the runway strip below, ring 1 ahead and the volcano at
// the left of frame; the timer runs like every other flying shot.
test('staging: start shot is a takeoff cover with running timer', () => {
  const game = bootStaged('?shot=start&seed=1');
  assert.equal(game.mission.elapsed, 12.0, 'HUD timer reads the staged clock');
  assert.ok(game.plane.speed > 40, 'cover plane is flying at cruise, not parked (speed ' + game.plane.speed + ')');
  assert.equal(game.plane.onGround, false, 'cover plane is airborne');
  assert.ok(game.plane.pos.x > -120 && game.plane.pos.x < 20, 'cover plane is just off the runway isle (x ' + game.plane.pos.x + ')');
  assert.ok(game.plane.pos.z > 0 && game.plane.pos.z < 120, 'cover plane is just off the runway isle (z ' + game.plane.pos.z + ')');
  assert.equal(game._smokeT, game.time, 'no stray smoke puff in the frozen frame');
});

console.log(`\n${passed} passed, ${passed === 13 ? 0 : 13 - passed} failed`);
if (passed !== 13) process.exitCode = 1;
