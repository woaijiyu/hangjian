import { app, scheduleSessionSave } from './state.js';
import { icons } from './icons.js';
import { allCommands, accelMatches, runCommand } from './commands.js';
import { applyTheme, setFontSize } from './theme.js';
import { initEditor, updateStatus, setWrap, syncWindowTitle } from './editor.js';
import { initTabs, renderTabs, updateTabDirty } from './tabs.js';
import {
  registerFileCommands,
  restoreSession,
  openPaths,
  openPath,
  activateTab,
  saveSession,
  confirmWindowClose,
  newUntitled
} from './files.js';
import { initMenus, openStatusMenu, openAppMenu, refreshMenus } from './menus.js';
import { initSidebar, renderOpenFiles, renderTree } from './sidebar.js';
import { initFind, refreshFindLanguage } from './find.js';
import {
  initMinimap,
  redrawMinimap,
  resizeMinimap,
  syncMinimapScroll
} from './minimap.js';
import { initFindInFiles, openFindInFiles } from './findinfiles.js';
import { initPalette, openPalette, refreshPalette } from './palette.js';
import { toast } from './ui.js';
import { initI18n, t } from './i18n.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot') === '1';
const demoMode = params.get('demo') === '1';

let closePending = false;
let maximizeIconEl = null;
let maximizedState = false;

boot().catch((err) => {
  console.error('[boot]', err);
  toast(t('Failed to start: {message}', { message: err.message }), 'error', 8000);
});

async function boot() {
  app.api = window.interline;
  app.shot = shotMode || demoMode;
  app.noPersist = shotMode || demoMode;

  const [info, loaded] = await Promise.all([app.api.app.info(), app.api.settings.get()]);
  app.info = { ...app.info, ...(info || {}) };
  Object.assign(app.settings, loaded || {});
  if (!app.settings.session || typeof app.settings.session !== 'object') {
    app.settings.session = { files: [], active: null };
  }
  if (!Array.isArray(app.settings.recent)) app.settings.recent = [];

  initI18n();
  initWindowChrome();
  initEditor();
  initTabs();
  registerFileCommands();
  initMenus();
  initSidebar();
  initFind();
  initMinimap();
  initFindInFiles();
  initPalette();
  wireHooks();
  initStatusbar();
  initShortcutDispatcher();

  applyTheme(app.settings.theme, { persist: false });
  setFontSize(app.settings.fontSize, { persist: false });
  setWrap(app.settings.wrap, { persist: false });

  app.api.onFilesOpen((paths) => {
    if (Array.isArray(paths) && paths.length) openPaths(paths);
  });
  app.api.onCloseRequested(handleCloseRequest);
  app.api.onDemoOpen(() => {
    /* demo content is opened from the URL query below */
  });

  if (demoMode) {
    await openDemoWorkspace();
  } else {
    await restoreSession();
  }

  const panel = params.get('panel');
  if (panel) await showPanel(panel);
  else if (!shotMode) app.cm?.focus();
}

function wireHooks() {
  app.hooks.renderTabs = renderTabs;
  app.hooks.updateTabDirty = updateTabDirty;
  app.hooks.updateStatus = updateStatus;
  app.hooks.saveSession = saveSession;
  app.hooks.scheduleSession = scheduleSessionSave;
  app.hooks.redrawMinimap = redrawMinimap;
  app.hooks.resizeMinimap = resizeMinimap;
  app.hooks.syncMinimap = syncMinimapScroll;
  app.hooks.languageChanged = handleLanguageChanged;
}

function handleLanguageChanged() {
  for (const tab of app.tabs) {
    if (tab.path) continue;
    const match = /^(?:untitled|未命名)-(\d+)$/.exec(tab.name);
    if (match) tab.name = t('untitled-{n}', { n: match[1] });
  }
  refreshMenus();
  renderTabs();
  renderOpenFiles();
  renderTree();
  updateStatus();
  syncWindowTitle();
  refreshFindLanguage();
  refreshPalette();
  applyMaximizedState(maximizedState);
}

/* ------------------------------- Window chrome ------------------------------ */

function initWindowChrome() {
  hydrateIcons();
  maximizeIconEl = document.querySelector('#win-max [data-icon]');

  document.getElementById('win-min')?.addEventListener('click', () => {
    app.api.window.minimize();
  });
  document.getElementById('win-max')?.addEventListener('click', () => {
    app.api.window.toggleMaximize();
  });
  document.getElementById('win-close')?.addEventListener('click', () => {
    app.api.window.close();
  });
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    runCommand('view.toggleSidebar');
  });

  app.api.window.onState((state) => {
    applyMaximizedState(Boolean(state.maximized));
  });
  app.api.window.isMaximized().then((maximized) => applyMaximizedState(Boolean(maximized)));
}

function hydrateIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.dataset.icon;
    if (icons[name]) el.innerHTML = icons[name];
  });
}

function applyMaximizedState(maximized) {
  maximizedState = Boolean(maximized);
  if (maximizeIconEl) maximizeIconEl.innerHTML = maximizedState ? icons.restore : icons.maximize;
  const button = document.getElementById('win-max');
  if (button) {
    button.title = t(maximizedState ? 'Restore' : 'Maximize');
    button.setAttribute('aria-label', t(maximizedState ? 'Restore' : 'Maximize'));
  }
  document.body.classList.toggle('maximized', maximizedState);
}

async function handleCloseRequest() {
  if (closePending) return;
  closePending = true;
  try {
    const ok = await confirmWindowClose();
    if (ok) await app.api.window.confirmClose();
  } finally {
    closePending = false;
  }
}

/* --------------------------------- Statusbar -------------------------------- */

function initStatusbar() {
  const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => handler(el));
  };
  bind('status-pos', () => runCommand('goto.line'));
  bind('status-wrap', () => runCommand('view.wrap'));
  bind('status-indent', (el) => openStatusMenu('indent', el));
  bind('status-encoding', (el) => openStatusMenu('encoding', el));
  bind('status-eol', (el) => openStatusMenu('eol', el));
  bind('status-lang', (el) => openStatusMenu('language', el));
}

/* ------------------------------- Shortcuts ---------------------------------- */

function initShortcutDispatcher() {
  const shortcuts = allCommands().filter((command) => command.capture && command.accel);
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (app.modalOpen || app.paletteOpen) return;
      if (document.querySelector('#dropdown-layer .dropdown')) return;
      const command = shortcuts.find((entry) => {
        const accels = Array.isArray(entry.accel) ? entry.accel : [entry.accel];
        return accels.some((accel) => accelMatches(accel, event));
      });
      if (!command) return;
      if (command.enabled && !command.enabled()) return;
      event.preventDefault();
      event.stopPropagation();
      runCommand(command.id);
    },
    true
  );
}

/* ---------------------------------- Demo ------------------------------------ */

function openDemoWorkspace() {
  const demoPath = app.info.demoPath;
  if (!demoPath) {
    newUntitled();
    return Promise.resolve();
  }
  return (async () => {
    await app.hooks.openFolderPath?.(demoPath, { silent: true });
    const names = ['app.js', 'README.md', 'theme.css', 'server.py'];
    const opened = [];
    for (const name of names) {
      const target = await app.api.fs.join([demoPath, name]);
      const tab = await openPath(target, { activate: false, silent: true });
      if (tab) opened.push(tab);
    }
    if (opened.length) activateTab(opened[0], { focus: !shotMode });
    else newUntitled();
  })();
}

async function showPanel(panel) {
  switch (panel) {
    case 'find':
      runCommand('find.open');
      setTimeout(() => setFindQuery('Workspace'), 220);
      break;
    case 'replace':
      runCommand('find.replace');
      setTimeout(() => {
        setFindQuery('tabs');
        const input = document.getElementById('replace-input');
        if (input) input.value = 'items';
      }, 220);
      break;
    case 'palette':
      openPalette('files');
      setTimeout(() => setPaletteQuery('js'), 240);
      break;
    case 'commands':
      openPalette('commands');
      setTimeout(() => setPaletteQuery('toggle'), 240);
      break;
    case 'search':
      openFindInFiles();
      setTimeout(() => {
        const input = document.getElementById('fif-query');
        if (!input) return;
        input.value = 'theme';
        document.getElementById('fif-search')?.click();
      }, 360);
      break;
    case 'menu':
      setTimeout(() => openAppMenu('File'), 120);
      break;
    case 'editmenu':
      setTimeout(() => openAppMenu('Edit'), 120);
      break;
    case 'viewmenu':
      setTimeout(() => openAppMenu('View'), 120);
      break;
    case 'stats':
      setTimeout(() => runCommand('view.statistics'), 120);
      break;
    case 'shortcuts':
      setTimeout(() => runCommand('help.shortcuts'), 120);
      break;
    case 'about':
      setTimeout(() => runCommand('help.about'), 120);
      break;
    default:
      break;
  }
}

function setFindQuery(query) {
  const input = document.getElementById('find-input');
  if (!input) return;
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setPaletteQuery(query) {
  const input = document.getElementById('palette-input');
  if (!input) return;
  input.value = query;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

/* --------------------------------- Misc ------------------------------------- */

window.addEventListener('dragover', (event) => {
  if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
});
