import { describe, it, expect } from "vitest";
import { shapeChange, PHASES } from "./core";
import type { GitIdentity } from "./core";
import type { PhaseId } from "../shared/ipc-contract";

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

const identity =
  (over: Partial<GitIdentity> = {}) =>
  async (): Promise<GitIdentity> => ({ commonDir: null, branch: null, isPrimary: true, ...over });

describe("shapeChange resolves and carries each worktree's git identity", () => {
  it("carries the resolved common-dir identity, repository name and branch", async () => {
    const c = await shapeChange("/Code/wings-core-feat-a", "c", statusWith(["grill"]), {
      resolveIdentity: identity({ commonDir: "/Code/wings-core/.git", branch: "feat-a", isPrimary: false }),
    });

    expect(c.repositoryId).toBe("/Code/wings-core/.git");
    expect(c.repositoryName).toBe("wings-core");
    expect(c.branch).toBe("feat-a");
    expect(c.isPrimary).toBe(false);
  });

  it("marks the primary checkout's identity as primary", async () => {
    const c = await shapeChange("/Code/wings-core", "c", statusWith(["grill"]), {
      resolveIdentity: identity({ commonDir: "/Code/wings-core/.git", branch: "master", isPrimary: true }),
    });

    expect(c.isPrimary).toBe(true);
    expect(c.branch).toBe("master");
  });

  it("falls back to a standalone identity for a non-git directory", async () => {
    const c = await shapeChange("/Code/plain-repo", "c", statusWith(["grill"]), {
      resolveIdentity: identity({ commonDir: null, branch: null, isPrimary: true }),
    });

    expect(c.repositoryId).toBe("/Code/plain-repo");
    expect(c.repositoryName).toBe("plain-repo");
    expect(c.branch).toBeNull();
  });
});
