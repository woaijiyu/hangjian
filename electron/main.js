const { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen, clipboard } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { TextDecoder } = require('util');
const { execFileSync } = require('child_process');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const APP_NAME = 'Interline';
const LEGACY_APP_NAME = 'Lumen';

app.setName(APP_NAME);

const DEFAULT_SETTINGS = {
  language: 'zh',
  theme: 'mariana',
  fontSize: 13,
  wrap: false,
  minimap: true,
  sidebar: true,
  sidebarWidth: 252,
  folder: null,
  window: { width: 1280, height: 820, maximized: false },
  session: { files: [], active: null },
  recent: []
};

const ZH_TEXT = {
  'Open Files': '打开文件',
  'Open Folder': '打开文件夹',
  'Save As': '另存为',
  'All Files': '所有文件',
  'Text Files': '文本文件',
  'A file or folder with that name already exists': '已存在同名文件或文件夹',
  'Invalid path': '无效路径',
  'Name cannot be empty': '名称不能为空',
  'Name cannot contain path separators': '名称不能包含路径分隔符',
  'Cannot open binary file': '无法打开二进制文件',
  'Not a file': '不是文件',
  'File is too large (over 64 MB)': '文件过大（超过 64 MB）',
  'Unsupported encoding: {name}': '不支持的编码：{name}',
  'Choose a folder to search': '请选择要搜索的文件夹',
  'Enter something to search for': '请输入要搜索的内容',
  'Search query is too long': '搜索内容过长',
  'Search path is not a folder': '搜索路径不是文件夹',
  'Invalid regular expression: {message}': '正则表达式无效：{message}'
};

function mainT(key, vars = {}) {
  const text = settings.language === 'en' ? key : ZH_TEXT[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const LEGACY_SETTINGS_FILE = path.join(app.getPath('appData'), LEGACY_APP_NAME, 'settings.json');
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.svn', '.hg', '.cache', '__pycache__',
  '.venv', 'venv', '.idea', '.vs', '$RECYCLE.BIN', 'System Volume Information'
]);

let mainWindow = null;
let settings = structuredClone(DEFAULT_SETTINGS);
let pendingOpenPaths = [];
let allowClose = false;
let saveTimer = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const files = getPathsFromArgv(argv);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      if (files.length) mainWindow.webContents.send('files:open-paths', files);
    } else {
      pendingOpenPaths.push(...files);
    }
  });
  app.whenReady().then(init);
}

function argValue(name) {
  const prefix = '--' + name;
  const found = process.argv.find((arg) => arg === prefix || arg.startsWith(prefix + '='));
  if (!found) return null;
  if (found === prefix) return true;
  return found.slice(prefix.length + 1);
}

function getPathsFromArgv(argv) {
  const start = app.isPackaged ? 1 : 2;
  return argv
    .slice(start)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => {
      try {
        const resolved = path.resolve(arg);
        return fs.statSync(resolved).isFile() ? resolved : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function loadSettings() {
  for (const file of [SETTINGS_FILE, LEGACY_SETTINGS_FILE]) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!raw || typeof raw !== 'object') continue;
      settings = {
        ...structuredClone(DEFAULT_SETTINGS),
        ...raw,
        window: { ...DEFAULT_SETTINGS.window, ...(raw.window || {}) },
        session: { ...DEFAULT_SETTINGS.session, ...(raw.session || {}) },
        recent: Array.isArray(raw.recent) ? raw.recent.filter((p) => typeof p === 'string').slice(0, 20) : []
      };
      if (file !== SETTINGS_FILE) writeSettingsNow();
      return;
    } catch {
      /* try the next location */
    }
  }
}

function writeSettingsNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    const tmp = SETTINGS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tmp, SETTINGS_FILE);
  } catch (err) {
    console.error('[settings] write failed:', err);
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(writeSettingsNow, 250);
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  settings.window = {
    ...settings.window,
    maximized: mainWindow.isMaximized()
  };
  if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
    const b = mainWindow.getBounds();
    Object.assign(settings.window, b);
  }
  writeSettingsNow();
}

