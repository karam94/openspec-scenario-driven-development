# Context — Tentacles Board

The Tentacles board is a native macOS app that surveys the OpenSpec changes across your
repositories and shows, at a glance, how far each one has progressed.

## Glossary

### Change
A single OpenSpec unit of work living under a repo's `openspec/changes/<name>/`. The board
shows one card chain per change.

### Phase
A stage in a change's lifecycle, shown as a node in the card chain:
grill → proposal → specs → design → tasks → apply → review → done.

### Phase complete
A phase is **complete when the next phase's artifact exists**, not merely when the phase's own
artifact exists. For example, grilling is complete once `proposal.md` exists — the presence of
`grill.md` alone does **not** mean grilling has finished, because that file is written while the
interview is still in progress. The final planning phase, having no successor artifact, is
complete once the plan as a whole is complete.

### Scan root
The directory the board scans for repositories that contain OpenSpec changes. Chosen by the user
in Settings; falls back to an environment override and then to a default location when unset.

### Target
An AI coding host the workflow can be set up for: **Claude**, **Kiro**, or **Kiro Crew**. Kiro Crew
is a superset of Kiro (everything Kiro needs, plus its host wiring). A user may set up more than one
target on the same machine.
_Avoid_: Tool, adapter, platform.

### Setup
Installing everything a chosen target needs — globally, on the user's machine — so the atdd-driven
OpenSpec workflow can run: the canonical skills, the agent adapters, OpenSpec's global configuration,
and any target-specific host wiring. Setup is global only; it never overlays an individual repository.
_Avoid_: Install, configure, provision.

### Doctor
A check that verifies a target's Setup is present and correct and reports each finding pass/fail. When
findings fail, the doctor offers to repair them (a repair re-runs Setup for the affected target).
_Avoid_: Health check, verify, lint.
