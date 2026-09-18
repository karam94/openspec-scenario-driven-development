import { describe, it, expect } from "vitest";
import core, { type Args, type Settings } from "./core";
import { makeHandlers, type SettingsDeps } from "./wiring";

const HOME = "/Users/tester";

describe("parseSettings — targets (backward compatible)", () => {
  it("reads a known-targets array alongside root", () => {
    expect(core.parseSettings('{"root":"/a","targets":["kiro","kiro-crew"]}')).toEqual({
      root: "/a",
      targets: ["kiro", "kiro-crew"],
    });
  });

  it("ignores unknown/junk target values", () => {
    expect(core.parseSettings('{"root":"/a","targets":["kiro","bogus",7]}')).toEqual({
      root: "/a",
      targets: ["kiro"],
    });
  });

  it("resolves to no targets when the field is absent (older file)", () => {
    expect(core.parseSettings('{"root":"/a"}')).toEqual({ root: "/a" });
  });

  it("parses all three keys together (root + notifications + targets)", () => {
    expect(
      core.parseSettings('{"root":"/a","notifications":"muted","targets":["kiro","kiro-crew"]}')
    ).toEqual({ root: "/a", notifications: "muted", targets: ["kiro", "kiro-crew"] });
  });
});

describe("settings handlers — targets round-trip", () => {
  function fakeSettings(initial: Settings = {}): SettingsDeps {
    let store: Settings = { ...initial };
    let root = initial.root ?? "";
    return {
      read: () => store,
      write: (s: Settings) => {
        store = s;
      },
      getRoot: () => root,
      setRoot: (r: string) => {
        root = r;
      },
      isDir: () => true,
      home: HOME,
    };
  }

  it("setSettings persists root + targets and getSettings returns them", () => {
    const settings = fakeSettings({ root: "/Code" });
    const args: Args = { repos: [], root: "/Code", depth: 1 };
    const handlers = makeHandlers(core, () => args, undefined, settings);

    const res = handlers.setSettings({} as never, { root: "/Code", targets: ["kiro", "kiro-crew"] });
    expect(res).toEqual({ ok: true, root: "/Code", notifications: "enabled", targets: ["kiro", "kiro-crew"] });

    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "enabled", targets: ["kiro", "kiro-crew"] });
  });

  it("getSettings returns an empty targets list when none are persisted", () => {
    const settings = fakeSettings({ root: "/Code" });
    const args: Args = { repos: [], root: "/Code", depth: 1 };
    const handlers = makeHandlers(core, () => args, undefined, settings);
    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "enabled", targets: [] });
  });

  it("preserves a non-empty stored targets selection when the payload omits targets", () => {
    const settings = fakeSettings({ root: "/Code", notifications: "enabled", targets: ["kiro", "kiro-crew"] });
    const args: Args = { repos: [], root: "/Code", depth: 1 };
    const handlers = makeHandlers(core, () => args, undefined, settings);

    const res = handlers.setSettings({} as never, { root: "/Code", notifications: "muted" });
    expect(res).toEqual({ ok: true, root: "/Code", notifications: "muted", targets: ["kiro", "kiro-crew"] });
    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "muted", targets: ["kiro", "kiro-crew"] });
  });

  it("preserves stored notifications when the payload omits it but supplies targets", () => {
    const settings = fakeSettings({ root: "/Code", notifications: "muted", targets: [] });
    const args: Args = { repos: [], root: "/Code", depth: 1 };
    const handlers = makeHandlers(core, () => args, undefined, settings);

    const res = handlers.setSettings({} as never, { root: "/Code", targets: ["claude"] });
    expect(res).toEqual({ ok: true, root: "/Code", notifications: "muted", targets: ["claude"] });
    expect(handlers.getSettings()).toEqual({ root: "/Code", notifications: "muted", targets: ["claude"] });
  });
});
