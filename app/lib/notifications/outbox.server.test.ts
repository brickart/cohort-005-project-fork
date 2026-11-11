import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import type { RefundRequestToDecideData } from "./catalogue";
import { deliverPending, enqueueNotifications } from "./outbox.server";
import {
  NotificationDeliveryError,
  type Feed,
  type NotificationService,
  type OutboundNotification,
} from "./service.server";

type TestDb = ReturnType<typeof createTestDb>;

const START = new Date("2026-11-11T12:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function at(msAfterStart: number) {
  return new Date(START.getTime() + msAfterStart);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const toDecideData: RefundRequestToDecideData = {
  recipient: { email: "instructor@example.com", name: "Test Instructor" },
  actor_name: "Test User",
  title: "Refund request to decide — Test Course",
  action_url: "/admin/refunds",
  preferences_url: "https://cadence.test/settings",
  course_title: "Test Course",
  amount: "$79.00",
  buyer_name: "Test User",
  reason: "Not for me.",
  refunds_url: "https://cadence.test/admin/refunds",
};

function enqueueOne(now = START) {
  const [enqueued] = enqueueNotifications(
    db,
    [
      {
        type: "refund-request-to-decide",
        recipientId: base.instructor.id,
        data: toDecideData,
      },
    ],
    base.user.id,
    now
  );
  return enqueued;
}

/** A NotificationService that records deliveries and fails on demand. */
function fakeService(
  deliver: (notification: OutboundNotification) => Promise<void> = async () => {}
) {
  const delivered: OutboundNotification[] = [];
  const service: NotificationService = {
    async deliver(notification) {
      await deliver(notification);
      delivered.push(notification);
    },
    async getFeed(): Promise<Feed> {
      return { items: [], unreadCount: 0 };
    },
    async markRead() {},
    async markAllRead() {},
  };
  return { service, delivered };
}

function failingService(error: () => unknown) {
  const attempts: string[] = [];
  const { service } = fakeService(async (notification) => {
    attempts.push(notification.idempotencyKey);
    throw error();
  });
  return { service, attempts };
}

function outboxRow() {
  const [row] = db.select().from(schema.notificationOutbox).all();
  return row;
}

describe("enqueueing Notifications", () => {
  it("drops an intent whose recipient is the actor", () => {
    const enqueued = enqueueNotifications(
      db,
      [
        {
          type: "refund-request-to-decide",
          recipientId: base.user.id,
          data: toDecideData,
        },
      ],
      base.user.id
    );

    expect(enqueued).toEqual([]);
  });

  it("keeps a Locked Notification for the actor, since it answers what they did", () => {
    const enqueued = enqueueNotifications(
      db,
      [
        {
          type: "refund-request-raised",
          recipientId: base.user.id,
          data: {
            recipient: { email: "test@example.com", name: "Test User" },
            actor_name: "Test User",
            title: "Refund requested — Test Course",
            action_url: "/settings",
            preferences_url: "https://cadence.test/settings",
            course_title: "Test Course",
            amount: "$79.00",
            refund_url: "https://cadence.test/settings",
          },
        },
      ],
      base.user.id
    );

    expect(enqueued).toHaveLength(1);
  });
});

describe("draining the outbox", () => {
  it("delivers a pending row and marks it delivered", async () => {
    enqueueOne();
    const { service, delivered } = fakeService();

    await deliverPending(db, service, START);

    expect(delivered).toHaveLength(1);
    expect(outboxRow()).toMatchObject({
      status: "delivered",
      deliveredAt: START.toISOString(),
    });
  });

  it("passes the idempotency key and the data through as-is", async () => {
    const enqueued = enqueueOne();
    const { service, delivered } = fakeService();

    await deliverPending(db, service, START);

    expect(delivered[0]).toEqual({
      idempotencyKey: enqueued.idempotencyKey,
      type: "refund-request-to-decide",
      recipientId: base.instructor.id,
      actorId: base.user.id,
      data: toDecideData,
    });
  });

  it("never sends a row twice when drains run at the same time", async () => {
    enqueueOne();
    enqueueOne();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { service, delivered } = fakeService(() => gate);

    const first = deliverPending(db, service, START);
    const second = deliverPending(db, service, START);
    release();
    await Promise.all([first, second]);

    expect(delivered.map((n) => n.idempotencyKey).sort()).toEqual(
      [...new Set(delivered.map((n) => n.idempotencyKey))].sort()
    );
    expect(delivered).toHaveLength(2);
  });

  it("does not deliver a delivered row again", async () => {
    enqueueOne();
    const { service, delivered } = fakeService();

    await deliverPending(db, service, START);
    await deliverPending(db, service, at(DAY));

    expect(delivered).toHaveLength(1);
  });

  it("claims a row again once a crashed send's lease runs out", async () => {
    enqueueOne();
    const hung = fakeService(() => new Promise<void>(() => {}));
    void deliverPending(db, hung.service, START);

    const { service, delivered } = fakeService();
    await deliverPending(db, service, at(MINUTE));
    expect(delivered).toHaveLength(0);

    await deliverPending(db, service, at(2 * MINUTE));
    expect(delivered).toHaveLength(1);
  });

  it("retries a 5xx at 1 min, 5 min, 30 min, 2 h and 12 h, then fails", async () => {
    enqueueOne();
    const { service, attempts } = failingService(
      () => new NotificationDeliveryError("Knock is down", 503)
    );

    // When each attempt happens, and when the next one is due after it fails.
    const schedule = [
      [0, MINUTE],
      [MINUTE, 6 * MINUTE],
      [6 * MINUTE, 36 * MINUTE],
      [36 * MINUTE, 36 * MINUTE + 2 * HOUR],
      [36 * MINUTE + 2 * HOUR, 36 * MINUTE + 14 * HOUR],
    ];

    for (const [attemptAt, nextAt] of schedule) {
      await deliverPending(db, service, at(attemptAt));
      await deliverPending(db, service, at(nextAt - 1));
      expect(outboxRow()).toMatchObject({
        status: "pending",
        nextAttemptAt: at(nextAt).toISOString(),
        lastError: "Knock is down",
      });
    }

    await deliverPending(db, service, at(36 * MINUTE + 14 * HOUR));

    expect(attempts).toHaveLength(6);
    expect(outboxRow()).toMatchObject({
      status: "failed",
      attempts: 6,
      lastError: "Knock is down",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("retries a 429 and a network error", async () => {
    enqueueOne();
    enqueueOne();
    let call = 0;
    const { service } = fakeService(async () => {
      call++;
      if (call === 1) throw new NotificationDeliveryError("Slow down", 429);
      throw new TypeError("fetch failed");
    });

    await deliverPending(db, service, START);

    const rows = db.select().from(schema.notificationOutbox).all();
    expect(rows.map((row) => row.status)).toEqual(["pending", "pending"]);
    expect(rows.map((row) => row.lastError).sort()).toEqual(
      ["Slow down", "fetch failed"].sort()
    );
  });

  it("fails a non-retryable 4xx at once", async () => {
    enqueueOne();
    const { service, attempts } = failingService(
      () => new NotificationDeliveryError("Unknown workflow", 422)
    );

    await deliverPending(db, service, START);
    await deliverPending(db, service, at(DAY));

    expect(attempts).toHaveLength(1);
    expect(outboxRow()).toMatchObject({
      status: "failed",
      lastError: "Unknown workflow",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("prunes delivered rows older than 30 days and keeps failed ones", async () => {
    enqueueOne();
    await deliverPending(db, fakeService().service, START);
    enqueueOne();
    await deliverPending(
      db,
      failingService(() => new NotificationDeliveryError("Bad", 400)).service,
      START
    );

    await deliverPending(db, fakeService().service, at(30 * DAY));
    expect(db.select().from(schema.notificationOutbox).all()).toHaveLength(2);

    await deliverPending(db, fakeService().service, at(30 * DAY + MINUTE));
    const rows = db.select().from(schema.notificationOutbox).all();
    expect(rows.map((row) => row.status)).toEqual(["failed"]);
  });
});
