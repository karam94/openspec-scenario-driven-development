import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { makeStatus, mockApi } from "./test-fixtures";

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTitle("Settings"));
  await waitFor(() => expect(screen.getByLabelText("Scan root directory")).toBeInTheDocument());
}

describe("settings panel", () => {
  it("saves a new root and triggers a re-scan (refresh)", async () => {
    const getStatus = vi.fn().mockResolvedValue(makeStatus([]));
    const setSettings = vi.fn().mockResolvedValue({ ok: true, root: "/new/root", notifications: "enabled" });
    mockApi({
      getStatus,
      getSettings: vi.fn().mockResolvedValue({ root: "/old/root", notifications: "enabled" }),
      setSettings,
    });
    const user = userEvent.setup();

    render(<App />);
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(1));
    await openSettings(user);

    const input = screen.getByLabelText("Scan root directory") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("/old/root"));
    await user.clear(input);
    await user.type(input, "/new/root");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setSettings).toHaveBeenCalledWith({ root: "/new/root", notifications: "enabled", targets: [] });
    // a successful save closes the panel and re-fetches the board
    await waitFor(() => expect(screen.queryByLabelText("Scan root directory")).toBeNull());
    await waitFor(() => expect(getStatus.mock.calls.length).toBeGreaterThan(1));
  });

  it("shows an inline error when the root is rejected and does not close", async () => {
    mockApi({
      getSettings: vi.fn().mockResolvedValue({ root: "/old/root" }),
      setSettings: vi.fn().mockResolvedValue({ ok: false, error: "That directory does not exist." }),
    });
    const user = userEvent.setup();

    render(<App />);
    await openSettings(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That directory does not exist.")).toBeInTheDocument();
    expect(screen.getByLabelText("Scan root directory")).toBeInTheDocument();
  });

  it("fills the input with a directory chosen from the native picker", async () => {
    const chooseDirectory = vi.fn().mockResolvedValue({ path: "/picked/root" });
    mockApi({
      getSettings: vi.fn().mockResolvedValue({ root: "/old/root" }),
      chooseDirectory,
    });
    const user = userEvent.setup();

    render(<App />);
    await openSettings(user);

    const input = screen.getByLabelText("Scan root directory") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("/old/root"));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    expect(chooseDirectory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input.value).toBe("/picked/root"));
  });

  it("leaves the input unchanged when the picker is cancelled", async () => {
    const chooseDirectory = vi.fn().mockResolvedValue({ path: null });
    mockApi({
      getSettings: vi.fn().mockResolvedValue({ root: "/old/root" }),
      chooseDirectory,
    });
    const user = userEvent.setup();

    render(<App />);
    await openSettings(user);

    const input = screen.getByLabelText("Scan root directory") as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("/old/root"));
    await user.click(screen.getByRole("button", { name: "Browse…" }));

    expect(chooseDirectory).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(input.value).toBe("/old/root"));
  });

  it("loads the current notification preference and saves the selected one", async () => {
    const setSettings = vi.fn().mockResolvedValue({ ok: true, root: "/root", notifications: "muted" });
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([])),
      getSettings: vi.fn().mockResolvedValue({ root: "/root", notifications: "silent" }),
      setSettings,
    });
    const user = userEvent.setup();

    render(<App />);
    await openSettings(user);

    // the persisted preference is reflected in the control
    await waitFor(() => expect(screen.getByLabelText("Mute notification sounds only")).toBeChecked());

    // switch to muting notifications entirely and save
    await user.click(screen.getByLabelText("Mute notifications"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setSettings).toHaveBeenCalledWith({ root: "/root", notifications: "muted", targets: [] });
  });

  it("defaults the notification control to on when the setting is absent", async () => {
    mockApi({
      getStatus: vi.fn().mockResolvedValue(makeStatus([])),
      getSettings: vi.fn().mockResolvedValue({ root: "/root" }),
      setSettings: vi.fn().mockResolvedValue({ ok: true, root: "/root", notifications: "enabled" }),
    });
    const user = userEvent.setup();

    render(<App />);
    await openSettings(user);

    await waitFor(() => expect(screen.getByLabelText("Notifications on")).toBeChecked());
  });
});
