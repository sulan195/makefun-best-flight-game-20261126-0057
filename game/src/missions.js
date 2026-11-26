// Ember Isles — the three missions.
//
// A mission is a small state machine the game ticks every frame. It watches
// the physics events (ring passes, liftoff, touchdowns, crashes) plus the
// plane's position, keeps the score, and reports back as a list of feedback
// items the game turns into popups. Nothing here renders or touches the DOM.
//
// The three missions:
//   Ring Race — thread six burning rings in order. Each ring is worth 250.
//     Passing one out of order earns nothing and flashes WRONG WAY.
//   Precision Landing — take off, fly the circuit, come back and land on
//     RWY 09. The landing score comes from the touchdown event the physics
//     step already measured (never recomputed afterwards, when the vertical
//     speed has already been reset to zero): base 100 plus eight times the
//     event's quality score. A hard landing still counts, for the base only.
//   Canyon Run — a time trial with a supply drop. Press X over the marked
//     drop zone to deliver (+300), then bring the plane home to the runway.
//     Landing home within two minutes earns a +500 time bonus.
//
// A mission fails when the plane crashes, runs out of fuel in the air, or
// spends more than thirty seconds outside the islands.

import { CONFIG } from './config.js';

const RING_POINTS = CONFIG.scoring.ringPoints;
const LANDING_BASE = CONFIG.scoring.landingBase;
const DROP_POINTS = 300;
const DROP_RADIUS = 50;
const TIME_BONUS_SECONDS = 120;
const TIME_BONUS_POINTS = 500;
const OUT_OF_BOUNDS_SECONDS = 30;
const CIRCUIT_DISTANCE = 300;
const WRONG_WAY_SECONDS = 2;

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Race',
    desc: 'Thread six burning rings, go! Fastest clean run wins the day.',
  },
  {
    id: 'landing',
    name: 'Precision Landing',
    desc: 'Land on RWY 09, dead centre! Soft, slow, and straight wins.',
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    desc: 'Canyon race, supply drop run. Beat the clock home to RWY 09.',
  },
];

// Where the canyon drop goes: a fixed point out from the runway, on the
// ground below. The height lookup is guarded — a missing height falls back
// to sea level instead of poisoning the zone with NaN.
function computeDropZone(world) {
  const runway = (world && world.runway) || {};
  const cx = Number.isFinite(runway.cx) ? runway.cx : 0;
  const cz = Number.isFinite(runway.cz) ? runway.cz : 0;
  const x = cx + 650;
  const z = cz - 350;
  let y = 0;
  if (world && typeof world.heightAt === 'function') {
    const ground = world.heightAt(x, z);
    y = Number.isFinite(ground) ? ground : 0;
  }
  return { x, y, z };
}

