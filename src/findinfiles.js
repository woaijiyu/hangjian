import { app } from './state.js';
import { registerCommand } from './commands.js';
import { showModal, closeModal, toast } from './ui.js';
import { openPath } from './files.js';
import { currentFindQuery } from './find.js';
import { icons } from './icons.js';
import { escapeHtml, basename, formatNumber } from './utils.js';
import { t } from './i18n.js';

let lastOptions = {
  caseSensitive: false,
  wholeWord: false,
  regex: false
};

export function initFindInFiles() {
  registerCommand({
    id: 'find.inFiles',
    label: 'Find in Files…',
    accel: 'Ctrl+Shift+F',
    scope: 'global',
    capture: true,
    run: () => openFindInFiles()
  });
}

export async function openFindInFiles() {
  const selection = app.cm?.getSelection() || '';
  const initialQuery = selection && !selection.includes('\n') ? selection : currentFindQuery() || '';
  let root = app.folder || null;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = `
    <div class="fif-form">
      <div class="fif-row">
        <input id="fif-query" class="text-input" spellcheck="false" autocomplete="off" placeholder="${escapeAttr(t('Search in files…'))}" />
        <button class="btn primary tiny" id="fif-search">${escapeHtml(t('Search'))}</button>
      </div>
      <div class="fif-row">
        <button class="toggle-chip" id="fif-root" title="${escapeAttr(t('Choose a folder to search'))}"></button>
      </div>
      <div class="fif-options">
        <button class="toggle-chip" data-option="caseSensitive">${escapeHtml(t('Match Case'))}</button>
        <button class="toggle-chip" data-option="wholeWord">${escapeHtml(t('Whole Word'))}</button>
        <button class="toggle-chip" data-option="regex">${escapeHtml(t('Regular Expression'))}</button>
      </div>
      <div class="fif-status" id="fif-status"></div>
      <div class="fif-results hidden" id="fif-results"></div>
    </div>
  `;

  const form = wrapper;
  const queryInput = form.querySelector('#fif-query');
  const searchButton = form.querySelector('#fif-search');
  const rootButton = form.querySelector('#fif-root');
  const statusEl = form.querySelector('#fif-status');
  const resultsEl = form.querySelector('#fif-results');

  queryInput.value = initialQuery;
  updateRootButton();
  for (const chip of form.querySelectorAll('.toggle-chip[data-option]')) {
    const option = chip.dataset.option;
    chip.classList.toggle('on', Boolean(lastOptions[option]));
    chip.addEventListener('click', () => {
      lastOptions[option] = !lastOptions[option];
      chip.classList.toggle('on', lastOptions[option]);
    });
  }

  rootButton.addEventListener('click', async () => {
    const folder = await app.api.dialogs.openFolder();
    if (!folder) return;
    root = folder;
    updateRootButton();
  });

  searchButton.addEventListener('click', runSearch);
  queryInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch();
    }
  });

  resultsEl.addEventListener('click', async (event) => {
    const item = event.target.closest('.fif-result');
    if (!item) return;
    const file = item.dataset.path;
    const line = Number(item.dataset.line) || 1;
    const col = Number(item.dataset.col) || 1;
    closeModal('ok');
    await openPath(file, { line, col });
  });

  function updateRootButton() {
    rootButton.innerHTML = `${icons.folder}<span>${root ? escapeHtml(basename(root).toUpperCase()) : escapeHtml(t('CHOOSE FOLDER…'))}</span>`;
    rootButton.title = root || t('Choose a folder to search');
  }

  async function runSearch() {
    const query = queryInput.value;
    if (!root) {
      statusEl.textContent = t('Open a folder to search across files.');
      statusEl.style.color = 'var(--warning)';
      return;
    }
    if (!query.trim()) {
      statusEl.textContent = t('Enter something to search for.');
      statusEl.style.color = 'var(--warning)';
      queryInput.focus();
      return;
    }
    statusEl.style.color = '';
    statusEl.innerHTML = `<span class="fif-spinner"></span>${escapeHtml(t('Searching {name}…', { name: basename(root) }))}`;
    searchButton.disabled = true;
    resultsEl.classList.add('hidden');
    try {
      const result = await app.api.searchInFiles({
        root,
        query,
        caseSensitive: Boolean(lastOptions.caseSensitive),
        wholeWord: Boolean(lastOptions.wholeWord),
        regex: Boolean(lastOptions.regex)
      });
      renderResults(result, query);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.style.color = 'var(--danger)';
    } finally {
      searchButton.disabled = false;
    }
  }

  function renderResults(result, query) {
    const files = new Set(result.results.map((item) => item.file));
    const shown = result.results.slice(0, 400);
    const parts = [];
    parts.push(
      result.results.length === 1
        ? t('{count} result', { count: formatNumber(result.results.length) })
        : t('{count} results', { count: formatNumber(result.results.length) })
    );
    parts.push(
      files.size === 1
        ? t('in {count} file', { count: formatNumber(files.size) })
        : t('in {count} files', { count: formatNumber(files.size) })
    );
    parts.push(t('· scanned {count} in {ms} ms', { count: formatNumber(result.filesScanned), ms: result.elapsedMs }));
    if (result.truncated || result.results.length > shown.length) parts.push(t('· showing first 400'));
    statusEl.textContent = parts.join(' ');
    statusEl.style.color = '';

    if (!shown.length) {
      resultsEl.classList.remove('hidden');
      resultsEl.innerHTML = `<div class="fif-empty">${escapeHtml(t('No matches for "{query}" in {name}.', { query, name: basename(result.root) }))}</div>`;
      return;
    }

    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = shown
      .map((match) => {
        const lineText = match.text || '';
        const start = Math.max(0, Math.min(lineText.length, match.col - 1));
        const end = Math.max(start, Math.min(lineText.length, start + Math.max(1, match.matchLength)));
        const preview =
          escapeHtml(lineText.slice(0, start)) +
          `<mark>${escapeHtml(lineText.slice(start, end))}</mark>` +
          escapeHtml(lineText.slice(end));
        return `
          <div class="fif-result" data-path="${escapeAttr(match.file)}" data-line="${match.line}" data-col="${match.col}" title="${escapeAttr(match.file)}">
            <div class="fif-result-head">
              <span class="tree-icon file-icon cat-slate">${icons.file}</span>
              <span class="fif-result-file">${escapeHtml(match.relPath || basename(match.file))}</span>
              <span class="fif-result-loc">${escapeHtml(t('Ln {line}, Col {col}', { line: match.line, col: match.col }))}</span>
            </div>
            <div class="fif-result-preview">${preview}</div>
          </div>`;
      })
      .join('');
  }

  await showModal({
    title: t('Find in Files'),
    content: wrapper,
    width: 'wide',
    buttons: [{ id: 'close', label: t('Close') }],
    dismissible: true,
    escapeValue: 'close',
    onMount: () => {
      queryInput.focus();
      queryInput.select();
    }
  });
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
