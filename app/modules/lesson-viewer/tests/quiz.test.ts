import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";

// The module reads the app's shared `db`; point it at a fresh test database.
let db: TestDb;
vi.mock("~/db", () => ({
  get db() {
    return db;
  },
}));

const { getQuizInLesson } = await import("../quiz.server");

// ─── Fixtures ───
// No service writes modules, lessons or quizzes, so rows go in directly.

function addLesson(courseId: number, title: string) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: `${title} module`, position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title, position: 1 })
    .returning()
    .get();
}

function addQuiz(lessonId: number) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check-in", passingScore: 0.7 })
    .returning()
    .get();
}

describe("getQuizInLesson", () => {
  let lessonId: number;
  let otherLessonId: number;

  beforeEach(() => {
    db = createTestDb();
    const { course } = seedBaseData(db);
    lessonId = addLesson(course.id, "Lesson").id;
    otherLessonId = addLesson(course.id, "Other lesson").id;
  });

  it("finds the quiz on this lesson", () => {
    const quiz = addQuiz(lessonId);
    expect(getQuizInLesson(quiz.id, lessonId)).toEqual(quiz);
  });

  it("does not reach a quiz on another lesson", () => {
    const quiz = addQuiz(otherLessonId);
    expect(getQuizInLesson(quiz.id, lessonId)).toBeUndefined();
  });

  it("finds nothing for an unknown quiz id", () => {
    addQuiz(lessonId);
    expect(getQuizInLesson(9999, lessonId)).toBeUndefined();
  });
});
