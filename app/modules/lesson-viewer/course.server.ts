/**
 * The Lesson page's reads and writes for the course, its curriculum and the
 * Student's progress through it. Moved out of the route as it was.
 */
import { db } from "~/db";
import * as course from "./lib/course.server";

export { flattenCourseLessons } from "./lib/course.server";

export function getCourseWithDetails(id: number) {
  return course.getCourseWithDetails(db, id);
}

export function getLessonById(id: number) {
  return course.getLessonById(db, id);
}

export function getModuleById(id: number) {
  return course.getModuleById(db, id);
}

export function getUserById(id: number) {
  return course.getUserById(db, id);
}

export function getLessonProgress(userId: number, lessonId: number) {
  return course.getLessonProgress(db, userId, lessonId);
}

export function getLessonProgressForCourse(userId: number, courseId: number) {
  return course.getLessonProgressForCourse(db, userId, courseId);
}

export function markLessonComplete(userId: number, lessonId: number) {
  return course.markLessonComplete(db, { userId, lessonId }, new Date());
}

export function markLessonInProgress(userId: number, lessonId: number) {
  return course.markLessonInProgress(db, userId, lessonId);
}

export function getLastWatchPosition(userId: number, lessonId: number) {
  return course.getLastWatchPosition(db, userId, lessonId);
}

export function calculateWatchProgress(
  userId: number,
  lessonId: number,
  videoDurationSeconds: number
) {
  return course.calculateWatchProgress(
    db,
    { userId, lessonId },
    videoDurationSeconds
  );
}
