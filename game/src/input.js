// Ember Isles — keyboard input.
//
// This module owns the keyboard and nothing else. Held keys become flight
// axes (throttle, roll, pitch, yaw, brake) that the physics step reads every
// frame; single presses (Enter, M, V, G, F, X, P, R, digits) are queued in
// arrival order until the game consumes them, so a tap is never lost between
// frames and never fires twice.
//
// Gear and flaps are deliberately NOT driven here. The game toggles them
// itself on the consumed key press (it owns the sound cue and the
// airborne-only rule), so this module exposes gear/flaps as inert values the
// physics step can read safely without double-toggling.

const AXIS_KEYS = {
  throttleUp: ['KeyW'],
  throttleDown: ['KeyS'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
};

// Arrow keys and Space scroll the page by default; the game swallows them.
const PAGE_SCROLL_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

function axisFromKeys(keys, ups, downs) {
  let value = 0;
  for (const code of ups) if (keys.has(code)) value += 1;
  for (const code of downs) if (keys.has(code)) value -= 1;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

export function createInput() {
  // Codes currently held down (KeyboardEvent.code, e.g. 'KeyW').
  const keys = new Set();
  // Single presses not yet consumed, oldest first. Each entry keeps both
  // the physical code and the logical key so callers can ask for either.
  const pressed = [];
  // Axes the physics step reads. Mirrored onto the input object itself so
  // callers can use either input.axes.roll or input.roll.
  const axes = { throttleDelta: 0, roll: 0, pitch: 0, yaw: 0 };
  let attached = false;

  function refreshAxes() {
    axes.throttleDelta = axisFromKeys(keys, AXIS_KEYS.throttleUp, AXIS_KEYS.throttleDown);
    axes.roll = axisFromKeys(keys, AXIS_KEYS.rollRight, AXIS_KEYS.rollLeft);
    axes.pitch = axisFromKeys(keys, AXIS_KEYS.pitchUp, AXIS_KEYS.pitchDown);
    axes.yaw = axisFromKeys(keys, AXIS_KEYS.yawRight, AXIS_KEYS.yawLeft);
    input.throttleDelta = axes.throttleDelta;
    input.roll = axes.roll;
    input.pitch = axes.pitch;
    input.yaw = axes.yaw;
    input.brake = keys.has('Space');
  }

  function onKeyDown(event) {
    if (!event || typeof event.code !== 'string') return;
    if (PAGE_SCROLL_CODES.has(event.code) && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    keys.add(event.code);
    // Key repeat fires while a key is held; only the first press counts.
    if (!event.repeat) {
      pressed.push({
        code: event.code,
        key: typeof event.key === 'string' ? event.key : '',
      });
    }
  }

  function onKeyUp(event) {
    if (event && typeof event.code === 'string') keys.delete(event.code);
  }

  function onBlur() {
    keys.clear();
    pressed.length = 0;
    refreshAxes();
  }

  function attach() {
    if (attached) return;
    if (typeof window === 'undefined' || !window.addEventListener) return;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    attached = true;
  }

  function detach() {
    if (typeof window !== 'undefined' && window.removeEventListener && attached) {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    }
    attached = false;
    keys.clear();
    pressed.length = 0;
    refreshAxes();
  }

  // Recompute the axes from the held keys. Called once per frame before
  // the physics step; axes are instantaneous (no smoothing) so the plane
  // answers the stick immediately.
  function update() {
    refreshAxes();
  }

  // True once if the named key was pressed since the last call for it.
  // Accepts a KeyboardEvent.code ('KeyM', 'Enter', 'Digit1') or a logical
  // key ('m', 'enter', '1'); single letters match case-insensitively.
  // Consuming removes the press, so it can never fire twice.
  function consumePressed(want) {
    if (typeof want !== 'string' || want.length === 0) return false;
    const probe = want.length === 1 ? want.toLowerCase() : want;
    for (let i = 0; i < pressed.length; i++) {
      const entry = pressed[i];
      const entryKey = typeof entry.key === 'string' && entry.key.length === 1
        ? entry.key.toLowerCase()
        : entry.key;
      if (entry.code === want || entry.key === want || entryKey === probe) {
        pressed.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  const input = {
    keys,
    axes,
    throttleDelta: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    brake: false,
    // Inert by design (see the header): the game owns gear/flaps toggling.
    gear: false,
    flaps: 0,
    attach,
    detach,
    update,
    consumePressed,
  };
  return input;
}
