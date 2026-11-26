import { CONFIG } from './config.js';
import { createCamera, updateChaseCamera, project } from './projection.js';
import { createWorld } from './world.js';
import {
  createPlane,
  stepPlane,
  planeSpeed,
  checkRingPass,
} from './aircraft.js';
import { createInput } from './input.js';
import { drawHUD, drawTitle, drawResult } from './hud.js';
import { MISSIONS, createMissionState, updateMission, missionObjectiveText } from './missions.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { render, getRunwayAxis } from './render.js';
import {
  SHOT_LIST,
  applyShot,
  stageShot,
  orientPlaneToward,
  orientCameraToward,
  syncCockpitCamera,
} from './shots.js';

const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

function consumeKey(input, code, fallbackKey) {
  return Boolean(input.consumePressed(code) || (fallbackKey && input.consumePressed(fallbackKey)));
}

function addPopup(effects, text, worldPos, color, cam) {
  if (!effects || typeof effects.addText !== 'function') return;
  // addText takes SCREEN coords (x, y, text, color); project the world pos first.
  if (worldPos && cam) {
    const s = project(cam, worldPos);
    if (!s || s.behind || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return;
    effects.addText(Math.round(s.x), Math.round(s.y), String(text), color);
    return;
  }
  if (worldPos && Number.isFinite(worldPos.x) && Number.isFinite(worldPos.y)) {
    effects.addText(worldPos.x, worldPos.y, String(text), color);
  }
}

function positionPlaneForStart(plane, world, ms) {
  const custom = ms && (ms.start || ms.spawn || ms.startState);
  if (custom && custom.pos) {
    plane.pos.x = custom.pos.x;
    plane.pos.y = custom.pos.y;
    plane.pos.z = custom.pos.z;
    if (typeof custom.yaw === 'number') plane.yaw = custom.yaw;
    if (typeof custom.pitch === 'number') plane.pitch = custom.pitch;
    if (typeof custom.roll === 'number') plane.roll = custom.roll;
    if (typeof custom.speed === 'number') plane.speed = custom.speed;
    if (typeof custom.throttle === 'number') plane.throttle = custom.throttle;
    if (typeof custom.onGround === 'boolean') plane.onGround = custom.onGround;
    if (typeof custom.gearDown === 'boolean') plane.gearDown = custom.gearDown;
    if (typeof custom.flaps === 'boolean') plane.flaps = custom.flaps;
    return;
  }
  const rw = world.runway;
  if (rw && plane.onGround) {
    const { dx, dz } = getRunwayAxis(world);
    const ry = Math.max(0, world.heightAt(rw.cx, rw.cz));
    const baseClear = plane.pos.y - Math.max(0, world.heightAt(plane.pos.x, plane.pos.z));
    const gearH = baseClear > 0.4 && baseClear < 4.5 ? baseClear : 1.8;
    plane.pos.x = rw.cx - dx * (rw.len * 0.43);
    plane.pos.y = ry + gearH;
    plane.pos.z = rw.cz - dz * (rw.len * 0.43);
    orientPlaneToward(plane, dx, 0, dz, 0);
  }
}

function resetMissionSession(game, targetState) {
  const mIdx = Math.max(0, Math.min(MISSIONS.length - 1, game.missionIndex || 0));
  const mDef = MISSIONS[mIdx] || { id: 'rings' };
  const world = createWorld(game.seed);
  const plane = createPlane();
  const cam = createCamera();
  const effects = createEffects();
  const ms = createMissionState(mDef.id, world);

  positionPlaneForStart(plane, world, ms);
  const { dx, dz } = getRunwayAxis(world);
  cam.pos.x = plane.pos.x - dx * 26;
  cam.pos.y = plane.pos.y + 7;
  cam.pos.z = plane.pos.z - dz * 26;
  orientCameraToward(cam, dx, -0.1, dz, 0);
  for (let i = 0; i < 30; i++) updateChaseCamera(cam, plane, 0.05);

  game.world = world;
  game.plane = plane;
  game.cam = cam;
  game.effects = effects;
  game.missionIndex = mIdx;
  game.selectedMission = mIdx;
  game.missionId = mDef.id;
  game.mission = ms;
  game.objective = missionObjectiveText(ms);
  game.state = targetState;
  game.time = 0;
  game.score = (ms && ms.score) || 0;
  game.ringsPassed = 0;
  game.ringsTotal = (world.rings && world.rings.length) || 0;
  game.stalling = false;
  game.lowFuel = false;
  game.outOfBounds = false;
  game.won = false;
  game.crashed = false;
  game.result = null;
  game.drops = [];
  game.crashTimer = 0;
  game._alarmNext = 0;
  game._fuelAlarmNext = 0;
  game._oobPopupNext = 0;
  game._liftoffCool = 0;
  game._smokeT = -1;
  game._dustT = 0;
}

function finishFlight(game, won, crashed, title, reason, extra = {}) {
  const rings = game.world.rings || [];
  const passed = rings.filter((r) => r.passed).length;
  game.won = won;
  game.victory = won;
  game.crashed = crashed;
  game.reason = reason;
  game.result = {
    won,
    success: won,
    victory: won,
    crashed,
    title,
    reason,
    message: reason,
    score: Math.round(game.score || 0),
    time: game.time,
    ringsPassed: passed,
    ringsTotal: rings.length,
    fuelLeft: Math.max(0, Math.round(game.plane.fuel || 0)),
    damage: Math.round(game.plane.damage || 0),
    ...extra,
  };
  game.audio.engine?.(0, 0);
  game.audio.wind?.(0);
}

function applyOutOfBoundsPush(game, dt) {
  const half = (CONFIG?.world?.size || CONFIG?.worldSize || 4000) * 0.5;
  const limit = half * 0.88;
  const p = game.plane;
  const ax = Math.abs(p.pos.x);
  const az = Math.abs(p.pos.z);
  if (ax > limit || az > limit) {
    game.outOfBounds = true;
    const dist = Math.hypot(p.pos.x, p.pos.z) || 1;
    const nx = -p.pos.x / dist;
    const nz = -p.pos.z / dist;
    const excess = Math.max(ax - limit, az - limit);
    const push = Math.min(48, 12 + excess * 0.22);
    p.vel.x += nx * push * dt;
    p.vel.z += nz * push * dt;
    p.pos.x += nx * Math.min(28, excess * 0.08) * dt;
    p.pos.z += nz * Math.min(28, excess * 0.08) * dt;
    if (game.time >= game._oobPopupNext) {
      game._oobPopupNext = game.time + 2.4;
      addPopup(game.effects, 'STRONG WIND — TURN BACK!', { x: p.pos.x, y: p.pos.y + 4, z: p.pos.z }, '#ff9e44', game.cam);
      game.audio.beep?.(340, 0.09);
    }
  } else {
    game.outOfBounds = false;
  }
}

function updateSupplyDrops(game, dt, evObj) {
  const drops = game.drops;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vy = Math.max(-14, d.vy - 4.5 * dt);
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    const gh = Math.max(0, game.world.heightAt(d.x, d.z));
    if (d.y <= gh + 0.6) {
      d.y = gh + 0.6;
      game.effects.spawnDust?.(d.x, gh + 0.5, d.z);
      evObj.dropLanded = { x: d.x, y: gh, z: d.z };
      drops.splice(i, 1);
    }
  }
}

