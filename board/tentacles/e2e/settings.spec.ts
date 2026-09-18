import { test, expect } from "./helpers/launch";
import path from "node:path";

// scan-root-settings (item 3): the Settings tab lets the user set the scan root.
// A valid root is persisted and the board re-scans live; an invalid path is
// rejected inline.
const APP_ROOT = path.resolve(__dirname, "..");
const REPO_BETA = path.join(APP_ROOT, "e2e", "fixtures", "repos", "repo-beta");

test.describe("scan-root settings", () => {
  test("saving a valid root re-scans the board without a restart", async ({ app }) => {
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();

    await app.page.getByTitle("Settings").click();
    const input = app.page.getByLabel("Scan root directory");
    await expect(input).toBeVisible();
    await input.fill(REPO_BETA);
    await app.page.getByRole("button", { name: "Save" }).click();

    // repo-beta's change appears; repo-alpha's is gone → the root changed and re-scanned
    await expect(app.page.locator(".cname", { hasText: "refactor-cleanup" })).toBeVisible();
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toHaveCount(0);
  });

  test("an invalid root is rejected inline and nothing changes", async ({ app }) => {
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();

    await app.page.getByTitle("Settings").click();
    await app.page.getByLabel("Scan root directory").fill("/no/such/directory/anywhere");
    await app.page.getByRole("button", { name: "Save" }).click();

    await expect(app.page.locator(".settings-error")).toBeVisible();
    await expect(app.page.getByLabel("Scan root directory")).toBeVisible();
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();
  });

  test("Browse fills the input from the native picker, then Save re-scans", async ({ app }) => {
    // Stub the native directory dialog in the main process to return repo-beta's
    // parent, so no real OS dialog is needed and the picked path is deterministic.
    // The stub records its arguments so the test can assert the focused window
    // and openDirectory options actually reach showOpenDialog.
    await app.electronApp.evaluate(({ dialog }, picked) => {
      (globalThis as Record<string, unknown>).__lastShowOpenDialog = undefined;
      dialog.showOpenDialog = (...args: unknown[]) => {
        (globalThis as Record<string, unknown>).__lastShowOpenDialog = args;
        return Promise.resolve({ canceled: false, filePaths: [picked] });
      };
    }, REPO_BETA);

    await expect(app.page.locator(".cname", { hasText: "add-search" })).toBeVisible();

    await app.page.getByTitle("Settings").click();
    const input = app.page.getByLabel("Scan root directory");
    await expect(input).toBeVisible();
    await app.page.getByRole("button", { name: "Browse…" }).click();
    await expect(input).toHaveValue(REPO_BETA);

    // The dialog was invoked with a parent BrowserWindow and openDirectory options,
    // so losing the window binding or the options would fail here — not silently pass.
    const call = await app.electronApp.evaluate(() => {
      const args = (globalThis as Record<string, unknown>).__lastShowOpenDialog as unknown[];
      if (!args) return null;
      const [first, second] = args;
      const opts = (args.length >= 2 ? second : first) as { properties?: string[] } | undefined;
      return {
        argc: args.length,
        hasParentWindow: args.length >= 2 && first != null && typeof first === "object",
        properties: opts?.properties ?? null,
      };
    });
    expect(call).not.toBeNull();
    expect(call!.argc).toBe(2);
    expect(call!.hasParentWindow).toBe(true);
    expect(call!.properties).toContain("openDirectory");

    await app.page.getByRole("button", { name: "Save" }).click();
    await expect(app.page.locator(".cname", { hasText: "refactor-cleanup" })).toBeVisible();
    await expect(app.page.locator(".cname", { hasText: "add-search" })).toHaveCount(0);
  });
});
