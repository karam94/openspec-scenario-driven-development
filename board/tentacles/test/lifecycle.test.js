import { describe, it, expect, vi } from "vitest";
import { wireLifecycle } from "../wiring.js";

function fakeApp() {
  const listeners = {};
  return {
    on(ev, fn) {
      (listeners[ev] ||= []).push(fn);
    },
    emit(ev, ...a) {
      (listeners[ev] || []).forEach((fn) => fn(...a));
    },
    quit: vi.fn(),
  };
}

describe("macOS lifecycle", () => {
  it("stays resident (does not quit) on window-all-closed on darwin", () => {
    const app = fakeApp();
    wireLifecycle({ app, BrowserWindow: { getAllWindows: () => [] }, createWin: vi.fn(), platform: "darwin" });
    app.emit("window-all-closed");
    expect(app.quit).not.toHaveBeenCalled();
  });

  it("quits on window-all-closed on non-darwin platforms", () => {
    const app = fakeApp();
    wireLifecycle({ app, BrowserWindow: { getAllWindows: () => [] }, createWin: vi.fn(), platform: "linux" });
    app.emit("window-all-closed");
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it("re-creates a window on activate when none are open", () => {
    const app = fakeApp();
    const createWin = vi.fn();
    wireLifecycle({ app, BrowserWindow: { getAllWindows: () => [] }, createWin, platform: "darwin" });
    app.emit("activate");
    expect(createWin).toHaveBeenCalledTimes(1);
  });

  it("does not re-create a window on activate when one is already open", () => {
    const app = fakeApp();
    const createWin = vi.fn();
    wireLifecycle({ app, BrowserWindow: { getAllWindows: () => [{}] }, createWin, platform: "darwin" });
    app.emit("activate");
    expect(createWin).not.toHaveBeenCalled();
  });
});