function initialBounds() {
  const w = settings.window || {};
  const width = Math.max(760, Number(w.width) || 1280);
  const height = Math.max(480, Number(w.height) || 820);
  const bounds = { width, height };
  if (Number.isFinite(w.x) && Number.isFinite(w.y)) {
    const display = screen.getDisplayMatching({ x: w.x, y: w.y, width, height });
    const area = display.workArea;
    const visible =
      w.x < area.x + area.width - 80 &&
      w.x + width > area.x + 80 &&
      w.y < area.y + area.height - 40 &&
      w.y + height > area.y + 40;
    if (visible) {
      bounds.x = w.x;
      bounds.y = w.y;
    }
  }
  return bounds;
}

function init() {
  Menu.setApplicationMenu(null);
  loadSettings();

  const shot = argValue('screenshot');
  const demo = argValue('demo');
  const panel = argValue('panel');
  const shotW = Number(argValue('width')) || 1440;
  const shotH = Number(argValue('height')) || 900;

  pendingOpenPaths = getPathsFromArgv(process.argv);

  const bounds = shot ? { width: shotW, height: shotH } : initialBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 480,
    frame: false,
    show: false,
    backgroundColor: '#2b343d',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (!shot && settings.window.maximized) mainWindow.maximize();
    if (demo) {
      mainWindow.webContents.send('demo:open');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  mainWindow.webContents.on('console-message', (...args) => {
    const details = args[1];
    if (details && typeof details === 'object' && 'message' in details) {
      console.log(`[renderer:${details.level}] ${details.message}`);
    } else {
      console.log('[renderer]', args[2]);
    }
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] process gone:', details.reason);
  });

  mainWindow.on('resize', debounceWindowState);
  mainWindow.on('move', debounceWindowState);
  mainWindow.on('maximize', () => {
    settings.window.maximized = true;
    scheduleSave();
    sendWindowState();
  });
  mainWindow.on('unmaximize', () => {
    settings.window.maximized = false;
    scheduleSave();
    sendWindowState();
  });
  mainWindow.on('enter-full-screen', sendWindowState);
  mainWindow.on('leave-full-screen', sendWindowState);

  mainWindow.on('close', (event) => {
    if (allowClose || shot) {
      saveWindowState();
      return;
    }
    event.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  const query = {};
  if (demo) query.demo = '1';
  if (shot) {
    query.shot = '1';
    if (panel && panel !== true) query.panel = String(panel);
  }
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'), { query });

  if (shot) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          const target = path.resolve(
            process.cwd(),
            shot === true ? path.join('shots', 'interline.png') : shot
          );
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, image.toPNG());
          console.log('[shot] saved', target);
        } catch (err) {
          console.error('[shot] failed', err);
        } finally {
          allowClose = true;
          app.quit();
        }
      }, 2600);
    });
  }
}

let windowStateTimer = null;
function debounceWindowState() {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
    const b = mainWindow.getBounds();
    settings.window = { ...settings.window, ...b, maximized: false };
    scheduleSave();
  }, 400);
}

function sendWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('window:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen()
  });
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ---------------------------------- IPC ---------------------------------- */

ipcMain.handle('app:info', () => {
  const paths = pendingOpenPaths;
  pendingOpenPaths = [];
  const appRoot = path.join(__dirname, '..');
  return {
    version: app.getVersion(),
    platform: process.platform,
    initialPaths: paths,
    appRoot,
    demoPath: path.join(appRoot, 'demo'),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    ansi: systemAnsi()
  };
});

ipcMain.handle('settings:get', () => structuredClone(settings));

ipcMain.handle('settings:update', (_event, patch) => {
  if (!patch || typeof patch !== 'object') return false;
  const allowed = ['language', 'theme', 'fontSize', 'wrap', 'minimap', 'sidebar', 'sidebarWidth', 'folder', 'session', 'recent'];
  for (const key of allowed) {
    if (key in patch) settings[key] = patch[key];
  }
  scheduleSave();
  return true;
});

