# Interline

A fast, keyboard-driven text and code editor inspired by Sublime Text. Built with
Electron and CodeMirror, with a compact interface that stays out of the way.

## Highlights

- Tabs with per-file history, indentation and line endings
- Multi-cursor editing, column selection and Sublime-style key bindings
- Find and replace, find in files, and a fuzzy command palette
- File tree, recent files and session restore
- Minimap, fold gutter, bracket matching and word completion
- Four themes: **Mariana**, **Monokai**, **One Dark** and **Adaptive Light**

## Keyboard

| Action | Shortcut |
| --- | --- |
| Go to file | `Ctrl+P` |
| Command palette | `Ctrl+Shift+P` |
| Find / replace | `Ctrl+F` / `Ctrl+H` |
| Find in files | `Ctrl+Shift+F` |
| Select next occurrence | `Ctrl+D` |
| Toggle sidebar | `Ctrl+B` |
| Toggle word wrap | `Alt+Z` |

## Getting started

```bash
npm install
npm start
```

Open a folder with `Ctrl+Shift+O`, then use the palette to jump between files.
Interline remembers the folder, open tabs and window position between launches.

> Tip: press `Ctrl+Shift+F` and search for `theme` to sweep the whole workspace.

## Project layout

```
demo/
├── app.js         workspace session helpers
├── server.py      tiny static file server
├── theme.css      Mariana colour scheme
├── settings.json  sample configuration
└── src/           nested demo sources
```

The editor keeps everything local: no telemetry, no background services, and
files are only written when you save them.
