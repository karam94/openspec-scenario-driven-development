import { describe, it, expect } from "vitest";
import { groupWorktrees } from "./grouping";
import type { Change } from "./ipc-contract";

function change(over: Partial<Change> = {}): Change {
  return {
    change: "c",
    repo: "repo",
    repoPath: "/Code/repo",
    schema: "atdd-driven",
    type: "feature",
    phases: [],
    apply: { source: "tasks.md", total: 0, done: 0, file: null },
    applyDone: false,
    applying: false,
    review: "none",
    planningComplete: false,
    complete: false,
    pr: null,
    repositoryId: "/Code/wings-core/.git",
    repositoryName: "wings-core",
    branch: null,
    isPrimary: false,
    ...over,
  };
}

describe("groupWorktrees groups carded worktrees into Repository rows", () => {
  it("groups two worktrees sharing one common-dir under a single nested row", () => {
    const groups = groupWorktrees([
      change({ change: "a", branch: "feat-a", repoPath: "/Code/wings-core-a" }),
      change({ change: "b", branch: "feat-b", repoPath: "/Code/wings-core-b" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.repositoryName).toBe("wings-core");
    expect(groups[0]?.nested).toBe(true);
    expect(groups[0]?.worktrees.map((w) => w.branch)).toEqual(["feat-a", "feat-b"]);
  });

  it("marks a lone worktree's group as not nested", () => {
    const groups = groupWorktrees([change({ change: "solo", branch: "feat-solo" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.nested).toBe(false);
    expect(groups[0]?.worktrees).toHaveLength(1);
  });

  it("keeps changes with different common-dirs in separate groups", () => {
    const groups = groupWorktrees([
      change({ change: "a", repositoryId: "/Code/wings-core/.git", repositoryName: "wings-core" }),
      change({ change: "b", repositoryId: "/Code/other/.git", repositoryName: "other" }),
    ]);

    expect(groups.map((g) => g.repositoryName)).toEqual(["other", "wings-core"]);
    expect(groups.every((g) => !g.nested)).toBe(true);
  });

  it("pins the primary checkout's card first within a nested group", () => {
    const groups = groupWorktrees([
      change({ change: "feat-a", branch: "feat-a", isPrimary: false, repoPath: "/Code/wings-core-a" }),
      change({ change: "master", branch: "master", isPrimary: true, repoPath: "/Code/wings-core" }),
      change({ change: "feat-b", branch: "feat-b", isPrimary: false, repoPath: "/Code/wings-core-b" }),
    ]);

    expect(groups[0]?.worktrees.map((w) => w.branch)).toEqual(["master", "feat-a", "feat-b"]);
  });

  it("orders a group whose primary has no change by the default ordering only", () => {
    const groups = groupWorktrees([
      change({ change: "feat-b", branch: "feat-b", isPrimary: false, repoPath: "/Code/wings-core-b" }),
      change({ change: "feat-a", branch: "feat-a", isPrimary: false, repoPath: "/Code/wings-core-a" }),
    ]);

    expect(groups[0]?.worktrees.map((w) => w.branch)).toEqual(["feat-a", "feat-b"]);
  });

  it("keeps a lone worktree flat even when it holds more than one active change", () => {
    const groups = groupWorktrees([
      change({ change: "first", repoPath: "/Code/wings-core", branch: "feat-a" }),
      change({ change: "second", repoPath: "/Code/wings-core", branch: "feat-a" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.nested).toBe(false);
    expect(groups[0]?.worktrees.map((w) => w.change)).toEqual(["first", "second"]);
  });

  it("counts nesting from distinct worktrees, not change records", () => {
    const groups = groupWorktrees([
      change({ change: "a1", repoPath: "/Code/wings-core-a", branch: "feat-a" }),
      change({ change: "a2", repoPath: "/Code/wings-core-a", branch: "feat-a" }),
      change({ change: "b1", repoPath: "/Code/wings-core-b", branch: "feat-b" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.nested).toBe(true);
    expect(groups[0]?.worktrees.map((w) => w.change)).toEqual(["a1", "a2", "b1"]);
  });
});
