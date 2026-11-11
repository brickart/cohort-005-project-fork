import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { changeCourseStatus } from "./courses.server";

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
    .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
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
});
