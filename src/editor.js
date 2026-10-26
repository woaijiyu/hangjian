import CodeMirror from 'codemirror';
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/edit/matchbrackets.js';
import 'codemirror/addon/edit/matchtags.js';
import 'codemirror/addon/edit/closebrackets.js';
import 'codemirror/addon/edit/closetag.js';
import 'codemirror/addon/comment/comment.js';
import 'codemirror/addon/selection/active-line.js';
import 'codemirror/addon/selection/mark-selection.js';
import 'codemirror/addon/fold/foldcode.js';
import 'codemirror/addon/fold/foldgutter.js';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/brace-fold.js';
import 'codemirror/addon/fold/comment-fold.js';
import 'codemirror/addon/fold/indent-fold.js';
import 'codemirror/addon/fold/markdown-fold.js';
import 'codemirror/addon/fold/xml-fold.js';
import 'codemirror/addon/search/searchcursor.js';
import 'codemirror/addon/search/match-highlighter.js';
import 'codemirror/addon/hint/show-hint.js';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/hint/anyword-hint.js';
import 'codemirror/keymap/sublime.js';

import { app, activeTab, persistSettings } from './state.js';
import { registerCommand, runCommand } from './commands.js';
import { languageById, commentTokens } from './modes.js';
import { setFontSize } from './theme.js';
import { infoDialog, toast, focusEditorSoon, promptInput } from './ui.js';
import { formatNumber } from './utils.js';
import { t } from './i18n.js';

const INDENT_SIZES = [2, 4, 6, 8];

export function initEditor() {
  const host = document.getElementById('editor-host');
  const cm = CodeMirror(host, {
    value: '',
    mode: 'text/plain',
    theme: 'lumen',
    lineNumbers: true,
    lineWrapping: Boolean(app.settings.wrap),
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autofocus: false,
    styleActiveLine: { nonEmpty: false },
    matchBrackets: true,
    autoCloseBrackets: true,
    autoCloseTags: true,
    matchTags: { bothTags: true },
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    highlightSelectionMatches: {
      showToken: /[A-Za-z_$][\w$]*/,
      wordsOnly: true,
      delay: 300,
      annotateScrollbar: false
    },
    keyMap: 'sublime',
    scrollbarStyle: 'native',
    cursorBlinkRate: 530,
    viewportMargin: 24,
    extraKeys: {
      Tab: handleTab,
      'Shift-Tab': (instance) => instance.indentSelection('subtract'),
      'Ctrl-D': () => runCommand('edit.selectNext'),
      'Ctrl-Shift-D': () => runCommand('edit.duplicateLine'),
      'Ctrl-Shift-K': () => runCommand('edit.deleteLine'),
      'Ctrl-Shift-Up': () => runCommand('edit.moveLineUp'),
      'Ctrl-Shift-Down': () => runCommand('edit.moveLineDown'),
      'Ctrl-/': () => runCommand('edit.toggleComment'),
      'Ctrl-]': () => runCommand('edit.indent'),
      'Ctrl-[': () => runCommand('edit.outdent'),
      'Ctrl-L': () => runCommand('edit.selectLine'),
      'Alt-F3': () => runCommand('edit.selectAllOccurrences'),
      'Ctrl-Alt-Up': () => runCommand('edit.addCursorUp'),
      'Ctrl-Alt-Down': () => runCommand('edit.addCursorDown'),
      'Ctrl-Enter': () => runCommand('edit.insertLineAfter'),
      'Ctrl-Shift-Enter': () => runCommand('edit.insertLineBefore'),
      'Ctrl-J': () => runCommand('edit.joinLines'),
      'Ctrl-Space': (instance) => {
        instance.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false });
      },
      'Ctrl-F': () => runCommand('find.open'),
      'Ctrl-H': () => runCommand('find.replace'),
      'Ctrl-G': () => runCommand('goto.line'),
      'Alt-Z': () => runCommand('view.wrap'),
      Escape: (instance) => {
        if (instance.listSelections().length > 1) instance.execCommand('singleSelectionTop');
      }
    }
  });

  app.cm = cm;
  const wrapper = cm.getWrapperElement();

  wrapper.addEventListener('mousedown', (event) => {
    if (!event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    const pos = cm.coordsChar({ left: event.clientX, top: event.clientY }, 'window');
    const ranges = cm.listSelections();
    ranges.push({ anchor: pos, head: pos });
    cm.setSelections(ranges, ranges.length - 1);
    cm.focus();
  });

  wrapper.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setFontSize(app.settings.fontSize + (event.deltaY < 0 ? 1 : -1));
    },
    { passive: false }
  );

  cm.on('changes', () => {
    const tab = activeTab();
    if (!tab) return;
    app.hooks.updateTabDirty?.(tab);
    app.hooks.editorChanged?.(tab);
    app.hooks.scheduleSession?.();
  });

  cm.on('cursorActivity', () => {
    const tab = activeTab();
    if (tab) {
      tab.cursor = cm.getCursor();
      tab.selection = cm.listSelections();
    }
    updateStatus();
    syncWindowTitle();
  });

  cm.on('scroll', () => {
    const tab = activeTab();
    if (tab) {
      const info = cm.getScrollInfo();
      tab.scroll = { left: info.left, top: info.top };
    }
    app.hooks.syncMinimap?.();
  });

  updateStatus();
  registerEditorCommands();
}

