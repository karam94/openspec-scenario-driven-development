# OpenSpec Board — macOS app (`tentacles`)

A native macOS Electron app for the OpenSpec Board. It renders the same board as
`board/server.js` (dark-navy theme, phase chain, type badge, PR link, archive
button, file modal, 15s auto-refresh) but launches from the Dock/Finder with no
terminal and no localhost port.

## Architecture

IPC-native — there is **no HTTP server**. The Electron main process invokes the
board logic directly and exposes it to the renderer over three named IPC channels
through a minimal preload bridge:

| File | Role |
| --- | --- |
| `main.js` | Electron entry: resolves the login-shell PATH, registers IPC, creates the window, wires lifecycle. |
| `wiring.js` | Pure, testable wiring (IPC handler factories, secure window, lifecycle, PATH resolution). Takes Electron objects as parameters so tests need no Electron. |
| `core.js` | The board scan/status/archive/file logic. |
| `preload.js` | `contextBridge` exposing exactly `getStatus` / `readFile` / `archive`. |
| `index.html` | The board UI (copied from `board/index.html`; the three data calls swapped to the bridge and the legacy HTTP-only `file://` guard block removed). |

The renderer runs with secure defaults (`contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`) — see `docs/adr/0002-secure-renderer-defaults.md`.

> **`core.js` was forked from `board/server.js`** at the introduction of this app
> (OpenSpec change `board-electron-app`). The original `board/server.js` is kept
> unchanged as the reference HTTP board. Board behaviour changes made after this
> point must be applied to both until they are consolidated.

## Develop

```bash
cd board/tentacles
npm install
npm test        # Vitest — unit tests for the main-process seams
npm start       # launch the app in development
```

## Build a macOS app

```bash
npm run build   # electron-builder → dist/ (unsigned .app + DMG)
```

The build is **unsigned / un-notarized**, so on first launch macOS Gatekeeper
requires right-click → Open (once). Code signing + notarization is future scope.

## Scope

Scans the defaults (`~/Code`, depth 30) with no in-app settings. Notifications,
tray/menu-bar, native open-in-editor, an in-app root/depth picker, signing, and a
Playwright-Electron E2E harness are all future scope.
