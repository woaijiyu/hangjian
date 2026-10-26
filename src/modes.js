import 'codemirror/mode/clike/clike.js';
import 'codemirror/mode/javascript/javascript.js';
import 'codemirror/mode/jsx/jsx.js';
import 'codemirror/mode/xml/xml.js';
import 'codemirror/mode/htmlmixed/htmlmixed.js';
import 'codemirror/mode/css/css.js';
import 'codemirror/mode/sass/sass.js';
import 'codemirror/mode/python/python.js';
import 'codemirror/mode/php/php.js';
import 'codemirror/mode/go/go.js';
import 'codemirror/mode/rust/rust.js';
import 'codemirror/mode/ruby/ruby.js';
import 'codemirror/mode/swift/swift.js';
import 'codemirror/mode/shell/shell.js';
import 'codemirror/mode/powershell/powershell.js';
import 'codemirror/mode/sql/sql.js';
import 'codemirror/mode/yaml/yaml.js';
import 'codemirror/mode/toml/toml.js';
import 'codemirror/mode/properties/properties.js';
import 'codemirror/mode/lua/lua.js';
import 'codemirror/mode/perl/perl.js';
import 'codemirror/mode/r/r.js';
import 'codemirror/mode/dockerfile/dockerfile.js';
import 'codemirror/mode/diff/diff.js';
import 'codemirror/mode/markdown/markdown.js';
import 'codemirror/mode/gfm/gfm.js';
import 'codemirror/mode/vb/vb.js';
import 'codemirror/mode/stex/stex.js';
import 'codemirror/mode/vue/vue.js';
import 'codemirror/mode/dart/dart.js';

import { basename, extname } from './utils.js';

export const LANGUAGES = [
  { id: 'plain', label: 'Plain Text', mode: 'text/plain', exts: ['txt', 'text', 'log'] },
  { id: 'javascript', label: 'JavaScript', mode: 'javascript', exts: ['js', 'mjs', 'cjs'] },
  { id: 'typescript', label: 'TypeScript', mode: 'text/typescript', exts: ['ts'] },
  { id: 'jsx', label: 'JavaScript (JSX)', mode: 'text/jsx', exts: ['jsx'] },
  { id: 'tsx', label: 'TypeScript (TSX)', mode: 'text/typescript-jsx', exts: ['tsx'] },
  { id: 'json', label: 'JSON', mode: 'application/json', exts: ['json', 'jsonc', 'json5', 'webmanifest', 'map'] },
  { id: 'html', label: 'HTML', mode: 'htmlmixed', exts: ['html', 'htm', 'xhtml'] },
  { id: 'vue', label: 'Vue', mode: 'text/x-vue', exts: ['vue'] },
  { id: 'css', label: 'CSS', mode: 'css', exts: ['css'] },
  { id: 'scss', label: 'SCSS', mode: 'text/x-scss', exts: ['scss'] },
  { id: 'sass', label: 'Sass', mode: 'text/x-sass', exts: ['sass'] },
  { id: 'less', label: 'Less', mode: 'text/x-less', exts: ['less'] },
  { id: 'xml', label: 'XML', mode: 'application/xml', exts: ['xml', 'svg', 'plist', 'csproj', 'xaml', 'xsd', 'xsl', 'rss', 'atom'] },
  { id: 'markdown', label: 'Markdown', mode: 'gfm', exts: ['md', 'markdown', 'mdx', 'mdown'] },
  { id: 'python', label: 'Python', mode: 'text/x-python', exts: ['py', 'pyw', 'pyi'] },
  { id: 'java', label: 'Java', mode: 'text/x-java', exts: ['java'] },
  { id: 'c', label: 'C', mode: 'text/x-csrc', exts: ['c', 'h'] },
  { id: 'cpp', label: 'C++', mode: 'text/x-c++src', exts: ['cpp', 'cxx', 'cc', 'hpp', 'hh', 'hxx', 'ino'] },
  { id: 'csharp', label: 'C#', mode: 'text/x-csharp', exts: ['cs', 'csx'] },
  { id: 'go', label: 'Go', mode: 'text/x-go', exts: ['go'] },
  { id: 'rust', label: 'Rust', mode: 'text/x-rustsrc', exts: ['rs'] },
  { id: 'php', label: 'PHP', mode: 'application/x-httpd-php', exts: ['php', 'phtml'] },
  { id: 'ruby', label: 'Ruby', mode: 'ruby', exts: ['rb', 'rake', 'gemspec'] },
  { id: 'swift', label: 'Swift', mode: 'text/x-swift', exts: ['swift'] },
  { id: 'kotlin', label: 'Kotlin', mode: 'text/x-kotlin', exts: ['kt', 'kts'] },
  { id: 'sql', label: 'SQL', mode: 'text/x-sql', exts: ['sql', 'psql', 'pgsql', 'mysql'] },
  { id: 'shell', label: 'Shell', mode: 'shell', exts: ['sh', 'bash', 'zsh', 'fish', 'ksh'] },
  { id: 'powershell', label: 'PowerShell', mode: 'powershell', exts: ['ps1', 'psm1', 'psd1'] },
  { id: 'batch', label: 'Batch', mode: 'shell', exts: ['bat', 'cmd'] },
  { id: 'yaml', label: 'YAML', mode: 'yaml', exts: ['yaml', 'yml'] },
  { id: 'toml', label: 'TOML', mode: 'text/x-toml', exts: ['toml'] },
  { id: 'ini', label: 'INI / Properties', mode: 'properties', exts: ['ini', 'cfg', 'conf', 'properties', 'env'] },
  { id: 'lua', label: 'Lua', mode: 'lua', exts: ['lua'] },
  { id: 'perl', label: 'Perl', mode: 'perl', exts: ['pl', 'pm'] },
  { id: 'r', label: 'R', mode: 'text/x-rsrc', exts: ['r', 'rmd'] },
  { id: 'dockerfile', label: 'Dockerfile', mode: 'text/x-dockerfile', exts: ['dockerfile'] },
  { id: 'diff', label: 'Diff', mode: 'diff', exts: ['diff', 'patch'] },
  { id: 'latex', label: 'LaTeX', mode: 'text/x-stex', exts: ['tex', 'latex', 'bib'] },
  { id: 'vb', label: 'Visual Basic', mode: 'text/x-vb', exts: ['vb'] },
  { id: 'dart', label: 'Dart', mode: 'application/dart', exts: ['dart'] }
];

const BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]));

const FILENAME_MAP = {
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.profile': 'shell',
  '.env': 'ini',
  '.editorconfig': 'ini',
  'makefile': 'plain',
  'cmakelists.txt': 'plain'
};

const BLOCK_COMMENTS = {
  html: ['<!--', '-->'],
  vue: ['<!--', '-->'],
  xml: ['<!--', '-->'],
  markdown: ['<!--', '-->'],
  css: ['/*', '*/'],
  scss: ['/*', '*/'],
  less: ['/*', '*/'],
  sass: ['/*', '*/']
};

const LINE_COMMENTS = {
  javascript: '//',
  typescript: '//',
  jsx: '//',
  tsx: '//',
  java: '//',
  c: '//',
  cpp: '//',
  csharp: '//',
  go: '//',
  rust: '//',
  php: '//',
  swift: '//',
  kotlin: '//',
  dart: '//',
  sql: '--',
  lua: '--',
  python: '#',
  ruby: '#',
  perl: '#',
  r: '#',
  shell: '#',
  powershell: '#',
  yaml: '#',
  toml: '#',
  dockerfile: '#',
  ini: ';',
  batch: '::',
  vb: "'",
  latex: '%'
};

export function languageById(id) {
  return BY_ID.get(id) || BY_ID.get('plain');
}

export function detectLanguage(filePath, text = '') {
  const name = (basename(filePath) || '').toLowerCase();
  if (name && FILENAME_MAP[name]) return languageById(FILENAME_MAP[name]);

  const ext = extname(filePath);
  if (ext) {
    const found = LANGUAGES.find((language) => language.exts && language.exts.includes(ext));
    if (found) return found;
  }

  const head = String(text).slice(0, 2200);
  if (/^#!.*\bnode\b/.test(head)) return languageById('javascript');
  if (/^#!.*\bpython/.test(head)) return languageById('python');
  if (/^#!.*\bruby/.test(head)) return languageById('ruby');
  if (/^#!.*\b(?:ba|z|k)?sh\b/.test(head)) return languageById('shell');
  if (/^\s*<\?php/i.test(head)) return languageById('php');
  if (/^\s*<\?xml/i.test(head)) return languageById('xml');
  if (/^\s*<!doctype html/i.test(head) || /^\s*<html[\s>]/i.test(head)) return languageById('html');
  if (/^\s*<svg[\s>]/i.test(head)) return languageById('xml');
  return languageById('plain');
}

export function languageForMode(mode) {
  return LANGUAGES.find((language) => language.mode === mode) || languageById('plain');
}

export function commentTokens(languageId) {
  if (BLOCK_COMMENTS[languageId]) {
    return { blockCommentStart: BLOCK_COMMENTS[languageId][0], blockCommentEnd: BLOCK_COMMENTS[languageId][1] };
  }
  if (LINE_COMMENTS[languageId]) {
    return { lineComment: LINE_COMMENTS[languageId] };
  }
  return null;
}
