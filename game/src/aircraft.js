// FILE: game/src/aircraft.js
import { CONFIG } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrapAngle(a) {
  const twoPi = Math.PI * 2;
  return ((a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

export const PLANE_SHAPE = [
  {
    part: 'propDisc',
    type: 'circle',
    cx: 0,
    cy: -9,
    r: 15,
    fill: 'rgba(255, 236, 200, 0.28)',
    stroke: 'rgba(255, 220, 170, 0.45)',
    lineWidth: 1,
    cmds: [{ op: 'arc', args: [0, -9, 15, 0, Math.PI * 2] }],
    points: [[0, -9]],
  },
  {
    part: 'propBlade',
    type: 'poly',
    fill: '#2b2528',
    stroke: null,
    lineWidth: 1,
    points: [[-14, -10], [14, -8], [14, -7], [-14, -9]],
    cmds: [
      { op: 'moveTo', args: [-14, -10] },
      { op: 'lineTo', args: [14, -8] },
      { op: 'lineTo', args: [14, -7] },
      { op: 'lineTo', args: [-14, -9] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'gearLeft',
    type: 'line',
    fill: '#262326',
    stroke: '#463f44',
    lineWidth: 2.2,
    points: [[-5, 9], [-12, 16]],
    cmds: [
      { op: 'moveTo', args: [-5, 9] },
      { op: 'lineTo', args: [-12, 16] },
    ],
  },
  {
    part: 'gearRight',
    type: 'line',
    fill: '#262326',
    stroke: '#463f44',
    lineWidth: 2.2,
    points: [[5, 9], [12, 16]],
    cmds: [
      { op: 'moveTo', args: [5, 9] },
      { op: 'lineTo', args: [12, 16] },
    ],
  },
  {
    part: 'wingStruts',
    type: 'line',
    fill: null,
    stroke: '#bfb29e',
    lineWidth: 1.5,
    points: [[-7, 6], [-28, -2], [7, 6], [28, -2]],
    cmds: [
      { op: 'moveTo', args: [-7, 6] },
      { op: 'lineTo', args: [-28, -2] },
      { op: 'moveTo', args: [7, 6] },
      { op: 'lineTo', args: [28, -2] },
    ],
  },
  {
    part: 'wingMain',
    type: 'poly',
    fill: '#f6efe2',
    stroke: '#594842',
    lineWidth: 1.4,
    points: [[-56, -4], [56, -4], [52, 4], [-52, 4]],
    cmds: [
      { op: 'moveTo', args: [-56, -4] },
      { op: 'lineTo', args: [56, -4] },
      { op: 'lineTo', args: [52, 4] },
      { op: 'lineTo', args: [-52, 4] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'wingTips',
    type: 'poly',
    fill: '#d94832',
    stroke: null,
    lineWidth: 1,
    points: [[-56, -4], [-45, -4], [-43, 4], [-52, 4]],
    cmds: [
      { op: 'moveTo', args: [-56, -4] },
      { op: 'lineTo', args: [-45, -4] },
      { op: 'lineTo', args: [-43, 4] },
      { op: 'lineTo', args: [-52, 4] },
      { op: 'closePath', args: [] },
      { op: 'moveTo', args: [45, -4] },
      { op: 'lineTo', args: [56, -4] },
      { op: 'lineTo', args: [52, 4] },
      { op: 'lineTo', args: [43, 4] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'fuselage',
    type: 'poly',
    fill: '#f2e9d8',
    stroke: '#4f3f3a',
    lineWidth: 1.5,
    points: [[0, -14], [7, -8], [9, 1], [7, 10], [3, 15], [-3, 15], [-7, 10], [-9, 1], [-7, -8]],
    cmds: [
      { op: 'moveTo', args: [0, -14] },
      { op: 'lineTo', args: [7, -8] },
      { op: 'lineTo', args: [9, 1] },
      { op: 'lineTo', args: [7, 10] },
      { op: 'lineTo', args: [3, 15] },
      { op: 'lineTo', args: [-3, 15] },
      { op: 'lineTo', args: [-7, 10] },
      { op: 'lineTo', args: [-9, 1] },
      { op: 'lineTo', args: [-7, -8] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'stripe',
    type: 'poly',
    fill: '#d94832',
    stroke: null,
    lineWidth: 1,
    points: [[-8, 2], [8, 2], [7, 6], [-7, 6]],
    cmds: [
      { op: 'moveTo', args: [-8, 2] },
      { op: 'lineTo', args: [8, 2] },
      { op: 'lineTo', args: [7, 6] },
      { op: 'lineTo', args: [-7, 6] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'cockpit',
    type: 'poly',
    fill: '#7ec8dc',
    stroke: '#3a4a58',
    lineWidth: 1.2,
    points: [[0, -12], [5.5, -7], [4.5, -1], [-4.5, -1], [-5.5, -7]],
    cmds: [
      { op: 'moveTo', args: [0, -12] },
      { op: 'lineTo', args: [5.5, -7] },
      { op: 'lineTo', args: [4.5, -1] },
      { op: 'lineTo', args: [-4.5, -1] },
      { op: 'lineTo', args: [-5.5, -7] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'tailPlane',
    type: 'poly',
    fill: '#eadfce',
    stroke: '#594842',
    lineWidth: 1.3,
    points: [[-22, 5], [22, 5], [19, 9], [-19, 9]],
    cmds: [
      { op: 'moveTo', args: [-22, 5] },
      { op: 'lineTo', args: [22, 5] },
      { op: 'lineTo', args: [19, 9] },
      { op: 'lineTo', args: [-19, 9] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'fin',
    type: 'poly',
    fill: '#d94832',
    stroke: '#4f3f3a',
    lineWidth: 1.3,
    points: [[0, -25], [3.6, 5], [-3.6, 5]],
    cmds: [
      { op: 'moveTo', args: [0, -25] },
      { op: 'lineTo', args: [3.6, 5] },
      { op: 'lineTo', args: [-3.6, 5] },
      { op: 'closePath', args: [] },
    ],
  },
  {
    part: 'navLeft',
    type: 'circle',
    cx: -55,
    cy: -1,
    r: 2.3,
    fill: '#ff3b30',
    stroke: null,
    lineWidth: 1,
    points: [[-55, -1]],
    cmds: [{ op: 'arc', args: [-55, -1, 2.3, 0, Math.PI * 2] }],
  },
  {
    part: 'navRight',
    type: 'circle',
    cx: 55,
    cy: -1,
    r: 2.3,
    fill: '#34c759',
    stroke: null,
    lineWidth: 1,
    points: [[55, -1]],
    cmds: [{ op: 'arc', args: [55, -1, 2.3, 0, Math.PI * 2] }],
  },
  {
    part: 'beacon',
    type: 'circle',
    cx: 0,
    cy: -24,
    r: 2,
    fill: '#ffd97a',
    stroke: null,
    lineWidth: 1,
    points: [[0, -24]],
    cmds: [{ op: 'arc', args: [0, -24, 2, 0, Math.PI * 2] }],
  },
];

export function planeDrawSpec() {
  return {
    wingSpan: 112,
    wingSpanMeters: 11.2,
    fuselage: [
      [0, -14],
      [7, -8],
      [9, 1],
      [7, 10],
      [3, 15],
      [-3, 15],
      [-7, 10],
      [-9, 1],
      [-7, -8],
    ],
    wings: [
      [-56, -4],
      [56, -4],
      [52, 4],
      [-52, 4],
    ],
    tailHorizontal: [
      [-22, 5],
      [22, 5],
      [19, 9],
      [-19, 9],
    ],
    tailFin: [
      [0, -25],
      [3.6, 5],
      [-3.6, 5],
    ],
    cockpit: [
      [0, -12],
      [5.5, -7],
      [4.5, -1],
      [-4.5, -1],
      [-5.5, -7],
    ],
    navLights: {
      left: { x: -55, y: -1, color: '#ff3b30' },
      right: { x: 55, y: -1, color: '#34c759' },
      tail: { x: 0, y: -24, color: '#ffd97a' },
    },
    prop: { x: 0, y: -9, radius: 15 },
    shapes: PLANE_SHAPE,
    colors: {
      body: '#f2e9d8',
      bodyShade: '#cbbba4',
      stripe: '#d94832',
      wing: '#f6efe2',
      wingTip: '#d94832',
      tail: '#eadfce',
      cockpit: '#7ec8dc',
      cockpitGlint: '#dff6ff',
      propBlur: 'rgba(255, 236, 200, 0.28)',
      propBlade: '#2b2528',
      gear: '#3a3538',
      navLeft: '#ff3b30',
      navRight: '#34c759',
      beacon: '#ffd97a',
    },
  };
}

export function createPlane() {
  const rw = CONFIG.world.runway;
  const headingRad = (rw.headingDeg * Math.PI) / 180;
  const startOffset = -rw.len * 0.5 + 36;
  const sx = rw.cx + Math.sin(headingRad) * startOffset;
  const sz = rw.cz - Math.cos(headingRad) * startOffset;
  const sy = rw.elevation + CONFIG.physics.gearHeight;

  return {
    pos: { x: sx, y: sy, z: sz },
    prevPos: { x: sx, y: sy, z: sz },
    vel: { x: 0, y: 0, z: 0 },
    yaw: headingRad,
    pitch: 0,
    roll: 0,
    throttle: 0,
    speed: 0,
    fuel: CONFIG.fuel.capacity,
    damage: 0,
    onGround: true,
    gearDown: true,
    flaps: 0,
    stall: false,
    stalling: false,
    crashed: false,
    propAngle: 0,
  };
}

export function planeNose(p) {
  const cp = Math.cos(p.pitch || 0);
  return {
    x: Math.sin(p.yaw || 0) * cp,
    y: Math.sin(p.pitch || 0),
    z: -Math.cos(p.yaw || 0) * cp,
  };
}

export function planeSpeed(p) {
  return Math.hypot(p.vel.x, p.vel.y, p.vel.z);
}

export function checkRingPass(p, ring) {
  if (!ring || ring.passed) return false;

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

  let p0 = p.prevPos;
  const p1 = p.pos;
  if (!p0 || (p0.x === p1.x && p0.y === p1.y && p0.z === p1.z)) {
    p0 = {
      x: p1.x - (p.vel.x || 0) * 0.05,
      y: p1.y - (p.vel.y || 0) * 0.05,
      z: p1.z - (p.vel.z || 0) * 0.05,
    };
  }

  const d0 = (p0.x - ring.x) * nx + (p0.y - ring.y) * ny + (p0.z - ring.z) * nz;
  const d1 = (p1.x - ring.x) * nx + (p1.y - ring.y) * ny + (p1.z - ring.z) * nz;
  const moveDot = (p1.x - p0.x) * nx + (p1.y - p0.y) * ny + (p1.z - p0.z) * nz;

  if (moveDot <= 0 || !(d0 <= 0 && d1 >= 0)) {
    return false;
  }

  const denom = d1 - d0;
  const t = Math.abs(denom) < 1e-6 ? 0 : clamp(-d0 / denom, 0, 1);
  const hx = p0.x + (p1.x - p0.x) * t;
  const hy = p0.y + (p1.y - p0.y) * t;
  const hz = p0.z + (p1.z - p0.z) * t;
  const dist = Math.hypot(hx - ring.x, hy - ring.y, hz - ring.z);

  return dist <= ring.r;
}

export function checkCrash(p, world) {
  const groundY = world.heightAt(p.pos.x, p.pos.z);
  const clearance = p.gearDown ? CONFIG.physics.gearHeight : CONFIG.physics.bellyHeight;
  if (p.pos.y > groundY + clearance + 0.05) {
    return null;
  }

  const sinkRate = Math.max(0, -(p.vel.y || 0));
  const speed = planeSpeed(p);
  const gType = world.groundType ? world.groundType(p.pos.x, p.pos.z) : 'grass';

  if (
    gType === 'sea' ||
    gType === 'volcano' ||
    gType === 'rock' ||
    sinkRate >= CONFIG.damage.crashSinkRate ||
    p.pitch < -0.55 ||
    (gType !== 'runway' && (sinkRate >= 11 || speed >= CONFIG.damage.crashSpeedThreshold)) ||
    (!p.gearDown && sinkRate >= 6)
  ) {
    return { type: 'crash', sinkRate, speed, groundType: gType };
  }

  if (
    sinkRate >= CONFIG.damage.hardLandingSink ||
    !p.gearDown ||
    gType !== 'runway'
  ) {
    return { type: 'hardLanding', sinkRate, speed, groundType: gType };
  }

  return null;
}

export function checkRunwayTouchdown(p, world) {
  const rw = world.runway || CONFIG.world.runway;
  const rad = (rw.headingDeg * Math.PI) / 180;
  const hx = Math.sin(rad);
  const hz = -Math.cos(rad);
  const ax = -hz;
  const az = hx;

  const dx = p.pos.x - rw.cx;
  const dz = p.pos.z - rw.cz;
  const along = dx * hx + dz * hz;
  const across = dx * ax + dz * az;
  const onRunway = Math.abs(along) <= rw.len * 0.5 && Math.abs(across) <= rw.wid * 0.5;

  const centerOffset = Math.abs(across);
  const sinkRate = Math.max(0, -(p.vel.y || 0));
  const speed = planeSpeed(p);

  if (!onRunway || sinkRate >= CONFIG.damage.hardLandingSink) {
    return { onRunway, centerOffset, sinkRate, speed, score: 0, perfect: false };
  }

  const centerFactor = clamp(1 - centerOffset / (rw.wid * 0.5), 0, 1);
  const sinkFactor = clamp(1 - sinkRate / CONFIG.damage.hardLandingSink, 0, 1);
  const align = Math.abs(Math.sin(p.yaw || 0) * hx - Math.cos(p.yaw || 0) * hz);
  const bonus = CONFIG.scoring.perfectBonus * centerFactor * sinkFactor * Math.max(0.5, align);
  const score = Math.round(CONFIG.scoring.landingBase + bonus);
  const perfect = centerOffset < 3 && sinkRate < 2.2 && align > 0.92;

  return { onRunway, centerOffset, sinkRate, speed, score, perfect };
}

export function stepPlane(p, input = {}, world, dt) {
  const events = [];
  const safeDt = clamp(dt || 0, 0, 2);
  if (safeDt <= 0 || p.crashed) {
    return events;
  }

  if (input.gear && !p.onGround) {
    p.gearDown = !p.gearDown;
  }
  if (typeof input.flaps === 'number' && input.flaps !== 0) {
    p.flaps = clamp(p.flaps + (input.flaps > 0 ? 1 : -1), 0, 2);
  } else if (input.flaps === true) {
    p.flaps = (p.flaps + 1) % 3;
  }

  const steps = Math.max(1, Math.ceil(safeDt / 0.05));
  const h = safeDt / steps;
  const phys = CONFIG.physics;
  const windVx = world && world.wind ? Math.sin(world.wind.dir) * world.wind.speed : 0;
  const windVz = world && world.wind ? -Math.cos(world.wind.dir) * world.wind.speed : 0;

  for (let s = 0; s < steps; s++) {
    if (p.crashed) break;
    p.prevPos = { x: p.pos.x, y: p.pos.y, z: p.pos.z };

    const td = input.throttleDelta || 0;
    const throttleStep = Math.abs(td) > 0.15 ? td * 0.75 * h : td / steps;
    p.throttle = clamp(p.throttle + throttleStep, 0, 1);

    let thrust = 0;
    if (p.fuel > 0) {
      const burn = CONFIG.fuel.burnIdle + (CONFIG.fuel.burnPerSec - CONFIG.fuel.burnIdle) * p.throttle;
      p.fuel = Math.max(0, p.fuel - burn * h);
      thrust = p.throttle * phys.thrustAccel;
    }

    p.propAngle = (p.propAngle + (8 + p.throttle * 34) * h) % (Math.PI * 2);

    const groundY = world.heightAt(p.pos.x, p.pos.z);
    const clearance = p.gearDown ? phys.gearHeight : phys.bellyHeight;
    const surfaceY = groundY + clearance;

    if (p.onGround) {
      if (p.speed < 1 && p.pos.y > surfaceY) {
        p.pos.y = surfaceY;
      }
      p.stall = false;
      p.stalling = false;
      p.roll *= Math.exp(-6 * h);

      const steer = (input.yaw || 0) + (input.roll || 0) * 0.45;
      p.yaw = wrapAngle(p.yaw + steer * 0.9 * clamp(p.speed / 25, 0.15, 1) * h);

      const rotateMin = phys.rotateSpeed - p.flaps * 3.5;
      if (p.speed >= rotateMin) {
        p.pitch = clamp(p.pitch + (input.pitch || 0) * phys.pitchRate * h, 0, 0.34);
      } else {
        p.pitch *= Math.exp(-5 * h);
      }

      const nose = planeNose(p);
      const drag = phys.dragK * p.speed * (0.12 * p.speed + 1.2) * (1 + p.flaps * 0.12);
      const brake = (input.brake ? phys.brakeDecel : 0) + 0.35;
      p.speed = clamp(p.speed + (thrust - drag - brake) * h, 0, phys.maxSpeed);

      const flapBoost = 1 + p.flaps * 0.16;
      const speedRatio = p.speed / phys.cruiseSpeed;
      const lift = phys.liftK * speedRatio * speedRatio * phys.gravity * flapBoost * (1 + p.pitch * 1.9);

      if (p.speed >= rotateMin && (p.pitch > 0.05 || p.speed >= rotateMin + 12) && lift + nose.y * thrust > phys.gravity) {
        p.onGround = false;
        p.vel.x = Math.sin(p.yaw) * p.speed;
        p.vel.y = Math.max(2.0, (lift - phys.gravity) * 0.35 + nose.y * p.speed);
        p.vel.z = -Math.cos(p.yaw) * p.speed;
        events.push({ type: 'liftoff', speed: p.speed });
      } else {
        p.vel.x = Math.sin(p.yaw) * p.speed;
        p.vel.y = 0;
        p.vel.z = -Math.cos(p.yaw) * p.speed;
        p.pos.x += p.vel.x * h;
        p.pos.z += p.vel.z * h;
        p.pos.y = world.heightAt(p.pos.x, p.pos.z) + clearance;
      }
    }

    if (!p.onGround) {
      p.roll = clamp(p.roll + (input.roll || 0) * phys.rollRate * h, -phys.maxRoll, phys.maxRoll);
      if (!input.roll) {
        p.roll *= Math.exp(-0.85 * h);
      }

      p.pitch = clamp(p.pitch + (input.pitch || 0) * phys.pitchRate * h, -phys.maxPitch, phys.maxPitch);
      const bankYaw = Math.sin(p.roll) * phys.turnRate + (input.yaw || 0) * phys.turnRate * 0.45;
      p.yaw = wrapAngle(p.yaw + bankYaw * h);

      const relVx = p.vel.x - windVx * 0.45;
      const relVz = p.vel.z - windVz * 0.45;
      const airSpeed = Math.hypot(relVx, p.vel.y, relVz);

      const minFly = phys.minFlySpeed - p.flaps * 2;
      const wasStalling = p.stall;
      if (airSpeed < minFly) {
        p.stall = true;
        p.stalling = true;
        p.pitch = Math.max(-0.85, p.pitch - 0.75 * h);
        if (!wasStalling) {
          events.push({ type: 'stall', speed: airSpeed });
        }
      } else {
        p.stall = false;
        p.stalling = false;
      }

      const nose = planeNose(p);
      const gearDrag = p.gearDown ? 1.08 : 1.0;
      const flapDrag = 1 + p.flaps * 0.15;
      const dragMag = phys.dragK * airSpeed * (0.12 * airSpeed + 1.2) * gearDrag * flapDrag;

      const speedRatio = airSpeed / phys.cruiseSpeed;
      const stallFactor = p.stall ? 0.28 : 1.0;
      const flapLift = 1 + p.flaps * 0.16;
      const liftMag =
        phys.liftK *
        speedRatio *
        speedRatio *
        phys.gravity *
        1.09 *
        flapLift *
        stallFactor *
        Math.max(0.2, 1 + p.pitch * 1.15);

      const liftUp = liftMag * Math.cos(p.roll) * Math.cos(p.pitch);
      const dragDirX = airSpeed > 0.01 ? -relVx / airSpeed : 0;
      const dragDirY = airSpeed > 0.01 ? -p.vel.y / airSpeed : 0;
      const dragDirZ = airSpeed > 0.01 ? -relVz / airSpeed : 0;

      p.vel.x += (nose.x * thrust + dragDirX * dragMag) * h;
      p.vel.y += (nose.y * thrust + dragDirY * dragMag + liftUp - phys.gravity) * h;
      p.vel.z += (nose.z * thrust + dragDirZ * dragMag) * h;

      if (!p.stall && airSpeed > 1) {
        const align = 1 - Math.exp(-3.1 * h);
        const targetVx = nose.x * airSpeed + windVx * 0.45;
        const targetVy = nose.y * airSpeed;
        const targetVz = nose.z * airSpeed + windVz * 0.45;
        p.vel.x += (targetVx - p.vel.x) * align;
        p.vel.y += (targetVy - p.vel.y) * align * 0.75;
        p.vel.z += (targetVz - p.vel.z) * align;
      }

      const curSpeed = planeSpeed(p);
      if (curSpeed > phys.maxSpeed) {
        const k = phys.maxSpeed / curSpeed;
        p.vel.x *= k;
        p.vel.y *= k;
        p.vel.z *= k;
      }

      p.pos.x += p.vel.x * h;
      p.pos.y += p.vel.y * h;
      p.pos.z += p.vel.z * h;
      p.speed = planeSpeed(p);

      const newGroundY = world.heightAt(p.pos.x, p.pos.z);
      const newSurfaceY = newGroundY + clearance;
      if (p.pos.y <= newSurfaceY) {
        const impact = checkCrash(p, world);
        p.pos.y = newSurfaceY;
        if (impact && impact.type === 'crash') {
          p.damage = CONFIG.damage.maxDamage;
          p.crashed = true;
          p.speed = 0;
          p.vel.x = 0;
          p.vel.y = 0;
          p.vel.z = 0;
          events.push(impact);
          break;
        }
        if (impact && impact.type === 'hardLanding') {
          const added = Math.round(25 + Math.max(0, impact.sinkRate - CONFIG.damage.hardLandingSink) * 6);
          p.damage = Math.min(CONFIG.damage.maxDamage, p.damage + added);
          events.push({ ...impact, damage: p.damage });
          if (p.damage >= CONFIG.damage.maxDamage) {
            p.crashed = true;
            p.speed = 0;
            p.vel.x = 0;
            p.vel.y = 0;
            p.vel.z = 0;
            events.push({ type: 'crash', sinkRate: impact.sinkRate, speed: impact.speed });
            break;
          }
        } else {
          const tdData = checkRunwayTouchdown(p, world);
          events.push({ type: 'touchdown', ...tdData });
        }
        p.onGround = true;
        p.stall = false;
        p.stalling = false;
        p.vel.y = 0;
        p.pitch = Math.max(0, p.pitch * 0.3);
        p.roll *= 0.25;
        p.speed = Math.hypot(p.vel.x, p.vel.z);
      }
    }

    if (world && Array.isArray(world.rings)) {
      for (let i = 0; i < world.rings.length; i++) {
        const ring = world.rings[i];
        if (!ring.passed && checkRingPass(p, ring)) {
          ring.passed = true;
          events.push({ type: 'ring', ring, index: i, points: CONFIG.scoring.ringPoints });
        }
      }
    }
  }

  p.speed = p.onGround ? p.speed : planeSpeed(p);
  return events;
}
