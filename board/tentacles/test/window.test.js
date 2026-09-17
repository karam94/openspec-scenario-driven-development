import { describe, it, expect, vi } from "vitest";
import { createWindow, secureWebPreferences } from "../wiring.js";

describe("secure window creation", () => {
  it("creates one BrowserWindow with secure webPreferences and loads the local index.html", () => {
    const loadFile = vi.fn();
    const seen = [];
    class FakeBrowserWindow {
      constructor(opts) {
        seen.push(opts);
        this.loadFile = loadFile;
      }
    }

    const win = createWindow(FakeBrowserWindow, {
      preloadPath: "/app/preload.js",
      indexPath: "/app/index.html",
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].webPreferences).toEqual({
      preload: "/app/preload.js",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    });
    expect(loadFile).toHaveBeenCalledWith("/app/index.html");
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
