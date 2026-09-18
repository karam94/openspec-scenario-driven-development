import { test, expect } from "./helpers/launch";

// worktree-visibility: two worktrees of one repository (shared git common-dir,
// stubbed) must group under a single Repository row, each card labelled with its
// own git branch.
test.describe("worktree visibility", () => {
  test("concurrent worktrees group under one Repository row with per-branch cards", async ({ app }) => {
    const group = app.page.locator(".repo-group", {
      has: app.page.locator(".repo-title", { hasText: "wings-core" }),
    });
    await expect(group).toBeVisible();

    // exactly the two worktree cards, grouped under the one row
    await expect(group.locator(".change")).toHaveCount(2);

    // each card carries its own branch chip
    await expect(group.locator(".branch-chip", { hasText: "feat-a" })).toBeVisible();
    await expect(group.locator(".branch-chip", { hasText: "feat-b" })).toBeVisible();
  });
});
