import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";
import { makeChange, makeStatus, mockApi, phase } from "./test-fixtures";

describe("the renderer renders the board state", () => {
  it("renders changes grouped by repo with correct ordering and badges", async () => {
    const incomplete = makeChange({ change: "a-incomplete", repo: "repo-a", repoPath: "/Code/repo-a", type: "feature", complete: false });
    const complete = makeChange({ change: "z-complete", repo: "repo-a", repoPath: "/Code/repo-a", type: "refactor", complete: true, review: "passed" });
    const other = makeChange({ change: "b-other", repo: "repo-b", repoPath: "/Code/repo-b" });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([complete, incomplete, other], 2)) });

    const { container } = render(<App />);
    await screen.findByText("a-incomplete");

    // ordering: repo-a before repo-b; within repo-a incomplete before complete
    const names = [...container.querySelectorAll(".cname")].map((e) => e.textContent);
    expect(names).toEqual(["a-incomplete", "z-complete", "b-other"]);

    // repo summaries
    expect(screen.getByText("2 change(s) · 1 complete")).toBeInTheDocument();
    expect(screen.getByText("1 change(s) · 0 complete")).toBeInTheDocument();

    // badges
    expect(screen.getAllByText("FEATURE")).toHaveLength(2);
    expect(screen.getByText("REFACTOR")).toBeInTheDocument();
    expect(screen.getByText("COMPLETE")).toBeInTheDocument();
  });

  it("renders each phase's state in the chain", async () => {
    const c = makeChange({
      change: "phases-demo",
      phases: [
        phase("grill", { done: true, files: ["/g.md"] }),
        phase("proposal", { inProgress: true }),
        phase("specs", { applicable: false }),
        phase("design"),
      ],
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });

    render(<App />);
    await screen.findByText("phases-demo");

    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    expect(screen.getByText("✓ done")).toBeInTheDocument();

    // the done phase with a file is clickable
    const grillNode = screen.getByText("grill").closest(".node");
    expect(grillNode?.className).toContain("clickable");
  });

  it("shows apply progress for the tasks.md source", async () => {
    const c = makeChange({
      change: "tasks-apply",
      planningComplete: true,
      applying: true,
      apply: { source: "tasks.md", total: 4, done: 2, file: "/t.md" },
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });

    const { container } = render(<App />);
    await screen.findByText("tasks-apply");

    expect(screen.getByText("2 / 4 tasks")).toBeInTheDocument();
    const bar = container.querySelector(".bar > i") as HTMLElement | null;
    expect(bar?.style.width).toBe("50%");
  });

  it("shows apply progress for the commits source with no task bar", async () => {
    const c = makeChange({
      change: "commits-apply",
      planningComplete: true,
      applying: true,
      apply: { source: "commits", total: 3, done: null, commits: 5, file: "/t.md" },
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });

    const { container } = render(<App />);
    await screen.findByText("commits-apply");

    expect(screen.getByText("5 commit(s) · tasks.md not ticked")).toBeInTheDocument();
    expect(container.querySelector(".bar")).toBeNull();
  });

  it("renders the review and done nodes reflecting review and PR state", async () => {
    const merged = makeChange({
      change: "merged-change",
      complete: true,
      review: "passed",
      planningComplete: true,
      pr: { url: "https://github.com/o/r/pull/9", state: "MERGED", reviewDecision: "APPROVED", isDraft: false },
    });
    const noPr = makeChange({ change: "nopr-change", repo: "repo-a", repoPath: "/Code/repo-a" });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([merged, noPr])) });

    render(<App />);
    await screen.findByText("merged-change");

    // approved appears only on the review node (once), not duplicated on done
    expect(screen.getAllByText("✓ approved")).toHaveLength(1);

    const prLink = screen.getByRole("link");
    expect(prLink).toHaveAttribute("href", "https://github.com/o/r/pull/9");
    expect(within(prLink).getByText("PR ↗ ✓ merged")).toBeInTheDocument();

    // a change with no PR shows a "no PR" done node
    expect(screen.getByText("· no PR")).toBeInTheDocument();
  });
});
