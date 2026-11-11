import { describe, expect, it } from "vitest";
import { notificationServiceChoice } from "./runtime.server";

describe("which NotificationService Cadence runs", () => {
  it("is local when there is no Knock secret key", () => {
    expect(notificationServiceChoice({})).toEqual({ kind: "local" });
  });

  it("is Knock when the secret key and feed channel are set", () => {
    expect(
      notificationServiceChoice({
        KNOCK_API_SECRET_KEY: "sk_test_123",
        KNOCK_FEED_CHANNEL_ID: "feed-uuid",
      })
    ).toEqual({
      kind: "knock",
      apiKey: "sk_test_123",
      feedChannelId: "feed-uuid",
    });
  });

  it("is always local under vitest, even with Knock credentials", () => {
    expect(
      notificationServiceChoice({
        VITEST: "true",
        KNOCK_API_SECRET_KEY: "sk_test_123",
        KNOCK_FEED_CHANNEL_ID: "feed-uuid",
      })
    ).toEqual({ kind: "local" });
  });

  it("refuses a Knock secret key without a feed channel", () => {
    expect(() =>
      notificationServiceChoice({ KNOCK_API_SECRET_KEY: "sk_test_123" })
    ).toThrow(/KNOCK_FEED_CHANNEL_ID/);
  });
});
