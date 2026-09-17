import { test, expect } from "./helpers/launch";

// Group 4 — electron-app-smoke-coverage: "The board renders seeded change data".
test.describe("board renders seeded data", () => {
  test("phase chain and type/status badges render for a mid-flight change", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "add-search" }),
    });
    await expect(card).toBeVisible();

    // All five phases in their seeded states: grill + proposal done, specs in
    // progress, design + tasks pending.
    await expect(card.locator(".node", { hasText: "grill" })).toContainText("done");
    await expect(card.locator(".node", { hasText: "proposal" })).toContainText("done");
    await expect(card.locator(".node.progress", { hasText: "specs" })).toBeVisible();
    await expect(card.locator(".node.pending", { hasText: "design" })).toContainText("pending");
    await expect(card.locator(".node.pending", { hasText: "tasks" })).toContainText("pending");

    // A mid-flight, planning-incomplete feature carries FEATURE + PLANNING.
    await expect(card.locator(".badge.type-feature")).toBeVisible();
    await expect(card.locator(".badge.planning")).toHaveText("PLANNING");
  });

  test("a behaviour-preserving change carries the REFACTOR badge", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "refactor-cleanup" }),
    });
    await expect(card.locator(".badge.type-refactor")).toBeVisible();
  });
});
