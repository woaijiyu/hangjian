const registry = new Map();

export function registerCommand(definition) {
  if (!definition || !definition.id) throw new Error('Command needs an id');
  if (registry.has(definition.id)) {
    console.warn('[commands] duplicate command', definition.id);
  }
  registry.set(definition.id, {
    palette: true,
    scope: 'global',
    ...definition
  });
}

export function getCommand(id) {
  return registry.get(id) || null;
}

export function allCommands() {
  return Array.from(registry.values());
}

export function runCommand(id, ...args) {
  const command = registry.get(id);
  if (!command) {
    console.warn('[commands] unknown', id);
    return undefined;
  }
  if (command.enabled && !command.enabled()) return undefined;
  try {
    const result = command.run ? command.run(...args) : undefined;
    if (result && typeof result.catch === 'function') {
      result.catch((err) => console.error(`[command:${id}]`, err));
    }
    return result;
  } catch (err) {
    console.error(`[command:${id}]`, err);
    return undefined;
  }
}

export function formatAccel(accel) {
  if (!accel) return '';
  return accel;
}

function keyMatches(key, event) {
  const k = key.toLowerCase();
  if (/^[a-z]$/.test(k)) {
    return event.key.toLowerCase() === k || event.code === `Key${k.toUpperCase()}`;
  }
  if (/^\d$/.test(k)) {
    return event.key === key || event.code === `Digit${key}`;
  }
  if (k === '=') return event.key === '=' || event.key === '+';
  if (k === '-') return event.key === '-' || event.key === '_';
  if (k === '/') return event.key === '/' || event.key === '?';
  if (k === 'escape' || k === 'esc') return event.key === 'Escape';
  if (k === 'enter') return event.key === 'Enter';
  if (k === 'tab') return event.key === 'Tab';
  if (k === 'space') return event.key === ' ';
  if (k === 'up') return event.key === 'ArrowUp';
  if (k === 'down') return event.key === 'ArrowDown';
  if (k === 'left') return event.key === 'ArrowLeft';
  if (k === 'right') return event.key === 'ArrowRight';
  if (k === 'backspace') return event.key === 'Backspace';
  if (k === 'delete') return event.key === 'Delete';
  if (k === 'home') return event.key === 'Home';
  if (k === 'end') return event.key === 'End';
  if (k === 'pageup') return event.key === 'PageUp';
  if (k === 'pagedown') return event.key === 'PageDown';
  if (k === 'backquote') return event.key === '`';
  return event.key.toLowerCase() === k;
}

export function accelMatches(accel, event) {
  if (!accel) return false;
  const parts = accel.split('+').map((part) => part.trim());
  const key = parts.pop();
  const mods = new Set(parts.map((part) => part.toLowerCase()));
  if (mods.has('ctrl') !== event.ctrlKey) return false;
  if (mods.has('alt') !== event.altKey) return false;
  if (mods.has('shift') !== event.shiftKey) return false;
  if (mods.has('meta') !== event.metaKey) return false;
  return keyMatches(key, event);
}

export function commandForEvent(event) {
  for (const command of registry.values()) {
    if (!command.accel) continue;
    const accels = Array.isArray(command.accel) ? command.accel : [command.accel];
    if (accels.some((accel) => accelMatches(accel, event))) return command;
  }
  return null;
}
