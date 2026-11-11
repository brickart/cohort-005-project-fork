import { describe, expect, it } from "vitest";
import { Bell } from "lucide-react";
import { NOTIFICATION_KEYS, NOTIFICATIONS } from "./catalogue";
import { feedIcon, FEED_ICONS } from "./feed-icons";

describe("feed icons", () => {
  it.each(NOTIFICATION_KEYS)("has an icon for %s", (key) => {
    expect(FEED_ICONS).toHaveProperty(NOTIFICATIONS[key].icon);
  });

  it("falls back to the bell for an icon it does not know", () => {
    expect(feedIcon("no-such-icon")).toBe(Bell);
  });
});