ipcMain.handle('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:is-maximized', () => Boolean(mainWindow && mainWindow.isMaximized()));
ipcMain.handle('window:toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
ipcMain.handle('window:confirm-close', () => {
  allowClose = true;
  saveWindowState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.handle('window:toggle-devtools', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.webContents.toggleDevTools();
  return mainWindow.webContents.isDevToolsOpened();
});

ipcMain.handle('clipboard:write-text', (_event, text) => {
  if (typeof text !== 'string') return false;
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('clipboard:read-text', () => clipboard.readText());

ipcMain.handle('dialog:open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mainT('Open Files'),
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: mainT('All Files'), extensions: ['*'] },
      { name: mainT('Text Files'), extensions: ['txt', 'md', 'log', 'json', 'js', 'ts', 'html', 'css', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'sql', 'yaml', 'yml', 'xml'] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: mainT('Open Folder'),
    properties: ['openDirectory']
  });
  return result.canceled ? null : result.filePaths[0] || null;
});

ipcMain.handle('dialog:save-file', async (_event, opts = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: mainT('Save As'),
    defaultPath: opts.defaultPath || undefined,
    filters: [
      { name: mainT('All Files'), extensions: ['*'] },
      { name: mainT('Text Files'), extensions: ['txt'] }
    ]
  });
  return result.canceled ? null : result.filePath || null;
});

ipcMain.handle('fs:read-file', async (_event, payload) => {
  if (typeof payload === 'string') return readTextFile(payload);
  const filePath = payload && typeof payload === 'object' ? payload.path : null;
  return readTextFile(filePath, payload && typeof payload === 'object' ? payload : {});
});
ipcMain.handle('fs:write-file', async (_event, payload) => writeTextFile(payload));
ipcMain.handle('fs:stat', async (_event, filePath) => {
  const stat = await fsp.stat(filePath);
  return { mtimeMs: stat.mtimeMs, size: stat.size };
});

ipcMain.handle('fs:read-dir', async (_event, dirPath) => {
  ensurePath(dirPath);
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.isSymbolicLink())
    .map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDir: entry.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
});

ipcMain.handle('fs:create-file', async (_event, { dir, name }) => {
  ensurePath(dir);
  const target = safeJoin(dir, name);
  const handle = await fsp.open(target, 'wx');
  await handle.close();
  return target;
});

ipcMain.handle('fs:create-folder', async (_event, { dir, name }) => {
  ensurePath(dir);
  const target = safeJoin(dir, name);
  await fsp.mkdir(target);
  return target;
});

