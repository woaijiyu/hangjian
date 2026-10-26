import { app, activeTab, persistSettings } from './state.js';
import { getCommand, registerCommand, runCommand, formatAccel } from './commands.js';
import { THEMES, applyTheme } from './theme.js';
import { LANGUAGES } from './modes.js';
import { icons } from './icons.js';
import { escapeHtml, basename, dirname, clamp } from './utils.js';
import { infoDialog, toast } from './ui.js';
import { encodingLabel } from './editor.js';
import { setTabEncoding, reopenWithEncoding } from './files.js';
import { t, currentLanguage, setLanguage } from './i18n.js';

let openPanels = [];
let activeMenuButton = null;
let keyHandler = null;
let submenuTimer = null;
const appMenus = new Map();

const ENCODING_GROUPS = [
  {
    label: 'Unicode',
    options: [
      { label: 'UTF-8', encoding: 'utf8', bom: false },
      { label: 'UTF-8 with BOM', encoding: 'utf8', bom: true },
      { label: 'UTF-16 LE', encoding: 'utf16le', bom: true },
      { label: 'UTF-16 BE', encoding: 'utf16be', bom: true }
    ]
  },
  {
    label: 'Chinese',
    options: [
      { label: 'GB18030', encoding: 'gb18030', bom: false },
      { label: 'GBK', encoding: 'gbk', bom: false },
      { label: 'GB2312', encoding: 'gb2312', bom: false },
      { label: 'Big5', encoding: 'big5', bom: false }
    ]
  },
  {
    label: 'Japanese / Korean',
    options: [
      { label: 'Shift-JIS', encoding: 'shift_jis', bom: false },
      { label: 'EUC-JP', encoding: 'euc-jp', bom: false },
      { label: 'EUC-KR', encoding: 'euc-kr', bom: false }
    ]
  },
  {
    label: 'Western',
    options: [
      { label: 'ISO-8859-1', encoding: 'latin1', bom: false },
      { label: 'Windows-1252', encoding: 'windows-1252', bom: false },
      { label: 'Windows-1251', encoding: 'windows-1251', bom: false }
    ]
  }
];

export function initMenus() {
  const menubar = document.getElementById('menubar');
  if (!menubar) return;

  const menus = [
    { label: 'File', build: fileMenu },
    { label: 'Edit', build: editMenu },
    { label: 'Selection', build: selectionMenu },
    { label: 'View', build: viewMenu },
    { label: 'Go', build: goMenu },
    { label: 'Help', build: helpMenu }
  ];

  menubar.innerHTML = '';
  appMenus.clear();
  menus.forEach((menu) => {
    const button = document.createElement('button');
    button.className = 'menu-button';
    button.textContent = t(menu.label);
    button.dataset.menu = menu.label;
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', () => {
      if (button.classList.contains('open')) {
        closeMenus();
        return;
      }
      closeMenus();
      openMenubarMenu(button, menu.build());
    });
    button.addEventListener('mouseenter', () => {
      if (!activeMenuButton || activeMenuButton === button) return;
      closeMenus();
      openMenubarMenu(button, menu.build());
    });
    menubar.appendChild(button);
    appMenus.set(menu.label, { button, build: menu.build });
  });

  document.getElementById('brand')?.addEventListener('click', showAbout);
  document.addEventListener('mousedown', (event) => {
    if (!openPanels.length) return;
    if (event.button !== 0) return;
    if (event.target.closest('#dropdown-layer, .menu-button, #brand')) return;
    closeMenus();
  });
  window.addEventListener('blur', closeMenus);
  window.addEventListener('resize', closeMenus);

  registerMenusCommands();
}

function openMenubarMenu(button, items) {
  activeMenuButton = button;
  button.classList.add('open');
  const rect = button.getBoundingClientRect();
  openPanel(items, { x: rect.left, y: rect.bottom + 3, context: false });
}

export function showMenu(items, { x = 0, y = 0, anchorRect = null, preferAbove = false } = {}) {
  closeMenus();
  openPanel(items, { x, y, anchorRect, preferAbove, context: true });
}

export function openAppMenu(label = 'File') {
  const entry = appMenus.get(label);
  if (!entry) return;
  closeMenus();
  openMenubarMenu(entry.button, entry.build());
}

export function refreshMenus() {
  closeMenus({ restoreFocus: false });
  for (const [label, entry] of appMenus) {
    entry.button.textContent = t(label);
  }
}

