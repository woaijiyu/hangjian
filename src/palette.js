import { app, normalizePath } from './state.js';
import { registerCommand, allCommands, runCommand, formatAccel } from './commands.js';
import { icons, categoryFor } from './icons.js';
import { escapeHtml, highlightIndices, fuzzyMatch, basename, dirname } from './utils.js';
import { openPath, activateTab } from './files.js';
import { goToLine } from './editor.js';
import { t } from './i18n.js';

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', '.next', '.nuxt', '.cache',
  '.svelte-kit', 'target', 'obj', 'bin', 'coverage', '__pycache__', '.venv', 'venv',
  '.idea', '.vs', '.gradle'
]);

let overlay = null;
let input = null;
let listEl = null;
let modeEl = null;
let defaultMode = 'files';
let mode = 'files';
let items = [];
let selectedIndex = 0;
let fileIndex = null;
let indexPromise = null;
let indexToken = 0;

export function initPalette() {
  overlay = document.getElementById('palette-overlay');
  input = document.getElementById('palette-input');
  listEl = document.getElementById('palette-list');
  modeEl = document.getElementById('palette-mode');
  if (!overlay || !input || !listEl) return;

  input.addEventListener('input', update);
  input.addEventListener('keydown', onKeyDown);
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) closePalette();
  });
  listEl.addEventListener('click', (event) => {
    const itemEl = event.target.closest('.palette-item');
    if (!itemEl) return;
    const item = items[Number(itemEl.dataset.index)];
    if (item) activateItem(item);
  });
  listEl.addEventListener('mousemove', (event) => {
    const itemEl = event.target.closest('.palette-item');
    if (!itemEl) return;
    const index = Number(itemEl.dataset.index);
    if (Number.isFinite(index) && index !== selectedIndex) select(index);
  });

  registerCommand({
    id: 'palette.files',
    label: 'Go to File…',
    accel: 'Ctrl+P',
    capture: true,
    run: () => openPalette('files')
  });
  registerCommand({
    id: 'palette.commands',
    label: 'Command Palette…',
    accel: 'Ctrl+Shift+P',
    capture: true,
    run: () => openPalette('commands')
  });
}

export function openPalette(initialMode = 'files') {
  if (!overlay) return;
  defaultMode = initialMode;
  mode = initialMode;
  app.paletteOpen = true;
  overlay.classList.remove('hidden');
  input.value = '';
  input.placeholder = initialMode === 'commands' ? t('Search commands…') : t('Go to file…');
  selectedIndex = 0;
  update();
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

export function closePalette({ focus = true } = {}) {
  if (!overlay || !app.paletteOpen) return;
  overlay.classList.add('hidden');
  app.paletteOpen = false;
  items = [];
  if (focus) {
    requestAnimationFrame(() => {
      if (app.modalOpen) return;
      const active = document.activeElement;
      const inFind = active && active.closest && active.closest('#findbar');
      if (inFind || (active && active.closest && active.closest('#palette-overlay'))) return;
      if (!active || active === document.body) app.cm?.focus();
    });
  }
}

function queryInfo() {
  const value = input.value;
  if (value.startsWith('>')) return { mode: 'commands', query: value.slice(1).trim() };
  if (value.startsWith(':')) return { mode: 'line', query: value.slice(1).trim() };
  return { mode: defaultMode, query: value.trim() };
}

function update() {
  const info = queryInfo();
  mode = info.mode;
  if (modeEl) modeEl.textContent = mode === 'commands' ? t('Commands') : mode === 'line' ? t('Go to Line') : t('Files');
  if (input) {
    input.placeholder = mode === 'commands'
      ? t('Search commands…')
      : mode === 'line'
        ? t('Go to line…')
        : t('Go to file…');
  }
  if (mode === 'line') {
    items = lineItems(info.query);
  } else if (mode === 'commands') {
    items = commandItems(info.query);
  } else {
    items = fileItems(info.query);
    hydrateFileIndex();
  }
  selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
  renderList();
}

function lineItems(query) {
  const line = parseInt(query, 10);
  if (!Number.isFinite(line) || line < 1) {
    return [{ kind: 'empty', label: t('Type a line number and press Enter') }];
  }
  return [
    {
      kind: 'line',
      line,
      label: t('Go to line {line}', { line }),
      detail: t('{line} of {count}', { line, count: app.cm?.lineCount() || 0 }),
      icon: 'command',
      run: () => goToLine(line)
    }
  ];
}

function commandItems(query) {
  const commands = allCommands()
    .filter((command) => command.palette !== false)
    .filter((command) => !command.enabled || command.enabled())
    .map((command) => ({ command, label: t(command.label) }));

  if (!query) {
    return commands
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 120)
      .map(({ command, label }) => ({
        kind: 'command',
        label,
        detail: command.id,
        accel: formatAccel(command.accel),
        icon: 'command',
        run: () => runCommand(command.id)
      }));
  }

  const scored = [];
  for (const entry of commands) {
    const translatedMatch = fuzzyMatch(query, entry.label);
    const sourceMatch = translatedMatch ? null : fuzzyMatch(query, entry.command.label);
    const match = translatedMatch || sourceMatch;
    if (!match) continue;
    scored.push({
      entry,
      translatedMatch,
      score: match.score + (entry.command.accel ? 6 : 0)
    });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));
  return scored.slice(0, 100).map(({ entry, translatedMatch }) => ({
    kind: 'command',
    label: entry.label,
    labelHtml: translatedMatch
      ? highlightIndices(entry.label, translatedMatch.indices)
      : escapeHtml(entry.label),
    detail: entry.command.id,
    accel: formatAccel(entry.command.accel),
    icon: 'command',
    run: () => runCommand(entry.command.id)
  }));
}

