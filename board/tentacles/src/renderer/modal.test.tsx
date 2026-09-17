import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeChange, makeStatus, mockApi, phase } from "./test-fixtures";

function changeWithFile() {
  return makeChange({
    change: "file-demo",
    phases: [
      phase("grill", { done: true, files: ["/repo/openspec/changes/x/proposal.md"] }),
      phase("proposal"),
      phase("specs"),
      phase("design"),
      phase("tasks"),
    ],
  });
}

describe("file modal", () => {
  it("opens a file and shows its contents as text", async () => {
    const api = mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: "hello contents" }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");
    await user.click(screen.getByText("grill"));

    expect(api.readFile).toHaveBeenCalledWith("/repo/openspec/changes/x/proposal.md");
    await waitFor(() => expect(document.querySelector(".modal-body")?.textContent).toBe("hello contents"));
  });

  it("renders untrusted HTML content as text, not DOM", async () => {
    const evil = "<script>alert(1)</script>";
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: evil }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");
    await user.click(screen.getByText("grill"));

    await waitFor(() => expect(document.querySelector(".modal-body")?.textContent).toBe(evil));
    expect(document.querySelector(".modal-body script")).toBeNull();
  });

  it("renders markdown as formatted elements (heading, list, task list, table)", async () => {
    const md = [
      "# Title",
      "",
      "- one",
      "- two",
      "",
      "- [ ] todo",
      "- [x] done",
      "",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
    ].join("\n");
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: md }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");
    await user.click(screen.getByText("grill"));

    await waitFor(() => expect(document.querySelector(".modal-body h1")).toBeInTheDocument());
    expect(document.querySelector(".modal-body h1")?.textContent).toBe("Title");
    expect(document.querySelector(".modal-body ul")).toBeTruthy();
    expect(document.querySelector(".modal-body table")).toBeTruthy();
    // remark-gfm task list → checkbox inputs, not literal "[ ]" text
    expect(document.querySelector('.modal-body input[type="checkbox"]')).toBeTruthy();
    // not raw markdown source
    expect(document.querySelector(".modal-body")?.textContent).not.toContain("# Title");
  });

  it("closes on Escape, overlay click, and the close control", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: "x" }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");

    const overlay = () => document.querySelector(".overlay");
    const open = async () => {
      await user.click(screen.getByText("grill"));
      await waitFor(() => expect(overlay()?.className).toContain("open"));
    };

    await open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(overlay()?.className).not.toContain("open");

    await open();
    await user.click(overlay() as HTMLElement);
    expect(overlay()?.className).not.toContain("open");

    await open();
    await user.click(screen.getByText("×"));
    expect(overlay()?.className).not.toContain("open");
  });
});
