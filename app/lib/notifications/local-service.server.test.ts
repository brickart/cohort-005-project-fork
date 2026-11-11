import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  RefundRequestRaisedData,
  RefundRequestToDecideData,
} from "./catalogue";
import { createLocalNotificationService } from "./local-service.server";
import { DEFAULT_PREFERENCES } from "./preferences";
import type { OutboundNotification } from "./service.server";

const PAT = 7;
const SAM = 8;

function toDecide(
  recipientId: number,
  buyerName: string
): OutboundNotification {
  const data: RefundRequestToDecideData = {
    recipient: { email: `admin-${recipientId}@example.com`, name: "Pat" },
    actor_name: buyerName,
    title: `Refund request to decide — Intro to Rust`,
    action_url: "/admin/refunds",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    amount: "$79.00",
    buyer_name: buyerName,
    reason: "Not for me.",
    refunds_url: "https://cadence.test/admin/refunds",
  };
  return {
    idempotencyKey: randomUUID(),
    type: "refund-request-to-decide",
    recipientId,
    actorId: 1,
    data,
  };
}

/** A clock that moves on a minute every time it is read. */
function tickingClock() {
  let now = new Date("2026-11-11T12:00:00.000Z").getTime();
  return () => new Date((now += 60_000));
}

function memoryService() {
  return createLocalNotificationService({ clock: tickingClock() });
}

describe("the local NotificationService, in memory", () => {
  it("shows names in the feed as written, the way Knock's feed does", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Ana <b>&</b> Co"));

    const [item] = (await service.getFeed(PAT)).items;

    expect(item.body).toBe(
      "Ana <b>&</b> Co asked for a refund on Intro to Rust."
    );
  });

  it("returns a person's feed newest first with an unread count", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));
    await service.deliver(toDecide(SAM, "Ava"));

    const feed = await service.getFeed(PAT);

    expect(feed.unreadCount).toBe(2);
    expect(feed.items.map((item) => item.body)).toEqual([
      "Ben asked for a refund on Intro to Rust.",
      "Liam asked for a refund on Intro to Rust.",
    ]);
    expect(feed.items[0]).toMatchObject({
      type: "refund-request-to-decide",
      title: "Refund request to decide — Intro to Rust",
      actionUrl: "/admin/refunds",
      readAt: null,
    });
  });

  it("marks one item read", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));
    const [newest] = (await service.getFeed(PAT)).items;

    await service.markRead(PAT, newest.id);

    const feed = await service.getFeed(PAT);
    expect(feed.unreadCount).toBe(1);
    expect(feed.items[0].readAt).not.toBeNull();
    expect(feed.items[1].readAt).toBeNull();
  });

  it("marks all of one person's items read and leaves others alone", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));
    await service.deliver(toDecide(SAM, "Ava"));

    await service.markAllRead(PAT);

    expect((await service.getFeed(PAT)).unreadCount).toBe(0);
    expect((await service.getFeed(SAM)).unreadCount).toBe(1);
  });

  it("does not let one person mark another's item read", async () => {
    const service = memoryService();
    await service.deliver(toDecide(SAM, "Ava"));
    const [item] = (await service.getFeed(SAM)).items;

    await service.markRead(PAT, item.id);

    expect((await service.getFeed(SAM)).unreadCount).toBe(1);
  });

  it("delivers a retried Notification only once, like Knock's Idempotency-Key", async () => {
    const service = memoryService();
    const notification = toDecide(PAT, "Liam");

    await service.deliver(notification);
    await service.deliver(notification);

    expect((await service.getFeed(PAT)).items).toHaveLength(1);
  });
});

describe("the local NotificationService, writing to disk", () => {
  it("writes each Email to the outbox as JSON plus an HTML preview", async () => {
    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });

    await service.deliver(toDecide(PAT, "Liam"));

    const files = readdirSync(outboxDir).sort();
    expect(files).toHaveLength(2);
    const json = files.find((file) => file.endsWith(".json"));
    const html = files.find((file) => file.endsWith(".html"));
    expect(json).toMatch(
      /refund-request-to-decide-admin-7@example\.com\.json$/
    );
    const written = JSON.parse(
      readFileSync(join(outboxDir, json ?? ""), "utf8")
    );
    expect(written).toMatchObject({
      to: "admin-7@example.com",
      subject: "Liam asked for a refund on Intro to Rust",
      layout: "default",
      workflow: "refund-request-to-decide",
    });
    expect(written.text).toContain("Liam asked for a refund");
    expect(readFileSync(join(outboxDir, html ?? ""), "utf8")).toContain(
      "Review refund requests"
    );
  });

  it("keeps the feed in a JSON store across instances", async () => {
    const storePath = join(mkdtempSync(join(tmpdir(), "store-")), "store.json");

    await createLocalNotificationService({ storePath }).deliver(
      toDecide(PAT, "Liam")
    );

    const feed = await createLocalNotificationService({ storePath }).getFeed(
      PAT
    );
    expect(feed.items).toHaveLength(1);
  });
});