function fileItems(query) {
  const seen = new Set();
  const candidates = [];

  for (const tab of app.tabs) {
    const key = tab.path ? normalizePath(tab.path) : `untitled:${tab.id}`;
    seen.add(key);
    candidates.push({
      kind: 'file',
      label: tab.name,
      detail: tab.path ? dirname(tab.path) : t('Unsaved buffer'),
      matchText: tab.path ? `${tab.name} ${tab.path}` : tab.name,
      base: 1000,
      iconName: tab.name,
      run: () => activateTab(tab)
    });
  }

  for (const filePath of app.settings.recent || []) {
    const key = normalizePath(filePath);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      kind: 'file',
      label: basename(filePath),
      detail: dirname(filePath),
      matchText: filePath,
      base: 320,
      iconName: basename(filePath),
      run: () => openPath(filePath)
    });
  }

  if (fileIndex && app.folder && fileIndex.folder === app.folder) {
    for (const file of fileIndex.files) {
      const key = normalizePath(file.path);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        kind: 'file',
        label: file.rel,
        detail: dirname(file.rel),
        matchText: file.rel,
        base: 0,
        iconName: basename(file.rel),
        run: () => openPath(file.path)
      });
    }
  }

  if (!query) {
    return candidates
      .sort((a, b) => b.base - a.base)
      .slice(0, 80)
      .map((item) => ({ ...item, labelHtml: escapeHtml(item.label) }));
  }

  const scored = [];
  for (const item of candidates) {
    const labelMatch = fuzzyMatch(query, item.label);
    const match = labelMatch || fuzzyMatch(query, item.matchText);
    if (!match) continue;
    scored.push({
      ...item,
      score: match.score + item.base,
      labelHtml: labelMatch ? highlightIndices(item.label, labelMatch.indices) : escapeHtml(item.label)
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 100);
}

async function hydrateFileIndex() {
  if (!app.folder) return;
  if (fileIndex && fileIndex.folder === app.folder) return;
  if (indexPromise) return;
  const token = ++indexToken;
  const folder = app.folder;
  indexPromise = buildFileIndex(folder)
    .then((files) => {
      if (token !== indexToken || app.folder !== folder) return;
      fileIndex = { folder, files, time: Date.now() };
    })
    .catch(() => {})
    .finally(() => {
      indexPromise = null;
      if (app.paletteOpen && mode === 'files') update();
    });
}

async function buildFileIndex(folder) {
  const files = [];
  const queue = [{ dir: folder, depth: 0, rel: '' }];
  let dirs = 0;
  while (queue.length && files.length < 4000 && dirs < 700) {
    const current = queue.shift();
    let entries;
    try {
      entries = await app.api.fs.readDir(current.dir);
    } catch {
      continue;
    }
    dirs++;
    for (const entry of entries) {
      const rel = current.rel ? `${current.rel}/${entry.name}` : entry.name;
      if (entry.isDir) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (current.depth < 8) queue.push({ dir: entry.path, depth: current.depth + 1, rel });
      } else {
        files.push({ path: entry.path, rel });
        if (files.length >= 4000) break;
      }
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return files;
}

export function invalidatePaletteIndex() {
  indexToken++;
  fileIndex = null;
  indexPromise = null;
}

function renderList() {
  if (!listEl) return;
  if (!items.length) {
    const message = mode === 'commands'
      ? t('No matching commands')
      : mode === 'line'
        ? t('Type a line number')
        : app.folder
          ? t('No matching files')
          : t('No files — open a folder to browse project files');
    listEl.innerHTML = `<div class="palette-empty">${escapeHtml(message)}</div>`;
    return;
  }
  listEl.innerHTML = items
    .map((item, index) => {
      const active = index === selectedIndex ? ' active' : '';
      const iconMarkup = item.icon === 'command' || !item.iconName
        ? icons[item.icon] || icons.file
        : `<span class="file-icon cat-${categoryFor(item.iconName)}">${icons.file}</span>`;
      return `
        <div class="palette-item${active}" data-index="${index}">
          <span class="palette-item-icon">${iconMarkup}</span>
          <span class="palette-item-label">${item.labelHtml || escapeHtml(item.label)}</span>
          ${item.detail ? `<span class="palette-item-detail">${escapeHtml(item.detail)}</span>` : ''}
          ${item.accel ? `<span class="palette-item-accel">${escapeHtml(item.accel)}</span>` : ''}
        </div>`;
    })
    .join('');
  const activeEl = listEl.querySelector('.palette-item.active');
  activeEl?.scrollIntoView({ block: 'nearest' });
}

function select(index) {
  if (!items.length) return;
  selectedIndex = (index + items.length) % items.length;
  listEl.querySelectorAll('.palette-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.index) === selectedIndex);
  });
  listEl.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
}

function activateItem(item) {
  if (!item || item.kind === 'empty') return;
  closePalette({ focus: false });
  item.run?.();
  requestAnimationFrame(() => {
    if (app.modalOpen || app.paletteOpen) return;
    const active = document.activeElement;
    if (!active || active === document.body) app.cm?.focus();
  });
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closePalette();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    select(selectedIndex + 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    select(selectedIndex - 1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = items[selectedIndex];
    if (item) activateItem(item);
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    select(0);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    select(items.length - 1);
  }
}

export function isPaletteOpen() {
  return Boolean(app.paletteOpen);
}

export function refreshPalette() {
  if (app.paletteOpen) update();
}
