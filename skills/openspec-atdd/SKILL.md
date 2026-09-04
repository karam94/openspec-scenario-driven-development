---
name: openspec-atdd
description: Set up and drive the atdd-driven OpenSpec workflow in Kiro, Kiro Crew, or Claude, one artifact and one scenario at a time.
---

# OpenSpec ATDD

Load this skill before any OpenSpec planning or implementation work. It is the source of truth for initialising OpenSpec, invoking workflow commands on each supported tool, pausing for user review, resuming interrupted work, and completing the independent review gate.

## When to use

Use this skill for two jobs:

1. **Setup** — prepare a repository after this package has been extracted over it.
2. **Workflow** — drive every feature, bug, refactor, or cleanup through the `atdd-driven` schema.

Never begin implementation before the planning artifacts are complete and approved.

## Part 1 — One-time setup

### 1. Work on a feature branch

Create a branch from the repository's default branch without discarding existing work. Never push directly to a protected branch.

### 2. Verify the extracted package

The repository must contain:

- `openspec/schemas/atdd-driven/schema.yaml`
- `skills/openspec-atdd/SKILL.md`
- `skills/grill-with-docs/SKILL.md`
- `skills/codebase-design/SKILL.md`
- `skills/atdd/SKILL.md`
- `skills/code-review/SKILL.md`
- the corresponding `.kiro/skills/` and `.claude/skills/` links
- the `product-manager`, `engineer`, and `code-reviewer` adapters

If any are missing, stop and report that the package overlay is incomplete. Do not improvise replacements.

### 3. Register Kiro and Claude with OpenSpec

Run this even when an `openspec/` directory already exists; the directory does not prove either tool is registered.

```bash
openspec init --tools kiro,claude --profile custom --no-copilot-cloud
```

This generates each tool's native workflow commands while leaving the package's agent and skill adapters in place.

### 4. Enable the expanded workflow

The `new` and `continue` commands require the custom profile.

```bash
openspec config set profile custom
openspec config set workflows '["propose","explore","apply","update","sync","archive","new","continue","ff","verify","bulk-archive","onboard"]'
openspec update
```

The workflows value must be a JSON array.

### 5. Leave the default schema unchanged

Do not make `atdd-driven` the project default. Pass `--schema atdd-driven` when creating each change; OpenSpec persists that choice in the change metadata.

### 6. Kiro Crew prompt exposure

Kiro and Claude use project-local generated commands. Kiro Crew additionally requires the generated Kiro prompts in its global prompt directory:

```bash
mkdir -p "$HOME/.kiro/prompts"
cp -f .kiro/prompts/opsx-*.prompt.md "$HOME/.kiro/prompts/"
```

Skip this step when Kiro Crew is not being used.

### 7. Kiro Crew — the interactive Grill is pre-wired

The Grill is an interactive interview (see "The Grill is interactive"). On Kiro Crew the Engineer stands up a live `product-manager` session for it with the `session_create` tool. The Kiro Engineer adapter (`.kiro/agents/engineer.json`) already ships this wiring:

- `@kirocrew-core` and `@kirocrew-dashboard` are declared in the adapter's `tools` and `allowedTools` (the dashboard entry scoped to `session_create` / `session_send` / `session_read_message` / `session_stop`; `@kirocrew-core` provides `ask_question`).
- Both servers are declared under `mcpServers` as `kirocrew mcp-core` / `kirocrew mcp-dashboard`, resolved from `PATH` so the config stays host-agnostic (no absolute paths). This assumes the `kirocrew` launcher is on `PATH`, which is the case on a KiroCrew install.

On a host without KiroCrew (plain Kiro CLI, Claude, another OS) the `kirocrew` command simply will not resolve, the MCP servers will not start, and the Engineer falls back to the schema's STOP-and-hand-off behaviour rather than running a non-interactive Grill — no edit required.

### 8. Confirm setup

Confirm that:

- `openspec schemas` lists `atdd-driven (project)`.
- `openspec config list` reports the custom profile and includes `new` and `continue`.
- `openspec update` recognises both Kiro and Claude.
- all canonical skills, agent adapters, prompt references, and symlink targets exist.

## Part 2 — Invoke the workflow

Use the native command syntax for the active tool:

| Surface | New change | Continue | Apply | Archive |
| --- | --- | --- | --- | --- |
| Kiro Crew | `/prompts get @opsx-new <name> --schema atdd-driven` | `/prompts get @opsx-continue <name>` | `/prompts get @opsx-apply <name>` | `/prompts get @opsx-archive <name>` |
| Kiro CLI | `/opsx-new <name> --schema atdd-driven` | `/opsx-continue <name>` | `/opsx-apply <name>` | `/opsx-archive <name>` |
| Claude Code | `/opsx:new <name> --schema atdd-driven` | `/opsx:continue <name>` | `/opsx:apply <name>` | `/opsx:archive <name>` |

