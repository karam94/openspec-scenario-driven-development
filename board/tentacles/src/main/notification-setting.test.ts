import { describe, it, expect } from "vitest";
import { parseSettings, parseNotificationSetting, resolveNotifications } from "./core";

describe("notification setting — parse / normalise / resolve", () => {
  it("parses the notifications field from settings.json alongside root", () => {
    expect(parseSettings('{"root":"/a","notifications":"silent"}')).toEqual({ root: "/a", notifications: "silent" });
    expect(parseSettings('{"root":"/a","notifications":"muted"}')).toEqual({ root: "/a", notifications: "muted" });
    expect(parseSettings('{"root":"/a","notifications":"enabled"}')).toEqual({ root: "/a", notifications: "enabled" });
  });

  it("parses a notification preference even when no root is set", () => {
    expect(parseSettings('{"notifications":"muted"}')).toEqual({ notifications: "muted" });
  });

  it("omits the notifications field entirely for an unknown or non-string value", () => {
    expect(parseSettings('{"root":"/a","notifications":"bogus"}')).toEqual({ root: "/a" });
    expect(parseSettings('{"root":"/a","notifications":123}')).toEqual({ root: "/a" });
  });

  it("normalises any value to a valid tri-state, defaulting to enabled", () => {
    expect(parseNotificationSetting("silent")).toBe("silent");
    expect(parseNotificationSetting("muted")).toBe("muted");
    expect(parseNotificationSetting("enabled")).toBe("enabled");
    expect(parseNotificationSetting(undefined)).toBe("enabled");
    expect(parseNotificationSetting("nonsense")).toBe("enabled");
  });

  it("resolves the effective preference from persisted settings, defaulting to enabled", () => {
    expect(resolveNotifications({ notifications: "muted" })).toBe("muted");
    expect(resolveNotifications({ notifications: "silent" })).toBe("silent");
    expect(resolveNotifications({ root: "/a" })).toBe("enabled");
    expect(resolveNotifications({})).toBe("enabled");
  });
});
