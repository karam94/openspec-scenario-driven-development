# Shared skills

Single, tool-agnostic home for the skills the atdd-driven OpenSpec workflow depends on:

- `openspec-atdd/` — initialise and drive the workflow across Kiro, Kiro Crew, and Claude.
- `grill-with-docs/` — interrogate a change against the domain before building it.
- `codebase-design/` — deep-module design guidance.
- `atdd/` — acceptance test-driven development through outside-in RED/GREEN/REFACTOR.
- `code-review/` — independent, read-only review with structured findings and a verdict.

These live here **once**. Each tool's skills directory holds a symlink back to this folder, so there is a single source of truth and the copies cannot drift:

- `.claude/skills/<name>` → `../../skills/<name>` (Claude Code)
- `.kiro/skills/<name>` → `../../skills/<name>` (Kiro)
- Other tools follow the same adapter pattern: `<tool-dir>/skills/<name>` → `../../skills/<name>`

## Tool discovery

Extracting the package over a repository wires the skills into both supported tools:

- **Claude Code** discovers `.claude/skills/` automatically. The Engineer adapter lists `openspec-atdd` first in its skills frontmatter.
- **Kiro** discovers `.kiro/skills/`. The Engineer adapter also loads `openspec-atdd` explicitly through its resources list.
- **Kiro Crew** uses the same Kiro Engineer resource and additionally needs generated `opsx-*` prompts copied to `~/.kiro/prompts/`, as documented by `openspec-atdd`.
- **Other tools** can add a thin agent adapter and symlink the canonical skills into their native skill directory.

Edit a skill once in `skills/`; every adapter resolves that same content.
