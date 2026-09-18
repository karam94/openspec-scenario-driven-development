import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDiff, parseDiff, type Args } from "./core";

const created: string[] = [];

afterAll(() => {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function git(dir: string, args: string[]): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function makeRepoWithBranchWork(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-"));
  created.push(dir);
  // The guard only diffs discovered repos, which by definition carry openspec/changes.
  // An empty dir is invisible to git (ls-files lists files, not dirs).
  fs.mkdirSync(path.join(dir, "openspec", "changes"), { recursive: true });
  git(dir, ["init", "-b", "master"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "file.txt"), "a\nb\nc\n");
  git(dir, ["add", "file.txt"]);
  git(dir, ["commit", "-m", "base"]);
  git(dir, ["checkout", "-b", "feature"]);
  fs.writeFileSync(path.join(dir, "file.txt"), "a\nB\nc\n");
  git(dir, ["add", "file.txt"]);
  git(dir, ["commit", "-m", "on branch"]);
  fs.writeFileSync(path.join(dir, "untracked.txt"), "new1\nnew2\n");
  return dir;
}

describe("getDiff — branch-vs-base ∪ working tree", () => {
  it("includes a committed-on-branch change and an untracked file", async () => {
    const dir = makeRepoWithBranchWork();
    const args: Args = { repos: [dir], root: "/nonexistent", depth: 1 };

    const res = await getDiff(args, dir);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byPath = Object.fromEntries(res.files.map((f) => [f.path, f]));

    expect(byPath["file.txt"]).toBeDefined();
    const lines = byPath["file.txt"]!.hunks.flatMap((h) => h.lines);
    expect(lines.some((l) => l.kind === "add" && l.text.includes("B"))).toBe(true);
    expect(lines.some((l) => l.kind === "del" && l.text.includes("b"))).toBe(true);

    expect(byPath["untracked.txt"]).toBeDefined();
    expect(byPath["untracked.txt"]!.status).toBe("added");
  });

  it("refuses a path outside any discovered repo and runs no git", async () => {
    const args: Args = { repos: ["/nonexistent-repo"], root: "/nonexistent", depth: 1 };
    const res = await getDiff(args, "/etc");
    expect(res.ok).toBe(false);
  });

  it("uses merge-base semantics: upstream-only commits are not shown as branch removals", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-mb-"));
    created.push(dir);
    fs.mkdirSync(path.join(dir, "openspec", "changes"), { recursive: true });
    git(dir, ["init", "-b", "master"]);
    git(dir, ["config", "user.email", "t@t.t"]);
    git(dir, ["config", "user.name", "t"]);
    fs.writeFileSync(path.join(dir, "base.txt"), "base\n");
    git(dir, ["add", "base.txt"]);
    git(dir, ["commit", "-m", "base"]); // fork point
    git(dir, ["checkout", "-b", "feature"]);
    fs.writeFileSync(path.join(dir, "feat.txt"), "feature work\n");
    git(dir, ["add", "feat.txt"]);
    git(dir, ["commit", "-m", "feat"]);
    // master advances after the branch diverged (upstream-only commit).
    git(dir, ["checkout", "master"]);
    fs.writeFileSync(path.join(dir, "upstream.txt"), "landed upstream\n");
    git(dir, ["add", "upstream.txt"]);
    git(dir, ["commit", "-m", "upstream"]);
    git(dir, ["checkout", "feature"]);

    const res = await getDiff({ repos: [dir], root: "/nonexistent", depth: 1 }, dir);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const paths = res.files.map((f) => f.path);
    expect(paths).toContain("feat.txt"); // the branch's own contribution
    expect(paths).not.toContain("upstream.txt"); // not a branch change
  });

  it("preserves a non-ASCII untracked filename (no quoting, no trimming)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-uni-"));
    created.push(dir);
    fs.mkdirSync(path.join(dir, "openspec", "changes"), { recursive: true });
    git(dir, ["init", "-b", "master"]);
    git(dir, ["config", "user.email", "t@t.t"]);
    git(dir, ["config", "user.name", "t"]);
    fs.writeFileSync(path.join(dir, "seed.txt"), "seed\n");
    git(dir, ["add", "seed.txt"]);
    git(dir, ["commit", "-m", "seed"]);
    const name = "naïve café.txt";
    fs.writeFileSync(path.join(dir, name), "content\n");

    const res = await getDiff({ repos: [dir], root: "/nonexistent", depth: 1 }, dir);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byPath = Object.fromEntries(res.files.map((f) => [f.path, f]));
    expect(byPath[name]).toBeDefined();
    expect(byPath[name]!.status).toBe("added");
  });
});