function horizontalDistance(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function createMissionState(id, world) {
  const def = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
  const ringsTotal = world && Array.isArray(world.rings)
    ? world.rings.length
    : CONFIG.world.ringCount;
  const ms = {
    id: def.id,
    phase: def.id === 'landing' ? 'takeoff' : 'flying',
    nextRingIndex: 0,
    ringsTotal,
    score: 0,
    done: false,
    failed: false,
    reason: '',
    elapsed: 0,
    outOfBoundsTime: 0,
    wrongWayCooldown: 0,
    wasOnGround: false,
    dropZone: def.id === 'canyon' ? computeDropZone(world) : null,
    dropDelivered: false,
  };
  // The canyon drop is attempted two ways: the game calls this directly
  // when the player presses X, and updateMission calls it when it sees a
  // drop event or a fresh X press. Both paths share tryDrop, which only
  // ever delivers once, so the two can never double-award.
  if (def.id === 'canyon') {
    ms.drop = (plane, w) => tryDrop(ms, plane, w || world);
  }
  return ms;
}

// Try to deliver the canyon supply drop. True only when the plane is over
// the zone and the drop has not been delivered yet.
function tryDrop(ms, plane, world) {
  if (!ms || ms.id !== 'canyon' || ms.dropDelivered) return false;
  if (!ms.dropZone || !plane || !plane.pos) return false;
  const distance = horizontalDistance(plane.pos.x, plane.pos.z, ms.dropZone.x, ms.dropZone.z);
  if (distance > DROP_RADIUS) return false;
  ms.dropDelivered = true;
  ms.score += DROP_POINTS;
  return true;
}

function failMission(ms, out, reason) {
  if (ms.failed || ms.done) return;
  ms.failed = true;
  ms.reason = reason;
  out.push({ type: 'missionFail', text: reason });
}

function completeMission(ms, out, text) {
  if (ms.done || ms.failed) return;
  ms.done = true;
  out.push({ type: 'missionDone', text });
}

export function updateMission(ms, plane, world, events, dt, input) {
  const out = [];
  if (!ms || ms.done || ms.failed) return out;
  const step = typeof dt === 'number' && dt > 0 ? dt : 0;
  ms.elapsed += step;
  if (ms.wrongWayCooldown > 0) {
    ms.wrongWayCooldown = Math.max(0, ms.wrongWayCooldown - step);
  }

  const list = Array.isArray(events) ? events : [];
  for (const event of list) {
    if (!event || typeof event.type !== 'string') continue;
    if (event.type === 'crash') {
      failMission(ms, out, 'Crashed');
    } else if (event.type === 'ring' && ms.id === 'rings') {
      handleRingEvent(ms, out, event);
    } else if (event.type === 'liftoff' && ms.id === 'landing' && ms.phase === 'takeoff') {
      ms.phase = 'circuit';
      out.push({ type: 'missionScore', text: 'AIRBORNE — FLY THE CIRCUIT' });
    } else if (event.type === 'touchdown' && ms.id === 'landing' && ms.phase === 'approach') {
      finishLanding(ms, out, event);
    } else if (event.type === 'hardLanding' && ms.id === 'landing' && ms.phase === 'approach') {
      // A hard landing still lands the plane: the base score only, no
      // quality multiplier — the event carries no usable quality score.
      ms.score = LANDING_BASE;
      completeMission(ms, out, 'HARD LANDING — MISSION COMPLETE');
    } else if (event.type === 'drop' && ms.id === 'canyon') {
      if (tryDrop(ms, plane, world)) {
        out.push({ type: 'missionScore', text: 'SUPPLY DROP +' + DROP_POINTS });
      }
    }
    if (ms.done || ms.failed) break;
  }

  // The X key can also reach the mission through the input object (the
  // direct-call path the game uses when it has not already consumed it).
  if (!ms.done && !ms.failed && ms.id === 'canyon' && input
      && typeof input.consumePressed === 'function') {
    const pressed = input.consumePressed('KeyX') || input.consumePressed('x');
    if (pressed && tryDrop(ms, plane, world)) {
      out.push({ type: 'missionScore', text: 'SUPPLY DROP +' + DROP_POINTS });
    }
  }

  // Landing: leaving the circuit for the final approach once the plane is
  // far enough from the runway to have flown a real circuit.
  if (!ms.done && !ms.failed && ms.id === 'landing' && ms.phase === 'circuit'
      && plane && plane.pos && world && world.runway) {
    const runway = world.runway;
    const cx = Number.isFinite(runway.cx) ? runway.cx : 0;
    const cz = Number.isFinite(runway.cz) ? runway.cz : 0;
    if (horizontalDistance(plane.pos.x, plane.pos.z, cx, cz) > CIRCUIT_DISTANCE) {
      ms.phase = 'approach';
      out.push({ type: 'missionScore', text: 'FINAL APPROACH — LINE UP ON RWY 09' });
    }
  }

  // Canyon: home is the runway, on the ground, with the drop delivered.
  if (!ms.done && !ms.failed && ms.id === 'canyon' && ms.dropDelivered
      && plane && plane.onGround && plane.pos && world && world.runway) {
    const runway = world.runway;
    const cx = Number.isFinite(runway.cx) ? runway.cx : 0;
    const cz = Number.isFinite(runway.cz) ? runway.cz : 0;
    if (horizontalDistance(plane.pos.x, plane.pos.z, cx, cz) < 150) {
      let text = 'CANYON RUN COMPLETE — ' + ms.elapsed.toFixed(1) + 's';
      if (ms.elapsed <= TIME_BONUS_SECONDS) {
        ms.score += TIME_BONUS_POINTS;
        text += ' (+' + TIME_BONUS_POINTS + ' TIME BONUS)';
      }
      completeMission(ms, out, text);
    }
  }

  // Shared failure checks: out of bounds (timed) and fuel out (at once).
  if (!ms.done && !ms.failed && plane && plane.pos) {
    const half = CONFIG.world.halfSize || 2000;
    const distance = Math.sqrt(plane.pos.x * plane.pos.x + plane.pos.z * plane.pos.z);
    if (distance > half) {
      ms.outOfBoundsTime += step;
      if (ms.outOfBoundsTime > OUT_OF_BOUNDS_SECONDS) {
        failMission(ms, out, 'Out of bounds — return to the islands');
      }
    } else {
      ms.outOfBoundsTime = 0;
    }
    if (typeof plane.fuel === 'number' && plane.fuel <= 0 && !plane.onGround) {
      failMission(ms, out, 'Fuel exhausted');
    }
  }

  if (plane) ms.wasOnGround = Boolean(plane.onGround);
  return out;
}

// One ring event: the next ring in order scores and advances; any other
// ring is a wrong-way pass — no points, and a short cooldown so the warning
// does not spam every frame the plane sits inside it.
function handleRingEvent(ms, out, event) {
  if (event.index === ms.nextRingIndex) {
    ms.score += RING_POINTS;
    ms.nextRingIndex += 1;
    if (event.ring) event.ring.passed = true;
    out.push({ type: 'ring', text: '+' + RING_POINTS + ' RING!' });
    if (ms.nextRingIndex >= ms.ringsTotal) {
      completeMission(ms, out, 'RING RACE COMPLETE!');
    }
  } else {
    // Out of order: mark the ring un-passed so the game skips the sound,
    // the burst and the points for it, and warn once per pass.
    if (event.ring) event.ring.passed = false;
    ms.wrongWayCooldown = WRONG_WAY_SECONDS;
    out.push({ type: 'missionScore', text: 'WRONG WAY' });
  }
}

// Score a landing from the touchdown event's own measurements. The event
// carries the quality score the physics step computed before it reset the
// vertical speed, so this never re-derives it from a zeroed sink rate.
function finishLanding(ms, out, event) {
  const quality = typeof event.score === 'number' && Number.isFinite(event.score)
    ? event.score
    : 0;
  ms.score = LANDING_BASE + quality * 8;
  const label = event.perfect ? 'PERFECT LANDING' : 'LANDING';
  completeMission(ms, out, label + ' — MISSION COMPLETE');
}

// The banner line the HUD shows: the mission, the current step, and the
// numbers the player needs right now.
export function missionObjectiveText(ms) {
  if (!ms) return '';
  if (ms.id === 'rings') {
    if (ms.done) return 'RING RACE: Complete!';
    return 'RING RACE: Pass ring ' + (ms.nextRingIndex + 1) + '/' + ms.ringsTotal + ' in order';
  }
  if (ms.id === 'landing') {
    if (ms.done) return 'PRECISION LANDING: Complete!';
    if (ms.phase === 'takeoff') return 'PRECISION LANDING: Take off from RWY 09';
    if (ms.phase === 'circuit') return 'PRECISION LANDING: Fly the circuit, then line up';
    return 'PRECISION LANDING: Line up on RWY 09, gear down (G)';
  }
  if (ms.id === 'canyon') {
    if (ms.done) return 'CANYON RUN: Complete!';
    if (ms.dropDelivered) return 'CANYON RUN: Drop delivered — return to RWY 09';
    return 'CANYON RUN: Race the canyon, drop supplies (X) at the zone';
  }
  return '';
}