ipcMain.handle('fs:rename', async (_event, { oldPath, newPath }) => {
  ensurePath(oldPath);
  ensurePath(newPath);
  try {
    await fsp.access(newPath);
    throw new Error(mainT('A file or folder with that name already exists'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await fsp.rename(oldPath, newPath);
  return newPath;
});

ipcMain.handle('fs:trash', async (_event, targetPath) => {
  ensurePath(targetPath);
  await shell.trashItem(targetPath);
  return true;
});

ipcMain.handle('fs:reveal', (_event, targetPath) => {
  ensurePath(targetPath);
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.handle('path:join', (_event, parts) => path.join(...parts.map(ensurePath)));

ipcMain.handle('search:in-files', async (_event, opts) => searchInFiles(opts || {}));

ipcMain.on('files:dropped', (_event, paths) => {
  if (!Array.isArray(paths) || !paths.length) return;
  const files = paths.filter((p) => typeof p === 'string' && p);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('files:open-paths', files);
  }
});

app.on('before-quit', () => {
  if (saveTimer) writeSettingsNow();
});

app.on('window-all-closed', () => {
  app.quit();
});

/* ------------------------------- Utilities ------------------------------- */

function ensurePath(value) {
  if (typeof value !== 'string' || !value) throw new Error(mainT('Invalid path'));
  return path.normalize(value);
}

function safeJoin(dir, name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error(mainT('Name cannot be empty'));
  const cleaned = name.trim();
  if (cleaned === '.' || cleaned === '..' || /[\\/]/.test(cleaned)) {
    throw new Error(mainT('Name cannot contain path separators'));
  }
  return path.join(dir, cleaned);
}

const DETECTED_ENCODINGS = {
  'utf-8': 'utf8',
  utf8: 'utf8',
  ascii: 'utf8',
  'utf-16le': 'utf16le',
  'utf-16be': 'utf16be',
  gb18030: 'gb18030',
  gbk: 'gbk',
  big5: 'big5',
  shift_jis: 'shift_jis',
  sjis: 'shift_jis',
  cp932: 'shift_jis',
  'euc-jp': 'euc-jp',
  'euc-kr': 'euc-kr',
  cp949: 'euc-kr',
  'windows-1252': 'windows-1252',
  'iso-8859-1': 'latin1',
  'windows-1251': 'windows-1251'
};

const CODEPAGE_ENCODINGS = {
  437: 'cp437',
  850: 'cp850',
  852: 'cp852',
  855: 'cp855',
  866: 'cp866',
  874: 'windows-874',
  932: 'shift_jis',
  936: 'gbk',
  949: 'euc-kr',
  950: 'big5',
  1250: 'windows-1250',
  1251: 'windows-1251',
  1252: 'windows-1252',
  1253: 'windows-1253',
  1254: 'windows-1254',
  1255: 'windows-1255',
  1256: 'windows-1256',
  1257: 'windows-1257',
  1258: 'windows-1258',
  10000: 'macintosh',
  20932: 'euc-jp',
  51932: 'euc-jp',
  54936: 'gb18030',
  65001: 'utf8'
};

let ansiCache = null;

function localeCodepage() {
  let locale = '';
  try {
    locale = (typeof app.getSystemLocale === 'function' ? app.getSystemLocale() : app.getLocale()) || '';
  } catch {
    /* keep the Western default */
  }
  const value = locale.toLowerCase();
  if (/^zh-(cn|sg|hans)/.test(value)) return 936;
  if (/^zh-(tw|hk|mo|hant)/.test(value)) return 950;
  if (/^ja/.test(value)) return 932;
  if (/^ko/.test(value)) return 949;
  if (/^(ru|uk|be|bg|mk|sr)/.test(value)) return 1251;
  if (/^el/.test(value)) return 1253;
  if (/^tr/.test(value)) return 1254;
  if (/^(he|iw)/.test(value)) return 1255;
  if (/^(ar|fa|ur)/.test(value)) return 1256;
  if (/^(et|lv|lt|pl|cs|sk|sl|hr|hu|ro)/.test(value)) return 1250;
  if (/^vi/.test(value)) return 1258;
  if (/^th/.test(value)) return 874;
  return 1252;
}

function systemAnsi() {
  if (ansiCache) return ansiCache;
  let codepage = 0;
  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'reg',
        ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage', '/v', 'ACP'],
        { encoding: 'utf8', windowsHide: true, timeout: 2000 }
      );
      const match = /ACP\s+REG_SZ\s+(\d+)/i.exec(output);
      if (match) codepage = Number(match[1]);
    } catch {
      /* fall back to the locale mapping */
    }
  }
  if (!codepage) codepage = localeCodepage();
  const encoding = CODEPAGE_ENCODINGS[codepage] || 'windows-1252';
  ansiCache = { encoding, codepage: codepage || 1252 };
  return ansiCache;
}

function resolveEncoding(name) {
  if (String(name || '').toLowerCase() === 'ansi') return systemAnsi().encoding;
  return canonicalEncoding(name);
}

function canonicalEncoding(name) {
  if (!name) return null;
  const key = String(name).toLowerCase();
  return DETECTED_ENCODINGS[key] || (iconv.encodingExists(name) ? name : null);
}

function detectLegacyEncoding(buf) {
  const sample = buf.subarray(0, Math.min(buf.length, 64 * 1024));
  let result = null;
  try {
    result = jschardet.detect(sample);
  } catch {
    /* fall through to the Chinese-friendly default */
  }
  let mapped = canonicalEncoding(result?.encoding);
  if (mapped === 'gb2312') mapped = 'gb18030';
  const confidence = Number(result?.confidence) || 0;
  if (mapped && !['utf8', 'utf16le', 'utf16be'].includes(mapped)) {
    if (confidence >= 0.25) return mapped;
    if (['zh', 'ja', 'ko'].includes(result?.language)) return mapped;
    if (['windows-1252', 'windows-1251', 'latin1'].includes(mapped) && confidence >= 0.05) return mapped;
  }
  return 'gb18030';
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 8192);
  if (!n) return false;
  let zeros = 0;
  let controls = 0;
  for (let i = 0; i < n; i++) {
    const byte = buf[i];
    if (byte === 0) zeros++;
    else if (byte < 7 || (byte > 13 && byte < 32)) controls++;
  }
  return zeros > 0 || controls / n > 0.05;
}

