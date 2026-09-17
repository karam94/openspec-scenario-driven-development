# 1. IPC-native Electron board, no HTTP server

Date: 2026-09-17

## Status

Accepted

## Context

The OpenSpec Board is a zero-dependency Node HTTP server (`board/server.js`) that
serves a single-page dashboard (`board/index.html`) and talks to it over
`fetch('/api/…')` on `127.0.0.1:7788`. We want a native macOS Electron app.

Two architectures were available:

1. **HTTP-in-a-BrowserWindow ("shell only")** — bundle the unchanged `server.js`
   as a child process, load `http://127.0.0.1:7788` in a `BrowserWindow`. Smallest
   diff, `index.html` untouched, keeps run-in-any-browser mode. But it retains a
   localhost port inside the app, and it is throwaway scaffolding if we later want
   a native IPC surface.
2. **IPC-native** — no HTTP, no port. The scan/status/archive/file logic is invoked
   directly by the Electron main process; the renderer calls it in-process instead
   of over `fetch`.

We confirmed during the Grill that IPC-native can fully replicate today's board:
nothing in the board is HTTP-specific — it is all filesystem and CLI work the main
process can do directly. The original reason for Electron (a sandboxed-iframe
artifact could not reach fs/CLI) is satisfied by any real Node process, so it does
not force either architecture.

## Decision

Build the Electron app **IPC-native**. There is no HTTP server and no localhost
port in the app. The board logic is lifted from `server.js` into
`board/tentacles/core.js` and invoked by the Electron main process; the renderer's
three data calls (`/api/status`, `/api/file`, `/api/archive`) become preload-bridge
calls handled by `ipcMain.handle`, which invoke `core.js` (see ADR-0002 for the
renderer security posture).

The existing HTTP board (`board/server.js`, `board/index.html`, `board/README.md`)
is **retained alongside the new app as a reference implementation** — its logic is
not refactored (the only edit is a one-line scan-depth default bump, 4→30, so the
app and the board agree). Because the old board's logic is untouched there is no
shared module: `board/tentacles/core.js` is a fork of `server.js`'s logic.

## Consequences

- No localhost port and no HTTP listener in the app — a smaller surface and no
  EADDRINUSE/port-collision handling needed.
- The board logic is **duplicated** (old `server.js` and new `board/tentacles/core.js`).
  Future board behaviour changes must be applied to both. This is the accepted
  price of keeping the old board as an untouched working reference.
- The run-in-any-browser mode is **not** available in the new app (it never binds
  a port). The old board still provides it via `node board/server.js`.
- No throwaway HTTP scaffolding was built; the app is at its intended end-state
  architecture immediately.
