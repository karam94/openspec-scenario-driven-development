import { test, expect } from "./helpers/launch";

// Group 9 — electron-app-smoke-coverage: "The board auto-refreshes on its interval".
test.describe("auto-refresh", () => {
  test("the board re-fetches after the refresh interval elapses", async ({ app }) => {
    // Install a controllable clock, then reload so the app's interval is armed
    // under the fake clock (no real 15s wait).
    await app.page.clock.install();
    await app.page.reload();
    await app.page.waitForLoadState("domcontentloaded");
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();

    const statusCalls = () => (app.readStubLog().match(/openspec status/g) || []).length;
    const before = statusCalls();

    // Advance past REFRESH_MS (15s) — the interval fires a second getStatus.
    await app.page.clock.fastForward(20_000);

    await expect.poll(() => statusCalls()).toBeGreaterThan(before);
  });
});
