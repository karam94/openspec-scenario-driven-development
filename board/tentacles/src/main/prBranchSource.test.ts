import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { shapeChange, PHASES } from "./core";
import type { GitIdentity } from "./core";

function planningCompleteStatus(repo: string) {
  const artifactPaths: Record<string, { existingOutputPaths: string[]; resolvedOutputPath: string }> = {};
  for (const id of PHASES) {
    const resolved = `${repo}/openspec/changes/c/${id === "specs" ? "specs/cap/spec.md" : id + ".md"}`;
    artifactPaths[id] = { existingOutputPaths: [resolved], resolvedOutputPath: resolved };
  }
  return { schemaName: "atdd-driven", isPlanningComplete: true, artifactPaths };
}

const identity =
  (over: Partial<GitIdentity> = {}) =>
  async (): Promise<GitIdentity> => ({ commonDir: "/Code/repo/.git", branch: "feat-a", isPrimary: false, ...over });

// A real on-disk change whose tasks.md carries a stale `Branch:` line and one
// unticked task, so the branch-source and commit-count paths are both exercised.
function makeChangeDir(branch: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "board-pr-src-"));
  const dir = path.join(repo, "openspec", "changes", "c");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.md"), `# Tasks\n\nBranch: \`${branch}\`\n\n- [ ] 1.1 do the thing\n`);
  return repo;
}

describe("shapeChange keys PR lookup and commit count off the resolved git branch", () => {
  let repo = "";

  beforeEach(() => {
    repo = makeChangeDir("stale-branch");
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("looks up the PR and counts commits for the checked-out branch, never the stale tasks.md scrape", async () => {
    const prLookup = vi.fn().mockResolvedValue(null);
    const commitCount = vi.fn().mockResolvedValue(0);
    await shapeChange(repo, "c", planningCompleteStatus(repo), {
      resolveIdentity: identity({ branch: "feat-a" }),
      prLookup,
      commitCount,
    });

    expect(prLookup).toHaveBeenCalledWith(repo, "feat-a");
    expect(commitCount).toHaveBeenCalledWith(repo, "feat-a");
    expect(prLookup).not.toHaveBeenCalledWith(repo, "stale-branch");
  });

  it("skips PR lookup and commit count entirely for a detached-HEAD worktree", async () => {
    const prLookup = vi.fn().mockResolvedValue(null);
    const commitCount = vi.fn().mockResolvedValue(0);
    const c = await shapeChange(repo, "c", planningCompleteStatus(repo), {
      resolveIdentity: identity({ branch: null }),
      prLookup,
      commitCount,
    });

    expect(c.branch).toBeNull();
    expect(c.pr).toBeNull();
    expect(prLookup).not.toHaveBeenCalled();
    expect(commitCount).not.toHaveBeenCalled();
  });
});
