import { test, expect } from "./helpers/launch";

// Group 5 — electron-app-smoke-coverage: "External PR links open in the system browser".
test.describe("external PR links", () => {
  test("clicking a PR link opens externally and never spawns a child window", async ({ app }) => {
    // Record shell.openExternal in the main process — the window-open handler
    // calls it dynamically, so replacing it needs no production hook.
    await app.electronApp.evaluate(({ shell }) => {
      (globalThis as unknown as { __opened: string[] }).__opened = [];
      shell.openExternal = (url: string) => {
        (globalThis as unknown as { __opened: string[] }).__opened.push(url);
        return Promise.resolve();
      };
    });

    const prLink = app.page.locator("a.pr-node");
    await expect(prLink).toBeVisible();
    await prLink.click();

    const count = await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(count).toBe(1);

    const opened = await app.electronApp.evaluate(
      () => (globalThis as unknown as { __opened: string[] }).__opened
    );
    expect(opened).toContain("https://github.com/acme/repo-alpha/pull/42");
  });
});
