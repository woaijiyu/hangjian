import { app } from './state.js';
import { icon, icons } from './icons.js';
import { isEditable } from './utils.js';
import { t } from './i18n.js';

const TOAST_ICONS = {
  info: icons.info,
  success: icons.success,
  warning: icons.warning,
  error: icons.error
};

export function toast(message, type = 'info', timeout = 3200) {
  const container = document.getElementById('toasts');
  if (!container) return;
  while (container.children.length >= 4) {
    container.firstElementChild?.remove();
  }
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.innerHTML = TOAST_ICONS[type] || TOAST_ICONS.info;
  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;
  node.append(iconEl, text);
  container.appendChild(node);

  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    if (!node.isConnected) return;
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 150);
  };
  node.addEventListener('click', dismiss);
  timer = setTimeout(dismiss, timeout);
}

let currentModal = null;

export function closeModal(value = null) {
  if (!currentModal) return;
  currentModal.finish(value);
}

export function showModal(options) {
  if (currentModal) currentModal.finish(null);

  const {
    title = '',
    content = '',
    buttons = [{ id: 'ok', label: t('OK'), variant: 'primary' }],
    width = 'normal',
    dismissible = true,
    escapeValue = null,
    submitOnEnter = false,
    onMount = null
  } = options || {};

  const layer = document.getElementById('modal-layer');
  const modal = layer.querySelector('.modal');
  const titleEl = document.getElementById('modal-title');
  const bodyEl = document.getElementById('modal-body');
  const footerEl = document.getElementById('modal-footer');
  const closeBtn = document.getElementById('modal-close');

  modal.classList.toggle('wide', width === 'wide');
  modal.style.width = typeof width === 'number' ? `${width}px` : '';
  titleEl.textContent = title;
  bodyEl.innerHTML = '';
  footerEl.innerHTML = '';
  closeBtn.classList.toggle('hidden', !dismissible);

  if (content instanceof Node) {
    bodyEl.appendChild(content);
  } else if (typeof content === 'string') {
    bodyEl.innerHTML = content;
  }

  let primaryButton = null;
  for (const button of buttons) {
    const el = document.createElement('button');
    el.className = `btn ${button.variant || ''}`.trim();
    el.textContent = button.label;
    el.dataset.action = button.id;
    if (button.variant === 'primary') primaryButton = el;
    footerEl.appendChild(el);
  }
  footerEl.classList.toggle('hidden', !buttons.length);

  const previousFocus = document.activeElement;

  return new Promise((resolve) => {
    let finished = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      app.modalOpen = false;
      layer.classList.add('hidden');
      bodyEl.innerHTML = '';
      footerEl.innerHTML = '';
      modal.style.width = '';
      currentModal = null;
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };

    const finish = (value) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };

    const firstFocusable = () => {
      const nodes = Array.from(
        modal.querySelectorAll(
          'input:not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      return nodes[0] || modal;
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(escapeValue);
        return;
      }
      if (event.key === 'Enter' && submitOnEnter) {
        const target = event.target;
        if (target && target.classList && target.classList.contains('text-input')) {
          event.preventDefault();
          event.stopPropagation();
          if (primaryButton) primaryButton.click();
        }
        return;
      }
      if (event.key === 'Tab') {
        const focusables = Array.from(
          modal.querySelectorAll(
            'input:not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    layer.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.action === 'cancel') finish(escapeValue ?? 'cancel');
        else finish(button.dataset.action);
      });
    });

    closeBtn.onclick = () => finish(escapeValue ?? 'cancel');
    layer.onmousedown = (event) => {
      if (event.target === layer && dismissible) finish(escapeValue);
    };

    document.addEventListener('keydown', onKey, true);

    app.modalOpen = true;
    layer.classList.remove('hidden');
    currentModal = { finish };

    const target = bodyEl.querySelector('input.text-input, textarea, select') || firstFocusable();
    requestAnimationFrame(() => {
      try {
        target.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      onMount?.();
    });
  });
}

export async function promptInput({
  title,
  label = '',
  value = '',
  placeholder = '',
  confirmText = null
}) {
  const wrapper = document.createElement('div');
  if (label) {
    const labelEl = document.createElement('label');
    labelEl.className = 'field-label';
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'text-input';
  input.value = value;
  input.placeholder = placeholder;
  input.spellcheck = false;
  input.autocomplete = 'off';
  wrapper.appendChild(input);

  const result = await showModal({
    title,
    content: wrapper,
    buttons: [
      { id: 'cancel', label: t('Cancel') },
      { id: 'ok', label: confirmText ?? t('OK'), variant: 'primary' }
    ],
    dismissible: false,
    escapeValue: 'cancel',
    submitOnEnter: true,
    onMount: () => {
      input.focus();
      const dot = value.lastIndexOf('.');
      if (/file|文件名/i.test(label) && dot > 0) {
        input.setSelectionRange(0, dot);
      } else {
        input.select();
      }
    }
  });

  if (result !== 'ok') return null;
  return input.value.trim();
}

export async function confirmDialog({
  title,
  message,
  confirmText = null,
  danger = false,
  dismissible = true
}) {
  const wrapper = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = message;
  wrapper.appendChild(p);

  const result = await showModal({
    title,
    content: wrapper,
    buttons: [
      { id: 'cancel', label: t('Cancel') },
      { id: 'confirm', label: confirmText ?? t('OK'), variant: danger ? 'danger' : 'primary' }
    ],
    dismissible,
    escapeValue: 'cancel'
  });
  return result === 'confirm';
}

export async function infoDialog({ title, content, width = 'normal' }) {
  await showModal({
    title,
    content,
    buttons: [{ id: 'ok', label: t('Close'), variant: 'primary' }],
    dismissible: true,
    escapeValue: 'ok',
    width
  });
}

export function isModalOpen() {
  return Boolean(currentModal);
}

export function focusEditorSoon() {
  requestAnimationFrame(() => {
    if (!app.cm) return;
    if (isEditable(document.activeElement) && !document.activeElement.closest?.('.CodeMirror')) return;
    app.cm.focus();
  });
}

export function iconMarkup(name) {
  return icon(name);
}
