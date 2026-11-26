// Ember Isles — particles, floating score text, and screen shake.
//
// One small system for every transient visual in the game: ring bursts,
// engine smoke, taxi dust, water splashes, crash explosions, the "+250"
// popups that float up from the world, and the shake that sells an impact.
// Particles are plain data (position, velocity, life, size, color, kind) so
// the game can spawn them cheaply and the renderer can draw them without
// knowing what they mean.
//
// The whole system is seeded: given the same seed it draws the same random
// numbers, so a staged screenshot renders the same burst every time. The
// particle count is capped at 400 — oldest particles are dropped first —
// so a long taxi can never grow the array without bound.

import { createRng, range, pick } from './random.js';

const MAX_PARTICLES = 400;
const MAX_SHAKE = 24;
const TEXT_LIFETIME = 1.2;

const RING_COLORS = ['#ffd166', '#fff3b0', '#5ce1e6'];
const FIRE_COLORS = ['#ff9f1c', '#ff6b35', '#ffd166', '#fff3b0'];
const SMOKE_COLOR = '#d8cfc4';
const DUST_COLORS = ['#c9b18a', '#b7a586', '#d8cbb2'];
const SPLASH_COLORS = ['#e8f4ff', '#bfe3ff', '#ffffff'];

// A random unit direction, uniformly spread over a sphere.
function randomDirection(rng) {
  const u = rng() * 2 - 1;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - u * u));
  return {
    x: radius * Math.cos(angle),
    y: u,
    z: radius * Math.sin(angle),
  };
}

