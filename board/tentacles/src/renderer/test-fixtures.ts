import { vi } from "vitest";
import type { Change, ElectronAPI, Phase, StatusResult } from "../shared/ipc-contract";

export function phase(id: Phase["id"], over: Partial<Phase> = {}): Phase {
  return { id, applicable: true, done: false, files: [], ...over };
}

export function makeChange(over: Partial<Change> = {}): Change {
  return {
    change: "my-change",
    repo: "repo-a",
    repoPath: "/Code/repo-a",
    schema: "atdd-driven",
    type: "feature",
    phases: [
      phase("grill"),
      phase("proposal"),
      phase("specs"),
      phase("design"),
      phase("tasks"),
    ],
    apply: { source: "tasks.md", total: 0, done: 0, file: null },
    applyDone: false,
    applying: false,
    review: "none",
    planningComplete: false,
    complete: false,
    pr: null,
    ...over,
  };
}

export function makeStatus(changes: Change[], repoCount = 1): StatusResult {
  return { generatedAt: "2026-01-01T00:00:00.000Z", repoCount, changes };
}

export type MockApi = {
  getStatus: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  setSettings: ReturnType<typeof vi.fn>;
};

export function mockApi(over: Partial<ElectronAPI> = {}): MockApi {
  const api = {
    getStatus: vi.fn().mockResolvedValue(makeStatus([])),
    readFile: vi.fn().mockResolvedValue({ ok: true, contents: "" }),
    archive: vi.fn().mockResolvedValue({ ok: true }),
    getSettings: vi.fn().mockResolvedValue({ root: "/Code" }),
    setSettings: vi.fn().mockResolvedValue({ ok: true, root: "/Code" }),
    ...over,
  } as unknown as MockApi;
  (window as unknown as { electronAPI: ElectronAPI }).electronAPI = api as unknown as ElectronAPI;
  return api;
}
