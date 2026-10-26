import { app, persistSettings } from './state.js';
import { clamp } from './utils.js';

export const THEMES = [
  { id: 'mariana', label: 'Mariana' },
  { id: 'monokai', label: 'Monokai' },
  { id: 'onedark', label: 'One Dark' },
  { id: 'light', label: 'Adaptive Light' }
];

export function applyTheme(theme, { persist = true } = {}) {
  const found = THEMES.find((item) => item.id === theme);
  const id = found ? found.id : 'mariana';
  document.body.dataset.theme = id;
  if (persist) persistSettings({ theme: id });
  else app.settings.theme = id;

  app.cm?.refresh();
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  app.hooks.redrawMinimap?.();
}

export function setFontSize(size, { persist = true } = {}) {
  const next = clamp(Math.round(Number(size) || 13), 9, 28);
  document.documentElement.style.setProperty('--editor-font-size', `${next}px`);
  if (persist) persistSettings({ fontSize: next });
  else app.settings.fontSize = next;
  app.cm?.refresh();
  app.hooks.resizeMinimap?.();
  app.hooks.updateStatus?.();
}

export function currentThemeLabel() {
  const found = THEMES.find((item) => item.id === app.settings.theme);
  return found ? found.label : 'Mariana';
}
