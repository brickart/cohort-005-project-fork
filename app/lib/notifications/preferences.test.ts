import { describe, expect, it } from "vitest";
import { UserRole } from "~/db/schema";
import {
  changePreference,
  DEFAULT_PREFERENCES,
  preferenceCards,
  type NotificationPreferences,
} from "./preferences";

function rowsOf(role: UserRole, preferences = DEFAULT_PREFERENCES) {
  return Object.fromEntries(
    preferenceCards(role, preferences).map((card) => [
      card.channel,
      card.rows.map((row) => row.key),
    ])
  );
}

describe("the Notification Preferences cards", () => {
  it("has one card per Channel, Email then In-app", () => {
    expect(
      preferenceCards(UserRole.Admin, DEFAULT_PREFERENCES).map(
        (card) => card.title
      )
    ).toEqual(["Email", "In-app"]);
  });

  it("shows each role only the Notifications it receives", () => {
    const student = ["refund-request-raised", "comment-reply"];
    const admin = [
      "refund-request-raised",
      "refund-request-to-decide",
      "comment-reply",
    ];
    const instructor = [
      "refund-request-raised",
      "lesson-question",
      "comment-reply",
      "course-status-changed",
    ];

    expect(rowsOf(UserRole.Student)).toEqual({
      email: student,
      in_app_feed: student,
    });
    expect(rowsOf(UserRole.Admin)).toEqual({
      email: admin,
      in_app_feed: admin,
    });
    expect(rowsOf(UserRole.Instructor)).toEqual({
      email: instructor,
      in_app_feed: instructor,
    });
  });

  it("shows Locked Notifications as locked and everything else on by default", () => {
    const [email] = preferenceCards(UserRole.Admin, DEFAULT_PREFERENCES);
    expect(email.muted).toBe(false);
    expect(email.rows.slice(0, 2)).toEqual([
      expect.objectContaining({ key: "refund-request-raised", locked: true }),
      expect.objectContaining({
        key: "refund-request-to-decide",
        locked: false,
        enabled: true,
      }),
    ]);
  });

  it("shows the choices and Channel Mute", () => {
    const preferences: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      mutedChannels: { email: false, in_app_feed: true },
      notifications: { "refund-request-to-decide": { email: false } },
    };
    const [email, inApp] = preferenceCards(UserRole.Admin, preferences);

    expect(email.muted).toBe(false);
    expect(email.rows[1].enabled).toBe(false);
    expect(inApp.muted).toBe(true);
    expect(inApp.rows[1].enabled).toBe(true);
  });
});

describe("changing a Notification Preference", () => {
  it("turns one Notification off on one Channel", () => {
    const result = changePreference(DEFAULT_PREFERENCES, UserRole.Admin, {
      intent: "notification",
      type: "refund-request-to-decide",
      channel: "email",
      enabled: false,
    });

    expect(result).toEqual({
      ok: true,
      preferences: {
        ...DEFAULT_PREFERENCES,
        notifications: { "refund-request-to-decide": { email: false } },
      },
    });
  });

  it("refuses to change a Locked Notification", () => {
    const result = changePreference(DEFAULT_PREFERENCES, UserRole.Student, {
      intent: "notification",
      type: "refund-request-raised",
      channel: "in_app_feed",
      enabled: false,
    });

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses to change a Notification the role does not receive", () => {
    const result = changePreference(DEFAULT_PREFERENCES, UserRole.Student, {
      intent: "notification",
      type: "refund-request-to-decide",
      channel: "email",
      enabled: false,
    });

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it("mutes a Channel and Mutes everything without touching the choices", () => {
    const withChoice: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      notifications: { "refund-request-to-decide": { in_app_feed: false } },
    };

    const channel = changePreference(withChoice, UserRole.Admin, {
      intent: "mute-channel",
      channel: "email",
      muted: true,
    });
    const everything = changePreference(withChoice, UserRole.Admin, {
      intent: "mute-everything",
      muted: true,
    });

    expect(channel).toEqual({
      ok: true,
      preferences: {
        ...withChoice,
        mutedChannels: { email: true, in_app_feed: false },
      },
    });
    expect(everything).toEqual({
      ok: true,
      preferences: { ...withChoice, muteEverything: true },
    });
  });
});
