# 3. Hermetic e2e launch seams (env scan-root + skip login-shell PATH)

Date: 2026-09-17

## Status

Accepted

## Context

The app is verified today only by vitest unit/component tests that use fakes;
nothing launches the real Electron process, so "does the built app actually work"
is answered by a manual smoke test. Adding a Playwright `_electron.launch` suite
to retire that manual pass (OpenSpec change `tentacles-e2e-smoke-tests`) requires
the real launched app to render **deterministic** data — but the app is
non-deterministic by construction:

- It has **no CLI flags** (a double-clicked `.app` cannot take them), so the only
  injection surface is the environment.
- `getStatus` scans a live `~/Code` tree and shells out to the real `openspec` and
  `gh` binaries, whose output depends on the developer's actual repositories.
- `bootstrap()` resolves the **login-shell PATH** and overwrites
  `process.env.PATH` before the first `getStatus` (macOS GUI apps inherit only a
  minimal PATH, so this is how the real CLIs become resolvable).

To make a real launch assertable, two things must be controllable from the test:
the directory the app scans, and which `openspec`/`gh` binaries it invokes. A
future reader will find both a little surprising — *why does `defaultArgs()` read
an env var, and why is PATH resolution sometimes skipped?* — so the rationale is
worth pinning.

Options considered:

1. **Let e2e hit real `~/Code` + real CLIs.** No production change, but not
   hermetic — output varies per machine and per day, so nothing can be asserted.
2. **Mock at the IPC layer** (fake `window.electronAPI` in the launched renderer).
   Deterministic, but it stubs out the real main process, preload bridge, and IPC
   round-trip — exactly the layers this suite exists to exercise. It would re-test
   what the vitest fakes already cover.
3. **A full fake `HOME` directory.** Heavier than needed and still doesn't make the
   external CLIs deterministic.
4. **Two minimal environment seams** — override the scan root, and skip the PATH
   overwrite so an injected stub-bin PATH survives.

## Decision

Add exactly two small, self-describing, prod-harmless environment seams — the
entire production footprint of the e2e change:

- **`TENTACLES_ROOT` (+ optional `TENTACLES_DEPTH`)** — `core.defaultArgs()` reads
  these and uses them as the scan root/depth. Unset → today's `~/Code` / depth 30.
  Playwright points this at a committed read-only fixtures tree.
- **`TENTACLES_E2E`** — when set, `main.ts` wires a **no-op `resolvePath`** instead
  of `resolveShellPath(loginShellPath, …)`, so the `PATH` injected into the
  launched process (prepended with committed stub `openspec`/`gh` executables)
  survives. `bootstrap()` already `await`s `resolvePath()` before opening the
  window, so a no-op simply leaves `PATH` untouched — the startup ordering
  contract is unchanged. Unset → login-shell PATH resolution runs exactly as today.

Both seams default to current production behaviour when their variables are unset,
and each has an explicit "absent env preserves today's defaults" acceptance
scenario in `specs/hermetic-launch-configuration/` guarding that.

Everything else the suite needs is handled test-side with no production hook: the
external-link assertion monkeypatches `shell.openExternal` in the main process via
`electronApp.evaluate`; the archive assertion reads the stub's invocation log; the
auto-refresh assertion drives `page.clock`.

## Consequences

- The real Electron process, preload bridge, IPC round-trip, `BrowserWindow`, and
  `shell.openExternal` are exercised end-to-end, so a green `npm run e2e` retires
  manual smoke of the running app.
- Two env reads appear in production code that only the e2e harness sets. They are
  named to read as intent (`TENTACLES_E2E`, `TENTACLES_ROOT`) and are no-ops in a
  normal launch, so the production behaviour is unchanged and there is no security
  or performance cost when unset.
- e2e uses **stub** CLIs, so real-CLI JSON-shape drift and a real `openspec
  archive` moving directories are **not** exercised by this suite — they remain
  covered by the `core.ts` unit tests. Likewise real login-shell PATH resolution
  is skipped under the flag and stays covered by `path.test.ts`. This residual is
  intentional: the suite covers the running app's behaviour, not real-CLI
  integration or packaging (which stays a one-off manual check at DMG-release
  time).

## Notes

Reversed from an earlier grilling draft that floated an env-configurable refresh
interval and a production test-hook for external-link invocation; both were dropped
as avoidable — `page.clock` and a main-process `shell.openExternal` monkeypatch
achieve the same observation with zero production surface, keeping the footprint to
these two seams. Sits alongside ADR-0001 (IPC-native) and ADR-0002 (secure
renderer defaults).
