import { app, activeTab, tabById, persistSettings, normalizePath, scheduleSessionSave } from './state.js';
import { registerCommand } from './commands.js';
import { icons, fileIconMarkup } from './icons.js';
import { basename, dirname, joinPath, isSameOrInside, clamp } from './utils.js';
import { toast, promptInput, confirmDialog } from './ui.js';
import { showMenu } from './menus.js';
import { t } from './i18n.js';
import {
  openPath,
  activateTab,
  closeTab,
  closeOtherTabs,
  closeTabsForPath,
  renameTabPaths
} from './files.js';

let cache = new Map();
let expanded = new Set();
let selectedPath = null;
let selectedIsDir = false;
let renderToken = 0;

export function initSidebar() {
  const treeEl = document.getElementById('file-tree');
  if (!treeEl) return;

  applySidebarVisibility(app.settings.sidebar, { persist: false });
  applySidebarWidth(app.settings.sidebarWidth || 252, { persist: false });

  document.getElementById('tree-open-folder')?.addEventListener('click', () => openFolderDialog());
  document.getElementById('sidebar-folder-name')?.addEventListener('click', () => openFolderDialog());
  document.getElementById('sidebar-folder-name')?.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showFolderRootMenu(event.clientX, event.clientY);
  });

  const actions = document.getElementById('sidebar-actions');
  actions?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'new-file') createEntry('file');
    else if (action === 'new-folder') createEntry('folder');
    else if (action === 'refresh') refreshFileTree();
    else if (action === 'collapse') {
      expanded.clear();
      if (app.folder) expanded.add(normalizePath(app.folder));
      renderTree();
    }
  });

  treeEl.addEventListener('click', async (event) => {
    const row = event.target.closest('.tree-row');
    if (!row) return;
    const targetPath = row.dataset.path;
    const isDir = row.dataset.dir === '1';
    selectedPath = targetPath;
    selectedIsDir = isDir;
    if (isDir) {
      const key = normalizePath(targetPath);
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      await renderTree();
    } else {
      refreshSidebarActive();
      await openPath(targetPath);
      refreshSidebarActive();
    }
  });

  treeEl.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.tree-row');
    if (!row) return;
    event.preventDefault();
    selectedPath = row.dataset.path;
    selectedIsDir = row.dataset.dir === '1';
    refreshSidebarActive();
    showTreeMenu(selectedPath, selectedIsDir, event.clientX, event.clientY);
  });

  const openFiles = document.getElementById('open-files-list');
  openFiles?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('.close-mini');
    const item = event.target.closest('.open-file');
    if (!item) return;
    const tab = tabById(Number(item.dataset.id));
    if (!tab) return;
    if (closeButton) {
      event.stopPropagation();
      closeTab(tab);
      return;
    }
    activateTab(tab);
  });
  openFiles?.addEventListener('contextmenu', (event) => {
    const item = event.target.closest('.open-file');
    if (!item) return;
    event.preventDefault();
    const tab = tabById(Number(item.dataset.id));
    if (!tab) return;
    showMenu(
      [
        { label: t('Close'), accel: 'Ctrl+W', run: () => closeTab(tab) },
        { label: t('Close Others'), disabled: app.tabs.length < 2, run: () => closeOtherTabs(tab) },
        { type: 'separator' },
        {
          label: t('Copy Path'),
          icon: 'copy',
          disabled: !tab.path,
          run: async () => {
            if (!tab.path) return;
            await app.api.clipboard.writeText(tab.path);
            toast(t('Path copied to clipboard'), 'success', 1600);
          }
        },
        {
          label: t('Reveal in Explorer'),
          icon: 'reveal',
          disabled: !tab.path,
          run: () => tab.path && app.api.fs.reveal(tab.path)
        }
      ],
      { x: event.clientX, y: event.clientY }
    );
  });

  setupResizer();

  app.hooks.openFolderPath = openFolderPath;
  app.hooks.openFolderDialog = openFolderDialog;
  app.hooks.renderOpenFiles = renderOpenFiles;
  app.hooks.updateOpenFileDirty = updateOpenFileDirty;
  app.hooks.refreshSidebarActive = refreshSidebarActive;
  app.hooks.refreshFileTree = () => refreshFileTree();

  registerCommand({
    id: 'view.toggleSidebar',
    label: 'Toggle Sidebar',
    accel: 'Ctrl+B',
    scope: 'global',
    capture: true,
    checked: () => app.settings.sidebar,
    run: () => toggleSidebar()
  });

  renderOpenFiles();
  renderTree();
}

