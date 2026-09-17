import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import core, { type Args } from "./core";
import type { ArchiveResult } from "../shared/ipc-contract";

let repo: string;
let archiver: (repoPath: string, change: string) => Promise<ArchiveResult>;

beforeAll(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "board-arch-"));
  fs.mkdirSync(path.join(repo, "openspec", "changes", "demo"), { recursive: true });
});

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));
beforeEach(() => {
  archiver = vi.fn(async (): Promise<ArchiveResult> => ({ ok: true }));
});

describe("archive guard (core.archiveChange)", () => {
  const args = (): Args => ({ repos: [repo], root: "/nonexistent", depth: 1 });

  it("archives a real change in a discovered repo and returns {ok:true}", async () => {
    const res = await core.archiveChange(args(), repo, "demo", archiver);
    expect(res).toEqual({ ok: true });
    expect(archiver).toHaveBeenCalledTimes(1);
    expect(archiver).toHaveBeenCalledWith(repo, "demo");
  });

  it("refuses an unknown repo and performs no archive", async () => {
    const res = await core.archiveChange(args(), "/not/a/discovered/repo", "demo", archiver);
    expect(res).toEqual({ ok: false, error: "unknown repo or change" });
    expect(archiver).not.toHaveBeenCalled();
  });

  it("refuses a non-existent change and performs no archive", async () => {
    const res = await core.archiveChange(args(), repo, "does-not-exist", archiver);
    expect(res).toEqual({ ok: false, error: "unknown repo or change" });
    expect(archiver).not.toHaveBeenCalled();
  });
});