export function openStatusMenu(kind, anchorEl) {
  const tab = activeTab();
  let items = [];
  if (kind === 'language') {
    items = LANGUAGES.map((language) => ({
      label: t(language.label),
      checked: tab ? tab.language === language.id : false,
      disabled: !tab,
      run: () => runCommand('language.set', language.id)
    }));
  } else if (kind === 'encoding') {
    items = encodingMenuItems(tab);
  } else if (kind === 'eol') {
    items = [
      { label: t('LF (Unix)'), checked: tab?.eol === 'LF', disabled: !tab, run: () => runCommand('edit.eolLf') },
      { label: t('CRLF (Windows)'), checked: tab?.eol === 'CRLF', disabled: !tab, run: () => runCommand('edit.eolCrlf') },
      { label: t('Mixed'), checked: tab?.eol === 'Mixed', disabled: !tab, run: () => runCommand('edit.eolMixed') }
    ];
  } else if (kind === 'indent') {
    items = [
      { type: 'heading', label: t('Indent Using Spaces') },
      ...[2, 4, 6, 8].map((size) => ({
        label: t('{count} spaces', { count: size }),
        checked: tab ? !tab.useTabs && tab.indentSize === size : size === 4,
        disabled: !tab,
        run: () => runCommand('indent.set', size, false)
      })),
      { type: 'separator' },
      { type: 'heading', label: t('Indent Using Tabs') },
      ...[2, 4, 6, 8].map((size) => ({
        label: t('Tab width {size}', { size }),
        checked: tab ? tab.useTabs && tab.indentSize === size : false,
        disabled: !tab,
        run: () => runCommand('indent.set', size, true)
      }))
    ];
  }

  const rect = anchorEl.getBoundingClientRect();
  showMenu(items, { x: rect.left, y: rect.top, anchorRect: rect, preferAbove: true });
}

function cmd(id, overrides = {}) {
  const command = getCommand(id);
  if (!command) return { label: id, disabled: true };
  return {
    label: t(command.label),
    accel: formatAccel(command.accel),
    checked: command.checked ? command.checked() : false,
    disabled: command.enabled ? !command.enabled() : false,
    run: () => runCommand(id),
    ...overrides
  };
}

function fileMenu() {
  const recent = app.settings.recent || [];
  return [
    cmd('file.new', { icon: 'plus' }),
    cmd('file.open', { icon: 'folder' }),
    cmd('file.openFolder', { icon: 'folderOpen' }),
    {
      label: t('Open Recent'),
      icon: 'refresh',
      submenu: recent.length
        ? [
            ...recent.map((filePath) => ({
              label: basename(filePath),
              detail: dirname(filePath),
              iconHtml: `<span class="file-icon cat-slate">${icons.file}</span>`,
              run: () => runCommand('file.openRecent', filePath)
            })),
            { type: 'separator' },
            {
              label: t('Clear Recent Files'),
              icon: 'trash',
              run: () => {
                app.settings.recent = [];
                persistSettings({ recent: [] });
                toast(t('Recent files cleared'), 'info', 1600);
              }
            }
          ]
        : [{ label: t('No recent files'), disabled: true }]
    },
    { type: 'separator' },
    cmd('file.save'),
    cmd('file.saveAs'),
    cmd('file.saveAll'),
    { type: 'separator' },
    cmd('file.close'),
    cmd('file.closeOthers'),
    cmd('file.closeAll'),
    cmd('file.reopen'),
    { type: 'separator' },
    cmd('file.rename'),
    cmd('file.copyPath', { icon: 'copy' }),
    cmd('file.reveal', { icon: 'reveal' }),
    { type: 'separator' },
    cmd('file.exit')
  ];
}

function editMenu() {
  const tab = activeTab();
  return [
    cmd('edit.undo'),
    cmd('edit.redo'),
    { type: 'separator' },
    cmd('edit.cut'),
    cmd('edit.copy'),
    cmd('edit.paste'),
    { type: 'separator' },
    cmd('edit.duplicateLine'),
    cmd('edit.deleteLine'),
    cmd('edit.joinLines'),
    cmd('edit.moveLineUp'),
    cmd('edit.moveLineDown'),
    cmd('edit.insertLineBefore'),
    cmd('edit.insertLineAfter'),
    cmd('edit.toggleComment'),
    { type: 'separator' },
    {
      label: t('Line Endings'),
      submenu: [
        { label: t('LF (Unix)'), checked: tab?.eol === 'LF', run: () => runCommand('edit.eolLf') },
        { label: t('CRLF (Windows)'), checked: tab?.eol === 'CRLF', run: () => runCommand('edit.eolCrlf') },
        { label: t('Mixed'), checked: tab?.eol === 'Mixed', run: () => runCommand('edit.eolMixed') }
      ]
    },
    {
      label: t('Encoding'),
      submenu: encodingMenuItems(tab)
    },
    {
      label: t('Case'),
      submenu: [
        cmd('edit.caseUpper'),
        cmd('edit.caseLower'),
        cmd('edit.caseTitle')
      ]
    },
    {
      label: t('Sort Lines'),
      submenu: [cmd('edit.sortLines'), cmd('edit.sortLinesDesc')]
    },
    cmd('edit.trimWhitespace'),
    { type: 'separator' },
    cmd('edit.selectAll'),
    { type: 'separator' },
    cmd('view.statistics')
  ];
}