If generated commands are unavailable, use the raw CLI while preserving every pause and review gate:

```bash
openspec new change "<name>" --schema atdd-driven
openspec status --change "<name>" --json
openspec instructions <artifact-id> --change "<name>" --json
openspec apply --change "<name>"
openspec archive "<name>"
```

## The phases

OpenSpec delegates each phase to the package's logical agents:

1. **Grill** (interactive user interview) → `product-manager` → `grill-with-docs`
2. **Proposal** → `engineer`
3. **Specs** → `engineer` → `codebase-design`
4. **Design** → `engineer` → `codebase-design`
5. **Tasks** → `engineer`
6. **Apply** → `engineer` → `atdd`
7. **Independent review** → fresh `code-reviewer` → `code-review`

If already running as the agent requested by the schema, perform the phase directly rather than spawning a duplicate copy of the same agent.

### The Grill is interactive

The Grill is the one phase that is a live conversation with the user, not an autonomous artifact-writing task. `grill-with-docs` interviews the user one question at a time and waits for each answer, so the `product-manager` must be reached through an interactive channel:

- If you are already the `product-manager`, conduct the interview directly with the user.
- Otherwise delegate to the `product-manager` through the tool's interactive mechanism — a session or subagent whose questions surface to the user and whose answers route back (for example, a dedicated `product-manager` session the user drives).

A non-interactive, one-shot, or autonomous Grill — where the agent answers its own questions or runs with no live user channel — is never valid, even if it produces a plausible `grill.md`. If the active tool cannot give the `product-manager` an interactive channel to the user, STOP: tell the user, have them run the `product-manager` interactively until `grill.md` is written, then resume from `grill.md` on disk. Never fabricate the Grill to keep moving.

## Step 1 — Start a change

Create the change with `--schema atdd-driven`. The flag is mandatory on this step and unnecessary afterward because OpenSpec stores it with the change.

The new command scaffolds change metadata and identifies Grill as the first artifact. It must not create later artifacts or implementation code.

## Step 2 — One artifact at a time

Run Continue exactly once to produce the next ready artifact. The order is:

1. `grill.md`
2. `proposal.md`
3. `specs/<capability>/spec.md`
4. `design.md`
5. `tasks.md`

After every artifact:

1. Present it to the user.
2. Ask whether to iterate on the current artifact or continue.
3. Do not advance until the user chooses Continue.

Never use fast-forward; it bypasses the review loop.

If work is interrupted, resume from OpenSpec state rather than memory:

```bash
openspec status --change "<name>" --json
openspec instructions <artifact-id> --change "<name>" --json
```

## Step 3 — Apply one scenario at a time

After all planning artifacts are approved, run Apply.

For each scenario:

1. **RED** — add a failing acceptance test through the specified seam.
2. **GREEN** — make the smallest implementation change that satisfies it.
3. **REFACTOR** — improve the implementation while keeping all tests green.
4. Commit the completed scenario and capture the commit SHA.
5. Stop for user review before beginning another scenario.

Do not batch scenarios, guess ambiguous business behaviour, delete tests, or weaken assertions to manufacture a pass.

## Step 4 — Independent review gate

At the end of the assigned Apply scope, the Engineer must:

1. Create a fresh `code-reviewer` subagent using the active tool's native subagent mechanism.
2. Invoke it by agent identity so the reviewer uses the model declared by its own adapter; never let it inherit the Engineer model.
3. Supply the repository path, base branch, reviewed commit SHA, complete diff, OpenSpec artifacts, and validation results.
4. Fix every `BLOCKING` finding returned with `REQUEST_CHANGES`, commit the fixes, and create another fresh reviewer against the new SHA.
5. Continue only after `APPROVE`. Surface warnings and nits to the user.

The Engineer must never review its own work or substitute a generic agent for `code-reviewer`.

## Step 5 — Archive

After every scenario is complete, validation is green, independent review approves, and the user confirms completion, run Archive.

## Non-negotiables

- Always create changes with `--schema atdd-driven`.
- Load this skill before phase work or implementation.
- One artifact per Continue invocation.
- One scenario per Apply gate.
- User approval controls every transition.
- Never fast-forward.
- Never implement during planning.
- The Grill is an interactive user interview; never run it non-interactively or answer its questions on the user's behalf.
- Never fake green.
- Never skip the independent reviewer or override its configured model.
