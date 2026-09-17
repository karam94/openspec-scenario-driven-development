import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import core, { type Args } from "./core";
import { makeHandlers } from "./wiring";

let repo: string;
let outside: string;

const EVENT = {} as IpcMainInvokeEvent;

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
  const args = (): Args => ({ repos: [repo], root: "/nonexistent", depth: 1 });

  it("returns the file contents for a path inside a discovered repo", () => {
    const fp = path.join(repo, "openspec", "changes", "demo", "proposal.md");
    const res = core.readArtifact(args(), fp);
    expect(res.ok).toBe(true);
    expect(res.ok && res.contents).toBe("hello artifact");
  });

  it("refuses a path outside any discovered repo and reads nothing", () => {
    const fp = path.join(outside, "secret.txt");
    const res = core.readArtifact(args(), fp);
    expect(res).toEqual({ ok: false, error: "path outside discovered repos" });
  });

  it("wiring readFile handler passes the path through to core", async () => {
    const fp = path.join(repo, "openspec", "changes", "demo", "proposal.md");
    const handlers = makeHandlers(core, args);
    const res = await handlers.readFile(EVENT, fp);
    expect(res).toEqual({ ok: true, contents: "hello artifact" });
  });
});
