import { test, expect } from "./helpers/launch";

// Group 3 — electron-app-smoke-coverage: "The app launches as a single secure window".
test.describe("single secure window", () => {
  test("boots to exactly one window", async ({ app }) => {
    const count = await app.electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(count).toBe(1);
  });

  test("the window uses the secure renderer posture", async ({ app }) => {
    const prefs = await app.electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win?.webContents.getLastWebPreferences() ?? null;
    });
    expect(prefs?.contextIsolation).toBe(true);
    expect(prefs?.nodeIntegration).toBe(false);
    expect(prefs?.sandbox).toBe(true);
  });

  // Under the e2e harness (TENTACLES_E2E) the window must launch hidden so the
  // app never pops a window that steals the developer's keyboard focus mid-run.
  // Asserted through the Electron seam so deleting the production wiring in
  // main.ts fails here rather than silently reintroducing focus stealing.
  test("launches hidden so it never steals focus", async ({ app }) => {
    const visible = await app.electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isVisible()
    );
    expect(visible).toBe(false);
  });
});
