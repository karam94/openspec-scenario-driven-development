import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { ArchiveResult } from "../shared/ipc-contract";
import { makeChange, makeStatus, mockApi } from "./test-fixtures";

describe("archive", () => {
  afterEach(() => vi.restoreAllMocks());

  it("confirmed archive calls the bridge and removes the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const c = makeChange({ change: "arch-me", repoPath: "/Code/repo-a" });
    const api = mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("arch-me");
    await user.click(screen.getByText("Archive"));

    expect(api.archive).toHaveBeenCalledWith({ repoPath: "/Code/repo-a", change: "arch-me" });
    await waitFor(() => expect(screen.queryByText("arch-me")).toBeNull());
  });

  it("cancelled confirmation performs no archive", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const c = makeChange({ change: "keep-me" });
    const api = mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([c])) });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("keep-me");
    await user.click(screen.getByText("Archive"));

    expect(api.archive).not.toHaveBeenCalled();
    expect(screen.getByText("keep-me")).toBeInTheDocument();
  });

  it("a failed archive surfaces the error and keeps the row", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const c = makeChange({ change: "fail-me" });
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([c])),
      archive: vi.fn().mockResolvedValue({ ok: false, error: "boom" }),
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("fail-me");
    await user.click(screen.getByText("Archive"));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(String(alertSpy.mock.calls[0]?.[0])).toContain("boom");
    expect(screen.getByText("fail-me")).toBeInTheDocument();
  });

  it("disables the control in-flight, blocks a duplicate submission, and re-enables on failure", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    let resolveArchive!: (v: ArchiveResult) => void;
    const archive = vi.fn(() => new Promise<ArchiveResult>((r) => (resolveArchive = r)));
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([makeChange({ change: "busy-me" })])), archive });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("busy-me");
    await user.click(screen.getByText("Archive"));

    // in-flight: the control is disabled and relabelled
    const btn = await screen.findByRole("button", { name: "Archiving…" });
    expect(btn).toBeDisabled();
    expect(archive).toHaveBeenCalledTimes(1);

    // a second click while in-flight cannot invoke the bridge again
    fireEvent.click(btn);
    expect(archive).toHaveBeenCalledTimes(1);

    // a failed request re-enables the exact control
    await act(async () => {
      resolveArchive({ ok: false, error: "boom" });
    });
    expect(await screen.findByRole("button", { name: "Archive" })).toBeEnabled();
    expect(alertSpy).toHaveBeenCalled();
  });
});