function encodingGroupItems(tab, action) {
  return ENCODING_GROUPS.map((group) => ({
    label: t(group.label),
    disabled: !tab,
    submenu: group.options.map((option) => ({
      label: option.label,
      checked:
        action === 'save' && tab
          ? tab.encoding === option.encoding && Boolean(tab.bom) === Boolean(option.bom)
          : false,
      disabled: !tab,
      run: () =>
        action === 'reopen'
          ? reopenWithEncoding(tab, option.encoding)
          : setTabEncoding(tab, option.encoding, option.bom)
    }))
  }));
}

function ansiItem(tab, action) {
  const ansi = app.info.ansi || {};
  const name = ansi.encoding ? encodingLabel({ encoding: ansi.encoding, bom: false }) : 'ANSI';
  return {
    label: 'ANSI',
    detail: ansi.codepage ? `${name} · CP${ansi.codepage}` : '',
    checked: tab ? tab.encoding === 'ansi' : false,
    disabled: !tab,
    run: () =>
      action === 'reopen' ? reopenWithEncoding(tab, 'ansi') : setTabEncoding(tab, 'ansi', false)
  };
}

function encodingMenuItems(tab) {
  return [
    { type: 'heading', label: t('Save with Encoding') },
    ansiItem(tab, 'save'),
    { type: 'separator' },
    ...encodingGroupItems(tab, 'save'),
    { type: 'separator' },
    { type: 'heading', label: t('Reopen with Encoding') },
    ansiItem(tab, 'reopen'),
    { type: 'separator' },
    ...encodingGroupItems(tab, 'reopen')
  ];
}

function selectionMenu() {
  return [
    cmd('edit.selectLine'),
    cmd('edit.selectNext'),
    cmd('edit.selectAllOccurrences'),
    { type: 'separator' },
    cmd('edit.addCursorUp'),
    cmd('edit.addCursorDown'),
    { type: 'separator' },
    cmd('edit.selectAll'),
    { type: 'separator' },
    cmd('edit.caseUpper'),
    cmd('edit.caseLower'),
    cmd('edit.caseTitle')
  ];
}

function viewMenu() {
  const tab = activeTab();
  return [
    cmd('palette.files'),
    cmd('palette.commands'),
    { type: 'separator' },
    cmd('view.toggleSidebar'),
    cmd('view.toggleMinimap'),
    cmd('view.wrap'),
    { type: 'separator' },
    {
      label: t('Theme'),
      submenu: THEMES.map((theme) => ({
        label: t(theme.label),
        checked: app.settings.theme === theme.id,
        run: () => applyTheme(theme.id, { persist: !app.noPersist })
      }))
    },
    {
      label: t('Language'),
      submenu: [
        {
          label: '中文',
          checked: currentLanguage() === 'zh',
          run: () => setLanguage('zh', { persist: !app.noPersist })
        },
        {
          label: 'English',
          checked: currentLanguage() === 'en',
          run: () => setLanguage('en', { persist: !app.noPersist })
        }
      ]
    },
    {
      label: t('Syntax'),
      submenu: LANGUAGES.map((language) => ({
        label: t(language.label),
        checked: tab ? tab.language === language.id : false,
        disabled: !tab,
        run: () => runCommand('language.set', language.id)
      }))
    },
    {
      label: t('Indentation'),
      submenu: [
        ...[2, 4, 6, 8].map((size) => ({
          label: t('{count} Spaces', { count: size }),
          checked: tab ? !tab.useTabs && tab.indentSize === size : false,
          run: () => runCommand('indent.set', size, false)
        })),
        { type: 'separator' },
        ...[2, 4, 6, 8].map((size) => ({
          label: t('Tabs (Width {size})', { size }),
          checked: tab ? tab.useTabs && tab.indentSize === size : false,
          run: () => runCommand('indent.set', size, true)
        }))
      ]
    },
    {
      label: t('Font Size'),
      submenu: [
        cmd('view.zoomIn'),
        cmd('view.zoomOut'),
        cmd('view.zoomReset'),
        { type: 'separator' },
        ...[10, 11, 12, 13, 14, 16, 18, 20].map((size) => ({
          label: t('{size} px', { size }),
          checked: app.settings.fontSize === size,
          run: () => runCommand('view.setFontSizeExact', size)
        }))
      ]
    },
    { type: 'separator' },
    cmd('view.toggleFullscreen'),
    cmd('view.devtools'),
    { type: 'separator' },
    cmd('view.statistics')
  ];
}