export function applySidebarVisibility(visible, { persist = true } = {}) {
  app.settings.sidebar = Boolean(visible);
  document.body.classList.toggle('sidebar-hidden', !app.settings.sidebar);
  if (persist) persistSettings({ sidebar: app.settings.sidebar });
  requestAnimationFrame(() => {
    app.cm?.refresh();
    app.hooks.resizeMinimap?.();
  });
}

export function toggleSidebar(force) {
  const next = typeof force === 'boolean' ? force : !app.settings.sidebar;
  applySidebarVisibility(next);
}

function applySidebarWidth(width, { persist = true } = {}) {
  const value = clamp(Math.round(width), 170, 560);
  document.documentElement.style.setProperty('--sidebar-width', `${value}px`);
  app.settings.sidebarWidth = value;
  if (persist) persistSettings({ sidebarWidth: value });
}

function setupResizer() {
  const resizer = document.getElementById('sidebar-resizer');
  if (!resizer) return;
  let startX = 0;
  let startWidth = 0;
  resizer.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = app.settings.sidebarWidth || 252;
    resizer.classList.add('dragging');
    let frame = null;
    const onMove = (moveEvent) => {
      const width = startWidth + (moveEvent.clientX - startX);
      applySidebarWidth(width, { persist: false });
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        app.cm?.refresh();
      });
    };
    const onUp = () => {
      resizer.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      persistSettings({ sidebarWidth: app.settings.sidebarWidth });
      app.hooks.resizeMinimap?.();
      app.cm?.refresh();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
  resizer.addEventListener('dblclick', () => applySidebarWidth(252));
}

export async function openFolderDialog() {
  const folder = await app.api.dialogs.openFolder();
  if (!folder) return;
  await openFolderPath(folder);
}

export async function openFolderPath(folderPath, { silent = false } = {}) {
  if (!folderPath) return false;
  try {
    const entries = await app.api.fs.readDir(folderPath);
    app.folder = folderPath;
    cache.clear();
    cache.set(normalizePath(folderPath), entries);
    expanded = new Set([normalizePath(folderPath)]);
    selectedPath = null;
    selectedIsDir = false;
    persistSettings({ folder: folderPath });
    updateFolderHeader();
    await renderTree();
    scheduleSessionSave();
    if (!silent) toast(t('Opened folder {name}', { name: basename(folderPath) }), 'info', 1600);
    return true;
  } catch (err) {
    if (!silent) toast(t('Could not open folder: {message}', { message: err.message }), 'error', 4200);
    return false;
  }
}

async function closeFolder() {
  app.folder = null;
  cache.clear();
  expanded.clear();
  selectedPath = null;
  selectedIsDir = false;
  persistSettings({ folder: null });
  updateFolderHeader();
  await renderTree();
  scheduleSessionSave();
}

function updateFolderHeader() {
  const header = document.getElementById('sidebar-folder-name');
  if (!header) return;
  if (app.folder) {
    header.textContent = basename(app.folder).toUpperCase();
    header.title = app.folder;
  } else {
    header.textContent = t('NO FOLDER');
    header.title = t('Open Folder');
  }
}

