import { describe, it, expect } from "vitest";
import { resolveShellPath } from "../wiring.js";

describe("login-shell PATH resolution", () => {
  it("upgrades a minimal GUI PATH with the resolved login-shell PATH so CLIs resolve", async () => {
    const env = { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" }; // as a Finder-launched .app receives
    const applied = await resolveShellPath(
      async () => "/Users/x/.nvm/versions/node/v24.2.0/bin:/opt/homebrew/bin:/usr/bin:/bin",
      env
    );
    expect(env.PATH).toContain("/.nvm/versions/node/");
    expect(env.PATH).toContain("/opt/homebrew/bin");
    expect(applied).toBe(env.PATH);
  });

  it("resolves the PATH BEFORE the first CLI invocation (the invocation sees the resolved PATH)", async () => {
    const env = { PATH: "/usr/bin:/bin" };
    let pathSeenByCli = null;
    const invokeCli = () => { pathSeenByCli = env.PATH; }; // stands in for openspec/gh

    // Startup order: resolve, THEN invoke.
    await resolveShellPath(async () => "/opt/homebrew/bin:/usr/bin:/bin", env);
    invokeCli();

    expect(pathSeenByCli).toContain("/opt/homebrew/bin");
  });

  it("accepts an object-shaped resolver result ({ PATH })", async () => {
    const env = { PATH: "/usr/bin:/bin" };
    await resolveShellPath(async () => ({ PATH: "/opt/homebrew/bin:/usr/bin:/bin" }), env);
    expect(env.PATH).toContain("/opt/homebrew/bin");
  });

  it("leaves PATH unchanged when resolution fails (returns null)", async () => {
    const env = { PATH: "/usr/bin:/bin" };
    await resolveShellPath(async () => null, env);
    expect(env.PATH).toBe("/usr/bin:/bin");
  });
});
