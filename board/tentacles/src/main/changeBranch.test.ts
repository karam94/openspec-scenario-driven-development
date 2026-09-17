import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { changeBranch } from "./core";

function repoWithTasks(content: string): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cb-"));
  const dir = path.join(repo, "openspec", "changes", "c");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "tasks.md"), content);
  return repo;
}

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

  it("returns null when no branch is declared", () => {
    const repo = repoWithTasks("# Tasks\n\nnothing to see here\n");
    expect(changeBranch(repo, "c")).toBeNull();
  });
});
