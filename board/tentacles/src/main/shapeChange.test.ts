import { describe, it, expect } from "vitest";
import { shapeChange, PHASES } from "./core";
import type { PhaseId } from "../shared/ipc-contract";

// Builds an openspec status object where `present` lists the planning artifacts
// that exist on disk. A non-existent repo path keeps shapeChange deterministic:
// tasks.md/proposal.md reads fail (defaults), branch resolves null (no gh/git).
function statusWith(present: PhaseId[], isPlanningComplete = false) {
  const artifactPaths: Record<string, { existingOutputPaths: string[]; resolvedOutputPath: string }> = {};
  for (const id of PHASES) {
    const resolved = `/nope/openspec/changes/c/${id === "specs" ? "specs/cap/spec.md" : id + ".md"}`;
    artifactPaths[id] = {
      existingOutputPaths: present.includes(id) ? [resolved] : [],
      resolvedOutputPath: resolved,
    };
  }
  return { schemaName: "atdd-driven", isPlanningComplete, artifactPaths };
}

const byId = (phases: { id: PhaseId; done: boolean; inProgress?: boolean }[]) =>
  Object.fromEntries(phases.map((p) => [p.id, p]));

describe("shapeChange — a phase is complete when the next artifact exists", () => {
  it("shows grill in-progress while only grill.md exists", async () => {
    const c = await shapeChange("/nope/repo", "c", statusWith(["grill"]));
    const p = byId(c.phases);

    expect(p.grill.done).toBe(false);
    expect(p.grill.inProgress).toBe(true);
    // no later planning phase is complete
    expect(p.proposal.done).toBe(false);
    expect(p.specs.done).toBe(false);
    expect(p.design.done).toBe(false);
    expect(p.tasks.done).toBe(false);
  });

  it("marks grill complete and proposal in-progress once proposal.md exists", async () => {
    const c = await shapeChange("/nope/repo", "c", statusWith(["grill", "proposal"]));
    const p = byId(c.phases);

    expect(p.grill.done).toBe(true);
    expect(p.grill.inProgress).toBeFalsy();
    expect(p.proposal.done).toBe(false);
    expect(p.proposal.inProgress).toBe(true);
    expect(p.specs.done).toBe(false);
  });

  it("marks specs complete once design.md exists", async () => {
    const c = await shapeChange("/nope/repo", "c", statusWith(["grill", "proposal", "specs", "design"]));
    const p = byId(c.phases);

    expect(p.grill.done).toBe(true);
    expect(p.proposal.done).toBe(true);
    expect(p.specs.done).toBe(true);
    // design's next (tasks) does not exist yet
    expect(p.design.done).toBe(false);
    expect(p.design.inProgress).toBe(true);
  });

  it("falls the final planning phase back to isPlanningComplete", async () => {
    const all: PhaseId[] = ["grill", "proposal", "specs", "design", "tasks"];

    const incomplete = await shapeChange("/nope/repo", "c", statusWith(all, false));
    expect(byId(incomplete.phases).tasks.done).toBe(false);
    expect(byId(incomplete.phases).tasks.inProgress).toBe(true);

    const complete = await shapeChange("/nope/repo", "c", statusWith(all, true));
    const p = byId(complete.phases);
    expect(p.grill.done).toBe(true);
    expect(p.proposal.done).toBe(true);
    expect(p.specs.done).toBe(true);
    expect(p.design.done).toBe(true);
    expect(p.tasks.done).toBe(true);
    expect(p.tasks.inProgress).toBeFalsy();
  });

  it("carries every spec file for a multi-capability specs phase, not just the first", async () => {
    const status = statusWith(["grill", "proposal"]);
    status.artifactPaths.specs.existingOutputPaths = [
      "/nope/openspec/changes/c/specs/cap-a/spec.md",
      "/nope/openspec/changes/c/specs/cap-b/spec.md",
    ];

    const c = await shapeChange("/nope/repo", "c", status);
    const specs = c.phases.find((p) => p.id === "specs");

    expect(specs?.files).toEqual([
      "/nope/openspec/changes/c/specs/cap-a/spec.md",
      "/nope/openspec/changes/c/specs/cap-b/spec.md",
    ]);
  });

  it("carries a single-element files array for a non-specs phase", async () => {
    const c = await shapeChange("/nope/repo", "c", statusWith(["grill", "proposal"]));
    const proposal = c.phases.find((p) => p.id === "proposal");
    expect(proposal?.files).toEqual(["/nope/openspec/changes/c/proposal.md"]);
  });
});
