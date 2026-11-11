import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { coupons, courses, enrollments, purchases, users } from "~/db/schema";
import { appUrl } from "~/lib/app-url.server";
import {
  enqueueNotifications,
  type NotificationIntent,
} from "~/lib/notifications/outbox.server";
import { newEnrollment } from "~/lib/purchases.server";
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

function getUser(db: Queryable, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * The team member claims the Seat behind `code` and is enrolled. The Team
 * Manager hears about it on Email and In-app (unless they redeemed their own
 * code), and the course's Instructor gets an In-app New Enrollment.
 */
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

    const member = getUser(tx, userId);
    const instructor = getUser(tx, course.instructorId);
    // The Team Manager is the person who bought the Team Licence.
    const manager = purchase ? getUser(tx, purchase.userId) : undefined;
    const intents: NotificationIntent[] = [];
    if (member && manager && purchase) {
      const seats = tx
        .select({ redeemedAt: coupons.redeemedAt })
        .from(coupons)
        .where(eq(coupons.purchaseId, purchase.id))
        .all();
      intents.push({
        type: "coupon-redeemed",
        recipientId: manager.id,
        data: {
          recipient: { email: manager.email, name: manager.name },
          actor_name: member.name,
          title: `${member.name} redeemed a coupon — ${course.title}`,
          action_url: "/team",
          preferences_url: appUrl("/settings"),
          course_title: course.title,
          member_name: member.name,
          seats_claimed: seats.filter((seat) => seat.redeemedAt !== null)
            .length,
          seats_total: seats.length,
          team_url: appUrl("/team"),
        },
      });
    }
    if (member && instructor) {
      intents.push(newEnrollment(instructor, course, member));
    }
    enqueueNotifications(tx, intents, userId, now);

    return {
      ok: true,
      enrollmentId: enrollment.id,
      courseId: course.id,
      courseSlug: course.slug,
    };
  });
}
