import { and, eq, inArray, max, notInArray, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  LessonProgressStatus,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  quizAttempts,
  quizzes,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type RosterEntry = {
  enrollmentId: number | null;
  userId: number;
  name: string;
  email: string;
  enrolledAt: string;
  completedAt: string | null;
};

export function courseLessonIds(db: Db, courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

/** The course's quizzes, in curriculum order. */
export function courseQuizzes(db: Db, courseId: number) {
  return db
    .select({
      quizId: quizzes.id,
      quizTitle: quizzes.title,
      lessonTitle: lessons.title,
    })
    .from(quizzes)
    .innerJoin(lessons, eq(quizzes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .orderBy(modules.position, lessons.position, quizzes.id)
    .all();
}

export function enrolledEntries(db: Db, courseId: number): RosterEntry[] {
  return db
    .select({
      enrollmentId: enrollments.id,
      userId: enrollments.userId,
      name: users.name,
      email: users.email,
      enrolledAt: enrollments.enrolledAt,
      completedAt: enrollments.completedAt,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .where(eq(enrollments.courseId, courseId))
    .orderBy(enrollments.id)
    .all();
}

// Students who lost their Enrollment keep their progress, so they still show
// on the roster. They have no Enrollment, so their purchase date stands in.
export function lapsedEntries(
  db: Db,
  courseId: number,
  {
    lessonIds,
    enrolledUserIds,
  }: { lessonIds: number[]; enrolledUserIds: number[] }
): RosterEntry[] {
  const withProgress = db
    .selectDistinct({ userId: lessonProgress.userId })
    .from(lessonProgress)
    .where(
      and(
        inArray(lessonProgress.lessonId, lessonIds),
        notInArray(lessonProgress.userId, enrolledUserIds)
      )
    );
  return db
    .select({
      userId: purchases.userId,
      name: users.name,
      email: users.email,
      enrolledAt: max(purchases.createdAt),
    })
    .from(purchases)
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(
      and(
        eq(purchases.courseId, courseId),
        inArray(purchases.userId, withProgress)
      )
    )
    .groupBy(purchases.userId)
    .all()
    .map((row) => ({
      ...row,
      enrollmentId: null,
      enrolledAt: row.enrolledAt ?? "",
      completedAt: null,
    }));
}

/** Completed lessons on the course, per Student. */
export function completedLessonCounts(
  db: Db,
  { lessonIds, userIds }: { lessonIds: number[]; userIds: number[] }
): Map<number, number> {
  const rows = db
    .select({ userId: lessonProgress.userId, count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds),
        inArray(lessonProgress.userId, userIds)
      )
    )
    .groupBy(lessonProgress.userId)
    .all();
  return new Map(rows.map((row) => [row.userId, row.count]));
}

export function attemptKey(userId: number, quizId: number): string {
  return `${userId}:${quizId}`;
}

/** Each Student's best attempt per quiz, keyed by `attemptKey`. */
export function bestAttempts(
  db: Db,
  { quizIds, userIds }: { quizIds: number[]; userIds: number[] }
) {
  // SQLite takes the bare `passed` column from the row that holds max(score).
  const rows = db
    .select({
      userId: quizAttempts.userId,
      quizId: quizAttempts.quizId,
      score: sql<number>`max(${quizAttempts.score})`,
      passed: quizAttempts.passed,
    })
    .from(quizAttempts)
    .where(
      and(
        inArray(quizAttempts.quizId, quizIds),
        inArray(quizAttempts.userId, userIds)
      )
    )
    .groupBy(quizAttempts.userId, quizAttempts.quizId)
    .all();
  return new Map(
    rows.map((row) => [
      attemptKey(row.userId, row.quizId),
      { score: row.score, passed: Boolean(row.passed) },
    ])
  );
}