function decodeUtf8Strict(buf) {
  return new TextDecoder('utf-8', { fatal: true }).decode(buf);
}

function swapToLe(buf) {
  const even = buf.length - (buf.length % 2);
  const swapped = Buffer.from(buf.subarray(0, even));
  swapped.swap16();
  return swapped.toString('utf16le');
}

function finishDecoded(text, encoding, bom) {
  if (text.includes('\u0000')) throw new Error(mainT('Cannot open binary file'));
  const crlf = (text.match(/\r\n/g) || []).length;
  const totalLf = (text.match(/\n/g) || []).length;
  const bareLf = totalLf - crlf;
  let eol = 'LF';
  if (crlf > 0 && bareLf > 0) eol = 'Mixed';
  else if (crlf > 0) eol = 'CRLF';
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return { content: text, encoding, bom, eol };
}

function decodeBuffer(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return finishDecoded(iconv.decode(buf.subarray(3), 'utf8'), 'utf8', true);
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return finishDecoded(buf.subarray(2).toString('utf16le'), 'utf16le', true);
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return finishDecoded(swapToLe(buf.subarray(2)), 'utf16be', true);
  }

  const guessed = guessUtf16(buf);
  if (guessed === 'utf16le') return finishDecoded(buf.toString('utf16le'), 'utf16le', false);
  if (guessed === 'utf16be') return finishDecoded(swapToLe(buf), 'utf16be', false);

  try {
    return finishDecoded(decodeUtf8Strict(buf), 'utf8', false);
  } catch {
    if (looksBinary(buf)) throw new Error(mainT('Cannot open binary file'));
    const encoding = detectLegacyEncoding(buf);
    return finishDecoded(iconv.decode(buf, encoding), encoding, false);
  }
}

function decodeBufferAs(buf, requested) {
  const isAnsi = String(requested || '').toLowerCase() === 'ansi';
  const encoding = resolveEncoding(requested);
  if (!encoding) throw new Error(mainT('Unsupported encoding: {name}', { name: requested }));

  let body = buf;
  let bom = false;
  if (encoding === 'utf8' && buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    body = buf.subarray(3);
    bom = true;
  } else if (encoding === 'utf16le' && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    body = buf.subarray(2);
    bom = true;
  } else if (encoding === 'utf16be' && buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    body = buf.subarray(2);
    bom = true;
  }

  const text =
    encoding === 'utf16le'
      ? body.toString('utf16le')
      : encoding === 'utf16be'
        ? swapToLe(body)
        : iconv.decode(body, encoding);
  return finishDecoded(text, isAnsi ? 'ansi' : encoding, bom);
}

function guessUtf16(buf) {
  const n = Math.min(buf.length, 4096);
  if (n < 8) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) {
      if (i % 2 === 0) evenZero++;
      else oddZero++;
    }
  }
  const threshold = n / 6;
  if (oddZero > threshold && evenZero < n / 100) return 'utf16le';
  if (evenZero > threshold && oddZero < n / 100) return 'utf16be';
  return null;
}

async function readTextFile(filePath, options = {}) {
  const resolved = ensurePath(filePath);
  const stat = await fsp.stat(resolved);
  if (!stat.isFile()) throw new Error(mainT('Not a file'));
  if (stat.size > 64 * 1024 * 1024) throw new Error(mainT('File is too large (over 64 MB)'));
  const buf = await fsp.readFile(resolved);
  const forced = typeof options.encoding === 'string' ? options.encoding : '';
  const decoded = forced ? decodeBufferAs(buf, forced) : decodeBuffer(buf);
  return {
    path: resolved,
    name: path.basename(resolved),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ...decoded
  };
}

