/**
 * Interline — workspace session helpers
 * A small, dependency-free module used by the demo workspace.
 */

const STORAGE_KEY = 'interline.workspace.v2';
const MAX_RECENT = 14;

export class Workspace {
  constructor(options = {}) {
    this.root = options.root || null;
    this.tabs = [];
    this.active = null;
    this.recent = [];
    this.dirty = new Set();
  }

  get folderName() {
    if (!this.root) return 'NO FOLDER';
    const parts = this.root.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1].toUpperCase();
  }

  open(file, { activate = true } = {}) {
    const existing = this.tabs.find((tab) => tab.path === file.path);
    if (existing) {
      if (activate) this.active = existing.id;
      return existing;
    }

    const tab = {
      id: `tab-${Date.now()}-${this.tabs.length}`,
      path: file.path,
      name: file.name || basename(file.path),
      language: detectLanguage(file.path),
      content: file.content ?? '',
      cursor: { line: 0, ch: 0 },
      savedAt: file.mtimeMs || null
    };

    this.tabs.push(tab);
    if (activate) this.active = tab.id;
    this.touch(tab.path);
    return tab;
  }

  close(id) {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return false;
    const [closed] = this.tabs.splice(index, 1);
    this.dirty.delete(closed.id);
    if (this.active === closed.id) {
      const next = this.tabs[index] || this.tabs[index - 1];
      this.active = next ? next.id : null;
    }
    return true;
  }

  markDirty(id, dirty = true) {
    if (dirty) this.dirty.add(id);
    else this.dirty.delete(id);
  }

  isDirty(id) {
    return this.dirty.has(id);
  }

  touch(filePath) {
    this.recent = [filePath, ...this.recent.filter((item) => item !== filePath)];
    if (this.recent.length > MAX_RECENT) this.recent.length = MAX_RECENT;
  }

  save() {
    if (typeof localStorage === 'undefined') return false;
    const payload = {
      root: this.root,
      active: this.active,
      recent: this.recent,
      tabs: this.tabs.map(({ id, path, name, language, cursor }) => ({
        id,
        path,
        name,
        language,
        cursor
      }))
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  }

  static restore() {
    if (typeof localStorage === 'undefined') return new Workspace();
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw) return new Workspace();
      const workspace = new Workspace({ root: raw.root });
      workspace.recent = Array.isArray(raw.recent) ? raw.recent : [];
      for (const tab of raw.tabs || []) {
        workspace.tabs.push({ ...tab, content: '', savedAt: null });
      }
      workspace.active = raw.active || null;
      return workspace;
    } catch {
      return new Workspace();
    }
  }
}

export function basename(filePath) {
  const clean = String(filePath).replace(/[\\/]+$/, '');
  return clean.slice(Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\')) + 1);
}

export function detectLanguage(filePath) {
  const extension = basename(filePath).split('.').pop().toLowerCase();
  const table = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'jsx',
    css: 'css',
    html: 'html',
    md: 'markdown',
    py: 'python',
    json: 'json'
  };
  return table[extension] || 'plain';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function debounce(callback, wait = 140) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
}
