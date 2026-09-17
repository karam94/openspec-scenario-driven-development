import { test, expect } from "./helpers/launch";

// item 6: artifacts render as formatted markdown (React elements), not raw source.
test.describe("markdown rendering", () => {
  test("the artifact modal renders headings and lists as elements, not raw markdown", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "ship-export" }),
    });
    await card.locator(".node.clickable", { hasText: "specs" }).click();

    const body = app.page.locator(".overlay.open .modal-body");
    await expect(body).toBeVisible();

    await expect(body.locator("h1").first()).toBeVisible();
    await expect(body.locator("h2").first()).toBeVisible();
    await expect(body.locator("ul li").first()).toBeVisible();
    await expect(body).not.toContainText("## csv-export");
  });
});
