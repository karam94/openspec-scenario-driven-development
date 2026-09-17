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
});