function encodeText(content, encoding = 'utf8', bom = false, eol = 'LF') {
  let text = String(content).replace(/\r\n?/g, '\n');
  if (eol === 'CRLF') text = text.replace(/\n/g, '\r\n');

  const target = resolveEncoding(encoding) || encoding;
  if (target === 'utf16le') {
    const body = Buffer.from(text, 'utf16le');
    return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
  }
  if (target === 'utf16be') {
    const body = Buffer.from(text, 'utf16le');
    body.swap16();
    return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), body]) : body;
  }
  if (!target || target === 'utf8') {
    const body = Buffer.from(text, 'utf8');
    return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body;
  }
  if (!iconv.encodingExists(target)) {
    throw new Error(mainT('Unsupported encoding: {name}', { name: encoding }));
  }
  return iconv.encode(text, target);
}

async function writeTextFile(payload) {
  const { path: filePath, content, encoding = 'utf8', bom = false, eol = 'LF' } = payload || {};
  const resolved = ensurePath(filePath);
  const buf = encodeText(content ?? '', encoding, Boolean(bom), eol);
  await fsp.writeFile(resolved, buf);
  const stat = await fsp.stat(resolved);
  return { path: resolved, name: path.basename(resolved), size: stat.size, mtimeMs: stat.mtimeMs };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeSearchText(buf) {
  try {
    return decodeUtf8Strict(buf);
  } catch {
    return iconv.decode(buf, detectLegacyEncoding(buf));
  }
}

async function searchInFiles(opts) {
  const rootRaw = typeof opts.root === 'string' ? opts.root : '';
  const query = typeof opts.query === 'string' ? opts.query : '';
  if (!rootRaw) throw new Error(mainT('Choose a folder to search'));
  if (!query) throw new Error(mainT('Enter something to search for'));
  if (query.length > 500) throw new Error(mainT('Search query is too long'));

  const root = path.resolve(rootRaw);
  const stat = await fsp.stat(root);
  if (!stat.isDirectory()) throw new Error(mainT('Search path is not a folder'));

  const caseSensitive = Boolean(opts.caseSensitive);
  const wholeWord = Boolean(opts.wholeWord);
  const useRegex = Boolean(opts.regex);
  const maxResults = 1000;

  let source = useRegex ? query : escapeRegExp(query);
  if (wholeWord) source = `(?<![\\w$])${source}(?![\\w$])`;
  let regex;
  try {
    regex = new RegExp(source, caseSensitive ? 'gm' : 'gim');
  } catch (err) {
    throw new Error(mainT('Invalid regular expression: {message}', { message: err.message }));
  }

  const started = Date.now();
  const results = [];
  let filesScanned = 0;
  let truncated = false;
  let limitFiles = 6000;

  async function scanFile(filePath, relPath) {
    let info;
    try {
      info = await fsp.stat(filePath);
    } catch {
      return;
    }
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return;
    let buf;
    try {
      buf = await fsp.readFile(filePath);
    } catch {
      return;
    }
    const head = buf.subarray(0, 4096);
    if (head.includes(0)) return;
    const text = decodeSearchText(buf);
    if (!text) return;
    filesScanned++;
    const lines = text.split(/\r\n|\n|\r/);
    for (let i = 0; i < lines.length && results.length < maxResults; i++) {
      const line = lines[i];
      if (!line) continue;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(line)) !== null) {
        results.push({
          file: filePath,
          relPath,
          line: i + 1,
          col: match.index + 1,
          matchLength: match[0].length,
          text: line.length > 500 ? line.slice(0, 500) : line
        });
        if (results.length >= maxResults) {
          truncated = true;
          break;
        }
        if (match[0].length === 0) regex.lastIndex++;
      }
    }
  }

  async function walk(dir, depth) {
    if (truncated || depth > 12 || Date.now() - started > 20000) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated || Date.now() - started > 20000) {
        truncated = true;
        return;
      }
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile()) {
        if (--limitFiles < 0) {
          truncated = true;
          return;
        }
        await scanFile(full, path.relative(root, full));
      }
      if (results.length >= maxResults) {
        truncated = true;
        return;
      }
    }
  }

  await walk(root, 0);
  return {
    results,
    filesScanned,
    truncated,
    elapsedMs: Date.now() - started,
    root
  };
}
