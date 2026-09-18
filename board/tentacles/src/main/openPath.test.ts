import { describe, it, expect, vi } from "vitest";
import { makeHandlers, type BoardCore } from "./wiring";
import type { Args } from "./core";
import type { IpcMainInvokeEvent } from "electron";

const core = {} as unknown as BoardCore;
const getArgs = (): Args => ({ repos: [], root: "/x", depth: 30 });
const event = {} as IpcMainInvokeEvent;

describe("openPath handler", () => {
  it("reveals the requested folder and reports success", async () => {
    const openPath = vi.fn().mockResolvedValue("");
    const handlers = makeHandlers(core, getArgs, undefined, undefined, undefined, openPath);
    expect(await handlers.openPath(event, "/Code/wings-core-a")).toEqual({ ok: true });
    expect(openPath).toHaveBeenCalledWith("/Code/wings-core-a");
  });

  it("surfaces the OS error when the folder cannot be opened", async () => {
    const openPath = vi.fn().mockResolvedValue("no such file or directory");
    const handlers = makeHandlers(core, getArgs, undefined, undefined, undefined, openPath);
    expect(await handlers.openPath(event, "/Code/gone")).toEqual({
      ok: false,
      error: "no such file or directory",
    });
  });

  it("reports an error when no opener is wired", async () => {
    const handlers = makeHandlers(core, getArgs);
    expect(await handlers.openPath(event, "/Code/repo")).toEqual({
      ok: false,
      error: "open unavailable",
    });
  });
});
