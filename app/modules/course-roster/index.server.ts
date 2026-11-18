import { db } from "~/db";
import type { Db } from "./lib/roster-queries.server";
import { listRoster } from "./lib/roster.server";

export type { CourseRoster } from "./lib/types";

/**
 * The student roster for one course, bound to a database. The app uses
 * `courseRoster`; tests build their own against a test database.
 */
export function createCourseRoster(database: Db) {
  return {
    /**
     * Every Student enrolled on the course, with progress, status and best
     * quiz scores, in enrollment order. With `includeLapsed`, Lapsed Students
     * follow the enrolled ones.
     */
    list(courseId: number, options: { includeLapsed: boolean }) {
      return listRoster(database, courseId, options);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseRoster = /* @__PURE__ */ createCourseRoster(db);
