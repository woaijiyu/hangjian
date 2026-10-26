import { app, activeTab, persistSettings } from './state.js';
import { registerCommand } from './commands.js';
import { clamp } from './utils.js';

let canvas = null;
let ctx = null;
let wrap = null;
let slider = null;
let width = 0;
let height = 0;
let dpr = 1;
let drawTimer = null;
let scrollFrame = null;
let dragging = false;
let colors = {};

const COMMENT_LINE = /^\s*(\/\/|#|\/\*|\*|<!--|--|'|;)/;
const KEYWORD_LINE = /\b(const|let|var|function|class|import|from|export|return|if|else|for|while|switch|case|def|public|private|protected|static|void|new|async|await|try|catch|throw|interface|type|struct|impl|fn|use|package|namespace)\b/;

export function initMinimap() {
  canvas = document.getElementById('minimap');
  wrap = document.getElementById('minimap-wrap');
  slider = document.getElementById('minimap-slider');
  if (!canvas || !wrap || !slider) return;
  ctx = canvas.getContext('2d');

  const observer = new ResizeObserver(() => {
    resizeMinimap();
    scheduleDraw();
  });
  observer.observe(wrap);

  app.cm?.on('changes', scheduleDraw);
  app.cm?.on('swapDoc', () => {
    scheduleDraw();
    updateSlider();
  });
  app.cm?.on('scroll', updateSlider);

  wrap.addEventListener('mousedown', startDrag);

  registerCommand({
    id: 'view.toggleMinimap',
    label: 'Toggle Minimap',
    scope: 'global',
    checked: () => app.settings.minimap,
    run: () => applyMinimap(!app.settings.minimap)
  });

  applyMinimap(app.settings.minimap, { persist: false });
}

export function applyMinimap(enabled, { persist = true } = {}) {
  app.settings.minimap = Boolean(enabled);
  document.body.classList.toggle('no-minimap', !app.settings.minimap);
  if (persist) persistSettings({ minimap: app.settings.minimap });
  if (app.settings.minimap) {
    requestAnimationFrame(() => {
      resizeMinimap();
      drawMinimap();
    });
  }
  app.hooks.resizeMinimap?.();
}

export function resizeMinimap() {
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  width = Math.max(0, Math.round(rect.width));
  height = Math.max(0, Math.round(rect.height));
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  if (app.settings.minimap && width > 0 && height > 0) scheduleDraw();
}

export function redrawMinimap() {
  readColors();
  drawMinimap();
}

export function syncMinimapScroll() {
  updateSlider();
}

function readColors() {
  const style = getComputedStyle(document.body);
  colors = {
    comment: style.getPropertyValue('--syn-comment').trim() || '#65737e',
    keyword: style.getPropertyValue('--syn-keyword').trim() || '#c695c6',
    string: style.getPropertyValue('--syn-string').trim() || '#99c794',
    base: style.getPropertyValue('--fg-muted').trim() || '#8493a1',
    accent: style.getPropertyValue('--accent').trim() || '#74a7d8'
  };
}

function scheduleDraw() {
  if (drawTimer) return;
  drawTimer = setTimeout(() => {
    drawTimer = null;
    drawMinimap();
  }, 60);
}

function drawMinimap() {
  const cm = app.cm;
  if (!ctx || !canvas || !cm || !app.settings.minimap || height < 4) return;
  if (!colors.base) readColors();
  if (!width || !height) resizeMinimap();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const lineCount = cm.lineCount();
  const padding = 6;
  const usable = Math.max(1, height - padding * 2);
  const lineH = Math.min(3, usable / Math.max(1, lineCount));
  const step = lineH < 1 ? Math.ceil(1 / lineH) : 1;
  const yFor = (line) => padding + line * lineH;

  const tab = activeTab();
  const cursorLine = tab ? (tab.cursor?.line ?? 0) : 0;

  for (let line = 0; line < lineCount; line += step) {
    const text = cm.getLine(line);
    if (!text) continue;
    const trimmedLeft = text.replace(/^\s+/, '');
    if (!trimmedLeft) continue;
    const indent = text.length - trimmedLeft.length;
    let x = 4 + Math.min(indent, 30) * 0.45;
    const y = yFor(line);

    const isComment = COMMENT_LINE.test(text);
    const isKeyword = KEYWORD_LINE.test(trimmedLeft);
    const hasString = /["'`]/.test(trimmedLeft);
    ctx.fillStyle = isComment
      ? colors.comment
      : isKeyword
        ? colors.keyword
        : hasString
          ? colors.string
          : colors.base;
    ctx.globalAlpha = isComment ? 0.4 : isKeyword ? 0.56 : 0.5;

    const blockH = clamp(lineH * step * 0.72, 1, 2.4);
    const parts = trimmedLeft.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      const partWidth = part.length * 0.62;
      if (/\s/.test(part[0])) {
        x += Math.max(1, partWidth * 0.6);
        continue;
      }
      if (x >= width - 4) break;
      const drawWidth = Math.min(partWidth, width - 4 - x);
      if (drawWidth > 0.4) ctx.fillRect(x, y, drawWidth, blockH);
      x += partWidth + 0.8;
    }
  }

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = colors.accent;
  ctx.fillRect(2, yFor(cursorLine), width - 4, clamp(lineH * step * 0.8, 1, 2.5));
  ctx.globalAlpha = 1;

  updateSlider();
}

function updateSlider() {
  const cm = app.cm;
  if (!slider || !cm) return;
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = null;
    if (!slider) return;
    if (document.body.classList.contains('no-minimap')) return;
    const info = cm.getScrollInfo();
    const viewH = info.clientHeight;
    const total = Math.max(1, info.height);
    const trackTop = 6;
    const trackHeight = Math.max(1, height - 12);
    const ratio = clamp(viewH / total, 0.02, 1);
    const sliderH = Math.max(18, trackHeight * ratio);
    const maxTop = Math.max(0, trackHeight - sliderH);
    const top = clamp((info.top / Math.max(1, total - viewH)) * maxTop, 0, maxTop);
    slider.style.height = `${sliderH}px`;
    slider.style.top = `${trackTop + top}px`;
  });
}

function startDrag(event) {
  if (event.button !== 0 || !app.cm) return;
  event.preventDefault();
  const rect = wrap.getBoundingClientRect();
  const cm = app.cm;
  const info = cm.getScrollInfo();
  const trackTop = 6;
  const trackHeight = Math.max(1, height - 12);
  const ratioOf = (clientY) => clamp((clientY - rect.top - trackTop) / trackHeight, 0, 1);

  const apply = (clientY) => {
    const ratio = ratioOf(clientY);
    const target = ratio * Math.max(0, info.height - info.clientHeight);
    cm.scrollTo(null, target);
  };

  apply(event.clientY);
  dragging = true;
  document.body.style.cursor = 'row-resize';
  const onMove = (moveEvent) => {
    if (dragging) apply(moveEvent.clientY);
  };
  const onUp = () => {
    dragging = false;
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    cm.focus();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
