import { test, expect } from "./helpers/launch";

// phase-progress: a phase is complete only when the NEXT artifact exists. A change
// whose grill.md exists but whose proposal.md does not must render grill as
// in-progress — grill.md alone no longer marks grilling done.
test.describe("phase progress", () => {
  test("a change mid-grill shows the grill node in-progress, not done", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "draft-idea" }),
    });
    await expect(card).toBeVisible();

    await expect(card.locator(".node.progress", { hasText: "grill" })).toContainText("in progress");
    await expect(card.locator(".node", { hasText: "grill" })).not.toContainText("done");
    // downstream planning phases are still pending
    await expect(card.locator(".node.pending", { hasText: "proposal" })).toContainText("pending");
  });
});
