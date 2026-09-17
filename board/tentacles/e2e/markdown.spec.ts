import { test, expect } from "./helpers/launch";

// artifact-viewing (item 6): the modal renders artifacts as formatted markdown
// (React elements), not raw source in a <pre>.
test.describe("markdown rendering", () => {
  test("the artifact modal renders headings and lists as elements, not raw markdown", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "ship-export" }),
    });
    await card.locator(".node.clickable", { hasText: "specs" }).click();

    const body = app.page.locator(".overlay.open .modal-body");
    await expect(body).toBeVisible();

    // formatted elements are produced (headings + a list), not literal markers
    await expect(body.locator("h1").first()).toBeVisible();
    await expect(body.locator("h2").first()).toBeVisible();
    await expect(body.locator("ul li").first()).toBeVisible();
    // the raw markdown source is not shown verbatim
    await expect(body).not.toContainText("## csv-export");
  });
});
