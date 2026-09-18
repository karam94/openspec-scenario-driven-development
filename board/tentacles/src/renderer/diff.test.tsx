import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