function handleTab(cm) {
  if (cm.somethingSelected()) {
    cm.indentSelection('add');
    return;
  }
  const unit = cm.getOption('indentUnit') || 4;
  const text = cm.getOption('indentWithTabs') ? '\t' : ' '.repeat(unit);
  cm.replaceSelection(text, 'end', '+input');
}

export function createDoc(text, languageId = 'plain') {
  const language = languageById(languageId);
  return new CodeMirror.Doc(String(text ?? ''), language.mode);
}

export function applyTab(tab) {
  const cm = app.cm;
  if (!cm) return;
  cm.swapDoc(tab.doc);
  const language = languageById(tab.language);
  cm.setOption('mode', language.mode);
  cm.setOption('lineWrapping', Boolean(app.settings.wrap));
  cm.setOption('indentUnit', tab.indentSize || 4);
  cm.setOption('tabSize', tab.indentSize || 4);
  cm.setOption('indentWithTabs', Boolean(tab.useTabs));
  const tokens = commentTokens(tab.language) || {};
  cm.setOption('lineComment', tokens.lineComment || null);
  cm.setOption('blockCommentStart', tokens.blockCommentStart || null);
  cm.setOption('blockCommentEnd', tokens.blockCommentEnd || null);

  if (tab.selection && tab.selection.length) {
    try {
      cm.setSelections(tab.selection);
    } catch {
      cm.setCursor(tab.cursor || { line: 0, ch: 0 });
    }
  } else {
    cm.setCursor(tab.cursor || { line: 0, ch: 0 });
  }
  const scroll = tab.scroll || { left: 0, top: 0 };
  cm.scrollTo(scroll.left || 0, scroll.top || 0);
  updateStatus();
  syncWindowTitle();
  requestAnimationFrame(() => {
    cm.refresh();
    app.hooks.syncMinimap?.();
  });
}

