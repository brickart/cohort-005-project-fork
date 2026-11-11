import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type {
  RefundRequestRaisedData,
  RefundRequestToDecideData,
} from "./catalogue";
import { applyBellAction, readBell, readBellOrNothing } from "./bell.server";
import { createLocalNotificationService } from "./local-service.server";
import type {
  NotificationService,
  OutboundNotification,
} from "./service.server";

const LIAM = 3;
const PAT = 7;

function raised(recipientId: number): OutboundNotification {
  const data: RefundRequestRaisedData = {
    recipient: { email: "liam@example.com", name: "Liam" },
    actor_name: "Liam",
    title: "We have your refund request",
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
    actorId: LIAM,
    data,
  };
}

function toDecide(
  recipientId: number,
  buyerName: string
): OutboundNotification {
  const data: RefundRequestToDecideData = {
    recipient: { email: "pat@example.com", name: "Pat" },
    actor_name: buyerName,
    title: "Refund request to decide — Intro to Rust",
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
    actorId: LIAM,
    data,
  };
}

function tickingClock() {
  let now = new Date("2026-11-11T12:00:00.000Z").getTime();
  return () => new Date((now += 60_000));
}

function memoryService() {
  return createLocalNotificationService({ clock: tickingClock() });
}

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("the bell", () => {
  it("lists a person's Notifications newest first, each with its catalogue icon", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));
    await service.deliver(raised(LIAM));

    const bell = await readBell(service, PAT);

    expect(bell.unreadCount).toBe(2);
    expect(bell.items).toMatchObject([
      {
        icon: "inbox",
        title: "Refund request to decide — Intro to Rust",
        body: "Ben asked for a refund on Intro to Rust.",
        actionUrl: "/admin/refunds",
        unread: true,
      },
      {
        icon: "inbox",
        body: "Liam asked for a refund on Intro to Rust.",
        unread: true,
      },
    ]);
  });

  it("leaves the unread count alone when the feed is only read", async () => {
    const service = memoryService();
    await service.deliver(raised(LIAM));

    await readBell(service, LIAM);
    const bell = await readBell(service, LIAM);

    expect(bell.unreadCount).toBe(1);
  });

  it("marks one Notification read and sends the person to its target", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));
    const [newest] = (await readBell(service, PAT)).items;

    const result = await applyBellAction(
      service,
      PAT,
      form({ intent: "mark-read", itemId: newest.id })
    );

    expect(result).toEqual({ redirectTo: "/admin/refunds" });
    const bell = await readBell(service, PAT);
    expect(bell.unreadCount).toBe(1);
    expect(bell.items.map((item) => item.unread)).toEqual([false, true]);
  });

  it("marks everything read", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    await service.deliver(toDecide(PAT, "Ben"));

    const result = await applyBellAction(
      service,
      PAT,
      form({ intent: "mark-all-read" })
    );

    expect(result).toEqual({ redirectTo: null });
    expect((await readBell(service, PAT)).unreadCount).toBe(0);
  });

  it("cannot mark someone else's Notification read", async () => {
    const service = memoryService();
    await service.deliver(toDecide(PAT, "Liam"));
    const [patsItem] = (await readBell(service, PAT)).items;

    await expect(
      applyBellAction(
        service,
        LIAM,
        form({ intent: "mark-read", itemId: patsItem.id })
      )
    ).rejects.toMatchObject({ init: { status: 404 } });
    expect((await readBell(service, PAT)).unreadCount).toBe(1);
  });

  it("refuses an action it does not know", async () => {
    const service = memoryService();

    await expect(
      applyBellAction(service, PAT, form({ intent: "delete-everything" }))
    ).rejects.toMatchObject({ init: { status: 400 } });
  });
});

describe("the bell when the NotificationService is in trouble", () => {
  function quietly() {
    return vi.spyOn(console, "error").mockImplementation(() => {});
  }

  it("shows no bell, and logs why, when the service fails", async () => {
    const logged = quietly();
    const service: NotificationService = {
      ...memoryService(),
      getFeed: async () => {
        throw new Error("Knock is down");
      },
    };

    expect(await readBellOrNothing(service, LIAM)).toBeNull();
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining("[notifications]"),
      expect.objectContaining({ message: "Knock is down" })
    );
    logged.mockRestore();
  });

  it("shows no bell rather than wait when the service hangs", async () => {
    const logged = quietly();
    const service: NotificationService = {
      ...memoryService(),
      getFeed: () => new Promise(() => {}),
    };

    expect(
      await readBellOrNothing(service, LIAM, { timeoutMs: 10 })
    ).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("shows the bell as usual when the service answers", async () => {
    const service = memoryService();
    await service.deliver(raised(LIAM));

    expect(await readBellOrNothing(service, LIAM)).toMatchObject({
      unreadCount: 1,
    });
  });
});