// ─── Notification Preferences ───

function raised(recipientId: number): OutboundNotification {
  const data: RefundRequestRaisedData = {
    recipient: { email: `learner-${recipientId}@example.com`, name: "Liam" },
    actor_name: "Liam",
    title: "Refund requested — Intro to Rust",
    action_url: "/settings",
    preferences_url: "https://cadence.test/settings",
    course_title: "Intro to Rust",
    amount: "$79.00",
    refund_url: "https://cadence.test/settings",
  };
  return {
    idempotencyKey: randomUUID(),
    type: "refund-request-raised",
    recipientId,
    actorId: recipientId,
    data,
  };
}

function serviceWithOutbox() {
  const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
  const service = createLocalNotificationService({
    outboxDir,
    clock: tickingClock(),
  });
  const emailsTo = (address: string) =>
    readdirSync(outboxDir).filter((file) => file.endsWith(`-${address}.json`))
      .length;
  return { service, emailsTo };
}

describe("the local NotificationService's Notification Preferences", () => {
  it("has everything on by default", async () => {
    const service = memoryService();

    expect(await service.getPreferences(PAT)).toEqual(DEFAULT_PREFERENCES);
  });

  it("stops delivery on a Channel turned off for one Notification, and only on that Channel", async () => {
    const { service, emailsTo } = serviceWithOutbox();
    await service.setPreferences(PAT, {
      ...DEFAULT_PREFERENCES,
      notifications: { "refund-request-to-decide": { email: false } },
    });

    await service.deliver(toDecide(PAT, "Liam"));

    expect(emailsTo("admin-7@example.com")).toBe(0);
    expect((await service.getFeed(PAT)).items).toHaveLength(1);
  });

  it("silences a muted Channel, keeps the choices underneath and restores them on unmute", async () => {
    const { service, emailsTo } = serviceWithOutbox();
    const choices = { "refund-request-to-decide": { in_app_feed: false } };
    await service.setPreferences(PAT, {
      ...DEFAULT_PREFERENCES,
      mutedChannels: { email: true, in_app_feed: false },
      notifications: choices,
    });

    await service.deliver(toDecide(PAT, "Liam"));
    expect(emailsTo("admin-7@example.com")).toBe(0);
    expect((await service.getFeed(PAT)).items).toHaveLength(0);

    const muted = await service.getPreferences(PAT);
    expect(muted.notifications).toEqual(choices);
    await service.setPreferences(PAT, {
      ...muted,
      mutedChannels: { email: false, in_app_feed: false },
    });

    await service.deliver(toDecide(PAT, "Ben"));
    expect(emailsTo("admin-7@example.com")).toBe(1);
    expect((await service.getFeed(PAT)).items).toHaveLength(0);
  });

  it("silences everything under Mute everything and restores the choices on unmute", async () => {
    const { service, emailsTo } = serviceWithOutbox();
    const choices = { "refund-request-to-decide": { email: false } };
    await service.setPreferences(PAT, {
      ...DEFAULT_PREFERENCES,
      muteEverything: true,
      notifications: choices,
    });

    await service.deliver(toDecide(PAT, "Liam"));
    expect((await service.getFeed(PAT)).items).toHaveLength(0);

    const muted = await service.getPreferences(PAT);
    expect(muted).toMatchObject({
      muteEverything: true,
      notifications: choices,
    });
    await service.setPreferences(PAT, { ...muted, muteEverything: false });

    await service.deliver(toDecide(PAT, "Ben"));
    expect((await service.getFeed(PAT)).items).toHaveLength(1);
    expect(emailsTo("admin-7@example.com")).toBe(0);
  });

  it("delivers a Locked Notification on both Channels whatever the Mute and Preferences", async () => {
    const { service, emailsTo } = serviceWithOutbox();
    await service.setPreferences(SAM, {
      muteEverything: true,
      mutedChannels: { email: true, in_app_feed: true },
      notifications: {
        "refund-request-raised": { email: false, in_app_feed: false },
      },
    });

    await service.deliver(raised(SAM));

    expect(emailsTo("learner-8@example.com")).toBe(1);
    expect((await service.getFeed(SAM)).items).toHaveLength(1);
  });

  it("keeps each person's preferences to themselves", async () => {
    const service = memoryService();
    await service.setPreferences(PAT, {
      ...DEFAULT_PREFERENCES,
      muteEverything: true,
    });

    await service.deliver(toDecide(SAM, "Liam"));

    expect((await service.getFeed(SAM)).items).toHaveLength(1);
    expect((await service.getPreferences(SAM)).muteEverything).toBe(false);
  });
});
