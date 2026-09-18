import { test, expect } from "./helpers/launch";

// artifact-viewing (item 4): a change with more than one capability writes one
// specs/<capability>/spec.md each. The single specs node must open a modal with
// one tab per capability; clicking a tab shows that capability's spec on its own.
test.describe("multi-capability specs", () => {
  test("the specs node shows a tab per capability and switches content on click", async ({ app }) => {
    const card = app.page.locator(".change", {
      has: app.page.locator(".cname", { hasText: "ship-export" }),
    });
    await expect(card).toBeVisible();

    await card.locator(".node.clickable", { hasText: "specs" }).click();

    const modal = app.page.locator(".overlay.open");
    await expect(modal).toBeVisible();

    const csvTab = modal.getByRole("tab", { name: "csv-export" });
    const pdfTab = modal.getByRole("tab", { name: "pdf-export" });
    await expect(csvTab).toBeVisible();
    await expect(pdfTab).toBeVisible();

    // first tab active by default: only its spec is shown
    await expect(modal.locator(".modal-body")).toContainText("The system exports data as CSV.");
    await expect(modal.locator(".modal-body")).not.toContainText("The system exports data as PDF.");

    await pdfTab.click();
    await expect(modal.locator(".modal-body")).toContainText("The system exports data as PDF.");
    await expect(modal.locator(".modal-body")).not.toContainText("The system exports data as CSV.");
  });
});
