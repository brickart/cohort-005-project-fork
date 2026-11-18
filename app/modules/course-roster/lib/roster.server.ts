import { RosterStatus } from "~/db/schema";
import { isLapsed } from "~/lib/enrollments";
import {
  bestAttempts,
  completedLessonCounts,
  courseLessonIds,
  courseQuizzes,
  enrolledEntries,
  lapsedEntries,
  type Db,
  type RosterEntry,
} from "./roster-queries.server";
import type { CourseRoster, RosterStudent } from "./types";

export function statusOf(entry: RosterEntry, progress: number): RosterStatus {
  if (isLapsed(entry)) return RosterStatus.Lapsed;
  if (entry.completedAt) return RosterStatus.Completed;
  if (progress > 0) return RosterStatus.InProgress;
  return RosterStatus.NotStarted;
}

export function listRoster(
  db: Db,
  courseId: number,
  { includeLapsed }: { includeLapsed: boolean }
): CourseRoster {
  const lessonIds = courseLessonIds(db, courseId);
  const quizzes = courseQuizzes(db, courseId);
  const entries = enrolledEntries(db, courseId);
  if (includeLapsed) {
    const enrolledUserIds = entries.map((entry) => entry.userId);
    entries.push(
      ...lapsedEntries(db, courseId, { lessonIds, enrolledUserIds })
    );
  }

  const userIds = [...new Set(entries.map((entry) => entry.userId))];
  const completed = completedLessonCounts(db, { lessonIds, userIds });
  const attempts = bestAttempts(db, {
    quizIds: quizzes.map((quiz) => quiz.quizId),
    userIds,
  });

  const students = entries.map((entry): RosterStudent => {
    const done = completed.get(entry.userId) ?? 0;
    const progress =
      lessonIds.length === 0 ? 0 : Math.round((done / lessonIds.length) * 100);
    return {
      key:
        entry.enrollmentId === null
          ? `lapsed-${entry.userId}`
          : String(entry.enrollmentId),
      enrollmentId: entry.enrollmentId,
      userId: entry.userId,
      name: entry.name,
      email: entry.email,
      enrolledAt: entry.enrolledAt,
      progress,
      status: statusOf(entry, progress),
      quizScores: quizzes.map((quiz) => {
        const best = attempts.get(`${entry.userId}:${quiz.quizId}`);
        return {
          ...quiz,
          bestScore: best?.score ?? null,
          passed: best?.passed ?? null,
        };
      }),
    };
  });

  return { students, quizCount: quizzes.length };
}
