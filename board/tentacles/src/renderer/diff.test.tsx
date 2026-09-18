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

describe("apply-node git button is a ± affordance below the node label", () => {
  it("renders the button glyph as ± and places it after the phase/state text", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue(diffModel),
    });

    render(<App />);
    await screen.findByText("applying-demo");

    const btn = screen.getByTitle("View branch diff");
    expect(btn.textContent).toBe("±");

    // The label (phase/state) comes first in the DOM; the button follows it.
    const node = btn.closest(".node") as HTMLElement;
    const state = node.querySelector(".state") as HTMLElement;
    expect(state.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("diff modal lists files in a sidebar and shows one at a time", () => {
  const twoFiles = {
    ok: true as const,
    files: [
      { path: "a.txt", status: "modified" as const, hunks: [{ lines: [{ kind: "add" as const, text: "AAA" }] }] },
      { path: "b.txt", status: "modified" as const, hunks: [{ lines: [{ kind: "add" as const, text: "BBB" }] }] },
    ],
  };

  it("lists every changed file and switches the shown file on click", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue(twoFiles),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("applying-demo");
    await user.click(screen.getByTitle("View branch diff"));

    // Both files are listed in the sidebar.
    expect(await screen.findByRole("button", { name: /a\.txt/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /b\.txt/ })).toBeTruthy();

    // Only the first file's content shows initially.
    expect(screen.getByText("AAA")).toBeTruthy();
    expect(screen.queryByText("BBB")).toBeNull();

    // Clicking the second file switches the shown content.
    await user.click(screen.getByRole("button", { name: /b\.txt/ }));
    expect(screen.getByText("BBB")).toBeTruthy();
    expect(screen.queryByText("AAA")).toBeNull();
  });

  it("clamps to a valid file when a live refresh drops the selected file", async () => {
    vi.useFakeTimers();
    try {
      const shrinking = vi
        .fn()
        .mockResolvedValueOnce(twoFiles)
        .mockResolvedValue({
          ok: true as const,
          files: [
            { path: "a.txt", status: "modified" as const, hunks: [{ lines: [{ kind: "add" as const, text: "AAA" }] }] },
          ],
        });
      mockApi({
        getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
        getDiff: shrinking,
      });

      render(<App />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fireEvent.click(screen.getByTitle("View branch diff"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // Select the second file, then the next poll returns a list without it.
      fireEvent.click(screen.getByRole("button", { name: /b\.txt/ }));
      expect(screen.getByText("BBB")).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000);
      });

      // The remaining file is shown; the stale selection does not leak or crash.
      expect(screen.getByText("AAA")).toBeTruthy();
      expect(screen.queryByText("BBB")).toBeNull();
      expect(screen.queryByRole("button", { name: /b\.txt/ })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("diff modal can expand a file to its full contents with changes inline", () => {
  const compact = {
    ok: true as const,
    files: [
      {
        path: "big.txt",
        status: "modified" as const,
        hunks: [{ lines: [{ kind: "context" as const, text: "ctx-near" }, { kind: "add" as const, text: "changed" }] }],
      },
    ],
  };
  const full = {
    ok: true as const,
    files: [
      {
        path: "big.txt",
        status: "modified" as const,
        hunks: [
          {
            lines: [
              { kind: "context" as const, text: "ctx-far" },
              { kind: "context" as const, text: "ctx-near" },
              { kind: "add" as const, text: "changed" },
            ],
          },
        ],
      },
    ],
  };

  it("fetches and shows the whole file on expand and returns to the compact hunks on collapse", async () => {
    const api = mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([applyingChange()])),
      getDiff: vi.fn().mockResolvedValue(compact),
      getFileDiff: vi.fn().mockResolvedValue(full),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("applying-demo");
    await user.click(screen.getByTitle("View branch diff"));

    // Compact view: the far context line is not shown.
    expect(await screen.findByText("changed")).toBeTruthy();
    expect(screen.queryByText("ctx-far")).toBeNull();

    // Expand → the full file (including the far context) is fetched and shown.
    await user.click(screen.getByRole("button", { name: /expand full file/i }));
    expect(api.getFileDiff).toHaveBeenCalledWith("/Code/repo-a", "big.txt");
    expect(await screen.findByText("ctx-far")).toBeTruthy();

    // Collapse → back to the compact hunks.
    await user.click(screen.getByRole("button", { name: /collapse/i }));
    expect(screen.queryByText("ctx-far")).toBeNull();
    expect(screen.getByText("changed")).toBeTruthy();
  });
});
