import { test, expect } from "./helpers/launch";

// Group 6 — electron-app-smoke-coverage: "A change can be archived from the board".
test.describe("archive", () => {
  test("clicking archive invokes the archive path and the card disappears", async ({ app }) => {
    // The renderer archives via window.confirm — accept the native dialog.
    app.page.on("dialog", (d) => d.accept());

    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "refactor-cleanup" }),
    });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Archive" }).click();

    // The card is removed from the board (optimistic hide + re-fetch)...
    await expect(app.page.locator(".cname", { hasText: "refactor-cleanup" })).toHaveCount(0);

    // ...and the archive IPC actually reached core / the CLI (stub invocation log).
    expect(app.readStubLog()).toContain("openspec archive refactor-cleanup");
  });
});
