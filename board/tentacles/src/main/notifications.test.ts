import { describe, it, expect } from "vitest";
import { computeNotifications, type NotifyState } from "./core";
import type { Change, Phase, PhaseId } from "../shared/ipc-contract";

function phase(id: PhaseId, done: boolean): Phase {
  return { id, applicable: true, done, files: [] };
}

function makeChange(over: Partial<Change> = {}): Change {
  return {
    change: "c",
    repo: "repo-a",
    repoPath: "/Code/repo-a",
    schema: "atdd-driven",
    type: "feature",
    phases: [
      phase("grill", false),
      phase("proposal", false),
      phase("specs", false),
      phase("design", false),
      phase("tasks", false),
    ],
    apply: { source: "tasks.md", total: 0, done: 0, file: null },
    applyDone: false,
    applying: false,
    review: "none",
    planningComplete: false,
    complete: false,
    pr: null,
    ...over,
  };
}

describe("computeNotifications — edge-triggered completion notifications", () => {
  it("fires exactly one notification for a newly-completed phase and none again while it stays complete", () => {
    const before = makeChange({ phases: [phase("grill", false), phase("proposal", false), phase("specs", false), phase("design", false), phase("tasks", false)] });
    const after = makeChange({ phases: [phase("grill", true), phase("proposal", false), phase("specs", false), phase("design", false), phase("tasks", false)] });

    // seed from the "before" scan
    const seeded = computeNotifications(null, [before]);
    expect(seeded.notifications).toHaveLength(0);

    // grill newly completes → one notification
    const first = computeNotifications(seeded.next, [after]);
    expect(first.notifications).toHaveLength(1);
    expect(first.notifications[0]).toMatchObject({ change: "c", phase: "grill", kind: "phase" });

    // same state again → no re-fire
    const second = computeNotifications(first.next, [after]);
    expect(second.notifications).toHaveLength(0);
  });

  it("suppresses pre-existing completions on the first scan and seeds state", () => {
    const c = makeChange({
      phases: [phase("grill", true), phase("proposal", true), phase("specs", true), phase("design", false), phase("tasks", false)],
    });

    const result = computeNotifications(null, [c]);

    expect(result.notifications).toHaveLength(0);
    // state is seeded so only transitions AFTER this scan notify
    const next: NotifyState = result.next;
    const stable = computeNotifications(next, [c]);
    expect(stable.notifications).toHaveLength(0);
  });

  it("emits the done phase edge and a distinct change-complete edge on completion, exactly", () => {
    const allDone = [
      phase("grill", true),
      phase("proposal", true),
      phase("specs", true),
      phase("design", true),
      phase("tasks", true),
    ];
    // everything already done EXCEPT the whole-change completion
    const before = makeChange({ phases: allDone, applyDone: true, review: "passed", complete: false });
    const after = makeChange({ phases: allDone, applyDone: true, review: "passed", complete: true });

    const seeded = computeNotifications(null, [before]);
    const result = computeNotifications(seeded.next, [after]);

    // exactly two edges: the done phase completing, then the distinct change-complete
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications[0]).toMatchObject({ change: "c", kind: "phase", phase: "done" });
    expect(result.notifications[1]).toMatchObject({ change: "c", kind: "complete" });
  });
});
