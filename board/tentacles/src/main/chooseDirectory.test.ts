import { describe, it, expect, vi } from "vitest";
import { makeDirectoryChooser, makeHandlers, type BoardCore } from "./wiring";
import type { Args } from "./core";

const core = {} as unknown as BoardCore;
const getArgs = (): Args => ({ repos: [], root: "/x", depth: 30 });

describe("makeDirectoryChooser", () => {
  it("returns the first selected path", async () => {
    const choose = makeDirectoryChooser(async () => ({ canceled: false, filePaths: ["/picked/root"] }));
    expect(await choose()).toBe("/picked/root");
  });

  it("returns null when the dialog is cancelled", async () => {
    const choose = makeDirectoryChooser(async () => ({ canceled: true, filePaths: [] }));
    expect(await choose()).toBeNull();
  });

  it("returns null when no path is selected", async () => {
    const choose = makeDirectoryChooser(async () => ({ canceled: false, filePaths: [] }));
    expect(await choose()).toBeNull();
  });
});

describe("chooseDirectory handler", () => {
  it("wraps the chosen path in a ChooseDirectoryResult", async () => {
    const chooseDirectory = vi.fn().mockResolvedValue("/picked/root");
    const handlers = makeHandlers(core, getArgs, undefined, undefined, chooseDirectory);
    expect(await handlers.chooseDirectory()).toEqual({ path: "/picked/root" });
    expect(chooseDirectory).toHaveBeenCalledTimes(1);
  });

  it("resolves to a null path when no chooser is wired", async () => {
    const handlers = makeHandlers(core, getArgs);
    expect(await handlers.chooseDirectory()).toEqual({ path: null });
  });
});
