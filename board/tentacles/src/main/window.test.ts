import { describe, it, expect, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { createWindow, secureWebPreferences, makeWindowOpenHandler } from "./wiring";

describe("secure window creation", () => {
  it("creates one BrowserWindow with secure webPreferences and loads the local index.html", () => {
    const loadFile = vi.fn();
    const setWindowOpenHandler = vi.fn();
    const seen: Array<{ webPreferences?: unknown }> = [];
    class FakeBrowserWindow {
      loadFile = loadFile;
      webContents = { setWindowOpenHandler };
      constructor(opts: { webPreferences?: unknown }) {
        seen.push(opts);
      }
    }

    const win = createWindow(FakeBrowserWindow as unknown as typeof BrowserWindow, {
      preloadPath: "/app/build/preload/preload.js",
      indexPath: "/app/build/renderer/index.html",
      openExternal: vi.fn(),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.webPreferences).toEqual({
      preload: "/app/build/preload/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(loadFile).toHaveBeenCalledWith("/app/build/renderer/index.html");
    expect(setWindowOpenHandler).toHaveBeenCalledTimes(1);
    expect(win).toBeInstanceOf(FakeBrowserWindow);
  });

  it("secureWebPreferences pins the hardened renderer flags (no direct Node in the renderer)", () => {
    expect(secureWebPreferences("/p/preload.js")).toEqual({
      preload: "/p/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
  });
});

describe("external link handling (window-open handler)", () => {
  it("opens an https link in the system browser and denies an in-app child window", () => {
    const opened: string[] = [];
    const handler = makeWindowOpenHandler((u) => opened.push(u));
    const result = handler({ url: "https://github.com/o/r/pull/1" });
    expect(result).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://github.com/o/r/pull/1"]);
  });

  it("denies and does not externally open a non-https URL", () => {
    const opened: string[] = [];
    const handler = makeWindowOpenHandler((u) => opened.push(u));
    expect(handler({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
    expect(opened).toEqual([]);
  });
});
