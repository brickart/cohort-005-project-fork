import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { completeTeamPurchase } from "./purchases.server";
import { redeemCoupon } from "./coupons.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamMember: typeof schema.users.$inferSelect;
let code: string;

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
  db = createTestDb();
  base = seedBaseData(db);
  teamMember = db
    .insert(schema.users)
    .values({
      name: "Mia Member",
      email: "mia@example.com",
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
  // base.user is the Team Manager: they bought two seats for their team.
  const licence = completeTeamPurchase(
    db,
    base.course.id,
    base.user.id,
    2 * 7900,
    "US",
    2,
    NOW
  );
  if (!licence.ok) throw new Error("team purchase failed");
  code = licence.couponCodes[0];
  db.delete(schema.notificationOutbox).run();
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

function seat() {
  return db
    .select()
    .from(schema.coupons)
    .where(eq(schema.coupons.code, code))
    .get()!;
}

describe("redeeming a coupon", () => {
  it("claims the seat for the team member and enrolls them", () => {
    const result = redeemCoupon(db, code, teamMember.id, "US", NOW);

    expect(result).toMatchObject({
      ok: true,
      courseId: base.course.id,
      courseSlug: "test-course",
    });
    expect(seat()).toMatchObject({
      redeemedByUserId: teamMember.id,
      redeemedAt: NOW.toISOString(),
    });
    expect(isEnrolled(teamMember.id, base.course.id)).toBe(true);
  });

  it("refuses an unknown code", () => {
    expect(redeemCoupon(db, "nope", teamMember.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon not found",
    });
  });

  it("refuses a code that was already redeemed", () => {
    redeemCoupon(db, code, teamMember.id, "US", NOW);
    const other = seedOtherUser("Olly", "olly@example.com");

    expect(redeemCoupon(db, code, other.id, "US", NOW)).toEqual({
      ok: false,
      error: "Coupon has already been redeemed",
    });
  });

  it("refuses someone already enrolled, and leaves the seat unclaimed", () => {
    db.insert(schema.enrollments)
      .values({ userId: teamMember.id, courseId: base.course.id })
      .run();

    expect(redeemCoupon(db, code, teamMember.id, "US", NOW)).toEqual({
      ok: false,
      error: "You are already enrolled in this course",
    });
    expect(seat().redeemedByUserId).toBeNull();
  });

  it("refuses a team member in a different country from the purchaser", () => {
    expect(redeemCoupon(db, code, teamMember.id, "DE", NOW)).toMatchObject({
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    });
    expect(isEnrolled(teamMember.id, base.course.id)).toBe(false);
  });
});

function seedOtherUser(name: string, email: string) {
  return db
    .insert(schema.users)
    .values({ name, email, role: schema.UserRole.Student })
    .returning()
    .get();
}
