import { describe, it, expect, vi } from "vitest";
import { bootstrap } from "../wiring.js";

function fakeApp() {
  const listeners = {};
  return {
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    emit(ev, ...a) { (listeners[ev] || []).forEach((fn) => fn(...a)); },
    quit: vi.fn(),
  };
}

// FakeBrowserWindow tracks live instances so getAllWindows() reflects reality.
// `alwaysEmpty` models the "no window currently open" case (e.g. after close).
function makeFakeBrowserWindow({ order = [], alwaysEmpty = false } = {}) {
  const instances = [];
  class FakeBrowserWindow {
    constructor(opts) {
      this.opts = opts;
      this.loadFile = vi.fn();
      instances.push(this);
      order.push("window");
    }
    static getAllWindows() {
      return alwaysEmpty ? [] : instances;
    }
  }
  return { FakeBrowserWindow, instances };
}

const deps = (over = {}) => ({
  core: { getStatus: () => ({}), readArtifact: () => ({}), archiveChange: () => ({}) },
  getArgs: () => ({ repos: [], root: "/x", depth: 30 }),
  windowOpts: { preloadPath: "/p", indexPath: "/i" },
  platform: "darwin",
  resolvePath: vi.fn(async () => {}),
  ...over,
});

describe("bootstrap startup coordinator", () => {
  it("registers IPC and resolves PATH before opening the one window", async () => {
    const app = fakeApp();
    const order = [];
    const { FakeBrowserWindow, instances } = makeFakeBrowserWindow({ order });
    const ipcMain = { handle: () => order.push("ipc") };
    const resolvePath = vi.fn(async () => { order.push("path"); });

    await bootstrap({ ...deps({ resolvePath }), app, BrowserWindow: FakeBrowserWindow, ipcMain });

    expect(instances).toHaveLength(1);
    expect(order.filter((x) => x === "ipc")).toHaveLength(3); // three channels
    // window is created only after IPC registration and PATH resolution
    expect(order.indexOf("window")).toBeGreaterThan(order.lastIndexOf("ipc"));
    expect(order.indexOf("window")).toBeGreaterThan(order.indexOf("path"));
  });

  it("ignores an activate that fires during startup and never opens a second window", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow, instances } = makeFakeBrowserWindow();
    let release;
    const resolvePath = () => new Promise((r) => (release = r));

    const pending = bootstrap({ ...deps({ resolvePath }), app, BrowserWindow: FakeBrowserWindow, ipcMain: { handle() {} } });

    app.emit("activate"); // fires while PATH resolution is pending
    expect(instances).toHaveLength(0); // no premature window

    release();
    await pending;
    expect(instances).toHaveLength(1);

    app.emit("activate"); // re-activation with the window still open → idempotent
    expect(instances).toHaveLength(1);
  });

  it("re-creates a window on activate after startup when none are open", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow, instances } = makeFakeBrowserWindow({ alwaysEmpty: true });

    await bootstrap({ ...deps(), app, BrowserWindow: FakeBrowserWindow, ipcMain: { handle() {} } });
    expect(instances).toHaveLength(1);

    app.emit("activate"); // getAllWindows() reports none → create one
    expect(instances).toHaveLength(2);
  });

  it("stays resident on window-all-closed on darwin", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow } = makeFakeBrowserWindow();
    await bootstrap({ ...deps({ platform: "darwin" }), app, BrowserWindow: FakeBrowserWindow, ipcMain: { handle() {} } });
    app.emit("window-all-closed");
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("quits on window-all-closed on non-darwin platforms", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow } = makeFakeBrowserWindow();
    await bootstrap({ ...deps({ platform: "linux" }), app, BrowserWindow: FakeBrowserWindow, ipcMain: { handle() {} } });
    app.emit("window-all-closed");
    expect(app.quit).toHaveBeenCalledTimes(1);
  });
});
