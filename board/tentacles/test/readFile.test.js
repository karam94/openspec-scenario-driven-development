import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import core from "../core.js";
import { makeHandlers } from "../wiring.js";

let repo;
let outside;

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "board-repo-"));
  fs.mkdirSync(path.join(repo, "openspec", "changes", "demo"), { recursive: true });
  fs.writeFileSync(path.join(repo, "openspec", "changes", "demo", "proposal.md"), "hello artifact");
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "board-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "should not be readable");
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe("readFile guard (core.readArtifact)", () => {
  const args = () => ({ repos: [repo], root: "/nonexistent", depth: 1 });

  it("returns the file contents for a path inside a discovered repo", () => {
    const fp = path.join(repo, "openspec", "changes", "demo", "proposal.md");
    const res = core.readArtifact(args(), fp);
    expect(res.ok).toBe(true);
    expect(res.contents).toBe("hello artifact");
  });

  it("refuses a path outside any discovered repo and reads nothing", () => {
    const fp = path.join(outside, "secret.txt");
    const res = core.readArtifact(args(), fp);
    expect(res).toEqual({ ok: false, error: "path outside discovered repos" });
    expect(res.contents).toBeUndefined();
  });

  it("wiring readFile handler passes the path through to core", async () => {
    const fp = path.join(repo, "openspec", "changes", "demo", "proposal.md");
    const handlers = makeHandlers(core, args);
    const res = await handlers.readFile({}, fp);
    expect(res).toEqual({ ok: true, contents: "hello artifact" });
  });
});
