import { describe, expect, it } from "vitest";
import { unreadBadgeLabel } from "./bell";

describe("the bell's unread badge", () => {
  it("shows nothing when nothing is unread", () => {
    expect(unreadBadgeLabel(0)).toBeNull();
  });

  it("shows the count up to nine", () => {
    expect(unreadBadgeLabel(1)).toBe("1");
    expect(unreadBadgeLabel(9)).toBe("9");
  });

  it('shows "9+" above nine', () => {
    expect(unreadBadgeLabel(10)).toBe("9+");
    expect(unreadBadgeLabel(42)).toBe("9+");
  });
});
