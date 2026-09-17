import { describe, it, expect } from "vitest";
import { makeHandlers, registerIpc, IPC } from "../wiring.js";

describe("getStatus IPC handler", () => {
  it("returns the shaped board state produced by core.getStatus for the current args", async () => {
    const shaped = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      repoCount: 2,
      changes: [{ change: "c1", repo: "r1" }],
    };
    const seenArgs = [];
    const fakeCore = {
      getStatus: (args) => {
        seenArgs.push(args);
        return shaped;
      },
    };
    const args = { repos: [], root: "/Users/x/Code", depth: 30 };
    const handlers = makeHandlers(fakeCore, () => args);

    const result = await handlers.getStatus();

    expect(result).toEqual(shaped);
    expect(seenArgs).toEqual([args]);
  });

  it("registers the getStatus handler on the getStatus channel", () => {
    const registered = {};
    const fakeIpc = { handle: (channel, fn) => (registered[channel] = fn) };
    registerIpc(fakeIpc, { getStatus: () => ({}) }, () => ({}));

    expect(typeof registered[IPC.getStatus]).toBe("function");
  });
});