export function updateStatus() {
  const tab = activeTab();
  const cm = app.cm;
  const posEl = document.getElementById('status-pos');
  const selEl = document.getElementById('status-sel');
  const cursorsEl = document.getElementById('status-cursors');
  const wrapEl = document.getElementById('status-wrap');
  const indentEl = document.getElementById('status-indent');
  const encodingEl = document.getElementById('status-encoding');
  const eolEl = document.getElementById('status-eol');
  const langEl = document.getElementById('status-lang');
  if (!posEl || !selEl || !cursorsEl || !indentEl || !encodingEl || !eolEl || !langEl) return;

  if (wrapEl) wrapEl.classList.toggle('hidden', !app.settings.wrap);

  if (!tab || !cm) {
    posEl.textContent = t('Ln 1, Col 1');
    selEl.hidden = true;
    cursorsEl.hidden = true;
    indentEl.textContent = t('Spaces: 4');
    encodingEl.textContent = 'UTF-8';
    eolEl.textContent = 'LF';
    langEl.textContent = t('Plain Text');
    return;
  }

  const cursor = cm.getCursor('head');
  const selection = cm.getSelection();
  const ranges = cm.listSelections();
  posEl.textContent = t('Ln {line}, Col {col}', { line: cursor.line + 1, col: cursor.ch + 1 });
  if (selection.length > 0) {
    const lineCount = cm.getSelection().split('\n').length;
    selEl.hidden = false;
    selEl.textContent = lineCount > 1
      ? t('{count} sel · {lines} lines', { count: formatNumber(selection.length), lines: lineCount })
      : t('{count} sel', { count: formatNumber(selection.length) });
  } else {
    selEl.hidden = true;
  }
  if (ranges.length > 1) {
    cursorsEl.hidden = false;
    cursorsEl.textContent = t('{count} cursors', { count: ranges.length });
  } else {
    cursorsEl.hidden = true;
  }
  indentEl.textContent = tab.useTabs
    ? t('Tabs: {count}', { count: tab.indentSize || 4 })
    : t('Spaces: {count}', { count: tab.indentSize || 4 });
  encodingEl.textContent = encodingLabel(tab);
  eolEl.textContent = tab.eol === 'Mixed' ? t('Mixed') : tab.eol;
  langEl.textContent = t(languageById(tab.language).label);
}

const ENCODING_LABELS = {
  ansi: 'ANSI',
  utf8: 'UTF-8',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  gb18030: 'GB18030',
  gbk: 'GBK',
  gb2312: 'GB2312',
  big5: 'Big5',
  shift_jis: 'Shift-JIS',
  'euc-jp': 'EUC-JP',
  'euc-kr': 'EUC-KR',
  latin1: 'ISO-8859-1',
  'windows-1252': 'Windows-1252',
  'windows-1251': 'Windows-1251'
};

export function encodingLabel(tab) {
  if (!tab) return 'UTF-8';
  if (tab.encoding === 'utf8' && tab.bom) return 'UTF-8 BOM';
  return ENCODING_LABELS[tab.encoding] || String(tab.encoding || 'UTF-8').toUpperCase();
}

export function syncWindowTitle() {
  const el = document.getElementById('window-title-text');
  if (!el) return;
  const appName = t('Interline');
  const tab = activeTab();
  if (!tab) {
    el.textContent = appName;
    document.title = appName;
    return;
  }
  const dirty = Boolean(tab.forcedDirty) || !tab.doc.isClean(tab.cleanGen);
  el.textContent = `${dirty ? '● ' : ''}${tab.name} — ${appName}`;
  el.parentElement.title = tab.path || tab.name;
  document.title = `${dirty ? '● ' : ''}${tab.name} — ${appName}`;
}

export function setTabLanguage(tab, languageId) {
  const language = languageById(languageId);
  tab.language = language.id;
  if (tab.id === app.activeId && app.cm) {
    app.cm.setOption('mode', language.mode);
    const tokens = commentTokens(language.id) || {};
    app.cm.setOption('lineComment', tokens.lineComment || null);
    app.cm.setOption('blockCommentStart', tokens.blockCommentStart || null);
    app.cm.setOption('blockCommentEnd', tokens.blockCommentEnd || null);
  }
  updateStatus();
  app.hooks.updateTabDirty?.(tab);
  app.hooks.renderOpenFiles?.();
  app.hooks.scheduleSession?.();
}

