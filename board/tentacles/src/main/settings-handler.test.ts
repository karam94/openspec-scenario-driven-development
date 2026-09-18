import { describe, it, expect } from "vitest";
import { makeHandlers, type BoardCore, type SettingsDeps } from "./wiring";
import type { Args, Settings } from "./core";

const args: Args = { repos: [], root: "/Code", depth: 30 };
const noCore = {} as unknown as BoardCore;

function fakeSettings(initial: Settings, isDir: (p: string) => boolean = () => true) {
  let stored: Settings = { ...initial };
  let root = initial.root ?? "/Code";
  const deps: SettingsDeps = {
    read: () => stored,
    write: (s: Settings) => {
      stored = s;
    },
    getRoot: () => root,
    setRoot: (r: string) => {
      root = r;
    },
    isDir,
    home: "/Users/tester",
  };
  return {
    deps,
    written: () => stored,
    liveRoot: () => root,
  };
}

describe("settings IPC handlers — notification preference", () => {
  it("getSettings returns the persisted notification preference", () => {
    const s = fakeSettings({ root: "/Code", notifications: "muted" });
    const handlers = makeHandlers(noCore, () => args, undefined, s.deps);
    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "muted" });
  });

  it("getSettings defaults the preference to enabled when unset", () => {
    const s = fakeSettings({ root: "/Code" });
    const handlers = makeHandlers(noCore, () => args, undefined, s.deps);
    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "enabled" });
  });

  it("setSettings persists both the validated root and the chosen preference", () => {
    const s = fakeSettings({ root: "/old", notifications: "enabled" });
    const handlers = makeHandlers(noCore, () => args, undefined, s.deps);

    const res = handlers.setSettings(undefined as never, { root: "/new", notifications: "silent" });

    expect(res).toEqual({ ok: true, root: "/new", notifications: "silent" });
    expect(s.written()).toEqual({ root: "/new", notifications: "silent" });
    expect(s.liveRoot()).toBe("/new");
  });

  it("setSettings preserves the existing preference when the payload omits it", () => {
    const s = fakeSettings({ root: "/old", notifications: "muted" });
    const handlers = makeHandlers(noCore, () => args, undefined, s.deps);

    const res = handlers.setSettings(undefined as never, { root: "/new" });

    expect(res).toEqual({ ok: true, root: "/new", notifications: "muted" });
    expect(s.written()).toEqual({ root: "/new", notifications: "muted" });
  });

  it("setSettings rejects an invalid root and writes nothing", () => {
    const s = fakeSettings({ root: "/old", notifications: "muted" }, () => false);
    const handlers = makeHandlers(noCore, () => args, undefined, s.deps);

    const res = handlers.setSettings(undefined as never, { root: "/nope", notifications: "silent" });

    expect(res.ok).toBe(false);
    expect(s.written()).toEqual({ root: "/old", notifications: "muted" });
    expect(s.liveRoot()).toBe("/old");
  });
});