function stepSimulation(game, dt) {
  const { input, audio, effects } = game;
  input.update(dt);

  if (consumeKey(input, 'KeyM', 'm')) {
    audio.ensure?.();
    audio.setMuted?.(!audio.muted);
    game.muted = Boolean(audio.muted);
  }
  if (consumeKey(input, 'KeyV', 'v')) {
    game.view = game.view === 'cockpit' ? 'chase' : 'cockpit';
    if (game.view === 'cockpit') syncCockpitCamera(game.cam, game.plane);
    else for (let i = 0; i < 8; i++) updateChaseCamera(game.cam, game.plane, 0.05);
  }

  if (game.state === 'title') {
    game.time += dt;
    for (let i = 0; i < MISSIONS.length && i < 3; i++) {
      const n = i + 1;
      if (consumeKey(input, `Digit${n}`, String(n)) || consumeKey(input, `Numpad${n}`, null)) {
        game.missionIndex = i;
        game.selectedMission = i;
        game.missionId = MISSIONS[i].id;
        game.mission = createMissionState(game.missionId, game.world);
        game.objective = missionObjectiveText(game.mission);
        audio.ensure?.();
        audio.beep?.(580 + i * 70, 0.07);
      }
    }
    const orbitA = game.time * 0.16;
    const rw = game.world.runway || { cx: 0, cz: 0 };
    const ry = Math.max(0, game.world.heightAt(rw.cx, rw.cz));
    game.cam.pos.x = game.plane.pos.x - Math.cos(orbitA) * 30;
    game.cam.pos.y = ry + 11 + Math.sin(game.time * 0.4) * 1.5;
    game.cam.pos.z = game.plane.pos.z - Math.sin(orbitA) * 30;
    orientCameraToward(
      game.cam,
      game.plane.pos.x + 35 - game.cam.pos.x,
      ry + 3 - game.cam.pos.y,
      game.plane.pos.z - game.cam.pos.z,
      0
    );
    effects.update(dt);
    if (consumeKey(input, 'Enter', 'enter')) {
      audio.ensure?.();
      resetMissionSession(game, 'flying');
      audio.startMusic?.();
      audio.beep?.(720, 0.1);
    }
    return;
  }

  if (consumeKey(input, 'KeyR', 'r')) {
    audio.ensure?.();
    resetMissionSession(game, 'flying');
    audio.startMusic?.();
    return;
  }

  if (game.state === 'paused') {
    game.paused = true;
    if (consumeKey(input, 'KeyP', 'p') || consumeKey(input, 'Escape', 'escape') || consumeKey(input, 'Enter', 'enter')) {
      game.state = 'flying';
      game.paused = false;
    }
    return;
  }
  game.paused = false;

  if (game.state === 'crashed') {
    game.time += dt;
    effects.update(dt);
    game.crashTimer -= dt;
    if (game.crashTimer <= 0 || consumeKey(input, 'Enter', 'enter')) {
      game.state = 'result';
    }
    return;
  }

  if (game.state === 'result') {
    game.time += dt;
    effects.update(dt);
    if (consumeKey(input, 'Enter', 'enter')) {
      audio.stopMusic?.();
      resetMissionSession(game, 'title');
    }
    return;
  }

  // state === 'flying'
  if (consumeKey(input, 'KeyP', 'p') || consumeKey(input, 'Escape', 'escape')) {
    game.state = 'paused';
    game.paused = true;
    audio.engine?.(0, 0);
    audio.wind?.(0);
    return;
  }

  game.time += dt;
  const plane = game.plane;
  const world = game.world;
  const wasOnGround = Boolean(plane.onGround);

  if (plane.fuel <= 0) {
    plane.fuel = 0;
    plane.throttle = 0;
  }

  const rawEvents = stepPlane(plane, input, world, dt);
  // stepPlane returns an ARRAY of {type, ...} events — normalize it into flags.
  // (The old code read object keys like ev.rings/ev.touchdown off the array,
  // which are always undefined, so ring FX, touchdown scoring and mission
  // popups silently never fired.)
  const evList = Array.isArray(rawEvents) ? rawEvents : [];
  const findEv = (t) => evList.find((e) => e && e.type === t);
  const hasEv = (t) => evList.some((e) => e && e.type === t);
  const ev = {};
  if (hasEv('stall')) ev.stall = true;
  if (hasEv('liftoff')) ev.liftoff = true;
  if (findEv('crash')) ev.crash = true;

  if (consumeKey(input, 'KeyG', 'g')) {
    if (!plane.onGround) {
      plane.gearDown = !plane.gearDown;
      audio.beep?.(plane.gearDown ? 480 : 620, 0.06);
    } else {
      audio.beep?.(240, 0.06);
    }
  }
  if (consumeKey(input, 'KeyF', 'f')) {
    // flaps is a numeric 0|1|2 notch — cycle it, never assign a boolean.
    plane.flaps = ((Number(plane.flaps) || 0) + 1) % 3;
    audio.beep?.(plane.flaps === 0 ? 660 : plane.flaps === 1 ? 520 : 580, 0.06);
  }

  if (consumeKey(input, 'KeyX', 'x')) {
    ev.supplyDrop = true;
    ev.drop = true;
    ev.dropPos = { x: plane.pos.x, y: plane.pos.y, z: plane.pos.z };
    if (Array.isArray(rawEvents)) rawEvents.push({ type: 'drop', pos: ev.dropPos });
    if (game.mission && typeof game.mission.drop === 'function') {
      game.mission.drop(plane, world);
    }
    game.drops.push({
      x: plane.pos.x,
      y: plane.pos.y - 1.4,
      z: plane.pos.z,
      vx: plane.vel.x * 0.45,
      vy: Math.min(-2, plane.vel.y - 2),
      vz: plane.vel.z * 0.45,
    });
    audio.beep?.(440, 0.1);
    addPopup(effects, 'SUPPLY DROP!', { x: plane.pos.x, y: plane.pos.y + 3.5, z: plane.pos.z }, '#6eeeff', game.cam);
  }

  updateSupplyDrops(game, dt, ev);
  applyOutOfBoundsPush(game, dt);

  const spd = planeSpeed(plane);
  const minFly = CONFIG?.physics?.minFlySpeed || CONFIG?.minFlySpeed || 22;
  const ringPts = CONFIG?.scoring?.ringPoints || CONFIG?.ringPoints || 250;

  // Stall check & alarm
  const isStall = Boolean(ev.stall || (!plane.onGround && spd < minFly));
  game.stalling = isStall;
  if (isStall && game.time >= game._alarmNext) {
    game._alarmNext = game.time + 0.7;
    audio.alarm?.('stall');
  }

  // Low fuel check
  game.lowFuel = plane.fuel > 0 && plane.fuel < 18;
  if (game.lowFuel && !plane.onGround && game.time >= game._fuelAlarmNext) {
    game._fuelAlarmNext = game.time + 3.0;
    audio.alarm?.('fuel');
  }

  // Liftoff event
  const liftedOff = Boolean(ev.liftoff || (wasOnGround && !plane.onGround && spd > minFly * 0.8));
  if (liftedOff && game.time >= game._liftoffCool) {
    game._liftoffCool = game.time + 3.0;
    audio.beep?.(680, 0.08);
    addPopup(effects, 'LIFTOFF!', { x: plane.pos.x, y: plane.pos.y + 3.5, z: plane.pos.z }, '#a6f4c5', game.cam);
  }

  // Ring pass events — stepPlane already marks ring.passed when it detects
  // the pass, so read the events it emitted this frame.
  const rings = world.rings || [];
  const passedNow = [];
  for (const e of evList) {
    if (e && e.type === 'ring' && e.ring) passedNow.push(e.ring);
  }
  // Safety net: a ring stepPlane somehow missed.
  for (let i = 0; i < rings.length; i++) {
    const r = rings[i];
    if (!r.passed && checkRingPass(plane, r)) {
      r.passed = true;
      passedNow.push(r);
    }
  }
  if (passedNow.length > 0) {
    ev.rings = passedNow;
    ev.ringPassed = passedNow[0];
  }

  // Touchdown event — carries the pre-clamp sink rate from stepPlane.
  // Do NOT recompute after stepPlane: vel.y is already reset to 0 by then,
  // which would score every landing as a perfect sink rate.
  const tdEv = findEv('touchdown');
  let tdInfo = tdEv || null;
  if (tdInfo && tdInfo.score > 0) {
    effects.spawnDust?.(plane.pos.x, plane.pos.y - 1, plane.pos.z);
  }

  // Crash detection — only a real 'crash' impact (or damage reaching 100)
  // is fatal. A 'hardLanding' impact only damages the airframe; stepPlane
  // already applied that damage. (The old code treated ANY truthy
  // checkCrash() result — including survivable hard landings — as fatal.)
  const crashedNow = Boolean(ev.crash || plane.damage >= 100);
  if (crashedNow) {
    ev.crash = true;
    plane.damage = 100;
    const gType = String(world.groundType(plane.pos.x, plane.pos.z) || '').toLowerCase();
    if (plane.pos.y <= 1.2 && (gType === 'sea' || gType === 'water' || gType === 'ocean')) {
      effects.spawnSplash?.(plane.pos.x, 0.2, plane.pos.z);
    }
    effects.spawnExplosion?.(plane.pos.x, plane.pos.y, plane.pos.z);
    effects.addShake?.(10);
    audio.crash?.();
    audio.stopMusic?.();
    updateMission(game.mission, plane, world, rawEvents || ev, dt);
    game.state = 'crashed';
    game.crashTimer = 1.25;
    finishFlight(game, false, true, 'AIRCRAFT CRASHED', 'Impact with terrain or sea');
    return;
  }

  const prevMsScore = game.mission && typeof game.mission.score === 'number' ? game.mission.score : null;
  const mOut = updateMission(game.mission, plane, world, rawEvents || ev, dt);
  const newMsScore = game.mission && typeof game.mission.score === 'number' ? game.mission.score : null;

  for (let i = 0; i < passedNow.length; i++) {
    const r = passedNow[i];
    // The mission may have rejected this ring (out of order: stepOrderedRings
    // sets r.passed = false and shows WRONG WAY). Never award fallback points
    // or a '+250 RING!' popup for a rejected ring.
    if (r.passed === false) continue;
    if (newMsScore === null || newMsScore === prevMsScore) {
      game.score += ringPts;
      if (game.mission && typeof game.mission === 'object') game.mission.score = game.score;
    } else {
      game.score = newMsScore;
    }
    effects.spawnRingBurst?.(r.x, r.y, r.z);
    audio.ring?.();
    addPopup(effects, `+${ringPts} RING!`, { x: r.x, y: r.y + 4, z: r.z }, '#ffd166', game.cam);
  }

  if (tdInfo && tdInfo.score > 0) {
    const pts = Math.round(tdInfo.score);
    if (newMsScore === null || newMsScore === prevMsScore) {
      game.score += pts;
      if (game.mission && typeof game.mission === 'object') game.mission.score = game.score;
    } else {
      game.score = newMsScore;
    }
    audio.touchdown?.(pts);
    addPopup(effects, `TOUCHDOWN +${pts}!`, { x: plane.pos.x, y: plane.pos.y + 4, z: plane.pos.z }, '#6ef7a7', game.cam);
  } else if (newMsScore !== null && newMsScore > game.score) {
    game.score = newMsScore;
  }

  // updateMission returns an ARRAY of {type, text} items — surface its
  // feedback as popups (the old code read mOut.popup, always undefined).
  if (Array.isArray(mOut)) {
    for (const item of mOut) {
      if (!item || typeof item.text !== 'string') continue;
      if (item.type === 'missionScore' || item.type === 'missionDone' || item.type === 'missionFail') {
        addPopup(effects, item.text, { x: plane.pos.x, y: plane.pos.y + 4, z: plane.pos.z }, '#8ce8ff', game.cam);
      }
    }
  } else if (mOut && mOut.popup) {
    addPopup(effects, String(mOut.popup), { x: plane.pos.x, y: plane.pos.y + 4, z: plane.pos.z }, '#8ce8ff', game.cam);
  }

  game.ringsPassed = rings.filter((r) => r.passed).length;
  game.objective = missionObjectiveText(game.mission);

  if (game.view === 'cockpit') {
    syncCockpitCamera(game.cam, plane);
  } else {
    updateChaseCamera(game.cam, plane, dt);
    const minY = Math.max(0, world.heightAt(game.cam.pos.x, game.cam.pos.z)) + 1.8;
    if (game.cam.pos.y < minY) game.cam.pos.y = minY;
  }

  if (plane.onGround && spd > 8) {
    // Rate-limit: spawnDust emits 8 particles per call — every frame would
    // be ~480/s and thrash the 400-particle cap.
    game._dustT = (game._dustT || 0) + dt;
    if (game._dustT >= 0.12) {
      game._dustT = 0;
      effects.spawnDust?.(plane.pos.x, plane.pos.y - 1.1, plane.pos.z);
    }
  } else {
    game._dustT = 0;
  }

  audio.engine?.(plane.throttle, spd);
  audio.wind?.(spd);
  effects.update(dt);

  const ms = game.mission || {};
  const wonMission = Boolean(
    ms.won || ms.completed || ms.complete || ms.done ||
    ms.status === 'won' || ms.status === 'complete' || ms.status === 'success' ||
    (mOut && (mOut.won || mOut.completed || mOut.complete || mOut.done))
  );
  const failedMission = Boolean(
    ms.failed || ms.status === 'failed' || (mOut && mOut.failed)
  );

  if (wonMission) {
    audio.touchdown?.(game.score || 200);
    game.state = 'result';
    finishFlight(game, true, false, 'MISSION COMPLETE!', ms.summary || game.objective || 'All objectives completed');
  } else if (failedMission) {
    audio.beep?.(240, 0.2);
    game.state = 'result';
    finishFlight(game, false, false, 'MISSION FAILED', ms.failReason || ms.reason || 'Objective not met');
  }
}

