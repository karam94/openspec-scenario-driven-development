# Shared skills

Single, tool-agnostic home for the skills the atdd-driven OpenSpec workflow depends on:

- `atdd/` — acceptance test-driven development (outside-in red/green/refactor).
- `grill-with-docs/` — interrogate a change against the domain before building it.
- `codebase-design/` — deep-module design guidance.

These live here **once**. Each tool's skills directory holds a symlink back to this folder, so there is a single source of truth and the copies can never drift:

- `.claude/skills/<name>` → `../../skills/<name>` (Claude Code)
- `.kiro/skills/<name>` → `../../skills/<name>` (Kiro)
- add other tools (e.g. Codex) the same way: `<tool-dir>/skills/<name>` → `../../skills/<name>`

## These are not installed just by cloning

Pulling this repo puts the skills on disk but does **not** wire them into your assistant. Point your tool at them:

- **Claude Code** — discovers `.claude/skills/` in the project automatically once you open the repo. Nothing else to do.
- **Kiro** — loads skills from `~/.kiro/crew/skills/`. Symlink each one there, e.g.
  `ln -s "$PWD/skills/atdd" ~/.kiro/crew/skills/atdd` (repeat for `grill-with-docs`, `codebase-design`).
- **Other tools** — symlink or copy `skills/<name>` into wherever that tool loads skills from.

Edit a skill once, here, and every tool that symlinks to it picks up the change.
