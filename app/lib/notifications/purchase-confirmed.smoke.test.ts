import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import { completePurchase } from "~/lib/purchases.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path for a purchase: completePurchase → outbox →
// deliverPending() → local NotificationService → feed items and the receipt
// Email. Covers purchase-confirmed and new-enrollment.

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("completing a purchase, end to end", () => {
  it("emails the Learner a receipt and tells the Instructor In-app only", async () => {
    const db = createTestDb();
    const { user, instructor, course } = seedBaseData(db);
    const now = new Date();
    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });

    const result = completePurchase(db, course.id, user.id, 7900, "US", now);
    expect(result.ok).toBe(true);
    await deliverPending(db, service, now);

    const learnerFeed = await service.getFeed(user.id);
    expect(learnerFeed.items).toMatchObject([
      {
        type: "purchase-confirmed",
        title: "Receipt — Test Course",
        body: "You paid $79.00 for Test Course.",
        actionUrl: "/courses/test-course",
      },
    ]);

    const instructorFeed = await service.getFeed(instructor.id);
    expect(instructorFeed.items).toMatchObject([
      {
        type: "new-enrollment",
        title: "New Enrollment — Test Course",
        body: "Test User enrolled on Test Course.",
        actionUrl: `/instructor/${course.id}/students`,
      },
    ]);

    const emails = readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")));
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: "test@example.com",
      subject: "Receipt — Test Course",
      layout: "cadence-locked",
    });
    expect(emails[0].text).toContain('You paid $79.00 for "Test Course".');
    expect(emails[0].html).toContain(
      'href="https://cadence.test/courses/test-course"'
    );
  });
});