function renderAll(ctx, game) {
  render(ctx, game);
  if (game.state === 'title') {
    drawTitle(ctx, game);
  } else if (game.state === 'result') {
    drawHUD(ctx, game);
    drawResult(ctx, game);
  } else {
    drawHUD(ctx, game);
    if (game.state === 'paused') {
      const W = ctx.canvas.width || 1280;
      ctx.save();
      ctx.fillStyle = 'rgba(12, 10, 24, 0.72)';
      ctx.fillRect(W * 0.5 - 210, 74, 420, 48);
      ctx.strokeStyle = '#ffad5c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(W * 0.5 - 210, 74, 420, 48);
      ctx.fillStyle = '#fff5e6';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED — Press P / Esc to Resume or R to Restart', W * 0.5, 104);
      ctx.restore();
    }
  }
}

function fitCanvasCss(canvas) {
  if (typeof window === 'undefined' || !canvas || !canvas.style) return;
  const W = 1280;
  const H = 720;
  const hint = typeof document !== 'undefined' ? document.getElementById('hint') : null;
  const hintH = hint ? Math.max(28, hint.offsetHeight || 32) : 32;
  const availW = Math.max(320, window.innerWidth);
  const availH = Math.max(200, window.innerHeight - hintH);
  const scale = Math.min(availW / W, availH / H);
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}

