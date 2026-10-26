export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function basename(filePath) {
  if (!filePath) return '';
  const clean = String(filePath).replace(/[\\/]+$/, '');
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

export function dirname(filePath) {
  if (!filePath) return '';
  const clean = String(filePath).replace(/[\\/]+$/, '');
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return idx > 0 ? clean.slice(0, idx) : '';
}

export function extname(filePath) {
  const name = basename(filePath);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function joinPath(dir, name) {
  const sep = String(dir).includes('\\') ? '\\' : '/';
  return String(dir).replace(/[\\/]+$/, '') + sep + name;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function debounce(fn, wait = 120) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  wrapped.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return wrapped;
}

export function samePath(a, b) {
  if (!a || !b) return false;
  return normalize(a) === normalize(b);
}

function normalize(filePath) {
  return String(filePath).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function isSameOrInside(child, parent) {
  if (!child || !parent) return false;
  const c = normalize(child);
  const p = normalize(parent);
  return c === p || c.startsWith(p + '\\');
}

export function fuzzyMatch(query, text) {
  if (!query) return { score: 0, indices: [] };
  const q = query.toLowerCase();
  const t = String(text).toLowerCase();
  let qi = 0;
  let score = 0;
  let last = -1;
  const indices = [];
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] !== q[qi]) continue;
    let bonus = 1;
    if (i === last + 1) bonus += 3;
    if (i === 0 || /[\s/\\_.\-:]/.test(t[i - 1])) bonus += 3;
    if (String(text)[i] === query[qi]) bonus += 1;
    score += bonus;
    last = i;
    indices.push(i);
    qi++;
  }
  if (qi < q.length) return null;
  score -= Math.min(3, t.length * 0.01);
  return { score, indices };
}

export function highlightIndices(text, indices) {
  if (!indices || !indices.length) return escapeHtml(text);
  const set = new Set(indices);
  let out = '';
  let current = null;
  for (let i = 0; i < text.length; i++) {
    const hit = set.has(i);
    if (hit !== current) {
      out += hit ? '<span class="fuzzy-hit">' : '</span>';
      current = hit;
    }
    out += escapeHtml(text[i]);
  }
  if (current) out += '</span>';
  return out;
}

export function isEditable(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
}

export function formatDate(date = new Date()) {
  return date.toLocaleString();
}
