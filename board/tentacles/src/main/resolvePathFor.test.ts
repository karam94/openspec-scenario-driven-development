import { describe, it, expect } from "vitest";
import { resolvePathFor } from "./wiring";

describe("resolvePathFor — startup PATH-resolver selection", () => {
  it("returns a no-op that does NOT run the real resolver when TENTACLES_E2E is set", async () => {
    let ran = false;
    const chosen = resolvePathFor({ TENTACLES_E2E: "1" } as NodeJS.ProcessEnv, async () => {
      ran = true;
    });
    await chosen();
    expect(ran).toBe(false);
  });

  it("runs the real resolver when TENTACLES_E2E is unset", async () => {
    let ran = false;
    const chosen = resolvePathFor({} as NodeJS.ProcessEnv, async () => {
      ran = true;
    });
    await chosen();
    expect(ran).toBe(true);
  });
});
