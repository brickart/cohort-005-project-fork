import * as schema from "~/db/schema";
import { LessonProgressStatus, UserRole } from "~/db/schema";
import type { TestDb } from "~/test/setup";

// Nothing in a module writes these tables, so rows go in directly. Kept in
// one place so a schema change touches only this file.

export function addStudent(
  db: TestDb,
  name: string,
  email = `${name.toLowerCase().replace(/\W+/g, ".")}@example.com`
) {
  return db
    .insert(schema.users)
    .values({ name, email, role: UserRole.Student })
    .returning()
    .get();
}

export function addModule(db: TestDb, courseId: number, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId, title: `Module ${position}`, position })
    .returning()
    .get();
}

export function addLesson(db: TestDb, moduleId: number, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title: `Lesson ${moduleId}.${position}`, position })
    .returning()
    .get();
}

export function addQuiz(db: TestDb, lessonId: number, title: string) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore: 0.7 })
    .returning()
    .get();
}

export function enroll(
  db: TestDb,
  {
    userId,
    courseId,
    enrolledAt,
    completedAt = null,
  }: {
    userId: number;
    courseId: number;
    enrolledAt: string;
    completedAt?: string | null;
  }
) {
  return db
    .insert(schema.enrollments)
    .values({ userId, courseId, enrolledAt, completedAt })
    .returning()
    .get();
}

export function completeLesson(db: TestDb, userId: number, lessonId: number) {
  db.insert(schema.lessonProgress)
    .values({ userId, lessonId, status: LessonProgressStatus.Completed })
    .run();
}

export function startLesson(db: TestDb, userId: number, lessonId: number) {
  db.insert(schema.lessonProgress)
    .values({ userId, lessonId, status: LessonProgressStatus.InProgress })
    .run();
}

export function attemptQuiz(
  db: TestDb,
  { userId, quizId, score }: { userId: number; quizId: number; score: number }
) {
  db.insert(schema.quizAttempts)
    .values({ userId, quizId, score, passed: score >= 0.7 })
    .run();
}

export function purchase(
  db: TestDb,
  {
    userId,
    courseId,
    createdAt,
  }: { userId: number; courseId: number; createdAt: string }
) {
  db.insert(schema.purchases)
    .values({ userId, courseId, amountPaid: 1000, createdAt })
    .run();
}
