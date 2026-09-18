import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import App from "./App";
import { mockApi } from "./test-fixtures";

describe("completion notification sound", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rewinds and plays the bundled sound when a sound push arrives, and unsubscribes on unmount", () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const audioInstance = { currentTime: 99, play };
    const AudioMock = vi.fn(() => audioInstance);
    vi.stubGlobal("Audio", AudioMock);

    let handler: (() => void) | undefined;
    const unsubscribe = vi.fn();
    const api = mockApi({
      onNotificationSound: vi.fn((cb: () => void) => {
        handler = cb;
        return unsubscribe;
      }),
    });

    const { unmount } = render(<App />);

    expect(AudioMock).toHaveBeenCalledTimes(1);
    expect(api.onNotificationSound).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();

    handler?.();
    expect(audioInstance.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
