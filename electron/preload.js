const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('interline', {
  app: {
    info: () => ipcRenderer.invoke('app:info')
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    toggleFullscreen: () => ipcRenderer.invoke('window:toggle-fullscreen'),
    toggleDevtools: () => ipcRenderer.invoke('window:toggle-devtools'),
    confirmClose: () => ipcRenderer.invoke('window:confirm-close'),
    onState: (cb) => on('window:state', cb)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch)
  },
  dialogs: {
    openFiles: () => ipcRenderer.invoke('dialog:open-files'),
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
    saveFile: (opts) => ipcRenderer.invoke('dialog:save-file', opts)
  },
  fs: {
    read: (path, options) => ipcRenderer.invoke('fs:read-file', { path, ...(options || {}) }),
    write: (payload) => ipcRenderer.invoke('fs:write-file', payload),
    stat: (path) => ipcRenderer.invoke('fs:stat', path),
    readDir: (path) => ipcRenderer.invoke('fs:read-dir', path),
    createFile: (dir, name) => ipcRenderer.invoke('fs:create-file', { dir, name }),
    createFolder: (dir, name) => ipcRenderer.invoke('fs:create-folder', { dir, name }),
    rename: (oldPath, newPath) => ipcRenderer.invoke('fs:rename', { oldPath, newPath }),
    trash: (path) => ipcRenderer.invoke('fs:trash', path),
    reveal: (path) => ipcRenderer.invoke('fs:reveal', path),
    join: (parts) => ipcRenderer.invoke('path:join', parts)
  },
  searchInFiles: (opts) => ipcRenderer.invoke('search:in-files', opts),
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard:write-text', text),
    readText: () => ipcRenderer.invoke('clipboard:read-text')
  },
  onFilesOpen: (cb) => on('files:open-paths', cb),
  onCloseRequested: (cb) => on('app:close-requested', cb),
  onDemoOpen: (cb) => on('demo:open', cb)
});

window.addEventListener('dragover', (event) => {
  if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
    event.preventDefault();
  }
});

window.addEventListener('drop', (event) => {
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  const paths = files
    .map((file) => {
      try {
        return webUtils.getPathForFile(file);
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  if (paths.length) ipcRenderer.send('files:dropped', paths);
});