export function startGame(canvas, query) {
  const cw = CONFIG?.canvas?.width || CONFIG?.width || 1280;
  const ch = CONFIG?.canvas?.height || CONFIG?.height || 720;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  const params = query instanceof URLSearchParams
    ? query
    : new URLSearchParams(typeof query === 'string' ? query : (typeof window !== 'undefined' ? window.location.search : ''));

  const seedParam = params.get('seed');
  const initialSeed = seedParam !== null && seedParam !== '' ? Number(seedParam) || 1 : 1;

  const input = createInput();
  input.attach(canvas);
  const audio = createAudio();

  const game = {
    canvas,
    ctx,
    seed: initialSeed,
    state: 'title',
    view: 'chase',
    time: 0,
    score: 0,
    muted: Boolean(audio.muted),
    paused: false,
    missions: MISSIONS,
    missionIndex: 0,
    selectedMission: 0,
    missionId: MISSIONS[0]?.id || 'rings',
    mission: null,
    objective: '',
    plane: null,
    world: null,
    cam: null,
    effects: null,
    input,
    audio,
    drops: [],
    result: null,
    shotList: SHOT_LIST,
  };

  resetMissionSession(game, 'title');
  fitCanvasCss(canvas);

  game.renderOnce = () => renderAll(ctx, game);
  game.stageShot = (name) => {
    const ok = stageShot(game, name);
    renderAll(ctx, game);
    return ok;
  };

  if (typeof window !== 'undefined') {
    window.__game = game;
    window.addEventListener('resize', () => fitCanvasCss(canvas));

    const unlockAudio = () => {
      audio.ensure?.();
      if (game.state === 'flying' && !audio.muted) audio.startMusic?.();
    };
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('pointerdown', unlockAudio, { once: true });

    const autoPause = () => {
      if (game.state === 'flying') {
        game.state = 'paused';
        game.paused = true;
        audio.engine?.(0, 0);
        audio.wind?.(0);
      }
    };
    window.addEventListener('blur', autoPause);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) autoPause();
      });
    }
  }

  const hasShot = applyShot(game, params);
  if (hasShot) {
    renderAll(ctx, game);
    const stillParam = params.get('still');
    if (stillParam !== '0' && stillParam !== 'false') {
      return game;
    }
  }

  let lastMs = null;
  let acc = 0;
  let running = true;

  function loop(nowMs) {
    if (!running) return;
    if (lastMs === null) lastMs = nowMs;
    let dt = (nowMs - lastMs) / 1000;
    lastMs = nowMs;
    if (dt < 0) dt = 0;
    if (dt > 0.1) dt = 0.1;

    acc += dt;
    let sub = 0;
    while (acc >= FIXED_DT && sub < MAX_SUBSTEPS) {
      stepSimulation(game, FIXED_DT);
      acc -= FIXED_DT;
      sub++;
    }
    if (sub === MAX_SUBSTEPS && acc > FIXED_DT) acc = 0;

    renderAll(ctx, game);
    requestAnimationFrame(loop);
  }

  renderAll(ctx, game);
  requestAnimationFrame(loop);

  game.stop = () => {
    running = false;
    input.detach?.();
    audio.stopMusic?.();
  };

  return game;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const autoBoot = () => {
    const el = document.getElementById('game');
    if (el && !window.__game) {
      startGame(el, new URLSearchParams(window.location.search));
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBoot, { once: true });
  } else {
    autoBoot();
  }
}
