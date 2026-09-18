# OpenSpec Board — macOS app (`tentacles`)

A native macOS Electron app for the OpenSpec Board. It renders the same board as
`board/server.js` (dark-navy theme, phase chain, type badge, PR link, archive
button, file modal, 15s auto-refresh) but launches from the Dock/Finder with no
terminal and no localhost port.

## Architecture

IPC-native — there is **no HTTP server**. The Electron main process invokes the
board logic directly and exposes it to the renderer over eight named IPC channels
through a minimal preload bridge:

| File | Role |
| --- | --- |
| `main.js` | Electron entry: resolves the login-shell PATH, registers IPC, creates the window, wires lifecycle. |
| `wiring.js` | Pure, testable wiring (IPC handler factories, secure window, lifecycle, PATH resolution). Takes Electron objects as parameters so tests need no Electron. |
| `core.js` | The board scan/status/archive/file logic, plus the pure setup install-planner / doctor-checker. |
| `preload.js` | `contextBridge` exposing exactly `getStatus` / `readFile` / `archive` / `getSettings` / `setSettings` / `chooseDirectory` / `install` / `doctor`. |
| `index.html` | The board UI (copied from `board/index.html`; the three data calls swapped to the bridge and the legacy HTTP-only `file://` guard block removed). |

The `install` / `doctor` channels back the Settings **Setup** tab (configure the
machine for Claude / Kiro / Kiro Crew, verify, repair) — see
`docs/adr/0005-settings-tool-ipc-channels.md`.

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

## Pre-ship smoke gate (`npm run e2e`)

```bash
npm run e2e     # compile, then launch the REAL app and drive it with Playwright
```

`npm run e2e` boots the compiled app via Playwright's `_electron.launch` and
drives it end-to-end against committed fixtures + stub `openspec`/`gh` CLIs —
single secure window, seeded board render, phase chain + badges, PR link opening
externally, archive round-trip, file modal, theme toggle, and auto-refresh. A
green run replaces the manual smoke test of the running app after any change.

Run it on a normal macOS login session (Electron launches under its OS sandbox as
a user would). On a restricted/headless host (CI, a sandboxed shell) where the OS
sandbox can't initialise, set `E2E_NO_SANDBOX=1 npm run e2e`. The suite is a
local pre-ship gate; no CI runs it yet. What it does **not** cover (still a manual
check): real `openspec`/`gh` output drift, real login-shell PATH resolution, and
DMG/Gatekeeper packaging — those stay on the unit tests or a release-time check.

## Build a macOS app

```bash
npm run build   # electron-builder → dist/ (unsigned .app + DMG)
```

The build is **unsigned / un-notarized**, so on first launch macOS Gatekeeper
requires right-click → Open (once). Code signing + notarization is future scope.

## Scope

Scans the defaults (`~/Code`, depth 30) with no in-app settings. Notifications,
tray/menu-bar, native open-in-editor, an in-app root/depth picker, and signing
are all future scope. (The Playwright-Electron E2E harness — `npm run e2e` — is
now shipped; see the pre-ship smoke gate above.)
