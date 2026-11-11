import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  teamMembers,
  teams,
  TeamMemberRole,
  users,
} from "~/db/schema";
import { appUrl } from "~/lib/app-url.server";
import {
  enqueueNotifications,
  type NotificationIntent,
} from "~/lib/notifications/outbox.server";
import { formatPrice } from "~/lib/utils";

// ─── Purchases ───
// Completing a Purchase: for yourself (you are enrolled) or for a team (you
// become its Team Manager and get one coupon per seat). Each runs in one
// transaction. Callers kick the Notification drainer after commit.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

export type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

export type Failure = { ok: false; status: 404 | 409; error: string };

export type PurchaseResult =
  { ok: true; purchaseId: number; enrollmentId: number } | Failure;

export type TeamPurchaseResult =
  | { ok: true; purchaseId: number; teamId: number; couponCodes: string[] }
  | Failure;

type User = typeof users.$inferSelect;
type Course = typeof courses.$inferSelect;

function getCourse(db: Queryable, courseId: number) {
  return db.select().from(courses).where(eq(courses.id, courseId)).get();
}

function getUser(db: Queryable, userId: number) {
  return db.select().from(users).where(eq(users.id, userId)).get();
}

function studentsPath(courseId: number) {
  return `/instructor/${courseId}/students`;
}

/**
 * The receipt is a Locked Notification, so it reaches the buyer even though
 * they are the one who caused it. A Team Manager's In-app copy links to their
 * team, where the coupon codes are; a Learner's links to the course.
 */
function receipt(
  buyer: User,
  course: Course,
  amountPaid: number,
  seats: number,
  isTeamPurchase: boolean
): NotificationIntent {
  const coursePath = `/courses/${course.slug}`;
  return {
    type: "purchase-confirmed",
    recipientId: buyer.id,
    data: {
      recipient: { email: buyer.email, name: buyer.name },
      actor_name: buyer.name,
      title: `Receipt — ${course.title}`,
      action_url: isTeamPurchase ? "/team" : coursePath,
      preferences_url: appUrl("/settings"),
      course_title: course.title,
      amount: formatPrice(amountPaid),
      seats,
      is_team_purchase: isTeamPurchase,
      course_url: appUrl(coursePath),
      team_url: appUrl("/team"),
    },
  };
}

export function isUserEnrolled(
  db: Queryable,
  userId: number,
  courseId: number
): boolean {
  return !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/**
 * The buyer pays `amountPaid` (cents) for a course and is enrolled on it.
 */
export function completePurchase(
  db: Queryable,
  courseId: number,
  buyerId: number,
  amountPaid: number,
  country: string | null,
  now: Date
): PurchaseResult {
  return db.transaction((tx): PurchaseResult => {
    const course = getCourse(tx, courseId);
    if (!course) return { ok: false, status: 404, error: "Course not found." };
    const buyer = getUser(tx, buyerId);
    if (!buyer) return { ok: false, status: 404, error: "User not found." };

    if (isUserEnrolled(tx, buyerId, courseId)) {
      return {
        ok: false,
        status: 409,
        error: "You are already enrolled in this course.",
      };
    }

    const at = now.toISOString();
    const purchase = tx
      .insert(purchases)
      .values({ userId: buyerId, courseId, amountPaid, country, createdAt: at })
      .returning()
      .get();
    const enrollment = tx
      .insert(enrollments)
      .values({ userId: buyerId, courseId, enrolledAt: at })
      .returning()
      .get();

    const instructor = getUser(tx, course.instructorId);
    enqueueNotifications(
      tx,
      [
        receipt(buyer, course, amountPaid, 1, false),
        ...(instructor
          ? [
              {
                type: "new-enrollment" as const,
                recipientId: instructor.id,
                data: {
                  recipient: { email: instructor.email, name: instructor.name },
                  actor_name: buyer.name,
                  title: `New Enrollment — ${course.title}`,
                  action_url: studentsPath(course.id),
                  preferences_url: appUrl("/settings"),
                  course_title: course.title,
                  learner_name: buyer.name,
                  students_url: appUrl(studentsPath(course.id)),
                },
              },
            ]
          : []),
      ],
      buyer.id,
      now
    );

    return { ok: true, purchaseId: purchase.id, enrollmentId: enrollment.id };
  });
}

function getOrCreateTeamFor(tx: Queryable, managerId: number) {
  const membership = tx
    .select()
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, managerId),
        eq(teamMembers.role, TeamMemberRole.Admin)
      )
    )
    .get();
  if (membership) {
    const team = tx
      .select()
      .from(teams)
      .where(eq(teams.id, membership.teamId))
      .get();
    if (team) return team;
  }

  const team = tx.insert(teams).values({}).returning().get();
  tx.insert(teamMembers)
    .values({ teamId: team.id, userId: managerId, role: TeamMemberRole.Admin })
    .run();
  return team;
}

/**
 * The buyer pays `amountPaid` (cents, for every seat) for `seats` places on a
 * course. They become the Team Manager and get one coupon code per seat; they
 * are not enrolled themselves.
 */
export function completeTeamPurchase(
  db: Queryable,
  courseId: number,
  buyerId: number,
  amountPaid: number,
  country: string | null,
  seats: number,
  now: Date
): TeamPurchaseResult {
  return db.transaction((tx): TeamPurchaseResult => {
    const course = getCourse(tx, courseId);
    if (!course) return { ok: false, status: 404, error: "Course not found." };
    const buyer = getUser(tx, buyerId);
    if (!buyer) return { ok: false, status: 404, error: "User not found." };

    const purchase = tx
      .insert(purchases)
      .values({
        userId: buyerId,
        courseId,
        amountPaid,
        country,
        createdAt: now.toISOString(),
      })
      .returning()
      .get();
    const team = getOrCreateTeamFor(tx, buyerId);
    const couponCodes = Array.from({ length: seats }, () =>
      crypto.randomBytes(12).toString("base64url")
    );
    tx.insert(coupons)
      .values(
        couponCodes.map((code) => ({
          teamId: team.id,
          courseId,
          code,
          purchaseId: purchase.id,
        }))
      )
      .run();

    enqueueNotifications(
      tx,
      [receipt(buyer, course, amountPaid, seats, true)],
      buyer.id,
      now
    );

    return { ok: true, purchaseId: purchase.id, teamId: team.id, couponCodes };
  });
}
