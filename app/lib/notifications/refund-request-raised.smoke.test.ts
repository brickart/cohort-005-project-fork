import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { raiseRefundRequest } from "~/lib/refunds.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path: domain function → outbox → deliverPending()
// → local NotificationService → feed item and rendered Email.

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("raising a Refund Request, end to end", () => {
  it("puts it in the buyer's and the Admin's feeds and renders both Emails", async () => {
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

    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });

    const raised = raiseRefundRequest(
      db,
      purchase.id,
      user.id,
      "It was not what I expected.",
      now
    );
    expect(raised.ok).toBe(true);
    await deliverPending(db, service, now);

    const buyerFeed = await service.getFeed(user.id);
    expect(buyerFeed.unreadCount).toBe(1);
    expect(buyerFeed.items[0]).toMatchObject({
      type: "refund-request-raised",
      title: "Refund requested — Test Course",
      body: "We have your refund request for Test Course ($79.00).",
      actionUrl: "/settings",
    });

    const adminFeed = await service.getFeed(admin.id);
    expect(adminFeed.items[0]).toMatchObject({
      type: "refund-request-to-decide",
      body: "Test User asked for a refund on Test Course.",
      actionUrl: "/admin/refunds",
    });

    const emails = readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")));
    const confirmation = emails.find(
      (email) => email.to === "test@example.com"
    );
    expect(confirmation).toMatchObject({
      subject: "We have your refund request for Test Course ($79.00)",
      layout: "cadence-locked",
    });
    expect(confirmation.html).toContain('href="https://cadence.test/settings"');
    expect(confirmation.text).toContain("Hi Test User,");
    expect(
      emails.find((email) => email.to === "pat@example.com")
    ).toMatchObject({
      subject: "Test User asked for a refund on Test Course",
      layout: "default",
    });

    const statuses = db
      .select({ status: schema.notificationOutbox.status })
      .from(schema.notificationOutbox)
      .all();
    expect(statuses).toEqual([
      { status: "delivered" },
      { status: "delivered" },
    ]);
  });
});
