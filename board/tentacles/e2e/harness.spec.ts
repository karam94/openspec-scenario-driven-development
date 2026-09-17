import { test, expect } from "./helpers/launch";

// Group 2 — hermetic-launch-configuration: "Injected stub PATH survives under
// the e2e flag". The tracer bullet that establishes the whole harness.
test.describe("hermetic launch", () => {
  test("the injected stub PATH survives and the app reaches the stub CLIs", async ({ app }) => {
    // The board rendering seeded data means getStatus round-tripped through the
    // real main process to core, which shelled out to `openspec`.
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();

    // Direct proof of seam 2: the STUB openspec (not the real CLI) was invoked —
    // only possible if login-shell PATH resolution did not clobber our PATH.
    const log = app.readStubLog();
    expect(log).toContain("openspec status");
    expect(log).toContain("--change add-search");
  });

  test("seeded fixture changes and repos render on the board", async ({ app }) => {
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();
    await expect(app.page.locator(".cname", { hasText: "ship-export" })).toBeVisible();
    await expect(app.page.locator(".cname", { hasText: "refactor-cleanup" })).toBeVisible();

    await expect(app.page.locator(".repo-title", { hasText: "repo-alpha" })).toBeVisible();
    await expect(app.page.locator(".repo-title", { hasText: "repo-beta" })).toBeVisible();
  });
});
