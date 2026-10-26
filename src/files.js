import {
  app,
  activeTab,
  tabById,
  tabByPath,
  persistSettings,
  scheduleSessionSave
} from './state.js';
import { registerCommand } from './commands.js';
import {
  applyTab,
  createDoc,
  updateStatus,
  syncWindowTitle,
  setTabLanguage,
  encodingLabel,
  goToLine
} from './editor.js';
import { detectLanguage, languageById } from './modes.js';
import { basename, dirname, joinPath, samePath, isSameOrInside, escapeHtml } from './utils.js';
import { showModal, toast, promptInput, confirmDialog } from './ui.js';
import { t } from './i18n.js';

let tabSeq = 0;
const MAX_CLOSED_TABS = 20;
let closingAll = false;

export function isTabDirty(tab) {
  if (!tab) return false;
  return Boolean(tab.forcedDirty) || !tab.doc.isClean(tab.cleanGen);
}

function detectIndent(text) {
  const lines = String(text).split('\n').slice(0, 600);
  let tabLines = 0;
  let spaceLines = 0;
  const widths = new Map();
  for (const line of lines) {
    const match = /^([ \t]+)\S/.exec(line);
    if (!match) continue;
    if (match[1].includes('\t')) {
      tabLines++;
      continue;
    }
    spaceLines++;
    const width = match[1].length;
    if (width <= 8) widths.set(width, (widths.get(width) || 0) + 1);
  }
  if (tabLines > spaceLines) return { useTabs: true, size: 4 };
  if (!widths.size) return { useTabs: false, size: 4 };
  const sorted = Array.from(widths.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const best = sorted[0][0];
  return { useTabs: false, size: best === 2 ? 2 : best >= 8 ? 8 : 4 };
}

export function createTab({
  path = null,
  name = null,
  content = '',
  encoding = 'utf8',
  bom = false,
  eol = 'LF',
  language = null,
  mtimeMs = null,
  indent = null,
  forcedDirty = false
}) {
  const lang = language ? languageById(language) : detectLanguage(path || name || '', content);
  const detected = indent || detectIndent(content);
  const doc = createDoc(content, lang.id);
  const tab = {
    id: ++tabSeq,
    path,
    name: name || (path ? basename(path) : nextUntitledName()),
    encoding,
    bom: Boolean(bom),
    eol: eol === 'CRLF' ? 'CRLF' : eol === 'Mixed' ? 'Mixed' : 'LF',
    language: lang.id,
    indentSize: detected.size,
    useTabs: detected.useTabs,
    doc,
    cleanGen: doc.changeGeneration(true),
    cursor: { line: 0, ch: 0 },
    selection: null,
    scroll: { left: 0, top: 0 },
    forcedDirty: Boolean(forcedDirty),
    mtimeMs
  };
  app.tabs.push(tab);
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  return tab;
}

function nextUntitledName() {
  app.untitledSeq += 1;
  let name = t('untitled-{n}', { n: app.untitledSeq });
  const taken = new Set(app.tabs.map((tab) => tab.name));
  while (taken.has(name)) {
    app.untitledSeq += 1;
    name = t('untitled-{n}', { n: app.untitledSeq });
  }
  return name;
}

export function newUntitled({ content = '', language = 'plain', activate = true } = {}) {
  const tab = createTab({ content, language });
  if (activate) activateTab(tab);
  else app.hooks.renderTabs?.();
  return tab;
}

export function activateTab(tab, { focus = true } = {}) {
  if (!tab) return;
  if (tab.id === app.activeId) {
    if (focus) app.cm?.focus();
    return;
  }
  const current = activeTab();
  if (current && app.cm) {
    current.selection = app.cm.listSelections();
    current.cursor = app.cm.getCursor();
    const info = app.cm.getScrollInfo();
    current.scroll = { left: info.left, top: info.top };
  }
  app.activeId = tab.id;
  applyTab(tab);
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  app.hooks.syncMinimap?.();
  if (focus) {
    requestAnimationFrame(() => app.cm?.focus());
  }
  scheduleSessionSave();
}

export async function openPath(filePath, { activate = true, silent = false, line = null, col = null } = {}) {
  if (!filePath) return null;
  const existing = tabByPath(filePath);
  if (existing) {
    if (activate) activateTab(existing);
    if (line != null) goToLine(line, (col || 1) - 1);
    return existing;
  }
  try {
    const data = await app.api.fs.read(filePath);
    const language = detectLanguage(data.path, data.content);
    const tab = createTab({
      path: data.path,
      name: data.name,
      content: data.content,
      encoding: data.encoding || 'utf8',
      bom: Boolean(data.bom),
      eol: data.eol || 'LF',
      language: language.id,
      mtimeMs: data.mtimeMs
    });
    if (activate) activateTab(tab);
    if (line != null) goToLine(line, (col || 1) - 1);
    if (data.size > 8 * 1024 * 1024 && !silent) {
      toast(t('Opened a large file ({size} MB) — syntax highlighting may be limited', { size: (data.size / 1024 / 1024).toFixed(1) }), 'info', 4200);
    }
    addRecent(data.path);
    return tab;
  } catch (err) {
    if (!silent) toast(t('Could not open {name}: {message}', { name: basename(filePath), message: err.message }), 'error', 4200);
    return null;
  }
}

export async function openPaths(paths, { activate = true, silent = false } = {}) {
  const list = (paths || []).filter((item) => typeof item === 'string' && item);
  if (!list.length) return [];
  const opened = [];
  for (const item of list) {
    let directory = false;
    try {
      await app.api.fs.readDir(item);
      directory = true;
    } catch {
      directory = false;
    }
    if (directory) {
      await app.hooks.openFolderPath?.(item, { silent });
      continue;
    }
    const tab = await openPath(item, { activate: false, silent });
    if (tab) opened.push(tab);
  }
  if (opened.length && activate) activateTab(opened[opened.length - 1]);
  return opened;
}

export async function openFileDialog() {
  const paths = await app.api.dialogs.openFiles();
  if (!paths || !paths.length) return;
  await openPaths(paths);
}

export function addRecent(filePath) {
  if (!filePath) return;
  const list = app.settings.recent.filter((item) => !samePath(item, filePath));
  list.unshift(filePath);
  app.settings.recent = list.slice(0, 14);
  persistSettings({ recent: app.settings.recent });
}

export function removeRecent(filePath) {
  app.settings.recent = app.settings.recent.filter((item) => !samePath(item, filePath));
  persistSettings({ recent: app.settings.recent });
}

export async function saveTab(tab, { saveAs = false, quiet = false } = {}) {
  if (!tab) return false;
  let target = tab.path;
  if (!target || saveAs) {
    const defaultPath = tab.path || (app.folder ? joinPath(app.folder, tab.name) : tab.name);
    target = await app.api.dialogs.saveFile({ defaultPath });
    if (!target) return false;
  }
  const nextLanguage = detectLanguage(target, tab.doc.getValue());
  const content = tab.doc.getValue();
  const eol = tab.eol === 'CRLF' ? 'CRLF' : 'LF';
  try {
    const result = await app.api.fs.write({
      path: target,
      content,
      encoding: tab.encoding,
      bom: tab.bom,
      eol
    });
    const changedPath = !tab.path || !samePath(tab.path, result.path);
    tab.path = result.path;
    tab.name = result.name;
    tab.mtimeMs = result.mtimeMs;
    tab.cleanGen = tab.doc.changeGeneration(true);
    tab.forcedDirty = false;
    if (tab.eol === 'Mixed') tab.eol = 'LF';
    if (nextLanguage.id !== tab.language) setTabLanguage(tab, nextLanguage.id);
    app.hooks.updateTabDirty?.(tab);
    app.hooks.renderOpenFiles?.();
    updateStatus();
    syncWindowTitle();
    addRecent(result.path);
    scheduleSessionSave();
    if (changedPath && !quiet) toast(t('Saved {name}', { name: tab.name }), 'success', 1600);
    return true;
  } catch (err) {
    toast(t('Could not save {name}: {message}', { name: tab.name, message: err.message }), 'error', 4600);
    return false;
  }
}

export async function saveActiveTab(options) {
  const tab = activeTab();
  if (!tab) return false;
  return saveTab(tab, options);
}

export async function saveAllTabs({ quiet = false } = {}) {
  const tabs = app.tabs.filter((tab) => isTabDirty(tab));
  for (const tab of tabs) {
    const ok = await saveTab(tab, { quiet });
    if (!ok) return false;
  }
  return true;
}

async function promptUnsaved(tab) {
  const result = await showModal({
    title: t('Save changes to {name}?', { name: tab.name }),
    content: `<p>${escapeHtml(t("Your changes will be lost if you don't save them."))}</p>`,
    buttons: [
      { id: 'cancel', label: t('Cancel') },
      { id: 'discard', label: t("Don't Save"), variant: 'danger' },
      { id: 'save', label: t('Save'), variant: 'primary' }
    ],
    dismissible: false,
    escapeValue: 'cancel'
  });
  if (result === 'save') return (await saveTab(tab)) ? true : false;
  if (result === 'discard') return true;
  return false;
}

async function confirmBatchClose(tabs) {
  const dirty = tabs.filter((tab) => isTabDirty(tab));
  if (!dirty.length) return true;
  const many = dirty.length > 1;
  const result = await showModal({
    title: many
      ? t('{count} files have unsaved changes', { count: dirty.length })
      : t('{count} file has unsaved changes', { count: dirty.length }),
    content: `<p>${escapeHtml(many ? t("These files will be lost if you don't save them.") : t("This file will be lost if you don't save it."))}</p>`,
    buttons: [
      { id: 'cancel', label: t('Cancel') },
      { id: 'discard', label: t("Don't Save"), variant: 'danger' },
      { id: 'save', label: t('Save All'), variant: 'primary' }
    ],
    dismissible: false,
    escapeValue: 'cancel'
  });
  if (result === 'save') {
    for (const tab of dirty) {
      const ok = await saveTab(tab);
      if (!ok) return false;
    }
    return true;
  }
  return result === 'discard';
}

export async function closeTab(tab, { force = false } = {}) {
  if (!tab) return false;
  if (!force && isTabDirty(tab)) {
    const ok = await promptUnsaved(tab);
    if (!ok) return false;
  }
  const index = app.tabs.indexOf(tab);
  if (index < 0) return false;
  const wasActive = tab.id === app.activeId;
  const record = {
    path: tab.path,
    name: tab.name,
    content: tab.doc.getValue(),
    encoding: tab.encoding,
    bom: tab.bom,
    eol: tab.eol,
    language: tab.language,
    cursor: tab.cursor,
    wasDirty: isTabDirty(tab)
  };
  app.closedTabs.push(record);
  if (app.closedTabs.length > MAX_CLOSED_TABS) app.closedTabs.shift();
  app.tabs.splice(index, 1);

  if (wasActive) {
    const next = app.tabs[Math.min(index, app.tabs.length - 1)];
    if (next) {
      app.activeId = next.id;
      applyTab(next);
      requestAnimationFrame(() => app.cm?.focus());
    } else if (!closingAll) {
      const fresh = createTab({});
      app.activeId = fresh.id;
      applyTab(fresh);
    } else {
      app.activeId = null;
    }
  }
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  syncWindowTitle();
  scheduleSessionSave();
  return true;
}

export async function closeOtherTabs(tab) {
  const others = app.tabs.filter((item) => item !== tab);
  if (!(await confirmBatchClose(others))) return;
  closingAll = true;
  try {
    for (const item of others) {
      const index = app.tabs.indexOf(item);
      if (index >= 0) app.tabs.splice(index, 1);
    }
  } finally {
    closingAll = false;
  }
  app.activeId = tab.id;
  applyTab(tab);
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  scheduleSessionSave();
  requestAnimationFrame(() => app.cm?.focus());
}

export async function closeTabsToRight(tab) {
  const index = app.tabs.indexOf(tab);
  if (index < 0) return;
  const targets = app.tabs.slice(index + 1);
  if (!targets.length) return;
  if (!(await confirmBatchClose(targets))) return;
  closingAll = true;
  try {
    for (const item of targets) {
      const idx = app.tabs.indexOf(item);
      if (idx > index) app.tabs.splice(idx, 1);
    }
  } finally {
    closingAll = false;
  }
  if (!tabById(app.activeId)) activateTab(tab);
  else {
    app.hooks.renderTabs?.();
    app.hooks.renderOpenFiles?.();
    scheduleSessionSave();
  }
}

export async function closeAllTabs() {
  if (!app.tabs.length) return;
  if (!(await confirmBatchClose(app.tabs))) return;
  closingAll = true;
  try {
    app.tabs.length = 0;
    app.activeId = null;
    const fresh = createTab({});
    app.activeId = fresh.id;
    applyTab(fresh);
    requestAnimationFrame(() => app.cm?.focus());
  } finally {
    closingAll = false;
  }
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  scheduleSessionSave();
}

export async function reopenClosedTab() {
  const record = app.closedTabs.pop();
  if (!record) {
    toast(t('No recently closed tabs'), 'info', 1800);
    return;
  }
  if (record.path) {
    try {
      const info = await app.api.fs.stat(record.path);
      if (info) {
        const tab = await openPath(record.path, { activate: true, silent: true });
        if (tab) {
          if (record.cursor) goToLine(record.cursor.line + 1, record.cursor.ch);
          return;
        }
      }
    } catch {
      /* fall through to restoring the buffer */
    }
  }
  const tab = createTab({
    path: record.path,
    name: record.name,
    content: record.content,
    encoding: record.encoding,
    bom: record.bom,
    eol: record.eol,
    language: record.language,
    forcedDirty: Boolean(record.path) || record.wasDirty
  });
  activateTab(tab);
  if (record.cursor) goToLine(record.cursor.line + 1, record.cursor.ch);
}

export async function copyTabPath(tab) {
  if (!tab || !tab.path) return false;
  await app.api.clipboard.writeText(tab.path);
  return true;
}

export async function renameActiveFile() {
  const tab = activeTab();
  if (!tab || !tab.path) {
    toast(t('Save the file first to rename it'), 'info', 2200);
    return;
  }
  const name = await promptInput({
    title: t('Rename File'),
    label: t('New name'),
    value: tab.name,
    confirmText: t('Rename')
  });
  if (!name || name === tab.name) return;
  if (/[\\/]/.test(name)) {
    toast(t('Name cannot contain path separators'), 'warning');
    return;
  }
  const next = joinPath(dirname(tab.path), name);
  try {
    await app.api.fs.rename(tab.path, next);
    renameTabPaths(tab.path, next);
    addRecent(next);
    app.hooks.refreshFileTree?.();
    toast(t('Renamed to {name}', { name }), 'success', 1800);
  } catch (err) {
    toast(t('Rename failed: {message}', { message: err.message }), 'error', 4200);
  }
}

export function renameTabPaths(oldPath, newPath) {
  for (const tab of app.tabs) {
    if (!tab.path) continue;
    if (isSameOrInside(tab.path, oldPath)) {
      tab.path = newPath + tab.path.slice(oldPath.length);
      tab.name = basename(tab.path);
      const nextLanguage = detectLanguage(tab.path, tab.doc.getValue());
      if (nextLanguage.id !== tab.language) {
        tab.language = nextLanguage.id;
        if (tab.id === app.activeId) setTabLanguage(tab, nextLanguage.id);
      }
    }
  }
  app.hooks.renderTabs?.();
  app.hooks.renderOpenFiles?.();
  app.hooks.refreshSidebarActive?.();
  syncWindowTitle();
  scheduleSessionSave();
}

export function closeTabsForPath(targetPath) {
  const targets = app.tabs.filter((tab) => tab.path && isSameOrInside(tab.path, targetPath));
  for (const tab of targets) closeTab(tab, { force: true });
}

export function setTabEncoding(tab, encoding, bom) {
  if (!tab) return;
  const previous = encodingLabel(tab);
  tab.encoding = encoding;
  tab.bom = Boolean(bom);
  tab.forcedDirty = true;
  if (tab.id === app.activeId) updateStatus();
  app.hooks.updateTabDirty?.(tab);
  app.hooks.scheduleSession?.();
  const next = encodingLabel(tab);
  if (previous !== next) toast(t('Encoding set to {encoding} — save to apply', { encoding: next }), 'info', 2200);
}

export async function reopenWithEncoding(tab, encoding) {
  if (!tab) return;
  if (!tab.path) {
    toast(t('Save the file first to reopen it'), 'info', 2200);
    return;
  }
  if (isTabDirty(tab)) {
    const discard = await confirmDialog({
      title: t('Reopen with Encoding'),
      message: t('Discard unsaved changes in "{name}"?', { name: tab.name }),
      confirmText: t('Reopen'),
      danger: true
    });
    if (!discard) return;
  }
  try {
    const data = await app.api.fs.read(tab.path, { encoding });
    const language = detectLanguage(tab.path, data.content);
    const indent = detectIndent(data.content);
    tab.encoding = data.encoding || encoding;
    tab.bom = Boolean(data.bom);
    tab.eol = data.eol || 'LF';
    tab.language = language.id;
    tab.indentSize = indent.size;
    tab.useTabs = indent.useTabs;
    tab.mtimeMs = data.mtimeMs;
    tab.cursor = { line: 0, ch: 0 };
    tab.selection = null;
    tab.scroll = { left: 0, top: 0 };
    tab.forcedDirty = false;
    tab.doc.setValue(data.content);
    tab.doc.clearHistory();
    tab.cleanGen = tab.doc.changeGeneration(true);
    if (tab.id === app.activeId) {
      app.cm?.setOption('mode', language.mode);
      app.cm?.setOption('indentUnit', tab.indentSize || 4);
      app.cm?.setOption('tabSize', tab.indentSize || 4);
      app.cm?.setOption('indentWithTabs', Boolean(tab.useTabs));
      app.cm?.setCursor({ line: 0, ch: 0 });
      app.cm?.scrollTo(0, 0);
      updateStatus();
      syncWindowTitle();
      app.cm?.refresh();
      app.hooks.syncMinimap?.();
      app.hooks.resizeMinimap?.();
    }
    app.hooks.updateTabDirty?.(tab);
    app.hooks.renderTabs?.();
    app.hooks.renderOpenFiles?.();
    scheduleSessionSave();
    toast(
      t('Reopened {name} as {encoding}', { name: tab.name, encoding: encodingLabel(tab) }),
      'success',
      2000
    );
  } catch (err) {
    toast(
      t('Could not reopen {name}: {message}', { name: tab.name, message: err.message }),
      'error',
      4200
    );
  }
}

export function setTabIndent(tab, size, useTabs) {
  if (!tab) return;
  tab.indentSize = Number(size) || 4;
  tab.useTabs = Boolean(useTabs);
  if (tab.id === app.activeId && app.cm) {
    app.cm.setOption('indentUnit', tab.indentSize);
    app.cm.setOption('tabSize', tab.indentSize);
    app.cm.setOption('indentWithTabs', tab.useTabs);
  }
  updateStatus();
  app.hooks.scheduleSession?.();
}

export function saveSession() {
  if (app.noPersist) return;
  const session = {
    files: app.tabs.filter((tab) => tab.path).map((tab) => tab.path),
    active: activeTab()?.path || null,
    folder: app.folder
  };
  persistSettings({ session, folder: app.folder });
}

export async function restoreSession() {
  const initial = Array.isArray(app.info.initialPaths) ? app.info.initialPaths.filter(Boolean) : [];
  if (initial.length) {
    const opened = [];
    for (const item of initial) {
      const tab = await openPath(item, { activate: false, silent: true });
      if (tab) opened.push(tab);
    }
    if (opened.length) {
      activateTab(opened[opened.length - 1]);
      return;
    }
  }
  const session = app.settings.session || { files: [], active: null };
  if (session.folder) {
    await app.hooks.openFolderPath?.(session.folder, { silent: true, restore: true });
  }
  const opened = [];
  for (const file of session.files || []) {
    const tab = await openPath(file, { activate: false, silent: true });
    if (tab) opened.push(tab);
  }
  if (opened.length) {
    const target = tabByPath(session.active) || opened[opened.length - 1];
    activateTab(target);
  } else {
    newUntitled();
  }
}

export async function confirmWindowClose() {
  saveSession();
  if (!(await confirmBatchClose(app.tabs))) return false;
  return true;
}

export function nextTab(direction = 1) {
  if (app.tabs.length < 2) return;
  const index = app.tabs.findIndex((tab) => tab.id === app.activeId);
  if (index < 0) return;
  const next = (index + direction + app.tabs.length) % app.tabs.length;
  activateTab(app.tabs[next]);
}

export function registerFileCommands() {
  const register = (definition) => registerCommand({ scope: 'global', palette: true, ...definition });

  register({
    id: 'file.new',
    label: 'New File',
    accel: 'Ctrl+N',
    capture: true,
    run: () => newUntitled()
  });
  register({
    id: 'file.open',
    label: 'Open File…',
    accel: 'Ctrl+O',
    capture: true,
    run: () => openFileDialog()
  });
  register({
    id: 'file.openFolder',
    label: 'Open Folder…',
    accel: 'Ctrl+Shift+O',
    capture: true,
    run: () => app.hooks.openFolderDialog?.()
  });
  register({
    id: 'file.save',
    label: 'Save',
    accel: 'Ctrl+S',
    capture: true,
    enabled: () => Boolean(activeTab()),
    run: () => saveActiveTab()
  });
  register({
    id: 'file.saveAs',
    label: 'Save As…',
    accel: 'Ctrl+Shift+S',
    capture: true,
    enabled: () => Boolean(activeTab()),
    run: () => saveActiveTab({ saveAs: true })
  });
  register({
    id: 'file.saveAll',
    label: 'Save All',
    run: () => saveAllTabs()
  });
  register({
    id: 'file.close',
    label: 'Close Tab',
    accel: 'Ctrl+W',
    capture: true,
    enabled: () => Boolean(activeTab()),
    run: () => closeTab(activeTab())
  });
  register({
    id: 'file.closeOthers',
    label: 'Close Other Tabs',
    enabled: () => app.tabs.length > 1,
    run: () => closeOtherTabs(activeTab())
  });
  register({
    id: 'file.closeAll',
    label: 'Close All Tabs',
    enabled: () => app.tabs.length > 0,
    run: () => closeAllTabs()
  });
  register({
    id: 'file.reopen',
    label: 'Reopen Closed Tab',
    accel: 'Ctrl+Shift+T',
    capture: true,
    run: () => reopenClosedTab()
  });
  register({
    id: 'file.rename',
    label: 'Rename File…',
    enabled: () => Boolean(activeTab()?.path),
    run: () => renameActiveFile()
  });
  register({
    id: 'file.copyPath',
    label: 'Copy File Path',
    enabled: () => Boolean(activeTab()?.path),
    run: async () => {
      const tab = activeTab();
      if (!tab?.path) return;
      await app.api.clipboard.writeText(tab.path);
      toast(t('Path copied to clipboard'), 'success', 1600);
    }
  });
  register({
    id: 'file.reveal',
    label: 'Reveal in Explorer',
    enabled: () => Boolean(activeTab()?.path),
    run: () => {
      const tab = activeTab();
      if (tab?.path) app.api.fs.reveal(tab.path);
    }
  });
  register({
    id: 'file.openRecent',
    label: 'Open Recent File',
    palette: false,
    run: (filePath) => openPath(filePath)
  });
  register({
    id: 'file.exit',
    label: 'Exit',
    run: () => app.api.window.close()
  });
  register({
    id: 'tab.next',
    label: 'Next Tab',
    accel: 'Ctrl+Tab',
    capture: true,
    enabled: () => app.tabs.length > 1,
    run: () => nextTab(1)
  });
  register({
    id: 'tab.prev',
    label: 'Previous Tab',
    accel: 'Ctrl+Shift+Tab',
    capture: true,
    enabled: () => app.tabs.length > 1,
    run: () => nextTab(-1)
  });
  register({
    id: 'language.set',
    label: 'Set Language',
    palette: false,
    run: (languageId) => {
      const tab = activeTab();
      if (tab) setTabLanguage(tab, languageId);
    }
  });
  register({
    id: 'indent.set',
    label: 'Set Indentation',
    palette: false,
    run: (size, useTabs) => setTabIndent(activeTab(), size, useTabs)
  });
}
