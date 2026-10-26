import { app, activeTab } from './state.js';
import { registerCommand } from './commands.js';
import { escapeRegExp } from './utils.js';
import { toast } from './ui.js';
import { t } from './i18n.js';

const state = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  matches: [],
  total: 0,
  currentIndex: -1,
  marks: [],
  currentMark: null,
  matcher: null,
  error: null
};

let searchTimer = null;
let changeTimer = null;
let refreshLanguageImpl = null;

export function initFind() {
  const bar = document.getElementById('findbar');
  if (!bar) return;
  const findInput = document.getElementById('find-input');
  const replaceInput = document.getElementById('replace-input');
  const count = document.getElementById('find-count');
  const prev = document.getElementById('find-prev');
  const next = document.getElementById('find-next');
  const caseBtn = document.getElementById('find-case');
  const wordBtn = document.getElementById('find-word');
  const regexBtn = document.getElementById('find-regex');
  const replaceToggle = document.getElementById('find-replace-toggle');
  const closeBtn = document.getElementById('find-close');
  const replaceRow = document.getElementById('replace-row');
  const replaceOne = document.getElementById('replace-one');
  const replaceAll = document.getElementById('replace-all');
  const replaceStatus = document.getElementById('replace-status');

  const scheduleSearch = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = findInput.value;
      runSearch({ preserveCurrent: false });
    }, 90);
  };

  findInput.addEventListener('input', scheduleSearch);
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) findNext(-1);
      else findNext(1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });
  replaceInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceCurrent();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeFind();
    }
  });

  prev.addEventListener('click', () => findNext(-1));
  next.addEventListener('click', () => findNext(1));
  closeBtn.addEventListener('click', () => closeFind());

  const toggleOption = (button, key) => {
    state[key] = !state[key];
    button.classList.toggle('on', state[key]);
    runSearch({ preserveCurrent: false });
    findInput.focus();
  };
  caseBtn.addEventListener('click', () => toggleOption(caseBtn, 'caseSensitive'));
  wordBtn.addEventListener('click', () => toggleOption(wordBtn, 'wholeWord'));
  regexBtn.addEventListener('click', () => toggleOption(regexBtn, 'regex'));

  replaceToggle.addEventListener('click', () => {
    const open = replaceRow.classList.contains('hidden');
    replaceRow.classList.toggle('hidden', !open);
    bar.classList.toggle('replace-open', open);
    if (open) replaceInput.focus();
  });

  replaceOne.addEventListener('click', () => replaceCurrent());
  replaceAll.addEventListener('click', () => replaceAllMatches());

  bar.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeFind();
    }
  });

  app.cm?.on('changes', () => {
    if (!app.findOpen) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => runSearch({ preserveCurrent: true }), 160);
  });
  app.cm?.on('swapDoc', () => {
    if (app.findOpen) runSearch({ preserveCurrent: false });
  });

  registerFindCommands();
  updateToggleUi();
  refreshLanguageImpl = () => {
    updateToggleUi();
    renderCount();
  };

  function updateToggleUi() {
    caseBtn.classList.toggle('on', state.caseSensitive);
    wordBtn.classList.toggle('on', state.wholeWord);
    regexBtn.classList.toggle('on', state.regex);
  }

  function currentSelectionText() {
    const cm = app.cm;
    if (!cm) return '';
    const selection = cm.getSelection();
    return selection && !selection.includes('\n') ? selection : '';
  }

  function buildMatcher() {
    state.error = null;
    if (!state.query) return null;
    let source = state.regex ? state.query : escapeRegExp(state.query);
    if (state.wholeWord) source = `(?<![\\w$])${source}(?![\\w$])`;
    try {
      return new RegExp(source, state.caseSensitive ? 'g' : 'gi');
    } catch (err) {
      state.error = err.message;
      return null;
    }
  }

  function clearMarks() {
    for (const mark of state.marks) mark.clear();
    state.marks = [];
    state.currentMark?.clear();
    state.currentMark = null;
  }

  function renderCount() {
    if (!state.query) {
      count.textContent = '';
      count.classList.remove('error');
      findInput.classList.remove('invalid');
      replaceStatus.textContent = '';
      return;
    }
    if (state.error) {
      count.textContent = t('Invalid regex');
      count.classList.add('error');
      findInput.classList.add('invalid');
      replaceStatus.textContent = '';
      return;
    }
    count.classList.remove('error');
    findInput.classList.remove('invalid');
    if (!state.matches.length) {
      count.textContent = t('No results');
      count.classList.add('error');
    } else {
      const plus = state.total > state.matches.length ? '+' : '';
      count.textContent = `${t('{current} of {total}', { current: state.currentIndex + 1, total: state.total })}${plus}`;
    }
    replaceStatus.textContent = '';
  }

  function setCurrent(index, { reveal = true, select = true } = {}) {
    const cm = app.cm;
    if (!cm || !state.matches.length) {
      state.currentIndex = -1;
      state.currentMark?.clear();
      state.currentMark = null;
      renderCount();
      return;
    }
    state.currentIndex = ((index % state.matches.length) + state.matches.length) % state.matches.length;
    const match = state.matches[state.currentIndex];
    state.currentMark?.clear();
    state.currentMark = cm.markText(match.from, match.to, { className: 'cm-find-current' });
    if (select) cm.setSelection(match.from, match.to, { scroll: false });
    if (reveal) cm.scrollIntoView({ from: match.from, to: match.to }, 90);
    renderCount();
  }

  function runSearch({ preserveCurrent = false } = {}) {
    const cm = app.cm;
    clearMarks();
    state.matches = [];
    state.total = 0;
    state.matcher = buildMatcher();
    if (!cm || !state.query || !state.matcher) {
      state.currentIndex = -1;
      renderCount();
      return;
    }
    const text = cm.getValue();
    const regex = state.matcher;
    regex.lastIndex = 0;
    const matches = [];
    let total = 0;
    let match;
    const limit = 5000;
    while ((match = regex.exec(text)) !== null && total < 20000) {
      total++;
      if (matches.length < limit) {
        const length = match[0].length;
        const from = cm.posFromIndex(match.index);
        const to = cm.posFromIndex(match.index + Math.max(length, 1));
        matches.push({ from, to });
      }
      if (match[0].length === 0) regex.lastIndex++;
    }
    state.matches = matches;
    state.total = total;
    findInput.classList.toggle('invalid', Boolean(state.error));

    if (!matches.length) {
      state.currentIndex = -1;
      renderCount();
      return;
    }

    const markLimit = 1200;
    state.marks = matches
      .slice(0, markLimit)
      .map((item) => cm.markText(item.from, item.to, { className: 'cm-find-match' }));

    let index = -1;
    if (preserveCurrent && state.currentIndex >= 0) {
      index = Math.min(state.currentIndex, matches.length - 1);
    } else {
      const cursor = cm.indexFromPos(cm.getCursor('head'));
      index = matches.findIndex((item) => {
        const from = cm.indexFromPos(item.from);
        const to = cm.indexFromPos(item.to);
        return cursor >= from && cursor <= to;
      });
      if (index < 0) {
        index = matches.findIndex((item) => cm.indexFromPos(item.from) >= cursor);
      }
      if (index < 0) index = 0;
    }
    setCurrent(index, { reveal: Boolean(app.findOpen), select: true });
  }

  function findNext(direction = 1) {
    if (!app.findOpen) {
      openFind({ focus: false });
      return;
    }
    if (!state.matches.length) {
      runSearch({ preserveCurrent: false });
      return;
    }
    setCurrent(state.currentIndex + direction, { reveal: true, select: true });
    findInput.focus();
  }

  function replacementFor(matchedText) {
    if (!state.regex) return replaceInput.value;
    try {
      const source = state.matcher?.source || state.query;
      const flags = state.caseSensitive ? '' : 'i';
      return matchedText.replace(new RegExp(source, flags), replaceInput.value);
    } catch {
      return replaceInput.value;
    }
  }

  function replaceCurrent() {
    const cm = app.cm;
    if (!cm) return;
    if (!state.query) {
      state.query = findInput.value;
      runSearch({ preserveCurrent: false });
    }
    if (!state.matches.length) {
      renderCount();
      return;
    }
    if (state.currentIndex < 0) setCurrent(0);
    const match = state.matches[state.currentIndex];
    if (!match) return;
    const matchedText = cm.getRange(match.from, match.to);
    const replacement = replacementFor(matchedText);
    const cursorBefore = state.currentIndex;
    clearMarks();
    cm.replaceRange(replacement, match.from, match.to);
    runSearch({ preserveCurrent: false });
    if (state.matches.length) {
      setCurrent(Math.min(cursorBefore, state.matches.length - 1), { reveal: true, select: true });
    }
    replaceStatus.textContent = t('Replaced 1');
    setTimeout(() => {
      if (replaceStatus.textContent === t('Replaced 1')) replaceStatus.textContent = '';
    }, 1800);
    findInput.focus();
  }

  function replaceAllMatches() {
    const cm = app.cm;
    if (!cm) return;
    if (!state.query) {
      state.query = findInput.value;
      runSearch({ preserveCurrent: false });
    }
    if (!state.matcher || !state.matches.length) return;
    const regex = state.matcher;
    const text = cm.getValue();
    regex.lastIndex = 0;
    let count = 0;
    const replacement = replaceInput.value;
    const nextText = text.replace(regex, (matched) => {
      count++;
      return replacementFor(matched);
    });
    if (!count) return;
    clearMarks();
    const end = cm.posFromIndex(text.length);
    cm.operation(() => {
      cm.replaceRange(nextText, { line: 0, ch: 0 }, end);
    });
    state.query = findInput.value;
    runSearch({ preserveCurrent: false });
    toast(
      count === 1
        ? t('Replaced {count} occurrence', { count })
        : t('Replaced {count} occurrences', { count }),
      'success',
      2200
    );
    findInput.focus();
  }

  function openFind({ replace = false, focus = true } = {}) {
    const selection = currentSelectionText();
    if (selection) findInput.value = selection;
    state.query = findInput.value;
    if (replace) {
      replaceRow.classList.remove('hidden');
      bar.classList.add('replace-open');
    }
    app.findOpen = true;
    bar.classList.remove('hidden');
    runSearch({ preserveCurrent: false });
    if (focus) {
      findInput.focus();
      findInput.select();
    }
  }

  function closeFind() {
    app.findOpen = false;
    document.getElementById('findbar')?.classList.add('hidden');
    clearMarks();
    state.currentIndex = -1;
    count.textContent = '';
    count.classList.remove('error');
    findInput.classList.remove('invalid');
    replaceStatus.textContent = '';
    app.cm?.focus();
  }

  function registerFindCommands() {
    const register = (definition) =>
      registerCommand({ scope: 'global', palette: true, ...definition });
    register({
      id: 'find.open',
      label: 'Find',
      accel: 'Ctrl+F',
      capture: true,
      run: () => openFind()
    });
    register({
      id: 'find.replace',
      label: 'Replace',
      accel: 'Ctrl+H',
      capture: true,
      run: () => openFind({ replace: true })
    });
    register({
      id: 'find.next',
      label: 'Find Next',
      accel: 'F3',
      capture: true,
      run: () => findNext(1)
    });
    register({
      id: 'find.prev',
      label: 'Find Previous',
      accel: 'Shift+F3',
      capture: true,
      run: () => findNext(-1)
    });
    register({
      id: 'find.close',
      label: 'Close Find Bar',
      palette: false,
      run: () => closeFind()
    });
  }

  // Expose the panel controller to the palette for context-aware prefilling.
  window.__interlineFind = { openFind, closeFind };
}

export function focusFindInput() {
  window.__interlineFind?.openFind();
}

export function refreshFindLanguage() {
  refreshLanguageImpl?.();
}

export function currentFindQuery() {
  return state.query;
}
