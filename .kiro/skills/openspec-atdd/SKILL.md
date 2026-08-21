---
name: openspec-atdd
description: Set up OpenSpec with the atdd-driven schema (expanded workflow profile) in a project AND drive a feature/bug/refactor through it one artifact at a time with @opsx-new --schema atdd-driven then @opsx-continue, pausing after every artifact and every scenario so the user can iterate or continue. Use when onboarding a repo to OpenSpec in Kiro, or whenever starting or continuing atdd-driven software work.
triggers: openspec setup, atdd-driven schema install, opsx prompts global, openspec init kiro, openspec project setup, atdd skill install, opsx-new, opsx-continue, opsx-apply, run openspec workflow, drive openspec, atdd-driven workflow, iterate or continue, expanded workflow profile, openspec config profile
source: auto
created_at: 2026-08-20T18:03:03+00:00
---

## When to use

Two jobs, in order:

1. **Setup** — onboarding a project that doesn't yet have OpenSpec configured with the atdd-driven schema, or a fresh checkout that lost it. Do this once per project (Part 1).
2. **Running the workflow** — driving any feature, bug, or behaviour-changing refactor through the atdd-driven phases once setup is done (Part 2).

All software-engineering work goes through this workflow. Never start coding without it, and always run it on the `atdd-driven` schema — never the default `spec-driven`.

## Part 1 — One-time setup

Steps 5–6 (expanded profile) are **global** and only need doing once per machine; the rest are per-project.

1. **Create a feature branch** (non-destructive, no `git reset --hard`):
   ```bash
   cd <project-root>
   git checkout <default-branch>
   git checkout -b <type>/<feature-name>
   ```

2. **Initialize OpenSpec + register the Kiro tool** (do this even if `openspec/` already exists —
   an `openspec/` dir can exist with NO tool configured, and then `openspec update` in step 6 fails
   with *"No configured tools found. Run openspec init to set up tools."*):
   ```bash
   openspec init --tools kiro --no-copilot-cloud
   ```
   `init` creates `openspec/config.yaml` (default `schema: spec-driven` — leave it, see step 4) and
   generates the 12 `opsx-*.prompt.md` files under `<project>/.kiro/prompts/`. Safe to re-run: if the
   tool is already configured it reports "up to date". **Gate on the tool, not the dir** — if
   `openspec update` later complains about no configured tools, run this.

