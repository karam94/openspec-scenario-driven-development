import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeStatus, mockApi } from "./test-fixtures";

async function openSetupTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Settings"));
  await waitFor(() => expect(screen.getByRole("tab", { name: "General" })).toBeInTheDocument());
  await user.click(screen.getByRole("tab", { name: "Setup" }));
}

describe("settings — Setup tab: target selection", () => {
  it("offers Claude, Kiro, and Kiro Crew as independent checkboxes", async () => {
    mockApi({ getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: [] }) });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    const claude = screen.getByRole("checkbox", { name: "Claude" }) as HTMLInputElement;
    const kiro = screen.getByRole("checkbox", { name: "Kiro" }) as HTMLInputElement;
    const crew = screen.getByRole("checkbox", { name: "Kiro Crew" }) as HTMLInputElement;
    expect(claude.checked).toBe(false);
    expect(kiro.checked).toBe(false);
    expect(crew.checked).toBe(false);

    await user.click(kiro);
    expect(kiro.checked).toBe(true);
    expect(claude.checked).toBe(false);
    expect(crew.checked).toBe(false);
  });

  it("persists selected targets on save", async () => {
    const setSettings = vi.fn().mockResolvedValue({ ok: true, root: "/Code", targets: ["kiro", "kiro-crew"] });
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([])),
      getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: [] }),
      setSettings,
    });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    await user.click(screen.getByRole("checkbox", { name: "Kiro" }));
    await user.click(screen.getByRole("checkbox", { name: "Kiro Crew" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setSettings).toHaveBeenCalledWith({ root: "/Code", notifications: "enabled", targets: ["kiro", "kiro-crew"] });
  });

  it("rehydrates persisted targets into the checkboxes on open", async () => {
    mockApi({ getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: ["kiro", "kiro-crew"] }) });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    await waitFor(() =>
      expect((screen.getByRole("checkbox", { name: "Kiro" }) as HTMLInputElement).checked).toBe(true)
    );
    expect((screen.getByRole("checkbox", { name: "Kiro Crew" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Claude" }) as HTMLInputElement).checked).toBe(false);
  });

  it("shows no pre-enabled targets and no error when settings carry no targets", async () => {
    mockApi({ getSettings: vi.fn().mockResolvedValue({ root: "/Code" } as never) });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    expect((screen.getByRole("checkbox", { name: "Claude" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Kiro" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("checkbox", { name: "Kiro Crew" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/error/i)).toBeNull();
  });
});

describe("settings — Setup tab: doctor", () => {
  it("does not auto-run the doctor on opening the Setup tab; runs it on demand", async () => {
    const doctor = vi.fn().mockResolvedValue({
      checks: [{ id: "kiro-skills", label: "Kiro skills present", ok: true }],
    });
    mockApi({ getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: ["kiro"] }), doctor });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    expect(doctor).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Run doctor" }));
    await waitFor(() => expect(doctor).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Kiro skills present")).toBeInTheDocument();
  });

  it("offers exactly one consolidated repair for a failed run and re-runs install for the affected target", async () => {
    const doctor = vi.fn().mockResolvedValue({
      checks: [
        { id: "kiro-skills", label: "Kiro skills present", ok: true },
        { id: "kiro-prompts", label: "opsx-* prompts present", ok: false, reason: "no opsx-* prompts" },
      ],
    });
    const install = vi.fn().mockResolvedValue({ steps: [] });
    mockApi({ getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: ["kiro"] }), doctor, install });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    await user.click(screen.getByRole("button", { name: "Run doctor" }));
    const repair = await screen.findAllByRole("button", { name: "Fix detected issues" });
    expect(repair).toHaveLength(1);

    await user.click(repair[0]!);
    await waitFor(() => expect(install).toHaveBeenCalledWith({ targets: ["kiro"] }));
  });

  it("repairs only the target whose checks failed, not an unaffected selected target", async () => {
    // Claude + Kiro selected; only the Claude row fails → repair must target Claude alone.
    const doctor = vi.fn().mockResolvedValue({
      checks: [
        { id: "claude-skills", label: "Claude skills present", ok: false, reason: "missing" },
        { id: "kiro-skills", label: "Kiro skills present", ok: true },
        { id: "openspec-cli", label: "OpenSpec CLI present", ok: true },
      ],
    });
    const install = vi.fn().mockResolvedValue({ steps: [] });
    mockApi({
      getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: ["claude", "kiro"] }),
      doctor,
      install,
    });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    await user.click(screen.getByRole("button", { name: "Run doctor" }));
    const repair = await screen.findByRole("button", { name: "Fix detected issues" });
    await user.click(repair);

    await waitFor(() => expect(install).toHaveBeenCalledWith({ targets: ["claude"] }));
  });

  it("repairs kiro-crew (not kiro) when an inherited kiro-* check fails in a Kiro-Crew-only run", async () => {
    // Only Kiro Crew selected; the inherited kiro-prompts check fails. Repair must
    // re-run the kiro-crew install (host-wiring + restart), not the bare kiro target.
    const doctor = vi.fn().mockResolvedValue({
      checks: [
        { id: "kiro-skills", label: "Kiro skills present", ok: true },
        { id: "kiro-prompts", label: "opsx-* prompts present", ok: false, reason: "missing" },
        { id: "kirocrew-identity", label: "Kiro Crew strict identity routed", ok: true },
      ],
    });
    const install = vi.fn().mockResolvedValue({ steps: [] });
    mockApi({
      getSettings: vi.fn().mockResolvedValue({ root: "/Code", targets: ["kiro-crew"] }),
      doctor,
      install,
    });
    const user = userEvent.setup();
    render(<App />);
    await openSetupTab(user);

    await user.click(screen.getByRole("button", { name: "Run doctor" }));
    const repair = await screen.findByRole("button", { name: "Fix detected issues" });
    await user.click(repair);

    await waitFor(() => expect(install).toHaveBeenCalledWith({ targets: ["kiro-crew"] }));
  });
});
