import { test, expect } from "./helpers/launch";

// Group 7 — electron-app-smoke-coverage: "Artifact files open in a modal via a real read".
test.describe("file modal", () => {
  test("opening an artifact shows its real file contents", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "add-search" }),
    });
    // The proposal phase is done → its node is clickable and opens the file.
    await card.locator(".node.clickable", { hasText: "proposal" }).click();

    const modal = app.page.locator(".overlay.open");
    await expect(modal).toBeVisible();
    await expect(modal.locator(".modal-body")).toContainText(
      "Full-text search across all discovered changes"
    );
  });
});
