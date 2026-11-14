import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import {
  changeCourseStatus,
  changeCourseStatusForAction,
} from "./courses.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://cadence.test");
  db = createTestDb();
  base = seedBaseData(db);
  admin = db
    .insert(schema.users)
    .values({
      name: "Pat Admin",
      email: "pat@example.com",
      role: UserRole.Admin,
    })
    .returning()
    .get();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function getCourse() {
  return db
    .select()
    .from(schema.courses)
    .where(eq(schema.courses.id, base.course.id))
    .get();
}

function outboxRows() {
  return db
    .select()
    .from(schema.notificationOutbox)
    .all()
    .map((row) => ({ ...row, data: JSON.parse(row.data) }));
}

describe("changing a course's status", () => {
  it("saves the new status", () => {
    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id,
      NOW
    );

    expect(result.ok).toBe(true);
    expect(getCourse()).toMatchObject({
      status: CourseStatus.Archived,
      updatedAt: NOW.toISOString(),
    });
  });

  it("refuses a course that does not exist", () => {
    expect(
      changeCourseStatus(db, 9999, CourseStatus.Archived, admin.id, NOW)
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("answers a route action with a 404 for a course that does not exist", () => {
    let thrown: unknown;
    try {
      changeCourseStatusForAction(db, 9999, CourseStatus.Archived, admin.id);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ init: { status: 404 } });
  });

  it("changes the status for a route action", () => {
    changeCourseStatusForAction(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id
    );

    expect(getCourse()?.status).toBe(CourseStatus.Archived);
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("the Notification a course status change causes", () => {
  it("tells the Instructor when an Admin archives their course", () => {
    changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id,
      NOW
    );

    const rows = outboxRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "course-status-changed",
      recipientId: base.instructor.id,
      actorId: admin.id,
      status: "pending",
      data: {
        recipient: { email: "instructor@example.com", name: "Test Instructor" },
        actor_name: "Pat Admin",
        title: "Test Course was archived",
        course_title: "Test Course",
        status: "archived",
        action_url: `/instructor/${base.course.id}`,
        course_url: `https://cadence.test/instructor/${base.course.id}`,
        preferences_url: "https://cadence.test/settings",
      },
    });
    expect(rows[0].idempotencyKey).toMatch(UUID);
  });

  it("tells the Instructor when an Admin publishes their course", () => {
    db.update(schema.courses)
      .set({ status: CourseStatus.Draft })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Published,
      admin.id,
      NOW
    );

    expect(outboxRows()).toMatchObject([
      {
        type: "course-status-changed",
        recipientId: base.instructor.id,
        data: { title: "Test Course was published", status: "published" },
      },
    ]);
  });

  it("says nothing when a course goes back to draft", () => {
    changeCourseStatus(db, base.course.id, CourseStatus.Draft, admin.id, NOW);

    expect(outboxRows()).toEqual([]);
  });

  it("says nothing when the status does not actually change", () => {
    changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Published,
      admin.id,
      NOW
    );

    expect(outboxRows()).toEqual([]);
  });

  it("does not tell an Instructor about their own change", () => {
    changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      base.instructor.id,
      NOW
    );

    expect(getCourse()?.status).toBe(CourseStatus.Archived);
    expect(outboxRows()).toEqual([]);
  });

  it("does not notify an Admin who is also the course's Instructor", () => {
    db.update(schema.courses)
      .set({ instructorId: admin.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Archived,
      admin.id,
      NOW
    );

    expect(outboxRows()).toEqual([]);
  });

  it("writes nothing when the change rolls back", () => {
    expect(() =>
      db.transaction((tx) => {
        changeCourseStatus(
          tx,
          base.course.id,
          CourseStatus.Archived,
          admin.id,
          NOW
        );
        throw new Error("rolled back");
      })
    ).toThrow("rolled back");

    expect(getCourse()?.status).toBe(CourseStatus.Published);
    expect(outboxRows()).toEqual([]);
  });
});
