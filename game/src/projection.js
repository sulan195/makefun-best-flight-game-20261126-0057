// FILE: game/src/projection.js
import { CONFIG } from './config.js';

function lerpAngle(a, b, t) {
  const twoPi = Math.PI * 2;
  let diff = ((b - a + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
  return a + diff * t;
}

function cameraBasis(cam) {
  const yaw = cam.yaw || 0;
  const pitch = cam.pitch || 0;
  const roll = cam.roll || 0;

  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);

  const fx = sy * cp;
  const fy = sp;
  const fz = -cy * cp;

  const r0x = cy;
  const r0y = 0;
  const r0z = sy;

  const u0x = -sy * sp;
  const u0y = cp;
  const u0z = cy * sp;

  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  return {
    fx,
    fy,
    fz,
    rx: r0x * cr - u0x * sr,
    ry: r0y * cr - u0y * sr,
    rz: r0z * cr - u0z * sr,
    ux: u0x * cr + r0x * sr,
    uy: u0y * cr + r0y * sr,
    uz: u0z * cr + r0z * sr,
  };
}

export function createCamera() {
  return {
    pos: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: CONFIG.camera.fov,
  };
}

export function project(cam, p) {
  const w = CONFIG.canvas.width;
  const h = CONFIG.canvas.height;
  const fovRad = ((cam.fov || CONFIG.camera.fov) * Math.PI) / 180;
  const focal = (h * 0.5) / Math.tan(fovRad * 0.5);

  const basis = cameraBasis(cam);
  const dx = p.x - cam.pos.x;
  const dy = p.y - cam.pos.y;
  const dz = p.z - cam.pos.z;

  const vx = dx * basis.rx + dy * basis.ry + dz * basis.rz;
  const vy = dx * basis.ux + dy * basis.uy + dz * basis.uz;
  const vz = dx * basis.fx + dy * basis.fy + dz * basis.fz;

  const near = CONFIG.camera.near;
  const behind = vz <= near;
  const safeZ = behind ? Math.max(near, Math.abs(vz)) : vz;
  const scale = focal / safeZ;

  return {
    x: w * 0.5 + vx * scale,
    y: h * 0.5 - vy * scale,
    scale,
    behind,
    depth: vz,
  };
}

export function updateChaseCamera(cam, plane, dt) {
  const cp = Math.cos(plane.pitch || 0);
  const nx = Math.sin(plane.yaw || 0) * cp;
  const ny = Math.sin(plane.pitch || 0);
  const nz = -Math.cos(plane.yaw || 0) * cp;

  const dist = CONFIG.camera.chaseDistance;
  const lift = CONFIG.camera.chaseHeight;

  const targetX = plane.pos.x - nx * dist;
  const targetY = Math.max(1.8, plane.pos.y - ny * dist * 0.45 + lift);
  const targetZ = plane.pos.z - nz * dist;

  const snap = dt === undefined || dt <= 0;
  const posAlpha = snap ? 1 : 1 - Math.exp(-CONFIG.camera.posLerp * dt);
  const rotAlpha = snap ? 1 : 1 - Math.exp(-CONFIG.camera.rotLerp * dt);

  cam.pos.x += (targetX - cam.pos.x) * posAlpha;
  cam.pos.y += (targetY - cam.pos.y) * posAlpha;
  cam.pos.z += (targetZ - cam.pos.z) * posAlpha;

  const lookAhead = 14;
  const lx = plane.pos.x + nx * lookAhead - cam.pos.x;
  const ly = plane.pos.y + ny * lookAhead + 1.1 - cam.pos.y;
  const lz = plane.pos.z + nz * lookAhead - cam.pos.z;

  const targetYaw = Math.atan2(lx, -lz);
  const horiz = Math.hypot(lx, lz);
  const targetPitch = Math.atan2(ly, Math.max(0.001, horiz));
  const targetRoll = (plane.roll || 0) * CONFIG.camera.rollFactor;

  cam.yaw = snap ? targetYaw : lerpAngle(cam.yaw, targetYaw, rotAlpha);
  cam.pitch += (targetPitch - cam.pitch) * rotAlpha;
  cam.roll += (targetRoll - cam.roll) * rotAlpha;
  return cam;
}

export function worldToScreen(cam, xOrPoint, y, z) {
  if (typeof xOrPoint === 'object' && xOrPoint !== null) {
    return project(cam, xOrPoint);
  }
  return project(cam, { x: xOrPoint, y, z });
}

export function isOnScreen(projOrCam, pointOrMargin = 0, maybeMargin = 0) {
  let proj = projOrCam;
  let margin = typeof pointOrMargin === 'number' ? pointOrMargin : 0;

  if (
    projOrCam &&
    typeof projOrCam.pos === 'object' &&
    typeof pointOrMargin === 'object' &&
    pointOrMargin !== null
  ) {
    proj = project(projOrCam, pointOrMargin);
    margin = typeof maybeMargin === 'number' ? maybeMargin : 0;
  }

  if (!proj || proj.behind) {
    return false;
  }
  return (
    proj.x >= -margin &&
    proj.x <= CONFIG.canvas.width + margin &&
    proj.y >= -margin &&
    proj.y <= CONFIG.canvas.height + margin
  );
}
