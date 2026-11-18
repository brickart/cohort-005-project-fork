import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "~/db/schema";
import { RosterStatus } from "~/db/schema";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { createCourseRoster } from "../index.server";
import {
  addLesson,
  addModule,
  addQuiz,
  addStudent,
  attemptQuiz,
  completeLesson,
  enroll,
  purchase,
  startLesson,
} from "./fixtures";

// Lesson progress and quiz attempts go through lesson-viewer, which reads
// the app's shared `db`; point it at a fresh test database.
const shared = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("~/db", () => shared);

const JAN = "2026-01-10T12:00:00.000Z";
const FEB = "2026-02-10T12:00:00.000Z";
const MAR = "2026-03-10T12:00:00.000Z";

let db: TestDb;
let courseId: number;
let otherCourseId: number;
let roster: ReturnType<typeof createCourseRoster>;

beforeEach(() => {
  db = createTestDb();
  shared.db = db;
  const base = seedBaseData(db);
  courseId = base.course.id;
  otherCourseId = db
    .insert(schema.courses)
    .values({
      title: "Other",
      slug: "other",
      description: "Other course",
      salesCopy: base.course.salesCopy,
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
    })
    .returning()
    .get().id;
  roster = createCourseRoster(db);
});

function list(includeLapsed = false) {
  return roster.list(courseId, { includeLapsed });
}

describe("courseRoster.list", () => {
  it("lists each enrolled Student on the course, in enrollment order", () => {
    const ada = addStudent(db, "Ada Lovelace", "ada@example.com");
    const alan = addStudent(db, "Alan Turing", "alan@example.com");
    const elsewhere = addStudent(db, "Grace Hopper");
    enroll(db, { userId: alan.id, courseId, enrolledAt: FEB });
    enroll(db, { userId: ada.id, courseId, enrolledAt: JAN });
    enroll(db, {
      userId: elsewhere.id,
      courseId: otherCourseId,
      enrolledAt: JAN,
    });

    expect(
      list().students.map(({ name, email, enrolledAt }) => ({
        name,
        email,
        enrolledAt,
      }))
    ).toEqual([
      { name: "Alan Turing", email: "alan@example.com", enrolledAt: FEB },
      { name: "Ada Lovelace", email: "ada@example.com", enrolledAt: JAN },
    ]);
  });

  it("works out progress from completed lessons on this course only", () => {
    const mod = addModule(db, courseId, 1);
    const lessons = [1, 2, 3].map((position) =>
      addLesson(db, mod.id, position)
    );
    const otherLesson = addLesson(db, addModule(db, otherCourseId, 1).id, 1);
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId, enrolledAt: JAN });
    completeLesson(ada.id, lessons[0].id);
    startLesson(ada.id, lessons[1].id);
    completeLesson(ada.id, otherLesson.id);

    expect(list().students[0].progress).toBe(33);
  });

  it("gives each Student a status from their Enrollment and progress", () => {
    const lesson = addLesson(db, addModule(db, courseId, 1).id, 1);
    const fresh = addStudent(db, "Fresh");
    const busy = addStudent(db, "Busy");
    const done = addStudent(db, "Done");
    enroll(db, { userId: fresh.id, courseId, enrolledAt: JAN });
    enroll(db, { userId: busy.id, courseId, enrolledAt: JAN });
    enroll(db, {
      userId: done.id,
      courseId,
      enrolledAt: JAN,
      completedAt: FEB,
    });
    completeLesson(busy.id, lesson.id);

    expect(list().students.map((s) => [s.name, s.status])).toEqual([
      ["Fresh", RosterStatus.NotStarted],
      ["Busy", RosterStatus.InProgress],
      ["Done", RosterStatus.Completed],
    ]);
  });

  it("reports the best attempt at each quiz, in curriculum order", () => {
    const second = addModule(db, courseId, 2);
    const first = addModule(db, courseId, 1);
    const late = addQuiz(db, addLesson(db, second.id, 1).id, "Late quiz");
    const early = addQuiz(db, addLesson(db, first.id, 1).id, "Early quiz");
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId, enrolledAt: JAN });
    attemptQuiz(db, { userId: ada.id, quizId: early.id, score: 0.5 });
    attemptQuiz(db, { userId: ada.id, quizId: early.id, score: 0.9 });
    attemptQuiz(db, { userId: ada.id, quizId: early.id, score: 0.6 });

    const result = list();

    expect(result.quizCount).toBe(2);
    expect(result.students[0].quizScores).toEqual([
      {
        quizId: early.id,
        quizTitle: "Early quiz",
        lessonTitle: `Lesson ${first.id}.1`,
        bestScore: 0.9,
        passed: true,
      },
      {
        quizId: late.id,
        quizTitle: "Late quiz",
        lessonTitle: `Lesson ${second.id}.1`,
        bestScore: null,
        passed: null,
      },
    ]);
  });

  it("gives each Enrollment its own key, even for one Student enrolled twice", () => {
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId, enrolledAt: JAN });
    enroll(db, { userId: ada.id, courseId, enrolledAt: FEB });

    const keys = list().students.map((s) => s.key);

    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("gives every Student 0% on a course with no lessons", () => {
    const ada = addStudent(db, "Ada");
    enroll(db, { userId: ada.id, courseId, enrolledAt: JAN });

    expect(list()).toMatchObject({
      quizCount: 0,
      students: [{ progress: 0, status: RosterStatus.NotStarted }],
    });
  });

  describe("Lapsed Students", () => {
    function setUpLapsed() {
      const lesson = addLesson(db, addModule(db, courseId, 1).id, 1);
      const enrolled = addStudent(db, "Enrolled");
      const lapsed = addStudent(db, "Lapsed");
      enroll(db, { userId: enrolled.id, courseId, enrolledAt: JAN });
      completeLesson(enrolled.id, lesson.id);
      completeLesson(lapsed.id, lesson.id);
      purchase(db, { userId: lapsed.id, courseId, createdAt: JAN });
      purchase(db, { userId: lapsed.id, courseId, createdAt: MAR });
      return { lapsed };
    }

    it("leaves them out unless asked", () => {
      setUpLapsed();

      expect(list(false).students.map((s) => s.name)).toEqual(["Enrolled"]);
    });

    it("lists them after the enrolled Students, dated by their latest purchase", () => {
      const { lapsed } = setUpLapsed();

      expect(list(true).students.slice(1)).toEqual([
        expect.objectContaining({
          key: `lapsed-${lapsed.id}`,
          enrollmentId: null,
          name: "Lapsed",
          enrolledAt: MAR,
          progress: 100,
          status: RosterStatus.Lapsed,
        }),
      ]);
      expect(list(true).students).toHaveLength(2);
    });
  });
});
