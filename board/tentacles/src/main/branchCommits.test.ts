import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { branchCommits } from "./core";

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

describe("branchCommits runs git without a shell", () => {
  it("passes a malicious branch name literally and cannot execute injected commands", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-"));
    created.push(dir);
    const sentinel = path.join(dir, "INJECTED");
    // If the value reached a shell, this would create the sentinel file.
    const evil = `main; touch ${sentinel}`;

    const n = await branchCommits(dir, evil);

    expect(fs.existsSync(sentinel)).toBe(false); // no shell → no injection
    expect(typeof n).toBe("number"); // git rejects the bogus ref → 0, never throws
    expect(n).toBe(0);
  });

  it("returns 0 for a null branch without invoking git", async () => {
    expect(await branchCommits("/whatever", null)).toBe(0);
  });
});