export function createEffects(seed = 2026) {
  const rng = createRng(seed);
  const particles = [];
  const texts = [];
  let smokeCarry = 0.6;

  const fx = {
    particles,
    texts,
    shake: 0,
    spawnRingBurst,
    spawnEngineSmoke,
    spawnDust,
    spawnSplash,
    spawnExplosion,
    addShake,
    addText,
    update,
    draw,
    shakeOffset,
  };

  function pushParticle(particle) {
    particles.push(particle);
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  function scatter(x, y, z, count, options) {
    for (let i = 0; i < count; i++) {
      const dir = randomDirection(rng);
      const speed = range(rng, options.speedMin, options.speedMax);
      const life = range(rng, options.lifeMin, options.lifeMax);
      pushParticle({
        pos: {
          x: x + range(rng, -0.4, 0.4),
          y: y + range(rng, -0.4, 0.4),
          z: z + range(rng, -0.4, 0.4),
        },
        vel: {
          x: dir.x * speed + (options.driftX || 0),
          y: dir.y * speed + (options.lift || 0),
          z: dir.z * speed + (options.driftZ || 0),
        },
        life,
        maxLife: life,
        size: range(rng, options.sizeMin, options.sizeMax),
        color: pick(rng, options.colors),
        kind: options.kind,
        gravity: options.gravity,
        grow: options.grow || 0,
      });
    }
  }

  // The burst when the plane threads a ring: 28 sparks in gold, pale
  // yellow and cyan, flying outward and fading in under a second.
  function spawnRingBurst(x, y, z) {
    scatter(x, y, z, 28, {
      speedMin: 8,
      speedMax: 22,
      lifeMin: 0.45,
      lifeMax: 0.95,
      sizeMin: 1.0,
      sizeMax: 2.2,
      colors: RING_COLORS,
      kind: 'spark',
      gravity: 2.5,
    });
  }

  // Engine smoke. Called once per rendered frame while the throttle is up;
  // a carry accumulator turns the fractional throttle into whole puffs, so
  // a low throttle puffs rarely and full throttle puffs every frame or so.
  // The carry starts at 0.6 so the first frame at cruise already smokes.
  function spawnEngineSmoke(x, y, z, throttle) {
    smokeCarry += typeof throttle === 'number' ? throttle : 0;
    while (smokeCarry >= 1) {
      smokeCarry -= 1;
      const life = range(rng, 1.2, 2.0);
      pushParticle({
        pos: { x, y, z },
        vel: { x: range(rng, -0.6, 0.6), y: range(rng, 0.4, 1.1), z: range(rng, -0.6, 0.6) },
        life,
        maxLife: life,
        size: range(rng, 2.0, 3.5),
        color: SMOKE_COLOR,
        kind: 'smoke',
        gravity: -0.5,
        grow: 1.6,
      });
    }
  }

  // Dust kicked up by the wheels while taxiing or landing on grass.
  function spawnDust(x, y, z) {
    scatter(x, y, z, 8, {
      speedMin: 1,
      speedMax: 4,
      lifeMin: 0.4,
      lifeMax: 0.8,
      sizeMin: 1.5,
      sizeMax: 3.0,
      colors: DUST_COLORS,
      kind: 'dust',
      gravity: 1,
      lift: 0.8,
      grow: 1.2,
    });
  }

  // Spray when the plane touches water.
  function spawnSplash(x, y, z) {
    scatter(x, y, z, 12, {
      speedMin: 2,
      speedMax: 6,
      lifeMin: 0.5,
      lifeMax: 0.9,
      sizeMin: 1.5,
      sizeMax: 3.0,
      colors: SPLASH_COLORS,
      kind: 'splash',
      gravity: 12,
      lift: 6,
    });
  }

  // The crash fireball: exactly 44 embers in orange and gold, thrown in
  // every direction and gone within about a second.
  function spawnExplosion(x, y, z) {
    scatter(x, y, z, 44, {
      speedMin: 6,
      speedMax: 26,
      lifeMin: 0.4,
      lifeMax: 1.1,
      sizeMin: 2.0,
      sizeMax: 5.0,
      colors: FIRE_COLORS,
      kind: 'fire',
      gravity: 5,
      lift: 3,
    });
  }

  function addShake(amount) {
    fx.shake = Math.min(MAX_SHAKE, fx.shake + (typeof amount === 'number' ? amount : 0));
  }

  // Floating score text in SCREEN coordinates (the caller projects the
  // world position first). Rises and fades over TEXT_LIFETIME seconds.
  function addText(x, y, text, color) {
    texts.push({
      x: typeof x === 'number' ? x : 0,
      y: typeof y === 'number' ? y : 0,
      text: String(text),
      color: typeof color === 'string' ? color : '#ffffff',
      life: TEXT_LIFETIME,
      maxLife: TEXT_LIFETIME,
    });
  }

  function update(dt) {
    const step = typeof dt === 'number' && dt > 0 ? dt : 0;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= step;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.pos.x += p.vel.x * step;
      p.pos.y += p.vel.y * step;
      p.pos.z += p.vel.z * step;
      p.vel.y -= p.gravity * step;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= step;
      t.y -= 28 * step;
      if (t.life <= 0) texts.splice(i, 1);
    }
    fx.shake *= Math.exp(-2.5 * step);
    if (fx.shake < 0.01) fx.shake = 0;
  }

  // The offset the renderer applies to the whole frame while shaking.
  function shakeOffset() {
    const magnitude = fx.shake;
    if (magnitude <= 0) return { x: 0, y: 0 };
    return {
      x: (rng() - 0.5) * magnitude,
      y: (rng() - 0.5) * magnitude,
    };
  }

  // Draw every live particle and text. project(cam, pos) turns a world
  // position into screen space (or null when behind the camera); the
  // particle radius scales with its perspective scale so distant sparks
  // shrink and near ones grow. Alpha follows remaining life, so everything
  // fades out instead of popping.
  function draw(ctx, project, cam) {
    if (!ctx || typeof project !== 'function') return;
    for (const p of particles) {
      const screen = project(cam, p.pos);
      if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
      const remaining = Math.max(0, Math.min(1, p.life / p.maxLife));
      const scale = typeof screen.scale === 'number' && Number.isFinite(screen.scale)
        ? screen.scale
        : 1;
      let radius = p.size * scale;
      if (p.grow) radius *= 1 + (1 - remaining) * p.grow;
      if (radius < 0.4) continue;
      ctx.globalAlpha = p.kind === 'smoke' ? remaining * 0.45 : remaining * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (p.kind === 'spark') {
        ctx.globalAlpha = remaining;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, Math.max(0.4, radius * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (texts.length > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of texts) {
        const remaining = Math.max(0, Math.min(1, t.life / t.maxLife));
        ctx.globalAlpha = remaining;
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  return fx;
}
