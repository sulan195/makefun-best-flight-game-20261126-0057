// FILE: game/src/hud.js
import { CONFIG } from './config.js';
import { planeSpeed } from './aircraft.js';
import { MISSIONS, missionObjectiveText } from './missions.js';

const FONT = '"JetBrains Mono", "Fira Code", Consolas, monospace';
const AMBER = '#ffb347';
const CYAN = '#5ce1e6';
const CORAL = '#ff5e5b';
const PANEL = 'rgba(12, 16, 28, 0.74)';
const BORDER = 'rgba(255, 179, 71, 0.42)';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function panel(ctx, x, y, w, h, stroke = BORDER) {
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, '0');
  return String(m).padStart(2, '0') + ':' + rem;
}

function normDeg(deg) {
  return ((deg % 360) + 360) % 360;
}

function drawTape(ctx, x, y, w, h, val, step, label, unit, minSafe) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 22, w - 2, h - 42);
  ctx.clip();

  const midY = y + h * 0.5 + 2;
  const pxPerUnit = 1.6;
  const first = Math.floor((val - 60) / step) * step;
  const last = Math.ceil((val + 60) / step) * step;

  if (minSafe > 0) {
    const stallTop = midY + (val - minSafe) * pxPerUnit;
    if (stallTop < y + h) {
      ctx.fillStyle = 'rgba(255, 94, 91, 0.24)';
      ctx.fillRect(x + 2, Math.max(y + 22, stallTop), w - 4, y + h - stallTop);
    }
  }

  ctx.font = '11px ' + FONT;
  ctx.fillStyle = 'rgba(255, 226, 184, 0.78)';
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.45)';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let t = first; t <= last; t += step) {
    if (t < 0) continue;
    const ty = midY + (val - t) * pxPerUnit;
    const major = t % (step * 2) === 0;
    ctx.beginPath();
    ctx.moveTo(x + w - (major ? 14 : 8), ty);
    ctx.lineTo(x + w - 2, ty);
    ctx.stroke();
    if (major) ctx.fillText(String(t), x + w - 18, ty);
  }
  ctx.restore();

  ctx.fillStyle = 'rgba(8, 10, 18, 0.92)';
  ctx.fillRect(x + 4, y + h * 0.5 - 12, w - 8, 26);
  ctx.strokeStyle = CYAN;
  ctx.strokeRect(x + 4, y + h * 0.5 - 12, w - 8, 26);

  ctx.font = 'bold 14px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(Math.round(val) + ' ' + unit, x + w * 0.5, y + h * 0.5 + 1);

  ctx.font = 'bold 11px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText(label, x + w * 0.5, y + 12);
}

