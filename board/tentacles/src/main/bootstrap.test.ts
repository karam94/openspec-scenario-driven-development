import { describe, it, expect, vi } from "vitest";
import type { App, BrowserWindow, IpcMain } from "electron";
import { bootstrap, type BoardCore, type BootstrapDeps } from "./wiring";
import type { Args } from "./core";

function fakeApp() {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  return {
    on(ev: string, fn: (...a: unknown[]) => void) {
      (listeners[ev] ||= []).push(fn);
    },
    emit(ev: string, ...a: unknown[]) {
      (listeners[ev] || []).forEach((fn) => fn(...a));
    },
    quit: vi.fn(),
  };
}

// FakeBrowserWindow tracks live instances so getAllWindows() reflects reality.
// `alwaysEmpty` models the "no window currently open" case (e.g. after close).
function makeFakeBrowserWindow({ order = [] as string[], alwaysEmpty = false } = {}) {
  const instances: FakeBrowserWindow[] = [];
  class FakeBrowserWindow {
    loadFile = vi.fn();
    webContents = { setWindowOpenHandler: vi.fn() };
    constructor(public opts: unknown) {
      instances.push(this);
      order.push("window");
    }
    static getAllWindows() {
      return alwaysEmpty ? [] : instances;
    }
  }
  return { FakeBrowserWindow, instances };
}

const deps = (over: Partial<BootstrapDeps> = {}): BootstrapDeps =>
  ({
    core: {
      getStatus: () => Promise.resolve({} as never),
      readArtifact: () => ({}) as never,
      archiveChange: () => Promise.resolve({} as never),
    } as unknown as BoardCore,
    getArgs: () => ({ repos: [], root: "/x", depth: 30 }) as Args,
    windowOpts: { preloadPath: "/p", indexPath: "/i" },
    platform: "darwin",
    resolvePath: vi.fn(async () => {}),
    ...over,
  }) as BootstrapDeps;

describe("bootstrap startup coordinator", () => {
  it("registers IPC and resolves PATH before opening the one window", async () => {
    const app = fakeApp();
    const order: string[] = [];
    const { FakeBrowserWindow, instances } = makeFakeBrowserWindow({ order });
    const ipcMain = { handle: () => order.push("ipc") };
    const resolvePath = vi.fn(async () => {
      order.push("path");
    });

    await bootstrap({
      ...deps({ resolvePath }),
      app: app as unknown as App,
      BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
      ipcMain: ipcMain as unknown as IpcMain,
    });

    expect(instances).toHaveLength(1);
    expect(order.filter((x) => x === "ipc")).toHaveLength(8); // eight channels
    expect(order.indexOf("window")).toBeGreaterThan(order.lastIndexOf("ipc"));
    expect(order.indexOf("window")).toBeGreaterThan(order.indexOf("path"));
  });

  it("ignores an activate that fires during startup and never opens a second window", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow, instances } = makeFakeBrowserWindow();
    let release: () => void = () => {};
    const resolvePath = () => new Promise<void>((r) => (release = r));

    const pending = bootstrap({
      ...deps({ resolvePath }),
      app: app as unknown as App,
      BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
      ipcMain: { handle() {} } as unknown as IpcMain,
    });

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

    await bootstrap({
      ...deps(),
      app: app as unknown as App,
      BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
      ipcMain: { handle() {} } as unknown as IpcMain,
    });
    expect(instances).toHaveLength(1);

    app.emit("activate"); // getAllWindows() reports none → create one
    expect(instances).toHaveLength(2);
  });

  it("stays resident on window-all-closed on darwin", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow } = makeFakeBrowserWindow();
    await bootstrap({
      ...deps({ platform: "darwin" }),
      app: app as unknown as App,
      BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
      ipcMain: { handle() {} } as unknown as IpcMain,
    });
    app.emit("window-all-closed");
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("quits on window-all-closed on non-darwin platforms", async () => {
    const app = fakeApp();
    const { FakeBrowserWindow } = makeFakeBrowserWindow();
    await bootstrap({
      ...deps({ platform: "linux" }),
      app: app as unknown as App,
      BrowserWindow: FakeBrowserWindow as unknown as typeof BrowserWindow,
      ipcMain: { handle() {} } as unknown as IpcMain,
    });
    app.emit("window-all-closed");
    expect(app.quit).toHaveBeenCalledTimes(1);
  });
});
