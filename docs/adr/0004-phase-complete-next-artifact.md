# A phase is complete when the next artifact exists

- Status: accepted

The board derives each change's progress from `openspec status --json`, which reports which
artifacts exist on disk but exposes no per-artifact "in progress vs complete" flag (only the
whole-plan `isPlanningComplete`). The original rule — a phase is done once its own artifact
exists — is wrong for interactive phases: `grill.md` is written *while* the grill interview is
still running, so the grill node flipped to complete mid-interview. We decided that a phase is
complete only when the **next** applicable artifact exists (grill complete ⇔ `proposal.md`
exists, proposal complete ⇔ `specs/` exists, and so on); the final planning phase, having no
successor artifact, falls back to `isPlanningComplete`.

## Considered options

- **Next-artifact-exists (chosen).** No new writing convention; works for legacy and
  hand-written artifacts; fixes the grill case directly because `grill.md` no longer marks grill
  done — `proposal.md` does.
- **Explicit done-marker in each artifact.** Precise, but couples the board to a convention the
  skills must always emit, and any artifact not written by those skills would never register as
  complete. Rejected.
- **Ask OpenSpec for per-artifact progress.** Not available — the CLI doesn't expose it. Would
  require an upstream change. Rejected.

## Consequences

- The grill node correctly shows **in-progress** from the moment the change directory exists
  until `proposal.md` appears — i.e. throughout the interview window.
- Completion notifications (fired on the phase-done edge) now trigger on a truthful signal
  rather than the premature one.
- The rule is a pure function of which artifacts exist, so it stays fully unit-testable in
  `core.ts` from fixture inputs.