function goMenu() {
  return [
    cmd('goto.line'),
    { type: 'separator' },
    cmd('find.open'),
    cmd('find.replace'),
    cmd('find.inFiles'),
    { type: 'separator' },
    cmd('tab.next'),
    cmd('tab.prev'),
    { type: 'separator' },
    cmd('palette.files'),
    cmd('palette.commands')
  ];
}

function helpMenu() {
  return [
    cmd('help.shortcuts'),
    { type: 'separator' },
    cmd('help.about')
  ];
}

function openPanel(items, { x, y, anchorRect = null, preferAbove = false, context = true }) {
  const layer = document.getElementById('dropdown-layer');
  if (!layer) return;
  const panel = document.createElement('div');
  panel.className = 'dropdown';
  panel.dataset.context = context ? '1' : '0';
  panel.style.visibility = 'hidden';
  panel.style.left = '0px';
  panel.style.top = '0px';
  panel.style.maxHeight = 'calc(100vh - 20px)';
  panel.style.overflowY = 'auto';

  items.forEach((item, index) => {
    if (item.type === 'separator') {
      const sep = document.createElement('div');
      sep.className = 'menu-separator';
      panel.appendChild(sep);
      return;
    }
    if (item.type === 'heading') {
      const heading = document.createElement('div');
      heading.className = 'menu-heading';
      heading.textContent = item.label;
      panel.appendChild(heading);
      return;
    }
    const el = document.createElement('button');
    el.className = 'menu-item';
    if (item.disabled) el.classList.add('disabled');
    if (item.danger) el.classList.add('danger');
    el.dataset.index = String(index);
    el.addEventListener('mousedown', (event) => event.preventDefault());
    el.innerHTML = `
      <span class="menu-check">${item.checked ? icons.check : ''}</span>
      ${item.icon || item.iconHtml ? `<span class="menu-item-icon">${item.iconHtml || icons[item.icon] || ''}</span>` : ''}
      <span class="menu-label">${escapeHtml(item.label || '')}</span>
      ${item.detail ? `<span class="menu-detail">${escapeHtml(item.detail)}</span>` : ''}
      ${item.submenu ? `<span class="menu-arrow">${icons.chevronRight}</span>` : item.accel ? `<span class="menu-accel">${escapeHtml(item.accel)}</span>` : ''}
    `;
    if (!item.disabled) {
      el.addEventListener('mouseenter', () => {
        setActivePanelItem(panel, index);
        clearTimeout(submenuTimer);
        if (item.submenu) {
          submenuTimer = setTimeout(() => openSubmenu(panel, index, item, el), 110);
        } else {
          closeSubmenusAfter(panel);
        }
      });
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        if (item.submenu) {
          openSubmenu(panel, index, item, el);
          return;
        }
        closeMenus();
        item.run?.();
      });
    }
    panel.appendChild(el);
  });

  layer.appendChild(panel);

  const above = preferAbove && anchorRect;
  panel.style.visibility = '';
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  let left = x;
  let top = y;
  if (above) {
    top = anchorRect.top - height - 3;
    left = anchorRect.left;
  } else if (anchorRect) {
    top = anchorRect.bottom + 3;
    left = anchorRect.left;
  }
  left = clamp(left, 6, Math.max(6, window.innerWidth - width - 8));
  top = clamp(top, 6, Math.max(6, window.innerHeight - height - 8));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

  openPanels.push({ el: panel, items, activeIndex: -1, anchorEl: null });
  bindMenuKeys();
  return panel;
}

