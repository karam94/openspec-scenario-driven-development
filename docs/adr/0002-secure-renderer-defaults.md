# 2. Secure Electron renderer defaults (contextIsolation + preload)

Date: 2026-09-17

## Status

Accepted

## Context

Going IPC-native (ADR-0001) means the renderer (`index.html`) reaches privileged
filesystem/CLI operations exposed by the Electron main process. Two postures were
on the table:

1. **Relaxed** — `nodeIntegration: true`, `contextIsolation: false`, no preload.
   The renderer calls `core.js` directly; least code. Safe *only* while the app
   loads first-party local content and renders it as text, because a renderer that
   has Node turns any injected script into `require('child_process').exec(...)` —
   full RCE.
2. **Secure defaults** — `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`, with a minimal preload exposing only named `contextBridge`
   channels. Even a stored-XSS in displayed content cannot reach Node.

The deciding factor is the near-term roadmap: the app is expected to **fetch and
display Asana tickets**. Ticket titles/descriptions/comments are multi-author,
third-party content (likely rendered rich), which is precisely the untrusted-input
case that turns a renderer XSS into RCE under the relaxed posture. Choosing relaxed
now would create a security tripwire that must be re-hardened before that feature
can ship.

## Decision

Adopt secure renderer defaults from the start:

- `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. The renderer has no direct Node access.
- A minimal `preload.js` exposing exactly three `contextBridge` channels —
  `getStatus()`, `readFile(path)`, `archive({repoPath, change})` — each backed by
  an `ipcMain.handle` that calls `core.js`. No generic command passthrough.
- The two correctness/security guards stay in `core.js`, enforced by the handlers:
  archive only for a discovered repo + real change; file reads scoped inside a
  discovered repo.
- When Asana (or any remote fetch) is added: all network calls and API tokens live
  in the **main process**; only sanitized data crosses IPC; displayed remote
  content is rendered as text or sanitized (never raw `innerHTML`); a
  `Content-Security-Policy` is set on the renderer.

## Consequences

- Slightly more wiring than the relaxed posture (a preload + three IPC channels)
  for the same current behaviour and identical UI.
- No security tripwire: the planned Asana/remote-content feature can be added
  without a renderer-hardening migration first.
- The renderer cannot be trivially extended to call arbitrary Node APIs — new
  privileged capability must be added deliberately as a new, named IPC channel,
  which keeps the attack surface explicit and reviewable.

## Notes

Supersedes an earlier draft of this ADR (relaxed posture: `nodeIntegration` on for
a local, no-network tool), reversed during the Grill once the Asana feature's
untrusted-content implications were surfaced.
