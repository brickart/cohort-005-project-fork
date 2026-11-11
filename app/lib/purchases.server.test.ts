import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { TeamMemberRole } from "~/db/schema";
import { completePurchase, completeTeamPurchase } from "./purchases.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
  db = createTestDb();
  base = seedBaseData(db);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function isEnrolled(userId: number, courseId: number) {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId)
      )
    )
    .get();
}

function outboxRows() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

describe("completing an individual purchase", () => {
  it("records the purchase and enrolls the buyer", () => {
    const result = completePurchase(
      db,
      base.course.id,
      base.user.id,
      7900,
      "US",
      NOW
    );

    expect(result.ok).toBe(true);
    const purchases = db.select().from(schema.purchases).all();
    expect(purchases).toMatchObject([
      {
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        country: "US",
      },
    ]);
    expect(isEnrolled(base.user.id, base.course.id)).toBe(true);
  });

  it("refuses a buyer who is already enrolled, and writes nothing", () => {
    completePurchase(db, base.course.id, base.user.id, 7900, "US", NOW);

    const again = completePurchase(
      db,
      base.course.id,
      base.user.id,
      7900,
      "US",
      NOW
    );

    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(db.select().from(schema.purchases).all()).toHaveLength(1);
  });
});

describe("completing a team purchase", () => {
  it("makes the buyer Team Manager with one coupon per seat, without enrolling them", () => {
    const result = completeTeamPurchase(
      db,
      base.course.id,
      base.user.id,
      3 * 7900,
      "US",
      3,
      NOW
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(db.select().from(schema.purchases).all()).toMatchObject([
      { userId: base.user.id, amountPaid: 23700 },
    ]);
    expect(
      db
        .select()
        .from(schema.teamMembers)
        .where(eq(schema.teamMembers.teamId, result.teamId))
        .all()
    ).toMatchObject([{ userId: base.user.id, role: TeamMemberRole.Admin }]);
    const seats = db
      .select()
      .from(schema.coupons)
      .where(eq(schema.coupons.purchaseId, result.purchaseId))
      .all();
    expect(seats).toHaveLength(3);
    expect(new Set(seats.map((seat) => seat.code)).size).toBe(3);
    expect(isEnrolled(base.user.id, base.course.id)).toBe(false);
  });

  it("reuses the Team Manager's team for a second purchase", () => {
    const first = completeTeamPurchase(
      db,
      base.course.id,
      base.user.id,
      7900,
      "US",
      1,
      NOW
    );
    const second = completeTeamPurchase(
      db,
      base.course.id,
      base.user.id,
      7900,
      "US",
      1,
      NOW
    );

    expect(first.ok && second.ok && first.teamId === second.teamId).toBe(true);
  });
});

describe("the Notifications a purchase causes", () => {
  it("sends the Learner a receipt and the Instructor a New Enrollment", () => {
    completePurchase(db, base.course.id, base.user.id, 7900, "US", NOW);

    const rows = outboxRows();
    expect(rows).toHaveLength(2);
    const receipt = rows.find((row) => row.type === "purchase-confirmed");
    expect(receipt).toMatchObject({
      recipientId: base.user.id,
      actorId: base.user.id,
      status: "pending",
      data: {
        recipient: { email: "test@example.com", name: "Test User" },
        actor_name: "Test User",
        title: "Receipt — Test Course",
        action_url: "/courses/test-course",
        preferences_url: "https://cadence.test/settings",
        course_title: "Test Course",
        amount: "$79.00",
        seats: 1,
        is_team_purchase: false,
        course_url: "https://cadence.test/courses/test-course",
        team_url: "https://cadence.test/team",
      },
    });
    const enrollment = rows.find((row) => row.type === "new-enrollment");
    expect(enrollment).toMatchObject({
      recipientId: base.instructor.id,
      actorId: base.user.id,
      status: "pending",
      data: {
        recipient: { email: "instructor@example.com", name: "Test Instructor" },
        actor_name: "Test User",
        title: "New Enrollment — Test Course",
        action_url: `/instructor/${base.course.id}/students`,
        preferences_url: "https://cadence.test/settings",
        course_title: "Test Course",
        learner_name: "Test User",
        students_url: `https://cadence.test/instructor/${base.course.id}/students`,
      },
    });
    expect(receipt?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(receipt?.idempotencyKey).not.toBe(enrollment?.idempotencyKey);
  });

  it("sends the Team Manager the receipt for a team purchase, and no New Enrollment", () => {
    completeTeamPurchase(db, base.course.id, base.user.id, 23700, "US", 3, NOW);

    expect(outboxRows()).toMatchObject([
      {
        type: "purchase-confirmed",
        recipientId: base.user.id,
        data: {
          recipient: { email: "test@example.com", name: "Test User" },
          title: "Receipt — Test Course",
          action_url: "/team",
          amount: "$237.00",
          seats: 3,
          is_team_purchase: true,
          course_url: "https://cadence.test/courses/test-course",
          team_url: "https://cadence.test/team",
        },
      },
    ]);
  });

  it("does not tell an Instructor about buying their own course", () => {
    completePurchase(db, base.course.id, base.instructor.id, 7900, "US", NOW);

    expect(outboxRows().map((row) => [row.type, row.recipientId])).toEqual([
      ["purchase-confirmed", base.instructor.id],
    ]);
  });

  it("writes no Notification when the purchase is refused", () => {
    completePurchase(db, base.course.id, base.user.id, 7900, "US", NOW);
    const before = outboxRows().length;

    completePurchase(db, base.course.id, base.user.id, 7900, "US", NOW);

    expect(outboxRows()).toHaveLength(before);
  });
});
