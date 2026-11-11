import { eq } from "drizzle-orm";
import { data } from "react-router";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { courses, CourseStatus, users } from "~/db/schema";
import { appUrl } from "~/lib/app-url.server";
import { enqueueNotifications } from "~/lib/notifications/outbox.server";

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
  { ok: true; course: Course } | { ok: false; status: 404; error: string };

/**
 * Sets a course's status (draft, published or archived). Publishing or
 * archiving tells the course's Instructor, unless they made the change.
 */
export function changeCourseStatus(
  db: Queryable,
  courseId: number,
  status: CourseStatus,
  actorId: number,
  now: Date
): ChangeStatusResult {
  return db.transaction((tx): ChangeStatusResult => {
    const before = tx
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, courseId))
      .get();

    const course = tx
      .update(courses)
      .set({ status, updatedAt: now.toISOString() })
      .where(eq(courses.id, courseId))
      .returning()
      .get();

    if (!before || !course) {
      return { ok: false, status: 404, error: "Course not found." };
    }

    if (
      before.status !== status &&
      (status === CourseStatus.Published || status === CourseStatus.Archived)
    ) {
      notifyInstructor(tx, course, status, actorId, now);
    }

    return { ok: true, course };
  });
}

function notifyInstructor(
  tx: Queryable,
  course: Course,
  status: CourseStatus.Published | CourseStatus.Archived,
  actorId: number,
  now: Date
): void {
  const instructor = tx
    .select()
    .from(users)
    .where(eq(users.id, course.instructorId))
    .get();
  if (!instructor) return;

  const actor = tx.select().from(users).where(eq(users.id, actorId)).get();
  const editorPath = `/instructor/${course.id}`;

  enqueueNotifications(
    tx,
    [
      {
        type: "course-status-changed",
        recipientId: instructor.id,
        data: {
          recipient: { email: instructor.email, name: instructor.name },
          actor_name: actor?.name ?? "An Admin",
          title: `${course.title} was ${status}`,
          action_url: editorPath,
          preferences_url: appUrl("/settings"),
          course_title: course.title,
          status,
          course_url: appUrl(editorPath),
        },
      },
    ],
    actorId,
    now
  );
}

/**
 * changeCourseStatus for a route action, as of now: throws a missing course
 * as a 404 response, so the action has one success path.
 */
export function changeCourseStatusForAction(
  db: Queryable,
  courseId: number,
  status: CourseStatus,
  actorId: number
): void {
  const result = changeCourseStatus(db, courseId, status, actorId, new Date());
  if (!result.ok) throw data(result.error, { status: result.status });
}
