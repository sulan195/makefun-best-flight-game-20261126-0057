// FILE: game/src/input.js
const PREVENT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

function canonKey(raw) {
  if (!raw) return '';
  const k = String(raw);
  if (k.length === 1) {
    const ch = k.toUpperCase();
    if (ch >= 'A' && ch <= 'Z') return 'Key' + ch;
    if (ch >= '0' && ch <= '9') return 'Digit' + ch;
    if (k === ' ') return 'Space';
  }
  if (k.startsWith('Numpad') && k.length === 7 && k[6] >= '0' && k[6] <= '9') {
    return 'Digit' + k[6];
  }
  if (k === 'NumpadEnter' || k === 'Return') return 'Enter';
  if (k === 'Esc') return 'Escape';
  if (k.startsWith('key') && k.length === 4) return 'Key' + k[3].toUpperCase();
  return k;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createInput() {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 640, y: 360, down: false };
  const axes = { throttleDelta: 0, pitch: 0, roll: 0, yaw: 0, brake: 0 };
  let canvasEl = null;
  let attached = false;

  function setKeyState(e, isDown) {
    const code = canonKey(e.code || e.key);
    const rawCode = e.code || '';
    const rawKey = e.key || '';
    if (isDown) {
      if (code) keys.add(code);
      if (rawCode) keys.add(rawCode);
      if (rawKey.length === 1) {
        keys.add(rawKey.toLowerCase());
        keys.add(rawKey.toUpperCase());
      }
      if (!e.repeat && code) pressed.add(code);
    } else {
      if (code) keys.delete(code);
      if (rawCode) keys.delete(rawCode);
      if (rawKey.length === 1) {
        keys.delete(rawKey.toLowerCase());
        keys.delete(rawKey.toUpperCase());
      }
    }
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = canonKey(e.code || e.key);
    if (PREVENT_CODES.has(code)) e.preventDefault();
    setKeyState(e, true);
  }

  function onKeyUp(e) {
    setKeyState(e, false);
  }

  function updateMouseCoords(e) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const cw = canvasEl.width || 1280;
    const ch = canvasEl.height || 720;
    const rw = rect.width || cw;
    const rh = rect.height || ch;
    mouse.x = clamp((e.clientX - rect.left) * (cw / rw), 0, cw);
    mouse.y = clamp((e.clientY - rect.top) * (ch / rh), 0, ch);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;
    updateMouseCoords(e);
    mouse.down = true;
  }

  function onMouseMove(e) {
    updateMouseCoords(e);
  }

  function onMouseUp(e) {
    if (e.button === 0) mouse.down = false;
  }

  function clearAll() {
    keys.clear();
    pressed.clear();
    mouse.down = false;
    axes.throttleDelta = 0;
    axes.pitch = 0;
    axes.roll = 0;
    axes.yaw = 0;
    axes.brake = 0;
  }

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) clearAll();
  }

  function isDown(code) {
    const c = canonKey(code);
    return keys.has(c) || keys.has(code);
  }

  return {
    keys,
    mouse,
    axes,

    attach(canvas) {
      if (attached) this.detach();
      canvasEl = canvas || null;
      if (canvasEl) {
        mouse.x = (canvasEl.width || 1280) * 0.5;
        mouse.y = (canvasEl.height || 720) * 0.5;
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('blur', clearAll);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }
      if (canvasEl && canvasEl.addEventListener) {
        canvasEl.addEventListener('mousedown', onMouseDown);
        canvasEl.addEventListener('mousemove', onMouseMove);
      }
      attached = true;
    },

    detach() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('blur', clearAll);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      if (canvasEl && canvasEl.removeEventListener) {
        canvasEl.removeEventListener('mousedown', onMouseDown);
        canvasEl.removeEventListener('mousemove', onMouseMove);
      }
      attached = false;
      canvasEl = null;
      clearAll();
    },

    consumePressed(code) {
      const c = canonKey(code);
      if (pressed.has(c)) {
        pressed.delete(c);
        return true;
      }
      return false;
    },

    update(_dt) {
      const thrUp = isDown('KeyW') ? 1 : 0;
      const thrDn = isDown('KeyS') ? 1 : 0;
      const kbPitch = (isDown('ArrowUp') ? 1 : 0) - (isDown('ArrowDown') ? 1 : 0);
      const kbRoll =
        (isDown('ArrowRight') || isDown('KeyD') ? 1 : 0) -
        (isDown('ArrowLeft') || isDown('KeyA') ? 1 : 0);
      const kbYaw = (isDown('KeyE') ? 1 : 0) - (isDown('KeyQ') ? 1 : 0);

      let mPitch = 0;
      let mRoll = 0;
      if (mouse.down) {
        const cw = canvasEl?.width || 1280;
        const ch = canvasEl?.height || 720;
        const nx = (mouse.x - cw * 0.5) / (cw * 0.35);
        const ny = (ch * 0.5 - mouse.y) / (ch * 0.35);
        mRoll = Math.abs(nx) < 0.03 ? 0 : clamp(nx, -1, 1);
        mPitch = Math.abs(ny) < 0.03 ? 0 : clamp(ny, -1, 1);
      }

      axes.throttleDelta = clamp(thrUp - thrDn, -1, 1);
      axes.pitch = clamp(kbPitch + mPitch, -1, 1);
      axes.roll = clamp(kbRoll + mRoll, -1, 1);
      axes.yaw = clamp(kbYaw, -1, 1);
      axes.brake = isDown('Space') ? 1 : 0;
    },
  };
}