function openSubmenu(parentPanel, index, item, itemEl) {
  const panelIndex = openPanels.findIndex((entry) => entry.el === parentPanel);
  if (panelIndex < 0) return;
  const existing = openPanels[panelIndex + 1];
  if (existing && existing.anchorEl === itemEl) return;
  openPanels.splice(panelIndex + 1).forEach((entry) => entry.el.remove());

  const rect = itemEl.getBoundingClientRect();
  const panel = openPanel(item.submenu, {
    x: rect.right - 3,
    y: rect.top - 5,
    context: false
  });
  const entry = openPanels[openPanels.length - 1];
  entry.anchorEl = itemEl;
  const width = panel.offsetWidth;
  let left = rect.right - 3;
  if (left + width > window.innerWidth - 8) left = rect.left - width + 3;
  left = clamp(left, 6, Math.max(6, window.innerWidth - width - 8));
  panel.style.left = `${left}px`;
  setActivePanelItem(parentPanel, index);
}

function closeSubmenusAfter(panel) {
  const idx = openPanels.findIndex((entry) => entry.el === panel);
  if (idx < 0) return;
  openPanels.splice(idx + 1).forEach((entry) => entry.el.remove());
}

function setActivePanelItem(panel, index) {
  const entry = openPanels.find((item) => item.el === panel);
  if (!entry) return;
  entry.activeIndex = index;
  panel.querySelectorAll('.menu-item.active').forEach((el) => el.classList.remove('active'));
  const el = panel.querySelector(`.menu-item[data-index="${index}"]`);
  if (el) {
    el.classList.add('active');
    el.scrollIntoView({ block: 'nearest' });
  }
}

function activeEntries(panel) {
  return Array.from(panel.querySelectorAll('.menu-item:not(.disabled)'));
}

function bindMenuKeys() {
  if (keyHandler) return;
  keyHandler = (event) => {
    if (!openPanels.length) {
      unbindMenuKeys();
      return;
    }
    const top = openPanels[openPanels.length - 1];
    const entries = activeEntries(top.el);
    if (!entries.length && !['Escape'].includes(event.key)) return;
    const currentIndex = entries.findIndex((el) => el.classList.contains('active'));
    const move = (delta) => {
      if (!entries.length) return;
      const next = currentIndex < 0
        ? delta > 0 ? 0 : entries.length - 1
        : (currentIndex + delta + entries.length) % entries.length;
      setActivePanelItem(top.el, Number(entries[next].dataset.index));
    };
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      move(-entries.length);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      move(entries.length);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentIndex >= 0) {
        const item = top.items[Number(entries[currentIndex].dataset.index)];
        if (item?.submenu) openSubmenu(top.el, Number(entries[currentIndex].dataset.index), item, entries[currentIndex]);
      }
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (openPanels.length > 1) {
        const closed = openPanels.pop();
        closed.el.remove();
        const parentEntry = openPanels[openPanels.length - 1];
        const activeEl = parentEntry.el.querySelector('.menu-item.active');
        if (activeEl) activeEl.focus?.();
      } else {
        closeMenus();
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (currentIndex < 0) return;
      event.preventDefault();
      entries[currentIndex].click();
    }
  };
  document.addEventListener('keydown', keyHandler, true);
}

function unbindMenuKeys() {
  if (!keyHandler) return;
  document.removeEventListener('keydown', keyHandler, true);
  keyHandler = null;
}

export function closeMenus({ restoreFocus = true } = {}) {
  clearTimeout(submenuTimer);
  const hadPanels = openPanels.length > 0;
  for (const panel of openPanels) panel.el.remove();
  openPanels = [];
  activeMenuButton?.classList.remove('open');
  activeMenuButton = null;
  unbindMenuKeys();
  if (hadPanels && restoreFocus) {
    requestAnimationFrame(() => {
      if (app.modalOpen || app.paletteOpen) return;
      const active = document.activeElement;
      if (active && active.closest && (active.closest('#findbar') || active.closest('#modal-layer') || active.closest('#palette-overlay'))) {
        return;
      }
      app.cm?.focus();
    });
  }
}

function registerMenusCommands() {
  const register = (definition) =>
    registerCommand({ scope: 'global', palette: false, ...definition });

  register({
    id: 'view.toggleFullscreen',
    label: 'Toggle Full Screen',
    accel: 'F11',
    capture: true,
    run: () => app.api.window.toggleFullscreen()
  });
  register({
    id: 'view.devtools',
    label: 'Toggle Developer Tools',
    accel: 'F12',
    capture: true,
    run: () => app.api.window.toggleDevtools()
  });
  register({
    id: 'help.shortcuts',
    label: 'Keyboard Shortcuts',
    run: showShortcuts
  });
  register({
    id: 'help.about',
    label: 'About Interline',
    run: showAbout
  });
  register({
    id: 'view.toggleLanguage',
    label: 'Switch Language (Chinese/English)',
    palette: true,
    run: () => {
      const next = currentLanguage() === 'zh' ? 'en' : 'zh';
      setLanguage(next, { persist: !app.noPersist });
      toast(t('Language switched'), 'success', 1600);
    }
  });
}