export async function renderTree() {
  const treeEl = document.getElementById('file-tree');
  const emptyEl = document.getElementById('tree-empty');
  if (!treeEl || !emptyEl) return;
  updateFolderHeader();
  if (!app.folder) {
    treeEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  const token = ++renderToken;
  const active = activeTab();
  const activePath = active?.path ? normalizePath(active.path) : null;
  const selected = selectedPath ? normalizePath(selectedPath) : null;
  let html = '';

  const walk = async (dir, depth) => {
    const entries = await loadDir(dir);
    if (!entries) return;
    for (const entry of entries) {
      const key = normalizePath(entry.path);
      const isOpen = expanded.has(key);
      const isActive = selected === key || (!entry.isDir && activePath === key);
      html += `
        <div class="tree-row${entry.isDir ? ' is-dir' : ''}${isActive ? ' active' : ''}" data-path="${escapeAttr(entry.path)}" data-dir="${entry.isDir ? '1' : '0'}" title="${escapeAttr(entry.path)}" style="padding-left:${6 + depth * 13}px">
          <span class="tree-chevron${entry.isDir ? (isOpen ? ' open' : '') : ' empty'}">${icons.chevronRight}</span>
          ${fileIconMarkup(entry.name, entry.isDir, isOpen)}
          <span class="tree-name">${escapeAttr(entry.name)}</span>
        </div>`;
      if (entry.isDir && isOpen) {
        await walk(entry.path, depth + 1);
        if (token !== renderToken) return;
      }
    }
  };

  await walk(app.folder, 0);
  if (token !== renderToken) return;
  treeEl.innerHTML = html || `<div class="sidebar-empty"><p>${t('Folder is empty')}</p></div>`;
}

async function loadDir(dir) {
  const key = normalizePath(dir);
  if (cache.has(key)) return cache.get(key);
  try {
    const entries = await app.api.fs.readDir(dir);
    cache.set(key, entries);
    return entries;
  } catch {
    return null;
  }
}

export function refreshFileTree({ clearCache = true } = {}) {
  if (clearCache) cache.clear();
  renderTree();
}

export function renderOpenFiles() {
  const list = document.getElementById('open-files-list');
  const count = document.getElementById('open-file-count');
  if (!list) return;
  if (count) count.textContent = app.tabs.length ? String(app.tabs.length) : '';
  list.innerHTML = app.tabs
    .map((tab) => {
      const dirty = Boolean(tab.forcedDirty) || !tab.doc.isClean(tab.cleanGen);
      return `
        <div class="open-file${tab.id === app.activeId ? ' active' : ''}${dirty ? ' dirty' : ''}" data-id="${tab.id}" title="${escapeAttr(tab.path || tab.name)}">
          ${fileIconMarkup(tab.name)}
          <span class="name">${escapeAttr(tab.name)}</span>
          <span class="dirty-dot"></span>
          <button class="close-mini" title="${t('Close')}" aria-label="${escapeAttr(t('Close {name}', { name: tab.name }))}">${icons.close}</button>
        </div>`;
    })
    .join('');
}

export function updateOpenFileDirty(tab) {
  if (!tab) return;
  const item = document.querySelector(`.open-file[data-id="${tab.id}"]`);
  if (!item) return;
  const dirty = Boolean(tab.forcedDirty) || !tab.doc.isClean(tab.cleanGen);
  item.classList.toggle('dirty', dirty);
}

export function refreshSidebarActive() {
  const active = activeTab();
  const activePath = active?.path ? normalizePath(active.path) : null;
  const selected = selectedPath ? normalizePath(selectedPath) : null;
  document.querySelectorAll('.open-file').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.id) === app.activeId);
  });
  document.querySelectorAll('.tree-row').forEach((el) => {
    const key = normalizePath(el.dataset.path || '');
    const isDir = el.dataset.dir === '1';
    const isActive = selected === key || (!isDir && activePath === key);
    el.classList.toggle('active', isActive);
  });
}

async function createEntry(kind) {
  if (!app.folder) {
    toast(t('Open a folder first'), 'info', 2000);
    return;
  }
  const dir = targetDirectory();
  const isFile = kind === 'file';
  const name = await promptInput({
    title: isFile ? t('New File') : t('New Folder'),
    label: isFile ? t('File name') : t('Folder name'),
    value: isFile ? t('untitled.txt') : t('New Folder'),
    confirmText: isFile ? t('Create File') : t('Create Folder')
  });
  if (!name) return;
  if (/[\\/]/.test(name)) {
    toast(t('Name cannot contain path separators'), 'warning');
    return;
  }
  try {
    const target = isFile
      ? await app.api.fs.createFile(dir, name)
      : await app.api.fs.createFolder(dir, name);
    cache.delete(normalizePath(dir));
    let parent = dir;
    while (parent && isSameOrInside(parent, app.folder)) {
      expanded.add(normalizePath(parent));
      if (normalizePath(parent) === normalizePath(app.folder)) break;
      parent = dirname(parent);
    }
    selectedPath = target;
    selectedIsDir = !isFile;
    await renderTree();
    if (isFile) await openPath(target);
  } catch (err) {
    toast(t(isFile ? 'Could not create file: {message}' : 'Could not create folder: {message}', { message: err.message }), 'error', 4200);
  }
}

function targetDirectory() {
  if (selectedPath) {
    if (selectedIsDir) return selectedPath;
    return dirname(selectedPath);
  }
  return app.folder;
}

