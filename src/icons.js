const svg = (body, viewBox = '0 0 16 16') =>
  `<svg viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;

export const icons = {
  logo: `<svg viewBox="0 0 24 24" class="logo-mark" aria-hidden="true" fill="none"><rect x="2" y="2" width="20" height="20" rx="5.5" fill="currentColor"/><path d="M6.7 8.3h10.6M6.7 15.7h10.6" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round"/><path d="M12 10.6v2.8" stroke="#ffffff" stroke-width="2.1" stroke-linecap="round"/></svg>`,
  check: svg('<path d="M3.5 8.4l3 3 6-6.8"/>'),
  chevronRight: svg('<path d="M6 3.8L10.2 8 6 12.2"/>'),
  chevronDown: svg('<path d="M3.8 6L8 10.2 12.2 6"/>'),
  close: svg('<path d="M4.4 4.4l7.2 7.2M11.6 4.4l-7.2 7.2"/>'),
  search: svg('<circle cx="7.1" cy="7.1" r="4.3"/><path d="M10.4 10.4l3 3"/>'),
  replace: svg('<path d="M3.2 5.4h7.6l-2.1-2.1M12.8 10.6H5.2l2.1 2.1"/>'),
  up: svg('<path d="M4.2 9.3L8 5.5l3.8 3.8"/>'),
  down: svg('<path d="M4.2 6.7L8 10.5l3.8-3.8"/>'),
  folder: svg('<path d="M1.9 4.4c0-.5.4-.9.9-.9h3l1.2 1.3h5.9c.5 0 .9.4.9.9v6c0 .5-.4.9-.9.9H2.8c-.5 0-.9-.4-.9-.9z"/>'),
  folderOpen: svg('<path d="M1.9 5.3c0-.5.4-.9.9-.9h3l1.2 1.3h5.9c.5 0 .9.4.9.9v.5H1.9z"/><path d="M1.9 6.5h12.2l-1.2 5c-.1.4-.4.6-.8.6H2.8c-.5 0-.9-.4-.9-.9z"/>'),
  file: svg('<path d="M4 1.9h5.1l2.9 2.9v9.3H4z"/><path d="M9.1 1.9v2.9h2.9"/><path d="M5.9 8.3h4.2M5.9 10.5h4.2"/>'),
  plus: svg('<path d="M8 3.2v9.6M3.2 8h9.6"/>'),
  minimize: svg('<path d="M4 8h8"/>'),
  maximize: svg('<rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.1"/>'),
  restore: svg('<path d="M5.4 5.4V3.9c0-.4.3-.7.7-.7h6c.4 0 .7.3.7.7v6c0 .4-.3.7-.7.7h-1.5"/><rect x="3.2" y="5.4" width="7.4" height="7.4" rx="1.1"/>'),
  refresh: svg('<path d="M12.6 6.2a4.9 4.9 0 1 0 .3 3.3"/><path d="M12.9 2.9v3.5H9.4"/>'),
  collapse: svg('<path d="M4.2 6.2L8 10l3.8-3.8"/><path d="M4.2 2.9L8 6.7l3.8-3.8"/>'),
  trash: svg('<path d="M3.2 4.6h9.6M6.3 4.6V3.2h3.4v1.4M4.6 4.6l.5 8.2h5.8l.5-8.2M6.7 7v3.5M9.3 7v3.5"/>'),
  pencil: svg('<path d="M10.8 2.8l2.4 2.4-7.2 7.2-3.1.7.7-3.1z"/><path d="M9.4 4.2l2.4 2.4"/>'),
  copy: svg('<rect x="5.2" y="5.2" width="8" height="8" rx="1.2"/><path d="M10.8 5.2V3.9c0-.7-.6-1.2-1.2-1.2H3.9c-.7 0-1.2.6-1.2 1.2v5.7c0 .7.6 1.2 1.2 1.2h1.3"/>'),
  reveal: svg('<path d="M9.2 2.8h4v4M13.2 2.8L8.4 7.6"/><path d="M12.2 9.4v3.4H3.2V3.8h3.4"/>'),
  command: svg('<path d="M4.2 5.2l2.6 2.8-2.6 2.8M8.4 10.8h3.4"/>'),
  info: svg('<circle cx="8" cy="8" r="5.8"/><path d="M8 7.3v4"/><circle cx="8" cy="5.1" r=".7" fill="currentColor" stroke="none"/>'),
  success: svg('<circle cx="8" cy="8" r="5.8"/><path d="M5.4 8.2l1.8 1.8 3.4-3.8"/>'),
  warning: svg('<path d="M8 2.5l6 10.8H2z"/><path d="M8 6.4v3.5"/><circle cx="8" cy="11.5" r=".7" fill="currentColor" stroke="none"/>'),
  error: svg('<circle cx="8" cy="8" r="5.8"/><path d="M5.9 5.9l4.2 4.2M10.1 5.9l-4.2 4.2"/>'),
  wrap: svg('<path d="M2.8 4.6h10.4M2.8 8h7.4a2.2 2.2 0 0 1 0 4.4H8.4"/><path d="M9.8 10.6L8 12.4l1.8 1.8"/>'),
  dot: svg('<circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/>')
};

const CATEGORY = {
  yellow: ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'json', 'jsonc', 'json5', 'webmanifest'],
  orange: ['html', 'htm', 'xhtml', 'xml', 'svg', 'vue', 'svelte', 'xaml', 'csproj', 'xsd', 'xsl', 'rss'],
  blue: ['css', 'scss', 'sass', 'less', 'styl'],
  green: ['py', 'pyw', 'pyi', 'sh', 'bash', 'zsh', 'ps1', 'psm1', 'rb', 'go'],
  purple: ['java', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'cs', 'rs', 'swift', 'kt', 'kts', 'php', 'lua', 'pl', 'pm', 'r', 'dart', 'scala', 'ex', 'exs'],
  red: ['md', 'markdown', 'mdx', 'txt', 'log', 'diff', 'patch'],
  slate: ['yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env', 'lock', 'sql', 'gitignore']
};

export function categoryFor(name) {
  const lower = String(name).toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot > 0 ? lower.slice(dot + 1) : lower;
  for (const [category, exts] of Object.entries(CATEGORY)) {
    if (exts.includes(ext)) return category;
  }
  return 'slate';
}

export function fileIconMarkup(name, isDir = false, isOpen = false) {
  if (isDir) {
    return `<span class="tree-icon folder-icon">${isOpen ? icons.folderOpen : icons.folder}</span>`;
  }
  return `<span class="tree-icon file-icon cat-${categoryFor(name)}">${icons.file}</span>`;
}

export function icon(name) {
  return icons[name] || icons.file;
}
