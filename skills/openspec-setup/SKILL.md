---
name: openspec-setup
description: Prepare a repository for the atdd-driven OpenSpec workflow — register OpenSpec, enable the expanded profile, and wire the host adapters. Use once per repository before any planning or implementation, or when openspec-atdd reports OpenSpec is not configured.
---

# OpenSpec Setup

One-time preparation of a repository so the `atdd-driven` OpenSpec workflow can run. Do this once per repository, before any planning or implementation. To drive the workflow after setup, use the `openspec-atdd` skill.

## When to use

- A repository has had this package extracted over it but OpenSpec is not yet registered.
- `openspec-atdd` reports that OpenSpec is not configured.
- `openspec schemas` does not list `atdd-driven`, or `openspec config list` lacks the `new` / `continue` commands.

If OpenSpec is already configured (see [Confirm setup](#confirm-setup)), skip this skill.

## Steps

### 1. Work on a feature branch

Create a branch from the repository's default branch without discarding existing work. Never push directly to a protected branch.

### 2. Verify the extracted package

The repository must contain:

- `openspec/schemas/atdd-driven/schema.yaml`
- `skills/openspec-atdd/SKILL.md`
- `skills/openspec-setup/SKILL.md`
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

### 6. Kiro Crew — expose the prompts

Kiro and Claude use project-local generated commands. Kiro Crew additionally requires the generated Kiro prompts in its global prompt directory:

```bash
mkdir -p "$HOME/.kiro/prompts"
cp -f .kiro/prompts/opsx-*.prompt.md "$HOME/.kiro/prompts/"
```

Skip this step when Kiro Crew is not being used.

### 7. Kiro Crew — wire the interactive Grill

The interactive Grill needs the Engineer to stand up a live `product-manager` session, which depends on three host layers. Only Kiro Crew needs this; on plain Kiro CLI or Claude the Engineer falls back to handing the Grill off, so skip this step.

`./scripts/setup-kiro-crew.sh` does all of it (routes the servers, enables session control, exposes the prompts), then run `kirocrew restart` if routing changed. For what each layer is, why it is needed, and how to diagnose a `session_create` refusal, read [reference/kiro-crew-grill.md](reference/kiro-crew-grill.md).

### 8. Confirm setup

Confirm that:

- `openspec schemas` lists `atdd-driven (project)`.
- `openspec config list` reports the custom profile and includes `new` and `continue`.
- `openspec update` recognises both Kiro and Claude.
- all canonical skills, agent adapters, prompt references, and symlink targets exist.
- on Kiro Crew only: `kirocrew doctor` reports `strict identity: ✅ routed`, and `kirocrew config get agent.session_control` returns `true` (both set by step 7 above).

Setup is complete. Drive the workflow with `openspec-atdd`.
