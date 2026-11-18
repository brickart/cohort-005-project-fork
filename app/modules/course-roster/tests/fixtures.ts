import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { QuestionType, UserRole } from "~/db/schema";
import {
  markLessonComplete,
  markLessonInProgress,
} from "~/modules/lesson-viewer/course.server";
import { computeResult } from "~/modules/lesson-viewer/quiz.server";
import type { TestDb } from "~/test/setup";

// Users, curriculum, enrollments and purchases go in directly: no module
// writes them. Lesson progress and quiz attempts go through lesson-viewer,
// which owns them, and so need `~/db` mocked to the test database.

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

// Ten questions, so an attempt can score any tenth.
const QUESTIONS_PER_QUIZ = 10;

export function addQuiz(db: TestDb, lessonId: number, title: string) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore: 0.7 })
    .returning()
    .get();
  for (let position = 1; position <= QUESTIONS_PER_QUIZ; position++) {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${position}`,
        questionType: QuestionType.MultipleChoice,
        position,
      })
      .returning()
      .get();
    db.insert(schema.quizOptions)
      .values([
        { questionId: question.id, optionText: "Right", isCorrect: true },
        { questionId: question.id, optionText: "Wrong", isCorrect: false },
      ])
      .run();
  }
  return quiz;
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

export function completeLesson(userId: number, lessonId: number) {
  markLessonComplete(userId, lessonId);
}

export function startLesson(userId: number, lessonId: number) {
  markLessonInProgress(userId, lessonId);
}

/** Answers enough questions right to score `score`, a whole tenth. */
export function attemptQuiz(
  db: TestDb,
  { userId, quizId, score }: { userId: number; quizId: number; score: number }
) {
  const rightOptions = db
    .select({
      questionId: schema.quizOptions.questionId,
      optionId: schema.quizOptions.id,
    })
    .from(schema.quizOptions)
    .innerJoin(
      schema.quizQuestions,
      eq(schema.quizOptions.questionId, schema.quizQuestions.id)
    )
    .where(
      and(
        eq(schema.quizQuestions.quizId, quizId),
        eq(schema.quizOptions.isCorrect, true)
      )
    )
    .all()
    .slice(0, Math.round(score * QUESTIONS_PER_QUIZ));
  computeResult(
    userId,
    quizId,
    Object.fromEntries(
      rightOptions.map(({ questionId, optionId }) => [questionId, optionId])
    )
  );
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
