// FILE: game/src/missions.js
import { CONFIG } from './config.js';
import { checkRingPass, checkCrash, checkRunwayTouchdown } from './aircraft.js';

export const MISSIONS = [
  {
    id: 'rings',
    name: 'Ring Race',
    desc: 'Fly through all 6 rings in order for points and a speed bonus.',
  },
  {
    id: 'landing',
    name: 'Precision Landing',
    desc: 'Take off, fly a circuit around the bay, and grease a runway landing.',
  },
  {
    id: 'canyon',
    name: 'Canyon Run',
    desc: 'Thread all 6 rings at low level and press X over the supply drop zone.',
  },
];

const bestScores = { rings: 0, landing: 0, canyon: 0 };
let dropKeyLatch = false;

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && (e.code === 'KeyX' || e.key === 'x' || e.key === 'X')) {
      dropKeyLatch = true;
    }
  });
}

function updateBest(ms) {
  if (ms.score > (bestScores[ms.id] || 0)) {
    bestScores[ms.id] = ms.score;
  }
  ms.best = bestScores[ms.id] || 0;
}

function computeDropZone(world) {
  if (world?.dropZone) {
    return { ...world.dropZone, r: world.dropZone.r || 140, dropped: false };
  }
  const rings = world?.rings || [];
  const last = rings[rings.length - 1];
  const vx = world?.volcano?.x ?? 600;
  const vz = world?.volcano?.z ?? -900;
  const x = last ? last.x * 0.65 + vx * 0.2 : vx - 240;
  const z = last ? last.z * 0.65 + vz * 0.2 : vz + 220;
  const h = world?.heightAt ? world.heightAt(x, z) : undefined;
  const ground = Number.isFinite(h) ? Math.max(0, h) : 12;
  return { x, y: ground + 4, z, r: 140, dropped: false };
}

export function createMissionState(id, world) {
  const def = MISSIONS.find((m) => m.id === id) || MISSIONS[0];
  const rings = Array.isArray(world?.rings) ? world.rings : [];
  for (let i = 0; i < rings.length; i++) {
    rings[i].passed = false;
  }
  dropKeyLatch = false;
  const ringsTotal = rings.length || 6;

  return {
    id: def.id,
    name: def.name,
    ringsTotal,
    ringsLeft: def.id === 'landing' ? 0 : ringsTotal,
    nextRingIndex: 0,
    startTime: 0,
    elapsed: 0,
    score: 0,
    baseScore: 0,
    bonusScore: 0,
    done: false,
    failed: false,
    reason: '',
    best: bestScores[def.id] || 0,
    phase: 'takeoff',
    maxCircuitDist: 0,
    wasOnGround: true,
    outOfBoundsTime: 0,
    oobWarned: false,
    wrongWayCooldown: 0,
    dropZone: def.id === 'canyon' ? computeDropZone(world) : null,
    dropDelivered: false,
  };
}

function stepOrderedRings(ms, plane, world, events, ringPts, out) {
  const rings = Array.isArray(world?.rings) ? world.rings : [];
  if (rings.length === 0 || ms.nextRingIndex >= rings.length) return;

  for (let i = 0; i < rings.length; i++) {
    if (i < ms.nextRingIndex) {
      rings[i].passed = true;
      continue;
    }
    const r = rings[i];
    const hitByEvent =
      Array.isArray(events) &&
      events.some((e) => e.type === 'ring' && (e.ring === r || e.index === i));
    const hitNow = Boolean(r.passed) || hitByEvent || Boolean(checkRingPass(plane, r));

    if (!hitNow) continue;
    if (i === ms.nextRingIndex) {
      r.passed = true;
      ms.nextRingIndex += 1;
      ms.ringsLeft = Math.max(0, rings.length - ms.nextRingIndex);
      ms.score += ringPts;
      ms.baseScore += ringPts;
      out.push({
        type: 'missionScore',
        points: ringPts,
        text: 'RING ' + ms.nextRingIndex + '/' + rings.length + ' +' + ringPts,
      });
    } else {
      r.passed = false;
      if (ms.wrongWayCooldown <= 0) {
        ms.wrongWayCooldown = 2.0;
        out.push({
          type: 'missionScore',
          points: 0,
          text: 'WRONG WAY',
        });
      }
    }
  }
}

function isOnRunwayBounds(plane, world) {
  const rw = world?.runway || { cx: 0, cz: 0, headingDeg: 90, len: 420, wid: 26 };
  const rad = ((rw.headingDeg ?? 90) * Math.PI) / 180;
  const fwdX = Math.sin(rad);
  const fwdZ = -Math.cos(rad);
  const rightX = Math.cos(rad);
  const rightZ = Math.sin(rad);
  const dx = plane.pos.x - (rw.cx ?? 0);
  const dz = plane.pos.z - (rw.cz ?? 0);
  const along = Math.abs(dx * fwdX + dz * fwdZ);
  const across = Math.abs(dx * rightX + dz * rightZ);
  return along <= (rw.len || 420) * 0.56 && across <= (rw.wid || 26) * 0.85;
}