3. **Install the atdd-driven schema** from source, and verify it REGISTERS (dir presence is not
   enough — a partial copy with only `templates/` and no `schema.yaml` manifest leaves the schema
   unregistered, and `openspec new change --schema atdd-driven` then fails with *"Schema
   'atdd-driven' not found. Available: spec-driven"*):
   ```bash
   SDD_TMP="$(mktemp -d)"
   git clone --depth 1 https://github.com/karam94/openspec-scenario-driven-development.git "$SDD_TMP/sdd"
   mkdir -p openspec/schemas
   # copy the WHOLE schema dir incl. schema.yaml + templates/ (use trailing /. to overwrite a partial copy)
   cp -Rf "$SDD_TMP/sdd/openspec/schemas/atdd-driven/." openspec/schemas/atdd-driven/
   openspec schemas | grep -q 'atdd-driven' && echo "registered" || echo "NOT REGISTERED — check schema.yaml"
   ```
   The source schema dir MUST contain `schema.yaml` plus `templates/{grill,proposal,spec,design,tasks}.md`.
   Confirm `openspec/schemas/atdd-driven/schema.yaml` exists and `openspec schemas` lists
   `atdd-driven (project)` before proceeding.
   **Never** use `rm -rf` on an absolute path — `mktemp -d` gives a fresh dir with nothing to pre-clean.

4. **Leave the project default schema alone.** You do NOT need to set `schema: atdd-driven` in `openspec/config.yaml`. The workflow passes `--schema atdd-driven` explicitly on the new-change step (Part 2, Step 1), and OpenSpec persists it into that change's `.openspec.yaml` — so every later command (`@opsx-continue`, `status`, `instructions`, `@opsx-apply`) auto-resolves atdd-driven while the project default stays whatever it was. (Setting it as the default also works, but is optional and not assumed here.)

5. **Enable the expanded workflow profile** (global, once per machine). The default `core` profile only ships `propose, explore, apply, update, sync, archive`. The per-artifact commands we drive the workflow with — `new`, `continue`, plus `ff`, `verify`, `bulk-archive`, `onboard` — live in the `custom` profile:
   ```bash
   openspec config profile        # interactive picker: select the full/expanded set
   ```
   Non-interactive (agent / no TTY) equivalent — the `workflows` value MUST be a JSON array:
   ```bash
   openspec config set profile custom
   openspec config set workflows '["propose","explore","apply","update","sync","archive","new","continue","ff","verify","bulk-archive","onboard"]'
   ```
   This is a global config change; it only makes more commands available and changes no schema.

6. **Regenerate prompts** so the expanded `opsx-*` prompts are written:
   ```bash
   openspec update
   ```

7. **Copy prompts to the global directory** so the Kiro Crew gateway can invoke them via `@`:
   ```bash
   mkdir -p ~/.kiro/prompts
   cp -f .kiro/prompts/opsx-*.prompt.md ~/.kiro/prompts/
   ```
   Rationale: `openspec init --tools kiro` writes prompts **project-local** at `<project>/.kiro/prompts/` (for Kiro IDE). The Kiro Crew gateway only resolves `@`-invoked prompts from `~/.kiro/prompts/`. The prompts are project-agnostic (resolve OpenSpec root from cwd).

8. **Install required skills** into `~/.kiro/skills/` — this location is loaded by **both** regular Kiro and Kiro Crew, so one install serves both (unlike `~/.kiro/crew/skills/`, which is Crew-only). The atdd-driven schema STOPs if any of `grill-with-docs`, `atdd`, `codebase-design` is missing. **Always overwrite from the freshly-cloned repo** so the installed skills track the latest version — do NOT skip-if-present, or a stale copy silently persists and drifts. In the repo the three skills live once under `skills/` (each tool dir just symlinks to it), so copy from there:
   ```bash
   mkdir -p "$HOME/.kiro/skills"
   for s in grill-with-docs atdd codebase-design; do
     mkdir -p "$HOME/.kiro/skills/$s"
     cp -Rf "$SDD_TMP/sdd/skills/$s/." "$HOME/.kiro/skills/$s/"   # overwrite = always latest
   done
   ```

9. **Verify** the schema registration, expanded prompts, global availability, and skills:
   ```bash
   openspec schemas | grep 'atdd-driven'                          # must show: atdd-driven (project)
   openspec config list | sed -n '/Profile settings/,$p'          # profile: custom, workflows include new/continue
   ls ~/.kiro/prompts/opsx-new.prompt.md ~/.kiro/prompts/opsx-continue.prompt.md
   for s in grill-with-docs atdd codebase-design; do
     find ~/.kiro/skills -type d -name "$s" | grep -q . && echo "ok: $s" || echo "MISSING: $s"
   done
   ```

## Part 2 — Running the atdd-driven workflow

Setup makes the tooling available; this part is how the agent actually drives a change. **The user drives.** The agent advances **one artifact at a time** and **stops after every one** for the user to review, then asks whether to **iterate** on it or **continue** to the next. Never auto-advance — the pause-and-ask loop is the whole point.

Drive with the generated prompts (`@opsx-new`, `@opsx-continue`, `@opsx-apply`, `@opsx-archive`); let those prompts and the schema do the orchestration. This skill only tells you *when to pause and what to ask* — do not re-implement the phase logic yourself.

> **Kiro Crew invocation:** every `@opsx-*` step below is triggered in the Kiro Crew dashboard with
> **`/prompts get @opsx-<name> <args>`** — e.g. `/prompts get @opsx-new add-foo --schema atdd-driven`,
> `/prompts get @opsx-continue add-foo`, `/prompts get @opsx-apply add-foo`. A bare `@opsx-<name>` may
> not expand. (kiro-cli TUI: `/opsx-<name>`. Any surface: the raw `openspec` CLI is the fallback.)

### The phases (atdd-driven schema)

Planning artifacts, created one per `@opsx-continue` in dependency order:

1. **grill** → `grill.md` — challenge the change against the domain model, sharpen terminology (invokes the `grill-with-docs` skill).
2. **proposal** → `proposal.md` — *why* the change is needed and which capabilities/specs it touches.
3. **specs** → `specs/<capability>/spec.md` — requirements as `GIVEN/WHEN/THEN` scenarios, each testable through a seam.
4. **design** → `design.md` — *how* to implement it (only when the change is cross-cutting, adds a dependency, or has real complexity; skipped otherwise).
5. **tasks** → `tasks.md` — implementation checklist as tracer-bullet vertical slices, one task group per scenario.

Then implementation via `@opsx-apply` (scenario by scenario), and finally `@opsx-archive`.

### Step 1 — start the change

```
@opsx-new <requirement-name> --schema atdd-driven
```

Equivalent raw CLI: `openspec new change "<requirement-name>" --schema atdd-driven`.

The `--schema atdd-driven` flag is required **here and only here** — it is persisted into the change's `.openspec.yaml`, so every later command auto-resolves atdd-driven with no flag (the project default is irrelevant). `@opsx-new` scaffolds the change and shows the **first artifact's (grill) template only** — it creates NO artifacts and then STOPS. Confirm the `grill-with-docs` skill is available before starting (Part 1, step 8); the schema STOPs without it.

### Step 2 — the iterate / continue loop (the core pattern)

Advance one artifact at a time:

```
@opsx-continue <requirement-name>
```

`@opsx-continue` creates exactly **one** artifact (the next one that is `ready`), then STOPS. After each one, pause and put the choice to the user, e.g.:

> "`<artifact>` is ready — here it is. Do you want to **iterate** on it, or are you happy to **continue** to `<next artifact>`?"

- **Iterate** → refine the current artifact with the user's feedback, then ask again. Stay on it until they're happy.
- **Continue** → run `@opsx-continue <requirement-name>` again to create the next artifact.

Repeat through grill → proposal → specs → design → tasks. Never advance two artifacts on one confirmation, and do **not** use `@opsx-ff` (fast-forward creates every remaining artifact at once — it defeats the per-step review). If the loop was interrupted (new session, compaction), resume by reading state, not guessing:

```bash
openspec status --change "<name>" --json                     # done / next (no --schema needed)
openspec instructions <artifact-id> --change "<name>" --json # how to build the next artifact
```

### Step 3 — review gate, then implement

When all planning artifacts are done and the user has approved them:

```
@opsx-apply <requirement-name>
```

Apply works **scenario by scenario**: RED (a failing acceptance test through the scenario's seam) → minimal implementation → GREEN → REFACTOR → commit. **Stop after every completed scenario** and run the iterate/continue loop again. Never batch multiple scenarios into one gate. Pause on any ambiguity or blocker and ask — never guess business logic, and never delete or skip tests to force a green build (that is a block, not a pass). Optionally use `@opsx-verify <name>` to re-check acceptance state.

### Step 4 — archive

Once every scenario's acceptance test passes and the user confirms the change is done:

```
@opsx-archive <requirement-name>
```

### Non-negotiables

- **Always atdd-driven.** Pass `--schema atdd-driven` on `@opsx-new`; never fall back to `spec-driven`.
- **User drives, agent pauses.** One artifact per `@opsx-continue`; stop after every artifact and every scenario and wait for iterate/continue.
- **No fast-forward.** Never use `@opsx-ff` — it skips the per-step review.
- **Planning ≠ implementation.** Create no project code until `@opsx-apply`.
- **One scenario per apply gate.** Never batch scenarios.
- **Never fake green.** No deleting or skipping tests to pass — surface the blocker instead.

## Gotchas

- **Never `rm -rf` an absolute path** — Kiro Crew safety policy blocks it. Use `mktemp -d` for temp clones.
- **Install skills into `~/.kiro/skills/`, not `~/.kiro/crew/skills/`.** `~/.kiro/skills/` is indexed by **both** regular Kiro and Kiro Crew — a Kiro Crew session's own skill index is drawn from here — so a single install serves both surfaces. `~/.kiro/crew/skills/` is Crew-only, so shared skills there are invisible to regular Kiro and become redundant duplicates. Setup overwrites `~/.kiro/skills/` with the freshly-cloned version on every run (Part 1, step 8), so it always tracks the latest skill and never drifts.
- **Prompts must be global** — project-local `.kiro/prompts/` is invisible to the Kiro Crew gateway. Always `cp` to `~/.kiro/prompts/`.
- **`@opsx-new` / `@opsx-continue` only exist under the `custom` profile.** The default `core` profile ships only `propose, explore, apply, update, sync, archive`. Enable `custom` + the expanded `workflows` list and run `openspec update` (Part 1, steps 5–6) or those prompts won't be generated.
- **`workflows` config value must be a JSON array** — `openspec config set workflows '["propose",...]'`. A comma-separated string is rejected with `expected array, received string`.
- **`--schema atdd-driven` is a one-time flag** — pass it on `openspec new change` / `@opsx-new` only. It persists in the change's `.openspec.yaml`; `@opsx-continue`, `status`, `instructions`, and `@opsx-apply` auto-resolve it, so re-passing it is unnecessary.
- **Invoking the prompts — Kiro Crew.** In the Kiro Crew dashboard, trigger each prompt with
  **`/prompts get @opsx-<name> <args>`** — e.g. `/prompts get @opsx-new add-foo --schema atdd-driven`,
  `/prompts get @opsx-continue add-foo`, `/prompts get @opsx-apply add-foo`. This is the reliable
  Kiro Crew invocation; typing a bare `@opsx-<name>` may not expand (it can arrive as literal text,
  especially right after the global prompts are first installed). Every `@opsx-*` reference in Part 2
  below means "invoke it in Kiro Crew via `/prompts get @opsx-<name>`".
- **Invoking the prompts — kiro-cli / other.** In kiro-cli the same file prompts resolve as slash
  commands (`/opsx-new <args>`), and `/prompts` lists them. Resolution order: local `.kiro/prompts/`
  → global `~/.kiro/prompts/` → skills → MCP.
- **Raw-CLI fallback (always works).** If prompt wiring misbehaves in any surface, run the underlying
  `openspec` commands directly and keep the STOP-after-each discipline: `openspec new change "<name>"
  --schema atdd-driven`, then per artifact `openspec instructions <artifact> --change "<name>"` +
  write the file, `openspec status --change "<name>"` to advance.
- **`openspec/` present but tool/schema not wired.** A fresh checkout (or one where the untracked
  `openspec/` only partly survived) can have the dir without the Kiro tool configured and/or with an
  incomplete `atdd-driven` schema (only `templates/`, no `schema.yaml`). Symptoms: `openspec update`
  says *"No configured tools found"* (→ re-run `openspec init --tools kiro`), or `openspec new change
  --schema atdd-driven` says *"Schema 'atdd-driven' not found"* (→ re-copy the full schema dir and
  confirm with `openspec schemas`). Always verify with `openspec schemas` + `openspec config list`,
  never assume the dir's existence means it's wired.
- **The schema clone step also provides the skills** — reuse the same `$SDD_TMP/sdd` checkout for both schema and skill installation to avoid redundant clones.