function drawCompass(ctx, cx, y, hdgDeg, rwyDeg) {
  const w = 360;
  const h = 34;
  const x = cx - w * 0.5;
  panel(ctx, x, y, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();

  const pxPerDeg = 3.2;
  const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Skip labels that would collide with the previous label or sit half-clipped
  // at the tape's edges. The right 52px are reserved for the digital heading
  // readout ("090°", right-aligned at x+w-6) — a tape label there runs into
  // it ("SE" + "090°" read as one blob).
  let lastLabelTx = -Infinity;
  for (let offset = -60; offset <= 60; offset += 5) {
    const base = Math.round((hdgDeg + offset) / 5) * 5;
    const diff = ((base - hdgDeg + 540) % 360) - 180;
    const tx = cx + diff * pxPerDeg;
    const deg = normDeg(base);
    const lbl = labels[deg];
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.5)';
    ctx.beginPath();
    ctx.moveTo(tx, y + h - (lbl ? 10 : 6));
    ctx.lineTo(tx, y + h - 1);
    ctx.stroke();
    if (tx < x + 18 || tx > x + w - 52 || tx - lastLabelTx < 30) continue;
    if (lbl) {
      ctx.font = 'bold 12px ' + FONT;
      ctx.fillStyle = deg === 0 ? CORAL : AMBER;
      ctx.fillText(lbl, tx, y + 13);
      lastLabelTx = tx;
    } else if (deg % 30 === 0) {
      ctx.font = '10px ' + FONT;
      ctx.fillStyle = 'rgba(255, 232, 200, 0.72)';
      ctx.fillText(String(deg).padStart(3, '0'), tx, y + 13);
      lastLabelTx = tx;
    }
  }

  const rwyDiff = ((rwyDeg - hdgDeg + 540) % 360) - 180;
  const rx = clamp(cx + rwyDiff * pxPerDeg, x + 10, x + w - 10);
  ctx.fillStyle = CYAN;
  ctx.beginPath();
  ctx.moveTo(rx, y + 3);
  ctx.lineTo(rx - 5, y + 10);
  ctx.lineTo(rx + 5, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(cx, y + h - 9);
  ctx.lineTo(cx - 5, y + h - 1);
  ctx.lineTo(cx + 5, y + h - 1);
  ctx.closePath();
  ctx.fill();

  ctx.font = 'bold 11px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.round(hdgDeg)).padStart(3, '0') + '°', x + w - 6, y + 11);
}

function drawHorizon(ctx, x, y, size, pitch, roll) {
  panel(ctx, x, y, size, size);
  const cx = x + size * 0.5;
  const cy = y + size * 0.5 + 4;
  const r = size * 0.41;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const py = clamp(pitch * 72, -r, r);
  ctx.fillStyle = '#215478';
  ctx.fillRect(-size, -size + py, size * 2, size);
  ctx.fillStyle = '#733e24';
  ctx.fillRect(-size, py, size * 2, size);
  ctx.strokeStyle = '#fff3d6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size, py);
  ctx.lineTo(size, py);
  ctx.stroke();

  ctx.lineWidth = 1;
  for (let p = -2; p <= 2; p++) {
    if (p === 0) continue;
    const ly = py - p * 14;
    ctx.beginPath();
    ctx.moveTo(-14, ly);
    ctx.lineTo(14, ly);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = AMBER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.fillRect(cx - 2, cy - 2, 4, 4);

  ctx.font = 'bold 10px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, y + 11);
}

export function drawHUD(ctx, game) {
  const W = ctx.canvas?.width || CONFIG.canvas?.width || CONFIG.width || 1280;
  const H = ctx.canvas?.height || CONFIG.canvas?.height || CONFIG.height || 720;
  const plane = game?.plane;
  if (!plane) return;

  const world = game?.world;
  const mission = game?.mission;
  const t = Number(game?.time) || 0;
  const minFly = CONFIG.physics?.minFlySpeed ?? CONFIG.minFlySpeed ?? 22;
  const fuelCap = CONFIG.fuel?.capacity ?? CONFIG.fuelCapacity ?? 100;
  const spdMps = plane.speed ?? planeSpeed(plane);
  const spdKt = spdMps * 1.94384;
  const altFt = Math.max(0, plane.pos.y * 3.28084);
  const hdgDeg = normDeg((plane.yaw * 180) / Math.PI);
  const rwyDeg = normDeg(world?.runway?.headingDeg ?? 90);

  ctx.save();
  drawTape(ctx, 20, 20, 106, 168, altFt, 50, 'ALT FT', 'FT', 0);
  drawTape(ctx, W - 126, 20, 106, 168, spdKt, 10, 'SPEED', 'KT', minFly * 1.94384);

  panel(ctx, W - 126, 194, 106, 24);
  const thrPct = Math.round(clamp(plane.throttle ?? 0, 0, 1) * 100);
  ctx.fillStyle = 'rgba(92, 225, 230, 0.35)';
  ctx.fillRect(W - 124, 196, ((102 * thrPct) / 100), 20);
  ctx.font = 'bold 11px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('THR ' + thrPct + '%', W - 73, 206);

  drawCompass(ctx, W * 0.5, 16, hdgDeg, rwyDeg);

  panel(ctx, W * 0.5 - 180, 56, 360, 26);
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.textAlign = 'left';
  ctx.fillText('SCORE ' + String(Math.round(game?.score ?? mission?.score ?? 0)).padStart(6, '0'), W * 0.5 - 170, 69);
  if ((game?.combo ?? 1) > 1) {
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'center';
    ctx.fillText('x' + game.combo + ' COMBO', W * 0.5 + 12, 69);
  }
  ctx.fillStyle = '#ffe6c2';
  ctx.textAlign = 'right';
  ctx.fillText(fmtTime(mission?.elapsed ?? t), W * 0.5 + 170, 69);

  const obj = missionObjectiveText(mission);
  // Size the banner to the text: a fixed 460px panel overflowed on the long
  // landing objective ("...touch down smoothly" ran past both edges).
  ctx.font = '12px ' + FONT;
  const objW = Math.min(760, Math.max(200, ctx.measureText(obj).width + 28));
  panel(ctx, W * 0.5 - objW / 2, 88, objW, 26, 'rgba(92, 225, 230, 0.45)');
  ctx.fillStyle = CYAN;
  ctx.textAlign = 'center';
  ctx.fillText(obj, W * 0.5, 101);

  // The cockpit dashboard already has its own attitude ball — the corner
  // widget is redundant (and duplicative) in cockpit view.
  if (game?.view !== 'cockpit') drawHorizon(ctx, 20, H - 144, 124, plane.pitch || 0, plane.roll || 0);

  panel(ctx, 152, H - 114, 122, 94);
  const rawWindDir = world?.wind?.dir ?? 0;
  const windRad = Math.abs(rawWindDir) > Math.PI * 2 ? (rawWindDir * Math.PI) / 180 : rawWindDir;
  const relWind = windRad - (plane.yaw || 0);
  const windKt = Math.round((world?.wind?.speed ?? 0) * 1.94384);
  ctx.font = 'bold 11px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText('WIND ' + windKt + ' KT', 213, H - 101);
  ctx.save();
  ctx.translate(213, H - 72);
  ctx.rotate(relWind);
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(0, -12);
  ctx.lineTo(-5, -5);
  ctx.moveTo(0, -12);
  ctx.lineTo(5, -5);
  ctx.stroke();
  ctx.restore();
  ctx.font = '10px ' + FONT;
  ctx.fillStyle = plane.gearDown ? CYAN : 'rgba(255,255,255,0.45)';
  ctx.fillText(plane.gearDown ? 'GEAR DN' : 'GEAR UP', 184, H - 32);
  ctx.fillStyle = plane.flaps ? AMBER : 'rgba(255,255,255,0.45)';
  ctx.fillText(plane.flaps ? 'FLAPS' : 'CLEAN', 244, H - 32);

  panel(ctx, W - 246, H - 116, 226, 96);
  const fuelPct = clamp(Math.round(((plane.fuel ?? 0) / fuelCap) * 100), 0, 100);
  const rawDmg = plane.damage ?? 0;
  const dmgPct = clamp(Math.round(rawDmg > 0 && rawDmg <= 1 ? rawDmg * 100 : rawDmg), 0, 100);

  ctx.font = 'bold 11px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillStyle = AMBER;
  ctx.fillText('FUEL ' + fuelPct + '%', W - 236, H - 99);
  if (fuelPct < 20 && Math.sin(t * 9) > -0.1) {
    ctx.fillStyle = CORAL;
    ctx.textAlign = 'right';
    ctx.fillText('LOW FUEL!', W - 30, H - 99);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(W - 236, H - 88, 206, 14);
  ctx.fillStyle = fuelPct < 20 ? CORAL : fuelPct < 45 ? AMBER : CYAN;
  ctx.fillRect(W - 236, H - 88, (206 * fuelPct) / 100, 14);

  ctx.textAlign = 'left';
  ctx.fillStyle = AMBER;
  ctx.fillText('DAMAGE ' + dmgPct + '%', W - 236, H - 56);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(W - 236, H - 45, 206, 12);
  ctx.fillStyle = dmgPct > 65 ? CORAL : AMBER;
  ctx.fillRect(W - 236, H - 45, (206 * dmgPct) / 100, 12);

  const stalling = !plane.onGround && spdMps < minFly;
  if (stalling && Math.sin(t * 12) > -0.2) {
    panel(ctx, W * 0.5 - 150, H * 0.22, 300, 38, CORAL);
    ctx.font = 'bold 18px ' + FONT;
    ctx.fillStyle = CORAL;
    ctx.textAlign = 'center';
    ctx.fillText('STALL! LOWER NOSE', W * 0.5, H * 0.22 + 19);
  }

  const msgs = Array.isArray(game?.messages) ? game.messages : [];
  ctx.textAlign = 'center';
  for (let i = 0; i < Math.min(4, msgs.length); i++) {
    const m = msgs[i];
    const txt = typeof m === 'string' ? m : m?.text ?? m?.msg ?? '';
    if (!txt) continue;
    const alpha =
      m?.alpha != null
        ? clamp(m.alpha, 0, 1)
        : m?.life != null
          ? clamp(m.life / (m.maxLife || 2), 0, 1)
          : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.8)';
    ctx.fillText(txt, W * 0.5 + 2, H * 0.34 + i * 34 + 2);
    ctx.fillStyle = m?.color || (txt.includes('STALL') || txt.includes('WRONG') ? CORAL : AMBER);
    ctx.fillText(txt, W * 0.5, H * 0.34 + i * 34);
    ctx.restore();
  }
  ctx.restore();
}

export function drawTitle(ctx, game) {
  const W = ctx.canvas?.width || CONFIG.canvas?.width || CONFIG.width || 1280;
  const H = ctx.canvas?.height || CONFIG.canvas?.height || CONFIG.height || 720;
  const t = Number(game?.time) || 0;
  const activeId = game?.mission?.id || game?.selectedMission || 'rings';
  const best = Math.round(game?.bestScore ?? game?.mission?.best ?? 0);

  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(14, 12, 28, 0.72)');
  grad.addColorStop(1, 'rgba(32, 16, 24, 0.86)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  panel(ctx, W * 0.5 - 380, 58, 760, H - 116);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.font = 'bold 54px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText('EMBER ISLES', W * 0.5, 122);
  ctx.font = '15px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.fillText('SUNSET ARCHIPELAGO FLIGHT TRIALS', W * 0.5, 164);

  for (let i = 0; i < MISSIONS.length; i++) {
    const m = MISSIONS[i];
    const bx = W * 0.5 - 340 + i * 230;
    const by = 198;
    const sel = m.id === activeId;
    panel(ctx, bx, by, 218, 92, sel ? CYAN : BORDER);
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillStyle = sel ? CYAN : AMBER;
    ctx.fillText('[' + (i + 1) + '] ' + m.name, bx + 109, by + 24);
    ctx.font = '11px ' + FONT;
    ctx.fillStyle = '#f2dfc4';
    ctx.fillText(m.desc.slice(0, 30), bx + 109, by + 50);
    ctx.fillText(m.desc.slice(30, 62), bx + 109, by + 68);
  }

  const controls = [
    ['W / S', 'Throttle Up / Down'],
    ['Up / Down', 'Pitch Nose'],
    ['Left / Right, A / D', 'Roll / Bank'],
    ['Q / E', 'Rudder Yaw'],
    ['Mouse Drag', 'Steer Toward Cursor'],
    ['Space / X', 'Wheel Brake / Supply Drop'],
    ['G / F', 'Landing Gear / Flaps'],
    ['P / R / M', 'Pause / Restart / Mute'],
  ];
  ctx.font = 'bold 13px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText('FLIGHT CONTROLS (SELECT MISSION WITH 1 / 2 / 3)', W * 0.5, 322);

  ctx.font = '12px ' + FONT;
  for (let i = 0; i < controls.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = W * 0.5 + (col === 0 ? -185 : 175);
    const cy = 356 + row * 28;
    ctx.fillStyle = CYAN;
    ctx.textAlign = 'right';
    ctx.fillText(controls[i][0] + ' :', cx - 6, cy);
    ctx.fillStyle = '#ffe9cc';
    ctx.textAlign = 'left';
    ctx.fillText(controls[i][1], cx + 4, cy);
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 15px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText('BEST SCORE: ' + best, W * 0.5, H - 138);

  if (Math.sin(t * 4.5) > -0.55) {
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillStyle = CYAN;
    ctx.fillText('Press ENTER to fly', W * 0.5, H - 94);
  }
  ctx.restore();
}

export function drawResult(ctx, game) {
  const W = ctx.canvas?.width || CONFIG.canvas?.width || CONFIG.width || 1280;
  const H = ctx.canvas?.height || CONFIG.canvas?.height || CONFIG.height || 720;
  const ms = game?.mission || {};
  const won = Boolean(ms.done) && !ms.failed;
  const total = Math.round(game?.score ?? ms.score ?? 0);
  const bonus = Math.round(ms.bonusScore ?? 0);
  const base = Math.max(0, total - bonus);
  const best = Math.max(total, Math.round(ms.best ?? game?.bestScore ?? 0));

  ctx.save();
  ctx.fillStyle = 'rgba(10, 12, 22, 0.78)';
  ctx.fillRect(0, 0, W, H);
  panel(ctx, W * 0.5 - 270, H * 0.5 - 185, 540, 370, won ? CYAN : CORAL);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px ' + FONT;
  ctx.fillStyle = won ? CYAN : CORAL;
  ctx.fillText(won ? 'MISSION COMPLETE' : 'MISSION FAILED', W * 0.5, H * 0.5 - 132);

  ctx.font = '15px ' + FONT;
  ctx.fillStyle = AMBER;
  ctx.fillText((ms.name || 'Flight Sortie') + (ms.reason ? ' — ' + ms.reason : ''), W * 0.5, H * 0.5 - 92);

  const rows = [
    ['Flight Time', fmtTime(ms.elapsed || 0)],
    ['Objective Points', String(base)],
    ['Performance Bonus', '+' + bonus],
    ['Total Score', String(total)],
    ['Best Score', String(best)],
  ];
  ctx.font = '14px ' + FONT;
  for (let i = 0; i < rows.length; i++) {
    const ry = H * 0.5 - 42 + i * 32;
    ctx.fillStyle = '#ffdcb0';
    ctx.textAlign = 'left';
    ctx.fillText(rows[i][0], W * 0.5 - 190, ry);
    ctx.fillStyle = i === 3 ? CYAN : AMBER;
    ctx.textAlign = 'right';
    ctx.fillText(rows[i][1], W * 0.5 + 190, ry);
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 16px ' + FONT;
  ctx.fillStyle = CYAN;
  ctx.fillText('Press R or ENTER to restart  •  1/2/3 switch mission', W * 0.5, H * 0.5 + 144);
  ctx.restore();
}
