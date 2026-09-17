import { test, expect } from "./helpers/launch";

// artifact-viewing (item 4): a change with more than one capability writes one
// specs/<capability>/spec.md each. The single specs node must open a modal that
// lists ALL of them, each under its own capability heading — not just the first.
test.describe("multi-capability specs", () => {
  test("the specs node lists every capability's spec in the modal", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "ship-export" }),
    });
    await expect(card).toBeVisible();

    await card.locator(".node.clickable", { hasText: "specs" }).click();

    const modal = app.page.locator(".overlay.open");
    await expect(modal).toBeVisible();
    // both capability headings and both spec bodies are present
    await expect(modal.locator(".modal-body")).toContainText("csv-export");
    await expect(modal.locator(".modal-body")).toContainText("pdf-export");
    await expect(modal.locator(".modal-body")).toContainText("The system exports data as CSV.");
    await expect(modal.locator(".modal-body")).toContainText("The system exports data as PDF.");
  });
});
