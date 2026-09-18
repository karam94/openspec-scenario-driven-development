import { describe, it, expect, vi } from "vitest";
import core, { type Args, type DoctorCheck } from "./core";
import { makeHandlers, type SetupDeps } from "./wiring";
import type { DoctorArgs, Target } from "../shared/ipc-contract";

const HOME = "/Users/tester";

function handlersWith(probe: SetupDeps["probe"]) {
  const args: Args = { repos: [], root: "/x", depth: 1 };
  const setup: SetupDeps = { repoRoot: "/repo", home: HOME, exec: vi.fn(async () => {}), probe };
  return makeHandlers(core, () => args, undefined, undefined, undefined, setup);
}

const doctor = (targets: Target[]): DoctorArgs => ({ targets });

describe("doctor checker (core.planDoctorChecks)", () => {
  it("scopes checks to the selected target only", () => {
    const ids = core.planDoctorChecks(["kiro"], { home: HOME }).map((c) => c.id);
    expect(ids).toContain("kiro-skills");
    expect(ids).toContain("kiro-prompts");
    expect(ids.some((id) => id.startsWith("claude-"))).toBe(false);
    expect(ids).not.toContain("kirocrew-identity");
  });

  it("verifies the full OpenSpec slice: cli, profile, workflows, and schema", () => {
    const checks = core.planDoctorChecks(["kiro"], { home: HOME });
    const ids = checks.map((c) => c.id);
    expect(ids).toContain("openspec-cli");
    expect(ids).toContain("openspec-profile");
    expect(ids).toContain("openspec-workflows");
    expect(ids).toContain("openspec-schema");
    // config-reading checks target the INJECTED home, not process.env.HOME
    const profile = checks.find((c) => c.id === "openspec-profile");
    if (profile?.kind === "openspec-profile") expect(profile.configPath.startsWith(HOME)).toBe(true);
    // the workflows check verifies the FULL canonical set, not just new/continue
    const wf = checks.find((c) => c.id === "openspec-workflows");
    if (wf?.kind === "openspec-workflows") {
      expect(wf.required).toContain("propose");
      expect(wf.required).toContain("apply");
      expect(wf.required).toContain("archive");
    }
  });

  it("verifies strict identity AND session control for Kiro Crew", () => {
    const ids = core.planDoctorChecks(["kiro-crew"], { home: HOME }).map((c) => c.id);
    expect(ids).toContain("kirocrew-identity");
    expect(ids).toContain("kirocrew-session-control");
  });
});

describe("doctor probe parsers (pure)", () => {
  it("missingWorkflows flags a required workflow absent even when new/continue exist", () => {
    expect(core.missingWorkflows(["new", "continue"], core.OPENSPEC_WORKFLOWS)).toContain("propose");
    expect(core.missingWorkflows(core.OPENSPEC_WORKFLOWS, core.OPENSPEC_WORKFLOWS)).toEqual([]);
  });

  it("strictIdentityRouted accepts a routed result and rejects 'not routed'", () => {
    expect(core.strictIdentityRouted("strict identity: ✅ routed")).toBe(true);
    expect(core.strictIdentityRouted("strict identity: not routed")).toBe(false);
    expect(core.strictIdentityRouted("strict identity: ❌ unidentified")).toBe(false);
  });

  it("strictIdentityRouted ignores a 'routed' token on an unrelated row", () => {
    expect(
      core.strictIdentityRouted(
        "strict identity: ❌ unidentified\nkirocrew-core route: ✅ routed"
      )
    ).toBe(false);
    expect(
      core.strictIdentityRouted(
        "kirocrew-core route: ✅ routed\nstrict identity: ✅ routed"
      )
    ).toBe(true);
  });

  it("sessionControlEnabled accepts true and rejects false", () => {
    expect(core.sessionControlEnabled("true")).toBe(true);
    expect(core.sessionControlEnabled("agent.session_control: true")).toBe(true);
    expect(core.sessionControlEnabled("false")).toBe(false);
    expect(core.sessionControlEnabled("agent.session_control: false")).toBe(false);
  });
});

describe("doctor handler", () => {
  it("reports each check pass or fail for the selected target", async () => {
    // skills present, prompts missing
    const probe = vi.fn(async (check: DoctorCheck) => {
      if (check.id === "kiro-prompts") return { ok: false, reason: "no opsx-* prompts" };
      return { ok: true };
    });
    const handlers = handlersWith(probe);

    const res = await handlers.doctor({} as never, doctor(["kiro"]));

    expect(res.checks.find((c) => c.id === "kiro-skills")?.ok).toBe(true);
    const prompts = res.checks.find((c) => c.id === "kiro-prompts");
    expect(prompts?.ok).toBe(false);
    expect(prompts?.reason).toMatch(/opsx/);
    // scoped to Kiro (+ shared OpenSpec) — no Claude-only or Kiro-Crew-only checks
    expect(res.checks.some((c) => c.id.startsWith("claude-"))).toBe(false);
    expect(res.checks.some((c) => c.id === "kirocrew-identity")).toBe(false);
  });

  it("does not abort when a probe rejects — the row fails and remaining checks still report", async () => {
    const probe = vi.fn(async (check: DoctorCheck) => {
      if (check.id === "kiro-skills") throw new Error("probe blew up");
      return { ok: true };
    });
    const handlers = handlersWith(probe);

    const res = await handlers.doctor({} as never, doctor(["kiro"]));

    const skills = res.checks.find((c) => c.id === "kiro-skills");
    expect(skills?.ok).toBe(false);
    expect(skills?.reason).toMatch(/blew up/);
    // remaining checks still reported
    expect(res.checks.find((c) => c.id === "openspec-cli")).toBeTruthy();
    expect(res.checks.find((c) => c.id === "kiro-prompts")).toBeTruthy();
  });
});
