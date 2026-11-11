import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
  raiseRefundRequest,
} from "~/lib/refunds.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path for each decision: domain function → outbox →
// deliverPending() → local NotificationService → feed item and rendered Email.

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function setUp() {
  const db = createTestDb();
  const { user, course } = seedBaseData(db);
  const admin = db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: UserRole.Admin,
    })
    .returning()
    .get();
  const now = new Date();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: user.id,
      courseId: course.id,
      amountPaid: 7900,
      createdAt: now.toISOString(),
    })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId: user.id, courseId: course.id })
    .run();

  const raised = raiseRefundRequest(
    db,
    purchase.id,
    user.id,
    "It was not what I expected.",
    now
  );
  if (!raised.ok) throw new Error(raised.error);

  const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
  const service = createLocalNotificationService({ outboxDir });

  function emailTo(address: string, subject: string) {
    return readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")))
      .find((email) => email.to === address && email.subject === subject);
  }

  return {
    db,
    user,
    admin,
    now,
    service,
    emailTo,
    refundRequestId: raised.refundRequestId,
  };
}

describe("deciding a Refund Request, end to end", () => {
  it("tells the buyer it was approved, in the feed and by Email", async () => {
    const { db, user, admin, now, service, emailTo, refundRequestId } = setUp();

    approveRefundRequest(db, refundRequestId, admin.id, null, now);
    await deliverPending(db, service, now);

    const feed = await service.getFeed(user.id);
    expect(feed.items[0]).toMatchObject({
      type: "refund-request-approved",
      title: "Refund approved — Test Course",
      body: "We approved your refund for Test Course ($79.00).",
      actionUrl: "/settings",
      readAt: null,
    });

    const email = emailTo(
      "test@example.com",
      "We approved your refund for Test Course ($79.00)"
    );
    expect(email).toMatchObject({ layout: "cadence-locked" });
    expect(email.text).toContain("Hi Test User,");
    expect(email.text).toContain(
      'We approved your refund for "Test Course" ($79.00).'
    );
    expect(email.text).toContain("is on its way back to you");
    expect(email.text).toContain("Your Enrollment on the course has ended.");
    expect(email.text).not.toContain("A note from our team");
  });

  it("tells the buyer it was declined and why, in the feed and by Email", async () => {
    const { db, user, admin, now, service, emailTo, refundRequestId } = setUp();

    declineRefundRequest(
      db,
      refundRequestId,
      admin.id,
      "You finished the course.",
      now
    );
    await deliverPending(db, service, now);

    const feed = await service.getFeed(user.id);
    expect(feed.items[0]).toMatchObject({
      type: "refund-request-declined",
      title: "Refund declined — Test Course",
      body: "We declined your refund request for Test Course.",
      actionUrl: "/settings",
    });

    const email = emailTo(
      "test@example.com",
      "We declined your refund request for Test Course"
    );
    expect(email).toMatchObject({ layout: "cadence-locked" });
    expect(email.text).toContain(
      'We declined your refund request for "Test Course".'
    );
    expect(email.text).toContain("Why: You finished the course.");
    expect(email.text).toContain("you can raise a new refund request");
    expect(email.html).toContain('href="https://cadence.test/settings"');
  });
});
