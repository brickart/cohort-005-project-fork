import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { courses, CourseStatus } from "~/db/schema";

// ─── Courses ───
// Writes to a course that other people need to hear about.
//
// Every function takes the database first, so tests can hand in an in-memory
// one. Uses positional parameters (project convention).

type Db = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Queryable = Db | Tx;

type Course = typeof courses.$inferSelect;

export type ChangeStatusResult =
  | { ok: true; course: Course }
  | { ok: false; status: 404; error: string };

/** Sets a course's status (draft, published or archived). */
export function changeCourseStatus(
  db: Queryable,
  courseId: number,
  status: CourseStatus,
  actorId: number,
  now: Date
): ChangeStatusResult {
  return db.transaction((tx): ChangeStatusResult => {
    const course = tx
      .update(courses)
      .set({ status, updatedAt: now.toISOString() })
      .where(eq(courses.id, courseId))
      .returning()
      .get();

    if (!course) return { ok: false, status: 404, error: "Course not found." };

    return { ok: true, course };
  });
}
