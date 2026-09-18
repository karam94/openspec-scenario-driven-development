import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import App from "./App";
import { makeChange, makeStatus, mockApi, phase } from "./test-fixtures";

describe("the renderer renders the board state", () => {
  it("renders changes grouped by repo with correct ordering and badges", async () => {
    const incomplete = makeChange({ change: "a-incomplete", repo: "repo-a", repoPath: "/Code/repo-a", repositoryId: "/Code/repo-a/.git", repositoryName: "repo-a", type: "feature", complete: false });
    const complete = makeChange({ change: "z-complete", repo: "repo-a", repoPath: "/Code/repo-a", repositoryId: "/Code/repo-a/.git", repositoryName: "repo-a", type: "refactor", complete: true, review: "passed" });
    const other = makeChange({ change: "b-other", repo: "repo-b", repoPath: "/Code/repo-b", repositoryId: "/Code/repo-b/.git", repositoryName: "repo-b" });
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

  it("shows a branch chip per card only when worktrees are grouped (nested)", async () => {
    const featA = makeChange({
      change: "feat-a-change", repo: "wings-core-a", repoPath: "/Code/wings-core-a",
      repositoryId: "/Code/wings-core/.git", repositoryName: "wings-core", branch: "feat-a",
    });
    const featB = makeChange({
      change: "feat-b-change", repo: "wings-core-b", repoPath: "/Code/wings-core-b",
      repositoryId: "/Code/wings-core/.git", repositoryName: "wings-core", branch: "feat-b",
    });
    const solo = makeChange({
      change: "solo-change", repo: "lonely", repoPath: "/Code/lonely",
      repositoryId: "/Code/lonely/.git", repositoryName: "lonely", branch: "feat-solo",
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([featA, featB, solo], 2)) });

    const { container } = render(<App />);
    await screen.findByText("feat-a-change");

    // both concurrent worktrees show their branch chip
    const chips = [...container.querySelectorAll(".branch-chip")].map((e) => e.textContent);
    expect(chips).toContain("feat-a");
    expect(chips).toContain("feat-b");

    // the lone worktree shows no branch chip (renders as today)
    const soloCard = screen.getByText("solo-change").closest(".change");
    expect(soloCard?.querySelector(".branch-chip")).toBeNull();
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

  it("shows apply progress on the apply node without a redundant progress bar", async () => {
    const c = makeChange({
      change: "tasks-apply",
      planningComplete: true,
      applying: true,
      apply: { source: "tasks.md", total: 4, done: 2, file: "/t.md" },
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });

    const { container } = render(<App />);
    await screen.findByText("tasks-apply");

    // the apply node still carries the x/y count
    expect(screen.getByText("2/4")).toBeInTheDocument();
    // but the redundant horizontal progress bar is gone
    expect(container.querySelector(".apply")).toBeNull();
    expect(container.querySelector(".bar")).toBeNull();
    expect(screen.queryByText("apply progress")).toBeNull();
  });

  it("shows commit-source apply on the apply node without a progress bar", async () => {
    const c = makeChange({
      change: "commits-apply",
      planningComplete: true,
      applying: true,
      apply: { source: "commits", total: 3, done: null, commits: 5, file: "/t.md" },
    });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });

    const { container } = render(<App />);
    await screen.findByText("commits-apply");

    // the apply node carries the commit count
    expect(screen.getByText("5 commit(s)")).toBeInTheDocument();
    // no bar and no "tasks.md not ticked" footer any more
    expect(container.querySelector(".apply")).toBeNull();
    expect(screen.queryByText(/tasks\.md not ticked/)).toBeNull();
  });

  it("reveals the worktree folder in the OS file browser when View in Finder is clicked", async () => {
    const openPath = vi.fn().mockResolvedValue({ ok: true });
    const c = makeChange({ change: "finder-change", repoPath: "/Code/wings-core-a" });
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])), openPath });

    render(<App />);
    await screen.findByText("finder-change");

    const card = screen.getByText("finder-change").closest(".change") as HTMLElement;
    const btn = within(card).getByRole("button", { name: /view in finder/i });
    btn.click();

    expect(openPath).toHaveBeenCalledWith("/Code/wings-core-a");
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
