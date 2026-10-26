import { app, persistSettings } from './state.js';

const SUPPORTED = ['zh', 'en'];
const DEFAULT_LANGUAGE = 'zh';

const ZH = {
  /* ------------------------------- Menu bar ------------------------------- */
  File: '文件',
  Edit: '编辑',
  Selection: '选择',
  View: '视图',
  Go: '跳转',
  Help: '帮助',
  Interline: '行间',

  /* ------------------------------- Commands ------------------------------- */
  'New File': '新建文件',
  'Open File…': '打开文件…',
  'Open Folder…': '打开文件夹…',
  Save: '保存',
  'Save As…': '另存为…',
  'Save All': '全部保存',
  'Close Tab': '关闭标签页',
  'Close Other Tabs': '关闭其他标签页',
  'Close All Tabs': '关闭所有标签页',
  'Reopen Closed Tab': '重新打开已关闭的标签页',
  'Rename File…': '重命名文件…',
  'Copy File Path': '复制文件路径',
  'Reveal in Explorer': '在文件资源管理器中显示',
  'Open Recent File': '打开最近的文件',
  Exit: '退出',
  'Next Tab': '下一个标签页',
  'Previous Tab': '上一个标签页',
  'Set Language': '设置语言',
  'Set Indentation': '设置缩进',
  Undo: '撤销',
  Redo: '重做',
  Cut: '剪切',
  Copy: '复制',
  Paste: '粘贴',
  'Select All': '全选',
  'Duplicate Line': '复制当前行',
  'Delete Line': '删除当前行',
  'Join Lines': '合并行',
  'Move Line Up': '上移行',
  'Move Line Down': '下移行',
  'Insert Line Before': '在上方插入行',
  'Insert Line After': '在下方插入行',
  'Toggle Comment': '切换注释',
  'Indent Selection': '增加缩进',
  'Outdent Selection': '减少缩进',
  'Select Line': '选择当前行',
  'Select Next Occurrence': '选择下一个匹配项',
  'Select All Occurrences': '选择所有匹配项',
  'Add Cursor Above': '在上方添加光标',
  'Add Cursor Below': '在下方添加光标',
  'Convert to Uppercase': '转换为大写',
  'Convert to Lowercase': '转换为小写',
  'Convert to Title Case': '转换为词首大写',
  'Sort Lines': '排序行',
  'Sort Lines (Descending)': '排序行（降序）',
  'Trim Trailing Whitespace': '去除行尾空白',
  'Line Endings: LF': '换行符：LF',
  'Line Endings: CRLF': '换行符：CRLF',
  'Line Endings: Mixed': '换行符：混合',
  'Fold Selection': '折叠选区',
  Unfold: '展开折叠',
  'Fold All': '全部折叠',
  'Unfold All': '全部展开',
  'Go to Matching Bracket': '跳转到匹配括号',
  'Word Completion': '单词补全',
  'Go to Line…': '转到行…',
  'Toggle Word Wrap': '切换自动换行',
  'Increase Font Size': '增大字号',
  'Decrease Font Size': '减小字号',
  'Reset Font Size': '重置字号',
  'Set Font Size…': '设置字号…',
  'Set Font Size': '设置字号',
  'File Statistics…': '文件统计…',
  'Focus Editor': '聚焦编辑器',
  'Toggle Full Screen': '切换全屏',
  'Toggle Developer Tools': '切换开发者工具',
  'Keyboard Shortcuts': '键盘快捷键',
  'About Interline': '关于行间',
  'Switch Language': '切换语言',
  'Switch Language (Chinese/English)': '切换语言（中文/英文）',
  'Language switched': '语言已切换',

  /* -------------------------------- Search -------------------------------- */
  'Find': '查找',
  'Replace': '替换',
  'Find Next': '查找下一个',
  'Find Previous': '查找上一个',
  'Close Find Bar': '关闭查找栏',
  'Find in Files…': '在文件中查找…',
  'Go to File…': '转到文件…',
  'Command Palette…': '命令面板…',
  'Toggle Sidebar': '切换侧栏',
  'Toggle Minimap': '切换缩略图',

  /* ------------------------------- Menu items ------------------------------ */
  'Open Recent': '最近打开',
  'Clear Recent Files': '清除最近文件',
  'No recent files': '无最近文件',
  'Recent files cleared': '已清除最近文件',
  'Line Endings': '换行符',
  Encoding: '编码',
  Case: '大小写',
  Theme: '主题',
  Syntax: '语法',
  Indentation: '缩进',
  'Font Size': '字号',
  Language: '语言',
  'Indent Using Spaces': '使用空格缩进',
  'Indent Using Tabs': '使用制表符缩进',
  '{count} spaces': '{count} 个空格',
  'Tab width {size}': '制表符宽度 {size}',
  '{count} Spaces': '{count} 个空格',
  'Tabs (Width {size})': '制表符（宽度 {size}）',
  '{size} px': '{size} 像素',
  current: '当前',
  'UTF-8 with BOM': 'UTF-8（带 BOM）',
  Unicode: 'Unicode',
  Chinese: '中文',
  'Japanese / Korean': '日文 / 韩文',
  Western: '西文',
  'Save with Encoding': '保存编码',
  'Reopen with Encoding': '以指定编码重新打开',
  Reopen: '重新打开',
  'LF (Unix)': 'LF（Unix）',
  'CRLF (Windows)': 'CRLF（Windows）',
  Mixed: '混合',
  'Mixed (saved as LF)': '混合（保存为 LF）',
  'Plain Text': '纯文本',
  'Adaptive Light': '自适应浅色',
  Batch: '批处理',
  Diff: '差异',
  'INI / Properties': 'INI / 属性',

  /* ---------------------------------- Tabs --------------------------------- */
  Close: '关闭',
  'Close {name}': '关闭 {name}',
  'Close Others': '关闭其他标签页',
  'Close to the Right': '关闭右侧标签页',
  'Close All': '全部关闭',
  'Copy File Name': '复制文件名',
  'Path copied to clipboard': '已复制路径到剪贴板',
  'File name copied': '已复制文件名',

  /* -------------------------------- Sidebar -------------------------------- */
  'Open Files': '已打开文件',
  Folders: '文件夹',
  'Browse project files': '浏览项目文件',
  'Open a folder to browse its files': '打开文件夹以浏览其中的文件',
  'NO FOLDER': '未打开文件夹',
  'New Folder': '新建文件夹',
  Refresh: '刷新',
  'Collapse Folders': '折叠文件夹',
  'Resize sidebar': '调整侧栏宽度',
  'Toggle Sidebar (Ctrl+B)': '切换侧栏 (Ctrl+B)',
  'Toggle sidebar': '切换侧栏',
  'Open Folder': '打开文件夹',
  'Folder is empty': '文件夹为空',
  'Open a folder first': '请先打开一个文件夹',
  'Name cannot contain path separators': '名称不能包含路径分隔符',
  'Opened folder {name}': '已打开文件夹 {name}',
  'Could not open folder: {message}': '无法打开文件夹：{message}',
  'Could not create file: {message}': '无法创建文件：{message}',
  'Could not create folder: {message}': '无法创建文件夹：{message}',
  'Renamed to {name}': '已重命名为 {name}',
  'Rename failed: {message}': '重命名失败：{message}',
  'Move "{name}" to the trash?': '将“{name}”移到回收站？',
  'Moved "{name}" to trash': '已将“{name}”移到回收站',
  'Delete failed: {message}': '删除失败：{message}',
  Open: '打开',
  'New File…': '新建文件…',
  'New Folder…': '新建文件夹…',
  'Rename…': '重命名…',
  Delete: '删除',
  'Copy Path': '复制路径',
  'Close Folder': '关闭文件夹',
  'Expand Folder': '展开文件夹',
  'Collapse Folder': '折叠文件夹',
  'File name': '文件名',
  'Folder name': '文件夹名',
  'Create File': '创建文件',
  'Create Folder': '创建文件夹',
  'untitled.txt': '未命名.txt',
  'New name': '新名称',
  Rename: '重命名',
  'Delete File': '删除文件',
  'Delete Folder': '删除文件夹',
  'Move to Trash': '移到回收站',

  /* --------------------------------- Dialogs ------------------------------- */
  Cancel: '取消',
  "Don't Save": '不保存',
  OK: '确定',
  Apply: '应用',
  'Save changes to {name}?': '要保存对 {name} 的更改吗？',
  "Your changes will be lost if you don't save them.": '如果不保存，你的更改将会丢失。',
  '{count} file has unsaved changes': '{count} 个文件有未保存的更改',
  '{count} files have unsaved changes': '{count} 个文件有未保存的更改',
  "This file will be lost if you don't save it.": '如果不保存，此文件将会丢失。',
  "These files will be lost if you don't save them.": '如果不保存，这些文件将会丢失。',
  'No recently closed tabs': '没有最近关闭的标签页',
  'Save the file first to rename it': '请先保存文件再进行重命名',
  'Save the file first to reopen it': '请先保存文件再重新打开',
  'Rename File': '重命名文件',
  'Encoding set to {encoding} — save to apply': '编码已设为 {encoding}，保存后生效',
  'Discard unsaved changes in "{name}"?': '放弃“{name}”中未保存的更改？',
  'Reopened {name} as {encoding}': '已按 {encoding} 重新打开 {name}',
  'Could not reopen {name}: {message}': '无法重新打开 {name}：{message}',
  'Saved {name}': '已保存 {name}',
  'Could not save {name}: {message}': '无法保存 {name}：{message}',
  'Could not open {name}: {message}': '无法打开 {name}：{message}',
  'Opened a large file ({size} MB) — syntax highlighting may be limited':
    '已打开大文件（{size} MB），语法高亮可能受限',
  'untitled-{n}': '未命名-{n}',

  /* -------------------------------- Statusbar ------------------------------ */
  Wrap: '换行',
  'Ln 1, Col 1': '行 1，列 1',
  'Ln {line}, Col {col}': '行 {line}，列 {col}',
  '{count} sel · {lines} lines': '已选 {count} · {lines} 行',
  '{count} sel': '已选 {count}',
  '{count} cursors': '{count} 个光标',
  'Tabs: {count}': '制表符：{count}',
  'Spaces: {count}': '空格：{count}',
  'Spaces: 4': '空格：4',
  'Line and column': '行和列',
  'Toggle word wrap': '切换自动换行',
  'File encoding': '文件编码',
  'Syntax language': '语法语言',

  /* ---------------------------------- Find --------------------------------- */
  'Invalid regex': '正则表达式无效',
  'No results': '无结果',
  '{current} of {total}': '{current} / {total}',
  'Replaced 1': '已替换 1 处',
  'Replaced {count} occurrence': '已替换 {count} 处',
  'Replaced {count} occurrences': '已替换 {count} 处',
  'Replace All': '全部替换',
  'Match case': '匹配大小写',
  'Whole word': '全字匹配',
  'Regular expression': '正则表达式',
  'Previous match (Shift+Enter)': '上一个匹配项 (Shift+Enter)',
  'Next match (Enter)': '下一个匹配项 (Enter)',
  'Toggle Replace': '切换替换栏',
  'Close (Esc)': '关闭 (Esc)',

  /* ------------------------------ Find in files ---------------------------- */
  'Find in Files': '在文件中查找',
  'Search in files…': '在文件中搜索…',
  Search: '搜索',
  'Match Case': '匹配大小写',
  'Whole Word': '全字匹配',
  'Regular Expression': '正则表达式',
  'CHOOSE FOLDER…': '选择文件夹…',
  'Choose a folder to search': '选择要搜索的文件夹',
  'Open a folder to search across files.': '打开文件夹以跨文件搜索。',
  'Enter something to search for.': '输入要搜索的内容。',
  'Searching {name}…': '正在搜索 {name}…',
  '{count} result': '{count} 个结果',
  '{count} results': '{count} 个结果',
  'in {count} file': '位于 {count} 个文件',
  'in {count} files': '位于 {count} 个文件',
  '· scanned {count} in {ms} ms': '· 已扫描 {count} 个文件，用时 {ms} 毫秒',
  '· showing first 400': '· 仅显示前 400 条',
  'No matches for "{query}" in {name}.': '在 {name} 中未找到“{query}”的匹配项。',

  /* --------------------------------- Editor -------------------------------- */
  'Trimmed trailing whitespace on {count} line': '已去除 {count} 行的行尾空白',
  'Trimmed trailing whitespace on {count} lines': '已去除 {count} 行的行尾空白',
  'No trailing whitespace found': '未发现行尾空白',
  'File Statistics': '文件统计',
  Lines: '行数',
  Words: '单词数',
  Characters: '字符数',
  'Characters (no spaces)': '字符数（不含空格）',
  Selected: '已选字符',
  'Line endings set to {eol}': '换行符已设为 {eol}',
  'Go to Line': '转到行',
  'Line number': '行号',
  'Enter a valid line number': '请输入有效的行号',
  'Editor Font Size': '编辑器字号',
  'Size in pixels': '字号（像素）',
  'Choose a size between 9 and 28': '请选择 9 到 28 之间的字号',
  'Copy failed: {message}': '复制失败：{message}',
  'Cut failed: {message}': '剪切失败：{message}',
  'Paste failed: {message}': '粘贴失败：{message}',

  /* -------------------------------- Palette -------------------------------- */
  'Go to file…': '转到文件…',
  'Search commands…': '搜索命令…',
  'Go to line…': '输入行号…',
  Commands: '命令',
  Files: '文件',
  'No matching commands': '没有匹配的命令',
  'Type a line number': '输入行号',
  'No matching files': '没有匹配的文件',
  'No files — open a folder to browse project files': '没有文件 — 打开文件夹以浏览项目文件',
  'Type a line number and press Enter': '输入行号后按 Enter',
  'Go to line {line}': '转到第 {line} 行',
  '{line} of {count}': '第 {line} 行，共 {count} 行',
  'Unsaved buffer': '未保存的缓冲区',
  '↑↓ navigate · ↵ open': '↑↓ 导航 · ↵ 打开',
  'Application menu': '应用菜单',

  /* ------------------------------ Window chrome ---------------------------- */
  Minimize: '最小化',
  Maximize: '最大化',
  Restore: '还原',
  'Failed to start: {message}': '启动失败：{message}',

  /* --------------------------------- About --------------------------------- */
  'Version {version} · Electron {electron}': '版本 {version} · Electron {electron}',
  'A fast, keyboard-driven text and code editor inspired by Sublime Text. Built with Electron and CodeMirror.':
    '一款受 Sublime Text 启发的快速、键盘驱动的文本与代码编辑器。基于 Electron 和 CodeMirror 构建。',

  /* ------------------------------- Shortcuts ------------------------------- */
  'Files & Tabs': '文件与标签页',
  Editing: '编辑',
  'Search & Navigation': '搜索与导航',
  Mouse: '鼠标',
  'New file': '新建文件',
  'Open file': '打开文件',
  'Open folder': '打开文件夹',
  'Save as': '另存为',
  'Close tab': '关闭标签页',
  'Reopen closed tab': '重新打开已关闭的标签页',
  'Next tab': '下一个标签页',
  'Previous tab': '上一个标签页',
  'Go to file': '转到文件',
  'Command palette': '命令面板',
  'Select next occurrence': '选择下一个匹配项',
  'Select all occurrences': '选择所有匹配项',
  'Add cursor above / below': '在上方/下方添加光标',
  'Duplicate line': '复制当前行',
  'Delete line': '删除当前行',
  'Move line up / down': '上移/下移行',
  'Toggle comment': '切换注释',
  'Join lines': '合并行',
  'Trim trailing whitespace': '去除行尾空白',
  'Word completion': '单词补全',
  'Find in files': '在文件中查找',
  'Find next / previous': '查找下一个/上一个',
  'Go to line': '转到行',
  'Fold / unfold': '折叠/展开',
  'Zoom in / out': '放大/缩小',
  'Reset zoom': '重置缩放',
  'Full screen': '全屏',
  'Developer tools': '开发者工具',
  'Add cursor': '添加光标',
  'Zoom with wheel': '滚轮缩放',
  'Menu: Edit': '菜单：编辑'
};

function normalizeLanguage(value) {
  return SUPPORTED.includes(value) ? value : DEFAULT_LANGUAGE;
}

export function currentLanguage() {
  return normalizeLanguage(app.settings?.language);
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

export function t(key, vars) {
  if (key == null || key === '') return '';
  const source = String(key);
  const text = currentLanguage() === 'en' ? source : ZH[source] ?? source;
  return interpolate(text, vars);
}

export function applyLanguageToDocument() {
  const language = currentLanguage();
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
}

export function initI18n() {
  applyLanguageToDocument();
}

export function setLanguage(language, { persist = true } = {}) {
  const next = normalizeLanguage(language);
  const changed = next !== currentLanguage();
  app.settings.language = next;
  applyLanguageToDocument();
  if (persist) persistSettings({ language: next });
  if (changed) app.hooks.languageChanged?.(next);
  return next;
}

export function toggleLanguage() {
  return setLanguage(currentLanguage() === 'zh' ? 'en' : 'zh');
}
