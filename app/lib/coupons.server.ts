import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, courses, enrollments, purchases } from "~/db/schema";
import { getSeatAvailability } from "~/lib/refunds.server";

// ─── Coupon redemption ───
// A team member redeems one of a Team Manager's coupon codes: the Seat is
// claimed and they are enrolled, in one transaction. Callers kick the
// Notification drainer after commit.
//
// Takes the database first, so tests can hand in an in-memory one. Uses
// positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type RedeemResult =
  | { ok: true; enrollmentId: number; courseId: number; courseSlug: string }
  | { ok: false; error: string };

export function getCouponByCode(db: Queryable, code: string) {
  return db.select().from(coupons).where(eq(coupons.code, code)).get();
}

export function redeemCoupon(
  db: Queryable,
  code: string,
  userId: number,
  userCountry: string,
  now: Date
): RedeemResult {
  return db.transaction((tx): RedeemResult => {
    const coupon = getCouponByCode(tx, code);
    if (!coupon) return { ok: false, error: "Coupon not found" };

    if (coupon.redeemedByUserId !== null) {
      return { ok: false, error: "Coupon has already been redeemed" };
    }

    const availability = getSeatAvailability(tx, coupon);
    if (availability === "on_hold") return { ok: false, error: SEAT_ON_HOLD };
    if (availability === "refunded") {
      return { ok: false, error: SEAT_REFUNDED };
    }

    const existingEnrollment = tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.courseId, coupon.courseId)
        )
      )
      .get();
    if (existingEnrollment) {
      return { ok: false, error: "You are already enrolled in this course" };
    }

    const purchase = tx
      .select()
      .from(purchases)
      .where(eq(purchases.id, coupon.purchaseId))
      .get();
    if (purchase?.country && purchase.country !== userCountry) {
      return {
        ok: false,
        error:
          "This coupon can only be redeemed from the same country as the purchaser",
      };
    }

    const course = tx
      .select()
      .from(courses)
      .where(eq(courses.id, coupon.courseId))
      .get();
    if (!course) return { ok: false, error: "Course not found" };

    const at = now.toISOString();
    tx.update(coupons)
      .set({ redeemedByUserId: userId, redeemedAt: at })
      .where(eq(coupons.id, coupon.id))
      .run();
    const enrollment = tx
      .insert(enrollments)
      .values({ userId, courseId: coupon.courseId, enrolledAt: at })
      .returning()
      .get();

    return {
      ok: true,
      enrollmentId: enrollment.id,
      courseId: course.id,
      courseSlug: course.slug,
    };
  });
}
