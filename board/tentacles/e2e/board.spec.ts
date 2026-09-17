import { test, expect } from "./helpers/launch";

// Group 4 — electron-app-smoke-coverage: "The board renders seeded change data".
test.describe("board renders seeded data", () => {
  test("phase chain and type badges render for a mid-flight change", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "add-search" }),
    });
    await expect(card).toBeVisible();

    // grill + proposal done, specs in progress, per the seeded status.
    await expect(card.locator(".node", { hasText: "grill" })).toContainText("done");
    await expect(card.locator(".node", { hasText: "proposal" })).toContainText("done");
    await expect(card.locator(".node.progress", { hasText: "specs" })).toBeVisible();

    // a mid-flight feature carries the FEATURE type badge.
    await expect(card.locator(".badge.type-feature")).toBeVisible();
  });

  test("a behaviour-preserving change carries the REFACTOR badge", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "refactor-cleanup" }),
    });
    await expect(card.locator(".badge.type-refactor")).toBeVisible();
  });
});