function showTreeMenu(targetPath, isDir, x, y) {
  const parent = dirname(targetPath);
  const isRoot = app.folder && normalizePath(targetPath) === normalizePath(app.folder);
  const items = [];
  if (isDir) {
    const isOpen = expanded.has(normalizePath(targetPath));
    items.push({
      label: isOpen ? t('Collapse Folder') : t('Expand Folder'),
      run: async () => {
        const key = normalizePath(targetPath);
        if (expanded.has(key)) expanded.delete(key);
        else expanded.add(key);
        await renderTree();
      }
    });
    items.push({ type: 'separator' });
  } else {
    items.push({ label: t('Open'), run: () => openPath(targetPath) });
    items.push({ type: 'separator' });
  }
  items.push(
    { label: t('New File…'), icon: 'plus', run: () => createEntryIn(targetPath, isDir, 'file') },
    { label: t('New Folder…'), icon: 'folder', run: () => createEntryIn(targetPath, isDir, 'folder') },
    { type: 'separator' },
    {
      label: t('Rename…'),
      icon: 'pencil',
      disabled: isRoot,
      run: () => renameEntry(targetPath)
    },
    {
      label: t('Delete'),
      icon: 'trash',
      danger: true,
      disabled: isRoot,
      run: () => deleteEntry(targetPath, isDir)
    },
    { type: 'separator' },
    {
      label: t('Copy Path'),
      icon: 'copy',
      run: async () => {
        await app.api.clipboard.writeText(targetPath);
        toast(t('Path copied to clipboard'), 'success', 1600);
      }
    },
    {
      label: t('Reveal in Explorer'),
      icon: 'reveal',
      run: () => app.api.fs.reveal(targetPath)
    }
  );
  showMenu(items, { x, y });
}

function showFolderRootMenu(x, y) {
  const items = [
    { label: t('Open Folder…'), icon: 'folderOpen', run: () => openFolderDialog() },
    { label: t('Refresh'), icon: 'refresh', disabled: !app.folder, run: () => refreshFileTree() },
    { type: 'separator' },
    {
      label: t('Reveal in Explorer'),
      icon: 'reveal',
      disabled: !app.folder,
      run: () => app.folder && app.api.fs.reveal(app.folder)
    },
    { label: t('Close Folder'), disabled: !app.folder, run: () => closeFolder() }
  ];
  showMenu(items, { x, y });
}

async function createEntryIn(targetPath, isDir, kind) {
  selectedPath = isDir ? targetPath : dirname(targetPath);
  selectedIsDir = true;
  await createEntry(kind);
}

async function renameEntry(targetPath) {
  const name = await promptInput({
    title: t('Rename'),
    label: t('New name'),
    value: basename(targetPath),
    confirmText: t('Rename')
  });
  if (!name || name === basename(targetPath)) return;
  if (/[\\/]/.test(name)) {
    toast(t('Name cannot contain path separators'), 'warning');
    return;
  }
  const nextPath = joinPath(dirname(targetPath), name);
  try {
    await app.api.fs.rename(targetPath, nextPath);
    renameTabPaths(targetPath, nextPath);
    if (normalizePath(app.folder) === normalizePath(targetPath)) {
      app.folder = nextPath;
      persistSettings({ folder: nextPath });
      updateFolderHeader();
    }
    const remapped = new Set();
    for (const key of expanded) {
      if (key === normalizePath(targetPath)) remapped.add(normalizePath(nextPath));
      else if (key.startsWith(normalizePath(targetPath) + '\\')) {
        remapped.add(normalizePath(nextPath) + key.slice(normalizePath(targetPath).length));
      } else remapped.add(key);
    }
    expanded = remapped;
    cache.clear();
    selectedPath = nextPath;
    await renderTree();
    scheduleSessionSave();
    toast(t('Renamed to {name}', { name }), 'success', 1800);
  } catch (err) {
    toast(t('Rename failed: {message}', { message: err.message }), 'error', 4200);
  }
}

async function deleteEntry(targetPath, isDir) {
  const ok = await confirmDialog({
    title: isDir ? t('Delete Folder') : t('Delete File'),
    message: t('Move "{name}" to the trash?', { name: basename(targetPath) }),
    confirmText: t('Move to Trash'),
    danger: true
  });
  if (!ok) return;
  try {
    await app.api.fs.trash(targetPath);
    closeTabsForPath(targetPath);
    if (isSameOrInside(app.folder, targetPath)) {
      await closeFolder();
    } else {
      cache.delete(normalizePath(dirname(targetPath)));
      if (selectedPath && isSameOrInside(selectedPath, targetPath)) selectedPath = null;
      await renderTree();
    }
    toast(t('Moved "{name}" to trash', { name: basename(targetPath) }), 'success', 2200);
  } catch (err) {
    toast(t('Delete failed: {message}', { message: err.message }), 'error', 4200);
  }
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

