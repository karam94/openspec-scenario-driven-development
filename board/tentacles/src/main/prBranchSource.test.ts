import { describe, it, expect, vi } from "vitest";
import { shapeChange, PHASES } from "./core";
import type { GitIdentity } from "./core";
import type { PhaseId } from "../shared/ipc-contract";

function planningCompleteStatus() {
  const artifactPaths: Record<string, { existingOutputPaths: string[]; resolvedOutputPath: string }> = {};
  for (const id of PHASES) {
    const resolved = `/nope/openspec/changes/c/${id === "specs" ? "specs/cap/spec.md" : id + ".md"}`;
    artifactPaths[id] = { existingOutputPaths: [resolved], resolvedOutputPath: resolved };
  }
  return { schemaName: "atdd-driven", isPlanningComplete: true, artifactPaths };
}

const identity =
  (over: Partial<GitIdentity> = {}) =>
  async (): Promise<GitIdentity> => ({ commonDir: "/Code/repo/.git", branch: "feat-a", isPrimary: false, ...over });

describe("shapeChange keys PR lookup off the resolved git branch", () => {
  it("looks up the PR for the checked-out branch, never a stale tasks.md scrape", async () => {
    const prLookup = vi.fn().mockResolvedValue(null);
    await shapeChange("/nope/repo", "c", planningCompleteStatus(), {
      resolveIdentity: identity({ branch: "feat-a" }),
      prLookup,
      commitCount: vi.fn().mockResolvedValue(0),
    });

    expect(prLookup).toHaveBeenCalledWith("/nope/repo", "feat-a");
  });

  it("skips PR lookup and commit count for a detached-HEAD worktree", async () => {
    const prLookup = vi.fn().mockResolvedValue(null);
    const commitCount = vi.fn().mockResolvedValue(0);
    const c = await shapeChange("/nope/repo", "c", planningCompleteStatus(), {
      resolveIdentity: identity({ branch: null }),
      prLookup,
      commitCount,
    });

    expect(c.branch).toBeNull();
    expect(prLookup).toHaveBeenCalledWith("/nope/repo", null);
    // a null branch makes prForBranch/branchCommits resolve to null/0 without a lookup
    expect(c.pr).toBeNull();
  });
});
