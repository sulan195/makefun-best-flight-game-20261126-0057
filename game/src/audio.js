// FILE: game/src/audio.js
import { createRng } from './random.js';

function nextRand(rng) {
  if (typeof rng === 'function') return rng();
  if (rng && typeof rng.next === 'function') return rng.next();
  return 0.5;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createAudio() {
  let master = null;
  let noiseBuffer = null;
  let engSaw = null;
  let engSub = null;
  let engFilter = null;
  let engGain = null;
  let windSrc = null;
  let windFilter = null;
  let windGain = null;
  let padNodes = null;
  let musicBooted = false;
  let nextAlarmAt = 0;

  const api = {
    ctx: null,
    muted: false,

    ensure() {
      if (api.ctx) {
        if (api.ctx.state === 'suspended') api.ctx.resume().catch(() => {});
        return api.ctx;
      }
      const AC =
        typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
      if (!AC) return null;

      const ctx = new AC();
      api.ctx = ctx;
      master = ctx.createGain();
      master.gain.value = api.muted ? 0 : 0.8;
      master.connect(ctx.destination);

      const sampleCount = ctx.sampleRate * 2;
      noiseBuffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      const rng = createRng(9001);
      for (let i = 0; i < sampleCount; i++) {
        data[i] = nextRand(rng) * 2 - 1;
      }

      engFilter = ctx.createBiquadFilter();
      engFilter.type = 'lowpass';
      engFilter.frequency.value = 260;
      engGain = ctx.createGain();
      engGain.gain.value = 0;

      engSaw = ctx.createOscillator();
      engSaw.type = 'sawtooth';
      engSaw.frequency.value = 55;
      engSub = ctx.createOscillator();
      engSub.type = 'square';
      engSub.frequency.value = 27.5;

      const subGain = ctx.createGain();
      subGain.gain.value = 0.55;
      engSaw.connect(engFilter);
      engSub.connect(subGain);
      subGain.connect(engFilter);
      engFilter.connect(engGain);
      engGain.connect(master);
      engSaw.start();
      engSub.start();

      windSrc = ctx.createBufferSource();
      windSrc.buffer = noiseBuffer;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 400;
      windFilter.Q.value = 0.85;
      windGain = ctx.createGain();
      windGain.gain.value = 0;

      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();

      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!musicBooted) {
        musicBooted = true;
        api.startMusic();
      }
      return ctx;
    },

    setMuted(m) {
      api.muted = Boolean(m);
      if (!api.ctx || !master) return;
      const now = api.ctx.currentTime;
      master.gain.setTargetAtTime(api.muted ? 0 : 0.8, now, 0.02);
    },

    engine(throttle = 0, speed = 0) {
      if (!api.ctx || api.muted || !engSaw || !engGain) return;
      const now = api.ctx.currentTime;
      const thr = clamp(throttle, 0, 1);
      const spd = clamp(speed, 0, 120);
      const baseFreq = 48 + thr * 66 + spd * 0.42;
      engSaw.frequency.setTargetAtTime(baseFreq, now, 0.05);
      engSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);
      engFilter.frequency.setTargetAtTime(210 + thr * 480, now, 0.06);
      engGain.gain.setTargetAtTime(0.016 + thr * 0.085, now, 0.06);
    },

    wind(speed = 0) {
      if (!api.ctx || api.muted || !windGain || !windFilter) return;
      const now = api.ctx.currentTime;
      const norm = clamp(speed / 95, 0, 1.2);
      windFilter.frequency.setTargetAtTime(260 + norm * 820, now, 0.07);
      windGain.gain.setTargetAtTime(Math.pow(norm, 1.35) * 0.08, now, 0.07);
    },

    beep(freq = 660, dur = 0.12, type = 'sine', delay = 0, peak = 0.11) {
      if (!api.ctx || api.muted || !master) return;
      const t0 = api.ctx.currentTime + Math.max(0, delay);
      const d = Math.max(0.02, dur);
      const osc = api.ctx.createOscillator();
      const g = api.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + d + 0.01);
    },

    ring() {
      if (!api.ctx || api.muted) return;
      api.beep(587.33, 0.11, 'triangle', 0, 0.13);
      api.beep(880.0, 0.13, 'triangle', 0.07, 0.13);
      api.beep(1174.66, 0.2, 'sine', 0.14, 0.15);
    },

    touchdown(score = 80) {
      if (!api.ctx || api.muted || !noiseBuffer || !master) return;
      const now = api.ctx.currentTime;
      const src = api.ctx.createBufferSource();
      const flt = api.ctx.createBiquadFilter();
      const g = api.ctx.createGain();
      src.buffer = noiseBuffer;
      flt.type = 'bandpass';
      flt.frequency.value = 950;
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      src.connect(flt);
      flt.connect(g);
      g.connect(master);
      src.start(now);
      src.stop(now + 0.12);

      if (score >= 70) {
        api.beep(523.25, 0.16, 'triangle', 0.06, 0.11);
        api.beep(659.25, 0.18, 'triangle', 0.14, 0.11);
        api.beep(783.99, 0.28, 'sine', 0.22, 0.13);
      } else {
        api.beep(440, 0.15, 'triangle', 0.06, 0.1);
      }
    },

    crash() {
      if (!api.ctx || api.muted || !noiseBuffer || !master) return;
      const now = api.ctx.currentTime;
      const src = api.ctx.createBufferSource();
      const flt = api.ctx.createBiquadFilter();
      const g = api.ctx.createGain();
      src.buffer = noiseBuffer;
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(480, now);
      flt.frequency.exponentialRampToValueAtTime(45, now + 0.65);
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.68);
      src.connect(flt);
      flt.connect(g);
      g.connect(master);
      src.start(now);
      src.stop(now + 0.7);

      const sub = api.ctx.createOscillator();
      const sg = api.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(115, now);
      sub.frequency.exponentialRampToValueAtTime(28, now + 0.5);
      sg.gain.setValueAtTime(0.22, now);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
      sub.connect(sg);
      sg.connect(master);
      sub.start(now);
      sub.stop(now + 0.55);
    },

    alarm(kind = 'stall') {
      if (!api.ctx || api.muted) return;
      const now = api.ctx.currentTime;
      if (now < nextAlarmAt) return;
      const stall = kind === 'stall';
      nextAlarmAt = now + (stall ? 0.42 : 0.75);
      api.beep(stall ? 880 : 740, 0.11, stall ? 'square' : 'triangle', 0, 0.07);
      api.beep(stall ? 620 : 520, 0.13, stall ? 'square' : 'triangle', 0.13, 0.07);
    },

    startMusic() {
      if (!api.ctx || !master || padNodes) return;
      const now = api.ctx.currentTime;
      const flt = api.ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = 520;
      const padGain = api.ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, now);
      padGain.gain.linearRampToValueAtTime(0.055, now + 1.4);

      const lfo = api.ctx.createOscillator();
      const lfoGain = api.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(flt.frequency);

      const freqs = [
        [146.83, -5],
        [220.0, 4],
        [329.63, -3],
      ];
      const oscs = freqs.map(([f, detune]) => {
        const o = api.ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        o.detune.value = detune;
        o.connect(flt);
        o.start(now);
        return o;
      });
      flt.connect(padGain);
      padGain.connect(master);
      lfo.start(now);
      padNodes = { oscs, lfo, padGain };
    },

    stopMusic() {
      if (!api.ctx || !padNodes) return;
      const now = api.ctx.currentTime;
      const { oscs, lfo, padGain } = padNodes;
      padNodes = null;
      padGain.gain.setTargetAtTime(0.0001, now, 0.08);
      for (let i = 0; i < oscs.length; i++) {
        oscs[i].stop(now + 0.35);
      }
      lfo.stop(now + 0.35);
    },
  };

  return api;
}