export function updateMission(ms, plane, world, events, dt, input) {
  const out = [];
  if (!ms || !plane || ms.done || ms.failed) return out;

  const stepDt = Math.max(0, Number(dt) || 0);
  ms.elapsed += stepDt;
  if (ms.wrongWayCooldown > 0) ms.wrongWayCooldown = Math.max(0, ms.wrongWayCooldown - stepDt);

  const evs = Array.isArray(events) ? events : [];
  const ringPts = CONFIG.scoring?.ringPoints ?? CONFIG.ringPoints ?? 250;
  const landingBase = CONFIG.scoring?.landingBase ?? CONFIG.landingBase ?? 100;
  const worldSize = world?.size ?? CONFIG.world?.size ?? CONFIG.worldSize ?? 4000;
  const halfWorld = worldSize * 0.5;

  // Only a fatal 'crash' impact fails the mission. checkCrash also returns
  // 'hardLanding' for survivable contact (e.g. taxiing on grass, or a rough
  // touchdown the physics layer already converted into damage) — that must
  // NOT be treated as a crash, or an emergency landing could never survive.
  const impact = world ? checkCrash(plane, world) : null;
  const crashed =
    evs.some((e) => e.type === 'crash') ||
    (impact && impact.type === 'crash') ||
    (plane.damage ?? 0) >= 100;
  if (crashed) {
    ms.failed = true;
    ms.reason = 'Crashed';
    out.push({ type: 'missionFail', points: 0, text: 'CRASHED!' });
    dropKeyLatch = false;
    return out;
  }

  if ((plane.fuel ?? 100) <= 0 && !plane.onGround) {
    ms.failed = true;
    ms.reason = 'Fuel exhausted in flight';
    out.push({ type: 'missionFail', points: 0, text: 'OUT OF FUEL!' });
    dropKeyLatch = false;
    return out;
  }

  if (Math.abs(plane.pos.x) > halfWorld || Math.abs(plane.pos.z) > halfWorld) {
    ms.outOfBoundsTime += stepDt;
    if (!ms.oobWarned) {
      ms.oobWarned = true;
      out.push({ type: 'missionScore', points: 0, text: 'RETURN TO ISLANDS!' });
    }
    if (ms.outOfBoundsTime > 30) {
      ms.failed = true;
      ms.reason = 'Out of bounds > 30s';
      out.push({ type: 'missionFail', points: 0, text: 'LOST AT SEA!' });
      dropKeyLatch = false;
      return out;
    }
  } else {
    ms.outOfBoundsTime = 0;
    ms.oobWarned = false;
  }

  if (ms.id === 'rings') {
    stepOrderedRings(ms, plane, world, evs, ringPts, out);
    if (ms.ringsLeft <= 0) {
      const bonus = Math.max(0, Math.round((110 - ms.elapsed) * 12));
      ms.bonusScore = bonus;
      ms.score += bonus;
      ms.done = true;
      updateBest(ms);
      out.push({ type: 'missionDone', points: bonus, text: 'RINGS CLEAR! BONUS +' + bonus });
    }
  } else if (ms.id === 'landing') {
    const rw = world?.runway || { cx: 0, cz: 0 };
    const rwyY = world?.heightAt ? world.heightAt(rw.cx ?? 0, rw.cz ?? 0) : 0;
    const dist = Math.hypot(plane.pos.x - (rw.cx ?? 0), plane.pos.z - (rw.cz ?? 0));

    if (ms.phase === 'takeoff') {
      const lifted = evs.some((e) => e.type === 'liftoff') || (!plane.onGround && plane.pos.y - rwyY > 12);
      if (lifted && plane.pos.y - rwyY > 8) {
        ms.phase = 'circuit';
        ms.score += 100;
        ms.baseScore += 100;
        out.push({ type: 'missionScore', points: 100, text: 'LIFTOFF +100' });
      }
    } else if (ms.phase === 'circuit') {
      if (dist > ms.maxCircuitDist) ms.maxCircuitDist = dist;
      if (ms.maxCircuitDist >= 450) {
        ms.phase = 'approach';
        ms.score += 150;
        ms.baseScore += 150;
        out.push({ type: 'missionScore', points: 150, text: 'CIRCUIT COMPLETE +150' });
      }
    } else if (ms.phase === 'approach') {
      const touched =
        evs.some((e) => e.type === 'touchdown' || e.type === 'hardLanding') ||
        (!ms.wasOnGround && Boolean(plane.onGround));
      if (touched && isOnRunwayBounds(plane, world)) {
        // Use the touchdown/hardLanding EVENT data: stepPlane already reset
        // vel.y to 0 by the time updateMission runs, so recomputing here
        // would read sinkRate 0 and score a hard landing like a perfect one.
        const tdEv = evs.find((e) => e && (e.type === 'touchdown' || e.type === 'hardLanding'));
        let td;
        if (tdEv && tdEv.score != null) {
          td = tdEv; // honest pre-clamp score from stepPlane
        } else if (tdEv) {
          // hardLanding event: real sinkRate/speed, score 0 per the
          // checkRunwayTouchdown rule (sinkRate >= hardLandingSink).
          const geo = checkRunwayTouchdown(plane, world) || {};
          td = { ...geo, sinkRate: tdEv.sinkRate, speed: tdEv.speed, score: 0 };
        } else {
          td = checkRunwayTouchdown(plane, world) || {};
        }
        const quality =
          td.score != null
            ? Math.max(0, Math.round(td.score))
            : Math.max(
                10,
                Math.round(
                  100 -
                    Math.abs(td.centerOffset || 0) * 3 -
                    Math.abs(td.sinkRate || 0) * 8 -
                    Math.max(0, (td.speed || 0) - 36) * 1.5
                )
              );
        const pts = landingBase + quality * 8;
        ms.bonusScore = quality * 8;
        ms.score += pts;
        ms.done = true;
        updateBest(ms);
        out.push({ type: 'missionDone', points: pts, text: 'TOUCHDOWN ' + quality });
      }
    }
  } else if (ms.id === 'canyon') {
    stepOrderedRings(ms, plane, world, evs, ringPts, out);
    const dropPressed =
      dropKeyLatch ||
      Boolean(ms.dropRequested) ||
      Boolean(input?.consumePressed?.('KeyX')) ||
      evs.some((e) => e.type === 'drop' || e.type === 'supplyDrop');
    ms.dropRequested = false;

    if (dropPressed && !ms.dropDelivered && ms.dropZone) {
      const d = Math.hypot(plane.pos.x - ms.dropZone.x, plane.pos.z - ms.dropZone.z);
      if (d <= ms.dropZone.r) {
        ms.dropDelivered = true;
        ms.dropZone.dropped = true;
        const pts = 300 + Math.round((1 - d / ms.dropZone.r) * 200);
        ms.score += pts;
        ms.baseScore += pts;
        out.push({ type: 'missionScore', points: pts, text: 'SUPPLY DROP +' + pts });
      } else {
        out.push({ type: 'missionScore', points: 0, text: 'DROP ZONE ' + Math.round(d) + 'M AWAY' });
      }
    }

    if (ms.ringsLeft <= 0 && ms.dropDelivered) {
      const bonus = Math.max(100, Math.round((135 - ms.elapsed) * 14));
      ms.bonusScore = bonus;
      ms.score += bonus;
      ms.done = true;
      updateBest(ms);
      out.push({ type: 'missionDone', points: bonus, text: 'CANYON RUN COMPLETE +' + bonus });
    }
  }

  dropKeyLatch = false;
  ms.wasOnGround = Boolean(plane.onGround);
  updateBest(ms);
  return out;
}