function showAbout() {
  const platform = app.info.platform === 'win32' ? 'Windows' : app.info.platform;
  const html = `
    <div class="about-wrap">
      <div class="about-logo">${icons.logo}</div>
      <div class="about-name">${escapeHtml(t('Interline').toUpperCase())}</div>
      <div class="about-version">${escapeHtml(t('Version {version} · Electron {electron}', { version: app.info.version || '1.0.0', electron: app.info.electron || '' }))}</div>
      <p class="about-desc">${escapeHtml(t('A fast, keyboard-driven text and code editor inspired by Sublime Text. Built with Electron and CodeMirror.'))}</p>
      <div class="about-version">${escapeHtml(platform)} · Chromium ${escapeHtml(app.info.chrome || '')}</div>
    </div>`;
  infoDialog({ title: t('About Interline'), content: html, width: 'normal' });
}

function showShortcuts() {
  const groups = [
    {
      title: t('Files & Tabs'),
      rows: [
        [t('New file'), 'Ctrl+N'],
        [t('Open file'), 'Ctrl+O'],
        [t('Open folder'), 'Ctrl+Shift+O'],
        [t('Save'), 'Ctrl+S'],
        [t('Save as'), 'Ctrl+Shift+S'],
        [t('Close tab'), 'Ctrl+W'],
        [t('Reopen closed tab'), 'Ctrl+Shift+T'],
        [t('Next tab'), 'Ctrl+Tab'],
        [t('Previous tab'), 'Ctrl+Shift+Tab'],
        [t('Go to file'), 'Ctrl+P'],
        [t('Command palette'), 'Ctrl+Shift+P']
      ]
    },
    {
      title: t('Editing'),
      rows: [
        [t('Select next occurrence'), 'Ctrl+D'],
        [t('Select all occurrences'), 'Alt+F3'],
        [t('Add cursor above / below'), 'Ctrl+Alt+↑ / ↓'],
        [t('Duplicate line'), 'Ctrl+Shift+D'],
        [t('Delete line'), 'Ctrl+Shift+K'],
        [t('Move line up / down'), 'Ctrl+Shift+↑ / ↓'],
        [t('Toggle comment'), 'Ctrl+/'],
        [t('Join lines'), 'Ctrl+J'],
        [t('Trim trailing whitespace'), t('Menu: Edit')],
        [t('Word completion'), 'Ctrl+Space']
      ]
    },
    {
      title: t('Search & Navigation'),
      rows: [
        [t('Find'), 'Ctrl+F'],
        [t('Replace'), 'Ctrl+H'],
        [t('Find in files'), 'Ctrl+Shift+F'],
        [t('Find next / previous'), 'F3 / Shift+F3'],
        [t('Go to line'), 'Ctrl+G'],
        [t('Fold / unfold'), 'Ctrl+Shift+[ / ]']
      ]
    },
    {
      title: t('View'),
      rows: [
        [t('Toggle sidebar'), 'Ctrl+B'],
        [t('Toggle word wrap'), 'Alt+Z'],
        [t('Zoom in / out'), 'Ctrl+= / Ctrl+-'],
        [t('Reset zoom'), 'Ctrl+0'],
        [t('Full screen'), 'F11'],
        [t('Developer tools'), 'F12']
      ]
    },
    {
      title: t('Mouse'),
      rows: [
        [t('Add cursor'), 'Ctrl + Click'],
        [t('Zoom with wheel'), 'Ctrl + Wheel'],
        [t('Close tab'), 'Middle click']
      ]
    }
  ];
  const html = groups
    .map(
      (group) => `
      <div class="shortcut-group">${escapeHtml(group.title)}</div>
      <div class="shortcuts-list">
        ${group.rows
          .map(
            ([name, keys]) =>
              `<div class="shortcut-row"><span class="shortcut-name">${escapeHtml(name)}</span><kbd>${escapeHtml(keys)}</kbd></div>`
          )
          .join('')}
      </div>`
    )
    .join('');
  infoDialog({ title: t('Keyboard Shortcuts'), content: html, width: 'wide' });
}