describe("parseDiff — raw unified diff → structured model", () => {
  it("classifies add / del / context lines within a modified file", () => {
    const raw = [
      "diff --git a/file.txt b/file.txt",
      "index 111..222 100644",
      "--- a/file.txt",
      "+++ b/file.txt",
      "@@ -1,3 +1,3 @@",
      " a",
      "-b",
      "+B",
      " c",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe("file.txt");
    expect(files[0]!.status).toBe("modified");
    const lines = files[0]!.hunks.flatMap((h) => h.lines);
    expect(lines).toEqual([
      { kind: "context", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "B" },
      { kind: "context", text: "c" },
    ]);
  });

  it("marks a new file as added", () => {
    const raw = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "index 000..222",
      "--- /dev/null",
      "+++ b/new.txt",
      "@@ -0,0 +1,2 @@",
      "+one",
      "+two",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("new.txt");
    expect(files[0]!.status).toBe("added");
  });

  it("marks a deleted file as deleted", () => {
    const raw = [
      "diff --git a/gone.txt b/gone.txt",
      "deleted file mode 100644",
      "index 222..000",
      "--- a/gone.txt",
      "+++ /dev/null",
      "@@ -1,1 +0,0 @@",
      "-bye",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("gone.txt");
    expect(files[0]!.status).toBe("deleted");
  });

  it("marks a binary file as binary with no hunks", () => {
    const raw = [
      "diff --git a/img.png b/img.png",
      "index 111..222 100644",
      "Binary files a/img.png and b/img.png differ",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("img.png");
    expect(files[0]!.status).toBe("binary");
    expect(files[0]!.hunks).toEqual([]);
  });

  it("marks a renamed file as renamed", () => {
    const raw = [
      "diff --git a/old.txt b/new.txt",
      "similarity index 100%",
      "rename from old.txt",
      "rename to new.txt",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("new.txt");
    expect(files[0]!.status).toBe("renamed");
  });

  it("returns an empty list for an empty diff", () => {
    expect(parseDiff("")).toEqual([]);
    expect(parseDiff("\n")).toEqual([]);
  });

  it("preserves a trailing space in a filename while dropping git's tab terminator", () => {
    const raw = [
      "diff --git a/trailing.txt  b/trailing.txt ",
      "--- a/trailing.txt \t",
      "+++ b/trailing.txt \t",
      "@@ -1 +1 @@",
      "-x",
      "+y",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("trailing.txt ");
  });

  it("decodes a git C-quoted filename containing a control character", () => {
    const raw = [
      'diff --git "a/we\\tird.txt" "b/we\\tird.txt"',
      '--- "a/we\\tird.txt"',
      '+++ "b/we\\tird.txt"',
      "@@ -1 +1 @@",
      "-a",
      "+b",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files[0]!.path).toBe("we\tird.txt");
  });

  it("handles multiple files in one diff", () => {
    const raw = [
      "diff --git a/one.txt b/one.txt",
      "--- a/one.txt",
      "+++ b/one.txt",
      "@@ -1 +1 @@",
      "-x",
      "+y",
      "diff --git a/two.txt b/two.txt",
      "--- a/two.txt",
      "+++ b/two.txt",
      "@@ -1 +1 @@",
      "-p",
      "+q",
    ].join("\n");
    const files = parseDiff(raw);
    expect(files.map((f) => f.path)).toEqual(["one.txt", "two.txt"]);
  });
});
