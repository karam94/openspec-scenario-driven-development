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

    const statusText = app.page.locator("header .meta span", { hasText: "updated" });
    await expect(statusText).toBeVisible();
    const before = (await statusText.textContent()) ?? "";
    const statusCalls = () => (app.readStubLog().match(/openspec status/g) || []).length;
    const callsBefore = statusCalls();

    // Advance past REFRESH_MS (15s) — the interval fires a second getStatus...
    await app.page.clock.fastForward(20_000);

    // ...a second fetch happened AND the board re-rendered it (the updated-at
    // timestamp, produced fresh on each refresh, changes on the page).
    await expect.poll(() => statusCalls()).toBeGreaterThan(callsBefore);
    await expect(statusText).not.toHaveText(before);
  });
});
