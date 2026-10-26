import { app, activeTab, tabById, scheduleSessionSave } from './state.js';
import { icons, categoryFor } from './icons.js';
import {
  activateTab,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  closeAllTabs,
  isTabDirty,
  copyTabPath,
  saveTab
} from './files.js';
import { syncWindowTitle } from './editor.js';
import { showMenu } from './menus.js';
import { runCommand } from './commands.js';
import { toast } from './ui.js';
import { t } from './i18n.js';

let dragId = null;

export function initTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;

  tabsEl.addEventListener('mousedown', (event) => {
    if (event.button === 1) event.preventDefault();
  });

  tabsEl.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const el = event.target.closest('.tab');
    if (!el) return;
    event.preventDefault();
    const tab = tabById(Number(el.dataset.id));
    if (tab) closeTab(tab);
  });

  tabsEl.addEventListener('click', (event) => {
    const closeButton = event.target.closest('.tab-close');
    const el = event.target.closest('.tab');
    if (!el) return;
    const tab = tabById(Number(el.dataset.id));
    if (!tab) return;
    if (closeButton) {
      event.stopPropagation();
      closeTab(tab);
      return;
    }
    activateTab(tab);
  });

  tabsEl.addEventListener('contextmenu', (event) => {
    const el = event.target.closest('.tab');
    if (!el) return;
    event.preventDefault();
    const tab = tabById(Number(el.dataset.id));
    if (!tab) return;
    showTabMenu(tab, event.clientX, event.clientY);
  });

  tabsEl.addEventListener('dragstart', (event) => {
    const el = event.target.closest('.tab');
    if (!el) return;
    dragId = Number(el.dataset.id);
    el.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', String(dragId));
    } catch {
      /* ignore */
    }
  });

  tabsEl.addEventListener('dragend', (event) => {
    event.target.closest('.tab')?.classList.remove('dragging');
    dragId = null;
    tabsEl.querySelectorAll('.drop-before, .drop-after').forEach((el) => {
      el.classList.remove('drop-before', 'drop-after');
    });
  });

  tabsEl.addEventListener('dragover', (event) => {
    if (dragId == null) return;
    const el = event.target.closest('.tab');
    if (!el) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    tabsEl.querySelectorAll('.drop-before, .drop-after').forEach((node) => {
      node.classList.remove('drop-before', 'drop-after');
    });
    const rect = el.getBoundingClientRect();
    const before = event.clientX < rect.left + rect.width / 2;
    el.classList.add(before ? 'drop-before' : 'drop-after');
  });

  tabsEl.addEventListener('drop', (event) => {
    if (dragId == null) return;
    event.preventDefault();
    const el = event.target.closest('.tab');
    const dragged = tabById(dragId);
    dragId = null;
    if (!el || !dragged) return;
    const target = tabById(Number(el.dataset.id));
    if (!target || target.id === dragged.id) return;
    const rect = el.getBoundingClientRect();
    const before = event.clientX < rect.left + rect.width / 2;
    const srcIndex = app.tabs.indexOf(dragged);
    if (srcIndex >= 0) app.tabs.splice(srcIndex, 1);
    let targetIndex = app.tabs.indexOf(target);
    if (targetIndex < 0) targetIndex = app.tabs.length;
    app.tabs.splice(before ? targetIndex : targetIndex + 1, 0, dragged);
    renderTabs();
    scheduleSessionSave();
  });

  const fill = document.getElementById('tabsbar-fill');
  fill?.addEventListener('dblclick', () => runCommand('file.new'));
  document.getElementById('tabs')?.addEventListener('dblclick', (event) => {
    if (event.target.closest('.tab')) return;
    runCommand('file.new');
  });
}

export function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  if (!tabsEl) return;
  if (!app.tabs.length) {
    tabsEl.innerHTML = '';
    return;
  }
  tabsEl.innerHTML = app.tabs
    .map((tab) => {
      const active = tab.id === app.activeId;
      const dirty = isTabDirty(tab);
      return `
        <div class="tab${active ? ' active' : ''}" data-id="${tab.id}" role="tab" aria-selected="${active}" draggable="true" title="${escapeAttr(tab.path || tab.name)}">
          <span class="tab-icon file-icon cat-${categoryFor(tab.name)}">${icons.file}</span>
          <span class="tab-name">${escapeAttr(tab.name)}</span>
          <span class="tab-action">
            <span class="tab-dirty${dirty ? '' : ' hidden'}"></span>
            <button class="tab-close" title="${t('Close')}" aria-label="${escapeAttr(t('Close {name}', { name: tab.name }))}">${icons.close}</button>
          </span>
        </div>`;
    })
    .join('');
  const activeEl = tabsEl.querySelector('.tab.active');
  activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

export function updateTabDirty(tab) {
  if (!tab) return;
  const dirty = isTabDirty(tab);
  const el = document.querySelector(`.tab[data-id="${tab.id}"]`);
  if (el) {
    el.querySelector('.tab-dirty')?.classList.toggle('hidden', !dirty);
  }
  app.hooks.updateOpenFileDirty?.(tab);
  syncWindowTitle();
}

function showTabMenu(tab, x, y) {
  const index = app.tabs.indexOf(tab);
  showMenu(
    [
      { label: t('Close'), accel: 'Ctrl+W', run: () => closeTab(tab) },
      { label: t('Close Others'), disabled: app.tabs.length < 2, run: () => closeOtherTabs(tab) },
      {
        label: t('Close to the Right'),
        disabled: index >= app.tabs.length - 1,
        run: () => closeTabsToRight(tab)
      },
      {
        label: t('Close All'),
        disabled: !app.tabs.length,
        run: () => closeAllTabs()
      },
      { type: 'separator' },
      { label: t('Save'), accel: 'Ctrl+S', disabled: !isTabDirty(tab), run: () => saveTab(tab) },
      { label: t('Save As…'), disabled: !tab, run: () => saveTab(tab, { saveAs: true }) },
      { type: 'separator' },
      {
        label: t('Copy Path'),
        icon: 'copy',
        disabled: !tab.path,
        run: async () => {
          const ok = await copyTabPath(tab);
          if (ok) toast(t('Path copied to clipboard'), 'success', 1600);
        }
      },
      {
        label: t('Copy File Name'),
        icon: 'copy',
        run: async () => {
          await app.api.clipboard.writeText(tab.name);
          toast(t('File name copied'), 'success', 1600);
        }
      },
      {
        label: t('Reveal in Explorer'),
        icon: 'reveal',
        disabled: !tab.path,
        run: () => tab.path && app.api.fs.reveal(tab.path)
      }
    ],
    { x, y }
  );
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