export function setWrap(enabled, { persist = true } = {}) {
  app.settings.wrap = Boolean(enabled);
  if (persist) persistSettings({ wrap: app.settings.wrap });
  app.cm?.setOption('lineWrapping', app.settings.wrap);
  updateStatus();
  app.hooks.scheduleSession?.();
}

export function goToLine(lineNumber, ch = 0) {
  const cm = app.cm;
  if (!cm) return;
  const line = Math.max(0, Math.min(cm.lineCount() - 1, Number(lineNumber) - 1 || 0));
  cm.setCursor({ line, ch: Math.max(0, ch) });
  cm.centerOn(line, Math.max(0, ch));
  cm.focus();
  updateStatus();
}

export function getStatistics() {
  const cm = app.cm;
  const tab = activeTab();
  if (!cm || !tab) return null;
  const text = cm.getValue();
  const selection = cm.getSelection();
  const lines = cm.lineCount();
  const words = (text.match(/[A-Za-z0-9_'\u00c0-\u024f]+/g) || []).length;
  return {
    file: tab.path || tab.name,
    lines,
    words,
    chars: text.length,
    charsNoSpaces: text.replace(/\s/g, '').length,
    selected: selection.length,
    selectedLines: selection ? selection.split('\n').length : 0,
    encoding: encodingLabel(tab),
    eol: tab.eol
  };
}

function wordAtCursor(cm) {
  const cursor = cm.getCursor();
  const line = cm.getLine(cursor.line) || '';
  let start = cursor.ch;
  let end = cursor.ch;
  while (start > 0 && /[\w$]/.test(line[start - 1])) start--;
  while (end < line.length && /[\w$]/.test(line[end])) end++;
  return { start, end };
}

function rangeBounds(range) {
  const forward = CodeMirror.cmpPos(range.anchor, range.head) <= 0;
  return {
    from: forward ? range.anchor : range.head,
    to: forward ? range.head : range.anchor
  };
}

function transformSelections(cm, transform) {
  if (!cm) return;
  const ordered = cm
    .listSelections()
    .map(rangeBounds)
    .sort((a, b) => CodeMirror.cmpPos(b.to, a.to));
  cm.operation(() => {
    for (const range of ordered) {
      if (CodeMirror.cmpPos(range.from, range.to) === 0) {
        const word = wordAtCursor(cm);
        if (word.start === word.end) continue;
        const from = { line: range.from.line, ch: word.start };
        const to = { line: range.from.line, ch: word.end };
        cm.replaceRange(transform(cm.getRange(from, to)), from, to);
        continue;
      }
      cm.replaceRange(transform(cm.getRange(range.from, range.to)), range.from, range.to);
    }
  });
}

function trimTrailingWhitespace(cm) {
  if (!cm) return;
  const ranges = cm.listSelections();
  let targets = ranges.map(rangeBounds);
  if (targets.every((range) => CodeMirror.cmpPos(range.from, range.to) === 0)) {
    targets = [{ from: { line: 0, ch: 0 }, to: { line: cm.lineCount() - 1 } }];
  }
  let changed = 0;
  cm.operation(() => {
    for (const range of targets) {
      const lastLine = Math.min(cm.lineCount() - 1, range.to.line);
      for (let line = range.from.line; line <= lastLine; line++) {
        const text = cm.getLine(line);
        const trimmed = text.replace(/[ \t]+$/, '');
        if (trimmed === text) continue;
        const from = { line, ch: trimmed.length };
        const to = { line, ch: text.length };
        if (line === range.to.line && range.to.ch < to.ch) {
          const cut = Math.min(to.ch, Math.max(from.ch, range.to.ch));
          if (cut >= to.ch) continue;
          cm.replaceRange('', { line, ch: Math.max(cut, from.ch) }, to);
        } else {
          cm.replaceRange('', from, to);
        }
        changed++;
      }
    }
  });
  if (changed) {
    toast(
      changed === 1
        ? t('Trimmed trailing whitespace on {count} line', { count: changed })
        : t('Trimmed trailing whitespace on {count} lines', { count: changed }),
      'info',
      1800
    );
  } else {
    toast(t('No trailing whitespace found'), 'info', 1600);
  }
}

function showStatistics() {
  const stats = getStatistics();
  if (!stats) return;
  const rows = [
    [t('File'), stats.file],
    [t('Lines'), formatNumber(stats.lines)],
    [t('Words'), formatNumber(stats.words)],
    [t('Characters'), formatNumber(stats.chars)],
    [t('Characters (no spaces)'), formatNumber(stats.charsNoSpaces)],
    [t('Selected'), stats.selected ? formatNumber(stats.selected) : '—'],
    [t('Encoding'), stats.encoding],
    [t('Line endings'), stats.eol === 'Mixed' ? t('Mixed') : stats.eol]
  ];
  const html = `<dl class="stats-grid">${rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('')}</dl>`;
  infoDialog({ title: t('File Statistics'), content: html });
}

function toggleLineEnding(eol) {
  const tab = activeTab();
  if (!tab) return;
  tab.eol = eol;
  tab.forcedDirty = true;
  app.hooks.updateTabDirty?.(tab);
  app.hooks.scheduleSession?.();
  updateStatus();
  const label = eol === 'Mixed' ? t('Mixed (saved as LF)') : eol;
  toast(t('Line endings set to {eol}', { eol: label }), 'info', 1600);
}

function addCursor(direction) {
  const cm = app.cm;
  if (!cm) return;
  const selections = cm.listSelections();
  const last = selections[selections.length - 1];
  const cursor = last.head;
  const line = cursor.line + direction;
  if (line < 0 || line >= cm.lineCount()) return;
  const target = CodeMirror.Pos(line, cursor.ch);
  const next = selections.concat([{ anchor: target, head: target }]);
  cm.setSelections(next, next.length - 1);
  cm.focus();
}

async function copySelection() {
  const cm = app.cm;
  if (!cm) return;
  const text = cm.getSelection();
  if (!text) return;
  try {
    await app.api?.clipboard.writeText(text);
  } catch (err) {
    toast(t('Copy failed: {message}', { message: err.message }), 'error');
  }
}

async function cutSelection() {
  const cm = app.cm;
  if (!cm) return;
  const text = cm.getSelection();
  if (!text) return;
  try {
    await app.api?.clipboard.writeText(text);
    cm.replaceSelection('');
    cm.focus();
  } catch (err) {
    toast(t('Cut failed: {message}', { message: err.message }), 'error');
  }
}

async function pasteClipboard() {
  const cm = app.cm;
  if (!cm) return;
  try {
    const text = await app.api.clipboard.readText();
    if (typeof text !== 'string' || !text) return;
    cm.replaceSelection(text, 'end');
    cm.focus();
  } catch (err) {
    toast(t('Paste failed: {message}', { message: err.message }), 'error');
  }
}

function registerEditorCommands() {
  const register = (definition) =>
    registerCommand({ scope: 'editor', palette: true, ...definition });

  register({
    id: 'edit.undo',
    label: 'Undo',
    accel: 'Ctrl+Z',
    run: () => app.cm?.undo()
  });
  register({
    id: 'edit.redo',
    label: 'Redo',
    accel: 'Ctrl+Y',
    run: () => app.cm?.redo()
  });
  register({
    id: 'edit.cut',
    label: 'Cut',
    accel: 'Ctrl+X',
    run: () => cutSelection()
  });
  register({
    id: 'edit.copy',
    label: 'Copy',
    accel: 'Ctrl+C',
    run: () => copySelection()
  });
  register({
    id: 'edit.paste',
    label: 'Paste',
    accel: 'Ctrl+V',
    run: () => pasteClipboard()
  });
  register({
    id: 'edit.selectAll',
    label: 'Select All',
    accel: 'Ctrl+A',
    run: () => app.cm?.execCommand('selectAll')
  });
  register({
    id: 'edit.duplicateLine',
    label: 'Duplicate Line',
    accel: 'Ctrl+Shift+D',
    run: () => app.cm?.execCommand('duplicateLine')
  });
  register({
    id: 'edit.deleteLine',
    label: 'Delete Line',
    accel: 'Ctrl+Shift+K',
    run: () => app.cm?.execCommand('deleteLine')
  });
  register({
    id: 'edit.joinLines',
    label: 'Join Lines',
    accel: 'Ctrl+J',
    run: () => app.cm?.execCommand('joinLines')
  });
  register({
    id: 'edit.moveLineUp',
    label: 'Move Line Up',
    accel: 'Ctrl+Shift+Up',
    run: () => app.cm?.execCommand('swapLineUp')
  });
  register({
    id: 'edit.moveLineDown',
    label: 'Move Line Down',
    accel: 'Ctrl+Shift+Down',
    run: () => app.cm?.execCommand('swapLineDown')
  });
  register({
    id: 'edit.insertLineBefore',
    label: 'Insert Line Before',
    accel: 'Ctrl+Shift+Enter',
    run: () => app.cm?.execCommand('insertLineBefore')
  });
  register({
    id: 'edit.insertLineAfter',
    label: 'Insert Line After',
    accel: 'Ctrl+Enter',
    run: () => app.cm?.execCommand('insertLineAfter')
  });
  register({
    id: 'edit.toggleComment',
    label: 'Toggle Comment',
    accel: 'Ctrl+/',
    run: () => app.cm?.execCommand('toggleCommentIndented')
  });
  register({
    id: 'edit.indent',
    label: 'Indent Selection',
    accel: 'Ctrl+]',
    run: () => app.cm?.indentSelection('add')
  });
  register({
    id: 'edit.outdent',
    label: 'Outdent Selection',
    accel: 'Ctrl+[',
    run: () => app.cm?.indentSelection('subtract')
  });
  register({
    id: 'edit.selectLine',
    label: 'Select Line',
    accel: 'Ctrl+L',
    run: () => app.cm?.execCommand('selectLine')
  });
  register({
    id: 'edit.selectNext',
    label: 'Select Next Occurrence',
    accel: 'Ctrl+D',
    run: () => app.cm?.execCommand('selectNextOccurrence')
  });
  register({
    id: 'edit.selectAllOccurrences',
    label: 'Select All Occurrences',
    accel: 'Alt+F3',
    run: () => app.cm?.execCommand('findAllUnder')
  });
  register({
    id: 'edit.addCursorUp',
    label: 'Add Cursor Above',
    accel: 'Ctrl+Alt+Up',
    run: () => addCursor(-1)
  });
  register({
    id: 'edit.addCursorDown',
    label: 'Add Cursor Below',
    accel: 'Ctrl+Alt+Down',
    run: () => addCursor(1)
  });
  register({
    id: 'edit.caseUpper',
    label: 'Convert to Uppercase',
    run: () => transformSelections(app.cm, (text) => text.toUpperCase())
  });
  register({
    id: 'edit.caseLower',
    label: 'Convert to Lowercase',
    run: () => transformSelections(app.cm, (text) => text.toLowerCase())
  });
  register({
    id: 'edit.caseTitle',
    label: 'Convert to Title Case',
    run: () =>
      transformSelections(app.cm, (text) =>
        text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      )
  });
  register({
    id: 'edit.sortLines',
    label: 'Sort Lines',
    accel: 'F9',
    run: () => app.cm?.execCommand('sortLinesInsensitive')
  });
  register({
    id: 'edit.sortLinesDesc',
    label: 'Sort Lines (Descending)',
    accel: 'Shift+F9',
    run: () => app.cm?.execCommand('reverseSortLinesInsensitive')
  });
  register({
    id: 'edit.trimWhitespace',
    label: 'Trim Trailing Whitespace',
    run: () => trimTrailingWhitespace(app.cm)
  });
  register({
    id: 'edit.eolLf',
    label: 'Line Endings: LF',
    palette: false,
    run: () => toggleLineEnding('LF')
  });
  register({
    id: 'edit.eolCrlf',
    label: 'Line Endings: CRLF',
    palette: false,
    run: () => toggleLineEnding('CRLF')
  });
  register({
    id: 'edit.eolMixed',
    label: 'Line Endings: Mixed',
    palette: false,
    run: () => toggleLineEnding('Mixed')
  });
  register({
    id: 'edit.fold',
    label: 'Fold Selection',
    accel: 'Ctrl+Shift+[',
    run: () => app.cm?.execCommand('fold')
  });
  register({
    id: 'edit.unfold',
    label: 'Unfold',
    accel: 'Ctrl+Shift+]',
    run: () => app.cm?.execCommand('unfold')
  });
  register({
    id: 'edit.foldAll',
    label: 'Fold All',
    run: () => app.cm?.execCommand('foldAll')
  });
  register({
    id: 'edit.unfoldAll',
    label: 'Unfold All',
    run: () => app.cm?.execCommand('unfoldAll')
  });
  register({
    id: 'edit.gotoBracket',
    label: 'Go to Matching Bracket',
    run: () => app.cm?.execCommand('goToBracket')
  });
  register({
    id: 'edit.showHint',
    label: 'Word Completion',
    accel: 'Ctrl+Space',
    run: () => app.cm?.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false })
  });
  register({
    id: 'goto.line',
    label: 'Go to Line…',
    accel: 'Ctrl+G',
    capture: true,
    run: async () => {
      const value = await promptInput({
        title: t('Go to Line'),
        label: t('Line number'),
        value: String((app.cm?.getCursor().line || 0) + 1),
        confirmText: t('Go')
      });
      if (!value) return;
      const line = parseInt(value, 10);
      if (!Number.isFinite(line)) {
        toast(t('Enter a valid line number'), 'warning');
        return;
      }
      goToLine(line);
    }
  });
  register({
    id: 'view.wrap',
    label: 'Toggle Word Wrap',
    accel: 'Alt+Z',
    capture: true,
    checked: () => app.settings.wrap,
    run: () => setWrap(!app.settings.wrap)
  });
  register({
    id: 'view.zoomIn',
    label: 'Increase Font Size',
    accel: 'Ctrl+=',
    capture: true,
    run: () => setFontSize(app.settings.fontSize + 1)
  });
  register({
    id: 'view.zoomOut',
    label: 'Decrease Font Size',
    accel: 'Ctrl+-',
    capture: true,
    run: () => setFontSize(app.settings.fontSize - 1)
  });
  register({
    id: 'view.zoomReset',
    label: 'Reset Font Size',
    accel: 'Ctrl+0',
    capture: true,
    run: () => setFontSize(13)
  });
  register({
    id: 'view.setFontSize',
    label: 'Set Font Size…',
    run: async () => {
      const value = await promptInput({
        title: t('Editor Font Size'),
        label: t('Size in pixels'),
        value: String(app.settings.fontSize),
        confirmText: t('Apply')
      });
      if (!value) return;
      const size = parseInt(value, 10);
      if (!Number.isFinite(size) || size < 9 || size > 28) {
        toast(t('Choose a size between 9 and 28'), 'warning');
        return;
      }
      setFontSize(size);
    }
  });
  register({
    id: 'view.setFontSizeExact',
    label: 'Set Font Size',
    palette: false,
    run: (size) => setFontSize(size)
  });
  register({
    id: 'view.statistics',
    label: 'File Statistics…',
    run: showStatistics
  });
  register({
    id: 'editor.focus',
    label: 'Focus Editor',
    palette: false,
    run: () => focusEditorSoon()
  });
}

export { INDENT_SIZES };
