import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { changeBranch } from "./core";

const created: string[] = [];

function repoWithTasks(content: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cb-"));
  created.push(repo);
  const dir = path.join(repo, "openspec", "changes", "c");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.md"), content);
  return repo;
}

afterAll(() => {
  for (const repo of created) {
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

describe("changeBranch reads the working branch from tasks.md", () => {
  it("matches the labelled 'Branch: `x`' form", () => {
    const repo = repoWithTasks("# Tasks\n\nBranch: `feat/improve-tentacles-board`\n");
    expect(changeBranch(repo, "c")).toBe("feat/improve-tentacles-board");
  });

  it("matches the bare 'branch `x`' form", () => {
    const repo = repoWithTasks("Branch `feat/ship-export`\n");
    expect(changeBranch(repo, "c")).toBe("feat/ship-export");
  });

  it("matches the 'branch = `x`' form", () => {
    const repo = repoWithTasks("branch = `feat/thing`\n");
    expect(changeBranch(repo, "c")).toBe("feat/thing");
  });

  it("ignores unrelated 'branch' prose and only matches the declaration line", () => {
    const repo = repoWithTasks(
      "# Tasks\n\nCompare against branch: \"main\" during review.\nUse the release subbranch: `nope`.\n\nBranch: `feat/real`\n"
    );
    expect(changeBranch(repo, "c")).toBe("feat/real");
  });

  it("returns null when no branch is declared (even with stray branch prose)", () => {
    const repo = repoWithTasks("# Tasks\n\nrebase onto the main branch when ready\n");
    expect(changeBranch(repo, "c")).toBeNull();
  });
});
