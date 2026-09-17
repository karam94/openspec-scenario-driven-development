import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { mockApi } from "./test-fixtures";

describe("theme", () => {
  it("applies a saved theme choice on load", async () => {
    localStorage.setItem("osb-theme", "light");
    mockApi();

    render(<App />);
    await screen.findByTitle("Toggle dark / light");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("toggles and persists the theme", async () => {
    mockApi(); // no saved choice; matchMedia stub → effective dark
    const user = userEvent.setup();

    render(<App />);
    const btn = await screen.findByTitle("Toggle dark / light");

    await user.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("osb-theme")).toBe("light");

    await user.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("osb-theme")).toBe("dark");
  });
});
