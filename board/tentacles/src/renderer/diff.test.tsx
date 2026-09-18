import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeChange, makeStatus, mockApi } from "./test-fixtures";

function applyingChange() {
  return makeChange({
    change: "applying-demo",
    repoPath: "/Code/repo-a",
    applying: true,
    planningComplete: true,
    apply: { source: "commits", total: 3, done: null, commits: 2, file: null },
  });
}

const diffModel = {
  ok: true as const,
  files: [
    {
      path: "file.txt",
      status: "modified" as const,
      hunks: [{ lines: [{ kind: "add" as const, text: "new" }] }],
    },
  ],
};

describe("apply-node git button opens the diff modal", () => {
  it("requests the branch diff for the change's repo and opens the modal", async () => {
    const api = mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue(diffModel),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("applying-demo");

    await user.click(screen.getByTitle("View branch diff"));

    expect(api.getDiff).toHaveBeenCalledWith("/Code/repo-a");
    await waitFor(() => expect(document.querySelector(".diff-overlay")?.className).toContain("open"));
  });
});

describe("diff modal renders additions green and removals red", () => {
  it("classifies added and removed lines and renders line text as text, not DOM", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue({
        ok: true,
        files: [
          {
            path: "file.txt",
            status: "modified",
            hunks: [
              {
                lines: [
                  { kind: "context", text: "unchanged" },
                  { kind: "del", text: "old line" },
                  { kind: "add", text: evil },
                ],
              },
            ],
          },
        ],
      }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("applying-demo");
    await user.click(screen.getByTitle("View branch diff"));

    const add = await waitFor(() => {
      const el = document.querySelector(".diff-line.add");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(document.querySelector(".diff-line.del")).not.toBeNull();
    expect(document.querySelector(".diff-line.context")).not.toBeNull();

    // XSS guard: the malicious line is text, no <img> element is created.
    expect(add.textContent).toContain(evil);
    expect(document.querySelector(".diff-body img")).toBeNull();
  });
});

describe("diff refreshes live only while the modal is open", () => {
  afterEach(() => vi.useRealTimers());

  it("re-requests the diff on the refresh tick while open, and stops once closed", async () => {
    vi.useFakeTimers();
    const api = mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue(diffModel),
    });

    render(<App />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    fireEvent.click(screen.getByTitle("View branch diff"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getDiff).toHaveBeenCalledTimes(1); // initial fetch on open

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.getDiff).toHaveBeenCalledTimes(2); // re-requested on the tick while open

    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.getDiff).toHaveBeenCalledTimes(2); // no further requests once closed
  });
});
