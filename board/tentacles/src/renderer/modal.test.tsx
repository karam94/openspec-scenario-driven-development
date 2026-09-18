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

  it("renders links as external-only anchors so they cannot navigate the board window", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: "See [the docs](https://example.com/x)." }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");
    await user.click(screen.getByText("grill"));

    const link = await waitFor(() => {
      const a = document.querySelector(".modal-body a") as HTMLAnchorElement | null;
      expect(a).not.toBeNull();
      return a as HTMLAnchorElement;
    });
    // target=_blank routes the click through the main window-open handler (external,
    // https-only, child-window denied) instead of navigating the privileged window.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("href")).toBe("https://example.com/x");
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

function changeWithSpecs() {
  return makeChange({
    change: "ship-export",
    phases: [
      phase("grill"),
      phase("proposal"),
      phase("specs", {
        done: true,
        files: [
          "/repo/openspec/changes/ship-export/specs/csv-export/spec.md",
          "/repo/openspec/changes/ship-export/specs/pdf-export/spec.md",
        ],
      }),
      phase("design"),
      phase("tasks"),
    ],
  });
}

const bodyText = () => document.querySelector(".modal-body")?.textContent ?? "";

describe("multi-spec modal tabs", () => {
  it("renders one tab per spec file, showing only the active file's content", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithSpecs()])),
      readFile: vi.fn().mockImplementation((f: string) =>
        Promise.resolve({ ok: true, contents: f.includes("csv") ? "The system exports CSV." : "The system exports PDF." })
      ),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("ship-export");
    await user.click(screen.getByText("specs"));

    const csvTab = await screen.findByRole("tab", { name: "csv-export" });
    const pdfTab = screen.getByRole("tab", { name: "pdf-export" });
    expect(csvTab).toBeInTheDocument();
    expect(pdfTab).toBeInTheDocument();

    await waitFor(() => expect(bodyText()).toContain("The system exports CSV."));
    expect(bodyText()).not.toContain("The system exports PDF.");

    await user.click(pdfTab);
    await waitFor(() => expect(bodyText()).toContain("The system exports PDF."));
    expect(bodyText()).not.toContain("The system exports CSV.");

    await user.click(csvTab);
    await waitFor(() => expect(bodyText()).toContain("The system exports CSV."));
    expect(bodyText()).not.toContain("The system exports PDF.");
  });

  it("shows no tabs for a single-file artifact", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithFile()])),
      readFile: vi.fn().mockResolvedValue({ ok: true, contents: "only one file" }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("file-demo");
    await user.click(screen.getByText("grill"));

    await waitFor(() => expect(bodyText()).toBe("only one file"));
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("resets to the first tab when a different multi-spec artifact is opened", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([changeWithSpecs()])),
      readFile: vi.fn().mockImplementation((f: string) =>
        Promise.resolve({ ok: true, contents: f.includes("csv") ? "CSV body" : "PDF body" })
      ),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("ship-export");
    await user.click(screen.getByText("specs"));

    await user.click(await screen.findByRole("tab", { name: "pdf-export" }));
    await waitFor(() => expect(bodyText()).toContain("PDF body"));

    fireEvent.keyDown(document, { key: "Escape" });
    await user.click(screen.getByText("specs"));

    await waitFor(() => expect(bodyText()).toContain("CSV body"));
    expect(screen.getByRole("tab", { name: "csv-export" })).toHaveAttribute("aria-selected", "true");
  });
});
