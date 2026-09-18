# 5. Settings-tool IPC channels (install + doctor)

Date: 2026-09-18

## Status

Accepted

## Context

The board gains a Settings **Setup** tab that configures the machine for the
atdd-driven OpenSpec workflow: the user picks host targets (Claude / Kiro / Kiro
Crew), presses **Install**, and runs a **Doctor** that verifies and offers a
repair. These are privileged operations — copying the canonical `skills/` and
agent adapters into `~/.claude` / `~/.kiro`, writing OpenSpec's global config,
and shelling out to `setup-kiro-crew.sh` / `kirocrew` / `openspec`.

ADR-0001 established the board as IPC-native with a small, closed set of named
channels typed against `ChannelMap`, and ADR-0002 keeps the renderer sandboxed so
it cannot touch the shell or filesystem directly. Any new privileged capability
therefore has to cross the same typed boundary rather than being reached from the
renderer, and it must not reintroduce a generic command passthrough.

## Decision

Add exactly two new channels to `ChannelMap`:

| Channel | Payload | Result |
| --- | --- | --- |
| `board:install` | `{ targets: Target[] }` | `{ steps: ResultRow[] }` |
| `board:doctor` | `{ targets: Target[] }` | `{ checks: ResultRow[] }` |

Both are added in all four places the boundary is defined (the shared
`ChannelMap`, the main-process `IPC` registry, the preload `CHANNELS`, and the
`ElectronAPI` surface), so the compiler keeps them in exact agreement exactly as
it does for the pre-existing channels.

The *decision* of what an install/doctor run does is a pure function in
`core.ts` — `planInstall(targets, ctx)` returns an ordered, deduplicated list of
labelled `InstallStep`s and `planDoctorChecks(targets, ctx)` returns a list of
`DoctorCheck`s. The *side effects* (fs copy, `execFile`) live behind an injected
executor/probe, mirroring the existing injectable `archiver` seam on
`archiveChange`. The handlers iterate the plan run-all-and-report: every step is
attempted, a failure becomes a `{ ok: false, reason }` row, and the run never
aborts on the first failure. Install and Doctor share the `ResultRow` shape so the
renderer renders both with one visual language, and Doctor's repair is a
re-invocation of `board:install` (no separate repair channel).

Alternatives rejected:

- **A single generic `command` channel with a discriminator** — reintroduces the
  generic passthrough ADR-0001/0002 deliberately avoided.
- **Imperative install/doctor code that copies and execs inline** — untestable
  without touching the real `~/.kiro` / `~/.claude`, and cannot prove the
  detect-not-install guard or the Kiro-Crew-⊇-Kiro invariant structurally.
- **A distinct `repair` channel** — redundant with `install`, which is exactly
  what a repair re-runs.

## Consequences

- The renderer stays sandboxed; all privileged setup work stays in main behind
  two typed channels. All writes land under `$HOME` (no elevation), the sole
  exception being the `openspec init` step, which generates the `opsx-*` prompts
  in the app's own bundle checkout before they are copied under `$HOME`.
- The planner/checker are unit-testable as data, so "Kiro Crew is a superset of
  Kiro", "the plan never auto-installs the OpenSpec CLI", and per-step
  reporting are pinned at a seam without any I/O.
- The closed channel set grows to eight (`board:install` and `board:doctor` join
  the existing six); the `bootstrap` ordering test asserts eight handlers
  register before the first window opens.
