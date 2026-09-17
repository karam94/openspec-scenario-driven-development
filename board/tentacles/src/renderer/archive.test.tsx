import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
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
});