export function missionObjectiveText(ms) {
  if (!ms) return 'Select a mission (1 / 2 / 3) and press ENTER';
  if (ms.done) return 'MISSION COMPLETE — FINAL SCORE ' + ms.score;
  if (ms.failed) return 'MISSION FAILED — ' + (ms.reason || 'Aircraft lost');
  if (ms.outOfBoundsTime > 0) {
    return 'OUT OF BOUNDS! Turn back within ' + Math.max(0, Math.ceil(30 - ms.outOfBoundsTime)) + 's';
  }
  if (ms.id === 'rings') {
    return 'RING RACE: Pass ring ' + (ms.nextRingIndex + 1) + '/' + ms.ringsTotal + ' in order';
  }
  if (ms.id === 'landing') {
    if (ms.phase === 'takeoff') return 'PRECISION LANDING: Throttle up (W) and take off from runway';
    if (ms.phase === 'circuit') {
      return 'PRECISION LANDING: Fly outbound circuit (' + Math.min(450, Math.round(ms.maxCircuitDist)) + '/450m)';
    }
    return 'PRECISION LANDING: Line up on RWY 09, gear down (G)';
  }
  if (ms.ringsLeft > 0 && !ms.dropDelivered) {
    return 'CANYON RUN: Ring ' + (ms.nextRingIndex + 1) + '/' + ms.ringsTotal + ' + Supply Drop (press X at zone)';
  }
  if (ms.ringsLeft > 0) {
    return 'CANYON RUN: Supplies dropped! Clear ring ' + (ms.nextRingIndex + 1) + '/' + ms.ringsTotal;
  }
  return 'CANYON RUN: Fly over Drop Zone and press X to release supplies';
}
