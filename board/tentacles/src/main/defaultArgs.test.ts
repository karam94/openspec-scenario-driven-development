import { describe, it, expect, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { defaultArgs, DEFAULT_DEPTH } from "./core";

const saved = { root: process.env.TENTACLES_ROOT, depth: process.env.TENTACLES_DEPTH };

afterEach(() => {
  if (saved.root === undefined) delete process.env.TENTACLES_ROOT;
  else process.env.TENTACLES_ROOT = saved.root;
  if (saved.depth === undefined) delete process.env.TENTACLES_DEPTH;
  else process.env.TENTACLES_DEPTH = saved.depth;
});

describe("defaultArgs scan-root env seam", () => {
  it("uses TENTACLES_ROOT and TENTACLES_DEPTH when set", () => {
    process.env.TENTACLES_ROOT = "/fixtures/repos";
    process.env.TENTACLES_DEPTH = "4";
    expect(defaultArgs()).toEqual({ repos: [], root: "/fixtures/repos", depth: 4 });
  });

  it("falls back to today's ~/Code and DEFAULT_DEPTH when unset", () => {
    delete process.env.TENTACLES_ROOT;
    delete process.env.TENTACLES_DEPTH;
    expect(defaultArgs()).toEqual({
      repos: [],
      root: path.join(os.homedir(), "Code"),
      depth: DEFAULT_DEPTH,
    });
  });

  it("ignores a non-numeric TENTACLES_DEPTH, keeping DEFAULT_DEPTH", () => {
    process.env.TENTACLES_ROOT = "/fixtures/repos";
    process.env.TENTACLES_DEPTH = "not-a-number";
    expect(defaultArgs()).toEqual({ repos: [], root: "/fixtures/repos", depth: DEFAULT_DEPTH });
  });
});
