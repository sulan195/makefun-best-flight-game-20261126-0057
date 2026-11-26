// FILE: game/src/effects.js
import { createRng } from './random.js';
import { project as defaultProject } from './projection.js';

const MAX_PARTICLES = 400;
const FONT = 'bold 16px "JetBrains Mono", "Fira Code", Consolas, monospace';

function nextRand(rng) {
  if (typeof rng === 'function') return rng();
  if (rng && typeof rng.next === 'function') return rng.next();
  return 0.5;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createEffects(seed = 2026) {
  const rng = typeof seed === 'number' ? createRng(seed) : seed || createRng(2026);
  let smokeCarry = 0.6;
  let shakePhase = 0;

  function randRange(lo, hi) {
    return lo + (hi - lo) * nextRand(rng);
  }

  function pushParticle(fx, p) {
    fx.particles.push(p);
    if (fx.particles.length > MAX_PARTICLES) {
      fx.particles.splice(0, fx.particles.length - MAX_PARTICLES);
    }
  }

  const fx = {
    particles: [],
    texts: [],
    shake: 0,

    spawnEngineSmoke(x, y, z, rate = 1) {
      if (rate <= 0) return;
      smokeCarry += rate > 3 ? Math.min(3, rate * (1 / 60)) : rate;
      while (smokeCarry >= 1) {
        smokeCarry -= 1;
        const life = randRange(0.55, 0.95);
        pushParticle(fx, {
          pos: { x: x + randRange(-0.4, 0.4), y: y + randRange(-0.3, 0.3), z: z + randRange(-0.4, 0.4) },
          vel: { x: randRange(-1.8, 1.8), y: randRange(0.8, 2.4), z: randRange(-1.8, 1.8) },
          life,
          maxLife: life,
          size: randRange(1.1, 2.2),
          color: '#d8cfc4',
          kind: 'smoke',
          gravity: -1.2,
        });
      }
    },

    spawnExplosion(x, y, z) {
      const palette = ['#fff3b0', '#ff9f1c', '#ff5e5b', '#4a4248'];
      for (let i = 0; i < 44; i++) {
        const life = randRange(0.45, 1.35);
        const spd = randRange(6, 32);
        const a = randRange(0, Math.PI * 2);
        const u = randRange(-0.3, 1.0);
        pushParticle(fx, {
          pos: { x, y: y + 0.5, z },
          vel: { x: Math.cos(a) * spd, y: u * spd + 6, z: Math.sin(a) * spd },
          life,
          maxLife: life,
          size: randRange(1.8, 4.6),
          color: palette[i % palette.length],
          kind: i % 4 === 3 ? 'smoke' : 'fire',
          gravity: i % 4 === 3 ? -2 : 9.8,
        });
      }
      fx.addShake(14);
    },

    spawnSplash(x, y, z) {
      const palette = ['#e0fbfc', '#5ce1e6', '#2ec4b6'];
      for (let i = 0; i < 24; i++) {
        const life = randRange(0.4, 0.9);
        const a = randRange(0, Math.PI * 2);
        const r = randRange(3, 14);
        pushParticle(fx, {
          pos: { x, y: y + 0.2, z },
          vel: { x: Math.cos(a) * r, y: randRange(6, 18), z: Math.sin(a) * r },
          life,
          maxLife: life,
          size: randRange(1.2, 2.8),
          color: palette[i % palette.length],
          kind: 'splash',
          gravity: 16,
        });
      }
    },

    spawnRingBurst(x, y, z) {
      const palette = ['#ffd166', '#fff3b0', '#5ce1e6'];
      for (let i = 0; i < 28; i++) {
        const life = randRange(0.45, 0.95);
        const a = (i / 28) * Math.PI * 2 + randRange(-0.1, 0.1);
        const spd = randRange(8, 22);
        pushParticle(fx, {
          pos: { x, y, z },
          vel: { x: Math.cos(a) * spd, y: randRange(-6, 8), z: Math.sin(a) * spd },
          life,
          maxLife: life,
          size: randRange(1.4, 3.0),
          color: palette[i % palette.length],
          kind: 'spark',
          gravity: 2.5,
        });
      }
    },

    spawnDust(x, y, z) {
      for (let i = 0; i < 8; i++) {
        const life = randRange(0.4, 0.8);
        const a = randRange(0, Math.PI * 2);
        pushParticle(fx, {
          pos: { x: x + randRange(-1.5, 1.5), y: y + 0.2, z: z + randRange(-1.5, 1.5) },
          vel: { x: Math.cos(a) * randRange(2, 6), y: randRange(0.8, 2.8), z: Math.sin(a) * randRange(2, 6) },
          life,
          maxLife: life,
          size: randRange(1.4, 2.8),
          color: '#e6c387',
          kind: 'dust',
          gravity: 1.5,
        });
      }
    },

    addText(x, y, text, color = '#ffd166') {
      fx.texts.push({ x, y, vy: -36, life: 1.3, maxLife: 1.3, text: String(text), color });
      if (fx.texts.length > 32) fx.texts.shift();
    },

    addTextScreen(x, y, text, color = '#ffd166') {
      fx.addText(x, y, text, color);
    },

    addShake(amount) {
      fx.shake = Math.min(28, fx.shake + Math.max(0, Number(amount) || 0));
    },

    shakeOffset() {
      if (fx.shake <= 0.05) return { x: 0, y: 0 };
      return {
        x: Math.sin(shakePhase * 1.7) * fx.shake,
        y: Math.cos(shakePhase * 2.3) * fx.shake * 0.8,
      };
    },

    update(dt) {
      const step = Math.max(0, Number(dt) || 0);
      shakePhase += step * 45;
      fx.shake *= Math.exp(-7.5 * step);
      if (fx.shake < 0.05) fx.shake = 0;

      for (let i = fx.particles.length - 1; i >= 0; i--) {
        const p = fx.particles[i];
        p.life -= step;
        if (p.life <= 0) {
          fx.particles.splice(i, 1);
          continue;
        }
        p.vel.y -= (p.gravity ?? 0) * step;
        p.pos.x += p.vel.x * step;
        p.pos.y += p.vel.y * step;
        p.pos.z += p.vel.z * step;
      }

      for (let i = fx.texts.length - 1; i >= 0; i--) {
        const t = fx.texts[i];
        t.life -= step;
        if (t.life <= 0) {
          fx.texts.splice(i, 1);
          continue;
        }
        t.y += t.vy * step;
      }
    },

    draw(ctx, projectFn, cam) {
      const proj = typeof projectFn === 'function' ? projectFn : defaultProject;
      const camera = typeof projectFn === 'function' ? cam : projectFn;
      const off = fx.shakeOffset();

      ctx.save();
      ctx.translate(off.x, off.y);

      if (camera && proj) {
        for (let i = 0; i < fx.particles.length; i++) {
          const p = fx.particles[i];
          const s = proj(camera, p.pos);
          if (!s || s.behind || !(s.scale > 0)) continue;
          const lifeRatio = clamp(p.life / p.maxLife, 0, 1);
          const puff = p.kind === 'smoke' || p.kind === 'dust';
          const radius = clamp(
            p.size * s.scale * (puff ? 1.7 - 0.7 * lifeRatio : 0.5 + 0.6 * lifeRatio),
            1,
            56
          );
          ctx.globalAlpha = lifeRatio * (puff ? 0.45 : 0.9);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.font = FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < fx.texts.length; i++) {
        const t = fx.texts[i];
        ctx.globalAlpha = clamp(t.life / t.maxLife, 0, 1);
        ctx.fillStyle = 'rgba(8, 10, 18, 0.82)';
        ctx.fillText(t.text, t.x + 1.5, t.y + 1.5);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.restore();
    },
  };

  return fx;
}
