import { describe, it, expect, vi } from "vitest";
import { makeNotifier, makeNativeNotify } from "./wiring";
import type { BoardNotification, NotificationSetting } from "./core";
import type { Change, Phase, PhaseId } from "../shared/ipc-contract";

function phase(id: PhaseId, done: boolean): Phase {
  return { id, applicable: true, done, files: [], fileExists: false };
}

// A change whose grill phase is (or isn't) complete — the notifier seeds on the
// first observe and fires on the transition to done on the second.
function change(grillDone: boolean): Change {
  return {
    change: "c",
    repo: "repo-a",
    repoPath: "/Code/repo-a",
    schema: "atdd-driven",
    type: "feature",
    phases: [
      phase("grill", grillDone),
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
  };
}

type Shown = { n: BoardNotification; opts: { silent: boolean } };

describe("makeNotifier — notification preference gating", () => {
  it("fires no native notification when notifications are muted", () => {
    const shown: Shown[] = [];
    const notifier = makeNotifier((n, opts) => shown.push({ n, opts }), () => "muted");
    notifier.observe([change(false)]); // seed
    notifier.observe([change(true)]); // grill completes → would fire, but muted
    expect(shown).toHaveLength(0);
  });

  it("fires a silent native notification when only sounds are muted", () => {
    const shown: Shown[] = [];
    const notifier = makeNotifier((n, opts) => shown.push({ n, opts }), () => "silent");
    notifier.observe([change(false)]);
    notifier.observe([change(true)]);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.opts).toEqual({ silent: true });
  });

  it("fires an audible native notification when enabled (the default)", () => {
    const shown: Shown[] = [];
    const notifier = makeNotifier((n, opts) => shown.push({ n, opts }));
    notifier.observe([change(false)]);
    notifier.observe([change(true)]);
    expect(shown).toHaveLength(1);
    expect(shown[0]?.opts).toEqual({ silent: false });
  });

  it("advances state while muted so re-enabling does not replay missed edges", () => {
    const shown: Shown[] = [];
    let setting: NotificationSetting = "muted";
    const notifier = makeNotifier((n, opts) => shown.push({ n, opts }), () => setting);
    notifier.observe([change(false)]); // seed
    notifier.observe([change(true)]); // grill completes while muted → nothing
    setting = "enabled";
    notifier.observe([change(true)]); // no NEW edge → still nothing
    expect(shown).toHaveLength(0);
  });
});

describe("makeNativeNotify — bundled sound replaces the OS chime", () => {
  function fakeCtor() {
    const ctorCalls: unknown[] = [];
    const show = vi.fn();
    class FakeNotification {
      constructor(opts: unknown) {
        ctorCalls.push(opts);
      }
      show = show;
    }
    return { ctorCalls, show, Ctor: FakeNotification as unknown as typeof import("electron").Notification };
  }

  const n: BoardNotification = { repo: "r", change: "c", kind: "phase", phase: "grill", title: "T", body: "B" };

  it("shows a silent OS banner and plays the app sound when the banner is audible", () => {
    const { ctorCalls, show, Ctor } = fakeCtor();
    const playSound = vi.fn();
    const nativeNotify = makeNativeNotify(Ctor, playSound);

    nativeNotify(n, { silent: false });

    expect(ctorCalls[0]).toEqual({ title: "T", body: "B", silent: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledTimes(1);
  });

  it("shows a silent OS banner and plays no sound when the banner is silent", () => {
    const { ctorCalls, show, Ctor } = fakeCtor();
    const playSound = vi.fn();
    const nativeNotify = makeNativeNotify(Ctor, playSound);

    nativeNotify(n, { silent: true });

    expect(ctorCalls[0]).toEqual({ title: "T", body: "B", silent: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(playSound).not.toHaveBeenCalled();
  });
});
