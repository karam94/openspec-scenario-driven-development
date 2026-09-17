import { describe, it, expect } from "vitest";
import path from "node:path";
import { parseSettings, expandTilde, validateRoot, resolveRoot } from "./core";

const HOME = "/Users/tester";

describe("settings — pure parse / expand / validate / resolve", () => {
  it("parses a settings.json body into a root, ignoring junk", () => {
    expect(parseSettings('{"root":"/a/b"}')).toEqual({ root: "/a/b" });
    expect(parseSettings("not json")).toEqual({});
    expect(parseSettings('{"root":123}')).toEqual({});
    expect(parseSettings("{}")).toEqual({});
  });

  it("expands a leading tilde to the home directory", () => {
    expect(expandTilde("~", HOME)).toBe(HOME);
    expect(expandTilde("~/Projects", HOME)).toBe(path.join(HOME, "Projects"));
    expect(expandTilde("/abs/path", HOME)).toBe("/abs/path");
    expect(expandTilde("relative", HOME)).toBe("relative");
  });

  it("accepts an existing directory, expanding the tilde", () => {
    const isDir = (p: string) => p === path.join(HOME, "Code");
    const res = validateRoot("~/Code", isDir, HOME);
    expect(res).toEqual({ ok: true, root: path.join(HOME, "Code") });
  });

  it("rejects a path that does not resolve to an existing directory", () => {
    const isDir = () => false;
    const res = validateRoot("~/Nope", isDir, HOME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBeTruthy();
  });

  it("rejects an empty path", () => {
    const res = validateRoot("   ", () => true, HOME);
    expect(res.ok).toBe(false);
  });

  it("resolves persisted → TENTACLES_ROOT → ~/Code in that order", () => {
    // persisted wins
    expect(resolveRoot({ root: "/persisted" }, { TENTACLES_ROOT: "/env" }, HOME)).toBe("/persisted");
    // env next
    expect(resolveRoot({}, { TENTACLES_ROOT: "/env" }, HOME)).toBe("/env");
    // default last
    expect(resolveRoot({}, {}, HOME)).toBe(path.join(HOME, "Code"));
  });
});
