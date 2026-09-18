import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import core, { type Args } from "./core";
import { makeHandlers } from "./wiring";

let repo: string;
let outside: string;
let opener: ReturnType<typeof vi.fn>;

const EVENT = {} as IpcMainInvokeEvent;
const args = (): Args => ({ repos: [repo], root: "/nonexistent", depth: 1 });

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "board-open-"));
  fs.mkdirSync(path.join(repo, "openspec", "changes", "demo"), { recursive: true });
  outside = fs.mkdtempSync(path.join(os.tmpdir(), "board-open-outside-"));
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

beforeEach(() => {
  opener = vi.fn().mockResolvedValue("");
});

describe("openWorktree path guard (core.openWorktree)", () => {
  it("opens a target that exactly matches a discovered worktree root", async () => {
    const res = await core.openWorktree(args(), repo, opener);
    expect(res).toEqual({ ok: true });
    expect(opener).toHaveBeenCalledWith(repo);
  });

  it("opens the canonical discovered root, never the raw non-canonical input", async () => {
    // Lexically equal to `repo` once resolved but NOT its canonical string form
    // (built by concatenation so it stays un-normalised); a symlink segment could
    // otherwise make the OS resolve elsewhere than the validated path.
    const tricky = repo + "/sub/..";
    const res = await core.openWorktree(args(), tricky, opener);
    expect(res).toEqual({ ok: true });
    expect(opener).toHaveBeenCalledWith(path.resolve(repo));
    expect(opener).not.toHaveBeenCalledWith(tricky);
  });

  it("surfaces the OS error string when the opener reports one", async () => {
    opener = vi.fn().mockResolvedValue("no such file or directory");
    const res = await core.openWorktree(args(), repo, opener);
    expect(res).toEqual({ ok: false, error: "no such file or directory" });
  });

  it("rejects a path outside any discovered worktree without touching the shell", async () => {
    const res = await core.openWorktree(args(), outside, opener);
    expect(res).toEqual({ ok: false, error: "unknown repo or worktree" });
    expect(opener).not.toHaveBeenCalled();
  });
});

describe("openPath handler (wiring)", () => {
  it("delegates to the guarded core with the scan args and injected opener", async () => {
    const handlers = makeHandlers(core, args, undefined, undefined, undefined, opener);
    expect(await handlers.openPath(EVENT, repo)).toEqual({ ok: true });
    expect(opener).toHaveBeenCalledWith(repo);
  });

  it("reports unavailable when no opener is wired", async () => {
    const handlers = makeHandlers(core, args);
    expect(await handlers.openPath(EVENT, repo)).toEqual({ ok: false, error: "open unavailable" });
  });
});
