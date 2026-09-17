import { describe, it, expect, vi } from "vitest";
import { createWindow, secureWebPreferences, makeWindowOpenHandler } from "../wiring.js";

describe("secure window creation", () => {
  it("creates one BrowserWindow with secure webPreferences and loads the local index.html", () => {
    const loadFile = vi.fn();
    const setWindowOpenHandler = vi.fn();
    const seen = [];
    class FakeBrowserWindow {
      constructor(opts) {
        seen.push(opts);
        this.loadFile = loadFile;
        this.webContents = { setWindowOpenHandler };
      }
    }

    const win = createWindow(FakeBrowserWindow, {
      preloadPath: "/app/preload.js",
      indexPath: "/app/index.html",
      openExternal: vi.fn(),
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].webPreferences).toEqual({
      preload: "/app/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(loadFile).toHaveBeenCalledWith("/app/index.html");
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
    const opened = [];
    const handler = makeWindowOpenHandler((u) => opened.push(u));
    const result = handler({ url: "https://github.com/o/r/pull/1" });
    expect(result).toEqual({ action: "deny" });
    expect(opened).toEqual(["https://github.com/o/r/pull/1"]);
  });

  it("denies and does not externally open a non-https URL", () => {
    const opened = [];
    const handler = makeWindowOpenHandler((u) => opened.push(u));
    expect(handler({ url: "file:///etc/passwd" })).toEqual({ action: "deny" });
    expect(opened).toEqual([]);
  });
});
