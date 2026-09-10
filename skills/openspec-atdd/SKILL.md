---
name: openspec-atdd
description: Drive the atdd-driven OpenSpec workflow in Kiro, Kiro Crew, or Claude — one artifact and one scenario at a time, through Grill, planning, Apply, and the independent review gate. Use for every feature, bug, refactor, or cleanup. For one-time repository setup, use openspec-setup first.
---

# OpenSpec ATDD

Load this skill before any OpenSpec planning or implementation work. It is the source of truth for invoking workflow commands on each supported tool, pausing for user review, resuming interrupted work, and completing the independent review gate.

This skill assumes the repository is already prepared. If OpenSpec is not configured — `openspec schemas` does not list `atdd-driven`, or `openspec config list` lacks the `new` / `continue` commands — run the `openspec-setup` skill first, then return here.

## When to use

Use this skill to drive every feature, bug, refactor, or cleanup through the `atdd-driven` schema. Never begin implementation before the planning artifacts are complete and approved.

## Invoke the workflow

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

**Kiro Crew preflight.** Before creating the `product-manager` session, confirm the session tools can actually be called. A `session_create` refusal here is a fixable host-setup gap, not an unavailable channel — the `openspec-setup` skill's `reference/kiro-crew-grill.md` explains each layer and how to read the refusal message. In short:

- `only a gateway-issued key counts` (or `kirocrew doctor` shows the servers unrouted) → the servers are not routed. Fixed by routing them + a `kirocrew restart`.
- `session control is disabled in config (agent.session_control)` → the policy flag is off. Fixed by `kirocrew config set agent.session_control true` (read live, no restart).

Either way, `./scripts/setup-kiro-crew.sh` does both; have the user run `kirocrew restart` if routing changed, then resume the workflow in a session started after the restart. Never degrade to a non-interactive Grill because setup was incomplete.

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

**Kiro Crew — retarget the session first.** A Kiro Crew session's project directory (which its git diff view follows) is fixed when the session starts and does not move when you `cd` or edit files elsewhere. If the repository you are changing is not that directory, the diff view shows nothing. Before the first scenario, point it at the repository with the `set_project` tool:

```
set_project(path="/absolute/path/to/repo")
```

This is a Kiro Crew tool; on Kiro CLI or Claude Code there is no equivalent and none is needed, because their diff view already follows the working directory. Note it is refused for headless callers (crons, spawned subagents), so a spawned Engineer cannot retarget its parent's session — drive Apply in the session whose diff view you want scoped.

For each scenario:

1. **RED** — add a failing acceptance test through the specified seam.
2. **GREEN** — make the smallest implementation change that satisfies it.
3. **REFACTOR** — improve the implementation while keeping all tests green.
4. Commit the completed scenario and capture the commit SHA.
5. **Tick the scenario's tasks in `tasks.md`** — change each completed `- [ ]` to `- [x]` as you finish it (per sub-task, not just at the end). `tasks.md` is the source of truth for progress: tooling and dashboards read these checkboxes, so an unticked box reads as "not done" even when the work is committed. Never leave a completed task unticked; never tick a task you have not actually completed.
6. Stop for user review before beginning another scenario.

Do not batch scenarios, guess ambiguous business behaviour, delete tests, or weaken assertions to manufacture a pass.

## Step 4 — Independent review gate

At the end of the assigned Apply scope, the Engineer must:

1. Create a fresh `code-reviewer` subagent using the active tool's native subagent mechanism.
2. Invoke it by agent identity so the reviewer uses the model declared by its own adapter; never let it inherit the Engineer model.
3. Supply the repository path, base branch, reviewed commit SHA, complete diff, OpenSpec artifacts, and validation results.
4. Fix every `BLOCKING` finding returned with `REQUEST_CHANGES`, commit the fixes, and create another fresh reviewer against the new SHA.
5. Continue only after `APPROVE`. Surface warnings and nits to the user.

Tick the review-gate task in `tasks.md` (`- [ ]` → `- [x]`) once the reviewer returns `APPROVE` — this is the signal dashboards use to mark the review stage complete.

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
