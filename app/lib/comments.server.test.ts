import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { postComment } from "./comments.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let moduleId: number;

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
  db = createTestDb();
  base = seedBaseData(db);
  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  moduleId = module.id;
  lessonId = db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Ownership", position: 1 })
    .returning()
    .get().id;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function addUser(name: string, role = UserRole.Student) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function outboxRows() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

function allComments() {
  return db.select().from(schema.comments).all();
}

describe("posting a comment on a lesson", () => {
  it("saves the trimmed comment", () => {
    const comment = postComment(db, base.user.id, lessonId, null, "  Why?  ", NOW);

    expect(comment).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "Why?",
    });
    expect(allComments()).toHaveLength(1);
  });

  it("refuses an empty comment and writes nothing", () => {
    expect(() =>
      postComment(db, base.user.id, lessonId, null, "   ", NOW)
    ).toThrow("Comment cannot be empty");
    expect(allComments()).toHaveLength(0);
    expect(outboxRows()).toHaveLength(0);
  });

  it("refuses a reply to a reply", () => {
    const question = postComment(db, base.user.id, lessonId, null, "Why?", NOW);
    const reply = postComment(
      db,
      base.instructor.id,
      lessonId,
      question.id,
      "Because.",
      NOW
    );

    expect(() =>
      postComment(db, base.user.id, lessonId, reply.id, "Thanks", NOW)
    ).toThrow("Replies can only be one level deep");
  });

  it("refuses a reply to a comment on another lesson", () => {
    const question = postComment(db, base.user.id, lessonId, null, "Why?", NOW);
    const otherLesson = db
      .insert(schema.lessons)
      .values({
        moduleId,
        title: "Borrowing",
        position: 2,
      })
      .returning()
      .get();

    expect(() =>
      postComment(db, base.user.id, otherLesson.id, question.id, "Hm", NOW)
    ).toThrow("Parent comment belongs to a different lesson");
  });
});

describe("the Notifications a lesson comment causes", () => {
  it("tells the course's Instructor about a new question", () => {
    postComment(db, base.user.id, lessonId, null, "Why does this move?", NOW);

    const rows = outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "lesson-question",
      recipientId: base.instructor.id,
      actorId: base.user.id,
      status: "pending",
      data: {
        recipient: { email: "instructor@example.com", name: "Test Instructor" },
        actor_name: "Test User",
        title: "New question on Ownership",
        action_url: `/courses/test-course/lessons/${lessonId}`,
        preferences_url: "https://cadence.test/settings",
        course_title: "Test Course",
        lesson_title: "Ownership",
        comment_excerpt: "Why does this move?",
        lesson_url: `https://cadence.test/courses/test-course/lessons/${lessonId}`,
      },
    });
    expect(rows[0].idempotencyKey).toMatch(UUID);
  });

  it("tells only the parent comment's author about a reply", () => {
    const asker = addUser("Liam");
    const otherReplier = addUser("Noor");
    const question = postComment(db, asker.id, lessonId, null, "Why?", NOW);
    postComment(db, otherReplier.id, lessonId, question.id, "Same Q", NOW);
    postComment(db, base.user.id, lessonId, question.id, "Because.", NOW);

    const replies = outboxRows().filter((row) => row.type === "comment-reply");
    expect(replies.map((row) => row.recipientId)).toEqual([asker.id, asker.id]);
    expect(replies[1]).toMatchObject({
      actorId: base.user.id,
      data: {
        recipient: { email: "liam@example.com", name: "Liam" },
        actor_name: "Test User",
        title: "Test User replied to your comment on Ownership",
        action_url: `/courses/test-course/lessons/${lessonId}`,
        lesson_title: "Ownership",
        comment_excerpt: "Because.",
        lesson_url: `https://cadence.test/courses/test-course/lessons/${lessonId}`,
      },
    });
  });

  it("does not tell the Instructor about a reply on their lesson", () => {
    const question = postComment(db, base.user.id, lessonId, null, "Why?", NOW);
    const replier = addUser("Noor");
    postComment(db, replier.id, lessonId, question.id, "Me too", NOW);

    expect(
      outboxRows().filter((row) => row.recipientId === base.instructor.id)
    ).toHaveLength(1);
  });

  it("does not notify the Instructor about their own question", () => {
    postComment(db, base.instructor.id, lessonId, null, "Any questions?", NOW);

    expect(outboxRows()).toHaveLength(0);
  });

  it("does not notify the author about their own reply", () => {
    const question = postComment(
      db,
      base.instructor.id,
      lessonId,
      null,
      "Any questions?",
      NOW
    );
    postComment(db, base.instructor.id, lessonId, question.id, "Anyone?", NOW);

    expect(outboxRows()).toHaveLength(0);
  });

  it("creates nothing for an Instructor answering a question on their own lesson beyond the asker's reply", () => {
    const question = postComment(db, base.user.id, lessonId, null, "Why?", NOW);
    postComment(db, base.instructor.id, lessonId, question.id, "Because.", NOW);

    const rows = outboxRows();
    expect(rows.map((row) => [row.type, row.recipientId])).toEqual([
      ["lesson-question", base.instructor.id],
      ["comment-reply", base.user.id],
    ]);
  });

  it("shortens a long comment in the excerpt", () => {
    postComment(db, base.user.id, lessonId, null, "a".repeat(400), NOW);

    const [row] = outboxRows();
    expect(row.data.comment_excerpt).toBe(`${"a".repeat(199)}…`);
  });
});
