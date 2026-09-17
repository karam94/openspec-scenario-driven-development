import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import App from "./App";
import { makeChange, makeStatus, mockApi } from "./test-fixtures";

describe("auto-refresh and empty/error states", () => {
  afterEach(() => vi.useRealTimers());

  it("refreshes on the 15-second interval", async () => {
    vi.useFakeTimers();
    const api = mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([makeChange()])) });

    render(<App />);
    expect(api.getStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it("shows the empty-state message", async () => {
    mockApi({ getStatus: vi.fn().mockResolvedValue(makeStatus([], 3)) });

    render(<App />);

    expect(await screen.findByText(/No active OpenSpec changes found across 3 repo/)).toBeInTheDocument();
  });

  it("shows the error message and no change groups", async () => {
    mockApi({ getStatus: vi.fn().mockResolvedValue({ error: "boom", changes: [] }) });

    render(<App />);

    expect(await screen.findByText("Error: boom")).toBeInTheDocument();
    expect(screen.queryByText("Archive")).toBeNull();
  });

  it("marks the indicator stale and shows a retry status when the bridge rejects", async () => {
    mockApi({ getStatus: vi.fn().mockRejectedValue(new Error("bridge down")) });

    render(<App />);

    expect(await screen.findByText("refresh failed — retrying")).toBeInTheDocument();
    expect(document.querySelector(".dot")?.className).toContain("stale");
  });
});
