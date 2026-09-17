import { test, expect } from "./helpers/launch";

// Group 8 — electron-app-smoke-coverage: "The theme can be toggled".
test.describe("theme toggle", () => {
  test("toggling the theme flips data-theme between dark and light", async ({ app }) => {
    const getTheme = () =>
      app.page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    await app.page.locator(".theme-btn").click();
    const first = await getTheme();
    expect(first === "light" || first === "dark").toBe(true);

    await app.page.locator(".theme-btn").click();
    const second = await getTheme();
    expect(second === "light" || second === "dark").toBe(true);
    expect(second).not.toBe(first);
  });
});
