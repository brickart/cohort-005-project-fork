import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { redeemCoupon } from "~/lib/coupons.server";
import { completeTeamPurchase } from "~/lib/purchases.server";
import { createLocalNotificationService } from "./local-service.server";
import { deliverPending } from "./outbox.server";

// One trip down the whole path for a redemption: redeemCoupon → outbox →
// deliverPending() → local NotificationService → feed items and the Team
// Manager's Email. Covers coupon-redeemed (and new-enrollment from a coupon).

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("redeeming a coupon, end to end", () => {
  it("emails and tells the Team Manager, and tells the Instructor In-app", async () => {
    const db = createTestDb();
    const { user: manager, instructor, course } = seedBaseData(db);
    const member = db
      .insert(schema.users)
      .values({
        name: "Mia Member",
        email: "mia@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    const now = new Date();
    const licence = completeTeamPurchase(
      db,
      course.id,
      manager.id,
      15800,
      "US",
      2,
      now
    );
    if (!licence.ok) throw new Error("team purchase failed");
    db.delete(schema.notificationOutbox).run();
    const outboxDir = mkdtempSync(join(tmpdir(), "outbox-"));
    const service = createLocalNotificationService({ outboxDir });

    const result = redeemCoupon(
      db,
      licence.couponCodes[0],
      member.id,
      "US",
      now
    );
    expect(result.ok).toBe(true);
    await deliverPending(db, service, now);

    const managerFeed = await service.getFeed(manager.id);
    expect(managerFeed.items).toMatchObject([
      {
        type: "coupon-redeemed",
        title: "Mia Member redeemed a coupon — Test Course",
        body: "Mia Member redeemed a coupon for Test Course.",
        actionUrl: "/team",
      },
    ]);
    const instructorFeed = await service.getFeed(instructor.id);
    expect(instructorFeed.items).toMatchObject([
      { type: "new-enrollment", body: "Mia Member enrolled on Test Course." },
    ]);

    const emails = readdirSync(outboxDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => JSON.parse(readFileSync(join(outboxDir, file), "utf8")));
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: "test@example.com",
      subject: "Mia Member redeemed a coupon — Test Course",
      layout: "default",
    });
    expect(emails[0].text).toContain(
      "1 of 2 seats on this Team Licence are now claimed."
    );
    expect(emails[0].html).toContain('href="https://cadence.test/team"');
  });
});
