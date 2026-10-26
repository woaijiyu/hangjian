export const app = {
  api: null,
  info: { version: '1.0.0', platform: 'win32' },
  settings: {
    language: 'zh',
    theme: 'mariana',
    fontSize: 13,
    wrap: false,
    minimap: true,
    sidebar: true,
    sidebarWidth: 252,
    folder: null,
    session: { files: [], active: null },
    recent: []
  },
  tabs: [],
  activeId: null,
  cm: null,
  folder: null,
  closedTabs: [],
  untitledSeq: 0,
  hooks: {},
  shot: false,
  noPersist: false,
  modalOpen: false,
  paletteOpen: false,
  findOpen: false,
  sessionTimer: null
};

export function activeTab() {
  return app.tabs.find((tab) => tab.id === app.activeId) || null;
}

export function tabById(id) {
  return app.tabs.find((tab) => tab.id === id) || null;
}

export function tabByPath(filePath) {
  if (!filePath) return null;
  const norm = normalizePath(filePath);
  return app.tabs.find((tab) => tab.path && normalizePath(tab.path) === norm) || null;
}

export function normalizePath(filePath) {
  return String(filePath).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function persistSettings(patch) {
  Object.assign(app.settings, patch);
  if (app.noPersist || !app.api) return;
  app.api.settings.update(patch).catch((err) => {
    console.warn('[settings] update failed', err);
  });
}

export function isLightTheme(theme = app.settings.theme) {
  return theme === 'light';
}

export function scheduleSessionSave() {
  if (app.noPersist) return;
  clearTimeout(app.sessionTimer);
  app.sessionTimer = setTimeout(() => {
    app.hooks.saveSession?.();
  }, 500);
}
