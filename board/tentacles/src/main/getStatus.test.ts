import { describe, it, expect } from "vitest";
import type { IpcMain } from "electron";
import { makeHandlers, registerIpc, IPC, type BoardCore } from "./wiring";
import type { Args } from "./core";
import type { StatusResult } from "../shared/ipc-contract";

describe("getStatus IPC handler", () => {
  it("returns the shaped board state produced by core.getStatus for the current args", async () => {
    const shaped = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      repoCount: 2,
      changes: [{ change: "c1", repo: "r1" }],
    } as unknown as StatusResult;
    const seenArgs: Args[] = [];
    const fakeCore = {
      getStatus: (args: Args) => {
        seenArgs.push(args);
        return Promise.resolve(shaped);
      },
    } as unknown as BoardCore;
    const args: Args = { repos: [], root: "/Users/x/Code", depth: 30 };
    const handlers = makeHandlers(fakeCore, () => args);

    const result = await handlers.getStatus();

    expect(result).toEqual(shaped);
    expect(seenArgs).toEqual([args]);
  });

  it("registers the getStatus handler on the getStatus channel", () => {
    const registered: Record<string, unknown> = {};
    const fakeIpc = { handle: (channel: string, fn: unknown) => (registered[channel] = fn) } as unknown as IpcMain;
    registerIpc(
      fakeIpc,
      { getStatus: () => Promise.resolve({} as StatusResult) } as unknown as BoardCore,
      () => ({}) as unknown as Args
    );

    expect(typeof registered[IPC.getStatus]).toBe("function");
  });
});
